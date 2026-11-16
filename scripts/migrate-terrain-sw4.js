#!/usr/bin/env node
// =============================================================================
// migrate-terrain-sw4 — 서쪽 열 6곳 땅 보강 [배치 16 · 재민 승인 "해봐"]
//
// 대상: 광산6 · 농촌11 · 농촌12 · 농촌21 — 배치 15 실측에서 800일 칼날 위였던 네 곳.
//   (보고_50마을_처방전.md §3. 전부 존 남서 구석 x 7~20% · y 76~95% 에 몰려 있다.)
//
// ★무엇을 바꾸나 — **지형 기하 레이어뿐이다.** 비옥도는 저장된 레이어가 아니라 지형에서 유도된다:
//     server/fertility.js:  fert = 0.12 + 0.62·exp(-dw/80) + 0.18·min(1,dr/60) + 0.08·임상
//   그래서 "비옥도를 칠한다"는 것은 존재하지 않는 조작이고, 실제로 움직일 수 있는 손잡이는
//   **물 거리(dw) · 바위 거리(dr) · 숲(임상)** 셋뿐이다. 이 스크립트는 앞의 둘 중 물과 숲만 만진다
//   (바위는 광산6 의 광맥이 거기 있으므로 건드리지 않는다).
//
// ★병목에 맞춰 최소만 — 배치 15 의 K 분해(kDbg) 결과가 처방을 정했다:
//     광산6 · 농촌11 · 농촌21  → K 병목 prod(식량 흐름)  → **못(小 호수) 1개씩**
//     농촌12                   → K 병목 fuel(연료 흐름)  → **숲 1개**
//   못은 마을 영토(반경 ~33셀) **밖**에 놓는다 — 경작지를 한 셀도 안 먹는다.
//   그래도 물까지 거리가 확 줄어 비옥도(0.62 항)와 water 부존이 함께 오른다.
//
// ★안전장치
//   · 드라이런 기본(--apply 로만 씀) · 백업 선행 · 멱등(이름표로 식별해 교체)
//   · 못 자리는 **원판 전체가 뭍**인 곳만(물·바위 위에 안 놓는다)
//   · 다른 마을 반경 140셀(land 스캔 반경) 안에 새 지물이 들어가면 **중단** — 46곳 무영향 보장
//   · before/after 를 정본 함수로 전수 재측정해 표로 남긴다(추측 금지)
//
// 사용:
//   node scripts/migrate-terrain-sw4.js               # 드라이런(기본) · 1단계
//   node scripts/migrate-terrain-sw4.js --level 2     # 보강량 한 단계 위(못 반경·숲 크기↑)
//   node scripts/migrate-terrain-sw4.js --apply
//   node scripts/migrate-terrain-sw4.js --revert --apply   # 이 스크립트가 넣은 지물만 제거
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TP = path.join(ROOT, 'server', 'hanbando-terrain.json');
const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');
const LEVEL = (() => { const i = process.argv.indexOf('--level'); return i >= 0 ? Math.max(1, Math.min(3, +process.argv[i + 1] || 1)) : 1; })();
const SZ = 32, Z = 'hanbando';
const TAG = 'sw4';   // 이 스크립트가 넣은 지물의 이름표 — 멱등·되돌리기의 기준

// ── 보강 단계 ────────────────────────────────────────────────────────────────
//   1단계 = 병목에 맞춘 최소. 채택 기준(시드 1020 소멸 0/50·좀비 0)을 못 채우면 --level 2, 3.
const LV = {
  1: { pondR: 12, pondD: 55, forestR: 2000 },   // 못 반경 12셀 · 중심에서 55셀 · 숲 반경 2,000px(62셀)
  2: { pondR: 16, pondD: 50, forestR: 2600 },
  3: { pondR: 20, pondD: 46, forestR: 3200 },
}[LEVEL];

