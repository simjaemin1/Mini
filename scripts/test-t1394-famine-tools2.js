#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3
// === scripts/test-t1394-famine-tools2.js — T1394 굶주림 ↔ 도구 나선 둘째: 손잡이 셋(다 끔 기본 · 끔 = 종전) + 랩 손잡이 자리 ===
//   ㉠ `T1394_NARROW` — T1363 전환 문의 좁은 꼴: 기근 블록 · 치명 도구에서 쪼을 돌이 있는 석공만 남긴다("돌 모자람" 갈래 — 돌 없는 석공 · 채집꾼 남김 — 0)
//   ㉡ `T1394_STONE_PICK` — 기근 블록 안에서도 돌 줍는 몫이 석기 수요만큼 선다(피커 차례 · 아래 ④)
//   ㉢ `T1394_MASON_FLOW` — 석공 목표의 석공 1인 산출 = 생산 단계 식(`JOBS.mason.base × (1 + 숙련 × 0.05)`) · 종전 0.5 근사
//   ① 손잡이 — 빈 값 = 끔 · env `'1'` = 켬 · 랩 자리 `window.<이름> = '1'`(부를 때 읽는다 — env 없이 켜진다 · T1363 손잡이도 같은 자리)
//   ② ㉠ 전환 문(정본 `autoSwitchJob` · 합리 피커 · 식량 값 200 · 사람 30 · 곳간 5일치 · 그날 게임 달력 2년 4월 10일) —
//      A 도구 0 · 곳간 돌 0 · 땅 돌 0.3 · 석공 셋 · 채집꾼 둘(피커가 채집꾼을 낸다): 끔 = 석공이 채집꾼으로 · T1363 넓은 꼴 = 석공 남음 · ㉠ = 석공이 옮긴다(쪼을 돌 없음)
//      B 도구 0 · 곳간 돌 1(쪼을 돌 있음) · 땅 돌 0.2 · 석공 셋 + 농부: 끔 = 석공이 농부로 · ㉠ = 그날 전환 0(석공 남음)
//      C 넓은 꼴 + 좁은 꼴 같이 = 좁은 꼴(A 에서 석공이 옮긴다)
//   ③ ㉢ 석공 목표 — 석공 1인 산출(숙련 0 → 0.4 · 숙련 10 → 0.6) · 큰 마을(도구 0)의 목표 켬/끔 ≈ 0.5/0.4 = 1.25(반올림 안)
//   ④ ㉡ 피커(정본 `pickDeficitJob_rational` 을 전환 문으로 — 그날 낸 일) — (아래 머리말 그대로)
//   ★미끼 셋(이 파일 안 · 바꾼 자리 정확히 1곳 · 빨강이 될 줄을 단언):
//     ⓐ ㉠ 남김 식을 `t1363StoneReady(v)` → `true` 로 바꾼 econ 사본 → ② "㉠ A — 석공이 옮긴다" 가 빨강
//     ⓑ ㉢ 석공 1인 산출을 `JOBS.mason.base` → `0.5` 로 바꾼 econ 사본 → ③ "숙련 0 = 0.4" 가 빨강
//     ⓒ ㉡ 피커 줄의 석기 수요 몫을 0 으로 바꾼 econ 사본 → ④ "켬 F — 채집꾼" 이 빨강
//   날짜 · 벽시계 0 — 날은 게임 달력(`dayOf`)으로만 고른다.
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const F_E = path.join(ROOT, 'sim', 'economy-sim.js');
const BAITS = {
  narrow: ['const _t63Mason = _t94n ? t1363StoneReady(v) :', 'const _t63Mason = _t94n ? true :'],
  flow: ['return JOBS.mason.base * (1 + sk * 0.05);', 'return 0.5 * (1 + sk * 0.05);'],
  pick: ['const _need = masonTarget(v) * stoneWorkStock(v);', 'const _need = 0;'],
};
const KNOBS = ['T1363_FAMINE_TOOLS', 'T1394_NARROW', 'T1394_STONE_PICK', 'T1394_MASON_FLOW', 'T1394_TEST_BAIT', 'T1394_TEST_WIN', 'T1334_BUNDLE'];

