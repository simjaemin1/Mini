#!/usr/bin/env node
// @regress
// === scripts/test-army-morale.js — 원정 사기 평형 · 군량 빚(T1076 · 손잡이 `T1076_ARMY_MORALE`) ===
//   ★왜 — ★재민 11-02 문 2-b: 원정이 굶으면 둘 다 — 짐이 떨어지면 몸에 빚이 쌓이고(T1074 시계 14날), 그동안 사기 평형이 내려가고,
//     죽음이 나오면 사기가 계단으로 뚝. 평형 회귀는 함수 한 곳(`sim/equilibrium.js` — T1075 마을 행복이 같은 함수를 쓴다).
//   재는 것:
//     ① 평형 함수 — 반감기 h 날이면 h 날 뒤 차이가 절반 · 바닥 · 계단.
//     ② 끔이 기본 — 선포한 전쟁에 사기 칸이 안 선다 · 하루 · 계단 문이 무동작(null) · battle-core 는 칸이 없으면 종전과 같은 판.
//     ③ 켬 — 짐이 넉넉하면 사기 1 그대로 · 짐 0 이면 14날 뒤 0.5 · 빚 7날이면 평형 0.5 · 전사 4/20 이면 M_KABS × 0.2 만큼 뚝.
//     ④ 결단 — 사기가 battle-core 궤주 문턱(`M_BREAK`) 밑이면 주둔 결단이 철수다(그 위면 이 줄은 안 돈다 — 다른 결단 그대로).
//        짐 0 인 원정은 며칠째에 무너지나(자명 통과 금지 — 첫날엔 안 무너진다).
//     ⑤ 교전 — 같은 판(같은 씨)에서 편 칸 `armyMrl` 이 1 · 없음이면 바이트 같은 결과 · 0.3 이면 그 편이 먼저 흔들린다(결과가 갈린다).
//     ⑥ 랩 — 전쟁실험실 인라인 battle-core 가 sim/battle-core.js 와 바이트 같다(T1076 줄 포함).
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

if (process.env.T1076_SUB) {   // 아이 판 — 손잡이를 모듈 적재 앞에 정한 판
  const WC = R('sim/war-core.js'), BC = R('sim/battle-core.js');
  const out = {};
  const inst = WC.createWar({ villages: [], world: { day: 400, _warWars: [], _warTributes: [], _warSeq: 1 }, seed: 1, log: null });
  out.on = inst.T1076_ON();
  const w = (m) => ({ id: 1, force: 20, _mrl: m, _mrlForce: 20, phase: 'march', op: 'camp', marchDays: 2, atk: { name: '가', econ: { npcs: [] } }, def: { name: '나', econ: { npcs: [] } } });
  // ③ 하루 · 계단
  const a = w(1); for (let d = 0; d < 14; d++) inst.armyMoraleDay(a, 1, 0); out.full14 = a._mrl;
  const b = w(1); for (let d = 0; d < 14; d++) inst.armyMoraleDay(b, 0, 0); out.empty14 = b._mrl;
  const c = w(1); for (let d = 0; d < 200; d++) inst.armyMoraleDay(c, 1, 7); out.debt7eq = c._mrl; out.debt7target = c._mrlEq;
  const e = w(1); inst.armyMoraleLoss(e, 4); out.loss4 = e._mrl; out.KABS = BC.M_KABS; out.BREAK = BC.M_BREAK;
  const f = w(undefined); out.noSlotDay = inst.armyMoraleDay(f, 0, 0); out.noSlotLoss = inst.armyMoraleLoss(f, 3);
  // ④ 결단 — 짐 0 원정이 무너지는 날
  const g = w(1); g._opPolicy = 'assault'; let brokeDay = null;   // 정책 돌격 — 결단이 승산(마을 econ)을 안 묻는다(이 판은 사기 줄만 잰다)
  for (let d = 1; d <= 60 && brokeDay == null; d++) { inst.armyMoraleDay(g, 0, d); inst._opNpcDecide(g, 400 + d); if (g.op === 'withdraw') brokeDay = d; }
  out.brokeDay = brokeDay; out.brokeMrl = g._mrl; out.brokePhase = g.phase;
  const h = w(BC.M_BREAK + 0.01); h._opPolicy = 'assault'; inst._opNpcDecide(h, 401); out.aboveOp = h.op;   // 문턱 위 — 다른 결단(정책 돌격) 그대로
  // ② 끔 판 — 선포 칸 확인은 소스 글자로(선포는 econ 세계가 필요) · 여기선 칸이 없는 원정의 문이 null 인지
  fs.writeSync(1, JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const kid = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1076_SUB: '1' }, env), encoding: 'utf8' }));
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
console.log('\n=== 원정 사기 평형 · 군량 빚 (T1076 · `T1076_ARMY_MORALE`) ===');

