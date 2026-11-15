'use strict';
// (@regress 없음 — 러너 밖 · T1313 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1313-observe.js — 원석이 마을 사이로 어디까지 가나 · 어획 — T1293 판 꼴 곁 프리로드(`t1293-observe.js` 뒤에 싣는다) ==========
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1293-observe.js -r $PWD/scripts/t1313-observe.js" node scripts/t577-server-run.js 100 1020
//     → 판 JSON 곁 `<판>-<시드>.t1313.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   ① 날 머리(econ `tickVillage` 그날 첫 부름) 온 마을(51) — 사람 · 광부 · 어부 · 대장장이 수 · 녹임 누계(`_smeltedTotal`) · 청동 무기 누계(`_bronzeWeaponMade`) ·
//      구리 · 주석 곳간 · 원석 품목별 [곳간 · 녹임 흐름(`_consEMA`) · 값표 목표(`_targetV2(…).target` — 세계 공급 캐시가 오늘 선 때만)] · 어제 어획(`dailyProductionBuf` 생선 칸 합)
//   ② 교역 — econ 교역 장부(`world.tradeLog`)에 새로 든 줄을 날 머리마다 꼬리에서 읽는다(읽기만 · 읽은 줄은 개체로 기억):
//      원석 품목마다 마을별 나간 몫(보낸 짐 `sent` + 판 바구니 `basket` · 빈손 귀환 줄은 안 셈) · 들어온 몫(산 귀로 짐 `retBasket` · `bought`) · 날짜별 줄(날 · 보낸 마을 · 받은 마을 · 품목 · 양)
//   ⚠값을 바꾸지 않는다 — 장부는 읽기만 · `_targetV2` 는 세계 공급 캐시가 오늘 이미 선 때만 부른다(그 순간을 앞당기지 않는다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1313.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const OG = require(path.join(ROOT, 'server', 'ore-goods'));
const FG = V1.FishGoods || null;
const V2PATH = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2'));
const r4 = (x) => +(+x || 0).toFixed(4);
const isOre = (r) => r === 'ore' || (OG.isOre ? OG.isOre(r) : /^ore_/.test(r));
const isFish = (r) => r === 'fish' || !!(FG && FG.isItem && FG.isItem(r));
const rec = { on: !!V1.T1266_ORE_BODY, cap: !!V1.T1271_ORE_CAP, sat: !!V1.T1293_ORE_SAT, sur: !!V1.T1313_SURPLUS_EXPORT, lz: !!V1.T1313_LAMBDA_ZERO,
  vcols: ['pop', 'miner', 'fisher', 'smith', 'smelt', 'bronzeW', 'copper', 'tin', 'fishY'], day: {}, ore: {}, trade: [], flow: {}, err: null, rows: 0 };
let VIL = null, V2 = null, W0 = null;
function _wsOk(v) { const w = v && v._world; return !!(w && w._effDemCache && w._effDemCache.day === w.day); }
function _flow(vn, k, kind, amt) { const F = rec.flow[vn] || (rec.flow[vn] = {}); const o = F[k] || (F[k] = { out: 0, in: 0 }); o[kind] = r4(o[kind] + amt); }
function _note(row) {
  try {
    if (!row || typeof row !== 'object') return;
    rec.rows++;
    const d = row.day | 0, from = row.from, to = row.to;
    const out = [], back = [];
    if (!row.abandoned) {
      if (row.sent && isOre(row.sent.res) && row.sent.amt > 0) out.push([row.sent.res, +row.sent.amt]);
      for (const it of (row.basket || [])) if (it && isOre(it.res) && it.amt > 0) out.push([it.res, +it.amt]);
    }
    for (const it of (row.retBasket || [])) if (it && isOre(it.res) && it.amt > 0) back.push([it.res, +it.amt]);
    if (!row.retBasket && row.bought && isOre(row.bought.res) && row.bought.amt > 0) back.push([row.bought.res, +row.bought.amt]);
    for (const [k, a] of out) { _flow(from, k, 'out', a); _flow(to, k, 'in', a); rec.trade.push([d, from, to, k, r4(a)]); }
    for (const [k, a] of back) { _flow(to, k, 'out', a); _flow(from, k, 'in', a); rec.trade.push([d, to, from, k, r4(a)]); }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
const SEEN = new WeakSet();
function _readLog(w) {   // 장부 꼬리에서 거꾸로 — 이미 읽은 줄을 만나면 멈춘다(장부는 앞에서만 자른다 · 줄 개체는 그대로) · 읽기만
  const L = w && w.tradeLog; if (!Array.isArray(L) || !L.length) return;
  let i = L.length - 1; while (i >= 0 && !SEEN.has(L[i])) i--;
  for (let j = i + 1; j < L.length; j++) { const r = L[j]; if (r && typeof r === 'object') { SEEN.add(r); _note(r); } }
}
function snap(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  if (!V2 && require.cache[V2PATH]) V2 = require.cache[V2PATH].exports;
  const P = VIL.__labProbe._t569Probe.setup();
  const D = rec.day[day] = {}, O = rec.ore[day] = {};
  const ids = V1.T1188_ORE_SPLIT ? OG.ids : ['ore'];
  for (const vil of (P.villages || [])) { const e = vil.econ; if (e && e._world && e._world !== W0) { W0 = e._world; break; } }
  _readLog(W0);
  for (const vil of (P.villages || [])) {
    const e = vil.econ; if (!e) continue;
    const st = e.storage || {}, cnt = e.counts || {}, pb = e.dailyProductionBuf || {}, ema = e._consEMA || {};
    let fishY = 0; for (const k in pb) if (isFish(k) && pb[k] > 0) fishY += pb[k];
    D[vil.name] = [(e.npcs || []).length, cnt.miner || 0, cnt.fisher || 0, cnt.smith || 0, r4(e._smeltedTotal), r4(e._bronzeWeaponMade), r4(st.copper), r4(st.tin), r4(fishY)];
    const ok = V2 && _wsOk(e) && typeof V2._targetV2 === 'function';
    const ctx = ok ? V2._targetCtxV2(e) : null, o = {};
    for (const k of ids) { const s = st[k] || 0, f = (ema[k] || 0) * 30; let t = null; if (ok) { const T = V2._targetV2(e, k, ctx); t = T ? T.target : null; } if (s > 0 || f > 0 || (t || 0) > 0) o[k] = [r4(s), r4(f), t == null ? null : r4(t)]; }
    if (Object.keys(o).length) O[vil.name] = o;
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
process.on('exit', () => { try { _readLog(W0); } catch (e) {} write(); });
