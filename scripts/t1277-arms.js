'use strict';
// (@regress 없음 — 러너 밖 · T1277 표 자 · 읽기만)
// === scripts/t1277-arms.js — T1277 팔 여럿(끔 · T1266 · +고침 · 실험)의 판 요약 · 10날 표 — 칸 셈은 `t1266-table.js` 함수 그대로(사본 0) ==========
//   쓰는 법: node scripts/t1277-arms.js <이름=머리> [<이름=머리> …] [--md 표.md] [--json 요약.json]
//   하루 CPU 칸 = t1243 `cpu` 줄 [날 d] 그대로(머리 d−1 → d 의 CPU 초 · T1271 보고와 같은 줄 이름).
const fs = require('fs');
const T = require('./t1266-table.js');
const args = process.argv.slice(2), arms = [], opt = {};
for (let i = 0; i < args.length; i++) { if (args[i] === '--md' || args[i] === '--json') opt[args[i].slice(2)] = args[++i]; else { const [n, h] = args[i].split('='); arms.push([n, T.load(h), h]); } }
if (!arms.length) { console.error('쓰는 법: node scripts/t1277-arms.js <이름=머리> … [--md 표.md] [--json 요약.json]'); process.exit(2); }
const sum = (a) => a.reduce((s, x) => s + (+x || 0), 0);
const DAYS = [10, 20, 30, 40, 50, 60];
const out = [];
const cpuAt = (X, d) => { const r = X.c && X.c.cpu ? X.c.cpu.find((q) => q[0] === d) : null; return r ? r[1] : null; };
const tot = (X, d, i) => { const B = (X.b.g[d] || {}).tot; return B ? sum(Object.values(B).map((t) => t[i])) : null; };
out.push('| 칸(' + arms.map((a) => a[0]).join(' : ') + ') | ' + DAYS.map((d) => '날 ' + d).join(' | ') + ' |');
out.push('|---|' + DAYS.map(() => '---:').join('|') + '|');
const row = (name, fn) => out.push('| ' + name + ' | ' + DAYS.map((d) => arms.map(([, X]) => { const c = T.cells(X, d); return c ? fn(c, X, d) : '—'; }).join(' : ')).join(' | ') + ' |');
row('광부 econ(광산 마을 11)', (c) => c.miners);
row('광부 몸 채광 · 쉼 %(10날 표본)', (c) => c.st ? T.pc(c.st.mine) + ' · ' + T.pc(c.st.rest) : '—');
row('몸 원석 곳간 kg/날(10날)', (c) => T.f1(c.kgDay));
row('원석 재고(단위)', (c) => T.f1(c.oreStock));
row('노 녹임 누계(원석 단위)', (c) => T.f1(c.smelt));
row('청동 무기 누계', (c) => T.f2(c.bronze));
row('광산 마을 인구', (c) => T.f0(c.popM));
row('한 시간 값 물음 · 멈춤(10날)', (c) => c.hours == null ? '—' : T.f0(c.hours) + ' · ' + T.f0(c.stop));
row('보존 참', (c) => c.noSwingIn);
row('하루 CPU 초(10날 가운데)', (c) => T.f1(c.cpu));
const S = {};
out.push('', '| 칸 | ' + arms.map((a) => a[0]).join(' | ') + ' |', '|---|' + arms.map(() => '---:').join('|') + '|');
for (const [n, X] of arms) { const s = T.summary(X); S[n] = { ...s, j: undefined, pop: X.j && X.j.eight ? X.j.eight.pop : null, cpu: { d50: cpuAt(X, 50), d53: cpuAt(X, 53), d60: cpuAt(X, 60) }, minersL: tot(X, s.last, 4) }; }
const line = (name, fn) => out.push('| ' + name + ' | ' + arms.map(([n]) => fn(S[n])).join(' | ') + ' |');
line('몸 원석 kg/날(날 2 ~ 끝)', (s) => T.f1(s.kgDay));
line('원석 재고 · 녹임 · 청동(끝 날)', (s) => `${T.f1(s.oreStock)} · ${T.f1(s.smelt)} · ${T.f2(s.bronze)}`);
line('한 시간 물음 · 멈춤', (s) => s.t66 ? `${T.f0(s.t66.hours)} · ${T.f0(s.t66.stop)}` : '—');
line('몸 채광 · 걸음 · 쉼 · 잠 %', (s) => s.st ? [s.st.mine, s.st.walk, s.st.rest, s.st.sleep].map(T.pc).join(' · ') : '—');
line('친 횟수(판)', (s) => T.f0(s.sw));
line('광부 econ(끝 날)', (s) => s.minersL == null ? '—' : s.minersL);
line('하루 CPU 날 50 · 53 · 60', (s) => `${T.f1(s.cpu.d50)} · ${T.f1(s.cpu.d53)} · ${T.f1(s.cpu.d60)}`);
line('끝 날 · 인구(판 JSON)', (s) => `${s.last} · ${s.pop == null ? '—' : s.pop}`);
const md = out.join('\n');
console.log(md);
if (opt.md) fs.writeFileSync(opt.md, md + '\n');
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(S, null, 1));
