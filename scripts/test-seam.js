#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-seam.js — 존 경계 접합 하네스 [T408 2026-09-26] ==========================
//
// 주장 넷:
//   ① **서버·클라 거울이 경계에서 같은 답을 낸다** — `server/terrain.js` 와 `public/terrain.js` 가
//      경계 띠 표본에서 물·바위·숲배수를 비트로 같게 낸다(한쪽만 고치면 **보이지 않는 벽**이 생긴다).
//   ② **경계 양쪽이 같은 합을 본다** — 경계선을 사이에 둔 두 칸(±16px)이 서로 다른 존에 속해도
//      이웃 피처가 선을 넘으면 양쪽이 **둘 다** 본다(짝 없는 골짜기 넷이 선에서 끝나지 않는다).
//   ③ **개체는 제 땅에만** — 존 끝 청크가 존 밖에 개체를 0 낸다.
//   ④ **안쪽은 무변** — 경계에서 먼 청크 표본의 산출이 참조 0 판과 같다(자명 통과 금지: 참조가
//      **있는** 존이어야 하고, 참조를 비우면 ② 가 실제로 빨개진다).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const S = require(path.join(ROOT, 'server', 'terrain'));
if (S.setZonesMeta) S.setZonesMeta(ZONES);
const J = require(path.join(ROOT, 'server', 'hanbando-terrain.json'));
// 클라 거울 — 브라우저처럼 존 정본을 `setHardcoded` 로 받는다(99-main 이 `/terrain.json` 으로 하는 그것)
const C = require(path.join(ROOT, 'public', 'terrain.js'));
C.setZonesMeta(ZONES);
for (const [zid, data] of Object.entries(J)) C.setHardcoded(zid, data);
const chunk = require(path.join(ROOT, 'server', 'chunk'));
const cs = chunk.CHUNK_SIZE;
console.log('\n=== 존 경계 접합 — 거울 · 합 · 제 땅 · 안쪽 무변 ===');

// ── 전제 — 참조가 실제로 있다(0 이면 아래가 전부 자명 통과다)
const seamN = (T, zid) => { const s = (T.ZONE_TERRAIN[zid] || {}).seam || {}; return ['water', 'ridges', 'valleys', 'passes', 'forests'].reduce((a, k) => a + ((s[k] || []).length), 0); };
ok(seamN(S, 'hanbando') > 0 && seamN(S, 'nippon') > 0, '전제 — 한반도·닛폰에 이웃 참조가 있다', `한반도 ${seamN(S, 'hanbando')} · 닛폰 ${seamN(S, 'nippon')}`);
ok(seamN(C, 'hanbando') === seamN(S, 'hanbando') && seamN(C, 'nippon') === seamN(S, 'nippon'), '거울의 참조 수가 서버와 같다',
   `클라 ${seamN(C, 'hanbando')}/${seamN(C, 'nippon')}`);

// ── ① 거울 — 경계 띠(각 변 2,048px) 표본 · 비-셀중심 점
let s = 20260926; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let n = 0, diff = 0, yes = 0;
for (const zid of ['hanbando', 'nippon', 'jungwon_n']) {
  const Z = ZONES[zid];
  for (let i = 0; i < 4000; i++) {
    const side = i % 4, t = rnd(), d = rnd() * 2048;
    const x = side === 0 ? d : side === 1 ? Z.zoneWidth - d : t * Z.zoneWidth;
    const y = side === 2 ? d : side === 3 ? Z.zoneHeight - d : t * Z.zoneHeight;
    const a = [S.isWaterCellLocal(zid, x, y), S.isRockCellLocal(zid, x, y), S.getForestMultiplier(zid, x, y)];
    const b = [C.isWaterCellLocal(zid, x, y), C.isRockCellLocal(zid, x, y), C.getForestMultiplier(zid, x, y)];
    n++; if (a[0] || a[1] || a[2] > 1.5) yes++;
    if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) diff++;
  }
}
ok(diff === 0 && yes > 1000, `① 서버·클라 거울이 경계 띠 ${n.toLocaleString()}점에서 같은 답`, `다른 답 ${diff} · 참(물·바위·숲) ${yes}`);

