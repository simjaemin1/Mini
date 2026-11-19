#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1380-terr-lot.js — 영토 v2 를 랩 넓이에(T1380 · ★재민 11-19 · T1345 회부 2 · 3) ============================
//
// ★무엇: 영토 v2(묶음이 켜는 `T1207_TERR_REAL` · `T1238_TERR_V2`) 위의 손잡이 셋 — 다 끔 기본 · 영토 v2 켬 안에서만 뜻:
//   (가) `T1380_TERR_LOT_FIRST` — 주거 문 닫힘 · 집터 빈손이면 영토 넓히기가 가장 가까운 집 부지 후보의 영토 밖 칸부터 고른다
//   (나) `T1380_LOT_CLAIM` — 집 부지 후보가 영토 가장자리를 넘으면 넘는 칸을 같은 말뚝 값으로 그 자리에서 영토에 넣고 집터를 잡는다(통나무 모자람 = 까닭 `stake`)
//   (라) `T1380_START_FULL` — 처음 땅 1,500 상한을 안 건다(시딩 · 백필 — 판으로 잰다 · 여기선 글자만)
//   (덧붙임 둘) `T1380_HAPPY_EXPAND` — 영토 넓히기에 나서는 정도 = 행복 h: 'rate' 그날 넓히는 칸 · 몸의 낮 × h · 'lot' (나) 의 그 자리 넣기만 h 를 탄다(날마다 h 씩 · 1 이면 넣는다)
// ★판정 사본 0: 진짜 `server/villages.js` 를 아이 프로세스에서 손잡이 env 를 달리해 싣고(손잡이는 글을 읽을 때 정해진다) `__labProbe` 주입구로 마을을 꽂아
//   정본 집터 찾기(`_lifeAddHouseSite`) · 영토 넓히기(`_terrGrow` — 일괄 `_t1238Batch`)를 그대로 부른다.
// 꾸민 마을 A — 중심 (1000, 1000) · 영토 = 33 × 33 네모(1,089칸 — 부지 원판(오프셋 −6 ~ +5)이 다 드는 자리는 중심 거리 14.1 까지라 회관 마당 원(16.5) 밖 부지가 하나도 안 든다 = 영토가 쓰는 땅에 딱 맞음) ·
//   집 0 · 곳간 통나무 넉넉 · 사람 40(집 모자람 · 주거 문 닫힘 표지).
// 지키는 것:
//   ⓐ 끔 = 집터 빈손 · (가) = 빈손 뒤 넓히기의 첫 칸이 가장 가까운 부지 후보(모퉁이 (988, 988) — 중심 거리 16.97 · 찾기와 같은 차례)의 영토 밖 칸 · 그 칸이 다 영토가 되고 다음 찾기가 그 자리를 잡는다 ·
//      끔 넓히기는 그 칸을 안 고른다 · (나) = 찾기 한 번에 그 부지 칸이 영토에 들고 곳간 통나무가 그 칸들의 말뚝 값(영토에서 이어지는 차례의 `_t1207CellCost`)만큼 준다
//   ⓑ 통나무 0 이면 (나) 거절 — 까닭 `stake` · 영토 · 곳간 그대로 · 거부 기억에 안 든다 · 다음 날 다시 보고(기억 건너뜀 0) 통나무가 들면 잡는다
//   ⓒ 남의 영토 · 물 칸은 안 넣는다 — 부지 후보의 영토 밖 칸에 이웃 마을 B 영토가 들면 · 물이 들면 넣을 칸 계획이 없다 · (나) 가 잡은 뒤 A ∩ B = ∅ · A 에 물 칸 0
//   ⓓ 묶음(영토 v2) 끔 = 종전 — T1380 손잡이를 '1' 로 줘도 꺼진다 · 같은 판(찾기 · 넓히기 · 다시 찾기)의 지문이 손잡이 없는 판과 같다 · 영토 v2 켬 + 손잡이 '0' = 손잡이 없음
//   ⓔ 미끼(파일 안 · 바꾼 자리 정확히 1곳씩) — 말뚝 값을 안 치르게 바꾼 사본 → ⓐ 의 통나무 단언 빨강 · 부지 술어(집터 판정 · 넣을 칸 술어)를 안 거친 사본 → ⓒ 빨강 ·
//      'lot' 이 h 를 안 타게 바꾼 사본 → ⓕ 빨강
//   ⓕ (덧붙임 둘) 'rate' — 하루 넓힌 칸 = 60 × h(h 1 · 0.5 · 0.25 → 60 · 30 · 15) · 'lot' — 날마다 h 씩 쌓아 1 이 차는 날에만 그 자리 넣기(h 0.6 → 셋째 찾기 · h 1 → 둘째 찾기) · 그 전 찾기는 까닭 happy
//
// 실행: node scripts/test-t1380-terr-lot.js   (아이 아홉 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T1380_CHILD || '';

