// 修仙幸存者 · 成长系统
// 法宝 = 自动武器（攻击/CD/技能形态/标签）；功法 = 全局被动；羁绊 = 同标签流派特性
// 纯数据 + 计算，无渲染依赖。

export type Tag = "剑" | "刀" | "仙" | "魔" | "妖" | "体" | "雷" | "阵" | "木" | "金" | "水" | "火" | "土";
// 五档品阶（升序）：普通白 < 优秀绿 < 精良蓝 < 史诗紫 < 传说橙
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

// 法宝技能形态
export type SkillForm =
  | "sword"   // 飞剑：追踪最近敌人的穿透剑
  | "orbit"   // 剑环：环绕自身旋转的飞剑
  | "nova"    // 阵爆：环身范围爆发
  | "bolt"    // 妖弹：自动追踪的法弹
  | "strike"  // 落雷：点名最近敌人小范围
  | "arc"     // 刀气：朝移动方向的扇形挥斩
  | "aura"    // 罡气：持续环身光环（高频低伤）
  | "chain"   // 连雷：链式弹跳
  | "rain"    // 剑雨/雷雨：范围内天降多发
  | "glaive"  // 掷刀：抛出大刀，圆弧轨迹飞行穿击
  | "radial"  // 周天：360°均分固定方向齐射（不锁敌）
  | "spiral"  // 斗转：发射角逐次旋转，连发成螺旋（不锁敌）
  | "forward" // 直进：沿玩家朝向固定直线发射（不锁敌）
  | "lance"   // 枪刺：超长射程·强穿透单道直线
  | "whirl"   // 旋身斩：360°全圈瞬斩 + 击退
  | "meteor"  // 坠星：远程单点大范围重炸 + 击退
  | "sigil"   // 符阵：远程定点停留法阵，周期减速 + 磨伤
  | "vine"    // 缠藤：低速多向生长绿弹 + 减速
  | "boomerang" // 回旋镖：大弧往返穿击
  | "bladering"; // 旋刃：环身高速旋绕的刀片（刀系，按品阶换模型）

export type Modifier = {
  damageMul?: number;   // 增伤（加法累加，最终用 1+sum）
  cdMul?: number;       // 冷却乘数（乘法，<1 更快）
  area?: number;        // 范围加成（加法）
  maxHp?: number;
  regen?: number;
  defense?: number;
  lifesteal?: number;
  moveSpeed?: number;
  pickupRadius?: number;
  projectiles?: number; // 多重投射物
  xpMul?: number;       // 经验加成（加法，最终 1+sum）
};
export type Stats = Required<Modifier>;

export type Flags = {
  crit: number;        // 暴击率 0..1
  critMul: number;     // 暴击倍率
  chainBonus: number;  // 额外弹跳目标数
  killExplode: number; // 击杀爆裂半径（0=关）
  berserk: number;     // 残血狂暴最大增伤
  thorns: number;      // 反伤比例（受击反弹给周围敌人）
  auraDps: number;     // 持续光环每秒伤害（0=关）
  auraRadius: number;  // 光环半径
  swordStorm: number;  // 剑雨风暴间隔秒（0=关）
  thunderStorm: number;// 天雷风暴间隔秒（0=关）
  shieldInterval: number; // 免死护盾刷新间隔秒（0=关）
  chill: number;       // 水：命中附带减速强度（0=关，越高减速越久）
  ignite: number;      // 火：命中附带灼烧强度（0=关，越高灼烧越疼）
  quakeInterval: number; // 土：地崩间隔秒（0=关，周期环身AoE+击退）
};

// 行为层：与羁绊正交、写在单件法宝上的特性（命中时生效）
export type TreasureTraits = { slow?: boolean; burn?: boolean; knock?: boolean; pierce?: boolean; bounce?: boolean; fork?: boolean; magnet?: boolean };

// 法宝（武器）
export type Treasure = {
  uid?: number;
  id: string;
  name: string;
  tags: Tag[];
  rarity: Rarity;
  cost: number;
  desc: string;
  skill: SkillForm;
  attack: number;   // 武器基础伤害
  cd: number;       // 基础冷却（秒）
  count?: number;   // 投射物/弹跳/段数
  radius?: number;  // 范围类半径
  cdLeft?: number;  // 运行期冷却剩余
  star?: number;    // 星级 1..3（三合一升星）
  spin?: number;    // 运行期：spiral 形态的当前旋转角
  traits?: TreasureTraits; // 行为层特性（与标签羁绊正交）
};

export const MAX_STAR = 3;
const STAR_ATK = [1, 1, 2.0, 3.5];  // 按 star(1..3) 索引：攻击倍率
const STAR_CD = [1, 1, 0.85, 0.7];  // 冷却倍率（越低越快）
export function treasureStar(t: Treasure) { return t.star ?? 1; }
export function starAttack(t: Treasure) { return Math.round(t.attack * (STAR_ATK[treasureStar(t)] ?? 1)); }
export function starCd(t: Treasure) { return Math.round(t.cd * (STAR_CD[treasureStar(t)] ?? 1) * 100) / 100; }
export function starMark(t: Treasure) { return "★".repeat(treasureStar(t)); }
// 出售价（按星级返还灵石）：★1 原价，★2/★3 相对合成成本打折
const SELL_MULT = [0, 1, 2, 4];
export function sellValue(t: Treasure) { return Math.floor(RARITY_COST[t.rarity] * (SELL_MULT[treasureStar(t)] ?? 1)); }

// 功法（全局被动）
export type Art = {
  id: string; name: string; rarity: Rarity; cost: number; desc: string; mod: Modifier;
};

export const SKILL_LABEL: Record<SkillForm, { name: string; form: string }> = {
  sword: { name: "飞剑", form: "追踪穿透" },
  orbit: { name: "剑环", form: "环身旋绕" },
  nova: { name: "阵爆", form: "环身范围" },
  bolt: { name: "妖弹", form: "自动追踪" },
  strike: { name: "落雷", form: "点名范围" },
  arc: { name: "刀气", form: "扇形挥斩" },
  aura: { name: "罡气", form: "持续光环" },
  chain: { name: "连雷", form: "链式弹跳" },
  rain: { name: "天罚", form: "范围天降" },
  glaive: { name: "掷刀", form: "回旋大刀" },
  radial: { name: "周天", form: "八方齐射" },
  spiral: { name: "斗转", form: "旋转螺旋" },
  forward: { name: "直进", form: "朝向直线" },
  lance: { name: "枪刺", form: "贯穿直刺" },
  whirl: { name: "旋身斩", form: "环身全圈" },
  meteor: { name: "坠星", form: "远程重炸" },
  sigil: { name: "符阵", form: "定点控场" },
  vine: { name: "缠藤", form: "生长减速" },
  boomerang: { name: "回旋镖", form: "大弧往返" },
  bladering: { name: "旋刃", form: "环身旋斩" },
};

