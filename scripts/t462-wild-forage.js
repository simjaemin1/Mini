#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기)
// =============================================================================
// T462 자 — **야생 군락을 딴다**(종 집합 정본 하나 · 품목 = T458 등가 문법 · 켬 팔 · 물가 0) (2026-09-27)
//
// ★재기만 한다. 제품은 읽기만 하고, 값은 전부 정본에서 읽는다(수를 적지 않는다):
//   · 종 집합 — `chunk.js forageKinds`(그 팔의 손잡이 `T450_WILD_GROVES` 로 부른다) · 서식·밀도 `WILD_HAB`·`WILD.D` · 품목 `GROVE_KINDS`
//   · 품목 판정 — econ 채집 믹스(`foragerYieldsFor`) · `kcal.js kcalPerKg` · 대응 정본 `PV_DEPOSIT_MAP` · 식량 계수 `FORAGE_FOOD_FACTOR`
//   · 걷는 목록 · 개체 하나의 걷는 단위 · 짐당 개체 — 생활층 정본 함수(`_t347ActItems` · `_lifeLootForage` · `_t347PerLoad`)
//     (전리품은 존 `lootOfResource` 그 줄 — 덤불 열매 수 `BUSH_BERRY_N` 만 소스에서 읽고 나머지 글자는 test-forage-act ⑩ 이 대조한다)
//   · 채집 반경 — `forage.CFG.WALK_SEC` × `zone.js MOVE_SPEED` ÷ 셀(T347 `_t347R` 그 식)
//
// 쓰는 법(모드 하나씩):
//   node scripts/t462-wild-forage.js --table                         ⓐ 종 집합 diff · 품목 표 · 걷는 목록(끔/켬) · 개체 하나의 걷는 단위
//   node scripts/t462-wild-forage.js --village [out.json]            51마을 채집 원판 — 딸 개체·걷는 단위(끔/켬 · 마을별)
//   node scripts/t462-wild-forage.js --riverside                     ③ 물가 0 — T415 물가 종 · 수동 53 이 물가에 없는 까닭 · 밀도 출처 후보(표만)
//   node scripts/t462-wild-forage.js --forage-day <base> <branch>    ② T347 자(`t347-forage-day.js`) 두 팔 JSON 요약(입고 = 딴 개체 × w̄)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = process.argv[2] || '--table';
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
const _l = console.log; console.log = () => {};
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const CH = require(path.join(ROOT, 'server', 'chunk'));
console.log = _l;
const say = (s) => process.stdout.write(s + '\n');
const HB = 'hanbando';
const setWild = (on) => { if (on) process.env.T450_WILD_GROVES = '1'; else delete process.env.T450_WILD_GROVES; };
const withWild = (on, f) => { const e0 = process.env.T450_WILD_GROVES; setWild(on); try { return f(); } finally { if (e0 == null) delete process.env.T450_WILD_GROVES; else process.env.T450_WILD_GROVES = e0; } };
const wildOf = (k) => /_wg\d+_\d+_\d+$/.test(k || '');
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
function forageR() {
  const F = require(path.join(ROOT, 'server', 'forage'));
  const mv = +((ZSRC.match(/const MOVE_SPEED = (\d+);/) || [])[1]);
  return Math.round(mv * F.CFG.WALK_SEC / F.CFG.CELL_PX);
}
//   존 `lootOfResource` 그 줄들 — 덤불 열매 수만 소스에서 읽는다(글자 대조는 test-forage-act ⑩)
const BN = +((ZSRC.match(/const BUSH_BERRY_N = (\d+);/) || [])[1]);
const loot = (r) => { const t = r && r.type; if (t === 'berry_bush') return { berry: BN, fiber: 1, twig: 1 }; if (t === 'herb') return { herb: 2 };
  const g = CH.GROVE_KINDS[t]; return g ? { [g.item]: BN } : {}; };
//   생활층 정본 함수 — 전리품 문(`t347LootOf`)만 이어 준다(그 밖 상태는 건드리지 않는다)
function lifeLayer() {
  const _q = console.log; console.log = () => {};
  const V = require(path.join(ROOT, 'server', 'villages.js'));
  console.log = _q;
  const S = V.__p3Bind({}).state;
  V.__p3Bind({ deps: Object.assign({}, S.deps || {}, { t347LootOf: loot }) });
  return V;
}

