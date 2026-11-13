import { mulberry32 } from './rng.js';
import { SHAPES, SIZE, SMALL_IDS, makePiece, shapeById } from './shapes.js';

export const TRAY = 3;
export const ALL_CLEAR_BONUS = 100;
export const COMBO_GRACE = 3; // 줄을 못 지운 채 이만큼 놓으면 콤보가 끊깁니다.
export const MAX_COMBO = 10; // 콤보 점수 배수의 상한(콤보 횟수 자체는 계속 셉니다).
const FULL = (1 << SIZE) - 1;

// 한 번에 지운 줄 수 n의 기본 점수: 1줄 10, 2줄 30, 3줄 60, 4줄 100 …
export const lineScore = n => (n * (n + 1) / 2) * 10;

export const emptyGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
export const cloneGrid = grid => grid.map(row => row.slice());
export const filledCount = grid => grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);

// ---------- 놓기 판정과 계산(순수 함수) ----------
export function canPlace(grid, piece, row, col) {
  for (const [dr, dc] of piece.cells) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE || grid[r][c]) return false;
  }
  return true;
}

export function findPlacements(grid, piece) {
  const found = [];
  for (let row = 0; row <= SIZE - piece.h; row += 1) {
    for (let col = 0; col <= SIZE - piece.w; col += 1) if (canPlace(grid, piece, row, col)) found.push({ row, col });
  }
  return found;
}

export const fits = (grid, piece) => {
  for (let row = 0; row <= SIZE - piece.h; row += 1) {
    for (let col = 0; col <= SIZE - piece.w; col += 1) if (canPlace(grid, piece, row, col)) return true;
  }
  return false;
};

// 조각을 놓고 가득 찬 가로·세로 줄을 한꺼번에 지운 새 격자를 돌려줍니다. 원본은 바꾸지 않습니다.
export function applyPlacement(grid, piece, row, col) {
  const next = cloneGrid(grid);
  for (const [dr, dc] of piece.cells) next[row + dr][col + dc] = piece.color;
  const rows = [];
  const cols = [];
  for (let r = 0; r < SIZE; r += 1) if (next[r].every(Boolean)) rows.push(r);
  for (let c = 0; c < SIZE; c += 1) if (next.every(line => line[c])) cols.push(c);
  const cleared = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (next[r][c] && (rows.includes(r) || cols.includes(c))) cleared.push({ row: r, col: c, color: next[r][c] });
    }
  }
  for (const { row: r, col: c } of cleared) next[r][c] = 0;
  return { grid: next, rows, cols, cleared, lines: rows.length + cols.length };
}

// 놓기 전에 어느 줄이 지워질지 미리 알려 줍니다(화면 미리보기용).
export const previewClear = (grid, piece, row, col) => {
  const { rows, cols, lines } = applyPlacement(grid, piece, row, col);
  return { rows, cols, lines };
};

// ---------- 세 조각을 모두 놓을 수 있는지 확인하는 풀이기 ----------
const toMasks = grid => grid.map(row => row.reduce((mask, value, c) => (value ? mask | (1 << c) : mask), 0));

function maskFits(masks, piece, row, col) {
  for (let i = 0; i < piece.h; i += 1) if ((piece.rowMasks[i] << col) & masks[row + i]) return false;
  return true;
}

function maskApply(masks, piece, row, col) {
  const next = masks.slice();
  for (let i = 0; i < piece.h; i += 1) next[row + i] |= piece.rowMasks[i] << col;
  let fullCols = FULL;
  for (const mask of next) fullCols &= mask;
  return next.map(mask => (mask === FULL ? 0 : mask & ~fullCols & FULL));
}

// 세 조각을 어떤 순서로든 모두 놓을 수 있으면 참입니다. 검사량이 limit을 넘으면 ‘못 찾음’으로 칩니다.
export function isDealable(grid, pieces, limit = 60000) {
  let nodes = 0;
  const search = (masks, remaining) => {
    if (!remaining.length) return true;
    const seen = new Set();
    for (let i = 0; i < remaining.length; i += 1) {
      const piece = remaining[i];
      if (seen.has(piece.id)) continue;
      seen.add(piece.id);
      const rest = remaining.filter((_, j) => j !== i);
      for (let row = 0; row <= SIZE - piece.h; row += 1) {
        for (let col = 0; col <= SIZE - piece.w; col += 1) {
          if (!maskFits(masks, piece, row, col)) continue;
          nodes += 1;
          if (nodes > limit) return false;
          if (search(maskApply(masks, piece, row, col), rest)) return true;
        }
      }
    }
    return false;
  };
  return search(toMasks(grid), pieces);
}