// ── 대상 ─────────────────────────────────────────────────────────────────────
//   처방은 배치 15 의 kDbg 실측에서 왔다(보고_50마을_처방전.md §3).
const TARGETS = [
  { name: '광산6', cx: 227, cy: 3078, rx: 'pond', why: 'K 병목 prod(식량) · dw 149셀 · 옥산맥 곁이라 바위는 못 건드린다' },
  { name: '농촌11', cx: 161, cy: 3489, rx: 'pond', why: 'K 병목 prod(식량) · dw 162셀 — 존에서 물이 가장 먼 축' },
  { name: '농촌12', cx: 161, cy: 3853, rx: 'forest', why: 'K 병목 **fuel**(연료) · 임상 0.00 나무 0.45(바닥)인 민둥 평야' },
  { name: '농촌21', cx: 428, cy: 3853, rx: 'pond', why: 'K 병목 prod(식량) · dw 97셀 · 하한에 0.02 모자랐던 자리' },
  // ★[1차 실측 뒤 추가] 위 4곳을 고치고 시드 1020(라이브 시드)을 다시 재니 **좀비 2곳**이 남았다:
  //   농촌6(인구 7 — 보강 **전에도** 좀비였다) · 농촌7(10 → 7).
  //   내 보강이 망가뜨린 게 아니다 — 둘 다 새 지물에서 2,184~2,912셀 밖이고 kDbg.slot(땅에서 오는 항)이
  //   before/after 완전히 같다(99→99 · 109→109). 즉 **원래 물이 먼 자리**이고, 4곳과 같은 진단이다.
  //   실제로 이 여섯은 전부 존 서쪽 열(cx 161~428)에 있다 — 서쪽 가장자리가 통째로 마른 땅이다.
  //   같은 처방(못)을 같은 근거로 준다. "억지"가 아니라 같은 병에 같은 약이다.
  { name: '농촌6', cx: 161, cy: 210, rx: 'pond', why: '물 0.08(바닥) · 식량 1.14 · 배치 15 3시드 평균 인구 11.0 = 51곳 중 최저. 만성 한계' },
  { name: '농촌7', cx: 161, cy: 939, rx: 'pond', why: '물 0.46 · 식량 1.86 · 시드 1020 에서 10 → 7(문턱 위 진동)' },
];

// ── 지형 정본 부트스트랩(econ-lab-real.js 와 같은 줄) ────────────────────────
function boot() {
  // ★after 실측이 before 와 똑같이 나오면 캐시를 못 지운 것이다 — 1차 실행에서 그랬다.
  //   terrain.js 는 `require('./hanbando-terrain.json')` 로 지형을 읽는다. **JSON 도 require 캐시에 있다.**
  //   .js 만 지우면 새로 로드된 terrain.js 가 옛 JSON 객체를 그대로 다시 받는다.
  for (const k of Object.keys(require.cache)) {
    if (/server[\\/](terrain|villages|fertility|livelihood|village-layout|sustain)\.js$/.test(k)) delete require.cache[k];
    if (/hanbando-terrain\.json$/.test(k)) delete require.cache[k];
  }
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const P = require(path.join(ROOT, 'server', 'villages')).__labProbe;
  const ZONE = ZONES[Z]; P.setZoneId(Z);
  const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const isW = (x, y) => { if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isR = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  const isB = (x, y) => { if (!_in(x, y)) return true; return isR(x, y) || isW(x, y); };
  const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: isB, isWaterTileLocal: isW });
  return { ZONES, T, P, ZONE, ta, isW, isR,
    wcell: (cx, cy) => isW(cx * SZ + SZ / 2, cy * SZ + SZ / 2),
    rcell: (cx, cy) => isR(cx * SZ, cy * SZ) };
}
function nearest(pred, cx, cy, maxR) {
  for (let r = 1; r <= maxR; r++) for (let a = 0; a < 360; a += 6) {
    const x = Math.round(cx + Math.cos(a * Math.PI / 180) * r), y = Math.round(cy + Math.sin(a * Math.PI / 180) * r);
    if (pred(x, y)) return r;
  }
  return maxR + 1;
}
function woodyAt(ta, cx, cy) {   // fertility.js 의 임상(반경 8셀 캐노피 비율)과 같은 척도
  let n = 0, f = 0;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { if (dx * dx + dy * dy > 64) continue; n++; if (ta.forestMult(cx + dx, cy + dy) > 1.2) f++; }
  return n ? f / n : 0;
}
// 마을 땅값 — **정본 함수**로 잰다(사본 금지). territory 는 시딩 때만 있으므로 여기선 선별과 같은 근사.
function landOf(P, ta, cx, cy) { try { return P.extractLandParamsApprox(ta, cx, cy, { territory: [] }); } catch (e) { return null; } }
function snap(env, ta, P) {
  const out = {};
  for (const t of TARGETS) {
    const dw = nearest(env.wcell, t.cx, t.cy, 320), dr = nearest(env.rcell, t.cx, t.cy, 320);
    const wo = woodyAt(ta, t.cx, t.cy);
    const FERT = require(path.join(ROOT, 'server', 'fertility'));
    const lp = landOf(P, ta, t.cx, t.cy) || {};
    out[t.name] = { dw, dr, woody: +wo.toFixed(3), fertCell: +FERT.fertAt(dw, dr, wo, false).toFixed(3),
      fertility: lp.fertility, water: lp.water, game: lp.game, wood: lp.wood, stone: lp.stone, ore: lp.ore };
  }
  return out;
}