// ── 아이 — 손잡이 env 는 어버이가 준다 · BAIT 면 econ 원문 한 곳을 바꿔 컴파일 · WIN 이면 require 뒤에 `window` 를 세운다(랩 자리) ──
if (process.argv[2] === '--child') {
  const out = { bait: null };
  const B = process.env.T1394_TEST_BAIT;
  if (B) {
    const orig = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, filename) {
      if (filename !== F_E) return orig(m, filename);
      let src = fs.readFileSync(filename, 'utf8');
      const [a, b] = BAITS[B];
      const n = src.split(a).length - 1;
      out.bait = n;
      if (n === 1) src = src.replace(a, b);
      m._compile(src, filename);
    };
  }
  const C = require(path.join(ROOT, 'server', 'calendar'));
  const E = require(F_E);
  if (process.env.T1394_TEST_WIN) { global.window = {}; for (const k of process.env.T1394_TEST_WIN.split(',')) global.window[k] = '1'; }
  out.on = { narrow: E.t1394NarrowOn(), pick: E.t1394StonePickOn(), flow: E.t1394MasonFlowOn(), ft: E.t1363FtOn() };
  const day = C.dayOf(2, 4, 10);
  const world = { picker: 'rational', priceFn: () => new Proxy({}, { get: (t, k) => (k === 'food' || k === 'fish' || k === 'meat' || k === 'cooked_food') ? 200 : 1 }) };
  const mk = (o) => {
    E.setSeed(7);
    const v = E.createVillage({ name: '시험', initialPop: o.N || 30, fertility: o.fert != null ? o.fert : 0.8, water: 0.3, game: 0.3, wood: 1, ore: 0, stone: o.landStone, size: 200 });
    let k = 0;
    for (const n of v.npcs) { n.currentJob = k < (o.mason != null ? o.mason : 3) ? 'mason' : (k < (o.mason != null ? o.mason : 3) + (o.forager || 0) ? 'forager' : 'farmer'); n.lastJobChangeDay = -999; k++; }
    v.counts = {}; for (const n of v.npcs) v.counts[n.currentJob] = (v.counts[n.currentJob] || 0) + 1;
    for (const r in v.storage) if (typeof v.storage[r] === 'number') v.storage[r] = 0;
    v.storage.food = (o.N || 30) * (o.foodDays != null ? o.foodDays : 5); v.storage.tool = o.tool; v.storage.stone = o.stone || 0;
    return v;
  };
  const run = (o) => {
    const v = mk(o);
    const sw = E._autoSwitchJobForTest; if (typeof sw !== 'function') return null;
    sw(v, day, world);
    return { need: v._dbgSwitch ? v._dbgSwitch.need : null, counts: Object.assign({}, v.counts) };
  };
  out.A = run({ landStone: 0.3, forager: 2, tool: 0 });
  out.B = run({ landStone: 0.2, forager: 0, tool: 0, stone: 1 });
  // ③ ㉢ — 석공 1인 산출 · 큰 마을 목표
  const vm = mk({ landStone: 0.3, tool: 0, N: 200, mason: 1 });
  out.out0 = E.t1394MasonOut(vm);
  vm.npcs[0].skills.masonry = 10; out.out10 = E.t1394MasonOut(vm); vm.npcs[0].skills.masonry = 0;
  out.mt = E.masonTarget(vm);
  // ④ ㉡ — 피커(전환 문이 그날 낸 일) — F 도구 반(치명 아님 · 목표 밑) · 곳간 돌 0 · 땅 돌 0.3 · 채집꾼 0 · 곳간 5일치 / G 같은데 채집꾼이 석기 수요만큼(넉넉) / H 도구 넉넉 / I 땅 돌 0.2
  out.F = run({ landStone: 0.3, forager: 0, tool: 25, mason: 1 });
  out.G = run({ landStone: 0.3, forager: 6, tool: 25, mason: 1 });
  out.H = run({ landStone: 0.3, forager: 0, tool: 60, mason: 1 });
  out.I = run({ landStone: 0.2, forager: 0, tool: 25, mason: 1 });
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const child = (env) => {
  const e = Object.assign({}, process.env);
  for (const k of KNOBS) delete e[k];
  Object.assign(e, env);
  const r = spawnSync(process.execPath, [__filename, '--child'], { env: e, encoding: 'utf8', timeout: 120000 });
  try { return JSON.parse(r.stdout); } catch (err) { return { err: (r.stderr || String(err)).slice(0, 400) }; }
};
const OFF = child({});
const NAR = child({ T1394_NARROW: '1' });
const WIDE = child({ T1363_FAMINE_TOOLS: '1' });
const BOTH = child({ T1363_FAMINE_TOOLS: '1', T1394_NARROW: '1' });
const FLOW = child({ T1394_MASON_FLOW: '1' });
const PICK = child({ T1394_STONE_PICK: '1' });
const WIN = child({ T1394_TEST_WIN: 'T1394_NARROW,T1394_STONE_PICK,T1394_MASON_FLOW,T1363_FAMINE_TOOLS' });
const WINN = child({ T1394_TEST_WIN: 'T1394_NARROW' });
const BN = child({ T1394_NARROW: '1', T1394_TEST_BAIT: 'narrow' });
const BF = child({ T1394_MASON_FLOW: '1', T1394_TEST_BAIT: 'flow' });
const BP = child({ T1394_STONE_PICK: '1', T1394_TEST_BAIT: 'pick' });
const ms = (r) => (r && r.counts ? (r.counts.mason || 0) : null);

