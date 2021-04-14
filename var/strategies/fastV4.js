const SignalResult = require('../../src/modules/strategy/dict/signal_result');

module.exports = class {
  getName() {
    return 'fastV4';
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
    let long = fisher_rsi < -0.9 || (before < current && before < 0);
    let short = fisher_rsi > 0.9 || (before > current && before > 0);

    if (!long && !short) {
      long = rsi < 30;
      short = rsi > 80;
    }

    const currentPosition = indicatorPeriod.getLastSignal();

    const debug = {
      last_signal: currentPosition,
      rsi: rsi,
      fisher_rsi: fisher_rsi,
      macd_current: current,
      macd_before: before,
      profit: indicatorPeriod.getProfit()
    };

    if (!currentPosition && long) {
      return SignalResult.createSignal('long', debug);
    }

    if (!currentPosition && short) {
      return SignalResult.createSignal('short', debug);
    }

    const context = indicatorPeriod.getStrategyContext();
    const profit = indicatorPeriod.getProfit();

    if (currentPosition === 'short' && long && profit >= 1) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('close_short');

      return emptySignal;
    }

    if (currentPosition === 'long' && short && profit >= 1) {
      const emptySignal = SignalResult.createEmptySignal(debug);
      emptySignal.setSignal('close_long');

      return emptySignal;
    }

    const size = Math.abs(context.getAmount() * context.getEntry());
    const risk_profit = (size ** 1.02 / 700 ** 1.04) * -1;

    debug.risk_profit = risk_profit;
    debug.amount = Math.abs(context.getAmount());
    debug.entryPrice = Math.abs(context.getEntry());
    debug.size = size;

    if (currentPosition && indicatorPeriod.getProfit() < risk_profit) {
      const price = indicatorPeriod.getPrice();
      const emptySignal = SignalResult.createEmptySignal(debug);

      const amount = Math.abs(context.getAmount());

      if (!price || !amount) {
        throw new Error('Strategy (sar) place order parameter error!');
      }

      const amount_currency = amount * price;

      if (currentPosition === 'long') {
        emptySignal.addDebug('long', price);

        if (context.isBacktest()) {
          emptySignal.setSignal('long');
        }

        emptySignal.placeLongOrder(amount_currency, price);
      }

      if (currentPosition === 'short') {
        emptySignal.addDebug('short', price);

        if (context.isBacktest()) {
          emptySignal.setSignal('short');
        }

        emptySignal.placeShortOrder(amount_currency, price);
      }

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
      period: '15m'
    };
  }

  getTickPeriod() {
    return '15m';
  }
};
