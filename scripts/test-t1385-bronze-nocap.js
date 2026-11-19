#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 5   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1385-bronze-nocap.js — 청동 사슬의 명시적 상한 넷을 걷는다(`T1385_BRONZE_NOCAP` · 팔 `_ARMORY` · `_TINGATE` · `_WS` · `_POOR` — 끔 기본) ===
//
// ★왜(재민 — 카드 T1385 글자 그대로): "상한을 명시적으로 해놓는 게 아니라, 상한을 없애야지.. 청동이 희귀해지는 건 자연히 그래야지 상한 때문이 아니라"
//   걷은 뒤의 규칙 하나: 근접 무기 수요가 있고 재료(구리 · 주석)와 손이 있으면 청동으로 붓고, 없으면 석기(돌검은 청동 수요를 막지 않는다).
// ★지키는 것(존을 안 띄운다 — econ 정본 함수(`createVillage` · `tickVillage` · `smithTarget` · `t1333WsFree`) · 전쟁 편성 정본(`war-core`)을 그대로 부른다 · 날짜 · 벽시계 0):
//   한 마을 하루(test-t1344-bronze-mix 픽스처 땅 · 사람 10 · 병기고 = 10 × 0.72 = 7.2 · 종전 청동 몫 한도 = 7.2 × 0.45 = 3.24 · 첫 차례 직업을 정한다):
//   ① 손잡이 — `'1'` 만 켬('0' · 'true' = 끔) · 손잡이 하나가 넷을 켠다 · 팔은 제 갈래만 · ㉮ 는 `T1344_BRONZE_STOCK` 을, ㉰ 는 `T1333_WS_INPUT` 을 같이 켠다(K1)
//   ② ⓐ 돌검으로 찬 병기고(근접검 10 ≥ 7.2 · 청동 몫 0) + 구리 · 주석 넉넉 → 끔 = 청동 0 · 켬 = 붓는다(A1)
//   ③ ⓑ 청동이 이미 병기고의 45 % 를 넘은 마을(청동 근접검 5 > 3.24 · < 7.2) → 끔 · T1344 만 = 안 붓는다 · 켬(㉮) = 붓는다(B1) · 대장장이 자리도 선다(S1)
//   ④ ⓒ 주석 0 → 켬도 청동 0(대장장이 — 청동 배합이 안 선다 · C1) · 석공은 비켜서지 않고 석검(재료가 상한이다 · C2)
//   ⑤ ⓓ 청동 근접검이 병기고를 채운 마을(10 ≥ 7.2) → 켬도 안 붓는다(D1)
//   ⑥ ㉯ 자격 없는 마을(산지 아님 · 주석 1 < 13) · 대장장이 있음 → 끔 = 석공이 석검 · 켬 = 비켜선다(대장장이가 붓는다 · T1) · 대장장이가 없으면 켬도 석검(손 · T2)
//   ⑦ ㉱ 굶는 마을(식량 0) — 근접검 2.5 ≥ 칼 한도 max(2, 전사 × 1.2) → 끔 · T1344 만 = 안 붓는다 · 켬 = 붓는다(P1)
//   ⑧ ㉰ 세계 몫 상한 밖 — 원석 · 합금 재료만(식량 · 무기 · 숯 · 철은 그대로 · WS1)
//   ⑨ 전쟁 편성 사본(㉯) — 청동 근접검 = 경제 장부의 청동 몫(자격 · 무기 질 ramp 를 안 본다 · WAR1)
//   ⑩ 끔 = 종전 — 끔 판의 한 마을 하루 · 자리 · 편성 = '0' 판 = 'true' 판(OFF1) · 글자(새 줄 자리 수 · T1344 이 박은 두 줄 그대로 · G1 · G2)
//   ⑪ 미끼(이 파일 안 · 바꾼 자리가 정확히 1곳인지 센다 · 어느 단언이 빨강이 되는지 단언한다 · 정본 파일 무변 — 한 줄만 바꾼 사본을 싣는다):
//      cap(상한 줄을 되살린다 → B1) · nomat(석공 재료 문에서 주석을 뺀다 → C2) · nohands(손 문을 뺀다 → T2) · poorkeep(굶는 마을 갈래를 되살린다 → P1) ·
//      warq(전쟁 편성이 장부 몫을 안 읽는다 → WAR1)
//
// 실행: node scripts/test-t1385-bronze-nocap.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1385_HARNESS_ARM || '', MUT = process.env.T1385_MUTANT || '';
const ESF = 'sim/economy-sim.js', WCF = 'sim/war-core.js';
// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자 · 돌릴 팔 · 빨강이 되어야 할 단언]
const BAITS = {
  cap: [ESF, 'const T1385_FRAC = T1385_ARMORY ? 1 : BRONZE_ARMORY_FRAC;', 'const T1385_FRAC = BRONZE_ARMORY_FRAC;', ['nocap', 'armory'], ['B1']],
  nomat: [ESF, '&& (v.storage.copper || 0) >= 0.3 && (v.storage.tin || 0) >= 0.12;', '&& (v.storage.copper || 0) >= 0.3;', ['nocap'], ['C2']],
  nohands: [ESF, 'const _t1385Hands = (T1385_ARMORY || T1385_TINGATE) ? (v.counts.smith || 0) > 0 : true;', 'const _t1385Hands = true;', ['tingate', 'nocap'], ['T2']],
  poorkeep: [ESF, 'const _bronzeArmoryCap = (_secF > MELEE_ARMORY_SECF || T1385_POOR)', 'const _bronzeArmoryCap = (_secF > MELEE_ARMORY_SECF)', ['poor', 'nocap'], ['P1']],
  warq: [WCF, 'if (_T1385_TIN) bronzeStock = Math.min(swordStock, Math.round(swordStock * _t1385Q(e)));', 'if (false) bronzeStock = 0;', ['tingate'], ['WAR1']],
};
const KNOBS = ['T1385_BRONZE_NOCAP', 'T1385_BRONZE_NOCAP_ARMORY', 'T1385_BRONZE_NOCAP_TINGATE', 'T1385_BRONZE_NOCAP_WS', 'T1385_BRONZE_NOCAP_POOR',
  'T1344_BRONZE_STOCK', 'T1344_MIX_LOAD', 'T1333_ALLOY_ORDER', 'T1333_EXPORT_CAST', 'T1333_WS_INPUT', 'COPPER_DERIV', 'L_CARGO_TWO', 'T1136_BASKET', 'T1347_FETCH', 'T1347_MIX_DEST'];

