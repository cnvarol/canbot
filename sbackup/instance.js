var c = module.exports = {}

c.symbols = []

c.symbols.push({
  'symbol': 'BTCUSDT',
  'extra': {
      'binance_futures_leverage': 50
  },
  'periods': ['1m', '3m', '15m', '1h', '4h', '1d'],
  'watchdogs': [
      {
          'name': 'grid_trading',
          'hedge_position': true,
          'hedge_percent': -0.25,
          'hedge_profit_mode': true,
          'hedge_take_profit': 1,
          'step_resolution': 3500,
          'hedge_step_resolution': 700,
          'take_profit': 1,
          'risk_notify': true,
          'risk_size': 50000,
          'risk_take_profit': 0.75
      }
  ],
  'exchange': 'binance_futures',
  'trade': {
    'currency_capital': 5000,
    'strategies': [
      {
          'strategy': 'fast',
          'options': {
              'period': '15m'
          }
      }
    ]
  }
})

c.symbols.push({
  'symbol': 'ETHUSDT',
  'extra': {
      'binance_futures_leverage': 25
  },
  'periods': ['1m', '3m', '15m', '1h', '4h', '1d'],
  'watchdogs': [
      {
          'name': 'grid_trading',
          'hedge_position': true,
          'hedge_percent': -0.5,
          'hedge_profit_mode': true,
          'hedge_take_profit': 1.5,
          'step_resolution': 750,
          'hedge_step_resolution': 150,
          'take_profit': 1,
          'risk_notify': true,
          'risk_size': 25000,
          'risk_take_profit': 0.75
      }
  ],
  'exchange': 'binance_futures',
  'trade': {
    'currency_capital': 2500,
    'strategies': [
      {
          'strategy': 'fast',
          'options': {
              'period': '15m'
          }
      }
    ]
  }
})

let trade1m = [
    'XRPUSDT',
    'EOSUSDT',
    'BNBUSDT',
    'ADAUSDT',
    'LTCUSDT',
    'TRXUSDT',
    'LINKUSDT',
    'ETCUSDT',
    'XLMUSDT',
    'XTZUSDT',
    'DOTUSDT',
    'THETAUSDT',
    'UNIUSDT',
    'AAVEUSDT',
    'FILUSDT'
]

trade1m.forEach((pair) => {
    c.symbols.push({
        'symbol': pair,
        'extra': {
            'binance_futures_leverage': 10
        },
        'periods': ['1m', '3m', '15m', '1h', '4h', '1d'],
        'watchdogs': [
           {
                'name': 'grid_trading',
                'hedge_position': true,
                'hedge_percent': -0.75,
                'hedge_profit_mode': true,
                'hedge_take_profit': 2,
                'step_resolution': 100,
                'hedge_step_resolution': 20,
                'take_profit': 1,
                'risk_notify': true,
                'risk_size': 12500,
                'risk_take_profit': 0.75
           }
        ],
        'exchange': 'binance_futures',
        'trade': {
          'currency_capital': 1000,
          'strategies': [
            {
                'strategy': 'fast',
                'options': {
                    'period': '15m'
                }
            }
          ]
        }
    })
})

let trade100k = [
    'MATICUSDT',
    'ALPHAUSDT',
    'CVCUSDT',
    'ZRXUSDT',
    'GRTUSDT',
    'WAVESUSDT',
    'OMGUSDT',
    'SUSHIUSDT',
    'AVAXUSDT',
    'ATOMUSDT',
    'SXPUSDT',
    'LUNAUSDT',
    'MKRUSDT',
    'FTMUSDT',
    'VETUSDT',
    'RENUSDT',
    'LITUSDT',
    'KSMUSDT',
    'BZRXUSDT',
    'LRCUSDT',
    'ALGOUSDT',
    'BALUSDT',
    'EGLDUSDT',
    'CRVUSDT',
    'ZILUSDT',
    'COMPUSDT',
    'SANDUSDT',
    'CHZUSDT',
    'ANKRUSDT',
    'UNFIUSDT',
    'DODOUSDT',
    'REEFUSDT',
    'RVNUSDT',
    'SRMUSDT',
    'TOMOUSDT',
    'ONTUSDT',
    'IOTAUSDT',
    'BATUSDT',
    'NEOUSDT',
    'QTUMUSDT',
    'SKLUSDT',
    'ENJUSDT',
    'XEMUSDT',
    'NEARUSDT',
    '1INCHUSDT',
    'AKROUSDT',
    'HOTUSDT',
    'STORJUSDT',
    'DENTUSDT',
    'SOLUSDT',
    'CTKUSDT',
    'HNTUSDT',
    'KNCUSDT',
    'ALICEUSDT',
    'STMXUSDT',
    'BELUSDT',
    'ONEUSDT',
    'BLZUSDT',
    'AXSUSDT',
    'BANDUSDT',
    'ICXUSDT',
    'NKNUSDT',
    'MANAUSDT',
    'BTTUSDT',
    'RUNEUSDT',
    'KAVAUSDT',
    'BTSUSDT',
    'CELRUSDT',
    'CHRUSDT',
    'COTIUSDT',
    'DGBUSDT',
    'IOSTUSDT',
    'MTLUSDT',
    'OCEANUSDT',
    'OGNUSDT',
    'RLCUSDT',
    'SCUSDT'
]

trade100k.forEach((pair) => {
    c.symbols.push({
        'symbol': pair,
        'extra': {
            'binance_futures_leverage': 10
        },
        'periods': ['1m', '3m', '15m', '1h', '4h', '1d'],
        'watchdogs': [
           {
        	'name': 'grid_trading',
                'hedge_position': true,
                'hedge_percent': -1,
		'hedge_profit_mode': true,
      		'hedge_take_profit': 2.5,
                'step_resolution': 30,
                'hedge_step_resolution': 6,
                'take_profit': 1,
                'risk_notify': true,
                'risk_size': 7000,
                'risk_take_profit': 0.75
           }
        ],
        'exchange': 'binance_futures',
        'trade': {
          'currency_capital': 400,
          'strategies': [
            {
                'strategy': 'fast',
                'options': {
                    'period': '15m'
                }
            }
          ]
        }
    })
})

let watchlist = [
    'DOGEUSDT'
]

watchlist.forEach((pair) => {
    c.symbols.push({
        'symbol': pair,
        'periods': ['1m', '3m', '15m', '1h', '4h', '1d'],
        'exchange': 'binance_futures',
        'state': 'watch',
        'strategies': [
            {
                'strategy': 'sar',
                'options': {
                    'period': '15m',
                    'amount_currency': 100
                }
            }
        ]
    })
})
