import * as clack from '@clack/prompts';
import chalk from 'chalk';
import { questions } from './questions.js';
import { updateSession } from '../session/state.js';

const amber = chalk.hex('#F5A623');
const muted = chalk.hex('#666666');
const success = chalk.hex('#4CAF50');

export async function runInterview(session) {
  const answers = session.interview ?? {};

  clack.intro(amber('■ groundup — interview'));

  for (const question of questions) {
    // check conditional — skip if when() returns false
    if (question.when && !question.when(answers)) {
      continue;
    }

    // skip already answered questions on resume
    if (answers[question.id] !== undefined) {
      console.log(muted(`  ✓ ${question.id}: ${answers[question.id]}`));
      continue;
    }

    let answer;

    if (question.type === 'text') {
      answer = await clack.text({
        message: question.message,
        placeholder: question.placeholder,
        validate: (val) => {
          if (question.required && !val.trim()) {
            return 'This one matters — take a shot at it.';
          }
        },
      });
    }

    if (question.type === 'select') {
      answer = await clack.select({
        message: question.message,
        options: question.options,
      });
    }

    // handle ctrl+c
    if (clack.isCancel(answer)) {
      clack.cancel(amber('■ ') + 'Session saved. Run ' + chalk.white('groundup continue') + ' to pick up where you left off.');
      process.exit(0);
    }

    answers[question.id] = answer;

    // save after every answer
    updateSession({ interview: answers });
  }

  const answered = Object.keys(answers).length;
  clack.outro(success(`✓ Interview complete. ${answered} questions answered.`));

  return answers;
}
