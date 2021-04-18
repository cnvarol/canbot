module.exports = class ExchangeOrderEvent {
  static get EVENT_NAME() {
    return 'exchange_order';
  }

  constructor(exchange, order) {
    this.exchange = exchange;
    this.order = order;
  }
};
