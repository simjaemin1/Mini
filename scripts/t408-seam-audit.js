#!/usr/bin/env node
// === scripts/t408-seam-audit.js — 존 경계에서 잘린 피처 전수 (T408 ①) ==================
//
// ★계측기다 — 러너 밖 · 제품 무접촉(정본 JSON·terrain 은 읽기만).
//
// ★§0 — 카드는 "정본 `pos` 는 월드 px"라 적었다. 실측: **존 로컬 px** 다(한반도 목록 x −2,204 ~ 70,931 ·
//   존 폭 70,016 / 닛폰 −2,417 ~ 49,968 · 폭 49,984). 이웃 존의 피처를 보려면 **존 원점 차**만큼 옮겨야 한다:
//     B 로컬 = A 로컬 + (A.worldOffset − B.worldOffset)
//   그리고 각 존은 **제 목록만** 읽는다(`terrain.js` 의 술어 전부가 `ZONE_TERRAIN[zoneId]` 하나) —
//   그래서 경계 너머로 삐져나간 피처는 **이웃 존 땅에서 그려지지 않는다**(그 존은 그것을 모른다).
//
// ★무엇을 세나(경계 여덟 — 한반도·닛폰 × 동서남북):
//   경계 띠(± 1청크 = 1,024px) 안에 닿는 피처 — 강·능선·골짜기(path) · 호수(원·타원·multi) · 숲(타원·사각) ·
//   군락(원) · 광맥(원) · 고개(원). 그중 **경계를 넘는 것**(모양이 경계선에 닿거나 넘는다) ·
//   이웃 목록에 **짝**이 있나(같은 종류로 경계선 위 같은 자리 ± 폭 — 이름이 같을 필요는 없다) ·
//   경계에서 **뛰는 값**(강 폭 · 숲 배수 · 지면 색).
//
// 실행: node scripts/t408-seam-audit.js [--png] [--json /tmp/x.json]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const J = require(path.join(ROOT, 'server', 'hanbando-terrain.json'));
const argv = process.argv.slice(2);
const BAND = 1024;                               // ± 1청크(= chunk.CHUNK_SIZE) — 카드 지정
const ZIDS = argv.includes('--zones') ? argv[argv.indexOf('--zones') + 1].split(',') : ['hanbando', 'nippon'];   // --zones jungwon_n = 중원북 예고(T409 입력)

