'use strict';
// (@regress 없음 — 러너 밖 · T805 몸 길 자 · 제품 무변)
// === scripts/t805-body-hook.js — **몸 길 자**(`scripts/t805-body-ruler.js`)의 아이 존 프리로드 =====================================
//
// ★[T805 2026-10-19 · T801 회부] 서버 기준선 자(T650 · 빠른 시계 · 몸 1 · 일괄 한도 0)는 켠 몸 팔을 못 잰다. 이 프리로드는 그 자를 대신할
//   **몸 길 자**의 아이 존(`node server/zone.js`)에만 선다. 제품 파일은 한 글자도 안 바뀐다 — 이 프로세스의 전역 · 모듈 사본만.
//   하는 일 넷(읽기만 · 세계에 쓰는 것 0):
//     ① 실제 단조 시계를 **먼저** 잡는다(가상 시계가 `process.hrtime` · `performance.now` 를 V 에 묶기 전에) — 틱 길이는 이 시계로 잰다.
//     ② 가상 시계(`scripts/t745-vclock.js` · T745 · T754 그 파일 그대로)를 싣는다 — `T745_VCLOCK=1` · `T577_SEED` 일 때만 선다.
//     ③ 30Hz 존 틱(`setInterval(…, 1000 / 30)` — zone.js 게임 틱)의 **본문 실제 소요**를 0.01 ms 칸 히스토그램에 — 판 통째 · econ 날마다.
//        가상 시계에선 몫 문이 안 바닥나 하루 마감이 경계 틱 하나에 다 돈다(T745 §1) ⇒ 그 틱은 따로 적는다(날마다 최대 틱).
//     ④ econ 하루 끝(`scanDay` — SBC 훅 · t577 훅과 같은 문)마다 한 줄: 팔 넷 관측 창(`fishPerf` · `woodPerf` · `foragePerf` · `farmPerf` —
//        `/perf` 가 내주는 그것) · econ 직업 수 · `farmFlowPerDay`(econ 정본 농사 용량) · **몸 지문**(마을 몸 전부의 pid · 자리 · HP · 손 — sha1).
//   env: T577_OUT=<판>(→ `<판>.t805.json`) · T805_OUT=<파일>(덮어쓰기) · T745_VCLOCK=1 · T577_SEED(가상 시계 조건 — t745 그대로)
if (!/server[\/\\]zone\.js$/.test(process.argv[1] || '')) return;
const OUT = process.env.T805_OUT || (process.env.T577_OUT ? process.env.T577_OUT + '.t805.json' : null);
if (!OUT) return;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const SRV = path.dirname(path.resolve(process.argv[1]));

// ① 실제 시계 — 가상 시계가 서기 전에
const RNS = process.hrtime.bigint;
const RDATE = Date;
const W0 = RDATE.now();
const realMs = () => Number(RNS()) / 1e6;
// ② 가상 시계(T745) — 조건이 안 맞으면 그 파일이 스스로 돌아간다
require('./t745-vclock.js');
// ②' 주사위 묶기 — `Math.random` 을 판 씨의 흐름 하나에(제품 정본 `server/seed-rand.js` 의 `seedRand` · `pidHash` 그대로 · 새 수 0).
//   ★왜: 몸 결정 주사위(T350 `_diceNpc`)의 씨 = `_shOf(npc)` = `pidHash(npc.playerId …)` 인데 마을 몸의 `playerId` 꼬리가
//     `Math.random()` 네 자다(zone.js `npc_${ZONE_ID}_${serial}_${…}`). 그래서 몸이 걷는 세계(어부 켬 = 모든 몸 · 농부 켬 = 농부)는
//     가상 시계 위에서도 **첫 1초부터** 판마다 갈린다(진단: 같은 씨 두 판 · 첫 표본에서 몸 408 의 `nextDecisionAt` 이 다 다르다 · 보고 §1).
//     끈 세계(몸이 안 걷는다)는 이 꼬리를 아무도 안 읽어 종전에도 같았다. ⇒ 자가 이 프로세스의 주사위를 판 씨에 묶는다(`T805_RANDOM=0` 이면 안 묶는다).
if (process.env.T805_RANDOM !== '0' && process.env.T577_SEED) {
  const SR = require(path.join(SRV, 'seed-rand.js'));
  Math.random = SR.seedRand(SR.pidHash('t805:' + process.env.T577_SEED));
}

