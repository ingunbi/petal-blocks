import { SIZE } from './shapes.js';
import { applyPlacement } from './engine.js';
import { BOARD, CELL, W, dragOrigin, layout, slotCenter, trayCell } from './layout.js';
import { tileColors } from './themes.js';

export const view = { H: 640 };

// ---------- 효과 상태 ----------
export function createFx() {
  return { t: 0, particles: [], texts: [], pops: [], clearing: [], flashes: [], shake: 0, dealAt: -10, overAt: null };
}

export function updateFx(fx, dt) {
  fx.t += dt;
  for (const p of fx.particles) {
    p.life -= dt;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  fx.particles = fx.particles.filter(p => p.life > 0);
  fx.texts = fx.texts.filter(text => fx.t - text.t0 < text.life);
  fx.pops = fx.pops.filter(pop => fx.t - pop.t0 < 0.3);
  fx.clearing = fx.clearing.filter(item => fx.t - item.t0 < 0.5);
  fx.flashes = fx.flashes.filter(flash => fx.t - flash.t0 < 0.45);
  fx.shake = Math.max(0, fx.shake - dt);
}

export function burstPetals(fx, x, y, color, count, { speed = 150, up = 90, gravity = 260, size = 5, life = 0.7 } = {}) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    fx.particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - up, gravity, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12, size: size * (0.7 + Math.random() * 0.6), life: life * (0.7 + Math.random() * 0.6), max: life, color });
  }
}

export function floatText(fx, text, x, y, { color = '#ffffff', size = 22, life = 0.9, rise = 44 } = {}) {
  fx.texts.push({ text, x, y, color, size, life, rise, t0: fx.t });
}