// ── ⓐ 종 집합 diff · 품목 표 · 걷는 목록 ─────────────────────────────────────────
if (MODE === '--table') {
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const KC = require(path.join(ROOT, 'server', 'kcal.js'));
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  const V = lifeLayer();
  const M = V.playerVillageDepositMap();
  const land = { land: { fertility: 1, wood: 1, stone: 1 } };
  const mix = E.foragerYieldsFor(land), mixKeys = Object.keys(mix), sumW = Object.values(mix).reduce((a, b) => a + b, 0);
  const off = withWild(false, () => CH.forageKinds()), on = withWild(true, () => CH.forageKinds());
  say(`=== T462 ⓐ 종 집합 — 정본 \`chunk.js forageKinds\` ===`);
  say(`끔: {${off.join(', ')}}`);
  say(`켬: {${on.join(', ')}}  (+${on.filter((k) => !off.includes(k)).join(', ')})`);
  const P = {}; for (const c of Object.keys(CH.WILD.D)) { const [n, cells] = CH.WILD.D[c]; P[c] = cells > 0 ? n / cells : 0; }
  say(`\n=== 품목 표 — 야생 넷(T415 · WILD_HAB) · T458 등가 문법 ===`);
  say(['종', '서식', '밀도', '손 품목', 'econ 믹스(무게)', 'PV 대응', 'kcal/kg 손', 'kcal/kg econ', '식량 계수', 'kg', '판정'].join(' | '));
  for (const c of Object.keys(CH.WILD_HAB)) for (const k of CH.WILD_HAB[c]) {
    const it = CH.GROVE_KINDS[k].item, kc = KC.kcalPerKg(it);
    const inMix = mixKeys.includes(it), pv = M[it] ? `${it}→${M[it]}` : '없음';
    const same = kc > 0 && inMix, stands = P[c] > 0;
    const verdict = (same ? 'econ 품목(걷는다)' : '서버 품목뿐') + (stands ? '' : ' · 세계에 없다(밀도 0)') + (on.includes(k) ? ' → 종 집합 ○' : ' → 종 집합 ✗');
    say([k, c, P[c].toExponential(2), it, inMix ? `○(${mix[it].toFixed(2)})` : '✗', pv, kc, KC.kcalPerKg(it), E.FORAGE_FOOD_FACTOR[it] || 0, W.kgOf(it), verdict].join(' | '));
  }
  const wOff = withWild(false, () => V._t347ActItems()) || [], wOn = withWild(true, () => V._t347ActItems()) || [];
  const share = (items) => items.reduce((a, k) => a + (mix[k] || 0), 0) / sumW;
  say(`\n=== 걷는 목록(생활층 정본 \`_t347ActItems\` — T458 문법) ===`);
  say(`끔: ${wOff.join('·')} · 믹스 몫(땅 1·1·1) ${share(wOff).toFixed(4)}`);
  say(`켬: ${wOn.join('·')} · 믹스 몫(땅 1·1·1) ${share(wOn).toFixed(4)}`);
  say(`\n=== 개체 하나의 걷는 단위(\`_lifeLootForage\`) · 짐당 개체(\`_t347PerLoad\`) ===`);
  for (const [arm, ks] of [['끔', off], ['켬', on]]) {
    const u = withWild(arm === '켬', () => ks.map((k) => `${k} ${V._lifeLootForage({ type: k, x: 0, y: 0 })}(짐당 ${V._t347PerLoad(V._lifeLootForage({ type: k, x: 0, y: 0 }))})`));
    say(`${arm}: ${u.join(' · ')}`);
  }
  const offWild = withWild(true, () => CH.WILD_HAB && Object.values(CH.WILD_HAB).flat().filter((k) => !on.includes(k)).map((k) => `${k} ${V._lifeLootForage({ type: k, x: 0, y: 0 })}`));
  say(`켬 집합 밖 야생: ${offWild.join(' · ')}(걷는 단위 0 — 채집꾼이 건너뛰는 개체라 집합에 넣으면 K·게이트만 부푼다)`);
  process.exit(0);
}

