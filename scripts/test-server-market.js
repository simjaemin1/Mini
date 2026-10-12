#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-server-market.js — 서버 장마당(T707): 장부가 열고 · 명부가 모으고 · 떠날 때 정산 ====================
//
// ★왜 [재민 10-12 · T693 판정 → T707] "랩에서 만든 것이 목표" — 서버 장마당은 캐러밴 머묾 플래그 하나였다(주민이 안 모인다 · 1시간).
//   이 하네스는 실험실 `test-lab-market` ①~⑦ 의 **뜻**을 서버 정본 함수로 잰다(존을 부팅하지 않는다 —
//   `__labProbe._t707Probe` 로 `_t707Open`·`_t707Roster`·`npcLifeTick`·`marketVillages`·`_t707Yard`·`_t707Linger` 를 그대로 부른다 · 사본 0).
//
//   ① 개장 — 장부 도착(`c._mktD` = 그날)이 그 마을 장을 연다 · 장 끝 = 그날 경계 + 하루 × `MKT_LINGER_DAY_FRAC`(4/24) · 그동안만 플래그 ·
//      econ: 도착 날엔 값만 찍고(받는 마을 곳간에 짐이 안 든다) 다음 econ 틱 머리에 한 번 정산(교역 기록의 날 = 장부에 든 날 · 두 번 불러도 한 번)
//   ② 새 상태 0 — 장에 가는 몸은 종전 `behavior`('wander') · 라벨만 '장마당' · 몸에 새 칸 0(T671 모양 고정)
//   ③ 자리 — 명부의 몸은 마당 좌판 자리(`MKT_SPOTS`) 칸 한가운데로 간다(좌판 ≤ 3셀) · 상인은 남문 앞 마당(`HALL_YARD_PTS` 첫 열린 칸)에 선다
//   ④ 인원 상한 — 명부 ≤ max(1, round(몸 수 × `MKT_FRAC`)) · 같은 날 둘째 캐러밴은 더 안 모은다(T684 셈) · 다른 날엔 시작점이 돈다(얼굴 돌리기)
//   ⑤ 일하는 사람 미차출 — 그날 집 크루(T400) · 행위 팔이 켜진 직업(T312 어부)은 명부 밖 · 진행 작업 · 요양 · 잠(기상 전)인 몸은 문에서 안 간다
//   ⑥ 파장 — 장 끝이 지나면 문이 안 걸린다(일과 그대로) · 플래그에서 빠진다
//   ⑦ 예외 0 · 끔(`T707_MARKET` 없음) = 장 기록을 안 보고(종전 플래그 · 종전 문) econ 도 도착 때 정산(찍힘 0)
//   미끼 둘(자명 통과 금지 — 존 사본 villages.js 한 줄만 바꾼 나무 · 나머지 파일은 정본에 걸어 둔다):
//     ⓐ T684 뺄셈을 뺀 사본 → ④ 둘째 캐러밴이 또 모은다(빨강) · ⓑ 명부 거름을 뺀 사본 → ⑤ 크루·행위 팔 어부가 명부에 든다(빨강)
//
// 실행: node scripts/test-server-market.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/tsm-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// ── 자식 한 판: 서버 장마당(명부·문·플래그·상인) ───────────────────────────────────────
function serverArm(villagesPath) {
  const R = { ok: true, err: null };
  try {
    let FAKE = 0;
    Date.now = () => FAKE;                       // 자식 전용 시계(이 판 안의 모든 벽시계 읽기가 이 값을 본다)
    const V = require(villagesPath);
    const T = V.__labProbe._t707Probe;
    const VL = require(path.join(ROOT, 'server/village-layout.js'));
    R.on = T.ON;
    const DAY = 1440000, EP = 0;
    const blocked = new Set();
    const players = new Map();
    const deps = { players, npcs: new Map(), broadcast: () => {}, dayPhaseRatio: 0.7,
      worldPhase: (n) => ((((n - EP) % DAY) + DAY) % DAY) / DAY,
      isTerrainBlockedLocal: (x, y) => blocked.has(Math.floor(x / 32) + ',' + Math.floor(y / 32)) };
    const ecA = { name: 'A', npcs: [], storage: {}, counts: {}, _idleFrac: 0 }, ecB = { name: 'B', npcs: [], storage: {} };
    const vil = { dbId: 7, name: 'A', ccx: 100, ccy: 100, npcPids: [], econ: ecA, _terrSet: new Set(['0,0']), _site: null, _psite: null,
      _clearCrew: 0, _buildCrew: 0, _claim: new Set(), _farmSet: new Set(), _cropClaim: new Set(), _potSet: new Set(), _drySet: new Set() };
    const NP = 40;
    const mkNpc = (i) => ({ pid: 'n' + i, simVillageId: 7, simJob: (i % 5 === 0) ? 'fisher' : 'farmer', hp: 100, maxHp: 100,
      x: 3200 + i * 32, y: 3600, npcHomeX: 3200 + i * 32, npcHomeY: 3600, simLonOff: 0, behavior: 'idle', inventory: {} });
    for (let i = 0; i < NP; i++) { const n = mkNpc(i); vil.npcPids.push(n.pid); players.set(n.pid, n); }
    const world = { day: 10, caravans: [] };
    const setDay = (d) => { world.day = d; T.setup({ lastGameDay: d }); };
    T.setup({ deps, world, byEcon: new Map([[ecA, vil]]), byDbId: new Map([[7, vil]]), villages: [vil], caravanBodies: new Map(),
      dayMs: DAY, epoch: EP, lastGameDay: 10, ready: true });
    const at = (d, ph) => EP + d * DAY + Math.round(ph * DAY);
    const spotCells = VL.MKT_SPOTS.map(([dx, dy]) => [vil.ccx + dx, vil.ccy + dy]);
    const onSpot = (n) => spotCells.some(([cx, cy]) => n.targetX === cx * 32 + 16 && n.targetY === cy * 32 + 16);
    const capN = Math.max(1, Math.round(NP * VL.MKT_FRAC));

    // ① 개장(10일) — 몸 없는 캐러밴(몸 표 빈) · 그날 기록 · 끝 = 경계 + 4/24 하루
    FAKE = at(10, 0.01);
    const c1 = { id: 1, to: ecA, from: ecB, _mktD: 10, state: 'inbound' };
    const rec = T.open(c1);
    R.open = !!rec && rec.d === 10 && rec.end === at(10, 0) + DAY * VL.MKT_LINGER_DAY_FRAC;
    R.endFrac = rec ? (rec.end - at(10, 0)) / DAY : null;
    FAKE = at(10, 0.12);
    R.flagIn = JSON.stringify(T.markets()) === JSON.stringify([vil.ccx, vil.ccy]);
    T.tally(); R.tallyNoBody = T.stat().mktNoBody;
    // ④ 인원 상한 · T684 · 얼굴 돌리기
    const r1 = [...rec.at.keys()];
    R.cap = capN; R.n1 = r1.length;
    const c2 = { id: 2, to: ecA, from: ecB, _mktD: 10, state: 'inbound' };
    T.open(c2);
    R.n2 = rec.at.size;                            // 같은 날 둘째 — 더 모으면 안 된다
    T.open(c1); R.n3 = rec.at.size;                // 같은 캐러밴 다시('retry') — 한 번
    // ③ ② 문 — 명부의 몸은 좌판 자리로(낮 0.12 = 기상 시차 0.03 뒤 · 농부 출근 창 뒤라 명부 밖 농부는 집으로)
    const keys0 = Object.keys(players.get(r1[0])).sort().join(',');
    let toSpot = 0, label = 0, wander = 0, others = 0, othersMkt = 0;
    for (const pid of vil.npcPids) {
      const n = players.get(pid);
      const ret = T.life(n, at(10, 0.12));
      if (rec.at.has(pid)) { if (ret && onSpot(n)) toSpot++; if (n._lifeAct === '장마당') label++; if (n.behavior === 'wander') wander++; }
      else { others++; if (n._lifeAct === '장마당' || onSpot(n)) othersMkt++; }
    }
    R.toSpot = toSpot; R.label = label; R.wander = wander; R.othersMkt = othersMkt; R.others = others;
    const keys1 = Object.keys(players.get(r1[0])).sort().join(',');
    R.newKeys = keys1.split(',').filter((k) => !keys0.split(',').includes(k) && !['_lifeAct', '_lifeActAt', '_dOff', '_hd', '_half', '_sh', 'targetX', 'targetY', 'gatherTarget', '_huntOn', '_huntSpd'].includes(k));
    // ⑤ 문에서 안 간다 — 진행 작업 · 요양 · 기상 전
    const pTask = players.get(r1[1]), pRest = players.get(r1[2]), pSleep = players.get(r1[3]);
    pTask._lifeTask = { k: 'build', px: 0, py: 0, prog: 0 }; pTask._lifeAct = null; pTask.targetX = 0;
    T.life(pTask, at(10, 0.12)); R.taskStays = pTask._lifeAct !== '장마당' && !onSpot(pTask);
    pRest.hp = 30; pRest._lifeAct = null; T.life(pRest, at(10, 0.12)); R.restHome = pRest._lifeAct !== '장마당' && !onSpot(pRest);
    pSleep._dOff = 0.02; pSleep._lifeAct = null; pSleep.targetX = 0; T.life(pSleep, at(10, 0.001)); R.sleepHome = pSleep._lifeAct !== '장마당' && !onSpot(pSleep);
    pTask._lifeTask = null; pRest.hp = 100;
    // ⑥ 파장 — 장 끝 뒤: 문이 안 걸린다 · 플래그 빠짐
    const pAfter = players.get(r1[4]); pAfter._lifeAct = null; pAfter.targetX = 0;
    FAKE = rec.end + 1000;
    T.life(pAfter, rec.end + 1000); R.afterOff = pAfter._lifeAct !== '장마당' && !onSpot(pAfter);
    R.flagOut = T.markets().length === 0;
    // ④ 다른 날 — 시작점이 돈다(같은 명부가 아니다)
    setDay(11); FAKE = at(11, 0.01);
    const c3 = { id: 3, to: ecA, from: ecB, _mktD: 11, state: 'inbound' };
    const recB = T.open(c3);
    const r2 = [...recB.at.keys()];
    R.rotates = r2.length === r1.length && r2.join(',') !== r1.join(',');
    // ⑤ 명부 거름 — 그날 집 크루(T400 · 집터가 선 날 명부 앞 둘) · 시작점이 명부 앞에 오는 날(7 + d ≡ 0 mod 40 → d = 33)
    vil._site = { cx: 80, cy: 80, stage: 0 };
    setDay(33); FAKE = at(33, 0.01);
    const c4 = { id: 4, to: ecA, from: ecB, _mktD: 33, state: 'inbound' };
    const recC = T.open(c4);
    R.crewOut = !recC.at.has(vil.npcPids[0]) && !recC.at.has(vil.npcPids[1]);
    R.startFront = recC.at.has(vil.npcPids[2]);
    R.fishersIn = [...recC.at.keys()].filter((pid) => players.get(pid).simJob === 'fisher').length;
    vil._site = null;
    // ③ 상인 — 남문 앞 마당(첫 열린 후보) · 머묾 = 장 끝 · 귀환 길 첫 점 = 마당
    blocked.add((vil.ccx + VL.HALL_YARD_PTS[0][0]) + ',' + (vil.ccy + VL.HALL_YARD_PTS[0][1]));
    const y = T.yard(vil), y1 = VL.HALL_YARD_PTS[1];
    R.yardSkipsBlocked = y.x === (vil.ccx + y1[0]) * 32 + 16 && y.y === (vil.ccy + y1[1]) * 32 + 16;
    const body = { pts: [{ x: 1000, y: 1000 }, { x: 3216, y: 3216 }], cum: null, len: 0, prog: 0, c: c4, phase: 'linger' };   // 그날(33일) 장의 캐러밴 — 동기에서 장을 연 바로 뒤 머묾을 연다
    const pM = { x: 0, y: 0 };
    T.linger(body, c4, pM);
    R.lingerEnd = body.lingerUntil === recC.end;
    R.merchantAtYard = pM.x === y.x && pM.y === y.y && body.pts[0].x === y.x && body.pts[0].y === y.y;
    R.stat = T.stat();
  } catch (e) { R.ok = false; R.err = String(e && e.stack || e).split('\n').slice(0, 4).join(' | '); }
  return R;
}

