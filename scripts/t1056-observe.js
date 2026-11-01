'use strict';
// (@regress 없음 — 러너 밖 · T1056 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1056-observe.js — 서버 판에서 집터를 못 세운 마을-날(T1050 회부 3) — 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   NODE_OPTIONS="-r $PWD/scripts/t1012-observe.js -r $PWD/scripts/t1056-observe.js" node scripts/t577-server-run.js 800 1020,7,42
//     (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1056.json`)
//   방아쇠 한 자리(`villages.js` 생활층 — `_lifeVL().houseSiteWant(…)` 가 참이고 집터가 없으면 `_lifeAddHouseSite(vil)`)를 그대로 본다:
//     ⓐ `village-layout.houseSiteWant` 를 감싸 부른 값 · 돌려준 값을 받는다(값은 그대로 돌려준다 — 세계 무변).
//     ⓑ 부른 마을 = 서버 마을 배열(`__labProbe._t569Probe.setup()` 이 인자 없이 돌려주는 `state.villages` — 아무것도 안 바꾼다)에서
//        네 인자를 서버 그 줄과 **같은 식**으로 낸 마을(인구 · 주거 + `_t958Want` · 지은 칸 · 집터 유무)이 하나뿐일 때 그 마을(둘 이상이면 `ambig` 로 센다).
//     ⓒ 시도(참 · 집터 없음) 뒤 그 마을에 집터가 섰나(`vil._site`)를 다음 econ 날 장부 `scanDay` 에서 본다
//        — 크루는 하루 `LIFE_CREW × LIFE_STAGE_PDAY` = 2 단계라 한 채(3 단계)를 그날 끝내지 못한다(선 집터는 다음 날에도 서 있다).
//   못 세운 마을-날 = 시도했는데 집터가 안 선 날(빈손 기억 `LIFE_SITE_MEMO` 로 훑기를 건너뛴 날도 시도다 — 그날도 집터가 없다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
if (!SERVER || !process.env.T577_OUT) return;
const OUT = process.env.T577_OUT.replace(/\.json$/, '') + '.t1056.json';
const ROOT = path.join(__dirname, '..');
const VL = require(path.join(ROOT, 'server', 'village-layout'));
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
let VIL = null;
const vils = () => { try { if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages')); const k = VIL.__labProbe._t569Probe.setup(); return (k && k.villages) || []; } catch (e) { return []; } };
const rec = { where: 'server', seed: +process.env.T577_SEED, per: {}, daily: [], ambig: 0, nomatch: 0, calls: 0, err: null };
let day = -1, pend = [], dAtt = 0, dFail = 0;
const per = (n) => rec.per[n] || (rec.per[n] = { att: 0, fail: 0, att365: 0, fail365: 0, first: null });
const hsw = VL.houseSiteWant;
VL.houseSiteWant = function (pop, housing, built, sites) {
  const r = hsw.apply(this, arguments);
  try {
    rec.calls++;
    if (r && !(sites > 0)) {
      const T958 = V1.T958_HOUSE_REAL;
      const m = vils().filter((v) => v && v.econ && !v._site && v.econ.npcs.length === pop && (v._houseCells ? v._houseCells.length : -1) === built
        && (v.econ.housing + ((T958 && v.econ._t958Want > 0) ? v.econ._t958Want : 0)) === housing);
      if (m.length === 1) pend.push(m[0]); else if (m.length > 1) rec.ambig++; else rec.nomatch++;
    }
  } catch (e) { rec.err = String(e && e.message); }
  return r;
};
function flush() {   // 앞 생활층 날의 시도마다 — 집터가 섰나
  for (const v of pend) {
    const n = (v.econ && v.econ.name) || v.name, P = per(n), ok = !!v._site;
    P.att++; dAtt++; if (day < 365) P.att365++;
    if (!ok) { P.fail++; dFail++; if (day < 365) P.fail365++; if (P.first == null) P.first = day; }
  }
  pend = [];
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, d0) {
    try {
      const d = d0 | 0;
      if (d !== day) { flush(); if (day >= 0) rec.daily.push([day, dAtt, dFail]); dAtt = 0; dFail = 0; day = d; }
    } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { try { flush(); if (day >= 0) rec.daily.push([day, dAtt, dFail]); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
