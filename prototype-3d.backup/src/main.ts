import * as THREE from "three";
import {
  activeRaidStatus,
  buyShopItem,
  clearToken,
  dieInRaid,
  extractRaid,
  getToken,
  login,
  logout,
  type Loadout,
  type ProfileUser,
  profile,
  register,
  refineStashItem,
  reportRaidEvent,
  repairStashItem,
  salvageStashItem,
  saveLoadout,
  sellStashItem,
  shop,
  startRaid,
  type Raid,
  type RaidEventType,
  type RaidEventPayload,
  type ServerItem,
  type ShopOffer,
} from "./api";
import { createBindingField, createDamageText, createHitBurst, createPickupBeam, createQingyuanHitBurst, createSlashEffect, createThunderStrike, type Effect } from "./effects";
import { createCorpsePuppet, createExtractionGate, createLootBeacon, createLootModel, createSearchNodeModel, createStoneStele, createSwordCultivator } from "./models";
import "./style.css";

type LootKind = "功法玉简" | "灵石" | "法器" | "道袍" | "丹药" | "秘宝";

type LootItem = {
  id: number;
  itemId?: string;
  claimToken?: string;
  source?: string;
  sourceId?: string;
  sourcePosition?: { x: number; z: number };
  name: string;
  kind: LootKind;
  value: number;
  rarity: "common" | "uncommon" | "rare" | "epic";
  equipSlot?: "weapon" | "robe";
  stats?: {
    attack?: number;
    defense?: number;
  };
  rogue?: RogueChoice;
};

type RogueTag = "剑" | "刀" | "仙" | "魔" | "妖" | "体" | "雷" | "阵" | "木";
type RogueSlot = "main" | "offhand" | "robe" | "trinket";

type RogueModifier = {
  attack?: number;
  defense?: number;
  maxHp?: number;
  regen?: number;
  swordDamage?: number;
  thunderDamage?: number;
  bindingDamage?: number;
  cooldownScale?: number;
  searchSpeedBonus?: number;
  lifesteal?: number;
};

type RogueChoice = {
  id: string;
  name: string;
  type: "equipment" | "art";
  slot?: RogueSlot;
  tags: RogueTag[];
  rarity: LootItem["rarity"];
  value: number;
  description: string;
  mod: RogueModifier;
};

type RogueBuild = {
  gear: Partial<Record<RogueSlot, RogueChoice>>;
  arts: RogueChoice[];
};

type Enemy = {
  mesh: THREE.Object3D;
  hpBar: THREE.Group;
  sourceId?: string;
  hp: number;
  maxHp: number;
  speed: number;
  hitCooldown: number;
  flash: number;
  elite: boolean;
  alertTarget: THREE.Vector3 | null;
  alertTime: number;
};

type Rival = {
  mesh: THREE.Object3D;
  hpBar: THREE.Group;
  sourceId: string;
  hp: number;
  maxHp: number;
  speed: number;
  hitCooldown: number;
  flash: number;
  name: string;
  lootBag: LootItem[];
  state: "loot" | "hunt" | "extract";
  goal: THREE.Vector3;
  extractProgress: number;
  decisionTimer: number;
  stateReportTimer: number;
};

type LootDrop = {
  mesh: THREE.Object3D;
  beacon: THREE.Object3D;
  item: LootItem;
};

type QingyuanSword = {
  mesh: THREE.Group;
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  age: number;
  duration: number;
  delay: number;
  damage: number;
  hit: Set<Enemy>;
};

type SearchNodeKind = "weapon_rack" | "corpse_pack" | "spirit_ore" | "sealed_chest";

type SearchNode = {
  id: number;
  kind: SearchNodeKind;
  mesh: THREE.Object3D;
  searched: boolean;
  searchPending: boolean;
  progress: number;
  duration: number;
};

type RemotePlayer = {
  peerId: string;
  userId: string;
  raidId: string;
  username: string;
  mesh: THREE.Object3D;
  hpBar: THREE.Group;
  target: THREE.Vector3;
  hp: number;
  maxHp: number;
  flash: number;
  down: boolean;
  lastSeen: number;
  gear: GearAppearance;
};

type GearAppearance = Partial<Record<"weapon" | "robe", string>>;

const SEARCH_NODE_SPAWNS = [
  ["corpse_pack", -16.2, 12.6],
  ["weapon_rack", -8, 6],
  ["corpse_pack", 7, 9],
  ["spirit_ore", -13, -7],
  ["sealed_chest", 10, -8],
  ["corpse_pack", 0, -14],
] satisfies Array<[SearchNodeKind, number, number]>;

const appNode = document.querySelector<HTMLDivElement>("#app");
if (!appNode) throw new Error("Missing #app");
const app = appNode;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.tabIndex = 0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x09110e);
scene.fog = new THREE.Fog(0x09110e, 28, 72);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 140);
camera.position.set(0, 17, 19);
camera.lookAt(0, 0, 0);

const sun = new THREE.DirectionalLight(0xf3ffe6, 2.2);
sun.position.set(-12, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -36;
sun.shadow.camera.right = 36;
sun.shadow.camera.top = 36;
sun.shadow.camera.bottom = -36;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x9ed5ff, 0x244131, 1.35));

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x25362b, roughness: 0.95 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(90, 45, 0x5f7a62, 0x334337);
grid.position.y = 0.015;
scene.add(grid);

const player = createSwordCultivator();
player.position.set(-17, 0, 13);
scene.add(player);

const extraction = createExtractionGate();
extraction.position.set(18, 0.08, -14);
scene.add(extraction);

for (let i = 0; i < 20; i++) {
  const stone = createStoneStele(1.2 + Math.random() * 2.4);
  stone.position.set(Math.random() * 70 - 35, 0, Math.random() * 70 - 35);
  if (stone.position.distanceTo(player.position) < 8 || stone.position.distanceTo(extraction.position) < 6) {
    stone.position.x += 14;
  }
  stone.rotation.y = Math.random() * Math.PI;
  stone.castShadow = true;
  stone.receiveShadow = true;
  scene.add(stone);
}

const keys = new Set<string>();
const pointer = new THREE.Vector2();
let pointerWorld = new THREE.Vector3(1, 0, 0);
let playerHp = 100;
let spirit = 0;
let inventory: LootItem[] = [];
let spiritStoneLoot: LootItem[] = [];
let raidConsumables: ServerItem[] = [];
let raidGear: Partial<Record<"weapon" | "robe", number>> = {};
type RaidRuneId = "sword_qi_edge" | "thunder_focus" | "spirit_sense_flow";
const RUNE_CONFIG: Record<RaidRuneId, { name: string; attackKind: string; damageBonus?: number; searchSpeedBonus?: number }> = {
  sword_qi_edge: { name: "锋芒剑痕", attackKind: "sword_qi", damageBonus: 6 },
  thunder_focus: { name: "掌心雷印", attackKind: "thunder_seal", damageBonus: 8 },
  spirit_sense_flow: { name: "神识流转", attackKind: "utility", searchSpeedBonus: 0.15 },
};
let raidRunes: RaidRuneId[] = [];
const ROGUE_SLOT_LABEL: Record<RogueSlot, string> = {
  main: "主器",
  offhand: "副器",
  robe: "法袍",
  trinket: "灵饰",
};
const ROGUE_TAG_HINT: Record<RogueTag, string> = {
  剑: "青锋连斩",
  刀: "破甲重击",
  仙: "清气回元",
  魔: "高伤噬身",
  妖: "吸血化形",
  体: "气血护体",
  雷: "雷法爆发",
  阵: "范围控场",
  木: "生发续航",
};
const ROGUE_CHOICES: RogueChoice[] = [
  { id: "green_sword_seed", name: "青木剑胎", type: "equipment", slot: "main", tags: ["剑", "木"], rarity: "uncommon", value: 70, description: "青芒如丝，剑气越打越密。", mod: { attack: 7, swordDamage: 8 } },
  { id: "black_blade", name: "玄铁斩妖刀", type: "equipment", slot: "main", tags: ["刀", "妖"], rarity: "rare", value: 145, description: "刀势沉重，专破妖躯。", mod: { attack: 13, lifesteal: 0.02 } },
  { id: "thunder_seal", name: "掌雷古印", type: "equipment", slot: "offhand", tags: ["雷", "仙"], rarity: "rare", value: 150, description: "掌心雷会更快、更疼。", mod: { thunderDamage: 16, cooldownScale: 0.94 } },
  { id: "bone_banner", name: "白骨摄魂幡", type: "equipment", slot: "offhand", tags: ["魔", "妖"], rarity: "epic", value: 230, description: "妖魔同源，击伤时偷取气血。", mod: { attack: 12, defense: -1, lifesteal: 0.05 } },
  { id: "iron_body_robe", name: "铁骨玄袍", type: "equipment", slot: "robe", tags: ["体", "阵"], rarity: "uncommon", value: 90, description: "硬吃围攻，小五行阵更稳。", mod: { defense: 5, maxHp: 20, bindingDamage: 5 } },
  { id: "cloud_immortal_robe", name: "流云仙衣", type: "equipment", slot: "robe", tags: ["仙", "木"], rarity: "rare", value: 155, description: "清气护身，边走边回。", mod: { defense: 3, regen: 0.55, maxHp: 12 } },
  { id: "demon_ring", name: "魔焰指环", type: "equipment", slot: "trinket", tags: ["魔", "刀"], rarity: "rare", value: 170, description: "伤害激进，防守变薄。", mod: { attack: 15, defense: -2, cooldownScale: 0.96 } },
  { id: "formation_jade", name: "小五行阵玉", type: "equipment", slot: "trinket", tags: ["阵", "仙"], rarity: "uncommon", value: 95, description: "阵法牵引敌人，控场伤害提高。", mod: { bindingDamage: 12, defense: 2 } },
  { id: "qingyuan_scroll", name: "功法：青元剑诀", type: "art", tags: ["剑", "木", "仙"], rarity: "rare", value: 180, description: "清冷锋锐，厚积薄发。", mod: { swordDamage: 14, regen: 0.25 } },
  { id: "seven_kill_blade", name: "功法：七杀刀经", type: "art", tags: ["刀", "魔"], rarity: "rare", value: 175, description: "血气越险，刀势越凶。", mod: { attack: 12, swordDamage: 6 } },
  { id: "thunder_body", name: "功法：雷骨炼体", type: "art", tags: ["雷", "体"], rarity: "uncommon", value: 110, description: "雷入骨髓，抗打又爆发。", mod: { maxHp: 18, defense: 3, thunderDamage: 8 } },
  { id: "monster_change", name: "功法：妖血变", type: "art", tags: ["妖", "体"], rarity: "rare", value: 165, description: "伤口化妖纹，越战越能吸。", mod: { maxHp: 28, lifesteal: 0.03 } },
  { id: "demon_flame", name: "功法：魔焰诀", type: "art", tags: ["魔", "雷"], rarity: "epic", value: 240, description: "雷火入魔，爆发极高。", mod: { attack: 18, thunderDamage: 14, defense: -3 } },
  { id: "five_phase_array", name: "功法：五行阵解", type: "art", tags: ["阵", "木"], rarity: "uncommon", value: 105, description: "木气生阵，困敌更久。", mod: { bindingDamage: 10, searchSpeedBonus: 0.08 } },
];
let rogueBuild: RogueBuild = { gear: {}, arts: [] };
let attackCooldown = 0;
let extractionProgress = 0;
let gameOver = false;
let nextLootId = 1;
let runTime = 0;
const RAID_DURATION = 180;
const BAG_SLOT_LIMIT = 18;
const SOLO_SKILL_IDS = ["sword_qi", "dash", "thunder_seal", "binding_array", "body_forging", "spirit_sense"];
let attackPulse = 0;
let playerHurtPulse = 0;
let cameraShake = 0;
let dashCooldown = 0;
let thunderCooldown = 0;
let bindingCooldown = 0;
let autoCombatTimer = 0;
let account: ProfileUser | null = null;
let authMode: "login" | "register" = "login";
let authPending = false;
let gameMode: "solo" | "online" = "online";
let activeRaid: Raid | null = null;
let resumableRaid: Raid | null = null;
let shopOffers: ShopOffer[] = [];
let usedRaidLootTokens = new Set<string>();
let lobbyMessage = "请登录后配置装备与技能，再进入秘境。";
let lastSettlement: { success: boolean; gained: LootItem[]; kept: LootItem[]; lost: LootItem[]; silverDelta: number } | null = null;
let searchPanelHtml = "";
let inventoryPanelHtml = "";
let threatWarning = "";
let threatWarningTime = 0;
let raidEventQueue: Promise<void> = Promise.resolve();
let raidSocket: WebSocket | null = null;
let localPeerId = "";
let positionReportTimer = 0;
let extractionStartedReported = false;
let soloWaveTimer = 0;
let soloWave = 0;
let soloLevel = 1;
let soloExp = 0;
let soloExpToNext = 24;
let rogueShopOpen = false;
let rogueShopChoices: RogueChoice[] = [];

const enemies: Enemy[] = [];
const rivals: Rival[] = [];
const remotePlayers = new Map<string, RemotePlayer>();
const lootDrops: LootDrop[] = [];
const qingyuanSwords: QingyuanSword[] = [];
const searchNodes: SearchNode[] = [];
const effects: Effect[] = [];
const floatingTexts: HTMLDivElement[] = [];
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML = `
  <div class="top-bar">
    <div class="chip"><b>血量</b><span id="hp">100</span></div>
    <div class="chip"><b>灵力</b><span id="spirit">0</span></div>
    <div class="chip"><b>境界</b><span id="soloLevel">1</span></div>
    <div class="chip"><b>战利品</b><span id="value">0</span></div>
    <div class="chip"><b>时间</b><span id="timer">03:00</span></div>
    <div class="chip"><b>撤离距</b><span id="extractDistance">--</span></div>
    <div class="chip"><b>撤离</b><span id="extract">未开始</span></div>
    <div class="chip"><b>战斗</b><span>自动</span></div>
  </div>
  <div class="inventory">
    <h2>乾坤袋</h2>
    <div id="lootList" class="loot-list"></div>
  </div>
  <div class="lobby-panel" id="lobbyPanel"></div>
  <div class="search-panel" id="searchPanel"></div>
  <div class="rogue-shop-panel" id="rogueShopPanel"></div>
  <div class="prompt" id="prompt">WASD 移动走位，附近有敌人会自动锁敌放技能。拾取战利品后前往蓝色传送阵撤离。</div>
  <div class="mobile-controls" id="mobileControls" aria-label="手机触控">
    <div class="move-pad" aria-label="移动">
      <button type="button" data-key="w" aria-label="向上">▲</button>
      <button type="button" data-key="a" aria-label="向左">◀</button>
      <button type="button" data-key="s" aria-label="向下">▼</button>
      <button type="button" data-key="d" aria-label="向右">▶</button>
    </div>
    <div class="action-pad" aria-label="动作">
      <button type="button" data-action="attack">剑</button>
      <button type="button" data-action="dash">闪</button>
      <button type="button" data-action="thunder">雷</button>
      <button type="button" data-action="bind">缚</button>
      <button type="button" data-action="search">搜</button>
      <button type="button" data-action="heal">丹</button>
    </div>
  </div>
  <div class="vignette" id="vignette"></div>
  <div class="result" id="result"><h1 id="resultTitle"></h1><p id="resultBody"></p><button id="closeResultBtn">回洞府</button></div>
`;
app.appendChild(hud);

const hpEl = document.querySelector<HTMLSpanElement>("#hp")!;
const spiritEl = document.querySelector<HTMLSpanElement>("#spirit")!;
const soloLevelEl = document.querySelector<HTMLSpanElement>("#soloLevel")!;
const valueEl = document.querySelector<HTMLSpanElement>("#value")!;
const timerEl = document.querySelector<HTMLSpanElement>("#timer")!;
const extractDistanceEl = document.querySelector<HTMLSpanElement>("#extractDistance")!;
const extractEl = document.querySelector<HTMLSpanElement>("#extract")!;
const inventoryPanelEl = document.querySelector<HTMLDivElement>(".inventory")!;
const lootListEl = document.querySelector<HTMLDivElement>("#lootList")!;
const promptEl = document.querySelector<HTMLDivElement>("#prompt")!;
const vignetteEl = document.querySelector<HTMLDivElement>("#vignette")!;
const resultEl = document.querySelector<HTMLDivElement>("#result")!;
const resultTitleEl = document.querySelector<HTMLHeadingElement>("#resultTitle")!;
const resultBodyEl = document.querySelector<HTMLParagraphElement>("#resultBody")!;
const closeResultBtn = document.querySelector<HTMLButtonElement>("#closeResultBtn")!;
const lobbyPanelEl = document.querySelector<HTMLDivElement>("#lobbyPanel")!;
const searchPanelEl = document.querySelector<HTMLDivElement>("#searchPanel")!;
const rogueShopPanelEl = document.querySelector<HTMLDivElement>("#rogueShopPanel")!;
const mobileControlsEl = document.querySelector<HTMLDivElement>("#mobileControls")!;
closeResultBtn.onclick = () => {
  resultEl.classList.remove("visible");
  renderLobby();
};
closeResultBtn.onpointerdown = (event) => {
  event.preventDefault();
  event.stopPropagation();
  resultEl.classList.remove("visible");
  renderLobby();
};
for (const panel of [inventoryPanelEl, lobbyPanelEl, searchPanelEl, resultEl]) {
  panel.addEventListener("pointerdown", (event) => event.stopPropagation());
}
searchPanelEl.onclick = (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.searchAction !== "start") return;
  const node = nearestSearchNode();
  if (node) node.progress = Math.max(node.progress, 0.01);
};

function defaultLoadout(user: ProfileUser): Loadout {
  return user.profile.loadout;
}

function itemLabel(item?: { name: string; value: number; rarity?: string; durability?: number; refineLevel?: number }) {
  if (!item) return "空";
  const durability = item.durability === undefined ? "" : ` / 耐久 ${itemDurability(item)}`;
  const refine = Number(item.refineLevel ?? 0) > 0 ? ` +${Number(item.refineLevel)}` : "";
  return `${item.name}${refine} / ${item.value}${durability}`;
}

function itemDurability(item?: { durability?: number }) {
  return Math.max(0, Math.min(100, Number(item?.durability ?? 100)));
}

function durabilityFactor(item?: { durability?: number }) {
  return 0.35 + (itemDurability(item) / 100) * 0.65;
}

function scaledStat(item: ServerItem, stat: "attack" | "defense") {
  return Math.floor(Number(item.stats?.[stat] ?? 0) * durabilityFactor(item));
}

