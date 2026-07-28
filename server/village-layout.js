// =============================================================================
// village-layout.js — 마을 레이아웃 생성기 (게임 서버 + 실험실 HTML 공유)
//   순수 함수. 지형은 terrain 인터페이스로 주입 → 같은 코드가 게임/샌드박스 양쪽에서 100% 동일 동작.
//
//   terrain = {
//     isBlocked(cx, cy) : 셀(cx,cy)이 통행불가(물 or 바위)인가
//     fert(cx, cy)      : 셀 비옥도 0..1
//     elev(cx, cy)      : 셀 고도 proxy 0..1
//     isWater(cx, cy)   : 물 셀인가 (논 존닝·물거리 BFS용)
//   }
//   좌표는 전부 '셀' 단위. 게임은 cell↔world = ×BUILDING_SIZE(32).
//
//   ★[전부 이식 — 랩(전쟁·마을실험실) VillageLayout 정본 동기, 사용자 지시]
//   generate(terrain, ccx, ccy, pop, opts) →
//     { center, hall, axis, type, houses:[{cx,cy,floors}], floors, farmland(개간 논), dryfield(개간 밭),
//       nongZone(논 존닝 잠재 메뉴 — 개간 런타임 이관 시 potSet 원료), territory, core, dock, bank }
//   규칙: ★구역 기하=전부 원[사용자 확정]: 건물·벽=사각 발자국, 땅의 권역(부지·마당·완충·골목)=원(inDisc 격자점 중심).
//         6명/채 단층 움집(고증 v2 재동기 — 구 8명/채 폐지), 채당 영토 400셀, 논=물가 7줄 존닝 스트립,
//         밭=창발(여기선 균형해가 초기 기경지만 산출), 실경작=인구×landNeedPer(보즈럽 비옥도 반비례).
//   ※서버는 아직 개간·곳간 런타임이 없음 — 시딩·프리뷰 산식만 이 모듈이 담당(런타임 이관은 백로그).
// =============================================================================
(function () {
  const HOUSE_HALF = 2;            // (레거시 호환 수출 — 서버 materialize 5×5 한옥 건물 반폭. 부지·판정은 아래 원판이 정본)
  const HOUSE_CAP_PER_FLOOR = 6;   // ★[고증 v2 재동기 — 랩 선행분 이관] 8→6: 단층 움집 6명(송국리 장방형 24~28㎡ 발굴 추정 5~6명의 상단). 신규 시딩만 영향(econ housing 무관)
  const LAND_PER_HOUSE = 400;      // ★채당 영토 배분 400셀 — 영토 공식의 유일 정본: 채당 수용이 바뀌어도 취락:영토 비율 불변
  const LAND_NEED = 8;             // 인당 기준 경작칸(비옥 0.55 기준 — landNeedPer가 비옥도로 조정)
  const HALL_YARD = 10, LOT_R = 6.5, FARM_GAP = 2, ALLEY_R = 12.5, HALL_CLEAR = HALL_YARD + LOT_R;   // ★구역 기하 정본[사용자 확정 "전부 원으로 통일"]: 마당 원 r10·부지 원 r6.5·완충=부지 기준 정확 2타일 등방·골목 r12.5·HALL_CLEAR=마당 원과 부지 원이 셀 하나도 안 겹치는 최소 중심거리[사용자 지시 "초기 두 채 침범 금지"]
  const inDisc = (cx, cy, R, x, y) => { const ax = x + 0.5 - cx, ay = y + 0.5 - cy; return ax * ax + ay * ay < R * R; };   // 셀 중심(x+.5,y+.5)이 격자점(cx,cy) 반경 R 안(엄격<) — 전 구역 판정의 단일 원식(렌더도 같은 셀 집합=판정과 픽셀 일치)
  const discCells = (R) => { const o = [], B = Math.ceil(R); for (let dx = -B; dx < B; dx++) for (let dy = -B; dy < B; dy++) if ((dx + 0.5) * (dx + 0.5) + (dy + 0.5) * (dy + 0.5) < R * R) o.push([dx, dy]); return o; };
  const LOT_CELLS = discCells(LOT_R), LOT_GUARD = discCells(LOT_R + FARM_GAP), YARD_CELLS = discCells(HALL_YARD);   // 부지 원판(124셀 — 구 12×12 등적·적도폭 12), 부지+2 침수·완충 원판, 큰집 마당 원판(316셀)
  const houseFarmBlock = (hx, hy, x, y) => inDisc(hx, hy, LOT_R + FARM_GAP, x, y), hallFarmBlock = (hx, hy, x, y) => inDisc(hx, hy, HALL_YARD + FARM_GAP, x, y);   // 농지 완충: 부지/마당 밖 정확 2타일(원이라 비대칭 구조적 불가)
  const landNeedPer = (fv, base) => base * Math.max(0.6, Math.min(2.5, 0.55 / Math.max(0.05, (fv != null ? fv : 0.55))));   // ★보즈럽 조방화: 인당 경작칸=기준×(0.55/비옥), 0.6~2.5 클램프 — 저비옥=조방·고비옥=집약(랩 정본 동식)
  const _dt1d = (f, n, d, v, z) => { let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20; for (let q = 1; q < n; q++) { let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); } k++; v[k] = q; z[k] = s; z[k + 1] = 1e20; } k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; } };   // Felzenszwalb 1D 제곱거리 변환
  const waterEDT = (t, x0, y0, x1, y1) => {   // ★정확 유클리드 물거리장(2패스 EDT) — 물가세·침수 계열 거리 정본(랩 동기[사용자 #15 사례]): ±14 박스=무과세 문턱, BFS=대각 √2 저과세 — 둘 다 탈락. 존닝 dwOf(BFS)="걸어서 물까지"라 별개 정본
    const W = x1 - x0 + 1, Hh = y1 - y0 + 1, g = new Float64Array(W * Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) g[y * W + x] = (t.isWater && t.isWater(x0 + x, y0 + y)) ? 0 : 1e20;
    const n = Math.max(W, Hh), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), f = new Float64Array(n);
    for (let x = 0; x < W; x++) { for (let y = 0; y < Hh; y++) f[y] = g[y * W + x]; _dt1d(f, Hh, d, v, z); for (let y = 0; y < Hh; y++) g[y * W + x] = d[y]; }
    for (let y = 0; y < Hh; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; _dt1d(f, W, d, v, z); for (let x = 0; x < W; x++) g[y * W + x] = d[x]; }
    return { at: (x, y) => { const ix = x - x0, iy = y - y0; if (ix < 0 || iy < 0 || ix >= W || iy >= Hh) return 999; const s = g[iy * W + ix]; return s >= 1e19 ? 999 : Math.sqrt(s); } };
  };

  function footprintLand(terrain, cx, cy) { for (const [dx, dy] of LOT_CELLS) if (terrain.isBlocked(cx + dx, cy + dy)) return false; return true; }   // 부지=원판

  function axisAt(terrain, cx, cy) {
    const gx = terrain.elev(cx + 1, cy) - terrain.elev(cx - 1, cy);
    const gy = terrain.elev(cx, cy + 1) - terrain.elev(cx, cy - 1);
    const gl = Math.hypot(gx, gy) || 1;
    return { toWater: { x: -gx / gl, y: -gy / gl }, toHill: { x: gx / gl, y: gy / gl } };
  }

  function generate(terrain, ccx, ccy, pop, opts) {
    opts = opts || {};
    const t = terrain;
    const axis = axisAt(t, ccx, ccy);
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], key = (x, y) => x + ',' + y;
    const w = axis.toWater, perp = { x: -w.y, y: w.x };
    const fertW = opts.fertW != null ? opts.fertW : 0.35;
    const compactW = opts.compactW != null ? opts.compactW : 0;
    const distW = opts.distW != null ? opts.distW : 0.1;
    const lval = (x, y) => t.landValue ? t.landValue(x, y) : t.fert(x, y);
    const sizeMul = opts.sizeMul != null ? opts.sizeMul : 1.5;

    // ── 국소 비옥도(soil)
    let fsum = 0, fn = 0;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { if (Math.hypot(dx, dy) > 8) continue; const x = ccx + dx, y = ccy + dy; if (t.isBlocked(x, y)) continue; fsum += lval(x, y); fn++; }
    const fertScore = fn ? Math.max(0.1, Math.min(1, fsum / fn)) : 0.5;

    // ── 직업 믹스 = 국소 자원에서 emergent
    const fert = opts.fert != null ? opts.fert : fertScore;
    let nd = 999, wdx = 0, wdy = 0; for (let r = 1; r < 140 && nd === 999; r++) for (let a = 0; a < 360; a += 20) { const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180); const x = Math.round(ccx + ca * r), y = Math.round(ccy + sa * r); if (t.isWater && t.isWater(x, y)) { nd = r; wdx = ca; wdy = sa; break; } }
    const water = opts.water != null ? opts.water : Math.max(0.05, Math.min(1, 1 - nd / 140));
    const wFarm = fert * 0.4, wFish = water * 0.25, wOther = 0.18;
    const wSum = wFarm + wFish + wOther;
    const fShare = wFarm / wSum, hShare = wFish / wSum;
    const farmers = Math.round(pop * fShare), fishers = Math.round(pop * hShare);
    const typeLabel = (hShare > 0.42 && fShare < 0.20) ? 'riverside'
      : (fShare > 0.40 && hShare < 0.15) ? 'plain'
      : (fShare > 0.18 && hShare > 0.18) ? 'mixed' : 'plain';
    const layout = (hShare > 0.55) ? 'shore' : 'cluster';
    const settlement = opts.settlement === 'dispersed' ? 'dispersed' : 'nucleated';
    const HOUSE_GAP = opts.houseGap != null ? opts.houseGap : (layout === 'shore' ? 18 : 22);   // ★부지 원(r6.5) 비겹침: d≥13이면 충분 — 18/22는 집 사이 골목 여유 포함(랩 동기)

    // ── 영토 = base 1500 + 필요 채수×LAND_PER_HOUSE (유일 정본 공식)
    const target = Math.round(Math.min((1500 + Math.ceil(pop / HOUSE_CAP_PER_FLOOR) * LAND_PER_HOUSE) * sizeMul, opts.maxCells || 1e9));
    const numHousesEst = Math.max(2, Math.min(Math.ceil(pop / HOUSE_CAP_PER_FLOOR), Math.round(target / 560)));
    const farmTarget = Math.max(0, Math.round(fShare * (target - numHousesEst * 60) * 0.9));   // 논 존닝 규모(잠재 메뉴 — 실경작은 아래 균형해)

    // ── 1. 영토: core 작은 disk + 확장(타입별 score, max-heap). 경계=공간 고정 워프(유기 요철)
    const own = new Set(); const addOrder = [[ccx, ccy]]; const q = [[ccx, ccy]]; own.add(key(ccx, ccy)); let head = 0;
    while (head < q.length) { const [x, y] = q[head++]; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (t.isBlocked(nx, ny) || Math.hypot(nx - ccx, ny - ccy) > 5) continue; const k = key(nx, ny); if (own.has(k)) continue; own.add(k); q.push([nx, ny]); addOrder.push([nx, ny]); } }
    const core = new Set(own);
    const nbCount = (c) => { let nb = 0; for (const [dx, dy] of N4) if (own.has(key(c.x + dx, c.y + dy))) nb++; return nb; };
    const SHAPE_AMP = opts.organic != null ? opts.organic : 1;
    const Hsh = (n) => { let h = (ccx * 374761393 + ccy * 668265263 + n * 1274126177) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const ph = []; for (let k = 0; k < 6; k++) ph.push(Hsh(k + 1) * 6.2832);
    const warp = (x, y) => (Math.sin(x * 0.050 + y * 0.020 + ph[0]) + 0.7 * Math.sin(-x * 0.018 + y * 0.060 + ph[1]) + 0.6 * Math.sin(x * 0.035 - y * 0.045 + ph[2])) * 5.0 * SHAPE_AMP;
    const scoreOf = layout === 'shore'
      ? (c) => { const inland = Math.abs((c.x - ccx) * w.x + (c.y - ccy) * w.y); const along = Math.abs((c.x - ccx) * perp.x + (c.y - ccy) * perp.y); return 1.0 * nbCount(c) + 0.15 * lval(c.x, c.y) - 0.12 * inland - 0.06 * along; }
      : (c) => fertW * lval(c.x, c.y) + compactW * nbCount(c) - distW * (Math.hypot(c.x - ccx, c.y - ccy) - warp(c.x, c.y));
    const inF = new Set(), heap = [];
    const hup = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p].s >= heap[i].s) break; const tt = heap[p]; heap[p] = heap[i]; heap[i] = tt; i = p; } };
    const hdown = () => { let i = 0; const n = heap.length; for (;;) { let m = i, l = 2 * i + 1, r = l + 1; if (l < n && heap[l].s > heap[m].s) m = l; if (r < n && heap[r].s > heap[m].s) m = r; if (m === i) break; const tt = heap[m]; heap[m] = heap[i]; heap[i] = tt; i = m; } };
    const pushF = (x, y) => { if (t.isBlocked(x, y)) return; const k = key(x, y); if (own.has(k) || inF.has(k)) return; inF.add(k); heap.push({ x, y, s: scoreOf({ x, y }) }); hup(heap.length - 1); };
    for (const k of own) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of N4) pushF(x + dx, y + dy); }
    while (own.size < target && heap.length) { const c = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; hdown(); } const k = key(c.x, c.y); if (own.has(k)) continue; own.add(k); addOrder.push([c.x, c.y]); for (const [dx, dy] of N4) pushF(c.x + dx, c.y + dy); }

    // ── 지형 고정 물거리(박스 BFS, 영토 무관 → dwOf 불변 = 논 안정)
    const terrR = Math.sqrt(target / Math.PI), WR = Math.ceil(terrR) + 18;
    const dw = new Map(); const wq2 = [];
    for (let yy = ccy - WR; yy <= ccy + WR; yy++) for (let xx = ccx - WR; xx <= ccx + WR; xx++) if (t.isWater && t.isWater(xx, yy)) { dw.set(key(xx, yy), 0); wq2.push([xx, yy]); }
    let wh2 = 0; while (wh2 < wq2.length) { const [x, y] = wq2[wh2++]; const d = dw.get(key(x, y)) + 1; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < ccx - WR || nx > ccx + WR || ny < ccy - WR || ny > ccy + WR) continue; const nk = key(nx, ny); if (dw.has(nk) || (t.isWater && t.isWater(nx, ny)) || t.isBlocked(nx, ny)) continue; dw.set(nk, d); wq2.push([nx, ny]); } }
    const hasWater = wq2.length > 0;
    const dwOf = (x, y) => { const v = dw.get(key(x, y)); return v == null ? 999 : v; };
    const dwC = dwOf(ccx, ccy), dMax = hasWater ? Math.max(8, dwC - 10) : 999;
    const dNong = hasWater ? Math.min(dMax, 8) : 999, dBat = dNong + 7;   // ★두께 고정 7줄[사용자 확정]: 논=물가 7줄(물거리 2~8)·밭 1순위=바로 뒤 7줄(9~15 밀착)·2순위=행 단위 증층(16줄~)

    const CAP = HOUSE_CAP_PER_FLOOR, MAX_FLOORS = 1, SPACE_MIN = 20;   // 단층 6명 — 수용 압력은 전부 집터 확산·영토 확장으로
    const fpInTerr = (cx, cy) => { for (const [dx, dy] of LOT_CELLS) if (t.isBlocked(cx + dx, cy + dy) || !own.has(key(cx + dx, cy + dy))) return false; return true; };
    const farFromWater = (cx, cy) => { for (const [dx, dy] of LOT_GUARD) if (t.isWater && t.isWater(cx + dx, cy + dy)) return false; return true; };   // ★부지 원+2 완충 원 물 X(침수 회피, 자연제방 고증)
    const W_PEN_K = 2000;   // 물가 페널티 강도(랩 verbatim)
    const WF = waterEDT(t, ccx - WR, ccy - WR, ccx + WR, ccy + WR);   // 유클리드 물거리장(박스=dw BFS와 동일 범위)
    const wDist = (x, y) => { const v = WF.at(x, y); return v >= 999 ? 99 : Math.max(1, v - LOT_R); };   // ★물가세 거리=정확 유클리드 EDT 조회(랩 동기[사용자 #15 사례] — ±14 박스 무과세 문턱 폐지, 전 영토 연속 과세+O(1))

    // ── 2. 농지: 논=지형 존닝(물가 7줄 스트립), 밭=창발(여기선 균형해가 초기 기경지만) — 집보다 먼저(집이 논 피함)
    const farmCand = [], bank = [];
    for (const k of own) { const [x, y] = k.split(',').map(Number); const d = dwOf(x, y); if (d <= 1) { bank.push({ cx: x, cy: y }); continue; } if (hallFarmBlock(ccx, ccy, x, y)) continue; if (hasWater && d <= dNong) farmCand.push([x, y, d]); }   // 회관 마당 원(r10)+완충 2타일=r12 제외(유일 정본)
    farmCand.sort((a, b) => a[2] - b[2]);   // 논: 물 가까운 순
    // 농지 stateful: 기존 논·밭 잠금 — 인구 늘어도 절대 안 줄어듦
    const lockNong = new Set((opts.existingFarmland || []).filter(f => own.has(key(f.cx, f.cy))).map(f => key(f.cx, f.cy)));
    const lockBat = new Set((opts.existingDryfield || []).filter(f => own.has(key(f.cx, f.cy))).map(f => key(f.cx, f.cy)));
    const riceShare = hasWater ? Math.max(0.15, Math.min(0.85, 0.3 + 0.4 * water)) : 0;
    const nongTarget = Math.max(lockNong.size, Math.round(farmTarget * riceShare));
    const nongSet = new Set(lockNong);
    for (const c of farmCand) { if (nongSet.size >= nongTarget) break; nongSet.add(key(c[0], c[1])); }
    const nongZone = [...nongSet].map(k => { const [x, y] = k.split(',').map(Number); return { cx: x, cy: y }; });   // ★논 존닝 전체(잠재 메뉴 — 개간 런타임 이관 시 potSet 원료)
    let farmland = [...lockNong].map(k => { const [x, y] = k.split(',').map(Number); return { cx: x, cy: y }; });
    const onField = (cx, cy) => { for (const [dx, dy] of LOT_CELLS) { const k = key(cx + dx, cy + dy); if (nongSet.has(k) || lockBat.has(k)) return true; } return false; };
    let houses = [];
    const cap = () => houses.reduce((s, h) => s + h.floors * CAP, 0);
    const densify = () => { let tt = null; for (const h of houses) if (h.floors < MAX_FLOORS && (!tt || h.floors < tt.floors)) tt = h; if (tt) { tt.floors++; return true; } return false; };
    const shrink = () => { while (houses.length > 2 && cap() - houses[houses.length - 1].floors * CAP >= pop) houses.pop(); };
    if (layout === 'shore') {
      const cand = [];
      for (const k of own) { const [x, y] = k.split(',').map(Number); if (Math.hypot(x - ccx, y - ccy) < HALL_CLEAR) continue; /*★HALL_CLEAR: 부지 원이 마당 원 침범 불가*/ if (!fpInTerr(x, y)) continue; const inland = Math.abs((x - ccx) * w.x + (y - ccy) * w.y), along = Math.abs((x - ccx) * perp.x + (y - ccy) * perp.y); const wdv = wDist(x, y); cand.push({ cx: x, cy: y, d: inland * 3 + along + (wdv < 99 ? W_PEN_K / (wdv * wdv) : 0) }); }
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
      // 산촌(散村): maximin 분산
      const DF = new Map(), dq = [];
      for (const k of own) { const [x, y] = k.split(',').map(Number); let edge = false; for (const [dx, dy] of N4) if (!own.has(key(x + dx, y + dy))) { edge = true; break; } if (edge || nongSet.has(k)) { DF.set(k, 0); dq.push([x, y]); } }
      let dh = 0; while (dh < dq.length) { const [x, y] = dq[dh++]; const d = DF.get(key(x, y)) + 1; for (const [dx, dy] of N4) { const kk = key(x + dx, y + dy); if (own.has(kk) && !DF.has(kk)) { DF.set(kk, d); dq.push([x + dx, y + dy]); } } }
      const hc = [];
      for (const k of own) { const [x, y] = k.split(',').map(Number); if ((x & 1) || (y & 1)) continue; if (onField(x, y) || Math.hypot(x - ccx, y - ccy) < HALL_CLEAR) continue; if (!fpInTerr(x, y) || !farFromWater(x, y)) continue; hc.push([x, y]); }   // ★HALL_CLEAR=16.5: 마당 원과 부지 원 비침범[사용자 지시 "초기 두 채 침범 금지"]
      const hdist = new Map(hc.map(p => [key(p[0], p[1]), Infinity]));
      const bump = (hx, hy) => { for (const p of hc) { const k2 = key(p[0], p[1]), e = Math.hypot(p[0] - hx, p[1] - hy); if (e < hdist.get(k2)) hdist.set(k2, e); } };
      for (const h of (opts.existingHouses || [])) { if (fpInTerr(h.cx, h.cy)) { houses.push({ cx: h.cx, cy: h.cy, floors: h.floors || 1 }); bump(h.cx, h.cy); } }
      let guard = 0;
      while ((cap() < pop || houses.length < 2) && guard++ < 400) {
        let best = null, bs = -1;
        for (const p of hc) { const df = DF.get(key(p[0], p[1])); if (df == null) continue; const sc = Math.min(df, hdist.get(key(p[0], p[1]))); if (sc > bs) { bs = sc; best = p; } }
        if (best && (bs >= SPACE_MIN || houses.length < 2)) { houses.push({ cx: best[0], cy: best[1], floors: 1 }); bump(best[0], best[1]); }
        else if (!densify()) break;
      }
      shrink();
    } else {
      // 집촌(集村): 회관 가까운 순 + 물가 K/d² 연속 페널티
      const SETT_GAP = opts.settGap != null ? opts.settGap : 18;   // ★부지 원(r6.5) 비겹침 d≥13+골목 여유(랩 동기)
      const hc = [];
      for (const k of own) { const [x, y] = k.split(',').map(Number); if ((x & 1) || (y & 1)) continue; const r = Math.hypot(x - ccx, y - ccy); if (r < HALL_CLEAR) continue; if (onField(x, y) || !fpInTerr(x, y) || !farFromWater(x, y)) continue; const wdv = wDist(x, y); hc.push([x, y, r + (wdv < 99 ? W_PEN_K / (wdv * wdv) : 0)]); }   // ★HALL_CLEAR=16.5 비침범 + 물가 연속 페널티
      hc.sort((a, b) => a[2] - b[2]);
      const spaced = (x, y) => { for (const h of houses) if (Math.hypot(h.cx - x, h.cy - y) < SETT_GAP) return false; return true; };
      for (const h of (opts.existingHouses || [])) if (fpInTerr(h.cx, h.cy)) houses.push({ cx: h.cx, cy: h.cy, floors: h.floors || 1 });
      let guard = 0;
      while ((cap() < pop || houses.length < 2) && guard++ < 800) {
        let placed = false;
        for (const p of hc) { if (spaced(p[0], p[1])) { houses.push({ cx: p[0], cy: p[1], floors: 1 }); placed = true; break; } }
        if (!placed && !densify()) break;
      }
      shrink();
    }
    if (!houses.length) houses.push({ cx: ccx, cy: ccy, floors: 1 });
    const floors = Math.max(1, ...houses.map(h => h.floors));
    // ── 3. 기경 균형해[랩 동식 — 프리뷰·신규 정착 실경작]: 논존닝∪밭적격을 순서대로 인구×landNeedPer(비옥)셀.
    //    equilibrium 또는 잠금 0(신규 시딩)일 때만 — 잠금>0 재배치에선 불변(공짜 개간 금지·래칫은 호출측 잠금이 보존)
    const batSet = new Set(lockBat);
    const dryfield = [...batSet].map(k => { const [x, y] = k.split(',').map(Number); return { cx: x, cy: y }; });
    if (opts.equilibrium === true || (lockNong.size === 0 && lockBat.size === 0)) {
      const tooCloseH = (x, y) => { for (const h of houses) if (houseFarmBlock(h.cx, h.cy, x, y)) return true; return false; };   // 부지 원+2타일 등방
      const squeezed = (x, y) => { let n = 0; const A2 = ALLEY_R * ALLEY_R; for (const h of houses) { const ddx = x - h.cx, ddy = y - h.cy; if (ddx * ddx + ddy * ddy < A2) { n++; if (n >= 2) return true; } } return false; };   // 골목 제외(원 r12.5)
      const want = Math.round(pop * landNeedPer(fert, LAND_NEED));   // ★보즈럽
      if (farmland.length + dryfield.length < want) {
        const candN = []; for (const k of nongSet) { if (lockNong.has(k)) continue; const [x, y] = k.split(',').map(Number); candN.push([k, x, y, Math.hypot(x - ccx, y - ccy)]); }
        candN.sort((a, b) => a[3] - b[3]);   // 논: 중심 가까운 기둥부터 강 따라 길이 성장
        const candB = []; for (const k of own) { if (nongSet.has(k) || batSet.has(k)) continue; const [x, y] = k.split(',').map(Number); const r2 = (x - ccx) * (x - ccx) + (y - ccy) * (y - ccy); if (hallFarmBlock(ccx, ccy, x, y) || tooCloseH(x, y) || squeezed(x, y)) continue; const d = dwOf(x, y); if (hasWater && d <= dNong) continue; candB.push([k, x, y, ((hasWater && d <= dBat) ? Math.sqrt(r2) : (1e5 + Math.min(d, 999) * 1000 + Math.sqrt(r2)))]); }
        candB.sort((a, b) => a[3] - b[3]);   // 밭: 1순위=논 뒤 7줄 밀착 → 2순위=행 단위 증층
        const wantNong = Math.max(farmland.length, Math.min(Math.round(want * riceShare), farmland.length + candN.length));   // 유형 몫=riceShare
        for (const c of candN) { if (farmland.length >= wantNong) break; farmland.push({ cx: c[1], cy: c[2] }); }
        for (const c of candB) { if (farmland.length + dryfield.length >= want) break; batSet.add(c[0]); dryfield.push({ cx: c[1], cy: c[2] }); }
      }
    }
    const dock = (fishers >= Math.max(1, Math.round(pop * 0.12))) ? nearestBank(t, ccx, ccy, 30) : null;
    for (const h of houses) for (const [dx, dy] of LOT_CELLS) if (!t.isBlocked(h.cx + dx, h.cy + dy)) own.add(key(h.cx + dx, h.cy + dy));   // 집 부지 원판 영토 포함
    const territory = [...own].map(k => k.split(',').map(Number));
    const coreCells = [...core].map(k => k.split(',').map(Number));
    return { center: { cx: ccx, cy: ccy }, hall: { cx: ccx, cy: ccy }, axis, type: typeLabel, fert: +fert.toFixed(2), water: +water.toFixed(2), farmers, fishers, fShare: +fShare.toFixed(2), hShare: +hShare.toFixed(2), fertScore: +fertScore.toFixed(2), houses, floors, farmland, dryfield, nongZone, territory, core: coreCells, dock, bank };
  }

  // 강가(land 인접 water) 셀 — 어부 작업장
  function nearestBank(terrain, cx, cy, maxR) {
    let best = null, bd = Infinity;
    const R = maxR || 24;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (terrain.isBlocked(x, y)) continue;
      let adjWater = false;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (terrain.isWater && terrain.isWater(x + ax, y + ay)) { adjWater = true; break; }
      if (!adjWater) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { cx: x, cy: y }; }
    }
    return best;
  }

  // =============================================================================
  // ★★[11차 T3] 환호(도랑) 링 — 검단리 규약
  //   고증(설계_장마당_환호_고증과_설계안.md B-1, 우리역사넷 「전쟁의 기원-마을의 출현」):
  //     · 울산 검단리: 장경 118m × 단경 70m **타원**(장/단 = 1.686), 총길이 298m, 폭 가장 넓은 곳 **2m**, 깊이 20~110cm
  //     · ★출입구 = 다리가 아니라 **"도랑을 파지 않고 원래의 지면을 그대로 남겨"** 만든 통로. 남북 각 1개소.
  //   ⇒ 여기서 만드는 것: 취락(집채 전부)을 감싸는 **폭 2셀 타원 링** + 남·북 **안 판 셀 3칸** 출입구 2곳.
  //   ⇒ 1셀 = 1m 실축이라 고증 수치를 그대로 셀로 쓴다(환산 없음).
  //
  //   ★불변식(하네스가 검사): 링은 **4연결**이어야 한다. 대각으로만 닿은 두 셀 사이에는 사람이 낄 수 있어
  //   (플레이어 이동은 연속 좌표라 목적지 셀만 보는 판정으로는 모서리 통과가 열린다) 방어선이 새기 때문이다.
  //   폭 2셀 링(안쪽 타원 밖 ∧ 바깥 타원 안)은 구조적으로 4연결이 보장된다 — 그래서 폭 1이 아니라 2다(고증과도 일치).
  //
  //   ★소급 금지: generate()는 이 함수를 부르지 않는다. 호출은 villages.js가 **시범 마을에만** 한다.
  const DITCH_W = 2;                 // 도랑 폭(셀=m) — 검단리 실측 "가장 넓은 곳 2m"
  const DITCH_AXIS_RATIO = 118 / 70; // 장경/단경 — 검단리 타원 비
  const DITCH_GATE_HALF = 1;         // 출입구 반폭(셀) → 폭 3칸("안 판 땅" 2~3칸 규약)
  const DITCH_MARGIN = 2;            // 집 부지 원 바깥 여유(셀) — 도랑이 부지를 물지 않게

  // 타원 좌표계: 마을 축(axis.toWater)을 단축(v), 그 수직을 장축(u)으로 둔다.
  //   물가 취락은 강과 나란히 길쭉해지므로 장축을 강 방향(perp)에 맞추는 게 자연스럽다.
  function _ditchFrame(axis) {
    let w = (axis && axis.toWater) ? axis.toWater : { x: 0, y: 1 };
    let n = Math.hypot(w.x, w.y);
    // ★[실측으로 잡은 결함] 완전 평지면 axisAt의 고도 기울기가 0 → toWater=(0,0)이 온다.
    //   구 코드는 `|| 1`로 나눠 vv=(0,0)이 됐고, 그러면 모든 셀의 타원 반경이 0이라 **링이 통째로 사라졌다**
    //   (소급 계측에서 19마을 중 8곳이 "0셀·구멍 0"으로 나온 원인 — 구멍이 아니라 축이 없었다).
    //   평지엔 강 방향이라는 개념이 없으므로 남북(0,1)을 결정론 폴백으로 쓴다.
    if (!(n > 1e-6)) { w = { x: 0, y: 1 }; n = 1; }
    const vv = { x: w.x / n, y: w.y / n };          // 단축 방향(강 쪽)
    return { u: { x: -vv.y, y: vv.x }, v: vv };     // 장축 = 강과 나란히
  }

  // opts: { houses, terrain, skip(x,y)→true면 파지 않음, ownSet(Set "x,y") 영토 제한(선택) }
  // 반환: { cells:[{cx,cy}], a, b, gates:[{cx,cy}…], skipped, frame }
  function ditchRing(ccx, ccy, opts) {
    const o = opts || {};
    const houses = o.houses || [];
    const t = o.terrain || null;
    const skip = o.skip || (() => false);
    const own = o.ownSet || null;
    const F = _ditchFrame(o.axis);

    // 단축 b = 모든 집 부지(원 r=LOT_R)를 품는 최소 반경 + 여유. 장축 a = b × 검단리 비.
    let need = HALL_YARD + LOT_R;                    // 최소한 큰집 마당은 품는다
    for (const h of houses) {
      const dx = h.cx - ccx, dy = h.cy - ccy;
      const pu = Math.abs(dx * F.u.x + dy * F.u.y), pv = Math.abs(dx * F.v.x + dy * F.v.y);
      // 이 집이 타원 안에 들어오려면 필요한 b: (pu/(b·R))² + (pv/b)² ≤ 1  →  b ≥ √((pu/R)² + pv²)
      const r = Math.sqrt((pu / DITCH_AXIS_RATIO) * (pu / DITCH_AXIS_RATIO) + pv * pv) + LOT_R;
      if (r > need) need = r;
    }
    const b = Math.ceil(need + DITCH_MARGIN), a = Math.ceil(b * DITCH_AXIS_RATIO);
    const bo = b + DITCH_W, ao = a + DITCH_W;        // 바깥 타원
    const cells = [], gates = [];
    let skipTerr = 0, skipBlock = 0;
    const B = ao + 2;
    for (let dy = -B; dy <= B; dy++) for (let dx = -B; dx <= B; dx++) {
      const pu = dx * F.u.x + dy * F.u.y, pv = dx * F.v.x + dy * F.v.y;
      const inOuter = (pu / ao) * (pu / ao) + (pv / bo) * (pv / bo) <= 1;
      if (!inOuter) continue;
      const inInner = (pu / a) * (pu / a) + (pv / b) * (pv / b) < 1;
      if (inInner) continue;                          // 안쪽 = 취락(파지 않음)
      const x = ccx + dx, y = ccy + dy;
      // ★출입구 — 장축 좌표가 0 근처인 두 곳(=단축 양 끝, 남·북)은 **파지 않는다**.
      //   검단리 "도랑을 파지 않고 원래의 지면을 그대로 남겨" 그대로. 다리 같은 별도 구조물 없음.
      if (Math.abs(pu) <= DITCH_GATE_HALF + 0.5) { gates.push({ cx: x, cy: y }); continue; }
      // ★구멍의 두 종류를 반드시 구분한다 — 이게 이 층의 핵심 계측이다.
      //   ①지형(물·바위) 때문에 못 판 셀 = **새지 않는다**(이미 통행 불가라 방어선이 그대로 이어진다).
      //   ②농지·건물 때문에 안 판 셀 = **샌다**(사람이 그리로 걸어 들어온다). 이쪽이 0에 가까워야 환호가 환호다.
      if (t && t.isBlocked && t.isBlocked(x, y)) { skipTerr++; continue; }
      if (own && !own.has(x + ',' + y)) { skipBlock++; continue; }
      if (skip(x, y)) { skipBlock++; continue; }
      cells.push({ cx: x, cy: y });
    }
    return { cells, gates, a, b, ao, bo, skipTerr, skipBlock, skipped: skipTerr + skipBlock, frame: F };
  }

  // 링 4연결 검사 — 하네스·시딩 양쪽이 쓰는 단일 정본.
  //   반환 { ok, comps, diagOnly } : comps=4연결 성분 수(출입구 2개로 끊기므로 정상값 2), diagOnly=대각으로만 이어진 지점 수
  function ditchConnectivity(cells) {
    const S = new Set(cells.map((c) => c.cx + ',' + c.cy));
    const seen = new Set();
    let comps = 0;
    for (const c of cells) {
      const k = c.cx + ',' + c.cy;
      if (seen.has(k)) continue;
      comps++;
      const st = [k]; seen.add(k);
      while (st.length) {
        const cur = st.pop(), ci = cur.indexOf(','), x = +cur.slice(0, ci), y = +cur.slice(ci + 1);
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = (x + ax) + ',' + (y + ay);
          if (S.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); }
        }
      }
    }
    // 대각으로만 이어진 지점 = 두 도랑 셀이 대각 이웃인데 공유 직교 이웃이 둘 다 도랑이 아닌 경우(사람이 낄 틈)
    let diagOnly = 0;
    for (const c of cells) for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (!S.has((c.cx + ax) + ',' + (c.cy + ay))) continue;
      if (!S.has((c.cx + ax) + ',' + c.cy) && !S.has(c.cx + ',' + (c.cy + ay))) diagOnly++;
    }
    return { ok: diagOnly === 0, comps, diagOnly };
  }

  const API = { generate, footprintLand, axisAt, nearestBank, waterEDT, HOUSE_HALF, HOUSE_CAP: HOUSE_CAP_PER_FLOOR, HOUSE_CAP_PER_FLOOR, LAND_PER_HOUSE, landNeedPer, HALL_YARD, LOT_R, FARM_GAP, ALLEY_R, HALL_CLEAR, inDisc, LOT_CELLS, LOT_GUARD, YARD_CELLS, houseFarmBlock, hallFarmBlock,
    ditchRing, ditchConnectivity, DITCH_W, DITCH_AXIS_RATIO, DITCH_GATE_HALF, DITCH_MARGIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.VillageLayout = API;
})();
