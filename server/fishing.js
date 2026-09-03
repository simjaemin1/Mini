// === server/fishing.js — 낚시 v2: 판단·위험·손맛 ================================
//
// ★[재민 확정 2026-08-26] 재미 층 첫 시제품. 설계 근거: `설계_게임성_사건레이어_TODO.md` §2·§10.1.
//   원칙: **"입력이 매번 같고 결과가 확실하면 게임이 아니라 진행바다."**
//
// ★종전(v1)이 무엇이었나 — 없애기 전에 적어 둔다:
//   `tryGather` 안에 세 줄. 물 옆에서 E 를 누르면 목 축이고 `Math.random() < 0.5` 로 어종 하나.
//   자리도 시간도 기술도 고갈도 없다. 어디서 눌러도 같은 동전이었다.
//
// ★★이 모듈의 제1 규약 — **없는 물고기를 주사위로 만들어내지 않는다.**
//   이 레포엔 이미 어장의 정본 물리가 있다: `server/sustain.js` 의
//     fishSustain = 물셀수 × (L_FISHR/4) × FISH_ECON_PER_STOCK        (로지스틱 MSY = r·K/4)
//   그 파일이 스스로 남긴 한계가 이것이었다:
//     "(그래서 '이 어장이 지금 몇 마리 남았나'는 아직 랩만 안다 — 상한은 물리되고 재고는 미이식.)"
//   ⇒ 이 모듈은 **그 미이식분을 채운다.** 새 물리를 발명하는 게 아니라, 같은 로지스틱의
//     **셀 단위 재고 s** 를 서버에 들여놓는다. 모든 셀이 만땅(s=K)일 때 이 모델은
//     기존 `fishSustain` 식과 **정확히 같은 값**을 낸다 — 기존 식이 이 모델의 s=K 특수해다.
//   그래서 플레이어가 긁어 가면 그 수역의 `land.fishSustain` 이 실제로 내려가고,
//   **NPC 어부가 같은 물을 쓴다**(econ 은 한 줄도 안 고친다 — 이미 그 키를 읽고 있다).
//
// ★자리 차등의 근거도 **꾸며낸 보너스가 아니라 세계의 실제 데이터**다:
//   `hanbando-terrain.json` 의 rivers path(마디마다 width) · lakes(center/radius). 클라 물 셰이더가
//   흐름을 그릴 때 쓰는 바로 그 자료이고, 여기서도 **같은 판정식**(폭 단위 거리 u = 중심선거리/반폭,
//   동률은 구간 번호가 작은 쪽)을 쓴다. 그래서 **화면의 물살이 곧 힌트**다 —
//   힌트를 따로 그리지 않는다. 물을 읽는 눈이 곧 실력이다.
//   ⚠클라(`client.js _flowAtCell`)와 서버(여기)가 갈리면 **화면이 거짓말을 한다.**
//     `scripts/e2e-fishing.js` 가 같은 칸에서 둘을 맞대 본다(하네스가 식을 베끼지 않고 둘 다 물어본다).
'use strict';

const S = require('./sustain');   // ★어장 상수의 정본 — 여기서 다시 쓰지 않는다(사본 금지)

