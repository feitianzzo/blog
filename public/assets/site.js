/* 站点公共脚本：配置、请求封装、开场、搜索、列表筛选、详情与评论 */
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
  const num = (n) => Number(n || 0).toLocaleString('zh-CN');

  function fmtDate(ts) {
    const d = new Date(ts || Date.now());
    return {
      full: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`,
      short: `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
      time: `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }

  function readingTime(words) {
    return Math.max(1, Math.round((words || 0) / 350));
  }

  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
    return data;
  }

  function syncQuery(category, tag) {
    const params = new URLSearchParams(location.search);
    if (category) params.set('category', category);
    else params.delete('category');
    if (tag) params.set('tag', tag);
    else params.delete('tag');
    const qs = params.toString();
    history.pushState({ category, tag }, '', qs ? `/?${qs}` : '/');
  }

  /* ---------------- 开场画面 ---------------- */

  function initIntro() {
    const el = document.getElementById('intro');
    if (!el || el.hidden) return;

    let done = false;
    const dismiss = () => {
      if (done) return;
      done = true;
      el.classList.add('is-leaving');
      document.body.classList.remove('intro-lock');
      document.body.classList.add('intro-done');
      document.removeEventListener('keydown', onKey);
      try {
        localStorage.setItem('banye_intro_seen', '1');
      } catch {
        /* 隐私模式下忽略 */
      }
      setTimeout(() => el.remove(), 1100);
    };

    function onKey(e) {
      if (['Enter', ' ', 'Escape', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        dismiss();
      }
    }

    el.addEventListener('click', dismiss);
    el.addEventListener('wheel', dismiss, { passive: true, once: true });
    el.addEventListener('touchstart', dismiss, { passive: true, once: true });
    document.addEventListener('keydown', onKey);
    // 图片加载完成后再让提示浮现
    requestAnimationFrame(() => el.classList.add('is-ready'));
  }

  /* ---------------- 站内搜索 ---------------- */

  function buildSearch() {
    const triggers = Array.from(document.querySelectorAll('[data-search-open]'));
    if (!triggers.length) return;

    const wrap = document.createElement('div');
    wrap.className = 'search';
    wrap.id = 'siteSearch';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="search__backdrop" data-search-close></div>
      <div class="search__panel" role="dialog" aria-modal="true" aria-label="搜索文章">
        <div class="search__field">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <circle cx="8.6" cy="8.6" r="5.4" /><path d="m12.7 12.7 3.6 3.6" stroke-linecap="round" />
          </svg>
          <input class="search__input" id="searchInput" type="search" placeholder="搜索标题、正文、分类或标签…" autocomplete="off" spellcheck="false" />
          <button class="search__close" type="button" data-search-close aria-label="关闭搜索">Esc</button>
        </div>
        <div class="search__body" data-search-results></div>
        <div class="search__foot">
          <span>↑ ↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span data-search-tip>输入关键词开始搜索</span>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const input = wrap.querySelector('#searchInput');
    const body = wrap.querySelector('[data-search-results]');
    const tip = wrap.querySelector('[data-search-tip]');
    let activeIndex = -1;
    let timer = null;
    let lastQ = '';
    let tagCache = null;

    function setActive(index) {
      const items = Array.from(body.querySelectorAll('.sr'));
      if (!items.length) return;
      activeIndex = (index + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function open() {
      wrap.hidden = false;
      document.body.classList.add('search-open');
      input.value = '';
      lastQ = '';
      activeIndex = -1;
      showIdle();
      setTimeout(() => input.focus(), 30);
    }

    function close() {
      wrap.hidden = true;
      document.body.classList.remove('search-open');
      triggers[0] && triggers[0].focus({ preventScroll: true });
    }

    async function showIdle() {
      tip.textContent = '输入关键词开始搜索';
      if (!tagCache) {
        try {
          tagCache = await getJSON('/api/taxonomy');
        } catch {
          tagCache = { tags: [] };
        }
      }
      const tags = (tagCache.tags || []).slice(0, 8);
      body.innerHTML = tags.length
        ? `<div class="search__idle">
            <p class="search__idle-label">试着搜一搜</p>
            <div class="chips chips--sm">${tags
              .map((t) => `<button class="chip" type="button" data-search-tag="${esc(t.name)}">${esc(t.name)}</button>`)
              .join('')}</div>
          </div>`
        : '';
    }

    function renderResults(q, results) {
      if (!q) return showIdle();
      if (!results.length) {
        body.innerHTML = `<div class="search__empty">
          <p>没有找到与「${esc(q)}」相关的文章</p>
          <span>换个短一点的关键词试试</span>
        </div>`;
        tip.textContent = '0 条结果';
        return;
      }
      body.innerHTML = results
        .map((r) => {
          const cat = r.category ? `<span class="sr__cat">${esc(r.category)}</span>` : '';
          const tags = (r.tags || []).slice(0, 2).map((t) => `#${esc(t)}`).join(' ');
          return `<a class="sr" href="/p/${encodeURIComponent(r.id)}">
            <div class="sr__main">
              <h4 class="sr__title">${esc(r.title)}</h4>
              <p class="sr__snippet">${esc(r.snippet)}</p>
              <div class="sr__meta">${cat}<span>${fmtDate(r.publishedAt).short}</span>${tags ? `<span>${tags}</span>` : ''}</div>
            </div>
            <svg class="sr__arrow" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>`;
        })
        .join('');
      activeIndex = -1;
      tip.textContent = `${results.length} 条结果`;
    }

    async function run(q) {
      lastQ = q;
      if (!q) return showIdle();
      body.innerHTML = `<div class="search__loading"><i></i><span>搜索中…</span></div>`;
      try {
        const data = await getJSON(`/api/search?q=${encodeURIComponent(q)}`);
        if (lastQ !== q) return;
        renderResults(q, data.results || []);
      } catch (err) {
        if (lastQ !== q) return;
        body.innerHTML = `<div class="search__empty"><p>搜索失败</p><span>${esc(err.message)}</span></div>`;
      }
    }

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(timer);
      timer = setTimeout(() => run(q), 180);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(activeIndex - 1);
      } else if (e.key === 'Enter') {
        const items = Array.from(body.querySelectorAll('.sr'));
        const target = items[activeIndex >= 0 ? activeIndex : 0];
        if (target) {
          e.preventDefault();
          location.href = target.getAttribute('href');
        }
      }
    });

    wrap.addEventListener('click', (e) => {
      const tagBtn = e.target.closest('[data-search-tag]');
      if (tagBtn) {
        input.value = tagBtn.dataset.searchTag;
        run(input.value);
        input.focus();
        return;
      }
      if (e.target.closest('[data-search-close]')) close();
    });

    triggers.forEach((btn) => btn.addEventListener('click', open));

    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (wrap.hidden) open();
      } else if (e.key === 'Escape' && !wrap.hidden) {
        close();
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrap.hidden && e.target.closest('.sr')) close();
    });
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
    const cat = post.category
      ? `<span class="card__cat">${esc(post.category)}</span>`
      : `<span class="card__cat card__cat--none">随笔</span>`;
    const words = post.words ? `${num(post.words)} 字` : '';
    const comments = post.commentCount ? `${num(post.commentCount)} 评论` : '';
    return `<a class="card" href="/p/${encodeURIComponent(post.id)}">
      ${cover}
      <div class="card__body">
        <div class="card__top">${cat}<span class="card__date">${date}</span></div>
        <h3 class="card__title">${esc(post.title)}</h3>
        <p class="card__excerpt">${esc(post.excerpt || '')}</p>
        <div class="card__foot">
          <span class="card__more">阅读全文
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="card__stats">${[words, comments].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
    </a>`;
  }

  async function initHome() {
    const list = document.querySelector('[data-post-list]');
    if (!list) return;

    const counter = document.querySelector('[data-post-count]');
    const totalWords = document.querySelector('[data-total-words]');
    const updated = document.querySelector('[data-last-updated]');
    const titleEl = document.querySelector('[data-list-title]');
    const countLabel = document.querySelector('[data-list-count]');
    const filterBar = document.querySelector('[data-filter-bar]');
    const filterText = document.querySelector('[data-filter-text]');
    const catChips = document.querySelector('[data-category-chips]');
    const tagChips = document.querySelector('[data-tag-chips]');

    const state = {
      posts: [],
      taxonomy: { categories: [], tags: [] },
      category: new URLSearchParams(location.search).get('category') || '',
      tag: new URLSearchParams(location.search).get('tag') || '',
    };

    list.innerHTML = skeleton(4);

    function chipHTML(label, count, active, dataAttr, value) {
      return `<button class="chip${active ? ' is-active' : ''}" type="button" ${dataAttr}="${esc(value)}">
        <span>${esc(label)}</span><em>${count}</em>
      </button>`;
    }

    function renderChips() {
      if (catChips) {
        const total = state.taxonomy.categories.reduce((sum, c) => sum + c.count, 0);
        catChips.innerHTML =
          chipHTML('全部', total, !state.category, 'data-category', '') +
          state.taxonomy.categories
            .map((c) => chipHTML(c.name, c.count, state.category === c.name, 'data-category', c.name))
            .join('');
      }
      if (tagChips) {
        tagChips.innerHTML = state.taxonomy.tags.length
          ? state.taxonomy.tags
              .map((t) => chipHTML('#' + t.name, t.count, state.tag === t.name, 'data-tag', t.name))
              .join('')
          : '<span class="chips__empty">还没有标签，写文章时可以加上</span>';
      }
    }

    function applyFilter() {
      const { posts, category, tag } = state;
      let filtered = posts;
      if (category) filtered = filtered.filter((p) => p.category === category);
      if (tag) filtered = filtered.filter((p) => (p.tags || []).includes(tag));

      renderChips();

      if (titleEl) titleEl.textContent = category || tag ? '筛选结果' : '最新文章';
      if (countLabel) {
        countLabel.textContent = `${filtered.length} 篇${category || tag ? ' · 筛选' : ' · ALL POSTS'}`;
      }

      if (filterBar) {
        if (category || tag) {
          filterBar.hidden = false;
          const bits = [];
          if (category) bits.push(`分类「${esc(category)}」`);
          if (tag) bits.push(`标签 #${esc(tag)}`);
          filterText.innerHTML = `正在查看 ${bits.join(' + ')}`;
        } else {
          filterBar.hidden = true;
        }
      }

      if (!filtered.length) {
        list.style.gridTemplateColumns = '1fr';
        list.innerHTML = `<div class="empty">
          <h3>没有符合条件的文章</h3>
          <p>换一个分类或标签看看，或者<a href="/" class="link-accent">查看全部文章</a>。</p>
        </div>`;
        return;
      }

      list.style.gridTemplateColumns = '';
      list.innerHTML = filtered.map(cardHTML).join('');
    }

    try {
      const [{ posts }, tax] = await Promise.all([getJSON('/api/posts'), getJSON('/api/taxonomy')]);
      state.posts = posts;
      state.taxonomy = tax;

      if (counter) counter.textContent = `${posts.length} 篇`;
      if (totalWords) totalWords.textContent = `${num(posts.reduce((sum, p) => sum + (p.words || 0), 0))} 字`;
      if (updated && posts[0]) {
        updated.textContent = fmtDate(posts[0].publishedAt || posts[0].createdAt).full;
      }

      if (!posts.length) {
        list.style.gridTemplateColumns = '1fr';
        list.innerHTML = `<div class="empty">
          <h3>还没有文章</h3>
          <p>登录后台发布第一篇，它会立刻出现在这里。</p>
        </div>`;
        renderChips();
        return;
      }

      applyFilter();
    } catch (err) {
      list.style.gridTemplateColumns = '1fr';
      list.innerHTML = `<div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div>`;
    }

    document.addEventListener('click', (e) => {
      const catBtn = e.target.closest('[data-category]');
      if (catBtn) {
        state.category = catBtn.dataset.category;
        state.tag = '';
        syncQuery(state.category, '');
        applyFilter();
        return;
      }
      const tagBtn = e.target.closest('[data-tag]');
      if (tagBtn) {
        state.tag = tagBtn.dataset.tag;
        state.category = '';
        syncQuery('', state.tag);
        applyFilter();
        return;
      }
      if (e.target.closest('[data-filter-clear]')) {
        state.category = '';
        state.tag = '';
        syncQuery('', '');
        applyFilter();
      }
    });

    window.addEventListener('popstate', () => {
      const params = new URLSearchParams(location.search);
      state.category = params.get('category') || '';
      state.tag = params.get('tag') || '';
      applyFilter();
    });
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
      host.innerHTML = `<div class="empty"><h3>没有找到这篇文章</h3><p><a href="/" class="link-accent">返回文章列表</a></p></div>`;
      return;
    }

    try {
      const { post } = await getJSON(`/api/posts/${encodeURIComponent(id)}`);
      const date = fmtDate(post.publishedAt || post.createdAt);
      document.title = `${post.title} · ${SITE.name}`;

      const meta = [
        date.full,
        `约 ${readingTime(post.words)} 分钟`,
        `共 ${num(post.words)} 字`,
        post.commentCount ? `${num(post.commentCount)} 条评论` : '',
      ].filter(Boolean);

      const tagList = (post.tags || [])
        .map(
          (t) =>
            `<a class="tag" href="/?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`
        )
        .join('');

      host.innerHTML = `
        <a class="backlink" href="/">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M13 8H4M7.5 4.5 4 8l3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          返回文章列表
        </a>
        <h1 class="article__title">${esc(post.title)}</h1>
        <div class="article__meta">
          ${meta.map((m) => `<span>${esc(m)}</span>`).join('<span class="dot"></span>')}
        </div>
        ${
          post.category || tagList
            ? `<div class="article__tax">
                ${post.category ? `<a class="tag tag--cat" href="/?category=${encodeURIComponent(post.category)}">${esc(post.category)}</a>` : ''}
                ${tagList}
              </div>`
            : ''
        }
        ${post.cover ? `<figure class="article__cover"><img src="${esc(post.cover)}" alt="${esc(post.title)}" /></figure>` : ''}
        <div class="prose">${window.renderMarkdown(post.content)}</div>
        <div class="article__footer">
          <span>写于 ${date.short} · 共 ${num(post.words)} 字</span>
          <a href="/">继续看看别的 →</a>
        </div>`;

      initComments(id, post.commentCount || 0);
    } catch (err) {
      host.innerHTML = `<div class="empty">
        <h3>文章不存在</h3>
        <p>${esc(err.message)}</p>
        <p style="margin-top:18px"><a href="/" class="link-accent">返回文章列表</a></p>
      </div>`;
    }
  }

  /* ---------------- 评论 ---------------- */

  function commentHTML(c) {
    const initial = esc((c.name || '匿').trim().slice(0, 1).toUpperCase());
    return `<li class="comment">
      <div class="comment__avatar">${initial}</div>
      <div class="comment__main">
        <div class="comment__head">
          <strong>${esc(c.name)}</strong>
          <time>${fmtDate(c.createdAt).time}</time>
        </div>
        <p class="comment__text">${esc(c.content)}</p>
      </div>
    </li>`;
  }

  async function initComments(postId, initialCount) {
    const host = document.querySelector('[data-comments]');
    if (!host) return;

    const savedName = (() => {
      try {
        return localStorage.getItem('banye_comment_name') || '';
      } catch {
        return '';
      }
    })();

    host.innerHTML = `
      <section class="comments" id="comments">
        <div class="comments__head">
          <h2>评论</h2>
          <span data-comment-count>${initialCount ? `${num(initialCount)} 条` : '还没有'}</span>
        </div>
        <form class="comment-form" data-comment-form novalidate>
          <div class="comment-form__top">
            <input class="comment-form__name" name="name" maxlength="24" placeholder="你的昵称" value="${esc(savedName)}" required />
            <span class="comment-form__note">不用注册，留个名字就好</span>
          </div>
          <textarea class="comment-form__text" name="content" maxlength="1000" rows="3" placeholder="说点什么…" required></textarea>
          <input class="comment-form__hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
          <div class="comment-form__foot">
            <span class="comment-form__msg" data-comment-msg role="status"></span>
            <button class="btn-primary" type="submit">发表评论</button>
          </div>
        </form>
        <ul class="comment-list" data-comment-list>
          <li class="comment-empty">正在加载评论…</li>
        </ul>
      </section>`;

    const form = host.querySelector('[data-comment-form]');
    const listEl = host.querySelector('[data-comment-list]');
    const countEl = host.querySelector('[data-comment-count]');
    const msgEl = host.querySelector('[data-comment-msg]');
    const submitBtn = form.querySelector('button[type="submit"]');
    const nameInput = form.querySelector('input[name="name"]');
    const contentInput = form.querySelector('textarea[name="content"]');
    const hpInput = form.querySelector('input[name="website"]');

    function setMsg(text, isError) {
      msgEl.textContent = text || '';
      msgEl.classList.toggle('is-error', Boolean(isError));
    }

    function paint(comments) {
      countEl.textContent = comments.length ? `${num(comments.length)} 条` : '还没有';
      listEl.innerHTML = comments.length
        ? comments.map(commentHTML).join('')
        : `<li class="comment-empty">还没有评论，来做第一个留言的人。</li>`;
    }

    try {
      const { comments } = await getJSON(`/api/posts/${encodeURIComponent(postId)}/comments`);
      paint(comments);
    } catch {
      listEl.innerHTML = `<li class="comment-empty">评论加载失败，刷新页面试试。</li>`;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const content = contentInput.value.trim();
      if (!name) {
        setMsg('请先填一个昵称', true);
        nameInput.focus();
        return;
      }
      if (content.length < 2) {
        setMsg('评论内容太短了，再多写几个字吧', true);
        contentInput.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '发送中…';
      setMsg('');

      try {
        const data = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content, website: hpInput.value }),
        }).then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `提交失败（${res.status}）`);
          return json;
        });

        try {
          localStorage.setItem('banye_comment_name', name);
        } catch {
          /* 忽略 */
        }

        const empty = listEl.querySelector('.comment-empty');
        if (empty) empty.remove();
        const current = Array.from(listEl.querySelectorAll('.comment')).length;
        listEl.insertAdjacentHTML('beforeend', commentHTML(data.comment));
        countEl.textContent = `${num(current + 1)} 条`;
        contentInput.value = '';
        setMsg('评论已发布，谢谢你的留言');      } catch (err) {
        setMsg(err.message, true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '发表评论';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initIntro();
    buildSearch();
    initHome();
    initPost();
  });
})();
