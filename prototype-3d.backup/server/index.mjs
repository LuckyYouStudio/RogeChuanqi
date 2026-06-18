import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "data", "db.json");
const PORT = Number(process.env.PORT ?? 8787);
const raidRooms = new Map();

const STARTER_ITEMS = [
  { itemId: "wood_sword", name: "青竹飞剑", kind: "weapon", slot: "weapon", rarity: "common", value: 10, stats: { attack: 4 } },
  { itemId: "cloth_robe", name: "灰麻法袍", kind: "armor", slot: "robe", rarity: "common", value: 8, stats: { defense: 2 } },
  { itemId: "spring_pill", name: "回春丹", kind: "consumable", slot: "consumable", rarity: "common", value: 15, stats: { heal: 25 } },
  { itemId: "jade_slip_fire", name: "残篇：青元剑诀", kind: "skill_book", slot: "bag", rarity: "uncommon", value: 90, stats: {} },
];

const STARTER_SKILLS = [
  { skillId: "sword_qi", name: "青元剑芒", type: "active", power: 34 },
  { skillId: "dash", name: "流云步", type: "active", power: 0 },
  { skillId: "thunder_seal", name: "掌心雷", type: "active", power: 46 },
  { skillId: "binding_array", name: "小五行困阵", type: "active", power: 18 },
  { skillId: "body_forging", name: "铁骨诀", type: "passive", power: 1 },
  { skillId: "spirit_sense", name: "神识探查", type: "passive", power: 1 },
];

const LOOT_CATALOG = [
  { itemId: "jade_slip_broken_sun", name: "残篇：青元剑诀", kind: "功法玉简", slot: "bag", rarity: "uncommon", value: 90, stats: {} },
  { itemId: "low_spirit_stone", name: "下品灵石", kind: "灵石", slot: "bag", rarity: "common", value: 25, stats: {} },
  { itemId: "mid_spirit_stone", name: "中品灵石", kind: "灵石", slot: "bag", rarity: "uncommon", value: 75, stats: {} },
  { itemId: "spring_pill_loot", name: "回春丹", kind: "丹药", slot: "bag", rarity: "common", value: 35, stats: {} },
  { itemId: "greenwood_artifact", name: "青木子母刃", kind: "法器", slot: "weapon", rarity: "uncommon", value: 70, stats: { attack: 7 } },
  { itemId: "ironleaf_robe", name: "金蚕法袍", kind: "道袍", slot: "robe", rarity: "uncommon", value: 65, stats: { defense: 4 } },
  { itemId: "mystic_map_fragment", name: "秘境残图", kind: "秘宝", slot: "bag", rarity: "rare", value: 160, stats: {} },
  { itemId: "binding_ring_shard", name: "定身灵戒碎片", kind: "秘宝", slot: "bag", rarity: "epic", value: 220, stats: {} },
  { itemId: "spirit_vein_core", name: "灵脉晶核", kind: "秘宝", slot: "bag", rarity: "rare", value: 180, stats: {} },
  { itemId: "blackiron_sword", name: "玄铁飞剑", kind: "法器", slot: "weapon", rarity: "rare", value: 180, stats: { attack: 13 } },
  { itemId: "rival_loot_bag", name: "敌修乾坤袋", kind: "秘宝", slot: "bag", rarity: "rare", value: 190, stats: {} },
];

const LOOT_BY_ITEM_ID = new Map(LOOT_CATALOG.map((item) => [item.itemId, item]));
const LOOT_BY_NAME_KIND = new Map(LOOT_CATALOG.map((item) => [`${item.name}:${item.kind}`, item]));
const ITEM_CATALOG = [...STARTER_ITEMS, ...LOOT_CATALOG];
const ITEM_BY_ITEM_ID = new Map(ITEM_CATALOG.map((item) => [item.itemId, item]));
const ITEM_BY_NAME_KIND = new Map(ITEM_CATALOG.map((item) => [`${item.name}:${item.kind}`, item]));
const SHOP_CATALOG = [
  { sku: "wood_sword", itemId: "wood_sword", stock: "common", price: 35 },
  { sku: "cloth_robe", itemId: "cloth_robe", stock: "common", price: 30 },
  { sku: "spring_pill", itemId: "spring_pill", stock: "common", price: 25 },
  { sku: "greenwood_artifact", itemId: "greenwood_artifact", stock: "limited", price: 160 },
  { sku: "ironleaf_robe", itemId: "ironleaf_robe", stock: "limited", price: 145 },
];
const MAX_EXTRACT_LOOT_COUNT = 18;
const DURABILITY_MIN_FACTOR = 0.35;
const REPAIR_RATE = 0.04;
const REFINE_MATERIAL_ID = "refine_sand";
const MAX_REFINE_LEVEL = 5;
const MAX_RAID_BAG_LOOT_COUNT = 18;
const MAX_EXTRACT_LOOT_VALUE = 1400;
const RAID_POOL_SIZE = 48;
const RAID_DURATION_MS = 180 * 1000;
const RAID_TIMEOUT_GRACE_MS = 5 * 1000;
const MATCH_MAX_PLAYERS = 6;
const MATCH_JOIN_WINDOW_MS = 5 * 60 * 1000;
const ENTITY_HIT_RANGE = 4.0;
const ENTITY_TARGET_POSITION_TOLERANCE = 3.5;
const ENTITY_HIT_COOLDOWN_MS = 250;
const ENTITY_HIT_FACING_DOT = 0.15;
const PLAYER_HIT_RANGE = 4.2;
const PLAYER_HIT_TARGET_POSITION_TOLERANCE = 3.2;
const PLAYER_HIT_COOLDOWN_MS = 360;
const PLAYER_MAX_SPEED = 18;
const PLAYER_POSITION_TOLERANCE = 4.5;
const EXTRACTION_POINT = { x: 18, z: -14 };
const EXTRACTION_RADIUS = 3.0;
const EXTRACTION_CHANNEL_MS = 2800;
const SEARCH_SOURCE_POSITIONS = new Map([
  ["search_1", { x: -16.2, z: 12.6 }],
  ["search_2", { x: -8, z: 6 }],
  ["search_3", { x: 7, z: 9 }],
  ["search_4", { x: -13, z: -7 }],
  ["search_5", { x: 10, z: -8 }],
  ["search_6", { x: 0, z: -14 }],
]);
const RUNE_CATALOG = new Map([
  ["sword_qi_edge", { runeId: "sword_qi_edge", name: "锋芒剑痕", attackKind: "sword_qi", damageBonus: 6 }],
  ["thunder_focus", { runeId: "thunder_focus", name: "掌心雷印", attackKind: "thunder_seal", damageBonus: 8 }],
  ["spirit_sense_flow", { runeId: "spirit_sense_flow", name: "神识流转", attackKind: "utility", searchSpeedBonus: 0.15 }],
]);
const PLAYER_START = { x: -17, z: 13 };
const RIVAL_SPAWNS = [
  { sourceId: "rival_1", x: -4, z: 18, index: 0, maxHp: 78, currentHp: 78 },
  { sourceId: "rival_2", x: 14, z: 7, index: 1, maxHp: 90, currentHp: 90 },
  { sourceId: "rival_3", x: -20, z: -13, index: 2, maxHp: 102, currentHp: 102 },
];

function looksCorruptText(value) {
  return typeof value === "string" && (/^\?+$/.test(value) || /[鎾绉鐏閬娉鍔鏃澶绗枃畧鏁宸鍚]/.test(value));
}

function fallbackCatalogForCorruptItem(item) {
  if (!item || typeof item !== "object") return null;
  if (item.itemId && ITEM_BY_ITEM_ID.has(item.itemId)) return ITEM_BY_ITEM_ID.get(item.itemId);
  const value = Number(item.value ?? 0);
  if (value >= 210) return ITEM_BY_ITEM_ID.get("binding_ring_shard");
  if (value >= 175) return ITEM_BY_ITEM_ID.get(item.slot === "weapon" ? "blackiron_sword" : "spirit_vein_core");
  if (value >= 150) return ITEM_BY_ITEM_ID.get("mystic_map_fragment");
  if (value >= 85) return ITEM_BY_ITEM_ID.get("jade_slip_broken_sun");
  if (value >= 65) return ITEM_BY_ITEM_ID.get(item.slot === "robe" ? "ironleaf_robe" : "greenwood_artifact");
  if (value >= 35) return ITEM_BY_ITEM_ID.get("spring_pill_loot");
  return ITEM_BY_ITEM_ID.get("low_spirit_stone");
}

function normalizeStoredItem(item) {
  if (!item || typeof item !== "object") return false;
  const corrupt = looksCorruptText(item.name) || looksCorruptText(item.kind);
  const catalog = corrupt ? fallbackCatalogForCorruptItem(item) : item.itemId ? ITEM_BY_ITEM_ID.get(item.itemId) : null;
  if (!catalog) return false;
  let changed = false;
  const keys = corrupt ? ["itemId", "name", "kind", "slot", "rarity", "value"] : ["name", "kind", "slot", "rarity"];
  for (const key of keys) {
    if (item[key] !== catalog[key]) {
      item[key] = catalog[key];
      changed = true;
    }
  }
  item.stats ??= {};
  return changed;
}

function normalizeStoredSkill(skill) {
  if (!skill || typeof skill !== "object") return false;
  const catalog = STARTER_SKILLS.find((item) => item.skillId === skill.skillId);
  if (!catalog) return false;
  let changed = false;
  for (const key of ["name", "type", "power"]) {
    if (skill[key] !== catalog[key]) {
      skill[key] = catalog[key];
      changed = true;
    }
  }
  return changed;
}

