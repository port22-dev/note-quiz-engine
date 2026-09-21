import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuizMarkdown, questionSignature } from '../src/parser';

const choice = `quiz:
  type: choice
  question: メモリ使用状況を確認するコマンドは？
  options:
    - df
    - free
  answer: 2
  explanation: freeでメモリ使用状況を確認する。
`;

const text = `quiz:
  type: text
  question: メモリ使用状況を確認するコマンドを答えてください。
  answers:
    - free
    - free -h
    - free -m
  explanation: freeコマンドを使用する。
`;

function fence(content: string, language = 'quiz'): string {
  return `\`\`\`${language}\n${content}\`\`\`\n`;
}

describe('parseQuizMarkdown', () => {
  it('parses the bundled Linux practice note', () => {
    const markdown = readFileSync(new URL('../examples/Linux-study.md', import.meta.url), 'utf8');
    const result = parseQuizMarkdown(markdown);
    expect(result.issues).toEqual([]);
    expect(result.questions.map((question) => question.type)).toEqual([
      'choice', 'text', 'choice', 'text', 'choice',
    ]);
  });

  it('reads several fenced questions, one-based answers, and their source lines', () => {
    const result = parseQuizMarkdown(`# 学習\n\n${fence(choice)}\n${fence(text)}`);
    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toMatchObject({
      id: 'question-1',
      type: 'choice',
      sourceLine: 4,
      options: ['df', 'free'],
      answer: 2,
    });
    expect(result.questions[1]).toMatchObject({
      id: 'question-2',
      type: 'text',
      answers: ['free', 'free -h', 'free -m'],
    });
  });

  it('supports hand-written unfenced definitions and ordinary prose boundaries', () => {
    const result = parseQuizMarkdown(`# 問題集\n\n${choice}\n## 次の問題\n\n${text}\n学習メモ`);
    expect(result.issues).toEqual([]);
    expect(result.questions.map((question) => question.type)).toEqual(['choice', 'text']);
    expect(result.questions[0]?.sourceLine).toBe(3);
  });

  it('supports YAML fences and tilde fences without treating other YAML as quizzes', () => {
    const result = parseQuizMarkdown(
      `${fence('theme: dark\n', 'yaml')}${fence(choice, 'yaml')}~~~yml\n${text}~~~`,
    );
    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(2);
  });

  it('supports fences indented by up to three spaces', () => {
    const markdown = fence(choice, 'yaml').split('\n').map((line) => `  ${line}`).join('\n');
    const result = parseQuizMarkdown(markdown);
    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.question).toBe('メモリ使用状況を確認するコマンドは？');
  });

  it('does not treat inline triple-backtick prose as an opening fence', () => {
    const result = parseQuizMarkdown('```quiz``` is the language name.\n' + fence(choice));
    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });

  it('keeps HTML-looking fence info and contents literal', () => {
    const result = parseQuizMarkdown('```text <!--\n<!--\n```\n' + fence(text));
    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });

  it('ignores frontmatter, comments, code examples, and the managed results section', () => {
    const markdown = [
      '---', choice, '---',
      '<!--', fence(choice), '-->',
      '````markdown', fence(choice), '````',
      '```text', choice, '```',
      '<!-- QUIZ_RESULTS_START -->', choice, fence(text), '<!-- QUIZ_RESULTS_END -->',
      fence(text),
    ].join('\n');
    const result = parseQuizMarkdown(markdown);
    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.type).toBe('text');
  });

  it('does not mistake inline result marker documentation for a managed region', () => {
    const result = parseQuizMarkdown('Results use `<!-- QUIZ_RESULTS_START -->`.\n' + fence(choice));
    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });

  it('does not start a managed results region at indented marker examples', () => {
    const result = parseQuizMarkdown('    <!-- QUIZ_RESULTS_START -->\n\n' + fence(choice));
    expect(result.issues).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });

  it('accepts BOM, Windows newlines, literal strings, and optional metadata', () => {
    const definition = `quiz:
  id: memory-command
  type: text
  question: |
    メモリ不足が疑われます。
    最初に何を確認しますか？
  answers: [free, free -h]
  explanation: "メモリ: 使用状況を確認する。"
  difficulty: applied
  tags: [Linux, 運用]
`;
    const result = parseQuizMarkdown(`\uFEFF${fence(definition)}`.replace(/\n/g, '\r\n'));
    expect(result.issues).toEqual([]);
    expect(result.questions[0]).toMatchObject({
      id: 'memory-command',
      question: 'メモリ不足が疑われます。\n最初に何を確認しますか？',
      difficulty: 'applied',
      tags: ['Linux', '運用'],
    });
  });

  it.each([
    ['unknown type', choice.replace('type: choice', 'type: multi')],
    ['zero answer', choice.replace('answer: 2', 'answer: 0')],
    ['out-of-range answer', choice.replace('answer: 2', 'answer: 3')],
    ['non-integer answer', choice.replace('answer: 2', 'answer: 1.5')],
    ['string answer', choice.replace('answer: 2', 'answer: "2"')],
    ['numeric choice', choice.replace('- df', '- 123')],
    ['blank question', choice.replace('question: メモリ使用状況を確認するコマンドは？', 'question: "  "')],
    ['missing explanation', choice.replace('  explanation: freeでメモリ使用状況を確認する。\n', '')],
    ['blank accepted answer', text.replace('- free -h', '- "  "')],
    ['non-string accepted answer', text.replace('- free -h', '- 42')],
    ['empty accepted answers', text.replace('answers:\n    - free\n    - free -h\n    - free -m', 'answers: []')],
    ['bad tags', choice.replace('  type:', '  tags: Linux\n  type:')],
    ['bad id', choice.replace('  type:', '  id: 42\n  type:')],
    ['bad difficulty', choice.replace('  type:', '  difficulty: []\n  type:')],
  ])('reports %s and preserves other valid questions', (_name, invalid) => {
    const result = parseQuizMarkdown(`${fence(invalid)}${fence(text)}`);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.line).toBeGreaterThanOrEqual(2);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.type).toBe('text');
  });

  it('reports malformed YAML at its original source line', () => {
    const result = parseQuizMarkdown('# Title\n\n```quiz\nquiz:\n  type: choice\n  question: [broken\n```');
    expect(result.questions).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.line).toBeGreaterThanOrEqual(6);
  });

  it('rejects duplicate YAML keys and duplicate explicit or generated question IDs', () => {
    expect(parseQuizMarkdown(fence(choice + '  answer: 1\n')).issues.length).toBeGreaterThan(0);
    const withId = choice.replace('  type:', '  id: same\n  type:');
    const result = parseQuizMarkdown(fence(withId) + fence(withId));
    expect(result.questions).toHaveLength(1);
    expect(result.issues[0]?.message).toContain('Duplicate');
    const autoCollision = parseQuizMarkdown(fence(choice) + fence(text.replace('  type:', '  id: question-1\n  type:')));
    expect(autoCollision.issues[0]?.message).toContain('Duplicate');
  });

  it('rejects aliases and custom YAML tags', () => {
    const aliased = text.replace('  question:', '  question: &shared').replace(
      'explanation: freeコマンドを使用する。',
      'explanation: *shared',
    );
    const tagged = text.replace('question:', 'question: !custom');
    for (const definition of [aliased, tagged]) {
      const result = parseQuizMarkdown(fence(definition));
      expect(result.questions).toEqual([]);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects missing quiz roots and unclosed quiz fences', () => {
    expect(parseQuizMarkdown(fence('type: choice\n')).issues[0]?.message).toContain('quiz:');
    const result = parseQuizMarkdown('```quiz\n' + choice);
    expect(result.questions).toEqual([]);
    expect(result.issues[0]?.message).toContain('not closed');
  });
});

describe('questionSignature', () => {
  it('ignores prose and line shifts, but detects definition and order changes', () => {
    const markdown = fence(choice) + fence(text);
    const original = questionSignature(parseQuizMarkdown(markdown).questions);
    expect(questionSignature(parseQuizMarkdown('# Note\n\n' + markdown).questions)).toBe(original);
    expect(questionSignature(parseQuizMarkdown(markdown + '\nOrdinary note').questions)).toBe(original);
    expect(questionSignature(parseQuizMarkdown(markdown.replace('answer: 2', 'answer: 1')).questions)).not.toBe(original);
    expect(questionSignature(parseQuizMarkdown(fence(text) + fence(choice)).questions)).not.toBe(original);
    expect(questionSignature(parseQuizMarkdown(markdown.replace('free -m', 'free -g')).questions)).not.toBe(original);
  });
});
