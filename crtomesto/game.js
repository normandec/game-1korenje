/* Črtomesto — igra: fizika, ljudje, vojska (tanki, vojaki, topništvo), eksplozije, zgodba.
   Sistemi: cannon-es (telesa, vozila, granate, drobci), A* navigacija, AI civilistov/policije/vojske,
   ročno balistika za granate in topovske strele, zvok z WebAudio, poglavja zgodbe. */
import * as CANNON from './assets/cannon-es.js';
import { sfx } from './audio.js';
import { CHAPTERS, LINES, WAVE_TIME } from './story.js';

const W = window.__pencilWorld;
if (!W) throw new Error('world missing');
const scene = W.scene, camera = W.camera, root = W.root;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CV = (x = 0, y = 0, z = 0) => new CANNON.Vec3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const TAU = Math.PI * 2;
const angNorm = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const LM = W.lineMaterials, FM = W.fillMaterials;
const EYE = W.EYE;
const lambert = c => { const m = new THREE.MeshLambertMaterial({ color: c }); m.userData.own = true; return m; };
let gameT = 0;     // seconds since start
let nowMs = 0;     // latest frame timestamp (ms), same clock as rAF

// ---------------- physics ----------------
const world = new CANNON.World({ gravity: CV(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = .45;
world.defaultContactMaterial.restitution = .05;
const matGround = new CANNON.Material('ground'), matObj = new CANNON.Material('obj'),
  matWheel = new CANNON.Material('wheel'), matGear = new CANNON.Material('gear'),
  matGrenade = new CANNON.Material('grenade');
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matWheel, { friction: .95, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matObj, { friction: .5, restitution: .08 }));
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matGear, { friction: 0, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matGrenade, { friction: .35, restitution: .4 }));
world.addContactMaterial(new CANNON.ContactMaterial(matObj, matGrenade, { friction: .3, restitution: .3 }));
function staticBox(x, y, z, hx, hy, hz) { const b = new CANNON.Body({ mass: 0, material: matGround, shape: new CANNON.Box(CV(hx, hy, hz)), position: CV(x, y, z) }); world.addBody(b); return b; }
staticBox(0, -1, -266, 540, 1, 274);
for (const r of W.walkZones) staticBox((r.x0 + r.x1) / 2, -.5, (r.z0 + r.z1) / 2, (r.x1 - r.x0) / 2, .5, (r.z1 - r.z0) / 2);
staticBox(47, -.5, 20, 5, .5, 15); staticBox(47, -.5, 35, 7.25, .5, 7.25);
const seabed = new CANNON.Body({ mass: 0, material: matGround, shape: new CANNON.Plane() });
seabed.quaternion.setFromEuler(-Math.PI / 2, 0, 0); seabed.position.set(0, -3.4, 0); world.addBody(seabed);
for (const o of W.obstacles) { const h = (o.w > 6 && o.d > 6) ? 14 : 2.2; staticBox(o.x, h / 2, o.z, o.w / 2, h / 2, o.d / 2); }

// ---------------- pencil helpers ----------------
class Sketch {
  constructor() { this.g = new THREE.Group(); this.L = [[], [], [], []]; this.F = [[], [], [], [], [], []]; }
  line(a, b, k = 0) { this.L[k].push(...a, ...b); }
  path(p, k = 0, closed = false) { for (let i = 1; i < p.length; i++) this.line(p[i - 1], p[i], k); if (closed) this.line(p[p.length - 1], p[0], k); }
  face(p, k = 0) { for (let i = 1; i < p.length - 1; i++) this.F[k].push(...p[0], ...p[i], ...p[i + 1]); }
  box(x, y, z, w, h, d, tone = 0, outline = true) {
    const a = [x - w / 2, y, z - d / 2], b = [x + w / 2, y, z - d / 2], c = [x + w / 2, y, z + d / 2], e = [x - w / 2, y, z + d / 2];
    const A = [a[0], y + h, a[2]], B = [b[0], y + h, b[2]], C = [c[0], y + h, c[2]], E = [e[0], y + h, e[2]];
    this.face([a, b, B, A], tone); this.face([b, c, C, B], tone); this.face([c, e, E, C], tone); this.face([e, a, A, E], tone); this.face([A, B, C, E], tone);
    if (outline) { this.path([A, B, C, E], 0, true); this.path([a, b, c, e], 1, true); [[a, A], [b, B], [c, C], [e, E]].forEach(p => this.line(p[0], p[1], 0)); }
  }
  circle(x, y, z, r, k = 0, axis = 'xz', seg = 16) {
    const p = []; for (let i = 0; i <= seg; i++) { const a = i / seg * TAU; if (axis === 'xz') p.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]); else if (axis === 'xy') p.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z]); else p.push([x, y + Math.cos(a) * r, z + Math.sin(a) * r]); }
    this.path(p, k);
  }
  cyl(x, y, z, r1, r2, h, seg = 12, tone = 0, axis = 'y') {
    const lo = [], hi = [];
    for (let i = 0; i < seg; i++) { const a = i / seg * TAU;
      if (axis === 'y') { lo.push([x + Math.cos(a) * r1, y, z + Math.sin(a) * r1]); hi.push([x + Math.cos(a) * r2, y + h, z + Math.sin(a) * r2]); }
      else if (axis === 'x') { lo.push([x, y + Math.cos(a) * r1, z + Math.sin(a) * r1]); hi.push([x + h, y + Math.cos(a) * r2, z + Math.sin(a) * r2]); }
      else { lo.push([x + Math.cos(a) * r1, y + Math.sin(a) * r1, z]); hi.push([x + Math.cos(a) * r2, y + Math.sin(a) * r2, z + h]); } }
    this.face(hi, tone);
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; this.face([lo[i], lo[j], hi[j], hi[i]], tone); if (i % 2 === 0) this.line(lo[i], hi[i], 1); }
    this.path(lo, 0, true); this.path(hi, 0, true);
  }
  finish(shadow = true) {
    this.L.forEach((a, i) => { if (!a.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); const l = new THREE.LineSegments(g, LM[i]); l.renderOrder = 2; this.g.add(l); });
    this.F.forEach((a, i) => { if (!a.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, FM[i]); m.castShadow = shadow; m.receiveShadow = true; this.g.add(m); });
    return this.g;
  }
}
function pencilMesh(geo, tone = 0, shadow = true) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(geo, FM[tone]); m.castShadow = shadow; m.receiveShadow = true; grp.add(m);
  grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), LM[0]));
  return grp;
}
function smoothProfile(pts, width, tone = 0, bevel = .06) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; s.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
  s.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.rotateY(-Math.PI / 2); g.translate(width / 2, 0, 0); g.computeVertexNormals();
  return pencilMesh(g, tone);
}
// Line-only helper with its own material (so it can fade independently).
function lineSet(segs, color, opacity, fog = true) {
  const arr = []; for (const s of segs) arr.push(...s[0], ...s[1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog });
  return { obj: new THREE.LineSegments(g, m), mat: m, geo: g };
}

// ---------------- dynamic props ----------------
const props = [];
function addProp(kind, x, z) {
  const s = new Sketch(); let hx, hy, hz, mass = 12;
  if (kind === 'crate') { s.box(0, 0, 0, .8, .8, .8, 1); hx = hy = hz = .4; }
  else if (kind === 'barrel') { s.cyl(0, 0, 0, .35, .35, .9, 12, 1); hx = hz = .35; hy = .45; }
  else if (kind === 'bin') { s.cyl(0, 0, 0, .3, .28, .85, 10, 1); hx = hz = .3; hy = .45; }
  else if (kind === 'bench') { s.box(0, .45, 0, 2, .08, .5, 1); s.box(0, .75, -.25, 2, .5, .06, 1); for (let sx of[-.85, .85]) s.box(sx, 0, 0, .08, .45, .4, 0); hx = 1; hy = .4; hz = .3; mass = 40; }
  else if (kind === 'chair') { s.box(0, .45, 0, .5, .05, .5, 1); s.box(0, .5, -.25, .5, .6, .05, 1); hx = .25; hy = .5; hz = .25; }
  else if (kind === 'cone') { s.cyl(0, 0, 0, .25, .05, .6, 10, 3); s.box(0, 0, 0, .5, .05, .5, 3); hx = hz = .25; hy = .3; mass = 4; }
  else { s.cyl(0, 0, 0, .3, .3, .3, 12, 3); hx = hy = hz = .3; mass = 1; }
  const g = s.finish(); scene.add(g);
  const shape = kind === 'ball' ? new CANNON.Sphere(.3) : new CANNON.Box(CV(hx, hy, hz));
  const body = new CANNON.Body({ mass, material: matObj, shape, position: CV(x, hy + .05, z), linearDamping: .2, angularDamping: .3 });
  world.addBody(body); const p = { kind, g, body, half: Math.max(hx, hz) }; props.push(p); return p;
}
[[-10, -8, 'crate'], [-12, -9, 'barrel'], [8, -14, 'bin'], [14, -18, 'bench'], [-20, -24, 'chair'], [24, -30, 'cone'], [30, -12, 'ball'], [-34, -40, 'crate'], [40, -50, 'barrel'], [-46, -20, 'bin'], [52, -34, 'bench'], [-58, -48, 'cone'], [60, -70, 'crate'], [-70, -90, 'barrel'], [80, -110, 'ball'], [-90, -130, 'bench'], [100, -150, 'chair'], [-110, -170, 'crate'], [120, -190, 'barrel'], [-130, -210, 'bin'], [140, -230, 'cone'], [-150, -250, 'ball'], [160, -270, 'bench'], [-170, -290, 'chair'], [180, -310, 'crate'], [-160, -150, 'bench'], [-150, -170, 'ball'], [60, -115, 'crate'], [65, -125, 'barrel'], [320, -75, 'barrel'], [330, -85, 'crate'], [-200, 25, 'ball'], [260, 30, 'cone']].forEach(([x, z, k]) => addProp(k, x, z));

// ---------------- navigation grid + A* ----------------
const CELL = 4, GX0 = -520, GZ0 = -520, GW = 260, GH = 198;
let walkGrid = null;
function buildNav() {
  walkGrid = new Uint8Array(GW * GH);
  for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) { const x = GX0 + gx * CELL + 2, z = GZ0 + gz * CELL + 2; walkGrid[gz * GW + gx] = W.canWalk(x, z) ? 1 : 0; }
}
function findPath(sx, sz, tx, tz) {
  if (!walkGrid) return null;
  const start = gIdx(sx, sz), goal = gIdx(tx, tz);
  if (start === goal) return [{ x: tx, z: tz }];
  const open = new MinHeap(), gScore = new Float32Array(GW * GH).fill(Infinity), came = new Int32Array(GW * GH).fill(-1), closed = new Uint8Array(GW * GH);
  gScore[start] = 0; open.push(start, heur(start, goal));
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let iter = 0;
  while (open.size && iter++ < 5000) {
    const cur = open.pop(); if (cur === goal) break; if (closed[cur]) continue; closed[cur] = 1;
    const cx = cur % GW, cz = (cur / GW) | 0;
    for (const [dx, dz, cost] of dirs) {
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
      const ni = nz * GW + nx; if (!walkGrid[ni] || closed[ni]) continue;
      if (dx && dz && (!walkGrid[cz * GW + nx] || !walkGrid[nz * GW + cx])) continue;
      const ng = gScore[cur] + cost; if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; open.push(ni, ng + heur(ni, goal)); }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;
  const path = []; let c = goal; while (c !== -1 && c !== start) { path.push({ x: GX0 + (c % GW) * CELL + 2, z: GZ0 + ((c / GW) | 0) * CELL + 2 }); c = came[c]; }
  path.reverse(); path.push({ x: tx, z: tz }); return path;
}
function gIdx(x, z) { const gx = clamp(Math.floor((x - GX0) / CELL), 0, GW - 1), gz = clamp(Math.floor((z - GZ0) / CELL), 0, GH - 1); return gz * GW + gx; }
function heur(a, b) { const ax = a % GW, az = (a / GW) | 0, bx = b % GW, bz = (b / GW) | 0, dx = Math.abs(ax - bx), dz = Math.abs(az - bz); return Math.max(dx, dz) + .414 * Math.min(dx, dz); }
class MinHeap {
  constructor() { this.a = []; this.p = []; } get size() { return this.a.length; }
  push(v, p) { this.a.push(v); this.p.push(p); let i = this.a.length - 1; while (i > 0) { const par = (i - 1) >> 1; if (this.p[par] <= this.p[i]) break; this.sw(i, par); i = par; } }
  pop() { const top = this.a[0], last = this.a.length - 1; this.a[0] = this.a[last]; this.p[0] = this.p[last]; this.a.pop(); this.p.pop(); let i = 0; for (; ;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < this.a.length && this.p[l] < this.p[m]) m = l; if (r < this.a.length && this.p[r] < this.p[m]) m = r; if (m === i) break; this.sw(i, m); i = m; } return top; }
  sw(i, j) { [this.a[i], this.a[j]] = [this.a[j], this.a[i]]; [this.p[i], this.p[j]] = [this.p[j], this.p[i]]; }
}

// ---------------- anatomical humans ----------------
const SKIN = [0xe8c39e, 0xd9a878, 0xb07b4f, 0x8a5a34, 0xf0d0b0];
const SHIRT = [0x7a8b99, 0x99705f, 0x6f7f6a, 0x8a7f99, 0xa9926b, 0x5f6f7f, 0x996b6b];
const PANTS = [0x4a4f57, 0x5f574a, 0x3f4a44, 0x6b5f4a];
const HAIR = [0x3a2f26, 0x5f4a33, 0x8a7355, 0x2a2a2a, 0x9a9a92];
function capsule(r, len, mat) { const g = new THREE.CapsuleGeometry(r, len, 4, 10); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; }
function makeHumanoid(opt = {}) {
  const skin = lambert(opt.skin ?? pick(SKIN)), shirt = lambert(opt.shirt ?? pick(SHIRT)), pants = lambert(opt.pants ?? pick(PANTS)), hair = lambert(opt.hair ?? pick(HAIR)), shoe = lambert(0x2f2f2f);
  const g = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = .95; g.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = capsule(.16, .34, shirt); chest.position.y = .32; chest.scale.set(1.15, 1, .75); torso.add(chest);
  const pelvisM = capsule(.14, .1, pants); pelvisM.position.y = .02; pelvisM.scale.set(1.1, 1, .8); torso.add(pelvisM);
  const neck = new THREE.Group(); neck.position.y = .62; torso.add(neck);
  const head = new THREE.Group(); neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.13, 14, 12), skin); skull.scale.set(.92, 1.05, .95); skull.position.y = .13; skull.castShadow = true; head.add(skull);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(.135, 12, 10, 0, TAU, 0, Math.PI * .55), hair); hairM.position.y = .15; head.add(hairM);
  if (opt.helmet) { const hel = new THREE.Mesh(new THREE.SphereGeometry(.152, 12, 9, 0, TAU, 0, Math.PI * .5), lambert(0x4f5a34)); hel.position.y = .16; hel.castShadow = true; head.add(hel); }
  const eyeM = lambert(0x222222);
  for (let sx of[-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 6), eyeM); e.position.set(sx * .05, .15, .115); head.add(e); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.02, .05, 6), skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, .12, .13); head.add(nose);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-.22, .52, 0); armR.position.set(.22, .52, 0); torso.add(armL, armR);
  function buildArm(side) {
    const shoulder = new THREE.Group(); side.add(shoulder);
    const up = capsule(.05, .22, shirt); up.position.y = -.16; shoulder.add(up);
    const elbow = new THREE.Group(); elbow.position.y = -.32; shoulder.add(elbow);
    const lo = capsule(.042, .2, skin); lo.position.y = -.14; elbow.add(lo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 8), skin); hand.position.y = -.3; hand.castShadow = true; elbow.add(hand);
    return { shoulder, elbow, hand };
  }
  const aL = buildArm(armL), aR = buildArm(armR);
  if (opt.rifle) { const r = new THREE.Mesh(new THREE.BoxGeometry(.06, .09, .95), lambert(0x2b2a25)); r.position.set(-.05, -.22, .34); r.castShadow = true; aR.shoulder.add(r); }
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-.09, 0, 0); legR.position.set(.09, 0, 0); hips.add(legL, legR);
  function buildLeg(side) {
    const hip = new THREE.Group(); side.add(hip);
    const up = capsule(.065, .3, pants); up.position.y = -.2; hip.add(up);
    const knee = new THREE.Group(); knee.position.y = -.42; hip.add(knee);
    const lo = capsule(.05, .3, pants); lo.position.y = -.19; knee.add(lo);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.09, .06, .2), shoe); foot.position.set(0, -.4, .05); foot.castShadow = true; knee.add(foot);
    return { hip, knee, foot };
  }
  const lL = buildLeg(legL), lR = buildLeg(legR);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, hips, torso, neck, head, aL, aR, lL, lR };
}
// Frees geometry; materials only when they were created for this object (shared pencil materials stay).
function disposeGroup(g) {
  g.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.userData.own) m.dispose(); }); });
}

