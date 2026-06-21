// 法宝图鉴 HTML 构建（纯函数，只依赖 upgrades 数据，无渲染/DOM 状态）。从 main.ts 抽出。
import {
  RARITY_COLOR,
  RARITY_LABEL,
  TAG_COLOR,
  TAG_HINT,
  SYNERGIES,
  SKILL_LABEL,
  starAttack,
  starCd,
  treasureText,
  type Treasure,
  type Rarity,
  type SkillForm,
} from "./upgrades";
import { treasureIconSvg } from "./icons";

// ---- 图鉴·法宝卡（按品阶分组；名/羁绊/属性 自上而下；点击直接进详情） ----
const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

// 单张法宝卡：图标+名（顶）→ 羁绊标签（中）→ 攻/冷属性（底）。整卡可点，单击进详情。
export function codexCard(t: Treasure): string {
  const k = SKILL_LABEL[t.skill];
  const tags = t.tags.map((tag) => `<span class="cc-tag" style="--tc:${TAG_COLOR[tag]}">${tag}</span>`).join("");
  const stat = `攻 ${starAttack(t)} · 冷 ${starCd(t)}s${t.count && t.count > 1 ? ` · ×${t.count}` : ""}`;
  return `<button class="codex-card" data-tid="${t.id}" style="--rc:${RARITY_COLOR[t.rarity]}">
    <div class="cc-head"><span class="cc-ic">${treasureIconSvg(t)}</span><div class="cc-name" style="color:${RARITY_COLOR[t.rarity]}">${t.name}</div></div>
    <div class="cc-tags">${tags}<span class="cc-form">${k.name}·${k.form}</span></div>
    <div class="cc-stat">${stat}</div>
  </button>`;
}

// 整页：按品阶分组（普通→传说），组内为 3~4 列卡片网格
export function codexListHtml(treasures: Treasure[]): string {
  return RARITY_ORDER.map((r) => {
    const list = treasures.filter((t) => t.rarity === r);
    if (!list.length) return "";
    return `<div class="codex-rgroup"><div class="codex-rhead" style="--rc:${RARITY_COLOR[r]}">${RARITY_LABEL[r]}<span>${list.length}</span></div><div class="codex-grid">${list.map(codexCard).join("")}</div></div>`;
  }).join("");
}

// 技能形态的可读说明（详情弹层用）
export const SKILL_FORM_DESC: Record<SkillForm, string> = {
  sword: "锁定最近之敌，射出可穿透的飞剑，贯穿成排敌人。",
  orbit: "数把剑环身旋绕，持续切割触碰到的敌人。",
  nova: "以自身为中心的范围爆发，震伤四周。",
  bolt: "自动追踪敌人的法弹，命中即炸（妖系击杀还会裂变）。",
  strike: "点名最近之敌，当头劈下范围落雷。",
  arc: "朝行进方向挥出扇形刀气，横扫一片。",
  aura: "贴身持续光环，无需索敌、高频灼烧近敌。",
  chain: "雷电在敌群间链式弹跳，逐个传导。",
  rain: "在范围内自天降下多发打击，覆盖一片。",
  glaive: "掷出大刀，沿圆弧轨迹飞出再斩返，穿击成排。",
  radial: "向八方均分齐射，不锁敌、覆盖全向。",
  spiral: "发射角逐次旋转，连发汇成螺旋弹幕。",
  forward: "沿当前朝向直线射出，破阵直进。",
  lance: "锁定方向射出超长枪芒，洞穿一整列敌人。",
  whirl: "旋身一周，环身刀气全圈尽斩并震退近敌。",
  meteor: "在敌群上空召落巨大坠星，落地大范围重炸 + 击退。",
  sigil: "在敌群处投下法阵，停留数秒持续减速并磨伤。",
  vine: "自脚下向多方蔓生低速藤鞭，缠滞并磨伤。",
  boomerang: "掷出法轮，划大弧飞出再返回，往返穿击。",
  bladering: "数把旋刃环身高速旋绕、自转切割，触敌即斩；按品阶变换刃形（品阶越高刃越多越炫）。",
  laser: "向四周固定方向激射数道柱状激光、瞬间发射而出再淡出（不旋转）；品阶越高光柱越多（白2/绿4/蓝6/紫7/橙8）。",
};

