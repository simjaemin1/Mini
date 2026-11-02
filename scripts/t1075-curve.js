#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1075 그림 기계 · 판 JSON 만 읽는다 · 판정 0)
// === scripts/t1075-curve.js — 흉년 마을 하나의 행복 곡선(H · H*) 그림 ===
//   node scripts/t1075-curve.js <판 디렉터리(켬)> <출력.svg> [시드] [마을 이름]
//     마을을 안 주면: 그 시드에서 마을 평균 식량 빚(`debtMean`)이 가장 깊었던 마을(= 가장 크게 굶은 흉년 마을)
//   그리는 것: 실제 행복 H(굵은 선) · 평형 H*(가는 선) · 마을 평균 빚 ÷ 14(점선 · 0~1 눈금) · 굶어 죽은 날(아래 눈금) · 이탈 누계(오른쪽 글)
const fs = require('fs');
const path = require('path');
const [dir, out, seedArg, nameArg] = process.argv.slice(2);
const seed = seedArg || '1020';
const t = JSON.parse(fs.readFileSync(path.join(dir, `base-${seed}.t1075.json`), 'utf8'));
const C = t.cols, iH = C.indexOf('H'), iE = C.indexOf('Heq'), iD = C.indexOf('debtMean'), iF = C.indexOf('fdDead'), iM = C.indexOf('emigTot'), iP = C.indexOf('pop');
let vi = nameArg ? t.names.indexOf(nameArg) : -1;
if (vi < 0) { let best = -1; for (let k = 0; k < t.names.length; k++) { let m = 0; for (const [, vs] of t.rows) m = Math.max(m, vs[k][iD]); if (m > best) { best = m; vi = k; } } }
const S = t.rows.map(([d, vs]) => ({ d, H: vs[vi][iH], E: vs[vi][iE], D: vs[vi][iD], F: vs[vi][iF], M: vs[vi][iM], P: vs[vi][iP] }));
const W = 1000, Hh = 420, L = 60, R = 30, T = 40, B = 60;
const d0 = S[0].d, d1 = S[S.length - 1].d;
const yMax = Math.max(1, ...S.map((s) => Math.max(s.H, s.E)));
const X = (d) => L + (d - d0) / Math.max(1, d1 - d0) * (W - L - R), Y = (v) => T + (1 - v / yMax) * (Hh - T - B);
const line = (f) => S.map((s, i) => `${i ? 'L' : 'M'}${X(s.d).toFixed(1)},${Y(f(s)).toFixed(1)}`).join('');
const deaths = []; for (let i = 1; i < S.length; i++) if (S[i].F > S[i - 1].F) deaths.push(S[i].d);
let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" font-family="sans-serif" font-size="12"><rect width="100%" height="100%" fill="#fff"/>`;
for (let v = 0; v <= yMax + 1e-9; v += 0.25) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ddd"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(2)}</text>`;
for (let d = Math.ceil(d0 / 100) * 100; d <= d1; d += 100) g += `<text x="${X(d)}" y="${Hh - B + 18}" text-anchor="middle">${d}</text>`;
g += `<path d="${line((s) => Math.min(yMax, s.D / 14))}" fill="none" stroke="#c77" stroke-dasharray="4 3"/>`;
g += `<path d="${line((s) => s.E)}" fill="none" stroke="#888" stroke-width="1"/>`;
g += `<path d="${line((s) => s.H)}" fill="none" stroke="#123" stroke-width="2.2"/>`;
for (const d of deaths) g += `<line x1="${X(d)}" x2="${X(d)}" y1="${Hh - B}" y2="${Hh - B + 6}" stroke="#b00" stroke-width="2"/>`;
g += `<text x="${L}" y="22" font-size="14">${t.names[vi]} (시드 ${seed}) — 실제 행복 H(굵은 선) · 평형 H*(회색) · 평균 식량 빚 ÷ 14(붉은 점선) · 굶어 죽은 날(아래 붉은 눈금 ${deaths.length}) · 이탈 ${S[S.length - 1].M}명 · 끝 인구 ${S[S.length - 1].P}</text>`;
g += `<text x="${(L + W - R) / 2}" y="${Hh - 12}" text-anchor="middle">날</text></svg>`;
fs.writeFileSync(out, g);
console.log(`${t.names[vi]} · 빚 최대 ${Math.max(...S.map((s) => s.D)).toFixed(2)} · 굶어 죽은 날 ${deaths.length} · H 최저 ${Math.min(...S.map((s) => s.H)).toFixed(3)} · 이탈 ${S[S.length - 1].M}`);
