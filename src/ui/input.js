import { amber, white, muted, warning, line, success, sep } from './splash.js';
import { paintCommandsOverlay, dismissCommandsOverlay } from './commands.js';

function buildSelectHint(hasDecisions) {
  return '  ' + amber('↑ ↓') + ' ' + success('navigate') +
    '   ' + amber('enter') + ' ' + success('confirm') +
    '   ' + amber('h') + ' ' + warning('help') +
    '   ' + amber('/') + ' ' + success('commands') +
    (hasDecisions ? '   ' + amber('ctrl+o') + ' ' + success('expand decisions') : '');
}

function buildMultiselectHint(hasDecisions) {
  return '  ' + amber('↑ ↓') + ' ' + success('navigate') +
    '   ' + amber('space') + ' ' + success('select/deselect') +
    '   ' + amber('enter') + ' ' + success('confirm') +
    '   ' + amber('h') + ' ' + warning('help') +
    '   ' + amber('/') + ' ' + success('commands') +
    (hasDecisions ? '   ' + amber('ctrl+o') + ' ' + success('expand decisions') : '');
}


const AMBER_SGR = '\x1b[38;2;245;166;35m';
const RESET_SGR = '\x1b[0m';
const HIDE_CURSOR = '\x1B[?25l';
const SHOW_CURSOR = '\x1B[?25h';
const SAVE_CURSOR = '\x1b7';
const RESTORE_CURSOR = '\x1b8';

export function askText(message, placeholder, required, mask, onViewDecisions, initialBuffer = '', onResize = null) {
  return new Promise((resolve) => {
    let rule = muted('═'.repeat(process.stdout.columns || 80));
    const printHeader = () => {
      process.stdout.write('\n');
      process.stdout.write('\n');
      if (message) console.log(white(message));
      if (placeholder) console.log(muted('  ' + placeholder));
    };
    printHeader();

    process.stdout.write(HIDE_CURSOR);
    process.stdout.write(amber('› ') + amber(initialBuffer));

    let buffer = initialBuffer;
    let mode = 'input';
    let lastRows = 1;

    const display = () => (mask ? '•'.repeat(buffer.length) : buffer);
    const rowsFor = (text) => {
      const cols = process.stdout.columns || 80;
      return Math.max(1, Math.ceil((2 + text.length) / cols));
    };
    lastRows = rowsFor(display());
    const render = () => {
      if (lastRows > 1) process.stdout.write('\x1B[' + (lastRows - 1) + 'A');
      process.stdout.write('\r\x1B[J');
      const shown = display();
      process.stdout.write(amber('› ') + amber(shown));
      lastRows = rowsFor(shown);
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
      if (resizeListener) process.stdout.off('resize', resizeListener);
    };

    const handleResize = () => {
      rule = muted('═'.repeat(process.stdout.columns || 80));
      process.stdout.write('\x1B[2J\x1B[H');
      if (onResize) onResize();
      printHeader();
      process.stdout.write(amber('› ') + amber(display()));
      lastRows = rowsFor(display());
      mode = 'input';
    };
    const resizeListener = handleResize;
    process.stdout.on('resize', resizeListener);

    const redrawFrame = () => {
      // cursor is currently at the bottom rule of the quit dialog (3 rows below
      // the last input row). Go back up to the first input row, clear, redraw.
      const up = 2 + lastRows;
      process.stdout.write('\x1B[' + up + 'A\r\x1B[J');
      const shown = display();
      process.stdout.write(amber('› ') + amber(shown));
      lastRows = rowsFor(shown);
    };

    const quitExit = () => {
      cleanup();
      process.stdout.write('\x1B[2J\x1B[H');
      line();
      console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
      line();
      process.exit(0);
    };

    const onData = (data) => {
      for (const byte of data) {
        if (mode === 'confirm-quit') {
          if (byte === 0x79 || byte === 0x59) {
            quitExit();
            return;
          }
          redrawFrame();
          mode = 'input';
          continue;
        }
        if (byte === 0x03) {
          mode = 'confirm-quit';
          process.stdout.write('\n' + rule + '\n');
          process.stdout.write(warning('  Are you sure you want to quit? ') + white('[press y for YES or n for NO]'));
          process.stdout.write('\n' + rule);
          continue;
        }
        if (byte === 0x0f) {
          if (!onViewDecisions) continue;
          const carry = buffer;
          cleanup();
          Promise.resolve(onViewDecisions()).then(() => {
            resolve(askText(message, placeholder, required, mask, onViewDecisions, carry, onResize));
          });
          return;
        }
        if (byte === 0x0d || byte === 0x0a) {
          const trimmed = buffer.trim();
          if (required && !trimmed) {
            cleanup();
            line();
            console.log(muted('  This one matters — take a shot at it.'));
            resolve(askText(message, placeholder, required, mask, onViewDecisions, '', onResize));
            return;
          }
          cleanup();
          line();
          resolve(trimmed);
          return;
        }
        if (byte === 0x7f || byte === 0x08) {
          buffer = buffer.slice(0, -1);
          render();
          continue;
        }
        if (byte >= 0x20 && byte < 0x7f) {
          buffer += String.fromCharCode(byte);
          render();
          continue;
        }
      }
    };

    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.on('data', onData);
  });
}

