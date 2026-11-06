#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1095-mine-demand.js — 채굴 일괄도 수요 문에서 멈춘다 (T1095 · ★PM 11-02 문 7-c) ==========
//
// ★왜 [지시 T1095]
//   나무 · 채집 일괄은 그날 수요(econ 정본 `woodDemandLeft` · `forageDemandLeft` — 몸통 `actDemandLeft`)가 0 이면 멈춘다.
//   채굴 일괄(`villages._oreMineDaily`)만 수요와 무관하게 광부당 하루 14.73 덩이 × 깊이 효율을 셀에서 깎았다 — 수식 원석 0 인 날에도.
//   켬(`T1095_MINE_DEMAND` 기본): 같은 술어(`mineDemandLeft` — 몸의 수요 문 그 줄)로 그날 깎을 재고 덩이를
//   남은 수요 × 원석 한 단위 kg ÷ 덩이 kg 까지 자른다.
//   이 하네스는 **운영 함수 그대로**(`villages.__p3Bind()._oreMineDaily` · 진짜 econ `mineDemandLeft` · 진짜 specialty 깊이 · 덩이 식)를 부른다(사본 0).
//
// ★자명 통과 금지: ⓪ 끔 아이 판이 같은 세계 · 수요 0 날에 종전처럼 덩이를 깎음을 먼저 보인다 — 같은 자가 켬에서 0 을 내야 한다.
//
// 실행: node scripts/test-t1095-mine-demand.js
'use strict';
// T1188: 기존 원석/OFF 계약. 광물별 켬은 test-t1188-ore-split이 검사.
process.env.T1188_ORE_SPLIT='0';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const SUB = process.env.T1095_SUB || '';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const V = R('server/villages');
const SP = R('server/specialty');
const W8 = R('server/weights');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const K = SP.ORE_K;
// 한 마을 · 광맥 셀 여섯(재고 가득) · 광부 n 명(숙련 lvl) · 그날 수식 원석 D(econ 단위) · 오늘 이미 곳간에 든 몫 got
function run(o) {
  o = o || {};
  const stock = new Map();
  const cells = [];
  for (let i = 0; i < 6; i++) { cells.push({ cx: 100 + i, cy: 50, p: 0.5 - i * 0.01 }); stock.set((100 + i) + '_50', o.full != null ? o.full : K); }
  const n = o.n != null ? o.n : 4, lvl = o.lvl || 0;
  const npcs = []; for (let i = 0; i < n; i++) npcs.push({ id: i, currentJob: 'miner', skills: { mining: lvl } });
  const econ = { name: '광산', counts: { miner: n }, npcs, storage: { ore: 0 }, land: { ore: 1 }, _oreOutLast: o.D != null ? o.D : 0, _t724InflowToday: o.got || 0, _t724Walk: 0 };
  const vil = { dbId: 1, name: '광산', ccx: 100, ccy: 50, econ, _oreCells: cells, npcPids: [] };
  const deps = {
    oreStockAt: (cx, cy) => stock.get(cx + '_' + cy) || 0,
    oreConsumeAt: (cx, cy, a) => { if (!(a > 0)) return 0; const k = cx + '_' + cy, s = stock.get(k) || 0, g = Math.min(a, Math.max(0, s)); stock.set(k, s - g); return g; },
    ORE_K: K, NPC_MINE_PER_DAY: SP.NPC_MINE_PER_DAY, mineDepthCost: (f) => SP.mineDepthCost(f), mineDepthP: (f) => SP.mineDepthP(f), mineChunkKg: (l) => SP.mineChunkKg(l),
    players: new Map(), npcs: new Set(),
  };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [vil], dayMs: 30000, epoch: 0 });
  const r = H._oreMineDaily(vil);
  let left = 0; for (const v of stock.values()) left += v;
  return { on: H.T1095_MINE_DEMAND, consumed: r ? r.consumed : null, dug: +(6 * (o.full != null ? o.full : K) - left).toFixed(6), stat: H._t1095Stat };
}
if (SUB) {   // ── 아이 판(손잡이 끔 · 수요 문 끔 · 수요 칸 끔) ──
  const A = run({ D: 0 }), B = run({ D: 1e6 }), C = run({ D: 3 });
  process.stdout.write('\nT1095SUB ' + JSON.stringify({ A, B, C }) + '\n');
  process.exit(0);
}
const sub = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1095_SUB: '1' }, env), encoding: 'utf8' })
  .split('\n').find((l) => l.startsWith('T1095SUB ')).slice(9));

