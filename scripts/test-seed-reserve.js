#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-seed-reserve.js — 시딩 가산 몫 = 마을 비축 `T692_SEED_RESERVE`(기본 끔) =========================
//
// ★왜 [T692 · T683 회부 2]
//   LANDFIT 가 나무 모자란 땅에 얹은 통나무(`initN × 20 × (1 − land.wood) × LANDFIT_K`)가 첫 달 첫 수레(상한 100)로
//   팔려 나간다(T683 — 첫 30일 수출의 88~92% 가 가산 마을). 켜면 그 가산량 그대로를 그 마을 비축(`v._seedReserve`)에 적고,
//   마을 안 소비(`_cons(v, 'wood', …)`)가 비축에서 먼저 쓰며, 수출 두 문(v2 발주 후보 · 귀환 화물로 되사 감)은 곳간 − 비축만 본다.
//
// ★★이 하네스가 지키는 것
//   ⓐ 끔(기본) = 종전: 손잡이 거짓 · 가산 마을에도 `_seedReserve` 없음 · 쥔 양 0 · 수출이 보는 곳간 = 곳간 · `_cons` 무변 · `=0` = 미설정
//   ⓑ 켬 — 비축 칸: 8명 · 나무 0.45 땅 = 가산 8 × 20 × 0.55 = 88(곳간 152 − 64 · "가산량 그대로") · 나무 ≥ 1 땅 · 인구 0 터는 없음 ·
//      돌 가산은 비축이 아니다(통나무 하나) · 쥔 양 = min(비축, 곳간) · 수출이 보는 곳간 = 곳간 − 쥔 양
//   ⓒ 켬 — 줄어듦: `_cons(통나무)` 만큼 줄고(돌 소비는 무관) 0 밑으로 안 간다 · 하루 머리에 곳간으로 깎인다 · 여러 날 `tickVillage` 뒤에도 비축 ≤ 곳간 ·
//      되사 감 수량(`_impactBuyV2` held) = 곳간 − 쥔 양(held 0/없음 = 종전 값 · 같은 비용)
//   ⓓ 끝에서 끝(작은 세계 createWorldV2 seed 11 · 8마을 · 30일 · 발주 훅 `onTradeLeg` · 나무 ≥ 1 땅 곳간을 비워 통나무 수요를 만든 판 — 팔마다 같은 조작):
//      · 비축 = 그 마을 곳간 − 가산 0 판(`LANDFIT=0`) 곳간(가산량 그대로)
//      · 마을마다 그날 첫 화물의 통나무 후보 잉여 = max(1, (곳간 − 쥔 양) − keep)(끔은 쥔 양 0 — 같은 식)
//      · 두 문이 비축을 못 판다 — 발주(trade) 뒤 · 도착(caravans) 뒤 곳간 ≥ 그 앞 쥔 양(마을·날 전수) · 가산 마을 통나무 수레가 실제로 나갔다
//      · ⚠이 작은 판에선 가산 마을이 귀환 화물로 통나무를 되판 일이 0건이다 — 되사 감 수량은 ⓒ(단위) · ⓔ(자리)가 지킨다
//   ⓔ 자리: 손잡이를 읽는 자리 하나 · 비축이 서는 자리 하나(`createVillage` 가산 줄) · 줄어드는 자리 하나(`_cons`) · 깎는 자리 하나(`tickVillage` 머리) ·
//      v2 곳간 읽기 다섯(발주 후보 · 출발 때 귀환 후보 · 도착 때 무효 판정 · 다시 고르기 · 귀환 당김 훅) · 되사 감 수량 한 자리(`_impactBuyV2` held)
//   ⓕ 3사본: 번들이 같은 줄을 싣는다 · 브라우저 꼴(process 심 env 빈 판)에선 끔 · 랩 두 벌 인라인 = 번들
//   ⓖ 미끼: 비축이 서는 줄을 뺀 v1 사본 → 켬에서도 비축 없음 ⇒ ⓑ · ⓓ 가 빨개진다 · 발주 후보 자리를 종전 읽기로 되돌린 v2 사본 → 켬에서도 발주가 비축을 판다
//      (침범 > 0 · 잉여 식 어긋남) ⇒ ⓓ 가 빨개진다
//
// 실행: node scripts/test-seed-reserve.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

