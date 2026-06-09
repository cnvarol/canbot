const moment = require('moment');
const crypto = require('crypto');
const os = require('os');
const PositionStateChangeEvent = require('../event/position_state_change_event');

module.exports = class Trade {
  constructor(
    eventEmitter,
    instances,
    notify,
    logger,
    createOrderListener,
    tickListener,
    tickers,
    tickerDatabaseListener,
    exchangeOrderWatchdogListener,
    systemUtil,
    logsRepository,
    tickerLogRepository,
    exchangePositionWatcher,
    pairStateManager,
    database
  ) {
    this.eventEmitter = eventEmitter;
    this.instances = instances;
    this.notify = notify;
    this.logger = logger;
    this.createOrderListener = createOrderListener;
    this.tickListener = tickListener;
    this.tickers = tickers;
    this.tickerDatabaseListener = tickerDatabaseListener;
    this.exchangeOrderWatchdogListener = exchangeOrderWatchdogListener;
    this.systemUtil = systemUtil;
    this.logsRepository = logsRepository;
    this.tickerLogRepository = tickerLogRepository;
    this.exchangePositionWatcher = exchangePositionWatcher;
    this.pairStateManager = pairStateManager;
    this.database = database;
  }

  start() {
    this.logger.debug('Trade module started');

    const instanceId = crypto.randomBytes(4).toString('hex');

    process.on('SIGINT', async () => {
      console.log('Stopping...');

      try {
        await this.pairStateManager.onTerminate();
      } catch (e) {
        console.error('Error canceling orders:', e.message);
      }

      try {
        this.database.pragma('wal_checkpoint(RESTART)');
        this.database.close();
      } catch (e) {
        console.error('Error closing database:', e.message);
      }

      const message = `Stop (${'SIGINT'}): ${instanceId} - ${os.hostname()} - ${os.platform()} - ${moment().format()}`;

      this.notify.send(message);

      setTimeout(() => {
        process.exit(0);
      }, 2000);
    });

    this.startDatabaseMaintenance();

    // TODO (semihalev): open this comment later
    process.on('uncaughtException', (err, origin) => {
      const message = `UncaughtException (${origin}): ${instanceId} - ${os.hostname()} - ${os.platform()} - ${moment().format()} 
      ${err.message}`;

      this.notify.send(message);

      console.error(err);
    });

    /* this.logger.on('error', async err => {
      this.notify.send(err);
    }); */

    const message = `Start: ${instanceId} - ${os.hostname()} - ${os.platform()} - ${moment().format()}`;

    this.notify.send(message);

    const me = this;
    const { eventEmitter } = this;

    setTimeout(async () => {
      await me.tickListener.botTelegramCommands();
    }, 1000);

    // let the system bootup; eg let the candle be filled by exchanges
    setTimeout(() => {
      console.log('Trade module: warmup done; starting ticks');
      this.logger.info('Trade module: warmup done; starting ticks');

      setTimeout(async () => {
        await me.tickListener.startStrategyIntervals();
      }, 1000);

      setInterval(async () => {
        eventEmitter.emit('warncheck_tick', {});
        await me.tickListener.warnCheckInterval();
      }, 7500);

      // order create tick
      setInterval(() => {
        eventEmitter.emit('signal_tick', {});
      }, this.systemUtil.getConfig('tick.signal', 10600));

      setInterval(() => {
        eventEmitter.emit('watchdog', {});
      }, this.systemUtil.getConfig('tick.watchdog', 20000));

      setInterval(() => {
        eventEmitter.emit('tick_ordering', {});
      }, this.systemUtil.getConfig('tick.ordering', 10800));
    }, this.systemUtil.getConfig('tick.warmup', 30000));

    // cronjob like tasks
    setInterval(async () => {
      await me.logsRepository.cleanOldLogEntries();
      await me.tickerLogRepository.cleanOldLogEntries();

      me.logger.debug('Logs: Cleanup old entries');
    }, 86455000);

    const { tickers } = this;

    eventEmitter.on('ticker', async function(tickerEvent) {
      tickers.set(tickerEvent.ticker);
      me.tickerDatabaseListener.onTicker(tickerEvent);
    });

    /* eventEmitter.on('orderbook', function(orderbookEvent) {
      console.log(orderbookEvent.orderbook);
    }); */

    eventEmitter.on('order', async event => me.createOrderListener.onCreateOrder(event));

    eventEmitter.on('tick', async () => {
      me.tickListener.onTick();
    });

    eventEmitter.on('watchdog', async () => {
      me.exchangeOrderWatchdogListener.onTick();
      await me.exchangePositionWatcher.onPositionStateChangeTick();
    });

    eventEmitter.on(PositionStateChangeEvent.EVENT_NAME, async event => {
      await me.exchangeOrderWatchdogListener.onPositionChanged(event);
    });

    eventEmitter.on('quarantine_add', async event => {
      await me.exchangeOrderWatchdogListener.onQuarantineAdd(event);
    });

    eventEmitter.on('quarantine_delete', async event => {
      await me.exchangeOrderWatchdogListener.onQuarantineDelete(event);
    });
  }

  startDatabaseMaintenance() {
    const runIntegrityCheck = () => {
      try {
        const result = this.database.pragma('integrity_check');
        if (result && result[0] && result[0].integrity_check !== 'ok') {
          this.logger.error(`DB integrity check failed: ${JSON.stringify(result)}`);
          this.notify.send(`DB integrity check FAILED: ${JSON.stringify(result)}`);
        }
      } catch (e) {
        this.logger.error(`DB integrity check error: ${e.message}`);
      }
    };

    runIntegrityCheck();

    setInterval(() => {
      runIntegrityCheck();
    }, 21600000);
  }
};
