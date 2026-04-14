import fs from 'fs';
import path from 'path';
import { showSplash, line, amber, white, muted, sep } from '../ui/splash.js';
import { sessionExists, loadSession, updateSession } from '../session/state.js';
import { runRepoSetup } from './repo.js';
import { runSeedToInterview } from './dig.js';
import { reviewBlueprint, runAIInterview } from '../ai/interview.js';

export async function resume() {
  await showSplash();

  if (!sessionExists()) {
    console.log(amber('■ ') + white('No session found.'));
    console.log(muted('  Run ') + white('groundup dig [name]') + muted(' to start a new project.'));
    line();
    return;
  }

  const session = loadSession();

  console.log(amber('■ ') + white(`Resuming: ${session.project.name}`));
  console.log(muted(`  Phase: ${session.phase}`));
  line();

  const projectName = session.project.name;
  const projectDir = session.project.dir ?? process.cwd();

  // Every resume path assumes the project directory already exists — no directory prompt.
  try { process.chdir(projectDir); } catch {}

  const prefill = {
    purpose: session.interview?.purpose ?? session.seed?.purpose,
    platform: session.interview?.platform ?? session.seed?.platform,
    provider: session.interview?.provider ?? session.ai?.provider,
    providers: session.interview?.providers,
    interviewModel: session.interview?.interviewModel,
    buildModel: session.interview?.buildModel,
    agents: session.interview?.agents,
  };

  switch (session.phase) {
    case 'seed': {
      // Pass whatever seed/provider answers we already have; runSeedToInterview
      // skips any prompt whose value is already prefilled.
      await runSeedToInterview(projectName, projectDir, prefill);
      return;
    }

    case 'interview': {
      if (!prefill.purpose || !prefill.platform || !prefill.provider) {
        // Partial pre-interview state — forward everything we have.
        await runSeedToInterview(projectName, projectDir, prefill);
        return;
      }
      const priorHistory = session.interview?.answers ?? session.interview?.history ?? [];
      await runSeedToInterview(projectName, projectDir, prefill, priorHistory);
      return;
    }

    case 'blueprint': {
      const blueprintPath = path.join(projectDir, '.groundup', 'BLUEPRINT.md');
      const priorHistory = session.interview?.answers ?? session.interview?.history ?? [];

      // If .groundup/BLUEPRINT.md is missing we can't review it — fall back to resuming
      // the interview with whatever history we already collected.
      const blueprintExists =
        fs.existsSync(blueprintPath) && fs.readFileSync(blueprintPath, 'utf-8').trim().length > 0;

      if (!blueprintExists) {
        if (!prefill.purpose || !prefill.platform || !prefill.provider) {
          await runSeedToInterview(projectName, projectDir, prefill, priorHistory);
          return;
        }
        const s = loadSession();
        updateSession({ ...s, phase: 'interview' });
        await runAIInterview(
          { purpose: prefill.purpose, platform: prefill.platform },
          prefill.provider,
          projectDir,
          priorHistory
        );
        const after = loadSession();
        updateSession({ ...after, phase: 'repo' });
        await runRepoSetup(projectDir);
        return;
      }

      // Interview is done, .groundup/BLUEPRINT.md exists — jump straight to approval.
      const result = await reviewBlueprint(projectDir, priorHistory);
      if (result === 'approved') {
        line();
        sep();
        console.log(amber('■ ') + white('interview complete — blueprint approved'));
        sep();
        line();
        const s = loadSession();
        updateSession({ ...s, phase: 'repo' });
        await runRepoSetup(projectDir);
        return;
      }
      // 'restart' — wipe .groundup/BLUEPRINT.md, fall back through a fresh interview.
      try {
        fs.writeFileSync(blueprintPath, '');
      } catch {}
      const s = loadSession();
      updateSession({ ...s, phase: 'interview', interview: { ...(s.interview || {}), answers: [] } });
      await runAIInterview(
        { purpose: prefill.purpose, platform: prefill.platform },
        prefill.provider,
        projectDir,
        []
      );
      const after = loadSession();
      updateSession({ ...after, phase: 'repo' });
      await runRepoSetup(projectDir);
      return;
    }

    case 'repo':
      await runRepoSetup(session.project.dir);
      return;

    case 'build':
      console.log(muted('  Build phase coming soon.'));
      return;

    // DEPRECATED v0.2.0 phases — sessions created before the AI engine:
    case 'agent':
    case 'stack':
      console.log(amber('■ ') + white('This session was created with the pre-v0.2.0 flow.'));
      console.log(muted('  The legacy interview/agent/stack phases have been replaced by the AI engine.'));
      console.log(muted('  Start a fresh session with ') + white('groundup dig ' + projectName) + muted(' to continue.'));
      line();
      return;

    default:
      console.log(muted(`  Unknown phase: ${session.phase}`));
      return;
  }
}
