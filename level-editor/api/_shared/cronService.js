import { generatorMeta, generators } from '../../src/lib/generators/index.js';
import { assertDateString } from './levelService.js';

const LEVEL_SELECT =
  'id, game_id, puzzle_date, level_number, source, publish_status, content_hash, generator_version, created_at, updated_at, published_at';

export function currentUtcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function parseDryRun(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

export function resolveCronDate({ requestedDate = '', now = new Date() } = {}) {
  const puzzleDate = requestedDate
    ? assertDateString(requestedDate, 'date')
    : currentUtcDate(now);
  const today = currentUtcDate(now);

  if (puzzleDate > today) {
    throw Object.assign(new Error('date must not be in the future.'), { statusCode: 400 });
  }

  return puzzleDate;
}

export async function generateDailyLevels({
  supabase,
  requestedDate = '',
  dryRun = false,
  now = new Date(),
  logger = console,
} = {}) {
  const puzzleDate = resolveCronDate({ requestedDate, now });
  const games = await loadActiveGames(supabase);
  const results = [];

  for (const game of games) {
    const result = await runGameCron({ supabase, game, puzzleDate, dryRun, now });
    results.push(result);
    logCronResult(logger, result);
  }

  const actionCounts = countActions(results);

  return {
    ok: actionCounts.failed === 0,
    puzzleDate,
    dryRun,
    actionCounts,
    results,
  };
}

async function loadActiveGames(supabase) {
  const { data, error } = await supabase
    .from('games')
    .select('id, slug, display_name, status, launch_date, generator_version')
    .eq('status', 'active')
    .order('slug', { ascending: true });

  if (error) {
    throw Object.assign(new Error('Unable to load active games for cron.'), {
      statusCode: 500,
      cause: error,
    });
  }

  return data || [];
}

async function runGameCron({ supabase, game, puzzleDate, dryRun, now }) {
  try {
    return await materializeGameLevel({ supabase, game, puzzleDate, dryRun, now });
  } catch (error) {
    return {
      gameId: game.id,
      gameSlug: game.slug,
      puzzleDate,
      action: 'failed',
      generatorVersion: game.generator_version,
      error: error.message || 'Unexpected cron failure.',
    };
  }
}

async function materializeGameLevel({ supabase, game, puzzleDate, dryRun, now }) {
  const base = {
    gameId: game.id,
    gameSlug: game.slug,
    puzzleDate,
    generatorVersion: game.generator_version,
  };

  if (puzzleDate < game.launch_date) {
    return {
      ...base,
      action: 'skipped-before-launch',
      launchDate: game.launch_date,
    };
  }

  const existing = await getExistingLevel(supabase, game.id, puzzleDate);

  if (existing?.source === 'custom') {
    return {
      ...base,
      action: 'skipped-custom',
      levelId: existing.id,
      levelNumber: existing.level_number,
    };
  }

  if (existing) {
    return {
      ...base,
      action: 'skipped-existing',
      levelId: existing.id,
      levelNumber: existing.level_number,
    };
  }

  const content = generateContent(game, puzzleDate);

  if (dryRun) {
    return {
      ...base,
      action: 'would-insert',
      localGeneratorVersion: generatorMeta[game.slug]?.generatorVersion,
    };
  }

  const level = await insertGeneratedLevelWithConflictRecovery({
    supabase,
    game,
    puzzleDate,
    content,
    now,
  });

  return {
    ...base,
    action: level.recoveredAction || 'inserted',
    levelId: level.id,
    levelNumber: level.level_number,
  };
}

async function getExistingLevel(supabase, gameId, puzzleDate) {
  const { data, error } = await supabase
    .from('daily_levels')
    .select(LEVEL_SELECT)
    .eq('game_id', gameId)
    .eq('puzzle_date', puzzleDate)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error('Unable to check existing daily level.'), {
      statusCode: 500,
      cause: error,
    });
  }

  return data || null;
}

function generateContent(game, puzzleDate) {
  const generator = generators[game.slug];

  if (!generator) {
    throw new Error(`No generator registered for ${game.slug}.`);
  }

  return generator(`${game.slug}:${puzzleDate}`);
}

async function insertGeneratedLevelWithConflictRecovery({
  supabase,
  game,
  puzzleDate,
  content,
  now,
}) {
  try {
    return await insertGeneratedLevel({ supabase, game, puzzleDate, content, now });
  } catch (error) {
    if (!isUniqueConflict(error)) {
      throw error;
    }

    const existing = await getExistingLevel(supabase, game.id, puzzleDate);

    if (existing?.source === 'custom') {
      return {
        id: existing.id,
        level_number: existing.level_number,
        recoveredAction: 'skipped-custom',
      };
    }

    if (existing) {
      return {
        id: existing.id,
        level_number: existing.level_number,
        recoveredAction: 'skipped-existing',
      };
    }

    throw error;
  }
}

async function insertGeneratedLevel({ supabase, game, puzzleDate, content, now }) {
  const payload = {
    game_id: game.id,
    puzzle_date: puzzleDate,
    source: 'generated',
    publish_status: 'published',
    content,
    generator_version: game.generator_version,
    published_at: now.toISOString(),
  };

  const { data, error } = await supabase
    .from('daily_levels')
    .insert(payload)
    .select(LEVEL_SELECT)
    .single();

  if (error) {
    throw Object.assign(new Error('Unable to insert generated daily level.'), {
      statusCode: 500,
      cause: error,
    });
  }

  return data;
}

function isUniqueConflict(error) {
  const cause = error?.cause || error;

  return cause?.code === '23505' ||
    cause?.status === 409 ||
    /duplicate key|unique constraint/i.test(cause?.message || error?.message || '');
}

function countActions(results) {
  return results.reduce((counts, result) => {
    counts[result.action] = (counts[result.action] || 0) + 1;
    return counts;
  }, {
    inserted: 0,
    'would-insert': 0,
    'skipped-existing': 0,
    'skipped-custom': 0,
    'skipped-before-launch': 0,
    failed: 0,
  });
}

function logCronResult(logger, result) {
  const safeResult = {
    gameSlug: result.gameSlug,
    puzzleDate: result.puzzleDate,
    action: result.action,
    levelNumber: result.levelNumber,
    generatorVersion: result.generatorVersion,
  };

  logger?.info?.('level-editor.cron.generate-levels', safeResult);
}
