// (@regress 없음 — 러너 밖 · T1209 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1209-observe.js — 식사 몸(T1197) 왜 굶나 — 마을 · 날마다 곳간 · 먹은 몫 · 못 먹은 몫 · 빚 · 죽음 ===
//   쓰는 법: NODE_OPTIONS="--require $PWD/scripts/t745-vclock.js -r $PWD/scripts/t1209-observe.js" T1197_MEAL_BODY=1 node scripts/t577-server-run.js 400 1020
//            (랩) T1209_OUT=/tmp/x.json NODE_OPTIONS="-r $PWD/scripts/t1209-observe.js" node scripts/t17-metrics.js 400 1020
//   칸(마을마다 날마다): 인구 · 굶어 죽음 누계 · 죽음 누계 · 곳간 식량 환산(econ `totalFoodEquivalent` — 그날 끝) · 그날 제 몫(Σ (1 − 적응)) ·
//     그날 못 먹은 몫(Σ `_fdS`) · 허기 극단 사람 수 · HP 100 아래 사람 수 · 평균 빚(`_fd`) · 그날 철 · 수입(식량 품목 그날 들어온 양 — `_t1209In` 이 없으면 0)
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.env.T1209_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1209.json' : '');
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const Cal = require(path.join(ROOT, 'server', 'calendar'));
const rec = { cols: ['pop', 'fdDead', 'deadTot', 'tfe', 'need', 'short', 'extreme', 'hurt', 'debt'], names: null, rows: [] };
rec.cols.push('prod', 'emig', 'born', 'foodW', 'hap');
const _seen = new Map();
const FOODJ = new Set(['farmer', 'fisher', 'hunter', 'gatherer', 'herder', 'forager']);
const r3 = (x) => Math.round((+x || 0) * 1000) / 1000;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments); const sd = L.scanDay;
  L.scanDay = function (world, day) { try { snap(world, day | 0); } catch (e) { console.error('[t1209] 관측 실패:', e.message); } return sd.apply(this, arguments); };
  return L;
};
function snap(world, day) {
  const V = world.villages; if (!rec.names) rec.names = V.map((v) => v.name);
  const M = V1.__t1197 ? V1.__t1197() : null;
  rec.rows.push([day, Cal.seasonOf(day), V.map((v) => {
    const a = v.npcs || []; let need = 0, sh = 0, ex = 0, hu = 0, db = 0;
    for (const p of a) { need += 1 - (p._fdA || 0); sh += p._fdS || 0; if (M && p._mh != null && p._mh < M.AT) ex++; if (p._mhp != null && p._mhp < 100) hu++; db += p._fd || 0; }
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    let prod = 0; try { prod = v.dailyProductionBuf ? V1.totalFoodProductionEquivalent(v.dailyProductionBuf, v) : 0; } catch (e) { prod = -1; }
    const ids = new Set(a.map((p) => p.id)), prev = _seen.get(v); let nw = 0; if (prev) for (const id of ids) if (!prev.has(id)) nw++; _seen.set(v, ids);
    let fw = 0; for (const p of a) if (FOODJ.has(p.currentJob)) fw++;
    return [a.length, v._fdDeadTot || 0, v._deadTot || 0, r3(tfe), r3(need), r3(sh), ex, hu, r3(a.length ? db / a.length : 0), r3(prod), v._emigTot || 0, nw, fw, r3(v.lastStats ? v.lastStats.happiness : 0)];
  })]);
}
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { } });
