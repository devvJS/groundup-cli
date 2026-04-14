import { spawnSync } from 'child_process';
import { updateSession, saveInterviewProgress, loadSession } from '../session/state.js';
import { sep, line, header, confirm, amber, white, muted, warning } from '../ui/splash.js';
import { askSelect, askText } from '../ui/input.js';

// --- command runners ---------------------------------------------------------

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  if (res.status !== 0) {
    const message = (res.stderr || res.stdout || '').trim() || `${cmd} ${args.join(' ')} failed`;
    const err = new Error(message);
    err.code = res.status;
    throw err;
  }
  return (res.stdout || '').trim();
}

function runQuiet(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'ignore' });
  return res.status === 0;
}

function runInherit(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) {
    const err = new Error(`${cmd} ${args.join(' ')} exited with code ${res.status}`);
    err.code = res.status;
    throw err;
  }
}

function commandExists(cmd) {
  const r = spawnSync('which', [cmd], { stdio: 'ignore' });
  return r.status === 0;
}

// --- error surface -----------------------------------------------------------

function printGitError(err) {
  const msg = (err && err.message) ? err.message : String(err);
  for (const ln of msg.split('\n')) {
    if (ln.trim()) console.log(warning('  ' + ln));
  }
}

function repoFailed(projectDir, host, err) {
  line();
  console.log(amber('■') + white(' repo setup failed. you can set this up manually and run groundup continue.'));
  if (err) printGitError(err);
  line();
  sep();
  line();
  updateSession({ repo: { host, status: 'failed' } });
}

// --- universal git setup -----------------------------------------------------

function ensureGitRepo(projectDir) {
  // 1. init if needed — use inherit so we can see the init output
  if (!runQuiet('git', ['rev-parse', '--git-dir'], projectDir)) {
    const initRes = spawnSync('git', ['init'], { cwd: projectDir, stdio: 'inherit' });
    if (initRes.status !== 0) {
      throw new Error(`git init failed in ${projectDir} (exit ${initRes.status})`);
    }
  }

  // 2. develop branch
  const branches = run('git', ['branch', '--list', 'develop'], projectDir);
  if (!branches) {
    run('git', ['checkout', '-b', 'develop'], projectDir);
  } else {
    run('git', ['checkout', 'develop'], projectDir);
  }

  // 3. stage everything
  run('git', ['add', '.'], projectDir);

  // 4. initial commit if there are none
  if (!runQuiet('git', ['rev-parse', 'HEAD'], projectDir)) {
    run('git', ['commit', '-m', 'initial commit — groundup scaffold'], projectDir);
  }

  // 5. drop any pre-existing origin
  if (runQuiet('git', ['remote', 'get-url', 'origin'], projectDir)) {
    run('git', ['remote', 'remove', 'origin'], projectDir);
  }
}

// --- host creators -----------------------------------------------------------

function createGithubRepo(projectDir, name, isPrivate, description) {
  const args = [
    'repo', 'create', name,
    isPrivate ? '--private' : '--public',
    '--source', projectDir,
    '--remote', 'origin',
    '--push',
  ];
  if (description) args.push('--description', description);
  runInherit('gh', args, projectDir);
}

function createGitlabRepo(projectDir, name, isPrivate, description) {
  const args = ['repo', 'create', name, isPrivate ? '--private' : '--public'];
  if (description) args.push('--description', description);
  runInherit('glab', args, projectDir);

  // resolve username for the remote URL
  let username = '';
  try {
    const userJson = run('glab', ['api', 'user'], projectDir);
    username = JSON.parse(userJson).username || '';
  } catch {
    username = '';
  }
  if (!username) {
    throw new Error('could not determine GitLab username from glab api user');
  }

  const remote = `git@gitlab.com:${username}/${name}.git`;
  run('git', ['remote', 'add', 'origin', remote], projectDir);
  runInherit('git', ['push', '-u', 'origin', 'develop'], projectDir);
  return remote;
}

// --- manual remote setup -----------------------------------------------------

async function promptAndPush(projectDir, promptMessage, placeholder) {
  const remoteUrl = await askText(promptMessage, placeholder, true);
  run('git', ['remote', 'add', 'origin', remoteUrl], projectDir);
  runInherit('git', ['push', '-u', 'origin', 'develop'], projectDir);
  return remoteUrl;
}

