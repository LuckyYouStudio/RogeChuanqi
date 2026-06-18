// 修仙幸存者 · 成长系统
// 法宝 = 自动武器（攻击/CD/技能形态/标签）；功法 = 全局被动；羁绊 = 同标签流派特性
// 纯数据 + 计算，无渲染依赖。

export type Tag = "剑" | "刀" | "仙" | "魔" | "妖" | "体" | "雷" | "阵" | "木";
export type Rarity = "common" | "uncommon" | "rare" | "epic";

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
  | "boomerang"; // 回旋镖：大弧往返穿击

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
};

export const TAG_HINT: Record<Tag, string> = {
  剑: "多重穿透·暴击", 刀: "急速连斩", 仙: "续航回血", 魔: "高伤狂暴",
  妖: "吸血爆裂·子弹裂变", 体: "厚血高防", 雷: "链式弹跳", 阵: "范围控场", 木: "拾取成长",
};

export type SynergyDef = { tag: Tag; need: number; mod?: Modifier; flags?: Partial<Flags>; desc: string };
export const SYNERGIES: SynergyDef[] = [
  // 剑：多重穿透 → 暴击 → 全屏剑雨
  { tag: "剑", need: 2, mod: { projectiles: 1, damageMul: 0.05 }, desc: "投射+1，增伤5%" },
  { tag: "剑", need: 3, mod: { damageMul: 0.1 }, desc: "增伤10%" },
  { tag: "剑", need: 4, mod: { damageMul: 0.05 }, flags: { crit: 0.2 }, desc: "暴击20%(×2)，增伤5%" },
  { tag: "剑", need: 5, mod: { projectiles: 1 }, desc: "投射+1" },
  { tag: "剑", need: 6, mod: { projectiles: 1, damageMul: 0.12 }, flags: { crit: 0.1 }, desc: "投射+1，增伤12%，暴击+10%" },
  { tag: "剑", need: 9, mod: { damageMul: 0.2 }, flags: { crit: 0.15, swordStorm: 4 }, desc: "万剑诀：每4秒全屏剑雨，暴击+15%" },
  // 刀：急速连斩
  { tag: "刀", need: 2, mod: { cdMul: 0.9 }, desc: "冷却-10%" },
  { tag: "刀", need: 3, mod: { damageMul: 0.08 }, desc: "增伤8%" },
  { tag: "刀", need: 4, mod: { cdMul: 0.88 }, desc: "冷却-12%" },
  { tag: "刀", need: 5, mod: { damageMul: 0.12 }, desc: "增伤12%" },
  { tag: "刀", need: 6, mod: { cdMul: 0.85 }, desc: "冷却-15%" },
  { tag: "刀", need: 9, mod: { cdMul: 0.8, damageMul: 0.25 }, desc: "一刀两断：冷却-20%，增伤25%" },
  // 仙：续航 → 免死盾
  { tag: "仙", need: 2, mod: { regen: 0.6, maxHp: 25 }, desc: "回血+0.6/s，血+25" },
  { tag: "仙", need: 3, mod: { regen: 0.6 }, desc: "回血+0.6/s" },
  { tag: "仙", need: 4, mod: { maxHp: 40, defense: 2 }, desc: "血+40，防+2" },
  { tag: "仙", need: 5, mod: { regen: 0.8 }, desc: "回血+0.8/s" },
  { tag: "仙", need: 6, flags: { shieldInterval: 12 }, desc: "每12秒获得一层免死护盾" },
  { tag: "仙", need: 9, mod: { regen: 1.2 }, flags: { shieldInterval: 8 }, desc: "不死仙体：护盾每8秒，回血+1.2/s" },
  // 魔：高伤狂暴
  { tag: "魔", need: 2, mod: { damageMul: 0.15, defense: -2 }, desc: "增伤15%，防-2" },
  { tag: "魔", need: 3, mod: { damageMul: 0.12 }, desc: "增伤12%" },
  { tag: "魔", need: 4, flags: { berserk: 0.3 }, desc: "残血狂暴（最高+30%伤）" },
  { tag: "魔", need: 5, mod: { damageMul: 0.15 }, desc: "增伤15%" },
  { tag: "魔", need: 6, flags: { berserk: 0.3 }, desc: "残血狂暴再+30%" },
  { tag: "魔", need: 9, mod: { damageMul: 0.3 }, flags: { berserk: 0.4 }, desc: "魔神附体：增伤30%，狂暴+40%" },
  // 妖：吸血爆裂
  { tag: "妖", need: 2, mod: { lifesteal: 0.05 }, desc: "吸血+5%" },
  { tag: "妖", need: 3, mod: { lifesteal: 0.04 }, desc: "吸血+4%" },
  { tag: "妖", need: 4, flags: { killExplode: 2.6 }, desc: "击杀爆裂(2.6)" },
  { tag: "妖", need: 5, mod: { lifesteal: 0.05 }, desc: "吸血+5%" },
  { tag: "妖", need: 6, flags: { killExplode: 3.4 }, desc: "击杀爆裂增强(3.4)" },
  { tag: "妖", need: 9, mod: { lifesteal: 0.08 }, flags: { killExplode: 4.5 }, desc: "血海滔天：大爆裂(4.5)，吸血+8%" },
  // 体：厚血反伤
  { tag: "体", need: 2, mod: { defense: 5, maxHp: 40 }, desc: "防+5，血+40" },
  { tag: "体", need: 3, mod: { maxHp: 50 }, desc: "血+50" },
  { tag: "体", need: 4, mod: { defense: 6 }, desc: "防+6" },
  { tag: "体", need: 5, mod: { maxHp: 70 }, desc: "血+70" },
  { tag: "体", need: 6, flags: { thorns: 0.4 }, desc: "反伤40%（受击反弹周围）" },
  { tag: "体", need: 9, mod: { defense: 10, maxHp: 120 }, flags: { thorns: 0.6 }, desc: "金刚不坏：反伤60%，防+10，血+120" },
  // 雷：链式 → 天雷
  { tag: "雷", need: 2, flags: { chainBonus: 2 }, desc: "落雷/连雷 多弹跳2目标" },
  { tag: "雷", need: 3, mod: { damageMul: 0.08 }, desc: "增伤8%" },
  { tag: "雷", need: 4, flags: { chainBonus: 2 }, desc: "再多弹跳2目标" },
  { tag: "雷", need: 5, mod: { area: 0.15 }, desc: "范围+15%" },
  { tag: "雷", need: 6, mod: { damageMul: 0.1 }, flags: { chainBonus: 2 }, desc: "增伤10%，再弹跳2" },
  { tag: "雷", need: 9, mod: { damageMul: 0.15 }, flags: { thunderStorm: 3.5 }, desc: "天雷诛仙：持续天雷轰炸，增伤15%" },
  // 阵：范围 → 灭阵光环
  { tag: "阵", need: 2, mod: { area: 0.2 }, desc: "范围+20%" },
  { tag: "阵", need: 3, mod: { area: 0.15 }, desc: "范围+15%" },
  { tag: "阵", need: 4, flags: { auraDps: 16, auraRadius: 3.2 }, desc: "灭阵光环：环身持续伤害" },
  { tag: "阵", need: 5, mod: { area: 0.2 }, desc: "范围+20%" },
  { tag: "阵", need: 6, flags: { auraDps: 16, auraRadius: 3.8 }, desc: "光环增强（更大更疼）" },
  { tag: "阵", need: 9, mod: { area: 0.25 }, flags: { auraDps: 40, auraRadius: 5.0 }, desc: "囚天大阵：永久强光环，范围+25%" },
  // 木：成长续航
  { tag: "木", need: 2, mod: { pickupRadius: 2, xpMul: 0.15 }, desc: "拾取+2，经验+15%" },
  { tag: "木", need: 3, mod: { regen: 0.6 }, desc: "回血+0.6/s" },
  { tag: "木", need: 4, mod: { xpMul: 0.15 }, desc: "经验+15%" },
  { tag: "木", need: 5, mod: { pickupRadius: 2 }, desc: "拾取+2" },
  { tag: "木", need: 6, mod: { regen: 1.0, xpMul: 0.2 }, desc: "回血+1/s，经验+20%" },
  { tag: "木", need: 9, mod: { regen: 1.5, xpMul: 0.3, pickupRadius: 3 }, desc: "万木回春：回血+1.5/s，经验+30%，拾取+3" },
];

