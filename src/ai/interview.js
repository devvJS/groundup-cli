import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getProvider } from './index.js';
import { askText, askSelect, askMultiselect } from '../ui/input.js';
import { amber, white, muted, line, sep, success, warning } from '../ui/splash.js';
import { renderMarkdown } from '../ui/markdown.js';
import { loadSession, updateSession, saveInterviewProgress } from '../session/state.js';
import { getResponseTimes, recordResponseTime, getTokenCounts, recordTokenCount } from './config.js';

const FORMAT_SPEC = `Format every response using this exact structure. No deviations. No markdown. No extra text outside these labels.

TYPE: select
QUESTION: [question]
SUBTEXT: [optional one line of context]
OPTIONS: [option 1] | [option 2] | [option 3]
DEFAULT: [one of the options verbatim]

TYPE rules:
- select: exactly one answer is correct — primary framework, database type, deployment target
- multiselect: multiple answers are valid — features, integrations, user types, platforms, tech preferences
- text: open-ended answer — descriptions, constraints, anything without finite options
- confirm: yes/no question — always OPTIONS: Yes | No

OPTIONS delimiter is always | — never comma.
DEFAULT must match an option exactly, verbatim.
For multiselect, DEFAULT lists pre-selected items separated by |.
SUBTEXT is optional — omit the line entirely if not needed.

EVERY select and multiselect question must include these two options as the LAST entries in the OPTIONS list, in this order:
- Help me choose
- Not sure yet

Only put "Help me choose" or "Not sure yet" in DEFAULT if the developer has signaled they want you to decide (e.g. they answered "I just want you to decide everything" in the experience assessment).

When the developer selects "Help me choose":
- Your next response is a HELP response explaining your recommendation for the question that was just asked
- Then the turn after that, send the next question as if the developer had answered with your chosen option, and note the auto-chosen value in SUBTEXT of that next question

When the developer selects "Not sure yet":
- Mark the question as an open decision in .groundup/BLUEPRINT.md under an "Open Questions" section
- Move on to the next question

When you have enough to write a complete blueprint, respond with exactly:
INTERVIEW_COMPLETE

When the developer hits ? respond with exactly:
HELP: [plain language explanation]
WHY: [specific to their project]
OPTIONS_EXPLAINED:
[option]: [plain explanation]
RECOMMENDATION: [option name] — [one sentence why for this project]`;

function systemPrompt(seedAnswers, blueprint) {
  return `You are groundup — an AI agent running an adaptive interview with a developer to produce a complete project blueprint.

SEED ANSWERS
- Purpose: ${seedAnswers.purpose}
- Platform: ${seedAnswers.platform}

CURRENT BLUEPRINT
\`\`\`
${blueprint}
\`\`\`

YOUR JOB
1. Ask ONE question at a time. Adapt to the developer's previous answers.
2. Never assume. If the developer has not explicitly chosen something, ask.
3. Prefer select / multiselect / confirm over text whenever the answer space is finite.

DEVELOPER EXPERIENCE ASSESSMENT
Early in the interview (within the first 2–3 questions), assess the developer's experience level. Ask something like:

TYPE: select
QUESTION: How familiar are you with building this kind of app?
SUBTEXT: This helps me calibrate how much detail to go into.
OPTIONS: I'm new to this | I know the basics | I'm pretty experienced | I just want you to decide everything | Help me choose | Not sure yet
DEFAULT: I know the basics

Use their answer to adapt the rest of the interview:
- "I'm new to this" / "I just want you to decide everything" → slow down, explain every recommendation, always provide a safe default, prompt them to hit ? for help liberally
- "I know the basics" → moderate pace, explain when introducing unfamiliar tech
- "I'm pretty experienced" → move fast, minimal explanation, trust their judgment, skip obvious questions

${FORMAT_SPEC}`;
}

