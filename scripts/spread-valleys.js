#!/usr/bin/env node
// === scripts/spread-valleys.js — 산맥마다 계곡을 **고르게** 놓는다 ===
//
// ★[11차 재민 지시] "일단 산맥 골고루 계곡 추가해봐"
//   실측 현황(계곡 9개): 한울대간 4,394셀에 6개(간격 732셀)인데 향목·먹뫼·솔재·너울산맥은
//   합쳐 6,726셀인데 **하나도 없다**. 벽산맥·눈벌산령·도산맥도 0. 넘을 데가 없는 벽이다.
//
// 규칙
//   · 목표 간격 SPACING(기본 600셀) — 산맥 길이를 나눠 그 지점마다 하나. 짧은 산맥도 최소 1개.
//   · 기존 계곡에서 MINSEP(기본 250셀) 안이면 건너뛴다 — 지난번에 셋이 90셀 안에 몰려 혼났다.
//   · 자르는 축은 능선 접선에 **수직**. 물을 만나면 각도를 ±10/20/30° 틀고, 그래도 안 되면
//     능선을 따라 ±20·±40셀 옮겨 다시 시도한다(계곡은 바위만 연다 — 강은 이미 제 협곡이 있다).
//   · 존 경계에 닿으면 거기서 끝낸다(이웃이 바다 → 바다로 열리는 골짜기).
//
// 실행: node scripts/spread-valleys.js [--spacing 600] [--minsep 250] [--width 10] [--apply]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const ZID = val('--zone', 'hanbando');
const SPACING = parseFloat(val('--spacing', '600'));
const MINSEP = parseFloat(val('--minsep', '250'));
const WCELL = parseFloat(val('--width', '10'));
const CELL = 32, EXT = 3, MAXLEN = 200;
const ZW = 2188, ZH = 4063;

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = require(GAME);           // ★terrain.js와 같은 객체를 공유해야 판정이 현재 상태를 본다
const d = world[ZID];
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const rock = (x, y) => terrain.isRockCellLocal(ZID, x * CELL + 16, y * CELL + 16);
const water = (x, y) => terrain.isWaterCellLocal(ZID, x * CELL + 16, y * CELL + 16);
const P = (p) => p.pos ? p.pos : [p.x, p.y];

// 산맥별 이름 풀 — 실제 그 지방 고개 이름. 모자라면 「○○고개N」
const NAMES = {
  한울대간: ['돌계재', '진부령', '만항재', '백복령', '이화령', '육십령'],
  향목산맥: ['붉덕재', '아슴재', '우현령'],
  먹뫼산맥: ['미르재', '먹뫼재', '너럭재', '수안령'],
  솔재산맥: ['솔재', '너구리재', '돌배재', '갈치'],
  너울산맥: ['미리재', '너래재', '고미재', '구절재'],
  눈메산맥: ['무산령', '차유령'],
  옥산맥: ['옥치', '두치'],
  화산맥: ['화치', '솔재'],
  벽산맥: ['벽치'],
  눈벌산령: ['눈벌재'],
  도산맥: ['도령재'],
};

const ridges = (d.ridges || []).filter((r) => !r._mirroredFrom && r.path && r.path.length > 1);
d.valleys = d.valleys || [];
const used = new Set(d.valleys.map((v) => v.name));

