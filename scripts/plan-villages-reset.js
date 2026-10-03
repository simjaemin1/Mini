#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T596 초기화 판 마을 자리 계획기 · 판정 0 · 기본은 아무것도 안 바꾼다(표·그림만) · 정본 적재는 `--apply` 로만)
// =============================================================================
// scripts/plan-villages-reset.js — **초기화 판 마을 자리 계획기**(T596 · 재민 10-02 "마을 본거지 위치도 옮기고 1년부터 다시")
//
//   입력 = 정본 지형(`server/terrain` · `server/hanbando-terrain.json` 의 존별 `villages` 후보) + 3시드 800일 끝 인구(t17 JSON).
//   출력 = 존마다 후보 표 json(옛 자리 → 새 자리 · 옮긴 셀 · 사유 · 예상 최대 영토 · 땅 점수 · 직업 이름표) + 그림 재료.
//   결정적이다 — 같은 지형 · 같은 인구면 같은 답(난수 0 · 탐색 순서 = 거리 → 각도 → 좌표).
//
// ★규칙(새 수 0 — 전부 정본 식·상수를 부른다):
//   ⓐ **겹침 0** — 두 마을의 예상 최대 영토 원이 안 닿는다: 셀 거리 ≥ rA + rB ·
//      r = √(상한 / π) · 상한 = T579 추신 `=2` 식 ⌈인구 ÷ (HOUSE_CAP_PER_FLOOR × HOUSE_MAX_FLOORS)⌉ × TERR_PER_LOT + TERR_CORE(`village-layout` 정본) ·
//      인구 = 그 마을의 3시드 끝 인구 중 최대(한반도) · 다른 존은 한반도 3시드에서 **같은 꼴의 최대 인구**(그 존 자 판이 없다 — 유도 규칙 · 보고에 적는다).
//   ⓑ **식량 하한 · 도구 접근** — 정본 `pickSeedVillages` 의 `landScore`(`_land`)를 그 자리 한 곳으로 부른다(교역 잠재 항 끔 — 한 자리 점수).
//      옛 자리가 하한을 넘었으면(`_land > 0`) 새 자리도 넘어야 한다.
//   ⓒ **회관 마당**(`YARD_CELLS` 원판 · r10)이 물(해안선 띠 포함 — 서버 통행 정본)·바위 위 0 · 중심 셀은 언제나 뭍(시딩의 터 미달 스킵과 같은 문) · 개울 위 0(서버 개울 정본 `server/streams` T585 · `--streams` 로 덮어쓰기).
//   ⓓ **이름표** — T593 ⑤ 정본 `_t593Kind`(typeBranch 판정 · 광맥 선 · 숲 선 · 받침)를 옛·새 자리에서 읽어 표에 싣는다(이름은 안 바꾼다 — `T593_LABEL` 이 시딩 때 짓는다).
//   ★옮긴 거리 최소 — 어긴 마을만 옮긴다. 쌍이 어기면 두 마을 각각을 옮겨 보고 덜 옮기는 쪽을 고른다(같으면 땅 점수 낮은 쪽 · 그다음 이름 순).
//     후보 자리는 짝수 격자(집터와 같은 규약) · 원 자리에서 가까운 순 · 다른 모든 마을(이미 옮긴 자리 포함)과 ⓐ · 그 자리 ⓑⓒ.
//
// 쓰는 법:
//   node scripts/plan-villages-reset.js --pops t17_1020.json,t17_7.json,t17_42.json [--zones hanbando,nippon,jungwon_n] [--out /tmp/t596/plan.json]
//        [--raster <dir>](그림 재료: 존별 땅/물/바위 4셀 표본 u8) [--streams hanbando=/path/mask.u8] [--max-move 240]
//   node scripts/plan-villages-reset.js --apply <plan.json>   ← `server/hanbando-terrain.json` 의 후보 x·y 를 계획의 새 자리로(★PM 이 지형 굽기 뒤에만)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/plan-villages-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

