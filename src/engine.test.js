import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CLEAR_BONUS, MAX_COMBO, applyPlacement, canPlace, createGame, dealTray, drainEvents, emptyGrid, filledCount,
  findPlacements, hasMove, isDealable, lineScore, place, previewClear
} from './engine.js';
import { SIZE, makePiece, shapeById } from './shapes.js';
import { mulberry32 } from './rng.js';
import { playOut } from './bot.js';

const piece = id => makePiece(shapeById(id));

// '#'이 있는 칸을 채운 격자를 만듭니다. 줄 글자 수는 8입니다.
const boardFrom = lines => lines.map(line => [...line].map(ch => (ch === '#' ? 1 : 0)));

// 원하는 격자와 조각으로 시작하는 게임을 만듭니다.
function setup(lines, ids, seed = 1) {
  const game = createGame({ seed });
  game.grid = lines ? boardFrom(lines) : emptyGrid();
  game.tray = ids.map(id => (id ? piece(id) : null));
  drainEvents(game);
  return game;
}

const snapshot = game => JSON.stringify({ grid: game.grid, tray: game.tray.map(p => p && p.id), score: game.score, moves: game.moves, streak: game.streak, dry: game.dry, phase: game.phase, events: game.events.length });

test('새 판은 빈 8×8 격자와 조각 세 개로 시작한다', () => {
  const game = createGame({ seed: 5 });
  assert.equal(game.grid.length, SIZE);
  assert.ok(game.grid.every(row => row.length === SIZE && row.every(cell => cell === 0)));
  assert.equal(game.tray.length, 3);
  assert.ok(game.tray.every(Boolean));
  assert.equal(game.score, 0);
  assert.equal(game.phase, 'playing');
});

test('조각은 빈 칸에만 놓을 수 있고 격자 밖이나 겹치는 자리는 거부한다', () => {
  const grid = boardFrom(['#.......', '........', '........', '........', '........', '........', '........', '........']);
  assert.equal(canPlace(grid, piece('h2'), 0, 0), false, '채워진 칸과 겹침');
  assert.equal(canPlace(grid, piece('h2'), 0, 1), true);
  assert.equal(canPlace(grid, piece('h3'), 0, 6), false, '오른쪽 밖');
  assert.equal(canPlace(grid, piece('h3'), 0, 5), true, '오른쪽 끝에 딱 맞음');
  assert.equal(canPlace(grid, piece('v3'), 6, 0), false, '아래쪽 밖');
  assert.equal(canPlace(grid, piece('dot'), -1, 0), false, '위쪽 밖');
  assert.equal(canPlace(grid, piece('dot'), 0, -1), false, '왼쪽 밖');
  assert.equal(findPlacements(grid, piece('sq3')).length, (SIZE - 2) ** 2 - 1, '3×3은 왼쪽 위 자리 하나만 막힌다');
});

test('거부된 놓기는 상태를 바꾸지 않는다', () => {
  const game = setup(['#.......', '........', '........', '........', '........', '........', '........', '........'], ['h2', null, 'dot']);
  const before = snapshot(game);
  assert.deepEqual(place(game, 0, 0, 0), { ok: false, reason: 'blocked' });
  assert.deepEqual(place(game, 1, 4, 4), { ok: false, reason: 'empty' });
  assert.equal(place(game, 0, 1.5, 2).ok, false);
  assert.equal(place(game, 0, NaN, 2).ok, false);
  assert.equal(place(game, 7, 2, 2).ok, false, '없는 칸 번호');
  assert.equal(snapshot(game), before);
});

test('가로 한 줄이 차면 지워지고 놓은 칸 수와 줄 점수가 더해진다', () => {
  // 맨 위 왼쪽에 한 칸을 더 두어 판이 비지 않게 합니다(올클리어 보너스가 섞이지 않도록).
  const game = setup(['#.......', '........', '........', '........', '........', '........', '........', '#####...'], ['h3', 'dot', 'dot']);
  const result = place(game, 0, 7, 5);
  assert.equal(result.ok, true);
  assert.equal(result.lines, 1);
  assert.equal(result.gained, 3 + lineScore(1) * 1);
  assert.equal(game.score, 13);
  assert.equal(game.lines, 1);
  assert.equal(filledCount(game.grid), 1);
  const clear = drainEvents(game).find(event => event.type === 'clear');
  assert.equal(clear.cells.length, 8);
  assert.deepEqual(clear.rows, [7]);
});

