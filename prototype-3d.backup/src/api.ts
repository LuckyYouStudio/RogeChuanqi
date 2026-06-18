export type ServerItem = {
  instanceId: string;
  itemId: string;
  name: string;
  kind: string;
  slot: string;
  rarity: string;
  value: number;
  stats: Record<string, number>;
  durability?: number;
  refineLevel?: number;
};

export type ServerSkill = {
  skillId: string;
  name: string;
  type: string;
  power: number;
};

export type Loadout = {
  gear: Record<string, string | null>;
  skills: string[];
  consumables: string[];
};

export type ProfileUser = {
  userId: string;
  username: string;
  profile: {
    name: string;
    realm: string;
    silver: number;
    stash: ServerItem[];
    skills: ServerSkill[];
    loadout: Loadout;
    materials?: Record<string, number>;
  };
};

export type ShopOffer = {
  sku: string;
  stock: string;
  price: number;
  item: Omit<ServerItem, "instanceId" | "durability">;
};

export type Raid = {
  raidId: string;
  matchId?: string;
  status: string;
  mapId: string;
  carryValue: number;
  loadoutSnapshot?: Loadout;
  runes?: string[];
  entitySpawns?: {
    enemies: Array<{
      sourceId: string;
      x: number;
      z: number;
      elite: boolean;
      maxHp?: number;
      currentHp?: number;
      dead?: boolean;
    }>;
    rivals: Array<{
      sourceId: string;
      x: number;
      z: number;
      index: number;
      maxHp?: number;
      currentHp?: number;
      dead?: boolean;
      aiState?: "loot" | "hunt" | "extract" | null;
      goalX?: number | null;
      goalZ?: number | null;
      extractProgress?: number | null;
      lootBag?: RaidDrop[] | null;
    }>;
  };
  lootPool?: Array<{
    claimToken: string;
    source: string;
    sourceId: string;
    x: number;
    z: number;
    itemId: string;
    name: string;
    kind: string;
    slot: string;
    rarity: "common" | "uncommon" | "rare" | "epic";
    value: number;
    stats: Record<string, number>;
  }>;
  looseLoot?: RaidDrop[];
  carriedLoot?: RaidDrop[];
  searchClaims?: string[];
  playerState?: {
    x: number;
    z: number;
    hp: number;
    runTime: number;
    updatedAt?: string;
  } | null;
  extractionState?: {
    startedClientTime: number;
    startedAt: string;
    x: number;
    z: number;
  } | null;
};

export type RaidDrop = {
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
};

export type RaidEventType =
  | "player_position"
  | "extraction_started"
  | "entity_hit"
  | "enemy_killed"
  | "loot_dropped"
  | "loot_discarded"
  | "loot_picked"
  | "rune_claimed"
  | "consumable_used"
  | "gear_swapped"
  | "search_completed"
  | "rival_state"
  | "rival_extracted"
  | "rival_killed"
  | "player_hit";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type RaidEventPayload = Record<string, JsonValue>;

export type RaidEvent = {
  eventId: string;
  type: string;
  payload: RaidEventPayload;
  createdAt: string;
};

export type SettlementLoot = {
  itemId?: string;
  claimToken?: string;
  source?: string;
  sourceId?: string;
  name: string;
  kind: string;
  rarity?: string;
  value: number;
  stats?: Record<string, number>;
};

const API_BASE = "http://127.0.0.1:8787";

let authToken = localStorage.getItem("xiantu_token") ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "请求失败");
  return data as T;
}

export function getToken() {
  return authToken;
}

export function clearToken() {
  authToken = "";
  localStorage.removeItem("xiantu_token");
}

export async function logout() {
  try {
    if (authToken) await request<{ ok: boolean }>("/api/logout", { method: "POST", body: JSON.stringify({}) });
  } finally {
    clearToken();
  }
}