// ── 적재(--apply) ───────────────────────────────────────────────────────────
if (argv[0] === '--apply') {
  const plan = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  const F = path.join(ROOT, 'server', 'hanbando-terrain.json');
  const J = JSON.parse(fs.readFileSync(F, 'utf8'));
  const SZ = plan.SZ || 32; let n = 0;
  for (const [zid, Z] of Object.entries(plan.zones || {})) {
    const vs = J[zid] && J[zid].villages; if (!vs) continue;
    for (const r of Z.rows) if (r.moved > 0) {
      const v = vs.find((q) => q.name === r.name); if (!v) continue;
      v.x = r.to.cx * SZ; v.y = r.to.cy * SZ; n++;   // ★[T611] 읽는 쪽이 `Math.round(x / SZ)` 다 — 셀×SZ 로 써야 그 셀로 읽힌다(T596 판은 +SZ/2 라 한 칸씩(+1,+1) 밀려 읽혔다)
    }
  }
  fs.writeFileSync(F, JSON.stringify(J));
  console.log(`적재 — ${n}곳의 자리를 ${path.relative(ROOT, F)} 에 썼다(★다음: node scripts/bake-streams.js — 개울 지문이 후보 목록을 담아 적재 뒤 어긋난다(개울 셀은 같다) · 맵 에디터 구운 판 lab/map-editor-baked.json 은 따로 굽는다)`);
  process.exit(0);
}

const R = (p) => require(path.join(ROOT, p));
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const VL = R('server/village-layout');
const P = R('server/villages').__labProbe;
const SZ = P.SZ;
const ZONE_IDS = (val('--zones', 'hanbando,nippon,jungwon_n')).split(',');
const MAX_MOVE = +val('--max-move', '240');   // 탐색 반경(셀) — 표의 상한 · 판정 아님(못 찾으면 "자리 없음" 으로 적는다)
const OUT = val('--out', '/tmp/t596/plan.json');
const RASTER = val('--raster', null);
const YARD = val('--yard', 'on');   // 비교 팔 — `--yard nowater` 면 마당의 **물만** 허용(바위·개울은 본다 · 중심은 언제나 뭍) · `off` 면 마당을 안 본다

// ── 인구(3시드 끝) ───────────────────────────────────────────────────────────
const popFiles = (val('--pops', '') || '').split(',').filter(Boolean);
const popMax = {}, seeds = [];
for (const f of popFiles) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); seeds.push({ seed: j.seed, sum: (j.vpop || []).reduce((s, v) => s + v.pop, 0) });
  for (const v of j.vpop || []) popMax[v.name] = Math.max(popMax[v.name] || 0, v.pop); }
const hanCands = T.siteCandidates('hanbando') || [];
const typeMax = {}; let allMax = 0;
for (const v of hanCands) { const p = popMax[v.name] || 0; typeMax[v.type] = Math.max(typeMax[v.type] || 0, p); allMax = Math.max(allMax, p); }
const popOf = (zid, v) => {
  if (zid === 'hanbando' && popMax[v.name] != null) return { pop: popMax[v.name], src: '그 마을 3시드 최대' };
  if (typeMax[v.type] != null) return { pop: typeMax[v.type], src: `한반도 ${v.type} 최대` };
  return { pop: allMax, src: '한반도 전체 최대(꼴 없음)' };
};
const CAPDIV = VL.HOUSE_CAP_PER_FLOOR * VL.HOUSE_MAX_FLOORS;
const cap2 = (pop) => Math.ceil(pop / CAPDIV) * VL.TERR_PER_LOT + VL.TERR_CORE;   // T579 추신 `=2`(villages.js `_terrCap` 과 같은 식 — 그 함수는 마을 객체를 받는다)
const radOf = (pop) => Math.sqrt(cap2(pop) / Math.PI);

// ── 존 지형 어댑터(probe-seedcands 와 같은 줄) ─────────────────────────────────
function adapterFor(Z) {
  const ZONE = ZONES[Z]; P.setZoneId(Z);
  const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  //   ★물 = 서버 통행 정본(`zone.js isWaterTileLocal`)과 같은 둘 — 해안선 띠(`chunk.generateCoastlineWaterTiles`) + 손그림 강·호수(t17-metrics T407 과 같은 줄 · 띠는 모든 존 켬)
  const COAST = R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, R('server/zone-config').findZoneAt,
    Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight })));
  const isW = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (COAST && COAST.has(`${tx}_${ty}`)) return true; try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isR = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  //   개울 술어도 서버 존과 같이 넘긴다(`zone.js` 가 `isStreamLocal` 을 deps 로 준다 — 집터·논밭·땅 셈이 개울을 본다 · t585-ruler-streams 와 같은 줄)
  let SMod = null; try { SMod = R('server/streams'); if (!(SMod.ON && SMod.load(Z))) SMod = null; } catch (e) { SMod = null; }
  const deps = { isTerrainBlockedLocal: (x, y) => !_in(x, y) || isR(x, y) || isW(x, y), isWaterTileLocal: isW };
  if (SMod) deps.isStreamLocal = (x, y) => SMod.isStreamLocal(Z, x, y);
  const ta = P.makeTerrainAdapter(T, ZONE, deps);
  return { ta, ZONE, NX: Math.ceil(ZONE.zoneWidth / SZ), NY: Math.ceil(ZONE.zoneHeight / SZ) };
}
const streamsArg = {}; for (const s of (val('--streams', '') || '').split(',').filter(Boolean)) { const [z, f] = s.split('='); streamsArg[z] = f; }