export const TAG_HINT: Record<Tag, string> = {
  剑: "多重穿透·暴击", 刀: "急速连斩", 仙: "续航回血", 魔: "高伤狂暴",
  妖: "吸血爆裂·子弹裂变", 体: "厚血高防", 雷: "链式弹跳", 阵: "范围控场", 木: "拾取成长",
  金: "锐金破势·暴击爆发", 水: "寒滞减速·续航回元", 火: "命中灼烧·焚燎爆裂", 土: "厚土护体·震退地崩",
};

export type SynergyDef = { tag: Tag; need: number; mod?: Modifier; flags?: Partial<Flags>; desc: string };
export const SYNERGIES: SynergyDef[] = [
  // —— 偶数派 2/4/6/8（输出/爆发/成长·易入门）——
  // 剑：多重穿透 → 暴击 → 全屏剑雨
  { tag: "剑", need: 2, mod: { projectiles: 1, damageMul: 0.06 }, desc: "投射+1，增伤6%" },
  { tag: "剑", need: 4, mod: { damageMul: 0.1 }, flags: { crit: 0.15 }, desc: "增伤10%，暴击+15%" },
  { tag: "剑", need: 6, mod: { projectiles: 1, damageMul: 0.12 }, desc: "投射+1，增伤12%" },
  { tag: "剑", need: 8, mod: { projectiles: 1, damageMul: 0.2 }, flags: { crit: 0.15, swordStorm: 4 }, desc: "万剑诀：投射+1，增伤20%，暴击+15%，每4秒全屏剑雨" },
  // 刀：急速连斩
  { tag: "刀", need: 2, mod: { cdMul: 0.9 }, desc: "冷却-10%" },
  { tag: "刀", need: 4, mod: { cdMul: 0.88, damageMul: 0.1 }, desc: "冷却-12%，增伤10%" },
  { tag: "刀", need: 6, mod: { cdMul: 0.85, damageMul: 0.12 }, desc: "冷却-15%，增伤12%" },
  { tag: "刀", need: 8, mod: { cdMul: 0.82, damageMul: 0.25 }, desc: "一刀两断：冷却-18%，增伤25%" },
  // 雷：链式 → 天雷
  { tag: "雷", need: 2, flags: { chainBonus: 2 }, desc: "落雷/连雷 多弹跳2目标" },
  { tag: "雷", need: 4, mod: { damageMul: 0.1 }, flags: { chainBonus: 2 }, desc: "增伤10%，再弹跳2" },
  { tag: "雷", need: 6, mod: { area: 0.15 }, flags: { chainBonus: 2 }, desc: "范围+15%，再弹跳2" },
  { tag: "雷", need: 8, mod: { damageMul: 0.15 }, flags: { chainBonus: 3, thunderStorm: 3.5 }, desc: "天雷诛仙：增伤15%，再弹跳3，持续天雷" },
  // 妖：吸血爆裂·裂变
  { tag: "妖", need: 2, mod: { lifesteal: 0.05 }, desc: "吸血+5%" },
  { tag: "妖", need: 4, mod: { lifesteal: 0.04 }, flags: { killExplode: 2.8 }, desc: "吸血+4%，击杀爆裂" },
  { tag: "妖", need: 6, mod: { lifesteal: 0.05 }, flags: { killExplode: 3.6 }, desc: "吸血+5%，爆裂增强" },
  { tag: "妖", need: 8, mod: { lifesteal: 0.08 }, flags: { killExplode: 4.6 }, desc: "血海滔天：吸血+8%，大爆裂" },
  // 金：锐金破势·暴击爆发
  { tag: "金", need: 2, mod: { damageMul: 0.08 }, flags: { crit: 0.05 }, desc: "增伤8%，暴击+5%" },
  { tag: "金", need: 4, flags: { critMul: 0.4, crit: 0.05 }, desc: "暴伤+40%，暴击+5%" },
  { tag: "金", need: 6, mod: { damageMul: 0.12 }, flags: { critMul: 0.4 }, desc: "增伤12%，暴伤+40%" },
  { tag: "金", need: 8, mod: { damageMul: 0.2 }, flags: { critMul: 0.8, crit: 0.15 }, desc: "锐金·万刃归宗：增伤20%，暴伤+80%，暴击+15%" },
  // 火：命中灼烧·焚燎爆裂
  { tag: "火", need: 2, mod: { damageMul: 0.1 }, flags: { ignite: 1 }, desc: "增伤10%，命中灼烧" },
  { tag: "火", need: 4, mod: { area: 0.15 }, flags: { ignite: 1 }, desc: "范围+15%，灼烧增强" },
  { tag: "火", need: 6, mod: { damageMul: 0.12 }, flags: { killExplode: 3.2 }, desc: "增伤12%，击杀火爆" },
  { tag: "火", need: 8, mod: { damageMul: 0.25 }, flags: { ignite: 2, killExplode: 4.2 }, desc: "烈火·燎原焚天：增伤25%，强灼烧、大火爆" },
  // 木：拾取成长·续航
  { tag: "木", need: 2, mod: { pickupRadius: 2, xpMul: 0.15 }, desc: "拾取+2，经验+15%" },
  { tag: "木", need: 4, mod: { regen: 0.8, xpMul: 0.15 }, desc: "回血+0.8/s，经验+15%" },
  { tag: "木", need: 6, mod: { pickupRadius: 2, regen: 1.0, xpMul: 0.2 }, desc: "拾取+2，回血+1/s，经验+20%" },
  { tag: "木", need: 8, mod: { regen: 1.5, xpMul: 0.3, pickupRadius: 3 }, desc: "万木回春：回血+1.5/s，经验+30%，拾取+3" },
  // —— 奇数派 3/5/7/9（续航/防御/控场·需专精）——
  // 仙：续航 → 免死盾
  { tag: "仙", need: 3, mod: { regen: 0.8, maxHp: 30 }, desc: "回血+0.8/s，血+30" },
  { tag: "仙", need: 5, mod: { regen: 0.8, maxHp: 40, defense: 2 }, desc: "回血+0.8/s，血+40，防+2" },
  { tag: "仙", need: 7, mod: { regen: 0.6 }, flags: { shieldInterval: 12 }, desc: "每12秒免死护盾，回血+0.6/s" },
  { tag: "仙", need: 9, mod: { regen: 1.2 }, flags: { shieldInterval: 8 }, desc: "不死仙体：护盾每8秒，回血+1.2/s" },
  // 魔：高伤狂暴
  { tag: "魔", need: 3, mod: { damageMul: 0.18, defense: -2 }, desc: "增伤18%，防-2" },
  { tag: "魔", need: 5, mod: { damageMul: 0.15 }, flags: { berserk: 0.3 }, desc: "增伤15%，残血狂暴" },
  { tag: "魔", need: 7, mod: { damageMul: 0.15 }, flags: { berserk: 0.3 }, desc: "增伤15%，狂暴再+30%" },
  { tag: "魔", need: 9, mod: { damageMul: 0.3 }, flags: { berserk: 0.4 }, desc: "魔神附体：增伤30%，狂暴+40%" },
  // 体：厚血高防·反伤
  { tag: "体", need: 3, mod: { maxHp: 60, defense: 5 }, desc: "血+60，防+5" },
  { tag: "体", need: 5, mod: { maxHp: 70, defense: 6 }, desc: "血+70，防+6" },
  { tag: "体", need: 7, mod: { maxHp: 80 }, flags: { thorns: 0.4 }, desc: "血+80，反伤40%" },
  { tag: "体", need: 9, mod: { maxHp: 120, defense: 10 }, flags: { thorns: 0.6 }, desc: "金刚不坏：血+120，防+10，反伤60%" },
  // 阵：范围 → 灭阵光环
  { tag: "阵", need: 3, mod: { area: 0.2 }, desc: "范围+20%" },
  { tag: "阵", need: 5, mod: { area: 0.2 }, flags: { auraDps: 16, auraRadius: 3.4 }, desc: "范围+20%，灭阵光环" },
  { tag: "阵", need: 7, mod: { area: 0.2 }, flags: { auraDps: 24, auraRadius: 4.0 }, desc: "范围+20%，光环增强" },
  { tag: "阵", need: 9, mod: { area: 0.3 }, flags: { auraDps: 44, auraRadius: 5.2 }, desc: "囚天大阵：范围+30%，永久强光环" },
  // 水：寒滞减速·续航回元
  { tag: "水", need: 3, mod: { regen: 0.6 }, flags: { chill: 1 }, desc: "回血+0.6/s，命中减速" },
  { tag: "水", need: 5, mod: { lifesteal: 0.04, cdMul: 0.94 }, flags: { chill: 1 }, desc: "吸血+4%，急速6%，减速增强" },
  { tag: "水", need: 7, mod: { area: 0.12, regen: 0.8 }, flags: { chill: 1 }, desc: "范围+12%，回血+0.8/s，减速增强" },
  { tag: "水", need: 9, mod: { regen: 1.2, lifesteal: 0.05 }, flags: { chill: 2 }, desc: "润水·万川归海：重度寒滞，回血+1.2/s，吸血+5%" },
  // 土：厚土护体·震退地崩
  { tag: "土", need: 3, mod: { maxHp: 50, defense: 5 }, desc: "血+50，防+5" },
  { tag: "土", need: 5, mod: { maxHp: 60, defense: 4, area: 0.15 }, desc: "血+60，防+4，范围+15%" },
  { tag: "土", need: 7, mod: { maxHp: 40 }, flags: { quakeInterval: 4 }, desc: "镇岳：每4秒地崩，血+40" },
  { tag: "土", need: 9, mod: { maxHp: 120, defense: 8 }, flags: { quakeInterval: 2.5 }, desc: "厚土·山崩地裂：每2.5秒强地崩，血+120，防+8" },
];

