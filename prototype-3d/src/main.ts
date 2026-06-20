import * as THREE from "three";
import "./style.css";
import { createSwordCultivator, createCorpsePuppet, createScrollPickup } from "./models";
import {
  createQingyuanHitBurst,
  createThunderStrike,
  createBindingField,
  createPickupBeam,
  createSlashEffect,
  type Effect,
} from "./effects";
import { createSkillPreview, type SkillPreview } from "./preview";
import { TUNING } from "./tuning";
import { treasureDetailHtml, codexListHtml } from "./codex-html";
import { initAudio, toggleMute, isMuted, sfxCast, sfxHit, sfxKill, sfxHurt, sfxLevelUp, sfxClick } from "./sfx";
import { treasureIconSvg } from "./icons";
import {
  RARITY_COLOR,
  RARITY_LABEL,
  TAG_COLOR,
  modText,
  treasureText,
  computeBuild,
  synergyText,
  synergyStatus,
  TREASURES,
  rollTreasures,
  rollArts,
  instantiate,
  starterTreasure,
  starAttack,
  starCd,
  starMark,
  treasureStar,
  treasureCost,
  artCost,
  sellValue,
  MAX_STAR,
  type Treasure,
  type Art,
  type Stats,
  type Flags,
  type Rarity,
  type TreasureTraits,
} from "./upgrades";

// ============================================================
// 修仙幸存者 · 仙劫（吸血鬼幸存者范式 · 纯单机）
// 法宝=自动武器（各有攻击/CD/技能形态）；功法=被动；羁绊=流派特性
// 数值集中在 ./tuning.ts；法宝图鉴 HTML 在 ./codex-html.ts
// ============================================================

const BASE_MOVE_SPEED = TUNING.moveSpeed;

// ---------- 渲染 ----------
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

const SMALL_SCREEN = Math.min(window.innerWidth, window.innerHeight) < 820; // 近似判断手机
const renderer = new THREE.WebGLRenderer({ antialias: !SMALL_SCREEN, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, SMALL_SCREEN ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// 低端/手机端关闭动态阴影：百只投影怪的 shadow pass 约等于多渲一遍全场景，是移动端最大开销之一
renderer.shadowMap.enabled = !SMALL_SCREEN;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070d0b);
scene.fog = new THREE.Fog(0x070d0b, 32, 78);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 160);
const CAM_OFFSET = new THREE.Vector3(0, 19, 17);

const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
sun.position.set(-12, 26, 10);
sun.castShadow = !SMALL_SCREEN;
sun.shadow.mapSize.set(SMALL_SCREEN ? 1024 : 1536, SMALL_SCREEN ? 1024 : 1536);
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42; sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x9ed5ff, 0x223a2c, 1.2));
const rimLight = new THREE.DirectionalLight(0x6fffb0, 0.5);
rimLight.position.set(8, 6, -12);
scene.add(rimLight);

// ---------- 无限地面：区块随主角自动生成/删减（取代固定地图与建筑） ----------
const CHUNK = 40;        // 区块边长（单位）
const CHUNK_VIEW = 2;    // 主角周围保留半径（区块）→ 常驻 5×5=25 块，看不到边界
const CHUNK_GEO = new THREE.PlaneGeometry(CHUNK, CHUNK);
const CHUNK_MAT = new THREE.MeshStandardMaterial({ color: 0x1f2e26, roughness: 0.96 });
const chunkPool: THREE.Object3D[] = [];                 // 删减后的区块回池复用，避免反复 new
const activeChunks = new Map<string, THREE.Object3D>();
function makeChunk(): THREE.Object3D {
  const g = new THREE.Group();
  const plane = new THREE.Mesh(CHUNK_GEO, CHUNK_MAT); // 共享几何体/材质
  plane.rotation.x = -Math.PI / 2; plane.receiveShadow = true; g.add(plane);
  const grid = new THREE.GridHelper(CHUNK, 10, 0x4f6a56, 0x2c3a31);
  grid.position.y = 0.015;
  const gm = grid.material as THREE.Material; gm.opacity = 0.5; gm.transparent = true;
  g.add(grid);
  return g;
}
let chunkCX = NaN, chunkCZ = NaN;
function updateChunks(force = false) {
  const pcx = Math.round(player.position.x / CHUNK), pcz = Math.round(player.position.z / CHUNK);
  if (!force && pcx === chunkCX && pcz === chunkCZ) return; // 未跨区块边界则零开销
  chunkCX = pcx; chunkCZ = pcz;
  for (const [key, obj] of activeChunks) { // 删减：超出视野半径的区块回池
    if (Math.abs(obj.userData.cx - pcx) > CHUNK_VIEW || Math.abs(obj.userData.cz - pcz) > CHUNK_VIEW) {
      scene.remove(obj); chunkPool.push(obj); activeChunks.delete(key);
    }
  }
  for (let dz = -CHUNK_VIEW; dz <= CHUNK_VIEW; dz++) for (let dx = -CHUNK_VIEW; dx <= CHUNK_VIEW; dx++) {
    const cx = pcx + dx, cz = pcz + dz, key = cx + "," + cz; // 生成：缺失区块从池取/新建
    if (activeChunks.has(key)) continue;
    const obj = chunkPool.pop() ?? makeChunk();
    obj.userData.cx = cx; obj.userData.cz = cz;
    obj.position.set(cx * CHUNK, 0, cz * CHUNK);
    scene.add(obj); activeChunks.set(key, obj);
  }
}

const player = createSwordCultivator();
scene.add(player);
updateChunks(true); // 开局先在原点周围铺好地面

// ---------- 类型 ----------
type Enemy = { mesh: THREE.Object3D; hp: number; maxHp: number; speed: number; radius: number; touch: number; touchDmg: number; flash: number; slow: number; elite: boolean; boss: boolean; xp: number; knockX: number; knockZ: number; burnT: number; burnDps: number; dead: boolean };
type Gem = { mesh: THREE.Object3D; value: number; pulled: boolean; kind: "xp" | "stone" };
type ProjKind = "straight" | "homing" | "orbit" | "glaive";
type Projectile = {
  mesh: THREE.Object3D; kind: ProjKind; base: number; life: number; hit: Set<Enemy>; pierce: boolean;
  dir?: THREE.Vector3; speed?: number; angle?: number; radius?: number; ang?: number; lastHit?: Map<Enemy, number>;
  center?: THREE.Vector3; perp?: THREE.Vector3; // glaive：圆弧轨迹的发射点与侧向
  owner?: number; // orbit：所属法宝 uid，用于重生前清理旧环刃
  fission?: number; // homing：剩余可裂变代数（妖系），击杀后裂出子弹
  star?: number;    // homing：星级（裂变子代沿用其外观）
  spin?: number;    // orbit/旋刃：自身旋转角速度（rad/s），刀系旋刃用
  traits?: TreasureTraits; // 命中时生效的行为层特性（减速/灼烧/吸附等）
};
type Scroll = { mesh: THREE.Object3D; bob: number };
type FloorItem = { mesh: THREE.Object3D; kind: "heal" | "magnet" | "bomb"; bob: number };
type Floater = { el: HTMLDivElement; pos: THREE.Vector3; age: number; life: number };
type Sigil = { pos: THREE.Vector3; radius: number; base: number; tick: number; life: number; owner?: number; traits?: TreasureTraits };

const enemies: Enemy[] = [];
const gems: Gem[] = [];
const projectiles: Projectile[] = [];
const scrolls: Scroll[] = [];
const floorItems: FloorItem[] = [];
const effects: Effect[] = [];
const floaters: Floater[] = [];
const sigils: Sigil[] = []; // 符阵：远程定点停留法阵

// ---------- 状态 ----------
let equippedTreasures: Treasure[] = [];
let treasureBag: Treasure[] = [];
let arts: Art[] = [];
let build = computeBuild(equippedTreasures, arts);
let stats: Stats = build.stats;
let flags: Flags = build.flags;
let spiritStones = 0;
let spiritPower = 0; // 累计吸收的灵力（积分·跨等级不清零，用于日后排名：吸收越多越强）

let marketOpen = false, artShopOpen = false, synergyOpen = false, codexOpen = false;
let marketOffers: Treasure[] = [];
let artShopOffers: Art[] = [];
let pendingEquip: Treasure | null = null;

let playerHp = TUNING.player.baseMaxHp;
let maxHp = TUNING.player.baseMaxHp;
let level = 1, exp = 0, expToNext = TUNING.xp.firstLevel, kills = 0, runTime = 0;
let running = false, gameOver = false;
let spawnTimer = 0, bossTimer = 0, bossesDefeated = 0, invuln = 0, cameraShake = 0;
let stormSwordT = 0, stormThunderT = 0, shieldT = 0, shieldReady = false, quakeT = 0;

const keys = new Set<string>();
const moveVec = new THREE.Vector2();
function isPaused() { return marketOpen || artShopOpen || codexOpen; }

// ---------- HUD ----------
const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML = `
  <div class="topbar">
    <div class="hpwrap"><div class="hpbar"><div class="hpfill" id="hpfill"></div></div><span id="hptext">100/100</span></div>
    <div class="stat"><b>境界</b><span id="lv">1</span></div>
    <div class="stat stat-power"><b>灵力</b><span id="power">0</span></div>
    <div class="stat"><b>灵石</b><span id="stones">0</span></div>
    <div class="stat"><b>击杀</b><span id="kills">0</span></div>
    <div class="stat"><b>时间</b><span id="time">00:00</span></div>
  </div>
  <div class="xpbar"><div class="xpfill" id="xpfill"></div></div>
  <div class="synergy" id="synergy"></div>
  <div class="arts-strip" id="artsStrip"></div>

  <div class="overlay" id="startScreen">
    <div class="card">
      <h1>仙劫 · 幸存</h1>
      <p>万妖来袭，以剑御之。移动走位，<b>法宝自动施法</b>。<br/>每件法宝是一种武器，凑齐标签触发流派羁绊；功法打怪掉落。</p>
      <p class="hint">电脑：WASD / 方向键移动　手机：左下虚拟摇杆</p>
      <button id="startBtn">开始历练</button>
      <button id="codexBtn" class="ghost">法宝图鉴</button>
    </div>
  </div>

  <div class="overlay shop" id="codexScreen">
    <div class="shop-box">
      <div class="shop-head"><div class="shop-title">法宝图鉴</div><div class="shop-stones">共 <b id="codexTotal">0</b> 件</div></div>
      <div class="section-label">按品阶排列 · <span class="dim">点击法宝查看详情 · 同名同星 ×3 自动升星（★3 封顶）</span></div>
      <div class="codex-body" id="codexList"></div>
      <div class="shop-actions"><button id="codexCloseBtn" class="primary">返回</button></div>
    </div>
  </div>

  <div class="overlay codex-detail-overlay" id="codexDetailScreen">
    <div class="codex-detail-box" id="codexDetail">
      <button class="cd-close" id="cdCloseBtn" title="关闭">✕</button>
      <div class="cd-preview" id="cdPreview"></div>
      <div class="cd-body" id="cdBody"></div>
    </div>
  </div>

  <div class="overlay shop" id="marketScreen">
    <div class="shop-box">
      <div class="shop-head">
        <div class="shop-title">境界突破 · <span id="marketLv">2</span> 重 · 洞府市集</div>
        <div class="shop-stones">灵石 <b id="marketStones">0</b></div>
      </div>
      <div class="shop-swaphint" id="swapHint"></div>
      <div class="section-label">法宝市集 <span class="dim">每件法宝=自动武器，满10件入背包</span></div>
      <div class="shop-offers" id="marketOffers"></div>
      <div class="section-label">法宝栏 <span id="equipCount">0</span>/${TUNING.maxTreasures} <span class="dim">· 点击卸下</span> · 羁绊 <span id="equipSynergy"></span></div>
      <div class="shop-slots" id="equipSlots"></div>
      <div class="section-label">法宝背包 <span class="dim">· 点击装备</span></div>
      <div class="bag-list" id="bagList"></div>
      <div class="synergy-panel" id="synergyPanel"></div>
      <div class="shop-actions">
        <button id="synergyBtn">查看羁绊</button>
        <button id="rerollBtn">刷新 <kbd class="keycap">D</kbd> · ${TUNING.market.rerollCost}灵石</button>
        <button id="continueBtn" class="primary">继续历练</button>
      </div>
    </div>
  </div>

  <div class="overlay shop" id="artShopScreen">
    <div class="shop-box">
      <div class="shop-head"><div class="shop-title">功法商店 · 残卷现世</div><div class="shop-stones">灵石 <b id="artStones">0</b></div></div>
      <div class="section-label">功法（被动·可叠加）</div>
      <div class="shop-offers" id="artOffers"></div>
      <div class="shop-actions"><button id="artLeaveBtn" class="primary">离开</button></div>
    </div>
  </div>

  <div class="overlay" id="overScreen">
    <div class="card"><h1 id="overTitle">道消身陨</h1><p id="overBody"></p><button id="restartBtn">再来一世</button></div>
  </div>

  <div class="treasure-bar" id="treasureBar"></div>
  <button class="codex-fab" id="codexFab" title="法宝图鉴">图鉴</button>
  <button class="rec-fab" id="recFab" title="录制游玩视频（webm）">● 录制</button>
  <button class="mute-fab" id="muteFab" title="音效开关">🔊</button>
  <div class="joystick" id="joystick"><div class="stick" id="stick"></div></div>
`;
app.appendChild(hud);

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}
const hpFill = byId<HTMLDivElement>("hpfill");
const hpText = byId<HTMLSpanElement>("hptext");
const lvEl = byId<HTMLSpanElement>("lv");
const powerEl = byId<HTMLSpanElement>("power");
const stonesEl = byId<HTMLSpanElement>("stones");
const killsEl = byId<HTMLSpanElement>("kills");
const timeEl = byId<HTMLSpanElement>("time");
const xpFill = byId<HTMLDivElement>("xpfill");
const synergyEl = byId<HTMLDivElement>("synergy");
const artsStripEl = byId<HTMLDivElement>("artsStrip");
const startScreen = byId<HTMLDivElement>("startScreen");
const overScreen = byId<HTMLDivElement>("overScreen");
const overTitle = byId<HTMLHeadingElement>("overTitle");
const overBody = byId<HTMLParagraphElement>("overBody");
const joystick = byId<HTMLDivElement>("joystick");
const stick = byId<HTMLDivElement>("stick");
const marketScreen = byId<HTMLDivElement>("marketScreen");
const marketLvEl = byId<HTMLSpanElement>("marketLv");
const marketStonesEl = byId<HTMLElement>("marketStones");
const swapHintEl = byId<HTMLDivElement>("swapHint");
const marketOffersEl = byId<HTMLDivElement>("marketOffers");
const equipSlotsEl = byId<HTMLDivElement>("equipSlots");
const equipCountEl = byId<HTMLSpanElement>("equipCount");
const equipSynergyEl = byId<HTMLSpanElement>("equipSynergy");
const bagListEl = byId<HTMLDivElement>("bagList");
const synergyPanelEl = byId<HTMLDivElement>("synergyPanel");
const artShopScreen = byId<HTMLDivElement>("artShopScreen");
const artStonesEl = byId<HTMLElement>("artStones");
const artOffersEl = byId<HTMLDivElement>("artOffers");
const treasureBarEl = byId<HTMLDivElement>("treasureBar");
const codexScreen = byId<HTMLDivElement>("codexScreen");
const codexListEl = byId<HTMLDivElement>("codexList");
const codexTotalEl = byId<HTMLElement>("codexTotal");
const codexDetailScreen = byId<HTMLDivElement>("codexDetailScreen");
const codexDetailEl = byId<HTMLDivElement>("codexDetail");
const cdBody = byId<HTMLDivElement>("cdBody");
const cdPreview = byId<HTMLDivElement>("cdPreview");
let skillPreview: SkillPreview | null = null;

