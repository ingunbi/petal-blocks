// 조각 목록입니다. 가로·세로 줄, 네모, ㄱ자, T, S·Z 같은 흔한 블록 모양을 새로 정의했습니다. 돌릴 수 없으므로 방향마다 따로 둡니다.
export const SIZE = 8;

const parse = rows => rows.flatMap((line, r) => [...line].flatMap((ch, c) => (ch === '#' ? [[r, c]] : [])));

function define(id, rows, weight, color) {
  const cells = parse(rows);
  const rowMasks = rows.map(line => [...line].reduce((mask, ch, c) => (ch === '#' ? mask | (1 << c) : mask), 0));
  return Object.freeze({
    id, cells: Object.freeze(cells), rowMasks: Object.freeze(rowMasks),
    w: Math.max(...rows.map(line => line.length)), h: rows.length, size: cells.length, weight, color
  });
}

export const SHAPES = Object.freeze([
  define('dot', ['#'], 2, 6),
  define('h2', ['##'], 4, 5), define('v2', ['#', '#'], 4, 5),
  define('h3', ['###'], 4, 4), define('v3', ['#', '#', '#'], 4, 4),
  define('h4', ['####'], 3, 3), define('v4', ['#', '#', '#', '#'], 3, 3),
  define('h5', ['#####'], 1.5, 1), define('v5', ['#', '#', '#', '#', '#'], 1.5, 1),
  define('sq2', ['##', '##'], 4, 2),
  define('sq3', ['###', '###', '###'], 1.5, 6),
  define('r23', ['###', '###'], 2.5, 5), define('r32', ['##', '##', '##'], 2.5, 5),
  define('c1', ['#.', '##'], 3, 1), define('c2', ['.#', '##'], 3, 1), define('c3', ['##', '#.'], 3, 1), define('c4', ['##', '.#'], 3, 1),
  define('l1', ['#.', '#.', '##'], 2, 4), define('l2', ['.#', '.#', '##'], 2, 4), define('l3', ['##', '#.', '#.'], 2, 4), define('l4', ['##', '.#', '.#'], 2, 4),
  define('l5', ['###', '#..'], 2, 4), define('l6', ['###', '..#'], 2, 4), define('l7', ['#..', '###'], 2, 4), define('l8', ['..#', '###'], 2, 4),
  define('t1', ['###', '.#.'], 2.5, 6), define('t2', ['.#.', '###'], 2.5, 6), define('t3', ['#.', '##', '#.'], 2.5, 6), define('t4', ['.#', '##', '.#'], 2.5, 6),
  define('s1', ['.##', '##.'], 2, 3), define('s2', ['##.', '.##'], 2, 3), define('s3', ['#.', '##', '.#'], 2, 3), define('s4', ['.#', '##', '#.'], 2, 3),
  define('g1', ['#..', '#..', '###'], 1.2, 2), define('g2', ['..#', '..#', '###'], 1.2, 2), define('g3', ['###', '#..', '#..'], 1.2, 2), define('g4', ['###', '..#', '..#'], 1.2, 2)
]);

export const shapeById = id => SHAPES.find(shape => shape.id === id);

// 판이 가득 찼을 때 비상용으로 나누는 작은 조각들입니다.
export const SMALL_IDS = Object.freeze(['dot', 'h2', 'v2', 'c1', 'c2', 'c3', 'c4', 'h3', 'v3']);

let serial = 0;
// 조각 하나를 만듭니다. uid는 화면에서 같은 조각을 알아보는 데 씁니다.
export const makePiece = shape => Object.freeze({ ...shape, uid: ++serial });
