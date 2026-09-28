#!/usr/bin/env node
// === scripts/t490-thin-villages.js — 세계가 얇은 마을 (T490 ①②④) ======================================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
//
// ★왜 — T475 가 남긴 9%: 곳간 기준 걷은 = 딴 이 안 서는 마을·날은 **목록이 아니라 세계**다 — 채집 원판(`_t347Scan`
//   네모 R 30셀)에 선 군락이 2~5 개뿐인 마을이 서 있는 것을 다 따도 하루 몫에 못 미친다. 이 자는 그 세계를 **센다**:
//     ① 얇은 마을 표   — T347 자(`t347-forage-day.js`) JSON 의 마을·하루 행 × 원판 K(종·출처별)
//     ② K 의 유도      — 원판 K 를 항마다(원판 반지름 · 청크당 자원 수 · 종 표 몫 · 뭍 비율 · 링 군락 · 야생 서식 밀도) 기대값으로 다시 세고
//                         실제 개체와 맞댄다 — **어느 항이 얇게 만드나**
//     ④ 사전 표        — 원판 밖 하루 왕복 반경 안 개체(자의 하루 · 실제 하루) · 고증 밀도로 다시 심으면 K
//   ⚠수는 **전부 정본에서 읽는다**(새 수 0): 원판 반지름 = ⌈걸음 × `forage.CFG.WALK_SEC` ÷ 셀⌉(생활층 `_t347R` 그 식) ·
//     청크당 자원 수 `RESOURCES_PER_CHUNK`·`getStoneMultiplier`·`isOreClusterAt`(청크 생성기 그 줄) · 종 표 몫 = 생성기
//     `pickResourceType` 을 **불러서** 잰다(표를 옮겨 적지 않는다) · 링 군락 = 존 지형 `groves` · 야생 = `WILD`·`WILD_HAB`·`_wildClass`.
//
// 실행:
//   node scripts/t490-thin-villages.js --k <존 DB> [out.json]           ② 51마을 원판 K — 종·출처별 · 항마다 기대값 · 얇은 항(T450 끔/켬)
//   node scripts/t490-thin-villages.js --table <존 DB> <팔=json> …      ① 얇은 마을 표(자 JSON 의 마을·하루 행)
//   node scripts/t490-thin-villages.js --reach <존 DB> [하루ms …]      ④ⓑ 사전 — 원판 밖 하루 왕복 반경 안 개체(직선 · 뭍만)
//   node scripts/t490-thin-villages.js --pair <존 DB> <끔=json> <켬=json> ④ⓑ 짝 — 같은 틀 끈 팔 대 켠 팔(마을마다)
//   node scripts/t490-thin-villages.js --reseed <존 DB> <ha당 개체>    ④ⓐ 예측 — 그 밀도로 다시 심으면 원판 K
//   <존 DB> = 자가 남긴 틀(`T347_KEEP_DB` 의 `wNN-warm.db`) — 마을 중심 셀(`villages.cx/cy`)과 econ 칸을 거기서 읽는다(정본 = 존이 심은 자리).
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = process.argv[2] || '--k';
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
const _l = console.log; console.log = () => {};
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
const F = require(path.join(ROOT, 'server', 'forage'));
console.log = _l;
const say = (s) => process.stdout.write(s + '\n');
const HB = process.env.ZONE_ID;
const Z = ZONES[HB];
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const MOVE = +((ZSRC.match(/const MOVE_SPEED = (\d+);/) || [])[1]);   // 존 정본(px/초)
const CELL = F.CFG.CELL_PX;                                           // 채집 정본 셀(px)
const R = Math.ceil(MOVE * F.CFG.WALK_SEC / CELL);                     // ★생활층 `_t347R` 그 식(⌈걸음 × 도보초 ÷ 셀⌉)
const CS = CH.CHUNK_SIZE, CPC = (CS / 32) * (CS / 32);                  // 청크 한 변 px · 청크 하나의 셀 수
const withWild = (on, f) => { const e0 = process.env.T450_WILD_GROVES; if (on) process.env.T450_WILD_GROVES = '1'; else delete process.env.T450_WILD_GROVES;
  try { return f(); } finally { if (e0 == null) delete process.env.T450_WILD_GROVES; else process.env.T450_WILD_GROVES = e0; } };