// ── 손잡이(전부 env · 기본값이 채택값) ────────────────────────────────────────
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  // 자리
  DEPTH_W:    _num('FISH_DEPTH_W', 0.85),   // 수심이 **크기**에 주는 가중(깊을수록 큰 놈)
  SEAM_W:     _num('FISH_SEAM_W', 0.90),    // 흐름 경계·합류부가 **입질 빈도**에 주는 가중
  SEAM_BAND:  _num('FISH_SEAM_BAND', 0.30), // u=1(물길 가장자리) 둘레 이 폭이 '경계'
  LAKE_FLOW:  _num('FISH_LAKE_FLOW', 0.0),  // 호수는 흐름 0 — 잔잔한 물은 명당이 아니다
  // 시간
  WAIT_BASE_MS: _num('FISH_WAIT_BASE_MS', 6000),   // 입질 대기 기준(명당일수록 짧다)
  WAIT_JIT:     _num('FISH_WAIT_JIT', 0.75),       // 대기 산포(지수분포 계수) — 기다림이 예측되면 안 된다
  WAIT_MIN_MS:  _num('FISH_WAIT_MIN_MS', 1200),
  WAIT_MAX_MS:  _num('FISH_WAIT_MAX_MS', 26000),
  WIN_BASE_MS:  _num('FISH_WIN_BASE_MS', 900),     // 잔챙이의 창 **상한**(이보다 후하게는 안 준다)
  WIN_MIN_MS:   _num('FISH_WIN_MIN_MS', 90),       // 월척의 창 **하한**(짧다 — 놓친 대어가 기억에 남는다)
  WIN_AT_1KG:   _num('FISH_WIN_AT_1KG', 350),      // ★1kg 물고기의 창. 창 곡선의 기준점
  WIN_POW:      _num('FISH_WIN_POW', 1.25),        // ★창 = WIN_AT_1KG × kg^(−이 값). 클수록 대어가 급격히 어렵다
  WIN_LAT_MS:   _num('FISH_WIN_LAT_MS', 150),      // 레이턴시 여유(서버가 후하게 봐 준다 — 넷코드 공정성)
  // 크기 — 로그정규(광맥 등급 산포 선례)
  SIZE_MU:    _num('FISH_SIZE_MU', -0.55),   // ln(kg) 평균 → 중앙값 exp(μ) ≈ 0.58kg
  SIZE_SIGMA: _num('FISH_SIZE_SIGMA', 0.62),
  SIZE_MAX:   _num('FISH_SIZE_MAX', 12),     // 꼬리 절단(월척의 상한)
  KG_PER_ITEM: _num('FISH_KG_PER_ITEM', 0.8),// 이 무게마다 아이템 1 — 대어는 실제로 더 준다
  BIG_KG:     _num('FISH_BIG_KG', 2.0),      // 이 이상이면 '월척' 취급(HUD 한 줄)
  // 재고 — ★재생률은 sustain.js 정본(L_FISHR)을 쓴다. 여기서 새 값을 만들지 않는다.
  CELL_K:     _num('FISH_CELL_K', 1),        // 셀 수용력 = 1 stock (sustain 식의 K 와 같은 단위)
  KG_PER_STOCK: _num('FISH_KG_PER_STOCK', 1.2), // 1 stock = 이만큼의 물고기(kg). 어획 → 재고 차감의 환산
  DIFF_PER_DAY: _num('FISH_DIFF_PER_DAY', 18),// **결손 확산율**(하루당) — 아래 diffuse() 주석 참조
  //   ★채택 근거(실측): 6/일이면 30분 뒤에도 그 자리가 27% 밖에 안 돌아와 "옮길까"가 판단이 아니라
  //   일방통행이 된다. 18/일이면 10분에 절반쯤 돌아온다 — **돌아갈 수는 있는데 아까보다 못한**
  //   자리가 되어, 옮길지 버틸지가 매번 저울질이 된다.
  DRAW_R:     _num('FISH_DRAW_R', 3),        // 한 번의 어획이 훑는 셀 반경(자리 하나가 점이 아니다)
  //   ★DRAW_R 채택 근거(실측): 반경 2(13셀)면 한 자리가 **13마리에 바닥난다** — 2분이면 끝이라
  //   "옮길까"가 판단이 아니라 강제 이동이 된다. 반경 3(29셀) = 29 stock × 1.2kg ÷ 중앙 1.09kg
  //   ≈ **32마리 · 대략 4분**. 평균 대기(6초)와 맞물려 "이 자리 슬슬 죽는데" 가 손에 잡히는 길이다.
  REACH_PX:   _num('FISH_REACH_PX', 96),     // 물가에서 이만큼 안이면 던질 수 있다
};

// ── 게임일(재생 적분의 시간축) — 호출자가 주입한다(존마다 다를 수 있다) ─────────
let DAY_MS = 24 * 60 * 1000;
function setDayMs(ms) { if (ms > 0) DAY_MS = ms; }