export async function register(username: string, password: string) {
  const data = await request<{ token: string; user: ProfileUser }>("/api/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  authToken = data.token;
  localStorage.setItem("xiantu_token", authToken);
  return data.user;
}

export async function login(username: string, password: string) {
  const data = await request<{ token: string; user: ProfileUser }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  authToken = data.token;
  localStorage.setItem("xiantu_token", authToken);
  return data.user;
}

export async function profile() {
  const data = await request<{ user: ProfileUser }>("/api/profile");
  return data.user;
}

export async function saveLoadout(loadout: Loadout) {
  const data = await request<{ user: ProfileUser; carryValue: number }>("/api/loadout", {
    method: "POST",
    body: JSON.stringify({ loadout }),
  });
  return data;
}

export async function shop() {
  const data = await request<{ shop: ShopOffer[] }>("/api/shop");
  return data.shop;
}

export async function buyShopItem(sku: string) {
  const data = await request<{ user: ProfileUser; shop: ShopOffer[]; item: ServerItem; silver: number }>("/api/shop/buy", {
    method: "POST",
    body: JSON.stringify({ sku }),
  });
  return data;
}

export async function sellStashItem(instanceId: string) {
  const data = await request<{ user: ProfileUser; shop: ShopOffer[]; soldItem: ServerItem; silverGained: number; silver: number }>("/api/shop/sell", {
    method: "POST",
    body: JSON.stringify({ instanceId }),
  });
  return data;
}

export async function repairStashItem(instanceId: string) {
  const data = await request<{ user: ProfileUser; shop: ShopOffer[]; item: ServerItem; cost: number; before: number; after: number; silver: number }>("/api/shop/repair", {
    method: "POST",
    body: JSON.stringify({ instanceId }),
  });
  return data;
}

export async function salvageStashItem(instanceId: string) {
  const data = await request<{ user: ProfileUser; shop: ShopOffer[]; salvagedItem: ServerItem; materialId: string; materialGained: number; materials: Record<string, number> }>("/api/shop/salvage", {
    method: "POST",
    body: JSON.stringify({ instanceId }),
  });
  return data;
}

export async function refineStashItem(instanceId: string) {
  const data = await request<{ user: ProfileUser; shop: ShopOffer[]; item: ServerItem; cost: { nextLevel: number; materialId: string; materialCost: number; silverCost: number }; materials: Record<string, number>; silver: number }>("/api/shop/refine", {
    method: "POST",
    body: JSON.stringify({ instanceId }),
  });
  return data;
}

export async function startRaid() {
  const data = await request<{ raid: Raid; user: ProfileUser }>("/api/raid/start", { method: "POST", body: JSON.stringify({}) });
  return data;
}

export async function activeRaidStatus() {
  const data = await request<{ raid: Raid | null }>("/api/raid/active");
  return data.raid;
}

export async function reportRaidEvent(raidId: string, type: RaidEventType, payload: RaidEventPayload = {}) {
  const data = await request<{ event: RaidEvent }>("/api/raid/event", {
    method: "POST",
    body: JSON.stringify({ raidId, type, payload }),
  });
  return data.event;
}

export async function raidEvents(raidId: string) {
  const data = await request<{ events: RaidEvent[] }>(`/api/raid/${raidId}/events`);
  return data.events;
}

export async function extractRaid(
  raidId: string,
  loot: SettlementLoot[],
  meta: { playerX: number; playerZ: number; clientTime: number },
) {
  const data = await request<{ user: ProfileUser; raid: Raid }>("/api/raid/extract", {
    method: "POST",
    body: JSON.stringify({ raidId, loot, ...meta }),
  });
  return data;
}

export async function dieInRaid(raidId: string) {
  const data = await request<{ user: ProfileUser; raid: Raid; lostGearDrops?: RaidDrop[] }>("/api/raid/death", {
    method: "POST",
    body: JSON.stringify({ raidId }),
  });
  return data;
}
