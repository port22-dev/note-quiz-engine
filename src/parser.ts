import { LineCounter, parseDocument } from 'yaml';
import { normalizeText } from './scoring';
import type { ParseIssue, ParseResult, QuizQuestion, QuestionBase } from './types';

interface QuizBlock {
  text: string;
  line: number;
}

interface ScanResult {
  blocks: QuizBlock[];
  issues: ParseIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && normalizeText(value).length > 0;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonemptyString);
}

/** Extract only executable quiz definitions, keeping their original line numbers. */
function scanMarkdown(markdown: string): ScanResult {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: QuizBlock[] = [];
  const issues: ParseIssue[] = [];
  let index = 0;
  let inComment = false;
  let inResults = false;

  if (lines[0]?.trim() === '---') {
    index = 1;
    while (index < lines.length && !/^(---|\.\.\.)\s*$/.test(lines[index]!)) index += 1;
    index += 1;
  }

  while (index < lines.length) {
    const line = lines[index]!;
    if (inResults) {
      if (line.trimEnd() === '<!-- QUIZ_RESULTS_END -->') inResults = false;
      index += 1;
      continue;
    }
    if (line.trimEnd() === '<!-- QUIZ_RESULTS_START -->' && !inComment) {
      inResults = true;
      index += 1;
      continue;
    }

    // Fence contents and info strings are literal; do not interpret HTML inside them.
    const fence = !inComment ? /^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/.exec(line) : null;
    if (fence && !(fence[2]![0] === '`' && fence[3]!.includes('`'))) {
      const indentation = fence[1]!.length;
      const marker = fence[2]!;
      const language = fence[3]!.trim().toLowerCase();
      const start = index + 1;
      index += 1;
      const closing = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`);
      while (index < lines.length && !closing.test(lines[index]!)) index += 1;
      const indentationPattern = new RegExp(`^ {0,${indentation}}`);
      const text = lines.slice(start, index)
        .map((contentLine) => contentLine.replace(indentationPattern, ''))
        .join('\n');
      const isQuiz =
        language === 'quiz' ||
        ((language === 'yaml' || language === 'yml') && /^quiz\s*:/m.test(text));
      if (isQuiz) {
        if (index === lines.length) {
          issues.push({ line: start, message: 'The quiz code block is not closed.' });
        } else {
          blocks.push({ text, line: start + 1 });
        }
      }
      index += 1;
      continue;
    }

    // HTML comments are prose, including fenced examples enclosed by a comment.
    let visible = '';
    let cursor = 0;
    while (cursor < line.length) {
      if (inComment) {
        const end = line.indexOf('-->', cursor);
        if (end < 0) break;
        cursor = end + 3;
        inComment = false;
      } else {
        const start = line.indexOf('<!--', cursor);
        if (start < 0) {
          visible += line.slice(cursor);
          break;
        }
        visible += line.slice(cursor, start);
        cursor = start + 4;
        inComment = true;
      }
    }

    if (/^quiz\s*:/.test(visible) && visible === line) {
      const start = index;
      index += 1;
      while (index < lines.length) {
        const next = lines[index]!;
        if (/^\S/.test(next) && !/^#(?!#)/.test(next)) break;
        // A Markdown heading is a boundary; YAML comments need not be consumed.
        if (/^#{1,6}\s/.test(next)) break;
        index += 1;
      }
      blocks.push({ text: lines.slice(start, index).join('\n'), line: start + 1 });
      continue;
    }
    index += 1;
  }

  return { blocks, issues };
}

function readQuestion(value: unknown, line: number, ordinal: number): QuizQuestion {
  if (!isRecord(value) || !isRecord(value.quiz)) {
    throw new Error('Add a quiz: root containing the question definition.');
  }
  const quiz = value.quiz;
  if (quiz.type !== 'choice' && quiz.type !== 'text') {
    throw new Error('type must be choice or text.');
  }
  if (!nonemptyString(quiz.question)) throw new Error('question must be a nonempty string.');
  if (!nonemptyString(quiz.explanation)) {
    throw new Error('explanation must be a nonempty string.');
  }
  if (quiz.id !== undefined && !nonemptyString(quiz.id)) {
    throw new Error('id must be a nonempty string.');
  }
  if (quiz.difficulty !== undefined && !nonemptyString(quiz.difficulty)) {
    throw new Error('difficulty must be a nonempty string.');
  }
  if (
    quiz.tags !== undefined &&
    (!Array.isArray(quiz.tags) || !quiz.tags.every(nonemptyString))
  ) {
    throw new Error('tags must be a list of nonempty strings.');
  }

  const common: QuestionBase = {
    id: typeof quiz.id === 'string' ? quiz.id.trim() : `question-${ordinal}`,
    question: quiz.question.trim(),
    explanation: quiz.explanation.trim(),
    sourceLine: line,
  };
  if (typeof quiz.difficulty === 'string') common.difficulty = quiz.difficulty.trim();
  if (Array.isArray(quiz.tags)) common.tags = quiz.tags.map((tag: string) => tag.trim());

  if (quiz.type === 'choice') {
    if (!stringList(quiz.options) || quiz.options.length < 2) {
      throw new Error('options must contain at least two nonempty strings.');
    }
    if (
      typeof quiz.answer !== 'number' ||
      !Number.isInteger(quiz.answer) ||
      quiz.answer < 1 ||
      quiz.answer > quiz.options.length
    ) {
      throw new Error('answer must be an integer from 1 to the number of options.');
    }
    return { ...common, type: 'choice', options: quiz.options, answer: quiz.answer };
  }
  if (!stringList(quiz.answers)) {
    throw new Error('answers must contain at least one nonempty string.');
  }
  return { ...common, type: 'text', answers: quiz.answers };
}

export function parseQuizMarkdown(markdown: string): ParseResult {
  const { blocks, issues } = scanMarkdown(markdown);
  const questions: QuizQuestion[] = [];
  const ids = new Set<string>();

  blocks.forEach((block, index) => {
    try {
      const lineCounter = new LineCounter();
      const document = parseDocument(block.text, {
        lineCounter,
        schema: 'core',
        strict: true,
        uniqueKeys: true,
      });
      if (document.errors.length > 0) {
        for (const error of document.errors) {
          const position = lineCounter.linePos(error.pos[0]);
          issues.push({
            line: block.line + position.line - 1,
            message: `YAML syntax error: ${error.message.split('\n')[0]}`,
          });
        }
        return;
      }
      if (document.warnings.length > 0) {
        throw new Error('Custom YAML tags and unsupported YAML features are not allowed.');
      }
      // Aliases are unnecessary in this format and may expand untrusted input.
      const value: unknown = document.toJS({ maxAliasCount: 0 });
      const question = readQuestion(value, block.line, index + 1);
      if (ids.has(question.id)) throw new Error(`Duplicate question id: "${question.id}".`);
      ids.add(question.id);
      questions.push(question);
    } catch (error) {
      issues.push({
        line: block.line,
        message: error instanceof Error ? error.message : 'Could not read the question definition.',
      });
    }
  });

  issues.sort((left, right) => left.line - right.line);
  return { questions, issues };
}

/** Compare definitions exactly, ignoring line shifts caused by ordinary note edits. */
export function questionSignature(questions: readonly QuizQuestion[]): string {
  return JSON.stringify(
    questions.map((question) => ({
      id: question.id,
      type: question.type,
      question: question.question,
      explanation: question.explanation,
      difficulty: question.difficulty,
      tags: question.tags,
      ...(question.type === 'choice'
        ? { options: question.options, answer: question.answer }
        : { answers: question.answers }),
    })),
  );
}
