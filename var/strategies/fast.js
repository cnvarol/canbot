const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'fast';
  }

  buildIndicator(indicatorBuilder) {
    indicatorBuilder.add('rsi', 'rsi', '15m');
    indicatorBuilder.add('btc_macd', 'macd', '15m', { exchange: 'binance_futures', symbol: 'BTCUSDT' });
  }

  async period(indicatorPeriod) {
    const rsi = indicatorPeriod.getLatestIndicator('rsi');
    const btcMACDFull = indicatorPeriod.getIndicator('btc_macd');

    if (!rsi || !btcMACDFull) {
      return undefined;
    }

    const btcMACD = btcMACDFull.slice(-2);
    const currentBTC = btcMACD[0].histogram;
    const beforeBTC = btcMACD[1].histogram;

    const rsiP = 0.1 * (rsi - 50);
    const fisher_rsi = (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);

    // diverse signal
    let long = fisher_rsi < -0.9 || (beforeBTC < 0 && currentBTC > 0);
    let short = fisher_rsi > 0.9 || (beforeBTC > 0 && currentBTC < 0);

    if (!long && !short) {
      long = Math.floor(Math.random() * 10) < 5;
      short = !long;
    }

    const lastSignal = indicatorPeriod.getLastSignal();

    const debug = {
      last_signal: lastSignal,
      rsi: rsi,
      fisher_rsi: fisher_rsi,
      profit: indicatorPeriod.getProfit()
    };

    if (!lastSignal && long) {
      return SignalResult.createSignal('long', debug);
    }

    if (!lastSignal && short) {
      return SignalResult.createSignal('short', debug);
    }

    return SignalResult.createEmptySignal(debug);
  }

  getBacktestColumns() {
    return [];
  }

  getOptions() {
    return {
      period: '1m'
    };
  }

  getTickPeriod() {
    return '1m';
  }
};