function repairCost(item: ServerItem) {
  const missing = Math.max(0, 100 - itemDurability(item));
  return missing > 0 ? Math.max(1, Math.ceil(missing * item.value * 0.04)) : 0;
}

function isGearItem(item: ServerItem) {
  return ["weapon", "robe", "ring", "talisman"].includes(item.slot) || item.kind === "armor";
}

function refineSand() {
  return Number(account?.profile.materials?.refine_sand ?? 0);
}

function salvageYield(item: ServerItem) {
  const rarityBonus: Record<string, number> = { common: 1, uncommon: 2, rare: 4, epic: 7 };
  return Math.max(1, (rarityBonus[item.rarity] ?? 1) + Math.floor(item.value / 80));
}

function refineCost(item: ServerItem) {
  const level = Math.max(0, Math.floor(Number(item.refineLevel ?? 0)));
  return {
    nextLevel: level + 1,
    materialCost: 2 + level * 2,
    silverCost: Math.max(10, Math.ceil(item.value * (0.18 + level * 0.08))),
  };
}

function resetRogueBuild() {
  rogueBuild = { gear: {}, arts: [] };
}

function equippedRogueChoices() {
  return [...Object.values(rogueBuild.gear).filter((item): item is RogueChoice => Boolean(item)), ...rogueBuild.arts];
}

function rogueTagCounts() {
  const counts = new Map<RogueTag, number>();
  for (const choice of equippedRogueChoices()) {
    for (const tag of choice.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}

function addModifier(target: Required<RogueModifier>, mod: RogueModifier) {
  target.attack += mod.attack ?? 0;
  target.defense += mod.defense ?? 0;
  target.maxHp += mod.maxHp ?? 0;
  target.regen += mod.regen ?? 0;
  target.swordDamage += mod.swordDamage ?? 0;
  target.thunderDamage += mod.thunderDamage ?? 0;
  target.bindingDamage += mod.bindingDamage ?? 0;
  target.cooldownScale *= mod.cooldownScale ?? 1;
  target.searchSpeedBonus += mod.searchSpeedBonus ?? 0;
  target.lifesteal += mod.lifesteal ?? 0;
}

function rogueStats() {
  const stats: Required<RogueModifier> = {
    attack: 0,
    defense: 0,
    maxHp: 0,
    regen: 0,
    swordDamage: 0,
    thunderDamage: 0,
    bindingDamage: 0,
    cooldownScale: 1,
    searchSpeedBonus: 0,
    lifesteal: 0,
  };
  for (const choice of equippedRogueChoices()) addModifier(stats, choice.mod);
  const counts = rogueTagCounts();
  if ((counts.get("剑") ?? 0) >= 2) addModifier(stats, { attack: 4, swordDamage: 10 });
  if ((counts.get("刀") ?? 0) >= 2) addModifier(stats, { attack: 8, cooldownScale: 0.94 });
  if ((counts.get("仙") ?? 0) >= 2) addModifier(stats, { regen: 0.55, maxHp: 10 });
  if ((counts.get("魔") ?? 0) >= 2) addModifier(stats, { attack: 12, defense: -1 });
  if ((counts.get("妖") ?? 0) >= 2) addModifier(stats, { maxHp: 24, lifesteal: 0.04 });
  if ((counts.get("体") ?? 0) >= 2) addModifier(stats, { defense: 5, maxHp: 30 });
  if ((counts.get("雷") ?? 0) >= 2) addModifier(stats, { thunderDamage: 14, cooldownScale: 0.9 });
  if ((counts.get("阵") ?? 0) >= 2) addModifier(stats, { bindingDamage: 12, defense: 2 });
  if ((counts.get("木") ?? 0) >= 2) addModifier(stats, { regen: 0.45, searchSpeedBonus: 0.12 });
  return stats;
}

function maxPlayerHp() {
  return 100 + (isSoloRaid() ? Math.max(0, Math.floor(rogueStats().maxHp)) : 0);
}

function rogueSynergyText() {
  const counts = Array.from(rogueTagCounts().entries()).sort((a, b) => b[1] - a[1]);
  return counts.length
    ? counts.map(([tag, count]) => `${tag}${count}${count >= 2 ? `·${ROGUE_TAG_HINT[tag]}` : ""}`).join(" / ")
    : "尚未成型";
}

function rogueLootLabel(item: LootItem) {
  if (!item.rogue) return "";
  const tags = item.rogue.tags.join("");
  return `${item.rogue.type === "art" ? "功法" : ROGUE_SLOT_LABEL[item.rogue.slot ?? "trinket"]} [${tags}]`;
}

function rollRogueChoice(): RogueChoice {
  const waveBias = Math.min(0.28, soloWave * 0.025);
  const epicChance = 0.04 + waveBias * 0.45;
  const rareChance = 0.22 + waveBias;
  const roll = Math.random();
  const rarity: LootItem["rarity"] = roll < epicChance ? "epic" : roll < rareChance ? "rare" : roll < 0.72 ? "uncommon" : "common";
  const candidates = ROGUE_CHOICES.filter((choice) => choice.rarity === rarity);
  const pool = candidates.length ? candidates : ROGUE_CHOICES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollRogueLoot(): LootItem {
  const choice = rollRogueChoice();
  return rogueChoiceToLoot(choice);
}

function rogueChoiceToLoot(choice: RogueChoice): LootItem {
  return {
    id: nextLootId++,
    itemId: choice.id,
    name: choice.name,
    kind: choice.type === "art" ? "功法玉简" : choice.slot === "robe" ? "道袍" : "法器",
    value: choice.value,
    rarity: choice.rarity,
    equipSlot: choice.slot === "main" ? "weapon" : choice.slot === "robe" ? "robe" : undefined,
    stats: { attack: choice.mod.attack ?? choice.mod.swordDamage ?? choice.mod.thunderDamage ?? 0, defense: choice.mod.defense ?? 0 },
    rogue: choice,
  };
}

function resetSoloProgression() {
  soloLevel = 1;
  soloExp = 0;
  soloExpToNext = 24;
  rogueShopOpen = false;
  rogueShopChoices = [];
  rogueShopPanelEl.classList.remove("visible");
  rogueShopPanelEl.innerHTML = "";
}

function soloSpiritStoneBalance() {
  return spiritStoneLoot.reduce((sum, item) => sum + item.value, 0);
}

function spendSoloSpiritStones(cost: number) {
  let remaining = cost;
  for (let i = spiritStoneLoot.length - 1; i >= 0 && remaining > 0; i--) {
    const item = spiritStoneLoot[i];
    if (item.value <= remaining) {
      remaining -= item.value;
      spiritStoneLoot.splice(i, 1);
    } else {
      item.value -= remaining;
      item.name = `${item.value} 灵石`;
      remaining = 0;
    }
  }
  return remaining <= 0;
}

function addSoloExperience(amount: number, position?: THREE.Vector3) {
  if (!isSoloRaid()) return;
  soloExp += amount;
  addFloatingText(`经验 +${amount}`, position ?? player.position, "#ffd166");
  while (soloExp >= soloExpToNext) {
    soloExp -= soloExpToNext;
    soloLevel += 1;
    soloExpToNext = Math.floor(24 + soloLevel * 14 + soloLevel * soloLevel * 2);
    openRogueShop();
  }
}

function openRogueShop() {
  rogueShopOpen = true;
  const seen = new Set<string>();
  rogueShopChoices = [];
  while (rogueShopChoices.length < 3 && seen.size < ROGUE_CHOICES.length) {
    const choice = rollRogueChoice();
    if (seen.has(choice.id)) continue;
    seen.add(choice.id);
    rogueShopChoices.push(choice);
  }
  addEffect(createPickupBeam(player.position, 0xffd166));
  addFloatingText(`境界提升 ${soloLevel}`, player.position, "#ffd166");
  renderRogueShop();
}

function rogueShopCost(choice: RogueChoice) {
  const rarityCost = { common: 35, uncommon: 55, rare: 85, epic: 125 }[choice.rarity] ?? 60;
  return Math.max(20, Math.floor(rarityCost + soloLevel * 10 + choice.value * 0.22));
}

function applyRogueChoice(choice: RogueChoice) {
  if (choice.type === "equipment" && choice.slot) {
    rogueBuild.gear[choice.slot] = choice;
    if (choice.slot === "main" || choice.slot === "robe") {
      applyGearAppearance(player, {
        weapon: rogueBuild.gear.main?.id,
        robe: rogueBuild.gear.robe?.id,
      });
    }
  } else {
    if (rogueBuild.arts.length >= 6) rogueBuild.arts.shift();
    rogueBuild.arts.push(choice);
  }
  playerHp = Math.min(maxPlayerHp(), playerHp + 12);
  addEffect(createPickupBeam(player.position, choice.rarity === "epic" ? 0xffd166 : 0x9de8ff));
  addFloatingText(choice.type === "art" ? `研习 ${choice.name}` : `装备 ${choice.name}`, player.position, choice.type === "art" ? "#ffd166" : "#bfffd0");
  inventoryPanelHtml = "";
}

function buyRogueShopChoice(index: number) {
  const choice = rogueShopChoices[index];
  if (!choice) return;
  const cost = rogueShopCost(choice);
  if (soloSpiritStoneBalance() < cost) {
    addFloatingText("灵石不足", player.position, "#ffb4b4");
    return;
  }
  spendSoloSpiritStones(cost);
  applyRogueChoice(choice);
  rogueShopOpen = false;
  rogueShopChoices = [];
  renderRogueShop();
}

function skipRogueShop() {
  rogueShopOpen = false;
  rogueShopChoices = [];
  renderRogueShop();
}

function renderRogueShop() {
  if (!rogueShopOpen) {
    rogueShopPanelEl.classList.remove("visible");
    rogueShopPanelEl.innerHTML = "";
    return;
  }
  const balance = soloSpiritStoneBalance();
  rogueShopPanelEl.classList.add("visible");
  rogueShopPanelEl.innerHTML = `
    <h2>悟道商店</h2>
    <p>境界 ${soloLevel} / 灵石 ${balance}</p>
    <div class="rogue-shop-grid">
      ${rogueShopChoices
        .map((choice, index) => {
          const cost = rogueShopCost(choice);
          return `
        <button class="rogue-shop-card ${rarityClass(choice.rarity)}" data-rogue-shop="${index}" ${balance >= cost ? "" : "disabled"}>
          <strong>${choice.name}</strong>
          <span>${choice.type === "art" ? "功法" : ROGUE_SLOT_LABEL[choice.slot ?? "trinket"]} [${choice.tags.join("")}]</span>
          <small>${choice.description}</small>
          <em>${cost} 灵石</em>
        </button>`;
        })
        .join("")}
    </div>
    <button class="rogue-shop-skip" data-rogue-shop-skip="1">暂不购买</button>
  `;
  rogueShopPanelEl.querySelectorAll<HTMLButtonElement>("[data-rogue-shop]").forEach((button) => {
    button.onclick = () => buyRogueShopChoice(Number(button.dataset.rogueShop));
  });
  rogueShopPanelEl.querySelector<HTMLButtonElement>("[data-rogue-shop-skip]")!.onclick = () => skipRogueShop();
}

function rarityClass(rarity?: string) {
  return `rarity-${rarity ?? "common"}`;
}

function isSpiritStoneLoot(item: { kind?: string }) {
  return item.kind === "灵石";
}

function spiritStoneValue() {
  return spiritStoneLoot.reduce((sum, item) => sum + item.value, 0);
}

function carriedLootValue() {
  return inventory.reduce((sum, item) => sum + item.value, 0);
}

function hasCarriedSettlementLoot() {
  return inventory.length + spiritStoneLoot.length > 0;
}

function makeLocalInstance(itemId: string, name: string, kind: string, slot: string, rarity: string, value: number, stats: Record<string, number> = {}): ServerItem {
  return {
    instanceId: crypto.randomUUID(),
    itemId,
    name,
    kind,
    slot,
    rarity,
    value,
    stats,
    durability: 100,
  };
}

function makeSoloAccount(): ProfileUser {
  const weapon = makeLocalInstance("wood_sword", "青竹飞剑", "weapon", "weapon", "common", 10, { attack: 4 });
  const robe = makeLocalInstance("cloth_robe", "灰麻法袍", "armor", "robe", "common", 8, { defense: 2 });
  const pill = makeLocalInstance("spring_pill", "回春丹", "consumable", "consumable", "common", 15, { heal: 25 });
  return {
    userId: "solo_player",
    username: "单机修士",
    profile: {
      name: "单机修士",
      realm: "炼气一层",
      silver: 0,
      stash: [weapon, robe, pill],
      skills: [
        { skillId: "sword_qi", name: "青元剑芒", type: "active", power: 34 },
        { skillId: "dash", name: "流云步", type: "active", power: 0 },
        { skillId: "thunder_seal", name: "掌心雷", type: "active", power: 46 },
        { skillId: "binding_array", name: "小五行困阵", type: "active", power: 18 },
        { skillId: "body_forging", name: "铁骨诀", type: "passive", power: 1 },
        { skillId: "spirit_sense", name: "神识探查", type: "passive", power: 1 },
      ],
      loadout: {
        gear: { weapon: weapon.instanceId, robe: robe.instanceId },
        skills: ["sword_qi", "dash", "thunder_seal", "binding_array", "body_forging", "spirit_sense"],
        consumables: [pill.instanceId],
      },
      materials: { refine_sand: 0 },
    },
  };
}

function makeSoloRaid(): Raid {
  return {
    raidId: `solo_${crypto.randomUUID()}`,
    status: "active",
    mapId: "solo_roguelite_trial",
    carryValue: 33,
    loadoutSnapshot: account?.profile.loadout,
    runes: [],
  };
}

function isSoloRaid() {
  return gameMode === "solo";
}

function riskTier(value: number) {
  if (value < 40) return "寒门";
  if (value < 120) return "轻装";
  if (value < 260) return "标准";
  if (value < 520) return "重装";
  return "豪装";
}

function authTitle() {
  return authMode === "login" ? "登录洞府" : "注册新号";
}

function authSubmitLabel() {
  if (authPending) return authMode === "login" ? "登录中..." : "注册中...";
  return authMode === "login" ? "登录" : "注册";
}

function authHint() {
  return authMode === "login" ? "输入账号密码，回到你的洞府。" : "账号支持中文、字母、数字和下划线；密码 4-32 位。";
}

function readAuthInputs() {
  const username = document.querySelector<HTMLInputElement>("#usernameInput")?.value.trim() ?? "";
  const password = document.querySelector<HTMLInputElement>("#passwordInput")?.value ?? "";
  const confirm = document.querySelector<HTMLInputElement>("#passwordConfirmInput")?.value ?? "";
  return { username, password, confirm };
}

function setAuthMode(mode: "login" | "register") {
  authMode = mode;
  lobbyMessage = mode === "login" ? "请登录后配置装备与技能，再进入秘境。" : "注册后会获得青竹飞剑、灰麻法袍和基础功法。";
  renderLobby();
}

async function refreshShop() {
  if (!account) {
    shopOffers = [];
    return;
  }
  try {
    shopOffers = await shop();
  } catch {
    shopOffers = [];
  }
}

function renderLobby() {
  if (activeRaid) {
    lobbyPanelEl.classList.remove("visible");
    return;
  }
  lobbyPanelEl.classList.add("visible");
  if (!account) {
    lobbyPanelEl.innerHTML = `
      <div class="auth-card">
        <h1>仙途劫境</h1>
        <div class="auth-tabs">
          <button type="button" id="showLoginBtn" class="${authMode === "login" ? "active" : ""}">登录</button>
          <button type="button" id="showRegisterBtn" class="${authMode === "register" ? "active" : ""}">注册</button>
        </div>
        <form id="authForm" class="auth-form">
          <h2>${authTitle()}</h2>
          <p class="auth-message">${lobbyMessage}</p>
          <small>${authHint()}</small>
          <div class="field-row">
            <label for="usernameInput">账号</label>
            <input id="usernameInput" name="username" placeholder="例如：散修001" maxlength="18" autocomplete="username" ${authPending ? "disabled" : ""} />
          </div>
          <div class="field-row">
            <label for="passwordInput">密码</label>
            <input id="passwordInput" name="password" placeholder="输入密码" type="password" maxlength="32" autocomplete="${authMode === "login" ? "current-password" : "new-password"}" ${authPending ? "disabled" : ""} />
          </div>
          ${
            authMode === "register"
              ? `<div class="field-row">
            <label for="passwordConfirmInput">确认密码</label>
            <input id="passwordConfirmInput" name="passwordConfirm" placeholder="再输入一次密码" type="password" maxlength="32" autocomplete="new-password" ${authPending ? "disabled" : ""} />
          </div>`
              : ""
          }
          <button id="authSubmitBtn" type="submit" ${authPending ? "disabled" : ""}>${authSubmitLabel()}</button>
        </form>
        <button id="soloGuestBtn" type="button">单机肉鸽试玩</button>
      </div>
    `;
    document.querySelector<HTMLButtonElement>("#showLoginBtn")!.onclick = () => setAuthMode("login");
    document.querySelector<HTMLButtonElement>("#showRegisterBtn")!.onclick = () => setAuthMode("register");
    document.querySelector<HTMLFormElement>("#authForm")!.onsubmit = (event) => {
      event.preventDefault();
      void submitAuth(authMode);
    };
    document.querySelector<HTMLButtonElement>("#soloGuestBtn")!.onclick = () => beginSoloRaid();
    document.querySelector<HTMLInputElement>("#usernameInput")?.focus();
    return;
  }

  const currentAccount = account;
  const loadout = defaultLoadout(currentAccount);
  const stash = currentAccount.profile.stash;
  const skills = currentAccount.profile.skills;
  const selectedWeapon = loadout.gear.weapon ?? "";
  const selectedRobe = loadout.gear.robe ?? "";
  const selectedConsumable = loadout.consumables?.[0] ?? "";
  const carryValue = stash
    .filter((item) => [selectedWeapon, selectedRobe, selectedConsumable].includes(item.instanceId))
    .reduce((sum, item) => sum + item.value, 0);
  const options = (slot: string, selected: string) =>
    [`<option value="">空</option>`]
      .concat(stash.filter((item) => item.slot === slot).map((item) => `<option value="${item.instanceId}" ${item.instanceId === selected ? "selected" : ""}>${item.name} (${item.value})</option>`))
      .join("");
  const anyOptions = (items: typeof stash, selected: string) =>
    [`<option value="">空</option>`]
      .concat(items.map((item) => `<option value="${item.instanceId}" ${item.instanceId === selected ? "selected" : ""}>${item.name} (${item.value})</option>`))
      .join("");
  const equippedWeapon = stash.find((item) => item.instanceId === selectedWeapon);
  const equippedRobe = stash.find((item) => item.instanceId === selectedRobe);
  const stashValue = stash.reduce((sum, item) => sum + item.value, 0);
  const configuredIds = new Set([selectedWeapon, selectedRobe, selectedConsumable].filter(Boolean));
  const sellableItems = stash.filter((item) => !configuredIds.has(item.instanceId));
  const repairableItems = stash.filter((item) => isGearItem(item) && repairCost(item) > 0);
  const salvageableItems = sellableItems;
  const refineableItems = sellableItems.filter((item) => isGearItem(item) && Number(item.refineLevel ?? 0) < 5);
  const materialCount = refineSand();
  const grouped = {
    "装备": stash.filter((item) => ["weapon", "robe", "ring", "talisman"].includes(item.slot)),
    "消耗": stash.filter((item) => item.kind === "consumable"),
    "功法": stash.filter((item) => item.kind === "skill_book"),
    "秘宝": stash.filter((item) => !["weapon", "armor", "consumable", "skill_book"].includes(item.kind)),
  };
  lobbyPanelEl.innerHTML = `
    <h1>洞府整备</h1>
    <p>${currentAccount.profile.realm} / 灵石 ${currentAccount.profile.silver} / 仓库估值 ${stashValue}</p>
    <div class="mode-card rogue-mode-card">
      <div>
        <strong>单机肉鸽</strong>
        <span>不带出征装备，进局靠掉落法器和功法成型。剑、刀、仙、魔、妖、体、雷、阵、木会互相共鸣。</span>
      </div>
      <button id="soloRaidBtn">开始试炼</button>
    </div>
    <div class="mode-card online-mode-card">
      <div>
        <strong>联网搜打撤备战</strong>
        <span>这里的装备、丹药和技能只影响联网搜打撤。当前风险 ${riskTier(carryValue)}。</span>
      </div>
    </div>
    <div class="gear-preview">
      <div><b>武器</b><span>${itemLabel(equippedWeapon)}</span></div>
      <div><b>道袍</b><span>${itemLabel(equippedRobe)}</span></div>
      <div><b>携带</b><span>${carryValue}</span></div>
    </div>
    <label>武器<select id="weaponSelect">${options("weapon", selectedWeapon)}</select></label>
    <label>道袍<select id="robeSelect">${options("robe", selectedRobe)}</select></label>
    <label>丹药/符箓<select id="consumableSelect">${anyOptions(stash.filter((item) => item.kind === "consumable"), selectedConsumable)}</select></label>
    <div class="skill-grid">
      ${skills
        .map(
          (skill) => `
          <label class="check-row">
            <input type="checkbox" data-skill="${skill.skillId}" ${loadout.skills.includes(skill.skillId) ? "checked" : ""} />
            <span>${skill.name}</span>
          </label>
        `,
        )
        .join("")}
    </div>
    <div class="stash-sections">
      ${Object.entries(grouped)
        .map(
          ([name, items]) => `
          <section>
            <h2>${name}</h2>
            <div class="stash-list">
              ${items.length ? items.slice(0, 10).map((item) => `<span class="${rarityClass(item.rarity)}">${item.name}${Number(item.refineLevel ?? 0) > 0 ? ` +${item.refineLevel}` : ""}<small>${item.value}${isGearItem(item) ? ` / 耐 ${itemDurability(item)}` : ""}</small></span>`).join("") : "<em>暂无</em>"}
            </div>
          </section>
        `,
        )
        .join("")}
    </div>
    <div class="shop-board">
      <h2>坊市 / 炼器砂 ${materialCount}</h2>
      <div class="shop-grid">
        <section>
          <strong>补给</strong>
          ${
            shopOffers.length
              ? shopOffers
                  .map(
                    (offer) => `
              <div class="shop-row">
                <span>${offer.item.name}<small>${offer.price} 灵石</small></span>
                <button data-buy-sku="${offer.sku}" ${currentAccount.profile.silver >= offer.price ? "" : "disabled"}>买</button>
              </div>
            `,
                  )
                  .join("")
              : `<em>暂无商品</em>`
          }
        </section>
        <section>
          <strong>回收</strong>
          ${
            sellableItems.length
              ? sellableItems
                  .slice(0, 8)
                  .map(
                    (item) => `
              <div class="shop-row">
                <span>${item.name}<small>回收 ${Math.max(1, Math.floor(item.value * 0.5))}</small></span>
                <button data-sell-item="${item.instanceId}">卖</button>
              </div>
            `,
                  )
                  .join("")
              : `<em>无可出售物</em>`
          }
        </section>
        <section>
          <strong>修理</strong>
          ${
            repairableItems.length
              ? repairableItems
                  .slice(0, 8)
                  .map(
                    (item) => `
              <div class="shop-row">
                <span>${item.name}<small>耐久 ${itemDurability(item)} / 修 ${repairCost(item)}</small></span>
                <button data-repair-item="${item.instanceId}" ${currentAccount.profile.silver >= repairCost(item) ? "" : "disabled"}>修</button>
              </div>
            `,
                  )
                  .join("")
              : `<em>无需修理</em>`
          }
        </section>
        <section>
          <strong>分解</strong>
          ${
            salvageableItems.length
              ? salvageableItems
                  .slice(0, 8)
                  .map(
                    (item) => `
              <div class="shop-row">
                <span>${item.name}<small>得 ${salvageYield(item)} 砂</small></span>
                <button data-salvage-item="${item.instanceId}">解</button>
              </div>
            `,
                  )
                  .join("")
              : `<em>无可分解物</em>`
          }
        </section>
        <section>
          <strong>强化</strong>
          ${
            refineableItems.length
              ? refineableItems
                  .slice(0, 8)
                  .map((item) => {
                    const cost = refineCost(item);
                    const canRefine = materialCount >= cost.materialCost && currentAccount.profile.silver >= cost.silverCost;
                    return `
              <div class="shop-row">
                <span>${item.name}+${Number(item.refineLevel ?? 0)}<small>${cost.materialCost} 砂 / ${cost.silverCost} 灵石</small></span>
                <button data-refine-item="${item.instanceId}" ${canRefine ? "" : "disabled"}>炼</button>
              </div>
            `;
                  })
                  .join("")
              : `<em>无可强化装备</em>`
          }
        </section>
      </div>
    </div>
    ${
      lastSettlement
        ? `<div class="settlement-chip ${lastSettlement.success ? "success" : "failed"}">${lastSettlement.success ? "上局撤离成功" : "上局秘境失守"} / 带出 ${lastSettlement.gained.length + lastSettlement.kept.length} / 遗失 ${lastSettlement.lost.length}</div>`
        : ""
    }
    <p>${lobbyMessage}</p>
    <div class="button-row">
      ${resumableRaid ? `<button id="resumeRaidBtn">继续秘境</button>` : ""}
      <button id="saveLoadoutBtn">保存配置</button>
      <button id="startRaidBtn">联网搜打撤</button>
      <button id="logoutBtn">退出</button>
    </div>
  `;
  document.querySelector<HTMLButtonElement>("#saveLoadoutBtn")!.onclick = () => void submitLoadout(false);
  document.querySelector<HTMLButtonElement>("#resumeRaidBtn")?.addEventListener("click", () => void resumeRaid());
  document.querySelector<HTMLButtonElement>("#soloRaidBtn")!.onclick = () => beginSoloRaid();
  document.querySelector<HTMLButtonElement>("#startRaidBtn")!.onclick = () => void beginRaid();
  document.querySelectorAll<HTMLButtonElement>("[data-buy-sku]").forEach((button) => {
    button.onclick = () => void submitShopBuy(button.dataset.buySku ?? "");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-sell-item]").forEach((button) => {
    button.onclick = () => void submitShopSell(button.dataset.sellItem ?? "");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-repair-item]").forEach((button) => {
    button.onclick = () => void submitRepair(button.dataset.repairItem ?? "");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-salvage-item]").forEach((button) => {
    button.onclick = () => void submitSalvage(button.dataset.salvageItem ?? "");
  });
  document.querySelectorAll<HTMLButtonElement>("[data-refine-item]").forEach((button) => {
    button.onclick = () => void submitRefine(button.dataset.refineItem ?? "");
  });
  document.querySelector<HTMLButtonElement>("#logoutBtn")!.onclick = () => {
    closeRaidSocket();
    void submitLogout();
  };
}

