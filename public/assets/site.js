/* 站点公共脚本：配置、请求封装、列表页与详情页渲染 */
(function () {
  const SITE = {
    name: '半页',
    tagline: '把想清楚的事，写下来。',
    description: '一个安静的写作角落，记录技术、阅读与生活里那些值得留下的片段。',
  };

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  const pad = (n) => String(n).padStart(2, '0');

  function fmtDate(ts) {
    const d = new Date(ts || Date.now());
    return {
      full: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`,
      short: `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
    };
  }

  function readingTime(content) {
    const chars = String(content || '').replace(/\s/g, '').length;
    return Math.max(1, Math.round(chars / 350));
  }

  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
    return data;
  }

  /* ---------------- 列表页 ---------------- */

  function skeleton(n) {
    return Array.from({ length: n })
      .map(
        () => `<div class="skeleton">
          <div class="skeleton__cover"></div>
          <div class="skeleton__body">
            <div class="skeleton__line" style="width:28%"></div>
            <div class="skeleton__line" style="width:82%;height:16px"></div>
            <div class="skeleton__line" style="width:96%"></div>
            <div class="skeleton__line" style="width:64%;margin-bottom:0"></div>
          </div>
        </div>`
      )
      .join('');
  }

  function cardHTML(post, index) {
    const date = fmtDate(post.publishedAt || post.createdAt).short;
    const initial = esc((post.title || '文').trim().slice(0, 1));
    const cover = post.cover
      ? `<div class="card__cover"><img src="${esc(post.cover)}" alt="${esc(post.title)}" loading="${index < 2 ? 'eager' : 'lazy'}" /></div>`
      : `<div class="card__cover card__cover--blank"><span>${initial}</span></div>`;
    return `<a class="card" href="/p/${encodeURIComponent(post.id)}">
      ${cover}
      <div class="card__body">
        <div class="card__date">${date}</div>
        <h3 class="card__title">${esc(post.title)}</h3>
        <p class="card__excerpt">${esc(post.excerpt || '')}</p>
        <span class="card__more">阅读全文
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>
    </a>`;
  }

  async function initHome() {
    const list = document.querySelector('[data-post-list]');
    const counter = document.querySelector('[data-post-count]');
    const updated = document.querySelector('[data-last-updated]');
    if (!list) return;

    list.innerHTML = skeleton(4);

    try {
      const { posts } = await getJSON('/api/posts');
      if (!posts.length) {
        list.style.gridTemplateColumns = '1fr';
        list.innerHTML = `<div class="empty">
          <h3>还没有文章</h3>
          <p>登录后台发布第一篇，它会立刻出现在这里。</p>
        </div>`;
        if (counter) counter.textContent = '0 篇';
        return;
      }
      list.innerHTML = posts.map(cardHTML).join('');
      if (counter) counter.textContent = `${posts.length} 篇`;
      if (updated) updated.textContent = fmtDate(posts[0].publishedAt || posts[0].createdAt).full;
    } catch (err) {
      list.style.gridTemplateColumns = '1fr';
      list.innerHTML = `<div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ---------------- 详情页 ---------------- */

  function idFromPath() {
    const qs = new URLSearchParams(location.search);
    if (qs.get('id')) return qs.get('id');
    const m = location.pathname.match(/\/p(?:ost)?\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function initPost() {
    const host = document.querySelector('[data-article]');
    if (!host) return;
    const id = idFromPath();

    if (!id) {
      host.innerHTML = `<div class="empty"><h3>没有找到这篇文章</h3><p><a href="/">返回文章列表</a></p></div>`;
      return;
    }

    try {
      const { post } = await getJSON(`/api/posts/${encodeURIComponent(id)}`);
      const date = fmtDate(post.publishedAt || post.createdAt);
      document.title = `${post.title} · ${SITE.name}`;

      host.innerHTML = `
        <a class="backlink" href="/">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M13 8H4M7.5 4.5 4 8l3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          返回文章列表
        </a>
        <h1 class="article__title">${esc(post.title)}</h1>
        <div class="article__meta">
          <span>${date.full}</span>
          <span class="dot"></span>
          <span>约 ${readingTime(post.content)} 分钟读完</span>
        </div>
        ${post.cover ? `<figure class="article__cover"><img src="${esc(post.cover)}" alt="${esc(post.title)}" /></figure>` : ''}
        <div class="prose">${window.renderMarkdown(post.content)}</div>
        <div class="article__footer">
          <span>写于 ${date.short}</span>
          <a href="/">继续看看别的 →</a>
        </div>`;
    } catch (err) {
      host.innerHTML = `<div class="empty">
        <h3>文章不存在</h3>
        <p>${esc(err.message)}</p>
        <p style="margin-top:18px"><a href="/" style="color:var(--accent)">返回文章列表</a></p>
      </div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHome();
    initPost();
  });
})();