// ── ② 합 — 짝 없던 골짜기 넷이 **너머 존 땅에서도** 골짜기다(선 너머 16~200px)
const HB = ZONES.hanbando, NP = ZONES.nippon, JN = ZONES.jungwon_n;
const valleyAt = (zid, name) => (J[zid].valleys || []).find((v) => v.name === name);
const cases = [['쇠재', 'hanbando', 'nippon'], ['한재', 'hanbando', 'nippon'], ['도령재', 'hanbando', 'jungwon_n']];
let cross = 0, open = 0, why = [];
for (const [nm, A, B] of cases) {
  const v = valleyAt(A, nm); if (!v) continue;
  const ZA = ZONES[A], ZB = ZONES[B];
  // 골짜기 path 에서 **너머 존 땅**에 떨어지는 점을 찾는다(A 로컬 → 세계 → B 로컬)
  for (const p of v.path) {
    const [lx, ly] = p.pos; const wx = ZA.worldOffsetX + lx, wy = ZA.worldOffsetY + ly;
    const bx = wx - ZB.worldOffsetX, by = wy - ZB.worldOffsetY;
    if (bx < 0 || by < 0 || bx >= ZB.zoneWidth || by >= ZB.zoneHeight) continue;
    cross++;
    // 너머 존에서 그 자리가 **벽이 아닌가**(골짜기가 선에서 막히지 않는다).
    //   ⚠1차 판은 "옆(±300)이 바위"까지 물었는데 **둘 다 공짜가 아니었다** — 실측: 쇠재·한재 너머는
    //     닛폰 **고개**(원 r 1,850 · 같은 이름)가 이미 열어 두었고, 도령재 너머(중원북)엔 능선이 없다.
    //     즉 짝 없는 골짜기 넷은 벽이 아니다. 선의 이음새는 ②b(양쪽 같은 답)가 잰다.
    if (!S.isRockCellLocal(B, bx, by)) open++; else why.push(`${nm}@${B}(${Math.round(bx)},${Math.round(by)})`);
  }
}
ok(cross > 0 && open === cross, `② 짝 없던 골짜기 너머 칸이 벽이 아니다`, `너머에 떨어진 골짜기 점 ${cross} · 열림 ${open}${why.length ? ' · 막힘 ' + why.slice(0, 3).join(' ') : ''}`);
// ②b 선 양쪽 같은 답 — 경계선 ±16px 두 칸(서로 다른 존)의 물·바위·숲이 **같은 합**에서 나온다:
//     한쪽 존으로 선 너머 칸을 물으면(존 밖 좌표) 그 존은 이제 이웃 피처로 답한다 — 선 양쪽 답이 이어진다
let pairs = 0, same = 0;
for (let i = 0; i < 3000; i++) {
  const y = rnd() * HB.zoneHeight;
  const hx = HB.zoneWidth - 16, nx = 16;                  // 한반도 쪽 칸 · 닛폰 쪽 칸(같은 세계 y)
  const ny = y + (HB.worldOffsetY - NP.worldOffsetY);
  const q = (zid, x, yy) => `${S.isWaterCellLocal(zid, x, yy) ? 1 : 0}${S.isRockCellLocal(zid, x, yy) ? 1 : 0}${S.getForestMultiplier(zid, x, yy) > 1.5 ? 1 : 0}`;
  const a = q('hanbando', hx + 32, y), b = q('nippon', nx, ny);   // 한반도가 선 너머 16px 를 물은 답 = 닛폰이 그 칸을 물은 답
  pairs++; if (a === b) same++;
}
ok(same === pairs, `②b 선 너머 칸을 이쪽 존에 물어도 저쪽 존의 답과 같다(물·바위·숲)`, `${same}/${pairs}`);

// ── ③ 제 땅 — 존 끝 청크의 개체가 존 밖에 0
let outside = 0, edgeEnts = 0;
for (const zid of ['hanbando', 'nippon', 'jungwon_n']) {
  const Z = ZONES[zid], cx1 = Math.ceil(Z.zoneWidth / cs) - 1, cy1 = Math.ceil(Z.zoneHeight / cs) - 1;
  for (let cy = 0; cy <= cy1; cy += 3) for (const cx of [cx1]) {
    for (const r of chunk.generateChunkResources(zid, Z.biome, cx, cy, cs, null, 0).concat(chunk.overflowInto(zid, Z.biome, cx, cy, cs, null, 0))) {
      edgeEnts++; if (r.x < 0 || r.y < 0 || r.x >= Z.zoneWidth || r.y >= Z.zoneHeight) outside++;
    }
  }
}
ok(edgeEnts > 1000 && outside === 0, `③ 존 끝 청크 개체 ${edgeEnts.toLocaleString()} 중 존 밖 0`, `존 밖 ${outside}`);

