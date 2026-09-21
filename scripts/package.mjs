import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const destination = new URL('../dist/note-quiz-engine/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(new URL(`../${name}`, import.meta.url), new URL(name, destination));
}

// Create a dependency-free ZIP with the exact folder layout expected by Obsidian.
function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value); return buffer; }
function u32(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0); return buffer; }

const entries = [];
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  const data = await readFile(new URL(`../${name}`, import.meta.url));
  entries.push({ name: `note-quiz-engine/${name}`, data, crc: crc32(data) });
}
const localParts = [];
const centralParts = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name, 'utf8');
  const local = Buffer.concat([
    Buffer.from('PK\x03\x04', 'binary'), u16(20), u16(0x800), u16(0), u16(0), u16(0),
    u32(entry.crc), u32(entry.data.length), u32(entry.data.length), u16(name.length), u16(0), name, entry.data,
  ]);
  localParts.push(local);
  centralParts.push(Buffer.concat([
    Buffer.from('PK\x01\x02', 'binary'), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0),
    u32(entry.crc), u32(entry.data.length), u32(entry.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
  ]));
  offset += local.length;
}
const central = Buffer.concat(centralParts);
const zip = Buffer.concat([
  ...localParts, central,
  Buffer.concat([Buffer.from('PK\x05\x06', 'binary'), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]),
]);
await writeFile(join(fileURLToPath(new URL('../dist/', import.meta.url)), 'note-quiz-engine.zip'), zip);
console.log('Installable plugin files: dist/note-quiz-engine');
console.log('Release ZIP: dist/note-quiz-engine.zip');
