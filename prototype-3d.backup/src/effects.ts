import * as THREE from "three";

export type Effect = {
  object: THREE.Object3D;
  age: number;
  duration: number;
  update: (dt: number, t: number) => void;
};

function makeMat(color: number, emissive: number, intensity: number, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    transparent: opacity < 1,
    opacity,
    roughness: 0.35,
    metalness: 0.08,
    depthWrite: opacity >= 0.72,
  });
}

export function createSlashEffect(origin: THREE.Vector3, direction: THREE.Vector3): Effect {
  const root = new THREE.Group();
  root.name = "Effect_QingyuanSeventyTwoSwords";
  root.position.copy(origin);
  root.position.y = 0;

  const forward = direction.clone();
  forward.y = 0;
  if (forward.lengthSq() < 0.01) forward.set(0, 0, 1);
  forward.normalize();
  const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();

  const mist = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.95, 0.2, 36, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x9debdc,
      emissive: 0x2fae9c,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.5,
    }),
  );
  mist.name = "qingyuan_cold_mist";
  mist.position.y = 0.18;
  root.add(mist);

  const swordMat = makeMat(0xdffef6, 0x52e6cf, 2.35, 0.92);
  const trailMat = makeMat(0x9debdc, 0x38d3bc, 1.75, 0.42);
  const bladeGeo = new THREE.BoxGeometry(0.045, 0.045, 0.62);
  const tipGeo = new THREE.ConeGeometry(0.06, 0.18, 4);
  const trailGeo = new THREE.BoxGeometry(0.025, 0.025, 0.74);

  const formationRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.52, 0.018, 8, 96),
    makeMat(0xb8fff0, 0x4bd8c5, 1.6, 0.42),
  );
  formationRing.name = "qingyuan_formation_ring";
  formationRing.rotation.x = Math.PI / 2;
  formationRing.position.y = 0.82;
  root.add(formationRing);

  for (let i = 0; i < 72; i++) {
    const sword = new THREE.Group();
    sword.name = `qingyuan_flying_sword_${i + 1}`;

    const blade = new THREE.Mesh(bladeGeo, swordMat);
    blade.name = "qingyuan_blade";
    blade.position.z = 0.08;
    sword.add(blade);

    const tip = new THREE.Mesh(tipGeo, swordMat);
    tip.name = "qingyuan_tip";
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.48;
    sword.add(tip);

    const trail = new THREE.Mesh(trailGeo, trailMat);
    trail.name = "qingyuan_arc_trail";
    trail.position.z = -0.44;
    sword.add(trail);

    const ringAngle = (i / 72) * Math.PI * 2;
    const ringRadius = 0.85 + (i % 9) * 0.055;
    const start = new THREE.Vector3(
      Math.cos(ringAngle) * ringRadius,
      0.92 + Math.sin(i * 1.7) * 0.28,
      Math.sin(ringAngle) * ringRadius,
    );
    const lane = (i % 12) - 5.5;
    const side = lane * 0.145;
    const wave = i % 2 === 0 ? 1 : -1;
    const end = forward.clone().multiplyScalar(4.15 + (i % 6) * 0.18).add(right.clone().multiplyScalar(side));
    end.y = 0.88 + ((i % 5) - 2) * 0.055;
    const control = forward.clone().multiplyScalar(1.65 + (i % 8) * 0.055)
      .add(right.clone().multiplyScalar(side + wave * (0.88 + (i % 4) * 0.08)));
    control.y = 1.15 + ((i % 6) - 2.5) * 0.08;

    sword.position.copy(start);
    sword.userData.start = start;
    sword.userData.control = control;
    sword.userData.end = end;
    sword.userData.delay = (i % 12) * 0.012 + Math.floor(i / 12) * 0.006;
    sword.userData.speed = 1.08 + (i % 7) * 0.018;
    sword.userData.spin = i % 2 === 0 ? 1 : -1;
    root.add(sword);
  }

  for (let i = 0; i < 6; i++) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(1.05 + i * 0.19, 0.012, 6, 72, Math.PI * (1.08 + i * 0.06)),
      makeMat(0xcffcf2, 0x4bd8c5, 1.35, 0.34),
    );
    arc.name = `qingyuan_flight_arc_${i}`;
    arc.rotation.x = Math.PI / 2;
    arc.rotation.z = -0.75 + i * 0.12;
    arc.position.copy(forward.clone().multiplyScalar(1.25 + i * 0.12));
    arc.position.y = 0.78 + i * 0.045;
    root.add(arc);
  }

  return {
    object: root,
    age: 0,
    duration: 0.62,
    update: (_dt, t) => {
      const ease = 1 - Math.pow(1 - t, 2.2);
      mist.rotation.y += 0.05;
      formationRing.rotation.z += 0.14;
      formationRing.scale.setScalar(1 + t * 0.28);
      for (const child of root.children) {
        if (!child.name.startsWith("qingyuan_flying_sword_")) continue;
        const start = child.userData.start as THREE.Vector3;
        const control = child.userData.control as THREE.Vector3;
        const end = child.userData.end as THREE.Vector3;
        const delay = Number(child.userData.delay ?? 0);
        const local = THREE.MathUtils.clamp((ease - delay) * Number(child.userData.speed ?? 1), 0, 1);
        const oneMinus = 1 - local;
        const pos = start.clone().multiplyScalar(oneMinus * oneMinus)
          .add(control.clone().multiplyScalar(2 * oneMinus * local))
          .add(end.clone().multiplyScalar(local * local));
        const nextLocal = Math.min(1, local + 0.035);
        const nextOneMinus = 1 - nextLocal;
        const next = start.clone().multiplyScalar(nextOneMinus * nextOneMinus)
          .add(control.clone().multiplyScalar(2 * nextOneMinus * nextLocal))
          .add(end.clone().multiplyScalar(nextLocal * nextLocal));
        child.position.copy(pos);
        child.lookAt(next.add(root.position));
        child.rotateZ(Number(child.userData.spin ?? 1) * local * Math.PI * 0.55);
        child.scale.setScalar(0.55 + Math.sin(local * Math.PI) * 0.55);
      }
      root.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const base = child.name.includes("mist") ? 0.2 : child.name.includes("trail") || child.name.includes("arc") || child.name.includes("ring") ? 0.46 : 0.92;
          child.material.opacity = Math.max(0, base * (1 - Math.max(0, t - 0.22) / 0.78));
        }
      });
    },
  };
}