// ── ④ 안쪽 무변 — 본 판정은 청크 해시 게이트(`scripts/t408-seam-gate.js` · 까닭 없는 바뀐 청크 0).
//   여기서는 표본 청크 수만 세고, **참조 상자가 존 안쪽 깊이 들어오는 것**을 적어 둔다.
let inner = 0;
for (const zid of ['hanbando', 'nippon']) { const Z = ZONES[zid]; const cx1 = Math.ceil(Z.zoneWidth / cs), cy1 = Math.ceil(Z.zoneHeight / cs);
  for (let cy = 10; cy < cy1 - 10; cy += 7) for (let cx = 10; cx < cx1 - 10; cx += 7) inner++; }
// (④ 의 본 판정은 청크 해시 게이트 `scripts/t408-seam-gate.js` 가 한다 — 까닭 없는 바뀐 청크 0.
//   여기서는 **참조 상자가 존 안쪽 깊이 들어오는 것**의 수를 적어 둔다.)
let deep = 0; const deepNames = [];
for (const zid of ['hanbando', 'nippon']) {
  const Z = ZONES[zid], sm = S.ZONE_TERRAIN[zid].seam;
  for (const k of ['water', 'ridges', 'valleys', 'passes', 'forests']) for (const r of sm[k]) {
    const f = r.f; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const pts = f.path ? f.path.map((p) => p.pos || p) : (f.center ? [f.center] : (f.pos ? [f.pos] : []));
    for (const [x, y] of pts) { x0 = Math.min(x0, x - r.dx); x1 = Math.max(x1, x - r.dx); y0 = Math.min(y0, y - r.dy); y1 = Math.max(y1, y - r.dy); }
    const depth = Math.max(Math.min(x1, Z.zoneWidth) - Math.max(x0, 0), 0) > 0 ? Math.min(Math.max(0, x1), Z.zoneWidth - Math.max(0, x0)) : 0;
    if (depth > 10 * cs && f.center) { deep++; if (deepNames.length < 4) deepNames.push(`${zid}←${r.from}:${f.name}`); }
  }
}
ok(inner > 50, `④ 안쪽 표본 청크 ${inner} — 본 판정은 청크 해시 게이트(t408-seam-gate: 까닭 없는 바뀐 청크 0)`, deep ? `깊이 10청크 넘는 참조 중심 ${deep}: ${deepNames.join(' ')}` : '');

// ── 자명 통과 금지 — 두 존의 참조를 비우면(= T408 전) ②b 가 빨개진다
const TH = S.ZONE_TERRAIN.hanbando, TN = S.ZONE_TERRAIN.nippon; const kh = TH.seam, kn = TN.seam;
TH.seam = TN.seam = { water: [], ridges: [], valleys: [], passes: [], forests: [] };
let sameOff = 0, pairsOff = 0; s = 20260926;
for (let i = 0; i < 3000; i++) {
  const y = rnd() * HB.zoneHeight, ny = y + (HB.worldOffsetY - NP.worldOffsetY);
  const q = (zid, x, yy) => `${S.isWaterCellLocal(zid, x, yy) ? 1 : 0}${S.isRockCellLocal(zid, x, yy) ? 1 : 0}${S.getForestMultiplier(zid, x, yy) > 1.5 ? 1 : 0}`;
  pairsOff++; if (q('hanbando', HB.zoneWidth + 16, y) === q('nippon', 16, ny)) sameOff++;
}
TH.seam = kh; TN.seam = kn;
ok(sameOff < pairsOff, '★자명 통과 금지 — 참조를 비우면(T408 전) 선 양쪽 답이 **갈린다**', `같음 ${sameOff}/${pairsOff}`);

