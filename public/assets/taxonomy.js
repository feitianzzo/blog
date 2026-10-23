/* 分类 / 标签 详情页 */
(function () {
  const UI = window.BlogUI;

  function parsePath() {
    const m = location.pathname.match(/^\/(category|tag)\/(.+?)\/?$/);
    if (!m) return null;
    let name = m[2];
    try {
      name = decodeURIComponent(name);
    } catch {
      /* 保持原样 */
    }
    return { kind: m[1] === 'tag' ? 'tag' : 'category', name };
  }

  function init() {
    const info = parsePath();
    const list = document.querySelector('[data-tax-list]');
    if (!list) return;

    if (!info) {
      list.innerHTML = `<div class="empty"><h3>没有找到这个页面</h3><p><a class="link-accent" href="/?intro=0">返回文章列表</a></p></div>`;
      return;
    }

    const isTag = info.kind === 'tag';
    document.title = `${isTag ? `#${info.name}` : info.name} · 半页`;

    // 静态文案先就位，避免空着
    document.querySelector('[data-tax-eyebrow]').textContent = isTag ? '标签' : '分类';
    document.querySelector('[data-tax-title]').textContent = isTag ? `#${info.name}` : info.name;
    const back = document.querySelector('[data-back]');
    if (back) back.href = isTag ? '/tags' : '/categories';
    const backText = document.querySelector('[data-back-text]');
    if (backText) backText.textContent = isTag ? '返回全部标签' : '返回全部分类';

    list.innerHTML = `<div class="empty"><h3>加载中…</h3></div>`;

    UI.getJSON('/api/posts')
      .then(({ posts }) => {
        const matched = posts.filter((p) =>
          isTag ? (p.tags || []).includes(info.name) : p.category === info.name
        );

        const meta = document.querySelector('[data-tax-meta]');
        const latest = matched[0] ? UI.fmtDate(matched[0].publishedAt || matched[0].createdAt).full : '';
        if (meta) {
          meta.innerHTML = matched.length
            ? `<span>共 ${matched.length} 篇文章</span>${latest ? `<span class="dot"></span><span>最近更新 ${UI.esc(latest)}</span>` : ''}`
            : '<span>暂无文章</span>';
        }

        if (!matched.length) {
          list.innerHTML = `<div class="empty">
            <h3>这里还没有文章</h3>
            <p>换一个${isTag ? '标签' : '分类'}看看，或者<a class="link-accent" href="/?intro=0">查看全部文章</a>。</p>
          </div>`;
          return;
        }

        list.innerHTML = matched.map(UI.cardHTML).join('');
      })
      .catch((err) => {
        list.innerHTML = `<div class="empty"><h3>加载失败</h3><p>${UI.esc(err.message)}</p></div>`;
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
