import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, CELL, HUD_H, LIFT, SLOT_W, TRAY_H, W, dragCell, dragOrigin, layout, slotAt, slotCenter, trayCell } from './layout.js';
import { makePiece, shapeById } from './shapes.js';

const piece = id => makePiece(shapeById(id));

test('화면 높이가 640에서 800 사이여도 판과 트레이가 화면 안에 겹치지 않고 들어간다', () => {
  for (const H of [640, 667, 720, 760, 800]) {
    const lay = layout(H);
    assert.ok(lay.boardY >= HUD_H, `H=${H}: 판은 점수 영역 아래`);
    assert.ok(lay.boardY + BOARD < lay.trayY, `H=${H}: 판과 트레이가 겹치지 않는다`);
    assert.ok(lay.trayY + TRAY_H <= H, `H=${H}: 트레이가 화면 안에 있다`);
    assert.equal(lay.boardX * 2 + BOARD, W, `H=${H}: 판이 가로 가운데`);
  }
});

test('트레이의 칸 번호는 가로 위치로 정해지고 트레이 밖은 -1이다', () => {
  const lay = layout(700);
  const y = lay.trayY + 40;
  assert.equal(slotAt(lay, 10, y), 0);
  assert.equal(slotAt(lay, SLOT_W + 1, y), 1);
  assert.equal(slotAt(lay, W - 1, y), 2);
  assert.equal(slotAt(lay, 100, lay.boardY + 100), -1, '판 위를 누르면 조각이 아니다');
  assert.equal(slotAt(lay, -5, y), -1);
  assert.equal(slotAt(lay, W, y), -1);
});

test('트레이 안의 조각은 칸 안에 들어오는 크기로 그린다', () => {
  for (const id of ['dot', 'h5', 'v5', 'sq3', 'g1']) {
    const p = piece(id);
    const cell = trayCell(p);
    assert.ok(cell * p.w <= SLOT_W - 8 && cell * p.h <= TRAY_H - 8, id);
  }
  const lay = layout(700);
  assert.equal(slotCenter(lay, 1).x, W / 2);
});

test('손가락 위치를 격자 칸으로 바꾼다: 조각은 손가락 위쪽 가운데에 뜬다', () => {
  const lay = layout(700);
  const sq = piece('sq2');
  // 원하는 칸(3, 4)의 왼쪽 위 모서리가 되도록 손가락을 둔다.
  const px = lay.boardX + 4 * CELL + (sq.w * CELL) / 2;
  const py = lay.boardY + 3 * CELL + LIFT + sq.h * CELL;
  assert.deepEqual(dragCell(lay, sq, px, py), { row: 3, col: 4 });
  assert.deepEqual(dragOrigin(sq, px, py), { x: lay.boardX + 4 * CELL, y: lay.boardY + 3 * CELL });
  // 반 칸 안쪽은 가장 가까운 칸으로 붙는다
  assert.deepEqual(dragCell(lay, sq, px + CELL * 0.4, py - CELL * 0.4), { row: 3, col: 4 });
  assert.deepEqual(dragCell(lay, sq, px + CELL * 0.6, py + CELL * 0.6), { row: 4, col: 5 });
  // 판 바깥이면 범위 밖 숫자를 돌려준다(놓을 수 있는지는 엔진이 판단한다)
  assert.ok(dragCell(lay, sq, 5, lay.trayY).row > 7 || dragCell(lay, sq, 5, lay.trayY).col < 0);
});