// 개체의 출처 — 씨 키 꼴(생성기의 네 갈래가 쓰는 그 키)
const srcOf = (k) => (/^gv\d+_\d+$/.test(k) ? 'ring' : /_wg\d+_\d+_\d+$/.test(k) ? 'wild' : /_g[bh]\d+_\d+$/.test(k) ? 't359' : /^\d+_\d+_\d+$/.test(k) ? 'nat' : 'other');
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

// ── 마을 — 존이 심은 중심 셀(정본 = 존 DB `villages`) ──────────────────────────────────────
function villagesOf(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) { say(`✗ 존 DB 가 없다: ${dbPath}`); process.exit(2); }
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const rows = db.prepare('SELECT name, cx, cy, econ_state FROM villages WHERE zone = ? ORDER BY id').all(HB);
  db.close();
  const meta = {}; for (const v of (T.getZoneVillages(HB) || [])) meta[v.name] = v;
  return rows.map((r) => { let e = null; try { e = JSON.parse(r.econ_state || 'null'); } catch (x) { e = null; }
    return { name: r.name, ccx: r.cx, ccy: r.cy, type: (meta[r.name] || {}).type || '?', fg: (e && e.counts && e.counts.forager) | 0,
      pop: (e && e.npcs && e.npcs.length) | 0, land: e && e.land ? { f: e.land.fertility, w: e.land.wood, s: e.land.stone } : null }; });
}

// ── 종 표 몫 — 생성기 `pickResourceType` 를 **불러서** 잰다(표를 옮겨 적지 않는다) ──────────────
//   생성기 한 칸의 종: `oreCluster && r3 < 0.7 → ore` · `stoneMult > 1.5 && r3 < 0.5 → rock` · 그 밖 `pickResourceType(biome, r3)`.
//   ⇒ 같은 r3 를 1e-4 간격으로 훑어 **그 청크의 종별 몫**을 낸다(유도 · 새 수 0).
const _shareMemo = new Map();
function kindShare(biome, oreCluster, stoneMult) {
  const key = `${biome}|${oreCluster ? 1 : 0}|${stoneMult > 1.5 ? 1 : 0}`;
  let s = _shareMemo.get(key); if (s) return s;
  s = {}; const N = 10000;
  // ⚠`pickResourceType` 는 모듈 밖에 안 나온다 — 생성기 결과로 되묻는다: 한 칸을 굴리는 대신 그 함수 몸통을 소스에서 떠 쓴다
  const src = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
  const at = src.indexOf('function pickResourceType(biome, r) {');
  const body = src.slice(at, src.indexOf('\n}\n', at) + 2);
  const pick = new Function(`${body}\nreturn pickResourceType;`)();
  for (let i = 0; i < N; i++) {
    const r3 = (i + 0.5) / N;
    const t = (oreCluster && r3 < 0.7) ? 'ore' : ((stoneMult > 1.5 && r3 < 0.5) ? 'rock' : pick(biome, r3));
    s[t] = (s[t] || 0) + 1 / N;
  }
  _shareMemo.set(key, s); return s;
}

