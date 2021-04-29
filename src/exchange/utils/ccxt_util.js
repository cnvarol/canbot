const ExchangeOrder = require('../../dict/exchange_order');
const Position = require('../../dict/position');

module.exports = class CcxtUtil {
  static createExchangeOrders(orders) {
    return orders.map(CcxtUtil.createExchangeOrder);
  }

  static createExchangeOrder(order) {
    let retry = false;

    let status;
    let orderStatus = order.status.toLowerCase().replace(/[\W_]+/g, '');
    if (order.info && order.info.status) {
      orderStatus = order.info.status.toLowerCase().replace(/[\W_]+/g, '');
    }

    if (['new', 'open', 'pendingnew', 'doneforday', 'stopped'].includes(orderStatus)) {
      status = ExchangeOrder.STATUS_OPEN;
    } else if (orderStatus === 'partiallyfilled') {
      status = ExchangeOrder.STATUS_PARTIALLY_FILLED;
    } else if (orderStatus === 'filled') {
      status = ExchangeOrder.STATUS_DONE;
    } else if (orderStatus === 'canceled') {
      status = ExchangeOrder.STATUS_CANCELED;
    } else if (orderStatus === 'rejected' || orderStatus === 'expired') {
      status = ExchangeOrder.STATUS_REJECTED;
      retry = true;
    }

    const ordType = order.type.toLowerCase().replace(/[\W_]+/g, '');

    // secure the value
    let orderType;
    switch (ordType) {
      case 'limit':
        orderType = ExchangeOrder.TYPE_LIMIT;
        break;
      case 'stop':
      case 'stopmarket': // currently: binance_futures only
        orderType = ExchangeOrder.TYPE_STOP;
        break;
      case 'takeprofit':
      case 'takeprofitmarket': // currently: binance_futures only
        orderType = ExchangeOrder.TYPE_TAKE_PROFIT;
        break;
      case 'stoplimit':
        orderType = ExchangeOrder.TYPE_STOP_LIMIT;
        break;
      case 'market':
        orderType = ExchangeOrder.TYPE_MARKET;
        break;
      case 'trailingstop':
      case 'trailingstopmarket': // currently: binance_futures only
        orderType = ExchangeOrder.TYPE_TRAILING_STOP;
        break;
      default:
        orderType = ExchangeOrder.TYPE_UNKNOWN;
        break;
    }

    let createdAt = new Date();
    let updatedAt = new Date();

    if (order.info && order.info.time) {
      createdAt = new Date(order.info.time);
    }

    if (order.info && order.info.updateTime) {
      updatedAt = new Date(order.info.updateTime);
    }

    return new ExchangeOrder(
      order.id,
      order.symbol,
      status,
      order.price,
      order.amount,
      retry,
      null,
      order.side.toLowerCase() === 'sell' ? 'sell' : 'buy', // secure the value,
      orderType,
      createdAt,
      updatedAt,
      JSON.parse(JSON.stringify(order))
    );
  }

  static createPositions(positions) {
    return positions.map(position => {
      let { unrealisedRoePcnt } = position;

      if (position.leverage && position.leverage > 1) {
        unrealisedRoePcnt /= position.leverage;
      }

      return new Position(
        position.symbol,
        position.currentQty < 0 ? 'short' : 'long',
        position.currentQty,
        parseFloat((unrealisedRoePcnt * 100).toFixed(2)),
        new Date(),
        position.avgEntryPrice,
        new Date(position.openingTimestamp)
      );
    });
  }
};