export function createQingyuanHitBurst(position: THREE.Vector3, direction: THREE.Vector3, elite = false): Effect {
  const root = new THREE.Group();
  root.name = "Effect_QingyuanHit";
  root.position.copy(position);
  root.position.y = 0.95;
  root.rotation.y = Math.atan2(direction.x, direction.z);

  const color = elite ? 0xdffef6 : 0xb8fff0;
  for (let i = 0; i < 12; i++) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.48 + Math.random() * 0.38),
      makeMat(color, 0x50ddcb, 2.05, 0.86),
    );
    shard.name = `qingyuan_cut_${i}`;
    const angle = -0.65 + (i / 11) * 1.3;
    shard.rotation.set((Math.random() - 0.5) * 0.35, angle, (Math.random() - 0.5) * 0.4);
    shard.userData.velocity = new THREE.Vector3(Math.sin(angle) * (1.6 + Math.random() * 1.4), 0.7 + Math.random() * 0.9, Math.cos(angle) * (1.6 + Math.random() * 1.4));
    root.add(shard);
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 40), makeMat(0xcffcf2, 0x4bd8c5, 1.8, 0.72));
  ring.name = "qingyuan_impact_ring";
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.18;
  root.add(ring);

  return {
    object: root,
    age: 0,
    duration: 0.34,
    update: (dt, t) => {
      root.children.forEach((child) => {
        if (child.userData.velocity instanceof THREE.Vector3) {
          const velocity = child.userData.velocity as THREE.Vector3;
          child.position.addScaledVector(velocity, dt);
          velocity.y -= dt * 3.2;
        }
        child.scale.setScalar(1 - t * 0.62);
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.opacity = Math.max(0, 0.86 * (1 - t));
        }
      });
      ring.scale.setScalar(1 + t * 1.2);
    },
  };
}

