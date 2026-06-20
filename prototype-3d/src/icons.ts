// 法宝图标：按"技能形态"生成线性 SVG 字形，按"品阶"上色。
// 纯函数、零外部素材；用于底部法宝栏 / 图鉴 / 市集 / 背包，让每件法宝一眼可辨。
import { RARITY_COLOR, type SkillForm, type Treasure } from "./upgrades";

// 每种形态一套内联 SVG 字形（viewBox 0 0 24 24，描边为 currentColor，由外层按品阶着色）
const SKILL_GLYPH: Record<SkillForm, string> = {
  // 飞剑：竖刃 + 护手 + 柄
  sword: `<line x1="12" y1="3.5" x2="12" y2="13.5"/><line x1="8.5" y1="13.5" x2="15.5" y2="13.5"/><line x1="12" y1="13.5" x2="12" y2="20.5"/><circle cx="12" cy="20.5" r="0.7" fill="currentColor" stroke="none"/>`,
  // 剑环：外环 + 核心 + 四向环刃
  orbit: `<circle cx="12" cy="12" r="6.6"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><line x1="12" y1="3.4" x2="12" y2="6"/><line x1="20.6" y1="12" x2="18" y2="12"/><line x1="12" y1="20.6" x2="12" y2="18"/><line x1="3.4" y1="12" x2="6" y2="12"/>`,
  // 阵爆：核心 + 八向爆射
  nova: `<circle cx="12" cy="12" r="3.2"/><line x1="12" y1="2.5" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="18.7" y2="18.7"/><line x1="16.2" y1="7.8" x2="18.7" y2="5.3"/><line x1="7.8" y1="16.2" x2="5.3" y2="18.7"/>`,
  // 妖弹：法球 + 双尾迹
  bolt: `<circle cx="14.5" cy="11" r="4"/><path d="M10.6 10.6 L4 8.2"/><path d="M10.6 12.4 L4.6 15"/>`,
  // 落雷：闪电折线
  strike: `<path d="M13.5 3 L7.5 12.5 H11 L9.5 21 L17.5 10 H13.5 Z" fill="currentColor" fill-opacity="0.16"/>`,
  // 刀气：扇形嵌套弧
  arc: `<path d="M4.5 17.5 A12 12 0 0 1 17.5 4.5"/><path d="M7 17 A9 9 0 0 1 17 7" opacity="0.6"/><path d="M9.5 16.5 A6.5 6.5 0 0 1 16.5 9.5" opacity="0.4"/>`,
  // 罡气：贴身同心光环
  aura: `<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="8" opacity="0.5"/>`,
  // 连雷：双道链式折线
  chain: `<path d="M5 5.5 L9 9.5 L6 12.5 L10.5 17.5"/><path d="M14 6.5 L18 10.5 L15 13.5 L18.5 17" opacity="0.55"/>`,
  // 天降：三道下坠箭
  rain: `<line x1="7" y1="3.5" x2="7" y2="12.5"/><path d="M5.3 10.6 L7 12.8 L8.7 10.6"/><line x1="12" y1="6" x2="12" y2="16.5"/><path d="M10.3 14.6 L12 16.8 L13.7 14.6"/><line x1="17" y1="3.5" x2="17" y2="12.5"/><path d="M15.3 10.6 L17 12.8 L18.7 10.6"/>`,
  // 掷刀：大新月刃 + 柄
  glaive: `<path d="M6.5 6.5 A9 9 0 1 0 17.8 17.8"/><path d="M8.2 8.2 A6.6 6.6 0 1 0 16 16" opacity="0.5"/><line x1="6.5" y1="6.5" x2="4.2" y2="4.2"/>`,
  // 周天：核心 + 八向长芒
  radial: `<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><line x1="12" y1="2.5" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21.5" y2="12"/><line x1="4.8" y1="4.8" x2="9.2" y2="9.2"/><line x1="14.8" y1="14.8" x2="19.2" y2="19.2"/><line x1="14.8" y1="9.2" x2="19.2" y2="4.8"/><line x1="9.2" y1="14.8" x2="4.8" y2="19.2"/>`,
  // 斗转：螺旋弹幕
  spiral: `<path d="M12 12 a1.6 1.6 0 0 1 1.6 -1.6 a3.6 3.6 0 0 1 3.6 3.6 a5.6 5.6 0 0 1 -5.6 5.6 a7.6 7.6 0 0 1 -7.6 -7.6 a9 9 0 0 1 9 -9"/>`,
  // 直进：贯穿双箭头
  forward: `<line x1="3.5" y1="12" x2="13.5" y2="12"/><path d="M9.5 7.5 L15 12 L9.5 16.5"/><path d="M14.5 8.5 L19 12 L14.5 15.5" opacity="0.55"/>`,
  // 枪刺：长枪芒 + 枪头
  lance: `<line x1="5" y1="19" x2="16.2" y2="7.8"/><path d="M14.4 5.4 L19 4 L17.6 8.6 Z" fill="currentColor" fill-opacity="0.18"/>`,
  // 旋身斩：环形旋斩
  whirl: `<path d="M19 12 A7 7 0 1 1 16.4 6.6"/><path d="M19.6 9 L16.4 6.6 L13.7 9"/>`,
  // 坠星：星 + 斜坠尾
  meteor: `<path d="M16 6.5 l1.3 2.8 2.8 1.3 -2.8 1.3 -1.3 2.8 -1.3 -2.8 -2.8 -1.3 2.8 -1.3 z" fill="currentColor" fill-opacity="0.16"/><path d="M11.5 12.5 L4 20"/><path d="M13.5 10.5 L7 17" opacity="0.5"/>`,
  // 符阵：嵌套法阵菱形
  sigil: `<path d="M12 3.4 L20.6 12 L12 20.6 L3.4 12 Z"/><path d="M12 8 L16 12 L12 16 L8 12 Z" opacity="0.55"/>`,
  // 缠藤：藤蔓 + 叶
  vine: `<path d="M5 20 C8 16 7 12 11 10 S 16 6 19 7"/><path d="M11 10 l2.2 -1.4 -0.4 2.4 z" fill="currentColor" stroke="none" opacity="0.7"/><path d="M14.6 8 l2.3 0.4 -1.4 1.9 z" fill="currentColor" stroke="none" opacity="0.7"/>`,
  // 回旋镖：折返 V + 飞弧
  boomerang: `<path d="M5 7 L11.6 13.6 Q12 14 12.4 13.6 L19 7"/><path d="M6 9.5 Q12 4.5 18 9.5" opacity="0.4"/>`,
  // 旋刃：锯齿环刃（中心轮毂 + 八向锯齿）
  bladering: `<circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6.4"/><line x1="12" y1="2.6" x2="12" y2="5.6"/><line x1="12" y1="18.4" x2="12" y2="21.4"/><line x1="2.6" y1="12" x2="5.6" y2="12"/><line x1="18.4" y1="12" x2="21.4" y2="12"/><line x1="5.4" y1="5.4" x2="7.5" y2="7.5"/><line x1="16.5" y1="16.5" x2="18.6" y2="18.6"/><line x1="16.5" y1="7.5" x2="18.6" y2="5.4"/><line x1="7.5" y1="16.5" x2="5.4" y2="18.6"/>`,
};

// 生成单件法宝图标（品阶决定主色，形态决定字形）
export function treasureIconSvg(t: Treasure): string {
  const color = RARITY_COLOR[t.rarity];
  const glyph = SKILL_GLYPH[t.skill] ?? SKILL_GLYPH.sword;
  return `<svg class="tic" viewBox="0 0 24 24" style="color:${color}" aria-hidden="true"><rect class="tic-bg" x="1.5" y="1.5" width="21" height="21" rx="6"/><g class="tic-glyph">${glyph}</g></svg>`;
}
