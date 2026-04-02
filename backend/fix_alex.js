const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || 'brspark-super-secret-key-2026';
function hashPassword(pw) { return crypto.createHmac('sha256', JWT_SECRET).update(pw).digest('hex'); }
const db = new sqlite3.Database('backend/brspark_cloud.db');
db.serialize(() => {
  db.run(`UPDATE users SET password_hash = '${hashPassword('123456')}' WHERE email = 'alex@brspark.com'`);
});
db.close(() => console.log('Senha Corrigida'));