test('가로와 세로를 동시에 채우면 겹치는 칸은 한 번만 지우고 줄 점수는 두 줄로 센다', () => {
  const game = setup(['.#######', '#.......', '#.......', '#.......', '#.......', '#.......', '#.......', '#.......'], ['dot', 'dot', 'dot']);
  const result = place(game, 0, 0, 0);
  assert.equal(result.lines, 2);
  assert.equal(result.gained, 1 + lineScore(2) + ALL_CLEAR_BONUS, '판이 모두 비므로 올클리어 보너스도 받는다');
  const clear = drainEvents(game).find(event => event.type === 'clear');
  assert.equal(clear.cells.length, 15, '8 + 8 − 겹친 1칸');
  assert.equal(new Set(clear.cells.map(cell => `${cell.row},${cell.col}`)).size, 15);
  assert.equal(filledCount(game.grid), 0);
  assert.equal(game.allClears, 1);
});

test('가로 세 줄을 한꺼번에 지우면 3줄 점수를 받는다', () => {
  const game = setup(['#######.', '#######.', '#######.', '........', '........', '........', '........', '........'], ['v3', 'dot', 'dot']);
  const result = place(game, 0, 0, 7);
  assert.equal(result.lines, 3);
  assert.equal(result.bonus, 60);
  assert.equal(result.gained, 3 + 60 + ALL_CLEAR_BONUS, '남은 칸이 없으므로 올클리어 보너스도 받는다');
});

test('연속으로 줄을 지우면 콤보 배수가 오른다', () => {
  const game = setup(['#######.', '#######.', '#######.', '........', '........', '........', '........', '........'], ['dot', 'dot', 'dot']);
  const bonuses = [0, 1, 2].map(r => place(game, r, r, 7).bonus);
  assert.deepEqual(bonuses, [10, 20, 30]);
  assert.equal(game.streak, 3);
  assert.equal(game.bestStreak, 3);
});

test('콤보 배수는 상한을 넘지 않는다', () => {
  const game = setup(null, ['dot', 'dot', 'dot']);
  game.streak = 25;
  game.grid = boardFrom(['#######.', '........', '........', '........', '........', '........', '........', '........']);
  const result = place(game, 0, 0, 7);
  assert.equal(result.bonus, lineScore(1) * MAX_COMBO);
  assert.equal(game.streak, 26, '횟수는 계속 센다');
});

test('줄을 못 지운 채 세 번 놓으면 콤보가 끊기고, 두 번까지는 이어진다', () => {
  const lines = ['#######.', '........', '........', '........', '........', '........', '........', '........'];
  const kept = setup(lines, ['dot', 'dot', 'dot']);
  place(kept, 0, 0, 7); // 줄 지움 → 콤보 1
  place(kept, 1, 4, 4);
  place(kept, 2, 6, 6);
  assert.equal(kept.streak, 1, '두 번 놓은 상태에서는 콤보 유지');
  kept.tray[0] = piece('dot');
  kept.grid[1] = [1, 1, 1, 1, 1, 1, 1, 0];
  assert.equal(place(kept, 0, 1, 7).bonus, 20, '두 번 건너뛰고 지우면 콤보가 이어진다');

  const broken = setup(lines, ['dot', 'dot', 'dot']);
  place(broken, 0, 0, 7);
  broken.tray = [piece('dot'), piece('dot'), piece('dot')];
  place(broken, 0, 3, 3);
  place(broken, 1, 5, 5);
  place(broken, 2, 6, 1);
  assert.equal(broken.streak, 0, '세 번 못 지우면 콤보가 끊긴다');
});

test('판을 모두 비우면 올클리어 보너스를 받는다', () => {
  const game = setup(['........', '........', '........', '........', '........', '........', '........', '#######.'], ['dot', 'dot', 'dot']);
  const result = place(game, 0, 7, 7);
  assert.equal(result.allClear, true);
  assert.equal(result.gained, 1 + lineScore(1) + ALL_CLEAR_BONUS);
  assert.ok(drainEvents(game).some(event => event.type === 'allclear'));
});

