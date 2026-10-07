#!/usr/bin/env node
// === scripts/t675-witness.js — T675 ② 한 점 길을 몸 안으로 — 바이트 같음 증인 (러너 밖 · 서버 0) ===============================
// T670·T671·T673 증인 문법: 종전 글자(`git show <ref>:server/zone.js` · 기본 origin/main)와 지금 글자에서 **`npcStep` 과 그 아래 함수 전부**
// (`detectStuck` · `_t670Stuck` · `computeNpcPath` · `followNpcPath` · `_t671Lt/Gt` · `_t675Len`)를 그대로 떠서 같은 바깥 대역 위에 세운다.
// 몸 64명 × 수천 틱의 **같은 사건열**(결정이 목표를 바꿈 · 밀림 · 목표 곁에 섬 · 대피 · 길 갈아끼움 · 바깥이 `path` 를 null/새 배열로 · NaN · −0)을
// 두 판에 먹이고, 매 틱 돌려준 값과 몸 필드(손잡이가 새로 적는 `_p1A`·`_p1x`·`_p1y` 셋은 빼고 · `path` 안까지)를 `Object.is` 로 견준다.
//   ⓐ 켬 ↔ 종전 — 한 번도 안 다르다 · 몸 필드 길을 실제로 탔다(자명 통과 금지)
//   ⓑ 끔 ↔ 종전 — 새 필드 0 · 같음
//   ⓒ 미끼 — 몸 필드 쓰기를 하나씩 틀리게 하면 문다
//   ⓓ `.path` 쓰기 표(서버 전체) — 길 배열·점을 고치는 자리 0(같은 배열 = 같은 점의 근거)
// 실행: node scripts/t675-witness.js [ref=origin/main]
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const REF = process.argv[2] || 'origin/main';
const OLD = execFileSync('git', ['show', `${REF}:server/zone.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const NEW = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? '  ' + x : '')); };
const fnSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) throw new Error('없음 ' + name); const j = S.indexOf('\n}\n', i); return S.slice(i, j + 2); };
const lineSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) return ''; return S.slice(i, S.indexOf('\n', i) + 1); };
const NEWF = new Set(['_p1A', '_p1x', '_p1y']);
const same = (a, b, d = 0) => { if (d > 6) return true; const ka = Object.keys(a).filter((k) => !(d === 0 && NEWF.has(k))).sort(), kb = Object.keys(b).filter((k) => !(d === 0 && NEWF.has(k))).sort();
  if (ka.join() !== kb.join()) return 'keys ' + ka + ' / ' + kb;
  for (const k of ka) { const va = a[k], vb = b[k]; if (va && typeof va === 'object') { if (!vb || typeof vb !== 'object') return k; const r = same(va, vb, d + 1); if (r !== true) return k + '.' + r; } else if (!Object.is(va, vb)) return k + ' ' + va + ' ≠ ' + vb; } return true; };
const deep = (o) => { if (Array.isArray(o)) return o.map(deep); if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k] = deep(o[k]); return r; } return o; };

function build(S, path1, mark) {
  let src = ['_t671Lt', '_t671Gt', '_t670Stuck', '_t675Len'].map((n) => lineSrc(S, n)).join('')
    + ['detectStuck', 'computeNpcPath', 'followNpcPath', 'npcStep'].map((n) => fnSrc(S, n)).join('\n');
  if (mark) {   // 증인의 계수기 — 몸 필드로 읽은 횟수(판 밖)
    const a = '{ wx = npc._p1x; wy = npc._p1y; }';
    if (src.split(a).length !== 2) throw new Error('읽기 앵커');
    src = src.replace(a, '{ wx = npc._p1x; wy = npc._p1y; __env.hit++; }');
  }
  const h = (...a) => { let s = 7; for (const v of a) s = (s * 31 + Math.floor((Number.isFinite(v) ? v : 0) * 7)) % 1000003; return s; };
  const env = {
    hit: 0, T675_PATH1: path1, T670_SKIP_IDLE: true, T370_PATH_REUSE: false, SIM_LON_ON: true, WORLD: { dayPhaseRatio: 0.7 },
    worldPhase: (now) => (now / 1440000) % 1, MOVE_SPEED: 160, GATHER_RANGE: 40, PLAYER_ATTACK_RANGE: 60,
    mobs: new Map(), resources: new Map(), buildings: new Map(), BUILDING_SIZE: 32,
    decideNpcBehavior: (npc, now) => {
      if (now < npc.nextDecisionAt) return;
      const r = h(npc.id, now) % 100;
      npc.nextDecisionAt = now + 400 + (r * 37) % 3000;
      if (r < 30) { npc.targetX = npc.x + ((r * 13) % 41) - 20; npc.targetY = npc.y + ((r * 7) % 37) - 18; }
      else if (r < 40) { npc.targetX = npc.x + 300; npc.targetY = npc.y - 200; }
      else if (r < 45) { npc.behavior = ['gather', 'plant', 'harvest', 'flee', 'wander'][r % 5]; npc.gatherTarget = r % 2 ? 'r1' : null; npc.harvestTarget = r % 3 ? 'b1' : null; }
      else if (r < 47) { npc.behavior = 'fight'; npc.fightTarget = null; }
    },
    unstuckNpc: (npc, now) => { npc.path = null; npc.pathIndex = 0; npc.nextDecisionAt = now + 400; npc.vx = 0; npc.vy = 0; },
    straightPathClear: (ax, ay, bx, by) => h(ax, ay, bx, by) % 3 === 0, T381_PATH_DEAD: true, isTerrainBlockedLocal: (a, b) => h(a, b) % 11 === 0,
    _pfRadius: (v) => v ? 64 : 24, T399_CELL_CAP: false, isBlockedByWall: () => false,
    pfFindPath: (sx, sy, ex, ey) => h(sx, sy, ex, ey) % 5 === 0 ? null : [{ x: sx, y: sy }, { x: (sx + ex) / 2, y: (sy + ey) / 2 }, { x: ex, y: ey }],
    _roadPrefer: null, _streamOn: () => false, _streamCost: null, PathCore: { smoothPath: (wp) => wp.slice() }, Roads: { ENABLED: false }, _roadKeep: null,
    broadcast: () => {}, db: {}, chunkManager: {}, zoneGameDay: () => 100, Crops: {}, SimVillages: {},
  };
  const proxy = new Proxy(env, { has: (t, k) => typeof k === 'string' && (k === '__env' || !(k in globalThis) || k in t),
    get: (t, k) => { if (typeof k === 'symbol') return undefined; if (k === '__env') return env; if (k in t) return t[k]; if (k in globalThis) return globalThis[k]; throw new Error('대역 없음: ' + String(k)); } });
  const f = new Function('__P', 'with (__P) { let _t670PhNow = NaN, _t670Ph = 0;\n' + src + '\nreturn npcStep; }')(proxy);
  return { step: f, env };
}

function run(path1, opts, NEWSRC) {
  const A = build(OLD, false, false), B = build(NEWSRC || NEW, path1, path1);
  let x = opts.seed >>> 0 || 0x9e3779b9; const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const bodies = [];
  for (let i = 0; i < 64; i++) { const px = 1000 + i * 97.31, py = 2000 + (i % 7) * 53.7;
    bodies.push({ id: i, x: px, y: py, vx: 0, vy: 0, targetX: px + (i % 5), targetY: py - (i % 3), behavior: 'wander', nextDecisionAt: 0, inventory: {},
      simVillageId: i % 9 ? 'v1' : null, simLonOff: i % 4 ? (i % 10) / 10 : null, npcHomeX: px + 3, npcHomeY: py + 2, npcBedX: i % 2 ? px + 1 : undefined, npcBedY: py,
      path: null, pathIndex: 0, gatherTarget: null, harvestTarget: null, _lastAStarAt: 0 }); }
  const sa = bodies.map(deep), sb = bodies.map(deep);
  let now = 1e6 + 333, n = 0, d = null;
  for (let t = 0; t < opts.ticks && !d; t++) {
    now += 33;
    for (let i = 0; i < 64 && !d; i++) {
      const a = sa[i], b = sb[i], r = rnd();
      const ev = (fn) => { fn(a); fn(b); };
      if (r < opts.push) { const dx = (rnd() - 0.5) * 3, dy = (rnd() - 0.5) * 3; ev((o) => { o.x += dx; o.y += dy; }); }
      else if (r < opts.push + 0.003) { const v = rnd() < 0.5 ? -0 : NaN; ev((o) => { o.targetX = v; }); }
      else if (r < opts.push + 0.006) { ev((o) => { o.simEvacUntil = now + 2000; }); }
      else if (r < opts.push + 0.009) { ev((o) => { o.path = [{ x: o.targetX, y: o.targetY }, { x: o.targetX + 1, y: o.targetY }]; o.pathIndex = 2; }); }   // 바깥이 길 둘
      else if (r < opts.push + 0.012) { const s = 10 * (1 + (rnd() - 0.5) * 1e-12), ang = rnd() * 6.283; ev((o) => { if (typeof o.targetX === 'number') { o.x = o.targetX - Math.cos(ang) * s; o.y = o.targetY - Math.sin(ang) * s; } }); }
      else if (r < opts.push + 0.015) { ev((o) => { o.path = null; }); }                                                                // 바깥이 길을 지움(막힘 회피 꼴)
      else if (r < opts.push + 0.018) { ev((o) => { o.path = [{ x: o.targetX, y: o.targetY }]; o.pathIndex = 0; }); }                   // 바깥이 **같은 내용의 새** 한 점 배열(비트 같은 남의 배열)
      else if (r < opts.push + 0.020) { ev((o) => { o.pathIndex = 0; }); }                                                               // 같은 배열을 다시 걷게
      else if (r < opts.push + 0.022) { ev((o) => { o.vx = 7; o.vy = -3; }); }
      const ra = A.step(a, 33, now), rb = B.step(b, 33, now); n++;
      ev((o) => { if (Number.isFinite(o.vx)) { o.x += o.vx * 0.033; o.y += o.vy * 0.033; } });
      const s = same(a, b);
      if (ra !== rb || s !== true) d = [t, i, String(ra), String(rb), s];
    }
  }
  return { n, d, hit: B.env.hit, newf: sb.some((o) => o._p1A !== undefined) };
}
console.log('\n=== T675 ② 한 점 길을 몸 안으로 — 바이트 같음 증인 · 종전', REF, '===');
ok(/const T675_PATH1 = process\.env\.T675_PATH1 === '1';/.test(NEW), '[전제] 손잡이 `T675_PATH1` 기본 끔');
for (const [nm, o] of [['조용한 판(밀림 드묾)', { seed: 1, ticks: 6000, push: 0.02 }], ['붐비는 판(밀림 잦음)', { seed: 7, ticks: 4000, push: 0.3 }], ['사건 많은 판', { seed: 42, ticks: 4000, push: 0.08 }]]) {
  const r = run(true, o);
  ok(r.hit > r.n * 0.2, `ⓐ [상황] ${nm} — 몸 필드로 읽은 횟수(자명 통과 금지)`, `${r.hit} / ${r.n}`);
  ok(!r.d, `ⓐ ★★${nm} — 켬 ↔ 종전 \`npcStep\` 돌려준 값 · 몸 필드 전부(Object.is · 길 배열 안까지) **한 번도 안 다르다**`, r.d ? JSON.stringify(r.d) : null);
}
{ const r = run(false, { seed: 3, ticks: 2000, push: 0.05 });
  ok(r.hit === 0 && !r.newf && !r.d, 'ⓑ 끔 ↔ 종전 — 몸 필드 읽기 0 · 새 필드 안 씀 · 같음', `${r.hit} · ${r.n}`); }
{
  const baits = {
    '`_p1x` 를 y 로': ['npc._p1x = npc.targetX;', 'npc._p1x = npc.targetY;'],
    '`_p1y` 안 적음(낡은 점)': ['npc._p1y = npc.targetY; }', '}'],
    '같은 배열 확인 뺌(아무 배열이나 몸 필드)': ['if (T675_PATH1 && npc.path === npc._p1A && npc.pathIndex === 0)', 'if (T675_PATH1 && npc.pathIndex === 0 && npc._p1A)'],
  };
  const res = [];
  for (const [k, [a, b]] of Object.entries(baits)) {
    if (NEW.split(a).length !== 2) { res.push(k + ':앵커없음'); continue; }
    let r; try { r = run(true, { seed: 11, ticks: 3000, push: 0.08 }, NEW.replace(a, b)); } catch (e) { r = { d: 'throw ' + e.message }; }
    res.push(k + ':' + (r.d ? '물었다' : '놓쳤다'));
  }
  ok(res.every((x) => x.endsWith('물었다')), 'ⓒ ★미끼 셋 — 증인이 **다 문다**', res.join(' · '));
}
// ⓓ 서버 전체 `.path` 쓰기 — 길 배열·점을 고치는 자리
{
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js'))) {
    const S = fs.readFileSync(path.join(ROOT, 'server', f), 'utf8');
    for (const m of S.matchAll(/\b(?:npc|p|body|o|pl)\.path(?:\[[^\]]*\](?:\.[xy])?\s*(?:=(?!=)|\+=|-=)|\.(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)\()/g)) bad.push(f + ':' + S.slice(0, m.index).split('\n').length);
    for (const m of S.matchAll(/\b(?:wp|P)\.(?:x|y)\s*(?:=(?!=)|\+=|-=)/g)) bad.push(f + ':' + S.slice(0, m.index).split('\n').length + '(점)');
  }
  ok(bad.length === 0, 'ⓓ ★몸 길 배열·점을 고치는 자리 0(`push`·`splice`·`path[i] =`·`wp.x =` …) — 같은 배열이면 같은 점', bad.join(' · ') || null);
}
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
