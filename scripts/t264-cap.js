#!/usr/bin/env node
// === scripts/t264-cap.js — T264: "너무 빨리 키웠다"를 검정한다 (표 다섯) ==============
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T264]
//   T249 의 결론 한 문장: "짚이 마을을 죽인 게 아니라 **너무 빨리 키웠다**."
//   맞으면 **건축 속도만 끔 팔만큼 묶었을 때 소멸 1·1·2 가 사라져야** 한다(ⓑ).
//   안 사라지면 죽음의 자리는 주거가 아니라 목재 재고를 읽는 다른 셋이다(ⓒ).
//   재는 자는 `t176-ab.js` 그대로, 팔은 `t264-arm.js` 가 `require.cache` 로 심는다(제품 무접촉).
//
// 실행: node scripts/t264-cap.js /tmp/t264 [--ref /tmp/t249]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t264';
const ri = process.argv.indexOf('--ref');
const REF = ri >= 0 && process.argv[ri + 1] ? process.argv[ri + 1] : '/tmp/t249';
const SEEDS = [1020, 7, 42];
const TARGETS = [[1020, '농촌12'], [7, '농촌9'], [42, '광산3'], [42, '농촌10']];
const load = (d, f) => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const fx = (x, d) => (x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');

// 팔: 끔·장부·이월은 **치환 0** 의 기준선(T249 판 그대로), 나머지 넷은 사본 팔
const ARMS = [
  ['OFF', (s) => load(DIR, `off_${s}.json`)],
  ['장부', (s) => load(REF, `led_${s}.json`)],
  ['이월', (s) => load(REF, `car_${s}.json`)],
  ['이월+관측', (s) => load(DIR, `obs_${s}.json`)],
  ['이월+건축캡', (s) => load(DIR, `cap_${s}.json`)],
  ['이월+picker고정', (s) => load(DIR, `picker_${s}.json`)],
  ['이월+방아쇠고정', (s) => load(DIR, `trigger_${s}.json`)],
  ['이월+fuelK고정', (s) => load(DIR, `fuelk_${s}.json`)],
];
const G = {};
for (const s of SEEDS) { G[s] = {}; for (const [nm, f] of ARMS) G[s][nm] = f(s); }

console.log('\n=== T264 — "너무 빨리 키웠다" 검정 (실지도 51마을 · 800일 · 3시드 · 팔 여덟) ===');
console.log('  제품 코드 0 · 사본은 `require.cache`(`scripts/t264-arm.js`) · 캡 값은 **끔 팔 실측**(새 수 0)');

// ── ⓐ 건축 속도 자 ──────────────────────────────────────────────────────────
console.log('\nⓐ 건축 속도 자 — 끔 팔의 **마을별 실측 최대 일일 건축**(캡 값의 밑변)');
console.log('  시드   마을 수    최소      1사분      중앙      3사분      최대   |  가장 빠른 셋');
for (const s of SEEDS) {
  const d = G[s].OFF; if (!d) { console.log(`  ${s}  자료 없다`); continue; }
  const rows = d.per.map((p) => ({ n: p.name, b: p.builtMax })).sort((a, b) => a.b - b.b);
  const v = rows.map((x) => x.b);
  const q = (f) => v[Math.min(v.length - 1, Math.floor(v.length * f))];
  const top = rows.slice(-3).reverse().map((x) => `${x.n} ${x.b.toFixed(2)}`).join(' · ');
  console.log('  ' + String(s).padEnd(6) + String(v.length).padStart(6) + fx(v[0], 4).padStart(10)
    + fx(q(0.25), 4).padStart(10) + fx(q(0.5), 4).padStart(10) + fx(q(0.75), 4).padStart(10)
    + fx(v[v.length - 1], 4).padStart(10) + '  |  ' + top);
}
console.log('  ※캡은 마을 이름별로 그 마을의 **자기 최대**다 — 세계 평균이 아니다(약한 마을을 더 조이지 않는다).');

// ── ⓑ·ⓒ 여덟 수 + 소멸 ─────────────────────────────────────────────────────
const C = [['pop', '인구'], ['dead', '소멸'], ['weapQ', '무기Q'], ['expand', '확장셀'],
  ['reqOpened', '게시'], ['toolQ', '도구Q'], ['preserved', '보존식'], ['rawGrain', '생곡']];
console.log('\nⓑ·ⓒ 여덟 수 + **소멸** — 이월 팔의 1·1·2 가 어느 팔에서 사라지나');
console.log('  시드  팔                  ' + C.map(([, k]) => k.padStart(10)).join('') + '   지은 수용력');
for (const s of SEEDS) {
  for (const [nm] of ARMS) {
    const o = G[s][nm]; if (!o) { console.log('  ' + String(s).padEnd(6) + nm.padEnd(18) + '자료 없다'); continue; }
    const built = o.per.reduce((x, p) => x + (p.builtSum || 0), 0);
    console.log('  ' + String(s).padEnd(6) + nm.padEnd(18)
      + C.map(([k]) => (k === 'dead' ? `${o.dead}/${o.ever}` : fx(o[k], k === 'toolQ' || k === 'preserved' || k === 'rawGrain' ? 1 : 0)).padStart(10)).join('')
      + nf(Math.round(built)).padStart(14));
  }
  console.log('');
}

// ── ⓑ' 소멸 귀속 ────────────────────────────────────────────────────────────
console.log("ⓑ' 소멸 귀속 — 어느 마을이 어느 팔에서 죽나");
for (const s of SEEDS) {
  console.log(`  시드 ${s}`);
  for (const [nm] of ARMS) {
    const o = G[s][nm]; if (!o) continue;
    const dead = o.per.filter((p) => p.everPop && p.N <= 0);
    console.log('    ' + nm.padEnd(17) + `${o.dead}/${o.ever}`.padStart(6) + '  '
      + (dead.length ? dead.map((p) => `${p.name}(지력 ${p.fert} · 숲 ${p.wood} · 돌 ${p.stone}${p.stoneFloor ? ' ★바닥' : ''})`).join(' · ') : '(없음)'));
  }
}

// ── ⓒ' 지켜본 넷 — 최대 인구와 끝 인구 ──────────────────────────────────────
console.log("\nⓒ' 지켜본 넷 — 팔마다 **최대 인구 → 끝 인구**(이월 팔에서 죽은 그 넷)");
console.log('  마을(시드)   ' + ARMS.map(([nm]) => nm.slice(0, 8).padStart(12)).join(''));
for (const [s, nm2] of TARGETS) {
  const cells = ARMS.map(([nm]) => {
    const o = G[s][nm]; if (!o) return '—';
    const p = o.per.find((x) => x.name === nm2); if (!p) return '—';
    const mx = p.watch ? p.watch.reduce((a, r) => Math.max(a, r.N), 0) : (p.popMax != null ? p.popMax : null);
    return `${mx == null ? '?' : mx}→${p.N}`;
  });
  console.log('  ' + `${nm2}(${s})`.padEnd(13) + cells.map((c) => c.padStart(12)).join(''));
}

// ── ⓓ satMul 감산 칸 ────────────────────────────────────────────────────────
console.log('\nⓓ 감산 칸 — 잠재 대비 실현(`1 − 실현/잠재`). **공통 배수를 같이 물고 있으므로 `wood` 를 나란히 둔다**');
console.log('  마을(시드)   팔            잔가지 감산   껍질 감산   목재 감산  |  잔가지 초과(잔가지−목재)   껍질 초과');
for (const [s, nm2] of TARGETS) {
  for (const arm of ['이월+관측', '이월+건축캡']) {
    const o = G[s][arm]; if (!o) continue;
    const p = o.per.find((x) => x.name === nm2); if (!p || !p.watch) continue;
    // ★**짝지은 날만** 센다 — 목재 감산이 있는 날(벌목이 실제로 있던 날)에서만 비교해야 공통 배수가 상쇄된다.
    const rows = p.watch.filter((r) => r.woodTaper != null && isFinite(r.woodTaper));
    const mm = (k) => { let a = 0, n2 = 0; for (const r of rows) if (r[k] != null && isFinite(r[k])) { a += r[k]; n2++; } return n2 ? [a / n2, n2] : [null, 0]; };
    const [tw, ntw] = mm('twigTaper'), [bk, nbk] = mm('barkTaper'), [wd] = mm('woodTaper');
    const d = (x) => (x == null || wd == null ? '—' : (x - wd >= 0 ? '+' : '') + (x - wd).toFixed(4));
    console.log('  ' + `${nm2}(${s})`.padEnd(13) + arm.padEnd(14)
      + (tw == null ? '—' : tw.toFixed(4)).padStart(12) + (bk == null ? '—' : bk.toFixed(4)).padStart(12)
      + (wd == null ? '—' : wd.toFixed(4)).padStart(12) + '  |' + d(tw).padStart(22) + d(bk).padStart(12)
      + `  (짝 ${rows.length}일 · 잔가지 ${ntw} · 껍질 ${nbk})`);
  }
}
console.log('  ※`1` 에 가까울수록 그날 그 품목이 **거의 안 났다**는 뜻이다(잠재는 있었는데 실현이 없었다).');
console.log('');
