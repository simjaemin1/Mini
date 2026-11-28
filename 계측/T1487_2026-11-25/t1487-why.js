'use strict';
// === 계측/T1487_2026-11-25/t1487-why.js — 나무꾼 몸이 '휴식'으로 돌아간 까닭 관찰기(읽기만 · 세계 무변 · 제품 코드 손 0) ===
//   쓰는 법: T1487_WHY=<폴더> T1487_ARM=<팔> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   t1487-observe.js 와 같은 걸개(로드 시 소스 끝 덧붙임)로 안쪽 함수 `_t374Done` · `_t1422Side` · `_t561Standing` · `_lifeGoHome` 을
//   **부른 뒤 결과를 읽기만 하는 껍질**로 바꾼다(인자 · 결과 그대로). 몸 하루마다 '휴식' 까닭(몫 참 · 반일 · 목록 빔 · 선 그루 없음)을 적고,
//   몫 참 순간의 수요 D · 오늘 든 양 · 손 · 남은 수요, 그날 일괄 계측 칸(`vil._t325Dbg`), 몸 손의 목재 늘어남(벤 양)을 적는다.
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1487_WHY; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const ARM = process.env.T1487_ARM || 'x', SEED = process.env.T577_SEED;
const OUT = path.join(DIR, `why-${ARM}-${SEED}.json`);
const Module = require('module');
const SNIP = `
;(function(){ var H = global.__T1487W; if (!H) return; try {
  var a1 = _t374Done; _t374Done = function(vil, job){ var r = a1.apply(this, arguments); try { if (r && job === 'lumberjack') H.done(vil); } catch (e) { H.err(e); } return r; };
  var a2 = _t1422Side; _t1422Side = function(vil, npc, now, why){ var r = a2.apply(this, arguments); try { H.side(npc, why, r); } catch (e) { H.err(e); } return r; };
  var a3 = _t561Standing; _t561Standing = function(){ var r = a3.apply(this, arguments); try { H.stand(r); } catch (e) { H.err(e); } return r; };
  var a4 = _lifeGoHome; _lifeGoHome = function(npc, act){ try { H.home(npc, act); } catch (e) { H.err(e); } return a4.apply(this, arguments); };
  H.int = { held: function(vil){ return _t374Held(vil, _T374_WOOD); }, E: _lifeEcon, flags: { T374: !!_lifeEcon().T374_DEMAND_STOP, T1422: !!_T1422_K, T561R: !!T561_ROSTER_BODY, T1202: !!T1202_BATCH, T720: !!T720_LON_DAY, T717: !!T717_WOOD_HAND } };
} catch (e) { H.err(e); } })();
`;
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (typeof filename === 'string' && /server[\/\\]villages\.js$/.test(filename)) { arguments[0] = content + '\n' + SNIP; global.__T1487W_HOOKED = 1; }
  return _compile.apply(this, arguments);
};
const rec = { seed: +SEED, arm: ARM, lastDay: 0, err: null, flags: null, hooked: 0,
  // 행 = [날, 마을, 몸날, 벰, 나섬, 몫, 반일, 목록빔, 선그루없음, 밤만, 그밖, 낮틱있음, 몸 벤 양, econ 나무꾼, 일괄 walked, 일괄 ln, 일괄 cut, 일괄 stop, 일괄 cap, 일괄 머리 dem, D, 든양, 손, 몫 참 낮몫]
  cols: ['d', 'v', 'bd', 'cut', 'out', 'quota', 'half', 'none', 'stand0', 'night', 'other', 'dayTick', 'cutU', 'ljE', 'walked', 'ln', 'bcut', 'stop', 'cap', 'dem', 'D', 'inflow', 'held', 'fv'],
  rows: [], gates: {}, standN: 0, standNull: 0 };
