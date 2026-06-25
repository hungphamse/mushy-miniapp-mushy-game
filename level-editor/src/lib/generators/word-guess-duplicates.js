import { MIN_WORD_LENGTH } from './word-guess-constants.js';

export function findDuplicateAnswer(answer, levels, { beforeDate } = {}) {
  const normalized = String(answer ?? '').trim().toUpperCase();

  if (normalized.length < MIN_WORD_LENGTH) {
    return { duplicate: false };
  }

  const matches = levels
    .filter((level) => {
      const levelAnswer = String(level.content?.answer ?? '').toUpperCase();
      const isPastLevel = beforeDate ? level.puzzle_date < beforeDate : true;
      return isPastLevel && levelAnswer === normalized;
    })
    .sort((left, right) => right.puzzle_date.localeCompare(left.puzzle_date));

  const match = matches[0];

  if (!match) {
    return { duplicate: false };
  }

  return {
    duplicate: true,
    levelNumber: match.level_number,
    puzzleDate: match.puzzle_date,
  };
}
