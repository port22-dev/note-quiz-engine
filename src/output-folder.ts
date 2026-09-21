import { normalizePath } from 'obsidian';

export const DEFAULT_QUIZ_FOLDER = 'Quizzes';
export const LEGACY_QUIZ_FOLDER = '過去問題集';

/** Keep output paths inside the vault and portable across supported devices. */
export function normalizeQuizFolder(value: string): string {
  const path = value.trim().replace(/\\/g, '/');
  if (!path || path.startsWith('/') || /[:*?"<>|\p{Cc}]/u.test(path)
    || path.split('/').some((part) => part === '.' || part === '..' || /[. ]$/.test(part))) {
    throw new Error('Enter a folder inside your vault, such as Quizzes or Study/Quizzes.');
  }
  return normalizePath(path);
}
