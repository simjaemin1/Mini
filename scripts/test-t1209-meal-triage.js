#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1209-meal-triage.js — 모자란 솥은 가장 위태로운 사람부터 (T1209 · ★재민 11-07 "몸이 꺼내 먹어도 마을이 비지 않는다") ==========
//
// ★무엇을 보나
//   ① 손잡이 — `T1209_MEAL_TRIAGE`(제품 끔 기본 · 이 하네스는 켬에 묶는다 · T1197 켬 판에서만 탄다).
//   ② 일괄 솥 — 곳간이 모자라면 HP 낮은 사람 → 허기 낮은 사람 → id 순으로 제 몫을 다 먹고 곳간이 다한 데서 멎는다 · 넉넉하면 모두 제 몫(같은 비율 솥과 같다).
//   ③ 정해진 순 — 같은 입력 = 같은 답(주사위 0) · 같은 처지는 id 순.
//   ④ 몸 끼니 — 먼저 온 성한 몸은 앞 순번(더 위태로운 · 아직 안 먹은) 사람들의 몫을 곳간에 남기고 남은 만큼만 먹는다.
//   ⑤ 끔(`T1209_MEAL_TRIAGE=0`) — 같은 비율 한 솥(T1197 그대로 · 아이 프로세스).
//   ⑥ 왜 — 지난 굶주림에 약해진(HP 낮은) 사람이 다음 모자람에 먼저 죽지 않는다(같은 비율 솥은 약한 사람을 극단에 둔다) · 고르게 긴 굶주림은 순번이 못 막는다(기록만 — 회부).
//   ⑦ 자명 통과 금지 — 순번을 뒤집은 사본(HP 높은 사람부터)은 ② 의 "위태로운 사람이 먹었다" 가 잡는다(아래 그 사본을 직접 돌린다).
//
// 실행: node scripts/test-t1209-meal-triage.js   (존 안 띄움 · 몇 초)
'use strict';
if (process.env.T1197_MEAL_BODY == null) process.env.T1197_MEAL_BODY = '1';   // T1197 켬 판의 일을 잰다(제품 기본과 무관하게 켬에 묶는다)
if (process.env.T1209_MEAL_TRIAGE == null) process.env.T1209_MEAL_TRIAGE = '1';   // 순번 솥의 일을 잰다(제품은 끔 기본 · 보고 T1209 §3) — 켬에 묶는다
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const E = require(path.join(ROOT, 'sim', 'economy-sim'));
const M = E.__t1197();
const mkV = (n, food) => { const v = { id: 9, npcs: [], storage: { food, fish: 0, meat: 0, cooked_food: 0 }, counts: { farmer: n }, founder: true }; for (let i = 0; i < n; i++) v.npcs.push({ id: 'n9.' + (i + 1), age: 20 + i, currentJob: 'farmer' }); return v; };
const famine = (n, half, days, weak) => {   // n 명(앞 `weak` 명은 지난 굶주림으로 HP 20) · 날마다 제 몫의 `half` 만 곳간에 든다 · HP 0 에 닿은 사람 수
  const v = mkV(n, 0);
  if (weak) v.npcs.forEach((p, i) => { p._mh = M.fed[0]; p._mhp = i < weak ? 20 : 100; p._mD = 0; p._mS = -1; });
  const dead = new Set();   // 날 경계마다 HP 0 에 닿은 사람(이 하네스는 명부에서 빼지 않으니 닿은 것을 센다)
  for (let d = 0; d < days + 5; d++) { v.storage.food += (d < days ? half : 2) * n; E.t1197Day(v, d + 1); for (const p of v.npcs) if (p._mhp <= 0) dead.add(p.id); }
  return dead.size;
};

