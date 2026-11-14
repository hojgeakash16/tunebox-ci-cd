const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createApp({ db, jwtSecret, corsOrigin }) {
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be set and at least 16 characters');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: corsOrigin || false }));
  app.use(express.json({ limit: '10kb' }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });
  const playLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const parseId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

  function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try { req.user = jwt.verify(token, jwtSecret); next(); }
    catch { res.status(401).json({ error: 'Invalid or expired token' }); }
  }
  const signToken = (u) => jwt.sign({ id: u.id, email: u.email }, jwtSecret, { expiresIn: '12h' });

  app.get('/health', wrap(async (_req, res) => { await db.query('SELECT 1'); res.json({ status: 'ok' }); }));

  // ---- catalogue ----
  app.get('/api/genres', wrap(async (_req, res) => {
    const { rows } = await db.query('SELECT DISTINCT genre FROM tracks ORDER BY genre');
    res.json(rows.map((r) => r.genre));
  }));

  app.get('/api/tracks', wrap(async (req, res) => {
    const { genre, q } = req.query;
    const where = []; const params = [];
    if (typeof genre === 'string' && genre) { params.push(genre); where.push(`genre = $${params.length}`); }
    if (typeof q === 'string' && q.trim()) {
      params.push(`%${q.trim().slice(0, 100)}%`);
      where.push(`(title ILIKE $${params.length} OR artist ILIKE $${params.length} OR album ILIKE $${params.length})`);
    }
    const { rows } = await db.query(
      `SELECT * FROM tracks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY plays DESC, id`, params);
    res.json(rows);
  }));

  app.get('/api/tracks/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await db.query('SELECT * FROM tracks WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Track not found' });
    res.json(rows[0]);
  }));

  app.post('/api/tracks/:id/play', playLimiter, wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await db.query('UPDATE tracks SET plays = plays + 1 WHERE id = $1 RETURNING plays', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Track not found' });
    res.json({ plays: rows[0].plays });
  }));

  // ---- auth ----
  function validateCreds(body) {
    const { email, password } = body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) return 'A valid email is required';
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) return 'Password must be 8-72 characters';
    return null;
  }

  app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
    const err = validateCreds(req.body);
    if (err) return res.status(400).json({ error: err });
    const hash = await bcrypt.hash(req.body.password, 12);
    try {
      const { rows } = await db.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [req.body.email.toLowerCase(), hash]);
      res.status(201).json({ token: signToken(rows[0]), user: { id: rows[0].id, email: rows[0].email } });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
      throw e;
    }
  }));

  app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
    const err = validateCreds(req.body);
    if (err) return res.status(400).json({ error: err });
    const { rows } = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [req.body.email.toLowerCase()]);
    const ok = rows.length && (await bcrypt.compare(req.body.password, rows[0].password_hash));
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: signToken(rows[0]), user: { id: rows[0].id, email: rows[0].email } });
  }));

  // ---- favorites ----
  app.get('/api/favorites', requireAuth, wrap(async (req, res) => {
    const { rows } = await db.query(
      `SELECT t.* FROM favorites f JOIN tracks t ON t.id = f.track_id WHERE f.user_id = $1 ORDER BY f.added_at DESC`, [req.user.id]);
    res.json(rows);
  }));

  app.post('/api/favorites/:trackId', requireAuth, wrap(async (req, res) => {
    const id = parseId(req.params.trackId);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    try {
      await db.query('INSERT INTO favorites (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, id]);
    } catch (e) {
      if (e.code === '23503') return res.status(404).json({ error: 'Track not found' });
      throw e;
    }
    res.status(201).json({ ok: true });
  }));

  app.delete('/api/favorites/:trackId', requireAuth, wrap(async (req, res) => {
    const id = parseId(req.params.trackId);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    await db.query('DELETE FROM favorites WHERE user_id = $1 AND track_id = $2', [req.user.id, id]);
    res.status(204).end();
  }));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });
  return app;
}

module.exports = { createApp };
