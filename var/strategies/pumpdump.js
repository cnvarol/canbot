const { SMA } = require('technicalindicators');
const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'pumpdump';
  }

  pumpCatcher(candles) {
    if (candles.length < 40) {
      return false;
    }

    if (candles.length > 1 && candles[0].time > candles[1].time) {
      return false;
    }

    const candleSizeSma = SMA.calculate({
      period: 40,
      values: candles.slice(-80).map(v => Math.abs(v.open - v.close))
    });

    return (candles.slice(-1)[0].open - candles.slice(-1)[0].close) / candleSizeSma.slice(-1)[0] < -5;
  }

  dumpCatcher(candles) {
    if (candles.length < 40) {
      return false;
    }

    if (candles.length > 1 && candles[0].time > candles[1].time) {
      return false;
    }

    const candleSizeSma = SMA.calculate({
      period: 40,
      values: candles.slice(-80).map(v => Math.abs(v.open - v.low))
    });

    return (candles.slice(-1)[0].open - candles.slice(-1)[0].low) / candleSizeSma.slice(-1)[0] > 5;
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('rsi', 'rsi', options.period);
    indicatorBuilder.add('candles', 'candles', options.period);
  }

  async period(indicatorPeriod) {
    const rsi = indicatorPeriod.getLatestIndicator('rsi');
    const allCandles = indicatorPeriod.getIndicator('candles');

    if (!rsi || !allCandles) {
      return undefined;
    }

    const pump = this.pumpCatcher(allCandles);
    const dump = this.dumpCatcher(allCandles);

    const rsiP = 0.1 * (rsi - 50);
    const fisher_rsi = (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);

    const long = fisher_rsi >= 0.7 && pump;
    const short = fisher_rsi <= -0.7 && dump;

    const lastSignal = indicatorPeriod.getLastSignal();

    const debug = {
      last_signal: lastSignal,
      rsi: rsi,
      fisher_rsi: fisher_rsi,
      dump: dump,
      pump: pump
    };

    if (!lastSignal && long) {
      return SignalResult.createSignal('long', debug);
    }

    if (!lastSignal && short) {
      return SignalResult.createSignal('short', debug);
    }

    const context = indicatorPeriod.getStrategyContext();
    const profit = indicatorPeriod.getProfit();

    if (context.isBacktest() && lastSignal === 'short' && profit >= 1) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('close_short');

      return emptySignal;
    }

    if (context.isBacktest() && lastSignal === 'long' && profit >= 1) {
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
