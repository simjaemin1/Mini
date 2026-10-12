#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T710 지형 마이그레이션 도구 ② 차분 · 판정 0 · 새 수 0)
// === scripts/t710-diff.js — 두 굽기(`t710-raster.js`)를 셀마다 맞대 바뀐 셀 집합을 낸다 =============================
//   쓰는 법:
//     node scripts/t710-diff.js <옛.t710r> <새.t710r> --out <차분.json>
//     node scripts/t710-diff.js <옛.t710r> --compose <바탕.t710r> <손질.t710r> --out <차분.json>
//       ⇒ 새 = 옛 위에 (바탕 → 손질) 바뀐 칸만 덮은 판(가지가 옛 바탕 위에 있을 때 — 오늘 main 에 다시 얹은 꼴의 근사).
//          옛도 바탕과 달라진 칸이 겹치면 `겹침` 으로 센다(그 칸은 손질 쪽 값을 쓴다).
//   갈래(셀 집합): 뭍→바다 · 뭍→강호수 · 물→뭍 · 통행→막힘 · 막힘→통행 · 다리 빠짐 · 다리 생김 · 개울 생김/빠짐 · 광맥 생김/빠짐/바뀜 · 숲 생김/빠짐 · 바위 생김/빠짐
//   통행 = (물도 바위도 아님) 또는 다리 — 서버 `isTerrainBlockedLocal` 의 그 꼴(물 · 바위 · 다리 칸).
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
function readR(f) {
  const b = zlib.gunzipSync(fs.readFileSync(f));
  const n = b.readUInt32LE(0); const meta = JSON.parse(b.slice(4, 4 + n).toString());
  const N = meta.W * meta.H, off = 4 + n;
  const bits = new Uint8Array(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + N));
  const ore = new Uint16Array(b.buffer.slice(b.byteOffset + off + N, b.byteOffset + off + N + N * 2));
  return { meta, bits, ore };
}
const OLD = readR(A[0]);
const ci = A.indexOf('--compose');
let NEW, composeInfo = null;
if (ci >= 0) {
  const BASE = readR(A[ci + 1]), EDIT = readR(A[ci + 2]);
  const N = OLD.bits.length;
  const bits = new Uint8Array(OLD.bits), ore = new Uint16Array(N);
  // 광맥 번호는 굽기마다 표가 다르다 — 서명으로 옮긴다
  const sigNew = [], idx = new Map();
  const put = (s) => { if (!s) return 0; let k = idx.get(s); if (k === undefined) { k = sigNew.length + 1; sigNew.push(s); idx.set(s, k); } return k; };
  let edited = 0, overlap = 0;
  for (let i = 0; i < N; i++) {
    const eChanged = BASE.bits[i] !== EDIT.bits[i] || (BASE.meta.oreSig[BASE.ore[i] - 1] || '') !== (EDIT.meta.oreSig[EDIT.ore[i] - 1] || '');
    if (eChanged) {
      edited++;
      const oChanged = BASE.bits[i] !== OLD.bits[i] || (BASE.meta.oreSig[BASE.ore[i] - 1] || '') !== (OLD.meta.oreSig[OLD.ore[i] - 1] || '');
      if (oChanged) overlap++;
      bits[i] = EDIT.bits[i]; ore[i] = put(EDIT.meta.oreSig[EDIT.ore[i] - 1]);
    } else ore[i] = put(OLD.meta.oreSig[OLD.ore[i] - 1]);
  }
  NEW = { meta: Object.assign({}, OLD.meta, { oreSig: sigNew, composed: { base: BASE.meta.files, edit: EDIT.meta.files } }), bits, ore };
  composeInfo = { edited, overlap, base: A[ci + 1], edit: A[ci + 2] };
} else NEW = readR(A[1]);
const OUT = opt('--out', null);
const W = OLD.meta.W, H = OLD.meta.H;
if (NEW.meta.W !== W || NEW.meta.H !== H) { console.error('존 크기가 다르다'); process.exit(2); }
const WATER = 3, ROCK = 4, BR = 8, ST = 16, FO = 32, ORE = 128;
const pass = (b) => !((b & WATER) || (b & ROCK)) || !!(b & BR);
const cats = {
  '뭍→바다': (o, n) => !(o & WATER) && (n & 1) && !(n & 2),
  '뭍→강호수': (o, n) => !(o & WATER) && (n & 2),
  '물→뭍': (o, n) => (o & WATER) && !(n & WATER),
  '통행→막힘': (o, n) => pass(o) && !pass(n),
  '막힘→통행': (o, n) => !pass(o) && pass(n),
  '다리 빠짐': (o, n) => (o & BR) && !(n & BR),
  '다리 생김': (o, n) => !(o & BR) && (n & BR),
  '개울 생김': (o, n) => !(o & ST) && (n & ST),
  '개울 빠짐': (o, n) => (o & ST) && !(n & ST),
  '숲 생김': (o, n) => !(o & FO) && (n & FO),
  '숲 빠짐': (o, n) => (o & FO) && !(n & FO),
  '바위 생김': (o, n) => !(o & ROCK) && (n & ROCK),
  '바위 빠짐': (o, n) => (o & ROCK) && !(n & ROCK),
  '다리가 뭍 위로': (o, n) => (n & BR) && (o & WATER) && !(n & WATER),   // 강이 없어져 다리만 남는 칸(다리 실체 처리 대상)
};
const sets = {}; for (const k of Object.keys(cats)) sets[k] = [];
sets['광맥 생김'] = []; sets['광맥 빠짐'] = []; sets['광맥 바뀜'] = [];
const oreChange = new Map();   // "옛서명 → 새서명" → 셀 수
for (let i = 0; i < W * H; i++) {
  const o = OLD.bits[i], n = NEW.bits[i];
  const os = OLD.ore[i] ? OLD.meta.oreSig[OLD.ore[i] - 1] : '', ns = NEW.ore[i] ? NEW.meta.oreSig[NEW.ore[i] - 1] : '';
  if (o === n && os === ns) continue;
  for (const [k, f] of Object.entries(cats)) if (f(o, n)) sets[k].push(i);
  if (!os && ns) sets['광맥 생김'].push(i);
  else if (os && !ns) sets['광맥 빠짐'].push(i);
  else if (os !== ns) sets['광맥 바뀜'].push(i);
  if (os !== ns) { const kk = `${os || '∅'} → ${ns || '∅'}`; oreChange.set(kk, (oreChange.get(kk) || 0) + 1); }
}
// 마을 터(정본 지형 JSON `villages` — 시딩 후보 자리) — 옮김 · 생김 · 빠짐
const vilOf = (root) => { try { const j = JSON.parse(fs.readFileSync(require('path').join(root, 'server', 'hanbando-terrain.json'), 'utf8')); return ((j[OLD.meta.zone] || {}).villages) || []; } catch (e) { return []; } };
const vDiff = (a, b) => { const mb = new Map(b.map((v) => [v.name, v])), ma = new Map(a.map((v) => [v.name, v])), r = [];
  for (const v of a) { const w = mb.get(v.name); if (!w) r.push({ name: v.name, what: '빠짐', from: [Math.floor(v.x / 32), Math.floor(v.y / 32)] });
    else if (w.x !== v.x || w.y !== v.y || w.type !== v.type) r.push({ name: v.name, what: '옮김', from: [Math.floor(v.x / 32), Math.floor(v.y / 32)], to: [Math.floor(w.x / 32), Math.floor(w.y / 32)], cells: +Math.hypot((w.x - v.x) / 32, (w.y - v.y) / 32).toFixed(1), type: [v.type, w.type] }); }
  for (const w of b) if (!ma.has(w.name)) r.push({ name: w.name, what: '생김', to: [Math.floor(w.x / 32), Math.floor(w.y / 32)] });
  return r; };
