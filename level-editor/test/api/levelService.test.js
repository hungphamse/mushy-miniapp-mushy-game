import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkDuplicateAnswer,
  clearCustomLevel,
  listLevels,
  previewLevel,
  saveCustomLevel,
} from '../../api/_shared/levelService.js';

describe('level authoring service', () => {
  it('returns generated previews without writing daily_levels', async () => {
    const supabase = createFakeSupabase();

    const result = await previewLevel({
      supabase,
      gameId: 'game-1',
      puzzleDate: '2026-06-25',
    });

    assert.equal(result.status, 'generated-preview');
    assert.equal(result.content.type, 'word-guess');
    assert.equal(result.level, null);
    assert.equal(supabase.tables.daily_levels.length, 0);
  });

  it('returns saved custom content when the level already exists', async () => {
    const supabase = createFakeSupabase({
      daily_levels: [
        customLevel({ puzzle_date: '2026-06-25', level_number: 1, content: wordGuessContent('BORNE') }),
      ],
    });

    const result = await previewLevel({
      supabase,
      gameId: 'game-1',
      puzzleDate: '2026-06-25',
    });

    assert.equal(result.status, 'saved-custom');
    assert.deepEqual(result.content, wordGuessContent('BORNE'));
  });

  it('lists calendar status for saved and generated-preview dates', async () => {
    const supabase = createFakeSupabase({
      daily_levels: [
        customLevel({ puzzle_date: '2026-06-25', level_number: 1, content: wordGuessContent('BORNE') }),
      ],
    });

    const result = await listLevels({
      supabase,
      gameId: 'game-1',
      from: '2026-06-24',
      to: '2026-06-26',
    });

    assert.deepEqual(result.levels.map((level) => [level.puzzleDate, level.status]), [
      ['2026-06-24', 'generated-preview'],
      ['2026-06-25', 'saved-custom'],
      ['2026-06-26', 'generated-preview'],
    ]);
  });

  it('saves validated custom Word-Guess levels without app-computing level_number', async () => {
    const supabase = createFakeSupabase();

    const result = await saveCustomLevel({
      supabase,
      user: { id: 'user-1' },
      body: {
        gameId: 'game-1',
        puzzleDate: '2026-06-25',
        publishStatus: 'published',
        content: wordGuessContent('BORNE'),
      },
    });

    assert.equal(result.level.source, 'custom');
    assert.equal(result.level.publish_status, 'published');
    assert.equal(result.level.level_number, 1);
    assert.equal(result.level.content_hash, 'fake-content-hash');
    assert.equal(supabase.lastUpsertPayload.level_number, undefined);
    assert.equal(supabase.lastUpsertPayload.content_hash, undefined);
  });

  it('rejects invalid Word-Guess content before persistence', async () => {
    const supabase = createFakeSupabase();

    await assert.rejects(
      () => saveCustomLevel({
        supabase,
        user: { id: 'user-1' },
        body: {
          gameId: 'game-1',
          puzzleDate: '2026-06-25',
          content: wordGuessContent('ZZZZZ'),
        },
      }),
      /answer is not in the answer word list/,
    );

    assert.equal(supabase.tables.daily_levels.length, 0);
  });

  it('clears only custom overrides', async () => {
    const supabase = createFakeSupabase({
      daily_levels: [
        customLevel({ puzzle_date: '2026-06-25', level_number: 1, content: wordGuessContent('BORNE') }),
        generatedLevel({ puzzle_date: '2026-06-26', level_number: 2, content: wordGuessContent('STICK') }),
      ],
    });

    assert.deepEqual(
      await clearCustomLevel({ supabase, gameId: 'game-1', puzzleDate: '2026-06-25' }),
      {
        game: supabase.tables.games[0],
        puzzleDate: '2026-06-25',
        cleared: true,
      },
    );

    assert.equal(supabase.tables.daily_levels.length, 1);
    assert.equal(supabase.tables.daily_levels[0].source, 'generated');
  });

  it('checks duplicate answers in past levels only', async () => {
    const supabase = createFakeSupabase({
      daily_levels: [
        customLevel({ puzzle_date: '2026-06-21', level_number: 1, content: wordGuessContent('BORNE') }),
        customLevel({ puzzle_date: '2026-06-28', level_number: 8, content: wordGuessContent('BORNE') }),
      ],
    });

    assert.deepEqual(
      await checkDuplicateAnswer({
        supabase,
        gameId: 'game-1',
        answer: 'borne',
        today: '2026-06-25',
      }),
      { duplicate: true, levelNumber: 1, puzzleDate: '2026-06-21' },
    );

    assert.deepEqual(
      await checkDuplicateAnswer({
        supabase,
        gameId: 'game-1',
        answer: 'cat',
        today: '2026-06-25',
      }),
      { duplicate: false },
    );
  });
});