console.log('\n① 평형 함수(`sim/equilibrium.js`)');
{
  const Eq = R('sim/equilibrium.js');
  let x = 1; for (let d = 0; d < 14; d++) x = Eq.step(x, 0, 14, 1);
  ok(near(x, 0.5, 1e-12), '반감기 14날 — 평형 0 쪽으로 14날 뒤 차이 절반', x.toFixed(6));
  let y = 0.2; for (let d = 0; d < 30; d++) y = Eq.step(y, 0.8, 30, 1);
  ok(near(y, 0.5, 1e-12), '낮으면 오른다 — 0.2 → 평형 0.8 · 반감기 30날 뒤 0.5', y.toFixed(6));
  ok(Eq.step(0.3, 0.3, 14) === 0.3 && Eq.step(0.6, 0.9, 0) === 0.9, '평형이면 무변 · 반감기 0 이면 그날 평형');
  ok(Eq.drop(0.5, 0.2) === 0.3 && Eq.drop(0.1, 0.5) === 0 && Eq.drop(0.4, 0.5, 0.2) === 0.2 && Eq.drop(0.4, -1) === 0.4, '계단 — 깎기 · 바닥 0 · 바닥 지정 · 음수 무변');
  ok(Eq.step(2, 5, 14) <= 1 && Eq.step(-1, -2, 14) >= 0, '0~1 로 자른다');
}