// ---------- 게임 상태 ----------
export function createGame({ seed = 1 } = {}) {
  const game = {
    seed, rng: mulberry32(seed), grid: emptyGrid(), tray: Array(TRAY).fill(null),
    score: 0, lines: 0, moves: 0, streak: 0, dry: 0, bestStreak: 0, allClears: 0, deals: 0,
    phase: 'playing', events: []
  };
  dealTray(game);
  return game;
}

export const drainEvents = game => game.events.splice(0);

function pickShape(game, fill, hardness, taken) {
  const weights = SHAPES.map(shape => {
    let weight = shape.weight;
    if (fill > 0.55) weight *= shape.size <= 3 ? 2.2 : shape.size >= 5 ? 0.35 : 1; // 판이 차면 작은 조각을 더 자주 줍니다.
    else if (shape.size >= 5) weight *= 0.7 + hardness; // 점수가 오를수록 큰 조각이 늘어납니다.
    if (taken.filter(id => id === shape.id).length >= 2) weight = 0;
    return weight;
  });
  let roll = game.rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SHAPES.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return SHAPES[i];
  }
  return SHAPES[0];
}

// 새 조각 세 개를 나눠 줍니다. 세 조각을 모두 놓을 수 있는 순서가 있는 묶음만 고르고,
// 끝내 못 찾으면 작은 조각으로 바꿔 줍니다. 빈 칸이 3칸 이상이면 항상 놓을 수 있는 묶음을 줍니다.
export function dealTray(game) {
  const fill = filledCount(game.grid) / (SIZE * SIZE);
  const hardness = Math.min(1, game.score / 1500);
  let chosen = null;
  for (let attempt = 0; attempt < 40 && !chosen; attempt += 1) {
    const ids = [];
    for (let i = 0; i < TRAY; i += 1) ids.push(pickShape(game, fill, hardness, ids).id);
    const pieces = ids.map(id => makePiece(shapeById(id)));
    if (isDealable(game.grid, pieces)) chosen = pieces;
  }
  for (let attempt = 0; attempt < 30 && !chosen; attempt += 1) {
    const pieces = Array.from({ length: TRAY }, () => makePiece(shapeById(SMALL_IDS[Math.floor(game.rng() * SMALL_IDS.length)])));
    if (isDealable(game.grid, pieces)) chosen = pieces;
  }
  chosen ||= Array.from({ length: TRAY }, () => makePiece(shapeById('dot')));
  game.tray = chosen;
  game.deals += 1;
  game.events.push({ type: 'deal', deals: game.deals });
}

export const hasMove = game => game.tray.some(piece => piece && fits(game.grid, piece));

// 조각 하나를 놓습니다. 실패하면 상태를 바꾸지 않고 이유를 돌려줍니다.
export function place(game, slot, row, col) {
  if (game.phase !== 'playing') return { ok: false, reason: 'over' };
  const piece = game.tray[slot];
  if (!piece) return { ok: false, reason: 'empty' };
  if (!Number.isInteger(row) || !Number.isInteger(col) || !canPlace(game.grid, piece, row, col)) return { ok: false, reason: 'blocked' };

  const result = applyPlacement(game.grid, piece, row, col);
  game.grid = result.grid;
  game.tray[slot] = null;
  game.moves += 1;
  let gained = piece.size;
  let bonus = 0;
  if (result.lines > 0) {
    game.streak += 1;
    game.dry = 0;
    game.lines += result.lines;
    bonus = lineScore(result.lines) * Math.min(game.streak, MAX_COMBO);
    gained += bonus;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
  } else {
    game.dry += 1;
    if (game.dry >= COMBO_GRACE) game.streak = 0;
  }
  const allClear = result.lines > 0 && filledCount(game.grid) === 0;
  if (allClear) {
    gained += ALL_CLEAR_BONUS;
    game.allClears += 1;
  }
  game.score += gained;
  game.events.push({ type: 'place', slot, row, col, piece });
  if (result.lines > 0) {
    game.events.push({ type: 'clear', rows: result.rows, cols: result.cols, cells: result.cleared, lines: result.lines, streak: game.streak, bonus });
  }
  if (allClear) game.events.push({ type: 'allclear', bonus: ALL_CLEAR_BONUS });

  if (game.tray.every(item => !item)) dealTray(game);
  if (!hasMove(game)) {
    game.phase = 'over';
    game.events.push({ type: 'over', score: game.score });
  }
  return { ok: true, gained, bonus, lines: result.lines, streak: game.streak, allClear, over: game.phase === 'over' };
}