console.log('=== T1095 채굴 일괄 수요 문 ===');
const kgU = W8.kgOf('ore'), ck0 = SP.mineChunkKg(0);
const per = SP.NPC_MINE_PER_DAY, eff0 = SP.mineDepthP(1) / SP.mineDepthCost(1);
// ⓪ 끔 — 종전: 수요 0 날에도 광부 넷 × 14.73 × 깊이 효율
const OFF = sub({ T1095_MINE_DEMAND: '0' });
{
  ok(OFF.A.on === false && Math.abs(OFF.A.dug - 4 * per * eff0) < 1e-6, '⓪ 끔 — 수식 원석 0 인 날에도 광부 넷이 4 × 14.73 × 깊이 효율 덩이를 깎는다(종전)', JSON.stringify({ dug: OFF.A.dug, want: +(4 * per * eff0).toFixed(4) }));
  ok(OFF.A.dug === OFF.B.dug && OFF.A.dug === OFF.C.dug, '⓪ 끔 — 수요(0 · 3 · 큰 수)와 무관하게 같은 덩이', JSON.stringify([OFF.A.dug, OFF.C.dug, OFF.B.dug]));
}
ok(V.__p3Bind({}).T1095_MINE_DEMAND === true, '손잡이 켬 기본(`=0` 만 끔)');
// ① 켬 · 수요 0 날 — 안 깎는다(나무 · 채집 일괄과 같은 문)
{
  const r = run({ D: 0 });
  ok(r.dug === 0 && r.consumed === 0, '① 켬 — 수식 원석 0 인 날 = 0 덩이(광산1 그 꼴)', JSON.stringify({ dug: r.dug }));
  ok(r.stat.zero >= 1 && r.stat.cut >= 1, '① 계측 — 수요 0 날 · 자른 날로 센다', JSON.stringify({ zero: r.stat.zero, cut: r.stat.cut }));
}
// ② 켬 · 수요 3 단위 — 깎는 재고 덩이 = 3 × 원석 kg ÷ 덩이 kg
{
  const r = run({ D: 3 }), want = 3 * kgU / ck0;
  ok(Math.abs(r.dug - want) < 1e-6 && r.dug < OFF.C.dug, '② 켬 — 수요 3 단위 = 3 × 5.00kg ÷ 덩이 3.5kg 재고 덩이(곳간 단위 환산의 역 · 몸의 수요 문 그 꼴)', JSON.stringify({ dug: r.dug, want: +want.toFixed(4), off: OFF.C.dug }));
  const r2 = run({ D: 3, lvl: 10 }), want2 = 3 * kgU / SP.mineChunkKg(10);
  ok(Math.abs(r2.dug - want2) < 1e-6 && r2.dug < r.dug, '② 숙련 10 — 덩이가 커서(×1.5) 같은 수요에 덜 깎는다', JSON.stringify({ dug: r2.dug, want: +want2.toFixed(4) }));
}
// ③ 켬 · 오늘 이미 든 몫 — 남은 수요 = D − 오늘치
{
  const r = run({ D: 3, got: 1 }), want = 2 * kgU / ck0;
  ok(Math.abs(r.dug - want) < 1e-6, '③ 켬 — 오늘 곳간에 이미 1 단위 = 남은 2 단위만큼', JSON.stringify({ dug: r.dug, want: +want.toFixed(4) }));
}
// ④ 켬 · 수요가 손을 넘는 날 — 종전과 같다(문이 안 물린다)
{
  const r = run({ D: 1e6 });
  ok(r.dug === OFF.B.dug, '④ 켬 — 수요가 광부 하루 몫보다 크면 종전 그대로(같은 덩이)', JSON.stringify({ on: r.dug, off: OFF.B.dug }));
}
// ⑤ 바깥 문이 꺼진 판 — 수요 문(`T374_DEMAND_STOP=0`) · 수요 칸(`T724_MINE_ACT=0`)이 없으면 자르지 않는다
{
  const a = sub({ T374_DEMAND_STOP: '0' }), b = sub({ T724_MINE_ACT: '0' });
  ok(a.A.on === true && a.A.dug === OFF.A.dug, '⑤ T374 수요 문 끔 — 켬이어도 종전 그대로(Infinity)', JSON.stringify({ dug: a.A.dug }));
  ok(b.A.on === true && b.A.dug === OFF.A.dug, '⑤ T724 수요 칸 끔 — 켬이어도 종전 그대로', JSON.stringify({ dug: b.A.dug }));
}
// ⑥ 깊은 셀 — 재고 반 셀에서도 남은 수요 덩이까지(깊이 효율은 진척만 늦춘다)
{
  const r = run({ D: 3, full: K / 2 }), want = 3 * kgU / ck0;
  ok(Math.abs(r.dug - want) < 1e-6, '⑥ 재고 반 셀 — 깎은 재고 덩이 = 같은 수요 덩이', JSON.stringify({ dug: r.dug }));
}
// ⑦ 글자 — 같은 술어(사본 0) · 손잡이 글자
{
  const SV = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(/const T1095_MINE_DEMAND = process\.env\.T1095_MINE_DEMAND !== '0';/.test(SV), '⑦ 손잡이 글자(켬 기본 · `=0` 끔)');
  const body = SV.slice(SV.indexOf('function _oreMineDaily('), SV.indexOf('function _oreFeedback('));
  ok(/_lifeEcon\(\)\.mineDemandLeft\(vil\.econ\)/.test(body) && !/actDemandLeft\(/.test(body), '⑦ 일괄은 econ 정본 `mineDemandLeft` 를 부른다(수요 식을 다시 안 짠다)');
  ok((SV.match(/mineDemandLeft\(/g) || []).length >= 2, '⑦ 몸의 수요 문(`_t724BodyStep`)과 같은 술어');
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
