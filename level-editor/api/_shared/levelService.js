import { generatorMeta, generators } from '../../src/lib/generators/index.js';
import { validateLevelContent, validatePublishStatus } from './levelValidation.js';

export function assertDateString(value, fieldName = 'date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw Object.assign(new Error(`${fieldName} must use YYYY-MM-DD format.`), { statusCode: 400 });
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw Object.assign(new Error(`${fieldName} must be a valid calendar date.`), { statusCode: 400 });
  }

  return value;
}

export function eachDate(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export async function getGameById(supabase, gameId) {
  if (!gameId) {
    throw Object.assign(new Error('gameId is required.'), { statusCode: 400 });
  }

  const { data, error } = await supabase
    .from('games')
    .select('id, slug, display_name, icon, status, launch_date, generator_version, has_timer, score_direction')
    .eq('id', gameId)
    .single();

  if (error || !data) {
    throw Object.assign(new Error('Game not found.'), { statusCode: 404 });
  }

  return data;
}

export async function previewLevel({ supabase, gameId, puzzleDate }) {
  const date = assertDateString(puzzleDate, 'puzzleDate');
  const game = await getGameById(supabase, gameId);
  const existing = await getSavedLevel(supabase, game.id, date);

  if (existing) {
    return {
      game,
      puzzleDate: date,
      status: existing.source === 'custom' ? 'saved-custom' : 'saved-generated',
      content: existing.content,
      level: existing,
    };
  }

  const content = generateContent(game, date);

  return {
    game,
    puzzleDate: date,
    status: 'generated-preview',
    content,
    level: null,
    generator: {
      seed: getSeed(game.slug, date),
      generatorVersion: game.generator_version,
      localGeneratorVersion: generatorMeta[game.slug]?.generatorVersion,
    },
  };
}

export async function listLevels({ supabase, gameId, from, to }) {
  const start = assertDateString(from, 'from');
  const end = assertDateString(to, 'to');

  if (start > end) {
    throw Object.assign(new Error('from must be before or equal to to.'), { statusCode: 400 });
  }

  const dates = eachDate(start, end);

  if (dates.length > 62) {
    throw Object.assign(new Error('Date range must be 62 days or fewer.'), { statusCode: 400 });
  }

  const game = await getGameById(supabase, gameId);
  const { data, error } = await supabase
    .from('daily_levels')
    .select('id, game_id, puzzle_date, level_number, source, publish_status, content_hash, generator_version, created_at, updated_at, published_at')
    .eq('game_id', game.id)
    .gte('puzzle_date', start)
    .lte('puzzle_date', end)
    .order('puzzle_date', { ascending: true });

  if (error) {
    throw Object.assign(new Error('Unable to load level calendar.'), { statusCode: 500 });
  }

  const savedByDate = new Map((data || []).map((level) => [level.puzzle_date, level]));

  return {
    game,
    from: start,
    to: end,
    levels: dates.map((date) => {
      const saved = savedByDate.get(date);

      if (saved) {
        return {
          puzzleDate: date,
          status: saved.source === 'custom' ? 'saved-custom' : 'saved-generated',
          level: saved,
        };
      }

      return {
        puzzleDate: date,
        status: 'generated-preview',
        level: null,
      };
    }),
  };
}

export async function saveCustomLevel({ supabase, user, body }) {
  const game = await getGameById(supabase, body.gameId);
  const puzzleDate = assertDateString(body.puzzleDate, 'puzzleDate');
  const content = validateLevelContent(game, body.content);
  const publishStatus = validatePublishStatus(body.publishStatus || 'draft');
  const nowIso = new Date().toISOString();

  const payload = {
    game_id: game.id,
    puzzle_date: puzzleDate,
    source: 'custom',
    publish_status: publishStatus,
    content,
    generator_version: game.generator_version,
    created_by: user.id,
    published_at: publishStatus === 'published' ? nowIso : null,
  };

  const { data, error } = await supabase
    .from('daily_levels')
    .upsert(payload, { onConflict: 'game_id,puzzle_date' })
    .select('id, game_id, puzzle_date, level_number, source, publish_status, content, content_hash, generator_version, created_by, created_at, updated_at, published_at')
    .single();

  if (error) {
    throw Object.assign(new Error('Unable to save custom level.'), { statusCode: 500, cause: error });
  }

  return { game, level: data };
}

export async function clearCustomLevel({ supabase, gameId, puzzleDate }) {
  const game = await getGameById(supabase, gameId);
  const date = assertDateString(puzzleDate, 'puzzleDate');
  const { data, error } = await supabase
    .from('daily_levels')
    .delete()
    .eq('game_id', game.id)
    .eq('puzzle_date', date)
    .eq('source', 'custom')
    .select('id, puzzle_date, source')
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error('Unable to clear custom level.'), { statusCode: 500 });
  }

  return {
    game,
    puzzleDate: date,
    cleared: Boolean(data),
  };
}

export async function checkDuplicateAnswer({ supabase, gameId, answer, today = currentUtcDate() }) {
  const game = await getGameById(supabase, gameId);
  const normalized = String(answer || '').trim().toUpperCase();

  if (normalized.length < 4) {
    return { duplicate: false };
  }

  const { data, error } = await supabase
    .from('daily_levels')
    .select('level_number, puzzle_date')
    .eq('game_id', game.id)
    .eq('content->>answer', normalized)
    .lt('puzzle_date', today)
    .order('puzzle_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error('Unable to check duplicate answer.'), { statusCode: 500 });
  }

  if (!data) {
    return { duplicate: false };
  }

  return {
    duplicate: true,
    levelNumber: data.level_number,
    puzzleDate: data.puzzle_date,
  };
}

async function getSavedLevel(supabase, gameId, puzzleDate) {
  const { data, error } = await supabase
    .from('daily_levels')
    .select('id, game_id, puzzle_date, level_number, source, publish_status, content, content_hash, generator_version, created_at, updated_at, published_at')
    .eq('game_id', gameId)
    .eq('puzzle_date', puzzleDate)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error('Unable to load saved level.'), { statusCode: 500 });
  }

  return data || null;
}

function generateContent(game, puzzleDate) {
  const generator = generators[game.slug];

  if (!generator) {
    throw Object.assign(new Error(`No generator registered for ${game.slug}.`), { statusCode: 400 });
  }

  return generator(getSeed(game.slug, puzzleDate));
}

function getSeed(gameSlug, puzzleDate) {
  return `${gameSlug}:${puzzleDate}`;
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}
