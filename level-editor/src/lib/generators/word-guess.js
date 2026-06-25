import { ANSWER_LISTS, VALID_GUESS_LISTS } from '../data/wordLists.js';
import { RNG_ALGORITHM_VERSION, seededRandom } from '../utils/random.js';
import {
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  WORD_GUESS_CONTENT_SCHEMA_VERSION,
  WORD_GUESS_GAME_VERSION,
  WORD_GUESS_GENERATOR_VERSION,
  WORD_GUESS_RULES_VERSION,
  WORD_GUESS_SLUG,
  WORD_GUESS_TYPE,
} from './word-guess-constants.js';

export const gameMeta = {
  slug: WORD_GUESS_SLUG,
  gameVersion: WORD_GUESS_GAME_VERSION,
  contentSchemaVersion: WORD_GUESS_CONTENT_SCHEMA_VERSION,
  generatorVersion: WORD_GUESS_GENERATOR_VERSION,
  rulesVersion: WORD_GUESS_RULES_VERSION,
  rngAlgorithmVersion: RNG_ALGORITHM_VERSION,
};

export function getWordGuessSeed(puzzleDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(puzzleDate)) {
    throw new Error('puzzleDate must use YYYY-MM-DD format');
  }

  return `${WORD_GUESS_SLUG}:${puzzleDate}`;
}

export function validateWordLength(wordLength) {
  if (!Number.isInteger(wordLength)) {
    throw new Error('wordLength must be an integer');
  }

  if (wordLength < MIN_WORD_LENGTH || wordLength > MAX_WORD_LENGTH) {
    throw new Error(`wordLength must be between ${MIN_WORD_LENGTH} and ${MAX_WORD_LENGTH}`);
  }
}

export function generate(seed, options = {}) {
  const rng = seededRandom(seed);
  const wordLength = options.wordLength ?? (
    MIN_WORD_LENGTH + Math.floor(rng() * (MAX_WORD_LENGTH - MIN_WORD_LENGTH + 1))
  );

  validateWordLength(wordLength);

  const answers = ANSWER_LISTS[wordLength];
  const validGuesses = VALID_GUESS_LISTS[wordLength];

  if (!answers?.length) {
    throw new Error(`No answer list for length ${wordLength}`);
  }

  if (!validGuesses?.length) {
    throw new Error(`No valid guess list for length ${wordLength}`);
  }

  const answerIndex = Math.floor(rng() * answers.length);
  const answer = answers[answerIndex].toUpperCase();

  return {
    type: WORD_GUESS_TYPE,
    answer,
    wordLength,
    maxAttempts: wordLength + 1,
  };
}

export function generateForDate(puzzleDate, options = {}) {
  return generate(getWordGuessSeed(puzzleDate), options);
}
