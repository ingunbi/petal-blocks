import { THEMES, isUnlocked } from './themes.js';

const KEY = 'petal-blocks.v1';
const LIMIT = 1_000_000_000;
const count = value => Number.isInteger(value) && value >= 0 && value <= LIMIT;

export const defaultSave = () => ({ best: 0, linesTotal: 0, plays: 0, bestStreak: 0, theme: 'garden', sound: false });

// 저장된 값은 믿지 않고 항목마다 검증합니다. 깨진 값은 기본값으로 되돌립니다.
export function sanitizeSave(value) {
  const base = defaultSave();
  if (!value || typeof value !== 'object') return base;
  const save = {
    best: count(value.best) ? value.best : base.best,
    linesTotal: count(value.linesTotal) ? value.linesTotal : base.linesTotal,
    plays: count(value.plays) ? value.plays : base.plays,
    bestStreak: count(value.bestStreak) ? value.bestStreak : base.bestStreak,
    theme: THEMES.some(theme => theme.id === value.theme) ? value.theme : base.theme,
    sound: value.sound === true
  };
  if (!isUnlocked(save.theme, save.linesTotal)) save.theme = base.theme;
  return save;
}

// 저장소가 막혀 있어도(개인정보 보호 모드 등) 게임은 그대로 실행됩니다.
export function loadSave(storage) {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? sanitizeSave(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(storage, save) {
  try {
    storage?.setItem(KEY, JSON.stringify(sanitizeSave(save)));
    return true;
  } catch {
    return false;
  }
}

// 한 판의 결과를 합칩니다. 새 기록과 새로 열린 꽃밭을 함께 돌려줍니다.
export function recordRun(save, run) {
  const score = count(run.score) ? run.score : 0;
  const lines = count(run.lines) ? run.lines : 0;
  const streak = count(run.bestStreak) ? run.bestStreak : 0;
  const linesTotal = Math.min(LIMIT, save.linesTotal + lines);
  return {
    save: sanitizeSave({ ...save, best: Math.max(save.best, score), linesTotal, bestStreak: Math.max(save.bestStreak, streak), plays: save.plays + 1 }),
    newBest: score > save.best,
    unlocked: THEMES.filter(theme => theme.cost > save.linesTotal && theme.cost <= linesTotal)
  };
}
