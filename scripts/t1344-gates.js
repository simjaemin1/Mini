'use strict';
// (@regress 없음 — 러너 밖 · T1344 표 자 · 읽기만)
// === scripts/t1344-gates.js — 주조 문이 닫힌 날의 갈래(마을마다) — t1344 관찰기 날 줄: 대장장이 있던 날 · 구리 · 주석 있던 날 · 닫힘(근접검 ≥ 한도) ·
//     그 가운데 취약 갈래(식량 안보 ≤ 0.45 — 한도 = 전사 × 1.2 · 최소 2 · "전사 실수요") · 잘 먹는 갈래(한도 = 사람 × 0.72 × 0.45 · "청동 몫") · 열림(잘 먹는 날) ==========
//   쓰는 법: node scripts/t1344-gates.js <머리> [<머리> …]   (머리 = 판 JSON 에서 `.json` 을 뗀 것 · 곁 `.t1344.json`(.gz))
const fs = require('fs'), zlib = require('zlib');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } };
for (const h of process.argv.slice(2)) {
  const X = rd(h + '.t1344.json'), ac = X.acols, I = (k) => ac.indexOf(k);
  const by = {};
  for (const [d, D] of Object.entries(X.day)) for (const [vn, r] of Object.entries(D)) {
    const b = by[vn] || (by[vn] = { sm: 0, shut: 0, frag: 0, fed: 0, open: 0, fedOpen: 0, cuSn: 0 });
    if (!(r[I('smith')] > 0)) continue;
    b.sm++;
    const secF = r[I('secF')], isFed = secF != null && secF > 0.45, pop = r[I('pop')], war = r[I('warrior')];
    const cap = isFed ? pop * 0.72 * 0.45 : Math.max(2, war * 1.2), melee = r[I('weapon')] * (r[I('swordFrac')] == null ? 0.5 : r[I('swordFrac')]);
    if ((r[I('copper')] || 0) >= 0.3 && (r[I('tin')] || 0) >= 0.12) b.cuSn++;
    if (melee >= cap) { b.shut++; if (isFed) b.fed++; else b.frag++; } else { b.open++; if (isFed) b.fedOpen++; }
  }
  const T = { sm: 0, shut: 0, frag: 0, fed: 0 };
  console.log('## ' + h.split('/').pop());
  console.log('| 마을 | 대장장이 날 | 구리 ≥ 0.3 · 주석 ≥ 0.12 날 | 문 닫힘 | 취약 갈래(전사 커버리지) | 잘 먹는 갈래(청동 몫) | 열림(잘 먹는 날) |');
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const [vn, b] of Object.entries(by).filter(([, b]) => b.sm > 0).sort((p, q) => q[1].sm - p[1].sm)) {
    console.log(`| ${vn} | ${b.sm} | ${b.cuSn} | ${b.shut} | ${b.frag} | ${b.fed} | ${b.open}(${b.fedOpen}) |`);
    T.sm += b.sm; T.shut += b.shut; T.frag += b.frag; T.fed += b.fed;
  }
  console.log(`| 합 | ${T.sm} | | ${T.shut} | ${T.frag} | ${T.fed} | |`);
}
