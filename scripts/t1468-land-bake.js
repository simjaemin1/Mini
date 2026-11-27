#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1468 ② 랩 땅 굽기 · 제품 무변 · 지도 읽기만)
// === scripts/t1468-land-bake.js — 마을마다 **지도가 허락하는 영토 끝**을 서버 정본 고르기로 굽는다(★재민 11-23 판정 81 "그래 나") ==========
//
// 왜: 랩 마을 땅(`v.land.size`)은 지도에 묶이지 않는다 — 길드가 값만 맞으면 끝없이 산다(T1426 §3 · 회부 1). 서버는 영토를 지도 위 칸으로 넓히고
//   물 · 바위 · 남의 영토에 막힌다. 이 자는 서버의 **그 고르기 함수**(`villages._terrPick` — `__labProbe._t1468Probe.pick` · 사본 0)로
//   51마을을 시딩 영토(3,450칸 · 랩 `baseSize` 138 × 25)에서 함께 넓혀(차례 = 서버 마을 차례 · 한 바퀴에 마을마다 서버 하루 몫 `TERR_GROW_MAX_PER_DAY`)
//   **아무 마을도 더 못 넓힐 때까지** 돈다 → 마을마다 넓힌 칸의 차례 · 수 · 그 칸의 비옥도. 이웃과 겹치는 칸 = 먼저 넓힌 마을 것(서버 T569 규칙 그대로).
//   목표 · 상한(`territoryTarget` · `_terrCap`)은 끈다(목표 = 끝없음) — 굽는 것은 "지도가 허락하는 끝"이다(상한은 인구 · 집에 따라 자라는 몫이라 지도 끝이 아니다).
//   지형 · 시딩은 `t17-metrics` 와 같은 부름(존 · 해안 띠 · 물 · 바위 · 개울 술어 → `makeTerrainAdapter`) · 비옥도 상자 = 서버 시딩이 마지막으로 깐 상자(마지막 마을 · 반경 62).
//
//   node scripts/t1468-land-bake.js [--seeds <시딩 캐시>] [--out sim/lab-land-hanbando.json] [--raw <칸마다 표.json>] [--from-raw <칸마다 표.json>] [--sig]
//   ⇒ (out · 랩이 읽는 표) { v, zone, sig(지도 지문), growMax, villages: [{ name, ccx, ccy, start, end, fert0, q: base64(넓힌 차례 25칸 덩이마다 평균 비옥도 × 255) }] }
//   ⇒ (raw · 진단) 같은 머리 + 마을마다 넓힌 칸 하나하나의 비옥도(base64 · 넓힌 차례) · `--from-raw` = 넓히기를 건너뛰고 raw 에서 out 만 다시 쓴다(지문이 같을 때만)
//   `--sig` = 지금 지도의 지문만 찍는다(하네스 — 구운 표의 지문과 맞대 옛 표를 잡는다)
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const Z = process.env.T17_ZONE || 'hanbando';

// ── 지도 지문 = 지도 원천(존 지형 표 · 지형 생성 · 지역 결 · 해안 띠 · 개울 래스터 표식) + 서버 고르기 규칙의 글자(`_terrPick` · T569 이웃 술어 · 하루 몫) ──
//   둘 중 하나라도 바뀌면 구운 표는 낡았다(다시 굽는다). 시딩(자리 · 처음 영토)은 따로 `seedsSig`(시딩 캐시 없이도 지도 지문을 잴 수 있게 — 하네스 ①).
const MAP_FILES = ['server/hanbando-terrain.json', 'server/terrain.js', 'server/terrain-gen.js', 'server/region-profiles.js', 'server/streams.js', 'server/chunk.js',
  'server/zone-config.js', 'server/fertility.js', 'public/coast-shape.js'];
function ruleText(src) {   // 서버 영토 고르기 규칙의 글자(함수 몸 — 줄 번호가 아니라 글자)
  const grab = (re) => { const m = src.match(re); return m ? m[0] : ''; };
  return [grab(/function _terrPick\(vil, target\) \{[\s\S]*?\n\}\n/), grab(/function _t569Near\(vil\) \{[\s\S]*?\n\}\n/), grab(/const _t569OwnedBy = [^\n]*\n/), grab(/const TERR_GROW_MAX_PER_DAY = [^\n]*\n/)].join('');
}
function mapSig(streamSig, root) {
  root = root || ROOT;
  const h = crypto.createHash('sha1');
  h.update(Z); h.update(streamSig || '');
  for (const f of MAP_FILES) { h.update(f); try { h.update(fs.readFileSync(path.join(root, f))); } catch (e) { h.update('(없음)'); } }
  h.update(ruleText(fs.readFileSync(path.join(root, 'server/villages.js'), 'utf8')));
  return h.digest('hex').slice(0, 16);
}

