/**
 * Creates a git commit via commit-tree so Cursor cannot inject
 * `Co-authored-by: Cursor <cursoragent@cursor.com>` into the message.
 *
 * Usage: node scripts/make-commit.mjs "Subject line." "Optional body."
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const subject = process.argv[2];
const body = process.argv[3] ?? '';
if (!subject) {
  console.error('Usage: node scripts/make-commit.mjs "subject" ["body"]');
  process.exit(1);
}

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...opts }).trim();
}

git(['add', '-A']);
// Unstage secrets / junk if present
try {
  git(['reset', 'HEAD', '--', '.env', 'scripts/clean-commit.bat']);
} catch {
  /* ignore */
}

const status = git(['status', '--porcelain']);
if (!status) {
  console.log('Nothing to commit.');
  process.exit(0);
}

const tree = git(['write-tree']);
let parent;
try {
  parent = git(['rev-parse', 'HEAD']);
} catch {
  parent = null;
}

const message = body ? `${subject}\n\n${body}\n` : `${subject}\n`;
const msgFile = path.join('.git', 'COMMIT_EDITMSG_CLEAN');
fs.writeFileSync(msgFile, message, 'utf8');

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'Siddxwar04',
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'siddeshwarj004@gmail.com',
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'Siddxwar04',
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'siddeshwarj004@gmail.com',
};

const commitArgs = parent
  ? ['commit-tree', tree, '-p', parent, '-F', msgFile]
  : ['commit-tree', tree, '-F', msgFile];
const newCommit = execFileSync('git', commitArgs, { encoding: 'utf8', env }).trim();
fs.unlinkSync(msgFile);

git(['reset', '--soft', newCommit]);

const finalMsg = git(['log', '-1', '--format=%B']);
if (/Co-authored-by:/i.test(finalMsg) || /cursoragent/i.test(finalMsg)) {
  console.error('ERROR: Cursor trailer still present in commit message.');
  process.exit(1);
}

console.log(git(['log', '-1', '--oneline']));
console.log('Commit message OK (no Cursor co-author).');
