'use strict';
// (@regress 없음 — 러너 밖 · T1293 표 자 · 읽기만)
// === scripts/t1293-lock.js — 광산 마을 원석 품목마다 값표 목표가 세계 몫 상한에 걸린 날 · 캐는 문이 잠긴 날 ==========
//   쓰는 법: node scripts/t1293-lock.js <이름=머리> [<이름=머리> …] [--from 11] [--md 표.md]
//   읽는 것: t1293 ② 날 머리 [곳간 S · 값표 목표 T(`_targetV2` — min(흐름 × 30, max(0.2, 세계 공급 × 내 인구 몫 × 1.5))) · 흐름 목표 F(`_consEMA × 30`)]
//            · t1256 날 줄 `bodyInY`(그 마을 그 품목 어제 몸 원석 곳간 단위) — 날 d 머리 줄 = 날 d−1 몫.
//   칸: 품목-날(F ≥ 1 — 그 마을이 녹이는 품목) 가운데
//     · 상한 걸림 = T < F ÷ 2(값표 목표가 흐름 목표의 절반 밑 — 세계 몫 상한이 문다)
//     · 넘음 = S ≥ T(포화 켬이면 그 품목 몫 값 0)
//     · 잠김 = 상한 걸림 ∧ 넘음 ∧ 그날 캔 것 0 — 캐지 않으니 세계 공급(× 30 몫)이 안 늘고, 목표가 바닥에 붙어 문이 안 열린다
//   마을 · 품목 줄: 녹이는 날 · 상한 걸림 · 넘음 · 잠김 · 캔 날 · 캔 합 · T/F 가운데 · 끝 날 S · T · F
const fs = require('fs');
const args = process.argv.slice(2), arms = [], opt = { from: 11 };
for (let i = 0; i < args.length; i++) { if (args[i] === '--from') opt.from = +args[++i]; else if (args[i] === '--md') opt.md = args[++i]; else { const [n, h] = args[i].split('='); arms.push([n, h]); } }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const f1 = (x) => x == null ? '—' : (+x).toFixed(1), f2 = (x) => x == null ? '—' : (+x).toFixed(2);
const out = [];
for (const [name, h] of arms) {
  const S = rd(h + '.t1293.json'), A = rd(h + '.t1256.json'); if (!S || !A) { out.push(`${name}: 관찰기 JSON 없음`); continue; }
  const I = (n) => A.dcols.indexOf(n), days = Object.keys(S.ore).map(Number).filter((d) => d >= opt.from).sort((a, b) => a - b), L = days[days.length - 1];
  const prodOf = (d, vn, k) => { const rows = A.day[d + 1]; if (!rows) return null; const r = rows.find((q) => q[0] === vn); return r ? ((r[I('bodyInY')] || {})[k] || 0) : 0; };   // 날 d 의 캔 몫 = 날 d+1 머리 줄
  const per = {}; const T0 = { melt: 0, cap: 0, over: 0, lock: 0, dug: 0 };
  for (const d of days) for (const [vn, V] of Object.entries(S.ore[d] || {})) for (const [k, [s, t, f]] of Object.entries(V.o || {})) {
    if (!(f >= 1) || t == null) continue;
    const P = per[vn + ' ' + k] || (per[vn + ' ' + k] = { melt: 0, cap: 0, over: 0, lock: 0, dug: 0, dugU: 0, r: [], last: null });
    const p = prodOf(d, vn, k), cap = t < f / 2, over = s >= t, lock = cap && over && p === 0;
    P.melt++; T0.melt++; if (cap) { P.cap++; T0.cap++; } if (over) { P.over++; T0.over++; } if (lock) { P.lock++; T0.lock++; } if (p > 0) { P.dug++; P.dugU += p; T0.dug++; }
    P.r.push(t / f); if (d === L) P.last = [s, t, f];
  }
  out.push('', `### ${name} — 날 ${opt.from} ~ ${L} · 녹이는 품목-날 ${T0.melt} · 상한 걸림 ${T0.cap}(${(100 * T0.cap / (T0.melt || 1)).toFixed(1)} %) · 넘음 ${T0.over} · 잠김 ${T0.lock}(${(100 * T0.lock / (T0.melt || 1)).toFixed(1)} %) · 캔 날 ${T0.dug}`, '',
    '| 마을 · 품목 | 녹이는 날 | 상한 걸림 | 넘음 | 잠김 | 캔 날 | 캔 합(단위) | T ÷ F 가운데 | 끝 날 S · T · F |', '|---|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const [key, P] of Object.entries(per).sort((a, b) => b[1].lock - a[1].lock || b[1].melt - a[1].melt)) {
    const r = P.r.slice().sort((a, b) => a - b), med = r.length ? r[r.length >> 1] : null;
    out.push(`| ${key.replace(' ore_', ' ')} | ${P.melt} | ${P.cap} | ${P.over} | ${P.lock} | ${P.dug} | ${f1(P.dugU)} | ${f2(med)} | ${P.last ? P.last.map(f1).join(' · ') : '—'} |`);
  }
}
const md = out.join('\n'); console.log(md); if (opt.md) fs.writeFileSync(opt.md, md + '\n');
