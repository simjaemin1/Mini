#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 8   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1466-road-fast.js — 길목 선포의 길 확인을 1초 안으로(T1466 · 손잡이 `T1466_ROAD_FAST` 끔 기본 · `T1440_ROAD_RULE` 켬 위에서만 뜻) ====
//
// ★왜 [지시 T1466 · ★재민 11-23 "64초..? 미쳤나.. 더 짧게 하는 게 불가능한 거야?"]
//   T1440 판정은 길목을 지나던 쌍마다 쌍 전체를 세계에서 다시 구했다(코스 A* · 직선 편향 · 꺼냄 상한 25만 · 상한이면 두 번 더) — 붐비는 목 하나에 그 A* 가 80 ~ 150번.
//   켬 = 떠나는 마을마다 한 번 훑기(㉮) + 과녁 A*(가까운 목적부터 · 길잡이 하한 · 못 닿는 주머니는 거꾸로 훑기로 빨리 · 걸음 2 격자 데우기 · 칸마다 방향 바이트 · 칸 값)(㉱).
// 판(운영 함수 그대로 · 사본 0 — 꾸민 세계 240×400 칸: 바위 띠 x 100 ~ 107 · 목 둘 NA y 150 ~ 154 · NB y 200 ~ 204 · 두께 4 칸 벽 주머니 x 20 ~ 59 · y 320 ~ 359 · 윗벽 틈 x 36 ~ 43):
//   ① 답 같음 — 같은 판정 넷(NA 통째 사유지 · NB 통째 마을 건물 · 들 한 칸 · NA 통째 NPC 터)을 끔(T1440) · 켬(T1466)에서 — 판정 · 남의 사유지 내줌 · 길이 지나는 칸 · 걸음 같음 · 쌍마다 새 길 길이(1 % 안)
//   ② 못 돎 빨리 — 주머니 틈을 막는 사유지: 주머니 안 마을 둘로 가는 쌍(떠나는 마을 = 밖) — 내줌 · 거꾸로 훑기가 주머니를 다 돌아 끝(앞 꺼냄이 지도의 1/4 아래)
//   ③ 걸음 2 데우기는 주인 없는 구조물 둘레를 안 옮긴다 — NB 를 주인 없는 울타리로 막고 NA 를 사유지로 막으면 걸음 2 가 NB 위로 지킨다(끔과 같은 답)
//   ④ 접은 지도(방향 바이트 · 칸 값)는 구조물이 서면 그 자리를 비운다 — NB 에 마을 것이 서면 그 코스 칸 바이트 = 빔
//   ⑤ 3배 — P ↔ Q(짧은 쌍 · NA 를 막으면 NB 로 3배 넘게) = 내줌(끔과 같은 답)
//   ⑥ 기억한 답 — 세계가 그대로면 다시 쓴다 · 그 조각에 새 쌍이 닿으면 버린다(T1440 낡음은 못 본다)
//   ⑦ 틱을 막지 않는다 — 몫(0.02 ms)마다 나오고 몫을 이어 같은 답
//   ⑧ 끈 판 — 훑기 0 · 길잡이 굽기 0 · 판정 물건에 팔 없음(① 의 끔 아이)
//   ⑨ 길잡이 하한 = 다익스트라와 같은 값(같은 판정을 ㉮ · ㉱ 로 — 목적마다 거리 합 같음) · 지형이 열리면(칸 없는 무효화) 표를 내린다
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ㉠ T1440 과 다른 답을 내는 사본(한 번 훑기가 걸음을 하나 건너뛴다) → ① 빨강 · ㉡ 걸음 2 데우기가 U 둘레까지 옮기는 사본 → ③ 빨강 ·
//     ㉢ 구조물이 서도 접은 지도를 안 비우는 사본 → ④ 빨강 · ㉣ 3배를 넘겨 지키는 사본 → ⑤ 빨강 · ㉤ 세계가 바뀐 뒤에도 기억한 답을 쓰는 사본 → ⑥ 빨강 ·
//     ㉥ 판정이 몫을 안 지키는 사본(틱을 16 ms 넘게 막는다) → ⑦ 빨강 · ㉦ 끈 판이 다른 사본(끔에서도 훑는다) → ⑧ 빨강 · ㉧ 지형이 열려도 길잡이 표를 쓰는 사본 → ⑨ 빨강
// 실행: node scripts/test-t1466-road-fast.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const LB = require('./lib-bait');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js'), RFILE = path.join(ROOT, 'server', 'road-rule.js');
const BAITS = {
  noPiece: { file: VFILE, at: ["  RoadRule.sAdd('__t1440tmp', S.piece, 'V'); _t1440ForgetPiece(S.piece);\n  try { _t1440Mode(S.mode, () => _t1466Run(S, c0, budgetMs), S.M); }", "  /* 미끼 ㉠ — 조각을 안 넣고 훑는다 */\n  try { _t1440Mode(S.mode, () => _t1466Run(S, c0, budgetMs), S.M); }"] },
  warmAll: { file: VFILE, at: ['    if (mask[i]) continue;\n    if (R2.blk[i] === 0 && R1.blk[i] !== 0)', '    /* 미끼 ㉡ — U 둘레까지 옮긴다 */\n    if (R2.blk[i] === 0 && R1.blk[i] !== 0)'] },
  maskStale: { file: VFILE, at: ['      if (R._t1466m) { R._t1466m[i] = -1; R._t1466c1[i] = -1; R._t1466c2[i] = -1; }', '      /* 미끼 ㉢ — 접은 지도를 안 비운다 */'] },
  triple: { file: RFILE, at: [['        if (p2 && plen(p2) <= MULT * base) { ok(m, t.s, p2, M); job.fs.keys.add(m.key); }', '        if (p2 && plen(p2) <= MULT * 3 * base) { ok(m, t.s, p2, M); job.fs.keys.add(m.key); }   /* 미끼 ㉣ — 3배를 넘겨 지킨다 */'],
    ['seen.add(other); const eb = MULT * _base(o.key, o.pts);', 'seen.add(other); const eb = MULT * 3 * _base(o.key, o.pts); /* 미끼 ㉣ */']] },
  memoOld: { file: RFILE, at: ['  if (now.length !== had.length) return true;', '  if (false) return true;   /* 미끼 ㉤ — 새로 닿은 쌍을 안 본다 */\n  return false;'] },
  noSlice: { file: VFILE, at: ['      if ((++n & 255) === 0 && budgetMs > 0 && _t1440Cpu() - c0 >= budgetMs) return;   // 몫 = 꺼냄 256 번마다 CPU 를 본다\n      if (AS && S.rr) {', '      /* 미끼 ㉥ — 몫을 안 지킨다 */\n      if (AS && S.rr) {'] },
  offFast: { file: VFILE, at: ["return (T1440_ROAD_RULE && v && v !== '0') ? (v === '1' ? 'ad' : v) : ''; })();", "return T1440_ROAD_RULE ? 'ad' : ''; })();   /* 미끼 ㉦ — 끔에서도 훑는다 */"] },
  landKeep: { file: VFILE, at: ["  if (T1466_ROAD_FAST) _t1466ForgetAll('terrain');", "  /* 미끼 ㉧ — 지형이 열려도 길잡이 표를 쓴다 */"] },
};
function baitHook(name) {
  const bait = name && name !== '-' ? BAITS[name] : null; if (!bait) return;
  const Module = require('module'), _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === bait.file) {
      for (const [a, b] of Array.isArray(bait.at[0]) ? bait.at : [bait.at]) {   // 자리 여럿이면 차례로(자리마다 꼭 한 번)
        const n = content.split(a).length - 1;
        if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); }
        content = content.replace(a, b);
      }
    }
    return _c.call(this, content, filename);
  };
}
const plen = (p) => { let L = 0; for (let i = 1; i < (p || []).length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return L; };
// ── 아이(꾸민 세계) ──────────────────────────────────────────────────────────────────
function child(scen, bait) {
  process.env.ENABLE_VILLAGES = '0'; process.env.T1440_ROAD_RULE = '1';
  baitHook(bait);
  const _log = console.log; console.log = () => {};
  const V = require(VFILE), RR = require(RFILE), T = V.__t1440;
  const SZ = 32, W = 240, H = 400, K = RR.K;
  const NA = [150, 154], NB = [260, 264];
  const band = (x, y) => x >= 100 && x <= 107 && !(y >= NA[0] && y <= NA[1]) && !(y >= NB[0] && y <= NB[1]);
  const box = (x, y) => x >= 20 && x <= 59 && y >= 320 && y <= 359 && !(x >= 24 && x <= 55 && y >= 324 && y <= 355) && !(y <= 323 && x >= 36 && x <= 43);   // 두께 4 칸 벽 · 윗벽 틈
  const terr = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || band(cx, cy) || box(cx, cy);
  const ta = { isBlocked: terr, isWater: () => false, isRock: () => false, isStream: () => false };
  const ZONE = { zoneWidth: W * SZ, zoneHeight: H * SZ };
  const mkV = (dbId, name, cx, cy) => ({ dbId, name, ccx: cx, ccy: cy, econ: { name, npcs: [] }, npcPids: [] });
  const E = mkV(1, '가', 40, 152), F = mkV(2, '나', 200, 152), P = mkV(3, '다', 88, 152), Q = mkV(4, '라', 120, 152), Rv = mkV(5, '마', 40, 262), S = mkV(6, '바', 200, 262);
  const A = mkV(7, '사', 40, 300), Z1 = mkV(8, '아', 30, 340), Z2 = mkV(9, '자', 50, 345), G1 = mkV(10, '차', 70, 110), G2 = mkV(11, '카', 70, 196);
  const vils = [E, F, P, Q, Rv, S, A, Z1, Z2, G1, G2];
  const fdb = { rows: new Map(), upsertTradeRoute(z, k, s, j) { this.rows.set(k, j); }, deleteTradeRoute() { return 1; }, t1440FirstAll() { return []; }, t1440FirstPut() {} };
  const deps = { players: new Map(), npcs: new Set(), broadcast: () => {}, isPositionActive: () => true, isTerrainBlockedLocal: (px, py) => terr(Math.floor(px / SZ), Math.floor(py / SZ)), isBlockedByWall: (nx, ny, ox, oy) => T.stepPx(ox, oy, nx, ny), t1440MarkHit: () => false };
  T.setup({ ta, ZONE, villages: vils, byDbId: new Map(vils.map((v) => [v.dbId, v])), byEcon: new Map(vils.map((v) => [v.econ, v])), zoneId: 'test', db: fdb, world: { day: 10, caravans: [], tradeLog: [] }, caravanBodies: new Map(), deps,
    pathfind: require(path.join(ROOT, 'server', 'pathfind')), dayMs: require(path.join(ROOT, 'server', 'zone-config')).WORLD.dayLengthMs });
  const st = T.state(); st.ready = true;
  const claims = new Map();
  RR.claimsUse(function* () { for (const [id, c] of claims) yield [id, c.cells, false, c.t, c.lvl, c.pass]; });
  const pcells = (p) => { const o = p.cells.slice(); for (const e of p.edges) o.push(...RR.edgeCells(e)); return o; };
  const put = (id, p, cls) => { RR.sAdd(id, p, cls); V.t1440Touch(pcells(p), false, cls); };
  const cellsOf = (pts) => { const s = new Set(); for (let i = 1; i < (pts || []).length; i++) T.cells(pts[i - 1], pts[i], (x, y) => { s.add(K(x, y)); return false; }); return s; };
  const NAr = () => RR.pieceRect(100, NA[0], 107, NA[1]), NBr = () => RR.pieceRect(100, NB[0], 107, NB[1]);
  const judge = (p, meta, budget) => { const j = V.t1440Judge(p, meta); if (budget) { let k = 0; while (j.phase !== 'done' && k++ < 100000) V.t1440Step(j, budget); } else V.t1440Step(j, 0); return j; };
  const sum = (j) => {
    const P0 = new Set(j.piece.cells), pass = new Set(); for (const m of j.fail) for (const k of cellsOf(m.pts)) if (P0.has(k)) pass.add(k);
    const pb = []; for (const [, m] of j.passBy) for (const id of m.keys()) pb.push(String(id));
    const res = {}; for (const [k, pts] of j.res) res[k] = pts ? Math.round(plen(pts)) : null;
    let slices = 0, pops = 0, rpops = 0, pocket = 0, runs = 0, dsum = 0, land = 0; if (j.fs) for (const SS of new Set(j.fs.S.values())) { runs++; slices += SS.slices | 0; pops += SS.pops | 0; rpops += SS.rpops | 0; pocket += SS.pocket | 0; if (SS.dd) for (const x of SS.dd) dsum += x[1]; if (SS.land) land++; }
    return { v: j.verdict, pass: [...pass].sort((a, b) => a - b), pb: pb.sort(), res, step: Object.fromEntries(j.stepOf), fast: j.fast || null, fs: j.fs ? { runs, slices, pops, rpops, pocket, dsum, land } : null };
  };
  const out = { scen, knob: V.T1466_ROAD_FAST || '' };
  const onRoute = (key, x) => { const ys = []; for (const k of cellsOf(st.routeCache.get(key))) if (RR.KX(k) === x) ys.push(RR.KY(k)); ys.sort((a, b) => a - b); return [x, ys.length ? ys[ys.length >> 1] : -1]; };
  const route = (a, b) => T.getRoute(a, b);
  try {
    if (scen === 'eq') {
      route(E, F); route(P, Q); route(Rv, S);
      out.j1 = sum(judge(NAr(), { cls: 2, max: 2 }));
      out.j2 = sum(judge(NBr(), { cls: 4, max: 5 }));
      const x3 = onRoute('1_2', 70); out.x3 = x3;
      out.j3 = sum(judge(RR.pieceCell(x3[0], x3[1]), { cls: 2, max: 2, early: true }));
      out.j4 = sum(judge(NAr(), { cls: 4, max: 2, early: true, npc: true }));
      out.S = V._t1466S ? { multi: V._t1466S.multi } : null; out.L = V._t1466L ? { bakes: V._t1466L.bakes } : null;
    } else if (scen === 'pocket') {
      route(A, Z1); route(A, Z2); route(Z1, Z2);
      out.j = sum(judge(RR.pieceRect(36, 320, 43, 323), { cls: 2, max: 2 }));
      let open = 0; const R = st._route; if (R) for (let i = 0; i < R.blk.length; i++) if (R.blk[i] === 1) open++; out.open = open; out.N = R ? R.gw * R.gh : null;
    } else if (scen === 'warm2') {
      route(E, F); route(Rv, S);
      put('uNB', NBr(), 'U');
      out.j = sum(judge(NAr(), { cls: 2, max: 2 }));
    } else if (scen === 'mask') {
      route(E, F);
      out.j1 = sum(judge(NAr(), { cls: 2, max: 2 }));
      const R = st._route, gw = R.gw; let had = 0, left = 0;
      const nodes = []; for (let gy = Math.floor(NB[0] / 4); gy <= Math.floor(NB[1] / 4); gy++) for (let gx = 25; gx <= 26; gx++) nodes.push(gy * gw + gx);
      if (R._t1466m) for (const i of nodes) if (R._t1466m[i] >= 0) had++;
      put('vNB', NBr(), 'V');
      if (R._t1466m) for (const i of nodes) if (R._t1466m[i] >= 0) left++;
      out.mask = { arr: !!R._t1466m, nodes: nodes.length, had, left };
      out.j2 = sum(judge(NAr(), { cls: 2, max: 2 }));
    } else if (scen === 'triple') {
      route(P, Q);
      const f = RR.firstGet('3_4'); out.base = f ? Math.round(f.len) : null;
      out.j = sum(judge(NAr(), { cls: 2, max: 2 }));
    } else if (scen === 'memo') {
      route(E, F); route(G1, G2);
      const ef = cellsOf(st.routeCache.get('1_2')), gg = st.routeCache.get('10_11'), gc = cellsOf(gg);
      let X = null; for (const k of gc) if (ef.has(k) && (!X || Math.abs(RR.KY(k) - 152) < Math.abs(RR.KY(X) - 152))) X = k;
      out.X = X == null ? null : [RR.KX(X), RR.KY(X)];
      st.routeCache.delete('10_11');   // 차 ↔ 카 길을 잠깐 뺀다(판정 뒤에 다시 선다 — 그 조각에 새로 닿는 쌍)
      const j = judge(RR.pieceCell(RR.KX(X), RR.KY(X)), { cls: 2, max: 2, early: true });
      out.j = sum(j);
      out.m0 = { stale: RR.stale(j), memo: RR.staleMemo(j) };
      st.routeCache.set('10_11', gg);
      out.m1 = { crosses: gc.has(X), stale: RR.stale(j), memo: RR.staleMemo(j) };
    } else if (scen === 'slice') {
      route(E, F); route(P, Q);
      const a = judge(NAr(), { cls: 2, max: 2 }), b = judge(NAr(), { cls: 2, max: 2 }, 0.02);
      out.a = sum(a); out.b = sum(b);
    } else if (scen === 'land') {
      route(E, F); route(Rv, S);
      const okL = V.t1466LandStep ? V.t1466LandStep(0) : null;
      const ja = V.t1440Judge(NAr(), { cls: 2, max: 2 }); ja.fast = 'a'; V.t1440Step(ja, 0);
      const jd = V.t1440Judge(NAr(), { cls: 2, max: 2 }); jd.fast = 'ad'; V.t1440Step(jd, 0);
      out.a = sum(ja); out.d = sum(jd); out.ready0 = !!(V._t1466L && V._t1466L.ready && okL);
      V.invalidateTradeDistances();
      out.ready1 = !!(V._t1466L && V._t1466L.ready);
    }
  } catch (e) { out.err = String(e && e.stack).slice(0, 900); }
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}
if (process.argv[2] === '--child') { child(process.argv[3], process.argv[4]); return; }
// ── 어버이 ────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, why) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (why ? '\n      ' + String(why).slice(0, 1200) : '')); } };
const ON = { T1466_ROAD_FAST: '1' };
function run(scen, bait, env) {
  const r = spawnSync(process.execPath, [__filename, '--child', scen, bait || '-'], { env: Object.assign({}, process.env, { T1466_ROAD_FAST: '' }, env || {}), encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: 'no output · ' + String(r.stderr || '').slice(-900) };
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: 'bad json' }; }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lenClose = (a, b) => { const ka = Object.keys(a || {}).sort(), kb = Object.keys(b || {}).sort(); if (!same(ka, kb)) return false; return ka.every((k) => (a[k] == null && b[k] == null) || (a[k] != null && b[k] != null && Math.abs(a[k] - b[k]) <= Math.max(32, 0.01 * a[k]))); };
const eqJ = (x, y) => !!(x && y && x.v === y.v && same(x.pass, y.pass) && same(x.pb, y.pb) && same(x.step, y.step) && lenClose(x.res, y.res));
console.log('T1466 — 길목 선포의 길 확인을 1초 안으로(꾸민 세계)');
const Eoff = run('eq', '-', {}), Eon = run('eq', '-', ON);
const mEq = (on) => !!(on && !on.err && ['j1', 'j2', 'j3', 'j4'].every((k) => eqJ(Eoff[k], on[k])) && on.j1.fs && on.j1.fs.runs > 0 && on.j4.fs && on.j4.fs.runs > 0 && on.knob);
ok(!Eoff.err && Eoff.j1.v === 'yield' && Eoff.j2.v === 'protected' && Eoff.j3.v === 'protected' && Eoff.j4.v === 'yield', '판 짜임 — 끔: NA 통째 사유지 = 내줌(짧은 쌍) · NB 통째 마을 건물 = 보호 · 들 한 칸 = 보호 · NA 통째 NPC 터 = 내줌', JSON.stringify(Eoff).slice(0, 900));
ok(mEq(Eon), '① 답 같음 — 판정 넷 · 남의 사유지 내줌 · 길이 지나는 칸 · 걸음 · 쌍마다 새 길 길이(1 % 안) · 켬은 한 번 훑기로(NPC 터도)', JSON.stringify({ on: Eon, off: Eoff }).slice(0, 1500));
const mOff = (o) => !!(o && !o.err && !o.knob && o.S && o.S.multi === 0 && o.L && o.L.bakes === 0 && ['j1', 'j2', 'j3', 'j4'].every((k) => o[k] && o[k].fast === null && o[k].fs === null));
ok(mOff(Eoff), '⑧ 끈 판 — 훑기 0 · 길잡이 굽기 0 · 판정 물건에 팔 없음', JSON.stringify({ knob: Eoff.knob, S: Eoff.S, L: Eoff.L }));
const Pon = run('pocket', '-', ON), Poff = run('pocket', '-', {});
const mPocket = (p) => !!(p && !p.err && p.j && p.j.v === 'yield' && p.j.fs && p.j.fs.pocket >= 1 && p.j.fs.pops < 0.25 * p.N);
ok(mPocket(Pon) && Poff.j && Poff.j.v === 'yield' && same(Pon.j.pass, Poff.j.pass), '② 못 돎 빨리 — 주머니 틈을 막는 사유지 = 내줌(끔과 같은 칸) · 거꾸로 훑기가 주머니를 다 돌아 끝(앞 꺼냄 < 지도 1/4)', JSON.stringify({ on: Pon, off: Poff && Poff.j }).slice(0, 900));
const Won = run('warm2', '-', ON), Woff = run('warm2', '-', {});
const mWarm = (w) => !!(w && !w.err && w.j && w.j.v === 'protected' && w.j.step['1_2'] === 2);
ok(mWarm(Won) && eqJ(Woff.j, Won.j), '③ 걸음 2 데우기 — NB 를 주인 없는 울타리 · NA 를 사유지로 막으면 가 ↔ 나 는 걸음 2 로 NB 위를 지난다(끔과 같은 답)', JSON.stringify({ on: Won, off: Woff }).slice(0, 900));
const Mon = run('mask', '-', ON);
const mMask = (m) => !!(m && !m.err && m.mask && m.mask.arr && m.mask.had > 0 && m.mask.left === 0 && m.j2 && m.j2.v === 'yield');
ok(mMask(Mon), '④ 접은 지도 — NB 에 마을 것이 서면 그 코스 칸의 방향 바이트 · 칸 값이 빈다(다음 판정이 새로 센다 · NA 를 막으면 내줌)', JSON.stringify(Mon).slice(0, 900));
const Ton = run('triple', '-', ON), Toff = run('triple', '-', {});
const mTri = (t) => !!(t && !t.err && t.j && t.j.v === 'yield' && t.j.pass.length > 0);
ok(mTri(Ton) && Toff.j && Toff.j.v === 'yield' && same(Ton.j.pass, Toff.j.pass), '⑤ 3배 — 다 ↔ 라(짧은 쌍) NA 를 막으면 NB 로 3배 넘게 = 내줌 · 길이 지나는 칸(끔과 같은 칸)', JSON.stringify({ on: Ton, off: Toff && Toff.j }).slice(0, 900));
const Gon = run('memo', '-', ON);
const mMemo = (g) => !!(g && !g.err && g.m0 && g.m0.stale === false && g.m0.memo === false && g.m1 && g.m1.crosses && g.m1.stale === false && g.m1.memo === true);
ok(mMemo(Gon), '⑥ 기억한 답 — 세계 그대로 = 다시 쓴다 · 그 조각에 새 쌍(차 ↔ 카)이 닿으면 버린다(T1440 낡음은 못 본다)', JSON.stringify(Gon).slice(0, 700));
const Son = run('slice', '-', ON);
const mSlice = (s) => !!(s && !s.err && s.a && s.b && eqJ(s.a, s.b) && s.b.fs && s.b.fs.slices >= s.b.fs.runs + 2 && s.a.fs && s.a.fs.slices === s.a.fs.runs);
ok(mSlice(Son), '⑦ 틱을 막지 않는다 — 몫(0.02 ms)마다 나오고(훑기 몫 여럿) · 몫을 이어도 한 번에 민 답과 같다', JSON.stringify(Son).slice(0, 700));
const Lon = run('land', '-', ON);
const mLand = (l) => !!(l && !l.err && l.ready0 && l.ready1 === false && l.a && l.d && eqJ(l.a, l.d) && l.a.fs && l.d.fs && l.a.fs.dsum === l.d.fs.dsum && l.d.fs.land > 0);
ok(mLand(Lon), '⑨ 길잡이 하한 — ㉮(다익스트라) · ㉱(과녁 A* + 길잡이)가 목적마다 같은 거리(합 같음) · 같은 답 · 지형이 열리면 표를 내린다', JSON.stringify(Lon).slice(0, 900));
//   미끼(바꾼 자리 = 원본에서 앵커가 나온 수 · 아이도 1 이 아니면 멈춘다)
const nB = (k) => { const src = fs.readFileSync(BAITS[k].file, 'utf8'), at = BAITS[k].at; return Array.isArray(at[0]) ? (at.every(([a]) => LB.count(src, a) === 1) ? 1 : 0) : LB.count(src, at[0]); };
const b1 = run('eq', 'noPiece', ON);
ok(!b1.baitErr && nB('noPiece') === 1 && !mEq(b1), '미끼 ㉠ T1440 과 다른 답을 내는 사본(한 번 훑기가 조각을 안 넣고 훑는다) → ① 빨강', b1.baitErr || `바꾼 자리 ${nB('noPiece')} · ① ${mEq(b1)}`);
const b2 = run('warm2', 'warmAll', ON);
ok(!b2.baitErr && nB('warmAll') === 1 && !mWarm(b2), '미끼 ㉡ 걸음 2 데우기가 U 둘레까지 옮기는 사본 → ③ 빨강', b2.baitErr || `바꾼 자리 ${nB('warmAll')} · ③ ${mWarm(b2)} · ${JSON.stringify(b2.j)}`);
const b3 = run('mask', 'maskStale', ON);
ok(!b3.baitErr && nB('maskStale') === 1 && !mMask(b3), '미끼 ㉢ 구조물이 서도 접은 지도를 안 비우는 사본 → ④ 빨강', b3.baitErr || `바꾼 자리 ${nB('maskStale')} · ④ ${mMask(b3)} · ${JSON.stringify(b3.mask)}`);
const b4 = run('triple', 'triple', ON);
ok(!b4.baitErr && nB('triple') === 1 && !mTri(b4), '미끼 ㉣ 3배를 넘겨 지키는 사본 → ⑤ 빨강', b4.baitErr || `바꾼 자리 ${nB('triple')} · ⑤ ${mTri(b4)} · ${JSON.stringify(b4.j)}`);
const b5 = run('memo', 'memoOld', ON);
ok(!b5.baitErr && nB('memoOld') === 1 && !mMemo(b5), '미끼 ㉤ 세계가 바뀐 뒤에도 기억한 답을 쓰는 사본 → ⑥ 빨강', b5.baitErr || `바꾼 자리 ${nB('memoOld')} · ⑥ ${mMemo(b5)} · ${JSON.stringify(b5.m1)}`);
const b6 = run('slice', 'noSlice', ON);
ok(!b6.baitErr && nB('noSlice') === 1 && !mSlice(b6), '미끼 ㉥ 판정이 몫을 안 지키는 사본(틱을 16 ms 넘게 막는다) → ⑦ 빨강', b6.baitErr || `바꾼 자리 ${nB('noSlice')} · ⑦ ${mSlice(b6)} · ${JSON.stringify(b6.b && b6.b.fs)}`);
const b7 = run('eq', 'offFast', {});
ok(!b7.baitErr && nB('offFast') === 1 && !mOff(b7), '미끼 ㉦ 끈 판이 다른 사본(끔에서도 훑는다) → ⑧ 빨강', b7.baitErr || `바꾼 자리 ${nB('offFast')} · ⑧ ${mOff(b7)} · ${JSON.stringify(b7.S)}`);
const b8 = run('land', 'landKeep', ON);
ok(!b8.baitErr && nB('landKeep') === 1 && !mLand(b8), '미끼 ㉧ 지형이 열려도 길잡이 표를 쓰는 사본 → ⑨ 빨강', b8.baitErr || `바꾼 자리 ${nB('landKeep')} · ⑨ ${mLand(b8)} · ${JSON.stringify({ r0: b8.ready0, r1: b8.ready1 })}`);
console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
