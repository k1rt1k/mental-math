// Safe renderer for Gemini replies: a small Markdown subset plus LaTeX-to-text.
// Everything is HTML-escaped first; only tags produced here ever reach the DOM.
// Self-contained (no DOM access) so it can be unit-tested in Node.

const escHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const mapChars = (s, table) => (/^[0-9+\-n]+$/.test(s) && [...s].every((c) => table[c]) ? [...s].map((c) => table[c]).join('') : null);

const SYMBOLS = {
  times: '×', div: '÷', cdot: '·', pm: '±', mp: '∓', approx: '≈', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥',
  rightarrow: '→', to: '→', longrightarrow: '→', Rightarrow: '⇒', implies: '⇒', leftarrow: '←', leftrightarrow: '↔',
  equiv: '≡', ldots: '…', dots: '…', cdots: '⋯', circ: '°', degree: '°', infty: '∞', sqrt: '√', sum: 'Σ', prod: 'Π',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', pi: 'π', lambda: 'λ', mu: 'μ', sigma: 'σ', Delta: 'Δ',
  therefore: '∴', because: '∵', in: '∈', mid: '|', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', bullet: '•',
  checkmark: '✓', ',': ' ', ';': ' ', ':': ' ', '!': '', quad: ' ', qquad: '  ', ' ': ' ',
};