export const TREASURES: Treasure[] = [
  // 剑系
  { id: "t_feijian", name: "青锋飞剑", tags: ["剑"], rarity: "common", cost: 10, skill: "sword", attack: 12, cd: 0.9, count: 1, desc: "追踪最近之敌的穿透剑气。" },
  { id: "t_wanjian", name: "万剑诀", tags: ["剑"], rarity: "legendary", cost: 52, skill: "rain", attack: 15, cd: 3.2, count: 8, radius: 6.5, desc: "万剑自天而降。" },
  // 刀系
  { id: "t_zhanyao", name: "斩妖刀", tags: ["刀"], rarity: "uncommon", cost: 10, skill: "bladering", attack: 30, cd: 2.4, count: 3, radius: 2.6, traits: { knock: true }, desc: "斩妖巨刃离手，划圆弧贯穿成排妖众、复归手中。" },
  { id: "t_qisha", name: "七杀刀经", tags: ["刀"], rarity: "epic", cost: 30, skill: "bladering", attack: 30, cd: 1.3, count: 4, radius: 2.8, traits: { burn: true }, desc: "刀芒化枪，长驱直贯一列妖众、余焰灼身。" },
  // 雷系
  { id: "t_zhangxinlei", name: "掌心雷", tags: ["雷"], rarity: "rare", cost: 16, skill: "strike", attack: 24, cd: 1.8, radius: 3, desc: "点名最近之敌，劈下落雷。" },
  { id: "t_wulei", name: "五雷正法", tags: ["雷", "阵"], rarity: "legendary", cost: 52, skill: "rain", attack: 20, cd: 3.0, count: 6, radius: 6, desc: "范围内雷雨倾泻。" },
  // 阵系
  { id: "t_kunzhen", name: "五行困阵", tags: ["阵"], rarity: "rare", cost: 16, skill: "sigil", attack: 16, cd: 2.0, radius: 4, traits: { slow: true }, desc: "落地结成五行困阵，持续锁滞、磨伤范围之敌。" },
  // 妖系
  { id: "t_shihun", name: "噬魂蝠", tags: ["妖"], rarity: "common", cost: 10, skill: "bolt", attack: 14, cd: 1.0, count: 1, traits: { fork: true }, desc: "自动追踪的噬魂法弹，逢杀裂变。" },
  { id: "t_xuemo", name: "血魔幡", tags: ["妖", "魔"], rarity: "epic", cost: 30, skill: "bolt", attack: 20, cd: 1.2, count: 2, traits: { fork: true }, desc: "双幡索命，自动追敌，逢杀裂变。" },
  // 体系
  // 仙/木
  { id: "t_huichun", name: "太极玄光印", tags: ["仙", "木"], rarity: "rare", cost: 18, skill: "sigil", attack: 16, cd: 2.4, radius: 4.0, traits: { slow: true }, desc: "太极玄光落地成阵，缓滞并磨伤范围之敌。" },
  { id: "t_tengbian", name: "青木藤鞭", tags: ["木"], rarity: "rare", cost: 16, skill: "vine", attack: 14, cd: 1.0, radius: 3.2, count: 3, traits: { slow: true }, desc: "藤蔓向四方蔓生，缠滞并磨伤。" },
  // —— 扩充 ——
  { id: "t_xuedao", name: "血饮狂刀", tags: ["刀", "妖"], rarity: "epic", cost: 32, skill: "bladering", attack: 26, cd: 1.3, count: 4, radius: 2.8, traits: { magnet: true }, desc: "饮血长刀贯穿成列，摄敌近身。" },
  { id: "t_qingling", name: "清灵罡盾", tags: ["仙", "体"], rarity: "common", cost: 10, skill: "aura", attack: 7, cd: 0.6, radius: 2.6, desc: "清灵护体，磨伤近敌。" },
  { id: "t_taiyi", name: "太一焚天印", tags: ["仙", "雷"], rarity: "epic", cost: 32, skill: "strike", attack: 26, cd: 2.0, radius: 3.2, traits: { burn: true }, desc: "太一神雷，点名轰击、余焰焚身。" },
  { id: "t_jingang", name: "金刚降魔杵", tags: ["体"], rarity: "rare", cost: 16, skill: "whirl", attack: 22, cd: 1.4, radius: 3.2, traits: { knock: true }, desc: "宝杵旋身横扫，刚猛震退四周。" },
  { id: "t_zhenshan", name: "镇山玉印", tags: ["体"], rarity: "epic", cost: 30, skill: "whirl", attack: 20, cd: 1.7, radius: 4.2, traits: { knock: true }, desc: "玉印旋压，环身震退人墙。" },
  { id: "t_moyan", name: "魔焰天罚", tags: ["魔", "雷"], rarity: "epic", cost: 32, skill: "rain", attack: 18, cd: 2.8, count: 5, radius: 5.5, traits: { burn: true }, desc: "魔焰自天而降，落处余火焚敌。" },
  // —— 补全各标签（确保都有便宜白件可叠高阶） ——
  { id: "t_yulu", name: "玉露灵针", tags: ["仙"], rarity: "rare", cost: 2, skill: "chain", attack: 20, cd: 2.4, count: 4, desc: "玉露凝针化作灵雷，在敌群间链式弹跳。" },
  { id: "t_xuenu", name: "血怒刀", tags: ["魔", "妖"], rarity: "rare", cost: 2, skill: "forward", attack: 20, cd: 1.3, count: 1, traits: { burn: true }, desc: "血怒直进，破阵重击焚敌。" },
  // —— 刀·高阶回旋大刀（长射程·圆弧穿击） ——
  { id: "t_huifeng", name: "回风折刃", tags: ["刀", "木"], rarity: "epic", cost: 3, skill: "bladering", attack: 26, cd: 2.2, count: 4, radius: 2.6, desc: "折刃乘风，划大弧斩出复返。" },
  { id: "t_zhanyue", name: "斩月霸刀", tags: ["刀"], rarity: "legendary", cost: 4, skill: "bladering", attack: 42, cd: 2.6, count: 5, radius: 3, traits: { knock: true }, desc: "巨刀离手，弧光斩月，贯穿成排妖众。" },
  // —— 固定轨迹（不锁敌） ——
  { id: "t_fentian", name: "焚天十方印", tags: ["魔", "雷"], rarity: "legendary", cost: 4, skill: "radial", attack: 14, cd: 2.2, count: 10, traits: { burn: true }, desc: "十方齐射，焚尽四周。" },
  { id: "t_douzhuan", name: "斗转星移盘", tags: ["阵", "雷"], rarity: "legendary", cost: 4, skill: "spiral", attack: 11, cd: 0.2, count: 1, desc: "周天旋转，剑气连绵成螺旋。" },
  { id: "t_pojun", name: "破军枪意", tags: ["刀"], rarity: "epic", cost: 3, skill: "bladering", attack: 16, cd: 0.9, count: 4, radius: 2.6, traits: { pierce: true }, desc: "沿前行方向破阵直进，洞穿成列。" },
  // —— 补足各标签（妖/体/木/仙/魔 加强，每标签≥9，含便宜白件） ——
  // 妖
  { id: "t_xueying", name: "血影刀", tags: ["妖", "刀"], rarity: "rare", cost: 2, skill: "bladering", attack: 18, cd: 1.0, count: 3, radius: 2.5, traits: { fork: true, magnet: true }, desc: "血影化弹索敌，摄敌裂变。" },
  { id: "t_xuehe", name: "血河图", tags: ["妖"], rarity: "epic", cost: 3, skill: "spiral", attack: 11, cd: 0.2, count: 1, desc: "血河图卷周天倾泻，血弹连绵旋射成河。" },
  // 体
  { id: "t_houtu", name: "厚土灵盾", tags: ["体", "木"], rarity: "uncommon", cost: 1, skill: "whirl", attack: 16, cd: 1.5, radius: 3.4, desc: "厚土旋身一周，硬甲横扫、震慑四面之敌。" },
  { id: "t_shanyue", name: "山岳镇印", tags: ["体"], rarity: "rare", cost: 2, skill: "nova", attack: 18, cd: 1.7, radius: 4, traits: { knock: true }, desc: "山岳压顶，环身震退四周。" },
  { id: "t_zhenmochuang", name: "镇魔幢", tags: ["体", "魔"], rarity: "epic", cost: 3, skill: "meteor", attack: 28, cd: 2.4, radius: 4.4, traits: { knock: true }, desc: "镇魔大幢自天砸落，巨震四周。" },
  // 木
  { id: "t_chunsheng", name: "春生藤", tags: ["木"], rarity: "common", cost: 1, skill: "vine", attack: 12, cd: 1.0, radius: 3, count: 3, traits: { slow: true }, desc: "春藤向四方蔓生缠滞。" },
  { id: "t_mulingdan", name: "木灵弹", tags: ["木", "仙"], rarity: "uncommon", cost: 1, skill: "orbit", attack: 12, cd: 4.0, count: 3, radius: 2.6, desc: "三枚木灵化环，绕身旋杀缠斩近敌。" },
  { id: "t_qingtengjian", name: "青藤剑", tags: ["木", "剑"], rarity: "rare", cost: 2, skill: "glaive", attack: 32, cd: 2.4, count: 1, radius: 6, desc: "藤化巨刃掷出，划弧斩出复返、贯穿成列。" },
  { id: "t_wanmu", name: "万木朝宗", tags: ["木"], rarity: "epic", cost: 3, skill: "orbit", attack: 13, cd: 4.0, count: 4, radius: 2.6, traits: { slow: true }, desc: "万木生发四环绕身旋拱，触者尽缠。" },
  // 仙
  { id: "t_jingshiling", name: "净世铃", tags: ["仙"], rarity: "rare", cost: 2, skill: "spiral", attack: 11, cd: 0.2, count: 1, traits: { slow: true }, desc: "净世铃音周天旋绕，灵光连射成螺旋、缓滞命中之敌。" },
  { id: "t_xianyuanjian", name: "仙缘飞剑", tags: ["仙", "剑"], rarity: "rare", cost: 2, skill: "sword", attack: 11, cd: 0.95, count: 1, desc: "仙缘所引，剑随心动。" },
  // 魔
  { id: "t_xuemodan", name: "血魔坠", tags: ["魔", "妖"], rarity: "uncommon", cost: 1, skill: "meteor", attack: 28, cd: 2.5, radius: 4.5, traits: { burn: true }, desc: "血魔凝煞坠如陨星，砸地血爆、灼蚀四周。" },
  // 雷 / 阵 补白件
  // —— 传说·橙：各流派镇派法宝（补全 仙/妖/体/木，丰富橙档形态） ——
  { id: "t_taixiao", name: "太霄玉清剑", tags: ["仙", "剑"], rarity: "legendary", cost: 5, skill: "sword", attack: 22, cd: 0.7, count: 3, traits: { pierce: true }, desc: "太霄玉清，三剑同发，洞穿成列、生生不息。" },
  { id: "t_jiuyou", name: "九幽噬天幡", tags: ["妖", "魔"], rarity: "legendary", cost: 5, skill: "bolt", attack: 26, cd: 0.9, count: 3, traits: { fork: true, magnet: true }, desc: "九幽幡展，三弹噬天，摄魂裂变、连锁炸场。" },
  { id: "t_jinganglun", name: "金刚伏魔轮", tags: ["体"], rarity: "legendary", cost: 5, skill: "whirl", attack: 34, cd: 1.5, radius: 4.4, traits: { knock: true }, desc: "金刚法轮旋身，环身重斩、刚猛震飞人墙。" },
  { id: "t_jianmu", name: "建木神枝阵", tags: ["木", "阵"], rarity: "legendary", cost: 5, skill: "sigil", attack: 24, cd: 1.8, radius: 4.8, traits: { slow: true }, desc: "建木通天，落地神枝结界，大范围缠滞、磨伤群妖。" },
  { id: "t_tiangang", name: "天罡神雷", tags: ["雷"], rarity: "legendary", cost: 5, skill: "chain", attack: 30, cd: 1.8, count: 8, traits: { bounce: true }, desc: "天罡神雷，一击连引，雷光弹跳三十六方。" },
  // —— 五行·金（锐金破势·暴击爆发）：穿透/锋锐，≥9 含白件与跨标签桥 ——
  { id: "t_jinjian", name: "庚金飞剑", tags: ["金", "剑"], rarity: "common", cost: 1, skill: "sword", attack: 12, cd: 0.95, count: 1, traits: { pierce: true }, desc: "庚金所炼飞剑，锋锐洞穿成列。" },
  { id: "t_jinren", name: "金锐刃", tags: ["金"], rarity: "common", cost: 1, skill: "forward", attack: 18, cd: 1.0, count: 1, traits: { pierce: true }, desc: "金芒沿前向直进，破阵洞穿。" },
  { id: "t_poujia", name: "破甲锥", tags: ["金", "刀"], rarity: "uncommon", cost: 2, skill: "bladering", attack: 26, cd: 1.3, count: 3, radius: 2.4, traits: { pierce: true }, desc: "金锥化枪，长驱直贯一整列。" },
  { id: "t_jinguanglun", name: "金光轮", tags: ["金"], rarity: "uncommon", cost: 2, skill: "glaive", attack: 30, cd: 2.3, count: 1, radius: 6, traits: { knock: true }, desc: "金光巨轮掷出，划弧斩返、贯穿成排。" },
  { id: "t_liejin", name: "裂金诀", tags: ["金"], rarity: "rare", cost: 3, skill: "radial", attack: 12, cd: 1.8, count: 8, traits: { pierce: true }, desc: "金芒八方齐射，洞穿四周。" },
  { id: "t_jinfeng", name: "金锋斩", tags: ["金"], rarity: "rare", cost: 3, skill: "whirl", attack: 24, cd: 1.4, radius: 3.4, traits: { knock: true }, desc: "金锋旋身全圈尽斩，刚锐震退。" },
  { id: "t_gengjin", name: "庚金杀阵", tags: ["金", "阵"], rarity: "epic", cost: 4, skill: "radial", attack: 13, cd: 1.7, count: 10, traits: { pierce: true }, desc: "庚金煞气十方激射，无可遁形。" },
  { id: "t_jinsha", name: "金煞剑诀", tags: ["金", "剑"], rarity: "epic", cost: 4, skill: "sword", attack: 16, cd: 0.8, count: 3, traits: { pierce: true }, desc: "三道金煞剑气连发，锋锐洞穿。" },
  { id: "t_taibai", name: "太白金芒", tags: ["金"], rarity: "legendary", cost: 5, skill: "lance", attack: 40, cd: 1.2, traits: { pierce: true, knock: true }, desc: "太白金星之芒，一线贯尽长列。" },
  // —— 五行·水（寒滞减速·续航回元）：减速控场，≥9 ——
  { id: "t_shuijian", name: "寒泉飞剑", tags: ["水", "剑"], rarity: "common", cost: 1, skill: "sword", attack: 11, cd: 1.0, count: 1, traits: { slow: true }, desc: "寒泉所凝飞剑，命中沁寒滞敌。" },
  { id: "t_bingdan", name: "玄冰弹", tags: ["水"], rarity: "common", cost: 1, skill: "bolt", attack: 14, cd: 1.0, count: 1, traits: { slow: true }, desc: "玄冰法弹自动追敌，命中减速。" },
  { id: "t_hanbingzhen", name: "寒冰阵", tags: ["水", "阵"], rarity: "uncommon", cost: 2, skill: "sigil", attack: 14, cd: 2.0, radius: 4, traits: { slow: true }, desc: "落地结寒冰阵，持续锁滞磨伤。" },
  { id: "t_bibohuan", name: "碧波环", tags: ["水"], rarity: "uncommon", cost: 2, skill: "orbit", attack: 12, cd: 4.0, count: 3, radius: 2.6, traits: { slow: true }, desc: "碧波三环绕身旋滞近敌。" },
  { id: "t_bingleng", name: "冰棱链", tags: ["水", "雷"], rarity: "rare", cost: 3, skill: "chain", attack: 20, cd: 2.2, count: 4, traits: { slow: true }, desc: "冰棱在敌群间链式弹跳，节节寒滞。" },
  { id: "t_shuilong", name: "水龙卷", tags: ["水"], rarity: "rare", cost: 3, skill: "spiral", attack: 11, cd: 0.2, count: 1, traits: { slow: true }, desc: "水龙周天旋绕，连射成螺旋寒流。" },
  { id: "t_hanchao", name: "寒潮阵", tags: ["水", "阵"], rarity: "epic", cost: 4, skill: "nova", attack: 16, cd: 1.7, radius: 4.2, traits: { slow: true }, desc: "寒潮环身爆发，震滞四周。" },
  { id: "t_xuanbing", name: "玄冰索命幡", tags: ["水", "妖"], rarity: "epic", cost: 4, skill: "bolt", attack: 20, cd: 1.1, count: 2, traits: { slow: true, fork: true }, desc: "玄冰双幡索敌，寒滞裂变。" },
  { id: "t_beiming", name: "北冥寒渊", tags: ["水", "仙"], rarity: "legendary", cost: 5, skill: "sigil", attack: 24, cd: 1.8, radius: 4.8, traits: { slow: true }, desc: "北冥寒渊落地成阵，大范围封冻磨伤。" },
  // —— 五行·火（命中灼烧·焚燎爆裂）：灼烧爆裂，≥9 ——
  { id: "t_lihuodan", name: "离火弹", tags: ["火"], rarity: "common", cost: 1, skill: "forward", attack: 18, cd: 1.1, count: 1, traits: { burn: true }, desc: "离火沿前向直进，灼烧穿行之敌。" },
  { id: "t_chiyanjian", name: "赤焰飞剑", tags: ["火", "剑"], rarity: "common", cost: 1, skill: "sword", attack: 11, cd: 1.0, count: 1, traits: { burn: true }, desc: "赤焰飞剑追敌，命中余焰焚身。" },
  { id: "t_yanlei", name: "炎雷击", tags: ["火", "雷"], rarity: "uncommon", cost: 2, skill: "strike", attack: 24, cd: 1.8, radius: 3, traits: { burn: true }, desc: "炎雷点名劈落，余焰灼身。" },
  { id: "t_lieyandao", name: "烈焰刀", tags: ["火", "刀"], rarity: "uncommon", cost: 2, skill: "bladering", attack: 18, cd: 1.1, count: 3, radius: 2.4, traits: { burn: true }, desc: "烈焰刀气扇形横扫，所过成焦。" },
  { id: "t_yehuo", name: "业火天罚", tags: ["火"], rarity: "rare", cost: 3, skill: "rain", attack: 18, cd: 2.8, count: 5, radius: 5.5, traits: { burn: true }, desc: "业火自天倾泻，落处余火焚敌。" },
  { id: "t_yantian", name: "炎天十方阵", tags: ["火", "阵"], rarity: "rare", cost: 3, skill: "radial", attack: 12, cd: 1.9, count: 9, traits: { burn: true }, desc: "炎天火芒九方齐射，灼烧四周。" },
  { id: "t_yunhuo", name: "陨火坠", tags: ["火"], rarity: "epic", cost: 4, skill: "meteor", attack: 30, cd: 2.5, radius: 4.5, traits: { burn: true, knock: true }, desc: "陨火如星砸落，焚震一片。" },
  { id: "t_chiyanmo", name: "赤焰魔印", tags: ["火", "魔"], rarity: "epic", cost: 4, skill: "forward", attack: 22, cd: 1.0, count: 1, traits: { burn: true, pierce: true }, desc: "赤焰魔印破阵直进，洞穿焚敌。" },
  { id: "t_lihuoyin", name: "离火焚天印", tags: ["火"], rarity: "legendary", cost: 5, skill: "meteor", attack: 34, cd: 2.4, radius: 4.8, traits: { burn: true, knock: true }, desc: "离火神印自天砸落，燎原焚天。" },
  // —— 五行·土（厚土护体·震退地崩）：厚血震退，≥9 ——
  { id: "t_huangtu", name: "黄土灵盾", tags: ["土"], rarity: "common", cost: 1, skill: "aura", attack: 8, cd: 0.6, radius: 2.6, desc: "黄土护体罡气，持续磨伤近敌。" },
  { id: "t_luoshi", name: "落石术", tags: ["土"], rarity: "common", cost: 1, skill: "strike", attack: 22, cd: 1.8, radius: 3, traits: { knock: true }, desc: "召落巨石砸敌，砸地震退。" },
  { id: "t_zhenshanyin", name: "震山印", tags: ["土", "体"], rarity: "uncommon", cost: 2, skill: "nova", attack: 16, cd: 1.7, radius: 3.8, traits: { knock: true }, desc: "震山之力环身轰发，震退四周。" },
  { id: "t_houtuxuan", name: "厚土旋斩", tags: ["土"], rarity: "uncommon", cost: 2, skill: "whirl", attack: 18, cd: 1.5, radius: 3.4, traits: { knock: true }, desc: "厚土旋身一周，硬甲横扫震退。" },
  { id: "t_dizhenfu", name: "地震符", tags: ["土", "阵"], rarity: "rare", cost: 3, skill: "nova", attack: 18, cd: 1.7, radius: 4.2, traits: { knock: true }, desc: "地震符环身爆发，崩裂震退。" },
  { id: "t_juyan", name: "巨岩坠", tags: ["土"], rarity: "rare", cost: 3, skill: "meteor", attack: 28, cd: 2.5, radius: 4.5, traits: { knock: true }, desc: "巨岩自天砸落，地动山摇。" },
  { id: "t_houtuzhen", name: "厚土镇魔阵", tags: ["土", "魔"], rarity: "epic", cost: 4, skill: "sigil", attack: 18, cd: 2.0, radius: 4.4, traits: { slow: true }, desc: "厚土镇魔结界，缠滞磨伤群妖。" },
  { id: "t_shanyuelun", name: "山岳法轮", tags: ["土", "体"], rarity: "epic", cost: 4, skill: "whirl", attack: 24, cd: 1.6, radius: 4.2, traits: { knock: true }, desc: "山岳法轮旋身，刚猛震飞人墙。" },
  { id: "t_buzhou", name: "不周山印", tags: ["土"], rarity: "legendary", cost: 5, skill: "meteor", attack: 36, cd: 2.4, radius: 4.8, traits: { knock: true }, desc: "不周神山自天镇落，崩天裂地。" },
];

