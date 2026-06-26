# Plan: Wordle V1 (Đoán Từ)

> Part of: Mushy Game platform — see `plan-mushy-game.md` for platform architecture
> Author: Claude (Sonnet 4.6)
> Last updated: 2026-06-19 (Wordle authoring flow renamed to the companion `level-editor` app; autocomplete + duplicate detection sections updated to `LevelEditor`; failure streak handling now follows the platform freeze-bank / carryover rules; stale in-project authoring-page references removed)

---

## 0. Overview

**Wordle** (Vietnamese display name: **Đoán Từ**) is the first game shipped on the Mushy Game platform. Players guess a hidden English word in up to `wordLength + 1` attempts. Each guess reveals per-letter feedback, narrowing down the answer over attempts.

The game supports **flexible word lengths** — the default configuration uses 5-letter words (6 attempts), but any word length can be configured per-level via the content JSON. This allows future levels or companion `level-editor` overrides to use different lengths without any code changes.

| Property | Value |
|---|---|
| `slug` | `word-guess` |
| `display_name` | `Đoán Từ` |
| `icon` | `ion:text-outline` |
| `has_timer` | `false` — no timer shown |
| `score_direction` | `asc` — fewer attempts is better |
| `score` | Number of attempts to solve (`1` to `maxAttempts`); `null` on failure |
| Default word length | `5` |
| Default `maxAttempts` | `wordLength + 1` = `6` |
| Supported word length range | `4` to `8` (inclusive) |

---

## 1. Game Rules

### 1.1 Core Rules
- The answer is an **English word** of `wordLength` letters (uppercase ASCII)
- The player has **`maxAttempts` = `wordLength + 1`** attempts
- Default configuration: 5-letter word, 6 attempts — but both values come from the level's `content` JSON and the renderer adapts to whatever is provided
- Supported word length range: **4 to 8 letters** (inclusive). The cron randomly selects a length within this range each day, or the companion `level-editor` flow can fix a specific length for a level.
- Each guess must be a valid word of exactly `wordLength` letters (validated client-side against `VALID_GUESS_LISTS[wordLength]`)
- After each guess, every letter receives one of three states:

| State | Colour | Meaning |
|---|---|---|
| **Correct** | Green `#6aaa64` | Letter is in the word, correct position |
| **Present** | Yellow `#c9b458` | Letter is in the word, wrong position |
| **Absent** | Grey `#787c7e` | Letter is not in the word |

- The game ends when the player guesses the answer correctly **or** exhausts all `maxAttempts`
- One puzzle per day — the same word for all players on the same date

### 1.2 Letter Colouring Edge Cases
- **Duplicate letters:** if the answer is `CRANE` and the player guesses `CREEP`, the first `E` is Correct, the second `E` is Absent — letters are not double-counted
- **Present vs Absent with duplicates:** a letter is only marked Present if there is an unmatched occurrence of it in the answer after accounting for Correct matches first

### 1.3 Failure State
If the player exhausts all `maxAttempts` without guessing correctly:
- The game ends with `score = null` (unscored failure — not ranked)
- The answer is revealed on the result screen
- Streak resolution follows the platform freeze bank: if a freeze is available, consume one and preserve the streak; otherwise reset the streak to 0

### 1.4 Keyboard
- On-screen keyboard reflects the best known state for each letter across submitted guesses — priority: `in-word` (Correct or Present, shown green) > `Absent` (grey) > `Untried` (default surface colour). Correct and Present are merged into a single `in-word` state on the keyboard; see §7.4 and §8.2 for full specification.
- Physical keyboard input also accepted on desktop

---

## 2. Scope

### In Scope (V1)
- English words, plain uppercase ASCII grid
- Flexible word length and attempt count — both driven by `content.wordLength` and `content.maxAttempts`; renderer adapts automatically
- Supported word length range: **4 to 8 letters** — word lists pre-bundled for all 5 lengths
- Default configuration: 5-letter words, 6 attempts (`wordLength + 1`)
- Per-length word lists from SCOWL (SCOWL-20-style common answer source, merged SCOWL-50 valid-guess sources), pre-bundled, client-side validation
- Date-seeded deterministic answer selection; cron picks word length randomly within range each day
- On-screen + physical keyboard input
- Per-letter colour feedback with duplicate-letter handling
- "Cách chơi" (How to play) dialog on first visit — dialog copy references actual `wordLength` and `maxAttempts` values from content
- Disconnect recovery (via platform ping mechanism — see `plan-mushy-game.md §4`)
- Result screen integration (attempts score, percentile, streak)
- Companion `level-editor` preview + override
- Companion `level-editor` UI with answer autocomplete from the answer list, cross-length, and duplicate level detection
- Companion `level-editor` UI follows the global editor UI standards in `plan-mushy-game.md §3.3`, including visible development/preview mode.
- Word-Guess daily content is generated by the `level-editor` cron/backfill flow before players access it; player requests never generate missing Word-Guess levels.

### Out of Scope (V1)
- Hard mode (guesses must reuse confirmed letters)
- Share / copy result emoji grid
- Animation on letter reveal (flip effect)
- Word definition shown after completion

---

## 3. Content JSON

The `content` object stored in `daily_levels.content` for this game type:

