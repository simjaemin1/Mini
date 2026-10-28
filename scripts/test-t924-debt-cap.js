#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t924-debt-cap.js — 몸이 없는 날 죽음 빚을 넘기지 않는다(T924 ①) ===
//
// ★[T924 2026-10-25 · 재민 10-24 "창고에 식량이 쌓여 있을 텐데 자유민이 그렇게 빨리 죽어..?"]
//   기근 사망 고리는 남은 사람이 다 징발 중이면 멈추는데 누적 압력 `_dPAccum` 은 날마다 더 쌓였다 — 징발이 풀린 날 곳간과 무관하게 한꺼번에 치른다
//   (T815 §2 시드 42 농촌21: 곳간 1,395 · 빚 −231 → 34명). 랩은 같은 글자인데 econ 주민에 징발 표식을 안 붙여 이 갈래에 닿지 않는다(빚 > −1).
//   손잡이 `T924_DEBT_CAP`(★[T935] 켬 기본 · 되돌림 `'0'` 하나 · 끔 = 종전 바이트): 켜면 고리가 몸이 없어 멈춘 날 `Math.max(_dPAccum, −0.9)`(출생 줄 0.9 의 거울).
// 재는 것 (손잡이는 모듈 상수라 팔마다 아이 프로세스 · 포트 0 · 서버 안 띄움)
//   ⓐ 전원 징발 마을(곳간 2000 · 빚 −2.5 에서 40일) — 켬: 틱 뒤 빚 > −1 날마다 · 끔(대조): 빚이 쌓인다(−2.5 아래로) · 둘 다 몸 0 죽음 ·
//      셈만 느는 죽음은 켬이 적거나 같다(끔 = 묶인 날마다 · 켬 = 그날 압력이 빚을 −1 아래로 민 날만 — T815 손잡이가 그 셈 자체를 고친다)
//   ⓑ 풀리는 날 — 빚 −45 를 안고 3일 묶였다 풀린다: 끔(대조) = 한꺼번에 여럿 죽음 · 켬 = 풀린 날 죽음 ≤ 그날 압력 한 날치(+0.9) · 켬 < 끔
//   ⓒ 몸이 있는 마을(징발 0 400일 · 자유민 1 · 자유민 2) — 몸이 있는 날들은 켬 = 끔 한 글자 같다(이 갈래는 몸이 없을 때만 선다)
//   ⓓ 켬 기본: 손잡이 없음 · '1' · 'true' 셋이 한 글자도 안 갈린다 · 끔은 '0' 하나(★[T935])
//   ⓔ T815 와 함께 — `T815_DRAFT_FAMINE=1` 위에 켜도 셈만 느는 죽음 0 · 같은 몸 수(두 손잡이는 서로의 줄을 안 바꾼다)
//   ⓕ 정적 — 손잡이 `=== '0'` 한 자리(켬 기본 꼴 `!(… === '0')`) · 거울 줄은 기근 고리 **뒤**(고리 안 `if (oldestIdx < 0) break;` 글자 무변 — `test-draft-famine ⓔ` 계약) · 0.9 는 출생 줄의 그 수
//
// 실행: node scripts/test-t924-debt-cap.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SIM = path.join(ROOT, 'sim', 'economy-sim.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// 아이: 400일 키운 마을(test-draft-famine 과 같은 틀) → 곳간에 식량을 쌓고 → keepFree 명만 자유민으로 두고 전원 징발 → 하루 장부 JSON
const CHILD = `
const v1 = require(${JSON.stringify(SIM)});
const keepFree = +process.argv[1], mode = process.argv[2] || 'run';
const v = v1.createVillage({ initialPop: 20, name: 'p', wood: 0.45 });
for (let d = 1; d <= 400; d++) v1.tickVillage(v, d);
if (mode === 'free') {   // ⓒ 몸이 있는 마을 — 400일 더(징발 0) · 궤적 전체
  const rows = [];
  for (let d = 401; d <= 800; d++) { v1.tickVillage(v, d); rows.push([d, v.npcs.length, +(v._dPAccum || 0).toFixed(6), v._deathsToday || 0, v._deadTot || 0]); }
  console.log(JSON.stringify({ rows })); process.exit(0);
}
v.storage.food = (v.storage.food || 0) + 2000;
for (let i = keepFree; i < v.npcs.length; i++) { v.npcs[i]._warDraft = 1; const j = v.npcs[i].currentJob; v.counts[j] = Math.max(0, (v.counts[j] || 0) - 1); }
v._dPAccum = Math.min(v._dPAccum || 0, mode === 'release' ? -45 : mode === 'slow' ? -1.5 : -2.5);   // slow = 자유민 둘 중 하나가 첫날 죽고 남은 하나가 며칠 뒤 죽는 마을
const start = v.npcs.length, tot0 = v._deadTot || 0, rows = [];
if (mode === 'release') {   // 묶인 채 3일 → 징발이 한꺼번에 풀리는 날 하루
  for (let d = 401; d <= 403; d++) v1.tickVillage(v, d);
  const popHeld = v.npcs.length, acc1 = +(v._dPAccum || 0).toFixed(4);
  for (const n of v.npcs) { delete n._warDraft; v.counts[n.currentJob] = (v.counts[n.currentJob] || 0) + 1; }
  const a0 = +(v._dPAccum || 0);
  v1.tickVillage(v, 404);
  const dbg = v._dpDebug || {};
  console.log(JSON.stringify({ start, popHeld, acc1, a0, popAfter: v.npcs.length, deathsDay: v._deathsToday || 0, dP: dbg.dP, N: popHeld })); process.exit(0);
}
let gone = 0;
for (let d = 401; d <= 440; d++) {
  const before = v.npcs.slice();
  v1.tickVillage(v, d);
  const now = new Set(v.npcs); for (const n of before) if (!now.has(n)) gone++;
  rows.push([d, v.npcs.length, v._deathsToday || 0, v._deadTot || 0, +(v._dPAccum || 0).toFixed(4), v.npcs.filter((n) => n._warDraft).length, gone]);
}
console.log(JSON.stringify({ start, tot0, drafted0: start - keepFree, rows }));
`;
function run(env, keepFree, mode) {
  const e = Object.assign({}, process.env); delete e.T924_DEBT_CAP; delete e.T815_DRAFT_FAMINE; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', CHILD, String(keepFree), mode || 'run'], { env: e, encoding: 'utf8', maxBuffer: 1 << 26 });
  return JSON.parse(out.trim().split('\n').pop());
}
const last = (r) => r.rows[r.rows.length - 1];
const OFF = { T924_DEBT_CAP: '0' }, ON = {};   // ★[T935] 켬 기본 — 끔(대조)은 '0' · 켬은 손잡이 없음
const S = fs.readFileSync(SIM, 'utf8');
const MAXD = +(/const POP_MAX_DELTA_PCT = ([0-9.]+)/.exec(S) || [])[1];   // 하루 dP 상한 비(정본 글자를 읽는다 — 옮겨 적지 않는다)