// ---------------- NPC AI ----------------
const npcs = [];
const dialogue = ['Dober dan!', 'Lepo mesto, kajne?', 'Črte so danes ostre.', 'Pazi na avte!', 'Si že obiskal svetilnik?', 'Kava ob pristanišču je najboljša.', 'Ne me povozi, prosim.', 'Slišiš veter v črtah?', 'Za vogalom je nova ulica.', 'Danes je dober dan za sprehod.', 'Počasi, nekdo je oborožen!', 'Slišal sem strele!', 'Kaj je to za svetlobo na nebu?', 'Vojska je spet na cesti.'];
let gunshot = { x: 0, z: 0, t: -1e9 };       // t in ms (same clock as nowMs)
let wanted = 0, wantedDecay = 0;
let reportCd = 0;                              // seconds until another witness report counts
let alarm = 0;                                 // seconds: military base is on alert
function raiseWanted(n) { wanted = clamp(wanted + n, 0, 5); wantedDecay = 0; responseTimer = 0; hudWanted(); }
function makeNPC(x, z, role = 'civilian') {
  const opt = role === 'guard' ? { shirt: 0x5f6b4a, pants: 0x4a5238 }
    : role === 'police' ? { shirt: 0x3a4f6f, pants: 0x2f3a4f }
    : role === 'soldier' ? { shirt: 0x5b6a3c, pants: 0x4a4f2e, helmet: true, rifle: true, hair: 0x2a2a22 }
    : role === 'story' ? { shirt: 0x7a5a3a, pants: 0x3a3a40, hair: 0xd8d4c8 } : {};
  const h = makeHumanoid(opt); scene.add(h.g);
  const body = new CANNON.Body({ mass: 70, material: matObj, shape: new CANNON.Sphere(.35), position: CV(x, .4, z), linearDamping: .9, angularDamping: .9 });
  body.type = CANNON.Body.KINEMATIC; world.addBody(body);
  const n = {
    ...h, body, role, x, z, yaw: rand(0, TAU), speed: role === 'soldier' ? 2.1 : rand(1.1, 1.7), state: 'wander', target: null, path: null, pathI: 0,
    timer: rand(0, 4), health: role === 'soldier' ? 80 : 100, ragdoll: 0, dead: 0, phase: rand(0, TAU), home: CV(x, .4, z), alert: 0, mem: null, shootCd: 0,
    patrol: null, patrolI: 0, gesture: 0, fixed: role === 'story', temp: role === 'police' || role === 'soldier', gone: false, partner: null,
  };
  if (role === 'guard') n.speed = 1.4;
  if (role === 'story') n.health = 1e9;
  npcs.push(n); return n;
}
function removeNPC(n) {
  scene.remove(n.g); disposeGroup(n.g); world.removeBody(n.body);
  const i = npcs.indexOf(n); if (i >= 0) npcs.splice(i, 1);
}
// civilians across the city
const civSpots = [];
for (let i = 0; i < 110; i++) { const x = rand(-200, 200), z = rand(-330, 10); if (W.canWalk(x, z)) civSpots.push([x, z]); }
for (let i = 0; i < 14; i++) civSpots.push([rand(-420, -260), rand(-220, -30)]);
for (let i = 0; i < 10; i++) civSpots.push([rand(-420, 420), rand(10, 16)]);
civSpots.forEach(([x, z]) => makeNPC(x, z, 'civilian'));
for (let i = 0; i < 14; i++) { const x = rand(-34, 34), z = rand(-12, 6); if (W.canWalk(x, z)) makeNPC(x, z, 'civilian'); }
const mihec = makeNPC(16, 1, 'story'); mihec.name = 'Mihec';

function setTarget(n, x, z) { n.target = { x, z }; n.path = findPath(n.body.position.x, n.body.position.z, x, z); n.pathI = 0; }
function npcShoot(n, tx, ty, tz) {
  if (n.shootCd > 0) return;
  n.shootCd = n.role === 'soldier' ? .55 : .8;
  const from = n.g.position.clone().add(V3(0, 1.4, 0));
  fireBullet(from, V3(tx, ty, tz).sub(from).normalize(), 'npc');
}
// A living NPC is knocked over by a hit (ragdoll) and may die.
function hurtNPC(n, dmg, dir, lift = 2, byPlayer = false) {
  if (n.dead > 0 || n.fixed) return;
  n.health -= dmg;
  n.ragdoll = Math.max(n.ragdoll, 1.8);
  n.body.type = CANNON.Body.DYNAMIC;
  n.body.velocity.set(dir.x * 5, lift, dir.z * 5);
  n.body.angularVelocity.set(rand(-4, 4), rand(-4, 4), rand(-4, 4));
  if (byPlayer && n.role === 'civilian') raiseWanted(2);
  if (byPlayer && (n.role === 'police' || n.role === 'guard' || n.role === 'soldier')) raiseWanted(1);
  if (n.health <= 0) { n.dead = 3; n.ragdoll = 0; }
}
// Civilian starts running away from a threat (position record {x,z}).
function startFlee(n, threat) {
  const p = n.body.position; n.mem = threat; n.state = 'flee';
  const dx = p.x - threat.x, dz = p.z - threat.z, d = Math.hypot(dx, dz) || 1;
  setTarget(n, p.x + dx / d * 25, p.z + dz / d * 25);
}
// Guards and soldiers pass an alarm to nearby members of their own group.
function alertSquad(n) {
  const p = n.body.position;
  for (const m of npcs) {
    if (m === n || m.role !== n.role || m.dead > 0 || m.alert > 0) continue;
    if (Math.hypot(m.body.position.x - p.x, m.body.position.z - p.z) < 25) { m.alert = 3; m.mem = n.mem; }
  }
}
function updateNPC(n, dt, now) {
  const p = n.body.position;
  if (n.dead > 0) {
    n.dead -= dt;
    n.g.position.set(p.x, Math.max(0, p.y - .4), p.z); n.g.quaternion.copy(n.body.quaternion);
    n.g.scale.setScalar(Math.max(.01, Math.min(1, n.dead / 3)));
    if (n.dead <= 0) {
      if (n.temp) { n.gone = true; return; }
      n.health = 100; n.state = 'wander'; n.ragdoll = 0; n.body.type = CANNON.Body.KINEMATIC;
      n.body.position.copy(n.home); n.body.velocity.setZero(); n.body.quaternion.set(0, 0, 0, 1); n.g.scale.setScalar(1); n.g.quaternion.set(0, 0, 0, 1);
    }
    return;
  }
  const distP = Math.hypot(p.x - W.walkPosition.x, p.z - W.walkPosition.z);
  n.g.visible = distP < 110;
  if (n.temp && distP > 190 && n.alert <= 0) { n.gone = true; return; }
  if (!n.g.visible) { n.body.velocity.setZero(); return; }
  n.shootCd = Math.max(0, n.shootCd - dt);
  if (n.ragdoll > 0) {
    n.ragdoll -= dt; n.body.type = CANNON.Body.DYNAMIC; n.g.position.copy(n.body.position); n.g.quaternion.copy(n.body.quaternion);
    if (n.ragdoll <= 0) { n.state = 'wander'; n.body.type = CANNON.Body.KINEMATIC; n.body.quaternion.set(0, 0, 0, 1); n.body.position.y = .4; }
    return;
  }
  if (n.fixed) { // story NPC: stands still, turns to face the player
    if (distP < 14) n.yaw = Math.atan2(W.walkPosition.x - p.x, W.walkPosition.z - p.z);
    n.body.velocity.setZero(); n.g.position.set(p.x, 0, p.z); n.g.rotation.set(0, n.yaw, 0);
    n.head.rotation.y = Math.sin(now * .0006 + n.phase) * .2; n.hips.position.y = .95 + Math.sin(now * .0015 + n.phase) * .008;
    n.aL.shoulder.rotation.x = 0; n.aR.shoulder.rotation.x = 0; return;
  }
  const hearGun = (now - gunshot.t) < 4000 && Math.hypot(p.x - gunshot.x, p.z - gunshot.z) < 45;
  const seesPlayer = distP < 30 && hasLOS(p.x, 1.4, p.z, W.walkPosition.x, W.walkPosition.y, W.walkPosition.z);
  let threat = null;
  if (player.armed && seesPlayer && distP < 22) threat = { x: W.walkPosition.x, z: W.walkPosition.z };
  if (hearGun) threat = { x: gunshot.x, z: gunshot.z };
  for (const v of vehicles) {
    if (!v.active) continue; const sp = v.body.velocity.length();
    if (sp > 5) { const d = Math.hypot(p.x - v.g.position.x, p.z - v.g.position.z);
      if (d < 7) { threat = { x: v.g.position.x, z: v.g.position.z };
        if (d < 2.2 && n.ragdoll <= 0) { // run-over
          const dir = V3(p.x - v.g.position.x, 0, p.z - v.g.position.z).normalize();
          hurtNPC(n, sp * 12, dir, 3, v.driver === player);
          break;
        } } } }
  // witnesses: a civilian who sees the player shooting reports it to the police
  if (n.role === 'civilian' && n.reportCd > 0) n.reportCd -= dt;
  if (n.role === 'civilian' && player.armed && seesPlayer && distP < 30 && (now - gunshot.t) < 1200 && (n.reportCd || 0) <= 0) {
    n.reportCd = 25;
    if (reportCd <= 0) { reportCd = 12; raiseWanted(1); showHint('Nekdo te je videl. Policija je obveščena.', 3); }
  }
  if (n.role === 'guard' || n.role === 'soldier') { guardAI(n, dt, now, distP, threat); return; }
  if (n.role === 'police') { policeAI(n, dt, now, distP); return; }
  // civilian utility AI
  if (threat) { n.alert = 3; n.mem = threat;
    if (n.state !== 'flee') {
      startFlee(n, threat);
      for (const m of npcs) { // panic spreads to people standing close by
        if (m === n || m.role !== 'civilian' || m.dead > 0 || m.fixed) continue;
        if (Math.hypot(m.body.position.x - p.x, m.body.position.z - p.z) < 7) { m.alert = Math.max(m.alert, 2.5); m.mem = threat; }
      }
    }
  } else if (n.alert > 0) { if (n.mem && n.state !== 'flee') startFlee(n, n.mem); n.alert -= dt; if (n.alert <= 0) { n.state = 'wander'; n.timer = 0; } }
  n.timer -= dt;
  if (n.state === 'wander') {
    if (!n.target || n.timer <= 0) {
      const r = Math.random();
      if (r < .18) { n.state = 'idle'; n.timer = rand(2, 6); }
      else if (r < .3) { // socialise: find nearby civilian
        const other = npcs.find(m => m !== n && m.role === 'civilian' && m.dead <= 0 && Math.hypot(m.body.position.x - p.x, m.body.position.z - p.z) < 12);
        if (other) { n.state = 'social'; n.timer = rand(3, 7); n.partner = other; setTarget(n, other.body.position.x + rand(-1, 1), other.body.position.z + rand(-1, 1)); }
        else { setTarget(n, n.home.x + rand(-20, 20), n.home.z + rand(-20, 20)); n.timer = rand(4, 10); }
      } else { setTarget(n, n.home.x + rand(-24, 24), n.home.z + rand(-24, 24)); n.timer = rand(4, 11); }
    }
  } else if (n.state === 'idle') { if (n.timer <= 0) { n.state = 'wander'; n.timer = 0; } }
  else if (n.state === 'social') { if (n.timer <= 0 || !n.partner) { n.state = 'wander'; n.timer = 0; } }
  else if (n.state === 'flee') { if (n.alert <= 0) { n.state = 'wander'; n.timer = 0; } }
  // follow path
  let moving = false, spd = n.speed * (n.state === 'flee' ? 2.1 : 1);
  if (n.path && n.pathI < n.path.length && (n.state === 'wander' || n.state === 'flee' || n.state === 'social')) {
    const wp = n.path[n.pathI], dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
    if (d < 1.2) { n.pathI++; if (n.pathI >= n.path.length) { n.path = null; if (n.state === 'wander') n.timer = Math.min(n.timer, 1); } }
    else { const nx = dx / d, nz = dz / d;
      let sx = 0, sz = 0; if (distP < 60) for (const m of npcs) { if (m === n || m.dead > 0) continue; const mx = p.x - m.body.position.x, mz = p.z - m.body.position.z, md = Math.hypot(mx, mz); if (md < 1 && md > 0) { sx += mx / md * (1 - md); sz += mz / md * (1 - md); } }
      const vx = nx * spd + sx * 1.5, vz = nz * spd + sz * 1.5;
      n.body.velocity.set(vx, 0, vz); n.yaw = Math.atan2(vx, vz); moving = true; }
  } else if (n.state === 'social' && n.partner) { n.yaw = Math.atan2(n.partner.body.position.x - p.x, n.partner.body.position.z - p.z); n.body.velocity.setZero(); }
  else n.body.velocity.setZero();
  n.g.position.set(p.x, 0, p.z); n.g.rotation.set(0, n.yaw, 0);
  animateHuman(n, now, moving, distP);
}
function animateHuman(n, now, moving, distP) {
  const t = now * .001 * (moving ? n.speed * 3.4 : 1) + n.phase;
  const sw = moving ? Math.sin(t) * .55 : 0;
  n.lL.hip.rotation.x = sw; n.lR.hip.rotation.x = -sw;
  if (distP < 70) {
    n.lL.knee.rotation.x = moving ? Math.max(0, -Math.sin(t)) * .7 : 0; n.lR.knee.rotation.x = moving ? Math.max(0, Math.sin(t)) * .7 : 0;
    n.aL.shoulder.rotation.x = -sw * .7; n.aR.shoulder.rotation.x = sw * .7;
    n.aL.elbow.rotation.x = -.3; n.aR.elbow.rotation.x = -.3;
    n.hips.position.y = .95 + (moving ? Math.abs(Math.sin(t)) * .04 : Math.sin(now * .001 + n.phase) * .01);
    n.head.rotation.y = Math.sin(now * .0006 + n.phase) * .25;
    if (n.state === 'social') n.aR.shoulder.rotation.x = -.6 + Math.sin(now * .004) * .3;
    if (n.state === 'flee') n.torso.rotation.x = .2; else n.torso.rotation.x = 0;
  } else { n.aL.shoulder.rotation.x = -sw * .5; n.aR.shoulder.rotation.x = sw * .5; n.hips.position.y = .95; }
}
function guardAI(n, dt, now, distP, threat) {
  const p = n.body.position;
  const los = distP < 45 && hasLOS(p.x, 1.5, p.z, W.walkPosition.x, W.walkPosition.y, W.walkPosition.z);
  const intruder = (distP < 22 && los) || (distP < 40 && los && (player.armed || wanted > 0)) || (alarm > 0 && distP < 260 && los);
  if (intruder || threat) { n.alert = 4; n.mem = { x: W.walkPosition.x, z: W.walkPosition.z }; alertSquad(n); }
  else n.alert = Math.max(0, n.alert - dt);
  let moving = false;
  if (n.alert > 0 && n.mem) {
    const dx = n.mem.x - p.x, dz = n.mem.z - p.z, d = Math.hypot(dx, dz);
    n.yaw = Math.atan2(dx, dz);
    if (d > 9) { const nx = dx / d, nz = dz / d; n.body.velocity.set(nx * n.speed * 1.6, 0, nz * n.speed * 1.6); moving = true; }
    else { n.body.velocity.setZero(); npcShoot(n, W.walkPosition.x, W.walkPosition.y, W.walkPosition.z); }
  } else if (n.patrol) {
    const wp = n.patrol[n.patrolI], dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
    if (d < 1.5) n.patrolI = (n.patrolI + 1) % n.patrol.length;
    else { n.body.velocity.set(dx / d * n.speed, 0, dz / d * n.speed); n.yaw = Math.atan2(dx, dz); moving = true; }
  } else n.body.velocity.setZero();
  n.g.position.set(p.x, 0, p.z); n.g.rotation.set(0, n.yaw, 0);
  const t = now * .001 * (moving ? n.speed * 3.4 : 1) + n.phase, sw = moving ? Math.sin(t) * .5 : 0;
  n.lL.hip.rotation.x = sw; n.lR.hip.rotation.x = -sw; n.aL.shoulder.rotation.x = -sw * .5; n.aR.shoulder.rotation.x = -.9;
  n.head.rotation.y = n.alert > 0 ? 0 : Math.sin(now * .0005 + n.phase) * .4;
}
function policeAI(n, dt, now, distP) {
  n.timer -= dt;
  const p = n.body.position; let moving = false;
  if (wanted > 0) {
    const dx = W.walkPosition.x - p.x, dz = W.walkPosition.z - p.z, d = Math.hypot(dx, dz);
    n.yaw = Math.atan2(dx, dz);
    if (d > 7) {
      if (!n.path || n.timer <= 0) { setTarget(n, W.walkPosition.x, W.walkPosition.z); n.timer = 1; }
      if (n.path && n.pathI < n.path.length) { const wp = n.path[n.pathI], wx = wp.x - p.x, wz = wp.z - p.z, wd = Math.hypot(wx, wz); if (wd < 1.2) n.pathI++; else { n.body.velocity.set(wx / wd * n.speed * 2, 0, wz / wd * n.speed * 2); moving = true; } }
      else { // no path: run straight at the player
        n.body.velocity.set(dx / d * n.speed * 1.8, 0, dz / d * n.speed * 1.8); moving = true; }
    }
    else { n.body.velocity.setZero(); if (wanted >= 2) npcShoot(n, W.walkPosition.x, W.walkPosition.y, W.walkPosition.z); }
  } else { n.body.velocity.setZero(); }
  n.g.position.set(p.x, 0, p.z); n.g.rotation.set(0, n.yaw, 0);
  const t = now * .001 * (moving ? 6 : 1) + n.phase, sw = moving ? Math.sin(t) * .55 : 0;
  n.lL.hip.rotation.x = sw; n.lR.hip.rotation.x = -sw; n.aL.shoulder.rotation.x = -sw * .6; n.aR.shoulder.rotation.x = wanted > 0 ? -.9 : sw * .6;
}

