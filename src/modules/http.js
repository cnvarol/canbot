/* eslint-disable no-restricted-syntax */
/* eslint-disable no-bitwise */
/* eslint-disable no-param-reassign */
/* eslint-disable prefer-destructuring */
const compression = require('compression');
const express = require('express');
const session = require('express-session');
const twig = require('twig');
const auth = require('basic-auth');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const moment = require('moment');
const http = require('http');
const WebSocket = require('ws');
const OrderUtil = require('../utils/order_util');

module.exports = class Http {
  constructor(
    systemUtil,
    ta,
    signalHttp,
    backtest,
    exchangeManager,
    pairsHttp,
    logsHttp,
    candleExportHttp,
    candleImporter,
    ordersHttp,
    tickers,
    eventEmitter,
    influxDB,
    projectDir
  ) {
    this.systemUtil = systemUtil;
    this.ta = ta;
    this.signalHttp = signalHttp;
    this.backtest = backtest;
    this.exchangeManager = exchangeManager;
    this.pairsHttp = pairsHttp;
    this.logsHttp = logsHttp;
    this.candleExportHttp = candleExportHttp;
    this.candleImporter = candleImporter;
    this.ordersHttp = ordersHttp;
    this.projectDir = projectDir;
    this.tickers = tickers;
    this.eventEmitter = eventEmitter;
    this.influxDB = influxDB;
  }

  start() {
    const uuidv4 = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    twig.extendFilter('price_format', value => {
      if (parseFloat(value) < 1) {
        return Intl.NumberFormat('en-US', {
          useGrouping: false,
          minimumFractionDigits: 2,
          maximumFractionDigits: 6
        }).format(value);
      }

      return Intl.NumberFormat('en-US', {
        useGrouping: false,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    });

    twig.extendFilter('json_pretty', value => {
      return JSON.stringify(value, null, 2);
    });

    twig.extendFilter('json_replace', value => {
      const json = value
        .replace(/\\/g, '')
        .replace('"{', '{')
        .replace('}"', '}');
      return JSON.parse(json);
    });

    twig.extendFilter('capitalizeFirstLetter', value => {
      const words = value.split('_');
      for (let i = 0; i < words.length; i++) {
        words[i] = words[i][0].toUpperCase() + words[i].substr(1);
      }

      return words.join(' ');
    });

    const assetVersion = crypto
      .createHash('md5')
      .update(String(Math.floor(Date.now() / 1000)))
      .digest('hex')
      .substring(0, 8);

    twig.extendFunction('asset_version', () => {
      return assetVersion;
    });

    const desks = this.systemUtil.getConfig('desks', []).map(desk => desk.name);
    twig.extendFunction('desks', () => {
      return desks;
    });

    twig.extendFunction('node_version', () => {
      return process.version;
    });

    const hedge_mode = this.systemUtil.getConfig('exchanges.binance_futures.hedge');
    twig.extendFunction('hedge_mode', () => {
      return hedge_mode;
    });

    twig.extendFunction('memory_usage', () => {
      return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
    });

    const up = new Date();
    twig.extendFunction('uptime', () => {
      return moment(up).toNow(true);
    });

    twig.extendFilter('format_json', value => {
      return JSON.stringify(value, null, '\t');
    });

    const app = express();

    app.use(express.urlencoded({ limit: '12mb', extended: true, parameterLimit: 50000 }));
    app.use(cookieParser());
    app.use(compression());
    app.use(express.static(`${this.projectDir}/web/static`, { maxAge: 3600000 * 24 }));

    app.set('trust proxy', 1);
    app.use(
      session({
        genid: req => {
          return uuidv4();
        },
        secret: uuidv4(),
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
      })
    );

    app.get('/login', async (req, res) => {
      const { action } = req.query;

      if (action) {
        const alert = {};

        switch (action) {
          case 'auth':
            alert.type = 'danger';
            alert.title = 'That was an invalid username or password';
            break;
          case 'logout':
            alert.type = 'warning';
            alert.title = 'Your session successfuly destroyed';
            break;
          default:
        }

        return res.render('../templates/login.html.twig', { alert: alert });
      }

      return res.render('../templates/login.html.twig');
    });

    app.get('/logout', async (req, res) => {
      req.session.destroy();
      res.redirect('/login?action=logout');
    });

    const systemUsername = this.systemUtil.getConfig('webserver.username');
    const systemPassword = this.systemUtil.getConfig('webserver.password');

    if (!systemUsername || !systemPassword) {
      throw new Error('Username or password not found in conf.json! Please set these first.');
    }

    app.post('/login', async (req, res) => {
      const { username, password } = req.body;
      const returnPath = req.query.return;

      if (username !== systemUsername || password !== systemPassword) {
        return res.redirect(`/login?action=auth&return=${returnPath}`);
      }

      req.session.username = username;

      if (returnPath) {
        return res.redirect(returnPath);
      }

      return res.redirect('/');
    });

    app.use((req, res, next) => {
      if (!req.session.username) {
        return res
          .status(403)
          .send(`<html><head><script>window.location.href='/login?return=${req.path}';</script></head></html>`);
      }

      return next();
    });

    const server = http.createServer(app);

    const wss = new WebSocket.Server({ server });
    const userMap = new Map();

    wss.on('connection', ws => {
      ws.on('error', err => {
        ws.close();
      });

      const userId = uuidv4();

      ws.send(JSON.stringify({ type: 'SocketStateChangedEvent', state: 'connected' }));

      let data;
      ws.on('message', message => {
        try {
          data = JSON.parse(message);
        } catch (e) {
          console.log(userId, e);
          ws.close();

          return;
        }

        if (data.type === 'AuthEvent' && data.key && data.key === 'ddca32ea-5154-40b8-a829-b6cc8d62aee') {
          userMap.set(userId, ws);
          ws.send(JSON.stringify({ type: 'AuthEvent', authentication: true }));
          return;
        }

        if (!userMap.get(userId)) {
          ws.close();
        }

        if (data.type === 'SocketStateChangedEvent' && data.state === 'alive') {
          ws.send(JSON.stringify({ type: 'SocketStateChangedEvent', state: 'ok' }));
        }
      });

      ws.on('close', () => {
        userMap.delete(userId);
      });
    });

    wss.broadcast = function broadcast(message) {
      userMap.forEach((ws, userId) => {
        ws.send(message);
      });
    };

    this.eventEmitter.on('exchange_order', async event => {
      wss.broadcast(JSON.stringify({ type: 'ExchangeOrderEvent', event: event }));
    });

    this.eventEmitter.on('exchange_position', async event => {
      wss.broadcast(JSON.stringify({ type: 'ExchangePositionEvent', event: event }));
    });

    server.listen(8999, '127.0.0.1', () => {
      console.log(`Websocket listening on: ${server.address().address}:${server.address().port}`);
    });

    app.set('views', `${this.projectDir}/templates`);
    app.set('twig options', {
      allow_async: true,
      strict_variables: false
    });

    const { ta } = this;

    app.get('/', async (req, res) => {
      res.render('../templates/dashboard.html.twig');
    });

    app.get('/indicators', async (req, res) => {
      res.render(
        '../templates/indicators.html.twig',
        await ta.getTaForPeriods(this.systemUtil.getConfig('dashboard.periods', ['15m', '1h']))
      );
    });

    app.get('/backtest', async (req, res) => {
      res.render('../templates/backtest.html.twig', {
        strategies: this.backtest.getBacktestStrategies(),
        pairs: await this.backtest.getBacktestPairs()
      });
    });

    app.get('/gridmodel', async (req, res) => {
      res.render('../templates/gridmodel.html.twig');
    });

    app.post('/backtest/submit', async (req, res) => {
      let pairs = req.body.pair;

      if (typeof pairs === 'string') {
        pairs = [pairs];
      }

      const asyncs = pairs.map(pair => {
        return async () => {
          const p = pair.split('.');

          return {
            pair: pair,
            result: await this.backtest.getBacktestResult(
              parseInt(req.body.ticker_interval, 10),
              req.body.hours,
              req.body.strategy,
              req.body.candle_period,
              p[0],
              p[1],
              req.body.options ? JSON.parse(req.body.options) : {},
              req.body.initial_capital
            )
          };
        };
      });

      const backtests = await Promise.all(asyncs.map(fn => fn()));

      // single details view
      if (backtests.length === 1) {
        res.render('../templates/backtest_submit.html.twig', backtests[0].result);
        return;
      }

      // multiple view
      res.render('../templates/backtest_submit_multiple.html.twig', {
        backtests: backtests
      });
    });

    app.get('/tradingview/:symbol', (req, res) => {
      const { symbol } = req.params;
      const split = symbol.split(':');

      res.render('../templates/tradingview.html.twig', {
        symbol: this.buildTradingViewSymbol(req.params.symbol),
        exchange: split[0],
        pair: split[1]
      });
    });

    app.get('/signals', async (req, res) => {
      res.render('../templates/signals.html.twig', {
        signals: await this.signalHttp.getSignals(Math.floor(Date.now() / 1000) - 60 * 60 * 96)
      });
    });

    app.get('/pairs', async (req, res) => {
      const pairs = await this.pairsHttp.getTradePairs();

      res.render('../templates/pairs.html.twig', {
        pairs: pairs,
        stats: {
          positions: pairs.filter(p => p.has_position === true).length,
          trading: pairs.filter(p => p.is_trading === true).length
        }
      });
    });

    app.get('/logs', async (req, res) => {
      res.render('../templates/logs.html.twig', await this.logsHttp.getLogsPageVariables(req, res));
    });

    app.get('/desks/:desk', async (req, res) => {
      res.render('../templates/desks.html.twig', {
        desk: this.systemUtil.getConfig('desks')[req.params.desk],
        interval: req.query.interval || undefined,
        id: req.params.desk
      });
    });

    app.get('/desks/:desk/fullscreen', (req, res) => {
      const configElement = this.systemUtil.getConfig('desks')[req.params.desk];
      res.render('../templates/tradingview_desk.html.twig', {
        desk: configElement,
        interval: req.query.interval || undefined,
        id: req.params.desk,
        watchlist: configElement.pairs.map(i => i.symbol)
      });
    });

    app.get('/tools/candles', async (req, res) => {
      const options = {
        pairs: await this.candleExportHttp.getPairs(),
        start: moment()
          .subtract(7, 'days')
          .toDate(),
        end: new Date()
      };

      if (req.query.pair && req.query.period && req.query.period && req.query.start && req.query.end) {
        const [exchange, symbol] = req.query.pair.split('.');
        const candles = await this.candleExportHttp.getCandles(
          exchange,
          symbol,
          req.query.period,
          new Date(req.query.start),
          new Date(req.query.end)
        );

        if (req.query.metadata) {
          candles.map(c => {
            c.exchange = exchange;
            c.symbol = symbol;
            c.period = req.query.period;
            return c;
          });
        }

        options.start = new Date(req.query.start);
        options.end = new Date(req.query.end);

        options.exchange = exchange;
        options.symbol = symbol;
        options.period = req.query.period;
        options.candles = candles;
        options.candles_json = JSON.stringify(candles, null, 2);
      }

      res.render('../templates/candle_stick_export.html.twig', options);
    });

    app.post('/tools/candles', async (req, res) => {
      const exchangeCandlesticks = JSON.parse(req.body.json);
      await this.candleImporter.insertCandles(exchangeCandlesticks);

      console.log(`Imported: ${exchangeCandlesticks.length} items`);

      res.redirect('/tools/candles');
    });

    app.post('/pairs/:pair', async (req, res) => {
      const pair = req.params.pair.split('-');
      const { body } = req;

      // exchange-ETC-FOO
      // exchange-ETCFOO
      const symbol = req.params.pair.substring(pair[0].length + 1);

      await this.pairsHttp.triggerOrder(pair[0], symbol, body.positionSide, body.action);

      // simple sleep for async ui blocking for exchange communication
      setTimeout(() => {
        res.json({ status: 'success' });
      }, 800);
    });

    const { exchangeManager } = this;
    app.get('/order/:exchange/:id', async (req, res) => {
      const exchangeName = req.params.exchange;
      const { id } = req.params;

      const exchange = exchangeManager.get(exchangeName);

      try {
        await exchange.cancelOrder(id);
        res.json({ status: 'success' });
      } catch (e) {
        res.json({ status: 'error', error: String(e.message) });
      }
    });

    app.get('/order/:exchange/cancel/all', async (req, res) => {
      const exchangeName = req.params.exchange;

      try {
        await this.ordersHttp.cancelAllOrders(exchangeName);
        res.json({ status: 'success' });
      } catch (e) {
        res.json({ status: 'error', error: String(e.message) });
      }
    });

    app.get('/orders', async (req, res) => {
      res.render('../templates/orders/index.html.twig', {
        pairs: this.ordersHttp.getPairs()
      });
    });

    app.get('/api/v1/chartData/:measurement/:field', async (req, res) => {
      const { measurement, field } = req.params;
      const { start, stop, every, fn, createEmpty } = req.query;

      try {
        const data = await this.influxDB.queryAggr(measurement, field, start, stop, every, fn, createEmpty);
        res.json(data);
      } catch (e) {
        res.status(400).json({ error: e });
      }
    });

    app.get('/api/v1/trade/:pair', async (req, res) => {
      const { pair } = req.params;

      const data = {};

      const split = pair.split('.');
      if (split.length !== 2) {
        res.json({ error: 'pair format not correct' });
        return;
      }

      data.exchange = split[0];
      data.symbol = split[1];
      data.ticker = this.ordersHttp.getTicker(pair);
      data.orders = await this.ordersHttp.getOrders(pair);

      data.positions = [];

      const position = await this.exchangeManager.getPosition(split[0], split[1]);
      if (Array.isArray(position)) {
        data.positions = position;
      } else {
        data.positions.push(position);
      }

      res.json(data);
    });

    app.get('/orders/:pair', async (req, res) => {
      const { pair } = req.params;
      const tradingview = pair.split('.');

      const ticker = this.ordersHttp.getTicker(pair);

      let positions = [];

      const position = await this.exchangeManager.getPosition(tradingview[0], tradingview[1]);
      if (Array.isArray(position)) {
        positions = position;
      } else {
        positions.push(position);
      }

      res.render('../templates/orders/orders.html.twig', {
        pair: pair,
        pairs: this.ordersHttp.getPairs(),
        orders: await this.ordersHttp.getOrders(pair),
        positions: positions,
        ticker: ticker,
        tradingview: this.buildTradingViewSymbol(`${tradingview[0]}:${tradingview[1]}`),
        form: {
          price: ticker ? ticker.bid : undefined,
          type: 'limit'
        }
      });
    });

    app.post('/orders/:pair', async (req, res) => {
      const { pair } = req.params;
      const tradingview = pair.split('.');

      const ticker = this.ordersHttp.getTicker(pair);
      const form = req.body;

      let success = true;
      let message;
      let result;

      try {
        result = await this.ordersHttp.createOrder(pair, form);
        // message = JSON.stringify(result);

        if (!result || result.shouldCancelOrderProcess()) {
          success = false;
        }
      } catch (e) {
        success = false;
        message = String(e.message);
      }

      let positions = [];

      const position = await this.exchangeManager.getPosition(tradingview[0], tradingview[1]);
      if (Array.isArray(position)) {
        positions = position;
      } else {
        positions.push(position);
      }

      res.render('../templates/orders/orders.html.twig', {
        pair: pair,
        pairs: this.ordersHttp.getPairs(),
        orders: await this.ordersHttp.getOrders(pair),
        ticker: ticker,
        positions: positions,
        form: form,
        tradingview: this.buildTradingViewSymbol(`${tradingview[0]}:${tradingview[1]}`),
        alert: {
          title: success ? 'Order created successfuly' : 'Occurred error while creating order',
          type: success ? 'success' : 'danger',
          message: message
        }
      });
    });

    app.get('/orders/:pair/cancel/:id', async (req, res) => {
      await this.ordersHttp.cancel(req.params.pair, req.params.id);
      res.redirect(`/orders/${req.params.pair}`);
    });

    app.get('/orders/:pair/cancel-all', async (req, res) => {
      await this.ordersHttp.cancelAll(req.params.pair);
      res.redirect(`/orders/${req.params.pair}`);
    });

    app.get('/trades', async (req, res) => {
      res.render('../templates/trades.html.twig');
    });

    app.get('/trades.json', async (req, res) => {
      const positions = [];
      const orders = [];
      let balances = {};

      const exchanges = exchangeManager.all();

      for (const exchange of exchanges) {
        const exchangeName = exchange.getName();

        if (exchangeName.includes('binance_futures')) {
          balances = await exchange.getBalances();
        }

        const myPositions = await exchange.getPositions();
        myPositions.forEach(position => {
          // simply converting of asset to currency value
          let currencyValue;

          if (
            (exchangeName.includes('bitmex') && ['XBTUSD', 'ETHUSD'].includes(position.symbol)) ||
            exchangeName.includes('bybit')
          ) {
            // inverse exchanges
            currencyValue = Math.abs(position.amount);
          } else if (position.amount && position.entry) {
            currencyValue = position.entry * Math.abs(position.amount);
          }

          positions.push({
            exchange: exchangeName,
            position: position,
            currency: currencyValue,
            currencyProfit: position.getProfit()
              ? currencyValue + (currencyValue / 100) * position.getProfit()
              : undefined
          });
        });

        const myOrders = await exchange.getOrders();
        myOrders.forEach(order => {
          const items = {
            exchange: exchange.getName(),
            order: order
          };

          const ticker = this.tickers.get(exchange.getName(), order.symbol);
          if (ticker) {
            items.percent_to_price = OrderUtil.getPercentDifferent(order.price, ticker.bid);
          }

          orders.push(items);
        });
      }

      res.json({
        balances: balances,
        orders: orders.sort((a, b) => a.order.symbol.localeCompare(b.order.symbol)),
        positions: positions.sort((a, b) => a.position.symbol.localeCompare(b.position.symbol))
      });
    });

    const ip = this.systemUtil.getConfig('webserver.ip', '0.0.0.0');
    const port = this.systemUtil.getConfig('webserver.port', 8080);

    app.listen(port, ip);

    console.log(`Webserver listening on: ${ip}:${port}`);
  }

  /**
   * Tricky way to normalize our tradingview views
   *
   * eg:
   *  - binance_futures:BTCUSDT => binance:BTCUSDTPERP
   *  - binance_margin:BTCUSDT => binance:BTCUSDT
   *  - coinbase_pro:BTC-USDT => coinbase:BTCUSDT
   *
   * @param symbol
   * @returns {string}
   */
  buildTradingViewSymbol(symbol) {
    let mySymbol = symbol;

    // binance:BTCUSDTPERP
    if (mySymbol.includes('binance_futures')) {
      mySymbol = mySymbol.replace('binance_futures', 'binance');
      mySymbol += 'PERP';
    }

    return mySymbol
      .replace('-', '')
      .replace('coinbase_pro', 'coinbase')
      .replace('binance_margin', 'binance')
      .toUpperCase();
  }
};