console.log('ⓐ 전원 징발 마을 — 곳간 2000 · 빚 −2.5 에서 40일');
const offAll = run(OFF, 0), onAll = run(ON, 0);
{
  const minOff = Math.min(...offAll.rows.map((r) => r[4])), minOn = Math.min(...onAll.rows.map((r) => r[4]));
  ok(minOff < -2.5 - 1, '끔(대조) — 몸이 없는 동안 빚이 쌓인다(−2.5 아래로 · 결함 재현)', `40일 끝 빚 ${last(offAll)[4]} · 가장 깊은 ${minOff}`);
  ok(onAll.rows.every((r) => r[4] > -1), '켬 — 날마다 틱 뒤 빚 > −1(못 치른 몫을 안 넘긴다)', `가장 깊은 ${minOn} · 끝 ${last(onAll)[4]}`);
  ok(last(onAll)[6] === 0 && last(offAll)[6] === 0, '둘 다 몸은 하나도 안 죽는다(징발자는 기근으로 안 죽는다 — T295 ① 그대로)', `켬 ${last(onAll)[6]} · 끔 ${last(offAll)[6]}`);
  ok(last(onAll)[5] === onAll.drafted0 && last(offAll)[5] === offAll.drafted0, '징발 수 그대로(켬 · 끔)', `${onAll.drafted0} → ${last(onAll)[5]} · ${last(offAll)[5]}`);
  //   셈만 느는 죽음(T815 몫)은 고리에 들어간 날 센다 — 끔은 빚이 −1 아래에 쌓여 있어 묶인 날마다 · 켬은 그날 압력이 −0.9 를 −1 아래로 민 날만
  const gOff = last(offAll)[3] - offAll.tot0, gOn = last(onAll)[3] - onAll.tot0, daysOff = offAll.rows.length;
  ok(gOff === daysOff && gOn <= gOff, '셈만 느는 죽음 — 끔(대조) 묶인 날마다 1 · 켬은 그날 압력이 빚을 −1 아래로 민 날만(적거나 같다)', `끔 +${gOff}/${daysOff}날 · 켬 +${gOn}`);
}

