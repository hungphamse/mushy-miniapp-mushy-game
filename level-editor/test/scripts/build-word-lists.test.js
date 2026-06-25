import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cleanWord } from '../../scripts/build-word-lists.js';

describe('word-list cleaning', () => {
  it('removes capitalized name-like words before normalization', () => {
    assert.equal(cleanWord('Sarah'), null);
    assert.equal(cleanWord('John'), null);
  });

  it("removes possessive forms ending in 's", () => {
    assert.equal(cleanWord("Sarah's"), null);
    assert.equal(cleanWord("teacher's"), null);
  });

  it('keeps lowercase plain words and normalizes them', () => {
    assert.equal(cleanWord('forward'), 'FORWARD');
    assert.equal(cleanWord(' borne '), 'BORNE');
  });
});
