#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t860-catch-dry.js — 잡은 날 제 손으로 말린다 [T860] ==========================================
//
// ★왜 [T847 조사 ⓐⓑ] T789 켬 판 버린 생선 · 고기 · 해산물의 4.9~6.4 % 만 갈무리(요리사 손 1.5/날)가 메운다 —
//   손이 잡는 양과 안 묶였고(어촌 요리사 0~1 명) · 연어 · 새우 · 게는 갈무리 표에 없었다.
//   손잡이 하나 `T860_CATCH_DRY`('1' 만 켬 · 끔 = main 바이트) — 켜면 어부 · 사냥꾼이 그날 잡은 것을 그날 제 손으로 말린다.
//
// 재는 것:
//   ① 술어 — `=== '1'` 만 켬 · 읽는 자리 = `sim/economy-sim.js` 하나(번들 · 랩 사본 밖) · 끔 탐침
//   ② 표 — 잡은 칸 → 보존식이 spoil 정본 레시피(`PRESERVE`) × 곳간 대응(`PV_DEPOSIT_MAP`)과 같다 · 굴 · 해조는 정본 산출이 econ 칸에 없다(그래서 뺐다)
//   ③ 글자 — 갈무리 한 걸음은 `_preserveSurplus` 하나(문턱 줄 사본 0) · 요리사 · 잡은 날 말리기가 둘 다 그 함수
//   ④ 한 걸음(가짜 마을) — 손 = 남는 시간 × 요리사 처리량 × 요리 숙련 · 칸 상한 = 그날 잡은 양 · 열량 보존(새우 0.35) · 남는 시간 0 · 문턱 닫힘 · 잡은 것 0 이면 무동작
//   ⑤ 세계(econ v2 · 시드 7 · 마을 다섯 · 200날 · 아이 판 둘) — 끔 판 = 손잡이 없는 판(바이트) · 켬 판은 보존식이 실제로 선다(자명 통과 금지) · 음수 칸 0
//
// 실행: node scripts/test-t860-catch-dry.js   (존 안 띄움 · 약 1분)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T860_SUB === '1') {   // ── 아이 판: econ v2 세계 하나 ──
  const _l = console.log; console.log = () => {};
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
  const P = ['dried_fish', 'smoked_meat'];
  const out = world.villages.map((v) => ({ name: v.name, n: v.npcs.length, pres: P.map((r) => +(+v.storage[r] || 0).toFixed(6)), neg: Object.values(v.storage).filter((x) => x < -1e-9).length,
    st: Object.keys(v.storage).sort().map((k) => [k, +(+v.storage[k] || 0).toFixed(9)]) }));
  console.log = _l; console.log(JSON.stringify({ on: require(path.join(ROOT, 'sim', 'economy-sim')).T860_ON, out }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const S = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const codeOnly = require('./code-only.js');
const C = codeOnly(S);
const E = require(path.join(ROOT, 'sim', 'economy-sim'));

console.log('\n=== 잡은 날 제 손으로 말린다 (T860) ===');
console.log('\n① 술어 · 읽는 자리 · 끔 탐침');
{ const decl = S.match(/const T860_ON = \(typeof process !== 'undefined' && process\.env && process\.env\.T860_CATCH_DRY === '1'\);/g) || [];
  ok(decl.length === 1, '① 선언 하나 · `=== \'1\'` 만 켬(기본 끔)', `선언 ${decl.length}`);
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => !/economy-engine\.browser\.js$/.test(p) && codeOnly(fs.readFileSync(p, 'utf8')).includes('T860_CATCH_DRY')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('sim', 'economy-sim.js'), '① 읽는 자리 = sim/economy-sim.js 하나(번들은 그 사본)', readers.join(','));
  const probe = (v) => { const e = Object.assign({}, process.env); delete e.T860_CATCH_DRY; if (v != null) e.T860_CATCH_DRY = v;
    return execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))}).T860_ON)`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  ok(probe(null) === 'false' && probe('0') === 'false' && probe('1') === 'true', '① 끔 탐침 — env 없음 · `=0` = 끔 · `=1` = 켬', `${probe(null)} · ${probe('1')}`); }

console.log('\n② 표 — 잡은 칸 → 보존식 = spoil 정본 레시피 × 곳간 대응');
{ const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  const SP = require(path.join(ROOT, 'server', 'specialty.js'));
  const DM = V.playerVillageDepositMap();
  const econOf = (pid) => DM[pid];
  const fromList = (rec) => (Array.isArray(rec.from) ? rec.from : [rec.from]);
  //   정본에서 econ 칸 → 보존식(econ 이름)을 유도한다: 재료가 따로 안 드는(`needs` 0) 레시피 · 또는 땔감만 드는 훈제(econ 갈무리는 재료를 안 센다 — 요리사와 같다)
  const derived = {};
  for (const [k, rec] of Object.entries(Spoil.PRESERVE)) {
    const needs = Object.keys(rec.needs || {}); if (needs.some((n) => n !== 'wood')) continue;   // 절임(소금)은 econ 갈무리 꼴이 아니다
    const out = econOf(rec.out); if (!out) continue;
    for (const pid of fromList(rec)) { const e = econOf(pid); if (e && derived[e] == null) derived[e] = out; }
  }
  for (const [job, from] of Object.entries(E.CATCH_FROM)) for (const [r, out] of Object.entries(from))
    ok(derived[r] === out, `② ${job} · ${r} → ${out} = 정본(${Object.entries(Spoil.PRESERVE).filter(([, rec]) => fromList(rec).some((p) => econOf(p) === r) && econOf(rec.out) === out).map(([k]) => k).join(' · ')})`);
  //   어부 부산물 칸(fisher.byproduct) 가운데 표에 없는 것 = 정본 산출이 econ 칸이 아닌 것뿐이어야 한다
  const by = Object.keys((E.JOBS.fisher && E.JOBS.fisher.byproduct) || {}).filter((r) => r !== 'salt');
  const missing = by.filter((r) => !(r in E.CATCH_FROM.fisher));
  const why = missing.map((r) => { const rec = Object.values(Spoil.PRESERVE).find((x) => fromList(x).includes(r)); return [r, rec ? rec.out : null, rec ? (econOf(rec.out) || null) : null, rec ? !!(SP.RESOURCES || {})[rec.out] : null]; });
  ok(by.length >= 5 && missing.length === 0, '② ★[T877] 어부 부산물(소금 밖)이 다 표에 든다 — 굴 · 해조도(정본 산출 건굴 · 마른 미역에 econ 칸이 섰다)', `${by.join(' · ')} · 빠짐 ${JSON.stringify(why)}`);
  ok(JSON.stringify(E.PRESERVE_FROM) === JSON.stringify({ fish: 'dried_fish', fruit: 'dried_fruit', meat: 'smoked_meat', vegetable: 'pickled_veg' }), '② 요리사 갈무리 표(PRESERVE_FROM)는 그대로'); }

console.log('\n③ 글자 — 갈무리 한 걸음 = `_preserveSurplus` 하나');
{ const gate = (C.match(/if \(totalFoodEquivalent\(v\) > _N \* DAILY_FOOD_CONSUMPTION \* \(RESERVE_PC\.food \|\| 30\)\) \{/g) || []).length;
  const defs = (C.match(/function _preserveSurplus\(/g) || []).length;
  ok(gate === 1 && defs === 1, '③ 문턱 줄 하나 · 함수 정의 하나(사본 0)', `문턱 ${gate} · 정의 ${defs}`);
  ok(/if \(T17_PRESERVE\) _preserveSurplus\(v, PRESERVE_FROM, jdef\.base \* skillMul, addProduce, null, T877_ON \? _t860Unit : null\);/.test(C), '③ 요리사 = 그 함수 · 종전 손(`jdef.base × skillMul`) · 상한 없음 · 환산은 ★T877 켬일 때만(끔 = 종전 글자)');
  ok(/_preserveSurplus\(v, b\.from, budget, addProduce, cap, _t860Unit\);/.test(C) && /const _t860 = \(T860_ON && T17_PRESERVE && CATCH_FROM\[npc\.currentJob\]\) \?/.test(C) && /if \(_t860\) _t860Dry\(v, npc, _t860, _potA, _actA, addProduce\);/.test(C),
    '③ 잡은 날 말리기 = 같은 함수 · 켬일 때만(끔 = null · 무동작)'); }

console.log('\n④ 한 걸음 — 가짜 마을');
{ const mk = (food) => ({ npcs: new Array(10).fill(0).map(() => ({})), storage: { food, fish: 50, meat: 0, cooked_food: 0, salmon: 0, shrimp: 40, crab: 0 }, land: {}, treasury: {} });
  const sink = (v) => { const got = []; return { got, f: (r, a) => { got.push([r, a]); v.storage[r] = (v.storage[r] || 0) + a; } }; };
  const npc = { skills: { cooking: 0 } };
  //   ⓐ 어부가 생선 20 · 새우 10 을 잡았다 · 잠재 30 실제 15(남는 시간 0.5) → 손 = 1.5 × 1 × 0.5 = 0.75 · 생선부터
  let v = mk(1000); let b = E._t860Begin(v, E.CATCH_FROM.fisher, 0, 0); v.storage.fish += 20; v.storage.shrimp += 10; let s = sink(v);
  E._t860Dry(v, npc, b, 30, 15, s.f);
  ok(s.got.length === 1 && s.got[0][0] === 'dried_fish' && Math.abs(s.got[0][1] - 0.75 * 0.4) < 1e-12 && Math.abs(v.storage.fish - (70 - 0.75)) < 1e-12,
    '④ⓐ 손 = 남는 시간 0.5 × 요리사 1.5 × 숙련 1 = 0.75 · 생선 0.75 → 건어물 0.30', JSON.stringify(s.got));
  //   ⓑ 숙련 10 = ×1.5
  v = mk(1000); b = E._t860Begin(v, E.CATCH_FROM.fisher, 0, 0); v.storage.fish += 20; s = sink(v);
  E._t860Dry(v, { skills: { cooking: 10 } }, b, 30, 15, s.f);
  ok(s.got.length === 1 && Math.abs(s.got[0][1] - 0.75 * 1.5 * 0.4) < 1e-12, '④ⓑ 요리 숙련 10 = 손 × 1.5(생산식 `1 + 숙련 × 0.05` 그대로)', JSON.stringify(s.got));
  //   ⓒ 칸 상한 = 그날 잡은 양 — 생선 0.2 만 잡았으면 0.2 만 · 남은 손은 새우로 · 새우 산출은 열량 보존(× 0.35)
  v = mk(1000); b = E._t860Begin(v, E.CATCH_FROM.fisher, 0, 0); v.storage.fish += 0.2; v.storage.shrimp += 10; s = sink(v);
  E._t860Dry(v, npc, b, 30, 15, s.f);
  const fe = (r, a) => (r === 'dried_fish' ? a * 2.5 : 0);
  ok(s.got.length === 2 && Math.abs(s.got[0][1] - 0.2 * 0.4) < 1e-12 && Math.abs(s.got[1][1] - 0.55 * 0.4 * 0.35) < 1e-12,
    '④ⓒ 칸 상한 = 그날 잡은 양(생선 0.2) · 남은 손 0.55 는 새우', JSON.stringify(s.got));
  ok(Math.abs(fe('dried_fish', s.got[1][1]) - 0.55 * 0.35) < 1e-12, '④ⓒ 열량 보존 — 새우 0.55(식량 0.1925) → 건어물 0.077(× 2.5 = 0.1925) · 생성 0');
  //   ⓓ 남는 시간 0 · 문턱 닫힘(식량 30일치 이하) · 잡은 것 0 → 무동작
  v = mk(1000); b = E._t860Begin(v, E.CATCH_FROM.fisher, 0, 0); v.storage.fish += 20; s = sink(v); E._t860Dry(v, npc, b, 30, 30, s.f);
  const a0 = s.got.length;
  v = mk(100); b = E._t860Begin(v, E.CATCH_FROM.fisher, 0, 0); v.storage.fish += 20; s = sink(v); E._t860Dry(v, npc, b, 30, 15, s.f);
  const a1 = s.got.length;
  v = mk(1000); b = E._t860Begin(v, E.CATCH_FROM.fisher, 0, 0); s = sink(v); E._t860Dry(v, npc, b, 30, 15, s.f);
  ok(a0 === 0 && a1 === 0 && s.got.length === 0, '④ⓓ 남는 시간 0 · 문턱 닫힘(굶주린 마을) · 잡은 것 0 이면 안 말린다', `${a0} · ${a1} · ${s.got.length}`);
  //   ⓔ 사냥꾼 — 고기 → 훈제육
  v = mk(1000); b = E._t860Begin(v, E.CATCH_FROM.hunter, 0, 0); v.storage.meat += 30; s = sink(v); E._t860Dry(v, npc, b, 10, 5, s.f);
  ok(s.got.length === 1 && s.got[0][0] === 'smoked_meat' && Math.abs(s.got[0][1] - 0.75 * 0.4) < 1e-12, '④ⓔ 사냥꾼 — 고기 → 훈제육(같은 손 셈)', JSON.stringify(s.got)); }

console.log('\n⑤ 세계 — econ v2 · 시드 7 · 마을 다섯 · 200날');
{ const sub = (env) => { const e = Object.assign({}, process.env, env, { T860_SUB: '1' }); if (env.T860_CATCH_DRY == null) delete e.T860_CATCH_DRY;
    return JSON.parse(execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); };
  const none = sub({}), off = sub({ T860_CATCH_DRY: '0' }), on = sub({ T860_CATCH_DRY: '1' });
  ok(none.on === false && off.on === false && on.on === true, '⑤ 전제 — 손잡이가 실제로 읽힌다(아이 판 셋)');
  ok(JSON.stringify(none.out) === JSON.stringify(off.out), '⑤ `=0` 판 = env 없는 판(곳간 전 칸 바이트)');
  const presOff = off.out.reduce((a, r) => a + r.pres[0] + r.pres[1], 0), presOn = on.out.reduce((a, r) => a + r.pres[0] + r.pres[1], 0);
  ok(presOn > presOff, '⑤ 켬 — 보존식(건어물 · 훈제육)이 실제로 선다(자명 통과 금지)', `끔 ${presOff.toFixed(2)} → 켬 ${presOn.toFixed(2)}`);
  ok(on.out.every((r) => r.neg === 0) && off.out.every((r) => r.neg === 0), '⑤ 음수 칸 0(켬 · 끔)'); }

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
