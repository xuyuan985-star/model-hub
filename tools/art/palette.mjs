/* tools/art/palette.mjs — 《残响协议》像素母版调色板（24 色上限，含透明位）。 */
export const MASTER = [
  '#191F2B', // 0 透明占位（实际不写入）
  '#191F2B', // ink
  '#22262F', // ink2
  '#13161D', // night
  '#F4F5F7', // paper
  '#E7E3DA', // paper2
  '#CFC9BC', // paper3
  '#C5282F', // red
  '#8E1D22', // red2
  '#2B5B8A', // indigo
  '#1B3A5C', // indigo2
  '#5A86B4', // indigo3
  '#B68314', // gold
  '#7A5710', // gold2
  '#4E6B4A', // moss
  '#35492F', // moss2
  '#7A9469', // moss3
  '#8A6A4B', // wood
  '#5C4530', // wood2
  '#8A8F99', // stone
  '#5E636C', // stone2
  '#A8CBD6', // glass
  '#46C296', // glow
  '#C4713F'  // rust（Claude 向暖橙，留作立绘呼应）
];

/** 名字 → 母版索引，方便绘制代码只用语义名。 */
export const P = {
  ink: 1, ink2: 2, night: 3, paper: 4, paper2: 5, paper3: 6,
  red: 7, red2: 8, indigo: 9, indigo2: 10, indigo3: 11,
  gold: 12, gold2: 13, moss: 14, moss2: 15, moss3: 16,
  wood: 17, wood2: 18, stone: 19, stone2: 20, glass: 21, glow: 22, rust: 23
};

export function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/** 生成母版调色板数组（索引 0 为透明）。 */
export function masterPalette() {
  const pal = [[0, 0, 0]];
  for (let i = 1; i < MASTER.length; i++) pal.push(hexToRgb(MASTER[i]));
  return pal;
}
