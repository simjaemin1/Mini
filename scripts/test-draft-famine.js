#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-draft-famine.js — 징발 묶임 몰사: 몸이 안 죽는데 죽음이 세지던 셈 (T815) ===
//
// ★[T815 2026-10-19 · T796 §3-4] 마을 전원이 징발(`_warDraft`)된 날, 기근 고리가 `_deathsToday++ · _deadTot++` 를 **먼저** 하고
//   죽일 몸이 없어 `break` — 몸은 안 죽었는데 죽음이 날마다 세어졌다(1020 농촌16 100일 · 죽음 100 · 몸 0).
//   손잡이 `T815_DRAFT_FAMINE`(켜는 값 `'1'` 하나 · 끔 = 종전 바이트): 켜면 **죽일 몸을 고른 뒤에** 센다.
// 재는 것 (손잡이는 모듈 상수라 팔마다 아이 프로세스 · 포트 0 · 서버 안 띄움)
//   ⓐ 전원 징발 마을 — 켬: 죽음 누계 = 죽은 몸 수(0) · 매일   ★자명 통과 금지: 끔 팔은 죽음 누계 > 죽은 몸 수
//   ⓑ 자유민 1명 남은 마을 — 켬·끔 둘 다 그 1명이 기근으로 죽는다(계약 ③ 이 깨지는 자리 · 이 카드는 고르지 않는다) · 켬은 죽음 누계 = 죽은 몸 수
//   ⓒ 징발자는 기근으로 안 죽는다(몸 수 그대로 · 징발 마크 그대로)
//   ⓓ 끔 = 종전: 손잡이 없음 · '0' · '' 셋이 한 글자도 안 갈린다(같은 궤적)
//   ⓔ 정적 — 손잡이는 `=== '1'` 하나 · 센 줄은 `if (oldestIdx < 0) break;` 뒤에 있다(끔 줄은 앞)
//
// 실행: node scripts/test-draft-famine.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SIM = path.join(ROOT, 'sim', 'economy-sim.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// 아이: 400일 키운 마을(주민 ≥ 8) → 곳간에 식량을 쌓고 → keepFree 명만 자유민으로 두고 전원 징발 → 40일 돌려 하루 장부를 JSON 으로
const CHILD = `
const v1 = require(${JSON.stringify(SIM)});
const keepFree = +process.argv[1], mode = process.argv[2] || 'run';
const v = v1.createVillage({ initialPop: 20, name: 'p', wood: 0.45 });
for (let d = 1; d <= 400; d++) v1.tickVillage(v, d);
v.storage.food = (v.storage.food || 0) + 2000;
for (let i = keepFree; i < v.npcs.length; i++) { v.npcs[i]._warDraft = 1; const j = v.npcs[i].currentJob; v.counts[j] = Math.max(0, (v.counts[j] || 0) - 1); }
v._dPAccum = Math.min(v._dPAccum || 0, mode === 'release' ? -45 : -2.5);   // 압력이 이미 쌓인 마을(기근 고리를 부른다 — 쌓이는 까닭은 이 시험의 물음이 아니다)
const start = v.npcs.length, tot0 = v._deadTot || 0, rows = [];
let gone = 0;
for (let d = 401; d <= 440; d++) {
  const before = v.npcs.slice();
  v1.tickVillage(v, d);
  const now = new Set(v.npcs); for (const n of before) if (!now.has(n)) gone++;   // 그날 사라진 몸(출생이 인구를 되채워도 몸 하나하나를 센다 — 새로 난 몸이 죽어도 센다)
  const dr = v.npcs.filter((n) => n._warDraft).length;
  rows.push([d, v.npcs.length, v._deathsToday || 0, v._deadTot || 0, +(v._dPAccum || 0).toFixed(4), dr, gone]);
}
if (mode === 'release') {   // 묶인 채 3일 → 징발이 한꺼번에 풀리는 날 하루
  const tot00 = v._deadTot || 0;
  for (let d = 401; d <= 403; d++) v1.tickVillage(v, d);
  const popHeld = v.npcs.length, tot1 = v._deadTot || 0, acc1 = +(v._dPAccum || 0).toFixed(2);
  for (const n of v.npcs) { delete n._warDraft; v.counts[n.currentJob] = (v.counts[n.currentJob] || 0) + 1; }
  v1.tickVillage(v, 404);
  console.log(JSON.stringify({ start, popHeld, acc1, heldGain: tot1 - tot00, popAfter: v.npcs.length, deathsDay: v._deathsToday || 0, totGain: (v._deadTot || 0) - tot1 }));
} else
console.log(JSON.stringify({ start, tot0, drafted0: start - keepFree, rows }));
`;
function run(env, keepFree, mode) {
  const e = Object.assign({}, process.env); delete e.T815_DRAFT_FAMINE; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', CHILD, String(keepFree), mode || 'run'], { env: e, encoding: 'utf8', maxBuffer: 1 << 26 });
  return JSON.parse(out.trim().split('\n').pop());
}
const deadBodies = (r) => r.rows[r.rows.length - 1][6];
const deadTot = (r) => r.rows[r.rows.length - 1][3] - (r.deadTot0 || 0);