// ---------------- weapons & ballistics ----------------
const bullets = [];
const tracerBase = new THREE.LineBasicMaterial({ color: 0xb86448, transparent: true, opacity: .9 });
const fuels = [];                   // fuel tanks in the military bases (destructible)
function fireBullet(from, dir, owner, ownVehicle = null) {
  const range = owner === 'npc' ? 60 : 140;
  let hit = null, hitDist = range;
  const ray = new THREE.Ray(from, dir);
  const blockT = bulletBlock(ray, range);
  if (blockT < hitDist) { hitDist = blockT; hit = { type: 'wall' }; }
  for (const n of npcs) { if (n.dead > 0 || n.ragdoll > 0) continue; const c = n.g.position.clone().add(V3(0, 1, 0)); const t = raySphere(ray, c, .5); if (t !== null && t < hitDist) { hitDist = t; hit = { type: 'npc', n }; } }
  for (const v of vehicles) { if (!v.active || v === ownVehicle) continue; const t = raySphere(ray, v.g.position.clone().add(V3(0, 1, 0)), v.kind === 'tank' ? 2.8 : 2.2); if (t !== null && t < hitDist) { hitDist = t; hit = { type: 'vehicle', v }; } }
  for (const f of fuels) { if (f.dead) continue; const t = raySphere(ray, V3(f.x, 2.5, f.z), 3); if (t !== null && t < hitDist) { hitDist = t; hit = { type: 'fuel', f }; } }
  if (owner !== 'player') { const t = raySphere(ray, W.walkPosition.clone(), .5); if (t !== null && t < hitDist) { hitDist = t; hit = { type: 'player' }; } }
  const end = from.clone().add(dir.clone().multiplyScalar(hitDist));
  const g = new THREE.BufferGeometry().setFromPoints([from, end]);
  const line = new THREE.Line(g, tracerBase.clone()); scene.add(line);
  bullets.push({ line, life: .08 });
  if (hit) {
    if (hit.type === 'npc') { hurtNPC(hit.n, 34, dir, 2, owner === 'player'); }
    else if (hit.type === 'vehicle') { damageVehicle(hit.v, 12); if (owner === 'player') raiseWanted(1); }
    else if (hit.type === 'fuel') { damageFuel(hit.f, 22, owner); }
    else if (hit.type === 'player') { damagePlayer(12); }
    spark(end);
  }
  if (owner === 'player') { gunshot = { x: from.x, z: from.z, t: nowMs }; sfx.shot(.3, 0); }
  else sfx.shot(.22, from.distanceTo(W.walkPosition));
}
function raySphere(ray, c, r) { const oc = ray.origin.clone().sub(c); const b = oc.dot(ray.direction); const cc = oc.lengthSq() - r * r; const disc = b * b - cc; if (disc < 0) return null; const t = -b - Math.sqrt(disc); return t > 0 ? t : null; }
function rayAABB(ray, minx, miny, minz, maxx, maxy, maxz) {
  let tmin = 0, tmax = 1e9;
  const o = [ray.origin.x, ray.origin.y, ray.origin.z], d = [ray.direction.x, ray.direction.y, ray.direction.z], mn = [minx, miny, minz], mx = [maxx, maxy, maxz];
  for (let i = 0; i < 3; i++) { if (Math.abs(d[i]) < 1e-8) { if (o[i] < mn[i] || o[i] > mx[i]) return null; } else { let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i]; if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null; } }
  return tmin > 0 ? tmin : null;
}
function bulletBlock(ray, maxDist) {
  let best = maxDist;
  for (const o of W.obstacles) { const h = (o.w > 6 && o.d > 6) ? 14 : 2.2; const t = rayAABB(ray, o.x - o.w / 2, 0, o.z - o.d / 2, o.x + o.w / 2, h, o.z + o.d / 2); if (t !== null && t < best) best = t; }
  if (ray.direction.y < -.01) { const t = (0.05 - ray.origin.y) / ray.direction.y; if (t > 0 && t < best) best = t; }
  return best;
}
function hasLOS(ax, ay, az, bx, by, bz) {
  const dir = V3(bx - ax, by - ay, bz - az); const dist = dir.length(); if (dist < .01) return true; dir.normalize();
  const ray = new THREE.Ray(V3(ax, ay, az), dir);
  return bulletBlock(ray, dist) >= dist - .1;
}
const sparks = [];
function spark(pos) { const s = new Sketch(); for (let i = 0; i < 6; i++) { const a = rand(0, TAU), e = rand(-.5, .8); s.line([0, 0, 0], [Math.cos(a) * .3, e * .3, Math.sin(a) * .3], 3); } const g = s.finish(false); g.position.copy(pos); scene.add(g); sparks.push({ g, life: .25 }); }
// Ballistic solution: velocity so that a projectile (gravity 9.82) reaches `to` at given horizontal speed.
function ballisticVel(from, to, speed = 70) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y; const dh = Math.hypot(dx, dz) || .01;
  const t = dh / speed; const vy = (dy + .5 * 9.82 * t * t) / t;
  return V3(dx / dh * speed, vy, dz / dh * speed);
}
// Projectiles are integrated by hand: they arc under gravity and explode on the first hit.
const shells = [];
function fireShell(from, vel, owner, power = 24) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a2620 }));
  m.position.copy(from); scene.add(m);
  shells.push({ m, p: from.clone(), v: vel.clone(), owner, power, life: 8 });
}
function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]; const prev = s.p.clone();
    s.v.y -= 9.82 * dt; s.p.addScaledVector(s.v, dt); s.m.position.copy(s.p); s.life -= dt;
    const seg = s.p.clone().sub(prev), len = seg.length(); let hit = null;
    if (len > 0) { const ray = new THREE.Ray(prev, seg.clone().multiplyScalar(1 / len)); const bt = bulletBlock(ray, len); if (bt < len) hit = ray.at(bt, V3()); }
    if (!hit && s.p.y < .05) hit = V3(s.p.x, .05, s.p.z);
    if (!hit) for (const n of npcs) { if (n.dead > 0 || n.fixed) continue; if (Math.hypot(n.body.position.x - s.p.x, n.body.position.z - s.p.z) < 1.2 && s.p.y < 2.2) { hit = s.p.clone(); break; } }
    if (!hit) for (const v of vehicles) { if (!v.active) continue; if (v.g.position.distanceTo(s.p) < 2.6) { hit = s.p.clone(); break; } }
    if (!hit && s.owner !== 'player' && W.walkPosition.distanceTo(s.p) < 1.3) hit = s.p.clone();
    if (!hit) for (const f of fuels) { if (!f.dead && Math.hypot(f.x - s.p.x, f.z - s.p.z) < 3 && s.p.y < 5) { hit = s.p.clone(); damageFuel(f, 30, s.owner); break; } }
    if (hit || s.life <= 0) {
      if (hit) boom(hit, s.power, { owner: s.owner });
      scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); shells.splice(i, 1);
    }
  }
}
const grenades = [];
function throwGrenade() {
  if (player.grenades <= 0 || player.dead || player.vehicle) return;
  player.grenades--;
  const dir = V3(); camera.getWorldDirection(dir);
  const from = camera.position.clone().add(dir.clone().multiplyScalar(.6));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), lambert(0x4a5238)); mesh.castShadow = true; mesh.position.copy(from); scene.add(mesh);
  const body = new CANNON.Body({ mass: .6, material: matGrenade, shape: new CANNON.Sphere(.12), position: CV(from.x, from.y, from.z), linearDamping: .02, angularDamping: .4 });
  body.velocity.set(dir.x * 17, dir.y * 17 + 4, dir.z * 17); body.angularVelocity.set(rand(-5, 5), rand(-5, 5), rand(-5, 5));
  world.addBody(body); grenades.push({ mesh, body, fuse: 2.4 });
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const gr = grenades[i]; gr.mesh.position.copy(gr.body.position); gr.fuse -= dt;
    if (gr.fuse <= 0) { boom(V3(gr.body.position.x, gr.body.position.y, gr.body.position.z), 30, { owner: 'player' }); world.removeBody(gr.body); scene.remove(gr.mesh); gr.mesh.geometry.dispose(); gr.mesh.material.dispose(); grenades.splice(i, 1); }
  }
}

// ---------------- explosions, debris, fire ----------------
const pendingBooms = [];   // explosions are queued and resolved outside the physics step
const delayed = [];        // {t, fn}
const fxList = [];         // {age, life, tick, dispose}
const debris = [];
let shake = 0;
const lightPool = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xff9a4a, 0, 60, 1.4); scene.add(l); return { l, t: 0, dur: 1, max: 0 }; });
const emberGeo = new THREE.BoxGeometry(.09, .09, .09);
const sphereGeo = new THREE.IcosahedronGeometry(1, 1);
const ringGeo = new THREE.RingGeometry(.85, 1, 48);
function boom(pos, power = 20, opt = {}) { pendingBooms.push({ pos: pos.clone(), power, opt }); }
function flushBooms() { while (pendingBooms.length) { const b = pendingBooms.shift(); explode(b.pos, b.power, b.opt); } }
function later(t, fn) { delayed.push({ t, fn }); }
function addFX(life, tick, dispose) { fxList.push({ age: 0, life, tick, dispose }); }
function flash(pos, power) {
  const L = lightPool.reduce((a, b) => (a.t < b.t ? a : b));
  L.l.position.copy(pos).add(V3(0, 2, 0)); L.max = power * 5; L.dur = 1.6; L.t = 1.6;
}
function explode(pos, power = 20, opt = {}) {
  const R = 4 + power * .45, pp = pos.clone();
  const dPlayer = pp.distanceTo(W.walkPosition);
  // --- visuals ---
  const g = new THREE.Group(); g.position.copy(pp); scene.add(g);
  const fireMats = [0xffe6a8, 0xffa04a, 0xd9542e].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1, depthWrite: false }));
  const fireballs = [];
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(sphereGeo, fireMats[i % 3]); m.position.set(rand(-.5, .5) * R * .45, rand(0, .5) * R * .3, rand(-.5, .5) * R * .45); m.userData.r = rand(.55, 1) * R * .42; g.add(m); fireballs.push(m); }
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x4b4740, transparent: true, opacity: .75, depthWrite: false });
  const smokes = [];
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(sphereGeo, smokeMat); m.position.set(rand(-1, 1) * R * .5, rand(0, .3) * R, rand(-1, 1) * R * .5); m.userData.r = R * rand(.3, .5); m.userData.y0 = m.position.y; g.add(m); smokes.push(m); }
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf3f0e7, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = .2; g.add(ring);
  const burstSegs = []; for (let i = 0; i < 26; i++) { const a = rand(0, TAU), e = rand(-.1, .5), L = rand(.5, 1); burstSegs.push([[0, .4, 0], [Math.cos(a) * L * R, .4 + e * L * R * .5, Math.sin(a) * L * R]]); }
  const burst = lineSet(burstSegs, 0x30332d, 1, false); g.add(burst.obj);
  const embMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
  const embers = []; for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(emberGeo, embMat); m.position.set(0, .5, 0); m.userData.v = V3(rand(-1, 1) * R * .8, rand(.6, 1.6) * R * .6, rand(-1, 1) * R * .8); g.add(m); embers.push(m); }
  const life = 1.8 + power * .03;
  addFX(life, p => {
    for (const m of fireballs) { const k = m.userData.r * (.25 + .75 * Math.min(1, p * 2.5)) * (1 - .3 * p); m.scale.setScalar(Math.max(.01, k)); m.position.y += 0; m.material.opacity = 1 - p * p; }
    for (const m of smokes) { m.position.y = m.userData.y0 + p * R * .9; m.scale.setScalar(m.userData.r * (.4 + p * 1.6)); m.material.opacity = .75 * (1 - p); }
    ringMat.opacity = .85 * Math.max(0, 1 - p * 1.6); ring.scale.setScalar(.3 + p * R * 1.8);
    burst.mat.opacity = Math.max(0, 1 - p * 1.3); burst.obj.scale.setScalar(.3 + .7 * Math.min(1, p * 4));
    for (const m of embers) { m.userData.v.y -= 9.8 * .016; m.position.addScaledVector(m.userData.v, .016); }
  }, () => {
    scene.remove(g);
    fireballs.forEach(m => m.material.dispose()); fireMats.forEach(m => m.dispose());
    smokeMat.dispose(); ringMat.dispose(); ring.geometry === ringGeo || ring.geometry.dispose();
    burst.geo.dispose(); burst.mat.dispose(); embMat.dispose();
  });
  // scorch mark on the ground
  if (pp.y < 2) addDecal(pp, R * .55);
  flash(pp, power);
  shake = Math.max(shake, clamp(power / 16 * (1 - dPlayer / 150), 0, 1.4));
  sfx.explosion(power, dPlayer);
  // --- damage ---
  const dmgAt = d => clamp(1 - d / R, 0, 1);
  // player
  if (!player.dead) {
    const d = pp.distanceTo(W.walkPosition), k = dmgAt(d);
    if (k > 0) {
      if (!player.vehicle) {
        damagePlayer(power * 2.2 * k);
        const dir = W.walkPosition.clone().sub(pp); dir.y = 0; if (dir.lengthSq() < .01) dir.set(rand(-1, 1), 0, rand(-1, 1));
        dir.normalize(); const np = W.walkPosition.clone().addScaledVector(dir, 1.2 * k);
        if (W.canWalk(np.x, np.z)) W.walkPosition.x = np.x, W.walkPosition.z = np.z;
        player.vy = Math.max(player.vy, 5 * k);
      } else damagePlayer(power * .6 * k);
    }
  }
  // NPCs
  for (const n of npcs) {
    if (n.dead > 0 || n.fixed) continue;
    const d = Math.hypot(n.body.position.x - pp.x, n.body.position.z - pp.z); if (d > R * 1.1) continue;
    const dir = V3(n.body.position.x - pp.x, .3, n.body.position.z - pp.z).normalize();
    hurtNPC(n, power * 3 * dmgAt(d) + 10, dir, 3 + power * .08 * dmgAt(d), opt.owner === 'player');
  }
  // vehicles
  for (const v of vehicles) {
    if (!v.active) continue;
    const d = v.g.position.distanceTo(pp); if (d > R + 3) continue;
    const k = clamp(1 - d / (R + 3), 0, 1);
    damageVehicle(v, power * 1.3 * k);
    if (!v.active) continue;
    const dir = v.g.position.clone().sub(pp).normalize();
    v.body.applyImpulse(CV(dir.x * power * 90 * k, power * 40 * k, dir.z * power * 90 * k), CV());
    v.body.angularVelocity.set(rand(-1, 1) * k, rand(-1, 1) * k, rand(-1, 1) * k);
  }
  // props
  for (const p of props) {
    const d = p.g.position.distanceTo(pp); if (d > R) continue;
    const k = dmgAt(d), dir = p.g.position.clone().sub(pp).normalize();
    p.body.applyImpulse(CV(dir.x * power * 6 * k, power * 4 * k, dir.z * power * 6 * k), CV());
  }
  // fuel tanks (chain reaction)
  for (const f of fuels) {
    if (f.dead) continue;
    const d = Math.hypot(f.x - pp.x, f.z - pp.z); if (d > R + 3) continue;
    damageFuel(f, power * 1.6 * clamp(1 - d / (R + 3), 0, 1), opt.owner, .25);
  }
  spawnDebris(pp, power, Math.min(16, 4 + Math.round(power / 3)));
}
function addDecal(pos, r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0x2a241e, transparent: true, opacity: .45, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, .035, pos.z); scene.add(m);
  addFX(30, p => { m.material.opacity = .45 * (1 - Math.max(0, p - .6) / .4); }, () => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
}
function spawnDebris(p, power, count) {
  for (let i = 0; i < count; i++) {
    const s = rand(.14, .38), geo = new THREE.BoxGeometry(s, s, s);
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(geo, FM[i % 2 ? 0 : 1]); mesh.castShadow = true; grp.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), LM[0]); grp.add(edges);
    grp.position.copy(p); scene.add(grp);
    const body = new CANNON.Body({ mass: 2, material: matObj, shape: new CANNON.Box(CV(s / 2, s / 2, s / 2)), position: CV(p.x + rand(-.5, .5), p.y + .6, p.z + rand(-.5, .5)), linearDamping: .05, angularDamping: .2 });
    const a = rand(0, TAU), sp = rand(4, 7) + power * .22;
    body.velocity.set(Math.cos(a) * sp * rand(.4, 1), rand(4, 8) + power * .12, Math.sin(a) * sp * rand(.4, 1));
    body.angularVelocity.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
    world.addBody(body);
    debris.push({ grp, body, life: rand(6, 9), geo, edges, hurt: false });
  }
  while (debris.length > 140) removeDebris(debris[0]);
}
function removeDebris(d) {
  scene.remove(d.grp); world.removeBody(d.body); d.geo.dispose(); d.edges.geometry.dispose();
  const i = debris.indexOf(d); if (i >= 0) debris.splice(i, 1);
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.grp.position.copy(d.body.position); d.grp.quaternion.copy(d.body.quaternion); d.life -= dt;
    const sp = d.body.velocity.length();
    if (sp > 4 && !d.hurt && W.walkPosition.distanceTo(d.body.position) < 1.1) { d.hurt = true; damagePlayer(sp * 1.2); }
    if (sp > 5) for (const n of npcs) { if (n.dead > 0 || n.fixed) continue; if (Math.hypot(n.body.position.x - d.body.position.x, n.body.position.z - d.body.position.z) < .9 && d.body.position.y < 2) { hurtNPC(n, sp * 3, d.body.velocity, 2); break; } }
    if (d.life <= 0 || d.body.position.y < -20) removeDebris(d);
  }
}
// Smoke puffs drifting up from damaged vehicles.
const puffGeo = new THREE.IcosahedronGeometry(.5, 0);
[emberGeo, sphereGeo, ringGeo, puffGeo].forEach(g => { g.userData.shared = true; });
function puff(pos, dark = true) {
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: dark ? 0x4b4740 : 0xd8d2c2, transparent: true, opacity: .55, depthWrite: false }));
  m.position.copy(pos); scene.add(m); const s0 = rand(.6, 1.1), vy = rand(1.5, 2.5);
  addFX(rand(2.2, 3.2), p => { m.position.y += vy * .016; m.scale.setScalar(s0 * (1 + p * 3)); m.material.opacity = .55 * (1 - p); }, () => { scene.remove(m); m.material.dispose(); });
}

