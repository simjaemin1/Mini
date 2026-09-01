// === server/onboarding.js — 온보딩 v2 "나루터에서 온 이방인" ===================
//
// ★설계 정본: `설계_게임성_사건레이어_TODO.md` §9 [재민 확정 2026-08-25] ·
//   실행 지시 [재민 확정 2026-09-01]. 이 파일이 하는 일은 **넷뿐**이다:
//     ① 마을별 **도착 지점** 산출(51마을 전수 · 결정론)
//     ② 시작 화면이 읽을 **마을 목록**(성격·규모·근황·혼잡도·추천)
//     ③ 30분 대본의 **상태 기계**(첫 의뢰 · 누적 기여 · 빈터 권리 · 하루 정산)
//     ④ 마을 어귀의 **빈터 구역** 판정(기존 클레임 규칙에 게이트 하나)
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★제1 규약: **여기서 새로 계산하는 산수는 없다.**
//   · 도착 지점은 `village-layout.js` 의 **정본 함수**(`axisAt`·`nearestBank`)와
//     `villages.js` 가 이미 내려 주는 **영토 경계**(clientVillages `b`)에서 유도한다.
//   · 마을 성격은 econ 직업 분포(`lifeDebug().econCounts`)를 **읽기만** 한다.
//   · 첫 의뢰는 **게시판 생성기가 실제로 낸 의뢰**에서 고른다 — 새 품목 축을 만들지 않는다.
//   · 보상은 그 의뢰의 보상 그대로다 — **아이템 수도꼭지를 새로 열지 않는다**(B-1 물리 상한 캐논).
//     "납품 → 밥"은 **먹을 것으로 갚는 의뢰를 첫 의뢰로 고르는 것**으로 성립시킨다.
//
// ★★제2 규약: **누적 기여 계량기는 하나다.**
//   빈터 권리(이 배치)와 마을 소속·곳간 인출(T11)이 **같은 카운터**를 쓴다. 새 축 금지.
//
// ★★제3 규약: **대본 상태는 존 로컬 DB 에 산다.**
//   왜 central 플레이어 레코드가 아닌가: 대본은 **이 세계의 마을**에 매인 상태이고
//   (start_vid·기여·빈터 권리 전부 vid 를 가리킨다), central 은 존을 넘는 신원 정본이다.
//   존 로컬에 두면 zone.js 의 저장 경로를 한 줄도 안 건드리고 재접속·재기동을 넘는다.
//   ⚠테이블은 이 파일이 스스로 만든다(`CREATE TABLE IF NOT EXISTS`) — `zone-local-db.js` 무수정.
//
// ★★제4 규약: **화살표·마커·팝업 금지**(§9.5). 안내는 촌장 대사와 도착 방향뿐이다.
'use strict';

const path = require('path');
const VillageLayout = require('./village-layout');

const SZ = 32;                                   // 셀 → 픽셀(프로젝트 공통)
const _num = (n, d) => { const x = parseFloat(process.env[n] != null ? process.env[n] : ''); return isFinite(x) ? x : d; };

const CFG = {
  // ── 도착 ────────────────────────────────────────────────────────────────────
  ARRIVE_OUT: _num('ONB_ARRIVE_OUT', 2),         // 어귀 경계에서 바깥으로 이 셀만큼(마을 앞에 선다)
  ARRIVE_SEARCH: _num('ONB_ARRIVE_SEARCH', 8),   // 막힌 칸이면 이 반경까지 나선 탐색
  GATE_MIN_CELLS: _num('ONB_GATE_MIN_CELLS', 10),  // 어귀는 중심에서 최소 이만큼(셀) — 걸어 들어갈 거리
  GATE_MIN_FRAC: _num('ONB_GATE_MIN_FRAC', 0.45),  // 또는 경계 최대 반경의 이 비율(둘 중 큰 쪽)
  REACH_CAP: _num('ONB_REACH_CAP', 40000),       // 도달성 BFS 방문 셀 상한(안전판)
  // ── 신체 시작값(§9.4 "걷는 동안 허기 1단계") ────────────────────────────────
  //   ★값의 근거: `body.js` 의 허기 1단계 경계는 심각도 0.45(회복 곡선 y=0.95 지점) +
  //     히스테리시스 0.04 = **0.49** → 눈금 51. 감쇠는 100→0 이 2,880초(상태 의존)라
  //     56 에서 출발하면 **2~3분 걸으면 아이콘이 뜬다**. 그게 §9.4 의 "0~3분"이다.
  //   ⚠신체 정본(body.js)은 한 줄도 안 건드린다 — 시작값을 여기서 한 번 세팅할 뿐이다.
  START_HUNGER: _num('ONB_START_HUNGER', 56),
  START_THIRST: _num('ONB_START_THIRST', 92),    // 갈증은 넉넉히(첫 1분에 잔소리 금지)
  // ── 대본 ────────────────────────────────────────────────────────────────────
  LOT_AFTER: _num('ONB_LOT_AFTER', 3),           // 누적 의뢰 N회 완수 → 빈터 권리
  VACANT_R: _num('ONB_VACANT_R', 10),            // 빈터 구역 반경(셀) — 중심은 도착 지점
  RECOMMEND_POP: _num('ONB_RECOMMEND_POP', 8),   // 추천 최소 인구(사람이 없는 마을엔 소식도 없다)
  // ── 배경 굽기 트리클(아래 `_warmStep` 주석) ─────────────────────────────────
  WARM_DUTY: _num('ONB_WARM_DUTY', 4),           // 한 마을을 굽는 데 쓴 시간의 이 배만큼 쉰다(점유율 ≈ 1/(1+배))
  WARM_MIN_GAP: _num('ONB_WARM_MIN_GAP', 40),    // 최소 쉼(ms)
  WARM_MAX_GAP: _num('ONB_WARM_MAX_GAP', 1500),  // 최대 쉼(ms)
};

// 주입되는 것들 — 전부 zone.js 가 이미 갖고 있는 **정본**이다(사본 금지).
let H = null;   // { SimVillages, terrain, ZONE, ZONE_ID, db, send, players, Events, isSeaTileLocal, foodItems, playerCount, gameDay }
let _ready = false;

