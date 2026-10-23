// 重置管理员密码：npm run set-password -- '新密码'
// 会重建 data/auth.json 并清空所有登录会话，重启服务后生效。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');

const password = process.argv.slice(2).find((arg) => !arg.startsWith('-')) || '';

if (!password) {
  console.error('\n用法：npm run set-password -- \'新密码\'\n');
  console.error('注意密码要用单引号包起来，避免 ! $ 等字符被 shell 解释。\n');
  process.exit(1);
}

if (password.length < 8) {
  console.error('\n密码至少 8 位，换一个长一点的。\n');
  process.exit(1);
}

let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
} catch {
  /* 没有旧账号文件，按默认账号名创建 */
}

const username = process.env.BLOG_USER || existing.username || 'admin';
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  AUTH_FILE,
  JSON.stringify({ username, salt, hash, createdAt: Date.now() }, null, 2),
  'utf8'
);
// 旧会话全部作废，避免换了密码旧 Cookie 还能用
fs.writeFileSync(SESSION_FILE, '{}', 'utf8');

console.log(`\n已更新管理员账号：${username} / ${password}`);
console.log('已登录的会话全部失效。\n');
console.log('需要重启服务才生效：');
console.log('  Ctrl + C 停掉当前进程，再执行 npm start\n');