// ── 원판 한 마을 — 셀마다 날 개체(교란 전 · 존 색인과 같은 생성기) + 항마다 기대값 ─────────────
function boardOf(v, kindsSet, opt) {
  const r = opt && opt.R != null ? opt.R : R;
  const out = { cells: 0, land: 0, water: 0, rock: 0, K: 0, by: {}, bySrc: {}, hab: { forest: 0, edge: 0, riverside: 0, plain: 0 }, chunks: {} };
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const tx = v.ccx + dx, ty = v.ccy + dy;
    if (tx < 0 || ty < 0) continue;                                  // `_t347Scan` 과 같은 경계
    if (opt && opt.ring && Math.max(Math.abs(dx), Math.abs(dy)) <= opt.ring) continue;   // 안쪽 네모 빼기(--reach)
    if (opt && opt.circle && dx * dx + dy * dy > r * r) continue;
    out.cells++;
    const px = tx * 32 + 16, py = ty * 32 + 16;
    const wet = T.isWaterCellLocal(HB, px, py), rk = typeof T.isRockCellLocal === 'function' && T.isRockCellLocal(HB, px, py);
    if (wet) out.water++; else if (rk) out.rock++; else out.land++;
    if (!opt || !opt.noHab) { const h = CH._wildClass(HB, px, py); if (h) out.hab[h]++; }
    const ck = `${Math.floor(tx * 32 / CS)}_${Math.floor(ty * 32 / CS)}`;
    const c = out.chunks[ck] || (out.chunks[ck] = { cells: 0, land: 0 }); c.cells++; if (!wet && !rk) c.land++;
    for (const e of CH.resourcesAtCell(HB, tx, ty, { biome: Z.biome, chunkSize: CS })) {
      if (!kindsSet.has(e.type)) continue;
      out.K++; out.by[e.type] = (out.by[e.type] || 0) + 1;
      const s = srcOf(e.seedKey); out.bySrc[s] = (out.bySrc[s] || 0) + 1;
    }
  }
  return out;
}
// 항마다 기대값 — 자연 산포(청크당 자원 수 × 종 몫 × 원판이 덮는 청크 셀 ÷ 청크 셀 × 뭍 비율) · 링 · 야생
function termsOf(v, b, kindsSet, wildOn) {
  let nat = 0; const natTerms = [];
  for (const ck of Object.keys(b.chunks)) {
    const [cx, cy] = ck.split('_').map(Number);
    const sx = cx * CS + CS / 2, sy = cy * CS + CS / 2;               // 생성기의 대표 점(청크 가운데)
    const sm = T.getStoneMultiplier(HB, sx, sy), oc = T.isOreClusterAt(HB, sx, sy);
    const cnt = Math.round(CH.RESOURCES_PER_CHUNK * Math.max(sm, 1.0)) + (oc ? 3 : 0);
    const sh = kindShare(Z.biome, oc, sm); let fs2 = 0; for (const k of kindsSet) fs2 += sh[k] || 0;
    const c = b.chunks[ck];
    const e = cnt * fs2 * (c.cells / CPC) * (c.cells > 0 ? c.land / c.cells : 0);
    nat += e; natTerms.push({ ck, cnt, share: +fs2.toFixed(4), cells: c.cells, landF: +(c.land / Math.max(1, c.cells)).toFixed(3), e: +e.toFixed(3) });
  }
  // 링 군락 — 존 지형 `groves` 중 이 원판에 걸치는 채집 종(점 n · 반경 r — 생성기가 그 둘로 흩는다)
  const t = T.ZONE_TERRAIN ? T.ZONE_TERRAIN[HB] : null; let ring = 0; const ringG = [];
  const x0 = (v.ccx - R) * 32, x1 = (v.ccx + R + 1) * 32, y0 = (v.ccy - R) * 32, y1 = (v.ccy + R + 1) * 32;
  for (const g of ((t && t.groves) || [])) {
    const kind = g.kind || 'berry_bush'; if (!kindsSet.has(kind) || !g.center) continue;
    const gr = g.r || 140; if (g.center[0] + gr < x0 || g.center[0] - gr > x1 || g.center[1] + gr < y0 || g.center[1] - gr > y1) continue;
    ring += Math.max(1, Math.round(g.n || 3)); ringG.push(`${g.name || '?'}(${kind}×${g.n || 3})`);
  }
  // 야생(T450) — 서식 셀 × 서식 밀도(`WILD_P` = `WILD.D` 유도) × 점 수 × 그 서식 종 중 채집 종 몫
  let wild = 0; const wildT = {};
  if (wildOn) for (const h of Object.keys(CH.WILD_HAB)) {
    const [n, cells] = CH.WILD.D[h] || [0, 0]; const p = cells > 0 ? n / cells : 0;
    const ks = CH.WILD_HAB[h]; const fsh = ks.filter((k) => kindsSet.has(k)).length / ks.length;
    const e = (b.hab[h] || 0) * p * CH.WILD.N * fsh; wild += e; wildT[h] = +e.toFixed(3);
  }
  return { nat: +nat.toFixed(3), natTerms, ring, ringG, wild: +wild.toFixed(3), wildT };
}

