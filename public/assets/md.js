/* 轻量 Markdown 渲染（无第三方依赖，输出已转义，避免 XSS） */
(function (global) {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

  function inline(text) {
    let s = esc(text);

    // 行内代码先占位，避免内部被再次解析
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_m, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });

    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => {
      return `<img src="${src}" alt="${alt}" loading="lazy" />`;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
      const safe = /^(https?:|mailto:|\/|#)/i.test(href) ? href : '#';
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
    return s;
  }

  function isTableStart(lines, i) {
    return (
      lines[i] &&
      lines[i].includes('|') &&
      lines[i + 1] &&
      /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    );
  }

  function cells(line) {
    return line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
  }

  function parseList(lines, start) {
    const items = [];
    let i = start;
    let baseIndent = null;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        const next = lines[i + 1];
        if (next && /^\s*([-*+]|\d+\.)\s+/.test(next)) {
          i += 1;
          continue;
        }
        break;
      }
      const m = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (!m) break;
      if (baseIndent === null) baseIndent = m[1].length;
      items.push({
        indent: m[1].length,
        ordered: /^\d/.test(m[2]),
        text: m[3],
      });
      i += 1;
    }

    let html = '';
    const stack = [];

    for (const item of items) {
      const tag = item.ordered ? 'ol' : 'ul';
      const top = stack[stack.length - 1];

      if (!top) {
        stack.push({ indent: item.indent, tag });
        html += `<${tag}>`;
      } else if (item.indent > top.indent + 1) {
        html = html.replace(/<\/li>$/, '');
        stack.push({ indent: item.indent, tag });
        html += `<${tag}>`;
      } else if (item.indent < top.indent) {
        while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) {
          html += `</${stack.pop().tag}></li>`;
        }
      }
      html += `<li>${inline(item.text)}</li>`;
    }
    while (stack.length) {
      html += `</${stack.pop().tag}>`;
    }
    return { html, next: i };
  }

  function render(src) {
    const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    let out = '';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 空行
      if (!line.trim()) {
        i += 1;
        continue;
      }

      // 代码块
      if (/^\s*```/.test(line)) {
        const lang = line.replace(/^\s*```/, '').trim();
        const buf = [];
        i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) {
          buf.push(lines[i]);
          i += 1;
        }
        i += 1;
        const cls = lang ? ` class="language-${esc(lang)}"` : '';
        out += `<pre><code${cls}>${esc(buf.join('\n'))}</code></pre>`;
        continue;
      }

      // 标题
      const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
      if (h) {
        const level = h[1].length;
        out += `<h${level}>${inline(h[2].replace(/\s+#+\s*$/, ''))}</h${level}>`;
        i += 1;
        continue;
      }

      // 分隔线
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
        out += '<hr />';
        i += 1;
        continue;
      }

      // 引用
      if (/^\s{0,3}>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
          i += 1;
        }
        out += `<blockquote>${render(buf.join('\n'))}</blockquote>`;
        continue;
      }

      // 表格
      if (isTableStart(lines, i)) {
        const head = cells(lines[i]);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          rows.push(cells(lines[i]));
          i += 1;
        }
        out += '<table><thead><tr>';
        out += head.map((c) => `<th>${inline(c)}</th>`).join('');
        out += '</tr></thead><tbody>';
        for (const row of rows) {
          out += '<tr>';
          out += head.map((_c, idx) => `<td>${inline(row[idx] || '')}</td>`).join('');
          out += '</tr>';
        }
        out += '</tbody></table>';
        continue;
      }

      // 列表
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const { html, next } = parseList(lines, i);
        out += html;
        i = next;
        continue;
      }

      // 段落
      const buf = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^\s*```/.test(lines[i]) &&
        !/^\s{0,3}(#{1,6})\s+/.test(lines[i]) &&
        !/^\s{0,3}>/.test(lines[i]) &&
        !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
        !/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(lines[i])
      ) {
        buf.push(lines[i]);
        i += 1;
      }
      out += `<p>${buf.map((l) => inline(l.trim())).join('<br />')}</p>`;
    }

    return out;
  }

  global.renderMarkdown = render;
})(window);
