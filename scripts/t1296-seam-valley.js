#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1296 그림 · 표 기계 · 세계 무변)
// === scripts/t1296-seam-valley.js — 한반도 ↔ 닛폰 이음매의 쇠재 · 한재: 원 고개 ↔ 골짜기 안 그림 ===
//   node scripts/t1296-seam-valley.js pic <out.png> [--variant cur|A|B|C] [--half 3000] [--px 4]
//   안(variant)은 `t1296Variants()` — 닛폰 `passes` 를 빼고 `valleys` 에 더한 판(한반도 손 0 · 이음매 `_seamOf` 그대로).
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

// 안마다 새로 싣는다(terrain.js 는 json 객체를 처음 물을 때 굳힌다)
function load(variant) {
  for (const k of Object.keys(require.cache)) if (/server[\/\\](terrain|terrain-gen|zone-config|hanbando-terrain)/.test(k)) delete require.cache[k];
  let rockNone = null;
  if (variant !== 'cur' && variant !== 'none') {
    const B = load('none');
    rockNone = (x, y) => (x < 0 ? B.T.isRockCellLocal('hanbando', x + 70016, y) : B.T.isRockCellLocal('nippon', x, y));
    for (const k of Object.keys(require.cache)) if (/server[\/\\](terrain|terrain-gen|zone-config|hanbando-terrain)/.test(k)) delete require.cache[k];
  }
  const J = require(GAME);
  const V = variants(J, rockNone)[variant];
  if (!V) throw new Error('모르는 안 ' + variant);
  J.nippon.passes = V.passes;
  J.nippon.valleys = (J.nippon.valleys || []).filter((v) => !/^(쇠재|한재)$/.test(v.name)).concat(V.valleys);
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain'));
  T.setZonesMeta(ZONES);
  T.isRockCellLocal('nippon', 16, 16);   // 지금 굳힌다(json 은 처음 물을 때 require 된다 — 다음 load 가 캐시를 바꾸기 전에)
  return { J, T, ZONES, V };
}
// 안 — 닛폰 로컬 px. 골짜기는 **잴 때마다 같은 기계로 판다**(`cut`): 한반도 짝 골짜기(쇠재 · 한재 · 폭 320 — 한반도 골짜기 24 의 폭은 모두 320)의
//   전체 방향을 경계(x = 0)까지 늘인 자리에서 출발 → 바위를 만나고 → 바위가 끝난 뒤 EXT 3칸 더(passes-to-valleys · T550 과 같은 여유).
//   `aim` 이 있으면 `bend` px 뒤부터 그 점 쪽으로 머리를 돌린다(물 · 낮은 땅 잇기). `from` 이 있으면 그 자리에서 출발(한반도 강 끝).
//   바위는 **고개 0 · 이 골짜기 0** 판(`none`)에서 잰다 — 제 구멍 안에서 "바위 아님"만 보지 않게(passes-to-valleys 주석 그대로).
const CELL = 32, EXT = 3, MAXLEN = 240, STEP = 128;
const SPECS = {
  A: { note: '곧게 동서 — 한반도 골짜기를 그대로 늘인다(T550 계산 그대로 · 기본안)', 쇠재: {}, 한재: {} },
  B: { note: '물 쪽으로 꺾기 — 쇠재를 아카하루가와 끝(4384, 41768) 쪽으로 · 한재는 A(히로호가 정동이라 곧게가 곧 물 쪽)', 쇠재: { bend: 384, aim: [4384, 41768] }, 한재: {} },
  C: { note: '강 틈(물길) — 한재를 한반도 수라천 끝에서 히로호까지 비스듬히(이음매를 비스듬히 건넌다) · 쇠재는 A', 쇠재: {}, 한재: { from: 'hanbando:수라천', aim: [4475, 60096] } },
};
// 옛 꼴(main 4d793bce 까지의 닛폰 `passes` 그대로) — 정본 json 이 골짜기로 바뀐 뒤에도 '지금'(cur) 그림 · 안 계산이 같은 출발을 쓰게 여기 적어 둔다
const OLD_PASSES = [{ name: '쇠재', pos: [-216, 40000], radius: 1850 }, { name: '한재', pos: [-216, 60000], radius: 1850 }];
function variants(J, rockNone) {
  const P = OLD_PASSES.map((q) => Object.assign({}, q));
  const out = { cur: { passes: P, valleys: [], note: '지금(원 고개 둘 · 반지름 1850)' },
    none: { passes: [], valleys: [], note: '고개 0 · 골짜기 0(바닥 — 뚫린 칸 견줌용)' } };
  if (!rockNone) return out;
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const DX = ZONES.nippon.worldOffsetX - ZONES.hanbando.worldOffsetX, DY = (ZONES.nippon.worldOffsetY || 0) - (ZONES.hanbando.worldOffsetY || 0);
  for (const [k, S] of Object.entries(SPECS)) {
    const vs = [], rows = [];
    for (const q of P) {
      const sp = S[q.name] || {};
      const hv = (J.hanbando.valleys || []).find((v) => v.name === q.name);
      const w = hv.path[hv.path.length - 1].width;
      let sx, sy, ux, uy;
      if (sp.from) {
        const [Zf, nm] = sp.from.split(':'); const rv = J[Zf].rivers.find((r) => r.name === nm); const e = rv.path[0].pos || rv.path[0];
        const e2 = (rv.path[rv.path.length - 1].pos || rv.path[rv.path.length - 1]);
        const end = Math.abs(e[0] - 70016) < Math.abs(e2[0] - 70016) ? e : e2;   // 이음매 쪽 끝
        sx = end[0] - DX; sy = end[1] - DY;
        const L = Math.hypot(sp.aim[0] - sx, sp.aim[1] - sy); ux = (sp.aim[0] - sx) / L; uy = (sp.aim[1] - sy) / L;
      } else {
        const Hp = hv.path.map((p) => [p.pos[0] - DX, p.pos[1] - DY]);
        const a = Hp[0], b = Hp[Hp.length - 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; ux = (b[0] - a[0]) / L; uy = (b[1] - a[1]) / L;
        const t0 = (0 - b[0]) / (ux || 1e-9); sx = b[0] + ux * t0; sy = b[1] + uy * t0;
      }
      // 걸음: 칸 반 단위로 나아가며 바위를 본다 · 머리는 bend 뒤 aim 쪽으로(한 번에 돌리지 않고 걸음마다 10%씩)
      let x = sx, y = sy, seen = false, clear = 0, ended = false, walked = 0;
      const pts = [[sx, sy]]; let lastPt = 0;
      for (let k2 = 0; k2 < MAXLEN * 2; k2++) {
        if (sp.aim && walked >= (sp.bend || 0)) {
          const L = Math.hypot(sp.aim[0] - x, sp.aim[1] - y) || 1; const tx = (sp.aim[0] - x) / L, ty = (sp.aim[1] - y) / L;
          ux += (tx - ux) * 0.1; uy += (ty - uy) * 0.1; const n = Math.hypot(ux, uy); ux /= n; uy /= n;
        }
        x += ux * CELL / 2; y += uy * CELL / 2; walked += CELL / 2;
        if (rockNone(x, y)) { seen = true; clear = 0; } else if (seen && ++clear >= EXT * 2) { ended = true; }
        if (walked - lastPt >= STEP || ended) { pts.push([x, y]); lastPt = walked; }
        if (ended) break;
      }
      if (!ended) { rows.push(`${q.name}: ${MAXLEN}칸 안에 바위가 안 끝난다`); continue; }
      vs.push({ name: q.name, path: pts.map((p) => ({ pos: [Math.round(p[0]), Math.round(p[1])], width: w })) });
      rows.push(`${q.name}: (${pts[0].map(Math.round)}) → (${pts[pts.length - 1].map(Math.round)}) · ${Math.round(walked / CELL)}칸 · 폭 ${w}`);
    }
    out[k] = { passes: [], valleys: vs, note: S.note, rows };
  }
  return out;
}
module.exports = { load, variants };

if (require.main === module && argv[0] === 'pic') {
  const { PNG } = require('pngjs');
  const OUT = argv[1];
  const variant = val('--variant', 'cur');
  const HALF = +val('--half', 3000), PX = +val('--px', 4);
  const { J, T, ZONES } = load(variant);
  const T0 = load('none').T;   // 뚫린 칸 = 바닥에선 바위 · 이 안에선 아님
  const HB = ZONES.hanbando, NP = ZONES.nippon, SZ = 32;
  const seamX = NP.worldOffsetX;
  const ys = (J.nippon.passes.length ? J.nippon.passes.map((p) => p.pos[1]) : [40000, 60000]).map((y) => y + NP.worldOffsetY);
  const ys2 = [40000 + NP.worldOffsetY, 60000 + NP.worldOffsetY];
  const N = Math.round(2 * HALF / SZ);
  const W = N * PX, H = N * PX * 2 + 8;
  const png = new PNG({ width: W, height: H });
  const col = { land: [214, 200, 160], rock: [92, 84, 80], water: [70, 120, 200], open: [240, 150, 60], seam: [220, 30, 30] };
  const put = (x, y, c) => { const i = (y * W + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255; };
  for (let k = 0; k < 2; k++) {
    const y0w = ys2[k] - HALF, x0w = seamX - HALF;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = x0w + i * SZ + SZ / 2, wy = y0w + j * SZ + SZ / 2;
      const Z = wx < seamX ? 'hanbando' : 'nippon', Zm = ZONES[Z];
      const lx = wx - Zm.worldOffsetX, ly = wy - Zm.worldOffsetY;
      let c = col.land;
      if (T.isWaterCellLocal(Z, lx, ly)) c = col.water; else if (T.isRockCellLocal(Z, lx, ly)) c = col.rock; else if (T0.isRockCellLocal(Z, lx, ly)) c = col.open;
      for (let a = 0; a < PX; a++) for (let b = 0; b < PX; b++) put(i * PX + a, k * (N * PX + 8) + j * PX + b, c);
    }
    for (const [Z, vs] of [['hanbando', J.hanbando.villages], ['nippon', J.nippon.villages]]) for (const v of vs || []) {
      const p = v.pos || [v.x, v.y], wx = p[0] + ZONES[Z].worldOffsetX, wy = p[1] + ZONES[Z].worldOffsetY;
      const i = Math.floor((wx - x0w) / SZ), j = Math.floor((wy - y0w) / SZ);
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      for (let a = -2 * PX; a <= 2 * PX; a++) for (let b = -2 * PX; b <= 2 * PX; b++) { const X = i * PX + a, Y = j * PX + b; if (X >= 0 && X < W && Y >= 0 && Y < N * PX) put(X, k * (N * PX + 8) + Y, [200, 20, 160]); }
    }
    // 교역로(`routes` 판 json · --routes) — 한반도 구간 ptsA(한반도 로컬) · 닛폰 구간 ptsB(닛폰 로컬) · 초록 선
    const RJ = val('--routes', null);
    if (RJ) for (const r of JSON.parse(fs.readFileSync(RJ, 'utf8')).rows) {
      const P2 = r.ptsA.map((q) => [q.x + HB.worldOffsetX, q.y + HB.worldOffsetY]).concat(r.ptsB.map((q) => [q.x + NP.worldOffsetX, q.y + NP.worldOffsetY]));
      for (let m = 1; m < P2.length; m++) { const [ax, ay] = P2[m - 1], [bx, by] = P2[m]; const L = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 8));
        for (let t = 0; t <= L; t++) { const X = Math.floor((ax + (bx - ax) * t / L - x0w) / SZ * PX), Y = Math.floor((ay + (by - ay) * t / L - y0w) / SZ * PX);
          if (X >= 0 && X < W && Y >= 0 && Y < N * PX) put(X, k * (N * PX + 8) + Y, [20, 150, 40]); } }
    }
    const sx = Math.round((seamX - x0w) / SZ) * PX;
    for (let y = 0; y < N * PX; y += 3) put(sx, k * (N * PX + 8) + y, col.seam);
  }
  fs.writeFileSync(OUT, PNG.sync.write(png));
  console.log('그림', OUT, W + '×' + H);
}

