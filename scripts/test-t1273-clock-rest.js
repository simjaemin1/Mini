#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1273-clock-rest.js — 켬 갈래에 남은 벽시계 칸 셋 · 단위 판 밖 `_t1253Now()` 자리 여섯 (T1273 · T1268 회부 2 · 4 · 2026-11-11) ==========
//
// ★왜 [T1268 회부 2] 캐러밴 `departAt` · `arriveAt` · `nomPxMs` 는 켬(`T1253_CLOCK_FIX` 기본)에서도 벽시계(인수 `now`)로 적힌다
//   (`spawnCaravanBody` · 귀환 출발 `startReturnLeg` · `_xzMakeBody` · 경계 걷기 `_xzWalkToBorder` …) · `_t1034Pack` 이 저장에 싣는다.
//   결과(곳간 · 몸 자리 · 저장 바이트 · 클라 그림)에 닿는지 재는 자가 없었다.
//   [T1268 회부 4] `_t1253Now()` 읽는 자리 11곳 중 여섯(`spawnCaravanBody` 셋 · `_caravanSyncOne` 도착 머묾 끝 · `_xzMakeBody` · `marketVillages` 그림)은
//   내보낸 문이 없어 단위 판 밖이었다 — 이 카드가 문을 내보냈다(`__labProbe._caravanBodyProbe` 의 `spawn` · `syncOne` · `xzMakeBody` · 값 무변 ·
//   `marketVillages` 는 이미 모듈 내보내기).
//
// ★증명 꼴 = T1268 그대로 — 판정 사본 0(운영 함수를 그대로 부른다). 한 판을 두 번: A = 벽시계가 곧게 · B = 걸음마다 `Date.now()` 에 엉뚱한 덧셈
//   (1970년 첫 몇 초 ~ 3000년 근처 · 13가지 · 차례 고정)과 econ 날 원점(`state.epoch`)을 같은 만큼 옮긴다. econ 상태(world.day · dayMs · 그날 몫)는 A 와 같다.
//   존 틱 꼴: 하루 끝 → econ 밀림(1.5초) → 마감(1.5초 · 이때 몸 틱은 쉰다 — 운영 `onGameTick` 그대로 · 장마당 그림은 돈다) → 마감 끝 경계 틱(`_t1253Edge`) → 다음 날.
//   판 셋: car(몸 세우기 · 장 마당 몸 · 늦은 장 · 도착 동기 · 다시 뜬 판 복원) · xz(이웃 존 몸 · 경계 칸까지 걷고 민다) · mk(장마당 그림 `marketVillages`).
//
// 지키는 것:
//   ⓪ 글자 — 내보낸 문 셋 · 미끼 자리가 소스에 꼭 한 번 · `_t1253Now()` 읽는 여섯 자리가 그 함수에 있다
//   ① 켬(기본) — 판 셋이 벽시계 흔들림에 바이트 같음 + 전제(몸이 실제로 걸었다 · 머묾이 끝나 귀환 · 늦은 장 몸은 선 자리에서 귀환 · 경계 칸에 닿아 밀었다 · 장마당이 섰다 졌다)
//   ② 끔(`T1253_CLOCK_FIX=0`) — 같은 흔들림에 판 셋이 갈린다(자명 통과 금지)
//   ③ ★남은 벽시계 칸 셋(+ T772 `_t661.t0`)이 결과에 닿나 —
//      글자: 세 칸을 읽는 함수 표(고정 · 새로 읽는 이가 생기면 빨강) · 몸 틱의 읽기는 T1182 몸 줄 뒤(종전 페이싱)뿐 · 경계 기다림 상한(`until`)은 `!body._t1182` 뒤에서만 · 다른 파일(server · sim · public) 0
//      움직임: 켬 판에서 세 칸을 실제로 읽은 함수(접근자 셈) ⊆ {저장 `_t1034Pack` · 세 칸끼리 셈하는 쓰기 · 경계 기다림 상한} ·
//             세 칸(+ `_t661.t0`)에 걸음마다 독(NaN · ±1e300 · 0 · …)을 넣어도 판 셋 결과(몸 자리 · 단계 · 머묾 끝 · 걸음 시계 · 경계 넘김 · 장마당) 바이트 같음 ·
//             저장 바이트(`_t1034Pack` → JSON)가 흔들림에 갈리는 칸 = 세 칸 + `at`(+ `T.t0`) 뿐(정보 — 되살린 뒤 결과는 위 독 판이 잰다)
//   ④ ★미끼 — `server/villages.js` 사본(아이 프로세스 안 · 실을 때 글자 한 자리만 바꿈 · 파일 무변):
//      자리 여섯 각각 `_t1253Now()` → 벽시계(인수 `now` · `Date.now()`) ⇒ 그 판이 흔들림에 갈린다 ·
//      세 칸 읽기 미끼 둘(몸 틱이 T1182 몸 줄을 건너 종전 페이싱으로 · 몸 걸음이 명목 상한 `nomPxMs` 를 읽음) ⇒ 독 판이 갈린다 — 잡은 수 ○/○ 를 끝 줄에 적는다.
//   ⑤ ★[T1282 · T1273 회부 2 · 3 · 4] 켬 갈래에 남은 두 시계 축 섞임 셋 — 고친 뒤 0:
//      mg 판(장마당 마감 틈): 마감을 운영 차례 그대로 연다(경계에서 `lastGameDay` ↑ · `tickJobs` · 닫는 날 적기 `closeOpen` → econ 머리 앞 틈 0.7초 → econ 머리 `world.day` ↑ → 마감 끝 경계 틱) ·
//         그날 진 장이 그림(`marketVillages`)에 다시 든 틱 수 = 0 · 이튿날 새 장은 선다(대조) · 흔들림 A ↔ B 바이트 같음
//      lg 판(`_xzMakeBody` 걸음 날 수): 같은 econ 상태(econ 밀림 · 머리 앞 마감 · 머리 뒤 마감 · 마감 끝 경계 틱)에서 벽시계만 econ 보다 0 ~ 0.97일 앞선 몸 60 —
//         `legDays`(= 길 ÷ `pxPerDay`)가 벽시계 앞섬에 갈린 몸 수 = 0 · 다 econ 날 수(받을 경계 − 닫는 날 끝)와 같다
//      t0 판(`startReturnLeg` T772 `_t661.t0`): 머묾 끝 귀환 몸 26 — 흔들림 A ↔ B 에서 `t0` 가 갈린 몸 수 = 0 · `t0` = 머묾 끝(econ 날 시계 축)
//   ⑥ ★[T1282] 미끼 넷 — 고친 줄 하나씩 종전 글자로 되돌린 사본(마감 중 시계 `D × 하루` · `legDays` 벽시계 `now` · `t0` 벽시계 `now` · 닫는 날 적기 없음) ⇒ 그 판이 빨강.
//      종전 셋을 한꺼번에 되돌린 사본이 "고치기 전" 수다(보고 T1282 첫 줄 ○ → 0 의 ○).
//
// 실행: node scripts/test-t1273-clock-rest.js   (존 안 띄움 · 아이 프로세스 열 · 몇 초)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
// ── 미끼 표 — [이름 · 판(갈려야 할 것) · 바꿀 글자(소스에 꼭 한 번) · 바꾼 글자] ───────────────────
//   판 'car' · 'xz' · 'mk' = 흔들림 A ↔ B 갈림 · 'tf' = 독 판(독 없음 ↔ 독) 갈림
const BAITS = [
  ['S1 몸 세우기 걸음 원점 econ → 인수 now', 'car', '_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? _t1253Now() : now, pinHunger: p.hunger', '_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? now : now, pinHunger: p.hunger'],
  ['S2 장 마당 몸 머묾 끝 econ → 인수 now', 'car', ': (T1253_CLOCK_FIX ? _t1253Now() : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC; if (T1145_XY_COLS) BC.w(p, pts[0].x', ': (T1253_CLOCK_FIX ? now : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC; if (T1145_XY_COLS) BC.w(p, pts[0].x'],
  ['S3 늦은 장 견줌(T775) econ → 인수 now', 'car', 'body.lingerUntil <= (T1253_CLOCK_FIX ? _t1253Now() : now)) { startReturnLeg(body, now);', 'body.lingerUntil <= (T1253_CLOCK_FIX ? now : now)) { startReturnLeg(body, now);'],
  ['S4 도착 동기 머묾 끝 econ → 인수 now', 'car', 'body.lingerUntil = ((T1253_CLOCK_FIX && body._t1182) ? _t1253Now() : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC;', 'body.lingerUntil = ((T1253_CLOCK_FIX && body._t1182) ? now : now) + state.dayMs * CARAVAN_LINGER_DAY_FRAC;'],
  ['S5 이웃 존 몸 걸음 원점 econ → 인수 now', 'xz', '_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? _t1253Now() : now, pinHunger: N.p.hunger', '_t1182: T762_CARAVAN_BODY, _t1182At: T1253_CLOCK_FIX ? now : now, pinHunger: N.p.hunger'],
  ['S6 장마당 그림 econ → Date.now()', 'mk', 'const now = (T1253_CLOCK_FIX && T762_CARAVAN_BODY) ? _t1253Now() : Date.now();', 'const now = (T1253_CLOCK_FIX && T762_CARAVAN_BODY) ? Date.now() : Date.now();'],
  ['F1 몸 틱이 T1182 몸 줄을 건넘(종전 페이싱이 세 칸을 읽는다)', 'tf', 'if (body._t1182) { _t1182Move(body,p,now,dtMs); continue; }', 'if (false) { _t1182Move(body,p,now,dtMs); continue; }'],
  ['F2 몸 걸음이 명목 상한(`nomPxMs`)을 읽음', 'tf', 'const blocked=_t1182Walk(body,p,Math.min(body.len,body.prog+_t1182Step(dtMs)),dtMs);', 'const blocked=_t1182Walk(body,p,Math.min(body.len,body.prog+Math.min(_t1182Step(dtMs),body.nomPxMs*4*dtMs)),dtMs);'],
];
//   세 칸을 읽는 함수 표(글자 · 주석 뺀 소스) — 갈래 = 왜 결과에 안 닿나(③ 글자 · 정보). 새로 읽는 함수가 생기거나 수가 바뀌면 빨강(분류를 다시 한다).
const READERS = {
  _t1034Pack: [3, '저장 — 메타 행 곁 칸(되살린 몸은 `_t1034Apply` 가 세 칸에 되쓰기만)'],
  _t1034Apply: [1, '되살림 T1182 아닌 갈래 상한(`at ≤ 실은 자리` 라 T1182 몸엔 안 걸린다)'],
  spawnCaravanBody: [1, '세 칸끼리(`nomPxMs = len ÷ (arriveAt − now)`)'], startReturnLeg: [2, '세 칸끼리'], isolateCaravanReturn: [1, '세 칸끼리'], _t1136Isolate: [1, '세 칸끼리'],
  _caravanSyncOne: [1, '세 칸끼리(재라우팅)'], _xzMakeBody: [1, '세 칸끼리'], _xzStartReturnLeg: [1, '세 칸끼리'], _xzIsolate: [1, '세 칸끼리'], _xzAfterSend: [3, '세 칸끼리(되돌림)'],
  _xzWalkToBorder: [4, '세 칸끼리(경계 칸까지 명목 빠르기)'], _xzSend: [1, '경계 기다림 상한 `until`(`!body._t1182` 몸만 읽는다)'],
  _t661Vis: [1, '종전 보간(T1182 몸은 안 부른다)'], tickCaravanBodies: [6, '종전 페이싱(T1182 몸 줄 뒤)'],
  xzonePerf: [3, '`/perf` 안 문(관측)'], t1034Peek: [1, '`/perf` 안 문(관측)'],
  _warEnsureBody: [2, '전쟁 몸(캐러밴 아님)'], _warPaceCommander: [2, '전쟁 몸'], _warSetupReturn: [1, '전쟁 몸'], _warPaceReturn: [2, '전쟁 몸'],
};
//   켬 판에서 실제로 읽어도 되는 함수(접근자 셈) — 저장 · 세 칸끼리 · 경계 기다림 상한
const READ_OK = new Set(['_t1034Pack', 'spawnCaravanBody', 'startReturnLeg', '_caravanSyncOne', '_xzMakeBody', '_xzWalkToBorder', '_xzSend', '_xzAfterSend', '_xzStartReturnLeg']);
const F3 = ['departAt', 'arriveAt', 'nomPxMs'];
//   ★[T1282] 미끼 — 고친 줄을 종전 글자로(판 'mg' · 'lg' · 't0' = ⑤ 의 그 판이 빨강 · 0 이 아니게 된다)
const MIX_BAITS = [
  ['K1 마감 중 econ 날 시계 = 그날 머리(종전 `D × 하루`)', 'mg', 'if (state.tickJobs || state._t731 || state._t1253Edge) return (state._t1282D === D ? D + 1 : D) * M;', 'if (state.tickJobs || state._t731 || state._t1253Edge) return D * M;'],
  ['K2 `_xzMakeBody` 걸음 날 수 econ → 벽시계 `now`(종전)', 'lg', 'Math.round((arriveAt - (T1253_CLOCK_FIX ? _t1282Wall() : now)) / state.dayMs)', 'Math.round((arriveAt - (T1253_CLOCK_FIX ? now : now)) / state.dayMs)'],
  ['K3 `startReturnLeg` 귀환 보간 t0 econ → 벽시계 `now`(종전)', 't0', 'const _t0n = (T1253_CLOCK_FIX && body._t1182) ? _t1253Now() : now;', 'const _t0n = (T1253_CLOCK_FIX && body._t1182) ? now : now;'],
  ['K4 닫는 날 적기 없음(`_t1282Open` 무동작)', 'mg', 'function _t1282Open() { state._t1282D = state.world ? (state.world.day | 0) : 0; }', 'function _t1282Open() { }'],
];
const ROLE = process.argv[2];