/** Convert one LaTeX fragment to readable plain text. Input is already HTML-escaped. */
export function latexToText(src) {
  let s = String(src);
  // Wrapper commands that just contain text.
  for (let i = 0; i < 4; i++) {
    s = s.replace(/\\(?:text|textbf|textit|mathrm|mathbf|mathit|mathsf|operatorname|boxed|underline|overline|displaystyle)\s*\{([^{}]*)\}/g, '$1');
  }
  s = s.replace(/\\(?:left|right|bigg?|Bigg?)(?![A-Za-z])\s*([()[\]|.]|\\[{}|])?/g, (_, d) => (d && d !== '.' ? d.replace('\\', '') : ''));
  // \pmod{n} / \pmod n / \bmod / \mod
  s = s.replace(/\\pmod\s*\{([^{}]*)\}/g, ' (mod $1)').replace(/\\pmod\s+(\w+)/g, ' (mod $1)');
  s = s.replace(/\\(?:bmod|mod)\b/g, ' mod ');
  // Fractions and roots (repeat for simple nesting).
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => {
      const wrap = (x) => (/^[\w.]+$/.test(x.trim()) ? x.trim() : `(${x.trim()})`);
      return `${wrap(a)}/${wrap(b)}`;
    });
    s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '$1√($2)');
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => (/^[\w.]+$/.test(a.trim()) ? `√${a.trim()}` : `√(${a.trim()})`));
  }
  s = s.replace(/\\sqrt\s*(\w+)/g, '√$1');
  // Superscripts / subscripts.
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (m, a) => mapChars(a.trim(), SUP) ?? `^(${a.trim()})`);
  s = s.replace(/\^\s*([0-9n])/g, (m, a) => SUP[a] ?? m);
  s = s.replace(/_\s*\{([^{}]*)\}/g, (m, a) => mapChars(a.trim(), SUB) ?? `_${a.trim()}`);
  s = s.replace(/_\s*([0-9])/g, (m, a) => SUB[a] ?? m);
  // Escaped literals.
  s = s.replace(/\\([%$#&_{}])/g, '$1');
  // Symbol commands (longest names first so \leq wins over \le).
  s = s.replace(/\\([A-Za-z]+|[,;:! ])/g, (m, name) => (Object.prototype.hasOwnProperty.call(SYMBOLS, name) ? SYMBOLS[name] : name));
  s = s.replace(/\\\\/g, ' ').replace(/[{}]/g, '');
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Looks like maths rather than a price such as "$5 and $6". */
const looksLikeMath = (inner) => /[\\^_=+\-*/<>×÷()]|\d/.test(inner) && !/^\s|\s$/.test(inner) && inner.length < 200;

function inline(raw, holes) {
  let s = escHtml(raw);
  const keep = (html) => { holes.push(html); return `\u0000${holes.length - 1}\u0000`; };
  // Code spans first, so nothing inside them is touched.
  s = s.replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${c}</code>`));
  // Math: \( \), then $$ $$ inline, then $ $.
  s = s.replace(/\\\((.+?)\\\)/g, (_, m) => keep(mathSpan(m)));
  s = s.replace(/\$\$(.+?)\$\$/g, (_, m) => keep(mathSpan(m)));
  s = s.replace(/\$([^$\n]+?)\$/g, (all, m) => (looksLikeMath(m) ? keep(mathSpan(m)) : all));
  // Bare LaTeX commands the model forgot to delimit.
  s = s.replace(/\\[A-Za-z]+(?:\s*\{[^{}]*\})*/g, (m) => latexToText(m));
  s = s.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '<b><i>$1</i></b>');
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>').replace(/__([^_\n]+?)__/g, '<b>$1</b>');
  s = s.replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g, '$1<i>$2</i>');
  s = s.replace(/(^|[^_\w])_(?!\s)([^_\n]+?)(?<!\s)_(?![_\w])/g, '$1<i>$2</i>');
  s = s.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');
  // Restore placeholders (holes may nest once, e.g. a code span inside bold).
  for (let i = 0; i < 2; i++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => holes[Number(n)]);
  return s;
}

const mathSpan = (m) => { const t = latexToText(m); return `<span class="mt${t.length > 24 ? ' long' : ''}">${t}</span>`; };

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Markdown subset + LaTeX → safe HTML string. */
export function renderRich(input) {
  if (!input) return '';
  const holes = [];
  let text = String(input).replace(/\r\n?/g, '\n')
    .replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/gu, '').replace(/(\S)[ \t]{2,}/g, '$1 ').replace(/^(#{1,6}) +/gm, '$1 ');   // no emoji in AI text (✓ ✗ ▲ ▼ stay)
  // Display maths becomes its own block line.
  const blocks = [];
  text = text.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (_, a, b) => {
    blocks.push(latexToText(escHtml((a ?? b).trim().replace(/\s*\n\s*/g, ' '))));
    return `\n@@MATH${blocks.length - 1}@@\n`;
  });

  const lines = text.split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const openList = (type) => { if (list !== type) { closeList(); out.push(`<${type}>`); list = type; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (/^```/.test(t)) {
      closeList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      out.push(`<pre><code>${escHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (t === '') continue; // blank lines never break a list; the next non-list line does
    const mb = t.match(/^@@MATH(\d+)@@$/);
    if (mb) { closeList(); out.push(`<div class="mb">${blocks[Number(mb[1])]}</div>`); continue; }
    if (/^([-*_])(\s*\1){2,}$/.test(t)) { closeList(); out.push('<hr>'); continue; }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); out.push(h[1].length <= 3 ? `<h3>${inline(h[2], holes)}</h3>` : `<h4>${inline(h[2], holes)}</h4>`); continue; }

    if (isTableRow(t) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeList();
      const head = cells(t);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      i--;
      out.push(`<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${inline(c, holes)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, holes)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    const ol = line.match(/^(\s*)(\d{1,3})[.)]\s+(.*)$/);
    if (ol) {
      openList('ol');
      out.push(`<li value="${Number(ol[2])}"${ol[1].length >= 2 ? ' class="sub"' : ''}>${inline(ol[3], holes)}</li>`);
      continue;
    }
    const ul = line.match(/^(\s*)[-*•]\s+(.*)$/);
    if (ul) {
      openList('ul');
      out.push(`<li${ul[1].length >= 2 ? ' class="sub"' : ''}>${inline(ul[2], holes)}</li>`);
      continue;
    }

    closeList();
    if (t.startsWith('>')) { out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''), holes)}</blockquote>`); continue; }
    out.push(`<p>${inline(t, holes)}</p>`);
  }
  closeList();
  return out.join('');
}