export const ARTS: Art[] = [
  { id: "a_gongxin", name: "攻心诀", rarity: "common", cost: 8, desc: "诸般攻击更狠。", mod: { damageMul: 0.1 } },
  { id: "a_jifeng", name: "疾风诀", rarity: "common", cost: 8, desc: "出手更快。", mod: { cdMul: 0.93 } },
  { id: "a_tuna", name: "吐纳功", rarity: "common", cost: 8, desc: "缓缓回元。", mod: { regen: 0.6 } },
  { id: "a_juling", name: "聚灵诀", rarity: "uncommon", cost: 8, desc: "灵气吸取更广、经验更多。", mod: { pickupRadius: 1.6, xpMul: 0.1 } },
  { id: "a_yufeng", name: "御风步", rarity: "uncommon", cost: 8, desc: "身法更快。", mod: { moveSpeed: 1.0 } },
  { id: "a_budong", name: "不动明王功", rarity: "rare", cost: 14, desc: "气血如山。", mod: { maxHp: 50, defense: 4 } },
  { id: "a_shixue", name: "噬血大法", rarity: "rare", cost: 14, desc: "见血回元。", mod: { lifesteal: 0.05 } },
  { id: "a_chongying", name: "多重剑影", rarity: "rare", cost: 16, desc: "投射类武器多一发。", mod: { projectiles: 1 } },
  { id: "a_taixu", name: "太虚大法", rarity: "epic", cost: 24, desc: "范围更大，略增伤。", mod: { area: 0.2, damageMul: 0.06 } },
  { id: "a_shafa", name: "杀伐决断", rarity: "epic", cost: 24, desc: "大幅增伤。", mod: { damageMul: 0.2 } },
  { id: "a_jinshen", name: "金身不坏", rarity: "legendary", cost: 40, desc: "气血、防御、回元齐飞。", mod: { maxHp: 90, defense: 8, regen: 0.6 } },
];