console.log('\nⓑ 풀리는 날 — 빚 −45 를 안고 3일 묶였다 풀린다');
{
  const a = run(OFF, 0, 'release'), b = run(ON, 0, 'release');
  const oneDay = Math.floor(0.9 + b.N * MAXD);
  ok(a.popHeld === a.start && b.popHeld === b.start, '묶인 3일 동안 둘 다 인구 그대로(죽을 몸이 없다)', `끔 ${a.start} → ${a.popHeld} · 켬 ${b.start} → ${b.popHeld}`);
  ok(a.acc1 <= -45 && b.acc1 > -1, '묶인 3일 뒤 빚 — 끔 −45 아래(쌓임) · 켬 > −1', `끔 ${a.acc1} · 켬 ${b.acc1}`);
  ok(a.deathsDay >= 10, '끔(대조) — 풀린 날 쌓인 빚이 한꺼번에 몸으로(결함 재현)', `죽음 ${a.deathsDay}(인구 ${a.popHeld} → ${a.popAfter})`);
  ok(b.deathsDay <= oneDay && b.deathsDay < a.deathsDay, '켬 — 풀린 날 죽음 ≤ 그날 압력 한 날치 + 0.9(N × POP_MAX_DELTA_PCT + 0.9) · 끔보다 적다', `켬 ${b.deathsDay} ≤ ${oneDay} · 끔 ${a.deathsDay}`);
}

console.log('\nⓒ 몸이 있는 마을 — 켬 = 끔(이 갈래는 몸이 없을 때만 선다)');
{
  const f0 = run(OFF, 0, 'free'), f1 = run(ON, 0, 'free');
  ok(JSON.stringify(f0) === JSON.stringify(f1), '징발 0 마을 400일(401~800) 궤적 한 글자 같다', `끝 인구 ${last(f0)[1]} · 죽음 누계 ${last(f0)[4]}`);
  const o0 = run(OFF, 1), o1 = run(ON, 1);
  ok(last(o0)[6] === last(o1)[6] && last(o0)[6] >= 1, '자유민 1명 남은 마을 — 켬 · 끔 같은 몸 수가 죽는다(마지막 자유민 — 이 카드는 이 길을 고르지 않는다)', `켬 ${last(o1)[6]} · 끔 ${last(o0)[6]}`);
  const s0 = run(OFF, 2, 'slow'), s1 = run(ON, 2, 'slow');
  const firstBlock = (r) => r.rows.findIndex((x) => x[1] - x[5] === 0);
  const i0 = firstBlock(s0), i1 = firstBlock(s1), n = i0 < 0 ? s0.rows.length : i0;   // 자유민 0 이 안 되면(출생이 자유민을 되채운다) 40일 전부
  ok(i0 === i1 && n >= 1 && JSON.stringify(s0.rows.slice(0, n)) === JSON.stringify(s1.rows.slice(0, n)) && s0.rows[n - 1][6] >= 1, '자유민 2 · 빚 −1.5 마을 — 자유민이 남아 있던 날들(죽음 ≥ 1 포함)은 켬 · 끔 한 글자 같다(몸이 있는 동안 무동작)', `같은 날 ${n}(401~${s0.rows[n - 1][0]}) · 그동안 죽은 몸 ${s0.rows[n - 1][6]} · 자유민 0 이 된 날 ${i0 >= 0 ? s0.rows[i0][0] : '없음(출생이 되채운다)'}`);
}

