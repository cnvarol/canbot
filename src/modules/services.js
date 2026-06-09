/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-return-assign */
const fs = require('fs');
const events = require('events');

// Set global max listeners to prevent warnings during frequent WebSocket reconnections
events.EventEmitter.defaultMaxListeners = 100;

const { createLogger, transports, format } = require('winston');

const _ = require('lodash');
const Sqlite = require('better-sqlite3');
const Notify = require('../notify/notify');
const Slack = require('../notify/slack');
const Mail = require('../notify/mail');
const Telegram = require('../notify/telegram');

const Tickers = require('../storage/tickers');
const Ta = require('./ta.js');

const TickListener = require('./listener/tick_listener');
const CreateOrderListener = require('./listener/create_order_listener');
const TickerDatabaseListener = require('./listener/ticker_database_listener');
const ExchangeOrderWatchdogListener = require('./listener/exchange_order_watchdog_listener');
const ExchangePositionWatcher = require('./exchange/exchange_position_watcher');

const SignalLogger = require('./signal/signal_logger');
const SignalHttp = require('./signal/signal_http');

const SignalRepository = require('./repository/signal_repository');
const CandlestickRepository = require('./repository/candlestick_repository');
const StrategyManager = require('./strategy/strategy_manager');
const ExchangeManager = require('./exchange/exchange_manager');
const InfluxRepository = require('./repository/influx_repository');
const QuarantineRepository = require('./repository/quarantine_repository');

const Trade = require('./trade');
const Http = require('./http');
const Backtest = require('./backtest');
const Backfill = require('./backfill');

const StopLossCalculator = require('./order/stop_loss_calculator');
const RiskRewardRatioCalculator = require('./order/risk_reward_ratio_calculator');
const GridTradingCalculator = require('./order/grid_trading_calculator');
const PairsHttp = require('./pairs/pairs_http');
const OrderExecutor = require('./order/order_executor');
const OrderCalculator = require('./order/order_calculator');
const PairStateManager = require('./pairs/pair_state_manager');
const PairStateExecution = require('./pairs/pair_state_execution');
const PairConfig = require('./pairs/pair_config');
const SystemUtil = require('./system/system_util');
const TechnicalAnalysisValidator = require('../utils/technical_analysis_validator');
const WinstonSqliteTransport = require('../utils/winston_sqlite_transport');
const LogsHttp = require('./system/logs_http');
const LogsRepository = require('./repository/logs_repository');
const TickerLogRepository = require('./repository/ticker_log_repository');
const TickerRepository = require('./repository/ticker_repository');
const CandlestickResample = require('./system/candlestick_resample');
const RequestClient = require('../utils/request_client');
const Throttler = require('../utils/throttler');
const Queue = require('../utils/queue');

const Bitmex = require('../exchange/bitmex');
const BitmexTestnet = require('../exchange/bitmex_testnet');
const Binance = require('../exchange/binance');
const BinanceFutures = require('../exchange/binance_futures');
const BinanceDelivery = require('../exchange/binance_delivery');
const BinanceMargin = require('../exchange/binance_margin');
const Bitfinex = require('../exchange/bitfinex');
const CoinbasePro = require('../exchange/coinbase_pro');
const Noop = require('../exchange/noop');
const Bybit = require('../exchange/bybit');
const FTX = require('../exchange/ftx');

const ExchangeCandleCombine = require('./exchange/exchange_candle_combine');
const CandleExportHttp = require('./system/candle_export_http');
const CandleImporter = require('./system/candle_importer');

const OrdersHttp = require('./orders/orders_http');
const QuarantineHttp = require('./quarantine/quarantine_http');

let db;
let instances;
let config;
let ta;
let eventEmitter;
let logger;
let notify;
let tickers;
let queue;

let candleStickImporter;
let tickerDatabaseListener;
let tickListener;
let createOrderListener;
let exchangeOrderWatchdogListener;

let signalLogger;
let signalHttp;

let signalRepository;
let candlestickRepository;

let influxRepository;

let quarantineHttp;
let quarantineRepository;

let exchangeManager;
let backtest;
let pairStateManager;
let pairStateExecution;

let strategyManager;

