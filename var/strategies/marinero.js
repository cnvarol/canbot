const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'marinero';
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('rsi', 'rsi', options.period);
    indicatorBuilder.add('mfi', 'mfi', options.period);
    indicatorBuilder.add('adx', 'adx', options.period);
  }

  async period(indicatorPeriod) {
    const rsi = indicatorPeriod.getLatestIndicator('rsi');
    const mfi = indicatorPeriod.getLatestIndicator('mfi');
    const adx = indicatorPeriod.getLatestIndicator('adx');

    if (!rsi || !mfi || !adx) {
      return undefined;
    }

    const rsiP = 0.1 * (rsi - 50);
    const fisher_rsi = (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);

    const long = fisher_rsi <= -0.9;
    const short = fisher_rsi >= 0.99 && adx > 40 && mfi > 80;

    const lastSignal = indicatorPeriod.getLastSignal();

    const debug = {
      last_signal: lastSignal,
      rsi: rsi,
      fisher_rsi: fisher_rsi,
      adx: adx,
      mfi: mfi
    };

    if (!lastSignal && long) {
      return SignalResult.createSignal('long', debug);
    }

    if (!lastSignal && short) {
      return SignalResult.createSignal('short', debug);
    }

    const context = indicatorPeriod.getStrategyContext();
    const profit = indicatorPeriod.getProfit();

    if (context.isBacktest() && lastSignal === 'short' && long && profit >= 1) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('close_short');

      return emptySignal;
    }

    if (context.isBacktest() && lastSignal === 'long' && short && profit >= 1) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('close_long');

      return emptySignal;
    }

    if (context.isBacktest() && lastSignal === 'long' && long && profit <= -3) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('long');

      return emptySignal;
    }

    if (context.isBacktest() && lastSignal === 'short' && short && profit <= -3) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('short');

      return emptySignal;
    }

    return SignalResult.createEmptySignal(debug);
  }

  getBacktestColumns() {
    return [
      {
        label: 'fisher_rsi',
        value: 'fisher_rsi',
        type: 'histogram'
      }
    ];
  }

  getOptions() {
    return {
      period: '15m'
    };
  }

  getTickPeriod() {
    return '3m';
  }
};