console.log('① 손잡이 · 랩 자리');
ok(!!OFF.on && Object.values(OFF.on).every((x) => x === false), '끔 = 빈 값(셋 다 · T1363 도)', OFF.on);
ok(NAR.on && NAR.on.narrow === true && NAR.on.pick === false && FLOW.on.flow === true && PICK.on.pick === true, "env '1' = 그 손잡이만 켬", [NAR.on, FLOW.on, PICK.on]);
ok(!!WIN.on && Object.values(WIN.on).every((x) => x === true), "랩 자리 — env 없이 `window.<이름> = '1'` 이면 켬(넷 다)", WIN.on);

console.log('② ㉠ 좁은 꼴(정본 `autoSwitchJob` · 식량 값 200 · 곳간 5일치 · 석공 셋)');
ok(!!(OFF.A && OFF.A.need === 'forager' && ms(OFF.A) === 2), '끔 A — 피커가 채집꾼을 내고 석공이 채집꾼으로(전제)', OFF.A);
ok(!!(WIDE.A && ms(WIDE.A) === 3), 'T1363 넓은 꼴 A — 쪼을 돌 없어도 석공 남음(돌 모자람 갈래 · 전제)', WIDE.A);
const NAR_A = 'narrow-A';
ok(!!(NAR.A && NAR.A.need === 'forager' && ms(NAR.A) === 2 && JSON.stringify(NAR.A) === JSON.stringify(OFF.A)), '㉠ A — 쪼을 돌이 없으면 석공을 안 남긴다(끔과 같다 · 돌 모자람 갈래 0)', { id: NAR_A, got: NAR.A });
ok(!!(OFF.B && OFF.B.need === 'farmer' && ms(OFF.B) === 2), '끔 B — 옮길 수 있는 사람이 석공뿐이면 석공이 농부로(전제)', OFF.B);
ok(!!(NAR.B && ms(NAR.B) === 3 && NAR.B.counts.farmer === 27), '㉠ B — 쪼을 돌이 있으면 석공 남음(그날 전환 0)', NAR.B);
ok(!!(BOTH.A && ms(BOTH.A) === 2 && BOTH.B && ms(BOTH.B) === 3), '넓은 꼴 + ㉠ 같이 = 좁은 꼴(A 석공 옮김 · B 남음)', { A: BOTH.A, B: BOTH.B });
ok(!!(WINN.B && ms(WINN.B) === 3 && JSON.stringify(WINN.B) === JSON.stringify(NAR.B)), '랩 자리로 켠 ㉠ 도 env 로 켠 것과 같은 줄(B 석공 남음)', WINN.B);

