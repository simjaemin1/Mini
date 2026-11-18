'use strict';
// (@regress 없음 — 러너 밖 · T1347 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1347-observe.js — 받아 올 짐(발주한 마을이 가서 사 온다) · 발주 품목 · 판정 표 갈래 셈 — `t1344-observe.js` 뒤에 싣는 곁 프리로드 ==========
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1344-observe.js -r $PWD/scripts/t1347-observe.js" node scripts/t577-server-run.js 100 1020
//     → 판 JSON 곁 `<판>-<시드>.t1347.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   ① 훅 `world.onT1347`(econ v2 가 관찰기가 줄 때만 부른다 · 서버 · 랩 · 자는 안 준다 — 손잡이 `T1347_FETCH` 켬일 때만 불린다):
//      'leg' — 발주 품목을 파는 다리로 갈아 탄 출발 [날 · 보낸 마을 · 종전 목적지 · 새 목적지 · 종전 짐 · 새 짐 · 종전 짐 몫 · 새 짐 몫]
//      'ret' — 받아 올 짐을 발주 품목으로 갈아 낀 도착 [날 · 집 · 그곳 · 종전 받아 올 짐 · 발주 품목]
//   ② 날 머리(econ `tickVillage` 그날 첫 부름): 발주 품목별 발주 마을 수(칸 `_t1347O` — 켬일 때만 선다 · 그날 셈한 마을만) · 광산5 한 줄
//      [사람 · 전사 · 대장장이 · 무기 곳간 · 근접검 비중 · 식량 안보(`_foodSecF`) · 구리 · 주석 · 청동 누계 · 갈래 (가) 먹인 식량 누계(`_t1347Fed` — 판정 표 사본만 세운다)]
//   ⚠값을 바꾸지 않는다 — 훅은 econ 이 이미 고른 값을 적기만 한다 · 마을 칸은 읽기만.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1347.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const r4 = (x) => +(+x || 0).toFixed(4);
const K5 = '광산5';
const rec = {
  knobs: { fetch: null, mixDest: null, alloy: !!V1.T1333_ALLOY_ORDER, variant: process.env.T1347_VARIANT || null },
  lcols: ['day', 'from', 'toOld', 'toNew', 'resOld', 'resNew', 'profitOld', 'profitNew'],
  rcols: ['day', 'home', 'at', 'resOld', 'resNew'],
  vcols: ['pop', 'warrior', 'smith', 'weapon', 'swordFrac', 'secF', 'copper', 'tin', 'bronzeW', 'fed'],
  leg: [], ret: [], orders: {}, k5: {}, fedTot: {}, err: null,
};
let VIL = null, W0 = null, V2 = null;
const SEEN = new WeakMap();   // 마을 → 마지막으로 적은 발주 날(마을 칸에 쓰지 않는다)
const V2PATH = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2'));
function _ev(kind, day, x, oldv, newv) {
  try {
    if (kind === 'leg') rec.leg.push([day | 0, x && x.name, oldv && oldv.b && oldv.b.v && oldv.b.v.name, newv && newv.b && newv.b.v && newv.b.v.name,
      oldv && oldv.cand && oldv.cand.res, newv && newv.cand && newv.cand.res, r4(oldv && oldv.profit), r4(newv && newv.profit)]);
    else if (kind === 'ret') rec.ret.push([day | 0, x && x.from && x.from.name, x && x.to && x.to.name, oldv || null, newv || null]);
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
function snap(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  if (!V2 && require.cache[V2PATH]) { V2 = require.cache[V2PATH].exports; rec.knobs.fetch = !!V2.T1347_FETCH; rec.knobs.mixDest = !!V2.T1347_MIX_DEST; }
  const P = VIL.__labProbe._t569Probe.setup();
  const vils = (P.villages || []).filter((x) => x && x.econ);
  for (const vil of vils) { const e = vil.econ; if (e._world && e._world !== W0) { W0 = e._world; break; } }
  if (W0 && W0.onT1347 !== _ev) W0.onT1347 = _ev;
  for (const vil of vils) {   // 발주 — 마을이 마지막으로 셈한 날(그날 교역이 본 것)로 적는다(같은 날 두 번 안 센다)
    const e = vil.econ, o = e._t1347O;
    if (o && o.day != null && o.day !== SEEN.get(e)) { SEEN.set(e, o.day); const D = rec.orders[o.day] || (rec.orders[o.day] = {}); for (const r of o.list) D[r] = (D[r] || 0) + 1; }
    if (e._t1347Fed > 0) rec.fedTot[vil.name] = r4(e._t1347Fed);
  }
  const v5 = vils.find((x) => x.name === K5);
  if (v5) {
    const e = v5.econ, st = e.storage || {}, cnt = e.counts || {};
    let sf = null; try { sf = V1._foodSecF(e); } catch (err) { sf = null; }
    rec.k5[day] = [(e.npcs || []).length, cnt.warrior || 0, cnt.smith || 0, r4(st.weapon), e._swordFrac == null ? null : r4(e._swordFrac), sf == null ? null : r4(sf), r4(st.copper), r4(st.tin), r4(e._bronzeWeaponMade), r4(e._t1347Fed)];
  }
  if (day % 10 === 0) write();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
let last = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { write(); });
