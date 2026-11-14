const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

const fakeDb = {
  async query(sql, params) {
    if (sql.startsWith('SELECT 1')) return { rows: [{ '?column?': 1 }] };
    if (sql.includes('DISTINCT genre')) return { rows: [{ genre: 'Jazz' }, { genre: 'Pop' }] };
    if (sql.includes('UPDATE tracks')) return { rows: params[0] === 1 ? [{ plays: 11 }] : [] };
    if (sql.includes('FROM tracks WHERE id')) return { rows: params[0] === 1 ? [{ id: 1, title: 'Midnight Drive' }] : [] };
    if (sql.includes('FROM tracks')) return { rows: [{ id: 1, title: 'Midnight Drive' }] };
    return { rows: [] };
  },
};

async function withServer(fn) {
  const server = createApp({ db: fakeDb, jwtSecret: 'test-secret-test-secret' }).listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('health ok', () => withServer(async (b) => {
  const r = await fetch(`${b}/health`);
  assert.strictEqual(r.status, 200);
}));

test('tracks and genres', () => withServer(async (b) => {
  assert.strictEqual((await (await fetch(`${b}/api/tracks`)).json())[0].title, 'Midnight Drive');
  assert.deepStrictEqual(await (await fetch(`${b}/api/genres`)).json(), ['Jazz', 'Pop']);
}));

test('track id validation and 404', () => withServer(async (b) => {
  assert.strictEqual((await fetch(`${b}/api/tracks/abc`)).status, 400);
  assert.strictEqual((await fetch(`${b}/api/tracks/99`)).status, 404);
  assert.strictEqual((await fetch(`${b}/api/tracks/1`)).status, 200);
}));

test('play counter', () => withServer(async (b) => {
  assert.deepStrictEqual(await (await post(`${b}/api/tracks/1/play`, {})).json(), { plays: 11 });
  assert.strictEqual((await post(`${b}/api/tracks/99/play`, {})).status, 404);
}));

test('register rejects weak input', () => withServer(async (b) => {
  assert.strictEqual((await post(`${b}/api/auth/register`, { email: 'x', password: 'short' })).status, 400);
}));

test('favorites require auth', () => withServer(async (b) => {
  assert.strictEqual((await fetch(`${b}/api/favorites`)).status, 401);
}));

test('weak JWT secret refused', () => assert.throws(() => createApp({ db: fakeDb, jwtSecret: 'x' })));
