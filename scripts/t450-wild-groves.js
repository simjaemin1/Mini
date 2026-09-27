#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기)
// =============================================================================
// T450 자 — **야생 군락**(서식이 낳는 군락 · `chunk.js WILD` · 손잡이 `T450_WILD_GROVES` 기본 끔) (2026-09-27)
//
// ★재기만 한다. 제품은 읽기만 하고, 값은 전부 정본에서 읽는다(수를 적지 않는다):
//   · 서식 술어·종·밀도·모양 — `chunk.js` 의 `_wildClass` · `WILD_HAB` · `WILD.D` · `WILD.N/R`
//   · 채집 반경 — `forage.CFG.WALK_SEC` × `zone.js MOVE_SPEED` ÷ 셀 32(T347 `_t347R` 그 식 · 소스에서 읽는다)
//   · 채집꾼·원정군의 종 집합 — `zone.js _T347_TYPES` 글자 그대로(소스에서 읽는다)
//   · 수동 군락 53 · 마을 자리 51 — `terrain.ZONE_TERRAIN.hanbando.groves` · `terrain.getZoneVillages`
//
// 쓰는 법(모드 하나씩 · 서버 코드 자리는 `T450_ROOT` — 베이스 워크트리를 같은 자로 잰다):
//   node scripts/t450-wild-groves.js --derive              유도 표(수동 53 의 지형 × 채집 원판 셀) → `WILD.D` 와 맞대기
//   node scripts/t450-wild-groves.js --hash [out.json]     존 셋(한반도·닛폰·중원북) 전 청크 해시(T406 문법) · 끔/켬 · 수
//   node scripts/t450-wild-groves.js --forager             51마을 채집 원판 전수 — 채집꾼이 보는 개체가 끔/켬 비트 동일인가
//   node scripts/t450-wild-groves.js --route               원정 길(T441 실서버 판 · siegehold 어촌2→광산2) 채집 반경 띠의 개체
//   node scripts/t450-wild-groves.js --png-json <out>      그림 자료(`scripts/t450-wild-groves-png.py` 가 그린다)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = process.env.T450_ROOT ? path.resolve(process.env.T450_ROOT) : path.join(__dirname, '..');
const MODE = process.argv[2] || '--derive';
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
const _l = console.log; console.log = () => {};
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
console.log = _l;
const say = (s) => process.stdout.write(s + '\n');
const HB = 'hanbando', ZONE3 = ['hanbando', 'nippon', 'jungwon_n'];
const HASWILD = !!(CH.WILD && CH._wildClass);
const setWild = (on) => { if (on) process.env.T450_WILD_GROVES = '1'; else delete process.env.T450_WILD_GROVES; };

//   채집 반경(셀) — T347 이 쓰는 그 식을 **정본에서 읽어** 다시 푼다
function forageR() {
  const F = require(path.join(ROOT, 'server', 'forage'));
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const mv = +((zsrc.match(/const MOVE_SPEED = (\d+);/) || [])[1]);
  return { R: Math.round(mv * F.CFG.WALK_SEC / 32), walk: F.CFG.WALK_SEC, move: mv };
}
//   채집꾼·원정군의 종 집합 — `zone.js _T347_TYPES` 글자
function pickSet() {
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const m = /const _T347_TYPES = \{([^}]*)\}/.exec(zsrc);
  return new Set(m ? [...m[1].matchAll(/(\w+)\s*:/g)].map((q) => q[1]) : []);
}
//   씨 키 → 야생 군락 중심 셀(`<cx>_<cy>_wg<gx>_<gy>_<i>`) — 그 꼴은 `chunk.js` 가 정한다
const wildOf = (k) => { const m = /_wg(\d+)_(\d+)_(\d+)$/.exec(k || ''); return m ? { gx: +m[1], gy: +m[2], i: +m[3] } : null; };

