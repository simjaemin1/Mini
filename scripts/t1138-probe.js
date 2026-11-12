// (@regress 없음 — 러너 밖 · T1138 계측기 · 제품 무변)
// === scripts/t1138-probe.js — 칸 A* 창(문 그래프 표 없는 창) 끔 ↔ 켬 견줌: `T686_PATCH` 로 t686 자 사본(git worktree)에만 박는다 ==========
//   쓰는 법: T686_PATCH=$PWD/scripts/t1138-probe.js T1138_OUT=/tmp/t1138/<판>.json [T1138_GATES_FIRST=0] T686_END_S=1500 node scripts/t686-spike.js run <판>
//
// ★무엇 — T756 탐침(`scripts/t756-probe.js`)을 두 팔에 같이 쓰게 넓혔다.
//   묻기 자리에서 문 그래프가 `unknown`(창 안 표가 아직 없음)일 때마다 한 줄을 남긴다.
//     · 끔(`T1138_GATES_FIRST=0` = 종전) — 그 자리는 칸 A* 다(kind `astar`). A* 답은 세계가 쓴 그 답이다.
//     · 켬 — 첫 묻기는 표를 기다린다(kind `wait` · 이 자리의 답은 null). A* 답은 **세계에 안 쓰고** 견줌용으로 한 번 더 부른다
//       (부름 글자 = 존 `pfFindPath(...)` 줄을 사본에서 그대로 떠 온다 — 손으로 옮긴 인자 0). 같은 목표 두 번째 `unknown` 은 칸 A*(kind `astar2`).
//   줄마다 **그림자 문 그래프**(T756 과 같은 꼴 — 지금 존 표를 얕게 옮기고 없는 청크만 같은 두 술어로 다 짓는다) = "표가 다 있었다면" 문 길.
//   견줌: 꼴(둘 다 닿음 · A* 만 · 문 그래프만 · 둘 다 못) · 걷는 길이(스무딩 뒤 px) · 실제 도착(48 px · 목표 바뀜 · 다시 길 · 120초)
//     · 켬 기다림은 표 길을 받은 때(`got` ms)도 적는다.
//   ★틱 표본 — 1초마다 존 틱 고리(`_tickMs` · 틱 본문 ms)의 그 초 최대 · 그 초 틱 수 · 1초 타이머가 늦은 ms(이벤트 루프 막힘) — 부팅(모듈 평가)부터.
//   ★`T1138_CMP=0` — 견줌(그림자 짓기 · 견줌 A*)을 끄고 틱 표본만 — 부팅 4분 최대 틱 판은 이것으로 따로 돌린다(견줌 몫이 틱에 든다).
//   ★SIGHUP(t686 이 관측자 붙고 10초 뒤 보낸다)에 지우지 않는다 — 부팅부터 센다(때 `hupAt` 을 적어 T756 과 같은 창도 가른다).
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const fs = require('fs');
const path = require('path');

const HOOK_A_AT = '  if (T678_VERIFY && isVil && !(npc.floor || 0)) _t678Verify(npc, wp);';
const HOOK_A = "  if (_t678wp === undefined && T678_ON && isVil && !(npc.floor || 0) && globalThis.__T1138E) globalThis.__T1138E(npc, (typeof T1138_GATES_FIRST !== 'undefined' && T1138_GATES_FIRST) ? 'astar2' : 'astar', wp);   // [T1138 탐침 · 사본만]\n";
const HOOK_W_AT = '_t1138W.set(npc, npc._t670Tk); _t678wp = null; _t1138.wait++;';
const PF_CONST = "const { findPath: pfFindPath } = require('./pathfind');";