// ---------------- vehicles ----------------
const vehicles = [];
const VEH_R = { car: 2.5, tank: 3.8, heli: 2.4, plane: 4.2, boat: 2.2 };
function buildWheel(r = .36, w = .24) {
  const grp = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), lambert(0x2b2b2b)); tire.rotation.z = Math.PI / 2; tire.castShadow = true; grp.add(tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * .55, r * .55, w + .02, 12), lambert(0xcfcabb)); rim.rotation.z = Math.PI / 2; grp.add(rim);
  const s = new Sketch(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; s.line([0, 0, 0], [0, Math.cos(a) * r * .5, Math.sin(a) * r * .5], 1); } grp.add(s.finish(false));
  return grp;
}
function buildCarBody(type) {
  const profiles = {
    sedan: [[-2.25, .3], [-2.3, .62], [-2.1, .8], [-1.3, .86], [-.7, 1.3], [.5, 1.36], [1.2, 1.02], [1.95, .9], [2.25, .66], [2.3, .4], [2.15, .28]],
    sport: [[-2.15, .24], [-2.2, .46], [-1.95, .6], [-1.05, .66], [-.45, .98], [.5, 1.0], [1.15, .7], [1.95, .58], [2.15, .4], [2.1, .24]],
    suv: [[-2.3, .34], [-2.35, .7], [-2.2, 1.5], [-1.5, 1.78], [.9, 1.78], [1.7, 1.5], [2.25, 1.1], [2.35, .6], [2.3, .34]],
    van: [[-2.35, .32], [-2.4, .62], [-2.25, 1.7], [-1.5, 1.95], [.9, 1.95], [1.7, 1.55], [2.25, 1.2], [2.35, .62], [2.3, .32]],
    truck: [[-2.6, .36], [-2.65, .72], [-2.45, 1.5], [-1.3, 1.7], [-.9, 1.2], [2.4, 1.2], [2.5, .72], [2.45, .36]],
    bus: [[-3.2, .42], [-3.25, .82], [-3.1, 2.2], [3.1, 2.2], [3.25, .82], [3.2, .42]],
    police: [[-2.25, .3], [-2.3, .62], [-2.1, .8], [-1.3, .86], [-.7, 1.3], [.5, 1.36], [1.2, 1.02], [1.95, .9], [2.25, .66], [2.3, .4], [2.15, .28]],
  };
  const P = profiles[type] || profiles.sedan;
  const width = type === 'bus' ? 2.3 : type === 'truck' ? 2.2 : 1.9;
  const tone = type === 'sport' ? 5 : 0;
  const body = new THREE.Group();
  const exterior = new THREE.Group(); body.add(exterior);
  exterior.add(smoothProfile(P, width, tone, .05));
  const s = new Sketch(); const hw = width / 2;
  const roofY = Math.max(...P.map(p => p[1]));
  const winBot = roofY * .68, winTop = roofY * .94;
  const cabLen = type === 'bus' ? 2.6 : type === 'truck' ? 1.1 : 1.0;
  const cabZ = type === 'truck' ? -1.6 : type === 'bus' ? 0 : .1;
  s.face([[hw + .02, winBot, cabZ - cabLen], [hw + .02, winBot, cabZ + cabLen], [hw + .02, winTop, cabZ + cabLen * .8], [hw + .02, winTop, cabZ - cabLen * .8]], 3);
  s.face([[-hw - .02, winBot, cabZ - cabLen], [-hw - .02, winBot, cabZ + cabLen], [-hw - .02, winTop, cabZ + cabLen * .8], [-hw - .02, winTop, cabZ - cabLen * .8]], 3);
  s.face([[-.55, winBot, cabZ + cabLen + .05], [.55, winBot, cabZ + cabLen + .05], [.5, winTop, cabZ + cabLen * .7], [-.5, winTop, cabZ + cabLen * .7]], 3);
  const fz = Math.max(...P.map(p => p[0])) - .12, rz = Math.min(...P.map(p => p[0])) + .12;
  s.box(hw - .32, .55, fz, .3, .13, .1, 4); s.box(-hw + .32, .55, fz, .3, .13, .1, 4);
  s.box(hw - .32, .55, rz, .3, .13, .1, 5); s.box(-hw + .32, .55, rz, .3, .13, .1, 5);
  s.box(0, .5, fz + .02, width * .5, .16, .04, 1); s.box(0, .34, fz + .03, .5, .12, .03, 4);
  const wz = (type === 'bus' ? 6.4 : type === 'truck' ? 5 : type === 'van' || type === 'suv' ? 4.7 : 4.4) / 2 - .9;
  for (const sx of[hw, -hw]) for (const zz of[wz, -wz]) { const arch = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; arch.push([sx, .42 + Math.sin(a) * .5, zz + Math.cos(a) * .5]); } s.path(arch, 0); }
  for (const sx of[hw + .02, -hw - .02]) { s.line([sx, .32, cabZ - cabLen * .5], [sx, winBot, cabZ - cabLen * .5], 1); s.line([sx, .32, cabZ + cabLen * .5], [sx, winBot, cabZ + cabLen * .5], 1); }
  s.box(hw + .16, winBot, cabZ + cabLen * .6, .16, .08, .12, 0); s.box(-hw - .16, winBot, cabZ + cabLen * .6, .16, .08, .12, 0);
  s.box(0, .3, fz + .06, width, .12, .1, 1); s.box(0, .3, rz - .06, width, .12, .1, 1);
  let lightbar = null;
  if (type === 'police') {
    s.box(0, roofY + .06, 0, .9, .1, .4, 1); exterior.add(s.finish());
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(.22, .12, .32), new THREE.MeshLambertMaterial({ color: 0xb8483c, emissive: 0x661111 })); red.position.set(-.24, roofY + .17, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(.22, .12, .32), new THREE.MeshLambertMaterial({ color: 0x3c5fb8, emissive: 0x112266 })); blue.position.set(.24, roofY + .17, 0);
    lightbar.add(red, blue); exterior.add(lightbar);
  } else exterior.add(s.finish());
  const interior = new THREE.Group(); interior.visible = false;
  const is = new Sketch();
  is.box(0, .55, cabZ + cabLen * .9, width * .86, .18, .4, 1);
  is.box(0, .42, cabZ + .1, width * .8, .1, .9, 2);
  is.circle(-hw * .45, .78, cabZ + cabLen * .75, .19, 0, 'xy', 14);
  is.line([-hw * .45, .6, cabZ + cabLen * .8], [-hw * .45, .78, cabZ + cabLen * .75], 0);
  for (const sx of[-hw * .45, hw * .45]) { is.box(sx, .42, cabZ - .3, .5, .12, .55, 1); is.box(sx, .62, cabZ - .55, .5, .45, .1, 1); }
  is.box(0, roofY - .04, cabZ, width * .9, .04, cabLen * 1.6, 2);
  for (const sx of[-hw + .06, hw - .06]) is.line([sx, winBot, cabZ - cabLen], [sx, winTop, cabZ - cabLen * .8], 0);
  interior.add(is.finish(false)); body.add(interior);
  return { g: body, width, lightbar, exterior, interior };
}
function createCar(type, x, z, yaw = 0, ai = null) {
  const { g: chassisG, lightbar, exterior, interior } = buildCarBody(type); chassisG.position.y = -.7;
  const wrap = new THREE.Group(); wrap.add(chassisG); scene.add(wrap);
  const wheelRoot = new THREE.Group(); scene.add(wheelRoot);
  const dims = type === 'bus' ? { l: 6.4, w: 2.3, h: 1.2 } : type === 'truck' ? { l: 5, w: 2.2, h: 1.1 } : type === 'van' || type === 'suv' ? { l: 4.7, w: 1.95, h: 1.15 } : { l: 4.4, w: 1.9, h: 1.0 };
  const body = new CANNON.Body({ mass: type === 'bus' ? 2500 : 1250, material: matObj, position: CV(x, 1.4, z), angularDamping: .45 });
  body.addShape(new CANNON.Box(CV(dims.w / 2, dims.h / 2, dims.l / 2)), CV(0, .25, 0));
  body.allowSleep = false; body.quaternion.setFromEuler(0, yaw, 0);
  const vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  const wo = { radius: .42, directionLocal: CV(0, -1, 0), suspensionStiffness: 38, suspensionRestLength: .55, frictionSlip: 4.2, dampingRelaxation: 2.4, dampingCompression: 4.5, maxSuspensionForce: 1e5, rollInfluence: .04, axleLocal: CV(1, 0, 0), maxSuspensionTravel: .4, customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true };
  const wx = dims.w / 2 + .06, wz = dims.l / 2 - .9;
  [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]].forEach(([px, pz], i) => vehicle.addWheel({ ...wo, isFrontWheel: i < 2, chassisConnectionPointLocal: CV(px, -.1, pz) }));
  vehicle.addToWorld(world);
  const wheels = []; for (let i = 0; i < 4; i++) { const w = buildWheel(); wheelRoot.add(w); wheels.push(w); }
  const v = { kind: 'car', type, g: wrap, wheelRoot, chassisG, lightbar, exterior, interior, body, vehicle, wheels, health: 100, fuel: 100, active: true, driver: null, steer: 0, smoke: 0, puffT: 0, ai, maxForce: type === 'bus' ? 11000 : 8500, brake: 180, wreckT: 0 };
  body.addEventListener('collide', e => { const imp = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (imp > 7) { sfx.crash(imp); damageVehicle(v, imp * 2); if (v.driver) damagePlayer(imp * 1.4); } });
  vehicles.push(v); return v;
}
// Main battle tank: heavy RaycastVehicle with a turret. Driven by the AI or by the player.
function buildTank() {
  const g = new THREE.Group(), s = new Sketch();
  const hull = smoothProfile([[-3.1, .25], [-3.1, .9], [-1.2, 1.2], [2.2, 1.2], [3.1, .8], [3.1, .25]], 2.8, 0, .05);
  g.add(hull);
  s.box(-1.55, .25, 0, .6, .75, 6.4, 1); s.box(1.55, .25, 0, .6, .75, 6.4, 1);            // tracks
  for (let i = -2; i <= 2; i++) { s.line([-1.85, .3, i * 1.2], [-1.85, .85, i * 1.2], 2); s.line([1.85, .3, i * 1.2], [1.85, .85, i * 1.2], 2); }
  s.box(0, 1.2, 2.6, 2.4, .25, .6, 0);                                                    // front plate
  s.box(0, 1.2, -2.8, 2.2, .2, .5, 4);                                                    // engine deck
  const exterior = new THREE.Group(); exterior.add(s.finish()); exterior.add(g);
  const tur = new Sketch();
  tur.cyl(0, 0, 0, 1.0, .95, .55, 14, 0, 'y'); tur.box(0, 0, -.2, 1.6, .5, 2.0, 0);
  tur.cyl(0, .25, .2, .12, .12, 3.2, 8, 1, 'z');                                           // barrel
  tur.box(0, .2, -.9, .3, .3, .3, 1);
  const turGroup = tur.finish(true); turGroup.position.set(0, 1.2, -.3);
  const turret = new THREE.Group(); turret.add(turGroup);
  const chassisG = new THREE.Group(); chassisG.add(exterior); chassisG.add(turret);
  chassisG.position.y = -1.2;
  const wrap = new THREE.Group(); wrap.add(chassisG); scene.add(wrap);
  return { wrap, chassisG, exterior, turret };
}
function createTank(x, z, yaw = 0, ai = 'military') {
  const { wrap, chassisG, exterior, turret } = buildTank();
  const wheelRoot = new THREE.Group(); scene.add(wheelRoot);
  const body = new CANNON.Body({ mass: 9000, material: matObj, position: CV(x, 1.4, z), angularDamping: .6 });
  body.addShape(new CANNON.Box(CV(1.5, .8, 3.2)), CV(0, 0, 0));
  body.allowSleep = false; body.quaternion.setFromEuler(0, yaw, 0);
  const vehicle = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  const wo = { radius: .5, directionLocal: CV(0, -1, 0), suspensionStiffness: 260, suspensionRestLength: .6, frictionSlip: 3.5, dampingRelaxation: 2.3, dampingCompression: 4.4, maxSuspensionForce: 2e5, rollInfluence: .02, axleLocal: CV(1, 0, 0), maxSuspensionTravel: .4, customSlidingRotationalSpeed: -30, useCustomSlidingRotationalSpeed: true };
  [[-1.45, 2.3], [1.45, 2.3], [-1.45, -2.3], [1.45, -2.3]].forEach(([px, pz], i) => vehicle.addWheel({ ...wo, isFrontWheel: i < 2, chassisConnectionPointLocal: CV(px, -.1, pz) }));
  vehicle.addToWorld(world);
  const wheels = []; for (let i = 0; i < 4; i++) { const w = buildWheel(.5, .5); wheelRoot.add(w); wheels.push(w); }
  const v = { kind: 'tank', type: 'tank', g: wrap, wheelRoot, chassisG, lightbar: null, exterior, interior: null, turret, body, vehicle, wheels, health: 340, fuel: 100, active: true, driver: null, steer: 0, smoke: 0, puffT: 0, ai, maxForce: 9000, brake: 400, armor: .35, fireCd: rand(1, 3), gunCd: 0, wreckT: 0 };
  body.addEventListener('collide', e => { const imp = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (imp > 9) { sfx.crash(imp); damageVehicle(v, imp * 1.2); } });
  vehicles.push(v); return v;
}
function carForces(v, dt) {
  const c = v.controls || {}, maxSteer = v.kind === 'tank' ? .4 : .5, maxForce = v.maxForce || 8500, brakeForce = v.brake || 180;
  v.steer = clamp(v.steer + ((c.left ? 1 : 0) - (c.right ? 1 : 0)) * dt * 2.6, -maxSteer, maxSteer);
  if (!c.left && !c.right) v.steer *= Math.pow(.05, dt);
  v.vehicle.setSteeringValue(v.steer, 0); v.vehicle.setSteeringValue(v.steer, 1);
  let engine = 0, brake = 0;
  if (c.forward) engine = -maxForce;
  if (c.back) { if (v.body.velocity.length() > 2) brake = brakeForce; else engine = maxForce * .6; }
  if (c.handbrake) brake = brakeForce * 2;
  for (let i = 0; i < 4; i++) { v.vehicle.applyEngineForce(engine, i); v.vehicle.setBrake(brake, i); }
}
function carSync(v) {
  v.g.position.copy(v.body.position); v.g.quaternion.copy(v.body.quaternion);
  for (let i = 0; i < 4; i++) { v.vehicle.updateWheelTransform(i); const t = v.vehicle.wheelInfos[i].worldTransform; v.wheels[i].position.copy(t.position); v.wheels[i].quaternion.copy(t.quaternion); }
  if (v.type === 'police' && v.lightbar) { const on = Math.floor(performance.now() * .004) % 2 === 0; v.lightbar.children[0].visible = on; v.lightbar.children[1].visible = !on; }
}
function buildHeli() {
  const g = new THREE.Group(), s = new Sketch();
  s.cyl(0, -.1, -1.9, .95, .72, 3.4, 18, 0, 'z');
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.72, 14, 12), FM[0]); nose.position.set(0, -.1, 1.5); nose.scale.set(1, .9, .8); nose.castShadow = true; g.add(nose);
  s.box(0, -.62, .1, 1.3, .35, 2.2, 1);
  s.box(0, .15, -2.2, .34, .34, 3, 0); s.box(0, .5, -3.7, .12, 1, .7, 0); s.box(0, .1, -3.7, .5, .08, .6, 1);
  for (const sx of[-.7, .7]) { s.cyl(sx, -.95, -.2, .06, .06, 2.4, 6, 1, 'z'); s.line([sx, -.95, .4], [sx, -.4, .4], 1); s.line([sx, -.95, -.8], [sx, -.4, -.8], 1); }
  s.face([[-.55, .5, 1.2], [.55, .5, 1.2], [.45, 1, 1], [-.45, 1, 1]], 3);
  s.box(0, .95, -.3, .8, .4, 1.2, 1);
  const rotor = new Sketch(); rotor.box(0, 0, 0, 6.4, .06, .22, 1); rotor.box(0, 0, 0, .22, .06, 6.4, 1); rotor.cyl(0, -.1, 0, .12, .12, .3, 8, 1, 'y');
  const tailRotor = new Sketch(); tailRotor.box(0, 0, 0, .06, 1.4, .12, 1); tailRotor.box(0, 0, 0, .06, .12, 1.4, 1);
  const exterior = s.finish(); exterior.add(nose); g.add(exterior); const r = rotor.finish(false); r.position.set(0, 1.3, 0); g.add(r); const tr = tailRotor.finish(false); tr.position.set(.2, .5, -3.9); g.add(tr);
  const cock = new Sketch(); cock.box(0, .25, 1.1, 1, .12, .45, 1); cock.box(-.32, .45, 1.1, .08, .35, .08, 0); cock.box(.32, .45, 1.1, .08, .35, .08, 0);
  cock.circle(0, .5, 1.25, .14, 0, 'xy', 12); cock.box(0, .3, .6, .5, .1, .6, 2);
  for (let i = -1; i <= 1; i++) cock.circle(i * .28, .34, 1.32, .07, 1, 'xy', 10);
  const cg = cock.finish(false); cg.visible = false; g.add(cg);
  return { g, r, tr, cg, exterior };
}
function createHeli(x, z, yaw = 0, ai = null) {
  const { g, r, tr, cg, exterior } = buildHeli(); scene.add(g);
  const body = new CANNON.Body({ mass: 1500, material: matObj, shape: new CANNON.Box(CV(1, 1, 2.5)), position: CV(x, 1.5, z), linearDamping: .2, angularDamping: .6 });
  body.allowSleep = false; body.quaternion.setFromEuler(0, yaw, 0); world.addBody(body);
  const v = { kind: 'heli', g, body, rotor: r, tailRotor: tr, cockpit: cg, exterior, health: 100, fuel: 100, active: true, driver: null, collective: 0, smoke: 0, gunCd: 0, puffT: 0, ai, wreckT: 0 };
  body.addEventListener('collide', e => { const imp = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (imp > 6) { damageVehicle(v, imp * 3); if (v.driver) damagePlayer(imp * 2); } });
  vehicles.push(v); return v;
}
function heliForces(v, dt) {
  const c = v.controls || {}; v.collective = clamp(v.collective + ((c.up ? 1 : 0) - (c.down ? 1 : 0)) * dt * 1.6, 0, 1);
  const up = v.body.quaternion.vmult(CV(0, 1, 0));
  v.body.applyForce(up.scale(v.collective * 1500 * 9.82 * 2.6), CV());
  const torque = CV((c.forward ? 1 : 0) - (c.back ? 1 : 0), (c.yawL ? 1 : 0) - (c.yawR ? 1 : 0), (c.left ? 1 : 0) - (c.right ? 1 : 0)).scale(4000);
  v.body.torque.vadd(v.body.vectorToWorldFrame(torque), v.body.torque);
}
function heliSync(v, dt) { v.g.position.copy(v.body.position); v.g.quaternion.copy(v.body.quaternion); v.rotor.rotation.y += dt * (10 + v.collective * 30); v.tailRotor.rotation.x += dt * (20 + v.collective * 40); }
function buildPlane() {
  const g = new THREE.Group(), s = new Sketch();
  s.cyl(0, 0, -2.5, .5, .32, 5, 14, 0, 'z');
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 10), FM[0]); nose.position.set(0, 0, 2.5); nose.scale.set(1, 1, 1.4); g.add(nose);
  s.box(0, .1, 0, 7.4, .08, 1.3, 0); s.box(0, .3, -2.2, 2.6, .06, .6, 0); s.box(0, .8, -2.4, .08, 1, .5, 0);
  s.face([[-.3, .4, 1.5], [.3, .4, 1.5], [.2, .8, 1.2], [-.2, .8, 1.2]], 3);
  s.cyl(0, -.6, 1, .07, .07, .6, 8, 1, 'y'); s.cyl(0, -.6, -1, .07, .07, .6, 8, 1, 'y');
  const prop = new Sketch(); prop.box(0, 0, 0, .06, 2.2, .06, 1); prop.box(0, 0, 0, 2.2, .06, .06, 1);
  const exterior = new THREE.Group(); exterior.add(nose); exterior.add(s.finish()); g.add(exterior);
  const p = prop.finish(false); p.position.set(0, 0, 3.05); g.add(p);
  const cock = new Sketch(); cock.box(0, .32, 1.3, .75, .1, .45, 1); cock.circle(0, .5, 1.45, .13, 0, 'xy', 12);
  for (let i = -1; i <= 1; i++) cock.circle(i * .22, .38, 1.52, .06, 1, 'xy', 10);
  cock.box(-.38, .35, 1.1, .08, .5, .9, 1); cock.box(.38, .35, 1.1, .08, .5, .9, 1);
  cock.line([-.38, .85, 1.5], [.38, .85, 1.5], 0); cock.line([-.38, .35, 1.5], [.38, .35, 1.5], 1);
  const cg = cock.finish(false); cg.visible = false; g.add(cg);
  return { g, p, cg, exterior };
}
function createPlane(x, z, yaw = 0) {
  const { g, p, cg, exterior } = buildPlane(); scene.add(g);
  const body = new CANNON.Body({ mass: 2000, material: matGear, shape: new CANNON.Box(CV(3.5, .5, 2.5)), position: CV(x, .9, z), linearDamping: .05, angularDamping: .6 });
  body.allowSleep = false; body.quaternion.setFromEuler(0, yaw, 0); world.addBody(body);
  const v = { kind: 'plane', g, body, prop: p, cockpit: cg, exterior, health: 100, fuel: 100, active: true, driver: null, throttle: 0, smoke: 0, gunCd: 0, puffT: 0, wreckT: 0 };
  body.addEventListener('collide', e => { const imp = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (imp > 6) { damageVehicle(v, imp * 3); if (v.driver) damagePlayer(imp * 2); } });
  vehicles.push(v); return v;
}
function planeForces(v, dt) {
  const c = v.controls || {}; v.throttle = clamp(v.throttle + ((c.throttleUp ? 1 : 0) - (c.throttleDown ? 1 : 0)) * dt * .7, 0, 1);
  const fwd = v.body.quaternion.vmult(CV(0, 0, 1)), up = v.body.quaternion.vmult(CV(0, 1, 0));
  const speed = v.body.velocity.dot(fwd);
  v.body.applyForce(fwd.scale(v.throttle * 40000), CV());
  v.body.applyForce(up.scale(Math.max(0, speed) ** 2 * 35), CV());
  v.body.applyForce(v.body.velocity.scale(-.6), CV());
  const q = clamp(Math.abs(speed) / 20, .2, 1);
  const grounded = v.body.position.y < 1.3;
  const steer = (c.left ? 1 : 0) - (c.right ? 1 : 0);
  const torque = CV((c.forward ? 1 : 0) - (c.back ? 1 : 0), ((c.yawL ? 1 : 0) - (c.yawR ? 1 : 0)) + (grounded ? steer : 0), grounded ? 0 : steer).scale(6000 * q);
  v.body.torque.vadd(v.body.vectorToWorldFrame(torque), v.body.torque);
}
function planeSync(v, dt) { v.g.position.copy(v.body.position); v.g.quaternion.copy(v.body.quaternion); v.prop.rotation.z += dt * (5 + v.throttle * 40); }
function buildBoat() {
  const g = new THREE.Group(), s = new Sketch();
  const hull = [[-.9, 0, -2], [.9, 0, -2], [1, 0, .5], [.6, .0, 2.2], [-.6, 0, 2.2], [-1, 0, .5]];
  s.face(hull, 0); s.path(hull, 0, true);
  for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; s.face([a, b, [b[0] * .7, -.5, b[2] * .8], [a[0] * .7, -.5, a[2] * .8]], 1); }
  s.box(0, .1, -.5, 1.2, .6, 1.5, 1); s.cyl(0, .1, 1.4, .05, .05, 1.4, 6, 1, 'y');
  g.add(s.finish()); return g;
}
function createBoat(x, z, yaw = 0) {
  const g = buildBoat(); scene.add(g);
  const body = new CANNON.Body({ mass: 800, material: matObj, shape: new CANNON.Box(CV(.9, .4, 2.1)), position: CV(x, -2, z), linearDamping: .2, angularDamping: .7 });
  body.allowSleep = false; body.quaternion.setFromEuler(0, yaw, 0); world.addBody(body);
  const v = { kind: 'boat', g, body, health: 100, fuel: 100, active: true, driver: null, smoke: 0, puffT: 0, wreckT: 0 };
  vehicles.push(v); return v;
}
function boatForces(v, dt) {
  const c = v.controls || {}, fwd = v.body.quaternion.vmult(CV(0, 0, 1));
  if (c.forward) v.body.applyForce(fwd.scale(3400), CV());
  if (c.back) v.body.applyForce(fwd.scale(-1600), CV());
  v.body.torque.y += ((c.left ? 1 : 0) - (c.right ? 1 : 0)) * 900;
  const wh = W.waterHeight(v.body.position.x, v.body.position.z, performance.now() * .001);
  const sub = (wh + .9) - v.body.position.y;
  if (sub > 0) v.body.applyForce(CV(0, clamp(sub, 0, 1.5) * 800 * 9.82 * 1.5, 0), CV());
  v.body.applyForce(v.body.velocity.scale(-180), CV());
  v.body.torque.x += -v.body.quaternion.x * 300; v.body.torque.z += -v.body.quaternion.z * 300;
}
function boatSync(v) { v.g.position.copy(v.body.position); v.g.quaternion.copy(v.body.quaternion); }

