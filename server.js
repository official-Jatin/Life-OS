const path = require('path');
const crypto = require('crypto');
const express = require('express');
require('dotenv').config();

const qumsService = require('./services/qumsService');
const dbStore = require('./db/store');

const app = express();
const PORT = process.env.PORT || 3000;

const adminTokens = new Map(); // token -> { expiresAt }
const adminAttempts = new Map(); // ip -> { count, lockedUntil }
const ADMIN_TOKEN_TTL_MS = 30 * 60 * 1000;
const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyAdminPassword(password) {
  const hashSpec = process.env.ADMIN_PASSWORD_HASH;
  if (hashSpec && hashSpec.includes(':')) {
    const [salt, keyHex] = hashSpec.split(':');
    const derived = crypto.scryptSync(String(password || ''), salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    return derived.length === keyBuf.length && crypto.timingSafeEqual(derived, keyBuf);
  }
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedPass || expectedPass.length < 8) return false;
  return safeEqual(password, expectedPass);
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-lifeos-admin'];
  const entry = token ? adminTokens.get(token) : null;
  if (!entry || Date.now() > entry.expiresAt) {
    if (token) adminTokens.delete(token);
    return res.status(401).json({ ok: false, message: 'Admin session expired or unauthorized.' });
  }
  next();
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  const sid = req.headers['x-lifeos-session'];
  const authToken = req.headers['x-lifeos-auth'];
  const user = authToken ? dbStore.getUserByToken(authToken) : null;
  res.json({
    ok: true,
    ...qumsService.getSessionStatus(sid),
    user: user ? user.username : null
  });
});

// Public read-only Support QR / UPI config
app.get('/api/support', (req, res) => {
  res.json({ ok: true, support: dbStore.getSupportConfig() });
});

// Admin Auth & Console Routes
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const tracker = adminAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (Date.now() < tracker.lockedUntil) {
    return res.status(429).json({ ok: false, message: 'Too many failed attempts. Try again in 15 minutes.' });
  }

  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME;
  const hasSecret = Boolean(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD);

  if (!expectedUser || !hasSecret) {
    return res.status(503).json({
      ok: false,
      message: 'Admin credentials (ADMIN_USERNAME and ADMIN_PASSWORD_HASH or ADMIN_PASSWORD >= 8 chars) are not configured.'
    });
  }

  if (!safeEqual(username, expectedUser) || !verifyAdminPassword(password)) {
    tracker.count += 1;
    if (tracker.count >= 5) {
      tracker.lockedUntil = Date.now() + ADMIN_LOCKOUT_MS;
      tracker.count = 0;
    }
    adminAttempts.set(ip, tracker);
    dbStore.logActivity('ADMIN_LOGIN_FAILED', `Failed admin login attempt from ${ip}`);
    return res.status(401).json({ ok: false, message: 'Invalid admin credentials.' });
  }

  adminAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  adminTokens.set(token, { expiresAt: Date.now() + ADMIN_TOKEN_TTL_MS });
  dbStore.logActivity('ADMIN_LOGIN', 'Admin signed into console (30m TTL)');
  res.json({ ok: true, adminToken: token, expiresInMinutes: 30 });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-lifeos-admin'];
  if (token) adminTokens.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/overview', requireAdmin, (req, res) => {
  res.json({ ok: true, ...dbStore.getAdminOverview() });
});

app.put('/api/admin/support', requireAdmin, (req, res) => {
  const saved = dbStore.saveSupportConfig(req.body || {});
  res.json({ ok: true, support: saved });
});

// LifeOS User Account Routes
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  const result = dbStore.registerUser(username, password);
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = dbStore.loginUser(username, password);
  res.status(result.ok ? 200 : 401).json(result);
});

app.get('/api/user/data', (req, res) => {
  const authToken = req.headers['x-lifeos-auth'];
  const user = dbStore.getUserByToken(authToken);
  if (!user) return res.status(401).json({ ok: false, message: 'Unauthorized' });
  res.json({
    ok: true,
    username: user.username,
    hasSavedQumsSession: Boolean(user.qumsEncrypted),
    data: user.productivityData
  });
});

app.put('/api/user/data', (req, res) => {
  const authToken = req.headers['x-lifeos-auth'];
  const saved = dbStore.saveUserData(authToken, req.body?.data);
  if (!saved) return res.status(401).json({ ok: false, message: 'Unauthorized' });
  res.json({ ok: true });
});

// QUMS ERP Routes
app.get('/api/qums/captcha', async (req, res) => {
  try {
    const result = await qumsService.initLoginChallenge();
    res.json(result);
  } catch (error) {
    res.status(504).json({
      ok: false,
      status: 'network_error',
      message: `Unable to load QUMS login page: ${error.message}`
    });
  }
});

app.post('/api/qums/login', async (req, res) => {
  const authToken = req.headers['x-lifeos-auth'];
  const { statusCode, body } = await qumsService.authenticateWithCredentials({
    ...(req.body || {}),
    authToken
  });
  res.status(statusCode).json(body);
});

app.post('/api/qums/logout', (req, res) => {
  const sid = req.headers['x-lifeos-session'] || req.body?.sessionId;
  qumsService.clearSession(sid);
  res.json({ ok: true });
});

app.get('/api/erp/attendance', async (req, res) => {
  const sid = req.headers['x-lifeos-session'];
  const authToken = req.headers['x-lifeos-auth'];
  const yearSemOverride = req.query.yearSem;
  const { statusCode, body } = await qumsService.fetchYearSemAttendance({
    sessionId: sid,
    yearSemOverride,
    authToken
  });
  res.status(statusCode).json(body);
});

app.post('/api/attendance', async (req, res) => {
  const sid = req.headers['x-lifeos-session'] || req.body?.sessionId;
  const authToken = req.headers['x-lifeos-auth'];
  const yearSemOverride = req.body?.yearSem;
  const { statusCode, body } = await qumsService.fetchYearSemAttendance({
    sessionId: sid,
    yearSemOverride,
    authToken
  });
  res.status(statusCode).json(body);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LifeOS server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
