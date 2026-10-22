import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT_DIR } from './store.js';

const DATA_DIR = path.join(ROOT_DIR, 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 天
const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
const sessions = new Map();

/* 会话落盘，重启服务后无需重新登录 */
function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESS_FILE, 'utf8'));
    for (const [token, value] of Object.entries(raw)) {
      if (value && value.expires > Date.now()) sessions.set(token, value);
    }
  } catch {
    /* 首次运行没有该文件 */
  }
}

function persistSessions() {
  try {
    const now = Date.now();
    for (const [token, value] of sessions) {
      if (value.expires <= now) sessions.delete(token);
    }
    fs.writeFileSync(SESS_FILE, JSON.stringify(Object.fromEntries(sessions)), 'utf8');
  } catch {
    /* 落盘失败不影响使用 */
  }
}

loadSessions();

/* ---------------- 账号初始化 ---------------- */

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function ensureAccount() {
  if (fs.existsSync(AUTH_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    } catch {
      /* 文件损坏则重建 */
    }
  }
  const username = process.env.BLOG_USER || 'admin';
  const password = process.env.BLOG_PASS || 'admin123';
  const salt = crypto.randomBytes(16).toString('hex');
  const record = { username, salt, hash: hashPassword(password, salt), createdAt: Date.now() };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(record, null, 2), 'utf8');
  console.log(`\n  已创建管理员账号：${username} / ${password}`);
  console.log(`  （可通过环境变量 BLOG_USER、BLOG_PASS 覆盖，配置文件：data/auth.json）\n`);
  return record;
}

let account = null;

export function verifyCredentials(username, password) {
  if (!account) account = ensureAccount();
  const nameOk =
    typeof username === 'string' &&
    username.length === account.username.length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(account.username));
  const hash = hashPassword(String(password || ''), account.salt);
  const passOk =
    hash.length === account.hash.length &&
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(account.hash));
  return nameOk && passOk;
}

/* ---------------- 会话 ---------------- */

export function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL });
  persistSessions();
  return { token, maxAge: Math.floor(SESSION_TTL / 1000) };
}

export function destroySession(token) {
  if (token) {
    sessions.delete(token);
    persistSessions();
  }
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function currentUser(req) {
  const token = readCookie(req, 'blog_session');
  if (!token) return null;
  const hit = sessions.get(token);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  hit.expires = Date.now() + SESSION_TTL; // 滑动续期
  return { username: hit.username, token };
}

export function cookieHeader(token, maxAge) {
  const parts = [
    `blog_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  return parts.join('; ');
}

export function clearCookieHeader() {
  return 'blog_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

/* ---------------- 登录限流 ---------------- */

const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function tooManyAttempts(ip) {
  const item = attempts.get(ip);
  if (!item) return false;
  if (Date.now() - item.first > WINDOW) {
    attempts.delete(ip);
    return false;
  }
  return item.count >= MAX_ATTEMPTS;
}

export function recordFailure(ip) {
  const item = attempts.get(ip);
  if (!item || Date.now() - item.first > WINDOW) {
    attempts.set(ip, { first: Date.now(), count: 1 });
  } else {
    item.count += 1;
  }
}

export function resetAttempts(ip) {
  attempts.delete(ip);
}
