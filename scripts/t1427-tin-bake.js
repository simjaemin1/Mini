#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1427 굽기 기계 · 기본은 표만)
// =============================================================================
// T1427 — 지도의 주석을 확정 비율로(재민 11-22 판정 34 "좋아. 대신 npc 마을이 그 중 적어도 하나는 차지해야"):
//   한반도 큰 주석 광맥(NPC 가 보는 주요 63 가운데) 여섯 → 둘. 바꿀 넷만 다른 광종으로 **다시 굽는다**.
//
//   자리(이름 · 좌표 · 반지름 · 주요/자잘)는 그대로 · 바뀌는 칸은 광종 칸(`mineral` · `minerals` · `pk` — T574 굽기 `MINERAL_KEYS` 와 같은 셋)뿐 ·
//   바뀌는 광맥은 넷뿐(자잘 광맥 · 닛폰 · 다른 존 · 다른 칸은 한 글자도 안 바뀐다 — 굽고 나서 스스로 맞대고 어긋나면 안 쓴다).
//
//   ① 남길 둘 = 손 배정(`scripts/rebalance-ore-minerals.js` MAJOR 표의 주석 줄 — "광산5·임업2 주석 주력(공유)" #5 · #8).
//      ⚠그 스크립트를 그대로 돌리지 않는다: 08-01 이주(`migrate-veins-polymetal.js` — 주요 철 14 → 주석 넷 · 구리 · 납 · 흑요석 /
//      은 단독 → 연은)와 T574 덜 흔드는 굽기(L 500) **앞** 판의 표라 지금 정본에 돌리면 주요 11 · 나머지 206 이 바뀐다
//      (주요 철 셋 · 은 단독 셋 · 옥 넷이 되살아난다 — 재민 08-01 · 10-03 규칙을 되돌린다). 그 스크립트에서 가져오는 것은
//      손 배정 표의 **주석 두 줄**뿐이다(아래에서 그 파일 글자를 읽어 맞댄다 — 손 배정이 바뀌면 굽기가 멈춘다).
//      바꿀 넷 = 그 밖의 주석 주요 넷(08-01 이주가 "마을 가까운 순으로 주석 우선" 넣은 옛 철 광맥 — 그 스크립트 머리 ①).
//   ② 바꿀 넷의 새 광종 = **프로필 무게에서 모자란 쪽부터**(새 수 0):
//      무게 = 존 프로필 한반도 열(`region-profiles.weightsOf('ore', 'hanbando')` — 단계 수는 `hanbando-minerals` POOL 에서 빌린 값 ·
//      T574 켬이 기본인 정본이 구워진 그 표). 주요에 설 수 있는 광종 = 무게 > 0 · 재민 08-01 주요 철 0(`NO_MAJOR`) · 은 단독 0.
//      기대 수 = 주요 수 × 무게 ÷ 합 → (기대 − 지금)이 가장 큰 광종을 하나씩 넷(하나 줄 때마다 다시 셈 · 같으면 이름 순).
//   ③ 어느 광맥에 어느 광종 = 마을 노동권(`sustain.LABOR_R` 150셀)과 겹친 넓이가 큰 광맥부터 · **pk 눈금이 주석과 가까운 광종부터**
//      (눈금 = 정본 `orePeakFor(광종) ÷ orePeakFor(주석)` — 구리는 1.0 이라 pk 가 그대로다 → 그 광맥을 쥔 마을의 땅 ore(농도 보정)가 안 흔들린다).
//   ④ pk = 정본 식 `orePeakFor(광종, 0.30, veinU(x, y, 500))`(test-mining "저장 pk ≡ 공식") · `minerals` = `POLY`(재민 08-01 ② · 단광종이면 칸 없음).
//
// 쓰는 법: node scripts/t1427-tin-bake.js [--json 표.json]          → 표만(정본 무변)
//          node scripts/t1427-tin-bake.js --apply [--json 표.json]  → 정본 server/hanbando-terrain.json 의 넷만 바꿔 쓴다
//            (주석 주요가 이미 둘이면 "이미 구웠다" 로 멈춘다 — 두 번 굽기 0)
// =============================================================================
'use strict';
process.env.T574_NEW_ITEMS = '';   // 새 품목 셋은 끔으로 — T574 굽기와 같은 조건(specialty 를 싣기 전에)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const REBAL = path.join(ROOT, 'scripts', 'rebalance-ore-minerals.js');
const RP = require(path.join(ROOT, 'server', 'region-profiles'));
const SP = require(path.join(ROOT, 'server', 'specialty'));
const HB = require(path.join(ROOT, 'server', 'hanbando-minerals'));
const SU = require(path.join(ROOT, 'server', 'sustain'));
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const Terr = require(path.join(ROOT, 'server', 'terrain'));
if (Terr.setZonesMeta) Terr.setZonesMeta(ZONES);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const say = (s) => process.stdout.write(s + '\n');
const Z = 'hanbando', SZ = 32, TIN = 'tin';
const MINERAL_KEYS = ['mineral', 'minerals', 'pk'];

