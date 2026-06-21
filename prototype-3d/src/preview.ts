// 技能形态实时预览：在图鉴详情弹层里循环演示某个法宝形态。
// 复用现有特效工厂（effects.ts），自带一个独立小渲染器，不增加任何美术素材。
// 注意：用的是第二个 WebGL 上下文，适合 Web 开发期；迁移微信小游戏（单 canvas）时需改造或关闭。
import * as THREE from "three";
import { createThunderStrike, createBindingField, createQingyuanHitBurst, type Effect } from "./effects";
import type { SkillForm } from "./upgrades";

export type SkillPreview = {
  setForm: (f: SkillForm) => void;
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

export function createSkillPreview(container: HTMLElement): SkillPreview {
  const sizeW = () => container.clientWidth || 360;
  const sizeH = () => container.clientHeight || 150;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(sizeW(), sizeH());
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, sizeW() / sizeH(), 0.1, 100);
  camera.position.set(0, 7.2, 7.6);
  camera.lookAt(0, 0.5, 0);

  scene.add(new THREE.HemisphereLight(0x9ed5ff, 0x223a2c, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-4, 9, 5);
  scene.add(key);

  // 地台 + 边环
  const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 44), new THREE.MeshStandardMaterial({ color: 0x1c2a22, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.7, 0.04, 8, 64), new THREE.MeshStandardMaterial({ color: 0x4f6a56, emissive: 0x2c8f45, emissiveIntensity: 0.5 }));
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.02;
  scene.add(rim);

  // 施法者
  const caster = new THREE.Group();
  const cbody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16), new THREE.MeshStandardMaterial({ color: 0x6fd79a, emissive: 0x16451f, emissiveIntensity: 0.45 }));
  cbody.position.y = 0.55; caster.add(cbody);
  const chead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), new THREE.MeshStandardMaterial({ color: 0xeafff2, emissive: 0x2c7d49, emissiveIntensity: 0.35 }));
  chead.position.y = 1.18; caster.add(chead);
  scene.add(caster);

  // 假想敌（环形）
  const tGeo = new THREE.ConeGeometry(0.34, 1.0, 6);
  const tMat = new THREE.MeshStandardMaterial({ color: 0x8a4456, emissive: 0x1c060c, emissiveIntensity: 0.35 });
  const targets: THREE.Mesh[] = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const m = new THREE.Mesh(tGeo, tMat);
    m.position.set(Math.cos(a) * 3.4, 0.5, Math.sin(a) * 3.4);
    scene.add(m); targets.push(m);
  }
  const ahead = new THREE.Vector3(0, 0, -1); // 镜头远端为“前方”

  // 共享投射物资源（循环里反复 new mesh，但复用几何/材质，避免泄漏）
  const G_BLADE = new THREE.BoxGeometry(0.12, 0.12, 1.0);
  const M_BLADE = new THREE.MeshStandardMaterial({ color: 0xddeecf, emissive: 0x45ff76, emissiveIntensity: 1.7 });
  const G_BOLT = new THREE.SphereGeometry(0.2, 12, 10);
  const M_BOLT = new THREE.MeshStandardMaterial({ color: 0xcfeaff, emissive: 0x35d0ff, emissiveIntensity: 1.6 });
  const G_ORBIT = new THREE.BoxGeometry(0.14, 0.14, 0.8);
  const G_GLAIVE = new THREE.TorusGeometry(0.5, 0.09, 8, 22, Math.PI * 1.2);
  const M_GLAIVE = new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffc24a, emissiveIntensity: 1.6 });
  const M_VINE = new THREE.MeshStandardMaterial({ color: 0xbfe6a0, emissive: 0x3fa83f, emissiveIntensity: 1.5 });

  type PvProj = { mesh: THREE.Object3D; update: (dt: number) => boolean };
  const projs: PvProj[] = [];
  const fx: Effect[] = [];

  function addFx(e: Effect) { scene.add(e.object); fx.push(e); }
  function disposeFull(o: THREE.Object3D) {
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    });
  }
  function clearAll() {
    for (const p of projs) scene.remove(p.mesh); // 投射物用共享资源，仅移除
    projs.length = 0;
    for (const e of fx) { scene.remove(e.object); disposeFull(e.object); }
    fx.length = 0;
  }

  function hdir(p: THREE.Vector3): THREE.Vector3 {
    const v = new THREE.Vector3(p.x, 0, p.z);
    if (v.lengthSq() < 1e-6) v.set(0, 0, -1);
    return v.normalize();
  }
  function spawnBlade(mat: THREE.MeshStandardMaterial, dir: THREE.Vector3, speed: number, life: number, y = 0.9) {
    if (projs.length > 80) return;
    const mesh = new THREE.Mesh(G_BLADE, mat);
    mesh.position.set(0, y, 0);
    mesh.lookAt(dir.x, y, dir.z); // 长轴朝向 dir（与主程一致）
    scene.add(mesh);
    let t = life;
    projs.push({ mesh, update: (dt) => { mesh.position.addScaledVector(dir, speed * dt); mesh.rotateZ(dt * 16); t -= dt; if (t <= 0) { scene.remove(mesh); return false; } return true; } });
  }
  function spawnBolt(target: THREE.Vector3) {
    if (projs.length > 80) return;
    const mesh = new THREE.Mesh(G_BOLT, M_BOLT);
    mesh.position.set(0, 0.9, 0); scene.add(mesh);
    const dir = new THREE.Vector3(target.x, 0.9, target.z).sub(mesh.position).normalize();
    let t = 1.1;
    projs.push({ mesh, update: (dt) => {
      const d = new THREE.Vector3(target.x, 0.9, target.z).sub(mesh.position);
      if (d.lengthSq() > 0.04) { d.normalize(); dir.lerp(d, 0.1); dir.normalize(); }
      mesh.position.addScaledVector(dir, 8 * dt); t -= dt;
      if (t <= 0) { scene.remove(mesh); return false; } return true;
    } });
  }
  function spawnGlaive(dir: THREE.Vector3, side: number) {
    if (projs.length > 80) return;
    const g = new THREE.Group();
    const cr = new THREE.Mesh(G_GLAIVE, M_GLAIVE); cr.rotation.x = Math.PI / 2; g.add(cr);
    g.position.set(0, 0.9, 0); g.scale.setScalar(1.4); scene.add(g);
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side);
    const radius = 3.0; let angle = 0; const ang = 2.4; let t = 1.4;
    projs.push({ mesh: g, update: (dt) => {
      angle += ang * dt; const sn = Math.sin(angle), cc = 1 - Math.cos(angle);
      g.position.set(dir.x * radius * sn + perp.x * radius * cc, 0.9, dir.z * radius * sn + perp.z * radius * cc);
      g.rotation.y += dt * 10; t -= dt;
      if (t <= 0) { scene.remove(g); return false; } return true;
    } });
  }
  function spawnOrbit() {
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(G_ORBIT, M_BLADE);
      scene.add(mesh);
      let a = (i / 3) * Math.PI * 2; const r = 1.7; const speed = 2.4;
      projs.push({ mesh, update: (dt) => { a += speed * dt; mesh.position.set(Math.cos(a) * r, 0.85, Math.sin(a) * r); mesh.rotation.y = -a; return true; } });
    }
  }

  let spiralA = 0;
  function fireOnce(form: SkillForm) {
    switch (form) {
      case "sword": spawnBlade(M_BLADE, hdir(targets[0].position), 9, 0.95); spawnBlade(M_BLADE, hdir(targets[2].position), 9, 0.95); break;
      case "forward": for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.18; spawnBlade(M_BLADE, new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)).normalize(), 9, 0.95); } break;
      case "radial": for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; spawnBlade(M_BLADE, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 8, 0.95); } break;
      case "spiral": spiralA += 0.6; for (let i = 0; i < 4; i++) { const a = spiralA + (i / 4) * Math.PI * 2; spawnBlade(M_BLADE, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 7.5, 0.95); } break;
      case "bolt": spawnBolt(targets[1].position); spawnBolt(targets[4].position); break;
      case "glaive": spawnGlaive(hdir(ahead), 1); break;
      case "nova": addFx(createBindingField(new THREE.Vector3(0, 0, 0), 2.6, 2)); break;
      case "aura": addFx(createBindingField(new THREE.Vector3(0, 0, 0), 2.0, 1)); break;
      case "strike": addFx(createThunderStrike(targets[0].position.clone(), 2)); break;
      case "chain": for (const idx of [0, 1, 2]) addFx(createThunderStrike(targets[idx].position.clone(), 1)); break;
      case "rain": for (let i = 0; i < 5; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 3; addFx(createThunderStrike(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), 1)); } break;
      case "arc": addFx(createQingyuanHitBurst(new THREE.Vector3(0, 0, -1.6), new THREE.Vector3(0, 0, -1), true, 1)); break;
      case "lance": spawnBlade(M_BLADE, hdir(targets[0].position), 16, 1.2); break;
      case "laser": for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; spawnBlade(M_BLADE, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 16, 1.2); } break;
      case "whirl": for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); addFx(createQingyuanHitBurst(d.clone().multiplyScalar(2.2), d, true, 1)); } break;
      case "meteor": addFx(createThunderStrike(targets[3].position.clone(), 3)); addFx(createBindingField(targets[3].position.clone(), 2.6, 2)); break;
      case "sigil": addFx(createBindingField(new THREE.Vector3(0, 0, -1.5), 2.2, 1)); break;
      case "vine": for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spawnBlade(M_VINE, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 4, 1.4); } break;
      case "boomerang": spawnGlaive(hdir(ahead), 1); break;
    }
  }
  function intervalFor(form: SkillForm): number {
    if (form === "aura" || form === "sigil") return 0.7;
    if (form === "spiral") return 0.28;
    if (form === "forward" || form === "vine") return 0.9;
    if (form === "rain") return 1.9;
    if (form === "meteor") return 2.2;
    return 1.5;
  }

  let raf = 0, running = false, last = 0, fireT = 0, orbitDone = false;
  let curForm: SkillForm = "sword";
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    caster.rotation.y += dt * 0.5;
    for (const tg of targets) tg.rotation.y += dt * 0.8;
    if (curForm === "orbit" || curForm === "bladering") { if (!orbitDone) { spawnOrbit(); orbitDone = true; } }
    else { fireT -= dt; if (fireT <= 0) { fireT = intervalFor(curForm); fireOnce(curForm); } }
    for (let i = projs.length - 1; i >= 0; i--) if (!projs[i].update(dt)) projs.splice(i, 1);
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i]; e.age += dt; e.update(dt, Math.min(1, e.age / e.duration));
      if (e.age >= e.duration) { scene.remove(e.object); disposeFull(e.object); fx.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }

  function resize() {
    const w = sizeW(), h = sizeH();
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  return {
    setForm(f: SkillForm) { clearAll(); curForm = f; fireT = 0; orbitDone = false; spiralA = 0; },
    start() { if (running) return; resize(); running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    dispose() {
      this.stop(); clearAll();
      [G_BLADE, G_BOLT, G_ORBIT, G_GLAIVE, tGeo, ground.geometry, rim.geometry].forEach((g) => g.dispose());
      [M_BLADE, M_BOLT, M_GLAIVE, M_VINE, tMat].forEach((m) => m.dispose());
      disposeFull(caster); disposeFull(ground); disposeFull(rim);
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    },
  };
}
