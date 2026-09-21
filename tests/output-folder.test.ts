import { describe, expect, it } from 'vitest';
import { DEFAULT_QUIZ_FOLDER, LEGACY_QUIZ_FOLDER, normalizeQuizFolder } from '../src/output-folder';

describe('quiz output folders', () => {
  it('provides an English default while retaining the previous folder for migration', () => {
    expect(DEFAULT_QUIZ_FOLDER).toBe('Quizzes');
    expect(LEGACY_QUIZ_FOLDER).toBe('過去問題集');
  });

  it.each([
    ['Quizzes', 'Quizzes'],
    ['過去問題集', '過去問題集'],
    ['Study/Quizzes', 'Study/Quizzes'],
    ['学習/過去問題集', '学習/過去問題集'],
    ['My notes/Quiz archive', 'My notes/Quiz archive'],
    [' Study\\Quizzes/ ', 'Study/Quizzes'],
    ['Study//Quizzes', 'Study/Quizzes'],
  ])('normalizes a vault-relative folder %s to %s', (input, expected) => {
    expect(normalizeQuizFolder(input)).toBe(expected);
  });

  it.each([
    '', '   ', '/', '/Quizzes', '\\Quizzes', 'C:\\Quizzes', 'C:Quizzes',
    '\\\\server\\share', 'https://example.com/Quizzes', '.', '..', './Quizzes',
    '../Quizzes', 'Study/../Quizzes', 'Study/./Quizzes', 'Study\\..\\Quizzes',
    'Study/Quizzes.', 'Study /Quizzes', 'Study/Qui?zes', 'Study/Qui*zes',
    'Study/Quiz"zes', 'Study/Quiz<zes', 'Study/Quiz>zes', 'Study/Quiz|zes',
    'Study/Quiz\u0000zes', 'Study/Quiz\nzes',
  ])('rejects paths outside the vault or invalid folder names: %j', (input) => {
    expect(() => normalizeQuizFolder(input)).toThrow('folder inside your vault');
  });
});
