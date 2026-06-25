import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ANSWER_LISTS, VALID_GUESS_LISTS } from '../../src/lib/data/wordLists.js';
import { generatorMeta, generators } from '../../src/lib/generators/index.js';
import { findDuplicateAnswer } from '../../src/lib/generators/word-guess-duplicates.js';
import {
  gameMeta,
  generate,
  generateForDate,
  getWordGuessSeed,
  validateWordLength,
} from '../../src/lib/generators/word-guess.js';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from '../../src/lib/generators/word-guess-constants.js';
import { RNG_ALGORITHM_VERSION, seededRandom } from '../../src/lib/utils/random.js';

describe('Word-Guess generator', () => {
  it('exposes generator and RNG metadata for version snapshots', () => {
    assert.deepEqual(gameMeta, {
      slug: 'word-guess',
      gameVersion: '1.0.0',
      contentSchemaVersion: 1,
      generatorVersion: 1,
      rulesVersion: 1,
      rngAlgorithmVersion: 'mulberry32-hash31-v1',
    });
    assert.equal(RNG_ALGORITHM_VERSION, 'mulberry32-hash31-v1');
    assert.equal(generatorMeta['word-guess'], gameMeta);
    assert.equal(generators['word-guess'], generate);
  });

  it('generates stable fixed-date snapshots', () => {
    assert.deepEqual(generateForDate('2026-06-24'), {
      type: 'word-guess',
      answer: 'FORWARD',
      wordLength: 7,
      maxAttempts: 8,
    });
    assert.deepEqual(generateForDate('2026-06-25'), {
      type: 'word-guess',
      answer: 'BORNE',
      wordLength: 5,
      maxAttempts: 6,
    });
    assert.deepEqual(generateForDate('2026-01-01'), {
      type: 'word-guess',
      answer: 'PATTERNS',
      wordLength: 8,
      maxAttempts: 9,
    });
  });

  it('uses the documented date seed format', () => {
    assert.equal(getWordGuessSeed('2026-06-24'), 'word-guess:2026-06-24');
    assert.throws(() => getWordGuessSeed('24/06/2026'), /YYYY-MM-DD/);
  });

  it('can pin a word length for editor previews', () => {
    assert.deepEqual(generate('word-guess:2026-06-24', { wordLength: 5 }), {
      type: 'word-guess',
      answer: 'STICK',
      wordLength: 5,
      maxAttempts: 6,
    });
  });

  it('rejects unsupported word lengths', () => {
    assert.throws(() => validateWordLength(MIN_WORD_LENGTH - 1), /between 4 and 8/);
    assert.throws(() => validateWordLength(MAX_WORD_LENGTH + 1), /between 4 and 8/);
    assert.throws(() => validateWordLength(5.5), /integer/);
  });

  it('keeps generated answers inside answer and guess lists', () => {
    for (const date of ['2026-01-01', '2026-02-14', '2026-06-24', '2026-12-31']) {
      const content = generateForDate(date);
      assert.equal(content.answer.length, content.wordLength);
      assert.equal(content.maxAttempts, content.wordLength + 1);
      assert.ok(ANSWER_LISTS[content.wordLength].includes(content.answer));
      assert.ok(VALID_GUESS_LISTS[content.wordLength].includes(content.answer));
    }
  });

  it('keeps RNG output deterministic for the same seed', () => {
    const first = seededRandom('word-guess:2026-06-24');
    const second = seededRandom('word-guess:2026-06-24');

    assert.deepEqual(
      [first(), first(), first()],
      [second(), second(), second()],
    );
  });
});

describe('Word-Guess duplicate detection utility', () => {
  const levels = [
    { puzzle_date: '2026-06-21', level_number: 1, content: { answer: 'CRANE' } },
    { puzzle_date: '2026-06-22', level_number: 2, content: { answer: 'SPICE' } },
    { puzzle_date: '2026-06-23', level_number: 3, content: { answer: 'CRANE' } },
  ];

  it('detects the latest previous exact answer match', () => {
    assert.deepEqual(findDuplicateAnswer('crane', levels, { beforeDate: '2026-06-24' }), {
      duplicate: true,
      levelNumber: 3,
      puzzleDate: '2026-06-23',
    });
  });

  it('ignores future/current rows and too-short strings', () => {
    assert.deepEqual(findDuplicateAnswer('CRANE', levels, { beforeDate: '2026-06-22' }), {
      duplicate: true,
      levelNumber: 1,
      puzzleDate: '2026-06-21',
    });
    assert.deepEqual(findDuplicateAnswer('CAT', levels, { beforeDate: '2026-06-24' }), {
      duplicate: false,
    });
  });
});
