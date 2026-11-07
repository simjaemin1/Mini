// (@regress 없음 — 러너 밖 · T1206 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1206-observe.js — 자연사 · 출생 다시 맞춤 · 부장품(T1206) 판 자 곁 프리로드 ===
//   쓰는 법(서버): NODE_OPTIONS="-r $PWD/scripts/t1206-observe.js" node scripts/t577-server-run.js 800 1020,7,42   (아이 존 · 판 JSON 곁 `.t1206.json`)
//          (랩)  : NODE_OPTIONS="-r $PWD/scripts/t1206-observe.js" T1206_OUT=/tmp/x.json node scripts/t17-metrics.js 800 1020
//   장부 `scanDay`(econ 하루 끝)에서 날마다 마을마다 한 줄 — 읽기만(사본 0 · 새 수 0):
//     인구 · 죽음 누계(`_deadTot`) · 자연사 누계(`_natDeadTot`) · 굶어 죽음 누계(`_fdDeadTot`) · 평균 나이 · 최고 나이 · 곳간 사치품 합(효용 정본 위세 기여 품목 — econ `_t1206IsLux`) ·
//     부장 누계(`_buryUsed`) · 마을 최고 숙련(명부 사람마다 숙련 칸의 최댓값 — 명장) · 새 사람(어제 명부에 없던 id)
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.env.T1206_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1206.json' : '');
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const Cal = require(path.join(ROOT, 'server', 'calendar'));
const rec = { cols: ['pop', 'deadTot', 'natDead', 'fdDead', 'meanAge', 'maxAge', 'lux', 'bury', 'master', 'newIds'], names: null, rows: [] };
const r2 = (x) => Math.round((+x || 0) * 100) / 100;
const isLux = typeof V1._t1206IsLux === 'function' ? V1._t1206IsLux : (() => {
  const SP = require(path.join(ROOT, 'server', 'specialty')).RESOURCES || {};
  return (id) => !!(SP[id] && SP[id].contributes && SP[id].contributes.prestige > 0) || id === 'jade';
})();
const _seen = new Map();
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) { try { snap(world, day | 0); } catch (e) { console.error('[t1206] 관측 실패:', e.message); } return sd.apply(this, arguments); };
  return L;
};
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) rec.names = V.map((v) => v.name);
  rec.rows.push([day, Cal.seasonOf(day), V.map((v) => {
    const a = v.npcs || []; let sa = 0, mx = 0, ms = 0;
    for (const p of a) { const g = +p.age || 0; sa += g; if (g > mx) mx = g; if (p.skills) for (const k in p.skills) if (p.skills[k] > ms) ms = p.skills[k]; }
    let lux = 0; for (const r in (v.storage || {})) if (v.storage[r] > 0 && isLux(r)) lux += v.storage[r];
    const ids = new Set(a.map((p) => p.id)), prev = _seen.get(v); let nw = 0; if (prev) for (const id of ids) if (!prev.has(id)) nw++; _seen.set(v, ids);
    return [a.length, v._deadTot || 0, v._natDeadTot || 0, v._fdDeadTot || 0, r2(a.length ? sa / a.length : 0), r2(mx), r2(lux), r2(v._buryUsed || 0), ms, nw];
  })]);
}
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
