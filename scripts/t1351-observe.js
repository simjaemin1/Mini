'use strict';
// (@regress 없음 — 러너 밖 · T1351 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1351-observe.js — 집 · 광부 · 여름 틈 날 줄(몸 세계 ↔ 판 시계 같은 자) ===========================
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1351-observe.js" node scripts/t577-server-run.js <날> <시드>   (판 JSON 곁 `<판>-<시드>.t1351.json`)
//   `T1351_OUT=<파일>` 이면 그 자리.
//   날마다(세계 합 · econ 마을 틱 뒤에 읽는다 — t1276 관찰기와 같은 걸이):
//     인구 · 지은 움집(Σ `_houseCells`) · 선 집터 · 크루 하루(`_t400Dbg` — 크루 · 왕복 · 꺼낸 자재 · 단계 전진 · 멈춤) ·
//     광부 몸이 곳간에 넣은 kg(그날 · `mineToGranary` 받은 몫) · 그 입구 부름 수 · 곳간 식량 환산 · 굶어 죽음 · 늙어 죽음 누계 · 사람당 식량
//   회계 0 — 함수를 감싸 받은 몫만 센다(돌려주는 값 그대로).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = !SERVER ? '' : (process.env.T1351_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1351.json' : ''));   // 존(아이)만 — 판 자(부모)는 안 적는다(같은 파일을 빈 줄로 덮지 않게)
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
//   광부 몸 kg(`_probe.t724` — 몸이 친 kg · 친 횟수)은 생활층 계측 칸이라 내보낸 문이 없다 — villages.js 를 **메모리에서만** 한 줄 덧대 읽는다(t1295-probe 와 같은 길 · 제품 무변).
{ const Module = require('module'), _comp = Module.prototype._compile, VS = path.join(ROOT, 'server', 'villages.js');
  Module.prototype._compile = function (c, f) { if (f === VS) c += '\nmodule.exports.__t1351Probe = () => (typeof _probe !== "undefined" && _probe) || null;\n'; return _comp.call(this, c, f); }; }
