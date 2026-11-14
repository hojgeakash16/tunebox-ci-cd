'use strict';
const $ = (id) => document.getElementById(id);
const state = { tracks: [], favs: new Set(), view: 'home', genre: '', query: '', token: null, user: null, registerMode: false, current: null, playing: false, elapsed: 0 };

// Per-viewer convenience only; ignore if storage is blocked.
try { state.token = localStorage.getItem('token'); state.user = localStorage.getItem('user'); } catch { /* ignore */ }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  kids.forEach((k) => n.append(k));
  return n;
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#333');
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
// Lift dark track colours so the accent stays readable on the dark page.
function lift(hex) {
  const n = parseInt(safeColor(hex).slice(1, 7).padEnd(6, '0'), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0;
  const d = max - min;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `hsl(${Math.round(((h * 60) + 360) % 360)} ${Math.max(55, Math.round(d / (1 - Math.abs(max + min - 1) || 1) * 100))}% 66%)`;
}
const gradient = (t) => `linear-gradient(135deg, ${safeColor(t.color_a)}, ${safeColor(t.color_b)})`;

/* ---------- tiny in-browser synth: every track gets its own melody ---------- */
const synth = {
  ctx: null, timer: null, step: 0,
  scale: [0, 3, 5, 7, 10, 12, 15, 17], // minor pentatonic-ish
  start(track, offsetSec) {
    this.stop();
    this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    this.ctx.resume();
    const beat = 60 / track.bpm / 2;
    const root = 110 * 2 ** ((track.id * 5 % 12) / 12);
    this.step = Math.floor(offsetSec / beat);
    const tick = () => {
      const i = this.step++;
      const seed = (i * 7 + track.id * 13) % 11;
      const degree = this.scale[(seed + (i % 4 === 0 ? 0 : i % 3)) % this.scale.length];
      this.note(root * 2 ** (degree / 12) * (i % 16 < 8 ? 2 : 1), beat * 0.9, 0.12);
      if (i % 4 === 0) this.note(root / 2, beat * 3, 0.16, 'sine'); // bass
    };
    tick();
    this.timer = setInterval(tick, beat * 1000);
  },
  note(freq, dur, vol, type = 'triangle') {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  },
  stop() { clearInterval(this.timer); this.timer = null; },
};

/* ---------- player ---------- */
let clock = null;
function playTrack(t, fromStart = true) {
  if (!state.current || state.current.id !== t.id) {
    state.elapsed = 0;
    api(`/tracks/${t.id}/play`, { method: 'POST' }).then((r) => { t.plays = r.plays; if (state.view) renderList(); }).catch(() => {});
  }
  if (fromStart && state.current && state.current.id === t.id && !state.playing) { /* resume */ } else if (fromStart) state.elapsed = state.current && state.current.id === t.id ? state.elapsed : 0;
  state.current = t; state.playing = true;
  synth.start(t, state.elapsed);
  clearInterval(clock);
  clock = setInterval(() => {
    state.elapsed += 0.25;
    if (state.elapsed >= t.duration_sec) return step(1);
    drawProgress();
  }, 250);
  drawPlayer(); renderList();
}
function pause() { state.playing = false; synth.stop(); clearInterval(clock); drawPlayer(); renderList(); }
function step(dir) {
  const list = visible();
  if (!list.length) return;
  const i = list.findIndex((t) => state.current && t.id === state.current.id);
  state.elapsed = 0;
  playTrack(list[(i + dir + list.length) % list.length], false);
}
function drawProgress() {
  const t = state.current; if (!t) return;
  $('fill').style.width = `${Math.min(100, (state.elapsed / t.duration_sec) * 100)}%`;
  $('cur').textContent = fmt(state.elapsed);
}
function drawPlayer() {
  const t = state.current;
  $('toggle').textContent = state.playing ? '⏸' : '▶';
  $('disc').classList.toggle('spin', state.playing);
  if (!t) return;
  const root = document.documentElement.style;
  root.setProperty('--a', safeColor(t.color_a));
  root.setProperty('--b', safeColor(t.color_b));
  root.setProperty('--accent', lift(t.color_a === '#000000' || t.color_a === '#232526' ? t.color_b : t.color_a));
  $('np-title').textContent = t.title;
  $('np-artist').textContent = `${t.artist}, from ${t.album}`;
  $('np-art').style.background = gradient(t);
  $('dur').textContent = fmt(t.duration_sec);
  drawProgress();
}

/* ---------- list ---------- */
function visible() {
  let list = state.tracks;
  if (state.view === 'favorites') list = list.filter((t) => state.favs.has(t.id));
  if (state.genre) list = list.filter((t) => t.genre === state.genre);
  const q = state.query.trim().toLowerCase();
  if (q) list = list.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q));
  return list;
}

