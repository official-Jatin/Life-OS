const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'lifeos-db.json');

function getEncryptionKey() {
  const secret = process.env.DB_ENCRYPTION_KEY || process.env.QUMS_SESSION_COOKIE || 'lifeos-local-dev-secret-change-in-prod';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptText(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptText(payload) {
  if (!payload || typeof payload !== 'string') return null;
  try {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const derived = crypto.scryptSync(String(password), salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function readDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
      const empty = { users: {}, authTokens: {}, supportConfig: { upiId: '', coffeeUrl: '', scannerImage: '' }, activityLogs: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
      return empty;
    }
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      users: parsed.users || {},
      authTokens: parsed.authTokens || {},
      supportConfig: parsed.supportConfig || { upiId: '', coffeeUrl: '', scannerImage: '' },
      activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : []
    };
  } catch {
    return { users: {}, authTokens: {}, supportConfig: { upiId: '', coffeeUrl: '', scannerImage: '' }, activityLogs: [] };
  }
}

function writeDb(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function appendLog(db, event, detail) {
  db.activityLogs = Array.isArray(db.activityLogs) ? db.activityLogs : [];
  db.activityLogs.unshift({
    at: new Date().toISOString(),
    event,
    detail
  });
  db.activityLogs = db.activityLogs.slice(0, 100);
}

function logActivity(event, detail) {
  const db = readDb();
  appendLog(db, event, detail);
  writeDb(db);
}

function registerUser(username, password) {
  const cleanUser = String(username || '').trim().toLowerCase();
  if (!cleanUser || !password || String(password).length < 4) {
    return { ok: false, message: 'Username and password (min 4 chars) are required.' };
  }
  const db = readDb();
  if (db.users[cleanUser]) {
    return { ok: false, message: 'Username already exists. Please sign in instead.' };
  }
  const token = crypto.randomUUID();
  db.users[cleanUser] = {
    username: cleanUser,
    passwordHash: hashPassword(password),
    qumsEncrypted: null,
    qumsRegIdEncrypted: null,
    yearSem: 5,
    productivityData: null,
    createdAt: new Date().toISOString()
  };
  db.authTokens[token] = cleanUser;
  appendLog(db, 'USER_REGISTER', `New user "${cleanUser}" registered`);
  writeDb(db);
  return { ok: true, token, username: cleanUser };
}

function loginUser(username, password) {
  const cleanUser = String(username || '').trim().toLowerCase();
  const db = readDb();
  const user = db.users[cleanUser];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, message: 'Invalid username or password.' };
  }
  const token = crypto.randomUUID();
  db.authTokens[token] = cleanUser;
  appendLog(db, 'USER_LOGIN', `User "${cleanUser}" signed in`);
  writeDb(db);
  return { ok: true, token, username: cleanUser };
}

function getUserByToken(token) {
  if (!token) return null;
  const db = readDb();
  const username = db.authTokens[token];
  if (!username || !db.users[username]) return null;
  return db.users[username];
}

function saveQumsSessionForUser(token, { cookies, regId, yearSem }) {
  const db = readDb();
  const username = db.authTokens[token];
  if (!username || !db.users[username]) return false;
  db.users[username].qumsEncrypted = encryptText(cookies);
  db.users[username].qumsRegIdEncrypted = encryptText(regId);
  db.users[username].yearSem = Number(yearSem || 5);
  db.users[username].updatedAt = new Date().toISOString();
  appendLog(db, 'QUMS_LINKED', `User "${username}" linked QUMS session (Sem ${yearSem || 5})`);
  writeDb(db);
  return true;
}

function getQumsSessionForUser(token) {
  const user = getUserByToken(token);
  if (!user || !user.qumsEncrypted || !user.qumsRegIdEncrypted) return null;
  const cookies = decryptText(user.qumsEncrypted);
  const regId = decryptText(user.qumsRegIdEncrypted);
  if (!cookies || !regId) return null;
  return { cookies, regId, yearSem: user.yearSem || 5 };
}

function saveUserData(token, productivityData) {
  const db = readDb();
  const username = db.authTokens[token];
  if (!username || !db.users[username]) return false;
  db.users[username].productivityData = productivityData;
  db.users[username].updatedAt = new Date().toISOString();
  writeDb(db);
  return true;
}

function getUserData(token) {
  const user = getUserByToken(token);
  return user ? user.productivityData : null;
}

function getSupportConfig() {
  const db = readDb();
  return db.supportConfig || { upiId: '', coffeeUrl: '', scannerImage: '' };
}

function saveSupportConfig({ upiId, coffeeUrl, scannerImage }) {
  const db = readDb();
  db.supportConfig = {
    upiId: String(upiId || '').trim(),
    coffeeUrl: String(coffeeUrl || '').trim(),
    scannerImage: typeof scannerImage === 'string' ? scannerImage : (db.supportConfig?.scannerImage || '')
  };
  appendLog(db, 'ADMIN_SUPPORT_UPDATED', 'Admin updated global Support QR / UPI settings');
  writeDb(db);
  return db.supportConfig;
}

function getAdminOverview() {
  const db = readDb();
  const users = Object.values(db.users).map((u) => {
    const p = u.productivityData || {};
    return {
      username: u.username,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt || u.createdAt,
      hasQumsSession: Boolean(u.qumsEncrypted),
      yearSem: u.yearSem || 5,
      tasksCount: Array.isArray(p.tasks) ? p.tasks.length : 0,
      assignmentsCount: Array.isArray(p.assignments) ? p.assignments.length : 0,
      habitsCount: Array.isArray(p.habits) ? p.habits.length : 0,
      focusSessionsCount: Array.isArray(p.focusSessions) ? p.focusSessions.length : 0
    };
  });
  return {
    totalUsers: users.length,
    qumsLinkedCount: users.filter((u) => u.hasQumsSession).length,
    activeTokensCount: Object.keys(db.authTokens).length,
    users,
    activityLogs: db.activityLogs || [],
    supportConfig: db.supportConfig || { upiId: '', coffeeUrl: '', scannerImage: '' }
  };
}

module.exports = {
  registerUser,
  loginUser,
  getUserByToken,
  saveQumsSessionForUser,
  getQumsSessionForUser,
  saveUserData,
  getUserData,
  getSupportConfig,
  saveSupportConfig,
  getAdminOverview,
  logActivity
};
