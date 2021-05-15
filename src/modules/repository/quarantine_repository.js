const QuarantineEvent = require('../../event/qurantine_event');

module.exports = class QuarantineRepository {
  constructor(db, eventEmitter) {
    this.db = db;
    this.eventEmitter = eventEmitter;

    this.createTable();
    // this.alterTable();
  }

  createTable() {
    const sql = `CREATE TABLE IF NOT EXISTS quarantines (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      exchange   VARCHAR(255) NULL,
      symbol     VARCHAR(255) NULL,
      side       VARCHAR(50)  NULL,
      reason     VARCHAR(50)  NULL,
      update_at  INT          NULL
    );`;

    return new Promise(resolve => {
      const stmt = this.db.prepare(sql);
      resolve(stmt.run());
    });
  }

  alterTable() {
    const sql = `ALTER TABLE quarantines
    ADD COLUMN reason VARCHAR(50);`;

    return new Promise(resolve => {
      const stmt = this.db.prepare(sql);
      resolve(stmt.run());
    });
  }

  get(exchange, symbol, side) {
    return new Promise(resolve => {
      const stmt = this.db.prepare(
        'SELECT * FROM quarantines WHERE exchange = $exchange AND symbol = $symbol AND side = $side'
      );

      resolve(
        stmt.get({
          exchange: exchange,
          symbol: symbol,
          side: side
        })
      );
    });
  }

  count() {
    return new Promise(resolve => {
      const stmt = this.db.prepare('SELECT count(*) AS count FROM quarantines');

      resolve(stmt.get().count);
    });
  }

  getAll() {
    return new Promise(resolve => {
      const stmt = this.db.prepare('SELECT * from quarantines');
      resolve(stmt.all());
    });
  }

  insert(exchange, symbol, side, reason = '-') {
    const stmt = this.db.prepare(
      'INSERT INTO quarantines(exchange, symbol, side, reason, update_at) VALUES ($exchange, $symbol, $side, $reason, $updateAt)'
    );

    stmt.run({
      exchange: exchange,
      symbol: symbol,
      side: side,
      reason: reason,
      updateAt: new Date().getTime()
    });
  }

  delete(exchange, symbol, side) {
    return new Promise(resolve => {
      const stmt = this.db.prepare(
        'DELETE FROM quarantines WHERE exchange = $exchange AND symbol = $symbol AND side = $side'
      );

      stmt.run({
        exchange: exchange,
        symbol: symbol,
        side: side
      });

      this.eventEmitter.emit('quarantine_delete', new QuarantineEvent(exchange, symbol, side));

      resolve();
    });
  }
};