async function submitAuth(mode: "login" | "register") {
  if (authPending) return;
  const { username, password, confirm } = readAuthInputs();
  if (mode === "register" && password !== confirm) {
    lobbyMessage = "两次输入的密码不一致。";
    renderLobby();
    return;
  }
  authPending = true;
  lobbyMessage = mode === "login" ? "正在登录洞府..." : "正在开辟洞府...";
  renderLobby();
  try {
    account = mode === "login" ? await login(username, password) : await register(username, password);
    await refreshShop();
    resumableRaid = await activeRaidStatus();
    lobbyMessage = mode === "login" ? "登录成功，选择装备与技能，准备进入秘境。" : "注册成功，基础法宝和功法已入库。";
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "请求失败";
  } finally {
    authPending = false;
  }
  renderLobby();
}

async function submitLogout() {
  try {
    await logout();
  } catch {
    clearToken();
  }
  account = null;
  activeRaid = null;
  resumableRaid = null;
  shopOffers = [];
  authMode = "login";
  lobbyMessage = "已退出。";
  renderLobby();
}

async function submitShopBuy(sku: string) {
  if (!sku) return;
  try {
    const result = await buyShopItem(sku);
    account = result.user;
    shopOffers = result.shop;
    lobbyMessage = `已购入 ${result.item.name}，剩余 ${result.silver} 灵石。`;
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "购买失败";
  }
  renderLobby();
}

async function submitShopSell(instanceId: string) {
  if (!instanceId) return;
  try {
    const result = await sellStashItem(instanceId);
    account = result.user;
    shopOffers = result.shop;
    lobbyMessage = `已出售 ${result.soldItem.name}，获得 ${result.silverGained} 灵石。`;
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "出售失败";
  }
  renderLobby();
}

async function submitRepair(instanceId: string) {
  if (!instanceId) return;
  try {
    const result = await repairStashItem(instanceId);
    account = result.user;
    shopOffers = result.shop;
    lobbyMessage = `已修理 ${result.item.name}，花费 ${result.cost} 灵石。`;
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "修理失败";
  }
  renderLobby();
}

async function submitSalvage(instanceId: string) {
  if (!instanceId) return;
  try {
    const result = await salvageStashItem(instanceId);
    account = result.user;
    shopOffers = result.shop;
    lobbyMessage = `已分解 ${result.salvagedItem.name}，获得 ${result.materialGained} 炼器砂。`;
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "分解失败";
  }
  renderLobby();
}

async function submitRefine(instanceId: string) {
  if (!instanceId) return;
  try {
    const result = await refineStashItem(instanceId);
    account = result.user;
    shopOffers = result.shop;
    lobbyMessage = `${result.item.name} 强化至 +${result.item.refineLevel ?? result.cost.nextLevel}。`;
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "强化失败";
  }
  renderLobby();
}

function readLoadoutFromUi(): Loadout {
  if (!account) throw new Error("未登录");
  const skillIds = Array.from(document.querySelectorAll<HTMLInputElement>("[data-skill]"))
    .filter((input) => input.checked)
    .map((input) => input.dataset.skill!)
    .slice(0, 4);
  return {
    ...account.profile.loadout,
    gear: {
      ...account.profile.loadout.gear,
      weapon: document.querySelector<HTMLSelectElement>("#weaponSelect")?.value || null,
      robe: document.querySelector<HTMLSelectElement>("#robeSelect")?.value || null,
    },
    skills: skillIds,
    consumables: [document.querySelector<HTMLSelectElement>("#consumableSelect")?.value].filter((id): id is string => Boolean(id)),
  };
}

function equippedStats() {
  if (isSoloRaid()) {
    const stats = rogueStats();
    return {
      attack: Math.floor(stats.attack),
      defense: Math.floor(stats.defense),
    };
  }
  const loadout = account?.profile.loadout;
  const stash = account?.profile.stash ?? [];
  const equipped = Object.values(loadout?.gear ?? {})
    .filter(Boolean)
    .map((id) => stash.find((item) => item.instanceId === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const baseStats = equipped.reduce(
    (stats, item) => ({
      attack: stats.attack + scaledStat(item, "attack"),
      defense: stats.defense + scaledStat(item, "defense"),
    }),
    { attack: 0, defense: 0 },
  );
  const raidItems = Object.values(raidGear)
    .map((id) => inventory.find((item) => item.id === id))
    .filter((item): item is LootItem => Boolean(item));
  return raidItems.reduce(
    (stats, item) => ({
      attack: stats.attack + (item.stats?.attack ?? 0),
      defense: stats.defense + (item.stats?.defense ?? 0),
    }),
    baseStats,
  );
}

function clearRaidEntities() {
  for (const enemy of enemies.splice(0)) {
    scene.remove(enemy.mesh);
    scene.remove(enemy.hpBar);
  }
  for (const rival of rivals.splice(0)) {
    scene.remove(rival.mesh);
    scene.remove(rival.hpBar);
  }
  clearRemotePlayers();
  for (const drop of lootDrops.splice(0)) {
    scene.remove(drop.mesh);
    scene.remove(drop.beacon);
  }
  for (const node of searchNodes.splice(0)) {
    scene.remove(node.mesh);
  }
  for (const effect of effects.splice(0)) {
    scene.remove(effect.object);
  }
  for (const sword of qingyuanSwords.splice(0)) {
    scene.remove(sword.mesh);
  }
  for (const text of floatingTexts.splice(0)) {
    text.remove();
  }
}

function populateRaidEntities() {
  const spawns = activeRaid?.entitySpawns;
  if (spawns) {
    spawns.enemies.forEach((enemy) => {
      if (enemy.dead) return;
      spawnEnemy(enemy.x, enemy.z, enemy.elite, enemy.sourceId, enemy.currentHp, enemy.maxHp);
    });
    spawns.rivals.forEach((rival) => {
      if (rival.dead) return;
      spawnRival(rival.x, rival.z, rival.index, rival.currentHp, rival.maxHp, {
        state: rival.aiState ?? undefined,
        goalX: rival.goalX ?? undefined,
        goalZ: rival.goalZ ?? undefined,
        extractProgress: rival.extractProgress ?? undefined,
        lootBag: rival.lootBag ?? undefined,
      });
    });
  } else {
    const enemyCount = isSoloRaid() ? 16 : 12;
    for (let i = 0; i < enemyCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 14 + Math.random() * 18;
      spawnEnemy(player.position.x + Math.cos(angle) * radius, player.position.z + Math.sin(angle) * radius, i % 5 === 0, `enemy_${i + 1}`);
    }

    if (!isSoloRaid()) {
      [
        [-4, 18],
        [14, 7],
        [-20, -13],
      ].forEach(([x, z], index) => spawnRival(x, z, index));
    }
  }

  const looseLoot = activeRaid?.looseLoot ?? null;
  if (looseLoot) {
    looseLoot.forEach((drop) => {
      if (drop.claimToken) usedRaidLootTokens.add(drop.claimToken);
      spawnLoot(new THREE.Vector3(Number(drop.x ?? 0), 0, Number(drop.z ?? 0)), raidDropToLootItem(drop), false);
    });
  } else {
    for (let i = 0; i < 9; i++) {
      const loot = rollLoot("ground");
      const pos = loot.sourcePosition ? new THREE.Vector3(loot.sourcePosition.x, 0, loot.sourcePosition.z) : new THREE.Vector3(Math.random() * 46 - 23, 0, Math.random() * 42 - 21);
      spawnLoot(pos, loot);
    }
  }

  SEARCH_NODE_SPAWNS.forEach(([kind, x, z]) => spawnSearchNode(kind, x, z));
  activeRaid?.searchClaims?.forEach((sourceId) => markSearchNodeCompleted(sourceId, false));
}

function hasSkill(skillId: string) {
  if (isSoloRaid()) return SOLO_SKILL_IDS.includes(skillId);
  return Boolean(account?.profile.loadout.skills.includes(skillId));
}

function hasRune(runeId: RaidRuneId) {
  return raidRunes.includes(runeId);
}

function runeDamageBonus(attackKind: string) {
  return raidRunes.reduce((sum, runeId) => {
    const rune = RUNE_CONFIG[runeId];
    return rune.attackKind === attackKind ? sum + (rune.damageBonus ?? 0) : sum;
  }, 0);
}

async function maybeClaimRune(node: SearchNode) {
  if (!activeRaid || Math.random() > (node.kind === "sealed_chest" ? 0.95 : 0.45)) return;
  const available = (Object.keys(RUNE_CONFIG) as RaidRuneId[]).filter((runeId) => !raidRunes.includes(runeId));
  if (!available.length) return;
  const runeId = available[Math.floor(Math.random() * available.length)];
  const rune = RUNE_CONFIG[runeId];
  if (!isSoloRaid()) {
    try {
      await reportRaidEvent(activeRaid.raidId, "rune_claimed", { runeId, runeName: rune.name, nodeKind: node.kind, sourceId: searchNodeSourceId(node), playerX: player.position.x, playerZ: player.position.z });
    } catch (error) {
      addFloatingText(error instanceof Error ? error.message : "符文失效", node.mesh.position, "#ffcf91");
      return;
    }
  }
  raidRunes.push(runeId);
  addEffect(createPickupBeam(node.mesh.position, runeId === "thunder_focus" ? 0x9de8ff : 0xffd166));
  addFloatingText(`符文 ${rune.name}`, node.mesh.position, "#ffd166");
}

function createEnemyHpBar() {
  const bar = new THREE.Group();
  bar.name = "EnemyHpBar";
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x24090d, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
  );
  back.name = "hp_back";
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xff6b7b, transparent: true, opacity: 0.94, side: THREE.DoubleSide }),
  );
  fill.name = "hp_fill";
  fill.position.z = 0.01;
  bar.add(back, fill);
  bar.visible = false;
  scene.add(bar);
  return bar;
}

async function submitLoadout(quiet: boolean) {
  const result = await saveLoadout(readLoadoutFromUi());
  account = result.user;
  if (!quiet) lobbyMessage = `配置已保存，携带价值 ${result.carryValue}。`;
  renderLobby();
}