// spawn vehicles
createCar('sedan', 0, -80, 0); createCar('sport', 44, -120, Math.PI / 2); createCar('suv', -44, -160, 0); createCar('truck', 88, -200, 0); createCar('bus', -88, -240, Math.PI / 2); createCar('sedan', 132, -280, 0); createCar('sport', -132, -320, Math.PI / 2); createCar('sedan', 20, -30, Math.PI / 2); createCar('van', -30, -50, 0);
createHeli(400, -440, 0); createHeli(-420, -460, Math.PI / 2);
createPlane(420, -470, 0); createPlane(-430, -470, Math.PI / 2);
createBoat(-200, 40, 0); createBoat(260, 50, Math.PI); createBoat(0, 60, 0);

// vehicle damage: a destroyed vehicle explodes (queued, never inside the physics step)
function damageVehicle(v, amt) {
  if (!v.active) return;
  v.health -= amt * (v.armor || 1); v.smoke = Math.min(1, v.smoke + amt * .02);
  if (v.health <= 0) {
    v.health = 0; v.active = false;
    boom(v.g.position.clone().add(V3(0, 1, 0)), v.kind === 'tank' ? 34 : (v.kind === 'heli' || v.kind === 'plane') ? 30 : 22, { owner: v.driver ? 'player' : null });
    if (v.driver) { damagePlayer(45); exitVehicle(true); }
  }
}
function removeVehicle(v) {
  scene.remove(v.g); disposeGroup(v.g);
  if (v.wheelRoot) { scene.remove(v.wheelRoot); disposeGroup(v.wheelRoot); }
  if (v.vehicle) { try { v.vehicle.removeFromWorld(world); } catch (_) { } }
  world.removeBody(v.body);
  const i = vehicles.indexOf(v); if (i >= 0) vehicles.splice(i, 1);
}

