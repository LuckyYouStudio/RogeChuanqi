import * as THREE from "three";

function mat(color: number, emissive = 0x000000, emissiveIntensity = 0.2, metalness = 0.05, roughness = 0.65) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, metalness, roughness });
}

function setShadow(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

export function createSwordCultivator() {
  const root = new THREE.Group();
  root.name = "SwordCultivator_Model";

  const robe = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.05, 6, 12), mat(0x73d790, 0x12321a, 0.35));
  robe.name = "robe";
  robe.position.y = 0.94;
  root.add(robe);

  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 6, 28), mat(0xe7d090, 0x332400, 0.2));
  sash.name = "gold_sash";
  sash.position.y = 0.94;
  sash.rotation.x = Math.PI / 2;
  root.add(sash);

  const robeSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.68, 0.58, 6), mat(0x4ca66d, 0x10331a, 0.25));
  robeSkirt.name = "layered_robe_skirt";
  robeSkirt.position.y = 0.38;
  root.add(robeSkirt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), mat(0xf0d1aa));
  head.name = "head";
  head.position.y = 1.82;
  root.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), mat(0x1d221d));
  hair.name = "hair_knot";
  hair.position.set(0, 2.08, -0.04);
  root.add(hair);

  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.16), mat(0xd9b45f, 0x4a3100, 0.35, 0.35, 0.32));
  crown.name = "small_crown";
  crown.position.set(0, 2.22, 0);
  root.add(crown);

  const leftSleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.56, 5, 8), mat(0x5dbc7d));
  leftSleeve.name = "left_sleeve";
  leftSleeve.position.set(-0.43, 1.18, 0);
  leftSleeve.rotation.z = -0.42;
  root.add(leftSleeve);

  const rightSleeve = leftSleeve.clone();
  rightSleeve.name = "right_sleeve";
  rightSleeve.position.x = 0.43;
  rightSleeve.rotation.z = 0.42;
  root.add(rightSleeve);

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), mat(0xcfe9b8, 0x2f7b45, 0.55, 0.15, 0.44));
    shoulder.name = side < 0 ? "left_jade_shoulder" : "right_jade_shoulder";
    shoulder.position.set(side * 0.38, 1.48, 0.02);
    shoulder.scale.set(1.1, 0.65, 0.75);
    root.add(shoulder);
  }

  const sword = new THREE.Group();
  sword.name = "floating_sword";
  sword.position.set(0.72, 1.16, -0.14);
  sword.rotation.set(0.1, -0.55, -0.12);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.42), mat(0xddeecf, 0x2c8d45, 0.5, 0.65, 0.24));
  blade.name = "blade";
  blade.position.z = -0.22;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), mat(0xd9b45f, 0x3c2900, 0.25, 0.35, 0.32));
  guard.name = "guard";
  guard.position.z = 0.45;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 10), mat(0x654435));
  handle.name = "handle";
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.68;
  sword.add(blade, guard, handle);
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.04, 1.58),
    new THREE.MeshStandardMaterial({
      color: 0x9effb9,
      emissive: 0x45ff76,
      emissiveIntensity: 1.25,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
  );
  glow.name = "blade_glow";
  glow.position.z = -0.22;
  sword.add(glow);
  root.add(sword);

  return setShadow(root);
}

export function createCorpsePuppet(elite = false) {
  const root = new THREE.Group();
  root.name = elite ? "EliteCorpsePuppet_Model" : "CorpsePuppet_Model";
  const scale = elite ? 1.2 : 1;

  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.55 * scale, 1.42 * scale, 6),
    mat(elite ? 0xd95c68 : 0x9b4a5b, elite ? 0x3b0b12 : 0x1d050b, elite ? 0.6 : 0.3),
  );
  body.name = "talisman_body";
  body.position.y = 0.72 * scale;
  root.add(body);

  const backFlag = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.78 * scale, 0.04 * scale), mat(0xf3d38b, 0x5b3000, 0.25));
  backFlag.name = "binding_talisman";
  backFlag.position.set(0, 1.32 * scale, -0.36 * scale);
  backFlag.rotation.x = -0.15;
  root.add(backFlag);

  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.32 * scale, 0.08 * scale), mat(0xd8c6a1));
  mask.name = "paper_mask";
  mask.position.set(0, 1.18 * scale, 0.39 * scale);
  root.add(mask);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.13 * scale, 12, 8),
    mat(elite ? 0xffb15d : 0xff6e7c, elite ? 0xff7d1b : 0xb61728, 1.5),
  );
  core.name = "glowing_core";
  core.position.set(0, 0.72 * scale, 0.47 * scale);
  root.add(core);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08 * scale, 0.54 * scale, 5, 8), mat(0x7b3a4c));
    arm.name = side < 0 ? "left_claw" : "right_claw";
    arm.position.set(side * 0.48 * scale, 0.75 * scale, 0.05 * scale);
    arm.rotation.z = side * 0.9;
    root.add(arm);

    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06 * scale, 0.24 * scale, 5), mat(0xe6c4bf, 0x2b070a, 0.2));
    claw.name = side < 0 ? "left_bone_claw_tip" : "right_bone_claw_tip";
    claw.position.set(side * 0.68 * scale, 0.48 * scale, 0.05 * scale);
    claw.rotation.z = side * -0.35;
    root.add(claw);
  }

  root.scale.setScalar(scale);
  return setShadow(root);
}