// ── 아이 — 마을을 꽂고 한 판을 돌려 JSON 한 줄을 찍는다 ─────────────────────────────────────────────
function child() {
  process.env.ENABLE_VILLAGES = '0';
  process.env.DB_PATH = `/tmp/t1380-v-${process.pid}.db`;
  const V = require(process.env.T1380_VPATH || path.join(ROOT, 'server/villages.js'));
  const E = require(path.join(ROOT, 'sim/economy-sim.js'));
  const P = V.__labProbe;
  const out = { mode: MODE, on: { v2: !!V.T1238_TERR_V2, full: !!V.T1380_START_FULL, lot: !!V.T1380_TERR_LOT_FIRST, claim: !!V.T1380_LOT_CLAIM, happy: V.T1380_HAPPY_EXPAND || '' } };
  if (!P || !P._t1380Probe) { out.missing = true; return out; }
  const blocked = new Set(), water = new Set();
  const ta = { isBlocked: (x, y) => blocked.has(x + ',' + y) || water.has(x + ',' + y), isWater: (x, y) => water.has(x + ',' + y), isRock: () => false, fert: () => 0.5, forestMult: () => 1 };
  const rect = (x0, y0, x1, y1) => { const s = new Set(); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) s.add(x + ',' + y); return s; };
  const players = new Map([[101, { pid: 101, isNpc: true, hp: 100, maxHp: 100, inventory: {} }]]);
  const mkEcon = (pop, wood) => { const e = E.createVillage({ name: 'T', initialPop: pop, fertility: 0.6, water: 0.5, wood: 0.6, stone: 0.4, game: 0.4, ore: 0, size: 100 }); e.storage.wood = wood; e._t958Plan = 240; e._dpDebug = { gated: true }; return e; };
  const mk = (id, name, cx, cy, terr, pop, wood) => ({ dbId: id, name, ccx: cx, ccy: cy, _terrSet: terr, _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(),
    _houseCells: [], housesPx: [], _granList: [], _ditch: [], _shelter: null, _site: null, _psite: null, npcPids: id === 1 ? [101] : [], _crop: new Map(), _t1238Since: 100, econ: mkEcon(pop, wood) });
  const deps = { players, dayPhaseRatio: 0.7, moveSpeed: 64, anyViewerNear: () => false, broadcast: () => {}, t325TreesAtCell: () => [], t325CutTreeAt: () => null, clearTreesInCells: () => 0 };
  const db = { insertVillageBuilding: () => 0 };
  const set = (vils, day) => { P._t569Probe.setup({ ta, villages: vils, db }); P._t400Probe.setup({ deps, db, dayMs: 250, world: { day }, ta }); P._t1238Probe.setup({ villages: vils, day }); };
  const R = P._t1380Probe, reasons = () => Object.assign({}, R.reason());
  const keys = (s) => [...s].sort();
  const hash = (a) => { let h = 2166136261; for (const k of a) for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  const sq = () => rect(984, 984, 1016, 1016);   // A 영토 — 33 × 33(중심 ± 16)
  if (MODE === 'a') {
    //   ⓐ — 찾기 → (가) 넓히기 → 다시 찾기
    const A = mk(1, 'A', 1000, 1000, sq(), 40, 5000); set([A], 100);
    const plan = R.claim(A, 988, 988, true);                         // 기대 부지 후보(모퉁이) — 정본 술어로 그 칸을 꺼낸다
    out.planCells = plan ? plan.cells.length : 0; out.planFirst = plan ? plan.cells[0] : null;
    let owe = 0; { const plus = new Set(); for (const k of (plan ? plan.cells : [])) { const [x, y] = k.split(',').map(Number); owe += V._t1207CellCost(A, x, y, plus).wood; plus.add(k); } }
    out.owe = +owe.toFixed(6);
    const w0 = A.econ.storage.wood, t0 = new Set(A._terrSet), r0 = reasons();
    quiet(() => R.site(A));
    out.site1 = A._site ? [A._site.cx, A._site.cy] : null; out.wood1 = +(w0 - A.econ.storage.wood).toFixed(6);
    out.added1 = [...A._terrSet].filter((k) => !t0.has(k)).length; out.planInTerr1 = plan ? plan.cells.every((k) => A._terrSet.has(k)) : false;
    out.planSaved = A._t1380Plan ? [A._t1380Plan.x, A._t1380Plan.y, A._t1380Plan.cells.length] : null;
    const r1 = reasons(); out.dOut = (r1['마을 영토 밖'] || 0) - (r0['마을 영토 밖'] || 0);
    if (!A._site) {
      const t1 = new Set(A._terrSet);
      quiet(() => R.grow(A));
      const added = [...A._terrSet].filter((k) => !t1.has(k));
      out.grown = added.length; out.firstAdded = added[0] || null;   // 영토 칸 표는 넣은 차례 — 오늘 첫 말뚝 칸
      out.planAdded = plan ? plan.cells.filter((k) => A._terrSet.has(k)).length : 0;
      out.lf = Object.assign({}, A._t1380 || {});
      set([A], 101);
      quiet(() => R.site(A));
      out.site2 = A._site ? [A._site.cx, A._site.cy] : null;
    }
    out.stat = Object.assign({}, R.st());
    out.fp = { site1: out.site1, site2: out.site2 || null, terr: hash(keys(A._terrSet)), n: A._terrSet.size, wood: +A.econ.storage.wood.toFixed(6), out: out.dOut };
  } else if (MODE === 'b') {
    //   ⓑ — 통나무 0
    const A = mk(1, 'A', 1000, 1000, sq(), 40, 0); set([A], 100);
    const n0 = A._terrSet.size, r0 = reasons(), skip0 = V.tickPerf().probe.siteSkip, call0 = V.tickPerf().probe.siteCall;
    quiet(() => R.site(A));
    const r1 = reasons();
    out.site1 = A._site ? [A._site.cx, A._site.cy] : null; out.n1 = A._terrSet.size - n0; out.wood1 = A.econ.storage.wood; out.stake1 = (r1.stake || 0) - (r0.stake || 0);
    out.wait = !!A._t1380StakeWait; out.rejHas = !!(A._siteRejS && A._siteRejS.has('988,988'));
    set([A], 101);
    quiet(() => R.site(A));                                           // 다음 날 — 통나무 여전히 0 · 기억 건너뜀 없이 다시 본다
    out.call2 = V.tickPerf().probe.siteCall - call0; out.skip2 = V.tickPerf().probe.siteSkip - skip0; out.site2 = A._site ? [A._site.cx, A._site.cy] : null;
    A.econ.storage.wood = 5000; set([A], 102);
    quiet(() => R.site(A));                                           // 통나무가 들었다
    out.site3 = A._site ? [A._site.cx, A._site.cy] : null; out.n3 = A._terrSet.size - n0;
  } else if (MODE === 'f-rate') {
    //   ⓕ 'rate' — 넓히기 한 번(몸 있음 · 통나무 넉넉 · 목표 넉넉 — 끔이면 60칸)
    const A = mk(1, 'A', 1000, 1000, sq(), 40, 5000); A.econ.lastStats = Object.assign({}, A.econ.lastStats || {}, { happiness: +process.env.T1380_TEST_H }); set([A], 100);
    const t0 = new Set(A._terrSet);
    quiet(() => R.grow(A));
    out.grown = [...A._terrSet].filter((k) => !t0.has(k)).length; out.cut = (A._t1380 && A._t1380.rateCut) || 0;
  } else if (MODE === 'f-lot') {
    //   ⓕ 'lot' — 몸 없음(넓히기 0 — 집 자리 넣기만 본다) · 통나무 넉넉 · 날마다 찾기 → 넓히기(h 쌓기)
    const A = mk(1, 'A', 1000, 1000, sq(), 40, 5000); A.npcPids = []; A.econ.lastStats = Object.assign({}, A.econ.lastStats || {}, { happiness: +process.env.T1380_TEST_H });
    const r0 = reasons(); out.sites = [];
    for (let d = 100; d < 104 && !A._site; d++) { set([A], d); quiet(() => R.site(A)); out.sites.push(A._site ? [A._site.cx, A._site.cy] : null); if (!A._site) quiet(() => R.grow(A)); }
    const r1 = reasons(); out.happy = (r1.happy || 0) - (r0.happy || 0); out.acc = A._t1380Ha;
  } else if (MODE === 'c') {
    //   ⓒ — 이웃 마을 B(북서 모퉁이 부지의 북쪽 칸) · 물(북동 모퉁이 부지의 북쪽 칸)
    const A = mk(1, 'A', 1000, 1000, sq(), 40, 5000), B = mk(2, 'B', 987, 970, rect(975, 960, 1000, 982), 20, 100);
    for (let x = 1004; x <= 1020; x++) { water.add(x + ',982'); water.add(x + ',983'); }
    set([A, B], 100);
    const cNW = R.claim(A, 988, 988, true), cNE = R.claim(A, 1012, 988, true), cSE = R.claim(A, 1012, 1012, true);
    const hasB = (c) => !!(c && c.cells.some((k) => B._terrSet.has(k))), hasW = (c) => !!(c && c.cells.some((k) => water.has(k)));
    out.nw = cNW ? { n: cNW.cells.length, b: hasB(cNW) } : null; out.ne = cNE ? { n: cNE.cells.length, w: hasW(cNE) } : null; out.se = cSE ? { n: cSE.cells.length, b: hasB(cSE), w: hasW(cSE) } : null;
    quiet(() => R.site(A));
    out.site = A._site ? [A._site.cx, A._site.cy] : null;
    out.overlap = [...A._terrSet].filter((k) => B._terrSet.has(k)).length; out.wet = [...A._terrSet].filter((k) => water.has(k)).length;
  }
  return out;
}
if (MODE) {
  let o; try { o = child(); } catch (e) { o = { mode: MODE, err: String(e && e.stack || e) }; }
  process.stdout.write('\n@@T1380 ' + JSON.stringify(o) + '\n');
  try { fs.unlinkSync(`/tmp/t1380-v-${process.pid}.db`); } catch (e) {}
  return;
}

