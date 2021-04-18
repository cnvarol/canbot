const Position = require('./position');

module.exports = class ExchangePosition {
  constructor(exchange, position) {
    if (!(position instanceof Position)) {
      throw 'TypeError: invalid position';
    }

    this.exchange = exchange;
    this.position = position;
  }

  // TODO(semih): it may need or not check later :${this.position.side}
  getKey() {
    return `${this.exchange}:${this.position.symbol}:${this.position.side}`;
  }

  getExchange() {
    return this.exchange;
  }

  getPosition() {
    return this.position;
  }

  getSymbol() {
    return this.position.symbol;
  }
};