let stopLossCalculator;
let riskRewardRatioCalculator;
let gridTradingCalculator;
let pairsHttp;
let orderExecutor;
let orderCalculator;
let systemUtil;
let technicalAnalysisValidator;
let logsHttp;
let logsRepository;
let tickerLogRepository;
let candlestickResample;
let exchanges;
let requestClient;
let exchangeCandleCombine;
let candleExportHttp;
let exchangePositionWatcher;
let tickerRepository;
let ordersHttp;
let pairConfig;
let throttler;

const parameters = {};

module.exports = {
  boot: async function(projectDir) {
    parameters.projectDir = projectDir;

    try {
      instances = require(`${parameters.projectDir}/instance`);
    } catch (e) {
      throw new Error(`Invalid instance.js file. Please check: ${String(e)}`);
    }

    // read configuration first so services and exchanges can be constructed properly
    try {
      config = JSON.parse(fs.readFileSync(`${parameters.projectDir}/conf.json`, 'utf8'));
    } catch (e) {
      throw new Error(`Invalid conf.json file. Please check: ${String(e)}`);
    }

    // ensure DB ready
    this.getDatabase();

    // create ExchangeManager instance (but do NOT call .init() yet - we need symbols first)
    // this will assign the `exchangeManager` variable inside this module
    let mgr;
    try {
      mgr = this.getExchangeManager();
    } catch (e) {
      console.warn('⚠️ Could not create ExchangeManager during boot:', e && e.message ? e.message : e);
    }

    // register the manager with the instances object so instance init can see it.
    try {
      if (mgr && instances && typeof instances.setExchangeManager === 'function') {
        instances.setExchangeManager(mgr);
      } else if (mgr && instances) {
        instances.exchangeManager = mgr;
      }
    } catch (e) {
      // non-fatal: continue but log
      console.warn('⚠️ Failed to register exchange manager on instances:', e && e.message ? e.message : e);
    }

    // boot instance eg to load pairs external (now that exchange manager is registered)
    // This populates instances.symbols with static and dynamic pairs
    if (typeof instances.init === 'function') {
      await instances.init();
    }

    // Log what symbols were loaded
    console.log(`📊 Loaded ${instances.symbols ? instances.symbols.length : 0} symbols for exchanges`);
    if (instances.symbols && instances.symbols.length > 0) {
      const exchanges = [...new Set(instances.symbols.map(s => s.exchange))];
      console.log(`📊 Exchanges with symbols: ${exchanges.join(', ')}`);
    }

    // NOW initialize the exchange manager with the symbols we just loaded
    // This starts the exchanges that have symbols assigned to them
    if (mgr && typeof mgr.init === 'function') {
      try {
        mgr.init();
        console.log('✅ ExchangeManager initialized with loaded symbols');
        const activeExchanges = mgr.all().map(e => e.getName());
        console.log(`✅ Active exchanges after init: ${activeExchanges.join(', ')}`);
      } catch (e) {
        console.warn('⚠️ Could not initialize exchanges in ExchangeManager:', e && e.message ? e.message : e);
      }
    }

    // Wait for exchanges to sync their initial data (positions, orders, etc.)
    console.log('⏳ Waiting for exchanges to sync initial data (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Now that everything is initialized, do a second refresh to actually preserve open positions
    // (The first refresh during instances.init happened before exchanges were ready)
    if (instances.refreshSymbols && typeof instances.refreshSymbols === 'function') {
      try {
        console.log('🔄 Second refresh to capture open positions with initialized exchanges...');
        await instances.refreshSymbols();
      } catch (e) {
        console.warn('⚠️ Second refresh failed:', e && e.message ? e.message : e);
      }
    }
  },

  getDatabase: () => {
    if (db) {
      return db;
    }

    const myDb = Sqlite('bot.db');
    myDb.pragma('journal_mode = WAL');
    myDb.pragma('busy_timeout = 5000');

    myDb.pragma('SYNCHRONOUS = 1;');
    myDb.pragma('LOCKING_MODE = NORMAL;');

    // Auto-create tables if they don't exist (needed on fresh database)
    myDb.exec(`
      CREATE TABLE IF NOT EXISTS candlesticks (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange  VARCHAR(255) NOT NULL,
        symbol    VARCHAR(255) NOT NULL,
        period    VARCHAR(50)  NOT NULL,
        time      INTEGER      NOT NULL,
        open      REAL         NOT NULL,
        high      REAL         NOT NULL,
        low       REAL         NOT NULL,
        close     REAL         NOT NULL,
        volume    REAL         NOT NULL,
        UNIQUE(exchange, symbol, period, time)
      );
      CREATE TABLE IF NOT EXISTS logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid       VARCHAR(255) NOT NULL,
        level      VARCHAR(50)  NOT NULL,
        message    TEXT         NOT NULL,
        created_at INTEGER      NOT NULL
      );
      CREATE TABLE IF NOT EXISTS signals (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange   VARCHAR(255) NOT NULL,
        symbol     VARCHAR(255) NOT NULL,
        options    TEXT         NULL,
        side       VARCHAR(50)  NULL,
        strategy   VARCHAR(255) NULL,
        income_at  INTEGER      NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ticker (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange   VARCHAR(255) NOT NULL,
        symbol     VARCHAR(255) NOT NULL,
        ask        REAL         NOT NULL,
        bid        REAL         NOT NULL,
        updated_at INTEGER      NOT NULL,
        UNIQUE(exchange, symbol)
      );
      CREATE TABLE IF NOT EXISTS ticker_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange   VARCHAR(255) NOT NULL,
        symbol     VARCHAR(255) NOT NULL,
        ask        REAL         NOT NULL,
        bid        REAL         NOT NULL,
        income_at  INTEGER      NOT NULL
      );
    `);

    return (db = myDb);
  },

  getTa: function() {
    if (ta) {
      return ta;
    }

    return (ta = new Ta(this.getCandlestickRepository(), this.getInstances(), this.getTickers()));
  },

  getBacktest: function() {
    if (backtest) {
      return backtest;
    }

    return (backtest = new Backtest(
      this.getInstances(),
      this.getStrategyManager(),
      this.getExchangeCandleCombine(),
      parameters.projectDir
    ));
  },

  getStopLossCalculator: function() {
    if (stopLossCalculator) {
      return stopLossCalculator;
    }

    return (stopLossCalculator = new StopLossCalculator(this.getTickers(), this.getLogger()));
  },

  getGridTradingCalculator: function() {
    if (gridTradingCalculator) {
      return gridTradingCalculator;
    }

    return (gridTradingCalculator = new GridTradingCalculator(this.getCandlestickRepository(), this.getLogger()));
  },

  getRiskRewardRatioCalculator: function() {
    if (riskRewardRatioCalculator) {
      return riskRewardRatioCalculator;
    }

    return (riskRewardRatioCalculator = new RiskRewardRatioCalculator(this.getLogger()));
  },

  getCandleImporter: function() {
    if (candleStickImporter) {
      return candleStickImporter;
    }

    return (candleStickImporter = new CandleImporter(this.getCandlestickRepository()));
  },

  getCreateOrderListener: function() {
    if (createOrderListener) {
      return createOrderListener;
    }

    return (createOrderListener = new CreateOrderListener(this.getExchangeManager(), this.getLogger()));
  },

  getTickListener: function() {
    if (tickListener) {
      return tickListener;
    }

    return (tickListener = new TickListener(
      this.getTickers(),
      this.getInstances(),
      this.getNotifier(),
      this.getSignalLogger(),
      this.getStrategyManager(),
      this.getExchangeManager(),
      this.getPairStateManager(),
      this.getLogger(),
      this.getSystemUtil(),
      this.getOrderExecutor(),
      this.getOrderCalculator()
    ));
  },

  getExchangeOrderWatchdogListener: function() {
    if (exchangeOrderWatchdogListener) {
      return exchangeOrderWatchdogListener;
    }

    return (exchangeOrderWatchdogListener = new ExchangeOrderWatchdogListener(
      this.getExchangeManager(),
      this.getInstances(),
      this.getStopLossCalculator(),
      this.getRiskRewardRatioCalculator(),
      this.getGridTradingCalculator(),
      this.getOrderExecutor(),
      this.getPairStateManager(),
      this.getLogger(),
      this.getTickers(),
      this.getNotifier(),
      this.getThrottler(),
      this.getQuarantineRepository()
    ));
  },

  getTickerDatabaseListener: function() {
    if (tickerDatabaseListener) {
      return tickerDatabaseListener;
    }

    return (tickerDatabaseListener = new TickerDatabaseListener(this.getTickerRepository()));
  },

  getSignalLogger: function() {
    if (signalLogger) {
      return signalLogger;
    }

    return (signalLogger = new SignalLogger(this.getSignalRepository()));
  },

  getSignalHttp: function() {
    if (signalHttp) {
      return signalHttp;
    }

    return (signalHttp = new SignalHttp(this.getSignalRepository()));
  },

  getSignalRepository: function() {
    if (signalRepository) {
      return signalRepository;
    }

    return (signalRepository = new SignalRepository(this.getDatabase()));
  },

  getCandlestickRepository: function() {
    if (candlestickRepository) {
      return candlestickRepository;
    }

    return (candlestickRepository = new CandlestickRepository(this.getDatabase()));
  },

  getInfluxRepository: function() {
    if (influxRepository) {
      return influxRepository;
    }

    if (!config.influx || !config.influx.host) {
      const noop = {
        writeFloat: async () => {},
        queryAggr: async () => [],
      };
      return (influxRepository = noop);
    }

    const { org, host, token, bucket } = config.influx;

    return (influxRepository = new InfluxRepository(host, token, org, bucket, this.getLogger()));
  },

  getQuarantineHttp: function() {
    if (quarantineHttp) {
      return quarantineHttp;
    }

    return (quarantineHttp = new QuarantineHttp(this.getQuarantineRepository()));
  },

  getQuarantineRepository: function() {
    if (quarantineRepository) {
      return quarantineRepository;
    }

    return (quarantineRepository = new QuarantineRepository(this.getDatabase(), this.getEventEmitter()));
  },

  getEventEmitter: function() {
    if (eventEmitter) {
      return eventEmitter;
    }

    return (eventEmitter = new events.EventEmitter());
  },

  getLogger: function() {
    if (logger) {
      return logger;
    }

    return (logger = createLogger({
      format: format.combine(format.timestamp(), format.json()),
      transports: [
        new transports.File({
          filename: `${parameters.projectDir}/var/log/log.log`,
          level: 'debug'
        }),
        new transports.Console({
          level: 'error'
        }),
        new WinstonSqliteTransport({
          level: 'debug',
          database_connection: this.getDatabase(),
          table: 'logs'
        })
      ]
    }));
  },

  getNotifier: function() {
    const notifiers = [];

    // const config = this.getConfig();

    const slack = _.get(config, 'notify.slack');
    if (slack && slack.webhook && slack.webhook.length > 0) {
      notifiers.push(new Slack(slack));
    }

    const mailServer = _.get(config, 'notify.mail.server');
    if (mailServer && mailServer.length > 0) {
      notifiers.push(new Mail(this.createMailer(), this.getSystemUtil(), this.getLogger()));
    }

    const telegram = _.get(config, 'notify.telegram');
    if (telegram && telegram.chat_id && telegram.chat_id.length > 0 && telegram.token && telegram.token.length > 0) {
      notifiers.push(new Telegram(this.createTelegram(), telegram, this.getLogger()));
    }

    notify = new Notify(notifiers);

    return notify;
  },

  getTickers: function() {
    if (tickers) {
      return tickers;
    }

    return (tickers = new Tickers());
  },

  getStrategyManager: function() {
    if (strategyManager) {
      return strategyManager;
    }

    return (strategyManager = new StrategyManager(
      this.getTechnicalAnalysisValidator(),
      this.getExchangeCandleCombine(),
      this.getLogger(),
      parameters.projectDir
    ));
  },

  createWebserverInstance: function() {
    return new Http(
      this.getSystemUtil(),
      this.getTa(),
      this.getSignalHttp(),
      this.getBacktest(),
      this.getExchangeManager(),
      this.getHttpPairs(),
      this.getLogsHttp(),
      this.getCandleExportHttp(),
      this.getCandleImporter(),
      this.getOrdersHttp(),
      this.getTickers(),
      this.getEventEmitter(),
      this.getInfluxRepository(),
      this.getQuarantineHttp(),
      parameters.projectDir
    );
  },

  getExchangeManager: function() {
    if (exchangeManager) {
      return exchangeManager;
    }

    return (exchangeManager = new ExchangeManager(
      this.getExchanges(),
      this.getLogger(),
      this.getInstances(),
      this.getConfig()
    ));
  },

  getOrderExecutor: function() {
    if (orderExecutor) {
      return orderExecutor;
    }

    return (orderExecutor = new OrderExecutor(
      this.getExchangeManager(),
      this.getTickers(),
      this.getSystemUtil(),
      this.getLogger()
    ));
  },

  getOrderCalculator: function() {
    if (orderCalculator) {
      return orderCalculator;
    }

    return (orderCalculator = new OrderCalculator(
      this.getTickers(),
      this.getLogger(),
      this.getExchangeManager(),
      this.getPairConfig()
    ));
  },

  getHttpPairs: function() {
    if (pairsHttp) {
      return pairsHttp;
    }

    return (pairsHttp = new PairsHttp(
      this.getInstances(),
      this.getExchangeManager(),
      this.getPairStateManager(),
      this.getEventEmitter()
    ));
  },

  getPairConfig: function() {
    if (pairConfig) {
      return pairConfig;
    }

    return (pairConfig = new PairConfig(this.getInstances()));
  },

  getPairStateManager: function() {
    if (pairStateManager) {
      return pairStateManager;
    }

    return (pairStateManager = new PairStateManager(
      this.getLogger(),
      this.getPairConfig(),
      this.getSystemUtil(),
      this.getPairStateExecution(),
      this.getOrderExecutor()
    ));
  },

  getPairStateExecution: function() {
    if (pairStateExecution) {
      return pairStateExecution;
    }

    return (pairStateExecution = new PairStateExecution(
      this.getExchangeManager(),
      this.getOrderCalculator(),
      this.getOrderExecutor(),
      this.getLogger(),
      this.getTickers()
    ));
  },

  getSystemUtil: function() {
    if (systemUtil) {
      return systemUtil;
    }

    return (systemUtil = new SystemUtil(this.getConfig()));
  },

  getTechnicalAnalysisValidator: function() {
    if (technicalAnalysisValidator) {
      return technicalAnalysisValidator;
    }

    return (technicalAnalysisValidator = new TechnicalAnalysisValidator());
  },

  getLogsRepository: function() {
    if (logsRepository) {
      return logsRepository;
    }

    return (logsRepository = new LogsRepository(this.getDatabase()));
  },

  getLogsHttp: function() {
    if (logsHttp) {
      return logsHttp;
    }

    return (logsHttp = new LogsHttp(this.getLogsRepository()));
  },

  getTickerLogRepository: function() {
    if (tickerLogRepository) {
      return tickerLogRepository;
    }

    return (tickerLogRepository = new TickerLogRepository(this.getDatabase()));
  },

  getTickerRepository: function() {
    if (tickerRepository) {
      return tickerRepository;
    }

    return (tickerRepository = new TickerRepository(this.getDatabase(), this.getLogger()));
  },

  getCandlestickResample: function() {
    if (candlestickResample) {
      return candlestickResample;
    }

    return (candlestickResample = new CandlestickResample(this.getCandlestickRepository(), this.getCandleImporter()));
  },

  getRequestClient: function() {
    if (requestClient) {
      return requestClient;
    }

    return (requestClient = new RequestClient(this.getLogger()));
  },

  getQueue: function() {
    if (queue) {
      return queue;
    }

    return (queue = new Queue());
  },

  getCandleExportHttp: function() {
    if (candleExportHttp) {
      return candleExportHttp;
    }

    return (candleExportHttp = new CandleExportHttp(this.getCandlestickRepository(), this.getPairConfig()));
  },

  getOrdersHttp: function() {
    if (ordersHttp) {
      return ordersHttp;
    }

    return (ordersHttp = new OrdersHttp(
      this.getBacktest(),
      this.getTickers(),
      this.getOrderExecutor(),
      this.getExchangeManager(),
      this.getPairConfig()
    ));
  },

  getExchangeCandleCombine: function() {
    if (exchangeCandleCombine) {
      return exchangeCandleCombine;
    }

    return (exchangeCandleCombine = new ExchangeCandleCombine(this.getCandlestickRepository()));
  },

  getExchangePositionWatcher: function() {
    if (exchangePositionWatcher) {
      return exchangePositionWatcher;
    }

    return (exchangePositionWatcher = new ExchangePositionWatcher(
      this.getExchangeManager(),
      this.getEventEmitter(),
      this.getLogger()
    ));
  },

  getThrottler: function() {
    if (throttler) {
      return throttler;
    }

    return (throttler = new Throttler(this.getLogger()));
  },

  getExchanges: function() {
    if (exchanges) {
      return exchanges;
    }

    return (exchanges = [
      new Bitmex(
        this.getEventEmitter(),
        this.getRequestClient(),
        this.getCandlestickResample(),
        this.getLogger(),
        this.getQueue(),
        this.getCandleImporter()
      ),
      new BitmexTestnet(
        this.getEventEmitter(),
        this.getRequestClient(),
        this.getCandlestickResample(),
        this.getLogger(),
        this.getQueue(),
        this.getCandleImporter()
      ),
      new Binance(
        this.getEventEmitter(),
        this.getLogger(),
        this.getQueue(),
        this.getCandleImporter(),
        this.getThrottler()
      ),
      new CoinbasePro(
        this.getEventEmitter(),
        this.getLogger(),
        this.getCandlestickResample(),
        this.getQueue(),
        this.getCandleImporter()
      ),
      new Bitfinex(this.getEventEmitter(), this.getLogger(), this.getRequestClient(), this.getCandleImporter()),
      new Bybit(
        this.getEventEmitter(),
        this.getRequestClient(),
        this.getCandlestickResample(),
        this.getLogger(),
        this.getQueue(),
        this.getCandleImporter(),
        this.getThrottler()
      ),
      new FTX(
        this.getEventEmitter(),
        this.getRequestClient(),
        this.getCandlestickResample(),
        this.getLogger(),
        this.getQueue(),
        this.getCandleImporter()
      ),
      new BinanceFutures(
        this.getEventEmitter(),
        this.getRequestClient(),
        this.getCandlestickResample(),
        this.getLogger(),
        this.getQueue(),
        this.getCandleImporter(),
        this.getThrottler(),
        this.getInfluxRepository()
      ),
      new BinanceDelivery(
        this.getEventEmitter(),
        this.getRequestClient(),
        this.getCandlestickResample(),
        this.getLogger(),
        this.getQueue(),
        this.getCandleImporter(),
        this.getThrottler(),
        this.getInfluxRepository()
      ),
      new BinanceMargin(
        this.getEventEmitter(),
        this.getLogger(),
        this.getQueue(),
        this.getCandleImporter(),
        this.getThrottler()
      ),
      new Noop()
    ]);
  },

  createTradeInstance: function() {
    this.getExchangeManager().init();

    return new Trade(
      this.getEventEmitter(),
      this.getInstances(),
      this.getNotifier(),
      this.getLogger(),
      this.getCreateOrderListener(),
      this.getTickListener(),
      this.getTickers(),
      this.getTickerDatabaseListener(),
      this.getExchangeOrderWatchdogListener(),
      this.getSystemUtil(),
      this.getLogsRepository(),
      this.getTickerLogRepository(),
      this.getExchangePositionWatcher(),
      this.getPairStateManager(),
      this.getDatabase()
    );
  },

  getBackfill: function() {
    return new Backfill(this.getExchanges(), this.getCandleImporter());
  },

  createMailer: function() {
    const mail = require('nodemailer');

    // const config = this.getConfig();

    return mail.createTransport(
      `smtps://${config.notify.mail.username}:${config.notify.mail.password}@${config.notify.mail.server}:${config
        .notify.mail.port || 465}`,
      {
        from: config.notify.mail.username
      }
    );
  },

  createTelegram: function() {
    const Telegraf = require('telegraf');
    // const config = this.getConfig();
    const { token } = config.notify.telegram;

    if (!token) {
      throw new Error('Telegram: No api token given');
    }

    return new Telegraf(token);
  },

  getInstances: () => {
    return instances;
  },

  getConfig: () => {
    return config;
  }
};
