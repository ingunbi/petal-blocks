import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, SIZE, SMALL_IDS, makePiece, shapeById } from './shapes.js';

test('조각 모양은 서로 겹치지 않는 이름을 갖고 가로세로 범위 안의 칸으로만 이루어진다', () => {
  assert.equal(new Set(SHAPES.map(shape => shape.id)).size, SHAPES.length);
  for (const shape of SHAPES) {
    assert.ok(shape.weight > 0, `${shape.id}: 가중치`);
    assert.ok(shape.color >= 1 && shape.color <= 6, `${shape.id}: 색 번호`);
    assert.equal(new Set(shape.cells.map(([r, c]) => `${r},${c}`)).size, shape.size, `${shape.id}: 칸이 겹치지 않는다`);
    assert.ok(shape.size >= 1 && shape.w <= 5 && shape.h <= 5 && shape.w <= SIZE && shape.h <= SIZE, `${shape.id}: 크기`);
    for (const [r, c] of shape.cells) assert.ok(r >= 0 && c >= 0 && r < shape.h && c < shape.w, `${shape.id}: 범위`);
  }
});

test('모든 조각은 한 덩어리로 이어져 있고 줄 마스크와 칸 목록이 일치한다', () => {
  for (const shape of SHAPES) {
    const key = ([r, c]) => `${r},${c}`;
    const cells = new Set(shape.cells.map(key));
    const seen = new Set([key(shape.cells[0])]);
    const stack = [shape.cells[0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const next of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (cells.has(key(next)) && !seen.has(key(next))) { seen.add(key(next)); stack.push(next); }
      }
    }
    assert.equal(seen.size, shape.size, `${shape.id}: 이어진 조각이어야 한다`);
    shape.rowMasks.forEach((mask, r) => {
      for (let c = 0; c < shape.w; c += 1) assert.equal(Boolean(mask & (1 << c)), cells.has(key([r, c])), `${shape.id}: ${r},${c}`);
    });
  }
});

test('가로 세로 방향마다 조각이 빠짐없이 갖춰져 있다', () => {
  // 돌릴 수 없는 게임이므로 한 방향만 있는 조각이 있으면 불공평합니다.
  const normalize = shape => shape.cells.map(([r, c]) => `${r},${c}`).sort().join('|');
  const rotate = shape => normalize({ cells: shape.cells.map(([r, c]) => [c, shape.h - 1 - r]) });
  const all = new Set(SHAPES.map(normalize));
  for (const shape of SHAPES) {
    let current = shape;
    for (let turn = 0; turn < 4; turn += 1) {
      const cells = current.cells.map(([r, c]) => [c, current.h - 1 - r]);
      const w = current.h;
      const h = current.w;
      const min = [Math.min(...cells.map(([r]) => r)), Math.min(...cells.map(([, c]) => c))];
      current = { cells: cells.map(([r, c]) => [r - min[0], c - min[1]]), w, h };
      assert.ok(all.has(normalize(current)), `${shape.id}: ${turn + 1}번 돌린 모양이 목록에 있어야 한다`);
    }
    assert.ok(rotate(shape).length > 0);
  }
});

test('작은 조각 목록은 모두 실제 조각이고 makePiece는 서로 다른 번호를 붙인다', () => {
  for (const id of SMALL_IDS) assert.ok(shapeById(id), id);
  const a = makePiece(shapeById('dot'));
  const b = makePiece(shapeById('dot'));
  assert.notEqual(a.uid, b.uid);
  assert.equal(a.id, b.id);
  assert.ok(Object.isFrozen(a));
});
