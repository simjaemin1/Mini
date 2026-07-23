// =============================================================================
// village-layout.js — 마을 레이아웃 생성기 (게임 서버 + 실험실 HTML 공유)
//   순수 함수. 지형은 terrain 인터페이스로 주입 → 같은 코드가 게임/샌드박스 양쪽에서 100% 동일 동작.
//
//   terrain = {
//     isBlocked(cx, cy) : 셀(cx,cy)이 통행불가(물 or 바위)인가  (게임: isTerrainBlockedLocal, 랩: 합성)
//     fert(cx, cy)      : 셀 비옥도 0..1                          (물근접·평지·노이즈)
//     elev(cx, cy)      : 셀 고도 proxy 0..1                      (게임: stoneMult, 랩: 합성)
//   }
//   좌표는 전부 '셀' 단위. 게임은 cell↔world = ×BUILDING_SIZE(32).
//
//   generate(terrain, ccx, ccy, pop) →
//     { center, axis:{toWater,toHill}, houses:[{cx,cy,floors}], floors, farmland:[{cx,cy}](논), dryfield:[{cx,cy}](밭), territory:[[cx,cy]...] }
//   규칙: 5×5 한옥(1층 6명, 층수로 수용↑), 집=산기슭(배산), 농지=강쪽 골짜기(임수),
//         영토=집·농지 seed에서 비옥도 우선 region-grow → 집·농지 전부 영토 안(보장), 셀 단위.
// =============================================================================
(function () {
  const HOUSE_HALF = 2;        // 5×5 한옥 (중심 ±2)
  const HOUSE_CAP_PER_FLOOR = 8;   // ★[4파 §19 움집 재동기] 6→8 — 신규 시딩만 영향(econ housing과 무관 — 레이아웃 생성 산식 전용). ※랩은 고증 v2로 6명/채 선행(단층·침대 6) — 서버 6 재동기는 부지 12×12·침대·문 이관과 한 묶음(백로그)
  const LAND_PER_HOUSE = 400;      // ★채당 영토 배분 400셀(구 '인당 50셀'=8명/채 시절의 400/채와 동치) — 영토 공식의 유일 정본: 채당 수용이 바뀌어도 취락:영토 비율 불변(랩 6명/채 전환 때 인구 기준 공식이 여유띠를 붕괴시킨 것의 서버 측 예방 동기)

  // 5×5 footprint가 전부 LAND인가
  function footprintLand(terrain, cx, cy) {
    for (let dx = -HOUSE_HALF; dx <= HOUSE_HALF; dx++)
      for (let dy = -HOUSE_HALF; dy <= HOUSE_HALF; dy++)
        if (terrain.isBlocked(cx + dx, cy + dy)) return false;
    return true;
  }

  // 배산임수 축: 내리막(=물쪽,임수) / 오르막(=산,배산)
  function axisAt(terrain, cx, cy) {
    const gx = terrain.elev(cx + 1, cy) - terrain.elev(cx - 1, cy);
    const gy = terrain.elev(cx, cy + 1) - terrain.elev(cx, cy - 1);
    const gl = Math.hypot(gx, gy) || 1;
    return { toWater: { x: -gx / gl, y: -gy / gl }, toHill: { x: gx / gl, y: gy / gl } };
  }

  function generate(terrain, ccx, ccy, pop, opts) {
    opts = opts || {};
    const axis = axisAt(terrain, ccx, ccy);

    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], key = (x, y) => x + ',' + y;
    const w = axis.toWater, u = axis.toHill, perp = { x: -w.y, y: w.x };   // perp = 해안선 방향(물에 평행)
    const fertW = opts.fertW != null ? opts.fertW : 0.35;             // 비옥도는 약한 tiebreak (강하면 영토가 강가로만 뻗어 회관 고립) — 거리우선 컴팩트 블롭
    const compactW = opts.compactW != null ? opts.compactW : 0;       // 기본 응집도 0 (landValue에 목초 포함돼 리본 안 됨)
    const distW = opts.distW != null ? opts.distW : 0.1;              // 거리 페널티 ↑ = 회관 중심 둥근 블롭(강가로 안 새게)
    const lval = (x, y) => terrain.landValue ? terrain.landValue(x, y) : terrain.fert(x, y);

    const sizeMul = opts.sizeMul != null ? opts.sizeMul : 1.5;

    // ── 국소 비옥도(soil) — sim land.fertility 역할
    let fsum = 0, fn = 0;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { if (Math.hypot(dx, dy) > 8) continue; const x = ccx + dx, y = ccy + dy; if (terrain.isBlocked(x, y)) continue; fsum += lval(x, y); fn++; }
    const fertScore = fn ? Math.max(0.1, Math.min(1, fsum / fn)) : 0.5;

    // ── 직업 믹스 = 국소 자원에서 emergent (sim jobCapacity: 농부∝비옥도, 어부∝물). 타입은 강제 X — 우세직업이 라벨.
    const fert = opts.fert != null ? opts.fert : fertScore;                  // 토질
    let nd = 999, wdx = 0, wdy = 0; for (let r = 1; r < 140 && nd === 999; r++) for (let a = 0; a < 360; a += 20) { const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180); const x = Math.round(ccx + ca * r), y = Math.round(ccy + sa * r); if (terrain.isWater && terrain.isWater(x, y)) { nd = r; wdx = ca; wdy = sa; break; } }  // wd = 중심→가장가까운물 방향(고정, 배산쪽 결정)
    const water = opts.water != null ? opts.water : Math.max(0.05, Math.min(1, 1 - nd / 140));  // 어장(물 접근) ★리카도: 탐색·감쇠 45/25→140(자원권 R 통일 — 100m 강도 어부를 뽑되 적게. 25셀 절벽이 진짜 원인이었음)
    const wFarm = fert * 0.4, wFish = water * 0.25, wOther = 0.18;            // wOther = 채집·사냥·장인 기본자리
    const wSum = wFarm + wFish + wOther;
    const fShare = wFarm / wSum, hShare = wFish / wSum;                       // 농부·어부 비중
    const farmers = Math.round(pop * fShare), fishers = Math.round(pop * hShare);
    const typeLabel = (hShare > 0.42 && fShare < 0.20) ? 'riverside'
      : (fShare > 0.40 && hShare < 0.15) ? 'plain'
      : (fShare > 0.18 && hShare > 0.18) ? 'mixed' : 'plain';               // 농촌·어촌·농어촌
    const layout = (hShare > 0.55) ? 'shore' : 'cluster';                    // 어업 압도 시 해안선형, 아니면 동네군집
    const settlement = opts.settlement === 'dispersed' ? 'dispersed' : 'nucleated';  // 집촌(모임) vs 산촌(흩어짐)
    const HOUSE_GAP = opts.houseGap != null ? opts.houseGap : (layout === 'shore' ? 12 : 16);

    // ── 논 = 농부 경작지 (sim jobCapacity.farmer 역산). 영토 = 논 + 동네 + 공유지. 크기 emergent.
    // ── 영토 = land.size(확장이 키움) × 스케일. 비옥도 무관 — 비옥도는 K(수용력)·산출만 올림. landSize 없으면 인구 비례 근사.
    const target = Math.round(Math.min((1500 + Math.ceil(pop / HOUSE_CAP_PER_FLOOR) * LAND_PER_HOUSE) * sizeMul, opts.maxCells || 1e9));  // 영토 = base 1500 + 필요 채수×LAND_PER_HOUSE(현행 8명/채선 구 pop×50과 동치 — ceil 잔차만), 단 maxCells(R_max 도보거리)에서 cap → 그 뒤엔 층↑(밀집).
    const numHousesEst = Math.max(2, Math.min(Math.ceil(pop / HOUSE_CAP_PER_FLOOR), Math.round(target / 560)));  // 집 부지 예약 = 실제 필요 채수(구 pop/5 추정 폐기 — 용량 자동 연동)
    // 논 = 경작지 = 농업비중(fShare) × 가용영토. (비옥도는 논 '면적'이 아니라 같은 논의 '산출'을 올림)
    const farmTarget = Math.max(0, Math.round(fShare * (target - numHousesEst * 60) * 0.9));

    // ── 1. 영토: core 작은 disk + 확장(타입별 score). 연속·smooth.
    const own = new Set(); const addOrder = [[ccx, ccy]]; const q = [[ccx, ccy]]; own.add(key(ccx, ccy)); let head = 0;  // addOrder = claim 순서(논·확장 prefix용)
    while (head < q.length) { const [x, y] = q[head++]; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (terrain.isBlocked(nx, ny) || Math.hypot(nx - ccx, ny - ccy) > 5) continue; const k = key(nx, ny); if (own.has(k)) continue; own.add(k); q.push([nx, ny]); addOrder.push([nx, ny]); } }
    const core = new Set(own);
    const nbCount = (c) => { let nb = 0; for (const [dx, dy] of N4) if (own.has(key(c.x + dx, c.y + dy))) nb++; return nb; };
    // 경계 유기화 = '공간 고정' 저주파 워프(평면파 합). 절대좌표 함수 → 영토가 자랄수록 새 고지로 뻗어 모양이 '진화'(자기닮음 확대 X). 중심 위상→마을마다 다름.
    const SHAPE_AMP = opts.organic != null ? opts.organic : 1;
    const Hsh = (n) => { let h = (ccx * 374761393 + ccy * 668265263 + n * 1274126177) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const ph = []; for (let k = 0; k < 6; k++) ph.push(Hsh(k + 1) * 6.2832);
    const warp = (x, y) => (Math.sin(x * 0.050 + y * 0.020 + ph[0]) + 0.7 * Math.sin(-x * 0.018 + y * 0.060 + ph[1]) + 0.6 * Math.sin(x * 0.035 - y * 0.045 + ph[2])) * 5.0 * SHAPE_AMP;  // 공간 고정 ±~12칸 경계 요철
    const scoreOf = layout === 'shore'
      ? (c) => { const inland = Math.abs((c.x - ccx) * w.x + (c.y - ccy) * w.y); const along = Math.abs((c.x - ccx) * perp.x + (c.y - ccy) * perp.y); return 1.0 * nbCount(c) + 0.15 * lval(c.x, c.y) - 0.12 * inland - 0.06 * along; }
      : (c) => fertW * lval(c.x, c.y) + compactW * nbCount(c) - distW * (Math.hypot(c.x - ccx, c.y - ccy) - warp(c.x, c.y));
    // 확장 = 점수 최대 셀부터 (이진 max-heap, O(target·log) — 전체 frontier 스캔 X). 점수는 push 시점 고정(compactW=0이면 정확).
    const inF = new Set(), heap = [];
    const hup = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p].s >= heap[i].s) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
    const hdown = () => { let i = 0; const n = heap.length; for (;;) { let m = i, l = 2 * i + 1, r = l + 1; if (l < n && heap[l].s > heap[m].s) m = l; if (r < n && heap[r].s > heap[m].s) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } };
    const pushF = (x, y) => { if (terrain.isBlocked(x, y)) return; const k = key(x, y); if (own.has(k) || inF.has(k)) return; inF.add(k); heap.push({ x, y, s: scoreOf({ x, y }) }); hup(heap.length - 1); };
    for (const k of own) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of N4) pushF(x + dx, y + dy); }
    while (own.size < target && heap.length) { const c = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; hdown(); } const k = key(c.x, c.y); if (own.has(k)) continue; own.add(k); addOrder.push([c.x, c.y]); for (const [dx, dy] of N4) pushF(c.x + dx, c.y + dy); }

    // ── 물까지 거리 = '지형 고정' 물거리(마을 둘레 박스에서 실제 물칸→육지 BFS). 영토와 무관 → 인구 자라도 dwOf 불변 = 논이 사라졌다 생기지 않음(안정).
    const terrR = Math.sqrt(target / Math.PI), WR = Math.ceil(terrR) + 18;  // 박스가 회관~강 확실히 덮게 여유
    const dw = new Map(); const wq2 = [];
    for (let yy = ccy - WR; yy <= ccy + WR; yy++) for (let xx = ccx - WR; xx <= ccx + WR; xx++) if (terrain.isWater && terrain.isWater(xx, yy)) { dw.set(key(xx, yy), 0); wq2.push([xx, yy]); }
    let wh2 = 0; while (wh2 < wq2.length) { const [x, y] = wq2[wh2++]; const d = dw.get(key(x, y)) + 1; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < ccx - WR || nx > ccx + WR || ny < ccy - WR || ny > ccy + WR) continue; const nk = key(nx, ny); if (dw.has(nk) || (terrain.isWater && terrain.isWater(nx, ny)) || terrain.isBlocked(nx, ny)) continue; dw.set(nk, d); wq2.push([nx, ny]); } }
    const hasWater = wq2.length > 0;
    const dwOf = (x, y) => { const v = dw.get(key(x, y)); return v == null ? 999 : v; };   // 물칸=0, 물가육지=1, 멀수록↑ (고정값)
    const dwC = dwOf(ccx, ccy);                                             // 회관~물 거리(고정)
    const dMax = hasWater ? Math.max(8, dwC - 10) : 999;                    // 논은 회관에서 10칸 앞까지만(버퍼=동네) → 회관이 논에 안 파묻힘
    const D = hasWater ? Math.min(Math.round(terrR * 0.5), dMax) : 999;     // 논 띠 두께 ∝ 영토반경 → 논 비율 일정(작은 마을=얇은 띠/큰 마을=두꺼운 띠). dMax(회관 직전)서 cap

    const CAP = HOUSE_CAP_PER_FLOOR, MAX_FLOORS = 1, SPACE_MIN = 16;         // ★[4파 §19 움집] MAX_FLOORS 4→1 — 다층 주거 폐지(랩 L_MAXFL=1·VL MAX_FLOORS=1 쌍둥이 동기: 초기철기에도 주거는 수혈 압도적 주류). densify 사실상 봉인 — 수용 압력은 전부 집터 확산·영토로. ★기존 DB 마을 마이그레이션: floors>1 행은 유지(materialize가 floors 그대로 실물화 — 인구 결박 방지), 신축(재시딩 존)만 단층
    const fpInTerr = (cx, cy) => { for (let dx = -HOUSE_HALF; dx <= HOUSE_HALF; dx++) for (let dy = -HOUSE_HALF; dy <= HOUSE_HALF; dy++) if (terrain.isBlocked(cx + dx, cy + dy) || !own.has(key(cx + dx, cy + dy))) return false; return true; };
    const farFromWater = (cx, cy) => { for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) if (terrain.isWater && terrain.isWater(cx + dx, cy + dy)) return false; return true; };

    // ── 2. 농지: 논(무논,물가 띠) + 밭(밭농사,내륙). 물 접근↑→논 비중↑(emergent). 집보다 먼저(집이 논을 '지형지물'로 피함).
    const farmCand = [], fieldCand = [], bank = [];
    for (const k of own) {
      const [x, y] = k.split(',').map(Number);
      const d = dwOf(x, y);
      if (d <= 1) { bank.push({ cx: x, cy: y }); continue; }
      if (Math.hypot(x - ccx, y - ccy) < 6) continue;                         // 회관 바로 위만 제외(나머지 동네 코어는 취락 마스크가 뒤에서 제거)
      if (hasWater && d <= dMax) farmCand.push([x, y, d]);                     // 논 후보: 물가 띠(dwOf 2..dMax)
      else fieldCand.push([x, y, d]);                                         // 밭 후보: 내륙(논 띠 너머) / 물 없으면 전부
    }
    farmCand.sort((a, b) => a[2] - b[2]);                                     // 논: 물 가까운 순
    fieldCand.sort((a, b) => a[2] - b[2] || (Math.hypot(a[0] - ccx, a[1] - ccy) - Math.hypot(b[0] - ccx, b[1] - ccy)));  // 밭: 논 띠 바로 뒤부터 바깥으로(물거리 동률은 중심近)
    // 농지 stateful: 기존 논·밭(잠금) — 인구 늘어도 절대 안 줄어듦. 집은 잠긴 농지를 피해서만 생김.
    const lockNong = new Set((opts.existingFarmland || []).filter(f => own.has(key(f.cx, f.cy))).map(f => key(f.cx, f.cy)));
    const lockBat = new Set((opts.existingDryfield || []).filter(f => own.has(key(f.cx, f.cy))).map(f => key(f.cx, f.cy)));
    const riceShare = hasWater ? Math.max(0.15, Math.min(0.85, 0.3 + 0.4 * water)) : 0;   // 물 접근↑→논↑
    const nongTarget = Math.max(lockNong.size, Math.round(farmTarget * riceShare));        // 비례 목표, 단 기존보다 작아질 수 없음
    const nongSet = new Set(lockNong);                                                     // 기존 논 유지
    for (const c of farmCand) { if (nongSet.size >= nongTarget) break; nongSet.add(key(c[0], c[1])); }   // + 신규(물 가까운 순)
    const fieldTarget = Math.max(lockBat.size, Math.max(0, farmTarget - nongSet.size));    // 밭 목표(기존보다 작아질 수 없음)
    let farmland = [...nongSet].map(k => { const [x, y] = k.split(',').map(Number); return { cx: x, cy: y }; });

    const onField = (cx, cy) => { for (let dx = -HOUSE_HALF; dx <= HOUSE_HALF; dx++) for (let dy = -HOUSE_HALF; dy <= HOUSE_HALF; dy++) { const k = key(cx + dx, cy + dy); if (nongSet.has(k) || lockBat.has(k)) return true; } return false; };  // 집 발자국이 논·기존밭 위면 X(농지 파괴 방지)
    // ── 3. 집: 증분. 집은 잠긴 농지(논·기존밭)를 피해서만 생김 → 농지 절대 안 줄어듦. 빈 땅 있으면 집 수 계속 늘고, 꽉 차야 층↑.
    let houses = [];
    const cap = () => houses.reduce((s, h) => s + h.floors * CAP, 0);
    const densify = () => { let t = null; for (const h of houses) if (h.floors < MAX_FLOORS && (!t || h.floors < t.floors)) t = h; if (t) { t.floors++; return true; } return false; };
    const shrink = () => { while (houses.length > 2 && cap() - houses[houses.length - 1].floors * CAP >= pop) houses.pop(); };
    if (layout === 'shore') {
      // ★[4파 §19 물가 회피 부지 재동기 — 랩 W_PEN_K/wDist 이식] 부지 가장자리~물 최소 체비셰프 거리 → K/d² 연속 페널티
      //   (2셀 500·5셀 80·20셀 5점 — 문턱 없음): 강안 늘어서기는 유지하되 최전선일수록 급격히 비싸짐(침수 회피·자연제방 고증).
      //   하드 한계(+2셀 링 물 금지)는 기존 farFromWater(±4 = 발자국 ±2 + 2링)가 이미 소유 — 여기는 연속 비용만 추가.
      const W_PEN_K = 2000;   // 랩 5353 verbatim
      const wDist = (x, y) => { let m = 99; if (!terrain.isWater) return m; for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) if (terrain.isWater(x + dx, y + dy)) { const d = Math.max(Math.abs(dx), Math.abs(dy)) - HOUSE_HALF; if (d < m) m = d; } return m; };
      const cand = [];
      for (const k of own) { const [x, y] = k.split(',').map(Number); if (Math.abs(x - ccx) <= 6 && Math.abs(y - ccy) <= 6) continue; if (!fpInTerr(x, y)) continue; const inland = Math.abs((x - ccx) * w.x + (y - ccy) * w.y), along = Math.abs((x - ccx) * perp.x + (y - ccy) * perp.y); const wdv = wDist(x, y); cand.push({ cx: x, cy: y, d: inland * 3 + along + (wdv < 99 ? W_PEN_K / Math.max(1, wdv * wdv) : 0) }); }
      cand.sort((a, b) => a.d - b.d);
      for (const h of (opts.existingHouses || [])) houses.push({ cx: h.cx, cy: h.cy, floors: h.floors || 1 });
      let ci = 0, guard = 0;
      while ((cap() < pop || houses.length < 2) && guard++ < 400) {
        let placed = false;
        while (ci < cand.length) { const s = cand[ci++]; let ok = true; for (const h of houses) if (Math.hypot(h.cx - s.cx, h.cy - s.cy) < HOUSE_GAP) { ok = false; break; } if (ok) { houses.push({ cx: s.cx, cy: s.cy, floors: 1 }); placed = true; break; } }
        if (!placed && !densify()) break;
      }
      shrink();
    } else if (settlement === 'dispersed') {
      // 산촌(散村): maximin 분산 — 각 농가가 영토 곳곳에 흩어져 제 둘레 땅 경작. 지형지물(경계·논)·다른 집서 멀리.
      const DF = new Map(), dq = [];
      for (const k of own) { const [x, y] = k.split(',').map(Number); let edge = false; for (const [dx, dy] of N4) if (!own.has(key(x + dx, y + dy))) { edge = true; break; } if (edge || nongSet.has(k)) { DF.set(k, 0); dq.push([x, y]); } }
      let dh = 0; while (dh < dq.length) { const [x, y] = dq[dh++]; const d = DF.get(key(x, y)) + 1; for (const [dx, dy] of N4) { const kk = key(x + dx, y + dy); if (own.has(kk) && !DF.has(kk)) { DF.set(kk, d); dq.push([x + dx, y + dy]); } } }
      const hc = [];
      for (const k of own) { const [x, y] = k.split(',').map(Number); if ((x & 1) || (y & 1)) continue; if (onField(x, y) || Math.hypot(x - ccx, y - ccy) < 8) continue; if (!fpInTerr(x, y) || !farFromWater(x, y)) continue; hc.push([x, y]); }
      const hdist = new Map(hc.map(p => [key(p[0], p[1]), Infinity]));
      const bump = (hx, hy) => { for (const p of hc) { const k2 = key(p[0], p[1]), e = Math.hypot(p[0] - hx, p[1] - hy); if (e < hdist.get(k2)) hdist.set(k2, e); } };
      for (const h of (opts.existingHouses || [])) { if (fpInTerr(h.cx, h.cy)) { houses.push({ cx: h.cx, cy: h.cy, floors: h.floors || 1 }); bump(h.cx, h.cy); } }   // 기존 집 유지
      let guard = 0;
      while ((cap() < pop || houses.length < 2) && guard++ < 400) {
        let best = null, bs = -1;
        for (const p of hc) { const df = DF.get(key(p[0], p[1])); if (df == null) continue; const sc = Math.min(df, hdist.get(key(p[0], p[1]))); if (sc > bs) { bs = sc; best = p; } }   // maximin
        if (best && (bs >= SPACE_MIN || houses.length < 2)) { houses.push({ cx: best[0], cy: best[1], floors: 1 }); bump(best[0], best[1]); }
        else if (!densify()) break;
      }
      shrink();
    } else {
      // 집촌(集村): 회관 둘레 컴팩트 취락. 물(논) 반대쪽(뭍쪽)으로 우선 확장 → 동네가 논 쪽으로 안 자람(배산임수: 논 앞, 동네 뒤).
      const SETT_GAP = opts.settGap != null ? opts.settGap : 11;   // 집 중심 최소 간격(겹침 방지 + 컴팩트)
      const hc = [];
      for (const k of own) { const [x, y] = k.split(',').map(Number); if ((x & 1) || (y & 1)) continue; const r = Math.hypot(x - ccx, y - ccy); if (r < 8) continue; if (onField(x, y) || !fpInTerr(x, y) || !farFromWater(x, y)) continue; const toWater = Math.max(0, (x - ccx) * wdx + (y - ccy) * wdy); hc.push([x, y, r + 2 * toWater]); }   // 회관(3×3)+집마당과 안 겹치게 8칸 띄움. 농지 회피 + 물쪽 약한 패널티. 반경 제한 없음 → 집 계속 늘어남.
      hc.sort((a, b) => a[2] - b[2]);   // (물반대·회관근접) 우선
      const spaced = (x, y) => { for (const h of houses) if (Math.hypot(h.cx - x, h.cy - y) < SETT_GAP) return false; return true; };
      for (const h of (opts.existingHouses || [])) if (fpInTerr(h.cx, h.cy)) houses.push({ cx: h.cx, cy: h.cy, floors: h.floors || 1 });   // 기존 집 유지(안 옮김)
      let guard = 0;
      while ((cap() < pop || houses.length < 2) && guard++ < 800) {
        let placed = false;
        for (const p of hc) { if (spaced(p[0], p[1])) { houses.push({ cx: p[0], cy: p[1], floors: 1 }); placed = true; break; } }   // 가장 우선 빈자리
        if (!placed && !densify()) break;   // 꽉 참 → 층↑
      }
      shrink();
    }
    if (!houses.length) houses.push({ cx: ccx, cy: ccy, floors: 1 });
    const floors = Math.max(1, ...houses.map(h => h.floors));                // 대표 층수(최대) — 호환용
    const hfp = (cx, cy) => { for (const h of houses) if (Math.abs(cx - h.cx) <= HOUSE_HALF + 2 && Math.abs(cy - h.cy) <= HOUSE_HALF + 2) return true; return false; };
    // 취락(동네) 마스크 = 회관 + 집들 둘레(±5). 이 안엔 농지 X(동네 내부=집·마당·길). 논·밭은 동네 '바깥'을 둘러쌈(논=물쪽, 밭=뭍쪽).
    const inHall = (x, y) => Math.hypot(x - ccx, y - ccy) <= 8;
    const nearHouse = (x, y, R) => { for (const h of houses) if (Math.hypot(x - h.cx, y - h.cy) <= R) return true; return false; };
    // (논은 nongSet 그대로 — 집 옆이라고 제거하지 않음. 집이 이미 논을 피해 생겼으므로 논은 절대 안 줄어듦.)
    // 밭 stateful: 기존 밭(잠금) 유지 + 신규(물거리 순, 집 둘레, 농부 비례 target까지) 추가. 절대 안 줄어듦.
    const batSet = new Set(lockBat);
    const avoidH = settlement === 'dispersed' ? ((x, y) => nearHouse(x, y, 4)) : ((x, y) => inHall(x, y) || nearHouse(x, y, 6));
    for (const c of fieldCand) { if (batSet.size >= fieldTarget) break; const k = key(c[0], c[1]); if (batSet.has(k) || nongSet.has(k) || avoidH(c[0], c[1])) continue; batSet.add(k); }
    const dryfield = [...batSet].map(k => { const [x, y] = k.split(',').map(Number); return { cx: x, cy: y }; });

    const dock = (fishers >= Math.max(1, Math.round(pop * 0.12))) ? nearestBank(terrain, ccx, ccy, 30) : null;   // 어부 충분하면 선착장

    for (const h of houses) for (let dx = -(HOUSE_HALF + 2); dx <= HOUSE_HALF + 2; dx++) for (let dy = -(HOUSE_HALF + 2); dy <= HOUSE_HALF + 2; dy++) if (!terrain.isBlocked(h.cx + dx, h.cy + dy)) own.add(key(h.cx + dx, h.cy + dy));  // 집+마당(±4) land = 마을 영토에 포함(밖으로 안 삐져나오게)
    const territory = [...own].map(k => k.split(',').map(Number));
    const coreCells = [...core].map(k => k.split(',').map(Number));
    return { center: { cx: ccx, cy: ccy }, hall: { cx: ccx, cy: ccy }, axis, type: typeLabel, fert: +fert.toFixed(2), water: +water.toFixed(2), farmers, fishers, fShare: +fShare.toFixed(2), hShare: +hShare.toFixed(2), fertScore: +fertScore.toFixed(2), houses, floors, farmland, dryfield, territory, core: coreCells, dock, bank };
  }

  // 강가(land 인접 water) 셀 — 어부 작업장(둑에서 낚시, 물 위 X)
  function nearestBank(terrain, cx, cy, maxR) {
    let best = null, bd = Infinity;
    const R = maxR || 24;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (terrain.isBlocked(x, y)) continue;                 // 둑은 land
      // 인접에 물 있나
      let adjWater = false;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (terrain.isWater && terrain.isWater(x + ax, y + ay)) { adjWater = true; break; }
      if (!adjWater) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { cx: x, cy: y }; }
    }
    return best;
  }

  const API = { generate, footprintLand, axisAt, nearestBank, HOUSE_HALF, HOUSE_CAP_PER_FLOOR, LAND_PER_HOUSE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.VillageLayout = API;
})();
