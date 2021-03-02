const _ = require('lodash');

module.exports = class PairsHttp {
  constructor(instances, exchangeManager, pairStateManager, eventEmitter) {
    this.instances = instances;
    this.exchangeManager = exchangeManager;
    this.pairStateManager = pairStateManager;
    this.eventEmitter = eventEmitter;
  }

  async getTradePairs() {
    const pairs = await Promise.all(
      this.instances.symbols.map(async symbol => {
        const position = await this.exchangeManager.getPosition(symbol.exchange, symbol.symbol);

        const state_long = await this.pairStateManager.get(symbol.exchange, symbol.symbol, 'long');
        const state_short = await this.pairStateManager.get(symbol.exchange, symbol.symbol, 'short');

        const strategiesTrade = symbol.trade && symbol.trade.strategies ? symbol.trade.strategies : [];
        const strategies = symbol.strategies || [];

        const tradeCapital = _.get(symbol, 'trade.capital', 0);
        const tradeCurrencyCapital = _.get(symbol, 'trade.currency_capital', 0);

        const item = {
          exchange: symbol.exchange,
          symbol: symbol.symbol,
          watchdogs: symbol.watchdogs,
          is_trading: strategiesTrade.length > 0 || tradeCapital > 0 || tradeCurrencyCapital > 0,
          has_position: position !== undefined,
          trade_capital: tradeCapital,
          trade_currency_capital: tradeCurrencyCapital,
          strategies: strategies,
          strategies_trade: strategiesTrade,
          weight: 0,
          strategy_names: [...strategies, ...strategiesTrade].map(s => s.strategy)
        };

        // open position wins over default state
        if (item.has_position) {
          item.weight += 1;
        }

        // console.log('STATE:', state_long, state_short);

        item.process = '';

        // processing items must win
        if (state_long && state_long.state) {
          item.process = `[${state_long.side}:${state_long.state}]`;
          item.weight += 2;
        }

        item.process += ' ';

        if (state_short && state_short.state) {
          item.process += `[${state_short.side}:${state_short.state}]`;
          item.weight += 2;
        }

        return item;
      })
    );

    return pairs
      .sort((a, b) => `${a.exchange}.${a.symbol}`.localeCompare(`${b.exchange}.${b.symbol}`))
      .sort((a, b) => b.weight - a.weight);
  }

  async triggerOrder(exchangeName, symbol, positionSide, action) {
    let state = action;
    const options = {};
    if (['long_market', 'short_market', 'close_market'].includes(action)) {
      options.market = true;
      state = state.replace('_market', '');
    }

    this.pairStateManager.update(exchangeName, symbol, state, positionSide, options);

    this.eventEmitter.emit('tick_ordering');
  }
};
