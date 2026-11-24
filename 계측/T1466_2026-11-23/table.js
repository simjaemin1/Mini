'use strict';
// sum.json → 보고 표(마크다운) — node 계측/T1466_2026-11-23/table.js sum.json
const S = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const w = (c) => c == null ? '—' : (Math.ceil(Math.max(c, 0.01) / 16) * 33.3 / 1000).toFixed(2) + ' s';
const ms = (x) => x == null ? '—' : (x >= 1000 ? (x / 1000).toFixed(2) + ' s' : (+x).toFixed(1) + ' ms');
const L = [];
L.push('### 무거운 판정(T1440 CPU ≥ 1 s) — 팔마다 CPU(벽시계 = 16 ms 몫 틱 × 33.3 ms) · 답 같음');
L.push('| 판 | 자리 | 급 | T1440 판정 · CPU | ㉮ a | ㉱ ad | ㉰ adc | ㉯ b | 같음(ad) | 쌍 길이 같음(ad) |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const [tag, o] of Object.entries(S.off)) for (const h of o.heavy) {
  const c = (a) => h.sh[a] ? `${ms(h.sh[a].cpu)} (${w(h.sh[a].cpu)}) ${h.sh[a].v === h.v ? '' : '· ' + h.sh[a].v}` : '—';
  const d = h.sh.ad; L.push(`| ${tag} | (${h.at.join(',')}) | ${h.cls} | ${h.v} · ${ms(h.cpu)} | ${c('a')} | ${c('ad')} | ${c('adc')} | ${c('b')} | ${d ? (d.same ? '○' : '✗') : '—'} | ${d ? `${d.len}/${d.pairs}` : '—'} |`);
}
L.push('');
L.push('### 봇 판 전수(끔 판 그림자) — 판정 CPU 분포 · 답 같음');
L.push('| 판 | 팔 | 판정 | 같음 | 판정 같음 | 내줌 같음 | 지나는 칸 같음 | 쌍 · 길이 같음 · 칸 같음 | T1440 p50 · p99 · 가장 큼 | 팔 p50 · p99 · 가장 큼 |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const [tag, o] of Object.entries(S.off)) for (const [a, z] of Object.entries(o.arms)) L.push(`| ${tag} | ${a} | ${z.n} | ${z.same} | ${z.v} | ${z.pb} | ${z.pass} | ${z.pairs} · ${z.pairsLen} · ${z.pairsCells} | ${z.qa ? [z.qa.p50, z.qa.p99, z.qa.max].map(ms).join(' · ') : '—'} | ${z.qb ? [z.qb.p50, z.qb.p99, z.qb.max].map(ms).join(' · ') : '—'} |`);
L.push('');
L.push('### 길 칸 전수(바쁜 100 + 고른 300 · 한 칸 선포)');
L.push('| 판 | 칸 | T1440 p50 · p90 · p99 · 가장 큼 | 팔 | 같음 | 판정 같음 | 쌍 · 길이 · 칸 | 팔 p50 · p90 · p99 · 가장 큼 | 팔 벽시계 가장 큼 |');
L.push('|---|---|---|---|---|---|---|---|---|');
for (const [tag, o] of Object.entries(S.lab)) for (const [a, z] of Object.entries(o.arms)) L.push(`| ${tag} | ${o.busy}+${o.rand} (다리 ${o.bridge} · 가장 붐빔 ${o.maxPairs}쌍) | ${[o.t1440.p50, o.t1440.p90, o.t1440.p99, o.t1440.max].map(ms).join(' · ')} | ${a} | ${z.same}/${z.n} | ${z.v} | ${z.pairs} · ${z.pairsLen} · ${z.pairsCells} | ${[z.cpu.p50, z.cpu.p90, z.cpu.p99, z.cpu.max].map(ms).join(' · ')} | ${w(z.cpu.max)} |`);
L.push('');
L.push('### 켬 판(고른 팔 ad) — 실제 판정 · 틱 · 메모리');
L.push('| 판 | 작은 판정 n · p50 · p99 · 가장 큼 | 큰 판정(≥150 ms) | 가장 큰 판정 CPU · 벽시계 | NPC 터 n · p99 · 가장 큼 | 틱 p50 · p99 · 가장 큼 | 길잡이 굽기 · 데우기 · MB | maxRSS |');
L.push('|---|---|---|---|---|---|---|---|');
for (const [tag, o] of Object.entries(S.on)) { const mx = o.jobs.length ? o.jobs.reduce((m, j) => (j.cpu > m.cpu ? j : m)) : null; L.push(`| ${tag} | ${o.small.n} · ${ms(o.small.p50)} · ${ms(o.small.p99)} · ${ms(o.small.max)} | ${o.big} | ${mx ? `${ms(mx.cpu)} · ${w(mx.cpu)} (${mx.at.join(',')})` : '—'} | ${o.npc ? `${o.npc.n} · ${ms(o.npc.p99)} · ${ms(o.npc.max)}` : '—'} | ${o.tick ? [o.tick.p50, o.tick.p99, o.tick.max].map(ms).join(' · ') : '—'} | ${o.L ? `${ms(o.L.land)} · ${ms(o.L.warm)} · ${o.L.mb}` : '—'} | ${o.mem ? o.mem.maxRssMB + ' MB' : '—'} |`); }
L.push('');
for (const [tag, o] of Object.entries(S.on)) { L.push(`${tag} 큰 판정: ` + o.jobs.map((j) => `(${j.at.join(',')}) ${j.v} ${ms(j.cpu)}`).join(' · ')); }
console.log(L.join('\n'));