// ── 51마을 채집 원판 — 딸 개체 · 걷는 단위(끔/켬) ──────────────────────────────
if (MODE === '--village') {
  const V = lifeLayer();
  const VS = T.getZoneVillages(HB) || [];
  const R = forageR(), Z = ZONES[HB];
  const t0 = Date.now();
  const arm = (on) => withWild(on, () => {
    const K = new Set(CH.forageKinds());
    const rows = []; const tot = { n: 0, u: 0, wild: 0, wildU: 0, byKind: {}, out: {} };
    for (const v of VS) {
      const vx = Math.floor(v.x / 32), vy = Math.floor(v.y / 32); const r = { name: v.name, type: v.type, n: 0, u: 0, wild: 0, wildU: 0, out: 0 };
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        for (const e of CH.resourcesAtCell(HB, vx + dx, vy + dy, { biome: Z.biome, chunkSize: CH.CHUNK_SIZE })) {
          if (!K.has(e.type)) { if (wildOf(e.seedKey)) { r.out++; tot.out[e.type] = (tot.out[e.type] || 0) + 1; } continue; }
          const u = V._lifeLootForage(e);
          r.n++; r.u += u; tot.byKind[e.type] = (tot.byKind[e.type] || 0) + 1;
          if (wildOf(e.seedKey)) { r.wild++; r.wildU += u; }
        }
      }
      tot.n += r.n; tot.u += r.u; tot.wild += r.wild; tot.wildU += r.wildU;
      rows.push(r);
    }
    return { set: [...K], rows, tot };
  });
  const A = arm(false), B = arm(true);
  say(`=== T462 51마을 채집 원판(반경 ${R}셀) — 종 집합 끔 {${A.set.join(', ')}} · 켬 {${B.set.join(', ')}} · ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  say(`끔: 딸 개체 ${A.tot.n} · 걷는 단위 ${A.tot.u} ${JSON.stringify(A.tot.byKind)}`);
  say(`켬: 딸 개체 ${B.tot.n}(야생 ${B.tot.wild}) · 걷는 단위 ${B.tot.u}(야생 ${B.tot.wildU}) ${JSON.stringify(B.tot.byKind)} · 원판 안 집합 밖 야생 ${JSON.stringify(B.tot.out)}`);
  const withW = B.rows.filter((r) => r.wild > 0);
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const ringSame = A.rows.every((r, i) => r.n === B.rows[i].n - B.rows[i].wild && r.u === B.rows[i].u - B.rows[i].wildU);
  say(`판정 — 덤불·풀 몫 끔/켬 ${ringSame ? '★같다' : '✗갈린다'} · 야생을 딸 마을 ${withW.length}/${VS.length}(중앙 ${med(withW.map((r) => r.wild))}개체) · 군락 0 → n 마을 ${B.rows.filter((r, i) => A.rows[i].n === 0 && r.n > 0).length}`);
  const byType = {};
  for (let i = 0; i < VS.length; i++) { const t = VS[i].type; const b = byType[t] || (byType[t] = { v: 0, withWild: 0, n0: 0, n1: 0, u0: 0, u1: 0 }); b.v++; if (B.rows[i].wild > 0) b.withWild++; b.n0 += A.rows[i].n; b.n1 += B.rows[i].n; b.u0 += A.rows[i].u; b.u1 += B.rows[i].u; }
  say(`마을 종류별: ${Object.entries(byType).map(([t, b]) => `${t} ${b.withWild}/${b.v}곳 · 개체 ${b.n0}→${b.n1} · 단위 ${b.u0}→${b.u1}`).join(' | ')}`);
  for (const r of withW) { const a = A.rows.find((q) => q.name === r.name); say(`  ${r.name}(${r.type}): 개체 ${a.n} → ${r.n} · 단위 ${a.u} → ${r.u}(야생 ${r.wild}개체 ${r.wildU}단위) · 집합 밖 야생 ${r.out}`); }
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({ off: A, on: B }, null, 1));
  process.exit(ringSame ? 0 : 1);
}

// ── ③ 물가 0 — 표만(판정 0) ─────────────────────────────────────────────────────
if (MODE === '--riverside') {
  const DOC = fs.readFileSync(path.join(ROOT, '설계', '고증_군락.md'), 'utf8');
  const tbl = DOC.slice(DOC.indexOf('## ② 정량 표'), DOC.indexOf('## ③'));
  const rows = tbl.split('\n').filter((l) => /^\| (버섯밭|나물|벌집|야생포도)/.test(l)).map((l) => l.split('|').map((x) => x.trim()));
  say(`=== ③ 물가 0 — (1) T415 표(설계/고증_군락.md ②)의 서식 칸 ===`);
  for (const r of rows) say(`${r[1]}: 서식 = ${r[4].slice(0, 90)}${r[4].length > 90 ? '…' : ''} · 물가 ${/물가/.test(r[4]) ? '○' : '✗'}`);
  say(`WILD_HAB.riverside = ${JSON.stringify(CH.WILD_HAB.riverside)} · GROVE_KINDS.wild_vine.terrain = ${CH.GROVE_KINDS.wild_vine.terrain}`);
  // (2) 수동 53 — 종 · 서식 · 가장 가까운 물(계획기 `fits` 의 그 원 표본 — 32px 고리 · 24방향)
  const G = (T.ZONE_TERRAIN[HB] && T.ZONE_TERRAIN[HB].groves) || [];
  const D = CH.WILD.RIV_D;
  const nearWater = (x, y, max) => { for (let r = 32; r <= max; r += 32) for (let a = 0; a < 24; a++) { const th = a * Math.PI / 12; if (T.isWaterCellLocal(HB, x + Math.cos(th) * r, y + Math.sin(th) * r)) return r; } return Infinity; };
  const byKind = {}; const dists = [];
  for (const g of G) {
    const [x, y] = g.center; const c = CH._wildClass(HB, x, y) || 'water·rock'; const d = nearWater(x, y, 960);
    const b = byKind[g.kind] || (byKind[g.kind] = { n: 0, cls: {}, near220: 0, near480: 0, far: 0, dmin: Infinity });
    b.n++; b.cls[c] = (b.cls[c] || 0) + 1; if (d <= D) b.near220++; else if (d <= 480) b.near480++; else b.far++; if (d < b.dmin) b.dmin = d; dists.push(d);
  }
  say(`\n=== (2) 수동 군락 ${G.length} — 종 · 서식(_wildClass) · 가장 가까운 물(원 표본 32px 고리 × 24방향 · ≤960px) ===`);
  for (const [k, b] of Object.entries(byKind)) say(`${k}: ${b.n} · 서식 ${JSON.stringify(b.cls)} · 물 ≤${D}px ${b.near220} · ≤480px ${b.near480} · 더 멀다 ${b.far} · 최근 ${Number.isFinite(b.dmin) ? b.dmin + 'px' : '없음(960 밖)'}`);
  // (3) 마을 51 — 종류별 · 군락을 받은 마을(가장 가까운 마을이 받은 것으로 센다)
  const VS = T.getZoneVillages(HB) || [];
  const got = new Map(); for (const g of G) { let best = null, bd = Infinity; for (const v of VS) { const dd = Math.hypot(v.x - g.center[0], v.y - g.center[1]); if (dd < bd) { bd = dd; best = v; } } if (best) got.set(best.name, (got.get(best.name) || []).concat(g.kind)); }
  const byType = {}; for (const v of VS) { const b = byType[v.type] || (byType[v.type] = { v: 0, got: 0, kinds: {} }); b.v++; if (got.has(v.name)) { b.got++; for (const k of got.get(v.name)) b.kinds[k] = (b.kinds[k] || 0) + 1; } }
  say(`\n=== (3) 마을 51 — 종류별 군락을 받은 마을(계획기는 도보 15초 안에 **없는 재료만** 심는다) ===`);
  for (const [t, b] of Object.entries(byType)) say(`${t}: ${b.got}/${b.v}곳 · ${JSON.stringify(b.kinds)}`);
  // (4) 지형 술어가 물가를 보나 — 51마을 원판 셀과 존 전체(한 칸 걸러 표본)
  const R = forageR(); const seen = new Set(); const cls = {};
  for (const v of VS) { const vx = Math.floor(v.x / 32), vy = Math.floor(v.y / 32);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue; const k = (vx + dx) * 65536 + (vy + dy); if (seen.has(k)) continue; seen.add(k);
      const c = CH._wildClass(HB, (vx + dx) * 32 + 16, (vy + dy) * 32 + 16) || 'water·rock'; cls[c] = (cls[c] || 0) + 1; } }
  const Zn = ZONES[HB], W = Math.ceil(Zn.zoneWidth / 32), H = Math.ceil(Zn.zoneHeight / 32), st = 2; const zc = {};
  const t0 = Date.now();
  for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) { const c = CH._wildClass(HB, x * 32 + 16, y * 32 + 16) || 'water·rock'; zc[c] = (zc[c] || 0) + 1; }
  for (const c of Object.keys(zc)) zc[c] *= st * st;
  say(`\n=== (4) 지형 술어(_wildClass · 물가 = ${D}px 네 방향 물) — 51마을 원판 ${seen.size}셀 · 존 전체 ${W}×${H}셀(${st}칸 걸러 × ${st * st}) · ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  say(`원판: ${JSON.stringify(cls)} · 물가 몫 ${(100 * (cls.riverside || 0) / seen.size).toFixed(1)}%`);
  say(`존: ${JSON.stringify(zc)}`);
  // (5) 밀도 출처 후보 — 표만(판정 0 · 재민)
  const land = seen.size - (cls['water·rock'] || 0);
  const cand = [
    ['ⓐ 유도 그대로(물가 0)', 0],
    ['ⓑ 지형을 안 가른 밀도(수동 53 ÷ 원판 뭍 셀)', G.length / land],
    ['ⓒ 이웃 서식 — 가장자리(나물)의 유도 밀도', CH.WILD.D.edge[0] / CH.WILD.D.edge[1]],
    ['ⓓ 이웃 서식 — 숲(버섯밭·벌집)의 유도 밀도', CH.WILD.D.forest[0] / CH.WILD.D.forest[1]],
  ];
  say(`\n=== (5) 물가 밀도의 출처 후보 — 표만(판정 0 · 재민) · 물가 셀 존 전체 ${zc.riverside || 0} · 원판 ${cls.riverside || 0} ===`);
  for (const [n, p] of cand) say(`${n}: 셀당 ${p.toExponential(3)} → 존 전체 군락 ≈ ${Math.round((zc.riverside || 0) * p)}곳(개체 ≈ ${Math.round((zc.riverside || 0) * p * CH.WILD.N)}) · 51마을 원판 ≈ ${((cls.riverside || 0) * p).toFixed(1)}곳`);
  say(`ⓔ 계획기에 물가 군락 줄(재민 · plan-* 계보 · 데이터 손편집 금지) — 그 자료가 수동 53 에 서면 ⓐ 의 유도가 그 수를 그대로 읽는다(코드 무변)`);
  process.exit(0);
}

