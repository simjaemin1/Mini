#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1268-econ-clock.js — 켬 갈래(econ 날 시계) 단위 하네스: 캐러밴 몸 · 장인 몸은 `_t1253Now` 하나만 읽는다 (T1268 · 2026-11-11) ==========
//
// ★왜 [T1258 회부 3] `T1253_CLOCK_FIX`(캐러밴 몸 · T1182) · `T1258_ARTISAN_CLOCK`(장인 몸 · T1196)이 켬 기본이 됐는데, 단위 하네스 둘(`test-t1182-caravan-body` ·
//   `test-t1196-artisan`)은 인수 시각으로 몰기 때문에 끔으로 묶였다 — 켬 갈래를 단위로 재는 자가 없었다(판 자 게이트만).
//
// ★증명 꼴 — **벽시계를 엉뚱한 값으로 흔들어도 결과가 같다.** 판정 사본 0: 운영 함수를 그대로 부른다
//   (`server/villages.js` 를 실어 `__labProbe._caravanBodyProbe` 의 `tickCaravanBodies` · `_t707Open` · `_t707Linger` · `_t1182BodyReady` · `_t1034Pack` · `_t1034Apply` · `__p3Bind` 의 `_t1196Step`).
//   한 판을 두 번 돈다: A = 벽시계가 곧게 흐른다 · B = 걸음마다 `Date.now()` 에 엉뚱한 덧셈(±10^9 ~ 10^13 ms — 1970년 · 3000년 근처)을 얹고
//   econ 날 원점(`state.epoch` — `econDayToMs` 앵커)도 같은 만큼 옮긴다(econ 상태 = world.day · dayMs · 그날 흐른 몫은 A 와 같다).
//   존 틱처럼 몸 틱 인수는 그 순간 `Date.now()` 다(운영 `zone.js` 틱 머리 · 장인 걸음의 `now`). 결과 = 걸음마다 몸 prog · phase · 자리(상인 · 호위) ·
//   머묾 끝 · 걸음 시계 원점 · 알갱이 번호 · 장 끝 · 장 정산 문 · 작업표 상태 · 곳간 산출 · 장인 라벨 · 목표 자리 · 머묾 시각(`W.at`).
//   켬 = A 와 B 가 바이트 같음 · 끔(`=0`) = 같은 흔들림에 결과가 갈린다(자명 통과 금지 · 걸음이 실제로 벽시계를 읽던 길).
//
// 지키는 것:
//   ⓪ 글자 — `_t1253Now` 정의 한 벌(econ 날 경계 + 그날 몫 · 마감 · 창 · 경계 순간엔 선다) · 손잡이 둘이 `!== '0'`(켬 기본) · 미끼 자리가 소스에 꼭 한 번
//   ① 켬(기본) — 캐러밴 몸(걸음 알갱이 · econ 이 밀린 동안 · 마감 동안 섬 · 마감 끝 경계 틱 · 다시 뜬 판 복원 · 장 끝 · 머묾 끝 → 귀환 · 장 정산 문) · 장인 몸(인출 · 제작 · 저장 머묾)이
//      벽시계 흔들림에 바이트 같음 + 전제(몸이 실제로 걸었다 · 머묾이 끝나 귀환했다 · 정산 문이 거짓 → 참으로 바뀌었다 · 장인 머묾 셋이 다 찼다 · 산출이 곳간에 들었다)
//   ② 끔(`T1253_CLOCK_FIX=0 T1258_ARTISAN_CLOCK=0`) — 같은 흔들림에 캐러밴 · 장인 결과가 둘 다 갈린다(이 판이 벽시계 읽기를 잡는 자라는 증인)
//   ③ 반쯤(캐러밴 켬 · 장인 끔) — 장인만 갈리고 캐러밴은 같다(손잡이가 제 몸만 가른다)
//   ④ ★미끼 — `server/villages.js` 사본(아이 프로세스 안 · 실을 때 글자 한 자리만 바꿈)에서 `_t1253Now()` 읽기 하나를 벽시계(`Date.now()` · 인수 `now`)로 되돌리면 빨강
//      (캐러밴 다섯 · 장인 둘 · 몸 갈래마다 하나 이상) — 잡은 수 ○/○ 를 끝 줄에 적는다.
//   ⑤ ★[T1289] 캐러밴 세 칸(`departAt` · `arriveAt` · `nomPxMs`)은 켬 · T1182 몸이면 econ 날 시계 축 — 흔들림에 같음(단언) · 끔은 갈림 · 미끼(`_t1289Leg` 출발 = Date.now())는 갈림
//   ⑥ ★[T1300 · T1289 회부 6] 전쟁 몸 세 칸 — 켬 · T681 켬(econ 날 장부 몸)이면 econ 날 시계 축(흔들림에 같음) · 끔 · T681 끔은 갈림 · 미끼(W1 행군 · W2 귀환 줄을 끔)는 갈림
//   ⚠결과에서 뺀 칸(벽시계 그대로인 줄 — 정보 · 판정 아님 · ★[T1289] 세 칸은 ⑤ 가 따로 잰다): `_lifeActAt`(라벨 바뀐 순간 · `zone.js` 보내기 창 그림 시각) · `departAt` · `arriveAt` · `nomPxMs`
//     (귀환 출발 `startReturnLeg` 가 인수 `now` 로 적는 종전 페이싱 칸 — T1182 몸 걸음은 안 읽는다 · `_t1182Move` 는 `dtMs` 만). 이 칸들이 흔들렸는지는 표로 적는다.
//   못 덮는 자리(이 판 밖 · 정보): 몸 세우기(`spawnCaravanBody` 셋) · 캐러밴 동기 도착 머묾(`_caravanSyncOne` `lingerUntil`) · 이웃 존 몸(`_xzMakeBody`) · 장마당 그림(`marketVillages`)
//     — 내보낸 문이 없다(⓪ 표로만 센다).
//
// 실행: node scripts/test-t1268-econ-clock.js   (존 안 띄움 · 아이 프로세스 열 · 몇 초)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
// ── 미끼 표 — [이름 · 몸 · 바꿀 글자(소스에 꼭 한 번) · 바꾼 글자] ───────────────────────────
const BAITS = [
  ['C1 걸음 시계 econ → Date.now()', 'car', 'const _en = T1253_CLOCK_FIX ? _t1253Now() : 0;', 'const _en = T1253_CLOCK_FIX ? Date.now() : 0;'],
  ['C2 몸 시각 econ → 인수 now', 'car', 'const _bn = (T1253_CLOCK_FIX && body._t1182) ? _en : now;', 'const _bn = (T1253_CLOCK_FIX && body._t1182) ? now : now;'],
  ['C3 장 끝 econ → Date.now()', 'car', 'end: (T762_CARAVAN_BODY ? (T1253_CLOCK_FIX ? _t1253Now() : Date.now()) : econDayToMs(D))', 'end: (T762_CARAVAN_BODY ? (T1253_CLOCK_FIX ? Date.now() : Date.now()) : econDayToMs(D))'],
  ['C5 다시 뜬 몸 걸음 원점 econ → 인수 now', 'car', 'body._t1182At=T1253_CLOCK_FIX ? _t1253Now() : now;if(T1253_CLOCK_FIX)body._t1253N=0;', 'body._t1182At=T1253_CLOCK_FIX ? now : now;if(T1253_CLOCK_FIX)body._t1253N=0;'],
  ['C4 장 정산 문 econ → Date.now()', 'car', "if (body.phase !== 'linger' || (T1253_CLOCK_FIX ? _t1253Now() : Date.now()) < body.lingerUntil) return false;", "if (body.phase !== 'linger' || (T1253_CLOCK_FIX ? Date.now() : Date.now()) < body.lingerUntil) return false;"],
  ['A1 장인 머묾 econ → Date.now()', 'art', 'const now = T1258_ARTISAN_CLOCK ? _t1253Now() : now0;', 'const now = T1258_ARTISAN_CLOCK ? Date.now() : now0;'],
  ['A2 장인 머묾 econ → 인수 now', 'art', 'const now = T1258_ARTISAN_CLOCK ? _t1253Now() : now0;', 'const now = T1258_ARTISAN_CLOCK ? now0 : now0;'],
];
//   ★[T1289] 세 칸 미끼 — 판정 = 캐러밴 세 칸(`departAt` · `arriveAt` · `nomPxMs`)이 흔들림에 갈린다(⑤)
const META_BAITS = [
  ['T1 세 칸 econ 축 → 벽시계(`_t1289Leg` 출발 = Date.now())', 'const e = _t1253Now(); body.departAt = e;', 'const e = Date.now(); body.departAt = e;'],
];
//   ★[T1300 · T1289 회부 6] 전쟁 몸 세 칸 미끼 — 판정 = 전쟁 몸 세 칸(행군 · 귀환)이 흔들림에 갈린다(⑥)
const WAR_BAITS = [
  ['W1 행군 몸 세 칸 econ 축 → 벽시계(종전)', 'if (T1253_CLOCK_FIX && body._t681) _t1289Leg(body, eta * state.dayMs);', 'if (false) _t1289Leg(body, eta * state.dayMs);'],
  ['W2 귀환 몸 세 칸 econ 축 → 벽시계(종전)', 'if (T1253_CLOCK_FIX && body._t681) _t1289Leg(body, (state.world.day + legDays) * state.dayMs);', 'if (false) _t1289Leg(body, (state.world.day + legDays) * state.dayMs);'],
];
const ROLE = process.argv[2];