// ── 자식 한 판: 행위 팔(T312 어부) 거름 ──────────────────────────────────────────────
function actArm(villagesPath) {
  const R = { ok: true, err: null };
  try {
    let FAKE = 0; Date.now = () => FAKE;
    const V = require(villagesPath);
    const T = V.__labProbe._t707Probe;
    const players = new Map();
    const ecA = { name: 'A', npcs: [], storage: {}, counts: {}, _t312Cells: 3 }, ecB = { name: 'B' };
    const vil = { dbId: 7, ccx: 100, ccy: 100, npcPids: [], econ: ecA, _terrSet: new Set(['0,0']) };
    for (let i = 0; i < 40; i++) { const pid = 'n' + i; vil.npcPids.push(pid); players.set(pid, { pid, simJob: (i % 5 === 0) ? 'fisher' : 'farmer' }); }
    const world = { day: 10, caravans: [] };
    T.setup({ deps: { players, isTerrainBlockedLocal: () => false }, world, byEcon: new Map([[ecA, vil]]), byDbId: new Map([[7, vil]]), villages: [vil],
      caravanBodies: new Map(), dayMs: 1440000, epoch: 0, lastGameDay: 10, ready: true });
    const rec = T.open({ id: 1, to: ecA, from: ecB, _mktD: 10, state: 'inbound' });
    R.fishOn = !!require(path.join(ROOT, 'sim/economy-sim.js')).fishActOn(ecA);
    R.fishersIn = [...rec.at.keys()].filter((pid) => players.get(pid).simJob === 'fisher').length;
    R.n = rec.at.size;
  } catch (e) { R.ok = false; R.err = String(e && e.stack || e).split('\n').slice(0, 4).join(' | '); }
  return R;
}

