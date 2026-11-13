// 테스트 전용 자동 플레이어입니다(게임 화면에서는 쓰지 않습니다). 사람처럼 지금 남은 조각을 어떤 순서로 어디에 놓을지
// 미리 짜 본 다음 첫 수를 둡니다. 줄을 많이 지우고 구멍·떨어진 빈 칸을 적게 만드는 계획을 고릅니다.
// 조각 분배가 공정한지(잘 두면 오래 버틸 수 있는지) 확인하는 데 씁니다.
import { SIZE } from './shapes.js';
import { applyPlacement, filledCount, findPlacements, place } from './engine.js';

// 격자의 ‘나쁜 정도’: 작게 갇힌 빈 영역과 사방이 막힌 칸, 채워진 칸 수를 감점합니다.
export function badness(grid) {
  let penalty = filledCount(grid) * 0.6;
  const seen = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (grid[r][c] || seen[r][c]) continue;
      let size = 0;
      const stack = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {
        const [y, x] = stack.pop();
        size += 1;
        for (const [ny, nx] of [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]]) {
          if (ny < 0 || nx < 0 || ny >= SIZE || nx >= SIZE || grid[ny][nx] || seen[ny][nx]) continue;
          seen[ny][nx] = true;
          stack.push([ny, nx]);
        }
      }
      if (size < 4) penalty += (4 - size) * 6;
    }
  }
  return penalty;
}

const BEAM = 6;

// 남은 조각 목록으로 만들 수 있는 최선의 계획을 찾아 첫 수를 돌려줍니다.
export function chooseMove(game) {
  const slots = game.tray.map((piece, slot) => (piece ? slot : -1)).filter(slot => slot >= 0);
  let best = null;
  const search = (grid, left, first, gained) => {
    if (!left.length) {
      const value = gained - badness(grid);
      if (!best || value > best.value) best = { ...first, value };
      return;
    }
    const options = [];
    for (const slot of left) {
      for (const { row, col } of findPlacements(grid, game.tray[slot])) {
        const result = applyPlacement(grid, game.tray[slot], row, col);
        options.push({ slot, row, col, result, score: result.lines * 40 - badness(result.grid) });
      }
    }
    if (!options.length) { // 더 놓을 수 없으면 지금까지의 계획을 끝으로 봅니다.
      const value = gained - badness(grid) - 200;
      if (first && (!best || value > best.value)) best = { ...first, value };
      return;
    }
    options.sort((a, b) => b.score - a.score);
    for (const option of options.slice(0, BEAM)) {
      search(option.result.grid, left.filter(slot => slot !== option.slot), first || { slot: option.slot, row: option.row, col: option.col }, gained + option.result.lines * 40);
    }
  };
  search(game.grid, slots, null, 0);
  return best;
}

// 끝날 때까지(또는 maxMoves까지) 둡니다. 둔 수를 돌려줍니다.
export function playOut(game, maxMoves = 2000) {
  let moves = 0;
  while (game.phase === 'playing' && moves < maxMoves) {
    const move = chooseMove(game);
    if (!move) break;
    if (!place(game, move.slot, move.row, move.col).ok) break;
    moves += 1;
  }
  return moves;
}
