import type { QuizAttempt } from './types';

export const RESULTS_START = '<!-- QUIZ_RESULTS_START -->';
export const RESULTS_END = '<!-- QUIZ_RESULTS_END -->';
const DATA_PREFIX = '<!-- QUIZ_RESULTS_DATA: ';

export class ResultStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResultStorageError';
  }
}

interface ManagedRegion {
  start: number;
  end: number;
  text: string;
}

interface HistoryData {
  version: 1;
  attempts: QuizAttempt[];
}

/** Locate column-zero markers outside fenced code and YAML frontmatter. */
function findRegion(markdown: string): ManagedRegion | undefined {
  const markers: { kind: 'start' | 'end'; offset: number }[] = [];
  const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  let offset = 0;
  let fence: { character: string; length: number } | undefined;
  let inFrontmatter = false;
  let inComment = false;

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.replace(/[\r\n]+$/, '');
    if (lineIndex === 0 && line.replace(/^\uFEFF/, '').trim() === '---') {
      inFrontmatter = true;
      offset += rawLine.length;
      continue;
    }
    if (inFrontmatter) {
      if (/^(?:---|\.\.\.)[ \t]*$/.test(line)) inFrontmatter = false;
      offset += rawLine.length;
      continue;
    }
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (closing && closing[1]?.[0] === fence.character && closing[1].length >= fence.length) {
        fence = undefined;
      }
      offset += rawLine.length;
      continue;
    }

    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!inComment && opening && !(opening[1]?.[0] === '`' && opening[2]?.includes('`'))) {
      fence = { character: opening[1]![0]!, length: opening[1]!.length };
      offset += rawLine.length;
      continue;
    }

    if (/<!--\s*QUIZ_RESULTS_(?:START|END)\b/.test(line)) {
      if (inComment) {
        throw new ResultStorageError('A result marker is inside an HTML comment. Put marker examples in a code block. The note was not changed.');
      }
      const trimmed = line.trimEnd();
      if (trimmed !== RESULTS_START && trimmed !== RESULTS_END) {
        throw new ResultStorageError('Each result marker must be on its own line, with no indentation or extra text. The note was not changed.');
      }
      markers.push({
        kind: trimmed === RESULTS_START ? 'start' : 'end',
        offset: offset + line.indexOf(trimmed),
      });
    } else {
      let cursor = 0;
      while (cursor < line.length) {
        if (inComment) {
          const end = line.indexOf('-->', cursor);
          if (end < 0) break;
          cursor = end + 3;
          inComment = false;
        } else {
          const start = line.indexOf('<!--', cursor);
          if (start < 0) break;
          cursor = start + 4;
          inComment = true;
        }
      }
    }
    offset += rawLine.length;
  }

  if (fence) {
    throw new ResultStorageError('Close the unfinished code block and try again. The note was not changed.');
  }
  if (inFrontmatter || inComment) {
    throw new ResultStorageError('Close the unfinished YAML frontmatter or HTML comment and try again. The note was not changed.');
  }
  if (markers.length === 0) return undefined;
  const [start, end] = markers;
  if (markers.length !== 2 || start?.kind !== 'start' || end?.kind !== 'end') {
    throw new ResultStorageError('Result markers are duplicated or do not form one start/end pair. The note was not changed.');
  }
  const regionEnd = end.offset + RESULTS_END.length;
  return { start: start.offset, end: regionEnd, text: markdown.slice(start.offset, regionEnd) };
}

/** Remove only the managed span; never trim or normalize the source note. */
export function stripResults(markdown: string): string {
  const region = findRegion(markdown);
  return region ? markdown.slice(0, region.start) + markdown.slice(region.end) : markdown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > maxDay) return false;
  const zone = match[7];
  if (zone && zone !== 'Z') {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0)) return false;
  }
  return true;
}

