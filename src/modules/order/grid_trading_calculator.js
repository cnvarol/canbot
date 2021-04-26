const ExchangeOrder = require('../../dict/exchange_order');
const OrderUtil = require('../../utils/order_util');

module.exports = class GridTradingCalculator {
  constructor(logger) {
    this.logger = logger;
  }

  checkDuplicateOrders(position, orders) {
    let ordersCheck;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      ordersCheck = orders.filter(
        order =>
          (order.type === ExchangeOrder.TYPE_LIMIT ||
            order.type === ExchangeOrder.TYPE_STOP ||
            order.type === ExchangeOrder.TYPE_TAKE_PROFIT) &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      ordersCheck = orders.filter(
        order =>
          order.type === ExchangeOrder.TYPE_LIMIT ||
          order.type === ExchangeOrder.TYPE_STOP ||
          order.type === ExchangeOrder.TYPE_TAKE_PROFIT
      );
    }

    const orderAmounts = new Set();
    const orderPrices = new Set();
    const duplicateOrders = [];

    ordersCheck.forEach(order => {
      const duplicateAmount = orderAmounts.has(order.amount);
      const duplicatePrice = orderPrices.has(order.price);

      if (duplicateAmount && duplicatePrice) {
        duplicateOrders.push(order);
        return;
      }

      orderAmounts.add(order.amount);
      orderPrices.add(order.price);
    });

    return duplicateOrders;
  }

  calculateForOpenPosition(position, options) {
    let entryPrice = position.entry;
    const size = Math.abs(position.amount * position.entry);

    if (!entryPrice) {
      this.logger.info(`Invalid entryPrice for grid trading:${JSON.stringify(position)}`);
      return undefined;
    }

    const result = {
      stopPrice: undefined,
      targetPrice: undefined
    };

    entryPrice = Math.abs(entryPrice);

    const step_percent = Math.sqrt(size / options.step_resolution);
    const hedge_step_percent = Math.sqrt(size / options.hedge_step_resolution);

    if (position.side === 'long') {
      result.targetPrice = entryPrice * (1 - step_percent / 100);
      result.stopPrice = entryPrice * (1 + hedge_step_percent / 100);
    } else {
      result.targetPrice = entryPrice * (1 + step_percent / 100);
      result.stopPrice = entryPrice * (1 - hedge_step_percent / 100);
    }

    return result;
  }

  async syncGridTradingOrders(position, orders, options) {
    const newOrders = {};
    const result = this.calculateForOpenPosition(position, options);

    let stopOrders;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      stopOrders = orders.filter(
        order =>
          (order.type === ExchangeOrder.TYPE_STOP || order.type === ExchangeOrder.TYPE_TAKE_PROFIT) &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      stopOrders = orders.filter(
        order => order.type === ExchangeOrder.TYPE_STOP || order.type === ExchangeOrder.TYPE_TAKE_PROFIT
      );
    }

    if (stopOrders.length === 0) {
      newOrders.stop = {
        amount: Math.abs(position.amount),
        price: result.stopPrice
      };

      // inverse price for lose long position via sell
      if (position.side === 'short') {
        // eslint-disable-next-line operator-assignment
        newOrders.stop.price = newOrders.stop.price * -1;
      }
    } else {
      // update order
      const stopOrder = stopOrders[0];

      // only +1% amount change is important for us
      if (OrderUtil.isPercentDifferentGreaterThen(position.amount, stopOrder.amount, 1)) {
        let amount = Math.abs(position.amount);
        if (position.isShort()) {
          amount *= -1;
        }

        newOrders.stop = {
          id: stopOrder.id,
          amount: amount
        };
      }
    }

    let targetOrders;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      targetOrders = orders.filter(
        order => order.type === ExchangeOrder.TYPE_LIMIT && order.positionSide === position.raw.positionSide
      );
    } else {
      targetOrders = orders.filter(order => order.type === ExchangeOrder.TYPE_LIMIT);
    }

    if (targetOrders.length === 0) {
      newOrders.target = {
        amount: Math.abs(position.amount),
        price: result.targetPrice
      };

      if (position.side === 'short') {
        // eslint-disable-next-line operator-assignment
        newOrders.target.price = newOrders.target.price * -1;
      }
    } else {
      // update order
      const targetOrder = targetOrders[0];

      // only +1% amount change is important for us
      if (OrderUtil.isPercentDifferentGreaterThen(position.amount, targetOrder.amount, 1)) {
        let amount = Math.abs(position.amount);
        if (position.isShort()) {
          amount *= -1;
        }

        newOrders.target = {
          id: targetOrder.id,
          amount: amount
        };
      }
    }

    return newOrders;
  }

  async createGridTradingOrders(position, orders, options) {
    const currentOrders = await this.syncGridTradingOrders(position, orders, options);

    const newOrders = [];
    if (currentOrders.target) {
      if (currentOrders.target.id) {
        newOrders.push({
          id: currentOrders.target.id,
          price: currentOrders.target.price,
          amount: currentOrders.target.amount,
          type: 'target'
        });
      } else {
        newOrders.push({
          price: currentOrders.target.price || undefined,
          amount: currentOrders.target.amount || undefined,
          type: 'target'
        });
      }
    }

    if (currentOrders.stop) {
      if (currentOrders.stop.id) {
        newOrders.push({
          id: currentOrders.stop.id,
          price: currentOrders.stop.price,
          amount: currentOrders.stop.amount,
          type: 'stop'
        });
      } else {
        newOrders.push({
          price: currentOrders.stop.price,
          amount: currentOrders.stop.amount,
          type: 'stop'
        });
      }
    }

    return newOrders;
  }
};