byId<HTMLButtonElement>("startBtn").addEventListener("click", startRun);
byId<HTMLButtonElement>("restartBtn").addEventListener("click", startRun);
byId<HTMLButtonElement>("codexBtn").addEventListener("click", openCodex);
byId<HTMLButtonElement>("codexFab").addEventListener("click", openCodex);
byId<HTMLButtonElement>("codexCloseBtn").addEventListener("click", closeCodex);

// ---------- 游玩录制（标签页捕获 → 可下载 webm，含完整 HUD，用于宣传素材） ----------
const recFab = byId<HTMLButtonElement>("recFab");
let mediaRecorder: MediaRecorder | null = null;
let recStream: MediaStream | null = null;
let recChunks: Blob[] = [];
function setRecBtn(on: boolean) { recFab.textContent = on ? "■ 停止" : "● 录制"; recFab.classList.toggle("recording", on); }
function stopRecStream() { if (recStream) { recStream.getTracks().forEach((t) => t.stop()); recStream = null; } }
async function toggleRecord() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") { mediaRecorder.stop(); return; }
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== "function" || typeof MediaRecorder === "undefined") { warn("当前浏览器不支持录制"); return; }
  let stream: MediaStream;
  // preferCurrentTab 为 Chromium 非标准项：让录制默认锁定本标签页，免去手动挑窗口
  const displayOpts = { video: { frameRate: 60 }, audio: false, preferCurrentTab: true } as unknown as DisplayMediaStreamOptions;
  try {
    stream = await md.getDisplayMedia(displayOpts);
  } catch { warn("已取消录制"); return; }
  recStream = stream;
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  try {
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
  } catch { warn("录制初始化失败"); stopRecStream(); mediaRecorder = null; return; }
  recChunks = [];
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `xianjie-gameplay-${Date.now()}.webm`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    stopRecStream(); setRecBtn(false); warn("录像已保存（webm）");
  };
  // 用户在浏览器自带的"停止共享"条上结束时，同步收尾
  stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop(); });
  mediaRecorder.start();
  setRecBtn(true); warn("开始录制 · 请选「本标签页」");
}
recFab.addEventListener("click", () => { void toggleRecord(); });
// 音效：任意按钮按下即出“点击声”，并借此用户手势初始化音频上下文（浏览器要求手势后才能发声）
const muteFab = byId<HTMLButtonElement>("muteFab");
muteFab.textContent = isMuted() ? "🔇" : "🔊";
document.addEventListener("pointerdown", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  initAudio();
  if (btn !== muteFab) sfxClick(); // 静音键本身不发声，避免与切换冲突
}, true);
muteFab.addEventListener("click", () => { muteFab.textContent = toggleMute() ? "🔇" : "🔊"; });
byId<HTMLButtonElement>("rerollBtn").addEventListener("click", rerollMarket);
byId<HTMLButtonElement>("continueBtn").addEventListener("click", closeMarket);
byId<HTMLButtonElement>("synergyBtn").addEventListener("click", toggleSynergy);
byId<HTMLButtonElement>("artLeaveBtn").addEventListener("click", closeArtShop);
swapHintEl.addEventListener("click", () => { if (pendingEquip) { pendingEquip = null; renderMarket(); } });
// 图鉴：点击法宝卡 → 详情弹层（事件委托，卡片由 innerHTML 重建）
// 图鉴交互：单击法宝卡直接进详情（手机无悬停，逻辑越简单越好）
codexListEl.addEventListener("click", (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>(".codex-card[data-tid]");
  const id = card?.dataset.tid;
  if (!id) return;
  const t = TREASURES.find((x) => x.id === id);
  if (t) openTreasureDetail(t);
});
codexDetailScreen.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target === codexDetailScreen || target.closest(".cd-close")) closeTreasureDetail();
});

// ---------- 输入 ----------
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  // 市集中按 D 刷新法宝（仅首次按下，长按不连刷）
  if (marketOpen && k === "d" && !e.repeat) { e.preventDefault(); rerollMarket(); }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

let joyId: number | null = null;
const joyCenter = new THREE.Vector2();
// 触屏设备：摇杆在左下常驻可见（CSS 主位），按下时浮动跟随手指，松手归位
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
function joyHome() { joystick.style.left = ""; joystick.style.top = ""; } // 清掉内联定位 → 回到 CSS 常驻主位
function joyStart(x: number, y: number, id: number) {
  joyId = id; joyCenter.set(x, y);
  const half = (joystick.offsetWidth || 120) / 2; // 让摇杆中心对准手指（尺寸随屏幕变化）
  joystick.style.left = `${x - half}px`; joystick.style.top = `${y - half}px`; joystick.classList.add("active");
}
function joyMove(x: number, y: number) {
  const dx = x - joyCenter.x, dy = y - joyCenter.y, len = Math.hypot(dx, dy), max = 52, cl = Math.min(len, max);
  const nx = len > 0 ? dx / len : 0, ny = len > 0 ? dy / len : 0;
  stick.style.transform = `translate(${nx * cl}px, ${ny * cl}px)`;
  moveVec.set(nx * (cl / max), ny * (cl / max));
}
function joyEnd() {
  joyId = null; moveVec.set(0, 0); stick.style.transform = "translate(0,0)"; joystick.classList.remove("active");
  if (isTouch) joyHome(); // 触屏：松手后摇杆回到左下常驻位（不隐藏）
}
renderer.domElement.addEventListener("touchstart", (e) => { if (!running || isPaused()) return; const t = e.changedTouches[0]; joyStart(t.clientX, t.clientY, t.identifier); }, { passive: true });
renderer.domElement.addEventListener("touchmove", (e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === joyId) joyMove(t.clientX, t.clientY); }, { passive: true });
renderer.domElement.addEventListener("touchend", (e) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === joyId) joyEnd(); }, { passive: true });

// ---------- 启动 / 重置 ----------
function startRun() {
  for (const e of enemies) releaseEnemyMesh(e.mesh, e.elite); // 回池复用，勿 dispose（共享几何体/材质）
  enemyGrid.clear();
  for (const g of gems) scene.remove(g.mesh); // 共享资源，仅移除
  for (const p of projectiles) scene.remove(p.mesh); // 共享资源，仅移除
  for (const s of scrolls) { scene.remove(s.mesh); disposeObject(s.mesh); }
  for (const it of floorItems) { scene.remove(it.mesh); disposeObject(it.mesh); }
  for (const e of effects) { scene.remove(e.object); disposeObject(e.object); }
  for (const f of floaters) { f.el.style.display = "none"; floaterPool.push(f.el); } // 回池复用，勿 remove
  enemies.length = 0; gems.length = 0; projectiles.length = 0; scrolls.length = 0; floorItems.length = 0; effects.length = 0; floaters.length = 0; sigils.length = 0;

  equippedTreasures = [starterTreasure()]; treasureBag = []; arts = [];
  recompute();
  maxHp = TUNING.player.baseMaxHp; playerHp = maxHp;
  spiritStones = 0; spiritPower = 0;
  marketOpen = false; artShopOpen = false; synergyOpen = false;
  marketOffers = []; artShopOffers = []; pendingEquip = null;
  level = 1; exp = 0; expToNext = TUNING.xp.firstLevel; kills = 0; runTime = 0;
  spawnTimer = 0; bossTimer = 0; bossesDefeated = 0; invuln = 0; cameraShake = 0;
  stormSwordT = 0; stormThunderT = 0; shieldT = 0; shieldReady = false; quakeT = 0;
  gameOver = false; running = true;

  player.position.set(0, 0, 0);
  updateChunks(true); // 回到原点：重铺地面区块
  startScreen.classList.remove("visible"); marketScreen.classList.remove("visible");
  artShopScreen.classList.remove("visible"); overScreen.classList.remove("visible");
  joyEnd(); refreshSynergy(); renderTreasureBar(); renderArtsStrip(); updateHud();
}

function recompute() {
  build = computeBuild(equippedTreasures, arts);
  stats = build.stats; flags = build.flags;
  const newMax = Math.round(TUNING.player.baseMaxHp + stats.maxHp);
  if (newMax > maxHp) playerHp += newMax - maxHp;
  maxHp = newMax; playerHp = Math.min(playerHp, maxHp);
  syncBladeRings(); // 旋刃常驻：装备/构筑变化时按当前刀法宝重建环刃（无 CD，持续旋转）
}

// ---------- 升级 → 市集 ----------
function gainExp(amount: number) {
  const gain = amount * (1 + stats.xpMul);
  exp += gain;
  spiritPower += gain; // 累计灵力（积分）：跨等级不清零
  let leveled = false;
  while (exp >= expToNext) {
    exp -= expToNext; level += 1;
    expToNext = Math.floor(TUNING.xp.expBase + level * TUNING.xp.perLevel + level * level * TUNING.xp.quad);
    leveled = true;
  }
  if (leveled) sfxLevelUp(); // 升级/突破音效
  if (leveled && !marketOpen && !artShopOpen) openMarket();
}
function openMarket() {
  marketOpen = true; pendingEquip = null; synergyOpen = false;
  marketOffers = rollTreasures(level, TUNING.market.offers);
  addEffect(createPickupBeam(player.position, 0xffd166));
  renderMarket(); marketScreen.classList.add("visible");
}
function closeMarket() { marketOpen = false; pendingEquip = null; marketScreen.classList.remove("visible"); }
function rerollMarket() {
  if (spiritStones < TUNING.market.rerollCost) return;
  spiritStones -= TUNING.market.rerollCost;
  marketOffers = rollTreasures(level, TUNING.market.offers);
  pendingEquip = null; renderMarket(); updateHud();
}
function toggleSynergy() { synergyOpen = !synergyOpen; renderMarket(); }