// 능선 위 누적 거리 표
function arc(r) {
  const pts = r.path.map(P), acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, acc, total: acc[acc.length - 1] };
}
// 누적거리 s(px) 위치의 점과 접선
function at(a, s) {
  let i = 1; while (i < a.acc.length - 1 && a.acc[i] < s) i++;
  const t = (s - a.acc[i - 1]) / Math.max(1, a.acc[i] - a.acc[i - 1]);
  const p0 = a.pts[i - 1], p1 = a.pts[i];
  return { x: p0[0] + (p1[0] - p0[0]) * t, y: p0[1] + (p1[1] - p0[1]) * t, tx: p1[0] - p0[0], ty: p1[1] - p0[1] };
}
// 한 지점에서 수직 절개를 시도 — 되면 4점 경로
function cutAt(px, py, tx, ty) {
  const tl = Math.hypot(tx, ty) || 1;
  const nx0 = -ty / tl, ny0 = tx / tl;
  for (const deg of [0, 10, -10, 20, -20, 30, -30]) {
    const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const nx = nx0 * ca - ny0 * sa, ny = nx0 * sa + ny0 * ca;
    const ends = [];
    for (const sgn of [+1, -1]) {
      let out = null, wet = false;
      for (let s = 1; s <= MAXLEN; s++) {
        const x = Math.round(px / CELL + nx * sgn * s), y = Math.round(py / CELL + ny * sgn * s);
        if (x < 0 || y < 0 || x >= ZW || y >= ZH) { out = s; break; }
        if (water(x, y)) { wet = true; break; }
        if (!rock(x, y)) { out = s + EXT; break; }
      }
      if (out == null || wet) { ends.length = 0; break; }
      ends.push(out);
    }
    if (ends.length !== 2) continue;
    if (ends[0] + ends[1] < 12) continue;   // ★2셀짜리 '계곡'은 산맥이 존 밖으로 나간 자리다 — 자를 게 없다
    const bend = Math.min(4, (ends[0] + ends[1]) / 10);
    const pt = (s, off) => [
      Math.round(px / CELL + nx * s + (tx / tl) * off),
      Math.round(py / CELL + ny * s + (ty / tl) * off),
    ];
    const pts = [pt(ends[0], 0), pt(ends[0] * 0.33, bend), pt(-ends[1] * 0.33, -bend), pt(-ends[1], 0)];
    // ★끝점이 존 밖이면 버린다 — 경계 밖 좌표는 게임이 못 읽고, 절반이 지도 밖인 계곡이 된다
    if (pts.some((q) => q[0] < 0 || q[1] < 0 || q[0] >= ZW || q[1] >= ZH)) continue;
    return { pts, len: ends[0] + ends[1], deg };
  }
  return null;
}
// 어떤 산맥의 몸통 안인가(계곡을 산맥에 귀속시키는 판정 — 이격 규칙이 산맥별로 달라야 한다)
function ridgeOf(px, py) {
  for (const r of ridges) {
    for (let i = 0; i < r.path.length - 1; i++) {
      const a = P(r.path[i]), b = P(r.path[i + 1]);
      const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
      let t = ((px - a[0]) * vx + (py - a[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const hw = (r.path[i].width + (r.path[i + 1].width - r.path[i].width) * t) / 2;
      if (Math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t)) < hw) return r.name;
    }
  }
  return null;
}
// 기존 계곡과의 최단 거리(셀) — **같은 산맥**과 그 외를 나눠 돌려준다.
//   같은 산맥이면 촘촘하면 안 된다(격자가 된다). 다른 산맥이면 가까워도 별개의 길이라 상관없다
//   — 산맥 둘이 만나는 곳에서는 서로 다른 산을 넘는 두 고개가 이웃하는 게 정상이다.
function sepFrom(pts, ridgeName) {
  let same = Infinity, any = Infinity;
  for (const v of d.valleys) {
    const c = P(v.path[Math.floor(v.path.length / 2)]);
    const host = ridgeOf(c[0], c[1]);
    for (const q of v.path) for (const p of pts) {
      const dd = Math.hypot(P(q)[0] / CELL - p[0], P(q)[1] / CELL - p[1]);
      if (dd < any) any = dd;
      if (host === ridgeName && dd < same) same = dd;
    }
  }
  return { same, any };
}

console.log('=== 산맥별 계곡 고르게 · ' + ZID + ' · 목표 간격 ' + SPACING + '셀 · 최소 이격 ' + MINSEP + '셀'
  + (APPLY ? ' · 기록' : ' · 계산만') + ' ===');

const made = [];
for (const r of ridges) {
  const a = arc(r);
  const Lc = a.total / CELL;
  const want = Math.max(1, Math.round(Lc / SPACING));
  const pool = (NAMES[r.name] || []).filter((n) => !used.has(n));
  const rows = [];
  for (let k = 1; k <= want; k++) {
    const s0 = a.total * (k / (want + 1));
    let got = null;
    for (const nudge of [0, 20, -20, 40, -40, 60, -60]) {   // 능선을 따라 밀어 가며 재시도
      const s = s0 + nudge * CELL;
      if (s < a.total * 0.05 || s > a.total * 0.95) continue;
      const q = at(a, s);
      const c = cutAt(q.x, q.y, q.tx, q.ty);
      if (!c) continue;
      const sp = sepFrom(c.pts, r.name);
      if (sp.same < MINSEP) { got = { skip: '같은 산맥 계곡과 ' + Math.round(sp.same) + '셀' }; break; }
      if (sp.any < 60) { got = { skip: '다른 계곡과 ' + Math.round(sp.any) + '셀 — 너무 붙는다' }; break; }
      got = c; break;
    }
    if (!got) { rows.push('  · ' + Math.round(s0 / CELL) + '셀 지점 — 자리 못 찾음(물/길이)'); continue; }
    if (got.skip) { rows.push('  · ' + Math.round(s0 / CELL) + '셀 지점 — 건너뜀(' + got.skip + ')'); continue; }
    const name = pool.shift() || (r.name.replace(/산맥|대간|산령/, '') + '고개' + k);
    used.add(name);
    const rec = { name, ridge: r.name, pts: got.pts, len: got.len, deg: got.deg };
    made.push(rec);
    // 이격 계산이 이번에 만든 것도 보게 즉시 반영
    d.valleys.push({ name, path: got.pts.map((p) => ({ pos: [p[0] * CELL + 16, p[1] * CELL + 16], width: WCELL * CELL })) });
    rows.push('  · 「' + name + '」 ' + got.pts[0].join(',') + ' → ' + got.pts[3].join(',') + ' · ' + got.len + '셀'
      + (got.deg ? ' (축 ' + got.deg + '° 틀어)' : ''));
  }
  const have = d.valleys.filter((v) => (NAMES[r.name] || []).includes(v.name)).length;
  console.log(r.name + ' — 길이 ' + Math.round(Lc) + '셀 · 목표 ' + want + '개');
  for (const t of rows) console.log(t);
}

console.log('\n새 계곡 ' + made.length + '개 · 합계 ' + d.valleys.length + '개');
if (!APPLY) { console.log('계산만 — 쓰려면 --apply'); process.exit(0); }
fs.copyFileSync(GAME, GAME + '.bak');
fs.writeFileSync(GAME, JSON.stringify(world));
console.log('★기록 완료 (백업 .bak) — 도달성 감사를 이어서 돌릴 것');
