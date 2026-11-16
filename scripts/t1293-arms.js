'use strict';
// (@regress 없음 — 러너 밖 · T1293 표 자 · 읽기만)
// === scripts/t1293-arms.js — T1293 팔 여럿(끔 · T1266 + T1271 · + T1293)의 판 요약 · 10날 표 — 칸 셈은 `t1266-table.js` 함수 그대로(사본 0) ==========
//   쓰는 법: node scripts/t1293-arms.js <이름=머리> [<이름=머리> …] [--md 표.md] [--json 요약.json] [--vil]
//     머리 = 판 JSON 경로에서 `.json` 을 뗀 것(곁 관찰기 JSON: t1256 · t1266 · t1243 · t1293)
//   하루 CPU 칸 = t1243 `cpu` 줄 [날 d] 그대로(머리 d−1 → d 의 CPU 초 · T1271 · T1277 보고와 같은 줄).
//   원석 재고 ÷ 목표 = t1293 ② 날 머리 광산 마을 원석 품목별 곳간 · 값표 목표(`_targetV2(…).target` — 세계 몫 상한까지) · 흐름 목표(`_consEMA × 30` — T1277 표의 그 목표)
//     넘은 몫 = Σ 품목 max(0, 곳간 − 값표 목표) — 녹일 수 있는 것보다 많이 쌓인 원석.
//   포화 칸 = t1293 ① 물음 셈(그림자면 닫힘 · 포화면 닫힘 · 쓴 값으로 닫힘 · 포화로 값 0 · 깎임) — 끈 팔은 "켰으면" 값.
const fs = require('fs');
const T = require('./t1266-table.js');
const args = process.argv.slice(2), arms = [], opt = {};
for (let i = 0; i < args.length; i++) { if (args[i] === '--md' || args[i] === '--json') opt[args[i].slice(2)] = args[++i]; else if (args[i] === '--vil') opt.vil = true; else { const [n, h] = args[i].split('='); const X = T.load(h); X.s = (() => { try { return JSON.parse(fs.readFileSync(h + '.t1293.json', 'utf8')); } catch (e) { return null; } })(); arms.push([n, X, h]); } }
if (!arms.length) { console.error('쓰는 법: node scripts/t1293-arms.js <이름=머리> … [--md 표.md] [--json 요약.json] [--vil]'); process.exit(2); }
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const lastOf = (X) => { try { return Math.max(...Object.keys(X.a.day).map(Number)); } catch (e) { return 0; } };
const L0 = Math.max(...arms.map(([, X]) => lastOf(X)));
const DAYS = []; for (let d = 10; d <= Math.max(10, L0); d += 10) DAYS.push(d);
const cpuAt = (X, d) => { const r = X.c && X.c.cpu ? X.c.cpu.find((q) => q[0] === d) : null; return r ? r[1] : null; };
const tot = (X, d, i) => { const B = (X.b.g[d] || {}).tot; return B ? sum(Object.values(B).map((t) => t[i])) : null; };
//   t1293 ② 날 머리 — 광산 마을 원석: 곳간 · 값표 목표 · 흐름 목표 · 넘은 몫
function oreAt(X, d) {
  const D = X.s && X.s.ore && X.s.ore[d]; if (!D) return null;
  let st = 0, tg = 0, fl = 0, over = 0, ok = true, n = 0;
  for (const V of Object.values(D)) { if (!V.ok) ok = false; for (const q of Object.values(V.o || {})) { const [s, t, f] = q; st += s; fl += f || 0; if (t != null) { tg += t; over += Math.max(0, s - t); } n++; } }
  return { st, tg: ok ? tg : null, fl, over: ok ? over : null, n };
}
//   t1293 ① 10날 칸 합(마을 합)
function satAt(X, d) {
  const B = X.s && X.s.q && X.s.q[d]; if (!B) return null;
  const o = { n: 0, u: 0, w: 0, wOwn: 0, wSat: 0, r: 0, closeNow: 0, closeOwn: 0, closeSat: 0, zero: 0, cut: 0, satN: 0, st: 0, stN: 0 };
  for (const Q of Object.values(B)) for (const k in o) o[k] += Q[k] || 0;
  return o;
}
function satAll(X) { const o = { n: 0, closeNow: 0, closeOwn: 0, closeSat: 0, zero: 0, cut: 0, satN: 0, w: 0, wOwn: 0, wSat: 0, r: 0 }; if (!X.s || !X.s.q) return null; for (const d in X.s.q) { const s = satAt(X, d); for (const k in o) o[k] += s[k] || 0; } return o; }
const out = [];
out.push('| 칸(' + arms.map((a) => a[0]).join(' : ') + ') | ' + DAYS.map((d) => '날 ' + d).join(' | ') + ' |');
out.push('|---|' + DAYS.map(() => '---:').join('|') + '|');
const row = (name, fn) => out.push('| ' + name + ' | ' + DAYS.map((d) => arms.map(([, X]) => { const c = T.cells(X, d); return c ? fn(c, X, d) : '—'; }).join(' : ')).join(' | ') + ' |');
row('광부 econ(광산 마을)', (c) => c.miners);
row('광부 몸 채광 · 쉼 %(10날 표본)', (c) => c.st ? T.pc(c.st.mine) + ' · ' + T.pc(c.st.rest) : '—');
row('몸 원석 곳간 kg/날(10날)', (c) => T.f1(c.kgDay));
row('원석 재고(단위)', (c) => T.f1(c.oreStock));
row('재고 ÷ 값표 목표 · 넘은 몫(단위)', (c, X, d) => { const o = oreAt(X, d); return o && o.tg ? (o.st / o.tg).toFixed(2) + ' · ' + T.f1(o.over) : '—'; });
row('재고 ÷ 흐름 목표(T1277 자)', (c, X, d) => { const o = oreAt(X, d); return o && o.fl ? (o.st / o.fl).toFixed(2) : '—'; });
row('노 녹임 누계(원석 단위)', (c) => T.f1(c.smelt));
row('청동 무기 누계', (c) => T.f2(c.bronze));
row('광산 마을 인구', (c) => T.f0(c.popM));
row('한 시간 값 물음 · 멈춤(10날)', (c) => c.hours == null ? '—' : T.f0(c.hours) + ' · ' + T.f0(c.stop));
row('물음 닫힘 그림자 · 포화(켰으면) · 쓴 값(10날)', (c, X, d) => { const s = satAt(X, d); return s && s.n ? T.f0(s.closeOwn) + ' · ' + T.f0(s.closeSat) + ' · ' + T.f0(s.closeNow) : '—'; });
row('보존 참', (c) => c.noSwingIn);
row('하루 CPU 초(10날 가운데)', (c) => T.f1(c.cpu));
const S = {};
out.push('', '| 칸 | ' + arms.map((a) => a[0]).join(' | ') + ' |', '|---|' + arms.map(() => '---:').join('|') + '|');
for (const [n, X] of arms) {
  const s = T.summary(X), L = s.last, o = oreAt(X, L), sa = satAll(X);
  const cpu = {}; for (const d of [20, 30, 40, 50, 51, 52, 53, 54, 55, 60, 70, 80, 90, 100]) cpu['d' + d] = cpuAt(X, d);
  let jump = null; if (X.c && X.c.cpu) for (const [d, v] of X.c.cpu) { if (d <= 21) continue; const p = cpuAt(X, d - 1); if (p > 0 && v > 0) { const r = v / p; if (!jump || r > jump.r) jump = { d, r, from: p, to: v }; } }
  S[n] = { ...s, j: undefined, pop: X.j && X.j.eight ? X.j.eight.pop : null, cpu, jump, minersL: tot(X, L, 4), oreL: o, sat: sa };
}
const line = (name, fn) => out.push('| ' + name + ' | ' + arms.map(([n]) => fn(S[n])).join(' | ') + ' |');
line('몸 원석 kg/날(날 2 ~ 끝)', (s) => T.f1(s.kgDay));
line('원석 재고 · 녹임 · 청동(끝 날)', (s) => `${T.f1(s.oreStock)} · ${T.f1(s.smelt)} · ${T.f2(s.bronze)}`);
line('재고 ÷ 값표 목표 · ÷ 흐름 목표 · 넘은 몫(끝 날)', (s) => s.oreL && s.oreL.tg ? `${(s.oreL.st / s.oreL.tg).toFixed(2)} · ${s.oreL.fl ? (s.oreL.st / s.oreL.fl).toFixed(2) : '—'} · ${T.f1(s.oreL.over)}` : '—');
line('한 시간 물음 · 멈춤', (s) => s.t66 ? `${T.f0(s.t66.hours)} · ${T.f0(s.t66.stop)}` : '—');
line('물음 닫힘: 그림자 · 포화(켰으면) · 쓴 값 · 포화로 값 0', (s) => s.sat && s.sat.n ? `${T.f0(s.sat.closeOwn)} · ${T.f0(s.sat.closeSat)} · ${T.f0(s.sat.closeNow)} · ${T.f0(s.sat.zero)}` : '—');
line('몸 채광 · 걸음 · 쉼 · 잠 %', (s) => s.st ? [s.st.mine, s.st.walk, s.st.rest, s.st.sleep].map(T.pc).join(' · ') : '—');
line('친 횟수(판)', (s) => T.f0(s.sw));
line('광부 econ(끝 날)', (s) => s.minersL == null ? '—' : s.minersL);
line('하루 CPU 날 50 · 52 · 53 · 60 · 80 · 100', (s) => [s.cpu.d50, s.cpu.d52, s.cpu.d53, s.cpu.d60, s.cpu.d80, s.cpu.d100].map(T.f1).join(' · '));
line('가장 큰 하루 CPU 뜀(날 21 뒤 · 앞날 대비)', (s) => s.jump ? `날 ${s.jump.d} ×${s.jump.r.toFixed(2)}(${T.f1(s.jump.from)} → ${T.f1(s.jump.to)})` : '—');
line('끝 날 · 인구(판 JSON)', (s) => `${s.last} · ${s.pop == null ? '—' : s.pop}`);
if (opt.vil) {   // 끝 날 광산 마을별 — 곳간 · 값표 목표 · 넘은 몫 · 인구 · 광부
  for (const [n, X] of arms) {
    const L = lastOf(X), D = X.s && X.s.ore && X.s.ore[L]; if (!D) continue;
    out.push('', `#### ${n} — 날 ${L} 광산 마을`, '', '| 마을 | 인구 | 광부 | 곳간 | 값표 목표 | 흐름 목표 | 넘은 몫 | 큰 품목(곳간 / 목표) |', '|---|---:|---:|---:|---:|---:|---:|---|');
    for (const [vn, V] of Object.entries(D)) { let st = 0, tg = 0, fl = 0, over = 0; const it = []; for (const [k, [s, t, f]] of Object.entries(V.o || {})) { st += s; tg += t || 0; fl += f || 0; over += Math.max(0, s - (t || 0)); it.push([k, s, t || 0]); }
      it.sort((a, b) => b[1] - a[1]); out.push(`| ${vn} | ${V.pop} | ${V.miner} | ${T.f1(st)} | ${T.f1(tg)} | ${T.f1(fl)} | ${T.f1(over)} | ${it.slice(0, 3).map(([k, s, t]) => `${k.replace(/^ore_/, '')} ${T.f1(s)}/${T.f1(t)}`).join(' · ')} |`); }
  }
}
const md = out.join('\n');
console.log(md);
if (opt.md) fs.writeFileSync(opt.md, md + '\n');
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(S, null, 1));