// ══ 아이: 한 판(A · B) 돌고 결과 한 줄 ═══════════════════════════════════════════════════
if (ROLE === '--child') {
  const a3 = process.argv[3] != null && process.argv[3] !== '-' ? String(process.argv[3]) : '';
  const bi = a3 === '' ? -1 : a3[0] === 'm' ? 1000 + +a3.slice(1) : a3[0] === 'w' ? 2000 + +a3.slice(1) : +a3;   // ★[T1289] 'm…' = `META_BAITS` · ★[T1300] 'w…' = `WAR_BAITS`
  if (bi >= 0) {   // 미끼 — 이 아이가 실을 때만 villages.js 글자 한 자리를 바꾼다(파일은 안 만진다)
    const [from, to] = bi >= 2000 ? WAR_BAITS[bi - 2000].slice(1) : bi >= 1000 ? META_BAITS[bi - 1000].slice(1) : BAITS[bi].slice(2), old = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      if (f !== VFILE) return old(m, f);
      const src = fs.readFileSync(f, 'utf8'), n = src.split(from).length - 1;
      if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ err: `미끼 자리 ${n}곳` }) + '\n'); process.exit(3); }
      m._compile(src.replace(from, to), f);
    };
  }
  const mute = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
  const V = require(VFILE), E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const P = V.__labProbe._caravanBodyProbe, H = V.__p3Bind({}), S = H.state;
  const realNow = Date.now;
  let CLK = 0; Date.now = () => CLK;
  const sha = (x) => require('crypto').createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  const R9 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toPrecision(15) : v);
  //   판 시계 — 하루 4분(M) · econ 날 D0 의 경계 = 벽시계 0 − (M − 30초) — 판은 하루 끝 30초 전에서 시작한다(벽시계 좌표 `wall` 30초 = 하루 끝)
  const E0 = 1.6e12, M = 240000, G0 = 4800, D0 = 100, BASE = E0 + G0 * M + (M - 30000), DAY_END = 30000;
  //   흔들림 — 걸음 k 의 덧셈(A = 0 · B = 늘 0 아님 · 차례가 판마다 같다 · 주사위 0). 1970년 근처(벽시계 ≈ 몇 초 ~ 몇 시간)부터 3000년 근처까지 · 다 정수 ms(셈이 바이트로 맞는다)
  const OFF = [3.1e11, -7.7e11, 9.9e12, -1.2e9, 4.4e13, 2.5e10, -1.6e12, 7e12, 1.3e9, -9e11, 5e6 - BASE, 3.6e6 - BASE, -BASE + 1];
  const offAt = (mode, k) => (mode === 'B' ? OFF[(k * 5 + 3) % OFF.length] : 0);
  //   econ 상태: econDayToMs(D) = epoch + (lastGameDay + D − world.day) × dayMs — 판마다 같다(흔들림은 epoch 와 벽시계를 같이 민다)
  const setClock = (mode, k, wall) => { const o = offAt(mode, k); CLK = BASE + wall + o; S.epoch = E0 + o; return o; };
  const gaps = [33, 34, 33, 50, 17, 80, 33, 21, 66, 33];   // 틱 간격(ms · 판마다 같은 차례 — 존 틱의 흔들림 흉내)

  // ── 캐러밴 몸 ────────────────────────────────────────────────────────────────
  function carRun(mode) {
    const E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
    const w = mute(() => E2.createWorldV2({ seed: 7, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0 }));
    const [a, b] = w.villages;
    w.day = D0;
    const c = { id: 1, from: a, to: b, trader: a.npcs[0], state: 'outbound', arriveDay: D0 + 2, returnArriveDay: D0 + 4, escort: 0 };
    w.caravans = [c];
    const p = { pid: 'merchant', x: 0, y: 0, hp: 100, hunger: 100, thirst: 100 }, g = { pid: 'guard', x: 0, y: 0, hp: 100 };
    Object.assign(S, { world: w, ready: false, dayMs: M, lastGameDay: G0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, roads: null, byEcon: new Map(),
      deps: { players: new Map([[p.pid, p], [g.pid, g]]), npcs: new Map(), moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; } },
      caravanBodies: new Map(), _carTickAt: undefined });
    let k = 0, wall = 0;
    setClock(mode, k, wall);
    const body = { id: c.id, c, pid: p.pid, phase: 'outbound', toV: b, _t1182: true, escorts: [{ pid: g.pid, pinH: 100, pinT: 100 }], pinHunger: 100, pinThirst: 100, repairFailN: 0, lastRepairAt: 0, delayedDays: 0 };
    P.pts(body, [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 12000, y: 4000 }]);
    S.caravanBodies.set(c.id, body);
    const trace = [], meta = [], clk = [];
    let readyFlips = 0, lastReady = null, lingerEnded = false, marketEnd = null;
    const snap = (tag) => {
      const rd = P.ready(c, 'market');
      if (lastReady !== null && rd !== lastReady) readyFlips++;
      lastReady = rd;
      trace.push([tag, body.phase, R9(body.prog), R9(body.len), R9(p.x), R9(p.y), R9(g.x), R9(g.y), R9(body.lingerUntil), R9(body._t1182At), body._t1253N | 0, rd ? 1 : 0, R9(marketEnd)]);
      meta.push([R9(body.departAt), R9(body.arriveAt), R9(body.nomPxMs)]);
      clk.push(CLK);
    };
    const tick = (tag) => { wall += gaps[k % gaps.length]; k++; setClock(mode, k, wall); mute(() => P.tick(Date.now())); snap(tag); };
    const roll = () => { w.day++; S.lastGameDay++; };   // econ 하루 넘김(world.day · 앵커 같이)
    // ① 가는 길 — 하루 끝 30초 전부터(econ 날 D0 · 그날 몫이 흐른다)
    while (wall < DAY_END) tick('out');
    const prog1 = body.prog, guard1 = g.x;
    // ② econ 이 밀렸다 — 벽시계는 하루 끝을 지났는데 마감 전(econ 날 시계는 하루 끝에 선다) · 이어 하루 마감 조각(몸은 선다)
    while (wall < DAY_END + 1500) tick('late');
    const progLate = body.prog;
    S.tickJobs = [{}];
    while (wall < DAY_END + 3000) tick('close');
    const progClose = body.prog;
    //   마감 끝 경계 틱(운영 `_drainTickJobs` 꼬리 그대로 — `_t1253Edge`) → 다음 날
    S.tickJobs = null; roll();
    S._t1253Edge = true; try { tick('edge'); } finally { S._t1253Edge = false; }
    let arrived = false, restored = 0;
    for (let i = 0; i < 1500 && !arrived; i++) {
      tick('out2'); arrived = P.ready(c, 'outbound');   // 정산 문(가는 길) — 상인 · 호위가 제 발로 종점에
      //   다시 뜬 판 — 메타 행에 싣고(`_t1034Pack`) 몸에 되돌린다(`_t1034Apply` — 운영 T775 다시 세우기 뒤 그 문 · 걸음 원점 = 그 순간)
      if (i === 150) { const pk = P.pack(); S._t1034Saved = new Map([[String(c.id), pk.b[String(c.id)]]]); mute(() => P.restore(body, Date.now())); restored = S._t1034Saved.size === 0 ? 1 : 0; snap('restore'); }
    }
    // ③ 닿음 — 장을 연다(`_t707Open`) · 머묾 = 장 끝(`_t707Linger`)
    const end = body.pts[body.pts.length - 1];
    const atEnd = Math.hypot(p.x - end.x, p.y - end.y) <= 0.5 && Math.hypot(g.x - end.x, g.y - end.y) <= 0.5;
    body.phase = 'linger';
    S.byEcon = new Map([[c.to, { npcPids: [] }]]);
    const rec = mute(() => P.openMarket(c)); marketEnd = rec ? rec.end : null;
    mute(() => P.linger(body, c, p));
    S.byEcon = new Map();   // 귀환 길은 걸어온 길 거꾸로(교역로 표 없음)
    snap('open');
    // ④ 머묾 → 귀환(장 끝 = 연 순간 + 4게임시간 · 하루 4분 판이면 40초) · 귀환 걸음
    for (let i = 0; i < 1800; i++) { const ph = body.phase; tick('stay'); if (ph === 'linger' && body.phase === 'inbound') lingerEnded = true; }
    for (let i = 0; i < 300; i++) tick('back');
    return { h: sha(trace), meta: sha(meta), n: trace.length, trace, prog1: Math.round(prog1), progLate: Math.round(progLate), progClose: Math.round(progClose), arrived, atEnd, restored, back: Math.round(body.prog), len: Math.round(body.len),
      lingerEnded, readyFlips, phase: body.phase, marketEnd: R9(marketEnd), clkMin: Math.min(...clk), clkMax: Math.max(...clk), guard1: R9(guard1) };
  }

  // ── 장인 몸 ──────────────────────────────────────────────────────────────────
  function artRun(mode) {
    const players = new Map();
    Object.assign(S, { world: { day: D0 }, dayMs: M, lastGameDay: G0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, byEcon: new Map(),
      deps: { players, broadcast: () => {}, facilityNear: () => null } });
    const W = {}; E.bindProductionActs(W);
    const vil = { dbId: 5, name: '시험', ccx: 20, ccy: 20, npcPids: ['b1', 'b3'], _granList: [{ cx: 24, cy: 20 }],
      econ: { storage: { stone: 10, food: 5 }, treasury: {}, _world: W, counts: { mason: 1, cook: 1 } } };
    const b1 = { pid: 'b1', simJob: 'mason', simVillageId: 5, x: 0, y: 0 }, b3 = { pid: 'b3', simJob: 'cook', simVillageId: 5, x: 0, y: 0 };
    players.set('b1', b1); players.set('b3', b3);
    vil.econ._t1196Q = [
      { id: 1, job: 'mason', day: D0, take: { stone: 2 }, give: { tool: 0.9 }, tre: { tool: 0.1 }, st: 0, f: 0, pid: null },
      { id: 2, job: 'cook', day: D0, take: { food: 1 }, give: { cooked_food: 1.5 }, tre: {}, st: 0, f: 0, pid: null },
      { id: 3, job: 'mason', day: D0, take: { stone: 1 }, give: { tool: 0.5 }, tre: {}, st: 0, f: 0, pid: null },
    ];
    vil.econ._t1196R = { stone: 3, food: 1 };
    let k = 0, wall = 0;
    const steps = [700, 1000, 1300, 1000, 900, 1100];   // 걸음 간격(ms · 판마다 같은 차례)
    const trace = [], acts = [], clk = [], labs = { b1: [], b3: [] };
    const st = (b) => { const W2 = b._t1196W; return W2 ? [W2.ph, R9(W2.at), R9(W2.tx), R9(W2.ty)] : null; };
    for (let i = 0; i < 1200; i++) {
      wall += steps[k % steps.length]; k++; setClock(mode, k, wall);
      //   하루 끝(벽시계 DAY_END + n × 하루)을 지나면 econ 이 2초 밀린다(그동안 마감 조각 · econ 날 시계는 하루 끝에 선다) → 날 넘김(앵커 같이)
      const dayEnd = DAY_END + (S.lastGameDay - G0) * M;
      if (wall >= dayEnd + 2000) { S.world.day++; S.lastGameDay++; S.tickJobs = null; }
      else S.tickJobs = (wall >= dayEnd + 800) ? [{}] : null;
      for (const [b, job] of [[b1, 'mason'], [b3, 'cook']]) {
        const r = H._t1196Step(vil, b, Date.now(), job);
        if (b._lifeAct && labs[b.pid][labs[b.pid].length - 1] !== b._lifeAct) labs[b.pid].push(b._lifeAct);
        trace.push([i, b.pid, r === null ? 'n' : r ? 1 : 0, b._lifeAct || '', b._t1196J ?? null, st(b), R9(b.targetX), R9(b.targetY)]);
        acts.push(R9(b._lifeActAt));
        if (b.targetX != null) { b.x = b.targetX; b.y = b.targetY; }
      }
      const s0 = vil.econ.storage;
      trace.push([i, 'v', R9(s0.stone), R9(s0.food), R9(s0.tool), R9(s0.cooked_food), vil.econ._t1196Q.map((t) => [t.id, t.st, t.pid]).join(';')]);
      clk.push(CLK);
    }
    const s = vil.econ.storage;
    return { h: sha(trace), acts: sha(acts), n: trace.length, trace, labs: { b1: labs.b1.join('>'), b3: labs.b3.join('>') }, q: vil.econ._t1196Q.length, tool: R9(s.tool), cooked: R9(s.cooked_food), stone: R9(s.stone), food: R9(s.food), clkMin: Math.min(...clk), clkMax: Math.max(...clk), days: S.world.day - D0 };
  }
  // ── ★[T1300] 전쟁 몸 세 칸 — 행군 몸 세우기(`_warEnsureBody`) · 귀환 출발(`_warSetupReturn` · 37초 뒤) 운영 문 그대로 ──────────────
  function warRun(mode) {
    const vA = { dbId: 1, name: '가', ccx: 10, ccy: 10, npcPids: [] }, vB = { dbId: 2, name: '나', ccx: 40, ccy: 22, npcPids: [] };
    Object.assign(S, { world: { day: D0, villages: [], caravans: [] }, dayMs: M, lastGameDay: G0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, byEcon: new Map(), roads: null,
      deps: { players: new Map(), npcs: new Map(), broadcast: () => {} }, warBodies: new Map(), routeCache: new Map(), warLive: { WAR_ENGAGE_R: 3, WAR_DEF_STANDOFF: 2 } });   // 대형 없는 몸(병사 0) — 세 칸만 본다
    let k = 0, wall = 0; setClock(mode, k, wall);
    const w = { id: 7, atk: vA, def: vB, born: D0, eta: D0 + 2, marchDays: 2, phase: 'march' }, rows = [];
    const rec = (tag, b) => rows.push([tag, R9(b.departAt), R9(b.arriveAt), R9(b.nomPxMs), R9(b.prog), R9(b.len), b.phase]);
    const b = mute(() => H._warEnsureBody(w, Date.now())); rec('march', b);
    wall += 37000; k++; setClock(mode, k, wall);
    const eAt = mute(() => P.econNow());
    mute(() => H._warSetupReturn(b, [], false)); rec('return', b);
    return { h: sha(rows), rows, t681: !!b._t681, eAt: R9(eAt), wantM: (D0 + 2) * M, wantR: (D0 + 2) * M };
  }
  let out;
  try {
    const cA = carRun('A'), cB = carRun('B'), aA = artRun('A'), aB = artRun('B'), wA = warRun('A'), wB = warRun('B');   // ★[T1300] 전쟁 몸
    const firstDiff = (x, y) => { for (let i = 0; i < Math.max(x.length, y.length); i++) if (JSON.stringify(x[i]) !== JSON.stringify(y[i])) return [i, x[i], y[i]]; return null; };
    const pick = (r) => { const o = Object.assign({}, r); delete o.trace; return o; };
    out = { knobs: { car: process.env.T1253_CLOCK_FIX !== '0', art: process.env.T1258_ARTISAN_CLOCK !== '0' },
      car: { A: pick(cA), B: pick(cB), same: cA.h === cB.h, metaSame: cA.meta === cB.meta, diff: firstDiff(cA.trace, cB.trace) },
      art: { A: pick(aA), B: pick(aB), same: aA.h === aB.h, actsSame: aA.acts === aB.acts, diff: firstDiff(aA.trace, aB.trace) },
      war: { A: wA, B: wB, same: wA.h === wB.h, diff: firstDiff(wA.rows, wB.rows) } };   // ★[T1300]
  } catch (e) { out = { err: String(e && e.stack || e).slice(0, 600) }; }
  Date.now = realNow;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ══ 부모 ══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const child = (bait, env) => {
  const E = Object.assign({}, process.env); delete E.T1253_CLOCK_FIX; delete E.T1258_ARTISAN_CLOCK; Object.assign(E, env || {});
  const r = spawnSync(process.execPath, [__filename, '--child', bait == null ? '-' : String(bait)], { encoding: 'utf8', env: E, timeout: 120000, maxBuffer: 1 << 26 });
  const line = ((r.stdout || '') + '').split('\n').find((l) => l.startsWith('@@'));
  return line ? JSON.parse(line.slice(2)) : { err: ((r.stderr || '') + (r.stdout || '')).slice(-600) };
};
const dtxt = (d) => (d ? `첫 갈림 #${d[0]} ${JSON.stringify(d[1]).slice(0, 90)} ↔ ${JSON.stringify(d[2]).slice(0, 90)}` : '');
console.log('\n=== T1268 켬 갈래 단위 하네스 — 캐러밴 몸 · 장인 몸은 econ 날 시계(`_t1253Now`) 하나만 읽는다 ===');