// ── 어버이 ───────────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${name}${detail != null ? ` — ${detail}` : ''}`); };
const V2 = { T1207_TERR_REAL: '1', T1238_TERR_V2: '1' };
const run = (mode, env, vpath) => {
  const e = Object.assign({}, process.env, { T1380_CHILD: mode }, env || {});
  for (const k of ['T1207_TERR_REAL', 'T1238_TERR_V2', 'T1380_TERR_LOT_FIRST', 'T1380_LOT_CLAIM', 'T1380_START_FULL', 'T1380_HAPPY_EXPAND', 'T1380_TEST_H', 'T1334_BUNDLE', 'T1302_TERR_BODY']) if (!(env && k in env)) delete e[k];
  if (vpath) e.T1380_VPATH = vpath; else delete e.T1380_VPATH;
  const r = spawnSync(process.execPath, [__filename], { env: e, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 120000 });
  const m = /@@T1380 (.*)/.exec(r.stdout || '');
  let o = null; try { o = m ? JSON.parse(m[1]) : null; } catch (_) { o = null; }
  return o || { mode, err: ((r.stderr || '') + (r.stdout || '')).slice(-600) };
};
const J = (o) => JSON.stringify(o);
console.log('=== T1380 영토 v2 를 랩 넓이에 — (가) 부지 쪽부터 · (나) 부지 칸 그 자리 넣기 ===');
const off = run('a', V2), ga = run('a', Object.assign({ T1380_TERR_LOT_FIRST: '1' }, V2)), na = run('a', Object.assign({ T1380_LOT_CLAIM: '1' }, V2));
for (const o of [off, ga, na]) if (o.err || o.missing) console.log(`  (아이 ${o.mode} ${o.err ? '오류: ' + o.err.split('\n')[0] : 'T1380 주입구 없음'})`);
// ⓐ
console.log('\nⓐ 꾸민 마을(영토 = 쓰는 땅 · 통나무 넉넉 · 집 모자람)');
ok(!off.err && !off.missing && off.on.v2 && !off.on.lot && !off.on.claim && off.planCells > 0, 'ⓐ [전제] 영토 v2 켬 · 손잡이 끔 · 모퉁이 부지 후보 (988, 988)의 영토 밖 칸이 넣을 수 있는 칸이다', `넣을 칸 ${off.planCells} · 첫 칸 ${off.planFirst} · 말뚝 값 ${off.owe}`);
ok(off.site1 === null && off.dOut > 0 && off.added1 === 0, 'ⓐ 끔 — 집터 빈손(부지 원판이 다 영토 안인 후보 0 · 까닭 "마을 영토 밖")', `집터 ${J(off.site1)} · 영토 밖 ${off.dOut} · 더한 칸 ${off.added1}`);
ok(off.grown > 0 && off.planAdded < off.planCells && off.site2 === null, 'ⓐ 끔 — 넓히기는 비옥 · 거리 점수로 고른다(부지 후보 칸을 다 넣지 않는다) · 다음 찾기도 빈손', `넓힘 ${off.grown} · 부지 칸 ${off.planAdded}/${off.planCells} · 다시 찾기 ${J(off.site2)}`);
ok(ga.on && ga.on.lot && ga.site1 === null && J(ga.planSaved) === J([988, 988, ga.planCells]), 'ⓐ (가) — 빈손 찾기가 가장 가까운 부지 후보를 적는다(찾기와 같은 차례 — 모퉁이 (988, 988))', `적은 후보 ${J(ga.planSaved)}`);
ok(ga.firstAdded === ga.planFirst && off.firstAdded !== off.planFirst && ga.planAdded === ga.planCells && ga.lf && ga.lf.lfDays === 1, 'ⓐ (가) — 넓히기의 다음 말뚝 칸이 부지 쪽(오늘 첫 영토 칸 = 부지 후보의 첫 영토 밖 칸 · 끔은 아니다) · 그 칸이 다 영토가 됐다', `첫 칸 ${ga.firstAdded} : 끔 ${off.firstAdded} · 부지 칸 ${ga.planAdded}/${ga.planCells} · 넓힘 ${ga.grown} · 앞세운 날 ${ga.lf && ga.lf.lfDays}`);
ok(ga.grown === off.grown && J(ga.site2) === J([988, 988]), 'ⓐ (가) — 하루 넓힌 칸 수는 끔과 같다(빠르기 그대로) · 다음 찾기가 그 자리를 잡는다', `넓힘 ${ga.grown} : ${off.grown} · 다시 찾기 ${J(ga.site2)}`);
ok(na.on && na.on.claim && J(na.site1) === J([988, 988]) && na.planInTerr1 && na.added1 === na.planCells, 'ⓐ (나) — 찾기 한 번에 부지 후보의 영토 밖 칸이 영토에 들고 그 자리에 집터', `집터 ${J(na.site1)} · 더한 칸 ${na.added1}/${na.planCells}`);
ok(na.owe > 0 && Math.abs(na.wood1 - na.owe) < 1e-6 && na.stat && na.stat.claims === 1, 'ⓐ (나) — 곳간 통나무가 그 칸들의 말뚝 값만큼 준다(영토에서 이어지는 차례 · `_t1207CellCost`)', `준 통나무 ${na.wood1} · 말뚝 값 ${na.owe} · 잡음 ${na.stat && na.stat.claims}`);
// ⓑ
console.log('\nⓑ 통나무 0 → (나) 거절 stake');
const nb = run('b', Object.assign({ T1380_LOT_CLAIM: '1' }, V2));
if (nb.err || nb.missing) console.log(`  (아이 b ${nb.err ? '오류: ' + nb.err.split('\n')[0] : 'T1380 주입구 없음'})`);
ok(nb.site1 === null && nb.n1 === 0 && nb.wood1 === 0 && nb.stake1 > 0 && nb.wait && !nb.rejHas, 'ⓑ 통나무 0 — 못 잡는다 · 까닭 stake · 영토 · 곳간 그대로 · 거부 기억에 안 든다', `집터 ${J(nb.site1)} · 영토 +${nb.n1} · stake ${nb.stake1} · 기다림 ${nb.wait} · 기억 ${nb.rejHas}`);
ok(nb.call2 === 2 && nb.skip2 === 0 && nb.site2 === null && J(nb.site3) === J([988, 988]) && nb.n3 > 0, 'ⓑ 다음 날 다시 본다(기억 건너뜀 0) · 통나무가 들면 잡는다', `부름 ${nb.call2} · 건너뜀 ${nb.skip2} · 다음 날 ${J(nb.site2)} · 통나무 든 뒤 ${J(nb.site3)} +${nb.n3}`);
// ⓒ
console.log('\nⓒ 남의 영토 · 물 칸은 안 넣는다');
const nc = run('c', Object.assign({ T1380_LOT_CLAIM: '1' }, V2));
if (nc.err || nc.missing) console.log(`  (아이 c ${nc.err ? '오류: ' + nc.err.split('\n')[0] : 'T1380 주입구 없음'})`);
ok(nc.nw === null && nc.ne === null && nc.se && !nc.se.b && !nc.se.w, 'ⓒ 부지 후보의 영토 밖 칸에 이웃 마을 영토(북서) · 물(북동)이 들면 넣을 칸 계획이 없다 · 깨끗한 모퉁이(남동)는 있다', `북서 ${J(nc.nw)} · 북동 ${J(nc.ne)} · 남동 ${J(nc.se)}`);
ok(nc.site && J(nc.site) !== J([988, 988]) && J(nc.site) !== J([1012, 988]) && nc.overlap === 0 && nc.wet === 0, 'ⓒ (나) 가 잡은 뒤 A ∩ B = ∅ · A 영토에 물 칸 0 · 집터는 다른 모퉁이', `집터 ${J(nc.site)} · 겹침 ${nc.overlap} · 물 ${nc.wet}`);
// ⓓ
console.log('\nⓓ 묶음(영토 v2) 끔 = 종전');
const ALL = { T1380_TERR_LOT_FIRST: '1', T1380_LOT_CLAIM: '1', T1380_START_FULL: '1', T1380_HAPPY_EXPAND: 'rate' };
const d0 = run('a', {}), d1 = run('a', ALL), d2 = run('a', Object.assign({ T1380_TERR_LOT_FIRST: '0', T1380_LOT_CLAIM: '0', T1380_START_FULL: '0', T1380_HAPPY_EXPAND: '0' }, V2));
ok(d1.on && !d1.on.v2 && !d1.on.full && !d1.on.lot && !d1.on.claim && !d1.on.happy, 'ⓓ 영토 v2 끔이면 T1380 손잡이를 "1"(행복 넓히기는 "rate")로 줘도 꺼진다', J(d1.on));
ok(d0.fp && J(d0.fp) === J(d1.fp), 'ⓓ 묶음 끔 — 같은 판(찾기 · 넓히기 · 다시 찾기)의 지문이 손잡이 없는 판과 같다', `${J(d0.fp)}${J(d0.fp) === J(d1.fp) ? '' : ' : ' + J(d1.fp)}`);
ok(off.fp && J(off.fp) === J(d2.fp), 'ⓓ 영토 v2 켬 · 손잡이 "0" = 손잡이 없음(같은 지문)', `${J(off.fp)}${J(off.fp) === J(d2.fp) ? '' : ' : ' + J(d2.fp)}`);
// ⓕ 덧붙임 둘 — 행복 넓히기
console.log('\nⓕ 행복 넓히기(덧붙임 둘 · `T1380_HAPPY_EXPAND`)');
const RT = (h) => run('f-rate', Object.assign({ T1380_START_FULL: '1', T1380_HAPPY_EXPAND: 'rate', T1380_TEST_H: String(h) }, V2));
const fr = [1, 0.5, 0.25].map(RT), fr0 = run('f-rate', Object.assign({ T1380_TEST_H: '0.5' }, V2));
for (const o of fr.concat([fr0])) if (o.err || o.missing) console.log(`  (아이 ${o.mode} ${o.err ? '오류: ' + o.err.split('\n')[0] : 'T1380 주입구 없음'})`);
ok(fr.every((o) => o.on && o.on.happy === 'rate') && J(fr.map((o) => o.grown)) === J([60, 30, 15]) && J(fr.map((o) => o.cut)) === J([0, 30, 45]) && fr0.grown === 60,
  "ⓕ 'rate' — 하루 넓힌 칸 = 60 × 행복(h 1 · 0.5 · 0.25 → 60 · 30 · 15 · 덜 넓힌 칸 셈 0 · 30 · 45) · 손잡이 없으면 h 0.5 여도 60", `${J(fr.map((o) => o.grown))} · 셈 ${J(fr.map((o) => o.cut))} · 끔 ${fr0.grown}`);
