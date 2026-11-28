#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1500 힙 스냅숏 읽개 · 제품 무변)
// === 계측/T1500_2026-11-27/t1500-snap.js — .heapsnapshot 을 흘려 읽어(1 GB 넘는 파일도 · JSON.parse 0) 지배 나무로 붙든 크기를 낸다 ===
//   node --max-old-space-size=8192 t1500-snap.js <스냅숏> [--out <요약.json>] [--min <MB>]
//   ⇒ 요약 JSON: { total · nodes · byCtor[이름 → {n, self}] · paths[길 → 붙든 바이트] · tree(지배 나무 · 붙든 ≥ min MB 가지) }
//   길 = 뿌리에서 그 노드까지 지배 사슬의 변 이름(`.이름` · 맥락 변수 `$이름` · 원소 `[]`) — 같은 프로세스의 여러 스냅숏 · 다른 프로세스 스냅숏을 길로 견준다.
//   지배 나무: 약한 변(weak)을 뺀 그래프 · Cooper-Harvey-Kennedy 되풀이(DevTools 와 같은 꼴).
const fs = require('fs');
const a = process.argv.slice(2);
const FILE = a[0];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const OUT = opt('out', FILE.replace(/\.heapsnapshot(\.gz)?$/, '') + '.sum.json');
const MIN = parseFloat(opt('min', '2')) * 1048576;
const t0 = Date.now();
const log = (s) => process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}\n`);

// ── 흘려 읽기 ───────────────────────────────────────────────────────────────────────
const fd = fs.openSync(FILE, 'r');
const CH = 64 << 20;
let buf = Buffer.alloc(0), pos = 0, eof = false;
function more() { const b = Buffer.alloc(CH); const n = fs.readSync(fd, b, 0, CH, null); if (n <= 0) { eof = true; return false; } buf = Buffer.concat([buf.subarray(pos), b.subarray(0, n)]); pos = 0; return true; }
function seek(tok) {   // tok 뒤로 pos 를 옮기고 앞 글자를 돌려준다
  const T = Buffer.from(tok); let pre = '';
  for (;;) { const i = buf.indexOf(T, pos); if (i >= 0) { pre += buf.toString('utf8', pos, i); pos = i + T.length; return pre; }
    const keep = Math.max(pos, buf.length - T.length); pre += buf.toString('utf8', pos, keep); pos = keep; if (!more()) throw new Error('못 찾음 ' + tok); }
}
function nums(arr) {   // pos 부터 ']' 까지 정수 → arr(Uint32Array) · 개수
  let k = 0, acc = 0, inN = false;
  for (;;) {
    for (; pos < buf.length; pos++) {
      const c = buf[pos];
      if (c >= 48 && c <= 57) { acc = acc * 10 + (c - 48); inN = true; }
      else { if (inN) { arr[k++] = acc; acc = 0; inN = false; } if (c === 93) { pos++; return k; } }
    }
    if (!more()) throw new Error('수 끝 없음');
  }
}
const head = seek('"nodes":[');
const meta = JSON.parse(head.replace(/^\{"snapshot":/, '').replace(/,\s*$/, '')).meta;
const hdr = JSON.parse(head.replace(/^\{"snapshot":/, '').replace(/,\s*$/, ''));
const NF = meta.node_fields.length, EF = meta.edge_fields.length;
const NODE_N = hdr.node_count, EDGE_N = hdr.edge_count;
const nodes = new Uint32Array(NODE_N * NF);
if (nums(nodes) !== NODE_N * NF) throw new Error('노드 수 다름');
log(`노드 ${NODE_N}`);
seek('"edges":[');
const edges = new Uint32Array(EDGE_N * EF);
if (nums(edges) !== EDGE_N * EF) throw new Error('변 수 다름');
log(`변 ${EDGE_N}`);
seek('"strings":[');
const strings = [];
for (;;) {   // JSON 글자 줄 하나씩
  for (;;) {
    while (pos < buf.length && buf[pos] !== 34 && buf[pos] !== 93) pos++;
    if (pos < buf.length) break; if (!more()) throw new Error('글자 끝 없음');
  }
  if (buf[pos] === 93) break;
  let j = pos + 1;
  for (;;) {
    while (j < buf.length && buf[j] !== 34) j += buf[j] === 92 ? 2 : 1;
    if (j < buf.length) break; const off = j - pos; if (!more()) throw new Error('글자 끝 없음'); j = pos + off;
  }
  const s = buf.toString('utf8', pos, j + 1);
  { const v = JSON.parse(s); strings.push(v.length > 160 ? v.slice(0, 160) : v); }
  pos = j + 1;
}
fs.closeSync(fd); buf = null;
log(`글자 ${strings.length}`);

// ── 칸 ───────────────────────────────────────────────────────────────────────────────
const nT = meta.node_types[0], eT = meta.edge_types[0];
const F = (n) => meta.node_fields.indexOf(n), E = (n) => meta.edge_fields.indexOf(n);
const fType = F('type'), fName = F('name'), fSelf = F('self_size'), fEc = F('edge_count');
const eType = E('type'), eName = E('name_or_index'), eTo = E('to_node');
const WEAK = eT.indexOf('weak'), ELEM = eT.indexOf('element'), HIDDEN = eT.indexOf('hidden'), CTX = eT.indexOf('context'), SHORT = eT.indexOf('shortcut');
const first = new Uint32Array(NODE_N + 1);
for (let i = 0, e = 0; i < NODE_N; i++) { first[i] = e; e += nodes[i * NF + fEc]; first[i + 1] = e; }
const self = (i) => nodes[i * NF + fSelf];
const nName = (i) => { const t = nT[nodes[i * NF + fType]]; const nm = strings[nodes[i * NF + fName]]; return t === 'object' || t === 'closure' || t === 'native' ? `${t === 'object' ? '' : t + ':'}${nm}` : `(${t})${t === 'string' || t === 'concatenated string' || t === 'sliced string' ? '' : nm}`; };
const eLabel = (e) => { const t = edges[e * EF + eType], n = edges[e * EF + eName]; if (t === ELEM || t === HIDDEN) return '[]'; if (t === CTX) return '$' + strings[n]; if (t === SHORT) return '>' + strings[n]; return '.' + strings[n]; };

// ── --who <id,id,…> — 그 노드까지 뿌리에서 가장 짧은 길(약한 변 뺌 · BFS) 을 찍고 끝낸다 ─────────────
if (opt('who', null)) {
  const want = new Set(opt('who').split(',').map(Number)); const fId = F('id');
  const par = new Int32Array(NODE_N).fill(-1), pe = new Int32Array(NODE_N).fill(-1); const q = new Uint32Array(NODE_N); let h = 0, t = 0; q[t++] = 0; par[0] = 0;
  while (h < t) { const n = q[h++]; for (let e = first[n]; e < first[n + 1]; e++) { if (edges[e * EF + eType] === WEAK) continue; const c = edges[e * EF + eTo] / NF; if (par[c] >= 0) continue; par[c] = n; pe[c] = e; q[t++] = c; } }
  for (let n = 0; n < NODE_N; n++) if (want.has(nodes[n * NF + fId])) {
    const parts = []; let x = n; while (x !== 0 && parts.length < 60) { parts.push(eLabel(pe[x]) + ':' + nName(x)); x = par[x]; }
    console.log(`@${nodes[n * NF + fId]} ${nName(n)}\n  ` + parts.reverse().join('\n  '));
    const outs = []; for (let e = first[n]; e < first[n + 1] && outs.length < 25; e++) { const c = edges[e * EF + eTo] / NF; outs.push(`${eLabel(e)} → ${nName(c)} (self ${self(c)} · 변 ${first[c + 1] - first[c]})`); }
    { const ins = []; for (let p = 0; p < NODE_N && ins.length < 30; p++) for (let e = first[p]; e < first[p + 1]; e++) if (edges[e * EF + eTo] / NF === n) ins.push(`${nName(p)}#${nodes[p * NF + fId]} ${eLabel(e)}${nT[edges[e * EF + eType]] || ''}`); console.log('  들어오는 변: ' + ins.join(' | ')); }
    if (opt('deep', null)) { const e0 = first[n]; const c0 = edges[e0 * EF + eTo] / NF; const o2 = []; for (let e = first[c0]; e < first[c0 + 1]; e++) { const c = edges[e * EF + eTo] / NF; o2.push(`${eLabel(e)}=${nName(c)}${nT[nodes[c * NF + fType]] === 'number' || nT[nodes[c * NF + fType]] === 'string' ? '(' + String(strings[nodes[c * NF + fName]]).slice(0, 30) + ')' : ''}`); } console.log('  첫 원소 변: ' + o2.join(' ')); }
    console.log('  나가는 변: ' + (first[n + 1] - first[n]) + '\n    ' + outs.join('\n    '));
  }
  process.exit(0);
}
// ── 지배 나무(뿌리 0 · 약한 변 뺌) ───────────────────────────────────────────────────
const post = new Uint32Array(NODE_N), order = new Int32Array(NODE_N).fill(-1);
{ const stk = new Uint32Array(NODE_N), it = new Uint32Array(NODE_N); let sp = 0, k = 0; const seen = new Uint8Array(NODE_N);
  stk[sp] = 0; it[sp] = first[0]; sp++; seen[0] = 1;
  while (sp) { const n = stk[sp - 1]; let e = it[sp - 1];
    for (; e < first[n + 1]; e++) { if (edges[e * EF + eType] === WEAK) continue; const c = edges[e * EF + eTo] / NF; if (!seen[c]) { seen[c] = 1; it[sp - 1] = e + 1; stk[sp] = c; it[sp] = first[c]; sp++; break; } }
    if (e >= first[n + 1]) { sp--; order[n] = k; post[k++] = n; } }
  log(`닿는 노드 ${k}`);
  var REACH = k; }
