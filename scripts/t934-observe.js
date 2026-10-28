'use strict';
// (@regress 없음 — 러너 밖 · T934 관찰기 · 제품 무변 · 읽기만)
// === scripts/t934-observe.js — 보호막 걷으면 첫해 굶어 죽음이 왜 2.5~4배인가 — 랩 자(`t17-metrics.js`)와 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법:
//     랩:   T934_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t934-observe.js" [T858_NO_SHIELD=1] node scripts/t17-metrics.js 400 1020
//     서버: NODE_OPTIONS="-r $PWD/scripts/t934-observe.js" [T858_NO_SHIELD=1] [ENABLE_BANDITS=0] node scripts/t577-server-run.js 400 1020,7,42
//           (아이 존만 · 판 JSON 곁 `<판>-<시드>.t934.json`)
//   장부 `scanDay`(econ 하루 끝)에서 날마다 마을마다 한 줄 — econ 이 그날 이미 적어 둔 칸을 읽기만 한다(사본 0 · 새 수 0):
//     인구 · 그날 굶어 죽음(`_deathsToday`) · 보호막이 지운 압력(`_shieldAte`) · 인구 고리 칸(`_dpDebug` — K · logi(θ-로지스틱 = K 넘김 몫) · hunger(식량 흐름 · 곳간 부족 몫) ·
//     health · happy · prestige) · 곳간 식량 환산(`totalFoodEquivalent`) · 식량 흐름 EMA(`surplusEMA.food`) · 받은 식량 누계(`tradeStats.foodImported`) · 징발 중(`_warDraft` 수) · 남은 빚(`_dPAccum`)
//   읽는 법: 죽음은 `_dPAccum ≤ −1` 에서 난다 — 그 빚은 날마다 위 칸들의 합(dP)이 쌓인 것이다. 표 기계(`t934-table.js`)가 빚을 칸별로 나눠 든다(음수 몫 비례).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T934_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t934.json' : '') : process.env.T934_OUT;
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);   // ★[T963] 그날 죽음 정본 — `_deadTot` 틱 앞뒤 차(`_deathsToday` 는 빈 마을 · 제련 날 끔 갈래에 전날 값이 남는다 · 사본 0)
const Ev = require(path.join(ROOT, 'server', 'events'));
const rec = {
  where: SERVER ? 'server' : path.basename(A1),
  knob: Object.fromEntries(['T858_NO_SHIELD', 'ENABLE_BANDITS', 'DCTL_SKIP', 'DCTL_ARM', 'T627_TRIP_DAY', 'T315_MAPBEDS'].map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  cols: ['pop', 'deaths', 'shieldAte', 'K', 'logi', 'hunger', 'health', 'happy', 'prestige', 'tfe', 'foodEMA', 'foodImp', 'drafted', 'accum'],
  names: null, rows: [],
};
const r3 = (x) => Math.round((+x || 0) * 1e3) / 1e3;
let last = -1;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { if ((day | 0) !== last) { last = day | 0; snap(world, day | 0); } } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages || [];
  if (!rec.names) rec.names = V.map((v) => v.name);
  for (const v of V) if (rec.names.indexOf(v.name) < 0) rec.names.push(v.name);
  const row = new Array(rec.names.length).fill(null);
  for (const v of V) {
    const i = rec.names.indexOf(v.name), d = v._dpDebug || {};
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    row[i] = [(v.npcs || []).length, DD.deathsToday(v), r3(v._shieldAte), r3(d.K), r3(d.logi), r3(d.hunger), r3(d.health), r3(d.happy), r3(d.prestige),
      r3(tfe), r3(v.surplusEMA && v.surplusEMA.food), r3(v.tradeStats && v.tradeStats.foodImported), (v.npcs || []).filter((n) => n && n._warDraft).length, r3(v._dPAccum)];
  }
  rec.rows.push([day, row]);
}
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
