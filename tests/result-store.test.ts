import { describe, expect, it, vi } from 'vitest';
import type { TFile, Vault } from 'obsidian';
import { parseQuizMarkdown } from '../src/parser';
import { VaultResultStore } from '../src/result-store';
import type { QuizAttempt } from '../src/types';

const source = '# 本文\n\n```quiz\nquiz:\n  type: text\n  question: "コマンドは？"\n  answers: ["free"]\n  explanation: "メモリを確認します。"\n```\n';
const file = { path: 'original.md' } as TFile;
const attempt: QuizAttempt = { id: 'attempt-1', date: '2026-09-21T12:00:00.000Z', correct: 1, total: 1, answered: 1, accuracy: 100 };

function fakeVault(content: string) {
  let current = content;
  const process = vi.fn((_file: TFile, updater: (data: string) => string): Promise<string> => {
    try { current = updater(current); return Promise.resolve(current); }
    catch (error) { return Promise.reject(error); }
  });
  return { vault: { process } as unknown as Pick<Vault, 'process'>, process, read: () => current };
}

describe('Obsidian result storage boundary', () => {
  it('merges concurrent prose changes and stores on the captured source file once', async () => {
    const updated = `${source}\n回答中に追加した本文\n`;
    const fake = fakeVault(updated);
    const store = new VaultResultStore(fake.vault);
    const questions = parseQuizMarkdown(source).questions;
    await store.save(file, attempt, questions);
    const first = fake.read();
    await store.save(file, attempt, questions);
    expect(fake.read()).toBe(first);
    expect(first.startsWith(updated)).toBe(true);
    expect(fake.process.mock.calls[0]![0]).toBe(file);
  });

  it('refuses changed answers rather than assigning stale scores to new questions', async () => {
    const changed = source.replace('["free"]', '["df"]');
    const fake = fakeVault(changed);
    await expect(new VaultResultStore(fake.vault).save(file, attempt, parseQuizMarkdown(source).questions)).rejects.toThrow('questions changed');
    expect(fake.read()).toBe(changed);
  });

  it('refuses broken managed markers without modifying source', async () => {
    const changed = `${source}\n<!-- QUIZ_RESULTS_START -->\n`;
    const fake = fakeVault(changed);
    await expect(new VaultResultStore(fake.vault).save(file, attempt, parseQuizMarkdown(source).questions)).rejects.toThrow('markers');
    expect(fake.read()).toBe(changed);
  });

  it('propagates filesystem failures to the retry UI', async () => {
    const vault = { process: vi.fn().mockRejectedValue(new Error('disk full')) } as unknown as Pick<Vault, 'process'>;
    await expect(new VaultResultStore(vault).save(file, attempt, parseQuizMarkdown(source).questions)).rejects.toThrow('disk full');
  });
});
