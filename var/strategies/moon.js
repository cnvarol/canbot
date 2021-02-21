const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'moon';
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('candles', 'candles', options.period);
    indicatorBuilder.add('rsi', 'rsi', options.period);
    indicatorBuilder.add('mfi', 'mfi', options.period);
    indicatorBuilder.add('stoch', 'stoch', options.period)
    indicatorBuilder.add('macd', 'macd_ext', options.period, options);
    indicatorBuilder.add('bb', 'bb', options.period);
    indicatorBuilder.add('adx', 'adx', options.period);
  }

  async period(indicatorPeriod) {
    const adxFull = indicatorPeriod.getIndicator('adx').slice(-2, -1);
    const rsiFull = indicatorPeriod.getIndicator('rsi').slice(-3);
    const stochFull = indicatorPeriod.getIndicator('stoch').slice(-2, -1);
    const mfiFull = indicatorPeriod.getIndicator('mfi').slice(-2, -1);
    const macdFull = indicatorPeriod.getIndicator('macd').slice(-2, -1);
    const bbFull = indicatorPeriod.getIndicator('bb').slice(-2, -1);
    const candleFull = indicatorPeriod.getIndicator('candles').slice(-2, -1);

    if (!mfiFull || !stochFull || !rsiFull || !macdFull || !bbFull || !candleFull || !adxFull) {
      return undefined;
    }

    const adx = adxFull[0];
    const stoch = stochFull[0];
    const mfi = mfiFull[0];
    const macd = macdFull[0];
    const bb = bbFull[0];
    const candle = candleFull[0];

    const rsi = rsiFull[2];
    const rsi1 = rsiFull[1];
    const rsi2 = rsiFull[0];

    if (!stoch || !bb || !macd || !candle || !rsi2 || !mfi || !adx) {
      return undefined;
    }

    const fastd = stoch['stoch_d'];

    const long = rsi > rsi2 & rsi2 < 16 & fastd < 15 & mfi < 21 & adx > 46 & candle.open < bb.lower;
    const short = rsi < rsi2 & fastd > 90 & rsi2 > 75 & mfi > 80 & adx > 46 & candle.close > bb.upper;

    //const short = fastd > 80 & rsi > 68 & macd.macd < macd.signal;

    const longClose = fastd > 80 & rsi > 65;
    const shortClose = fastd < 20 & rsi < 35;

    /*const rsiP = 0.1 * (rsi2 - 50)
    const fisher_rsi = (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);

    const longClose = fisher_rsi > 0.3;
    const shortClose = fisher_rsi < -0.3;*/

    const debug = {
      rsi2: rsi2,
      rsi1: rsi1,
      rsi: rsi,
      adx: adx,
      fastd: fastd,
      mfi: mfi,
      macd_signal: macd.signal,
      macd: macd.macd,
      bb: bb,
      candle: candle
    }

    const lastSignal = indicatorPeriod.getLastSignal();
    if ((lastSignal === 'long' && short) || (lastSignal === 'short' && long)) {
      return SignalResult.createSignal('close', debug);
    }


    if ((lastSignal === 'long' && longClose && indicatorPeriod.getProfit() > 0) || (lastSignal === 'short' && shortClose && indicatorPeriod.getProfit() > 0)) {
      return SignalResult.createSignal('close', debug);
    }

    if (lastSignal === 'long' && indicatorPeriod.getProfit() < 0 && long) {
      return SignalResult.createSignal('long', debug);
    }

    if (lastSignal === 'short' && indicatorPeriod.getProfit() < 0 && short) {
      return SignalResult.createSignal('short', debug);
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
        label: 'Trigger Long',
        value: 'bb.lower',
        type: 'cross',
        cross: 'candle.open'
      },
      {
        label: 'Trigger Short',
        value: 'bb.upper',
        type: 'cross',
        cross: 'candle.high'
      },
      {
        label: 'Cross RSI',
        value: 'rsi',
        type: 'cross',
        cross: 'rsi2'
      },
      {
        label: 'RSI',
        value: 'rsi2',
        type: 'oscillator'
      },
      {
        label: 'Stoch Fastd',
        value: 'fastd',
        type: 'oscillator'
      },
      {
        label: 'MFI',
        value: 'mfi',
        type: 'oscillator'
      },
      {
        label: 'ADX',
        value: 'adx',
        type: 'oscillator'
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

