/* eslint-disable no-param-reassign */
/* eslint-disable no-await-in-loop */
const moment = require('moment');
const orderUtil = require('../../utils/order_util');
const Order = require('../../dict/order');
const ExchangeOrder = require('../../dict/exchange_order');

module.exports = class ExchangeOrderWatchdogListener {
  constructor(
    exchangeManager,
    instances,
    stopLossCalculator,
    riskRewardRatioCalculator,
    gridTradingCalculator,
    orderExecutor,
    pairStateManager,
    logger,
    tickers,
    notifier,
    throttler,
    quarantineRepository
  ) {
    this.exchangeManager = exchangeManager;
    this.instances = instances;
    this.stopLossCalculator = stopLossCalculator;
    this.riskRewardRatioCalculator = riskRewardRatioCalculator;
    this.gridTradingCalculator = gridTradingCalculator;
    this.orderExecutor = orderExecutor;
    this.pairStateManager = pairStateManager;
    this.logger = logger;
    this.tickers = tickers;
    this.notifier = notifier;
    this.notified = {};
    this.orders = {};
    this.quarantine = {};
    this.throttler = throttler;
    this.quarantineRepository = quarantineRepository;

    this.fillQuarantinelist();
  }

  onTick() {
    const { instances } = this;

    this.exchangeManager.all().forEach(async exchange => {
      const positions = await exchange.getPositions();

      if (positions.length === 0) {
        return;
      }

      positions.forEach(async position => {
        const pair = instances.symbols.find(
          instance => instance.exchange === exchange.getName() && instance.symbol === position.symbol
        );

        if (!pair || !pair.watchdogs) {
          return;
        }

        if (!this.pairStateManager.isNeutral(exchange.getName(), position.symbol)) {
          this.logger.debug(
            `Watchdog: block for action in place: ${JSON.stringify({
              exchange: exchange.getName(),
              symbol: position.symbol
            })}`
          );

          return;
        }

        const stopLoss = pair.watchdogs.find(watchdog => watchdog.name === 'stoploss');
        if (stopLoss) {
          await this.stopLossWatchdog(exchange, position, stopLoss);
        }

        const gridTrading = pair.watchdogs.find(watchdog => watchdog.name === 'grid_trading');
        if (gridTrading) {
          await this.gridTradingWatchdog(exchange, position, gridTrading);
        }

        const riskRewardRatio = pair.watchdogs.find(watchdog => watchdog.name === 'risk_reward_ratio');
        if (riskRewardRatio) {
          await this.riskRewardRatioWatchdog(exchange, position, riskRewardRatio);
        }

        const stoplossWatch = pair.watchdogs.find(watchdog => watchdog.name === 'stoploss_watch');
        if (stoplossWatch) {
          await this.stoplossWatch(exchange, position, stoplossWatch);
        }

        const trailingStoplossWatch = pair.watchdogs.find(watchdog => watchdog.name === 'trailing_stop');
        if (trailingStoplossWatch) {
          await this.trailingStoplossWatch(exchange, position, trailingStoplossWatch);
        }
      });
    });
  }

  async onPositionChanged(positionStateChangeEvent) {
    if (!positionStateChangeEvent.isClosed()) {
      return;
    }

    const exchangeName = positionStateChangeEvent.getExchange();
    const symbol = positionStateChangeEvent.getSymbol();
    const side = positionStateChangeEvent.getSide();

    const pair = this.instances.symbols.find(
      instance => instance.exchange === exchangeName && instance.symbol === symbol
    );

    if (!pair || !pair.watchdogs) {
      return;
    }

    const found = pair.watchdogs.find(watchdog =>
      ['trailing_stop', 'stoploss', 'risk_reward_ratio', 'grid_trading'].includes(watchdog.name)
    );
    if (!found) {
      return;
    }

    this.logger.info(`Watchdog: position closed cleanup orders: ${JSON.stringify([exchangeName, symbol, side])}`);

    const qKey = `${exchangeName}:${symbol}:${side}`;
    delete this.quarantine[qKey];
    this.quarantineRepository.delete(exchangeName, symbol, side);

    await this.orderExecutor.cancelSide(exchangeName, symbol, side);
  }

  async onQuarantineAdd(quarantineEvent) {
    const qKey = `${quarantineEvent.exchange}:${quarantineEvent.symbol}:${quarantineEvent.side}`;
    this.quarantine[qKey] = new Date();

    await this.orderExecutor.cancelSide(quarantineEvent.exchange, quarantineEvent.symbol, quarantineEvent.side);
  }

  async onQuarantineDelete(quarantineEvent) {
    const qKey = `${quarantineEvent.exchange}:${quarantineEvent.symbol}:${quarantineEvent.side}`;
    delete this.quarantine[qKey];
  }

  async fillQuarantinelist() {
    const rows = await this.quarantineRepository.getAll();

    rows.forEach(async r => {
      const qKey = `${r.exchange}:${r.symbol}:${r.side}`;
      this.quarantine[qKey] = new Date();

      await this.orderExecutor.cancelSide(r.exchange, r.symbol, r.side);
    });
  }

  /**
   * @param exchange
   * @param position {Position}
   * @param stopLoss
   * @returns {Promise<void>}
   */
  async stopLossWatchdog(exchange, position, stopLoss) {
    const { logger } = this;
    const { stopLossCalculator } = this;

    const orders = await exchange.getOrdersForSymbol(position.getSymbol());
    const orderChanges = orderUtil.syncStopLossOrder(position, orders);

    orderChanges.forEach(async orderChange => {
      logger.info(
        `Stoploss update: ${JSON.stringify({
          order: orderChange,
          symbol: position.getSymbol(),
          exchange: exchange.getName()
        })}`
      );

      // update
      if (orderChange.id) {
        let amount = Math.abs(orderChange.amount);
        if (position.isLong()) {
          amount *= -1;
        }

        try {
          await exchange.updateOrder(orderChange.id, Order.createUpdateOrder(orderChange.id, undefined, amount));
        } catch (e) {
          logger.error(
            `Stoploss update error${JSON.stringify({
              error: e,
              orderChange: orderChange
            })}`
          );
        }

        return;
      }

      // create
      let price = stopLossCalculator.calculateForOpenPosition(exchange.getName(), position, stopLoss);
      if (!price) {
        console.log('Stop loss: auto price skipping');
        return;
      }

      price = exchange.calculatePrice(price, position.getSymbol());
      if (!price) {
        console.log('Stop loss: auto price skipping');
        return;
      }

      const order = Order.createStopLossOrder(position.getSymbol(), price, orderChange.amount);

      try {
        await exchange.order(order);
      } catch (e) {
        logger.error(
          `Stoploss create${JSON.stringify({
            error: e,
            order: order
          })}`
        );
      }
    });
  }

  async gridTradingWatchdog(
    exchange,
    position,
    options = {
      hedge_position: false,
      hedge_min_percent: -1,
      hedge_max_percent: -10,
      hedge_profit_mode: false,
      hedge_take_profit: 3,
      take_profit: 1,
      trailing_stop_rate: 1,
      step_resolution: 25,
      hedge_step_resolution: 5,
      risk_notify: true,
      risk_size: 5000,
      risk_take_profit: 0.75,
      quarantine_after: 1000 * 1000,
      pump_detection: false,
      pump_candle_period: '15m',
      stop_loss_mode: 0
    }
  ) {
    const { logger } = this;
    /* const { instances } = this;

    const pair = instances.symbols.find(
      instance => instance.exchange === exchange.getName() && instance.symbol === position.symbol
    );

    let capital = 1000; // default
    if (pair.trade && pair.trade.currency_capital) {
      capital = pair.trade.currency_capital;
    } */

    if (
      this.throttler.inTasks('binance_futures_sync_orders') ||
      this.throttler.inTasks('binance_futures_sync_positions')
    ) {
      /* this.logger.debug(
        `Grid trading: Binance futures important tasks in queue, wait for 3s for position ${position.symbol} - ${position.side}`
      ); */
      setTimeout(async () => {
        await this.gridTradingWatchdog(exchange, position, options);
      }, 3000);

      return;
    }

    const symbol = position.getSymbol();
    const orders = await exchange.getOrdersForSymbol(symbol);
    const currentPositions = await exchange.getPositionForSymbol(symbol);
    const size = position.raw.size
      ? Math.abs(position.raw.size).toFixed(2)
      : Math.abs(position.amount * position.entry).toFixed(2);

    if (
      Array.isArray(currentPositions) &&
      options.hedge_position &&
      position.profit < options.hedge_min_percent &&
      position.profit > options.hedge_max_percent
    ) {
      // if (currentPositions.length < 2 && Math.abs(position.amount * position.entry) < capital * 1.5) {
      if (currentPositions.length < 2 && size < options.risk_size) {
        const fisher_rsi = await this.gridTradingCalculator.fisherRSICalculate(exchange.getName(), symbol, '15m');

        if ((position.side === 'long' && fisher_rsi >= 0.9) || (position.side === 'short' && fisher_rsi <= -0.97)) {
          let amount = Math.abs(position.amount);
          if (position.side === 'long') {
            amount *= -1;
          } else {
            amount *= 1;
          }

          const side = position.side === Order.SIDE_LONG ? Order.SIDE_SHORT : Order.SIDE_LONG;

          const orderFound =
            orders.filter(
              order =>
                order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET &&
                order.positionSide === side.toUpperCase() &&
                !order.reduceOnly
            ).length > 0;

          if (!orderFound && position.markPrice) {
            const hedgeOrder = Order.createTrailingStopMarketOrder(
              symbol,
              side,
              side === 'long' ? position.markPrice * 0.998 : position.markPrice * 1.002,
              amount,
              Math.round((options.trailing_stop_rate / 2) * 10) / 10,
              false
            );

            await this.orderExecutor.executeOrder(exchange.getName(), hedgeOrder);

            logger.info(
              `Grid Trading: opening hedge order: ${JSON.stringify({
                hedgeOrder: hedgeOrder,
                exchange: exchange.getName(),
                symbol: symbol,
                current_side: position.side,
                fisher_rsi: fisher_rsi
              })}`
            );
          }
        }
      }
    }

    let { profit } = position;
    let totalSize = size;

    /* let hedgeProfitFound = false;
    let hedgePosition = null; */

    if (Array.isArray(currentPositions)) {
      profit = 0;
      totalSize = 0;
      let pnl = 0;

      currentPositions.forEach(p => {
        const psize = p.raw.size ? Math.abs(p.raw.size).toFixed(2) : Math.abs(p.amount * p.entry).toFixed(2);
        /* if (
          options.hedge_profit_mode &&
          p.side !== position.side &&
          position.profit < 0 &&
          Math.abs(position.amount) * 1.5 > pamount &&
          p.profit >= options.hedge_take_profit
        ) {
          hedgeProfitFound = true;
          hedgePosition = p;
        } */

        totalSize += psize;
        if (p.raw && p.raw.unRealizedProfit) {
          pnl += parseFloat(p.raw.unRealizedProfit);
        }
      });

      profit = (pnl / totalSize) * 100;
    }

    if (
      !options.hedge_profit_mode &&
      (profit >= options.take_profit || (size >= options.risk_size && profit >= options.risk_take_profit))
    ) {
      if (Array.isArray(currentPositions)) {
        currentPositions.forEach(async p => {
          const marketOrder = Order.createMarketOrder(symbol, p.amount, p.side, { close: true });
          await this.orderExecutor.executeOrder(exchange.getName(), marketOrder);
        });
      } else {
        const marketOrder = Order.createMarketOrder(symbol, position.amount, position.side, { close: true });
        await this.orderExecutor.executeOrder(exchange.getName(), marketOrder);
      }

      logger.info(
        `Grid Trading: take profit closing: ${JSON.stringify({
          symbol: symbol,
          exchange: exchange.getName(),
          profit: profit.toFixed(2)
        })}`
      );

      return;
    }

    /* if (hedgeProfitFound && hedgePosition) {
      const marketOrder = Order.createMarketOrder(symbol, hedgePosition.amount, hedgePosition.side, { close: true });
      await this.orderExecutor.executeOrder(exchange.getName(), marketOrder);

      logger.info(
        `Grid Trading: hedge take profit closing: ${JSON.stringify({
          symbol: symbol,
          exchange: exchange.getName(),
          position: hedgePosition
        })}`
      );

      return;
    } */

    if (options.risk_notify && size >= options.risk_size) {
      const warnWindow = moment()
        .subtract(180, 'minutes')
        .toDate();

      const noteKey = position.exchange + position.symbol + position.side + size;
      if (!(noteKey in this.notified) || (noteKey in this.notified && this.notified[noteKey] < warnWindow)) {
        this.notifier.send(
          `Position size of ${position.symbol.replace('_', '')} on ${
            position.side
          } side too large.\nPlease await from significant losses.\nCurrent Size: $*${size}*`
        );

        this.notified[noteKey] = new Date();
      }
    }

    // check duplicate orders
    let duplicateOrders = this.gridTradingCalculator.checkDuplicateStopOrders(position, orders);
    duplicateOrders = duplicateOrders.concat(this.gridTradingCalculator.checkDuplicateLimitOrders(position, orders));

    duplicateOrders.forEach(async order => {
      logger.error(
        `Grid Trading: found duplicate order: ${JSON.stringify({
          order: order,
          symbol: symbol,
          exchange: exchange.getName()
        })}`
      );
      try {
        await exchange.cancelOrder(order.id);
      } catch (e) {
        logger.error(
          `Grid Trading: duplicate order cancel error: ${JSON.stringify({
            order: order,
            symbol: symbol,
            exchange: exchange.getName(),
            error: e.message
          })}`
        );
      }
    });

    const qKey = `${exchange.getName()}:${position.symbol}:${position.side}`;

    if (!(qKey in this.quarantine) && options.pump_detection && position.side === 'short') {
      const result = await this.gridTradingCalculator.pumpPattern(
        exchange.getName(),
        position.symbol,
        options.pump_candle_period
      );

      if (result.roc_ma || size >= options.quarantine_after) {
        this.quarantine[qKey] = new Date();

        await this.orderExecutor.cancelSide(exchange.getName(), position.symbol, position.side);

        const reason = result.roc_ma ? 'Pump detected' : 'Risk size detected';
        this.quarantineRepository.insert(exchange.getName(), position.symbol, position.side, reason);

        this.notifier.send(
          `${reason} for position ${position.symbol} on ${position.side} side.\nAll orders cancelled. *Crypto Bot* won't manage this position anymore. You need to check this position status manually.\nCurrent Size: $*${size}*`
        );

        return;
      }
    }

    if (!(qKey in this.quarantine) && options.pump_detection && position.side === 'long') {
      const result = await this.gridTradingCalculator.dumpPattern(
        exchange.getName(),
        position.symbol,
        options.pump_candle_period
      );

      if (result.roc_ma || size >= options.quarantine_after) {
        this.quarantine[qKey] = new Date();

        await this.orderExecutor.cancelSide(exchange.getName(), position.symbol, position.side);

        const reason = result.roc_ma ? 'Dump detected' : 'Risk size detected';
        this.quarantineRepository.insert(exchange.getName(), position.symbol, position.side, reason);

        this.notifier.send(
          `${reason} for position ${position.symbol} on ${position.side} side.\nAll orders cancelled. *Crypto Bot* won't manage this position anymore. You need to check this position status manually.\nCurrent Size: $*${size}*`
        );

        return;
      }
    }

    const orderChanges = await this.gridTradingCalculator.createGridTradingOrders(position, orders, options);

    orderChanges.forEach(async orderChange => {
      // update
      if (orderChange.id && String(orderChange.id).length > 0) {
        logger.info(
          `Grid Trading: order update: ${JSON.stringify({
            orderChange: orderChange,
            symbol: symbol,
            exchange: exchange.getName()
          })}`
        );

        try {
          await exchange.cancelOrder(orderChange.id);
        } catch (e) {
          logger.error(
            `Grid Trading: order cancel error: ${JSON.stringify({
              orderChange: orderChange,
              symbol: symbol,
              exchange: exchange.getName(),
              error: e.message
            })}`
          );
        }

        return;
      }

      if (options.hedge_profit_mode && orderChange.type === 'stop') {
        orderChange.type = 'trailing_stop';
        orderChange.price *= -1;
      }

      const price = exchange.calculatePrice(orderChange.price, symbol);
      if (!price) {
        logger.error(
          `Grid Trading: Invalid price: ${JSON.stringify({
            orderChange: orderChange,
            symbol: symbol,
            exchange: exchange.getName()
          })}`
        );

        return;
      }

      const orderKey = position.exchange + position.symbol + position.side + orderChange.type;
      if (orderKey in this.orders && this.orders[orderKey].price === orderChange.price) {
        // lets check the order changing in next tick.
        this.orders[orderKey].price = 0;
        return;
      }

      this.orders[orderKey] = { price: orderChange.price };

      // we need to normalize the price here: more general solution?
      let ourOrder;
      if (orderChange.type === 'trailing_stop') {
        if (options.stop_loss_mode > 0 && position.profit >= options.stop_loss_mode) {
          ourOrder = Order.createStopLossOrder(symbol, orderChange.price, orderChange.amount);
        } else {
          ourOrder = Order.createTrailingStopMarketOrder(
            symbol,
            position.side,
            orderChange.price,
            orderChange.amount,
            options.trailing_stop_rate
          );
        }
      } else if (orderChange.type === 'stop') {
        ourOrder = Order.createStopOrder(symbol, position.side, orderChange.price, orderChange.amount);
      } else if (qKey in this.quarantine) {
        return;
      } else {
        ourOrder = Order.createTrailingStopMarketOrder(
          symbol,
          position.side,
          orderChange.price,
          orderChange.amount,
          options.trailing_stop_rate,
          false
        );
      }

      ourOrder.price = price;

      await this.orderExecutor.executeOrder(exchange.getName(), ourOrder);

      logger.info(
        `Grid Trading: order create: ${JSON.stringify({
          orderChange: orderChange,
          symbol: symbol,
          exchange: exchange.getName()
        })}`
      );
    });
  }

  async riskRewardRatioWatchdog(exchange, position, riskRewardRatioOptions) {
    const { logger } = this;

    if (
      this.throttler.inTasks('binance_futures_sync_orders') ||
      this.throttler.inTasks('binance_futures_sync_positions')
    ) {
      this.logger.debug(
        `Risk Reward: Binance futures important tasks in queue, wait for 3s for position ${position.symbol} - ${position.side}`
      );
      setTimeout(async () => {
        await this.riskRewardRatioWatchdog(exchange, position, riskRewardRatioOptions);
      }, 3000);

      return;
    }

    const symbol = position.getSymbol();
    const orders = await exchange.getOrdersForSymbol(symbol);
    const orderChanges = await this.riskRewardRatioCalculator.createRiskRewardOrdersOrders(
      position,
      orders,
      riskRewardRatioOptions
    );

    orderChanges.forEach(async orderChange => {
      logger.info(
        `Risk Reward: needed order change detected: ${JSON.stringify({
          orderChange: orderChange,
          symbol: symbol,
          exchange: exchange.getName()
        })}`
      );

      // update
      if (orderChange.id && String(orderChange.id).length > 0) {
        logger.info(
          `Risk Reward: order update: ${JSON.stringify({
            orderChange: orderChange,
            symbol: symbol,
            exchange: exchange.getName()
          })}`
        );

        try {
          await exchange.updateOrder(
            orderChange.id,
            Order.createUpdateOrder(
              orderChange.target.id,
              orderChange.target.price || undefined,
              orderChange.target.amount || undefined
            )
          );
        } catch (e) {
          await exchange.cancelOrder(orderChange.id);
          logger.info(
            `Risk Reward: order update error: ${JSON.stringify({
              orderChange: orderChange,
              symbol: symbol,
              exchange: exchange.getName(),
              message: e
            })}`
          );
        }

        return;
      }

      const price = exchange.calculatePrice(orderChange.price, symbol);
      if (!price) {
        logger.error(
          `Risk Reward: Invalid price: ${JSON.stringify({
            orderChange: orderChange,
            symbol: symbol,
            exchange: exchange.getName()
          })}`
        );

        return;
      }

      // we need to normalize the price here: more general solution?
      logger.info(
        `Risk Reward: order create: ${JSON.stringify({
          orderChange: orderChange,
          symbol: symbol,
          exchange: exchange.getName()
        })}`
      );

      const ourOrder =
        orderChange.type === 'stop'
          ? Order.createStopLossOrder(symbol, orderChange.price, orderChange.amount)
          : Order.createCloseLimitPostOnlyReduceOrder(symbol, orderChange.price, orderChange.amount);

      ourOrder.price = price;

      await this.orderExecutor.executeOrder(exchange.getName(), ourOrder);
    });
  }

  async stoplossWatch(exchange, position, config) {
    if (!config.stop || config.stop < 0.1 || config.stop > 50) {
      this.logger.error('Stoploss Watcher: invalid stop configuration need "0.1" - "50"');
      return;
    }

    if (typeof position.entry === 'undefined') {
      this.logger.error(`Stoploss Watcher: no entry for position: ${JSON.stringify(position)}`);
      return;
    }

    const ticker = this.tickers.get(exchange.getName(), position.symbol);
    if (!ticker) {
      this.logger.error(`Stoploss Watcher: no ticker found ${JSON.stringify([exchange.getName(), position.symbol])}`);
      return;
    }

    let profit;
    const stopProfit = parseFloat(config.stop);
    if (position.side === 'long') {
      if (ticker.bid < position.entry) {
        profit = (ticker.bid / position.entry - 1) * 100;
      }
    } else if (position.side === 'short') {
      if (ticker.ask > position.entry) {
        profit = (position.entry / ticker.ask - 1) * 100;
      }
    } else {
      throw new Error(`Invalid side`);
    }

    if (typeof profit === 'undefined' || profit > 0) {
      return;
    }

    // TODO: provide cancel if price recovered !?

    const maxLoss = Math.abs(stopProfit) * -1;
    if (profit < maxLoss) {
      this.logger.info(
        `Stoploss Watcher: stop triggered: ${JSON.stringify([
          exchange.getName(),
          position.symbol,
          maxLoss.toFixed(2),
          profit.toFixed(2)
        ])}`
      );
      this.pairStateManager.update(exchange.getName(), position.symbol, position.side, 'close');
    }
  }

  async trailingStoplossWatch(exchange, position, config) {
    const { logger, stopLossCalculator } = this;

    if (
      !config.target_percent ||
      config.target_percent < 0.1 ||
      config.target_percent > 50 ||
      !config.stop_percent ||
      config.stop_percent < 0.1 ||
      config.stop_percent > 50
    ) {
      this.logger.error('Stoploss Watcher: invalid stop configuration need "0.1" - "50"');
      return;
    }

    if (typeof position.entry === 'undefined') {
      this.logger.error(`Stoploss Watcher: no entry for position: ${JSON.stringify(position)}`);
      return;
    }

    const orders = await exchange.getOrdersForSymbol(position.symbol);
    const orderChanges = orderUtil.syncTrailingStopLossOrder(position, orders);
    await Promise.all(
      orderChanges.map(async orderChange => {
        if (orderChange.id) {
          // update

          let amount = Math.abs(orderChange.amount);
          if (position.isLong()) {
            amount *= -1;
          }

          return exchange.updateOrder(orderChange.id, Order.createUpdateOrder(orderChange.id, undefined, amount));
        }
        // create if target profit reached

        // calculate activation price, undefined if it is not reached yet.
        const activationPrice = await stopLossCalculator.calculateForOpenPosition(exchange.getName(), position, {
          percent: -config.target_percent
        });

        if (!activationPrice) {
          return undefined;
        }

        const exchangeSymbol = position.symbol.substring(0, 3).toUpperCase();
        let trailingOffset = (activationPrice * parseFloat(config.stop_percent)) / 100;
        trailingOffset = exchange.calculatePrice(trailingOffset, exchangeSymbol);
        const order = Order.createTrailingStopLossOrder(position.symbol, trailingOffset, orderChange.amount);

        return exchange.order(order);
      })
    )
      .then(results => {
        logger.info(
          `Trailing stop loss: ${JSON.stringify({
            results: results,
            exchange: exchange.getName()
          })}`
        );
      })
      .catch(e => {
        logger.error(`Trailing stoploss create${JSON.stringify(e)}`);
      });
  }
};
