#!/usr/bin/env node
// =============================================================================
// compare-village50 — 땅 보강 **전/후** 전수 비교 [배치 16 ②]
//
// 채택 기준(인계 문서 그대로):
//   ⓐ 시드 1020(라이브 시드) 800일 — 소멸 0 · 좀비 0
//   ⓑ 시드 42·7 도 소멸 0
//   ⓒ 나머지 마을(보강 대상 4곳 밖)이 보강 전과 **유의 차 없음**
//
// ★ⓒ의 판정 기준을 먼저 못 박는다(숫자를 보고 기준을 정하면 그건 판정이 아니다):
//   econ 은 칼날 평형이라 개별 마을 인구는 시드마다 수십 %씩 흔들린다. 그래서 "인구가 몇 % 이내"가
//   아니라 **상태 전이**로 본다 — 보강 전에 살아 있던 마을이 후에 죽거나 좀비가 되면 실패,
//   그 반대는 개선. 인구는 분포(중앙값·사분위)로 같이 싣되 판정에는 안 쓴다.
//
// ★어촌6 주의: 랩은 51곳을 심지만 **프로덕션은 50곳**이다(어촌6 은 존의 해안선 물 strip 때문에
//   findOpenCenter 가 스킵한다 — 그 strip 은 zone.js 가 만들고 terrain.js 엔 없어 랩이 못 본다).
//   판정은 프로덕션이 실제로 심는 50곳으로 한다. 어촌6 은 표에 남기되 별도로 표시한다.
//
// 사용: node scripts/compare-village50.js
//       BEFORE=/tmp/lab/all51 AFTER=/tmp/lab/b16post SEEDS=42,7,1020 node scripts/compare-village50.js
// =============================================================================
'use strict';
const fs = require('fs');
const SEEDS = (process.env.SEEDS || '1020,42,7').split(',');
const BEFORE = process.env.BEFORE || '/tmp/lab/all51';
const AFTER = process.env.AFTER || '/tmp/lab/b16post';
const TARGETS = new Set(['광산6', '농촌11', '농촌12', '농촌21', '농촌6', '농촌7']);
const LAB_ONLY = new Set(['어촌6']);   // 랩엔 있고 프로덕션엔 없는 자리