const raw0 = fs.readFileSync(GAME, 'utf8');
const doc0 = JSON.parse(raw0);
if (JSON.stringify(doc0) !== raw0) { console.error('정본 json 이 왕복 바이트 같지 않다 — 굽기를 멈춘다'); process.exit(3); }
const ores0 = doc0[Z].ores;

// ① 남길 둘 — 손 배정 표의 주석 줄(그 파일 글자)
const keepIdx = [...fs.readFileSync(REBAL, 'utf8').matchAll(/\{\s*i:\s*(\d+),\s*to:\s*'tin'/g)].map((m) => +m[1]);
const isTinMajor = (o) => o && !o.minor && o.mineral === TIN;
const tinNow = ores0.map((o, i) => (isTinMajor(o) ? i : -1)).filter((i) => i >= 0);
if (keepIdx.length !== 2 || !keepIdx.every((i) => isTinMajor(ores0[i]))) {
  console.error(`손 배정 표의 주석 줄 ${JSON.stringify(keepIdx)} 가 지금 정본의 주석 주요 둘이 아니다(주석 주요 ${JSON.stringify(tinNow)}) — 멈춘다`); process.exit(4);
}
if (tinNow.length === 2) { console.error('주석 주요가 이미 둘이다 — 이미 구웠다(두 번 굽기 0)'); process.exit(5); }
const change = tinNow.filter((i) => !keepIdx.includes(i));

// ② 새 광종 — 프로필 무게에서 모자란 쪽부터
const majors = ores0.filter((o) => !o.minor);
const own = RP.weightsOf('ore', Z) || {};
const can = Object.keys(own).filter((k) => own[k] > 0 && !RP.NO_MAJOR.includes(k) && k !== 'silver').sort();
const wSum = can.reduce((s, k) => s + own[k], 0);
const expect = {}; for (const k of can) expect[k] = majors.length * own[k] / wSum;
const cnt = {}; for (const o of majors) cnt[o.mineral] = (cnt[o.mineral] || 0) + 1;
const cntAfter = Object.assign({}, cnt); cntAfter[TIN] -= change.length;
const picks = [];
for (let n = 0; n < change.length; n++) {
  let best = null;
  for (const k of can) { if (k === TIN) continue; const d = expect[k] - (cntAfter[k] || 0); if (best === null || d > best.d + 1e-12) best = { k, d }; }
  picks.push(best.k); cntAfter[best.k] = (cntAfter[best.k] || 0) + 1;
}

// ③ 어느 광맥에 — 마을 노동권과 겹친 넓이 큰 광맥부터 · pk 눈금이 주석과 가까운 광종부터
const vs = Terr.getZoneVillages(Z) || [];
const RR = SU.LABOR_R * SZ;
const overlap = (d, r) => {
  if (d >= RR + r) return 0;
  if (d <= Math.abs(RR - r)) return Math.PI * Math.min(RR, r) * Math.min(RR, r);
  const c1 = (d * d + RR * RR - r * r) / (2 * d * RR), c2 = (d * d + r * r - RR * RR) / (2 * d * r);
  const a1 = Math.acos(Math.max(-1, Math.min(1, c1))), a2 = Math.acos(Math.max(-1, Math.min(1, c2)));
  return RR * RR * (a1 - Math.sin(2 * a1) / 2) + r * r * (a2 - Math.sin(2 * a2) / 2);
};
const touch = (o) => vs.map((v) => ({ name: v.name, a: overlap(Math.hypot(o.center[0] - v.x, o.center[1] - v.y), o.radius || 0) / (SZ * SZ) })).filter((t) => t.a > 0).sort((a, b) => b.a - a.a);
const rows = change.map((i) => { const t = touch(ores0[i]); return { i, o: ores0[i], touch: t, area: t.reduce((s, x) => s + x.a, 0) }; })
  .sort((a, b) => b.area - a.area || a.i - b.i);
const scale = (m) => SP.orePeakFor(m, 0.30, 0.5) / SP.orePeakFor(TIN, 0.30, 0.5);
const order = picks.map((m, j) => ({ m, j })).sort((a, b) => Math.abs(Math.log(scale(a.m))) - Math.abs(Math.log(scale(b.m))) || a.j - b.j).map((x) => x.m);
rows.forEach((r, j) => { r.to = order[j]; });

// ④ 굽기 — 넷의 광종 칸만
const doc1 = JSON.parse(raw0);
for (const r of rows) {
  const o = doc1[Z].ores[r.i];
  const e = Object.assign({}, o, { mineral: r.to, pk: SP.orePeakFor(r.to, 0.30, RP.veinU(o.center[0], o.center[1], 500)) });
  if (HB.POLY[r.to]) e.minerals = Object.assign({}, HB.POLY[r.to]); else delete e.minerals;
  doc1[Z].ores[r.i] = e; r.after = e;
}
// 맞대기 — 넷 밖은 한 글자도 · 넷은 광종 칸만
let otherBad = 0, posBad = 0, nDiff = 0;
for (const z of Object.keys(doc0)) {
  if (z !== Z) { if (JSON.stringify(doc0[z]) !== JSON.stringify(doc1[z])) otherBad++; continue; }
  for (const k of Object.keys(doc0[z])) {
    if (k !== 'ores') { if (JSON.stringify(doc0[z][k]) !== JSON.stringify(doc1[z][k])) otherBad++; continue; }
    const a = doc0[z].ores, b = doc1[z].ores;
    if (a.length !== b.length) otherBad++;
    for (let i = 0; i < a.length; i++) {
      if (JSON.stringify(a[i]) === JSON.stringify(b[i])) continue;
      nDiff++; if (!change.includes(i)) otherBad++;
      for (const key of new Set(Object.keys(a[i]).concat(Object.keys(b[i])))) if (!MINERAL_KEYS.includes(key) && JSON.stringify(a[i][key]) !== JSON.stringify(b[i][key])) posBad++;
    }
  }
}
if (otherBad || posBad || nDiff !== change.length) { console.error(`맞대기 실패 — 넷 밖 다름 ${otherBad} · 자리 칸 다름 ${posBad} · 바뀐 광맥 ${nDiff}/${change.length} — 안 쓴다`); process.exit(6); }

const cntNew = {}; for (const o of doc1[Z].ores) if (!o.minor) cntNew[o.mineral] = (cntNew[o.mineral] || 0) + 1;
const f2 = (x) => (+x).toFixed(2);
say(`## T1427 주석 굽기 — ${Z} 주요 ${majors.length} · 주석 주요 ${tinNow.length} → 2 · 남길 둘 ${keepIdx.map((i) => '#' + i + ' ' + ores0[i].name).join(' · ')}(손 배정 표) · ${APPLY ? '적용' : '표만(정본 무변)'}`);
say(`프로필 무게(한반도 열 · 주요에 설 수 있는 광종): ${can.map((k) => `${k} ${f2(own[k] * 100)}`).join(' · ')} → 기대 수 ${can.map((k) => `${k} ${f2(expect[k])}`).join(' · ')}`);
say(`지금 주요: ${Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ')}`);
say(`모자란 쪽부터 넷: ${picks.join(' → ')} · 굽고 나서 주요: ${Object.entries(cntNew).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ')} · 주석 : 구리 = 1 : ${(cntNew.copper / cntNew.tin).toFixed(1)}`);
for (const r of rows) say(`  #${r.i} ${r.o.name} (${r.o.center}) r${r.o.radius} · 마을 노동권 겹침 ${r.touch.map((t) => `${t.name} ${Math.round(t.a)}셀²`).join(' · ') || '없음'} · tin pk ${r.o.pk} → ${r.to} pk ${r.after.pk}${r.after.minerals ? ' ' + JSON.stringify(r.after.minerals) : ''}`);
say(`맞대기: 바뀐 광맥 ${nDiff}(넷) · 넷 밖 다름 0 · 자리 칸 다름 0`);
const table = { keep: keepIdx.map((i) => ({ i, name: ores0[i].name, center: ores0[i].center, radius: ores0[i].radius, pk: ores0[i].pk, touch: touch(ores0[i]) })),
  weights: own, can, expect, before: cnt, picks, after: cntNew,
  changed: rows.map((r) => ({ i: r.i, name: r.o.name, center: r.o.center, radius: r.o.radius, touch: r.touch, from: r.o, to: r.after })) };
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(table, null, 1) + '\n');
if (!APPLY) { say('표만 — 정본 무변(적용은 --apply)'); process.exit(0); }
fs.writeFileSync(GAME, JSON.stringify(doc1));
say(`✔ 적용 · ${path.relative(ROOT, GAME)}`);
