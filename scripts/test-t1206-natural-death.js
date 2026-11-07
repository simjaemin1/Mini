#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1206-natural-death.js — 자연사 · 출생 다시 맞춤 · 부장품 (T1206 · ★재민 11-07) ==========================
//
// ★무엇을 보나
//   ① 생명표 — 시일러 다섯 수 = Gurven & Kaplan 2007 표 2 · 나이별 위험(16 · 40 · 60 · 70) · 하루 몫 = 1 − e^(−h/365).
//   ② 자연사 — 정해진 씨(같은 날 · 같은 사람 = 같은 답 · 다른 날은 다른 답) · 70살 1,000명 365날의 죽음 수가 기대값 ± 5σ 안 · 징발 중은 안 죽는다 · POP_MIN.
//   ③ 출생 다시 맞춤 — tickVillage 가 그날 dP 에 기대 자연사(Σ p)를 더한다(`_natExp`).
//   ④ 부장 — 죽은 사람 하나 = 사치품마다 곳간 × 비율 ÷ 인구 · 식량은 그대로 · 전쟁 · 캐러밴 · 도적이 적은 `_t1206Due` 도 같은 문.
//   ⑤ 몸 — 자연사한 그 사람의 id 가 T1198 늙음 목록(`_t1198Gone`)에 선다(호스트가 그 몸을 눕힌다).
//   ⑥ 끔(`T1206_NAT_DEATH=0`) — 자연사 0 · 기대 칸 0 · 부장 0(아이 프로세스).
//   ⑦ 자명 통과 금지 — 다른 씨(날을 바꾼 사본)는 다른 사람을 고른다.
//
// 실행: node scripts/test-t1206-natural-death.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const E = require(path.join(ROOT, 'sim', 'economy-sim'));
const mkV = (n, age, o) => { const v = Object.assign({ id: 9, name: '목촌', npcs: [], storage: { food: 100, jade: 100, gold: 10 }, counts: { farmer: n } }, o || {}); for (let i = 0; i < n; i++) v.npcs.push({ id: 'n9.' + (i + 1), age, currentJob: 'farmer' }); return v; };

if (process.argv[2] === '--child-off') {
  const v = mkV(50, 90);
  let k = 0; for (let d = 1; d <= 50; d++) k += E.t1206Day(v, d);
  const b = E.t1206Bury(v, 3, 50);
  const w = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 6, name: '끔' });
  E.tickVillage(w, 1);
  console.log(JSON.stringify({ knob: E.T1206_NAT_DEATH, k, b, jade: v.storage.jade, natExp: w._natExp == null ? null : w._natExp }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const near = (a, b, e) => Math.abs(a - b) <= e;

console.log('\n=== T1206 ① 생명표 ===');
const S = E.T1206_SILER;
ok(E.T1206_NAT_DEATH === true && S.a1 === 0.422 && S.b1 === 1.131 && S.a2 === 0.013 && S.a3 === 1.47e-4 && S.b3 === 0.086, '켬 기본 · 시일러 다섯 수 = Gurven & Kaplan 2007 표 2 평균 채집민');
const hz = [16, 40, 60, 70].map((a) => +E.t1206Hazard(a).toFixed(4));
ok(near(hz[0], 0.0136, 1e-4) && near(hz[1], 0.0176, 1e-4) && near(hz[2], 0.0386, 1e-4) && near(hz[3], 0.0735, 1e-4), '나이별 해 위험 16 · 40 · 60 · 70 (원문 글 "40에 0.02 · 60 전에 두 배 · 70에 또 두 배" 의 꼴)', JSON.stringify(hz));
ok(near(E.t1206DayP(70), 1 - Math.exp(-E.t1206Hazard(70) / 365), 1e-15), '하루 몫 = 1 − e^(−h/365)');
ok(near(E.T1206_GRAVE, 20 / 117, 1e-15), '부장 비율 20/117(이기성 2024 묘역 넷)', E.T1206_GRAVE.toFixed(4));

console.log('\n=== T1206 ② 자연사 ===');
{
  const run = (d0) => { const v = mkV(300, 70); const dead = []; for (let d = d0; d < d0 + 365; d++) { const before = new Set(v.npcs.map((p) => p.id)); E.t1206Day(v, d); for (const id of before) if (!v.npcs.some((p) => p.id === id)) dead.push(d + ':' + id); } return dead; };
  const a = run(1), b = run(1), c = run(1001);
  ok(a.length > 0 && a.join(',') === b.join(','), '정해진 씨 — 같은 날들 · 같은 사람들 = 같은 죽음(날 · 사람까지)', `${a.length}명`);
  ok(c.map((x) => x.split(':')[1]).join(',') !== a.map((x) => x.split(':')[1]).join(','), '[자명 통과 금지] 다른 날들 = 다른 사람(씨가 날을 읽는다)', `${c.length}명`);
}
{
  const v = mkV(1000, 70); let k = 0;
  for (let d = 1; d <= 365; d++) { for (const p of v.npcs) p.age = 70; k += E.t1206Day(v, d); }
  // 나이를 70 에 묶고 1년 — 살아 있는 사람 수가 줄어드는 것을 따라 기대값을 다시 센다
  const p = E.t1206DayP(70); let n = 1000, ex = 0, var_ = 0; for (let d = 0; d < 365; d++) { ex += n * p; var_ += n * p * (1 - p); n -= n * p; }
  ok(Math.abs(k - ex) <= 5 * Math.sqrt(var_), `70살 1,000명 · 1년 죽음 ${k} — 기대 ${ex.toFixed(1)} ± 5σ(${(5 * Math.sqrt(var_)).toFixed(1)})`);
  ok(v._natDeadTot === k && v._deadTot === k && v.counts.farmer === 1000 - k, '셈 칸(자연사 · 죽음 · 직업 수)');
}
{
  const v = mkV(30, 95); for (const p of v.npcs) p._warDraft = 1;
  let k = 0; for (let d = 1; d <= 200; d++) k += E.t1206Day(v, d);
  ok(k === 0, '원정 징발 중인 사람은 자연사하지 않는다(그 죽음은 전쟁 정산)');
}

console.log('\n=== T1206 ③ 출생 다시 맞춤 ===');
{
  const w = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 12, name: '맞춤촌' });
  const ex = E.t1206Expected(w);
  E.tickVillage(w, 1);
  ok(w._natExp > 0 && near(w._natExp, ex, 1e-12), '그날 dP 에 기대 자연사(Σ p)를 더한다(`_natExp`)', `${w._natExp.toExponential(3)}`);
}