function parseResponse(text) {
  const trimmed = text.trim();
  if (trimmed === 'INTERVIEW_COMPLETE' || /^INTERVIEW_COMPLETE\b/.test(trimmed)) {
    return { type: 'complete' };
  }
  if (/^HELP:/m.test(trimmed) && !/^TYPE:/m.test(trimmed)) {
    return parseHelp(trimmed);
  }

  const lines = trimmed.split('\n');
  const fields = {};
  let current = null;
  const LABELS = ['TYPE', 'QUESTION', 'SUBTEXT', 'OPTIONS', 'DEFAULT'];

  for (const raw of lines) {
    const m = raw.match(/^([A-Z_]+):\s?(.*)$/);
    if (m && LABELS.includes(m[1])) {
      current = m[1].toLowerCase();
      fields[current] = m[2];
    } else if (current) {
      fields[current] += '\n' + raw;
    }
  }
  for (const k of Object.keys(fields)) fields[k] = (fields[k] ?? '').trim();

  const type = (fields.type || 'text').toLowerCase();
  const question = fields.question || '';
  const subtext = fields.subtext || '';
  const options = fields.options
    ? fields.options.split('|').map((s) => s.trim()).filter(Boolean)
    : [];
  const defaults = fields.default
    ? fields.default.split('|').map((s) => s.trim()).filter(Boolean)
    : [];

  return { type, question, subtext, options, defaults };
}

function parseHelp(text) {
  const result = { type: 'help', help: '', why: '', optionsExplained: '', recommendation: '' };
  const lines = text.split('\n');
  let current = null;
  for (const raw of lines) {
    const m = raw.match(/^(HELP|WHY|OPTIONS_EXPLAINED|RECOMMENDATION):\s?(.*)$/);
    if (m) {
      const key =
        m[1] === 'HELP' ? 'help'
        : m[1] === 'WHY' ? 'why'
        : m[1] === 'OPTIONS_EXPLAINED' ? 'optionsExplained'
        : 'recommendation';
      current = key;
      result[key] = m[2];
    } else if (current) {
      result[current] += '\n' + raw;
    }
  }
  for (const k of Object.keys(result)) {
    if (typeof result[k] === 'string') result[k] = result[k].trim();
  }
  return result;
}

const INTERVIEW_THINKING_MESSAGES = [
  'scratching my head...',
  'let me think about that...',
  "hold on, i'm thinking...",
  'processing your life choices...',
  'one sec...',
  'do i have to do everything around here...',
  'consulting the blueprint gods...',
  'you call that a requirement?',
  'interesting. very interesting.',
  'cross-referencing with my extensive experience...',
  "don't rush me.",
  'right. okay. give me a second.',
  "this is actually a good one...",
  'asking the architecture spirits...',
  'building something in my head real quick...',
  "that's either genius or a nightmare, figuring out which...",
  'hmm.',
  'weighing the tradeoffs...',
  'mentally drafting a diagram...',
  'nobody said this was going to be easy...',
  'running it through the vibe check...',
  'okay okay okay...',
  'rotating the cube in my mind...',
];

const HELP_THINKING_MESSAGES = [
  'flipping through the manual...',
  'checking the specs...',
  'asking the foreman...',
  'pulling up the docs...',
  'let me look that up...',
  'one sec, checking...',
  'consulting the blueprints...',
  'hold on, reading the fine print...',
  'digging through the archives...',
  'cross-referencing...',
];

const DEFAULT_EST_TOKENS = 800;

// Once INTERVIEW_COMPLETE is detected, updateBlueprint() becomes a no-op so
// the finalized .groundup/BLUEPRINT.md can only be changed via the Edit option in
// reviewBlueprint() (which opens the developer's own editor). Reset at the
// top of every runAIInterview() call.
let blueprintLocked = false;

const TOPIC_LIST = [
  'users',
  'authentication',
  'roles & permissions',
  'core features',
  'database',
  'offline support',
  'payments',
  'real-time',
  'file storage',
  'compliance',
  'deployment',
  'timeline',
];

const TOPIC_KEYWORDS = {
  'users': ['user', 'audience', 'customer'],
  'authentication': ['auth', 'login', 'sign in', 'sign up', 'signup', 'signin', 'oauth'],
  'roles & permissions': ['role', 'permission', 'access control', 'rbac', 'admin'],
  'core features': ['feature', 'functionality', 'mvp', 'core'],
  'database': ['database', ' db ', 'postgres', 'mysql', 'sqlite', 'mongo', 'storage model'],
  'offline support': ['offline', 'sync'],
  'payments': ['payment', 'billing', 'stripe', 'subscription', 'pricing', 'checkout'],
  'real-time': ['real-time', 'realtime', 'websocket', 'live update', 'push'],
  'file storage': ['file upload', 'upload', 'media', 'image', 's3', 'blob'],
  'compliance': ['compliance', 'gdpr', 'hipaa', 'pci', 'privacy', 'audit'],
  'deployment': ['deploy', 'hosting', 'vercel', 'netlify', 'aws', 'docker', 'render'],
  'timeline': ['timeline', 'deadline', 'launch', 'ship date', 'when do you'],
};