export function askSelect(message, options, initialValue, onHelp, onViewDecisions, hasDecisions = false, onResize = null) {
  return new Promise((resolve) => {
    let rule = muted('═'.repeat(process.stdout.columns || 80));
    const hint = buildSelectHint(hasDecisions);
    const printHeader = () => {
      if (message) console.log(white(message));
      line();
    };
    printHeader();

    let selected = Math.max(0, options.findIndex(o => o.value === initialValue));
    if (selected < 0) selected = 0;
    let mode = 'input';

    const drawRow = (opt, isCursor) => {
      const paint = isCursor ? amber : white;
      const pointer = isCursor ? paint('  ❯ ') : '    ';
      const marker = paint('■ ');
      const label = paint(opt.label);
      const recommended = opt.recommended ? paint(' ★') : '';
      const hint = opt.hint ? paint('   ' + opt.hint) : '';
      return `${pointer}${marker}${label}${recommended}${hint}\n`;
    };

    const printOptions = () => {
      process.stdout.write(SAVE_CURSOR);
      options.forEach((opt, i) => process.stdout.write(drawRow(opt, i === selected)));
      process.stdout.write('\n');
      process.stdout.write(hint + '\n');
      process.stdout.write('\n');
    };

    const rerender = () => {
      process.stdout.write(RESTORE_CURSOR);
      process.stdout.write('\x1b[J');
      process.stdout.write(SAVE_CURSOR);
      options.forEach((opt, i) => process.stdout.write(drawRow(opt, i === selected)));
      process.stdout.write('\n');
      process.stdout.write(hint + '\n');
      process.stdout.write('\n');
    };

    const teardown = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
      process.stdout.off('resize', handleResize);
    };

    const showConfirmQuit = () => {
      mode = 'confirm-quit';
      process.stdout.write(rule + '\n');
      process.stdout.write(warning('  Are you sure you want to quit? ') + white('[press y for YES or n for NO]'));
      process.stdout.write('\n' + rule);
    };

    const dismissConfirmQuit = () => {
      process.stdout.write('\x1B[2A\r\x1B[J');
      mode = 'input';
    };

    const handleResize = () => {
      rule = muted('═'.repeat(process.stdout.columns || 80));
      process.stdout.write('\x1B[2J\x1B[H');
      if (onResize) onResize();
      printHeader();
      printOptions();
      mode = 'input';
    };
    process.stdout.on('resize', handleResize);

    const showHelp = async () => {
      await onHelp();
    };

    const dismissHelp = () => {
      process.stdout.write('\x1B[2J\x1B[H');
      if (onResize) onResize();
      printHeader();
      printOptions();
      mode = 'input';
    };

    const onData = (data) => {
      let i = 0;
      while (i < data.length) {
        const byte = data[i];

        if (mode === 'help-loading') { i++; continue; }
        if (mode === 'help') {
          if (byte === 0x1B) { dismissHelp(); }
          i++;
          continue;
        }

        if (mode === 'commands') {
          dismissCommandsOverlay();
          mode = 'input';
          i++;
          continue;
        }

        if (mode === 'confirm-quit') {
          if (byte === 0x79 || byte === 0x59) {
            teardown();
            process.stdout.write('\x1B[2J\x1B[H');
            line();
            console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
            line();
            process.exit(0);
          }
          dismissConfirmQuit();
          i++;
          continue;
        }

        // ctrl+c
        if (byte === 0x03) {
          showConfirmQuit();
          i++;
          continue;
        }

        // / → commands overlay
        if (byte === 0x2f) {
          mode = 'commands';
          paintCommandsOverlay();
          i++;
          continue;
        }

        // ESC sequence — arrow keys etc.
        if (byte === 0x1B && data[i + 1] === 0x5B && i + 2 < data.length) {
          const third = data[i + 2];
          if (third === 0x41) {
            selected = (selected - 1 + options.length) % options.length;
            rerender();
          } else if (third === 0x42) {
            selected = (selected + 1) % options.length;
            rerender();
          }
          i += 3;
          continue;
        }
        // lone ESC — ignore
        if (byte === 0x1B) { i++; continue; }

        // h → help (in-place, esc dismisses) — only when onHelp callback exists
        if (byte === 0x68) {
          if (!onHelp) { i++; continue; }
          mode = 'help-loading';
          showHelp()
            .then(() => { mode = 'help'; })
            .catch(() => { dismissHelp(); });
          i++;
          continue;
        }

        // ctrl+o → view decisions
        if (byte === 0x0f) {
          if (!onViewDecisions) { i++; continue; }
          teardown();
          const carry = options[selected]?.value ?? initialValue;
          Promise.resolve(onViewDecisions()).then(() => {
            resolve(askSelect(message, options, carry, onHelp, onViewDecisions, hasDecisions, onResize));
          });
          return;
        }

        // enter (CR or LF)
        if (byte === 0x0d || byte === 0x0a) {
          const choice = options[selected];
          teardown();
          line();
          resolve(choice.value);
          return;
        }

        i++;
      }
    };

    process.stdout.write(HIDE_CURSOR);
    printOptions();

    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.on('data', onData);
  });
}

