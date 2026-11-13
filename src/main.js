import { canPlace, createGame, drainEvents, findPlacements, place } from './engine.js';
import { SIZE } from './shapes.js';
import { CELL, W, dragCell, layout, slotAt } from './layout.js';
import { burstPetals, cellCenter, createFx, draw, drawThemeIcon, floatText, updateFx, view } from './renderer.js';
import { createAudio } from './audio.js';
import { normalizeSeed } from './rng.js';
import { THEMES, isUnlocked, themeById, tileColors } from './themes.js';
import { loadSave, recordRun, writeSave } from './storage.js';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? normalizeSeed(params.get('seed')) : null; // ?seed=숫자 로 같은 조각 순서를 다시 만날 수 있습니다.
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const storage = (() => { try { return window.localStorage; } catch { return null; } })();
let save = loadSave(storage);
const audio = createAudio();
let soundWanted = save.sound;

const canvas = $('#game');
const ctx = canvas.getContext('2d');
const stage = $('.stage');
const overlay = $('#overlay');
const panels = { intro: $('#intro-panel'), pause: $('#pause-panel'), result: $('#result-panel') };
const hint = $('#hint');
const announcer = $('#announcer');
const el = { score: $('#score'), best: $('#best'), combo: $('#combo'), comboN: $('#combo-n'), pause: $('#pause-button'), sound: $('#sound-button') };

const TIPS = [
  '큰 조각은 빈 줄이 넓을 때 먼저 놓아 보세요.',
  '줄을 이어서 지우면 콤보 배수가 올라가요. 세 번 안에 다시 지워 보세요.',
  '한 칸짜리 빈 구멍을 만들지 않으면 오래 버텨요.',
  '손가락 위로 떠오른 조각을 보면서 놓을 자리를 맞춰요.'
];

let game;
let fx = createFx();
let ui = 'intro'; // intro → playing ⇄ paused → over
let drag = null;
let resultShown = false;
let shownScore = 0;
let lastBest = -1;
let lastCombo = -1;
let lastDry = -1;

const theme = () => themeById(save.theme);

// ---------- 화면 상태 ----------
function setPanel(name) {
  overlay.hidden = !name;
  for (const [key, node] of Object.entries(panels)) node.hidden = key !== name;
  overlay.dataset.panel = name || '';
  if (name) (panels[name].querySelector('button:not([aria-disabled="true"])') || panels[name]).focus?.({ preventScroll: true });
}

function announce(text) {
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = text; });
}

function applyTheme() {
  const t = theme();
  stage.style.background = `linear-gradient(180deg, ${t.bg[0]}, ${t.bg[1]})`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg[0]);
}

function syncHud(dt) {
  const target = game.score;
  if (shownScore !== target) {
    shownScore = reducedMotion || target < shownScore ? target : Math.min(target, shownScore + Math.max(1, Math.ceil((target - shownScore) * Math.min(1, dt * 9))));
    el.score.textContent = String(shownScore);
  }
  const best = Math.max(save.best, game.score);
  if (best !== lastBest) { lastBest = best; el.best.textContent = String(best); }
  const combo = game.streak >= 2 ? game.streak : 0;
  if (combo !== lastCombo) {
    lastCombo = combo;
    el.combo.hidden = combo === 0;
    el.comboN.textContent = String(combo);
  }
  if (game.dry !== lastDry) { lastDry = game.dry; el.combo.dataset.dry = String(Math.min(2, game.dry)); }
}

function newRun() {
  game = createGame({ seed: fixedSeed ?? normalizeSeed(null) });
  fx = createFx();
  fx.dealAt = fx.t;
  drag = null;
  resultShown = false;
  shownScore = 0;
  lastBest = lastCombo = lastDry = -1;
  el.score.textContent = '0';
  hint.hidden = true;
  drainEvents(game);
  syncHud(0);
}

function beginPlay() {
  wakeAudio();
  ui = 'playing';
  setPanel(null);
  hint.hidden = game.moves > 0;
  fx.dealAt = fx.t;
  canvas.focus({ preventScroll: true });
}

function restart() {
  newRun();
  beginPlay();
}

function pause() {
  if (ui !== 'playing' || game.phase !== 'playing') return;
  drag = null;
  ui = 'paused';
  setPanel('pause');
}

function resume() {
  if (ui !== 'paused') return;
  ui = 'playing';
  setPanel(null);
  canvas.focus({ preventScroll: true });
}