```json
{
  "type": "word-guess",
  "answer": "CRANE",
  "wordLength": 5,
  "maxAttempts": 6
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `string` | Always `"word-guess"` — used by renderer registry |
| `answer` | `string` | Uppercase ASCII English word of exactly `wordLength` letters; must exist in `ANSWER_LISTS[wordLength]` (SCOWL-20-style common answer source) |
| `wordLength` | `number` | Length of the answer and each valid guess. Range `4–8`. Drives grid column count, input validation, and word list selection. |
| `maxAttempts` | `number` | Maximum guesses allowed. Default `wordLength + 1`. Drives grid row count. The editor may set higher for easier levels. |

**Invariant:** `answer.length === wordLength` always. The generator enforces this; the companion `level-editor` validates it before saving.

**Examples of non-default configurations (level-editor override):**

```json
// 4-letter word, 5 attempts (default for length 4)
{ "type": "word-guess", "answer": "JAZZ", "wordLength": 4, "maxAttempts": 5 }

// 6-letter word, 8 attempts (editor increased maxAttempts for easier level)
{ "type": "word-guess", "answer": "PLANET", "wordLength": 6, "maxAttempts": 8 }
```

---

## 4. Game State

The `game_state` object stored in `player_sessions.game_state` between pings:

```json
{
  "guesses": ["CRANE", "LUSTY"],
  "completed": false
}
```

| Field | Type | Notes |
|---|---|---|
| `guesses` | `string[]` | Ordered list of submitted guesses so far (0 to `maxAttempts` items) |
| `completed` | `boolean` | `true` if the player has guessed correctly or exhausted all attempts |

On reconnect, the renderer restores the full grid from `guesses` + `content` (`answer`, `wordLength`, `maxAttempts`) — all letter states are re-derived client-side. No derived state (colours, keyboard state) is stored in `game_state`.

`game_state` is **preserved on completion** — the server does not clear it when the session is finalised. This allows GameScreen to restore the completed board when the player re-opens a game they already finished today (Case C in `plan-mushy-game.md §4.4`).

---

## 5. Word Lists

**Source:** SCOWL (Spell Checker Oriented Word Lists) by Kevin Atkinson — MIT-like license, freely bundleable.

Two lists per word length, covering lengths **4 through 8**:

| List | SCOWL level | Purpose | Profanity filter |
|---|---|---|---|
| `ANSWER_LISTS[4–8]` | **20** — common English vocabulary, from the SCOWL `english-words.20`-style combined source | Answer pool — what the cron and the companion `level-editor` pick from | Yes — LDNOOBWV2 applied at build time + manual spot-check |
| `VALID_GUESS_LISTS[4–8]` | **50 merged variants** — American, British, and base English SCOWL sources merged into one forgiving guess pool | Guess validation — what the renderer accepts as a valid submission | No — see note below |

`VALID_GUESS_LISTS` does not need profanity filtering. Offensive words there are harmless because they can never be served as the daily answer, and players are extremely unlikely to guess them unprompted.

Both lists are **pre-bundled** at `src/lib/data/wordLists.js` — no runtime fetch. The `ANSWER_LISTS` are also used by the companion `level-editor` autocomplete feature (see §10.6).

```js
// src/lib/data/wordLists.js  (generated by scripts/build-word-lists.js)
export const ANSWER_LISTS = {
  4: [ /* SCOWL-20-style answer source filtered to length 4, LDNOOBWV2 applied */ ],
  5: [ /* SCOWL-20-style answer source filtered to length 5, LDNOOBWV2 applied */ ],
  6: [ /* SCOWL-20-style answer source filtered to length 6, LDNOOBWV2 applied */ ],
  7: [ /* SCOWL-20-style answer source filtered to length 7, LDNOOBWV2 applied */ ],
  8: [ /* SCOWL-20-style answer source filtered to length 8, LDNOOBWV2 applied */ ],
};

export const VALID_GUESS_LISTS = {
  4: [ /* merged SCOWL-50 valid-guess sources filtered to length 4 — includes ANSWER_LISTS[4] */ ],
  5: [ /* merged SCOWL-50 valid-guess sources filtered to length 5 — includes ANSWER_LISTS[5] */ ],
  6: [ /* merged SCOWL-50 valid-guess sources filtered to length 6 — includes ANSWER_LISTS[6] */ ],
  7: [ /* merged SCOWL-50 valid-guess sources filtered to length 7 — includes ANSWER_LISTS[7] */ ],
  8: [ /* merged SCOWL-50 valid-guess sources filtered to length 8 — includes ANSWER_LISTS[8] */ ],
};

// Flat cross-length answer list — all lengths merged, used by level-editor autocomplete (see §10.6)
export const ALL_ANSWERS_FLAT = Object.values(ANSWER_LISTS).flat();
```

### 5.1 Build-time Pipeline

`src/lib/data/wordLists.js` is a **generated, committed file**. It is generated once (or whenever the source word lists need to be refreshed) and committed to the repo like any other source file. It is **not** regenerated on every Vite build — this keeps cold-start build times fast and avoids requiring the raw SCOWL `.txt` files in CI.

#### Source files — where to get them

| File | Source | How to obtain |
|---|---|---|
| `scowl-answers.txt` or `scowl-answers-*.txt` | SCOWL by Kevin Atkinson — MIT-like license | Download the latest SCOWL release tarball from [wordlist.sourceforge.net](http://wordlist.sourceforge.net) or the [SCOWL GitHub mirror](https://github.com/kevina/wordlist). Use the pre-built `english-words.20` file, or generate an equivalent combined SCOWL size-20 answer source, and place it under this prefix. |
| `scowl-valid-guesses.txt` or `scowl-valid-guesses-*.txt` | Same SCOWL release | Use one or more SCOWL size-50 sources for forgiving guesses. The intended merged set is American, British, and base English variants; each file under this prefix is loaded and merged. |
| `ldnoobwv2-en.txt` | LDNOOBW v2 by @nicktindall | Download `en.txt` from the [LDNOOBW GitHub repo](https://github.com/nicktindall/node-ldnoobw). Rename to `ldnoobwv2-en.txt` and place it in `scripts/wordlist-sources/`. |

Place all raw `.txt` source files in `scripts/wordlist-sources/` (gitignored — do not commit the raw source files, only the generated output).

The build script also supports legacy local fallback filenames while transitioning older checkouts, but new setups should use the explicit `scowl-answers*` and `scowl-valid-guesses*` prefixes so the generated file header documents the intended source groups.

#### npm script

```json
// package.json — add this script
"build:wordlists": "node scripts/build-word-lists.js"
```

Run it manually once before the first deployment, and again whenever the SCOWL source or profanity list is updated:

```bash
npm run build:wordlists
# Then commit the updated src/lib/data/wordLists.js
git add src/lib/data/wordLists.js
git commit -m "chore: regenerate word lists (SCOWL 20 answers + merged SCOWL 50 guesses)"
```

#### The script

```js
// scripts/build-word-lists.js — run manually, not on every build
// Source files expected at: scripts/wordlist-sources/scowl-answers*.txt
//                           scripts/wordlist-sources/scowl-valid-guesses*.txt
//                           scripts/wordlist-sources/ldnoobwv2-en.txt
import { readdirSync, readFileSync, writeFileSync } from 'fs';