export function remainingTopics(history) {
  const haystack = history
    .map((h) => {
      const ans = Array.isArray(h.answer) ? h.answer.join(' ') : String(h.answer || '');
      return ((h.question || '') + ' ' + ans).toLowerCase();
    })
    .join(' ');
  const covered = new Set();
  for (const topic of TOPIC_LIST) {
    const kws = TOPIC_KEYWORDS[topic] || [topic];
    if (kws.some((k) => haystack.includes(k))) covered.add(topic);
  }
  return TOPIC_LIST.filter((t) => !covered.has(t));
}

// createActivityLog — an observable running record of everything groundup has
// done in the current session. The thinking screen subscribes and repaints
// whenever the log changes, so fs actions, seed decisions, and interview
// answers all flow through the same view.
export function createActivityLog() {
  const state = { completed: [], activeTask: null };
  const listeners = new Set();
  const notify = () => {
    for (const fn of listeners) {
      try { fn(); } catch {}
    }
  };
  return {
    get completed() { return state.completed; },
    get activeTask() { return state.activeTask; },
    record(label, value) {
      state.completed.push({ label, value });
      notify();
    },
    startTask(label) {
      state.activeTask = label;
      notify();
    },
    finishTask(label, value) {
      state.completed.push({ label, value });
      state.activeTask = null;
      notify();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function startThinking({ providerName, pool = INTERVIEW_THINKING_MESSAGES, activityLog, topicsRemaining = [] } = {}) {
  const message = pool[Math.floor(Math.random() * pool.length)];
  const tokenHistory = providerName ? getTokenCounts(providerName) : [];
  const estTokens = tokenHistory.length > 0
    ? Math.max(100, tokenHistory.reduce((a, b) => a + b, 0) / tokenHistory.length)
    : DEFAULT_EST_TOKENS;
  const startTime = Date.now();

  let tokensReceived = 0;
  let currentAction = 'reading your answer...';
  let painted = false;
  let totalLines = 0;
  let barIdx = 0;
  let actionIdx = 0;
  let held = false;
  let stopped = false;

  const barLine = () => {
    const pct = held ? 100 : Math.min(95, Math.floor((tokensReceived / estTokens) * 100));
    const filled = Math.round((pct / 100) * 20);
    const empty = 20 - filled;
    return (
      muted('  [') +
      amber('■'.repeat(filled)) +
      muted('□'.repeat(empty)) +
      muted(']') +
      ' ' +
      amber(pct + '%')
    );
  };

  const actionLine = () => {
    const task = activityLog?.activeTask || currentAction;
    return amber('  › ') + muted(task);
  };

  const LABEL_WIDTH = 28;
  const VALUE_WIDTH = 36;

  const formatCompleted = (item) => {
    const rawLabel = String(item.label || '');
    const label = truncate(rawLabel, LABEL_WIDTH).padEnd(LABEL_WIDTH);
    const value = truncate(String(item.value || ''), VALUE_WIDTH);
    return '  ' + success('✓') + ' ' + white(label) + ' ' + muted(value);
  };

  const buildFullLayout = () => {
    const lines = [];

    lines.push(amber('■') + ' ' + muted(message));
    lines.push('');
    const bIdx = lines.length;
    lines.push(barLine());
    lines.push('');

    lines.push(amber('  completed:'));
    const completed = activityLog?.completed ?? [];
    const recent = completed.slice(-10);
    if (recent.length === 0) {
      lines.push(muted('  (nothing yet)'));
    } else {
      for (const item of recent) {
        lines.push(formatCompleted(item));
      }
    }
    lines.push('');

    lines.push(amber('  in progress:'));
    const aIdx = lines.length;
    lines.push(actionLine());
    lines.push('');

    lines.push(amber('  next:'));
    const nextTopics = topicsRemaining.slice(0, 3);
    if (nextTopics.length === 0) {
      lines.push(muted('  (wrapping up)'));
    } else {
      for (const t of nextTopics) {
        lines.push(muted('  □ ') + muted(t));
      }
    }

    return { lines, barIdx: bIdx, actionIdx: aIdx };
  };

  const eraseCurrent = () => {
    if (!painted) return;
    process.stdout.write(`\x1B[${totalLines}A\x1B[J`);
    painted = false;
  };

  const paintFull = () => {
    const layout = buildFullLayout();
    for (const l of layout.lines) process.stdout.write(l + '\n');
    totalLines = layout.lines.length;
    barIdx = layout.barIdx;
    actionIdx = layout.actionIdx;
    painted = true;
  };

  // Move up (totalLines - idx) rows, clear the line, write new content,
  // then move back down to the home row (just below the last printed line).
  const patchLine = (idx, content) => {
    const delta = totalLines - idx;
    if (delta <= 0) return;
    process.stdout.write(`\x1B[${delta}A\r\x1B[2K${content}\x1B[${delta}B\r`);
  };

  const paintDynamic = () => {
    patchLine(barIdx, barLine());
    patchLine(actionIdx, actionLine());
  };

  const paint = () => {
    if (stopped && !held) return;
    if (!painted) paintFull();
    else paintDynamic();
  };

  // Clear the screen once on start so seed clack traces, callouts, and
  // prior scroll are replaced by the unified thinking view.
  process.stdout.write('\x1B[2J\x1B[H');
  process.stdout.write('\x1B[?25l');
  paint();
  const interval = setInterval(paint, 200);

  // Structural repaint on every activity-log change — the completed block
  // grows so the layout height can change.
  const unsubscribe = activityLog
    ? activityLog.onChange(() => {
        if (stopped) return;
        eraseCurrent();
        paintFull();
      })
    : () => {};

  return {
    setAction(next) {
      currentAction = next;
    },
    addTokens(n) {
      tokensReceived += n;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      clearInterval(interval);
      held = true;
      paint();
      await new Promise((r) => setTimeout(r, 300));
      eraseCurrent();
      process.stdout.write('\x1B[?25h');
      const elapsed = Date.now() - startTime;
      if (providerName) {
        try { recordResponseTime(providerName, elapsed); } catch {}
        try { recordTokenCount(providerName, tokensReceived); } catch {}
      }
    },
  };
}

async function collectStreamWithThinking(provider, messages, system, indicator) {
  let full = '';
  let chars = 0;
  indicator.setAction('reading your answer...');
  try {
    for await (const chunk of provider.stream(messages, system)) {
      full += chunk;
      chars += chunk.length;
      const delta = Math.max(1, Math.ceil(chunk.length / 4));
      indicator.addTokens(delta);
      if (chars > 600) indicator.setAction('forming next question...');
      else if (chars > 200) indicator.setAction('thinking it through...');
    }
  } finally {
    await indicator.stop();
  }
  return full;
}

function blueprintPathFor(projectDir) {
  return path.join(projectDir, '.groundup', 'BLUEPRINT.md');
}

function readBlueprint(projectDir) {
  const p = blueprintPathFor(projectDir);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function writeBlueprint(projectDir, content) {
  const p = blueprintPathFor(projectDir);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, content);
}

function cleanBlueprint(text) {
  if (!text) return '';
  const lines = String(text).split('\n');
  const kept = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '---' || trimmed === '***') continue;
    if (/^\*.*\*$/.test(trimmed)) continue;
    if (/interview complete/i.test(trimmed)) continue;
    if (/ready to build/i.test(trimmed)) continue;
    kept.push(raw);
  }
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  return kept.join('\n');
}

async function updateBlueprint(provider, projectDir, conversationHistory, indicator = null) {
  if (blueprintLocked) return;
  const current = readBlueprint(projectDir);
  const transcript = conversationHistory
    .map((h) => `Q: ${h.question}\nA: ${Array.isArray(h.answer) ? h.answer.join(', ') : h.answer}`)
    .join('\n\n');

  const prompt = `Based on the interview so far, update .groundup/BLUEPRINT.md. Return only the complete updated markdown content of the file. No code fences. No commentary.

CURRENT BLUEPRINT:
${current}

INTERVIEW TRANSCRIPT:
${transcript}`;

  try {
    let full = '';
    for await (const chunk of provider.stream(
      [{ role: 'user', content: prompt }],
      'You maintain a project .groundup/BLUEPRINT.md file. Return only the updated markdown content — no code fences, no commentary.'
    )) {
      full += chunk;
      if (indicator) indicator.addTokens(Math.max(1, Math.ceil(chunk.length / 4)));
    }
    const cleaned = cleanBlueprint(full);
    if (cleaned.trim()) writeBlueprint(projectDir, cleaned + '\n');
  } catch (err) {
    // swallow — don't disturb the indicator
  }
}

// renderQuestion — clears the screen and paints the live prompt view:
// compact decisions header (once at least one interview answer exists)
// followed by the current question. Every question render is a full
// repaint, so the header never lingers as permanent scroll.
function renderQuestion(parsed, history = []) {
  process.stdout.write('\x1B[2J\x1B[H');
  if (history.length > 0) {
    sep();
    console.log(white('decisions so far:'));
    sep();
    for (const d of history) {
      const ans = formatAnswer(d.answer);
      console.log(
        success('✓') + ' ' +
        muted(truncate(d.question, 48)) + ' ' +
        muted('→') + ' ' +
        amber(truncate(ans, 32))
      );
    }
    console.log(muted('ctrl+o — expand'));
    sep();
  }
  line();
  if (parsed.question) console.log(white(parsed.question));
  if (parsed.subtext) {
    console.log(muted('  ' + parsed.subtext));
    line();
  }
}

function formatAnswer(answer) {
  return Array.isArray(answer) ? answer.join(', ') : String(answer);
}

const truncate = (str, max) => (str.length > max ? str.slice(0, max) + '...' : str);

// showFullDecisions — renders the expanded ctrl+o overlay inside the
// terminal's alternate screen buffer. Exiting the alt buffer restores the
// previous screen state byte-for-byte, so there is zero scroll residue
// regardless of what the underlying view looked like.
function showFullDecisions(history) {
  return new Promise((resolve) => {
    process.stdout.write('\x1B[?1049h\x1B[2J\x1B[H');
    sep();
    console.log(white('all decisions'));
    sep();
    line();
    for (const d of history) {
      const ans = Array.isArray(d.answer) ? d.answer.join(', ') : d.answer;
      console.log(success('✓') + ' ' + white(d.question));
      console.log(amber('  → ') + white(ans));
      line();
    }
    sep();
    console.log(muted('  press any key to return'));

    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);
    const onData = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1B[?1049l');
      resolve();
    };
    process.stdin.on('data', onData);
  });
}

