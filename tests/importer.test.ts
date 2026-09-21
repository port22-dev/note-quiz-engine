import { describe, expect, it } from 'vitest';
import { normalizeGeneratedQuiz, planClipboardQuizImport } from '../src/importer';
import { parseQuizMarkdown } from '../src/parser';
import { buildQuizPrompt, DEFAULT_PROMPT_TEMPLATE } from '../src/prompt';

const quiz = '```quiz\nquiz:\n  type: text\n  question: "答えは？"\n  answers: ["answer"]\n  explanation: "説明"\n```';

describe('clipboard quiz import', () => {
  it('validates output and creates a safe dated path', () => {
    const plan = planClipboardQuizImport(quiz, '学習ノート.md', new Set(), new Date('2026-09-21T12:30:00.000Z'));
    expect(plan.folderPath).toBe('Quizzes');
    expect(plan.filePath).toBe('Quizzes/学習ノート-2026-09-21T12-30-00-000Z.md');
    expect(plan.questionCount).toBe(1);
    expect(plan.content.endsWith('\n')).toBe(true);
  });

  it('avoids collisions and rejects prose without quiz blocks', () => {
    const existing = new Set(['Quizzes/学習ノート-2026-09-21T12-30-00-000Z.md']);
    const plan = planClipboardQuizImport(quiz, '学習ノート.md', existing, new Date('2026-09-21T12:30:00.000Z'));
    expect(plan.filePath.endsWith('-2.md')).toBe(true);
    expect(() => planClipboardQuizImport('問題はありません', 'x.md', new Set())).toThrow('quiz format');
  });

  it('rejects malformed generated blocks before writing', () => {
    expect(() => planClipboardQuizImport('```quiz\nquiz:\n  type: choice\n```', 'x.md', new Set())).toThrow('format');
  });

  it('extracts quiz blocks nested inside an outer Markdown fence', () => {
    const wrapped = `\`\`\`markdown\nAIの説明です。\n${quiz}\n\`\`\``;
    const plan = planClipboardQuizImport(wrapped, 'wrapped.md', new Set(), new Date('2026-09-21T12:30:00.000Z'));
    expect(plan.questionCount).toBe(1);
    expect(plan.content.startsWith('```note-quiz')).toBe(true);
  });

  it('bounds filenames and removes control characters and path separators', () => {
    const plan = planClipboardQuizImport(quiz, `../bad\u0000/name${'x'.repeat(300)}.md`, new Set(), new Date('2026-09-21T12:30:00.000Z'));
    expect(plan.filePath.split('/')).toHaveLength(2);
    expect(plan.filePath).not.toContain('\u0000');
    expect(plan.filePath.split('/')[1]!.length).toBeLessThan(140);
  });
});

describe('generated quiz normalization', () => {
  it('accepts bare YAML copied from a rendered answer, including shared indentation', () => {
    const body = quiz.split('\n').slice(1, -1).join('\n');
    const indented = body.split('\n').map((line) => `    ${line}`).join('\n');
    const normalized = normalizeGeneratedQuiz(`問題を作りました。\n${indented}\n\n次の問題です。\n${indented}`);
    expect(normalized.questionCount).toBe(2);
    expect(parseQuizMarkdown(normalized.content).issues).toEqual([]);
    expect(normalized.content).not.toContain('問題を作りました');
  });

  it.each(['markdown', 'text', 'plaintext', ''])('unwraps the complete %s response with multiple questions', (language) => {
    const normalized = normalizeGeneratedQuiz(`\`\`\`\`${language}\n説明です。\n${quiz}\n\n${quiz}\n\`\`\`\``);
    expect(normalized.questionCount).toBe(2);
    expect(parseQuizMarkdown(normalized.content).questions).toHaveLength(2);
  });

  it('handles CRLF, a BOM, indented fences, and YAML language names', () => {
    const input = `\uFEFF説明です。\r\n${quiz.replace('```quiz', '```yaml').split('\n').map((line) => `    ${line}`).join('\r\n')}`;
    expect(normalizeGeneratedQuiz(input).questionCount).toBe(1);
  });

  it('preserves metadata, one-based answers, exact strings, and multiline content on round trip', () => {
    const input = [
      '~~~quiz',
      'quiz:',
      '  id: "network-1"',
      '  type: choice',
      '  question: "正しいコマンドは？"',
      '  options: ["true", "42", "free -h"]',
      '  answer: 3',
      '  difficulty: "応用"',
      '  tags: ["Linux", "memory"]',
      '  explanation: |',
      '    例:',
      '    ```shell',
      '    free -h',
      '    ```',
      '~~~',
    ].join('\n');
    const normalized = normalizeGeneratedQuiz(input);
    const parsed = parseQuizMarkdown(normalized.content);
    expect(parsed.issues).toEqual([]);
    expect(parsed.questions[0]).toMatchObject({
      id: 'network-1', type: 'choice', question: '正しいコマンドは？',
      options: ['true', '42', 'free -h'], answer: 3, difficulty: '応用', tags: ['Linux', 'memory'],
    });
    expect(parsed.questions[0]!.explanation).toContain('```shell\nfree -h\n```');
    expect(normalizeGeneratedQuiz(normalized.content)).toEqual(normalized);
  });

  it.each([
    '```quiz\nquiz:\n  type: text\n```',
    '```quiz\nquiz:\n  type: text',
    '    quiz:\n      type: text',
    '```yaml\nquestion: "ルートがありません"\n```',
    '```json\nquiz:\n  type: text\n```',
  ])('rejects a malformed trailing definition without saving the valid prefix: %s', (trailing) => {
    expect(() => normalizeGeneratedQuiz(`${quiz}\n\n${trailing}`)).toThrow('format');
  });

  it('rejects an incomplete nested quiz block inside a response wrapper', () => {
    expect(() => normalizeGeneratedQuiz(`\`\`\`\`markdown\n${quiz}\n\`\`\`quiz\nquiz:\n  type: text\n\`\`\`\``)).toThrow('format');
  });

  it('rejects duplicate question ids across blocks', () => {
    const identified = quiz.replace('  type:', '  id: same\n  type:');
    expect(() => normalizeGeneratedQuiz(`${identified}\n${identified}`)).toThrow('Duplicate');
  });

  it.each(['', '   ', '問題を作れませんでした。'])('rejects output without questions', (input) => {
    expect(() => normalizeGeneratedQuiz(input)).toThrow('quiz format');
  });

  it('rejects copied prompt examples, even when real questions are also present', () => {
    const prompt = buildQuizPrompt({
      template: DEFAULT_PROMPT_TEMPLATE, noteTitle: '学習ノート', notePath: '学習ノート.md',
      noteContent: 'Linuxのノート', questionCount: 2, generationId: 'attempt-1', generationLanguage: 'ja',
    });
    expect(() => normalizeGeneratedQuiz(`${quiz}\n${prompt}`)).toThrow('prompt examples');
  });

  it.each([
    '参照資料にある用語を答えてください。',
    '参照資料に示された原因から、適切な対処を選んでください。',
  ])('still rejects legacy Japanese prompt examples: %s', (question) => {
    expect(() => normalizeGeneratedQuiz(quiz.replace('答えは？', question))).toThrow('prompt examples');
  });

  it('uses the configured output folder, including legacy Japanese paths', () => {
    const plan = planClipboardQuizImport(quiz, '学習ノート', new Set(), new Date('2026-09-21T12:30:00.000Z'), '過去問題集');
    expect(plan.folderPath).toBe('過去問題集');
    expect(plan.filePath).toBe('過去問題集/学習ノート-2026-09-21T12-30-00-000Z.md');
  });
});