// =============================================================================
// ① 자리 — 세계의 실제 지형에서 읽는다
// =============================================================================
// 점 → 선분 최근접(t 는 0..1 로 잘린 매개변수). 클라 `_flowAtCell` 의 `_one` 과 같은 형태다.
function _seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return { t, d2: qx * qx + qy * qy };
}
const _pt = (p) => (p.pos ? [p.pos[0], p.pos[1]] : [p[0], p[1]]);

// 강 하나에 대한 **폭 단위 거리** u = 중심선까지 거리 / 반폭.
//   u ≤ 1 = 물길 안. 작을수록 한복판(깊고 빠르다). 클라와 같은 규칙(동률은 구간 번호 작은 쪽).
function _riverU(x, y, river) {
  const path = river.path || [];
  if (path.length < 2) return null;
  let best = Infinity, bhw = 1, bd2 = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = _pt(path[i]), [bx, by] = _pt(path[i + 1]);
    const w1 = (path[i].width != null) ? path[i].width : (river.width || 200);
    const w2 = (path[i + 1].width != null) ? path[i + 1].width : (river.width || 200);
    const r = _seg(x, y, ax, ay, bx, by);
    const hw = Math.max(48, ((w1 + (w2 - w1) * r.t) || 96) * 0.5);
    const sc = r.d2 / (hw * hw);
    if (sc < best) { best = sc; bhw = hw; bd2 = r.d2; }
  }
  if (!Number.isFinite(best)) return null;
  return { u: Math.sqrt(bd2) / bhw, halfWidth: bhw };
}

// 호수 — 중심에서의 정규화 반경(0=한복판, 1=물가). 타원/원 둘 다 지원(terrain.js 와 같은 형태).
function _lakeR(x, y, lake) {
  if (lake.shape === 'ellipse' && lake.a && lake.b) {
    const ang = (lake.angle || 0), c = Math.cos(-ang), s = Math.sin(-ang);
    const dx = x - lake.center[0], dy = y - lake.center[1];
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.sqrt((lx * lx) / (lake.a * lake.a) + (ly * ly) / (lake.b * lake.b));
  }
  const dx = x - lake.center[0], dy = y - lake.center[1];
  return Math.hypot(dx, dy) / Math.max(1, lake.radius);
}

// 자리 판정 — 이 배치의 **판단**이 걸린 자료. 전부 지형에서 읽는다.
//   반환: { water, kind, u, depth01, flow01, seam01, conflu, halfWidth }
//     depth01 물길 한복판/호수 한복판일수록 1  → **크기**
//     flow01  물길 안 1, 반폭 2배에서 0        → 흐름의 세기(클라 셰이더와 같은 식)
//     seam01  u≈1 둘레(흐름 경계)에서 1        → **입질 빈도**
//     conflu  물길 안(u≤1.2)인 강이 둘 이상    → 합류부. 최고의 명당.
function spotAt(T, zoneId, x, y) {
  const t = (T.ZONE_TERRAIN || {})[zoneId];
  const out = { water: false, kind: 'none', u: Infinity, depth01: 0, flow01: 0, seam01: 0, conflu: 0, halfWidth: 0 };
  if (!t) return out;
  let inLake = false, lakeR = Infinity;
  for (const lake of t.lakes || []) {
    const r = _lakeR(x, y, lake);
    if (r < lakeR) lakeR = r;
    if (T.isWaterCellLocal(zoneId, x, y) && r <= 1.35) inLake = true;
  }
  let bestU = Infinity, bestHW = 0, inCount = 0;
  for (const river of t.rivers || []) {
    const r = _riverU(x, y, river);
    if (!r) continue;
    if (r.u <= 1.2) inCount++;
    if (r.u < bestU) { bestU = r.u; bestHW = r.halfWidth; }
  }
  const isWater = !!T.isWaterCellLocal(zoneId, x, y);
  if (!isWater) return out;
  out.water = true; out.halfWidth = bestHW; out.u = bestU; out.conflu = inCount >= 2 ? 1 : 0;
  const inRiver = bestU <= 1.2;
  if (inRiver) {
    out.kind = inLake ? 'mouth' : 'river';                       // 하구(강×호수)도 합류부다
    out.flow01 = bestU <= 1 ? 1 : Math.max(0, 2 - bestU);
    out.depth01 = Math.max(0, Math.min(1, 1 - bestU));
    // 흐름 경계 — u=1 둘레 BAND 폭에서 1, 멀어지면 0
    out.seam01 = Math.max(0, 1 - Math.abs(bestU - 1) / Math.max(1e-6, CFG.SEAM_BAND));
    if (inLake) out.conflu = 1;
  } else {
    out.kind = 'lake';
    out.flow01 = CFG.LAKE_FLOW;
    out.depth01 = Math.max(0, Math.min(1, 1 - Math.min(1, lakeR)));
    out.seam01 = 0;
  }
  return out;
}

