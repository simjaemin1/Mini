'use strict';
// (@regress 없음 — 러너 밖 · T1325 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1325-observe.js — 몸 : 랩 직업 고르기 입력 날 줄(T1315 회부 1 · 몸 나무꾼 → 농부 2.2배) — econ `tickVillage` 곁 ===
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1325-observe.js" node scripts/t1308-long-run.js 120 1020 …   (판 JSON 곁 `<판>-<시드>.t1325.json`)
//   랩 자:      T1325_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1325-observe.js" T1243_FARM_ON=1 node scripts/t176-ab.js 120 1020
//   날마다(세계 합 · 마을-날 수 · 틱 앞 = 지난 틱 뒤 곳간):
//     식량 문 — `econ` 직업 옮김 빈도를 정하는 그 자(`tickVillage` 7절 · `totalFoodEquivalent(v)` 대 사람 × 10 · × 30):
//       `r10` 진짜 기근(하루 2명 · 매일) · `r30` 식량 부족(10날 1명 · 피커 기근 문 6606행이 식량 넷만 낸다) · `rOk` 넉넉(7날 1명)
//       `r10n` · `r30n` — 같은 자에서 **로트 상한 몫을 빼지 않은 값**(`storageFoodEquivalent(v, storage, false)` · 랩 = 같은 값)
//       `fd` 곳간 식량 일치(Σ 식량 등가 ÷ Σ 사람) · `fdN` 상한 몫 안 뺀 일치 · `spoil` Σ(안 뺀 − 뺀)
//     옮김 — `swIn` 틱 안 직업 차(econ 문 — 자율 전환 · 출생 첫 직업 제외) · `swOut` 틱 사이 직업 차(서버 문 — 촌장 지정 · 몸 문)
//       `sw10` · `sw30` · `swOk` 틱 안 옮김을 그 마을 틱 앞 식량 문으로 가른 것 · `lj2f` 틱 안 나무꾼 → 농부
//     목재 — `woodOut` 수식 벌목(`_woodOutLast`) · `lumber` 나무꾼 · `woodSt` 틱 뒤 곳간 목재 · `wood0` 곳간 목재 < 1 인 마을-날
//     식량 — `sEma` 식량 잉여 EMA 합(`v.surplusEMA.food` — 그날 생산 − 수요의 0.05 EMA) · `farmer` 농부
//   주사위 0 · 캐시 0 · 세계에 아무것도 안 쓴다(곳간 · 로트 장부 읽기만).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = process.env.T1325_OUT || (SERVER && process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1325.json' : '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const COLS = ['day', 'vil', 'pop', 'r10', 'r30', 'rOk', 'r10n', 'r30n', 'fd', 'fdN', 'spoil', 'swIn', 'swOut', 'sw10', 'sw30', 'swOk', 'lj2f', 'woodOut', 'lumber', 'woodSt', 'wood0', 'sEma', 'farmer'];
const rec = { cols: COLS, rows: [], err: null, server: SERVER };
let cur = null, lastWrite = -1;
const sumF = { f: 0, fn: 0, n: 0 };
function flush() {
  if (!cur) return;
  cur.fd = sumF.n ? sumF.f / sumF.n : 0; cur.fdN = sumF.n ? sumF.fn / sumF.n : 0;
  rec.rows.push(COLS.map((k) => (typeof cur[k] === 'number' ? +cur[k].toFixed(3) : cur[k])));
}
const lastJob = new WeakMap();
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  let pre = null;
  try {
    if (!cur || cur.day !== day) {
      flush();
      cur = { day }; for (const k of COLS) if (k !== 'day') cur[k] = 0; sumF.f = sumF.fn = sumF.n = 0;
      if (day % 10 === 0 && day !== lastWrite) { lastWrite = day; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
    }
    const N = (v.npcs || []).length;
    const f = V1.totalFoodEquivalent(v);
    const fn = V1.storageFoodEquivalent ? (process.env.T1243_FARM_ON === '1' ? V1.storageFoodEquivalent(v, v.storage, false) : f) : f;
    const reg = f < N * 10 ? 'r10' : f < N * 30 ? 'r30' : 'rOk';
    cur[reg]++; if (fn < N * 10) cur.r10n++; else if (fn < N * 30) cur.r30n++;
    sumF.f += f; sumF.fn += fn; sumF.n += N; cur.spoil += Math.max(0, fn - f);
    const jobs = new Map();
    for (const n of (v.npcs || [])) { const j0 = lastJob.get(n); if (j0 !== undefined && j0 !== n.currentJob) cur.swOut++; jobs.set(n, n.currentJob); }
    pre = { reg, jobs };
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  const r = _t.apply(this, arguments);
  try {
    if (pre) {
      cur.vil++;
      const npcs = v.npcs || [];
      cur.pop += npcs.length;
      for (const n of npcs) {
        const j0 = pre.jobs.get(n);
        if (j0 !== undefined && j0 !== n.currentJob) {
          cur.swIn++; cur[pre.reg === 'r10' ? 'sw10' : pre.reg === 'r30' ? 'sw30' : 'swOk']++;
          if (j0 === 'lumberjack' && n.currentJob === 'farmer') cur.lj2f++;
        }
        lastJob.set(n, n.currentJob);
        if (n.currentJob === 'lumberjack') cur.lumber++; else if (n.currentJob === 'farmer') cur.farmer++;
      }
      cur.woodOut += v._woodOutLast || 0;
      const w = (v.storage && v.storage.wood) || 0; cur.woodSt += w; if (w < 1) cur.wood0++;
      cur.sEma += (v.surplusEMA && v.surplusEMA.food) || 0;
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { try { flush(); cur = null; fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