function buyTreasure(index: number) {
  const t = marketOffers[index];
  if (!t || spiritStones < treasureCost(t)) return;
  spiritStones -= treasureCost(t); marketOffers.splice(index, 1);
  if (equippedTreasures.length < TUNING.maxTreasures) equippedTreasures.push(instantiate(t));
  else treasureBag.push(instantiate(t));
  afterChange();
}
function equipFromBag(bagIndex: number) {
  const t = treasureBag[bagIndex];
  if (!t) return;
  if (equippedTreasures.length < TUNING.maxTreasures) { treasureBag.splice(bagIndex, 1); equippedTreasures.push(t); afterChange(); }
  else { pendingEquip = t; renderMarket(); }
}
function unequip(slotIndex: number) {
  const t = equippedTreasures[slotIndex];
  if (!t) return;
  equippedTreasures.splice(slotIndex, 1); treasureBag.push(t); afterChange();
}
function replaceSlot(slotIndex: number) {
  if (!pendingEquip) return;
  const incoming = pendingEquip;
  const bagIdx = treasureBag.indexOf(incoming);
  if (bagIdx < 0) { pendingEquip = null; renderMarket(); return; }
  const outgoing = equippedTreasures[slotIndex];
  treasureBag.splice(bagIdx, 1);
  equippedTreasures[slotIndex] = incoming;
  if (outgoing) treasureBag.push(outgoing);
  pendingEquip = null; afterChange();
}
function sellTreasure(bagIndex: number) {
  const t = treasureBag[bagIndex];
  if (!t) return;
  spiritStones += sellValue(t);
  treasureBag.splice(bagIndex, 1);
  if (pendingEquip && !treasureBag.includes(pendingEquip)) pendingEquip = null;
  afterChange();
}
// 三合一升星：同名同星 ×3 → 高一星 ×1（可级联），仅在商店/换装时调用
function mergeTreasures() {
  for (let guard = 0; guard < 30; guard++) {
    const groups = new Map<string, Treasure[]>();
    for (const t of [...equippedTreasures, ...treasureBag]) {
      const star = t.star ?? 1;
      if (star >= MAX_STAR) continue;
      const key = `${t.id}#${star}`;
      const arr = groups.get(key) ?? [];
      arr.push(t); groups.set(key, arr);
    }
    let did = false;
    for (const arr of groups.values()) {
      if (arr.length < 3) continue;
      const three = arr.slice(0, 3);
      for (const t of three) {
        let idx = equippedTreasures.indexOf(t);
        if (idx >= 0) { equippedTreasures.splice(idx, 1); continue; }
        idx = treasureBag.indexOf(t);
        if (idx >= 0) treasureBag.splice(idx, 1);
      }
      const up = instantiate(three[0]);
      up.star = (three[0].star ?? 1) + 1;
      if (equippedTreasures.length < TUNING.maxTreasures) equippedTreasures.push(up);
      else treasureBag.push(up);
      spawnFloater(`${up.name} 升 ${starMark(up)}`, player.position, "#ffd166", 1.2);
      did = true;
      break; // 数组已变，重新扫描
    }
    if (!did) break;
  }
}

function afterChange() {
  mergeTreasures();
  recompute(); refreshSynergy(); renderTreasureBar(); renderArtsStrip();
  if (marketOpen) renderMarket();
  if (artShopOpen) renderArtShop();
  updateHud();
}
// 顶栏左侧竖排羁绊：每个已激活/在凑的标签一行（彩色芯片，激活高亮），避免被顶栏遮挡
function refreshSynergy() {
  const rows = synergyStatus(equippedTreasures).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  synergyEl.innerHTML = rows.map((s) => {
    const on = s.tiers.some((t) => t.active); // 已达首档=激活
    return `<span class="syn-chip${on ? " on" : ""}" style="--tc:${TAG_COLOR[s.tag]}">${s.tag}${s.count}</span>`;
  }).join("");
}

// ---------- 功法商店 ----------
function openArtShop() { artShopOpen = true; artShopOffers = rollArts(level, TUNING.artShop.offers); renderArtShop(); artShopScreen.classList.add("visible"); }
function closeArtShop() { artShopOpen = false; artShopScreen.classList.remove("visible"); }
function buyArt(index: number) {
  const a = artShopOffers[index];
  if (!a || spiritStones < artCost(a)) return;
  spiritStones -= artCost(a); arts.push(a); artShopOffers.splice(index, 1); afterChange();
}

// ---------- 商店渲染 ----------
function offerCard(name: string, rarity: Treasure["rarity"], tags: string, desc: string, info: string, btnLabel: string, afford: boolean, onBuy: () => void, kind: "treasure" | "art", iconSvg?: string) {
  const card = document.createElement("div");
  card.className = "offer"; card.style.borderColor = RARITY_COLOR[rarity];
  const nameHtml = `<div class="offer-name" style="color:${RARITY_COLOR[rarity]}">${name}</div>`;
  const head = iconSvg ? `<div class="offer-head"><span class="offer-ic">${iconSvg}</span>${nameHtml}</div>` : nameHtml;
  card.innerHTML = `
    <div class="offer-top">
      <span class="offer-kind ${kind === "treasure" ? "k-treasure" : "k-art"}">${kind === "treasure" ? "法宝" : "功法"}</span>
      <span class="offer-rarity" style="color:${RARITY_COLOR[rarity]}">${RARITY_LABEL[rarity]}</span>
    </div>
    ${head}
    <div class="offer-tags">${tags}</div>
    <div class="offer-desc">${desc}</div>
    <div class="offer-mod">${info}</div>
    <button class="offer-buy" ${afford ? "" : "disabled"}>${btnLabel}</button>`;
  card.querySelector<HTMLButtonElement>(".offer-buy")!.addEventListener("click", onBuy);
  return card;
}
function renderMarket() {
  marketLvEl.textContent = String(level);
  marketStonesEl.textContent = String(spiritStones);
  equipCountEl.textContent = String(equippedTreasures.length);
  equipSynergyEl.textContent = synergyText(equippedTreasures);
  swapHintEl.textContent = pendingEquip ? `点上方「法宝栏」中要替换的法宝，以装备「${pendingEquip.name}」，或点此取消` : "";
  swapHintEl.classList.toggle("active", Boolean(pendingEquip));

  marketOffersEl.innerHTML = "";
  marketOffers.forEach((t, i) => {
    const tags = t.tags.map((x) => `<span>${x}</span>`).join("");
    const c = treasureCost(t);
    marketOffersEl.appendChild(offerCard(t.name, t.rarity, tags, t.desc, treasureText(t), `购买 · ${c}灵石`, spiritStones >= c, () => buyTreasure(i), "treasure", treasureIconSvg(t)));
  });

  renderSlots(equipSlotsEl, "equip");

  bagListEl.innerHTML = "";
  if (!treasureBag.length) bagListEl.innerHTML = `<span class="empty-hint">背包为空</span>`;
  else treasureBag.forEach((t, i) => {
    const item = document.createElement("div");
    item.className = "bag-item" + (pendingEquip === t ? " pending" : "");
    item.style.borderColor = RARITY_COLOR[t.rarity];
    item.innerHTML = `<span class="bag-ic">${treasureIconSvg(t)}</span><span class="bag-name" style="color:${RARITY_COLOR[t.rarity]}">${t.name} <span class="bag-star">${starMark(t)}</span></span><span class="bag-tags">${t.tags.join("")}</span><span class="bag-mod">${treasureText(t)}</span><button class="bag-sell" title="出售换灵石">卖 ${sellValue(t)}</button>`;
    item.addEventListener("click", (ev) => { if ((ev.target as HTMLElement).classList.contains("bag-sell")) { sellTreasure(i); return; } equipFromBag(i); });
    bagListEl.appendChild(item);
  });

  if (synergyOpen) renderSynergyPanel();
  synergyPanelEl.classList.toggle("visible", synergyOpen);
}
function renderSynergyPanel() {
  const rows = synergyStatus(equippedTreasures).filter((s) => s.tiers.length).map((s) => {
    const tiers = s.tiers.map((t) => `<span class="syn-tier ${t.active ? "on" : ""}">${t.need}件：${t.desc}</span>`).join("");
    return `<div class="syn-row ${s.count > 0 ? "has" : ""}"><span class="syn-tag">${s.tag}<small>${s.hint}</small></span><span class="syn-count">×${s.count}</span><span class="syn-tiers">${tiers}</span></div>`;
  }).join("");
  synergyPanelEl.innerHTML = `<div class="syn-title">流派羁绊（仅统计已装备法宝 · 同款法宝只计一份）</div>${rows}`;
}
function renderSlots(container: HTMLDivElement, mode: "equip" | "bar") {
  container.innerHTML = "";
  for (let i = 0; i < TUNING.maxTreasures; i++) {
    const t = equippedTreasures[i];
    const slot = document.createElement("div");
    slot.className = "tslot" + (t ? " filled" : "") + (mode === "equip" && pendingEquip ? " swap" : "");
    if (t) {
      slot.style.borderColor = RARITY_COLOR[t.rarity];
      // 底栏法宝额外叠一层冷却遮罩（时钟旋转扫除），由 updateTreasureCooldowns 每帧驱动
      const cdMask = mode === "bar" ? `<i class="tslot-cd"></i>` : "";
      const tagChips = t.tags.map((tag) => `<i style="background:${TAG_COLOR[tag]}">${tag}</i>`).join("");
      slot.innerHTML = `<span class="tslot-ic">${treasureIconSvg(t)}</span>${cdMask}<span class="tslot-star">${starMark(t)}</span><span class="tslot-name" style="color:${RARITY_COLOR[t.rarity]}">${t.name}</span><span class="tslot-tags">${tagChips}</span>`;
      slot.title = `${t.name} ${starMark(t)} [${t.tags.join("")}] — ${treasureText(t)}`;
    } else slot.innerHTML = `<span class="tslot-empty">空</span>`;
    if (mode === "equip") slot.addEventListener("click", () => { if (pendingEquip) replaceSlot(i); else if (t) unequip(i); });
    container.appendChild(slot);
  }
}
function renderTreasureBar() { renderSlots(treasureBarEl, "bar"); }
// 每帧刷新底栏法宝冷却遮罩：满圈=刚释放，扫除到空=即将再次自动释放（循环）
function updateTreasureCooldowns() {
  const slots = treasureBarEl.children;
  for (let i = 0; i < equippedTreasures.length; i++) {
    const cd = (slots[i] as HTMLElement | undefined)?.querySelector<HTMLElement>(".tslot-cd");
    if (!cd) continue;
    const t = equippedTreasures[i];
    const effCd = Math.max(0.1, starCd(t) * stats.cdMul);
    const frac = Math.max(0, Math.min(1, (t.cdLeft ?? 0) / effCd));
    const deg = frac <= 0.001 ? -1 : Math.round(frac * 360); // -1=就绪；取整 → 角度未变则跳过重绘
    if (cd.dataset.deg === String(deg)) continue;
    cd.dataset.deg = String(deg);
    if (deg < 0) { cd.style.opacity = "0"; continue; }
    const hand = Math.max(0, deg - 4); // 前沿亮边（旋转指针）宽约 4°
    cd.style.opacity = "1";
    // 暗扇形=剩余冷却，前沿一道青白亮边作“时钟指针”，扫到空即再次自动释放
    cd.style.background = `conic-gradient(rgba(3, 8, 6, 0.7) 0deg, rgba(3, 8, 6, 0.7) ${hand}deg, rgba(170, 226, 255, 0.85) ${hand}deg, rgba(170, 226, 255, 0.9) ${deg}deg, rgba(0, 0, 0, 0) ${deg}deg)`;
  }
}
function renderArtShop() {
  artStonesEl.textContent = String(spiritStones);
  artOffersEl.innerHTML = "";
  if (!artShopOffers.length) { artOffersEl.innerHTML = `<span class="empty-hint">已无残卷可购</span>`; return; }
  artShopOffers.forEach((a, i) => { const c = artCost(a); artOffersEl.appendChild(offerCard(a.name, a.rarity, "", a.desc, modText(a.mod), `参悟 · ${c}灵石`, spiritStones >= c, () => buyArt(i), "art")); });
}
function renderArtsStrip() {
  const counts = new Map<string, { name: string; n: number }>();
  for (const a of arts) { const c = counts.get(a.id); if (c) c.n += 1; else counts.set(a.id, { name: a.name, n: 1 }); }
  artsStripEl.innerHTML = Array.from(counts.values()).map((c) => `<span class="art-chip">功·${c.name}${c.n > 1 ? `×${c.n}` : ""}</span>`).join("");
}

