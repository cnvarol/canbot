const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'sar';
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('candles', 'candles', options.period);
    indicatorBuilder.add('rsi', 'rsi', options.period);
    indicatorBuilder.add('mfi', 'mfi', options.period);
    indicatorBuilder.add('stoch', 'stoch', options.period);
    indicatorBuilder.add('sma', 'sma', options.period);
    indicatorBuilder.add('sar', 'psar', options.period, { step: 0.04, max: 0.4 });
    indicatorBuilder.add('bb', 'bb', options.period);
    indicatorBuilder.add('adx', 'adx', options.period);
  }

  async period(indicatorPeriod, options) {
    const bb = indicatorPeriod.getLatestIndicator('bb');
    const adx = indicatorPeriod.getLatestIndicator('adx');
    const rsi = indicatorPeriod.getLatestIndicator('rsi');
    const stoch = indicatorPeriod.getLatestIndicator('stoch');
    const mfi = indicatorPeriod.getLatestIndicator('mfi');
    const sma = indicatorPeriod.getLatestIndicator('sma');
    const sar = indicatorPeriod.getLatestIndicator('sar');
    const candle = indicatorPeriod.getLatestIndicator('candles');
    const candlesFull = indicatorPeriod.getIndicator('candles');

    if (!mfi || !stoch || !rsi || !sma || !sar || !candle || !bb || !adx) {
      return undefined;
    }

    const lastCandles = candlesFull.slice(-4, -1);
    let decline = false;

    for (let i = 0; i < lastCandles.length; i++) {
      if (lastCandles[i].high > lastCandles[i].close * 1.025) {
        decline = true;
      }
    }

    const changePercent = 100 - (lastCandles[3].close / candle.close) * 100;

    const fastd = stoch.stoch_d;
    const fastk = stoch.stoch_k;

    const rsiP = 0.1 * (rsi - 50);
    const fisher_rsi = (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);

    const lastSignal = indicatorPeriod.getLastSignal();
    let multiplier = 1;
    if (lastSignal && indicatorPeriod.getProfit() < -5) {
      multiplier = Math.abs(indicatorPeriod.getProfit()) / 2;
    }

    const long =
      rsi < 25 && fastd > 0 && sma * multiplier > candle.close && fisher_rsi <= -0.94 && mfi < 33 && adx > 20;

    const short =
      (fastd > 70 || fastk > 70) &&
      fisher_rsi >= 0.86 &&
      sar * multiplier > candle.close &&
      decline &&
      adx > 30 &&
      mfi > 67;

    const longClose = fisher_rsi > 0.5 && fastd > 67;
    const shortClose = fisher_rsi < -0.4 && sar > candle.close;

    const debug = {
      rsi: rsi,
      fisher_rsi: fisher_rsi,
      bb: bb,
      fastd: fastd,
      fastk: fastk,
      mfi: mfi,
      sar: sar,
      sma: sma,
      adx: adx,
      candle: candle
    };

    if ((lastSignal === 'long' && short) || (lastSignal === 'short' && long)) {
      return SignalResult.createSignal('close', debug);
    }

    if (
      (lastSignal === 'long' && longClose && indicatorPeriod.getProfit() > 0) ||
      (lastSignal === 'short' && shortClose && indicatorPeriod.getProfit() > 0)
    ) {
      return SignalResult.createSignal('close', debug);
    }

    if (lastSignal && (long || short) && indicatorPeriod.getProfit() <= -2) {
      const context = indicatorPeriod.getStrategyContext();
      const price = indicatorPeriod.getPrice();
      const emptySignal = SignalResult.createEmptySignal(debug);

      if (!price || !options.amount_currency) {
        throw new Error('Strategy (sar) place order parameter error!');
      }

      if (lastSignal === 'long' && long && changePercent <= -2) {
        emptySignal.addDebug('long', price);

        if (context.isBacktest()) {
          emptySignal.setSignal('long');
        }

        emptySignal.placeLongOrder(options.amount_currency, price);
      }

      if (lastSignal === 'short' && short && changePercent >= 2) {
        emptySignal.addDebug('short', price);

        if (context.isBacktest()) {
          emptySignal.setSignal('short');
        }

        emptySignal.placeShortOrder(options.amount_currency, price);
      }

      return emptySignal;
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
    return [
      {
        label: 'RSI',
        value: 'rsi',
        type: 'oscillator'
      },
      {
        label: 'Stoch Fastd',
        value: 'fastd',
        type: 'oscillator'
      },
      {
        label: 'Stoch Fastk',
        value: 'fastk',
        type: 'oscillator'
      },
      {
        label: 'MFI',
        value: 'mfi',
        type: 'oscillator'
      },
      {
        label: 'Fisher RSI',
        value: 'fisher_rsi'
      }
    ];
  }

  getOptions() {
    return {
      period: '15m',
      amount_currency: 2500
    };
  }

  getTickPeriod() {
    return '15m';
  }
};