function showResult() {
  if (resultShown) return;
  resultShown = true;
  ui = 'over';
  const score = game.score;
  const outcome = recordRun(save, { score, lines: game.lines, bestStreak: game.bestStreak });
  save = outcome.save;
  writeSave(storage, save);
  $('#result-title').textContent = outcome.newBest && score > 0 ? '새 기록!' : score < 300 ? '다음엔 더 멀리!' : score < 1500 ? '좋은 솜씨예요!' : '꽃밭의 달인!';
  $('#result-score').textContent = String(score);
  $('#result-best').textContent = String(save.best);
  $('#result-lines').textContent = String(game.lines);
  $('#result-combo').textContent = String(game.bestStreak);
  $('#result-note').textContent = outcome.unlocked.length
    ? `새 꽃밭이 열렸어요: ${outcome.unlocked.map(item => item.name).join(', ')}! 처음 화면의 꽃밭 고르기에서 바꿀 수 있어요.`
    : TIPS[game.moves % TIPS.length];
  if (outcome.newBest && score > 0) audio.play('best');
  setPanel('result');
  announce(`놓을 곳이 없어요. ${score}점. 최고 기록 ${save.best}점.`);
  renderThemes();
}

// ---------- 꽃밭 고르기 ----------
function renderThemes() {
  const list = $('#theme-list');
  list.textContent = '';
  for (const item of THEMES) {
    const unlocked = isUnlocked(item.id, save.linesTotal);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme';
    button.dataset.id = item.id;
    button.dataset.cost = unlocked ? '' : `${item.cost}줄`;
    button.setAttribute('aria-pressed', String(save.theme === item.id));
    button.setAttribute('aria-disabled', String(!unlocked));
    button.setAttribute('aria-label', unlocked ? item.name : `${item.name}, 지운 줄 ${item.cost}개 필요`);
    const icon = document.createElement('canvas');
    icon.width = 96; icon.height = 96;
    const c = icon.getContext('2d');
    c.scale(2, 2);
    if (!unlocked) c.globalAlpha = 0.3;
    drawThemeIcon(c, item, 48);
    const label = document.createElement('span');
    label.textContent = item.name;
    button.append(icon, label);
    button.addEventListener('click', () => {
      if (!isUnlocked(item.id, save.linesTotal)) { $('#theme-note').textContent = `${item.name}은(는) 줄을 ${item.cost}개 지우면 열려요. 지금까지 ${save.linesTotal}개 지웠어요.`; return; }
      save = { ...save, theme: item.id };
      writeSave(storage, save);
      $('#theme-note').textContent = `${item.name}에서 놀아요!`;
      applyTheme();
      renderThemes();
    });
    list.append(button);
  }
}

// ---------- 효과·소리 ----------
function handleEvents() {
  const t = theme();
  for (const event of drainEvents(game)) {
    if (event.type === 'place') {
      for (const [r, c] of event.piece.cells) fx.pops.push({ row: event.row + r, col: event.col + c, t0: fx.t });
      audio.play('place');
    } else if (event.type === 'clear') {
      const cx = event.cells.reduce((sum, cell) => sum + cell.col, 0) / event.cells.length;
      const cy = event.cells.reduce((sum, cell) => sum + cell.row, 0) / event.cells.length;
      for (const cell of event.cells) {
        const { x, y } = cellCenter(cell.row, cell.col);
        fx.clearing.push({ x: x - CELL / 2, y: y - CELL / 2, color: cell.color, t0: fx.t, delay: Math.hypot(cell.col - cx, cell.row - cy) * 0.025 });
        if (Math.random() < 0.55) burstPetals(fx, x, y, tileColors(t, cell.color).hi, 2, { speed: 130 + event.lines * 25 });
      }
      fx.flashes.push({ rows: event.rows, cols: event.cols, t0: fx.t });
      const center = cellCenter(cy, cx);
      floatText(fx, `+${event.bonus}`, center.x, center.y, { color: t.accent, size: 24 + Math.min(10, event.lines * 3) });
      if (event.streak >= 2) floatText(fx, `콤보 ×${event.streak}`, center.x, center.y + 30, { color: '#ffffff', size: 20, life: 1.1 });
      if (event.lines >= 2) fx.shake = Math.min(0.4, 0.12 * event.lines);
      audio.play('clear', { streak: event.streak, lines: event.lines });
      announce(`${event.lines}줄 지웠어요${event.streak >= 2 ? `. 콤보 ${event.streak}` : ''}`);
    } else if (event.type === 'allclear') {
      const center = cellCenter(3.5, 3.5);
      floatText(fx, `모두 비웠어요! +${event.bonus}`, center.x, center.y - 40, { color: '#ffffff', size: 26, life: 1.6, rise: 30 });
      for (let i = 0; i < 4; i += 1) burstPetals(fx, center.x + (Math.random() - 0.5) * 200, center.y + (Math.random() - 0.5) * 160, tileColors(t, 1 + i).hi, 14, { speed: 220, life: 1 });
      fx.shake = 0.35;
      audio.play('allclear');
      announce('판을 모두 비웠어요');
    } else if (event.type === 'deal') {
      fx.dealAt = fx.t;
    } else if (event.type === 'over') {
      fx.overAt = fx.t;
      audio.play('over');
    }
  }
}

