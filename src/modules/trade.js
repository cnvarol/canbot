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
    pairStateManager
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
  }

  start() {
    this.logger.debug('Trade module started');

    const instanceId = crypto.randomBytes(4).toString('hex');

    process.on('SIGINT', async () => {
      setTimeout(() => {
        process.exit(0);
      }, 2000); // may 7500 if pairStateManager active

      console.log('Stopping...');

      // await this.pairStateManager.onTerminate();

      const message = `Stop (${'SIGINT'}): ${instanceId} - ${os.hostname()} - ${os.platform()} - ${moment().format()}`;

      this.notify.send(message);
      // process.exit();
    });

    // TODO (semihalev): open this comment later
    /* process.on('uncaughtException', (err, origin) => {
      const message = `UncaughtException (${origin}): ${instanceId} - ${os.hostname()} - ${os.platform()} - ${moment().format()} ${err}`;

      this.notify.send(message);
    }); */

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
      }, 10000);

      // order create tick
      setInterval(() => {
        eventEmitter.emit('signal_tick', {});
      }, this.systemUtil.getConfig('tick.signal', 10600));

      setInterval(() => {
        eventEmitter.emit('watchdog', {});
      }, this.systemUtil.getConfig('tick.watchdog', 30800));

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
  }
};