// ── 지형 어댑터 — `t17-metrics.js` 와 같은 부름(존 · 해안 띠 · 물 · 바위 · 개울 → `makeTerrainAdapter`) ──
function terrain() {
  const { ZONES } = R('server/zone-config');
  const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const P = R('server/villages').__labProbe;
  const ZONE = ZONES[Z], SZ = P.SZ;
  P.setZoneId(Z);
  const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const _COAST = process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : true;
  const _COAST_TILES = _COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, R('server/zone-config').findZoneAt,
    Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
  const isWaterTileLocal = (x, y) => {
    if (ZONE.isOcean) return true;
    if (!_inZone(x, y)) return false;
    const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (_COAST_TILES && _COAST_TILES.has(`${tx}_${ty}`)) return true;
    try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
  };
  const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
  const _t601 = R('server/streams').rulerDeps(Z, { isTerrainBlockedLocal, isWaterTileLocal });
  return { P, ta: P.makeTerrainAdapter(T, ZONE, _t601.deps), streamSig: _t601.sig || '' };
}

// ── 영토 칸 모음 — 정본 고르기가 쓰는 몸짓(`has` · 차례대로 훑기 · `size`)만. 훑기는 **경계 칸만** 내준다(사방이 다 제 땅인 칸은 후보를 하나도 못 내고
//   영토는 줄지 않으니 한 번 안쪽이면 영영 안쪽) · 차례는 넣은 차례 그대로 ⇒ 고르기가 만드는 후보 목록 · 차례가 온 집합을 훑을 때와 **한 글자도 같다**
//   (온 집합을 훑으면 바퀴마다 마을 땅 전부를 훑어 지도 전체에선 제곱으로 느려진다 — 첫 판 28분에 못 끝남). ──
class FrontierSet {
  constructor(keys) { this.all = new Set(); this.ord = []; for (const k of keys || []) this.add(k); }
  get size() { return this.all.size; }
  has(k) { return this.all.has(k); }
  add(k) { if (!this.all.has(k)) { this.all.add(k); this.ord.push(k); } return this; }
  _inner(k) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); return this.all.has((x + 1) + ',' + y) && this.all.has((x - 1) + ',' + y) && this.all.has(x + ',' + (y + 1)) && this.all.has(x + ',' + (y - 1)); }
  *[Symbol.iterator]() { let w = 0; const o = this.ord; for (let r = 0; r < o.length; r++) { const k = o[r]; if (this._inner(k)) continue; o[w++] = k; yield k; } o.length = w; }
}
// ── 함께 넓히기 — 차례 = 서버 마을 차례 · 한 바퀴에 마을마다 서버 하루 몫(정본 고르기 `pick` 한 번) · 아무 마을도 더 못 넓힐 때까지.
//   이웃과 겹치는 칸 = 먼저 넓힌 마을 것(고르기가 남의 영토 칸을 후보에서 뺀다 — 서버 T569 그대로). 반지름 장부는 `_terrAdd` 그대로. ──
function growAll(P, V, onRound) {
  const added = V.map(() => []), rounds = V.map(() => 0), active = V.map(() => true);
  let round = 0;
  for (;;) {
    let any = false;
    for (let i = 0; i < V.length; i++) {
      if (!active[i]) continue;
      const v = V[i], n0 = v._terrSet.size;
      const picked = P._t1468Probe.pick(v, Infinity);
      if (!picked || !picked.length) { active[i] = false; continue; }
      for (const k of picked) { v._terrSet.add(k); added[i].push(k); }
      if (v._t569RN === n0) { for (const k of picked) { const ci = k.indexOf(','), d = Math.hypot(+k.slice(0, ci) - v.ccx, +k.slice(ci + 1) - v.ccy); if (d > v._t569R) v._t569R = d; } v._t569RN = v._terrSet.size; }
      rounds[i]++; any = true;
    }
    round++;
    if (onRound) onRound(round, active);
    if (!any) break;
  }
  return { added, rounds, round };
}
// 랩이 읽는 표 — 25칸(랩 땅 한 단위 · `EXPAND_CELLS_PER_SLOT`) 덩이마다 평균 비옥도(넓힌 차례 · 마지막 덩이는 남은 칸 평균) · 시딩 영토 평균 비옥도(질의 바닥)
//   질 덩이는 앞 `Q_SLOTS`(2,000덩이 = 50,000칸)까지만 싣는다 — 랩이 10,000날에 가장 많이 산 마을도 그 아래(보고 §1 · 표가 랩 번들 · HTML 둘에 실려 크기를 줄인다) ·
//   그 너머를 사면 econ 은 마지막 덩이 질을 쓴다(`end` 는 칸 수 그대로 — 끝 넓이는 자르지 않는다).
const SLOT = 25, Q_SLOTS = 2000;
function compact(head, rows) {
  return Object.assign({}, head, { qSlots: Q_SLOTS, villages: rows.map((r) => {
    const b = Buffer.from(r.fertReal != null ? r.fertReal : r.fert, 'base64'), q = [];
    for (let i = 0; i < Math.min(b.length, SLOT * Q_SLOTS); i += SLOT) { let a = 0, n = 0; for (let j = i; j < Math.min(b.length, i + SLOT); j++) { a += b[j]; n++; } q.push(Math.round(a / n)); }
    return { name: r.name, ccx: r.ccx, ccy: r.ccy, start: r.start, end: r.end, fert0: r.fert0Real != null ? r.fert0Real : r.fert0, fert0Srv: r.fert0, q: Buffer.from(q).toString('base64') };
  }) });
}

