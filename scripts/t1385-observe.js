'use strict';
// (@regress 없음 — 러너 밖 · T1385 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1385-observe.js — 청동 사슬의 상한 · 문턱이 닫은 마을-날 · 드묾(청동 검을 쥔 마을 · 병기고 청동 몫) · 묵은 금속 — 서버 판 곁 프리로드 ==========
//   쓰는 법: NODE_OPTIONS="… -r $PWD/scripts/t1385-observe.js -r $PWD/scripts/t1344-observe.js …" node scripts/t577-server-run.js 400 1020
//     → 판 JSON 곁 `<판>-<시드>.t1385.json`(10날마다 덮어 쓴다 · 끝에 한 번 더)
//   ★`t1344-observe.js` **앞**에 싣는다 — 둘 다 주조 훅(`world.onCast`)을 쓰는데 t1344 는 날마다 제 훅으로 덮는다(뒤에 실린 쪽의 `tickVillage` 겹이 먼저 돈다 →
//     이 관찰기가 앞에 실리면 t1344 가 먼저 덮고 이 관찰기가 그 위를 감싼다 · 둘 다 주조마다 불린다).
//   날 머리(econ `tickVillage` 그날 첫 부름 — 어제 하루가 다 돈 곳간) 온 마을(사람 > 0):
//   ① 문 넷(카드 ㉮ ~ ㉱)이 그날 닫혔나 — 정본 함수(`_bronzeCapable` · `_foodSecF` · `_targetV2`)를 읽기만으로 부른다(값표 캐시를 세우는 함수 — `_alloyMelt` · `_oppPrice` ·
//      `_t1333ExportCast` 는 날 머리에 안 부른다: 순수출가 캐시(`world._nevCache`)가 그날 첫 부름으로 서서 제품이 그 값을 다시 쓴다):
//      "청동을 부을 재료" = 주석 · 구리가 한 번 부을 만큼(석공 청동 우선권 `_bronzeNow` 의 재료 문 — 정본 줄에서 읽는다)
//      ㉮ 병기고 청동 몫 0.45 — 대장장이 있음 · 청동 재료 · 잘 먹는 마을 · 근접검 곳간 ≥ 병기고 × 몫(주조 문 닫힘)
//         · 그 가운데 "걷으면 연다"(청동 근접검 < 병기고 전체 — 돌검은 청동 수요를 막지 않는다)
//      ㉯ 청동 상비 자격 — 자격 없음(산지 아님 · 주석 < max(13, 사람 × 0.95)) · 주석 · 구리가 한 번 부을 만큼(석공 청동 우선권 `_bronzeNow` 의 재료 문 — 정본 줄에서 읽는다) · 그 가운데 대장장이 있음
//      ㉰ 세계 몫 상한 — 주석 · 구리 · 주석 원석 · 구리 원석의 값표 목표가 상한에 깎였나(같은 `_targetV2` 를 상한 밖 판정 `t1333WsFree` 만 바꿔 한 번 더 — 부른 뒤 바로 되돌린다 ·
//         세계 공급 캐시가 오늘 이미 선 때만 — t1333 관찰기와 같은 문)
//      ㉱ 취약 갈래 칼 한도 — 대장장이 있음 · 청동 재료 · 굶는 마을(식량 안보 ≤ 문턱) · 근접검 곳간 ≥ max(2, 전사 × 1.2) · 그 가운데 "걷으면 연다"(청동 근접검 < 병기고)
//      닫힌 마을-날마다 그날 그 마을 곳간의 주석 · 구리 · 청동 근접검을 더한다.
//   ② 드묾 — 청동 근접검 = 근접검 곳간 × 청동 몫. 청동 몫은 **곁 장부**(정본 섞음 함수 `_t1344Mix` 를 마을마다 그림자 칸에 — 제품 칸 무접촉):
//      어제 만든 근접검 = 석검 누계 Δ + 주조 산출(주조 훅) + 철검 누계 Δ · 어제 부은 청동 = 주조 산출 × 청동도 → 오늘 머리 곳간 · 근접검 비중으로 섞는다.
//      손잡이가 청동 몫을 제품에 세우는 판(`_t1344Q`)은 그 값도 함께 적는다(곁 장부와 견줌).
//   ③ 묵은 금속 — 지난 30날 청동을 한 번도 안 부은 마을이 쥔 주석 · 구리(세계 곳간 가운데).
//   ④ 주조 훅에서 주조마다 [날 · 마을 · 산출 · 청동도 · 그 순간 근접검 ÷ 병기고 · 청동 근접검(곁) ÷ 병기고] — 병기고를 넘겨 부은 주조 = 수출 주조(할 일 6) ·
//      날 머리 곳간 무기 ≥ 사람 × 0.8(수출 주조 문 `_weaponThin` 거짓 — 종전 수출 대장장이 과잉 방지 그 식) 마을-날.
//   ⚠값을 바꾸지 않는다 — 그림자 칸은 이 파일 안 객체 · `_targetV2` 두 번째 부름은 상한 판정 함수만 그 줄 동안 바꾼다(세계 공급 캐시가 이미 선 날 — 캐시를 새로 세우지 않는다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1385.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const V2PATH = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2'));
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const K = (n) => { const m = new RegExp('const ' + n + ' = ([\\d.]+);').exec(SRC); return m ? +m[1] : null; };
const MAT = /_bronzeNow = [^\n]*?\(v\.storage\.copper \|\| 0\) >= ([\d.]+) && \(v\.storage\.tin \|\| 0\) >= ([\d.]+)/.exec(SRC);
const C = { PC: K('MELEE_ARMORY_PC'), FRAC: K('BRONZE_ARMORY_FRAC'), SECF: K('MELEE_ARMORY_SECF'), COV: K('MELEE_COV_BUFFER'), SF0: K('SWORD_FRAC_INIT'),
  CU: MAT ? +MAT[1] : null, SN: MAT ? +MAT[2] : null };