test('세 조각을 모두 놓으면 새 조각 세 개가 나온다', () => {
  const game = setup(null, ['dot', 'dot', 'dot']);
  const deals = game.deals;
  place(game, 0, 0, 0);
  place(game, 1, 0, 2);
  assert.equal(game.deals, deals);
  assert.equal(game.tray[0], null);
  place(game, 2, 0, 4);
  assert.equal(game.deals, deals + 1);
  assert.ok(game.tray.every(Boolean));
  assert.ok(drainEvents(game).some(event => event.type === 'deal'));
});

// 줄마다 빈 칸이 두 개(r열과 r+4열)씩 있어 칸 하나를 채워도 줄이 완성되지 않고, 2×2는 어디에도 들어가지 않는 판입니다.
const GAPPED = Array.from({ length: SIZE }, (_, r) => [...'########'].map((ch, c) => (c === r || c === (r + 4) % SIZE ? '.' : ch)).join(''));
// 대각선 칸만 비어 있는 판: 칸 하나를 채우면 그 가로·세로 줄이 완성되어 지워진다.
const DIAGONAL = Array.from({ length: SIZE }, (_, r) => [...'########'].map((ch, c) => (c === r ? '.' : ch)).join(''));

test('남은 조각을 놓을 곳이 없으면 게임이 끝나고, 끝난 뒤에는 놓을 수 없다', () => {
  const game = setup(GAPPED, ['dot', 'sq2', 'sq2']);
  const result = place(game, 0, 0, 0);
  assert.equal(result.ok, true);
  assert.equal(result.over, true);
  assert.equal(game.phase, 'over');
  assert.ok(drainEvents(game).some(event => event.type === 'over'));
  const before = snapshot(game);
  assert.deepEqual(place(game, 1, 0, 2), { ok: false, reason: 'over' });
  assert.equal(snapshot(game), before);
});

test('놓을 수 있는 조각이 하나라도 남아 있으면 끝나지 않는다', () => {
  const game = setup(GAPPED, ['dot', 'dot', 'sq2']);
  assert.equal(place(game, 0, 0, 0).over, false);
  assert.equal(game.phase, 'playing');
  assert.equal(hasMove(game), true);
});

test('줄을 지운 뒤에 생긴 빈자리로 남은 조각을 놓을 수 있으면 끝나지 않는다', () => {
  // 지금은 2×2가 들어갈 곳이 없지만, 점 하나를 놓으면 가로·세로 줄이 지워져 자리가 생긴다.
  const game = setup(DIAGONAL, ['dot', 'sq2', 'sq2']);
  assert.equal(hasMove({ ...game, tray: [null, piece('sq2'), piece('sq2')] }), false);
  const result = place(game, 0, 0, 0);
  assert.equal(result.lines, 2);
  assert.equal(game.phase, 'playing', '지워진 자리에 2×2를 놓을 수 있다');
});

test('미리보기는 실제로 놓았을 때 지워지는 줄과 같다', () => {
  const grid = boardFrom(['#######.', '#######.', '........', '........', '........', '........', '........', '........']);
  const p = piece('v2');
  const preview = previewClear(grid, p, 0, 7);
  const real = applyPlacement(grid, p, 0, 7);
  assert.deepEqual(preview, { rows: real.rows, cols: real.cols, lines: real.lines });
  assert.equal(preview.lines, 2, '가로 두 줄만 지워진다(7열은 아직 비어 있다)');
  assert.equal(grid[0][7], 0, '원본 격자는 바뀌지 않는다');
});

test('조각 묶음 풀이기는 놓을 수 있는 묶음과 없는 묶음을 구별한다', () => {
  assert.equal(isDealable(emptyGrid(), [piece('sq3'), piece('h5'), piece('g1')]), true);
  assert.equal(isDealable(boardFrom(GAPPED), [piece('dot'), piece('sq2'), piece('dot')]), false, '2×2가 들어갈 곳이 없다');
  assert.equal(isDealable(boardFrom(GAPPED), [piece('dot'), piece('dot'), piece('dot')]), true);
  // 줄이 지워지며 생기는 자리까지 계산한다: 2×2는 지금은 못 놓지만 점 하나가 줄을 지우고 나면 놓을 수 있다.
  const clearing = boardFrom(DIAGONAL);
  assert.equal(isDealable(clearing, [piece('dot'), piece('sq2'), piece('dot')]), true);
  assert.equal(isDealable(clearing, [piece('sq2'), piece('sq2'), piece('sq2')]), false);
});

