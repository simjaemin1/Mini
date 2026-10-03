#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly B
// === scripts/test-streams.js — 개울 서버 이식 (T585 · 재민 10-03 "개울 랩 확인했어 · 괜찮은듯") ==========================
//
// ★지키는 계약:
//   ① 정본 하나 — `server/streams.js` 의 산법이 랩 `lab/마을실험실.html` `STREAM-CORE` 와 **같은 글자** · 값(문턱 1,500 · ×0.5)이 랩과 같다
//   ② 래스터 — 존 파일(`server/streams/<존>.bin`)이 지형과 맞다(지문) · 크기 = 존 셀 격자 · 술어 `isStreamCell` = 파일 비트
//   ③ 점검(⑦) — 개울 셀 ∩ 큰 물(해안 띠·강·호수) ∩ 바위 = 0 · 끊긴 조각 0(개울 성분이 전부 물에 닿는다 — 존 경계를 넘어 묶음으로 센다)
//      · 갈라짐·두 물·가로지름은 굽기 판(`node scripts/bake-streams.js --check`)이 같은 랩 `streamAudit` 로 센다(T585_FULL=1 이면 여기서도)
//   ④ 술어 자리 — 지형 어댑터에 개울이 넘어오면 `ta.isStream` · 안 넘어오면 키가 없다(자·옛 배선 무변) ·
//      `generate` 의 집(부지+완충)·논·밭에 개울 0 · 영토는 개울 셀을 품는다(상한 셈에 든다) · 큰집 마당 원판에 개울 0
//   ⑤ 걸음 — `move-model groundMult` 0.5 면 최고속 절반(legacy·accel) · 없으면 종전과 비트 같다 · 존 `_streamWalkMul` 이 개울 칸 0.5 · 도적 1
//   ⑥ 길찾기 — `path-core.localPath costMul` 한 자리 · 존 `_streamCost` 개울 칸 2 · 안 넘기면 종전 길
//   ⑦ 마시기 — 개울 칸 살피기 = 민물(물 메뉴) · 개울 옆 '마시기' = +갈증 · 낚시·갈대는 큰 물만
//   ⑧ 큰 지도 — 개울 칸 = `stream` 종류(연한 파랑) · 클라 래스터(`/streams.bin`) = 서버 비트
//   ⑨ 끔 — `T585_STREAMS=0` 이면 개울 0(자식 프로세스)
// 실행: node scripts/test-streams.js
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TMP = `/tmp/test-streams-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
delete process.env.T585_STREAMS;
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(38700 + (process.pid % 200));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const say = (s) => console.log(s);
const quiet = (f) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return f(); } finally { console.log = l; console.warn = w; console.error = e; } };

const S = require(path.join(ROOT, 'server', 'streams.js'));
const T = quiet(() => require(path.join(ROOT, 'server', 'terrain.js')));
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
quiet(() => { if (T.setZonesMeta) T.setZonesMeta(ZC.ZONES); });
const chunk = quiet(() => require(path.join(ROOT, 'server', 'chunk.js')));

say('\n=== 개울 서버 이식 (T585) ===');
// ── ① 정본 = 랩 STREAM-CORE 같은 글자 ──
say('\n① 정본 하나 — 산법 = 랩 STREAM-CORE 같은 글자 · 값 = 랩 값');
{
  const cut = (src) => { const a = src.indexOf('// ===================== ★★[T571'), b = src.indexOf('// ===================== STREAM-CORE-END'); return a >= 0 && b > a ? src.slice(a, b) : null; };
  const lab = fs.readFileSync(path.join(ROOT, 'lab', '마을실험실.html'), 'utf8'), srv = fs.readFileSync(path.join(ROOT, 'server', 'streams.js'), 'utf8');
  const L = cut(lab), V = cut(srv);
  ok(!!L && !!V && L.length > 3000, '(상황) 두 블록을 도려냈다', `랩 ${L ? L.length : 0}자 · 서버 ${V ? V.length : 0}자`);
  ok(!!L && L === V, '★★① 서버 `server/streams.js` 의 산법 블록 = 랩 STREAM-CORE(글자 그대로 · 사본 0 — 랩이 바뀌면 빨개진다)');
  const m = /const L_STREAM_A0=(\d+), L_STREAM_SLOW0=([\d.]+);/.exec(lab);
  ok(!!m && +m[1] === S.STREAM_A0 && +m[2] === S.STREAM_SLOW0, '★① 문턱·느려짐 = 랩 기본값(재민 확정 1,500 · ×0.5)', m ? `${m[1]} · ${m[2]}` : '못 찾음');
  ok(S.MODE === 'foot', '① 바위 구간 = 기슭(지형 무변 · 계곡은 재민 판정 칸)', S.MODE);
}
// ── ② 래스터 ──
say('\n② 래스터 — 존 파일이 지형과 맞다');
const Z = {};
for (const zid of S.GROUP) {
  const f = S.fileOf(zid);
  let D = null; try { D = S.decodeFile(fs.readFileSync(f)); } catch (e) { D = null; }
  const ZONE = ZC.ZONES[zid], NX = Math.ceil(ZONE.zoneWidth / 32), NY = Math.ceil(ZONE.zoneHeight / 32);
  ok(!!D && D.NX === NX && D.NY === NY, `② ${zid}: 파일 있고 크기 = 존 셀 격자`, D ? `${D.NX}×${D.NY} · 개울 ${D.n.toLocaleString()}셀 · ${(fs.statSync(f).size / 1024).toFixed(0)}KB` : '없음');
  ok(!!D && D.hash === S.sourceHash(zid), `★② ${zid}: 지문 = 지금 지형(낡으면 node scripts/bake-streams.js)`, D ? D.hash : '');
  const r = S.load(zid);
  let same = !!r;
  if (r) { let bad = 0; for (let k = 0; k < 20000; k++) { const cx = (k * 7919) % NX, cy = (k * 104729) % NY, i = cy * NX + cx; if (S.isStreamCell(zid, cx, cy) !== ((D.bits[i >> 3] & (1 << (i & 7))) !== 0)) bad++; } same = bad === 0; }
  ok(same, `② ${zid}: 술어 isStreamCell = 파일 비트(표본 2만 칸)`);
  Z[zid] = { D, NX, NY, ZONE };
}
// ── ③ 점검 ──
say('\n③ 점검 — 큰 물·바위 위 개울 0 · 끊긴 조각 0(묶음 한 장 — 경계를 넘어 센다)');
{
  const OR = Object.values(ZC.ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
  let ux = 0; const UH = Z[S.GROUP[0]].NY;
  for (const zid of S.GROUP) { Z[zid].ux = ux; ux += Z[zid].NX; Z[zid].band = quiet(() => chunk.generateCoastlineWaterTiles({ ...Z[zid].ZONE, id: zid }, 32, ZC.findZoneAt, OR)); }
  const UW = ux;
  const zoneOfU = (x) => { for (const zid of S.GROUP) if (x >= Z[zid].ux && x < Z[zid].ux + Z[zid].NX) return zid; return null; };
  const isSt = (x, y) => { if (y < 0 || y >= UH) return false; const zid = zoneOfU(x); if (!zid) return false; return S.isStreamCell(zid, x - Z[zid].ux, y); };
  const isW = (x, y) => { if (y < 0 || y >= UH) return false; const zid = zoneOfU(x); if (!zid) return false; const cx = x - Z[zid].ux; return Z[zid].band.has(cx + '_' + y) || T.isWaterCellLocal(zid, cx * 32 + 16, y * 32 + 16); };
  let onWater = 0, onRock = 0, cells = 0;
  const seen = new Uint8Array(UW * UH);
  let comps = 0, frag = 0, fragCells = 0;
  for (const zid of S.GROUP) {
    const { D, NX } = Z[zid];
    for (let i = 0; i < D.bits.length * 8 && i < NX * Z[zid].NY; i++) {
      if (!(D.bits[i >> 3] & (1 << (i & 7)))) continue;
      const cx = i % NX, cy = (i / NX) | 0; cells++;
      if (Z[zid].band.has(cx + '_' + cy) || T.isWaterCellLocal(zid, cx * 32 + 16, cy * 32 + 16)) onWater++;
      else if (T.isRockCellLocal(zid, cx * 32 + 16, cy * 32 + 16)) onRock++;
    }
  }
  for (let y = 0; y < UH; y++) for (let x = 0; x < UW; x++) {
    const u = y * UW + x; if (seen[u] || !isSt(x, y)) continue;
    comps++; let touch = false, n = 0; const st = [u]; seen[u] = 1;
    while (st.length) { const v = st.pop(), vx = v % UW, vy = (v / UW) | 0; n++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = vx + dx, yy = vy + dy; if (xx < 0 || yy < 0 || xx >= UW || yy >= UH) continue;
        const w = yy * UW + xx; if (seen[w]) continue; if (isSt(xx, yy)) { seen[w] = 1; st.push(w); } else if (!touch && isW(xx, yy)) touch = true; } }
    if (!touch) { frag++; fragCells += n; }
  }
  ok(cells > 50000, '(상황) 개울 셀이 있다(세 존)', cells.toLocaleString());
  ok(onWater === 0, '★★③ 큰 물(해안 띠·강·호수) 위 개울 0', onWater);
  ok(onRock === 0, '★★③ 바위 위 개울 0(기슭 판 — 산 너머 개울 없음 · 지형 무변)', onRock);
  ok(frag === 0, '★★③ 끊긴 조각 0 — 개울 성분이 전부 물에 닿는다(존 경계를 넘어 묶음으로)', `성분 ${comps} · 끊긴 ${frag}(${fragCells}셀)`);
  if (process.env.T585_FULL === '1') {
    let out = ''; try { out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'bake-streams.js'), '--check'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 900000 }); } catch (e) { out = String(e.stdout || ''); }
    const m = /두 물 (\d+) · 끊긴 (\d+) · 큰 물 위 (\d+) · 가로지름 (\d+)/.exec(out);
    ok(!!m && m.slice(1).every((v) => v === '0') && /파일 전부 지형과 같다/.test(out), '★★③ [전판] 다시 굽기 = 파일 바이트 · 두 물·끊긴·큰 물 위·가로지름 0(랩 streamAudit)', m ? m[0] : out.slice(-200));
  }
}
// ── ④ 술어 자리 ──
say('\n④ 술어 자리 — 집터·논밭·큰집 마당이 개울을 본다 · 영토는 개울을 품는다');
{
  const P = quiet(() => require(path.join(ROOT, 'server', 'villages.js')).__labProbe);
  const VL = require(path.join(ROOT, 'server', 'village-layout.js'));
  const zid = 'hanbando', ZONE = ZC.ZONES[zid], SZ = 32;
  const zoneDeps = (withStream) => {
    const OR = Object.values(ZC.ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
    const band = Z[zid].band || quiet(() => chunk.generateCoastlineWaterTiles({ ...ZONE, id: zid }, 32, ZC.findZoneAt, OR));
    const isWaterTileLocal = (x, y) => band.has(Math.floor(x / 32) + '_' + Math.floor(y / 32)) || T.isWaterCellLocal(zid, Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16);
    const isTerrainBlockedLocal = (x, y) => isWaterTileLocal(x, y) || T.isRockCellLocal(zid, Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16);
    const d = { isTerrainBlockedLocal, isWaterTileLocal };
    if (withStream) d.isStreamLocal = (x, y) => S.isStreamLocal(zid, x, y);
    return d;
  };
  const prev = P.SZ;
  const ta0 = quiet(() => P.makeTerrainAdapter(T, ZONE, zoneDeps(false))), ta1 = quiet(() => P.makeTerrainAdapter(T, ZONE, zoneDeps(true)));
  ok(!('isStream' in ta0) && typeof ta1.isStream === 'function', '★④ 어댑터 — 개울이 넘어오면 `ta.isStream` · 안 넘어오면 키가 없다(자·옛 배선 무변)');
  // 개울이 지나는 마을 자리 하나 — 후보 중 반경 40 안에 개울 셀이 많은 곳
  const cands = quiet(() => T.siteCandidates ? T.siteCandidates(zid) : []);
  let best = null, bn = -1;
  for (const c of cands || []) {
    const ccx = Math.round(c.x / 32), ccy = Math.round(c.y / 32); let n = 0;
    for (let dy = -40; dy <= 40; dy += 2) for (let dx = -40; dx <= 40; dx += 2) if (S.isStreamCell(zid, ccx + dx, ccy + dy)) n++;
    if (n > bn) { bn = n; best = { ccx, ccy, name: c.name }; }
  }
  ok(!!best && bn > 0, '(상황) 개울이 지나는 마을 후보를 골랐다', best ? `${best.name} (${best.ccx},${best.ccy}) · 반경 40 표본 개울 ${bn}` : '없음');
  if (best) {
    const c0 = P.findOpenCenter(ta0, best.ccx, best.ccy), c1 = P.findOpenCenter(ta1, best.ccx, best.ccy);
    ok(!!c1 && !VL.discHitsStream(ta1, c1.ccx, c1.ccy, VL.YARD_CELLS), '★④ 큰집 마당 원판(r10)에 개울 0(필요하면 옮긴다)', `없음 ${c0 && c0.ccx},${c0 && c0.ccy} → 켬 ${c1 && c1.ccx},${c1 && c1.ccy}`);
    for (const pop of [30, 120, 240]) {
      let L = null; try { L = quiet(() => { if (ta1.prepareFert) ta1.prepareFert(c1.ccx, c1.ccy, 62); return VL.generate(ta1, c1.ccx, c1.ccy, pop, {}); }); } catch (e) { L = null; }
      if (!L) { ok(false, `④ 인구 ${pop} — 배치 실패`); continue; }
      let hLot = 0, hGuard = 0, nf = 0, terrSt = 0;
      for (const h of L.houses) { if (VL.discHitsStream(ta1, h.cx, h.cy, VL.LOT_CELLS)) hLot++; if (VL.discHitsStream(ta1, h.cx, h.cy, VL.LOT_GUARD)) hGuard++; }
      for (const f of [...L.farmland, ...L.dryfield, ...L.nongZone]) if (ta1.isStream(f.cx, f.cy)) nf++;
      for (const [x, y] of L.territory) if (ta1.isStream(x, y)) terrSt++;
      ok(hLot === 0 && hGuard === 0 && nf === 0, `★★④ 인구 ${pop}: 집 부지·완충 위 개울 0 · 논·밭·논 존닝 위 개울 0`, `집 ${L.houses.length} · 부지 ${hLot} · 완충 ${hGuard} · 논밭 ${nf} · 개울에 빠진 후보 ${L.streamRej || 0}`);
      if (pop === 240) ok(terrSt > 0, '★④ 영토는 개울 셀을 품는다(상한 셈에 든다 — 예외 0 · 재민 확정)', `영토 ${L.territory.length} 중 개울 ${terrSt}`);
    }
  }
  void prev;
}
// ── ⑤⑥⑦⑧ 존 ──
const Zone = quiet(() => require(path.join(ROOT, 'server', 'zone.js')));
const H = Zone.__testBind();
say('\n⑤ 걸음 — 개울 칸 ×0.5(서버·클라 같은 적분기)');
{
  const MM = require(path.join(ROOT, 'public', 'move-model.js'));
  for (const model of ['legacy', 'accel']) {
    const Pm = MM.paramsFrom({ model });
    let s0 = { vx: 0, vy: 0 }, s1 = { vx: 0, vy: 0 }, s2 = { vx: 0, vy: 0 };
    for (let k = 0; k < 120; k++) { s0 = MM.stepMove(s0, { wx: 1, wy: 0, bodyMult: 0.8 }, 1 / 30, Pm); s1 = MM.stepMove(s1, { wx: 1, wy: 0, bodyMult: 0.8, groundMult: 0.5 }, 1 / 30, Pm); s2 = MM.stepMove(s2, { wx: 1, wy: 0, bodyMult: 0.8, groundMult: 1 }, 1 / 30, Pm); }
    ok(Math.abs(s1.vx - 0.5 * s0.vx) < 1e-9, `★⑤ ${model}: groundMult 0.5 = 최고속 절반`, `${s0.vx.toFixed(3)} → ${s1.vx.toFixed(3)} px/s`);
    ok(Object.is(s2.vx, s0.vx) && Object.is(s2.dx, s0.dx), `⑤ ${model}: groundMult 1 = 종전과 비트 같다`);
  }
  let st = null; for (let k = 0; k < 400000 && !st; k++) { const cx = 300 + (k * 7919) % 1500, cy = 300 + (k * 104729) % 3400; if (S.isStreamCell('hanbando', cx, cy)) st = { cx, cy }; }
  const pOn = { isNpc: false, x: st.cx * 32 + 16, y: st.cy * 32 + 16 }, pBand = { isNpc: true, simJob: 'bandit', x: pOn.x, y: pOn.y }, pNpc = { isNpc: true, simJob: 'farmer', x: pOn.x, y: pOn.y };
  let off = null; for (let d = 1; d < 30 && !off; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (!off && !S.isStreamCell('hanbando', st.cx + dx, st.cy + dy) && !H.isTerrainBlockedLocal((st.cx + dx) * 32 + 16, (st.cy + dy) * 32 + 16)) off = { x: (st.cx + dx) * 32 + 16, y: (st.cy + dy) * 32 + 16 };
  ok(H._streamWalkMul(pOn) === 0.5 && H._streamWalkMul(pNpc) === 0.5, '★⑤ 존 — 개울 칸 위 사람(플레이어·마을 NPC) ×0.5', `칸 (${st.cx},${st.cy})`);
  ok(H._streamWalkMul(pBand) === 1, '⑤ 도적은 그대로(×1 · 카드 ③ · T571 회부 6)');
  ok(!!off && H._streamWalkMul({ isNpc: false, x: off.x, y: off.y }) === 1, '⑤ 개울 밖 = ×1(칸이 바뀌면 다시 묻는다)');
  // 실제 걸음 — 존의 이동 모델(MOVE_PARAMS)로 개울 칸 위·밖에서 1초씩
  const walk = (x, y) => { let s = { vx: 0, vy: 0 }, dist = 0; for (let k = 0; k < 30; k++) { s = MM.stepMove(s, { wx: 1, wy: 0, bodyMult: 1, groundMult: H._streamWalkMul({ isNpc: false, x, y }) }, 1 / 30, H.MOVE_PARAMS); dist += s.dx; } return dist; };
  const dOn = walk(pOn.x, pOn.y), dOff = walk(off.x, off.y);
  ok(Math.abs(dOn / dOff - 0.5) < 0.02, '★★⑤ 같은 1초 — 개울 칸 위 걸음 = 밖의 절반(존 MOVE_PARAMS)', `${dOff.toFixed(1)}px → ${dOn.toFixed(1)}px (×${(dOn / dOff).toFixed(3)})`);
  globalThis.__st = st;
}
say('\n⑥ 길찾기 — 개울 칸 비용 ×2(path-core localPath costMul 한 자리)');
{
  const PC = require(path.join(ROOT, 'sim', 'path-core.js'));
  // 합성 격자: x=5 세로줄이 개울 · (0,0) → (10,0) — 개울은 건너야만 한다(우회 불가) · (5,0) → (5,10) 은 개울을 따라가거나 옆 칸으로
  const cm = (x, y) => (x === 5 ? 2 : 1);
  const a = PC.localPath(5, 0, 5, 10, {}), b = PC.localPath(5, 0, 5, 10, { costMul: cm });
  const onSt = (p) => p.filter((n) => n.x === 5).length;
  ok(a && b && onSt(b) < onSt(a), '★⑥ 개울을 따라 걷는 길은 옆 뭍 칸으로 비킨다(비용 2)', `개울 칸 ${a ? onSt(a) : '-'} → ${b ? onSt(b) : '-'}`);
  const c = PC.localPath(0, 0, 10, 0, {}), d = PC.localPath(0, 0, 10, 0, { costMul: cm });
  ok(c && d && c.length === d.length, '⑥ 건너야만 하면 건넌다(길 길이 같음 — 막지 않는다)', `${c && c.length} = ${d && d.length}`);
  const e = PC.localPath(0, 0, 10, 0, { costMul: null });
  ok(JSON.stringify(e) === JSON.stringify(c), '⑥ costMul 없음 = 종전 길(비트)');
  const st = globalThis.__st;
  ok(H._streamCost(st.cx * 32 + 16, st.cy * 32 + 16) === 2 && H._streamCost(st.cx * 32 + 16 + 32 * 40, st.cy * 32 + 16) >= 1, '⑥ 존 `_streamCost` — 개울 칸 2(= 1 ÷ 0.5)');
}
say('\n⑦ 마시기 — 큰 물과 같은 문 · 개울 칸 옆');
{
  const st = globalThis.__st;
  const msgs = [];
  const mk = (x, y, thirst) => ({ playerId: 'ts1', pid: 'ps1', name: '시험', x, y, floor: 0, thirst, hunger: 100, inventory: {}, toolItems: [], lots: {}, oreCarry: {},
    ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } } });
  const p = mk(st.cx * 32 + 16, st.cy * 32 + 16, 40);
  msgs.length = 0; H.tryLook(p, st.cx * 32 + 16, st.cy * 32 + 16);
  const lk = msgs.find((m) => m.type === 'look');
  ok(!!lk && lk.water === 'fresh' && /개울/.test(lk.line), '★⑦ 개울 칸 살피기 = 민물(물 메뉴가 열린다)', lk ? lk.line : '응답 없음');
  // 개울 칸 옆 뭍에 서서 마시기
  let side = null; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = st.cx + dx, y = st.cy + dy; if (!side && !S.isStreamCell('hanbando', x, y) && !H.isTerrainBlockedLocal(x * 32 + 16, y * 32 + 16)) side = { x: x * 32 + 16, y: y * 32 + 16 }; }
  const q = side ? mk(side.x, side.y, 40) : null;
  if (q) { const t0 = q.thirst; H._waterVerb(q, 'drink'); ok(q.thirst > t0, '★★⑦ 개울 옆 "마시기" = 갈증 회복(큰 물과 같은 `drinkFresh`)', `${t0} → ${Math.round(q.thirst)}`); }
  else ok(false, '⑦ 개울 옆 뭍 칸을 못 찾았다');
  const far = mk((st.cx + 400) * 32 + 16, (st.cy) * 32 + 16, 40); let nearWater = false;
  for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32]]) if (H.isWaterTileLocal(far.x + dx, far.y + dy) || H._streamDrinkAt(far.x + dx, far.y + dy)) nearWater = true;
  if (!nearWater) { const t1 = far.thirst; H._waterVerb(far, 'drink'); ok(far.thirst === t1, '⑦ 미끼 — 물·개울에서 먼 자리는 안 마신다'); }
  const fsrc = fs.readFileSync(path.join(ROOT, 'server', 'fishing.js'), 'utf8');
  ok(!/isStream|streams/.test(fsrc), '⑦ 낚시 문은 개울을 모른다(낚시 0 — 재민 확정)');
}
say('\n⑧ 큰 지도 · 클라 래스터');
{
  const BB = require(path.join(ROOT, 'server', 'bigmap-bake.js'));
  const st = globalThis.__st;
  ok(BB.K.stream === 7 && BB.COLORS.stream === '#80bee8', '⑧ 지도 종류 `stream`(8번째 · 옛 번호 무변) · 연한 파랑');
  ok(BB.classAt(H._BM_Q, st.cx, st.cy) === BB.K.stream, '★⑧ 개울 칸 = 지도의 개울(존 지도 술어 그대로)');
  const res = { h: null, body: null, writeHead(c, h) { this.code = c; this.h = h; }, end(b) { this.body = b; } };
  H._t585Http({ url: '/streams.bin', method: 'GET' }, res);
  let okBits = false, nn = 0;
  if (res.code === 200 && res.body) {
    const raw = zlib.gunzipSync(res.body), NX = raw.readUInt32LE(4), NY = raw.readUInt32LE(8); nn = raw.readUInt32LE(12);
    const bits = raw.subarray(16), i = st.cy * NX + st.cx;
    okBits = raw.toString('ascii', 0, 4) === 'STRM' && NX === Z.hanbando.NX && NY === Z.hanbando.NY && ((bits[i >> 3] >> (i & 7)) & 1) === 1 && nn === Z.hanbando.D.n;
  }
  ok(okBits, '★⑧ 클라 래스터 `/streams.bin` = 서버 비트(gzip · 머리 STRM)', `${res.code} · ${res.body ? (res.body.length / 1024).toFixed(0) + 'KB' : ''} · 개울 ${nn}`);
  const csrc = fs.readFileSync(path.join(ROOT, 'public', 'client', '00-const.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'public', 'client', '31-m-move.js'), 'utf8');
  ok(/function isStreamAtAbs/.test(csrc) && /groundMult:\s*\(typeof streamWalkMultAt/.test(csrc), '⑧ 클라 — 같은 비트로 그림·걸음 예측(`isStreamAtAbs` · `groundMult`)');
}
say('\n⑨ 끔 — `T585_STREAMS=0` 이면 개울 0');
{
  const code = "const S=require('./server/streams.js');process.stdout.write(JSON.stringify({on:S.ON,a:S.isStreamCell('hanbando'," + globalThis.__st.cx + "," + globalThis.__st.cy + "),l:S.load('hanbando')}))";
  let out = null; try { out = JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: Object.assign({}, process.env, { T585_STREAMS: '0' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop()); } catch (e) { out = null; }
  ok(!!out && out.on === false && out.a === false && out.l === null, '★⑨ 끔 — 개울 칸이 개울이 아니다 · 래스터 안 실림(종전 세계)');
}
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
