const moment = require('moment');
const orderUtil = require('../../utils/order_util');
const Order = require('../../dict/order');

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
    notifier
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

    this.logger.info(`Watchdog: position closed cleanup orders: ${JSON.stringify([exchangeName, symbol])}`);
    await this.orderExecutor.cancelAll(exchangeName, positionStateChangeEvent.getSymbol());
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

  async gridTradingWatchdog(exchange, position, options) {
    // TODO(semihalev): currently no limit for steps, limit this.

    const { logger } = this;

    const symbol = position.getSymbol();
    const orders = await exchange.getOrdersForSymbol(symbol);
    const currentPositions = await exchange.getPositionForSymbol(symbol);

    if (Array.isArray(currentPositions) && options.hedge_position && position.profit < options.hedge_percent) {
      if (currentPositions.length < 2) {
        let amount = Math.abs(position.amount);
        if (position.side === 'long') {
          amount *= -2;
        } else {
          amount *= 2;
        }

        const side = position.side === Order.SIDE_LONG ? Order.SIDE_SHORT : Order.SIDE_LONG;
        const hedgeOrder = Order.createMarketOrder(symbol, amount, side);
        await this.orderExecutor.executeOrder(exchange.getName(), hedgeOrder);

        logger.info(
          `Grid Trading: opening hedge position: ${JSON.stringify({
            hedgeOrder: hedgeOrder,
            symbol: symbol,
            exchange: exchange.getName()
          })}`
        );
      }
    }

    let { profit } = position;
    let amount = Math.abs(position.amount);

    if (Array.isArray(currentPositions)) {
      profit = 0;
      amount = 0;
      let pnl = 0;

      currentPositions.forEach(p => {
        amount += Math.abs(p.amount) * p.entry;
        if (p.raw && p.raw.unRealizedProfit) {
          pnl += parseFloat(p.raw.unRealizedProfit);
        }
      });

      profit = (pnl / amount) * 100;
    }

    if (profit >= options.take_profit || (amount >= options.risk_size && profit >= options.risk_take_profit)) {
      // close position/s with market order
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

    const size = Math.abs(position.amount * position.entry).toFixed(2);
    if (options.risk_notify && size >= options.risk_size) {
      const warnWindow = moment()
        .subtract(15, 'minutes')
        .toDate();

      const noteKey = position.exchange + position.symbol + position.side + size;
      if (!(noteKey in this.notified) || (noteKey in this.notified && this.notified[noteKey] < warnWindow)) {
        this.notifier.send(
          `Position size of ${position.symbol} too large.\nPlease await from significant losses.\nCurrent Size: ${size} USDT`
        );

        this.notified[noteKey] = new Date();
      }
    }

    // check duplicate orders
    const duplicateOrders = this.gridTradingCalculator.checkDuplicateOrders(position, orders);

    duplicateOrders.forEach(async order => {
      logger.error(
        `Grid Trading: found duplicate order: ${JSON.stringify({
          order: order,
          symbol: symbol,
          exchange: exchange.getName()
        })}`
      );
      await exchange.cancelOrder(order.id);
    });

    const orderChanges = await this.gridTradingCalculator.createGridTradingOrders(position, orders, options);

    orderChanges.forEach(async orderChange => {
      logger.info(
        `Grid Trading: needed order change detected: ${JSON.stringify({
          orderChange: orderChange,
          symbol: symbol,
          exchange: exchange.getName()
        })}`
      );

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
          logger.info(
            `Grid Trading: order cancel error: ${JSON.stringify({
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
      logger.info(
        `Grid Trading: order create: ${JSON.stringify({
          orderChange: orderChange,
          symbol: symbol,
          exchange: exchange.getName()
        })}`
      );

      // const ourOrder = Order.createLimitPostOnlyOrder(symbol, position.side, orderChange.price, orderChange.amount);

      const ourOrder =
        orderChange.type === 'stop'
          ? Order.createStopOrder(symbol, position.side, orderChange.price, orderChange.amount)
          : Order.createLimitPostOnlyOrder(symbol, position.side, orderChange.price, orderChange.amount);

      ourOrder.price = price;

      await this.orderExecutor.executeOrder(exchange.getName(), ourOrder);
    });
  }

  async riskRewardRatioWatchdog(exchange, position, riskRewardRatioOptions) {
    const { logger } = this;

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
