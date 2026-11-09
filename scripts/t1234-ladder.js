'use strict';
// (@regress 없음 — 러너 밖 · T1234 표 짜개 · 제품 무변 · 읽기만)
// === scripts/t1234-ladder.js — 밭 세계 사다리 판마다 한 줄: 인구 · 굶음 · 밭 · 일감 · 주거 문 · 나무꾼 · 시세 ===========
//   쓰는 법: node scripts/t1234-ladder.js <판 JSON 폴더> 판1 판2 … [--seed 1020]
//   읽는 것: `<판>-<시드>.json`(t577 판) · `.fd-deaths.json`(빚 죽음 = 굶음) · `.t1221.json`(밭 칸 · 사람-날 · 밭 식량 · 몸 일괄 일감) · `.t1230.json`(날마다 세계 합)
//   주거 문 날 = 주거 문(`_dpDebug.gated`)이 선 마을-날 ÷ 사람 있는 마을-날 · 침상 모자람 = Σ max(0, 사람 − min(주거, 지도 침상)) 의 마지막 100날 평균
//   시세 = 사람 가중 그림자 값(그날 세계 공급 캐시가 선 마을만) — 마지막 100날 · 나무꾼 / 농부 몫 = 400날 직업 합 ÷ 인구
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2); const DIR = args.shift();
let SEED = 1020; const si = args.indexOf('--seed'); if (si >= 0) { SEED = +args[si + 1]; args.splice(si, 2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } };
const out = [];
for (const arm of args) {
  const J = rd(`${arm}-${SEED}.json`), FD = rd(`${arm}-${SEED}.fd-deaths.json`), A = rd(`${arm}-${SEED}.t1221.json`), T = rd(`${arm}-${SEED}.t1230.json`);
  if (!T) { out.push({ arm, missing: true }); continue; }
  const C = T.cols, ix = (k) => C.indexOf(k), R = T.rows;
  const at = (d) => { const r = R.find((x) => x[0] === d) || R[R.length - 1]; return r ? r[ix('pop')] : null; };
  const last = R[R.length - 1][0], win = R.filter((r) => r[0] > last - 100);
  const S = (rows, k) => rows.reduce((a, r) => a + (+r[ix(k)] || 0), 0);
  const vd = S(R, 'vil'), pd = S(R, 'pop');
  const jobs = T.jobs.length ? T.jobs[T.jobs.length - 1][1] : {};
  const popEnd = R[R.length - 1][ix('pop')];
  const pxPop = S(win, 'pxPop');
  let farm = null, ff = 0, apd = 0, rest = null;
  if (A && A.shots.length) { const s = A.shots[A.shots.length - 1]; farm = s.vs.reduce((a, v) => a + v.farm, 0); for (const v of s.vs) { ff += v.ff; } rest = s.rest; }
  if (A) for (const k of Object.keys(A.acc)) apd += A.acc[k].pd;
  out.push({ arm, days: last,
    p100: at(100), p200: at(200), p300: at(300), p400: popEnd,
    born: S(R, 'born'), dead: S(R, 'dead'), emig: S(R, 'emig'), starve: FD ? FD.fdDeadTot : null, empty: J ? J.empty : null,
    farm, fieldCov: apd ? +(ff / apd).toFixed(3) : null, floorCov: pd ? +(S(R, 'floor') / pd).toFixed(3) : null,
    batchTasks: rest ? rest.batchTasks : null, batchClear: rest ? rest.batchClear : null,
    gateDays: vd ? +(S(R, 'gHouse') / vd).toFixed(3) : null, zHouse: (() => { const z = S(R, 'zHouse') + S(R, 'zGran') + S(R, 'zK') + S(R, 'zH') + S(R, 'zOther'); return z ? +(S(R, 'zHouse') / z).toFixed(3) : null; })(),
    houseDef: win.length ? +(S(win, 'houseDef') / win.length).toFixed(1) : null,
    lumber: jobs.lumberjack | 0, farmer: jobs.farmer | 0, lumberShare: popEnd ? +((jobs.lumberjack | 0) / popEnd * 100).toFixed(1) : null, farmerShare: popEnd ? +((jobs.farmer | 0) / popEnd * 100).toFixed(1) : null,
    pxWood: pxPop ? +(S(win, 'pxWoodW') / pxPop).toFixed(1) : null, pxFood: pxPop ? +(S(win, 'pxFoodW') / pxPop).toFixed(1) : null,
    woodPerHead: win.length ? +(S(win, 'woodSt') / S(win, 'pop')).toFixed(2) : null,
    h: pd ? +(S(R, 'hW') / pd).toFixed(3) : null, err: T.err });
}
for (const o of out) if (o.pxWood && o.pxFood) o.ratio = +(o.pxWood / o.pxFood).toFixed(2);
console.log(JSON.stringify(out, null, 1));