function wakeAudio() {
  if (soundWanted && !audio.enabled) audio.setEnabled(true);
}

function updateSoundButton() {
  el.sound.setAttribute('aria-pressed', String(soundWanted));
  el.sound.setAttribute('aria-label', soundWanted ? '소리 끄기' : '소리 켜기');
  el.sound.title = soundWanted ? '소리 끄기 (M)' : '소리 켜기 (M)';
}

function toggleSound() {
  soundWanted = !soundWanted;
  audio.setEnabled(soundWanted);
  soundWanted = audio.enabled || !soundWanted ? soundWanted : false; // 오디오를 쓸 수 없는 환경이면 켜짐으로 두지 않습니다.
  save = { ...save, sound: soundWanted };
  writeSave(storage, save);
  updateSoundButton();
  if (soundWanted) audio.play('pick');
  announce(soundWanted ? '소리를 켰어요' : '소리를 껐어요');
}

// ---------- 조각 놓기 ----------
function aim(x, y) {
  const piece = game.tray[drag.slot];
  const cell = dragCell(layout(view.H), piece, x, y);
  drag.x = x; drag.y = y; drag.row = cell.row; drag.col = cell.col;
  drag.valid = canPlace(game.grid, piece, cell.row, cell.col);
}

function dropPiece() {
  const { slot, row, col, mode } = drag;
  if (!place(game, slot, row, col).ok) { audio.play('nope'); if (mode !== 'key') drag = null; return false; } // 키보드는 고른 조각을 그대로 둡니다.
  drag = null;
  hint.hidden = true;
  handleEvents();
  if (mode === 'key') pickByKey(game.tray.findIndex(Boolean), row, col);
  return true;
}

// ---------- 포인터(마우스·터치) 입력 ----------
function toLogical(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: ((event.clientX - rect.left) * W) / rect.width, y: ((event.clientY - rect.top) * view.H) / rect.height };
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== undefined && event.button > 0) return;
  if (ui !== 'playing' || game.phase !== 'playing' || (drag && drag.mode === 'pointer')) return;
  const { x, y } = toLogical(event);
  const slot = slotAt(layout(view.H), x, y);
  if (slot < 0 || !game.tray[slot]) return;
  wakeAudio();
  drag = { slot, mode: 'pointer', id: event.pointerId, x, y, row: 0, col: 0, valid: false, startX: x, startY: y };
  aim(x, y);
  hint.hidden = true;
  audio.play('pick');
  try { canvas.setPointerCapture(event.pointerId); } catch { /* 일부 환경에서는 캡처를 지원하지 않습니다. */ }
});
canvas.addEventListener('pointermove', event => {
  if (!drag || drag.mode !== 'pointer' || event.pointerId !== drag.id) return;
  const { x, y } = toLogical(event);
  aim(x, y);
});
canvas.addEventListener('pointerup', event => {
  if (!drag || drag.mode !== 'pointer' || event.pointerId !== drag.id) return;
  const { x, y } = toLogical(event);
  aim(x, y);
  const moved = Math.hypot(x - drag.startX, y - drag.startY) > 12;
  if (drag.valid) dropPiece();
  else { if (moved) audio.play('nope'); drag = null; }
});
canvas.addEventListener('pointercancel', () => { if (drag?.mode === 'pointer') drag = null; });
canvas.addEventListener('contextmenu', event => event.preventDefault());