// ---------- 法宝图鉴（按羁绊标签分类） ----------
// 卡片/详情 HTML 在 ./codex-html.ts；本文件只管打开/关闭弹层与预览
function openTreasureDetail(t: Treasure) {
  cdBody.innerHTML = treasureDetailHtml(t);
  cdBody.scrollTop = 0;
  codexDetailScreen.classList.add("visible");
  // 实时形态预览（失败不影响详情其余部分）
  try {
    if (!skillPreview) skillPreview = createSkillPreview(cdPreview);
    skillPreview.setForm(t.skill);
    skillPreview.start();
  } catch (err) { console.warn("技能预览不可用：", err); }
}
function closeTreasureDetail() { codexDetailScreen.classList.remove("visible"); skillPreview?.stop(); }
function openCodex() {
  codexTotalEl.textContent = String(TREASURES.length);
  codexListEl.innerHTML = codexListHtml(TREASURES);
  codexScreen.classList.add("visible");
  if (running && !gameOver) codexOpen = true; // 战斗中打开 → 暂停
}
function closeCodex() {
  codexScreen.classList.remove("visible");
  codexDetailScreen.classList.remove("visible"); // 一并关掉详情弹层
  skillPreview?.stop(); // 停掉预览循环省 GPU
  codexOpen = false; // 解除暂停（若在战斗中）
}

// ---------- 敌人 ----------
const MAX_ENEMY_RADIUS = 1.9; // 妖王半径，空间查询用作"最大命中外扩"

// 敌人 mesh 对象池：死亡/重开时回池而非 dispose（mesh 共享几何体/材质，dispose 会毁掉全局资源）
const enemyPool: { normal: THREE.Object3D[]; elite: THREE.Object3D[] } = { normal: [], elite: [] };
function acquireEnemyMesh(elite: boolean): THREE.Object3D {
  const m = (elite ? enemyPool.elite : enemyPool.normal).pop();
  if (m) { m.visible = true; return m; }
  return createCorpsePuppet(elite);
}
function releaseEnemyMesh(mesh: THREE.Object3D, elite: boolean) {
  scene.remove(mesh); mesh.visible = false;
  (elite ? enemyPool.elite : enemyPool.normal).push(mesh);
}

// 空间哈希网格：把弹幕/光环的碰撞查询从 O(弹×怪) 降到只查近邻格。每帧 step 开头重建。
const GRID_CELL = 4;
const enemyGrid = new Map<number, Enemy[]>();
function gridKey(cx: number, cz: number) { return (cx + 131072) * 262144 + (cz + 131072); } // 无限地图：放宽坐标范围（±13万格）避免哈希碰撞
function rebuildEnemyGrid() {
  enemyGrid.clear();
  for (const e of enemies) {
    if (e.dead) continue;
    const cx = Math.floor(e.mesh.position.x / GRID_CELL), cz = Math.floor(e.mesh.position.z / GRID_CELL);
    const k = gridKey(cx, cz);
    let b = enemyGrid.get(k);
    if (!b) { b = []; enemyGrid.set(k, b); }
    b.push(e);
  }
}
// 遍历以 (x,z) 为中心、半径 radius 所覆盖格内的候选敌人；调用方需自行做精确距离判定（候选含同格的圈外者）
function forEnemiesNear(x: number, z: number, radius: number, fn: (e: Enemy) => void) {
  const minX = Math.floor((x - radius) / GRID_CELL), maxX = Math.floor((x + radius) / GRID_CELL);
  const minZ = Math.floor((z - radius) / GRID_CELL), maxZ = Math.floor((z + radius) / GRID_CELL);
  for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) {
    const b = enemyGrid.get(gridKey(cx, cz));
    if (!b) continue;
    for (const e of b) fn(e);
  }
}

function spawnEnemy(elite: boolean) {
  const mesh = acquireEnemyMesh(elite);
  mesh.scale.setScalar(elite ? 1.2 : 1); // 池复用：复位缩放（可能来自上一只妖王）
  const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 6;
  mesh.position.set(player.position.x + Math.cos(a) * r, 0, player.position.z + Math.sin(a) * r);
  scene.add(mesh);
  const en = TUNING.enemy, t = runTime;
  const diff = 1 + t / en.hpRampSec + (t / en.hpRampQuad) ** 2; // 血量：线性 + 后期二次加速
  const baseHp = (elite ? en.eliteHpBase : en.hpBase) * diff;
  const dmgMul = Math.min(en.dmgRampMax, 1 + t / en.dmgRampSec);  // 攻击：随时间提升（封顶 dmgRampMax）
  enemies.push({
    mesh, hp: baseHp, maxHp: baseHp,
    speed: (elite ? en.eliteSpeed : en.speedBase) + Math.min(en.speedRampMax, t / en.speedRampSec),
    radius: elite ? 1.1 : 0.7, touch: 0, touchDmg: Math.round((elite ? en.eliteTouchDamage : en.touchDamage) * dmgMul),
    flash: 0, slow: 0, elite, boss: false, xp: elite ? TUNING.xp.elite : TUNING.xp.normal, knockX: 0, knockZ: 0, burnT: 0, burnDps: 0, dead: false,
  });
}
function spawnBoss() {
  const mesh = acquireEnemyMesh(true);
  mesh.scale.setScalar(1.2 * 1.9);
  const a = Math.random() * Math.PI * 2;
  mesh.position.set(player.position.x + Math.cos(a) * 26, 0, player.position.z + Math.sin(a) * 26);
  scene.add(mesh);
  const hp = (TUNING.boss.hpBase + bossesDefeated * TUNING.boss.hpPerBoss) * (1 + runTime / TUNING.boss.hpRampSec);
  const bossDmg = Math.round((TUNING.enemy.eliteTouchDamage + 6) * Math.min(TUNING.enemy.dmgRampMax, 1 + runTime / TUNING.enemy.dmgRampSec));
  enemies.push({ mesh, hp, maxHp: hp, speed: TUNING.boss.speed, radius: 1.9, touch: 0, touchDmg: bossDmg, flash: 0, slow: 0, elite: true, boss: true, xp: TUNING.boss.xpBase + bossesDefeated * TUNING.boss.xpPerBoss, knockX: 0, knockZ: 0, burnT: 0, burnDps: 0, dead: false });
  cameraShake = 0.5; warn("妖王降临 · 渡劫！");
}

