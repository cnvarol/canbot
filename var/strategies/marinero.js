const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'marinero';
  }

  buildIndicator(indicatorBuilder) {
    indicatorBuilder.add('rsi', 'rsi', '3m');
  }

  async period(indicatorPeriod) {
    const rsi = indicatorPeriod.getLatestIndicator('rsi');

    if (!rsi) {
      return undefined;
    }

    const rsiP = 0.1 * (rsi - 50);
    const fisher_rsi = (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);

    // diverse signal
    const long = fisher_rsi <= -0.8;
    const short = fisher_rsi >= 0.8;

    const lastSignal = indicatorPeriod.getLastSignal();

    const debug = {
      last_signal: lastSignal,
      rsi: rsi,
      fisher_rsi: fisher_rsi
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
    return [
      {
        label: 'macd',
        value: 'macd_current',
        type: 'histogram'
      }
    ];
  }

  getOptions() {
    return {
      period: '3m'
    };
  }

  getTickPeriod() {
    return '3m';
  }
};
