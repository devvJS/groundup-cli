import { questions } from './questions.js';
import { updateSession } from '../session/state.js';
import { sep, line, header, confirm, success, white } from '../ui/splash.js';
import { askText, askSelect } from '../ui/input.js';

export async function runInterview(session) {
  const answers = session.interview ?? {};
  const projectName = session.project.name;

  header(projectName, 'interview');

  for (const question of questions) {
    if (question.when && !question.when(answers)) {
      continue;
    }

    if (answers[question.id] !== undefined) {
      confirm(`${question.id}: ${answers[question.id]}`);
      continue;
    }

    let answer;

    if (question.type === 'text') {
      answer = await askText(question.message, question.placeholder, question.required);
    }

    if (question.type === 'select') {
      answer = await askSelect(question.message, question.options);
    }

    answers[question.id] = answer;
    updateSession({ interview: answers });

    sep();
    line();
  }

  console.log(success('✓ ') + white(`Interview complete. ${Object.keys(answers).length} questions answered.`));
  line();
  sep();
  line();

  return answers;
}
