// 같은 시드는 같은 길을 만듭니다. 테스트와 재현을 위해 Math.random 대신 사용합니다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// 주소의 ?seed= 값처럼 사용자가 넣은 값을 안전한 32비트 정수로 바꿉니다. 올바르지 않으면 무작위 시드를 돌려줍니다.
export function normalizeSeed(value) {
  if (value !== null && value !== undefined && String(value).trim() !== '') {
    const number = Number(value);
    if (Number.isFinite(number)) return Math.abs(Math.trunc(number)) >>> 0;
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
