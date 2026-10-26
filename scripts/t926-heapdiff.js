#!/usr/bin/env node
// === scripts/t926-heapdiff.js — 힙 스냅샷 둘 견주기(T926) — 계측 자 · 러너 밖 ==========================================
//   크롬 힙 스냅샷(`scripts/t926-mem-hour.js` 가 찍은 `.heapsnapshot`) 두 장 A(앞) · B(뒤)를 읽어
//     ① 갈래(생성자 이름 · 노드 종류)마다 수 · 자기 크기 — A → B 늘어난 차례
//     ② 늘어난 갈래마다 B 에서 붙든 쪽 — 뿌리(GC roots)에서 그 노드까지 가장 짧은 길(약한 칸 제외)의 끝 마디 이름들을 모아 센다
//     ③ B 의 Map · Set 가운데 뒷받침 표(table)가 큰 것 — 붙든 이름(전역 변수 · 칸)까지
//   를 적는다. 판정 0 — 세기만 한다.
// 실행: node --max-old-space-size=6000 scripts/t926-heapdiff.js <A.heapsnapshot> <B.heapsnapshot> [--top 25] [--json out.json]
'use strict';
const fs = require('fs');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const TOP = +opt('--top', '25');
const JOUT = opt('--json', null);
const [FA, FB] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

function load(f) {
  const S = JSON.parse(fs.readFileSync(f, 'utf8'));
  const m = S.snapshot.meta, NF = m.node_fields.length, EF = m.edge_fields.length;
  const nT = m.node_fields.indexOf('type'), nN = m.node_fields.indexOf('name'), nS = m.node_fields.indexOf('self_size'), nE = m.node_fields.indexOf('edge_count'), nI = m.node_fields.indexOf('id');
  const eT = m.edge_fields.indexOf('type'), eN = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node');
  const NT = m.node_types[0], ET = m.edge_types[0];
  const nodes = S.nodes, edges = S.edges, str = S.strings;
  const N = nodes.length / NF;
  const first = new Uint32Array(N + 1);
  for (let i = 0, e = 0; i < N; i++) { first[i] = e; e += nodes[i * NF + nE]; first[i + 1] = e; }
  const typeOf = (i) => NT[nodes[i * NF + nT]];
  const nameOf = (i) => str[nodes[i * NF + nN]];
  const selfOf = (i) => nodes[i * NF + nS];
  const idOf = (i) => nodes[i * NF + nI];
  const cls = (i) => {
    const t = typeOf(i), n = nameOf(i);
    if (t === 'object' || t === 'native') return n.replace(/ \/ .*$/, '').slice(0, 60);
    if (t === 'closure') return 'closure ' + (n || '(anon)').slice(0, 50);
    if (t === 'string' || t === 'concatenated string' || t === 'sliced string') return '(string)';
    if (t === 'array') return '(array ' + (n || '').slice(0, 40) + ')';
    if (t === 'hidden') return '(hidden ' + (n || '').replace(/ \/ .*$/, '').slice(0, 40) + ')';
    return '(' + t + ')';
  };
  const edgeName = (e) => { const t = ET[edges[e * EF + eT]], v = edges[e * EF + eN]; return t === 'element' || t === 'hidden' ? `[${v}]` : String(str[v]); };
  const edgeType = (e) => ET[edges[e * EF + eT]];
  const edgeTo = (e) => edges[e * EF + eTo] / NF;
  return { N, first, typeOf, nameOf, selfOf, idOf, cls, edgeName, edgeType, edgeTo, size: fs.statSync(f).size };
}
function agg(H) {
  const m = new Map();
  for (let i = 0; i < H.N; i++) { const k = H.cls(i); const a = m.get(k) || [0, 0]; a[0]++; a[1] += H.selfOf(i); m.set(k, a); }
  return m;
}
// 뿌리에서 가장 짧은 길(약한 칸 · shortcut 제외) — parentEdge[i] = 들어온 칸 번호(없으면 -1)
function bfs(H) {
  const pe = new Int32Array(H.N).fill(-1), seen = new Uint8Array(H.N), q = new Uint32Array(H.N);
  let qh = 0, qt = 0; q[qt++] = 0; seen[0] = 1;
  while (qh < qt) {
    const i = q[qh++];
    for (let e = H.first[i]; e < H.first[i + 1]; e++) {
      const t = H.edgeType(e); if (t === 'weak' || t === 'shortcut') continue;
      const j = H.edgeTo(e); if (seen[j]) continue; seen[j] = 1; pe[j] = e; q[qt++] = j;
    }
  }
  // 칸 번호 → 그 칸이 나온 노드(뒤로 걷기용)
  const from = new Uint32Array(H.first[H.N]);
  for (let i = 0; i < H.N; i++) for (let e = H.first[i]; e < H.first[i + 1]; e++) from[e] = i;
  return { pe, from, reach: qt };
}
function pathOf(H, B, i, maxHops = 40) {
  const hops = [];
  let cur = i;
  for (let k = 0; k < maxHops && B.pe[cur] >= 0; k++) { const e = B.pe[cur]; const p = B.from[e]; hops.push({ edge: H.edgeName(e), et: H.edgeType(e), node: H.cls(p) }); cur = p; }
  return hops;   // 노드 쪽에서 뿌리 쪽으로
}
// 붙든 쪽 이름 — 뿌리 쪽으로 걸으며 처음 만나는 '이름 있는 칸'(전역 변수 = context 칸 · Window 칸 · 객체 속성)들을 끝에서 넷까지
function holderSig(hops) {
  const named = [];
  for (const h of hops) {
    if (h.et === 'context' || h.et === 'property') named.push(`${h.node}.${h.edge}`);
    else if (h.et === 'internal' && /^(table|elements|properties)$/.test(h.edge)) continue;
    if (named.length >= 4) break;
  }
  return named.join(' ← ') || hops.slice(0, 4).map((h) => `${h.node}.${h.edge}`).join(' ← ');
}