function resetRaidRuntime() {
  clearRaidEntities();
  resetRogueBuild();
  resetSoloProgression();
  const carriedLoot = (activeRaid?.carriedLoot ?? []).map(raidDropToLootItem);
  inventory = carriedLoot.filter((item) => !isSpiritStoneLoot(item));
  spiritStoneLoot = carriedLoot.filter(isSpiritStoneLoot);
  raidGear = {};
  applyGearAppearance(player, {});
  usedRaidLootTokens = new Set();
  spirit = 0;
  playerHp = Math.max(1, Math.min(100, Number(activeRaid?.playerState?.hp ?? 100)));
  attackCooldown = 0;
  dashCooldown = 0;
  thunderCooldown = 0;
  bindingCooldown = 0;
  runTime = Math.max(0, Math.min(RAID_DURATION, Number(activeRaid?.playerState?.runTime ?? 0)));
  extractionProgress = 0;
  gameOver = false;
  resultEl.classList.remove("visible");
  player.position.set(Number(activeRaid?.playerState?.x ?? -17), 0, Number(activeRaid?.playerState?.z ?? 13));
  lastSettlement = null;
  raidEventQueue = Promise.resolve();
  positionReportTimer = 0;
  extractionStartedReported = false;
  soloWaveTimer = 0;
  soloWave = 0;
  const restoredExtraction = activeRaid?.extractionState;
  if (restoredExtraction && player.position.distanceTo(extraction.position) < 2.7 && hasCarriedSettlementLoot()) {
    const startedAtMs = Date.parse(restoredExtraction.startedAt ?? "");
    const elapsedMs = Number.isFinite(startedAtMs) ? Date.now() - startedAtMs : performance.now() - Number(restoredExtraction.startedClientTime ?? 0);
    if (elapsedMs >= 0 && elapsedMs < 9000) {
      extractionProgress = Math.min(0.95, Math.max(0.05, elapsedMs / 3000));
      extractionStartedReported = true;
    }
  }
  raidRunes = ((activeRaid?.runes ?? []) as RaidRuneId[]).filter((runeId) => runeId in RUNE_CONFIG);
  raidConsumables = isSoloRaid()
    ? [makeLocalInstance("spring_pill", "回春丹", "consumable", "consumable", "common", 15, { heal: 25 })]
    : account?.profile.stash.filter((item) => activeRaid?.loadoutSnapshot?.consumables?.includes(item.instanceId)) ?? [];
  populateRaidEntities();
  reportPlayerPosition();
}

async function beginRaid() {
  try {
    gameMode = "online";
    await submitLoadout(true);
    const start = await startRaid();
    activeRaid = start.raid;
    resumableRaid = null;
    account = start.user;
    resetRaidRuntime();
    connectRaidSocket(activeRaid);
    renderer.domElement.focus();
    lobbyMessage = "秘境进行中。";
    promptEl.textContent = "秘境已开启。移动走位即可，附近有敌人会自动锁敌释放青元剑芒、掌心雷和小五行困阵。";
    renderLobby();
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "无法进入秘境";
    renderLobby();
  }
}

function beginSoloRaid() {
  try {
    gameMode = "solo";
    if (!account) account = makeSoloAccount();
    activeRaid = makeSoloRaid();
    resumableRaid = null;
    resetRaidRuntime();
    closeRaidSocket();
    renderer.domElement.focus();
    lobbyMessage = "单机肉鸽试炼进行中。击杀和搜索获得本局装备/功法，撑过三分钟。";
    promptEl.textContent = "单机肉鸽开启。拾取法器和功法后在乾坤袋里点装备或研习，凑出流派共鸣。";
    renderLobby();
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "无法开始单机肉鸽";
    renderLobby();
  }
}

async function resumeRaid() {
  try {
    gameMode = "online";
    activeRaid = await activeRaidStatus();
    if (!activeRaid) {
      resumableRaid = null;
      lobbyMessage = "没有可继续的秘境。";
      renderLobby();
      return;
    }
    resumableRaid = null;
    resetRaidRuntime();
    connectRaidSocket(activeRaid);
    renderer.domElement.focus();
    lobbyMessage = `继续秘境 ${activeRaid.matchId ?? activeRaid.raidId}`;
    promptEl.textContent = "已从服务端恢复未结算秘境。继续搜索、战斗或撤离。";
    renderLobby();
  } catch (error) {
    lobbyMessage = error instanceof Error ? error.message : "无法继续秘境";
    renderLobby();
  }
}

function spawnEnemy(x: number, z: number, elite = false, sourceId?: string, currentHp?: number, maxHpOverride?: number) {
  const mesh = createCorpsePuppet(elite);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const maxHp = Math.max(1, Number(maxHpOverride ?? (elite ? 90 : 42)));
  const hp = Math.max(1, Math.min(maxHp, Number(currentHp ?? maxHp)));
  enemies.push({ mesh, hpBar: createEnemyHpBar(), sourceId, hp, maxHp, speed: elite ? 2.0 : 2.35, hitCooldown: 0, flash: hp < maxHp ? 0.6 : 0, elite, alertTarget: null, alertTime: 0 });
}

function tintRival(mesh: THREE.Object3D, index: number) {
  const robeColors = [0x6f8fe8, 0xd08066, 0xa989dc];
  const glowColors = [0x9de8ff, 0xffb16e, 0xdcb8ff];
  mesh.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
    child.material = child.material.clone();
    if (child.name.includes("robe") || child.name.includes("sleeve")) {
      child.material.color.setHex(robeColors[index % robeColors.length]);
      child.material.emissive.setHex(0x111827);
      child.material.emissiveIntensity = 0.45;
    }
    if (child.name.includes("glow") || child.name.includes("blade")) {
      child.material.emissive.setHex(glowColors[index % glowColors.length]);
      child.material.emissiveIntensity = 1.35;
    }
  });
}

function tintRemotePlayer(mesh: THREE.Object3D) {
  mesh.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
    child.material = child.material.clone();
    child.material.transparent = true;
    child.material.opacity = 0.72;
    if (child.name.includes("robe") || child.name.includes("sleeve")) {
      child.material.color.setHex(0x78b7ff);
      child.material.emissive.setHex(0x123456);
      child.material.emissiveIntensity = 0.65;
    }
    if (child.name.includes("glow") || child.name.includes("blade")) {
      child.material.emissive.setHex(0x7cc7ff);
      child.material.emissiveIntensity = 1.7;
    }
  });
}

function gearColor(itemId: string | undefined, slot: "weapon" | "robe") {
  if (slot === "weapon") {
    if (itemId === "blackiron_sword") return { color: 0xcfd7e6, emissive: 0x9db8ff, intensity: 1.9 };
    if (itemId === "greenwood_artifact") return { color: 0xa8ffd0, emissive: 0x45ff8a, intensity: 1.55 };
    return { color: 0xddeecf, emissive: 0x45ff76, intensity: 1.15 };
  }
  if (itemId === "ironleaf_robe") return { color: 0x8fa1a0, emissive: 0x32494d, intensity: 0.85 };
  return { color: 0x73d790, emissive: 0x12321a, intensity: 0.35 };
}

function applyGearAppearance(mesh: THREE.Object3D, gear: GearAppearance = {}, remote = false) {
  const weapon = gearColor(gear.weapon, "weapon");
  const robe = gearColor(gear.robe, "robe");
  mesh.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
    if (child.name.includes("robe") || child.name.includes("sleeve")) {
      child.material.color.setHex(robe.color);
      child.material.emissive.setHex(robe.emissive);
      child.material.emissiveIntensity = robe.intensity + (remote ? 0.22 : 0);
    }
    if (child.name.includes("blade") || child.name.includes("glow")) {
      child.material.color.setHex(weapon.color);
      child.material.emissive.setHex(weapon.emissive);
      child.material.emissiveIntensity = weapon.intensity + (remote ? 0.35 : 0);
    }
  });
}

function currentRaidGearAppearance(): GearAppearance {
  const gear: GearAppearance = {};
  for (const slot of ["weapon", "robe"] as const) {
    const itemId = raidGear[slot];
    const item = inventory.find((entry) => entry.id === itemId);
    if (item?.itemId) gear[slot] = item.itemId;
  }
  return gear;
}

function messageGear(value: unknown): GearAppearance {
  if (!value || typeof value !== "object") return {};
  const gear = value as Record<string, unknown>;
  return {
    weapon: typeof gear.weapon === "string" ? gear.weapon : undefined,
    robe: typeof gear.robe === "string" ? gear.robe : undefined,
  };
}

function upsertRemotePlayer(peerId: string, username: string, x: number, z: number, hp = 100, maxHp = 100, down = false, userId = "", raidId = "", gear: GearAppearance = {}) {
  if (!peerId) return;
  let remote = remotePlayers.get(peerId);
  if (!remote) {
    const mesh = createSwordCultivator();
    tintRemotePlayer(mesh);
    applyGearAppearance(mesh, gear, true);
    mesh.scale.setScalar(0.88);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    remote = { peerId, userId, raidId, username, mesh, hpBar: createEnemyHpBar(), target: new THREE.Vector3(x, 0, z), hp, maxHp, flash: 0, down, lastSeen: clock.elapsedTime, gear };
    remotePlayers.set(peerId, remote);
    addFloatingText(`${username || "同道"} 进入秘境`, mesh.position, "#9de8ff");
  }
  remote.username = username || remote.username;
  remote.userId = userId || remote.userId;
  remote.raidId = raidId || remote.raidId;
  remote.target.set(x, 0, z);
  remote.hp = hp;
  remote.maxHp = maxHp;
  remote.down = down;
  const nextGear = gear ?? {};
  if (nextGear.weapon !== remote.gear.weapon || nextGear.robe !== remote.gear.robe) {
    remote.gear = { ...nextGear };
    applyGearAppearance(remote.mesh, remote.gear, true);
  }
  remote.lastSeen = clock.elapsedTime;
}

function removeRemotePlayer(peerId: string) {
  const remote = remotePlayers.get(peerId);
  if (!remote) return;
  addFloatingText(`${remote.username || "同道"} 离开`, remote.mesh.position, "#a8b8c8");
  scene.remove(remote.mesh);
  scene.remove(remote.hpBar);
  remotePlayers.delete(peerId);
}

function removeRemotePlayerByIdentity(userId: string, raidId: string, reason: "extracted" | "dead", username: string) {
  for (const remote of remotePlayers.values()) {
    if (remote.userId !== userId && remote.raidId !== raidId) continue;
    addFloatingText(reason === "extracted" ? `${username || remote.username || "同道"} 撤离` : `${username || remote.username || "同道"} 出局`, remote.mesh.position, reason === "extracted" ? "#9de8ff" : "#ffcf91");
    removeRemotePlayer(remote.peerId);
    return;
  }
}

function clearRemotePlayers() {
  for (const remote of remotePlayers.values()) {
    scene.remove(remote.mesh);
    scene.remove(remote.hpBar);
  }
  remotePlayers.clear();
}

function findEnemyBySourceId(sourceId: string) {
  return enemies.find((enemy) => enemy.sourceId === sourceId) ?? null;
}

function findRivalBySourceId(sourceId: string) {
  return rivals.find((rival) => rival.sourceId === sourceId) ?? null;
}

function removeEnemyBySourceId(sourceId: string, showEffect = true) {
  const index = enemies.findIndex((enemy) => enemy.sourceId === sourceId);
  if (index < 0) return false;
  const [enemy] = enemies.splice(index, 1);
  if (showEffect) {
    addEffect(createHitBurst(enemy.mesh.position, true));
    addFloatingText("已被击杀", enemy.mesh.position, "#ffd166");
  }
  scene.remove(enemy.mesh);
  scene.remove(enemy.hpBar);
  return true;
}

function removeRivalBySourceId(sourceId: string, showEffect = true) {
  const index = rivals.findIndex((rival) => rival.sourceId === sourceId);
  if (index < 0) return false;
  const [rival] = rivals.splice(index, 1);
  if (showEffect) {
    addEffect(createHitBurst(rival.mesh.position, true));
    addFloatingText(`${rival.name} 已倒下`, rival.mesh.position, "#ffd166");
  }
  scene.remove(rival.mesh);
  scene.remove(rival.hpBar);
  return true;
}

function rollRivalLoot(index: number): LootItem[] {
  const sourceId = `rival_${index + 1}`;
  const bag = [rollLoot("rival", sourceId), rollLoot("rival", sourceId)];
  if (index % 2 === 0) bag.push({ id: nextLootId++, itemId: "rival_loot_bag", name: "敌修乾坤袋", kind: "秘宝" as LootKind, value: 190, rarity: "rare" });
  return bag;
}

function randomRaidPoint() {
  return new THREE.Vector3(Math.random() * 58 - 29, 0, Math.random() * 52 - 26);
}

function bagValue(items: LootItem[]) {
  return items.reduce((sum, item) => sum + item.value, 0);
}

function canTakeLoot() {
  return inventory.length < BAG_SLOT_LIMIT;
}

function logRaidEvent(type: RaidEventType, payload: RaidEventPayload = {}) {
  if (!activeRaid) return;
  if (isSoloRaid()) return;
  const raidId = activeRaid.raidId;
  raidEventQueue = raidEventQueue.then(() => reportRaidEvent(raidId, type, payload).then(() => undefined)).catch(() => {
    // Event logs are useful for server authority, but should not interrupt prototype play.
  });
}

function closeRaidSocket() {
  clearRemotePlayers();
  localPeerId = "";
  if (!raidSocket) return;
  raidSocket.onclose = null;
  raidSocket.close();
  raidSocket = null;
}

function connectRaidSocket(raid: Raid) {
  closeRaidSocket();
  const token = encodeURIComponent(getToken());
  const raidId = encodeURIComponent(raid.raidId);
  raidSocket = new WebSocket(`ws://127.0.0.1:8787/ws/raid?token=${token}&raidId=${raidId}`);
  raidSocket.onopen = () => {
    addFloatingText("实时房间已连接", player.position, "#9de8ff");
  };
  raidSocket.onmessage = (event) => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.type === "room_joined") {
        localPeerId = String(message.peerId ?? "");
      }
      if (message.type === "room_snapshot" && Array.isArray(message.peers)) {
        for (const peer of message.peers) {
          const payload = peer.payload ?? {};
          const x = Number(payload.playerX);
          const z = Number(payload.playerZ);
          if (Number.isFinite(x) && Number.isFinite(z)) {
            upsertRemotePlayer(String(peer.peerId ?? peer.userId ?? ""), String(peer.username ?? "同道"), x, z, Number(peer.hp ?? 100), Number(peer.maxHp ?? 100), Boolean(peer.down), String(peer.userId ?? ""), String(peer.raidId ?? ""), messageGear(peer.gear));
          }
        }
      }
      if (message.type === "peer_position") {
        const payload = message.payload ?? {};
        const x = Number(payload.playerX);
        const z = Number(payload.playerZ);
        if (Number.isFinite(x) && Number.isFinite(z)) {
          upsertRemotePlayer(String(message.peerId ?? message.userId ?? ""), String(message.username ?? "同道"), x, z, Number(message.hp ?? 100), Number(message.maxHp ?? 100), Boolean(message.down), String(message.userId ?? ""), String(message.raidId ?? ""), messageGear(message.gear));
        }
        threatWarning = "检测到同房间修士位置同步";
        threatWarningTime = Math.max(threatWarningTime, 1.2);
      }
      if (message.type === "peer_damaged" || message.type === "peer_down") {
        const targetPeerId = String(message.targetPeerId ?? "");
        const droppedList = Array.isArray(message.lootDrops) ? message.lootDrops : message.loot ? [message.loot] : [];
        if (targetPeerId === localPeerId) {
          playerHp = Math.max(0, Number(message.hp ?? playerHp));
          playerHurtPulse = 1;
          addFloatingText(message.type === "peer_down" ? "被击倒" : `-${Number(message.damage ?? 0)}`, player.position, "#ff8f8f");
        }
        const remote = remotePlayers.get(targetPeerId);
        if (remote) {
          remote.hp = Number(message.hp ?? remote.hp);
          remote.maxHp = Number(message.maxHp ?? remote.maxHp);
          remote.down = message.type === "peer_down";
          remote.flash = 1;
          addEffect(createHitBurst(remote.mesh.position, true));
          addFloatingText(message.type === "peer_down" ? "击倒" : `-${Number(message.damage ?? 0)}`, remote.mesh.position, message.type === "peer_down" ? "#ffd166" : "#9de8ff");
        }
        droppedList.forEach((dropped: Record<string, unknown>) => {
          if (!dropped?.claimToken) return;
          const x = Number(dropped.x ?? message.payload?.targetX ?? 0);
          const z = Number(dropped.z ?? message.payload?.targetZ ?? 0);
          spawnLoot(new THREE.Vector3(x, 0, z), {
            id: nextLootId++,
            itemId: String(dropped.itemId ?? "rival_loot_bag"),
            claimToken: String(dropped.claimToken),
            source: String(dropped.source ?? "player"),
            sourceId: String(dropped.sourceId ?? targetPeerId),
            sourcePosition: { x, z },
            name: String(dropped.name ?? "修士遗落乾坤袋"),
            kind: String(dropped.kind ?? "秘宝") as LootKind,
            value: Number(dropped.value ?? 120),
            rarity: (["common", "uncommon", "rare", "epic"].includes(String(dropped.rarity)) ? String(dropped.rarity) : "rare") as LootItem["rarity"],
            equipSlot: dropped.slot === "weapon" ? "weapon" : dropped.slot === "robe" ? "robe" : undefined,
            stats: typeof dropped.stats === "object" && dropped.stats ? dropped.stats : {},
          });
        });
      }
      if (message.type === "peer_left") {
        removeRemotePlayer(String(message.peerId ?? message.userId ?? ""));
      }
      if (message.type === "peer_gear_swapped") {
        for (const remote of remotePlayers.values()) {
          if (remote.userId !== String(message.userId ?? "") && remote.raidId !== String(message.raidId ?? "")) continue;
          remote.gear = messageGear(message.gear);
          applyGearAppearance(remote.mesh, remote.gear, true);
          remote.flash = 1;
          addFloatingText(String(message.slot ?? "") === "robe" ? "换袍" : "换剑", remote.mesh.position, "#bfffd0");
        }
      }
      if (message.type === "rune_claimed" && String(message.userId ?? "") !== String(account?.userId ?? "")) {
        const remote = Array.from(remotePlayers.values()).find((item) => item.userId === String(message.userId ?? "") || item.raidId === String(message.raidId ?? ""));
        if (remote) addFloatingText(`符文 ${String(message.name ?? "")}`, remote.mesh.position, "#ffd166");
      }
      if (message.type === "entity_damaged") {
        if (String(message.actorUserId ?? "") !== String(account?.userId ?? "")) {
          const source = String(message.source ?? "");
          const sourceId = String(message.sourceId ?? "");
          const hp = Math.max(0, Number(message.hp ?? 0));
          const maxHp = Math.max(1, Number(message.maxHp ?? 1));
          const target = source === "enemy" ? findEnemyBySourceId(sourceId) : source === "rival" ? findRivalBySourceId(sourceId) : null;
          if (target) {
            target.hp = hp;
            target.maxHp = maxHp;
            target.flash = 1;
            addEffect(createHitBurst(target.mesh.position, source === "rival"));
            addFloatingText(`-${Number(message.damage ?? 0)}`, target.mesh.position, source === "rival" ? "#ffcf91" : "#dfffe7");
          }
        }
      }
      if (message.type === "entity_killed") {
        if (String(message.actorUserId ?? "") !== String(account?.userId ?? "")) {
          const source = String(message.source ?? "");
          const sourceId = String(message.sourceId ?? "");
          if (source === "enemy") removeEnemyBySourceId(sourceId);
          if (source === "rival") removeRivalBySourceId(sourceId);
        }
      }
      if (message.type === "search_completed") {
        const sourceId = String(message.sourceId ?? "");
        const node = markSearchNodeCompleted(sourceId, String(message.searchedByUserId ?? "") !== String(account?.userId ?? ""));
        if (node && String(message.searchedByUserId ?? "") !== String(account?.userId ?? "")) {
          addFloatingText(`${String(message.searchedByUsername ?? "其他修士")} 已搜到`, node.mesh.position, "#ffcf91");
        }
      }
      if (message.type === "loot_spawned") {
        const claimToken = String(message.claimToken ?? "");
        if (!hasLootToken(claimToken)) {
          const x = Number(message.x ?? 0);
          const z = Number(message.z ?? 0);
          spawnLoot(
            new THREE.Vector3(x, 0, z),
            {
              id: nextLootId++,
              itemId: String(message.itemId ?? "low_spirit_stone"),
              claimToken,
              source: String(message.source ?? "enemy"),
              sourceId: String(message.sourceId ?? ""),
              sourcePosition: { x, z },
              name: String(message.name ?? "秘境掉落"),
              kind: String(message.kind ?? "灵石") as LootKind,
              value: Number(message.value ?? 25),
              rarity: (["common", "uncommon", "rare", "epic"].includes(String(message.rarity)) ? String(message.rarity) : "common") as LootItem["rarity"],
              equipSlot: message.slot === "weapon" ? "weapon" : message.slot === "robe" ? "robe" : undefined,
              stats: typeof message.stats === "object" && message.stats ? message.stats : {},
            },
            false,
          );
        }
      }
      if (message.type === "loot_claimed") {
        handleLootClaimed(String(message.claimToken ?? ""), String(message.pickedByUserId ?? ""), String(message.pickedByUsername ?? "其他修士"));
      }
      if (message.type === "peer_extracted" || message.type === "peer_dead") {
        const status = message.type === "peer_extracted" ? "extracted" : "dead";
        removeRemotePlayerByIdentity(String(message.userId ?? ""), String(message.raidId ?? ""), status, String(message.username ?? ""));
      }
    } catch {
      // Real-time messages are optional in the prototype client.
    }
  };
  raidSocket.onclose = () => {
    raidSocket = null;
  };
}

