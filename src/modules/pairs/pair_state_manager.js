/* eslint-disable no-restricted-syntax */
const PairState = require('../../dict/pair_state');
const OrderCapital = require('../../dict/order_capital');
const PairInterval = require('./pair_interval');

module.exports = class PairStateManager {
  constructor(logger, pairConfig, systemUtil, pairStateExecution, orderExecutor, pairInterval) {
    this.logger = logger;
    this.pairConfig = pairConfig;
    this.systemUtil = systemUtil;
    this.pairStateExecution = pairStateExecution;
    this.orderExecutor = orderExecutor;
    this.stats = {};
    this.pairInterval = pairInterval || new PairInterval();
  }

  update(exchange, symbol, state, side, options = {}) {
    if (!['long', 'close', 'short', 'cancel'].includes(state)) {
      this.logger.error(`Invalidate state: ${state}`);
      throw new Error(`Invalidate state: ${state}`);
    }

    const clearCallback = () => {
      this.logger.info(`State cleared: ${exchange} - ${symbol} - ${state}`);
      this.clear(exchange, symbol, side);
    };

    let pairState;
    if (state === 'long') {
      const capital = this.pairConfig.getSymbolCapital(exchange, symbol);
      if (!(capital instanceof OrderCapital)) {
        this.logger.error(`Invalidate OrderCapital: ${exchange} - ${symbol} - ${state} - ${side}`);
        return;
      }

      pairState = PairState.createLong(exchange, symbol, capital, options || {}, true, clearCallback);
    } else if (state === 'short') {
      const capital = this.pairConfig.getSymbolCapital(exchange, symbol);
      if (!(capital instanceof OrderCapital)) {
        this.logger.error(`Invalidate OrderCapital: ${exchange} - ${symbol} - ${state} - ${side}`);
        return;
      }

      pairState = PairState.createShort(exchange, symbol, capital, options || {}, true, clearCallback);
    } else {
      pairState = new PairState(exchange, symbol, side, state, options || {}, true, clearCallback);
    }

    const stateKey = exchange + symbol + side;
    this.logger.info(
      `Pair state changed: ${JSON.stringify({
        new: JSON.stringify(pairState),
        old: JSON.stringify(this.stats[stateKey] || {})
      })}`
    );

    this.stats[stateKey] = pairState;

    this.pairInterval.addInterval(stateKey, this.systemUtil.getConfig('tick.ordering', 10800), async () => {
      // prevent race conditions
      if (!pairState.isCleared() && stateKey in this.stats) {
        await this.pairStateExecution.onPairStateExecutionTick(pairState);
      }

      // state: can be cleared only onPairStateExecutionTick
      if (!pairState.isCleared() && pairState.hasAdjustedPrice() && stateKey in this.stats) {
        await this.orderExecutor.adjustOpenOrdersPrice(pairState);
      }
    });
  }

  /**
   *
   * @param exchange
   * @param symbol
   * @returns {undefined|PairState}
   */
  get(exchange, symbol, side) {
    if (exchange + symbol + side in this.stats) {
      return this.stats[exchange + symbol + side];
    }

    return undefined;
  }

  all() {
    const stats = [];

    for (const key in this.stats) {
      stats.push(this.stats[key]);
    }

    return stats;
  }

  clear(exchange, symbol, side) {
    if (exchange + symbol + side in this.stats) {
      delete this.stats[exchange + symbol + side];
    }

    this.pairInterval.clearInterval(exchange + symbol + side);
  }

  getSellingPairs() {
    const pairs = [];

    for (const key in this.stats) {
      if (this.stats[key].state === 'short') {
        pairs.push(this.stats[key]);
      }
    }

    return pairs;
  }

  getBuyingPairs() {
    const pairs = [];

    for (const key in this.stats) {
      if (this.stats[key].state === 'long') {
        pairs.push(this.stats[key]);
      }
    }

    return pairs;
  }

  getClosingPairs() {
    const pairs = [];

    for (const key in this.stats) {
      if (this.stats[key].state === 'close') {
        pairs.push(this.stats[key]);
      }
    }

    return pairs;
  }

  getCancelPairs() {
    const pairs = [];

    for (const key in this.stats) {
      if (this.stats[key].state === 'cancel') {
        pairs.push(this.stats[key]);
      }
    }

    return pairs;
  }

  isNeutral(exchange, symbol, side) {
    return !(exchange + symbol + side in this.stats);
  }

  async onTerminate() {
    const running = this.all();

    for (const key in running) {
      const pair = running[key];

      this.logger.info(`Terminate: Force managed orders cancel: ${JSON.stringify(pair)}`);
      console.log(`Terminate: Force managed orders cancel: ${JSON.stringify(pair)}`);

      await this.pairStateExecution.onCancelPair(pair);
    }
  }
};
