const _ = require('lodash');

/**
 * The order that should place from our side and sending to remote
 */
module.exports = class Order {
  static get SIDE_LONG() {
    return 'long';
  }

  static get SIDE_SHORT() {
    return 'short';
  }

  static get TYPE_LIMIT() {
    return 'limit';
  }

  static get TYPE_STOP() {
    return 'stop';
  }

  static get TYPE_MARKET() {
    return 'market';
  }

  static get TYPE_TRAILING_STOP() {
    return 'trailing_stop';
  }

  static get OPTION_POST_ONLY() {
    return 'post_only';
  }

  constructor(id, symbol, side, price, amount, type, options = {}) {
    if (![Order.SIDE_LONG, Order.SIDE_SHORT].includes(side)) {
      throw new Error(`Invalid order side given: ${side}`);
    }

    this.id = id;
    this.symbol = symbol;
    this.side = side;
    this.price = price;
    this.amount = amount;
    this.type = type;
    this.options = options;
  }

  hasAdjustedPrice() {
    return this.options.adjust_price === true;
  }

  getId() {
    return this.id;
  }

  getSymbol() {
    return this.symbol;
  }

  isShort() {
    return this.side === Order.SIDE_SHORT;
  }

  isLong() {
    return this.side === Order.SIDE_LONG;
  }

  getPrice() {
    return this.price ? Math.abs(this.price) : undefined;
  }

  getAmount() {
    return this.amount ? Math.abs(this.amount) : undefined;
  }

  getType() {
    return this.type;
  }

  isPostOnly() {
    return this.options && this.options.post_only === true;
  }

  isReduceOnly() {
    return this.options && this.options.close === true;
  }

  static createMarketOrder(symbol, amount, side) {
    console.log('createMarketOrder', symbol, amount, side);
    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      symbol,
      side === this.SIDE_LONG ? this.SIDE_SHORT : this.SIDE_LONG,
      amount > 0 ? 0.000001 : -0.000001, // fake prices
      amount,
      this.TYPE_MARKET,
      { close: true }
    );
  }

  static createLimitPostOnlyOrder(symbol, side, price, amount, options) {
    console.log('createLimitPostOnlyOrder');
    if (![Order.SIDE_SHORT, Order.SIDE_LONG].includes(side)) {
      throw new Error(`Invalid order side:${side} - ${JSON.stringify([symbol, side, price, amount, options])}`);
    }

    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      symbol,
      side,
      price,
      amount,
      Order.TYPE_LIMIT,
      _.merge(options, {
        post_only: true
      })
    );
  }

  static createStopOrder(symbol, side, price, amount, options) {
    if (![Order.SIDE_SHORT, Order.SIDE_LONG].includes(side)) {
      throw new Error(`Invalid order side:${side} - ${JSON.stringify([symbol, side, price, amount, options])}`);
    }

    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      symbol,
      side,
      price,
      amount,
      Order.TYPE_STOP,
      options
    );
  }

  static createLimitPostOnlyOrderAutoSide(symbol, price, amount, options) {
    console.log('createLimitPostOnlyOrderAutoSide');
    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      symbol,
      price < 0 ? Order.SIDE_SHORT : Order.SIDE_LONG,
      price,
      amount,
      Order.TYPE_LIMIT,
      _.merge(options, {
        post_only: true
      })
    );
  }

  static createCloseLimitPostOnlyReduceOrder(symbol, price, amount) {
    console.log('createCloseLimitPostOnlyReduceOrder');
    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      symbol,
      price < 0 ? Order.SIDE_SHORT : Order.SIDE_LONG,
      price,
      amount,
      this.TYPE_LIMIT,
      {
        post_only: true,
        close: true
      }
    );
  }

  static createLimitPostOnlyOrderAutoAdjustedPriceOrder(symbol, amount, options = {}) {
    console.log('createLimitPostOnlyOrderAutoAdjustedPriceOrder');
    return Order.createLimitPostOnlyOrder(
      symbol,
      amount < 0 ? Order.SIDE_SHORT : Order.SIDE_LONG,
      undefined,
      amount,
      _.merge(options, {
        adjust_price: true
      })
    );
  }

  static createRetryOrder(order, amount) {
    if (!(order instanceof Order)) {
      throw new Error('TypeError: no Order');
    }

    if (![Order.SIDE_SHORT, Order.SIDE_LONG].includes(order.side)) {
      throw new Error(`Invalid order side:${order.side} - ${JSON.stringify(order)}`);
    }

    let orderAmount = order.amount;
    if (typeof amount !== 'undefined') {
      orderAmount = Math.abs(amount);

      if (order.side === Order.SIDE_SHORT) {
        orderAmount *= -1;
      }
    }

    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      order.symbol,
      order.side,
      order.price,
      orderAmount,
      order.type,
      order.options
    );
  }

  static createRetryOrderWithPriceAdjustment(order, price) {
    console.log('createRetryOrderWithPriceAdjustment');
    if (!(order instanceof Order)) {
      throw new Error('TypeError: no Order');
    }

    if (![Order.SIDE_SHORT, Order.SIDE_LONG].includes(order.side)) {
      throw new Error(`Invalid order side:${order.side} - ${JSON.stringify(order)}`);
    }

    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      order.symbol,
      order.side,
      price,
      order.amount,
      order.type,
      order.options
    );
  }

  static createPriceUpdateOrder(id, price, side) {
    return new Order(id, undefined, side, price, undefined, undefined, undefined);
  }

  static createStopLossOrder(symbol, price, amount) {
    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      symbol,
      price < 0 || amount < 0 ? Order.SIDE_SHORT : Order.SIDE_LONG,
      price,
      amount,
      'stop',
      { close: true }
    );
  }

  static createUpdateOrder(id, price = undefined, amount = undefined) {
    console.log('createUpdateOrder');
    return new Order(id, undefined, price < 0 || amount < 0 ? Order.SIDE_SHORT : Order.SIDE_LONG, price, amount);
  }

  static createCloseOrderWithPriceAdjustment(symbol, amount) {
    console.log('createCloseOrderWithPriceAdjustment');
    return Order.createLimitPostOnlyOrderAutoAdjustedPriceOrder(symbol, amount, { close: true });
  }

  static createUpdateOrderOnCurrent(exchangeOrder, price = undefined, amount = undefined) {
    console.log('createUpdateOrderOnCurrent', exchangeOrder.options);
    if (!exchangeOrder.options && exchangeOrder.positionSide && exchangeOrder.type === this.TYPE_LIMIT) {
      if (
        (exchangeOrder.positionSide === exchangeOrder.POSITION_SIDE_LONG && exchangeOrder.side === 'sell') ||
        (exchangeOrder.positionSide === exchangeOrder.POSITION_SIDE_SHORT && exchangeOrder.side === 'buy')
      ) {
        exchangeOrder.options = {close: true, adjust_price: true, post_only: true};
      } else {
        exchangeOrder.options = {adjust_price: true, post_only: true};
      }
    }

    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      exchangeOrder.symbol,
      exchangeOrder.getLongOrShortSide(),
      typeof price === 'undefined' ? exchangeOrder.price : price,
      typeof amount === 'undefined' ? exchangeOrder.amount : amount,
      exchangeOrder.type,
      exchangeOrder.options
    );
  }

  static createTrailingStopLossOrder(symbol, distance, amount) {
    return new Order(
      Math.round(new Date().getTime().toString() * Math.random()),
      symbol,
      distance < 0 ? Order.SIDE_SHORT : Order.SIDE_LONG,
      distance,
      amount,
      this.TYPE_TRAILING_STOP,
      { close: true }
    );
  }
};