function validateAttempt(value: unknown): QuizAttempt {
  if (!isRecord(value)) throw new ResultStorageError('Invalid result data. The note was not changed.');
  const { id, date, correct, total, answered, accuracy } = value;
  if (typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(id) ||
      typeof date !== 'string' || !validDate(date) ||
      typeof total !== 'number' || !Number.isSafeInteger(total) || total < 1 ||
      typeof correct !== 'number' || !Number.isSafeInteger(correct) || correct < 0 || correct > total ||
      typeof answered !== 'number' || answered !== total ||
      typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100 ||
      Math.abs(accuracy - (correct / total) * 100) > 0.0051) {
    throw new ResultStorageError('Result data is incomplete or invalid. The note was not changed.');
  }
  return { id, date, correct, total, answered, accuracy };
}

function percent(value: number): string {
  return String(Math.round((value + Number.EPSILON) * 100) / 100);
}

function renderRegion(attempts: QuizAttempt[], eol: string): string {
  const latest = attempts[attempts.length - 1]!;
  const data: HistoryData = { version: 1, attempts };
  return [
    RESULTS_START,
    '## Quiz Results',
    `- Score: ${latest.correct} / ${latest.total}`,
    `- Accuracy: ${percent(latest.accuracy)}%`,
    `- Last Attempt: ${latest.date}`,
    '',
    '| Date | Score | Accuracy |',
    '|---|---:|---:|',
    ...attempts.map(attempt => `| ${attempt.date} | ${attempt.correct} / ${attempt.total} | ${percent(attempt.accuracy)}% |`),
    '',
    `${DATA_PREFIX}${JSON.stringify(data)} -->`,
    RESULTS_END,
  ].join(eol);
}

function readHistory(region: ManagedRegion, eol: string): QuizAttempt[] {
  const lines = region.text.split(/\r\n|\n|\r/);
  const metadata = lines.filter(line => line.startsWith(DATA_PREFIX));
  const line = metadata[0];
  if (metadata.length !== 1 || !line?.endsWith(' -->')) {
    throw new ResultStorageError('Result history metadata is missing or damaged. Back up your existing results, then remove the marked results section before retrying. The note was not changed.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(DATA_PREFIX.length, -4));
  } catch {
    throw new ResultStorageError('Result history JSON is damaged. The note was not changed.');
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.attempts) || parsed.attempts.length === 0) {
    throw new ResultStorageError('Result history has an unsupported format or version. The note was not changed.');
  }
  const attempts = parsed.attempts.map(validateAttempt);
  if (new Set(attempts.map(attempt => attempt.id)).size !== attempts.length) {
    throw new ResultStorageError('Result history contains duplicate attempt IDs. The note was not changed.');
  }
  // Refuse silently overwriting manual additions or divergence between the table and metadata.
  if (region.text !== renderRegion(attempts, eol)) {
    throw new ResultStorageError('The managed results section was edited manually. Back up your results, then remove the marked section before retrying. The note was not changed.');
  }
  return attempts;
}

/**
 * Append an initial block or replace only the existing managed marker span.
 * Version 1 blocks are canonical and read-only to humans. Legacy blocks without
 * metadata are refused rather than guessing, truncating history, or migrating IDs.
 */
export function updateResults(markdown: string, attempt: QuizAttempt): string {
  const validated = validateAttempt(attempt);
  const region = findRegion(markdown);
  const eol = (region?.text ?? markdown).match(/\r\n|\n|\r/)?.[0] ?? '\n';
  const history = region ? readHistory(region, eol) : [];
  const existing = history.find(item => item.id === validated.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(validated)) {
      throw new ResultStorageError('This attempt ID already has different results. The note was not changed.');
    }
    return markdown;
  }
  const replacement = renderRegion([...history, validated], eol);
  if (region) return markdown.slice(0, region.start) + replacement + markdown.slice(region.end);
  const endsWithBlankLine = /\r\n\r\n$|\n\n$|\r\r$/.test(markdown);
  const separator = markdown.length === 0 || endsWithBlankLine ? '' : /[\r\n]$/.test(markdown) ? eol : eol + eol;
  return markdown + separator + replacement + eol;
}
