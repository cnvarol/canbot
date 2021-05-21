const { SMA } = require('technicalindicators');

module.exports = {
  /**
   * @param candles
   */
  volumePump: candles => {
    if (candles.length < 20) {
      return {};
    }

    if (candles.length > 1 && candles[0].time > candles[1].time) {
      throw new Error('Invalid candlestick order');
    }

    const volSma = SMA.calculate({
      period: 20,
      values: candles.slice(-40).map(b => b.volume)
    });

    const candleSizeSma = SMA.calculate({
      period: 20,
      values: candles.slice(-40).map(v => Math.abs(v.open - v.close))
    });

    const currentCandle = candles.slice(-1)[0];
    const currentVolumeSma = volSma.slice(-1)[0];

    return {
      time: new Date(currentCandle.time * 1000).toLocaleString('tr-TR'),
      volume_sd: volSma.slice(-1)[0],
      volume_v: currentCandle.volume / currentVolumeSma,
      hint: currentCandle.volume / currentVolumeSma > 5 ? 'success' : undefined,
      price_open: currentCandle.open,
      price_close: currentCandle.close,
      roc: (candles.slice(-1)[0].open - candles.slice(-1)[0].close) / candleSizeSma.slice(-1)[0],
      roc_ma:
        (candles.slice(-1)[0].open - candles.slice(-1)[0].close) / candleSizeSma.slice(-1)[0] < -5
          ? 'success'
          : undefined
    };
  },

  volumeDump: candles => {
    if (candles.length < 40) {
      return {};
    }

    if (candles.length > 1 && candles[0].time > candles[1].time) {
      throw new Error('Invalid candlestick order');
    }

    const volSma = SMA.calculate({
      period: 40,
      values: candles.slice(-80).map(b => b.volume)
    });

    const candleSizeSma = SMA.calculate({
      period: 40,
      values: candles.slice(-80).map(v => Math.abs(v.open - v.low))
    });

    const currentCandle = candles.slice(-1)[0];
    const currentVolumeSma = volSma.slice(-1)[0];

    return {
      time: new Date(currentCandle.time * 1000).toLocaleString('tr-TR'),
      volume_sd: volSma.slice(-1)[0],
      volume_v: currentCandle.volume / currentVolumeSma,
      hint: currentCandle.volume / currentVolumeSma > 5 ? 'success' : undefined,
      price_open: currentCandle.open,
      price_low: currentCandle.low,
      roc: (candles.slice(-1)[0].open - candles.slice(-1)[0].low) / candleSizeSma.slice(-1)[0],
      roc_ma:
        (candles.slice(-1)[0].open - candles.slice(-1)[0].low) / candleSizeSma.slice(-1)[0] > 5 ? 'success' : undefined
    };
  }
};