const SOURCE_DIR = 'scripts/wordlist-sources';

// Generated file header (embedded in output for traceability)
const GENERATED_DATE = new Date().toISOString().slice(0, 10);
const HEADER = `// AUTO-GENERATED by scripts/build-word-lists.js — DO NOT EDIT MANUALLY
// Answer sources: SCOWL 20 common English
// Valid guess sources: merged SCOWL 50 variants
// Answer blocklist: LDNOOBW v2
// Last generated: ${GENERATED_DATE}
// Re-generate: npm run build:wordlists\n\n`;

function loadWords(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map(cleanWord)
    .filter(Boolean);
}

function cleanWord(rawWord) {
  const word = rawWord.trim();
  if (/^[A-Z][A-Za-z]*$/.test(word)) return null; // remove name-like entries
  if (/^[A-Za-z]+'s$/.test(word)) return null;    // remove possessives
  const normalized = word.toUpperCase();
  return /^[A-Z]+$/.test(normalized) ? normalized : null;
}

function discoverSourceFiles(prefix) {
  return readdirSync(SOURCE_DIR)
    .filter(name => name === `${prefix}.txt` || (name.startsWith(`${prefix}-`) && name.endsWith('.txt')))
    .sort()
    .map(name => `${SOURCE_DIR}/${name}`);
}

function loadMergedWords(files) {
  return [...new Set(files.flatMap(loadWords))].sort();
}

const answerSource = loadMergedWords(discoverSourceFiles('scowl-answers'));
const guessSource  = loadMergedWords(discoverSourceFiles('scowl-valid-guesses'));
const blocklist    = new Set(loadWords('scripts/wordlist-sources/ldnoobwv2-en.txt'));

const ANSWER_LISTS = {};
const VALID_GUESS_LISTS = {};

for (const length of [4, 5, 6, 7, 8]) {
  ANSWER_LISTS[length] = answerSource
    .filter(w => w.length === length)
    .filter(w => !blocklist.has(w)); // profanity filter on answers only

  VALID_GUESS_LISTS[length] = guessSource
    .filter(w => w.length === length);
  VALID_GUESS_LISTS[length] = [...new Set([
    ...VALID_GUESS_LISTS[length],
    ...ANSWER_LISTS[length],
  ])].sort();

  console.log(
    `Length ${length}: ${ANSWER_LISTS[length].length} answers, ` +
    `${VALID_GUESS_LISTS[length].length} valid guesses`
  );
}

const ALL_ANSWERS_FLAT = Object.values(ANSWER_LISTS).flat();

writeFileSync(
  'src/lib/data/wordLists.js',
  HEADER +
  `export const ANSWER_LISTS = ${JSON.stringify(ANSWER_LISTS, null, 2)};\n\n` +
  `export const VALID_GUESS_LISTS = ${JSON.stringify(VALID_GUESS_LISTS, null, 2)};\n\n` +
  `export const ALL_ANSWERS_FLAT = ${JSON.stringify(ALL_ANSWERS_FLAT, null, 2)};\n`
);

console.log('\n✅ src/lib/data/wordLists.js written. Commit the updated file.');
```

#### .gitignore addition

```
# Word list source files (raw SCOWL + profanity list — not committed)
scripts/wordlist-sources/
```

#### Summary of decisions

| Question | Decision |
|---|---|
| When to run the script | Manually, once before first deploy; re-run only when source lists update |
| Is `wordLists.js` committed? | **Yes** — it is static data, not runtime-generated |
| Are source `.txt` files committed? | **No** — gitignored; only the generated output is committed |
| Which lengths at launch? | **All five (4–8)** — the generator already supports the full range; all five lists are generated by the script; no phased approach needed |

---

## 6. Generator

**Files:**
- `src/lib/generators/word-guess.js` — generator function
- `src/lib/generators/word-guess-constants.js` — exports `MIN_WORD_LENGTH = 4` and `MAX_WORD_LENGTH = 8`; duplicate this file into `level-editor/` and keep both copies aligned

### 6.1 Level-Editor Cron Usage

The Word-Guess generator is called by the `level-editor` daily generation flow, not by Mushy Game player requests.

Cron/backfill behavior:
- Scheduled Vercel Cron calls the level-editor generate endpoint once per day for normal publishing.
- The same endpoint must be manually callable with a date immediately after migration/deploy setup so the launch-date level `001` is materialized.
- The endpoint inserts Word-Guess content into `daily_levels` only when the `(game_id, puzzle_date)` row is missing.
- Existing custom rows are never overwritten.
- Existing generated/published rows are left unchanged so the endpoint is safe to retry.
- The database trigger assigns `level_number` from `games.launch_date`; Word-Guess generator code does not compute or persist level numbers itself.

Seed format:
- Use a stable seed such as `word-guess:${puzzleDate}` for generated content.
- Because `word-guess.launch_date` is seeded with `now()::date` during migration, the manual launch backfill date is the migration application date for that editor-owned Supabase project.
- The RNG algorithm/version is part of the Word-Guess `generator_version` contract. V1 uses the platform `RNG_ALGORITHM_VERSION = 'mulberry32-hash31-v1'`; changing the RNG sequence, seed format, draw order, or word-list source requires bumping `word-guess.generator_version` before writing new generated rows.

### 6.2 Generator Function

The generator accepts an optional `options` object to fix a specific word length. When called by the cron without options, it picks a word length randomly (but deterministically from the seed) within the supported range of **4 to 8**.

```js
import { seededRandom } from '../utils/random.js'; // mulberry32-hash31-v1 — see plan-mushy-game.md §5.3
import { ANSWER_LISTS } from '../data/wordLists.js';

// Constants are duplicated into level-editor for WordGuessLevelEditor.
// Keep both app copies aligned when changing supported lengths.
import { MIN_WORD_LENGTH, MAX_WORD_LENGTH } from './word-guess-constants.js';

/**
 * Deterministically selects an English word using the date seed.
 * If wordLength is not provided, picks a length in [4..8] from the seed.
 *
 * @param {string} seed     — format: "word-guess-YYYY-MM-DD"
 * @param {object} [options]
 * @param {number} [options.wordLength]  — fix a specific length (4–8); omit to pick from range
 * @returns {{ type, answer, wordLength, maxAttempts }}
 */
export function generate(seed, options = {}) {
  const rng = seededRandom(seed);

  // Step 1: pick word length
  const wordLength = options.wordLength ?? (
    MIN_WORD_LENGTH + Math.floor(rng() * (MAX_WORD_LENGTH - MIN_WORD_LENGTH + 1))
  );

  if (wordLength < MIN_WORD_LENGTH || wordLength > MAX_WORD_LENGTH) {
    throw new Error(`wordLength must be between ${MIN_WORD_LENGTH} and ${MAX_WORD_LENGTH}`);
  }

  const maxAttempts = wordLength + 1;

  // Step 2: pick word from the SCOWL-20-style answer list for this length
  const list = ANSWER_LISTS[wordLength];
  if (!list?.length) throw new Error(`No answer list for length ${wordLength}`);

  const index = Math.floor(rng() * list.length);

  return {
    type: 'word-guess',
    answer: list[index].toUpperCase(),
    wordLength,
    maxAttempts,
  };
}
```

---

## 7. Renderer

**File:** `src/components/renderers/WordGuessRenderer.jsx`

Receives standard platform renderer props (see `plan-mushy-game.md §17.4`):

```ts
{
  content:   { type, answer, wordLength, maxAttempts }
  gameState: { guesses: string[], completed: boolean } | null
  onAction:  (nextGameState) => void
  onComplete:(score: number | null) => void
}
```

### 7.1 Internal State

```js
const { answer, wordLength, maxAttempts } = content;
const validGuesses = VALID_GUESS_LISTS[wordLength]; // merged SCOWL-50 valid-guess list for this length

const [guesses, setGuesses]    = useState(gameState?.guesses ?? []);
const [currentInput, setInput] = useState('');
const [completed, setCompleted] = useState(gameState?.completed ?? false);
```

`currentInput` is ephemeral — never sent to `onAction`, never persisted server-side. Only submitted guesses enter `guesses`. The renderer reads `wordLength` and `maxAttempts` from `content` everywhere — no hardcoded values.

### 7.2 Guess Submission Flow

```
Player submits guess (Enter key / submit button)
  ├─ Validate: guess.length === wordLength
  ├─ Validate: guess exists in VALID_GUESS_LISTS[wordLength]  (merged SCOWL-50 valid guesses)
  ├─ Derive letter states for the new row
  ├─ Append to guesses array
  ├─ Check win condition: last guess === answer
  │     → true:  call onComplete(nextGuesses.length)           ← score = attempt count (1–maxAttempts); do NOT call onAction
  │     → false: check if maxAttempts exhausted
  │           → true:  call onComplete(null)                   ← score = null (failure); do NOT call onAction
  │           → false: call onAction({ guesses: nextGuesses, completed: false })  ← game action ping fires (intermediate move only)
  └─ Update local state
```

> **Why `onAction` is skipped on the final move:** `onComplete` is the terminal signal — it triggers `POST /api/sessions/complete` which finalises the session. Calling `onAction` first for the same move would fire a redundant game-action ping immediately before the completion request. `onAction` is only for intermediate moves that need to be checkpointed for disconnect recovery. See `plan-mushy-game.md §17.4`.

### 7.3 Letter State Derivation

Derived on every render from `guesses` + `content.answer` — never stored:

```js
function deriveLetterStates(guess, answer) {
  const result = Array(answer.length).fill('absent'); // length-agnostic
  const answerPool = answer.split('');

  // Pass 1: mark correct positions
  guess.split('').forEach((char, i) => {
    if (char === answerPool[i]) {
      result[i] = 'correct';
      answerPool[i] = null; // consume
    }
  });

  // Pass 2: mark present (unmatched only)
  guess.split('').forEach((char, i) => {
    if (result[i] === 'correct') return;
    const poolIndex = answerPool.indexOf(char);
    if (poolIndex !== -1) {
      result[i] = 'present';
      answerPool[poolIndex] = null; // consume
    }
  });

  return result; // ['correct', 'absent', 'present', ...]
}
```

### 7.4 Keyboard State

Derived from all **submitted** guesses only — `currentInput` is never considered. The keyboard uses two submitted states (`in-word` and `absent`) plus the default untried state:

- **`in-word`** — letter is Correct or Present in any submitted guess. Correct and Present are merged into the same visual state (green `#6aaa64`) on the keyboard.
- **`absent`** — letter is Absent in every submitted guess where it appeared.
- **untried** — letter has not appeared in any submitted guess (rendered as `var(--surface-2)`).

Priority: `in-word` outranks `absent`. Once a key is `in-word` it stays `in-word` — a letter confirmed in the word can never be downgraded to `absent` by a later guess.

```js
function deriveKeyboardState(guesses, answer) {
  // Two submitted states: 'in-word' (correct or present) and 'absent'
  // in-word outranks absent — priority 2 > 1
  const STATE_PRIORITY = { 'in-word': 2, absent: 1 };
  const keyboard = {};
  for (const guess of guesses) {
    const states = deriveLetterStates(guess, answer);
    guess.split('').forEach((char, i) => {
      const tileState   = states[i]; // 'correct' | 'present' | 'absent'
      const keyState    = tileState === 'absent' ? 'absent' : 'in-word'; // merge correct+present
      const currentPrio = keyboard[char]?.priority ?? 0;
      if (STATE_PRIORITY[keyState] > currentPrio) {
        keyboard[char] = { state: keyState, priority: STATE_PRIORITY[keyState] };
      }
    });
  }
  return keyboard;
  // e.g. { 'C': { state: 'in-word', priority: 2 }, 'X': { state: 'absent', priority: 1 } }
  // letters absent from keyboard object are 'untried' — rendered as var(--surface-2)
}
```

---

## 8. UI Specification

### 8.1 Grid

- **`maxAttempts` rows × `wordLength` columns** — both read from `content` at render time
- Default renders as 6 rows × 5 columns; a 4-letter level renders as 5 × 4, etc.
- Empty rows below current guess are shown as blank placeholder tiles
- Current input row shows typed letters in real time before submission
- Tile size: uniform square, responsive to viewport width — tile size scales down if `wordLength` is large
- Colours:
  - Empty / unsubmitted: `var(--surface-2)` border, transparent fill
  - Submitted Correct: `#6aaa64` fill, white letter
  - Submitted Present: `#c9b458` fill, white letter
  - Submitted Absent: `#787c7e` fill, white letter
  - Current input (typing): `var(--surface-2)` border, `var(--ink)` letter

### 8.2 On-Screen Keyboard

- 3 rows: `QWERTYUIOP` / `ASDFGHJKL` / `[ENTER] ZXCVBNM [⌫]`
- Key colour reflects the best known state of each letter across all **submitted** guesses only — 3 visual states:

| Key state | Colour | Meaning |
|---|---|---|
| **In word** (Correct or Present) | Green `#6aaa64` | Letter appears in the answer — Correct and Present are merged into one colour on the keyboard |
| **Absent** | Grey `#787c7e` | Letter confirmed not in the answer |
| **Untried** | `var(--surface-2)` | Letter has not appeared in any submitted guess yet |

- **Currently-typed (unsubmitted) letters receive no special treatment** — keys for letters in `currentInput` look identical to untried keys (`var(--surface-2)`) until the guess is submitted
- Priority when a letter has been seen in multiple states: Correct/Present (`in-word`) outranks Absent — once a key is green it stays green regardless of later guesses
- Disabled after `completed = true`

### 8.3 "Cách chơi" Dialog

Shown on first visit for `word-guess` game type. Dialog copy is rendered dynamically using `content.wordLength` and `content.maxAttempts` so it remains accurate for any configuration:

> **Cách chơi Đoán Từ**
>
> Đoán từ tiếng Anh bí mật trong **{maxAttempts} lần thử**.
>
> Mỗi lần đoán phải là một từ tiếng Anh có nghĩa gồm **{wordLength} chữ cái**.
>
> Sau mỗi lần đoán, màu của các ô sẽ thay đổi để cho biết mức độ chính xác của bạn.
>
> 🟩 Chữ đúng, đúng vị trí  
> 🟨 Chữ đúng, sai vị trí  
> ⬛ Chữ không có trong từ

`{wordLength}` and `{maxAttempts}` are interpolated at render time from `content`. Since `has_timer = false`, the dialog's dismiss action simply closes it (no timer to start).

### 8.4 Invalid Guess Feedback

- Word not in `VALID_GUESS_LISTS[wordLength]`: shake animation on the current row + toast "Không có trong từ điển"
- Incomplete word (length < `wordLength`): shake animation + toast "Cần đủ {wordLength} chữ cái" — `wordLength` interpolated at runtime

### 8.5 "Cách chơi" First Visit Logic

Stored in `localStorage` keyed by `mushy-game:how-to-play:word-guess`. If absent → show dialog on mount. After dismissal → set key. Purely client-side; no server involvement.

---

## 9. Result Screen Integration

Wordle uses the platform's standard result screen with the following specifics.

### 9.1 Score Card

- **Score (large text):** `{attempts} / {maxAttempts} lần thử` — e.g. `3 / 6 lần thử` for a default level, `2 / 5 lần thử` for a 4-letter level
- **Average (small text):** `Trung bình: {avg} lần thử`
- **Failure state** (`score = null`): score card shows `X / {maxAttempts} lần thử` in `var(--color-text-danger)`; percentile cards omitted (failure is not ranked)
- `content.maxAttempts` is used directly — the score card is always accurate regardless of word length

### 9.2 Score Display Config

```js
// src/lib/app/scoreConfig.js
'word-guess': {
  formatScore: ({ score, content }) =>
    score === null
      ? `X / ${content.maxAttempts} lần thử`
      : `${score} / ${content.maxAttempts} lần thử`,
  formatAvg: ({ avg }) => `Trung bình: ${avg.toFixed(1)} lần thử`,
}
```

### 9.3 Percentile Cards

- Shown only on success (`score !== null`)
- Ranked by `score` (attempt count), `score_direction = 'asc'` — fewer attempts = better rank
- Global and workspace percentile cards follow standard platform logic (`plan-mushy-game.md §8`)

### 9.4 Streak Card

- Standard platform streak card — no Wordle-specific behaviour
- Failure consumes one freeze and preserves the streak when available; otherwise it resets the streak to 0

### 9.5 Answer Reveal

- After the result screen loads, show the answer prominently: **"Từ hôm nay: {ANSWER}"** — e.g. `Từ hôm nay: CRANE`
- `ANSWER` is read from `bundle.level.content.answer` — available immediately from route state, no extra fetch needed
- Shown regardless of win/loss
- Positioned below the score card, above the stat cards

---

## 10. Level Editor Integration

Wordle registers a custom `LevelEditor` component in the companion `level-editor` app, following the platform contract defined in `plan-mushy-game.md §17.6`. It uses shared field components for all inputs and adds three Wordle-specific features: a live grid preview, answer autocomplete, and duplicate level detection.

### 10.1 File

**`level-editor/src/components/editors/WordGuessLevelEditor.jsx`**

Receives the standard `LevelEditorProps` contract (see `plan-mushy-game.md §17.6.2`), including `gameId` (UUID) which is used by the duplicate-check API call in §10.7.

Registered as:

```js
// level-editor/src/components/editors/index.js
import WordGuessLevelEditor from './WordGuessLevelEditor.jsx';

export const levelEditors = {
  'word-guess': WordGuessLevelEditor,
};
```

---

### 10.2 Editor Layout

The editor is split into two columns on wider screens, stacked on narrow screens:

```
┌──────────────────────────────────┬──────────────────────────┐
│  Fields (left)                   │  Live Preview (right)    │
│                                  │                          │
│  Word Length    [  5  ▲▼ ]       │   Empty grid             │
│  Max Attempts   [  6  ▲▼ ]       │   (maxAttempts rows ×    │
│                 hint below        │    wordLength cols)      │
│                                  │                          │
│  Answer         [ CRANE      ]   │   Answer displayed       │
│  ┌─────────────────────────┐     │   below grid             │
│  │ CRANE  (5)              │     │                          │
│  │ CRANE  (5)   ← closest  │     │                          │
│  │ CRANED (6)              │     │                          │
│  └─────────────────────────┘     │                          │
│  ℹ️ "CRANE was Wordle #42        │                          │
│      on 01/06/2026"              │                          │
│                                  │                          │
│  ⚠ Validation errors here       │                          │
└──────────────────────────────────┴──────────────────────────┘
```

---

### 10.3 Fields

| Field | Component | Default | Constraints |
|---|---|---|---|
| Word Length | `<NumberField />` | `5` | min `4`, max `8`; changing resets Answer to `''` and clears autocomplete |
| Max Attempts | `<NumberField />` | `wordLength + 1` | min `wordLength + 1`; editor may increase beyond default for easier levels |
| Answer | `<TextField />` | `''` (or pre-populated from cron preview) | auto-uppercased; must be exactly `wordLength` letters; must exist in `ANSWER_LISTS[wordLength]` (SCOWL-20-style answer source) |

**Field interaction rules:**
- Changing **Word Length** → immediately recomputes `maxAttempts = wordLength + 1`, clears `answer`, and resets autocomplete suggestions
- Changing **Max Attempts** → no side effects
- `maxAttempts` can never go below `wordLength + 1` — the `<NumberField min>` enforces this at the UI level

---

### 10.4 Validation

The editor calls `onValidate` on every `update()`. Save is disabled until all errors are cleared.

| Check | Error message |
|---|---|
| `answer.length === 0` | `"Answer is required"` |
| `answer.length !== wordLength` | `"Answer must be exactly {wordLength} letters"` |
| `answer` not in `ANSWER_LISTS[wordLength]` | `"'{answer}' is not in the answer word list for length {wordLength}"` |

Note: `maxAttempts < wordLength + 1` is prevented by the `<NumberField min>` prop — it never reaches `onValidate`.

---

### 10.5 Live Preview

The right panel renders a read-only empty grid using the same tile CSS as `WordGuessRenderer` — `maxAttempts` rows × `wordLength` columns of blank tiles — so the editor user can see the exact board size before saving. Below the grid, the answer is displayed in large text if set, or a placeholder `"— — — — —"` if empty.

The preview updates in real time as `wordLength`, `maxAttempts`, and `answer` change. The empty-answer placeholder is `"—".repeat(wordLength)` — not a fixed number of dashes — so it always matches the current word length setting.

---

### 10.6 Answer Autocomplete

As the editor user types in the Answer field, a dropdown of closest matching words appears below the input. This helps editors find valid answer-list words quickly without needing to consult the word list separately.

**Behaviour:**
- Suggestions are drawn from `ALL_ANSWERS_FLAT` (all answer lengths merged across lengths 4–8), not filtered to `wordLength` — this lets the editor discover words of any length, after which they may adjust Word Length to match
- Matching algorithm: prefix match first, then substring match, then fuzzy (edit-distance ≤ 1) — results sorted by match quality then alphabetically
- Maximum **8 suggestions** shown at a time
- Each suggestion displays the word and its length in parentheses — e.g. `CRANE (5)`, `CRANED (6)` — so the editor can see at a glance which Word Length setting the word requires
- Clicking a suggestion:
  1. Sets `answer` to the clicked word (uppercased)
  2. Sets `wordLength` to that word's length
  3. Recomputes `maxAttempts = wordLength + 1`
  4. Closes the dropdown
- Autocomplete is purely client-side — no API call, no debounce needed (filtering `ALL_ANSWERS_FLAT` in memory is fast)
- Dropdown closes on: suggestion click, Escape key, or blur outside the field

**Example:**

```
Editor types: "cran"

Suggestions:
  CRANE  (5)   ← prefix match
  CRANK  (5)   ← prefix match
  CRANNY (6)   ← prefix match
  CRANKY (6)   ← prefix match
```

---

### 10.7 Duplicate Level Detection

After the editor user stops editing the Answer field for 2 seconds, the editor checks whether that exact string has already been used as a daily answer for this game in a previous level.

**Behaviour:**
- Trigger: the Answer field value stops changing for **2 consecutive seconds** — any edit restarts the timer. There is no requirement for the string to be complete or valid before the check fires.
- **Client-side guard:** if `answer.length < MIN_WORD_LENGTH` (i.e. fewer than 4 characters), the call is skipped entirely — no answer can be that short, so the result is always `{ duplicate: false }`. This avoids unnecessary server calls while the editor is still typing the first few letters.
- For strings of length ≥ 4, the API call fires regardless of whether the string is a valid word or matches `wordLength` — the server handles non-matching strings gracefully
- API call: `GET /api/levels/check-duplicate?gameId={gameId}&answer={answer}`
- Server queries `daily_levels` for any past row where `game_id = gameId` AND `content->>'answer' = answer` AND `puzzle_date < today`. Returns `{ duplicate: false }` for any string that has no exact match (including partial words, wrong-length strings, or strings not in any word list)
- Response shapes:

```js
// No duplicate (including partial/invalid strings)
{ duplicate: false }

// Duplicate found
{
  duplicate: true,
  levelNumber: 42,
  puzzleDate: '2026-01-06'   // ISO date string
}
```

- If `duplicate: true`, display a non-blocking **info notice** below the Answer field (not a validation error — the editor may still save):

> ℹ️ "CRANE" was the answer for Wordle #42 on 06/01/2026

- Date is formatted as `DD/MM/YYYY` in the notice
- The notice disappears immediately when the answer field changes again (before the 2-second timer elapses)
- If `duplicate: false`, no notice is shown
- Duplicate detection does **not** block saving — it is advisory only. The editor may intentionally repeat a word for a special event level.

**Why debounced at 2 seconds:** avoids a server call on every keystroke. The 2-second window is measured from the last edit — not from when the field was first focused — so rapid typing resets the timer continuously and only one call fires when the editor pauses.

**Why skip strings shorter than `MIN_WORD_LENGTH`:** strings under 4 characters can never be a past answer (all answers are 4–8 letters), so the server call would always return `{ duplicate: false }`. Skipping these saves the round-trip with no UX difference.

---

### 10.8 New API Endpoint

```
GET /api/levels/check-duplicate?gameId=&answer=
```

- Route lives in the companion `level-editor` deployment
- Queries `daily_levels` for past levels where `game_id = gameId` AND `content->>'answer' = answer` AND `puzzle_date < CURRENT_DATE`
- Returns `{ duplicate: false }` or `{ duplicate: true, levelNumber, puzzleDate }`
- Fast: indexed query on `game_id` + `puzzle_date`; `content->>'answer'` may benefit from a partial index if the table grows large

---

### 10.9 Component

```jsx
// level-editor/src/components/editors/WordGuessLevelEditor.jsx
import { useState, useEffect, useRef } from 'react';
import { ANSWER_LISTS, ALL_ANSWERS_FLAT } from '../../lib/data/wordLists.js';
import TextField   from '../fields/TextField.jsx';
import NumberField from '../fields/NumberField.jsx';

// Autocomplete: returns up to 8 closest matches from ALL_ANSWERS_FLAT
function getSuggestions(input) {
  if (!input) return [];
  const q = input.toUpperCase();
  const prefix    = ALL_ANSWERS_FLAT.filter(w => w.startsWith(q));
  const substring = ALL_ANSWERS_FLAT.filter(w => !w.startsWith(q) && w.includes(q));
  return [...prefix, ...substring].slice(0, 8);
}

// Constants are duplicated in level-editor; keep this local copy aligned with the Mushy Game generator copy.
import { MIN_WORD_LENGTH } from '../../lib/generators/word-guess-constants.js';

// Duplicate detection: fires 2 seconds after the editor stops editing the answer field.
// Skips strings shorter than MIN_WORD_LENGTH (4) — they can never match a past answer.
// No requirement for the string to be a complete or valid word before firing.

function useDuplicateCheck(answer, gameId) {
  const [notice, setNotice] = useState(null); // null | { levelNumber, puzzleDate }
  const timerRef = useRef(null);

  useEffect(() => {
    // Clear previous notice and cancel any pending call immediately on answer change
    setNotice(null);
    clearTimeout(timerRef.current);

    // Client-side guard: skip strings too short to ever be a past answer
    if (!answer || answer.length < MIN_WORD_LENGTH) return;

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/levels/check-duplicate?gameId=${gameId}&answer=${answer}`
        );
        const data = await res.json();
        setNotice(data.duplicate ? data : null);
      } catch {
        // silently ignore network errors — advisory feature only
      }
    }, 2000); // 2-second debounce from last edit

    return () => clearTimeout(timerRef.current);
  }, [answer, gameId]); // wordLength intentionally omitted — trigger is edit pause, not validity

  return notice;
}