// ---------- 키보드 입력 ----------
// 1·2·3으로 조각을 고르고 방향키로 옮긴 뒤 Enter·Space로 놓습니다.
function pickByKey(slot, nearRow = 3, nearCol = 3) {
  const piece = game.tray[slot];
  if (!piece || game.phase !== 'playing') { drag = null; return; }
  const spots = findPlacements(game.grid, piece);
  const spot = spots.length
    ? spots.reduce((best, item) => (Math.hypot(item.row - nearRow, item.col - nearCol) < Math.hypot(best.row - nearRow, best.col - nearCol) ? item : best))
    : { row: Math.min(nearRow, SIZE - piece.h), col: Math.min(nearCol, SIZE - piece.w) };
  drag = { slot, mode: 'key', row: spot.row, col: spot.col, valid: canPlace(game.grid, piece, spot.row, spot.col), x: 0, y: 0 };
  audio.play('pick');
}

function moveByKey(dr, dc) {
  if (!drag) { const first = game.tray.findIndex(Boolean); if (first >= 0) pickByKey(first); return; }
  const piece = game.tray[drag.slot];
  drag.row = Math.max(0, Math.min(SIZE - piece.h, drag.row + dr));
  drag.col = Math.max(0, Math.min(SIZE - piece.w, drag.col + dc));
  drag.valid = canPlace(game.grid, piece, drag.row, drag.col);
}

const KEY_MOVES = { ArrowUp: [-1, 0], w: [-1, 0], W: [-1, 0], ArrowDown: [1, 0], s: [1, 0], S: [1, 0], ArrowLeft: [0, -1], a: [0, -1], A: [0, -1], ArrowRight: [0, 1], d: [0, 1], D: [0, 1] };

window.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  const onButton = event.target instanceof Element && event.target.closest('button');
  const playing = ui === 'playing' && game.phase === 'playing';
  if (playing && KEY_MOVES[key]) {
    event.preventDefault();
    moveByKey(...KEY_MOVES[key]);
  } else if (playing && (key === '1' || key === '2' || key === '3')) {
    pickByKey(Number(key) - 1);
  } else if (playing && drag?.mode === 'key' && (key === 'Enter' || key === ' ') && !onButton) {
    event.preventDefault();
    dropPiece();
  } else if (key === 'p' || key === 'P' || key === 'Escape') {
    if (playing && drag?.mode === 'key' && key === 'Escape') drag = null;
    else if (ui === 'paused') resume(); else pause();
  } else if (key === 'm' || key === 'M') {
    toggleSound();
  } else if ((key === 'Enter' || key === ' ') && !onButton) {
    event.preventDefault();
    if (ui === 'intro') beginPlay(); else if (ui === 'over') restart(); else if (ui === 'paused') resume();
  } else if ((key === 'r' || key === 'R') && (ui === 'over' || ui === 'paused')) {
    restart();
  }
});

$('#start-button').addEventListener('click', beginPlay);
$('#resume-button').addEventListener('click', resume);
$('#pause-restart-button').addEventListener('click', restart);
$('#restart-button').addEventListener('click', restart);
el.pause.addEventListener('click', () => { if (ui === 'paused') resume(); else pause(); });
el.sound.addEventListener('click', toggleSound);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- 화면 맞춤·루프 ----------
function resize() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false; // 아직 배치되지 않았거나 숨겨진 상태에서는 그리지 않습니다.
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  view.H = Math.min(800, Math.max(640, (W * rect.height) / rect.width)); // 가로 배율 기준으로 논리 높이를 정합니다.
  const scale = width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return true;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (ui !== 'paused') {
    handleEvents();
    updateFx(fx, dt);
  }
  if (resize()) draw(ctx, game, fx, { theme: theme(), drag, reducedMotion });
  syncHud(dt);
  if (ui === 'playing' && game.phase === 'over' && fx.overAt !== null && fx.t - fx.overAt > 1.0) showResult();
  requestAnimationFrame(frame);
}

newRun();
applyTheme();
renderThemes();
updateSoundButton();
setPanel('intro');
requestAnimationFrame(frame);

if (params.has('debug')) {
  // 확인용: 같은 처리 경로로 조각을 놓아 볼 수 있습니다.
  window.__petalBlocks = {
    get game() { return game; }, get save() { return save; }, get fx() { return fx; }, get drag() { return drag; },
    placeAt(slot, row, col) { drag = { slot, mode: 'debug', row, col, valid: true, x: 0, y: 0 }; return dropPiece(); }
  };
}
