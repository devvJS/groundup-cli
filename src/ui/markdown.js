import { amber, white, muted, line, sep } from './splash.js';

function processInline(text) {
  let out = String(text);
  out = out.replace(/\*\*(.+?)\*\*/g, (_, inner) => inner);
  out = out.replace(/`([^`]+)`/g, (_, code) => amber(code));
  return out;
}

function parseTableRow(raw) {
  let s = raw.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function looksLikeTechName(s) {
  const v = s.trim();
  if (!v) return false;
  return /^[A-Za-z][\w.+\-]*$/.test(v);
}

function renderTable(block) {
  const rows = block.map(parseTableRow);
  if (rows.length === 0) return;

  let header = null;
  let dataStart = 0;
  if (rows.length >= 2 && isSeparatorRow(rows[1])) {
    header = rows[0];
    dataStart = 2;
  }
  const dataRows = rows.slice(dataStart).filter((r) => !isSeparatorRow(r));

  const colCount = Math.max(
    header ? header.length : 0,
    ...dataRows.map((r) => r.length)
  );
  if (colCount === 0) return;

  const widths = new Array(colCount).fill(0);
  const norm = (r) => {
    const out = r.slice();
    while (out.length < colCount) out.push('');
    return out;
  };
  if (header) {
    for (let i = 0; i < colCount; i++) widths[i] = Math.max(widths[i], norm(header)[i].length);
  }
  for (const r of dataRows) {
    const n = norm(r);
    for (let i = 0; i < colCount; i++) widths[i] = Math.max(widths[i], n[i].length);
  }

  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));

  line();
  if (header) {
    const h = norm(header)
      .map((c, i) => white(pad(c, widths[i])))
      .join(muted(' │ '));
    console.log('  ' + h);
    const sepLine = widths.map((w) => muted('─'.repeat(w))).join(muted('─┼─'));
    console.log('  ' + sepLine);
  }
  for (const r of dataRows) {
    const n = norm(r);
    const rendered = n
      .map((c, i) => {
        const padded = pad(c, widths[i]);
        return looksLikeTechName(c) ? amber(padded) : white(padded);
      })
      .join(muted(' │ '));
    console.log('  ' + rendered);
  }
  line();
}

export function renderMarkdown(text) {
  for (const l of renderMarkdownLines(text)) console.log(l);
}

// Returns an array of styled strings (one per output line) without printing.
// Used by renderMarkdown (which prints each line) and by callers that need
// to prefix or wrap output (e.g. the build recap bordered block).
export function renderMarkdownLines(text) {
  const srcLines = String(text || '').split('\n');
  const cols = process.stdout.columns || 80;
  const out = [];

  let i = 0;
  while (i < srcLines.length) {
    const raw = srcLines[i];
    const trimmed = raw.trim();

    // Tables — rendered inline (multiple output lines)
    if (trimmed.startsWith('|')) {
      const block = [];
      while (i < srcLines.length && srcLines[i].trim().startsWith('|')) {
        block.push(srcLines[i]);
        i++;
      }
      // Capture table output via temporary console override
      const saved = console.log;
      const captured = [];
      console.log = (...args) => captured.push(args.join(' '));
      renderTable(block);
      console.log = saved;
      out.push(...captured);
      continue;
    }

    i++;

    if (!trimmed) {
      out.push('');
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      out.push(muted('═'.repeat(cols)));
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      const content = trimmed.replace(/^#\s+/, '');
      out.push('');
      out.push(amber('━'.repeat(cols)));
      out.push(amber(content.toUpperCase()));
      out.push(amber('━'.repeat(cols)));
      out.push('');
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      const content = trimmed.replace(/^##\s+/, '');
      out.push('');
      out.push(white(content));
      out.push(muted('─'.repeat(content.length)));
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      const content = trimmed.replace(/^###\s+/, '');
      out.push('');
      out.push(amber('■') + ' ' + white(content));
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const content = trimmed.replace(/^>\s?/, '');
      out.push(muted('  │ ') + muted(processInline(content)));
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      out.push(amber('  ■') + ' ' + white(processInline(content)));
      continue;
    }

    out.push(white(processInline(trimmed)));
  }

  return out;
}
