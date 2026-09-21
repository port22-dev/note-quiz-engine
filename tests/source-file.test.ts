// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { isMarkdownFile, resolveQuizSourceFile } from '../src/source-file';

function note(path: string) {
  return { path, basename: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''), extension: 'md' };
}

function setup(paths: string[] = []) {
  const files = new Map(paths.map((path) => [path, note(path)]));
  const root = document.createElement('div');
  const card = root.appendChild(document.createElement('div'));
  const owner = note('Notes/問題.md');
  const active = note('Unrelated.md');
  const leaves = [{ view: { containerEl: root, file: owner } }];
  const getFirstLinkpathDest = vi.fn((): ReturnType<typeof note> | null => null);
  const getActiveFile = vi.fn(() => active);
  const app = {
    vault: { getAbstractFileByPath: vi.fn((path: string) => files.get(path) ?? null) },
    workspace: { getLeavesOfType: vi.fn(() => leaves), getActiveFile },
    metadataCache: { getFirstLinkpathDest },
  } as unknown as App;
  return { app, files, card, root, owner, active, leaves, getFirstLinkpathDest, getActiveFile };
}

describe('quiz card source file resolution', () => {
  it('accepts real file-shaped objects without relying on the TFile constructor', () => {
    const { app, files } = setup(['test_quiz.md']);
    expect(resolveQuizSourceFile(app, 'test_quiz.md')).toBe(files.get('test_quiz.md'));
  });

  it('resolves Windows separators and a missing Markdown extension', () => {
    const { app, files } = setup(['過去問題集/問題.md']);
    expect(resolveQuizSourceFile(app, '.\\過去問題集\\問題')).toBe(files.get('過去問題集/問題.md'));
  });

  it('resolves URI-encoded Japanese names and spaces', () => {
    const path = '過去問題集/Linux 応用.md';
    const { app, files } = setup([path]);
    expect(resolveQuizSourceFile(app, encodeURI(path))).toBe(files.get(path));
  });

  it('retains a literal percent sign in a Markdown file name', () => {
    const path = '100%理解.md';
    const { app, files } = setup([path]);
    expect(resolveQuizSourceFile(app, path)).toBe(files.get(path));
  });

  it('prefers a literal encoded-looking filename when both versions exist', () => {
    const { app, files } = setup(['A%20B.md', 'A B.md']);
    expect(resolveQuizSourceFile(app, 'A%20B.md')).toBe(files.get('A%20B.md'));
  });

  it('uses Obsidian link resolution in the containing note context', () => {
    const { app, card, owner, getFirstLinkpathDest } = setup();
    const target = note('Notes/問題集.md');
    getFirstLinkpathDest.mockReturnValue(target);
    expect(resolveQuizSourceFile(app, '問題集', card)).toBe(target);
    expect(getFirstLinkpathDest).toHaveBeenCalledWith('問題集', owner.path);
  });

  it('resolves empty source paths only from the card’s own Markdown view', () => {
    const { app, card, owner, getActiveFile } = setup();
    expect(resolveQuizSourceFile(app, '', card)).toBe(owner);
    expect(getActiveFile).not.toHaveBeenCalled();
  });

  it('finds the containing view even when another Markdown leaf comes first', () => {
    const { app, card, leaves, owner } = setup();
    leaves.unshift({ view: { file: note('First.md'), containerEl: document.createElement('div') } });
    expect(resolveQuizSourceFile(app, '  ', card)).toBe(owner);
  });

  it('does not use the active note for a detached card without a source', () => {
    const { app, getActiveFile } = setup();
    expect(resolveQuizSourceFile(app, '', document.createElement('div'))).toBeNull();
    expect(resolveQuizSourceFile(app, '')).toBeNull();
    expect(getActiveFile).not.toHaveBeenCalled();
  });

  it('does not silently use the containing note when an explicit source is missing or renamed', () => {
    const { app, card, getActiveFile } = setup(['Renamed.md']);
    expect(resolveQuizSourceFile(app, 'Deleted-or-renamed.md', card)).toBeNull();
    expect(getActiveFile).not.toHaveBeenCalled();
  });

  it('rejects directories and non-Markdown files', () => {
    const { app } = setup();
    vi.mocked(app.vault.getAbstractFileByPath).mockReturnValue({ path: 'Folder', name: 'Folder' } as never);
    expect(resolveQuizSourceFile(app, 'Folder')).toBeNull();
    expect(isMarkdownFile({ path: 'Notes.pdf', basename: 'Notes', extension: 'pdf' })).toBe(false);
    expect(isMarkdownFile({ path: 'Notes.md', extension: 'md' })).toBe(false);
    expect(isMarkdownFile(null)).toBe(false);
  });
});