// ── 아이 판 ────────────────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of KNOBS) delete process.env[k];
  process.env.ENABLE_VILLAGES = '0';
  const SET = { nocap: ['T1385_BRONZE_NOCAP', '1'], armory: ['T1385_BRONZE_NOCAP_ARMORY', '1'], tingate: ['T1385_BRONZE_NOCAP_TINGATE', '1'], ws: ['T1385_BRONZE_NOCAP_WS', '1'],
    poor: ['T1385_BRONZE_NOCAP_POOR', '1'], t1344: ['T1344_BRONZE_STOCK', '1'], k0: ['T1385_BRONZE_NOCAP', '0'], ktrue: ['T1385_BRONZE_NOCAP', 'true'] }[ARM];
  if (SET) process.env[SET[0]] = SET[1];
  if (MUT) {   // 미끼 — 정본 파일을 읽어 한 자리만 바꾼 사본으로 싣는다(파일 무변 · 자리 수는 어미가 이미 셌다)
    const M = require('module'), old = M._extensions['.js'], B = BAITS[MUT], target = path.join(ROOT, B[0]);
    M._extensions['.js'] = function (mod, filename) {
      if (filename === target) { const src = fs.readFileSync(filename, 'utf8'); mod._compile(src.split(B[1]).join(B[2]), filename); return; }
      return old(mod, filename);
    };
  }
  const out = { arm: ARM, mut: MUT || null };
  const _l0 = console.log; console.log = () => {};
  let E, W;
  try { E = require(path.join(ROOT, 'sim', 'economy-sim.js')); W = require(path.join(ROOT, 'sim', 'war-core.js')); } finally { console.log = _l0; }
  const r6 = (x) => (x == null ? null : +(+x).toFixed(6));
  out.knob = { t1385: E.T1385 || null, bz: E.T1385_BZ == null ? null : !!E.T1385_BZ, frac: E.T1385_FRAC == null ? null : E.T1385_FRAC, t1344: !!E.T1344_BRONZE_STOCK, ws: !!E.T1333_WS_INPUT };
  const LP = { fertility: 0.32, arable: 1, water: 0.08, wood: 0.67, game: 0.74, stone: 2.13, ore: 0.24, size: 138, baseSize: 138, woodSustain: 12.61, fishSustain: null,
    forageSustain: 9.87, marginalQ: 0.497, oreMix: { copper: 0.9, gold: 0.05, silver: 0.05 }, oreGrade: 0.5153, oreP: 0.0909, oreDist: 0.4, coastal: false };
  // 한 마을(가짜 · 존 안 띄움) — jobs: 앞 차례 주민 직업(나머지 대장장이는 농부로 — 대장장이 수를 정한다) · cu · sn: 곳간 구리 · 주석 · wpn: 무기 곳간 · sf: 근접검 비중 ·
  //   q: 청동 몫 · m0: 어제 근접검 곳간 · food: 식량 · landTin: 땅 주석(산지) · stone · wq: 무기 질
  const mkV = (o) => {
    if (E.setSeed) E.setSeed(1);
    const v = E.createVillage({ ...LP, name: '시험청동', initialPop: 10 });
    const jobs = o.jobs || [];
    v.npcs.forEach((n, i) => { if (i < jobs.length) n.currentJob = jobs[i]; else if (n.currentJob === 'smith' || n.currentJob === 'mason' || n.currentJob === 'warrior') n.currentJob = 'farmer'; });
    for (const k of Object.keys(v.counts)) v.counts[k] = 0;
    for (const n of v.npcs) v.counts[n.currentJob] = (v.counts[n.currentJob] || 0) + 1;
    v.storage.ore = 0; for (const k of ['copper', 'tin', 'lead', 'silver', 'gold', 'iron', 'arsenic', ...((E.OreGoods && E.OreGoods.ids) || [])]) v.storage[k] = 0;   // 녹일 원석 0 — 하루를 주조에
    v.storage.copper = o.cu == null ? 5 : o.cu; v.storage.tin = o.sn == null ? 5 : o.sn; v.storage.weapon = o.wpn == null ? 7.5 : o.wpn; v.storage.wood = 1000; v.storage.charcoal = 1000;
    if (o.stone != null) v.storage.stone = o.stone;
    if (o.food != null) { for (const k of Object.keys(v.storage)) if (E.storageFoodPer && E.storageFoodPer(v, k) > 0) v.storage[k] = 0; v.storage.food = o.food; }
    v.land.tin = o.landTin == null ? 0 : o.landTin;
    if (o.sf != null) v._swordFrac = o.sf;
    if (o.q != null) v._t1344Q = o.q;
    if (o.m0 != null) v._t1344M = o.m0;
    if (o.wq != null) v._weapQ = o.wq;
    return v;
  };
  const quiet = (f) => { const _l = console.log; console.log = () => {}; try { return f(); } finally { console.log = _l; } };
  const day1 = (o) => quiet(() => {
    const v = mkV(o);
    const b0 = v._bronzeWeaponMade || 0, s0 = v._stoneWeaponMade || 0, w0 = v.storage.weapon, cu0 = v.storage.copper, sn0 = v.storage.tin, secF = E._foodSecF(v);
    const sm = v.counts.smith || 0, ma = v.counts.mason || 0, cap = !!E._bronzeCapable(v);
    E.tickVillage(v, 1);
    return { made: r6((v._bronzeWeaponMade || 0) - b0), stoneMade: r6((v._stoneWeaponMade || 0) - s0), cu: r6(cu0 - v.storage.copper), sn: r6(sn0 - v.storage.tin), dw: r6(v.storage.weapon - w0),
      secF: r6(secF), smith: sm, mason: ma, capable: cap, q: v._t1344Q == null ? null : r6(v._t1344Q) };
  });
  out.CD = {
    stoneFull: day1({ jobs: ['smith'], food: 2000, wpn: 20, landTin: 1 }),                           // ⓐ 근접검 10(석검 — 몫 0) ≥ 병기고 7.2
    over45: day1({ jobs: ['smith'], food: 2000, wpn: 20, q: 0.5, m0: 10, landTin: 1 }),             // ⓑ 청동 근접검 5 > 3.24 · < 7.2
    noTinSmith: day1({ jobs: ['smith'], food: 2000, sn: 0 }),                                         // ⓒ 주석 0 · 구리 5
    noTinMason: day1({ jobs: ['mason', 'smith'], food: 2000, sn: 0, stone: 50, landTin: 1 }),        // ⓒ 석공 첫 차례 · 대장장이 있음 · 병기고 모자람(3.75 < 7.2 × 0.85)
    bzFull: day1({ jobs: ['smith'], food: 2000, wpn: 20, q: 1, m0: 10, landTin: 1 }),               // ⓓ 청동 근접검 10 ≥ 7.2
    tinGate: day1({ jobs: ['mason', 'smith'], food: 2000, wpn: 5, sn: 1, stone: 50 }),               // ㉯ 산지 아님 · 주석 1 < 13 · 근접검 2.5 < 3.24 · 대장장이 있음
    tinGateNoHands: day1({ jobs: ['mason'], food: 2000, wpn: 5, sn: 1, stone: 50 }),                 // ㉯ 같은 곳간 · 대장장이 없음
    poor: day1({ jobs: ['smith'], food: 0, wpn: 5 }),                                                  // ㉱ 식량 0 · 근접검 2.5 ≥ max(2, 0)
  };
  const st = (o) => quiet(() => { const v = mkV(o); return { t: E.smithTarget(v), secF: r6(E._foodSecF(v)) }; });
  out.ST = { stone0: st({ food: 2000, landTin: 1, wpn: 20, q: 0 }), half: st({ food: 2000, landTin: 1, wpn: 20, q: 0.5 }), full: st({ food: 2000, landTin: 1, wpn: 20, q: 1 }) };
  out.WS = ['ore_tin', 'ore_copper', 'ore', 'copper', 'tin', 'lead', 'silver', 'gold', 'food', 'weapon', 'charcoal', 'iron'].map((r) => [r, !!E.t1333WsFree(r)]);
  const war = (o) => quiet(() => {
    const v = mkV(o);
    const a = W._warConscriptIndividual(v, 'raid', { defense: true }), b = W._warConscriptAggregate(v, 'raid', { defense: true });
    return { ind: a ? a.composition.champion : null, agg: b ? (b.composition ? b.composition.champion : b.champion) : null, warrior: v.counts.warrior || 0, capable: !!W._warBronzeCapable(v) };
  });
  out.WAR = {
    tinPoor: war({ jobs: ['warrior', 'warrior', 'warrior'], food: 2000, wpn: 10, sf: 1, sn: 0, q: 0.5, wq: 0.2 }),          // 산지 아님 · 주석 0 · 청동 몫 0.5 · 무기 질 0.2(ramp 밑)
    skilledStone: war({ jobs: ['warrior', 'warrior', 'warrior'], food: 2000, wpn: 10, sf: 1, landTin: 1, q: 0, wq: 0.5 }),   // 산지 · 청동 몫 0 · 무기 질 0.5(숙련 석검 — ramp 0.8)
  };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 어미 판 ────────────────────────────────────────────────────────────────────────────