// ══ ② --k ══════════════════════════════════════════════════════════════════════════════════
if (MODE === '--k') {
  const VS = villagesOf(process.argv[3]);
  const t0 = Date.now();
  const res = { R, move: MOVE, walkSec: F.CFG.WALK_SEC, cell: CELL, biome: Z.biome, arms: {} };
  for (const [arm, on] of [['끔', false], ['켬', true]]) {
    const kinds = withWild(on, () => new Set(CH.forageKinds()));
    const rows = [];
    for (const v of VS) {
      const b = withWild(on, () => boardOf(v, kinds));
      const tm = withWild(on, () => termsOf(v, b, kinds, on));
      rows.push({ name: v.name, type: v.type, ccx: v.ccx, ccy: v.ccy, fg: v.fg, pop: v.pop, cells: b.cells, land: b.land, water: b.water, rock: b.rock,
        K: b.K, by: b.by, bySrc: b.bySrc, hab: b.hab, exp: { nat: tm.nat, ring: tm.ring, wild: tm.wild, sum: +(tm.nat + tm.ring + tm.wild).toFixed(3) },
        natTerms: tm.natTerms, ringG: tm.ringG, wildT: tm.wildT });
    }
    res.arms[arm] = { kinds: [...kinds], rows };
  }
  const off = res.arms['끔'].rows, on = res.arms['켬'].rows;
  say(`=== T490 ② 원판 K — 네모 R ${R}셀(= ⌈${MOVE}px/초 × ${F.CFG.WALK_SEC}초 ÷ ${CELL}px⌉) · 존 ${HB} biome ${Z.biome} · 마을 ${VS.length} · ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  const sh = kindShare(Z.biome, false, 1);
  say(`종 표 몫(생성기 \`pickResourceType\` 를 불러 잰다 · ${Z.biome}): ${Object.entries(sh).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(' · ')} ⇒ 채집 종(덤불+풀) ${((sh.berry_bush || 0) + (sh.herb || 0)).toFixed(2)}`);
  say(`청크당 자원 수 = round(${CH.RESOURCES_PER_CHUNK} × max(stoneMult,1)) (+3 광맥 무리) · 청크 셀 ${CPC} · 원판 셀 ${(2 * R + 1) ** 2}`);
  say(['마을', '종류', '채집꾼', '뭍/셀', 'K 끔', '덤불', '풀', '자연', '링', '기대(자연+링)', 'K 켬', '야생', '기대 야생', '숲·가장자리·물가 셀'].join(' | '));
  const sorted = off.map((r, i) => [r, on[i]]).sort((a, b) => a[0].K - b[0].K);
  for (const [a, b2] of sorted) say([a.name, a.type, a.fg, `${a.land}/${a.cells}`, a.K, a.by.berry_bush || 0, a.by.herb || 0, a.bySrc.nat || 0, a.bySrc.ring || 0,
    (a.exp.nat + a.exp.ring).toFixed(2), b2.K, b2.bySrc.wild || 0, b2.exp.wild.toFixed(2), `${a.hab.forest}·${a.hab.edge}·${a.hab.riverside}`].join(' | '));
  const tot = (rs, f) => rs.reduce((s, r) => s + f(r), 0);
  say(`합 — 끔 K ${tot(off, (r) => r.K)}(자연 ${tot(off, (r) => r.bySrc.nat || 0)} · 링 ${tot(off, (r) => r.bySrc.ring || 0)}) · 기대 자연 ${tot(off, (r) => r.exp.nat).toFixed(1)} + 링 ${tot(off, (r) => r.exp.ring)} ｜ 켬 K ${tot(on, (r) => r.K)}(야생 ${tot(on, (r) => r.bySrc.wild || 0)} · 기대 ${tot(on, (r) => r.exp.wild).toFixed(1)})`);
  if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(res, null, 1));
  process.exit(0);
}

