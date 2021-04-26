const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'long';
  }

  buildIndicator(indicatorBuilder) {
    indicatorBuilder.add('rsi', 'rsi', '1m');
  }

  async period(indicatorPeriod) {
    const debug = { long: true };

    const lastSignal = indicatorPeriod.getLastSignal();
    if (!lastSignal) {
      return SignalResult.createSignal('long', debug);
    }

    return SignalResult.createEmptySignal(debug);
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