const TAIL = `
// ── [T1138 탐침 · 계측기가 박았다 · 제품엔 없다] 칸 A* 창 끔 ↔ 켬 견줌 ─────────────────────
;(function () {
  const OUT = process.env.T1138_OUT; if (!OUT) return;
  const fs = require('fs'), pf = require('perf_hooks').performance, now = () => pf.now();
  const CG = require('./chunk-gates');
  const BOOT = Date.now();
  let lastA = 0;
  { const f0 = pfFindPath; pfFindPath = function () { const t = now(); try { return f0.apply(this, arguments); } finally { lastA = now() - t; } }; }
  const R = { boot: BOOT, hupAt: null, arm: (typeof T1138_GATES_FIRST !== 'undefined' && T1138_GATES_FIRST) ? 'on' : 'off', n: 0, rows: [], err: 0, ticks: [] };
  const sm = (w, fl) => (!w || w.length < 3 ? w : PathCore.smoothPath(w, (ax, ay, bx, by) => straightPathClear(ax, ay, bx, by, fl), { keep: Roads.ENABLED ? _roadKeep : null }));
  const L = (npc, w) => { if (!w) return null; let x = npc.x, y = npc.y, d = 0; for (const p of w) { d += Math.hypot(p.x - x, p.y - y); x = p.x; y = p.y; } return d; };
  const C = BUILDING_SIZE / 2, cs = Math.round(chunkManager.chunkSize / BUILDING_SIZE);
  const shadow = () => CG.create({ t734: T734_ASTAR_SLICE, chunkCells: cs, cellsW: Math.ceil(ZONE.zoneWidth / BUILDING_SIZE), cellsH: Math.ceil(ZONE.zoneHeight / BUILDING_SIZE),
    pass: (cx, cy) => !isTerrainBlockedLocal(cx * BUILDING_SIZE + C, cy * BUILDING_SIZE + C),
    step: (fx, fy, tx, ty) => !isBlockedByWall(fx * BUILDING_SIZE + C, fy * BUILDING_SIZE + C, tx * BUILDING_SIZE + C, ty * BUILDING_SIZE + C, 0), cap: () => Infinity });
  const day = () => { try { return gameDayNow(); } catch (e) { return null; } };
  const track = new Map();   // pid → 견줌 한 줄(도착을 기다리는 중)
  let pend = null;
  if (process.env.T1138_CMP !== '0') globalThis.__T1138E = function (npc, kind, wpOrFn) {   // T1138_CMP=0 = 틱 표본만(견줌 부름 0 — 틱 표에 견줌 몫이 안 든다)
    try {
      const G = _t678G; if (!G) return;
      let wp, aMs;
      if (typeof wpOrFn === 'function') { const t = now(); wp = wpOrFn(); aMs = now() - t; } else { wp = wpOrFn; aMs = lastA; }
      const t0 = now(), S = shadow();
      for (const [ci, r] of G._recs) S._recs.set(ci, Object.assign({}, r, { gen: 1, dirty: false }));
      const sx = Math.floor(npc.x / BUILDING_SIZE), sy = Math.floor(npc.y / BUILDING_SIZE), gx = Math.floor(npc.targetX / BUILDING_SIZE), gy = Math.floor(npc.targetY / BUILDING_SIZE), Rr = _pfRadius(true);
      let r = S.route(sx, sy, gx, gy, Rr);
      if (r.res === 'unknown') { let k = 0; while (S.busy() && k++ < 100000) S.tick(1e7); r = S.route(sx, sy, gx, gy, Rr); }
      const st = S.stats(), shMs = now() - t0;
      const g = r.res === 'found' ? _t678Wp(npc, r.cells) : null;
      const ws = sm(wp, 0), gs = sm(g, 0), la = L(npc, ws), lg = L(npc, gs);
      const cat = r.res === 'unknown' ? 'gUnknown' : (wp && g) ? 'both' : wp ? 'aOnly' : g ? 'gOnly' : 'none';
      R.n++;
      const row = { at: Date.now() - BOOT, kind, d: day(), pid: npc.pid, vil: npc.simVillageId || null, job: npc.simJob || npc.npcJob || null, act: npc._lifeAct || null,
        cat, gres: r.res, aMs: +aMs.toFixed(2), shMs: +shMs.toFixed(1), built: st.built, la: la == null ? null : +la.toFixed(1), lg: lg == null ? null : +lg.toFixed(1),
        direct: +Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y).toFixed(1), tx: npc.targetX, ty: npc.targetY, end: null, dt: null, rem: null, got: null };
      R.rows.push(row);
      pend = { npc, row };
    } catch (e) { R.err++; if (R.err < 5) console.log('[T1138] 견줌 실패 ' + (e && e.stack)); }
  };
  { const f0 = computeNpcPath; computeNpcPath = function (npc, t) {
      pend = null; const p = f0(npc, t);
      const cur = track.get(npc.pid);
      if (cur && cur.kind === 'wait' && cur.got == null && !(typeof _t1138W !== 'undefined' && _t1138W.has(npc))) cur.got = Date.now() - cur._t0;   // 켬: 표 길을 받은 때
      if (pend && pend.npc === npc) { if (cur) fin(cur, 'repath'); track.set(npc.pid, Object.assign(pend.row, { _t0: Date.now() })); }
      pend = null; return p; }; }
  function fin(row, why) {
    const p = players.get(row.pid); row.end = why; row.dt = Date.now() - row._t0;
    row.rem = p ? +Math.hypot(p.x - row.tx, p.y - row.ty).toFixed(1) : null;
    delete row._t0; track.delete(row.pid);
  }
  setInterval(() => {
    for (const row of [...track.values()]) {
      const p = players.get(row.pid);
      if (!p) { fin(row, 'gone'); continue; }
      if (p.targetX !== row.tx || p.targetY !== row.ty) { fin(row, 'retarget'); continue; }
      if (Math.hypot(p.x - row.tx, p.y - row.ty) < 48) { fin(row, 'arrived'); continue; }
      if (Date.now() - row._t0 > 120000) fin(row, 'timeout');
    }
  }, 100).unref();
  //   틱 표본 — 1초마다 [부팅부터 초, 그 초 틱 본문 최대 ms, 틱 수, 1초 타이머 늦음 ms]
  { let lastN = 0, lastAt = Date.now();
    setInterval(() => {
      const T = _tickMs, n = T.n, k = Math.min(n - lastN, T.ring.length); let mx = 0;
      for (let j = 0; j < k; j++) { const v = T.ring[(T.i - 1 - j + T.ring.length * 4) % T.ring.length]; if (v > mx) mx = v; }
      lastN = n; const t = Date.now(), late = t - lastAt - 1000; lastAt = t;
      if (R.ticks.length < 20000) R.ticks.push([+((t - BOOT) / 1000).toFixed(1), +mx.toFixed(2), k, late]);
    }, 1000).unref(); }
  const write = () => { try { for (const row of [...track.values()]) fin(row, 'open'); fs.writeFileSync(OUT, JSON.stringify(Object.assign({}, R, { q: _t678Q, gates: _t678G ? _t678G.stats() : null, t1138: (typeof _t1138 !== 'undefined') ? _t1138 : null }))); } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.stack) })); } catch (e2) {} } };
  process.on('SIGUSR2', write);
  process.on('SIGHUP', () => { R.hupAt = Date.now() - BOOT; });
})();
`;

