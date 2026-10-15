// (@regress 없음 — 러너 밖 · T756 계측기 · 제품 무변)
// === scripts/t756-probe.js — 칸 A* 창(문 그래프 표 없는 창) 값 갈림 견줌: `T686_PATCH` 로 t686 자 사본(git worktree)에만 박는다 ==========
//   쓰는 법: T686_PATCH=$PWD/scripts/t756-probe.js T756_OUT=/tmp/t756/<판>.t756.json node scripts/t686-spike.js run <판>
//
// ★무엇 — 주민 칸 A*(`pfFindPath`)는 T678 문 그래프가 `unknown`(창 안 청크 표가 아직 없음)일 때만 돈다(T734 ②).
//   그 자리마다 **그림자 문 그래프**를 하나 띄운다: 지금 존 표(있는 것 전부 · 낡은 것도 존이 쓰는 그대로)를 얕게 옮기고, 없는 청크만
//   **같은 두 술어**(`!isTerrainBlockedLocal(셀 중심)` · `!isBlockedByWall(셀 중심 → 이웃 셀 중심, 층 0)`)로 그 자리에서 다 짓는다.
//   ⇒ "표 짓기가 그 창에 먼저 닿았다면" 존이 냈을 문 그래프 길(회랑 BFS · 스무딩 종전 그대로)이다. 세계는 A* 답 그대로 간다(견줌만).
//   ★존 표 그릇은 안 건드린다 — 그림자는 따로 짓는 그릇이고 존 표의 칸 배열은 읽기만 한다(문 그래프 묻기는 배열을 안 쓴다).
//   ★견줌: 길 꼴(둘 다 닿음 · A* 만 · 문 그래프만 · 둘 다 못) · 걷는 길이(스무딩 뒤 px) · 실제 도착(그 몸이 그 목표에 48px 안 · 목표 바뀜 · 120초)
//     · 도착 시간 차 어림(문 길이 − A* 길이) ÷ 그 몸이 실제로 걸은 빠르기 · 그 몸의 그날(마을 하루) 합 · 직업 · 라벨.
//   ⚠그림자 짓기는 그 틱 안에서 몰아 짓는다(견줌 판만 · 그 판의 틱 시간은 최악 표에 안 쓴다).
'use strict';
const fs = require('fs');
const path = require('path');

const HOOK_AT = '  if (T678_VERIFY && isVil && !(npc.floor || 0)) _t678Verify(npc, wp);';
const HOOK = '  if (_t678wp === undefined && T678_ON && isVil && !(npc.floor || 0) && globalThis.__T756A) globalThis.__T756A(npc, wp);   // [T756 탐침 · 사본만]\n';
const PF_CONST = "const { findPath: pfFindPath } = require('./pathfind');";

