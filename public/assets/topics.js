/* 分类 / 标签 总览页 */
(function () {
  const UI = window.BlogUI;

  function topicCard(name, count, href, prefix) {
    return `<a class="topic-card" href="${href}">
      <span>
        <span class="topic-card__name">${prefix || ''}${UI.esc(name)}</span>
        <span class="topic-card__meta">${count} 篇文章</span>
      </span>
      <svg class="topic-card__arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>`;
  }

  async function init() {
    const grid = document.querySelector('[data-topic-grid]');
    if (!grid) return;

    const isTags = location.pathname.replace(/\/+$/, '') === '/tags';
    const kind = isTags ? 'tags' : 'categories';

    document.title = `${isTags ? '标签' : '分类'} · FeiTian`;
    const eyebrow = document.querySelector('[data-topic-eyebrow]');
    if (eyebrow) eyebrow.textContent = isTags ? '标签' : '分类';
    document.querySelector('[data-topic-title]').textContent = isTags ? '标签' : '分类';
    document.querySelector('[data-topic-desc]').textContent = isTags
      ? '文章身上的关键词，点进去可以看到带同一个标签的全部文章。'
      : '按主题把文章归到一起，点进去可以看到该分类下的全部文章。';

    document.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.tab === kind);
    });

    grid.innerHTML = `<div class="empty"><h3>加载中…</h3></div>`;

    try {
      const tax = await UI.getJSON('/api/taxonomy');
      const categories = tax.categories || [];
      const tags = tax.tags || [];

      document.querySelector('[data-count-categories]').textContent = categories.length;
      document.querySelector('[data-count-tags]').textContent = tags.length;

      const list = isTags ? tags : categories;
      if (!list.length) {
        grid.innerHTML = `<div class="empty">
          <h3>还没有${isTags ? '标签' : '分类'}</h3>
          <p>写文章时填上${isTags ? '标签' : '分类'}，这里就会自动出现。</p>
        </div>`;
        return;
      }

      grid.innerHTML = list
        .map((item) =>
          isTags
            ? topicCard(item.name, item.count, UI.tagHref(item.name), '#')
            : topicCard(item.name, item.count, UI.categoryHref(item.name), '')
        )
        .join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty"><h3>加载失败</h3><p>${UI.esc(err.message)}</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