module.exports = function (dir) {
  const zp = path.join(dir, 'server', 'zone.js');
  let s = fs.readFileSync(zp, 'utf8');
  const cnt = (a) => s.split(a).length - 1;
  if (cnt(HOOK_A_AT) !== 1) throw new Error('T1138 앵커 A ' + cnt(HOOK_A_AT));
  s = s.replace(HOOK_A_AT, () => HOOK_A + HOOK_A_AT);
  if (cnt(HOOK_W_AT) === 1) {   // 켬 갈래가 있는 판(이 가지) — 기다림 자리에 견줌 A*(존 `pfFindPath(...)` 부름 글자 그대로)
    const i0 = s.indexOf('  const wp = _t678wp !== undefined ? _t678wp : pfFindPath(');
    if (i0 < 0) throw new Error('T1138 A* 부름 줄 없음');
    const a0 = s.indexOf('pfFindPath(', i0), e0 = s.indexOf('\n  });\n', a0);
    if (e0 < 0) throw new Error('T1138 A* 부름 끝 없음');
    const call = s.slice(a0, e0 + 5);   // pfFindPath( … })
    s = s.replace(HOOK_W_AT, () => HOOK_W_AT + ' if (globalThis.__T1138E) globalThis.__T1138E(npc, \'wait\', () => ' + call.split('\n').map((l) => l.replace(/\s\/\/.*$/, '').trim()).join(' ') + ');');
  }
  if (cnt(PF_CONST) === 1) s = s.replace(PF_CONST, () => PF_CONST.replace('const', 'let'));
  s += TAIL;
  fs.writeFileSync(zp, s);
  require('child_process').execFileSync(process.execPath, ['--check', zp]);
};
