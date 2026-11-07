#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-t1207-terr-real.js — 영토 확장 실물화(T1207 · ★재민 11-07) =============================
//
// ★지키는 것(존을 부팅하지 않는다 — 정본 `_terrGrow` · `_t1207*` · `terrQuote` 를 `__labProbe` 주입구와 내보낸 함수로 그대로 부른다):
//   ① 식 — 출처 수(개간 1.44 분/m² · 말뚝 1.8 m · 기둥 = 통나무 3) · 모양 배수(영토 1,500: 둥근 가장자리 ×1 · 2R ×11 · 3R ×41 · 띠 끝 ×345) · 크기 배수 · 경계 늘어남(4 − 2·nb)
//   ② NPC 헤드리스 — 통나무가 있으면 고른 셀을 치러 넓히고 곳간에서 그만큼 빠진다(소비 장부 `_cons`) · 없으면 그날 0 · 표지 · 수요 장부(`_t1207Need` → `woodShareD`)
//   ③ 개간 — 넓힌 셀에 선 그루를 정본 벌목 문으로 베어 곳간에 넣는다
//   ④ 몸 없는 날 — 넓히지 않는다(표지 body)
//   ⑤ 관측 마을 — 일감 줄에 싣고(그날 0) 몸이 끝낸 셀만 영토(`_t1207BodyDone`)
//   ⑥ 플레이어 마을 — 집 압력이 커도 저절로 안 자란다 · 끔(자식)이면 자란다
//   ⑦ `terrQuote` — 맞닿은 플레이어 마을 · NPC 마을 땅 거절 · 막힘 · 이미 남의 땅 · 둥글게 ↔ 칠레형 띠(같은 셀 수 총값 표)
//   ⑧ 끔(자식 `T1207_TERR_REAL=0`) — 고른 셀 전부 · 통나무 0(종전 그대로)
//   ⑨ 글자 — 손잡이 하나 · 존 두 문 · 클라 동사 · 수요 장부 한 줄
//
// 실행: node scripts/test-t1207-terr-real.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t1207-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function fixture() {
  const V = require(path.join(ROOT, 'server/villages.js'));
  const E = require(path.join(ROOT, 'sim/economy-sim.js'));
  const P = V.__labProbe;
  const ta = { isBlocked: (x, y) => x === 999 && y === 999, isRock: () => false, isWater: () => false, fert: () => 0.5, forestMult: () => 1 };
  const disc = (cx, cy, R) => { const s = new Set(); for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) if (dx * dx + dy * dy <= R * R) s.add((cx + dx) + ',' + (cy + dy)); return s; };
  //   네모 영토(반변 h) — 가장자리 밖 셀이 모두 이웃 1(새 경계 2 m · 말뚝이 든다). 원판은 계단 안쪽 모서리(이웃 2 · 말뚝 0)부터 고른다(중심에 가까운 차례).
  const square = (cx, cy, h) => { const s = new Set(); for (let dx = -h; dx <= h; dx++) for (let dy = -h; dy <= h; dy++) s.add((cx + dx) + ',' + (cy + dy)); return s; };
  const players = new Map();
  const body = (pid) => { const p = { pid, isNpc: true, hp: 100, maxHp: 100, inventory: {} }; players.set(pid, p); return p; };
  const mkEcon = (pop) => { const e = E.createVillage({ name: 'T', initialPop: pop, fertility: 0.6, water: 0.5, wood: 0.6, stone: 0.4, game: 0.4, ore: 0, size: 100 }); return e; };
  const mk = (id, name, cx, cy, R, o) => Object.assign({ dbId: id, name, ccx: cx, ccy: cy, _terrSet: R < 0 ? square(cx, cy, -R) : disc(cx, cy, R), _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(),
    _houseCells: [], _granList: [], _ditch: [], _shelter: null, _site: null, _psite: null, npcPids: [], econ: mkEcon(40) }, o || {});
  let seen = false;
  const trees = new Map();   // 'x,y' → 그루 수(가짜 색인 — 정본 문 모양만)
  const deps = { players, dayPhaseRatio: 0.7, moveSpeed: 64, anyViewerNear: () => seen, broadcast: () => {},
    t325TreesAtCell: (x, y) => { const n = trees.get(x + ',' + y) || 0; return n > 0 ? new Array(n).fill({ type: 'tree' }) : []; },
    t325CutTreeAt: (x, y) => { const k = x + ',' + y, n = trees.get(k) || 0; if (!(n > 0)) return null; trees.set(k, n - 1); return { wood: 5, twig: 1 }; },
    t325LootOf: () => ({ wood: 5, twig: 1 }), clearTreesInCells: () => 0 };
  //   영토 밖으로 맞닿은 첫 셀(이웃 문 차례 · 막힘 · 남의 땅이 아닌 칸)
  const edge = (vil) => { for (const k of vil._terrSet) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k2 = (x + dx) + ',' + (y + dy); if (!vil._terrSet.has(k2)) return [x + dx, y + dy]; } } return null; };
  return { V, E, P, ta, disc, square, players, body, mkEcon, mk, deps, trees, edge, setSeen: (b) => { seen = b; } };
}

