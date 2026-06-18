# 项目上下文（AGENTS）

## 当前方向：修仙幸存者（《吸血鬼幸存者》范式）

本项目已从"修仙搜打撤 PvPvE"重度原型**转型**为面向微信小游戏的轻量 Roguelite：

- 操作极简：只控制移动（WASD / 虚拟摇杆），攻击全自动
- 单局短、随机构筑三选一、标签羁绊（剑/刀/仙/魔/妖/体/雷/阵/木）
- **纯客户端单机**：已删除整个 Node 服务端、多人/撤离/账号/PvP

目录名 `UnityProjecks` 是历史遗留，实际实现是 **Web（Vite + TypeScript + Three.js）**，不是 Unity。

## 运行

```powershell
cd prototype-3d
npm install
npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
```

## 代码结构（prototype-3d/src）

- `main.ts` — 主循环：移动、刷怪波次、自动武器（飞剑/掌心雷/五行阵）、境界突破升级、HUD、结算
- `upgrades.ts` — `ROGUE_CHOICES` 升级池 + 标签羁绊 `SYNERGY` + `computeStats`（纯逻辑、无渲染依赖）
- `models.ts` — low-poly 网格
- `effects.ts` — 特效

## 重要说明

- 重度旧版（含搜打撤、PvPvE、Node 服务端、JSON 数据库）完整备份在 `prototype-3d.backup/`。本项目无 git，删除不可回滚——大改动前务必备份。
- `docs/game_design_zh.md` 等旧设计文档保留作世界观/美术参考，但**玩法已不以其为准**，以幸存者方向为准。

## 微信小游戏上线注意（后续）

- 需接入官方适配器（weapp-adapter / minigame-canvas）把 Three.js 跑在小游戏环境
- 主包 ≤ 4MB，美术资源走分包 + CDN
- 纯单机 + 广告变现（IAA）门槛最低；若后续加内购/PvP 需版号 + 域名备案 + wss