// ── 자식 한 판: econ 떠날 때 정산 ────────────────────────────────────────────────────
function econArm() {
  const R = { ok: true, err: null };
  try {
    const v2 = require(path.join(ROOT, 'sim/economy-sim-v2.js'));
    R.on = v2.T707_MARKET;
    const world = v2.createWorldV2({ seed: 11, villageCount: 8 });
    const _log = console.log; console.log = () => {};
    let found = null;
    try {
      for (let d = 0; d < 80 && !found; d++) {
        v2.tickWorldV2(world);
        for (const c of world.caravans) if (c._t707 && c._t707.d === world.day) { found = c; break; }
        if (!found && !R.on) for (const c of world.caravans) if (c._mktD != null || c._t707) { R.offMarked = true; }
      }
    } finally { console.log = _log; }
    R.tradesOff = !R.on ? world.tradeLog.length : null;
    if (R.on) {
      if (!found) throw new Error('80일 안에 장이 선 도착이 없다');
      const c = found, P = c._t707;
      R.mktD = c._mktD === world.day;
      R.snapPrices = !!(P.pricesTo && P.pricesFrom && P.stockTo && P.pricesTo[c.giveRes] === P.pTo);
      R.noReturnYet = c._returningRes === null && c.state === 'inbound';
      const before = c.to.storage[c.giveRes] || 0, n0 = world.tradeLog.length;
      const nSet = v2.settleMarketsV2(world);
      const after = c.to.storage[c.giveRes] || 0;
      R.delivered = Math.abs((after - before) - P.give) < 1e-6 * Math.max(1, P.give);
      R.logged = world.tradeLog.length > n0 && world.tradeLog[world.tradeLog.length - 1].day === world.day;
      R.cleared = c._t707 === null && nSet >= 1 && v2.settleMarketsV2(world) === 0;
      R.returnSet = c._returningRes !== undefined;
    }
  } catch (e) { R.ok = false; R.err = String(e && e.stack || e).split('\n').slice(0, 4).join(' | '); }
  return R;
}

