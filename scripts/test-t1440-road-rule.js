#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 10   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1440-road-rule.js — 처음 길: 보호는 땅의 권리에서 · 길은 사유지와 마을 것을 비켜 간다 · 주인 없는 땅의 길 위 것은 부순다(T1440 셋째 판 · 손잡이 `T1440_ROAD_RULE` 끔 기본) ====
//
// ★왜 [지시 T1440 셋째 판 · ★재민 11-22 판정 47 · 48 · 49 · 50 · 정본 `설계/길막기_코너케이스_2026-11-22.md` §7]
//   종전: 길은 지형 · 다리만 보고(`computeRoutePts`) · 벽이 서거나 헐리면 캐시를 **전부** 비운다 · 다시 구한 길도 그 벽을 못 본다 · 가다 막히면 국소 재경로 → 3번 실패면 화물 보존 귀환.
// 판(운영 함수 그대로 · 사본 0):
//   ㉮ 마을 아이(꾸민 세계 240×700 칸 — 바위 띠 x 100 ~ 107 · 좁은 목 셋 N1 y 38 ~ 42 · N2 y 330 ~ 334 · N3 y 630 ~ 634 — 목끼리 3배 넘게 떨어졌다 · 마을 열 · 손잡이 켬):
//     ① 길에 안 닿는 조각 = 판정 0(free)
//     ② 주인 없는 땅의 구조물(U) — 저장된 길은 안 비킨다(같은 줄 · 그 칸을 지난다) · 처음부터 다시 구하면 첫째 걸음이 비킨다(두 걸음)
//     ③ 사유지 선포(마을 밖 = 급 2 · 걸음 2 까지): 들 가운데 = 걸음 1 로 보호 · ③b 목의 나머지 칸이 주인 없는 구조물 = 걸음 2(그 위로 길) · ③c 둘레가 주인 없는 것이면 걸음 1 이 비켜 간다
//     ④ 먼저 잡은 사유지 처지 바뀜 0 — N1 두 칸을 먼저 잡고 나머지 세 칸을 나중에 잡으면 나중 것이 내준다(길이 지나는 칸) · 먼저 것은 그대로
//     ⑤ 마을 건물(걸음 5 까지) — N3 를 막으면 걸음 3: 마을 밖 사유지 가운데 **나중 것만** 길을 내준다(먼저 것 그대로)
//     ⑥ 부분 무효화 — 마을 것(V)이 서면 그 칸을 지나던 쌍만 버린다 · 먼 쌍은 같은 물건
//     ⑦ 3배의 기준 = 처음 길 — 마 ↔ 바 길을 가로지르는 사유지 줄을 두 칸씩 늘린다: 3배 안은 보호 · 처음 길의 3배를 넘는 첫 선포가 내준다(길이 지나는 칸)
//     ⑧ 줄기 고쳐 잇기 ↔ 쌍 전체 다시 구하기 — 보호 판정마다 길이 비(고쳐 잇기가 전체보다 5 % 넘게 길면 빨강)
//     ⑨ 가는 도중 새로 선포된 사유지(정해진 것 8) — 옛 길로 가던 캐러밴이 그 앞에서 선다 → 그 자리에서 다시 구해 잇는다 · 고립 귀환 0 · 되돌아오지 않는다
//     ⑨b 가는 도중 사유지 앞에서 섰는데 그 자리에서 사유지를 비키는 길이 없다(목적 마을 둘레가 사유지 고리) — 이 구간은 사유지를 걸어 지난다(같은 자리에서 날마다 서지 않는다)
//     ⑩ NPC 마을 터(정해진 것 4 — 걸음 2 까지) — N1 을 덮는 터 = 안 고른다 · 들 가운데 터 = 보호(새 길 저장)
//     ⑯ 몸 길 잇기(T1320 — 곧은 마디가 지형을 지나면 걸음 정본으로 잇는다)가 잠든 청크에서도 구조물 표를 본다 — 바위 막대를 넘는 짧은 우회 자리에 마을 울타리(V):
//        잇는 길이 울타리를 비켜 가고 · 몸이 끝까지 걸어도 안 선다(켬 판 첫 판: 잇기가 존 벽 술어만 봐서 — 잠든 청크에선 아무것도 못 본다 — 몸이 마을 벽 앞에서 하루 수십 번 섰다)
//     ⑰ 걷는 길 다듬기(스트링 풀링 `_walkLineClear`)가 칸 사이 변(벽)을 본다 — 가 ↔ 나 길을 가로지르는 마을 벽 줄(변 스물 — 가 마을 앞): 코스 길 · 걷는 길이 벽 끝을 돌고 · 다듬은 곧은 줄도 벽을 안 가로지른다
//   ㉯ 존 아이(한반도 존 · 임시 DB · 마을 층 끔 · 켬 — 마을 층 길 표는 하네스 주입구 `__t1440.setup` · 지형 어댑터는 존 술어 그대로):
//     ⑪ 주인 없는 땅의 길 위 울타리 — 놓을 때 알림(하십시오체) · 표 U(첫째 걸음만 막는다) · 저장된 길 그대로 · 부서지면 빠진다 · 벽 = 변
//     ⑫ 사유지 선포(임시 사유지 문 그대로 · `tryClaim`) — 들 가운데 = 보호(새 길) · 마을 것 고리의 마지막 틈 = 묻는다 → 다짐이면 선포 + 길이 지나는 칸(저장 칸 하나)
//     ⑫c 길 위 칸 선포는 그 순간 한 번 고른다(판정 51 다 · 기본 = 비켜 가게): 고름 없이 오면 묻는다(알림 · 두 줄 물음 · 선포 0 · 판정 0) · "그대로 둠"이면 판정 없이 길이 지나는 칸(저장 칸 · 길 무변 · 미리보기 closing)
//     ⑬ 길이 지나는 칸의 막는 것 = 길을 닫는 조각(묻는다 · 표시) · 캐러밴 걸음이 친다(재료 · +8 · 알림) · 다시 놓으면 또 +8 · 주인 없는 땅의 길 위 울타리도 친다
//     ⑭ 길 확인 중 — 선포 판정이 한 몫에 안 끝나면 줄 · 알림 → 틱이 민다 → 같은 메시지 · 미리보기(`t1440_peek` — road · closing · free)
//     ⑮ 사유지 안에서 다시 세우기 = 판정 0 · 내놓으면 남은 구조물 = 주인 없는 것(U) · 내놓을 때 알림 한 줄
//     ⑬b T1238 벌점 문(T1238 켬 판) — 닫는 조각 · 길 위 주인 없는 것은 벌점 0 · 마을 땅 위 닫는 조각은 그 마을 사람이 아니면 벌점 그대로
//   ㉰ 존 끔 — 같은 자리 울타리가 그냥 선다 · 판정 0 · 모듈 안 실음
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ㉠ 주인 없는 구조물을 길이 비켜 가는 사본 → ② 빨강 · ㉡ 첫째 걸음 없이 남의 구조물 위로 길을 모는 사본 → ③c 빨강 ·
//     ㉢ 먼저 잡은 사유지가 길이 지나는 칸으로 바뀌는 사본 → ④ 빨강 · ㉣ 전부 버리는 무효화 사본 → ⑥ 빨강 · ㉤ 3배 기준이 지금 길인 사본 → ⑦ 빨강 ·
//     ㉥ 사유지 안에서 다시 세울 때 판정이 도는 사본 → ⑮ 빨강 · ㉦ 몸 길 잇기가 구조물 표를 안 보는 사본 → ⑯ 빨강 ·
//     ㉧ 걷는 길 다듬기가 칸만 보는 사본(변을 안 본다) → ⑰ 빨강 · ㉨ 비키는 길이 없어도 사유지 앞에서 또 서는 사본 → ⑨b 빨강 ·
//     ㉩ 길 위 칸 선포에서 "그대로 둠"을 안 듣는 사본 → ⑫c 빨강
// 실행: node scripts/test-t1440-road-rule.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const LB = require('./lib-bait');
const ROOT = path.join(__dirname, '..');
const ZFILE = path.join(ROOT, 'server', 'zone.js'), VFILE = path.join(ROOT, 'server', 'villages.js'), RFILE = path.join(ROOT, 'server', 'road-rule.js');
const BAITS = {
  uAvoid: { file: RFILE, at: ['const M2 = { U: false, P2: null, P3: null };', 'const M2 = { U: true, P2: null, P3: null };   // 미끼 ㉠ — 주인 없는 구조물도 길이 비켜 간다'] },
  noStep1: { file: RFILE, at: ["job.groups = [...G.values()]; job.q = job.groups.map((g) => ({ k: 'rep', g, s: 1 }));", "job.groups = [...G.values()]; job.q = job.groups.map((g) => ({ k: 'rep', g, s: 2 }));   /* 미끼 ㉡ — 첫째 걸음 없이 */"] },
  oldPass: { file: RFILE, at: ['    if (n > meta.max) {', '    if (n > 5) { /* 미끼 ㉢ — 급이 허락하지 않는 걸음까지(먼저 잡은 사유지가 내준다) */'] },
  fullClear: { file: VFILE, at: ['  if (T1440_ROAD_RULE && Number.isFinite(cx) && Number.isFinite(cy)) { _t1440ForgetRect(cx - 1, cy - 1, cx + 1, cy + 1); lifeSiteResetAll(); return; }', '  // 미끼 ㉣ — 전부 버리는 무효화(종전 줄로 떨어진다)'] },
  curBase: { file: RFILE, at: ['function _base(key, pts) { const f = F.get(key); return f ? f.len : plen(pts); }', 'function _base(key, pts) { return plen(pts); }   // 미끼 ㉤ — 3배의 기준이 지금 길'] },
  bodyLink: { file: VFILE, at: ['isBlockedFn: T1440_ROAD_RULE ? ((fx, fy, tx, ty, fl) => state.deps.isBlockedByWall(fx, fy, tx, ty, fl) || _t1440StepPx(fx, fy, tx, ty)) : state.deps.isBlockedByWall,', 'isBlockedFn: state.deps.isBlockedByWall, /* 미끼 ㉦ — 몸 길 잇기가 구조물 표를 안 본다 */'] },
  walkEdge: { file: VFILE, at: ['const eg = T1440_ROAD_RULE && RoadRule.hasAny();', 'const eg = false; /* 미끼 ㉧ — 다듬기가 칸만 본다 */'] },
  claimThru: { file: VFILE, at: ['body._t1440Thru = body.phase; _t1440S.claimThru', '/* 미끼 ㉨ — 비키는 길이 없어도 또 선다 */ _t1440S.claimThru'] },
  keepDeaf: { file: ZFILE, at: ["if (ch === 'keep:' + sig) {", "if (false) { /* 미끼 ㉩ — 그대로 둠을 안 듣는다 */"] },
  privJudge: { file: ZFILE, at: ['  if (pass) {   // 길이 지나는 칸에 세우는 막는 것 = 늘 길을 닫는 조각', '  if (priv && !pass) { const _bj = _t1440Job(piece, _t1440Sig(piece), { cls: 2, max: 2 }); SimVillages.t1440Step(_bj, 0); }   // 미끼 ㉥ — 사유지 안에서 다시 세울 때 판정\n  if (pass) {   // 길이 지나는 칸에 세우는 막는 것 = 늘 길을 닫는 조각'] },
};
function baitHook(name) {
  const bait = name && name !== '-' ? BAITS[name] : null; if (!bait) return;
  const Module = require('module'), _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === bait.file) {
      const n = content.split(bait.at[0]).length - 1;
      if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); }
      content = content.replace(bait.at[0], bait.at[1]);
    }
    return _c.call(this, content, filename);
  };
}
const plen = (p) => { let L = 0; for (let i = 1; i < (p || []).length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return L; };
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// ── ㉮ 마을 아이(꾸민 세계) ──────────────────────────────────────────────────────────────────
function vilChild(bait) {
  process.env.ENABLE_VILLAGES = '0'; process.env.T1440_ROAD_RULE = '1';
  baitHook(bait);
  const _log = console.log; console.log = () => {};
  const V = require(VFILE), RR = require(RFILE), T = V.__t1440;
  const SZ = 32, W = 240, H = 700, K = RR.K;
  const NECK = [[38, 42], [330, 334], [630, 634]];
  const band = (x, y) => x >= 100 && x <= 107 && !NECK.some(([a, b]) => y >= a && y <= b);
  const rocks = new Set();   // ⑯ 이 덧붙이는 바위(맨 끝 판 — 앞 판의 길 표와 안 섞인다)
  const terr = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || band(cx, cy) || rocks.has(cx + ',' + cy);
  const ta = { isBlocked: terr, isWater: () => false, isRock: () => false, isStream: () => false };
  const ZONE = { zoneWidth: W * SZ, zoneHeight: H * SZ };
  const mkV = (dbId, name, cx, cy) => ({ dbId, name, ccx: cx, ccy: cy, econ: { name, npcs: [] }, npcPids: [] });
  const A = mkV(1, '가', 30, 40), B = mkV(2, '나', 200, 40), C = mkV(3, '다', 150, 480), D = mkV(4, '라', 230, 560), E = mkV(5, '마', 20, 480), F = mkV(6, '바', 90, 480);
  const G = mkV(7, '사', 30, 632), Hv = mkV(8, '아', 200, 632), I = mkV(9, '자', 30, 332), Jv = mkV(10, '차', 200, 332);
  const vils = [A, B, C, D, E, F, G, Hv, I, Jv];
  const fdb = { rows: new Map(), dels: [], upsertTradeRoute(z, k, s, j) { this.rows.set(k, j); }, deleteTradeRoute(z, k) { this.dels.push(k); return 1; }, t1440FirstAll() { return []; }, t1440FirstPut() {} };
  const players = new Map(), npcs = new Set();
  const world = { day: 10, caravans: [], tradeLog: [] };
  const deps = { players, npcs, broadcast: () => {}, isPositionActive: () => true, isTerrainBlockedLocal: (px, py) => terr(Math.floor(px / SZ), Math.floor(py / SZ)),
    isBlockedByWall: (nx, ny, ox, oy) => T.stepPx(ox, oy, nx, ny), t1440MarkHit: () => false };
  T.setup({ ta, ZONE, villages: vils, byDbId: new Map(vils.map((v) => [v.dbId, v])), byEcon: new Map(vils.map((v) => [v.econ, v])), zoneId: 'test', db: fdb, world, caravanBodies: new Map(), deps,
    pathfind: require(path.join(ROOT, 'server', 'pathfind')), dayMs: require(path.join(ROOT, 'server', 'zone-config')).WORLD.dayLengthMs });
  const st = T.state(); st.ready = true;
  //   존 몫(이 하네스가 존 DB 문 · 사유지 Map · 판정 문을 대신한다 — 흐름은 존 `_t1440Gate` · `_t1440Done` 그대로)
  const pcells = (p) => { const o = p.cells.slice(); for (const e of p.edges) o.push(...RR.edgeCells(e)); return o; };
  const put = (id, p, cls) => { RR.sAdd(id, p, cls); V.t1440Touch(pcells(p), false, cls); };
  const unput = (id) => { const o = RR.sGet(id); if (!o) return; RR.sDel(id); V.t1440Touch(pcells(o.piece), true, o.cls); };
  const claims = new Map(); let tN = 0;   // id → { cells, t, lvl, pass }
  RR.claimsUse(function* () { for (const [id, c] of claims) yield [id, c.cells, false, c.t, c.lvl, c.pass]; });
  const judge = (p, meta) => { const j = V.t1440Judge(p, meta); V.t1440Step(j, 0); return j; };
  const cellsOf = (pts) => { const s = new Set(); for (let i = 1; i < (pts || []).length; i++) T.cells(pts[i - 1], pts[i], (x, y) => { s.add(K(x, y)); return false; }); return s; };
  const ysAt = (key, x, lo, hi) => { const pts = st.routeCache.get(key); if (!pts) return []; const ys = []; for (const k of cellsOf(pts)) if (RR.KX(k) === x && (lo == null || (RR.KY(k) >= lo && RR.KY(k) <= hi))) ys.push(RR.KY(k)); return ys.sort((a, b) => a - b); };
  const yAt = (key, x, lo, hi) => { const ys = ysAt(key, x, lo, hi); return ys.length ? ys[Math.floor(ys.length / 2)] : null; };   // 길이 지나는 그 열의 칸(가운데)
  //   사유지 선포(존 사유지 문 꼴): 판정(급 = 걸음) → 내줌이면 못 비킨 쌍의 지금 길이 지나는 칸 = 길이 지나는 칸 → 칸마다 사유지 → 새 길 저장 → 남의 사유지 내줌
  const declare = (id, cells, lvl) => {
    const piece = RR.pieceCells(cells), j = judge(piece, { cls: lvl, max: lvl });
    const P = new Set(piece.cells), pass = new Set();
    for (const m of j.fail) for (let i = 1; i < m.pts.length; i++) T.cells(m.pts[i - 1], m.pts[i], (x, y) => { const k = K(x, y); if (P.has(k)) pass.add(k); return false; });
    cells.forEach(([x, y], i) => { claims.set(cells.length > 1 ? `${id}.${i}` : id, { cells: [[x, y]], t: ++tN, lvl, pass: pass.has(K(x, y)) }); });
    RR.claimsDirty(); V.t1440Touch(piece.cells, false, 'P');
    const others = [];
    if (j.verdict !== 'free') V.t1440Apply(j);
    for (const [, pb] of j.passBy) for (const [cid] of pb) { const c = claims.get(cid); if (c && !c.pass) { c.pass = true; others.push(cid); } }
    if (others.length) RR.claimsDirty();
    return { j, pass: [...pass].map((k) => [RR.KX(k), RR.KY(k)]), others, step: [...j.stepOf.values()] };
  };
  //   마을 건물(급 4 · 걸음 max) — 판정 → 새 길 → 남의 사유지 내줌 → 마을 것(V)으로 선다
  const vbuild = (id, x0, y0, x1, y1, max) => {
    const p = RR.pieceRect(x0, y0, x1, y1), j = judge(p, { cls: 4, max });
    if (j.verdict !== 'free') V.t1440Apply(j);
    const others = []; for (const [, pb] of j.passBy) for (const [cid] of pb) { const c = claims.get(cid); if (c && !c.pass) { c.pass = true; others.push(cid); } }
    if (others.length) RR.claimsDirty();
    put(id, p, 'V');
    return { j, others, step: [...j.stepOf.values()] };
  };
  const out = { knob: V.T1440_ROAD_RULE };
  //   처음 길
  const r0 = { ab: T.getRoute(A, B), cd: T.getRoute(C, D), ef: T.getRoute(E, F), gh: T.getRoute(G, Hv), ij: T.getRoute(I, Jv) };
  const f0 = {}; for (const k of ['1_2', '3_4', '5_6', '7_8', '9_10']) f0[k] = (RR.firstGet(k) || {}).len || 0;
  const ef0 = st.routeCache.get('5_6');
  out.first = { n: RR.firstCount(), len: Object.fromEntries(Object.entries(f0).map(([k, v]) => [k, Math.round(v)])), ok: Object.values(r0).every(Boolean) };
  const rep = [];   // ⑧ 고쳐 잇기 ↔ 전체
  const repVsFull = (job, piece) => {
    for (const [key, pts] of job.res) {
      if (job.stepOf.get(key) !== 1 || !pts) continue;
      const ids = key.split('_').map(Number), a = st.byDbId.get(ids[0]), b = st.byDbId.get(ids[1]);
      RR.sAdd('__cmp', piece, 'V'); st._route = null;
      const full = T.route(a.ccx * SZ + 16, a.ccy * SZ + 16, b.ccx * SZ + 16, b.ccy * SZ + 16);
      RR.sDel('__cmp'); st._route = null;
      rep.push({ key, rep: Math.round(plen(pts)), full: full ? Math.round(plen(full)) : null, r: full ? r3(plen(pts) / plen(full)) : null });
    }
  };
  //   ① 길에 안 닿는 조각
  const j1 = judge(RR.pieceCell(60, 200), { cls: 2, max: 2 });
  out.free = { v: j1.verdict, touch: (j1.touch || []).length };
  //   ⑩ NPC 터 — 먼저(목이 열려 있을 때)
  out.site = { n1: T.siteCloses(100, 36, 107, 44), field: null };
  const sy = yAt('1_2', 60);
  out.site.field = sy == null ? null : T.siteCloses(57, sy - 1, 62, sy + 2);   // 가 ↔ 나 길 위 들 가운데 6×4 — 보호(새 길 저장)
  const abS = st.routeCache.get('1_2');
  out.site.fieldAvoid = (abS && sy != null) ? ![...cellsOf(abS)].some((k) => RR.KX(k) >= 57 && RR.KX(k) <= 62 && RR.KY(k) >= sy - 1 && RR.KY(k) <= sy + 2) : null;
  //   ② 주인 없는 땅의 구조물 — 저장된 길은 안 비킨다 · 처음부터 다시 구하면 첫째 걸음이 비킨다
  {
    const y = yAt('1_2', 70), ab1 = st.routeCache.get('1_2'), dl0 = fdb.dels.length;
    put('u70', RR.pieceCell(70, y, true), 'U'); V.invalidateTradeDistances(70, y); V.t1440Flush();
    const ab2 = st.routeCache.get('1_2');
    out.u = { at: [70, y], same: ab2 === ab1, clear: RR.clearRoute(ab2), onU: ab2 ? cellsOf(ab2).has(K(70, y)) : null, drops: fdb.dels.slice(dl0) };
    st.routeCache.delete('1_2'); st._route = null;
    const s1 = T.S.route1 | 0, ab3 = T.getRoute(A, B);
    out.u.fresh = ab3 ? !cellsOf(ab3).has(K(70, y)) : null; out.u.step1 = (T.S.route1 | 0) - s1;
    out.u.len = [Math.round(plen(ab2)), Math.round(plen(ab3))];
  }
  //   ③ 사유지 선포 — 들 가운데(걸음 1 로 보호)
  {
    const y = yAt('1_2', 50), d = declare('c50', [[50, y]], 2);
    if (d.j.verdict === 'protected') repVsFull(d.j, RR.pieceCells([[50, y]]));
    const ab = st.routeCache.get('1_2');
    out.c3 = { at: [50, y], v: d.j.verdict, step: d.step, avoid: ab ? !cellsOf(ab).has(K(50, y)) : null, pass: d.pass.length };
  }
  //   ③b N2 — 목의 나머지 칸이 주인 없는 구조물이면 걸음 2(그 위로 길이 간다 — 캐러밴이 친다)
  {
    const ys = ysAt('9_10', 103, 330, 334), yr = yAt('9_10', 103, 330, 334), uc = [];
    for (let y = 330; y <= 334; y++) if (y !== yr) { put('u2_' + y, RR.pieceCell(103, y, true), 'U'); uc.push(y); }
    const d = declare('cN2', [[103, yr]], 2), ij = st.routeCache.get('9_10'), c = ij ? cellsOf(ij) : new Set();
    out.c3b = { ys, yr, v: d.j.verdict, step: d.step, avoid: !c.has(K(103, yr)), overU: uc.filter((y) => c.has(K(103, y))), pass: d.pass.length };
  }
  //   ③c 들 가운데 — 사유지 칸 위아래가 주인 없는 구조물: 걸음 1 이 그 둘까지 비켜 간다(같은 3배 안 · 첫째 걸음이 먼저)
  {
    const y = yAt('9_10', 150), ij0 = st.routeCache.get('9_10');
    put('u3a', RR.pieceCell(150, y - 1, true), 'U'); put('u3b', RR.pieceCell(150, y + 1, true), 'U'); V.t1440Flush();
    const same = st.routeCache.get('9_10') === ij0;
    const d = declare('c150', [[150, y]], 2);
    if (d.j.verdict === 'protected') repVsFull(d.j, RR.pieceCells([[150, y]]));
    const ij = st.routeCache.get('9_10'), c = ij ? cellsOf(ij) : new Set();
    out.c3c = { at: [150, y], same, v: d.j.verdict, step: d.step, avoid: !c.has(K(150, y)), overU: [y - 1, y + 1].filter((yy) => c.has(K(150, yy))) };
  }
  //   ④ 먼저 잡은 사유지 처지 바뀜 0 — N1 의 한 끝 두 칸을 먼저 · 나머지 세 칸을 나중에(한 번에) 잡는다
  {
    const rys = ysAt('1_2', 103, 38, 42);
    const olds = (!rys.includes(38) && !rys.includes(39)) ? [38, 39] : ((!rys.includes(41) && !rys.includes(42)) ? [41, 42] : null);
    if (olds) {
      const news = [38, 39, 40, 41, 42].filter((y) => !olds.includes(y));
      const o1 = declare('o1', [[103, olds[0]]], 2), o2 = declare('o2', [[103, olds[1]]], 2);
      const n = declare('cn', news.map((y) => [103, y]), 2);
      const ab = st.routeCache.get('1_2'), c = ab ? cellsOf(ab) : new Set();
      out.old = { rys, olds, news, ov: [o1.j.verdict, o2.j.verdict], v: n.j.verdict, step: n.step, pass: n.pass, others: n.others, oPass: [claims.get('o1').pass, claims.get('o2').pass],
        through: [38, 39, 40, 41, 42].filter((y) => c.has(K(103, y))), clear: RR.clearRoute(ab) };
    } else out.old = { rys, olds: null };
  }
  //   ⑤ 마을 건물 — N3 를 막으면 걸음 3: 마을 밖 사유지 가운데 나중 것만 길을 내준다
  {
    const rys = ysAt('7_8', 103, 630, 634);
    const olds = (!rys.includes(630) && !rys.includes(631)) ? [630, 631] : ((!rys.includes(633) && !rys.includes(634)) ? [633, 634] : null);
    if (olds) {
      const rest = [630, 631, 632, 633, 634].filter((y) => !olds.includes(y));
      declare('ca', [[103, olds[0]]], 2); declare('cb', [[103, olds[1]]], 2);
      const vb = vbuild('vN3', 103, rest[0], 103, rest[rest.length - 1], 5);
      const gh = st.routeCache.get('7_8'), c = gh ? cellsOf(gh) : new Set();
      out.vil = { rys, olds, rest, v: vb.j.verdict, step: vb.step, others: vb.others, pass: [claims.get('ca').pass, claims.get('cb').pass], through: [630, 631, 632, 633, 634].filter((y) => c.has(K(103, y))),
        ratio: gh ? r3(plen(gh) / f0['7_8']) : null };
    } else out.vil = { rys, olds: null };
  }
  //   ⑥ 부분 무효화 — 마을 것(V)이 가 ↔ 나 길 위에 서면 그 쌍만 버린다
  {
    const cd0 = st.routeCache.get('3_4'), ef = st.routeCache.get('5_6'), y = yAt('1_2', 150); fdb.dels.length = 0;
    put('v150', RR.pieceCell(150, y, true), 'V'); V.invalidateTradeDistances(150, y); V.t1440Flush();
    out.part = { at: [150, y], cdSame: st.routeCache.get('3_4') === cd0, efSame: st.routeCache.get('5_6') === ef, cdFirst: Math.round((RR.firstGet('3_4') || {}).len || 0), drops: fdb.dels.slice() };
    const ab = T.getRoute(A, B); out.part.avoid = ab ? !cellsOf(ab).has(K(150, y)) : null;
  }
  //   ⑦ 3배의 기준 = 처음 길 — 마 ↔ 바 길에 x 55 세로 사유지 줄을 길 칸에서 위아래 한 칸씩(선포마다 판정)
  const steps = []; let closeAt = null;
  {
    const yc = yAt('5_6', 55);
    for (let i = 0; i <= 230 && yc != null; i++) {
      const cells = i === 0 ? [[55, yc]] : [[55, yc - i], [55, yc + i]];
      if (cells.some(([x, y]) => terr(x, y))) break;
      const d = declare('g' + i, cells, 2), ef = st.routeCache.get('5_6');
      if (d.j.verdict === 'protected') { if (i % 10 === 0) repVsFull(d.j, RR.pieceCells(cells)); steps.push([i, 'protected', r3(plen(ef) / f0['5_6'])]); }
      else if (d.j.verdict === 'yield') { closeAt = i; steps.push([i, 'yield', r3(plen(ef) / f0['5_6']), d.pass.length]); break; }
      else steps.push([i, d.j.verdict, ef ? r3(plen(ef) / f0['5_6']) : null]);
    }
    const efEnd = T.getRoute(E, F);
    out.grad = { yc, closeAt, last: steps.slice(-3), maxProt: Math.max(0, ...steps.filter((s) => s[1] === 'protected').map((s) => s[2] || 0)), endRatio: efEnd ? r3(plen(efEnd) / f0['5_6']) : null, n: steps.length };
  }
  //   ⑨ 가는 도중 — 처음 길(곧은 줄)로 가던 캐러밴(마 → 바)이 x 55 사유지 앞에서 선다 → 그 자리에서 다시 구해 잇는다
  if (ef0) {
    const c = { id: 77, from: E.econ, to: F.econ, state: 'outbound', departDay: 10, arriveDay: 13, returnArriveDay: 16, travelDays: 3 };
    const pts = ef0.map((q) => ({ x: q.x, y: q.y })), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const body = { id: 77, pid: 'car_77', c, phase: 'outbound', toV: F.econ, pts, cum, len: cum[cum.length - 1], prog: 0, segIdx: 0, delayedDays: 0, repairFailN: 0, lastRepairAt: 0, escorts: [], pxPerDay: cum[cum.length - 1] / 3, arriveAt: 0, nomPxMs: 1 };
    //   옛 길 위 x 50 자리(사유지 줄 다섯 칸 앞)
    let pr = 0, px = null; for (let i = 1; i < pts.length && !px; i++) { const a = pts[i - 1], b = pts[i]; if ((a.x - 50.5 * SZ) * (b.x - 50.5 * SZ) <= 0 && a.x !== b.x) { const t = (50.5 * SZ - a.x) / (b.x - a.x); px = { x: 50.5 * SZ, y: a.y + (b.y - a.y) * t }; pr = cum[i - 1] + Math.hypot(px.x - a.x, px.y - a.y); body.segIdx = i - 1; } }
    const p = { pid: 'car_77', name: '상인', isNpc: true, hp: 100, maxHp: 100, x: px ? px.x : 0, y: px ? px.y : 0, vx: 0, vy: 0, inventory: {} };
    players.set(p.pid, p); st.caravanBodies.set(77, body);
    body.prog = pr;
    const r0n = T.S.reroute, iso0 = T.S.iso | 0, cs0 = T.S.claimStop | 0;
    const blocked = T.walk1182(body, p, Math.min(body.len, body.prog + 20 * SZ), 1000);
    const stopX = Math.floor(p.x / SZ);
    if (blocked) T.blocked(body, p, 1e12);
    const np = body.pts;
    let clear = true; for (let i = 1; i < np.length; i++) T.cells(np[i - 1], np[i], (x, y) => { const o = RR.claimAt(x, y); if (o && !o.pass) clear = false; return false; });
    out.mid = { blocked, stopX, claimStop: (T.S.claimStop | 0) - cs0, reroute: T.S.reroute - r0n, iso: (T.S.iso | 0) - iso0, fail: body.repairFailN, start: [Math.round(np[0].x), Math.round(np[0].y)], end: [Math.round(np[np.length - 1].x), Math.round(np[np.length - 1].y)], clear, back: np[1] ? np[1].x < np[0].x - SZ * 3 : null, len: Math.round(body.len) };
  }
  //   ⑯ 몸 길 잇기(T1320) — 잠든 청크(존 벽 술어가 아무것도 못 보는 곳): 곧은 마디가 바위 막대(x 159 ~ 161 · y 196 ~ 214)를 지난다 · 막대 위 짧은 우회 자리에 마을 울타리(V · x 160 · y 188 ~ 195)
  {
    for (let y = 196; y <= 214; y++) for (let x = 159; x <= 161; x++) rocks.add(x + ',' + y);
    for (let y = 188; y <= 195; y++) put('vb' + y, RR.pieceCell(160, y, true), 'V');
    const a0 = deps.isPositionActive, w0 = deps.isBlockedByWall;
    deps.isPositionActive = () => false; deps.isBlockedByWall = () => false;
    try {
      const p0 = { x: 153 * SZ + 16, y: 200 * SZ + 16 }, p1 = { x: 167 * SZ + 16, y: 200 * SZ + 16 };
      const c = { id: 78, from: A.econ, to: B.econ, state: 'outbound', departDay: 10, arriveDay: 13, returnArriveDay: 16, travelDays: 3 };
      const body = { id: 78, pid: 'car_78', c, phase: 'outbound', toV: B.econ, delayedDays: 0, repairFailN: 0, lastRepairAt: 0, escorts: [], arriveAt: 0, nomPxMs: 1 };
      T.setBodyPts(body, [p0, p1]); body.pxPerDay = body.len;
      const pts = body.pts; let phys = 0, rock = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (SZ / 4))); let q = a;
        for (let k = 1; k <= n; k++) { const r = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }; if (T.stepPx(q.x, q.y, r.x, r.y)) phys++; if (terr(Math.floor(r.x / SZ), Math.floor(r.y / SZ))) rock++; q = r; }
      }
      const p = { pid: 'car_78', name: '상인', isNpc: true, hp: 100, maxHp: 100, x: p0.x, y: p0.y, vx: 0, vy: 0, inventory: {} };
      players.set(p.pid, p); st.caravanBodies.set(78, body);
      const sh0 = T.S.stepHit | 0;
      const blocked = T.walk1182(body, p, body.len, 1000);
      const ys = pts.map((q) => Math.floor(q.y / SZ));
      out.body = { n: pts.length, linked: pts.length > 2, phys, rock, y: [Math.min(...ys), Math.max(...ys)], blocked, stepHit: (T.S.stepHit | 0) - sh0, end: Math.hypot(p.x - p1.x, p.y - p1.y) < 1, len: Math.round(body.len) };
    } finally { deps.isPositionActive = a0; deps.isBlockedByWall = w0; }
  }
  //   ⑰ 걷는 길 다듬기 — 가 ↔ 나 길이 x 60 열을 지나는 칸 위 열여섯 · 아래 세 칸(스무 줄)에 마을 벽(변 E · V) — 길이 벽 끝을 돌고, 그 앞뒤를 곧게 이으면 벽을 가로지른다
  {
    const yr = yAt('1_2', 60);
    if (yr != null) {
      for (let y = yr - 16; y <= yr + 3; y++) put('vw' + y, RR.pieceEdge(60, y, 'E'), 'V');
      V.invalidateTradeDistances(60, yr); V.t1440Flush();
      const ab = T.getRoute(A, B), w = T.walkFor(A, B, 0), pts = (w && w.pts) || [];
      let hit = 0, seg = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (SZ / 4))); let q = a, h = false;
        for (let k = 1; k <= n; k++) { const r = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }; if (T.stepPx(q.x, q.y, r.x, r.y)) { hit++; h = true; } q = r; }
        if (h) seg++;
      }
      const near = pts.filter((q) => Math.abs(q.x / SZ - 61) <= 6).length;
      out.walk = { yr, abClear: RR.clearRoute(ab), n: pts.length, hit, seg, clear: RR.clearRoute(pts), near, len: Math.round(plen(pts)) };
    } else out.walk = { yr: null };
  }
  //   ⑨b 가는 도중 · 비키는 길 없음 — 라 마을(230, 560) 가운데 둘레 3칸 고리(24칸)를 사유지로 · 서쪽 15칸에서 가운데로 가던 캐러밴
  {
    const ring = []; for (let y = 557; y <= 563; y++) for (let x = 227; x <= 233; x++) if (Math.max(Math.abs(x - 230), Math.abs(y - 560)) === 3) ring.push([x, y]);
    ring.forEach(([x, y], i) => claims.set('ring' + i, { cells: [[x, y]], t: ++tN, lvl: 2, pass: false }));
    RR.claimsDirty(); V.t1440Touch(ring.map(([x, y]) => K(x, y)), false, 'P');
    const p0 = { x: 215 * SZ + 16, y: 560 * SZ + 16 }, p1 = { x: 230 * SZ + 16, y: 560 * SZ + 16 };
    const c = { id: 79, from: C.econ, to: D.econ, state: 'outbound', departDay: 10, arriveDay: 13, returnArriveDay: 16, travelDays: 3 };
    const body = { id: 79, pid: 'car_79', c, phase: 'outbound', toV: D.econ, delayedDays: 0, repairFailN: 0, lastRepairAt: 0, escorts: [], arriveAt: 0, nomPxMs: 1 };
    T.setBodyPts(body, [p0, p1]); body.pxPerDay = body.len;
    const p = { pid: 'car_79', name: '상인', isNpc: true, hp: 100, maxHp: 100, x: p0.x, y: p0.y, vx: 0, vy: 0, inventory: {} };
    players.set(p.pid, p); st.caravanBodies.set(79, body);
    const cs0 = T.S.claimStop | 0, rf0 = T.S.rerouteFail | 0, th0 = T.S.claimThru | 0;
    const b1 = T.walk1182(body, p, body.len, 1000), at1 = Math.floor(p.x / SZ);
    if (b1) T.blocked(body, p, 1e12);
    const b2 = T.walk1182(body, p, body.len, 1000);
    out.thru = { b1, at1, b2, claimStop: (T.S.claimStop | 0) - cs0, rerouteFail: (T.S.rerouteFail | 0) - rf0, thru: (T.S.claimThru | 0) - th0, end: Math.hypot(p.x - p1.x, p.y - p1.y) < 1 };
  }
  out.rep = rep; out.S = Object.assign({}, T.S, { stepAt: undefined }); out.rr = RR.stats();
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── ㉯ ㉰ 존 아이(한반도 · 마을 층 끔) ────────────────────────────────────────────────────────────
function zoneChild(bait) {
  const TMP = `/tmp/t1440-z-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(require('./lib-port').port(39640));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  baitHook(bait);
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(ZFILE);
  const H = Zone.__testBind(), BS = H.BUILDING_SIZE, SV = H.SimVillages, on = !!H.T1440_ROAD_RULE, RR = H.RoadRule;
  const C = (cx, cy) => [cx * BS + BS / 2, cy * BS + BS / 2];
  const blk = (cx, cy) => H.isTerrainBlockedLocal(...C(cx, cy));
  //   들 한 조각 — 가로 64칸 · 세로 ±12칸이 다 열린 줄(마을 둘을 그 양 끝에)
  const Z = require(path.join(ROOT, 'server', 'zone-config')).ZONES.hanbando;
  let row = null;
  for (let y = 600; y < 3800 && !row; y += 37) for (let x = 200; x < 2000 && !row; x += 41) {
    let ok = true; for (let dy = -12; dy <= 12 && ok; dy += 1) for (let dx = -6; dx <= 66 && ok; dx += 1) if (blk(x + dx, y + dy)) ok = false;
    if (ok) row = [x, y];
  }
  const out = { on, row };
  const notes = [];
  const mkP = (name) => ({ pid: 'pid_' + name, playerId: 'test_' + name, name, ws: { readyState: 1, send: (s) => { try { notes.push(JSON.parse(s)); } catch (e) {} } }, x: 0, y: 0, floor: 0, inventory: { wood: 500, stone: 500, plank: 500, fiber: 50, item_fence: 20, item_wall: 20 }, vp: 0, hunger: 100, thirst: 100, toolItems: [] });
  const P = mkP('P'), Q = mkP('Q'), R = mkP('R'), S2 = mkP('S');
  for (const pl of [P, Q, R, S2]) H.players.set(pl.pid, pl);
  const at = (pl, c) => { pl.x = c[0] * BS + BS / 2; pl.y = c[1] * BS + BS / 2; };
  const lastNote = () => { const n = notes.filter((m) => m.type === 'notice'); return n.length ? n[n.length - 1].text : null; };
  const allNotes = () => notes.filter((m) => m.type === 'notice').map((m) => m.text);
  const fenceAt = (x, y) => { for (const b of H.buildings.values()) if (b.type === 'fence' && Math.floor(b.x / BS) === x && Math.floor(b.y / BS) === y) return b; return null; };
  const claimAtC = (x, y) => { for (const c of H.claims.values()) if (Math.floor(c.x / BS) === x && Math.floor(c.y / BS) === y) return c; return null; };
  const fence = (pl, c) => { notes.length = 0; at(pl, c); pl._t1440Msg = { type: 'place_building', itemType: 'item_fence', atX: c[0] * BS + BS / 2, atY: c[1] * BS + BS / 2, floor: 0 }; let ok = false; try { ok = !!H._tryBuildAt(pl, 'fence', 0, null, null, { skipCost: true }); } catch (e) { return { ok: false, err: String(e.stack).slice(0, 300) }; } return { ok, note: lastNote(), notes: allNotes(), confirm: notes.find((m) => m.type === 't1440_confirm') || null }; };
  //   임시 사유지(T) — 존 문 그대로(`tryClaim` · 그 사람이 선 칸) · 묻는 판정이면 `t1440_confirm` 을 돌려준다
  //   ★[판정 51] 길 위 칸이면 선포하는 순간 고른다 — 이 손은 기본(비켜 가게)을 그 칸 서명에 묶어 들고 간다 · road = null 이면 고름 없이(묻는 판) · 'keep:<서명>' = 그대로 둠
  const claim = (pl, c, road) => { notes.length = 0; at(pl, c); pl._t1440Msg = { type: 'claim', kind: 'temporary' }; pl._t1440Road = road === undefined ? (RR ? 'avoid:' + H._t1440Sig(RR.pieceCell(c[0], c[1])) : null) : road; try { H.tryClaim(pl, 'temporary'); } catch (e) { return { err: String(e.stack).slice(0, 300) }; } const cl = claimAtC(c[0], c[1]); return { ok: !!(cl && cl.ownerPid === pl.playerId), cl, note: lastNote(), notes: allNotes(), confirm: notes.find((m) => m.type === 't1440_confirm') || null, choose: notes.find((m) => m.type === 't1440_choose') || null }; };
  //   판정이 한 몫(CPU 16ms)에 안 끝나 줄에 섰으면(직접 부른 손짓엔 다시 부를 메시지가 없다) 그 판정을 끝까지 밀고 한 번 더 — 줄 선 수를 센다
  let waited = 0;
  const unq = (pl, again) => { let r = again(); const qi = (H._t1440Q || []).findIndex((x) => x.player === pl); if (qi >= 0) { const qq = H._t1440Q.splice(qi, 1)[0]; waited++; SV.t1440Step(qq.job, 0); const ok0 = pl._t1440Ok; r = again(); if (!r.ok && ok0) pl._t1440Ok = ok0; } return r; };
  if (row && on) {
    //   마을 층 길 표(하네스 주입구 — 지형 어댑터 = 존 술어 그대로 · 다리 칸은 열림)
    const ta = { isBlocked: (cx, cy) => { const [px, py] = C(cx, cy); if (px < 0 || py < 0 || px >= Z.zoneWidth || py >= Z.zoneHeight) return true; return H.isTerrainBlockedLocal(px, py) && !(H.isWaterTileLocal(px, py) && H.isBridgeTileLocal(px, py)); },
      isWater: (cx, cy) => H.isWaterTileLocal(...C(cx, cy)), isRock: () => false, isStream: () => false };
    const X = { dbId: 901, name: '시험가', ccx: row[0], ccy: row[1], econ: { name: '시험가', npcs: [] } }, Y = { dbId: 902, name: '시험나', ccx: row[0] + 64, ccy: row[1], econ: { name: '시험나', npcs: [] } };
    SV.__t1440.setup({ ta, ZONE: { zoneWidth: Z.zoneWidth, zoneHeight: Z.zoneHeight }, villages: [X, Y], byDbId: new Map([[901, X], [902, Y]]), byEcon: new Map([[X.econ, X], [Y.econ, Y]]), zoneId: 'hanbando', db: H.db, world: { day: 5 } });
    const st = SV.__t1440.state(); st.ready = true;
    const route = () => SV.__t1440.getRoute(X, Y);
    const r0 = route();
    out.route = r0 ? { n: r0.length, len: Math.round(plen(r0)) } : null;
    const rcells = (pts) => { const s = []; if (pts) for (let i = 1; i < pts.length; i++) SV.__t1440.cells(pts[i - 1], pts[i], (x, y) => { s.push([x, y]); return false; }); return s; };
    const rset = (pts) => new Set(rcells(pts).map(([x, y]) => x + ',' + y));
    const yOn = (x) => { const c = rcells(route()).filter(([cx]) => cx === x).map(([, cy]) => cy).sort((a, b) => a - b); return c.length ? c[Math.floor(c.length / 2)] : row[1]; };
    //   ⑪ 주인 없는 땅의 길 위 울타리
    const mid = [row[0] + 32, yOn(row[0] + 32)], rA = st.routeCache.get('901_902');
    const b1 = fence(P, mid), f1 = fenceAt(mid[0], mid[1]);
    SV.t1440Flush();
    out.u = { b1: { ok: b1.ok, note: b1.note, confirm: !!b1.confirm }, id: f1 && f1.id, row: f1 ? (H._t1440Row.get(f1.id) || {}).cls : null, m1: RR.cellBlkM(mid[0], mid[1], RR.M1), m2: RR.cellBlk(mid[0], mid[1]), same: st.routeCache.get('901_902') === rA, on: rset(st.routeCache.get('901_902')).has(mid.join(',')) };
    notes.length = 0; H._t1440PeekMsg(P, { what: 'cell', cx: mid[0], cy: mid[1] + 1, key: 'u1' }); H._t1440PeekMsg(P, { what: 'cell', cx: mid[0], cy: mid[1] + 11, key: 'u2' });
    out.u.peek = notes.filter((m) => m.type === 't1440_peek').map((m) => [m.key, m.st]);
    if (f1) {   // 부서짐 → 빠짐 · 고침 → 다시(T1238 켬일 때만 울타리 부서짐이 통과)
      const d0 = Object.assign({}, f1.data); f1.data.damaged = true; H.db.updateBuildingData(f1.dbId, JSON.stringify(f1.data));
      out.dmg = { t1238: !!H.T1238_ON, inS: RR.cellBlkM(mid[0], mid[1], RR.M1) };
      f1.data = d0; H.db.updateBuildingData(f1.dbId, JSON.stringify(f1.data)); out.dmg.back = RR.cellBlkM(mid[0], mid[1], RR.M1);
    }
    const wc = [row[0] + 10, row[1] + 8]; notes.length = 0; at(P, wc); let wok = false; try { wok = !!H._tryBuildAt(P, 'wall', 0, 'N', null, { skipCost: true }); } catch (e) {}
    out.wall = { ok: wok, m1: RR.edgeStepM(wc[0], wc[1], wc[0], wc[1] - 1, RR.M1), m2: RR.edgeStep(wc[0], wc[1], wc[0], wc[1] - 1) };
    //   ⑫ 사유지 선포 — 들 가운데 길 칸(P · 임시 사유지)
    const pc = [row[0] + 20, yOn(row[0] + 20)];
    const pr0 = H._t1440Zs.prot, c1 = unq(P, () => claim(P, pc)); SV.t1440Flush();
    out.claimP = { at: pc, ok: c1.ok, prot: H._t1440Zs.prot - pr0, pass: c1.cl ? !!c1.cl.t1440pass : null, avoid: !rset(route()).has(pc.join(',')), note: c1.note, err: c1.err };
    //   ⑫ 마을 것 고리(시험가 둘레 7×7 · NPC 마을 행 = V) — 길이 나가는 칸 하나만 틈 → R 이 그 틈을 잡는다 → 내줌: 묻는다 → 다짐이면 선포 + 길이 지나는 칸
    const ring = []; const Rr = 3, cx0 = X.ccx, cy0 = X.ccy;
    for (let dx = -Rr; dx <= Rr; dx++) ring.push([cx0 + dx, cy0 - Rr]); for (let dy = -Rr + 1; dy <= Rr; dy++) ring.push([cx0 + Rr, cy0 + dy]);
    for (let dx = Rr - 1; dx >= -Rr; dx--) ring.push([cx0 + dx, cy0 + Rr]); for (let dy = Rr - 1; dy >= -Rr + 1; dy--) ring.push([cx0 - Rr, cy0 + dy]);
    const rs0 = rset(route()), gap = ring.find(([x, y]) => rs0.has(x + ',' + y) && x === cx0 + Rr) || ring.find(([x, y]) => rs0.has(x + ',' + y));
    for (const [x, y] of ring) { if (gap && x === gap[0] && y === gap[1]) continue; H.db.insertBuilding({ type: 'fence', owner_id: 'npc_simvil_901', owner_name: '시험가', x: x * BS + 16, y: y * BS + 16, data: JSON.stringify({ floor: 0, orientation: 'NS' }) }); }
    SV.t1440Flush();
    const rG = st.routeCache.get('901_902'), gOn = gap ? rset(rG).has(gap.join(',')) : null;   // 캐시 물건(`getRoute` 는 늘 새 사본을 준다)
    const c2 = gap ? unq(R, () => claim(R, gap)) : null;
    out.ring = { gap, gOn, ask: c2 ? { ok: c2.ok, confirm: c2.confirm ? { text: c2.confirm.text, sig: c2.confirm.sig } : null, note: c2.note } : null };
    if (c2 && c2.confirm) {
      R._t1440Ok = c2.confirm.sig;
      const c3 = unq(R, () => claim(R, gap)); SV.t1440Flush();
      let col = null; try { col = H.db.db.prepare('SELECT t1440_pass FROM claims WHERE id = ?').get(c3.cl && c3.cl.dbId); } catch (e) { col = String(e.message); }
      out.pass = { ok: c3.ok, pass: c3.cl ? c3.cl.t1440pass : null, col: col && col.t1440_pass, rr: (RR.claimAt(gap[0], gap[1]) || {}).pass, on: rset(route()).has(gap.join(',')), same: st.routeCache.get('901_902') === rG };
      //   ⑬ 길이 지나는 칸의 울타리 = 길을 닫는 조각: 묻는다 → 다짐이면 놓고 표시
      const f2 = fence(R, gap);
      out.close = { ok: f2.ok, confirm: f2.confirm ? f2.confirm.text : null, note: f2.note };
      if (f2.confirm) {
        R._t1440Ok = f2.confirm.sig; const f3 = fence(R, gap), fb = fenceAt(gap[0], gap[1]);
        Object.assign(out.close, { ok2: f3.ok, data: fb ? fb.data.t1440c || null : null, marked: fb ? RR.isMarked(fb.id) : false, inS: fb ? !!RR.sGet(fb.id) : null, mk: H._t1440Mk.cell.has(RR.K(gap[0], gap[1])) });
        //   캐러밴 몸 걸음이 그 칸을 지나면 친다 · 놓은 사람 +8 · 알림 · 재료
        const g0 = new Set(H.groundItems.keys()), vp0 = R.vp; notes.length = 0;
        const from = [gap[0] - 1, gap[1]], to = [gap[0] + 1, gap[1]];
        const hit = H._t1440MarkHit(...C(from[0], from[1]), ...C(to[0], to[1]), null);
        const gi = [...H.groundItems.values()].filter((g) => !g0.has(g.id));
        out.hit = { hit, gone: fb ? !H.buildings.has(fb.id) : null, idx: H._t1440Mk.cell.has(RR.K(gap[0], gap[1])), vp: R.vp - vp0, note: lastNote(), ground: gi.map((g) => g.item), again: H._t1440MarkHit(...C(from[0], from[1]), ...C(to[0], to[1]), null) };
        //   다시 놓기 — 또 표시 · 또 +8(쌓인다)
        R._t1440Ok = H._t1440Sig(RR.pieceCell(gap[0], gap[1])); const f4 = fence(R, gap), fb2 = fenceAt(gap[0], gap[1]);
        const vp1 = R.vp; if (fb2) H._t1440MarkHit(...C(from[0], from[1]), ...C(to[0], to[1]), null);
        out.again = { ok: f4.ok, marked: fb2 ? !!(fb2.data && fb2.data.t1440c) : null, vp2: R.vp - vp1, vpTot: R.vp };
      }
    }
    //   ⑫c 길 위 칸 선포 고름(판정 51) — Q 가 들 가운데 길 칸을 고름 없이 → 묻는다 · 그다음 "그대로 둠"
    {
      const kc = [row[0] + 26, yOn(row[0] + 26)], rK = st.routeCache.get('901_902'), j0 = RR.stats().judge, k0 = Object.assign({}, H._t1440Zs.road);
      const a1 = claim(Q, kc, null), j1 = RR.stats().judge;
      out.keep = { at: kc, on: rset(route()).has(kc.join(',')), ask: { ok: a1.ok, choose: a1.choose ? { sig: a1.choose.sig, text: a1.choose.text, text2: a1.choose.text2, msg: !!a1.choose.msg } : null, note: a1.note, judge: j1 - j0 } };
      if (a1.choose) {
        const a2 = claim(Q, kc, 'keep:' + a1.choose.sig); SV.t1440Flush();
        let col = null; try { col = H.db.db.prepare('SELECT t1440_pass FROM claims WHERE id = ?').get(a2.cl && a2.cl.dbId); } catch (e) { col = String(e.message); }
        notes.length = 0; H._t1440PeekMsg(P, { what: 'cell', cx: kc[0], cy: kc[1], key: 'kk' });
        out.keep.k = { ok: a2.ok, pass: a2.cl ? a2.cl.t1440pass : null, col: col && col.t1440_pass, rr: (RR.claimAt(kc[0], kc[1]) || {}).pass, judge: RR.stats().judge - j1, same: st.routeCache.get('901_902') === rK, still: rset(route()).has(kc.join(',')), note: a2.note,
          notes: a2.notes, peek: (notes.find((m) => m.type === 't1440_peek' && m.key === 'kk') || {}).st || null, road: { ask: H._t1440Zs.road.ask - k0.ask, keep: H._t1440Zs.road.keep - k0.keep, keepCells: H._t1440Zs.road.keepCells - k0.keepCells } };
      }
    }
    //   ⑬ 주인 없는 땅의 길 위 울타리(⑪ P 의 것)도 캐러밴이 친다 — +8 · 다른 알림
    if (f1) {
      const vp0 = P.vp; notes.length = 0; const yy = Math.floor(f1.y / BS), xx = Math.floor(f1.x / BS);
      const hit = H._t1440MarkHit(...C(xx - 1, yy), ...C(xx + 1, yy), null);
      out.hitU = { hit, gone: !H.buildings.has(f1.id), vp: P.vp - vp0, note: lastNote(), row: H._t1440Row.has(f1.id) };
    }
    //   ⑭ 길 확인 중 — 선포 판정 한 몫을 비운다(첫 부름은 안 민다) → 줄 · 알림 → 틱이 민다 → 같은 메시지를 다시
    const sp = [row[0] + 44, yOn(row[0] + 44)];
    const _step = SV.t1440Step; let skip = 1; SV.t1440Step = function (job, b) { if (skip > 0) { skip--; return false; } return _step(job, b); };
    notes.length = 0; at(S2, sp);
    const raw = Buffer.from(JSON.stringify({ type: 'claim', kind: 'temporary', t1440road: 'avoid:' + H._t1440Sig(RR.pieceCell(sp[0], sp[1])) }));   // 판정 51 — 기본 고름(비켜 가게)을 실은 메시지
    const w0 = S2.inventory.wood;
    try { H.handlePlayerInput(S2, raw); } catch (e) { out.pendErr = String(e.stack).slice(0, 300); }
    const q0 = H._t1440Q.length, n0 = lastNote(), had = !!claimAtC(sp[0], sp[1]);
    H._t1440Tick();
    SV.t1440Step = _step;
    out.pend = { at: sp, q0, note: n0, had, after: !!claimAtC(sp[0], sp[1]), q1: H._t1440Q.length, done: H._t1440Zs.pendDone, used: w0 - S2.inventory.wood };
    //   미리보기 — 길 칸(주인 없는 땅) · 길 밖 · 길이 지나는 칸
    const rk = route(); let onR = null;
    if (rk) for (const [x, y] of rcells(rk)) if (!onR && x === row[0] + 52) onR = [x, y];
    notes.length = 0;
    if (onR) H._t1440PeekMsg(P, { what: 'cell', cx: onR[0], cy: onR[1], key: 'k1' });
    H._t1440PeekMsg(P, { what: 'cell', cx: row[0] + 52, cy: (onR ? onR[1] : row[1]) + 11, key: 'k2' });
    if (gap) H._t1440PeekMsg(P, { what: 'cell', cx: gap[0], cy: gap[1], key: 'k3' });
    out.peek = notes.filter((m) => m.type === 't1440_peek').map((m) => [m.key, m.st]);
    //   ⑮ 사유지 안에서 다시 세우기 = 판정 0 · 내놓으면 남은 구조물 = 주인 없는 것 · 알림
    {
      const j0 = RR.stats().judge, a0 = H._t1440Zs.ask, ids0 = new Set(H.buildings.keys()); notes.length = 0; at(P, pc);
      P._t1440Msg = { type: 'place_building', itemType: 'item_wall' };
      let ok = false; try { ok = !!H._tryBuildAt(P, 'wall', 0, 'N', null, { skipCost: true }); } catch (e) { out.inErr = String(e.stack).slice(0, 300); }
      const w = [...H.buildings.values()].find((b) => !ids0.has(b.id) && b.type === 'wall'), wr = w ? H._t1440Row.get(w.id) : null;
      out.inside = { ok, judge: RR.stats().judge - j0, ask: H._t1440Zs.ask - a0, cls: wr ? wr.cls : null, note: lastNote() };
      const cl = claimAtC(pc[0], pc[1]); notes.length = 0;
      if (cl) { try { H.tryUnclaim(P, cl.id, true); } catch (e) { out.unErr = String(e.stack).slice(0, 300); } }
      out.inside.un = { gone: !claimAtC(pc[0], pc[1]), cls: w ? (H._t1440Row.get(w.id) || {}).cls : null, notes: allNotes() };
    }
    //   T1238 벌점 문 — 닫는 조각 · 길 위 주인 없는 것 = 벌점 0 · 마을 땅 위 닫는 조각은 그 마을 사람이 아니면 벌점(T1238 켬 판에서만 그 문이 선다)
    if (H.T1238_ON) {
      const mk = (c, data) => { const dbId = H.db.insertBuilding({ type: 'fence', owner_id: 'test_P', owner_name: 'P', x: c[0] * BS + 16, y: c[1] * BS + 16, data: JSON.stringify(data) }); const b = { id: 'b' + dbId, dbId, type: 'fence', ownerId: 'test_P', ownerName: 'P', x: c[0] * BS + 16, y: c[1] * BS + 16, data, floor: 0 }; H.buildings.set(b.id, b); return b; };
      const run1 = (b) => { const cost = H._t1238FenceCost(Q, b, []); notes.length = 0; const v0 = Q.vp; H._t1238FenceApply(Q, b, cost, 'break'); return { cost, vp: Q.vp - v0, note: lastNote() }; };
      const bm = mk([row[0] + 50, row[1] + 9], { floor: 0, orientation: 'NS', t1440c: { by: 'test_P', d: 5, why: 'close' } });
      const ro = rcells(route()).find(([x]) => x === row[0] + 56), bu = ro ? mk(ro, { floor: 0, orientation: 'NS' }) : null;
      const bv = mk([row[0] + 50, row[1] + 10], { floor: 0, orientation: 'NS', t1440c: { by: 'test_P', d: 5, why: 'close', vil: 901 } });
      out.t1238 = { mark: run1(bm), road: bu ? run1(bu) : null, vil: run1(bv), vilMember: (() => { Q.member = { vid: 901 }; const c = H._t1238FenceCost(Q, bv, []); Q.member = null; return c; })() };
    }
  } else if (row) {
    //   ㉰ 끔 — 같은 자리 울타리
    const mid = [row[0] + 32, row[1]];
    out.offFence = fence(P, mid);
    out.offMod = !!H.RoadRule;
  }
  out.zs = H._t1440Zs ? Object.assign({}, H._t1440Zs, { pendTicks: undefined }) : null;
  out.waited = waited;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

if (process.argv[2] === '--vil') return vilChild(process.argv[3]);
if (process.argv[2] === '--zone') return zoneChild(process.argv[3]);

// ── 부모 ──────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${name}${info ? ' — ' + info : ''}`); };
const run = (mode, bait, env) => {
  const r = spawnSync(process.execPath, ['--experimental-sqlite', __filename, mode, bait || '-'], { cwd: ROOT, encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20,
    env: Object.assign({}, process.env, { T1440_ROAD_RULE: '', T1423_NO_BUILD: '', T1423_BLOCK_REACT: '' }, env || {}) });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `rc ${r.status} · ${String(r.stderr || '').slice(-900)}` };
  return JSON.parse(line.slice(2));
};
const ON = { T1440_ROAD_RULE: '1', T1423_NO_BUILD: '1' };
const M = run('--vil', '-', ON);
console.log(`[㉮ 마을 · 꾸민 세계] ${M.err || ''}  처음 길 ${JSON.stringify(M.first || null)}`);
const mFree = (m) => !!(m && m.free && m.free.v === 'free' && m.free.touch === 0);
const mU = (m) => !!(m && m.u && m.u.same === true && m.u.clear === true && m.u.onU === true && m.u.drops.length === 0 && m.u.fresh === true && m.u.step1 >= 1);
const mC3 = (m) => !!(m && m.c3 && m.c3.v === 'protected' && m.c3.step.join() === '1' && m.c3.avoid === true && m.c3.pass === 0);
const mC3b = (m) => !!(m && m.c3b && m.c3b.v === 'protected' && m.c3b.step.join() === '2' && m.c3b.avoid === true && m.c3b.overU.length >= 1);
const mC3c = (m) => !!(m && m.c3c && m.c3c.same === true && m.c3c.v === 'protected' && m.c3c.step.join() === '1' && m.c3c.avoid === true && m.c3c.overU.length === 0);
const mOld = (m) => !!(m && m.old && m.old.olds && m.old.ov.join() === 'free,free' && m.old.v === 'yield' && m.old.pass.length >= 1 && m.old.others.length === 0 && m.old.oPass.join() === 'false,false' && m.old.through.every((y) => !m.old.olds.includes(y)) && m.old.clear);
const mVil = (m) => !!(m && m.vil && m.vil.olds && m.vil.v === 'protected' && m.vil.step.join() === '3' && m.vil.others.length === 1 && m.vil.pass.join() === 'false,true' && m.vil.through.join() === String(m.vil.olds[1]) && m.vil.ratio <= 3);
const mPart = (m) => !!(m && m.part && m.part.cdSame && m.part.efSame && m.part.cdFirst === m.first.len['3_4'] && m.part.drops.length >= 1 && m.part.drops.every((k) => k === '1_2') && m.part.avoid === true);
const mGrad = (m) => !!(m && m.grad && m.grad.closeAt != null && m.grad.maxProt <= 3 + 1e-9 && m.grad.endRatio != null && m.grad.endRatio <= 3 + 1e-9);
ok(mFree(M), '① 길에 안 닿는 조각 = 판정 0(free · 닿은 쌍 0)', JSON.stringify(M.free));
ok(mU(M), '② 주인 없는 땅의 구조물 — 저장된 길은 안 비킨다(같은 줄 · 그 칸을 지난다 · 버린 쌍 0) · 처음부터 다시 구하면 첫째 걸음이 비킨다', JSON.stringify(M.u));
ok(mC3(M), '③ 사유지 선포(마을 밖) — 들 가운데 = 걸음 1 로 보호(새 길이 그 칸을 안 지난다)', JSON.stringify(M.c3));
ok(mC3b(M), '③b 목의 나머지 칸이 주인 없는 구조물 = 걸음 2 로 보호(새 길이 그 구조물 위로 — 캐러밴이 친다)', JSON.stringify(M.c3b));
ok(mC3c(M), '③c 사유지 칸 위아래가 주인 없는 구조물 = 걸음 1 이 그 둘까지 비켜 간다(첫째 걸음이 먼저 · 저장된 길은 그 둘에 안 비켰다)', JSON.stringify(M.c3c));
ok(mOld(M), '④ 먼저 잡은 사유지 처지 바뀜 0 — 나중에 잡은 세 칸이 내준다(길이 지나는 칸) · 먼저 잡은 두 칸은 그대로 · 길은 먼저 것을 안 지난다', JSON.stringify(M.old));
ok(mVil(M), '⑤ 마을 건물(걸음 5 까지) — 목을 막으면 걸음 3: 마을 밖 사유지 가운데 나중 것 하나만 길을 내준다(먼저 것 그대로 · 3배 안)', JSON.stringify(M.vil));
ok(mPart(M), '⑥ 부분 무효화 — 마을 것이 선 칸을 지나던 쌍(가 ↔ 나)만 버림 · 먼 쌍 길은 같은 물건 · 처음 길 그대로 · 새 길은 그 칸을 안 지난다', JSON.stringify(M.part));
ok(mGrad(M), '⑦ 3배의 기준 = 처음 길 — 사유지 줄을 늘리다 처음 길의 3배를 넘는 첫 선포가 내준다(길이 지나는 칸) · 보호된 동안 비 ≤ 3', JSON.stringify(M.grad));
const rp = (M.rep || []).filter((r) => r.r != null);
ok(rp.length >= 5 && rp.every((r) => r.r <= 1.05), '⑧ 줄기 고쳐 잇기 ↔ 쌍 전체 다시 구하기 — 걸음 1 보호 판정의 길이 비(고쳐 잇기 ÷ 전체 ≤ 1.05)', `${rp.length}건 · 비 ${JSON.stringify(rp.map((r) => r.r))}`);
ok(M.mid && M.mid.blocked === true && M.mid.claimStop === 1 && M.mid.stopX < 55 && M.mid.reroute === 1 && M.mid.iso === 0 && M.mid.fail === 0 && M.mid.clear && M.mid.back === false && M.mid.end[0] === 90 * 32 + 16,
  '⑨ 가는 도중 새로 선포된 사유지 — 그 앞에서 선다 → 그 자리에서 다시 구해 잇는다(되돌아오지 않는다 · 고립 귀환 0 · 새 길이 사유지를 안 지난다)', JSON.stringify(M.mid));
