import { describe, expect, it } from 'vitest';
import { QuizSession } from '../src/engine';
import { gradeAnswer, normalizeText } from '../src/scoring';
import type { ChoiceQuestion, QuizQuestion, TextQuestion } from '../src/types';

const choice: ChoiceQuestion = {
  id: 'choice-1',
  type: 'choice',
  question: 'メモリを確認するコマンドは？',
  options: ['df', 'free'],
  answer: 2,
  explanation: 'freeを使う。',
  sourceLine: 1,
};
const text: TextQuestion = {
  id: 'text-1',
  type: 'text',
  question: 'メモリを確認するコマンドを答えてください。',
  answers: ['free', 'free -h', 'free -m'],
  explanation: 'freeを使う。',
  sourceLine: 10,
};

describe('grading', () => {
  it('uses one-based numeric choice answers', () => {
    expect(gradeAnswer(choice, 2).correct).toBe(true);
    expect(gradeAnswer(choice, 1).correct).toBe(false);
    for (const invalid of [0, 3, 1.5, Number.NaN, '2', '']) {
      expect(() => gradeAnswer(choice, invalid)).toThrow();
    }
  });

  it('recognizes every accepted answer and trims surrounding whitespace', () => {
    for (const answer of text.answers) {
      expect(gradeAnswer(text, ` \n${answer}\t`).correct).toBe(true);
    }
    expect(gradeAnswer(text, 'free  -h').correct).toBe(false);
    expect(gradeAnswer(text, 'freedom').correct).toBe(false);
    expect(gradeAnswer(text, 'メモリを確認します').correct).toBe(false);
    expect(() => gradeAnswer(text, '\r\n \t')).toThrow();
    expect(() => gradeAnswer(text, 2)).toThrow();
  });

  it('normalizes line endings but preserves interior whitespace', () => {
    expect(normalizeText(' \r\nfirst\r\nsecond\rthird\n ')).toBe('first\nsecond\nthird');
    expect(normalizeText('a  b')).toBe('a  b');
    const multiline: TextQuestion = { ...text, answers: ['first\nsecond'] };
    expect(gradeAnswer(multiline, 'first\r\nsecond').correct).toBe(true);
    expect(gradeAnswer(multiline, 'first second').correct).toBe(false);
  });

  it('has configurable case sensitivity', () => {
    expect(gradeAnswer(text, 'FREE').correct).toBe(false);
    expect(gradeAnswer(text, 'FREE', { caseSensitive: false }).correct).toBe(true);
    expect(gradeAnswer(text, 'FREE -H', { caseSensitive: false }).correct).toBe(true);
  });
});

describe('QuizSession', () => {
  it('scores against all questions and completes only after every question is answered', () => {
    const questions: QuizQuestion[] = [choice, text, { ...text, id: 'text-2' }];
    const session = new QuizSession(questions);
    expect(session.score).toEqual({ correct: 0, total: 3, answered: 0, accuracy: 0 });
    session.answer(2);
    expect(session.score).toEqual({ correct: 1, total: 3, answered: 1, accuracy: 33.33 });
    session.goTo(2);
    session.answer('wrong');
    expect(session.complete).toBe(false);
    session.previous();
    session.answer('free -h');
    expect(session.complete).toBe(true);
    expect(session.score).toEqual({ correct: 2, total: 3, answered: 3, accuracy: 66.67 });
  });

  it('keeps answers when navigating and never regrades a submitted question', () => {
    const session = new QuizSession([choice, text]);
    const first = session.answer(1);
    session.next();
    expect(session.currentQuestion.id).toBe('text-1');
    expect(session.currentAnswer).toBeUndefined();
    session.answer('free');
    session.previous();
    expect(session.currentAnswer).toBe(first);
    expect(session.answer(2)).toBe(first);
    expect(session.score.correct).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('does not count missing or invalid responses as attempted answers', () => {
    const session = new QuizSession([choice, text]);
    expect(() => session.answer(0)).toThrow();
    session.next();
    expect(() => session.answer(' ')).toThrow();
    expect(session.score.answered).toBe(0);
    expect(session.complete).toBe(false);
  });

  it('bounds navigation and clears the complete attempt on restart', () => {
    const session = new QuizSession([choice, text]);
    session.previous();
    expect(session.currentIndex).toBe(0);
    session.answer(2);
    session.next();
    session.next();
    expect(session.currentIndex).toBe(1);
    session.answer('free');
    for (const invalid of [-1, 2, 0.5, Number.NaN]) {
      expect(() => session.goTo(invalid)).toThrow(RangeError);
    }
    session.restart();
    expect(session.currentIndex).toBe(0);
    expect(session.getAnswer(0)).toBeUndefined();
    expect(session.getAnswer(1)).toBeUndefined();
    expect(session.complete).toBe(false);
    expect(session.score.answered).toBe(0);
    expect(session.answer(1).correct).toBe(false);
  });

  it('snapshots definitions and grading settings for the entire attempt', () => {
    const source: QuizQuestion[] = [
      { ...choice, options: [...choice.options], tags: ['Linux'] },
      { ...text, answers: [...text.answers] },
    ];
    const settings = { caseSensitive: false };
    const session = new QuizSession(source, settings);
    settings.caseSensitive = true;
    source[0]!.question = 'edited';
    source[0]!.tags!.push('edited');
    source.splice(0, 1);
    expect(session.questions).toHaveLength(2);
    expect(session.currentQuestion.question).toBe(choice.question);
    expect(session.currentQuestion.tags).toEqual(['Linux']);
    expect(Object.isFrozen(session.questions)).toBe(true);
    session.next();
    expect(session.answer('FREE').correct).toBe(true);
  });

  it('requires at least one question', () => {
    expect(() => new QuizSession([])).toThrow();
  });
});