// 거꾸로 변(닿는 것만)
const rc = new Uint32Array(NODE_N + 1);
for (let n = 0; n < NODE_N; n++) { if (order[n] < 0) continue; for (let e = first[n]; e < first[n + 1]; e++) { if (edges[e * EF + eType] === WEAK) continue; rc[edges[e * EF + eTo] / NF + 1]++; } }
for (let i = 0; i < NODE_N; i++) rc[i + 1] += rc[i];
const rv = new Uint32Array(rc[NODE_N]); { const fill = rc.slice(0, NODE_N);
  for (let n = 0; n < NODE_N; n++) { if (order[n] < 0) continue; for (let e = first[n]; e < first[n + 1]; e++) { if (edges[e * EF + eType] === WEAK) continue; const c = edges[e * EF + eTo] / NF; rv[fill[c]++] = n; } } }
const dom = new Int32Array(REACH).fill(-1);   // 후순위 번호로
const R = REACH - 1; dom[R] = R;
const isect = (x, y) => { while (x !== y) { while (x < y) x = dom[x]; while (y < x) y = dom[y]; } return x; };
for (let changed = true, pass = 0; changed; pass++) { changed = false;
  for (let k = R - 1; k >= 0; k--) { const n = post[k]; let nd = -1;
    for (let r = rc[n]; r < rc[n + 1]; r++) { const p = order[rv[r]]; if (p < 0 || dom[p] < 0) continue; nd = nd < 0 ? p : isect(p, nd); }
    if (nd >= 0 && dom[k] !== nd) { dom[k] = nd; changed = true; } }
  log(`지배 되풀이 ${pass + 1}`); }