const V1_PATH = path.join(ROOT, 'sim', 'economy-sim.js');
const V2_PATH = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const S1 = fs.readFileSync(V1_PATH, 'utf8'), S2 = fs.readFileSync(V2_PATH, 'utf8');
const SET_LINE = '    if (T692_SEED_RESERVE && _woodBonus > 0) v._seedReserve = _woodBonus;';
const CONS_LINE = "  if (T692_SEED_RESERVE && r === 'wood' && v._seedReserve > 0) v._seedReserve = Math.max(0, v._seedReserve - amt); }";
const CAP_LINE = '  if (T692_SEED_RESERVE && v._seedReserve > 0) v._seedReserve = Math.min(v._seedReserve, v.storage.wood || 0);';
const CAND_LINE = '        const stock = v1.seedReserveAvail(a.v, r);';
const BUY_LINE = '      const _buy = _impactBuyV2(c.to, returnRes, _budget, v1.seedReserveHeld(c.to, returnRes));';

// 아이 프로세스 — env 를 바꿔 v1 · v2 를 새로 적재하고 값을 JSON 으로 돌려준다(손잡이는 적재 때 읽는다)
//   mutate: [파일, 찾을 글자, 바꿀 글자] — 적재 때 그 사본 글자만 바꾼다(미끼 — 디스크 무변 · T659 · T683 하네스 그 문법)
function child(env, mutate) {
  const code = `
    process.env.ENABLE_VILLAGES = '0';
    const fs = require('fs'), Module = require('module');
    const MUT = ${JSON.stringify(mutate || null)};
    if (MUT) { const _l = Module._extensions['.js']; Module._extensions['.js'] = function (m, f) {
      if (f === MUT[0]) { const c = fs.readFileSync(f, 'utf8'); if (!c.includes(MUT[1])) throw new Error('MUT_MISS'); m._compile(c.replace(MUT[1], MUT[2]), f); return; }
      return _l(m, f); }; }
    const l = console.log; console.log = () => {};
    const v1 = require(${JSON.stringify(V1_PATH)}), v2 = require(${JSON.stringify(V2_PATH)});
    try {
      const mk = (n, wood) => v1.createVillage({ initialPop: n, name: 'f' + n + '_' + wood, wood, stone: 0.4 });
      const a = mk(8, 0.45), b = mk(8, 1.3), c = mk(0, 0.2);
      const A = { wood: a.storage.wood, stone: a.storage.stone, rsv: a._seedReserve === undefined ? null : a._seedReserve, held: v1.seedReserveHeld(a, 'wood'), avail: v1.seedReserveAvail(a, 'wood'),
        heldStone: v1.seedReserveHeld(a, 'stone'), availStone: v1.seedReserveAvail(a, 'stone'), keys: Object.keys(a).filter((k) => k === '_seedReserve') };
      const B = { wood: b.storage.wood, rsv: b._seedReserve === undefined ? null : b._seedReserve }, C = { rsv: c._seedReserve === undefined ? null : c._seedReserve };
      // 줄어듦 — _cons · 바닥 0 · 하루 머리 깎기 · 여러 날
      const d = mk(8, 0.45); const r0 = d._seedReserve;
      v1._cons(d, 'wood', 10); const r1 = d._seedReserve; v1._cons(d, 'stone', 10); const r2 = d._seedReserve;
      const e = mk(8, 0.45); v1._cons(e, 'wood', 1000); const r3 = e._seedReserve;
      const g = mk(8, 0.45); g.storage.wood = 30; v1.tickVillage(g, 1); const capOk = g._seedReserve === undefined ? null : (g._seedReserve <= (g.storage.wood || 0) + 1e-9 && g._seedReserve <= 30);
      // 되사 감 수량 — 귀환 화물 매수(_impactBuyV2)가 쥔 양을 물리 재고에서 뺀다(예산이 넉넉해도)
      const k = mk(8, 0.45); const kh = v1.seedReserveHeld(k, 'wood');
      const buyHeld = v2._impactBuyV2(k, 'wood', 1e9, kh), buyFree = v2._impactBuyV2(k, 'wood', 1e9), buyZero = v2._impactBuyV2(k, 'wood', 1e9, 0);
      const BUY = { held: kh, stock: k.storage.wood, qHeld: buyHeld.qty, qFree: buyFree.qty, qZero: buyZero.qty, cFree: buyFree.cost, cZero: buyZero.cost };
      const h = mk(8, 0.45); let inv = true, hr = []; for (let day = 1; day <= 12; day++) { v1.tickVillage(h, day); if (h._seedReserve !== undefined) { hr.push(+h._seedReserve.toFixed(2)); if (h._seedReserve > (h.storage.wood || 0) + 1e-9) inv = false; } }
      // 끝에서 끝 — 작은 세계 30일 · 나무 ≥ 1 땅(가산 0) 마을 곳간을 비워 통나무 수요를 만든다(팔 셋 모두 같은 조작) ·
      //   그날 마을별 첫 화물 후보 잉여 · 두 문(발주 · 되사 감)이 그 앞 쥔 양 밑으로 파는가 · 가산 마을에서 통나무가 실제로 나갔는가
      const world = v2.createWorldV2({ seed: 11, villageCount: 8 });
      const init = world.villages.map((v) => ({ name: v.name, wood: v.storage.wood, landWood: v.land.wood, rsv: v._seedReserve === undefined ? null : v._seedReserve }));
      for (const v of world.villages) if ((v.land.wood || 0) >= 1) v.storage.wood = 0;
      const legs = []; world.onTradeLeg = (L) => legs.push(L);
      const rows = [], breach = { trade: 0, arrive: 0, checks: 0, woodLegs: 0, woodBuys: 0 };
      const heldOf = (v) => v1.seedReserveHeld(v, 'wood');
      const bonusV = new Set(init.filter((x) => (x.landWood || 0) < 1).map((x) => x.name));
      for (let dd = 0; dd < 30; dd++) {
        const P = v2.tickWorldV2Parts(world);
        P.head();
        for (const v of world.villages) P.village(v);
        const snap = new Map(world.villages.map((v) => [v.name, { stock: v.storage.wood || 0, held: heldOf(v), N: v.npcs.length }]));
        const b0 = legs.length; P.trade();
        for (const v of world.villages) { const sn = snap.get(v.name); breach.checks++; if ((v.storage.wood || 0) < sn.held - 1e-9) breach.trade++; }
        const seen = new Set();
        for (const L of legs.slice(b0)) {
          if (bonusV.has(L.from) && (L.res === 'wood' || L.second === 'wood')) breach.woodLegs++;
          if (seen.has(L.from)) continue; seen.add(L.from); const w = L.cands.find((x) => x.res === 'wood'); rows.push(Object.assign({ day: world.day, from: L.from, surplus: w ? w.surplus : null }, snap.get(L.from))); }
        const snap2 = new Map(world.villages.map((v) => [v.name, { stock: v.storage.wood || 0, held: heldOf(v) }]));
        const t0 = world.tradeLog.length ? world.tradeLog[world.tradeLog.length - 1] : null;
        P.caravans();
        { const TL = world.tradeLog; let j = t0 ? TL.lastIndexOf(t0) + 1 : 0; for (; j < TL.length; j++) { const t = TL[j]; if (t.bought && t.bought.res === 'wood' && t.bought.amt > 0 && bonusV.has(t.to)) breach.woodBuys++; } }
        for (const v of world.villages) { const sn = snap2.get(v.name); if ((v.storage.wood || 0) < sn.held - 1e-9) breach.arrive++; }
        P.tail();
      }
      console.log = l;
      process.stdout.write(JSON.stringify({ K: v1.T692_SEED_RESERVE, A, B, C, red: { r0, r1, r2, r3, capOk, inv, hr }, BUY, world: { init, rows, breach } }));
    } catch (e) { console.log = l; process.stdout.write(JSON.stringify({ err: String(e && e.stack || e).slice(0, 500) })); }`;
  const e = Object.assign({}, process.env, env);
  for (const k of Object.keys(env)) if (env[k] == null) delete e[k];
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { env: e, cwd: ROOT, maxBuffer: 1 << 26 }).toString());
}
const near = (x, y) => x != null && y != null && Math.abs(x - y) < 1e-9;
// 끝에서 끝 줄 검사 — 그날 첫 화물의 통나무 잉여가 max(1, (곳간 − 쥔 양) − keep) 인가(후보에 없으면 곳간 − 쥔 양 ≤ thresh 인가)
function e2e(W, subsWood) {
  let n = 0, good = 0, withWood = 0;
  for (const r of W.rows) {
    n++;
    const target = Math.max(subsWood * r.N * 30, r.N * 0.8), keep = target * 0.5, thresh = target * 0.8, avail = r.stock - r.held;
    if (r.surplus == null) { if (!(avail > thresh)) good++; continue; }
    withWood++;
    if (avail > thresh && near(r.surplus, Math.max(1, avail - keep))) good++;
  }
  return { n, good, withWood };
}
const SUBS_W = (() => { const l = console.log; console.log = () => {}; try { return require(V2_PATH).SUBSISTENCE_PER_NPC.wood; } finally { console.log = l; } })();

