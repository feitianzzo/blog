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
| http://localhost:4173 | 博客首页（左栏头像公告 / 右栏签名介绍 + 文章列表） |
| http://localhost:4173/p/<文章ID> | 文章详情（左栏资料与目录，右栏阅读工具） |
| http://localhost:4173/categories | 全部分类 |
| http://localhost:4173/tags | 全部标签 |
| http://localhost:4173/category/<分类名> | 某个分类下的文章 |
| http://localhost:4173/tag/<标签名> | 某个标签下的文章 |
| http://localhost:4173/admin | 管理后台 |

端口被占用时换一个：`PORT=8080 npm start`

## 管理员账号

账号名默认 `admin`，密码**只在第一次启动时生成**：`data/auth.json` 不存在时，用默认密码 `admin123` 创建并打印到控制台；该文件一旦存在，之后一律以文件里的为准。

`data/` 不进版本库，所以 clone 下来的仓库是「没有账号文件」的状态，首次 `npm start` 会生成 `admin / admin123`。但如果这台机器（或线上）之前已经跑过，密码就是当时设置的那个，不是 `admin123`。

**改密码 / 忘记密码**（不需要知道旧密码）：

```bash
npm run set-password -- '你的新密码'
```

会重建 `data/auth.json`、清空所有登录会话（旧 Cookie 立刻失效），重启服务后生效。密码用单引号包住，避免 `!` `$` 被 shell 解释。

也可以用环境变量指定（仅在 `data/auth.json` 不存在时生效）：

```bash
BLOG_USER=me BLOG_PASS=your-password npm start
```

密码使用 scrypt + 随机盐存储，不保存明文；登录态是 HttpOnly Cookie，7 天有效，连续 15 分钟内输错 10 次会被临时锁定。

## 功能

**前台**
- 首页左右分栏：左侧头像 + 公告，右侧大标题、个性签名、个人介绍与站点统计；文案全部来自后台设置
- 文章列表：封面、标题、摘要、日期、主分类、多个标签、字数、评论数，按发布时间倒序
- 分类与标签：每个分类 / 标签都有独立二级页（`/category/名称`、`/tag/名称`），导航与首页 chip 都是真实链接，不再有锚点空链
- 站内搜索：导航栏搜索按钮（快捷键 `/` 或 `Ctrl/Cmd + K`），覆盖标题、正文、分类、标签，结果带摘要片段，支持 ↑↓ 选择
- 文章详情：Markdown 渲染（标题 / 列表 / 引用 / 代码块 / 表格 / 图片 / 链接），显示总字数与预计阅读时间
- 文章页三栏布局：左栏依次是头像介绍（含文章 / 标签 / 分类统计与 Github 入口）、公告、目录（当前文章小标题，滚动高亮且高亮项自动居中）、当前分类下的其他文章、最新 3 篇，整栏随正文吸附滚动；右下角悬浮功能栏提供阅读模式、日夜模式、前往评论、回到顶部
- 文章底部「上一篇 / 下一篇」显示相邻文章的标题，到边界时给出提示
- 评论：读者留昵称即可留言，提交后立即显示；15 分钟内同一 IP 最多 5 条；带蜜罐字段拦截机器人
- 开场画面：桌面端每次进入首页都会展示全屏图片 + 文字，点击任意处图片上滑进入；点导航「主页」可跳过；移动端直接进首页
- 日夜模式：跟随系统，可手动切换并记住选择（`localStorage` 的 `banye_theme`）
- 响应式：桌面三栏、平板两栏、移动端单列（功能栏变成底部悬浮工具条）

**后台**
- 登录验证，未登录无法调用任何写接口
- 文章列表：状态、分类、字数、评论数、时间、查看 / 编辑 / 删除
- 新建与编辑：标题、正文、分类、标签（逗号分隔，最多 8 个）、可选封面图（拖拽或点击上传，≤5MB，JPG/PNG/WebP/GIF）
- 发布状态：立即发布 或 存为草稿（草稿不出现在前台，登录状态可预览）
- 正文支持 Markdown 编写 / 预览切换，实时字数统计，`Ctrl/Cmd + S` 保存
- 评论管理：独立分页签，可查看文章、删除留言
- 站点设置：独立分页签，可配置开场画面开关、开场图片（支持上传）与开场两行文字、主页大标题 / 个性签名 / 个人介绍、昵称、头像地址、Github 链接与公告；保存后前台立即生效
- 删除二次确认；替换或删除文章时会清理无用的封面文件，删除文章时一并清理其评论

## 代码仓库