const zoneAtWorld = (wx, wy) => {
  for (const [id, z] of Object.entries(ZONES)) {
    if (wx >= z.worldOffsetX && wx < z.worldOffsetX + z.zoneWidth && wy >= (z.worldOffsetY || 0) && wy < (z.worldOffsetY || 0) + z.zoneHeight) return id;
  }
  return null;
};
// 경계 넷 — A 로컬 좌표의 선(축 · 값 · 구간)과 그 너머 존
function edgesOf(zid) {
  const Z = ZONES[zid], W = Z.zoneWidth, H = Z.zoneHeight, ox = Z.worldOffsetX, oy = Z.worldOffsetY || 0;
  const mk = (side, axis, v, a0, a1, probe) => {
    // 너머 존 — 경계 선을 따라 64 점을 찍어 이름을 모은다(한 변에 이웃이 둘일 수 있다)
    const who = {};
    for (let k = 0; k < 64; k++) { const t = a0 + (a1 - a0) * (k + 0.5) / 64; const [wx, wy] = probe(t); const n = zoneAtWorld(wx, wy) || '(없음)'; who[n] = (who[n] || 0) + 1; }
    return { side, axis, v, a0, a1, who };
  };
  return [
    mk('동', 'x', W, 0, H, (t) => [ox + W + 1, oy + t]),
    mk('서', 'x', 0, 0, H, (t) => [ox - 1, oy + t]),
    mk('북', 'y', 0, 0, W, (t) => [ox + t, oy - 1]),
    mk('남', 'y', H, 0, W, (t) => [ox + t, oy + H + 1]),
  ];
}
const P = (p) => (p.pos ? p.pos : p);
const W_ = (f, p) => (p.width != null ? p.width : (f.width || 200));
// 피처의 **경계선 위 자국** — 경계선(axis=v)과 만나는 구간 [lo, hi](선을 따라)과 그 자리의 폭. 안 만나면 null.
function footprint(kind, f, e) {
  const along = e.axis === 'x' ? 1 : 0, across = e.axis === 'x' ? 0 : 1;
  const hits = [];
  let near = Infinity;
  if (f.path) {
    const pts = f.path;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = P(pts[i]), b = P(pts[i + 1]);
      const wa = W_(f, pts[i]), wb = W_(f, pts[i + 1]);
      const da = a[across] - e.v, db = b[across] - e.v;
      near = Math.min(near, Math.abs(da) - wa / 2, Math.abs(db) - wb / 2);
      if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) {
        const t = da === db ? 0 : da / (da - db);
        const c = a[along] + (b[along] - a[along]) * t, w = wa + (wb - wa) * t;
        hits.push([c - w / 2, c + w / 2, w]);
      } else {
        for (const [q, w] of [[a, wa], [b, wb]]) if (Math.abs(q[across] - e.v) < w / 2) hits.push([q[along] - Math.sqrt(Math.max(0, (w / 2) ** 2 - (q[across] - e.v) ** 2)), q[along] + Math.sqrt(Math.max(0, (w / 2) ** 2 - (q[across] - e.v) ** 2)), w]);
      }
    }
  } else if (f.center) {
    let rA, rX;   // 선 방향 반경 · 선 가로 반경
    if (f.shape === 'multi' && f.circles) {
      for (const c of f.circles) { const r = c.radius; const d = c.center[across] - e.v; near = Math.min(near, Math.abs(d) - r); if (Math.abs(d) < r) { const h = Math.sqrt(r * r - d * d); hits.push([c.center[along] - h, c.center[along] + h, 2 * h]); } }
      return { hits, near };
    }
    if (f.rx != null || f.a != null) { const rx = f.rx || f.a, ry = f.ry || f.b; rA = e.axis === 'x' ? ry : rx; rX = e.axis === 'x' ? rx : ry; }
    else { const r = f.radius != null ? f.radius : (f.r || 0); rA = rX = r; }
    const d = f.center[across] - e.v;
    near = Math.abs(d) - rX;
    if (Math.abs(d) < rX) { const h = rA * Math.sqrt(1 - (d / rX) ** 2); hits.push([f.center[along] - h, f.center[along] + h, 2 * h]); }
  } else if (f.rect) {
    const lo = f.rect[across], hi = f.rect[across + 2];
    near = Math.min(Math.abs(lo - e.v), Math.abs(hi - e.v));
    if (lo <= e.v && hi >= e.v) hits.push([f.rect[along], f.rect[along + 2], f.rect[along + 2] - f.rect[along]]);
  }
  return { hits, near };
}
const KINDS = ['rivers', 'lakes', 'ridges', 'valleys', 'forests', 'groves', 'ores', 'passes'];
const KNAME = { rivers: '강', lakes: '호수', ridges: '능선', valleys: '골짜기', forests: '숲', groves: '군락', ores: '광맥', passes: '고개' };
// 이웃 B 의 피처를 A 로컬로 옮겨 보기(참조 + 차이 — 사본을 만들지 않는다: 좌표만 계산에서 더한다)
function shiftEdge(e, A, B) {
  const za = ZONES[A], zb = ZONES[B];
  const dx = za.worldOffsetX - zb.worldOffsetX, dy = (za.worldOffsetY || 0) - (zb.worldOffsetY || 0);
  // B 로컬에서 같은 선: A 로컬 v → B 로컬 v + d
  return { ...e, v: e.v + (e.axis === 'x' ? dx : dy), a0: e.a0 + (e.axis === 'x' ? dy : dx), a1: e.a1 + (e.axis === 'x' ? dy : dx), dAlong: e.axis === 'x' ? dy : dx };
}
const rows = [], orphans = [], jumps = [], cuts = [], crossings = [];
for (const A of ZIDS) {
  const TA = J[A] || {};
  for (const e of edgesOf(A)) {
    const neigh = Object.keys(e.who).sort((a, b) => e.who[b] - e.who[a]);
    const land = neigh.filter((n) => J[n] && !ZONES[n].isOcean);
    const row = { A, side: e.side, who: neigh.map((n) => `${n}${ZONES[n] && ZONES[n].isOcean ? '(바다)' : ''}`).join('·'), kinds: {} };
    for (const k of KINDS) {
      let touch = 0, cross = 0, pair = 0;
      for (const f of (TA[k] || [])) {
        const fp = footprint(k, f, e);
        if (!(fp.near <= BAND)) continue;
        touch++;
        if (!fp.hits.length) continue;
        cross++;
        // 짝 — 너머 존 목록에서 같은 종류가 같은 선 위 **겹치는 자국**을 내는가(A 로컬 선 좌표로)
        let best = null;
        for (const B of land) {
          const eb = shiftEdge(e, A, B);
          for (const g of ((J[B] || {})[k] || [])) {
            const gp = footprint(k, g, eb);
            for (const [lo, hi, w] of gp.hits) for (const [alo, ahi, aw] of fp.hits) {
              const blo = lo - eb.dAlong, bhi = hi - eb.dAlong;   // B 선 좌표 → A 선 좌표
              const gap = Math.max(0, Math.max(alo, blo) - Math.min(ahi, bhi));
              const off = Math.abs((blo + bhi) / 2 - (alo + ahi) / 2);   // 두 자국 가운데의 어긋남(선 방향)
              // ★자국이 겹치는 몫(IoU) — 겹치긴 하는데 길이가 다르면 **경계선에서 모양이 반듯하게 잘린다**
              const inter = Math.max(0, Math.min(ahi, bhi) - Math.max(alo, blo)), uni = Math.max(ahi, bhi) - Math.min(alo, blo);
              const iou = uni > 0 ? inter / uni : 0;
              if (!best || gap < best.gap || (gap === best.gap && iou > best.iou)) best = { B, name: g.name || '', gap, w, aw, off, iou, alo, ahi, blo, bhi };
            }
          }
        }
        const [alo, ahi, aw] = fp.hits[0];
        const mid = (alo + ahi) / 2;
        crossings.push({ A, side: e.side, kind: KNAME[k], name: f.name || '', at: Math.round(mid), width: Math.round(aw), paired: !!(best && best.gap === 0), partner: best ? `${best.B}:${best.name}` : '' });
        if (best && best.gap === 0) {
          pair++;
          if (best.iou < 0.7) cuts.push({ A, side: e.side, kind: KNAME[k], name: f.name || '', B: best.B, bname: best.name, a: [Math.round(best.alo), Math.round(best.ahi)], b: [Math.round(best.blo), Math.round(best.bhi)], iou: best.iou });
          if (k === 'rivers' || k === 'valleys' || k === 'ridges') {
            const dw = Math.abs(best.w - aw) / Math.max(aw, 1), dOff = best.off / Math.max(1, Math.min(aw, best.w));
            if (dw > 0.25 || dOff > 0.25) jumps.push({ A, side: e.side, kind: KNAME[k], name: f.name || '', B: best.B, bname: best.name, wA: Math.round(aw), wB: Math.round(best.w), off: Math.round(best.off), at: Math.round(mid) });
          }
          if (k === 'forests' && best) { const g = ((J[best.B] || {}).forests || []).find((x) => (x.name || '') === best.name); const ma = f.densityMult || f.density || 1, mb = g ? (g.densityMult || g.density || 1) : null; if (mb != null && Math.abs(ma - mb) > 0.3) jumps.push({ A, side: e.side, kind: '숲', name: f.name || '', B: best.B, bname: best.name, wA: ma, wB: mb, at: Math.round(mid) }); }
        } else orphans.push({ A, side: e.side, who: row.who, kind: KNAME[k], name: f.name || '', at: Math.round(mid), width: Math.round(aw), nearest: best ? `${best.B}:${best.name || '?'} 틈 ${Math.round(best.gap)}px` : (land.length ? '같은 종류 자국 없음' : '너머가 바다') });
      }
      if (touch) row.kinds[k] = { touch, cross, pair };
    }
    rows.push(row);
  }
}
// ── 표 ──
console.log(`=== 존 경계 전수 — 띠 ±1,024px · ${ZIDS.join('·')} × 동서남북 (T408 ①) ===`);
console.log('지면 색: ' + ['hanbando', 'nippon', 'jungwon_n', 'bering'].map((z) => `${z} ${ZONES[z].groundColor}(틴트 ${ZONES[z].tintColor || '-'})`).join(' · '));
console.log('');
console.log('| 존 | 변 | 너머 | ' + KINDS.map((k) => KNAME[k]).join(' | ') + ' |');
console.log('|---|---|---|' + KINDS.map(() => '---').join('|') + '|');
for (const r of rows) console.log(`| ${r.A} | ${r.side} | ${r.who} | ` + KINDS.map((k) => { const v = r.kinds[k]; return v ? `${v.touch} / **${v.cross}** / ${v.pair}` : '·'; }).join(' | ') + ' |');
console.log('  (칸 = 띠에 닿음 / **경계를 넘음** / 너머에 짝 있음)');
console.log('');
console.log(`★짝 없이 경계를 넘는 피처 ${orphans.length}개`);
console.log('| 존 | 변 | 너머 | 종류 | 이름 | 경계선 위 자리(로컬) | 폭·지름 | 가장 가까운 너머 |');
console.log('|---|---|---|---|---|---:|---:|---|');
for (const o of orphans) console.log(`| ${o.A} | ${o.side} | ${o.who} | ${o.kind} | ${o.name} | ${o.at} | ${o.width} | ${o.nearest} |`);
console.log('');
console.log(`★짝은 있는데 경계에서 값이 뛰는 것 ${jumps.length}개(폭 25% 넘게 · 가운데가 좁은 폭의 25% 넘게 어긋남 · 숲 배수 0.3 넘게)`);
console.log('| 존 | 변 | 종류 | 이쪽 | 폭 | 너머 | 폭 | 가운데 어긋남 | 자리(로컬) |');
console.log('|---|---|---|---|---:|---|---:|---:|---:|');
for (const j of jumps) console.log(`| ${j.A} | ${j.side} | ${j.kind} | ${j.name} | ${j.wA} | ${j.B} ${j.bname} | ${j.wB} | ${j.off != null ? j.off : '-'} | ${j.at} |`);
console.log('');
console.log(`★짝은 있는데 **경계선 위 자국 길이가 다른** 것 ${cuts.length}개(IoU < 0.7 — 한쪽 모양이 선에서 반듯하게 끊긴다)`);
console.log('| 존 | 변 | 종류 | 이쪽 | 자국(로컬 선 좌표) | 너머 | 자국 | IoU |');
console.log('|---|---|---|---|---|---|---|---:|');
for (const c of cuts) console.log(`| ${c.A} | ${c.side} | ${c.kind} | ${c.name} | ${c.a[0]}~${c.a[1]} | ${c.B} ${c.bname} | ${c.b[0]}~${c.b[1]} | ${c.iou.toFixed(2)} |`);
if (argv.includes('--json')) fs.writeFileSync(argv[argv.indexOf('--json') + 1], JSON.stringify({ rows, orphans, jumps, cuts, crossings }, null, 1));