async function manualFallback(projectDir, host) {
  line();
  console.log(amber('■') + ' ' + white('manual setup for ' + host));
  console.log(muted('  Create the repository on your chosen platform, then paste the remote URL below.'));
  line();
  return promptAndPush(
    projectDir,
    'Paste your remote URL:',
    'e.g. git@host.com:you/my-project.git'
  );
}

// --- main flow ---------------------------------------------------------------

export async function runRepoSetup(projectDir) {
  if (!projectDir) projectDir = process.cwd();
  const session = loadSession(projectDir) ?? {};
  const name = session.project?.name ?? 'project';
  const purpose = session.interview?.purpose ?? '';

  header(name, 'repo');

  // UNIVERSAL GIT SETUP — must run before ANY prompts or host selection so
  // the directory is a valid git repo by the time any downstream tool (gh,
  // glab, manual push) touches it.
  try {
    ensureGitRepo(projectDir);
  } catch (err) {
    repoFailed(projectDir, 'unknown', err);
    return;
  }

  console.log(white('Before we break ground — where does this repository live?'));
  line();

  const host = await askSelect(
    'Git hosting:',
    [
      { value: 'github', label: 'GitHub', hint: 'recommended' },
      { value: 'gitlab', label: 'GitLab' },
      { value: 'bitbucket', label: 'Bitbucket' },
      { value: 'self', label: 'Self-hosted' },
      { value: 'skip', label: 'Skip — I\'ll set this up myself' },
    ],
    'github'
  );

  if (host === 'skip') {
    line();
    console.log(muted('Skipping repo setup. Run git remote add origin [url] when ready.'));
    line();
    sep();
    line();
    updateSession({ repo: { host: 'skip' } });
    return;
  }

  sep();
  line();
  confirm(`Host: ${host}`);
  line();

  let remoteUrl = null;

  try {
    if (host === 'github') {
      if (!commandExists('gh')) {
        console.log(amber('■') + ' ' + white('gh CLI not found.'));
        console.log(muted('  Install it at https://cli.github.com or set up the repo manually.'));
        remoteUrl = await manualFallback(projectDir, 'github');
      } else {
        const visibility = await askSelect(
          'Public or private?',
          [
            { value: 'private', label: 'Private', hint: 'recommended' },
            { value: 'public', label: 'Public', hint: 'open source' },
          ],
          'private'
        );
        sep();
        line();

        const description = await askText(
          'Repository description: (or press enter to skip)',
          'e.g. ' + purpose,
          false
        );
        sep();
        line();

        console.log(muted('  Creating repository...'));
        line();
        createGithubRepo(projectDir, name, visibility === 'private', description);
      }
    } else if (host === 'gitlab') {
      if (!commandExists('glab')) {
        console.log(amber('■') + ' ' + white('glab CLI not found.'));
        console.log(muted('Install it at https://gitlab.com/gitlab-org/cli or set up the repo manually.'));
        remoteUrl = await manualFallback(projectDir, 'gitlab');
      } else {
        const visibility = await askSelect(
          'Public or private?',
          [
            { value: 'private', label: 'Private', hint: 'recommended' },
            { value: 'public', label: 'Public', hint: 'open source' },
          ],
          'private'
        );
        sep();
        line();

        const description = await askText(
          'Repository description: (or press enter to skip)',
          'e.g. ' + purpose,
          false
        );
        sep();
        line();

        console.log(muted('  Creating repository...'));
        line();
        remoteUrl = createGitlabRepo(projectDir, name, visibility === 'private', description);
      }
    } else if (host === 'bitbucket') {
      console.log(amber('■') + ' ' + white('Create your Bitbucket repo at https://bitbucket.org/repo/create'));
      line();
      remoteUrl = await promptAndPush(
        projectDir,
        'Paste your Bitbucket repo URL:',
        'e.g. git@bitbucket.org:you/my-project.git'
      );
    } else if (host === 'self') {
      remoteUrl = await promptAndPush(
        projectDir,
        'What is the remote URL for your repository?',
        'git@your-server.com:username/repo.git'
      );
    }
  } catch (err) {
    repoFailed(projectDir, host, err);
    return;
  }

  line();
  confirm('Repository ready on ' + host);
  if (remoteUrl) confirm('Remote: ' + remoteUrl);
  line();
  sep();
  line();

  try {
    saveInterviewProgress(projectDir, { phase: 'repo' });
  } catch {}
}