function renderChips() {
  const genres = [...new Set(state.tracks.map((t) => t.genre))].sort();
  const mk = (g, label) => {
    const b = el('button', { className: `chip${state.genre === g ? ' active' : ''}`, textContent: label });
    b.addEventListener('click', () => { state.genre = g; renderChips(); renderList(); });
    return b;
  };
  $('chips').replaceChildren(mk('', 'All'), ...genres.map((g) => mk(g, g)));
}

function renderList() {
  const list = visible();
  $('tracks').replaceChildren(...list.map((t, i) => {
    const heart = el('button', { className: `heart${state.favs.has(t.id) ? ' on' : ''}`, textContent: state.favs.has(t.id) ? '♥' : '♡', title: 'Like' });
    heart.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(t); });
    const isCur = state.current && state.current.id === t.id;
    const cover = el('div', { className: 'cover' }); cover.style.background = gradient(t);
    const row = el('li', { className: `row${isCur ? ' playing' : ''}${isCur && state.playing ? ' on' : ''}` },
      el('div', { className: 'cell' }, cover,
        el('div', { className: 'meta' }, el('div', { className: 't', textContent: t.title }), el('small', { textContent: t.artist }))),
      el('span', { className: 'muted hide-s', textContent: t.album }),
      el('span', { className: 'muted hide-s', textContent: `${compact(t.plays)} ${t.plays === 1 ? "play" : "plays"}` }),
      el('span', { className: 'muted', textContent: fmt(t.duration_sec) }),
      heart);
    row.addEventListener('click', () => (isCur && state.playing ? pause() : playTrack(t, true)));
    return row;
  }));
  $('empty').hidden = list.length > 0;
  $('banner-title').textContent = state.view === 'favorites' ? 'Liked Songs' : 'Discover';
}

/* ---------- auth + favorites ---------- */
async function toggleFav(t) {
  if (!state.token) return showAuth();
  const on = state.favs.has(t.id);
  try {
    await api(`/favorites/${t.id}`, { method: on ? 'DELETE' : 'POST' });
    on ? state.favs.delete(t.id) : state.favs.add(t.id);
    renderList();
  } catch (e) { if (e.status === 401) logout(); }
}
function showAuth() { $('auth-error').textContent = ''; $('auth-dialog').showModal(); }
function setAuthMode(r) {
  state.registerMode = r;
  $('auth-heading').textContent = r ? 'Create account' : 'Sign in';
  $('auth-toggle').textContent = r ? 'Have an account? Sign in' : 'New here? Create an account';
}
function updateAuthButton() { $('auth-btn').textContent = state.user ? `Sign out (${state.user})` : 'Sign in'; }
function logout() {
  state.token = null; state.user = null; state.favs.clear();
  try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch { /* ignore */ }
  updateAuthButton(); renderList();
}
async function loadFavs() {
  if (!state.token) return;
  try { state.favs = new Set((await api('/favorites')).map((t) => t.id)); }
  catch (e) { if (e.status === 401) logout(); }
}

async function init() {
  document.querySelectorAll('.nav nav button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.nav nav button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.view = b.dataset.view;
    if (state.view === 'favorites' && !state.token) return showAuth();
    renderList();
  }));
  $('search').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
  $('toggle').addEventListener('click', () => {
    if (!state.current) { const l = visible(); if (l.length) playTrack(l[0]); return; }
    state.playing ? pause() : playTrack(state.current, true);
  });
  $('next').addEventListener('click', () => step(1));
  $('prev').addEventListener('click', () => step(-1));
  $('bar').addEventListener('click', (e) => {
    if (!state.current) return;
    const r = $('bar').getBoundingClientRect();
    state.elapsed = ((e.clientX - r.left) / r.width) * state.current.duration_sec;
    if (state.playing) synth.start(state.current, state.elapsed);
    drawProgress();
  });
  $('auth-cancel').addEventListener('click', () => $('auth-dialog').close());
  $('auth-toggle').addEventListener('click', () => setAuthMode(!state.registerMode));
  $('auth-btn').addEventListener('click', () => (state.user ? logout() : showAuth()));
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const d = await api(`/auth/${state.registerMode ? 'register' : 'login'}`, {
        method: 'POST', body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
      state.token = d.token; state.user = d.user.email;
      try { localStorage.setItem('token', state.token); localStorage.setItem('user', state.user); } catch { /* ignore */ }
      $('auth-dialog').close(); $('password').value = '';
      updateAuthButton(); await loadFavs(); renderList();
    } catch (err) { $('auth-error').textContent = err.message; }
  });

  updateAuthButton();
  try { state.tracks = await api('/tracks'); }
  catch { $('empty').hidden = false; $('empty').textContent = 'Could not load tracks. Is the backend running?'; return; }
  await loadFavs();
  renderChips(); renderList();
}
init();
