const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'short';
  }

  buildIndicator(indicatorBuilder) {}

  async period(indicatorPeriod) {
    const debug = { short: true };

    const lastSignal = indicatorPeriod.getLastSignal();
    if (!lastSignal) {
      return SignalResult.createSignal('short', debug);
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