ok(M.site && M.site.n1 === true && M.site.field === false && M.site.fieldAvoid === true, '⑩ NPC 마을 터(걸음 2 까지) — 목(N1)을 덮는 터 = 안 고른다 · 들 가운데 터 = 보호(새 길이 그 터를 안 지난다)', JSON.stringify(M.site));
const mThru = (m) => !!(m && m.thru && m.thru.b1 === true && m.thru.at1 < 227 && m.thru.claimStop === 1 && m.thru.rerouteFail === 1 && m.thru.thru === 1 && m.thru.b2 === false && m.thru.end === true);
ok(mThru(M), '⑨b 가는 도중 사유지 앞에서 섰는데 비키는 길이 없다(목적 마을 둘레 사유지 고리) — 이 구간은 사유지를 걸어 지난다(다시 안 선다 · 끝까지 닿는다)', JSON.stringify(M.thru));
const mBody = (m) => !!(m && m.body && m.body.linked === true && m.body.phys === 0 && m.body.rock === 0 && m.body.blocked === false && m.body.stepHit === 0 && m.body.end === true);
const mWalk = (m) => !!(m && m.walk && m.walk.yr != null && m.walk.abClear === true && m.walk.n >= 2 && m.walk.hit === 0 && m.walk.clear === true);
ok(mBody(M), '⑯ 몸 길 잇기(T1320) — 잠든 청크에서도 구조물 표를 본다: 바위 막대를 넘는 짧은 우회 자리의 마을 울타리를 비켜 잇고(바위 0 · 울타리 0) · 몸이 끝까지 걸어도 안 선다', JSON.stringify(M.body));
const Z = run('--zone', '-', ON);
console.log(`[㉯ 존 켬 · 한반도] ${Z.err || ''}  들 ${JSON.stringify(Z.row)} · 길 ${JSON.stringify(Z.route)}`);
ok(Z.u && Z.u.b1 && Z.u.b1.ok && !Z.u.b1.confirm && /^여기는 길입니다\. 사유지가 아닌 땅의 길 위에 세운 것은 누구든 치울 수 있습니다\.$/.test(Z.u.b1.note || '') && Z.u.row === 'U' && Z.u.m1 === true && Z.u.m2 === false && Z.u.same && Z.u.on
  && Z.u.peek && Z.u.peek.length === 2 && Z.u.peek[1][1] === 'free' && Z.dmg && Z.dmg.back === true && (Z.dmg.t1238 ? Z.dmg.inS === false : Z.dmg.inS === true) && Z.wall && Z.wall.ok && Z.wall.m1 === true && Z.wall.m2 === false,
  '⑪ 주인 없는 땅의 길 위 울타리 — 알림 한 줄(하십시오체) · 표 U(첫째 걸음만 막는다) · 저장된 길 그대로 · 부서지면 빠진다 · 벽 = 변(U)', JSON.stringify({ u: Z.u, dmg: Z.dmg, wall: Z.wall }));
