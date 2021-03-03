const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'fast';
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('candles', 'candles', options.period);
    indicatorBuilder.add('ao', 'ao', options.period);
  }

  async period(indicatorPeriod) {
    const ao = indicatorPeriod.getLatestIndicator('ao');

    if (!ao) {
      return undefined;
    }

    const long = ao > 0;
    const short = !long;

    const lastSignal = indicatorPeriod.getLastSignal();

    const debug = {
      last_signal: lastSignal,
      ao: ao,
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
