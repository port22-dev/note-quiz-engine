import { mkdir, copyFile } from 'node:fs/promises';

const destination = new URL('../dist/note-quiz-engine/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(new URL(`../${name}`, import.meta.url), new URL(name, destination));
}
console.log('Installable plugin files: dist/note-quiz-engine');