console.log('\nⓐ 끔(기본) = 종전');
const OFF = child({ T692_SEED_RESERVE: null });
if (OFF.err) console.log('  (아이 실패) ' + OFF.err);
ok(OFF.K === false, 'ⓐ 손잡이 미설정 = 거짓(기본 끔)');
ok(OFF.A.rsv === null && OFF.A.keys.length === 0 && OFF.A.held === 0 && OFF.A.avail === OFF.A.wood, 'ⓐ 가산 마을(나무 0.45)에도 비축 칸 없음 · 쥔 양 0 · 수출이 보는 곳간 = 곳간', `곳간 ${OFF.A.wood} · 본 곳간 ${OFF.A.avail}`);
ok(OFF.red.r0 === undefined || OFF.red.r0 === null || OFF.red.r0 === OFF.red.r1, 'ⓐ `_cons(통나무)` 가 아무 칸도 안 만든다');
const ZERO = child({ T692_SEED_RESERVE: '0' });
ok(ZERO.K === false && ZERO.A.rsv === null && JSON.stringify(ZERO.world.rows) === JSON.stringify(OFF.world.rows), 'ⓐ `=0` = 미설정과 같다(칸 · 작은 세계 30일 후보)');

console.log('\nⓑ 켬 — 시딩 가산 몫이 그 마을 비축이 된다');
const ON = child({ T692_SEED_RESERVE: '1' });
if (ON.err) console.log('  (아이 실패) ' + ON.err);
ok(ON.K === true, 'ⓑ `T692_SEED_RESERVE=1` = 참');
ok(near(ON.A.rsv, 8 * 20 * 0.55) && near(ON.A.rsv, ON.A.wood - OFF.B.wood) && ON.A.wood === OFF.A.wood, 'ⓑ 8명 · 나무 0.45 = 가산 8 × 20 × 0.55 = 88 = 곳간 152 − 기본 64(가산량 그대로 · 곳간은 끔과 같다)', `비축 ${ON.A.rsv} · 곳간 ${ON.A.wood}`);
ok(ON.B.rsv === null && ON.C.rsv === null, 'ⓑ 나무 ≥ 1 땅(가산 0) · 인구 0 터는 비축이 안 선다');
ok(near(ON.A.held, ON.A.rsv) && near(ON.A.avail, ON.A.wood - ON.A.rsv) && ON.A.heldStone === 0 && ON.A.availStone === ON.A.stone, 'ⓑ 쥔 양 = min(비축, 곳간) · 수출이 보는 곳간 = 152 − 88 = 64 · 돌 가산은 비축 아님(통나무 하나)', `${ON.A.avail} · 돌 ${ON.A.availStone}`);

