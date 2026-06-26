import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { requireCronSecret } from '../../api/_shared/cronAuth.js';
import {
  generateDailyLevels,
  parseDryRun,
  resolveCronDate,
} from '../../api/_shared/cronService.js';

describe('cron auth guard', () => {
  it('requires CRON_SECRET to be configured', () => {
    assert.throws(
      () => requireCronSecret({ headers: {} }, {}),
      /CRON_SECRET is not configured/,
    );
  });

  it('rejects missing or wrong bearer tokens', () => {
    assert.throws(
      () => requireCronSecret({ headers: {} }, { CRON_SECRET: 'secret' }),
      /Unauthorized cron request/,
    );

    assert.throws(
      () => requireCronSecret({ headers: { authorization: 'Bearer wrong' } }, { CRON_SECRET: 'secret' }),
      /Unauthorized cron request/,
    );
  });

  it('accepts matching bearer token from Vercel Cron or manual calls', () => {
    assert.equal(
      requireCronSecret(
        { headers: { authorization: 'Bearer secret' } },
        { CRON_SECRET: 'secret' },
      ),
      true,
    );
  });
});

describe('cron date and dry-run parsing', () => {
  it('resolves default UTC date and manual date overrides', () => {
    const now = new Date('2026-06-25T23:59:59.000Z');

    assert.equal(resolveCronDate({ now }), '2026-06-25');
    assert.equal(resolveCronDate({ requestedDate: '2026-06-24', now }), '2026-06-24');
  });

  it('rejects invalid and future dates clearly', () => {
    const now = new Date('2026-06-25T00:00:00.000Z');

    assert.throws(() => resolveCronDate({ requestedDate: '2026-02-31', now }), /date must be a valid calendar date/);
    assert.throws(() => resolveCronDate({ requestedDate: '2026-06-26', now }), /date must not be in the future/);
  });

  it('parses dry-run query values', () => {
    assert.equal(parseDryRun('1'), true);
    assert.equal(parseDryRun('true'), true);
    assert.equal(parseDryRun('yes'), true);
    assert.equal(parseDryRun('0'), false);
    assert.equal(parseDryRun(''), false);
  });
});

