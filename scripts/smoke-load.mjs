// Execute the shipped bundle with the host's duplicate-language rule, without AI.
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { setTimeout, clearTimeout } from 'node:timers';

const languages = new Set(['quiz']); // Another quiz plugin is already enabled.
const commands = [];
class Plugin {
  constructor(app) { this.app = app; }
  async loadData() { return null; }
  addSettingTab() {}
  addCommand(command) { commands.push(command); }
  addRibbonIcon() {}
  registerEvent() {}
  registerMarkdownCodeBlockProcessor(language) {
    if (languages.has(language)) {
      throw new Error(`Code block postprocessor for language ${language} is already registered`);
    }
    languages.add(language);
  }
}
const host = { Plugin, PluginSettingTab: class {}, Modal: class {}, MarkdownView: class {}, Notice: class {} };
const module = { exports: {} };
runInNewContext(await readFile(process.argv[2] ?? 'main.js', 'utf8'), {
  module, exports: module.exports,
  require: (name) => { assert.equal(name, 'obsidian'); return host; },
  console, setTimeout, clearTimeout,
});
const instance = new module.exports.default({
  vault: { getAbstractFileByPath: () => null },
  workspace: { onLayoutReady: (callback) => callback(), getLeavesOfType: () => [], on: () => ({}) },
});
await instance.onload();
assert(languages.has('note-quiz'));
assert(commands.some((command) => command.id === 'start-quiz'));
instance.onunload();
console.log('PASS: release bundle loads alongside an existing quiz processor, without Claudian.');