ok(Z.claimP && Z.claimP.ok && Z.claimP.prot === 1 && Z.claimP.pass === false && Z.claimP.avoid === true, '⑫ 사유지 선포(임시 사유지 문 그대로) — 들 가운데 길 칸 = 보호(새 길이 그 칸을 안 지난다)', JSON.stringify(Z.claimP));
ok(Z.ring && Z.ring.gap && Z.ring.gOn && Z.ring.ask && !Z.ring.ask.ok && Z.ring.ask.confirm && /^이 자리는 길이 지나는 칸입니다\. 선포하면 길이 그대로 1칸을 지나고, 그 칸에 세운 막는 것은 길을 닫는 조각이 됩니다\./.test(Z.ring.ask.confirm.text) && Z.pass && Z.pass.ok && Z.pass.pass === 1 && Z.pass.col === 1 && Z.pass.rr === true && Z.pass.on && Z.pass.same,
  '⑫ 마을 것 고리의 마지막 틈 — 선포가 내준다: 미리 묻는다(하십시오체) → 다짐이면 선포 + 길이 지나는 칸(저장 칸 하나 · 길 그대로)', JSON.stringify({ ring: Z.ring, pass: Z.pass }));
ok(Z.close && !Z.close.ok && /길이 지나는 칸입니다/.test(Z.close.confirm || '') && Z.close.ok2 && Z.close.data && Z.close.data.why === 'close' && Z.close.marked && Z.close.inS === false && Z.close.mk
  && Z.hit && Z.hit.hit && Z.hit.gone && Z.hit.idx === false && Z.hit.vp === 8 && /길을 막은 것을 .* 캐러밴이 부수고 지나갔습니다/.test(Z.hit.note || '') && Z.hit.ground.length === 1 && Z.hit.again === false && Z.again && Z.again.ok && Z.again.marked && Z.again.vp2 === 8 && Z.again.vpTot === 16
  && Z.hitU && Z.hitU.hit && Z.hitU.gone && Z.hitU.vp === 8 && /길 위에 세운 것을 .* 캐러밴이 부수고 지나갔습니다/.test(Z.hitU.note || '') && Z.hitU.row === false,
  '⑬ 길이 지나는 칸의 울타리 = 길을 닫는 조각(묻는다 · 표시 · 표 밖) · 캐러밴 걸음이 친다(재료 · +8 · 알림 · 두 번 못 친다) · 다시 놓으면 또 +8 · 주인 없는 땅의 길 위 울타리도 친다', JSON.stringify({ close: Z.close, hit: Z.hit, again: Z.again, hitU: Z.hitU }));
