var c = module.exports = {}

c.symbols = []

let x = [
]

x.forEach((pair) => {
    c.symbols.push({
        'symbol': pair,
        'periods': ['1m', '15m', '1h', '4h', '1d'],
        'exchange': 'binance_futures',
        'state': 'watch',
        'strategies': [
            /*{
                'strategy': 'moon',
                'options': {
                    'period': '1m'
                }
            },*/
            {
                'strategy': 'sar',
                'options': {
                    'period': '15m'
                }
            }
        ]
    })
})

let z = [
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'LTCUSDT',
    'ETCUSDT',
    'LINKUSDT',
    'ADAUSDT',
    'DOTUSDT',
    'EOSUSDT',
    'XLMUSDT',
    'XTZUSDT',
    'XRPUSDT',
    'MATICUSDT',
    'ALPHAUSDT',
    'CVCUSDT',
    'DOGEUSDT',
    'ZRXUSDT',
    'GRTUSDT',
    'WAVESUSDT',
    'OMGUSDT',
    'UNIUSDT',
    'SUSHIUSDT',
    'AAVEUSDT',
    'AVAXUSDT',
    'ATOMUSDT',
    'SXPUSDT',
    'LUNAUSDT',
    'MKRUSDT',
    '1INCHUSDT',
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
    'BLZUSDT',
    'SRMUSDT'
]

z.forEach((pair) => {
    c.symbols.push({
        'symbol': pair,
        'extra': {
            'binance_futures_leverage': 10,
        },
        'periods': ['1m', '15m', '1h', '4h', '1d'],
        'watchdogs': [
           {
        	'name': 'risk_reward_ratio',
        	'target_percent': 15,
        	'stop_percent': 30
           }
        ],
        'exchange': 'binance_futures',
        'trade': {
          'currency_capital': 5000,
          'strategies': [
            /*{
                'strategy': 'moon',
                'options': {
                    'period': '1m'
                }
            },*/
            {
                'strategy': 'sar',
                'options': {
                    'period': '15m',
                    'amount_currency': 2500
                }
            }
          ]
        }
    })
})