console.log('\n② ★[T1168 K2] 켬이 기본 · `=0` 이 끔');
const off = kid({ T1076_ARMY_MORALE: '0' });
const dflt = (() => { const env = Object.assign({}, process.env, { T1076_SUB: '1' }); delete env.T1076_ARMY_MORALE; return JSON.parse(execFileSync(process.execPath, [__filename], { env, encoding: 'utf8' })); })();
{
  ok(dflt.on === true && near(dflt.empty14, 0.5, 1e-9), '★env 없음 = 켬(T1168 · 켬 기본) — 짐 0 이면 14날 뒤 0.5', `${dflt.on} · ${dflt.empty14}`);
  ok(off.on === false, '★`T1076_ARMY_MORALE=0` = 끔(되돌림)', off.on);
  ok(off.full14 === 1 && off.empty14 === 1 && off.loss4 === 1 && off.brokeDay === null, '끔 — 하루 · 계단 · 결단 문이 무동작(사기 칸 그대로 · 철수 0)', JSON.stringify({ e: off.empty14, l: off.loss4, b: off.brokeDay }));
  const WS = fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8');
  ok(/if \(_t1076On\(\)\) \{ _war\._mrl = 1;/.test(WS), '선포 칸은 켬에서만 선다(`_war._mrl` — 끔이면 원정 객체 무변)');
}

console.log('\n③ 켬 — 하루 · 계단');
const on = kid({ T1076_ARMY_MORALE: '1' });
{
  ok(on.on === true, '★`T1076_ARMY_MORALE=1` 이면 켬', on.on);
  ok(on.full14 === 1, '짐 넉넉 · 빚 0 — 사기 1 그대로(14날)', on.full14);
  ok(near(on.empty14, 0.5, 1e-9), '★짐 0 — 14날 뒤 0.5(반감기 = 14날 · ★재민 T1074 시계)', on.empty14);
  ok(near(on.debt7target, 0.5) && near(on.debt7eq, 0.5, 1e-3), '★빚 7날 — 평형 1 − 7/14 = 0.5 로 수렴(짐은 넉넉해도)', `${on.debt7target} · ${on.debt7eq.toFixed(6)}`);
  ok(near(on.loss4, 1 - on.KABS * 4 / 20), '★전사 4/20 — 사기가 M_KABS × 0.2 만큼 뚝(battle-core 제 사상 계수)', `${on.loss4} (M_KABS ${on.KABS})`);
  ok(on.noSlotDay === null && on.noSlotLoss === null, '켬이어도 칸이 없는 원정(끔 때 선포 · 재기동)은 무동작');
}

console.log('\n④ 결단 — 사기 붕괴 철수');
{
  const exp = Math.ceil(14 * Math.log(on.BREAK) / Math.log(0.5) + 1e-9);   // 짐 0 · 평형 0 — ½^(d/14) < M_BREAK 인 첫 날
  ok(on.brokeDay != null && on.brokeDay > 1, '★★자명 통과 금지 — 짐 0 원정도 첫날엔 안 무너진다', on.brokeDay);
  ok(on.brokeDay === exp && on.brokeMrl < on.BREAK && on.brokePhase === 'return', `★짐 0 원정은 ${exp}날째 무너져 철수 · 귀환(사기 < M_BREAK ${on.BREAK})`, `날 ${on.brokeDay} · 사기 ${on.brokeMrl.toFixed(3)}`);
  ok(on.aboveOp === 'assault', '문턱 위면 이 줄은 안 돈다 — 다른 결단(돌격 정책) 그대로', on.aboveOp);
}

console.log('\n⑤ 교전 — 편 칸 `armyMrl`');
{
  const BC = R('sim/battle-core.js');
  const run = (am) => {
    const spec = { A: { spear: 20, archer: 6 }, B: { spear: 20, archer: 6 } };
    const rng = (() => { let s = 12345 >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
    const h = BC.createBattle ? BC.createBattle(spec, { rng }) : null;
    if (!h) return null;
    if (am !== undefined) h.ctx.sides.A.armyMrl = am;
    let t = 0; while (!h.result && t < 4000) { h.step(1 / 30); t++; }
    return { winner: h.result ? (h.result.win || null) : null, aDead: h.sides.A.dead, bDead: h.sides.B.dead, tick: h.tick, rA: h.units.filter((u) => u.side === 'A' && u.routing).length };
  };
  const base = run(undefined), one = run(1), low = run(0.3);
  ok(base && one && JSON.stringify(base) === JSON.stringify(one), '칸 1 = 칸 없음(같은 씨 · 같은 판 — 바이트 같은 결과)', JSON.stringify(base));
  ok(low && JSON.stringify(low) !== JSON.stringify(base), '★칸 0.3 — 판이 갈린다(그 편 사기 목표가 눌린다)', JSON.stringify(low));
  ok(low && (low.aDead >= base.aDead || low.winner !== base.winner || low.tick < base.tick), '낮은 사기 편이 더 잃거나 · 지거나 · 더 빨리 끝난다', `${base.winner}/${base.aDead} → ${low.winner}/${low.aDead}`);
}

console.log('\n⑥ 랩 — 인라인 battle-core');
{
  const H = fs.readFileSync(path.join(ROOT, 'lab', '전쟁실험실.html'), 'utf8');   // t1031-lab-replay 의 같음 판정 그대로
  const blk = H.slice(H.indexOf('<!-- BATTLE-CORE'), H.indexOf('<!-- /BATTLE-CORE -->'));
  const src = blk.slice(blk.indexOf('<script>\n') + '<script>\n'.length, blk.lastIndexOf('\n</script>'));
  const file = fs.readFileSync(path.join(ROOT, 'sim', 'battle-core.js'), 'utf8').replace(/<\/script>/g, '<\\/script>');
  ok((src === file || src === file.replace(/\n$/, '')) && /armyMrl/.test(src), '★전쟁실험실 인라인 battle-core = sim/battle-core.js 바이트 같음(T1076 줄 포함 · `node sim/inline-battle.js lab/전쟁실험실.html`)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