// ══ ① --table · ④ⓑ --pair ════════════════════════════════════════════════════════════════════
//   한 팔(자 JSON)을 마을마다 모은다 — 걷은 몫 있는 마을·날(D = f·share > 0)만 센다(0 = 0 은 안 센다 · T475 `--summary` 와 같은 분모).
//   ★하루 천장 = ⌊K/2⌋·w̄ · 필요 K = 2·⌈D/w̄⌉ — 헤드리스 하루(`_lifeDaily` 채집 절)를 그대로 따라가면:
//     아침 훑기 N → 딴다 P = min(N, ⌈D/w̄⌉) → 저녁 되살이 g = `actRegrowPerDay(아침 N, K, r)` = min(r·N(1−N/K), **K − 아침 N**)
//     (r = econ 정본 `_actRegrowR` = 4·(h/w̄)/K — r ≥ 2 면 N = K/2 에서 r·K/4 ≥ K/2 라 늘 **K − 아침 N** 이 문다 · 얇은 원판 r 4~9)
//     ⇒ 내일 아침 N' = N − P + (K − N) = K − P ⇒ 정상 상태 N* = K − P 이고 P ≤ N* 여야 하니 **P ≤ K/2**.
//     하루에 딸 수 있는 개체는 원판 K 의 절반 — 천장 ⌊K/2⌋·w̄(홀수 K 는 ⌊K/2⌋·⌈K/2⌉ 번갈이) · 모자람 = D > 천장.
//     그러니 D 를 늘 대려면 **필요 K = 2·⌈D/w̄⌉**(새 수 0 — D·w̄ 는 자 행 · K/2 는 되살이 식의 귀결) · 필요 밀도 ρ = 필요 K ÷ 원판 뭍(ha).
function aggArm(J) {
  const per = new Map(); let VD = 0, SH = 0, SU = 0, EQ = 0, XP = 0, CEIL = 0, HALF = 0, DAYS = 0, NG = 0;
  for (const [tag, r] of Object.entries(J.runs || {})) {
    const prevG = new Map();
    for (const d of (r.curve || [])) { DAYS++; NG += (d.noGrove | 0); }
    for (const d of (r.curve || [])) for (const q of (d.rows || [])) {
      const D = (q.f > 0 && q.mix > 0) ? q.f * q.mix : 0;
      const dg = (typeof q.g === 'number') ? q.g - (prevG.has(q.n) ? prevG.get(q.n) : 0) : null; if (typeof q.g === 'number') prevG.set(q.n, q.g);
      const p = per.get(q.n) || { rows: 0, vd: 0, eq: 0, short: 0, shortU: 0, D: [], N: [], NW: [], S: [], w: [], fg: [], K: q.K, runs: {}, xpick: 0, xn: [], us: [] };
      per.set(q.n, p); p.rows++;
      if (q.xpick > 0) { p.xpick += q.xpick; XP += q.xpick; }
      if (q.xr) { p.xn.push(q.xr.n | 0); if (q.xr.us != null) p.us.push(q.xr.us); }
      if (!(D > 0)) continue;
      p.vd++; VD++; p.D.push(D); p.N.push(q.N); p.NW.push(q.N * q.wBar); p.S.push(q.mix); p.w.push(q.wBar); p.fg.push(q.fg);
      const got = dg != null ? dg : Math.min(q.pick * q.wBar, D);    // 곳간 — 가지 실측(`g`) · 없으면 추정
      if (Math.abs(got - D) <= 1e-4 * Math.max(1, D)) { p.eq++; EQ++; }
      else if (got < D) { p.short++; p.shortU += D - got; SH++; SU += D - got; p.runs[tag] = (p.runs[tag] || 0) + 1;
        if (Math.abs(got - q.N * q.wBar) <= 0.02 * Math.max(1, got)) CEIL++;
        if (q.N <= Math.ceil(q.K / 2)) HALF++; }
    }
  }
  return { per, VD, SH, SU, EQ, XP, CEIL, HALF, DAYS, NG };
}
const kNeed = (D, w) => (w > 0 && D > 0) ? 2 * Math.ceil(D / w - 1e-9) : null;
const parseArms = (xs) => xs.map((a) => { const i = a.indexOf('='); return i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [path.basename(a), a]; });
if (MODE === '--table') {
  const VS = villagesOf(process.argv[3]);
  const arms = parseArms(process.argv.slice(4));
  const kOff = new Map(); { const kinds = withWild(false, () => new Set(CH.forageKinds())); for (const v of VS) kOff.set(v.name, withWild(false, () => boardOf(v, kinds, { noHab: true }))); }
  for (const [nm, f] of arms) {
    const J = JSON.parse(fs.readFileSync(f, 'utf8'));
    const A = aggArm(J);
    say(`\n=== T490 ① 얇은 마을 표 — ${nm}(${f}) · 걷은 몫 있는 마을·날 ${A.VD} · 걷은 = 딴(곳간) ${A.EQ}(${(100 * A.EQ / Math.max(1, A.VD)).toFixed(1)}%) · 모자란 ${A.SH}(${(100 * A.SH / Math.max(1, A.VD)).toFixed(1)}%) · 모자란 단위 ${A.SU.toFixed(1)} · 원판 빈 마을·날(게이트 닫힘 = 수식) ${A.NG}/${A.DAYS * VS.length} ===`);
    say(['마을', '종류', '원판 K(덤불·풀)', '뭍 m²', '채집꾼', '하루 몫 D·share 중앙', 'share 중앙', 'w̄', '서 있는 N 중앙', '딸 수 있는 최대 N·w̄ 중앙', '모자란 날/걷은 날', '판별', '모자란 단위', '몫의 %', '원판 빈 날(수식)', '천장 ⌊K/2⌋·w̄', '필요 K(D 중앙/최대)', '필요 ρ /ha(최대)'].join(' | '));
    const rows = VS.map((v) => ({ v, p: A.per.get(v.name) || null, b: kOff.get(v.name) }));
    rows.sort((a, b) => ((b.p ? b.p.shortU : -1) - (a.p ? a.p.shortU : -1)) || (a.b.K - b.b.K));
    for (const { v, p, b } of rows) {
      const Dm = p ? med(p.D) : null, Sm = p ? med(p.S) : null, Wm = p ? med(p.w) : null;
      const kn = (Dm != null) ? kNeed(Dm, Wm) : null; const Dx = p && p.D.length ? Math.max(...p.D) : null; const knx = Dx != null ? kNeed(Dx, Wm) : null;
      const why = !p ? (b.K === 0 ? '원판 0(게이트 닫힘)' : (v.fg > 0 ? '행 없음(게이트 닫힘)' : '채집꾼 0')) : (p.vd === 0 ? '걷은 몫 0' : '');
      say([v.name, v.type, `${b.K}(${b.by.berry_bush || 0}·${b.by.herb || 0})${p && p.K != null && p.K !== b.K ? ` → 이 팔 ${p.K}` : ''}`, b.land, p ? med(p.fg) : v.fg, Dm != null ? Dm.toFixed(2) : '—', Sm != null ? Sm.toFixed(3) : '—', Wm != null ? Wm.toFixed(2) : '—',
        p && p.N.length ? med(p.N) : '—', p && p.NW.length ? med(p.NW).toFixed(2) : '—', p ? `${p.short}/${p.vd}` : `— ${why}`, p ? Object.entries(p.runs).map(([t, c]) => `${t} ${c}`).join(' ') : '',
        p ? p.shortU.toFixed(1) : '—', p && p.D.length ? (100 * p.shortU / Math.max(1e-9, p.D.reduce((a, x) => a + x, 0))).toFixed(1) : '—',
        `${A.DAYS - (p ? p.rows : 0)}/${A.DAYS}`,
        Wm != null ? (Math.floor((p && p.K != null ? p.K : b.K) / 2) * Wm).toFixed(2) : '—', kn != null ? `${kn}/${knx}` : '—', knx != null && b.land > 0 ? (knx / (b.land / 1e4)).toFixed(1) : '—'].join(' | ') + (why && p ? ` (${why})` : ''));
    }
    const closed = rows.map((x) => ({ n: x.v.name, K: x.b.K, fg: x.v.fg, c: A.DAYS - (x.p ? x.p.rows : 0) })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
    say(`원판이 빈 날(게이트 닫힘 → 수식) 마을 ${closed.length} — ${closed.slice(0, 12).map((x) => `${x.n}(K ${x.K} · ${x.c}날)`).join(' · ')}${closed.length > 12 ? ' …' : ''}`);
    const owners = rows.filter((x) => x.p && x.p.shortU > 0);
    const top = owners.slice(0, 5); const topU = top.reduce((a, x) => a + x.p.shortU, 0);
    say(`주인 상위 5 — ${top.map((x) => `${x.v.name}(K ${x.p.K != null ? x.p.K : x.b.K} · ${x.p.short}날 · ${x.p.shortU.toFixed(1)}단위)`).join(' · ')} = 모자란 단위의 ${(100 * topU / Math.max(1e-9, A.SU)).toFixed(1)}% · 모자란 마을 ${owners.length}`);
    const kn = owners.map((x) => ({ n: x.v.name, K: x.p.K != null ? x.p.K : x.b.K, kn: kNeed(Math.max(...x.p.D), med(x.p.w)), land: x.b.land }));
    say(`모자란 마을의 필요 K(최대 D) — ${kn.map((x) => `${x.n} ${x.K}→${x.kn}(ρ ${(x.kn / (x.land / 1e4)).toFixed(1)}/ha)`).join(' · ')}`);
    //   천장 검산 — 모자란 날 곳간에 든 몫 = 아침 N·w̄ 인가(마을·날 · 받은 것 = 선 것 전부)
    say(`천장 검산 — 모자란 마을·날 ${A.SH} 중 곳간에 든 몫 = 아침 N·w̄ ${A.CEIL}(${(100 * A.CEIL / Math.max(1, A.SH)).toFixed(1)}%) · 아침 N ≤ ⌈K/2⌉ ${A.HALF}(${(100 * A.HALF / Math.max(1, A.SH)).toFixed(1)}%)`);
  }
  process.exit(0);
}
//   ④ⓑ 짝 — 같은 틀에서 끈 팔 대 켠 팔(마을마다 · 모자란 날 · 원판 밖에서 딴 개체 · 찾은 개체 · 찾는 값 µs)
if (MODE === '--pair') {
  const VS = villagesOf(process.argv[3]);
  const [[n0, f0], [n1, f1]] = parseArms(process.argv.slice(4, 6));
  const A0 = aggArm(JSON.parse(fs.readFileSync(f0, 'utf8'))), A1 = aggArm(JSON.parse(fs.readFileSync(f1, 'utf8')));
  const pc = (a, b) => (100 * a / Math.max(1, b)).toFixed(1);
  say(`=== T490 ④ⓑ 짝 — ${n0} → ${n1} · 걷은 몫 있는 마을·날 ${A0.VD} → ${A1.VD} · 걷은 = 딴(곳간) ${pc(A0.EQ, A0.VD)} → ${pc(A1.EQ, A1.VD)}% · 모자란 ${A0.SH} → ${A1.SH} · 모자란 단위 ${A0.SU.toFixed(1)} → ${A1.SU.toFixed(1)} · 원판 밖에서 딴 개체 ${A1.XP} ===`);
  say(['마을', '행(마을·날)', '걷은 날', '모자란 날', '모자란 단위', '밖에서 딴', '밖 개체(찾은) 중앙', '찾는 값 µs 중앙/최대'].join(' | '));
  const rows = VS.map((v) => ({ v, a: A0.per.get(v.name), b: A1.per.get(v.name) })).filter((x) => x.a || x.b);
  rows.sort((x, y) => ((y.a ? y.a.shortU : 0) - (x.a ? x.a.shortU : 0)) || ((y.b ? y.b.xpick : 0) - (x.b ? x.b.xpick : 0)));
  const g = (p, k) => (p ? p[k] : 0);
  let usAll = [];
  for (const { v, a, b } of rows) {
    if (b && b.us.length) usAll = usAll.concat(b.us);
    if (!(g(a, 'short') > 0 || g(b, 'short') > 0 || g(b, 'xpick') > 0 || g(a, 'rows') !== g(b, 'rows'))) continue;
    say([v.name, `${g(a, 'rows')} → ${g(b, 'rows')}`, `${g(a, 'vd')} → ${g(b, 'vd')}`, `${g(a, 'short')} → ${g(b, 'short')}`, `${(a ? a.shortU : 0).toFixed(1)} → ${(b ? b.shortU : 0).toFixed(1)}`,
      g(b, 'xpick'), b && b.xn.length ? med(b.xn) : '—', b && b.us.length ? `${med(b.us)}/${Math.max(...b.us)}` : '—'].join(' | '));
  }
  usAll.sort((x, y) => x - y);
  if (usAll.length) say(`찾는 값(마을·날 한 번 · µs) — 중앙 ${med(usAll)} · p95 ${usAll[Math.floor(usAll.length * 0.95)]} · 최대 ${usAll[usAll.length - 1]} · 합 ${usAll.reduce((s, x) => s + x, 0)} (${usAll.length} 번)`);
  process.exit(0);
}

// ══ ④ⓑ --reach — 원판 밖 하루 왕복 반경 안 개체(교란 전 · 직선 · 뭍) ══════════════════════════════
//   반경 = 걸음이 하루(낮)에 한 번 오갈 수 있는 거리 — 생활층 `_t341TripsPerDay` 의 식(⌊낮 초 ÷ (2·거리 ÷ 걸음)⌋ ≥ 1) 을 거리로 푼 것:
//     r = 걸음 × (하루 ms × 낮 비율 ÷ 1000) ÷ 2(px) ÷ 셀. 낮 비율 = 존 정본 `WORLD.dayPhaseRatio`(새 수 0).
if (MODE === '--reach') {
  const VS = villagesOf(process.argv[3]);
  const { WORLD } = require(path.join(ROOT, 'server', 'zone-config'));
  const days = process.argv.slice(4).map(Number).filter((x) => x > 0);
  if (!days.length) days.push(60000, WORLD.dayLengthMs);
  const names = (process.env.T490_NAMES || '').split(',').filter(Boolean);
  const kinds = new Set(CH.forageKinds());
  say(`=== T490 ④ⓑ 원판 밖 — 하루 왕복 반경(걸음 ${MOVE}px/초 · 낮 비율 ${WORLD.dayPhaseRatio}) · 종 {${[...kinds].join(', ')}} ===`);
  for (const dms of days) {
    const rr = Math.floor(MOVE * (dms * WORLD.dayPhaseRatio / 1000) / 2 / 32);
    say(`하루 ${dms}ms ⇒ 낮 ${(dms * WORLD.dayPhaseRatio / 1000).toFixed(1)}초 ⇒ 왕복 반경 ${rr}셀(${(rr / 1000).toFixed(3)}km · 1셀 = 1m)`);
    for (const v of VS) {
      if (names.length && !names.includes(v.name)) continue;
      const lim = Math.min(rr, 400);                         // ★계측 상한(원판 밖 400셀 — 표만 · 넘으면 ">" 로 적는다)
      const b = boardOf(v, kinds, { R: lim, ring: R, circle: true, noHab: true });
      say(`  ${v.name}: 원판 밖(네모 R ${R} 밖 · 원 ${lim}셀 안) 개체 ${b.K}(${Object.entries(b.by).map(([k, x]) => `${k} ${x}`).join(' · ')}) · 뭍 ${b.land} 셀${rr > lim ? ` · ⚠반경 ${rr} 은 계측 상한 ${lim} 을 넘는다` : ''}`);
    }
  }
  process.exit(0);
}

// ══ ④ⓐ --reseed — 고증 밀도(ha 당 개체)로 다시 심으면 원판 K ═══════════════════════════════════════
//   원판 뭍 셀(1셀 = 1m² · 존 머리말 `MOVE_SPEED` "32px=1m") × 밀도 ÷ 10,000 — 표만(재시딩 = 그 존 DB 새로 · 재민 배포).
if (MODE === '--reseed') {
  const VS = villagesOf(process.argv[3]);
  const dens = +(process.argv[4] || 0);
  if (!(dens > 0)) { say('✗ ha 당 개체를 준다'); process.exit(2); }
  const kinds = new Set(CH.forageKinds());
  say(`=== T490 ④ⓐ 다시 심기 예측 — ha 당 ${dens} 개체 · 원판 뭍 셀(m²) × 밀도 ÷ 10,000 ===`);
  const rows = VS.map((v) => { const b = boardOf(v, kinds, { noHab: true }); return { n: v.name, K0: b.K, land: b.land, K1: +(b.land * dens / 10000).toFixed(1) }; });
  rows.sort((a, b) => a.K0 - b.K0);
  for (const r of rows) say(`  ${r.n}: 지금 K ${r.K0} → ${r.K1}(뭍 ${r.land}m²)`);
  say(`합 — 지금 ${rows.reduce((a, r) => a + r.K0, 0)} → ${rows.reduce((a, r) => a + r.K1, 0).toFixed(0)} · 최소 ${Math.min(...rows.map((r) => r.K1))}`);
  process.exit(0);
}
say('모드: --k <db> [out] | --table <db> <팔=json>… | --pair <db> <끔=json> <켬=json> | --reach <db> [하루ms…] | --reseed <db> <ha당>');
