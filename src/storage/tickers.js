const moment = require('moment');

module.exports = class Tickers {
  constructor() {
    this.tickers = {};
  }

  set(ticker) {
    this.tickers[`${ticker.exchange}.${ticker.symbol}`] = ticker;
  }

  get(exchange, symbol) {
    return this.tickers[`${exchange}.${symbol}`] || null;
  }

  getIfUpToDate(exchange, symbol, lastUpdatedSinceMs) {
    if (!lastUpdatedSinceMs) {
      throw new Error('Invalid ms argument given');
    }

    const tickerName = `${exchange}.${symbol}`;
    if (!(tickerName in this.tickers)) {
      return undefined;
    }

    return this.tickers[tickerName] &&
      this.tickers[tickerName].createdAt >
        moment()
          .subtract(lastUpdatedSinceMs, 'ms')
          .toDate()
      ? this.tickers[tickerName]
      : undefined;
  }

  all() {
    return this.tickers;
  }
};
