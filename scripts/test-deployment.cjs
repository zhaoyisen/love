const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const shell = process.env.DEPLOY_TEST_SHELL || (process.platform === 'win32'
  ? 'D:/Scoop/apps/git/current/bin/bash.exe' : '/bin/sh');
const posix = value => value.replaceAll('\\', '/');

function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'love deploy-'));
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(dir, '.env'), "MYSQL_PASSWORD='secret-$-#-with space'\nVIDEO_MAX_DURATION_SECONDS=91\n");
    fs.writeFileSync(path.join(dir, 'compose.yml'), 'operator-owned-compose\n');
    fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >> "$DOCKER_TEST_LOG"
case "$*" in
  *'config --quiet'*) [ "\${FAIL_STEP:-}" != config ] || { echo 'unterminated quoted value secret-PASSWORD' >&2; exit 41; } ;;
  *'up -d'*) [ "\${FAIL_STEP:-}" != health ] || { echo 'configuration error secret-PASSWORD' >&2; exit 42; } ;;
esac
`, { mode: 0o755 });
    const execute = (extra = {}) => spawnSync(shell, [posix(path.join(root, 'scripts/deploy-production.sh'))], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        DEPLOY_DIR: posix(dir), IMAGE_TAG: '0123456789ab', DOCKER_TEST_LOG: posix(path.join(dir, 'calls')), ...extra }
    });
    const calls = () => fs.existsSync(path.join(dir, 'calls')) ? fs.readFileSync(path.join(dir, 'calls'), 'utf8') : '';
    run({ dir, execute, calls });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('release uses server config without changing it and tags production after health', () => fixture(({ dir, execute, calls }) => {
  const env = fs.readFileSync(path.join(dir, '.env'));
  const compose = fs.readFileSync(path.join(dir, 'compose.yml'));
  const result = execute();
  assert.equal(result.status, 0, result.stderr);
  const log = calls();
  assert.match(log, /--project-name love-notes/);
  assert.ok(log.includes(`--file ${posix(dir)}/compose.yml`));
  assert.ok(log.includes(`--env-file ${posix(dir)}/.env`));
  assert.match(log, /config --quiet/);
  assert.match(log, /up -d --no-deps --wait --wait-timeout 300 api/);
  assert.ok(log.indexOf('image tag love-notes-server:0123456789ab love-notes-server:production') > log.indexOf('up -d'));
  assert.deepEqual(fs.readFileSync(path.join(dir, '.env')), env);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'compose.yml')), compose);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('secret-'));
}));

for (const missing of ['.env', 'compose.yml']) {
  test(`missing ${missing} stops before Docker without generating config`, () => fixture(({ dir, execute, calls }) => {
    fs.unlinkSync(path.join(dir, missing));
    const result = execute();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing or unreadable/i);
    assert.equal(calls(), '');
    assert.ok(!fs.existsSync(path.join(dir, missing)));
  }));
}

for (const step of ['config', 'health']) {
  test(`failed ${step} keeps the last successful image alias`, () => fixture(({ execute, calls }) => {
    const result = execute({ FAIL_STEP: step });
    assert.equal(result.status, step === 'config' ? 41 : 42, result.stderr);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('secret-PASSWORD'), 'Compose diagnostics must not leak into Jenkins output');
    assert.ok(!calls().includes('image tag'));
    if (step === 'config') assert.ok(!calls().includes('up -d'));
  }));
}

test('invalid image tag stops before Docker', () => fixture(({ execute, calls }) => {
  const result = execute({ IMAGE_TAG: 'bad;tag' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid image tag/i);
  assert.equal(calls(), '');
}));

test('legacy IMAGE_TAG setting must be migrated before deployment', () => fixture(({ dir, execute, calls }) => {
  fs.appendFileSync(path.join(dir, '.env'), 'IMAGE_TAG=local\n');
  const result = execute();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Remove IMAGE_TAG/);
  assert.equal(calls(), '');
}));

test('Compose forwards all env-file values and has no build context tied to checkout', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /env_file:\s*\n\s*-\s*\$\{APP_ENV_FILE:-\.\/\.env\}/);
  assert.doesNotMatch(compose, /^\s+(?:environment|build):/m);
  assert.match(compose, /image: love-notes-server:\$\{IMAGE_TAG:-production\}/);
});

test('the env example documents every application and worker variable', () => {
  const sample = fs.readFileSync(path.join(root, 'server/.env.example'), 'utf8');
  const keys = new Set([...sample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]));
  const files = ['server/src/main/resources/application.yml', 'server/src/main/resources/application-prod.yml'];
  const javaRoot = path.join(root, 'server/src/main/java');
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const sources = [...files.map(file => path.join(root, file)), ...walk(javaRoot).filter(file => file.endsWith('.java'))];
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [, key] of text.matchAll(/\$\{([A-Z][A-Z0-9_]*)[}:]/g)) {
      assert.ok(keys.has(key), `${path.relative(root, file)}: ${key} missing from env example`);
    }
  }
});