const LT = (h, vp) => run('f-lot', Object.assign({ T1380_LOT_CLAIM: '1', T1380_HAPPY_EXPAND: 'lot', T1380_TEST_H: String(h) }, V2), vp);
const fl6 = LT(0.6), fl1 = LT(1);
for (const o of [fl6, fl1]) if (o.err || o.missing) console.log(`  (아이 ${o.mode} ${o.err ? '오류: ' + o.err.split('\n')[0] : 'T1380 주입구 없음'})`);
ok(J(fl6.sites) === J([null, null, [988, 988]]) && J(fl1.sites) === J([null, [988, 988]]) && fl6.happy > 0 && fl1.happy > 0,
  "ⓕ 'lot' — 날마다 h 씩 쌓여 1 이 차는 날에만 그 자리 넣기(h 0.6 → 셋째 찾기 · h 1 → 둘째 찾기) · 그 전 찾기는 까닭 happy", `h 0.6 ${J(fl6.sites)} · h 1 ${J(fl1.sites)} · happy ${fl6.happy} · ${fl1.happy}`);
// ⓔ 미끼 — 정본 사본(바꾼 자리 정확히 1곳) · 같은 server/ 자리(상대 require 그대로)
console.log('\nⓔ 미끼(파일 안)');
const SRC = path.join(ROOT, 'server', 'villages.js');
const bait = (tag, from, to) => {
  const s = fs.readFileSync(SRC, 'utf8'), n = s.split(from).length - 1;
  const p = path.join(ROOT, 'server', `._t1380-bait-${process.pid}-${tag}.js`);
  if (n === 1) fs.writeFileSync(p, s.replace(from, to));
  return { n, p: n === 1 ? p : null };
};
{
  const b = bait('pay', "  if (owe > 1e-9) {\n    if (Math.max(0, E.woodSpare(e)) + 1e-9 < owe) return false;", "  if (false) {\n    if (Math.max(0, E.woodSpare(e)) + 1e-9 < owe) return false;");
  const o = b.p ? run('a', Object.assign({ T1380_LOT_CLAIM: '1' }, V2), b.p) : null;
  if (b.p) try { fs.unlinkSync(b.p); } catch (e) {}
  const red = !!(o && !o.err && J(o.site1) === J([988, 988]) && !(o.owe > 0 && Math.abs(o.wood1 - o.owe) < 1e-6));
  ok(b.n === 1 && red, 'ⓔ 미끼 — 말뚝 값을 안 치르게 바꾼 사본(`_t1380Pay` 의 치르기 문을 끈 사본)은 집터를 잡아도 곳간 통나무가 안 준다 → ⓐ 통나무 단언 빨강', `바꾼 자리 ${b.n} · 준 통나무 ${o && o.wood1} : 말뚝 값 ${o && o.owe}`);
}
{
  const b = bait('lot', "  const r = F.reject(x, y, strict, (xx, yy) => { if (!_t1380CanTake(vil, xx, yy, extra, near)) return false; extra.add(xx + ',' + yy); return true; });",
    "  const r = null; for (const [dx, dy] of _lifeVL().LOT_CELLS) { const k2 = (x + dx) + ',' + (y + dy); if (!vil._terrSet.has(k2)) extra.add(k2); }");
  const o = b.p ? run('c', Object.assign({ T1380_LOT_CLAIM: '1' }, V2), b.p) : null;
  if (b.p) try { fs.unlinkSync(b.p); } catch (e) {}
  const red = !!(o && !o.err && (o.nw !== null || o.ne !== null || o.overlap > 0 || o.wet > 0));
  ok(b.n === 1 && red, 'ⓔ 미끼 — 부지 술어(집터 판정 · 넣을 칸 술어)를 안 거친 사본은 이웃 마을 · 물 칸을 넣을 칸으로 센다 → ⓒ 빨강', `바꾼 자리 ${b.n} · 북서 ${J(o && o.nw)} · 북동 ${J(o && o.ne)} · 겹침 ${o && o.overlap} · 물 ${o && o.wet}`);
}
{
  const b = bait('happy', "  if (T1380_HAPPY_EXPAND === 'lot' && !((vil._t1380Ha || 0) >= 1 - 1e-9)) {", "  if (false) {");
  const o = b.p ? LT(0.6, b.p) : null;
  if (b.p) try { fs.unlinkSync(b.p); } catch (e) {}
  const red = !!(o && !o.err && J(o.sites) !== J([null, null, [988, 988]]));
  ok(b.n === 1 && red, "ⓔ 미끼 — 'lot' 이 h 를 안 타게 바꾼 사본은 첫 찾기에 그 자리를 넣는다 → ⓕ 'lot' 단언 빨강", `바꾼 자리 ${b.n} · ${J(o && o.sites)}`);
}
console.log(`\n${fail ? '✗' : '✓'} T1380 영토 v2 를 랩 넓이에 — ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