const r4 = (x) => +(+x || 0).toFixed(4);
const PROBE = ['tin', 'copper', 'ore_tin', 'ore_copper'];
const K5 = '광산5';
const rec = {
  consts: C, knobs: null,
  // 날마다 한 줄(세계 합)
  dcols: ['day', 'pop', 'vill', 'smith', 'mason', 'warrior', 'melee', 'bronzeS', 'bronzeP', 'tin', 'copper', 'oreTin', 'idleTin', 'idleCu', 'bzToday', 'stoneToday', 'ironToday', 'castN', 'castAmt',
    'hold1', 'hold5', 'weapQ', 'g1', 'g1o', 'g2', 'g2s', 'g3tin', 'g3cu', 'g3otin', 'g3ocu', 'g3ok', 'g4', 'g4o', 'xThick'],
  days: [],
  // 문마다 닫힌 마을-날의 곳간 합(주석 · 구리 · 청동 근접검)
  gHold: { g1: [0, 0, 0], g2: [0, 0, 0], g3: [0, 0, 0], g4: [0, 0, 0] },
  gVill: {},   // 마을마다 [g1 · g1o · g2 · g2s · g3 · g4 · g4o · xThick]
  // 50날마다 · 끝에 마을 칸: [이름 · 사람 · 근접검 · 청동 근접검(곁) · 청동 몫(제품 · 없으면 null) · 주석 · 구리 · 대장장이 · 석공 · 청동 누계 · 석검 누계 · 식량 안보 · 전사]
  vcols: ['name', 'pop', 'melee', 'bronzeS', 'qP', 'tin', 'copper', 'smith', 'mason', 'bronzeCum', 'stoneCum', 'secF', 'warrior'],
  snaps: {},
  k5cols: ['day', 'pop', 'secF', 'smith', 'mason', 'warrior', 'tin', 'copper', 'oreTin', 'melee', 'bronzeS', 'bronzeCum', 'g1', 'g4', 'qP'],
  k5: [],
  ccols: ['day', 'v', 'amt', 'bz', 'meleeArm', 'bronzeArmS', 'bronzeArmP'],
  casts: [],
  err: null,
};
let VIL = null, V2 = null, W0 = null;
const SH = new Map();     // 마을 이름 → 그림자 칸
const CAST = new Map();   // 마을 이름 → [주조 산출 · 청동] (어제)
const LASTBZ = new Map(); // 마을 이름 → 마지막으로 청동을 부은 날
// ★이어 도는 판(`t1308-long-run.js` — 마디마다 새 프로세스 · `T577_OUT` = `<판 폴더>/seg-<시작 날>.json`)이면 곁 장부를 앞 마디 끝에서 잇는다
//   (제품 칸은 저장 줄 `serializeEcon` 이 이어 준다 · 이 관찰기의 그림자 칸은 앞 마디 JSON 의 `_shadow` 에서 — 없으면 0 에서)
(function _resume() {
  try {
    const m = /seg-(\d+)\.json$/.exec(process.env.T577_OUT || ''); if (!m) return;
    const dir = path.dirname(process.env.T577_OUT), from = +m[1];
    let best = -1; for (const f of fs.readdirSync(dir)) { const q = /^seg-(\d+)\.t1385\.json$/.exec(f); if (q && +q[1] < from && +q[1] > best) best = +q[1]; }
    if (best < 0) return;
    const o = JSON.parse(fs.readFileSync(path.join(dir, `seg-${best}.t1385.json`), 'utf8'));
    for (const [n, x] of Object.entries(o._shadow || {})) SH.set(n, { storage: { weapon: 0 }, _swordFrac: null, _swordMadeToday: 0, _t1344BzT: 0, _t1344Q: x[0], _t1344M: x[1], _p: x.slice(2, 5) });
    for (const [n, d] of Object.entries(o._lastBz || {})) LASTBZ.set(n, d);
    rec.resumedFrom = best;
  } catch (e) { rec.err = rec.err || ('resume ' + String(e && e.stack || e)).slice(0, 400); }
})();
function _wsOk(v) { const w = v && v._world; return !!(w && w._effDemCache && w._effDemCache.day === w.day); }
function _cast(v, m, amt) {
  try {
    if (!v || !m) return;
    const c = CAST.get(v.name) || [0, 0]; c[0] += +amt || 0; c[1] += (+amt || 0) * (+m.bronzeness || 0); CAST.set(v.name, c);
    const N = (v.npcs || []).length || 1, st = v.storage || {}, sf = v._swordFrac != null ? v._swordFrac : C.SF0, mel = (+st.weapon || 0) * sf, S = SH.get(v.name);
    const arm = N * C.PC, qS = S ? Math.max(0, Math.min(1, S._t1344Q || 0)) : 0;
    rec.casts.push([(W0 && W0.day) | 0, v.name, r4(amt), r4(m.bronzeness), r4(mel / arm), r4(mel * qS / arm), v._t1344Q == null ? null : r4(mel * Math.max(0, Math.min(1, v._t1344Q)) / arm)]);
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
function _hook() {
  if (!W0) return;
  const cur = W0.onCast;
  if (cur && cur._t1385) return;
  const inner = cur || null;
  const f = function (v, m, amt) { _cast(v, m, amt); if (inner) return inner.apply(this, arguments); };
  f._t1385 = true;
  W0.onCast = f;
}
function _tgt(e, r, ctx, free) {
  const T = V2._targetV2(e, r, ctx);
  if (!free) return T ? T.target : null;
  const f0 = V1.t1333WsFree;
  V1.t1333WsFree = function (x) { return x === r ? true : (f0 ? f0(x) : false); };
  try { const U = V2._targetV2(e, r, ctx); return U ? U.target : null; } finally { V1.t1333WsFree = f0; }
}
function _gv(n) { return rec.gVill[n] || (rec.gVill[n] = [0, 0, 0, 0, 0, 0, 0, 0]); }
function snap(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  if (!V2 && require.cache[V2PATH]) V2 = require.cache[V2PATH].exports;
  if (!rec.knobs) rec.knobs = { t1344: !!V1.T1344_BRONZE_STOCK, exportCast: !!V1.T1333_EXPORT_CAST, wsInput: !!V1.T1333_WS_INPUT, t1385: V1.T1385 ? Object.assign({}, V1.T1385) : null };
  const P = VIL.__labProbe._t569Probe.setup();
  const vils = (P.villages || []).filter((x) => x && x.econ);
  for (const vil of vils) { const e = vil.econ; if (e._world && e._world !== W0) { W0 = e._world; break; } }
  _hook();
  const row = { day, pop: 0, vill: 0, smith: 0, mason: 0, warrior: 0, melee: 0, bronzeS: 0, bronzeP: 0, tin: 0, copper: 0, oreTin: 0, idleTin: 0, idleCu: 0, bzToday: 0, stoneToday: 0, ironToday: 0, castN: 0, castAmt: 0,
    hold1: 0, hold5: 0, weapQ: 0, g1: 0, g1o: 0, g2: 0, g2s: 0, g3tin: 0, g3cu: 0, g3otin: 0, g3ocu: 0, g3ok: 0, g4: 0, g4o: 0, xThick: 0 };
  let wq = 0;
  const per = [];
  for (const vil of vils) {
    const e = vil.econ, st = e.storage || {}, cnt = e.counts || {};
    const N = (e.npcs || []).length; if (!(N > 0)) continue;
    const name = vil.name;
    // ── 곁 장부(그림자 칸 — 정본 섞음 함수) ──
    let S = SH.get(name);
    const stoneC = +e._stoneWeaponMade || 0, ironC = +e._ironWeaponMade || 0, bzC = +e._bronzeWeaponMade || 0;
    if (!S) { S = { storage: { weapon: 0 }, _swordFrac: null, _swordMadeToday: 0, _t1344BzT: 0, _t1344Q: 0, _t1344M: null, _p: [stoneC, ironC, bzC] }; SH.set(name, S); }
    const cst = CAST.get(name) || [0, 0]; CAST.delete(name);
    const dStone = Math.max(0, stoneC - S._p[0]), dIron = Math.max(0, ironC - S._p[1]), dBz = Math.max(0, bzC - S._p[2]);
    S._p = [stoneC, ironC, bzC];
    S.storage.weapon = +st.weapon || 0; S._swordFrac = e._swordFrac != null ? e._swordFrac : C.SF0;
    S._swordMadeToday = dStone + cst[0] + dIron; S._t1344BzT = cst[1];
    V1._t1344Mix(S);
    if (cst[1] > 0) LASTBZ.set(name, day - 1);
    const sf = e._swordFrac != null ? e._swordFrac : C.SF0;
    const melee = (+st.weapon || 0) * sf, qS = Math.max(0, Math.min(1, S._t1344Q || 0)), bronzeS = melee * qS;
    const qP = e._t1344Q == null ? null : Math.max(0, Math.min(1, e._t1344Q));
    const tin = +st.tin || 0, cu = +st.copper || 0, oreTin = +st.ore_tin || 0;
    const smith = cnt.smith || 0, mason = cnt.mason || 0, war = cnt.warrior || 0;
    row.pop += N; row.vill++; row.smith += smith; row.mason += mason; row.warrior += war; row.melee += melee; row.bronzeS += bronzeS; row.bronzeP += qP == null ? 0 : melee * qP;
    row.tin += tin; row.copper += cu; row.oreTin += oreTin; row.bzToday += dBz; row.stoneToday += dStone; row.ironToday += dIron;
    if (cst[0] > 0) { row.castN++; row.castAmt += cst[0]; }
    if (bronzeS >= 1) row.hold1++;
    if (bronzeS >= 5) row.hold5++;
    if (e._weapQ != null) wq += e._weapQ * N;
    const lb = LASTBZ.has(name) ? LASTBZ.get(name) : -1e9;
    if (day - lb > 30) { row.idleTin += tin; row.idleCu += cu; }
    // ── 문 넷 ──
    let secF = null; try { secF = V1._foodSecF(e); } catch (err) { secF = null; }
    const well = secF != null && secF > C.SECF;
    const bz = C.CU != null && cu >= C.CU && tin >= C.SN;   // 청동을 부을 재료(한 번 — 석공 청동 우선권의 재료 문)
    const armory = N * C.PC;
    const g = _gv(name);
    const hold = (k) => { const h = rec.gHold[k]; h[0] += tin; h[1] += cu; h[2] += bronzeS; };
    if (smith > 0 && bz && well && melee >= armory * C.FRAC) { row.g1++; g[0]++; hold('g1'); if (bronzeS < armory) { row.g1o++; g[1]++; } }
    let cap = true; try { cap = V1._bronzeCapable(e); } catch (err) { cap = true; }
    if (!cap && C.CU != null && cu >= C.CU && tin >= C.SN) { row.g2++; g[2]++; hold('g2'); if (smith > 0) { row.g2s++; g[3]++; } }
    if (smith > 0 && bz && !well && melee >= Math.max(2, war * C.COV)) { row.g4++; g[5]++; hold('g4'); if (bronzeS < armory) { row.g4o++; g[6]++; } }
    if (V2 && _wsOk(e) && typeof V2._targetV2 === 'function') {
      row.g3ok++;
      let ctx = null; try { ctx = V2._targetCtxV2(e); } catch (err) { ctx = null; }
      let any = false;
      for (const r of PROBE) {
        if (!(tin > 0 || cu > 0 || oreTin > 0 || (st[r] || 0) > 0 || smith > 0)) break;
        let a = null, b = null; try { a = _tgt(e, r, ctx, false); b = _tgt(e, r, ctx, true); } catch (err) { a = b = null; }
        if (a != null && b != null && b > a + 1e-9) { any = true; row[r === 'tin' ? 'g3tin' : r === 'copper' ? 'g3cu' : r === 'ore_tin' ? 'g3otin' : 'g3ocu']++; }
      }
      if (any) { g[4]++; hold('g3'); }
    }
    if (smith > 0 && bz && (+st.weapon || 0) >= N * 0.8) { row.xThick++; g[7]++; }
    per.push([name, N, r4(melee), r4(bronzeS), qP == null ? null : r4(qP), r4(tin), r4(cu), smith, mason, r4(bzC), r4(stoneC), secF == null ? null : r4(secF), war]);
    if (name === K5) rec.k5.push([day, N, secF == null ? null : r4(secF), smith, mason, war, r4(tin), r4(cu), r4(oreTin), r4(melee), r4(bronzeS), r4(bzC),
      (smith > 0 && bz && well && melee >= armory * C.FRAC) ? 1 : 0, (smith > 0 && bz && !well && melee >= Math.max(2, war * C.COV)) ? 1 : 0, qP == null ? null : r4(qP)]);
  }
  row.weapQ = row.pop ? wq / row.pop : 0;
  rec.days.push(rec.dcols.map((k) => (k === 'day' ? day : r4(row[k]))));
  if (day % 50 === 0) rec.snaps[day] = per;
  rec._last = [day, per];
  if (day % 10 === 0) write();
}
function write() {
  try {
    const o = Object.assign({}, rec); delete o._last;
    if (rec._last) o.snaps = Object.assign({}, rec.snaps, { [rec._last[0]]: rec._last[1] });
    o._shadow = {}; for (const [n, S] of SH) o._shadow[n] = [S._t1344Q || 0, S._t1344M == null ? null : S._t1344M, ...S._p];
    o._lastBz = Object.fromEntries(LASTBZ);
    fs.writeFileSync(OUT, JSON.stringify(o));
  } catch (e) { /* 자리 */ }
}
let last = -1;
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { write(); });