ok(Z.pend && Z.pend.q0 === 1 && /길을 확인하고 있습니다/.test(Z.pend.note || '') && !Z.pend.had && Z.pend.after && Z.pend.q1 === 0 && Z.pend.done >= 1 && Z.pend.used === 1
  && Z.peek && Z.peek.length === 3 && Z.peek[0][1] === 'road' && Z.peek[1][1] === 'free' && Z.peek[2][1] === 'closing',
  '⑭ 길 확인 중 — 선포 판정이 한 몫에 안 끝나면 줄 · 알림 → 틱이 민다 → 같은 메시지로 선포 · 미리보기 = 서버 답(길 위 road · 길 밖 free · 길이 지나는 칸 closing)', JSON.stringify({ pend: Z.pend, peek: Z.peek, err: Z.pendErr }));
const zKeep = (z) => {
  const k = z && z.keep; if (!k || !k.ask || !k.k) return false;
  const a = k.ask, b = k.k;
  return k.on === true && a.ok === false && a.judge === 0 && !!a.choose && a.choose.msg === true
    && /^이 칸에는 길이 지나갑니다\. 비켜 가게 할까요\(기본\), 길을 그대로 둘까요\?$/.test(a.note || '')
    && /^이 칸에는 길이 지나갑니다\. 비켜 가게 할까요\(기본\)\?/.test(a.choose.text || '') && /^길을 그대로 둘까요\?/.test(a.choose.text2 || '')
    && b.ok === true && b.pass === 1 && b.col === 1 && b.rr === true && b.judge === 0 && b.same === true && b.still === true && b.peek === 'closing'
    && (b.notes || []).some((t) => /^길을 그대로 둡니다\./.test(t)) && !!b.road && b.road.ask === 1 && b.road.keep === 1 && b.road.keepCells === 1;
};
ok(zKeep(Z), '⑫c 길 위 칸 선포는 그 순간 한 번 고른다(판정 51 · 기본 = 비켜 가게) — 고름 없이 오면 묻는다(알림 · 두 줄 물음 · 선포 0 · 판정 0) · 그대로 둠 = 판정 없이 길이 지나는 칸(저장 칸 · 길 같은 물건 · 미리보기 closing)', JSON.stringify(Z.keep));
const zIn = (z) => !!(z && z.inside && z.inside.ok && z.inside.judge === 0 && z.inside.ask === 0 && z.inside.cls === 'P' && z.inside.un && z.inside.un.gone && z.inside.un.cls === 'U' && z.inside.un.notes.includes('이 칸을 내놓으면 길이 이 자리로 돌아올 수 있습니다.'));
ok(zIn(Z), '⑮ 사유지 안에서 다시 세우기 = 판정 0(물음 0) · 내놓으면 남은 벽 = 주인 없는 것(U) · 처음 길이 지나던 칸이면 알림 한 줄', JSON.stringify({ inside: Z.inside, err: Z.inErr || Z.unErr }));
const Zt = run('--zone', '-', Object.assign({ T1207_TERR_REAL: '1', T1238_TERR_V2: '1' }, ON));
ok(Zt.t1238 && Zt.t1238.mark.cost && Zt.t1238.mark.cost.vp === 0 && Zt.t1238.mark.vp === 0 && /길을 막은 것이라 벌점 없이 허물었습니다/.test(Zt.t1238.mark.note || '')
  && Zt.t1238.road && Zt.t1238.road.vp === 0 && /길 위에 세운 것이라 벌점 없이 허물었습니다/.test(Zt.t1238.road.note || '') && Zt.t1238.vil.vp > 0 && Zt.t1238.vilMember && Zt.t1238.vilMember.vp === 0,
  '⑬b T1238 벌점 문(켬 판) — 닫는 조각 · 길 위 주인 없는 울타리는 누가 부숴도 벌점 0 · 마을 땅 위 닫는 조각은 그 마을 사람만 0', JSON.stringify(Zt.t1238 || Zt.err));