function wordWrap(text, width) {
  if (!text) return [];
  const result = [];
  for (const paragraph of String(text).split('\n')) {
    if (!paragraph.trim()) { result.push(''); continue; }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const word of words) {
      if (!cur) { cur = word; continue; }
      if ((cur + ' ' + word).length > width) {
        result.push(cur);
        cur = word;
      } else {
        cur += ' ' + word;
      }
    }
    if (cur) result.push(cur);
  }
  return result;
}

function renderHelp(questionText, parsed, history = []) {
  process.stdout.write('\x1B[2J\x1B[H');
  const cols = process.stdout.columns || 80;
  const interior = Math.max(2, cols - 2);
  const bodyWidth = Math.max(20, cols - 4);
  const optionWidth = Math.max(20, cols - 6);

  const title = 'HELP — ' + String(questionText || '').toUpperCase();
  const maxTitle = interior - 1;
  const shown = title.length > maxTitle ? title.slice(0, Math.max(0, maxTitle - 1)) + '…' : title;
  const pad = ' '.repeat(Math.max(0, interior - 1 - shown.length));

  sep();
  console.log(amber('╔' + '═'.repeat(interior) + '╗'));
  console.log(amber('║') + ' ' + white(shown) + pad + amber('║'));
  console.log(amber('╚' + '═'.repeat(interior) + '╝'));
  line();

  if (parsed.help || parsed.why) {
    console.log(amber('■') + ' ' + white('why this question exists'));
    line();
    const body = [parsed.help, parsed.why].filter(Boolean).join('\n\n');
    for (const ln of wordWrap(body, bodyWidth)) console.log(white(ln));
    line();
  }

  if (parsed.optionsExplained) {
    console.log(amber('■') + ' ' + white('breaking it down'));
    line();
    for (const raw of parsed.optionsExplained.split('\n')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(':');
      const name = idx < 0 ? trimmed : trimmed.slice(0, idx).trim();
      const expl = idx < 0 ? '' : trimmed.slice(idx + 1).trim();
      console.log(amber('  ■ ' + name));
      if (expl) {
        for (const ln of wordWrap(expl, optionWidth)) console.log(white('  ' + ln));
      }
      line();
    }
  }

  if (parsed.recommendation) {
    console.log(amber('■') + ' ' + white('recommendation'));
    line();
    for (const ln of wordWrap(parsed.recommendation, bodyWidth)) console.log(white(ln));
    line();
  }

  sep();
  console.log(amber('←') + ' ' + warning('ESC') + ' ' + muted('to') + ' ' + success('go back'));
}

