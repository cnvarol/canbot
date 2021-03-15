const ExchangeOrder = require('../../dict/exchange_order');
const OrderUtil = require('../../utils/order_util');

module.exports = class GridTradingCalculator {
  constructor(logger) {
    this.logger = logger;
  }

  calculateForOpenPosition(position, options = { step_percent: 5 }) {
    let entryPrice = position.entry;
    const size = Math.abs(position.amount * position.entry);

    if (!entryPrice) {
      this.logger.info(`Invalid entryPrice for grid trading:${JSON.stringify(position)}`);
      return undefined;
    }

    let targetPrice;

    entryPrice = Math.abs(entryPrice);

    if (size >= options.risk_size) {
      if (position.side === 'long') {
        targetPrice = entryPrice * (1 - options.risk_step_percent / 100);
      } else {
        targetPrice = entryPrice * (1 + options.risk_step_percent / 100);
      }

      return targetPrice;
    }

    if (position.side === 'long') {
      targetPrice = entryPrice * (1 - options.step_percent / 100);
    } else {
      targetPrice = entryPrice * (1 + options.step_percent / 100);
    }

    return targetPrice;
  }

  async syncGridTradingOrders(position, orders, options) {
    const newOrders = {};
    const targetPrice = this.calculateForOpenPosition(position, options);

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
        price: targetPrice
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
          amount: currentOrders.target.amount
        });
      } else {
        newOrders.push({
          price: currentOrders.target.price || undefined,
          amount: currentOrders.target.amount || undefined,
          type: 'target'
        });
      }
    }

    return newOrders;
  }
};
