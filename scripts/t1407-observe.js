'use strict';
// (@regress 없음 — 러너 밖 · T1407 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1407-observe.js — 주석의 한 해: 묻힌 양 → 캔 원석 → 녹임 → 주조(검) → 남은 곳간 · 굶는 마을이 붓는 줄 ==========
//   쓰는 법(서버 자): NODE_OPTIONS="… -r $PWD/scripts/t1407-observe.js" node scripts/t577-server-run.js 400 1020 → 판 JSON 곁 `<판>-<시드>.t1407.json`
//   쓰는 법(랩):     T1407_LAB_OUT=<out.json> node … -r scripts/t1407-observe.js scripts/t176-ab.js 800 1020
//   econ 마을 틱(`tickVillage`)을 감싸 그날 첫 부름(어제 하루가 다 돈 곳간)에 읽는다 — t1384 관찰기 꼴. 주조 훅(`world.onCast`)은 있는 훅을 감싼다(뒤에 실린 관찰기 훅도 그대로 불린다).
//   ① 묻힌 양(날 1): 마을마다 광맥 세기(`land.ore`) · 광종 조성(`land.oreMix` — 주석 몫) · 땅 주석(`land.tin`) · 서버면 닿는 원석 칸 수(`_oreCells`).
//   ② 마을-날 줄(`vcols`): 사람 · 굶는 날(식량 흐름 EMA < 0) · 식량 안보(`_foodSecF`) · 곳간 날치 · 광부 · 대장장이 · 석공 · 전사 · 주석 원석 · 주석 · 구리 원석 · 구리 곳간 ·
//      어제 캔 주석 원석 · 구리 원석(`dailyProductionBuf` — 수식 · 몸 둘 다) · 어제 녹인 주석 · 구리(`_t1188Smelt` 누계 Δ) · 어제 부은 주석 · 구리(주조 훅 `take`) ·
//      어제 부은 검 · 청동 검(산출 × 청동도) · 무기 곳간 · 식량 일꾼(농 · 어 · 렵 · 채집) · 식량 · 무기 · 주석 · 주석 원석 값.
//   ⚠싣는 차례: **맨 뒤**(`-r … -r t1407-observe.js`) — 주조 훅을 세계마다 한 번 감싸 사슬 맨 안에 선다(앞 관찰기 둘의 다시 감싸기 휴전을 안 깬다 — 앞에 실으면 날마다 겹이 쌓여 주조를 여러 번 센다).
//   ③ 교역 장부 새 줄 — 품목마다 한 줄(주는 마을 · 받는 마을 · 품목 · 양 · 식량 환산): 주석 · 주석 원석 · 구리 · 구리 원석 · 무기와 먹을 것(식량 환산 > 0) — 바구니 · 귀로 바구니까지(t1398-table 읽기).
//   ④ 마을-날 줄 끝 칸 `fdProd` = 어제 낸 먹을 것(산출 버퍼의 식량 환산 — 정본 `storageFoodPer`).
//   ⚠값을 바꾸지 않는다 — 읽기만 · 훅은 감싸 부른다.
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1407.json' : '') : (process.env.T1407_LAB_OUT || '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const r4 = (x) => (x == null || !isFinite(+x) ? null : +(+x).toFixed(4));
const OT = 'ore_tin', OC = 'ore_copper';
const rec = {
  mode: SERVER ? 'server' : 'lab',
  knobs: { nocap: process.env.T1385_BRONZE_NOCAP || null, band: process.env.T1398_BRONZE_BAND || null, cast: process.env.T1333_EXPORT_CAST || null, t1407: Object.keys(process.env).filter((k) => /^T1407_/.test(k) && k !== 'T1407_LAB_OUT').map((k) => k + '=' + process.env[k]) },
  names: null, deposits: null,
  vcols: ['N', 'crisis', 'secF', 'foodDays', 'miner', 'smith', 'mason', 'warrior', 'foodW', 'oreTin', 'tin', 'oreCu', 'cu', 'minedTin', 'minedCu', 'smeltTin', 'smeltCu', 'castTin', 'castCu', 'cast', 'castBz', 'weapon', 'pFood', 'pWeap', 'pTin', 'pOreTin', 'fdDead', 'fdProd'],
  day: {}, lcols: ['day', 'giver', 'taker', 'res', 'amt', 'foodEq'], legs: [], err: null,
};
let W = null, lastDay = null, ready = false;
const SM = new Map(), CAST = new Map(), SEEN = new WeakSet(), HOOKED = new WeakSet();
const WATCH = { tin: 1, ore_tin: 1, copper: 1, ore_copper: 1, weapon: 1 };
function hook(w) {
  if (HOOKED.has(w)) return;   // 세계마다 한 번만 감싼다 — 다른 관찰기(t1385 · t1398)는 "맨 바깥이 제 것인가"로 다시 감싸므로 이 관찰기는 **맨 뒤에 싣는다**(그날 첫 `tickVillage` 겹이 먼저 돌아 이 훅이 사슬 맨 안에 선다 · 두 관찰기 사이 표지 `_t1385` 휴전은 그대로)
  HOOKED.add(w);
  const inner = w.onCast || null;
  const f = function (v, m, amt) {
    try {
      const c = CAST.get(v) || [0, 0, 0, 0]; const t = (m && m.take) || {};
      c[0] += +t.tin || 0; c[1] += +t.copper || 0; c[2] += +amt || 0; c[3] += (+amt || 0) * (+(m && m.bronzeness) || 0); CAST.set(v, c);
    } catch (e) { rec.err = rec.err || ('cast ' + String(e && e.stack || e).slice(0, 300)); }
    if (inner) return inner.apply(this, arguments);
  };
  f._t1407 = true; w.onCast = f;
}
const FP = new Map();
function foodPer(res) {   // 품목 1 단위의 식량 환산(정본 `storageFoodPer` — 세계 첫 마을 문맥 · 품목마다 한 번)
  if (FP.has(res)) return FP.get(res);
  let f = 0; try { const ref = W && W.villages && W.villages[0]; f = +V1.storageFoodPer(ref || { storage: {}, npcs: [] }, res) || 0; } catch (e) { f = 0; }
  if (!(f > 0)) f = 0; FP.set(res, f); return f;
}
function leg(day, giver, taker, it) {   // 지켜보는 품목(주석 · 원석 · 구리 · 무기)과 먹을 것(식량 환산 > 0)만 한 줄
  if (!it || !it.res || !(+it.amt > 0)) return;
  const fe = foodPer(it.res);
  if (WATCH[it.res] || fe > 0) rec.legs.push([day, giver, taker, it.res, r4(+it.amt), fe > 0 ? r4(fe * it.amt) : 0]);
}
function readLog() {   // 교역 장부 꼬리 — 가는 짐(보낸 · 둘째 · 바구니 — 버린 짐 빼고)은 보낸 마을 → 받는 마을 · 귀로 짐(산 것 · 귀로 바구니)은 거꾸로(t1398-table 과 같은 읽기)
  const L = W && W.tradeLog; if (!Array.isArray(L) || !L.length) return;
  let i = L.length - 1; while (i >= 0 && !SEEN.has(L[i])) i--;
  for (let j = i + 1; j < L.length; j++) {
    const r = L[j]; if (!r || typeof r !== 'object') continue; SEEN.add(r);
    const d = r.day | 0;
    if (!r.abandoned) {
      if (Array.isArray(r.basket)) for (const it of r.basket) leg(d, r.from, r.to, it);
      else { leg(d, r.from, r.to, r.sent); leg(d, r.from, r.to, r.sent2); }
    }
    if (Array.isArray(r.retBasket)) for (const it of r.retBasket) leg(d, r.to, r.from, it);
    else leg(d, r.to, r.from, r.bought);
  }
}
function deposits(vils) {
  return vils.map((v) => {
    const L = v.land || {}, mix = L.oreMix || null;
    return [v.name, r4(L.ore), r4(L.tin), mix ? Object.fromEntries(Object.entries(mix).map(([k, q]) => [k, r4(q)])) : null, Array.isArray(v._oreCells) ? v._oreCells.length : null, r4(L.oreP), r4(L.oreGrade)];
  });
}
function snap(day) {
  const vils = (W && W.villages) || []; if (!vils.length) return;
  if (!rec.names) rec.names = vils.map((v) => v.name);
  if (!rec.deposits) rec.deposits = deposits(vils);
  readLog();
  const rows = [];
  for (const v of vils) {
    const N = (v.npcs || []).length, cnt = v.counts || {}, st = v.storage || {};
    const sm = v._t1188Smelt || {}, prev = SM.get(v) || { tin: 0, copper: 0 };
    const dTin = (sm.tin || 0) - prev.tin, dCu = (sm.copper || 0) - prev.copper; SM.set(v, { tin: sm.tin || 0, copper: sm.copper || 0 });
    const c = CAST.get(v) || [0, 0, 0, 0]; CAST.delete(v);
    const dp = v.dailyProductionBuf || {};
    let secF = null; try { secF = V1._foodSecF(v); } catch (e) { /* 자리 */ }
    let fe = null; try { fe = V1.totalFoodEquivalent(v) / Math.max(1, N); } catch (e) { /* 자리 */ }
    const pc = v._priceCache || {};
    rows.push(N ? [N, v.surplusEMA && v.surplusEMA.food < 0 ? 1 : 0, r4(secF), r4(fe), cnt.miner || 0, cnt.smith || 0, cnt.mason || 0, cnt.warrior || 0,
      (cnt.farmer || 0) + (cnt.fisher || 0) + (cnt.hunter || 0) + (cnt.forager || 0),
      r4(st[OT]), r4(st.tin), r4(st[OC]), r4(st.copper), r4(dp[OT]), r4(dp[OC]), r4(dTin), r4(dCu), r4(c[0]), r4(c[1]), r4(c[2]), r4(c[3]), r4(st.weapon),
      r4(pc.food), r4(pc.weapon), r4(pc.tin), r4(pc[OT]), v._fdDeadTot || 0, r4(fdProd(dp))] : null);
  }
  rec.day[day] = rows;
  if (day % 20 === 0) write();
}
function fdProd(dp) { let n = 0; for (const k in dp) { const q = dp[k]; if (q > 0) { const f = foodPer(k); if (f > 0) n += q * f; } } return n; }   // 어제 낸 먹을 것(식량 환산 — 산출 버퍼)
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    if (!W && v && v._world) W = v._world;
    if (W) hook(W);
    if (day !== lastDay) { lastDay = day; if (ready) snap(day); ready = true; }
  } catch (e) { rec.err = rec.err || ('snap ' + String(e && e.stack || e).slice(0, 400)); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { if (W) { readLog(); } write(); } catch (e) { /* 자리 */ } });