console.log('③ ㉢ 석공 목표 — 석공 1인 산출 = 생산 단계 식');
const OUT0 = 'flow-out0';
ok(OFF.out0 === 0.4 && FLOW.out0 === 0.4, '석공 1인 산출 — 숙련 0 = 0.4(`JOBS.mason.base`)', { id: OUT0, off: OFF.out0, on: FLOW.out0 });
ok(Math.abs(FLOW.out10 - 0.6) < 1e-9, '석공 1인 산출 — 숙련 10 = 0.6(× 1.5)', FLOW.out10);
ok(OFF.mt > 0 && FLOW.mt > OFF.mt && Math.abs(FLOW.mt / OFF.mt - 1.25) < 0.08, '큰 마을(200명 · 도구 0) 목표 — 켬/끔 ≈ 0.5/0.4 = 1.25(반올림 안)', { off: OFF.mt, on: FLOW.mt });

console.log('④ ㉡ 기근 블록 안 돌 줍는 몫(정본 피커 · 전환 문이 그날 낸 일)');
const PICK_F = 'pick-F';
ok(!!(OFF.F && OFF.F.need === 'farmer'), '끔 F — 도구 반(치명 아님) · 돌 0 · 채집꾼 0 · 기근 블록 = 농부(돌 줄 앞에서 식량 일 · 전제)', OFF.F);
ok(!!(PICK.F && PICK.F.need === 'forager'), '켬 F — 석기 수요(석공 목표 × 하루 재료)를 주울 채집꾼이 모자라면 기근 블록 안에서도 채집꾼', { id: PICK_F, got: PICK.F });
ok(!!(PICK.G && OFF.G && PICK.G.need === OFF.G.need), '켬 G — 채집꾼이 석기 수요만큼 있으면 끔과 같다(사람을 박아 두지 않는다)', { on: PICK.G, off: OFF.G });
ok(!!(PICK.H && OFF.H && PICK.H.need === OFF.H.need), '켬 H — 도구가 목표만큼 있으면(60) 끔과 같다(수요 0)', { on: PICK.H, off: OFF.H });
ok(!!(PICK.I && OFF.I && PICK.I.need === OFF.I.need), '켬 I — 돌밭 없는 마을(땅 돌 0.2)은 끔과 같다', { on: PICK.I, off: OFF.I });

console.log('★미끼 ⓐ — ㉠ 남김 식을 늘 참으로 바꾼 econ 사본');
ok(BN.bait === 1 && !!BN.A && ms(BN.A) !== 2, "★미끼 ⓐ — 바꾼 자리 1곳(㉠ 남김 식) · 사본에선 ② '㉠ A — 석공을 안 남긴다' 가 빨강", { n: BN.bait, A: BN.A });
console.log('★미끼 ⓑ — ㉢ 석공 1인 산출을 0.5 로 바꾼 econ 사본');
ok(BF.bait === 1 && BF.out0 !== 0.4, "★미끼 ⓑ — 바꾼 자리 1곳(`t1394MasonOut`) · 사본에선 ③ '숙련 0 = 0.4' 가 빨강", { n: BF.bait, got: BF.out0 });
console.log('★미끼 ⓒ — ㉡ 석기 수요 몫을 0 으로 바꾼 econ 사본');
ok(BP.bait === 1 && !!BP.F && BP.F.need !== 'forager', "★미끼 ⓒ — 바꾼 자리 1곳(㉡ 수요 몫) · 사본에선 ④ '켬 F — 채집꾼' 이 빨강", { n: BP.bait, F: BP.F });

console.log(`\n${fail ? '✗' : '✓'} test-t1394-famine-tools2 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
