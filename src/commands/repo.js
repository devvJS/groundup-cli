import { spawnSync } from 'child_process';
import { updateSession, saveInterviewProgress, loadSession } from '../session/state.js';
import { sep, line, header, confirm, amber, white, muted, warning } from '../ui/splash.js';
import { askSelect, askText } from '../ui/input.js';

// --- reason codes ------------------------------------------------------------
// Every repo-setup failure returns one of these so callers can halt with a
// specific message. Add new codes here when new failure modes surface.

export const REPO_REASONS = {
  'gh-repo-exists':       'gh-repo-exists',
  'gh-not-authenticated': 'gh-not-authenticated',
  'gh-permission-denied': 'gh-permission-denied',
  'gh-create-failed':     'gh-create-failed',
  'gitlab-create-failed': 'gitlab-create-failed',
  'bitbucket-create-failed': 'bitbucket-create-failed',
  'git-init-failed':      'git-init-failed',
  'git-remote-failed':    'git-remote-failed',
  'network-error':        'network-error',
  'unknown':              'unknown',
};

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

// Truncate stderr to a short excerpt for hint strings.
function excerpt(str, max = 80) {
  if (!str) return '';
  const clean = str.replace(/\n/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

// Classify a gh CLI failure into a reason code by parsing stderr.
function classifyGhError(stderr, name) {
  const msg = (stderr || '').toLowerCase();
  if (/name already exists/i.test(stderr) || /already exists on this account/i.test(stderr)) {
    return {
      reason: REPO_REASONS['gh-repo-exists'],
      hint: `a repo named ${name} already exists on your GitHub account. rename the project or delete the existing repo and run \`groundup continue\`.`,
    };
  }
  if (/not logged in/i.test(stderr) || /authentication/i.test(stderr) || /gh auth login/i.test(stderr)) {
    return {
      reason: REPO_REASONS['gh-not-authenticated'],
      hint: 'gh isn\'t authenticated. run `gh auth login`, then `groundup continue`.',
    };
  }
  if (/permission/i.test(stderr) || /forbidden/i.test(stderr) || /403/i.test(stderr)) {
    return {
      reason: REPO_REASONS['gh-permission-denied'],
      hint: 'gh is authenticated but GitHub refused the repo creation — likely a scope or org permission issue. check your account settings and run `groundup continue`.',
    };
  }
  if (/could not resolve host/i.test(stderr) || /network/i.test(stderr) || /connection refused/i.test(stderr) || /dns/i.test(stderr)) {
    return {
      reason: REPO_REASONS['network-error'],
      hint: 'couldn\'t reach GitHub — looks like a network or DNS issue. confirm you\'re online and run `groundup continue`.',
    };
  }
  return {
    reason: REPO_REASONS['gh-create-failed'],
    hint: `gh repo create failed. ${excerpt(stderr)}. resolve the error above and run \`groundup continue\`.`,
  };
}

// Classify a generic git/remote failure.
function classifyGitError(stderr) {
  const msg = (stderr || '').toLowerCase();
  if (/could not resolve host/i.test(msg) || /network/i.test(msg) || /connection refused/i.test(msg)) {
    return {
      reason: REPO_REASONS['network-error'],
      hint: 'couldn\'t reach the remote host — looks like a network or DNS issue. confirm you\'re online and run `groundup continue`.',
    };
  }
  return null;
}

function repoFailed(projectDir, host, reason, hint) {
  const session = loadSession(projectDir) ?? {};
  updateSession({
    ...session,
    phase: 'repo',
    repo: { host, status: 'failed', reason, hint },
  });
  return { ok: false, reason, hint };
}

// --- universal git setup -----------------------------------------------------

function ensureGitRepo(projectDir) {
  // 1. init if needed — -q suppresses the default-branch-name hint block
  // that git prints to stderr on first init. Output is captured via run()
  // so nothing leaks into the narrated repo flow.
  if (!runQuiet('git', ['rev-parse', '--git-dir'], projectDir)) {
    run('git', ['init', '-q'], projectDir);
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

  // 5. create main branch from the scaffold commit so both branches share it
  const mainExists = run('git', ['branch', '--list', 'main'], projectDir);
  if (!mainExists) {
    run('git', ['branch', 'main'], projectDir);
  }

  // 6. stay on develop — build work happens here
  run('git', ['checkout', 'develop'], projectDir);

  // 7. drop any pre-existing origin
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

  // Capture stderr so the caller can classify gh failures by message content.
  // stdout is still inherited so the user sees progress output.
  const res = spawnSync('gh', args, {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['inherit', 'inherit', 'pipe'],
  });
  if (res.status !== 0) {
    const err = new Error((res.stderr || '').trim() || `gh ${args.join(' ')} failed`);
    err.stderr = (res.stderr || '').trim();
    err.code = res.status;
    throw err;
  }

  // Push main branch and set it as the GitHub default
  try {
    run('git', ['push', '-u', 'origin', 'main'], projectDir);
    run('gh', ['repo', 'edit', '--default-branch', 'main'], projectDir);
  } catch {
    // non-fatal — user can set default branch manually
  }
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
  try { run('git', ['push', '-u', 'origin', 'main'], projectDir); } catch {}
  return remote;
}

// --- manual remote setup -----------------------------------------------------

async function promptAndPush(projectDir, promptMessage, placeholder) {
  const remoteUrl = await askText(promptMessage, placeholder, true);
  run('git', ['remote', 'add', 'origin', remoteUrl], projectDir);
  runInherit('git', ['push', '-u', 'origin', 'develop'], projectDir);
  try { run('git', ['push', '-u', 'origin', 'main'], projectDir); } catch {}
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
    printGitError(err);
    return repoFailed(projectDir, 'unknown', REPO_REASONS['git-init-failed'],
      `git init failed in ${projectDir}. check that the directory is writable and not already a git repo, then run \`groundup continue\`.`);
  }

  // Capture scaffold commit SHA so the build phase can offer a squash-to-one option
  try {
    const scaffoldSha = run('git', ['rev-parse', 'HEAD'], projectDir);
    const current = loadSession(projectDir) ?? {};
    updateSession({
      ...current,
      build: { ...(current.build || {}), scaffoldSha },
    });
  } catch {
    // non-fatal — squash option will be unavailable
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
    return { ok: true };
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
    printGitError(err);

    let classified;
    if (host === 'github') {
      classified = classifyGhError(err.stderr || err.message, name);
    } else if (host === 'gitlab') {
      classified = {
        reason: REPO_REASONS['gitlab-create-failed'],
        hint: `GitLab repo create failed. ${excerpt(err.message)}. resolve the error above and run \`groundup continue\`.`,
      };
    } else if (host === 'bitbucket' || host === 'self') {
      // Manual push path — check for network errors first
      const netErr = classifyGitError(err.message);
      classified = netErr || {
        reason: REPO_REASONS['git-remote-failed'],
        hint: `couldn't push the initial commit to origin. check that the remote URL is correct and you have push access, then run \`groundup continue\`.`,
      };
    } else {
      classified = {
        reason: REPO_REASONS['unknown'],
        hint: `repo setup hit an unexpected error — ${excerpt(err.message)}. resolve the issue above and run \`groundup continue\`.`,
      };
    }

    return repoFailed(projectDir, host, classified.reason, classified.hint);
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

  return { ok: true };
}