export function createHitBurst(position: THREE.Vector3, elite = false): Effect {
  const root = new THREE.Group();
  root.name = "Effect_HitBurst";
  root.position.copy(position);
  root.position.y = 0.95;

  const color = elite ? 0xffb86b : 0x9bffbe;
  for (let i = 0; i < 7; i++) {
    const shard = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.12 + Math.random() * 0.08),
      makeMat(color, color, 1.6, 0.9),
    );
    shard.name = `hit_spark_${i}`;
    const angle = (i / 7) * Math.PI * 2;
    shard.userData.velocity = new THREE.Vector3(Math.cos(angle) * (1.8 + Math.random()), 1.4 + Math.random(), Math.sin(angle) * (1.8 + Math.random()));
    root.add(shard);
  }

  return {
    object: root,
    age: 0,
    duration: 0.42,
    update: (dt, t) => {
      root.children.forEach((child) => {
        const velocity = child.userData.velocity as THREE.Vector3;
        child.position.addScaledVector(velocity, dt);
        velocity.y -= dt * 4.5;
        child.scale.setScalar(1 - t * 0.72);
      });
    },
  };
}

export function createThunderStrike(position: THREE.Vector3): Effect {
  const root = new THREE.Group();
  root.name = "Effect_ThunderSeal";
  root.position.copy(position);

  const bolt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.09, 4.2, 7),
    makeMat(0xbfe8ff, 0x66ccff, 2.4, 0.78),
  );
  bolt.name = "thunder_bolt";
  bolt.position.y = 2.2;
  root.add(bolt);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 8, 36), makeMat(0xffffff, 0x86d7ff, 2.0, 0.78));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  root.add(ring);

  return {
    object: root,
    age: 0,
    duration: 0.36,
    update: (_dt, t) => {
      bolt.scale.set(1 + t * 0.6, 1 - t * 0.35, 1 + t * 0.6);
      ring.scale.setScalar(1 + t * 1.7);
      root.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.opacity = Math.max(0, 0.8 * (1 - t));
        }
      });
    },
  };
}

export function createBindingField(position: THREE.Vector3, radius = 4.2): Effect {
  const root = new THREE.Group();
  root.name = "Effect_BindingArray";
  root.position.copy(position);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 8, 72), makeMat(0xdcb8ff, 0x9f7aff, 1.8, 0.62));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  root.add(ring);

  for (let i = 0; i < 8; i++) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.25, 0.08), makeMat(0xf1e8ff, 0xb794ff, 1.7, 0.58));
    const angle = (i / 8) * Math.PI * 2;
    pillar.position.set(Math.cos(angle) * radius, 0.65, Math.sin(angle) * radius);
    root.add(pillar);
  }

  return {
    object: root,
    age: 0,
    duration: 0.7,
    update: (_dt, t) => {
      ring.rotation.z += 0.08;
      root.scale.setScalar(0.75 + t * 0.42);
      root.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.opacity = Math.max(0, 0.66 * (1 - t));
        }
      });
    },
  };
}

export function createPickupBeam(position: THREE.Vector3, color = 0xbfffd0): Effect {
  const root = new THREE.Group();
  root.name = "Effect_PickupBeam";
  root.position.copy(position);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.38, 2.2, 18, 1, true),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.name = "loot_beam";
  beam.position.y = 1.1;
  root.add(beam);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.035, 8, 36),
    makeMat(color, color, 1.2, 0.85),
  );
  ring.name = "loot_pickup_ring";
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  root.add(ring);

  return {
    object: root,
    age: 0,
    duration: 0.55,
    update: (_dt, t) => {
      root.position.y = t * 0.55;
      ring.scale.setScalar(1 + t * 1.6);
      beam.scale.set(1 - t * 0.45, 1 + t * 0.45, 1 - t * 0.45);
      root.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.opacity = Math.max(0, child.name === "loot_beam" ? 0.38 * (1 - t) : 0.85 * (1 - t));
        }
      });
    },
  };
}

export function createDamageText(text: string, position: THREE.Vector3, color = "#dfffe7"): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "floating-text";
  el.textContent = text;
  el.style.color = color;
  el.dataset.life = "0";
  el.dataset.x = `${position.x}`;
  el.dataset.y = `${position.y + 1.45}`;
  el.dataset.z = `${position.z}`;
  return el;
}