test('새로 나눠 주는 조각은 판이 어떤 상태여도 놓을 수 있는 조각을 준다', () => {
  const rng = mulberry32(2026);
  let dense = 0;
  for (let round = 0; round < 300; round += 1) {
    const game = createGame({ seed: round + 1 });
    const density = 0.1 + rng() * 0.62;
    const grid = emptyGrid();
    for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) grid[r][c] = rng() < density ? 1 + Math.floor(rng() * 6) : 0;
    // 이미 가득 찬 줄이 없는 판만 시험합니다.
    for (let r = 0; r < SIZE; r += 1) if (grid[r].every(Boolean)) grid[r][Math.floor(rng() * SIZE)] = 0;
    for (let c = 0; c < SIZE; c += 1) if (grid.every(row => row[c])) grid[Math.floor(rng() * SIZE)][c] = 0;
    game.grid = grid;
    dealTray(game);
    const empty = SIZE * SIZE - filledCount(grid);
    if (empty >= 3) assert.equal(isDealable(grid, game.tray), true, `라운드 ${round}: 빈 칸 ${empty}개인데 놓을 수 없는 묶음`);
    if (density > 0.5) dense += 1;
  }
  assert.ok(dense > 50, '꽉 찬 판도 충분히 시험했다');
});

test('점수는 놓을 때마다 얻은 점수의 합과 같고 격자 칸 수는 놓은 칸에서 지운 칸을 뺀 값과 같다', () => {
  const game = createGame({ seed: 11 });
  let gained = 0;
  let placed = 0;
  let cleared = 0;
  for (let i = 0; i < 400 && game.phase === 'playing'; i += 1) {
    const options = [];
    game.tray.forEach((p, slot) => { if (p) for (const spot of findPlacements(game.grid, p)) options.push({ slot, ...spot }); });
    const pick = options[Math.floor(options.length / 2)];
    placed += game.tray[pick.slot].size;
    const result = place(game, pick.slot, pick.row, pick.col);
    gained += result.gained;
    for (const event of drainEvents(game)) if (event.type === 'clear') cleared += event.cells.length;
  }
  assert.equal(game.score, gained);
  assert.equal(filledCount(game.grid), placed - cleared);
});

test('같은 시드와 같은 수를 두면 결과가 똑같다', () => {
  const a = createGame({ seed: 77 });
  const b = createGame({ seed: 77 });
  playOut(a, 120);
  playOut(b, 120);
  assert.equal(a.score, b.score);
  assert.equal(a.moves, b.moves);
  assert.equal(JSON.stringify(a.grid), JSON.stringify(b.grid));
  assert.deepEqual(a.tray.map(p => p && p.id), b.tray.map(p => p && p.id));
  const c = createGame({ seed: 78 });
  playOut(c, 120);
  assert.notEqual(JSON.stringify(c.grid) + c.score, JSON.stringify(a.grid) + a.score, '시드가 다르면 다른 판이 된다');
});

test('앞을 내다보고 두는 자동 플레이어는 여러 시드에서 오래 버틴다', () => {
  const moves = [];
  for (let seed = 1; seed <= 8; seed += 1) {
    const game = createGame({ seed });
    moves.push(playOut(game, 600));
    assert.ok(game.score > 0);
  }
  moves.sort((a, b) => a - b);
  assert.ok(moves[0] >= 40, `가장 짧게 끝난 판도 40수 이상이어야 한다: ${moves.join(', ')}`);
  assert.ok(moves[Math.floor(moves.length / 2)] >= 200, `중간값이 200수 이상이어야 한다: ${moves.join(', ')}`);
});

test('무작위 한 칸 두기만 반복해도 조각 분배가 중간에 막히지 않고 끝은 놓을 곳이 없을 때만 온다', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const game = createGame({ seed });
    const rng = mulberry32(seed * 31);
    let steps = 0;
    while (game.phase === 'playing' && steps < 800) {
      const options = [];
      game.tray.forEach((p, slot) => { if (p) for (const spot of findPlacements(game.grid, p)) options.push({ slot, ...spot }); });
      assert.ok(options.length > 0, '진행 중인 판에는 놓을 곳이 있어야 한다');
      const pick = options[Math.floor(rng() * options.length)];
      assert.equal(place(game, pick.slot, pick.row, pick.col).ok, true);
      steps += 1;
    }
    if (game.phase === 'over') assert.equal(game.tray.some(p => p && findPlacements(game.grid, p).length), false, '끝났다면 정말 놓을 곳이 없어야 한다');
  }
});