// ── 못 자리 찾기 — 원판 전체가 뭍인 곳만 ─────────────────────────────────────
function findPond(env, cx, cy, R, D) {
  const cands = [];
  for (let a = 0; a < 360; a += 5) {
    for (const d of [D, D + 6, D + 12, D - 5]) {
      const pcx = Math.round(cx + Math.cos(a * Math.PI / 180) * d), pcy = Math.round(cy + Math.sin(a * Math.PI / 180) * d);
      let ok = true;
      for (let dy = -R - 1; dy <= R + 1 && ok; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
        if (dx * dx + dy * dy > (R + 1) * (R + 1)) continue;
        const x = pcx + dx, y = pcy + dy;
        if (x < 0 || y < 0) { ok = false; break; }
        if (env.wcell(x, y) || env.rcell(x, y)) { ok = false; break; }
      }
      if (ok) cands.push({ pcx, pcy, d: Math.hypot(pcx - cx, pcy - cy) });
    }
  }
  if (!cands.length) return null;
  cands.sort((p, q) => Math.abs(p.d - D) - Math.abs(q.d - D));   // 목표 거리에 가장 가까운 자리
  return cands[0];
}

// =============================================================================
(function main() {
  console.log(`=== migrate-terrain-sw4 — 서쪽 열 6곳 땅 보강 (레벨 ${LEVEL}${REVERT ? ' · 되돌리기' : ''}) ===`);
  console.log(`대상 파일: ${TP}`);
  console.log(`모드: ${APPLY ? '★실행(--apply)' : '드라이런(기본) — 아무것도 안 쓴다'}\n`);

  const T0 = JSON.parse(fs.readFileSync(TP, 'utf8'));
  const z0 = T0[Z];
  const before = { lakes: (z0.lakes || []).length, forests: (z0.forests || []).length, rivers: (z0.rivers || []).length, ridges: (z0.ridges || []).length, ores: (z0.ores || []).length, villages: (z0.villages || []).length };
  const mineLakes = (z0.lakes || []).filter(o => o._tag === TAG).length;
  const mineForests = (z0.forests || []).filter(o => o._tag === TAG).length;
  console.log(`① 현재: 호수 ${before.lakes}(그중 이 스크립트 것 ${mineLakes}) · 숲 ${before.forests}(${mineForests}) · 강 ${before.rivers} · 능선 ${before.ridges} · 광맥 ${before.ores} · 마을 ${before.villages}`);

  // ── 되돌리기 ───────────────────────────────────────────────────────────────
  if (REVERT) {
    const z = T0[Z];
    const nl = (z.lakes || []).length, nf = (z.forests || []).length;
    z.lakes = (z.lakes || []).filter(o => o._tag !== TAG);
    z.forests = (z.forests || []).filter(o => o._tag !== TAG);
    console.log(`② 제거: 호수 ${nl - z.lakes.length}개 · 숲 ${nf - z.forests.length}개`);
    if (!APPLY) { console.log('\n드라이런 — 쓰지 않았다.'); process.exit(0); }
    const bk = `${TP}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(TP, bk); fs.writeFileSync(TP, JSON.stringify(T0));
    console.log(`✅ 되돌렸다. 백업: ${path.basename(bk)}`);
    process.exit(0);
  }

  // ── before 실측 ────────────────────────────────────────────────────────────
  let env = boot();
  const B = snap(env, env.ta, env.P);
  console.log(`\n② before 실측 (정본 함수)`);
  console.log(`   마을      dw   dr  임상  셀비옥  land비옥  land물  사냥  나무`);
  for (const t of TARGETS) { const b = B[t.name];
    console.log(`   ${t.name.padEnd(8)}${String(b.dw).padStart(4)}${String(b.dr).padStart(5)}${b.woody.toFixed(2).padStart(6)}${b.fertCell.toFixed(3).padStart(8)}${String(b.fertility).padStart(10)}${String(b.water).padStart(8)}${String(b.game).padStart(6)}${String(b.wood).padStart(6)}`); }

  // ── 지물 설계 ──────────────────────────────────────────────────────────────
  const addLakes = [], addForests = [];
  for (const t of TARGETS) {
    if (t.rx === 'pond') {
      const spot = findPond(env, t.cx, t.cy, LV.pondR, LV.pondD);
      if (!spot) { console.error(`\n[중단] ${t.name}: 반경 ${LV.pondR}셀 못을 놓을 뭍 원판을 중심 ${LV.pondD}셀 근처에서 못 찾았다.`); process.exit(2); }
      addLakes.push({ name: `${t.name} 방죽`, center: [spot.pcx * SZ + SZ / 2, spot.pcy * SZ + SZ / 2], radius: LV.pondR * SZ, _tag: TAG, _for: t.name });
    } else {
      addForests.push({ name: `${t.name} 숲`, center: [t.cx * SZ + SZ / 2, t.cy * SZ + SZ / 2], rx: LV.forestR, ry: LV.forestR, densityMult: 1.55, _tag: TAG, _for: t.name });
    }
  }
  console.log(`\n③ 넣을 지물 (레벨 ${LEVEL})`);
  for (const L of addLakes) console.log(`   못  ${L.name.padEnd(12)} 중심 px(${L.center}) 반경 ${L.radius}px(${L.radius / SZ}셀) — 마을에서 ${Math.round(Math.hypot(L.center[0] / SZ - TARGETS.find(t => t.name === L._for).cx, L.center[1] / SZ - TARGETS.find(t => t.name === L._for).cy))}셀`);
  for (const F of addForests) console.log(`   숲  ${F.name.padEnd(12)} 중심 px(${F.center}) rx/ry ${F.rx}px(${(F.rx / SZ).toFixed(0)}셀) ×${F.densityMult}`);

  // ── ★다른 마을 무영향 검사 — land 스캔 반경 140셀 안에 걸치면 중단 ─────────
  const allV = z0.villages || [];
  const tgtNames = new Set(TARGETS.map(t => t.name));
  const R_SCAN = 140;
  const clashes = [];
  for (const v of allV) {
    if (tgtNames.has(v.name)) continue;
    const vcx = v.x / SZ, vcy = v.y / SZ;
    for (const L of addLakes) { const d = Math.hypot(L.center[0] / SZ - vcx, L.center[1] / SZ - vcy) - L.radius / SZ; if (d < R_SCAN) clashes.push(`${v.name} ← ${L.name} ${Math.round(d)}셀`); }
    for (const F of addForests) { const d = Math.hypot(F.center[0] / SZ - vcx, F.center[1] / SZ - vcy) - F.rx / SZ; if (d < R_SCAN) clashes.push(`${v.name} ← ${F.name} ${Math.round(d)}셀`); }
  }
  console.log(`\n④ 다른 마을 무영향 검사 (land 스캔 반경 ${R_SCAN}셀)`);
  if (clashes.length) {
    console.error(`   ★${clashes.length}건 겹침 — 46곳 무영향 보장이 깨진다. 중단한다.`);
    clashes.slice(0, 10).forEach(c => console.error(`     ${c}`));
    process.exit(3);
  }
  console.log(`   겹침 0건 — 대상 밖의 마을은 한 곳도 영향받지 않는다 ✅`);

  if (!APPLY) {
    console.log(`\n⑤ 드라이런이라 여기서 멈춘다. 실제로 반영하려면:`);
    console.log(`   node scripts/migrate-terrain-sw4.js --level ${LEVEL} --apply`);
    process.exit(0);
  }

  // ── 적용 ───────────────────────────────────────────────────────────────────
  const bk = `${TP}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(TP, bk);
  console.log(`\n⑤ 백업: ${path.basename(bk)} (${(fs.statSync(bk).size / 1024).toFixed(0)}KB)`);
  const z = T0[Z];
  z.lakes = (z.lakes || []).filter(o => o._tag !== TAG).concat(addLakes);       // 멱등 — 제 것만 갈아끼운다
  z.forests = (z.forests || []).filter(o => o._tag !== TAG).concat(addForests);
  fs.writeFileSync(TP, JSON.stringify(T0));
  console.log(`   저장: 호수 ${before.lakes} → ${z.lakes.length} · 숲 ${before.forests} → ${z.forests.length}`);
  // 나머지 배열은 손대지 않았음을 증명
  const T1 = JSON.parse(fs.readFileSync(TP, 'utf8')), z1 = T1[Z];
  const untouched = ['rivers', 'ridges', 'passes', 'ores', 'villages', 'valleys'];
  const bad = untouched.filter(k => JSON.stringify(z1[k]) !== JSON.stringify(z0[k]));
  console.log(`   무접촉 배열 검사: ${untouched.join('·')} → ${bad.length ? '★변경됨 ' + bad.join(',') : '전부 바이트 동일 ✅'}`);
  const otherZones = Object.keys(T0).filter(k => k !== Z);
  console.log(`   다른 존(${otherZones.length}개) 무접촉: ${otherZones.every(k => JSON.stringify(T1[k]) === JSON.stringify(JSON.parse(fs.readFileSync(bk, 'utf8'))[k])) ? '전부 바이트 동일 ✅' : '★변경됨'}`);

  // ── after 실측 ─────────────────────────────────────────────────────────────
  env = boot();
  const A = snap(env, env.ta, env.P);
  console.log(`\n⑥ after 실측 — before → after`);
  console.log(`   마을        dw        dr      임상        셀비옥      land비옥     land물     사냥      나무`);
  for (const t of TARGETS) {
    const b = B[t.name], a = A[t.name];
    const f = (x, y, d = 2) => `${String(x)}→${String(y)}`.padStart(11);
    console.log(`   ${t.name.padEnd(8)}${f(b.dw, a.dw)}${f(b.dr, a.dr)}${f(b.woody.toFixed(2), a.woody.toFixed(2))}${f(b.fertCell.toFixed(3), a.fertCell.toFixed(3))}${f(b.fertility, a.fertility)}${f(b.water, a.water)}${f(b.game, a.game)}${f(b.wood, a.wood)}`);
  }
  console.log(`\n✅ 완료. 되돌리려면: node scripts/migrate-terrain-sw4.js --revert --apply  (또는 백업 복사)`);
})();
