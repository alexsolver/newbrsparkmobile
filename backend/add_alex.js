const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
function hashPassword(password) { return crypto.createHash('sha256').update(password).digest('hex'); }
const db = new sqlite3.Database('backend/brspark_cloud.db');
db.serialize(() => {
  db.run(`INSERT OR REPLACE INTO users (id, name, email, password_hash) VALUES ('alex-01', 'Alexandre', 'alex@brspark.com', '${hashPassword('123456')}')`);
});
db.close(() => console.log('Usuário Alex adicionado com sucesso!'));