// 자리 점수 두 갈래 — **빈도**와 **크기**를 따로 매긴다(같은 수 하나로 뭉치면 판단이 납작해진다).
//   rate  : 합류부·흐름 경계일수록 자주 문다
//   size  : 깊을수록 큰 놈
function spotScore(sp) {
  const seam = Math.max(sp.seam01, sp.conflu ? 1 : 0);
  return {
    rate: 1 + CFG.SEAM_W * seam,
    size: 1 + CFG.DEPTH_W * sp.depth01,
  };
}

// =============================================================================
// ② 재고 — 셀별 로지스틱(sustain.js 의 r·K 를 그대로 쓴다)
// =============================================================================
//   "cx_cy" → { s: 잔여(0..CELL_K), t: 마지막 갱신 ms }
//   ★안 판 셀은 저장하지 않는다(암묵적 만땅) — `minedCells` 와 같은 문법.
const fishCells = new Map();

// 로지스틱 닫힌 해 — s(t) = K / (1 + ((K-s0)/s0)·e^(−r·t)). dt 가 몇 달이어도 오차 0.
function regen(s0, days, K) {
  if (!(days > 0)) return s0;
  if (s0 <= 0) return 0;                       // ★씨가 마르면 안 돌아온다(로지스틱의 성질 — 0은 흡수상태)
  if (s0 >= K) return K;
  const A = (K - s0) / s0;
  return K / (1 + A * Math.exp(-S.L_FISHR * days));
}

function rec(key, now) {
  const r = fishCells.get(key);
  if (!r) return { s: CFG.CELL_K, t: now, fresh: true };
  const days = (now - r.t) / DAY_MS;
  if (days > 0) { r.s = regen(r.s, days, CFG.CELL_K); r.t = now; }
  return r;
}

// 이 자리의 재고 비율(0..1) — 반경 DRAW_R 셀의 평균. 자리 하나는 점이 아니다.
function stockRatioAt(cx, cy, now) {
  let sum = 0, n = 0;
  for (let dy = -CFG.DRAW_R; dy <= CFG.DRAW_R; dy++) {
    for (let dx = -CFG.DRAW_R; dx <= CFG.DRAW_R; dx++) {
      if (dx * dx + dy * dy > CFG.DRAW_R * CFG.DRAW_R) continue;
      sum += rec(cx + dx + '_' + (cy + dy), now).s; n++;
    }
  }
  return n ? (sum / n) / CFG.CELL_K : 1;
}

// 어획 — 그 자리의 셀들에서 stock 을 뺀다. 반환: 실제로 뺀 stock 총량.
//   onSave(key, r) 로 영속을 호출자에 맡긴다(이 모듈은 DB 를 모른다).
function drawStock(cx, cy, stock, now, onSave) {
  const cells = [];
  for (let dy = -CFG.DRAW_R; dy <= CFG.DRAW_R; dy++) {
    for (let dx = -CFG.DRAW_R; dx <= CFG.DRAW_R; dx++) {
      if (dx * dx + dy * dy > CFG.DRAW_R * CFG.DRAW_R) continue;
      cells.push([cx + dx, cy + dy]);
    }
  }
  let left = stock, took = 0;
  // 가운데부터 — 던진 자리가 가장 많이 준다
  cells.sort((a, b) => ((a[0] - cx) ** 2 + (a[1] - cy) ** 2) - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2));
  for (const [x, y] of cells) {
    if (left <= 1e-9) break;
    const key = x + '_' + y, r = rec(key, now);
    const t = Math.min(r.s, left);
    if (t <= 0) continue;
    r.s -= t; r.t = now; left -= t; took += t;
    delete r.fresh; fishCells.set(key, r);
    if (onSave) onSave(key, r);
  }
  return took;
}