const t0 = Date.now();
const A = load(FA); const aA = agg(A);
console.log(`A ${FA} — 노드 ${A.N} · ${(A.size / 1048576).toFixed(1)}MB`);
const B = load(FB); const aB = agg(B);
console.log(`B ${FB} — 노드 ${B.N} · ${(B.size / 1048576).toFixed(1)}MB`);
let totA = 0, totB = 0; for (const v of aA.values()) totA += v[1]; for (const v of aB.values()) totB += v[1];
console.log(`자기 크기 합 A ${(totA / 1048576).toFixed(1)}MB → B ${(totB / 1048576).toFixed(1)}MB (+${((totB - totA) / 1048576).toFixed(1)})`);
const keys = new Set([...aA.keys(), ...aB.keys()]);
const diff = [...keys].map((k) => { const a = aA.get(k) || [0, 0], b = aB.get(k) || [0, 0]; return { k, nA: a[0], nB: b[0], sA: a[1], sB: b[1], dn: b[0] - a[0], ds: b[1] - a[1] }; });
diff.sort((x, y) => y.ds - x.ds);
console.log(`\n① 갈래 — 자기 크기가 가장 많이 는 ${TOP}`);
console.log('| 갈래 | 수 A → B | 자기 크기 A → B(MB) | 늘어난 MB |');
console.log('|---|---|---|---|');
for (const d of diff.slice(0, TOP)) console.log(`| ${d.k} | ${d.nA} → ${d.nB} | ${(d.sA / 1048576).toFixed(2)} → ${(d.sB / 1048576).toFixed(2)} | ${(d.ds / 1048576).toFixed(2)} |`);
const Bb = bfs(B);
console.log(`\n② 늘어난 갈래마다 B 에서 붙든 쪽(뿌리에서 가장 짧은 길 · 끝에서 이름 있는 칸 넷 · 표본 노드 200 까지) — 뿌리에서 닿는 노드 ${Bb.reach}/${B.N}`);
const out = { A: FA, B: FB, nA: A.N, nB: B.N, totA, totB, diff: diff.slice(0, TOP), holders: {}, maps: [] };
const byCls = new Map(); for (let i = 0; i < B.N; i++) { const k = B.cls(i); if (!byCls.has(k)) byCls.set(k, []); byCls.get(k).push(i); }
for (const d of diff.slice(0, Math.min(12, TOP))) {
  if (d.ds <= 0) continue;
  const L = byCls.get(d.k) || []; const step = Math.max(1, Math.floor(L.length / 200));
  const sig = new Map();
  for (let j = 0; j < L.length; j += step) { const i = L[j]; const s = holderSig(pathOf(B, Bb, i)); const a = sig.get(s) || [0, 0]; a[0]++; a[1] += B.selfOf(i); sig.set(s, a); }
  const top = [...sig.entries()].sort((x, y) => y[1][1] - x[1][1]).slice(0, 4);
  out.holders[d.k] = top.map(([s, v]) => ({ sig: s, n: v[0], self: v[1] }));
  console.log(`  · ${d.k}(+${(d.ds / 1048576).toFixed(2)}MB · 표본 ${Math.ceil(L.length / step)}): ` + top.map(([s, v]) => `${s} ×${v[0]}`).join('  |  '));
}
console.log(`\n③ B 의 Map · Set — 뒷받침 표(table) 크기 차례 ${TOP} · 붙든 이름`);
const maps = [];
for (let i = 0; i < B.N; i++) {
  const c = B.cls(i); if (c !== 'Map' && c !== 'Set') continue;
  let tb = 0; for (let e = B.first[i]; e < B.first[i + 1]; e++) if (B.edgeName(e) === 'table') tb += B.selfOf(B.edgeTo(e));
  maps.push([i, tb]);
}
maps.sort((x, y) => y[1] - x[1]);
for (const [i, tb] of maps.slice(0, TOP)) {
  const s = holderSig(pathOf(B, Bb, i));
  out.maps.push({ cls: B.cls(i), table: tb, id: B.idOf(i), holder: s });
  console.log(`  · ${B.cls(i)} 표 ${(tb / 1048576).toFixed(2)}MB — ${s}`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}초)`);