console.log('\nⓒ 켬 — 비축이 줄어드는 길');
ok(near(ON.red.r1, ON.red.r0 - 10) && near(ON.red.r2, ON.red.r1) && ON.red.r3 === 0, 'ⓒ `_cons(통나무, 10)` → 88 − 10 = 78 · 돌 소비는 무관 · 1,000 을 써도 0 밑으로 안 간다', `${ON.red.r0} → ${ON.red.r1} → ${ON.red.r2} · ${ON.red.r3}`);
ok(ON.red.capOk === true, 'ⓒ 하루 머리에 곳간으로 깎인다(곳간 30 으로 줄인 마을 — 비축 ≤ 30 · ≤ 그날 곳간)');
ok(near(ON.BUY.qHeld, ON.BUY.stock - ON.BUY.held) && near(ON.BUY.qFree, ON.BUY.stock) && ON.BUY.qZero === ON.BUY.qFree && ON.BUY.cZero === ON.BUY.cFree
  && OFF.BUY.held === 0 && OFF.BUY.qHeld === OFF.BUY.qFree,
  'ⓒ 되사 감 수량(`_impactBuyV2` · 예산 넉넉) — 켬 = 곳간 − 쥔 양(152 − 88 = 64) · held 0/없음 = 곳간 전부(같은 값 · 같은 비용) · 끔은 쥔 양 0', `${ON.BUY.qHeld} / ${ON.BUY.qFree}`);