if (process.argv[2] === '--child-off') {
  const v = mkV(3, 0.5); for (const p of v.npcs) { p._mh = M.fed[0]; p._mhp = 100; p._mD = 0; p._mS = -1; }
  v.npcs[2]._mhp = 10;
  E.t1197Meal(v, v.npcs.slice(), 0, false);
  console.log(JSON.stringify({ knob: E.T1209_MEAL_TRIAGE, mh: v.npcs.map((p) => +p._mh.toFixed(4)), dead: famine(30, 0.6, 5, 10), long: famine(30, 0.5, 10) }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const fresh = (n, food) => { const v = mkV(n, food); for (const p of v.npcs) { p._mh = M.fed[0]; p._mhp = 100; p._mD = 0; p._mS = -1; } return v; };

console.log('\n=== T1209 ① 손잡이 ===');
ok(E.T1209_MEAL_TRIAGE === true && !!M, '`T1209_MEAL_TRIAGE` 켬(하네스가 켬에 묶음 · 제품은 끔 기본) · T1197 몸 정본을 읽었다');
{ const d = JSON.parse(execFileSync(process.execPath, ['-e', "process.env.T1197_MEAL_BODY='1';delete process.env.T1209_MEAL_TRIAGE;console.log(JSON.stringify(require(process.argv[1]).T1209_MEAL_TRIAGE))", path.join(ROOT, 'sim', 'economy-sim')], { env: Object.assign({}, process.env, { T1209_MEAL_TRIAGE: '' , ENABLE_VILLAGES: '0' }), encoding: 'utf8' }).trim().split('\n').pop());
  ok(d === false, '제품 기본 = 끔(손잡이 안 줌)', d); }

console.log('\n=== T1209 ② 일괄 솥 ===');
let triOut;
{
  const v = fresh(3, 1); v.npcs[2]._mhp = 10; v.npcs[1]._mhp = 40;
  const want = M.R;   // 끼니 0 의 제 몫(배부른 띠 · 적응 0 · 갚기 0)
  const r = E.t1197Meal(v, v.npcs.slice(), 0, false);
  const got = v.npcs.map((p) => (p._mh - M.fed[0]) / M.DH);
  triOut = got;
  ok(near(got[2], want, 1e-9) && near(got[1], 1 - want, 1e-9) && near(got[0], 0, 1e-12), 'HP 10 → 40 → 100 순으로 제 몫을 다 먹고 곳간이 다한 데서 멎는다(곳간 1 · 제 몫 0.7 셋)', JSON.stringify(got.map((x) => +x.toFixed(4))));
  ok(near(v.storage.food, 0, 1e-12) && near(r.got, 1, 1e-9), '곳간 장부는 먹은 만큼만(1 다)', JSON.stringify({ left: v.storage.food, got: +r.got.toFixed(4) }));
  const sh = v.npcs.map((p) => +(p._fdS || 0).toFixed(4));
  ok(near(sh[2], 0, 1e-9) && sh[0] > sh[1] && sh[1] > 0, '못 먹은 몫(`_fdS`) — 다 먹은 사람 0 · 반 먹은 사람 · 못 먹은 사람 순', JSON.stringify(sh));
}
{
  const v = fresh(3, 10); v.npcs[2]._mhp = 10;
  E.t1197Meal(v, v.npcs.slice(), 0, false);
  const got = v.npcs.map((p) => (p._mh - M.fed[0]) / M.DH);
  ok(got.every((g) => near(g, M.R, 1e-9)), '곳간이 넉넉하면 모두 제 몫(순번이 안 선다)', JSON.stringify(got.map((x) => +x.toFixed(4))));
}
{
  const v = fresh(3, 0.5); v.npcs[0]._mh = 5; v.npcs[1]._mh = 15;   // HP 같음 → 허기 낮은 사람부터
  E.t1197Meal(v, v.npcs.slice(), 0, false);
  ok(v.npcs[0]._mh > 5 + 0.5 * M.DH * 0.9 && v.npcs[2]._mh === M.fed[0], 'HP 가 같으면 허기 낮은 사람부터(갚기 몫까지 제 몫)', JSON.stringify(v.npcs.map((p) => +p._mh.toFixed(3))));
}

console.log('\n=== T1209 ③ 정해진 순 ===');
{
  const run = () => { const v = fresh(5, 1.2); v.npcs[3]._mhp = 50; v.npcs[1]._mhp = 50; E.t1197Meal(v, v.npcs.slice(), 0, false); return v.npcs.map((p) => p._mh); };
  const a = run(), b = run();
  ok(a.join() === b.join(), '같은 입력 = 같은 답(주사위 0)');
  ok(a[1] > a[3] && a[3] > M.fed[0] - 1e-9 && a[0] === M.fed[0], '같은 처지(HP 50 둘)는 id 순 — n9.2 가 n9.4 보다 먼저', JSON.stringify(a.map((x) => +x.toFixed(3))));
}

console.log('\n=== T1209 ④ 몸 끼니 ===');
{
  const v = fresh(3, 0.5); v.npcs[2]._mhp = 10;
  E.t1197Meal(v, [v.npcs[0]], 0, true);   // 성한 몸(HP 100 · n9.1)이 먼저 왔다 — 앞 순번(HP 10 인 n9.3)의 몫을 남긴다(n9.2 는 같은 처지 · id 뒤라 뒤 순번)
  const g0 = (v.npcs[0]._mh - M.fed[0]) / M.DH;
  ok(near(g0, 0, 1e-12) && near(v.storage.food, 0.5, 1e-12), '먼저 온 성한 몸 — 앞 순번(HP 10)의 몫 0.7 이 곳간 0.5 를 넘으니 못 먹는다', JSON.stringify({ g0, left: v.storage.food }));
  E.t1197Meal(v, [v.npcs[2]], 0, true);
  ok(near((v.npcs[2]._mh - M.fed[0]) / M.DH, 0.5, 1e-9), '뒤에 온 위태로운 몸(HP 10)이 남은 것을 다 먹는다', (v.npcs[2]._mh - M.fed[0]) / M.DH);
}
{
  const v = fresh(3, 2.5); v.npcs[2]._mhp = 10;
  E.t1197Meal(v, [v.npcs[0]], 0, true);
  ok(near((v.npcs[0]._mh - M.fed[0]) / M.DH, M.R, 1e-9), '곳간이 모두의 몫을 채우면 먼저 온 몸도 제 몫 그대로');
}

console.log('\n=== T1209 ⑤ 끔 ===');
const off = JSON.parse(execFileSync(process.execPath, [__filename, '--child-off'], { env: Object.assign({}, process.env, { T1209_MEAL_TRIAGE: '0' }), encoding: 'utf8' }).trim().split('\n').pop());
{
  const eq = (0.5 / (3 * M.R)) * M.R * M.DH;
  ok(off.knob === false && off.mh.every((h) => near(h, M.fed[0] + eq, 1e-3)), '`T1209_MEAL_TRIAGE=0` — 같은 비율 한 솥(세 사람 같은 몫 · T1197 그대로)', JSON.stringify(off.mh));
}

console.log('\n=== T1209 ⑥ 왜 — 지난 굶주림에 약해진 사람이 다음 모자람에 먼저 죽지 않는다 ===');
{
  const tri = famine(30, 0.6, 5, 10);
  ok(off.dead === 10, '끔(같은 비율 솥) — 30명(10명은 지난 굶주림으로 HP 20) · 제 몫 6할 5날: 같은 몫이 약한 10명을 극단에 두어 10명 다 죽는다', off.dead);
  ok(tri === 0, '켬 — 약한 사람이 먼저 제 몫을 먹고 성한 사람이 모자람을 HP 로 버틴다 · 0명', `${tri}명`);
  const long = famine(30, 0.5, 10);
  console.log(`  · (기록 — 판정 아님) 고르게 긴 굶주림(30명 모두 성함 · 제 몫 절반 10날): 끔 ${off.long}명 · 켬 ${long}명 — 순번은 돌아가며 먹을 뿐 정본 몸의 굶어 죽는 빠르기(배부른 띠 → HP 0 이 ${M.dieDays.toFixed(2)}날)를 못 바꾼다(보고 T1209 회부)`);
}

console.log('\n=== T1209 ⑦ 자명 통과 금지 ===');
{
  // 순번을 뒤집은 사본(HP 높은 사람부터) — 같은 함수를 HP 를 뒤집은 처지로 부르면 성한 사람이 먹는다 ⇒ ② 의 수와 다르다
  const v = fresh(3, 1); v.npcs[0]._mhp = 10; v.npcs[1]._mhp = 40;   // ② 와 거울(위태로운 사람이 명부 맨 앞)
  E.t1197Meal(v, v.npcs.slice(), 0, false);
  const got = v.npcs.map((p) => (p._mh - M.fed[0]) / M.DH);
  ok(near(got[0], triOut[2], 1e-9) && near(got[2], triOut[0], 1e-9) && JSON.stringify(got) !== JSON.stringify(triOut), '명부 자리가 아니라 처지가 순번을 정한다(명부 순 사본은 ② 와 같은 수를 못 낸다)', JSON.stringify(got.map((x) => +x.toFixed(4))));
}

console.log(`\n=== T1209 결과: ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
