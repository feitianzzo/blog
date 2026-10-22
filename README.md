# 半页 · 一个安静的博客

带后台管理的轻量博客：文章列表、文章详情、登录后可发布 / 编辑 / 删除文章，支持封面图上传。
无前端框架、无数据库服务，`node server.js` 就能跑起来。

## 快速开始

```bash
npm install
npm start
```

打开：

| 地址 | 说明 |
| --- | --- |
| http://localhost:4173 | 博客首页（文章列表） |
| http://localhost:4173/p/<文章ID> | 文章详情 |
| http://localhost:4173/admin | 管理后台 |

端口被占用时换一个：`PORT=8080 npm start`

## 管理员账号

首次启动会自动生成 `data/auth.json`，默认账号：

- 账号 `admin`
- 密码 `admin123`

**建议第一次登录后立刻修改。** 两种方式：

1. 用环境变量覆盖（仅在 `data/auth.json` 不存在时生效）：
   ```bash
   BLOG_USER=me BLOG_PASS=your-password npm start
   ```
2. 直接删掉 `data/auth.json` 再重启，会按环境变量重新生成。

密码使用 scrypt + 随机盐存储，不保存明文；登录态是 HttpOnly Cookie，7 天有效，连续 15 分钟内输错 10 次会被临时锁定。

## 功能

**前台**
- 文章列表：封面、标题、摘要、日期，按发布时间倒序
- 文章详情：Markdown 渲染（标题 / 列表 / 引用 / 代码块 / 表格 / 图片 / 链接）
- 响应式：桌面双列、移动端单列

**后台**
- 登录验证，未登录无法调用任何写接口
- 文章列表：状态、时间、查看 / 编辑 / 删除
- 新建与编辑：标题、正文、可选封面图（拖拽或点击上传，≤5MB，JPG/PNG/WebP/GIF）
- 发布状态：立即发布 或 存为草稿（草稿不出现在前台，登录状态可预览）
- 正文支持 Markdown 编写 / 预览切换，`Ctrl/Cmd + S` 保存
- 删除二次确认；替换或删除文章时会清理无用的封面文件

## 上线

当前线上地址（WorkBuddy 托管）：

```
https://banye-blog.app.workbuddy.host/?sharecode=SZNMS4GSYQ
```

分享时必须带上完整的 `sharecode` 参数，缺少它会被拦截。

更新线上内容：在 WorkBuddy 里对这个目录重新发布即可，是覆盖式更新，链接保持不变。
注意重新发布会以本地文件为准，线上后台新写的文章会被本地的 `data/db.json` 覆盖 —— 如果主要在线上写作，发布前先把线上的 `data/db.json` 备份下来。

GitHub 只托管代码，不放线上站点（GitHub Pages 只能跑静态文件，跑不了 Node 服务）。

## 目录结构

```
server.js            Express 服务、接口、上传
lib/store.js         文章数据读写（JSON 文件）
lib/auth.js          账号、会话、登录限流
public/index.html    首页
public/post.html     文章详情
public/admin.html    后台
public/assets/       样式与脚本（md.js 是自带的 Markdown 渲染器）
data/db.json         文章数据（自动创建）
data/auth.json       管理员账号（自动创建）
uploads/             上传的封面图
```

## 数据与备份

所有内容都在两个地方：

- `data/db.json` —— 文章（标题、正文、状态、时间、封面路径）
- `uploads/` —— 封面图片

备份这两个即可完整迁移；换机器时一起拷走就能继续用。

## 说明

- 单进程、文件存储，适合个人博客的量级；文章量很大或需要多实例时再换数据库。
- 若部署到公网，建议放在 Nginx / Caddy 后面并开启 HTTPS，同时把 `Cookie` 的 `Secure` 打开（`lib/auth.js` 的 `cookieHeader`）。
- 修改站点名称与标语：`public/index.html`、`public/post.html`、`public/admin.html` 中的「半页」，以及 `public/assets/site.js` 顶部的 `SITE` 配置。
