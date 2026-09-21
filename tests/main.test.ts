// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, Command, Editor, MarkdownView, PluginManifest } from 'obsidian';
import NoteQuizPlugin from '../src/main';
import { loadQuizSettings } from '../src/settings';
import { parseQuizMarkdown } from '../src/parser';

const source = '```quiz\nquiz:\n  type: text\n  question: "コマンドは？"\n  answers: ["free"]\n  explanation: "メモリを確認します。"\n```\n';

async function setup(existingLanguages: string[] = []) {
  const file = { path: 'Linux.md', basename: 'Linux', extension: 'md' };
  const vault = { read: vi.fn().mockResolvedValue(source), process: vi.fn().mockResolvedValue(''), getAbstractFileByPath: vi.fn(() => null) };
  const workspace = { getActiveFile: vi.fn(() => file), getActiveViewOfType: vi.fn(), getLeavesOfType: vi.fn((): Array<{ view: unknown }> => []), onLayoutReady: vi.fn((callback: () => void) => callback()), on: vi.fn() };
  const plugin = new NoteQuizPlugin({ vault, workspace } as unknown as App, {} as PluginManifest);
  const commands = new Map<string, Command>();
  vi.spyOn(plugin, 'addCommand').mockImplementation((command) => { commands.set(command.id, command); return command; });
  const processor = vi.spyOn(plugin, 'registerMarkdownCodeBlockProcessor');
  const languages = new Set(existingLanguages);
  processor.mockImplementation((language) => {
    if (languages.has(language)) throw new Error(`Code block postprocessor for language ${language} is already registered`);
    languages.add(language);
    return (() => undefined);
  });
  await plugin.onload();
  return { plugin, commands, vault, workspace, processor, file };
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('plugin commands', () => {
  it('loads alongside a plugin that owns quiz blocks and still plays legacy notes', async () => {
    const { plugin, processor, commands } = await setup(['quiz']);
    expect(processor).not.toHaveBeenCalledWith('quiz', expect.any(Function));
    commands.get('start-quiz')!.checkCallback!(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain('コマンドは？'));
    plugin.onunload();
  });
  it('registers all MVP commands and reading-view rendering', async () => {
    const { plugin, commands, processor } = await setup();
    expect([...commands.keys()]).toEqual(['generate-and-save-quiz', 'start-quiz', 'generate-quiz-prompt', 'import-quiz-from-clipboard', 'insert-quiz-template']);
    expect(processor).toHaveBeenCalledWith('note-quiz', expect.any(Function));
    expect(commands.get('start-quiz')!.checkCallback!(true)).toBe(true);
    expect(document.body.textContent).toBe('');
    plugin.onunload();
  });

  it('starts from the active editor and closes modals on unload', async () => {
    const { plugin, commands, workspace, file, vault } = await setup();
    workspace.getActiveViewOfType.mockReturnValue({ file, editor: { getValue: () => source } });
    commands.get('start-quiz')!.checkCallback!(false);
    await vi.waitFor(() => expect(document.body.textContent).toContain('コマンドは？'));
    expect(vault.read).not.toHaveBeenCalled();
    plugin.onunload();
    expect(document.body.children.length).toBe(0);
  });

  it('inserts both valid question types at the cursor', async () => {
    const { plugin, commands } = await setup();
    const replaceSelection = vi.fn();
    commands.get('insert-quiz-template')!.editorCallback!({ replaceSelection } as unknown as Editor, {} as MarkdownView);
    const parsed = parseQuizMarkdown(replaceSelection.mock.calls[0]![0] as string);
    expect(parsed.issues).toEqual([]);
    expect(parsed.questions.map((question) => question.type)).toEqual(['choice', 'text']);
    plugin.onunload();
  });

  it('prepares source-aware prompts without making a network request', async () => {
    const { plugin, commands } = await setup();
    const network = vi.spyOn(globalThis, 'fetch');
    commands.get('generate-quiz-prompt')!.checkCallback!(false);
    await vi.waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    const prompt = document.querySelector('textarea')!.value;
    expect(prompt).toContain('Linux.md');
    expect(prompt).toContain('コマンドは？');
    expect(prompt).toContain('Required output format for Note Quiz Engine');
    expect(network).not.toHaveBeenCalled();
    plugin.onunload();
  });

  it('disables file commands outside Markdown notes', async () => {
    const { plugin, commands, file } = await setup();
    file.extension = 'pdf';
    expect(commands.get('start-quiz')!.checkCallback!(true)).toBe(false);
    expect(commands.get('generate-quiz-prompt')!.checkCallback!(true)).toBe(false);
    plugin.onunload();
  });

  it('creates a playable note through a single toolbar click without the clipboard', async () => {
    const { plugin, file, workspace, vault } = await setup();
    const contentEl = document.createElement('div');
    const containerEl = document.createElement('div');
    containerEl.append(contentEl);
    document.body.append(containerEl);
    const view = { file, contentEl, containerEl, editor: { getValue: () => 'freeはメモリを表示します。' } };
    // Restored, unopened Markdown tabs can precede the active, loaded view.
    workspace.getLeavesOfType.mockReturnValue([{ view: { getViewType: () => 'markdown' } }, { view }]);
    workspace.getActiveViewOfType.mockReturnValue(view);
    const state: { messages: Array<{ id: string; role: string; content: string; completedAt: number }>; isStreaming: boolean } = { messages: [], isStreaming: false };
    const sendMessage = vi.fn(async () => { state.messages.push({ id: 'answer', role: 'assistant', content: source, completedAt: Date.now() }); });
    Object.assign(plugin.app, { plugins: { getPlugin: () => ({ activateView: async () => undefined, getView: () => ({ getTabManager: () => ({ createTab: async () => ({ state, controllers: { inputController: { sendMessage, cancelStreaming: vi.fn() } } }) }) }) }) } });
    const createdFile = { path: 'Quizzes/Linux-test.md', basename: 'Linux-test', extension: 'md' };
    const create = vi.fn().mockResolvedValue(createdFile);
    Object.assign(vault, { getMarkdownFiles: () => [], getAbstractFileByPath: () => ({ children: [] }), createFolder: vi.fn(), create });
    // Destination folder exists, but the generated filename does not.
    Object.assign(vault, { getAbstractFileByPath: (path: string) => path === '過去問題集' ? { children: [] } : null });
    const openFile = vi.fn().mockResolvedValue(undefined);
    Object.assign(workspace, { getLeaf: () => ({ openFile }) });
    workspace.onLayoutReady.mock.calls[0]![0]();
    const generate = [...contentEl.querySelectorAll('button')].find((button) => button.textContent === 'Generate quiz')!;
    expect(generate).toBeDefined();
    generate.click();
    generate.click();
    await vi.waitFor(() => expect(openFile).toHaveBeenCalledWith(createdFile));
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0]).toMatch(/^Quizzes\/Linux-/);
    expect(parseQuizMarkdown(create.mock.calls[0]![1] as string).questions).toHaveLength(1);
    expect(contentEl.textContent).toContain('Saved 1 question');
    plugin.onunload();
    expect(contentEl.querySelector('.note-quiz-toolbar')).toBeNull();
  });
});

describe('persisted settings validation', () => {
  it('retains valid settings and repairs corrupted persisted data', () => {
    expect(loadQuizSettings({ caseSensitive: false, questionCount: 5, promptTemplate: 'Custom' })).toEqual({ caseSensitive: false, questionCount: 5, promptTemplate: 'Custom', outputFolder: '過去問題集' });
    const repaired = loadQuizSettings({ caseSensitive: 'false', questionCount: 0, promptTemplate: '' });
    expect(repaired.caseSensitive).toBe(true);
    expect(repaired.questionCount).toBe(10);
    expect(repaired.promptTemplate).toContain('{{noteContent}}');
    expect(loadQuizSettings(null)).toEqual({ ...repaired, outputFolder: 'Quizzes' });
  });

  it('preserves legacy folders and accepts a portable custom folder', () => {
    expect(loadQuizSettings({ caseSensitive: true }).outputFolder).toBe('過去問題集');
    expect(loadQuizSettings({ outputFolder: 'Study\\Quizzes' }).outputFolder).toBe('Study/Quizzes');
    expect(loadQuizSettings({ outputFolder: '../outside' }).outputFolder).toBe('Quizzes');
    expect(loadQuizSettings({}).outputFolder).toBe('Quizzes');
  });
});
