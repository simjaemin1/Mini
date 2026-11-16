'use strict';
// (@regress 없음 — 러너 밖 · T1313 회부 ③ 자 · 읽기만)
// === scripts/t1313-cpu.js — 판 둘(같은 팔 · 같은 시드 · 같은 때 돈 짝)의 하루 CPU 견주기 — 날 80 ~ 92 뜀이 섰나 · 몸 모양 수 ==========
//   쓰는 법: node scripts/t1313-cpu.js <이름=머리> <이름=머리> [--md 표.md]
//     머리 = 판 JSON 경로에서 `.json` 을 뗀 것(곁 t1243 · t1277 관찰기 JSON)
//   칸(판마다): 하루 CPU(t1243 `cpu` [날 d] — 머리 d−1 → d) 10날 평균 · 날 21 뒤 가장 큰 앞날 대비 뜀(날 · 배) · 날 70 ~ 79 평균 ↔ 날 93 ~ 끝 평균(뜀 앞뒤) ·
//              몸 모양(t1277 ④ `shape` — 그날 몸 모양 수 · 모양이 새로 선 날과 그 일 · 가장 흔한 모양과 다른 열쇠)
const fs = require('fs');
const args = process.argv.slice(2), arms = [], opt = {};
for (let i = 0; i < args.length; i++) { if (args[i] === '--md') opt.md = args[++i]; else { const [n, h] = args[i].split('='); arms.push([n, h]); } }
if (arms.length < 1) { console.error('쓰는 법: node scripts/t1313-cpu.js <이름=머리> <이름=머리> [--md 표.md]'); process.exit(2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const f1 = (x) => x == null || !isFinite(x) ? '—' : (+x).toFixed(1), f2 = (x) => x == null || !isFinite(x) ? '—' : (+x).toFixed(2);
const S = arms.map(([n, h]) => {
  const C = rd(h + '.t1243.json'), X = rd(h + '.t1277.json');
  const cpu = new Map(((C && C.cpu) || []).map((q) => [q[0], q[1]]));
  const mean = (a, b) => { let s = 0, k = 0; for (let d = a; d <= b; d++) if (cpu.has(d)) { s += cpu.get(d); k++; } return k ? s / k : null; };
  let jump = null; for (const [d, v] of cpu) { if (d <= 21) continue; const p = cpu.get(d - 1); if (p > 0 && v > 0 && (!jump || v / p > jump.r)) jump = { d, r: v / p, from: p, to: v }; }
  const last = cpu.size ? Math.max(...cpu.keys()) : 0;
  const shapes = {}, born = [];
  if (X && X.shape) {
    const K = X.shapeKeys || {};
    for (const [d, H] of Object.entries(X.shape)) shapes[d] = Object.keys(H).length;
    for (const [k, s] of Object.entries(K)) if (s.day > 1) born.push([s.day, s.npc ? 'npc' : '—', s.job || '', s.n, k]);
    born.sort((a, b) => a[0] - b[0]);
  }
  return { n, h, cpu, mean, jump, last, shapes, born, X };
});
const out = [];
const days = []; for (let d = 2; d <= Math.max(...S.map((s) => s.last)); d += 10) days.push(d);
out.push('| 하루 CPU(초) 10날 평균 | ' + S.map((s) => s.n).join(' | ') + (S.length === 2 ? ' | 둘째 ÷ 첫째 |' : ' |'), '|---|' + S.map(() => '---:').join('|') + (S.length === 2 ? '|---:|' : '|'));
for (const d of days) { const e = Math.min(d + 9, 100); const ms = S.map((s) => s.mean(d, e)); out.push(`| 날 ${d} ~ ${e} | ` + ms.map(f1).join(' | ') + (S.length === 2 ? ` | ${ms[0] && ms[1] ? f2(ms[1] / ms[0]) : '—'} |` : ' |')); }
out.push('', '| 칸 | ' + S.map((s) => s.n).join(' | ') + ' |', '|---|' + S.map(() => '---').join('|') + '|');
out.push('| 가장 큰 하루 뜀(날 21 뒤) | ' + S.map((s) => s.jump ? `날 ${s.jump.d} ×${f2(s.jump.r)}(${f1(s.jump.from)} → ${f1(s.jump.to)})` : '—').join(' | ') + ' |');
out.push('| 날 70 ~ 79 평균 → 날 93 ~ 끝 평균 | ' + S.map((s) => { const a = s.mean(70, 79), b = s.mean(93, s.last); return `${f1(a)} → ${f1(b)}(×${a && b ? f2(b / a) : '—'})`; }).join(' | ') + ' |');
out.push('| 판 합(날 2 ~ 끝) | ' + S.map((s) => { let t = 0; for (const [d, v] of s.cpu) if (d >= 2) t += v; return t.toFixed(0); }).join(' | ') + ' |');
out.push('| 몸 모양 수 — 날 10 · 50 · 70 · 80 · 90 · 끝 | ' + S.map((s) => [10, 50, 70, 80, 90, s.last].map((d) => s.shapes[d] == null ? '—' : s.shapes[d]).join(' · ')).join(' | ') + ' |');
for (const s of S) {
  out.push('', `#### ${s.n} — 새로 선 몸 모양(날 2 뒤 · 날 · npc · 일 · 열쇠 수)`, '', s.born.length ? s.born.map((b) => `날 ${b[0]} ${b[1]} ${b[2]} 열쇠 ${b[3]}`).join(' · ') : '없음');
}
const md = out.join('\n'); console.log(md); if (opt.md) fs.writeFileSync(opt.md, md + '\n');
