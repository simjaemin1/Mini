#!/usr/bin/env node
// === scripts/rebalance-ore-minerals.js — 광종 배분(한반도 실제 분포 + 마을 배정) ===
//
// ★[재민 지시] "납, 은 추가하고, 비율은 한반도 분포 지켜서. 그리고 마을 비율도 그걸 따라가도록."
//   + 앞선 지시 "광산이 근처에 있는 마을을 전부 세어서 골고루 생산하도록"
//
// ── 한반도 광물 분포(조사 근거) ──────────────────────────────────────────
//   · 철   — 가장 풍부(무산 등 대규모 호상철광상, 북부)
//   · 납·아연 — 우세(연화·검덕 등 동양 최대급). 백악기 열수활동과 연관 "납·아연 우세"
//   · 금·은 — 다수의 소규모 열수광상(중생대 화강암체 주변 약선대: 무극·부평·임천·통영·거창)
//   · 구리 — 상대적으로 적다(납·아연에 비해)
//   · 주석 — **거의 없다.** 한반도에 상업적 주석광상이 없어 청동기 주석은 외부 조달로 본다
//   · 흑요석 — 백두산·제주 등 화산지대 한정 / 옥 — 춘천 연옥 등 한정
//   (텅스텐은 실제로 풍부하나 재민 확정으로 제외 — 청동기에 쓸 데가 없다)
//
// ★납을 넣을 이유가 이번에 생겼다: 주조성(cast)이 산출량을 정하게 바뀌어서, 납이
//   "성능은 깎지만 더 많이 뜰 수 있게" 하는 실제 역할을 갖는다. 모델이 스스로 고르는 최적 배합이
//   Cu72·Sn18·Pb10 으로, 실물 세형동검(Cu74·Sn14·Pb11)과 거의 일치한다.
//
// ★pk 는 **좌표 결정론**이다(test-mining 이 저장값 ≡ 공식 을 검사한다).
//   광종만 바꾸고 pk 는 같은 좌표 해시로 orePeakFor 를 다시 불러 매긴다. 몇 번을 돌려도 같은 결과(멱등).
//
// 실행: node scripts/rebalance-ore-minerals.js [--apply]
'use strict';
const fs = require('fs'), path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const SP = R('server/specialty');
const F = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const APPLY = process.argv.includes('--apply');

// terrain 생성기·하네스와 같은 좌표 해시(seed 500) — 광맥의 품위 분위 u
const H2 = (ix, iy, sd) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (sd | 0) * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

// ── 자잘 광맥(플레이어 전용)의 광종 분포 ──────────────────────────────────
// ★표는 server/hanbando-minerals.js 가 정본이다. 여기서 복제하면 하네스(test-mining 의
//   "저장 광물 ≡ 전역 풀")가 어긋난다 — 실제로 한 번 어긋나서 622/724 불일치가 났다.
const HM = R('server/hanbando-minerals');
const POOL = HM.POOL;

// ── 주요 광맥(NPC 경제가 보는 63개)의 마을 배정 ───────────────────────────
// 광맥이 노동권(150셀)에 닿는 마을은 51곳 중 12곳. 그 12곳에 8광종을 배분한다.
// ⚠#5·#8·#45 는 광산5·임업2 **둘 다**에 걸친다(한 광산을 나눠 쓰는 두 마을) — 같은 광종이어야 한다.
const MAJOR = [
  // 구리 — 광산6 · 광산3 (주력) / 광산5·임업2·광산4 (보조)
  { i: 6,  to: 'copper',   why: '광산6 구리 주력' },
  { i: 2,  to: 'copper',   why: '광산3 구리 주력' },
  { i: 45, to: 'copper',   why: '광산5·임업2 구리 보조(공유 광맥)' },
  { i: 61, to: 'copper',   why: '광산4 구리 보조' },
  // 철 — 광산4 · 어촌1 (주력) / 임업2 (보조)
  { i: 26, to: 'iron',     why: '광산4 철 주력' },
  { i: 52, to: 'iron',     why: '어촌1 철 주력' },
  { i: 24, to: 'iron',     why: '임업2 철 보조' },
  // 주석 — 광산5 · 임업2 (공유 광맥 세트)
  { i: 5,  to: 'tin',      why: '광산5·임업2 주석 주력(공유)' },
  { i: 8,  to: 'tin',      why: '광산5·임업2 주석 주력(공유)' },
  // 금 — 광산2
  { i: 19, to: 'gold',     why: '광산2 금 주력' },
  { i: 39, to: 'gold',     why: '광산2 금 주력' },
  // 은 — 광산1 (주력) / 광산2 (보조) ★신설
  { i: 59, to: 'silver',   why: '광산1 은 주력' },
  { i: 0,  to: 'silver',   why: '광산1 은 주력' },
  { i: 18, to: 'silver',   why: '광산2 은 보조 — 금·은 공반(실제 열수광상이 그렇다)' },
  // 납 — 임업1 · 임업5 ★신설
  { i: 37, to: 'lead',     why: '임업1 납 주력' },
  { i: 40, to: 'lead',     why: '임업5 납 주력' },
  // 흑요석 — 광산7 (주력) / 광산4 (보조)
  { i: 22, to: 'obsidian', why: '광산7 흑요석 주력' },
  { i: 7,  to: 'obsidian', why: '광산7 흑요석 주력' },
  { i: 9,  to: 'obsidian', why: '광산7 흑요석 주력' },
  { i: 3,  to: 'obsidian', why: '광산4 흑요석 보조' },
  // 옥 — 어촌14 (주력) / 광산2·어촌1·광산4 (보조)
  { i: 11, to: 'jade_raw', why: '어촌14 옥 주력' },
  { i: 1,  to: 'jade_raw', why: '광산2 옥 보조' },
  { i: 4,  to: 'jade_raw', why: '어촌1 옥 보조' },
  { i: 51, to: 'jade_raw', why: '광산4 옥 보조' },
];

