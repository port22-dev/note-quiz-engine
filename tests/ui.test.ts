// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { QuizModal } from '../src/ui/quiz-modal';
import { PromptModal } from '../src/ui/prompt-modal';
import type { QuizQuestion } from '../src/types';

const questions: QuizQuestion[] = [
  { id: 'one', type: 'choice', question: 'メモリ確認は？', options: ['df', 'free'], answer: 2, explanation: 'メモリはfreeで確認。', sourceLine: 1 },
  { id: 'two', type: 'text', question: 'コマンド名を入力', answers: ['free', 'free -h'], explanation: 'freeとそのオプション。', sourceLine: 10 },
];
const app = {} as App;
const file = { basename: 'Linux', path: 'Linux.md' } as TFile;

function button(text: string): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].find((node) => node.textContent === text);
  if (!result) throw new Error(`Button missing: ${text}`);
  return result;
}

function choose(value: number): void {
  const radio = document.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
  radio.click();
}

function type(value: string): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('.note-quiz-text-answer')!;
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function answerAll(): void {
  choose(2);
  button('Submit answer').click();
  button('Next').click();
  type('FREE -h');
  button('Submit answer').click();
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('quiz UI learning loop', () => {
  it('grades both types, reveals feedback, saves once, reviews and retakes', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const modal = new QuizModal(app, file, questions, { caseSensitive: false }, save);
    modal.open();
    expect(document.body.textContent).not.toContain(questions[0]!.explanation);
    expect(button('Previous').disabled).toBe(true);
    answerAll();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Results saved to your note.'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toMatchObject({ correct: 2, total: 2, accuracy: 100 });
    button('Results').click();
    expect(document.body.textContent).toContain('Accuracy 100%');
    button('✓ メモリ確認は？').click();
    expect(document.querySelector<HTMLInputElement>('input[value="2"]')!.disabled).toBe(true);
    button('Results').click();
    button('Try again').click();
    expect(document.body.textContent).toContain('Answered 0 / 2');
    answerAll();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0]![0].id).not.toBe(save.mock.calls[1]![0].id);
    modal.close();
  });

  it('keeps drafts on navigation and never saves incomplete sessions', () => {
    const save = vi.fn();
    const modal = new QuizModal(app, file, questions, { caseSensitive: true }, save);
    modal.open();
    choose(1);
    button('Next').click();
    type('draft');
    button('Previous').click();
    expect(document.querySelector<HTMLInputElement>('input[value="1"]')!.checked).toBe(true);
    button('Submit answer').click();
    expect(document.body.textContent).toContain('✗ Incorrect');
    expect(document.body.textContent).toContain('Correct answer: free');
    button('Next').click();
    expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('draft');
    modal.close();
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects missing selections and whitespace-only text', () => {
    const modal = new QuizModal(app, file, questions, { caseSensitive: true }, vi.fn());
    modal.open();
    button('Submit answer').click();
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('answer');
    button('Next').click();
    type('   \r\n');
    button('Submit answer').click();
    expect(document.querySelector('[role="alert"]')!.textContent).not.toBe('');
    expect(document.body.textContent).toContain('Answered 0 / 2');
    modal.close();
  });

  it('retries a failed save with identical attempt data', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('read only')).mockResolvedValue(undefined);
    const modal = new QuizModal(app, file, questions, { caseSensitive: false }, save);
    modal.open();
    answerAll();
    await vi.waitFor(() => expect(document.body.textContent).toContain('read only'));
    button('Results').click();
    expect(button('Try again').disabled).toBe(true);
    button('Retry saving').click();
    await vi.waitFor(() => expect(button('Try again').disabled).toBe(false));
    expect(save.mock.calls[0]![0]).toEqual(save.mock.calls[1]![0]);
    modal.close();
  });

  it('does not duplicate in-flight saves and survives closing during save', async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const modal = new QuizModal(app, file, questions, { caseSensitive: false }, save);
    modal.open();
    answerAll();
    button('Results').click();
    expect(button('Try again').disabled).toBe(true);
    modal.close();
    finish();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(document.body.children.length).toBe(0);
  });

  it('renders question contents as text, never executable HTML', () => {
    const malicious = [{ ...questions[0]!, question: '<img src=x onerror=alert(1)>' }];
    const modal = new QuizModal(app, file, malicious, { caseSensitive: true }, vi.fn());
    modal.open();
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).toContain('<img');
    modal.close();
  });
});

describe('prompt delivery', () => {
  it('copies the complete generated prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const modal = new PromptModal(app, 'source + contract');
    modal.open();
    button('Copy prompt').click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Prompt copied.'));
    expect(writeText).toHaveBeenCalledWith('source + contract');
    modal.close();
  });

  it('offers manual selection when clipboard access fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const modal = new PromptModal(app, 'manual copy');
    modal.open();
    button('Copy prompt').click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Copy the selected text manually.'));
    const textarea = document.querySelector('textarea')!;
    expect(textarea.selectionEnd).toBe('manual copy'.length);
    modal.close();
  });
});