// ── ② T347 자 두 팔 요약 — 입고 = 딴 개체 × w̄(T347 §3 자기신고 · 누계 `delivered` 를 창으로 안 읽는다) ─────
if (MODE === '--forage-day') {
  const [fa, fb] = [process.argv[3], process.argv[4]];
  const sum = (f) => { const J = JSON.parse(fs.readFileSync(f, 'utf8')); const out = [];
    for (const [tag, r] of Object.entries(J.runs || {})) {
      const cv = r.curve || []; if (!cv.length) continue;
      let pick = 0, inU = 0, form = 0, capZero = 0, back = 0; const p95 = [];
      for (const d of cv) { pick += d.pickDay || 0; form += d.formula || 0; if (!(d.cap > 0)) capZero++; if (d.p95 != null) p95.push(d.p95);
        for (const q of (d.rows || [])) inU += (q.pick || 0) * (q.wBar || 0); }
      back = (cv[cv.length - 1].back || 0) - (cv[0].back || 0);
      const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
      out.push({ tag, days: cv.length, act: `${cv[0].act}→${cv[cv.length - 1].act}`, noGrove: `${cv[0].noGrove}→${cv[cv.length - 1].noGrove}`,
        groves: `${cv[0].groves}→${cv[cv.length - 1].groves}`, K: cv[cv.length - 1].K, pick, inU: +inU.toFixed(2), form: +form.toFixed(2),
        ratio: form > 0 ? +(100 * inU / form).toFixed(2) : null, back, capZero, p95med: med(p95),
        mix: (() => { const L = (cv[cv.length - 1].rows || []).filter((q) => q.mix > 0); return L.length ? +(L.reduce((a, q) => a + q.mix, 0) / L.length).toFixed(4) : null; })() });
    }
    return out; };
  const A = sum(fa), B = sum(fb);
  say(`=== T462 ② 마을 채집 등가 — T347 자 · T450 켬 · 베이스 vs 가지 (입고 = Σ 하루 딴 개체 × 그 마을 w̄) ===`);
  say(['판', '팔', '날', '행위 마을', '군락 0 마을', '군락(개체) 시작→끝', 'K', '딴 개체', '입고(단)', '수식 걷은 몫 합', '비 %', '되살아남', '한도 0 인 날', 'p95 중앙', '걷는 몫 평균'].join(' | '));
  for (const [nm, X] of [['베이스', A], ['가지', B]]) for (const r of X) say([r.tag, nm, r.days, r.act, r.noGrove, r.groves, r.K, r.pick, r.inU, r.form, r.ratio, r.back, r.capZero, r.p95med, r.mix].join(' | '));
  process.exit(0);
}
// ── ② 원정 길 채집 — T441 실서버 판 그대로(존 부팅 · 8마을 · `WAR_FIXTURE=siegehold` · 세 손잡이 켬 · 하루 8분) + `T450_WILD_GROVES` 켬 ──
//   node scripts/t462-wild-forage.js --march-real <서버 코드 자리> <이름> [포트 차이] [끝 날]
//   ⚠자는 **존의 전쟁 로그 한 줄**이다(war-core 가 적는 "짐이 먹는다 … 길에서 딴 것 n포기 m단위") — 세지 않고 읽기만 한다.
if (MODE === '--march-real') {
  const { spawn } = require('child_process');
  const SR = path.resolve(process.argv[3] || ROOT), TAG = process.argv[4] || 'arm', OFF = parseInt(process.argv[5] || '0', 10) || 0;
  const END = parseInt(process.argv[6] || '5', 10);
  const DAY = parseInt(process.env.T462_DAY_MS || '480000', 10);
  const DIR = '/tmp/t462'; fs.mkdirSync(DIR, { recursive: true });
  const SECRET = 't462-' + TAG, CP = 3930 + OFF, ZP = 3940 + OFF;
  for (const f of [`${DIR}/m-c-${TAG}.db`, `${DIR}/m-z-${TAG}.db`]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  const logf = `${DIR}/m-${TAG}.log`, fd = fs.openSync(logf, 'w');
  const c = spawn(process.execPath, [path.join(SR, 'server/central.js')], { cwd: SR, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `${DIR}/m-c-${TAG}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(SR, 'server/zone.js')], { cwd: SR, stdio: ['ignore', fd, fd],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: `${DIR}/m-z-${TAG}.db`, ENABLE_VILLAGES: '1', VILLAGE_MAX: '8', VILLAGE_DAY_MS: String(DAY), WAR_FIXTURE: 'siegehold',
      T423_RATION_ACT: '1', T441_FORAGE_MARCH: '1', T347_FORAGE_ACT: '1', T450_WILD_GROVES: '1', VILLAGE_WAR_LOG: '1' }) });   // ★전쟁 링 버퍼 드레인(테스트 훅 · T441 판이 읽은 그 줄)
  const t0 = Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    let lines = [];
    while (Date.now() - t0 < 90 * 60000) {
      await sleep(15000);
      let txt = ''; try { txt = fs.readFileSync(logf, 'utf8'); } catch (e) { txt = ''; }
      lines = txt.split('\n').filter((l) => /⚔️/.test(l));
      const eat = lines.filter((l) => /짐이 먹는다/.test(l));
      const last = eat.length ? +((/D(\d+) /.exec(eat[eat.length - 1]) || [])[1] || 0) : 0;
      if (last >= END || lines.some((l) => /철수|종전|withdraw/.test(l) && /D\d+/.test(l) && eat.length >= 3)) break;
    }
    try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {}
    const eat = lines.filter((l) => /짐이 먹는다/.test(l)).map((l) => { const m = /D(\d+) (\S+) 짐이 먹는다.*?길에서 딴 것 (\d+)포기 ([\d.]+)단위\(지난 칸 (\d+) · 군락 셀 (\d+)/.exec(l); return m ? { day: +m[1], v: m[2], picks: +m[3], units: +m[4], cells: +m[5], groves: +m[6] } : { raw: l.slice(0, 200) }; });
    const out = { root: SR, tag: TAG, dayMs: DAY, secs: Math.round((Date.now() - t0) / 1000), fixture: lines.filter((l) => /FIXTURE/.test(l)).map((l) => l.slice(0, 200)), eat, war: lines.slice(0, 40).map((l) => l.slice(0, 240)) };
    fs.writeFileSync(`${DIR}/march-${TAG}.json`, JSON.stringify(out, null, 1));
    say(`=== T462 원정 실서버(${TAG}) · ${out.secs}s ===`); for (const l of out.fixture) say(l); for (const e of eat) say(JSON.stringify(e));
    process.exit(0);
  })();
} else
say('모드: --table | --village [out] | --riverside | --forage-day <base.json> <branch.json> | --march-real <root> <tag> [portOff] [endDay]');
