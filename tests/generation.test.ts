import { describe, expect, it, vi } from 'vitest';
import type { TFile, Vault } from 'obsidian';
import { QuizGenerationService, saveGeneratedQuiz } from '../src/generation';
import { DEFAULT_SETTINGS } from '../src/settings';
import { parseQuizMarkdown } from '../src/parser';
import type { GenerationOptions } from '../src/integration/claudian';

const response = '```quiz\nquiz:\n  type: text\n  question: "メモリ確認コマンドは？"\n  answers: ["free"]\n  explanation: "freeで表示。"\n```';
function fixture() {
  const files = new Map<string, { path: string; content?: string; children?: unknown[] }>();
  const vault = {
    getMarkdownFiles: vi.fn(() => [...files.values()].filter((file) => file.content !== undefined)),
    getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null),
    createFolder: vi.fn(async (path: string) => { files.set(path, { path, children: [] }); }),
    create: vi.fn(async (path: string, content: string) => {
      if (files.has(path)) throw new Error('already exists');
      const file = { path, content, basename: path.split('/').pop()!.slice(0, -3), extension: 'md' };
      files.set(path, file);
      return file as unknown as TFile;
    }),
  };
  const generate = vi.fn(async () => response);
  const service = new QuizGenerationService(vault as unknown as Vault, { generate });
  const request = { source: { path: '学習/Linux.md', basename: 'Linux' }, content: 'freeでメモリを確認する。', settings: { ...DEFAULT_SETTINGS }, generationId: 'one' };
  return { files, vault, generate, service, request };
}