// 法宝详情 HTML（标签解读 / 形态 / 星级缩放 / 特性 / 标签羁绊）
export function treasureDetailHtml(t: Treasure): string {
  const color = RARITY_COLOR[t.rarity];
  const k = SKILL_LABEL[t.skill];
  const valLabel = "攻击";
  const head = [`<th>星级</th>`, `<th>${valLabel}</th>`, `<th>冷却</th>`];
  if (t.count && t.count > 1) head.push(`<th>发数</th>`);
  if (t.radius) head.push(`<th>半径</th>`);
  const rows = [1, 2, 3].map((s) => {
    const ts: Treasure = { ...t, star: s };
    const cells = [`<td class="cd-star">${"★".repeat(s)}</td>`, `<td>${starAttack(ts)}</td>`, `<td>${starCd(ts)}s</td>`];
    if (t.count && t.count > 1) cells.push(`<td>×${t.count}</td>`);
    if (t.radius) cells.push(`<td>${t.radius}</td>`);
    return `<tr>${cells.join("")}</tr>`;
  }).join("");

  const tagHtml = t.tags.map((tag) => `<span class="cd-tag">${tag}</span><span class="cd-taghint">${TAG_HINT[tag]}</span>`).join("");

  const notes: string[] = [];
  const tt = t.traits;
  if (tt?.slow) notes.push("减速：命中令敌人移动变慢。");
  if (tt?.burn) notes.push("灼烧：命中后持续掉血、可致死。");
  if (tt?.knock) notes.push("击退强化：把敌人狠狠弹开。");
  if (tt?.pierce) notes.push("穿透：洞穿成列敌人。");
  if (tt?.bounce) notes.push("弹射：雷光额外弹跳更多目标。");
  if (tt?.fork) notes.push("分叉：击杀时裂出追踪子弹，连锁清场。");
  if (tt?.magnet) notes.push("吸附：命中把敌人拉向自身、聚成团。");
  if (t.skill === "sword" || t.skill === "glaive" || t.skill === "lance" || t.skill === "boomerang") notes.push("可穿透多名敌人。");
  if (t.skill === "orbit" || t.skill === "bladering") notes.push("环身常驻，靠近即反复切割。");
  if (t.skill === "laser") notes.push("向四周固定方向激射光柱，无需索敌、瞬发扫荡，可穿透。");
  if (t.skill === "aura") notes.push("无需索敌，贴身持续生效。");
  if (t.skill === "sigil") notes.push("远程投放，停留数秒持续作用。");
  if (t.count && t.count > 1) notes.push(`一次施放 ${t.count} 发/段。`);
  if (!notes.length) notes.push("命中目标造成伤害。");
  const notesHtml = notes.map((n) => `<li>${n}</li>`).join("");

  const synHtml = t.tags.map((tag) => {
    const tiers = SYNERGIES.filter((s) => s.tag === tag);
    if (!tiers.length) return "";
    const items = tiers.map((s) => `<div class="cd-syn-row"><b>${s.need}件</b>${s.desc}</div>`).join("");
    return `<div class="cd-syn-block"><div class="cd-syn-tag">${tag} 系 · ${TAG_HINT[tag]}</div>${items}</div>`;
  }).join("");

  return `
    <div class="cd-title">
      <div class="cd-name" style="color:${color}"><span class="cd-ic">${treasureIconSvg(t)}</span>${t.name} <span class="cd-rarity">${RARITY_LABEL[t.rarity]}</span></div>
      <div class="cd-sub">${k.name} · ${k.form}</div>
    </div>
    <div class="cd-tags">${tagHtml}</div>
    <div class="cd-desc">${t.desc}</div>
    <div class="cd-sec">技能形态</div>
    <div class="cd-form">${SKILL_FORM_DESC[t.skill]}</div>
    <div class="cd-sec">数值 · 三合一升星缩放</div>
    <table class="cd-table"><thead><tr>${head.join("")}</tr></thead><tbody>${rows}</tbody></table>
    <div class="cd-sec">特性</div>
    <ul class="cd-notes">${notesHtml}</ul>
    <div class="cd-sec">标签羁绊 · 凑齐不同法宝触发（同款只计一份）</div>
    <div class="cd-syns">${synHtml}</div>
  `;
}