// ★되돌리기 손잡이 — `ONB_ENABLE=0` 이면 이 층 전체가 no-op 이다(스폰·메시지·클레임 게이트 전부).
//   채택값은 켜짐. A/B 재현 규약(`lab-wiring-check [A2]` 정신)과 같은 결이고,
//   원인 가르기(“이 층이 범인인가”)를 한 줄로 할 수 있게 한다.
const ENABLED = process.env.ONB_ENABLE !== '0';
function init(host) {
  if (!ENABLED) { console.log('[onboarding] ONB_ENABLE=0 — 온보딩 층 꺼짐(no-op)'); return false; }
  H = host || {};
  _ensureTable();
  _ready = true;
  // ★★★[성능 — 여기가 옳은 자리다] **부팅 때, 듣기 전에 굽는다.**
  //   `zone.js` 는 마을 시딩을 마친 **뒤**, `server.listen` **전**에 이 함수를 부른다.
  //   그 창에서는 아무도 접속해 있지 않고 틱도 안 돈다 — 50마을 산출 20초가 **누구도 안 굶긴다**.
  //   (배경 트리클로 돌렸더니 그 20초가 부팅 직후 100초에 흩어져 클라의 건물 스트림을 굶겼다:
  //    `e2e-nature` 가 "마을 0 · 경작지 0" 으로, `e2e-mtocc`·`e2e-cold` 가 각자의 방식으로 잡았다.
  //    "배경으로 미루면 안전하다"가 틀렸다 — 부팅 창이 **가장 한가한 시간**이다.)
  //   마을이 아직 안 섰으면(존 설정상 마을 없음·시딩 지연) 배경 트리클로 넘긴다.
  try {
    const list = (H.warm === false) ? null : _villages();
    const ta = list ? _terrainAdapter() : null;
    if (list && list.length && ta) {
      const t0 = Date.now();
      for (const v of list) { if (!_arrCache.has(v.id)) { const a = _arrivalFor(v, list, ta); if (a) _arrCache.set(v.id, a); } }
      _arrDone = true;
      const m = _arrCache;
      console.log(`[${H.ZONE_ID || 'zone'}] 🛶 도착 지점 ${m.size}곳 산출(부팅) — ${Date.now() - t0}ms`
        + ` (나루터 ${[...m.values()].filter(a => a.kind === 'dock').length} · 길목 ${[...m.values()].filter(a => a.kind === 'road').length}`
        + ` · 들 ${[...m.values()].filter(a => a.kind === 'field').length} · 어귀 ${[...m.values()].filter(a => a.kind === 'gate').length})`);
      return true;
    }
  } catch (e) { console.error('[onboarding] 부팅 산출 실패 — 배경으로 넘긴다:', e.message); }
  if (H.warm !== false) _warm(0);   // ★`warm:false` = 하네스가 자기 표를 꽂는다(`__probe.setArrivals`)
  return true;
}
// ★★도착 지점은 **부팅 때 미리 굽는다.**
//   왜: 51마을 산출은 도달성 BFS 때문에 20초쯤 걸린다(실측). 첫 접속자가 그 값을 처음 부르면
//   그 20초가 **이벤트 루프를 통째로 막는다** — 온보딩이 첫 인상을 망치는 가장 확실한 길이다.
//   마을 시딩이 끝나기 전엔 목록이 비어 있으므로, 설 때까지 조용히 되묻는다(최대 5분).
function _warm(tries) {
  const n = tries | 0;
  if (n > 60) return;
  setTimeout(() => {
    try {
      if (!ready() || _arrDone) return;
      const list = _villages(), ta = _terrainAdapter();
      if (!list || !list.length || !ta) { _warm(n + 1); return; }
      _warmStep(list, ta, 0, Date.now());
    } catch (e) { _warm(n + 1); }
  }, n === 0 ? 3000 : 5000).unref?.();
}
// ★★**한 번에 한 마을씩** 굽고 이벤트 루프에 자리를 돌려준다.
//   왜: 51곳을 한 호출에 굽던 1차 실장이 부팅 직후 서버를 수십 초 멎게 했고,
//   렌더 하네스 둘이 그 정지 구간에서 화면을 찍어 **없는 결함**을 보고했다.
function _warmStep(list, ta, i, t0) {
  if (!ready() || _arrDone) return;
  if (i >= list.length) {
    _arrDone = true;
    const m = _arrCache;
    console.log(`[${(H && H.ZONE_ID) || 'zone'}] 🛶 도착 지점 ${m.size}곳 산출 — ${Date.now() - t0}ms`
      + ` (나루터 ${[...m.values()].filter(a => a.kind === 'dock').length} · 길목 ${[...m.values()].filter(a => a.kind === 'road').length}`
      + ` · 들 ${[...m.values()].filter(a => a.kind === 'field').length} · 어귀 ${[...m.values()].filter(a => a.kind === 'gate').length})`);
    return;
  }
  const v = list[i];
  const t1 = Date.now();
  try { if (!_arrCache.has(v.id)) { const a = _arrivalFor(v, list, ta); if (a) _arrCache.set(v.id, a); } } catch (e) {}
  // ★★쓴 시간의 `WARM_DUTY` 배를 쉰다 — 이 배경 작업이 **틱을 굶기지 않게**.
  //   `setImmediate` 로 이어 붙이면 "양보"는 하지만 CPU 는 거의 100% 다(그게 79초 굶주림의 정체다).
  const gap = Math.max(CFG.WARM_MIN_GAP, Math.min(CFG.WARM_MAX_GAP, (Date.now() - t1) * CFG.WARM_DUTY));
  setTimeout(() => _warmStep(list, ta, i + 1, t0), gap).unref?.();
}
function ready() { return _ready && !!H; }

// ── 존 로컬 DB — 대본 상태 ────────────────────────────────────────────────────
function _db() { return H && H.db ? H.db : null; }
function _ensureTable() {
  const d = _db(); if (!d) return;
  try {
    d.exec(`CREATE TABLE IF NOT EXISTS onboarding (
      player_id  TEXT PRIMARY KEY,
      zone       TEXT,
      start_vid  INTEGER,
      first_item TEXT,
      first_done INTEGER DEFAULT 0,
      contrib    INTEGER DEFAULT 0,
      lot_ok     INTEGER DEFAULT 0,
      hooked     INTEGER DEFAULT 0,
      day        INTEGER DEFAULT -1,
      day_deliv  INTEGER DEFAULT 0,
      day_fish   INTEGER DEFAULT 0,
      arrived    INTEGER DEFAULT 0,
      updated_at INTEGER
    )`);
  } catch (e) { console.error('[onboarding] 테이블 생성 실패:', e.message); }
}
const _BLANK = () => ({ start_vid: null, first_item: null, first_done: 0, contrib: 0, lot_ok: 0, hooked: 0, day: -1, day_deliv: 0, day_fish: 0, arrived: 0 });
const _cache = new Map();     // playerId → row (쓰기 즉시 DB 반영 — 대본 상태는 작다)

