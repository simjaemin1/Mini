#!/usr/bin/env node
// === scripts/t350-dice-audit.js — `server/**` 주사위 전수 감사 (T350 ②) =======================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//   게이트는 `test-harness-lint ⑪` 이 건다 — 이 파일은 **표를 다시 뽑는 자**다(보고 §2 의 그 표).
//
// ★분류는 넷이고, 기준은 하나다 — **그 수가 세계 상태에 들어가나**:
//   A 결정·이동 : 주민·몹이 어디로 갈지 · 무엇을 할지            ⇒ 씨 해시(순수)
//   B 산출·전투 : 무엇이 얼마나 나오나 · 맞나 빗나가나           ⇒ 씨 흐름
//   C 배치·출생 : 자원·몹·주민·집이 어디에 서나                  ⇒ 씨 흐름
//   D 세계 밖   : 식별자(토큰·pid) · I/O 지터 · 주입 자리 기본 가지 ⇒ **그대로 둔다**
//
// 실행: node scripts/t350-dice-audit.js [--verbose]
'use strict';
const fs = require('fs');
const path = require('path');
const codeOnly = require('./code-only.js');   // 주석 제거 정본(사본 0)
const SRV = path.join(__dirname, '..', 'server');
const V = process.argv.includes('--verbose');

const CLASS = [
  { k: 'D 세계 밖 · 식별자', re: /Math\.random\(\)\.toString\(36\)/ },
  { k: 'D 세계 밖 · I/O 지터', re: /_nextSaveAt\s*=/ },
  { k: 'D 세계 밖 · 주입 기본 가지', re: /(typeof\s+[\w.]+\s*===\s*'function'\s*\)?\s*\?|\(host\s*&&\s*host\.rng\)\s*\|\|)/ },
];

const rows = [];
for (const f of fs.readdirSync(SRV).filter((x) => x.endsWith('.js'))) {
  const raw = fs.readFileSync(path.join(SRV, f), 'utf8');
  const src = codeOnly(raw), rl = raw.split('\n');
  src.split('\n').forEach((L, i) => {
    if (!/Math\.random/.test(L)) return;
    const c = CLASS.find((x) => x.re.test(L));
    rows.push({ f, line: i + 1, n: (L.match(/Math\.random/g) || []).length, k: c ? c.k : '★세계 자리(남으면 빨강)', txt: (rl[i] || L).trim().slice(0, 110) });
  });
}
// 씨 해시로 바꾼 자리 — 남은 굴림이 아니라 **바꾼 흔적**을 센다(표의 반대쪽)
const MARKS = [
  ['_dn()', '주민 결정 `decideNpcBehavior`'], ['_dc()', '카나디아 결정'], ['_dt()', '존 틱 흐름'],
  ['_dl()', '생활층 결정'], ['_dv()', '마을 출생·배치'], ['_rb()', '도적'], ['_rw()', '야생 생태'],
];
const conv = [];
for (const f of fs.readdirSync(SRV).filter((x) => x.endsWith('.js'))) {
  const src = codeOnly(fs.readFileSync(path.join(SRV, f), 'utf8'));
  for (const [tok, label] of MARKS) {
    const n = src.split(tok).length - 1;
    if (n) conv.push({ f, tok, label, n });
  }
}

const byK = {};
for (const r of rows) byK[r.k] = (byK[r.k] || 0) + r.n;
console.log('\n=== T350 ② `server/**` 주사위 전수 감사 ===\n');
console.log('── 남은 `Math.random` (분류별) ──');
for (const [k, n] of Object.entries(byK).sort()) console.log(`  ${k.padEnd(28)} ${String(n).padStart(3)}`);
const world = rows.filter((r) => r.k.startsWith('★'));
console.log(`  ${'합'.padEnd(28)} ${String(rows.reduce((a, r) => a + r.n, 0)).padStart(3)}   ★세계 자리 ${world.reduce((a, r) => a + r.n, 0)}`);
if (world.length) { console.log('\n  ★세계 자리(빨강):'); for (const r of world) console.log(`    ${r.f}:${r.line} ×${r.n}  ${r.txt}`); }

console.log('\n── 씨 해시로 바꾼 자리 (흐름별) ──');
const byT = {};
for (const c of conv) { byT[c.label] = byT[c.label] || { n: 0, fs: new Set() }; byT[c.label].n += c.n; byT[c.label].fs.add(c.f); }
let tot = 0;
for (const [label, v] of Object.entries(byT)) { tot += v.n; console.log(`  ${label.padEnd(32)} ${String(v.n).padStart(3)}  (${[...v.fs].join(' · ')})`); }
console.log(`  ${'합'.padEnd(32)} ${String(tot).padStart(3)}`);

if (V) { console.log('\n── 전체 줄 ──'); for (const r of rows) console.log(`  ${r.f}:${r.line} [${r.k}] ×${r.n}  ${r.txt}`); }
console.log('');