ok(ON.red.inv === true && ON.red.hr.length === 12 && ON.red.hr[11] < ON.red.hr[0], 'ⓒ 12일 `tickVillage` — 비축이 날마다 땔감만큼 줄고 늘 곳간 이하', ON.red.hr.slice(0, 4).join(' → ') + ' … ' + ON.red.hr[11]);

console.log('\nⓓ 끝에서 끝 — 작은 세계(createWorldV2 seed 11 · 8마을) 30일 · 나무 ≥ 1 땅 곳간을 비운 판');
const LF0 = child({ T692_SEED_RESERVE: '1', LANDFIT: '0' });   // 가산 0 판 — 같은 땅 · 기본 곳간만(가산량 = 켬 곳간 − 이 곳간)
const eOff = e2e(OFF.world, SUBS_W), eOn = e2e(ON.world, SUBS_W);
const rsvVils = ON.world.init.filter((x) => x.rsv > 0).length;
const sameAsBonus = ON.world.init.every((x, i) => { const base = LF0.world && LF0.world.init[i] && LF0.world.init[i].wood; const bonus = x.wood - base; return bonus > 1e-9 ? near(x.rsv, bonus) : x.rsv === null; });
ok(rsvVils >= 2 && sameAsBonus && LF0.world.init.every((x) => x.rsv === null), `ⓓ 켬 — 가산 마을 ${rsvVils}곳의 비축 = 그 마을 곳간 − 가산 0 판(LANDFIT=0) 곳간(가산량 그대로) · 가산 0 판엔 비축 없음`);
ok(eOff.n >= 5 && eOff.good === eOff.n, 'ⓓ 끔 — 그날 첫 화물 통나무 잉여 = max(1, 곳간 − keep)(쥔 양 0)', `${eOff.good}/${eOff.n}줄 · 통나무 후보 ${eOff.withWood}`);
ok(eOn.n >= 5 && eOn.good === eOn.n, 'ⓓ 켬 — 잉여 = max(1, (곳간 − 쥔 양) − keep) · 후보에 없으면 곳간 − 쥔 양 ≤ thresh', `${eOn.good}/${eOn.n}줄 · 통나무 후보 ${eOn.withWood}`);
ok(ON.world.breach.trade === 0 && ON.world.breach.arrive === 0 && ON.world.breach.checks >= 200 && ON.world.breach.woodLegs >= 1,
  'ⓓ 켬 — 두 문이 비축을 못 판다(발주 뒤 · 도착 뒤 곳간 ≥ 그 앞 쥔 양 · 마을·날 전수) · 가산 마을 통나무 수레가 실제로 나갔다',
  `검사 ${ON.world.breach.checks} · 침범 ${ON.world.breach.trade} · ${ON.world.breach.arrive} · 가산 마을 통나무 수레 ${ON.world.breach.woodLegs} · 되사 감 ${ON.world.breach.woodBuys}`);
ok(OFF.world.breach.woodLegs >= ON.world.breach.woodLegs, 'ⓓ 끔 판도 같은 조작에서 가산 마을 통나무 수레가 나간다(끔 ≥ 켬)', `끔 ${OFF.world.breach.woodLegs} · 켬 ${ON.world.breach.woodLegs}`);

