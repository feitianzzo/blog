import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { db, save, newId, publicPost, UPLOAD_DIR, ROOT_DIR } from './lib/store.js';
import {
  verifyCredentials,
  createSession,
  destroySession,
  currentUser,
  cookieHeader,
  clearCookieHeader,
  tooManyAttempts,
  recordFailure,
  resetAttempts,
} from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

/* ---------------- 封面图上传 ---------------- */

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED[file.mimetype] || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) return cb(new Error('仅支持 JPG / PNG / WebP / GIF 图片'));
    cb(null, true);
  },
});

function removeUpload(coverUrl) {
  if (!coverUrl || !coverUrl.startsWith('/uploads/')) return;
  const target = path.join(UPLOAD_DIR, path.basename(coverUrl));
  fs.promises.unlink(target).catch(() => {});
}

/* ---------------- 鉴权 ---------------- */

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '登录已失效，请重新登录' });
  req.user = user;
  next();
}

/* ---------------- 登录 / 会话 ---------------- */

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: '尝试次数过多，请 15 分钟后再试' });
  }
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '请输入账号和密码' });
  }
  if (!verifyCredentials(username, password)) {
    recordFailure(ip);
    return res.status(401).json({ error: '账号或密码不正确' });
  }
  resetAttempts(ip);
  const { token, maxAge } = createSession(username);
  res.setHeader('Set-Cookie', cookieHeader(token, maxAge));
  res.json({ ok: true, username });
});

app.post('/api/logout', (req, res) => {
  destroySession(currentUser(req)?.token);
  res.setHeader('Set-Cookie', clearCookieHeader());
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const user = currentUser(req);
  res.json({ loggedIn: Boolean(user), username: user?.username || null });
});

/* ---------------- 前台接口 ---------------- */

app.get('/api/posts', (_req, res) => {
  const list = db()
    .posts.filter((p) => p.status === 'published')
    .sort((a, b) => (b.publishedAt || b.createdAt) - (a.publishedAt || a.createdAt))
    .map((p) => publicPost(p, false));
  res.json({ posts: list });
});

app.get('/api/posts/:id', (req, res) => {
  const post = db().posts.find((p) => p.id === req.params.id);
  const isOwner = Boolean(currentUser(req));
  if (!post || (post.status !== 'published' && !isOwner)) {
    return res.status(404).json({ error: '文章不存在或尚未发布' });
  }
  res.json({ post: publicPost(post) });
});

/* ---------------- 后台接口 ---------------- */

app.get('/api/admin/posts', requireAuth, (_req, res) => {
  const list = db()
    .posts.slice()
    .sort((a, b) => (b.publishedAt || b.createdAt) - (a.publishedAt || a.createdAt))
    .map((p) => ({ ...publicPost(p, false), status: p.status }));
  res.json({ posts: list, total: list.length });
});

app.get('/api/admin/posts/:id', requireAuth, (req, res) => {
  const post = db().posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  res.json({ post: { ...post } });
});

const COVER_FIELD = upload.single('cover');

function handleUpload(req, res, next) {
  COVER_FIELD(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 5MB' : err.message;
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

app.post('/api/admin/posts', requireAuth, handleUpload, (req, res) => {
  const title = cleanText(req.body.title, 160);
  const content = cleanText(req.body.content, 200000);
  if (!title) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    return res.status(400).json({ error: '标题不能为空' });
  }
  if (!content) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    return res.status(400).json({ error: '正文不能为空' });
  }
  const status = req.body.status === 'draft' ? 'draft' : 'published';
  const now = Date.now();
  const post = {
    id: newId(),
    title,
    content,
    cover: req.file ? `/uploads/${req.file.filename}` : null,
    status,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
  };
  db().posts.push(post);
  save();
  res.status(201).json({ post });
});

app.post('/api/admin/posts/:id', requireAuth, handleUpload, (req, res) => {
  const post = db().posts.find((p) => p.id === req.params.id);
  if (!post) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    return res.status(404).json({ error: '文章不存在' });
  }
  const title = cleanText(req.body.title, 160);
  const content = cleanText(req.body.content, 200000);
  if (!title || !content) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    return res.status(400).json({ error: '标题和正文都不能为空' });
  }
  const nextStatus = req.body.status === 'draft' ? 'draft' : 'published';
  const wasPublished = post.status === 'published';

  if (req.file) {
    removeUpload(post.cover);
    post.cover = `/uploads/${req.file.filename}`;
  } else if (req.body.removeCover === '1') {
    removeUpload(post.cover);
    post.cover = null;
  }

  post.title = title;
  post.content = content;
  post.status = nextStatus;
  post.updatedAt = Date.now();
  if (nextStatus === 'published' && !post.publishedAt) post.publishedAt = post.updatedAt;
  if (nextStatus === 'published' && !wasPublished) post.publishedAt = post.updatedAt;

  save();
  res.json({ post });
});

app.delete('/api/admin/posts/:id', requireAuth, (req, res) => {
  const data = db();
  const index = data.posts.findIndex((p) => p.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: '文章不存在' });
  const [removed] = data.posts.splice(index, 1);
  removeUpload(removed.cover);
  save();
  res.json({ ok: true });
});

/* ---------------- 静态资源与页面 ---------------- */

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: true }));
app.use(express.static(path.join(ROOT_DIR, 'public'), { extensions: ['html'] }));

app.get(['/p/:id', '/post/:id'], (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'post.html'));
});

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器开小差了，请稍后重试' });
});

app.listen(PORT, () => {
  console.log(`\n  博客已启动  →  http://localhost:${PORT}`);
  console.log(`  管理后台     →  http://localhost:${PORT}/admin`);
  console.log(`  数据文件     →  ${path.join(ROOT_DIR, 'data', 'db.json')}\n`);
});