console.log('\n⓪ 글자');
{
  const codeOnly = require('./code-only.js');
  const V = fs.readFileSync(VFILE, 'utf8'), C = codeOnly(V);
  //   ★[T1282] 마감 · 창 · 경계 틱 줄이 "닫는 날의 끝"으로 바뀌었다(종전 `return D * M;` = econ 머리 앞 마감 틱엔 그날 머리 — 진 장이 다시 그려졌다 · T1273 회부 3 · 보고 T1282) — 정의 글자를 새 줄로 고정
  const def = C.match(/function _t1253Now\(\) \{\n  const M = state\.dayMs \|\| 1, D = state\.world \? \(state\.world\.day \| 0\) : 0;\n  if \(state\.tickJobs \|\| state\._t731 \|\| state\._t1253Edge\) return \(state\._t1282D === D \? D \+ 1 : D\) \* M;[^\n]*\n  return D \* M \+ Math\.min\(M, Math\.max\(0, Date\.now\(\) - econDayToMs\(D\)\)\);\n\}/g) || [];
  ok(def.length === 1 && (C.match(/function _t1253Now\(/g) || []).length === 1, '⓪ `_t1253Now` 한 벌 — econ 날 경계 D × 하루 + 그날 흐른 몫(0 ~ 하루) · 마감 · 창 · 경계 틱엔 닫는 날의 끝(★[T1282] econ 머리 앞이면 (D + 1) × 하루 · 뒤면 D × 하루)', `정의 ${def.length}`);
  const k1 = (C.match(/^const T1253_CLOCK_FIX = process\.env\.T1253_CLOCK_FIX !== '0';$/gm) || []).length, k2 = (C.match(/^const T1258_ARTISAN_CLOCK = process\.env\.T1258_ARTISAN_CLOCK !== '0';$/gm) || []).length;
  ok(k1 === 1 && k2 === 1, '⓪ 손잡이 둘 — `!== \'0\'`(켬 기본 · 되돌림 `=0`) 한 줄씩', `T1253 ${k1} · T1258 ${k2}`);
  const once = BAITS.map(([n, , from]) => V.split(from).length - 1);
  ok(once.every((x) => x === 1), `⓪ 미끼 ${BAITS.length}자리가 제품 소스에 꼭 한 번씩(미끼가 실제 줄을 바꾼다)`, once.join(' · '));
  const reads = (C.match(/(?<!function )_t1253Now\(\)/g) || []).length;   // 정의 줄 뺌
  //   몸 시계 자리 전수(정보) — `_t1253Now()` 를 읽는 함수
  const fnOf = (i) => { const j = C.lastIndexOf('\nfunction ', i); return j < 0 ? '?' : C.slice(j + 10, C.indexOf('(', j + 10)); };
  const fns = [...C.matchAll(/(?<!function )_t1253Now\(\)/g)].map((m) => fnOf(m.index));
  const cnt = {}; for (const f of fns) cnt[f] = (cnt[f] || 0) + 1;
  console.log(`    [표] \`_t1253Now()\` 읽는 자리 ${reads}곳(정의 뺌) — ${Object.entries(cnt).map(([f, n]) => `${f}${n > 1 ? '×' + n : ''}`).join(' · ')}`);
  ok(reads >= 10 && cnt._t1196Step === 1 && cnt.tickCaravanBodies === 1 && cnt._t707Open === 1 && cnt._t1182BodyReady === 1 && cnt._t1034Apply === 1, '⓪ [전제] 이 판이 부르는 함수 다섯이 `_t1253Now()` 를 읽는다(걸음 · 장 끝 · 정산 문 · 다시 뜬 몸 · 장인 머묾)', `${reads}곳`);
}

const on = child(null, {}), off = child(null, { T1253_CLOCK_FIX: '0', T1258_ARTISAN_CLOCK: '0' }), half = child(null, { T1258_ARTISAN_CLOCK: '0' });
console.log('\n① 켬(기본) — 벽시계 흔들림에 바이트 같음');
if (on.err) ok(false, '① 켬 판이 돌았다', on.err);
else {
  const c = on.car, a = on.art;
  ok(on.knobs.car && on.knobs.art, '① [전제] 아이 판 손잡이 = 켬 둘(env 없음 = 운영 기본)');
  ok(c.B.clkMin < c.A.clkMin && c.B.clkMax > c.A.clkMax * 10 && a.B.clkMax > a.A.clkMax * 10, '① [전제] B 판 벽시계가 실제로 엉뚱했다(A 범위 밖 · 위아래로)', `A ${c.A.clkMin}~${c.A.clkMax} · B ${c.B.clkMin}~${c.B.clkMax}`);
  ok(c.same, '★① 캐러밴 몸 — 걸음 · econ 밀림 · 마감 · 경계 틱 · 다시 뜬 판 복원 · 장 끝 · 머묾 끝 · 정산 문 · 귀환 걸음이 흔들림에 바이트 같음', c.same ? `${c.A.n}걸음 · ${c.A.h}` : dtxt(c.diff));
  ok(c.A.prog1 > 1000 && c.A.progLate === c.A.prog1 && c.A.progClose === c.A.progLate && c.A.arrived && c.A.atEnd && c.A.guard1 > 0 && c.A.restored === 1,
    '① [전제] 몸이 실제로 걸었다 — 하루 끝까지 걷고 · econ 이 밀린 동안(벽시계는 하루를 넘김) · 마감 동안은 섰다 · 다음 날 이어 걷다 · 다시 뜬 판 복원(`_t1034Apply`)을 거쳐 · 종점에 제 발로 닿았다(가는 길 정산 문 참 · 상인 · 호위)',
    `하루 끝 ${c.A.prog1}px · 밀림 끝 ${c.A.progLate}px · 마감 끝 ${c.A.progClose}px · 복원 ${c.A.restored} · 닿음 ${c.A.arrived}/${c.A.atEnd} · 길 ${c.A.len}px · 호위 x ${c.A.guard1}`);
  ok(c.A.lingerEnded && c.A.phase === 'inbound' && c.A.back > 1000 && c.A.readyFlips >= 2 && Number.isFinite(c.A.marketEnd), '① [전제] 머묾이 장 끝에 끝나 귀환해 걸었다 · 장 정산 문이 거짓 → 참(장 끝) → 거짓(귀환)으로 바뀌었다', `귀환 ${c.A.lingerEnded} · 귀환 걸음 ${c.A.back}px · 문 뒤집힘 ${c.A.readyFlips} · 장 끝 ${c.A.marketEnd}`);
  ok(a.same, '★① 장인 몸 — 인출 · 제작 · 저장 머묾(작업표 상태 · 곳간 · 라벨 · 목표 · `W.at`)이 흔들림에 바이트 같음', a.same ? `${a.A.n}줄 · ${a.A.h}` : dtxt(a.diff));
  ok(a.A.labs.b1 === '인출>운반>제작>운반>저장>인출>운반>제작>운반>저장' && a.A.labs.b3 === '인출>운반>제작>운반>저장' && a.A.q === 0 && a.A.tool === 1.4 && a.A.cooked === 1.5 && a.A.stone === 7 && a.A.food === 4 && a.A.days >= 1,
    '① [전제] 머묾이 다 찼다 — 석공 작업표 둘(제작 = 작업대 정본 3분) · 요리 하나 · 곳간에 산출(도구 1.4 · 요리 1.5) · econ 날을 넘겨서도', `석공 ${a.A.labs.b1} · 요리 ${a.A.labs.b3} · 도구 ${a.A.tool} · 날 +${a.A.days}`);
  console.log(`    [표·정보] 결과에서 뺀 벽시계 칸 — 캐러밴 departAt · arriveAt · nomPxMs ${c.metaSame ? '같음' : '흔들림(종전 페이싱 칸 · T1182 걸음은 안 읽음)'} · 장인 _lifeActAt ${a.actsSame ? '같음' : '흔들림(라벨 그림 시각)'}`);
}
console.log('\n② 끔(`T1253_CLOCK_FIX=0 T1258_ARTISAN_CLOCK=0`) — 같은 흔들림에 갈린다(자명 통과 금지)');
if (off.err) ok(false, '② 끔 판이 돌았다', off.err);
else {
  ok(!off.knobs.car && !off.knobs.art, '② [전제] 아이 판 손잡이 = 끔 둘');
  ok(!off.car.same, '★② 캐러밴 몸 — 끔이면 벽시계 흔들림이 결과를 바꾼다', dtxt(off.car.diff));
  ok(!off.art.same, '★② 장인 몸 — 끔이면 벽시계 흔들림이 결과를 바꾼다', dtxt(off.art.diff));
}
console.log('\n③ 반쯤(캐러밴 켬 · 장인 끔) — 손잡이가 제 몸만 가른다');
if (half.err) ok(false, '③ 반쯤 판이 돌았다', half.err);
else ok(half.knobs.car && !half.knobs.art && half.car.same && !half.art.same && on.car && half.car.A.h === on.car.A.h, '③ 캐러밴은 같음(켬 판과 바이트 같음) · 장인만 갈림', `캐러밴 ${half.car.same} · 장인 ${half.art.same}`);

console.log('\n④ ★미끼 — 사본에서 `_t1253Now()` 읽기 하나를 벽시계로 되돌리면 빨강');
let caught = 0;
const byBody = { car: 0, art: 0 };
for (let i = 0; i < BAITS.length; i++) {
  const [name, kind] = BAITS[i], r = child(i, {});
  const red = !r.err && r[kind] && !r[kind].same;
  if (red) { caught++; byBody[kind]++; }
  ok(red, `④ 미끼 ${name} — ${kind === 'car' ? '캐러밴' : '장인'} 결과가 흔들림에 갈린다(잡음)`, r.err ? r.err.slice(0, 160) : (r[kind] ? dtxt(r[kind].diff) : ''));
}
ok(byBody.car >= 1 && byBody.art >= 1, '④ 몸 갈래마다 미끼 하나 이상을 잡았다', `캐러밴 ${byBody.car} · 장인 ${byBody.art}`);
console.log(`\n  미끼 ${caught}/${BAITS.length}`);

//   ★[T1289 · T1273 회부 1] 캐러밴 세 칸은 켬 · T1182 몸이면 econ 날 시계 축 — ① 의 [표·정보] 칸이 이제 단언이다(흔들림에 안 갈린다 · 끔은 갈린다)
console.log('\n⑤ ★[T1289] 캐러밴 세 칸(`departAt` · `arriveAt` · `nomPxMs`) — 켬이면 벽시계 흔들림에 같음 · 끔 · 미끼는 갈림');
if (!on.err) ok(on.car.metaSame, '★⑤ 켬 — 세 칸(귀환 출발 `startReturnLeg` 이 적는다 · 저장에 실린다)이 흔들림에 바이트 같음(econ 날 시계 축)', on.car.metaSame ? on.car.A.meta : '갈림');
if (!off.err) ok(!off.car.metaSame, '⑤ [자명 통과 금지] 끔 — 같은 흔들림에 세 칸이 갈린다(종전 벽시계 축)', off.car.metaSame ? '같음' : '갈림');
for (let i = 0; i < META_BAITS.length; i++) {
  const r = child('m' + i, {});
  ok(!r.err && !r.car.metaSame && r.car.same, `⑤ 미끼 ${META_BAITS[i][0]} — 세 칸이 흔들림에 갈린다(잡음 · 몸 결과는 같음 — 세 칸은 T1182 걸음이 안 읽는다)`, r.err ? r.err.slice(0, 160) : `세 칸 ${r.car.metaSame ? '같음' : '갈림'} · 몸 ${r.car.same ? '같음' : '갈림'}`);
}

//   ★[T1300 · T1289 회부 6] 전쟁 몸 세 칸 — 켬 · econ 날 장부 몸(T681 켬 기본)이면 캐러밴 T1182 몸과 같은 econ 날 시계 축(출발 = econ 날 시계 '지금' · 도착 = 도착 날 × 하루)
//     T681 끔 판(`T681_WALLCLOCK=0`)은 그 판의 페이싱(`_warPaceCommander` · `_warPaceReturn` 끔 갈래 · `_warEnsureBody` 끔 몫)이 세 칸을 벽시계 `now` 와 견주는 유일한 읽는 이 — 그 판엔 줄이 안 선다(종전 벽시계 그대로)
console.log('\n⑥ ★[T1300] 전쟁 몸 세 칸(`departAt` · `arriveAt` · `nomPxMs`) — 켬 · T681 켬이면 econ 날 시계 축(흔들림에 같음) · 끔 · T681 끔은 종전 벽시계(갈림) · 미끼는 갈림');
const t681off = child(null, { T681_WALLCLOCK: '0' });
if (!on.err) {
  const W = on.war, m = W.A.rows[0], r = W.A.rows[1];
  ok(W.A.t681 && W.same, '★⑥ 켬 — 행군 · 귀환 세 칸이 벽시계 흔들림에 바이트 같음(econ 날 시계 축)', W.same ? JSON.stringify(W.A.rows.map((x) => x.slice(1, 4))) : dtxt(W.diff));
  ok(m[2] === W.A.wantM && r[1] === W.A.eAt && r[2] === W.A.wantR && r[6] === 'return' && m[3] > 0 && r[3] > 0, '⑥ 켬 — 행군 도착 = eta × 하루 · 귀환 출발 = econ 날 시계 지금 · 귀환 도착 = (지금 날 + 행군 날 수) × 하루 · 명목 > 0',
    `행군 도착 ${m[2]} = ${W.A.wantM} · 귀환 출발 ${r[1]} = ${W.A.eAt} · 귀환 도착 ${r[2]} = ${W.A.wantR}`);
}
if (!off.err) ok(!off.war.same, '⑥ [자명 통과 금지] 끔(`T1253_CLOCK_FIX=0`) — 같은 흔들림에 전쟁 몸 세 칸이 갈린다(종전 벽시계 축)', off.war.same ? '같음' : dtxt(off.war.diff));
if (t681off.err) ok(false, '⑥ T681 끔 판이 돌았다', t681off.err);
else ok(!t681off.war.A.t681 && !t681off.war.same, '⑥ T681 끔(`T681_WALLCLOCK=0`) · 켬 — 장부 없는 페이싱 몸은 종전 벽시계 축 그대로(그 판의 페이싱이 세 칸을 벽시계 `now` 와 견준다 — 이 줄은 안 선다)', t681off.war.same ? '같음' : dtxt(t681off.war.diff));
let wcaught = 0;
for (let i = 0; i < WAR_BAITS.length; i++) {
  const r = child('w' + i, {}), red = !r.err && !r.war.same && r.car.same;
  if (red) wcaught++;
  ok(red, `⑥ 미끼 ${WAR_BAITS[i][0]} — 전쟁 몸 세 칸이 흔들림에 갈린다(잡음 · 캐러밴 몸은 같음)`, r.err ? r.err.slice(0, 160) : dtxt(r.war.diff));
}
console.log(`\n  전쟁 몸 미끼 ${wcaught}/${WAR_BAITS.length}`);
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
