import type { TFile, Vault } from 'obsidian';
import { parseQuizMarkdown, questionSignature } from './parser';
import { updateResults } from './storage';
import type { QuizAttempt, QuizQuestion } from './types';

/** The only write boundary. Re-read, validate, and update atomically in Obsidian. */
export class VaultResultStore {
  constructor(private readonly vault: Pick<Vault, 'process'>) {}

  async save(file: TFile, attempt: QuizAttempt, questions: readonly QuizQuestion[]): Promise<void> {
    const expected = questionSignature(questions);
    await this.vault.process(file, (current) => {
      const parsed = parseQuizMarkdown(current);
      if (parsed.issues.length > 0 || questionSignature(parsed.questions) !== expected) {
        throw new Error('The questions changed during this attempt. Results were not saved. Restore the original questions and retry saving, or reopen the note to start a new attempt.');
      }
      return updateResults(current, attempt);
    });
  }
}
