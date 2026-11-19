'use strict';
// (@regress 없음 — 러너 밖 · T1385 랩 곁 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1385-lab-probe.js — 랩 판(`t176-ab.js` · `econ-lab-real.js`) 곁: 청동 드묾 · 문 넷이 닫은 마을-날 · 묵은 금속 · 무기 교역(해마다 · 끝) ==========
//   쓰는 법: T1385_LAB_OUT=<out.json> node -r scripts/t1385-lab-probe.js scripts/t176-ab.js 800 <시드>
//            T1385_LAB_OUT=<out.json> SEED_ALL=1 VILLAGE_MAX=51 node -r scripts/t1385-lab-probe.js scripts/econ-lab-real.js 100 0
//   econ 세계 틱(`tickWorldV2`)을 감싸 틱 뒤(그날 끝 곳간)에 읽기만 한다 — 서버 관찰기 `t1385-observe.js` 와 같은 셈:
//     청동 근접검 = 근접검 곳간 × 청동 몫(곁 장부 — 정본 섞음 `_t1344Mix` 를 그림자 칸에 · 어제 석검 누계 Δ + 주조 산출(주조 훅) + 철검 누계 Δ · 청동 = 주조 × 청동도) ·
//     문 넷(㉮ · ㉯ · ㉱ — 곳간 · 정본 함수 `_bronzeCapable` · `_foodSecF` 만 · ㉰ 는 세계 공급 캐시가 그날 선 때만 `_targetV2` 를 상한 판정만 바꿔 두 번) ·
//     묵은 금속(지난 30날 청동을 안 부은 마을의 주석 · 구리) · 교역 장부 새 줄(식량 교역량 · 무기 줄 · 산 마을 · 광산5 에서 나간 주석)
//   해(1 ~ 365 · 366 ~ 730 · 731 ~ 끝) 끝마다 마을 칸 · 끝에 한 번 더.
const path = require('path'), fs = require('fs');
const OUT = process.env.T1385_LAB_OUT; if (!OUT) return;
const ROOT = path.resolve(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const K = (n) => { const m = new RegExp('const ' + n + ' = ([\\d.]+);').exec(SRC); return m ? +m[1] : null; };
const MAT = /_bronzeNow = [^\n]*?\(v\.storage\.copper \|\| 0\) >= ([\d.]+) && \(v\.storage\.tin \|\| 0\) >= ([\d.]+)/.exec(SRC);
const C = { PC: K('MELEE_ARMORY_PC'), FRAC: K('BRONZE_ARMORY_FRAC'), SECF: K('MELEE_ARMORY_SECF'), COV: K('MELEE_COV_BUFFER'), SF0: K('SWORD_FRAC_INIT'), CU: MAT ? +MAT[1] : null, SN: MAT ? +MAT[2] : null };
const r4 = (x) => +(+x || 0).toFixed(4);
const K5 = '광산5';
const ENDS = [365, 730];
const rec = { consts: C, knobs: { t1385: V1.T1385 || null, t1344: !!V1.T1344_BRONZE_STOCK, exportCast: !!V1.T1333_EXPORT_CAST, wsInput: !!V1.T1333_WS_INPUT },
  dcols: ['day', 'pop', 'vill', 'smith', 'mason', 'warrior', 'melee', 'bronzeS', 'tin', 'copper', 'idleTin', 'idleCu', 'bzToday', 'stoneToday', 'castAmt', 'hold1', 'hold5', 'weapQ', 'g1', 'g1o', 'g2', 'g2s', 'g3', 'g4', 'g4o'],
  days: [], gHold: { g1: [0, 0, 0], g2: [0, 0, 0], g3: [0, 0, 0], g4: [0, 0, 0] }, gVill: {},
  vcols: ['name', 'pop', 'melee', 'bronzeS', 'qP', 'tin', 'copper', 'smith', 'mason', 'bronzeCum', 'stoneCum', 'secF', 'fdDead'],
  snaps: {}, trade: { rows: 0, food: 0, weaponRows: 0, weaponAmt: 0, weaponBuyers: {}, weaponSellers: {}, tin5: {}, cu5: 0 }, casts: { n: 0, amt: 0, bz: 0, over: 0, overBz: 0 }, err: null };
const SH = new Map(), CAST = new Map(), LASTBZ = new Map();
let W = null, k = 0;
const foodPer = (v, res) => { try { const f = V1.storageFoodPer(v, res); return f > 0 ? f : 0; } catch (e) { return 0; } };
function _hook(w) {
  const cur = w.onCast; if (cur && cur._t1385) return;
  const inner = cur || null;
  const f = function (v, m, amt) {
    try {
      const c = CAST.get(v.name) || [0, 0]; c[0] += +amt || 0; c[1] += (+amt || 0) * (+m.bronzeness || 0); CAST.set(v.name, c);
      const N = (v.npcs || []).length || 1, sf = v._swordFrac != null ? v._swordFrac : C.SF0, mel = (+v.storage.weapon || 0) * sf, S = SH.get(v.name);
      const bS = mel * (S ? Math.max(0, Math.min(1, S._t1344Q || 0)) : 0);
      rec.casts.n++; rec.casts.amt += +amt || 0; rec.casts.bz += (+amt || 0) * (+m.bronzeness || 0);
      if (bS >= N * C.PC) { rec.casts.over++; rec.casts.overBz += (+amt || 0) * (+m.bronzeness || 0); }   // 병기고를 채운 청동 위에 부은 주조(수출 주조)
    } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
    if (inner) return inner.apply(this, arguments);
  };
  f._t1385 = true; w.onCast = f;
}
const SEEN = new WeakSet();
function _trade(w) {
  const L = w.tradeLog; if (!Array.isArray(L) || !L.length) return;
  let i = L.length - 1; while (i >= 0 && !SEEN.has(L[i])) i--;
  const ref = w.villages[0];
  for (let j = i + 1; j < L.length; j++) {
    const r = L[j]; if (!r || typeof r !== 'object') continue; SEEN.add(r);
    const T = rec.trade; T.rows++;
    const one = (res, amt, from, to) => {
      if (!res || !(amt > 0)) return;
      T.food += amt * foodPer(ref, res);
      if (res === 'weapon') { T.weaponRows++; T.weaponAmt += amt; T.weaponBuyers[to] = (T.weaponBuyers[to] || 0) + amt; T.weaponSellers[from] = (T.weaponSellers[from] || 0) + amt; }
      if (res === 'tin' && from === K5) T.tin5[to] = (T.tin5[to] || 0) + amt;
      if (res === 'copper' && to === K5) T.cu5 += amt;
    };
    if (!r.abandoned && r.sent) one(r.sent.res, +r.sent.amt, r.from, r.to);
    if (!r.abandoned && r.sent2) one(r.sent2.res, +r.sent2.amt, r.from, r.to);
    if (!r.abandoned) for (const it of (r.basket || [])) if (it) one(it.res, +it.amt, r.from, r.to);
    for (const it of (r.retBasket || [])) if (it) one(it.res, +it.amt, r.to, r.from);
    if (!r.retBasket && r.bought) one(r.bought.res, +r.bought.amt, r.to, r.from);
  }
}
function _gv(n) { return rec.gVill[n] || (rec.gVill[n] = [0, 0, 0, 0, 0, 0, 0]); }
function snap(w, day) {
  const row = { pop: 0, vill: 0, smith: 0, mason: 0, warrior: 0, melee: 0, bronzeS: 0, tin: 0, copper: 0, idleTin: 0, idleCu: 0, bzToday: 0, stoneToday: 0, castAmt: 0, hold1: 0, hold5: 0, weapQ: 0, g1: 0, g1o: 0, g2: 0, g2s: 0, g3: 0, g4: 0, g4o: 0 };
  let wq = 0; const per = [];
  const wsOk = !!(w._effDemCache && w._effDemCache.day === w.day) && typeof V2._targetV2 === 'function';
  for (const e of w.villages) {
    const N = (e.npcs || []).length; if (!(N > 0)) continue;
    const st = e.storage || {}, cnt = e.counts || {}, name = e.name;
    let S = SH.get(name);
    const stoneC = +e._stoneWeaponMade || 0, ironC = +e._ironWeaponMade || 0, bzC = +e._bronzeWeaponMade || 0;
    if (!S) { S = { storage: { weapon: 0 }, _swordFrac: null, _swordMadeToday: 0, _t1344BzT: 0, _t1344Q: 0, _t1344M: null, _p: [stoneC, ironC, bzC] }; SH.set(name, S); }
    const cst = CAST.get(name) || [0, 0]; CAST.delete(name);
    const dStone = Math.max(0, stoneC - S._p[0]), dIron = Math.max(0, ironC - S._p[1]), dBz = Math.max(0, bzC - S._p[2]);
    S._p = [stoneC, ironC, bzC];
    S.storage.weapon = +st.weapon || 0; S._swordFrac = e._swordFrac != null ? e._swordFrac : C.SF0; S._swordMadeToday = dStone + cst[0] + dIron; S._t1344BzT = cst[1];
    V1._t1344Mix(S);
    if (cst[1] > 0) LASTBZ.set(name, day);
    const melee = (+st.weapon || 0) * S._swordFrac, qS = Math.max(0, Math.min(1, S._t1344Q || 0)), bronzeS = melee * qS;
    const tin = +st.tin || 0, cu = +st.copper || 0, smith = cnt.smith || 0, mason = cnt.mason || 0, war = cnt.warrior || 0;
    row.pop += N; row.vill++; row.smith += smith; row.mason += mason; row.warrior += war; row.melee += melee; row.bronzeS += bronzeS; row.tin += tin; row.copper += cu;
    row.bzToday += dBz; row.stoneToday += dStone; row.castAmt += cst[0];
    if (bronzeS >= 1) row.hold1++; if (bronzeS >= 5) row.hold5++;
    if (e._weapQ != null) wq += e._weapQ * N;
    if (day - (LASTBZ.has(name) ? LASTBZ.get(name) : -1e9) > 30) { row.idleTin += tin; row.idleCu += cu; }
    let secF = null; try { secF = V1._foodSecF(e); } catch (err) { secF = null; }
    const well = secF != null && secF > C.SECF, bz = C.CU != null && cu >= C.CU && tin >= C.SN, armory = N * C.PC, g = _gv(name);
    const hold = (kk) => { const h = rec.gHold[kk]; h[0] += tin; h[1] += cu; h[2] += bronzeS; };
    if (smith > 0 && bz && well && melee >= armory * C.FRAC) { row.g1++; g[0]++; hold('g1'); if (bronzeS < armory) { row.g1o++; g[1]++; } }
    let cap = true; try { cap = V1._bronzeCapable(e); } catch (err) { cap = true; }
    if (!cap && bz) { row.g2++; g[2]++; hold('g2'); if (smith > 0) { row.g2s++; g[3]++; } }
    if (smith > 0 && bz && !well && melee >= Math.max(2, war * C.COV)) { row.g4++; g[5]++; hold('g4'); if (bronzeS < armory) { row.g4o++; g[6]++; } }
    if (wsOk && (tin > 0 || cu > 0 || smith > 0)) {
      let ctx = null; try { ctx = V2._targetCtxV2(e); } catch (err) { ctx = null; }
      let any = false;
      for (const r of ['tin', 'copper', 'ore_tin', 'ore_copper']) {
        let a = null, b = null;
        try {
          const A = V2._targetV2(e, r, ctx); a = A ? A.target : null;
          const f0 = V1.t1333WsFree; V1.t1333WsFree = (x) => (x === r ? true : (f0 ? f0(x) : false));
          try { const B = V2._targetV2(e, r, ctx); b = B ? B.target : null; } finally { V1.t1333WsFree = f0; }
        } catch (err) { a = b = null; }
        if (a != null && b != null && b > a + 1e-9) any = true;
      }
      if (any) { row.g3++; g[4]++; hold('g3'); }
    }
    per.push([name, N, r4(melee), r4(bronzeS), e._t1344Q == null ? null : r4(e._t1344Q), r4(tin), r4(cu), smith, mason, r4(bzC), r4(stoneC), secF == null ? null : r4(secF), e._fdDeadTot || 0]);
  }
  row.weapQ = row.pop ? wq / row.pop : 0;
  rec.days.push(rec.dcols.map((c) => (c === 'day' ? day : r4(row[c]))));
  if (ENDS.includes(day) || day % 100 === 0) rec.snaps[day] = per;
  rec._last = [day, per];
}
const _t = V2.tickWorldV2;
V2.tickWorldV2 = function (world) {
  if (world && world !== W) { W = world; _hook(world); }
  const ret = _t.apply(this, arguments);
  try { k++; _hook(world); _trade(world); snap(world, k); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return ret;
};
process.on('exit', () => {
  try {
    if (rec._last) rec.snaps[rec._last[0]] = rec._last[1];
    delete rec._last;
    for (const kk of ['food', 'weaponAmt']) rec.trade[kk] = r4(rec.trade[kk]);
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e) })); } catch (e2) { /* 자리 */ } }
});