function sendRaidSocket(type: string, payload: RaidEventPayload) {
  if (isSoloRaid()) return;
  if (!raidSocket || raidSocket.readyState !== WebSocket.OPEN) return;
  raidSocket.send(JSON.stringify({ type, payload }));
}

function reportPlayerPosition() {
  if (!activeRaid || gameOver) return;
  const payload = {
    playerX: player.position.x,
    playerZ: player.position.z,
    hp: playerHp,
    clientTime: performance.now(),
    runTime,
  };
  logRaidEvent("player_position", payload);
  sendRaidSocket("player_position", payload);
}

function findBestLooseLoot(position: THREE.Vector3, radius: number) {
  let best: LootDrop | null = null;
  let bestScore = 0;
  for (const drop of lootDrops) {
    const distance = Math.max(1, drop.mesh.position.distanceTo(position));
    if (distance > radius) continue;
    const score = drop.item.value / distance;
    if (score > bestScore) {
      best = drop;
      bestScore = score;
    }
  }
  return best;
}

function spawnRival(
  x: number,
  z: number,
  index: number,
  currentHp?: number,
  maxHpOverride?: number,
  restored?: {
    state?: "loot" | "hunt" | "extract";
    goalX?: number;
    goalZ?: number;
    extractProgress?: number;
    lootBag?: Array<{
      claimToken: string;
      source: string;
      sourceId: string;
      x: number;
      z: number;
      itemId: string;
      name: string;
      kind: string;
      slot: string;
      rarity: string;
      value: number;
      stats: Record<string, number>;
    }> | null;
  },
) {
  const mesh = createSwordCultivator();
  tintRival(mesh, index);
  mesh.position.set(x, 0, z);
  mesh.scale.setScalar(0.94);
  scene.add(mesh);
  const maxHp = Math.max(1, Number(maxHpOverride ?? (78 + index * 12)));
  const hp = Math.max(1, Math.min(maxHp, Number(currentHp ?? maxHp)));
  const state = restored?.state ?? "loot";
  const goal =
    Number.isFinite(Number(restored?.goalX)) && Number.isFinite(Number(restored?.goalZ))
      ? new THREE.Vector3(Number(restored?.goalX), 0, Number(restored?.goalZ))
      : randomRaidPoint();
  const lootBag = Array.isArray(restored?.lootBag) && restored.lootBag.length ? restored.lootBag.map(raidDropToLootItem) : rollRivalLoot(index);
  rivals.push({
    mesh,
    hpBar: createEnemyHpBar(),
    sourceId: `rival_${index + 1}`,
    hp,
    maxHp,
    speed: 2.9 + index * 0.08,
    hitCooldown: 0,
    flash: hp < maxHp ? 0.6 : 0,
    name: ["散修劫掠者", "青锋小队", "夺宝修士"][index % 3],
    lootBag,
    state,
    goal,
    extractProgress: Math.max(0, Math.min(1, Number(restored?.extractProgress ?? 0))),
    decisionTimer: 0.2 + Math.random() * 0.7,
    stateReportTimer: 0.2 + Math.random() * 0.5,
  });
}

function spawnLoot(position: THREE.Vector3, item?: LootItem, reportDrop = true) {
  const loot = item ?? rollLoot();
  const mesh = createLootModel(loot.kind);
  const beacon = createLootBeacon(lootColor(loot), loot.rarity === "epic" ? 4.2 : loot.rarity === "rare" ? 3.4 : 2.5);
  mesh.position.copy(position);
  mesh.position.y = 0.48;
  beacon.position.copy(position);
  scene.add(mesh);
  scene.add(beacon);
  lootDrops.push({ mesh, beacon, item: loot });
  if (reportDrop && (loot.source === "enemy" || loot.source === "rival")) {
    logRaidEvent("loot_dropped", {
      itemName: loot.name,
      value: loot.value,
      rarity: loot.rarity,
      claimToken: loot.claimToken ?? "",
      source: loot.source,
      sourceId: loot.sourceId ?? "",
      dropX: position.x,
      dropZ: position.z,
    });
  }
}

function hasLootToken(claimToken: string) {
  if (!claimToken) return false;
  return (
    lootDrops.some((drop) => drop.item.claimToken === claimToken) ||
    inventory.some((item) => item.claimToken === claimToken) ||
    spiritStoneLoot.some((item) => item.claimToken === claimToken)
  );
}

function removeLooseLootByToken(claimToken: string) {
  for (let i = lootDrops.length - 1; i >= 0; i--) {
    const drop = lootDrops[i];
    if (drop.item.claimToken !== claimToken) continue;
    scene.remove(drop.mesh);
    scene.remove(drop.beacon);
    lootDrops.splice(i, 1);
  }
}

function removeInventoryLootByToken(claimToken: string) {
  let removed = false;
  for (let i = inventory.length - 1; i >= 0; i--) {
    if (inventory[i].claimToken !== claimToken) continue;
    inventory.splice(i, 1);
    removed = true;
  }
  for (let i = spiritStoneLoot.length - 1; i >= 0; i--) {
    if (spiritStoneLoot[i].claimToken !== claimToken) continue;
    spiritStoneLoot.splice(i, 1);
    removed = true;
  }
  return removed;
}

function handleLootClaimed(claimToken: string, pickedByUserId: string, pickedByUsername: string) {
  if (!claimToken) return;
  removeLooseLootByToken(claimToken);
  if (account?.userId && pickedByUserId !== account.userId && removeInventoryLootByToken(claimToken)) {
    addFloatingText(`${pickedByUsername || "其他修士"} 抢先拾取`, player.position, "#ffcf91");
  }
}

function spawnSearchNode(kind: SearchNodeKind, x: number, z: number) {
  const mesh = createSearchNodeModel(kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  scene.add(mesh);
  const senseScale = (hasSkill("spirit_sense") ? 0.82 : 1) * (hasRune("spirit_sense_flow") ? 0.85 : 1) * (1 - (isSoloRaid() ? Math.min(0.45, rogueStats().searchSpeedBonus) : 0));
  const duration = (kind === "sealed_chest" ? 3.2 : kind === "spirit_ore" ? 2.4 : 1.8) * senseScale;
  searchNodes.push({ id: searchNodes.length + 1, kind, mesh, searched: false, searchPending: false, progress: 0, duration });
}

function nearestSearchNode() {
  if (!activeRaid || gameOver) return null;
  let nearest: SearchNode | null = null;
  let nearestDistance = Infinity;
  for (const node of searchNodes) {
    if (node.searched || node.searchPending) continue;
    const distance = node.mesh.position.distanceTo(player.position);
    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }
  return nearest && nearestDistance < 2.2 ? nearest : null;
}

function searchNodeSourceId(node: SearchNode) {
  return `search_${node.id}`;
}

function markSearchNodeCompleted(sourceId: string, showFeedback = true) {
  const node = searchNodes.find((item) => searchNodeSourceId(item) === sourceId);
  if (!node) return null;
  node.searched = true;
  node.searchPending = false;
  node.progress = 0;
  node.mesh.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
      child.material.opacity = Math.min(child.material.opacity, 0.38);
      child.material.transparent = true;
    }
  });
  if (showFeedback) {
    addEffect(createPickupBeam(node.mesh.position, node.kind === "sealed_chest" ? 0xffd166 : 0xbfffd0));
    addFloatingText("搜索完成", node.mesh.position, "#bfffd0");
  }
  return node;
}

function searchLootTable(kind: SearchNodeKind, sourceId?: string): LootItem[] {
  const count = kind === "sealed_chest" ? 3 : kind === "spirit_ore" ? 2 : 1 + Math.floor(Math.random() * 2);
  const pooled = Array.from({ length: count }, () => rollLoot("search", sourceId)).filter(Boolean);
  if (pooled.length === count) return pooled;
  const weighted: Record<SearchNodeKind, Array<Omit<LootItem, "id">>> = {
    weapon_rack: [
      { itemId: "greenwood_artifact", name: "青木子母刃", kind: "法器", value: 70, rarity: "uncommon", equipSlot: "weapon", stats: { attack: 7 } },
      { itemId: "low_spirit_stone", name: "下品灵石", kind: "灵石", value: 25, rarity: "common" },
      { itemId: "ironleaf_robe", name: "金蚕法袍", kind: "道袍", value: 65, rarity: "uncommon", equipSlot: "robe", stats: { defense: 4 } },
    ],
    corpse_pack: [
      { itemId: "spring_pill_loot", name: "回春丹", kind: "丹药", value: 35, rarity: "common" },
      { itemId: "jade_slip_broken_sun", name: "残篇：青元剑诀", kind: "功法玉简", value: 90, rarity: "uncommon" },
      { itemId: "mystic_map_fragment", name: "秘境残图", kind: "秘宝", value: 160, rarity: "rare" },
    ],
    spirit_ore: [
      { itemId: "low_spirit_stone", name: "下品灵石", kind: "灵石", value: 25, rarity: "common" },
      { itemId: "mid_spirit_stone", name: "中品灵石", kind: "灵石", value: 75, rarity: "uncommon" },
      { itemId: "spirit_vein_core", name: "灵脉晶核", kind: "秘宝", value: 180, rarity: "rare" },
    ],
    sealed_chest: [
      { itemId: "mystic_map_fragment", name: "秘境残图", kind: "秘宝", value: 160, rarity: "rare" },
      { itemId: "binding_ring_shard", name: "定身灵戒碎片", kind: "秘宝", value: 220, rarity: "epic" },
      { itemId: "blackiron_sword", name: "玄铁飞剑", kind: "法器", value: 180, rarity: "rare", equipSlot: "weapon", stats: { attack: 13 } },
    ],
  };
  const table = weighted[kind];
  return Array.from({ length: count }, () => ({ ...table[Math.floor(Math.random() * table.length)], id: nextLootId++ }));
}

function searchNodeName(kind: SearchNodeKind) {
  return {
    weapon_rack: "破损武器架",
    corpse_pack: "遗骨包裹",
    spirit_ore: "灵石矿脉",
    sealed_chest: "封印宝箱",
  }[kind];
}

async function completeSearch(node: SearchNode) {
  if (!activeRaid || node.searched || node.searchPending) return;
  node.searchPending = true;
  node.progress = 0;
  const sourceId = searchNodeSourceId(node);
  const drops = searchLootTable(node.kind, sourceId);
  if (!isSoloRaid()) {
    try {
      await reportRaidEvent(activeRaid.raidId, "player_position", {
        playerX: player.position.x,
        playerZ: player.position.z,
        hp: playerHp,
        clientTime: performance.now(),
        runTime,
      });
      await reportRaidEvent(activeRaid.raidId, "search_completed", { nodeKind: node.kind, sourceId, drops: drops.length, playerX: player.position.x, playerZ: player.position.z });
    } catch (error) {
      if (error instanceof Error && error.message.includes("已被")) {
        markSearchNodeCompleted(sourceId, false);
      } else {
        node.searchPending = false;
        node.progress = 0;
      }
      addFloatingText(error instanceof Error ? error.message : "搜索点已被搜到", node.mesh.position, "#ffcf91");
      return;
    }
  }
  markSearchNodeCompleted(sourceId, true);
  await maybeClaimRune(node);
  drops.forEach((item, index) => {
    const angle = (index / Math.max(1, drops.length)) * Math.PI * 2 + Math.random() * 0.4;
    const pos = node.mesh.position.clone().add(new THREE.Vector3(Math.cos(angle) * (1.1 + Math.random() * 0.5), 0, Math.sin(angle) * (1.1 + Math.random() * 0.5)));
    spawnLoot(pos, item);
  });
  triggerSearchRisk(node);
}

function setSearchPanel(html: string, visible: boolean) {
  searchPanelEl.classList.toggle("visible", visible);
  if (searchPanelHtml === html) return;
  searchPanelHtml = html;
  searchPanelEl.innerHTML = html;
}

function warnThreat(text: string) {
  threatWarning = text;
  threatWarningTime = 3.2;
  addFloatingText(text, player.position, "#ffcf91");
}

function attractEnemies(position: THREE.Vector3, radius: number, duration = 8) {
  for (const enemy of enemies) {
    if (enemy.mesh.position.distanceTo(position) > radius) continue;
    enemy.alertTarget = position.clone();
    enemy.alertTime = duration;
  }
}

function spawnAmbush(position: THREE.Vector3, count: number, elite = false) {
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 5 + Math.random() * 2.5;
    spawnEnemy(position.x + Math.cos(angle) * distance, position.z + Math.sin(angle) * distance, elite && i === 0);
  }
}

function spawnSoloWave() {
  if (!isSoloRaid() || !activeRaid || gameOver) return;
  soloWave += 1;
  const count = 3 + Math.min(6, soloWave);
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.65;
    const distance = 13 + Math.random() * 7;
    const elite = soloWave >= 2 && i === 0 && soloWave % 2 === 0;
    spawnEnemy(player.position.x + Math.cos(angle) * distance, player.position.z + Math.sin(angle) * distance, elite, `solo_wave_${soloWave}_${i}`);
  }
  warnThreat(`第 ${soloWave} 波妖兽来袭`);
}

function triggerSearchRisk(node: SearchNode) {
  const position = node.mesh.position;
  if (node.kind === "sealed_chest") {
    warnThreat("封印惊动尸傀");
    spawnAmbush(position, 3, true);
    attractEnemies(position, 28, 10);
    return;
  }
  if (node.kind === "spirit_ore" && Math.random() < 0.55) {
    warnThreat("矿脉灵波外泄");
    spawnAmbush(position, 2);
    attractEnemies(position, 22, 8);
    return;
  }
  if (node.kind === "corpse_pack" && Math.random() < 0.35) {
    warnThreat("遗骨怨气惊动附近尸傀");
    attractEnemies(position, 24, 8);
    return;
  }
  if (node.kind === "weapon_rack" && Math.random() < 0.25) {
    warnThreat("兵煞回响");
    attractEnemies(position, 20, 7);
  }
}

function addEffect(effect: Effect) {
  effects.push(effect);
  scene.add(effect.object);
}

function addFloatingText(text: string, position: THREE.Vector3, color?: string) {
  const el = createDamageText(text, position, color);
  app.appendChild(el);
  floatingTexts.push(el);
}

function addHitImpact(amount = 0.18) {
  cameraShake = Math.max(cameraShake, amount);
  attackPulse = Math.max(attackPulse, amount * 3.4);
}

function createQingyuanSwordMesh() {
  const sword = new THREE.Group();
  sword.name = "QingyuanSwordUnit";
  const mat = new THREE.MeshStandardMaterial({
    color: 0xdffef6,
    emissive: 0x52e6cf,
    emissiveIntensity: 2.2,
    roughness: 0.26,
    metalness: 0.18,
  });
  const trailMat = new THREE.MeshStandardMaterial({
    color: 0x9debdc,
    emissive: 0x38d3bc,
    emissiveIntensity: 1.45,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.64), mat);
  blade.position.z = 0.08;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 4), mat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.5;
  const trail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.82), trailMat);
  trail.position.z = -0.48;
  sword.add(blade, tip, trail);
  return sword;
}

function spawnSpiritStoneLoot(position: THREE.Vector3, value: number) {
  spawnLoot(position, {
    id: nextLootId++,
    itemId: value >= 70 ? "mid_spirit_stone" : "low_spirit_stone",
    name: `${value} 灵石`,
    kind: "灵石",
    value,
    rarity: value >= 70 ? "uncommon" : "common",
  }, false);
}

