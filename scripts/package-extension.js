'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');

const runtimeFiles = [
  'manifest.json', 'providers.js', 'content-core.js', 'content.js',
  'stream-bridge.js', 'overlay.js', 'background-core.js', 'background.js',
  'welcome.html', 'welcome.css', 'welcome.js',
  'popup.html', 'popup.css', 'popup.js',
];

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// A classic ZIP containing the small, fixed set of extension runtime files.
// Fixed DOS timestamps make the archive independent of checkout timestamps.
function createArchive(entries) {
  const localParts = [];
  const directoryParts = [];
  let offset = 0;
  for (const { filename, bytes } of entries) {
    const name = Buffer.from(filename, 'utf8');
    const compressed = deflateRawSync(bytes);
    const checksum = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    directoryParts.push(directory, name);
    offset += local.length + name.length + compressed.length;
  }

  const directory = Buffer.concat(directoryParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

function packageExtension(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new Error('Invalid extension version');
  }
  const entries = runtimeFiles.map(filename => ({
    filename,
    bytes: fs.readFileSync(path.join(root, filename)),
  }));
  const archive = createArchive(entries);
  const relativePath = 'dist/AI-Chat-Notifications-v' + manifest.version + '.zip';
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), archive);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'archive=' + relativePath + '\n');
  }
  console.log('Packaged extension ZIP: ' + path.basename(relativePath));
}

try {
  packageExtension(path.resolve(process.argv[2] || path.join(__dirname, '..')));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
