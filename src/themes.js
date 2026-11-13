// 꽃밭은 지금까지 지운 줄의 합계로 열립니다. 줄을 쓰지는 않으므로 한 번 열면 계속 쓸 수 있습니다.
// tiles[0]~[5]는 조각 색 1~6번입니다.
export const THEMES = [
  { id: 'garden', name: '밤 정원', cost: 0, bg: ['#2a1f4d', '#4b2f73'], panel: '#1c1538', cell: '#2b2354', accent: '#ffd54a',
    tiles: ['#ff6f7d', '#ffb347', '#8be05a', '#3fd0c9', '#5ba8ff', '#b48bff'] },
  { id: 'ocean', name: '깊은 바다', cost: 30, bg: ['#0c2a4d', '#0f5a7a'], panel: '#0a2038', cell: '#143556', accent: '#9ff3ff',
    tiles: ['#ff8fa3', '#ffd166', '#7bdff2', '#a0e8af', '#b8a1ff', '#f4a261'] },
  { id: 'sunset', name: '노을 언덕', cost: 100, bg: ['#4a1d2c', '#8a3b3b'], panel: '#34141f', cell: '#4b2432', accent: '#ffe066',
    tiles: ['#ff5d73', '#ffa94d', '#ffe066', '#8ce99a', '#74c0fc', '#da77f2'] },
  { id: 'mint', name: '박하 숲', cost: 250, bg: ['#1b4d44', '#2f7a64'], panel: '#133a34', cell: '#205249', accent: '#fff3b0',
    tiles: ['#ff8787', '#ffd43b', '#a9e34b', '#66d9e8', '#91a7ff', '#f783ac'] }
];

export const themeById = id => THEMES.find(theme => theme.id === id) || THEMES[0];
export const isUnlocked = (themeId, linesTotal) => THEMES.some(theme => theme.id === themeId) && linesTotal >= themeById(themeId).cost;

// 16진수 색을 밝게(+) 또는 어둡게(−) 만듭니다. amount는 -1~1입니다.
export function shade(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = shift => {
    const base = (value >> shift) & 255;
    const mixed = amount >= 0 ? base + (255 - base) * amount : base * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(mixed)));
  };
  return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

const cache = new Map();
// 타일 색 번호(1~6)에 맞는 기본·밝은·어두운 색을 돌려줍니다.
export function tileColors(theme, color) {
  const key = `${theme.id}:${color}`;
  let colors = cache.get(key);
  if (!colors) {
    const base = theme.tiles[(color - 1 + theme.tiles.length) % theme.tiles.length];
    colors = { base, hi: shade(base, 0.38), lo: shade(base, -0.24) };
    cache.set(key, colors);
  }
  return colors;
}