// ③ 존 틱 본문 — 0.01 ms 칸(0 ~ 200 ms) + 넘친 틱은 값 그대로
const BIN = 0.01, NB = 20000;
const mkH = () => ({ h: new Uint32Array(NB), over: [], n: 0, sum: 0, max: 0 });
const addH = (H, ms) => { H.n++; H.sum += ms; if (ms > H.max) H.max = ms; const b = Math.floor(ms / BIN); if (b < NB) H.h[b]++; else H.over.push(+ms.toFixed(3)); };
function qH(H, p) {
  if (!H.n) return null;
  const k = Math.min(H.n - 1, Math.floor(H.n * p));
  let c = 0;
  for (let b = 0; b < NB; b++) { c += H.h[b]; if (c > k) return +((b + 0.5) * BIN).toFixed(3); }
  const o = H.over.slice().sort((a, b) => a - b); return o[Math.min(o.length - 1, k - c)];
}
const sumH = (H) => H.n ? { n: H.n, mean: +(H.sum / H.n).toFixed(4), p50: qH(H, 0.5), p90: qH(H, 0.9), p99: qH(H, 0.99), p999: qH(H, 0.999), max: +H.max.toFixed(3),
  over16: H.over.filter((x) => x > 16).length + (() => { let s = 0; for (let b = Math.ceil(16 / BIN); b < NB; b++) s += H.h[b]; return s; })(),
  over30: H.over.filter((x) => x > 30).length + (() => { let s = 0; for (let b = Math.ceil(30 / BIN); b < NB; b++) s += H.h[b]; return s; })() } : { n: 0 };
const TICK = { all: mkH(), win: mkH(), day: mkH(), dayMax: 0, dayN: 0, who: null };
//   잰 구간(날 D0 부터 — 자가 넘겨 준다 · 기본 2)의 틱만 따로 — 부팅 따라잡기 틱(가상 시계에선 첫 틱 하나에 몰린다)을 뺀 칸
const D0 = parseInt(process.env.T805_D0 || '', 10) || 2;
let inWin = false;
//   낮 표본 — 하루를 여덟으로 나눈 자리마다 팔 넷의 몸 칸(걷는 이 · 손 · 밭에 선 농부)을 읽어 그날 최대를 둔다(경계 줄만으론 새벽 몸만 본다)
let DAYMS = 24 * 60 * 1000;
try { DAYMS = require(path.join(SRV, 'zone-config')).WORLD.dayLengthMs || DAYMS; } catch (e) {}
const SAMPLE_MS = DAYMS / 8;
let nextS = null, inDay = null;
const SK = { fish: ['walkers', 'hands', 'handU'], wood: ['walkers', 'hands', 'handU'], forage: ['walkers', 'hands', 'handU'], farm: ['working', 'hands', 'handU'] };
function sampleInDay() {
  try {
    const V = require(path.join(SRV, 'villages'));
    const P = { fish: V.fishPerf && V.fishPerf(), wood: V.woodPerf && V.woodPerf(), forage: V.foragePerf && V.foragePerf(), farm: V.farmPerf && V.farmPerf() };
    inDay = inDay || { n: 0 };
    inDay.n++;
    for (const arm of Object.keys(SK)) { const o = P[arm]; if (!o) continue; const m = inDay[arm] || (inDay[arm] = {}); for (const k of SK[arm]) { const v = +o[k] || 0; if (!(m[k] >= v)) m[k] = +v.toFixed(4); } }
  } catch (e) {}
}
const TICK_MS = 1000 / 30;
{
  const si = global.setInterval;   // (가상 시계가 섰으면 그 줄 · 아니면 Node 그대로)
  global.setInterval = function (fn, ms, ...args) {
    if (typeof fn === 'function' && Math.abs(Number(ms) - TICK_MS) < 1e-9) {
      const st = String(new Error().stack || '').split('\n').find((l) => /server[\/\\]zone\.js:\d+/.test(l)) || '';
      const at = (st.match(/zone\.js:(\d+)/) || [])[1] || '?';
      if (TICK.who == null && at !== '?') {   // zone.js 게임 틱(첫 30Hz 간격) 하나만 잰다
        TICK.who = 'zone.js:' + at;
        const f = fn;
        fn = function () {
          const t0 = realMs();
          try { return f.apply(this, arguments); }
          finally {
            const d = realMs() - t0; addH(TICK.all, d); addH(TICK.day, d); if (inWin) addH(TICK.win, d); if (d > TICK.dayMax) TICK.dayMax = d; TICK.dayN++;
            const Vn = Date.now();   // (가상 시각 — 틱 밖 표본은 실제 시간에 안 든다)
            if (nextS == null) nextS = Vn - (Vn % SAMPLE_MS) + SAMPLE_MS;
            if (Vn >= nextS) { while (nextS <= Vn) nextS += SAMPLE_MS; if (process.env.T805_INDAY !== '0') sampleInDay(); }   // `T805_INDAY=0` = 낮 표본 끔(무해 확인용)
          }
        };
      }
    }
    return si.call(this, fn, ms, ...args);
  };
  try { require('timers').setInterval = global.setInterval; } catch (e) {}
}

