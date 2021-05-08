/* eslint-disable prefer-destructuring */
const moment = require('moment');
const _ = require('lodash');
const { Keyboard } = require('telegram-keyboard');
const StrategyContext = require('../../dict/strategy_context');
const Order = require('../../dict/order');
const OrderCapital = require('../../dict/order_capital');

module.exports = class TickListener {
  constructor(
    tickers,
    instances,
    notifier,
    signalLogger,
    strategyManager,
    exchangeManager,
    pairStateManager,
    logger,
    systemUtil,
    orderExecutor,
    orderCalculator
  ) {
    this.tickers = tickers;
    this.instances = instances;
    this.notifier = notifier;
    this.signalLogger = signalLogger;
    this.strategyManager = strategyManager;
    this.exchangeManager = exchangeManager;
    this.pairStateManager = pairStateManager;
    this.logger = logger;
    this.systemUtil = systemUtil;
    this.orderExecutor = orderExecutor;
    this.orderCalculator = orderCalculator;

    this.notified = {};
    this.warnNotified = false;
  }

  async visitStrategy(strategy, symbol) {
    const ticker = this.tickers.get(symbol.exchange, symbol.symbol);

    if (!ticker) {
      console.error(`Ticker no found for + ${symbol.exchange}${symbol.symbol}`);
      return;
    }

    const strategyKey = strategy.strategy;

    let context = StrategyContext.create(strategy.options, ticker, true);
    const positions = await this.exchangeManager.getPosition(symbol.exchange, symbol.symbol);

    let position = positions;
    if (Array.isArray(positions)) {
      position = positions.find(p => p.symbol === symbol.symbol && p.side === 'long');
      if (!position) {
        position = positions.find(p => p.symbol === symbol.symbol && p.side === 'short');
      }
    }

    if (position) {
      context = StrategyContext.createFromPosition(strategy.options, ticker, position, true);
    }

    const result = await this.strategyManager.executeStrategy(
      strategyKey,
      context,
      symbol.exchange,
      symbol.symbol,
      strategy.options || {}
    );
    if (!result) {
      return;
    }

    const signal = result.getSignal();
    if (!signal || typeof signal === 'undefined') {
      return;
    }

    if (!['close_short', 'close_long', 'close', 'short', 'long'].includes(signal)) {
      throw new Error(`Invalid signal: ${JSON.stringify(signal, strategy)}`);
    }

    const signalWindow = moment()
      .subtract(30, 'minutes')
      .toDate();

    if (
      this.notified[symbol.exchange + symbol.symbol + strategyKey] &&
      signalWindow <= this.notified[symbol.exchange + symbol.symbol + strategyKey]
    ) {
      // console.log('blocked')
    } else {
      this.notified[symbol.exchange + symbol.symbol + strategyKey] = new Date();
      this.notifier.send(
        `Strategy (${strategyKey}) watcher found new opportunity for ${symbol.symbol} for ${signal} side. Current price is ${ticker.ask} USDT`
      );

      // log signal
      this.signalLogger.signal(
        symbol.exchange,
        symbol.symbol,
        {
          price: ticker.ask,
          strategy: strategyKey,
          raw: JSON.stringify(result)
        },
        signal,
        strategyKey
      );
    }
  }

  async botTelegramCommands() {
    const telegram = this.notifier.get('telegram');

    if (telegram) {
      const bot = telegram.telegraf;

      const keyboard = Keyboard.make([
        ['/start', '/stop'], // First row
        ['/balances', '/positions'] // Second row
      ]).reply();

      // bot.start(ctx => ctx.reply(`Hey ${ctx.from.first_name} 😜 I'm ready for your commands.`, keyboard));

      this.notifier.get('telegram').send('Hey bro!', keyboard);

      bot.command('start', async ctx => {
        ctx.reply(`I'm starting again..`, keyboard);
      });

      bot.command('stop', async ctx => {
        const yesno = Keyboard.make([['/yes', '/no']]).reply();
        ctx.reply('Are you sure?', yesno);
      });

      bot.command('yes', async ctx => {
        ctx.reply(
          `${ctx.from.first_name}, you need start me again on terminal.\nI will be stop in 3 seconds..`,
          keyboard
        );

        setTimeout(() => {
          process.exit(0);
        }, 3000);
      });

      bot.command('no', async ctx => {
        ctx.reply(`Cancelled!`, keyboard);
      });

      bot.command('balances', ctx => this.getBalances(ctx));

      bot.command('positions', ctx => {
        ctx.reply('Positions will be send soon.');
      });

      bot.on(['sticker', 'photo'], ctx => {
        return ctx.reply(`Cool! Let's do better 😁`);
      });

      await bot.launch();
    }
  }

  async getBalances(ctx) {
    const toCurrency = value => {
      Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
    };

    const binanceFutures = this.exchangeManager.get('binance_futures');
    if (!binanceFutures) {
      ctx.reply('Balances not found');
      return;
    }

    const balances = await binanceFutures.getBalances();
    if (balances.info) {
      const riskRatio = (balances.info.totalMaintMargin / balances.info.totalMarginBalance) * 100;

      ctx.reply(`Wallet Balance: ${toCurrency(balances.info.totalWalletBalance)} USDT
Available Balance: ${toCurrency(balances.info.availableBalance)} USDT
Maintenance Margin: ${toCurrency(balances.info.totalMaintMargin)} USDT
Margin Balance: ${toCurrency(balances.info.totalMarginBalance)} USDT
Unrealized PNL: ${toCurrency(balances.info.totalUnrealizedProfit)} USDT
Margin Risk Ratio: ${riskRatio.toFixed(2)}%`);
    } else {
      ctx.reply('Error occurred while getting balances!');
    }
  }

  async visitTradeStrategy(strategy, symbol) {
    const ticker = this.tickers.get(symbol.exchange, symbol.symbol);

    if (!ticker) {
      console.error(`Ticker no found for + ${symbol.exchange}${symbol.symbol}`);
      return;
    }

    const strategyKey = strategy.strategy;

    let context = StrategyContext.create(strategy.options, ticker);
    const positions = await this.exchangeManager.getPosition(symbol.exchange, symbol.symbol);

    let position = positions;
    if (Array.isArray(positions)) {
      position = positions.find(p => p.symbol === symbol.symbol && p.side === 'long');
      if (!position) {
        position = positions.find(p => p.symbol === symbol.symbol && p.side === 'short');
      }
    }

    if (position) {
      context = StrategyContext.createFromPosition(strategy.options, ticker, position);
    }

    const result = await this.strategyManager.executeStrategy(
      strategyKey,
      context,
      symbol.exchange,
      symbol.symbol,
      strategy.options || {}
    );

    if (!result) {
      return;
    }

    // handle orders inside strategy
    const placedOrder = result.getPlaceOrder();
    if (placedOrder.length > 0) {
      await this.placeStrategyOrders(placedOrder, symbol);
    }

    let signal = result.getSignal();

    if (!signal || typeof signal === 'undefined') {
      return;
    }

    if (!['close', 'close_short', 'close_long', 'short', 'long'].includes(signal)) {
      throw new Error(`Invalid signal: ${JSON.stringify(signal, strategy)}`);
    }

    /* const signalWindow = moment()
      .subtract(_.get(symbol, 'trade.signal_slowdown_minutes', 1), 'minutes')
      .toDate();

    // TODO(semihalev): We really need this block?
    const noteKey = symbol.exchange + symbol.symbol + signal;
    if (noteKey in this.notified && this.notified[noteKey] >= signalWindow) {
      // return;
    } */

    // log signal
    this.logger.info(
      [new Date().toISOString(), signal, strategyKey, symbol.exchange, symbol.symbol, ticker.ask].join(' ')
    );
    /* this.notifier.send(
      `Strategy (${strategyKey}) watcher found new opportunity for ${symbol.symbol} for ${signal} side. Current price is ${ticker.ask} USDT`
    );
    this.notifier.send(`[${signal} (${strategyKey})] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`); */
    this.signalLogger.signal(
      symbol.exchange,
      symbol.symbol,
      {
        price: ticker.ask,
        strategy: strategyKey,
        raw: JSON.stringify(result)
      },
      signal,
      strategyKey
    );
    // this.notified[noteKey] = new Date();

    let side = signal;
    if (signal === 'close_long' || signal === 'close_short') {
      const split = _.split(signal, '_', 2);
      signal = split[0];
      side = split[1];
    }

    await this.pairStateManager.update(symbol.exchange, symbol.symbol, signal, side, { market: true });
  }

  async placeStrategyOrders(placedOrder, symbol) {
    placedOrder.forEach(async order => {
      const amount = await this.orderCalculator.calculateOrderSizeCapital(
        symbol.exchange,
        symbol.symbol,
        OrderCapital.createCurrency(order.amount_currency)
      );

      // const exchangeOrder = Order.createLimitPostOnlyOrder(symbol.symbol, order.side, order.price, amount);
      // await this.orderExecutor.executeOrderWithAmountAndPrice(symbol.exchange, exchangeOrder);

      const exchangeOrder = Order.createMarketOrder(symbol.symbol, amount, order.side);
      await this.orderExecutor.executeOrder(symbol.exchange, exchangeOrder);

      this.notifier.send(
        `Order executed for ${symbol.symbol} for ${order.side} position.\nSize: *${parseFloat(
          order.price * amount
        ).toFixed(2)}* USDT`
      );
    });
  }

  async warnCheckInterval() {
    const binanceFutures = this.exchangeManager.get('binance_futures');
    if (!binanceFutures) return;

    const balances = await binanceFutures.getBalances();
    if (balances.info) {
      const riskRatio =
        Math.round((balances.info.totalMaintMargin / balances.info.totalMarginBalance) * 100 * 100) / 100;
      if (riskRatio >= 5 && riskRatio % 5 >= 0) {
        if (!this.warnNotified) {
          this.notifier.send(
            `Binance futures margin risk ratio high now. Please await from significant losses.\n\nMargin Risk Ratio: *${riskRatio}*%\nUnrealized PNL: *${parseFloat(
              balances.info.totalUnrealizedProfit
            ).toFixed(2)}* USDT`
          );
          this.warnNotified = true;
          setTimeout(async () => {
            this.warnNotified = false;
          }, 360 * 10000);
        }
      }
    }
  }

  async startStrategyIntervals() {
    this.logger.info(`Starting strategy intervals`);

    const me = this;

    const types = [
      {
        name: 'watch',
        items: this.instances.symbols.filter(sym => sym.strategies && sym.strategies.length > 0)
      },
      {
        name: 'trade',
        items: this.instances.symbols.filter(
          sym => sym.trade && sym.trade.strategies && sym.trade.strategies.length > 0
        )
      }
    ];

    types.forEach(type => {
      me.logger.info(`Strategy: "${type.name}" found "${type.items.length}" valid symbols`);

      type.items.forEach(symbol => {
        // map strategies
        let strategies = [];
        if (type.name === 'watch') {
          strategies = symbol.strategies;
        } else if (type.name === 'trade') {
          strategies = symbol.trade.strategies;
        }

        strategies.forEach(strategy => {
          let myInterval = '1m';

          if (strategy.interval) {
            myInterval = strategy.interval;
          } else {
            const strategyInstance = me.strategyManager.findStrategy(strategy.strategy);
            if (typeof strategyInstance.getTickPeriod === 'function') {
              myInterval = strategyInstance.getTickPeriod();
            }
          }

          const [timeout, interval] = me.getFirstTimeoutAndInterval(myInterval);

          // random add 5-15 sec to init start for each to not run all at same time
          const timeoutWindow = timeout + (Math.floor(Math.random() * 9000) + 5000);

          me.logger.info(
            `"${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" - init strategy "${
              strategy.strategy
            }" (${myInterval}) in ${(timeoutWindow / 60 / 1000).toFixed(3)} minutes`
          );

          const strategyIntervalCallback = async () => {
            /*
            // logging can be high traffic on alot of pairs
            me.logger.debug(
              `"${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" strategy running "${strategy.strategy}"`
            );
            */

            if (type.name === 'watch') {
              await me.visitStrategy(strategy, symbol);
            } else if (type.name === 'trade') {
              await me.visitTradeStrategy(strategy, symbol);
            } else {
              throw new Error(`Invalid strategy type${type.name}`);
            }
          };

          setTimeout(() => {
            me.logger.info(
              `"${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" first strategy run "${
                strategy.strategy
              }" now every ${(interval / 60 / 1000).toFixed(2)} minutes`
            );

            // first run call
            setTimeout(async () => {
              await strategyIntervalCallback();
            }, 1000 + Math.floor(Math.random() * (800 - 300 + 1)) + 100);

            // continuous run
            setInterval(async () => {
              await strategyIntervalCallback();
            }, interval);
          }, timeoutWindow);
        });
      });
    });
  }

  getFirstTimeoutAndInterval(period) {
    const unit = period.slice(-1).toLowerCase();
    let myUnit = 0;
    switch (unit) {
      case 's':
        myUnit = 1;
        break;
      case 'm':
        myUnit = 60;
        break;
      default:
        throw new Error(`Unsupported period unit: ${period}`);
    }

    const number = parseInt(period.substring(0, period.length - 1), 10);
    return [this.getFirstRun(number, myUnit), number * myUnit * 1000];
  }

  getFirstRun(minutes, unit) {
    const interval = minutes * unit * 1000;
    const number = Math.ceil(new Date().getTime() / interval) * interval;
    return new Date(number).getTime() - new Date().getTime();
  }
};
