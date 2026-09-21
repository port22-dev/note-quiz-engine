export interface QuestionBase {
  id: string;
  question: string;
  explanation: string;
  sourceLine: number;
  difficulty?: string;
  tags?: string[];
}

export interface ChoiceQuestion extends QuestionBase {
  type: 'choice';
  options: string[];
  /** One-based, matching the Markdown format. */
  answer: number;
}

export interface TextQuestion extends QuestionBase {
  type: 'text';
  answers: string[];
}

export type QuizQuestion = ChoiceQuestion | TextQuestion;
export type QuizResponse = number | string;

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseResult {
  questions: QuizQuestion[];
  issues: ParseIssue[];
}

export interface GradingOptions {
  caseSensitive: boolean;
}

export interface GradedAnswer {
  questionId: string;
  response: QuizResponse;
  correct: boolean;
}

export interface QuizScore {
  correct: number;
  total: number;
  answered: number;
  accuracy: number;
}

export interface QuizAttempt extends QuizScore {
  id: string;
  date: string;
}