// ---------- 伤害管线 ----------
function weaponBase(t: Treasure): number {
  let d = starAttack(t) * (1 + stats.damageMul);
  if (flags.berserk > 0) d *= 1 + flags.berserk * (1 - Math.min(1, Math.max(0, playerHp / maxHp)));
  return d;
}
function critRoll(base: number): { dmg: number; crit: boolean } {
  if (flags.crit > 0 && Math.random() < flags.crit) return { dmg: base * flags.critMul, crit: true };
  return { dmg: base, crit: false };
}
// 击退：沿"远离玩家"方向给一记冲量（按质量缩放），在 updateEnemies 里逐帧衰减积分
function applyKnockback(e: Enemy, crit: boolean, mul = 1) {
  const k = TUNING.knockback;
  const mass = e.boss ? k.massBoss : e.elite ? k.massElite : 1;
  const dx = e.mesh.position.x - player.position.x;
  const dz = e.mesh.position.z - player.position.z;
  const d = Math.hypot(dx, dz) || 1;
  const imp = (k.base * (crit ? k.critMul : 1) * mul) / mass;
  e.knockX += (dx / d) * imp; e.knockZ += (dz / d) * imp;
}
// 吸附（magnet trait）：把敌人拉向玩家，复用击退积分管线
function applyPull(e: Enemy) {
  const dx = player.position.x - e.mesh.position.x;
  const dz = player.position.z - e.mesh.position.z;
  const d = Math.hypot(dx, dz) || 1;
  const imp = TUNING.traitFx.pullImpulse;
  e.knockX += (dx / d) * imp; e.knockZ += (dz / d) * imp;
}
// 命中时施加行为层 trait（仅对存活之敌）：减速 / 灼烧 / 额外击退 / 吸附
function applyHitTraits(e: Enemy, tr: TreasureTraits | undefined, base: number) {
  if (!tr || e.dead) return;
  const f = TUNING.traitFx;
  if (tr.slow) e.slow = Math.max(e.slow, f.slowDur);
  if (tr.burn) { e.burnT = Math.max(e.burnT, f.burnDur); e.burnDps = Math.max(e.burnDps, Math.min(f.burnDpsCap, base * f.burnDpsFactor)); }
  if (tr.knock) applyKnockback(e, false, f.knockMul);
  if (tr.magnet) applyPull(e);
}
function damageEnemy(e: Enemy, dmg: number, dir: THREE.Vector3, crit = false, canExplode = true) {
  if (e.dead) return; // 同帧已死敌人不再重复结算（吸血/飘字/二次扣血）
  e.hp -= dmg; e.flash = 0.12;
  if (e.hp > 0) {
    sfxHit(crit); // 命中音效（限流，群体命中不会叠成噪声）
    applyKnockback(e, crit); // 仅弹开存活之敌，死者就地炸开掉落
    // 五行·水/火 羁绊：任意命中附带全局减速 / 灼烧（与单件 trait 各自 Math.max 叠加）
    const tf = TUNING.traitFx;
    if (flags.chill > 0) e.slow = Math.max(e.slow, tf.slowDur * (0.8 + 0.2 * flags.chill));
    if (flags.ignite > 0) { e.burnT = Math.max(e.burnT, tf.burnDur); e.burnDps = Math.max(e.burnDps, Math.min(tf.burnDpsCap, dmg * tf.burnDpsFactor * (0.6 + 0.4 * flags.ignite))); }
  }
  if (stats.lifesteal > 0) heal(dmg * stats.lifesteal);
  spawnFloater(crit ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`, e.mesh.position, crit ? "#ff9a5a" : "#ffe08a", crit ? 0.85 : 0.7);
  if (e.hp <= 0) killEnemy(e, dir, canExplode);
}
function killEnemy(e: Enemy, dir: THREE.Vector3, canExplode = true) {
  if (e.dead) return;
  e.dead = true; // 标记死亡，统一在 updateEnemies 清扫（避免遍历中改数组）
  sfxKill(); // 击杀音效（限流）
  addEffect(createQingyuanHitBurst(e.mesh.position.clone(), dir, e.elite));
  kills += 1;
  if (e.boss) bossesDefeated += 1;
  // 击杀掉落：掉灵石则不再掉经验球（二选一，灵石只算货币、不与经验一起吸走）
  const stoneChance = e.boss ? TUNING.loot.stoneChanceBoss : e.elite ? TUNING.loot.stoneChanceElite : TUNING.loot.stoneChanceNormal;
  if (Math.random() < stoneChance) {
    const amt = e.boss ? TUNING.loot.stoneBoss : e.elite ? TUNING.loot.stoneElite : TUNING.loot.stoneNormal;
    spawnOrb(e.mesh.position, amt, "stone");
  } else {
    spawnOrb(e.mesh.position, e.xp, "xp"); // 没掉灵石才迸出灵力球（吸收才加经验）
  }
  if (e.boss || e.elite || Math.random() < TUNING.artDrop.normalChance) {
    if (scrolls.length < TUNING.artDrop.maxOnGround) {
      const chance = e.boss ? TUNING.artDrop.bossChance : e.elite ? TUNING.artDrop.eliteChance : 1;
      if (Math.random() < chance) spawnScroll(e.mesh.position);
    }
  }
  // 妖系击杀爆裂
  if (canExplode && flags.killExplode > 0) {
    const c = e.mesh.position.clone();
    const kr = flags.killExplode, kr2 = kr * kr;
    addEffect(createBindingField(c, kr));
    const ed = 16 + level * 2;
    forEnemiesNear(c.x, c.z, kr, (o) => { if (!o.dead && o.mesh.position.distanceToSquared(c) <= kr2) damageEnemy(o, ed, dir, false, false); });
  }
  // VS 地面拾取掉落（妖王必掉成套，普通怪按概率，且限场上数量）
  if (e.boss) {
    spawnFloorItem(e.mesh.position, "heal");
    spawnFloorItem(e.mesh.position.clone().add(new THREE.Vector3(1.6, 0, 0)), "magnet");
    spawnFloorItem(e.mesh.position.clone().add(new THREE.Vector3(-1.6, 0, 0)), "bomb");
  } else if (floorItems.length < 10) {
    const rp = Math.random();
    const p = TUNING.pickup;
    if (rp < p.healChance) spawnFloorItem(e.mesh.position, "heal");
    else if (rp < p.healChance + p.magnetChance) spawnFloorItem(e.mesh.position, "magnet");
    else if (rp < p.healChance + p.magnetChance + p.bombChance) spawnFloorItem(e.mesh.position, "bomb");
  }
  releaseEnemyMesh(e.mesh, e.elite); // mesh 共享几何体/材质，回池复用而非 dispose
}

// 范围 / 扇形 / 链式 伤害（经空间网格取近邻候选 + 平方距离精判；killEnemy 只标记不删，遍历安全）
function aoeDamage(center: THREE.Vector3, radius: number, base: number, dir = ZF, tr?: TreasureTraits) {
  const r2 = radius * radius;
  forEnemiesNear(center.x, center.z, radius, (e) => {
    if (e.dead || e.mesh.position.distanceToSquared(center) > r2) return;
    const r = critRoll(base); damageEnemy(e, r.dmg, dir, r.crit); applyHitTraits(e, tr, base);
  });
}
function coneDamage(origin: THREE.Vector3, dir: THREE.Vector3, range: number, cosHalf: number, base: number) {
  forEnemiesNear(origin.x, origin.z, range, (e) => {
    if (e.dead) return;
    const v = e.mesh.position.clone().sub(origin).setY(0); const d = v.length();
    if (d <= range && d > 0.001) { v.normalize(); if (v.dot(dir) >= cosHalf) { const r = critRoll(base); damageEnemy(e, r.dmg, dir, r.crit); } }
  });
}
function chainDamage(start: THREE.Vector3, jumps: number, base: number) {
  const set = new Set<Enemy>(); let cur = start.clone();
  for (let j = 0; j < jumps; j++) {
    let best: Enemy | null = null, bd = Infinity; // bd 为平方距离，阈值 7² = 49
    for (const e of enemies) { if (e.dead || set.has(e)) continue; const d = e.mesh.position.distanceToSquared(cur); if (d < bd && d <= 49) { bd = d; best = e; } }
    if (!best) break;
    set.add(best);
    const r = critRoll(base);
    addEffect(createThunderStrike(best.mesh.position.clone()));
    damageEnemy(best, r.dmg, ZF, r.crit);
    cur = best.mesh.position.clone();
  }
}

const ZF = new THREE.Vector3(0, 0, 1);
function dirTo(e: Enemy) { return e.mesh.position.clone().sub(player.position).setY(0).normalize(); }
// 自动索敌射程²（超出不锁定，避免在屏幕外/雾中击杀）
const TARGET_RANGE_SQ = TUNING.combat.targetRange * TUNING.combat.targetRange;
// 最近单体：单遍扫描，无排序无分配；初值=射程²，超出射程之敌不入选
function nearestEnemy(): Enemy | null {
  let best: Enemy | null = null, bd = TARGET_RANGE_SQ;
  for (const e of enemies) { if (e.dead) continue; const d = e.mesh.position.distanceToSquared(player.position); if (d < bd) { bd = d; best = e; } }
  return best;
}
// 距任意点最近之敌（追踪子弹用：索敌以"子弹自身位置"为准，而非玩家）
function nearestEnemyTo(pos: THREE.Vector3): Enemy | null {
  let best: Enemy | null = null, bd = Infinity;
  for (const e of enemies) { if (e.dead) continue; const d = e.mesh.position.distanceToSquared(pos); if (d < bd) { bd = d; best = e; } }
  return best;
}
function nearestEnemies(n: number): Enemy[] {
  if (n <= 1) { const e = nearestEnemy(); return e ? [e] : []; }
  return enemies.filter((e) => !e.dead && e.mesh.position.distanceToSquared(player.position) <= TARGET_RANGE_SQ).sort((a, b) => a.mesh.position.distanceToSquared(player.position) - b.mesh.position.distanceToSquared(player.position)).slice(0, n);
}

// ---------- 法宝施法 ----------
function fireWeapon(t: Treasure) {
  sfxCast(t.skill); // 释放音效（按形态分组；aura 不出声）
  const base = weaponBase(t);
  const area = 1 + stats.area;
  const star = treasureStar(t);
  const tr = t.traits;
  switch (t.skill) {
    case "sword": {
      const n = (t.count ?? 1) + stats.projectiles;
      const tg = nearestEnemies(n);
      for (let i = 0; i < n; i++) { const e = tg[i] ?? tg[0]; const dir = e ? dirTo(e) : new THREE.Vector3(Math.cos(i), 0, Math.sin(i)).normalize(); spawnStraight(dir, base, star, tr); }
      break;
    }
    case "bolt": {
      const n = (t.count ?? 1) + stats.projectiles;
      const fission = tr?.fork ? TUNING.fission.gens : 0; // fork（妖系）：击杀裂变
      for (let i = 0; i < n; i++) spawnHoming(base, star, fission, tr);
      break;
    }
    case "orbit": {
      // 先清掉该法宝上一批环刃，避免随急速无限累积撑爆投射物上限
      for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].kind === "orbit" && projectiles[i].owner === t.uid) { scene.remove(projectiles[i].mesh); projectiles.splice(i, 1); }
      spawnOrbit(t.count ?? 3, t.radius ?? 2.4, base, star, t.uid, tr);
      break;
    }
    case "bladering": break; // 刀系旋刃常驻旋转、无 CD，由 syncBladeRings 维护，不在此施放
    case "nova": case "aura": {
      const radius = (t.radius ?? 3.5) * area;
      addEffect(createBindingField(player.position.clone(), radius, star));
      aoeDamage(player.position, radius, base, ZF, tr);
      break;
    }
    case "strike": {
      const e = nearestEnemy(); if (!e) break;
      const c = e.mesh.position.clone(); const radius = (t.radius ?? 3) * area;
      addEffect(createThunderStrike(c, star)); aoeDamage(c, radius, base, ZF, tr);
      if (flags.chainBonus > 0) chainDamage(c, flags.chainBonus, base);
      break;
    }
    case "chain": {
      if (!nearestEnemy()) break;
      chainDamage(player.position, (t.count ?? 3) + flags.chainBonus + (tr?.bounce ? 2 : 0), base);
      break;
    }
    case "arc": {
      const n = Math.max(1, t.count ?? 1); const tg = nearestEnemies(n);
      for (let i = 0; i < n; i++) {
        const e = tg[i] ?? tg[0]; const dir = e ? dirTo(e) : ZF.clone();
        coneDamage(player.position, dir, (t.radius ?? 3.2), 0.55, base);
        addEffect(createQingyuanHitBurst(player.position.clone().addScaledVector(dir, (t.radius ?? 3) * 0.6), dir, true, star));
      }
      break;
    }
    case "rain": {
      const n = t.count ?? 6; const R = (t.radius ?? 6) * area;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * R;
        const p = player.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
        addEffect(createThunderStrike(p, star)); aoeDamage(p, 1.8, base, ZF, tr);
      }
      break;
    }
    case "glaive": {
      const n = (t.count ?? 1) + stats.projectiles + (star >= 3 ? 1 : 0);
      const R = (t.radius ?? 5.5) * (1 + stats.area * 0.5);
      const tg = nearestEnemies(Math.max(1, n));
      for (let i = 0; i < n; i++) {
        const e = tg[i] ?? tg[0];
        const dir = e ? dirTo(e) : new THREE.Vector3(Math.cos(i), 0, Math.sin(i)).normalize();
        spawnGlaive(dir, i % 2 === 0 ? 1 : -1, R, base, star, tr);
      }
      break;
    }
    case "radial": { // 360° 均分固定方向齐射
      const n = (t.count ?? 8) + stats.projectiles;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; spawnStraight(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), base, star, tr); }
      break;
    }
    case "spiral": { // 发射角逐次旋转，连发成螺旋
      const n = (t.count ?? 1) + stats.projectiles;
      t.spin = (t.spin ?? 0) + 0.55;
      for (let i = 0; i < n; i++) { const a = t.spin + (i / n) * Math.PI * 2; spawnStraight(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), base, star, tr); }
      break;
    }
    case "forward": { // 沿玩家朝向固定直线（带轻微扇形）
      const n = (t.count ?? 1) + stats.projectiles;
      for (let i = 0; i < n; i++) { const a = player.rotation.y + (i - (n - 1) / 2) * 0.16; spawnStraight(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), base, star, tr); }
      break;
    }
    case "lance": { // 枪刺：超长射程·强穿透单道直线
      const n = (t.count ?? 1) + stats.projectiles;
      const tg = nearestEnemies(n);
      for (let i = 0; i < n; i++) {
        const e = tg[i] ?? tg[0];
        const dir = e ? dirTo(e) : new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
        spawnLance(dir, base, star, tr);
      }
      break;
    }
    case "whirl": { // 旋身斩：360°全圈瞬斩 + 击退
      const radius = (t.radius ?? 3.2) * area;
      addEffect(createSlashEffect(player.position.clone(), new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y))));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); addEffect(createQingyuanHitBurst(player.position.clone().addScaledVector(d, radius * 0.6), d, true, star)); }
      aoeDamage(player.position, radius, base, ZF, tr);
      break;
    }
    case "meteor": { // 坠星：远程单点大范围重炸 + 击退
      const tg = nearestEnemies(3); const target = tg[tg.length - 1] ?? null;
      const c = target ? target.mesh.position.clone() : player.position.clone();
      const radius = (t.radius ?? 4.5) * area;
      addEffect(createThunderStrike(c, Math.max(2, star + 1)));
      addEffect(createBindingField(c, radius, star));
      aoeDamage(c, radius, base, ZF, tr);
      break;
    }
    case "sigil": { // 符阵：远程定点停留法阵，周期减速 + 磨伤
      const e = nearestEnemy(); const c = e ? e.mesh.position.clone() : player.position.clone();
      const radius = (t.radius ?? 3.2) * area;
      for (let i = sigils.length - 1; i >= 0; i--) if (sigils[i].owner === t.uid) sigils.splice(i, 1); // 每法宝只留最新一座
      sigils.push({ pos: c, radius, base: base * 0.5, tick: 0, life: 4.0, owner: t.uid, traits: tr });
      addEffect(createBindingField(c, radius, star));
      break;
    }
    case "vine": { // 缠藤：低速多向生长绿弹 + 减速
      const n = (t.count ?? 3) + stats.projectiles;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; spawnVine(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), base, star, tr); }
      break;
    }
    case "boomerang": { // 回旋镖：大弧往返穿击
      const e = nearestEnemy();
      const dir = e ? dirTo(e) : new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
      const R = (t.radius ?? 7) * (1 + stats.area * 0.5);
      spawnBoomerang(dir, R, base, star, tr);
      break;
    }
  }
}

// 投射物星级配色：★1 翠绿 / ★2 青蓝 / ★3 金紫
const STAR_PROJ: Record<number, { color: number; emissive: number; scale: number }> = {
  1: { color: 0xddeecf, emissive: 0x45ff76, scale: 1.0 },
  2: { color: 0xcfeaff, emissive: 0x35d0ff, scale: 1.28 },
  3: { color: 0xffe9b0, emissive: 0xffc24a, scale: 1.6 },
};
function projStyle(star: number) { return STAR_PROJ[Math.min(3, Math.max(1, star))]; }

// 投射物共享几何体/材质（按星级缓存，避免每发新建）
const G_BLADE = new THREE.BoxGeometry(0.1, 0.1, 1.2);
const G_HALO = new THREE.BoxGeometry(0.26, 0.05, 1.6);
const G_WING = new THREE.BoxGeometry(0.5, 0.03, 1.0);
const G_HOMING = new THREE.SphereGeometry(0.22, 12, 10);
const G_ORBIT = new THREE.BoxGeometry(0.12, 0.12, 0.9);
// 精模升级：飞剑（刃/尖/护手/拖尾）与妖弹（核心/辉光壳/绕弹火花）——均为模块级共享几何体，零 per-spawn 开销
const G_SWORD_BLADE = new THREE.BoxGeometry(0.08, 0.06, 1.0);
const G_SWORD_TIP = new THREE.ConeGeometry(0.1, 0.34, 4);
const G_SWORD_GUARD = new THREE.BoxGeometry(0.34, 0.07, 0.1);
const G_TRAIL = new THREE.PlaneGeometry(0.5, 1.8);
const G_BOLT_CORE = new THREE.SphereGeometry(0.17, 14, 12);
const G_BOLT_SHELL = new THREE.SphereGeometry(0.31, 12, 10);
const G_BOLT_SPARK = new THREE.TetrahedronGeometry(0.075);
const projMatCache = new Map<string, THREE.MeshStandardMaterial>();
function projMat(star: number, kind: "solid" | "halo"): THREE.MeshStandardMaterial {
  const key = `${star}-${kind}`;
  let m = projMatCache.get(key);
  if (m) return m;
  const s = projStyle(star);
  m = kind === "solid"
    ? new THREE.MeshStandardMaterial({ color: s.color, emissive: s.emissive, emissiveIntensity: 1.6 })
    : new THREE.MeshStandardMaterial({ color: s.color, emissive: s.emissive, emissiveIntensity: 1.1, transparent: true, opacity: 0.42, depthWrite: false });
  projMatCache.set(key, m);
  return m;
}

// 羁绊终极：全屏剑雨 / 持续天雷
function swordStormCast() {
  const base = 16 * (1 + stats.damageMul);
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 9;
    const p = player.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    addEffect(createQingyuanHitBurst(p, ZF, true, 2)); aoeDamage(p, 1.9, base);
  }
}
function thunderStormCast() {
  const base = 24 * (1 + stats.damageMul);
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 9;
    const p = player.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    addEffect(createThunderStrike(p, 2)); aoeDamage(p, 2.4, base);
  }
}
// 土系羁绊：周期地崩——环身范围爆发 + 强力震退
function quakeCast() {
  const c = player.position.clone();
  const r = 5.2 * (1 + stats.area);
  const base = (30 + level * 4) * (1 + stats.damageMul);
  addEffect(createBindingField(c, r));
  aoeDamage(c, r, base, ZF, { knock: true });
  cameraShake = Math.max(cameraShake, 0.35);
}

// 飞剑：剑刃 + 锥尖 + 护手 + 辉光 + 贴地拖尾（长轴沿 +Z，由 spawnStraight 的 lookAt 对准方向）
function bladeMesh(star: number) {
  const s = projStyle(star);
  const solid = projMat(star, "solid");
  const halo = projMat(star, "halo");
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G_SWORD_BLADE, solid));
  const tip = new THREE.Mesh(G_SWORD_TIP, solid); tip.rotation.x = Math.PI / 2; tip.position.z = 0.63; g.add(tip);
  const guard = new THREE.Mesh(G_SWORD_GUARD, solid); guard.position.z = -0.42; g.add(guard);
  g.add(new THREE.Mesh(G_HALO, halo));
  const trail = new THREE.Mesh(G_TRAIL, halo); trail.rotation.x = Math.PI / 2; trail.position.z = -0.95; g.add(trail);
  if (star >= 3) { const wing = new THREE.Mesh(G_WING, halo); wing.position.z = 0.4; g.add(wing); } // ★3 双翼拖尾
  g.scale.setScalar(s.scale);
  return g;
}
// 妖弹：实心核心 + 半透辉光壳 + 两点绕弹火花（靠 homing 分支的 rotation.y 自转，火花绕轨）
function boltMesh(star: number, scaleMul = 1) {
  const solid = projMat(star, "solid");
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G_BOLT_CORE, solid));
  g.add(new THREE.Mesh(G_BOLT_SHELL, projMat(star, "halo")));
  for (let i = 0; i < 2; i++) { const sp = new THREE.Mesh(G_BOLT_SPARK, solid); const a = i * Math.PI; sp.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); g.add(sp); }
  g.scale.setScalar(projStyle(star).scale * scaleMul);
  return g;
}
function spawnStraight(dir: THREE.Vector3, base: number, star: number, traits?: TreasureTraits) {
  if (projectiles.length >= TUNING.maxProjectiles) return;
  const mesh = bladeMesh(star); mesh.position.copy(player.position); mesh.position.y = 1.0; mesh.lookAt(mesh.position.clone().add(dir));
  scene.add(mesh);
  projectiles.push({ mesh, kind: "straight", base, life: 0.7, hit: new Set(), pierce: true, dir: dir.clone(), speed: 27, traits });
}
// 枪刺（lance）：拉长几何、超长射程、强穿透；缠藤（vine）：绿色低速穿透弹。二者均复用 straight 运动分支。
const G_LANCE = new THREE.BoxGeometry(0.14, 0.14, 2.6);
const G_LANCE_HALO = new THREE.BoxGeometry(0.3, 0.06, 3.0);
const M_VINE = new THREE.MeshStandardMaterial({ color: 0xbfe6a0, emissive: 0x3fa83f, emissiveIntensity: 1.4 });
const M_VINE_HALO = new THREE.MeshStandardMaterial({ color: 0xbfe6a0, emissive: 0x3fa83f, emissiveIntensity: 1.0, transparent: true, opacity: 0.4, depthWrite: false });
function lanceMesh(star: number) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G_LANCE, projMat(star, "solid")));
  g.add(new THREE.Mesh(G_LANCE_HALO, projMat(star, "halo")));
  g.scale.setScalar(projStyle(star).scale);
  return g;
}
function vineMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G_BLADE, M_VINE));
  g.add(new THREE.Mesh(G_HALO, M_VINE_HALO));
  return g;
}
function spawnLance(dir: THREE.Vector3, base: number, star: number, traits?: TreasureTraits) {
  if (projectiles.length >= TUNING.maxProjectiles) return;
  const mesh = lanceMesh(star); mesh.position.copy(player.position); mesh.position.y = 1.0; mesh.lookAt(mesh.position.clone().add(dir));
  scene.add(mesh);
  projectiles.push({ mesh, kind: "straight", base, life: 0.75, hit: new Set(), pierce: true, dir: dir.clone(), speed: 34, traits });
}
function spawnVine(dir: THREE.Vector3, base: number, star: number, traits?: TreasureTraits) {
  if (projectiles.length >= TUNING.maxProjectiles) return;
  const mesh = vineMesh(); mesh.position.copy(player.position); mesh.position.y = 0.8; mesh.lookAt(mesh.position.clone().add(dir));
  scene.add(mesh);
  projectiles.push({ mesh, kind: "straight", base, life: 1.6, hit: new Set(), pierce: true, dir: dir.clone(), speed: 7, traits });
}
function spawnHomingProj(pos: THREE.Vector3, dir: THREE.Vector3, base: number, star: number, fission: number, scaleMul = 1, traits?: TreasureTraits) {
  if (projectiles.length >= TUNING.maxProjectiles) return;
  const mesh = boltMesh(star, scaleMul);
  mesh.position.copy(pos); mesh.position.y = 1.0; scene.add(mesh);
  const d = dir.clone(); d.y = 0;
  if (d.lengthSq() < 1e-6) { const a = Math.random() * Math.PI * 2; d.set(Math.cos(a), 0, Math.sin(a)); }
  d.normalize();
  projectiles.push({ mesh, kind: "homing", base, life: 1.2, hit: new Set(), pierce: false, dir: d, speed: 17, fission, star, traits });
}
function spawnHoming(base: number, star: number, fission: number, traits?: TreasureTraits) {
  const a = Math.random() * Math.PI * 2; // 出膛朝随机方向，随后由 homing 逻辑自行索敌转向
  spawnHomingProj(player.position, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), base, star, fission, 1, traits);
}
// 妖系裂变：子弹击杀后裂出若干追踪子弹（代数 -1、伤害 ×dmgMul、外观略小），规模受 maxProjectiles 约束
function spawnFission(parent: Projectile, pos: THREE.Vector3) {
  const f = TUNING.fission;
  const childFission = (parent.fission ?? 0) - 1;
  const childBase = parent.base * f.dmgMul;
  const star = parent.star ?? 1;
  for (let i = 0; i < f.count; i++) {
    if (projectiles.length >= TUNING.maxProjectiles) break;
    const a = (i / f.count) * Math.PI * 2 + Math.random() * 0.6;
    spawnHomingProj(pos, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), childBase, star, childFission, 0.82, parent.traits);
  }
}
function spawnOrbit(n: number, radius: number, base: number, star: number, owner?: number, traits?: TreasureTraits, bladeRarity?: Rarity) {
  const sc = projStyle(star).scale;
  for (let i = 0; i < n; i++) {
    if (projectiles.length >= TUNING.maxProjectiles) return;
    let mesh: THREE.Object3D; let spin: number | undefined;
    if (bladeRarity) { mesh = bladeOrbitMesh(bladeRarity, star); spin = 14; } // 刀系旋刃：自身高速旋转
    else { const m = new THREE.Mesh(G_ORBIT, projMat(star, "solid")); m.scale.setScalar(sc); mesh = m; }
    scene.add(mesh);
    // 旋刃常驻不消失（life=∞），由 syncBladeRings 在构筑变化时重建；普通环刃仍按 life 存活
    projectiles.push({ mesh, kind: "orbit", base, life: bladeRarity ? Infinity : 4.2, hit: new Set(), pierce: true, angle: (i / n) * Math.PI * 2, radius, ang: 3.0, lastHit: new Map(), owner, traits, spin });
  }
}
// 旋刃常驻：清掉旧环刃后按当前装备的刀法宝重建（无 CD、持续旋转；在 recompute 时调用）
function syncBladeRings() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.kind === "orbit" && p.spin) { scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
  for (const t of equippedTreasures) {
    if (t.skill !== "bladering") continue;
    spawnOrbit(t.count ?? 3, t.radius ?? 2.6, weaponBase(t), treasureStar(t), t.uid, t.traits, t.rarity);
  }
}
// 旋刃（刀系环刃）：按品阶换模型，平躺于 XZ 面、自身高速旋转 + 环身公转
const G_FANG = new THREE.ConeGeometry(0.17, 0.95, 3);       // 三棱刃
const G_HUB = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14); // 中心轮毂（扁圆盘）
const G_SAWRING = new THREE.TorusGeometry(0.62, 0.045, 8, 30);  // 外缘光环
type BladeStyle = { color: number; emissive: number; blades: number; ring: boolean; scale: number };
const BLADE_STYLE: Record<Rarity, BladeStyle> = {
  common:    { color: 0xd6dee8, emissive: 0x9fb4c6, blades: 2, ring: false, scale: 0.82 },
  uncommon:  { color: 0xa6f0bb, emissive: 0x35c062, blades: 3, ring: false, scale: 0.94 },
  rare:      { color: 0x9bc8ff, emissive: 0x3a86e0, blades: 3, ring: true,  scale: 1.04 },
  epic:      { color: 0xdcb0ff, emissive: 0x8a3fe0, blades: 4, ring: true,  scale: 1.16 },
  legendary: { color: 0xffd684, emissive: 0xff8f24, blades: 5, ring: true,  scale: 1.32 },
};
const bladeMatCache = new Map<Rarity, { solid: THREE.MeshStandardMaterial; halo: THREE.MeshStandardMaterial }>();
function bladeMats(rarity: Rarity) {
  let m = bladeMatCache.get(rarity);
  if (m) return m;
  const st = BLADE_STYLE[rarity];
  m = {
    solid: new THREE.MeshStandardMaterial({ color: st.color, emissive: st.emissive, emissiveIntensity: 1.7, metalness: 0.65, roughness: 0.25 }),
    halo: new THREE.MeshStandardMaterial({ color: st.color, emissive: st.emissive, emissiveIntensity: 1.2, transparent: true, opacity: 0.4, depthWrite: false }),
  };
  bladeMatCache.set(rarity, m);
  return m;
}
function bladeOrbitMesh(rarity: Rarity, star: number): THREE.Object3D {
  const st = BLADE_STYLE[rarity];
  const { solid, halo } = bladeMats(rarity);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(G_HUB, solid)); // 中心轮毂
  for (let i = 0; i < st.blades; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = (i / st.blades) * Math.PI * 2;
    const fang = new THREE.Mesh(G_FANG, solid);
    fang.rotation.z = -Math.PI / 2; // 刃尖朝外、平躺
    fang.position.x = 0.5;
    pivot.add(fang); root.add(pivot);
  }
  if (st.ring) { const ring = new THREE.Mesh(G_SAWRING, halo); ring.rotation.x = Math.PI / 2; root.add(ring); }
  root.scale.setScalar(st.scale * (1 + (Math.min(3, star) - 1) * 0.12)); // 高星更大
  return root;
}
// 回旋大刀（共享几何体/材质，避免泄漏）
const G_CRESCENT = new THREE.TorusGeometry(0.7, 0.1, 8, 22, Math.PI * 1.15);
const G_CRESCENT_EDGE = new THREE.TorusGeometry(0.72, 0.03, 6, 22, Math.PI * 1.15);
const G_GLAIVE_HALO = new THREE.TorusGeometry(0.82, 0.05, 6, 26, Math.PI * 1.3);
const G_GLAIVE_TRAIL = new THREE.TorusGeometry(0.96, 0.08, 6, 28, Math.PI * 1.6); // 挥斩残影弧
const G_GLAIVE_HANDLE = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
const GLAIVE_HANDLE_MAT = new THREE.MeshStandardMaterial({ color: 0x5a3d30 });
function glaiveMesh(star: number) {
  const s = projStyle(star);
  const g = new THREE.Group();
  const trail = new THREE.Mesh(G_GLAIVE_TRAIL, projMat(star, "halo")); trail.rotation.x = Math.PI / 2; trail.rotation.z = -0.4; g.add(trail);
  const crescent = new THREE.Mesh(G_CRESCENT, projMat(star, "solid")); crescent.rotation.x = Math.PI / 2; g.add(crescent);
  const edge = new THREE.Mesh(G_CRESCENT_EDGE, projMat(star, "halo")); edge.rotation.x = Math.PI / 2; g.add(edge);
  const halo = new THREE.Mesh(G_GLAIVE_HALO, projMat(star, "halo")); halo.rotation.x = Math.PI / 2; g.add(halo);
  const handle = new THREE.Mesh(G_GLAIVE_HANDLE, GLAIVE_HANDLE_MAT); handle.position.set(0.72, 0, 0); handle.rotation.z = Math.PI / 2; g.add(handle);
  g.scale.setScalar(1.5 * s.scale); // 大刀，整体放大；高星更大
  return g;
}
function spawnGlaive(dir: THREE.Vector3, side: number, radius: number, base: number, star: number, traits?: TreasureTraits) {
  if (projectiles.length >= TUNING.maxProjectiles) return;
  const mesh = glaiveMesh(star);
  mesh.position.copy(player.position); mesh.position.y = 1.0; scene.add(mesh);
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side); // 侧向，决定弧线弯向
  projectiles.push({ mesh, kind: "glaive", base, life: 1.2, hit: new Set(), pierce: true, dir: dir.clone(), center: player.position.clone(), perp, radius, angle: 0, ang: 2.4, traits });
}
// 回旋镖（boomerang）：复用 glaive 圆弧轨迹，但大半径·长寿命·角速使其飞出再返回（ang*life≈2π）
function spawnBoomerang(dir: THREE.Vector3, radius: number, base: number, star: number, traits?: TreasureTraits) {
  if (projectiles.length >= TUNING.maxProjectiles) return;
  const mesh = glaiveMesh(star);
  mesh.position.copy(player.position); mesh.position.y = 1.0; scene.add(mesh);
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  projectiles.push({ mesh, kind: "glaive", base, life: 2.4, hit: new Set(), pierce: true, dir: dir.clone(), center: player.position.clone(), perp, radius, angle: 0, ang: 2.6, traits });
}

// ---------- 受伤 / 治疗 ----------
function hurt(amount: number) {
  if (invuln > 0) return;
  const reduced = Math.max(1, amount - stats.defense);
  // 体系反伤
  if (flags.thorns > 0) {
    const back = reduced * flags.thorns;
    forEnemiesNear(player.position.x, player.position.z, 3.4, (e) => { if (!e.dead && e.mesh.position.distanceToSquared(player.position) <= 3.4 * 3.4) damageEnemy(e, back, ZF, false, false); });
  }
  playerHp -= reduced; invuln = TUNING.player.invulnAfterHit;
  sfxHurt(); // 受伤音效
  cameraShake = Math.max(cameraShake, 0.25);
  spawnFloater(`-${Math.round(reduced)}`, player.position, "#ff6b6b", 0.8);
  if (playerHp <= 0) {
    // 仙系免死护盾
    if (shieldReady) {
      shieldReady = false; shieldT = flags.shieldInterval;
      playerHp = Math.round(maxHp * 0.35); invuln = 1.0;
      addEffect(createBindingField(player.position.clone(), 3.2));
      spawnFloater("护盾·免死", player.position, "#9ddcff", 1.2);
    } else endRun();
  }
}
function heal(amount: number) { playerHp = Math.min(maxHp, playerHp + amount); }

// ---------- 特效 / 飘字 ----------
// 释放独有几何体/材质（仅用于敌人/卷轴/特效——它们各自 new 资源；灵气/投射物用共享资源，切勿调用）
function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose();
    }
  });
}
const MAX_EFFECTS = 80; // 软上限：全屏/连锁帧防特效暴涨抖帧，超出回收最老的
function addEffect(e: Effect) {
  if (effects.length >= MAX_EFFECTS) { const old = effects.shift()!; scene.remove(old.object); disposeObject(old.object); }
  scene.add(e.object); effects.push(e);
}
// 飘字 DOM 元素池：高密度战斗下逐击命中很多，复用 div 避免持续 createElement/remove 触发重排
const floaterPool: HTMLDivElement[] = [];
function spawnFloater(text: string, pos: THREE.Vector3, color: string, life = 0.9) {
  if (floaters.length >= 48) return;
  let el = floaterPool.pop();
  if (!el) { el = document.createElement("div"); el.className = "floater"; app!.appendChild(el); }
  el.textContent = text; el.style.color = color; el.style.opacity = "1"; el.style.display = "";
  floaters.push({ el, pos: pos.clone().add(new THREE.Vector3(0, 1.6, 0)), age: 0, life });
}
function warn(text: string) {
  const el = document.createElement("div"); el.className = "warn"; el.textContent = text; app!.appendChild(el);
  setTimeout(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 1800);
}

// ---------- 灵力球（经验） / 灵石球（货币） / 卷轴 ----------
// 共享几何体/材质，避免每次击杀都新建（大幅减少 GC 与 GPU 上传）
const ORB_GEO_XP_BIG = new THREE.IcosahedronGeometry(0.34, 0);
const ORB_GEO_XP_SMALL = new THREE.IcosahedronGeometry(0.22, 0);
const ORB_GEO_STONE = new THREE.OctahedronGeometry(0.3, 0);
const ORB_MAT_XP_BIG = new THREE.MeshStandardMaterial({ color: 0x9cff8f, emissive: 0x2f9a3c, emissiveIntensity: 1.4 });
const ORB_MAT_XP_SMALL = new THREE.MeshStandardMaterial({ color: 0x9cff8f, emissive: 0x2f9a3c, emissiveIntensity: 1.3 });
const ORB_MAT_STONE = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xc88a12, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.3 });
function spawnOrb(pos: THREE.Vector3, value: number, kind: "xp" | "stone") {
  let geo: THREE.BufferGeometry, mat: THREE.Material;
  if (kind === "stone") { geo = ORB_GEO_STONE; mat = ORB_MAT_STONE; }
  else { const big = value >= 12; geo = big ? ORB_GEO_XP_BIG : ORB_GEO_XP_SMALL; mat = big ? ORB_MAT_XP_BIG : ORB_MAT_XP_SMALL; }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos); mesh.position.y = 0.5; scene.add(mesh);
  gems.push({ mesh, value, pulled: false, kind });
}
function spawnScroll(pos: THREE.Vector3) {
  const mesh = createScrollPickup(); mesh.position.copy(pos); mesh.position.y = 0.6; scene.add(mesh);
  scrolls.push({ mesh, bob: Math.random() * Math.PI * 2 });
}

// VS 风格地面拾取：回血丹 / 聚灵磁石 / 净世清屏雷（独有网格，拾取时释放资源）
function floorItemMesh(kind: FloorItem["kind"]) {
  const g = new THREE.Group();
  if (kind === "heal") {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), new THREE.MeshStandardMaterial({ color: 0xff7090, emissive: 0xc01a3a, emissiveIntensity: 1.2 })));
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.07), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7 }));
    const h = v.clone(); h.rotation.z = Math.PI / 2; g.add(v, h);
  } else if (kind === "magnet") {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.1, 10, 18, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5ec8ff, emissive: 0x2a86ff, emissiveIntensity: 1.3 }));
    m.rotation.z = Math.PI; g.add(m);
    for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x801010, emissiveIntensity: 0.9 })); t.position.set(sx * 0.26, -0.06, 0); g.add(t); }
  } else {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff8a1b, emissiveIntensity: 1.4 })));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 28), new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffc24a, emissiveIntensity: 1.0, transparent: true, opacity: 0.7, depthWrite: false }));
    ring.rotation.x = Math.PI / 2; g.add(ring);
  }
  return g;
}
function spawnFloorItem(pos: THREE.Vector3, kind: FloorItem["kind"]) {
  const mesh = floorItemMesh(kind); mesh.position.copy(pos); mesh.position.y = 0.6; scene.add(mesh);
  floorItems.push({ mesh, kind, bob: Math.random() * Math.PI * 2 });
}
function collectFloorItem(kind: FloorItem["kind"], pos: THREE.Vector3) {
  if (kind === "heal") {
    heal(maxHp * TUNING.pickup.healFrac);
    addEffect(createPickupBeam(pos, 0xff7090)); spawnFloater("回血", player.position, "#ff90a6", 1.0);
  } else if (kind === "magnet") {
    for (const g of gems) g.pulled = true;
    addEffect(createPickupBeam(pos, 0x5ec8ff)); spawnFloater("聚灵·吸尽全场", player.position, "#7fd0ff", 1.2);
  } else { // bomb：清屏
    cameraShake = Math.max(cameraShake, 0.6);
    addEffect(createBindingField(player.position.clone(), 30, 3));
    spawnFloater("净世天雷", player.position, "#ffd166", 1.4);
    for (const e of enemies) { if (e.dead) continue; if (e.boss) damageEnemy(e, maxHp, ZF, false, false); else { e.hp = 0; killEnemy(e, ZF, false); } }
  }
}

// ---------- 结束 / HUD ----------
function endRun() {
  if (gameOver) return;
  gameOver = true; running = false; playerHp = 0;
  const power = Math.round(spiritPower);
  let best = 0;
  try { best = Number(localStorage.getItem("xj_bestPower")) || 0; if (power > best) { best = power; localStorage.setItem("xj_bestPower", String(best)); } } catch { best = power; }
  overTitle.textContent = "道消身陨";
  overBody.innerHTML = `吸收灵力 <b style="color:var(--jade);font-size:20px">${power.toLocaleString()}</b>　最高 <b>${best.toLocaleString()}</b><br/>存活 <b>${formatTime(runTime)}</b>　击杀 <b>${kills}</b>　境界 <b>${level}</b> 重<br/>法宝 ${equippedTreasures.length} · 背包 ${treasureBag.length} · 功法 ${arts.length}<br/>${synergyText(equippedTreasures)}`;
  overScreen.classList.add("visible");
}
// HUD 每帧都被调用，但这些值大多帧间不变 —— 缓存上次写入的显示值，仅在变化时改 DOM，
// 省掉每帧 8 次 textContent/style 写入触发的样式重算。
let _hudHp = -1, _hudMaxHp = -1, _hudLv = -1, _hudStones = -1, _hudKills = -1, _hudXp = -1, _hudPower = -1;
let _hudTime = "";
function updateHud() {
  const power = Math.round(spiritPower);
  if (power !== _hudPower) { _hudPower = power; powerEl.textContent = power.toLocaleString(); }
  const hp = Math.max(0, Math.round(playerHp));
  if (hp !== _hudHp || maxHp !== _hudMaxHp) {
    _hudHp = hp; _hudMaxHp = maxHp;
    hpFill.style.width = `${Math.max(0, (playerHp / maxHp) * 100)}%`;
    hpText.textContent = `${hp}/${maxHp}`;
  }
  if (level !== _hudLv) { _hudLv = level; lvEl.textContent = String(level); }
  if (spiritStones !== _hudStones) { _hudStones = spiritStones; stonesEl.textContent = String(spiritStones); }
  if (kills !== _hudKills) { _hudKills = kills; killsEl.textContent = String(kills); }
  const t = formatTime(runTime);
  if (t !== _hudTime) { _hudTime = t; timeEl.textContent = t; }
  const xp = Math.round((exp / expToNext) * 1000);
  if (xp !== _hudXp) { _hudXp = xp; xpFill.style.width = `${xp / 10}%`; }
}
function formatTime(t: number) {
  const m = Math.floor(t / 60).toString().padStart(2, "0");
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ---------- 主循环 ----------
const FRAME_MIN = 1000 / 61; // 限帧 ~60fps：高刷屏(120/144Hz)下省约一半 CPU/电量，60Hz 不受影响
let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  if (now - last < FRAME_MIN) return; // 距上帧太近则跳过本次绘制（不更新 last，时间累积到下次）
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (running && !isPaused()) step(dt);
  updateEffects(dt); updateFloaters(dt); updateCamera(dt);
  renderer.render(scene, camera);
}
function step(dt: number) {
  runTime += dt;
  rebuildEnemyGrid(); // 本帧碰撞/范围查询前重建空间网格（敌人本帧尚未移动，弹幕碰撞用此快照一致）

  const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const kz = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  let mx = kx + moveVec.x, mz = kz + moveVec.y;
  const mlen = Math.hypot(mx, mz);
  if (mlen > 1) { mx /= mlen; mz /= mlen; }
  const speed = BASE_MOVE_SPEED + stats.moveSpeed;
  player.position.x += mx * speed * dt; // 无边界：移除地图夹取，主角可无限移动
  player.position.z += mz * speed * dt;
  if (mlen > 0.01) player.rotation.y = Math.atan2(mx, mz);
  updateChunks(); // 按主角位置自动生成/删减地面区块

  if (invuln > 0) invuln -= dt;
  heal(stats.regen * dt);

  // 每件法宝按自身 CD 自动施法（旋刃常驻旋转、无 CD，由 syncBladeRings 维护，不在此走 CD）
  for (const t of equippedTreasures) {
    if (t.skill === "bladering") continue;
    t.cdLeft = (t.cdLeft ?? 0) - dt;
    if (t.cdLeft <= 0) { fireWeapon(t); t.cdLeft = Math.max(0.1, starCd(t) * stats.cdMul); }
  }
  updateTreasureCooldowns(); // 同步底栏冷却遮罩
  // 羁绊特性：持续光环 / 剑雨·天雷风暴 / 免死护盾充能
  if (flags.auraDps > 0) {
    const ar = flags.auraRadius, ar2 = ar * ar;
    forEnemiesNear(player.position.x, player.position.z, ar, (e) => {
      if (e.dead || e.mesh.position.distanceToSquared(player.position) > ar2) return;
      e.hp -= flags.auraDps * dt; e.flash = Math.max(e.flash, 0.05); if (e.hp <= 0) killEnemy(e, ZF);
    });
  }
  if (flags.swordStorm > 0) { stormSwordT -= dt; if (stormSwordT <= 0) { stormSwordT = flags.swordStorm; swordStormCast(); } }
  if (flags.thunderStorm > 0) { stormThunderT -= dt; if (stormThunderT <= 0) { stormThunderT = flags.thunderStorm; thunderStormCast(); } }
  if (flags.shieldInterval > 0 && !shieldReady) { shieldT -= dt; if (shieldT <= 0) shieldReady = true; }
  if (flags.quakeInterval > 0) { quakeT -= dt; if (quakeT <= 0) { quakeT = flags.quakeInterval; quakeCast(); } }

  updateProjectiles(dt);
  updateEnemies(dt);
  updateGems(dt);
  updateScrolls(dt);
  updateFloorItems(dt);
  updateSigils(dt);

  spawnTimer -= dt;
  const interval = Math.max(TUNING.enemy.spawnMin, TUNING.enemy.spawnStart - runTime / TUNING.enemy.spawnRampSec);
  if (spawnTimer <= 0) {
    spawnTimer = interval;
    const count = 1 + Math.floor(runTime / TUNING.enemy.countEverySec);
    const eliteChance = Math.min(TUNING.enemy.eliteChanceMax, runTime / TUNING.enemy.eliteChanceRampSec);
    for (let i = 0; i < count && enemies.length < TUNING.enemy.maxAlive; i++) spawnEnemy(Math.random() < eliteChance);
  }
  bossTimer += dt;
  if (bossTimer >= TUNING.boss.intervalSec && !enemies.some((e) => e.boss && !e.dead)) { bossTimer = 0; spawnBoss(); }

  updateHud();
}

function updateProjectiles(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.kind === "straight") {
      p.mesh.position.addScaledVector(p.dir!, p.speed! * dt); p.mesh.rotateZ(dt * 18); p.life -= dt;
      let stop = false; // 非穿透弹命中即止（候选很少，置位跳过余者即可）
      forEnemiesNear(p.mesh.position.x, p.mesh.position.z, MAX_ENEMY_RADIUS + 0.6, (e) => {
        if (stop || e.dead || p.hit.has(e)) return;
        const rr = e.radius + 0.6;
        if (e.mesh.position.distanceToSquared(p.mesh.position) <= rr * rr) {
          p.hit.add(e); const r = critRoll(p.base); damageEnemy(e, r.dmg, p.dir!, r.crit); applyHitTraits(e, p.traits, p.base);
          if (!p.pierce) { p.life = 0; stop = true; }
        }
      });
    } else if (p.kind === "homing") {
      const tg = nearestEnemyTo(p.mesh.position); // 以子弹自身位置索敌，而非玩家位置
      if (tg) {
        _homeDir.copy(tg.mesh.position).sub(p.mesh.position); _homeDir.y = 0;
        if (_homeDir.lengthSq() > 1e-6) { _homeDir.normalize(); p.dir!.lerp(_homeDir, 0.2); p.dir!.normalize(); }
      }
      p.mesh.position.addScaledVector(p.dir!, p.speed! * dt); p.mesh.rotation.y += dt * 6; p.life -= dt;
      let hit = false;
      forEnemiesNear(p.mesh.position.x, p.mesh.position.z, MAX_ENEMY_RADIUS + 0.5, (e) => {
        if (hit || e.dead) return;
        const rr = e.radius + 0.5;
        if (e.mesh.position.distanceToSquared(p.mesh.position) <= rr * rr) {
          const r = critRoll(p.base); damageEnemy(e, r.dmg, p.dir!, r.crit); applyHitTraits(e, p.traits, p.base);
          if (e.dead && (p.fission ?? 0) > 0) spawnFission(p, e.mesh.position.clone()); // 击杀 → 裂变
          p.life = 0; hit = true;
        }
      });
    } else if (p.kind === "glaive") {
      // 圆弧轨迹：起点切线沿 dir，向 perp 侧弯，形成抛刀回旋弧
      p.angle! += p.ang! * dt;
      const r = p.radius!, sn = Math.sin(p.angle!), cc = 1 - Math.cos(p.angle!);
      p.mesh.position.set(
        p.center!.x + p.dir!.x * r * sn + p.perp!.x * r * cc,
        1.0,
        p.center!.z + p.dir!.z * r * sn + p.perp!.z * r * cc,
      );
      p.mesh.rotation.y += dt * 11; p.life -= dt;
      forEnemiesNear(p.mesh.position.x, p.mesh.position.z, MAX_ENEMY_RADIUS + 0.95, (e) => {
        if (e.dead || p.hit.has(e)) return;
        const rr = e.radius + 0.95;
        if (e.mesh.position.distanceToSquared(p.mesh.position) <= rr * rr) { p.hit.add(e); const rc = critRoll(p.base); damageEnemy(e, rc.dmg, p.dir!, rc.crit); applyHitTraits(e, p.traits, p.base); }
      });
    } else { // orbit / 旋刃
      p.angle! += p.ang! * dt;
      p.mesh.position.set(player.position.x + Math.cos(p.angle!) * p.radius!, 1.0, player.position.z + Math.sin(p.angle!) * p.radius!);
      if (p.spin) p.mesh.rotation.y += dt * p.spin; else p.mesh.rotation.y = -p.angle!; // 旋刃自身高速旋转
      p.life -= dt;
      forEnemiesNear(p.mesh.position.x, p.mesh.position.z, MAX_ENEMY_RADIUS + 0.6, (e) => {
        if (e.dead) return;
        const rr = e.radius + 0.6;
        if (e.mesh.position.distanceToSquared(p.mesh.position) <= rr * rr) {
          const lastT = p.lastHit!.get(e) ?? -1;
          if (runTime - lastT >= 0.35) { p.lastHit!.set(e, runTime); const rc = critRoll(p.base); damageEnemy(e, rc.dmg, ZF, rc.crit); applyHitTraits(e, p.traits, p.base); }
        }
      });
      // 常驻旋刃：清理 lastHit 中早已离场的敌人，避免长局内 Map 无限增长
      if (p.spin && p.lastHit!.size > 24) for (const [e, tm] of p.lastHit!) if (runTime - tm > 1) p.lastHit!.delete(e);
    }
    if (p.life <= 0) { scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
}

// 符阵：每帧推进所有停留法阵，按 tick 周期对范围内敌人造成伤害并施加 trait（减速等）
function updateSigils(dt: number) {
  for (let i = sigils.length - 1; i >= 0; i--) {
    const s = sigils[i];
    s.life -= dt; s.tick -= dt;
    if (s.tick <= 0) {
      s.tick = 0.3;
      addEffect(createBindingField(s.pos.clone(), s.radius, 1));
      aoeDamage(s.pos, s.radius, s.base, ZF, s.traits);
    }
    if (s.life <= 0) sigils.splice(i, 1);
  }
}

const _em = new THREE.Vector3();
const _homeDir = new THREE.Vector3(); // 追踪子弹索敌方向的复用临时向量
function updateEnemies(dt: number) {
  for (const e of enemies) {
    if (e.dead) continue;
    const base = (e.elite ? 1.2 : 1) * (e.boss ? 1.9 : 1);
    if (e.flash > 0) { e.flash -= dt; e.mesh.scale.setScalar(base * (1 + Math.max(0, e.flash) * 1.6)); }
    else if (e.mesh.scale.x !== base) e.mesh.scale.setScalar(base);
    if (e.burnT > 0) { // 灼烧 DoT（仅燃烧中之敌进此分支，性能可控）
      e.burnT -= dt; e.hp -= e.burnDps * dt; e.flash = Math.max(e.flash, 0.05);
      if (e.hp <= 0) { killEnemy(e, ZF, false); continue; }
    }
    const toPlayer = _em.copy(player.position).sub(e.mesh.position); toPlayer.y = 0;
    const dist = toPlayer.length();
    const sp = e.slow > 0 ? e.speed * 0.45 : e.speed;
    if (e.slow > 0) e.slow -= dt;
    if (dist > 0.001) { toPlayer.normalize(); e.mesh.position.addScaledVector(toPlayer, sp * dt); e.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z); }
    // 击退积分 + 衰减（叠加在趋近移动之上：受击瞬间被弹开，随后恢复进逼）
    if (e.knockX !== 0 || e.knockZ !== 0) {
      e.mesh.position.x += e.knockX * dt; e.mesh.position.z += e.knockZ * dt;
      const decay = Math.max(0, 1 - dt * TUNING.knockback.decay);
      e.knockX *= decay; e.knockZ *= decay;
      if (Math.abs(e.knockX) + Math.abs(e.knockZ) < 0.06) { e.knockX = 0; e.knockZ = 0; }
    }
    e.touch -= dt;
    if (dist <= e.radius + 0.7 && e.touch <= 0) { e.touch = TUNING.enemy.touchCd; hurt(e.touchDmg); }
  }
  // 清扫已死敌人（一次性）
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
}
function updateGems(dt: number) {
  const pull = TUNING.xp.pickupBase + stats.pickupRadius;
  const pull2 = pull * pull;
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i]; const distSq = g.mesh.position.distanceToSquared(player.position);
    if (distSq <= pull2) g.pulled = true;
    if (g.pulled) {
      _em.copy(player.position); _em.y = 0.5; g.mesh.position.lerp(_em, Math.min(1, dt * 9));
      if (distSq <= 0.64) {
        scene.remove(g.mesh); gems.splice(i, 1);
        if (g.kind === "stone") { spiritStones += g.value; spawnFloater(`灵石 +${g.value}`, player.position, "#ffd166", 0.8); updateHud(); }
        else gainExp(g.value);
        continue;
      }
    }
    g.mesh.rotation.y += dt * 3;
  }
}
function updateScrolls(dt: number) {
  for (let i = scrolls.length - 1; i >= 0; i--) {
    const s = scrolls[i]; s.bob += dt * 3;
    s.mesh.position.y = 0.6 + Math.sin(s.bob) * 0.12; s.mesh.rotation.y += dt * 1.6;
    if (s.mesh.position.distanceToSquared(player.position) <= 1.4 * 1.4) {
      addEffect(createPickupBeam(s.mesh.position.clone(), 0x9ddcff)); scene.remove(s.mesh); disposeObject(s.mesh); scrolls.splice(i, 1); openArtShop(); return;
    }
  }
}
function updateFloorItems(dt: number) {
  for (let i = floorItems.length - 1; i >= 0; i--) {
    const it = floorItems[i]; it.bob += dt * 3;
    it.mesh.position.y = 0.6 + Math.sin(it.bob) * 0.12; it.mesh.rotation.y += dt * 1.8;
    if (it.mesh.position.distanceToSquared(player.position) <= 1.5 * 1.5) {
      collectFloorItem(it.kind, it.mesh.position.clone());
      scene.remove(it.mesh); disposeObject(it.mesh); floorItems.splice(i, 1);
    }
  }
}
function updateEffects(dt: number) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.age += dt; e.update(dt, Math.min(1, e.age / e.duration));
    if (e.age >= e.duration) { scene.remove(e.object); disposeObject(e.object); effects.splice(i, 1); }
  }
}
const _proj = new THREE.Vector3();
let viewW = window.innerWidth, viewH = window.innerHeight; // 缓存视口尺寸，避免逐帧读 innerWidth 触发 reflow
function updateFloaters(dt: number) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.age += dt; f.pos.y += dt * 0.72;
    _proj.copy(f.pos).project(camera);
    // 用 transform（合成层）而非 left/top（触发布局），并保留 CSS 的居中位移
    f.el.style.transform = `translate3d(${(_proj.x * 0.5 + 0.5) * viewW}px, ${(-_proj.y * 0.5 + 0.5) * viewH}px, 0) translate(-50%, -50%)`;
    f.el.style.opacity = String(Math.max(0, 1 - f.age / f.life));
    if (f.age >= f.life) { f.el.style.display = "none"; floaterPool.push(f.el); floaters.splice(i, 1); } // 回池复用
  }
}
function updateCamera(dt: number) {
  const desired = player.position.clone().add(CAM_OFFSET);
  if (cameraShake > 0) { cameraShake = Math.max(0, cameraShake - dt * 1.6); desired.x += (Math.random() - 0.5) * cameraShake * 2; desired.z += (Math.random() - 0.5) * cameraShake * 2; }
  camera.position.lerp(desired, Math.min(1, dt * 6));
  camera.lookAt(player.position.x, 0.6, player.position.z);
}

window.addEventListener("resize", () => {
  viewW = window.innerWidth; viewH = window.innerHeight;
  camera.aspect = viewW / viewH; camera.updateProjectionMatrix(); renderer.setSize(viewW, viewH);
});

startScreen.classList.add("visible");
updateCamera(1);
animate();