// ---------------- fortified military bases ----------------
const bases = [];
function chainFence(s, x0, z0, x1, z1, h = 2.6) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; s.line([x, 0, z], [x, h, z], 0); }
  for (let y = .4; y < h; y += .4) s.line([x0, y, z0], [x1, y, z1], 2);
  s.line([x0, h, z0], [x1, h, z1], 0);
  for (let i = 0; i < n; i++) { const t = (i + .5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; s.line([x - .15, h + .1, z], [x + .15, h + .3, z], 1); s.line([x + .15, h + .1, z], [x - .15, h + .3, z], 1); }
}
function guardTower(s, x, z) {
  for (let sx of[-1, 1]) for (let sz of[-1, 1]) s.line([x + sx * 1.2, 0, z + sz * 1.2], [x + sx * 1.2, 6, z + sz * 1.2], 0);
  s.box(x, 6, z, 3.4, .2, 3.4, 1); s.box(x, 6.2, z, 3.2, 1.6, 3.2, 0);
  s.face([[x - 1.7, 7.8, z - 1.7], [x + 1.7, 7.8, z - 1.7], [x, 8.8, z]], 1);
  s.box(x, 7.9, z, 3.6, .15, 3.6, 1);
  for (let sx of[-1, 1]) s.line([x + sx * 1.2, 6.2, z - 1.6], [x + sx * 1.2, 7.6, z - 1.6], 2);
  s.circle(x, 8.2, z + 1.7, .25, 3, 'xy', 10);
}
function fuelTankMesh(x, z) {
  const s = new Sketch(); s.cyl(0, 0, 0, 3, 3, 5, 14, 1, 'y'); s.circle(0, 5, 0, 3, 0, 'xz', 14); s.cyl(0, 2, 0, 3.02, 3.02, .2, 14, 4, 'y');
  const g = s.finish(); g.position.set(x, 0, z); scene.add(g); return g;
}
function buildBase(x, z, rot = 0) {
  const g = new THREE.Group(), s = new Sketch();
  const Wd = 120, Dp = 170;
  chainFence(s, -Wd / 2, -Dp / 2, Wd / 2, -Dp / 2);
  chainFence(s, -Wd / 2, Dp / 2, -12, Dp / 2); chainFence(s, 12, Dp / 2, Wd / 2, Dp / 2);
  chainFence(s, -Wd / 2, -Dp / 2, -Wd / 2, Dp / 2); chainFence(s, Wd / 2, -Dp / 2, Wd / 2, Dp / 2);
  s.box(-14, 0, Dp / 2 - 2, 4, 3, 3, 1); s.box(14, 0, Dp / 2 - 2, 4, 3, 3, 1);
  s.line([-12, 1.2, Dp / 2], [12, 1.2, Dp / 2], 3);
  for (let i = -12; i < 12; i += 2) s.line([i, 1.2, Dp / 2], [i + 1, 1.2, Dp / 2], 0);
  guardTower(s, -Wd / 2 + 4, -Dp / 2 + 4); guardTower(s, Wd / 2 - 4, -Dp / 2 + 4); guardTower(s, -Wd / 2 + 4, Dp / 2 - 4); guardTower(s, Wd / 2 - 4, Dp / 2 - 4);
  // runway
  s.face([[-11, .02, -75], [11, .02, -75], [11, .02, 60], [-11, .02, 60]], 1);
  for (let zz = -70; zz < 55; zz += 6) s.line([0, .03, zz], [0, .03, zz + 3], 0);
  for (let xx = -9; xx < 9; xx += 2) { s.line([xx, .03, -73], [xx, .03, -70], 0); s.line([xx, .03, 57], [xx, .03, 60], 0); }
  for (let zz = -70; zz < 55; zz += 10) { s.circle(-11, .05, zz, .15, 3, 'xz', 8); s.circle(11, .05, zz, .15, 3, 'xz', 8); }
  // hangars (Quonset curved roofs)
  for (let hx of[30, -38]) for (let hz of[-30, 15]) {
    s.box(hx, 0, hz, 18, 4, 22, 1);
    for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; const px = hx - 9 + 18 * (i / 10); const y0 = 4 + Math.sin(a) * 4;
      if (i < 10) { const px2 = hx - 9 + 18 * ((i + 1) / 10); const y2 = 4 + Math.sin((i + 1) / 10 * Math.PI) * 4; s.face([[px, y0, hz - 11], [px2, y2, hz - 11], [px2, y2, hz + 11], [px, y0, hz + 11]], 2); }
      s.line([px, y0, hz - 11], [px, y0, hz + 11], 1); }
    s.box(hx, 0, hz + 11.1, 8, 3.5, .2, 0);
  }
  s.box(-30, 0, -55, 6, 14, 6, 0); s.box(-30, 14, -55, 8, 3, 8, 3); s.line([-30, 17, -55], [-30, 20, -55], 0); // control tower
  s.cyl(40, 0, -55, .4, .4, 6, 8, 1, 'y'); s.face([[38, 6, -55], [42, 6, -55], [41, 8.5, -55], [39, 8.5, -55]], 0); // radar
  s.cyl(-30, .03, 40, 8, 8, .06, 24, 1, 'y'); s.line([-33, .06, 37], [-33, .06, 43], 0); s.line([-27, .06, 37], [-27, .06, 43], 0); s.line([-33, .06, 40], [-27, .06, 40], 0); // helipad
  s.box(-38, 0, -5, 14, 3.5, 24, 1); s.box(38, 0, -52, 14, 3.5, 18, 1); // barracks
  for (let i = 0; i < 6; i++) s.box(20 + i * 4, 0, 55, 2.5, 1.4, 4, 1);
  for (let i = 0; i < 8; i++) s.box(-20 + i * 3, 0, Dp / 2 - 6, 2, .8, 1, 2);
  s.box(0, 3, Dp / 2 + 1, 10, 2, .3, 0);
  g.add(s.finish()); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  const c = Math.cos(rot), sn = Math.sin(rot), off = (ox, oz) => [x + ox * c + oz * sn, z - ox * sn + oz * c];
  const ac = Math.abs(c), as = Math.abs(sn);
  const worldHalf = (hx, hz) => [ac * hx + as * hz, as * hx + ac * hz];
  [[30, -30, 9, 11], [-38, -30, 9, 11], [30, 15, 9, 11], [-38, 15, 9, 11], [-30, -55, 3, 3], [-38, -5, 7, 12], [38, -52, 7, 9]].forEach(([ox, oz, hx, hz]) => { const p = off(ox, oz); const wh = worldHalf(hx, hz); staticBox(p[0], 3, p[1], wh[0], 3, wh[1]); W.obstacles.push({ x: p[0], z: p[1], w: wh[0] * 2, d: wh[1] * 2 }); });
  const fenceSeg = (x0, z0, x1, z1) => { const p0 = off(x0, z0), p1 = off(x1, z1); const cx2 = (p0[0] + p1[0]) / 2, cz2 = (p0[1] + p1[1]) / 2; const dx = Math.abs(p1[0] - p0[0]), dz = Math.abs(p1[1] - p0[1]); staticBox(cx2, 1.1, cz2, Math.max(dx / 2, .12), 1.1, Math.max(dz / 2, .12)); W.obstacles.push({ x: cx2, z: cz2, w: Math.max(dx, .24), d: Math.max(dz, .24) }); };
  fenceSeg(-Wd / 2, -Dp / 2, Wd / 2, -Dp / 2);
  fenceSeg(-Wd / 2, Dp / 2, -12, Dp / 2); fenceSeg(12, Dp / 2, Wd / 2, Dp / 2);
  fenceSeg(-Wd / 2, -Dp / 2, -Wd / 2, Dp / 2); fenceSeg(Wd / 2, -Dp / 2, Wd / 2, Dp / 2);
  for (const tx of[-Wd / 2 + 4, Wd / 2 - 4]) for (const tz of[-Dp / 2 + 4, Dp / 2 - 4]) { const p = off(tx, tz); staticBox(p[0], 3, p[1], 1.7, 3, 1.7); W.obstacles.push({ x: p[0], z: p[1], w: 3.4, d: 3.4 }); }
  // fuel depot: three separately destructible tanks
  for (let i = 0; i < 3; i++) {
    const p = off(40 + i * 7, 40);
    fuels.push({ x: p[0], z: p[1], hp: 100, dead: false, g: fuelTankMesh(p[0], p[1]), owner: null });
    staticBox(p[0], 2.5, p[1], 3, 2.5, 3); W.obstacles.push({ x: p[0], z: p[1], w: 6, d: 6 });
  }
  // guards patrol
  const per = [off(-Wd / 2 + 6, -Dp / 2 + 6), off(Wd / 2 - 6, -Dp / 2 + 6), off(Wd / 2 - 6, Dp / 2 - 6), off(-Wd / 2 + 6, Dp / 2 - 6)];
  const patrol = per.map(p => ({ x: p[0], z: p[1] }));
  for (let i = 0; i < 4; i++) { const gp = patrol[i]; const n = makeNPC(gp.x, gp.z, 'guard'); n.patrol = patrol; n.patrolI = i; }
  for (let i = 0; i < 2; i++) { const n = makeNPC(x + (i ? 8 : -8), z + Dp / 2 - 8, 'guard'); n.patrol = [{ x: x - 8, z: z + Dp / 2 - 8 }, { x: x + 8, z: z + Dp / 2 - 8 }]; }
  // HQ door (interaction point for the amber spyglass) and two parked tanks (wake up on alarm)
  const hq = off(-38, 10); bases.push({ g, x, z, rot, hq: { x: hq[0], z: hq[1] } });
  const t1 = off(20, 60), t2 = off(-50, 60);
  createTank(t1[0], t1[1], rot, 'military'); createTank(t2[0], t2[1], rot, 'military');
  return g;
}
buildBase(420, -460, 0); buildBase(-430, -460, Math.PI / 2);
W.invalidateObstacles();   // base colliders were added after the walk cache was built
buildNav();

// Lighthouse, quay and story anchors
const LIGHT = { x: 47, z: 35 };
const QUAY = { x: 30, z: 3 };
// amber spyglass on the HQ door step (visible from chapter 2)
const spyglassGroup = new THREE.Group();
{
  const s = new Sketch(); s.cyl(0, 0, 0, .09, .09, 1.0, 10, 5, 'y'); s.cyl(0, 1.0, 0, .12, .12, .3, 10, 1, 'y'); s.circle(0, 1.3, 0, .12, 3, 'xz', 12);
  spyglassGroup.add(s.finish());
  const glow = new THREE.Mesh(new THREE.SphereGeometry(.45, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe0a040, transparent: true, opacity: .25, depthWrite: false }));
  glow.position.y = .8; spyglassGroup.add(glow); spyglassGroup.userData.glow = glow;
  const p = bases[0].hq; spyglassGroup.position.set(p.x, 0, p.z); spyglassGroup.visible = false; scene.add(spyglassGroup);
}
// Ris: the lynx-soul that follows Vida. Drawn in terracotta, bobs along.
const ris = (() => {
  const s = new Sketch();
  s.box(0, .32, 0, .36, .3, .8, 5);
  s.box(0, .48, .42, .26, .26, .28, 5);
  s.path([[-.1, .62, .48], [-.12, .9, .46], [-.02, .66, .5]], 0); s.path([[.1, .62, .48], [.12, .9, .46], [.02, .66, .5]], 0);
  s.face([[-.1, .62, .48], [-.12, .9, .46], [-.02, .66, .5]], 5); s.face([[.1, .62, .48], [.12, .9, .46], [.02, .66, .5]], 5);
  for (const sx of [-.12, .12]) for (const sz of [-.28, .28]) s.box(sx, 0, sz, .08, .34, .08, 0);
  s.path([[0, .4, -.4], [.12, .6, -.62], [.26, .75, -.7]], 0);
  const g = s.finish(); g.scale.setScalar(1.1); scene.add(g); return { g, pos: V3(-6, 0, 3), yaw: Math.PI, phase: 0 };
})();

// ---------------- player ----------------
const player = { health: 100, dead: false, respawn: 0, vy: 0, grounded: true, held: null, vehicle: null, armed: false, ammo: 30, reload: 0, lastSafe: V3(-6, EYE, 3.8), cockpit: false, grenades: 3, lastHit: 99, hasGlass: false };
const checkpoint = { x: -6, z: 3.8, yaw: Math.PI };
const hintEl = document.getElementById('hint'), damageEl = document.getElementById('damage'), deathEl = document.getElementById('death');
const objEl = document.getElementById('objective'), wpEl = document.getElementById('waypoint'), dialogEl = document.getElementById('dialog'), cardEl = document.getElementById('card');
let hintTimer = 0, damageFlash = 0;
function showHint(t, dur = 2) { hintEl.textContent = t; hintEl.classList.add('show'); hintTimer = dur; }
function damagePlayer(amt) {
  if (player.dead || amt <= 0) return;
  player.health -= amt; player.lastHit = 0; damageFlash = Math.min(1, damageFlash + amt * .03);
  if (player.health <= 0) { player.health = 0; killPlayer(); }
}
function killPlayer() {
  player.dead = true; player.respawn = 2.6; deathEl.classList.add('show');
  if (player.vehicle) exitVehicle(true);
  W.control.enabled = false; player.held = null;
  for (const v of vehicles) if (v.g.position.distanceTo(W.walkPosition) < 8 && v.body) { v.body.velocity.scale(.1, v.body.velocity); v.body.angularVelocity.scale(.1, v.body.angularVelocity); }
}
function respawnPlayer() {
  player.dead = false; player.health = 100; deathEl.classList.remove('show'); W.control.enabled = true;
  W.teleport(checkpoint.x, checkpoint.z); W.walkPosition.set(checkpoint.x, EYE, checkpoint.z);
  W.walkYaw = checkpoint.yaw; W.walkPitch = 0; player.vy = 0; player.grounded = true; wanted = 0; hudWanted();
  player.grenades = 3; player.lastSafe.copy(W.walkPosition);
}

// HUD
const hud = document.createElement('div'); hud.id = 'hud';
hud.innerHTML = `<div id="hud-health"><i></i></div><div id="hud-wanted"></div><div id="hud-ammo"></div><div id="crosshair">+</div>`;
document.body.appendChild(hud);
function hudWanted() { document.getElementById('hud-wanted').textContent = wanted > 0 ? '★'.repeat(wanted) + '☆'.repeat(5 - wanted) : ''; }
function hudUpdate() {
  document.querySelector('#hud-health i').style.width = player.health + '%';
  const weapon = player.vehicle ? (player.vehicle.kind === 'tank' ? 'tank: klik = top' : player.vehicle.kind === 'heli' || player.vehicle.kind === 'plane' ? 'klik = strel' : '')
    : player.armed ? (player.reload > 0 ? '…' : player.ammo + ' / 30') : '';
  document.getElementById('hud-ammo').textContent = (weapon ? weapon + '   ' : '') + (player.vehicle ? '' : 'granate ' + player.grenades + ' (G)');
  hud.classList.toggle('armed', player.armed && !player.vehicle);
}
hudWanted();

// weapon viewmodel
const gun = new Sketch(); gun.box(0, 0, 0, .06, .08, .5, 1); gun.box(0, -.06, -.1, .05, .12, .14, 1); gun.box(0, .05, .1, .04, .05, .2, 0);
const gunG = gun.finish(false); gunG.visible = false; camera.add(gunG); gunG.position.set(.28, -.24, -.5); scene.add(camera);

