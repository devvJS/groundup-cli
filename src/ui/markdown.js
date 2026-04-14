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
  const lines = String(text || '').split('\n');
  const cols = process.stdout.columns || 80;

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed.startsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        block.push(lines[i]);
        i++;
      }
      renderTable(block);
      continue;
    }

    i++;

    if (!trimmed) {
      line();
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      sep();
      continue;
    }

    if (/^#\s+/.test(trimmed)) {
      const content = trimmed.replace(/^#\s+/, '');
      line();
      console.log(amber('━'.repeat(cols)));
      console.log(amber(content.toUpperCase()));
      console.log(amber('━'.repeat(cols)));
      line();
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      const content = trimmed.replace(/^##\s+/, '');
      line();
      console.log(white(content));
      console.log(muted('─'.repeat(content.length)));
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      const content = trimmed.replace(/^###\s+/, '');
      line();
      console.log(amber('■') + ' ' + white(content));
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const content = trimmed.replace(/^>\s?/, '');
      console.log(muted('  │ ') + muted(processInline(content)));
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      console.log(amber('  ■') + ' ' + white(processInline(content)));
      continue;
    }

    console.log(white(processInline(trimmed)));
  }
}
