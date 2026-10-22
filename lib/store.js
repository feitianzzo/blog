import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

let cache = null;

function seed() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return {
    posts: [
      {
        id: 'welcome',
        title: '开始写第一篇文章',
        content: `欢迎来到你的博客。这里没有复杂的配置，只有**写作**和**发布**两件事。

## 你可以做什么

- 在后台新建文章，填写标题与正文
- 正文支持 Markdown：标题、列表、引用、代码块、链接、图片
- 上传一张封面图，它会出现在列表页和详情页顶部
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
    return parsed;
  } catch (err) {
    console.error('[store] db.json 解析失败，已备份并使用空数据：', err.message);
    fs.copyFileSync(DB_FILE, `${DB_FILE}.broken-${Date.now()}`);
    return { posts: [] };
  }
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

export function excerptOf(content, len = 110) {
  const plain = String(content || '')
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
  return plain.length > len ? `${plain.slice(0, len)}…` : plain;
}

export function publicPost(post, withContent = true) {
  const out = {
    id: post.id,
    title: post.title,
    cover: post.cover || null,
    excerpt: excerptOf(post.content),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt || post.createdAt,
  };
  if (withContent) out.content = post.content;
  return out;
}

export const ROOT_DIR = ROOT;
export const UPLOAD_DIR = path.join(ROOT, 'uploads');
