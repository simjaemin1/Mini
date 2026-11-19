#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2
// === scripts/test-t1363-famine-tools.js — T1363 기근 블록이 석공 · 돌 일을 빼 가지 않는다(`T1363_FAMINE_TOOLS` · 끔 기본) ===
//   굶주림 ↔ 도구 나선(보고 T1363 §1): 곳간이 사람 × 30일치 밑이면 전환이 잦아지고(10일치 밑이면 날마다 2명), 전환 문은 기회비용이 가장 낮은 사람을
//   식량 일로 옮긴다 — 석공 값은 목표 안이어도 고정 50 · 식량 일꾼 값은 그날 식량 값을 따라 올라, 굶는 날일수록 석공이 먼저 빠진다.
//   켬 — 기근 블록(곳간 < 사람 × 30) · 도구 바닥(곳간 도구 < 도구 쓰는 일꾼 × 0.7 — 피커 S2 의 그 식 `t1363ToolCrit`)에서 식량 일로 옮길 사람을 고를 때
//        석공은 쪼을 돌이 있거나(`t1363StoneReady` — 피커 S2 석공 문 그 식) 돌을 주워 오는 중이면 남기고 · 돌이 모자라면(기근 블록 뒤 STONE_NET 재료 줄 그 식
//        `t1363StoneShort`) 채집꾼도 남긴다 · 돌도 돌밭도 없는 마을의 석공은 종전대로 옮긴다(남겨도 석기를 못 쪼는다).
//   ① 손잡이 — 빈 값 = 끔 · `'1'` = 켬
//   ② 식 둘(정본 함수 그대로) — 치명 도구: 일꾼 10 · 석기 6.9 = 치명 · 7 = 아님(경계) · 철 3 + 석기 3.9 = 치명(셋을 더한다) · 일꾼 0 = 아님 /
//      돌 모자람: 땅 돌 0.3 · 곳간 돌 0 = 모자람 · 땅 돌 0.2 = 아님(돌밭 없는 마을은 채집꾼이 돌을 못 줍는다) · 곳간 돌 = 재료 × 석공 목표 = 아님(경계) /
//      쪼을 돌: 곳간 돌 = 석공 하루 재료 = 있음(경계) · 그 밑 = 없음
//   ③ 전환 문(정본 `autoSwitchJob` — 합리 피커 · 식량 값 200 · 사람 30 · 곳간 5일치 · 그날 4월 10일) —
//      A 도구 0 · 돌 0 · 땅 돌 0.3(피커가 돌 줍는 채집꾼을 낸다): 끔 = 석공이 채집꾼으로 옮긴다(나선 · 셋째 줄의 전제) · 켬 = 석공 셋 남고 농부가 옮긴다
//      B 도구 0 · 곳간 돌 1(쪼을 돌 있음) · 땅 돌 0.2 · 석공 셋 + 농부(피커가 농부를 낸다 · 옮길 수 있는 사람이 석공뿐): 끔 = 석공이 농부로 · 켬 = 그날 전환 0(석공 남음)
//      E 도구 0 · 곳간 돌 0 · 땅 돌 0.2(쪼을 돌도 주울 돌밭도 없다) — 켬이어도 끔과 같다(석공이 농부로 · 남겨도 석기를 못 쪼는다)
//      D 도구 넉넉(60) — 켬이어도 끔과 같다(문은 도구 바닥에서만 선다)
//   ★미끼 둘(이 파일 안 · 바꾼 자리 정확히 1곳 · 빨강이 될 줄을 단언):
//     ⓐ 전환 문의 남김 줄을 뺀 econ 사본 → ③ "켬 A · 석공 셋 남는다" 가 빨강
//     ⓑ 치명 도구 문턱 0.7 → 0.5 인 econ 사본(`t1363ToolCrit` 안 한 글자) → ② "일꾼 10 · 석기 6.9 = 치명" 이 빨강
//   날짜 · 벽시계 0 — 날은 게임 달력(`dayOf`)으로만 고른다.
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const F_E = path.join(ROOT, 'sim', 'economy-sim.js');
const KEEP_LINE = "    if ((_t63Mason && n.currentJob === 'mason') || (_t63Stone && n.currentJob === 'forager')) continue;   // ★[T1363] 석공 · 돌 일은 남긴다\n";
const CRIT_A = 'return _toolStock < _td * 0.7;', CRIT_B = 'return _toolStock < _td * 0.5;';

