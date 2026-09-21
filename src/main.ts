import { MarkdownView, Notice, Plugin } from 'obsidian';
import type { TFile } from 'obsidian';
import { parseQuizMarkdown } from './parser';
import { QuizGenerationService, saveGeneratedQuiz } from './generation';
import { ClaudianGenerator } from './integration/claudian';
import { isMarkdownFile, resolveQuizSourceFile } from './source-file';
import { buildQuizPrompt } from './prompt';
import { VaultResultStore } from './result-store';
import { DEFAULT_SETTINGS, loadQuizSettings, QuizSettingsTab } from './settings';
import { PromptModal } from './ui/prompt-modal';
import { createAttemptId, messageOf, QuizModal } from './ui/quiz-modal';
import { LEGACY_QUIZ_FOLDER } from './output-folder';

const QUIZ_TEMPLATE = '\n```note-quiz\nquiz:\n  type: choice\n  question: "Which Linux command shows memory usage?"\n  options:\n    - "df"\n    - "free"\n  answer: 2\n  explanation: "The free command shows memory usage."\n```\n\n```note-quiz\nquiz:\n  type: text\n  question: "Name a Linux command that shows memory usage."\n  answers:\n    - "free"\n    - "free -h"\n    - "free -m"\n  explanation: "The free command shows memory usage."\n```\n';

export default class NoteQuizPlugin extends Plugin {
  settings = { ...DEFAULT_SETTINGS };
  private store!: VaultResultStore;
  private readonly modals = new Set<QuizModal | PromptModal>();
  private settingsSave: Promise<void> = Promise.resolve();
  private generation!: QuizGenerationService;
  private preparingGeneration = false;
  private unloading = false;
  private generationStatus = '';
  private readonly toolbars = new Map<MarkdownView, { root: HTMLElement; generate: HTMLButtonElement; cancel: HTMLButtonElement; status: HTMLElement }>();

