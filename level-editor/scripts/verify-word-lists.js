import { ANSWER_LISTS, ALL_ANSWERS_FLAT, VALID_GUESS_LISTS } from '../src/lib/data/wordLists.js';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from '../src/lib/generators/word-guess-constants.js';

const errors = [];

function check(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function hasDuplicates(words) {
  return new Set(words).size !== words.length;
}

for (let length = MIN_WORD_LENGTH; length <= MAX_WORD_LENGTH; length += 1) {
  const answers = ANSWER_LISTS[length];
  const guesses = VALID_GUESS_LISTS[length];

  check(Array.isArray(answers), `ANSWER_LISTS[${length}] must be an array`);
  check(Array.isArray(guesses), `VALID_GUESS_LISTS[${length}] must be an array`);

  if (!Array.isArray(answers) || !Array.isArray(guesses)) {
    continue;
  }

  check(answers.length > 0, `ANSWER_LISTS[${length}] must not be empty`);
  check(guesses.length > 0, `VALID_GUESS_LISTS[${length}] must not be empty`);
  check(!hasDuplicates(answers), `ANSWER_LISTS[${length}] must not contain duplicates`);
  check(!hasDuplicates(guesses), `VALID_GUESS_LISTS[${length}] must not contain duplicates`);

  const guessSet = new Set(guesses);

  for (const answer of answers) {
    check(/^[A-Z]+$/.test(answer), `Answer ${answer} must be uppercase ASCII`);
    check(answer.length === length, `Answer ${answer} must have length ${length}`);
    check(guessSet.has(answer), `Answer ${answer} must also be a valid guess`);
  }

  for (const guess of guesses) {
    check(/^[A-Z]+$/.test(guess), `Guess ${guess} must be uppercase ASCII`);
    check(guess.length === length, `Guess ${guess} must have length ${length}`);
  }
}

const expectedFlatLength = Object.values(ANSWER_LISTS).reduce((total, words) => total + words.length, 0);
check(ALL_ANSWERS_FLAT.length === expectedFlatLength, 'ALL_ANSWERS_FLAT must contain every answer');
check(!hasDuplicates(ALL_ANSWERS_FLAT), 'ALL_ANSWERS_FLAT must not contain duplicates');

if (errors.length > 0) {
  console.error('Word-list verification failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Word-list verification passed.');