// ══ 아이: 판 셋(A · B · 독) 돌고 결과 한 줄 ═══════════════════════════════════════════════
if (ROLE === '--child') {
  //   미끼 — 숫자 = `BAITS` 하나 · 'm0,m1,…' = ★[T1282] `MIX_BAITS` 여럿(한꺼번에)
  const spec = process.argv[3] != null && process.argv[3] !== '-' ? String(process.argv[3]) : '';
  const want = process.argv[4] || 'shake';   // 'shake' = A · B 흔들림 · 'tf' = 접근자 셈 + 독 판 · 'tfp' = 독 판만(미끼) · 'mix' = ★[T1282] ⑤ 판 셋
  const swaps = spec ? spec.split(',').map((t) => (t[0] === 'm' ? MIX_BAITS[+t.slice(1)] : BAITS[+t])) : [];
  if (swaps.length) {   // 미끼 — 이 아이가 실을 때만 villages.js 글자 한 자리를 바꾼다(파일은 안 만진다)
    const old = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      if (f !== VFILE) return old(m, f);
      let src = fs.readFileSync(f, 'utf8');
      for (const [, , from, to] of swaps) {
        const n = src.split(from).length - 1;
        if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ err: `미끼 자리 ${n}곳` }) + '\n'); process.exit(3); }
        src = src.replace(from, to);
      }
      m._compile(src, f);
    };
  }
  const mute = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
  //   접근자 셈(tf 판만) — 세 칸을 Object.prototype 의 접근자로 두어 몸에 처음 쓸 때부터 읽고 쓴 함수를 센다(값은 숨은 칸 · 행동 무변)
  const census = { r: {}, w: {} }, HID = new WeakMap();
  const who = () => { const lim = Error.stackTraceLimit; Error.stackTraceLimit = 4; const L = new Error().stack.split('\n'); Error.stackTraceLimit = lim; for (let i = 1; i < L.length; i++) { if (L[i].indexOf(VFILE) < 0) continue; const m = L[i].match(/at (?:Object\.|new )?([\w$]+)(?: \[as [\w$]+\])? \(/); return m ? m[1] : '?'; } return '(밖)'; };
  if (want === 'tf') for (const k of F3) Object.defineProperty(Object.prototype, k, { configurable: true,
    get() { const f = who(); census.r[f] = (census.r[f] || 0) + 1; const o = HID.get(this); return o ? o[k] : undefined; },
    set(v) { const f = who(); census.w[f] = (census.w[f] || 0) + 1; let o = HID.get(this); if (!o) HID.set(this, o = Object.create(null)); o[k] = v; } });
  const V = require(VFILE), E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const P = V.__labProbe._caravanBodyProbe, H = V.__p3Bind({}), S = H.state;
  const realNow = Date.now;
  let CLK = 0; Date.now = () => CLK;
  const sha = (x) => require('crypto').createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  const R9 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toPrecision(15) : v);
  //   판 시계 — 하루 4분(M) · 벽시계 좌표 `wall` 0 = 하루 끝 60초 전(DAY_END = 60초) · 판은 그날 30초째(wall −150초)에서 시작
  const E0 = 1.6e12, M = 240000, G0 = 4800, D0 = 100, LEFT = 60000, BASE = E0 + G0 * M + (M - LEFT), DAY_END = LEFT, W0 = -150000;
  const OFF = [3.1e11, -7.7e11, 9.9e12, -1.2e9, 4.4e13, 2.5e10, -1.6e12, 7e12, 1.3e9, -9e11, 5e6 - BASE, 3.6e6 - BASE, -BASE + 1];
  const gaps = [33, 34, 33, 50, 17, 80, 33, 21, 66, 33];
  const POISON = [NaN, -1e300, 1e300, 0, -7.5e12, 3.3e15, 1e-300, -1];
  function world(mode, poison, pend) {   // ★[T1282] pend = 마감을 운영 차례로 연다(경계 → 닫는 날 적기 → econ 머리 앞 틈 0.7초 → econ 머리) · 없으면 종전 꼴(경계에서 날을 올린 뒤 마감)
    const w = mute(() => E2.createWorldV2({ seed: 7, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0 }));
    const [a, b] = w.villages; w.day = D0; w.caravans = [];
    const vA = { dbId: 1, name: '가', ccx: 10, ccy: 10, npcPids: [], econ: a }, vB = { dbId: 2, name: '나', ccx: 40, ccy: 22, npcPids: [], econ: b };
    const coarse = [{ x: 336, y: 336 }, { x: 2400, y: 336 }, { x: 2400, y: 1500 }, { x: 4200, y: 1500 }, { x: 1296, y: 720 }];
    let nid = 0;
    const players = new Map(), npcs = new Map();
    Object.assign(S, { world: w, ready: false, dayMs: M, lastGameDay: G0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, roads: null, xzone: null, villages: [vA, vB],
      byEcon: new Map([[a, vA], [b, vB]]), routeCache: new Map([['1_2', coarse]]), walkCache: new Map([['1_2', { coarse, pts: coarse }]]), _t1034Saved: null, _t775: null,
      deps: { players, npcs, moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; }, broadcast: () => {},
        spawnNpc: (o) => { const p = { pid: 'n' + (++nid), x: o.x, y: o.y, hp: 100, hunger: 100, thirst: 100, name: o.name }; players.set(p.pid, p); npcs.set(p.pid, p); return p; },
        xzonePost: () => new Promise(() => {}) },
      caravanBodies: new Map(), _carTickAt: undefined });
    let k = 0, wall = W0, phase = 'day';
    const setClock = () => { const o = mode === 'B' ? OFF[(k * 5 + 3) % OFF.length] : 0; CLK = BASE + wall + o; S.epoch = E0 + o; };
    setClock();
    const body = (id) => S.caravanBodies.get(id);
    const ent = (pid) => { const q = players.get(pid); return q ? [R9(q.x), R9(q.y)] : null; };
    const snapBodies = (tag, out) => {
      for (const [id, bd] of [...S.caravanBodies].sort((x, y) => String(x[0]).localeCompare(String(y[0])))) {
        out.push([tag, k, id, bd.phase, R9(bd.prog), R9(bd.len), ent(bd.pid), (bd.escorts || []).map((e) => ent(e.pid)), R9(bd.lingerUntil), R9(bd._t1182At), bd._t1253N | 0,
          bd._xzWalked || null, !!bd._xzSendWait, !!bd._xzHanding]);
      }
    };
    const doPoison = () => {
      if (!poison) return;
      let j = k;
      for (const bd of S.caravanBodies.values()) { for (const f of F3) bd[f] = POISON[(j++) % POISON.length]; if (bd._t661 && bd._t661.t0 != null) bd._t661.t0 = POISON[(j++) % POISON.length]; }
    };
    //   한 걸음 — 벽시계를 민다 · 하루 끝 뒤 econ 밀림 · 마감(몸 틱 쉼 · 경계에서 날 넘김) · 마감 끝 경계 틱 · 그 밖엔 몸 틱(존 틱 머리의 `now`)
    const step = (bodies) => {
      wall += gaps[k % gaps.length]; k++; setClock();
      if (pend && phase === 'day' && wall >= DAY_END + 1500) { phase = 'pend'; S.lastGameDay++; S.tickJobs = [{}]; P.closeOpen(); }   // ★[T1282] `onGameTick` → `_openDayJobs` 머리(닫는 날 적기) — world.day 는 아직 닫는 날
      else if (pend && phase === 'pend' && wall >= DAY_END + 2200) { phase = 'close'; w.day++; }   // econ 머리(`world.day += 1`)
      else if (phase === 'day' && wall >= DAY_END + 1500) { phase = 'close'; w.day++; S.lastGameDay++; S.tickJobs = [{}]; }
      else if (phase === 'close' && wall >= DAY_END + 3000) { phase = 'next'; S.tickJobs = null; if (bodies) { S._t1253Edge = true; try { mute(() => P.tick(Date.now())); } finally { S._t1253Edge = false; } } return 'edge'; }
      if (bodies && !S.tickJobs) mute(() => P.tick(Date.now()));
      doPoison();
      return phase;
    };
    return { w, a, b, vA, vB, S, step, snapBodies, body, get k() { return k; }, get wall() { return wall; }, get phase() { return phase; } };
  }
  const packJson = () => { const pk = mute(() => P.pack()); return pk ? JSON.stringify(pk) : null; };
  const restoreAll = (G) => {   // 다시 뜬 판 — 메타 행 JSON(저장 바이트 그대로)에서 몸마다 되돌린다(`_t1034Apply`)
    const js = packJson(), b = JSON.parse(js).b;
    G.S._t1034Saved = new Map(Object.entries(b));
    for (const [id, bd] of G.S.caravanBodies) if (G.S._t1034Saved.has(String(id))) mute(() => P.restore(bd, Date.now()));
    return js;
  };
  const car = (id, from, to, st, x) => Object.assign({ id, from, to, trader: from.npcs[0], state: st, departDay: D0, arriveDay: D0 + (st === 'inbound' ? 0 : 2), returnArriveDay: D0 + 3, escort: 1, giveRes: 'wood', giveAmt: 5 }, x || {});

  // ── car 판: 몸 세우기(S1 · S2 · S3) · 도착 동기(S4) · 다시 뜬 판 복원 ─────────────────────
  function carRun(mode, poison) {
    const G = world(mode, poison), { a, b } = G, tr = [], ev = {};
    const spawn = (c) => { G.w.caravans.push(c); const r = mute(() => P.spawn(c, Date.now(), 16)); tr.push(['spawn', G.k, c.id, r]); G.snapBodies('s', tr); return r; };
    spawn(car(11, a, b, 'outbound'));                                   // S1 가는 길 몸(걸음 원점)
    spawn(car(40, a, b, 'outbound'));                                   // S4 도착 동기 몸(먼저 걸어 종점에 선다)
    G.step(true); G.step(true);
    spawn(car(12, b, a, 'inbound', { _mktD: D0 }));                     // S2 장 마당 몸 — 가 마을엔 장 기록이 없다(머묾 끝 = 지금 + 1게임시간)
    G.step(true);
    const c13 = car(13, a, b, 'inbound', { _mktD: D0 }); const rec = mute(() => P.openMarket(c13)); ev.mktEnd = rec && R9(rec.end); ev.mktOpenWall = G.wall;
    spawn(c13);                                                          // S3 장 끝 전에 선 장 마당 몸(머묾 = 장 끝)
    for (let j = 0; j < 4; j++) { G.step(true); const c = car(14 + j, a, b, 'inbound', { _mktD: D0 }); mute(() => P.openMarket(c)); spawn(c); }
    const early = [11, 12, 13].map((id) => G.body(id) && G.body(id).phase);
    let late = 0, syncAt = null, synced = false, restored = null, s12Back = false, s4Back = false, s4LingerEndPhase = null;
    while (G.phase !== 'next' || G.wall < DAY_END + 60000) {
      const ph = G.step(true);
      //   S3 늦은 장 — 장 끝(econ 날 시계)이 지난 뒤 선 장 마당 몸 13대(걸음 열세 칸 = 흔들림 13가지 다)
      if (late < 13 && ph === 'day' && G.wall > ev.mktOpenWall + 45000) { const c = car(20 + late, a, b, 'inbound', { _mktD: D0 }); mute(() => P.openMarket(c)); spawn(c); late++; }
      //   S4 — 하루 끝 5초 전에 econ 도착(장부가 inbound) · 동기가 머묾을 연다 · 머묾이 하루 경계를 넘는다
      if (!synced && ph === 'day' && G.wall >= DAY_END - 5000) { const c = G.body(40).c; c.state = 'inbound'; const S0 = { seen: new Set(), spawned: 0, arrived: 0, removed: 0 }; mute(() => P.syncOne(Date.now(), c, S0, 16)); synced = true; syncAt = [G.k, G.body(40).phase]; tr.push(['sync', G.k, S0.arrived]); }
      if (synced && s4LingerEndPhase == null && G.body(40).phase === 'inbound') s4LingerEndPhase = G.phase;
      if (G.body(12).phase === 'inbound') s12Back = true;
      if (G.body(40).phase === 'inbound' && G.body(40).prog > 500) s4Back = true;
      if (restored == null && G.phase === 'next' && G.wall >= DAY_END + 20000) { restored = restoreAll(G); G.snapBodies('restore', tr); }
      G.snapBodies(ph, tr);
    }
    const lateBack = [...Array(13)].filter((_, i) => { const bd = G.body(20 + i); return bd && bd.phase === 'inbound'; }).length;
    const earlyLinger = [13, 14, 15, 16, 17].filter((id) => G.body(id).lingerUntil === ev.mktEnd).length;
    return { h: sha(tr), n: tr.length, trace: tr, early, lateBack, earlyLinger, syncAt, s12Back, s4Back, s4LingerEndPhase, s1prog: R9(G.body(11).prog), s1len: R9(G.body(11).len), mktEnd: ev.mktEnd,
      pack: restored, bodies: G.S.caravanBodies.size };
  }
  // ── xz 판: 이웃 존 몸(S5) · 경계 칸까지 걷고 민다(세 칸을 읽는 `_xzWalkToBorder`) ───────────
  function xzRun(mode, poison) {
    const G = world(mode, poison), { a, b } = G, tr = [];
    const X = G.S.xzone = { st: { walkWait: 0, walkWaitLate: 0, sent: 0, sentOk: 0, crossArrive: 0, bodyOut: 0 }, track: new Map(), trace: [], retry: [], core: { splitNames: () => null } };
    const inPts = [{ x: 40, y: 700 }, { x: 900, y: 700 }, { x: 1296, y: 720 }];
    const px = { id: 'xz:nip:31', _xzPending: true, _push: 0, giveRes: 'wood', giveAmt: 3, escort: 1, state: 'outbound', from: { name: '저쪽', zone: 'nip', _xz: true }, to: b };
    mute(() => P.xzMakeBody('xz:nip:31', px, inPts.slice(), 'outbound', Date.now(), G.S.epoch + (G0 + 2) * M, b, { tribeId: 'xz_nip', tribeName: '저쪽' }));
    G.snapBodies('s', tr);
    for (let j = 0; j < 3; j++) G.step(true);
    const c32 = car(32, a, b, 'inbound', { _xzHome: { zone: 'nip' }, _xzBack: { ptLocal: { x: 50, y: 50 } } });
    mute(() => P.xzMakeBody('xz:nip:32', c32, [{ x: 1296, y: 720 }, { x: 1800, y: 900 }], 'inbound', Date.now(), G.S.epoch + (G0 + 3) * M, b, { tribeId: 'simvil_2', tribeName: '나', simVid: 2 }));
    G.snapBodies('s', tr);
    let sentAt = null, sends = [];
    while (G.phase !== 'next' || G.wall < DAY_END + 30000) {
      const ph = G.step(true);
      const b32 = G.body('xz:nip:32');
      //   경계 기록('return')이 나간다 — 몸이 경계 칸에 없으니 그 칸까지 걷게 하고 닿은 틱에 민다(T578 추신)
      if (sentAt == null && b32 && b32.prog >= b32.len - 0.5 && G.wall > -120000) { sentAt = G.k; mute(() => P.sendXz({ id: 32, kind: 'return', toZone: 'nip' }, G.S.lastGameDay, 0)); tr.push(['send', G.k, X.st.walkWait, X.st.sent]); }
      if (sends.length === 0 && X.st.sent > 0) sends.push(G.k);
      G.snapBodies(ph, tr); tr.push(['x', G.k, X.st.sent, X.st.walkWait]);
    }
    const b31 = G.body('xz:nip:31'), b32 = G.body('xz:nip:32');
    return { h: sha(tr), n: tr.length, trace: tr, sentAt, sentK: sends[0] == null ? null : sends[0], sent: X.st.sent, walked: b32 && b32._xzWalked, b31prog: R9(b31.prog), b31len: R9(b31.len), pack: packJson() };
  }
  // ── mk 판: 장마당 그림(S6 · `marketVillages` — 존이 틱마다 부르는 `_mktBroadcast` 의 그 줄) ───
  function mkRun(mode) {
    const G = world(mode, false), { a, b } = G, tr = [];
    G.S.ready = true;
    let seenA = 0, seenB = 0, seenClose = 0, flips = 0, last = '', opened = 0;
    const open = (c) => { mute(() => P.openMarket(c)); opened++; };
    while (G.phase !== 'next' || G.wall < DAY_END + 70000) {
      const ph = G.step(false);
      if (opened === 0 && G.k >= 3) open(car(51, a, b, 'inbound'));                          // 나 마을 장(그날 이른 때)
      if (opened === 1 && ph === 'day' && G.wall >= 30000) open(car(52, b, a, 'inbound'));     // 가 마을 장 — 하루 끝을 넘겨 선다(밀림 · 마감 동안 그대로)
      if (opened === 2 && ph === 'next' && G.wall >= DAY_END + 30000) open(car(53, a, b, 'inbound'));   // 이튿날 나 마을 새 장
      const m = V.marketVillages().join(',');
      if (m !== last) flips++; last = m;
      if (m.indexOf('10,10') >= 0) { seenA++; if (ph === 'close') seenClose++; }
      if (m.indexOf('40,22') >= 0) seenB++;
      tr.push([G.k, ph, m]);
    }
    return { h: sha(tr), n: tr.length, trace: tr, seenA, seenB, seenClose, flips, opened };
  }
  // ── ★[T1282] ⑤ 판 셋 ─────────────────────────────────────────────────────────────────
  //   mg 판 — 장마당 그림 마감 틈: 그날 진 장이 마감(econ 머리 앞) 틱에 다시 그려지나
  function mgRun(mode) {
    const G = world(mode, false, true), { a, b } = G, tr = [];
    G.S.ready = true;
    const shown = new Map(), gone = new Map();
    let redraw = 0, pendTicks = 0, opened = 0, seenNew = 0, closedBefore = 0;
    const open = (c) => { mute(() => P.openMarket(c)); opened++; };
    while (G.phase !== 'next' || G.wall < DAY_END + 70000) {
      const ph = G.step(false);
      if (opened === 0 && G.k >= 3) open(car(61, a, b, 'inbound'));                              // 나 마을 장 — 그날 이른 때 · 그날 안에 진다
      if (opened === 1 && ph === 'day' && G.wall >= -20000) open(car(62, b, a, 'inbound'));         // 가 마을 장 — 하루 끝 40초 전 · 하루 끝 20초 전에 진다
      if (opened === 2 && ph === 'next' && G.wall >= DAY_END + 5000) open(car(63, a, b, 'inbound'));   // 이튿날 나 마을 새 장(대조 — 선다)
      if (ph === 'pend') pendTicks++;
      const m = mute(() => V.marketVillages()), set = new Set();
      for (let i = 0; i + 1 < m.length; i += 2) set.add(m[i] + ',' + m[i + 1]);
      for (const vil of G.S.villages) {
        const key = vil.ccx + ',' + vil.ccy, rec = vil._mkt;
        if (set.has(key)) { if (gone.get(key) === rec) redraw++; shown.set(key, rec); if (ph === 'next' && rec && rec.d === D0 + 1) seenNew++; }
        else if (shown.get(key) === rec && rec) { if (gone.get(key) !== rec && ph === 'day') closedBefore++; gone.set(key, rec); }
      }
      tr.push([G.k, ph, m.join(',')]);
    }
    return { h: sha(tr), n: tr.length, trace: tr, redraw, pendTicks, opened, seenNew, closedBefore };
  }
  //   lg 판 — `_xzMakeBody` 걸음 날 수: econ 상태는 같고 벽시계만 앞선 몸들
  function lgRun() {
    const G = world('A', false, true), S = G.S, { b } = G, rows = [];
    const end = E0 + (G0 + 1) * M;   // econ 날 D0 의 끝(벽시계 경계 축 · 게임일 G0 + 1 머리)
    const px = (id) => ({ id, _xzPending: true, _push: 0, giveRes: 'wood', giveAmt: 3, escort: 0, state: 'outbound', from: { name: '저쪽', zone: 'nip', _xz: true }, to: b });
    const LEAD = [0, 0.3, 0.55, 0.8, 0.97].map((f) => Math.round(f * M));
    let n = 0;
    for (const ph of ['delay', 'pend', 'head', 'edge']) for (const lead of LEAD) for (const j of [1, 2, 3]) {
      S.world.day = D0; S.lastGameDay = G0; S.tickJobs = null; S._t1253Edge = false; S._t731 = null; S._t1282D = undefined; S.epoch = E0;
      if (ph !== 'delay') { S.lastGameDay = G0 + 1; S.tickJobs = [{}]; P.closeOpen(); }              // 마감을 연다(경계 · 닫는 날 적기)
      if (ph === 'head' || ph === 'edge') S.world.day = D0 + 1;                                        // econ 머리 뒤
      if (ph === 'edge') { S.tickJobs = null; S._t1253Edge = true; }                                   // 마감 끝 경계 틱
      CLK = end + lead;                                                                                 // 벽시계 = econ 날 끝 + 앞섬(econ 은 그 자리에 선다)
      const key = 'xz:nip:' + (++n), arr = end + j * M;                                                 // 받은 몸 꼴(`_xzBodyIn` — epoch + (보낸 경계 + 남은 날) × 하루)
      const bd = mute(() => P.xzMakeBody(key, px(key), [{ x: 40, y: 700 }, { x: 900, y: 700 }, { x: 1296, y: 720 }], 'outbound', Date.now(), arr, b, { tribeId: 'xz_nip', tribeName: '저쪽' }));
      rows.push([ph, lead, j, Math.round(bd.len / bd.pxPerDay), R9(mute(() => P.econNow()))]);
      S.caravanBodies.delete(key);
    }
    S._t1253Edge = false; S.tickJobs = null;
    const split = rows.filter((r) => r[3] !== r[2]).length, bad = rows.filter((r) => r[4] !== (D0 + 1) * M).length;
    return { rows, n: rows.length, split, econAtEnd: rows.length - bad };
  }
  //   t0 판 — `startReturnLeg` 귀환 보간 시작(T772 `_t661.t0`): 머묾 끝 귀환 몸이 흔들림에 갈리나
  function t0Run(mode) {
    const G = world(mode, false), { a, b } = G, t0 = {};
    let made = 0;
    while (G.phase !== 'next' || G.wall < DAY_END + 30000) {
      const ph = G.step(true);
      //   장 기록 없는 장 마당 몸(S2 꼴 — 머묾 끝 = 지금 + 1게임시간) 스물여섯 — 걸음마다 한 대(흔들림 13가지를 두 바퀴) · 마지막 몇은 머묾이 하루 끝 · 마감을 넘는다
      if (made < 26 && ph === 'day' && G.wall >= -100000 + made * 6000) { const c = car(70 + made, b, a, 'inbound', { _mktD: D0 }); G.w.caravans.push(c); mute(() => P.spawn(c, Date.now(), 16)); made++; }
      for (const [id, bd] of G.S.caravanBodies) if (bd._t661 && bd._t661.t0 != null && !(id in t0)) t0[id] = [R9(bd._t661.t0), R9(bd.lingerUntil), ph];
    }
    return { t0, made, n: Object.keys(t0).length, eqLinger: Object.values(t0).filter((r) => r[0] === r[1]).length };
  }
  let out;
  try {
    const firstDiff = (x, y) => { for (let i = 0; i < Math.max(x.length, y.length); i++) if (JSON.stringify(x[i]) !== JSON.stringify(y[i])) return [i, x[i], y[i]]; return null; };
    const pick = (r) => { const o = Object.assign({}, r); delete o.trace; delete o.pack; return o; };
    const cmp = (A, B) => ({ A: pick(A), B: pick(B), same: A.h === B.h, diff: firstDiff(A.trace, B.trace) });
    //   저장 바이트 견줌 — 갈린 칸의 길(몸 id 는 '*')
    const keyDiff = (x, y, pre, acc) => {
      if (JSON.stringify(x) === JSON.stringify(y)) return acc;
      if (x && y && typeof x === 'object' && typeof y === 'object') { const arr = Array.isArray(x); for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) keyDiff(x[k], y[k], arr ? pre : pre.concat([k]), acc); return acc; }
      acc.add(pre.join('.')); return acc;
    };
    const saveDiff = (A, B) => { if (!A.pack || !B.pack) return null; const a = JSON.parse(A.pack).b, b = JSON.parse(B.pack).b, acc = new Set(); for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) keyDiff(a[id], b[id], ['*'], acc); return [...acc].sort(); };
    if (want === 'mix') {   // ★[T1282]
      const gA = mgRun('A'), gB = mgRun('B'), L = lgRun(), tA = t0Run('A'), tB = t0Run('B');
      const ids = [...new Set([...Object.keys(tA.t0), ...Object.keys(tB.t0)])].sort();
      const t0split = ids.filter((id) => JSON.stringify((tA.t0[id] || [])[0]) !== JSON.stringify((tB.t0[id] || [])[0]));
      out = { knob: process.env.T1253_CLOCK_FIX !== '0', mg: cmp(gA, gB), lg: L, t0: { A: tA, B: tB, ids: ids.length, split: t0split.length, ex: t0split.slice(0, 3).map((id) => [id, tA.t0[id], tB.t0[id]]) } };
    } else if (want === 'tf' || want === 'tfp') {
      const c0 = carRun('A', false), x0 = xzRun('A', false), r0 = JSON.parse(JSON.stringify(census));
      const c1 = carRun('A', true), x1 = xzRun('A', true);
      out = { knob: process.env.T1253_CLOCK_FIX !== '0', census: r0, censusPoison: census, car: cmp(c0, c1), xz: cmp(x0, x1) };
    } else {
      const cA = carRun('A', false), cB = carRun('B', false), xA = xzRun('A', false), xB = xzRun('B', false), mA = mkRun('A'), mB = mkRun('B');
      out = { knob: process.env.T1253_CLOCK_FIX !== '0', car: cmp(cA, cB), xz: cmp(xA, xB), mk: cmp(mA, mB), save: { car: saveDiff(cA, cB), xz: saveDiff(xA, xB) },
        clk: [BASE + W0 + Math.min(...OFF), BASE + Math.max(...OFF)] };
    }
  } catch (e) { out = { err: String(e && e.stack || e).slice(0, 900) }; }
  Date.now = realNow;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ══ 부모 ══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const child = (bait, env, want) => {
  const E = Object.assign({}, process.env); delete E.T1253_CLOCK_FIX; Object.assign(E, env || {});
  const r = spawnSync(process.execPath, [__filename, '--child', bait == null || bait === '' ? '-' : String(bait), want || 'shake'], { encoding: 'utf8', env: E, timeout: 180000, maxBuffer: 1 << 27 });
  const line = ((r.stdout || '') + '').split('\n').find((l) => l.startsWith('@@'));
  return line ? JSON.parse(line.slice(2)) : { err: ((r.stderr || '') + (r.stdout || '')).slice(-900) };
};
const dtxt = (d) => (d ? `첫 갈림 #${d[0]} ${JSON.stringify(d[1]).slice(0, 110)} ↔ ${JSON.stringify(d[2]).slice(0, 110)}` : '');
const GN = { car: '몸 세우기 · 장 마당 몸 · 늦은 장 · 도착 동기 · 복원', xz: '이웃 존 몸 · 경계 칸까지 걷고 밂', mk: '장마당 그림' };
console.log('\n=== T1273 남은 벽시계 칸 셋 · 단위 판 밖 `_t1253Now()` 자리 여섯 — 켬 갈래 ===');