const TAIL = `
// ── [T756 탐침 · 계측기가 박았다 · 제품엔 없다] 칸 A* 창 견줌 ─────────────────────
;(function () {
  const OUT = process.env.T756_OUT; if (!OUT) return;
  const fs = require('fs'), pf = require('perf_hooks').performance, now = () => pf.now();
  const CG = require('./chunk-gates');
  let lastA = 0;
  { const f0 = pfFindPath; pfFindPath = function () { const t = now(); try { return f0.apply(this, arguments); } finally { lastA = now() - t; } }; }
  const R = { n: 0, cat: { both: 0, aOnly: 0, gOnly: 0, none: 0, gUnknown: 0 }, aMs: [], shMs: [], shBuilt: [], shPred: [], rows: [], days: {}, err: 0 };
  const sm = (w, fl) => (!w || w.length < 3 ? w : PathCore.smoothPath(w, (ax, ay, bx, by) => straightPathClear(ax, ay, bx, by, fl), { keep: Roads.ENABLED ? _roadKeep : null }));
  const L = (npc, w) => { if (!w) return null; let x = npc.x, y = npc.y, d = 0; for (const p of w) { d += Math.hypot(p.x - x, p.y - y); x = p.x; y = p.y; } return d; };
  const C = BUILDING_SIZE / 2, cs = Math.round(chunkManager.chunkSize / BUILDING_SIZE);
  const shadow = () => CG.create({ t734: T734_ASTAR_SLICE, chunkCells: cs, cellsW: Math.ceil(ZONE.zoneWidth / BUILDING_SIZE), cellsH: Math.ceil(ZONE.zoneHeight / BUILDING_SIZE),
    pass: (cx, cy) => !isTerrainBlockedLocal(cx * BUILDING_SIZE + C, cy * BUILDING_SIZE + C),
    step: (fx, fy, tx, ty) => !isBlockedByWall(fx * BUILDING_SIZE + C, fy * BUILDING_SIZE + C, tx * BUILDING_SIZE + C, ty * BUILDING_SIZE + C, 0), cap: () => Infinity });
  const day = () => { try { return gameDayNow(); } catch (e) { return Math.floor(Date.now() / 1440000); } };
  const track = new Map();   // pid → 견줌 한 줄(도착을 기다리는 중)
  let pend = null;
  globalThis.__T756A = function (npc, wp) {
    try {
      const G = _t678G; if (!G) return;
      const t0 = now(), S = shadow();
      for (const [ci, r] of G._recs) S._recs.set(ci, Object.assign({}, r, { gen: 1, dirty: false }));   // 존 표 그대로(낡은 것도 존이 쓰는 그대로 — 존 route 는 낡은 표를 쓴다)
      const sx = Math.floor(npc.x / BUILDING_SIZE), sy = Math.floor(npc.y / BUILDING_SIZE), gx = Math.floor(npc.targetX / BUILDING_SIZE), gy = Math.floor(npc.targetY / BUILDING_SIZE), Rr = _pfRadius(true);
      let r = S.route(sx, sy, gx, gy, Rr);
      if (r.res === 'unknown') { let k = 0; while (S.busy() && k++ < 100000) S.tick(1e7); r = S.route(sx, sy, gx, gy, Rr); }
      const st = S.stats(), shMs = now() - t0;
      const g = r.res === 'found' ? _t678Wp(npc, r.cells) : null;
      const ws = sm(wp, 0), gs = sm(g, 0), la = L(npc, ws), lg = L(npc, gs);
      const cat = r.res === 'unknown' ? 'gUnknown' : (wp && g) ? 'both' : wp ? 'aOnly' : g ? 'gOnly' : 'none';
      R.n++; R.cat[cat]++; R.aMs.push(+lastA.toFixed(2)); R.shMs.push(+shMs.toFixed(1)); R.shBuilt.push(st.built); R.shPred.push(st.predCalls);
      const row = { at: Date.now(), d: day(), pid: npc.pid, vil: npc.simVillageId || null, job: npc.simJob || npc.npcJob || null, act: npc._lifeAct || null, beh: npc.behavior || null,
        cat, gres: r.res, aMs: +lastA.toFixed(2), shMs: +shMs.toFixed(1), built: st.built, la: la == null ? null : +la.toFixed(1), lg: lg == null ? null : +lg.toFixed(1),
        aCells: wp ? wp.length : 0, gCells: g ? g.length : 0, direct: +Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y).toFixed(1), tx: npc.targetX, ty: npc.targetY, end: null, dt: null, rem: null };
      R.rows.push(row);
      pend = { npc, row };
    } catch (e) { R.err++; if (R.err < 5) console.log('[T756] 견줌 실패 ' + (e && e.stack)); }
  };
  { const f0 = computeNpcPath; computeNpcPath = function (npc, t) { pend = null; const p = f0(npc, t); if (pend && pend.npc === npc) { const old = track.get(npc.pid); if (old) fin(old, 'repath'); track.set(npc.pid, Object.assign(pend.row, { _t0: Date.now(), _x0: npc.x, _y0: npc.y })); } pend = null; return p; }; }
  function fin(row, why) {
    const p = players.get(row.pid); row.end = why; row.dt = Date.now() - row._t0;
    row.rem = p ? +Math.hypot(p.x - row.tx, p.y - row.ty).toFixed(1) : null;
    delete row._t0; delete row._x0; delete row._y0; track.delete(row.pid);
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
  const write = () => { try { for (const row of [...track.values()]) fin(row, 'open'); fs.writeFileSync(OUT, JSON.stringify(Object.assign({}, R, { q: _t678Q, gates: _t678G ? _t678G.stats() : null }))); } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.stack) })); } catch (e2) {} } };
  process.on('SIGUSR2', write);
  process.on('SIGHUP', () => { R.n = 0; for (const k in R.cat) R.cat[k] = 0; R.aMs.length = R.shMs.length = R.shBuilt.length = R.shPred.length = R.rows.length = 0; track.clear(); });   // 부팅 몫을 뺀다(t686 과 같은 때)
})();
`;

module.exports = function (dir) {
  const zp = path.join(dir, 'server', 'zone.js');
  let s = fs.readFileSync(zp, 'utf8');
  const cnt = (a) => s.split(a).length - 1;
  if (cnt(HOOK_AT) !== 1) throw new Error('T756 앵커 ' + cnt(HOOK_AT));
  s = s.replace(HOOK_AT, () => HOOK + HOOK_AT);
  if (cnt(PF_CONST) === 1) s = s.replace(PF_CONST, () => PF_CONST.replace('const', 'let'));
  s += TAIL;
  fs.writeFileSync(zp, s);
  require('child_process').execFileSync(process.execPath, ['--check', zp]);
};
