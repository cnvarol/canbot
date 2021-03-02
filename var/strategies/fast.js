const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'fast';
  }

  buildIndicator(indicatorBuilder, options) {
    indicatorBuilder.add('candles', 'candles', options.period);
  }

  async period(indicatorPeriod, options) {
    const long = Math.floor(Math.random() * 10) < 6;
    const short = !long;

    const lastSignal = indicatorPeriod.getLastSignal();

    const debug = {
      last_signal: lastSignal,
      profit: indicatorPeriod.getProfit()
    };

    if (lastSignal === 'long') {
      // return SignalResult.createSignal('close_long', debug);

      const context = indicatorPeriod.getStrategyContext();
      const price = indicatorPeriod.getPrice();
      const emptySignal = SignalResult.createEmptySignal(debug);

      if (!price || !options.amount_currency) {
        throw new Error('Strategy (sar) place order parameter error!');
      }

      emptySignal.addDebug('long', price);

      if (context.isBacktest()) {
        emptySignal.setSignal('long');
      }

      emptySignal.placeLongOrder(options.amount_currency, price);

      return emptySignal;
    }

    if (lastSignal === 'short') {
      // return SignalResult.createSignal('close_short', debug);

      const context = indicatorPeriod.getStrategyContext();
      const price = indicatorPeriod.getPrice();
      const emptySignal = SignalResult.createEmptySignal(debug);

      if (!price || !options.amount_currency) {
        throw new Error('Strategy (fast) place order parameter error!');
      }

      emptySignal.addDebug('short', price);

      if (context.isBacktest()) {
        emptySignal.setSignal('short');
      }

      emptySignal.placeShortOrder(options.amount_currency, price);

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
    return [];
  }

  getOptions() {
    return {
      period: '1m',
      amount_currency: 100
    };
  }

  getTickPeriod() {
    return '1m';
  }
};