export function createLootModel(kind: string) {
  const root = new THREE.Group();
  root.name = `Loot_${kind}`;

  if (kind === "功法玉简") {
    const jade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.09), mat(0x9ddcff, 0x175775, 1.3));
    jade.name = "jade_slip";
    jade.rotation.z = 0.28;
    root.add(jade);
  } else if (kind === "秘宝") {
    const treasure = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 1), mat(0xffd166, 0x9c5a00, 1.6, 0.25, 0.28));
    treasure.name = "secret_relic";
    root.add(treasure);
  } else if (kind === "丹药") {
    const pill = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat(0xe85d75, 0x7a1225, 0.8));
    pill.name = "spirit_pill";
    root.add(pill);
  } else if (kind === "法器") {
    const artifact = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.055, 48, 8), mat(0xb99cff, 0x4c2d94, 1.1));
    artifact.name = "magic_artifact";
    root.add(artifact);
  } else if (kind === "道袍") {
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 0.58, 6), mat(0x6f8fe8, 0x18245f, 0.85));
    robe.name = "loot_robe";
    robe.rotation.z = 0.22;
    root.add(robe);
  } else {
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.31, 1), mat(0xc9ff9d, 0x1f6a32, 1.15));
    stone.name = "spirit_stone";
    root.add(stone);
  }

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.43, 0.018, 6, 32),
    mat(0xd8ffd2, 0x4ebd63, 0.9, 0.1, 0.35),
  );
  halo.name = "pickup_halo";
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.18;
  root.add(halo);

  return setShadow(root);
}

export function createLootBeacon(color: number, height = 2.6) {
  const root = new THREE.Group();
  root.name = "LootBeacon_Model";

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.34, height, 18, 1, true),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.name = "vertical_beam";
  beam.position.y = height / 2;
  root.add(beam);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.02, 8, 32),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.35,
      transparent: true,
      opacity: 0.8,
    }),
  );
  ring.name = "ground_glow_ring";
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  root.add(ring);

  return root;
}

export function createExtractionGate() {
  const root = new THREE.Group();
  root.name = "ExtractionGate_Model";

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.08, 12, 72),
    mat(0x9de8ff, 0x1c87a7, 1.9, 0.1, 0.3),
  );
  ring.name = "ground_ring";
  ring.rotation.x = Math.PI / 2;
  root.add(ring);

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 1.12, 3.2, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x78d8ff,
      emissive: 0x166c8d,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    }),
  );
  pillar.name = "light_column";
  pillar.position.y = 1.6;
  root.add(pillar);

  for (let i = 0; i < 6; i++) {
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.12), mat(0xe9ffff, 0x74e9ff, 1.6));
    rune.name = `rune_${i + 1}`;
    const angle = (i / 6) * Math.PI * 2;
    rune.position.set(Math.cos(angle) * 1.58, 0.08, Math.sin(angle) * 1.58);
    rune.rotation.y = -angle;
    root.add(rune);
  }

  return setShadow(root);
}

export function createStoneStele(height: number) {
  const root = new THREE.Group();
  root.name = "RuinStoneStele_Model";

  const stone = new THREE.Mesh(new THREE.BoxGeometry(1.35, height, 1.08), mat(0x526a60, 0x000000, 0.05, 0.02, 0.84));
  stone.name = "weathered_stone";
  stone.position.y = height / 2;
  root.add(stone);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.16, 1.22), mat(0x607a6f));
  cap.name = "top_cap";
  cap.position.y = height + 0.08;
  cap.rotation.y = 0.08;
  root.add(cap);

  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.08, height * 0.45, 0.025), mat(0x9edfb0, 0x2f8f45, 0.7));
  rune.name = "faded_rune";
  rune.position.set(0, height * 0.58, 0.555);
  root.add(rune);

  return setShadow(root);
}

export function createSearchNodeModel(kind: "weapon_rack" | "corpse_pack" | "spirit_ore" | "sealed_chest") {
  const root = new THREE.Group();
  root.name = `SearchNode_${kind}`;

  if (kind === "weapon_rack") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.42), mat(0x5b4638));
    base.position.y = 0.08;
    root.add(base);
    for (const x of [-0.34, 0, 0.34]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.16, 0.08), mat(0xaeb8ad, 0x14331d, 0.3, 0.45, 0.28));
      blade.position.set(x, 0.68, 0);
      blade.rotation.z = x * 0.7;
      root.add(blade);
    }
  }

  if (kind === "corpse_pack") {
    const bundle = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.62, 5, 8), mat(0x6b5945));
    bundle.position.y = 0.34;
    bundle.rotation.z = Math.PI / 2;
    root.add(bundle);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.5), mat(0x8c6f52));
    cloth.position.y = 0.18;
    cloth.rotation.y = 0.35;
    root.add(cloth);
  }

  if (kind === "spirit_ore") {
    for (let i = 0; i < 5; i++) {
      const ore = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 + Math.random() * 0.12, 0), mat(0x9df7bb, 0x2dbb65, 0.9, 0.18, 0.38));
      ore.position.set(Math.cos(i) * 0.34, 0.22 + i * 0.04, Math.sin(i * 1.7) * 0.28);
      ore.rotation.set(Math.random(), Math.random(), Math.random());
      root.add(ore);
    }
  }

  if (kind === "sealed_chest") {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.52, 0.62), mat(0x4e3d5c, 0x20102e, 0.4));
    chest.position.y = 0.3;
    root.add(chest);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.18, 0.7), mat(0x6b5680, 0x34204d, 0.55));
    lid.position.y = 0.64;
    root.add(lid);
    const seal = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 28), mat(0xffd166, 0x9c5a00, 1.2));
    seal.position.set(0, 0.53, 0.34);
    seal.rotation.x = Math.PI / 2;
    root.add(seal);
  }

  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.018, 8, 34),
    new THREE.MeshStandardMaterial({
      color: 0xbfffd0,
      emissive: 0x4ebd63,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.5,
    }),
  );
  marker.name = "search_marker";
  marker.rotation.x = Math.PI / 2;
  marker.position.y = 0.04;
  root.add(marker);

  return setShadow(root);
}