function child(arm, mut) {
  const env = Object.assign({}, process.env, { T1385_HARNESS_ARM: arm, T1385_MUTANT: mut || '' });
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26 });
  const line = String(r.stdout || '').trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (r.status !== 0 || !line) return { arm, crash: (String(r.stderr || '') + String(r.stdout || '')).slice(-600) };
  try { return JSON.parse(line); } catch (e) { return { arm, crash: 'json ' + e.message }; }
}
const J = (x) => JSON.stringify(x);
const CD = (P, a, k) => (P[a] && P[a].CD && P[a].CD[k]) || {};
// 단언 — [이름 · 팔 · 판정(P) → [참/거짓 · 보일 값] · 글]
const CHECKS = [
  ['K1', ['off', 'nocap', 'armory', 'tingate', 'ws', 'poor', 'k0', 'ktrue'], (P) => {
    const k = (a) => P[a].knob, t = (a) => k(a).t1385 || {}, none = (a) => t(a).armory === false && t(a).tingate === false && t(a).ws === false && t(a).poor === false;
    const c = none('off') && none('k0') && none('ktrue') && k('off').frac === 0.45 && k('off').bz === false && k('off').t1344 === false && k('off').ws === false
      && t('nocap').armory && t('nocap').tingate && t('nocap').ws && t('nocap').poor && k('nocap').frac === 1 && k('nocap').bz && k('nocap').t1344 && k('nocap').ws
      && t('armory').armory && !t('armory').tingate && !t('armory').ws && !t('armory').poor && k('armory').frac === 1 && k('armory').t1344 && !k('armory').ws
      && t('tingate').tingate && !t('tingate').armory && k('tingate').bz && !k('tingate').t1344 && k('tingate').frac === 0.45
      && t('ws').ws && !t('ws').armory && k('ws').ws && !k('ws').t1344 && !k('ws').bz
      && t('poor').poor && !t('poor').armory && !k('poor').bz && k('poor').frac === 0.45;
    return [c, ['off', 'nocap', 'armory', 'tingate', 'ws', 'poor', 'k0', 'ktrue'].map((a) => [a, k(a)])]; }, "손잡이 — '1' 만 켬 · 하나가 넷 · 팔은 제 갈래만 · ㉮ → T1344 · ㉰ → T1333_WS_INPUT 를 같이 켠다"],
  ['A1', ['off', 'nocap', 'armory'], (P) => { const o = CD(P, 'off', 'stoneFull'), n = CD(P, 'nocap', 'stoneFull'), a = CD(P, 'armory', 'stoneFull');
    return [o.secF > 0.45 && o.made === 0 && o.cu === 0 && n.made > 0 && n.sn > 0 && a.made > 0, { off: o, nocap: n, armory: a }]; }, '★ⓐ 돌검으로 찬 병기고(근접검 10 ≥ 7.2 · 청동 몫 0) + 구리 · 주석 — 끔 = 청동 0 · 켬 = 붓는다'],
  ['B1', ['off', 't1344', 'nocap', 'armory'], (P) => { const o = CD(P, 'off', 'over45'), t = CD(P, 't1344', 'over45'), n = CD(P, 'nocap', 'over45'), a = CD(P, 'armory', 'over45');
    return [o.made === 0 && t.made === 0 && n.made > 0 && a.made > 0 && n.q > 0.5, { off: o.made, t1344: t.made, nocap: [n.made, n.q], armory: a.made }]; }, '★ⓑ 청동 근접검 5(병기고의 69 % > 45 %) — 끔 · T1344 만 = 안 붓는다 · 켬 = 병기고 전체까지 붓는다(몫이 0.5 위로)'],
  ['S1', ['off', 't1344', 'nocap'], (P) => { const s = (a, k) => P[a].ST[k].t;
    return [s('off', 'stone0') === 0 && s('nocap', 'stone0') >= 1 && s('t1344', 'half') === 0 && s('nocap', 'half') >= 1 && s('nocap', 'full') === 0, { off: P.off.ST, t1344: P.t1344.ST, nocap: P.nocap.ST }]; },
    '대장장이 자리 — 석검으로 찬 병기고: 끔 0 · 켬 선다 · 청동 몫 0.5: T1344 만 0 · 켬 선다 · 청동이 병기고를 채우면 켬도 0'],
  ['C1', ['off', 'nocap', 'armory', 'tingate', 'poor'], (P) => { const xs = ['off', 'nocap', 'armory', 'tingate', 'poor'].map((a) => CD(P, a, 'noTinSmith'));
    return [xs.every((x) => x.made === 0 && x.sn === 0), xs.map((x) => [x.made, x.cu, x.sn])]; }, '★ⓒ 주석 0(구리 5) — 어느 팔이든 청동 0(청동 배합이 안 선다 · 재료가 상한이다)'],
  ['C2', ['off', 'nocap'], (P) => { const o = CD(P, 'off', 'noTinMason'), n = CD(P, 'nocap', 'noTinMason');
    return [n.smith >= 1 && n.stoneMade > 0 && o.stoneMade > 0 && n.made === 0, { off: o, nocap: n }]; }, '★ⓒ 석공 첫 차례 · 대장장이 있음 · 주석 0 — 켬도 석공은 비켜서지 않고 석검(청동을 부을 주석이 없다)'],
  ['D1', ['off', 'nocap', 'armory'], (P) => { const o = CD(P, 'off', 'bzFull'), n = CD(P, 'nocap', 'bzFull'), a = CD(P, 'armory', 'bzFull');
    return [o.made === 0 && n.made === 0 && n.cu === 0 && a.made === 0, { off: o.made, nocap: [n.made, n.cu], armory: a.made }]; }, '★ⓓ 청동 근접검 10 ≥ 병기고 7.2(수요 0) — 켬도 안 붓는다'],
  ['T1', ['off', 'tingate', 'nocap'], (P) => { const o = CD(P, 'off', 'tinGate'), t = CD(P, 'tingate', 'tinGate'), n = CD(P, 'nocap', 'tinGate');
    return [!o.capable && o.smith >= 1 && o.stoneMade > 0 && t.stoneMade === 0 && t.made > 0 && n.stoneMade === 0 && n.made > 0, { off: o, tingate: t, nocap: n }]; },
    '★㉯ 자격 없는 마을(산지 아님 · 주석 1 < 13) · 대장장이 있음 — 끔 = 석공이 석검 · 켬 = 석공이 비켜서고 대장장이가 청동을 붓는다'],
  ['T2', ['tingate', 'nocap'], (P) => { const t = CD(P, 'tingate', 'tinGateNoHands'), n = CD(P, 'nocap', 'tinGateNoHands');
    return [t.smith === 0 && t.stoneMade > 0 && n.stoneMade > 0, { tingate: t, nocap: n }]; }, '★㉯ 같은 곳간 · 대장장이 없음 — 켬도 석공이 석검(붓는 손이 없으면 비켜서지 않는다)'],
  ['P1', ['off', 't1344', 'poor', 'nocap'], (P) => { const o = CD(P, 'off', 'poor'), t = CD(P, 't1344', 'poor'), p = CD(P, 'poor', 'poor'), n = CD(P, 'nocap', 'poor');
    return [o.secF === 0 && o.made === 0 && t.made === 0 && p.made > 0 && n.made > 0, { off: o, t1344: t.made, poor: p.made, nocap: n.made }]; }, '★㉱ 굶는 마을(식량 0) · 근접검 2.5 ≥ 칼 한도 2 — 끔 · T1344 만 = 안 붓는다 · 켬 = 병기고 몫까지 붓는다'],
  ['WS1', ['off', 'ws', 'nocap'], (P) => { const m = (a) => Object.fromEntries(P[a].WS), free = ['ore_tin', 'ore_copper', 'ore', 'copper', 'tin', 'lead', 'silver', 'gold'], keep = ['food', 'weapon', 'charcoal', 'iron'];
    return [P.off.WS.every(([, x]) => !x) && ['ws', 'nocap'].every((a) => free.every((r) => m(a)[r]) && keep.every((r) => !m(a)[r])), { off: P.off.WS, ws: P.ws.WS }]; }, '㉰ 세계 몫 상한 밖 — 원석 · 합금 재료만(식량 · 무기 · 숯 · 철은 그대로) · 끔 = 하나도 안'],
  ['WAR1', ['off', 'tingate', 'nocap'], (P) => { const w = (a, k) => P[a].WAR[k];
    return [w('off', 'tinPoor').ind === 0 && w('off', 'skilledStone').ind === 3 && w('tingate', 'tinPoor').ind === 3 && w('tingate', 'skilledStone').ind === 0
      && w('tingate', 'tinPoor').agg === 3 && w('tingate', 'skilledStone').agg === 0 && w('nocap', 'tinPoor').ind === 3 && w('off', 'tinPoor').agg === 0 && w('off', 'skilledStone').agg === 3,
    { off: P.off.WAR, tingate: P.tingate.WAR }]; }, '★㉯ 전쟁 편성 — 끔 = 자격 · 무기 질 ramp(산지 숙련 석검이 청동으로 읽힌다) · 켬 = 장부의 청동 몫(청동 근접검 5 → 전사 셋 다 · 몫 0 → 0)'],
  ['OFF1', ['off', 'k0', 'ktrue'], (P) => { const s = (a) => J([P[a].CD, P[a].ST, P[a].WS, P[a].WAR]);
    return [s('off') === s('k0') && s('off') === s('ktrue'), s('off').length]; }, "끔 = '0' 판 = 'true' 판(한 마을 하루 · 자리 · 상한 밖 · 편성이 바이트 같다)"],
];
function runChecks(P, print) {
  const failed = [], ran = [];
  for (const [id, arms, f, msg] of CHECKS) {
    if (!arms.every((a) => P[a])) continue;
    const dead = arms.filter((a) => P[a].crash);
    let r; if (dead.length) r = [false, `아이 판 죽음 ${dead.join(',')} ${P[dead[0]].crash.slice(0, 300)}`]; else { try { r = f(P); } catch (e) { r = [false, '판정 오류 ' + e.message]; } }
    ran.push(id); if (!r[0]) failed.push(id);
    if (print) console.log(`  ${r[0] ? '✓' : '✗'} ${id} ${msg}  ${typeof r[1] === 'string' ? r[1] : J(r[1])}`.slice(0, 1600));
  }
  return { ran, failed, pass: ran.length - failed.length, fail: failed.length };
}