const ret = new Float64Array(REACH);
for (let k = 0; k < REACH; k++) ret[k] += self(post[k]);
for (let k = 0; k < R; k++) if (dom[k] >= 0) ret[dom[k]] += ret[k];
log(`붙든 크기 뿌리 ${(ret[R] / 1048576).toFixed(0)} MB`);

// ── --ctor <이름> — 그 생성자 노드의 수 · 붙든 합 · 붙든 큰 셋의 나가는 변(붙든 크기) 을 찍고 끝낸다 ─────────────
if (opt('ctor', null)) {
  const want = opt('ctor'); let cnt = 0, sum = 0; const top = [];
  for (let k = 0; k < REACH; k++) { const n = post[k]; if (nName(n) !== want) continue; cnt++; sum += ret[k]; top.push(k); }
  top.sort((a, b) => ret[b] - ret[a]);
  console.log(`${want}: ${cnt}개 · 붙든 합 ${(sum / 1048576).toFixed(1)} MB`);
  for (const k of top.slice(0, +(opt('n', '3')))) { const n = post[k]; const o = [];
    for (let e = first[n]; e < first[n + 1]; e++) { const c = edges[e * EF + eTo] / NF; const kc = order[c]; o.push(`${eLabel(e)}:${nName(c)} ${kc >= 0 && dom[kc] === k ? (ret[kc] / 1024).toFixed(0) + 'K' : '-'}`); }
    console.log(`  #${nodes[n * NF + F('id')]} 붙든 ${(ret[k] / 1024).toFixed(0)} KB · ` + o.slice(0, 20).join(' · ')); }
  process.exit(0);
}
// ── 길 · 나무 ────────────────────────────────────────────────────────────────────────
function edgeTo(pn, cn) { for (let e = first[pn]; e < first[pn + 1]; e++) if (edges[e * EF + eTo] / NF === cn && edges[e * EF + eType] !== WEAK) return e; return -1; }
function anyRet(cn) {   // 지배자가 곧은 부모가 아닐 때 — 붙든 이 하나(이름 붙은 변 먼저)
  let best = null;
  for (let r = rc[cn]; r < rc[cn + 1]; r++) { const p = rv[r]; const e = edgeTo(p, cn); if (e < 0) continue; const t = edges[e * EF + eType];
    const s = `~(${nName(p)}${eLabel(e)})`; if (t !== ELEM && t !== HIDDEN && !/^\(/.test(nName(p))) return s; if (!best) best = s; }
  return best || '~';
}
function label(k) {   // 후순위 k 의 지배 사슬 길(위로 30 칸까지)
  const parts = []; let x = k, d = 0;
  while (x !== R && d < 30) { const p = dom[x]; const e = edgeTo(post[p], post[x]); parts.push((e >= 0 ? eLabel(e) : '~') + ':' + nName(post[x])); x = p; d++; }
  return parts.reverse().join(' / ');
}
// 자식 목록(붙든 ≥ MIN 만)
const kids = new Map();
for (let k = 0; k < R; k++) if (ret[k] >= MIN) { const p = dom[k]; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(k); }
const paths = {};
function walk(k, depth, pathStr) {
  const ch = (kids.get(k) || []).sort((x, y) => ret[y] - ret[x]);
  const out = [];
  for (const c of ch) {
    const e = edgeTo(post[k], post[c]);
    const lab = (e >= 0 ? eLabel(e) : anyRet(post[c])) + ':' + nName(post[c]);
    const p = pathStr ? pathStr + ' / ' + lab : lab;
    paths[p] = (paths[p] || 0) + ret[c];
    const sub = depth < 40 ? walk(c, depth + 1, p) : [];
    out.push({ l: lab, mb: +(ret[c] / 1048576).toFixed(1), self: self(post[c]), id: nodes[post[c] * NF + F('id')], k: sub });
  }
  return out;
}
const tree = walk(R, 0, '');
// 생성자 셈(닿는 것)
const byCtor = {};
for (let k = 0; k < REACH; k++) { const n = post[k]; const nm = nName(n); const o = byCtor[nm] || (byCtor[nm] = { n: 0, self: 0 }); o.n++; o.self += self(n); }
const total = ret[R];
fs.writeFileSync(OUT, JSON.stringify({ file: FILE, total, nodes: NODE_N, reach: REACH, byCtor, paths, tree }));
log(`→ ${OUT}`);