// ── 유도 — 수동 군락 53 의 지형 × 51마을 채집 원판 셀 ─────────────────────────────
function derive(zid) {
  const Z = zid || HB;
  const G = (T.ZONE_TERRAIN[Z] && T.ZONE_TERRAIN[Z].groves) || [];
  const V = T.getZoneVillages(Z) || [];
  const { R } = forageR();
  const byClass = {}, byClassKind = {};
  for (const g of G) {
    const c = CH._wildClass(Z, g.center[0], g.center[1]) || 'water·rock';
    byClass[c] = (byClass[c] || 0) + 1;
    (byClassKind[c] = byClassKind[c] || {})[g.kind || 'berry_bush'] = (byClassKind[c][g.kind || 'berry_bush'] || 0) + 1;
  }
  const seen = new Set(), cells = {};
  for (const v of V) {
    const vx = Math.floor(v.x / 32), vy = Math.floor(v.y / 32);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const k = (vx + dx) * 65536 + (vy + dy); if (seen.has(k)) continue; seen.add(k);
      const c = CH._wildClass(Z, (vx + dx) * 32 + 16, (vy + dy) * 32 + 16) || 'water·rock';
      cells[c] = (cells[c] || 0) + 1;
    }
  }
  const nMed = (() => { const a = G.filter((g) => g.kind !== 'water_pool').map((g) => g.n).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; })();
  const rMed = (() => { const a = G.filter((g) => g.kind !== 'water_pool').map((g) => g.r).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; })();
  return { zone: Z, groves: G.length, villages: V.length, R, disk: seen.size, byClass, byClassKind, cells, nMed, rMed };
}

if (MODE === '--derive') {
  if (!HASWILD) { say('이 코드엔 `chunk.js WILD` 가 없다(T450 전)'); process.exit(0); }
  const d = derive(HB);
  const F = forageR();
  say(`=== T450 유도 — 한반도 수동 군락 ${d.groves} · 마을 ${d.villages} · 채집 원판 반경 ${d.R}셀(= 걸음 ${F.move} × WALK_SEC ${F.walk} ÷ 32) · 원판 셀 ${d.disk} ===`);
  say('지형(_wildClass)   수동 군락(종)                                    원판 셀     셀당 밀도         chunk.js WILD.D   같나');
  let allSame = true;
  for (const c of ['forest', 'edge', 'riverside', 'plain', 'water·rock']) {
    const n = d.byClass[c] || 0, cl = d.cells[c] || 0;
    const kinds = JSON.stringify(d.byClassKind[c] || {});
    const W = CH.WILD.D[c];
    const same = W ? (W[0] === n && W[1] === cl) : null;
    if (W && !same) allSame = false;
    say(`${c.padEnd(12)}  ${String(n).padStart(3)} ${kinds.padEnd(48)} ${String(cl).padStart(8)}  ${cl ? (n / cl).toExponential(4) : '—'.padStart(10)}   ${W ? JSON.stringify(W).padEnd(14) : '(종 없음)'.padEnd(14)}  ${W ? (same ? '○' : '✗') : '—'}`);
  }
  say(`종(서식 · T415 표): ${JSON.stringify(CH.WILD_HAB)} · 군락 모양: 점 ${CH.WILD.N}(수동 중앙 ${d.nMed}) · 반경 ${CH.WILD.R}px(수동 중앙 ${d.rMed})`);
  say(`판정 — WILD.D ${allSame ? '★유도와 같다' : '✗유도와 다르다'} · 모양 ${CH.WILD.N === d.nMed && CH.WILD.R === d.rMed ? '같다' : '다르다'}`);
  process.exit(allSame ? 0 : 1);
}

