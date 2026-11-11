'use strict';
// (@regress 없음 — 러너 밖 · T1251 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1251-observe.js — 나무꾼 몸 행위 판: 날마다 세계 합(목재 길) — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===============
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1251-observe.js" node scripts/t577-server-run.js 100 1020   (판 JSON 곁 `<판>-<시드>.t1251.json`)
//   날마다(econ `tickVillage` 마을마다 · 틱 머리에서 읽는다):
//     몸이 들여온 목재(`_t325InflowToday` — 생활층 귀환이 틱 사이에 적고 틱이 장부로 옮기며 비운다 · 틱 머리 값 = 그 사이 몸 몫) ·
//     벤 횟수(`_t325CutN` — 곳간에 든 귀환 건수 누계의 차 · 마을마다 틱 머리끼리) · econ 식 몫(`_woodOutLast` — 나무꾼 × base × land.wood × 도구 · 끔 판에선 이것이 곳간에 드는 양) ·
//     행위 마을 수(`woodActOn`) · 나무 칸 있는 마을(`_t325Cells > 0`) · 곳간 목재 · 나무꾼 · 주거 · 사람
//   10날마다: 선 나무(`woodPerf` — 아래) · 직업 합 · 영토 넓히기 누계(T1207 — 넓히려 한 날 · 통나무 막힘 · 몸 막힘 · 선 칸)
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1251.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { cols: ['day', 'pop', 'vils', 'bodyWood', 'cutN', 'woodD', 'actVils', 'treeVils', 'woodSt', 'lumber', 'housing'], rows: [], ten: [], err: null };
let cur = null, lastWrite = -1;
const lastCut = new WeakMap();
function flush() { if (cur) rec.rows.push(rec.cols.map((k) => (typeof cur[k] === 'number' ? +cur[k].toFixed(3) : cur[k]))); }
//   ★선 나무 = 생활층 관측 창구 `woodPerf()`(`/perf` 가 내주는 그것 — 행위 마을 · 나무 칸 · 선 그루 · K · 되살아난 그루 누계 · 걸음 한도 · 그날 벤 수 · 손 짐).
//     헤드리스 존은 활성 청크가 없어 존 자원표(`resources`)가 비어 있다(첫 판에서 0 — 그래서 이 창구를 읽는다). 끔 판 = null.
function trees() {
  try {
    const VIL = require(path.join(ROOT, 'server', 'villages'));
    const w = VIL.woodPerf ? VIL.woodPerf() : null;
    if (!w) return null;
    const o = {}; for (const k of Object.keys(w)) if (k !== 'rows' && k !== 'thin') o[k] = w[k];
    o.vil = (w.rows || []).map((r) => [r.n, r.trees, r.K, r.back, r.lj, r.cut, r.pop, r.dbg ? r.dbg.walked : null, r.dbg ? r.dbg.cap : null, r.dbg ? r.dbg.dem : null]);
    return o;
  } catch (e) { return { err: String(e && e.message).slice(0, 120) }; }
}
//   영토 넓히기(T1207 켬 판만) — 마을마다 `vil._t1207`(생활층 · 넓히려 한 날 · 통나무 막힘 · 몸 막힘 · 선 칸)의 세계 합
function terr() {
  try {
    const VIL = require(path.join(ROOT, 'server', 'villages'));
    const P = VIL.__labProbe._t569Probe.setup(); const o = { days: 0, stallWood: 0, stallBody: 0, cells: 0, wood: 0, woodIn: 0 };
    for (const vil of (P.villages || [])) { const T = vil._t1207; if (!T) continue; for (const k of Object.keys(o)) o[k] += +T[k] || 0; }
    return o;
  } catch (e) { return { err: String(e && e.message).slice(0, 120) }; }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    if (!cur || cur.day !== day) {
      flush(); cur = { day }; for (const k of rec.cols) if (k !== 'day') cur[k] = 0;
      if (day % 10 === 0 && v._world && v._world.villages) {
        const j = {}; for (const w of v._world.villages) for (const k of Object.keys(w.counts || {})) j[k] = (j[k] || 0) + (w.counts[k] | 0);
        rec.ten.push({ day, jobs: j, trees: trees(), terr: terr() });
      }
      if (day % 10 === 0 && day !== lastWrite) { lastWrite = day; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
    }
    const N = (v.npcs || []).length;
    if (N > 0) cur.vils++;
    cur.pop += N;
    cur.bodyWood += +v._t325InflowToday || 0;
    const c0 = +v._t325CutN || 0, L = lastCut.get(v); if (L !== undefined) cur.cutN += c0 - L; lastCut.set(v, c0);
    cur.woodD += +v._woodOutLast || 0;
    if (V1.woodActOn && V1.woodActOn(v)) cur.actVils++;
    if ((v._t325Cells | 0) > 0) cur.treeVils++;
    cur.woodSt += (v.storage && v.storage.wood) || 0;
    cur.lumber += (v.counts && v.counts.lumberjack) | 0;
    cur.housing += +v.housing || 0;
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { flush(); cur = null; fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