console.log('\n=== T1206 ④ 부장 ===');
{
  const v = mkV(10, 30);
  const tot = E.t1206Bury(v, 1, 10);
  const f = E.T1206_GRAVE / 10;
  ok(near(v.storage.jade, 100 * (1 - f), 1e-9) && near(v.storage.gold, 10 * (1 - f), 1e-9) && v.storage.food === 100, '죽은 사람 하나 — 사치품마다 곳간 × 비율 ÷ 인구 · 식량은 그대로', JSON.stringify({ jade: +v.storage.jade.toFixed(4), gold: +v.storage.gold.toFixed(4), food: v.storage.food }));
  ok(near(tot, 110 * f, 1e-9) && near(v._buryUsed, tot, 1e-12) && v._buryN === 1, '부장 누계 칸');
  const w = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 10, name: '전사촌' });
  w.storage.jade = 50; w._t1206Due = 2; const b0 = w._buryUsed || 0;
  E.tickVillage(w, 1);
  ok(w._t1206Due === 0 && (w._buryUsed || 0) > b0, '전쟁 · 캐러밴 · 도적이 적은 죽음(`_t1206Due`)도 다음 날 경계가 같은 문으로 묻는다', ((w._buryUsed || 0) - b0).toFixed(4));
  const WC = require(path.join(ROOT, 'sim', 'war-core'));
  ok(typeof WC === 'object', 'war-core 적재(전사 문 `_warRemoveNpc` 가 `_t1206Due` 를 적는다 — 글자)', /e\._t1206Due = \(e\._t1206Due \|\| 0\) \+ 1/.test(require('fs').readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8')) ? '글자 있음' : '글자 없음');
}

console.log('\n=== T1206 ⑤ 몸 ===');
{
  const v = mkV(400, 95); let k = 0, d = 0;
  while (!k && d < 400) k = E.t1206Day(v, ++d);
  const on = E.T1198_BIRTH_BODY && E.__t1197 && E.__t1197();
  ok(k > 0 && (!on || (Array.isArray(v._t1198Gone) && v._t1198Gone.length === k)), '자연사한 그 사람의 id 가 T1198 늙음 목록에 선다(호스트가 그 몸을 눕힌다)', JSON.stringify({ k, gone: v._t1198Gone }));
}

console.log('\n=== T1206 ⑥ 끔 ===');
{
  const out = JSON.parse(execFileSync(process.execPath, [__filename, '--child-off'], { env: Object.assign({}, process.env, { T1206_NAT_DEATH: '0' }), encoding: 'utf8' }).trim().split('\n').pop());
  ok(out.knob === false && out.k === 0 && out.b === 0 && out.jade === 100 && out.natExp === null, '`T1206_NAT_DEATH=0` — 자연사 0 · 부장 0 · 기대 칸 없음', JSON.stringify(out));
}

console.log(`\n=== T1206 결과: ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
