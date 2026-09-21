import { describe, expect, it } from 'vitest';
import { RESULTS_END, RESULTS_START, ResultStorageError, stripResults, updateResults } from '../src/storage';
import type { QuizAttempt } from '../src/types';

const attempt: QuizAttempt = {
  id: 'attempt-1', date: '2026-09-21 12:30', correct: 8, total: 10, answered: 10, accuracy: 80,
};
const second: QuizAttempt = { ...attempt, id: 'attempt-2', date: '2026-09-22T13:15:00.000Z', correct: 9, accuracy: 90 };

describe('Markdown result storage', () => {
  it('appends readable latest scores, full history and machine data at the bottom', () => {
    const source = '# My note\n\n```quiz\nquiz: {}\n```';
    const output = updateResults(source, attempt);
    expect(output.startsWith(source + '\n\n' + RESULTS_START)).toBe(true);
    expect(output).toContain('- Score: 8 / 10\n- Accuracy: 80%\n- Last Attempt: 2026-09-21 12:30');
    expect(output).toContain('| 2026-09-21 12:30 | 8 / 10 | 80% |');
    expect(output).toContain('"id":"attempt-1"');
    expect(output.endsWith(RESULTS_END + '\n')).toBe(true);
  });

  it('retains history and replaces the block when saving another complete attempt', () => {
    const output = updateResults(updateResults('# Note\n', attempt), second);
    expect(output.split(RESULTS_START)).toHaveLength(2);
    expect(output).toContain('- Score: 9 / 10');
    expect(output).toContain('| 2026-09-21 12:30 | 8 / 10 | 80% |');
    expect(output).toContain('| 2026-09-22T13:15:00.000Z | 9 / 10 | 90% |');
  });

  it('makes retrying an existing attempt exactly idempotent, even after a later attempt', () => {
    const once = updateResults('# Note', attempt);
    expect(updateResults(once, attempt)).toBe(once);
    const twice = updateResults(once, second);
    expect(updateResults(twice, attempt)).toBe(twice);
    expect(() => updateResults(twice, { ...attempt, correct: 5, accuracy: 50 })).toThrow(ResultStorageError);
  });

  it('preserves every surrounding byte and uses CRLF inside a CRLF note', () => {
    const before = '\uFEFF# Note  \r\n\r\nSome content\r\n';
    const saved = updateResults(before, attempt);
    const tail = '\r\n\r\n## User additions\nThis must remain byte-for-byte.  \r\n';
    const source = saved + tail;
    const changed = updateResults(source, second);
    const startIndex = source.indexOf(RESULTS_START);
    const endIndex = source.indexOf(RESULTS_END) + RESULTS_END.length;
    expect(changed.slice(0, startIndex)).toBe(source.slice(0, startIndex));
    expect(changed.slice(changed.indexOf(RESULTS_END) + RESULTS_END.length)).toBe(source.slice(endIndex));
    expect(changed.slice(startIndex, changed.indexOf(RESULTS_END))).not.toMatch(/(?<!\r)\n/);
  });

  it.each(['\n', '\r\n', '\r'])('separates the first results section with a blank line for %j', eol => {
    const once = updateResults('# Source' + eol, attempt);
    const twice = updateResults('# Source' + eol + eol, attempt);
    expect(once.startsWith('# Source' + eol + eol + RESULTS_START)).toBe(true);
    expect(twice.startsWith('# Source' + eol + eol + RESULTS_START)).toBe(true);
  });

  it('strips just the managed span and leaves other content unchanged', () => {
    const source = '  before\r\n' + RESULTS_START + '\r\nanything\r\n' + RESULTS_END + '  \nAfter\n';
    expect(stripResults(source)).toBe('  before\r\n  \nAfter\n');
    expect(stripResults('# No results\r\n')).toBe('# No results\r\n');
  });

  it.each(['```markdown', '~~~~markdown'])('ignores example markers inside %s fences', opening => {
    const closing = opening.startsWith('`') ? '````' : '~~~~~';
    const source = `${opening}\n${RESULTS_START}\n${RESULTS_END}\n${closing}\n`;
    expect(stripResults(source)).toBe(source);
    const saved = updateResults(source, attempt);
    const again = updateResults(saved, second);
    expect(again.startsWith(source)).toBe(true);
    expect(again.split(RESULTS_START)).toHaveLength(3);
  });

  it('does not treat shorter or mismatched fences as closing', () => {
    const source = `\`\`\`\`markdown\n\`\`\`\n${RESULTS_START}\n~~~\n${RESULTS_END}\n\`\`\`\`\n`;
    expect(stripResults(source)).toBe(source);
  });

  it('preserves frontmatter marker examples instead of updating or stripping their content', () => {
    const source = `---\nexample: |\n  ${RESULTS_START}\n  example history\n  ${RESULTS_END}\n---\n# Note\n`;
    expect(stripResults(source)).toBe(source);
    const saved = updateResults(source, attempt);
    expect(saved.startsWith(source)).toBe(true);
    expect(updateResults(saved, second).startsWith(source)).toBe(true);
    expect(stripResults(saved).startsWith(source)).toBe(true);
  });

  it('ignores fence-looking text in ordinary HTML comments', () => {
    const source = '<!--\n``` This is only a comment.\n-->\n# Note';
    expect(stripResults(source)).toBe(source);
    expect(updateResults(source, attempt).startsWith(source)).toBe(true);
  });

  it.each([
    RESULTS_START,
    RESULTS_END,
    `${RESULTS_END}\n${RESULTS_START}`,
    `${RESULTS_START}\n${RESULTS_START}\n${RESULTS_END}`,
    `${RESULTS_START}\n${RESULTS_END}\n${RESULTS_START}\n${RESULTS_END}`,
    `text ${RESULTS_START}\n${RESULTS_END}`,
    '<!-- QUIZ_RESULTS_START --> and <!-- QUIZ_RESULTS_END -->',
    '<!-- QUIZ_RESULTS_START >',
    '```quiz\nquiz: {}',
    `quiz:\n  explanation: |\n    ${RESULTS_START}\n    Answer explanation\n    ${RESULTS_END}`,
    `<!-- hidden example\n${RESULTS_START}\n${RESULTS_END}\n-->`,
    '---\nproperty: frontmatter never closes',
    '<!-- comment never closes',
  ])('refuses malformed or ambiguous regions without touching the source: %s', source => {
    expect(() => updateResults(source, attempt)).toThrow(ResultStorageError);
    expect(() => stripResults(source)).toThrow(ResultStorageError);
  });

  it('refuses legacy tables without metadata instead of discarding their history', () => {
    const old = `${RESULTS_START}\n## Quiz Results\n| Date | Score | Accuracy |\n|---|---:|---:|\n| 2026-09-20 20:15 | 6 / 10 | 60% |\n${RESULTS_END}`;
    expect(() => updateResults(old, attempt)).toThrow(/metadata/);
    expect(stripResults(old)).toBe('');
  });

  it.each([
    (saved: string) => saved.replace('"version":1', '"version":2'),
    (saved: string) => saved.replace('"version":1', '"version":'),
    (saved: string) => saved.replace('"accuracy":80', '"accuracy":40'),
    (saved: string) => saved.replace('- Score: 8 / 10', '- Score: 2 / 10'),
    (saved: string) => saved.replace(RESULTS_END, 'My extra writing\n' + RESULTS_END),
    (saved: string) => saved.replace('"attempts":[', '"attempts":[' + JSON.stringify(attempt) + ','),
    (saved: string) => saved.replace('<!-- QUIZ_RESULTS_DATA: ', '<!-- damaged data: '),
  ])('refuses corrupted or manually edited histories', corrupt => {
    const saved = corrupt(updateResults('# Note', attempt));
    expect(() => updateResults(saved, second)).toThrow(ResultStorageError);
  });

  it.each([
    { answered: 9 }, { total: 0 }, { correct: -1 }, { correct: 11 }, { total: 10.5 },
    { accuracy: NaN }, { accuracy: 79 }, { id: 'unsafe|id' }, { id: '' },
    { date: '2026-02-30 12:30' }, { date: '2026-09-21 25:00' },
    { date: '2026-09-21 12:60' }, { date: '2026-09-21T12:30:00+14:30' },
    { date: 'hello\n| fake history |' },
  ])('refuses invalid/incomplete attempts %j', invalid => {
    expect(() => updateResults('unchanged', { ...attempt, ...invalid })).toThrow(ResultStorageError);
  });

  it('accepts fractional accuracies and rounds the human-readable percentage to two places', () => {
    const partial = { ...attempt, total: 3, answered: 3, correct: 2, accuracy: (2 / 3) * 100 };
    const output = updateResults('', partial);
    expect(output.startsWith(RESULTS_START)).toBe(true);
    expect(output).toContain('- Accuracy: 66.67%');
    expect(updateResults(output, partial)).toBe(output);
  });
});
