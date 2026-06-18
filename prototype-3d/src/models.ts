import * as THREE from "three";

function mat(color: number, emissive = 0x000000, emissiveIntensity = 0.2, metalness = 0.05, roughness = 0.65) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, metalness, roughness });
}

function glowMat(color: number, emissive: number, intensity: number, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: intensity,
    transparent: opacity < 1, opacity, depthWrite: opacity >= 0.7, roughness: 0.3,
  });
}

function setShadow(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const m = Array.isArray(child.material) ? child.material[0] : child.material;
      const transparent = m instanceof THREE.Material && m.transparent;
      child.castShadow = !transparent; // 半透明辉光不投影，避免实心怪影
      child.receiveShadow = true;
    }
  });
  return object;
}

// ---------- 玩家：简洁圆柱占位体（待替换为定制模型） ----------
// 说明：保持返回一个 THREE.Object3D（朝向沿 +Z，脚底在 y≈0）。
// 以后接入定制的 .glb/.gltf 模型，只需让此函数返回那个模型即可，
// 主循环只按 position/rotation.y 驱动它，无需改动其它代码。
export function createSwordCultivator() {
  const root = new THREE.Group();
  root.name = "SwordCultivator_Model";

  // 圆柱身体
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.5, 20), mat(0x6fd79a, 0x16451f, 0.35, 0.1, 0.6));
  body.position.y = 0.78; root.add(body);

  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), mat(0xeafff2, 0x2c7d49, 0.3, 0.1, 0.5));
  head.position.y = 1.78; root.add(head);

  // 朝向标记（让旋转可读）
  const facing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.3), glowMat(0xeafff0, 0x59ff8c, 1.0, 0.95));
  facing.position.set(0, 1.0, 0.46); root.add(facing);

  // 脚下定位光环
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 32), glowMat(0x9effc4, 0x3ea86a, 1.0, 0.6));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.04; root.add(ring);

  return setShadow(root);
}

// ---------- 敌人：邪傀儡（elite/boss 更狰狞） ----------
export function createCorpsePuppet(elite = false) {
  const root = new THREE.Group();
  root.name = elite ? "EliteCorpsePuppet_Model" : "CorpsePuppet_Model";
  const s = elite ? 1.2 : 1;
  const bodyColor = elite ? 0xd14b5e : 0x8a4456;
  const emis = elite ? 0x4a0c16 : 0x1c060c;

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.56 * s, 1.46 * s, 7), mat(bodyColor, emis, elite ? 0.6 : 0.3, 0.05, 0.7));
  body.position.y = 0.74 * s; root.add(body);

  // 破布裙摆
  const rags = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.78 * s, 0.4 * s, 7, 1, true), mat(elite ? 0x6e2230 : 0x4a2330, emis, 0.2, 0, 0.85));
  rags.position.y = 0.3 * s; root.add(rags);

  // 飘动符咒
  for (const sx of [-1, 1]) {
    const talisman = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.5 * s, 0.02), mat(0xf0d28c, 0x5b3000, 0.35));
    talisman.position.set(sx * 0.34 * s, 1.2 * s, -0.32 * s); talisman.rotation.set(-0.2, 0, sx * 0.2); root.add(talisman);
  }

  // 鬼面 + 双眼凶光
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.34 * s, 0.1 * s), mat(0xe6d4af, 0x000000, 0, 0, 0.6));
  mask.position.set(0, 1.2 * s, 0.4 * s); root.add(mask);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), glowMat(elite ? 0xffd36b : 0xff5a6e, elite ? 0xff8a1b : 0xc01a30, 1.8));
    eye.position.set(sx * 0.12 * s, 1.23 * s, 0.46 * s); root.add(eye);
  }

  // 妖丹（胸口核心）
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 12, 10), glowMat(elite ? 0xffb15d : 0xff6e7c, elite ? 0xff7d1b : 0xb61728, 1.6));
  core.position.set(0, 0.74 * s, 0.48 * s); root.add(core);

  // 利爪
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08 * s, 0.56 * s, 5, 8), mat(0x6e2f40));
    arm.position.set(side * 0.5 * s, 0.78 * s, 0.06 * s); arm.rotation.z = side * 0.95; root.add(arm);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.26 * s, 5), mat(0xe6c4bf, 0x2b070a, 0.2));
    claw.position.set(side * 0.72 * s, 0.5 * s, 0.06 * s); claw.rotation.z = side * -0.4; root.add(claw);
  }

  // 妖王头角
  if (elite) {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.4 * s, 5), mat(0x2a0e14, 0x000000, 0, 0.2, 0.5));
      horn.position.set(side * 0.18 * s, 1.5 * s, 0.32 * s); horn.rotation.set(-0.5, 0, side * 0.4); root.add(horn);
    }
  }

  root.scale.setScalar(s);
  return setShadow(root);
}

// ---------- 场景石碑 ----------
export function createStoneStele(height: number) {
  const root = new THREE.Group();
  root.name = "RuinStoneStele_Model";
  const stone = new THREE.Mesh(new THREE.BoxGeometry(1.3, height, 1.05), mat(0x46584f, 0x000000, 0.05, 0.02, 0.86));
  stone.position.y = height / 2; root.add(stone);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.16, 1.2), mat(0x55695e));
  cap.position.y = height + 0.08; cap.rotation.y = 0.08; root.add(cap);
  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.08, height * 0.45, 0.025), glowMat(0x9edfb0, 0x2f8f45, 0.7, 0.95));
  rune.position.set(0, height * 0.58, 0.54); root.add(rune);
  return setShadow(root);
}

// ---------- 功法卷轴掉落物 ----------
export function createScrollPickup() {
  const root = new THREE.Group();
  root.name = "ScrollPickup_Model";

  // 玉简卷轴本体
  const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.74, 16), mat(0xf2e6c6, 0x6a5320, 0.5, 0.2, 0.5));
  scroll.rotation.z = Math.PI / 2; scroll.position.y = 0.1; root.add(scroll);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 16), mat(0x8a5a2a, 0x2a1700, 0.3, 0.4, 0.4));
    cap.rotation.z = Math.PI / 2; cap.position.set(sx * 0.38, 0.1, 0); root.add(cap);
  }
  // 卷面发光符文
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.26), glowMat(0x9ddcff, 0x2f9bd6, 1.2, 0.85));
  rune.position.set(0, 0.27, 0); rune.rotation.x = -0.4; root.add(rune);

  // 悬浮光环
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 32), glowMat(0xbfe6ff, 0x3aa0e0, 1.0, 0.7));
  halo.rotation.x = Math.PI / 2; halo.position.y = -0.2; root.add(halo);
  // 上升光柱
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.28, 2.0, 14, 1, true), glowMat(0x9ddcff, 0x2f9bd6, 0.9, 0.18));
  beam.position.y = 0.9; root.add(beam);

  return setShadow(root);
}