// ── 미끼 나무 — villages.js 한 줄만 바꾼 사본(나머지는 정본에 걸어 둔다 · realpath 로 정본 모듈을 읽는다) ─────
function decoyTree(name, edits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tsm-${name}-`));
  fs.mkdirSync(path.join(dir, 'server'));
  for (const f of fs.readdirSync(path.join(ROOT, 'server'))) {
    if (f === 'villages.js') continue;
    fs.symlinkSync(path.join(ROOT, 'server', f), path.join(dir, 'server', f));
  }
  fs.symlinkSync(path.join(ROOT, 'sim'), path.join(dir, 'sim'));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  let src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  for (const [a, b] of edits) { if (src.split(a).length !== 2) throw new Error(`미끼 ${name}: 앵커가 한 번이 아니다 — ${a.slice(0, 60)}`); src = src.replace(a, b); }
  fs.writeFileSync(path.join(dir, 'server', 'villages.js'), src);
  return { dir, file: path.join(dir, 'server', 'villages.js') };
}

if (process.argv[2] === '--child') {
  const kind = process.argv[3], vp = process.argv[4] || path.join(ROOT, 'server/villages.js');
  const out = kind === 'econ' ? econArm() : kind === 'act' ? actArm(vp) : serverArm(vp);
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모: 팔을 자식으로 돌리고 판정 ──────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const child = (kind, env, vp) => {
  const e = Object.assign({}, process.env, env);
  for (const k of Object.keys(env)) if (env[k] === null) delete e[k];
  const o = execFileSync(process.execPath, [__filename, '--child', kind, vp || ''], { env: e, encoding: 'utf8', maxBuffer: 1 << 26 });
  const line = o.split('\n').filter((l) => l.startsWith('@@')).pop();
  return line ? JSON.parse(line.slice(2)) : { ok: false, err: '자식 출력 없음' };
};
const ON = { T707_MARKET: '1' }, OFF = { T707_MARKET: null };

console.log('\n=== 서버 장마당(T707) — 장부가 열고 · 명부가 모으고 · 떠날 때 정산 ===');
const S = child('server', ON);
ok(S.ok, '⑦ 예외 0(켬 · 서버 팔)', S.err || '');
ok(S.on === true, '켬 판이 켬이다(T707_MARKET=1)');
ok(S.open, `① 장부 도착이 장을 연다 — 그날 기록 · 장 끝 = 경계 + 하루 × ${S.endFrac != null ? S.endFrac.toFixed(4) : '?'}(4/24)`);
ok(S.flagIn, '① 장이 서는 동안 플래그(markets)에 그 마을이 든다');
ok(S.tallyNoBody === 1, `⑤ 몸 없는 장도 선다 — 캐러밴 몸 0 인 장을 센다(${S.tallyNoBody})`);
ok(S.n1 >= 1 && S.n1 <= S.cap, `④ 명부 ${S.n1} ≤ max(1, round(몸 40 × MKT_FRAC)) = ${S.cap}`);
ok(S.n2 === S.n1 && S.n3 === S.n1, `④ 같은 날 둘째 캐러밴 · 같은 캐러밴 다시 — 더 안 모은다(${S.n1} → ${S.n2} · ${S.n3} · T684 셈)`);
ok(S.toSpot === S.n1, `③ 명부의 몸 전원이 좌판 자리 칸 한가운데로 간다(${S.toSpot}/${S.n1})`);
ok(S.label === S.n1 && S.wander === S.n1, `② 새 상태 0 — behavior 'wander' · 라벨 '장마당'(${S.wander}/${S.label}/${S.n1})`);
ok(S.newKeys && S.newKeys.length === 0, `② 몸에 새 칸 0(T671 모양 고정)`, S.newKeys && S.newKeys.length ? S.newKeys.join(',') : '');
ok(S.othersMkt === 0 && S.others === 40 - S.n1, `③ 명부 밖 몸은 장에 안 간다(${S.othersMkt}/${S.others})`);
ok(S.taskStays && S.restHome && S.sleepHome, `⑤ 진행 작업 · 요양 · 기상 전 몸은 문에서 안 간다(${S.taskStays}/${S.restHome}/${S.sleepHome})`);
ok(S.crewOut && S.startFront, `⑤ 그날 집 크루(T400 · 명부 앞 둘)는 명부 밖 — 시작점이 명부 앞인 날에도 셋째부터(${S.crewOut}/${S.startFront})`);
ok(S.afterOff && S.flagOut, `⑥ 파장 — 장 끝 뒤엔 문이 안 걸리고 플래그에서 빠진다(${S.afterOff}/${S.flagOut})`);
ok(S.rotates, '④ 다른 날 장은 시작점이 돈다 — 같은 얼굴이 아니다');
ok(S.yardSkipsBlocked, '③ 상인 자리 = 남문 앞 마당 — 막힌 첫 후보를 건너 둘째 후보(HALL_YARD_PTS 차례)');
ok(S.lingerEnd && S.merchantAtYard, `③ 상인 머묾 = 장 끝 · 상인은 마당(귀환 길 첫 점)에 선다(${S.lingerEnd}/${S.merchantAtYard})`);

const A = child('act', Object.assign({ T312_FISH_ACT: '1' }, ON));
ok(A.ok && A.fishOn && A.fishersIn === 0 && A.n >= 1, `⑤ 행위 팔(T312 어부 켬)의 어부는 명부 밖(어부 ${A.fishersIn} · 명부 ${A.n})`, A.err || '');

const E = child('econ', ON);
ok(E.ok, '⑦ 예외 0(켬 · econ 팔)', E.err || '');
ok(E.mktD && E.snapPrices && E.noReturnYet, `① 도착 날 — 장이 선 날을 적고 값만 찍는다(그림자가격 둘 · 곳간) · 귀환 화물 미정(${E.mktD}/${E.snapPrices}/${E.noReturnYet})`);
ok(E.delivered, '① 떠날 때 정산 — 받는 마을 곳간에 실어 온 짐이 그때 든다(양 그대로)');
ok(E.logged && E.cleared && E.returnSet, `① 교역 기록의 날 = 장부에 든 날 · 두 번 불러도 한 번(${E.logged}/${E.cleared})`);

const S0 = child('server', OFF);
ok(S0.ok && S0.on === false, '⑦ 끔 판 예외 0 · 끔이다', S0.err || '');
ok(S0.toSpot === 0 && S0.label === 0, `⑦ 끔 — 장 기록이 있어도 생활층 문이 안 걸린다(${S0.toSpot}/${S0.label})`);
ok(S0.flagIn === false, '⑦ 끔 — 플래그는 종전(캐러밴 몸 머묾)만 본다 · 장 기록을 안 읽는다');
const E0 = child('econ', OFF);
ok(E0.ok && E0.on === false && !E0.offMarked && E0.tradesOff > 0, `⑦ 끔 — econ 은 도착 때 정산(찍힘 0 · 교역 ${E0.tradesOff}건)`, E0.err || '');

// 미끼 ⓐ — T684 뺄셈을 뺀 사본: 같은 날 둘째 캐러밴이 또 모은다
const dA = decoyTree('t684', [['  let n = Math.max(1, Math.round(P * VL.MKT_FRAC)) - rec.at.size;', '  let n = Math.max(1, Math.round(P * VL.MKT_FRAC));']]);
const SA = child('server', ON, dA.file);
ok(SA.ok && SA.n2 > SA.n1, `미끼 ⓐ(T684 뺄셈 뺌) — ④ 가 문다: 둘째 캐러밴이 ${SA.n1} → ${SA.n2}`, SA.err || '');
// 미끼 ⓑ — 명부 거름을 뺀 사본: 크루·행위 팔 어부가 명부에 든다
const dB = decoyTree('skip', [['    if (rec.at.has(pid) || skip.has(pid)) continue;', '    if (rec.at.has(pid)) continue;'],
  ['    if (!p || _t707ActJob(vil, p.simJob)) continue;', '    if (!p) continue;']]);
const SB = child('server', ON, dB.file), AB = child('act', Object.assign({ T312_FISH_ACT: '1' }, ON), dB.file);
ok(SB.ok && !SB.crewOut && AB.ok && AB.fishersIn > 0, `미끼 ⓑ(거름 뺌) — ⑤ 가 문다: 크루 명부 밖 ${SB.crewOut} · 어부 ${AB.fishersIn}`, (SB.err || '') + (AB.err || ''));
for (const d of [dA, dB]) { try { fs.rmSync(d.dir, { recursive: true, force: true }); } catch (e) {} }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
