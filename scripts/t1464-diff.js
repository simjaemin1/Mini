#!/usr/bin/env node
// T1464 — 전투 코어 표 둘 견줌(같은 칸 · 같은 씨). S6 등 다른 가지의 코어를 같은 자로 돌린 폴더와 이 바탕(계측/T1464/main)을 나란히.
//   node scripts/t1464-battle-sweep.js --core <다른 가지>/sim/battle-core.js [--env K=V] --out <폴더 B>
//   node scripts/t1464-diff.js --a 계측/T1464/main --b <폴더 B> [--min 10]
//   · 칸 열쇠(key)가 같은 줄끼리 — 판 줄 요약(digest)이 같으면 "같음". 다르면 A 이긴 % · 진 편 죽음 % · 이긴 편 죽음 % · 붙기 전 달아남 % 의 차.
//   · ★상성 뒤집힘: 이긴 편이 바뀐 칸(한쪽 ≥ 50 + min/2 · 다른 쪽 ≤ 50 − min/2) — 수 20 맞대결(g1)의 8 × 8 은 따로 센다.
'use strict';
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const A = path.resolve(arg('--a', path.join(__dirname, '..', '계측', 'T1464', 'main'))), B = arg('--b') ? path.resolve(arg('--b')) : null;
const MIN = +arg('--min', '10');
if (!B) { console.error('쓰는 법: --a <바탕 폴더> --b <견줄 폴더> [--min 10]'); process.exitCode = 2; return; }
function load(dir) {
  const m = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => /^g\d+\.csv$/.test(f))) {
    const L = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean); const H = L[0].split(',');
    for (const l of L.slice(1)) { const v = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')); const o = {}; H.forEach((k, i) => { o[k] = v[i]; }); m.set(o.key, o); }
  }
  return m;
}
const a = load(A), b = load(B);
const num = (x) => (x === '' || x == null ? null : +x);
const keys = [...a.keys()].filter((k) => b.has(k));
const COLS = [['winA', 'A 이긴 %'], ['loserDead', '진 편 죽음 %'], ['winnerDead', '이긴 편 죽음 %'], ['preContactRout', '붙기 전 달아남 %'], ['open', '안 끝남 %']];
let same = 0; const ch = [], flip = [];
for (const k of keys) {
  const x = a.get(k), y = b.get(k);
  if (x.digest === y.digest) { same++; continue; }
  const d = {}; for (const [c] of COLS) { const p = num(x[c]), q = num(y[c]); d[c] = p == null || q == null ? null : q - p; }
  ch.push({ k, x, y, d });
  const wa = num(x.winA), wb = num(y.winA);
  if (wa != null && wb != null && ((wa >= 50 + MIN / 2 && wb <= 50 - MIN / 2) || (wa <= 50 - MIN / 2 && wb >= 50 + MIN / 2))) flip.push({ k, x, y });
}
const flip20 = flip.filter((f) => f.x.g === 'g1' && /^[a-z]+20$/.test(f.x.A) && /^[a-z]+20$/.test(f.x.B));
const L = [];
L.push(`# T1464 견줌 — 바탕 \`${path.relative(process.cwd(), A)}\` ↔ \`${path.relative(process.cwd(), B)}\``, '');
for (const [n, d] of [['바탕', A], ['견줌', B]]) { const mf = path.join(d, 'meta.txt'); if (fs.existsSync(mf)) L.push(`· ${n}: ` + fs.readFileSync(mf, 'utf8').trim().split('\n').filter((l) => /^(core|env)=/.test(l)).join(' · ')); }
L.push(`· 같은 열쇠 칸 ${keys.length}(바탕만 ${a.size - keys.length} · 견줌만 ${b.size - keys.length}) · **판 줄까지 같음 ${same}** · 다름 ${ch.length}`);
L.push(`· 이긴 편이 뒤집힌 칸(±${MIN / 2} %p 넘어 50 을 건넘) **${flip.length}** — 그 가운데 수 20 상성 8 × 8 칸 ${flip20.length}`, '');
for (const [c, n] of COLS) { const v = ch.map((r) => r.d[c]).filter((x) => x != null); if (!v.length) continue; const ab = v.map(Math.abs).sort((p, q) => p - q);
  L.push(`* ${n}: 다른 칸 ${v.length} · 차 가운데 ${ab[Math.floor(ab.length / 2)].toFixed(1)} %p · 가장 큰 ${ab[ab.length - 1].toFixed(1)} %p · ${MIN} %p 넘는 칸 ${ab.filter((x) => x > MIN).length}`); }
if (flip.length) { L.push('', '## 이긴 편이 뒤집힌 칸', '', '| 칸 | 바탕 A 이긴 % | 견줌 A 이긴 % | 바탕 진 편 죽음 % | 견줌 진 편 죽음 % |', '|---|---:|---:|---:|---:|');
  for (const f of flip) L.push(`| \`${f.k}\` | ${f.x.winA} | ${f.y.winA} | ${f.x.loserDead} | ${f.y.loserDead} |`); }
const top = ch.filter((r) => r.d.winA != null).sort((p, q) => Math.abs(q.d.winA) - Math.abs(p.d.winA)).slice(0, 30);
if (top.length) { L.push('', '## A 이긴 % 차가 큰 서른 칸', '', '| 칸 | 바탕 | 견줌 | 차 | 진 편 죽음 바탕 → 견줌 | 붙기 전 달아남 바탕 → 견줌 |', '|---|---:|---:|---:|---|---|');
  for (const r of top) L.push(`| \`${r.k}\` | ${r.x.winA} | ${r.y.winA} | ${r.d.winA.toFixed(1)} | ${r.x.loserDead} → ${r.y.loserDead} | ${r.x.preContactRout} → ${r.y.preContactRout} |`); }
process.stdout.write(L.join('\n') + '\n');
if (argv.includes('--json')) process.stdout.write(JSON.stringify({ keys: keys.length, same, diff: ch.length, flip: flip.length, flip20: flip20.length }) + '\n');
