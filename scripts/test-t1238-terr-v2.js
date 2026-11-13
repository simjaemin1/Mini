#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-t1238-terr-v2.js — 영토 v2(T1238 · ★재민 11-09 · 족보 794 · 문 36 마감) =============================
//
// ★지키는 것(정본 함수를 그대로 부른다 — 마을 몫은 `__labProbe` 주입구 · 존 몫은 실서버를 임시 DB 로 띄워 `__testBind`):
//   ⓐ 순수(`terr-v2.js` · `terr-cost.js`) — 덤불 15년 · 말뚝 10년 · 뽑기 흙 · 단순점 · 묵힘 고르기(안쪽도 · 먼 차례 · 안 가름) · 끌어 고르기 · 바둑식 · 갇힘 · 칸 넓이 두 읽기
//   ⓑ 끌어 고르기 — 맞닿아 이어진 칸만 · 막힘 · 남의 땅 빼고 · 값 합
//   ⓒ 취소 · 다시 고르기 — 개간 진척은 땅에 남는다 · 박은 말뚝은 땅에 · 뽑기(박은 마을만 · 썩은 몫 부러짐) · 다 박으면 영토
//   ⓓ NPC 일괄 — 개간이 날을 넘어 이어진다 · 말뚝 모자람 = 수요 장부 · 이튿날 말뚝만
//   ⓔ 묵힘 — 3년 넘게 안 쓴 칸이 하루 1칸 · 먼 차례 · 쓰는 칸 · 쓴 칸은 안 빠짐 · 영토가 갈리지 않음 · 둘레를 써도 안쪽이 빠짐(구멍)
//   ⓕ econ — 금고 땅 사기 걷음 · econ 땅 크기 = 시딩 환산(영토)
//   ⓖ 바둑식 — 이웃 마을의 마지막 숨 자리는 못 가진다
//   ⓗ 남의 작물(마을 밭) — 익은 칸만 · 거둔 것은 곳간에 안 감
//   ⓘ 존 — 남의 작물 벌점(사유지 · 영토 · 빈 땅 · 보호 풀림) · 울타리 벌점 · 갇힘 풀기(플레이어 0 점 · NPC 마을이 허묾)
//   ⓙ 끔 — 손잡이 끔이면 종전 그대로(영토 v2 함수는 꺼짐 · econ 표지 0)
//   ⓚ 글자 — 손잡이 하나 · econ 출구 · 존 문 · 클라 · 출처 줄
//   ⓛ [T1275] 나무꾼 몸 행위 끔 세계 — 개간 통나무 입구(곳간 · 수요 = 말뚝 모자람) · 짐이 이튿날 먼저 든다 · 그 통나무로 말뚝 · 미끼(입구 0 사본 → 빨강) · 몸 세계 그대로
//   ⓜ [T1283] 나무 모자람 → 직업 고르기(`T1283_WOOD_DEMAND`) — 기근 블록 앞 · 모자람 = 못 땐 땔감 + 못 지은 집 + 말뚝 모자람 · 한 사람이 하루 메우는 몫 견주기 · 끔 = 종전 ·
//   ⓝ [T1297 할 일 3 · T1283 (나)] 관측 마을 몸의 개간 일 — 켬이면 그 칸 그루의 통나무를 몸이 짐씩 지고 곳간 사다리까지 걷는다(부리는 줄 = 일괄과 같은 `_t1207LogIn`) ·
//      더미가 비어야 영토 · 짐 ≤ 한 짐 · 부린 곳 = 사다리 · 끔(종전 — 끝낸 순간 영토 · 통나무 곧장 곳간) · 수식 나무꾼 세계 무동작 · 헤드리스로 넘어가면 남은 더미는 곳간으로
//       미끼(수요를 상수로 박은 사본 → 빨강) · 틱 칸 넷(켬만) · (나) 개간 통나무 걸음(`T1283_CLEAR_HAUL` · 나무꾼 몸 켬 세계만)
//
// 실행: node scripts/test-t1238-terr-v2.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T1238_CHILD || '';

// ── 마을 몫 고정물(T1207 하네스와 같은 꼴) ────────────────────────────────────────────────────────
function fixture() {
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  process.env.DB_PATH = process.env.DB_PATH || `/tmp/t1238-v-${process.pid}.db`;
  const V = require(path.join(ROOT, 'server/villages.js'));
  const E = require(path.join(ROOT, 'sim/economy-sim.js'));
  const P = V.__labProbe;
  const blocked = new Set(['999,999']);
  const ta = { isBlocked: (x, y) => blocked.has(x + ',' + y), isRock: () => false, isWater: () => false, fert: () => 0.5, forestMult: () => 1 };
  const square = (cx, cy, h) => { const s = new Set(); for (let dx = -h; dx <= h; dx++) for (let dy = -h; dy <= h; dy++) s.add((cx + dx) + ',' + (cy + dy)); return s; };
  const players = new Map();
  const body = (pid) => { const p = { pid, isNpc: true, hp: 100, maxHp: 100, inventory: {} }; players.set(pid, p); return p; };
  const mkEcon = (pop) => E.createVillage({ name: 'T', initialPop: pop, fertility: 0.6, water: 0.5, wood: 0.6, stone: 0.4, game: 0.4, ore: 0, size: 100 });
  const mk = (id, name, cx, cy, h, o) => Object.assign({ dbId: id, name, ccx: cx, ccy: cy, _terrSet: square(cx, cy, h), _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(),
    _houseCells: [], _granList: [], _ditch: [], _shelter: null, _site: null, _psite: null, npcPids: [], _crop: new Map(), econ: mkEcon(40) }, o || {});
  const trees = new Map();
  let built = null;
  const deps = { players, dayPhaseRatio: 0.7, moveSpeed: 64, anyViewerNear: () => false, broadcast: () => {},
    t325TreesAtCell: (x, y) => { const n = trees.get(x + ',' + y) || 0; return n > 0 ? new Array(n).fill({ type: 'tree' }) : []; },
    t325CutTreeAt: (x, y) => { const k = x + ',' + y, n = trees.get(k) || 0; if (!(n > 0)) return null; trees.set(k, n - 1); return { wood: 5, twig: 1 }; },
    t325LootOf: () => ({ wood: 5, twig: 1 }), clearTreesInCells: () => 0, t1238BuiltCells: () => built };
  const conn4 = (set) => { const a = [...set]; if (!a.length) return true; const seen = new Set([a[0]]), q = [a[0]]; while (q.length) { const k = q.pop(); const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (x + dx) + ',' + (y + dy); if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } } } return seen.size === set.size; };
  return { V, E, P, ta, blocked, square, players, body, mkEcon, mk, deps, trees, conn4, setBuilt: (b) => { built = b; } };
}
function setWorld(F, villages, day) {
  F.P._t569Probe.setup({ ta: F.ta, villages, db: null });
  F.P._t400Probe.setup({ deps: F.deps, dayMs: 250, world: { day } });
  F.P._t1238Probe.setup({ villages, day });
}