function load(prefix, seed) {
  const p = `${prefix}_${seed}.json`;
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
// ★★소멸·좀비 판정은 **정본 잣대**를 쓴다 — `scripts/ab-summary.js` 84~85행과 같은 식.
//   좀비 = 재민 기준 "10명 미만 장기 고착"(최종 인구 < 10). 소멸 = 최종 인구 0.
//   ⚠1차 작성에서 내가 `최근 300일 최고 인구 ≤ 12` 라는 **자작 잣대**를 썼고, 그 결과
//     12↔15명을 오가는 마을 셋(광산7·농촌6·농촌9)이 "새로 좀비가 됐다"고 **없는 결함**을 보고했다.
//     실제로는 그 셋의 kDbg.slot(땅에서 오는 항)이 before/after **완전히 같았고**(117·99·116),
//     새 지물까지 거리도 729~2,912셀로 land 스캔 반경 140셀 밖이었다. 계측기가 틀린 것이다.
//     "계측기도 사본 금지 · 기준을 먼저 검증해라"(다음세션_인계.md §2) 의 사례를 하나 더 만들었다.
function stateOf(v) {
  const hist = v.history || [];
  const pop = (v.pop != null) ? v.pop : (hist.length ? hist[hist.length - 1].p : 0);
  if (pop === 0) return { pop, s: '소멸' };
  if (pop < 10) return { pop, s: '좀비' };
  return { pop, s: '생존' };
}
function collect(prefix) {
  const m = new Map();
  const seeds = [];
  for (const s of SEEDS) {
    const d = load(prefix, s);
    if (!d) continue;
    seeds.push(s);
    for (const v of (d.villages || [])) {
      if (!m.has(v.name)) m.set(v.name, {});
      m.get(v.name)[s] = stateOf(v);
    }
  }
  return { m, seeds };
}

const B = collect(BEFORE), A = collect(AFTER);
if (!A.seeds.length) { console.error(`after 덤프가 없다: ${AFTER}_*.json`); process.exit(1); }
console.log(`before ${BEFORE} 시드 ${B.seeds.join(',')} · after ${AFTER} 시드 ${A.seeds.join(',')}`);
const seeds = A.seeds.filter(s => B.seeds.includes(s));
console.log(`비교 시드: ${seeds.join(', ')}\n`);

// ── ⓐⓑ 시드별 소멸·좀비 ──────────────────────────────────────────────────────
console.log('=== ⓐⓑ 시드별 소멸·좀비 (프로덕션 50곳 기준 — 어촌6 제외) ===');
let passAB = true;
for (const s of seeds) {
  const row = (col) => {
    const out = { 소멸: [], 좀비: [] };
    for (const [name, byS] of col.m) {
      if (LAB_ONLY.has(name)) continue;
      const st = byS[s]; if (!st) continue;
      if (st.s === '소멸') out.소멸.push(name); else if (st.s === '좀비') out.좀비.push(name);
    }
    return out;
  };
  const b = row(B), a = row(A);
  const ok = a.소멸.length === 0 && (s !== '1020' || a.좀비.length === 0);
  if (!ok) passAB = false;
  console.log(`  seed ${String(s).padEnd(5)} before 소멸[${b.소멸.join(',') || '없음'}] 좀비[${b.좀비.join(',') || '없음'}]`);
  console.log(`  ${' '.repeat(11)}after  소멸[${a.소멸.join(',') || '없음'}] 좀비[${a.좀비.join(',') || '없음'}]  ${ok ? '✅' : '❌'}`);
}

// ── ⓒ 상태 전이 전수 ────────────────────────────────────────────────────────
console.log('\n=== ⓒ 비대상 마을 상태 전이 (판정 기준: 나빠진 곳 0) ===');
const worse = [], better = [], same = [];
for (const [name, byS] of A.m) {
  if (TARGETS.has(name)) continue;
  for (const s of seeds) {
    const bs = (B.m.get(name) || {})[s], as = byS[s];
    if (!bs || !as) continue;
    const rank = { 생존: 2, 좀비: 1, 소멸: 0 };
    const tag = `${name}/seed${s}: ${bs.s}(${bs.pop}) → ${as.s}(${as.pop})`;
    if (rank[as.s] < rank[bs.s]) worse.push(tag);
    else if (rank[as.s] > rank[bs.s]) better.push(tag);
    else same.push({ name, s, b: bs.pop, a: as.pop });
  }
}
console.log(`  나빠짐 ${worse.length}건 ${worse.length ? '❌' : '✅'}${worse.length ? '\n    ' + worse.join('\n    ') : ''}`);
console.log(`  좋아짐 ${better.length}건${better.length ? '\n    ' + better.join('\n    ') : ''}`);
// 인구 분포(판정엔 안 쓴다 — 참고용)
const dp = same.filter(r => r.b > 0).map(r => (r.a - r.b) / r.b * 100).sort((x, y) => x - y);
const q = (p) => dp.length ? dp[Math.floor((dp.length - 1) * p)].toFixed(1) : '-';
console.log(`  상태 동일 ${same.length}건의 인구 변화%: 최소 ${q(0)} · 25% ${q(0.25)} · 중앙 ${q(0.5)} · 75% ${q(0.75)} · 최대 ${q(1)} (참고 — 판정 불사용)`);

// ── 보강 4곳 ─────────────────────────────────────────────────────────────────
console.log('\n=== 보강 대상 6곳 ===');
console.log(`  마을      ${seeds.map(s => `seed${s} before→after`.padEnd(24)).join('')}`);
for (const name of ['광산6', '농촌11', '농촌12', '농촌21', '농촌6', '농촌7']) {
  const cells = seeds.map(s => {
    const bs = (B.m.get(name) || {})[s], as = (A.m.get(name) || {})[s];
    return `${bs ? bs.s + '(' + bs.pop + ')' : '-'} → ${as ? as.s + '(' + as.pop + ')' : '-'}`.padEnd(24);
  });
  console.log(`  ${name.padEnd(9)}${cells.join('')}`);
}

// ── 세계 총량 ────────────────────────────────────────────────────────────────
console.log('\n=== 세계 총량(어촌6 제외) ===');
for (const s of seeds) {
  const sum = (col) => { let n = 0, p = 0; for (const [name, byS] of col.m) { if (LAB_ONLY.has(name)) continue; const st = byS[s]; if (!st) continue; n++; p += st.pop; } return { n, p }; };
  const b = sum(B), a = sum(A);
  console.log(`  seed ${String(s).padEnd(5)} 마을 ${b.n}→${a.n} · 총인구 ${b.p} → ${a.p} (${b.p ? ((a.p - b.p) / b.p * 100).toFixed(1) : '-'}%)`);
}

const pass = passAB && worse.length === 0;
console.log(`\n${pass ? '✅ 채택 기준 통과' : '❌ 채택 기준 미달'} — ⓐⓑ ${passAB ? 'OK' : 'NG'} · ⓒ 나빠진 곳 ${worse.length}`);
process.exit(pass ? 0 : 1);
