#!/usr/bin/env node
// === scripts/t673-witness.js — T673 ① 서 있는 사람 일찍 끊기 — 바이트 같음 증인 (러너 밖 · 서버 0) ==========================
// T670·T671 증인 문법: 종전 글자(`git show <ref>:server/zone.js` · 기본 origin/main)와 지금 글자에서 **`npcStep` 과 그 아래 함수 전부**
// (`detectStuck` · `_t670Stuck` · `computeNpcPath` · `followNpcPath` · `_t671Lt/Gt`)를 그대로 떠서, 같은 바깥 대역(결정·막힘 회피·A*·자원)
// 위에 세운다. 몸 64명 × 수천 틱을 **같은 사건열**(결정이 목표를 바꿈 · 밀림 · 목표 곁에 섬 · 대피 · 행동 바꿈 · 길 갈아끼움 · NaN · −0)로
// 두 판에 먹이고, 매 틱 돌려준 값과 몸의 모든 필드(`_stuckPos` · `path` 안까지)를 `Object.is` 로 견준다.
//   ⓐ 켬(`T673_STILL=true`) ↔ 종전 — 한 번도 안 다르다 · 빠른 길을 실제로 탔다(자명 통과 금지)
//   ⓑ 끔 ↔ 종전 — 빠른 길 0 번
//   ⓒ 조건 하나씩 깬 표본(경로 둘 · 목표 키 낡음 · 10px 경계 · 채집·심기·수확 · 싸움 · 캐나디아 · NaN)마다 빠른 길을 **안 탄다** + 값 같음
// 실행: node scripts/t673-witness.js [ref=origin/main]
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
const lineSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) throw new Error('없음 ' + name); return S.slice(i, S.indexOf('\n', i) + 1); };
const same = (a, b, seen = 0) => { if (seen > 6) return true; const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); if (ka.join() !== kb.join()) return 'keys ' + ka + ' / ' + kb;
  for (const k of ka) { const va = a[k], vb = b[k]; if (va && typeof va === 'object') { if (!vb || typeof vb !== 'object') return k; const r = same(va, vb, seen + 1); if (r !== true) return k + '.' + r; } else if (!Object.is(va, vb)) return k + ' ' + va + ' ≠ ' + vb; } return true; };
const deep = (o) => { if (Array.isArray(o)) return o.map(deep); if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k] = deep(o[k]); return r; } return o; };