// ---------------- dialogue, story, waypoints ----------------
const dlg = { queue: [], cur: null, typed: 0, t: 0, busy: false };
function say(lines, onDone) {
  for (const l of lines) dlg.queue.push({ who: l.who, text: l.text });
  if (onDone) dlg.queue.push({ onDone });
  if (!dlg.cur && !dlg.busy) nextLine();
}
function nextLine() {
  dlg.busy = true; dlg.cur = null;
  while (dlg.queue.length) {
    const it = dlg.queue.shift();
    if (it.onDone) { it.onDone(); continue; }
    dlg.cur = it; dlg.typed = 0; dlg.t = it.text.length * .07 + 3;
    dialogEl.hidden = false; dialogEl.querySelector('.who').textContent = it.who; dialogEl.querySelector('.txt').textContent = '';
    dlg.busy = false; return;
  }
  dlg.busy = false; dialogEl.hidden = true;
}
function advanceDialog() {
  if (!dlg.cur) return;
  if (dlg.typed < dlg.cur.text.length) dlg.typed = dlg.cur.text.length; else nextLine();
}
function updateDialog(dt) {
  if (!dlg.cur) return;
  dlg.typed = Math.min(dlg.cur.text.length, dlg.typed + dt * 60);
  dialogEl.querySelector('.txt').textContent = dlg.cur.text.slice(0, Math.floor(dlg.typed));
  dlg.t -= dt; if (dlg.t <= 0) nextLine();
}
function card(title, sub = '', dur = 4.5) {
  cardEl.querySelector('h3').textContent = title; cardEl.querySelector('p').textContent = sub;
  cardEl.classList.add('show'); cardT = dur;
}
let cardT = 0;
let chIdx = -1, storyBusy = false, waveT = 0, rift = null, fuelDestroyed = 0, armyTankT = 4, squadT = 6, artT = 6;
function setChapter(i) {
  chIdx = i; const c = CHAPTERS[i];
  objEl.querySelector('b').textContent = c.title; objEl.querySelector('span').textContent = c.goal;
  objEl.classList.add('show');
  if (i > 0) card(c.title, c.goal, 4.5);
}
function damageFuel(f, dmg, owner, delay = 0) {
  if (f.dead) return;
  f.hp -= dmg; if (f.hp > 0) return;
  f.dead = true; f.g.visible = false; if (chIdx === 1) fuelDestroyed++;
  if (!alarm) alarm = 120;
  const pos = V3(f.x, 2, f.z);
  if (delay > 0) later(delay, () => boom(pos, 40, { owner: null })); else boom(pos, 40, { owner: null });
}
// Rift: a torn line of light in the sky above the lighthouse (visible during chapter IV).
function buildRift() {
  const s = new Sketch(); const grp = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0xb86448, transparent: true, opacity: .9, fog: false, depthWrite: false });
  const mat2 = new THREE.LineBasicMaterial({ color: 0x30332d, transparent: true, opacity: .5, fog: false, depthWrite: false });
  for (let k = 0; k < 7; k++) {
    const pts = []; let x = (k - 3) * 1.6;
    for (let y = 20; y <= 110; y += 3) { x += rand(-1.4, 1.4); pts.push(new THREE.Vector3(x, y, 0)); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    grp.add(new THREE.Line(geo, k % 2 ? mat : mat2));
  }
  grp.position.set(LIGHT.x, 0, -150); scene.add(grp);
  return { grp, mats: [mat, mat2] };
}
function removeRift() { if (!rift) return; scene.remove(rift.grp); rift.grp.children.forEach(c => c.geometry.dispose()); rift.mats.forEach(m => m.dispose()); rift = null; }
function currentWaypoint() {
  if (chIdx === 0) return { x: mihec.body.position.x, z: mihec.body.position.z, label: 'Mihec' };
  if (chIdx === 1) { const live = fuels.filter(f => !f.dead); if (!live.length) return null; let best = live[0], bd = Infinity; for (const f of live) { const d = W.walkPosition.distanceTo(V3(f.x, 0, f.z)); if (d < bd) { bd = d; best = f; } } return { x: best.x, z: best.z, label: 'Rezervoar' }; }
  if (chIdx === 2 && !player.hasGlass) return { x: bases[0].hq.x, z: bases[0].hq.z, label: 'Poveljstvo' };
  if (chIdx === 3 || chIdx === 4) return { x: LIGHT.x, z: LIGHT.z, label: 'Svetilnik' };
  return null;
}
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function updateWaypointHUD() {
  const wp = currentWaypoint();
  if (!wp) { wpEl.classList.remove('show'); return; }
  const dx = wp.x - W.walkPosition.x, dz = wp.z - W.walkPosition.z, d = Math.hypot(dx, dz);
  const rel = angNorm(Math.atan2(dx, dz) - W.walkYaw);
  const idx = ((Math.round(-rel / (Math.PI / 4)) % 8) + 8) % 8;
  wpEl.textContent = `${ARROWS[idx]} ${wp.label} · ${Math.round(d)} m`;
  wpEl.classList.add('show');
}
function updateStory(dt) {
  if (cardT > 0) { cardT -= dt; if (cardT <= 0) cardEl.classList.remove('show'); }
  if (chIdx < 0) { if (gameT > 3.2) { setChapter(0); say(LINES.intro); } return; }
  const pos = W.walkPosition;
  if (chIdx === 1 && fuelDestroyed >= 3 && !storyBusy) {
    storyBusy = true;
    say(LINES.fuelDone, () => { storyBusy = false; alarm = 120; raiseWanted(3); setChapter(2); });
  }
  if (chIdx === 3 && !storyBusy && Math.hypot(pos.x - LIGHT.x, pos.z - LIGHT.z) < 40) {
    storyBusy = true;
    say(LINES.lighthouse, () => { storyBusy = false; setChapter(4); rift = buildRift(); waveT = WAVE_TIME; checkpoint.x = QUAY.x; checkpoint.z = QUAY.z - 2; checkpoint.yaw = Math.PI; });
  }
  if (chIdx === 4) {
    alarm = Math.max(alarm, 5);
    waveT -= dt;
    if (rift) { const k = 1 + .03 * Math.sin(nowMs * .003); rift.grp.scale.set(k, k, 1); }
    if (waveT <= 0 && !storyBusy) {
      storyBusy = true;
      say(LINES.end, () => { storyBusy = false; alarm = 0; removeRift(); setChapter(5); card('Razpoka se je zaprla', 'Mesto diha. Prah še vedno pada.', 7); });
    }
  }
}
// Interaction with story objects (returns true if handled)
function storyInteract() {
  if (dlg.cur) { advanceDialog(); return true; }
  const pos = W.walkPosition;
  if (chIdx === 0 && Math.hypot(pos.x - mihec.body.position.x, pos.z - mihec.body.position.z) < 4 && !storyBusy) {
    storyBusy = true; say(LINES.mihec, () => { storyBusy = false; setChapter(1); }); return true;
  }
  if (chIdx === 0 && Math.hypot(pos.x - mihec.body.position.x, pos.z - mihec.body.position.z) < 4) { say([{ who: 'Mihec', text: 'Pojdi proti vzhodu, Vida. Gorivo čaka.' }]); return true; }
  if (chIdx === 2 && !player.hasGlass && !storyBusy && Math.hypot(pos.x - spyglassGroup.position.x, pos.z - spyglassGroup.position.z) < 4) {
    storyBusy = true; player.hasGlass = true; spyglassGroup.visible = false;
    say(LINES.pickup, () => { storyBusy = false; alarm = 120; raiseWanted(4); setChapter(3); }); return true;
  }
  return false;
}
function updateStoryObjects(now) {
  const show = chIdx === 2 && !player.hasGlass;
  spyglassGroup.visible = show;
  if (show) { spyglassGroup.rotation.y = now * .001; spyglassGroup.userData.glow.material.opacity = .2 + .15 * Math.sin(now * .004); }
  if (chIdx === 1 || chIdx === 2) { /* fuel tanks visible via their own mesh */ }
}
// Ris follows Vida (on foot only).
function updateRis(dt, now) {
  const g = ris.g;
  const visible = !player.vehicle && !player.dead && chIdx >= 0;
  g.visible = visible; if (!visible) return;
  const yaw = W.walkYaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const tx = W.walkPosition.x - fx * 2.2 + rx * 1.4, tz = W.walkPosition.z - fz * 2.2 + rz * 1.4;
  const dist = Math.hypot(tx - ris.pos.x, tz - ris.pos.z);
  if (dist > 12) { ris.pos.x = tx; ris.pos.z = tz; }
  const k = 1 - Math.exp(-3 * dt); ris.pos.x += (tx - ris.pos.x) * k; ris.pos.z += (tz - ris.pos.z) * k;
  const moving = dist > .3; ris.yaw = Math.atan2(W.walkPosition.x - ris.pos.x, W.walkPosition.z - ris.pos.z);
  g.position.set(ris.pos.x, Math.abs(Math.sin(now * .01)) * (moving ? .08 : 0), ris.pos.z); g.rotation.y = ris.yaw;
}

// ---------------- police / military response ----------------
let responseTimer = 0;
function findSpawnNear(x, z, minD, maxD) {
  for (let i = 0; i < 24; i++) { const a = rand(0, TAU), d = rand(minD, maxD); const px = clamp(x + Math.cos(a) * d, -500, 500), pz = clamp(z + Math.sin(a) * d, -500, 5); if (W.canWalk(px, pz)) return { x: px, z: pz }; }
  return { x: clamp(x, -480, 480), z: clamp(z - 20, -480, 0) };
}
function spawnResponse(dt) {
  responseTimer -= dt; if (responseTimer > 0) return; responseTimer = 1.5;
  if (wanted >= 1) {
    let policeCars = vehicles.filter(v => v.type === 'police' && v.active).length;
    let policeNpcs = npcs.filter(n => n.role === 'police' && n.dead <= 0).length;
    let carsThisTick = 0, npcsThisTick = 0;
    while (policeCars < wanted && carsThisTick < 3) { const sp = findSpawnNear(W.walkPosition.x, W.walkPosition.z, 35, 55); createCar('police', sp.x, sp.z, rand(0, TAU), 'police'); policeCars++; carsThisTick++; }
    while (policeNpcs < wanted * 2 && npcsThisTick < 6) { const sp = findSpawnNear(W.walkPosition.x, W.walkPosition.z, 20, 35); makeNPC(sp.x, sp.z, 'police'); policeNpcs++; npcsThisTick++; }
  }
  if (wanted >= 4 || alarm > 0) {
    const milHeli = vehicles.filter(v => v.kind === 'heli' && v.ai === 'military' && v.active).length;
    if (milHeli < 1 && (wanted >= 4)) { const h = createHeli(bases[0].x, bases[0].z - 40, 0, 'military'); h.collective = .7; }
  }
}
// Army: tanks and squads of soldiers, artillery strikes during the alarm.
function updateArmy(dt) {
  armyTankT -= dt; squadT -= dt; artT -= dt;
  alarm = Math.max(0, alarm - (chIdx === 4 ? 0 : dt));
  if (alarm <= 0 && chIdx !== 4) return;
  const pos = W.walkPosition;
  if (armyTankT <= 0) {
    const tanks = vehicles.filter(v => v.kind === 'tank' && v.active && v.ai === 'military').length;
    armyTankT = chIdx === 4 ? 14 : 22;
    if (tanks < (chIdx === 4 ? 5 : 3)) { const sp = findSpawnNear(pos.x, pos.z, 110, 160); const t = createTank(sp.x, sp.z, Math.atan2(pos.x - sp.x, pos.z - sp.z), 'military'); t.health = 340; }
  }
  if (squadT <= 0) {
    const soldiers = npcs.filter(n => n.role === 'soldier' && n.dead <= 0).length;
    squadT = chIdx === 4 ? 9 : 14;
    if (soldiers < 14) { const sp = findSpawnNear(pos.x, pos.z, 55, 85); for (let i = 0; i < 4; i++) { const n = makeNPC(sp.x + rand(-3, 3), sp.z + rand(-3, 3), 'soldier'); n.alert = 0; } }
  }
  if (artT <= 0 && chIdx >= 1) {
    artT = chIdx === 4 ? 6 : 11;
    const tgt = chIdx === 4 ? { x: LIGHT.x, z: LIGHT.z } : { x: pos.x, z: pos.z };
    const spread = chIdx === 4 ? 26 : 16;
    artillery(tgt.x + rand(-spread, spread), tgt.z + rand(-spread, spread));
    if (chIdx === 4 && Math.random() < .5) artillery(tgt.x + rand(-spread, spread), tgt.z + rand(-spread, spread), 3.4);
  }
}
// A warning circle is drawn in pencil; after a delay a shell lands. Mortar-like arc, real explosion.
function artillery(x, z, delay = 2.4) {
  const s = new Sketch(); s.circle(x, .08, z, 6, 3, 'xz', 32); s.circle(x, .09, z, 2.5, 3, 'xz', 20);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; s.line([x + Math.cos(a) * 6, .08, z + Math.sin(a) * 6], [x + Math.cos(a) * 8, .08, z + Math.sin(a) * 8], 0); }
  const g = s.finish(false); scene.add(g);
  addFX(delay, () => { }, () => { scene.remove(g); disposeGroup(g); });
  later(delay, () => boom(V3(x, 0.5, z), 26, { owner: null }));
}