console.log('\n⓪ 글자');
const codeOnly = require('./code-only.js');
const VSRC = fs.readFileSync(VFILE, 'utf8'), VC = codeOnly(VSRC);
const fnOf = (i) => { const j = VC.lastIndexOf('\nfunction ', i); return j < 0 ? '?' : VC.slice(j + 10, VC.indexOf('(', j + 10)); };
{
  ok(/_caravanBodyProbe: \{[^\n]*\n\s*spawn: spawnCaravanBody, syncOne: _caravanSyncOne, xzMakeBody: _xzMakeBody \}/.test(VC) && /^\s*marketVillages,\s*$/m.test(VC), '⓪ 문 넷 — `_caravanBodyProbe` 의 `spawn` · `syncOne` · `xzMakeBody`(T1273 내보내기) · `marketVillages`(모듈 내보내기)');
  const once = BAITS.map(([, , from]) => VSRC.split(from).length - 1);
  ok(once.every((x) => x === 1), `⓪ 미끼 ${BAITS.length}자리가 제품 소스에 꼭 한 번씩(미끼가 실제 줄을 바꾼다)`, once.join(' · '));
  const fns = [...VC.matchAll(/(?<!function )_t1253Now\(\)/g)].map((m) => fnOf(m.index)), cnt = {};
  for (const f of fns) cnt[f] = (cnt[f] || 0) + 1;
  //   ★[T1282] 11 → 13곳 — 고침 둘이 읽는 자리를 더했다(`startReturnLeg` 귀환 보간 t0 · `_t1282Wall` = `_xzMakeBody` 걸음 날 수의 econ 날 시계 · 보고 T1282 자리 표)
  ok(fns.length === 13 && cnt.spawnCaravanBody === 3 && cnt._caravanSyncOne === 1 && cnt._xzMakeBody === 1 && cnt.marketVillages === 1 && cnt.startReturnLeg === 1 && cnt._t1282Wall === 1,
    '⓪ [전제] `_t1253Now()` 읽는 자리 13곳 중 이 판의 여섯(몸 세우기 셋 · 도착 동기 · 이웃 존 몸 · 장마당 그림) + T1282 둘(귀환 t0 · 걸음 날 수) — 나머지 다섯은 T1268 판', `${fns.length}곳 · 몸 세우기 ${cnt.spawnCaravanBody} · 동기 ${cnt._caravanSyncOne} · 이웃 ${cnt._xzMakeBody} · 장마당 ${cnt.marketVillages} · 귀환 ${cnt.startReturnLeg} · 날 수 ${cnt._t1282Wall}`);
  const site = BAITS.slice(0, 6).map(([, , from]) => fnOf(VC.indexOf(from)));
  ok(site.join() === 'spawnCaravanBody,spawnCaravanBody,spawnCaravanBody,_caravanSyncOne,_xzMakeBody,marketVillages', '⓪ 미끼 여섯이 그 여섯 자리(함수)를 바꾼다', site.join(' · '));
  //   ★[T1282] 닫는 날 적기 — 운영 마감 문(`_openDayJobs` 머리 · 하루 마감 또는 창 머리)에서만 · 켬 뒤 · 하네스 mg 판은 같은 함수를 부른다
  const oj = VC.indexOf('\nfunction _openDayJobs('), ojl = VC.slice(VC.indexOf('{', oj) + 1).split('\n')[1] || '';
  const opens = [...VC.matchAll(/(?<!function )_t1282Open\(\)/g)].map((m) => fnOf(m.index));
  ok(/^\s*if \(T1253_CLOCK_FIX && \(!T \|\| T\.head\)\) _t1282Open\(\);/.test(ojl) && opens.join() === '_openDayJobs' && (VC.match(/state\._t1282D = /g) || []).length === 1,
    '⓪ ★[T1282] 닫는 날 적기 — `_openDayJobs` 첫 줄 · 켬 뒤 · 하루 마감 또는 창 머리에서만(창 가운데 · 꼬리 조각은 안 적는다) · 적는 자리 하나', `부르는 곳 ${opens.join(' · ')}`);
  const monce = MIX_BAITS.map(([, , from]) => VSRC.split(from).length - 1), msite = MIX_BAITS.map(([, , from]) => fnOf(VC.indexOf(from)));
  ok(monce.every((x) => x === 1) && msite.join() === '_t1253Now,_xzMakeBody,startReturnLeg,_t1282Open', `⓪ ★[T1282] 미끼 ${MIX_BAITS.length}자리가 제품 소스에 꼭 한 번씩 · 그 함수를 바꾼다`, `${monce.join(' · ')} · ${msite.join(' · ')}`);
}