export const TREASURES: Treasure[] = [
  // 剑系
  { id: "t_feijian", name: "青锋飞剑", tags: ["剑"], rarity: "common", cost: 10, skill: "sword", attack: 12, cd: 0.9, count: 1, desc: "追踪最近之敌的穿透剑气。" },
  { id: "t_shuangsheng", name: "双生飞剑", tags: ["剑"], rarity: "uncommon", cost: 16, skill: "sword", attack: 10, cd: 0.95, count: 2, traits: { pierce: true }, desc: "一次御两道飞剑，洞穿成列。" },
  { id: "t_jianhuan", name: "周天剑环", tags: ["剑", "阵"], rarity: "rare", cost: 30, skill: "orbit", attack: 13, cd: 4.0, count: 3, radius: 2.4, desc: "三剑环身旋绕，触者皆伤。" },
  { id: "t_wanjian", name: "万剑诀", tags: ["剑"], rarity: "epic", cost: 52, skill: "rain", attack: 15, cd: 3.2, count: 8, radius: 6.5, desc: "万剑自天而降。" },
  // 刀系
  { id: "t_zhanyao", name: "斩妖刀", tags: ["刀"], rarity: "common", cost: 10, skill: "whirl", attack: 16, cd: 1.0, radius: 3.4, traits: { knock: true }, desc: "旋身一周，环身刀气尽斩、震退近敌。" },
  { id: "t_qisha", name: "七杀刀经", tags: ["刀", "魔"], rarity: "rare", cost: 30, skill: "lance", attack: 30, cd: 1.3, traits: { burn: true }, desc: "刀芒化枪，长驱直贯一列妖众、余焰灼身。" },
  // 雷系
  { id: "t_zhangxinlei", name: "掌心雷", tags: ["雷"], rarity: "uncommon", cost: 16, skill: "strike", attack: 24, cd: 1.8, radius: 3, desc: "点名最近之敌，劈下落雷。" },
  { id: "t_zixiao", name: "紫霄神雷", tags: ["雷"], rarity: "rare", cost: 32, skill: "chain", attack: 22, cd: 2.4, count: 4, traits: { bounce: true }, desc: "雷光在敌群间链式弹跳，余电再窜。" },
  { id: "t_wulei", name: "五雷正法", tags: ["雷", "阵"], rarity: "epic", cost: 52, skill: "rain", attack: 20, cd: 3.0, count: 6, radius: 6, desc: "范围内雷雨倾泻。" },
  // 阵系
  { id: "t_kunzhen", name: "五行困阵", tags: ["阵"], rarity: "uncommon", cost: 16, skill: "sigil", attack: 16, cd: 2.0, radius: 4, traits: { slow: true }, desc: "落地结成五行困阵，持续锁滞、磨伤范围之敌。" },
  { id: "t_dayan", name: "大衍灭阵", tags: ["阵", "魔"], rarity: "rare", cost: 30, skill: "sigil", attack: 9, cd: 1.2, radius: 3.6, traits: { slow: true, burn: true }, desc: "落地灭阵牢笼，减速并灼烧困于其中之敌。" },
  // 妖系
  { id: "t_shihun", name: "噬魂蝠", tags: ["妖"], rarity: "common", cost: 10, skill: "bolt", attack: 14, cd: 1.0, count: 1, traits: { fork: true }, desc: "自动追踪的噬魂法弹，逢杀裂变。" },
  { id: "t_xuemo", name: "血魔幡", tags: ["妖", "魔"], rarity: "rare", cost: 30, skill: "bolt", attack: 20, cd: 1.2, count: 2, traits: { fork: true }, desc: "双幡索命，自动追敌，逢杀裂变。" },
  // 体系
  { id: "t_gangqi", name: "护体罡气", tags: ["体"], rarity: "common", cost: 10, skill: "aura", attack: 8, cd: 0.6, radius: 2.6, desc: "贴身罡气，持续磨伤。" },
  // 仙/木
  { id: "t_huichun", name: "太极玄光印", tags: ["仙", "木"], rarity: "uncommon", cost: 18, skill: "sigil", attack: 16, cd: 2.4, radius: 4.0, traits: { slow: true }, desc: "太极玄光落地成阵，缓滞并磨伤范围之敌。" },
  { id: "t_tengbian", name: "青木藤鞭", tags: ["木"], rarity: "uncommon", cost: 16, skill: "vine", attack: 14, cd: 1.0, radius: 3.2, count: 3, traits: { slow: true }, desc: "藤蔓向四方蔓生，缠滞并磨伤。" },
  // —— 扩充 ——
  { id: "t_yujian", name: "御剑诀", tags: ["剑"], rarity: "common", cost: 10, skill: "sword", attack: 11, cd: 1.0, count: 1, desc: "基础御剑术。" },
  { id: "t_feijiantu", name: "飞剑图录", tags: ["剑"], rarity: "rare", cost: 30, skill: "rain", attack: 14, cd: 3.0, count: 6, radius: 5.5, desc: "图中飞剑倾泻而下。" },
  { id: "t_kuangdao", name: "狂澜刀", tags: ["刀"], rarity: "uncommon", cost: 16, skill: "whirl", attack: 20, cd: 1.1, radius: 3.6, traits: { knock: true }, desc: "刀势如澜，旋身一周横扫四面。" },
  { id: "t_xuedao", name: "血饮狂刀", tags: ["刀", "妖"], rarity: "rare", cost: 32, skill: "lance", attack: 26, cd: 1.3, traits: { magnet: true }, desc: "饮血长刀贯穿成列，摄敌近身。" },
  { id: "t_qingling", name: "清灵罡盾", tags: ["仙", "体"], rarity: "common", cost: 10, skill: "aura", attack: 7, cd: 0.6, radius: 2.6, desc: "清灵护体，磨伤近敌。" },
  { id: "t_taiyi", name: "太一焚天印", tags: ["仙", "雷"], rarity: "rare", cost: 32, skill: "strike", attack: 26, cd: 2.0, radius: 3.2, traits: { burn: true }, desc: "太一神雷，点名轰击、余焰焚身。" },
  { id: "t_jingang", name: "金刚降魔杵", tags: ["体"], rarity: "uncommon", cost: 16, skill: "whirl", attack: 22, cd: 1.4, radius: 3.2, traits: { knock: true }, desc: "宝杵旋身横扫，刚猛震退四周。" },
  { id: "t_zhenshan", name: "镇山玉印", tags: ["体", "阵"], rarity: "rare", cost: 30, skill: "whirl", attack: 20, cd: 1.7, radius: 4.2, traits: { knock: true }, desc: "玉印旋压，环身震退人墙。" },
  { id: "t_guimei", name: "鬼魅引魂幡", tags: ["妖"], rarity: "uncommon", cost: 16, skill: "bolt", attack: 16, cd: 1.0, count: 1, traits: { magnet: true }, desc: "引魂法弹自动索敌，摄魂近身。" },
  { id: "t_moyan", name: "魔焰天罚", tags: ["魔", "雷"], rarity: "rare", cost: 32, skill: "rain", attack: 18, cd: 2.8, count: 5, radius: 5.5, traits: { burn: true }, desc: "魔焰自天而降，落处余火焚敌。" },
  { id: "t_leidun", name: "雷遁符", tags: ["雷"], rarity: "common", cost: 10, skill: "strike", attack: 20, cd: 1.6, radius: 2.8, desc: "雷遁劈落最近之敌。" },
  { id: "t_wuxingpan", name: "五行旋盘", tags: ["阵"], rarity: "rare", cost: 30, skill: "orbit", attack: 12, cd: 4.0, count: 4, radius: 2.6, desc: "五行盘环身旋杀。" },
  { id: "t_mudun", name: "木遁缠藤", tags: ["木"], rarity: "common", cost: 10, skill: "vine", attack: 12, cd: 1.0, radius: 3.0, count: 3, traits: { slow: true }, desc: "藤蔓向四方蔓生缠滞近敌。" },
  // —— 补全各标签（确保都有便宜白件可叠高阶） ——
  { id: "t_xiaojian", name: "小飞剑", tags: ["剑"], rarity: "common", cost: 1, skill: "sword", attack: 10, cd: 1.0, count: 1, desc: "入门御剑。" },
  { id: "t_pdao", name: "破甲刀", tags: ["刀"], rarity: "common", cost: 1, skill: "whirl", attack: 16, cd: 1.2, radius: 3.2, desc: "朴实旋身横扫。" },
  { id: "t_fengkuaidao", name: "疾风快刀", tags: ["刀"], rarity: "uncommon", cost: 2, skill: "whirl", attack: 16, cd: 0.85, radius: 3.2, desc: "快刀如风，急速旋斩。" },
  { id: "t_julingfu", name: "聚灵符", tags: ["仙"], rarity: "common", cost: 1, skill: "aura", attack: 6, cd: 0.7, radius: 2.4, desc: "灵气护身。" },
  { id: "t_lingguang", name: "灵光弹", tags: ["仙"], rarity: "common", cost: 1, skill: "bolt", attack: 12, cd: 1.1, count: 1, traits: { magnet: true }, desc: "清灵法弹追敌，摄敌近身。" },
  { id: "t_yulu", name: "玉露灵针", tags: ["仙"], rarity: "uncommon", cost: 2, skill: "bolt", attack: 14, cd: 1.05, count: 1, desc: "玉露凝针，自动索敌。" },
  { id: "t_mohuo", name: "魔火弹", tags: ["魔"], rarity: "common", cost: 1, skill: "bolt", attack: 13, cd: 1.0, count: 1, traits: { burn: true }, desc: "魔火索敌，灼烧不息。" },
  { id: "t_xuenu", name: "血怒刀", tags: ["魔", "妖"], rarity: "uncommon", cost: 2, skill: "forward", attack: 20, cd: 1.3, count: 1, traits: { burn: true }, desc: "血怒直进，破阵重击焚敌。" },
  { id: "t_xiaozhen", name: "小聚灵阵", tags: ["阵"], rarity: "common", cost: 1, skill: "nova", attack: 12, cd: 1.7, radius: 3.6, desc: "入门阵爆。" },
  { id: "t_suoyaozhen", name: "锁妖阵", tags: ["阵"], rarity: "uncommon", cost: 2, skill: "sigil", attack: 9, cd: 1.4, radius: 3.2, traits: { slow: true }, desc: "落地锁妖，定点缓滞、磨伤其中之敌。" },
  { id: "t_qingteng", name: "青藤缠丝", tags: ["木"], rarity: "common", cost: 1, skill: "vine", attack: 11, cd: 1.0, radius: 3.0, count: 3, traits: { slow: true }, desc: "青藤向四方蔓生缠滞。" },
  { id: "t_huti", name: "护体灵盾", tags: ["体"], rarity: "common", cost: 1, skill: "aura", attack: 7, cd: 0.6, radius: 2.6, desc: "灵盾磨伤近敌。" },
  // —— 刀·高阶回旋大刀（长射程·圆弧穿击） ——
  { id: "t_huifeng", name: "回风折刃", tags: ["刀", "木"], rarity: "rare", cost: 3, skill: "boomerang", attack: 26, cd: 2.2, count: 1, radius: 7, desc: "折刃乘风，划大弧斩出复返。" },
  { id: "t_zhanyue", name: "斩月霸刀", tags: ["刀"], rarity: "epic", cost: 4, skill: "glaive", attack: 42, cd: 2.6, count: 1, radius: 6.2, traits: { knock: true }, desc: "巨刀离手，弧光斩月，贯穿成排妖众。" },
  // —— 固定轨迹（不锁敌） ——
  { id: "t_zhoutian", name: "周天剑气", tags: ["剑"], rarity: "rare", cost: 3, skill: "radial", attack: 11, cd: 1.7, count: 8, traits: { pierce: true }, desc: "八方剑气同时迸射，洞穿成列。" },
  { id: "t_fentian", name: "焚天十方印", tags: ["魔", "雷"], rarity: "epic", cost: 4, skill: "radial", attack: 14, cd: 2.2, count: 10, traits: { burn: true }, desc: "十方齐射，焚尽四周。" },
  { id: "t_douzhuan", name: "斗转星移盘", tags: ["阵", "雷"], rarity: "epic", cost: 4, skill: "spiral", attack: 11, cd: 0.2, count: 1, desc: "周天旋转，剑气连绵成螺旋。" },
  { id: "t_pojun", name: "破军枪意", tags: ["刀"], rarity: "rare", cost: 3, skill: "forward", attack: 16, cd: 0.9, count: 3, traits: { pierce: true }, desc: "沿前行方向破阵直进，洞穿成列。" },
  // —— 补足各标签（妖/体/木/仙/魔 加强，每标签≥9，含便宜白件） ——
  // 妖
  { id: "t_shexuebat", name: "噬血蝠群", tags: ["妖"], rarity: "common", cost: 1, skill: "bolt", attack: 13, cd: 1.0, count: 2, traits: { fork: true }, desc: "双蝠索敌，见血回元，逢杀裂变。" },
  { id: "t_shehunling", name: "摄魂铃", tags: ["妖"], rarity: "common", cost: 1, skill: "aura", attack: 8, cd: 0.6, radius: 2.8, desc: "铃音摄魂，磨损近敌。" },
  { id: "t_xueying", name: "血影刀", tags: ["妖", "刀"], rarity: "uncommon", cost: 2, skill: "bolt", attack: 18, cd: 1.0, count: 2, traits: { fork: true, magnet: true }, desc: "血影化弹索敌，摄敌裂变。" },
  { id: "t_xuehe", name: "血河图", tags: ["妖"], rarity: "rare", cost: 3, skill: "rain", attack: 16, cd: 2.8, count: 6, radius: 6, desc: "血河倾覆，漫染四方。" },
  // 体
  { id: "t_xuangui", name: "玄龟甲", tags: ["体"], rarity: "common", cost: 1, skill: "aura", attack: 7, cd: 0.6, radius: 2.6, desc: "龟甲护体，反磨贴身之敌。" },
  { id: "t_houtu", name: "厚土灵盾", tags: ["体", "木"], rarity: "common", cost: 1, skill: "aura", attack: 7, cd: 0.65, radius: 2.7, desc: "厚土生灵，缓损四周。" },
  { id: "t_shanyue", name: "山岳镇印", tags: ["体", "阵"], rarity: "uncommon", cost: 2, skill: "nova", attack: 18, cd: 1.7, radius: 4, traits: { knock: true }, desc: "山岳压顶，环身震退四周。" },
  { id: "t_zhenmochuang", name: "镇魔幢", tags: ["体", "魔"], rarity: "rare", cost: 3, skill: "meteor", attack: 28, cd: 2.4, radius: 4.4, traits: { knock: true }, desc: "镇魔大幢自天砸落，巨震四周。" },
  // 木
  { id: "t_chunsheng", name: "春生藤", tags: ["木"], rarity: "common", cost: 1, skill: "vine", attack: 12, cd: 1.0, radius: 3, count: 3, traits: { slow: true }, desc: "春藤向四方蔓生缠滞。" },
  { id: "t_mulingdan", name: "木灵弹", tags: ["木", "仙"], rarity: "common", cost: 1, skill: "bolt", attack: 12, cd: 1.05, count: 1, desc: "木灵法弹追敌。" },
  { id: "t_qingtengjian", name: "青藤剑", tags: ["木", "剑"], rarity: "uncommon", cost: 2, skill: "sword", attack: 11, cd: 0.95, count: 1, desc: "藤化飞剑，缠斩追敌。" },
  { id: "t_wanmu", name: "万木朝宗", tags: ["木", "阵"], rarity: "rare", cost: 3, skill: "sigil", attack: 18, cd: 2.0, radius: 4.2, traits: { slow: true }, desc: "万木生发结界，缓滞、磨伤范围之敌。" },
  // 仙
  { id: "t_taiyifu", name: "太乙神符", tags: ["仙"], rarity: "common", cost: 1, skill: "strike", attack: 20, cd: 1.7, radius: 2.8, desc: "太乙符雷，点名轰击。" },
  { id: "t_jingshiling", name: "净世铃", tags: ["仙", "阵"], rarity: "uncommon", cost: 2, skill: "sigil", attack: 9, cd: 1.4, radius: 3.2, traits: { slow: true }, desc: "净世结界落地，缓滞、灼蚀其中之敌。" },
  { id: "t_xianyuanjian", name: "仙缘飞剑", tags: ["仙", "剑"], rarity: "uncommon", cost: 2, skill: "sword", attack: 11, cd: 0.95, count: 1, desc: "仙缘所引，剑随心动。" },
  // 魔
  { id: "t_shehunren", name: "噬魂刃", tags: ["魔"], rarity: "common", cost: 1, skill: "forward", attack: 18, cd: 1.1, count: 1, traits: { burn: true }, desc: "噬魂直进，单点重击焚魂。" },
  { id: "t_xuemodan", name: "血魔弹", tags: ["魔", "妖"], rarity: "common", cost: 1, skill: "bolt", attack: 14, cd: 1.0, count: 1, traits: { burn: true }, desc: "血魔法弹索命，灼烧不息。" },
  { id: "t_mieshi", name: "灭世魔印", tags: ["魔", "阵"], rarity: "rare", cost: 3, skill: "meteor", attack: 30, cd: 2.6, radius: 4.5, traits: { burn: true, knock: true }, desc: "灭世魔印自天砸落，焚震四周。" },
  // 雷 / 阵 补白件
  { id: "t_yinleifu", name: "引雷符", tags: ["雷"], rarity: "common", cost: 1, skill: "strike", attack: 20, cd: 1.6, radius: 2.8, desc: "引天雷劈落最近之敌。" },
  { id: "t_kunlong", name: "困龙阵", tags: ["阵"], rarity: "common", cost: 1, skill: "nova", attack: 13, cd: 1.7, radius: 3.8, desc: "困龙小阵，环身震慑。" },
];

