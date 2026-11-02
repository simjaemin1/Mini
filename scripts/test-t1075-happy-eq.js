#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1075-happy-eq.js — 행복 평형 회귀 · 굶주림 평형 · 사망 계단 · 불행은 안 죽인다 [T1075 · ★재민 11-02] ===
//   잰다: ① eqStep — 반감기 30일이면 30일 뒤 거리 절반 · 높으면 내려가고 낮으면 올라간다(배너로드식)
//         ② 마을 칸 H 가 평형 H* 를 따라간다(그날 값이 뚝 떨어져도 H 는 천천히) · 소비자(lastStats.happiness)는 H 를 읽는다
//         ③ 굶주림 — 빚이 있으면 H* 가 내려간다(빚 0 = 무변) ④ 사망 계단 — 굶어 죽은 날 H 가 한 번에 1/N 내려간다
//         ⑤ 불행은 죽이지 않는다 — 불행 마을의 기근 고리 죽음 0 · 압력은 출생을 깎고 남는 몫은 이탈(길 문이 있을 때만 · 없으면 아무도 안 떠난다)
//         ⑥ 끔 = H 칸이 안 선다(손잡이 기본 끔)
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? `  ${x}` : '')); };

if (process.env.T1075_CHILD) {
  const E = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
  const out = { knob: E.T1075_HAPPY_EQ, half: E.HAPPY_EQ_HALF_DAYS };
  // ① eqStep
  let x = 0; for (let i = 0; i < 30; i++) x = E.eqStep(x, 1, 30);
  let y = 1; for (let i = 0; i < 30; i++) y = E.eqStep(y, 0, 30);
  out.eq = { up30: x, down30: y, one: E.eqStep(0.2, 0.8, 30) };
  // ②~⑤ 실제 마을(사람 마을 · 보호막 없음) — 첫날 넉넉 · 그 뒤 곳간을 비운다(그날 값 = 다양성 0)
  const mkV = () => { const v = E.createVillage({ name: '행복마을', initialPop: 30, fertility: 0.0, arable: 0, game: 0, wood: 0.5, stone: 0.3, ore: 0 }); v.founder = 'p1'; return v; };
  const zero = (v) => { for (const k of Object.keys(v.storage)) { const b = v.storage[k]; v.storage[k] = 0; if (E.totalFoodEquivalent(v) === E.totalFoodEquivalent(Object.assign({}, v, { storage: Object.assign({}, v.storage, { [k]: b }) }))) v.storage[k] = b; } };
  const run = (hook) => {
    const v = mkV(); const left = [];
    v._world = { day: 0, t1075Emigrate: hook ? (ev, npc) => { left.push(npc.age); return true; } : undefined };
    const rows = [];
    for (let d = 400; d < 460; d++) {
      if (d > 402) zero(v);
      const st0 = v._H, n0 = v.npcs.length, fd0 = v._fdDeadTot || 0, dt0 = v._deadTot || 0;
      E.tickVillage(v, d);
      rows.push({ d, H: v._H, Heq: v.lastStats && v.lastStats.happinessEq, Hpub: v.lastStats && v.lastStats.happiness, n0, n: v.npcs.length, fdDead: (v._fdDeadTot || 0) - fd0, dead: (v._deadTot || 0) - dt0, st0, emig: v._emigTot || 0, lost: v._emigLost || 0, dbg: Object.assign({}, v._dpDebug || {}) });
    }
    return { rows, left };
  };
  try { out.hook = run(true); out.nohook = run(false); } catch (e) { out.err = String(e && e.stack || e).slice(0, 400); }
  console.log(JSON.stringify(out));
  process.exit(0);
}

