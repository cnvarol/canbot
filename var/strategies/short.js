const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'short';
  }

  buildIndicator(indicatorBuilder) {
  }

  async period(indicatorPeriod) {
    const debug = { short: true };

    if (!lastSignal) {
      return SignalResult.createSignal('short', debug);
    }
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
