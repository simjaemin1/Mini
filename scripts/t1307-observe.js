'use strict';
// (@regress 없음 — 러너 밖 · T1307 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1307-observe.js — 몸 세계 · 랩 출생 깊이: 날마다 집 짓기(바람 · 지음 · 목재에 묶임) · 곳간 목재 · 나무꾼 · 주거 문 · 출생 — econ `tickVillage` 곁 ===
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1307-observe.js" node scripts/t577-server-run.js 120 1020   (판 JSON 곁 `<판>-<시드>.t1307.json`)
//   랩 자:      T1307_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1307-observe.js" node scripts/t176-ab.js 120 1020
//   날마다(세계 합 · 마을-날 수):
//     집 — `hWant` 바람 선 마을-날(틱 앞 주거 × (1 − 노후) < 사람 × HOUSE_BUFFER — econ 집 증축 절의 그 문 · 5504행) ·
//          `hBuilt` 지은 마을-날(틱 뒤 주거 > 틱 앞 주거 × (1 − 노후)) · `hCap` 지은 수용력 합 · `hNoWood` 바람이 섰는데 틱 뒤 곳간 목재 < 0.5 인 마을-날(목재에 묶임) ·
//          `hGap` 모자란 집 합(Σ max(0, 사람 × HOUSE_BUFFER − 주거) · 틱 뒤)
//     목재 — `woodSt` 틱 뒤 곳간 목재 · `woodOut` 그날 수식 벌목 몫(`_woodOutLast`) · `woodCons` 어제 쓴 목재(`_consDay.wood` — 땔감 · 집 · 숯가마)
//     사람 — `lumber` 나무꾼 · `farmer` 농부 · `pop` · `born`(틱 앞에 없던 사람) · `gate` 주거 문 마을-날(틱 뒤 사람 ≥ min(주거, 지은 침상)) · `zGate` 출생 0 인 주거 문 마을-날
//     직업 옮김 — `flows` 날마다 {"옛 직업>새 직업": 수}(사람마다 직업 차 · `+>직업` = 그날 새 사람의 첫 직업) ·
//       `needs` 날마다 {모자란 일: 마을-날}(econ `autoSwitchJob` 진단 칸 `v._dbgSwitch.need` · 그날 틱이 적은 마을만 · `hold:` = 차익 문턱에 막혀 안 옮김)
//     몸 세계만(서버 `__t740()` 상태 · 읽기만) — `sSite` 집터가 선 마을-날 · `sNew` 새 집터 · `sDone` 완공 집(명부 `_houseCells` 증분) · `sHouses` 완공 집 합
//   주사위 0 · 캐시 0(곳간 식량 등가 · 시세를 부르지 않는다 — 세계에 아무것도 안 한다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = process.env.T1307_OUT || (SERVER && process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1307.json' : '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const HB = V1.HOUSE_BUFFER, HD = 0.0015;   // HOUSE_DECAY(economy-sim 3076행 — 내보내지 않는 상수 · 값 그대로)
const rec = { cols: ['day', 'vil', 'pop', 'born', 'hWant', 'hBuilt', 'hCap', 'hNoWood', 'hGap', 'woodSt', 'woodOut', 'woodCons', 'lumber', 'farmer', 'gate', 'zGate', 'sSite', 'sNew', 'sDone', 'sHouses'],
  rows: [], flows: [], needs: [], err: null, server: SERVER };