function stateOf(playerId) {
  if (!playerId) return _BLANK();
  if (_cache.has(playerId)) return _cache.get(playerId);
  let row = null;
  try { row = _db() && _db().prepare('SELECT * FROM onboarding WHERE player_id = ?').get(playerId); } catch (e) {}
  const s = Object.assign(_BLANK(), row || {});
  _cache.set(playerId, s);
  return s;
}
function _save(playerId, s) {
  if (!playerId) return;
  _cache.set(playerId, s);
  const d = _db(); if (!d) return;
  try {
    d.prepare(`INSERT INTO onboarding
      (player_id, zone, start_vid, first_item, first_done, contrib, lot_ok, hooked, day, day_deliv, day_fish, arrived, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(player_id) DO UPDATE SET zone=excluded.zone, start_vid=excluded.start_vid,
        first_item=excluded.first_item, first_done=excluded.first_done, contrib=excluded.contrib,
        lot_ok=excluded.lot_ok, hooked=excluded.hooked, day=excluded.day, day_deliv=excluded.day_deliv,
        day_fish=excluded.day_fish, arrived=excluded.arrived, updated_at=excluded.updated_at`)
      .run(String(playerId), String((H && H.ZONE_ID) || ''), s.start_vid == null ? null : (s.start_vid | 0),
        s.first_item || null, s.first_done | 0, s.contrib | 0, s.lot_ok | 0, s.hooked | 0,
        s.day | 0, s.day_deliv | 0, s.day_fish | 0, s.arrived | 0, Date.now());
  } catch (e) { /* 저장 실패가 대본을 죽이지 않는다 */ }
}

// ═══ ① 도착 지점 ═════════════════════════════════════════════════════════════
//
// ★규약(§9.2): **캐릭터는 발생하지 않고 도착한다.** 임의 좌표·구역 내 무작위 금지.
//   도착 지점은 마을마다 **하나**이고, 같은 지도면 언제나 같은 자리다(결정론 · 시드 없음).
//
// 산출 순서 — 전부 이미 있는 정본에서 **유도**한다:
//   ⓐ 방향을 정한다
//        · 물가 마을 : `VillageLayout.nearestBank`(강·호수에 접한 뭍 한 칸) 방향 = **나루터**
//        · 내륙 마을 : 가장 가까운 **이웃 마을** 방향 = **길목**(사람과 짐이 드나드는 쪽)
//        · 둘 다 없으면 배산임수 축 `axisAt().toWater`(들 쪽), 그것도 없으면 남(0,1)
//   ⓑ 그 방향의 **영토 경계 셀**(clientVillages `b` — 배산임수 시딩이 남긴 어귀 링)을 고른다
//   ⓒ 경계에서 바깥으로 ARRIVE_OUT 셀 — 마을 **앞**에 선다(안이 아니라)
//   ⓓ 막혔으면 나선 탐색으로 가장 가까운 통행 가능 칸
//   ⓔ 물가 마을이면 마지막에 다시 `nearestBank` 로 물가에 붙인다(나루터)
//   ⓕ **마을 중심까지 실제로 걸어갈 수 있는지** BFS 로 확인한다(못 가면 ⓓ의 다음 후보)
let _arrCache = new Map();    // vid → { cx, cy, x, y, kind, faceX, faceY, gateCx, gateCy } — ★굽는 동안 **부분**일 수 있다
let _arrDone = false;

