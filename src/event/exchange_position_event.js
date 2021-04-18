module.exports = class ExchangePositionEvent {
  static get EVENT_NAME() {
    return 'exchange_position';
  }

  constructor(exchange, position, state) {
    this.exchange = exchange;
    this.position = position;
    this.state = state;
  }
};
