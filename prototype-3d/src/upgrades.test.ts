import { describe, it, expect } from "vitest";
import {
  tagCounts,
  computeBuild,
  starAttack,
  starCd,
  sellValue,
  treasureCost,
  artCost,
  synergyStatus,
  emptyStats,
  emptyFlags,
  rollArts,
  rollTreasures,
  ARTS,
  TREASURES,
  type Treasure,
  type Tag,
  type Rarity,
  type SkillForm,
  type Art,
} from "./upgrades";

// 测试用最小法宝构造器（只填必要字段）
function T(o: { id: string; tags: Tag[]; rarity?: Rarity; attack?: number; cd?: number; count?: number; star?: number; skill?: SkillForm }): Treasure {
  return {
    id: o.id, name: o.id, tags: o.tags, rarity: o.rarity ?? "common", cost: 1, desc: "",
    skill: o.skill ?? "sword", attack: o.attack ?? 10, cd: o.cd ?? 1, count: o.count, star: o.star,
  };
}

describe("tagCounts（羁绊计数·同 id 只计一份）", () => {
  it("同款法宝多把只算一份，不同款各计", () => {
    const c = tagCounts([T({ id: "a", tags: ["剑"] }), T({ id: "a", tags: ["剑"] }), T({ id: "b", tags: ["剑", "刀"] })]);
    expect(c.get("剑")).toBe(2); // a 一份 + b 一份
    expect(c.get("刀")).toBe(1);
  });
  it("空数组返回空计数", () => {
    expect(tagCounts([]).size).toBe(0);
  });
});

describe("computeBuild（羁绊 + 功法 → 属性/特性）", () => {
  it("两件不同剑法宝触发『剑·2件』羁绊：投射+1、增伤6%", () => {
    const { stats } = computeBuild([T({ id: "s1", tags: ["剑"] }), T({ id: "s2", tags: ["剑"] })], []);
    expect(stats.projectiles).toBe(1);
    expect(stats.damageMul).toBeCloseTo(0.06);
  });
  it("同一款剑叠 3 把不触发羁绊（去重后仅 1 份）", () => {
    const { stats } = computeBuild([T({ id: "s1", tags: ["剑"] }), T({ id: "s1", tags: ["剑"] }), T({ id: "s1", tags: ["剑"] })], []);
    expect(stats.projectiles).toBe(0);
    expect(stats.damageMul).toBe(0);
  });
  it("功法加法叠加、cdMul 乘法叠加", () => {
    const art: Art = { id: "a", name: "a", rarity: "common", cost: 8, desc: "", mod: { damageMul: 0.1, cdMul: 0.9 } };
    const { stats } = computeBuild([], [art, art]);
    expect(stats.damageMul).toBeCloseTo(0.2);
    expect(stats.cdMul).toBeCloseTo(0.81); // 0.9 × 0.9
  });
  it("剑·4件 触发暴击 flag（剑·4 暴击+15%）", () => {
    const eq = ["a", "b", "c", "d"].map((id) => T({ id, tags: ["剑"] }));
    const { flags } = computeBuild(eq, []);
    expect(flags.crit).toBeCloseTo(0.15);
    expect(flags.critMul).toBe(2);
  });
});

describe("星级缩放", () => {
  const t = T({ id: "x", tags: ["剑"], attack: 10, cd: 1 });
  it("攻击：★1=×1 ★2=×2 ★3=×3.5", () => {
    expect(starAttack({ ...t, star: 1 })).toBe(10);
    expect(starAttack({ ...t, star: 2 })).toBe(20);
    expect(starAttack({ ...t, star: 3 })).toBe(35);
  });
  it("冷却：★2=×0.85 ★3=×0.7", () => {
    expect(starCd({ ...t, star: 2 })).toBe(0.85);
    expect(starCd({ ...t, star: 3 })).toBe(0.7);
  });
  it("无 star 视为 ★1", () => {
    expect(starAttack(t)).toBe(10);
    expect(starCd(t)).toBe(1);
  });
});

describe("定价 / 出售", () => {
  it("品阶统一定价 白1 蓝2 紫3 橙4", () => {
    expect(treasureCost(T({ id: "x", tags: ["剑"], rarity: "common" }))).toBe(1);
    expect(treasureCost(T({ id: "x", tags: ["剑"], rarity: "uncommon" }))).toBe(2);
    expect(treasureCost(T({ id: "x", tags: ["剑"], rarity: "rare" }))).toBe(3);
    expect(treasureCost(T({ id: "x", tags: ["剑"], rarity: "epic" }))).toBe(4);
  });
  it("功法定价同品阶表", () => {
    const a: Art = { id: "a", name: "a", rarity: "rare", cost: 24, desc: "", mod: {} };
    expect(artCost(a)).toBe(3);
  });
  it("出售价随星级 ×1/×2/×4（蓝件 cost 2）", () => {
    const t = T({ id: "x", tags: ["剑"], rarity: "uncommon" });
    expect(sellValue({ ...t, star: 1 })).toBe(2);
    expect(sellValue({ ...t, star: 2 })).toBe(4);
    expect(sellValue({ ...t, star: 3 })).toBe(8);
  });
});