// 두 판을 세운다 — 판마다 제 모듈 상태(`_t670PhNow` …)를 갖는다. 바깥은 같은 결정론 대역(입력만 보고 답한다).
function build(S, still, mark) {
  let src = ['_t671Lt', '_t671Gt', '_t670Stuck'].filter((n) => S.includes(`function ${n}(`)).map((n) => lineSrc(S, n)).join('')
    + ['detectStuck', 'computeNpcPath', 'followNpcPath', 'npcStep'].map((n) => fnSrc(S, n)).join('\n');
  if (mark) {   // 증인의 계수기 — 빠른 길의 `return` 바로 앞(글자 하나 · 판 밖)
    const a = '      return;                                                                // 도착 뒤 행동 없음';
    if (src.split(a).length !== 2) throw new Error('빠른 길 앵커');
    src = src.replace(a, '      __env.fast++;\n' + a);
  }
  const h = (...a) => { let s = 7; for (const v of a) s = (s * 31 + Math.floor((Number.isFinite(v) ? v : 0) * 7)) % 1000003; return s; };
  const env = {
    fast: 0, T673_STILL: still, T670_SKIP_IDLE: true, T370_PATH_REUSE: false, SIM_LON_ON: true, WORLD: { dayPhaseRatio: 0.7 },
    worldPhase: (now) => (now / 1440000) % 1, MOVE_SPEED: 160, GATHER_RANGE: 40, PLAYER_ATTACK_RANGE: 60,
    mobs: new Map(), resources: new Map(), buildings: new Map(), BUILDING_SIZE: 32,
    decideNpcBehavior: (npc, now) => {   // 결정 대역 — 몸과 시각만 보고 정한다(두 판 같은 답)
      if (now < npc.nextDecisionAt) return;
      const r = h(npc.id, now) % 100;
      npc.nextDecisionAt = now + 400 + (r * 37) % 3000;
      if (r < 30) { npc.targetX = npc.x + ((r * 13) % 41) - 20; npc.targetY = npc.y + ((r * 7) % 37) - 18; }      // 가까운 새 목표
      else if (r < 40) { npc.targetX = npc.x + 300; npc.targetY = npc.y - 200; }                                 // 먼 목표(걷기)
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
  const proxy = new Proxy(env, { has: (t, k) => typeof k === 'string' && (k === '__env' || !(k in globalThis) || k in t), get: (t, k) => { if (typeof k === 'symbol') return undefined; if (k === '__env') return env; if (k in t) return t[k]; if (k in globalThis) return globalThis[k]; throw new Error('대역 없음: ' + String(k)); } });
  const f = new Function('__P', 'with (__P) { let _t670PhNow = NaN, _t670Ph = 0;\n' + src + '\nreturn npcStep; }')(proxy);
  return { step: f, env };
}

function run(still, opts, NEWSRC) {
  const A = build(OLD, false, false), B = build(NEWSRC || NEW, still, still);
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
      // 같은 사건열(두 판에 같게) — 바깥이 몸을 건드리는 꼴
      const ev = (fn) => { fn(a); fn(b); };
      if (r < opts.push) { const dx = (rnd() - 0.5) * 3, dy = (rnd() - 0.5) * 3; ev((o) => { o.x += dx; o.y += dy; }); }                 // 밀림(sepNpcs)
      else if (r < opts.push + 0.003) { const v = rnd() < 0.5 ? -0 : NaN; ev((o) => { o.targetX = v; }); }                               // 이상값
      else if (r < opts.push + 0.006) { ev((o) => { o.simEvacUntil = now + 2000; }); }                                                // 대피
      else if (r < opts.push + 0.009) { ev((o) => { o.path = [{ x: o.targetX, y: o.targetY }, { x: o.targetX + 1, y: o.targetY }]; o.pathIndex = 2; }); }   // 길 둘
      else if (r < opts.push + 0.012) { const s = 10 * (1 + (rnd() - 0.5) * 1e-12), ang = rnd() * 6.283; ev((o) => { if (typeof o.targetX === 'number') { o.x = o.targetX - Math.cos(ang) * s; o.y = o.targetY - Math.sin(ang) * s; } }); }   // 10px 경계
      else if (r < opts.push + 0.014) { ev((o) => { o.canadiaVillage = rnd() < 2 ? 'c' : null; }); ev((o) => {}); }
      else if (r < opts.push + 0.016) { ev((o) => { o.canadiaVillage = null; }); }
      else if (r < opts.push + 0.020) { ev((o) => { o.vx = 7; o.vy = -3; }); }                                                        // 바깥이 속도를 씀(캐러밴·전쟁 꼴)
      const ra = A.step(a, 33, now), rb = B.step(b, 33, now); n++;
      // 걸음(이동 문 대역) — vx·vy 로 한 걸음
      ev((o) => { if (Number.isFinite(o.vx)) { o.x += o.vx * 0.033; o.y += o.vy * 0.033; } });
      const s = same(a, b);
      if (ra !== rb || s !== true) d = [t, i, String(ra), String(rb), s];
    }
  }
  return { n, d, fast: B.env.fast };
}
console.log('\n=== T673 ① 서 있는 사람 일찍 끊기 — 바이트 같음 증인 · 종전', REF, '===');
ok(/const T673_STILL = process\.env\.T673_STILL === '1';/.test(NEW), '[전제] 손잡이 `T673_STILL` 기본 끔');
for (const [nm, o] of [['조용한 판(밀림 드묾)', { seed: 1, ticks: 6000, push: 0.02 }], ['붐비는 판(밀림 잦음)', { seed: 7, ticks: 4000, push: 0.3 }], ['사건 많은 판', { seed: 42, ticks: 4000, push: 0.08 }]]) {
  const r = run(true, o);
  ok(r.fast > r.n * 0.2, `ⓐ [상황] ${nm} — 빠른 길을 실제로 탔다(자명 통과 금지)`, `${r.fast} / ${r.n}`);
  ok(!r.d, `ⓐ ★★${nm} — 켬 ↔ 종전 \`npcStep\` 돌려준 값 · 몸 필드 전부(Object.is) **한 번도 안 다르다**`, r.d ? JSON.stringify(r.d) : null);
}
{ const r = run(false, { seed: 3, ticks: 2000, push: 0.05 });
  ok(r.fast === 0 && !r.d, 'ⓑ 끔 ↔ 종전 — 빠른 길 0 · 같음', `${r.fast} · ${r.n}`); }
