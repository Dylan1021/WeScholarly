import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('app.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    fakeid TEXT NOT NULL UNIQUE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export const getAccounts = () => {
  return db.prepare('SELECT * FROM accounts ORDER BY added_at DESC').all();
};

export const addAccount = (name: string, fakeid: string) => {
  const stmt = db.prepare('INSERT INTO accounts (name, fakeid) VALUES (?, ?)');
  return stmt.run(name, fakeid);
};

export const removeAccount = (id: number) => {
  const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
  return stmt.run(id);
};

export const getAccountByFakeId = (fakeid: string) => {
  return db.prepare('SELECT * FROM accounts WHERE fakeid = ?').get(fakeid);
};