function spawnQingyuanSwordVolley(direction: THREE.Vector3, damage: number) {
  const forward = direction.clone();
  forward.y = 0;
  if (forward.lengthSq() < 0.01) forward.set(1, 0, 0);
  forward.normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  const origin = player.position.clone();
  addEffect(createSlashEffect(origin, forward));
  for (let i = 0; i < 72; i++) {
    const ringAngle = (i / 72) * Math.PI * 2;
    const ringRadius = 0.82 + (i % 9) * 0.055;
    const start = origin.clone().add(new THREE.Vector3(Math.cos(ringAngle) * ringRadius, 0.9 + Math.sin(i * 1.7) * 0.28, Math.sin(ringAngle) * ringRadius));
    const lane = (i % 12) - 5.5;
    const side = lane * 0.16;
    const wave = i % 2 === 0 ? 1 : -1;
    const control = origin.clone()
      .add(forward.clone().multiplyScalar(1.65 + (i % 8) * 0.055))
      .add(right.clone().multiplyScalar(side + wave * (0.9 + (i % 4) * 0.08)));
    control.y = 1.1 + ((i % 6) - 2.5) * 0.08;
    const end = origin.clone()
      .add(forward.clone().multiplyScalar(5.0 + (i % 6) * 0.2))
      .add(right.clone().multiplyScalar(side));
    end.y = 0.84 + ((i % 5) - 2) * 0.06;
    const mesh = createQingyuanSwordMesh();
    mesh.position.copy(start);
    scene.add(mesh);
    qingyuanSwords.push({
      mesh,
      start,
      control,
      end,
      age: 0,
      duration: 0.58,
      delay: (i % 12) * 0.012 + Math.floor(i / 12) * 0.006,
      damage,
      hit: new Set(),
    });
  }
}

function updateQingyuanSwords(dt: number) {
  for (let i = qingyuanSwords.length - 1; i >= 0; i--) {
    const sword = qingyuanSwords[i];
    sword.age += dt;
    const raw = (sword.age - sword.delay) / sword.duration;
    if (raw < 0) continue;
    const t = THREE.MathUtils.clamp(raw, 0, 1);
    const ease = 1 - Math.pow(1 - t, 2.1);
    const oneMinus = 1 - ease;
    const pos = sword.start.clone().multiplyScalar(oneMinus * oneMinus)
      .add(sword.control.clone().multiplyScalar(2 * oneMinus * ease))
      .add(sword.end.clone().multiplyScalar(ease * ease));
    const nextT = Math.min(1, ease + 0.035);
    const nextOneMinus = 1 - nextT;
    const next = sword.start.clone().multiplyScalar(nextOneMinus * nextOneMinus)
      .add(sword.control.clone().multiplyScalar(2 * nextOneMinus * nextT))
      .add(sword.end.clone().multiplyScalar(nextT * nextT));
    sword.mesh.position.copy(pos);
    sword.mesh.lookAt(next);
    sword.mesh.scale.setScalar(0.68 + Math.sin(t * Math.PI) * 0.44);
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || sword.hit.has(enemy)) continue;
      if (enemy.mesh.position.distanceTo(pos) > (enemy.elite ? 1.18 : 0.95)) continue;
      sword.hit.add(enemy);
      enemy.hp -= sword.damage;
      enemy.flash = 1;
      enemy.alertTarget = player.position.clone();
      enemy.alertTime = Math.max(enemy.alertTime, 4);
      spirit += 1;
      playerHp = Math.min(maxPlayerHp(), playerHp + Math.max(0, sword.damage * rogueStats().lifesteal));
      addEffect(createQingyuanHitBurst(enemy.mesh.position, next.clone().sub(pos).normalize(), enemy.elite));
      addFloatingText(`飞剑 -${sword.damage}`, enemy.mesh.position, "#b8fff0");
      addHitImpact(enemy.elite ? 0.11 : 0.07);
    }
    if (raw >= 1) {
      scene.remove(sword.mesh);
      qingyuanSwords.splice(i, 1);
    }
  }
}

function rollLoot(preferredSource?: string, preferredSourceId?: string): LootItem {
  if (isSoloRaid()) return rollRogueLoot();
  const pool = activeRaid?.lootPool ?? [];
  const poolItem =
    pool.find((item) => item.source === preferredSource && item.sourceId === preferredSourceId && !usedRaidLootTokens.has(item.claimToken)) ??
    pool.find((item) => item.source === preferredSource && !usedRaidLootTokens.has(item.claimToken)) ??
    pool.find((item) => !usedRaidLootTokens.has(item.claimToken));
  if (poolItem) {
    usedRaidLootTokens.add(poolItem.claimToken);
    return {
      id: nextLootId++,
      itemId: poolItem.itemId,
      claimToken: poolItem.claimToken,
      source: poolItem.source,
      sourceId: poolItem.sourceId,
      sourcePosition: { x: poolItem.x, z: poolItem.z },
      name: poolItem.name,
      kind: poolItem.kind as LootKind,
      value: poolItem.value,
      rarity: poolItem.rarity,
      equipSlot: poolItem.slot === "weapon" ? "weapon" : poolItem.slot === "robe" ? "robe" : undefined,
      stats: poolItem.stats,
    };
  }
  const table: Array<Omit<LootItem, "id">> = [
    { itemId: "jade_slip_broken_sun", name: "残篇：青元剑诀", kind: "功法玉简", value: 90, rarity: "uncommon" },
    { itemId: "low_spirit_stone", name: "下品灵石", kind: "灵石", value: 25, rarity: "common" },
    { itemId: "spring_pill_loot", name: "回春丹", kind: "丹药", value: 35, rarity: "common" },
    { itemId: "greenwood_artifact", name: "青木子母刃", kind: "法器", value: 70, rarity: "uncommon", equipSlot: "weapon", stats: { attack: 7 } },
    { itemId: "ironleaf_robe", name: "金蚕法袍", kind: "道袍", value: 65, rarity: "uncommon", equipSlot: "robe", stats: { defense: 4 } },
    { itemId: "mystic_map_fragment", name: "秘境残图", kind: "秘宝", value: 160, rarity: "rare" },
    { itemId: "binding_ring_shard", name: "定身灵戒碎片", kind: "秘宝", value: 220, rarity: "epic" },
  ];
  const base = table[Math.floor(Math.random() * table.length)];
  return { ...base, id: nextLootId++ };
}

function lootColor(item: LootItem) {
  if (item.rarity === "epic") return 0xffd166;
  if (item.rarity === "rare") return 0xb99cff;
  if (item.kind === "功法玉简") return 0x9ddcff;
  return 0xbfffd0;
}

async function discardLoot(id: number) {
  if (!activeRaid || gameOver) return;
  const index = inventory.findIndex((item) => item.id === id);
  if (index < 0) return;
  const item = inventory[index];
  const angle = Math.random() * Math.PI * 2;
  const dropPosition = player.position.clone().add(new THREE.Vector3(Math.cos(angle) * 0.85, 0, Math.sin(angle) * 0.85));
  if (!isSoloRaid()) {
    try {
      await reportRaidEvent(activeRaid.raidId, "player_position", {
        playerX: player.position.x,
        playerZ: player.position.z,
        hp: playerHp,
        clientTime: performance.now(),
        runTime,
      });
      await reportRaidEvent(activeRaid.raidId, "loot_discarded", {
        itemName: item.name,
        kind: item.kind,
        value: item.value,
        rarity: item.rarity,
        claimToken: item.claimToken ?? "",
        source: item.source ?? "",
        sourceId: item.sourceId ?? "",
        dropX: dropPosition.x,
        dropZ: dropPosition.z,
        playerX: player.position.x,
        playerZ: player.position.z,
      });
    } catch (error) {
      addFloatingText(error instanceof Error ? error.message : "丢弃失败", player.position, "#ffb4b4");
      return;
    }
  }
  inventory.splice(index, 1);
  if (item.equipSlot && raidGear[item.equipSlot] === item.id) {
    delete raidGear[item.equipSlot];
    applyGearAppearance(player, currentRaidGearAppearance());
    logRaidEvent("gear_swapped", { slot: item.equipSlot, playerX: player.position.x, playerZ: player.position.z });
  }
  spawnLoot(dropPosition, item, false);
  addFloatingText("丢弃", dropPosition, "#ffcf91");
}

function equipRaidLoot(id: number) {
  if (!activeRaid || gameOver) return;
  const item = inventory.find((entry) => entry.id === id);
  if (!item?.equipSlot) return;
  raidGear[item.equipSlot] = item.id;
  applyGearAppearance(player, currentRaidGearAppearance());
  const stats = item.stats?.attack ? `攻击 +${item.stats.attack}` : item.stats?.defense ? `防御 +${item.stats.defense}` : "属性生效";
  logRaidEvent("gear_swapped", {
    itemName: item.name,
    slot: item.equipSlot,
    value: item.value,
    claimToken: item.claimToken ?? "",
    source: item.source ?? "",
    sourceId: item.sourceId ?? "",
    attack: item.stats?.attack ?? 0,
    defense: item.stats?.defense ?? 0,
  });
  addFloatingText(`临时换装 ${stats}`, player.position, "#bfffd0");
}

function applyRogueLoot(id: number) {
  if (!isSoloRaid() || !activeRaid || gameOver) return;
  const index = inventory.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  const item = inventory[index];
  const choice = item.rogue;
  if (!choice) return;
  inventory.splice(index, 1);
  applyRogueChoice(choice);
}

function settlementLoot(item: LootItem) {
  return {
    itemId: item.itemId,
    claimToken: item.claimToken,
    source: item.source,
    sourceId: item.sourceId,
    name: item.name,
    kind: item.kind,
    rarity: item.rarity,
    value: item.value,
    stats: item.stats ?? {},
  };
}

function raidDropToLootItem(drop: NonNullable<Raid["carriedLoot"]>[number]): LootItem {
  return {
    id: nextLootId++,
    itemId: drop.itemId,
    claimToken: drop.claimToken,
    source: drop.source,
    sourceId: drop.sourceId,
    sourcePosition: { x: Number(drop.x ?? 0), z: Number(drop.z ?? 0) },
    name: drop.name,
    kind: drop.kind as LootKind,
    value: drop.value,
    rarity: (["common", "uncommon", "rare", "epic"].includes(drop.rarity) ? drop.rarity : "common") as LootItem["rarity"],
    equipSlot: drop.slot === "weapon" ? "weapon" : drop.slot === "robe" ? "robe" : undefined,
    stats: drop.stats ?? {},
  };
}

type AutoCombatTarget = {
  mesh: THREE.Object3D;
  distance: number;
  hp: number;
  elite: boolean;
};

function livingHostiles(maxRange: number) {
  const targets: AutoCombatTarget[] = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const distance = enemy.mesh.position.distanceTo(player.position);
    if (distance <= maxRange) targets.push({ mesh: enemy.mesh, distance, hp: enemy.hp, elite: enemy.elite });
  }
  for (const rival of rivals) {
    if (rival.hp <= 0) continue;
    const distance = rival.mesh.position.distanceTo(player.position);
    if (distance <= maxRange) targets.push({ mesh: rival.mesh, distance, hp: rival.hp, elite: true });
  }
  for (const remote of remotePlayers.values()) {
    if (remote.down || remote.hp <= 0) continue;
    const distance = remote.mesh.position.distanceTo(player.position);
    if (distance <= maxRange) targets.push({ mesh: remote.mesh, distance, hp: remote.hp, elite: true });
  }
  return targets.sort((a, b) => Number(b.elite) - Number(a.elite) || a.distance - b.distance || b.hp - a.hp);
}

function aimAtTarget(target: THREE.Object3D) {
  pointerWorld.copy(target.position);
  pointerWorld.y = 0;
}

function autoCombat(dt: number) {
  if (!activeRaid || gameOver) return;
  autoCombatTimer = Math.max(0, autoCombatTimer - dt);
  const target = livingHostiles(8.2)[0];
  if (!target) return;
  aimAtTarget(target.mesh);
  if (autoCombatTimer > 0) return;

  const closeTargets = livingHostiles(4.4);
  if (closeTargets.length >= 2 && bindingCooldown <= 0 && hasSkill("binding_array")) {
    useBindingArray();
    autoCombatTimer = 0.28;
    return;
  }
  if (target.distance <= 7 && thunderCooldown <= 0 && hasSkill("thunder_seal")) {
    useThunderSeal();
    autoCombatTimer = 0.32;
    return;
  }
  if (target.distance <= 3.35 && attackCooldown <= 0) {
    attack();
    autoCombatTimer = 0.12;
  }
}

function combatDirection() {
  const direction = pointerWorld.clone().sub(player.position);
  direction.y = 0;
  if (direction.lengthSq() < 0.01) direction.set(1, 0, 0);
  return direction.normalize();
}

function combatSkillBonus() {
  return hasSkill("body_forging") ? 2 : 0;
}

async function useConsumable() {
  if (!activeRaid || gameOver) return;
  if (playerHp >= maxPlayerHp()) {
    addFloatingText("气血已满", player.position, "#bfffd0");
    return;
  }
  const item = raidConsumables[0];
  if (!item) {
    addFloatingText("没有丹药", player.position, "#ffcf91");
    return;
  }
  const heal = Number(item.stats?.heal ?? 0);
  if (!heal) return;
  if (!isSoloRaid()) {
    try {
      await reportRaidEvent(activeRaid.raidId, "consumable_used", {
        instanceId: item.instanceId,
        itemId: item.itemId,
        itemName: item.name,
        heal,
        playerX: player.position.x,
        playerZ: player.position.z,
      });
    } catch (error) {
      addFloatingText(error instanceof Error ? error.message : "丹药失效", player.position, "#ffb4b4");
      return;
    }
  }
  raidConsumables = raidConsumables.filter((entry) => entry.instanceId !== item.instanceId);
  if (account && !isSoloRaid()) {
    account.profile.stash = account.profile.stash.filter((entry) => entry.instanceId !== item.instanceId);
    account.profile.loadout.consumables = account.profile.loadout.consumables.filter((id) => id !== item.instanceId);
  }
  playerHp = Math.min(maxPlayerHp(), playerHp + heal);
  addEffect(createPickupBeam(player.position, 0xbfffd0));
  addFloatingText(`+${heal}`, player.position, "#bfffd0");
}

function reportEntityHit(target: Enemy | Rival, source: "enemy" | "rival", attackKind: string, damage: number, direction: THREE.Vector3) {
  const sourceId = source === "enemy" ? (target as Enemy).sourceId : (target as Rival).sourceId;
  if (!sourceId) return;
  logRaidEvent("entity_hit", {
    source,
    sourceId,
    attackKind,
    damage,
    clientTime: performance.now(),
    dirX: direction.x,
    dirZ: direction.z,
    playerX: player.position.x,
    playerZ: player.position.z,
    targetX: target.mesh.position.x,
    targetZ: target.mesh.position.z,
  });
}

function reportRivalState(rival: Rival) {
  if (!activeRaid || gameOver) return;
  logRaidEvent("rival_state", {
    sourceId: rival.sourceId,
    x: rival.mesh.position.x,
    z: rival.mesh.position.z,
    hp: rival.hp,
    state: rival.state,
    goalX: rival.goal.x,
    goalZ: rival.goal.z,
    extractProgress: rival.extractProgress,
    lootBag: rival.lootBag
      .filter((item) => item.claimToken)
      .slice(0, 8)
      .map((item) => ({
        claimToken: item.claimToken ?? "",
      })),
  });
}

function applyEntityDamage(target: Enemy | Rival, source: "enemy" | "rival", attackKind: string, damage: number, direction: THREE.Vector3, color: string) {
  target.hp -= damage;
  if (isSoloRaid()) playerHp = Math.min(maxPlayerHp(), playerHp + Math.max(0, damage * rogueStats().lifesteal));
  target.flash = 1;
  reportEntityHit(target, source, attackKind, damage, direction);
  spirit += source === "rival" ? 6 : 4;
  addEffect(createHitBurst(target.mesh.position, source === "rival" || (target as Enemy).elite));
  addFloatingText(`-${damage}`, target.mesh.position, color);
}

function useThunderSeal() {
  if (!activeRaid || gameOver || thunderCooldown > 0 || !hasSkill("thunder_seal")) return;
  const direction = combatDirection();
  let best: { kind: "enemy" | "rival"; target: Enemy | Rival; score: number } | null = null;
  let bestRemote: { target: RemotePlayer; score: number } | null = null;
  for (const enemy of enemies) {
    const distance = enemy.mesh.position.distanceTo(player.position);
    const pointerDistance = enemy.mesh.position.distanceTo(pointerWorld);
    if (distance > 7.0 || pointerDistance > 3.0) continue;
    const score = pointerDistance + distance * 0.12;
    if (!best || score < best.score) best = { kind: "enemy", target: enemy, score };
  }
  for (const rival of rivals) {
    const distance = rival.mesh.position.distanceTo(player.position);
    const pointerDistance = rival.mesh.position.distanceTo(pointerWorld);
    if (distance > 7.0 || pointerDistance > 3.0) continue;
    const score = pointerDistance + distance * 0.12;
    if (!best || score < best.score) best = { kind: "rival", target: rival, score };
  }
  for (const remote of remotePlayers.values()) {
    if (remote.down) continue;
    const distance = remote.mesh.position.distanceTo(player.position);
    const pointerDistance = remote.mesh.position.distanceTo(pointerWorld);
    if (distance > 7.0 || pointerDistance > 3.0) continue;
    const score = pointerDistance + distance * 0.12;
    if (!bestRemote || score < bestRemote.score) bestRemote = { target: remote, score };
  }
  if (bestRemote && (!best || bestRemote.score < best.score)) {
    const stats = equippedStats();
    const damage = 38 + Math.floor(stats.attack * 0.9) + combatSkillBonus() + runeDamageBonus("thunder_seal") + (isSoloRaid() ? Math.floor(rogueStats().thunderDamage) : 0);
    thunderCooldown = 4.2 * (isSoloRaid() ? rogueStats().cooldownScale : 1);
    addEffect(createThunderStrike(bestRemote.target.mesh.position));
    addFloatingText(`-${damage}`, bestRemote.target.mesh.position, "#9de8ff");
    sendRaidSocket("player_attack", {
      targetPeerId: bestRemote.target.peerId,
      attackKind: "thunder_seal",
      damage,
      clientTime: performance.now(),
      dirX: direction.x,
      dirZ: direction.z,
      playerX: player.position.x,
      playerZ: player.position.z,
      targetX: bestRemote.target.mesh.position.x,
      targetZ: bestRemote.target.mesh.position.z,
    });
    return;
  }
  if (!best) {
    addFloatingText("掌心雷未锁定", player.position, "#9de8ff");
    thunderCooldown = 0.5;
    return;
  }
  const stats = equippedStats();
  const damage = 46 + Math.floor(stats.attack * 1.2) + combatSkillBonus() + runeDamageBonus("thunder_seal") + (isSoloRaid() ? Math.floor(rogueStats().thunderDamage) : 0);
  thunderCooldown = 4.2 * (isSoloRaid() ? rogueStats().cooldownScale : 1);
  addEffect(createThunderStrike(best.target.mesh.position));
  applyEntityDamage(best.target, best.kind, "thunder_seal", damage, direction, "#9de8ff");
}

