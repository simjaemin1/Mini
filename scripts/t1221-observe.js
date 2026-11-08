'use strict';
// (@regress 없음 — 러너 밖 · T1221 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1221-observe.js — 농사 일손 · 비옥 판 관찰기 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===========================
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1221-observe.js" node scripts/t577-server-run.js 400 1020   (판 JSON 곁 `<판>-<시드>.t1221.json`)
//   ⓐ 마을마다 날마다 — 인구 합(사람-날) · 밭이 곳간에 넣은 식량등가(econ `_t368FoodTot` 차) · 곳간 식량 환산
//   ⓑ 30날마다 찍음 — 마을: 이름 · 비옥도(`land.fertility`) · 비옥 순위 · 인구 · 영토 칸 · 밭 칸 · 누계(사람-날 · 밭 식량)
//      세계: 농부 일 시간(`_t1221Stat` — 켬 판) · 몸 일괄 일감(`_t1212Rest` — 두 판)
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1221.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const EVERY = +(process.env.T1221_EVERY || 30);
const rec = { every: EVERY, shots: [], acc: {}, err: null };
let last = -1, VIL = null;
function shoot(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
  const vs = (P.villages || []).map((vil) => {
    const e = vil.econ || {}, a = rec.acc[vil.name] || {};
    return { n: vil.name, f: +(((e.land || {}).fertility) || 0).toFixed(4), r: B._t1221Fert ? +B._t1221Fert(vil).toFixed(4) : null,
      pop: (e.npcs || []).length, terr: vil._terrSet ? vil._terrSet.size : 0, farm: vil._farmSet ? vil._farmSet.size : 0,
      pd: a.pd || 0, ff: +((e._t368FoodTot || 0)).toFixed(2), tfe: +(V1.totalFoodEquivalent ? V1.totalFoodEquivalent(e) : 0).toFixed(1) };
  });
  rec.shots.push({ day, vs, lab: B._t1221Stat ? JSON.parse(JSON.stringify(B._t1221Stat)) : null, rest: B._t1212Rest ? Object.assign({}, B._t1212Rest) : null });
  fs.writeFileSync(OUT, JSON.stringify(rec));
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    const a = rec.acc[v.name] || (rec.acc[v.name] = { pd: 0, d: -1 });
    if (a.d !== day) { a.d = day; a.pd += (v.npcs || []).length; }
    if (day !== last) { last = day; if (day > 0 && day % EVERY === 0) shoot(day); }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} }
  return _t.apply(this, arguments);
};
