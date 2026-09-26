#!/usr/bin/env node
// === scripts/t409-village-names.js — 중원북 마을 이름: **하란 지명 줄기 + 한반도 업종 낱말** (T409 ④) =====
//
// ★왜 — 중원북 후보 25곳은 `makeVillageName('plains')` 가 지은 이름이다(그래스크릭 · 애머보로 …).
//   그 음절표는 **북미 평원**(누비아노·캐나디아 계열)의 것이라 하란(중원) 땅에 안 맞는다. 카드: "이름(한반도 문법 · 하란 지명)".
//
// ★새 표를 만들지 않는다 — 두 원천을 **읽기만** 한다(사본 0):
//   ⓐ 하란 지명 줄기 = `scripts/refine-world-v6.js` 의 존 문화 풀 `POOLS.jungwon.stems`
//      (중원북·중원남 강·호수·능선·숲 이름 — 청수·민하·적림·무호 — 이 이미 이 풀에서 났다).
//   ⓑ 한반도 문법 = 한반도 정본 51곳의 이름 꼴 `<업종><번호>` 에서 **타입 → 업종 낱말**을 읽는다
//      (mining 광산 · riverside 어촌 · forest 임업 · plain 농촌 — 정본에서 거꾸로 읽은 것).
//   ⇒ 이름 = 줄기 + 업종 낱말. 번호 대신 줄기가 마을을 가른다(줄기는 서로 다르다 — 32 ≥ 후보 25).
//   줄기는 정본 후보 순서대로 풀 순서에서 하나씩 준다(결정론 · 손으로 고르지 않는다).
//
// ★안 하는 것: 좌표·타입을 안 바꾼다(이름 칸 하나). 다른 존을 안 만진다.
//
// 실행:
//   node scripts/t409-village-names.js            # 표만
//   node scripts/t409-village-names.js --apply    # server/hanbando-terrain.json 의 jungwon_n.villages 이름을 적는다
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const ZID = 'jungwon_n';

// ⓐ 하란 줄기 — 문화 풀 원문에서 읽는다
const src = fs.readFileSync(path.join(__dirname, 'refine-world-v6.js'), 'utf8');
const m = src.match(/\n\s*jungwon:\{stems:\[([^\]]*)\]/);
if (!m) { console.error('문화 풀 POOLS.jungwon.stems 를 못 찾았다'); process.exit(2); }
const STEMS = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

const doc = JSON.parse(fs.readFileSync(GAME, 'utf8'));
// ⓑ 한반도 문법 — 타입 → 업종 낱말(정본 51곳에서 거꾸로 읽는다 · 한 타입에 낱말 하나여야 한다)
const WORD = {};
for (const v of doc.hanbando.villages) {
  const w = String(v.name).replace(/[0-9]+$/, '');
  if (WORD[v.type] && WORD[v.type] !== w) { console.error(`한반도 타입 ${v.type} 에 낱말 둘: ${WORD[v.type]} · ${w}`); process.exit(2); }
  WORD[v.type] = w;
}
const vs = doc[ZID].villages || [];
if (vs.length > STEMS.length) { console.error(`후보 ${vs.length} > 줄기 ${STEMS.length}`); process.exit(2); }
const rows = vs.map((v, i) => ({ from: v.name, to: STEMS[i] + (WORD[v.type] || WORD.plain), type: v.type, x: Math.round(v.x), y: Math.round(v.y) }));
const dup = rows.map((r) => r.to).filter((n, i, a) => a.indexOf(n) !== i);
if (dup.length) { console.error('겹치는 이름: ' + dup.join(',')); process.exit(2); }

console.log(`=== 중원북 마을 이름 — 하란 줄기(${STEMS.length}) + 한반도 업종 낱말(${Object.entries(WORD).map(([t, w]) => `${t} ${w}`).join(' · ')}) ===`);
console.log('| # | 절차 이름 | → 이름 | 타입 | 자리(로컬) |');
console.log('|---:|---|---|---|---|');
rows.forEach((r, i) => console.log(`| ${i + 1} | ${r.from} | **${r.to}** | ${r.type} | (${r.x}, ${r.y}) |`));

if (process.argv.includes('--apply')) {
  vs.forEach((v, i) => { v.name = rows[i].to; });
  const _wasMinified = !fs.readFileSync(GAME, 'utf8').includes('\n');
  fs.writeFileSync(GAME, _wasMinified ? JSON.stringify(doc) : JSON.stringify(doc, null, 1));
  console.log(`→ ${GAME} (${ZID}.villages ${vs.length}곳 이름)`);
}