const villageSites = composeInfo ? vDiff(vilOf(readR(A[ci + 1]).meta.root), vilOf(readR(A[ci + 2]).meta.root)) : vDiff(vilOf(OLD.meta.root), vilOf(NEW.meta.root));
const bbox = (arr) => { if (!arr.length) return null; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const i of arr) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
const summary = {};
for (const [k, arr] of Object.entries(sets)) summary[k] = { cells: arr.length, bbox: bbox(arr) };
const out = { zone: OLD.meta.zone, W, H, old: { root: OLD.meta.root, files: OLD.meta.files }, new: { root: NEW.meta.root, files: NEW.meta.files, composed: NEW.meta.composed || null },
  compose: composeInfo, summary, villageSites, oreChange: [...oreChange].sort((a, b) => b[1] - a[1]).slice(0, 40),
  // 셀 집합(존 로컬 칸 번호 i = cy × W + cx) — 영향 표(`t710-impact.js`)가 읽는다
  cells: Object.fromEntries(Object.entries(sets).map(([k, a]) => [k, Buffer.from(new Uint32Array(a).buffer).toString('base64')])) };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\n[t710 차분] ${out.zone} ${W}×${H}${composeInfo ? ` · 덮은 칸(바탕→손질) ${composeInfo.edited} · 옛도 바뀐 칸과 겹침 ${composeInfo.overlap}` : ''}`);
console.log('| 갈래 | 셀 | 범위(셀 x0,y0 – x1,y1) |\n|---|---:|---|');
for (const [k, v] of Object.entries(summary)) if (v.cells) console.log(`| ${k} | ${v.cells.toLocaleString()} | ${v.bbox.slice(0, 2).join(',')} – ${v.bbox.slice(2).join(',')} |`);
if (villageSites.length) { console.log('\n마을 터(정본 villages):'); for (const v of villageSites) console.log(`  ${v.name} ${v.what}${v.from ? ` (${v.from})` : ''}${v.to ? ` → (${v.to})` : ''}${v.cells != null ? ` · ${v.cells}셀` : ''}`); }
if (oreChange.size) { console.log('\n광맥 바뀜(옛 → 새 · 셀):'); for (const [k, c] of out.oreChange.slice(0, 12)) console.log(`  ${k}: ${c}`); }
if (OUT) console.log(`\n→ ${OUT}`);