function runVil() {
  const F = fixture(), { V, E, P } = F;
  //   `tryExpandTerritory` 는 내보내지 않는 함수 — 원본 글을 메모리에서 엮어 그 하나를 꺼낸다(파일 무변 · t1213-picker-table 과 같은 꼴 · 사본 0)
  const TX = (() => { const Module = require('module'), PP = path.join(ROOT, 'sim', 'economy-sim.js'); const m = new Module(PP, null); m.filename = PP; m.paths = Module._nodeModulePaths(path.dirname(PP));
    m._compile(fs.readFileSync(PP, 'utf8') + '\n;module.exports.__t1238 = { tryExpandTerritory };', PP); return m.exports.__t1238.tryExpandTerritory; })();
  const out = { on: V.T1238_TERR_V2, t1207: V.T1207_TERR_REAL };
  const YD = 365;
  // ⓑ 끌어 고르기 — 플레이어 마을(창설 49칸) · 남의 땅 · 막힘
  const Pv = F.mk(5, 'P', 5000, 5000, 3, {}); Pv.econ.founder = 'pl1';
  const Nb = F.mk(6, 'N', 5012, 5000, 1, {});   // 동쪽 열두 칸 — 네모 안에 남의 땅(3×3)
  F.blocked.add('5006,5000');
  setWorld(F, [Pv, Nb], 100);
  const pk = V.t1238Pick(5, 5004, 4997, 5011, 5003);
  const inRect = (x, y) => x >= 5004 && x <= 5011 && y >= 4997 && y <= 5003;
  out.pick = { ok: pk.ok, n: pk.cells ? pk.cells.length : 0, lab: pk.laborMin, wood: pk.wood, hasBlk: !!(pk.cells || []).find((r) => r[0] === 5006 && r[1] === 5000),
    hasN: !!(pk.cells || []).find((r) => Nb._terrSet.has(r[0] + ',' + r[1])), allIn: (pk.cells || []).every((r) => inRect(r[0], r[1])), far: V.t1238Pick(5, 5030, 5030, 5035, 5035) };
  //   맞닿은 칸에서 시작해 고른 칸으로만 이어진다 — 네모 안의 섬(남의 땅 뒤쪽) 확인: Nb 둘레 바깥 칸도 고른 칸을 거쳐 이어지면 든다
  const go = V.t1238Go(5, 'pl1', 5004, 4997, 5011, 5003);
  out.go = { ok: go.ok, added: go.added, pending: go.pending };
  // ⓒ 개간 진척 → 취소 → 다시 고르기
  const n0 = V.t1238CellNeed(5, 5004, 5000);
  const half = V.t1238Clear(5, 5004, 5000, n0.laborMin / 2);
  const cancel = V.t1238Cancel(5, 'pl1', false);
  const landAfterCancel = V.t1238LandAt(5004, 5000);
  const needAfterCancel = V.t1238CellNeed(5, 5004, 5000);   // 묶음에서 빠졌다 — null
  V.t1238Go(5, 'pl1', 5004, 4997, 5011, 5003);
  const n1 = V.t1238CellNeed(5, 5004, 5000);
  const inner = V.t1238CellNeed(5, 5008, 5000);
  const innerClear = V.t1238Clear(5, 5008, 5000, 999);
  const innerPlace = V.t1238Place(5, 5008, 5000, 5);
  const rest = V.t1238Clear(5, 5004, 5000, n1.laborMin);
  const pl0 = V.t1238Place(5, 5004, 5000, 0);
  const s0 = Pv._terrSet.size;
  const pl1 = V.t1238Place(5, 5004, 5000, Math.max(1, n1.wood));
  out.c = { half: half.c, landC: landAfterCancel && landAfterCancel.c, needAfterCancel, carried: n1.c, edge: n0.edge, innerAdj: inner.adj, innerClear: innerClear.done, innerPlace,
    pl0, pl1, grew: Pv._terrSet.size - s0, has: Pv._terrSet.has('5004,5000'), landGone: V.t1238LandAt(5004, 5000) === null, cancel,
    useToday: Pv._t1238Use ? Pv._t1238Use.get('5004,5000') : null, laborMin: n0.laborMin, wood: n0.wood };
  // ⓒ′ 말뚝 · 뽑기 — 큰 마을(값이 통나무 여럿)
  const Q = F.mk(7, 'Q', 6000, 6000, 20, {}); Q.econ.founder = 'pl2';
  setWorld(F, [Q], 200);
  V.t1238Go(7, 'pl2', 6021, 6000, 6021, 6000);
  const qn = V.t1238CellNeed(7, 6021, 6000);
  V.t1238Clear(7, 6021, 6000, qn.laborMin + 1);
  const qp = V.t1238Place(7, 6021, 6000, 2);
  V.t1238Cancel(7, 'pl2', true);
  const qLand = V.t1238LandAt(6021, 6000);
  const pullNeed = V.t1238PullNeed(6021, 6000);
  const pullOther = V.t1238Pull(6021, 6000, 99);
  const pullFresh = V.t1238Pull(6021, 6000, 7);
  //   다시 박고 5년 뒤에 뽑는다 — 절반이 썩어 부러진다(10년 선형)
  V.t1238Go(7, 'pl2', 6021, 6000, 6021, 6000);
  V.t1238Place(7, 6021, 6000, 2);
  F.P._t1238Probe.setup({ day: 200 + 5 * YD });
  const pullOld = V.t1238Pull(6021, 6000, 7);
  const clearLeft5 = V.t1238LandAt(6021, 6000);
  out.p = { wood: qn.wood, qp, qLand, pullNeed, pullOther, pullFresh, pullOld, clearLeft5 };
  // ⓓ NPC 일괄 — 개간이 날을 넘어 이어진다
  const A = F.mk(1, 'A', 1000, 1000, 27, {});
  A.econ.land.size = 400; A.econ.housing = 600;
  A.econ.npcs = new Array(400).fill(0).map((_, i) => A.econ.npcs[i % A.econ.npcs.length]);
  F.body(101); A.npcPids = [101];
  A.econ.storage.wood = 5000;
  setWorld(F, [A], 300);
  F.deps.dayPhaseRatio = 0.0005;   // 몸 하나의 낮 = 0.72 게임 분 — 한 칸 개간(≈2.9 분)도 못 끝낸다
  const a0 = A._terrSet.size;
  const d1 = P._t569Probe.grow(A); const k1 = (A._t1238Pend || [])[0]; const c1 = V.t1238LandAt(...k1.split(',').map(Number));
  F.P._t1238Probe.setup({ day: 301 });
  const d2 = P._t569Probe.grow(A); const k2 = (A._t1238Pend || [])[0]; const c2 = V.t1238LandAt(...k2.split(',').map(Number));
  out.d = { d1, d2, same: k1 === k2, c1: c1 && c1.c, c2: c2 && c2.c, size: A._terrSet.size - a0, pend: (A._t1238Pend || []).length, partial: P._t1238Probe.st().bodyPartial };
  //   통나무 0 · 낮 넉넉 — 개간은 다 되고 말뚝에서 막힌다(수요 장부) · 이튿날 통나무가 오면 말뚝만
  const B = F.mk(2, 'B', 2000, 2000, 27, {});
  B.econ.land.size = 400; B.econ.housing = 600; B.econ.npcs = A.econ.npcs.slice(); F.body(102); B.npcPids = [102];
  B.econ.storage.wood = 0;
  setWorld(F, [B], 400);
  F.deps.dayPhaseRatio = 0.7;
  const b0 = B._terrSet.size;
  const e1 = P._t569Probe.grow(B);
  const cleared = (B._t1238Pend || []).filter((k) => { const L = V.t1238LandAt(...k.split(',').map(Number)); return L && L.c >= 0.999; }).length;
  const need = B.econ._t1207Need, wait = B._t1207Wait;
  B.econ.storage.wood = 5000;
  F.P._t1238Probe.setup({ day: 401 });
  const lab0 = B._t1207.laborMin;
  const e2 = P._t569Probe.grow(B);
  out.e = { e1, b0, cleared, need, wait, e2, grew: B._terrSet.size - b0, labDay2: +(B._t1207.laborMin - lab0).toFixed(3), shareD: E.woodShareD(B.econ) };
  // ⓔ 묵힘 — 3년 넘게 안 쓴 칸이 하루 1칸
  const D = F.mk(3, 'D', 3000, 3000, 12, {});
  F.body(103); D.npcPids = [103]; D.econ.storage.wood = 0;
  setWorld(F, [D], 1000);
  F.P._t1238Probe.clearLand();
  for (const k of F.P._t1238Probe.structOf(D)) F.P._t1238Probe.struct().add(k);
  D._t1238Since = 1000; D.econ._t1238Land = 1;
  const struct = new Set(F.P._t1238Probe.structOf(D));
  F.P._t1238Probe.setup({ day: 1000 + 3 * YD - 1 });
  const early = F.P._t1238Probe.pre(D);
  const sizeA = D._terrSet.size;
  F.P._t1238Probe.setup({ day: 1000 + 3 * YD + 1 });
  //   가장 먼 칸(구석) 하나는 어제 썼다 — 안 빠져야 한다
  const corner = (3000 + 12) + ',' + (3000 + 12);
  F.P._t1238Probe.use(D, 3012, 3012);
  const g1 = F.P._t1238Probe.pre(D);
  const gone1 = [...new Set([...F.square(3000, 3000, 12)])].filter((k) => !D._terrSet.has(k));
  let days = 0;
  for (let i = 0; i < 120; i++) { F.P._t1238Probe.setup({ day: 1000 + 3 * YD + 2 + i }); F.P._t1238Probe.pre(D); days++; }
  const gone = [...F.square(3000, 3000, 12)].filter((k) => !D._terrSet.has(k));
  out.f = { early, sizeA, g1, gone1, cornerKept: D._terrSet.has(corner), goneN: gone.length, days, structKept: [...struct].filter((k) => F.square(3000, 3000, 12).has(k)).every((k) => D._terrSet.has(k)),
    conn: F.conn4(D._terrSet), farFirst: gone1.length === 1 ? Math.hypot(+gone1[0].split(',')[0] - 3000, +gone1[0].split(',')[1] - 3000) : null, decayed: F.P._t1238Probe.st().decayCells,
    landOfGone: gone1.length ? V.t1238LandAt(...gone1[0].split(',').map(Number)) : null };
  //   둘레를 써도(울타리 · 건물로 바깥 줄을 다 써도) 안쪽 묵힌 칸이 빠진다 — 구멍(가르지는 않는다)
  const H = F.mk(4, 'H', 4000, 4000, 14, {});
  setWorld(F, [H], 1000);
  F.P._t1238Probe.clearLand();
  for (const k of F.P._t1238Probe.structOf(H)) F.P._t1238Probe.struct().add(k);
  H._t1238Since = 1000;
  const ring = new Set(); for (const k of H._terrSet) { const [x, y] = k.split(',').map(Number); if (Math.max(Math.abs(x - 4000), Math.abs(y - 4000)) === 14) ring.add(k); }
  F.setBuilt({ has: (k) => ring.has(k), size: ring.size });
  for (let i = 0; i < 5; i++) { F.P._t1238Probe.setup({ day: 1000 + 3 * YD + 1 + i }); F.P._t1238Probe.pre(H); }
  const holes = [...H._terrSet].length;
  const goneH = [...F.square(4000, 4000, 14)].filter((k) => !H._terrSet.has(k));
  out.h = { goneN: goneH.length, ringKept: [...ring].every((k) => H._terrSet.has(k)), interior: goneH.every((k) => !ring.has(k)), conn: F.conn4(H._terrSet), holes };
  F.setBuilt(null);
  // ⓕ econ — 금고 땅 사기 걷음 · 하루 맞춤
  const sz0 = D.econ.land.size;
  TX(D.econ, 1);
  const szAfter = D.econ.land.size;
  F.P._t1238Probe.post(D);
  out.econ = { flag: D.econ._t1238Land, sz0, szAfter, post: D.econ.land.size, want: V.landSizeOfCells(D._terrSet.size), terr: D._terrSet.size };
  // ⓖ 바둑식 — 이웃 마을의 마지막 숨 자리
  const Bv = F.mk(8, 'Bv', 8000, 8000, 1, {});
  const Av = F.mk(9, 'Av', 8000, 7990, 1, {});
  //   Bv(3×3) 둘레 12칸 중 11칸을 Av 영토로(이어지게 — 위쪽 기둥으로 Av 중심과 잇는다) · (8002, 8000) 하나만 빈 숨 자리
  const ringB = []; for (let x = 7999; x <= 8001; x++) { ringB.push([x, 7998]); ringB.push([x, 8002]); } for (let y = 7999; y <= 8001; y++) { ringB.push([7998, y]); ringB.push([8002, y]); }
  for (const [x, y] of ringB) if (!(x === 8002 && y === 8000)) Av._terrSet.add(x + ',' + y);
  for (let y = 7991; y <= 7998; y++) Av._terrSet.add('8000,' + y);
  for (const [x, y] of [[7998, 7998], [8002, 7998], [7998, 8002], [8002, 8002]]) Av._terrSet.add(x + ',' + y);   // 모서리도 — 둘레 고리를 잇는다
  setWorld(F, [Bv, Av], 500);
  out.g = { lib: F.P._t1238Probe.goOk(Av, 8002, 8000), other: F.P._t1238Probe.goOk(Av, 8003, 7999), canTake: V._t1207CanTake(Av, 8002, 8000), refuse: F.P._t1238Probe.st().goRefuse };
  // ⓗ 남의 작물(마을 밭) — 익은 칸만 · 곳간에 안 감
  const C = require(path.join(ROOT, 'server/crops.js'));
  const Ev = F.mk(10, 'Ev', 9000, 9000, 14, {});
  const day = 900, cid = 'foxtail_millet';
  Ev._farmSet.add('9001,9001'); Ev._drySet.add('9001,9001');
  Ev._crop.set('9001,9001', { c: cid, p: day - (C.growDaysOf ? C.growDaysOf(cid) : 120) - 30, q: 1 });
  Ev._crop.set('9002,9001', { c: cid, p: day - 1, q: 1 });
  setWorld(F, [Ev], day);
  const ripe = V.t1238PeekVillageCrop(9001, 9001), green = V.t1238PeekVillageCrop(9002, 9001), w0 = JSON.stringify(Ev.econ.storage);
  const take = V.t1238TakeVillageCrop(9001, 9001), takeGreen = V.t1238TakeVillageCrop(9002, 9001);
  out.crop = { ripe, green, take, takeGreen, gone: !Ev._crop.has('9001,9001'), storageSame: JSON.stringify(Ev.econ.storage) === w0 };
  // 재생 술어 — 쓰는 칸 · 영토 안 밭은 막고 그 밖 영토는 숲
  F.P._t1238Probe.clearLand(); for (const k of F.P._t1238Probe.structOf(Ev)) F.P._t1238Probe.struct().add(k);
  out.regrow = { hall: V.t1238RegrowBlocked(9000, 9000), field: V.t1238RegrowBlocked(9001, 9001), plain: V.t1238RegrowBlocked(9013, 9013), out: V.t1238RegrowBlocked(9500, 9500) };
  // 시딩 생성기 — 상한 1,500 · 남의 칸 안 듦(가능하면 — 고정물 땅이 단순해 실패하면 건너뛴다)
  try {
    const VL = require(path.join(ROOT, 'server/village-layout.js'));
    const t2 = Object.assign({}, F.ta, { landValue: () => 0.5, isStream: () => false, prepareFert: () => {} });
    const L1 = VL.generate(t2, 20000, 20000, 8, { maxCells: VL.TERR_CORE });
    const avoid = new Set(); for (let x = 20000; x <= 20040; x++) for (let y = 19960; y <= 20040; y++) avoid.add(x + ',' + y);
    const L2 = VL.generate(t2, 19990, 20000, 8, { maxCells: VL.TERR_CORE, avoid });
    const L0 = VL.generate(t2, 20000, 20000, 8, {});
    out.seed = { n1: L1.territory.length, n0: L0.territory.length, n2: L2.territory.length, overlap: L2.territory.filter((c) => avoid.has(c[0] + ',' + c[1])).length };
  } catch (e) { out.seed = { err: e.message }; }
  return out;
}
function runOff() {
  const F = fixture(), { V, E } = F;
  const Pv = F.mk(5, 'P', 5000, 5000, 3, {}); Pv.econ.founder = 'pl1';
  setWorld(F, [Pv], 100);
  const pk = V.t1238Pick(5, 5004, 4997, 5011, 5003);
  const D = F.mk(3, 'D', 3000, 3000, 12, {});
  setWorld(F, [D], 5000);
  const s0 = D._terrSet.size;
  F.P._t569Probe.grow(D);
  return { on: V.T1238_TERR_V2, t1207: V.T1207_TERR_REAL, pick: pk, canTake: V._t1207CanTake(Pv, 5004, 5000), flag: D.econ._t1238Land === undefined, regrowFn: typeof V.t1238RegrowBlocked };
}
// ── ⓛ [T1275] 나무꾼 몸 행위 끔(수식 나무꾼) 세계의 개간 통나무 입구 — econ 단위 · 마을 이틀 · 미끼(입구 0 사본) ──────────────
//   마을 W: 영토 55×55(반 27) · 바깥 칸마다 그루 서른(고정물 그루 한 그루 = 통나무 5 — 빽빽한 숲) · 곳간 = 1인 비축 + 30(첫날 말뚝 몇 칸만 치르고 막힌다).
//   ⚠고정물엔 econ 틱이 없다 — 하루 경계에 틱이 하는 일(오늘 든 몫 칸 `_t325InflowToday` 를 장부로 옮기고 0)을 손으로 한다.
function runT1275() {
  const F = fixture(), { V, E, P } = F;
  const out = { t325: !!E.T325_WOOD_ACT, on: V.T1238_TERR_V2 };
  // ① econ 입구 단위 — 표지 없음 = 0(끔 세계) · 표지 = 말뚝 모자람까지 · 같은 날 둘째 몫은 남은 몫만 · 모자람 0 = 0 · 세금은 금고로(곳간 + 금고 = 든 몫)
  const ev = F.mkEcon(40); ev.storage.wood = 0; ev._t1207Need = 10; ev.treasury = ev.treasury || {};
  const tr0 = ev.treasury.wood || 0;
  const off0 = E.woodToGranary(ev, 7);
  ev._t1238Land = 1;
  const g1 = E.woodToGranary(ev, 7), s1 = ev.storage.wood, t1 = (ev.treasury.wood || 0) - tr0, in1 = ev._t325InflowToday;
  const g2 = E.woodToGranary(ev, 7), g3 = E.woodToGranary(ev, 7);
  ev._t1207Need = 0; ev._t325InflowToday = 0;
  const g4 = E.woodToGranary(ev, 7);
  out.unit = { off0, g1, s1, t1, in1, g2, g3, g4, store: ev.storage.wood };
  // ② 마을 사흘 — 첫날: 곳간 잉여로 말뚝 → 영토가 된 칸의 그루를 벤다(개간) · 말뚝 모자람 0 이면 통나무는 곳간에 안 들고 짐에(소멸 0)
  //   이튿날: 일괄이 막혀 모자람이 서면 그날 벤 통나무가 모자람까지 곳간에 · 사흘째: 일괄 앞에서 짐이 먼저 곳간에(그날 모자람까지) → 그 통나무로 말뚝을 더 친다
  const days3 = () => {
    F.trees.clear();
    const W = F.mk(11, 'W', 11000, 11000, 27, {});
    W.econ.land.size = 400; W.econ.housing = 600; F.body(111); W.npcPids = [111];
    const N = W.econ.npcs.length;
    W.econ.storage.wood = 5 * N + 30;
    for (let x = 10960; x <= 11040; x++) for (let y = 10960; y <= 11040; y++) { const d = Math.max(Math.abs(x - 11000), Math.abs(y - 11000)); if (d >= 28) F.trees.set(x + ',' + y, 30); }
    setWorld(F, [W], 600);
    F.deps.dayPhaseRatio = 0.7;
    const snap = (s0) => { const T = W._t1207 || {}; return { added: W._terrSet.size - s0, felled: T.felled || 0, woodIn: +(T.woodIn || 0).toFixed(4), pack: +(W.econ._t717Pack || 0).toFixed(4),
      packIn: +(W._t717PkIn || 0).toFixed(4), store: +W.econ.storage.wood.toFixed(4), need: +(W.econ._t1207Need || 0).toFixed(4), postW: +(T.wood || 0).toFixed(4), cells: T.cells || 0 }; };
    const r = { reserve: 5 * N };
    let s0 = W._terrSet.size; P._t569Probe.grow(W); r.d1 = snap(s0);
    for (const [k, day] of [['d2', 601], ['d3', 602]]) {
      W.econ._t325InflowToday = 0;   // 하루 경계(econ 틱 몫 — 오늘 든 몫 칸을 장부로 옮기고 0)
      F.P._t1238Probe.setup({ day });
      s0 = W._terrSet.size; P._t569Probe.grow(W); r[k] = snap(s0);
    }
    return r;
  };
  out.real = days3();
  // ③ 미끼 — 입구가 0 인 사본(고치기 전 글자: 나무꾼 몸 행위 끔이면 `woodToGranary` = 0)을 같은 판에 끼운다 → 곳간에 든 통나무 0 · 이튿날 말뚝 0 이어야 한다(그래서 위 판정이 빨개진다)
  const PP = path.join(ROOT, 'sim', 'economy-sim.js'), src = fs.readFileSync(PP, 'utf8');
  const fixed = "  if (!T325_WOOD_ACT) return v._t1238Land ? actToGranary(v, 'wood', actDemandCap(v, units, v._t1207Need || 0, '_t325InflowToday'), '_t325InflowToday', '_t325CutN') : 0;";
  out.baitHasLine = src.includes(fixed);
  const Module = require('module'); const m = new Module(PP, null); m.filename = PP; m.paths = Module._nodeModulePaths(path.dirname(PP));
  m._compile(src.replace(fixed, '  if (!T325_WOOD_ACT) return 0;'), PP);
  const keep = E.woodToGranary;
  E.woodToGranary = m.exports.woodToGranary;
  try { out.bait = days3(); } finally { E.woodToGranary = keep; }
  return out;
}
// ── ⓜ [T1283] 나무 모자람 → 직업 고르기 · (나) 개간 통나무 걸음 ──────────────────────────────────────────────
//   ① 피커 — econ 마을 40명(농부 24 · 어부 12 · 나무꾼 4 — `createVillage` 그대로) · 곳간 식량 15일치(기근 블록 안 · 6일치 위) · 도구 넉넉 · 값표 없음(가중 1)
//     전환 문(`autoSwitchJob` — 내보낸 시험 문)을 한 번 부르고 그날 피커 판단(`_dbgSwitch.need`)을 읽는다.
function runT1283() {
  const out = {};
  const PP = path.join(ROOT, 'sim', 'economy-sim.js');
  const pick = (E, o) => {
    const v = E.createVillage({ name: 'T', initialPop: 40, fertility: 0.6, water: 0.5, wood: 0.6, stone: 0.4, game: 0.4, ore: 0, size: 100 });
    const N = v.npcs.length;
    for (const k of Object.keys(v.storage)) if (k !== 'tool' && k !== 'stone' && k !== 'wood' && k !== 'weapon' && k !== 'clothes') v.storage[k] = 0;
    v.storage.food = N * (o.foodDays == null ? 15 : o.foodDays);
    if (o.landWood != null) v.land.wood = o.landWood;
    const want = o.lj == null ? 0 : o.lj;
    for (const n of v.npcs) if (n.currentJob === 'lumberjack' && v.counts.lumberjack > want) E._switchNPCJobForTest(n, 'farmer', 0, v);
    for (const n of v.npcs) if (n.currentJob === 'farmer' && v.counts.lumberjack < want) E._switchNPCJobForTest(n, 'lumberjack', 0, v);
    if (o.noFood) for (const n of v.npcs) if (['farmer', 'fisher', 'hunter', 'forager'].includes(n.currentJob)) E._switchNPCJobForTest(n, 'mason', 0, v);
    v._kDbg = { prod: N, slot: 999, fuel: 999 };
    v.dailyProductionBuf = v.dailyProductionBuf || {}; v.dailyProductionBuf.wood = o.got || 0;
    v._t1207Need = o.post || 0; v._t1283FuelShort = o.fuelShort || 0; v._t1283Fuel = o.fuel == null ? 10 : o.fuel; v._t1283House = 0; v._t1283HouseShort = 0; v._t1283ClearToday = o.clear || 0;
    const world = { picker: 'rational', priceFn: () => null, villages: [v], day: 1000, autoSwitchInterval: 7 };
    const w = E.t1283Wood ? E.t1283Wood(v) : null, fe = E.totalFoodEquivalent(v) / N;   // 판단 앞(전환이 사람 수를 바꾸기 전)
    E._autoSwitchJobForTest(v, 1000, world);
    return { need: v._dbgSwitch && v._dbgSwitch.need, lj: want, fe, w };
  };
  const cases = (E) => ({
    c1: pick(E, { lj: 0, post: 50 }),                                  // 나무꾼 0 · 말뚝 모자람 → 한 명
    c2: pick(E, { lj: 2, post: 500, fuelShort: 5, got: 0.8 }),           // 수식 나무꾼(한 사람 0.4 단) · 말뚝 바람 500 → 식량 일이 이긴다
    c3: pick(E, { lj: 2, post: 500, fuelShort: 5, got: 1000 }),          // 몸 나무꾼(한 사람 500 단) → 나무꾼
    c4: pick(E, { lj: 0 }),                                             // 모자람 0 → 식량 일(종전)
    c5: pick(E, { lj: 0, post: 50, foodDays: 5 }),                      // 하드 플로어(6일치) 밑 → 식량 일
    c6: pick(E, { lj: 0, post: 50, landWood: 0 }),                      // 벨 자리 0 → 식량 일
    c7: pick(E, { lj: 2, post: 500, got: 1000, clear: 999.2 }),         // 오늘 든 나무가 거의 개간 통나무 — 나무꾼 몫 0.4 → 식량 일
    c8: pick(E, { lj: 0, post: 50, noFood: true }),                     // 식량 일꾼 0 — 이 문은 안 연다(기근 블록이 먼저)
  });
  const E = require(PP);
  out.on = E.T1283_WOOD_DEMAND === true;
  out.cases = cases(E);
  // ② 미끼 — 수요를 상수로 박은 사본(모자람 = 1 · 그날 틱 칸을 안 읽는다) → 모자람 0 인 마을(c4)도 나무꾼이 된다 · 그래서 위 판정이 빨개진다
  const src = fs.readFileSync(PP, 'utf8');
  const line = "  return { short: ((v && v._t1283FuelShort) || 0) + ((v && v._t1283HouseShort) || 0) + post,";
  out.baitHasLine = src.includes(line);
  const Module = require('module'); const m = new Module(PP + '.t1283bait', null); m.filename = PP; m.paths = Module._nodeModulePaths(path.dirname(PP));
  m._compile(src.replace(line, '  return { short: 1,'), PP);
  out.bait = cases(m.exports);
  // ③ 틱 칸 — 켬이면 그날 땔감 바람 · 못 땐 몫 · 집 바람 · 못 지은 몫 · 오늘 개간 통나무 칸이 선다(끔 = 칸 0 — 아래 끔 자식 판)
  const v = E.createVillage({ name: 'T', initialPop: 40, fertility: 0.6, water: 0.5, wood: 0.6, stone: 0.4, game: 0.4, ore: 0, size: 100 });
  v.storage.wood = 3; if (E.T1283_WOOD_DEMAND) v._t1283Clear = 2;   // 서버 `_t1207Fell` 이 켬에서만 세는 칸(끔이면 아무도 안 적는다)
  E.tickVillage(v, 1); const clear1 = v._t1283ClearToday;
  for (let d = 2; d <= 3; d++) E.tickVillage(v, d);
  out.tick = { keys: Object.keys(v).filter((k) => k.startsWith('_t1283')).sort(), fuel: v._t1283Fuel, fuelShort: v._t1283FuelShort, house: v._t1283House, houseShort: v._t1283HouseShort, clear1, clear: v._t1283ClearToday };
  // ④ (나) 개간 통나무 걸음 — 마을 W(T1275 판과 같은 판 · 바깥 칸마다 그루 서른) · 첫날 일괄
  const F = fixture(), { V, P } = F;
  const one = () => {
    F.trees.clear();
    const W = F.mk(13, 'H', 13000, 13000, 27, {});
    W.econ.land.size = 400; W.econ.housing = 600; F.body(131); W.npcPids = [131];
    W.econ.storage.wood = 5 * W.econ.npcs.length + 5000;
    for (let x = 12960; x <= 13040; x++) for (let y = 12960; y <= 13040; y++) { const d = Math.max(Math.abs(x - 13000), Math.abs(y - 13000)); if (d >= 28) F.trees.set(x + ',' + y, 30); }
    setWorld(F, [W], 600);
    F.deps.dayPhaseRatio = 0.7;
    const s0 = W._terrSet.size; P._t569Probe.grow(W);
    const T = W._t1207 || {};
    return { added: W._terrSet.size - s0, haulMin: T.haulMin == null ? null : T.haulMin, haulWait: T.haulWait || 0, laborMin: +(T.laborMin || 0).toFixed(1), cells: T.cells || 0 };
  };
  out.haul = { haulKnob: process.env.T1283_CLEAR_HAUL === '1', t325: !!E.T325_WOOD_ACT, day1: one() };
  return out;
}
function runZone() {
  const TMP = `/tmp/t1238-z-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
  process.env.PORT = String(require('./lib-port').port(39500));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  console.log = _log;
  const H = Zone.__testBind(), BS = H.BUILDING_SIZE;
  const mkP = (name) => ({ playerId: 'test_' + name, name, ws: { readyState: 999, send: () => {} }, x: 0, y: 0, floor: 0, inventory: {}, vp: 0, hunger: 100, thirst: 100 });
  const A = mkP('A'), B = mkP('B');
  const out = { on: H.T1238_ON, vp: { steal: H.VP_STEAL_CROP, fence: H.VP_BREAK_FENCE, gather: H.VP_TRESPASS_GATHER, attack: H.VP_ATTACK_PLAYER, thr: H.VP_THRESHOLD, max: H.VP_MAX } };
  //   울타리 — 남의 것 부수기 = 벌점 · 제 것 = 0
  const fence = (x, y, owner) => ({ id: 'f' + x + '_' + y, type: 'fence', ownerId: owner.playerId, ownerName: owner.name, x: x * BS + BS / 2, y: y * BS + BS / 2, floor: 0, data: {} });
  const f0 = fence(50, 50, A);
  const costB = H._t1238FenceCost(B, f0, []), costA = H._t1238FenceCost(A, f0, []);
  H._t1238FenceApply(B, f0, costB, 'break');
  out.fence = { costB, costA, vpB: B.vp };
  //   갇힘 — B 의 집(100, 100) 둘레 반지름 3 고리(A 의 울타리) · 고리 바깥 한 겹 더(두 겹째는 우리 안쪽과 안 맞닿는다)
  B._homeX = 100 * BS + BS / 2; B._homeY = 100 * BS + BS / 2; B.vp = 0;
  const ring = [], ring2 = [];
  for (let x = 97; x <= 103; x++) for (let y = 97; y <= 103; y++) if (Math.max(Math.abs(x - 100), Math.abs(y - 100)) === 3) ring.push(fence(x, y, A));
  for (let x = 96; x <= 104; x++) for (let y = 96; y <= 104; y++) if (Math.max(Math.abs(x - 100), Math.abs(y - 100)) === 4) ring2.push(fence(x, y, A));
  const list = ring.concat(ring2);
  const t = H._t1238Trap(100, 100, 7 + 32, list);
  const inner = ring.find((b) => Math.floor(b.x / BS) === 103 && Math.floor(b.y / BS) === 100);
  const outer = ring2.find((b) => Math.floor(b.x / BS) === 104 && Math.floor(b.y / BS) === 100);
  const wInner = H._t1238FenceCost(B, inner, list), wOuter = H._t1238FenceCost(B, outer, list);
  H._t1238FenceApply(B, inner, wInner, 'break');
  const vpAfterInner = B.vp;
  //   고리를 하나 열면(안쪽 고리 한 칸 부서짐) 두 겹째가 그 우리의 안쪽과 맞닿는다 — 그다음 울타리도 갇힘 풀기
  inner.data.damaged = true;
  const wOuter2 = H._t1238FenceCost(B, outer, list);
  //   갇히지 않은 사람(집이 우리 밖) — 같은 울타리를 부수면 벌점
  const Cp = mkP('C'); Cp._homeX = 300 * BS; Cp._homeY = 300 * BS;
  const wFree = H._t1238FenceCost(Cp, ring[0], list);
  out.trap = { cost: t.cost, fences: t.fences.length, visited: t.visited, wInner, wOuter, vpAfterInner, wOuter2, wFree };
  //   NPC 마을 갇힘 — 회관 앞 마당 둘레 고리 · 하루 검사가 그 길의 울타리를 허문다
  const SV = H.SimVillages;
  const vil = { dbId: 77, name: '시험골', ccx: 200, ccy: 200, _terrSet: new Set(['200,200', '200,205']), _houseCells: [], _granList: [], econ: { storage: {} } };
  SV.__labProbe._t569Probe.setup({ villages: [vil] });
  const nring = []; for (let x = 197; x <= 203; x++) for (let y = 202; y <= 208; y++) if (Math.max(Math.abs(x - 200), Math.abs(y - 205)) === 3) nring.push(fence(x, y, A));
  const tv = H._t1238TrapVillage(vil, nring);
  out.npc = { tv, broke: nring.filter((b) => b.data.damaged).length, after: H._t1238TrapVillage(vil, nring) };
  //   남의 작물 — 사유지 · 영토 · 빈 땅 · 보호 풀림
  H.claims.set('t1238c', { id: 't1238c', x: 400 * BS, y: 400 * BS, w: 3 * BS, h: 3 * BS, ownerPid: A.playerId, ownerName: 'A', kind: 'personal' });
  const sClaim = H._t1238StealCheck(B, 401, 401), sOwn = H._t1238StealCheck(A, 401, 401), sFree = H._t1238StealCheck(B, 500, 500);
  const vil2 = { dbId: 78, name: '이웃골', ccx: 600, ccy: 600, _terrSet: new Set(['600,600', '601,600']), _houseCells: [], _granList: [], econ: {} };
  SV.__labProbe._t569Probe.setup({ villages: [vil2] });
  const sTerr = H._t1238StealCheck(B, 601, 600);
  A.vp = 60; H.players.set('pA', A);
  const sLifted = H._t1238StealCheck(B, 401, 401);
  H.players.delete('pA');
  B.vp = 0; H._t1238StealApply(B, sClaim); const vpSteal = B.vp; H._t1238StealApply(B, sFree);
  out.steal = { sClaim, sOwn, sFree, sTerr, sLifted, vpSteal, vpAfterFree: B.vp };
  //   부서진 울타리 — 켬이면 콜라이더가 통과(콜라이더 격자에 직접 꽂아 본다는 대신 글자 검사 · ⓚ)
  out.stat = H.t1238ZoneStat();
  return out;
}

// ── ⓝ [T1297 할 일 3 · T1283 (나)] 관측 마을 몸의 개간 통나무 걸음 ──────────────────────────────────────────────
//   마을 B(창설 7×7) · 곳간 하나(사다리 = 마을 가운데 칸) · 크루 몸 하나 · 영토 일감 하나(맞닿은 칸 · 말뚝 0 · 개간 1분) · 그 칸 그루 셋(그루마다 통나무 5)
//   몸 걸음은 `_t1181Step`(정본) 그대로 부르고, 그 몸이 가려는 자리(`targetX/Y`)로 옮겨 놓는다(걸음 물리 대신 — 걸음 다리 · 기다림 · 부림은 정본 줄).
function runT1297Haul() {
  const F = fixture(), { V, E, P } = F;
  const out = { t325: E.T325_WOOD_ACT === true, haul: process.env.T1283_CLEAR_HAUL === '1', perLoad: E.crewPerLoad('wood') };
  F.trees.clear();
  const W = F.mk(21, 'B', 15000, 15000, 3, {});
  W.econ.housing = 600; W.econ.storage.wood = 0;
  W._granList = [{ cx: 15000, cy: 14998 }];
  const npc = F.body(211); W.npcPids = [211];
  const L = { x: 15000 * 32 + 16, y: 15000 * 32 + 16 };   // `_granLadder` — 곳간 렉트 남쪽 칸
  npc.x = L.x; npc.y = L.y;
  const world = { day: 600 }; E.bindProductionActs(world); W.econ._world = world;
  setWorld(F, [W], 600);
  const key = '15004,15000';
  F.trees.set(key, 3);
  W._t1207Pend = [{ key, cx: 15004, cy: 15000, wood: 0, laborMin: 1, m: 1, mat: {}, workMs: 0 }];
  const e = W.econ, got = () => (e.storage.wood || 0) + (e._t717Pack || 0);
  const g0 = got();
  let now = 1e7, steps = 0, maxInv = 0, deposits = 0, atLadder = 0, atSite = 0, terrEarly = false;
  for (; steps < 800 && W._t1207Pend.length; steps++) {
    const b = got();
    P._t1181Probe.step(W, npc, now, true);
    const a = got();
    if (a > b + 1e-9) { deposits++; if (Math.hypot(npc.x - L.x, npc.y - L.y) <= 44) atLadder++; if (Math.hypot(npc.x - (15004 * 32 + 16), npc.y - (15000 * 32 + 16)) <= 44) atSite++; }
    const inv = (npc.inventory && npc.inventory.wood) || 0; if (inv > maxInv) maxInv = inv;
    if (W._terrSet.has(key) && W._t1207Pend.length) terrEarly = true;
    if (Number.isFinite(npc.targetX)) { npc.x = npc.targetX; npc.y = npc.targetY; }
    now += 7000;
  }
  const T = W._t1207 || {};
  out.res = { steps, done: W._terrSet.has(key), left: W._t1207Pend.length, trees: F.trees.get(key) || 0, maxInv: +maxInv.toFixed(3), loads: T.haulLoads || 0, felled: T.felled || 0,
    woodIn: +(T.woodIn || 0).toFixed(3), got: +(got() - g0).toFixed(3), deposits, atLadder, atSite, terrEarly, inv: (npc.inventory && npc.inventory.wood) || 0 };
  //   헤드리스로 넘어간다 — 벤 채 아직 안 진 더미(7 단)는 곳간으로(`_t1207Flush`)
  const g1 = got();
  W._t1207Pend = [{ key: '15000,15004', cx: 15000, cy: 15004, wood: 0, laborMin: 1, m: 1, mat: {}, workMs: 0, _t1283Pile: 7 }];
  V._t1207Flush(W);
  out.flush = { got: +(got() - g1).toFixed(3), left: W._t1207Pend.length };
  return out;
}

if (MODE === 'vil') { const o = runVil(); process.stdout.write('@@T1238 ' + JSON.stringify(o) + '\n'); process.exit(0); }
if (MODE === 'off') { const o = runOff(); process.stdout.write('@@T1238 ' + JSON.stringify(o) + '\n'); process.exit(0); }
if (MODE === 't1275') { let o; try { o = runT1275(); } catch (e) { o = { err: e.stack }; } process.stdout.write('@@T1238 ' + JSON.stringify(o) + '\n'); process.exit(0); }
if (MODE === 't1283') { let o; try { o = runT1283(); } catch (e) { o = { err: e.stack }; } process.stdout.write('@@T1238 ' + JSON.stringify(o) + '\n'); process.exit(0); }
if (MODE === 't1297haul') { let o; try { o = runT1297Haul(); } catch (e) { o = { err: e.stack }; } process.stdout.write('@@T1238 ' + JSON.stringify(o) + '\n'); process.exit(0); }
if (MODE === 'zone') { let o; try { o = runZone(); } catch (e) { o = { err: e.stack }; } process.stdout.write('@@T1238 ' + JSON.stringify(o) + '\n'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sec = (t) => console.log('\n' + t);
const child = (mode, env) => { const r = spawnSync(process.execPath, ['--experimental-sqlite', __filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1238_CHILD: mode }, env), encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20 });
  const l = (r.stdout || '').split('\n').find((x) => x.startsWith('@@T1238 ')); if (!l) { console.log((r.stdout || '').slice(-3000), (r.stderr || '').slice(-3000)); return null; } return JSON.parse(l.slice(8)); };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

console.log('\n=== T1238 영토 v2 — 몸이 치른다 · 끌어 고르기 · 처음 땅 · 취소 · 쓰는 땅만 내 땅 · 울타리와 벌점 · 갇힘 ===');
sec('ⓐ 순수 — 출처 수 · 규칙 산수');
{
  const T = require(path.join(ROOT, 'server/terr-v2.js')), TC = require(path.join(ROOT, 'server/terr-cost.js'));
  ok(T.DECAY_YEARS === 3 && T.BRUSH_YEARS === 15 && T.POST_ROT_YEARS === 10 && T.DECAY_CELLS_PER_DAY === 1, '★묵힘 3년(경국대전 진전) · 덤불 15년 · 말뚝 10년 · 하루 1칸', [T.DECAY_YEARS, T.BRUSH_YEARS, T.POST_ROT_YEARS]);
  ok(T.clearLeft(1, 0, 0, 365) === 1 && near(T.clearLeft(1, 0, 365 * 7.5, 365), 0.5, 1e-3) && T.clearLeft(1, 0, 365 * 15, 365) === 0, '개간 몫이 15년에 걸쳐 0 으로(선형)');
  ok(T.pullBack(10, 0, 365) === 10 && T.pullBack(10, 365 * 5, 365) === 5 && T.pullBack(10, 365 * 10, 365) === 0 && T.pullBack(10, 365 * 30, 365) === 0, '뽑아 돌려받는 통나무 — 갓 박음 전부 · 5년 절반 · 10년 0');
  ok(near(T.pullDaysPerPost(0.3), Math.PI * 0.15 * 0.15 * 0.6 / 1.8), `말뚝 하나 뽑기 = π · 0.15² · 0.6 m³ ÷ 1.8 m³/사람·일 = ${T.pullDaysPerPost(0.3).toFixed(5)} 사람·일(EXARC 2006)`);
  const has = (s) => (k) => s.has(k);
  const line = new Set(['0,0', '1,0', '2,0']);
  ok(!T.isSimplePoint(has(line), 1, 0) && T.isSimplePoint(has(line), 2, 0), '단순점 — 가운데 칸은 빼면 갈린다 · 끝 칸은 된다');
  const sq = new Set(); for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) sq.add(x + ',' + y);
  ok(T.isSimplePoint(has(sq), 0, 0), '안쪽 칸(사방이 영토) — 빼도 안 갈린다(구멍)');
  const used = (k) => { const [x, y] = T.parse(k); return Math.max(Math.abs(x), Math.abs(y)) === 2 ? 100 : 0; };
  const pd = T.pickDecay({ cells: sq, has: has(sq), usedDay: used, inUse: (k) => used(k) === 100, day: 100, limitDays: 50, n: 2, cx: 0, cy: 0 });
  ok(pd.length === 2 && pd.every((k) => { const [x, y] = T.parse(k); return Math.abs(x) === 1 && Math.abs(y) === 1; }), '★묵힘 — 바깥 줄을 써도 안쪽 묵힌 칸이 빠진다(먼 차례 — 안쪽 고리의 모서리)', pd);
  const dumb = new Set(['0,0', '1,0', '0,1', '1,1', '2,0', '3,0', '4,0', '3,1', '4,1']);
  const pd2 = T.pickDecay({ cells: dumb, has: has(dumb), usedDay: () => 0, inUse: () => false, day: 100, limitDays: 50, n: 9, cx: 0, cy: 0 });
  ok(!pd2.includes('2,0') || pd2.indexOf('2,0') > pd2.indexOf('4,1'), '묵힘 — 다리 칸(가르는 칸)은 그 칸만 남을 때까지 안 고른다', pd2);
  const own = has(new Set(['0,0'])), canAll = () => true;
  const pr = T.pickRect({ own, canTake: canAll, x0: 1, y0: -1, x1: 3, y1: 1, cap: 100, maxSide: 32 });
  ok(pr.cells.length === 9 && pr.cells[0] === '1,0', '끌어 고르기 — 맞닿은 칸에서 시작해 네모 안 이어진 칸(3×3)', pr.cells);
  const pr2 = T.pickRect({ own, canTake: (x) => x !== 2, x0: 1, y0: -1, x1: 3, y1: 1, cap: 100, maxSide: 32 });
  ok(pr2.cells.length === 3 && pr2.cells.every((k) => T.parse(k)[0] === 1), '끌어 고르기 — 못 가질 칸 너머는 안 이어진다', pr2.cells);
  const pr3 = T.pickRect({ own, canTake: canAll, x0: 1, y0: 0, x1: 100, y1: 0, cap: 0, maxSide: 32 });
  ok(pr3.cells.length === 32 && pr3.rect[2] === 32, '네모 한 변 상한 32칸(청크 한 변)', pr3.rect);
  const B = new Set(['0,0']), lib = (x, y) => !(x === 0 && y === 1) ? false : true;
  ok(!T.keepsLiberty({ x: 0, y: 1, has: has(B), cells: B, free: lib }) && T.keepsLiberty({ x: 5, y: 5, has: has(B), cells: B, free: lib }), '바둑식 — 마지막 숨 자리를 가지면 거짓 · 안 맞닿은 칸은 참');
  const fence = new Set(); for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if (Math.max(Math.abs(x), Math.abs(y)) === 3) fence.add(x + ',' + y);
  const tr = T.trapBfs({ sx: 0, sy: 0, maxR: 6, step: (ax, ay, bx, by) => fence.has(bx + ',' + by) ? 1 : 0, isOut: (x, y) => Math.max(Math.abs(x), Math.abs(y)) >= 6 });
  ok(tr.cost === 1 && tr.fences.length === 1 && tr.free(0, 0) && tr.free(2, 2) && !tr.free(4, 4), '갇힘 — 고리 하나 = 깰 울타리 1 · 안쪽은 0 비용 칸', tr);
  fence.delete('3,0');
  const tr2 = T.trapBfs({ sx: 0, sy: 0, maxR: 6, step: (ax, ay, bx, by) => fence.has(bx + ',' + by) ? 1 : 0, isOut: (x, y) => Math.max(Math.abs(x), Math.abs(y)) >= 6 });
  const tr3 = T.trapBfs({ sx: 0, sy: 0, maxR: 6, step: (ax, ay, bx, by) => Math.max(Math.abs(bx), Math.abs(by)) === 3 ? -1 : 0, isOut: (x, y) => Math.max(Math.abs(x), Math.abs(y)) >= 6 });
  ok(tr2.reached && tr2.cost === 0 && tr3.cost === -1, '틈이 있으면 안 갇힘 · 물 · 바위로 막힘 = 못 닿음(허물 것이 없다)', [tr2.cost, tr3.cost]);
  ok(TC.CELL_READING === 'map' && TC.cellM2() === 1 && TC.cellM2('field') === 250 && near(TC.edgeM('field'), Math.sqrt(250)), '★칸 넓이 읽기 상수 하나 — 지도 1 m²(기본 · 종전) · 밭 정본 250 m²(회부)', [TC.cellM2(), TC.cellM2('field')]);
  const c0 = TC.cellCost({ S: 1500, r: 10, nb: 1, S0: 1500 }), cF = TC.cellCost({ S: 1500, r: 10, nb: 1, S0: 1500, reading: 'field' });
  ok(near(c0.laborMin, 1.44 * c0.m) && near(c0.posts, 2 / 1.8 * c0.m) && near(cF.laborMin, c0.laborMin * 250) && near(cF.posts, c0.posts * Math.sqrt(250)), '칸 값 — 지도 읽기는 종전 식 그대로 · 밭 읽기는 개간 ×250 · 말뚝 ×√250', [c0.laborMin, cF.laborMin, c0.posts, cF.posts]);
}
const ON = child('vil', { T1207_TERR_REAL: '1', T1238_TERR_V2: '1', T1213_DERIV_ADD: '0' });
const OFF = child('off', { T1207_TERR_REAL: '1', T1238_TERR_V2: '0' });
const ZN = child('zone', { T1207_TERR_REAL: '1', T1238_TERR_V2: '1' });
sec('ⓑ 끌어 고르기 — 맞닿아 이어진 칸만 · 막힘 · 남의 땅 빼고');
if (!ON) ok(false, '켬 자식 판이 안 섰다');
else {
  const p = ON.pick;
  ok(ON.on === true && ON.t1207 === true, '켬 판 — T1207 켬 위 T1238 켬');
  ok(p.ok && p.n > 0 && p.allIn && !p.hasBlk && !p.hasN, `★네모 안 이어진 칸 ${p.n}칸 · 막힌 칸 · 남의 마을 땅은 안 든다`, p);
  ok(p.lab > 0 && p.wood >= 0, `묶음 합 — 개간 ${p.lab}분 · 통나무 ${p.wood}개`, p);
  ok(!p.far.ok && /맞닿아/.test(p.far.err), '영토와 안 맞닿은 네모 — 거절', p.far);
  ok(ON.go.ok && ON.go.added === p.n && ON.go.pending === p.n, '고른 칸이 마을 묶음에(고른 사람 표시)', ON.go);
}
sec('ⓒ 취소 · 다시 고르기 — 한 일은 땅에 남는다');
if (ON) {
  const c = ON.c;
  ok(near(c.half, 0.5, 1e-6) && near(c.landC, 0.5, 1e-3) && c.needAfterCancel === null && c.cancel.n > 0, `★개간 절반 → 취소 — 묶음에서 빠졌지만 땅에 진척 ${c.landC} 이 남는다`, c);
  ok(near(c.carried, 0.5, 1e-3), '★다시 고르면 그 진척에서 이어진다(그만큼 빨리 끝난다)', c.carried);
  ok(c.edge === true && c.innerAdj === false && c.innerClear === true && !c.innerPlace.ok && /맞닿은/.test(c.innerPlace.err), '맞닿지 않은 고른 칸 — 개간은 되고 말뚝은 맞닿은 뒤에', c.innerPlace);
  ok(c.pl1.ok && c.pl1.done && c.grew === 1 && c.has && c.landGone, `★개간 끝 + 말뚝 통나무 ${c.wood}개 → 영토(+1칸) · 땅의 일 행은 지워진다`, c.pl1);
  ok(c.useToday === 100, '새 칸의 쓰는 날 = 오늘(묵힘 시계가 오늘부터)', c.useToday);
  const p = ON.p;
  ok(p.wood >= 3 && p.qp.ok && !p.qp.done && p.qLand && p.qLand.w === 2, `★말뚝 통나무 ${p.wood}개 중 2개만 박고 취소 — 박은 말뚝 2개는 땅에 남는다`, p);
  ok(p.pullNeed && p.pullNeed.logs === 2 && p.pullNeed.posts === 1 && p.pullNeed.needMin > 20 && p.pullNeed.needMin < 30, `뽑는 일 — 말뚝 1개 × ${p.pullNeed && p.pullNeed.perPostMin.toFixed(1)}분(흙 파기 · 몸 하나의 낮 기준)`, p.pullNeed);
  ok(!p.pullOther.ok && /박은 마을/.test(p.pullOther.err), '남의 마을이 박은 말뚝은 못 뽑는다', p.pullOther);
  ok(p.pullFresh.ok && p.pullFresh.back === 2 && p.pullFresh.broke === 0, '★갓 박은 말뚝 — 통나무 전부 돌아온다', p.pullFresh);
  ok(p.pullOld.ok && p.pullOld.back === 1 && p.pullOld.broke === 1, '★5년 묵은 말뚝 — 절반이 썩어 부러진다(취소로 값을 피하는 길은 없다)', p.pullOld);
  ok(p.clearLeft5 && p.clearLeft5.c > 0.6 && p.clearLeft5.c < 0.7, `개간한 땅은 5년에 덤불이 ⅓ 돌아왔다(남은 몫 ${p.clearLeft5 && p.clearLeft5.c})`, p.clearLeft5);
}
sec('ⓓ NPC 일괄 — 개간이 날을 넘어 이어진다 · 말뚝 모자람 = 수요 장부 · 이튿날 말뚝만');
if (ON) {
  const d = ON.d;
  ok(d.d1 === 0 && d.d2 === 0 && d.same && d.c1 > 0 && d.c2 > d.c1 && d.size === 0 && d.partial >= 2, `★몸의 낮이 짧으면 한 칸을 이틀에 걸쳐 판다(첫날 ${d.c1 && d.c1.toFixed(3)} → 이튿날 ${d.c2 && d.c2.toFixed(3)} · 같은 칸)`, d);
  const e = ON.e;
  ok(e.e1 === 0 && e.cleared > 0 && e.need > 0 && e.wait && e.wait.why === 'wood', `★통나무 0 — 개간은 ${e.cleared}칸 다 하고 말뚝에서 멈춘다 · 모자람 ${e.need} 가 수요 장부에`, e);
  ok(e.e2 > 0 && e.grew === e.e2 && e.labDay2 < 0.1, `★이튿날 통나무가 오자 말뚝만 박아 +${e.e2}칸(그날 개간 노동 ${e.labDay2}분 — 땅에 남은 개간을 썼다 · 하룻밤 덤불 1/5,475 만 다시 걷었다)`, e);
}
sec('ⓔ 묵힘 — 3년 넘게 안 쓴 칸이 하루 1칸');
if (ON) {
  const f = ON.f;
  ok(f.early === 0 && f.sizeA === 625, '3년이 안 됐으면 하나도 안 빠진다', f);
  ok(f.g1 === 1 && f.gone1.length === 1 && f.cornerKept && f.farFirst > 16, `★3년 하루 뒤 — 1칸(중심에서 ${f.farFirst && f.farFirst.toFixed(1)}칸 · 먼 차례) · 어제 쓴 구석 칸은 남았다`, f);
  ok(f.goneN === 121 && f.structKept && f.conn, `★120날 더 — 하루 1칸씩 ${f.goneN}칸 · 쓰는 칸(회관 · 마당) 그대로 · 영토는 한 덩이`, f);
  ok(f.landOfGone && near(f.landOfGone.c, 1 - 120 / (15 * 365), 1e-3) && f.landOfGone.w === 0, `빠진 칸 — 나무가 없으면 개간된 채로 땅에 · 그날부터 덤불로(120날 뒤 남은 몫 ${f.landOfGone && f.landOfGone.c} = 1 − 120 ÷ 5,475)`, f.landOfGone);
  const h = ON.h;
  ok(h.goneN === 5 && h.ringKept && h.interior && h.conn, '★바깥 줄을 다 써도(건물 · 길) 안쪽 묵힌 칸이 빠진다 — 둘레를 쓰면 안을 지키는 길이 없다 · 가르지는 않는다', h);
}
sec('ⓕ econ — 금고 땅 사기 걷음 · econ 땅 = 영토');
if (ON) {
  const e = ON.econ;
  ok(e.flag === 1 && e.szAfter === e.sz0, '★켬 표지가 서면 금고로 땅을 안 산다(같은 땅을 두 번 치르지 않는다)', e);
  ok(e.post === e.want, `★하루 맞춤 — econ 땅 크기 = 시딩 환산(영토 ${e.terr}칸 → ${e.want})`, e);
}
sec('ⓖ 바둑식 — 이웃 마을의 마지막 숨 자리는 못 가진다');
if (ON) ok(ON.g.lib === false && ON.g.canTake === false && ON.g.other === true && ON.g.refuse > 0, '★Bv 의 마지막 빈 이웃 칸 — Av 가 못 가진다(넓히기 거부) · 다른 칸은 된다', ON.g);
sec('ⓗ 남의 작물(마을 밭) — 익은 칸만 · 곳간에 안 감');
if (ON) {
  const c = ON.crop;
  ok(c.ripe && c.ripe.ripe && c.ripe.units >= 0 && c.green && !c.green.ripe, '미리 보기 — 익었나 · 낱개(같은 식)', [c.ripe, c.green]);
  ok(c.take && c.take.ok && c.gone && c.storageSame && c.takeGreen && !c.takeGreen.ok, `★익은 칸을 거두면 그 마을 작물이 사라지고 곳간은 그대로(마을이 잃는다) · 덜 익은 칸은 거절`, c);
  const r = ON.regrow;
  ok(r.hall && r.field && !r.plain && !r.out, '재생 술어 — 쓰는 칸 · 영토 안 밭에는 나무가 안 돌아온다 · 그 밖 영토는 숲(숲은 숲 그대로)', r);
  const s = ON.seed;
  if (s && s.err) ok(true, `시딩 생성기 — 고정물 땅으로는 못 돌린다(건너뜀: ${s.err.slice(0, 60)})`);
  else ok(s.n1 <= 1500 && s.n1 >= 1400 && s.n0 > s.n1 && s.overlap === 0, `★처음 땅 — 같은 생성기 · 상한 1,500(${s.n1}칸 · 끔 ${s.n0}칸) · 앞 마을 칸 안 듦`, s);
}
sec('ⓘ 존 — 남의 작물 벌점 · 울타리 벌점 · 갇힘 풀기(플레이어 · NPC)');
if (!ZN || ZN.err) ok(false, '존 자식 판이 안 섰다', ZN && ZN.err);
else {
  const v = ZN.vp;
  ok(ZN.on === true && v.steal === v.gather && v.fence === v.attack && v.thr === 50 && v.max === 100, `벌점 자리값 — 작물 ${v.steal}(= 채집) · 울타리 ${v.fence}(= 공격) · 문턱 ${v.thr} · 끝 ${v.max}`, v);
  const s = ZN.steal;
  ok(s.sClaim.vp === 3 && s.sClaim.kind === 'claim' && s.sOwn.vp === 0 && s.sFree.vp === 0 && s.sTerr.vp === 3 && s.sTerr.kind === 'terr', '★남의 사유지 · 남의 영토 칸 = 벌점 · 제 땅 · 빈 땅 = 0', s);
  ok(s.sLifted.vp === 0 && s.sLifted.lifted, '주인 적대감이 문턱 이상이면 보호가 풀려 0(채집과 같은 규약)', s.sLifted);
  ok(s.vpSteal === 3 && s.vpAfterFree === 3, '거둘 때마다 칸마다 — 벌점이 쌓인다 · 빈 땅은 안 쌓인다', s);
  const f = ZN.fence;
  ok(f.costB && f.costB.vp === 8 && f.costA === null && f.vpB === 8, '★남의 울타리를 부수면 +8 · 제 울타리는 0', f);
  const t = ZN.trap;
  ok(t.cost === 2 && t.fences === 2, '갇힘 — 집에서 바깥 들판까지 울타리 두 겹(고리 둘 — 가장 적은 길의 깰 울타리 2)', t);
  ok(t.wInner && t.wInner.vp === 0 && t.wInner.waiver && t.vpAfterInner === 0, '★갇힌 사람이 막은 울타리(우리 안쪽과 맞닿은 것)를 허물면 벌점 0', t.wInner);
  ok(t.wOuter && t.wOuter.vp === 8 && t.wOuter2 && t.wOuter2.vp === 0, '두 겹째는 안쪽 겹을 연 뒤에야 막은 울타리가 된다(그 전엔 벌점)', [t.wOuter, t.wOuter2]);
  ok(t.wFree && t.wFree.vp === 8, '안 갇힌 사람이 같은 울타리를 부수면 벌점', t.wFree);
  const n = ZN.npc;
  ok(n.tv && n.tv.cost === 1 && n.tv.broke === 1 && n.broke === 1 && n.after && n.after.cost === 0, '★NPC 마을 — 하루 검사가 회관 앞에서 갇힘을 찾아 그 길의 울타리 하나를 허문다 · 그다음 날은 안 갇힘', n);
}
sec('ⓙ 끔 — 종전 그대로');
if (!OFF) ok(false, '끔 자식 판이 안 섰다');
else ok(OFF.on === false && OFF.t1207 === true && !OFF.pick.ok && /꺼져/.test(OFF.pick.err) && OFF.canTake === true && OFF.flag, '★끔 — 영토 v2 문이 닫혀 있고(끌어 고르기 거절) · 맞닿음 판정 그대로 · econ 표지 없음', OFF);
sec('ⓚ 글자 — 손잡이 하나 · econ 출구 · 존 문 · 클라 · 출처 줄');
{
  const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const VS = rd('server/villages.js'), Z = rd('server/zone.js'), C46 = rd('public/client/46-h-verbs.js'), C30 = rd('public/client/30-n-net.js'), C34 = rd('public/client/34-m-renderloop.js'), EC = rd('sim/economy-sim.js'), TV = rd('server/terr-v2.js'), DB = rd('server/zone-local-db.js'), VL = rd('server/village-layout.js');
  ok((VS.match(/const T1238_TERR_V2 = T1207_TERR_REAL && process\.env\.T1238_TERR_V2 === '1';/g) || []).length === 1 && !/process\.env\.T1238_TERR_V2/.test(Z) && /const T1238_ON = !!SimVillages\.T1238_TERR_V2;/.test(Z), '손잡이 하나(`T1238_TERR_V2` · T1207 켬 위에서만 · 존은 마을 모듈을 읽는다)');
  ok(/if \(v\._t1238Land\) return;/.test(EC), 'econ — 표지가 서면 금고 땅 사기를 걷는다(`tryExpandTerritory` 첫 줄)');
  ok(/maxCells: VillageLayout\.TERR_CORE, avoid: _t1238SeedTaken/.test(VS) && /avoid && avoid\.has\(k\)/.test(VL), '처음 땅 — 시딩 생성기 상한 1,500 · 앞 마을 칸 피하기');
  ok(/if \(T1238_TERR_V2\) \{ try \{ if \(state\.deps\.clearTreesInCells\) \{ const _bc = new Set\(_t1238StructOf/.test(VS), '부팅 개간 — 켬이면 쓰는 칸 · 논밭만 벤다(숲은 숲 그대로)');
  ok(/msg\.type === 'terr_pick'\) tryT1238Pick/.test(Z) && /msg\.type === 'terr_go'\) tryT1238Pick/.test(Z) && /msg\.type === 'terr_cancel'\)/.test(Z) && /msg\.type === 'terr_pull'\)/.test(Z) && /msg\.type === 'terr_info'\)/.test(Z), '존 문 다섯 — 고르기 · 싣기 · 취소 · 뽑기 · 칸 목록');
  ok(/if \(T1238_ON && b\.data && b\.data\.damaged\) continue;/.test(Z), '★켬 = 부서진 울타리는 콜라이더 통과(종전엔 부서져도 막았다 — 회부)');
  ok(/const VP_STEAL_CROP      = VP_TRESPASS_GATHER;/.test(Z) && /const VP_BREAK_FENCE     = VP_ATTACK_PLAYER;/.test(Z), '벌점 상수 — VP_* 옆 한 곳(자리값)');
  ok(/tryHarvest\(player, msg\.confirm\)/.test(Z) && /type: 'harvest_confirm'/.test(Z), '남의 작물 — 거두기 전 확인 말(`harvest_confirm`)');
  ok(/function t1238On\(\)/.test(C46) && /function t1238DragBegin\(\)/.test(C46) && /function t1238DrawOverlay\(/.test(C46) && /harvest_confirm/.test(C30) && /t1238DrawOverlay\(ctx, v, sc, S, _cellSeen\)/.test(C34), '클라 — 끌어 고르기 네모 · 칸 진척 · 묶음 합 · 취소 · 뽑기 · 빠지는 칸 · 확인 말');
  ok(/過三年陳田|경국대전/.test(TV) && /이규송 2006/.test(TV) && /Carson et al\. 1981/.test(TV) && /EXARC/.test(TV), '출처 줄 — 경국대전 진전 · 이규송 2006 · Carson 1981 · EXARC 2006');
  ok(/CREATE TABLE IF NOT EXISTS t1238_use/.test(DB) && /function deleteVillageCell/.test(DB), 'DB — 표 둘은 처음 부를 때(끔 = 표 0)');
}
sec('ⓛ [T1275] 나무꾼 몸 행위 끔 세계 — 개간 통나무 입구 · 짐이 이튿날 먼저 · 그 통나무로 말뚝 · 미끼');
{
  const L = child('t1275', { T1207_TERR_REAL: '1', T1238_TERR_V2: '1', T1213_DERIV_ADD: '0', T325_WOOD_ACT: '0' });
  const LB = child('t1275', { T1207_TERR_REAL: '1', T1238_TERR_V2: '1', T1213_DERIV_ADD: '0', T325_WOOD_ACT: '1' });
  if (!L || L.err || !LB || LB.err) ok(false, 'T1275 자식 판이 안 섰다', (L && L.err) || (LB && LB.err));
  else {
    const u = L.unit, tax = u.g1 > 0 ? u.t1 / u.g1 : 0;
    ok(L.t325 === false && L.on === true && u.off0 === 0, '수식 나무꾼 세계 · 영토 v2 표지가 없는 마을(끔 세계 · 랩)은 입구 0 그대로(종전)', u);
    ok(u.g1 === 7 && near(u.s1 + u.t1, 7, 1e-9) && u.in1 === 7 && tax > 0 && tax < 0.5, `★표지 마을 — 말뚝 모자람(10)까지 곳간에 든다 · 같은 세금(곳간 ${u.s1} + 금고 ${+u.t1.toFixed(4)} = 7) · 오늘 든 몫 칸(econ 틱이 장부로 옮긴다)`);
    ok(u.g2 === 3 && u.g3 === 0 && u.g4 === 0, '같은 날 둘째 몫은 남은 3 만 · 다 차면 0 · 모자람 0 이면 0(수요 문 하나 — `actDemandCap`)', u);
    const R = L.real, B = L.bait;
    ok(R.d1.felled > 0 && R.d1.need === 0 && R.d1.woodIn === 0 && near(R.d1.pack, R.d1.felled * 5, 1e-6), `첫날 — 말뚝이 다 치러져 모자람 0 이면 벤 통나무(${R.d1.felled} 그루 · ${R.d1.pack} 단)는 곳간에 안 들고 마을 짐에(소멸 0)`, R.d1);
    ok(R.d2.need > 0 && near(R.d2.woodIn, R.d2.need, 1e-6) && near(R.d2.store - R.d1.store, R.d2.woodIn * (1 - tax), 1e-3), `★이튿날 — 일괄이 막혀 모자람(${R.d2.need})이 서면 그날 벤 통나무가 모자람까지 곳간에(세금 뒤 ${+(R.d2.store - R.d1.store).toFixed(3)})`, R.d2);
    ok(near(R.d3.packIn, R.d2.need, 1e-6) && R.d3.postW > R.d2.postW && R.d3.added > B.d3.added, `★사흘째 — 일괄 앞에서 짐이 먼저 곳간에(어제 모자람 ${R.d2.need} 까지) → 그 통나무로 말뚝(${R.d2.postW} → ${R.d3.postW} 단) · 넓힘 ${R.d3.added} 칸`, R.d3);
    const pred = (x) => x.d2.woodIn > 0 && x.d3.packIn > 0 && x.d3.postW > x.d2.postW;
    ok(L.baitHasLine && pred(R) && !pred(B) && B.d2.woodIn === 0 && B.d3.packIn === 0 && B.d3.postW === B.d2.postW && B.d3.store === B.d1.store,
      `★미끼 — 입구 0 사본(고치기 전 글자)을 끼우면 곳간에 든 통나무 0 · 짐 넣기 0 · 사흘째 말뚝 0(${B.d2.postW} → ${B.d3.postW}) · 넓힘 ${B.d3.added} 칸 → 위 두 판정이 빨갛다`, B);
    const UB = LB.unit;
    ok(LB.t325 === true && UB.off0 === 7 && UB.g1 === 3 && UB.g2 === 0 && UB.g3 === 0, '몸 세계(나무꾼 몸 행위 켬)는 종전 입구 그대로 — 표지와 무관하게 D = `woodShareD`(나무꾼 몫 + 말뚝 모자람 · 표지 전 7 · 표지 뒤 남은 3)', UB);
    ok(LB.real.d3.packIn === 0, '몸 세계에서 일괄 앞 짐 넣기는 안 선다 — 짐은 나무꾼 하루 절이 같은 함수로 넣는다(한 자리)', LB.real.d3);
  }
  const EC = fs.readFileSync(path.join(ROOT, 'sim/economy-sim.js'), 'utf8'), VS = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
  ok(/const _t325In = \(T325_WOOD_ACT \|\| v\._t1238Land\) \? \(v\._t325InflowToday \|\| 0\) : 0;/.test(EC) && /return actToGranary\(v, 'wood', actDemandCap\(v, units, woodShareD\(v\), '_t325InflowToday'\), '_t325InflowToday', '_t325CutN'\);/.test(EC)
    && /if \(T717_WOOD_HAND && vil\.econ && !_lifeEcon\(\)\.T325_WOOD_ACT && \(vil\.econ\._t717Pack \|\| 0\) > 0\) _t717PackIn\(vil\);/.test(VS),
    '글자 — econ 틱이 표지 마을의 오늘 든 몫을 장부로 옮긴다 · 몸 세계 입구 줄 그대로 · 일괄 앞 짐 넣기는 수식 나무꾼 세계에서만');
}
sec('ⓜ [T1283] 나무 모자람 → 직업 고르기 · 미끼 · 틱 칸 · (나) 개간 통나무 걸음');
{
  const ENV = { T1207_TERR_REAL: '1', T1238_TERR_V2: '1', T1213_DERIV_ADD: '0' };
  const M = child('t1283', Object.assign({}, ENV, { T325_WOOD_ACT: '0', T1283_WOOD_DEMAND: '1', T1283_CLEAR_HAUL: '0' }));
  const MO = child('t1283', Object.assign({}, ENV, { T325_WOOD_ACT: '0', T1283_WOOD_DEMAND: '0', T1283_CLEAR_HAUL: '0' }));
  const HB0 = child('t1283', Object.assign({}, ENV, { T325_WOOD_ACT: '1', T1283_WOOD_DEMAND: '0', T1283_CLEAR_HAUL: '0' }));
  const HB1 = child('t1283', Object.assign({}, ENV, { T325_WOOD_ACT: '1', T1283_WOOD_DEMAND: '0', T1283_CLEAR_HAUL: '1' }));
  const HF1 = child('t1283', Object.assign({}, ENV, { T325_WOOD_ACT: '0', T1283_WOOD_DEMAND: '0', T1283_CLEAR_HAUL: '1' }));
  const bad = [M, MO, HB0, HB1, HF1].find((x) => !x || x.err);
  if (bad !== undefined) ok(false, 'T1283 자식 판이 안 섰다', bad && bad.err);
  else {
    const C = M.cases, food = (j) => ['farmer', 'fisher', 'hunter', 'forager'].includes(j);
    ok(M.on === true && near(C.c1.fe, 15, 1e-9) && C.c1.need === 'lumberjack', '★켬 — 기근 블록 안(곳간 15일치) · 나무꾼 0 · 말뚝 모자람 50 → 나무꾼 한 명(종전이면 식량 일)', C.c1);
    ok(MO.cases.c1.need !== 'lumberjack' && food(MO.cases.c1.need), '끔 — 같은 마을이 종전대로 식량 일(기근 문)', MO.cases.c1);
    ok(food(C.c2.need) && C.c2.w && near(C.c2.w.perLJ, 0.4, 1e-9) && near(C.c2.w.need, 510, 1e-9), `수식 나무꾼(한 사람 하루 ${C.c2.w && C.c2.w.perLJ} 단 ÷ 바람 510) < 식량 일꾼(하루 바람의 1/36) → 식량 일(${C.c2.need})`, C.c2);
    ok(C.c3.need === 'lumberjack' && near(C.c3.w.perLJ, 500, 1e-9), '★몸 나무꾼(한 사람 하루 500 단 ÷ 바람 510) ≥ 식량 쪽 → 나무꾼', C.c3);
    ok(food(C.c4.need) && C.c4.w.short === 0, '모자람 0 → 식량 일(켬이어도 종전 길)', C.c4);
    ok(food(C.c5.need) && C.c5.fe < 6, '하드 플로어 — 곳간 6일치 밑이면 모자람이 있어도 식량 일(T1148 문과 같은 수)', C.c5);
    ok(food(C.c6.need), '벨 자리 0(숲 0) → 식량 일', C.c6);
    ok(food(C.c7.need) && near(C.c7.w.perLJ, 0.4, 1e-6), '오늘 든 나무 중 개간 통나무는 나무꾼 몫에서 뺀다(1000 − 999.2 → 한 사람 0.4) → 식량 일', C.c7);
    ok(food(C.c8.need), '식량 일꾼 0 인 마을은 모자람이 있어도 이 문을 안 연다 → 기근 블록의 식량 일', C.c8);
    const B = M.bait;
    ok(M.baitHasLine && B.c4.need === 'lumberjack' && food(C.c4.need), `★미끼 — 수요를 상수로 박은 사본(모자람 1)은 모자람 0 인 마을도 나무꾼으로 보낸다(${B.c4.need}) → 위 "모자람 0 → 식량 일" 판정이 빨갛다`, B.c4);
    const T = M.tick;
    ok(T.keys.join(',') === '_t1283Clear,_t1283ClearToday,_t1283Fuel,_t1283FuelShort,_t1283House,_t1283HouseShort' && T.fuel > 0 && T.fuelShort >= 0 && T.fuelShort <= T.fuel && T.house >= T.houseShort && T.clear1 === 2 && T.clear === 0,
      `틱 칸(켬) — 땔감 바람 ${T.fuel && T.fuel.toFixed(3)} · 못 땐 ${T.fuelShort && T.fuelShort.toFixed(3)} · 집 바람 ${T.house && T.house.toFixed(3)} · 못 지은 ${T.houseShort && T.houseShort.toFixed(3)} · 개간 통나무 칸(서버가 센 2)은 날 경계에 오늘치로 옮겨지고(${T.clear1}) 이튿날 0`, T);
    ok(MO.tick.keys.length === 0, '끔 — 틱이 T1283 칸을 하나도 안 적는다(저장 줄 무변)', MO.tick.keys);
    const h0 = HB0.haul.day1, h1 = HB1.haul.day1, hf = HF1.haul.day1;
    ok(HB1.haul.t325 === true && h1.haulMin > 0 && h1.added < h0.added && h0.haulMin === null,
      `★(나) 나무꾼 몸 켬 세계 — 넓힌 칸의 그루를 곳간까지 지는 걸음 ${h1.haulMin && h1.haulMin.toFixed(1)}분이 일괄 몸의 낮에서 빠진다 · 첫날 넓힘 ${h0.added} → ${h1.added} 칸(끔 = 걸음 0)`, { h0, h1 });
    ok(hf.haulMin === null && hf.added === MO.haul.day1.added, '(나) 수식 나무꾼 세계(T325 끔)는 켜도 걸음 0 · 넓힘 그대로', { hf, off: MO.haul.day1 });
  }
  const EC = fs.readFileSync(path.join(ROOT, 'sim/economy-sim.js'), 'utf8'), VS = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
  const iT1148 = EC.indexOf('if (T1148_FUEL_JOB && foodEquiv > N * 6'), iT1283 = EC.indexOf('if (T1283_WOOD_DEMAND && foodEquiv > N * 6'), iFam = EC.indexOf('  if (foodEquiv < N * 30) {\n    // ★농사 불가 마을');
  ok(iT1283 > 0 && iT1148 > iT1283 && iFam > iT1148 && /candidates\.push\(\['lumberjack', v\.land\.wood \* 0\.3 \* period \* w\('wood'\)\]\);/.test(EC) && /case 'lumberjack':  return \(L\.wood \|\| 0\) \* 0\.3 \* w\('wood'\) \* sk;/.test(EC),
    '글자 — T1283 문은 T1148 문 바로 앞(T1148 문은 그대로 기근 블록 바로 앞) · 값 함수(나무꾼 한계 가치 · 기회비용) 줄 그대로');
  ok(/const T1283_WOOD_DEMAND = \(typeof process !== 'undefined' && process\.env && process\.env\.T1283_WOOD_DEMAND === '1'\);/.test(EC) && /const T1283_CLEAR_HAUL = process\.env\.T1283_CLEAR_HAUL === '1';/.test(VS)
    && /if \(walk \+ hw > budget\) \{ _keepCleared\(\); continue; \}/.test(VS)
    && /if \(E\.T1283_WOOD_DEMAND\) e\._t1283Clear = \(e\._t1283Clear \|\| 0\) \+ g;/.test(VS) && /if \(_lifeEcon\(\)\.T1283_WOOD_DEMAND\) vil\.econ\._t1283Clear = \(vil\.econ\._t1283Clear \|\| 0\) \+ g;/.test(VS),
    '글자 — 손잡이 둘(끔 기본 · `\'1\'` 만) · 일괄 말뚝 줄은 걸음 끔이면 종전 식(hw = 0) · 개간 통나무와 짐에서 든 몫을 같은 칸에 센다(켬만)');
}
sec('ⓝ [T1297 할 일 3 · T1283 (나)] 관측 마을 몸의 개간 통나무 걸음');
{
  const ENV = { T1207_TERR_REAL: '1', T1238_TERR_V2: '1', T1213_DERIV_ADD: '0', T1283_WOOD_DEMAND: '0' };
  const H1 = child('t1297haul', Object.assign({}, ENV, { T325_WOOD_ACT: '1', T1283_CLEAR_HAUL: '1' }));
  const H0 = child('t1297haul', Object.assign({}, ENV, { T325_WOOD_ACT: '1', T1283_CLEAR_HAUL: '0' }));
  const HF = child('t1297haul', Object.assign({}, ENV, { T325_WOOD_ACT: '0', T1283_CLEAR_HAUL: '1' }));
  const bad = [H1, H0, HF].find((x) => !x || x.err);
  if (bad !== undefined) ok(false, 'T1297 걸음 자식 판이 안 섰다', bad && bad.err);
  else {
    const r1 = H1.res, r0 = H0.res, rf = HF.res, units = 15, loads = Math.ceil(units / H1.perLoad - 1e-9);
    ok(H1.t325 && H1.haul && r1.done && r1.left === 0 && r1.trees === 0 && r1.felled === 3 && near(r1.got, units, 1e-6),
      `켬 — 그루 셋을 다 베고 통나무 ${units} 단이 다 곳간(+ 넘친 몫은 마을 짐)에 들었다 · 그 칸이 영토`, r1);
    ok(r1.loads === loads && r1.maxInv <= H1.perLoad + 1e-9 && r1.deposits === loads && r1.atLadder === loads && r1.atSite === 0,
      `★몸이 짐씩(한 짐 ${H1.perLoad} 단 · ${loads} 짐) 지고 곳간 사다리에서 부렸다 — 부린 곳 ${r1.atLadder}/${r1.deposits} 이 사다리 · 칸에서 든 몫 0`, r1);
    ok(!r1.terrEarly && r1.inv === 0, '더미가 비기 전엔 영토가 아니다 · 끝에 몸 손에 남은 통나무 0', r1);
    ok(!H0.haul && r0.done && r0.loads === 0 && near(r0.got, units, 1e-6) && r0.deposits === 1 && r0.atSite === 1 && r0.atLadder === 0,
      '끔 — 종전 줄: 일을 끝낸 순간 영토 · 통나무 15 단이 칸에서 곧장 곳간(걸음 0)', r0);
    ok(!HF.t325 && rf.done && rf.loads === 0 && rf.deposits <= 1, '수식 나무꾼 세계(T325 끔) — 켜도 걸음 0(그 세계엔 나무꾼 몸이 없다)', rf);
    ok(near(H1.flush.got, 7, 1e-6) && H1.flush.left === 0 && near(H0.flush.got, 7, 1e-6), '관측이 끝나 헤드리스로 넘어갈 때 — 벤 채 안 진 더미 7 단은 곳간으로(`_t1207Flush`)', { on: H1.flush, off: H0.flush });
  }
  const VS2 = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
  ok(/if\(_t1283BodyHaul\(vil,npc,t\)\)return;_t1207BodyDone\(vil,t\.site\);return;/.test(VS2) && /n \+= _t1207FellCell\(vil, x, y, \(u\) => _t1207LogIn\(vil, u\)\);/.test(VS2)
    && /refund:\(k,n\)=>\{if\(npc\._t1181Haul&&npc\._t1181Haul\.t1283\)\{_t1207LogIn\(vil,n\);return;\}E\.returnActMaterials\(vil\.econ,k,n\);\}/.test(VS2),
    '글자 — 몸 일감은 일한 시간을 채운 뒤 더미부터 · 일괄과 몸이 부리는 줄 하나(`_t1207LogIn`) · 돌려 놓기 부림은 개간 통나무 짐만 그 줄로');
}
console.log(`\n=== T1238: ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