// ── 아이 — 손잡이 env 는 어버이가 준다 · BAIT=keep|crit 면 econ 원문 한 곳을 바꿔 컴파일 ──
if (process.argv[2] === '--child') {
  const out = { bait: null };
  const B = process.env.T1363_TEST_BAIT;
  if (B) {
    const orig = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, filename) {
      if (filename !== F_E) return orig(m, filename);
      let src = fs.readFileSync(filename, 'utf8');
      const [a, b] = B === 'keep' ? [KEEP_LINE, ''] : [CRIT_A, CRIT_B];
      const n = src.split(a).length - 1;
      out.bait = n;
      if (n === 1) src = src.replace(a, b);
      m._compile(src, filename);
    };
  }
  const C = require(path.join(ROOT, 'server', 'calendar'));
  const E = require(F_E);
  out.on = E.T1363_FAMINE_TOOLS;
  out.crit69 = typeof E.t1363ToolCrit === 'function' ? E.t1363ToolCrit({ counts: { farmer: 10 }, storage: { tool: 6.9 } }) : null;
  const day = C.dayOf(2, 4, 10);
  const world = { picker: 'rational', priceFn: () => new Proxy({}, { get: (t, k) => (k === 'food' || k === 'fish' || k === 'meat' || k === 'cooked_food') ? 200 : 1 }) };
  const run = (o) => {
    E.setSeed(7);
    const v = E.createVillage({ name: '시험', initialPop: 30, fertility: 0.8, water: 0.3, game: 0.3, wood: 1, ore: 0, stone: o.landStone, size: 200 });
    let k = 0;
    for (const n of v.npcs) { n.currentJob = k < 3 ? 'mason' : (k < 3 + o.forager ? 'forager' : 'farmer'); n.lastJobChangeDay = -999; k++; }
    v.counts = {}; for (const n of v.npcs) v.counts[n.currentJob] = (v.counts[n.currentJob] || 0) + 1;
    for (const r in v.storage) if (typeof v.storage[r] === 'number') v.storage[r] = 0;
    v.storage.food = 30 * 5; v.storage.tool = o.tool; v.storage.stone = o.stone || 0;   // 5일치 — 깊은 기근(날마다 2명 전환 칸)
    const sw = E._autoSwitchJobForTest; if (typeof sw !== 'function') return null;
    sw(v, day, world);
    return { need: v._dbgSwitch ? v._dbgSwitch.need : null, counts: Object.assign({}, v.counts) };
  };
  out.A = run({ landStone: 0.3, forager: 2, tool: 0 });
  out.B = run({ landStone: 0.2, forager: 0, tool: 0, stone: 1 });
  out.E = run({ landStone: 0.2, forager: 0, tool: 0, stone: 0 });
  out.D = run({ landStone: 0.2, forager: 0, tool: 60 });
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const child = (env) => {
  const e = Object.assign({}, process.env);
  for (const k of ['T1363_FAMINE_TOOLS', 'T1363_TEST_BAIT', 'T1334_BUNDLE']) delete e[k];
  Object.assign(e, env);
  const r = spawnSync(process.execPath, [__filename, '--child'], { env: e, encoding: 'utf8', timeout: 120000 });
  try { return JSON.parse(r.stdout); } catch (err) { return { err: (r.stderr || String(err)).slice(0, 300) }; }
};
const ON = child({ T1363_FAMINE_TOOLS: '1' });
const OFF = child({});
const BK = child({ T1363_FAMINE_TOOLS: '1', T1363_TEST_BAIT: 'keep' });
const BC = child({ T1363_TEST_BAIT: 'crit' });

console.log('① 손잡이');
ok(ON.on === true, "켬 = '1'", ON.on);
ok(OFF.on === false, '끔 = 빈 값', OFF.on);

console.log('② 식 둘(정본 함수 그대로 · 손잡이와 무관)');
const E = require(F_E);
const crit = typeof E.t1363ToolCrit === 'function' ? E.t1363ToolCrit : null;
const short = typeof E.t1363StoneShort === 'function' ? E.t1363StoneShort : null;
const CR = (counts, storage) => (crit ? crit({ counts, storage }) : null);
const CRIT69 = 'crit-69';
ok(CR({ farmer: 10 }, { tool: 6.9 }) === true, '치명 도구 — 일꾼 10 · 석기 6.9 = 치명(몫 0.69 < 0.7)', { id: CRIT69, got: CR({ farmer: 10 }, { tool: 6.9 }) });
ok(CR({ farmer: 10 }, { tool: 7 }) === false, '치명 도구 — 일꾼 10 · 석기 7 = 아님(경계 0.7)', CR({ farmer: 10 }, { tool: 7 }));
ok(CR({ farmer: 6, fisher: 4 }, { iron_tool: 3, tool: 3.9 }) === true && CR({ farmer: 6, fisher: 4 }, { iron_tool: 3, bronze_tool: 1, tool: 3 }) === false,
  '치명 도구 — 철 · 청동 · 석기를 더한다(3 + 3.9 = 치명 · 3 + 1 + 3 = 아님 · 농부 + 어부 = 일꾼)', [CR({ farmer: 6, fisher: 4 }, { iron_tool: 3, tool: 3.9 }), CR({ farmer: 6, fisher: 4 }, { iron_tool: 3, bronze_tool: 1, tool: 3 })]);