describe('daily level cron service', () => {
  it('inserts a missing generated level without app-computing trigger-owned fields', async () => {
    const supabase = createFakeSupabase();

    const result = await generateDailyLevels({
      supabase,
      requestedDate: '2026-06-25',
      now: new Date('2026-06-25T01:00:00.000Z'),
      logger: createSilentLogger(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.actionCounts.inserted, 1);
    assert.equal(result.results[0].action, 'inserted');
    assert.equal(result.results[0].levelNumber, 1);
    assert.equal(supabase.tables.daily_levels.length, 1);
    assert.equal(supabase.lastInsertPayload.level_number, undefined);
    assert.equal(supabase.lastInsertPayload.content_hash, undefined);
    assert.equal(supabase.tables.daily_levels[0].content_hash, 'fake-content-hash');
    assert.equal(supabase.tables.daily_levels[0].generator_version, 'v1');
  });

  it('skips an existing generated level unchanged', async () => {
    const existing = generatedLevel({
      puzzle_date: '2026-06-25',
      level_number: 1,
      content: wordGuessContent('BORNE'),
    });
    const supabase = createFakeSupabase({ daily_levels: [existing] });

    const result = await generateDailyLevels({
      supabase,
      requestedDate: '2026-06-25',
      now: new Date('2026-06-25T01:00:00.000Z'),
      logger: createSilentLogger(),
    });

    assert.equal(result.actionCounts['skipped-existing'], 1);
    assert.equal(supabase.tables.daily_levels.length, 1);
    assert.deepEqual(supabase.tables.daily_levels[0], existing);
  });

  it('recovers when duplicate cron delivery causes an insert conflict', async () => {
    const supabase = createFakeSupabase({ conflictOnInsert: true });

    const result = await generateDailyLevels({
      supabase,
      requestedDate: '2026-06-25',
      now: new Date('2026-06-25T01:00:00.000Z'),
      logger: createSilentLogger(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.actionCounts['skipped-existing'], 1);
    assert.equal(supabase.tables.daily_levels.length, 1);
  });


  it('never overwrites custom rows', async () => {
    const custom = customLevel({
      puzzle_date: '2026-06-25',
      level_number: 1,
      content: wordGuessContent('BORNE'),
    });
    const supabase = createFakeSupabase({ daily_levels: [custom] });

    const result = await generateDailyLevels({
      supabase,
      requestedDate: '2026-06-25',
      now: new Date('2026-06-25T01:00:00.000Z'),
      logger: createSilentLogger(),
    });

    assert.equal(result.actionCounts['skipped-custom'], 1);
    assert.equal(supabase.tables.daily_levels.length, 1);
    assert.deepEqual(supabase.tables.daily_levels[0], custom);
  });

  it('reports dates before a game launch without inserting rows', async () => {
    const supabase = createFakeSupabase();

    const result = await generateDailyLevels({
      supabase,
      requestedDate: '2026-06-24',
      now: new Date('2026-06-25T01:00:00.000Z'),
      logger: createSilentLogger(),
    });

    assert.equal(result.actionCounts['skipped-before-launch'], 1);
    assert.equal(result.results[0].launchDate, '2026-06-25');
    assert.equal(supabase.tables.daily_levels.length, 0);
  });

  it('supports dry-run without inserting rows or exposing generated answers', async () => {
    const logs = [];
    const supabase = createFakeSupabase();

    const result = await generateDailyLevels({
      supabase,
      requestedDate: '2026-06-25',
      dryRun: true,
      now: new Date('2026-06-25T01:00:00.000Z'),
      logger: { info: (...args) => logs.push(args) },
    });

    assert.equal(result.actionCounts['would-insert'], 1);
    assert.equal(supabase.tables.daily_levels.length, 0);
    assert.equal(JSON.stringify(result).includes('"answer"'), false);
    assert.equal(JSON.stringify(logs).includes('"answer"'), false);
  });

  it('returns failed per-game results for games without a registered generator', async () => {
    const supabase = createFakeSupabase({
      games: [
        {
          id: 'game-2',
          slug: 'unknown-game',
          display_name: 'Unknown Game',
          status: 'active',
          launch_date: '2026-06-25',
          generator_version: 'v1',
        },
      ],
    });

    const result = await generateDailyLevels({
      supabase,
      requestedDate: '2026-06-25',
      now: new Date('2026-06-25T01:00:00.000Z'),
      logger: createSilentLogger(),
    });

    assert.equal(result.ok, false);
    assert.equal(result.actionCounts.failed, 1);
    assert.match(result.results[0].error, /No generator registered/);
  });
});

function createFakeSupabase(seed = {}) {
  return {
    tables: {
      games: seed.games || [
        {
          id: 'game-1',
          slug: 'word-guess',
          display_name: 'Doan Tu',
          status: 'active',
          launch_date: '2026-06-25',
          generator_version: 'v1',
        },
      ],
      daily_levels: seed.daily_levels || [],
    },
    conflictOnInsert: seed.conflictOnInsert || false,
    lastInsertPayload: null,
    from(tableName) {
      return new FakeQuery(this, tableName);
    },
  };
}

class FakeQuery {
  constructor(supabase, tableName) {
    this.supabase = supabase;
    this.tableName = tableName;
    this.filters = [];
    this.orderSpec = null;
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

  order(field, options = {}) {
    this.orderSpec = { field, ascending: options.ascending !== false };
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.payload = payload;
    this.supabase.lastInsertPayload = payload;
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
    if (this.operation === 'insert') {
      if (this.supabase.conflictOnInsert) {
        this.supabase.conflictOnInsert = false;
        this.supabase.tables.daily_levels.push(generatedLevel({
          puzzle_date: this.payload.puzzle_date,
          level_number: computeLevelNumber(this.payload.puzzle_date, '2026-06-25'),
          content: this.payload.content,
        }));
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      }

      return { data: [this.applyInsert()], error: null };
    }

    let rows = [...this.supabase.tables[this.tableName]].filter((row) => this.matches(row));

    if (this.orderSpec) {
      const direction = this.orderSpec.ascending ? 1 : -1;
      rows = rows.sort((left, right) => (
        left[this.orderSpec.field] > right[this.orderSpec.field] ? direction : -direction
      ));
    }

    return { data: rows, error: null };
  }

  matches(row) {
    return this.filters.every(({ field, value }) => row[field] === value);
  }

  applyInsert() {
    const game = this.supabase.tables.games.find((row) => row.id === this.payload.game_id);
    const row = {
      id: `level-${this.supabase.tables.daily_levels.length + 1}`,
      ...this.payload,
      level_number: computeLevelNumber(this.payload.puzzle_date, game.launch_date),
      content_hash: 'fake-content-hash',
      created_at: '2026-06-25T00:00:00.000Z',
      updated_at: '2026-06-25T00:00:00.000Z',
    };

    this.supabase.tables.daily_levels.push(row);
    return row;
  }
}

function generatedLevel(overrides) {
  return {
    id: `generated-${overrides.puzzle_date}`,
    game_id: 'game-1',
    source: 'generated',
    publish_status: 'published',
    generator_version: 'v1',
    content_hash: 'fake-content-hash',
    ...overrides,
  };
}

function customLevel(overrides) {
  return {
    ...generatedLevel(overrides),
    id: `custom-${overrides.puzzle_date}`,
    source: 'custom',
    publish_status: 'draft',
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

function createSilentLogger() {
  return { info() {} };
}