export function emptyStats(): Stats {
  return { damageMul: 0, cdMul: 1, area: 0, maxHp: 0, regen: 0, defense: 0, lifesteal: 0, moveSpeed: 0, pickupRadius: 0, projectiles: 0, xpMul: 0 };
}
export function emptyFlags(): Flags {
  return { crit: 0, critMul: 2, chainBonus: 0, killExplode: 0, berserk: 0, thorns: 0, auraDps: 0, auraRadius: 0, swordStorm: 0, thunderStorm: 0, shieldInterval: 0, chill: 0, ignite: 0, quakeInterval: 0 };
}

function applyMod(t: Stats, m: Modifier) {
  t.damageMul += m.damageMul ?? 0;
  t.cdMul *= m.cdMul ?? 1;
  t.area += m.area ?? 0;
  t.maxHp += m.maxHp ?? 0;
  t.regen += m.regen ?? 0;
  t.defense += m.defense ?? 0;
  t.lifesteal += m.lifesteal ?? 0;
  t.moveSpeed += m.moveSpeed ?? 0;
  t.pickupRadius += m.pickupRadius ?? 0;
  t.projectiles += m.projectiles ?? 0;
  t.xpMul += m.xpMul ?? 0;
}
function applyFlags(f: Flags, p: Partial<Flags>) {
  if (p.crit) f.crit += p.crit;
  if (p.critMul) f.critMul += p.critMul; // 金：暴击倍率在基础 ×2 之上叠加
  if (p.chill) f.chill += p.chill;       // 水：命中减速强度叠加
  if (p.ignite) f.ignite += p.ignite;    // 火：命中灼烧强度叠加
  if (p.quakeInterval) f.quakeInterval = f.quakeInterval > 0 ? Math.min(f.quakeInterval, p.quakeInterval) : p.quakeInterval; // 土：取更快的地崩间隔
  if (p.chainBonus) f.chainBonus += p.chainBonus;
  if (p.killExplode) f.killExplode = Math.max(f.killExplode, p.killExplode);
  if (p.berserk) f.berserk += p.berserk;
  if (p.thorns) f.thorns += p.thorns;
  if (p.auraDps) f.auraDps = Math.max(f.auraDps, p.auraDps);
  if (p.auraRadius) f.auraRadius = Math.max(f.auraRadius, p.auraRadius);
  if (p.swordStorm) f.swordStorm = f.swordStorm > 0 ? Math.min(f.swordStorm, p.swordStorm) : p.swordStorm;
  if (p.thunderStorm) f.thunderStorm = f.thunderStorm > 0 ? Math.min(f.thunderStorm, p.thunderStorm) : p.thunderStorm;
  if (p.shieldInterval) f.shieldInterval = f.shieldInterval > 0 ? Math.min(f.shieldInterval, p.shieldInterval) : p.shieldInterval;
}

