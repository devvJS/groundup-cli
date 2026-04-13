import { execSync } from 'child_process';
import { updateSession } from '../session/state.js';
import { sep, line, header, confirm, flag, amber, white, muted, success, warning } from '../ui/splash.js';
import { askSelect, askText } from '../ui/input.js';

function ghAvailable() {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ghAuthed() {
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function createGithubRepo(name, isPrivate, description, projectDir) {
  const visibility = isPrivate ? '--private' : '--public';
  const desc = description ? '--description "' + description + '"' : '';

  // get github username
  const username = execSync('gh api user --jq .login', { encoding: 'utf-8' }).trim();
  console.log('DEBUG projectDir:', projectDir);
  const remote = 'git@github.com:' + username + '/' + name + '.git';

  // init git if not already
  try {
    execSync('git -C ' + projectDir + ' rev-parse --git-dir', { stdio: 'ignore' });
  } catch {
    execSync('git init ' + projectDir, { stdio: 'inherit' });
  }

  // initial commit if nothing committed yet
  try {
    execSync('git -C ' + projectDir + ' log', { stdio: 'ignore' });
  } catch {
    execSync('git -C ' + projectDir + ' add .', { stdio: 'inherit' });
    execSync('git -C ' + projectDir + ' commit -m "initial commit — groundup"', { stdio: 'inherit' });
  }

  // ensure we are on develop branch
  try {
    execSync('git -C ' + projectDir + ' checkout develop', { stdio: 'ignore' });
  } catch {
    execSync('git -C ' + projectDir + ' checkout -b develop', { stdio: 'inherit' });
  }

  // create repo on github
  execSync('gh repo create ' + name + ' ' + visibility + ' ' + desc, { stdio: 'inherit', cwd: projectDir });

  // set remote
  try {
    execSync('git -C ' + projectDir + ' remote add origin ' + remote, { stdio: 'inherit' });
  } catch {
    execSync('git -C ' + projectDir + ' remote set-url origin ' + remote, { stdio: 'inherit' });
  }

  // push
  execSync('git -C ' + projectDir + ' push -u origin develop', { stdio: 'inherit' });
}

export async function runRepoSetup(session) {
  header(session.project.name, 'repo');

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
    updateSession({ repo: { host: 'skip' }, phase: 'build' });
    line();
    console.log(muted('  Skipping repo setup. You can set it up manually later.'));
    line();
    sep();
    line();
    return;
  }

  sep();
  line();
  confirm(`Host: ${host}`);
  line();

  if (host === 'github') {
    const hasGh = ghAvailable();
    const hasAuth = hasGh && ghAuthed();

    if (!hasGh) {
      line();
      console.log(warning('  ■ ') + white('gh CLI not found.'));
      console.log(muted('  Install it: ') + white('https://cli.github.com'));
      console.log(muted('  Then run ') + white('groundup continue') + muted(' to finish repo setup.'));
      line();
      sep();
      line();
      updateSession({ repo: { host: 'github', status: 'gh-missing' } });
      process.exit(0);
    }

    if (!hasAuth) {
      line();
      console.log(warning('  ■ ') + white('gh CLI found but not authenticated.'));
      console.log(muted('  Run ') + white('gh auth login') + muted(' then ') + white('groundup continue') + muted('.'));
      line();
      sep();
      line();
      updateSession({ repo: { host: 'github', status: 'gh-unauthed' } });
      process.exit(0);
    }
    const autoCreate = await askSelect(
      'Should groundup create the repository for you?',
      [
        { value: 'yes', label: 'Yes — create it via gh CLI', hint: 'stays in terminal' },
        { value: 'no', label: 'No — I\'ll create it manually' },
      ],
      'yes'
    );

    sep();
    line();

    if (autoCreate === 'no') {
      const remoteUrl = await askText(
        'Paste your remote URL:',
        'e.g. git@github.com:you/my-project.git',
        true
      );

      try {
        execSync('git remote add origin ' + remoteUrl, { stdio: 'ignore' });
        confirm('Remote set: ' + remoteUrl);
      } catch {
        execSync('git remote set-url origin ' + remoteUrl, { stdio: 'ignore' });
        confirm('Remote updated: ' + remoteUrl);
      }

      updateSession({ repo: { host: 'github', remote: remoteUrl }, phase: 'build' });
      line();
      sep();
      line();
      return;
    }

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
      'e.g. ' + (session.interview?.purpose ?? ''),
      false
    );

    sep();
    line();

    console.log(muted('  Creating repository...'));
    line();

    try {
      createGithubRepo(session.project.name, visibility === 'private', description, session.project.dir);
      confirm('Repository created — github.com/you/' + session.project.name);
      confirm('Remote origin set');
      confirm('Initial commit pushed');
      updateSession({ repo: { host: 'github', visibility, status: 'created' }, phase: 'build' });
    } catch (err) {
      line();
      console.log(warning('  ■ ') + white('Repository creation failed.'));
      console.log(muted('  ' + err.message));
      console.log(muted('  Create it manually on GitHub then run ') + white('groundup continue') + muted('.'));
      updateSession({ repo: { host: 'github', status: 'failed' } });
      process.exit(1);
    }

  } else {
    const remoteUrl = await askText(
      'Paste your remote URL:',
      'e.g. git@gitlab.com:you/my-project.git',
      true
    );

    sep();
    line();

    try {
      execSync('git remote add origin ' + remoteUrl, { stdio: 'ignore' });
      confirm('Remote set: ' + remoteUrl);
    } catch {
      execSync('git remote set-url origin ' + remoteUrl, { stdio: 'ignore' });
      confirm('Remote updated: ' + remoteUrl);
    }

    updateSession({ repo: { host, remote: remoteUrl }, phase: 'build' });
  }

  line();
  sep();
  line();
}
