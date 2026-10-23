import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

let cache = null;

// 站点级配置，存在 db.json 的 settings 里，随数据一起备份
const DEFAULT_SETTINGS = {
  introEnabled: true, // 首页开场画面（图片上划）
  introImage: '/assets/intro.png', // 开场全屏图片
  introTitle: '把想清楚的事，\n写下来。', // 开场主标题（换行分行）
  introSub: '一个安静的写作角落，记录技术与生活里值得留下的片段。',
  heroTitle: '把想清楚的事，写下来。', // 主页大标题
  signature: '写下来，才算真的想清楚。', // 个性签名
  authorName: 'FeiTian',
  authorBio: '喜欢折腾各种电子产品，这个博客用来记录折腾过程中的一些教程与心得。',
  authorAvatar: '/assets/avatar.svg',
  githubUrl: 'https://github.com/feitianzzo/blog',
  announcement: 'FeiTian’s Blog · 记录技术、阅读与生活里那些值得留下的片段。',
  readFontSize: '17', // 正文字号（px）
  readColor: '#26262a', // 正文颜色
  // 个人链接：icon 留空时按域名自动识别，也可以填 emoji 或图片地址
  links: [{ name: 'Github', url: 'https://github.com/feitianzzo/blog', icon: '' }],
};

// 规范化链接列表：去掉空项、补全协议、限制数量
export function normalizeLinks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim().slice(0, 24);
    let url = String(item.url || '').trim().slice(0, 300);
    const icon = String(item.icon || '').trim().slice(0, 300);
    if (!name || !url) continue;
    if (!/^(https?:\/\/|mailto:|\/)/i.test(url)) url = `https://${url}`;
    out.push({ name, url, icon });
  }
  return out;
}

const TEXT_SETTINGS = [
  'readFontSize',
  'readColor',
  'introImage',
  'introTitle',
  'introSub',
  'heroTitle',
  'signature',
  'authorName',
  'authorBio',
  'authorAvatar',
  'githubUrl',
  'announcement',
];

function seed() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return {
    posts: [
      {
        id: 'welcome',
        title: '开始写第一篇文章',
        category: '开始',
        tags: ['写作', '使用说明'],
        content: `欢迎来到你的博客。这里没有复杂的配置，只有**写作**和**发布**两件事。

## 你可以做什么

- 在后台新建文章，填写标题与正文
- 正文支持 Markdown：标题、列表、引用、代码块、链接、图片
- 上传一张封面图，它会出现在列表页和详情页顶部
- 给文章加上分类与标签，读者可以按主题筛选
- 读者能在文章下方留言评论
- 发布后前台立刻可见，随时可以编辑或删除

## 一段示例代码

\`\`\`js
const post = await fetch('/api/posts').then((r) => r.json());
console.log(post);
\`\`\`

> 写作是把混乱的思绪整理成句子的过程。先从一篇短文开始。

回到后台，点右上角「新建文章」就能开始。祝写得开心。`,
        cover: '/uploads/seed-cover.png',
        status: 'published',
        createdAt: now - day * 2,
        updatedAt: now - day * 2,
        publishedAt: now - day * 2,
      },
      {
        id: 'markdown-guide',
        title: 'Markdown 速查：五种最常用的写法',
        category: '技术',
        tags: ['Markdown', '写作'],
        content: `正文编辑器支持 Markdown，这里列出最常用的五种写法，够日常使用。

## 1. 标题

用 \`##\` 表示二级标题，\`###\` 表示三级标题。

## 2. 强调

用 \`**加粗**\` 表示 **加粗**，用 \`*斜体*\` 表示 *斜体*。

## 3. 列表

- 无序列表用短横线
- 支持嵌套
  - 像这样

1. 有序列表用数字
2. 适合写步骤

## 4. 引用

> 引用适合放摘录或强调性的句子。

## 5. 图片与链接

\`![说明文字](图片地址)\` 插入图片，\`[文字](链接)\` 插入链接。封面图则在后台单独上传，会自动铺在文章顶部。`,
        cover: null,
        status: 'published',
        createdAt: now - day,
        updatedAt: now - day,
        publishedAt: now - day,
      },
    ],
    comments: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function load() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = seed();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(parsed.posts)) parsed.posts = [];
    if (!Array.isArray(parsed.comments)) parsed.comments = [];
    parsed.settings = normalizeSettings(parsed.settings);
    return parsed;
  } catch (err) {
    console.error('[store] db.json 解析失败，已备份并使用空数据：', err.message);
    fs.copyFileSync(DB_FILE, `${DB_FILE}.broken-${Date.now()}`);
    return { posts: [], comments: [], settings: { ...DEFAULT_SETTINGS } };
  }
}

// 旧库可能没有 settings，缺字段用默认值补齐
function normalizeSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULT_SETTINGS };
  if (typeof input.introEnabled === 'boolean') out.introEnabled = input.introEnabled;
  for (const key of TEXT_SETTINGS) {
    if (typeof input[key] === 'string') out[key] = input[key];
  }
  if (Array.isArray(input.links)) out.links = normalizeLinks(input.links);
  return out;
}

export function getSettings() {
  const data = db();
  data.settings = normalizeSettings(data.settings);
  return { ...data.settings };
}

