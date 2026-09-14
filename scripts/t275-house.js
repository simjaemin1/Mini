#!/usr/bin/env node
// === scripts/t275-house.js — T275: 주거 처방 후보 셋을 잰다 (표 셋) ====================
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T275]
//   T264 가 죽음의 자리를 `built` 하나로 좁혔다. 그 셋째 항이 처방의 자리다 —
//   꼴 후보 셋(ⓐ 절대 캡 · ⓑ slack 재정의 · ⓒ 재고 의존 완화)을 **짚 이월 켬/끔** 양쪽에서 잰다.
//   팔은 `t275-arm.js` 가 `require.cache` 로 심는다(제품 무접촉). 여기선 산수가 비교뿐이다.
//
// 실행: node scripts/t275-house.js /tmp/t275 [--ref /tmp/t249] [--t264 /tmp/t264]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t275';
const gi = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const REF = gi('--ref', '/tmp/t249'), T264 = gi('--t264', '/tmp/t264');
const SEEDS = [1020, 7, 42];
const WATCHED = [[1020, '농촌12'], [7, '농촌9'], [42, '광산3'], [42, '농촌10'],
  [7, '농촌10'], [7, '농촌19']];   // 뒤 둘 = T264 건축캡 팔이 새로 죽인 마을
const load = (d, f) => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const fx = (x, d) => (x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pc = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');

// 짚 이월 **끔** 쪽 / **켬** 쪽을 따로 세운다(각각 자기 기준선과 비교해야 한다)
// ⚠키는 **파일 이름**이다 — 표시 이름은 두 묶음에서 겹치므로(ⓐ·ⓑ·ⓒ) 그걸 키로 쓰면 서로 덮어쓴다.
const OFFARMS = [
  ['장부(기준)', 'led', (s) => load(REF, `led_${s}.json`)],
  ['ⓐ 절대캡', 'aoff', (s) => load(DIR, `aoff_${s}.json`)],
  ['ⓑ slack재정의', 'boff', (s) => load(DIR, `boff_${s}.json`)],
  ['ⓒ 재고완화', 'coff', (s) => load(DIR, `coff_${s}.json`)],
];
const ONARMS = [
  ['이월(기준)', 'car', (s) => load(REF, `car_${s}.json`)],
  ['이월+마을별최대캡', 't264cap', (s) => load(T264, `cap_${s}.json`)],   // T264 의 그 팔 — 꼴 비교용
  ['ⓐ 절대캡', 'aon', (s) => load(DIR, `aon_${s}.json`)],
  ['ⓑ slack재정의', 'bon', (s) => load(DIR, `bon_${s}.json`)],
  ['ⓒ 재고완화', 'con', (s) => load(DIR, `con_${s}.json`)],
];
const G = {};
for (const s of SEEDS) { G[s] = {}; for (const [, id, f] of [...OFFARMS, ...ONARMS]) G[s][id] = f(s); }

console.log('\n=== T275 — 주거 처방 후보 셋 (실지도 51마을 · 800일 · 3시드 · 짚 이월 켬/끔) ===');
console.log('  제품 코드 0 · 사본은 `require.cache`(`scripts/t275-arm.js`) · 새 수 0');
console.log('  ⓐ 하루 건축 ≤ 끔 팔 실측 **중앙**(4.3986 / 4.0800 / 3.9300 · 마을 무관)');
console.log('  ⓑ `slack` 을 곳간 식량등가 대신 **어제 인구 증가율**로(단계 값·문턱 전부 정본)');
console.log('  ⓒ 둘째 항 `재고/HOUSE_WOOD` 를 **짚 절약분 뺀 재고**로(끄면 누계 0 ⇒ 종전과 같다)');

const C = [['pop', '인구'], ['dead', '소멸'], ['weapQ', '무기Q'], ['expand', '확장셀'],
  ['toolQ', '도구Q'], ['preserved', '보존식'], ['rawGrain', '생곡']];
const built = (o) => Math.round(o.per.reduce((x, p) => x + (p.builtSum || 0), 0));
const deadOf = (o) => o.per.filter((p) => p.everPop && p.N <= 0).map((p) => p.name);

function block(title, arms, baseName) {
  console.log(`\n${title}`);
  console.log('  시드  팔                    ' + C.map(([, k]) => k.padStart(10)).join('') + '  지은 수용력   충당률   죽은 마을');
  for (const s of SEEDS) {
    for (const [nm, id] of arms) {
      const o = G[s][id];
      if (!o) { console.log('  ' + String(s).padEnd(6) + nm.padEnd(20) + '자료 없다'); continue; }
      console.log('  ' + String(s).padEnd(6) + nm.padEnd(20)
        + C.map(([k]) => (k === 'dead' ? `${o.dead}/${o.ever}` : fx(o[k], k === 'toolQ' || k === 'preserved' || k === 'rawGrain' ? 1 : 0)).padStart(10)).join('')
        + nf(built(o)).padStart(13) + String(o.fuelCovMean).padStart(9) + '   ' + (deadOf(o).join(' · ') || '(없음)'));
    }
    const b = G[s][baseName];
    if (b) for (const [nm, id] of arms.slice(1)) {
      const o = G[s][id]; if (!o) continue;
      console.log('  ' + ''.padEnd(6) + ('  Δ ' + nm).padEnd(20)
        + C.map(([k]) => (k === 'dead' ? `${o.dead - b.dead >= 0 ? '+' : ''}${o.dead - b.dead}` : pc(o[k], b[k])).padStart(10)).join('')
        + pc(built(o), built(b)).padStart(13) + pc(o.fuelCovMean, b.fuelCovMean).padStart(9));
    }
    console.log('');
  }
}
block('ⓐ 짚 이월 **끔** — 처방 셋 (기준: 장부 팔)', OFFARMS, 'led');
block('ⓐ 짚 이월 **켬** — 처방 셋 (기준: 이월 팔 · T264 의 마을별 최대 캡을 꼴 비교로 같이)', ONARMS, 'car');

// ── ⓐ' 지켜본 마을 ──────────────────────────────────────────────────────────
console.log("ⓐ' 지켜본 여섯 — **최대 인구 → 끝 인구**(T249 의 넷 + T264 건축캡이 새로 죽인 둘)");
const ALL = [...ONARMS];
console.log('  마을(시드)      ' + ALL.map(([nm]) => nm.slice(0, 9).padStart(13)).join(''));
for (const [s, nm2] of WATCHED) {
  const cells = ALL.map(([, id]) => {
    const o = G[s][id]; if (!o) return '—';
    const p = o.per.find((x) => x.name === nm2); if (!p) return '—';
    const mx = p.watch ? p.watch.reduce((a, r) => Math.max(a, r.N), 0) : (p.popMax != null ? p.popMax : null);
    return `${mx == null ? '?' : mx}→${p.N}`;
  });
  console.log('  ' + `${nm2}(${s})`.padEnd(16) + cells.map((c) => c.padStart(13)).join(''));
}

// ── ⓑ picker 위기 충원 ──────────────────────────────────────────────────────
console.log('\nⓑ picker "위기 충원"이 작동하나 — **이 세계가 쓰는 picker 는 `rational` 이다**');
console.log('  시드  팔              rational `:3800`(살아 있는 줄)          옛 `:3328`(`wood < N*5`)');
console.log('        ' + ' '.repeat(14) + '조건 참     충원      막힘   막힌%   |   조건 참  충원  막힘');
for (const s of SEEDS) {
  for (const [nm, id] of [['장부(=ⓒ끔)', 'coff'], ['ⓐ 절대캡(끔)', 'aoff'], ['ⓑ slack(끔)', 'boff'],
    ['ⓐ 절대캡(켬)', 'aon'], ['ⓑ slack(켬)', 'bon'], ['ⓒ 재고완화(켬)', 'con']]) {
    const o = G[s][id]; if (!o || o.rpTryTot == null) continue;
    const bl = o.rpTryTot > 0 ? (o.rpBlockTot / o.rpTryTot * 100).toFixed(1) + '%' : '—';
    console.log('  ' + String(s).padEnd(6) + nm.padEnd(16) + nf(o.rpTryTot).padStart(9) + nf(o.rpHitTot).padStart(9)
      + nf(o.rpBlockTot).padStart(9) + bl.padStart(8) + '   |' + nf(o.pkTryTot).padStart(9)
      + nf(o.pkHitTot).padStart(6) + nf(o.pkBlockTot).padStart(6));
  }
}
console.log('  ※옛 줄이 셋 다 **0** 이면 그 줄은 이 세계에서 **한 번도 안 돈다**(죽은 다리).');
console.log('    `t176-ab.js` 가 `picker: \'rational\'` 로 세계를 세우고 `:3193`/`:3917` 이 그걸로 갈린다.');
console.log('');
