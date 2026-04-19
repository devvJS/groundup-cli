import fs from 'fs';
import path from 'path';
import { showSplash, line, amber, white, muted, sep, success } from '../ui/splash.js';
import { sessionExists, loadSession, updateSession } from '../session/state.js';
import { askSelect } from '../ui/input.js';
import { runRepoSetup } from './repo.js';
import { generateWorkflow } from './workflow.js';
import { runBuild } from './build.js';
import { runSeedToInterview } from './dig.js';
import { runDeploy } from './deploy.js';
import { renderRepoFailure } from '../ui/repo-failure.js';
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
        const bpRepoResult = await runRepoSetup(projectDir);
        if (!bpRepoResult?.ok) renderRepoFailure(bpRepoResult);
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
        const approveRepoResult = await runRepoSetup(projectDir);
        if (!approveRepoResult?.ok) renderRepoFailure(approveRepoResult);
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
      const restartRepoResult = await runRepoSetup(projectDir);
      if (!restartRepoResult?.ok) renderRepoFailure(restartRepoResult);
      return;
    }

    case 'repo': {
      const repoResult = await runRepoSetup(projectDir);
      if (!repoResult?.ok) {
        renderRepoFailure(repoResult);
        return;
      }
      // Chain into workflow → build → deploy after repo
      line();
      console.log(muted('── starting workflow generation ──'));
      line();
      const repoWfResult = await generateWorkflow({ projectRoot: projectDir });
      if (!repoWfResult.approved) {
        line();
        console.log(muted('  Run ') + amber('groundup continue') + muted(' to try again.'));
        line();
        return;
      }
      updateSession({ ...loadSession(), phase: 'build' });
      const repoBuildResult = await runBuild({ projectRoot: projectDir });
      if (repoBuildResult?.completed) {
        const repoDeployResult = await runDeploy({ projectRoot: projectDir });
        await renderPostPipelineFromContinue(projectDir, repoDeployResult);
      }
      return;
    }

    case 'build': {
      const buildStatus = session.build?.status;
      if (buildStatus === 'complete') {
        // Build done — chain into deploy
        const deployResult = await runDeploy({ projectRoot: projectDir });
        await renderPostPipelineFromContinue(projectDir, deployResult);
        return;
      }
      // in-progress or aborted — resume at saved phase index
      if (buildStatus === 'in-progress' || buildStatus === 'aborted') {
        console.log(muted(`  Resuming build at phase ${(session.build.currentPhaseIndex || 0) + 1}...`));
        line();
        const buildResult = await runBuild({ projectRoot: projectDir });
        if (buildResult?.completed) {
          const deployResult = await runDeploy({ projectRoot: projectDir });
          await renderPostPipelineFromContinue(projectDir, deployResult);
        }
        return;
      }
      // idle — need workflow first
      line();
      console.log(muted('── starting workflow generation ──'));
      line();
      const wfResult = await generateWorkflow({ projectRoot: projectDir });
      if (!wfResult.approved) {
        line();
        console.log(muted('  Run ') + amber('groundup continue') + muted(' to try again.'));
        line();
        return;
      }
      const buildResult = await runBuild({ projectRoot: projectDir });
      if (buildResult?.completed) {
        const deployResult = await runDeploy({ projectRoot: projectDir });
        await renderPostPipelineFromContinue(projectDir, deployResult);
      }
      return;
    }

    case 'deploy': {
      const deployStatus = session.deploy?.status;
      if (deployStatus === 'complete') {
        console.log(amber('■ ') + white('Deploy already complete for this project.'));
        if (session.deploy?.url) console.log(muted(`  ${session.deploy.url}`));
        line();
        return;
      }
      // pending, in-progress, fallthrough, skipped — re-attempt
      const deployResult = await runDeploy({ projectRoot: projectDir });
      await renderPostPipelineFromContinue(projectDir, deployResult);
      return;
    }

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

// Post-pipeline rendering for continue.js — mirrors renderPostPipeline in
// dig.js. Handles teardown, unified checklist, and done screen. Duplicated
// rather than shared to avoid a circular import (continue.js ↔ dig.js).
async function renderPostPipelineFromContinue(projectDir, deployResult) {
  console.log(white('Remove .groundup/ project files?'));

  const teardownChoice = await askSelect(
    '',
    [
      { value: 'yes', label: 'Yes — clean up' },
      { value: 'no', label: 'No — keep them' },
    ],
    'no'
  );

  const blueprintPath = path.join(projectDir, '.groundup', 'BLUEPRINT.md');
  let checklist = [];
  if (fs.existsSync(blueprintPath)) {
    const blueprint = fs.readFileSync(blueprintPath, 'utf-8');
    checklist = extractManualSteps(blueprint);
  }

  line();

  const groundupDir = path.join(projectDir, '.groundup');
  if (teardownChoice === 'yes') {
    fs.rmSync(groundupDir, { recursive: true, force: true });
    console.log(muted('── .groundup/ removed ──'));
  } else {
    console.log(muted('── .groundup/ kept at .groundup/ ──'));
  }

  line();

  if (deployResult?.fallthrough) {
    checklist.push({
      text: deployResult.fallthrough.text,
      hint: deployResult.fallthrough.hint,
      done: false,
    });
  }

  if (checklist.length > 0) {
    sep();
    console.log(amber('■ ') + white('before you ship'));
    sep();
    line();
    for (const item of checklist) {
      const marker = item.done ? success('  ■') : amber('  □');
      console.log(marker + ' ' + white(item.text));
      if (item.hint) console.log(muted(`      ${item.hint}`));
    }
    line();
  }

  const cols = process.stdout.columns || 80;
  const tagline = 'happy building. ⚒️';
  const pad = Math.max(0, Math.floor((cols - tagline.length) / 2));

  console.log(amber('━'.repeat(cols)));
  console.log(' '.repeat(pad) + amber(tagline));
  console.log(amber('━'.repeat(cols)));
  line();
  console.log(muted(`  your project is at ${projectDir}`));
  console.log(muted('  your code is on origin/develop — merge to main when ready to ship'));
  if (deployResult?.deployed && deployResult.url) {
    console.log(muted('  live at ') + amber(deployResult.url));
  }
  console.log(muted('═'.repeat(cols)));
  line();
}

function extractManualSteps(blueprint) {
  const lines = blueprint.split('\n');
  const items = [];
  let capturing = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^#{1,3}\s+/i.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,3}\s+/, '').toLowerCase();
      if (/manual\s*steps|post[- ]?build|checklist/.test(heading)) {
        capturing = true;
        continue;
      }
      if (capturing) break;
    }
    if (!capturing) continue;
    const checkMatch = trimmed.match(/^- \[([ xX])\]\s+(.*)/);
    if (checkMatch) {
      items.push({ text: checkMatch[2].trim(), done: checkMatch[1].toLowerCase() === 'x' });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      items.push({ text: trimmed.replace(/^[-*]\s+/, ''), done: false });
    }
  }
  return items;
}