async function ensureDb() {
  await mkdir(dirname(DB_PATH), { recursive: true });
  if (!existsSync(DB_PATH)) {
    await writeFile(DB_PATH, JSON.stringify({ users: [], sessions: [], raids: [], matchLootClaims: {}, matchEntityStates: {}, matchSearchClaims: {} }, null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDb();
  const db = JSON.parse(await readFile(DB_PATH, "utf8"));
  db.users ??= [];
  db.sessions ??= [];
  db.raids ??= [];
  db.matchLootClaims ??= {};
  db.matchEntityStates ??= {};
  db.matchSearchClaims ??= {};
  let migrated = false;
  for (const raid of db.raids) raid.events ??= [];
  for (const user of db.users) {
    if (!user.usernameKey) {
      user.usernameKey = normalizeUsername(user.username);
      migrated = true;
    }
    user.profile ??= {};
    user.profile.stash ??= [];
    user.profile.loadout ??= { gear: {}, skills: [], consumables: [] };
    user.profile.loadout.gear ??= {};
    user.profile.loadout.skills ??= [];
    user.profile.loadout.consumables ??= [];
    if ("safeBox" in user.profile.loadout) {
      delete user.profile.loadout.safeBox;
      migrated = true;
    }
    if ("insuredGear" in user.profile.loadout) {
      delete user.profile.loadout.insuredGear;
      migrated = true;
    }
    user.profile.skills ??= [];
    user.profile.materials ??= {};
    user.profile.materials[REFINE_MATERIAL_ID] ??= 0;
    for (const item of user.profile.stash) migrated = normalizeStoredItem(item) || migrated;
    for (const skill of user.profile.skills) migrated = normalizeStoredSkill(skill) || migrated;
    const known = new Set(user.profile.skills.map((skill) => skill.skillId));
    for (const skill of STARTER_SKILLS) {
      if (!known.has(skill.skillId)) user.profile.skills.push({ ...skill });
    }
  }
  if (migrated) await writeDb(db);
  return db;
}

async function writeDb(db) {
  const tempPath = `${DB_PATH}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(db, null, 2), "utf8");
  await rename(tempPath, DB_PATH);
}

function hashPassword(password, salt = randomUUID()) {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password, user.passwordSalt).hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeUsername(username) {
  return String(username ?? "").trim().toLowerCase();
}

function cleanUsername(username) {
  return String(username ?? "").trim();
}

function validateAuthInput(username, password) {
  const clean = cleanUsername(username);
  const normalized = normalizeUsername(clean);
  const pass = String(password ?? "");
  if (clean.length < 3 || clean.length > 18) throw new Error("账号需要 3-18 位");
  if (!/^[\p{Script=Han}A-Za-z0-9_]+$/u.test(clean)) throw new Error("账号只能使用中文、字母、数字或下划线");
  if (pass.length < 4 || pass.length > 32) throw new Error("密码需要 4-32 位");
  return { username: clean, usernameKey: normalized, password: pass };
}

function makeInstance(item) {
  return { ...item, instanceId: randomUUID(), bound: false, durability: 100 };
}

function findLootConfig(item) {
  if (!item || typeof item !== "object") return null;
  if (item.itemId && ITEM_BY_ITEM_ID.has(item.itemId)) return ITEM_BY_ITEM_ID.get(item.itemId);
  return ITEM_BY_NAME_KIND.get(`${item.name}:${item.kind}`) ?? null;
}

function rollLootConfig(index) {
  const table = [
    "low_spirit_stone",
    "low_spirit_stone",
    "spring_pill_loot",
    "jade_slip_broken_sun",
    "greenwood_artifact",
    "ironleaf_robe",
    "mid_spirit_stone",
    "mystic_map_fragment",
    "spirit_vein_core",
    index % 9 === 0 ? "binding_ring_shard" : "blackiron_sword",
  ];
  return LOOT_BY_ITEM_ID.get(table[Math.floor(Math.random() * table.length)]);
}

function raidPoolSource(index) {
  if (index < 9) return { source: "ground", sourceId: `ground_${index + 1}`, x: Math.round((Math.random() * 46 - 23) * 10) / 10, z: Math.round((Math.random() * 42 - 21) * 10) / 10 };
  if (index < 25) {
    const sourceId = `search_${(index - 9) % 6 + 1}`;
    return { source: "search", sourceId, ...(SEARCH_SOURCE_POSITIONS.get(sourceId) ?? { x: 0, z: 0 }) };
  }
  if (index < 37) return { source: "enemy", sourceId: `enemy_${(index - 25) % 12 + 1}`, x: 0, z: 0 };
  return { source: "rival", sourceId: `rival_${(index - 37) % 3 + 1}`, x: 0, z: 0 };
}

function createRaidLootPool(size = RAID_POOL_SIZE) {
  return Array.from({ length: size }, (_, index) => {
    const item = rollLootConfig(index);
    const source = raidPoolSource(index);
    return {
      claimToken: randomUUID(),
      itemId: item.itemId,
      ...source,
      picked: false,
      secured: false,
      claimed: false,
    };
  });
}

function createPlayerDropLoot(raid, peer, position) {
  const item = LOOT_BY_ITEM_ID.get("rival_loot_bag") ?? rollLootConfig(Math.floor(Math.random() * 99));
  const x = Number(position?.x ?? position?.playerX ?? 0);
  const z = Number(position?.z ?? position?.playerZ ?? 0);
  const entry = {
    claimToken: randomUUID(),
    itemId: item.itemId,
    source: "player",
    sourceId: peer.context.peerId,
    ownerUserId: peer.context.userId,
    ownerUsername: peer.context.username,
    x,
    z,
    picked: false,
    secured: false,
    claimed: false,
    dropped: true,
    droppedAt: new Date().toISOString(),
  };
  raid.lootPool ??= [];
  raid.lootPool.push(entry);
  return {
    claimToken: entry.claimToken,
    source: entry.source,
    sourceId: entry.sourceId,
    x: entry.x,
    z: entry.z,
    ...item,
  };
}

function publicLootDrop(entry) {
  const item = ITEM_BY_ITEM_ID.get(entry.itemId);
  if (!item) return null;
  return {
    claimToken: entry.claimToken,
    source: entry.source,
    sourceId: entry.sourceId,
    x: entry.x,
    z: entry.z,
    ...item,
  };
}

function itemDurability(item) {
  return Math.max(0, Math.min(100, Number(item?.durability ?? 100)));
}

function durabilityFactor(item) {
  return DURABILITY_MIN_FACTOR + (itemDurability(item) / 100) * (1 - DURABILITY_MIN_FACTOR);
}

function scaledStat(item, stat) {
  return Math.floor(Number(item?.stats?.[stat] ?? 0) * durabilityFactor(item));
}

function isGearItem(item) {
  return ["weapon", "robe", "ring", "talisman"].includes(item?.slot) || item?.kind === "armor";
}

function repairCost(item) {
  const missing = Math.max(0, 100 - itemDurability(item));
  return missing > 0 ? Math.max(1, Math.ceil(missing * Number(item?.value ?? 1) * REPAIR_RATE)) : 0;
}

function applyLoadoutDurabilityWear(user, raid, amount, reason) {
  const ids = new Set(Object.values(raid.loadoutSnapshot?.gear ?? {}).filter(Boolean));
  const damaged = [];
  for (const item of user.profile.stash) {
    if (!ids.has(item.instanceId) || !isGearItem(item)) continue;
    const before = itemDurability(item);
    const after = Math.max(0, before - amount);
    item.durability = after;
    if (after !== before) damaged.push({ instanceId: item.instanceId, itemId: item.itemId, before, after });
  }
  if (damaged.length > 0) {
    appendRaidEvent(raid, "gear_durability_damaged", {
      reason,
      amount,
      count: damaged.length,
      minDurability: damaged.reduce((min, item) => Math.min(min, item.after), 100),
    });
  }
  return damaged;
}

function repairStashItem(user, instanceId) {
  const item = user.profile.stash.find((entry) => entry.instanceId === instanceId);
  if (!item) throw new Error("仓库物品不存在");
  if (!isGearItem(item)) throw new Error("只有装备可以修理");
  const cost = repairCost(item);
  if (cost <= 0) throw new Error("装备耐久已满");
  if (user.profile.silver < cost) throw new Error("灵石不足，无法修理");
  const before = itemDurability(item);
  user.profile.silver -= cost;
  item.durability = 100;
  return { item, cost, before, after: 100, silver: user.profile.silver };
}

function createLoadoutGearDeathDrops(user, raid, ownerPeerId, position, reason = "death") {
  const x = Number(position?.x ?? position?.playerX ?? PLAYER_START.x);
  const z = Number(position?.z ?? position?.playerZ ?? PLAYER_START.z);
  const gearEntries = Object.entries(raid.loadoutSnapshot?.gear ?? {}).filter(([, instanceId]) => Boolean(instanceId));
  const drops = [];
  for (const [slot, instanceId] of gearEntries) {
    const stashIndex = user.profile.stash.findIndex((item) => item.instanceId === instanceId);
    if (stashIndex < 0) continue;
    const item = user.profile.stash[stashIndex];
    if (item.bound) continue;
    const angle = (drops.length / Math.max(1, gearEntries.length)) * Math.PI * 2;
    const entry = {
      claimToken: randomUUID(),
      itemId: item.itemId,
      source: "player",
      sourceId: ownerPeerId || raid.raidId,
      ownerUserId: user.userId,
      ownerUsername: user.username,
      ownerInstanceId: item.instanceId,
      x: x + Math.cos(angle) * 1.05,
      z: z + Math.sin(angle) * 1.05,
      picked: false,
      secured: false,
      claimed: false,
      dropped: true,
      droppedAt: new Date().toISOString(),
      loadoutDrop: true,
      dropReason: reason,
    };
    raid.lootPool ??= [];
    raid.lootPool.push(entry);
    user.profile.stash.splice(stashIndex, 1);
    if (user.profile.loadout?.gear?.[slot] === instanceId) user.profile.loadout.gear[slot] = null;
    const drop = publicLootDrop(entry);
    if (drop) drops.push(drop);
  }
  if (drops.length > 0) {
    appendRaidEvent(raid, "loadout_gear_dropped", {
      reason,
      lootCount: drops.length,
      lootValue: drops.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
    });
  }
  return drops;
}

function createPlayerDeathLootDrops(db, targetRaid, targetPeer, attackerPeerId, position) {
  const x = Number(position?.x ?? position?.playerX ?? 0);
  const z = Number(position?.z ?? position?.playerZ ?? 0);
  const targetUser = db.users.find((item) => item.userId === targetPeer.context.userId);
  const carriedEntries = (targetRaid.lootPool ?? []).filter((entry) => entry.picked && !entry.claimed);
  const drops = [];
  carriedEntries.forEach((entry, index) => {
    const angle = (index / Math.max(1, carriedEntries.length)) * Math.PI * 2;
    entry.picked = false;
    entry.secured = false;
    entry.pickPosition = null;
    entry.dropped = true;
    entry.droppedAt = new Date().toISOString();
    entry.x = x + Math.cos(angle) * 0.8;
    entry.z = z + Math.sin(angle) * 0.8;
    delete db.matchLootClaims?.[entry.claimToken];
    syncMatchLootDiscard(db, targetRaid, entry);
    const drop = publicLootDrop(entry);
    if (drop) drops.push(drop);
  });
  if (targetUser) {
    applyLoadoutDurabilityWear(targetUser, targetRaid, 20, "pvp_down");
    drops.push(...createLoadoutGearDeathDrops(targetUser, targetRaid, targetPeer.context.peerId, { x, z }, "pvp_down"));
  }
  if (drops.length > 0) {
    appendRaidEvent(targetRaid, "player_loot_dropped", {
      reason: "pvp_down",
      lootCount: drops.length,
      lootValue: drops.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      killerPeerId: attackerPeerId,
    });
    return drops;
  }
  const fallback = createPlayerDropLoot(targetRaid, targetPeer, { x, z });
  return fallback ? [fallback] : [];
}

function createRaidEntitySpawns() {
  const enemies = Array.from({ length: 12 }, (_, index) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 14 + Math.random() * 18;
    return {
      sourceId: `enemy_${index + 1}`,
      x: Math.round((PLAYER_START.x + Math.cos(angle) * radius) * 10) / 10,
      z: Math.round((PLAYER_START.z + Math.sin(angle) * radius) * 10) / 10,
      elite: index % 5 === 0,
      maxHp: index % 5 === 0 ? 90 : 42,
      currentHp: index % 5 === 0 ? 90 : 42,
    };
  });
  return { enemies, rivals: RIVAL_SPAWNS };
}

function activeMatchCandidates(db, user) {
  const now = Date.now();
  const active = db.raids.filter((raid) => {
    if (raid.status !== "active" || raid.mapId !== "qinglan_ruins" || raid.userId === user.userId) return false;
    const age = now - Date.parse(raid.startedAt ?? 0);
    return Number.isFinite(age) && age >= 0 && age <= MATCH_JOIN_WINDOW_MS;
  });
  return active
    .map((raid) => ({
      matchId: raid.matchId ?? raid.raidId,
      startedAt: raid.startedAt,
      playerCount: db.raids.filter((item) => item.status === "active" && (item.matchId ?? item.raidId) === (raid.matchId ?? raid.raidId)).length,
    }))
    .filter((match, index, list) => list.findIndex((item) => item.matchId === match.matchId) === index)
    .filter((match) => match.playerCount < MATCH_MAX_PLAYERS)
    .sort((a, b) => String(a.startedAt ?? "").localeCompare(String(b.startedAt ?? "")));
}

function assignMatchId(db, user) {
  const existing = activeMatchCandidates(db, user)[0];
  if (existing) return existing.matchId;
  return randomUUID();
}

function raidMatchId(raid) {
  return raid.matchId ?? raid.raidId;
}

function findMatchSeedRaid(db, matchId) {
  return db.raids
    .filter((raid) => raid.status === "active" && (raid.matchId ?? raid.raidId) === matchId && raid.lootPool && raid.entitySpawns)
    .sort((a, b) => String(a.startedAt ?? "").localeCompare(String(b.startedAt ?? "")))[0] ?? null;
}

function createMatchWorld(db, matchId) {
  const seedRaid = findMatchSeedRaid(db, matchId);
  if (seedRaid) {
    return {
      lootPool: structuredClone(seedRaid.lootPool),
      entitySpawns: structuredClone(seedRaid.entitySpawns),
      seedRaidId: seedRaid.raidId,
    };
  }
  return {
    lootPool: createRaidLootPool(),
    entitySpawns: createRaidEntitySpawns(),
    seedRaidId: "",
  };
}

function activeMatchRaids(db, raid) {
  const matchId = raidMatchId(raid);
  return db.raids.filter((item) => item.status === "active" && (item.matchId ?? item.raidId) === matchId);
}

function matchEntityKey(raid, source, sourceId) {
  return `${raidMatchId(raid)}:${source}:${sourceId}`;
}

function applyMatchEntityState(db, raid, source, sourceId) {
  const state = db.matchEntityStates?.[matchEntityKey(raid, source, sourceId)];
  if (!state) return;
  for (const matchRaid of activeMatchRaids(db, raid)) {
    const entity = findRaidEntity(matchRaid, source, sourceId);
    if (!entity) continue;
    Object.assign(entity, structuredClone(state));
  }
}

function saveMatchEntityState(db, raid, source, entity) {
  if (!entity?.sourceId) return;
  const state = {
    x: Number(entity.x ?? 0),
    z: Number(entity.z ?? 0),
    currentHp: Number(entity.currentHp ?? entity.maxHp ?? 0),
    maxHp: Number(entity.maxHp ?? 0),
    dead: Boolean(entity.dead),
    damageTaken: Number(entity.damageTaken ?? 0),
    lastHitAt: entity.lastHitAt ?? null,
    lastHitClientTime: entity.lastHitClientTime ?? null,
    lastHitPosition: entity.lastHitPosition ?? null,
    deadAt: entity.deadAt ?? null,
    deathPosition: entity.deathPosition ?? null,
    aiState: entity.aiState ?? null,
    goalX: Number.isFinite(Number(entity.goalX)) ? Number(entity.goalX) : null,
    goalZ: Number.isFinite(Number(entity.goalZ)) ? Number(entity.goalZ) : null,
    extractProgress: Number.isFinite(Number(entity.extractProgress)) ? Number(entity.extractProgress) : null,
    lootBag: Array.isArray(entity.lootBag) ? entity.lootBag.slice(0, 8) : null,
  };
  db.matchEntityStates[matchEntityKey(raid, source, entity.sourceId)] = state;
  for (const matchRaid of activeMatchRaids(db, raid)) {
    const target = findRaidEntity(matchRaid, source, entity.sourceId);
    if (!target) continue;
    Object.assign(target, structuredClone(state));
  }
}

function findLootEntry(raid, token) {
  return (raid.lootPool ?? []).find((item) => item.claimToken === token) ?? null;
}

function isSpiritStoneEntry(entry) {
  const item = entry ? ITEM_BY_ITEM_ID.get(entry.itemId) : null;
  return item?.kind === "灵石";
}

function carriedLootCount(raid) {
  return (raid.lootPool ?? []).filter((entry) => entry.picked && !entry.claimed && !isSpiritStoneEntry(entry)).length;
}

function syncMatchLootDrop(db, raid, entry) {
  for (const matchRaid of activeMatchRaids(db, raid)) {
    const target = findLootEntry(matchRaid, entry.claimToken);
    if (!target) continue;
    target.dropped = true;
    target.droppedAt = entry.droppedAt;
    target.x = entry.x;
    target.z = entry.z;
  }
}

function syncMatchLootDiscard(db, raid, entry) {
  for (const matchRaid of activeMatchRaids(db, raid)) {
    const target = findLootEntry(matchRaid, entry.claimToken);
    if (!target) continue;
    target.picked = false;
    target.secured = false;
    target.pickPosition = null;
    target.dropped = true;
    target.droppedAt = entry.droppedAt;
    target.x = entry.x;
    target.z = entry.z;
  }
}

function importSharedPlayerLoot(db, raid, token) {
  if (!token || findLootEntry(raid, token)) return;
  const sourceRaid = db.raids.find((item) => (item.matchId ?? item.raidId) === raidMatchId(raid) && findLootEntry(item, token)?.source === "player");
  const sourceEntry = sourceRaid ? findLootEntry(sourceRaid, token) : null;
  if (!sourceEntry) return;
  raid.lootPool ??= [];
  raid.lootPool.push({
    ...sourceEntry,
    picked: false,
    secured: false,
    claimed: false,
    importedFromRaidId: sourceRaid.raidId,
  });
}

function publicLootPool(raid, db) {
  return (raid.lootPool ?? []).filter((entry) => !db?.matchLootClaims?.[entry.claimToken]).map((entry) => {
    const item = ITEM_BY_ITEM_ID.get(entry.itemId);
    return {
      claimToken: entry.claimToken,
      source: entry.source,
      sourceId: entry.sourceId,
      x: entry.x,
      z: entry.z,
      ...item,
    };
  });
}

function publicLooseLoot(raid, db) {
  return publicRaidLootEntries(
    raid,
    (entry) =>
      !entry.picked &&
      !entry.claimed &&
      !db?.matchLootClaims?.[entry.claimToken] &&
      (entry.source === "ground" || entry.dropped)
  );
}

function publicRaidLootEntries(raid, predicate) {
  return (raid.lootPool ?? []).filter(predicate).map((entry) => publicLootDrop(entry)).filter(Boolean);
}

function publicEntitySpawns(db, raid) {
  const mergeEntity = (source) => (entity) => {
    const state = db.matchEntityStates?.[matchEntityKey(raid, source, entity.sourceId)] ?? {};
    return {
      ...entity,
      ...state,
      currentHp: Number(state.currentHp ?? entity.currentHp ?? entity.maxHp ?? 1),
      maxHp: Number(state.maxHp ?? entity.maxHp ?? 1),
      dead: Boolean(state.dead ?? entity.dead ?? false),
      x: Number(state.x ?? entity.x ?? 0),
      z: Number(state.z ?? entity.z ?? 0),
    };
  };
  return {
    enemies: (raid.entitySpawns?.enemies ?? []).map(mergeEntity("enemy")),
    rivals: (raid.entitySpawns?.rivals ?? []).map(mergeEntity("rival")),
  };
}

function publicRaid(raid, db) {
  return {
    ...raid,
    entitySpawns: publicEntitySpawns(db, raid),
    lootPool: publicLootPool(raid, db),
    looseLoot: publicLooseLoot(raid, db),
    carriedLoot: publicRaidLootEntries(raid, (entry) => entry.picked && !entry.claimed),
    searchClaims: publicSearchClaims(db, raid),
    playerState: raid.playerState
      ? {
          x: Number(raid.playerState.x ?? PLAYER_START.x),
          z: Number(raid.playerState.z ?? PLAYER_START.z),
          hp: Number(raid.playerState.hp ?? 100),
          runTime: Number(raid.playerState.runTime ?? 0),
          updatedAt: raid.playerState.updatedAt ?? "",
        }
      : null,
    extractionState: raid.extractionState
      ? {
          startedClientTime: Number(raid.extractionState.startedClientTime ?? 0),
          startedAt: raid.extractionState.startedAt ?? "",
          x: Number(raid.extractionState.x ?? EXTRACTION_POINT.x),
          z: Number(raid.extractionState.z ?? EXTRACTION_POINT.z),
        }
      : null,
  };
}

function resolveLootFromToken(db, raid, raw, source) {
  if (!raw?.claimToken) return null;
  importSharedPlayerLoot(db, raid, raw.claimToken);
  const entry = findLootEntry(raid, raw.claimToken);
  if (!entry) throw new Error(`非法战利品凭证：${raw.claimToken}`);
  if (entry.claimed) throw new Error("战利品凭证已被结算");
  if (!entry.picked) throw new Error("战利品尚未拾取，不能结算");
  const config = ITEM_BY_ITEM_ID.get(entry.itemId);
  if (!config) throw new Error("战利品凭证配置缺失");
  entry.claimed = true;
  return { ...config };
}

function normalizeLootList(items, { maxCount, maxValue, source, raid, db }) {
  if (!Array.isArray(items)) throw new Error(`${source}战利品格式错误`);
  const normalized = [];
  let totalValue = 0;
  let countedItems = 0;
  for (const raw of items) {
    const config = resolveLootFromToken(db, raid, raw, source) ?? findLootConfig(raw);
    if (!config) throw new Error(`非法战利品：${raw?.name ?? "未知物品"}`);
    if (config.kind !== "灵石") {
      countedItems += 1;
      if (countedItems > maxCount) throw new Error(`${source}战利品数量超出容量`);
    }
    totalValue += config.value;
    if (totalValue > maxValue) throw new Error(`${source}战利品价值超出本阶段上限`);
    normalized.push({ ...config });
  }
  return normalized;
}

function raidElapsedMs(raid, now = Date.now()) {
  const startedAt = Date.parse(raid.startedAt ?? "");
  return Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0;
}

function isRaidTimedOut(raid, now = Date.now()) {
  return raid.status === "active" && raidElapsedMs(raid, now) > RAID_DURATION_MS + RAID_TIMEOUT_GRACE_MS;
}

function expireRaidForTimeout(db, user, raid) {
  if (!isRaidTimedOut(raid)) return false;
  const deathPosition = raid.playerState
    ? { x: Number(raid.playerState.x ?? PLAYER_START.x), z: Number(raid.playerState.z ?? PLAYER_START.z) }
    : PLAYER_START;
  const durabilityDamage = applyLoadoutDurabilityWear(user, raid, 22, "timeout");
  const lostGearDrops = createLoadoutGearDeathDrops(user, raid, raid.raidId, deathPosition, "timeout");
  raid.status = "dead";
  raid.deadAt = new Date().toISOString();
  raid.timeout = true;
  raid.keptValue = 0;
  appendRaidEvent(raid, "player_dead", {
    cause: "timeout",
    keptCount: 0,
    keptValue: 0,
    keptCurrencyValue: 0,
    lostGearCount: lostGearDrops.length,
    lostGearValue: lostGearDrops.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
    durabilityDamage: durabilityDamage.length,
    elapsedMs: raidElapsedMs(raid),
  });
  for (const drop of lostGearDrops) broadcastLootSpawned(db, raid, user, drop.claimToken);
  broadcastRaidSettlement(raid, user, "dead", {
    cause: "timeout",
    keptCount: keptLoot.length,
    keptValue: raid.keptValue,
    lostGearCount: lostGearDrops.length,
  });
  return true;
}

function makeStarterUser(username, password) {
  const passwordData = hashPassword(password);
  const stash = STARTER_ITEMS.map(makeInstance);
  const clean = cleanUsername(username);
  return {
    userId: randomUUID(),
    username: clean,
    usernameKey: normalizeUsername(clean),
    passwordSalt: passwordData.salt,
    passwordHash: passwordData.hash,
    createdAt: new Date().toISOString(),
    profile: {
      name: clean,
      realm: "炼气一层",
      silver: 800,
      stash,
      skills: STARTER_SKILLS,
      loadout: {
        gear: {
          weapon: stash.find((item) => item.slot === "weapon")?.instanceId ?? null,
          robe: stash.find((item) => item.slot === "robe")?.instanceId ?? null,
          ring: null,
          talisman: null,
        },
        skills: ["sword_qi", "dash", "thunder_seal", "binding_array", "body_forging", "spirit_sense"],
        consumables: [stash.find((item) => item.itemId === "spring_pill")?.instanceId].filter(Boolean),
      },
    },
  };
}

function publicProfile(user) {
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function bearer(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function findUserByToken(db, token) {
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  return db.users.find((user) => user.userId === session.userId) ?? null;
}

function validateLoadout(user, loadout) {
  const itemIds = new Set(user.profile.stash.map((item) => item.instanceId));
  const skillIds = new Set(user.profile.skills.map((skill) => skill.skillId));
  const selectedItemIds = [];
  for (const instanceId of Object.values(loadout.gear ?? {})) {
    if (instanceId && !itemIds.has(instanceId)) throw new Error("装备不在仓库中");
    if (instanceId) selectedItemIds.push(instanceId);
  }
  for (const instanceId of loadout.consumables ?? []) {
    if (instanceId && !itemIds.has(instanceId)) throw new Error("消耗品不在仓库中");
    if (instanceId) selectedItemIds.push(instanceId);
  }
  for (const skillId of loadout.skills ?? []) {
    if (skillId && !skillIds.has(skillId)) throw new Error("技能尚未学习");
  }
  if (new Set(selectedItemIds).size !== selectedItemIds.length) throw new Error("同一物品不能重复配置");
}

function calcCarryValue(user, loadout) {
  const ids = new Set([
    ...Object.values(loadout.gear ?? {}).filter(Boolean),
    ...(loadout.consumables ?? []),
  ]);
  return user.profile.stash.filter((item) => ids.has(item.instanceId)).reduce((sum, item) => sum + item.value, 0);
}

function sanitizeEventPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") clean[key] = value.slice(0, 120);
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean") clean[key] = value;
  }
  return clean;
}

function appendRaidEvent(raid, type, payload = {}) {
  raid.events ??= [];
  const event = {
    eventId: randomUUID(),
    type,
    payload: sanitizeEventPayload(payload),
    createdAt: new Date().toISOString(),
  };
  raid.events.push(event);
  if (raid.events.length > 300) raid.events.splice(0, raid.events.length - 300);
  return event;
}

function groundDistance(entry, payload) {
  const px = Number(payload?.playerX);
  const pz = Number(payload?.playerZ);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return Infinity;
  return Math.hypot(px - Number(entry.x ?? 0), pz - Number(entry.z ?? 0));
}

function sourceDistance(entry, payload) {
  const px = Number(payload?.playerX);
  const pz = Number(payload?.playerZ);
  const sx = Number(entry.x);
  const sz = Number(entry.z);
  if (!Number.isFinite(px) || !Number.isFinite(pz) || !Number.isFinite(sx) || !Number.isFinite(sz)) return Infinity;
  return Math.hypot(px - sx, pz - sz);
}

function searchClaimKey(raid, sourceId) {
  return `${raidMatchId(raid)}:${sourceId}`;
}

function publicSearchClaims(db, raid) {
  const prefix = `${raidMatchId(raid)}:`;
  return Object.keys(db.matchSearchClaims ?? {})
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

function findRaidEntity(raid, source, sourceId) {
  const group = source === "enemy" ? "enemies" : source === "rival" ? "rivals" : "";
  if (!group || !sourceId) return null;
  return (raid.entitySpawns?.[group] ?? []).find((item) => item.sourceId === sourceId) ?? null;
}

function payloadPoint(payload, xKey, zKey) {
  const x = Number(payload?.[xKey]);
  const z = Number(payload?.[zKey]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function pointDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.z) - Number(b.z));
}

function equippedAttackFromLoadout(user, raid) {
  const ids = new Set(Object.values(raid.loadoutSnapshot?.gear ?? {}).filter(Boolean));
  return user.profile.stash
    .filter((item) => ids.has(item.instanceId))
    .reduce((sum, item) => sum + scaledStat(item, "attack"), 0);
}

function equippedDefenseFromLoadout(user, raid) {
  const ids = new Set(Object.values(raid.loadoutSnapshot?.gear ?? {}).filter(Boolean));
  return user.profile.stash
    .filter((item) => ids.has(item.instanceId))
    .reduce((sum, item) => sum + scaledStat(item, "defense"), 0);
}

function raidGearAttack(raid) {
  return Object.values(raid.raidGear ?? {}).reduce((sum, itemId) => {
    const item = ITEM_BY_ITEM_ID.get(itemId);
    return sum + Number(item?.stats?.attack ?? 0);
  }, 0);
}

function hasRaidSkill(raid, skillId) {
  return (raid.loadoutSnapshot?.skills ?? []).includes(skillId);
}

function raidRuneBonus(raid, attackKind) {
  return (raid.runes ?? []).reduce((sum, runeId) => {
    const rune = RUNE_CATALOG.get(runeId);
    if (!rune || rune.attackKind !== attackKind) return sum;
    return sum + Number(rune.damageBonus ?? 0);
  }, 0);
}

function expectedEntityDamage(user, raid, source, entity, attackKind) {
  const attack = equippedAttackFromLoadout(user, raid) + raidGearAttack(raid);
  const skillBonus = hasRaidSkill(raid, "body_forging") ? 2 : 0;
  if (attackKind === "sword_qi") {
    if (!hasRaidSkill(raid, "sword_qi")) throw new Error("未配置青元剑芒，不能使用该技能");
    const base = source === "enemy" ? (entity.elite ? 28 : 34) : 30;
    return base + attack + skillBonus + raidRuneBonus(raid, attackKind);
  }
  if (attackKind === "thunder_seal") {
    if (!hasRaidSkill(raid, "thunder_seal")) throw new Error("未配置掌心雷，不能使用该技能");
    return 46 + Math.floor(attack * 1.2) + skillBonus + raidRuneBonus(raid, attackKind);
  }
  if (attackKind === "binding_array") {
    if (!hasRaidSkill(raid, "binding_array")) throw new Error("未配置小五行困阵，不能使用该技能");
    return 18 + Math.floor(attack * 0.55) + skillBonus + raidRuneBonus(raid, attackKind);
  }
  if (attackKind === "basic") {
    const base = source === "enemy" ? (entity.elite ? 16 : 20) : 18;
    return base + attack + skillBonus;
  }
  throw new Error("攻击类型不允许");
}

function expectedPlayerDamage(user, raid, attackKind) {
  const attack = equippedAttackFromLoadout(user, raid) + raidGearAttack(raid);
  const skillBonus = hasRaidSkill(raid, "body_forging") ? 2 : 0;
  if (attackKind === "sword_qi") {
    if (!hasRaidSkill(raid, "sword_qi")) throw new Error("未配置青元剑芒，不能攻击玩家");
    return 26 + attack + skillBonus + raidRuneBonus(raid, attackKind);
  }
  if (attackKind === "thunder_seal") {
    if (!hasRaidSkill(raid, "thunder_seal")) throw new Error("未配置掌心雷，不能攻击玩家");
    return 38 + Math.floor(attack * 0.9) + skillBonus + raidRuneBonus(raid, attackKind);
  }
  if (attackKind === "binding_array") {
    if (!hasRaidSkill(raid, "binding_array")) throw new Error("未配置小五行困阵，不能攻击玩家");
    return 14 + Math.floor(attack * 0.45) + skillBonus + raidRuneBonus(raid, attackKind);
  }
  throw new Error("玩家攻击类型不允许");
}

function entityHitRange(attackKind) {
  if (attackKind === "thunder_seal") return 7.2;
  if (attackKind === "binding_array") return 4.9;
  return ENTITY_HIT_RANGE;
}

function entityFacingRequirement(attackKind) {
  if (attackKind === "binding_array") return -0.35;
  if (attackKind === "thunder_seal") return 0.05;
  return ENTITY_HIT_FACING_DOT;
}

function playerHitRange(attackKind) {
  if (attackKind === "thunder_seal") return 7.0;
  if (attackKind === "binding_array") return 4.8;
  return PLAYER_HIT_RANGE;
}

function payloadDirection(payload) {
  const x = Number(payload?.dirX);
  const z = Number(payload?.dirZ);
  const length = Math.hypot(x, z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || length < 0.001) return null;
  return { x: x / length, z: z / length };
}

function facingDot(origin, target, direction) {
  if (!origin || !target || !direction) return -1;
  const toTarget = { x: Number(target.x) - Number(origin.x), z: Number(target.z) - Number(origin.z) };
  const length = Math.hypot(toTarget.x, toTarget.z);
  if (length < 0.001) return 1;
  return (toTarget.x / length) * direction.x + (toTarget.z / length) * direction.z;
}

function eventTimeMs(payload) {
  const clientTime = Number(payload?.clientTime);
  if (Number.isFinite(clientTime) && clientTime > 0) return clientTime;
  return Date.now();
}

function markPlayerPositionEvent(raid, type, payload) {
  if (type !== "player_position") return;
  const point = payloadPoint(payload, "playerX", "playerZ");
  if (!point) throw new Error("玩家位置坐标缺失");
  if (Math.abs(point.x) > 45 || Math.abs(point.z) > 45) throw new Error("玩家位置越界");
  const clientTime = eventTimeMs(payload);
  const hp = Number(payload?.hp);
  const runTime = Number(payload?.runTime);
  if (raid.playerState?.clientTime) {
    const elapsed = Math.max(0.05, (clientTime - Number(raid.playerState.clientTime)) / 1000);
    const distance = pointDistance(raid.playerState, point);
    if (distance > PLAYER_MAX_SPEED * elapsed + 2.5) throw new Error("玩家移动速度异常");
  }
  raid.playerState = {
    x: point.x,
    z: point.z,
    hp: Number.isFinite(hp) ? Math.max(0, Math.min(100, hp)) : Number(raid.playerState?.hp ?? 100),
    runTime: Number.isFinite(runTime) ? Math.max(0, runTime) : Number(raid.playerState?.runTime ?? 0),
    clientTime,
    updatedAt: new Date().toISOString(),
  };
}

function markPlayerHitEvent(raid, type, payload) {
  if (type !== "player_hit") return;
  const damage = Number(payload?.damage ?? 0);
  if (!Number.isFinite(damage) || damage < 0 || damage > 160) throw new Error("玩家受击伤害异常");
  const hp = Number(payload?.hp);
  const runTime = Number(payload?.runTime);
  raid.playerState ??= {
    x: PLAYER_START.x,
    z: PLAYER_START.z,
    hp: 100,
    runTime: 0,
    clientTime: eventTimeMs(payload),
    updatedAt: new Date().toISOString(),
  };
  raid.playerState.hp = Number.isFinite(hp) ? Math.max(0, Math.min(100, hp)) : Math.max(0, Number(raid.playerState.hp ?? 100) - damage);
  if (Number.isFinite(runTime)) raid.playerState.runTime = Math.max(0, runTime);
  raid.playerState.updatedAt = new Date().toISOString();
}

function markExtractionStartedEvent(raid, type, payload) {
  if (type !== "extraction_started") return;
  const point = payloadPoint(payload, "playerX", "playerZ");
  if (!point) throw new Error("撤离开始坐标缺失");
  if (pointDistance(point, EXTRACTION_POINT) > EXTRACTION_RADIUS) throw new Error("撤离开始位置不在撤离阵内");
  raid.extractionState = {
    startedClientTime: eventTimeMs(payload),
    startedAt: new Date().toISOString(),
    x: point.x,
    z: point.z,
  };
}

function validateExtractionState(raid, payload) {
  if (!raid.extractionState?.startedClientTime) throw new Error("尚未登记撤离读条");
  if (!raid.playerState) throw new Error("缺少玩家位置，不能撤离");
  if (pointDistance(raid.playerState, EXTRACTION_POINT) > EXTRACTION_RADIUS) throw new Error("玩家不在撤离阵内，不能撤离");
  const clientTime = eventTimeMs(payload);
  if (clientTime - Number(raid.extractionState.startedClientTime) < EXTRACTION_CHANNEL_MS) throw new Error("撤离读条时间不足");
  const point = payloadPoint(payload, "playerX", "playerZ");
  if (point && pointDistance(point, raid.playerState) > PLAYER_POSITION_TOLERANCE) throw new Error("撤离请求位置与服务端记录不匹配");
}

function markEntityHitEvent(db, raid, type, payload, user) {
  if (type !== "entity_hit") return;
  const source = payload?.source;
  if (source !== "enemy" && source !== "rival") throw new Error("命中实体来源不允许");
  applyMatchEntityState(db, raid, source, payload?.sourceId);
  const entity = findRaidEntity(raid, source, payload?.sourceId);
  if (!entity) throw new Error("命中实体不存在");
  if (entity.dead) throw new Error("实体已死亡，不能继续受击");
  const damage = Number(payload?.damage);
  if (!Number.isFinite(damage) || damage <= 0 || damage > 120) throw new Error("命中伤害异常");
  const attackKind = payload?.attackKind ?? "basic";
  const expectedDamage = expectedEntityDamage(user, raid, source, entity, attackKind);
  if (Math.round(damage) !== expectedDamage) throw new Error("命中伤害公式不匹配");
  const playerPoint = payloadPoint(payload, "playerX", "playerZ");
  const targetPoint = payloadPoint(payload, "targetX", "targetZ");
  if (!playerPoint || !targetPoint) throw new Error("命中坐标缺失");
  if (raid.playerState && pointDistance(raid.playerState, playerPoint) > PLAYER_POSITION_TOLERANCE) throw new Error("命中玩家位置与服务端记录不匹配");
  if (pointDistance(playerPoint, targetPoint) > entityHitRange(attackKind)) throw new Error("命中距离异常");
  if (pointDistance(entity, targetPoint) > ENTITY_TARGET_POSITION_TOLERANCE) throw new Error("目标坐标异常");
  const direction = payloadDirection(payload);
  if (!direction) throw new Error("攻击方向缺失");
  if (facingDot(playerPoint, targetPoint, direction) < entityFacingRequirement(attackKind)) throw new Error("攻击扇形异常");
  const hitTime = eventTimeMs(payload);
  if (entity.lastHitClientTime && hitTime - Number(entity.lastHitClientTime) < ENTITY_HIT_COOLDOWN_MS) throw new Error("命中频率异常");
  entity.currentHp = Math.max(0, Number(entity.currentHp ?? entity.maxHp ?? 1) - Math.round(damage));
  entity.damageTaken = Number(entity.damageTaken ?? 0) + Math.round(damage);
  entity.lastHitAt = new Date().toISOString();
  entity.lastHitClientTime = hitTime;
  entity.lastHitPosition = targetPoint;
  saveMatchEntityState(db, raid, source, entity);
}

function markGearSwapEvent(raid, type, payload) {
  if (type !== "gear_swapped") return;
  const slot = payload?.slot;
  if (slot !== "weapon" && slot !== "robe") throw new Error("换装槽位不允许");
  const token = payload?.claimToken;
  if (!token) {
    raid.raidGear ??= {};
    delete raid.raidGear[slot];
    return;
  }
  const entry = (raid.lootPool ?? []).find((item) => item.claimToken === token);
  if (!entry) throw new Error("换装战利品凭证非法");
  if (!entry.picked) throw new Error("战利品未拾取，不能换装");
  const item = ITEM_BY_ITEM_ID.get(entry.itemId);
  if (!item || item.slot !== slot) throw new Error("换装物品槽位不匹配");
  raid.raidGear ??= {};
  raid.raidGear[slot] = entry.itemId;
}

function markSearchCompletedEvent(db, raid, type, payload, user) {
  if (type !== "search_completed") return;
  const sourceId = String(payload?.sourceId ?? "");
  const sourcePosition = SEARCH_SOURCE_POSITIONS.get(sourceId);
  if (!sourcePosition) throw new Error("搜索点来源不存在");
  const playerPoint = payloadPoint(payload, "playerX", "playerZ");
  if (!playerPoint) throw new Error("搜索完成坐标缺失");
  if (raid.playerState && pointDistance(raid.playerState, playerPoint) > PLAYER_POSITION_TOLERANCE) throw new Error("搜索玩家位置与服务端记录不匹配");
  if (pointDistance(sourcePosition, playerPoint) > 4.0) throw new Error("搜索距离异常");
  const key = searchClaimKey(raid, sourceId);
  if (db.matchSearchClaims[key]) throw new Error("搜索点已被其他修士搜刮");
  db.matchSearchClaims[key] = {
    matchId: raidMatchId(raid),
    sourceId,
    nodeKind: String(payload?.nodeKind ?? ""),
    searchedByRaidId: raid.raidId,
    searchedByUserId: user.userId,
    searchedByUsername: user.username,
    searchedAt: new Date().toISOString(),
  };
}

function markRuneClaimedEvent(db, raid, type, payload, user) {
  if (type !== "rune_claimed") return;
  const runeId = String(payload?.runeId ?? "");
  if (!RUNE_CATALOG.has(runeId)) throw new Error("符文不存在");
  const sourceId = String(payload?.sourceId ?? "");
  const sourcePosition = SEARCH_SOURCE_POSITIONS.get(sourceId);
  if (!sourcePosition) throw new Error("符文来源搜索点不存在");
  const claim = db.matchSearchClaims?.[searchClaimKey(raid, sourceId)];
  if (!claim || claim.searchedByRaidId !== raid.raidId || claim.searchedByUserId !== user.userId) throw new Error("符文来源尚未由本人搜刮");
  const playerPoint = payloadPoint(payload, "playerX", "playerZ");
  if (!playerPoint || pointDistance(sourcePosition, playerPoint) > 4.0) throw new Error("符文领取距离异常");
  raid.runes ??= [];
  if (raid.runes.includes(runeId)) throw new Error("符文已获得");
  if (raid.runes.length >= 6) throw new Error("本局符文已满");
  raid.runes.push(runeId);
}

function markConsumableUsedEvent(user, raid, type, payload) {
  if (type !== "consumable_used") return;
  const instanceId = String(payload?.instanceId ?? "");
  if (!instanceId) throw new Error("消耗品实例缺失");
  if (!(raid.loadoutSnapshot?.consumables ?? []).includes(instanceId)) throw new Error("消耗品未在本局出征配置中");
  raid.usedConsumables ??= [];
  if (raid.usedConsumables.includes(instanceId)) throw new Error("消耗品已使用");
  const stashIndex = user.profile.stash.findIndex((item) => item.instanceId === instanceId);
  if (stashIndex < 0) throw new Error("消耗品已不在仓库中");
  const item = user.profile.stash[stashIndex];
  if (item.kind !== "consumable") throw new Error("该物品不是消耗品");
  const heal = Number(payload?.heal ?? 0);
  const expectedHeal = Number(item.stats?.heal ?? 0);
  if (!Number.isFinite(heal) || heal !== expectedHeal || heal <= 0 || heal > 120) throw new Error("消耗品效果异常");
  raid.usedConsumables.push(instanceId);
  user.profile.stash.splice(stashIndex, 1);
  if (user.profile.loadout?.consumables) {
    user.profile.loadout.consumables = user.profile.loadout.consumables.filter((id) => id !== instanceId);
  }
}

function markEntityKillEvent(db, raid, type, payload) {
  const source = type === "enemy_killed" ? "enemy" : type === "rival_killed" ? "rival" : "";
  if (!source) return;
  applyMatchEntityState(db, raid, source, payload?.sourceId);
  const entity = findRaidEntity(raid, source, payload?.sourceId);
  if (!entity) throw new Error("实体来源不存在");
  if (entity.dead) throw new Error("实体死亡事件重复");
  if (Number(entity.currentHp ?? entity.maxHp ?? 1) > 0) throw new Error("实体血量尚未归零，不能登记死亡");
  const deathPoint = payloadPoint(payload, "deathX", "deathZ");
  if (!deathPoint) throw new Error("实体死亡坐标缺失");
  entity.dead = true;
  entity.deadAt = new Date().toISOString();
  entity.deathPosition = deathPoint;
  saveMatchEntityState(db, raid, source, entity);
}

function markRivalStateEvent(db, raid, type, payload) {
  if (type !== "rival_state") return;
  const sourceId = String(payload?.sourceId ?? "");
  const entity = findRaidEntity(raid, "rival", sourceId);
  if (!entity) throw new Error("敌修来源不存在");
  if (entity.dead) throw new Error("敌修已死亡，不能更新状态");
  const point = payloadPoint(payload, "x", "z");
  if (!point) throw new Error("敌修状态坐标缺失");
  if (Math.abs(point.x) > 45 || Math.abs(point.z) > 45) throw new Error("敌修状态坐标越界");
  const goal = payloadPoint(payload, "goalX", "goalZ");
  const aiState = String(payload?.state ?? "loot");
  if (!["loot", "hunt", "extract"].includes(aiState)) throw new Error("敌修状态不允许");
  const extractProgress = Math.max(0, Math.min(1, Number(payload?.extractProgress ?? 0)));
  const hp = Number(payload?.hp);
  entity.x = point.x;
  entity.z = point.z;
  if (Number.isFinite(hp)) entity.currentHp = Math.max(0, Math.min(Number(entity.maxHp ?? hp), hp));
  entity.aiState = aiState;
  entity.goalX = goal ? goal.x : point.x;
  entity.goalZ = goal ? goal.z : point.z;
  entity.extractProgress = Number.isFinite(extractProgress) ? extractProgress : 0;
  const tokens = new Set((raid.lootPool ?? []).map((entry) => entry.claimToken));
  entity.lootBag = Array.isArray(payload?.lootBag)
    ? payload.lootBag
        .slice(0, 8)
        .map((item) => {
          const token = String(item?.claimToken ?? "");
          return token && tokens.has(token) ? publicLootDrop(findLootEntry(raid, token)) : null;
        })
        .filter(Boolean)
    : [];
  saveMatchEntityState(db, raid, "rival", entity);
}

function markLootEvent(db, raid, type, payload, user) {
  const token = payload?.claimToken;
  if (!token) return;
  importSharedPlayerLoot(db, raid, token);
  const entry = findLootEntry(raid, token);
  if (!entry) throw new Error("事件包含非法战利品凭证");
  if (entry.claimed) throw new Error("战利品已结算，不能继续操作");
  if (payload.source && payload.source !== entry.source) throw new Error("战利品来源不匹配");
  if (payload.sourceId && payload.sourceId !== entry.sourceId) throw new Error("战利品来源点不匹配");
  if (type === "loot_dropped") {
    if (entry.source !== "enemy" && entry.source !== "rival") throw new Error("该来源不允许登记动态爆点");
    const dropX = Number(payload?.dropX);
    const dropZ = Number(payload?.dropZ);
    if (!Number.isFinite(dropX) || !Number.isFinite(dropZ)) throw new Error("动态爆点坐标缺失");
    const entity = findRaidEntity(raid, entry.source, entry.sourceId);
    if (!entity?.dead) throw new Error("实体尚未登记死亡，不能登记掉落");
    if (pointDistance(entity.deathPosition, { x: dropX, z: dropZ }) > 3.2) throw new Error("动态爆点远离实体死亡点");
    entry.dropped = true;
    entry.droppedAt = new Date().toISOString();
    entry.x = dropX;
    entry.z = dropZ;
    syncMatchLootDrop(db, raid, entry);
  }
  if (type === "loot_picked") {
    const claim = db.matchLootClaims?.[token];
    if (claim && claim.pickedByRaidId !== raid.raidId) throw new Error("战利品已被其他修士拾取");
    if (entry.picked) throw new Error("战利品已在乾坤袋中");
    if (!isSpiritStoneEntry(entry) && carriedLootCount(raid) >= MAX_RAID_BAG_LOOT_COUNT) throw new Error("乾坤袋已满，不能继续拾取");
    if (entry.source === "ground" && groundDistance(entry, payload) > 2.8) throw new Error("拾取距离异常");
    if (entry.source === "search" && sourceDistance(entry, payload) > 4.0) throw new Error("搜索战利品拾取距离异常");
    if ((entry.source === "enemy" || entry.source === "rival" || entry.source === "player") && !entry.dropped) throw new Error("动态掉落尚未登记");
    if ((entry.source === "enemy" || entry.source === "rival" || entry.source === "player") && sourceDistance(entry, payload) > 2.8) throw new Error("动态战利品拾取距离异常");
    entry.picked = true;
    entry.pickedAt = new Date().toISOString();
    entry.pickPosition = { x: Number(payload?.playerX ?? 0), z: Number(payload?.playerZ ?? 0) };
    db.matchLootClaims[token] ??= {
      matchId: raidMatchId(raid),
      source: entry.source,
      sourceId: entry.sourceId,
      pickedByRaidId: raid.raidId,
      pickedByUserId: user.userId,
      pickedByUsername: user.username,
      pickedAt: entry.pickedAt,
    };
  }
  if (type === "loot_discarded") {
    if (!entry.picked) throw new Error("战利品未在乾坤袋中，不能丢弃");
    const claim = db.matchLootClaims?.[token];
    if (!claim || claim.pickedByRaidId !== raid.raidId) throw new Error("不能丢弃非本人拾取的战利品");
    const dropPoint = payloadPoint(payload, "dropX", "dropZ") ?? payloadPoint(payload, "playerX", "playerZ");
    if (!dropPoint) throw new Error("丢弃坐标缺失");
    if (raid.playerState && pointDistance(raid.playerState, dropPoint) > 3.2) throw new Error("丢弃坐标远离玩家");
    entry.picked = false;
    entry.secured = false;
    entry.pickPosition = null;
    entry.dropped = true;
    entry.droppedAt = new Date().toISOString();
    entry.x = dropPoint.x;
    entry.z = dropPoint.z;
    delete db.matchLootClaims[token];
    syncMatchLootDiscard(db, raid, entry);
  }
}

function publicShop() {
  return SHOP_CATALOG.map((offer) => {
    const item = ITEM_BY_ITEM_ID.get(offer.itemId);
    return item
      ? {
          sku: offer.sku,
          stock: offer.stock,
          price: offer.price,
          item: { ...item },
        }
      : null;
  }).filter(Boolean);
}

function configuredInstanceIds(user) {
  return new Set([
    ...Object.values(user.profile.loadout?.gear ?? {}).filter(Boolean),
    ...(user.profile.loadout?.consumables ?? []),
  ]);
}

function buyShopItem(user, sku) {
  const offer = SHOP_CATALOG.find((item) => item.sku === sku);
  if (!offer) throw new Error("商店商品不存在");
  const item = ITEM_BY_ITEM_ID.get(offer.itemId);
  if (!item) throw new Error("商店商品配置缺失");
  if (user.profile.silver < offer.price) throw new Error("灵石不足");
  user.profile.silver -= offer.price;
  const instance = makeInstance(item);
  user.profile.stash.push(instance);
  return { item: instance, silver: user.profile.silver };
}

function sellStashItem(user, instanceId) {
  const itemIndex = user.profile.stash.findIndex((item) => item.instanceId === instanceId);
  if (itemIndex < 0) throw new Error("仓库物品不存在");
  if (configuredInstanceIds(user).has(instanceId)) throw new Error("已配置出征的物品不能出售");
  const [item] = user.profile.stash.splice(itemIndex, 1);
  const silver = Math.max(1, Math.floor(Number(item.value ?? 0) * 0.5));
  user.profile.silver += silver;
  return { soldItem: item, silverGained: silver, silver: user.profile.silver };
}

function salvageYield(item) {
  const rarityBonus = { common: 1, uncommon: 2, rare: 4, epic: 7 }[item?.rarity] ?? 1;
  return Math.max(1, rarityBonus + Math.floor(Number(item?.value ?? 0) / 80));
}

function salvageStashItem(user, instanceId) {
  const itemIndex = user.profile.stash.findIndex((item) => item.instanceId === instanceId);
  if (itemIndex < 0) throw new Error("仓库物品不存在");
  if (configuredInstanceIds(user).has(instanceId)) throw new Error("已配置出征的物品不能分解");
  const [item] = user.profile.stash.splice(itemIndex, 1);
  const gained = salvageYield(item);
  user.profile.materials ??= {};
  user.profile.materials[REFINE_MATERIAL_ID] = Number(user.profile.materials[REFINE_MATERIAL_ID] ?? 0) + gained;
  return { salvagedItem: item, materialId: REFINE_MATERIAL_ID, materialGained: gained, materials: user.profile.materials };
}

function refineCost(item) {
  const level = Math.max(0, Math.floor(Number(item?.refineLevel ?? 0)));
  return {
    nextLevel: level + 1,
    materialId: REFINE_MATERIAL_ID,
    materialCost: 2 + level * 2,
    silverCost: Math.max(10, Math.ceil(Number(item?.value ?? 1) * (0.18 + level * 0.08))),
  };
}

function refineStashItem(user, instanceId) {
  const item = user.profile.stash.find((entry) => entry.instanceId === instanceId);
  if (!item) throw new Error("仓库物品不存在");
  if (!isGearItem(item)) throw new Error("只有装备可以强化");
  if (configuredInstanceIds(user).has(instanceId)) throw new Error("已配置出征的物品不能强化");
  const level = Math.max(0, Math.floor(Number(item.refineLevel ?? 0)));
  if (level >= MAX_REFINE_LEVEL) throw new Error("装备已强化至当前上限");
  const cost = refineCost(item);
  user.profile.materials ??= {};
  const currentMaterial = Number(user.profile.materials[REFINE_MATERIAL_ID] ?? 0);
  if (currentMaterial < cost.materialCost) throw new Error("炼器砂不足");
  if (user.profile.silver < cost.silverCost) throw new Error("灵石不足，无法强化");
  user.profile.materials[REFINE_MATERIAL_ID] = currentMaterial - cost.materialCost;
  user.profile.silver -= cost.silverCost;
  item.refineLevel = cost.nextLevel;
  item.stats ??= {};
  if (item.slot === "weapon") item.stats.attack = Number(item.stats.attack ?? 0) + 1;
  else item.stats.defense = Number(item.stats.defense ?? 0) + 1;
  item.value = Number(item.value ?? 0) + 12 + cost.nextLevel * 4;
  return { item, cost, materials: user.profile.materials, silver: user.profile.silver };
}

function getRaidRoom(raidId) {
  let room = raidRooms.get(raidId);
  if (!room) {
    room = new Set();
    raidRooms.set(raidId, room);
  }
  return room;
}

function broadcastRaidRoom(raidId, sender, message) {
  const room = raidRooms.get(raidId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const peer of room) {
    if (peer === sender || peer.readyState !== 1) continue;
    peer.send(data);
  }
}

function roomPeerSnapshot(room, self) {
  return Array.from(room)
    .filter((peer) => peer !== self && peer.readyState === 1 && peer.context?.lastPosition)
    .map((peer) => ({
      peerId: peer.context.peerId,
      raidId: peer.context.raidId,
      matchId: peer.context.matchId,
      userId: peer.context.userId,
      username: peer.context.username,
      hp: peer.context.hp,
      maxHp: peer.context.maxHp,
      down: Boolean(peer.context.down),
      gear: peer.context.gear ?? {},
      payload: peer.context.lastPosition,
    }));
}

function findRoomPeer(raidId, peerId) {
  const room = raidRooms.get(raidId);
  if (!room) return null;
  return Array.from(room).find((peer) => peer.context?.peerId === peerId && peer.readyState === 1) ?? null;
}

function validateWsPlayerAttack(ws, target, user, raid, payload) {
  if (target === ws) throw new Error("不能攻击自己");
  if (target.context.down) throw new Error("目标已经倒地");
  const damage = Number(payload?.damage);
  if (!Number.isFinite(damage) || damage <= 0 || damage > 120) throw new Error("玩家命中伤害异常");
  const attackKind = payload?.attackKind ?? "sword_qi";
  const expectedDamage = expectedPlayerDamage(user, raid, attackKind);
  if (Math.round(damage) !== expectedDamage) throw new Error("玩家命中伤害公式不匹配");
  const attackerPoint = payloadPoint(payload, "playerX", "playerZ");
  const targetPoint = payloadPoint(payload, "targetX", "targetZ");
  if (!attackerPoint || !targetPoint) throw new Error("玩家命中坐标缺失");
  if (!ws.context.lastPosition) throw new Error("攻击者位置尚未同步");
  if (!target.context.lastPosition) throw new Error("目标位置尚未同步");
  if (pointDistance(ws.context.lastPosition, attackerPoint) > PLAYER_POSITION_TOLERANCE) throw new Error("攻击者位置与服务端记录不匹配");
  if (pointDistance(target.context.lastPosition, targetPoint) > PLAYER_HIT_TARGET_POSITION_TOLERANCE) throw new Error("目标玩家坐标异常");
  if (pointDistance(attackerPoint, targetPoint) > playerHitRange(attackKind)) throw new Error("玩家命中距离异常");
  const direction = payloadDirection(payload);
  if (!direction) throw new Error("玩家攻击方向缺失");
  if (facingDot(attackerPoint, targetPoint, direction) < entityFacingRequirement(attackKind)) throw new Error("玩家攻击扇形异常");
  const hitTime = eventTimeMs(payload);
  if (ws.context.lastPlayerHitClientTime && hitTime - Number(ws.context.lastPlayerHitClientTime) < PLAYER_HIT_COOLDOWN_MS) throw new Error("玩家命中频率异常");
  ws.context.lastPlayerHitClientTime = hitTime;
  return Math.round(damage);
}

function broadcastLootClaimed(db, raid, token) {
  const entry = findLootEntry(raid, token);
  if (!entry) return;
  const claim = db.matchLootClaims?.[token];
  if (!claim) return;
  broadcastRaidRoom(raidMatchId(raid), null, {
    type: "loot_claimed",
    claimToken: token,
    source: entry.source,
    sourceId: entry.sourceId,
    pickedByRaidId: claim.pickedByRaidId,
    pickedByUserId: claim.pickedByUserId,
    pickedByUsername: claim.pickedByUsername,
  });
}

function broadcastLootSpawned(db, raid, user, token) {
  const entry = findLootEntry(raid, token);
  if (!entry || !entry.dropped) return;
  const item = ITEM_BY_ITEM_ID.get(entry.itemId);
  if (!item) return;
  broadcastRaidRoom(raidMatchId(raid), null, {
    type: "loot_spawned",
    claimToken: token,
    source: entry.source,
    sourceId: entry.sourceId,
    x: Number(entry.x ?? 0),
    z: Number(entry.z ?? 0),
    itemId: item.itemId,
    name: item.name,
    kind: item.kind,
    slot: item.slot,
    rarity: item.rarity,
    value: item.value,
    stats: item.stats ?? {},
    actorUserId: user.userId,
    actorUsername: user.username,
  });
}

function broadcastEntityState(db, raid, user, type, payload) {
  const source = type === "entity_hit" ? payload?.source : type === "enemy_killed" ? "enemy" : type === "rival_killed" ? "rival" : "";
  if (source !== "enemy" && source !== "rival") return;
  applyMatchEntityState(db, raid, source, payload?.sourceId);
  const entity = findRaidEntity(raid, source, payload?.sourceId);
  if (!entity) return;
  const base = {
    source,
    sourceId: entity.sourceId,
    actorUserId: user.userId,
    actorUsername: user.username,
    x: Number(entity.x ?? payload?.targetX ?? payload?.deathX ?? 0),
    z: Number(entity.z ?? payload?.targetZ ?? payload?.deathZ ?? 0),
  };
  if (type === "entity_hit") {
    broadcastRaidRoom(raidMatchId(raid), null, {
      ...base,
      type: "entity_damaged",
      hp: Number(entity.currentHp ?? 0),
      maxHp: Number(entity.maxHp ?? 1),
      damage: Math.round(Number(payload?.damage ?? 0)),
    });
    return;
  }
  broadcastRaidRoom(raidMatchId(raid), null, {
    ...base,
    type: "entity_killed",
    deathX: Number(payload?.deathX ?? entity.deathPosition?.x ?? base.x),
    deathZ: Number(payload?.deathZ ?? entity.deathPosition?.z ?? base.z),
  });
}

function broadcastSearchCompleted(db, raid, payload) {
  const sourceId = String(payload?.sourceId ?? "");
  const claim = db.matchSearchClaims?.[searchClaimKey(raid, sourceId)];
  if (!claim) return;
  const position = SEARCH_SOURCE_POSITIONS.get(sourceId) ?? { x: 0, z: 0 };
  broadcastRaidRoom(raidMatchId(raid), null, {
    type: "search_completed",
    sourceId,
    nodeKind: claim.nodeKind,
    x: position.x,
    z: position.z,
    searchedByRaidId: claim.searchedByRaidId,
    searchedByUserId: claim.searchedByUserId,
    searchedByUsername: claim.searchedByUsername,
  });
}

function broadcastRuneClaimed(raid, user, payload) {
  const rune = RUNE_CATALOG.get(String(payload?.runeId ?? ""));
  if (!rune) return;
  broadcastRaidRoom(raidMatchId(raid), null, {
    type: "rune_claimed",
    raidId: raid.raidId,
    matchId: raidMatchId(raid),
    userId: user.userId,
    username: user.username,
    ...rune,
  });
}

function updateRoomPeerGear(raid, user, gear) {
  const room = raidRooms.get(raidMatchId(raid));
  if (!room) return;
  for (const peer of room) {
    if (peer.context?.raidId === raid.raidId && peer.context?.userId === user.userId) {
      peer.context.gear = { ...(gear ?? {}) };
    }
  }
}

function broadcastGearSwapped(raid, user, payload) {
  const gear = raid.raidGear ?? {};
  updateRoomPeerGear(raid, user, gear);
  broadcastRaidRoom(raidMatchId(raid), null, {
    type: "peer_gear_swapped",
    raidId: raid.raidId,
    matchId: raidMatchId(raid),
    userId: user.userId,
    username: user.username,
    slot: payload?.slot,
    itemId: gear?.[payload?.slot],
    gear,
  });
}

function broadcastRaidSettlement(raid, user, status, payload = {}) {
  broadcastRaidRoom(raidMatchId(raid), null, {
    type: status === "extracted" ? "peer_extracted" : "peer_dead",
    raidId: raid.raidId,
    matchId: raidMatchId(raid),
    userId: user.userId,
    username: user.username,
    status,
    ...payload,
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const db = await readDb();

    if (req.method === "POST" && url.pathname === "/api/register") {
      let input;
      try {
        const { username, password } = await parseBody(req);
        input = validateAuthInput(username, password);
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "账号或密码格式不正确" });
      }
      if (db.users.some((user) => (user.usernameKey ?? normalizeUsername(user.username)) === input.usernameKey)) {
        return json(res, 409, { error: "账号已存在" });
      }
      const user = makeStarterUser(input.username, input.password);
      const token = randomUUID();
      db.users.push(user);
      db.sessions.push({ token, userId: user.userId, createdAt: new Date().toISOString() });
      await writeDb(db);
      return json(res, 200, { token, user: publicProfile(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      let input;
      try {
        const { username, password } = await parseBody(req);
        input = validateAuthInput(username, password);
      } catch {
        return json(res, 401, { error: "账号或密码错误" });
      }
      const user = db.users.find((item) => (item.usernameKey ?? normalizeUsername(item.username)) === input.usernameKey);
      if (!user || !verifyPassword(input.password, user)) return json(res, 401, { error: "账号或密码错误" });
      const token = randomUUID();
      db.sessions.push({ token, userId: user.userId, createdAt: new Date().toISOString() });
      await writeDb(db);
      return json(res, 200, { token, user: publicProfile(user) });
    }

    const requestToken = bearer(req);
    const user = findUserByToken(db, requestToken);
    if (!user) return json(res, 401, { error: "未登录或会话已失效" });

    if (req.method === "POST" && url.pathname === "/api/logout") {
      db.sessions = db.sessions.filter((session) => session.token !== requestToken);
      await writeDb(db);
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/profile") {
      return json(res, 200, { user: publicProfile(user) });
    }

    if (req.method === "GET" && url.pathname === "/api/shop") {
      return json(res, 200, { shop: publicShop() });
    }

    if (req.method === "POST" && url.pathname === "/api/shop/buy") {
      const { sku } = await parseBody(req);
      try {
        const result = buyShopItem(user, String(sku ?? ""));
        await writeDb(db);
        return json(res, 200, { ...result, shop: publicShop(), user: publicProfile(user) });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "购买失败" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/shop/sell") {
      const { instanceId } = await parseBody(req);
      try {
        const result = sellStashItem(user, String(instanceId ?? ""));
        await writeDb(db);
        return json(res, 200, { ...result, shop: publicShop(), user: publicProfile(user) });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "出售失败" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/shop/repair") {
      const { instanceId } = await parseBody(req);
      try {
        const result = repairStashItem(user, String(instanceId ?? ""));
        await writeDb(db);
        return json(res, 200, { ...result, shop: publicShop(), user: publicProfile(user) });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "修理失败" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/shop/salvage") {
      const { instanceId } = await parseBody(req);
      try {
        const result = salvageStashItem(user, String(instanceId ?? ""));
        await writeDb(db);
        return json(res, 200, { ...result, shop: publicShop(), user: publicProfile(user) });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "分解失败" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/shop/refine") {
      const { instanceId } = await parseBody(req);
      try {
        const result = refineStashItem(user, String(instanceId ?? ""));
        await writeDb(db);
        return json(res, 200, { ...result, shop: publicShop(), user: publicProfile(user) });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "强化失败" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/loadout") {
      const { loadout } = await parseBody(req);
      try {
        validateLoadout(user, loadout);
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "出征配置不合法" });
      }
      user.profile.loadout = loadout;
      await writeDb(db);
      return json(res, 200, { user: publicProfile(user), carryValue: calcCarryValue(user, loadout) });
    }

    if (req.method === "GET" && url.pathname === "/api/raid/active") {
      const raid = db.raids
        .filter((item) => item.userId === user.userId && item.status === "active")
        .sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")))[0] ?? null;
      if (raid && expireRaidForTimeout(db, user, raid)) {
        await writeDb(db);
        return json(res, 200, { raid: null, expired: true });
      }
      return json(res, 200, { raid: raid ? publicRaid(raid, db) : null });
    }

    if (req.method === "POST" && url.pathname === "/api/raid/start") {
      try {
        validateLoadout(user, user.profile.loadout);
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "出征配置不合法" });
      }
      const carryValue = calcCarryValue(user, user.profile.loadout);
      const matchId = assignMatchId(db, user);
      const matchWorld = createMatchWorld(db, matchId);
      const raid = {
        raidId: randomUUID(),
        matchId,
        userId: user.userId,
        status: "active",
        mapId: "qinglan_ruins",
        startedAt: new Date().toISOString(),
        carryValue,
        loadoutSnapshot: structuredClone(user.profile.loadout),
        lootPool: matchWorld.lootPool,
        entitySpawns: matchWorld.entitySpawns,
        matchSeedRaidId: matchWorld.seedRaidId,
        runes: [],
      };
      appendRaidEvent(raid, "raid_started", { mapId: raid.mapId, carryValue, matchId, matchSeedRaidId: matchWorld.seedRaidId });
      db.raids.push(raid);
      await writeDb(db);
      return json(res, 200, { raid: publicRaid(raid, db), user: publicProfile(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/raid/event") {
      const { raidId, type, payload = {} } = await parseBody(req);
      const raid = db.raids.find((item) => item.raidId === raidId && item.userId === user.userId && item.status === "active");
      if (!raid) return json(res, 404, { error: "战局不存在或已结算" });
      if (expireRaidForTimeout(db, user, raid)) {
        await writeDb(db);
        return json(res, 400, { error: "秘境时限已到，本局已按死亡结算" });
      }
      const allowed = new Set(["player_position", "extraction_started", "entity_hit", "enemy_killed", "loot_dropped", "loot_discarded", "loot_picked", "rune_claimed", "consumable_used", "gear_swapped", "search_completed", "rival_state", "rival_extracted", "rival_killed", "player_hit"]);
      if (!allowed.has(type)) return json(res, 400, { error: "事件类型不允许" });
      try {
        markPlayerPositionEvent(raid, type, payload);
        markExtractionStartedEvent(raid, type, payload);
        markPlayerHitEvent(raid, type, payload);
        markGearSwapEvent(raid, type, payload);
        markSearchCompletedEvent(db, raid, type, payload, user);
        markRuneClaimedEvent(db, raid, type, payload, user);
        markConsumableUsedEvent(user, raid, type, payload);
        markEntityHitEvent(db, raid, type, payload, user);
        markEntityKillEvent(db, raid, type, payload);
        markRivalStateEvent(db, raid, type, payload);
        markLootEvent(db, raid, type, payload, user);
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "event validation failed" });
      }
      const event = appendRaidEvent(raid, type, payload);
      if (type === "loot_picked") broadcastLootClaimed(db, raid, payload?.claimToken);
      if (type === "loot_dropped" || type === "loot_discarded") broadcastLootSpawned(db, raid, user, payload?.claimToken);
      if (type === "entity_hit" || type === "enemy_killed" || type === "rival_killed") broadcastEntityState(db, raid, user, type, payload);
      if (type === "search_completed") broadcastSearchCompleted(db, raid, payload);
      if (type === "rune_claimed") broadcastRuneClaimed(raid, user, payload);
      if (type === "gear_swapped") broadcastGearSwapped(raid, user, payload);
      await writeDb(db);
      return json(res, 200, { event });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/raid/") && url.pathname.endsWith("/events")) {
      const raidId = url.pathname.split("/")[3];
      const raid = db.raids.find((item) => item.raidId === raidId && item.userId === user.userId);
      if (!raid) return json(res, 404, { error: "战局不存在" });
      return json(res, 200, { events: raid.events ?? [] });
    }

    if (req.method === "POST" && url.pathname === "/api/raid/extract") {
      const { raidId, loot = [], playerX, playerZ, clientTime } = await parseBody(req);
      const raid = db.raids.find((item) => item.raidId === raidId && item.userId === user.userId && item.status === "active");
      if (!raid) return json(res, 404, { error: "战局不存在或已结算" });
      if (expireRaidForTimeout(db, user, raid)) {
        await writeDb(db);
        return json(res, 400, { error: "秘境时限已到，本局已按死亡结算" });
      }
      let normalizedLoot;
      try {
        validateExtractionState(raid, { playerX, playerZ, clientTime });
        normalizedLoot = normalizeLootList(loot, { maxCount: MAX_EXTRACT_LOOT_COUNT, maxValue: MAX_EXTRACT_LOOT_VALUE, source: "撤离", raid, db });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : "撤离校验失败" });
      }
      const acceptedConfigs = normalizedLoot;
      const acceptedCurrencyValue = acceptedConfigs.filter((item) => item.kind === "灵石").reduce((sum, item) => sum + Number(item.value ?? 0), 0);
      const acceptedLoot = acceptedConfigs.filter((item) => item.kind !== "灵石").map(makeInstance);
      const durabilityDamage = applyLoadoutDurabilityWear(user, raid, 8, "extracted");
      user.profile.stash.push(...acceptedLoot);
      user.profile.silver += acceptedCurrencyValue + acceptedLoot.reduce((sum, item) => sum + Math.floor(item.value * 0.15), 0);
      raid.status = "extracted";
      raid.extractedAt = new Date().toISOString();
      raid.lootValue = acceptedConfigs.reduce((sum, item) => sum + item.value, 0);
      appendRaidEvent(raid, "player_extracted", {
        lootCount: acceptedConfigs.length,
        lootValue: raid.lootValue,
        currencyValue: acceptedCurrencyValue,
        durabilityDamage: durabilityDamage.length,
      });
      broadcastRaidSettlement(raid, user, "extracted", {
        lootCount: acceptedConfigs.length,
        lootValue: raid.lootValue,
        currencyValue: acceptedCurrencyValue,
      });
      await writeDb(db);
      return json(res, 200, { user: publicProfile(user), raid, acceptedLoot, acceptedCurrencyValue });
    }

    if (req.method === "POST" && url.pathname === "/api/raid/death") {
      const { raidId } = await parseBody(req);
      const raid = db.raids.find((item) => item.raidId === raidId && item.userId === user.userId && item.status === "active");
      if (!raid) return json(res, 404, { error: "战局不存在或已结算" });
      const deathPosition = raid.playerState
        ? { x: Number(raid.playerState.x ?? PLAYER_START.x), z: Number(raid.playerState.z ?? PLAYER_START.z) }
        : PLAYER_START;
      const durabilityDamage = applyLoadoutDurabilityWear(user, raid, 18, "death");
      const lostGearDrops = createLoadoutGearDeathDrops(user, raid, raid.raidId, deathPosition, "death");
      raid.status = "dead";
      raid.deadAt = new Date().toISOString();
      raid.keptValue = 0;
      appendRaidEvent(raid, "player_dead", {
        keptCount: 0,
        keptValue: 0,
        keptCurrencyValue: 0,
        lostGearCount: lostGearDrops.length,
        lostGearValue: lostGearDrops.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
        durabilityDamage: durabilityDamage.length,
      });
      for (const drop of lostGearDrops) broadcastLootSpawned(db, raid, user, drop.claimToken);
      broadcastRaidSettlement(raid, user, "dead", {
        keptCount: 0,
        keptValue: 0,
        keptCurrencyValue: 0,
        lostGearCount: lostGearDrops.length,
      });
      await writeDb(db);
      return json(res, 200, { user: publicProfile(user), raid, keptLoot: [], lostGearDrops });
    }

    return json(res, 404, { error: "接口不存在" });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : "服务器错误" });
  }
});

const raidWss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname !== "/ws/raid") {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get("token") ?? "";
    const raidId = url.searchParams.get("raidId") ?? "";
    const db = await readDb();
    const user = findUserByToken(db, token);
    const raid = user ? db.raids.find((item) => item.raidId === raidId && item.userId === user.userId && item.status === "active") : null;
    if (!user || !raid) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    raidWss.handleUpgrade(req, socket, head, (ws) => {
      ws.context = { peerId: randomUUID(), userId: user.userId, username: user.username, raidId, matchId: raid.matchId ?? raid.raidId, lastPosition: null, hp: 100, maxHp: 100, down: false, gear: raid.raidGear ?? {} };
      raidWss.emit("connection", ws, req);
    });
  } catch {
    socket.destroy();
  }
});

raidWss.on("connection", (ws) => {
  const { peerId, raidId, matchId, userId, username } = ws.context;
  const room = getRaidRoom(matchId);
  room.add(ws);
  ws.send(JSON.stringify({ type: "room_joined", peerId, raidId, matchId, userId, username, peers: room.size }));
  ws.send(JSON.stringify({ type: "room_snapshot", raidId, matchId, peers: roomPeerSnapshot(room, ws) }));
  broadcastRaidRoom(matchId, ws, { type: "peer_joined", peerId, raidId, matchId, userId, username, peers: room.size });

  ws.on("message", async (raw) => {
    try {
      const message = JSON.parse(String(raw));
      if (message.type !== "player_position" && message.type !== "player_attack") {
        ws.send(JSON.stringify({ type: "error", error: "message type not allowed" }));
        return;
      }
      const db = await readDb();
      const user = db.users.find((item) => item.userId === userId);
      const raid = db.raids.find((item) => item.raidId === raidId && item.userId === userId && item.status === "active");
      if (!user || !raid) {
        ws.send(JSON.stringify({ type: "error", error: "raid not active" }));
        ws.close(1008, "raid not active");
        return;
      }
      if (expireRaidForTimeout(db, user, raid)) {
        await writeDb(db);
        ws.send(JSON.stringify({ type: "error", error: "raid timed out" }));
        ws.close(1008, "raid timed out");
        return;
      }
      if (ws.context.down) {
        ws.send(JSON.stringify({ type: "error", error: "player downed", messageType: message.type }));
        return;
      }
      const payload = message.payload ?? {};
      if (message.type === "player_position") {
        markPlayerPositionEvent(raid, "player_position", payload);
        ws.context.lastPosition = {
          x: Number(payload.playerX),
          z: Number(payload.playerZ),
          playerX: Number(payload.playerX),
          playerZ: Number(payload.playerZ),
          clientTime: Number(payload.clientTime ?? Date.now()),
          runTime: Number(payload.runTime ?? 0),
        };
        appendRaidEvent(raid, "player_position", { ...payload, transport: "ws" });
        await writeDb(db);
        broadcastRaidRoom(matchId, ws, { type: "peer_position", peerId, raidId, matchId, userId, username, hp: ws.context.hp, maxHp: ws.context.maxHp, down: ws.context.down, gear: ws.context.gear ?? {}, payload: ws.context.lastPosition });
        return;
      }
      const target = findRoomPeer(matchId, String(payload.targetPeerId ?? ""));
      if (!target) throw new Error("目标玩家不在房间");
      const damage = validateWsPlayerAttack(ws, target, user, raid, payload);
      target.context.hp = Math.max(0, Number(target.context.hp ?? 100) - damage);
      target.context.down = target.context.hp <= 0;
      const targetPosition = target.context.lastPosition ?? payloadPoint(payload, "targetX", "targetZ");
      const targetRaid = db.raids.find((item) => item.raidId === target.context.raidId && item.userId === target.context.userId && item.status === "active");
      const droppedLoot = target.context.down && !target.context.deathDropCreated && targetRaid ? createPlayerDeathLootDrops(db, targetRaid, target, peerId, targetPosition) : [];
      if (droppedLoot.length > 0) target.context.deathDropCreated = true;
      const result = {
        type: target.context.down ? "peer_down" : "peer_damaged",
        attackerPeerId: peerId,
        attackerUsername: username,
        targetPeerId: target.context.peerId,
        targetUsername: target.context.username,
        damage,
        hp: target.context.hp,
        maxHp: target.context.maxHp,
        loot: droppedLoot[0] ?? null,
        lootDrops: droppedLoot,
        payload: {
          targetX: Number(payload.targetX),
          targetZ: Number(payload.targetZ),
          playerX: Number(payload.playerX),
          playerZ: Number(payload.playerZ),
        },
      };
      appendRaidEvent(raid, "player_pvp_hit", {
        attackerPeerId: peerId,
        targetPeerId: target.context.peerId,
        damage,
        hp: target.context.hp,
        down: target.context.down,
        droppedToken: droppedLoot?.claimToken ?? "",
        transport: "ws",
      });
      await writeDb(db);
      ws.send(JSON.stringify(result));
      broadcastRaidRoom(matchId, ws, result);
    } catch (error) {
      ws.send(JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "ws message failed" }));
    }
  });

  ws.on("close", () => {
    const currentRoom = raidRooms.get(matchId);
    if (!currentRoom) return;
    currentRoom.delete(ws);
    if (currentRoom.size === 0) {
      raidRooms.delete(matchId);
      return;
    }
    broadcastRaidRoom(matchId, ws, { type: "peer_left", peerId, raidId, matchId, userId, username, peers: currentRoom.size });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Xiantu prototype API listening at http://127.0.0.1:${PORT}`);
});