console.log('\nⓓ 켬 기본 — 손잡이 없음 · "1" · "true" 가 같은 궤적 · 끔은 "0" 하나');
{
  const z = run({}, 0), z1 = run({ T924_DEBT_CAP: '1' }, 0), zt = run({ T924_DEBT_CAP: 'true' }, 0), z0 = run({ T924_DEBT_CAP: '0' }, 0);
  ok(JSON.stringify(z1) === JSON.stringify(z) && JSON.stringify(zt) === JSON.stringify(z), '세 켬 팔(없음 · "1" · "true")이 한 글자도 안 갈린다');
  ok(JSON.stringify(z0) !== JSON.stringify(z) && JSON.stringify(z0) === JSON.stringify(offAll), '"0" 은 끔(대조 팔과 한 글자 같다 · 켬과 갈린다)');
}

console.log('\nⓔ T815 와 함께');
{
  const t = run({ T815_DRAFT_FAMINE: '1', T924_DEBT_CAP: '0' }, 0), tb = run({ T815_DRAFT_FAMINE: '1' }, 0);
  ok(last(t)[3] === t.tot0 && last(tb)[3] === tb.tot0, 'T815 켬 위 — 켜도 끄도 셈만 느는 죽음 0', `T815 ${last(t)[3] - t.tot0} · T815+T924 ${last(tb)[3] - tb.tot0}`);
  ok(tb.rows.every((r) => r[4] > -1) && Math.min(...t.rows.map((r) => r[4])) < -3.5, '빚 — T815 만: 쌓인다 · T815 + T924: > −1', `T815 끝 ${last(t)[4]} · 둘 다 끝 ${last(tb)[4]}`);
}

console.log('\nⓕ 정적');
{
  ok((S.match(/process\.env\.T924_DEBT_CAP/g) || []).length === 1 && /const T924_DEBT_CAP = !\(typeof process !== 'undefined' && process\.env && process\.env\.T924_DEBT_CAP === '0'\);/.test(S), '손잡이는 `!(… === \'0\')` 한 자리(켬 기본)');
  const iLoop = S.indexOf('while (v._dPAccum <= -1 && v.npcs.length > POP_MIN)'), iBrk = S.indexOf('if (oldestIdx < 0) break;'), iCap = S.indexOf('if (T924_DEBT_CAP && v._dPAccum <= -1 && v.npcs.length > POP_MIN) v._dPAccum = Math.max(v._dPAccum, -0.9);');
  ok(iLoop > 0 && iBrk > iLoop && iCap > iBrk, '거울 줄은 기근 고리 뒤 · 고리 안 `if (oldestIdx < 0) break;` 글자 무변', `고리 ${iLoop} · break ${iBrk} · 거울 ${iCap}`);
  ok((S.match(/v\._dPAccum = Math\.min\(v\._dPAccum, 0\.9\);/g) || []).length === 3, '0.9 는 출생 줄의 그 수(출생이 막힌 세 자리 `Math.min(v._dPAccum, 0.9)`)');
  ok(Number.isFinite(MAXD) && MAXD > 0, 'POP_MAX_DELTA_PCT 정본 글자를 읽었다', String(MAXD));
}
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