const Zo = run('--zone', '-', {});
ok(Zo.on === false && Zo.offFence && Zo.offFence.ok && !Zo.offFence.confirm && Zo.offMod === false && Zo.zs && Zo.zs.gate && Object.keys(Zo.zs.gate).length === 0, '㉰ 끔 — 같은 자리 울타리가 그냥 선다 · 판정 0 · 길 규칙 모듈 안 실음', JSON.stringify({ on: Zo.on, offFence: Zo.offFence, mod: Zo.offMod, err: Zo.err }));
//   미끼(바꾼 자리 = 원본에서 앵커가 나온 수 · 아이도 1 이 아니면 멈춘다)
const nB = (k) => LB.count(fs.readFileSync(BAITS[k].file, 'utf8'), BAITS[k].at[0]);
const b1 = run('--vil', 'uAvoid', ON);
ok(!b1.baitErr && nB('uAvoid') === 1 && !mU(b1), '미끼 ㉠ 주인 없는 구조물을 길이 비켜 가는 사본 → ② 빨강', b1.baitErr || `바꾼 자리 ${nB('uAvoid')} · ② ${mU(b1)} · ${JSON.stringify(b1.u)}`);
const b2 = run('--vil', 'noStep1', ON);
ok(!b2.baitErr && nB('noStep1') === 1 && !mC3c(b2), '미끼 ㉡ 첫째 걸음 없이 남의 구조물 위로 길을 모는 사본 → ③c 빨강', b2.baitErr || `바꾼 자리 ${nB('noStep1')} · ③c ${mC3c(b2)} · ${JSON.stringify(b2.c3c)}`);
const b3 = run('--vil', 'oldPass', ON);
ok(!b3.baitErr && nB('oldPass') === 1 && !mOld(b3), '미끼 ㉢ 먼저 잡은 사유지가 길이 지나는 칸으로 바뀌는 사본 → ④ 빨강', b3.baitErr || `바꾼 자리 ${nB('oldPass')} · ④ ${mOld(b3)} · ${JSON.stringify(b3.old)}`);
const b4 = run('--vil', 'fullClear', ON);
ok(!b4.baitErr && nB('fullClear') === 1 && !mPart(b4), '미끼 ㉣ 전부 버리는 무효화 사본 → ⑥ 빨강', b4.baitErr || `바꾼 자리 ${nB('fullClear')} · ⑥ ${mPart(b4)} · ${JSON.stringify(b4.part)}`);
const b5 = run('--vil', 'curBase', ON);
ok(!b5.baitErr && nB('curBase') === 1 && !mGrad(b5), '미끼 ㉤ 3배 기준이 지금 길인 사본(조금씩 넓혀 3배를 넘긴다) → ⑦ 빨강', b5.baitErr || `바꾼 자리 ${nB('curBase')} · ⑦ ${mGrad(b5)} · ${JSON.stringify(b5.grad)}`);
const b6 = run('--zone', 'privJudge', ON);
ok(!b6.baitErr && nB('privJudge') === 1 && !zIn(b6), '미끼 ㉥ 사유지 안에서 다시 세울 때 판정이 도는 사본 → ⑮ 빨강', b6.baitErr || `바꾼 자리 ${nB('privJudge')} · ⑮ ${zIn(b6)} · ${JSON.stringify(b6.inside)}`);
ok(mWalk(M), '⑰ 걷는 길 다듬기가 칸 사이 변(벽)을 본다 — 길을 가로지르는 마을 벽 줄: 코스 길 · 걷는 길이 벽 끝을 돌고 다듬은 곧은 줄도 벽을 안 가로지른다(몸 걸음 자 0)', JSON.stringify(M.walk));
const b7 = run('--vil', 'bodyLink', ON);
ok(!b7.baitErr && nB('bodyLink') === 1 && !mBody(b7), '미끼 ㉦ 몸 길 잇기가 구조물 표를 안 보는 사본 → ⑯ 빨강', b7.baitErr || `바꾼 자리 ${nB('bodyLink')} · ⑯ ${mBody(b7)} · ${JSON.stringify(b7.body)}`);
const b8 = run('--vil', 'walkEdge', ON);
ok(!b8.baitErr && nB('walkEdge') === 1 && !mWalk(b8), '미끼 ㉧ 걷는 길 다듬기가 칸만 보는 사본 → ⑰ 빨강', b8.baitErr || `바꾼 자리 ${nB('walkEdge')} · ⑰ ${mWalk(b8)} · ${JSON.stringify(b8.walk)}`);
const b10 = run('--zone', 'keepDeaf', ON);
ok(!b10.baitErr && nB('keepDeaf') === 1 && !zKeep(b10), '미끼 ㉩ 길 위 칸 선포에서 그대로 둠을 안 듣는 사본 → ⑫c 빨강', b10.baitErr || `바꾼 자리 ${nB('keepDeaf')} · ⑫c ${zKeep(b10)} · ${JSON.stringify(b10.keep)}`);
const b9 = run('--vil', 'claimThru', ON);
ok(!b9.baitErr && nB('claimThru') === 1 && !mThru(b9), '미끼 ㉨ 비키는 길이 없어도 사유지 앞에서 또 서는 사본 → ⑨b 빨강', b9.baitErr || `바꾼 자리 ${nB('claimThru')} · ⑨b ${mThru(b9)} · ${JSON.stringify(b9.thru)}`);
console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
