#!/usr/bin/env node
// === scripts/t409-seam-names.js — 경계를 넘는 같은 피처는 **같은 이름** (T409 ①) =====================
//
// ★계측기 겸 옮겨 적기 도구다 — 러너 밖. 계산하지 않는다: 짝은 `t408-seam-audit.js` 가 낸 것(선 위 자국 IoU)을 그대로 쓴다.
//   T408 ④: 한반도 서쪽 경계를 넘는 피처 16 중 중원북 목록의 짝 14 — 같은 이름 3 · **다른 이름 11**.
//   같은 물·같은 숲이 선 이쪽에선 "선강", 저쪽에선 "민하"다. 이 도구는 **중원북 쪽 이름만** 한반도 이름으로 바꾼다.
//
// ★안 하는 것
//   · 값을 안 바꾼다 — 좌표·폭·반경·배수 **0바이트**. `name` 칸 하나만.
//   · 한반도·닛폰·다른 존 목록을 안 만진다(카드: 이름 통일은 중원북 쪽만).
//   · **다른 존과 이미 이름을 나눠 쓰는 중원북 피처는 안 바꾼다** — 바꾸면 그쪽 짝과 갈라진다
//     (예: 운림 = 중원북·베링·시바라 세 존이 같은 이름 · 한반도만 명수해). ⇒ 표에만.
//   · 한 중원북 피처가 한반도 이름 둘과 짝지어지면 안 바꾼다(모호) ⇒ 표에만.
//   · 바꾼 이름이 중원북 안에서 다른 피처 이름과 겹치면 안 바꾼다 ⇒ 표에만.
//
// 실행:
//   node scripts/t409-seam-names.js            # 표만
//   node scripts/t409-seam-names.js --apply    # server/hanbando-terrain.json 의 jungwon_n 칸에 쓴다(꼴 보존 · 한 줄)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const A = 'jungwon_n', B = 'hanbando';
const KIND = { '강': 'rivers', '호수': 'lakes', '능선': 'ridges', '숲': 'forests', '골짜기': 'valleys' };

const tmp = path.join(require('os').tmpdir(), `t409-seam-${process.pid}.json`);
execFileSync(process.execPath, [path.join(__dirname, 't408-seam-audit.js'), '--zones', A, '--json', tmp], { stdio: ['ignore', 'ignore', 'ignore'] });
const au = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp);
const doc = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const Z = doc[A];

// 이 존 이름을 쓰는 다른 존(한반도 제외) — 같은 종류 목록에서
const sharedWith = (kind, name) => Object.keys(doc).filter((z) => z !== A && z !== B && (doc[z][kind] || []).some((f) => f.name === name));

const rows = [];
const byFeat = new Map();   // "kind|name" → Set(한반도 이름)
for (const c of au.crossings.filter((x) => x.A === A && x.partner && x.partner.startsWith(B + ':'))) {
  const k = `${c.kind}|${c.name}`;
  if (!byFeat.has(k)) byFeat.set(k, { c, to: new Set() });
  byFeat.get(k).to.add(c.partner.slice(B.length + 1));
}
const plan = [];
for (const [k, { c, to }] of byFeat) {
  const kind = KIND[c.kind];
  const names = [...to];
  let verdict, target = names[0];
  if (names.length > 1) verdict = `모호 — 한반도 이름 ${names.join('·')}`;
  else if (c.name === target) verdict = '이미 같음';
  else if (sharedWith(kind, c.name).length) verdict = `안 바꿈 — ${sharedWith(kind, c.name).join('·')} 도 "${c.name}"`;
  else if ((Z[kind] || []).some((f) => f.name === target)) verdict = `안 바꿈 — 중원북 안에 "${target}" 이미 있음`;
  else verdict = '바꿈';
  rows.push({ kind: c.kind, from: c.name, to: target, at: c.at, verdict });
  if (verdict === '바꿈') plan.push({ kind, from: c.name, to: target });
}

console.log('=== 경계 이름 통일 — 중원북 쪽만 (T409 ①) ===');
console.log('| 종류 | 중원북 이름 | → 한반도 이름 | 선 위(중원북 로컬 y) | 판정 |');
console.log('|---|---|---|---:|---|');
for (const r of rows) console.log(`| ${r.kind} | ${r.from} | ${r.to} | ${Math.round(r.at)} | ${r.verdict} |`);
console.log(`\n바꿈 ${plan.length} · 이미 같음 ${rows.filter((r) => r.verdict === '이미 같음').length} · 안 바꿈 ${rows.filter((r) => r.verdict.startsWith('안') || r.verdict.startsWith('모호')).length}`);
console.log('중원북 짝 없음(표만 · T408 ④): 골짜기 도령재(중원북엔 골짜기 목록이 없다) · 대숲내 둘째 건넘(한반도 y 70,394 — 중원북 운수=꽃여울 한 줄이 받는다)');

if (process.argv.includes('--apply')) {
  let n = 0;
  for (const p of plan) {
    const hit = (Z[p.kind] || []).filter((f) => f.name === p.from);
    if (hit.length !== 1) { console.error(`★${p.from}: 중원북 ${p.kind} 에 ${hit.length}개 — 건너뜀`); continue; }
    hit[0].name = p.to; n++;
  }
  const _wasMinified = !fs.readFileSync(GAME, 'utf8').includes('\n');
  fs.writeFileSync(GAME, _wasMinified ? JSON.stringify(doc) : JSON.stringify(doc, null, 1));
  console.log(`→ ${GAME} 에 ${n}개 적음`);
}