// 이 셀 집합이 만땅 대비 얼마나 비었나 — **econ 어장 상한의 결손**(stock 단위).
//   호출자(villages.js)가 `land.fishSustain = base − 결손×(L_FISHR/4)×FISH_ECON_PER_STOCK` 로 물린다.
function deficitStock() {
  let d = 0;
  for (const [, r] of fishCells) d += Math.max(0, CFG.CELL_K - r.s);
  return d;
}

// ★★**결손 확산** — 이 모듈에서 가장 조심해서 읽어야 할 함수다.
//   문제: 어장 재생률은 랩 정본이 r=L_FISHR=0.02/일 이다. 그 값만 쓰면 한 자리를 비운 뒤
//   **게임 두어 달**을 기다려야 돌아온다 — "자리를 옮겨 다니는 판단"이 아니라 일방통행 소각이 된다.
//   그렇다고 재생률을 게임 편하자고 올리면 그건 **econ 계수 임의 보정**이고, 마을 어장 물리가
//   플레이어 편의로 휘는 것이다(그 길은 닫혀 있다).
//
//   실제 자연에서 작은 웅덩이 하나가 금방 회복하는 이유는 번식이 아니라 **옆에서 물고기가 들어오기**
//   때문이다. 그건 총량을 늘리지 않는다 — **자리를 옮길 뿐**이다. 그래서 여기서는
//   결손 d = K − s 를 하나의 장으로 보고 **총합을 보존한 채** 이웃으로 번지게 한다:
//     · 내가 판 구멍은 얕아지고 넓어진다      → 그 자리 입질이 몇 분 만에 어느 정도 돌아온다
//     · 마을 전체 결손(=econ 어장 상한 감소)은 **줄지 않는다** → NPC 어부는 여전히 같은 물을 쓴다
//   총량이 줄어드는 유일한 길은 로지스틱 재생(r)뿐이고, 그건 정본 상수 그대로다.
//   ⇒ `test-fishing ③` 이 "자리는 회복하는데 마을 결손 총합은 r 만큼만 준다"를 둘 다 assert 한다.
function diffuse(dtDays, onSave) {
  if (!(dtDays > 0) || fishCells.size === 0) return { moved: 0, regen: 0 };
  const K = CFG.CELL_K;
  // ⓐ 확산 — 결손을 4이웃으로 번지게 한다(총합 보존).
  // ★★[2026-08-26 수리] **하위 걸음으로 쪼갠다.** 1차 판은 dt 를 통째로 한 번에 밀었는데,
  //   그러면 번짐이 흐른 시간이 아니라 **틱 주기**에 따라 달라진다(한 번 호출 = 격자 한 칸만 번진다).
  //   실측에서 그 티가 났다 — 30분을 한 번에 밀면 자리 재고 27%, 잘게 나눠 밀면 훨씬 많이 돌아온다.
  //   확산은 명시적 풀이라 한 걸음의 비율이 0.5 를 넘으면 불안정하기도 하다. ⇒ a ≤ 0.4 로 쪼갠다.
  const STEP_A = 0.4;
  const dtStep = -Math.log(1 - STEP_A) / CFG.DIFF_PER_DAY;
  const kSteps = Math.max(1, Math.min(96, Math.ceil(dtDays / dtStep)));
  const aStep = 1 - Math.exp(-CFG.DIFF_PER_DAY * (dtDays / kSteps));
  const share = aStep / 5;                    // 자기 몫 포함 5칸으로 나눈다
  let moved = 0;
  for (let step = 0; step < kSteps; step++) {
    const delta = new Map();
    const bump = (k, v) => delta.set(k, (delta.get(k) || 0) + v);
    for (const [key, r] of fishCells) {
      const d = Math.max(0, K - r.s);
      if (d <= 1e-9) continue;
      const i = key.indexOf('_'); if (i < 0) continue;
      const x = +key.slice(0, i), y = +key.slice(i + 1);
      const out = d * share * 4;
      if (out <= 1e-12) continue;
      bump(key, -out); moved += out;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) bump((x + dx) + '_' + (y + dy), out / 4);
    }
    for (const [key, dv] of delta) {
      const r = fishCells.get(key) || { s: K, t: Date.now() };
      r.s = Math.max(0, Math.min(K, r.s - dv));
      fishCells.set(key, r);
    }
  }
  // ⓑ 재생 — 정본 로지스틱. **여기서만** 총 결손이 줄어든다.
  let before = 0, after = 0;
  for (const [key, r] of fishCells) {
    before += Math.max(0, K - r.s);
    r.s = regen(r.s, dtDays, K);
    after += Math.max(0, K - r.s);
    if (onSave) onSave(key, r);
  }
  return { moved: +moved.toFixed(6), regen: +(before - after).toFixed(6) };
}
function deficitBy(keyPred, now) {
  let d = 0;
  for (const [key, r0] of fishCells) {
    if (!keyPred(key)) continue;
    const r = rec(key, now);
    d += Math.max(0, CFG.CELL_K - r.s);
  }
  return d;
}
// 결손 stock → econ 어장 상한 감소분. **환산 계수는 sustain.js 정본 그대로**(사본 금지).
const stockToEcon = (stock) => stock * (S.L_FISHR / 4) * S.FISH_ECON_PER_STOCK;

