import readline from 'readline';
import { amber, white, muted, warning, line } from './splash.js';

const AMBER_SGR = '\x1b[38;2;245;166;35m';
const RESET_SGR = '\x1b[0m';
const HIDE_CURSOR = '\x1B[?25l';
const SHOW_CURSOR = '\x1B[?25h';

function logHelpStub() {
  line();
  console.log(muted('  foreman help coming in phase 2'));
  line();
}

export function askText(message, placeholder, required) {
  return new Promise((resolve) => {
    const rule = muted('═'.repeat(process.stdout.columns || 80));
    process.stdout.write('\n');
    process.stdout.write('\n');
    console.log(white(message));
    if (placeholder) console.log(muted('  ' + placeholder));

    process.stdout.write(HIDE_CURSOR);
    process.stdout.write(amber('› '));

    let buffer = '';
    let mode = 'input';

    const render = () => {
      process.stdout.write('\r\x1B[2K' + amber('› ' + buffer));
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
    };

    const redrawFrame = () => {
      process.stdout.write('\x1B[3A\r\x1B[J' + amber('› ' + buffer));
    };

    const quitExit = () => {
      cleanup();
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
        if (byte === 0x0d || byte === 0x0a) {
          const trimmed = buffer.trim();
          if (required && !trimmed) {
            cleanup();
            line();
            console.log(muted('  This one matters — take a shot at it.'));
            resolve(askText(message, placeholder, required));
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

export function askSelect(message, options, initialValue) {
  return new Promise((resolve) => {
    const rule = muted('═'.repeat(process.stdout.columns || 80));
    console.log(white(message));
    line();

    let selected = Math.max(0, options.findIndex(o => o.value === initialValue));
    if (selected < 0) selected = 0;
    let confirmQuit = false;

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
      options.forEach((opt, i) => process.stdout.write(drawRow(opt, i === selected)));
      process.stdout.write('\n');
      process.stdout.write(muted('  ↑ ↓ navigate   enter confirm   ? help') + '\n');
      process.stdout.write('\n');
    };

    const rerender = () => {
      process.stdout.write(`\x1b[${options.length + 3}A`);
      options.forEach((opt, i) => {
        process.stdout.write(`\r\x1b[2K` + drawRow(opt, i === selected));
      });
      process.stdout.write(`\r\x1b[2K\n`);
      process.stdout.write(`\r\x1b[2K` + muted('  ↑ ↓ navigate   enter confirm   ? help') + '\n');
      process.stdout.write(`\r\x1b[2K\n`);
    };

    const teardown = () => {
      process.stdin.removeAllListeners('keypress');
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
    };

    process.stdout.write(HIDE_CURSOR);
    printOptions();

    process.stdin.removeAllListeners('keypress');
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);

    const onKeypress = (str, key) => {
      if (!key) return;
      if (confirmQuit) {
        if (str === 'y' || str === 'Y') {
          teardown();
          line();
          console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
          line();
          process.exit(0);
        }
        confirmQuit = false;
        process.stdout.write('\x1B[2A\r\x1B[J');
        return;
      }
      if (key.ctrl && key.name === 'c') {
        confirmQuit = true;
        process.stdout.write(rule + '\n');
        process.stdout.write(warning('  Are you sure you want to quit? ') + white('[press y for YES or n for NO]'));
        process.stdout.write('\n' + rule);
        return;
      }
      if (str === '?') {
        teardown();
        logHelpStub();
        resolve(askSelect(message, options, options[selected]?.value ?? initialValue));
        return;
      }
      if (key.name === 'up') {
        selected = (selected - 1 + options.length) % options.length;
        rerender();
      } else if (key.name === 'down') {
        selected = (selected + 1) % options.length;
        rerender();
      } else if (key.name === 'return') {
        const choice = options[selected];
        teardown();
        line();
        resolve(choice.value);
      }
    };

    setTimeout(() => {
      process.stdin.on('keypress', onKeypress);
    }, 50);
  });
}

export function askMultiselect(message, options, initialSelected = []) {
  return new Promise((resolve) => {
    const rule = muted('═'.repeat(process.stdout.columns || 80));
    console.log(white(message));
    line();

    let cursor = 0;
    let confirmQuit = false;
    const selected = new Set(initialSelected);

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

    const printOptions = () => {
      options.forEach((opt, i) => process.stdout.write(drawRow(opt, i === cursor)));
      process.stdout.write('\n');
      process.stdout.write(muted('  ↑ ↓ navigate   space select/deselect   enter confirm   ? help') + '\n');
      process.stdout.write('\n');
    };

    const rerender = () => {
      process.stdout.write(`\x1b[${options.length + 3}A`);
      options.forEach((opt, i) => {
        process.stdout.write(`\r\x1b[2K` + drawRow(opt, i === cursor));
      });
      process.stdout.write(`\r\x1b[2K\n`);
      process.stdout.write(`\r\x1b[2K` + muted('  ↑ ↓ navigate   space select/deselect   enter confirm   ? help') + '\n');
      process.stdout.write(`\r\x1b[2K\n`);
    };

    const teardown = () => {
      process.stdin.removeAllListeners('keypress');
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(SHOW_CURSOR);
    };

    process.stdout.write(HIDE_CURSOR);
    printOptions();

    process.stdin.removeAllListeners('keypress');
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isPaused()) process.stdin.resume();
    process.stdin.setRawMode(true);

    const onKeypress = (str, key) => {
      if (!key) return;
      if (confirmQuit) {
        if (str === 'y' || str === 'Y') {
          teardown();
          line();
          console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
          line();
          process.exit(0);
        }
        confirmQuit = false;
        process.stdout.write('\x1B[2A\r\x1B[J');
        return;
      }
      if (key.ctrl && key.name === 'c') {
        confirmQuit = true;
        process.stdout.write(rule + '\n');
        process.stdout.write(warning('  Are you sure you want to quit? ') + white('[press y for YES or n for NO]'));
        process.stdout.write('\n' + rule);
        return;
      }
      if (str === '?') {
        teardown();
        logHelpStub();
        resolve(askMultiselect(message, options, [...selected]));
        return;
      }
      if (key.name === 'up') {
        cursor = (cursor - 1 + options.length) % options.length;
        rerender();
      } else if (key.name === 'down') {
        cursor = (cursor + 1) % options.length;
        rerender();
      } else if (key.name === 'space') {
        const opt = options[cursor];
        if (selected.has(opt.value)) selected.delete(opt.value);
        else selected.add(opt.value);
        rerender();
      } else if (key.name === 'return') {
        if (selected.size === 0) return;
        teardown();
        line();
        resolve([...selected]);
      }
    };

    setTimeout(() => {
      process.stdin.on('keypress', onKeypress);
    }, 50);
  });
}
