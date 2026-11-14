const { createApp } = require('./app');
const { createPool } = require('./db');

const port = Number(process.env.PORT || 4000);
const pool = createPool(process.env.DATABASE_URL);
const app = createApp({
  db: pool,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN,
});

const server = app.listen(port, () => console.log(`API listening on :${port}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
}