// =============================================================================
// ③ 한 번의 던짐 — 입질 시각·크기·챔질 창을 **서버가** 정한다
// =============================================================================
// 로그정규 표본(Box–Muller). 큰 놈이 드물고 잔챙이가 흔한 자연의 산포.
function _lognormal(rng, mu, sigma) {
  let u1 = rng(), u2 = rng();
  if (u1 <= 1e-12) u1 = 1e-12;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * z);
}

// 챔질 창 — **큰 놈일수록 짧다.** 대어가 더 어렵고, 놓친 대어가 기억에 남는다(§2 위험).
//   창(kg) = WIN_AT_1KG × kg^(−WIN_POW),  [WIN_MIN, WIN_BASE] 로 자른다.
//
// ★★채택 근거(실측 · `scripts/fish-metrics.js`): 1차 판은 1/√kg 였는데 너무 완만해서
//   **놓침율이 반응 500ms 에서도 0~2%** 였다 — 재민이 준 시작점 20~30% 와 한참 멀고,
//   무엇보다 "놓치는 대어"가 아예 안 생겨 §2 의 **위험**이 빈칸이 된다.
//   지수를 1.25 로 세우면 대략 이렇게 된다(+레이턴시 여유 150ms 가 실효 창):
//     0.3kg → 900ms(상한)   0.58kg → 695ms   1.0kg → 350ms   2.0kg → 147ms   3kg↑ → 90ms(하한)
//   즉 **잔챙이는 여유롭고, 월척은 반사신경 싸움**이다. 자리를 깊은 데로 옮기면
//   큰 놈이 오는 대신 놓침이 는다 — 그 맞바꿈이 이 동사의 판단이다.
function windowMsFor(kg) {
  const w = CFG.WIN_AT_1KG * Math.pow(Math.max(0.05, kg), -CFG.WIN_POW);
  return Math.max(CFG.WIN_MIN_MS, Math.min(CFG.WIN_BASE_MS, Math.round(w)));
}

