import type { TFile, Vault } from 'obsidian';
import { stringify } from 'yaml';
import type { QuizGenerator } from './integration/claudian';
import { planClipboardQuizImport } from './importer';
import { buildQuizPrompt } from './prompt';
import type { QuizSettings } from './settings';
import { DEFAULT_QUIZ_FOLDER, normalizeQuizFolder } from './output-folder';

export interface GenerationRequest {
  source: { path: string; basename: string };
  content: string;
  settings: QuizSettings;
  generationId: string;
}

export interface GeneratedQuiz {
  file: TFile;
  questionCount: number;
}

type CreationVault = Pick<Vault, 'getAbstractFileByPath' | 'createFolder' | 'create'>;

export async function saveGeneratedQuiz(vault: CreationVault, response: string, source: GenerationRequest['source'], signal?: AbortSignal, outputFolder = DEFAULT_QUIZ_FOLDER): Promise<GeneratedQuiz> {
  if (signal?.aborted) throw new Error('Quiz generation cancelled.');
  const now = new Date();
  const folderPath = normalizeQuizFolder(outputFolder);
  const plan = planClipboardQuizImport(response, source.basename, new Set(), now, folderPath);
  const segments = folderPath.split('/');
  // Check every parent before creating anything, including file/folder conflicts.
  const paths = segments.map((_, index) => segments.slice(0, index + 1).join('/'));
  for (const path of paths) {
    const folder = vault.getAbstractFileByPath(path);
    if (folder && !('children' in folder)) throw new Error(`A file already exists at "${path}". Choose another quiz folder in preferences.`);
  }
  for (const path of paths) {
    if (vault.getAbstractFileByPath(path)) continue;
    try { await vault.createFolder(path); }
    catch (error) {
      const created = vault.getAbstractFileByPath(path);
      if (!created || !('children' in created)) throw error;
    }
  }
  if (signal?.aborted) throw new Error('Quiz generation cancelled.');
  // Never modify an existing note, including a collision created during generation.
  const base = plan.filePath.slice(0, -3);
  let path = plan.filePath;
  let suffix = 2;
  while (vault.getAbstractFileByPath(path)) path = `${base}-${suffix++}.md`;
  const metadata = stringify({ quiz_source: source.path, quiz_created: now.toISOString() });
  const file = await vault.create(path, `---\n${metadata}---\n\n${plan.content}`);
  return { file, questionCount: plan.questionCount };
}

/** Owns one generation at a time, retaining the source snapshot across UI changes. */
export class QuizGenerationService {
  private abortController?: AbortController;
  private saving = false;
  constructor(private readonly vault: CreationVault, private readonly generator: QuizGenerator, private readonly timeoutMs = 10 * 60 * 1000) {}

  get busy(): boolean { return Boolean(this.abortController); }
  get canCancel(): boolean { return this.busy && !this.saving; }
  cancel(): void { if (this.canCancel) this.abortController?.abort(); }

  async run(request: GenerationRequest, onStatus: (message: string) => void): Promise<GeneratedQuiz> {
    if (this.busy) throw new Error('A quiz is already being generated. Please wait until it finishes.');
    const controller = new AbortController();
    this.abortController = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    try {
      if (!request.content.trim()) throw new Error('This note is empty. Add some study material first.');
      const outputFolder = normalizeQuizFolder(request.settings.outputFolder);
      const prompt = `${buildQuizPrompt({
        template: request.settings.promptTemplate, noteTitle: request.source.basename, notePath: request.source.path,
        noteContent: request.content, questionCount: request.settings.questionCount, generationId: request.generationId,
      })}\n\nAUTOMATIC SAVE MODE\nThe full source note is included in this message. Do not run tools, create files, or edit files. Return only quiz code blocks based on the source note in your final answer. Do not return the syntax examples as questions. Note Quiz Engine will validate and save the quiz automatically.`;
      const response = await this.generator.generate(prompt, { signal: controller.signal, onStatus });
      if (controller.signal.aborted) throw new Error('Quiz generation cancelled.');
      clearTimeout(timer);
      this.saving = true;
      onStatus('Checking and saving your quiz…');
      return await saveGeneratedQuiz(this.vault, response, request.source, controller.signal, outputFolder);
    } catch (error) {
      if (timedOut) throw new Error('Generation timed out after 10 minutes. Check Claudian and try again.');
      throw error;
    } finally {
      clearTimeout(timer);
      this.abortController = undefined;
      this.saving = false;
    }
  }
}