ok(CR({ mason: 3, forager: 2 }, {}) === false, '치명 도구 — 도구 쓰는 일꾼 0(석공 · 채집꾼만) = 아님', CR({ mason: 3, forager: 2 }, {}));
const vs = (landStone, stone) => {
  E.setSeed(7);
  const v = E.createVillage({ name: '돌', initialPop: 20, fertility: 0.8, water: 0.3, game: 0.3, wood: 1, ore: 0, stone: landStone, size: 200 });
  v.storage.stone = stone; return v;
};
const v1 = vs(0.3, 0), v2 = vs(0.2, 0), v3 = vs(0.3, 0);
const edge = E.stoneWorkStock(v3) * Math.max(1, E.masonTarget(v3)); v3.storage.stone = edge;
ok(short ? short(v1) === true : false, '돌 모자람 — 땅 돌 0.3 · 곳간 돌 0 = 모자람', short ? short(v1) : null);
ok(short ? short(v2) === false : false, '돌 모자람 — 땅 돌 0.2 = 아님(돌밭 없는 마을 · STONE_NET 땅 문턱 0.25)', short ? short(v2) : null);
ok(short ? short(v3) === false && edge > 0 : false, '돌 모자람 — 곳간 돌 = 석공 하루 재료 × 석공 목표 = 아님(경계)', { edge, got: short ? short(v3) : null });
const ready = typeof E.t1363StoneReady === 'function' ? E.t1363StoneReady : null;
const v4 = vs(0.2, 0), w4 = E.stoneWorkStock(v4); v4.storage.stone = w4; const r4a = ready ? ready(v4) : null; v4.storage.stone = w4 * 0.99; const r4b = ready ? ready(v4) : null;
ok(r4a === true && r4b === false && w4 > 0, '쪼을 돌 — 곳간 돌 = 석공 하루 재료 = 있음(경계) · 그 99% = 없음', { w4, at: r4a, below: r4b });

console.log('③ 전환 문(정본 `autoSwitchJob` · 식량 값 200 · 곳간 5일치 · 석공 셋)');
const ms = (r) => (r && r.counts ? (r.counts.mason || 0) : null);
const KEEP_A = 'keep-A';
ok(!!(OFF.A && OFF.A.need === 'forager' && ms(OFF.A) === 2 && OFF.A.counts.forager === 3), '끔 A — 피커가 채집꾼을 내고 석공이 채집꾼으로 옮긴다(나선 · 아래 켬 줄의 전제)', OFF.A);
ok(!!(ON.A && ON.A.need === 'forager' && ms(ON.A) === 3 && ON.A.counts.forager === 3 && ON.A.counts.farmer === 24), '켬 A — 석공 셋 남고 농부가 채집꾼으로 옮긴다', { id: KEEP_A, got: ON.A });
ok(!!(OFF.B && OFF.B.need === 'farmer' && ms(OFF.B) === 2), '끔 B — 옮길 수 있는 사람이 석공뿐이면 석공이 농부로(전제)', OFF.B);
ok(!!(ON.B && ON.B.need === 'farmer' && ms(ON.B) === 3 && ON.B.counts.farmer === 27), '켬 B — 그날 전환 0(석공 남음 · 종전 "자리 없음"과 같은 끝)', ON.B);
ok(!!(ON.E && OFF.E && JSON.stringify(ON.E) === JSON.stringify(OFF.E) && ms(ON.E) === 2), '켬 E — 쪼을 돌도 돌밭도 없으면 끔과 같다(석공이 농부로)', { on: ON.E, off: OFF.E });
ok(!!(ON.D && OFF.D && JSON.stringify(ON.D) === JSON.stringify(OFF.D) && ms(ON.D) === 2), '켬 D — 도구가 넉넉하면(60) 끔과 같다(석공 목표 위 석공이 옮긴다 · 문은 도구 바닥에서만)', { on: ON.D, off: OFF.D });

console.log('★미끼 ⓐ — 전환 문의 남김 줄을 뺀 econ 사본');
ok(BK.bait === 1 && !!BK.A && ms(BK.A) !== 3, "★미끼 ⓐ — 바꾼 자리 1곳(남김 줄) · 사본에선 ③ '켬 A — 석공 셋 남는다' 가 빨강", { n: BK.bait, A: BK.A });

console.log('★미끼 ⓑ — 치명 도구 문턱 0.7 → 0.5 인 econ 사본');
ok(BC.bait === 1 && BC.crit69 === false, "★미끼 ⓑ — 바꾼 자리 1곳(`t1363ToolCrit` 문턱) · 사본에선 ② '일꾼 10 · 석기 6.9 = 치명' 이 빨강", { n: BC.bait, got: BC.crit69 });

console.log(`\n${fail ? '✗' : '✓'} test-t1363-famine-tools ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