// 던짐 한 번의 대본. rng 는 주입(하네스가 씨를 고정해 분포를 잰다).
//   stock01 = 그 자리 재고 비율 → 빈 자리는 **덜 문다**(고갈이 손에 잡힌다).
function plan(sp, stock01, now, rng) {
  const sc = spotScore(sp);
  const rate = Math.max(0.08, sc.rate * Math.max(0.05, stock01));
  // 대기 = 지수분포(무기억) — "이제 슬슬 올 때가 됐다"가 성립하지 않는다.
  const raw = CFG.WAIT_BASE_MS / rate * (-Math.log(Math.max(1e-9, rng())) * CFG.WAIT_JIT + (1 - CFG.WAIT_JIT));
  const waitMs = Math.max(CFG.WAIT_MIN_MS, Math.min(CFG.WAIT_MAX_MS, Math.round(raw)));
  let kg = _lognormal(rng, CFG.SIZE_MU + Math.log(sc.size), CFG.SIZE_SIGMA);
  kg = Math.min(CFG.SIZE_MAX, +kg.toFixed(3));
  return { biteAt: now + waitMs, waitMs, kg, windowMs: windowMsFor(kg) };
}

// ── ★★[T59 2026-09-03] **어종 표는 여기가 정본이다.** ─────────────────────────
//   왜 옮겼나: 표가 `zone.js` 안에 있어서 **다른 모듈이 물어볼 수가 없었다.**
//   그 결과 `spoil.PRESERVE` 의 건어물 입력이 `'fish'` 라는 **아무도 안 주는 품목**이었고,
//   플레이어는 정상 경로로 건어물을 만들 길이 없었다(T17 이 회부로 남긴 결함).
//   ⇒ 낚시가 무엇을 내주는지는 낚시가 안다. zone 은 이제 이 표를 **부른다**(사본 0).
//   ⚠품목 id 는 전부 **econ 재화 그대로**다(새 품목 0 — 자염·갯벌과 같은 규약).
const SPECIES_BY_BIOME = {
  taiga:       ['salmon', 'cod', 'herring', 'trout', 'pollock'],
  tundra:      ['salmon', 'cod', 'herring', 'trout', 'pollock'],
  forest:      ['trout', 'carp', 'pollock'],
  plains:      ['trout', 'carp', 'pollock'],
  jungle:      ['carp', 'shrimp', 'crab'],
  savanna:     ['carp', 'shrimp', 'crab'],
  desert:      ['carp'],
  archipelago: ['cod', 'herring', 'sardine', 'anchovy', 'shrimp', 'crab', 'oyster', 'octopus', 'squid', 'seaweed'],
  ocean:       ['cod', 'herring', 'sardine', 'anchovy', 'shrimp', 'crab', 'oyster', 'octopus', 'squid', 'seaweed'],
  mountain:    ['trout'],
};
const SPECIES_DEFAULT = ['carp', 'trout'];
function speciesFor(biome) { return SPECIES_BY_BIOME[biome] || SPECIES_DEFAULT; }
// 낚시로 손에 들어올 수 있는 것 전부(중복 없음 · 결정론 순서).
const ALL_SPECIES = (() => {
  const set = new Set(SPECIES_DEFAULT);
  for (const arr of Object.values(SPECIES_BY_BIOME)) for (const k of arr) set.add(k);
  return [...set].sort();
})();
// ★**말리기·절임의 입력**은 이것이다 — 옛 `'fish'`(econ 재화 · 아무도 안 주는 품목)도 남긴다.
//   왜 남기나: 곳간에서 꺼내거나 게시판 보상으로 받으면 진짜로 `fish` 가 손에 온다.
//   ⚠갯벌 산출(굴·해조)은 뺀다 — 그건 T54 의 제 레시피가 따로 있다(같은 것을 두 줄로 만들지 않는다).
const _NOT_FISH = new Set(['oyster', 'seaweed']);
const FISH_ITEMS = ['fish', ...ALL_SPECIES.filter((k) => !_NOT_FISH.has(k))];
function isFish(item) { return FISH_ITEMS.indexOf(item) >= 0; }

module.exports = {
  CFG, fishCells, setDayMs,
  SPECIES_BY_BIOME, ALL_SPECIES, FISH_ITEMS, speciesFor, isFish,
  spotAt, spotScore, _riverU, _lakeR,
  regen, rec, stockRatioAt, drawStock, deficitStock, deficitBy, stockToEcon, diffuse,
  plan, windowMsFor, _lognormal,
  get DAY_MS() { return DAY_MS; },
};