export function askMultiselect(message, options, initialSelected = [], onHelp, onViewDecisions, hasDecisions = false, onResize = null, onToggle = null) {
  return new Promise((resolve) => {
    let rule = muted('═'.repeat(process.stdout.columns || 80));
    const hint = buildMultiselectHint(hasDecisions);
    const printHeader = () => {
      if (message) console.log(white(message));
      line();
    };
    printHeader();

    let cursor = 0;
    let mode = 'input';
    const selected = new Set(initialSelected);

    const computeContextual = () => {
      if (typeof onToggle !== 'function') return [];
      try {
        const result = onToggle(new Set(selected));
        if (!result) return [];
        return Array.isArray(result) ? result : [result];
      } catch {
        return [];
      }
    };

    const drawRow = (opt, isCursor) => {
      const isSelected = selected.has(opt.value);
      const paint = isCursor ? amber : white;
      const circle = isSelected ? amber('⦿') : paint('○');
      const pointer = isCursor ? paint('  ❯ ') : '    ';
      const prefix = `${pointer}${circle} `;
      const label = paint(opt.label);
      const hint = opt.hint ? paint('   ' + opt.hint) : '';
      return `${prefix}${label}${hint}\n`;
    };

    const writeBody = () => {
      process.stdout.write(SAVE_CURSOR);
      options.forEach((opt, i) => process.stdout.write(drawRow(opt, i === cursor)));
      process.stdout.write('\n');
      process.stdout.write(hint + '\n');
      process.stdout.write('\n');
      const contextualLines = computeContextual();
      for (const l of contextualLines) process.stdout.write(l + '\n');
    };

    const printOptions = () => {
      writeBody();
    };

    const rerender = () => {
      process.stdout.write(RESTORE_CURSOR);
      process.stdout.write('\x1b[J');
      writeBody();
    };

    const teardown = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
      process.stdout.off('resize', handleResize);
    };

    const showConfirmQuit = () => {
      mode = 'confirm-quit';
      process.stdout.write(rule + '\n');
      process.stdout.write(warning('  Are you sure you want to quit? ') + white('[press y for YES or n for NO]'));
      process.stdout.write('\n' + rule);
    };

    const dismissConfirmQuit = () => {
      process.stdout.write('\x1B[2A\r\x1B[J');
      mode = 'input';
    };

    const handleResize = () => {
      rule = muted('═'.repeat(process.stdout.columns || 80));
      process.stdout.write('\x1B[2J\x1B[H');
      if (onResize) onResize();
      printHeader();
      printOptions();
      mode = 'input';
    };
    process.stdout.on('resize', handleResize);

    const showHelp = async () => {
      await onHelp();
    };

    const dismissHelp = () => {
      process.stdout.write('\x1B[2J\x1B[H');
      if (onResize) onResize();
      printHeader();
      printOptions();
      mode = 'input';
    };

    const onData = (data) => {
      let i = 0;
      while (i < data.length) {
        const byte = data[i];

        if (mode === 'help-loading') { i++; continue; }
        if (mode === 'help') {
          if (byte === 0x1B) { dismissHelp(); }
          i++;
          continue;
        }

        if (mode === 'commands') {
          dismissCommandsOverlay();
          mode = 'input';
          i++;
          continue;
        }

        if (mode === 'confirm-quit') {
          if (byte === 0x79 || byte === 0x59) {
            teardown();
            process.stdout.write('\x1B[2J\x1B[H');
            line();
            console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
            line();
            process.exit(0);
          }
          dismissConfirmQuit();
          i++;
          continue;
        }

        if (byte === 0x03) {
          showConfirmQuit();
          i++;
          continue;
        }

        // / → commands overlay
        if (byte === 0x2f) {
          mode = 'commands';
          paintCommandsOverlay();
          i++;
          continue;
        }

        // ESC sequence — arrow keys
        if (byte === 0x1B && data[i + 1] === 0x5B && i + 2 < data.length) {
          const third = data[i + 2];
          if (third === 0x41) {
            cursor = (cursor - 1 + options.length) % options.length;
            rerender();
          } else if (third === 0x42) {
            cursor = (cursor + 1) % options.length;
            rerender();
          }
          i += 3;
          continue;
        }
        if (byte === 0x1B) { i++; continue; }

        // h → help (in-place, esc dismisses) — only when onHelp callback exists
        if (byte === 0x68) {
          if (!onHelp) { i++; continue; }
          mode = 'help-loading';
          showHelp()
            .then(() => { mode = 'help'; })
            .catch(() => { dismissHelp(); });
          i++;
          continue;
        }

        // ctrl+o → view decisions
        if (byte === 0x0f) {
          if (!onViewDecisions) { i++; continue; }
          teardown();
          const carry = [...selected];
          Promise.resolve(onViewDecisions()).then(() => {
            resolve(askMultiselect(message, options, carry, onHelp, onViewDecisions, hasDecisions, onResize, onToggle));
          });
          return;
        }

        // space → toggle
        if (byte === 0x20) {
          const opt = options[cursor];
          if (selected.has(opt.value)) selected.delete(opt.value);
          else selected.add(opt.value);
          rerender();
          i++;
          continue;
        }

        // enter
        if (byte === 0x0d || byte === 0x0a) {
          if (selected.size === 0) { i++; continue; }
          teardown();
          line();
          resolve([...selected]);
          return;
        }

        i++;
      }
    };

    process.stdout.write(HIDE_CURSOR);
    printOptions();

    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.on('data', onData);
  });
}