// ── 존 전체 청크 해시(T406 문법) · 끔/켬 · 수 ─────────────────────────────────────
function zoneScan(zid, on, opts) {
  setWild(on);
  const Z = ZONES[zid], cs = CH.CHUNK_SIZE;
  const cx1 = Math.ceil(Z.zoneWidth / cs), cy1 = Math.ceil(Z.zoneHeight / cs);
  const H = crypto.createHash('sha1'), RG = crypto.createHash('sha1');
  let ents = 0, wild = 0, ring = 0; const byKind = {}, byClass = {}, centers = new Map();
  const t0 = Date.now();
  for (let cy = 0; cy < cy1; cy++) for (let cx = 0; cx < cx1; cx++) {
    const h = crypto.createHash('sha1');
    const list = CH.generateChunkResources(zid, Z.biome, cx, cy, cs, null, 0).concat(CH.overflowInto(zid, Z.biome, cx, cy, cs, null, 0));
    for (const r of list) {
      h.update(`${r.id}|${r.type}|${r.x}|${r.y}|${r.sp || ''}|${r.regrown || ''};`);
      if (r.seedKey && r.seedKey.charCodeAt(0) === 103 /* g — 링 군락 */) { ring++; RG.update(`${r.id}|${r.type}|${r.x}|${r.y};`); }
      const w = wildOf(r.seedKey);
      if (w) {
        wild++; byKind[r.type] = (byKind[r.type] || 0) + 1;
        const ck = w.gx * 65536 + w.gy;
        if (!centers.has(ck)) { const c = HASWILD ? CH._wildClass(zid, w.gx * 32 + 16, w.gy * 32 + 16) : '?'; centers.set(ck, { gx: w.gx, gy: w.gy, kind: r.type, cls: c, n: 0 }); byClass[c] = (byClass[c] || 0) + 1; }
        centers.get(ck).n++;
        if (opts && opts.pts) opts.pts.push([Math.round(r.x), Math.round(r.y), r.type]);
      }
    }
    ents += list.length;
    H.update(h.digest('hex').slice(0, 12));
  }
  setWild(false);
  return { zone: zid, on, chunks: cx1 * cy1, ents, ms: Date.now() - t0, hash: H.digest('hex').slice(0, 16), ring, ringHash: RG.digest('hex').slice(0, 16),
    wild, groves: centers.size, byKind, byClass, centers: opts && opts.keepCenters ? [...centers.values()] : undefined };
}