function run() {
  const F = fixture(), { V, E, P } = F;
  const T = require(path.join(ROOT, 'server/terr-cost.js'));
  const out = { on: V.T1207_TERR_REAL };
  // ① 식
  const R15 = T.radiusOf(1500);
  out.f = { min: T.clearMinPerM2(), post: T.woodPerPost(), sp: T.POST_SRC.spacingM, k: T.K, a: T.ALPHA,
    sh: [1, 2, 3].map((q) => +T.mult(1500, q * R15, 1500).shape.toFixed(3)).concat([+T.mult(1500, 150, 1500).shape.toFixed(1)]),
    size1: T.mult(1500, 1, 1500).size, size2: +T.mult(3000, 1, 1500).size.toFixed(6), g: [0, 1, 2, 3, 4].map((nb) => T.boundaryGrowth(nb)) };
  // ② 헤드리스 — 통나무 있음
  const keepV = P._t569Probe.setup({ ta: F.ta, villages: [], db: null });
  const keepD = P._t400Probe.setup({ deps: F.deps, dayMs: 250 });
  const A = F.mk(1, 'A', 1000, 1000, -27);
  A.econ.land.size = 400; A.econ.housing = 600;   // 목표(집 압력) 크게 · 상한(T538)이 묶지 않게 인구 크게
  A.econ.npcs = new Array(400).fill(0).map((_, i) => A.econ.npcs[i % A.econ.npcs.length]);
  F.body(101); A.npcPids = [101];
  P._t569Probe.setup({ ta: F.ta, villages: [A], db: null });
  A.econ.storage.wood = 5000;
  const w0 = A.econ.storage.wood, s0 = A._terrSet.size, cons0 = (A.econ._consDay && A.econ._consDay.wood) || 0, own0 = new Set(A._terrSet);
  F.trees.set('1028,1000', 2);   // 동쪽 가운데 첫 칸(네모 반변 27 밖 한 칸 · 중심에 가장 가까운 후보 넷 중 하나)에 두 그루
  const n1 = P._t569Probe.grow(A);
  const St = A._t1207;
  out.a = { n1, s0, s1: A._terrSet.size, took: +(w0 - A.econ.storage.wood).toFixed(4), stWood: +St.wood.toFixed(4), cons: +(((A.econ._consDay && A.econ._consDay.wood) || 0) - cons0).toFixed(4),
    felled: St.felled, woodIn: St.woodIn, wait: A._t1207Wait, need: A.econ._t1207Need, labor: +St.laborMin.toFixed(3), cells: St.cells, tree: F.trees.get('1028,1000') || 0, had1031: A._terrSet.has('1028,1000'),
    added: [...A._terrSet].filter((k) => !own0.has(k)).sort() };
  // ②-ⓑ 통나무 없음 — 그날 0 · 표지 · 수요 장부
  const B = F.mk(2, 'B', 2000, 2000, -27); B.econ.land.size = 400; B.econ.housing = 600; B.econ.npcs = A.econ.npcs.slice(); F.body(102); B.npcPids = [102];
  P._t569Probe.setup({ ta: F.ta, villages: [B], db: null });
  B.econ.storage.wood = 0;
  const sb0 = B._terrSet.size;
  const nb = P._t569Probe.grow(B);
  out.b = { nb, same: B._terrSet.size === sb0, wait: B._t1207Wait, need: B.econ._t1207Need, shareD: E.woodShareD(B.econ), left: E.woodDemandLeft(B.econ), stall: B._t1207.stallWood,
    deriv: E.derivedInputTarget ? E.derivedInputTarget(B.econ, 'wood') : null, derivA: E.derivedInputTarget ? E.derivedInputTarget(A.econ, 'wood') : null };
  // ④ 몸 없는 날
  const C = F.mk(3, 'C', 3000, 3000, -27); C.econ.land.size = 400; C.econ.housing = 600; C.econ.npcs = A.econ.npcs.slice(); C.npcPids = [];
  P._t569Probe.setup({ ta: F.ta, villages: [C], db: null }); C.econ.storage.wood = 5000;
  const nc = P._t569Probe.grow(C);
  out.c = { nc, stallBody: C._t1207.stallBody, wait: C._t1207Wait };
  // ⑤ 관측 마을 — 줄에 싣고 그날 0 · 몸이 끝낸 셀만
  const D = F.mk(4, 'D', 4000, 4000, -27); D.econ.land.size = 400; D.econ.housing = 600; D.econ.npcs = A.econ.npcs.slice(); F.body(104); D.npcPids = [104];
  P._t569Probe.setup({ ta: F.ta, villages: [D], db: null }); D.econ.storage.wood = 5000; F.setSeen(true);
  const sd0 = D._terrSet.size, nd = P._t569Probe.grow(D), q = (D._t1207Pend || []).length, j = D._t1207Pend && D._t1207Pend[0];
  const done = j ? V._t1207BodyDone(D, j) : 0;
  out.d = { nd, q, done, grew: D._terrSet.size - sd0, left: (D._t1207Pend || []).length, need: D.econ._t1207Need, has: j ? D._terrSet.has(j.key) : false };
  F.setSeen(false);
  // ⑥ 플레이어 마을 — 저절로 안 자란다
  const Pv = F.mk(5, 'P', 5000, 5000, 4); Pv.econ.founder = 'pl1'; Pv.econ.land.size = 400; Pv.econ.housing = 3000; Pv.econ.storage.wood = 5000; F.body(105); Pv.npcPids = [105];
  P._t569Probe.setup({ ta: F.ta, villages: [Pv, A], db: null });
  const sp0 = Pv._terrSet.size, np = P._t569Probe.grow(Pv);
  out.p = { np, same: Pv._terrSet.size === sp0, size: sp0 };
  // ⑦ terrQuote — 맞닿음 · 거절 · 둥글게 ↔ 칠레형
  const ex = 5000 + 4 + 1;   // 반경 4 원의 동쪽 끝 바로 밖
  const ae = F.edge(A);
  out.q = { ok: V.terrQuote(ex, 5000), far: V.terrQuote(ex + 5, 5000), npc: V.terrQuote(ae[0], ae[1]), own: V.terrQuote(5000, 5000), blk: V.terrQuote(999, 999) };
  //   둥글게 ↔ 띠 — 같은 칸 수(N)를 더할 때 값의 합(개간 분 · 통나무) — 셀마다 그때의 영토로 값을 매긴다(플레이어가 한 칸씩 넓히는 그 문)
  const grow = (vil, order, N) => { let lab = 0, wood = 0, maxM = 0; for (let i = 0; i < N; i++) { const k = order(vil); if (!k) break; const [x, y] = k; const c = V._t1207CellCost(vil, x, y, null); lab += c.laborMin; wood += Math.ceil(c.wood - 1e-9); if (c.m > maxM) maxM = c.m; vil._terrSet.add(x + ',' + y); } return { lab: +lab.toFixed(1), wood, maxM: +maxM.toFixed(1), size: vil._terrSet.size }; };
  const frontier = (vil) => { const out2 = []; for (const kk of vil._terrSet) { const [x, y] = kk.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k2 = (x + dx) + ',' + (y + dy); if (!vil._terrSet.has(k2)) out2.push([x + dx, y + dy]); } } return out2; };
  const roundNext = (vil) => { let best = null, bd = Infinity; for (const c of frontier(vil)) { const d = Math.hypot(c[0] - vil.ccx, c[1] - vil.ccy) + (c[1] - vil.ccy) * 1e-6 + (c[0] - vil.ccx) * 1e-9; if (d < bd) { bd = d; best = c; } } return best; };
  const stripNext = (w) => (vil) => { let best = null, bd = -Infinity; for (const c of frontier(vil)) { if (Math.abs(c[1] - vil.ccy) > (w - 1) / 2 || c[0] < vil.ccx) continue; const d = c[0] * 1000 - Math.abs(c[1] - vil.ccy); if (best === null || c[0] < best[0] || (c[0] === best[0] && Math.abs(c[1] - vil.ccy) < Math.abs(best[1] - vil.ccy))) { best = c; bd = d; } } void bd; return best; };
  const tbl = [];
  for (const N of [500, 1500]) {
    const R1 = F.mk(10 + N, 'R', 7000, 7000, 22); R1.econ.founder = 'x';   // 원 반경 22 = 약 1,500칸(TERR_CORE 둘레)
    const S1 = F.mk(20 + N, 'S', 9000, 7000, 22); S1.econ.founder = 'x';
    P._t569Probe.setup({ ta: F.ta, villages: [R1, S1], db: null });
    const r = grow(R1, roundNext, N), st = grow(S1, stripNext(10), N);
    tbl.push({ N, start: F.disc(0, 0, 22).size, round: r, strip: st, xLab: +(st.lab / r.lab).toFixed(2), xWood: +(st.wood / Math.max(1, r.wood)).toFixed(2) });
  }
  out.tbl = tbl;
  P._t569Probe.setup(keepV); P._t400Probe.setup(keepD);
  return out;
}
function runOff() {
  const F = fixture(), { P } = F;
  P._t569Probe.setup({ ta: F.ta, villages: [], db: null });
  P._t400Probe.setup({ deps: F.deps, dayMs: 250 });
  const A = F.mk(1, 'A', 1000, 1000, 30); A.econ.land.size = 400; A.econ.housing = 600;
  A.econ.npcs = new Array(400).fill(A.econ.npcs[0]); F.body(101); A.npcPids = [101];
  P._t569Probe.setup({ ta: F.ta, villages: [A], db: null }); A.econ.storage.wood = 0;
  const s0 = A._terrSet.size, n = P._t569Probe.grow(A);
  //   같은 네모 마을(켬 ② 와 같은 땅 · 같은 몸)이 끔에서 고른 셀 — 켬이 다 치렀을 때 더한 셀과 같아야 한다(고르는 법 그대로)
  const Q = F.mk(1, 'A', 1000, 1000, -27); Q.econ.land.size = 400; Q.econ.housing = 600;
  Q.econ.npcs = new Array(400).fill(0).map((_, i) => Q.econ.npcs[i % Q.econ.npcs.length]); Q.npcPids = [101];
  P._t569Probe.setup({ ta: F.ta, villages: [Q], db: null }); Q.econ.storage.wood = 5000;
  const q0 = new Set(Q._terrSet); P._t569Probe.grow(Q);
  const addedSq = [...Q._terrSet].filter((k) => !q0.has(k)).sort();
  const Pv = F.mk(5, 'P', 5000, 5000, 4); Pv.econ.founder = 'pl1'; Pv.econ.land.size = 400; Pv.econ.housing = 3000;
  P._t569Probe.setup({ ta: F.ta, villages: [Pv], db: null });
  const np = P._t569Probe.grow(Pv);
  return { on: F.V.T1207_TERR_REAL, n, s0, s1: A._terrSet.size, wood: A.econ.storage.wood, np, t: !!A._t1207, need: A.econ._t1207Need, addedSq, deriv: F.E.derivedInputTarget ? F.E.derivedInputTarget(A.econ, 'wood') : null, act: F.E.actFromGranary(Object.assign({}, A.econ, { storage: { wood: 9 } }), 'wood', 1) };
}

