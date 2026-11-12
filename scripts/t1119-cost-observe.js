'use strict';
// (@regress 없음 — 러너 밖 · T1119 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1119-cost-observe.js — 존 30Hz 게임 틱 본문 길이(평균 · p99) · 몸 수 · 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1119-cost-observe.js …" [VILLAGE_NPC_CAP=Infinity] node scripts/t577-server-run.js 800 1020,7,42
//            (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1119.json` · 표는 `scripts/t1119-table.js`)
//   뜨는 것(읽기만 — 새 수 0):
//     ⓐ zone.js 게임 틱(`setInterval(…, TICK_MS)` — 첫 1000/30 간격 하나 · T805 몸 길 자 ③ 그 꼴)의 본문 실제 소요 → 0.01 ms 칸 히스토그램 → 평균 · p50 · p99 · 최대.
//     ⓑ econ 하루 끝(`scanDay`)마다 몸 수 — 호스트 `players` 의 NPC 몸 전부 · 그중 누운 몸(`isDown`) · 마을 몸(`simVillageId`) · 도적 몸(`_bdtGid`) → 평균 · 최대 · 끝 날.
//   ⚠값을 안 바꾼다: 틱 감싸개는 원 함수를 같은 인자로 부르고 그 돌려줌을 그대로 돌려준다 · 하루 줄은 원 `scanDay` 를 먼저 부른 뒤 읽기만.
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1119.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const hr = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
const BIN = 0.01, NB = 50000;
const H = { h: new Uint32Array(NB), over: [], n: 0, sum: 0, max: 0 };
const addH = (ms) => { H.n++; H.sum += ms; if (ms > H.max) H.max = ms; const b = Math.floor(ms / BIN); if (b < NB) H.h[b]++; else H.over.push(+ms.toFixed(3)); };
function qH(p) {
  if (!H.n) return null;
  const k = Math.min(H.n - 1, Math.floor(H.n * p));
  let c = 0;
  for (let b = 0; b < NB; b++) { c += H.h[b]; if (c > k) return +((b + 0.5) * BIN).toFixed(3); }
  const o = H.over.slice().sort((a, b) => a - b); return o[Math.min(o.length - 1, k - c)];
}
const rec = { ver: 1, knob: Object.fromEntries(['T1078_BANDIT_ALL', 'T1079_BANDIT_CAMP', 'T1104_BANDIT_WALK', 'VILLAGE_NPC_CAP', 'VILLAGE_DAY_MS'].map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  who: null, tick: null, days: 0, body: { sum: 0, max: 0, end: null, sumDown: 0, sumVil: 0, sumBdt: 0, maxBdt: 0, rows: [] }, errs: [] };
const err = (where, e) => { if (rec.errs.length < 40) rec.errs.push(where + ': ' + String(e && e.message || e)); };
// ⓐ 게임 틱
{
  const si = global.setInterval;
  global.setInterval = function (fn, ms, ...args) {
    if (rec.who == null && typeof fn === 'function' && Math.abs(Number(ms) - 1000 / 30) < 1e-9) {
      const st = String(new Error().stack || '').split('\n').find((l) => /server[\/\\]zone\.js:\d+/.test(l)) || '';
      const at = (st.match(/zone\.js:(\d+)/) || [])[1];
      if (at) {
        rec.who = 'zone.js:' + at;
        const f = fn;
        fn = function () { const t0 = hr(); try { return f.apply(this, arguments); } finally { addH(hr() - t0); } };
      }
    }
    return si.call(this, fn, ms, ...args);
  };
  try { require('timers').setInterval = global.setInterval; } catch (e) {}
}
// ⓑ 하루 끝 몸 수
const Ev = require(path.join(ROOT, 'server', 'events'));
let VL = null, last = -1;
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
        if (!VL) VL = require(path.join(ROOT, 'server', 'villages'));
        const host = VL.banditHost && VL.banditHost(); const P = host && host.players;
        if (P) {
          let n = 0, down = 0, vil = 0, bdt = 0;
          for (const p of P.values()) { if (!p || !p.isNpc) continue; n++; if (p.isDown) down++; if (p.simVillageId) vil++; if (p._bdtGid != null) bdt++; }
          const b = rec.body; rec.days++;
          b.sum += n; b.max = Math.max(b.max, n); b.end = n; b.sumDown += down; b.sumVil += vil; b.sumBdt += bdt; b.maxBdt = Math.max(b.maxBdt, bdt);
          if (d % 100 === 0 && b.rows.length < 20) b.rows.push({ day: d, n, down, vil, bdt });
        }
      }
    } catch (e) { err('day', e); }
    return r;
  };
  return L;
};
process.on('exit', () => {
  try {
    rec.tick = H.n ? { n: H.n, mean: +(H.sum / H.n).toFixed(4), p50: qH(0.5), p99: qH(0.99), max: +H.max.toFixed(3), sumMs: +H.sum.toFixed(1) } : { n: 0 };
    const b = rec.body, D = rec.days || 1;
    rec.bodyMean = +(b.sum / D).toFixed(2); rec.downMean = +(b.sumDown / D).toFixed(2); rec.vilMean = +(b.sumVil / D).toFixed(2); rec.bdtMean = +(b.sumBdt / D).toFixed(2);
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify(Object.assign(rec, { exitErr: String(e && e.stack) }))); } catch (e2) {} }
});