console.log('\nⓔ 자리 — 읽기 · 서기 · 줄기 · 깎기 · v2 다섯 + 하나');
ok((S1.split('process.env.T692_SEED_RESERVE').length - 1) === 1 && (S2.split('T692_SEED_RESERVE').length - 1) === 0, 'ⓔ 손잡이를 읽는 자리 하나(v1) · v2 는 손잡이를 안 읽는다(v1 함수만 부른다)');
ok(S1.includes(SET_LINE) && S1.indexOf(SET_LINE) > S1.indexOf('function createVillage(') && (S1.split('v._seedReserve = _woodBonus').length - 1) === 1, 'ⓔ 비축이 서는 자리 하나 — `createVillage` LANDFIT 가산 줄');
ok(S1.includes(CONS_LINE) && S1.includes(CAP_LINE) && (S1.split('v._seedReserve = Math.').length - 1) === 2, 'ⓔ 줄어드는 자리 하나(`_cons`) · 깎는 자리 하나(`tickVillage` 머리) — 그 밖에 비축을 쓰는 줄 0');
ok((S2.split('v1.seedReserveAvail(').length - 1) === 5 && S2.includes(CAND_LINE) && (S2.split('v1.seedReserveHeld(').length - 1) === 1 && S2.includes(BUY_LINE), 'ⓔ v2 곳간 읽기 다섯(발주 후보 · 출발 때 귀환 후보 · 도착 무효 판정 · 다시 고르기 · 귀환 당김 훅) · 되사 감 수량 한 자리');
ok(S2.includes('const qty = Math.min(Math.max(0, s0 - s1), P.physical - (held || 0));'), 'ⓔ `_impactBuyV2` — 안 파는 몫만 물리 재고에서 뺀다(값 · 비용 식 무변)');

console.log('\nⓕ 3사본 — 번들 · 랩');
const BUN = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
ok(BUN.includes(SET_LINE) && BUN.includes(CONS_LINE) && BUN.includes(CAP_LINE) && BUN.includes(CAND_LINE) && BUN.includes(BUY_LINE), 'ⓕ 번들이 같은 줄 다섯을 싣는다');
{
  const win = {};
  try { vm.runInNewContext(BUN, { window: win, console: { log() {}, info() {}, warn() {}, error() {} } }); } catch (e) { win.err = e.message; }
  const E = win.EconEngine;
  let browserOff = false;
  try { const v = E.createVillage({ initialPop: 8, name: 'b', wood: 0.45 }); browserOff = E.T692_SEED_RESERVE === false && v._seedReserve === undefined && E.seedReserveAvail(v, 'wood') === v.storage.wood; } catch (e) { win.err = e.message; }
  ok(!!E && browserOff, 'ⓕ 브라우저 꼴(process 심 env 빈 판)에선 끔 — 랩 기본 = 종전', win.err || '');
}
let inl = 0; try { execFileSync(process.execPath, [path.join(ROOT, 'sim', 'inline-engine.js'), '--check'], { cwd: ROOT, stdio: 'pipe' }); } catch (e) { inl = e.status || 1; }
ok(inl === 0, 'ⓕ 랩 두 벌 인라인 = 번들(`inline-engine --check`)');

console.log('\nⓖ 미끼 — 줄을 뺀 · 되돌린 사본');
let BS = null; try { BS = child({ T692_SEED_RESERVE: '1' }, [V1_PATH, SET_LINE, '']); } catch (e) { BS = { err: String(e.message).slice(0, 160) }; }
ok(!!BS && BS.K === true && BS.A && BS.A.rsv === null && BS.world && BS.world.init.every((x) => x.rsv === null), 'ⓖ [자명 통과 금지] 비축이 서는 줄을 뺀 v1 사본 — 켬에서도 비축 없음 ⇒ ⓑ · ⓓ 가 빨개진다', BS && BS.A ? `비축 ${BS.A.rsv}` : (BS && BS.err));
let BC = null; try { BC = child({ T692_SEED_RESERVE: '1' }, [V2_PATH, CAND_LINE, '        const stock = a.v.storage[r] || 0;']); } catch (e) { BC = { err: String(e.message).slice(0, 160) }; }
const eBait = BC && BC.world ? e2e(BC.world, SUBS_W) : null;
ok(!!BC && BC.K === true && BC.world && BC.world.breach.trade > 0 && eBait && eBait.good < eBait.n, 'ⓖ [자명 통과 금지] 발주 후보 자리를 종전 읽기로 되돌린 v2 사본 — 켬에서도 발주가 비축을 판다 ⇒ ⓓ 가 빨개진다',
  BC && BC.world ? `발주 침범 ${BC.world.breach.trade} · 식 맞음 ${eBait.good}/${eBait.n}` : (BC && BC.err));

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