describe('one-button generation and safe saving', () => {
  it('sends source contents, validates final response, and creates an immediately playable note', async () => {
    const context = fixture();
    const result = await context.service.run(context.request, vi.fn());
    expect(context.generate).toHaveBeenCalledWith(expect.stringContaining(context.request.content), expect.any(Object));
    expect(context.generate).toHaveBeenCalledWith(expect.stringContaining('Do not run tools, create files, or edit files.'), expect.any(Object));
    expect(context.vault.createFolder).toHaveBeenCalledWith('Quizzes');
    expect(result.file.path).toMatch(/^Quizzes\/Linux-/);
    expect(context.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(result.questionCount).toBe(1);
    const saved = context.files.get(result.file.path)!.content!;
    expect(saved).toContain('quiz_source: 学習/Linux.md');
    expect(parseQuizMarkdown(saved).questions).toHaveLength(1);
    expect(context.service.busy).toBe(false);
  });

  it('rejects invalid output before creating any folder or file', async () => {
    const context = fixture();
    context.generate.mockResolvedValue('usage limit');
    await expect(context.service.run(context.request, vi.fn())).rejects.toThrow('quiz format');
    expect(context.vault.createFolder).not.toHaveBeenCalled();
    expect(context.vault.create).not.toHaveBeenCalled();
  });

  it('avoids overwriting when several responses share a timestamp', async () => {
    vi.useFakeTimers();
    try {
      const context = fixture();
      const first = await context.service.run(context.request, vi.fn());
      const second = await context.service.run(context.request, vi.fn());
      expect(first.file.path).not.toBe(second.file.path);
      expect(context.files.get(first.file.path)!.content).toContain('quiz:');
      expect(context.vault.createFolder).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('rejects duplicate clicks and cancellation never creates a partial file', async () => {
    const context = fixture();
    context.generate.mockImplementation((_prompt?: string, options?: GenerationOptions) => new Promise<string>((_, reject) => options!.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })));
    const run = context.service.run(context.request, vi.fn());
    const rejection = expect(run).rejects.toThrow('cancelled');
    await expect(context.service.run(context.request, vi.fn())).rejects.toThrow('already being generated');
    expect(context.service.canCancel).toBe(true);
    context.service.cancel();
    await rejection;
    expect(context.vault.create).not.toHaveBeenCalled();
    expect(context.service.busy).toBe(false);
  });

  it('refuses a conflicting file in the destination folder path', async () => {
    const context = fixture();
    context.files.set('Quizzes', { path: 'Quizzes', content: 'existing' });
    await expect(saveGeneratedQuiz(context.vault as unknown as Vault, response, context.request.source)).rejects.toThrow('A file already exists');
    expect(context.vault.createFolder).not.toHaveBeenCalled();
    expect(context.vault.create).not.toHaveBeenCalled();
  });

  it.each(['過去問題集', 'Study/Quizzes', '学習/過去問題集'])('saves to the configured folder %s and creates parents in order', async (outputFolder) => {
    const context = fixture();
    context.request.settings.outputFolder = outputFolder;
    const result = await context.service.run(context.request, vi.fn());
    expect(result.file.path.startsWith(`${outputFolder}/Linux-`)).toBe(true);
    const expectedFolders = outputFolder.split('/').map((_, index, segments) => segments.slice(0, index + 1).join('/'));
    expect(context.vault.createFolder.mock.calls.map(([path]) => path)).toEqual(expectedFolders);
    expect(context.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(context.files.has('Quizzes')).toBe(false);
  });

  it('reuses existing parent folders and creates only missing descendants', async () => {
    const context = fixture();
    context.files.set('Study', { path: 'Study', children: [] });
    const result = await saveGeneratedQuiz(context.vault as unknown as Vault, response, context.request.source, undefined, 'Study/Quizzes/Linux');
    expect(context.vault.createFolder.mock.calls).toEqual([['Study/Quizzes'], ['Study/Quizzes/Linux']]);
    expect(result.file.path.startsWith('Study/Quizzes/Linux/Linux-')).toBe(true);
  });

  it('checks all destination segments for conflicts before creating any folders', async () => {
    const context = fixture();
    context.files.set('Study/Quizzes', { path: 'Study/Quizzes', content: 'existing' });
    await expect(saveGeneratedQuiz(context.vault as unknown as Vault, response, context.request.source, undefined, 'Study/Quizzes/Linux'))
      .rejects.toThrow('A file already exists at "Study/Quizzes"');
    expect(context.vault.createFolder).not.toHaveBeenCalled();
    expect(context.vault.create).not.toHaveBeenCalled();
    expect(context.files.get('Study/Quizzes')!.content).toBe('existing');
  });

  it.each(['../Quizzes', 'Study/../../outside', '/tmp/Quizzes', 'C:\\Quizzes', '\\\\server\\share'])('rejects unsafe folder %s before contacting AI or writing files', async (outputFolder) => {
    const context = fixture();
    context.request.settings.outputFolder = outputFolder;
    await expect(context.service.run(context.request, vi.fn())).rejects.toThrow('folder inside your vault');
    expect(context.generate).not.toHaveBeenCalled();
    expect(context.vault.createFolder).not.toHaveBeenCalled();
    expect(context.vault.create).not.toHaveBeenCalled();
    expect(context.service.busy).toBe(false);
  });

  it.each(['../Quizzes', '/tmp/Quizzes', 'C:\\Quizzes'])('rejects unsafe folder %s when importing directly', async (outputFolder) => {
    const context = fixture();
    await expect(saveGeneratedQuiz(context.vault as unknown as Vault, response, context.request.source, undefined, outputFolder))
      .rejects.toThrow('folder inside your vault');
    expect(context.vault.createFolder).not.toHaveBeenCalled();
    expect(context.vault.create).not.toHaveBeenCalled();
  });

  it('surfaces write failures and allows a new attempt', async () => {
    const context = fixture();
    context.vault.create.mockRejectedValueOnce(new Error('disk full'));
    await expect(context.service.run(context.request, vi.fn())).rejects.toThrow('disk full');
    expect(context.service.busy).toBe(false);
    expect((await context.service.run(context.request, vi.fn())).questionCount).toBe(1);
  });
});
