#!/usr/bin/env node
// === scripts/t453-heap-owners.js — 힙 스냅샷을 **주인별 보유 크기**로 연다 (T453 ①) ===================================
//
// ★계측기다 — 러너 밖. 입력은 `t453-rss-probe.js` 가 쓴 `.heapsnapshot`(V8 표준 꼴 · `v8.writeHeapSnapshot`).
//   주인 = 스냅샷 순간 `globalThis.__t453o` 에 달아 둔 손잡이들(존 모듈의 그 객체 그대로 · 사본 0).
//   보유 크기(retained) = **지배자 나무**(dominator tree)의 부분나무 합 — DevTools 의 "Retained Size" 와 같은 정의
//   (약한 가장자리 `weak` 는 안 따라간다). 주인 둘이 함께 붙든 것은 둘 다의 보유에 안 들고 공통 조상에 든다 — 그래서
//   "주인 합 < 힙" 이 정상이고 나머지는 **나머지** 칸이다. 곁들여 생성자별 자기 크기(self) 상위도 낸다.
//
// ★파서: 스냅샷은 수백 MB 라 `JSON.parse` 한 번에 안 들어간다(V8 문자열 상한) → nodes·edges 는 **바이트를 훑어** 숫자로,
//   strings 만 JSON.parse 한다.
//
// 실행: node --max-old-space-size=6000 scripts/t453-heap-owners.js <file.heapsnapshot> [--json out.json]
'use strict';
const fs = require('fs');
const FILE = process.argv[2];
const JOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const buf = fs.readFileSync(FILE);
const find = (s, from) => buf.indexOf(Buffer.from(s), from || 0);
// ── meta ──
const iNodes = find('"nodes":[');
const meta = JSON.parse(buf.slice(buf.indexOf(0x7b) , iNodes).toString('utf8').replace(/,\s*$/, '') + '}').snapshot.meta;
const NF = meta.node_fields.length, EF = meta.edge_fields.length;
const nTypes = meta.node_types[0], eTypes = meta.edge_types[0];
const fNType = meta.node_fields.indexOf('type'), fNName = meta.node_fields.indexOf('name'), fNSelf = meta.node_fields.indexOf('self_size'), fNEc = meta.node_fields.indexOf('edge_count');
const fEType = meta.edge_fields.indexOf('type'), fEName = meta.edge_fields.indexOf('name_or_index'), fETo = meta.edge_fields.indexOf('to_node');
function parseNums(start) {   // "[" 뒤부터 "]" 까지 음이 아닌 정수 — Float64Array 로(self_size 가 2^32 를 넘을 일은 없지만 안전하게)
  let cap = 1 << 22, a = new Float64Array(cap), n = 0, v = 0, inNum = false, i = start;
  for (; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 48 && c <= 57) { v = v * 10 + (c - 48); inNum = true; }
    else { if (inNum) { if (n === cap) { const b = new Float64Array(cap *= 2); b.set(a); a = b; } a[n++] = v; v = 0; inNum = false; } if (c === 93) break; }
  }
  return { a: a.subarray(0, n), end: i };
}
const N = parseNums(iNodes + 9); const nodes = N.a;
const iEdges = find('"edges":[', N.end);
const E = parseNums(iEdges + 9); const edges = E.a;
const iStr = find('"strings":[', E.end);
const lastBr = buf.lastIndexOf(0x5d);
const strings = JSON.parse(buf.slice(iStr + 10, lastBr + 1).toString('utf8'));
const nodeCount = nodes.length / NF;
console.log(`노드 ${nodeCount.toLocaleString()} · 가장자리 ${(edges.length / EF).toLocaleString()} · 문자열 ${strings.length.toLocaleString()}`);
// ── CSR ──
const firstEdge = new Uint32Array(nodeCount + 1);
for (let i = 0, e = 0; i < nodeCount; i++) { firstEdge[i] = e; e += nodes[i * NF + fNEc] * EF; firstEdge[i + 1] = e; }
const WEAK = eTypes.indexOf('weak');
const toIdx = (e) => edges[e + fETo] / NF;
// ── 후위 순서(뿌리 0 · 약한 가장자리 제외 · 반복 DFS) ──
const post = new Uint32Array(nodeCount), order = new Int32Array(nodeCount).fill(-1);
let pn = 0;
{
  const stN = new Uint32Array(nodeCount), stE = new Float64Array(nodeCount); let sp = 0;
  const seen = new Uint8Array(nodeCount); seen[0] = 1; stN[0] = 0; stE[0] = firstEdge[0]; sp = 1;
  while (sp) {
    const v = stN[sp - 1], e = stE[sp - 1];
    if (e < firstEdge[v + 1]) {
      stE[sp - 1] = e + EF;
      if (edges[e + fEType] === WEAK) continue;
      const w = toIdx(e);
      if (!seen[w]) { seen[w] = 1; stN[sp] = w; stE[sp] = firstEdge[w]; sp++; }
    } else { order[v] = pn; post[pn++] = v; sp--; }
  }
}
console.log(`뿌리에서 닿는 노드 ${pn.toLocaleString()}`);
// ── 앞선이(predecessor) CSR ──
const predCnt = new Uint32Array(nodeCount + 1);
for (let v = 0; v < nodeCount; v++) { if (order[v] < 0) continue; for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EF) { if (edges[e + fEType] === WEAK) continue; const w = toIdx(e); if (order[w] >= 0) predCnt[w + 1]++; } }
for (let i = 0; i < nodeCount; i++) predCnt[i + 1] += predCnt[i];
const preds = new Uint32Array(predCnt[nodeCount]); const fill = predCnt.slice(0, nodeCount);
for (let v = 0; v < nodeCount; v++) { if (order[v] < 0) continue; for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EF) { if (edges[e + fEType] === WEAK) continue; const w = toIdx(e); if (order[w] >= 0) preds[fill[w]++] = v; } }
// ── 지배자(Cooper–Harvey–Kennedy) — 후위 번호로 ──
const idom = new Int32Array(pn).fill(-1);   // 후위 번호 → 후위 번호
const rootPo = order[0]; idom[rootPo] = rootPo;
let changed = true, pass = 0;
while (changed) {
  changed = false; pass++;
  for (let k = pn - 2; k >= 0; k--) {   // 역후위(뿌리 빼고)
    const v = post[k]; let nd = -1;
    for (let j = predCnt[v]; j < predCnt[v + 1]; j++) {
      let p = order[preds[j]]; if (idom[p] < 0) continue;
      if (nd < 0) { nd = p; continue; }
      let a = p, b = nd; while (a !== b) { while (a < b) a = idom[a]; while (b < a) b = idom[b]; } nd = a;
    }
    if (nd >= 0 && idom[k] !== nd) { idom[k] = nd; changed = true; }
  }
}
console.log(`지배자 ${pass}판`);
const retained = new Float64Array(pn);
for (let k = 0; k < pn; k++) retained[k] += nodes[post[k] * NF + fNSelf];
for (let k = 0; k < pn - 1; k++) { const d = idom[k]; if (d >= 0 && d !== k) retained[d] += retained[k]; }
const heapTotal = retained[rootPo];
// ── 주인 손잡이 ──
const PROP = eTypes.indexOf('property');
const sIdx = strings.indexOf('__t453o');
let ownersNode = -1;
if (sIdx >= 0) for (let v = 0; v < nodeCount && ownersNode < 0; v++) for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EF) if (edges[e + fEType] === PROP && edges[e + fEName] === sIdx) { ownersNode = toIdx(e); break; }
const rows = [];
if (ownersNode >= 0) {
  for (let e = firstEdge[ownersNode]; e < firstEdge[ownersNode + 1]; e += EF) {
    if (edges[e + fEType] !== PROP) continue;
    const name = strings[edges[e + fEName]], w = toIdx(e), po = order[w];
    rows.push({ owner: name, retainedMB: po >= 0 ? +(retained[po] / 1048576).toFixed(2) : 0, selfType: nTypes[nodes[w * NF + fNType]], ctor: strings[nodes[w * NF + fNName]] });
  }
}
rows.sort((a, b) => b.retainedMB - a.retainedMB);
// ── 생성자별 자기 크기 ──
const byCtor = new Map();
for (let k = 0; k < pn; k++) { const v = post[k]; const t = nTypes[nodes[v * NF + fNType]]; const nm = t === 'object' || t === 'closure' || t === 'native' ? strings[nodes[v * NF + fNName]] : '(' + t + ')'; const s = nodes[v * NF + fNSelf]; const o = byCtor.get(nm) || { n: 0, self: 0 }; o.n++; o.self += s; byCtor.set(nm, o); }
const ctors = [...byCtor.entries()].sort((a, b) => b[1].self - a[1].self).slice(0, 25).map(([k, o]) => ({ ctor: String(k).slice(0, 60), n: o.n, selfMB: +(o.self / 1048576).toFixed(2) }));
console.log(`\n힙(뿌리 보유) ${(heapTotal / 1048576).toFixed(1)}MB`);
console.log('| 주인 | 보유 MB | 꼴 |'); console.log('|---|---:|---|');
for (const r of rows) console.log(`| ${r.owner} | ${r.retainedMB} | ${r.ctor} |`);
console.log('\n| 생성자(자기 크기) | 개수 | MB |'); console.log('|---|---:|---:|');
for (const c of ctors) console.log(`| ${c.ctor} | ${c.n.toLocaleString()} | ${c.selfMB} |`);
// ── 지배자 나무 윗가지(--tree [MB]) — 주인 손잡이가 **여럿이 함께 붙든** 덩어리를 못 잡을 때(보유 0) 어디에 붙었나를 이름 길로 본다 ──
const TI = process.argv.indexOf('--tree');
const tree = [];
if (TI >= 0) {
  const minB = (+process.argv[TI + 1] || 1) * 1048576;
  const kids = new Map();
  for (let k = 0; k < pn; k++) { const d = idom[k]; if (d >= 0 && d !== k && retained[k] >= minB) { if (!kids.has(d)) kids.set(d, []); kids.get(d).push(k); } }
  const label = (k) => {   // 이 노드로 오는 가장자리 이름(지배자에게서 오면 그것 · 아니면 아무 앞선이) + 노드 꼴·이름
    const v = post[k], dv = post[idom[k]];
    let en = '?';
    for (let e = firstEdge[dv]; e < firstEdge[dv + 1]; e += EF) if (toIdx(e) === v) { const t = eTypes[edges[e + fEType]]; en = (t === 'element' || t === 'hidden') ? `[${edges[e + fEName]}]` : String(strings[edges[e + fEName]]); break; }
    if (en === '?') { const j = predCnt[v]; if (j < predCnt[v + 1]) { const p = preds[j]; for (let e = firstEdge[p]; e < firstEdge[p + 1]; e += EF) if (toIdx(e) === v) { const t = eTypes[edges[e + fEType]]; en = '~' + ((t === 'element' || t === 'hidden') ? `[${edges[e + fEName]}]` : String(strings[edges[e + fEName]])) + '@' + String(strings[nodes[p * NF + fNName]]).slice(0, 30); break; } } }
    return `${String(en).slice(0, 50)} → ${nTypes[nodes[v * NF + fNType]]}:${String(strings[nodes[v * NF + fNName]]).slice(0, 40)}`;
  };
  const walk = (k, depth) => {
    const ch = (kids.get(k) || []).sort((a, b) => retained[b] - retained[a]);
    for (const c of ch) { tree.push({ depth, mb: +(retained[c] / 1048576).toFixed(2), label: label(c) }); if (depth < 12) walk(c, depth + 1); }
  };
  walk(rootPo, 0);
  console.log(`\n지배자 나무(보유 ≥ ${minB / 1048576}MB)`);
  for (const t of tree) console.log(`${'  '.repeat(t.depth)}${t.mb}MB  ${t.label}`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ file: FILE, nodes: nodeCount, reach: pn, heapMB: +(heapTotal / 1048576).toFixed(2), owners: rows, ctors, tree }, null, 1));
