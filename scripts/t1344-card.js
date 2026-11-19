'use strict';
// (@regress 없음 — 러너 밖 · T1344 표 자 · 읽기만)
// === scripts/t1344-card.js — 카드 ④ 칸 한 장(판 묶음마다 팔 줄) — t1333-arms · t1344-arms 의 `--json` 요약 둘을 읽는다 ==========
//   쓰는 법: node scripts/t1344-card.js <이름=t1333요약.json:t1344요약.json> [<이름=…> …]   (요약 첫 팔 = 끔 — 끔비의 분모)
//   칸(카드 ④): 광산5 로 간 구리 짐(수 · 양 — 둘째 화물 포함) · 청동 무기 누계(끔비) · 녹임 · 잠김 주석 % · 무기 Q(판 여덟 수 · 곳간 가중) ·
//              섞어 실은 짐(닿은 줄 · 품목 수 · 많은 셋) · 식량 교역량(econ 식량 단위 · 끔비) · 인구(끔비)
const fs = require('fs');
const f0 = (x) => x == null ? '—' : Math.round(+x).toLocaleString('en-US'), f1 = (x) => x == null ? '—' : (+x).toFixed(1), f2 = (x) => x == null ? '—' : (+x).toFixed(2), f3 = (x) => x == null ? '—' : (+x).toFixed(3);
const pc = (x) => x == null || !Number.isFinite(x) ? '—' : (100 * x).toFixed(1);
console.log('| 판 · 팔 | 광산5 로 간 구리 짐(수 · 양) | **청동**(끔비) | 녹임 | 잠김 주석 % | 무기 Q(여덟 수 · 곳간 가중) | 섞어 실은 짐(줄 · 품목 수 · 많은 셋) | 식량 교역량(끔비) | 인구(끔비) |');
console.log('|---|---:|---:|---:|---:|---:|---|---:|---:|');
for (const a of process.argv.slice(2)) {
  const k = a.indexOf('='), name = a.slice(0, k), [p33, p44] = a.slice(k + 1).split(':');
  let A = null, B = null; try { A = JSON.parse(fs.readFileSync(p33, 'utf8')); } catch (e) { A = null; } try { B = JSON.parse(fs.readFileSync(p44, 'utf8')); } catch (e) { B = null; }
  if (!A) { console.log(`| ${name} | (요약 없음) |||||||| `); continue; }
  const arms = Object.keys(A), b0 = A[arms[0]], c0 = B ? B[arms[0]] : null;
  for (const arm of arms) {
    const s = A[arm], t = B ? B[arm] : null;
    if (!s) { console.log(`| ${name} · ${arm} | (판 없음) |||||||| `); continue; }
    const lockSn = s.lock && s.lock.ore_tin && s.lock.ore_tin.melt ? s.lock.ore_tin.lock / s.lock.ore_tin.melt : null;
    const food = t ? t.fOut + t.fBack : null, food0 = c0 ? c0.fOut + c0.fBack : null;
    const kinds = t && t.kinds ? Object.entries(t.kinds).sort((p, q) => q[1] - p[1]) : [];
    const mix = t && t.mixN ? `${f0(t.mixN)} · ${kinds.length} · ${kinds.slice(0, 3).map(([r, n]) => `${r} ${n}`).join(' · ')}` : '0';
    console.log(`| ${name} · ${arm} | ${s.cu5n} · ${f1(s.cu5amt)} | **${f2(s.bronze)}**(${b0 && b0.bronze ? f2(s.bronze / b0.bronze) : '—'}) | ${f1(s.smelt)} | ${pc(lockSn)} | ${s.wq8 == null ? '—' : f0(s.wq8)} · ${f3(s.wq)} | ${mix} | ${f0(food)}(${food0 ? f3(food / food0) : '—'}) | ${f0(s.pop)}(${b0 && b0.pop ? f3(s.pop / b0.pop) : '—'}) |`);
  }
}
