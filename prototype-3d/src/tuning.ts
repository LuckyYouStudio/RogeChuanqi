// 修仙幸存者 · 全局数值集中表（从 main.ts 抽出，便于调平衡与复用）
// 纯常量，无运行期依赖。
export const TUNING = {
  arena: 44,
  moveSpeed: 6.4,
  player: { baseMaxHp: 100, invulnAfterHit: 0.4 },
  // 自动索敌射程（单位）：超出此距离的敌人不被锁定，避免在屏幕外/雾中就被打死
  combat: { targetRange: 18 },

  enemy: {
    // 刷怪更快更密：开局更短间隔、更快达到上限、更早出现多只齐刷
    spawnStart: 0.95, spawnMin: 0.14, spawnRampSec: 130, countEverySec: 42,
    // 血量随时间：线性(/hpRampSec) + 后期二次加速((t/hpRampQuad)²)，越打越肉（整体上调）
    hpBase: 15, hpRampSec: 48, hpRampQuad: 135,
    speedBase: 3.0, speedRampMax: 2.1, speedRampSec: 150,
    // 攻击随时间提升：dmgMul = min(dmgRampMax, 1 + t/dmgRampSec)（更快爬升、更高封顶）
    touchDamage: 9, touchCd: 0.6, dmgRampSec: 85, dmgRampMax: 7,
    eliteHpBase: 85, eliteSpeed: 2.4, eliteTouchDamage: 18,
    eliteChanceRampSec: 440, eliteChanceMax: 0.3,
    maxAlive: 200,
  },
  // 击退（吸血鬼幸存者手感）：受击沿"远离玩家"方向被弹开，按质量缩放，逐帧衰减
  knockback: { base: 7, decay: 11, critMul: 1.7, massElite: 2.4, massBoss: 7 },
  boss: { intervalSec: 80, hpBase: 400, hpPerBoss: 285, hpRampSec: 210, speed: 2.0, xpBase: 55, xpPerBoss: 18 },
  xp: { normal: 3, elite: 12, pickupBase: 2.4, expBase: 18, perLevel: 10, quad: 1.6, firstLevel: 20 },

  maxTreasures: 10,
  market: { offers: 6, rerollCost: 2 },
  artShop: { offers: 4 },
  // 灵石概率爆出（拾取球）。价格 1~4，故产出压低
  loot: {
    stoneChanceNormal: 0.28, stoneChanceElite: 1, stoneChanceBoss: 1,
    stoneNormal: 1, stoneElite: 2, stoneBoss: 5,
  },
  artDrop: { normalChance: 0.01, eliteChance: 0.15, bossChance: 1, maxOnGround: 2 },
  // VS 风格地面拾取掉率（普通怪），妖王必掉成套
  pickup: { healChance: 0.02, magnetChance: 0.006, bombChance: 0.006, healFrac: 0.25 },

  maxProjectiles: 260,
  // 妖系子弹裂变：击杀后炸出追踪子弹（gens=可裂变代数，count=每次裂出数，dmgMul=子代伤害倍率）
  fission: { gens: 2, count: 2, dmgMul: 0.7 },
  // 行为层 trait 数值（与标签羁绊正交）
  traitFx: { slowDur: 1.2, burnDur: 2.0, burnDpsFactor: 0.4, burnDpsCap: 40, knockMul: 1.3, pullImpulse: 4 },
};
