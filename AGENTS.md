# AGENTS.md

## Project overview

`crypto-trading-bot` (canbot) — a Node.js multi-exchange crypto trading bot with Telegram integration, web dashboard (Express + Twig + WebSocket), InfluxDB metrics, and SQLite storage.

## Commands

```bash
npm start                        # run bot in trade mode (= node index.js trade)
node index.js trade              # start trading (requires conf.json + instance.js)
node index.js server             # start web dashboard only (port 8068)
node index.js backfill -e <exch> -s <sym> -p <period> -d <days>  # historical data
npm test                         # mocha 'test/**/*.test.js'
npm run lint                     # eslint (airbnb + prettier)
npm run postinstall              # patch-package (runs automatically after npm install)
```

## Required runtime files (gitignored)

- **`conf.json`** — exchange API keys, InfluxDB config, Telegram/Slack/mail notify config, webserver credentials
- **`instance.js`** — symbol/pair definitions (static lists + dynamic volume-based selection). Must export an object with a `symbols` array and `init()` / `setExchangeManager()` methods

Both must exist or the bot will throw at boot. Dist files may exist as `conf.json.dist` / `instance.js.dist`.

## Architecture

**Event-driven system**: exchanges emit events (`ticker`, `candlestick`, `order`, `position_state_change`, `quarantine`, `watchdog`, etc.) → listeners react → strategy manager evaluates signals → order executor places orders.

**Service factory** (`src/modules/services.js`): Lazy singleton wiring for all components. Every module is accessed via `services.getXxx()`. Boot sequence: `services.boot(projectDir)` → load `instance.js` → load `conf.json` → create DB → create ExchangeManager and register on instance → `instances.init()` loads symbols → `ExchangeManager.init()` starts exchanges → 10s sync wait → second `refreshSymbols()` to capture open positions.

**Key modules**:
- `src/exchange/` — per-exchange implementations (Binance Futures is the primary one used)
- `src/modules/strategy/strategies/` — trading strategies auto-discovered at runtime via filesystem scan
- `src/modules/listener/` — event listeners (tick, create_order, exchange_order_watchdog)
- `src/modules/pairs/` — pair state machine (long/short/close/cancel)
- `src/dict/` — data objects (Order, Position, StrategyContext, etc.)
- `src/event/` — typed event classes
- `src/notify/` — Slack, Telegram, email notifications

## Strategy conventions

Strategies are auto-discovered from two directories:
- `src/modules/strategy/strategies/` (built-in)
- `var/strategies/` (user-added, survives updates)

A strategy is a JS file exporting a class with:
- `getName()` → strategy name string
- `buildIndicator(indicatorBuilder, options)` → registers required TA indicators
- `period(indicatorPeriod, options)` → returns `SignalResult` or `undefined`

Subfolder nesting supported: `foo/bar/bar.js` registers strategy from file named after its parent folder.

## Database

SQLite via `better-sqlite3` (Native C++ addon) at `bot.db`. Tables: `candlesticks`, `candlesticks_log`, `ticker`, `ticker_log`, `signals`, `logs`. Schema is both in `bot.sql` and auto-created by `services.getDatabase()`. WAL journal mode, exclusive locking.

## Native dependencies

`better-sqlite3`, `talib`, `tulind` require native compilation (build-essential + python3 on Linux). On Apple Silicon Macs, `talib`/`tulind` may fail — install with special env flags or skip if not running backtests.

## Docker

```bash
docker-compose up -d          # builds from Dockerfile, exposes 8068
```

Docker mounts: `bot.db`, `conf.json`, `var/`, `sessions/` as volumes.

## Dynamic pair selection

`instance.js` fetches Binance Futures 24h ticker volumes, computes 30-day averages, and selects top pairs every 6 hours. Open positions are preserved in the list. Static pairs defined in `instance.js` arrays are always included. Volume history stored in `volume_history.json`.

## Notable conventions

- `var/log/` for winston file logs (JSON format), console only shows `error` level
- `sessions/` for express session file store
- EventEmitter default max listeners bumped to 100 to suppress WebSocket reconnection warnings
- Global `unhandledRejection` and `uncaughtException` handlers in `index.js` prevent crashes
- ESLint: airbnb + prettier, `no-console: off`, `camelcase: off`, `func-names: off`
- Node engines: `^8.3.0 || ^10 || ^14 || ^15` (package.json), but Docker uses Node 16

## Auto-sync (GitHub + Server)

After every local `git commit`, changes auto-push to GitHub and pull on the server (`78.189.161.234`), via `.git/hooks/post-commit`.

For manual sync:
```bash
git push origin master
ssh canvarol@78.189.161.234 "cd ~/canbot && git pull origin master"
```

> **Warning**: The `post-commit` hook runs silently. If sync fails (e.g., server down, merge conflict), the commit still succeeds locally. Check with `git push` manually if unsure.

## Telegram bot

Commands handled in `tick_listener.js` via Telegraf. Requires `notify.telegram.chat_id` and `token` in `conf.json`.