let cur = null, last = -1, VIL = null, ST = null;
const bodies = new Map(), vday = new Map();
global.__T1487W = {
  err: (e) => { rec.err = rec.err || ('hook ' + String(e && e.stack || e).slice(0, 300)); }, int: null,
  done: (vil) => { if (!cur || cur.vil !== vil) return; cur.gate = cur.gate || 'quota';
    const V = vday.get(vil.name); if (V && V.D == null) { try { const E = global.__T1487W.int.E(), e = vil.econ; V.D = E.woodShareD(e); V.inflow = e._t325InflowToday || 0; V.held = global.__T1487W.int.held(vil); V.fv = cur.fv; } catch (x) { rec.err = rec.err || String(x).slice(0, 200); } } },
  side: (npc, why, r) => { if (cur && cur.npc === npc) { cur.gate = cur.gate || why; rec.gates['side:' + why + ':' + (r ? 1 : 0)] = (rec.gates['side:' + why + ':' + (r ? 1 : 0)] || 0) + 1; } },
  stand: (r) => { rec.standN++; if (!r) { rec.standNull++; if (cur) cur.gate = 'stand0'; } },
  home: (npc, act) => { if (!cur || cur.npc !== npc || act !== '휴식') return; const g = cur.gate || 'other'; cur.rest = g; rec.gates['rest:' + g] = (rec.gates['rest:' + g] || 0) + 1; },
};
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
function wrapLife() {
  if (VIL) return;
  try {
    VIL = require(path.join(ROOT, 'server', 'villages')); ST = VIL.__t1461 && VIL.__t1461.st();
    rec.hooked = global.__T1487W_HOOKED | 0; rec.flags = global.__T1487W.int && global.__T1487W.int.flags;
    const orig = VIL.npcLifeTick;
    VIL.npcLifeTick = function (npc, now) {
      const job = npc && npc.simJob;
      if (job !== 'lumberjack') return orig.apply(this, arguments);
      const vil = ST && ST.byDbId && ST.byDbId.get(npc.simVillageId);
      const w0 = (npc.inventory && npc.inventory.wood) || 0;
      let fv = null; try { const wp = ST.deps && ST.deps.worldPhase; fv = wp ? wp(now) : null; } catch (e) {}
      cur = { npc, vil, gate: null, rest: null, fv };
      if (vil && !vday.has(vil.name)) { const g = vil._t325Dbg || {}; vday.set(vil.name, { ljE: (vil.econ && vil.econ.counts && vil.econ.counts.lumberjack) || 0, walked: g.walked, ln: g.ln, bcut: g.cut, stop: g.stop, cap: g.cap, dem: g.dem, D: null }); }
      let r;
      try { r = orig.apply(this, arguments); } finally {
        try {
          if (vil) {
            let b = bodies.get(npc.pid);
            if (!b) { b = { v: vil.name, cut: 0, out: 0, rest: {}, day: 0, night: 0, cutU: 0 }; bodies.set(npc.pid, b); }
            const L = npc._lifeAct || '';
            if (L === '벌목') b.cut = 1; if (L === '출근') b.out = 1;
            if (L === '취침' || L === '귀가') b.night++; else b.day++;
            if (cur.rest) b.rest[cur.rest] = 1;
            const w1 = (npc.inventory && npc.inventory.wood) || 0; if (w1 > w0) b.cutU += w1 - w0;
          }
        } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 300); }
        cur = null;
      }
      return r;
    };
  } catch (e) { rec.err = rec.err || ('wrap ' + String(e && e.stack || e).slice(0, 300)); }
}
function daily(day) {
  const agg = new Map();
  for (const b of bodies.values()) {
    let a = agg.get(b.v); if (!a) agg.set(b.v, a = { bd: 0, cut: 0, out: 0, quota: 0, half: 0, none: 0, stand0: 0, night: 0, other: 0, dayTick: 0, cutU: 0 });
    a.bd++; a.cutU += b.cutU; if (b.day) a.dayTick++;
    if (b.cut) a.cut++; else if (b.out) a.out++;
    else if (b.rest.quota) a.quota++; else if (b.rest.half) a.half++; else if (b.rest.none) a.none++; else if (b.rest.stand0) a.stand0++;
    else if (!b.day) a.night++; else a.other++;
  }
  for (const [v, a] of agg) {
    const V = vday.get(v) || {};
    const r6 = (x) => (x == null || !isFinite(x)) ? (x === Infinity ? -1 : null) : +(+x).toFixed(4);
    rec.rows.push([day, v, a.bd, a.cut, a.out, a.quota, a.half, a.none, a.stand0, a.night, a.other, a.dayTick, r6(a.cutU), V.ljE, V.walked, V.ln, V.bcut, V.stop, r6(V.cap), r6(V.dem), r6(V.D), r6(V.inflow), r6(V.held), r6(V.fv)]);
  }
  bodies.clear(); vday.clear();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  wrapLife();
  if (day !== last) { if (last > 0) { try { daily(last); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 300); } if (last % 10 === 0) write(); } last = day; rec.lastDay = day; }
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0) { try { daily(last); } catch (e) {} } write(); });