const seen = new WeakSet();
let cur = null, lastWrite = -1;
function flush() { if (cur) { const r = cur; rec.rows.push(rec.cols.map((k) => (typeof r[k] === 'number' ? +r[k].toFixed(3) : r[k]))); rec.flows.push([r.day, r._fl]); rec.needs.push([r.day, r._nd]); } }
const siteSeen = new WeakMap();
const lastJob = new WeakMap(), swSeen = new WeakMap();   // 사람 → 지난 틱 뒤 직업 · 마을 → 센 진단 날   // 서버 마을 → { site, houses }
function serverDay() {
  if (!SERVER) return;
  let st = null;
  try { const m = require.cache[require.resolve(path.join(ROOT, 'server', 'villages'))]; st = m && m.exports && m.exports.__t740 ? m.exports.__t740() : null; } catch (e) { st = null; }
  if (!st || !st.villages) return;
  for (const vil of st.villages) {
    const nH = vil._houseCells ? vil._houseCells.length : 0;
    const L = siteSeen.get(vil);
    if (vil._site) { cur.sSite++; if (!L || L.site !== vil._site) cur.sNew++; }
    if (L && nH > L.houses) cur.sDone += nH - L.houses;
    cur.sHouses += nH;
    siteSeen.set(vil, { site: vil._site || null, houses: nH });
  }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  let pre = null;
  try {
    if (!cur || cur.day !== day) {
      flush();
      cur = { day, _fl: {}, _nd: {} }; for (const k of rec.cols) if (k !== 'day') cur[k] = 0;
      try { serverDay(); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
      if (day % 10 === 0 && day !== lastWrite) { lastWrite = day; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
    }
    for (const n of (v.npcs || [])) seen.add(n);
    pre = { h: v.housing, N: (v.npcs || []).length, cw: (v._consDay && v._consDay.wood) || 0 };
    for (const n of (v.npcs || [])) { const j0 = lastJob.get(n); if (j0 !== undefined && j0 !== n.currentJob) { const k = j0 + '>' + n.currentJob; cur._fl[k] = (cur._fl[k] || 0) + 1; } lastJob.set(n, n.currentJob); }   // 옮김 = 사람마다 직업 차(지난 틱 뒤 ~ 이 틱 앞 · 아래 틱 안) · 진단 칸 `did` 는 옮긴 뒤 직업을 적어 못 쓴다
    const sw = v._dbgSwitch;   // econ 진단 칸(읽기만) — 지난 세계 틱이 이 마을에 적은 것(한 번만 센다)
    if (sw && sw.day != null && swSeen.get(v) !== sw.day) {
      swSeen.set(v, sw.day);
      const nd = sw.need || '-'; cur._nd[nd] = (cur._nd[nd] || 0) + 1;
      if (sw.did && /^hold/.test(sw.did)) cur._nd['hold:' + nd] = (cur._nd['hold:' + nd] || 0) + 1;
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  const ret = _t.apply(this, arguments);
  try {
    if (!pre) return ret;
    const N = (v.npcs || []).length, c = cur;
    let born = 0; for (const n of (v.npcs || [])) if (!seen.has(n)) { born++; seen.add(n); const k = '+>' + (n.currentJob || '-'); c._fl[k] = (c._fl[k] || 0) + 1; }   // 새 사람의 첫 직업(`+>직업`)
    if (N > 0) c.vil++;
    c.pop += N; c.born += born;
    const h0 = pre.h !== undefined ? pre.h * (1 - HD) : undefined;
    const want = h0 !== undefined && h0 < pre.N * HB;
    if (want) { c.hWant++; if (((v.storage && v.storage.wood) || 0) < 0.5) c.hNoWood++; }
    if (h0 !== undefined && v.housing > h0 + 1e-9) { c.hBuilt++; c.hCap += v.housing - h0; }
    if (v.housing !== undefined) c.hGap += Math.max(0, N * HB - v.housing);
    c.woodSt += (v.storage && v.storage.wood) || 0; c.woodOut += +v._woodOutLast || 0; c.woodCons += pre.cw;
    c.lumber += (v.counts && v.counts.lumberjack) | 0; c.farmer += (v.counts && v.counts.farmer) | 0;
    const cap = Math.min(v.housing !== undefined ? v.housing : Infinity, v._mapBeds !== undefined ? v._mapBeds : Infinity);
    if (N > 0 && N >= cap) { c.gate++; if (born === 0) c.zGate++; }
    for (const n of (v.npcs || [])) { const j0 = lastJob.get(n); if (j0 !== undefined && j0 !== n.currentJob) { const k = j0 + '>' + n.currentJob; c._fl[k] = (c._fl[k] || 0) + 1; } lastJob.set(n, n.currentJob); }   // 틱 안 옮김(autoSwitchJob 은 틱 안에서 돈다)
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return ret;
};
process.on('exit', () => { try { flush(); cur = null; fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
