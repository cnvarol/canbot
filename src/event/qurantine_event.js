module.exports = class QuarantineEvent {
  constructor(exchange, symbol, side) {
    this.exchange = exchange;
    this.symbol = symbol;
    this.side = side;
  }
};
