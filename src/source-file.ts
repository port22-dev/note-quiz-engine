import type { App, TFile } from 'obsidian';

/** A TFile can come from a different Obsidian window, where instanceof is unreliable. */
export function isMarkdownFile(value: unknown): value is TFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<TFile>;
  return file.extension === 'md' && typeof file.path === 'string' && typeof file.basename === 'string';
}

function normalizeSourcePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^(?:\.\/)+/, '').replace(/^\//, '');
}

function sourceCandidates(sourcePath: string): string[] {
  const paths = [normalizeSourcePath(sourcePath)];
  try {
    paths.push(normalizeSourcePath(decodeURIComponent(sourcePath)));
  } catch {
    // A literal percent sign in a valid note name does not have to be URI encoded.
  }
  return [...new Set(paths.filter(Boolean).flatMap((path) => path.endsWith('.md') ? [path] : [path, `${path}.md`]))];
}

function containingFile(app: App, element?: HTMLElement): TFile | null {
  if (!element) return null;
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    const view = leaf.view as typeof leaf.view & { file?: unknown };
    if (view.containerEl.contains(element) && isMarkdownFile(view.file)) return view.file;
  }
  return null;
}

/** Resolve the source of this card, never an unrelated focused note. */
export function resolveQuizSourceFile(app: App, sourcePath: string, element?: HTMLElement): TFile | null {
  if (!sourcePath.trim()) return containingFile(app, element);

  const candidates = sourceCandidates(sourcePath);
  for (const path of candidates) {
    const file = app.vault.getAbstractFileByPath(path);
    if (isMarkdownFile(file)) return file;
  }

  const owner = containingFile(app, element);
  for (const path of candidates) {
    const file = app.metadataCache.getFirstLinkpathDest(path, owner?.path ?? '');
    if (isMarkdownFile(file)) return file;
  }
  return null;
}