export const ARTS: Art[] = [
  { id: "a_gongxin", name: "攻心诀", rarity: "common", cost: 8, desc: "诸般攻击更狠。", mod: { damageMul: 0.1 } },
  { id: "a_jifeng", name: "疾风诀", rarity: "common", cost: 8, desc: "出手更快。", mod: { cdMul: 0.93 } },
  { id: "a_tuna", name: "吐纳功", rarity: "common", cost: 8, desc: "缓缓回元。", mod: { regen: 0.6 } },
  { id: "a_juling", name: "聚灵诀", rarity: "common", cost: 8, desc: "灵气吸取更广、经验更多。", mod: { pickupRadius: 1.6, xpMul: 0.1 } },
  { id: "a_yufeng", name: "御风步", rarity: "common", cost: 8, desc: "身法更快。", mod: { moveSpeed: 1.0 } },
  { id: "a_budong", name: "不动明王功", rarity: "uncommon", cost: 14, desc: "气血如山。", mod: { maxHp: 50, defense: 4 } },
  { id: "a_shixue", name: "噬血大法", rarity: "uncommon", cost: 14, desc: "见血回元。", mod: { lifesteal: 0.05 } },
  { id: "a_chongying", name: "多重剑影", rarity: "uncommon", cost: 16, desc: "投射类武器多一发。", mod: { projectiles: 1 } },
  { id: "a_taixu", name: "太虚大法", rarity: "rare", cost: 24, desc: "范围更大，略增伤。", mod: { area: 0.2, damageMul: 0.06 } },
  { id: "a_shafa", name: "杀伐决断", rarity: "rare", cost: 24, desc: "大幅增伤。", mod: { damageMul: 0.2 } },
  { id: "a_jinshen", name: "金身不坏", rarity: "epic", cost: 40, desc: "气血、防御、回元齐飞。", mod: { maxHp: 90, defense: 8, regen: 0.6 } },
];