  async onload(): Promise<void> {
    const savedSettings: unknown = await this.loadData();
    this.settings = loadQuizSettings(savedSettings);
    // An earlier installation may have used defaults without ever saving data.
    if (!savedSettings && this.app.vault.getAbstractFileByPath(LEGACY_QUIZ_FOLDER)) {
      this.settings.outputFolder = LEGACY_QUIZ_FOLDER;
    }
    this.store = new VaultResultStore(this.app.vault);
    this.generation = new QuizGenerationService(this.app.vault, new ClaudianGenerator(this.app));
    this.addSettingTab(new QuizSettingsTab(this.app, this));
    this.addCommand({
      id: 'generate-and-save-quiz', name: 'Generate quiz',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isMarkdownFile(file)) return false;
        if (!checking) void this.generateAndSave(file);
        return true;
      },
    });
    this.addRibbonIcon('sparkles', 'Generate quiz', () => {
      const file = this.app.workspace.getActiveFile();
      if (isMarkdownFile(file)) void this.generateAndSave(file);
      else new Notice('Open a Markdown note to generate a quiz.');
    });
    this.app.workspace.onLayoutReady(() => this.refreshToolbars());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.refreshToolbars()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.refreshToolbars()));
    this.addCommand({
      id: 'start-quiz', name: 'Start quiz',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') return false;
        if (!checking) void this.openQuiz(file);
        return true;
      },
    });
    this.addCommand({
      id: 'generate-quiz-prompt', name: 'Generate quiz prompt',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') return false;
        if (!checking) void this.generatePrompt(file);
        return true;
      },
    });
    this.addCommand({
      id: 'import-quiz-from-clipboard', name: 'Import generated quiz from clipboard',
      callback: () => { void this.importClipboardQuiz(); },
    });
    this.addCommand({ id: 'insert-quiz-template', name: 'Insert quiz template', editorCallback: (editor) => editor.replaceSelection(QUIZ_TEMPLATE) });
    this.addRibbonIcon('list-checks', 'Start quiz', () => {
      const file = this.app.workspace.getActiveFile();
      if (file?.extension === 'md') void this.openQuiz(file);
      else new Notice('Open a Markdown note containing quiz questions.');
    });
    // Generic languages such as "quiz" may already belong to another plugin.
    // Obsidian throws on duplicate registration, preventing the plugin from loading.
    this.registerMarkdownCodeBlockProcessor('note-quiz', (source, element, context) => {
      const parsed = parseQuizMarkdown(`\`\`\`quiz\n${source}\n\`\`\``);
      const card = element.createDiv({ cls: 'note-quiz-card' });
      const first = parsed.questions[0];
      if (parsed.issues.length || !first) {
        card.createEl('p', { text: `Check the quiz format: ${parsed.issues.map((issue) => issue.message).join(' / ') || 'No questions found.'}`, cls: 'note-quiz-error' });
        return;
      }
      card.createEl('strong', { text: first.type === 'choice' ? 'Multiple choice' : 'Text answer', cls: 'note-quiz-muted' });
      card.createEl('p', { text: first.question, cls: 'note-quiz-question' });
      const start = card.createEl('button', { text: 'Start quiz', cls: 'mod-cta' });
      start.addEventListener('click', () => {
        const file = resolveQuizSourceFile(this.app, context.sourcePath, element);
        if (file) void this.openQuiz(file);
        else new Notice('The quiz note could not be found. Reopen the note and try again.');
      });
    });
  }

  private refreshToolbars(): void {
    if (this.unloading) return;
    // Obsidian can restore background tabs as DeferredView placeholders. Their
    // contentEl does not exist until the tab is opened.
    const views = new Set(this.app.workspace.getLeavesOfType('markdown')
      .map((leaf) => leaf.view as MarkdownView)
      .filter((view) => view.contentEl && typeof view.contentEl.createDiv === 'function'));
    for (const [view, toolbar] of this.toolbars) {
      if (!views.has(view)) { toolbar.root.remove(); this.toolbars.delete(view); }
    }
    for (const view of views) {
      let toolbar = this.toolbars.get(view);
      if (!toolbar || !view.contentEl.contains(toolbar.root)) {
        toolbar?.root.remove();
        const root = view.contentEl.createDiv({ cls: 'note-quiz-toolbar' });
        view.contentEl.prepend(root);
        const generate = root.createEl('button', { text: 'Generate quiz', cls: 'mod-cta' });
        generate.title = 'Send this note to Claudian and save the generated quiz';
        generate.addEventListener('click', () => { if (isMarkdownFile(view.file)) void this.generateAndSave(view.file); });
        const start = root.createEl('button', { text: 'Start quiz' });
        start.addEventListener('click', () => { if (isMarkdownFile(view.file)) void this.openQuiz(view.file); });
        const cancel = root.createEl('button', { text: 'Cancel generation' });
        cancel.addEventListener('click', () => { this.generation.cancel(); this.setGenerationStatus('Cancelling generation…'); });
        const status = root.createSpan({ cls: 'note-quiz-generation-status', attr: { role: 'status', 'aria-live': 'polite' } });
        toolbar = { root, generate, cancel, status };
        this.toolbars.set(view, toolbar);
      }
      toolbar.root.hidden = !isMarkdownFile(view.file);
      toolbar.generate.disabled = this.preparingGeneration || this.generation.busy;
      toolbar.cancel.hidden = !this.generation.canCancel;
      toolbar.status.textContent = this.generationStatus;
    }
  }

  private setGenerationStatus(message: string): void {
    this.generationStatus = message;
    this.refreshToolbars();
  }

  private async generateAndSave(file: TFile): Promise<void> {
    if (this.preparingGeneration || this.generation.busy) {
      new Notice('A quiz is already being generated. Check the status above your note.');
      return;
    }
    this.preparingGeneration = true;
    const source = { path: file.path, basename: file.basename };
    const settings = { ...this.settings };
    this.setGenerationStatus(`Reading ${source.basename}…`);
    try {
      const content = await this.currentContent(file);
      if (this.unloading) return;
      const result = await this.generation.run({ source, content, settings, generationId: createAttemptId() }, (status) => this.setGenerationStatus(status));
      this.setGenerationStatus(`Saved ${result.questionCount} ${result.questionCount === 1 ? 'question' : 'questions'} to ${result.file.path}`);
      new Notice(`Quiz saved to ${result.file.path}`);
      if (!this.unloading) {
        try { await this.app.workspace.getLeaf(true).openFile(result.file); }
        catch { new Notice(`Your quiz was saved. Open it from the file explorer: ${result.file.path}`, 10000); }
      }
    } catch (error) {
      this.setGenerationStatus(messageOf(error));
      if (!this.unloading) new Notice(messageOf(error), 12000);
    } finally {
      this.preparingGeneration = false;
      this.refreshToolbars();
    }
  }

  private async currentContent(file: TFile): Promise<string> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file === file ? view.editor.getValue() : this.app.vault.read(file);
  }

  private async openQuiz(file: TFile): Promise<void> {
    try {
      const parsed = parseQuizMarkdown(await this.currentContent(file));
      if (parsed.issues.length) {
        new Notice(`Check the quiz format.\n${parsed.issues.map((issue) => `Line ${issue.line}: ${issue.message}`).join('\n')}`, 12000);
        return;
      }
      if (!parsed.questions.length) { new Notice('No questions found. Use Generate quiz or the Insert quiz template command.'); return; }
      const modal = new QuizModal(this.app, file, parsed.questions, { caseSensitive: this.settings.caseSensitive }, (attempt, questions) => this.store.save(file, attempt, questions));
      this.trackModal(modal);
    } catch (error) { new Notice(`Could not open the quiz: ${messageOf(error)}`, 10000); }
  }

  private async generatePrompt(file: TFile): Promise<void> {
    try {
      const prompt = buildQuizPrompt({
        template: this.settings.promptTemplate, noteTitle: file.basename, notePath: file.path,
        noteContent: await this.currentContent(file), questionCount: this.settings.questionCount,
        generationId: createAttemptId(),
        generationLanguage: this.settings.generationLanguage,
      });
      this.trackModal(new PromptModal(this.app, prompt));
    } catch (error) { new Notice(`Could not prepare the prompt: ${messageOf(error)}`, 10000); }
  }

  private async importClipboardQuiz(): Promise<void> {
    try {
      const source = this.app.workspace.getActiveFile();
      const origin = { basename: source?.basename ?? 'quiz', path: source?.path ?? '' };
      const clipboard = await navigator.clipboard.readText();
      const result = await saveGeneratedQuiz(this.app.vault, clipboard, origin, undefined, this.settings.outputFolder);
      await this.app.workspace.getLeaf(true).openFile(result.file);
      new Notice(`Quiz saved to ${result.file.path}`);
    } catch (error) {
      new Notice(`Could not import the quiz: ${messageOf(error)}`, 10000);
    }
  }

  private trackModal(modal: QuizModal | PromptModal): void {
    this.modals.add(modal);
    const close = modal.onClose.bind(modal);
    modal.onClose = () => { close(); this.modals.delete(modal); };
    modal.open();
  }

  persistSettings(): Promise<void> {
    const snapshot = { ...this.settings };
    this.settingsSave = this.settingsSave.then(() => this.saveData(snapshot)).catch((error: unknown) => {
      new Notice(`Could not save preferences: ${messageOf(error)}`);
    });
    return this.settingsSave;
  }

  onunload(): void {
    this.unloading = true;
    this.generation?.cancel();
    for (const modal of this.modals) modal.close();
    for (const toolbar of this.toolbars.values()) toolbar.root.remove();
    this.toolbars.clear();
  }
}