// ---------- 그리기 도구 ----------
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// 타일 한 칸. 위쪽이 밝고 아래쪽이 어두운 젤리 느낌에 꽃잎 무늬를 넣습니다.
export function drawTile(ctx, x, y, size, color, theme, { alpha = 1, scale = 1, flash = 0 } = {}) {
  const pad = size * 0.06;
  const s = (size - pad * 2) * scale;
  if (s <= 0.5) return;
  const left = x + size / 2 - s / 2;
  const top = y + size / 2 - s / 2;
  const { base, hi, lo } = tileColors(theme, color);
  ctx.save();
  ctx.globalAlpha = alpha;
  const gradient = ctx.createLinearGradient(0, top, 0, top + s);
  gradient.addColorStop(0, hi);
  gradient.addColorStop(0.5, base);
  gradient.addColorStop(1, lo);
  roundRect(ctx, left, top, s, s, s * 0.24);
  ctx.fillStyle = gradient;
  ctx.fill();
  if (s > 16) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(ctx, left + s * 0.1, top + s * 0.07, s * 0.8, s * 0.18, s * 0.09);
    ctx.fill();
    const cx = left + s / 2;
    const cy = top + s / 2 + s * 0.04;
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * s * 0.16, cy + Math.sin(angle) * s * 0.16, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  if (flash > 0) {
    ctx.globalAlpha = alpha * flash;
    roundRect(ctx, left, top, s, s, s * 0.24);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
}

// 조각 하나를 (x, y)를 왼쪽 위로 해서 그립니다.
function drawPiece(ctx, piece, x, y, cell, theme, options) {
  for (const [r, c] of piece.cells) drawTile(ctx, x + c * cell, y + r * cell, cell, piece.color, theme, options);
}

// 꽃밭 선택 버튼에 넣는 작은 그림입니다.
export function drawThemeIcon(ctx, theme, size) {
  ctx.fillStyle = theme.panel;
  roundRect(ctx, 0, 0, size, size, size * 0.2);
  ctx.fill();
  const cell = size * 0.38;
  const offset = (size - cell * 2) / 2;
  [[0, 0, 1], [0, 1, 3], [1, 0, 5], [1, 1, 2]].forEach(([r, c, color]) => drawTile(ctx, offset + c * cell, offset + r * cell, cell, color, theme));
}

// ---------- 화면 ----------
export function draw(ctx, game, fx, { theme, drag, reducedMotion = false }) {
  const lay = layout(view.H);
  const H = view.H;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (fx.shake > 0 && !reducedMotion) ctx.translate((Math.random() - 0.5) * fx.shake * 14, (Math.random() - 0.5) * fx.shake * 14);

  // 판 바탕
  ctx.fillStyle = theme.panel;
  roundRect(ctx, lay.boardX - 8, lay.boardY - 8, BOARD + 16, BOARD + 16, 18);
  ctx.fill();
  ctx.fillStyle = theme.cell;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      roundRect(ctx, lay.boardX + c * CELL + 2, lay.boardY + r * CELL + 2, CELL - 4, CELL - 4, 8);
      ctx.fill();
    }
  }

  // 놓을 자리 미리보기(지워질 줄 표시 포함)
  const held = drag ? game.tray[drag.slot] : null;
  const preview = held && drag.valid ? applyPlacement(game.grid, held, drag.row, drag.col) : null;
  const clearingRows = new Set(preview?.rows);
  const clearingCols = new Set(preview?.cols);

  // 놓인 타일
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const color = game.grid[r][c];
      if (!color) continue;
      const pop = fx.pops.find(item => item.row === r && item.col === c);
      const popScale = pop && !reducedMotion ? 1 + 0.18 * Math.sin(Math.min(1, (fx.t - pop.t0) / 0.3) * Math.PI) : 1;
      const lit = clearingRows.has(r) || clearingCols.has(c);
      drawTile(ctx, lay.boardX + c * CELL, lay.boardY + r * CELL, CELL, color, theme, { scale: popScale, flash: lit ? 0.28 + 0.12 * Math.sin(fx.t * 12) : 0 });
    }
  }
  if (preview) {
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    for (const r of clearingRows) { roundRect(ctx, lay.boardX - 2, lay.boardY + r * CELL, BOARD + 4, CELL, 10); ctx.stroke(); }
    for (const c of clearingCols) { roundRect(ctx, lay.boardX + c * CELL, lay.boardY - 2, CELL, BOARD + 4, 10); ctx.stroke(); }
    ctx.restore();
  }
  if (held && drag.valid) drawPiece(ctx, held, lay.boardX + drag.col * CELL, lay.boardY + drag.row * CELL, CELL, theme, { alpha: 0.5 });

  // 지워지는 타일 애니메이션
  for (const item of fx.clearing) {
    const k = (fx.t - item.t0 - item.delay) / 0.3;
    if (k < 0 || k > 1) continue;
    drawTile(ctx, item.x, item.y, CELL, item.color, theme, { scale: reducedMotion ? 1 : 1 - k * 0.9, alpha: 1 - k, flash: 0.7 * (1 - k) });
  }
  for (const flash of fx.flashes) {
    const k = (fx.t - flash.t0) / 0.45;
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - k);
    ctx.fillStyle = '#ffffff';
    for (const r of flash.rows) { roundRect(ctx, lay.boardX, lay.boardY + r * CELL, BOARD, CELL, 8); ctx.fill(); }
    for (const c of flash.cols) { roundRect(ctx, lay.boardX + c * CELL, lay.boardY, CELL, BOARD, 8); ctx.fill(); }
    ctx.restore();
  }

  // 트레이
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  roundRect(ctx, 10, lay.trayY - 4, W - 20, lay.trayH + 8, 18);
  ctx.fill();
  game.tray.forEach((piece, slot) => {
    if (!piece) return;
    const wait = Math.max(0, fx.t - fx.dealAt - slot * 0.08);
    const k = reducedMotion ? 1 : Math.min(1, wait / 0.28);
    const ease = 1 - (1 - k) ** 3;
    const cell = trayCell(piece);
    const center = slotCenter(lay, slot);
    const dragging = drag && drag.slot === slot;
    drawPiece(ctx, piece, center.x - (piece.w * cell) / 2, center.y - (piece.h * cell) / 2 + (1 - ease) * 46, cell, theme, { alpha: (dragging ? 0.22 : 1) * ease });
  });

  // 들고 있는 조각: 손가락 위쪽에 원래 크기로 뜹니다.
  if (held) {
    const origin = drag.mode === 'key' ? { x: lay.boardX + drag.col * CELL, y: lay.boardY + drag.row * CELL } : dragOrigin(held, drag.x, drag.y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const [r, c] of held.cells) {
      roundRect(ctx, origin.x + c * CELL + 5, origin.y + r * CELL + 12, CELL - 4, CELL - 4, 9);
      ctx.fill();
    }
    drawPiece(ctx, held, origin.x, origin.y, CELL, theme, { alpha: drag.valid ? 1 : 0.9 });
  }

  // 꽃잎 입자와 점수 글자
  for (const p of fx.particles) {
    const a = Math.min(1, p.life / (p.max * 0.5));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const text of fx.texts) {
    const k = (fx.t - text.t0) / text.life;
    const scale = reducedMotion ? 1 : 1 + 0.35 * Math.max(0, 1 - k * 6);
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
    ctx.translate(text.x, text.y - k * text.rise);
    ctx.scale(scale, scale);
    ctx.font = `900 ${text.size}px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,10,40,0.75)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text.text, 0, 0);
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// 화면 위의 좌표(논리 단위)로 칸의 중심을 구합니다. 효과 위치 계산용입니다.
export const cellCenter = (row, col) => {
  const lay = layout(view.H);
  return { x: lay.boardX + (col + 0.5) * CELL, y: lay.boardY + (row + 0.5) * CELL };
};