async function streamHelpWithThinking(provider, system, baseMessages, parsed, providerName, history = [], activityLog = null) {
  const context = [
    `Question: ${parsed.question}`,
    parsed.subtext ? `Subtext: ${parsed.subtext}` : null,
    parsed.options?.length ? `Options: ${parsed.options.join(' | ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const helpMsg = `The developer hit h (help) on this question. Provide a HELP response.\n\n${context}`;
  const indicator = startThinking({
    providerName,
    pool: HELP_THINKING_MESSAGES,
    activityLog,
    topicsRemaining: remainingTopics(history),
  });
  indicator.setAction('consulting the foreman...');

  let full = '';
  try {
    for await (const chunk of provider.stream(
      [...baseMessages, { role: 'user', content: helpMsg }],
      system
    )) {
      full += chunk;
      indicator.addTokens(Math.max(1, Math.ceil(chunk.length / 4)));
    }
  } finally {
    await indicator.stop();
  }
  const helpParsed = parseHelp(full);
  renderHelp(parsed.question, helpParsed, history);
}

async function renderAndAsk(parsed, provider, providerName, system, messages, history, activityLog = null) {
  renderQuestion(parsed, history);

  const onHelp = async () => {
    await streamHelpWithThinking(provider, system, messages, parsed, providerName, history, activityLog);
  };

  const onViewDecisions = async () => {
    await showFullDecisions(history);
    renderQuestion(parsed, history);
  };

  const onResize = () => {
    renderQuestion(parsed, history);
  };

  const { type, options, defaults } = parsed;
  const hasDecisions = history.length > 0;

  if (type === 'select' && options.length > 0) {
    const optList = options.map((o) => ({ value: o, label: o }));
    const def = defaults[0];
    const initial = options.includes(def) ? def : options[0];
    return askSelect('', optList, initial, onHelp, onViewDecisions, hasDecisions, onResize);
  }

  if (type === 'multiselect' && options.length > 0) {
    const optList = options.map((o) => ({ value: o, label: o }));
    const initialSelected = defaults.filter((d) => options.includes(d));
    return askMultiselect('', optList, initialSelected, onHelp, onViewDecisions, hasDecisions, onResize);
  }

  if (type === 'confirm') {
    const yesNo = [
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ];
    const def = defaults[0];
    const initial = def === 'No' ? 'No' : 'Yes';
    return askSelect('', yesNo, initial, onHelp, onViewDecisions, hasDecisions, onResize);
  }

  // text (default)
  const placeholder = defaults[0] || null;
  const answer = await askText('', placeholder, true, false, onViewDecisions, '', onResize);
  return answer;
}

function openInEditor(filePath) {
  return new Promise((resolve) => {
    const editor = process.env.VISUAL || process.env.EDITOR || 'nano';
    const child = spawn(editor, [filePath], { stdio: 'inherit' });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

export async function reviewBlueprint(projectDir, history = []) {
  while (true) {
    process.stdout.write('\x1B[2J\x1B[H');
    sep();
    console.log(amber('■') + ' ' + white('your blueprint'));
    sep();
    line();
    const content = cleanBlueprint(readBlueprint(projectDir));
    renderMarkdown(content);
    line();
    sep();
    line();
    console.log(white('Does this reflect what you want to build?'));

    // Persist the blueprint phase BEFORE opening the approval gate so a
    // ctrl+c at any point during approval finds phase: 'blueprint' in the
    // session.
    try {
      saveInterviewProgress(projectDir, { phase: 'blueprint' });
    } catch {}

    const choice = await askSelect(
      '',
      [
        { value: 'yes', label: 'Yes — approve and continue' },
        { value: 'no', label: 'No — restart the interview' },
        { value: 'edit', label: 'Edit — open .groundup/BLUEPRINT.md in default editor then re-review' },
      ],
      'yes'
    );
    if (choice === 'yes') return 'approved';
    if (choice === 'no') return 'restart';
    await openInEditor(blueprintPathFor(projectDir));
  }
}

function buildResumeMessage(priorHistory) {
  const transcript = priorHistory
    .map((h, i) => {
      const ans = Array.isArray(h.answer) ? h.answer.join(', ') : String(h.answer);
      return `${i + 1}. Q: ${h.question}\n   A: ${ans}`;
    })
    .join('\n');
  return `We are resuming an interview that was interrupted. Here are the questions and answers already collected:\n\n${transcript}\n\nDo NOT re-ask any of these. Continue with the next unanswered question based on what's still needed for a complete blueprint.`;
}

export async function runAIInterview(seedAnswers, providerName, projectDir, priorHistory = [], options = {}) {
  // Prefer the explicit interview model stored in session; fall back to the
  // provider's DEFAULT_MODEL if no selection was made (legacy sessions).
  let selectedModel = null;
  try {
    const s = loadSession(projectDir);
    const im = s?.interview?.interviewModel;
    if (im && im.provider === providerName) selectedModel = im.model;
  } catch {}
  const provider = getProvider(providerName, selectedModel);

  const activityLog = options.activityLog ?? createActivityLog();
  const { preInstalls } = options;
  let resumeHistory = priorHistory;
  let firstPass = true;

  while (true) {
    blueprintLocked = false;
    const messages = [];
    const history = [];

    if (resumeHistory && resumeHistory.length > 0) {
      messages.push({ role: 'user', content: buildResumeMessage(resumeHistory) });
      for (const h of resumeHistory) {
        history.push(h);
        activityLog.record(h.question, formatAnswer(h.answer));
      }
      // Only apply resume on the first pass; a restart wipes back to a fresh interview.
      resumeHistory = [];
    } else {
      messages.push({
        role: 'user',
        content: 'Begin the interview. Ask your first question based on the seed answers above.',
      });
    }

    // Unified thinking screen — single source of truth for every activity.
    let indicator = startThinking({
      providerName,
      pool: INTERVIEW_THINKING_MESSAGES,
      activityLog,
      topicsRemaining: remainingTopics(history),
    });

    // Run any fs installs INSIDE the indicator so startTask/finishTask drive
    // the live UI. Only on the first pass — a restart reuses the same dir.
    if (firstPass && typeof preInstalls === 'function') {
      try {
        await preInstalls(activityLog);
      } catch (err) {
        await indicator.stop();
        throw err;
      }
    }
    firstPass = false;

    while (true) {
      const blueprint = readBlueprint(projectDir);
      const system = systemPrompt(seedAnswers, blueprint);

      const response = await collectStreamWithThinking(provider, messages, system, indicator);

      const parsed = parseResponse(response);

      if (parsed.type === 'complete') {
        blueprintLocked = true;
        messages.push({ role: 'assistant', content: response });
        break;
      }

      messages.push({ role: 'assistant', content: response });

      const answer = await renderAndAsk(parsed, provider, providerName, system, messages, history, activityLog);

      const displayAnswer = formatAnswer(answer);
      messages.push({ role: 'user', content: displayAnswer });
      history.push({ question: parsed.question, answer });
      activityLog.record(parsed.question, displayAnswer);

      // start a fresh indicator that spans blueprint update + next AI call.
      // The indicator clears the screen and reads from activityLog, so every
      // prior decision reappears in the completed block.
      indicator = startThinking({
        providerName,
        pool: INTERVIEW_THINKING_MESSAGES,
        activityLog,
        topicsRemaining: remainingTopics(history),
      });
      indicator.setAction('updating blueprint...');

      await updateBlueprint(provider, projectDir, history, indicator);

      saveInterviewProgress(projectDir, {
        purpose: seedAnswers.purpose,
        platform: seedAnswers.platform,
        provider: providerName,
        answers: history,
        phase: 'interview',
      });
    }

    const result = await reviewBlueprint(projectDir, history);
    if (result === 'approved') {
      line();
      sep();
      console.log(amber('■ ') + white('interview complete — blueprint approved'));
      sep();
      line();
      return history;
    }
    // restart: wipe .groundup/BLUEPRINT.md body, loop back into interview
    try {
      writeBlueprint(projectDir, '');
    } catch {}
  }
}
