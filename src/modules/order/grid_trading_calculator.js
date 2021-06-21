/* eslint-disable no-async-promise-executor */
const { SMA } = require('technicalindicators');
const { RSI } = require('technicalindicators');
const ExchangeOrder = require('../../dict/exchange_order');
const OrderUtil = require('../../utils/order_util');

module.exports = class GridTradingCalculator {
  constructor(candlestickRepository, logger) {
    this.logger = logger;
    this.candlestickRepository = candlestickRepository;
  }

  checkDuplicateStopOrders(position, orders) {
    let ordersCheck;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      ordersCheck = orders.filter(
        order =>
          (order.type === ExchangeOrder.TYPE_STOP ||
            (order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET && order.reduceOnly)) &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      ordersCheck = orders.filter(
        order =>
          order.type === ExchangeOrder.TYPE_STOP ||
          (order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET && order.reduceOnly)
      );
    }

    const orderAmounts = new Set();
    const orderPrices = new Set();
    const duplicateOrders = [];

    ordersCheck.forEach(order => {
      const duplicateAmount = orderAmounts.has(order.amount);
      const duplicatePrice = orderPrices.has(order.price);

      if (duplicateAmount && duplicatePrice) {
        duplicateOrders.push(order);
        return;
      }

      orderAmounts.add(order.amount);
      orderPrices.add(order.price);
    });

    return duplicateOrders;
  }

  checkDuplicateLimitOrders(position, orders) {
    let ordersCheck;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      ordersCheck = orders.filter(
        order =>
          order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET &&
          !order.reduceOnly &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      ordersCheck = orders.filter(order => order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET && !order.reduceOnly);
    }

    const orderAmounts = new Set();
    const orderPrices = new Set();
    const duplicateOrders = [];

    ordersCheck.forEach(order => {
      const duplicateAmount = orderAmounts.has(order.amount);
      const duplicatePrice = orderPrices.has(order.price);

      if (duplicateAmount && duplicatePrice) {
        duplicateOrders.push(order);
        return;
      }

      orderAmounts.add(order.amount);
      orderPrices.add(order.price);
    });

    return duplicateOrders;
  }

  calculateForOpenPosition(position, options) {
    let entryPrice = position.entry;
    const size = position.raw.size ? Math.abs(position.raw.size) : Math.abs(position.amount * position.entry);

    if (!entryPrice) {
      this.logger.info(`Invalid entryPrice for grid trading:${JSON.stringify(position)}`);
      return undefined;
    }

    const result = {
      stopPrice: undefined,
      targetPrice: undefined
    };

    entryPrice = Math.abs(entryPrice);

    const step_percent = Math.sqrt(size / options.step_resolution) + options.trailing_stop_rate;
    let hedge_step_percent = Math.sqrt(size / options.hedge_step_resolution);

    if (options.hedge_profit_mode) {
      hedge_step_percent = options.take_profit + options.trailing_stop_rate;
    }

    if (position.side === 'long') {
      result.targetPrice = entryPrice * (1 - step_percent / 100);
      result.stopPrice = entryPrice * (1 + hedge_step_percent / 100);
    } else {
      result.targetPrice = entryPrice * (1 + step_percent / 100);
      result.stopPrice = entryPrice * (1 - hedge_step_percent / 100);
    }

    if (position.side === 'long' && result.targetPrice >= position.markPrice) {
      result.targetPrice = position.markPrice * 0.998;
    }

    if (position.side === 'short' && result.targetPrice <= position.markPrice) {
      result.targetPrice = position.markPrice * 1.002;
    }

    return result;
  }

  async syncGridTradingOrders(position, orders, options) {
    const newOrders = {};
    const result = this.calculateForOpenPosition(position, options);

    let stopOrders;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      stopOrders = orders.filter(
        order =>
          (order.type === ExchangeOrder.TYPE_STOP ||
            (order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET && order.reduceOnly)) &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      stopOrders = orders.filter(
        order =>
          order.type === ExchangeOrder.TYPE_STOP ||
          (order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET && order.reduceOnly)
      );
    }

    if (stopOrders.length === 0) {
      newOrders.stop = {
        amount: Math.abs(position.amount),
        price: result.stopPrice
      };

      // inverse price for lose long position via sell
      if (position.side === 'short') {
        // eslint-disable-next-line operator-assignment
        newOrders.stop.price = newOrders.stop.price * -1;
      }
    } else {
      // update order
      const stopOrder = stopOrders[0];

      // only +1% amount change is important for us
      if (OrderUtil.isPercentDifferentGreaterThen(position.amount, stopOrder.amount, 1)) {
        let amount = Math.abs(position.amount);
        if (position.isShort()) {
          amount *= -1;
        }

        newOrders.stop = {
          id: stopOrder.id,
          amount: amount
        };
      }
    }

    let targetOrders;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      targetOrders = orders.filter(
        order =>
          order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET &&
          !order.reduceOnly &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      targetOrders = orders.filter(
        order => order.type === ExchangeOrder.TYPE_TRAILING_STOP_MARKET && !order.reduceOnly
      );
    }

    if (targetOrders.length === 0) {
      newOrders.target = {
        amount: Math.abs(position.amount),
        price: result.targetPrice
      };

      if (position.side === 'short') {
        // eslint-disable-next-line operator-assignment
        newOrders.target.price = newOrders.target.price * -1;
      }
    } else {
      // update order
      const targetOrder = targetOrders[0];

      // only +1% amount change is important for us
      if (OrderUtil.isPercentDifferentGreaterThen(position.amount, targetOrder.amount, 1)) {
        let amount = Math.abs(position.amount);
        if (position.isShort()) {
          amount *= -1;
        }

        newOrders.target = {
          id: targetOrder.id,
          amount: amount
        };
      }
    }

    return newOrders;
  }

  async createGridTradingOrders(position, orders, options) {
    const currentOrders = await this.syncGridTradingOrders(position, orders, options);

    const newOrders = [];
    if (currentOrders.target) {
      if (currentOrders.target.id) {
        newOrders.push({
          id: currentOrders.target.id,
          price: currentOrders.target.price,
          amount: currentOrders.target.amount,
          type: 'target'
        });
      } else {
        newOrders.push({
          price: currentOrders.target.price || undefined,
          amount: currentOrders.target.amount || undefined,
          type: 'target'
        });
      }
    }

    if (currentOrders.stop) {
      if (currentOrders.stop.id) {
        newOrders.push({
          id: currentOrders.stop.id,
          price: currentOrders.stop.price,
          amount: currentOrders.stop.amount,
          type: 'stop'
        });
      } else {
        newOrders.push({
          price: currentOrders.stop.price,
          amount: currentOrders.stop.amount,
          type: 'stop'
        });
      }
    }

    return newOrders;
  }

  async rsiCalculate(exchange, symbol, period) {
    return new Promise(async resolve => {
      const allCandles = await this.candlestickRepository.getLookbacksForPair(exchange, symbol, period, 20);

      const candles = allCandles.slice().reverse() || [];

      if (candles.length === 0 || candles.length < 20) {
        resolve({});
        return;
      }

      if (candles.length > 1 && candles[0].time > candles[1].time) {
        resolve({});
        return;
      }

      const candleRSI = RSI.calculate({
        period: 14,
        values: candles.slice(-28).map(v => v.close)
      });

      resolve(candleRSI[0]);
    });
  }

  async fisherRSICalculate(exchange, symbol, period) {
    const rsi = await this.rsiCalculate(exchange, symbol, period);

    if (!rsi) {
      return 0;
    }

    const rsiP = 0.1 * (rsi - 50);
    return (Math.exp(2 * rsiP) - 1) / (Math.exp(2 * rsiP) + 1);
  }

  async dumpPattern(exchange, symbol, period) {
    return new Promise(async resolve => {
      const allCandles = await this.candlestickRepository.getLookbacksForPair(exchange, symbol, period, 40);

      const candles = allCandles.slice().reverse() || [];

      if (candles.length === 0 || candles.length < 40) {
        resolve({});
        return;
      }

      if (candles.length > 1 && candles[0].time > candles[1].time) {
        resolve({});
        return;
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

      resolve({
        time: new Date(),
        volume_sd: volSma.slice(-1)[0],
        volume_v: currentCandle.volume / currentVolumeSma > 6.5 ? currentCandle.volume / currentVolumeSma : undefined,
        hint: currentCandle.volume / currentVolumeSma > 6.5,
        price_trigger: currentCandle.low,
        roc_v: (candles.slice(-1)[0].open - candles.slice(-1)[0].low) / candleSizeSma.slice(-1)[0],
        roc_ma: (candles.slice(-1)[0].open - candles.slice(-1)[0].low) / candleSizeSma.slice(-1)[0] > 6.5
      });
    });
  }

  async pumpPattern(exchange, symbol, period) {
    return new Promise(async resolve => {
      const allCandles = await this.candlestickRepository.getLookbacksForPair(exchange, symbol, period, 40);

      const candles = allCandles.slice().reverse() || [];

      if (candles.length === 0 || candles.length < 40) {
        resolve({});
        return;
      }

      if (candles.length > 1 && candles[0].time > candles[1].time) {
        resolve({});
        return;
      }

      const volSma = SMA.calculate({
        period: 40,
        values: candles.slice(-80).map(b => b.volume)
      });

      const candleSizeSma = SMA.calculate({
        period: 40,
        values: candles.slice(-80).map(v => Math.abs(v.open - v.close))
      });

      const currentCandle = candles.slice(-1)[0];
      const currentVolumeSma = volSma.slice(-1)[0];

      resolve({
        time: new Date(),
        volume_sd: volSma.slice(-1)[0],
        volume_v: currentCandle.volume / currentVolumeSma > 6.5 ? currentCandle.volume / currentVolumeSma : undefined,
        hint: currentCandle.volume / currentVolumeSma > 6.5,
        price_trigger: currentCandle.high,
        roc: (candles.slice(-1)[0].open - candles.slice(-1)[0].close) / candleSizeSma.slice(-1)[0],
        roc_ma: (candles.slice(-1)[0].open - candles.slice(-1)[0].close) / candleSizeSma.slice(-1)[0] < -6.5
      });
    });
  }
};