if (process.env.T1207_CHILD === '1') { const o = process.env.T1207_TERR_REAL === '0' ? runOff() : run(); process.stdout.write('@@T1207 ' + JSON.stringify(o) + '\n'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sec = (t) => console.log('\n' + t);
const child = (env) => { const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1207_CHILD: '1' }, env), encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20 });
  const l = (r.stdout || '').split('\n').find((x) => x.startsWith('@@T1207 ')); if (!l) { console.log(r.stdout, r.stderr); return null; } return JSON.parse(l.slice(8)); };
const ON = child({ T1207_TERR_REAL: '1' }), OFF = child({ T1207_TERR_REAL: '0' });
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

console.log('\n=== T1207 영토 확장 실물화 — 개간 노동 + 경계 말뚝 · 크기 · 길쭉함 · NPC 곳간 · 몸 ===');
sec('① 식 — 출처 수 · 모양 · 크기 · 경계 늘어남');
if (!ON) ok(false, '켬 자식 판이 안 섰다');
else {
  const f = ON.f;
  ok(near(f.min, 1.44) && f.post === 3 && f.sp === 1.8, '★개간 1.44 사람·분/m²(드라베드 3명 × 4시간 ÷ 500 m²) · 말뚝 1.8 m 간격(송국리) · 말뚝 = 정본 기둥 = 통나무 3', f);
  ok(f.k === 1.01 && f.a === 10, '정해진 수 — k 1.01(★재민) · α 첫 후보 10(카드)', f);
  ok(near(f.sh[0], 1) && near(f.sh[1], 11) && near(f.sh[2], 41) && near(f.sh[3], 344.9, 0.1), '★영토 1,500 에서 둥근 가장자리 ×1 · 2R ×11 · 3R ×41 · 폭 10 길이 150 띠 끝 ×345(카드 예시 그대로)', f.sh);
  ok(f.size1 === 1 && near(f.size2, Math.pow(2, 1.01), 1e-6), '크기 배수 — 시작 영토면 ×1 · 두 배면 ×2^1.01', f);
  ok(JSON.stringify(f.g) === '[4,2,0,0,0]', '경계 늘어남 = 4 − 2·nb(0 밑은 0) — 맞닿은 변의 말뚝은 뽑아 새 변에 다시 세운다', f.g);
}
sec('② NPC 헤드리스 — 통나무가 있으면 치른 만큼 넓히고 곳간에서 빠진다');
if (ON) {
  const a = ON.a;
  ok(a.n1 > 0 && a.s1 === a.s0 + a.n1 && a.cells === a.n1, `★고른 셀을 치러 넓혔다 — +${a.n1}칸(${a.s0} → ${a.s1})`, a);
  ok(a.took > 0 && near(a.took + a.woodIn, a.stWood + a.woodIn, 1e-3) && near(a.took, a.stWood - a.woodIn, 1e-3) && near(a.cons, a.stWood, 1e-3), `★곳간 통나무가 말뚝 몫만큼 빠졌다(${a.stWood} — 개간 통나무 ${a.woodIn} 이 들어온 뒤 순 ${a.took}) · 소비 장부(_cons)에 말뚝 몫 그대로`, a);
  ok(a.wait === null && a.need === 0, '다 치렀다 — 표지 0 · 수요 장부 0', a);
  ok(a.labor > 0, `개간 노동 ${a.labor} 분(셀마다 1.44 × 배수)`, a.labor);
}
sec('③ 개간 — 넓힌 셀의 그루가 정본 벌목 문으로 곳간에');
if (ON) ok(ON.a.had1031 && ON.a.felled === 2 && ON.a.tree === 0, `★넓힌 셀의 그루 둘을 베었다(정본 벌목 문 · 곳간이 받은 통나무 ${ON.a.woodIn} — 수요 문이 받는 만큼 · 나머지는 T717 마을 짐)`, ON.a);
sec('②-ⓑ 통나무가 없으면 그날 0 · 표지 · 수요 장부');
if (ON) {
  const b = ON.b;
  ok(b.nb === 0 && b.same && b.stall === 1 && b.wait && b.wait.why === 'wood', '★재료가 없다 — 그날 넓히지 않는다(대기 · 표지 why=wood)', b);
  ok(b.need > 0 && near(b.shareD, b.need, 1e-6) && b.left > 0, `★못 치른 통나무 ${b.need} 가 수요 장부에 — 나무꾼 문 D(woodShareD)가 그만큼 더 본다`, b);
  ok(near(b.need, ON.a.stWood, 1e-3), `★모자람 = 같은 네모 마을이 통나무가 있을 때 실제로 치른 값(${ON.a.stWood}) — 앞 셀을 치렀다 치고 이웃을 센다(부풀림 0)`, [b.need, ON.a.stWood]);
  ok(near(b.deriv, b.need, 1e-9) && b.derivA === 0, `★파생수요(\`derivedInputTarget\` 'wood') = 모자람 ${b.need} — 통나무 값(v2 목표)이 보고 직업 고르기가 나무꾼을 더 본다 · 다 치른 마을은 0`, [b.deriv, b.derivA]);
}
sec('④ 몸 없는 날 — 넓히지 않는다');
if (ON) ok(ON.c.nc === 0 && ON.c.stallBody === 1 && ON.c.wait && ON.c.wait.why === 'body', '★그날 나설 몸이 없다 — 0 · 표지 body', ON.c);
sec('⑤ 관측 마을 — 몸이 끝낸 셀만 영토');
if (ON) {
  const d = ON.d;
  ok(d.nd === 0 && d.q > 0, `★고른 셀 ${d.q}개를 일감 줄에 싣고 그날 바로 더하지 않는다`, d);
  ok(d.done === 1 && d.grew === 1 && d.has && d.left === d.q - 1, '★몸이 끝낸 첫 셀 하나만 영토가 됐다(_t1207BodyDone)', d);
}
sec('⑥ 플레이어 마을 — 집 압력이 커도 저절로 안 자란다');
if (ON) ok(ON.p.np === 0 && ON.p.same, `★집 압력 목표(${3000} 주거)인데도 영토 그대로(${ON.p.size}칸) — 우클릭 넓히기로만`, ON.p);
if (OFF) ok(OFF.np > 0, `끔(자식)이면 같은 플레이어 마을이 그날 +${OFF.np}칸 자란다(종전)`, OFF);
sec('⑦ terrQuote — 맞닿음 · 거절 · 값');
if (ON) {
  const q = ON.q;
  ok(q.ok.ok && q.ok.vid === 5 && q.ok.nb >= 1 && q.ok.laborMin > 0 && q.ok.wood >= 0 && Number.isInteger(q.ok.wood), `★맞닿은 플레이어 마을의 값 — 개간 ${q.ok.laborMin}분 · 통나무 ${q.ok.wood}(올림) · 배수 ×${q.ok.m}`, q.ok);
  ok(!q.far.ok && /맞닿은/.test(q.far.err), '맞닿지 않은 칸 — 거절', q.far.err);
  ok(!q.npc.ok && /스스로/.test(q.npc.err), 'NPC 마을 땅 옆 — "마을이 스스로 넓힙니다"', q.npc.err);
  ok(!q.own.ok && /이미/.test(q.own.err) && !q.blk.ok && /물이나 바위/.test(q.blk.err), '이미 땅 · 막힌 칸 — 거절', [q.own.err, q.blk.err]);
  for (const r of ON.tbl) console.log(`     N ${r.N}: 둥글게 개간 ${r.round.lab}분 · 통나무 ${r.round.wood} · 최대 ×${r.round.maxM} | 띠(폭 10) 개간 ${r.strip.lab}분 · 통나무 ${r.strip.wood} · 최대 ×${r.strip.maxM} | 띠 ÷ 둥글게 개간 ×${r.xLab} · 통나무 ×${r.xWood}`);
  ok(ON.tbl.every((r) => r.xLab > 1 && r.xWood > 1) && ON.tbl[1].xLab > ON.tbl[0].xLab, '★칠레형 띠가 같은 칸 수에서 둥글게보다 비싸다 · 길어질수록 더 벌어진다', ON.tbl.map((r) => [r.N, r.xLab, r.xWood]));
}
sec('⑧′ 고르는 법 그대로 — 켬이 다 치른 날의 셀 = 끔이 고른 셀');
if (ON && OFF) ok(ON.a.added.length === 60 && JSON.stringify(ON.a.added) === JSON.stringify(OFF.addedSq), `★같은 네모 마을 · 같은 날 — 켬(통나무 넉넉)이 더한 ${ON.a.added.length}칸 = 끔이 고른 ${OFF.addedSq.length}칸(셀 하나하나 같다 · 점수 · 목표 · 상한 무변)`, [ON.a.added.length, OFF.addedSq.length]);
sec('⑧ 끔 — 종전 그대로');
if (!OFF) ok(false, '끔 자식 판이 안 섰다');
else ok(OFF.on === false && OFF.n > 0 && OFF.s1 === OFF.s0 + OFF.n && OFF.wood === 0 && !OFF.t && OFF.need === undefined && OFF.deriv === 0, `★끔 — 통나무 0 인데도 고른 셀 +${OFF.n} · 장부 칸 0 · 수요 칸 없음 · 파생수요 0(종전)`, OFF);
sec('⑨ 글자 — 손잡이 하나 · 존 두 문 · 클라 동사 · 수요 장부');
{
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const VS = rd('server/villages.js'), Z = rd('server/zone.js'), C46 = rd('public/client/46-h-verbs.js'), C30 = rd('public/client/30-n-net.js'), EC = rd('sim/economy-sim.js'), TC = rd('server/terr-cost.js');
  ok((VS.match(/const T1207_TERR_REAL = process\.env\.T1207_TERR_REAL === '1';/g) || []).length === 1 && !/T1207_[A-Z_]+ = process\.env/.test(Z) && /process\.env\.T1207_TERR_REAL === '1'\);/.test(EC), '손잡이 하나(`T1207_TERR_REAL` · 끔 기본 · `=1` 켬 · 마을 파일 한 자리 + econ 곳간 출구 같은 글자 · 존은 마을 모듈을 읽는다)');
  ok(/if \(T1207_TERR_REAL && vil\.econ && vil\.econ\.founder\) return 0;/.test(VS) && /const take = T1207_TERR_REAL \? _t1207Pay\(vil, picked\) : picked;/.test(VS), '★`_terrGrow` — 플레이어 마을은 저절로 0 · NPC 는 고른 셀을 치른 만큼(끔 = 고른 셀 전부)');
  ok(/msg\.type === 'terr_quote'\) tryTerrQuote/.test(Z) && /msg\.type === 'terr_work'\) tryTerrWork/.test(Z) && /terrPlayerAdd\(job\.vid, cx, cy\)/.test(Z), '존 두 문 — 값 미리 보기 · 그 셀에서 일하기(서버 시계)');
  ok(/label: '영토 넓히기'/.test(C46) && /function verbsOnTerr\(msg\)/.test(C46) && /verbsOnTerr\(msg\)/.test(C30) && /msg\.type === 'village_bnd'/.test(C30), '클라 — 땅 우클릭 "영토 넓히기" · 답 · 외곽선');
  ok(/\(\(v && v\._t1207Need\) \|\| 0\)/.test(EC) && /T1207_TERR_ACT/.test(EC), '수요 장부 — `woodShareD` 에 영토 말뚝 몫 한 항 · 곳간 출구 문에 손잡이');
  ok(/three men in four hours/.test(TC) && /180 cm 간격/.test(TC) && /Carneiro 1979/.test(TC), '출처 줄 — 드라베드(Britannica) · 송국리 목책(180 cm) · Carneiro(참고)');
}
console.log(`\n=== T1207: ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
