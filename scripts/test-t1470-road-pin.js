#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1470-road-pin.js — 길을 받아들인 땅은 길의 못이 된다(T1470 · ★재민 11-23 판정 83 나 · 손잡이 `T1470_ROAD_PIN` 끔 기본 · `T1440_ROAD_RULE` 켬 위에서만 뜻) ====
//
// ★왜: "비켜 가게" 사유지 두 칸이면 남의 "그대로 둠" 칸 앞 길을 민다(T1440 회부 3 · §3-2). 켬 = 판정이 길을 옮길 때 그 길이 지나던 못(주인이 길을 받아들인 칸)을 새 길도 지난다 —
//   을의 칸을 피하면서 못을 다 지나는 길(처음 길의 3배 안)이 있으면 비켜 간다(보호) · 없으면 을의 칸이 길이 지나는 칸(내줌).
// 판(운영 함수 그대로 · 사본 0 — 꾸민 세계 240×300 칸 들판 · 마을 가(40,152) ↔ 나(200,152) · 갑의 못 = 그 길 칸(120,·)):
//   ① 앞 칸 셋(못 바로 앞 길 칸 + 위아래) — 끔: 길이 못을 떠난다(갑을 지나는 짝 1 → 0) · 켬: 을은 보호인데 길은 못을 그대로 지난다(1 → 1)
//   ② 둘레 여덟 칸을 차례로 — 켬: 마지막 칸(못에 닿는 길이 다 막힘)이 내줌 = 길이 지나는 칸(앞 칸들은 그대로) · 갑을 지나는 짝 1
//   ③ 어쩔 수 없이 지나는 칸(저장 1)은 못이 아니다 — 같은 손짓에 길이 그 칸을 떠난다(끔과 같은 답)
//   ④ 갑이 추방돼 잠기면(표시된 사유지) 못이 사라진다 — 뒤 선포는 못 없이(길이 떠난다) · 앞서 선 을의 처지 그대로
//   ⑤ 먼저 잡은 병의 사유지(길 옆) — 못 길이 병을 지나게 하지 않는다(병 처지 바뀜 0)
//   ⑥ 끔 — 못 0(저장 2 가 와도 끔이면 못이 아니다 · ① 끔 답 = T1440)
//   미끼: ㉠ 못을 안 지나는 새 길을 내는 사본 → ① 빨강 · ㉡ 어쩔 수 없이 지나는 칸을 못으로 세는 사본 → ③ 빨강 · ㉢ 잠긴 뒤에도 못이 남는 사본 → ④ 빨강 ·
//     ㉣ 못 길이 남의 사유지를 지나게 하는 사본 → ⑤ 빨강 · ㉤ 끔에서 다른 사본(지나는 칸을 다 못으로) → ⑥ 빨강
// 실행: node scripts/test-t1470-road-pin.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const LB = require('./lib-bait');
const ROOT = path.join(__dirname, '..');
const RFILE = path.join(ROOT, 'server', 'road-rule.js'), VFILE = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  skipPin: { file: RFILE, at: [['        if (m.pins) { pinned.push(m); continue; }', '        /* 미끼 ㉠ — 못 쌍도 무리로 */']] },
  passPin: { file: RFILE, at: [['const pinOf = (v) => v === 2;', 'const pinOf = (v) => !!v;   /* 미끼 ㉡ */']] },
  lockPin: { file: RFILE, at: [['  for (const [id, cells, marked, t, lvl, pass, pin] of S.claimsIter()) {\n    if (marked) continue;', '  for (const [id, cells, marked, t, lvl, pass, pin] of S.claimsIter()) {\n    /* 미끼 ㉢ — 잠긴 것도 */']] },
  passOther: { file: RFILE, at: [['  const P = m.ref, pins = m.pins, Pc = new Set(job.piece.cells);', '  M = { U: false, P2: \'all\', P3: \'all\' };   /* 미끼 ㉣ */\n  const P = m.ref, pins = m.pins, Pc = new Set(job.piece.cells);']] },
  offPin: { file: RFILE, at: [['    if (pin) { o.pin = true; S.pinN = (S.pinN | 0) + 1; }', '    if (pin || pass) { o.pin = true; S.pinN = (S.pinN | 0) + 1; }   /* 미끼 ㉤ */']] },
};
function baitHook(name) {
  const bait = name && name !== '-' ? BAITS[name] : null; if (!bait) return;
  const Module = require('module'), _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === bait.file) for (const [a, b] of bait.at) { const n = content.split(a).length - 1; if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); } content = content.replace(a, b); }
    return _c.call(this, content, filename);
  };
}
function child(scen, bait) {
  process.env.ENABLE_VILLAGES = '0'; process.env.T1440_ROAD_RULE = '1';
  baitHook(bait);
  const ON = process.env.T1470_ROAD_PIN === '1';
  const _log = console.log; console.log = () => {};
  const V = require(VFILE), RR = require(RFILE), T = V.__t1440;
  const SZ = 32, W = 240, H = 300, K = RR.K;
  const terr = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H;
  const ta = { isBlocked: terr, isWater: () => false, isRock: () => false, isStream: () => false };
  const mkV = (dbId, name, cx, cy) => ({ dbId, name, ccx: cx, ccy: cy, econ: { name, npcs: [] }, npcPids: [] });
  const E = mkV(1, '가', 40, 152), F = mkV(2, '나', 200, 152), vils = [E, F];
  const deps = { players: new Map(), npcs: new Set(), broadcast: () => {}, isPositionActive: () => true, isTerrainBlockedLocal: (px, py) => terr(Math.floor(px / SZ), Math.floor(py / SZ)), isBlockedByWall: (nx, ny, ox, oy) => T.stepPx(ox, oy, nx, ny), t1440MarkHit: () => false };
  T.setup({ ta, ZONE: { zoneWidth: W * SZ, zoneHeight: H * SZ }, villages: vils, byDbId: new Map(vils.map((v) => [v.dbId, v])), byEcon: new Map(vils.map((v) => [v.econ, v])), zoneId: 'test', db: { upsertTradeRoute() {}, deleteTradeRoute() { return 1; }, t1440FirstAll() { return []; }, t1440FirstPut() {} }, world: { day: 10, caravans: [], tradeLog: [] }, caravanBodies: new Map(), deps,
    pathfind: require(path.join(ROOT, 'server', 'pathfind')), dayMs: require(path.join(ROOT, 'server', 'zone-config')).WORLD.dayLengthMs });
  const st = T.state(); st.ready = true;
  //   사유지 표(존 꼴 그대로 — 저장 값 pass: 0 · 1 내줌 · 2 그대로 둠 · 존 iterator 의 못 = 켬 && RoadRule.pinOf(저장 값))
  const claims = new Map(); let tN = 0;
  RR.claimsUse(function* () { for (const [id, c] of claims) yield [id, c.cells, !!c.locked, c.t, c.lvl, !!c.pass, ON && RR.pinOf(c.pass)]; });
  const cellsOf = (pts) => { const s = new Set(); for (let i = 1; i < (pts || []).length; i++) T.cells(pts[i - 1], pts[i], (x, y) => { s.add(K(x, y)); return false; }); return s; };
  const thru = (x, y) => [...st.routeCache.entries()].filter(([, p]) => p && cellsOf(p).has(K(x, y))).length;
  //   선포(존 사유지 문 꼴 — 한 칸 · 급 2 · 처음 내줌에서 끝 · 비켜 가게) → 내줌이면 그 칸 = 길이 지나는 칸(저장 1) · 보호면 새 길 저장
  const claim = (id, x, y, how) => {
    if (how === 'keep') { claims.set(id, { cells: [[x, y]], t: ++tN, lvl: 2, pass: 2 }); RR.claimsDirty(); V.t1440Touch([K(x, y)], false, 'P'); return { v: 'keep' }; }
    if (how === 'forced') { claims.set(id, { cells: [[x, y]], t: ++tN, lvl: 2, pass: 1 }); RR.claimsDirty(); V.t1440Touch([K(x, y)], false, 'P'); return { v: 'forced' }; }
    const piece = RR.pieceCell(x, y), j = V.t1440Judge(piece, { cls: 2, max: 2, early: true }); V.t1440Step(j, 0);
    const P0 = new Set(piece.cells), pass = new Set(); for (const m of j.fail) for (const k of cellsOf(m.pts)) if (P0.has(k)) pass.add(k);
    claims.set(id, { cells: [[x, y]], t: ++tN, lvl: 2, pass: pass.size ? 1 : 0 }); RR.claimsDirty(); V.t1440Touch(piece.cells, false, 'P');
    if (j.verdict !== 'free') V.t1440Apply(j);
    const others = []; for (const [, pb] of j.passBy) for (const [cid] of pb) { const c = claims.get(cid); if (c && !c.pass) { c.pass = 1; others.push(cid); } }
    if (others.length) RR.claimsDirty();
    return { v: j.verdict, pass: pass.size, others, pins: j.pins | 0, pinOk: j.pinOk | 0, pinFail: j.pinFail ? j.pinFail.size : 0, cpu: +(j.cpu || 0).toFixed(1) };
  };
  const out = { scen, on: ON };
  try {
    T.getRoute(E, F);
    const ys = []; for (const k of cellsOf(st.routeCache.get('1_2'))) if (RR.KX(k) === 120) ys.push(RR.KY(k)); ys.sort((a, b) => a - b);
    const py = ys.length ? ys[ys.length >> 1] : 152; out.pin = [120, py];
    if (scen === 'front' || scen === 'ring' || scen === 'forced' || scen === 'lock' || scen === 'other') {
      if (scen === 'other') { out.c0 = []; for (let d = 1; d <= 6; d++) for (const sg of [-1, 1]) out.c0.push(claim('병' + sg * d, 119, py + sg * d, 'avoid').v); }   // 병 — 먼저 잡은 길 옆 막대(x 119 · 위아래 여섯 칸씩 · 길에 안 닿는다 = free)
      out.k = claim('갑', 120, py, scen === 'forced' ? 'forced' : 'keep');
      out.thru0 = thru(120, py);
      const steps = scen === 'other' ? [[119, py]] : scen === 'ring' ? [[119, py], [121, py], [120, py - 1], [120, py + 1], [119, py - 1], [119, py + 1], [121, py - 1], [121, py + 1]] : [[119, py], [119, py - 1], [119, py + 1]];
      if (scen === 'lock') { claims.get('갑').locked = true; RR.claimsDirty(); }
      out.steps = steps.map(([x, y], i) => Object.assign(claim('을' + i, x, y, 'avoid'), { at: [x, y], thru: thru(120, py) }));
      out.thru1 = thru(120, py);
      out.passes = [...claims.entries()].filter(([id, c]) => id.startsWith('을') && c.pass).map(([id]) => id);
      if (scen === 'other') out.byung = [...claims.entries()].filter(([id, c]) => id.startsWith('병') && c.pass).length;
      if (scen === 'other') { const rc = cellsOf(st.routeCache.get('1_2')); out.over = [...claims.entries()].filter(([id, c]) => id.startsWith('병') && c.cells.some(([x, y]) => rc.has(K(x, y)))).length; }   // 새 길이 병의 칸을 지나나(처지 바뀜)
    }
  } catch (e) { out.err = String(e && e.stack).slice(0, 900); }
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}
if (process.argv[2] === '--child') { child(process.argv[3], process.argv[4]); return; }
let pass = 0, fail = 0;
const ok = (c, name, why) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (why ? '\n      ' + String(why).slice(0, 1200) : '')); } };
const ON = { T1470_ROAD_PIN: '1' };
function run(scen, bait, env) {
  const r = spawnSync(process.execPath, [__filename, '--child', scen, bait || '-'], { env: Object.assign({}, process.env, { T1470_ROAD_PIN: '' }, env || {}), encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: 'no output · ' + String(r.stderr || '').slice(-900) };
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: 'bad json' }; }
}
console.log('T1470 — 길을 받아들인 땅은 길의 못이 된다(꾸민 세계)');
const Foff = run('front', '-', {}), Fon = run('front', '-', ON);
const mOffFront = (f) => !!(f && !f.err && !f.on && f.thru0 === 1 && f.thru1 === 0 && f.steps.every((s) => s.v === 'protected' || s.v === 'free'));
ok(mOffFront(Foff), '⑥ 끔 — 앞 칸 셋이면 길이 갑의 칸을 떠난다(갑을 지나는 짝 1 → 0 · 을 보호 · T1440 그대로)', JSON.stringify(Foff).slice(0, 900));
const mFront = (f) => !!(f && !f.err && f.on && f.thru0 === 1 && f.thru1 === 1 && f.steps.every((s) => s.v === 'protected' || s.v === 'free') && f.steps.some((s) => s.pinOk > 0) && f.passes.length === 0);
ok(mFront(Fon), '① 켬 — 같은 앞 칸 셋: 을은 보호(비켜 간다)인데 새 길은 못을 그대로 지난다(갑을 지나는 짝 1 → 1)', JSON.stringify(Fon).slice(0, 900));
const Ron = run('ring', '-', ON);
const mRing = (r) => !!(r && !r.err && r.thru1 === 1 && r.passes.length >= 1 && r.steps.some((s) => s.v === 'yield' && s.pinFail > 0) && r.steps.slice(0, 2).every((s) => s.v !== 'yield'));
ok(mRing(Ron), '② 켬 — 둘레 여덟 칸을 차례로: 못에 닿는 길을 다 막는 칸이 내줌(길이 지나는 칸 · 그 판정이 못 주인을 안다) · 앞 칸들 처지 그대로 · 갑을 지나는 짝 1', JSON.stringify(Ron).slice(0, 1200));
const Xon = run('forced', '-', ON);
const mForced = (x) => !!(x && !x.err && x.thru0 === 1 && x.thru1 === 0 && x.steps.every((s) => s.pins === 0));
ok(mForced(Xon), '③ 어쩔 수 없이 지나는 칸(저장 1)은 못이 아니다 — 같은 앞 칸 셋에 길이 그 칸을 떠난다(못 0)', JSON.stringify(Xon).slice(0, 900));
const Lon = run('lock', '-', ON);
const mLock = (l) => !!(l && !l.err && l.thru1 === 0 && l.steps.every((s) => s.pins === 0));
ok(mLock(Lon), '④ 갑이 잠기면(표시된 사유지) 못이 사라진다 — 뒤 선포는 못 없이(길이 떠난다)', JSON.stringify(Lon).slice(0, 900));
const Oon = run('other', '-', ON);
const mOther = (o) => !!(o && !o.err && o.byung === 0 && o.over === 0 && o.thru1 === 1 && o.steps.every((s) => !s.others || s.others.length === 0));
ok(mOther(Oon), '⑤ 먼저 잡은 병의 사유지(길 옆 막대) — 못 길이 병을 지나게 하지 않는다(새 길이 병의 칸을 안 지난다 · 병 처지 바뀜 0)', JSON.stringify(Oon).slice(0, 900));
const nB = (k) => { const src = fs.readFileSync(BAITS[k].file, 'utf8'); return BAITS[k].at.every(([a]) => LB.count(src, a) === 1) ? 1 : 0; };
const b1 = run('front', 'skipPin', ON);
ok(!b1.baitErr && nB('skipPin') === 1 && !mFront(b1), '미끼 ㉠ 못을 안 지나는 새 길을 내는 사본 → ① 빨강', b1.baitErr || `바꾼 자리 ${nB('skipPin')} · ① ${mFront(b1)} · ${JSON.stringify({ t0: b1.thru0, t1: b1.thru1 })}`);
const b2 = run('forced', 'passPin', ON);
ok(!b2.baitErr && nB('passPin') === 1 && !mForced(b2), '미끼 ㉡ 어쩔 수 없이 지나는 칸을 못으로 세는 사본 → ③ 빨강', b2.baitErr || `바꾼 자리 ${nB('passPin')} · ③ ${mForced(b2)} · ${JSON.stringify({ t1: b2.thru1 })}`);
const b3 = run('lock', 'lockPin', ON);
ok(!b3.baitErr && nB('lockPin') === 1 && !mLock(b3), '미끼 ㉢ 잠긴 뒤에도 못이 남는 사본 → ④ 빨강', b3.baitErr || `바꾼 자리 ${nB('lockPin')} · ④ ${mLock(b3)} · ${JSON.stringify({ t1: b3.thru1 })}`);
const b4 = run('other', 'passOther', ON);
ok(!b4.baitErr && nB('passOther') === 1 && !mOther(b4), '미끼 ㉣ 못 길이 남의 사유지를 지나게 하는 사본 → ⑤ 빨강', b4.baitErr || `바꾼 자리 ${nB('passOther')} · ⑤ ${mOther(b4)} · ${JSON.stringify({ byung: b4.byung, steps: b4.steps })}`);
const b5 = run('front', 'offPin', {});
ok(!b5.baitErr && nB('offPin') === 1 && !mOffFront(b5), '미끼 ㉤ 끔에서 다른 사본(지나는 칸을 다 못으로) → ⑥ 빨강', b5.baitErr || `바꾼 자리 ${nB('offPin')} · ⑥ ${mOffFront(b5)} · ${JSON.stringify({ t1: b5.thru1 })}`);
console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
