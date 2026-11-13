import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, loadSave, recordRun, sanitizeSave, writeSave } from './storage.js';
import { THEMES, isUnlocked, shade, themeById, tileColors } from './themes.js';

const memory = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
};

test('저장된 값은 항목마다 검증하고 깨진 값은 기본값으로 되돌린다', () => {
  assert.deepEqual(sanitizeSave(null), defaultSave());
  assert.deepEqual(sanitizeSave('x'), defaultSave());
  const cleaned = sanitizeSave({ best: -5, linesTotal: 1.5, plays: '7', bestStreak: NaN, theme: '없는꽃밭', sound: 'yes' });
  assert.deepEqual(cleaned, defaultSave());
  assert.equal(sanitizeSave({ best: 120, linesTotal: 40, theme: 'ocean', sound: true }).theme, 'ocean');
});

test('아직 열리지 않은 꽃밭이 저장되어 있으면 기본 꽃밭으로 돌아간다', () => {
  assert.equal(sanitizeSave({ linesTotal: 10, theme: 'ocean' }).theme, 'garden');
  assert.equal(sanitizeSave({ linesTotal: 30, theme: 'ocean' }).theme, 'ocean');
});

test('저장소가 없거나 막혀 있어도 읽기와 쓰기가 게임을 멈추지 않는다', () => {
  assert.deepEqual(loadSave(null), defaultSave());
  const broken = { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } };
  assert.deepEqual(loadSave(broken), defaultSave());
  assert.equal(writeSave(broken, defaultSave()), false);
  assert.equal(writeSave(null, defaultSave()), true, '저장소가 없으면 조용히 건너뛴다');
  const store = memory({ 'petal-blocks.v1': '{깨진 JSON' });
  assert.deepEqual(loadSave(store), defaultSave());
});

test('쓴 값을 다시 읽으면 같다', () => {
  const store = memory();
  const save = { ...defaultSave(), best: 900, linesTotal: 55, plays: 3, bestStreak: 6, theme: 'ocean', sound: true };
  assert.equal(writeSave(store, save), true);
  assert.deepEqual(loadSave(store), save);
});

test('한 판의 결과를 합치고 새 기록과 새로 열린 꽃밭을 알려 준다', () => {
  const first = recordRun(defaultSave(), { score: 250, lines: 12, bestStreak: 4 });
  assert.equal(first.newBest, true);
  assert.deepEqual(first.unlocked, []);
  assert.equal(first.save.best, 250);
  assert.equal(first.save.plays, 1);
  const second = recordRun(first.save, { score: 100, lines: 20, bestStreak: 2 });
  assert.equal(second.newBest, false);
  assert.equal(second.save.best, 250);
  assert.equal(second.save.bestStreak, 4);
  assert.equal(second.save.linesTotal, 32);
  assert.deepEqual(second.unlocked.map(theme => theme.id), ['ocean']);
  const big = recordRun(second.save, { score: 1, lines: 400, bestStreak: 1 });
  assert.deepEqual(big.unlocked.map(theme => theme.id), ['sunset', 'mint']);
  assert.equal(recordRun(defaultSave(), { score: -1, lines: 'x' }).save.best, 0, '이상한 값은 0으로 본다');
});

test('꽃밭은 이름이 겹치지 않고 비용이 오름차순이며 기본 꽃밭은 처음부터 열려 있다', () => {
  assert.equal(new Set(THEMES.map(theme => theme.id)).size, THEMES.length);
  assert.equal(THEMES[0].cost, 0);
  assert.deepEqual(THEMES.map(theme => theme.cost), [...THEMES.map(theme => theme.cost)].sort((a, b) => a - b));
  assert.equal(themeById('없음').id, 'garden');
  assert.equal(isUnlocked('garden', 0), true);
  assert.equal(isUnlocked('mint', 249), false);
  assert.equal(isUnlocked('mint', 250), true);
  assert.equal(isUnlocked('없음', 999), false);
  for (const theme of THEMES) assert.equal(theme.tiles.length, 6, `${theme.id}: 타일 색 6가지`);
});

test('색 보정은 밝게·어둡게 바꾸고 범위를 벗어나지 않는다', () => {
  assert.equal(shade('#808080', 0), '#808080');
  assert.equal(shade('#808080', 1), '#ffffff');
  assert.equal(shade('#808080', -1), '#000000');
  assert.match(shade('#ff6f7d', 0.38), /^#[0-9a-f]{6}$/);
  const colors = tileColors(THEMES[0], 1);
  assert.equal(colors.base, THEMES[0].tiles[0]);
  assert.notEqual(colors.hi, colors.lo);
  assert.equal(tileColors(THEMES[0], 7).base, THEMES[0].tiles[0], '번호가 범위를 넘으면 처음으로 돌아간다');
});
