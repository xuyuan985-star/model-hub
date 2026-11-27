/* tools/art/tokens.mjs — 像素资产共用常量：外轮廓色与深色底样张。
   外轮廓必须与深色主题底拉开对比（ART-SPEC §0 要求 ≥1.6:1），因此不再用墨色 #191F2B 描边。 */
export const OUTLINE_RGB = [0x4a, 0x5a, 0x70]; // #4A5A70 冷灰蓝
export const OUTLINE_HEX = '#4A5A70';
/** 深色主题底（ASSET 与 UI 两套），用于对比度自检。 */
export const DARK_BASES = [
  { name: 'base13161D', rgb: [0x13, 0x16, 0x1d] },
  { name: 'base191B2D', rgb: [0x19, 0x1b, 0x2d] }
];
export function relLum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export function contrastRatio(a, b) {
  const l1 = relLum(a), l2 = relLum(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
}
