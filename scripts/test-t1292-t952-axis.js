#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1292-t952-axis.js — T952 교차 존 상인 머묾 끝의 시계 축 (T1292 · 2026-11-13) ==========================
//
// ★왜 [T1292 두 존 판 — 시드 1020 · 120날]: 세 손잡이를 켜면 이웃 존에 닿은 상인 몸이 **끝없이 머물렀다** — 판 끝에 닛폰 251 · 한반도 133 이
//   귀환 날을 2 ~ 110날 넘긴 채 그 존 장마당에 섰다(받는 존 econ 은 몸이 경계 칸에 닿기를 기다려 'return' 을 안 적는다 — 집 존 곳간에 짐이 안 든다).
//   까닭: T952 `_t952XzStay` 의 머묾 끝 = 장부 도착 날 머리(`econDayToMs(D)` — **벽시계 경계 축** · 10¹² ms 대) + 4/24 하루.
//     몸 틱(`tickCaravanBodies`)은 T1182 몸의 머묾 끝을 **econ 날 시계**(`_t1253Now` — D × 하루 + 그날 몫 · 10⁵ 대)로 견준다(T1253 · 켬 기본) ⇒ 영영 안 닿는다.
//     오늘 장 기록이 있는 마을(`joined`)은 장 끝(`_t707Open` — 이미 econ 축)이라 멀쩡했다 — 판의 머묾 중 장에 안 든 몫(닛폰 255 · 한반도 134)이 판 끝 머문 수(251 · 133)와 맞는다(차 = 판 끝 넘는 중).
//   고침: **T1289(land1071 · 같은 날 main 에 듦)** 가 머묾 끝을 econ 날 시계 축으로 옮겼다(`_t1289ToE` — 장 기록 없는 갈래). 이 가지(T1292)는 두 존 판에서 이 결함을
//     찾았고(같은 셈을 따로 고쳤다가 T1289 를 받아 그 줄로 합쳤다). 덤프 `at`(머묾을 연 시각)은 벽시계 그대로다 — e2e ⓖ 는 T1300(land1072)이
//     머묾 끝을 같은 econ 순간의 벽시계 ms(`/perf` `wt.lu` = `_t1289ToB(lu)`)로 옮겨 그것과 견준다(이 하네스 ① 이 그 셈을 같이 지킨다).
//   이 하네스는 그 결함(이웃 존 상인이 끝없이 머묾)이 다시 서지 않게 지킨다.
//
// 판(판정 사본 0 — 운영 함수를 그대로 부른다 · `__labProbe._caravanBodyProbe` 의 `xzMakeBody` · `syncOne` · `tick` · `openMarket` · `econNow`):
//   아이 프로세스 하나 = 한 갈래(env · 미끼) · `Date.now` 를 판 시계로 · 하루 4분 · 걸음 33ms · 날 경계에서 econ 날과 경계를 함께 올린다.
//   몸 셋 — E: 날 머리 + 5% 에 econ 도착(머묾 끝 4/24 = 16.7% 전에 닿음 → 끝까지 머물고 떠나야) · L: 60% 에 도착(끝이 이미 지남 → 곧 떠나야)
//           · J: 그 마을에 오늘 장 기록이 있다(장 끝 — 종전부터 econ 축 · 대조)
// 지키는 것:
//   ⓪ 글자 — 축 옮김 줄(T1289)이 `_t952XzStay` 에 꼭 한 번 · `_t952XzStay` 부르는 곳 하나(T952 · T707 · 이웃 존 상인만)
//   ① 지금(기본) — E: 머묾 끝 = econ 날 머리(D × 하루) + 4/24 하루(바이트) · 그 끝에 떠난다 · L: 곧 떠난다 · J: 장 끝에 떠난다 ·
//      덤프 `at` = 동기 순간 벽시계 · 머묾 끝의 벽시계 ms(`_t1289ToB` — T1300 `wt.lu`) − `at` = 머묾 길이(4/24 − 5% 하루 · e2e ⓖ3 의 셈)
//   ② 미끼 = T1289 앞 글자(축 옮김 줄을 뺀 사본) — E · L 은 이틀을 돌려도 안 떠난다(머묾 끝이 벽시계 축 — 두 존 판의 그 결함) · J 는 떠난다(대조 — 장 기록 갈래는 원래 맞았다)
//   ③ `T1253_CLOCK_FIX=0`(몸 시계가 벽시계) — 종전 식이 그 축과 맞다: E · L · J 다 떠난다(축 옮김 줄이 안 닿는다)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
const AX_LINE = 'if (T1253_CLOCK_FIX && body._t1182 && !body._t952.joined) { body.lingerUntil = _t1289ToE(end); body._t952.d0 = _t1289ToE(d0); body._t952.end = body.lingerUntil; }';
const BAITS = { pre: [AX_LINE, 'if (false) { body.lingerUntil = _t1289ToE(end); body._t952.d0 = _t1289ToE(d0); body._t952.end = body.lingerUntil; }'] };