// ---------------- main loop ----------------
const FIXED_H = 1 / 60;
world.addEventListener('preStep', () => {
  for (const v of vehicles) {
    if (!v.active) continue;
    if (v.kind === 'car' || v.kind === 'tank') carForces(v, FIXED_H); else if (v.kind === 'heli') heliForces(v, FIXED_H); else if (v.kind === 'plane') planeForces(v, FIXED_H); else boatForces(v, FIXED_H);
  }
});
let muzzle = 0;
function update(dt, now) {
  nowMs = now; gameT += dt; reportCd = Math.max(0, reportCd - dt);
  if (player.held) { const dir = V3(); camera.getWorldDirection(dir); const pos = camera.position.clone().add(dir.multiplyScalar(2)); player.held.body.position.set(pos.x, pos.y, pos.z); }
  for (const n of npcs) updateNPC(n, dt, now);
  for (const v of vehicles) {
    if (!v.active) { v.smoke = Math.min(1, v.smoke + dt * .1); v.wreckT += dt; continue; }
    if (v.driver) {
      const k = W.keys;
      if (v.kind === 'car' || v.kind === 'tank') v.controls = { forward: k.has('KeyW') || k.has('ArrowUp'), back: k.has('KeyS') || k.has('ArrowDown'), left: k.has('KeyA') || k.has('ArrowLeft'), right: k.has('KeyD') || k.has('ArrowRight'), handbrake: k.has('Space') };
      else if (v.kind === 'heli') v.controls = { up: k.has('Space'), down: k.has('ControlLeft') || k.has('ControlRight'), forward: k.has('KeyW'), back: k.has('KeyS'), left: k.has('KeyA'), right: k.has('KeyD'), yawL: k.has('KeyQ'), yawR: k.has('KeyZ') };
      else if (v.kind === 'plane') v.controls = { throttleUp: k.has('ShiftLeft') || k.has('ShiftRight'), throttleDown: k.has('ControlLeft') || k.has('ControlRight'), forward: k.has('KeyW'), back: k.has('KeyS'), left: k.has('KeyA'), right: k.has('KeyD'), yawL: k.has('KeyQ'), yawR: k.has('KeyZ') };
      else v.controls = { forward: k.has('KeyW'), back: k.has('KeyS'), left: k.has('KeyA'), right: k.has('KeyD') };
      if (v.kind !== 'boat') v.fuel = Math.max(0, v.fuel - dt * .05);
    } else if (!v.ai) v.controls = {};
    v.gunCd = Math.max(0, (v.gunCd || 0) - dt); v.fireCd = v.fireCd !== undefined ? Math.max(0, v.fireCd - dt) : undefined;
  }
  updateResponseVehicles(dt);
  world.step(1 / 60, dt, 3);
  flushBooms();
  for (const p of props) { p.g.position.copy(p.body.position); p.g.quaternion.copy(p.body.quaternion); p.g.visible = p.g.position.distanceTo(W.walkPosition) < 120; }
  for (const v of vehicles) {
    const d = v.g.position.distanceTo(W.walkPosition); v.g.visible = d < 240; if (v.wheelRoot) v.wheelRoot.visible = d < 240;
    if (v.kind === 'car' || v.kind === 'tank') carSync(v); else if (v.kind === 'heli') heliSync(v, dt); else if (v.kind === 'plane') planeSync(v, dt); else boatSync(v);
    if (!W.isLand(v.g.position.x, v.g.position.z) && (v.kind === 'car' || v.kind === 'tank') && v.g.position.y < -.5) damageVehicle(v, dt * 10);
    // smoke from wrecks / damaged vehicles
    if (v.smoke > .25 && d < 150) { v.puffT -= dt; if (v.puffT <= 0) { v.puffT = rand(.25, .5) / Math.max(.3, v.smoke); puff(v.g.position.clone().add(V3(rand(-1, 1), 1.8, rand(-1, 1))), true); } }
  }
  if (player.vehicle) { const p = player.vehicle.g.position; W.walkPosition.set(p.x, p.y, p.z); }
  if (!player.vehicle && !player.dead) {
    if (pressed.has('Space') && player.grounded) { player.vy = 5; player.grounded = false; }
    player.vy -= 9.82 * dt; let y = W.walkPosition.y + player.vy * dt;
    if (y <= EYE) { y = EYE; if (player.vy < -11) damagePlayer((-player.vy - 11) * 3); player.vy = 0; player.grounded = true; }
    W.walkPosition.y = y; camera.position.y = y;
    // vehicles and props push the walker; fast impacts hurt
    for (const v of vehicles) {
      if (!v.active) continue; const sp = v.body.velocity.length(); const R = VEH_R[v.kind] || 2.5;
      const dx = W.walkPosition.x - v.g.position.x, dz = W.walkPosition.z - v.g.position.z, d = Math.hypot(dx, dz);
      if (d < R && (v.kind === 'car' || v.kind === 'tank' || v.kind === 'boat' || v.g.position.y < 3)) {
        if (sp > 5 && player.lastHit > .6) damagePlayer(sp * 1.5);
        const k = (R - d) + .05, np = W.walkPosition.clone().add(V3(dx / (d || 1) * k, 0, dz / (d || 1) * k));
        if (W.canWalk(np.x, np.z)) { W.walkPosition.x = np.x; W.walkPosition.z = np.z; }
      }
    }
    for (const p of props) { const dx = W.walkPosition.x - p.g.position.x, dz = W.walkPosition.z - p.g.position.z, d = Math.hypot(dx, dz);
      if (d < p.half + .45 && d > 0) { const m = Math.max(p.body.mass, 1); p.body.applyImpulse(CV(-dx / d * 1.2 * Math.min(m, 40), 0, -dz / d * 1.2 * Math.min(m, 40)), CV()); } }
    if (W.isLand(W.walkPosition.x, W.walkPosition.z) && player.grounded) player.lastSafe.copy(W.walkPosition);
  }
  if (player.dead) { player.respawn -= dt; if (player.respawn <= 0) respawnPlayer(); }
  // regeneration after a quiet spell
  player.lastHit += dt;
  if (!player.dead && player.health < 100 && player.lastHit > 6) player.health = Math.min(100, player.health + 10 * dt);
  // inputs
  if (!player.dead) {
    if (pressed.has('Enter') || pressed.has('KeyE')) { if (!storyInteract()) { if (pressed.has('KeyE')) interact(); } }
    if (pressed.has('KeyF')) { player.armed = !player.armed; gunG.visible = player.armed && !player.vehicle; showHint(player.armed ? 'Orožje dvignjeno · klik strel · R naboj' : 'Orožje pospravljeno', 2); }
    if (pressed.has('KeyR') && player.armed && player.reload <= 0 && player.ammo < 30) player.reload = 1.4;
    if (pressed.has('KeyG')) throwGrenade();
    if (pressed.has('KeyC') && player.vehicle) player.cockpit = !player.cockpit;
  }
  if (player.reload > 0) { player.reload -= dt; if (player.reload <= 0) player.ammo = 30; }
  // physics objects maintained by the frame
  updateGrenades(dt);
  updateShells(dt);
  updateDebris(dt);
  // bullets / sparks
  for (let i = bullets.length - 1; i >= 0; i--) { const b = bullets[i]; b.life -= dt; b.line.material.opacity = Math.max(0, b.life / .08); if (b.life <= 0) { scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); bullets.splice(i, 1); } }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; s.g.scale.setScalar(1 + (.25 - s.life) * 3); if (s.life <= 0) { scene.remove(s.g); disposeGroup(s.g); sparks.splice(i, 1); } }
  // delayed + visual effects (may queue explosions)
  updateFX(dt);
  flushBooms();
  // wanted decay
  if (wanted > 0) { wantedDecay += dt; if (wantedDecay > 12) { wanted--; wantedDecay = 0; hudWanted(); } }
  spawnResponse(dt); updateArmy(dt);
  // cleanup: dead temporary NPCs, far wrecks
  for (let i = npcs.length - 1; i >= 0; i--) { if (npcs[i].gone) removeNPC(npcs[i]); }
  for (let i = vehicles.length - 1; i >= 0; i--) { const v = vehicles[i]; if (!v.active && v.wreckT > 60 && v.g.position.distanceTo(W.walkPosition) > 160 && !v.driver) removeVehicle(v); }
  // story
  updateStory(dt); updateStoryObjects(now); updateDialog(dt); updateRis(dt, now);
  if (!player.vehicle && !player.held && !player.dead && !dlg.cur) {
    const v = nearestVehicle(), n = nearestNPC(), p = nearestProp();
    if (v) showHint('E — vstopi · F orožje', .2); else if (n) showHint('E — pogovor', .2); else if (p) showHint('E — dvigni', .2);
  }
  gunG.visible = player.armed && !player.vehicle && !player.dead;
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) hintEl.classList.remove('show'); }
  damageFlash = Math.max(0, damageFlash - dt * .8); damageEl.style.opacity = damageFlash;
  hudUpdate(); updateCamera(dt); updateWaypointHUD();
  // screen shake on top of the camera rig
  if (shake > .001) { camera.position.x += rand(-1, 1) * shake * .35; camera.position.y += rand(-1, 1) * shake * .25; camera.position.z += rand(-1, 1) * shake * .35; shake *= Math.exp(-dt * 3.2); }
  pressed.clear();
}
function updateFX(dt) {
  for (let i = delayed.length - 1; i >= 0; i--) { const d = delayed[i]; d.t -= dt; if (d.t <= 0) { delayed.splice(i, 1); d.fn(); } }
  for (let i = fxList.length - 1; i >= 0; i--) { const f = fxList[i]; f.age += dt; const p = Math.min(1, f.age / f.life); f.tick(p, dt); if (p >= 1) { if (f.dispose) f.dispose(); fxList.splice(i, 1); } }
  for (const L of lightPool) { if (L.t > 0) { L.t -= dt; L.l.intensity = L.max * Math.pow(clamp(L.t / L.dur, 0, 1), 2); } else L.l.intensity = 0; }
  for (const v of vehicles) { if (v.kind === 'tank' && v.active && v.gunCd === undefined) v.gunCd = 0; }
}
const pressed = new Set();
window.addEventListener('keydown', e => { if (!e.repeat) pressed.add(e.code); sfx.unlock(); });
window.addEventListener('mousedown', e => { sfx.unlock(); if (e.button !== 0) return; if (player.held) { throwHeld(); return; } if (player.armed || player.vehicle) shoot(); });
function updateResponseVehicles(dt) {
  for (const v of vehicles) {
    if (v.ai === 'police' && v.active && !v.driver) {
      if (wanted <= 0) { v.controls = {}; continue; }
      const dx = W.walkPosition.x - v.body.position.x, dz = W.walkPosition.z - v.body.position.z, d = Math.hypot(dx, dz);
      const targetYaw = Math.atan2(dx, dz); const fwd = v.body.quaternion.vmult(CV(0, 0, 1)); const curYaw = Math.atan2(fwd.x, fwd.z);
      const diff = angNorm(targetYaw - curYaw);
      v.controls = { forward: d > 6, back: d < 4, left: diff > 0.08, right: diff < -0.08, handbrake: false };
    }
    if (v.ai === 'military' && v.kind === 'heli' && v.active && !v.driver) {
      if (wanted < 4 && alarm <= 0) { v.controls = {}; continue; }
      const dx = W.walkPosition.x - v.body.position.x, dz = W.walkPosition.z - v.body.position.z, d = Math.hypot(dx, dz);
      v.collective = clamp(v.collective + ((v.body.position.y < 25) ? .5 : -.3) * dt, 0, 1);
      const fwd = v.body.quaternion.vmult(CV(0, 0, 1)); const curYaw = Math.atan2(fwd.x, fwd.z); const targetYaw = Math.atan2(dx, dz);
      const diff = angNorm(targetYaw - curYaw);
      v.controls = { up: v.body.position.y < 25, down: false, forward: d > 15, back: false, left: false, right: false, yawL: diff > 0.05, yawR: diff < -0.05 };
      if (d < 40 && v.gunCd <= 0) { v.gunCd = .3; const from = v.g.position.clone(); const dir = V3(W.walkPosition.x, W.walkPosition.y, W.walkPosition.z).sub(from).normalize(); fireBullet(from, dir, 'npc', v); }
    }
    if (v.kind === 'tank' && v.active && !v.driver && v.ai === 'military') {
      const hostile = alarm > 0 || wanted >= 3;
      if (!hostile) { v.controls = {}; continue; }
      const dx = W.walkPosition.x - v.body.position.x, dz = W.walkPosition.z - v.body.position.z, d = Math.hypot(dx, dz);
      const fwd = v.body.quaternion.vmult(CV(0, 0, 1)); const curYaw = Math.atan2(fwd.x, fwd.z);
      const diff = angNorm(Math.atan2(dx, dz) - curYaw);
      v.controls = { forward: d > 22 && Math.abs(diff) < 2.2, back: d < 12, left: diff > 0.06, right: diff < -0.06, handbrake: false };
      v.turret.rotation.y += clamp(diff - v.turret.rotation.y, -dt * 1.6, dt * 1.6);
      v.fireCd = (v.fireCd || 0) - dt;
      if (d < 130 && v.fireCd <= 0 && Math.abs(diff) < .3) {
        const up = v.body.quaternion.vmult(CV(0, 1, 0));
        const m = v.body.position.clone(); m.x += fwd.x * 4.4 + up.x * 1.7; m.y += fwd.y * 4.4 + up.y * 1.7; m.z += fwd.z * 4.4 + up.z * 1.7;
        const mv = V3(m.x, m.y, m.z);
        if (hasLOS(mv.x, mv.y, mv.z, W.walkPosition.x, W.walkPosition.y, W.walkPosition.z)) {
          v.fireCd = 3.4; fireShell(mv, ballisticVel(mv, V3(W.walkPosition.x, W.walkPosition.y - .3, W.walkPosition.z), 85), 'npc', 24); sfx.cannon(d);
        }
      }
    }
  }
}
function updateCamera(dt) {
  if (!player.vehicle) return;
  const v = player.vehicle;
  if (player.cockpit && (v.kind === 'heli' || v.kind === 'plane' || v.kind === 'car')) {
    const off = v.kind === 'car' ? V3(-.42, .35, .1) : v.kind === 'heli' ? V3(0, .6, .8) : V3(0, .45, .7);
    const local = off.clone().applyQuaternion(v.g.quaternion).add(v.g.position);
    camera.position.copy(local);
    const qFix = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI);
    camera.quaternion.copy(v.g.quaternion).multiply(qFix);
    if (v.kind === 'car') { if (v.exterior) v.exterior.visible = false; if (v.interior) v.interior.visible = true; v.wheelRoot.visible = false; }
    else { if (v.exterior) v.exterior.visible = false; if (v.prop) v.prop.visible = false; if (v.cockpit) v.cockpit.visible = true; }
    return;
  }
  if (v.kind === 'car') { if (v.exterior) v.exterior.visible = true; if (v.interior) v.interior.visible = false; }
  else { if (v.exterior) v.exterior.visible = true; if (v.prop) v.prop.visible = true; if (v.cockpit) v.cockpit.visible = false; }
  const fwd = V3(0, 0, 1).applyQuaternion(v.g.quaternion);
  const dist = v.kind === 'car' ? 7 : v.kind === 'tank' ? 11 : v.kind === 'heli' ? 12 : v.kind === 'plane' ? 16 : 8;
  const height = v.kind === 'car' ? 3 : v.kind === 'tank' ? 4.5 : v.kind === 'heli' ? 5 : v.kind === 'plane' ? 6 : 3;
  const target = v.g.position.clone().add(fwd.clone().multiplyScalar(-dist)).add(V3(0, height, 0));
  camPos.lerp(target, 1 - Math.pow(.001, dt)); camera.position.copy(camPos);
  camLook.lerp(v.g.position.clone().add(V3(0, 1, 0)), 1 - Math.pow(.001, dt)); camera.lookAt(camLook);
}
function nearestVehicle() { let best = null, bd = 7; for (const v of vehicles) { if (!v.active) continue; const r = v.kind === 'plane' ? 9 : v.kind === 'heli' ? 8 : v.kind === 'tank' ? 9 : 7; const d = v.g.position.distanceTo(W.walkPosition); if (d < r && d < bd) { bd = d; best = v; } } return best; }
function nearestNPC() { let best = null, bd = 3; for (const n of npcs) { if (n.dead > 0 || n.ragdoll > 0 || n.role !== 'civilian') continue; const d = n.g.position.distanceTo(W.walkPosition); if (d < bd) { bd = d; best = n; } } return best; }
function nearestProp() { let best = null, bd = 3; for (const p of props) { const d = p.g.position.distanceTo(W.walkPosition); if (d < bd) { bd = d; best = p; } } return best; }
function enterVehicle(v) {
  if (player.held) dropHeld();
  player.vehicle = v; v.driver = player; W.control.enabled = false; player.cockpit = false;
  const fwd = V3(0, 0, 1).applyQuaternion(v.g.quaternion); camPos.copy(v.g.position).add(fwd.multiplyScalar(-8)).add(V3(0, 4, 0)); camLook.copy(v.g.position);
  const help = { car: 'W/S vožnja · A/D volan · Space ročna · C kabina · E izstop', tank: 'W/S vožnja · A/D krmilo · klik top (2,6 s) · E izstop', heli: 'Space dvig · Ctrl spust · W/S/A/D · Q/Z sukanje · C kabina · klik strel · E izstop', plane: 'Shift plin · Ctrl manj · W/S/A/D · Q/Z · C kabina · klik strel · E izstop', boat: 'W/S naprej · A/D krmilo · E izstop' };
  showHint(help[v.kind] || help.car, 5);
}
function exitVehicle(force = false) {
  const v = player.vehicle; if (!v) return;
  const airborne = v.active && (v.kind === 'heli' || v.kind === 'plane') && v.body.position.y > 3.5;
  if (airborne && !force) { showHint('Pristaneš lahko šele na tleh', 2); return; }
  v.driver = null; v.controls = {}; if (v.cockpit) v.cockpit.visible = false; player.vehicle = null; W.control.enabled = true;
  const side = V3(1, 0, 0).applyQuaternion(v.g.quaternion);
  let px = v.g.position.x + side.x * 2.6, pz = v.g.position.z + side.z * 2.6;
  if (!W.canWalk(px, pz)) { px = v.g.position.x - side.x * 2.6; pz = v.g.position.z - side.z * 2.6; }
  if (!W.canWalk(px, pz)) { px = v.g.position.x; pz = v.g.position.z; }
  // Leave from the vehicle's height: if it is still in the air, gravity takes over (no teleport to the ground)
  const y = Math.max(EYE, v.g.position.y + .5);
  W.walkPosition.set(px, y, pz); player.vy = 0; player.grounded = y <= EYE + .01;
  W.walkYaw = Math.atan2(-side.x, -side.z); player.lastSafe.copy(W.walkPosition);
}
function grabProp(p) { player.held = p; p.body.type = CANNON.Body.KINEMATIC; p.body.velocity.setZero(); p.body.angularVelocity.setZero(); showHint('Klik vrže · E spusti', 2); }
function dropHeld() { if (!player.held) return; player.held.body.type = CANNON.Body.DYNAMIC; player.held.body.wakeUp(); player.held = null; }
function throwHeld() { if (!player.held) return; const p = player.held; dropHeld(); const dir = V3(); camera.getWorldDirection(dir); const m = p.body.mass || 10; p.body.applyImpulse(CV(dir.x * m * 11, dir.y * m * 11 + m * 3, dir.z * m * 11), CV()); }
function shoot() {
  if (player.vehicle) {
    const v = player.vehicle;
    if (v.kind === 'tank') {
      if (v.gunCd > 0) return; v.gunCd = 2.6;
      const dir = V3(); camera.getWorldDirection(dir);
      const from = v.g.position.clone().add(dir.clone().multiplyScalar(4.5)).add(V3(0, 1.8, 0));
      fireShell(from, dir.multiplyScalar(110), 'player', 26); sfx.cannon(0); shake = Math.max(shake, .4);
      return;
    }
    if (v.kind !== 'heli' && v.kind !== 'plane') return;
    if (v.gunCd > 0) return; v.gunCd = .12;
    const fwd = V3(0, 0, 1).applyQuaternion(v.g.quaternion); const from = v.g.position.clone().add(fwd.clone().multiplyScalar(3));
    fireBullet(from, fwd, 'player', v); return;
  }
  if (!player.armed || player.reload > 0 || player.ammo <= 0) return;
  player.ammo--; const dir = V3(); camera.getWorldDirection(dir); dir.x += rand(-.01, .01); dir.y += rand(-.01, .01); dir.normalize();
  fireBullet(camera.position.clone(), dir, 'player', player.vehicle);
  W.walkPitch = clamp(W.walkPitch + .015, -1.12, 1.2);
  if (player.ammo <= 0) player.reload = 1.4;
}
function interact() {
  if (player.vehicle) { exitVehicle(); return; }
  if (player.held) { dropHeld(); return; }
  const v = nearestVehicle(); if (v) { enterVehicle(v); return; }
  const n = nearestNPC(); if (n) { showHint(pick(dialogue), 3); n.timer = 2; n.state = 'idle'; return; }
  const p = nearestProp(); if (p) { grabProp(p); return; }
}
const camPos = V3(), camLook = V3();

// ---------------- kick off ----------------
// Story start: the intro dialogue begins once the landing animation has finished (see updateStory).
window.__pencilGame = {
  update, world, vehicles, npcs, props, player, bases, fuels,
  teleportToBase(i = 0) { const b = bases[i]; W.teleport(b.x, b.z + 40); },
  spawnCar: (t, x, z) => createCar(t, x, z),
  spawnTank: (x, z) => createTank(x, z, 0, 'military'),
  explode: (x, y, z, p = 20) => boom(V3(x, y, z), p, { owner: 'player' }),
  get health() { return player.health; }, get wanted() { return wanted; },
  get alarm() { return alarm; }, get chapter() { return chIdx; }, get fuelDestroyed() { return fuelDestroyed; },
  setWanted: n => { wanted = clamp(n, 0, 5); wantedDecay = 0; responseTimer = 0; hudWanted(); },
  setChapter: i => setChapter(i),
};