// node scripts/t1296-seam-valley.js apply <A|B|C> [--file <json>] — 그 안을 정본 json 에 적는다(닛폰 `passes` · `valleys` 만 · 다른 존은 디스크 그대로)
if (require.main === module && argv[0] === 'apply') {
  const variant = argv[1];
  const FILE = val('--file', GAME);
  const { V } = load(variant);
  const _strip = (v) => Array.isArray(v) ? v.map(_strip) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== '_bbox' && k !== '_segIdx').map(([k, x]) => [k, _strip(x)])) : v;
  const disk = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const before = disk.nippon.passes.length;
  disk.nippon.passes = _strip(V.passes);
  disk.nippon.valleys = (disk.nippon.valleys || []).filter((v) => !/^(쇠재|한재)$/.test(v.name)).concat(_strip(V.valleys));
  fs.writeFileSync(FILE, JSON.stringify(disk));
  console.log(`적음 ${path.relative(ROOT, FILE)}: 안 ${variant} — 닛폰 고개 ${before} → ${disk.nippon.passes.length} · 골짜기 +${V.valleys.length}`);
  for (const r of V.rows || []) console.log('  ' + r);
}

// node scripts/t1296-seam-valley.js routes <out.json> — 정본 교역로(xzone-geo `crossGeo` · splitR = 정보 반경 · 존 서버 경계 호스트와 같은 한 벌)가
//   (`--all` = 정보 반경 밖 쌍까지 전 쌍 — T1311) 한반도 → 닛폰 이음매를 **어디서** 넘는가(경계 칸 y) · 쇠재 · 한재 자리(±2,500px)를 지나는 쌍과 그 길(그림 재료). 지금 트리의 json 으로 잰다.
if (require.main === module && argv[0] === 'routes') {
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  process.env.DB_PATH = process.env.DB_PATH || `/tmp/t1296-routes-${process.pid}.db`;
  const T525 = require(path.join(ROOT, 'scripts', 't525-cross-zone.js'));
  const XG = require(path.join(ROOT, 'server', 'xzone-geo.js'));
  const { vil } = T525.frameOf(['hanbando', 'nippon']);
  const ros = (Z) => vil.filter((v) => v.zone === Z).map((v) => ({ name: v.name, cx: v.ccx, cy: v.ccy }));
  const g = XG.crossGeo({ A: 'hanbando', rosterA: ros('hanbando'), B: 'nippon', rosterB: ros('nippon'), splitR: argv.includes('--all') ? Infinity : T525.INFO_R });   // ★[T1311] `--all` = 걸어 닿는 전 쌍(존 서버가 늦게 파는 쌍까지 · T1139 lazySplit 과 같은 함수)
  const rows = [];
  for (const a in g.split) for (const b in g.split[a]) { const e = g.split[a][b]; rows.push({ a, b, d: g.dist[a][b], y: e.ptA.y, ptsA: e.ptsA, ptsB: e.ptsB }); }
  const band = (y) => (Math.abs(y - 40000) <= 2500 ? '쇠재' : Math.abs(y - 60000) <= 2500 ? '한재' : '그 밖');
  const cnt = {}; for (const r of rows) { r.at = band(r.y); cnt[r.at] = (cnt[r.at] || 0) + 1; }
  fs.writeFileSync(argv[1], JSON.stringify({ routed: g.routed, failed: g.failed, cnt, rows }));
  console.log(`교역로(걸음 ≤ 정보 반경) ${g.routed}쌍 · 못 판 ${g.failed} · 넘는 자리 ${JSON.stringify(cnt)} · BFS ${g.ms.bfs}ms · 길 ${g.ms.route}ms`);
  for (const r of rows.filter((x) => x.at !== '그 밖').slice(0, 40)) console.log(`  ${r.at} ${r.a} → ${r.b} · 걸음 ${r.d} · 경계 y ${r.y}`);
}
