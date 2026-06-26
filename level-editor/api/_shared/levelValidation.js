import { ANSWER_LISTS } from '../../src/lib/data/wordLists.js';
import {
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  WORD_GUESS_TYPE,
} from '../../src/lib/generators/word-guess-constants.js';

const PUBLISH_STATUSES = new Set(['draft', 'published']);

export function validatePublishStatus(value = 'draft') {
  if (!PUBLISH_STATUSES.has(value)) {
    throw validationError('publishStatus must be draft or published.');
  }

  return value;
}

export function validateLevelContent(game, content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw validationError('content must be a JSON object.');
  }

  if (game.slug === WORD_GUESS_TYPE) {
    return validateWordGuessContent(content);
  }

  return content;
}

export function validateWordGuessContent(content) {
  const answer = String(content.answer || '').trim().toUpperCase();
  const wordLength = Number(content.wordLength);
  const maxAttempts = Number(content.maxAttempts);

  if (content.type !== WORD_GUESS_TYPE) {
    throw validationError('content.type must be word-guess.');
  }

  if (!Number.isInteger(wordLength) || wordLength < MIN_WORD_LENGTH || wordLength > MAX_WORD_LENGTH) {
    throw validationError(`wordLength must be an integer between ${MIN_WORD_LENGTH} and ${MAX_WORD_LENGTH}.`);
  }

  if (!/^[A-Z]+$/.test(answer)) {
    throw validationError('answer must contain uppercase ASCII letters only.');
  }

  if (answer.length !== wordLength) {
    throw validationError(`answer must be exactly ${wordLength} letters.`);
  }

  if (!ANSWER_LISTS[wordLength]?.includes(answer)) {
    throw validationError(`answer is not in the answer word list for length ${wordLength}.`);
  }

  if (!Number.isInteger(maxAttempts) || maxAttempts < wordLength + 1) {
    throw validationError(`maxAttempts must be an integer greater than or equal to ${wordLength + 1}.`);
  }

  return {
    type: WORD_GUESS_TYPE,
    answer,
    wordLength,
    maxAttempts,
  };
}

function validationError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}