function _terrainAdapter() {
  if (H._ta) return H._ta;
  // ★사본 금지 — villages.js 가 쓰는 **그 어댑터**를 그대로 만든다(`__labProbe.makeTerrainAdapter`).
  const P = H.SimVillages && H.SimVillages.__labProbe;
  if (!P || !P.makeTerrainAdapter) return null;
  H._ta = P.makeTerrainAdapter(H.terrain, H.ZONE, {
    isTerrainBlockedLocal: H.isTerrainBlockedLocal,
    isWaterTileLocal: H.isWaterTileLocal,
    isBridgeLocal: H.isBridgeLocal || null,
  });
  return H._ta;
}
function _villages() {
  try { return (H.SimVillages && H.SimVillages.clientVillages && H.SimVillages.clientVillages()) || null; }
  catch (e) { return null; }
}
// 어귀 링 = **영토 경계 셀**(중심 상대). 원천 셋을 같은 형태로 돌려준다:
//   ⓐ `b` — villages.js 가 welcome 으로 내려 주는 경계 flat [dx,dy,mask]  (라이브 경로)
//   ⓑ `terr` — 레이아웃 원본 영토 [[cx,cy]…]. 4방 이웃이 영토 밖인 셀만 (하네스가 실지도 51곳을
//      조립할 때 쓰는 경로 — villages.js `territoryBoundary` 와 **같은 4방 판정**이다.
//      그 함수가 export 되지 않아 여기 한 곳에 둔다. export 되면 이 갈래는 지운다 → 회부)
//   ⓒ 둘 다 없으면 반경 원 근사(구DB `approx` 갈래와 같은 폴백)
function _boundaryCells(v) {
  const out = [];
  if (v.b && v.b.length) { for (let i = 0; i + 2 < v.b.length; i += 3) out.push([v.b[i], v.b[i + 1]]); return out; }
  if (v.terr && v.terr.length) {
    const set = new Set(); for (const c of v.terr) set.add(c[0] + ',' + c[1]);
    for (const [x, y] of v.terr) {
      if (set.has(x + ',' + (y - 1)) && set.has((x + 1) + ',' + y) && set.has(x + ',' + (y + 1)) && set.has((x - 1) + ',' + y)) continue;
      out.push([x - (v.cx | 0), y - (v.cy | 0)]);
    }
    if (out.length) return out;
  }
  const R = Math.max(4, Math.round((v.r || 800) / SZ));
  for (let a = 0; a < 360; a += 5) { const t = a * Math.PI / 180; out.push([Math.round(Math.cos(t) * R), Math.round(Math.sin(t) * R)]); }
  return out;
}
// ★★[성능 — 통합 러너가 잡았다] **마을당 BFS 는 한 번뿐이다.**
//   1차 실장은 후보 셀마다 `_reaches` 를 불렀다(나선 289칸 × BFS). 라이브 4마을에 **8.2초**,
//   51마을이면 100초 넘게 **이벤트 루프를 통째로 막는다** — 부팅 직후 렌더 하네스 둘이
//   그 정지 구간에서 화면을 찍고 없는 결함을 보고했다. 서버가 몇십 초 멎는 건 그 자체로 결함이다.
//   ⇒ 마을 중심에서 **한 번** 넓혀 도달 가능 셀 집합을 만들고, 후보는 그 집합에 있는지만 본다.
//     (판정은 같다 — 4연결 · 같은 정본 술어 `isBlocked`. 값이 아니라 횟수만 바뀐다.)
function _reachSetFrom(ta, cx, cy, maxR, cap) {
  const seen = new Set([cx + ',' + cy]);
  const q = [[cx, cy]];
  let head = 0, n = 0;
  const LIM = cap || CFG.REACH_CAP;
  while (head < q.length) {
    const [x, y] = q[head++];
    if (++n > LIM) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (Math.abs(nx - cx) > maxR || Math.abs(ny - cy) > maxR) continue;
      const k = nx + ',' + ny;
      if (seen.has(k) || ta.isBlocked(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return seen;
}
// 마을 중심까지 걸어갈 수 있는가 — 통행 가능 셀 4연결 BFS(정본 술어 `isBlocked` 하나만 본다).
//   ★단발 질의용(하네스가 쓴다). 산출 경로는 위 `_reachSetFrom` 한 번으로 갈음한다.
function _reaches(ta, sx, sy, tx, ty, cap) {
  if (sx === tx && sy === ty) return true;
  const seen = new Set([sx + ',' + sy]);
  const q = [[sx, sy]];
  let head = 0, n = 0;
  const LIM = cap || CFG.REACH_CAP;
  while (head < q.length) {
    const [x, y] = q[head++];
    if (Math.abs(x - tx) <= 2 && Math.abs(y - ty) <= 2) return true;
    if (++n > LIM) return false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k)) continue;
      if (ta.isBlocked(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return false;
}
// 나선(반경 오름차순) 탐색 — 결정론. 같은 반경 안에서는 각도 순서가 고정이다.
function _spiral(R) {
  const out = [];
  for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    out.push([dx, dy]);
  }
  return out;
}
const _SPIRAL = _spiral(16);

//   ★list/ta 를 넘길 수 있다 — 하네스가 **실지도 51곳을 조립해** 같은 함수를 먹인다(사본 금지).
function _computeArrivals(listIn, taIn) {
  const list = listIn || _villages();
  const ta = taIn || _terrainAdapter();
  const map = new Map();
  if (!list || !ta) return map;
  for (const v of list) { const a = _arrivalFor(v, list, ta); if (a) map.set(v.id, a); }
  return map;
}
// 마을 하나의 도착 지점 — 위 ⓐ~ⓕ 를 한 마을에 적용한다.
function _arrivalFor(v, list, ta0) {
  {
    const ccx = v.cx | 0, ccy = v.cy | 0;
    // ★★[성능 — 통합 러너가 두 번째로 잡았다] **같은 칸을 다시 묻지 않는다.**
    //   실측: 50마을 산출이 **79초**였고, 그 CPU 가 부팅 직후 틱을 굶겨 클라가 마을·경작지를
    //   한 채도 못 받았다(`e2e-nature` 가 "마을 0 · 경작지 0" 으로 잡았다 — 렌더가 아니라 굶주림이었다).
    //   한 마을의 산출은 링 스캔·나선·BFS 가 **같은 칸을 겹쳐** 묻는다. 마을 하나 동안만 메모한다.
    const _mb = new Map(), _mw = new Map();
    const _k = (x, y) => (x * 131071) + y;
    const ta = {
      isBlocked: (x, y) => { const k = _k(x, y); let r = _mb.get(k); if (r === undefined) { r = !!ta0.isBlocked(x, y); _mb.set(k, r); } return r; },
      isWater: (x, y) => { const k = _k(x, y); let r = _mw.get(k); if (r === undefined) { r = !!(ta0.isWater && ta0.isWater(x, y)); _mw.set(k, r); } return r; },
      elev: (x, y) => ta0.elev(x, y), fert: (x, y) => ta0.fert(x, y),
      landValue: ta0.landValue ? ((x, y) => ta0.landValue(x, y)) : null,
    };
    const Rcell = Math.max(6, Math.round((v.r || 800) / SZ));
    // ⓐ 방향
    let dirX = 0, dirY = 1, kind = 'gate';
    const bank = VillageLayout.nearestBank(ta, ccx, ccy, Math.min(30, Rcell + 6));   // ★30 = `generate()` 의 dock 판정과 같은 반경(사본이 아니라 같은 값)
    if (bank) {
      const bx = bank.cx - ccx, by = bank.cy - ccy, bl = Math.hypot(bx, by);
      if (bl > 0.5) { dirX = bx / bl; dirY = by / bl; kind = 'dock'; }
    }
    if (kind !== 'dock') {
      // 길목 — 가장 가까운 이웃 마을 쪽(사람과 짐이 드나드는 방향)
      let best = null, bd = Infinity;
      for (const o of list) {
        if (o.id === v.id) continue;
        const d = Math.hypot(o.cx - ccx, o.cy - ccy);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) { const l = Math.hypot(best.cx - ccx, best.cy - ccy) || 1; dirX = (best.cx - ccx) / l; dirY = (best.cy - ccy) / l; kind = 'road'; }
      else {
        const ax = VillageLayout.axisAt(ta, ccx, ccy);
        const w = ax && ax.toWater ? ax.toWater : null;
        const wl = w ? Math.hypot(w.x, w.y) : 0;
        if (wl > 1e-6) { dirX = w.x / wl; dirY = w.y / wl; kind = 'field'; }
      }
    }
    // ⓑ 그 방향의 어귀(영토 경계 셀)
    //   ★★[전수 검사가 잡은 것] 방향만 보고 고르면 **물가 취락에서 어귀가 중심에 붙는다**.
    //     배산임수 'shore' 배치는 물 쪽으로 납작해서, 물 방향 경계 셀이 중심에서 1~2셀이다.
    //     그러면 "도착해서 마을로 걸어 들어간다"(§9.4 0~3분)가 통째로 사라진다 — 이미 안에 있다.
    //   ⇒ **걸어 들어갈 거리**를 먼저 요구하고(경계 최대 반경의 MIN_FRAC), 그 안에서 방향을 고른다.
    //     물가 마을이면 그 자리에서 다시 물가로 붙이므로(ⓔ) 나루터는 그대로 물가에 선다 —
    //     다만 **마을 옆구리 물가**가 된다. 배가 닿는 곳이 취락 한복판이 아닌 것과 같다.
    const bnd = _boundaryCells(v);
    let maxLen = 0;
    for (const [dx, dy] of bnd) { const l = Math.hypot(dx, dy); if (l > maxLen) maxLen = l; }
    const minLen = Math.max(CFG.GATE_MIN_CELLS, maxLen * CFG.GATE_MIN_FRAC);
    let gate = null, gs = -Infinity;
    for (const pass2 of [0, 1]) {                      // ①거리 요건을 지키며 방향 ②그래도 없으면 전체
      for (const [dx, dy] of bnd) {
        const l = Math.hypot(dx, dy); if (l < 1) continue;
        if (pass2 === 0 && l < minLen) continue;
        const s = (dx / l) * dirX + (dy / l) * dirY + l / (Rcell * 40);   // 방향 우선 · 동률이면 먼 쪽
        if (s > gs) { gs = s; gate = [dx, dy]; }
      }
      if (gate) break;
    }
    if (!gate) gate = [Math.round(dirX * Rcell), Math.round(dirY * Rcell)];
    const gcx = ccx + gate[0], gcy = ccy + gate[1];
    // ⓒⓓⓕ 어귀 바깥 → 통행 가능 · 중심 도달 가능
    //   ★도달 가능 집합을 **한 번** 만든다(위 `_reachSetFrom` 주석 참조).
    const _gd = Math.hypot(gate[0], gate[1]);
    const reach = _reachSetFrom(ta, ccx, ccy, Math.round(Math.max(_gd, Rcell)) + CFG.ARRIVE_SEARCH + CFG.ARRIVE_OUT + 6);
    const okAt = (x, y) => !ta.isBlocked(x, y) && reach.has(x + ',' + y);
    const seed = [gcx + Math.round(dirX * CFG.ARRIVE_OUT), gcy + Math.round(dirY * CFG.ARRIVE_OUT)];
    let picked = null;
    for (const [dx, dy] of _SPIRAL) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > CFG.ARRIVE_SEARCH) break;
      const x = seed[0] + dx, y = seed[1] + dy;
      if (okAt(x, y)) { picked = [x, y]; break; }
    }
    if (!picked) {
      // 어귀가 통째로 막힌 마을 — 중심에서 바깥으로 훑어 첫 통행 칸(그래도 도달성은 지킨다)
      for (let r = Rcell + 4; r >= 1 && !picked; r--) {
        for (let a = 0; a < 360; a += 10) {
          const t = a * Math.PI / 180;
          const x = ccx + Math.round(Math.cos(t) * r), y = ccy + Math.round(Math.sin(t) * r);
          if (okAt(x, y)) { picked = [x, y]; break; }
        }
      }
    }
    if (!picked) picked = [ccx, ccy];
    // ⓔ 물가 마을이면 물가에 붙인다(나루터) — 붙일 곳이 도달 가능할 때만
    if (kind === 'dock') {
      const b2 = VillageLayout.nearestBank(ta, picked[0], picked[1], 6);
      if (b2 && okAt(b2.cx, b2.cy)) picked = [b2.cx, b2.cy];
    }
    const fx = (ccx - picked[0]), fy = (ccy - picked[1]), fl = Math.hypot(fx, fy) || 1;
    return {
      vid: v.id, name: v.name, cx: picked[0], cy: picked[1],
      x: picked[0] * SZ + SZ / 2, y: picked[1] * SZ + SZ / 2,
      kind, gateCx: gcx, gateCy: gcy,
      faceX: +(fx / fl).toFixed(4), faceY: +(fy / fl).toFixed(4),
      centerX: ccx * SZ + SZ / 2, centerY: ccy * SZ + SZ / 2,
    };
  }
}
function arrivals(force) {
  if (force) { _arrCache = new Map(); _arrDone = false; }
  return _arrCache;
}
// ★없으면 **그 마을 하나만** 굽는다 — 51곳을 한꺼번에 굽느라 서버가 멎지 않게(위 성능 주석).
function arrivalOf(vid) {
  if (vid == null) return null;
  const k = vid | 0;
  if (_arrCache.has(k)) return _arrCache.get(k);
  if (_arrDone) return null;
  const list = _villages(), ta = _terrainAdapter();
  if (!list || !ta) return null;
  const v = list.find((x) => x.id === k);
  if (!v) return null;
  const a = _arrivalFor(v, list, ta);
  if (a) _arrCache.set(k, a);
  return a || null;
}
function invalidate() { _arrCache = new Map(); _arrDone = false; }

// ═══ ② 시작 화면이 읽을 마을 목록 ════════════════════════════════════════════
//
// ★근황 한 줄이 곧 "세계가 살아있다"의 첫 증명(§9.1) — 사건 장부 최신 1건을
//   촌장 브리핑과 **같은 문장 생성기**(`Events.briefLine`)로 만든다(사본 금지).
// ★성격 아이콘은 econ 직업 분포에서 **자동**으로 나온다. 새 축을 만들지 않는다.
//   ⚠어촌 = **강·호수 어촌**이다. 이 지도의 바다는 남쪽 하나뿐이고 해안 마을은 3/51 뿐이라
//     (T3 실측) 바다를 기준으로 삼으면 "어촌"이 사실상 사라진다. 물 술어는 `salt.js` 규약대로
//     **바다(`isSea`)와 민물(`isWaterTileLocal`)을 가른 정본**을 그대로 쓴다(사본 금지).
const CHARS = {
  fishing: { key: 'fishing', ko: '어촌', emo: '🎣' },
  mining: { key: 'mining', ko: '산촌', emo: '⛏️' },
  farming: { key: 'farming', ko: '농촌', emo: '🌾' },
};
// 세 갈래 — **econ 직업 이름 그대로**다(새 분류 축을 만들지 않는다).
//   산촌 = 산에서 얻는 일(광부·석공·나무꾼·사냥꾼) · 어촌 = 어부 · 농촌 = 농부·채집꾼.
const SECTORS = {
  fishing: ['fisher'],
  mining: ['miner', 'mason', 'lumberjack', 'hunter'],
  farming: ['farmer', 'forager'],
};
function _sectorSums(counts) {
  const c = counts || {}, out = { fishing: 0, mining: 0, farming: 0 };
  for (const k of Object.keys(SECTORS)) for (const j of SECTORS[k]) out[k] += (+c[j] || 0);
  return out;
}
// ★★성격은 **절대 수가 아니라 두드러짐**으로 정한다(입지계수 LQ).
//   왜: 어느 마을이든 농부가 제일 많다 — 절대 수로 고르면 51곳이 전부 "농촌"이 된다(실측으로 그랬다).
//   ⇒ `이 마을의 몫 ÷ 세계 평균 몫` 이 가장 큰 갈래가 그 마을의 성격이다.
//     임의 문턱이 없고(경제학의 표준 지표), 세계가 바뀌면 성격도 같이 따라온다.
//   `world` 를 안 주면 절대 몫으로 떨어진다(세계를 모를 때의 폴백).
function characterOf(counts, world) {
  const s = _sectorSums(counts);
  const tot = s.fishing + s.mining + s.farming;
  if (!(tot > 0)) return CHARS.farming;
  const W = world || null;
  const wtot = W ? (W.fishing + W.mining + W.farming) : 0;
  let bestK = 'farming', best = -Infinity;
  for (const k of ['fishing', 'mining', 'farming']) {
    const share = s[k] / tot;
    const wshare = (W && wtot > 0) ? (W[k] / wtot) : 1;
    const lq = wshare > 0 ? share / wshare : (share > 0 ? Infinity : 0);
    if (lq > best) { best = lq; bestK = k; }
  }
  return CHARS[bestK];
}
function worldSectors(countsList) {
  const out = { fishing: 0, mining: 0, farming: 0 };
  for (const c of countsList || []) { const s = _sectorSums(c); out.fishing += s.fishing; out.mining += s.mining; out.farming += s.farming; }
  return out;
}
function popBand(n) {
  const p = n | 0;
  if (p < 40) return { key: 'small', ko: '작은 마을' };
  if (p < 90) return { key: 'mid', ko: '보통 마을' };
  return { key: 'big', ko: '큰 마을' };
}
function busyBand(n) {
  const p = n | 0;
  if (p <= 0) return { key: 'quiet', ko: '한산함' };
  if (p <= 3) return { key: 'some', ko: '몇 사람' };
  return { key: 'busy', ko: '붐빔' };
}

let _countsCache = { at: 0, byName: null };
function _econCounts() {
  const now = Date.now();
  if (_countsCache.byName && now - _countsCache.at < 60000) return _countsCache.byName;
  const byName = new Map();
  try {
    const d = H.SimVillages && H.SimVillages.lifeDebug && H.SimVillages.lifeDebug();
    for (const v of (d && d.villages) || []) byName.set(v.name, v.econCounts || {});
  } catch (e) { /* 관측창이 없으면 성격은 농촌 폴백 */ }
  _countsCache = { at: now, byName };
  return byName;
}

// 마을별 접속 플레이어 수 — 혼잡도(§9.1 "인위적 제한 없음, 자연 분산")
function _playersNear() {
  const out = new Map();
  const ps = (H && H.players) || null;
  if (!ps) return out;
  const arr = arrivals();
  for (const p of ps.values()) {
    if (p.isNpc) continue;
    let best = null, bd = Infinity;
    for (const [vid, a] of arr) {
      const d = Math.hypot(a.centerX - p.x, a.centerY - p.y);
      if (d < bd) { bd = d; best = vid; }
    }
    // 영토 반경 남짓 안에 있는 사람만 그 마을 사람으로 센다
    if (best != null && bd < 1600) out.set(best, (out.get(best) || 0) + 1);
  }
  return out;
}

function startInfo() {
  const list = _villages();
  if (!list) return { ok: false, err: 'not_ready' };
  const counts = _econCounts();
  const world = worldSectors([...counts.values()]);
  const near = _playersNear();
  const ledger = (H.SimVillages && H.SimVillages.eventLedger) || null;
  const rows = [];
  for (const v of list) {
    //   ★★**캐시만 본다 — 여기서 구우면 안 된다.**
    //     `/startinfo` 는 로비가 부팅 직후에 부르는 요청이다. 여기서 51곳을 즉석에서 구우면
    //     그 요청 하나가 서버를 수십 초 멎게 하고, 그 정지 구간에 접속한 클라는 **렌더 패스가
    //     죽은 채로** 화면을 찍는다(통합 러너에서 마을 켠 하네스 여섯이 그렇게 실패했다).
    //     굽는 건 배경(`_warmStep`)이 한 마을씩 한다. 아직이면 그 마을은 이번 응답에서 빠진다 —
    //     로비가 몇 초 뒤 다시 물으면 채워져 있다(`warming` 플래그가 그 신호다).
    const a = _arrCache.get(v.id) || null;
    const ch = characterOf(counts.get(v.name), world);
    let news = '', board = 0;
    if (ledger) {
      try {
        const evs = ledger.recent(v.id, 1);
        if (evs && evs.length) news = H.Events.briefLine(evs[0]) || '';
        board = (ledger.board(v.id) || []).length;
      } catch (e) {}
    }
    if (!news) news = '별일 없네. 자네도 몸 성히 지내게.';
    const busy = near.get(v.id) || 0;
    rows.push({
      vid: v.id, name: v.name, cx: v.cx, cy: v.cy,
      pop: v.pop | 0, popBand: popBand(v.pop).key, popKo: popBand(v.pop).ko,
      ch: ch.key, chKo: ch.ko, chEmo: ch.emo,
      news, board,
      busy, busyKo: busyBand(busy).ko,
      arrive: a ? { x: a.x, y: a.y, kind: a.kind } : null,
      welcome: _welcomes(v, a),
    });
  }
  // 추천 = "이방인 환영" — 도착 지점이 성립하고(배산임수 감사 합격) · 쉼터가 되고(사람이 산다) ·
  //        혼잡도가 낮은 곳. 인위적 제한이 아니라 **자연 분산**의 손잡이다(§9.1).
  const rec = rows.filter((r) => r.welcome.ok).sort((x, y) => (x.busy - y.busy) || (y.pop - x.pop));
  return { ok: true, zone: H.ZONE_ID, villages: rows, recommend: rec.length ? rec[0].vid : (rows[0] ? rows[0].vid : null),
    recommendN: rec.length, lotAfter: CFG.LOT_AFTER, warming: !_arrDone, ready: _arrCache.size, total: list.length };
}
function _welcomes(v, a) {
  const why = [];
  if (!a) why.push('도착 지점 없음');
  if ((v.pop | 0) < CFG.RECOMMEND_POP) why.push('사람이 너무 적다');
  return { ok: why.length === 0, why };
}

// ═══ ③ 대본 상태 기계 ════════════════════════════════════════════════════════

// 도착 — **첫 도착일 때만** 좌표를 바꾼다. 이어하기(last_x/y)는 절대 건드리지 않는다.
//   `acct` 는 central 행(없으면 1회용 게스트). 이 존에 마지막 위치나 home 이 있으면 그건 **귀환**이다.
//
// ★★[2026-09-01 통합 러너가 잡은 것] **고르지 않은 접속의 스폰은 한 글자도 안 바꾼다.**
//   1차 실장은 `start_vid` 가 없으면 **추천 마을로 데려갔다**. 그게 세 하네스를 깼다:
//     · `e2e-cutaway`  — `mainSquare` 를 큰집 셀로 패치해 **거기 스폰**시키는 도구가 무력해졌다
//     · `e2e-guest-reconnect` — 마을 옆에 떨어져 "마을을 못 세운다(남의 땅과 너무 가깝다)"
//     · `e2e-cold`     — 마을 51곳 시딩 판에서 같은 갈래
//   그리고 그게 **옳은 실패**였다: 시작 화면을 거치지 않은 접속(옛 클라·원시 WS·하네스 도구)의
//   스폰을 서버가 마음대로 옮기는 건 "선택은 문이지 벽이 아니다"(§9.1)의 반대편이다.
//   ⇒ **문을 지난 사람만 도착한다.** `start_vid` 가 명시된 접속(=시작 화면에서 골랐다)에만 적용한다.
//   ⚠종전 스폰은 이미 마을 광장이다(`ZONE.mainSquare` = 한반도 "농촌22 광장") — 안 고른 사람이
//     허허벌판에 떨어지지 않는다. 대본(촌장 근접·첫 의뢰)은 거기서도 그대로 돈다.
//   회부: 「월드 입장」(마을 미선택)의 기본값을 추천 마을로 할 것인가 — 그러려면 위 하네스들이
//   스폰 도구를 `teleport_debug` 로 옮겨야 한다(T10 몫). `회부_온보딩_다음층.md` B-6.
function arriveFor(startVid, acct, zoneId, playerId) {
  if (!ready()) return null;
  const returning = !!(acct && ((acct.last_zone === zoneId && typeof acct.last_x === 'number')
                              || (acct.home_zone === zoneId && typeof acct.home_x === 'number')));
  if (returning) return null;
  let vid = (startVid == null || startVid === '') ? null : (parseInt(startVid, 10) | 0);
  const s = playerId ? stateOf(playerId) : null;
  //   ★저장된 선택은 살린다 — 첫 저장 전에 재접속한 사람은 **자기가 고른 마을**로 돌아간다.
  if (vid == null && s && s.start_vid != null) vid = s.start_vid | 0;
  if (vid == null) return null;               // ★고르지 않았다 = 종전 스폰 그대로(위 주석)
  let a = arrivalOf(vid);
  if (!a) {                                   // 고르긴 했는데 사라진 마을 — 추천으로 보낸다
    const info = startInfo();
    if (info && info.ok && info.recommend != null) a = arrivalOf(info.recommend);
  }
  if (!a) return null;
  if (playerId) {
    const st = stateOf(playerId);
    st.start_vid = a.vid; st.arrived = 1;
    _save(playerId, st);
  }
  return a;
}
// 신체 시작값 — **첫 도착에만**. 이어하기는 저장본 그대로다(오프라인 감쇠 없음 캐논).
//   ★값의 정본은 여기 하나다(zone.js 는 이걸 읽어 `initHunger`/`initThirst` 에 얹을 뿐 — 사본 금지).
function startGauges() { return { hunger: CFG.START_HUNGER, thirst: CFG.START_THIRST }; }

// 첫 의뢰 고르기 — **게시판 생성기가 실제로 낸 의뢰** 중에서.
//   우선순위: ①보상이 먹을 것인 의뢰(§9.4 "납품 → 밥" — 새 수도꼭지 없이 밥이 나온다)
//             ②잔여 비율이 큰 것(가장 급한 일)
//   ★못 고르면 null 이다. 없는 의뢰를 지어내지 않는다.
function pickFirstQuest(vid) {
  const ledger = (H.SimVillages && H.SimVillages.eventLedger) || null;
  if (!ledger) return null;
  let rows = [];
  try { rows = ledger.board(vid | 0) || []; } catch (e) { return null; }
  if (!rows.length) return null;
  const food = (H.foodItems instanceof Set) ? H.foodItems : new Set();
  const toItem = (res) => { try { return ledger.deliverable.toEcon.get(res) || null; } catch (e) { return null; } };
  const urg = (r) => r.remain / Math.max(1, r.qty);
  const edible = rows.filter((r) => { const it = toItem(r.rewItem); return it && food.has(it); });
  const pool = edible.length ? edible : rows;
  pool.sort((a, b) => urg(b) - urg(a));
  const r = pool[0];
  return { item: r.item, qty: r.qty, remain: r.remain, rewItem: r.rewItem, rewQty: r.rewQty,
    rewPlayerItem: toItem(r.rewItem), meal: edible.length > 0 };
}

// 촌장의 첫 마디 — 인사 + 첫 의뢰 제안 + **방향은 대사로**(화살표 금지 · §9.5).
const _DIRWORD = (dx, dy) => {
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  if (a >= -22.5 && a < 22.5) return '해 뜨는 쪽';
  if (a >= 22.5 && a < 67.5) return '해 뜨는 남쪽';
  if (a >= 67.5 && a < 112.5) return '남쪽';
  if (a >= 112.5 && a < 157.5) return '해 지는 남쪽';
  if (a >= 157.5 || a < -157.5) return '해 지는 쪽';
  if (a >= -157.5 && a < -112.5) return '해 지는 북쪽';
  if (a >= -112.5 && a < -67.5) return '북쪽';
  return '해 뜨는 북쪽';
};
function greetLines(vid, playerId) {
  const a = arrivalOf(vid);
  const q = pickFirstQuest(vid);
  const s = stateOf(playerId);
  const ko = (r) => { try { return H.Events.koRes(r); } catch (e) { return r; } };
  const lines = [];
  if (s.first_done) {
    lines.push('또 왔는가. 손이 여물었군.');
  } else {
    lines.push('낯선 얼굴이군. 어디서 왔나.');
  }
  if (q) {
    const j = (n) => { const c = n.charCodeAt(n.length - 1); return (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28) ? '이' : '가'; };
    const n = ko(q.item);
    lines.push(`요즘 ${n}${j(n)} 달리네. ${q.remain}만 구해다 주면 ${ko(q.rewItem)}(으)로 갚음세.`);
    if (a) {
      const where = a.kind === 'dock' ? `${_DIRWORD(-a.faceX, -a.faceY)} 강가로 가 보게` : `${_DIRWORD(-a.faceX, -a.faceY)} 들로 나가 보게`;
      lines.push(`${where}.`);
    }
  } else {
    lines.push('지금은 급한 일이 없네. 모닥불 곁에서 쉬게.');
  }
  return { lines, quest: q, arrive: a ? { kind: a.kind } : null };
}

// ★납품 훅 — zone.js `tryVillageDeliver` 가 성사 직후 한 줄로 부른다.
//   여기서 하는 일: 누적 기여(=T11 이 재사용할 **하나의** 카운터) · 곳간 이펙트 · 훅 대사 · 빈터 권리.
//   ⚠아이템을 새로 주지 않는다(밥은 그 의뢰의 보상이다 — B-1 물리 상한 캐논).
function onDeliver(player, r, vid) {
  if (!ready() || !player || !r || !r.ok) return;
  const pid = player.playerId;
  const s = stateOf(pid);
  const day = (typeof H.gameDay === 'function') ? (H.gameDay() | 0) : -1;
  if (s.day !== day) { s.day = day; s.day_deliv = 0; s.day_fish = _fishN(player); }
  s.day_deliv = (s.day_deliv | 0) + 1;
  const a = arrivalOf(vid);
  const out = [];
  const done = !!(r.done);
  if (done) {
    s.contrib = (s.contrib | 0) + 1;
    if (!s.first_done) { s.first_done = 1; if (r.req && r.req.item) s.first_item = String(r.req.item); }
  }
  // 곳간 방향 이펙트 — "내가 낸 물건이 실제로 쌓인다"(§9.4 반응 ②). 새 패널이 아니라 한 번의 연출.
  if (a) out.push({ type: 'onboarding_fx', kind: 'granary', x: a.centerX, y: a.centerY, vid: vid | 0 });
  // ★촌장의 말은 **온보딩 전용 메시지**로 보낸다 — 근접 브리핑(`village_brief`)과 같은 통로를 쓰면
  //   0.7초마다 도는 그쪽이 이 말을 덮어쓴다(실측으로 그랬다). 그리는 건 클라의 같은 말풍선이다.
  if (done && s.contrib === 1 && !s.hooked) {
    s.hooked = 1;
    out.push({ type: 'onboarding_quest', vid: vid | 0, kind: 'hook', name: (a && a.name) || '', day, quest: null,
      lines: ['잘했네. 오늘은 밥이라도 들게.', '며칠 일손을 보태면 마을 끝 빈터 하나 내어줌세.'], state: publicState(pid) });
  }
  if (!s.lot_ok && (s.contrib | 0) >= CFG.LOT_AFTER) {
    s.lot_ok = 1;
    out.push({ type: 'onboarding_quest', vid: vid | 0, kind: 'lot', name: (a && a.name) || '', day, quest: null,
      lines: ['이만하면 우리 마을 사람일세.', '어귀 빈터를 쓰게 — 거기다 자네 집을 올리게.'], state: publicState(pid) });
    out.push({ type: 'onboarding_state', state: publicState(pid) });
  }
  _save(pid, s);
  if (H.send && player.ws) for (const m of out) { try { H.send(player.ws, m); } catch (e) {} }
}
// 어획 마릿수 — **낚시 정본의 필드 이름 그대로**(`zone.js` `_fishStats`: casts·caught·missed·kg…).
//   ★1차에 `f.n` 을 봤다. 그런 필드는 없다 — 하루 정산이 늘 0 이었을 것이다(조용히 틀리는 종류).
function _fishN(player) { const f = player && player.fishStats; return (f && Number.isFinite(f.caught)) ? (f.caught | 0) : 0; }

// ═══ ④ 빈터 권리 — 기존 클레임 규칙에 게이트 하나 ═══════════════════════════
//
// ★최소형(§4): 누적 기여 N회를 채우면 **도착한 그 마을 어귀**의 지정 구역에서
//   개인 사유지를 걸 수 있다(길드 영토 요건을 그 구역에서만 면제). 구역 밖은 종전 그대로다.
function vacantZoneOf(vid) {
  const a = arrivalOf(vid);
  if (!a) return null;
  return { cx: a.cx, cy: a.cy, r: CFG.VACANT_R, x: a.x, y: a.y, rPx: CFG.VACANT_R * SZ };
}
function vacantLotAllows(player, px, py) {
  if (!ready() || !player) return false;
  const s = stateOf(player.playerId);
  if (!s.lot_ok || s.start_vid == null) return false;
  const z = vacantZoneOf(s.start_vid);
  if (!z) return false;
  return Math.hypot(z.x - px, z.y - py) <= z.rPx;
}

// ═══ 상태 · 메시지 ═══════════════════════════════════════════════════════════
function publicState(playerId) {
  const s = stateOf(playerId);
  const z = s.start_vid != null ? vacantZoneOf(s.start_vid) : null;
  return { vid: s.start_vid, firstItem: s.first_item, firstDone: !!s.first_done,
    contrib: s.contrib | 0, need: CFG.LOT_AFTER, lotOk: !!s.lot_ok,
    lot: z ? { x: z.x, y: z.y, r: z.rPx } : null,
    day: { day: s.day, deliv: s.day_deliv | 0, fish: 0 } };
}
// 하루 정산 — **이력서 데이터 재사용**(새 패널 금지 · HUD 한 줄).
function daySummary(player) {
  const s = stateOf(player.playerId);
  const day = (typeof H.gameDay === 'function') ? (H.gameDay() | 0) : -1;
  const fishNow = _fishN(player);
  if (s.day !== day) { s.day = day; s.day_deliv = 0; s.day_fish = fishNow; _save(player.playerId, s); }
  const fish = Math.max(0, fishNow - (s.day_fish | 0));
  const parts = [];
  if (fish > 0) parts.push(`물고기 ${fish}`);
  if ((s.day_deliv | 0) > 0) parts.push(`납품 ${s.day_deliv | 0}`);
  return { day, fish, deliv: s.day_deliv | 0, text: parts.length ? `오늘: ${parts.join(' · ')}` : '' };
}
// zone.js `handleMessage` 가 한 줄로 넘긴다.
function handleMsg(player, msg) {
  if (!ready() || !player || !msg || !H.send || !player.ws) return;
  const t = msg.type;
  if (t === 'onboarding_state') {
    H.send(player.ws, { type: 'onboarding_state', state: publicState(player.playerId), arrive: arrivalOf(stateOf(player.playerId).start_vid) });
  } else if (t === 'onboarding_greet') {
    const vid = msg.vid != null ? (msg.vid | 0) : stateOf(player.playerId).start_vid;
    if (vid == null) return;
    const g = greetLines(vid, player.playerId);
    const a = arrivalOf(vid);
    H.send(player.ws, { type: 'onboarding_quest', vid, kind: 'greet', name: (a && a.name) || '',
      day: (typeof H.gameDay === 'function') ? (H.gameDay() | 0) : 0,
      lines: g.lines, quest: g.quest, state: publicState(player.playerId) });
  } else if (t === 'onboarding_day') {
    H.send(player.ws, { type: 'onboarding_day', summary: daySummary(player) });
  }
}

// HTTP — 시작 화면이 읽는다. **CORS 개방**: 로비는 central 오리진에서 뜨고 존은 다른 호스트다
//   (`/lifedbg`·`/roomdbg` 와 같은 규약 — 민감 정보 없음: 마을 이름·인구대·근황 한 줄뿐).
function httpStartInfo(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  try { res.end(JSON.stringify(startInfo())); }
  catch (e) { res.end(JSON.stringify({ ok: false, err: e.message })); }
}

module.exports = {
  CFG, init, ready, invalidate,
  arrivals, arrivalOf, arriveFor, startGauges,
  startInfo, httpStartInfo, characterOf, worldSectors, SECTORS, CHARS, popBand, busyBand,
  pickFirstQuest, greetLines, onDeliver, handleMsg, daySummary,
  vacantZoneOf, vacantLotAllows, publicState, stateOf,
  // ★하네스용 — **정본을 그대로 내준다**(하네스가 산출을 다시 짜면 사본이다)
  __probe: { computeArrivals: _computeArrivals, terrainAdapter: _terrainAdapter, boundaryCells: _boundaryCells,
    reaches: _reaches, save: _save, blank: _BLANK, cache: _cache, SZ,
    // ★하네스가 **실지도로 조립한** 도착 지점 표를 그대로 꽂는다 — 그래야 아래 권리·구역 판정이
    //   라이브와 **같은 함수**를 밟는다(하네스가 판정을 다시 짜면 그게 사본이다).
    setArrivals: (m) => { _arrCache = m; _arrDone = true; return _arrCache.size; },
    clearCache: () => { _cache.clear(); _countsCache = { at: 0, byName: null }; } },
};
