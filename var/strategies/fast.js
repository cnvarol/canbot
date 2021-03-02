const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'fast';
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('candles', 'candles', options.period);
  }

  async period(indicatorPeriod) {
    const long = Math.floor(Math.random() * 10) < 6;
    const short = !long;

    const lastSignal = indicatorPeriod.getLastSignal();

    console.log(long, short, lastSignal);

    const debug = {
      last_signal: lastSignal,
      profit: indicatorPeriod.getProfit()
    };

    if (lastSignal === 'long') {
      return SignalResult.createSignal('close_long', debug);
    }

    if (lastSignal === 'short') {
      return SignalResult.createSignal('close_short', debug);
    }

    if (long) {
      return SignalResult.createSignal('long', debug);
    }

    if (short) {
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
