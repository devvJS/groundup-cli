import readline from 'readline';
import { amber, white, muted, line } from './splash.js';

const HELP_VALUE = '__help__';
const HELP_OPTION = { value: HELP_VALUE, label: '? explain this', hint: 'foreman help' };
const AMBER_SGR = '\x1b[38;2;245;166;35m';
const RESET_SGR = '\x1b[0m';

function logHelpStub() {
  line();
  console.log(muted('  foreman help coming in phase 2'));
  line();
}

function withHelp(options) {
  return [...options, HELP_OPTION];
}

export function askText(message, placeholder, required) {
  return new Promise((resolve) => {
    console.log(white(message));
    if (placeholder) console.log(muted('  ' + placeholder));
    line();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdout.write(amber('  › '));
    process.stdout.write(AMBER_SGR);

    rl.question('', (answer) => {
      process.stdout.write(RESET_SGR);
      rl.close();
      const trimmed = answer.trim();
      if (required && !trimmed) {
        console.log(muted('  This one matters — take a shot at it.'));
        resolve(askText(message, placeholder, required));
      } else {
        line();
        resolve(trimmed);
      }
    });

    rl.on('SIGINT', () => {
      process.stdout.write(RESET_SGR);
      rl.close();
      line();
      console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
      line();
      process.exit(0);
    });
  });
}

export function askSelect(message, options, initialValue) {
  const allOptions = withHelp(options);
  return new Promise((resolve) => {
    console.log(white(message));
    line();

    let selected = Math.max(0, allOptions.findIndex(o => o.value === initialValue));
    if (selected < 0) selected = 0;

    const drawRow = (opt, isCursor) => {
      const paint = isCursor ? amber : white;
      const pointer = isCursor ? paint('  ❯ ') : '    ';
      const marker = opt.value === HELP_VALUE ? '' : paint('■ ');
      const label = paint(opt.label);
      const recommended = opt.recommended ? paint(' ★') : '';
      const hint = opt.hint ? paint('   ' + opt.hint) : '';
      return `${pointer}${marker}${label}${recommended}${hint}\n`;
    };

    const printOptions = () => {
      allOptions.forEach((opt, i) => process.stdout.write(drawRow(opt, i === selected)));
      process.stdout.write('\n');
      process.stdout.write(muted('  ↑ ↓ navigate   enter confirm') + '\n');
      process.stdout.write('\n');
    };

    const rerender = () => {
      process.stdout.write(`\x1b[${allOptions.length + 3}A`);
      allOptions.forEach((opt, i) => {
        process.stdout.write(`\r\x1b[2K` + drawRow(opt, i === selected));
      });
      process.stdout.write(`\r\x1b[2K\n`);
      process.stdout.write(`\r\x1b[2K` + muted('  ↑ ↓ navigate   enter confirm') + '\n');
      process.stdout.write(`\r\x1b[2K\n`);
    };

    const teardown = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('keypress', onKeypress);
    };

    printOptions();

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKeypress = (str, key) => {
      if (!key) return;
      if (key.name === 'up') {
        selected = (selected - 1 + allOptions.length) % allOptions.length;
        rerender();
      } else if (key.name === 'down') {
        selected = (selected + 1) % allOptions.length;
        rerender();
      } else if (key.name === 'return') {
        const choice = allOptions[selected];
        if (choice.value === HELP_VALUE) {
          teardown();
          logHelpStub();
          resolve(askSelect(message, options, allOptions[selected === 0 ? 0 : selected - 1]?.value ?? initialValue));
          return;
        }
        teardown();
        line();
        resolve(choice.value);
      } else if (key.ctrl && key.name === 'c') {
        teardown();
        line();
        console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
        line();
        process.exit(0);
      }
    };

    setTimeout(() => {
      process.stdin.on('keypress', onKeypress);
    }, 50);
  });
}

export function askMultiselect(message, options, initialSelected = []) {
  const allOptions = withHelp(options);
  return new Promise((resolve) => {
    console.log(white(message));
    line();

    let cursor = 0;
    const selected = new Set(initialSelected);

    const drawRow = (opt, isCursor) => {
      const isHelp = opt.value === HELP_VALUE;
      const isSelected = selected.has(opt.value);
      const paint = isCursor ? amber : white;
      const circle = isHelp ? '  ' : (isSelected ? amber('⦿') : paint('○'));
      const pointer = isCursor ? paint('  ❯ ') : '    ';
      const prefix = `${pointer}${circle}${isHelp ? '' : ' '}`;
      const label = paint(opt.label);
      const hint = opt.hint ? paint('   ' + opt.hint) : '';
      return `${prefix}${label}${hint}\n`;
    };

    const printOptions = () => {
      allOptions.forEach((opt, i) => process.stdout.write(drawRow(opt, i === cursor)));
      process.stdout.write('\n');
      process.stdout.write(muted('  ↑ ↓ navigate   space select/deselect   enter confirm') + '\n');
      process.stdout.write('\n');
    };

    const rerender = () => {
      process.stdout.write(`\x1b[${allOptions.length + 3}A`);
      allOptions.forEach((opt, i) => {
        process.stdout.write(`\r\x1b[2K` + drawRow(opt, i === cursor));
      });
      process.stdout.write(`\r\x1b[2K\n`);
      process.stdout.write(`\r\x1b[2K` + muted('  ↑ ↓ navigate   space select/deselect   enter confirm') + '\n');
      process.stdout.write(`\r\x1b[2K\n`);
    };

    const teardown = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('keypress', onKeypress);
    };

    printOptions();

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKeypress = (str, key) => {
      if (!key) return;
      if (key.name === 'up') {
        cursor = (cursor - 1 + allOptions.length) % allOptions.length;
        rerender();
      } else if (key.name === 'down') {
        cursor = (cursor + 1) % allOptions.length;
        rerender();
      } else if (key.name === 'space') {
        const opt = allOptions[cursor];
        if (opt.value === HELP_VALUE) {
          teardown();
          logHelpStub();
          resolve(askMultiselect(message, options, [...selected]));
          return;
        }
        if (selected.has(opt.value)) selected.delete(opt.value);
        else selected.add(opt.value);
        rerender();
      } else if (key.name === 'return') {
        const opt = allOptions[cursor];
        if (opt.value === HELP_VALUE) {
          teardown();
          logHelpStub();
          resolve(askMultiselect(message, options, [...selected]));
          return;
        }
        if (selected.size === 0) return;
        teardown();
        line();
        resolve([...selected]);
      } else if (key.ctrl && key.name === 'c') {
        teardown();
        line();
        console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
        line();
        process.exit(0);
      }
    };

    setTimeout(() => {
      process.stdin.on('keypress', onKeypress);
    }, 50);
  });
}
