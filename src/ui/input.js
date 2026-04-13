import readline from 'readline';
import { amber, white, muted, line } from './splash.js';

export function askText(message, placeholder, required) {
  return new Promise((resolve) => {
    console.log(white(message));
    line();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(white('  › '), (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (required && !trimmed) {
        console.log(muted('  This one matters — take a shot at it.'));
        resolve(askText(message, placeholder, required));
      } else {
        resolve(trimmed);
      }
    });

    rl.on('SIGINT', () => {
      rl.close();
      line();
      console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
      line();
      process.exit(0);
    });
  });
}

export function askSelect(message, options, initialValue) {
  return new Promise((resolve) => {
    console.log(white(message));
    line();

    let selected = Math.max(0, options.findIndex(o => o.value === initialValue));

    const printOptions = () => {
      options.forEach((opt, i) => {
        const isCursor = i === selected;
        const pointer = isCursor ? amber('  ❯ ') : '    ';
        const label = isCursor ? white(opt.label) : muted(opt.label);
        const hint = opt.hint ? muted('   ' + opt.hint) : '';
        process.stdout.write(`${pointer}${label}${hint}\n`);
      });
      process.stdout.write('\n');
      process.stdout.write(muted('  ↑ ↓ navigate   enter confirm') + '\n');
      process.stdout.write('\n');
    };

    const rerender = () => {
      process.stdout.write(`\x1b[${options.length + 3}A`);
      options.forEach((opt, i) => {
        const isCursor = i === selected;
        const pointer = isCursor ? amber('  ❯ ') : '    ';
        const label = isCursor ? white(opt.label) : muted(opt.label);
        const hint = opt.hint ? muted('   ' + opt.hint) : '';
        process.stdout.write(`\r\x1b[2K${pointer}${label}${hint}\n`);
      });
      process.stdout.write(`\r\x1b[2K\n`);
      process.stdout.write(`\r\x1b[2K` + muted('  ↑ ↓ navigate   enter confirm') + '\n');
      process.stdout.write(`\r\x1b[2K\n`);
    };

    printOptions();

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKeypress = (str, key) => {
      if (!key) return;
      if (key.name === 'up') {
        selected = (selected - 1 + options.length) % options.length;
        rerender();
      } else if (key.name === 'down') {
        selected = (selected + 1) % options.length;
        rerender();
      } else if (key.name === 'return') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('keypress', onKeypress);
        line();
        resolve(options[selected].value);
      } else if (key.ctrl && key.name === 'c') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('keypress', onKeypress);
        line();
        console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
        line();
        process.exit(0);
      }
    };

    // delay to consume enter keypress from previous question
    setTimeout(() => {
      process.stdin.on('keypress', onKeypress);
    }, 50);
  });
}

export function askMultiselect(message, options) {
  return new Promise((resolve) => {
    console.log(white(message));
    line();

    let cursor = 0;
    const selected = new Set();

    const printOptions = () => {
      options.forEach((opt, i) => {
        const isCursor = i === cursor;
        const isSelected = selected.has(opt.value);
        const circle = isSelected ? amber('⦿') : muted('○');
        const prefix = isCursor ? amber('  ❯ ') + circle + ' ' : '    ' + circle + ' ';
        const label = isCursor ? white(opt.label) : muted(opt.label);
        const hint = opt.hint ? muted('   ' + opt.hint) : '';
        process.stdout.write(`${prefix}${label}${hint}\n`);
      });
      process.stdout.write('\n');
      process.stdout.write(muted('  ↑ ↓ navigate   space select/deselect   enter confirm') + '\n');
      process.stdout.write('\n');
    };

    const rerender = () => {
      process.stdout.write(`\x1b[${options.length + 3}A`);
      options.forEach((opt, i) => {
        const isCursor = i === cursor;
        const isSelected = selected.has(opt.value);
        const circle = isSelected ? amber('⦿') : muted('○');
        const prefix = isCursor ? amber('  ❯ ') + circle + ' ' : '    ' + circle + ' ';
        const label = isCursor ? white(opt.label) : muted(opt.label);
        const hint = opt.hint ? muted('   ' + opt.hint) : '';
        process.stdout.write(`\r\x1b[2K${prefix}${label}${hint}\n`);
      });
      process.stdout.write(`\r\x1b[2K\n`);
      process.stdout.write(`\r\x1b[2K` + muted('  ↑ ↓ navigate   space select/deselect   enter confirm') + '\n');
      process.stdout.write(`\r\x1b[2K\n`);
    };

    printOptions();

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKeypress = (str, key) => {
      if (!key) return;
      if (key.name === 'up') {
        cursor = (cursor - 1 + options.length) % options.length;
        rerender();
      } else if (key.name === 'down') {
        cursor = (cursor + 1) % options.length;
        rerender();
      } else if (key.name === 'space') {
        if (selected.has(options[cursor].value)) {
          selected.delete(options[cursor].value);
        } else {
          selected.add(options[cursor].value);
        }
        rerender();
      } else if (key.name === 'return') {
        if (selected.size === 0) return;
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('keypress', onKeypress);
        line();
        resolve([...selected]);
      } else if (key.ctrl && key.name === 'c') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('keypress', onKeypress);
        line();
        console.log(amber('■ ') + white('Session saved. Run ') + amber('groundup continue') + white(' to pick up where you left off.'));
        line();
        process.exit(0);
      }
    };

    // delay to consume enter keypress from previous question
    setTimeout(() => {
      process.stdin.on('keypress', onKeypress);
    }, 50);
  });
}