function useBindingArray() {
  if (!activeRaid || gameOver || bindingCooldown > 0 || !hasSkill("binding_array")) return;
  const direction = combatDirection();
  const stats = equippedStats();
  const damage = 18 + Math.floor(stats.attack * 0.55) + combatSkillBonus() + (isSoloRaid() ? Math.floor(rogueStats().bindingDamage) : 0);
  let hits = 0;
  bindingCooldown = 6.5 * (isSoloRaid() ? rogueStats().cooldownScale : 1);
  addEffect(createBindingField(player.position, 4.2));
  for (const enemy of enemies) {
    if (enemy.mesh.position.distanceTo(player.position) > 4.4) continue;
    applyEntityDamage(enemy, "enemy", "binding_array", damage, direction, "#dcb8ff");
    enemy.alertTarget = player.position.clone();
    enemy.alertTime = Math.max(enemy.alertTime, 4);
    hits += 1;
  }
  for (const rival of rivals) {
    if (rival.mesh.position.distanceTo(player.position) > 4.4) continue;
    applyEntityDamage(rival, "rival", "binding_array", damage, direction, "#dcb8ff");
    hits += 1;
  }
  for (const remote of remotePlayers.values()) {
    if (remote.down || remote.mesh.position.distanceTo(player.position) > 4.4) continue;
    const playerDamage = 14 + Math.floor(stats.attack * 0.45) + combatSkillBonus();
    sendRaidSocket("player_attack", {
      targetPeerId: remote.peerId,
      attackKind: "binding_array",
      damage: playerDamage,
      clientTime: performance.now(),
      dirX: direction.x,
      dirZ: direction.z,
      playerX: player.position.x,
      playerZ: player.position.z,
      targetX: remote.mesh.position.x,
      targetZ: remote.mesh.position.z,
    });
    hits += 1;
  }
  addFloatingText(hits ? `缚灵 ${hits}` : "缚灵落空", player.position, hits ? "#dcb8ff" : "#a8b8c8");
}

function attack() {
  if (!activeRaid || attackCooldown > 0 || gameOver) return;
  attackCooldown = 0.36 * (isSoloRaid() ? rogueStats().cooldownScale : 1);
  attackPulse = 1;
  const direction = pointerWorld.clone().sub(player.position);
  direction.y = 0;
  if (direction.lengthSq() < 0.01) direction.set(1, 0, 0);
  direction.normalize();

  if (isSoloRaid()) {
    const stats = equippedStats();
    const skillBonus = hasSkill("body_forging") ? 2 : 0;
    const volleyDamage = Math.max(3, Math.floor((24 + stats.attack + skillBonus + runeDamageBonus("sword_qi") + Math.floor(rogueStats().swordDamage)) * 0.18));
    spawnQingyuanSwordVolley(direction, volleyDamage);
    return;
  }

  addEffect(createSlashEffect(player.position, direction));

  for (const enemy of enemies) {
    const toEnemy = enemy.mesh.position.clone().sub(player.position);
    const distance = toEnemy.length();
    toEnemy.y = 0;
    const facing = direction.dot(toEnemy.normalize());
    if (distance < 3.1 && facing > 0.2) {
      const stats = equippedStats();
      const skillBonus = hasSkill("body_forging") ? 2 : 0;
      const damage = (enemy.elite ? 28 : 34) + stats.attack + skillBonus + runeDamageBonus("sword_qi") + (isSoloRaid() ? Math.floor(rogueStats().swordDamage) : 0);
      enemy.hp -= damage;
      if (enemy.sourceId) {
        logRaidEvent("entity_hit", {
          source: "enemy",
          sourceId: enemy.sourceId,
          attackKind: "sword_qi",
          damage,
          clientTime: performance.now(),
          dirX: direction.x,
          dirZ: direction.z,
          playerX: player.position.x,
          playerZ: player.position.z,
          targetX: enemy.mesh.position.x,
          targetZ: enemy.mesh.position.z,
        });
      }
      enemy.flash = 1;
      enemy.mesh.position.add(direction.clone().multiplyScalar(0.7));
      spirit += 4;
      if (isSoloRaid()) playerHp = Math.min(maxPlayerHp(), playerHp + Math.max(0, damage * rogueStats().lifesteal));
      addHitImpact(enemy.elite ? 0.28 : 0.2);
      addEffect(createQingyuanHitBurst(enemy.mesh.position, direction, enemy.elite));
      addFloatingText(`青元 -${damage}`, enemy.mesh.position, enemy.elite ? "#dffef6" : "#b8fff0");
    }
  }

  for (const rival of rivals) {
    const toRival = rival.mesh.position.clone().sub(player.position);
    const distance = toRival.length();
    toRival.y = 0;
    const facing = direction.dot(toRival.normalize());
    if (distance < 3.25 && facing > 0.18) {
      const stats = equippedStats();
      const skillBonus = hasSkill("body_forging") ? 2 : 0;
      const damage = 30 + stats.attack + skillBonus + runeDamageBonus("sword_qi") + (isSoloRaid() ? Math.floor(rogueStats().swordDamage) : 0);
      rival.hp -= damage;
      logRaidEvent("entity_hit", {
        source: "rival",
        sourceId: rival.sourceId,
        attackKind: "sword_qi",
        damage,
        clientTime: performance.now(),
        dirX: direction.x,
        dirZ: direction.z,
        playerX: player.position.x,
        playerZ: player.position.z,
        targetX: rival.mesh.position.x,
        targetZ: rival.mesh.position.z,
      });
      rival.flash = 1;
      rival.mesh.position.add(direction.clone().multiplyScalar(0.62));
      spirit += 6;
      if (isSoloRaid()) playerHp = Math.min(maxPlayerHp(), playerHp + Math.max(0, damage * rogueStats().lifesteal));
      addHitImpact(0.3);
      addEffect(createQingyuanHitBurst(rival.mesh.position, direction, true));
      addFloatingText(`青元 -${damage}`, rival.mesh.position, "#dffef6");
    }
  }

  for (const remote of remotePlayers.values()) {
    if (remote.down) continue;
    const toRemote = remote.mesh.position.clone().sub(player.position);
    const distance = toRemote.length();
    toRemote.y = 0;
    const facing = direction.dot(toRemote.normalize());
    if (distance < 3.35 && facing > 0.18) {
      const stats = equippedStats();
      const skillBonus = hasSkill("body_forging") ? 2 : 0;
      const damage = 26 + stats.attack + skillBonus + runeDamageBonus("sword_qi") + (isSoloRaid() ? Math.floor(rogueStats().swordDamage) : 0);
      addHitImpact(0.24);
      addEffect(createQingyuanHitBurst(remote.mesh.position, direction, true));
      sendRaidSocket("player_attack", {
        targetPeerId: remote.peerId,
        attackKind: "sword_qi",
        damage,
        clientTime: performance.now(),
        dirX: direction.x,
        dirZ: direction.z,
        playerX: player.position.x,
        playerZ: player.position.z,
        targetX: remote.mesh.position.x,
        targetZ: remote.mesh.position.z,
      });
      spirit += 3;
    }
  }
}

function dash() {
  if (!activeRaid || gameOver || dashCooldown > 0 || !hasSkill("dash")) return;
  const direction = pointerWorld.clone().sub(player.position);
  direction.y = 0;
  if (direction.lengthSq() < 0.01) direction.set(0, 0, -1);
  direction.normalize();
  player.position.add(direction.multiplyScalar(4.2));
  player.position.x = THREE.MathUtils.clamp(player.position.x, -38, 38);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -38, 38);
  dashCooldown = 2.8;
  addEffect(createPickupBeam(player.position, 0x9de8ff));
  addFloatingText("流云步", player.position, "#9de8ff");
}

function updateHud() {
  const totalValue = carriedLootValue();
  const stoneValue = spiritStoneValue();
  const timeLeft = Math.max(0, RAID_DURATION - runTime);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = Math.floor(timeLeft % 60);
  const extractionDistance = player.position.distanceTo(extraction.position);
  hpEl.textContent = `${Math.max(0, Math.ceil(playerHp))}/${maxPlayerHp()}`;
  spiritEl.textContent = `${spirit}`;
  valueEl.textContent = `${totalValue + stoneValue}`;
  soloLevelEl.textContent = isSoloRaid() ? `${soloLevel} (${soloExp}/${soloExpToNext})` : "-";
  timerEl.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  extractDistanceEl.textContent = activeRaid ? `${Math.floor(extractionDistance)}m` : "--";
  extractEl.textContent = extractionProgress > 0 ? `${Math.floor(extractionProgress * 100)}%` : "未开始";
  vignetteEl.style.opacity = `${Math.max(0, playerHurtPulse * 0.42)}`;
  mobileControlsEl.classList.toggle("visible", Boolean(activeRaid && !gameOver));
  inventoryPanelEl.classList.toggle("raid-active", Boolean(activeRaid && !gameOver));
  const carriedLootHtml = inventory.length
    ? inventory
        .slice(-7)
        .reverse()
        .map(
          (item) => `
          <div class="loot-row ${rarityClass(item.rarity)}">
            <span>${item.name}${item.rogue ? `<small>${rogueLootLabel(item)}</small>` : ""}</span>
            <span>${item.value}${item.equipSlot && raidGear[item.equipSlot] === item.id ? " / 已装" : ""}</span>
            ${
              item.rogue
                ? `<button data-rogue-loot="${item.id}" title="${item.rogue.description}">${item.rogue.type === "art" ? "研习" : "装备"}</button>`
                : ""
            }
            ${
              !item.rogue && item.equipSlot && raidGear[item.equipSlot] !== item.id
                ? `<button data-equip-loot="${item.id}" title="临时换装">换装</button>`
                : ""
            }
            <button data-discard-loot="${item.id}" title="丢到地面">丢弃</button>
          </div>
        `,
        )
        .join("")
    : `<div class="loot-row"><span>尚未拾取</span><span>0</span></div>`;
  const runeText = raidRunes.length ? raidRunes.map((runeId) => RUNE_CONFIG[runeId].name).join(" / ") : "无";
  const rogueGearText = (["main", "offhand", "robe", "trinket"] as RogueSlot[])
    .map((slot) => `${ROGUE_SLOT_LABEL[slot]}:${rogueBuild.gear[slot]?.name ?? "空"}`)
    .join(" / ");
  const rogueArtText = rogueBuild.arts.length ? rogueBuild.arts.map((art) => art.name).join(" / ") : "无";
  const rogueStatsText = isSoloRaid()
    ? `<div class="loot-row rogue-line"><span>流派共鸣</span><span>${rogueSynergyText()}</span></div>
    <div class="loot-row rogue-line"><span>本局装备</span><span>${rogueGearText}</span></div>
    <div class="loot-row rogue-line"><span>本局功法</span><span>${rogueArtText}</span></div>`
    : "";
  const lootHtml = `
    <b>乾坤袋 ${inventory.length}/${BAG_SLOT_LIMIT}</b>
    <div class="loot-row safe"><span>本局灵石</span><span>${stoneValue}</span></div>
    <div class="loot-row safe"><span>本局符文</span><span>${runeText}</span></div>
    <div class="loot-row safe"><span>丹药 Q</span><span>${raidConsumables.length}</span></div>
    ${rogueStatsText}
    ${carriedLootHtml}
  `;
  const nextInventoryPanelHtml = lootHtml;
  if (inventoryPanelHtml !== nextInventoryPanelHtml) {
    inventoryPanelHtml = nextInventoryPanelHtml;
    lootListEl.innerHTML = lootHtml;
    lootListEl.querySelectorAll<HTMLButtonElement>("[data-equip-loot]").forEach((button) => {
      button.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        equipRaidLoot(Number(button.dataset.equipLoot));
      };
    });
    lootListEl.querySelectorAll<HTMLButtonElement>("[data-rogue-loot]").forEach((button) => {
      button.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyRogueLoot(Number(button.dataset.rogueLoot));
      };
    });
    lootListEl.querySelectorAll<HTMLButtonElement>("[data-discard-loot]").forEach((button) => {
      button.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        void discardLoot(Number(button.dataset.discardLoot));
      };
    });
  }
}

function endGame(success: boolean) {
  gameOver = true;
  const raid = activeRaid;
  if (raid && success) {
    logRaidEvent("player_position", {
      playerX: player.position.x,
      playerZ: player.position.z,
      hp: playerHp,
      clientTime: performance.now(),
      runTime,
    });
  }
  closeRaidSocket();
  activeRaid = null;
  resumableRaid = null;
  const carriedValue = carriedLootValue();
  const currencyValue = spiritStoneValue();
  lastSettlement = {
    success,
    gained: success ? [...inventory, ...spiritStoneLoot] : [],
    kept: [],
    lost: success ? [] : [...inventory, ...spiritStoneLoot],
    silverDelta: success ? currencyValue + Math.floor(carriedValue * 0.15) : 0,
  };
  resultEl.classList.add("visible");
  resultTitleEl.textContent = isSoloRaid() ? (success ? "试炼完成" : "试炼失败") : success ? "撤离成功" : "秘境失守";
  resultBodyEl.innerHTML = renderSettlement(lastSettlement);
  promptEl.textContent = "刷新页面可重新开始原型。";
  if (raid && isSoloRaid()) {
    lobbyMessage = success ? `单机试炼完成：击退 ${soloWave} 波，获得 ${raidRunes.length} 个符文。` : `单机试炼失败：坚持 ${Math.floor(runTime)} 秒。`;
    renderLobby();
  } else if (raid) {
    const settle = raidEventQueue.then(() =>
      success
        ? extractRaid(
            raid.raidId,
            [...inventory, ...spiritStoneLoot].map(settlementLoot),
            { playerX: player.position.x, playerZ: player.position.z, clientTime: performance.now() },
          )
        : dieInRaid(raid.raidId),
    );
    settle
      .then((result) => {
        account = result.user;
        const lostGearCount = "lostGearDrops" in result && Array.isArray(result.lostGearDrops) ? result.lostGearDrops.length : 0;
        lobbyMessage = success ? `撤离成功，${inventory.length} 件物品与 ${spiritStoneValue()} 灵石已带回洞府。` : `秘境失守，遗失 ${inventory.length} 件物品与 ${spiritStoneValue()} 灵石，入场装备掉落 ${lostGearCount} 件。`;
        void refreshShop().then(() => renderLobby());
        renderLobby();
      })
      .catch((error) => {
        lobbyMessage = error instanceof Error ? error.message : "结算失败";
        renderLobby();
      });
  } else {
    renderLobby();
  }
}

function renderSettlement(settlement: NonNullable<typeof lastSettlement>) {
  const rows = (title: string, items: LootItem[]) => `
    <strong>${title}</strong>
    ${items.length ? items.map((item) => `<span>${item.name}<em>${item.value}</em></span>`).join("") : "<span>无<em>0</em></span>"}
  `;
  return `
    <div class="settlement-list">
      ${rows("带出", settlement.gained)}
      ${rows("遗失", settlement.lost)}
      <strong>灵石变化</strong><span>+${settlement.silverDelta}<em></em></span>
    </div>
  `;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", onResize);
window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isFormField = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement;
  if (isFormField) return;
  keys.add(event.key.toLowerCase());
  if (event.code === "Space") dash();
  if (event.key.toLowerCase() === "q") void useConsumable();
  if (event.key === "1") useThunderSeal();
  if (event.key === "2") useBindingArray();
  if (event.key.toLowerCase() === "e") {
    event.preventDefault();
    const node = nearestSearchNode();
    if (node) node.progress = Math.max(node.progress, 0.01);
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("pointermove", (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(groundPlane, pointerWorld);
});
window.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement | null)?.closest(".mobile-controls")) return;
  attack();
});

function startSearchNearPlayer() {
  const node = nearestSearchNode();
  if (node) node.progress = Math.max(node.progress, 0.01);
}

function handleMobileAction(action: string) {
  if (action === "attack") attack();
  if (action === "dash") dash();
  if (action === "thunder") useThunderSeal();
  if (action === "bind") useBindingArray();
  if (action === "search") startSearchNearPlayer();
  if (action === "heal") void useConsumable();
}

mobileControlsEl.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  event.preventDefault();
  event.stopPropagation();
  target.setPointerCapture(event.pointerId);
  const key = target.dataset.key;
  if (key) keys.add(key);
  const action = target.dataset.action;
  if (action) handleMobileAction(action);
});

mobileControlsEl.addEventListener("pointerup", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const key = target.dataset.key;
  if (key) keys.delete(key);
});

mobileControlsEl.addEventListener("pointercancel", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const key = target.dataset.key;
  if (key) keys.delete(key);
});

mobileControlsEl.addEventListener("pointerleave", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const key = target.dataset.key;
  if (key) keys.delete(key);
});

