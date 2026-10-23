/* 链接图标：按域名自动识别，支持 emoji / 图片地址手动指定 */
(function (global) {
  const ICONS = {
    github:
      '<path fill="currentColor" d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"/>',
    bilibili:
      '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="6.6" width="18.8" height="12.8" rx="3.2"/><path d="M6.8 3.6 9.2 6.4M17.2 3.6 14.8 6.4M8.4 10.6v3M15.6 10.6v3"/></g>',
    youtube:
      '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="2.6" y="5.6" width="18.8" height="12.8" rx="4"/><path d="M10.6 9.5 15.2 12l-4.6 2.5z" fill="currentColor" stroke="none"/></g>',
    x: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 5 19 19M19 5 5 19"/></g>',
    telegram:
      '<path fill="currentColor" d="M21.3 4.3c.3-.9-.5-1.5-1.3-1.2L2.9 10.2c-.9.3-.9 1.4 0 1.7l4.5 1.5 1.7 5.2c.2.7 1.1.8 1.5.2l2.3-2.9 4.4 3.2c.6.4 1.4.1 1.5-.6z"/>',
    mail:
      '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="5.2" width="18.8" height="13.6" rx="2.6"/><path d="m3.6 7 8.4 6 8.4-6"/></g>',
    rss:
      '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.8 4.8a14.4 14.4 0 0 1 14.4 14.4M4.8 10.6a8.6 8.6 0 0 1 8.6 8.6"/><circle cx="5.6" cy="18.4" r="1.7" fill="currentColor" stroke="none"/></g>',
    link:
      '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.2 13.8a4.2 4.2 0 0 0 6 0l2.6-2.6a4.2 4.2 0 0 0-6-6l-1.3 1.3"/><path d="M13.8 10.2a4.2 4.2 0 0 0-6 0L5.2 12.8a4.2 4.2 0 0 0 6 6l1.3-1.3"/></g>',
  };

  const RULES = [
    [/github\.com/i, 'github'],
    [/bilibili\.com|b23\.tv/i, 'bilibili'],
    [/youtube\.com|youtu\.be/i, 'youtube'],
    [/(?:twitter|x)\.com/i, 'x'],
    [/t\.me|telegram\./i, 'telegram'],
    [/^mailto:|@[^/\s]+\.[a-z]{2,}$/i, 'mail'],
    [/rss|feed|atom/i, 'rss'],
  ];

  function keyFor(url) {
    const value = String(url || '');
    for (const [re, key] of RULES) {
      if (re.test(value)) return key;
    }
    return 'link';
  }

  function isImage(value) {
    return /^(https?:\/\/|\/)/i.test(String(value || '').trim());
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function svg(key, size) {
    const body = ICONS[key] || ICONS.link;
    const s = size || 15;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  }

  // 返回图标 HTML：自定义图片 > emoji/文字 > 按域名识别的内置图标
  function html(link, size) {
    const icon = String((link && link.icon) || '').trim();
    if (icon && isImage(icon)) {
      return `<img src="${esc(icon)}" alt="" loading="lazy" />`;
    }
    if (icon) return `<span class="link-emoji">${esc(icon)}</span>`;
    return svg(keyFor(link && link.url), size);
  }

  global.SiteIcons = { keyFor, svg, html, isImage };
})(window);