const on = child(null, {}), off = child(null, { T1253_CLOCK_FIX: '0' });
console.log('\n① 켬(기본) — 벽시계 흔들림에 바이트 같음');
if (on.err) ok(false, '① 켬 판이 돌았다', on.err);
else {
  ok(on.knob, '① [전제] 아이 판 손잡이 = 켬(env 없음 = 운영 기본)');
  ok(on.clk[0] < 1e8 && on.clk[1] > 1e13, '① [전제] B 판 벽시계가 엉뚱하다(1970년 1월 1일 앞뒤 몇 분 ~ 3000년 근처)', `${on.clk[0]} ~ ${on.clk[1]}`);
  for (const g of ['car', 'xz', 'mk']) ok(on[g].same, `★① ${g} 판(${GN[g]}) — 흔들림에 바이트 같음`, on[g].same ? `${on[g].A.n}줄 · ${on[g].A.h}` : dtxt(on[g].diff));
  const c = on.car.A;
  ok(c.s1prog > 1000 && c.early[0] === 'outbound' && c.early[1] === 'linger' && c.early[2] === 'linger' && c.earlyLinger === 5 && c.s12Back,
    '① [전제] S1 가는 몸이 걸었다 · S2 장 마당 몸(장 기록 없음)이 머물다 귀환 · S3 장 끝 전에 선 몸 다섯은 머묾 = 장 끝', `S1 ${c.s1prog}/${c.s1len}px · 처음 단계 ${c.early.join('·')} · 장 끝 머묾 ${c.earlyLinger}/5 · S2 귀환 ${c.s12Back}`);
  ok(c.lateBack === 13, '① [전제] S3 늦은 장 — 장 끝이 지난 뒤 선 장 마당 몸 13대(흔들림 13가지)는 선 자리에서 바로 귀환(T775 견줌 참)', `${c.lateBack}/13`);
  ok(c.syncAt && c.syncAt[1] === 'linger' && c.s4LingerEndPhase === 'next' && c.s4Back, '① [전제] S4 — 하루 끝 5초 전 econ 도착 동기가 머묾을 열고 · 머묾이 밀림 · 마감을 지나 이튿날 econ 시계로 끝나 · 귀환해 걸었다',
    `동기 #${c.syncAt && c.syncAt[0]} · 머묾 끝 갈래 ${c.s4LingerEndPhase} · 귀환 걸음 ${c.s4Back}`);
  const x = on.xz.A;
  ok(x.b31prog > 500 && x.sentAt != null && x.sentK != null && x.sentK > x.sentAt && x.walked === 'walked' && x.sent === 1, '① [전제] S5 이웃 존 몸이 걸었다 · 경계 기록이 나간 뒤 몸이 경계 칸까지 걸어 닿은 틱에 밀었다(한 번)',
    `몸 ${x.b31prog}/${x.b31len}px · 기록 #${x.sentAt} → 밂 #${x.sentK} · ${x.walked}`);
  const m = on.mk.A;
  ok(m.opened === 3 && m.seenA > 0 && m.seenB > 0 && m.seenClose > 0 && m.flips >= 4, '① [전제] S6 장마당이 섰다 졌다 — 두 마을 · 하루 끝을 넘긴 장은 밀림 · 마감 동안에도 그려진다',
    `장 ${m.opened} · 가 ${m.seenA}틱 · 나 ${m.seenB}틱 · 마감 중 ${m.seenClose}틱 · 바뀜 ${m.flips}`);
}
console.log('\n② 끔(`T1253_CLOCK_FIX=0`) — 같은 흔들림에 갈린다(자명 통과 금지)');
if (off.err) ok(false, '② 끔 판이 돌았다', off.err);
else {
  ok(!off.knob, '② [전제] 아이 판 손잡이 = 끔');
  for (const g of ['car', 'xz', 'mk']) ok(!off[g].same, `★② ${g} 판 — 끔이면 벽시계 흔들림이 결과를 바꾼다`, dtxt(off[g].diff));
}

