import { calculateScore, gradeAnswer } from './scoring';
import type {
  GradedAnswer,
  GradingOptions,
  QuizQuestion,
  QuizResponse,
  QuizScore,
} from './types';

/** A session holds a snapshot of its definitions and grading settings. */
export class QuizSession {
  readonly questions: readonly QuizQuestion[];
  private readonly options: GradingOptions;
  private readonly answers = new Map<number, GradedAnswer>();
  private index = 0;

  constructor(
    questions: readonly QuizQuestion[],
    options: GradingOptions = { caseSensitive: true },
  ) {
    if (questions.length === 0) throw new Error('No questions found.');
    this.questions = Object.freeze(
      questions.map((question) => {
        const snapshot: QuizQuestion =
          question.type === 'choice'
            ? { ...question, options: [...question.options] }
            : { ...question, answers: [...question.answers] };
        if (snapshot.tags) {
          snapshot.tags = [...snapshot.tags];
          Object.freeze(snapshot.tags);
        }
        Object.freeze(snapshot.type === 'choice' ? snapshot.options : snapshot.answers);
        return Object.freeze(snapshot);
      }),
    );
    this.options = { ...options };
  }

  get currentIndex(): number {
    return this.index;
  }

  get currentQuestion(): QuizQuestion {
    return this.questions[this.index]!;
  }

  get currentAnswer(): GradedAnswer | undefined {
    return this.getAnswer(this.index);
  }

  get score(): QuizScore {
    return calculateScore(this.questions.length, this.answers.values());
  }

  get complete(): boolean {
    return this.answers.size === this.questions.length;
  }

  getAnswer(index: number): GradedAnswer | undefined {
    return this.answers.get(index);
  }

  answer(response: QuizResponse): GradedAnswer {
    const existing = this.currentAnswer;
    if (existing) return existing;
    const graded = gradeAnswer(this.currentQuestion, response, this.options);
    this.answers.set(this.index, graded);
    return graded;
  }

  next(): void {
    this.index = Math.min(this.index + 1, this.questions.length - 1);
  }

  previous(): void {
    this.index = Math.max(this.index - 1, 0);
  }

  goTo(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.questions.length) {
      throw new RangeError('Question number is out of range.');
    }
    this.index = index;
  }

  restart(): void {
    this.answers.clear();
    this.index = 0;
  }
}