const E = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { cols: ['day', 'pop', 'vils', 'houses', 'sites', 'crew', 'trips', 'took', 'adv', 'stall', 'mineKg', 'mineN', 'bodyKg', 'bodySw', 'tfe', 'fdDead', 'natDead', 'foodPP', 'full', 'terr', 'oreD', 'oreIn', 'miners'], rows: [] };
const FD = new WeakMap();   // 마을별 지난 굶어 죽음 누계(관찰기 칸 — 마을 객체에 안 쓴다)
let cur = null, curDay = -1, mineKg = 0, mineN = 0, V = null, B = null;
const _m = E.mineToGranary;
if (typeof _m === 'function') E.mineToGranary = function () { const g = _m.apply(this, arguments); if (typeof g === 'number' && g > 0) { mineKg += g; mineN++; } return g; };
function srv() { if (B) return B; try { V = require(path.join(ROOT, 'server', 'villages')); B = V.__p3Bind ? V.__p3Bind({}) : null; } catch (e) { B = null; } return B; }
function flush() {
  if (!cur) return;
  const b = srv();
  if (b && b.state && b.state.villages) for (const vil of b.state.villages) {
    if (!vil.econ || !(vil.econ.npcs || []).length) continue;
    cur.houses = (cur.houses || 0) + ((vil._houseCells || []).length);
    if (vil._site) cur.sites = (cur.sites || 0) + 1;
    if (vil.econ.npcs.length >= ((vil._houseCells || []).length * 6)) cur.full = (cur.full || 0) + 1;   // 지은 침상(움집 6)이 찬 마을 수
    cur.terr = (cur.terr || 0) + (vil._terrSet ? vil._terrSet.size : 0);   // 영토 칸(집터 · 밭이 설 땅)
    const d = vil._t400Dbg; if (d) { cur.crew = (cur.crew || 0) + (d.crew || 0); cur.trips = (cur.trips || 0) + (d.trips || 0); cur.took = (cur.took || 0) + (d.took || 0); cur.adv = (cur.adv || 0) + (d.adv || 0); cur.stall = (cur.stall || 0) + (d.stall || 0); }
  }
  cur.mineKg = mineKg; cur.mineN = mineN; mineKg = 0; mineN = 0;
  try { const P = V && V.__t1351Probe && V.__t1351Probe(); const t = P && P.t724; if (t) { cur.bodyKg = t.kg || 0; cur.bodySw = t.sw || 0; } } catch (_) {}   // 누계(몸이 친 kg · 친 횟수)
  cur.foodPP = cur.pop > 0 ? cur.tfe / cur.pop : 0;
  rec.rows.push(rec.cols.map((c) => c === 'day' ? curDay : +(+(cur[c] || 0)).toFixed(3)));
  if (curDay % 5 === 0) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {}
}
const _t = E.tickVillage;
E.tickVillage = function (v, day) {
  const _in0 = v ? (v._t724InflowToday || 0) : 0;   // 틱이 장부로 옮기고 비우기 전 — 그날 곳간에 든 원석 단위
  const r = _t.apply(this, arguments);
  try {
    if (day !== curDay) { flush(); cur = {}; curDay = day; }
    const n = (v.npcs || []).length;
    if (n > 0) {
      cur.vils = (cur.vils || 0) + 1; cur.pop = (cur.pop || 0) + n;
      cur.tfe = (cur.tfe || 0) + (E.totalFoodEquivalent ? E.totalFoodEquivalent(v) : 0);
      cur.oreD = (cur.oreD || 0) + (v._oreOutLast || 0);                       // 그날 광부 수요 문 D(수식이 낼 원석 — 어제 모은 몫)
      cur.miners = (cur.miners || 0) + ((v.counts && v.counts.miner) || 0);
    }
    cur.oreIn = (cur.oreIn || 0) + _in0;
    //   광부 마을 날 줄(열흘마다) — [날 · 마을 · 수요 D · 그날 입고 · econ 광부 수 · 광부 몸 수 · 광맥 칸](광부 진단)
    if (day % 10 === 0 && ((v._oreOutLast || 0) > 0 || _in0 > 0 || (v.counts && v.counts.miner))) { const b = srv(), vil = b && b.state && b.state.byEcon && b.state.byEcon.get(v); let mb = 0;
      if (vil) { const pl = b.state.deps && b.state.deps.players; for (const pid of (vil.npcPids || [])) { const q = pl && pl.get(pid); if (q && q.simJob === 'miner') mb++; } }
      (rec.vmine || (rec.vmine = [])).push([day, v.name, +((v._oreOutLast || 0)).toFixed(2), +_in0.toFixed(2), (v.counts && v.counts.miner) || 0, mb, vil && vil._oreCells ? vil._oreCells.length : -1]); }
    //   굶어 죽음이 난 그날 그 마을 — [날 · 마을 · 인구 · 사람당 식량 · 그날 죽음 · 누계](여름 틈 진단 · 처음 2000줄)
    { const f = v._fdDeadTot || 0, f0 = FD.get(v) || 0; if (f > f0 && (rec.vfd || (rec.vfd = [])).length < 2000) { const tf = E.totalFoodEquivalent ? E.totalFoodEquivalent(v) : 0; rec.vfd.push([day, v.name, n, n ? +(tf / n).toFixed(2) : 0, f - f0, f]); } FD.set(v, f); }
    cur.fdDead = (cur.fdDead || 0) + (v._fdDeadTot || 0); cur.natDead = (cur.natDead || 0) + (v._natDeadTot || 0);
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return r;
};
//   판 끝 — 광부 몸 계측 칸 통째(배열 칸은 길이만 · 마을별 칸 `pk` · `vs` 는 뺀다) · T1266 한 시간 문 누계
function tail() {
  try { const P = V && V.__t1351Probe && V.__t1351Probe(); const t = P && P.t724; if (t) { const o = {}; for (const [k, v] of Object.entries(t)) { if (k === 'pk' || k === 'vs') continue; o[k] = Array.isArray(v) ? (k === 'granH' ? v : v.length) : v; } rec.t724 = o; } } catch (_) {}
  try { if (V && V.t1266Stat) rec.t1266 = V.t1266Stat(); } catch (_) {}
}
process.on('exit', () => { flush(); cur = null; tail(); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} });