describe("synergyStatus（面板用：每档是否激活）", () => {
  it("剑 2 件：need2 激活、need4 未激活（剑=偶数派 2/4/6/8）", () => {
    const rows = synergyStatus([T({ id: "a", tags: ["剑"] }), T({ id: "b", tags: ["剑"] })]);
    const jian = rows.find((r) => r.tag === "剑")!;
    expect(jian.count).toBe(2);
    expect(jian.tiers.map((t) => t.need)).toEqual([2, 4, 6, 8]);
    expect(jian.tiers.find((t) => t.need === 2)!.active).toBe(true);
    expect(jian.tiers.find((t) => t.need === 4)!.active).toBe(false);
  });
  it("覆盖全部 13 个标签（含五行 金水火土）", () => {
    expect(synergyStatus([]).length).toBe(13);
    const tags = synergyStatus([]).map((r) => r.tag);
    expect(tags).toEqual(expect.arrayContaining(["金", "水", "火", "土"]));
  });
});

describe("五行新羁绊（全新机制 flag · 金火=偶数派 2/4/6/8，水土=奇数派 3/5/7/9）", () => {
  const N = (tag: Tag, n: number) => Array.from({ length: n }, (_, i) => T({ id: `${tag}${i}`, tags: [tag] }));
  it("金·4件：暴击倍率在基础 ×2 上叠加 +0.4", () => {
    const { flags } = computeBuild(N("金", 4), []);
    expect(flags.critMul).toBeCloseTo(2.4);
    expect(flags.crit).toBeCloseTo(0.1); // 金·2(+0.05) + 金·4(+0.05)
  });
  it("水·3件：开启命中减速 chill", () => {
    expect(computeBuild(N("水", 3), []).flags.chill).toBe(1);
  });
  it("火·2件：开启命中灼烧 ignite", () => {
    expect(computeBuild(N("火", 2), []).flags.ignite).toBe(1);
  });
  it("土·7件：开启周期地崩 quakeInterval=4；土·6 件未触发", () => {
    expect(computeBuild(N("土", 6), []).flags.quakeInterval).toBe(0);
    expect(computeBuild(N("土", 7), []).flags.quakeInterval).toBe(4);
  });
});

describe("功法唯一 + 鉴宝通玄（roll 排除逻辑）", () => {
  it("rollArts 排除已拥有的功法（功法唯一，买过不再出现）", () => {
    const owned = new Set(ARTS.slice(0, ARTS.length - 1).map((a) => a.id)); // 仅剩 1 个未拥有
    const out = rollArts(20, 4, owned);
    expect(out.length).toBe(1);
    expect(owned.has(out[0].id)).toBe(false);
  });
  it("rollArts 全部拥有时返回空", () => {
    expect(rollArts(20, 4, new Set(ARTS.map((a) => a.id))).length).toBe(0);
  });
  it("rollTreasures 排除指定 id（满级法宝不再出现）", () => {
    const exclude = new Set(TREASURES.slice(0, 70).map((t) => t.id));
    const out = rollTreasures(20, 6, exclude);
    for (const t of out) expect(exclude.has(t.id)).toBe(false);
  });
  it("存在带 hideMaxed 的功法（鉴宝通玄）", () => {
    expect(ARTS.some((a) => a.hideMaxed)).toBe(true);
  });
});

describe("避·X 诀（按羁绊屏蔽市集法宝 · 售价 50 灵石）", () => {
  it("13 个标签各一件屏蔽功法，售价均为 50 灵石", () => {
    const ex = ARTS.filter((a) => a.excludeTag);
    expect(ex.length).toBe(13);
    for (const a of ex) expect(artCost(a)).toBe(50);
  });
  it("rollTreasures 传入 excludeTags 时结果不含该羁绊法宝", () => {
    const out = rollTreasures(20, 6, undefined, new Set<Tag>(["剑"]));
    for (const t of out) expect(t.tags.includes("剑")).toBe(false);
  });
});

describe("空白构筑默认值", () => {
  it("emptyStats：cdMul=1，其余加法项=0", () => {
    const s = emptyStats();
    expect(s.cdMul).toBe(1);
    expect(s.damageMul).toBe(0);
    expect(s.projectiles).toBe(0);
  });
  it("emptyFlags：critMul=2，其余=0", () => {
    const f = emptyFlags();
    expect(f.critMul).toBe(2);
    expect(f.crit).toBe(0);
    expect(f.killExplode).toBe(0);
  });
});