```
https://github.com/feitianzzo/blog
```

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
lib/store.js         文章 / 评论数据读写，字数与搜索
lib/auth.js          账号、会话、登录限流
public/index.html    首页（开场、左右分栏 hero、分类标签、列表）
public/post.html     文章详情（左栏资料 / 目录，右栏阅读工具，正文与评论）
public/topics.html   分类 / 标签总览（/categories、/tags）
public/taxonomy.html 分类 / 标签详情（/category/:name、/tag/:name）
public/admin.html    后台（文章、评论、设置）
public/assets/style.css    基础样式
public/assets/modules.css  开场 / 搜索 / 分类标签 / 评论样式
public/assets/layout.css   文章页三栏、分类标签页、首页分栏与深色主题
public/assets/intro.png    开场画面默认背景图
public/assets/avatar.svg   默认头像
public/assets/        其余样式与脚本（md.js 是自带的 Markdown 渲染器）
data/db.json         文章与评论数据（自动创建）
data/auth.json       管理员账号（自动创建）
uploads/             上传的封面图
```

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/posts` | 已发布文章（含分类、标签、字数、评论数） |
| GET | `/api/posts/:id` | 文章详情（含 `prev` / `next` 相邻文章与 `related` 同分类文章） |
| GET | `/api/taxonomy` | 分类与标签及各自文章数 |
| GET | `/api/search?q=` | 站内搜索 |
| GET | `/api/settings` | 站点设置（前台读取开关） |
| GET | `/api/posts/:id/comments` | 文章评论 |
| POST | `/api/posts/:id/comments` | 发表评论（`name`、`content`） |
| POST | `/api/login` · `/api/logout` · GET `/api/session` | 登录态 |
| GET/POST/DELETE | `/api/admin/posts…` | 后台文章管理 |
| GET | `/api/admin/comments` | 全部评论 |
| DELETE | `/api/admin/comments/:id` | 删除评论 |
| GET / POST | `/api/admin/settings` | 读取 / 修改站点设置（开场、主页文案、站长资料） |
| POST | `/api/admin/uploads` | 上传图片（表单字段 `image`），返回 `url`，用于开场图 |

## 数据与备份

所有内容都在两个地方：

- `data/db.json` —— 文章（标题、正文、分类、标签、状态、时间、封面路径）、评论与站点设置
- `uploads/` —— 封面图片

备份这两个即可完整迁移；换机器时一起拷走就能继续用。

## 开场画面

- 后台「设置 → 首页开场画面」是总开关，关掉后所有访客都直接进入首页（存在 `data/db.json` 的 `settings.introEnabled`）。
- 开启时桌面端（≥861px）**每次进入首页**都会显示，不再记忆「已看过」；点导航栏的「主页」会带 `?intro=0` 直接进入文章列表。
- `/?intro=1` 强制预览（也用于关闭期间预览），`/?intro=0` 临时跳过。
- 开场图片与两行文字都在后台配置：`settings.introImage`、`settings.introTitle`（换行即分行）、`settings.introSub`；图片可直接在后台上传，存到 `uploads/`。
- 移动端与开启「减少动态效果」的系统设置下会自动跳过。

## 可配置内容（前台 ← 后台）

所有文案存在 `data/db.json` 的 `settings` 里，后台「设置 → 保存全部设置」一次性提交，前台各页面读取同一份配置：

| 字段 | 显示位置 |
| --- | --- |
| `introEnabled` | 首页开场画面开关 |
| `introImage` / `introTitle` / `introSub` | 开场画面的背景图、主标题（`\n` 分行）、副标题 |
| `heroTitle` | 主页右栏大标题 |
| `signature` | 主页右栏个性签名 |
| `authorBio` | 主页右栏个人介绍 + 文章页左栏简介 |
| `authorName` / `authorAvatar` | 首页左栏与文章页左栏的头像、昵称 |
| `announcement` | 首页左栏与文章页左栏的公告卡片 |
| `githubUrl` | 文章页左栏 Github 按钮 |

新增字段时，`lib/store.js` 的 `DEFAULT_SETTINGS` / `TEXT_SETTINGS`、`server.js` 的 `TEXT_FIELDS`、`public/assets/admin.js` 的 `PROFILE_FIELDS` 与 `public/assets/site.js` 的渲染函数需要一一对应。

## 说明

- 单进程、文件存储，适合个人博客的量级；文章量很大或需要多实例时再换数据库。
- 若部署到公网，建议放在 Nginx / Caddy 后面并开启 HTTPS，同时把 `Cookie` 的 `Secure` 打开（`lib/auth.js` 的 `cookieHeader`）。
- 修改站点名称与标语：`public/index.html`、`public/post.html`、`public/admin.html` 中的「半页」，以及 `public/assets/site.js` 顶部的 `SITE` 配置。