export function setSettings(patch = {}) {
  const data = db();
  const next = normalizeSettings({ ...data.settings, ...patch });
  data.settings = next;
  save();
  return { ...next };
}

export function db() {
  if (!cache) cache = load();
  return cache;
}

export function save() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db(), null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

export function newId() {
  return crypto.randomBytes(6).toString('hex');
}

/* ---------------- 正文纯文本 / 字数 ---------------- */

// 把 Markdown 压成单行纯文本，用于摘要、搜索与字数统计
export function toPlain(content) {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 中文按字计，英文/数字按词计
export function countWords(content) {
  const plain = toPlain(content);
  const cjk = (plain.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g) || []).length;
  const latin = (plain.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
  return cjk + latin;
}

export function excerptOf(content, len = 110) {
  const plain = toPlain(content);
  return plain.length > len ? `${plain.slice(0, len)}…` : plain;
}

/* ---------------- 分类 / 标签 ---------------- */

export function normalizeTags(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[,，、;；]+/);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const tag = String(item || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

function postTags(post) {
  return Array.isArray(post.tags) ? post.tags : [];
}

export function publicPost(post, withContent = true) {
  const out = {
    id: post.id,
    title: post.title,
    cover: post.cover || null,
    excerpt: excerptOf(post.content),
    category: post.category || null,
    tags: postTags(post),
    words: countWords(post.content),
    commentCount: commentCountOf(post.id),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt || post.createdAt,
  };
  if (withContent) out.content = post.content;
  return out;
}

export function commentCountOf(postId) {
  return db().comments.filter((c) => c.postId === postId).length;
}

/* ---------------- 归档与相邻文章 ---------------- */

// 已发布文章，按时间倒序（最新在前）
export function publishedPosts() {
  return db()
    .posts.filter((p) => p.status === 'published')
    .sort((a, b) => (b.publishedAt || b.createdAt) - (a.publishedAt || a.createdAt));
}

// 上一篇 = 发布更早的一篇；下一篇 = 发布更晚的一篇
export function neighborsOf(postId) {
  const list = publishedPosts();
  const index = list.findIndex((p) => p.id === postId);
  if (index < 0) return { prev: null, next: null };
  const brief = (p) => (p ? publicPost(p, false) : null);
  return {
    prev: brief(list[index + 1]),
    next: brief(list[index - 1]),
  };
}

// 同一主分类下的其他文章
export function relatedByCategory(post, limit = 6) {
  if (!post.category) return [];
  return publishedPosts()
    .filter((p) => p.id !== post.id && p.category === post.category)
    .slice(0, limit)
    .map((p) => publicPost(p, false));
}

/* ---------------- 搜索 ---------------- */

export function searchPosts(query, limit = 20) {
  const q = String(query || '').trim().slice(0, 60);
  if (!q) return [];
  const needle = q.toLowerCase();
  const tokens = needle.split(/\s+/).filter(Boolean).slice(0, 5);

  const scored = [];
  for (const post of db().posts) {
    if (post.status !== 'published') continue;

    const title = String(post.title || '').toLowerCase();
    const category = String(post.category || '').toLowerCase();
    const tags = postTags(post).map((t) => t.toLowerCase());
    const plain = toPlain(post.content);
    const lower = plain.toLowerCase();

    let score = 0;
    if (title.includes(needle)) score += 40;
    if (category.includes(needle)) score += 18;
    if (tags.some((t) => t.includes(needle))) score += 22;
    if (lower.includes(needle)) score += 10;

    let tokenHits = 0;
    for (const token of tokens) {
      if (title.includes(token)) {
        score += 12;
        tokenHits++;
      } else if (tags.some((t) => t.includes(token))) {
        score += 7;
        tokenHits++;
      } else if (category.includes(token)) {
        score += 5;
        tokenHits++;
      } else if (lower.includes(token)) {
        score += 3;
        tokenHits++;
      }
    }

    if (score <= 0) continue;
    if (tokens.length > 1 && tokenHits === 0) continue;

    const at = lower.indexOf(needle);
    const sourceAt = at >= 0 ? at : tokens.map((t) => lower.indexOf(t)).find((i) => i >= 0) ?? -1;
    let snippet = excerptOf(post.content, 96);
    if (sourceAt >= 0) {
      const start = Math.max(0, sourceAt - 32);
      snippet = `${start > 0 ? '…' : ''}${plain.slice(start, start + 96).trim()}…`;
    }

    scored.push({
      score,
      item: {
        id: post.id,
        title: post.title,
        cover: post.cover || null,
        category: post.category || null,
        tags: postTags(post),
        publishedAt: post.publishedAt || post.createdAt,
        snippet,
      },
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || (b.item.publishedAt || 0) - (a.item.publishedAt || 0))
    .slice(0, limit)
    .map((s) => s.item);
}

export function taxonomy() {
  const categories = new Map();
  const tags = new Map();
  for (const post of db().posts) {
    if (post.status !== 'published') continue;
    if (post.category) categories.set(post.category, (categories.get(post.category) || 0) + 1);
    for (const tag of postTags(post)) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  const sort = (map) =>
    [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return { categories: sort(categories), tags: sort(tags) };
}

export const ROOT_DIR = ROOT;
export const UPLOAD_DIR = path.join(ROOT, 'uploads');