// ⓓ 미끼 — 빠른 길에서 쓰기 하나씩 빼면 이 증인이 **문다**(증인 자체의 자명 통과 금지)
{
  const baits = {
    '`_stuckN = 0` 뺌': ['_t670Stuck(npc, now); npc._stuckN = 0;', '_t670Stuck(npc, now);'],
    '`_stuckPos` 갱신 뺌': ['_t670Stuck(npc, now); npc._stuckN = 0;', 'npc._stuckN = 0;'],
    '`_pathAt = now` 뺌': ['npc._pathFor = npc._t670Tk; npc._pathAt = now;', 'npc._pathFor = npc._t670Tk;'],
    '`vx = 0` 뺌': ['npc.pathIndex++; npc.vx = 0; npc.vy = 0;', 'npc.pathIndex++; npc.vy = 0;'],
  };
  const res = [];
  for (const [k, [a, b]] of Object.entries(baits)) {
    if (NEW.split(a).length !== 2) { res.push(k + ':앵커없음'); continue; }
    const r = run(true, { seed: 11, ticks: 3000, push: 0.08 }, NEW.replace(a, b));
    res.push(k + ':' + (r.d ? '물었다' : '놓쳤다'));
  }
  ok(res.every((x) => x.endsWith('물었다')), 'ⓓ ★미끼 넷(빠른 길의 쓰기 하나씩 뺌) — 증인이 **다 문다**', res.join(' · '));
}
// ⓒ 조건 하나씩 깬 몸 — 빠른 길을 안 타고 값도 같다
{
  const base = () => ({ id: 1, x: 100, y: 100, vx: 0, vy: 0, targetX: 103, targetY: 101, behavior: 'wander', nextDecisionAt: 1e12, inventory: {}, simVillageId: 'v1',
    path: [{ x: 103, y: 101 }], pathIndex: 1, _t670TkX: 103, _t670TkY: 101, _t670Tk: '103_101', _pathFor: '103_101', _pathAt: 1, _stuckPos: { x: 100, y: 100, at: 1 }, _stuckN: 0 });
  const cases = {
    '기준(빠른 길)': () => {}, '길 둘': (o) => { o.path = [{ x: 103, y: 101 }, { x: 103, y: 101 }]; o.pathIndex = 2; }, '길 남음': (o) => { o.pathIndex = 0; },
    '길 점 ≠ 목표': (o) => { o.path = [{ x: 103.5, y: 101 }]; }, '목표 키 낡음': (o) => { o._t670TkX = 99; }, '10px 밖(12px 안)': (o) => { o.targetX = 111; o._t670TkX = 111; o.path = [{ x: 111, y: 101 }]; },
    '−0 목표': (o) => { o.targetX = -0; o._t670TkX = 0; o.path = [{ x: 0, y: 101 }]; o.x = 3; }, 'NaN 위치': (o) => { o.x = NaN; },
    '채집 중': (o) => { o.behavior = 'gather'; o.gatherTarget = 'r1'; }, '심기': (o) => { o.behavior = 'plant'; }, '수확 중': (o) => { o.behavior = 'harvest'; o.harvestTarget = 'b1'; },
    '싸움': (o) => { o.behavior = 'fight'; o.fightTarget = null; }, '캐나디아': (o) => { o.canadiaVillage = 'c'; o.canadiaTask = 'x'; }, '경로 없음': (o) => { o.path = null; },
    '채집인데 대상 없음(빠른 길)': (o) => { o.behavior = 'gather'; o.gatherTarget = null; }, '도주(빠른 길)': (o) => { o.behavior = 'flee'; },
  };
  const tab = [];
  for (const [k, fn] of Object.entries(cases)) {
    const A = build(OLD, false, false), B = build(NEW, true, true);
    const a = base(), b = base(); fn(a); fn(b);
    const ra = A.step(a, 33, 5000), rb = B.step(b, 33, 5000);
    const s = same(a, b);
    tab.push(`${k}:${B.env.fast ? '탐' : '안탐'}${ra === rb && s === true ? '' : '✗' + s}`);
    const want = /빠른 길/.test(k) ? 1 : 0;
    if (B.env.fast !== want || ra !== rb || s !== true) ok(false, 'ⓒ ' + k, `빠른 길 ${B.env.fast} · ${s}`);
  }
  ok(tab.every((x) => !x.includes('✗')), 'ⓒ ★조건 하나씩 깬 몸 — 깬 것은 빠른 길을 **안 타고**(종전 길) · 값은 다 같다', tab.join(' · '));
}
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