const out = { at: new Date().toISOString(), SZ, yard: YARD, rule: { cap: '⌈pop/6⌉×600+1500', capDiv: CAPDIV, perLot: VL.TERR_PER_LOT, core: VL.TERR_CORE, yardR: VL.HALL_YARD, maxMove: MAX_MOVE }, seeds, zones: {} };
for (const Z of ZONE_IDS) {
  const t0 = Date.now();
  const { ta, NX, NY } = adapterFor(Z);
  const log = (m) => process.stderr.write(`  · [${Z}] ${m} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  //   개울 = 서버 정본(`server/streams` · T585 — 존마다 구운 한 장 · `isStreamCell`) · `--streams <존>=<u8>` 이 있으면 그것(지형 굽기 전 미리 보기용)
  const stream = streamsArg[Z] ? new Uint8Array(fs.readFileSync(streamsArg[Z])) : null;
  const SM = (() => { try { const M = R('server/streams'); return (M.ON && M.load(Z)) ? M : null; } catch (e) { return null; } })();
  const isStream = stream ? (x, y) => x >= 0 && y >= 0 && x < NX && y < NY && stream[y * NX + x] === 1
    : SM ? (x, y) => !!SM.isStreamCell(Z, x, y) : null;
  const cands = (T.siteCandidates(Z) || []).map((v) => ({ ...v, cx: Math.round(v.x / SZ), cy: Math.round(v.y / SZ) }));
  // ⓑ 한 자리 땅 점수 — 정본 `pickSeedVillages` 를 그 자리 하나로(교역 잠재 끔 · 그 자리 점수)
  const landAt = (v, cx, cy) => { const keep = process.env.T436_GATE_TRADE; process.env.T436_GATE_TRADE = '0';
    try { const o = []; P.pickSeedVillages([{ name: v.name, type: v.type, x: cx * SZ, y: cy * SZ }], ta, { _scoredOut: o }); return o[0] ? o[0]._land : 0; }
    catch (e) { return 0; } finally { if (keep == null) delete process.env.T436_GATE_TRADE; else process.env.T436_GATE_TRADE = keep; } };
  // ⓒ 회관 마당 원판
  //   셀 판정은 한 번만 묻고 기억한다(0 모름 · 1 뭍 · 2 물 · 3 바위 · 4 막힘 · 5 존 밖) — 탐색이 같은 셀을 수없이 다시 묻는다
  const CELL = new Uint8Array(NX * NY);
  const cellKind = (x, y) => { if (x < 0 || y < 0 || x >= NX || y >= NY) return 5; const i = y * NX + x; let k = CELL[i];
    if (!k) { k = ta.isWater(x, y) ? 2 : (ta.isRock && ta.isRock(x, y)) ? 3 : ta.isBlocked(x, y) ? 4 : 1; CELL[i] = k; } return k; };
  const KWHY = { 2: '물', 3: '바위', 4: '막힘', 5: '존 밖' };
  const yardWhy = (cx, cy) => { const kc = cellKind(cx, cy); if (kc !== 1) return '중심 ' + KWHY[kc];   // 시딩의 터 미달(중심 뭍) — 마당 손잡이와 무관
    if (YARD === 'off') return null; for (const [dx, dy] of VL.YARD_CELLS) { const x = cx + dx, y = cy + dy, k = cellKind(x, y);
    if (k !== 1 && !(k === 2 && YARD === 'nowater')) return KWHY[k]; if (isStream && isStream(x, y)) return '개울'; } return null; };
  // ⓓ 이름표(정본 generate 의 typeLabel)
  //   이름표 = T593 ⑤ 정본(`_t593Kind` — typeBranch 판정 · 광맥 선 · 숲 선 · 받침 규칙) · 시딩과 같은 인구(INITIAL_POP)로 `generate` 를 한 번
  const labelAt = (tag, cx, cy) => { try { if (ta.prepareFert) ta.prepareFert(cx, cy, 62); const g = VL.generate(ta, cx, cy, P.INITIAL_POP, {});
    const lp = P.extractLandParamsApprox(ta, cx, cy, g); const why = g.typeWhy || g.type;
    return { kind: P.t593Kind(tag, why, lp, g.fShare, g.hShare), why, fShare: g.fShare, hShare: g.hShare }; } catch (e) { return { kind: '?', err: e.message }; } };

  const S = cands.map((v) => { const pp = popOf(Z, v); return { name: v.name, type: v.type, from: { cx: v.cx, cy: v.cy }, to: { cx: v.cx, cy: v.cy }, pop: pp.pop, popSrc: pp.src, r: radOf(pp.pop), cap: cap2(pp.pop), reasons: [] }; });
  for (const s of S) { s.land0 = landAt(s, s.from.cx, s.from.cy); s.yard0 = yardWhy(s.from.cx, s.from.cy); }
  log(`옛 자리 땅 점수·마당 ${S.length}곳`);
  const conflicts = () => { const out2 = [];
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) { const a = S[i], b = S[j], d = Math.hypot(a.to.cx - b.to.cx, a.to.cy - b.to.cy), need = a.r + b.r; if (d < need) out2.push({ a, b, d, need, short: need - d }); }
    return out2.sort((p, q) => q.short - p.short || (p.a.name + p.b.name).localeCompare(q.a.name + q.b.name)); };
  const pairs0 = conflicts().map((c) => ({ a: c.a.name, b: c.b.name, d: +c.d.toFixed(1), need: +c.need.toFixed(1) }));
  // 탐색 순서 — 짝수 격자 오프셋을 거리 → 각도 순으로 한 번(결정적)
  const OFF = []; for (let dy = -MAX_MOVE; dy <= MAX_MOVE; dy += 2) for (let dx = -MAX_MOVE; dx <= MAX_MOVE; dx += 2) { const d = Math.hypot(dx, dy); if (d > 0 && d <= MAX_MOVE) OFF.push([dx, dy, d, Math.atan2(dy, dx)]); }
  OFF.sort((p, q) => p[2] - q[2] || p[3] - q[3]);
  //   옛 자리에서 이미 어긋난 쌍(짝 셋)은 따로 기억한다 — ⓒ 단계는 그 쌍을 **더 나쁘게만 안 하면** 되고(거리가 줄지 않게), ⓐ 단계가 그 쌍을 푼다.
  const d0 = (a, b) => Math.hypot(a.from.cx - b.from.cx, a.from.cy - b.from.cy);
  const findSpot = (s, strict) => {   // s 를 다른 모든 마을(지금 자리) 사이에서 ⓐⓑⓒ 를 지키는 가장 가까운 짝수 칸으로(옛 자리 기준 거리)
    const others = S.filter((o) => o !== s);
    for (const [dx, dy, d] of [[0, 0, 0], ...OFF]) {
      const cx = s.from.cx + dx, cy = s.from.cy + dy;
      if (!others.every((o) => { const dd = Math.hypot(o.to.cx - cx, o.to.cy - cy); return dd >= o.r + s.r || (!strict && d0(o, s) < o.r + s.r && dd >= Math.hypot(o.to.cx - s.from.cx, o.to.cy - s.from.cy)); })) continue;
      if (yardWhy(cx, cy)) continue;
      const land = d === 0 ? s.land0 : landAt(s, cx, cy);
      if (s.land0 > 0 && !(land > 0)) continue;
      return { cx, cy, d, land };
    }
    return null;
  };
  // ⓒ 먼저 — 마당이 물·바위·개울 위인 마을(옛 자리에서 이미 어긋난 쌍은 더 나쁘게만 안 한다)
  for (const s of S) if (s.yard0) { const f = findSpot(s, false); s.reasons.push('마당 ' + s.yard0); if (f) { s.to = { cx: f.cx, cy: f.cy }; s.land1 = f.land; } else s.noSpot = true; }
  log('마당 옮김 끝');
  // ⓐ 그다음 — 겹치는 쌍(가장 많이 모자란 쌍부터) · 두 마을 각각을 옛 자리 기준으로 다시 찾아 덜 옮기는 쪽
  for (let guard = 0; guard < 200; guard++) {
    const c = conflicts().find((q) => !(q.a.noSpot && q.b.noSpot)); if (!c) break;
    const tries = [c.a, c.b].filter((s) => !s.noSpot).map((s) => ({ s, f: findSpot(s, true) })).filter((q) => q.f);
    if (!tries.length) { c.a.noSpot = true; c.b.noSpot = true; c.a.reasons.push(`겹침(${c.b.name})·자리 없음`); c.b.reasons.push(`겹침(${c.a.name})·자리 없음`); continue; }
    tries.sort((p, q) => p.f.d - q.f.d || p.s.land0 - q.s.land0 || p.s.name.localeCompare(q.s.name));
    const { s, f } = tries[0], other = s === c.a ? c.b : c.a;
    s.to = { cx: f.cx, cy: f.cy }; s.land1 = f.land; s.reasons.push(`겹침(${other.name} ${c.d.toFixed(0)} < ${c.need.toFixed(0)})`);
  }
  log('겹침 옮김 끝');
  for (const s of S) { s.moved = +Math.hypot(s.to.cx - s.from.cx, s.to.cy - s.from.cy).toFixed(1); if (s.land1 == null) s.land1 = s.land0;
    s.label0 = labelAt(s.type, s.from.cx, s.from.cy); s.label1 = s.moved > 0 ? labelAt(s.type, s.to.cx, s.to.cy) : s.label0; }
  const left = conflicts();
  // 지금 시딩이 고르는 부분(전수가 아니면) — 그 부분 안의 겹침도 따로 센다
  const picked = new Set(ZONES[Z].seedAllVillages ? cands.map((v) => v.name) : (P.pickSeedVillages(T.siteCandidates(Z) || [], ta) || []).map((v) => v.name));
  out.zones[Z] = { NX, NY, n: S.length, seedAll: !!ZONES[Z].seedAllVillages, picked: [...picked], pairs0,
    pairsPicked0: pairs0.filter((p) => picked.has(p.a) && picked.has(p.b)).length,
    left: left.map((c) => ({ a: c.a.name, b: c.b.name, d: +c.d.toFixed(1), need: +c.need.toFixed(1) })),
    rows: S.map((s) => ({ name: s.name, type: s.type, from: s.from, to: s.to, moved: s.moved, reasons: s.reasons, noSpot: !!s.noSpot, pop: s.pop, popSrc: s.popSrc, cap: s.cap, r: +s.r.toFixed(1),
      land0: s.land0, land1: s.land1, yard0: s.yard0, label0: s.label0, label1: s.label1, picked: picked.has(s.name) })),
    streams: stream ? 'input' : SM ? 'server/streams ' + JSON.stringify(SM.stats(Z)) : 'none', ms: Date.now() - t0 };
  const Zo = out.zones[Z], mv = Zo.rows.filter((r) => r.moved > 0);
  console.log(`\n[${Z}] 후보 ${Zo.n} · 예상 겹침 쌍 ${pairs0.length}(시딩 고른 ${picked.size}곳 안 ${Zo.pairsPicked0}) → 옮길 마을 ${mv.length} · 최대 이동 ${mv.length ? Math.max(...mv.map((r) => r.moved)) : 0}셀 · 남은 겹침 ${left.length} · 마당·중심 어김 ${Zo.rows.filter((r) => r.yard0).length} · 개울 판 ${Zo.streams} · ${Zo.ms}ms`);
  for (const r of mv) console.log(`  ${r.name}(${r.type}) (${r.from.cx},${r.from.cy}) → (${r.to.cx},${r.to.cy}) ${r.moved}셀 · ${r.reasons.join(' · ')} · 땅 ${r.land0} → ${r.land1} · 이름표(T593) ${r.type} → ${r.label0.kind}/${r.label1.kind}`);
  for (const r of Zo.rows.filter((q) => q.noSpot)) console.log(`  ✗ ${r.name} 자리 없음 — ${r.reasons.join(' · ')}`);

  if (RASTER) {   // 그림 재료 — 4셀 표본 u8(0 뭍 · 1 물 · 2 바위)
    fs.mkdirSync(RASTER, { recursive: true });
    const K = 4, W = Math.ceil(NX / K), H = Math.ceil(NY / K), buf = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const cx = x * K + 2, cy = y * K + 2; { const k = cellKind(Math.min(NX - 1, cx), Math.min(NY - 1, cy)); buf[y * W + x] = k === 2 ? 1 : k === 3 ? 2 : k === 1 ? 0 : 3; } }
    fs.writeFileSync(path.join(RASTER, `${Z}.u8`), buf); Zo.raster = { file: `${Z}.u8`, K, W, H };
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\n→', OUT);
try { for (const s of ['', '-wal', '-shm']) fs.unlinkSync(process.env.DB_PATH + s); } catch (e) {}
