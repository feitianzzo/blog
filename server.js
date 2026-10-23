import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  db,
  save,
  newId,
  publicPost,
  normalizeTags,
  normalizeLinks,
  searchPosts,
  taxonomy,
  getSettings,
  setSettings,
  publishedPosts,
  neighborsOf,
  relatedByCategory,
  UPLOAD_DIR,
  ROOT_DIR,
} from './lib/store.js';
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
  const list = publishedPosts().map((p) => publicPost(p, false));
  res.json({ posts: list });
});

app.get('/api/posts/:id', (req, res) => {
  const post = db().posts.find((p) => p.id === req.params.id);
  const isOwner = Boolean(currentUser(req));
  if (!post || (post.status !== 'published' && !isOwner)) {
    return res.status(404).json({ error: '文章不存在或尚未发布' });
  }
  const { prev, next } = neighborsOf(post.id);
  res.json({
    post: publicPost(post),
    prev,
    next,
    related: relatedByCategory(post),
  });
});

app.get('/api/taxonomy', (_req, res) => {
  res.json(taxonomy());
});

// 前台需要的站点配置（只暴露可公开的字段）
app.get('/api/settings', (_req, res) => {
  res.json({ settings: getSettings() });
});

app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '');
  res.json({ q: q.trim(), results: searchPosts(q) });
});

/* ---------------- 评论 ---------------- */

const COMMENT_WINDOW = 10 * 60 * 1000;
const COMMENT_LIMIT = 5;
const commentHits = new Map(); // ip -> 时间戳数组，仅用于限流

function commentAllowed(ip) {
  const now = Date.now();
  const list = (commentHits.get(ip) || []).filter((t) => now - t < COMMENT_WINDOW);
  if (list.length >= COMMENT_LIMIT) {
    commentHits.set(ip, list);
    return false;
  }
  list.push(now);
  commentHits.set(ip, list);
  if (commentHits.size > 5000) commentHits.clear();
  return true;
}

function publicComment(c) {
  return { id: c.id, name: c.name, content: c.content, createdAt: c.createdAt };
}

app.get('/api/posts/:id/comments', (req, res) => {
  const post = db().posts.find((p) => p.id === req.params.id);
  const isOwner = Boolean(currentUser(req));
  if (!post || (post.status !== 'published' && !isOwner)) {
    return res.status(404).json({ error: '文章不存在或尚未发布' });
  }
  const list = db()
    .comments.filter((c) => c.postId === post.id)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(publicComment);
  res.json({ comments: list, total: list.length });
});

app.post('/api/posts/:id/comments', (req, res) => {
  // 蜜罐字段：真人看不见，填了就是机器人
  if (String(req.body?.website || '').trim()) return res.json({ ok: true });

  const post = db().posts.find((p) => p.id === req.params.id);
  if (!post || post.status !== 'published') {
    return res.status(404).json({ error: '文章不存在或尚未发布' });
  }

  const name = cleanText(req.body?.name, 24).replace(/\s+/g, ' ');
  const content = cleanText(req.body?.content, 1000);
  if (!name) return res.status(400).json({ error: '请填写昵称' });
  if (content.length < 2) return res.status(400).json({ error: '评论内容太短了，再多写几个字吧' });

  const ip = req.ip || 'unknown';
  if (!commentAllowed(ip)) {
    return res.status(429).json({ error: '评论太频繁了，请过几分钟再来' });
  }

  const comment = {
    id: newId(),
    postId: post.id,
    name,
    content,
    createdAt: Date.now(),
  };
  db().comments.push(comment);
  save();
  res.status(201).json({ comment: publicComment(comment) });
});

/* ---------------- 后台接口 ---------------- */

app.get('/api/admin/settings', requireAuth, (_req, res) => {
  res.json({ settings: getSettings() });
});

app.post('/api/admin/settings', requireAuth, (req, res) => {
  const body = req.body || {};
  const patch = {};

  if (body.introEnabled !== undefined) {
    if (typeof body.introEnabled !== 'boolean') {
      return res.status(400).json({ error: 'introEnabled 必须是布尔值' });
    }
    patch.introEnabled = body.introEnabled;
  }

  const TEXT_FIELDS = {
    introImage: 300,
    introTitle: 80,
    introSub: 160,
    heroTitle: 100,
    signature: 80,
    authorName: 24,
    authorBio: 160,
    authorAvatar: 300,
    githubUrl: 300,
    announcement: 200,
  };
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string') {
      return res.status(400).json({ error: `${key} 必须是字符串` });
    }
    patch[key] = body[key].trim().slice(0, max);
  }

  if (body.links !== undefined) {
    if (!Array.isArray(body.links)) {
      return res.status(400).json({ error: 'links 必须是数组' });
    }
    patch.links = normalizeLinks(body.links);
  }

  if (!Object.keys(patch).length) {
    return res.status(400).json({ error: '没有需要更新的设置项' });
  }

  res.json({ settings: setSettings(patch) });
});

/* ---------------- 设置项图片上传（开场图 / 头像） ---------------- */

const IMAGE_FIELD = upload.single('image');

app.post('/api/admin/uploads', requireAuth, (req, res) => {
  IMAGE_FIELD(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 5MB' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '请选择一张图片' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

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
    category: cleanText(req.body.category, 24) || null,
    tags: normalizeTags(req.body.tags),
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
  post.category = cleanText(req.body.category, 24) || null;
  post.tags = normalizeTags(req.body.tags);
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
  // 文章删除后，评论一并清理
  data.comments = data.comments.filter((c) => c.postId !== removed.id);
  save();
  res.json({ ok: true });
});

/* ---------------- 后台评论管理 ---------------- */

app.get('/api/admin/comments', requireAuth, (_req, res) => {
  const titles = new Map(db().posts.map((p) => [p.id, p.title]));
  const list = db()
    .comments.slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((c) => ({
      ...publicComment(c),
      postId: c.postId,
      postTitle: titles.get(c.postId) || '（文章已删除）',
    }));
  res.json({ comments: list, total: list.length });
});

app.delete('/api/admin/comments/:id', requireAuth, (req, res) => {
  const data = db();
  const index = data.comments.findIndex((c) => c.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: '评论不存在' });
  data.comments.splice(index, 1);
  save();
  res.json({ ok: true });
});

/* ---------------- 静态资源与页面 ---------------- */

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: true }));
app.use(express.static(path.join(ROOT_DIR, 'public'), { extensions: ['html'] }));

app.get(['/p/:id', '/post/:id'], (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'post.html'));
});

// 分类 / 标签的二级页面
app.get(['/categories', '/tags'], (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'topics.html'));
});

app.get(['/category/:name', '/tag/:name'], (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'taxonomy.html'));
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
