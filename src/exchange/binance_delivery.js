/* eslint-disable no-unused-vars */
/* eslint-disable no-multi-assign */
/* eslint-disable new-cap */
/* eslint-disable no-param-reassign */
// eslint-disable-next-line max-classes-per-file
const WebSocket = require('ws');
const ccxt = require('ccxt');
const moment = require('moment');
const _ = require('lodash');
const fetch = require('request');
const Decimal = require('decimal');
const Ticker = require('../dict/ticker');
const Order = require('../dict/order');
const TickerEvent = require('../event/ticker_event');
const ExchangeCandlestick = require('../dict/exchange_candlestick');
const Position = require('../dict/position');
const CcxtExchangeOrder = require('./ccxt/ccxt_exchange_order');
const ExchangeOrderEvent = require('../event/exchange_order_event');
const ExchangePositionEvent = require('../event/exchange_position_event');
const ExchangeOrder = require('../dict/exchange_order');

module.exports = class BinanceDelivery {
  constructor(eventEmitter, requestClient, candlestickResample, logger, queue, candleImporter, throttler, influxDB) {
    this.eventEmitter = eventEmitter;
    this.logger = logger;
    this.queue = queue;
    this.candleImporter = candleImporter;
    this.throttler = throttler;
    this.influxDB = influxDB;

    this.exchange = null;

    this.ccxtExchangeOrder = CcxtExchangeOrder.createEmpty(logger);

    this.positions = {};
    this.orders = {};
    this.tickers = {};
    this.symbols = [];
    this.intervals = [];
    this.balances = {};
    this.wsbalances = {};
    this.contractSizes = {};

    this.ccxtClient = undefined;
  }

  start(config, symbols) {
    const { logger } = this;
    this.exchange = null;

    const ccxtClient = (this.ccxtClient = new ccxt.binance({
      apiKey: config.key,
      secret: config.secret,
      enableRateLimit: true,
      rateLimit: config.rateLimit || 100,
      options: {
        defaultType: 'delivery',
        warnOnFetchOpenOrdersWithoutSymbol: false,
        broker: {
          spot: 'x-MWWMB8WV',
          margin: 'x-MWWMB8WV',
          future: 'x-Xkr3Duvf',
          delivery: 'x-Xkr3Duvf'
        }
      }
    }));

    this.intervals = [];

    this.symbols = symbols;

    setTimeout(async () => {
      const exchangeInfo = await ccxtClient.dapiPublicGetExchangeInfo();
      exchangeInfo.symbols.forEach(s => {
        this.contractSizes[s.symbol] = s.contractSize;
      });
    });

    this.positions = {};
    this.orders = {};
    this.ccxtExchangeOrder = BinanceDelivery.createCustomCcxtOrderInstance(ccxtClient, symbols, logger, config);

    const me = this;

    if (config.key && config.secret && config.key.length > 0 && config.secret.length > 0) {
      setInterval(async () => {
        me.throttler.addTask('binance_delivery_sync_orders', async () => {
          await me.ccxtExchangeOrder.syncOrders();
        });
      }, 1000 * 30);

      setInterval(async () => {
        me.throttler.addTask('binance_delivery_sync_positions', me.syncPositionViaRestApi.bind(me));
      }, 1000 * 36);

      setInterval(async () => {
        me.throttler.addTask('binance_delivery_sync_balances', me.syncBalancesViaRestApi.bind(me));
      }, 1000 * 60);

      setTimeout(async () => {
        await ccxtClient.fetchMarkets();
        me.throttler.addTask('binance_delivery_sync_orders', async () => {
          await me.ccxtExchangeOrder.syncOrders();
        });
        me.throttler.addTask('binance_delivery_sync_positions', me.syncPositionViaRestApi.bind(me));
        me.throttler.addTask('binance_delivery_sync_balances', me.syncBalancesViaRestApi.bind(me));
      }, 1000);

      setTimeout(async () => {
        await me.initUserWebsocket();
      }, 2000);

      setTimeout(async () => {
        await me.initPublicWebsocket(symbols);
      }, 5000);
    } else {
      me.logger.info('Binance Delivery: Starting as anonymous; no trading possible');
    }

    setTimeout(async () => {
      symbols.forEach(async symbol => {
        const leverage = me.getLeverage(symbol.symbol);
        try {
          await ccxtClient.dapiPrivate_post_leverage({
            symbol: symbol.symbol,
            leverage: leverage
          });

          me.logger.info(`Binance Delivery: set leverage: ${symbol.symbol} - [${leverage}x]`);
        } catch (e) {
          me.logger.error(
            `Binance Delivery: set leverage error: ${JSON.stringify([symbol.symbol, leverage, String(e)])}`
          );
        }
      });
    }, 6000);

    symbols.forEach(symbol => {
      symbol.periods.forEach(period => {
        // for bot init prefill data: load latest candles from api
        this.queue.add(async () => {
          let ohlcvs;

          try {
            ohlcvs = await ccxtClient.fetchOHLCV(symbol.symbol.replace('USD_PERP', '/USD'), period, undefined, 1000);
          } catch (e) {
            me.logger.info(
              `Binance Delivery: candles fetch error: ${JSON.stringify([symbol.symbol, period, String(e)])}`
            );

            return;
          }

          const ourCandles = ohlcvs.map(candle => {
            return new ExchangeCandlestick(
              me.getName(),
              symbol.symbol,
              period,
              Math.round(candle[0] / 1000),
              candle[1],
              candle[2],
              candle[3],
              candle[4],
              candle[5]
            );
          });

          await me.candleImporter.insertThrottledCandles(ourCandles);
        });
      });
    });
  }

  /**
   * Updates all position; must be a full update not delta. Unknown current non orders are assumed to be closed
   *
   * @param positions Position
   */
  fullPositionsUpdate(positions) {
    const currentPositions = {};

    positions.forEach(position => {
      currentPositions[`${position.symbol}:${position.side}`] = position;
    });

    this.positions = currentPositions;
  }

  async getOrders() {
    return this.ccxtExchangeOrder.getOrders();
  }

  async findOrderById(id) {
    return this.ccxtExchangeOrder.findOrderById(id);
  }

  async getOrdersForSymbol(symbol) {
    return this.ccxtExchangeOrder.getOrdersForSymbol(symbol);
  }

  async getBalances() {
    return this.balances;
  }

  async getPositions() {
    return Object.values(this.positions).map(position => {
      // we are updating fresh profit from websocket with markprice
      // overwrite profits by ticker price from position; ticker prices are more fresh
      /* if (position.getEntry() && this.tickers[position.getSymbol()]) {
        const profit = position.isLong()
          ? (this.tickers[position.symbol].bid / position.entry - 1) * 100 // long profit
          : (position.entry / this.tickers[position.symbol].ask - 1) * 100; // short profit

        if (position.raw) {
          const pnl = (Math.abs(position.amount) * position.entry * profit) / 100;
          position.raw.unRealizedProfit = pnl;
        }

        return Position.createProfitUpdate(position, profit);
      } */

      return position;
    });
  }

  async getPositionForSymbol(symbol) {
    return (await this.getPositions()).filter(position => position.symbol === symbol);
  }

  calculatePrice(price, symbol) {
    return price; // done by ccxt
  }

  calculateAmount(amount, symbol) {
    return amount; // done by ccxt
  }

  getName() {
    return 'binance_delivery';
  }

  async order(order) {
    return this.ccxtExchangeOrder.createOrder(order);
  }

  getLeverage(symbol) {
    const config = this.symbols.find(cSymbol => cSymbol.symbol === symbol);
    if (!config) {
      throw new Error(`Binance Delivery: Invalid leverage config for:${symbol}`);
    }

    // use default leverage to "5"
    const leverageSize = _.get(config, 'extra.binance_delivery_leverage', 5);
    if (leverageSize < 0 || leverageSize > 125) {
      throw new Error(`Invalid leverage size for: ${leverageSize} ${symbol}`);
    }

    return leverageSize;
  }

  async cancelOrder(id) {
    const currentOrder = await this.findOrderById(id);
    if (!currentOrder) {
      return undefined;
    }

    if (currentOrder.status === ExchangeOrder.STATUS_PARTIALLY_FILLED) {
      throw new Error(
        `Binance Delivery: Cancelling order stopped because the order still in process: ${currentOrder.symbol}, ${currentOrder.id}, ${currentOrder.side}`
      );
    }

    const result = this.ccxtExchangeOrder.cancelOrder(id);
    this.throttler.addTask(
      'binance_delivery_sync_orders',
      async () => {
        await this.ccxtExchangeOrder.syncOrders();
      },
      3000
    );
    return result;
  }

  async cancelAll(symbol) {
    const result = this.ccxtExchangeOrder.cancelAll(symbol);
    this.throttler.addTask(
      'binance_delivery_sync_orders',
      async () => {
        await this.ccxtExchangeOrder.syncOrders();
      },
      3000
    );
    return result;
  }

  async updateOrder(id, order) {
    if (!order.amount && !order.price) {
      throw new Error('Invalid amount / price for update');
    }

    // const result = this.ccxtExchangeOrder.updateOrder(id, order);
    this.throttler.addTask(
      'binance_delivery_sync_orders',
      async () => {
        await this.ccxtExchangeOrder.syncOrders();
      },
      3000
    );
    return undefined;
  }

  /**
   * Convert incoming positions only if they are open
   *
   * @param positions
   * @returns {*}
   */
  static createPositions(positions, contractSizes) {
    return positions.map(position => {
      const entryPrice = parseFloat(position.entryPrice);
      const positionAmt = parseFloat(position.positionAmt);
      const amount = parseFloat(position.notionalValue);
      const markPrice = parseFloat(position.markPrice);

      position.size = positionAmt * (contractSizes[position.symbol] || 1);

      const profit =
        amount < 0
          ? (entryPrice / markPrice - 1) * 100 // short
          : (markPrice / entryPrice - 1) * 100; // long

      position.unRealizedProfit =
        position.size < 0
          ? (entryPrice / markPrice - 1) * Math.abs(position.size)
          : (markPrice / entryPrice - 1) * Math.abs(position.size);

      return new Position(
        position.symbol,
        positionAmt < 0 ? 'short' : 'long',
        positionAmt,
        parseFloat(profit.toFixed(2)), // round 2 numbers
        new Date(),
        entryPrice,
        undefined,
        position
      );
    });
  }

  /**
   * Convert incoming position only if they are open
   *
   * @param position
   * @returns {*}
   */
  static createPositionFromWebsocket(position, contractSizes) {
    const entryPrice = parseFloat(position.ep);
    const positionAmt = parseFloat(position.pa);
    const profit = (parseFloat(position.up) / Math.abs(positionAmt)) * 100;
    position.size = positionAmt * (contractSizes[position.s] || 1);

    return new Position(
      position.s,
      positionAmt < 0 ? 'short' : 'long',
      positionAmt,
      profit,
      new Date(),
      entryPrice,
      undefined,
      position
    );
  }

  async positionUpdateFromWebSocket(position) {
    try {
      const amount = parseFloat(position.pa);
      const entryPrice = parseFloat(position.ep);

      const side = position.ps.toLowerCase();
      const posKey = `${position.s}:${side}`;

      const currentPosition = this.positions[posKey];
      currentPosition.amount = amount;
      currentPosition.entry = entryPrice;

      const size = amount * this.contractSizes[position.s];

      const profit =
        size < 0
          ? (currentPosition.entry / currentPosition.markPrice - 1) * 100 // short
          : (currentPosition.markPrice / currentPosition.entry - 1) * 100; // long

      const pnl =
        size < 0
          ? (currentPosition.entry / currentPosition.markPrice - 1) * Math.abs(size)
          : (currentPosition.markPrice / currentPosition.entry - 1) * Math.abs(size);

      if (currentPosition.raw) {
        currentPosition.raw.unRealizedProfit = pnl;
      }

      this.positions[posKey] = currentPosition;

      this.eventEmitter.emit(
        'exchange_position',
        new ExchangePositionEvent(this.getName(), currentPosition, 'updated')
      );
    } catch (e) {
      this.logger.error(`Binance Delivery: error update position:${e}`);
    }
  }

  /**
   * Websocket position updates
   */
  async accountUpdate(message) {
    if (message.a && message.a.B) {
      message.a.B.forEach(async asset => {
        if (asset.a === 'USDT') {
          if (!this.wsbalances.wb) {
            return;
          }

          const currentBalance = Decimal(this.wsbalances.wb);
          const walletBalance = Decimal(asset.wb);
          const balanceChange = Decimal(asset.bc);

          this.wsbalances = {
            wb: asset.wb
          };

          const PNL = walletBalance.sub(currentBalance).sub(balanceChange);

          await this.influxDB.writeFloat('account', 'pnl', PNL.toNumber());
          await this.influxDB.writeFloat('account', 'changes', balanceChange.toNumber());

          if (this.balances.info) {
            this.balances.info.totalWalletBalance = asset.wb;
          }
        }
      });
    }

    if (message.a && message.a.P) {
      message.a.P.forEach(async position => {
        if (!position.s || !position.ps) {
          return;
        }

        const side = position.ps.toLowerCase();
        const posKey = `${position.s}:${side}`;

        // position closed
        if (posKey in this.positions && position.pa === '0') {
          const currentPosition = this.positions[posKey];

          this.eventEmitter.emit(
            'exchange_position',
            new ExchangePositionEvent(this.getName(), currentPosition, 'closed')
          );

          delete this.positions[posKey];

          this.logger.info(
            `Binance Delivery: Websocket position closed/removed: ${JSON.stringify([posKey, currentPosition])}`
          );
          return;
        }

        // position open
        if (
          !(posKey in this.positions) &&
          position.pa !== '0' &&
          (parseFloat(position.ep) > 0.00001 || parseFloat(position.ep) < -0.00001) // prevent float point issues
        ) {
          this.eventEmitter.emit(
            'exchange_position',
            new ExchangePositionEvent(
              this.getName(),
              BinanceDelivery.createPositionFromWebsocket(position, this.contractSizes),
              'opened'
            )
          );
          /* const side = position.ps.toLowerCase();
          this.positions[`${position.s}:${side}`] = BinanceDelivery.createPositionFromWebsocket(position);

          this.logger.info(`Binance Delivery: Websocket position new found: ${JSON.stringify([position.s, position])}`); */

          return;
        }

        // position update
        if (posKey in this.positions) {
          if (parseFloat(position.pa) === this.positions[posKey].getAmount()) {
            return;
          }

          await this.positionUpdateFromWebSocket(position);

          this.logger.info(`Binance Delivery: Websocket position update: ${JSON.stringify([posKey, position])}`);
        }
      });
    }
  }

  async syncBalancesViaRestApi() {
    let response;
    try {
      response = await this.ccxtClient.fetchBalance();
    } catch (e) {
      this.logger.error(`Binance Delivery: error getting balances:${e}`);
      return;
    }

    delete response.info.positions;
    this.balances = response;

    if (!this.wsbalances.wb) {
      this.wsbalances.wb = this.balances.info.totalWalletBalance;
    }

    const walletBalance = Decimal(this.balances.info.totalWalletBalance);
    const marginBalance = Decimal(this.balances.info.totalMarginBalance);
    const maintMargin = Decimal(this.balances.info.totalMaintMargin);

    const riskRatio = maintMargin.div(marginBalance).mul(100);

    // await this.influxDB.writeFloat('account', 'balance', walletBalance.toNumber());
    // await this.influxDB.writeFloat('account', 'riskratio', riskRatio.toNumber());

    this.logger.debug(`Binance Delivery: balances updates`);
  }

  /**
   * As a websocket fallback update orders also on REST
   */
  async syncPositionViaRestApi() {
    let response;
    try {
      response = await this.ccxtClient.dapiPrivateGetPositionRisk();
    } catch (e) {
      this.logger.error(`Binance Delivery: error getting positions:${e}`);
      return;
    }

    const positions = response.filter(position => position.entryPrice && parseFloat(position.entryPrice) > 0);
    this.fullPositionsUpdate(BinanceDelivery.createPositions(positions, this.contractSizes));

    this.logger.debug(`Binance Delivery: positions updates: ${positions.length}`);
  }

  isInverseSymbol(symbol) {
    return false;
  }

  async positionMarkPriceUpdate(symbol, markPrice) {
    try {
      let totalUnrealizedProfit = 0;

      Object.values(this.positions).forEach(position => {
        if (position.symbol === symbol && position.raw) {
          position.markPrice = markPrice;
          position.raw.markPrice = markPrice;

          const size = position.amount * this.contractSizes[symbol];
          const profit =
            size < 0
              ? (position.entry / position.markPrice - 1) * 100 // short
              : (position.markPrice / position.entry - 1) * 100; // long

          const pnl =
            size < 0
              ? (position.entry / position.markPrice - 1) * Math.abs(size)
              : (position.markPrice / position.entry - 1) * Math.abs(size);

          position.raw.unRealizedProfit = pnl;
          position.profit = profit;
        }

        totalUnrealizedProfit += parseFloat(position.raw.unRealizedProfit);
      });

      /* if (!this.balances.info.totalWalletBalance) {
        this.balances.info.totalWalletBalance = 0;
      }

      this.balances.info.totalMarginBalance = parseFloat(this.balances.info.totalWalletBalance) + totalUnrealizedProfit;
      this.balances.info.totalUnrealizedProfit = totalUnrealizedProfit; */
    } catch (e) {
      this.logger.error(`Binance Delivery: error update mark price:${e}`);
    }
  }

  async initPublicWebsocket(symbols) {
    const me = this;

    const allSubscriptions = [];
    symbols.forEach(symbol => {
      allSubscriptions.push(`${symbol.symbol.toLowerCase()}@bookTicker`);
      allSubscriptions.push(`${symbol.symbol.toLowerCase()}@markPrice`);
      allSubscriptions.push(...symbol.periods.map(p => `${symbol.symbol.toLowerCase()}@kline_${p}`));
    });

    me.logger.info(`Binance Delivery: Public stream subscriptions: ${allSubscriptions.length}`);

    // "A single connection can listen to a maximum of 200 streams."; let us have some window frames
    _.chunk(allSubscriptions, 180).forEach((allSubscriptionsChunk, indexConnection) => {
      me.initPublicWebsocketChunk(allSubscriptionsChunk, indexConnection);
    });
  }

  /**
   * A per websocket init function scope to filter maximum allowed subscriptions per connection
   *
   * @param {string[]} subscriptions
   * @param {int} indexConnection
   */
  initPublicWebsocketChunk(subscriptions, indexConnection) {
    const me = this;
    const ws = new WebSocket('wss://dstream.binance.com/stream');

    ws.onerror = function(event) {
      me.logger.error(
        `Binance Delivery: Public stream (${indexConnection}) error: ${JSON.stringify([event.code, event.message])}`
      );
    };

    let subscriptionTimeouts = {};

    ws.onopen = function() {
      me.logger.info(`Binance Delivery: Public stream (${indexConnection}) opened.`);

      me.logger.info(
        `Binance Delivery: Needed Websocket (${indexConnection}) subscriptions: ${JSON.stringify(subscriptions.length)}`
      );

      // "we are only allowed to send 5 requests per second"; but limit it also for the "SUBSCRIBE" itself who knows upcoming changes on this
      _.chunk(subscriptions, 15).forEach((subscriptionChunk, index) => {
        subscriptionTimeouts[index] = setTimeout(() => {
          me.logger.debug(
            `Binance Delivery: Public stream (${indexConnection}) subscribing: ${JSON.stringify(subscriptionChunk)}`
          );

          ws.send(
            JSON.stringify({
              method: 'SUBSCRIBE',
              params: subscriptionChunk,
              id: Math.floor(Math.random() * Math.floor(100))
            })
          );

          delete subscriptionTimeouts[index];
        }, (index + 1) * 1500);
      });
    };

    ws.onmessage = async function(event) {
      if (event.type && event.type === 'message') {
        const body = JSON.parse(event.data);

        if (body.stream && body.stream.toLowerCase().includes('@bookticker')) {
          me.eventEmitter.emit(
            'ticker',
            new TickerEvent(
              me.getName(),
              body.data.s,
              (me.tickers[body.data.s] = new Ticker(
                me.getName(),
                body.data.s,
                moment().format('X'),
                parseFloat(body.data.b),
                parseFloat(body.data.a)
              ))
            )
          );
        } else if (body.stream && body.stream.toLowerCase().includes('@markprice')) {
          await me.positionMarkPriceUpdate(body.data.s, parseFloat(body.data.p));
        } else if (body.stream && body.stream.toLowerCase().includes('@kline')) {
          await me.candleImporter.insertThrottledCandles([
            new ExchangeCandlestick(
              me.getName(),
              body.data.s,
              body.data.k.i,
              Math.round(body.data.k.t / 1000),
              parseFloat(body.data.k.o),
              parseFloat(body.data.k.h),
              parseFloat(body.data.k.l),
              parseFloat(body.data.k.c),
              parseFloat(body.data.k.v)
            )
          ]);
        }
      }
    };

    ws.onclose = function(event) {
      me.logger.error(
        `Binance Delivery: Public Stream (${indexConnection}) connection closed: ${JSON.stringify([
          event.code,
          event.message
        ])}`
      );

      Object.values(subscriptionTimeouts).forEach(timeout => {
        clearTimeout(timeout);
      });

      subscriptionTimeouts = {};

      setTimeout(async () => {
        me.logger.info(`Binance Delivery: Public stream (${indexConnection}) connection reconnect`);
        await me.initPublicWebsocketChunk(subscriptions, indexConnection);
      }, 1000 * 30);
    };
  }

  async initUserWebsocket() {
    let response;
    try {
      response = await this.ccxtClient.dapiPrivatePostListenKey();
    } catch (e) {
      this.logger.error(`Binance Delivery: listenKey error: ${String(e)}`);
      return undefined;
    }

    if (!response || !response.listenKey) {
      this.logger.error(`Binance Delivery: invalid listenKey response: ${JSON.stringify(response)}`);
      return undefined;
    }

    const me = this;
    const ws = new WebSocket(`wss://dstream.binance.com/ws/${response.listenKey}`);
    ws.onerror = function(e) {
      me.logger.info(`Binance Delivery: Connection error: ${String(e)}`);
    };

    ws.onopen = function() {
      me.logger.info(`Binance Delivery: Opened user stream`);
    };

    ws.onmessage = async function(event) {
      if (event && event.type === 'message') {
        const message = JSON.parse(event.data);

        if (message.e && message.e.toUpperCase() === 'ORDER_TRADE_UPDATE') {
          const order = BinanceDelivery.createRestOrderFromWebsocket(message.o);

          me.logger.debug(
            `Binance Delivery: ORDER_TRADE_UPDATE event: ${JSON.stringify([message.e, message.o, order])}`
          );
          me.throttler.addTask(
            'binance_delivery_sync_orders',
            async () => {
              await me.ccxtExchangeOrder.syncOrders();
            },
            3000
          );
          me.ccxtExchangeOrder.triggerPlainOrder(order);
          me.eventEmitter.emit('exchange_order', new ExchangeOrderEvent(me.getName(), order));
        }

        if (message.e && message.e.toUpperCase() === 'ACCOUNT_UPDATE') {
          await me.accountUpdate(message);

          me.throttler.addTask('binance_delivery_sync_positions', me.syncPositionViaRestApi.bind(me), 3000);
          me.throttler.addTask('binance_delivery_sync_balances', me.syncBalancesViaRestApi.bind(me), 5000);
        }

        if (message.e && message.e.toUpperCase() === 'MARGIN_CALL') {
          console.log(message.p);
        }
      }
    };

    const heartbeat = setInterval(async () => {
      try {
        await this.ccxtClient.dapiPrivatePutListenKey();
        this.logger.debug('Binance Delivery: user stream ping successfully done');
      } catch (e) {
        this.logger.error(`Binance Delivery: user stream ping error: ${String(e)}`);
      }
    }, 1000 * 60 * 10);

    ws.onclose = function(event) {
      me.logger.error(
        `Binance Delivery: User stream connection closed: ${JSON.stringify([event.code, event.message])}`
      );
      clearInterval(heartbeat);

      setTimeout(async () => {
        me.logger.info('Binance Delivery: User stream connection reconnect');
        await me.initUserWebsocket();
      }, 1000 * 30);
    };

    return true;
  }

  static createCustomCcxtOrderInstance(ccxtClient, symbols, logger, config) {
    // ccxt id and binance ids are not matching
    const CcxtExchangeOrderExtends = class extends CcxtExchangeOrder {
      async createOrder(order) {
        order.symbol = order.symbol.replace('USD_PERP', '/USD');
        return super.createOrder(order);
      }
    };

    return new CcxtExchangeOrderExtends(ccxtClient, symbols, logger, {
      cancelOrder: (client, args) => {
        return { symbol: args.symbol.replace('USD_PERP', '/USD') };
      },
      convertOrder: (client, order) => {
        order.symbol = order.symbol.replace('/USD', 'USD_PERP');
        // ccxt does not pipe the stopPrice
        if (
          ['trailing_stop_market', 'stop_market', 'take_profit_market'].includes(order.type) &&
          order.info.stopPrice
        ) {
          order.price = parseFloat(order.info.stopPrice);
        }
      },
      createOrder: order => {
        const request = {
          args: {}
        };

        if (config.hedge) {
          request.args.positionSide = order.side.toUpperCase();
          request.args.side = order.side === Order.SIDE_SHORT ? 'SELL' : 'BUY';
        }

        if (order.isReduceOnly()) {
          if (config.hedge) {
            order.side = order.side === Order.SIDE_SHORT ? 'long' : 'short';
            request.args.positionSide = order.side.toUpperCase();
            request.args.side = order.side === Order.SIDE_SHORT ? 'BUY' : 'SELL';
          } else {
            request.args.reduceOnly = true;
          }
        }

        if (order.getType() === Order.TYPE_STOP || order.getType() === Order.TYPE_STOP_MARKET) {
          request.args.stopPrice = order.getPrice();
        }

        if (order.getType() === Order.TYPE_TAKE_PROFIT || order.getType() === Order.TYPE_TAKE_PROFIT_MARKET) {
          if (config.hedge) {
            order.side = order.side === Order.SIDE_SHORT ? 'long' : 'short';
            request.args.positionSide = order.side.toUpperCase();
          } else {
            request.args.reduceOnly = true;
          }
          request.args.stopPrice = order.getPrice();
        }

        if (order.getType() === Order.TYPE_TRAILING_STOP || order.getType() === Order.TYPE_TRAILING_STOP_MARKET) {
          if (config.hedge) {
            order.side = order.side === Order.SIDE_SHORT ? 'long' : 'short';
            request.args.positionSide = order.side.toUpperCase();
          } else {
            request.args.reduceOnly = true;
          }
          request.args.activationPrice = order.getPrice();
          request.args.callbackRate = order.options.callbackRate;
        }

        if (order.options && order.options.close && config.hedge) {
          request.args.side = order.side === Order.SIDE_SHORT ? 'BUY' : 'SELL';
        }

        return request;
      }
    });
  }

  static createRestOrderFromWebsocket(websocketOrder) {
    const order = websocketOrder;

    //     {
    //         "symbol": "BTCUSD",
    //         "orderId": 1,
    //         "clientOrderId": "myOrder1",
    //         "price": "0.1",
    //         "origQty": "1.0",
    //         "executedQty": "1.0",
    //         "cumQuote": "10.0",
    //         "status": "NEW",
    //         "timeInForce": "GTC",
    //         "type": "LIMIT",
    //         "side": "BUY",
    //         "stopPrice": "0.0",
    //         "updateTime": 1499827319559
    //     }

    const map = {
      s: 'symbol',
      c: 'clientOrderId',
      S: 'side',
      o: 'type',
      f: 'timeInForce',
      q: 'origQty',
      p: 'price',
      sp: 'stopPrice',
      X: 'status',
      i: 'orderId',
      T: 'updateTime',
      z: 'executedQty',
      ps: 'positionSide',
      R: 'reduceOnly'
      // n: 'cumQuote' // not fully sure about commision
    };

    const newOrder = {};
    Object.keys(order).forEach(k => {
      if (map[k]) {
        newOrder[map[k]] = order[k];
      }
    });

    return newOrder;
  }
};