console.log('=== test-t1385-bronze-nocap — 청동 사슬의 명시적 상한 넷을 걷는다(T1385_BRONZE_NOCAP · 끔 기본) ===');
const ARMS = ['off', 'nocap', 'armory', 'tingate', 'ws', 'poor', 't1344', 'k0', 'ktrue'];
const P = {};
for (const a of ARMS) P[a] = child(a);
console.log('\n① ~ ⑩ 손잡이 · ⓐ ~ ⓓ · ㉯ · ㉱ · ㉰ · 전쟁 편성 · 끔 = 종전');
const R = runChecks(P, true);

console.log('\n⑩ 글자 — 새 줄 자리 수 · T1344 · T1333 이 박은 줄 그대로');
let gp = 0, gf = 0;
const gok = (c, m, x) => { if (c) gp++; else gf++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + (typeof x === 'string' ? x : J(x)) : '')); };
{
  const ES = fs.readFileSync(path.join(ROOT, ESF), 'utf8'), WS = fs.readFileSync(path.join(ROOT, WCF), 'utf8');
  const n = (S, s) => S.split(s).length - 1;
  const c = {
    frac: n(ES, 'T1385_FRAC'), hands: n(ES, '_t1385Hands'), tin: n(ES, '(T1385_TINGATE || _bronzeCapable(v))'), bz: n(ES, 'T1385_BZ'), poor: n(ES, 'T1385_POOR'),
    armoryFold: n(ES, "process.env.T1344_BRONZE_STOCK === '1') || T1385_ARMORY;"), wsFold: n(ES, "process.env.T1333_WS_INPUT === '1') || T1385_WS;"), war: n(WS, '_T1385_TIN'),
  };
  gok(c.frac === 5 && c.hands === 2 && c.tin === 1 && c.bz === 4 && c.poor === 4 && c.armoryFold === 1 && c.wsFold === 1 && c.war === 3,
    'G1 새 자리 — 병기고 몫(정의 · 쓰는 곳 셋 — 석공 한도 · 대장장이 한도 · 대장장이 자리 · 내보냄) · 손(정의 · 석공 문) · 자격 1 · 장부(정의 · 주조 청동 칸 · 하루 끝 섞음 · 내보냄) · 굶는 마을(정의 · 읽기 칸 · 대장장이 한도 · 대장장이 자리) · 손잡이 접기 둘 · 전쟁 편성(정의 · 두 편성)', c);
  const pin = {
    smDef: (ES.match(/if \(T1344_BRONZE_STOCK && _secF > MELEE_ARMORY_SECF && _melt && _melt\.bronzeness > 0\) _smSwordStock = _t1344BronzeStock\(v\);/g) || []).length,
    mason: (ES.match(/\(\(T1344_BRONZE_STOCK && _secF > MELEE_ARMORY_SECF\) \? _t1344BronzeStock\(v\) : _swordStock\) < _bronzeArmoryCap/g) || []).length,
    calls: (ES.match(/_t1344BronzeStock\(v\)/g) || []).length - 1,
    castGate: (ES.match(/if \(_melt && \(_smSwordStock < _bronzeArmoryCap \|\| \(T1333_EXPORT_CAST && _t1333ExportCast\(v\)\)\)\) \{/g) || []).length,
    wsFn: n(ES, "function t1333WsFree(r) { return !!(T1333_WS_INPUT && (r === 'ore' || OreGoods.isOre(r) || _MELT_METALS.includes(r))); }"),
  };
  gok(pin.smDef === 1 && pin.mason === 1 && pin.calls === 3 && pin.castGate === 1 && pin.wsFn === 1,
    'G2 T1344 · T1333 이 박은 줄 그대로(청동 근접검 셈 둘 · 부르는 자리 셋 · 주조 문 · 상한 밖 판정) — 걷기는 그 손잡이를 같이 켜서 그 줄로 돈다(사본 0)', pin);
}

console.log('\n⑪ 미끼 — 한 자리 바꾼 사본은 정한 단언이 빨강이어야 한다(미끼 하나에 판정 줄 하나 — `@bait 5`)');
let bait = 0, baitSeen = 0;
const SRCS = {};
function baitRun(name) {
  const [file, from, , arms, expect] = BAITS[name];
  const S = SRCS[file] || (SRCS[file] = fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const sites = S.split(from).length - 1;
  if (sites !== 1) return { sites, good: false, why: `바꿀 자리가 정확히 1곳이 아니다 — 미끼를 안 돌림 · 팔 ${arms.join('+')} · 정한 빨강 ${J(expect)}` };
  const Q = {}; for (const a of arms) Q[a] = child(a, name);
  for (const a of ARMS) if (!Q[a]) Q[a] = P[a];   // 정한 팔만 사본 — 나머지 팔은 정본 판 그대로(단언이 견주는 끔 판 · T1344 판)
  const dead = arms.filter((a) => Q[a].crash);
  const r = runChecks(Q, false);
  const hit = expect.every((id) => r.failed.includes(id));
  return { sites, good: dead.length === 0 && hit,
    why: `팔 ${arms.join('+')} · 단언 ${r.ran.length} 가운데 빨강 ${J(r.failed)} · 정한 빨강 ${J(expect)}` + (dead.length ? ` · 아이 판 죽음 ${dead.join(',')} ${Q[dead[0]].crash.slice(0, 160)}` : '') };
}
function ok(c, m, x) { baitSeen++; if (c) bait++; console.log((c ? '  ✓ ' : '  ✗ ') + m + '  ' + x); }
let b;
b = baitRun('cap');      ok(b.sites === 1 && b.good, '미끼 cap — 병기고 청동 몫 상한 줄을 되살린 사본 → B1 빨강(청동이 45 % 를 넘은 마을이 안 붓는다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('nomat');    ok(b.sites === 1 && b.good, '미끼 nomat — 석공 재료 문에서 주석을 뺀 사본 → C2 빨강(주석이 없어도 석공이 비켜서 석검이 안 선다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('nohands');  ok(b.sites === 1 && b.good, '미끼 nohands — 손 문을 뺀 사본 → T2 빨강(대장장이가 없는데 석공이 비켜서 병기고가 빈다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('poorkeep'); ok(b.sites === 1 && b.good, '미끼 poorkeep — 굶는 마을 칼 한도 갈래를 되살린 사본 → P1 빨강(굶는 마을은 칼 둘에서 멈춘다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('warq');     ok(b.sites === 1 && b.good, '미끼 warq — 전쟁 편성이 장부의 청동 몫을 안 읽는 사본 → WAR1 빨강(자격 · 무기 질 ramp 로 되돌아간다)', `바꾼 자리 ${b.sites} · ${b.why}`);
const NB = Object.keys(BAITS).length;
if (baitSeen !== NB) { console.log(`  ✗ 미끼 표(${NB})와 판정 줄(${baitSeen}) 수가 다르다 — 표에 더한 미끼는 판정 줄도 더한다`); bait = -1; }
const total = R.pass + R.fail + gp + gf;
console.log(`\n=== ${R.pass + gp}/${total} ${R.fail + gf ? '✗' : '✓'} (미끼 ${bait}/${NB}) ===`);
process.exitCode = (R.fail || gf || bait < NB) ? 1 : 0;