console.log('\n③ ★남은 벽시계 칸 셋(`departAt` · `arriveAt` · `nomPxMs`)이 결과에 닿나');
{
  //   글자 — 세 칸을 읽는 함수 표(쓰기 `=` · `+=` 는 뺌)
  const got = {};
  for (const m of VC.matchAll(/\b\w+\.(departAt|arriveAt|nomPxMs)\b(?!\s*(?:=(?!=)|\+=))/g)) { const f = fnOf(m.index); got[f] = (got[f] || 0) + 1; }
  const want = Object.fromEntries(Object.entries(READERS).map(([f, [n]]) => [f, n]));
  const same = JSON.stringify(Object.keys(got).sort().map((f) => [f, got[f]])) === JSON.stringify(Object.keys(want).sort().map((f) => [f, want[f]]));
  ok(same, '③ 글자 — 세 칸을 읽는 함수 표가 고정 표와 같다(새로 읽는 이 · 수가 바뀌면 분류를 다시 한다)', same ? `${Object.keys(got).length}함수 · ${Object.values(got).reduce((s, x) => s + x, 0)}자리` : JSON.stringify(got).slice(0, 400));
  const t0 = VC.indexOf('\nfunction tickCaravanBodies('), t1 = VC.indexOf('\nfunction ', t0 + 10), gate = VC.indexOf(BAITS[6][2], t0);
  const tReads = [...VC.slice(t0, t1).matchAll(/\bbody\.(departAt|arriveAt|nomPxMs)\b(?!\s*(?:=(?!=)|\+=))/g)].map((m) => t0 + m.index);
  ok(gate > t0 && gate < t1 && tReads.length === 6 && tReads.every((i) => i > gate), '③ 글자 — 몸 틱(`tickCaravanBodies`)의 세 칸 읽기 여섯은 다 T1182 몸 줄(`if (body._t1182) { _t1182Move … continue; }`) 뒤 = 종전 페이싱 몸만', `${tReads.length}자리`);
  const until = [...VC.matchAll(/_xzSendWait\.until/g)];
  ok(until.length === 1 && /!body\._t1182 && now > body\._xzSendWait\.until/.test(VC), '③ 글자 — 경계 기다림 상한(`until` = `arriveAt` + 하루)을 읽는 곳은 하나 · `!body._t1182` 뒤(T1182 몸은 닿아야 민다)', `${until.length}곳`);
  const others = [];
  const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) { if (n.name !== 'node_modules' && n.name !== 'vendor') walk(p); } else if (/\.(js|mjs|html)$/.test(n.name) && p !== VFILE && /\b(departAt|nomPxMs|arriveAt)\b/.test(fs.readFileSync(p, 'utf8'))) others.push(path.relative(ROOT, p)); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  ok(others.length === 0, '③ 글자 — 세 칸 이름이 다른 파일(server · sim · public — econ 곳간 · 클라 그림)에 0', others.join(' · '));
  //   움직임 — 접근자 셈 · 독
  const tf = child(null, {}, 'tf');
  if (tf.err) ok(false, '③ 독 판이 돌았다', tf.err);
  else {
    const R = tf.census.r, Wr = tf.census.w, bad = Object.keys(R).filter((f) => !READ_OK.has(f));
    console.log(`    [표] 켬 판에서 세 칸을 읽은 함수 — ${Object.entries(R).map(([f, n]) => `${f} ${n}`).join(' · ')} · 쓴 함수 — ${Object.entries(Wr).map(([f, n]) => `${f} ${n}`).join(' · ')}`);
    ok((Wr.spawnCaravanBody | 0) > 0 && (Wr.startReturnLeg | 0) > 0 && (Wr._xzMakeBody | 0) > 0 && (Wr._xzWalkToBorder | 0) > 0 && (Wr._t1034Apply | 0) > 0 && (R._t1034Pack | 0) > 0 && (R._xzWalkToBorder | 0) > 0,
      '③ [전제] 접근자가 실제로 셌다 — 세 칸을 쓴 함수(몸 세우기 · 귀환 출발 · 이웃 존 몸 · 경계 걷기 · 되살림) · 읽은 함수(저장 · 경계 걷기)');
    ok(bad.length === 0, '★③ 켬 판에서 세 칸을 읽은 함수 ⊆ {저장 · 세 칸끼리 셈 · 경계 기다림 상한} — 몸 틱 · 걸음 · 머묾 · 동기 · 되살림은 안 읽는다(정산 문 · 장 · 그림은 위 글자 표에 없다)', bad.length ? bad.join(' · ') : `${Object.keys(R).length}함수`);
    ok(tf.car.same, '★③ 독 — car 판: 세 칸(+ `_t661.t0`)에 걸음마다 NaN · ±1e300 · 0 … 을 넣고 저장 → 되살려도 결과 바이트 같음(몸 자리 · 단계 · 머묾 끝 · 걸음 시계)', tf.car.same ? `${tf.car.A.n}줄` : dtxt(tf.car.diff));
    ok(tf.xz.same, '★③ 독 — xz 판: 경계 칸까지 걷기(세 칸을 읽는 `_xzWalkToBorder`) · 밂이 같음', tf.xz.same ? `${tf.xz.A.n}줄` : dtxt(tf.xz.diff));
  }
  if (!on.err) {
    const sv = on.save.car || [], sx = on.save.xz || [];
    const allow = new Set(['*.da', '*.aa', '*.nom', '*.at', '*.T.t0']);
    console.log(`    [표·정보] 저장 바이트(메타 행 곁 칸 \`t1034.b\`)가 흔들림에 갈린 칸 — car ${sv.join(' · ')} · xz ${sx.join(' · ')} (메타 행 \`anchor.epoch\` · \`anchor.at\` 도 벽시계)`);
    ok(sv.includes('*.da') && sv.includes('*.aa') && sx.includes('*.da') && sx.includes('*.aa') && sv.concat(sx).every((k) => allow.has(k)),
      '③ 저장 바이트 — 흔들림에 갈리는 칸은 세 칸 + `at`(+ `T.t0`)뿐 · `departAt` · `arriveAt` 는 실제로 저장에 실려 갈린다(`nomPxMs` 는 비 = 길 ÷ (도착 − 출발)이라 같이 민 흔들림엔 안 갈린다 · 그 뒤 결과는 위 독 판이 같음)', `car ${sv.length} · xz ${sx.length}`);
  }
}

