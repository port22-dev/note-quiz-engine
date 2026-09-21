import type {
  GradedAnswer,
  GradingOptions,
  QuizQuestion,
  QuizResponse,
  QuizScore,
} from './types';

/** Keep interior whitespace significant: these are exact-match questions. */
export function normalizeText(value: string, caseSensitive = true): string {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  return caseSensitive ? normalized : normalized.toLowerCase();
}

export function gradeAnswer(
  question: QuizQuestion,
  response: QuizResponse,
  options: GradingOptions = { caseSensitive: true },
): GradedAnswer {
  let correct: boolean;

  if (question.type === 'choice') {
    if (
      typeof response !== 'number' ||
      !Number.isInteger(response) ||
      response < 1 ||
      response > question.options.length
    ) {
      throw new Error('Choose one answer.');
    }
    correct = response === question.answer;
  } else {
    if (typeof response !== 'string' || normalizeText(response).length === 0) {
      throw new Error('Enter an answer.');
    }
    const normalized = normalizeText(response, options.caseSensitive);
    correct = question.answers.some(
      (answer) => normalizeText(answer, options.caseSensitive) === normalized,
    );
  }

  return Object.freeze({ questionId: question.id, response, correct });
}

export function calculateScore(
  total: number,
  answers: Iterable<GradedAnswer>,
): QuizScore {
  let correct = 0;
  let answered = 0;
  for (const answer of answers) {
    answered += 1;
    if (answer.correct) correct += 1;
  }
  return {
    correct,
    total,
    answered,
    accuracy: total === 0 ? 0 : Math.round((correct / total) * 10_000) / 100,
  };
}
