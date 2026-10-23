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

  const categoryHref = (name) => `/category/${encodeURIComponent(name)}`;
  const tagHref = (name) => `/tag/${encodeURIComponent(name)}`;
  const postHref = (id) => `/p/${encodeURIComponent(id)}`;

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

  /* ---------------- 开场画面 ---------------- */

  function safeImageUrl(url) {
    return String(url || '').replace(/["'\\\s]/g, '');
  }

  function applyIntroConf(conf) {
    if (!conf) return;
    const bg = document.querySelector('[data-intro-bg]');
    if (bg && conf.introImage) {
      bg.style.backgroundImage = `url("${safeImageUrl(conf.introImage)}")`;
    }
    const title = document.querySelector('[data-intro-title]');
    if (title && conf.introTitle) {
      title.innerHTML = String(conf.introTitle)
        .split('\n')
        .map((line) => esc(line))
        .join('<br />');
    }
    const sub = document.querySelector('[data-intro-sub]');
    if (sub && conf.introSub) sub.textContent = conf.introSub;
  }

  function initIntro() {
    const el = document.getElementById('intro');
    if (!el || el.hidden) return;

    const ready = () => requestAnimationFrame(() => el.classList.add('is-ready'));

    // 后台配置的开场图与文案（首屏脚本取到的配置直接复用）
    if (window.__siteSettings) {
      applyIntroConf(window.__siteSettings);
      ready();
    } else {
      getJSON('/api/settings')
        .then((data) => {
          window.__siteSettings = data.settings || {};
          applyIntroConf(data.settings);
        })
        .catch(() => {})
        .then(ready);
    }

    let done = false;
    const dismiss = () => {
      if (done) return;
      done = true;
      el.classList.add('is-leaving');
      document.body.classList.remove('intro-lock');
      document.body.classList.add('intro-done');
      document.removeEventListener('keydown', onKey);
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
      : `<span class="card__cat card__cat--none">未分类</span>`;
    const words = post.words ? `${num(post.words)} 字` : '';
    const comments = post.commentCount ? `${num(post.commentCount)} 评论` : '';
    const tags = (post.tags || []).slice(0, 4);
    return `<a class="card" href="${postHref(post.id)}">
      ${cover}
      <div class="card__body">
        <div class="card__top">${cat}<span class="card__date">${date}</span></div>
        <h3 class="card__title">${esc(post.title)}</h3>
        <p class="card__excerpt">${esc(post.excerpt || '')}</p>
        ${tags.length ? `<div class="card__tags">${tags.map((t) => `<span class="tag tag--sm">#${esc(t)}</span>`).join('')}</div>` : ''}
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

  /* ---------------- 首页：后台可配置文案 ---------------- */

  function applyHomeConf(conf) {
    const settings = conf || {};

    const avatar = document.querySelector('[data-hero-avatar]');
    if (avatar) {
      avatar.src = settings.authorAvatar || '/assets/avatar.svg';
      avatar.alt = `${settings.authorName || '博主'}的头像`;
      avatar.addEventListener(
        'error',
        () => {
          avatar.src = '/assets/avatar.svg';
        },
        { once: true }
      );
    }

    const name = document.querySelector('[data-hero-name]');
    if (name) name.textContent = settings.authorName || 'FeiTian';

    const noticeCard = document.querySelector('[data-hero-notice-card]');
    const notice = document.querySelector('[data-hero-notice]');
    if (noticeCard) {
      const text = (settings.announcement || '').trim();
      noticeCard.hidden = !text;
      if (notice) notice.textContent = text;
    }

    const title = document.querySelector('[data-hero-title]');
    if (title && settings.heroTitle) title.textContent = settings.heroTitle;

    const signature = document.querySelector('[data-hero-signature]');
    if (signature) {
      const text = (settings.signature || '').trim();
      signature.textContent = text;
      signature.hidden = !text;
    }

    const intro = document.querySelector('[data-hero-intro]');
    if (intro) intro.textContent = (settings.authorBio || '').trim();
  }

  async function initHome() {
    const list = document.querySelector('[data-post-list]');
    if (!list) return;

    // 兼容老链接：/?category=xxx 直接跳到分类二级页
    const params = new URLSearchParams(location.search);
    const legacyCat = params.get('category');
    const legacyTag = params.get('tag');
    if (legacyCat) return location.replace(categoryHref(legacyCat));
    if (legacyTag) return location.replace(tagHref(legacyTag));

    const counter = document.querySelector('[data-post-count]');
    const totalWords = document.querySelector('[data-total-words]');
    const updated = document.querySelector('[data-last-updated]');
    const countLabel = document.querySelector('[data-list-count]');
    const catChips = document.querySelector('[data-category-chips]');
    const tagChips = document.querySelector('[data-tag-chips]');

    list.innerHTML = skeleton(4);

    function chipHTML(label, count, href) {
      return `<a class="chip" href="${esc(href)}"><span>${esc(label)}</span><em>${count}</em></a>`;
    }

    try {
      const [{ posts }, tax, conf] = await Promise.all([
        getJSON('/api/posts'),
        getJSON('/api/taxonomy'),
        getJSON('/api/settings').catch(() => ({ settings: {} })),
      ]);

      applyHomeConf(conf.settings);

      if (counter) counter.textContent = `${posts.length} 篇`;
      if (totalWords) totalWords.textContent = `${num(posts.reduce((sum, p) => sum + (p.words || 0), 0))} 字`;
      if (updated && posts[0]) {
        updated.textContent = fmtDate(posts[0].publishedAt || posts[0].createdAt).full;
      }

      if (catChips) {
        const total = tax.categories.reduce((sum, c) => sum + c.count, 0);
        catChips.innerHTML =
          chipHTML('全部', total, '/?intro=0') +
          (tax.categories.map((c) => chipHTML(c.name, c.count, categoryHref(c.name))).join('') ||
            '<span class="chips__empty">还没有分类，写文章时可以加上</span>');
      }
      if (tagChips) {
        tagChips.innerHTML =
          tax.tags.map((t) => chipHTML('#' + t.name, t.count, tagHref(t.name))).join('') ||
          '<span class="chips__empty">还没有标签，写文章时可以加上</span>';
      }

      if (!posts.length) {
        list.style.gridTemplateColumns = '1fr';
        list.innerHTML = `<div class="empty">
          <h3>还没有文章</h3>
          <p>登录后台发布第一篇，它会立刻出现在这里。</p>
        </div>`;
        return;
      }

      if (countLabel) countLabel.textContent = `${posts.length} 篇 · ALL POSTS`;
      list.innerHTML = posts.map(cardHTML).join('');
    } catch (err) {
      list.style.gridTemplateColumns = '1fr';
      list.innerHTML = `<div class="empty"><h3>加载失败</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ---------------- 主题 / 阅读模式 / 滚动工具 ---------------- */

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme, persist = true) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    if (persist) {
      try {
        localStorage.setItem('banye_theme', theme);
      } catch {
        /* 隐私模式忽略 */
      }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#14161a' : '#fbfaf7');
  }

  function smoothTo(el, offset = 84) {
    if (!el) return;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
    window.scrollTo({ top, behavior: 'smooth' });
  }

  /* ---------------- 文章页：左侧栏 ---------------- */

  function miniItemHTML(post) {    const tags = (post.tags || [])
      .slice(0, 3)
      .map((t) => `<span class="mini__tag">#${esc(t)}</span>`)
      .join('');
    return `<li class="mini">
      <a class="mini__link" href="${postHref(post.id)}">
        <span class="mini__title">${esc(post.title)}</span>
        <span class="mini__meta">
          ${post.category ? `<span class="mini__cat">${esc(post.category)}</span>` : ''}
          ${tags}
        </span>
      </a>
    </li>`;
  }

  function renderSide(detail, posts, tax, settings) {
    const conf = settings || {};

    // 个人资料
    const avatar = document.querySelector('[data-profile-avatar]');
    if (avatar) {
      avatar.src = conf.authorAvatar || '/assets/avatar.svg';
      avatar.alt = `${conf.authorName || '博主'}的头像`;
      avatar.addEventListener(
        'error',
        () => {
          avatar.src = '/assets/avatar.svg';
        },
        { once: true }
      );
    }
    const nameEl = document.querySelector('[data-profile-name]');
    if (nameEl) nameEl.textContent = conf.authorName || 'FeiTian';
    const bioEl = document.querySelector('[data-profile-bio]');
    if (bioEl) bioEl.textContent = conf.authorBio || '';

    const stats = {
      '[data-stat-posts]': posts.length,
      '[data-stat-tags]': (tax.tags || []).length,
      '[data-stat-cats]': (tax.categories || []).length,
    };
    Object.entries(stats).forEach(([sel, value]) => {
      const el = document.querySelector(sel);
      if (el) el.textContent = String(value);
    });

    const github = document.querySelector('[data-profile-github]');
    if (github) {
      if (conf.githubUrl) {
        github.href = conf.githubUrl;
        github.hidden = false;
      } else {
        github.hidden = true;
      }
    }

    // 公告
    const announceCard = document.querySelector('[data-announce-card]');
    const announceText = document.querySelector('[data-announce]');
    if (announceCard) {
      const text = (conf.announcement || '').trim();
      announceCard.hidden = !text;
      if (announceText) announceText.textContent = text;
    }

    // 当前分类下的其他文章
    const relatedCard = document.querySelector('[data-related-card]');
    const relatedList = document.querySelector('[data-related]');
    const related = detail.related || [];
    if (relatedCard) {
      if (detail.post.category) {
        relatedCard.hidden = false;
        const title = document.querySelector('[data-related-title]');
        if (title) title.textContent = `「${detail.post.category}」下的文章`;
        if (relatedList) {
          relatedList.innerHTML = related.length
            ? related.map(miniItemHTML).join('')
            : '<li class="mini mini--empty">这个分类下还没有其他文章</li>';
        }
      } else {
        relatedCard.hidden = true;
      }
    }

    // 最新文章
    const latestList = document.querySelector('[data-latest]');
    if (latestList) {
      const latest = posts.filter((p) => p.id !== detail.post.id).slice(0, 3);
      latestList.innerHTML = latest.length
        ? latest.map(miniItemHTML).join('')
        : '<li class="mini mini--empty">还没有更多文章</li>';
    }
  }

  // 侧栏内容超出视口时给它一个底部渐隐，提示还能继续滚
  function syncSideScroll() {
    const side = document.querySelector('.post-side');
    if (!side) return;
    side.classList.toggle('is-scrollable', side.scrollHeight - side.clientHeight > 4);
  }

  /* ---------------- 文章页：目录 ---------------- */

  function buildToc() {
    const host = document.querySelector('[data-toc]');
    if (!host) return;
    const countEl = document.querySelector('[data-toc-count]');
    const prose = document.querySelector('.prose');
    const heads = prose
      ? Array.from(prose.querySelectorAll('h2, h3')).filter((h) => (h.textContent || '').trim())
      : [];

    if (!heads.length) {
      host.innerHTML = '<p class="toc__empty">这篇文章没有小标题</p>';
      if (countEl) countEl.textContent = '0';
      return;
    }

    heads.forEach((h, i) => {
      if (!h.id) h.id = `sec-${i + 1}`;
    });

    host.innerHTML = heads
      .map((h) => {
        const sub = h.tagName === 'H3' ? ' is-sub' : '';
        return `<a class="toc__link${sub}" href="#${h.id}">${esc(h.textContent.trim())}</a>`;
      })
      .join('');
    if (countEl) countEl.textContent = String(heads.length);

    const links = Array.from(host.querySelectorAll('.toc__link'));
    let ticking = false;
    let activeIndex = -1;

    // 让当前小节始终停在目录列表的中间一行
    const centerLink = (link) => {
      if (!link) return;
      const hostRect = host.getBoundingClientRect();
      const rect = link.getBoundingClientRect();
      if (!hostRect.height || !rect.height) return;
      const delta = rect.top + rect.height / 2 - (hostRect.top + hostRect.height / 2);
      if (Math.abs(delta) < 6) return;
      const max = host.scrollHeight - host.clientHeight;
      const top = Math.max(0, Math.min(host.scrollTop + delta, max));
      host.scrollTo({ top, behavior: 'smooth' });
    };

    const spy = () => {
      const line = window.scrollY + 120;
      let active = 0;
      heads.forEach((h, i) => {
        if (h.getBoundingClientRect().top + window.scrollY <= line) active = i;
      });
      links.forEach((a, i) => a.classList.toggle('is-active', i === active));
      if (active !== activeIndex) {
        activeIndex = active;
        centerLink(links[active]);
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        spy();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    spy();

    host.addEventListener('click', (e) => {
      const link = e.target.closest('.toc__link');
      if (!link) return;
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      e.preventDefault();
      smoothTo(target, 88);
      history.replaceState(null, '', link.getAttribute('href'));
    });
  }

  /* ---------------- 文章页：上一篇 / 下一篇 ---------------- */

  function postNavHTML(prev, next) {
    const card = (post, dir) => {
      const label = dir === 'prev' ? '上一篇' : '下一篇';
      if (!post) {
        return `<span class="postnav__item postnav__item--empty postnav__item--${dir}">
          <span class="postnav__label">${label}</span>
          <span class="postnav__title">${dir === 'prev' ? '已经是第一篇了' : '已经是最后一篇了'}</span>
        </span>`;
      }
      return `<a class="postnav__item postnav__item--${dir}" href="${postHref(post.id)}">
        <span class="postnav__label">${label}</span>
        <span class="postnav__title">${esc(post.title)}</span>
      </a>`;
    };
    return `<nav class="postnav" aria-label="上一篇和下一篇">
      ${card(prev, 'prev')}${card(next, 'next')}
    </nav>`;
  }

  /* ---------------- 文章页：右侧功能栏 ---------------- */

  function initRail() {
    const rail = document.querySelector('[data-rail]');
    if (!rail) return;
    const readingBtn = rail.querySelector('[data-rail-action="reading"]');
    const themeBtn = rail.querySelector('[data-rail-action="theme"]');
    const topBtn = rail.querySelector('[data-rail-action="top"]');

    const setReading = (on) => {
      document.body.classList.toggle('reading-mode', on);
      if (readingBtn) {
        readingBtn.setAttribute('aria-pressed', String(on));
        readingBtn.setAttribute('data-tip', on ? '退出阅读模式' : '阅读模式');
      }
      try {
        sessionStorage.setItem('banye_reading', on ? '1' : '0');
      } catch {
        /* 忽略 */
      }
    };

    const setTheme = (theme, persist = true) => {
      applyTheme(theme, persist);
      if (themeBtn) {
        const dark = theme === 'dark';
        themeBtn.setAttribute('aria-pressed', String(dark));
        themeBtn.setAttribute('data-tip', dark ? '日间模式' : '夜间模式');
      }
    };

    let reading = false;
    try {
      reading = sessionStorage.getItem('banye_reading') === '1';
    } catch {
      /* 忽略 */
    }
    setReading(reading);
    setTheme(currentTheme(), false);

    rail.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rail-action]');
      if (!btn) return;
      const action = btn.dataset.railAction;

      if (action === 'reading') {
        setReading(!document.body.classList.contains('reading-mode'));
        return;
      }
      if (action === 'theme') {
        setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
        return;
      }
      if (action === 'comments') {
        const target = document.getElementById('comments');
        if (target) smoothTo(target, 76);
        else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        return;
      }
      if (action === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    const onScroll = () => {
      if (topBtn) topBtn.classList.toggle('is-dim', window.scrollY < 240);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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
      const [detail, listData, tax, conf] = await Promise.all([
        getJSON(`/api/posts/${encodeURIComponent(id)}`),
        getJSON('/api/posts').catch(() => ({ posts: [] })),
        getJSON('/api/taxonomy').catch(() => ({ categories: [], tags: [] })),
        getJSON('/api/settings').catch(() => ({ settings: {} })),
      ]);

      const { post, prev, next } = detail;
      const posts = listData.posts || [];
      const settings = conf.settings || {};
      const date = fmtDate(post.publishedAt || post.createdAt);
      document.title = `${post.title} · ${SITE.name}`;

      const meta = [
        date.full,
        `约 ${readingTime(post.words)} 分钟`,
        `共 ${num(post.words)} 字`,
        post.commentCount ? `${num(post.commentCount)} 条评论` : '',
      ].filter(Boolean);

      const tagList = (post.tags || [])
        .map((t) => `<a class="tag" href="${tagHref(t)}">#${esc(t)}</a>`)
        .join('');

      host.innerHTML = `
        <a class="backlink" href="/?intro=0">
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
                ${post.category ? `<a class="tag tag--cat" href="${categoryHref(post.category)}">${esc(post.category)}</a>` : ''}
                ${tagList}
              </div>`
            : ''
        }
        ${post.cover ? `<figure class="article__cover"><img src="${esc(post.cover)}" alt="${esc(post.title)}" /></figure>` : ''}
        <div class="prose">${window.renderMarkdown(post.content)}</div>
        <div class="article__footer">
          <span>写于 ${date.short} · 共 ${num(post.words)} 字</span>
          <a href="/?intro=0">继续看看别的 →</a>
        </div>
        ${postNavHTML(prev, next)}`;

      renderSide(detail, posts, tax, settings);
      buildToc();
      await initComments(id, post.commentCount || 0);
      initRail();
      syncSideScroll();
      window.addEventListener('resize', syncSideScroll);
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

  // 分类 / 标签页面复用这里的工具与卡片样式
  window.BlogUI = {
    esc,
    num,
    fmtDate,
    readingTime,
    getJSON,
    cardHTML,
    categoryHref,
    tagHref,
    postHref,
  };
})();
