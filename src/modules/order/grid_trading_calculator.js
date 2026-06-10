/* eslint-disable no-async-promise-executor */
const { SMA } = require('technicalindicators');
const { RSI } = require('technicalindicators');
const ExchangeOrder = require('../../dict/exchange_order');
const OrderUtil = require('../../utils/order_util');

module.exports = class GridTradingCalculator {
  constructor(candlestickRepository, logger) {
    this.logger = logger;
    this.candlestickRepository = candlestickRepository;
    // Track peak prices for trailing logic
    this.peakPrices = {};
    // Track when trailing was activated
    this.trailingActivated = {};
  }

  checkDuplicateStopOrders(position, orders) {
    let ordersCheck;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      ordersCheck = orders.filter(
        order =>
          (order.type === ExchangeOrder.TYPE_STOP ||
            order.type === ExchangeOrder.TYPE_STOP_LOSS ||
            order.type === ExchangeOrder.TYPE_STOP_MARKET) &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      ordersCheck = orders.filter(
        order =>
          order.type === ExchangeOrder.TYPE_STOP ||
          order.type === ExchangeOrder.TYPE_STOP_LOSS ||
          order.type === ExchangeOrder.TYPE_STOP_MARKET
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
          order.type === ExchangeOrder.TYPE_LIMIT &&
          !order.reduceOnly &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      ordersCheck = orders.filter(order => order.type === ExchangeOrder.TYPE_LIMIT && !order.reduceOnly);
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

    const posKey = `${position.symbol}_${position.side}`;
    const currentPrice = position.markPrice || entryPrice;
    console.log('Calc peak:', position.symbol, position.side, 'entry:', entryPrice, 'current:', currentPrice, 'markPrice:', position.markPrice, 'profit:', position.profit);
    // Track peak price for trailing stop
    // On first tick after restart, initialize from entry price to preserve accumulated profit
    if (!this.peakPrices[posKey]) {
      if (position.side === 'long') {
        this.peakPrices[posKey] = Math.max(Math.abs(entryPrice), currentPrice);
      } else {
        this.peakPrices[posKey] = Math.min(Math.abs(entryPrice), currentPrice);
      }
    } else {
      // Update peak only if price moved in favorable direction
      if (position.side === 'long' && currentPrice > this.peakPrices[posKey]) {
        this.peakPrices[posKey] = currentPrice;
      } else if (position.side === 'short' && currentPrice < this.peakPrices[posKey]) {
        this.peakPrices[posKey] = currentPrice;
      }
    }

    const peakPrice = this.peakPrices[posKey];

    const result = {
      stopPrice: undefined,
      targetPrice: undefined,
      shouldCreateStop: false,
      shouldUpdateStop: false,
      isTrailing: false
    };

    entryPrice = Math.abs(entryPrice);
    const trailingRate = options.trailing_stop_rate || 4;
    const step_percent = Math.sqrt(size / options.step_resolution) + trailingRate;

    // Calculate target price (for pyramiding)
    if (position.side === 'long') {
      result.targetPrice = currentPrice * (1 - step_percent / 100);
    } else {
      result.targetPrice = currentPrice * (1 + step_percent / 100);
    }

    // Ensure target price is valid
    if (position.markPrice) {
      if (position.side === 'long' && result.targetPrice >= position.markPrice) {
        result.targetPrice = position.markPrice * 0.998;
      }
      if (position.side === 'short' && result.targetPrice <= position.markPrice) {
        result.targetPrice = position.markPrice * 1.002;
      }
    }

    // SIMPLE TRAILING STOP LOSS
    // Create stop only when peak price profit >= trailing_stop_rate
    result.isTrailing = true;
    
    if (position.side === 'long') {
      // For LONG: calculate profit % from entry to peak
      const peakProfitPercent = ((peakPrice - entryPrice) / entryPrice) * 100;
      
      if (peakProfitPercent >= trailingRate) {
        // Peak profit is >= trailing rate - create trailing stop
        result.stopPrice = peakPrice * (1 - trailingRate / 100);
        result.shouldCreateStop = true;
        result.shouldUpdateStop = true;
      } else {
        // Peak profit not high enough yet - don't create stop
        result.shouldCreateStop = false;
        result.shouldUpdateStop = false;
      }
    } else {
      // For SHORT: calculate profit % from entry to peak (lower is better)
      const peakProfitPercent = ((entryPrice - peakPrice) / entryPrice) * 100;
      
      if (peakProfitPercent >= trailingRate) {
        // Peak profit is >= trailing rate - create trailing stop
        result.stopPrice = peakPrice * (1 + trailingRate / 100);
        result.shouldCreateStop = true;
        result.shouldUpdateStop = true;
      } else {
        // Peak profit not high enough yet - don't create stop
        result.shouldCreateStop = false;
        result.shouldUpdateStop = false;
      }
    }

    return result;
  }

  async syncGridTradingOrders(position, orders, options) {
    const newOrders = {};
    const result = this.calculateForOpenPosition(position, options);

    if (!result) {
      return newOrders;
    }

    // Extract trailing rate from options for use in stop orders
    const trailingRate = options.trailing_stop_rate || 4;

    // Handle STOP orders
    let stopOrders;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      stopOrders = orders.filter(
        order =>
          (order.type === ExchangeOrder.TYPE_STOP ||
            order.type === ExchangeOrder.TYPE_STOP_LOSS ||
            order.type === ExchangeOrder.TYPE_STOP_MARKET) &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      stopOrders = orders.filter(
        order =>
          order.type === ExchangeOrder.TYPE_STOP ||
          order.type === ExchangeOrder.TYPE_STOP_LOSS ||
          order.type === ExchangeOrder.TYPE_STOP_MARKET
      );
    }

    if (stopOrders.length === 0) {
      // No stop exists - create one if conditions met
      if (result.shouldCreateStop && result.stopPrice) {
        newOrders.stop = {
          amount: Math.abs(position.amount),
          price: result.stopPrice,
          type: 'limit',
          trailingRate: trailingRate  // Store trailing rate for order executor
        };

        if (position.side === 'short') {
          newOrders.stop.amount *= -1;
        }
      }
    } else {
      // Stop order exists - check if it needs updating
      const stopOrder = stopOrders[0];
      
      if (!result.shouldCreateStop || !result.stopPrice) {
        // Should not have stop anymore - cancel it
        newOrders.stop = {
          id: stopOrder.id,
          amount: 0,
          price: 0,
          type: 'cancel'
        };
      } else {
        // Check if update needed
        const amountChanged = OrderUtil.isPercentDifferentGreaterThen(position.amount, stopOrder.amount, 1);
        
        // Check if stop price should move (only tighten, never loosen)
        let needsPriceUpdate = false;
        const currentStopPrice = Math.abs(stopOrder.price);
        
        if (position.side === 'long') {
          // Long: Update if new stop is higher (tighter)
          const priceImprovement = ((result.stopPrice - currentStopPrice) / currentStopPrice) * 100;
          needsPriceUpdate = priceImprovement > 0.3; // Update if 0.3%+ improvement
        } else {
          // Short: Update if new stop is lower (tighter)
          const priceImprovement = ((currentStopPrice - result.stopPrice) / currentStopPrice) * 100;
          needsPriceUpdate = priceImprovement > 0.3;
        }

        if (amountChanged || needsPriceUpdate) {
          let amount = Math.abs(position.amount);
          if (position.isShort()) {
            amount *= -1;
          }

          newOrders.stop = {
            id: stopOrder.id,
            amount: amount,
            price: result.stopPrice,
            type: 'limit_update'
          };
        }
      }
    }

    // Handle TARGET orders (for pyramiding)
    let targetOrders;
    if (position.raw && position.raw.positionSide !== 'BOTH') {
      targetOrders = orders.filter(
        order =>
          order.type === ExchangeOrder.TYPE_LIMIT &&
          !order.reduceOnly &&
          order.positionSide === position.raw.positionSide
      );
    } else {
      targetOrders = orders.filter(order => order.type === ExchangeOrder.TYPE_LIMIT && !order.reduceOnly);
    }

    if (targetOrders.length === 0) {
      newOrders.target = {
        amount: Math.abs(position.amount),
        price: result.targetPrice
      };

      if (position.side === 'short') {
        newOrders.target.price = newOrders.target.price * -1;
      }
    } else {
      const targetOrder = targetOrders[0];

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
          type: currentOrders.stop.type
        });
      } else {
        newOrders.push({
          price: currentOrders.stop.price,
          amount: currentOrders.stop.amount,
          type: currentOrders.stop.type
        });
      }
    }

    return newOrders;
  }

  // Clean up tracking when position closes
  clearTrailingActivation(symbol, side) {
    const posKey = `${symbol}_${side}`;
    delete this.peakPrices[posKey];
    delete this.trailingActivated[posKey];
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

      resolve(candleRSI[candleRSI.length - 1]);
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
