const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'fast';
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('candles', 'candles', options.period);
    indicatorBuilder.add('rsi', 'rsi', options.period);
  }

  async period(indicatorPeriod) {
    const rsi = indicatorPeriod.getLatestIndicator('rsi');

    if (!rsi) {
      return undefined;
    }

    const rsiP = 0.1 * (rsi - 50);
    const fisher_rsi = (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);

    // diverse signal
    let short = fisher_rsi < -0.7;
    let long = fisher_rsi > 0.7;

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