// 칸의 **실제** 비옥도 — 서버 런타임 넓히기가 읽는 장(`ta.fert`)은 마지막으로 깐 상자 하나라(마지막 마을 · 반경 62) 다른 50마을에선 늘 중립 0.5 다
//   (서버 `_terrAdd` 머리말 T237 — 알려진 회부). 질까지 팔은 넓힌 칸의 **실제 값**을 읽어야 하므로, 마을마다 그 칸들을 덮는 상자에 같은 장 함수
//   (`server/fertility.js` `buildField` — 서버 `prepareFert` 가 부르는 그것 · 사본 0)를 깔아 잰다. 고르는 차례는 서버 그대로(0.5 장)다.
function realFertBytes(ta, keys) {
  if (!keys.length) return [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const xy = keys.map((k) => { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; return [x, y]; });
  const VL = R('server/village-layout'), FERT = R('server/fertility');
  const F = FERT.buildField({ isWater: ta.isWater, isRock: ta.isRock, isWoody: (x, y) => ta.forestMult(x, y) > 1.2, maskEDT: VL.maskEDT }, x0 - 40, y0 - 40, x1 + 40, y1 + 40);
  return xy.map(([x, y]) => Math.max(0, Math.min(255, Math.round(F.at(x, y) * 255))));
}
function main() {
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  process.env.DB_PATH = process.env.DB_PATH || path.join(require('os').tmpdir(), `t1468-bake-${process.pid}.db`);
  const A = process.argv.slice(2);
  const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
  const SEEDS = opt('seeds', process.env.LAB_SEEDCACHE || path.join(process.env.TMPDIR || '/tmp', 'durango-eq-cache', `lab-seeds-${Z}-1020.json`));
  const OUT = opt('out', path.join(ROOT, 'sim', `lab-land-${Z}.json`));
  const RAW = opt('raw', null), FROM_RAW = opt('from-raw', null);
  const t0 = Date.now();
  const { P, ta, streamSig } = terrain();
  const sig = mapSig(streamSig);
  if (A.includes('--sig')) { console.log(sig); return; }
  if (!fs.existsSync(SEEDS)) { console.error(`시딩 캐시 없음: ${SEEDS} — t17-metrics(LAB_SEEDCACHE=…)를 한 번 돌려 만든다`); process.exit(2); }
  const seeds = JSON.parse(fs.readFileSync(SEEDS, 'utf8'));
  const last = seeds[seeds.length - 1];
  if (ta.prepareFert) ta.prepareFert(last.ccx, last.ccy, 62);   // 서버 시딩이 마지막으로 깐 비옥도 상자 그대로(런타임 영토 넓히기가 읽는 그 상자)
  const seedsSig = crypto.createHash('sha1').update(JSON.stringify(seeds.map((s) => [s.name, s.ccx, s.ccy, (s.layout && s.layout.territory || []).length]))).digest('hex').slice(0, 16);
  const fertByte = (k) => { const ci = k.indexOf(','); return Math.max(0, Math.min(255, Math.round(ta.fert(+k.slice(0, ci), +k.slice(ci + 1)) * 255))); };
  const fert0Of = (s) => { const c = (s.layout && s.layout.territory) || []; return Math.round(c.reduce((a, k) => a + fertByte(k[0] + ',' + k[1]), 0) / Math.max(1, c.length)); };
  if (FROM_RAW) {   // 넓히기를 건너뛰고 raw(칸마다 표)에서 랩 표만 다시 쓴다 — 지문이 같을 때만(`--resig` = 지문 꼴을 바꾼 뒤 같은 나무에서 구운 raw 를 받는다)
    const raw = JSON.parse(fs.readFileSync(FROM_RAW, 'utf8'));
    if (raw.sig !== sig && !A.includes('--resig')) { console.error(`raw 표 지문 ${raw.sig} ≠ 지금 지도 ${sig} — 다시 굽는다(--from-raw 없이)`); process.exit(3); }
    const { villages, ...head } = raw; head.sig = sig; head.seedsSig = seedsSig;
    const out = compact(head, villages.map((r) => (r.fert0 != null ? r : Object.assign({}, r, { fert0: fert0Of(seeds.find((x) => x.name === r.name)) }))));
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`[T1468] raw → 표 — ${villages.length}마을 · 지문 ${sig} · ${fs.statSync(OUT).size.toLocaleString()} B → ${OUT}`);
    return;
  }
  const V = seeds.map((s) => ({ name: s.name, ccx: s.ccx, ccy: s.ccy, _terrSet: new FrontierSet((s.layout.territory || []).map((c) => c[0] + ',' + c[1])), econ: { land: { size: 1e9 }, npcs: [], founder: null } }));
  const keep = P._t1468Probe.use({ ta, villages: V });
  const start = V.map((v) => v._terrSet.size);
  const g = growAll(P, V, (round, active) => { if (round % 50 === 0) process.stderr.write(`  바퀴 ${round} · 아직 넓히는 마을 ${active.filter(Boolean).length} · ${((Date.now() - t0) / 1000).toFixed(0)}초\n`); });
  P._t1468Probe.use(keep);
  const head = { v: 1, card: 'T1468', zone: Z, sig, seedsSig, growMax: P._t1468Probe.GROW_MAX, rounds: g.round, sec: +((Date.now() - t0) / 1000).toFixed(1), seedsFile: path.basename(SEEDS) };
  const rows = V.map((v, i) => {
    const s0 = ((seeds[i].layout && seeds[i].layout.territory) || []).map((c) => c[0] + ',' + c[1]);
    const r0 = realFertBytes(ta, s0), rq = realFertBytes(ta, g.added[i].slice(0, SLOT * Q_SLOTS));
    return { name: v.name, ccx: v.ccx, ccy: v.ccy, start: start[i], end: v._terrSet.size, rounds: g.rounds[i],
      fert0: fert0Of(seeds[i]), fert: Buffer.from(g.added[i].map(fertByte)).toString('base64'),   // 서버 장이 본 값(진단 — 고른 차례의 까닭)
      fert0Real: Math.round(r0.reduce((a, b) => a + b, 0) / Math.max(1, r0.length)), fertReal: Buffer.from(rq).toString('base64') };   // 실제 값(질까지 팔)
  });
  if (RAW) fs.writeFileSync(RAW, JSON.stringify(Object.assign({}, head, { villages: rows })));
  const out = compact(head, rows);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const tot = out.villages.reduce((a, v) => a + v.end, 0);
  console.log(`[T1468] 굽기 끝 — ${Z} · 마을 ${V.length} · 바퀴 ${g.round} · 영토 끝 합 ${tot.toLocaleString()}칸(시작 ${start.reduce((a, b) => a + b, 0).toLocaleString()}) · 지문 ${sig} · ${out.sec}초 · ${fs.statSync(OUT).size.toLocaleString()} B → ${OUT}`);
}
module.exports = { MAP_FILES, mapSig, ruleText, terrain, FrontierSet, growAll, compact, realFertBytes };
if (require.main === module) main();