if (process.argv[2] === '--child') {
  const bait = BAITS[process.argv[3]] || null;
  if (bait) {
    const old = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      if (f !== VFILE) return old(m, f);
      const src = fs.readFileSync(f, 'utf8');
      if (src.split(bait[0]).length !== 2) { process.stdout.write('@@' + JSON.stringify({ err: '미끼 자리가 한 번이 아니다' }) + '\n'); process.exit(3); }
      m._compile(src.replace(bait[0], bait[1]), f);
    };
  }
  const mute = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
  const V = require(VFILE), E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const P = V.__labProbe._caravanBodyProbe, H = V.__p3Bind({}), S = H.state;
  let CLK = 0; Date.now = () => CLK;
  const E0 = 1.6e12, M = 240000, G0 = 4800, D0 = 100;
  const w = mute(() => E2.createWorldV2({ seed: 7, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0 }));
  const [a, b] = w.villages; w.day = D0; w.caravans = [];
  const vA = { dbId: 1, name: '가', ccx: 10, ccy: 10, npcPids: [], econ: a }, vB = { dbId: 2, name: '나', ccx: 40, ccy: 22, npcPids: [], econ: b };
  const coarse = [{ x: 336, y: 336 }, { x: 2400, y: 336 }, { x: 2400, y: 1500 }, { x: 4200, y: 1500 }, { x: 1296, y: 720 }];
  let nid = 0;
  const players = new Map(), npcs = new Map();
  Object.assign(S, { world: w, ready: false, dayMs: M, lastGameDay: G0, epoch: E0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, roads: null, xzone: null, villages: [vA, vB],
    byEcon: new Map([[a, vA], [b, vB]]), routeCache: new Map([['1_2', coarse]]), walkCache: new Map([['1_2', { coarse, pts: coarse }]]), _t1034Saved: null, _t775: null,
    deps: { players, npcs, moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; }, broadcast: () => {},
      spawnNpc: (o) => { const p = { pid: 'n' + (++nid), x: o.x, y: o.y, hp: 100, hunger: 100, thirst: 100, name: o.name }; players.set(p.pid, p); npcs.set(p.pid, p); return p; },
      xzonePost: () => new Promise(() => {}) },
    caravanBodies: new Map(), _carTickAt: undefined });
  //   판 시계 — 벽시계 = 경계 축(`econDayToMs(D)` = epoch + 경계 × 하루) · econ 날과 경계는 같이 오른다(밀림 0 — 축 섞임만 본다)
  const setAt = (dayFrac) => { CLK = E0 + (S.lastGameDay + dayFrac) * M; };
  const frac = () => (CLK - (E0 + S.lastGameDay * M)) / M;
  const xzCar = (id, x) => Object.assign({ id: 'xz:nip:' + id, from: { name: '저쪽', zone: 'nip', _xz: true }, to: b, trader: null, state: 'outbound', departDay: D0, arriveDay: D0,
    returnArriveDay: D0 + 1, escort: 1, giveRes: 'wood', giveAmt: 5, _xzHome: { zone: 'nip', id }, _xzBack: { day: D0 + 1, leg: 1, remain: 0, ptLocal: { x: 40, y: 700 }, ptPeer: { x: 70015, y: 700 } } }, x || {});
  const out = { knobs: { t1253: process.env.T1253_CLOCK_FIX !== '0', t952: process.env.T952_XZ_STAY === '1', bait: process.argv[3] || '-' }, cases: {} };
  //   한 몸 — 도착 비율 `at` 에서 econ 도착(동기가 머묾을 연다) · 걸음마다 몸 틱 · 떠난(phase inbound) econ 시각 · 이틀 상한
  function run(tag, atFrac, market) {
    S.caravanBodies = new Map(); S._carTickAt = undefined; S.lastGameDay = G0; w.day = D0; w.caravans = []; vB._mkt = null;
    setAt(0.001);
    const c = xzCar(41 + Object.keys(out.cases).length);
    w.caravans.push(c);
    mute(() => P.xzMakeBody(c.id, c, coarse.slice(), 'outbound', Date.now(), E0 + (G0 + 1) * M, b, { tribeId: 'xz_nip', tribeName: '저쪽' }));
    const body = S.caravanBodies.get(c.id);
    if (market) { const hc = { id: 999, from: a, to: b, trader: a.npcs[0], state: 'inbound', departDay: D0, arriveDay: D0, returnArriveDay: D0 + 2, escort: 0, giveRes: 'wood', giveAmt: 1, _mktD: D0 }; mute(() => P.openMarket(hc)); }
    setAt(atFrac);
    c.state = 'inbound';   // econ 도착 · 정산(받는 존 — `_t707Xz`) — 동기가 몸을 종점에 세우고 머묾을 연다
    const syncAt = Date.now();
    mute(() => P.syncOne(syncAt, c, { seen: new Set(), spawned: 0, arrived: 0, removed: 0 }, 16));
    const r = { phase0: body.phase, lu: body.lingerUntil, t952: body._t952 ? Object.assign({}, body._t952) : null, econAt: P.econNow(), syncAt,
      luW: Number.isFinite(body.lingerUntil) ? P.toB(body.lingerUntil) : null,   // 머묾 끝의 벽시계 ms(같은 econ 순간 — T1300 `/perf` `wt.lu` 의 셈 · 켬 축에서만 뜻이 있다)
      mktEnd: vB._mkt ? vB._mkt.end : null, left: null, steps: 0 };
    let days = 0;
    while (days < 2 && r.left == null) {
      CLK += 33; r.steps++;
      if (frac() >= 1) { S.lastGameDay++; w.day++; days++; }   // 날 경계 — econ 날과 경계를 함께(밀림 0)
      mute(() => P.tick(Date.now()));
      if (body.phase !== 'linger') r.left = { econ: P.econNow(), frac: +frac().toFixed(6), day: w.day, phase: body.phase };
    }
    r.endPhase = body.phase; r.econEnd = P.econNow();
    out.cases[tag] = r;
  }
  run('E', 0.05, false);
  run('L', 0.60, false);
  run('J', 0.05, true);
  out.M = M; out.D0 = D0;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 ───────────────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