export default function WordGuessLevelEditor({ content, onChange, onValidate, gameSlug, gameId }) {
  // gameId (UUID) used for duplicate-check API call — part of the LevelEditorProps contract (see plan-mushy-game.md §17.6.2)
  const { wordLength = 5, maxAttempts = 6, answer = '' } = content;

  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const duplicateNotice = useDuplicateCheck(answer, gameId);

  // Pure validation — does NOT call onChange.
  // Extracted so it can be called from both the mount effect and update().
  function validate(next) {
    const errors = [];
    if (!next.answer) {
      errors.push('Answer is required');
    } else if (next.answer.length !== next.wordLength) {
      errors.push(`Answer must be exactly ${next.wordLength} letters`);
    } else if (!ANSWER_LISTS[next.wordLength]?.includes(next.answer)) {
      errors.push(`'${next.answer}' is not in the answer word list for length ${next.wordLength}`);
    }
    onValidate?.(errors);
  }

  // Fire on mount so the companion editor page disables Save immediately if content is already invalid
  // (e.g. answer = '' from a fresh cron preview).
  useEffect(() => { validate(content); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Called on every field change: persists the new content AND re-validates.
  function update(patch) {
    const next = { ...content, ...patch };
    onChange(next);   // full object, not a delta
    validate(next);   // no spurious onChange; validate is pure
  }

  function handleAnswerChange(val) {
    const upper = val.toUpperCase();
    update({ answer: upper });
    setSuggestions(getSuggestions(upper));
    setShowDropdown(true);
  }

  function handleSuggestionClick(word) {
    update({ answer: word, wordLength: word.length, maxAttempts: word.length + 1 });
    setSuggestions([]);
    setShowDropdown(false);
  }

  return (
    <div class="level-editor-layout">

      {/* Left: fields */}
      <div class="level-editor-fields">
        <NumberField
          label="Word Length"
          value={wordLength}
          min={4} max={8}
          hint="Supported range: 4–8 letters. Changing word length resets the answer."
          onChange={val => update({ wordLength: val, maxAttempts: val + 1, answer: '' })}
        />
        <NumberField
          label="Max Attempts"
          value={maxAttempts}
          min={wordLength + 1}
          hint={`Default: wordLength + 1 = ${wordLength + 1}. Increase to make the level easier.`}
          onChange={val => update({ maxAttempts: val })}
        />

        <div class="answer-field-wrapper">
          <TextField
            label="Answer"
            value={answer}
            placeholder={'A'.repeat(wordLength)}
            maxLength={wordLength}
            hint={`Must be a common ${wordLength}-letter English word`}
            onChange={handleAnswerChange}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            validate={val =>
              val.length === 0          ? 'Required' :
              val.length !== wordLength  ? `Must be exactly ${wordLength} letters` :
              !ANSWER_LISTS[wordLength]?.includes(val) ? 'Not in word list' :
              null
            }
          />

          {/* Autocomplete dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <ul class="answer-autocomplete-dropdown">
              {suggestions.map(word => (
                <li
                  key={word}
                  class="answer-autocomplete-item"
                  onMouseDown={() => handleSuggestionClick(word)}
                >
                  {word}
                  <span class="answer-autocomplete-length">({word.length})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Duplicate detection notice */}
        {duplicateNotice && (
          <p class="answer-duplicate-notice">
            ℹ️ "{answer}" was the answer for Wordle #{duplicateNotice.levelNumber} on{' '}
            {new Date(duplicateNotice.puzzleDate).toLocaleDateString('vi-VN')}
          </p>
        )}
      </div>

      {/* Right: live preview */}
      <div class="level-editor-preview">
        <div
          class="wordle-preview-grid"
          style={{ '--cols': wordLength, '--rows': maxAttempts }}
        >
          {Array.from({ length: maxAttempts * wordLength }).map((_, i) => (
            <div key={i} class="wordle-tile wordle-tile--empty" />
          ))}
        </div>
        <p class="wordle-preview-answer">
          {answer || '—'.repeat(wordLength)}
        </p>
      </div>

    </div>
  );
}
```

---

## 11. Open Questions

| # | Question | Status |
|---|---|---|
| 1 | SCOWL-20-style answer source, merged SCOWL-50 valid guesses | **Decided** — see §5 |
| 2 | All word lengths (4–8) use SCOWL uniformly — no per-length special casing | **Decided** — see §5 |
| 3 | Which word lengths to ship at launch? | **Decided** — all 5 lengths (4–8); see §5.1 |
| 4 | Failure = `score = null` | **Decided** — failure is unranked; streak uses the platform freeze bank |
| 5 | Companion `level-editor` enforces `answer.length === wordLength`; `maxAttempts` freely overridable above `wordLength + 1` | **Decided** — see §10.3–10.4 |
| 6 | Duplicate detection: fires 2s after the editor stops editing; skips strings < 4 chars; advisory only | **Decided** — see §10.7 |
| 7 | Autocomplete searches `ALL_ANSWERS_FLAT` across answer lengths | **Decided** — see §10.6 |
| 8 | Share / copy emoji grid | Deferred to V2 |
| 9 | Animation on letter reveal (flip effect) | Deferred to V2 |