const go = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1075_CHILD: '1' }, env), encoding: 'utf8', maxBuffer: 1 << 25 }).trim().split('\n').pop());
console.log('\n=== T1075 행복 평형 하네스 ===\n');
const on = go({ T1075_HAPPY_EQ: '1', T1074_FOOD_DEBT: '1' }), off = go({ T1075_HAPPY_EQ: '', T1074_FOOD_DEBT: '1' });
ok(on.knob === true && off.knob === false && on.half === 30, '⑥ 손잡이 `T1075_HAPPY_EQ=1` 만 켬 · 반감기 30일');
ok(Math.abs(on.eq.up30 - 0.5) < 1e-9 && Math.abs(on.eq.down30 - 0.5) < 1e-9, '★① eqStep — 30일 뒤 거리 절반(낮으면 올라가고 높으면 내려간다)', JSON.stringify(on.eq));
ok(on.eq.one > 0.2 && on.eq.one < 0.8, '① 하루 걸음은 평형 쪽으로 조금', on.eq.one);
if (on.err) ok(false, '마을 판이 섰다', on.err);
else {
  const R = on.hook.rows;
  const drop = R.find((r) => r.d === 404);
  ok(R.every((r) => r.H != null && Math.abs(r.Hpub - r.H) < 1e-12), '★② 소비자는 실제 H 를 읽는다(lastStats.happiness = v._H)');
  ok(drop && drop.Heq < R[0].Heq && drop.H > drop.Heq, '★② 곳간이 빈 날 평형은 뚝 떨어져도 H 는 천천히 따라간다', drop ? `H ${drop.H.toFixed(3)} · H* ${drop.Heq.toFixed(3)} · 첫날 H* ${R[0].Heq.toFixed(3)}` : '');
  const debtDay = R.find((r) => r.d > 410);
  ok(R.some((r) => r.d > 405 && r.Heq < (R[2].Heq || 1) * 0.99), '★③ 빚이 쌓이면 평형이 더 내려간다(빚 0 = 무변)', debtDay ? debtDay.Heq.toFixed(3) : '');
  const st = R.find((r) => r.fdDead > 0);
  ok(!!st, '④ 전제 — 빚 죽음이 난 날이 있다(아니면 아래가 자명 통과다)', st ? st.d : '없음');
  if (st) {
    const prev = R[R.indexOf(st) - 1];
    // 그날 H 변화 = eqStep 걸음 + 계단(−1/N). 계단만 떼어 본다: 계단 없는 걸음은 평형 쪽 한 걸음뿐이다
    const k = 1 - Math.pow(0.5, 1 / 30), stepOnly = prev.H + k * (st.Heq - prev.H);
    ok(Math.abs((stepOnly - st.H) - st.fdDead / st.n0) < 0.02, '★④ 사망 계단 — 굶어 죽은 날 H 가 한 번에 약 1/N 더 내려간다', `걸음만 ${stepOnly.toFixed(4)} · 실제 ${st.H.toFixed(4)} · 1/N ${(1 / st.n0).toFixed(4)}`);
  }
  // ⑤ 압력 식 — 불행 몫(happy < 0)은 dP 를 음수로 만들지 못한다: dP = (나머지 > 0 ? max(0, 나머지 + happy) : 나머지) · 나머지 = logi + hunger + health + prestige
  const _exp = (g) => { const o = g.logi + g.hunger + g.health + g.prestige; return g.happy < 0 ? (o > 0 ? Math.max(0, o + g.happy) : o) : o + g.happy; };
  const bad = R.filter((r) => r.dbg && r.dbg.happy < 0 && !r.dbg.gated && Math.abs(r.dbg.dP - _exp(r.dbg)) > 0.002);
  ok(R.some((r) => r.dbg && r.dbg.happy < 0) && bad.length === 0, '★⑤ 불행은 죽이지 않는다 — 불행 몫은 출생만 깎고 기근 고리 압력(dP)을 음수로 못 민다', bad.length ? JSON.stringify(bad[0].dbg) : `불행 날 ${R.filter((r) => r.dbg && r.dbg.happy < 0).length}`);
  ok(on.hook.left.length > 0 && R[R.length - 1].emig === on.hook.left.length, '★⑤ 길 문이 있으면 불행 압력이 이탈로 — 문이 받은 사람만 마을을 떠난다', `떠남 ${on.hook.left.length}`);
  const NR = on.nohook.rows;
  ok(NR[NR.length - 1].emig === 0 && NR[NR.length - 1].lost > 0, '★⑤ 길 문이 없으면 아무도 안 떠난다(소멸 0) · 압력은 `_emigLost` 에 센다', `lost ${NR[NR.length - 1].lost.toFixed(2)}`);
  const OR = off.hook.rows;
  ok(OR.every((r) => r.H == null), '⑥ 끔 = H 칸이 안 선다');
  ok(OR.some((r) => r.dbg && r.dbg.happy < 0 && Math.abs(r.dbg.dP - (r.dbg.logi + r.dbg.hunger + r.dbg.health + r.dbg.prestige + r.dbg.happy)) < 0.002 && r.dbg.dP < (r.dbg.logi + r.dbg.hunger + r.dbg.health + r.dbg.prestige)),
    '⑤ 대조 — 끔이면 불행 몫이 기근 고리 압력에 그대로 더해진다(위가 자명 통과가 아니다)');
  const onD = R.reduce((a, r) => a + r.dead - r.fdDead, 0), offD = OR.reduce((a, r) => a + r.dead - r.fdDead, 0);
  ok(onD <= offD, '⑤ 빚 아닌 죽음(자리 · 연료 · 건강 몫)은 켬이 끔보다 많지 않다', `켬 ${onD} · 끔 ${offD}`);
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