const j = JSON.parse(fs.readFileSync(F, 'utf8'));
const ores = (j.hanbando && j.hanbando.ores) || null;
if (!ores) { console.error('✗ hanbando.ores 없음'); process.exit(1); }
const nMajor = ores.filter((o) => !o.minor).length;
console.log('전체 광맥 ' + ores.length + '개 · 주요 ' + nMajor + '개 · 자잘 ' + (ores.length - nMajor) + '개');

const repk = (o, to) => SP.orePeakFor(to, 0.30, H2(Math.floor(o.center[0] / 32), Math.floor(o.center[1] / 32), 500));

// ── ① 마을에 닿는 주요 광맥 배정 ──────────────────────────────────────────
console.log('\n① 마을 배정 — 주요 광맥');
let n1 = 0;
for (const m of MAJOR) {
  const o = ores[m.i];
  if (!o) { console.error('✗ 광맥#' + m.i + ' 없음'); process.exit(1); }
  if (o.minor) { console.error('✗ 광맥#' + m.i + ' 는 자잘 광맥'); process.exit(1); }
  const pk1 = repk(o, m.to);
  if (o.mineral !== m.to || Math.abs(o.pk - pk1) > 1e-9) {
    console.log('  #' + String(m.i).padStart(2) + '  ' + (o.mineral + ' → ' + m.to).padEnd(24)
      + 'pk ' + o.pk.toFixed(3) + ' → ' + pk1.toFixed(3) + '   ' + m.why);
    if (APPLY) { o.mineral = m.to; o.pk = pk1; }
    n1++;
  }
}
console.log('  변경 ' + n1 + '개');

// ── ② 나머지(마을 밖 주요 + 자잘) — POOL 비율로 결정론 재배분 ─────────────
const keys = Object.keys(POOL);
let W = 0; for (const k of keys) W += POOL[k];
const assigned = new Set(MAJOR.map((m) => m.i));
function pick(u) { let acc = 0; for (const k of keys) { acc += POOL[k] / W; if (u < acc) return k; } return keys[keys.length - 1]; }
console.log('\n② 나머지 광맥 — POOL 비율 재배분 ' + JSON.stringify(POOL));
let n2 = 0;
for (let i = 0; i < ores.length; i++) {
  if (assigned.has(i)) continue;
  const o = ores[i];
  if (!o.center) continue;
  //   ★자잘 광맥은 하네스가 검사하는 것과 **같은 규약**으로 뽑는다: mineralAt(0,0,h2(cx,cy,731)).
  //     여기서 다른 해시를 쓰면 "저장 광물 ≡ 전역 풀" 이 깨진다.
  const cxx = Math.floor(o.center[0] / 32), cyy = Math.floor(o.center[1] / 32);
  const to = o.minor ? HM.mineralAt(0, 0, H2(cxx, cyy, 731)) : pick(H2(cxx + 7919, cyy + 104729, 500));
  const pk1 = repk(o, to);
  if (o.mineral !== to || Math.abs(o.pk - pk1) > 1e-9) { if (APPLY) { o.mineral = to; o.pk = pk1; } n2++; }
}
console.log('  변경 ' + n2 + '개');

// ── 결과 요약 ─────────────────────────────────────────────────────────────
const cnt = {}, cntM = {};
for (const o of ores) { cnt[o.mineral] = (cnt[o.mineral] || 0) + 1; if (!o.minor) cntM[o.mineral] = (cntM[o.mineral] || 0) + 1; }
console.log('\n광종 분포(적용 후 예상):');
for (const k of keys) {
  const c = cnt[k] || 0, cm = cntM[k] || 0;
  console.log('  ' + k.padEnd(10) + String(c).padStart(4) + ' (' + (100 * c / ores.length).toFixed(1) + '%)'
    + '  목표 ' + (POOL[k] / W * 100).toFixed(1) + '%   주요 ' + cm);
}
if (!APPLY) { console.log('\n(미적용 — --apply 로 실행)'); process.exit(0); }
fs.writeFileSync(F, JSON.stringify(j));
console.log('\n✔ 적용 · ' + F);