export function emptyStats(): Stats {
  return { damageMul: 0, cdMul: 1, area: 0, maxHp: 0, regen: 0, defense: 0, lifesteal: 0, moveSpeed: 0, pickupRadius: 0, projectiles: 0, xpMul: 0 };
}
export function emptyFlags(): Flags {
  return { crit: 0, critMul: 2, chainBonus: 0, killExplode: 0, berserk: 0, thorns: 0, auraDps: 0, auraRadius: 0, swordStorm: 0, thunderStorm: 0, shieldInterval: 0 };
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
  const tags: Tag[] = ["剑", "刀", "仙", "魔", "妖", "体", "雷", "阵", "木"];
  return tags.map((tag) => {
    const count = counts.get(tag) ?? 0;
    const tiers = SYNERGIES.filter((s) => s.tag === tag).map((s) => ({ need: s.need, desc: s.desc, active: count >= s.need }));
    return { tag, hint: TAG_HINT[tag], count, tiers };
  });
}

function rollRarity(level: number): Rarity {
  const bias = Math.min(0.3, level * 0.02);
  const epic = 0.04 + bias * 0.5;
  const rare = 0.2 + bias;
  const roll = Math.random();
  return roll < epic ? "epic" : roll < rare ? "rare" : roll < 0.7 ? "uncommon" : "common";
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

// 品阶：白 < 蓝 < 紫 < 橙
export const RARITY_COLOR: Record<Rarity, string> = { common: "#e6ebe4", uncommon: "#5aa6ff", rare: "#b977ff", epic: "#ff9b3d" };
export const RARITY_LABEL: Record<Rarity, string> = { common: "白", uncommon: "蓝", rare: "紫", epic: "橙" };
// 按品阶统一定价（灵石）：白1 蓝2 紫3 橙4
export const RARITY_COST: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 4 };
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