console.log('\n④ ★미끼 — 사본에서 글자 한 자리를 바꾸면 빨강');
let caught = 0;
for (let i = 0; i < BAITS.length; i++) {
  const [name, kind] = BAITS[i], r = child(i, {}, kind === 'tf' ? 'tfp' : 'shake');
  const red = !r.err && (kind === 'tf' ? (!r.car.same || !r.xz.same) : (r[kind] && !r[kind].same));
  if (red) caught++;
  const d = r.err ? r.err.slice(0, 200) : kind === 'tf' ? `car ${r.car.same ? '같음' : '갈림'} · xz ${r.xz.same ? '같음' : '갈림'} · ${dtxt(r.car.diff || r.xz.diff)}` : (r[kind] ? dtxt(r[kind].diff) : '');
  ok(red, `④ 미끼 ${name} — ${kind === 'tf' ? '독 판' : kind + ' 판'}이 갈린다(잡음)`, d);
}
console.log(`\n  미끼 ${caught}/${BAITS.length}`);

// ══ ★[T1282] ⑤ ⑥ — 켬 갈래에 남은 두 시계 축 섞임 셋(T1273 회부 2 · 3 · 4) ═════════════════════════════
const MIXN = (r) => r.err ? null : { mg: r.mg.A.redraw + r.mg.B.redraw, lg: r.lg.split, t0: r.t0.split };
console.log('\n⑤ ★[T1282] 축 섞임 셋 — 마감 틈 진 장 다시 듦 · `legDays` 갈림 · `t0` 갈림(켬 = 고친 판)');
const mx = child(null, {}, 'mix'), mxOld = child(MIX_BAITS.slice(0, 3).map((_, i) => 'm' + i).join(','), {}, 'mix'), mxOff = child(null, { T1253_CLOCK_FIX: '0' }, 'mix');
if (mx.err) ok(false, '⑤ 켬 판이 돌았다', mx.err);
else {
  const g = mx.mg.A, L = mx.lg, T0 = mx.t0;
  ok(mx.knob && g.pendTicks >= 10 && g.opened === 3 && g.closedBefore === 2 && g.seenNew > 0,
    '⑤ [전제] mg 판 — 마감을 운영 차례로 열었다(econ 머리 앞 틈 틱이 있다) · 그날 장 둘이 하루 안에 졌다 · 이튿날 새 장은 선다(대조)', `틈 ${g.pendTicks}틱 · 장 ${g.opened} · 진 장 ${g.closedBefore} · 새 장 ${g.seenNew}틱`);
  ok(mx.mg.A.redraw === 0 && mx.mg.B.redraw === 0, '★⑤ mg — 마감 틈에 그날 진 장이 그림(`marketVillages`)에 다시 든 틱 = 0(A · B)', `A ${mx.mg.A.redraw} · B ${mx.mg.B.redraw}`);
  ok(mx.mg.same, '⑤ mg — 흔들림 A ↔ B 바이트 같음(마감 틈도 econ 날 시계 하나)', mx.mg.same ? `${g.n}틱` : dtxt(mx.mg.diff));
  ok(L.n === 60 && L.split === 0 && L.econAtEnd === 60, '★⑤ lg — 같은 econ 상태(밀림 · 머리 앞 · 머리 뒤 · 경계 틱) · 벽시계만 0 ~ 0.97일 앞선 몸 60 — `legDays` 갈림 0 · 다 econ 날 수(받을 경계 − 닫는 날 끝)',
    `몸 ${L.n} · 갈림 ${L.split} · econ 날 시계 = 닫는 날 끝 ${L.econAtEnd}/${L.n}`);
  ok(T0.A.made === 26 && T0.ids >= 20 && T0.A.n === T0.B.n, '⑤ [전제] t0 판 — 머묾 끝 귀환 몸이 `t0` 를 적었다(T772 귀환 보간 · T1182 몸)', `몸 ${T0.A.made} · t0 ${T0.A.n} · ${T0.B.n}`);
  ok(T0.split === 0 && T0.A.eqLinger === T0.A.n && T0.B.eqLinger === T0.B.n, '★⑤ t0 — 흔들림 A ↔ B 에서 `t0` 갈림 0 · `t0` = 머묾 끝(econ 날 시계 축)', `갈림 ${T0.split} · = 머묾 끝 A ${T0.A.eqLinger}/${T0.A.n} · B ${T0.B.eqLinger}/${T0.B.n}`);
}
if (mxOld.err) ok(false, '⑤ 고치기 전(종전 셋 되돌린 사본) 판이 돌았다', mxOld.err);
else {
  const b = MIXN(mxOld), a = MIXN(mx) || {};
  console.log(`    [표] 고치기 전(K1 · K2 · K3 종전 글자 사본) → 지금: 마감 틈 진 장 다시 듦 ${b.mg} → ${a.mg}틱 · legDays 갈림 ${b.lg} → ${a.lg}몸 · t0 갈림 ${b.t0} → ${a.t0}몸`);
  ok(b.mg > 0 && b.lg > 0 && b.t0 > 0, '⑤ 고치기 전 사본은 셋 다 0 이 아니다(자명 통과 금지 — 판이 그 갈림을 실제로 낸다)', `${b.mg} · ${b.lg} · ${b.t0}`);
}
if (mxOff.err) ok(false, '⑤ 끔 판이 돌았다', mxOff.err);
else { const o = MIXN(mxOff); console.log(`    [표·정보] 끔(\`T1253_CLOCK_FIX=0\` — 종전 벽시계 갈래 · 이 카드 손 밖): 마감 틈 진 장 다시 듦 A ${mxOff.mg.A.redraw} · B ${mxOff.mg.B.redraw}틱(끔 장 끝은 벽시계라 B 흔들림이 장을 여닫는다) · legDays 갈림 ${o.lg}몸 · t0 갈림 ${o.t0}몸`); ok(!mxOff.knob, '⑤ [전제] 끔 판 손잡이 = 끔'); }

console.log('\n⑥ ★[T1282] 미끼 — 고친 줄 하나씩 종전 글자로 되돌린 사본이 빨강');
let mcaught = 0;
for (let i = 0; i < MIX_BAITS.length; i++) {
  const [name, kind] = MIX_BAITS[i], r = child('m' + i, {}, 'mix'), n = MIXN(r);
  const red = !!n && n[kind] > 0;
  if (red) mcaught++;
  ok(red, `⑥ 미끼 ${name} — ${kind} 판 갈림 > 0(잡음)`, r.err ? r.err.slice(0, 200) : `마감 틈 ${n.mg} · legDays ${n.lg} · t0 ${n.t0}`);
}
console.log(`\n  T1282 미끼 ${mcaught}/${MIX_BAITS.length}`);
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
