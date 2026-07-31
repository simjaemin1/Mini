#!/usr/bin/env node
// === scripts/rebalance-ore-minerals.js — 마을 위치에 맞춰 주요 광맥의 광종을 재배분 ===
//
// ★[재민 지시] "광산이 근처에 있는 마을을 전부 세어서, 그 마을들이 골고루 광석을 생산하도록
//   조절하자. 광산마을이 10개라면 각 금속별로 2개씩." + "주력 70~80% + 보조 1종"
//
// 실측: 광맥이 노동권(150셀)에 닿는 마을은 51곳 중 **12곳**. 광종 6개 × 2곳 = 12 — 딱 맞는다.
//
// ★광종만 바꾸고 **광맥의 고유 품위는 보존**한다.
//   pk = ORE_TIER_BASE × ORE_P_SCALE × oreGradeMult(j01) × oreValueScale(baseValue)
//   에서 광종이 바뀌면 마지막 항만 바뀌므로  pk_new = pk_old × vs(new)/vs(old).
//   (금 vs=0.091 · 옥 0.109 · 흑요석 0.415 · 구리·주석·철 1.0 — 귀한 건 옅게 난다는 규칙 유지)
//
// ⚠광맥 하나가 두 마을에 걸치는 경우가 있다(#5·#8·#45). 그건 "한 광산을 나눠 쓰는 두 마을"이라
//   광종을 따로 줄 수 없다 — 그 둘은 한 세트로 같은 광종에 배정한다.
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

const vs = (SP.oreValueScale);
const bv = (m) => (SP.RESOURCES[m] || {}).baseValue || 5;

// ── 배정표 — 광맥 인덱스 → 새 광종 ─────────────────────────────────────────
// 주력 기준 각 광종 2곳이 되도록, **바꾸는 광맥 수를 최소로** 잡았다.
// 현재 주력: 구리 4곳(광산6·5·임업2·광산3) · 철 2곳 · 금 3곳 · 옥 3곳 · 흑요석 0 · 주석 0
//   ⇒ 구리 2곳·금 1곳·옥 1곳을 반납해 흑요석 2곳·주석 2곳을 만든다(반납 4 = 필요 4).
const PLAN = [
  // 주석 2곳 — 광산5·임업2(광맥 공유 세트). #45 는 구리로 남겨 **보조 광종**이 되게 한다.
  { i: 5,  to: 'tin',      why: '광산5·임업2 주석 주력(공유 광맥)' },
  { i: 8,  to: 'tin',      why: '광산5·임업2 주석 주력(공유 광맥)' },
  // 흑요석 2곳 — 광산7(금→흑요석, #7 은 이미 흑요석이라 주력이 굳는다) · 임업5
  { i: 22, to: 'obsidian', why: '광산7 흑요석 주력' },
  { i: 9,  to: 'obsidian', why: '광산7 흑요석 주력' },
  { i: 40, to: 'obsidian', why: '임업5 흑요석 주력' },
  // 금 2곳 — 광산2 유지 + 광산1(옥→금)
  { i: 59, to: 'gold',     why: '광산1 금 주력' },
  { i: 0,  to: 'gold',     why: '광산1 금 주력' },
];
// 유지: 구리 광산6(#6)·광산3(#2) / 철 광산4(#26)·어촌1(#52) / 옥 임업1(#37)·어촌14(#11) / 금 광산2(#19,#18,#39)

const j = JSON.parse(fs.readFileSync(F, 'utf8'));
const ores = (j.hanbando && j.hanbando.ores) || null;
if (!ores) { console.error('✗ ores 배열을 못 찾음 — 최상위 키: ' + Object.keys(j).join(',')); process.exit(1); }

console.log('전체 광맥 ' + ores.length + '개 · 주요 ' + ores.filter(o => !o.minor).length + '개');
console.log('\n광맥#  반지름  이전 → 이후          pk 이전 → 이후   사유');
let n = 0;
for (const p of PLAN) {
  const o = ores[p.i];
  if (!o) { console.error('✗ 광맥#' + p.i + ' 없음'); process.exit(1); }
  if (o.minor) { console.error('✗ 광맥#' + p.i + ' 는 자잘 광맥(minor) — 배정 대상 아님'); process.exit(1); }
  const from = o.mineral, pk0 = o.pk;
  // ★pk 는 **좌표 결정론**이다(scripts/test-mining.js 가 저장값 ≡ 공식 을 검사한다).
  //   pk_old × vs(new)/vs(old) 로 역산하면 저장값이 이미 4자리로 반올림돼 있어 어긋난다
  //   (7개 중 3개가 어긋났다). 그러니 같은 좌표 해시로 **공식을 다시 부른다**.
  const u = H2(Math.floor(o.center[0] / 32), Math.floor(o.center[1] / 32), 500);
  const pk1 = SP.orePeakFor(p.to, 0.30, u);
  console.log('  #' + String(p.i).padStart(2) + '   r' + String(Math.round((o.radius || 0) / 32)).padStart(3)
    + '   ' + (from + ' → ' + p.to).padEnd(22) + (pk0.toFixed(3) + ' → ' + pk1.toFixed(3)).padEnd(17) + p.why);
  if (APPLY) { o.mineral = p.to; o.pk = pk1; }
  n++;
}
if (!APPLY) { console.log('\n(미적용 — --apply 로 실행)'); process.exit(0); }
fs.writeFileSync(F, JSON.stringify(j));
console.log('\n✔ ' + n + '개 광맥 광종 재배분 · ' + F);