// 羁绊统计：相同法宝（同 id）只算一份——装多把同款/升星都不重复叠羁绊，逼迫凑齐不同法宝
export function tagCounts(treasures: Treasure[]): Map<Tag, number> {
  const counts = new Map<Tag, number>();
  const seen = new Set<string>();
  for (const t of treasures) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

// 法宝只贡献武器与标签；功法 + 羁绊贡献全局属性/特性
export function computeBuild(treasures: Treasure[], arts: Art[]): { stats: Stats; flags: Flags } {
  const stats = emptyStats();
  const flags = emptyFlags();
  for (const a of arts) applyMod(stats, a.mod);
  const counts = tagCounts(treasures);
  for (const syn of SYNERGIES) {
    if ((counts.get(syn.tag) ?? 0) >= syn.need) {
      if (syn.mod) applyMod(stats, syn.mod);
      if (syn.flags) applyFlags(flags, syn.flags);
    }
  }
  return { stats, flags };
}

export function synergyText(treasures: Treasure[]): string {
  const counts = Array.from(tagCounts(treasures).entries()).sort((a, b) => b[1] - a[1]);
  if (!counts.length) return "未装备法宝";
  return counts.map(([tag, n]) => `${tag}${n}${n >= 2 ? "·激活" : ""}`).join("  ");
}

export type SynergyTagStatus = { tag: Tag; hint: string; count: number; tiers: Array<{ need: number; desc: string; active: boolean }> };
export function synergyStatus(treasures: Treasure[]): SynergyTagStatus[] {
  const counts = tagCounts(treasures);
  const tags: Tag[] = ["剑", "刀", "仙", "魔", "妖", "体", "雷", "阵", "木", "金", "水", "火", "土"];
  return tags.map((tag) => {
    const count = counts.get(tag) ?? 0;
    const tiers = SYNERGIES.filter((s) => s.tag === tag).map((s) => ({ need: s.need, desc: s.desc, active: count >= s.need }));
    return { tag, hint: TAG_HINT[tag], count, tiers };
  });
}

function rollRarity(level: number): Rarity {
  const b = Math.min(0.3, level * 0.02); // 等级越高整体出货越好
  const r = Math.random();               // 阈值递增的五档带：传说/史诗/精良/优秀/普通
  if (r < 0.015 + b * 0.15) return "legendary";
  if (r < 0.07 + b * 0.45) return "epic";
  if (r < 0.22 + b * 0.7) return "rare";
  if (r < 0.55 + b * 0.5) return "uncommon";
  return "common";
}
function pick<T extends { rarity: Rarity }>(pool: T[], rarity: Rarity): T {
  const list = pool.filter((p) => p.rarity === rarity);
  const use = list.length ? list : pool;
  return use[Math.floor(Math.random() * use.length)];
}

let TREASURE_UID = 1;
export function instantiate(t: Treasure): Treasure {
  return { ...t, uid: TREASURE_UID++, cdLeft: 0, star: t.star ?? 1, spin: 0 };
}

// 开局随机赠送一件攻击型法宝
const STARTER_IDS = ["t_feijian", "t_zhanyao", "t_shihun", "t_zhangxinlei", "t_kunzhen"];
export function starterTreasure(): Treasure {
  const pool = TREASURES.filter((t) => STARTER_IDS.includes(t.id));
  const base = pool[Math.floor(Math.random() * pool.length)];
  return instantiate(base);
}
export function rollTreasures(level: number, n = 5): Treasure[] {
  const out: Treasure[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < n && guard++ < 80) {
    const base = pick(TREASURES, rollRarity(level));
    if (seen.has(base.id)) continue;
    seen.add(base.id);
    out.push({ ...base });
  }
  return out;
}
export function rollArts(level: number, n = 4): Art[] {
  const out: Art[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < n && guard++ < 80) {
    const a = pick(ARTS, rollRarity(level));
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

// 羁绊标签配色（图鉴信息条/标签芯片用）：五行用元素色，其余按流派意象
export const TAG_COLOR: Record<Tag, string> = {
  剑: "#cfd8e8", 刀: "#ff8a5a", 仙: "#7fe9c8", 魔: "#b56cff", 妖: "#ff6cae",
  体: "#d2a86a", 雷: "#ffe04d", 阵: "#6aa8ff", 木: "#6fd86f",
  金: "#ffd45e", 水: "#5ec8ff", 火: "#ff6a4d", 土: "#c79a5a",
};

// 品阶：普通白 < 优秀绿 < 精良蓝 < 史诗紫 < 传说橙
export const RARITY_COLOR: Record<Rarity, string> = { common: "#e6ebe4", uncommon: "#5ad36a", rare: "#5aa6ff", epic: "#b977ff", legendary: "#ff9b3d" };
export const RARITY_LABEL: Record<Rarity, string> = { common: "普通", uncommon: "优秀", rare: "精良", epic: "史诗", legendary: "传说" };
// 五档统一定价（灵石）：普通1 优秀2 精良3 史诗4 传说5
export const RARITY_COST: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
export function treasureCost(t: Treasure) { return RARITY_COST[t.rarity]; }
export function artCost(a: Art) { return RARITY_COST[a.rarity]; }

// 法宝武器信息（市集/背包/底栏展示）
export function treasureText(t: Treasure): string {
  const k = SKILL_LABEL[t.skill];
  return `${k.name}·${k.form} | 攻${starAttack(t)} 冷${starCd(t)}s${t.count && t.count > 1 ? ` ×${t.count}` : ""}`;
}

// 功法属性中文短文案
export function modText(mod: Modifier): string {
  const fmt: Array<[keyof Modifier, (v: number) => string]> = [
    ["damageMul", (v) => `增伤${Math.round(v * 100)}%`],
    ["cdMul", (v) => `急速${Math.round((1 - v) * 100)}%`],
    ["area", (v) => `范围+${Math.round(v * 100)}%`],
    ["maxHp", (v) => `血+${v}`],
    ["regen", (v) => `回血+${v}/s`],
    ["defense", (v) => `防${v >= 0 ? "+" : ""}${v}`],
    ["lifesteal", (v) => `吸血+${Math.round(v * 100)}%`],
    ["moveSpeed", (v) => `移速+${v}`],
    ["pickupRadius", (v) => `拾取+${v}`],
    ["projectiles", (v) => `投射+${v}`],
    ["xpMul", (v) => `经验+${Math.round(v * 100)}%`],
  ];
  const parts: string[] = [];
  for (const [k, f] of fmt) {
    const v = mod[k];
    if (v !== undefined && v !== 0) parts.push(f(v));
  }
  return parts.join(" · ");
}