// ④ econ 하루 끝 — 팔 넷 · 직업 수 · 몸 지문
const R = (m) => require(path.join(SRV, m));
const pick = (o, ks) => { if (!o) return null; const r = {}; for (const k of ks) if (o[k] !== undefined) r[k] = o[k]; return r; };
const KS = ['on', 'items', 'actVillages', 'villages', 'cells', 'walkers', 'hands', 'handU', 'handKg', 'delivered', 'formulaPerDay', 'formulaAll',
  'formulaAct', 'formulaActPerDay', 'gran', 'cutDay', 'pickDay', 'cap', 'trees', 'groves', 'noTreeVillages', 'noGroveVillages', 'popAll', 'pop',
  'farmers', 'working', 'trips', 'harvestN', 'hlBody', 'hlBatch', 'credUnits', 'credFoodEq', 'pendUnits', 't100K', 't100Eq', 'food', 'foodEq', 'K', 'back', 'reach'];
const rows = [];
let last = -1;
function bodyPrint() {
  try {
    const V = R('villages'), st = V.__t740 ? V.__t740() : (V.__t722 ? V.__t722() : null);
    const pl = st && st.deps && st.deps.players; if (!pl) return null;
    const a = [];
    for (const p of pl.values()) {
      if (!p || !p.isNpc || !p.simVillageId) continue;
      const inv = p.inventory ? Object.keys(p.inventory).sort().filter((k) => p.inventory[k]).map((k) => k + ':' + (+p.inventory[k]).toFixed(4)).join(',') : '';
      a.push(`${p.pid}|${(+p.x).toFixed(2)}|${(+p.y).toFixed(2)}|${(+p.hp || 0).toFixed(3)}|${p.simJob || ''}|${p._lifeAct || ''}|${inv}`);
    }
    a.sort();
    return { n: a.length, h: crypto.createHash('sha1').update(a.join('\n')).digest('hex').slice(0, 12) };
  } catch (e) { return { err: String(e && e.message) }; }
}
const Ev = R('events');
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    const r = sd.apply(this, arguments);
    try {
      const d = day | 0;
      if (d !== last) {
        last = d;
        const V = R('villages');
        const row = { d, wd: world && world.day, V: Date.now(), wall: RDATE.now() - W0,
          fish: pick(V.fishPerf ? V.fishPerf() : null, KS), wood: pick(V.woodPerf ? V.woodPerf() : null, KS),
          forage: pick(V.foragePerf ? V.foragePerf() : null, KS), farm: pick(V.farmPerf ? V.farmPerf() : null, KS) };
        if (row.fish && V.fishPerf) { const fp = V.fishPerf(); if (fp && fp.t340) row.fish.t340 = fp.t340; }
        if (row.farm && row.farm.gran && typeof row.farm.gran === 'object') row.farm.granSum = +Object.values(row.farm.gran).reduce((a, b) => a + (+b || 0), 0).toFixed(3);
        try {
          const E = R(path.join('..', 'sim', 'economy-sim'));
          const J = { farmer: 0, fisher: 0, lumberjack: 0, forager: 0 }; let pop = 0, anchor = 0;
          for (const v of ((world && world.villages) || [])) {
            const c = { farmer: 0, fisher: 0, lumberjack: 0, forager: 0 };
            for (const n of (v.npcs || [])) { pop++; const j = n && n.currentJob; if (j in c) c[j]++; }
            for (const k in c) J[k] += c[k];
            if (E.farmFlowPerDay) anchor += +E.farmFlowPerDay(v, c.farmer) || 0;
          }
          row.econ = { pop, jobs: J, farmAnchor: +anchor.toFixed(3) };
        } catch (e) { row.econErr = String(e && e.message); }
        row.body = bodyPrint();
        //   그날(앞 경계 → 이 경계) 존 틱 — 경계 틱은 이 문 앞에서 이미 끝났다(이 줄은 그 틱 안이다 · 다음 날 칸에 든다)
        row.tick = Object.assign(sumH(TICK.day), { maxTick: +TICK.dayMax.toFixed(3) });
        TICK.day = mkH(); TICK.dayMax = 0; TICK.dayN = 0;
        row.inDay = inDay; inDay = null;
        if (d >= D0 - 1) inWin = true;
        rows.push(row);
      }
    } catch (e) { rows.push({ d: day, err: String(e && e.message) }); }
    return r;
  };
  return L;
};
process.on('exit', () => {
  try {
    const vc = global.__t745 ? global.__t745() : null;
    fs.writeFileSync(OUT, JSON.stringify({ tickWho: TICK.who, tick: sumH(TICK.all), tickWin: sumH(TICK.win), d0: D0, tickOver: TICK.all.over.slice().sort((a, b) => b - a).slice(0, 40),
      wallMs: RDATE.now() - W0, vclock: vc, rows }));
  } catch (e) {}
});