// ── ⑤ [T1296 2026-11-13 · 재민 "연결통로가 원모양인 게 어색하다"] 이음매 고개 둘(쇠재 · 한재)은 **골짜기**(선형 통로)다
//   11차 캐논: 골짜기 = 산맥을 가로지르는 path + width · 반지름 50셀짜리 원처럼 산을 통째로 지우지 않는다. 닛폰 고개 둘만 옛 원(r 1,850)으로 남아
//   한반도 동쪽 끝 산맥 띠를 이음매(T408)로 지름 114칸 뚫었다. ⑤a 원 고개 0 · ⑤b 두 이름 = 닛폰 골짜기(폭 = 한반도 짝 골짜기 폭) ·
//   ⑤c 이음매 열(선 ±16px 두 칸)에서 그 골짜기가 연 틈 = 폭/32 + 2칸 이하(원이면 114) · ⑤d 산 띠를 **실제로** 꿰뚫는다(골짜기 둘레 창 안 4방 BFS · 서 → 동).
const SEAMX = HB.zoneWidth;   // 한반도 로컬 x = 닛폰 로컬 0
const openW = (wx, wy) => {   // 세계 px → 주인 존 술어(물 · 바위 아님)
  const zid = wx < NP.worldOffsetX ? 'hanbando' : 'nippon', Z = ZONES[zid], lx = wx - Z.worldOffsetX, ly = wy - Z.worldOffsetY;
  return !S.isWaterCellLocal(zid, lx, ly) && !S.isRockCellLocal(zid, lx, ly);
};
const _gap = (wyCross) => {   // 이음매 열에서 wyCross 를 품은 열린 칸 줄의 길이(칸) — 두 칸(선 ±16) 다 열려야 열림
  const ok2 = (wy) => openW(NP.worldOffsetX - 16, wy) && openW(NP.worldOffsetX + 16, wy);
  const c0 = Math.floor(wyCross / 32) * 32 + 16; if (!ok2(c0)) return 0;
  let n = 1; for (let y = c0 - 32; ok2(y) && n < 400; y -= 32) n++; for (let y = c0 + 32; ok2(y) && n < 400; y += 32) n++; return n;
};
const _through = (v) => {   // 골짜기 둘레 창(이음매 ±2,400 · 골짜기 y 범위 ±600) 안에서 서쪽 끝 열 → 동쪽 끝 열 4방 BFS
  const ys = v.path.map((p) => p.pos[1] + NP.worldOffsetY), x0 = NP.worldOffsetX - 2400, x1 = NP.worldOffsetX + 2400;
  const y0 = Math.min(...ys) - 600, y1 = Math.max(...ys) + 600, NX = Math.ceil((x1 - x0) / 32), NY = Math.ceil((y1 - y0) / 32);
  const op = new Uint8Array(NX * NY); for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) op[j * NX + i] = openW(x0 + i * 32 + 16, y0 + j * 32 + 16) ? 1 : 0;
  const seen = new Uint8Array(NX * NY), q = []; for (let j = 0; j < NY; j++) if (op[j * NX]) { seen[j * NX] = 1; q.push(j * NX); }
  for (let h = 0; h < q.length; h++) { const c = q[h], i = c % NX, j = (c - i) / NX; if (i === NX - 1) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NY) continue; const k = b * NX + a; if (op[k] && !seen[k]) { seen[k] = 1; q.push(k); } } }
  return false;
};
const _seamY = (v) => {   // 골짜기 중심선이 이음매(닛폰 x = 0)를 지나는 세계 y — 선 위 점이 없으면 가장 가까운 점
  const P = v.path.map((p) => p.pos); for (let i = 0; i + 1 < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1];
    if ((ax <= 0 && bx >= 0) || (bx <= 0 && ax >= 0)) { const t = ax === bx ? 0 : (0 - ax) / (bx - ax); return ay + (by - ay) * t + NP.worldOffsetY; } }
  const n = P.slice().sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]))[0]; return n[1] + NP.worldOffsetY;
};
{
  const withPass = Object.keys(J).filter((z) => (J[z].passes || []).length);
  ok(withPass.length === 0, '⑤a [T1296] 원 고개 0 — 그려진 존 어디에도 `passes` 가 없다(11차: 뚫린 곳 = 골짜기뿐)', withPass.map((z) => `${z} ${J[z].passes.map((q) => q.name).join('·')}`).join(' '));
  const hbW = new Set(); for (const v of J.hanbando.valleys || []) for (const p of v.path) hbW.add(p.width);
  const rows5 = [];
  for (const nm of ['쇠재', '한재']) {
    const v = (J.nippon.valleys || []).find((x) => x.name === nm);
    ok(!!v && v.path.length > 1 && v.path.every((p) => hbW.has(p.width)), `⑤b [T1296] ${nm} = 닛폰 골짜기(path · 폭은 한반도 골짜기 폭 안 — ${[...hbW].join('·')})`, v ? `점 ${v.path.length} · 폭 ${[...new Set(v.path.map((p) => p.width))].join('·')}` : '없음');
    if (!v) continue;
    const wy = _seamY(v), g = _gap(wy), lim = Math.ceil(Math.max(...v.path.map((p) => p.width)) / 32) + 2;
    ok(g > 0 && g <= lim, `⑤c [T1296] ${nm} — 이음매 열에서 연 틈 ${g}칸 ≤ 폭 칸 + 2(${lim}) · 원이 아니다`, `선 y ${Math.round(wy - HB.worldOffsetY)}(한반도 로컬)`);
    const th = _through(v);
    ok(th, `⑤d [T1296] ${nm} — 산 띠를 걸어서 꿰뚫는다(골짜기 둘레 창 서 → 동 4방 BFS)`, '');
    // ⑤e 클라 거울(`public/terrain.js` — 큰 지도 · 셀 그림은 서버 술어로 굽고 걸음 예측은 거울이 한다)이 그 창 **모든 칸**에서 서버와 같은 답(물 · 바위)
    { const ys = v.path.map((p) => p.pos[1] + NP.worldOffsetY); let nC = 0, dC = 0;
      for (let wy = Math.min(...ys) - 600; wy <= Math.max(...ys) + 600; wy += 32) for (let wx = NP.worldOffsetX - 2400; wx <= NP.worldOffsetX + 2400; wx += 32) {
        const zid = wx < NP.worldOffsetX ? 'hanbando' : 'nippon', Z = ZONES[zid], lx = wx - Z.worldOffsetX + 16, ly = wy - Z.worldOffsetY + 16;
        nC++; if (S.isRockCellLocal(zid, lx, ly) !== C.isRockCellLocal(zid, lx, ly) || S.isWaterCellLocal(zid, lx, ly) !== C.isWaterCellLocal(zid, lx, ly)) dC++; }
      ok(nC > 1000 && dC === 0, `⑤e [T1296] ${nm} — 골짜기 둘레 창 칸마다 클라 거울 = 서버(물 · 바위)`, `${nC.toLocaleString()}칸 · 다름 ${dC}`); }
    rows5.push({ nm, wy, lim });
  }
  // ★자명 통과 금지 — 옛 원 고개(r 1,850 · 닛폰 x −216)를 되살리면 ⑤c 가 빨개진다(사본: 술어가 읽는 그 배열에 넣었다 뺀다)
  const TN5 = S.ZONE_TERRAIN.nippon, TH5 = S.ZONE_TERRAIN.hanbando, bait = [];
  for (const r of rows5) bait.push({ name: r.nm + '(미끼)', pos: [-216, Math.round(r.wy - NP.worldOffsetY)], radius: 1850 });
  const p0 = (TN5.passes || []).slice(), s0 = TH5.seam.passes.slice();
  TN5.passes = p0.concat(bait); TH5.seam.passes = s0.concat(bait.map((f) => ({ f, dx: HB.worldOffsetX - NP.worldOffsetX, dy: HB.worldOffsetY - NP.worldOffsetY, from: 'nippon' })));
  const gb = rows5.map((r) => _gap(r.wy));
  TN5.passes = p0; TH5.seam.passes = s0;
  ok(rows5.length === 2 && rows5.every((r, i) => gb[i] > r.lim), '⑤★자명 통과 금지 — 옛 원 고개를 되살리면 이음매 틈이 폭 칸을 넘는다(⑤c 빨강)', `미끼 틈 ${gb.join(' · ')}칸`);
}
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