console.log('ⓐ 전원 징발 마을 — 곳간에 식량 2000 · 40일');
const offAll = run({}, 0), onAll = run({ T815_DRAFT_FAMINE: '1' }, 0);
ok(deadBodies(onAll) === 0, '켬 — 40일 동안 몸 하나도 안 죽는다(전원 징발)', `죽은 몸 ${deadBodies(onAll)} · 인구 ${onAll.start} → ${onAll.rows[onAll.rows.length - 1][1]}`);
ok(onAll.rows[onAll.rows.length - 1][3] === onAll.tot0, '켬 — 죽음 누계가 안 는다(몸이 안 죽었으니 셈도 0)', `누계 ${onAll.tot0} → ${onAll.rows[onAll.rows.length - 1][3]}`);
const offGain = offAll.rows[offAll.rows.length - 1][3] - offAll.tot0;
ok(deadBodies(offAll) === 0 && offGain > 0, '끔(대조) — 몸은 0 인데 죽음 셈은 는다(종전 · 결함 재현)', `죽음 셈 +${offGain} · 몸 ${deadBodies(offAll)}`);

console.log('\nⓑ 자유민 1명 남은 마을');
const offOne = run({}, 1), onOne = run({ T815_DRAFT_FAMINE: '1' }, 1);
const bodiesOn = deadBodies(onOne), bodiesOff = deadBodies(offOne);
ok(bodiesOn === bodiesOff, '켬·끔 같은 몸 수가 죽는다(이 손잡이는 누가 죽는지를 안 바꾼다)', `켬 ${bodiesOn} · 끔 ${bodiesOff}`);
ok(bodiesOn >= 1, '마지막 자유민이 기근으로 죽는다(계약 ③ 이 깨지는 자리 — 이 카드는 이 길을 고르지 않는다)', `죽은 몸 ${bodiesOn}`);
ok(onOne.rows[onOne.rows.length - 1][3] - onOne.tot0 === bodiesOn, '켬 — 죽음 누계 증가 = 죽은 몸 수', `증가 ${onOne.rows[onOne.rows.length - 1][3] - onOne.tot0} · 몸 ${bodiesOn}`);
// 죽음 누계 증가 = 죽은 몸 수(켬) — 첫날부터 한 줄씩
{
  let prevGone = 0, prevTot = onOne.tot0, drift = 0;
  for (const r of onOne.rows) { drift += Math.abs((r[3] - prevTot) - (r[6] - prevGone)); prevGone = r[6]; prevTot = r[3]; }
  ok(drift === 0, '켬 — 날마다 (죽음 누계 증가) = (사라진 몸 수) 이다', `어긋남 합 ${drift}`);
  let prevGone2 = 0, prevTot2 = offOne.tot0, drift2 = 0;
  for (const r of offOne.rows) { drift2 += Math.abs((r[3] - prevTot2) - (r[6] - prevGone2)); prevGone2 = r[6]; prevTot2 = r[3]; }
  ok(drift2 > 0, '끔(대조) — 어긋나는 날이 있다(마지막 자유민이 죽은 뒤 몸 없이 셈만 는다)', `어긋남 합 ${drift2}`);
}
ok(onOne.rows[onOne.rows.length - 1][5] === onOne.drafted0, 'ⓒ 징발자는 기근으로 안 죽는다 — 징발 수 그대로', `${onOne.drafted0} → ${onOne.rows[onOne.rows.length - 1][5]}`);

console.log('\nⓓ 끔 = 종전 — 손잡이 없음 · "0" · "" 이 같은 궤적');
const z0 = run({ T815_DRAFT_FAMINE: '0' }, 1), z1 = run({ T815_DRAFT_FAMINE: '' }, 1);
ok(JSON.stringify(z0) === JSON.stringify(offOne) && JSON.stringify(z1) === JSON.stringify(offOne), '세 끔 팔이 한 글자도 안 갈린다');

console.log('\nⓕ 풀리는 날 한꺼번에 — 쌓인 몫(`_dPAccum` −45)을 안은 전원 징발 마을이 풀린다(① 만으로는 못 막는 자리 · 판정 0 · 재민 몫)');
{
  const a = run({}, 0, 'release'), b = run({ T815_DRAFT_FAMINE: '1' }, 0, 'release');
  ok(a.popHeld === a.start && b.popHeld === b.start, '묶인 3일 동안 둘 다 인구 그대로(죽을 몸이 없다)', `끔 ${a.start} → ${a.popHeld} · 켬 ${b.start} → ${b.popHeld}`);
  ok(b.heldGain === 0 && a.heldGain > 0, '묶인 3일 — 켬은 죽음 셈 0(몸이 안 죽었다) · 끔(대조)은 셈만 는다', `켬 +${b.heldGain} · 끔 +${a.heldGain}`);
  ok(a.popAfter === b.popAfter && a.popAfter < a.popHeld, '풀린 날 쌓인 몫이 몸으로 치러진다 — 켬·끔 같은 인구(① 은 몰사를 안 막는다)', `묶임 인구 ${a.popHeld} → 풀린 뒤 끔 ${a.popAfter} · 켬 ${b.popAfter} · 쌓인 몫 ${a.acc1}`);
}

console.log('\nⓔ 정적');
const S = fs.readFileSync(SIM, 'utf8');
ok((S.match(/process\.env\.T815_DRAFT_FAMINE/g) || []).length === 1 && /process\.env\.T815_DRAFT_FAMINE === '1'/.test(S), '손잡이는 `=== \'1\'` 한 자리');
{
  const iBrk = S.indexOf('if (oldestIdx < 0) break;'), iOn = S.indexOf('if (T815_DRAFT_FAMINE) { v._deathsToday++'), iOff = S.indexOf('if (!T815_DRAFT_FAMINE) { v._deathsToday++');
  ok(iOff > 0 && iBrk > iOff && iOn > iBrk, '끔 센 줄은 `break` 앞 · 켬 센 줄은 `break` 뒤');
}
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
