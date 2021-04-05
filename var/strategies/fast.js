const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'fast';
  }

  buildIndicator(indicatorBuilder) {
    indicatorBuilder.add('rsi', 'rsi', '1m');
    indicatorBuilder.add('macd', 'macd_ext', '15m', {
      default_ma_type: 'EMA',
      fast_period: 12,
      slow_period: 26,
      signal_period: 9
    });
  }

  async period(indicatorPeriod) {
    const rsi = indicatorPeriod.getLatestIndicator('rsi');
    const macdFull = indicatorPeriod.getIndicator('macd');

    if (!rsi || !macdFull) {
      return undefined;
    }

    const macd = macdFull.slice(-2);
    const current = macd[0].histogram;
    const before = macd[1].histogram;

    const rsiP = 0.1 * (rsi - 50);
    const fisher_rsi = (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);

    // diverse signal
    let long = fisher_rsi <= -0.9 || before < current;
    let short = fisher_rsi >= 0.9 || before > current;

    if (!long && !short) {
      long = Math.floor(Math.random() * 10) < 5;
      short = !long;
    }

    const lastSignal = indicatorPeriod.getLastSignal();

    const debug = {
      last_signal: lastSignal,
      rsi: rsi,
      fisher_rsi: fisher_rsi,
      macd_current: current,
      macd_before: before,
      profit: indicatorPeriod.getProfit()
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

    if (context.isBacktest() && lastSignal === 'long' && long && profit <= -5) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('long');

      return emptySignal;
    }

    if (context.isBacktest() && lastSignal === 'short' && short && profit <= -5) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('short');

      return emptySignal;
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
      period: '1m'
    };
  }

  getTickPeriod() {
    return '1m';
  }
};
