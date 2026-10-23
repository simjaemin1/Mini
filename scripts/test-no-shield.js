#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-no-shield.js — 기근 보호막을 걷는 손잡이 `T858_NO_SHIELD` (T858) ===
//
// ★[T858 2026-10-22 · 재민 10-22] 보호막(`SHIELD_DAYS` 365 · 클램프 · 감쇠 · 펴기)을 걷은 세계를 재는 손잡이 — 켜는 값 `'1'` 하나 · 끔 = main 바이트.
//   끄는 자리는 `_shieldT` 판정 한 곳(켬 = `SHIELD_DAYS` — 보호가 끝난 마을과 같다)이고 보호 조건 줄은 그대로다(`test-frontier-iron ③`).
// 재는 것 (손잡이는 모듈 상수라 팔마다 아이 프로세스 · 포트 0 · 서버 안 띄움)
//   판: 압력이 이미 쌓인 마을(날마다 장부 앞에서 `_dPAccum` ≤ −3 — 쌓이는 까닭은 이 시험의 물음이 아니다 · T815 시험과 같은 문법) · 40일
//   ⓐ 보호기(나이 < 365) 마을 — 끔: 보호막이 압력을 지운다(`_shieldAte` 합 > 0)   ★자명 통과 금지: 이 판이 정말 보호막을 부른다
//   ⓑ 같은 마을 — 켬: 보호막이 하루도 안 선다(`_shieldAte` 날마다 0) · 음수 압력이 그대로 죽음 사다리로(죽음 켬 > 끔)
//   ⓒ 보호가 이미 끝난 마을(나이 ≥ 365) · 플레이어 마을(`founder`) — 켬 · 끔이 한 글자도 안 갈린다(손잡이는 보호막 말고 아무것도 안 만진다)
//   ⓓ 끔 = 종전: 손잡이 없음 · '0' · '' 셋이 한 글자도 안 갈린다(같은 궤적)
//   ⓔ 정적 — 손잡이는 `=== '1'` 하나 · `_shieldT` 한 줄에서 끈다 · 보호 조건 줄 글자 그대로
//
// 실행: node scripts/test-no-shield.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SIM = path.join(ROOT, 'sim', 'economy-sim.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// 아이: 마을 하나(주민 20) — 날마다 압력 −3 을 얹고 40일 · 하루 장부를 JSON 으로
//   mode: young = 첫날 선 마을(보호기 안) · old = 나이가 이미 1,000일(보호 끝) · founder = 플레이어 마을
const CHILD = `
const v1 = require(${JSON.stringify(SIM)});
const mode = process.argv[1] || 'young';
const v = v1.createVillage(Object.assign({ initialPop: 20, name: 'p', wood: 0.45 }, mode === 'founder' ? { founder: 'pid-1' } : {}));
if (mode === 'old') v._bornDay = -1000;
const rows = [];
for (let d = 1; d <= 40; d++) {
  v._dPAccum = Math.min(v._dPAccum || 0, -3);
  v1.tickVillage(v, d);
  rows.push([d, v.npcs.length, v._deathsToday || 0, +(v._shieldAte || 0).toFixed(6), +(v._dPAccum || 0).toFixed(6)]);
}
console.log(JSON.stringify({ rows }));
`;
function run(env, mode) {
  const e = Object.assign({}, process.env); delete e.T858_NO_SHIELD; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', CHILD, mode || 'young'], { env: e, encoding: 'utf8', maxBuffer: 1 << 26 });
  return JSON.parse(out.trim().split('\n').pop());
}
const sumc = (r, i) => r.rows.reduce((a, x) => a + x[i], 0);

console.log('ⓐ · ⓑ 보호기(나이 < 365) 마을 — 날마다 압력 −3 · 40일');
const off = run({}, 'young'), on = run({ T858_NO_SHIELD: '1' }, 'young');
ok(sumc(off, 3) > 0, '끔 — 보호막이 압력을 지운다(이 판이 정말 보호막을 부른다 · 자명 통과 금지)', `지운 압력 합 ${sumc(off, 3).toFixed(2)}`);
ok(on.rows.every((x) => x[3] === 0), '켬 — 보호막이 하루도 안 선다(지운 압력 날마다 0)', `지운 압력 합 ${sumc(on, 3)}`);
ok(sumc(on, 2) > sumc(off, 2), '켬 — 음수 압력이 그대로 죽음 사다리로 간다(굶어 죽음 켬 > 끔)', `켬 ${sumc(on, 2)} · 끔 ${sumc(off, 2)} · 끝 인구 켬 ${on.rows[39][1]} · 끔 ${off.rows[39][1]}`);

console.log('\nⓒ 보호가 이미 끝난 마을 · 플레이어 마을 — 켬 · 끔이 같은 궤적');
for (const m of ['old', 'founder']) {
  const a = run({}, m), b = run({ T858_NO_SHIELD: '1' }, m);
  ok(JSON.stringify(a.rows) === JSON.stringify(b.rows), `${m === 'old' ? '나이 1,000일 마을' : '플레이어 마을(founder)'} — 켬 = 끔(손잡이는 보호막 말고 아무것도 안 만진다)`, `굶어 죽음 ${sumc(a, 2)} · ${sumc(b, 2)}`);
  ok(sumc(a, 2) > 0, `${m === 'old' ? '나이 1,000일' : '플레이어'} 마을도 굶어 죽는다(같음이 "아무 일 없음"의 같음이 아니다 · 자명 통과 금지)`, `굶어 죽음 ${sumc(a, 2)}`);
}

console.log('\nⓓ 끔 = 종전 — 손잡이 없음 · "0" · "" 세 팔');
const z0 = run({ T858_NO_SHIELD: '0' }, 'young'), ze = run({ T858_NO_SHIELD: '' }, 'young');
ok(JSON.stringify(off.rows) === JSON.stringify(z0.rows) && JSON.stringify(off.rows) === JSON.stringify(ze.rows), '세 끔 팔이 한 글자도 안 갈린다', `40일 · 굶어 죽음 ${sumc(off, 2)} · 지운 압력 ${sumc(off, 3).toFixed(2)}`);
ok(JSON.stringify(off.rows) !== JSON.stringify(on.rows), '켬 팔은 갈린다(같음 검사가 실제로 문다)', '');

console.log('\nⓔ 정적');
const src = fs.readFileSync(SIM, 'utf8');
ok(/const T858_NO_SHIELD = \(typeof process !== 'undefined' && process\.env && process\.env\.T858_NO_SHIELD === '1'\);/.test(src), "손잡이는 `=== '1'` 하나(켜는 값 하나 · 없음 · '0' · '' = 끔)", '');
ok((src.match(/T858_NO_SHIELD \?/g) || []).length === 1 && /const _shieldT = T858_NO_SHIELD \? SHIELD_DAYS : /.test(src), '끄는 자리는 `_shieldT` 한 줄(켬 = SHIELD_DAYS)', '');
ok(/if \(!v\.founder && _shieldT < SHIELD_DAYS\) \{/.test(src), '보호 조건 줄은 글자 그대로(`test-frontier-iron ③` 계약)', '');

console.log(`\n=== 보호막 걷기 손잡이 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
process.exit(fail ? 1 : 0);