function child(env, bait) {
  const E = Object.assign({}, process.env, { T952_XZ_STAY: '1' }, env);
  for (const k of ['T1253_CLOCK_FIX']) if (!(k in env)) delete E[k];
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { encoding: 'utf8', env: E, timeout: 120000, maxBuffer: 1 << 26 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `rc ${r.status} · ${(r.stderr || '').slice(-300)}` };
  return JSON.parse(line.slice(2));
}
const VSRC = fs.readFileSync(VFILE, 'utf8'), VC = require('./code-only.js')(VSRC);
console.log('\n=== T1292 — T952 교차 존 상인 머묾 끝의 시계 축(econ 날 시계 — T1289 축 옮김) ===');
const fnBody = (() => { const i = VC.indexOf('function _t952XzStay('); return i < 0 ? '' : VC.slice(i, VC.indexOf('\nfunction ', i + 10)); })();
ok(fnBody.split(AX_LINE).length === 2, '⓪ `_t952XzStay` 안에 축 옮김 줄(T1289)이 꼭 한 번');
const calls = [...VC.matchAll(/_t952XzStay\(/g)].length;
ok(calls === 2 && /if \(T952_XZ_ON && T707_ON && c\._xzHome\) _t952XzStay\(body, c, now\);/.test(VC), '⓪ `_t952XzStay` 는 정의 하나 · 부르는 곳 하나(T952 켬 · 장 켬 · 이웃 존 상인만 — T952 끔이면 이 고침이 안 닿는다)', `${calls}곳`);
ok(Object.values(BAITS).every(([a]) => VSRC.split(a).length === 2), '⓪ 미끼 자리(축 옮김 줄)가 소스에 꼭 한 번');

const M = 240000, Q = M * 4 / 24;
//   떠나는 때의 자 — 몸 틱은 T1253 알갱이(1000/30 ms · 원점 = 몸 걸음 시계)로 머묾 끝을 견주고 걸음(33ms)마다 돈다 ⇒ 끝을 넘은 첫 알갱이를 다음 걸음이 치른다(< 알갱이 + 걸음).
//   밀린 몫이 상한(500ms — `tickCaravanBodies` 의 그 수)을 넘으면 그 걸음은 원점만 지금으로 옮긴다(종전 그대로) ⇒ 이미 지난 끝(L)은 상한 + 알갱이 + 걸음 안.
const GRAIN = 1000 / 30, STEP = 33, CAP = 500;
const on = child({}), old = child({}, 'pre'), wall = child({ T1253_CLOCK_FIX: '0' });
const fmt = (c) => c ? `머묾 끝 ${c.lu} · ${c.left ? `떠남 econ ${c.left.econ}(날 ${c.left.day} · ${(c.left.frac * 100).toFixed(2)}%)` : `안 떠남(${c.steps}걸음 · 끝 ${c.endPhase})`}` : '-';
console.log('\n① 켬(기본)');
if (on.err) ok(false, '① 판이 돌았다', on.err);
else {
  const { E, L, J } = on.cases, D0 = on.D0;
  ok(on.knobs.t1253 && on.knobs.t952 && on.knobs.bait === '-', '① [전제] 손잡이 = T1253 켬(기본) · T952 켬 · 미끼 없음');
  ok(E.phase0 === 'linger' && E.t952 && !E.t952.joined && E.t952.d0 === D0 * M && E.t952.end === D0 * M + Q && E.lu === E.t952.end,
    '★① E — 머묾 끝 = econ 날 머리(D × 하루) + 4/24 하루(바이트) · 장 기록 없음(joined 아님)', `d0 ${E.t952 && E.t952.d0} · 끝 ${E.lu} · = ${D0 * M} + ${Q}`);
  ok(!!E.left && E.left.econ >= E.lu && E.left.econ - E.lu < GRAIN + STEP && E.left.day === D0, '★① E — 그 끝까지 머물고 그 끝에 떠난다(끝 뒤 알갱이 + 걸음 안 · 같은 날)', fmt(E) + ` · 끝 뒤 ${E.left ? (E.left.econ - E.lu).toFixed(0) : '-'}ms`);
  ok(E.t952 && E.t952.at === E.syncAt && E.luW != null && Math.abs((E.luW - E.t952.at) - (Q - 0.05 * M)) < 1e-6,
    '① E — 머묾을 연 시각(덤프 `at`)은 동기 순간 벽시계 · 머묾 끝의 벽시계 ms(`_t1289ToB` = T1300 `wt.lu`) − `at` = 머묾 길이(e2e ⓖ3 의 셈 · 4/24 − 5% 하루)',
    `at ${E.t952 && E.t952.at} · 끝 벽시계 ${E.luW} · 머묾 ${E.luW != null && E.t952 ? (E.luW - E.t952.at).toFixed(0) : '-'}ms = ${(Q - 0.05 * M).toFixed(0)}`);
  ok(L.phase0 === 'linger' && !!L.left && L.left.econ - L.econAt < CAP + GRAIN + STEP && L.lu < L.econAt, '★① L — 머묾 끝이 이미 지난 도착(60%)은 곧 떠난다(밀린 몫 상한 + 알갱이 + 걸음 안)', fmt(L) + ` · 도착 뒤 ${L.left ? (L.left.econ - L.econAt).toFixed(0) : '-'}ms`);
  ok(J.t952 && J.t952.joined && J.lu === J.mktEnd && !!J.left && J.left.econ >= J.lu, '① J — 오늘 장 기록이 있으면 장 끝(종전 그대로)에 떠난다', fmt(J));
}
console.log('\n② 미끼 = T1289 앞 글자(축 옮김 줄을 뺀 사본 — 두 존 판에서 찾은 그 결함)');
if (old.err) ok(false, '② 판이 돌았다', old.err);
else {
  const { E, L, J } = old.cases;
  ok(!E.left && !L.left && E.endPhase === 'linger' && L.endPhase === 'linger' && E.lu > 1e11, '★② 미끼 → 빨강 — E · L 은 이틀을 돌려도 안 떠난다(머묾 끝이 벽시계 축 · 10¹² 대 ↔ econ 날 시계 10⁷ 대)', `E ${fmt(E)} · L ${fmt(L)}`);
  ok(!!J.left, '② 대조 — J(장 기록 갈래)는 그 글자에서도 떠난다(장 끝은 이미 econ 축)', fmt(J));
}
console.log('\n③ `T1253_CLOCK_FIX=0`(몸 시계 = 벽시계)');
if (wall.err) ok(false, '③ 판이 돌았다', wall.err);
else {
  const { E, L, J } = wall.cases;
  ok(!!E.left && !!L.left && !!J.left && E.t952 && E.t952.d0 > 1e11 && E.t952.at > 1e11, '③ 종전 식(벽시계 경계 축)이 그 몸 시계와 맞다 — E · L · J 다 떠난다(축 옮김 줄이 안 닿는다 — 덤프도 벽시계)', `E ${fmt(E)}`);
}
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
