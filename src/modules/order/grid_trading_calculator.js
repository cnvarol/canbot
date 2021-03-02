const Order = require('../../dict/order');
const ExchangeOrder = require('../../dict/exchange_order');
const OrderUtil = require('../../utils/order_util');

module.exports = class GridTradingCalculator {
  constructor(logger) {
    this.logger = logger;
  }

  async createGridTradingOrders(position, orders, options) {
    return [];
  }
};