async function bootstrapAccount() {
  if (!getToken()) {
    renderLobby();
    return;
  }
  try {
    account = await profile();
    resumableRaid = await activeRaidStatus();
    await refreshShop();
    lobbyMessage = resumableRaid ? "检测到未结算秘境，可继续进入。" : "已恢复登录态，选择配置后进入秘境。";
  } catch {
    clearToken();
    account = null;
    resumableRaid = null;
    lobbyMessage = "登录已过期，请重新登录。";
  }
  renderLobby();
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  if (activeRaid && !gameOver) {
    runTime += dt;
    if (isSoloRaid()) {
      soloWaveTimer += dt;
      const regen = rogueStats().regen;
      if (regen > 0) playerHp = Math.min(maxPlayerHp(), playerHp + regen * dt);
      playerHp = Math.min(playerHp, maxPlayerHp());
      if (soloWaveTimer >= 24 || (soloWave === 0 && soloWaveTimer >= 5)) {
        soloWaveTimer = 0;
        spawnSoloWave();
      }
    }
    attackCooldown = Math.max(0, attackCooldown - dt);
    dashCooldown = Math.max(0, dashCooldown - dt);
    thunderCooldown = Math.max(0, thunderCooldown - dt);
    bindingCooldown = Math.max(0, bindingCooldown - dt);
    const move = new THREE.Vector3(
      (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0),
      0,
      (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0),
    );
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(6.2 * dt);
      player.position.add(move);
      player.position.x = THREE.MathUtils.clamp(player.position.x, -38, 38);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -38, 38);
    }
    positionReportTimer += dt;
    if (positionReportTimer >= 0.5) {
      positionReportTimer = 0;
      reportPlayerPosition();
    }
    const isMoving = move.lengthSq() > 0;
    player.position.y = Math.sin(clock.elapsedTime * (isMoving ? 12 : 4)) * (isMoving ? 0.055 : 0.025);
    player.scale.setScalar(1 + attackPulse * 0.06);
    attackPulse = Math.max(0, attackPulse - dt * 5.5);
    playerHurtPulse = Math.max(0, playerHurtPulse - dt * 3.2);
    cameraShake = Math.max(0, cameraShake - dt * 2.8);

    if (rogueShopOpen) {
      updateHud();
      renderer.render(scene, camera);
      return;
    }

    autoCombat(dt);
    updateQingyuanSwords(dt);

    const look = pointerWorld.clone().sub(player.position);
    if (look.lengthSq() > 0.04) player.rotation.y = Math.atan2(look.x, look.z);

    const nearbyNode = nearestSearchNode();
    let searchingNode: SearchNode | null = null;
    for (const node of searchNodes) {
      if (node.progress <= 0 || node.searched) continue;
      const stillNear = node.mesh.position.distanceTo(player.position) < 2.4;
      const isMovingNow = move.lengthSq() > 0;
      if (!stillNear || isMovingNow || playerHurtPulse > 0.2) {
        node.progress = 0;
        addFloatingText("搜索中断", player.position, "#ffb4b4");
        continue;
      }
      node.progress += dt;
      searchingNode = node;
      attractEnemies(node.mesh.position, node.kind === "sealed_chest" ? 26 : 18, 3);
      if (node.progress >= node.duration) completeSearch(node);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      enemy.hitCooldown = Math.max(0, enemy.hitCooldown - dt);
      enemy.alertTime = Math.max(0, enemy.alertTime - dt);
      if (enemy.alertTime <= 0) enemy.alertTarget = null;
      enemy.flash = Math.max(0, enemy.flash - dt * 4);
      enemy.mesh.position.y = Math.sin(clock.elapsedTime * (enemy.elite ? 5 : 6) + i) * 0.035;
      enemy.mesh.scale.setScalar(1 + enemy.flash * 0.08);
      enemy.hpBar.visible = enemy.hp < enemy.maxHp;
      enemy.hpBar.position.copy(enemy.mesh.position);
      enemy.hpBar.position.y += enemy.elite ? 2.25 : 1.75;
      enemy.hpBar.lookAt(camera.position);
      const hpFill = enemy.hpBar.getObjectByName("hp_fill");
      if (hpFill) {
        hpFill.scale.x = Math.max(0.04, enemy.hp / enemy.maxHp);
        hpFill.position.x = -0.52 * (1 - hpFill.scale.x);
      }
      if (enemy.hp <= 0) {
        addEffect(createHitBurst(enemy.mesh.position, true));
        if (isSoloRaid()) {
          const stoneValue = enemy.elite ? 70 + Math.floor(Math.random() * 31) : 22 + Math.floor(Math.random() * 14);
          const expValue = enemy.elite ? 18 : 8;
          spawnSpiritStoneLoot(enemy.mesh.position, stoneValue);
          addSoloExperience(expValue, enemy.mesh.position);
          addFloatingText(`灵石 +${stoneValue}`, enemy.mesh.position, "#ffd166");
        } else if (enemy.sourceId) {
          addFloatingText("掉落", enemy.mesh.position, "#ffd166");
          logRaidEvent("enemy_killed", { source: "enemy", sourceId: enemy.sourceId, elite: enemy.elite, deathX: enemy.mesh.position.x, deathZ: enemy.mesh.position.z });
          if (Math.random() < 0.75) spawnLoot(enemy.mesh.position, rollLoot("enemy", enemy.sourceId));
        }
        scene.remove(enemy.mesh);
        scene.remove(enemy.hpBar);
        enemies.splice(i, 1);
        continue;
      }
      const toPlayer = player.position.clone().sub(enemy.mesh.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();
      const lateRaidBonus = runTime > RAID_DURATION * 0.5 ? 7 : 0;
      const searchBonus = searchingNode ? 6 : 0;
      const aggroRange = (runTime < 8 ? 8 : 18) + lateRaidBonus + searchBonus;
      const alertVector = enemy.alertTarget ? enemy.alertTarget.clone().sub(enemy.mesh.position) : null;
      if (distance < aggroRange) {
        enemy.alertTarget = null;
        enemy.mesh.position.add(toPlayer.normalize().multiplyScalar(enemy.speed * dt));
        enemy.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      } else if (alertVector && alertVector.length() > 0.8) {
        alertVector.y = 0;
        enemy.mesh.position.add(alertVector.normalize().multiplyScalar(enemy.speed * 0.78 * dt));
        enemy.mesh.rotation.y = Math.atan2(alertVector.x, alertVector.z);
      }
      if (runTime > 5 && distance < 1.15 && enemy.hitCooldown <= 0) {
        const stats = equippedStats();
        playerHp -= Math.max(2, 5 - stats.defense);
        playerHurtPulse = 1;
        addFloatingText(`-${Math.max(2, 5 - stats.defense)}`, player.position, "#ff8f8f");
        enemy.hitCooldown = 0.8;
      }
    }

      for (let i = rivals.length - 1; i >= 0; i--) {
        const rival = rivals[i];
        rival.hitCooldown = Math.max(0, rival.hitCooldown - dt);
        rival.flash = Math.max(0, rival.flash - dt * 4);
        rival.stateReportTimer = Math.max(0, rival.stateReportTimer - dt);
        rival.mesh.position.y = Math.sin(clock.elapsedTime * 7 + i) * 0.045;
      rival.mesh.scale.setScalar(0.94 + rival.flash * 0.09);
      rival.hpBar.visible = rival.hp < rival.maxHp;
      rival.hpBar.position.copy(rival.mesh.position);
      rival.hpBar.position.y += 2.28;
      rival.hpBar.lookAt(camera.position);
      const hpFill = rival.hpBar.getObjectByName("hp_fill");
      if (hpFill) {
        hpFill.scale.x = Math.max(0.04, rival.hp / rival.maxHp);
        hpFill.position.x = -0.52 * (1 - hpFill.scale.x);
      }
      if (rival.hp <= 0) {
        addEffect(createHitBurst(rival.mesh.position, true));
        addFloatingText(`${rival.name} 掉落战利品`, rival.mesh.position, "#ffd166");
        logRaidEvent("rival_killed", { rivalName: rival.name, source: "rival", sourceId: rival.sourceId, lootValue: bagValue(rival.lootBag), lootCount: rival.lootBag.length, deathX: rival.mesh.position.x, deathZ: rival.mesh.position.z });
        rival.lootBag.forEach((item, index) => {
          const angle = (index / Math.max(1, rival.lootBag.length)) * Math.PI * 2;
          spawnLoot(rival.mesh.position.clone().add(new THREE.Vector3(Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9)), item);
        });
        scene.remove(rival.mesh);
        scene.remove(rival.hpBar);
        rivals.splice(i, 1);
        continue;
      }

      const toPlayer = player.position.clone().sub(rival.mesh.position);
      toPlayer.y = 0;
      const distance = toPlayer.length();
      const carriedValue = bagValue(rival.lootBag);
      rival.decisionTimer -= dt;
      if (rival.decisionTimer <= 0) {
        rival.decisionTimer = 0.45 + Math.random() * 0.45;
        const bestDrop = findBestLooseLoot(rival.mesh.position, 26);
        const playerLooksRich = carriedLootValue() + spiritStoneValue() >= 140;
        if (rival.hp < rival.maxHp * 0.38 || carriedValue >= 300 || runTime > RAID_DURATION * 0.72) {
          rival.state = "extract";
          rival.goal.copy(extraction.position);
        } else if (distance < 17 && playerLooksRich) {
          rival.state = "hunt";
          rival.goal.copy(player.position);
        } else if (bestDrop) {
          rival.state = "loot";
          rival.goal.copy(bestDrop.mesh.position);
        } else if (rival.goal.distanceTo(rival.mesh.position) < 1.8) {
          rival.state = "loot";
          rival.goal.copy(randomRaidPoint());
        }
      }

      for (let dropIndex = lootDrops.length - 1; dropIndex >= 0; dropIndex--) {
        const drop = lootDrops[dropIndex];
        if (drop.mesh.position.distanceTo(rival.mesh.position) > 1.05) continue;
        rival.lootBag.push(drop.item);
        scene.remove(drop.mesh);
        scene.remove(drop.beacon);
        lootDrops.splice(dropIndex, 1);
        addFloatingText(`敌修拾取 ${drop.item.value}`, rival.mesh.position, "#ffcf91");
        if (bagValue(rival.lootBag) >= 260) {
          rival.state = "extract";
          rival.goal.copy(extraction.position);
        }
        break;
      }

      if (rival.state === "hunt") {
        rival.goal.copy(player.position);
      }
      const toGoal = rival.goal.clone().sub(rival.mesh.position);
      toGoal.y = 0;
      if (toGoal.length() > 0.35) {
        const speedScale = rival.state === "extract" ? 1.12 : rival.state === "hunt" ? 1 : 0.82;
        rival.mesh.position.add(toGoal.normalize().multiplyScalar(rival.speed * speedScale * dt));
        rival.mesh.rotation.y = Math.atan2(toGoal.x, toGoal.z);
      }
      if (runTime > 4 && distance < 1.35 && rival.hitCooldown <= 0) {
        const stats = equippedStats();
        const damage = Math.max(5, 12 - stats.defense);
        playerHp -= damage;
        playerHurtPulse = 1;
        logRaidEvent("player_hit", { source: rival.name, damage, hp: playerHp, runTime });
        addFloatingText(`-${damage}`, player.position, "#ff8f8f");
        rival.hitCooldown = 1.05;
      }
        if (rival.state === "extract" && rival.mesh.position.distanceTo(extraction.position) < 2.3) {
          rival.extractProgress += dt / 2.6;
          extraction.rotation.y += dt * 3.2;
        if (rival.extractProgress >= 1) {
          addEffect(createPickupBeam(rival.mesh.position, 0x9de8ff));
          addFloatingText(`${rival.name} 撤离 ${carriedValue}`, rival.mesh.position, "#9de8ff");
          logRaidEvent("rival_extracted", { rivalName: rival.name, lootValue: carriedValue, lootCount: rival.lootBag.length });
          scene.remove(rival.mesh);
          scene.remove(rival.hpBar);
          rivals.splice(i, 1);
          continue;
        }
        } else {
          rival.extractProgress = Math.max(0, rival.extractProgress - dt * 0.65);
        }
        if (rival.stateReportTimer <= 0) {
          rival.stateReportTimer = 1.0 + Math.random() * 0.35;
          reportRivalState(rival);
        }
      }

    for (const remote of Array.from(remotePlayers.values())) {
      const previous = remote.mesh.position.clone();
      remote.mesh.position.lerp(remote.target, Math.min(1, dt * 8));
      remote.mesh.position.y = Math.sin(clock.elapsedTime * 6 + remote.peerId.length) * 0.035;
      remote.flash = Math.max(0, remote.flash - dt * 4);
      remote.mesh.scale.setScalar((remote.down ? 0.68 : 0.88) + remote.flash * 0.08);
      const movement = remote.mesh.position.clone().sub(previous);
      movement.y = 0;
      if (remote.down) {
        remote.mesh.rotation.z = THREE.MathUtils.lerp(remote.mesh.rotation.z, 1.18, Math.min(1, dt * 6));
      } else {
        remote.mesh.rotation.z = THREE.MathUtils.lerp(remote.mesh.rotation.z, 0, Math.min(1, dt * 8));
        if (movement.lengthSq() > 0.0001) remote.mesh.rotation.y = Math.atan2(movement.x, movement.z);
      }
      remote.hpBar.visible = remote.hp < remote.maxHp || remote.down;
      remote.hpBar.position.copy(remote.mesh.position);
      remote.hpBar.position.y += 2.2;
      remote.hpBar.lookAt(camera.position);
      const hpFill = remote.hpBar.getObjectByName("hp_fill");
      if (hpFill) {
        hpFill.scale.x = Math.max(0.04, remote.hp / remote.maxHp);
        hpFill.position.x = -0.52 * (1 - hpFill.scale.x);
      }
      if (clock.elapsedTime - remote.lastSeen > 8) removeRemotePlayer(remote.peerId);
    }

    for (let i = lootDrops.length - 1; i >= 0; i--) {
      const drop = lootDrops[i];
      drop.mesh.rotation.y += dt * 2.4;
      drop.mesh.position.y = 0.48 + Math.sin(clock.elapsedTime * 3 + i) * 0.08;
      drop.beacon.rotation.y += dt * 0.8;
      drop.beacon.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4 + i) * 0.035);
      if (drop.mesh.position.distanceTo(player.position) < 1.25) {
        const isCurrency = isSpiritStoneLoot(drop.item);
        if (!isCurrency && !canTakeLoot()) {
          addFloatingText("乾坤袋已满", player.position, "#ffcf91");
          continue;
        }
        if (isCurrency) spiritStoneLoot.push(drop.item);
        else inventory.push(drop.item);
        addEffect(createPickupBeam(drop.mesh.position, drop.item.kind === "秘宝" ? 0xffd166 : 0xbfffd0));
        addFloatingText(isCurrency ? `灵石 +${drop.item.value}` : `+${drop.item.value}`, drop.mesh.position, "#bfffd0");
        logRaidEvent("loot_picked", { itemName: drop.item.name, kind: drop.item.kind, value: drop.item.value, rarity: drop.item.rarity, claimToken: drop.item.claimToken ?? "", source: drop.item.source ?? "", sourceId: drop.item.sourceId ?? "", playerX: player.position.x, playerZ: player.position.z });
        scene.remove(drop.mesh);
        scene.remove(drop.beacon);
        lootDrops.splice(i, 1);
      }
    }

    if (searchingNode) {
      setSearchPanel(`<b>搜索中</b><span>${searchNodeName(searchingNode.kind)} ${Math.floor((searchingNode.progress / searchingNode.duration) * 100)}%</span>`, true);
    } else if (nearbyNode) {
      setSearchPanel(`<b>${searchNodeName(nearbyNode.kind)}</b><span>按 E 搜索</span><button data-search-action="start">搜索</button>`, true);
    } else {
      setSearchPanel("", false);
    }
    threatWarningTime = Math.max(0, threatWarningTime - dt);

    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.age += dt;
      const t = Math.min(1, effect.age / effect.duration);
      effect.update(dt, t);
      if (effect.age >= effect.duration) {
        scene.remove(effect.object);
        effects.splice(i, 1);
      }
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const el = floatingTexts[i];
      const life = Number(el.dataset.life ?? "0") + dt;
      el.dataset.life = `${life}`;
      const world = new THREE.Vector3(Number(el.dataset.x), Number(el.dataset.y) + life * 1.4, Number(el.dataset.z));
      world.project(camera);
      el.style.left = `${(world.x * 0.5 + 0.5) * window.innerWidth}px`;
      el.style.top = `${(-world.y * 0.5 + 0.5) * window.innerHeight}px`;
      el.style.opacity = `${Math.max(0, 1 - life / 0.9)}`;
      el.style.transform = `translate(-50%, -50%) scale(${1 + life * 0.18})`;
      if (life > 0.9) {
        el.remove();
        floatingTexts.splice(i, 1);
      }
    }

    extraction.rotation.y += dt * 0.9;
    extraction.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.025 + extractionProgress * 0.12);
    const extractionDistance = player.position.distanceTo(extraction.position);
    const nearExtraction = player.position.distanceTo(extraction.position) < 2.4;
    const extractingRival = rivals.find((rival) => rival.state === "extract" && bagValue(rival.lootBag) >= 160);
    if (nearExtraction && hasCarriedSettlementLoot()) {
      if (!extractionStartedReported && extractionProgress <= 0.01) {
        reportPlayerPosition();
        logRaidEvent("extraction_started", {
          playerX: player.position.x,
          playerZ: player.position.z,
          clientTime: performance.now(),
          runTime,
        });
        extractionStartedReported = true;
      }
      extractionProgress += dt / 3;
      promptEl.textContent = "保持在传送阵内完成撤离。受到追击时可以先离开再回来。";
      if (extractionProgress >= 1) endGame(true);
    } else {
      extractionProgress = Math.max(0, extractionProgress - dt * 0.8);
      if (extractionProgress <= 0) extractionStartedReported = false;
      promptEl.textContent =
        threatWarningTime > 0
          ? `${threatWarning}。撤离阵约 ${Math.floor(extractionDistance)}m。`
          : extractingRival
            ? `${extractingRival.name} 正带宝前往撤离阵，约 ${Math.floor(extractingRival.mesh.position.distanceTo(extraction.position))}m。`
          : !canTakeLoot()
            ? `乾坤袋已满 ${inventory.length}/${BAG_SLOT_LIMIT}，丢弃低价值物或前往撤离阵 ${Math.floor(extractionDistance)}m。`
          : hasCarriedSettlementLoot()
            ? `已有战利品和 ${spiritStoneValue()} 灵石，撤离阵约 ${Math.floor(extractionDistance)}m。继续贪，还是撤？`
            : nearbyNode
              ? `靠近${searchNodeName(nearbyNode.kind)}，按 E 搜索。撤离阵约 ${Math.floor(extractionDistance)}m。`
              : `移动走位，附近敌人会自动吃青元剑芒${hasSkill("thunder_seal") ? "、掌心雷" : ""}${hasSkill("binding_array") ? "、小五行困阵" : ""}${hasSkill("dash") ? "，空格可手动流云步" : ""}。撤离阵约 ${Math.floor(extractionDistance)}m。`;
    }

    if (playerHp <= 0) endGame(false);
    if (runTime >= RAID_DURATION) endGame(isSoloRaid());

    const shakeOffset = cameraShake > 0 ? new THREE.Vector3((Math.random() - 0.5) * cameraShake, (Math.random() - 0.5) * cameraShake * 0.45, (Math.random() - 0.5) * cameraShake) : new THREE.Vector3();
    camera.position.lerp(new THREE.Vector3(player.position.x, 17, player.position.z + 19).add(shakeOffset), 0.08);
    camera.lookAt(player.position.x, 0, player.position.z);
  } else if (!activeRaid && !gameOver) {
    promptEl.textContent = account ? "在洞府保存装备与技能配置后，进入青岚遗迹。" : "请先注册或登录。";
    setSearchPanel("", false);
    extraction.rotation.y += dt * 0.35;
    lootDrops.forEach((drop, i) => {
      drop.mesh.rotation.y += dt * 1.1;
      drop.mesh.position.y = 0.48 + Math.sin(clock.elapsedTime * 2 + i) * 0.06;
    });
  }

  updateHud();
  renderer.render(scene, camera);
}

updateHud();
void bootstrapAccount();
animate();