if (MODE === '--hash') {
  const OUT = process.argv[3] || '/tmp/t450-hash.json';
  const res = { root: ROOT, hasWild: HASWILD, zones: {} };
  say(`=== T450 존 전체 청크 해시(T406 문법 · generateChunkResources + overflowInto · id|type|x|y|sp|regrown) — 코드 ${ROOT} · WILD ${HASWILD ? '있음' : '없음(T450 전)'} ===`);
  for (const zid of ZONE3) {
    if (!ZONES[zid]) continue;
    const off = zoneScan(zid, false);
    res.zones[zid] = { off };
    say(`${zid.padEnd(10)} 끔: 청크 ${off.chunks} · 개체 ${off.ents} · 해시 ${off.hash} · 링 군락 개체 ${off.ring}(해시 ${off.ringHash}) · 야생 ${off.wild} · ${(off.ms / 1000).toFixed(1)}s`);
    if (HASWILD) {
      const on = zoneScan(zid, true);
      res.zones[zid].on = on;
      say(`${''.padEnd(10)} 켬: 개체 ${on.ents}(+${on.ents - off.ents}) · 해시 ${on.hash} · 링 군락 개체 ${on.ring}(해시 ${on.ringHash} · ${on.ringHash === off.ringHash ? '끔과 같다' : '★다르다'}) · 야생 군락 ${on.groves}곳 · 개체 ${on.wild} ${JSON.stringify(on.byKind)} · 서식 ${JSON.stringify(on.byClass)} · ${(on.ms / 1000).toFixed(1)}s`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  say(`표 → ${OUT}`);
  process.exit(0);
}

// ── 채집꾼이 보는 개체 — 51마을 채집 원판 전수 · 끔/켬 ─────────────────────────────
if (MODE === '--forager') {
  if (!HASWILD) { say('WILD 없음'); process.exit(0); }
  const PICK = pickSet();
  const V = T.getZoneVillages(HB);
  const { R } = forageR();
  const Z = ZONES[HB];
  const view = (on) => {
    setWild(on);
    const Hh = crypto.createHash('sha1'); let pick = 0, other = 0; const otherKind = {}; const perVil = [];
    for (const v of V) {
      const vx = Math.floor(v.x / 32), vy = Math.floor(v.y / 32); let pv = 0, ov = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const a = CH.resourcesAtCell(HB, vx + dx, vy + dy, { biome: Z.biome, chunkSize: CH.CHUNK_SIZE });
        for (const e of a) {
          if (PICK.has(e.type)) { pick++; pv++; Hh.update(`${e.id}|${e.type}|${e.x}|${e.y};`); }
          else if (wildOf(e.seedKey)) { other++; ov++; otherKind[e.type] = (otherKind[e.type] || 0) + 1; }
        }
      }
      perVil.push([v.name, pv, ov]);
    }
    setWild(false);
    return { hash: Hh.digest('hex').slice(0, 16), pick, other, otherKind, perVil };
  };
  const t0 = Date.now();
  const A = view(false), B = view(true);
  say(`=== T450 채집꾼이 보는 개체 — 51마을 채집 원판(반경 ${R}셀) 전수 · 종 집합 = zone.js _T347_TYPES {${[...PICK].join(', ')}} · ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  say(`끔: 딸 개체 ${A.pick} · 해시 ${A.hash} · 원판 안 야생 개체 ${A.other}`);
  say(`켬: 딸 개체 ${B.pick} · 해시 ${B.hash} · 원판 안 야생 개체 ${B.other} ${JSON.stringify(B.otherKind)}`);
  const withWild = B.perVil.filter((q) => q[2] > 0);
  say(`판정 — 채집꾼이 보는 개체 ${A.hash === B.hash && A.pick === B.pick ? '★끔/켬 비트 동일' : '✗갈린다'} · 원판 안에 야생 군락 개체가 있는 마을 ${withWild.length}/${V.length}(중앙 ${withWild.length ? withWild.map((q) => q[2]).sort((x, y) => x - y)[Math.floor(withWild.length / 2)] : 0})`);
  process.exit(A.hash === B.hash ? 0 : 1);
}

// ── 원정 길 — T441 실서버 판(siegehold 어촌2→광산2 · 403셀) · 채집 반경 띠 ─────────────
if (MODE === '--route') {
  if (!HASWILD) { say('WILD 없음'); process.exit(0); }
  const PICK = pickSet();
  const V = T.getZoneVillages(HB);
  const { R } = forageR();
  const Z = ZONES[HB];
  const pairs = [['어촌2', '광산2']];
  //   그리고 모든 마을의 가장 가까운 이웃 마을 쌍(한 번씩) — 한 판의 우연이 아닌가
  for (const a of V) { let best = null, bd = Infinity; for (const b of V) { if (a === b) continue; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < bd) { bd = d; best = b; } }
    const key = [a.name, best.name].sort().join('|'); if (!pairs.some((p) => [p[0], p[1]].sort().join('|') === key)) pairs.push([a.name, best.name]); }
  const band = (A, B) => {   // 직선 A→B · 칸마다 반경 R 원판의 합집합
    const ax = Math.floor(A.x / 32), ay = Math.floor(A.y / 32), bx = Math.floor(B.x / 32), by = Math.floor(B.y / 32);
    const L = Math.max(Math.abs(bx - ax), Math.abs(by - ay)), set = new Set();
    for (let s = 0; s <= L; s++) { const px = Math.round(ax + (bx - ax) * s / (L || 1)), py = Math.round(ay + (by - ay) * s / (L || 1));
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) set.add((px + dx) * 65536 + (py + dy)); }
    return { L, cells: set };
  };
  const count = (cells, on) => { setWild(on); const r = { pick: 0, wild: 0, byKind: {}, cls: {} };
    for (const k of cells) { const x = Math.floor(k / 65536), y = k % 65536; if (x < 0 || y < 0) continue;
      for (const e of CH.resourcesAtCell(HB, x, y, { biome: Z.biome, chunkSize: CH.CHUNK_SIZE })) {
        if (PICK.has(e.type)) r.pick++;
        if (wildOf(e.seedKey)) { r.wild++; r.byKind[e.type] = (r.byKind[e.type] || 0) + 1; }
      } }
    setWild(false); return r; };
  const clsOf = (cells) => { const c = {}; for (const k of cells) { const x = Math.floor(k / 65536), y = k % 65536; const q = CH._wildClass(HB, x * 32 + 16, y * 32 + 16) || 'water·rock'; c[q] = (c[q] || 0) + 1; } return c; };
  say(`=== T450 원정 길 — 직선 · 칸마다 채집 반경 ${R}셀 띠(T441 _warDayCells 반경) · 종 집합 {${[...PICK].join(', ')}} ===`);
  const rows = [];
  for (const [an, bn] of pairs) {
    const A = V.find((v) => v.name === an), B = V.find((v) => v.name === bn); if (!A || !B) continue;
    const { L, cells } = band(A, B);
    const off = count(cells, false), on = count(cells, true);
    rows.push({ a: an, b: bn, L, cells: cells.size, off, on });
    if (rows.length === 1) {
      const c = clsOf(cells);
      say(`${an}→${bn}: 길 ${L}셀 · 띠 ${cells.size}셀(지형 ${JSON.stringify(c)}) — 딸 수 있는(종 집합) 끔 ${off.pick} → 켬 ${on.pick} · 야생 군락 개체 끔 ${off.wild} → 켬 ${on.wild} ${JSON.stringify(on.byKind)}`);
    }
  }
  const agg = (f) => { const a = rows.slice(1).map(f).sort((x, y) => x - y); return { sum: a.reduce((s, x) => s + x, 0), med: a[Math.floor(a.length / 2)], max: a[a.length - 1], zero: a.filter((x) => x === 0).length }; };
  const w = agg((r) => r.on.wild), p0 = agg((r) => r.off.pick), p1 = agg((r) => r.on.pick), Ls = agg((r) => r.L);
  say(`가장 가까운 이웃 쌍 ${rows.length - 1}개(길 중앙 ${Ls.med}셀): 딸 수 있는 개체 끔 중앙 ${p0.med} → 켬 ${p1.med}(합 ${p0.sum} → ${p1.sum}) · 야생 군락 개체(종 집합 밖) 켬 중앙 ${w.med} · 최대 ${w.max} · 0 인 길 ${w.zero}/${rows.length - 1}`);
  fs.writeFileSync('/tmp/t450-route.json', JSON.stringify(rows, null, 1));
  process.exit(0);
}

// ── 그림 자료 ─────────────────────────────────────────────────────────────────
if (MODE === '--png-json') {
  const OUT = process.argv[3] || '/tmp/t450-png.json';
  const Z = ZONES[HB];
  const on = zoneScan(HB, true, { keepCenters: true });
  const st = 8;   // 바탕 격자 — 8셀마다 한 점(그림 한 칸 = 256px · 지형 판정 `_wildClass` 그대로)
  const W = Math.ceil(Z.zoneWidth / 32 / st), Hh = Math.ceil(Z.zoneHeight / 32 / st);
  const code = { forest: 1, edge: 2, riverside: 3, plain: 4 };
  const grid = [];
  for (let y = 0; y < Hh; y++) { let row = ''; for (let x = 0; x < W; x++) { const c = CH._wildClass(HB, (x * st) * 32 + 16, (y * st) * 32 + 16); row += c ? String(code[c]) : '0'; } grid.push(row); }
  const G = (T.ZONE_TERRAIN[HB].groves || []).map((g) => ({ x: g.center[0], y: g.center[1], kind: g.kind, cls: CH._wildClass(HB, g.center[0], g.center[1]) }));
  const V = (T.getZoneVillages(HB) || []).map((v) => ({ name: v.name, x: v.x, y: v.y }));
  const d = derive(HB);
  fs.writeFileSync(OUT, JSON.stringify({ zone: HB, W: Z.zoneWidth, H: Z.zoneHeight, st, grid, centers: on.centers, ring: G, villages: V,
    counts: { groves: on.groves, wild: on.wild, byKind: on.byKind, byClass: on.byClass }, derive: d, D: CH.WILD.D, hab: CH.WILD_HAB }));
  say(`그림 자료 → ${OUT} · 야생 군락 ${on.groves} · 링 ${G.length} · 마을 ${V.length} · 바탕 ${W}×${Hh}`);
  process.exit(0);
}
say('모드: --derive | --hash [out] | --forager | --route | --png-json <out>');
