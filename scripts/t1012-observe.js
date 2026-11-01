'use strict';
// (@regress 없음 — 러너 밖 · T1012 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1012-observe.js — 서버 ↔ 랩 같은 자: 날 90 · 365 · 판 끝 마을마다 한 줄 + 날마다 세계 합 몇 칸 ===
//   랩:   T1012_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1012-observe.js" node scripts/t17-metrics.js 800 1020
//   서버: NODE_OPTIONS="-r $PWD/scripts/t1012-observe.js" node scripts/t577-server-run.js 800 1020,7,42   (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1012.json`)
//   장부 `scanDay`(econ 하루 끝)에서 econ 이 이미 쥔 칸만 읽는다(사본 0 · 새 수 0):
//     날마다(세계 합): 인구 · 그날 굶어 죽음(정본 `lib-day-deaths` — `_deadTot` 틱 앞뒤 차) · 굶는 마을(식량 환산 < 인구) · 빈 마을 · 새 캐러밴(처음 본 `world.caravans` 개체)
//     표본 날(90 · 365 · 마지막 날): 마을마다 인구 · 직업 칸(`counts`) · 곳간(식량 환산 · 도구 셋 합 · 목재 · 돌 · 무기 · 갑옷 · 옷) · 주거 · 낸 캐러밴 누계 · 받은 식량 누계
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T1012_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1012.json' : '') : process.env.T1012_OUT;
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);   // 그날 죽음 정본(T963 — `_deadTot` 틱 앞뒤 차 · 빈 마을에 남은 전날 `_deathsToday` 를 다시 세지 않는다 · 사본 0)
const Ev = require(path.join(ROOT, 'server', 'events'));
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const SAMPLE = new Set([89, 364]);
const rec = { where: SERVER ? 'server' : path.basename(A1), daily: [], samples: {}, lastDay: -1, err: null };
const seenCar = new WeakSet();
let last = -1, lastSnap = null;
function snapVillages(world) {
  const out = {};
  for (const v of world.villages || []) {
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    const S = v.storage || {}, T = v.tradeStats || {};
    out[v.name] = { pop: (v.npcs || []).length, counts: Object.fromEntries(Object.entries(v.counts || {}).filter(([, n]) => n > 0)),
      tfe: r2(tfe), tool: r2((S.tool || 0) + (S.bronze_tool || 0) + (S.iron_tool || 0)), wood: r2(S.wood), stone: r2(S.stone), weapon: r2(S.weapon), armor: r2(S.armor), clothes: r2(S.clothes),
      housing: r2(v.housing), sent: T.caravansSent || 0, raided: T.caravansRaided || 0 };
  }
  return out;
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      const d = day | 0;
      if (d !== last) {
        last = d;
        let pop = 0, deaths = 0, starve = 0, empty = 0, newCar = 0;
        for (const v of world.villages || []) {
          const n = (v.npcs || []).length; pop += n; deaths += DD.deathsToday(v); if (n === 0) empty++;
          let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) {}
          if (n > 0 && tfe < n) starve++;
        }
        for (const c of world.caravans || []) if (c && !seenCar.has(c)) { seenCar.add(c); newCar++; }
        rec.daily.push([d, pop, deaths, starve, empty, newCar]);
        if (SAMPLE.has(d)) rec.samples[d] = snapVillages(world);
        rec.lastDay = d; lastSnap = world;
      }
    } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { try { if (lastSnap) rec.samples.last = snapVillages(lastSnap); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