function createFakeSupabase(seed = {}) {
  const supabase = {
    tables: {
      games: seed.games || [
        {
          id: 'game-1',
          slug: 'word-guess',
          display_name: 'Doan Tu',
          icon: 'ion:text-outline',
          status: 'active',
          launch_date: '2026-06-25',
          generator_version: 'v1',
          has_timer: false,
          score_direction: 'asc',
        },
      ],
      daily_levels: seed.daily_levels || [],
    },
    lastUpsertPayload: null,
    from(tableName) {
      return new FakeQuery(this, tableName);
    },
  };

  return supabase;
}

class FakeQuery {
  constructor(supabase, tableName) {
    this.supabase = supabase;
    this.tableName = tableName;
    this.filters = [];
    this.rangeFilters = [];
    this.orderSpec = null;
    this.limitCount = null;
    this.operation = 'select';
    this.payload = null;
  }

  select() {
    return this;
  }

  eq(field, value) {
    this.filters.push({ field, value });
    return this;
  }

  gte(field, value) {
    this.rangeFilters.push({ field, op: 'gte', value });
    return this;
  }

  lte(field, value) {
    this.rangeFilters.push({ field, op: 'lte', value });
    return this;
  }

  lt(field, value) {
    this.rangeFilters.push({ field, op: 'lt', value });
    return this;
  }

  order(field, options = {}) {
    this.orderSpec = { field, ascending: options.ascending !== false };
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  upsert(payload) {
    this.operation = 'upsert';
    this.payload = payload;
    this.supabase.lastUpsertPayload = payload;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  async single() {
    const { data, error } = await this.execute();

    if (error) {
      return { data: null, error };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return row ? { data: row, error: null } : { data: null, error: new Error('No rows') };
  }

  async maybeSingle() {
    const { data, error } = await this.execute();

    if (error) {
      return { data: null, error };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return { data: row || null, error: null };
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    if (this.operation === 'upsert') {
      return { data: [this.applyUpsert()], error: null };
    }

    if (this.operation === 'delete') {
      return { data: this.applyDelete(), error: null };
    }

    let rows = [...this.supabase.tables[this.tableName]].filter((row) => this.matches(row));

    if (this.orderSpec) {
      const direction = this.orderSpec.ascending ? 1 : -1;
      rows = rows.sort((left, right) => (
        left[this.orderSpec.field] > right[this.orderSpec.field] ? direction : -direction
      ));
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }

  matches(row) {
    return this.filters.every(({ field, value }) => readField(row, field) === value) &&
      this.rangeFilters.every(({ field, op, value }) => {
        const actual = readField(row, field);

        if (op === 'gte') return actual >= value;
        if (op === 'lte') return actual <= value;
        if (op === 'lt') return actual < value;
        return false;
      });
  }

  applyUpsert() {
    const table = this.supabase.tables[this.tableName];
    const existingIndex = table.findIndex((row) => (
      row.game_id === this.payload.game_id && row.puzzle_date === this.payload.puzzle_date
    ));
    const game = this.supabase.tables.games.find((row) => row.id === this.payload.game_id);
    const row = {
      ...(existingIndex >= 0 ? table[existingIndex] : { id: `level-${table.length + 1}` }),
      ...this.payload,
      level_number: computeLevelNumber(this.payload.puzzle_date, game.launch_date),
      content_hash: 'fake-content-hash',
      created_at: '2026-06-25T00:00:00.000Z',
      updated_at: '2026-06-25T00:00:00.000Z',
    };

    if (existingIndex >= 0) {
      table[existingIndex] = row;
    } else {
      table.push(row);
    }

    return row;
  }

  applyDelete() {
    const table = this.supabase.tables[this.tableName];
    const removed = [];
    this.supabase.tables[this.tableName] = table.filter((row) => {
      if (this.matches(row)) {
        removed.push(row);
        return false;
      }

      return true;
    });
    return removed;
  }
}

function readField(row, field) {
  if (field.startsWith('content->>')) {
    return row.content?.[field.slice('content->>'.length)];
  }

  return row[field];
}

function customLevel(overrides) {
  return {
    id: `custom-${overrides.puzzle_date}`,
    game_id: 'game-1',
    source: 'custom',
    publish_status: 'draft',
    generator_version: 'v1',
    content_hash: 'fake-content-hash',
    ...overrides,
  };
}

function generatedLevel(overrides) {
  return {
    ...customLevel(overrides),
    id: `generated-${overrides.puzzle_date}`,
    source: 'generated',
    publish_status: 'published',
  };
}

function wordGuessContent(answer) {
  return {
    type: 'word-guess',
    answer,
    wordLength: answer.length,
    maxAttempts: answer.length + 1,
  };
}

function computeLevelNumber(puzzleDate, launchDate) {
  const diffMs = Date.parse(`${puzzleDate}T00:00:00.000Z`) - Date.parse(`${launchDate}T00:00:00.000Z`);
  return Math.floor(diffMs / 86_400_000) + 1;
}
