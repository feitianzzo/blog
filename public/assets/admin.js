/* 后台逻辑：登录、文章列表、新建/编辑、删除 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  const state = {
    posts: [],
    comments: [],
    view: 'posts',
    editingId: null,
    coverFile: null,
    coverURL: null,
    existingCover: null,
    removeCover: false,
    dirty: false,
  };

  /* ---------------- 字数统计（与后端同规则：中文按字、英文按词） ---------------- */

  function countWords(text) {
    const plain = String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}[-*+]\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/[*_~]/g, '');
    const cjk = (plain.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g) || []).length;
    const latin = (plain.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
    return cjk + latin;
  }

  function updateWordCount() {
    const el = $('[data-word-count]');
    if (!el) return;
    const words = countWords($('#contentInput').value);
    const minutes = Math.max(1, Math.round(words / 350));
    el.textContent = words ? `${words.toLocaleString('zh-CN')} 字 · 约 ${minutes} 分钟` : '0 字';
  }

  let toastTimer = null;
  function toast(message, isError = false) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  async function api(url, options = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* 忽略空响应 */
    }
    if (!res.ok) throw new ApiError(data.error || `请求失败（${res.status}）`, res.status);
    return data;
  }

  /* ---------------- 视图切换 ---------------- */

  function showLogin() {
    $('#viewLogin').hidden = false;
    $('#viewApp').hidden = true;
    setTimeout(() => $('#username').focus(), 60);
  }

  async function showApp(username) {
    $('#viewLogin').hidden = true;
    $('#viewApp').hidden = false;
    setView('posts');
    if (username) {
      const btn = $('#logoutBtn');
      btn.title = `当前账号：${username}`;
    }
  }

  function showList() {
    $('#listView').hidden = false;
    $('#editorView').hidden = true;
    state.editingId = null;
    state.dirty = false;
  }

  /* ---------------- 密码显示切换 ---------------- */

  (function initPasswordToggle() {
    const toggle = $('#togglePassword');
    const input = $('#password');
    if (!toggle || !input) return;

    toggle.addEventListener('click', () => {
      // 保持光标位置，切换后不丢焦点
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const show = input.type === 'password';

      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      toggle.title = show ? '隐藏密码' : '显示密码';

      input.focus();
      try {
        input.setSelectionRange(start, end);
      } catch {
        /* 部分浏览器对 text 类型外的情况会抛错，忽略 */
      }
    });
  })();

  /* ---------------- 登录 ---------------- */

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('#loginError');
    const btn = $('#loginBtn');
    const username = $('#username').value.trim();
    const password = $('#password').value;
    errorBox.classList.remove('show');

    if (!username || !password) {
      errorBox.textContent = '请输入账号和密码';
      errorBox.classList.add('show');
      return;
    }

    btn.disabled = true;
    btn.textContent = '登录中…';
    try {
      const data = await api('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      await showApp(data.username);
      toast('登录成功');
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add('show');
      $('#password').select();
    } finally {
      btn.disabled = false;
      btn.textContent = '登 录';
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      /* 忽略 */
    }
    state.posts = [];
    showLogin();
    toast('已退出登录');
  });

  /* ---------------- 列表 ---------------- */

  function fmt(ts, withTime = false) {
    const d = new Date(ts || Date.now());
    const p = (n) => String(n).padStart(2, '0');
    const base = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
    return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
  }

  function rowHTML(post) {
    const published = post.status === 'published';
    const cover = post.cover
      ? `<img src="${esc(post.cover)}" alt="" loading="lazy" />`
      : `<span>${esc((post.title || '文').slice(0, 1))}</span>`;
    const dateLabel = published
      ? `发布于 ${fmt(post.publishedAt || post.createdAt)}`
      : `创建于 ${fmt(post.createdAt)}`;
    const cat = post.category ? `<span class="row-cat">${esc(post.category)}</span>` : '';
    const stats = [
      post.words ? `${Number(post.words).toLocaleString('zh-CN')} 字` : '',
      post.commentCount ? `${post.commentCount} 条评论` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return `<div class="post-row" data-id="${esc(post.id)}">
      <div class="post-row__main">
        <div class="post-row__cover">${cover}</div>
        <div class="post-row__text">
          <h3 class="post-row__title">${esc(post.title)}</h3>
          <div class="post-row__meta">
            <span class="pill ${published ? 'pill--published' : 'pill--draft'}">${published ? '已发布' : '草稿'}</span>
            ${cat}
            <span>${dateLabel}</span>
            ${stats ? `<span class="row-stats">· ${stats}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="post-row__actions">
        ${published ? `<a class="btn btn--sm" href="/p/${encodeURIComponent(post.id)}" target="_blank" rel="noopener">查看</a>` : ''}
        <button class="btn btn--sm" data-action="edit" type="button">编辑</button>
        <button class="btn btn--sm btn--danger" data-action="delete" type="button">删除</button>
      </div>
    </div>`;
  }

  async function loadPosts() {
    const host = $('#postListHost');
    const summary = $('#listSummary');
    try {
      const { posts } = await api('/api/admin/posts');
      state.posts = posts;
      const published = posts.filter((p) => p.status === 'published').length;
      const comments = posts.reduce((sum, p) => sum + (p.commentCount || 0), 0);
      summary.textContent = posts.length
        ? `共 ${posts.length} 篇 · ${published} 篇已发布 · ${posts.length - published} 篇草稿 · ${comments} 条评论`
        : '还没有文章，发布第一篇吧';

      const badge = $('[data-posts-badge]');
      if (badge) badge.textContent = posts.length;
      const cBadge = $('[data-comments-badge]');
      if (cBadge) cBadge.textContent = comments;

      $('#categoryOptions').innerHTML = [...new Set(posts.map((p) => p.category).filter(Boolean))]
        .map((c) => `<option value="${esc(c)}"></option>`)
        .join('');

      if (!posts.length) {
        host.innerHTML = `<div class="empty-state">
          <h2>这里还是空的</h2>
          <p>写下第一篇文章，发布后会立刻出现在站点首页。</p>
          <button class="btn btn--primary" type="button" data-action="new">新建文章</button>
        </div>`;
        return;
      }
      host.innerHTML = `<div class="post-table">${posts.map(rowHTML).join('')}</div>`;
    } catch (err) {
      if (err.status === 401) return showLogin();
      summary.textContent = '加载失败';
      host.innerHTML = `<div class="empty-state"><h2>加载失败</h2><p>${esc(err.message)}</p></div>`;
    }
  }

  /* ---------------- 视图切换：文章 / 评论 ---------------- */

  function setView(view) {
    state.view = view;
    const isPosts = view === 'posts';
    $('#postsPanel').hidden = !isPosts;
    $('#commentsPanel').hidden = isPosts;
    $('#newPostBtn').hidden = !isPosts;
    $('#pageTitle').textContent = isPosts ? '文章管理' : '评论管理';
    $$('.view-tab').forEach((btn) => {
      const on = btn.dataset.view === view;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    });
    if (isPosts) loadPosts();
    else loadComments();
  }

  function commentRowHTML(c) {
    return `<div class="comment-row" data-id="${esc(c.id)}">
      <div class="comment-row__body">
        <div class="comment-row__head">
          <strong>${esc(c.name)}</strong>
          <span class="comment-row__post">${esc(c.postTitle)}</span>
          <time>${fmt(c.createdAt, true)}</time>
        </div>
        <p class="comment-row__text">${esc(c.content)}</p>
      </div>
      <div class="comment-row__actions">
        <a class="btn btn--sm" href="/p/${encodeURIComponent(c.postId)}#comments" target="_blank" rel="noopener">查看文章</a>
        <button class="btn btn--sm btn--danger" type="button" data-action="delete-comment">删除</button>
      </div>
    </div>`;
  }

  async function loadComments() {
    const host = $('#commentListHost');
    const summary = $('#listSummary');
    try {
      const { comments } = await api('/api/admin/comments');
      state.comments = comments;
      const badge = $('[data-comments-badge]');
      if (badge) badge.textContent = comments.length;
      summary.textContent = comments.length ? `共 ${comments.length} 条评论 · 最新在前` : '还没有读者留言';

      if (!comments.length) {
        host.innerHTML = `<div class="empty-state">
          <h2>还没有评论</h2>
          <p>读者在文章页留言后会出现在这里，可以随时删除。</p>
        </div>`;
        return;
      }
      host.innerHTML = `<div class="comment-table">${comments.map(commentRowHTML).join('')}</div>`;
    } catch (err) {
      if (err.status === 401) return showLogin();
      summary.textContent = '加载失败';
      host.innerHTML = `<div class="empty-state"><h2>加载失败</h2><p>${esc(err.message)}</p></div>`;
    }
  }

  $$('.view-tab').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.dataset.view !== state.view) setView(btn.dataset.view);
    })
  );

  $('#commentListHost').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="delete-comment"]');
    if (!btn) return;
    const row = btn.closest('.comment-row');
    const comment = state.comments.find((c) => c.id === row.dataset.id);
    const ok = await askConfirm({
      title: '删除这条评论？',
      text: `来自「${comment ? comment.name : '读者'}」的留言将被永久删除，前台会立即消失。`,
      okText: '确认删除',
    });
    if (!ok) return;
    try {
      await api(`/api/admin/comments/${encodeURIComponent(row.dataset.id)}`, { method: 'DELETE' });
      await loadComments();
      toast('评论已删除');
    } catch (err) {
      if (err.status === 401) return showLogin();
      toast(err.message, true);
    }
  });

  $('#postListHost').addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    if (action === 'new') return openEditor(null);
    const row = actionBtn.closest('.post-row');
    if (!row) return;
    if (action === 'edit') openEditor(row.dataset.id);
    if (action === 'delete') handleDelete(row.dataset.id);
  });

  $('#newPostBtn').addEventListener('click', () => openEditor(null));

  /* ---------------- 编辑器 ---------------- */

  const COVER_PLACEHOLDER = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5 3.5 3.5 3-3L20 17" stroke-linecap="round" stroke-linejoin="round" />
    </svg><span>点击或拖拽上传</span>`;

  function renderCover() {
    const drop = $('#coverDrop');
    let src = null;
    if (state.coverFile) src = state.coverURL;
    else if (state.existingCover && !state.removeCover) src = state.existingCover;

    if (src) {
      drop.classList.add('has-image');
      drop.innerHTML = `<img src="${esc(src)}" alt="封面预览" />`;
    } else {
      drop.classList.remove('has-image');
      drop.innerHTML = COVER_PLACEHOLDER;
    }
    $('#removeCoverBtn').hidden = !src;
    $('#pickCoverBtn').textContent = src ? '更换图片' : '选择图片';
  }

  function setCoverFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      return toast('仅支持 JPG / PNG / WebP / GIF 图片', true);
    }
    if (file.size > 5 * 1024 * 1024) {
      return toast('图片不能超过 5MB', true);
    }
    if (state.coverURL) URL.revokeObjectURL(state.coverURL);
    state.coverFile = file;
    state.coverURL = URL.createObjectURL(file);
    state.removeCover = false;
    state.dirty = true;
    renderCover();
  }

  function syncSaveButton() {
    const status = $('#statusSelect').value;
    const btn = $('#saveBtn');
    btn.textContent = status === 'draft' ? '保存草稿' : state.editingId ? '保存并更新' : '发布文章';
  }

  async function openEditor(id) {
    state.editingId = id;
    state.coverFile = null;
    if (state.coverURL) URL.revokeObjectURL(state.coverURL);
    state.coverURL = null;
    state.existingCover = null;
    state.removeCover = false;
    state.dirty = false;

    $('#titleInput').value = '';
    $('#contentInput').value = '';
    $('#categoryInput').value = '';
    $('#tagsInput').value = '';
    $('#previewPane').innerHTML = '';
    $('#postTimestamps').textContent = '';
    $('#statusSelect').value = 'published';
    setTab('write');
    updateWordCount();

    if (id) {
      try {
        const { post } = await api(`/api/admin/posts/${encodeURIComponent(id)}`);
        $('#titleInput').value = post.title;
        $('#contentInput').value = post.content;
        $('#categoryInput').value = post.category || '';
        $('#tagsInput').value = Array.isArray(post.tags) ? post.tags.join(', ') : '';
        $('#statusSelect').value = post.status === 'draft' ? 'draft' : 'published';
        state.existingCover = post.cover || null;
        $('#postTimestamps').innerHTML = `创建于 ${fmt(post.createdAt, true)}<br />最后更新 ${fmt(post.updatedAt, true)}`;
      } catch (err) {
        if (err.status === 401) return showLogin();
        return toast(err.message, true);
      }
    } else {
      $('#postTimestamps').textContent = '草稿在发布前不会出现在前台。';
    }

    updateWordCount();

    renderCover();
    syncSaveButton();
    $('#listView').hidden = true;
    $('#editorView').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => $('#titleInput').focus(), 80);
  }

  function setTab(tab) {
    $$('.md-tab').forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
    const isPreview = tab === 'preview';
    $('#contentInput').hidden = isPreview;
    $('#previewPane').hidden = !isPreview;
    if (isPreview) {
      const text = $('#contentInput').value.trim();
      $('#previewPane').innerHTML = text
        ? window.renderMarkdown(text)
        : '<p style="color:var(--muted)">还没有内容可预览。</p>';
    }
  }

  $$('.md-tab').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

  $('#statusSelect').addEventListener('change', () => {
    syncSaveButton();
    state.dirty = true;
  });

  ['#titleInput', '#contentInput', '#categoryInput', '#tagsInput'].forEach((sel) => {
    $(sel).addEventListener('input', () => {
      state.dirty = true;
      if (sel === '#contentInput') updateWordCount();
    });
  });

  /* 封面交互 */
  $('#pickCoverBtn').addEventListener('click', () => $('#coverInput').click());
  $('#coverDrop').addEventListener('click', () => $('#coverInput').click());
  $('#coverDrop').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      $('#coverInput').click();
    }
  });
  $('#coverInput').addEventListener('change', (e) => {
    setCoverFile(e.target.files && e.target.files[0]);
    e.target.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    $('#coverDrop').addEventListener(evt, (e) => {
      e.preventDefault();
      $('#coverDrop').classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    $('#coverDrop').addEventListener(evt, (e) => {
      e.preventDefault();
      $('#coverDrop').classList.remove('dragover');
    })
  );
  $('#coverDrop').addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    setCoverFile(file);
  });

  $('#removeCoverBtn').addEventListener('click', () => {
    if (state.coverFile) {
      if (state.coverURL) URL.revokeObjectURL(state.coverURL);
      state.coverFile = null;
      state.coverURL = null;
    } else {
      state.removeCover = true;
    }
    state.dirty = true;
    renderCover();
  });

  /* ---------------- 保存 ---------------- */

  async function savePost() {
    const title = $('#titleInput').value.trim();
    const content = $('#contentInput').value.trim();
    const status = $('#statusSelect').value;

    if (!title) {
      toast('请先填写文章标题', true);
      $('#titleInput').focus();
      return;
    }
    if (!content) {
      toast('正文不能为空', true);
      $('#contentInput').focus();
      return;
    }

    const btn = $('#saveBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '保存中…';

    const fd = new FormData();
    fd.append('title', title);
    fd.append('content', content);
    fd.append('status', status);
    fd.append('category', $('#categoryInput').value.trim());
    fd.append('tags', $('#tagsInput').value.trim());
    if (state.coverFile) fd.append('cover', state.coverFile);
    if (state.removeCover) fd.append('removeCover', '1');

    const url = state.editingId
      ? `/api/admin/posts/${encodeURIComponent(state.editingId)}`
      : '/api/admin/posts';

    try {
      await api(url, { method: 'POST', body: fd });
      state.dirty = false;
      showList();
      await loadPosts();
      toast(status === 'published' ? '已发布，前台立即可见' : '草稿已保存');
    } catch (err) {
      if (err.status === 401) return showLogin();
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
      syncSaveButton();
    }
  }

  $('#saveBtn').addEventListener('click', savePost);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!$('#editorView').hidden) savePost();
    }
  });

  /* ---------------- 返回 / 删除 ---------------- */

  async function goBack() {
    if (state.dirty) {
      const ok = await askConfirm({
        title: '放弃未保存的修改？',
        text: '当前编辑的内容还没有保存，离开后将丢失。',
        okText: '放弃修改',
      });
      if (!ok) return;
    }
    showList();
    loadPosts();
  }

  $('#backBtn').addEventListener('click', goBack);

  async function handleDelete(id) {
    const post = state.posts.find((p) => p.id === id);
    const ok = await askConfirm({
      title: '删除这篇文章？',
      text: `《${post ? post.title : '这篇文章'}》将被永久删除，前台会立即不再显示。`,
      okText: '确认删除',
    });
    if (!ok) return;
    try {
      await api(`/api/admin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadPosts();
      toast('文章已删除');
    } catch (err) {
      if (err.status === 401) return showLogin();
      toast(err.message, true);
    }
  }

  /* ---------------- 确认弹窗 ---------------- */

  let confirmResolve = null;

  function askConfirm({ title, text, okText }) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = okText || '确认';
    $('#confirmModal').hidden = false;
    $('#confirmOk').focus();
    return new Promise((resolve) => {
      confirmResolve = resolve;
    });
  }

  function closeConfirm(result) {
    $('#confirmModal').hidden = true;
    if (confirmResolve) {
      confirmResolve(result);
      confirmResolve = null;
    }
  }

  $('#confirmCancel').addEventListener('click', () => closeConfirm(false));
  $('#confirmOk').addEventListener('click', () => closeConfirm(true));
  $('#confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') closeConfirm(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#confirmModal').hidden) closeConfirm(false);
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty && !$('#editorView').hidden) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------------- 启动 ---------------- */

  (async function init() {
    try {
      const session = await api('/api/session');
      if (session.loggedIn) await showApp(session.username);
      else showLogin();
    } catch {
      showLogin();
    }
  })();
})();
