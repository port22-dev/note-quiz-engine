import { Modal, Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';
import { QuizSession } from '../engine';
import type { GradingOptions, QuizAttempt, QuizQuestion, QuizResponse } from '../types';

export type SaveAttempt = (attempt: QuizAttempt, questions: readonly QuizQuestion[]) => Promise<void>;

export function createAttemptId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class QuizModal extends Modal {
  private readonly session: QuizSession;
  private readonly drafts = new Map<number, QuizResponse>();
  private attempt?: QuizAttempt;
  private saveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  private saveError = '';
  private showSummary = false;
  private opened = false;

  constructor(app: App, private readonly file: TFile, questions: QuizQuestion[], options: GradingOptions, private readonly saveAttempt: SaveAttempt) {
    super(app);
    this.session = new QuizSession(questions, options);
  }

  onOpen(): void {
    this.opened = true;
    this.modalEl.addClass('note-quiz-modal');
    this.setTitle(this.file.basename);
    this.render();
  }

  private button(parent: HTMLElement, text: string, action: () => void, disabled = false, primary = false): HTMLButtonElement {
    const button = parent.createEl('button', { text, cls: primary ? 'mod-cta' : '' });
    button.disabled = disabled;
    button.addEventListener('click', action);
    return button;
  }

  private render(): void {
    if (!this.opened) return;
    this.contentEl.empty();
    if (this.showSummary) { this.renderSummary(); return; }
    const { session } = this;
    const question = session.currentQuestion;
    const answer = session.currentAnswer;
    const draft = answer?.response ?? this.drafts.get(session.currentIndex);
    this.contentEl.createEl('p', { text: `Question ${session.currentIndex + 1} / ${session.questions.length}`, cls: 'note-quiz-progress' });
    this.contentEl.createEl('p', { text: `Answered ${session.score.answered} / ${session.score.total}`, cls: 'note-quiz-muted' });
    this.contentEl.createEl('h3', { text: question.question, cls: 'note-quiz-question' });
    const inputArea = this.contentEl.createDiv({ cls: 'note-quiz-input' });
    if (question.type === 'choice') {
      const group = inputArea.createEl('fieldset', { cls: 'note-quiz-options' });
      group.createEl('legend', { text: 'Choose one answer.' });
      question.options.forEach((option, index) => {
        const label = group.createEl('label', { cls: 'note-quiz-option' });
        const input = label.createEl('input', { type: 'radio' });
        input.name = `quiz-${question.id}`;
        input.value = String(index + 1);
        input.checked = draft === index + 1;
        input.disabled = Boolean(answer);
        label.createSpan({ text: option });
        input.addEventListener('change', () => this.drafts.set(session.currentIndex, index + 1));
      });
    } else {
      const label = inputArea.createEl('label', { text: 'Your answer', cls: 'note-quiz-text-label' });
      const input = label.createEl('textarea', { cls: 'note-quiz-text-answer' });
      input.rows = 3;
      input.placeholder = 'Type your answer';
      input.value = typeof draft === 'string' ? draft : '';
      input.disabled = Boolean(answer);
      input.addEventListener('input', () => this.drafts.set(session.currentIndex, input.value));
    }
    const error = this.contentEl.createDiv({ cls: 'note-quiz-error', attr: { role: 'alert' } });
    if (!answer) {
      this.button(this.contentEl, 'Submit answer', () => {
        try {
          const response = this.drafts.get(session.currentIndex);
          if (response === undefined) throw new Error('Choose or type an answer first.');
          session.answer(response);
          this.render();
          if (session.complete) void this.persist();
        } catch (cause) { error.textContent = messageOf(cause); }
      }, false, true);
    } else {
      const feedback = this.contentEl.createDiv({ cls: answer.correct ? 'note-quiz-feedback is-correct' : 'note-quiz-feedback is-incorrect', attr: { role: 'status' } });
      feedback.createEl('strong', { text: answer.correct ? '✓ Correct' : '✗ Incorrect' });
      if (!answer.correct) feedback.createEl('p', { text: `Correct answer: ${question.type === 'choice' ? question.options[question.answer - 1] : question.answers.join(' / ')}` });
      feedback.createEl('p', { text: question.explanation, cls: 'note-quiz-explanation' });
    }
    const navigation = this.contentEl.createDiv({ cls: 'note-quiz-actions' });
    this.button(navigation, 'Previous', () => { session.previous(); this.render(); }, session.currentIndex === 0);
    this.button(navigation, 'Next', () => { session.next(); this.render(); }, session.currentIndex === session.questions.length - 1);
    if (session.complete) this.button(navigation, 'Results', () => { this.showSummary = true; this.render(); }, false, true);
    else if (session.currentIndex === session.questions.length - 1 && answer) {
      this.button(navigation, 'Go to unanswered question', () => {
        session.goTo(session.questions.findIndex((_, index) => !session.getAnswer(index)));
        this.render();
      });
    }
    if (session.complete) this.renderSaveState();
  }

  private renderSummary(): void {
    const score = this.session.score;
    this.contentEl.createEl('h3', { text: 'Quiz results' });
    const result = this.contentEl.createDiv({ cls: 'note-quiz-score', attr: { role: 'status' } });
    result.createEl('strong', { text: `${score.correct} / ${score.total}` });
    result.createEl('span', { text: `Accuracy ${score.accuracy}%` });
    this.renderSaveState();
    const list = this.contentEl.createEl('ol', { cls: 'note-quiz-review' });
    this.session.questions.forEach((question, index) => {
      const item = list.createEl('li');
      this.button(item, `${this.session.getAnswer(index)?.correct ? '✓' : '✗'} ${question.question}`, () => {
        this.session.goTo(index);
        this.showSummary = false;
        this.render();
      });
    });
    const actions = this.contentEl.createDiv({ cls: 'note-quiz-actions' });
    this.button(actions, 'Try again', () => {
      this.session.restart();
      this.drafts.clear();
      this.attempt = undefined;
      this.saveState = 'idle';
      this.saveError = '';
      this.showSummary = false;
      this.render();
    }, this.saveState !== 'saved', true);
    this.button(actions, 'Close', () => this.close());
    if (this.saveState !== 'saved') this.contentEl.createEl('p', { text: 'You can try again once your results are saved.', cls: 'note-quiz-muted' });
  }

  private renderSaveState(): void {
    const state = this.contentEl.createDiv({ cls: 'note-quiz-save-state', attr: { role: 'status', 'aria-live': 'polite' } });
    if (this.saveState === 'saved') state.textContent = 'Results saved to your note.';
    else if (this.saveState === 'error') {
      state.createEl('p', { text: `Could not save results: ${this.saveError}`, cls: 'note-quiz-error' });
      this.button(state, 'Retry saving', () => { void this.persist(); });
    } else state.textContent = 'Saving results…';
  }

  private async persist(): Promise<void> {
    if (!this.session.complete || this.saveState === 'saving' || this.saveState === 'saved') return;
    this.attempt ??= { ...this.session.score, id: createAttemptId(), date: new Date().toISOString() };
    this.saveState = 'saving';
    this.render();
    try {
      await this.saveAttempt(this.attempt, this.session.questions);
      this.saveState = 'saved';
    } catch (cause) {
      this.saveError = messageOf(cause);
      this.saveState = 'error';
      if (!this.opened) new Notice(`Could not save results: ${this.saveError}`, 10000);
    }
    this.render();
  }

  onClose(): void { this.opened = false; this.contentEl.empty(); }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
