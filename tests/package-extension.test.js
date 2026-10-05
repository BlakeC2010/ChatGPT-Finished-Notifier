'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const script = path.resolve(__dirname, '../scripts/package-extension.js');
const runtimeFiles = [
  'manifest.json', 'providers.js', 'content-core.js', 'content.js',
  'stream-bridge.js', 'overlay.js', 'background-core.js', 'background.js',
  'welcome.html', 'welcome.css', 'welcome.js',
  'popup.html', 'popup.css', 'popup.js',
];

function fixture(t, version = '1.4.1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-notifier-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const filename of runtimeFiles) {
    const content = filename === 'manifest.json'
      ? JSON.stringify({ manifest_version: 3, name: 'AI Chat Notifications', version })
      : 'UTF-8 fixture: \u03c0\n' + filename + '\n';
    fs.writeFileSync(path.join(root, filename), content);
  }
  fs.writeFileSync(path.join(root, 'README.md'), 'Development documentation must stay out of the ZIP.');
  return root;
}

function runPackager(root, env = {}) {
  return spawnSync(process.execPath, [script, root], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: '', ...env },
  });
}

function extractArchive(archive, destination) {
  if (process.platform === 'win32') {
    return spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:AI_NOTIFIER_TEST_ARCHIVE, $env:AI_NOTIFIER_TEST_DESTINATION)",
    ], {
      encoding: 'utf8',
      env: { ...process.env, AI_NOTIFIER_TEST_ARCHIVE: archive, AI_NOTIFIER_TEST_DESTINATION: destination },
    });
  }
  return spawnSync('unzip', ['-q', archive, '-d', destination], { encoding: 'utf8' });
}

test('Node alone packages a ZIP that a separate ZIP reader can extract byte for byte', (t) => {
  const root = fixture(t);
  const output = path.join(root, 'github-output.txt');
  const result = runPackager(root, { GITHUB_OUTPUT: output });
  assert.equal(result.status, 0, 'Node packaging must succeed: ' + result.stderr);

  const archive = path.join(root, 'dist', 'AI-Chat-Notifications-v1.4.1.zip');
  assert.ok(fs.existsSync(archive), 'The versioned ZIP must be produced');
  const extracted = path.join(root, 'extracted');
  const extraction = extractArchive(archive, extracted);
  assert.equal(extraction.status, 0, 'The operating system must accept the ZIP: ' + extraction.stderr);
  assert.deepEqual(fs.readdirSync(extracted).sort(), [...runtimeFiles].sort());
  for (const filename of runtimeFiles) {
    assert.deepEqual(fs.readFileSync(path.join(extracted, filename)), fs.readFileSync(path.join(root, filename)), filename);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(extracted, 'manifest.json'), 'utf8')).version, '1.4.1');
  assert.equal(fs.readFileSync(output, 'utf8'), 'archive=dist/AI-Chat-Notifications-v1.4.1.zip\n');
});

test('a missing runtime file fails packaging before publishing a partial archive', (t) => {
  const root = fixture(t);
  fs.unlinkSync(path.join(root, 'providers.js'));
  const result = runPackager(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /providers\.js/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
});

test('an invalid version cannot write an archive outside the distribution folder', (t) => {
  const root = fixture(t, '../invalid');
  const result = runPackager(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid extension version/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
});
