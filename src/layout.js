import { SIZE } from './shapes.js';

// 화면 배치입니다. 논리 너비는 360으로 고정하고, 높이는 화면 비율(640~800)에 맞춰 바뀝니다.
export const W = 360;
export const CELL = 40; // 판 위의 한 칸
export const BOARD = CELL * SIZE;
export const BOARD_X = (W - BOARD) / 2;
export const SLOT_W = W / 3;
export const TRAY_H = 120;
export const HUD_H = 100; // 위쪽 점수 표시 영역
export const LIFT = 44; // 손가락이 조각을 가리지 않도록 조각을 손가락 위로 띄우는 간격

export function layout(H) {
  const content = HUD_H + BOARD + 30 + TRAY_H + 20;
  const extra = Math.max(0, H - content);
  const boardY = HUD_H + extra * 0.38;
  return { H, boardX: BOARD_X, boardY, trayY: boardY + BOARD + 30 + extra * 0.3, trayH: TRAY_H };
}

// 트레이에서 눌린 칸 번호(0~2). 손가락이 닿기 쉽도록 위아래를 넉넉하게 잡습니다.
export function slotAt(lay, x, y) {
  if (y < lay.trayY - 28 || y > lay.trayY + lay.trayH + 50 || x < 0 || x >= W) return -1;
  return Math.min(2, Math.floor(x / SLOT_W));
}

// 트레이 안에서 조각을 그릴 때의 한 칸 크기입니다. 5칸짜리 줄도 칸 안에 들어옵니다.
export const trayCell = piece => Math.min(34, 104 / Math.max(piece.w, piece.h));

export const slotCenter = (lay, slot) => ({ x: SLOT_W * (slot + 0.5), y: lay.trayY + lay.trayH / 2 });

// 손가락 위치(px, py)에 대한 조각의 왼쪽 위 모서리입니다. 조각은 손가락 위쪽 가운데에 뜹니다.
export const dragOrigin = (piece, px, py) => ({ x: px - (piece.w * CELL) / 2, y: py - LIFT - piece.h * CELL });

// 손가락 위치에서 가장 가까운 격자 칸(왼쪽 위 기준)입니다. 판 밖이어도 숫자를 돌려주며, 놓을 수 있는지는 엔진이 판단합니다.
export function dragCell(lay, piece, px, py) {
  const origin = dragOrigin(piece, px, py);
  return { row: Math.round((origin.y - lay.boardY) / CELL), col: Math.round((origin.x - lay.boardX) / CELL) };
}
