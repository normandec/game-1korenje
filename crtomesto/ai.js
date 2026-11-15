// NPC brains: perception, memory, routines and squads.
//
// think(n, dt, now) returns an *intent* and never touches physics directly:
//   { goal: {x,z}|null, speed, mult, face: {x,z}|null, fire: {x,y,z}|null, pose }
// game.js carries it out (path following, facing, shooting, animation).
//
// Civilians: routines between points of interest near home, flee from
// armed players, cars and gunshots, panic spreads to neighbours, witnesses
// report shooting to the police.
// Guards and soldiers: post/patrol, engage when they see a hostile player,
// search the last known position, and alert their squad.
// Police: idle at their post until wanted, then chase and (at wanted >= 2) shoot.

export function createAI(ctx) {
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist = (n, x, z) => { const p = n.body.position; return Math.hypot(p.x - x, p.z - z); };

  // Can n see point (tx,ty,tz)? Range, field of view (half-angle, radians) and line of sight.
  function sees(n, tx, ty, tz, range, fov) {
    const p = n.body.position, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d > 3) {
      const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
      if ((fx * dx + fz * dz) / d < Math.cos(fov)) return false;
    }
    return ctx.hasLOS(p.x, 1.4, p.z, tx, ty, tz);
  }

  // Closest sound event this NPC can hear right now (noises are recorded by game.js).
  function pickNoise(n, now) {
    const p = n.body.position; let best = null;
    for (const e of ctx.noises()) {
      if (now - e.t > 2500) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < e.r && (!best || d < best.d)) best = { x: e.x, z: e.z, d };
    }
    return best;
  }

  function awayFrom(n, from, d) {
    const p = n.body.position, dx = p.x - from.x, dz = p.z - from.z, l = Math.hypot(dx, dz) || 1;
    return { x: p.x + dx / l * d, z: p.z + dz / l * d };
  }
  function randomNear(x, z, r) {
    const a = Math.random() * TAU, rr = Math.random() * r;
    return { x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr };
  }

  // Panic spreads: civilians standing close by run as well.
  function contagion(n, threat) {
    const p = n.body.position;
    for (const m of ctx.npcs()) {
      if (m === n || m.role !== 'civilian' || m.dead > 0 || m.fixed || m.ragdoll > 0) continue;
      if (Math.hypot(m.body.position.x - p.x, m.body.position.z - p.z) < 7) {
        m.alert = Math.max(m.alert, 2.5); m.mem = threat; m.state = 'flee'; m.goal = null;
      }
    }
  }

  // A guard or soldier who spots an intruder alerts members of its group nearby.
  function alertSquad(n, now) {
    const p = n.body.position;
    for (const m of ctx.npcs()) {
      if (m === n || m.role !== n.role || m.dead > 0 || m.fixed) continue;
      if (Math.hypot(m.body.position.x - p.x, m.body.position.z - p.z) >= 25) continue;
      if (m.state === 'engage') continue;
      m.state = 'search'; m.timer = 8; m.know = n.know; m.goal = null;
    }
  }

  // ---------------- civilians ----------------
  function civilian(n, dt, now, pl) {
    n.timer -= dt; n.alert = Math.max(0, n.alert - dt); n.replanT = (n.replanT || 0) - dt;
    if (n.reportCd > 0) n.reportCd -= dt;

    // witness: saw the player shoot in plain sight -> reports to police (once per 25 s)
    const witnessed = pl.armed && pl.recentShot && (sees(n, pl.x, pl.y, pl.z, 30, 1.6) || (dist(n, pl.x, pl.z) < 12 && ctx.hasLOS(n.body.position.x, 1.4, n.body.position.z, pl.x, pl.y, pl.z)));
    if (witnessed && n.state !== 'report' && (n.reportCd || 0) <= 0) {
      n.reportCd = 25; n.state = 'report'; n.timer = 2.5; n.goal = null;
      ctx.onWitness(n);
    }
    if (n.state === 'report') {
      if (n.timer <= 0) { n.state = 'routine'; n.timer = 0; }
      return { goal: null, face: { x: pl.x, z: pl.z }, pose: 'point' };
    }

    // threat: armed player in sight, car rushing close, or a gunshot nearby
    let threat = null;
    if (pl.armed && sees(n, pl.x, pl.y, pl.z, 26, 1.9)) threat = { x: pl.x, z: pl.z };
    if (!threat) for (const v of ctx.vehicles()) {
      if (!v.active || v.body.velocity.length() <= 5) continue;
      if (dist(n, v.g.position.x, v.g.position.z) < 7) { threat = { x: v.g.position.x, z: v.g.position.z }; break; }
    }
    if (!threat) threat = pickNoise(n, now);
    if (threat) {
      n.alert = 3;
      if (n.state !== 'flee') { n.state = 'flee'; n.mem = threat; n.goal = null; contagion(n, threat); }
    }
    if (n.state === 'flee') {
      if (n.alert <= 0) { n.state = 'routine'; n.timer = 0; n.goal = null; }
      else {
        if (!n.goal || n.replanT <= 0) { n.goal = awayFrom(n, n.mem, 25); n.replanT = 1.5; }
        return { goal: n.goal, speed: n.speed, mult: 2.1, pose: 'walk' };
      }
    }

    if (n.state === 'idle') { if (n.timer <= 0) { n.state = 'routine'; n.timer = 0; } return { goal: null, pose: 'idle' }; }
    if (n.state === 'social') {
      const q = n.partner && n.partner.body.position;
      if (!q || n.timer <= 0 || n.partner.dead > 0) { n.state = 'routine'; n.partner = null; n.goal = null; return { goal: null, pose: 'idle' }; }
      if (dist(n, q.x, q.z) > 2.5) return { goal: { x: q.x, z: q.z }, speed: n.speed, pose: 'walk' };
      return { goal: null, face: { x: q.x, z: q.z }, pose: 'social' };
    }

    // routine: pick a new errand when the old one is done
    if (!n.goal || n.arrived || n.timer <= 0) {
      n.arrived = false;
      const r = Math.random();
      if (r < .16) { n.state = 'idle'; n.timer = rnd(2, 6); n.goal = null; return { goal: null, pose: 'idle' }; }
      if (r < .28) {
        const other = ctx.npcs().find(m => m !== n && m.role === 'civilian' && m.dead <= 0 && m.state !== 'flee' && Math.hypot(m.body.position.x - n.body.position.x, m.body.position.z - n.body.position.z) < 12);
        if (other) { n.state = 'social'; n.timer = rnd(3, 7); n.partner = other; n.goal = null; return { goal: null, pose: 'idle' }; }
      }
      n.goal = ctx.pickPoi(n.home.x, n.home.z, 40) || randomNear(n.home.x, n.home.z, 22);
      n.timer = rnd(10, 20);
    }
    return { goal: n.goal, speed: n.speed, pose: 'walk' };
  }

  // ---------------- guards and soldiers ----------------
  function security(n, dt, now, pl) {
    const soldier = n.role === 'soldier';
    const hostile = pl.armed || pl.wanted > 0 || pl.alarm > 0;
    const range = soldier ? 48 : 34, fov = soldier ? 2.0 : 1.5;
    n.alert = Math.max(0, n.alert - dt); n.timer -= dt; n.replanT = (n.replanT || 0) - dt;

    const seen = hostile && sees(n, pl.x, pl.y, pl.z, range, fov);
    if (seen) { n.state = 'engage'; n.know = { x: pl.x, z: pl.z }; n.alert = 4; alertSquad(n, now); }
    else if (n.state === 'engage') { n.state = 'search'; n.timer = 7; }
    else if (n.state !== 'search') {
      const noise = pickNoise(n, now);
      if (noise && (hostile || noise.d < 30)) { n.state = 'search'; n.timer = 8; n.know = { x: noise.x, z: noise.z }; n.goal = null; }
    }

    if (n.state === 'engage') {
      const d = dist(n, pl.x, pl.z), keep = soldier ? 16 : 7;
      return {
        goal: d > keep ? { x: pl.x, z: pl.z } : null, speed: soldier ? 1.8 : 1.5, face: { x: pl.x, z: pl.z },
        fire: (hostile && d < range) ? { x: pl.x, y: pl.y, z: pl.z } : null, pose: 'aim',
      };
    }
    if (n.state === 'search') {
      if (n.timer <= 0) { n.state = 'post'; n.know = null; n.goal = null; return { goal: null, pose: 'guard' }; }
      const k = n.know || n.home;
      if (dist(n, k.x, k.z) > 3 && !n.arrived) return { goal: { x: k.x, z: k.z }, speed: n.speed, pose: 'walk' };
      if (n.replanT <= 0 || !n.goal) { n.goal = randomNear(k.x, k.z, 6); n.replanT = 2; }
      return { goal: n.goal, speed: n.speed * .8, pose: 'walk' };
    }
    // post: walk the patrol route, or stand guard at home
    if (n.patrol) {
      const wp = n.patrol[n.patrolI];
      if (dist(n, wp.x, wp.z) < 1.5) n.patrolI = (n.patrolI + 1) % n.patrol.length;
      return { goal: n.patrol[n.patrolI], speed: n.speed, pose: 'walk' };
    }
    return { goal: dist(n, n.home.x, n.home.z) > 2 ? { x: n.home.x, z: n.home.z } : null, pose: 'guard' };
  }

  // ---------------- police ----------------
  function police(n, dt, now, pl) {
    n.timer -= dt;
    if (pl.wanted > 0) {
      n.state = 'chase';
      const d = dist(n, pl.x, pl.z);
      return {
        goal: d > 7 ? { x: pl.x, z: pl.z } : null, speed: n.speed, mult: 1.8, face: { x: pl.x, z: pl.z },
        fire: (pl.wanted >= 3 && d < 16) ? { x: pl.x, y: pl.y, z: pl.z } : null, pose: 'aim',
      };
    }
    if (n.state === 'chase') n.state = 'post';
    return { goal: dist(n, n.home.x, n.home.z) > 2 ? { x: n.home.x, z: n.home.z } : null, pose: 'idle' };
  }

  function think(n, dt, now) {
    const pl = ctx.player();
    if (n.role === 'guard' || n.role === 'soldier') return security(n, dt, now, pl);
    if (n.role === 'police') return police(n, dt, now, pl);
    return civilian(n, dt, now, pl);
  }

  return { think };
}
