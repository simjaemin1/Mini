// =============================================================================
// server/villages.js — §4-4 Stage 2·3: NPC 마을 시뮬 본체 이식 (마을실험실 → 존 서버)
//
// 무엇:
//   · Stage 2 (시딩): hanbando 존 부팅 시 villages 테이블이 비어 있으면
//     hanbando-terrain.json 하드코딩 마을 좌표(에디터 v9, terrain.getZoneVillages)를 씨앗으로
//     village-layout.js generate()(마을실험실과 시그니처 동일)를 본체 지형 어댑터로 실행,
//     villages + village_buildings(집·논·밭·회관, 셀 단위)에 기록. idempotent(비어있을 때만).
//     마을 수는 상위 VILLAGE_MAX(기본 10, §2.4 수용 근거는 pickSeedVillages 주석)로 제한.
//   · Stage 2 (NPC): 마을당 econ 초기 인구(createVillage initialPop=8)를 기존 spawnNpc()로
//     스폰(새 스폰 경로 발명 금지). NPC↔마을 연결은 메모리 맵(vil.npcPids + p.simVillageId)
//     — zone 로컬 DB에는 players 테이블 자체가 없어(central 소관) 컬럼 추가보다 침습이 적다.
//   · Stage 3 (econ): sim/economy-sim.js(v1)+economy-sim-v2.js를 require, 마을실험실과 동일한
//     배선(createWorldV2 → 마을 슬롯을 createVillage(landParams)로 교체 → tickWorldV2)으로
//     게임일(WORLD.dayLengthMs=10분) 경계마다 1틱. econ_state는 JSON 직렬화로 왕복
//     (serializeEcon/restoreEcon — Map/Set 없음 확인, _world 순환 참조만 제외).
//
// 가드레일(계약 — 위반 금지):
//   · ENABLE_VILLAGES=0 → init()/onGameTick() 진입 즉시 return: 완전 no-op.
//     econ/레이아웃 모듈 require도 init 안 lazy — 플래그 off면 sim/* 로드 자체가 없음.
//   · 추가 전용: zone.js 훅 2줄(부팅 init 1회 + gameLoop 경계검사 1줄)만. 기존 NPC
//     (spawnVillagers 50마을×6명) 경로·기존 테이블 불변. NPC 제거는 canadia 검증 패턴
//     (players/npcs delete + player_left broadcast, zone.js 5828행) 재사용.
//   · 30Hz 물리와 분리: onGameTick은 게임일 '경계'에서만 일함(평시 O(1) 정수 비교).
//     setInterval 신설 없음 — 기존 gameLoop에 편승해 시계 원천(Date.now)을 공유.
//
// 테스트 훅(운영 기본값은 전부 무설정):
//   VILLAGE_DAY_MS  — 게임일 길이 오버라이드(ms). 일일 틱 스모크용(예: 2000).
//   VILLAGE_MAX     — 시딩 마을 수(기본 10).
//   VILLAGE_NPC_CAP — 마을당 가시 NPC 상한(기본 40) — econ 인구는 무제한(시뮬 진실),
//                     스폰 NPC만 캡. dormant NPC 총량 안전선(zone.js 997행, ~1000명) 고려.
//
// Stage 4~5 인계: 렌더(village_buildings → 실제 wall/floor/farmland 실물화·영토 claim),
//   econ 직업 ↔ NPC 시각 직업 연결(npcJob — 아래 '오염 방지' 주석 참조), 최적화.
// =============================================================================
'use strict';

const ENABLED = process.env.ENABLE_VILLAGES !== '0'; // 기본 켜짐. '0'만 완전 no-op.

const SZ = 32; // 셀 크기(px) — zone.js BUILDING_SIZE(436행)·zone-config 셀과 동일
const INITIAL_POP = 8; // econ createVillage 초기 인구 기본값(economy-sim.js 697행)과 일치
const VILLAGE_MAX = Math.max(1, parseInt(process.env.VILLAGE_MAX || '20', 10));   // ★기본 20(사용자 밀도 캐논 §2.4·§3b: 한반도 존 마을 12~20 — 10은 1착륙 보수값이었음). 성능 확정은 Stage 5 실측
const NPC_CAP_PER_VILLAGE = Math.max(1, parseInt(process.env.VILLAGE_NPC_CAP || '40', 10));
const POP_SYNC_PER_DAY = 2; // 인구 반영은 완만: 게임일당 마을당 ±2명까지 (증가=스폰, 감소=최근 NPC부터)
const MIN_SPACING_PX = 12000; // 마을 간 최소 간격 — pickSeedVillages 주석 참조

const state = {
  ready: false,
  zoneId: null,
  deps: null,      // zone.js 주입: { spawnNpc, players, npcs, broadcast, isTerrainBlockedLocal, isWaterTileLocal }
  db: null,        // zone-local-db (require 캐시 = zone.js와 동일 인스턴스)
  econ: null,      // sim/economy-sim (v1)
  econV2: null,    // sim/economy-sim-v2
  world: null,     // econ world (tickWorldV2 대상)
  villages: [],    // { dbId, name, ccx, ccy, housesPx: [{x,y}], econ, npcPids: [] }
  dayMs: 0,
  epoch: 0,
  lastGameDay: -1,
};

// 게임 절대일 — zone-config WORLD(worldEpoch=0, dayLengthMs=10분)와 같은 시계 원천(Date.now).
// isNight/worldPhase와 동일 epoch를 쓰므로 낮밤 주기와 일 경계가 정렬됨.
function gameDayOf(now) { return Math.floor((now - state.epoch) / state.dayMs); }

// =============================================================================
// 지형 어댑터 — village-layout.js가 요구하는 { isBlocked, fert, elev, isWater } 인터페이스를
// 본체 terrain.js/zone.js 콜라이더로 구현. 좌표는 전부 '셀'(×32px=월드, 판정은 셀 중심).
// =============================================================================
function makeTerrainAdapter(terrain, ZONE, deps) {
  const px = (c) => c * SZ + SZ / 2;
  const W = ZONE.zoneWidth, H = ZONE.zoneHeight;
  const zoneId = state.zoneId;
  const isBlocked = (cx, cy) => {
    const x = px(cx), y = px(cy);
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return deps.isTerrainBlockedLocal(x, y); // 물+바위+해안 water tiles (zone.js 305행)
  };
  const isWater = (cx, cy) => {
    const x = px(cx), y = px(cy);
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return deps.isWaterTileLocal(x, y);
  };
  const isRock = (cx, cy) => {
    try { return terrain.isRockCellLocal(zoneId, px(cx), px(cy)); } catch { return false; }
  };
  const forestMult = (cx, cy) => {
    try { return terrain.getForestMultiplier(zoneId, px(cx), px(cy)); } catch { return 1.0; }
  };
  // 중심→가장 가까운 물까지 거리(셀) — village-layout 57행과 같은 링 스캔(20° 스텝).
  const nearestWaterDist = (ccx, ccy, maxR) => {
    for (let r = 1; r <= maxR; r++) {
      for (let a = 0; a < 360; a += 20) {
        const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
        if (isWater(Math.round(ccx + ca * r), Math.round(ccy + sa * r))) return r;
      }
    }
    return maxR + 1;
  };
  // ★근사(1차, 주석 의무): 본체 지형엔 마을실험실의 fert 필드(셀 비옥도 실측)가 없다.
  //   fert는 상수 0.5 — generate()의 영토 확장 tiebreak(fertW=0.35)만 중립화되고
  //   거리항(distW)이 지배해 컴팩트 블롭이 나옴(랩과 같은 계열). 실측 비옥도는 Stage 4 후보.
  const fert = () => 0.5;
  // 고도 프록시 — 물에서 멀수록 높음(배산임수 축 판정용). axisAt이 ±1셀 4회만 호출해 링 스캔 비용 OK.
  const elev = (cx, cy) => Math.min(1, nearestWaterDist(cx, cy, 45) / 45);
  return { isBlocked, isWater, isRock, forestMult, fert, elev, nearestWaterDist };
}

// 마을 중심이 물/바위 위면 근처 열린 셀로 스냅(에디터 좌표가 강폭 확장 등으로 물에 잠긴 경우 구제).
function findOpenCenter(ta, ccx, ccy) {
  const ok = (x, y) => !ta.isBlocked(x, y) && !ta.isBlocked(x + 1, y) && !ta.isBlocked(x - 1, y) && !ta.isBlocked(x, y + 1) && !ta.isBlocked(x, y - 1);
  if (ok(ccx, ccy)) return { ccx, ccy };
  for (let r = 1; r <= 24; r++) {
    for (let a = 0; a < 16; a++) {
      const cx = Math.round(ccx + Math.cos(a / 16 * 2 * Math.PI) * r);
      const cy = Math.round(ccy + Math.sin(a / 16 * 2 * Math.PI) * r);
      if (ok(cx, cy)) return { ccx: cx, ccy: cy };
    }
  }
  return null; // 구제 불가 — 이 마을은 스킵
}

// =============================================================================
// 지형 → economy-sim land params — 마을실험실 extractLandParams(V,TR) 이식.
// 동일한 리스케일 계수(stone=0.1+rockD*12, wood=0.25+forD*2.8, game=0.2+forD*2.6,
// water=(1-nd/25)*1.6, size=영토/25, arable=영토 내 뭍 비율)를 그대로 사용.
// ★근사(1차, 주석 의무 — 마을실험실과의 차이):
//   ① fertility: 랩은 지형 fert 필드 실측 ×2.0. 본체엔 fert 필드가 없어
//      '물 접근(관개) + 저바위(경작 가능)' 프록시로 근사 → 평야·강변 ~1.1-1.3(자급),
//      산악 ~0.1(식량 수입 의존) — 랩의 역할 분화(agri 2.8 / mining 0.02)와 같은 방향.
//   ② 반경 R=140셀 전수 스캔 대신 4셀 스텝 서브샘플(비율 통계라 결과 동급 —
//      랩 4780행의 스텝 8 프로파일과 같은 논리). 강 path 스캔 비용 절감.
// =============================================================================
function extractLandParamsApprox(ta, ccx, ccy, layout) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const R = 140, STEP = 4;
  let rock = 0, forest = 0, n = 0;
  for (let dy = -R; dy <= R; dy += STEP) {
    for (let dx = -R; dx <= R; dx += STEP) {
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      const w9 = 1 - Math.sqrt(d2) / R;   // ★리카도 거리 감쇠(랩 extractLandParams와 동일 규칙): 가까운 산·숲일수록 가치 — 균일 분포는 불변, 뭉친 자원만 원근 차등
      n += w9;
      const cx = ccx + dx, cy = ccy + dy;
      if (ta.isRock(cx, cy)) rock += w9;
      else if (ta.forestMult(cx, cy) > 1.2) forest += w9;
    }
  }
  const rockD = n ? rock / n : 0, forD = n ? forest / n : 0;
  const nd = ta.nearestWaterDist(ccx, ccy, 140);   // ★탐색 45→140(랩 자원권 R과 통일 — 100m 강도 어장권)
  const water = Math.max(0.05, Math.min(1, 1 - nd / 140));   // ★리카도 선형 감쇠: 물가 1.0 → 100m 0.29 → 140m+ 바닥 — '멀리 강 있는 마을은 어부를 뽑되 적게'
  let tw = 0;
  const tn = (layout.territory && layout.territory.length) || 0;
  if (tn) for (const c of layout.territory) if (ta.isWater(c[0], c[1])) tw++;
  const fertility = clamp(+(0.4 + water * 0.9 - rockD * 1.5).toFixed(2), 0.1, 2.0); // ★근사 ① (위 주석)
  return {
    fertility,
    arable: tn ? +((tn - tw) / tn).toFixed(2) : 1.0,
    water: +(water * 1.6).toFixed(2),
    stone: clamp(+(0.1 + rockD * 12).toFixed(2), 0.05, 2.5),
    ore: clamp(+(0.08 + rockD * 12).toFixed(2), 0.05, 2.5),
    wood: clamp(+(0.25 + forD * 2.8).toFixed(2), 0.05, 2.5),
    game: clamp(+(0.2 + forD * 2.6).toFixed(2), 0.05, 2.5),
    size: Math.max(30, Math.round(tn / 25)),
  };
}

// =============================================================================
// 씨앗 마을 선별 — 하드코딩 50개 중 상위 VILLAGE_MAX(8~12권장, 기본 10)개.
// §2.4 수용 근거:
//   · 수(10): econ 인구는 마을당 8→수십 명으로 자람. dormant NPC 안전선 ~1000명
//     (zone.js 997행) 아래에서 기존 300명(50마을×6) + 신규(10×cap40=400) 여유 유지.
//   · 간격(MIN_SPACING_PX=12000px): 영토 반경 ~30셀(≈1000px)의 12배 — 영토·농지 비겹침을
//     기하로 보장 + 청크 활성 반경(1200px)·AOI(800px) 기준 한 화면에 두 마을이 동시에
//     활성화되지 않아 부하 분산.
//   · 우선순위: 수용력 K는 식량 부양(비옥·물)이 지배 → type prior(평야>강변>숲>광산)
//     점수 내림차순. 단 econ 회로(도구·목재 사슬)에 광산·숲이 필요하므로 type별 최고
//     1곳을 먼저 확보(다양성) 후 나머지를 점수순으로 채움.
// =============================================================================
function pickSeedVillages(all) {
  const TYPE_PRIOR = { plain: 1.0, riverside: 0.9, forest: 0.75, mining: 0.5 };
  const scored = all.map(v => ({ ...v, _score: TYPE_PRIOR[v.type] != null ? TYPE_PRIOR[v.type] : 0.7 }));
  scored.sort((a, b) => b._score - a._score);
  const picked = [];
  const farEnough = (v) => picked.every(p => Math.hypot(p.x - v.x, p.y - v.y) >= MIN_SPACING_PX);
  // ① type 다양성 — 각 type 최고점 1곳
  for (const type of ['plain', 'riverside', 'forest', 'mining']) {
    if (picked.length >= VILLAGE_MAX) break;
    const cand = scored.find(v => v.type === type && !picked.includes(v) && farEnough(v));
    if (cand) picked.push(cand);
  }
  // ② 나머지는 점수순 + 간격
  for (const v of scored) {
    if (picked.length >= VILLAGE_MAX) break;
    if (!picked.includes(v) && farEnough(v)) picked.push(v);
  }
  return picked;
}

// =============================================================================
// econ 직렬화 왕복 — Map/Set 없음(economy-sim 마을 상태는 전부 plain object/array 확인).
// _world(순환 참조)만 제외하고 통째 저장 → 엔진(3사본)이 필드를 추가해도 저장이 따라감.
// history는 최근 50개만(용량), dailyProductionBuf는 매 틱 리셋 버퍼라 복원 시 재생성.
// 미복원(의도): world.caravans(마을·NPC 객체 직접 참조 — 재부팅 시 운송 중 화물 소실은
//   출발 시점 차감분 소량, 허용) / world.tradeLog(로그).
// =============================================================================
const SERIALIZE_SKIP = new Set([
  '_world',            // world 순환 참조 (복원 시 재부착)
  'dailyProductionBuf',// 매 틱 리셋 버퍼 (복원 시 재생성)
  'history',           // 아래서 최근 50개만 별도 저장
  '_near20', '_near20N', // tickTradeV2 이웃 캐시 — '마을 객체 참조' 배열(순환). 다음 틱에 재구축됨.
  '_priceCache', '_priceCacheDay', // 일 단위 가격 캐시 — 다음 틱에 재계산
]);
const _serializeWarned = new Set();
function serializeEcon(v) {
  const out = {};
  for (const k of Object.keys(v)) {
    if (SERIALIZE_SKIP.has(k) || typeof v[k] === 'function') continue;
    out[k] = v[k];
  }
  out.history = (v.history || []).slice(-50);
  try {
    return JSON.stringify(out);
  } catch (e) {
    // 안전망: 엔진(3사본, 진화 중)이 새 '객체 참조 캐시'를 추가하면 그 키만 드랍(1회 경고).
    //   저장은 절대 실패하지 않는다 — 드랍된 캐시는 다음 틱에 엔진이 재구축.
    for (const k of Object.keys(out)) {
      try { JSON.stringify(out[k]); } catch {
        delete out[k];
        if (!_serializeWarned.has(k)) {
          _serializeWarned.add(k);
          console.warn(`[${state.zoneId}] 🏘️ serializeEcon: 비직렬 키 '${k}' 드랍 (SERIALIZE_SKIP 등재 권장)`);
        }
      }
    }
    return JSON.stringify(out);
  }
}
function restoreEcon(json, econ) {
  const v = JSON.parse(json);
  v._world = null; // 호출부에서 재부착
  v.history = Array.isArray(v.history) ? v.history : [];
  v.dailyProductionBuf = Object.fromEntries(econ.RESOURCES.map(r => [r, 0]));
  v.npcs = Array.isArray(v.npcs) ? v.npcs : [];
  v.storage = v.storage || {};
  v.surplusEMA = v.surplusEMA || {};
  for (const r of econ.RESOURCES) {
    if (v.storage[r] == null) v.storage[r] = 0;
    if (v.surplusEMA[r] == null) v.surplusEMA[r] = 0;
  }
  if (!v.counts) { // 구버전 저장분 방어 — npcs에서 재계산
    v.counts = {};
    for (const npcRow of v.npcs) v.counts[npcRow.currentJob] = (v.counts[npcRow.currentJob] || 0) + 1;
  }
  return v;
}

// =============================================================================
// NPC 스폰/제거 — 기존 경로 재사용(발명 금지).
// 스폰: zone.js spawnNpc() (spawnVillagers·canadia와 동일). 제거: canadia 검증 패턴
// (players/npcs delete + player_left broadcast — zone.js 5828행).
// =============================================================================
function spawnOneNpc(vil) {
  const houses = vil.housesPx.length ? vil.housesPx : [{ x: vil.ccx * SZ + SZ / 2, y: vil.ccy * SZ + SZ / 2 }];
  const home = houses[vil.npcPids.length % houses.length];
  const cxPx = vil.ccx * SZ + SZ / 2, cyPx = vil.ccy * SZ + SZ / 2;
  const p = state.deps.spawnNpc({
    x: home.x + (Math.random() - 0.5) * 60,
    y: home.y + (Math.random() - 0.5) * 60,
    villageId: `simvil_${vil.dbId}`,
    villageName: vil.name,
    npcHomeX: home.x, npcHomeY: home.y,
    npcWorkX: cxPx + (Math.random() - 0.5) * 200,
    npcWorkY: cyPx + (Math.random() - 0.5) * 200,
    // npcJob 의도적 미지정(null): zone.js tallyVillageJobs(4415행)가 npcJob 있는 NPC를
    //   legacy 마을 생산(60s 틱 → central 길드 금고)에 합산한다. econ 마을의 생산은
    //   economy-sim(storage)이 진실이므로 이중 계상 + 기존 50마을 금고 교란을 피한다
    //   (가드레일 #1: 기존 NPC 경제 불변). econ 직업의 시각화 연결은 Stage 4에서.
    skipHouse: true, // 집은 village_buildings(레이아웃)가 진실 — NPC별 5×5 자동집 금지
  });
  p.simVillageId = vil.dbId; // NPC↔마을 연결(메모리 — players 컬럼 추가보다 저침습)
  vil.npcPids.push(p.pid);
  return p;
}
function removeOneNpc(vil) {
  const { players, npcs, broadcast } = state.deps;
  while (vil.npcPids.length) {
    const pid = vil.npcPids.pop(); // 가장 최근 스폰부터 (완만 감소)
    if (!players.has(pid)) continue; // stale(핸드오프 등) — 스킵
    players.delete(pid);
    npcs.delete(pid);
    broadcast({ type: 'player_left', pid });
    return true;
  }
  return false;
}
function syncVillagePop(vil, maxDelta) {
  vil.npcPids = vil.npcPids.filter(pid => state.deps.players.has(pid)); // stale 청소
  const target = Math.min(vil.econ.npcs.length, NPC_CAP_PER_VILLAGE);
  let delta = target - vil.npcPids.length;
  if (delta > 0) for (let i = 0; i < Math.min(delta, maxDelta); i++) spawnOneNpc(vil);
  else if (delta < 0) for (let i = 0; i < Math.min(-delta, maxDelta); i++) removeOneNpc(vil);
}

// =============================================================================
// Stage 2 — 시딩 (villages 테이블 비었을 때 1회, 트랜잭션 원자성으로 idempotent)
// =============================================================================
function seedVillages(db, terrain, ta, ZONE) {
  const hard = terrain.getZoneVillages(state.zoneId) || [];
  if (!hard.length) { console.log(`[${state.zoneId}] 🏘️ 시딩 스킵 — 하드코딩 마을 없음`); return []; }
  const picked = pickSeedVillages(hard);
  console.log(`[${state.zoneId}] 🏘️ 마을 시딩 시작 — 후보 ${hard.length} → 선별 ${picked.length} (VILLAGE_MAX=${VILLAGE_MAX})`);
  const rows = [];
  const VillageLayout = require('./village-layout');
  db.db.exec('BEGIN');
  try {
    for (const hv of picked) {
      const t0 = Date.now();
      const rawC = { ccx: Math.round(hv.x / SZ), ccy: Math.round(hv.y / SZ) };
      const c = findOpenCenter(ta, rawC.ccx, rawC.ccy);
      if (!c) { console.warn(`[${state.zoneId}] 🏘️ [${hv.name}] 중심 (${hv.x},${hv.y}) 주변 24셀 내 뭍 없음 — 스킵`); continue; }
      // 레이아웃 먼저(영토 → land params의 size/arable 실측), 이어서 params (랩 setupVillage와 같은 순서)
      let layout;
      try {
        layout = VillageLayout.generate(ta, c.ccx, c.ccy, INITIAL_POP, {});
      } catch (e) {
        console.warn(`[${state.zoneId}] 🏘️ [${hv.name}] generate 실패 — 스킵:`, e.message);
        continue;
      }
      const lp = extractLandParamsApprox(ta, c.ccx, c.ccy, layout);
      const dbId = db.insertVillage({
        zone: state.zoneId, name: hv.name, cx: c.ccx, cy: c.ccy,
        population: 0, econ_state: null, day: 0, // econ은 아래 init 본문에서 생성 후 update
      });
      db.insertVillageBuilding({
        village_id: dbId, type: 'hall', cx: c.ccx, cy: c.ccy, floors: 1,
        data: JSON.stringify({ typeLabel: layout.type, dock: layout.dock || null, land: lp, seedType: hv.type }),
      });
      for (const h of layout.houses) db.insertVillageBuilding({ village_id: dbId, type: 'house', cx: h.cx, cy: h.cy, floors: h.floors || 1, data: null });
      for (const f of layout.farmland) db.insertVillageBuilding({ village_id: dbId, type: 'farmland', cx: f.cx, cy: f.cy, floors: 0, data: null });
      for (const f of (layout.dryfield || [])) db.insertVillageBuilding({ village_id: dbId, type: 'dryfield', cx: f.cx, cy: f.cy, floors: 0, data: null });
      rows.push({ dbId, name: hv.name, ccx: c.ccx, ccy: c.ccy, landParams: lp, layout });
      console.log(`[${state.zoneId}] 🏘️ [${hv.name}] 시딩: 중심 셀(${c.ccx},${c.ccy}) 집 ${layout.houses.length} 논 ${layout.farmland.length} 밭 ${(layout.dryfield || []).length} 영토 ${layout.territory.length}셀 land(F${lp.fertility}/W${lp.water}/S${lp.stone}/O${lp.ore}/우드${lp.wood}) ${Date.now() - t0}ms`);
    }
    db.db.exec('COMMIT');
  } catch (e) {
    try { db.db.exec('ROLLBACK'); } catch {}
    throw e; // 원자성: 실패 시 0행 → 다음 부팅에서 재시도
  }
  return rows;
}

// =============================================================================
// init — zone.js 부팅 시 1회 (spawnVillagers 직후 훅). 실패해도 존 부팅은 계속(try/catch).
// =============================================================================
function init(deps) {
  if (!ENABLED) return; // 플래그 off — 완전 no-op (sim/* require도 안 함)
  try {
    const ZONE_ID = process.env.ZONE_ID || 'hanbando';
    if (ZONE_ID !== 'hanbando') return; // §4-4: 1차 이식은 hanbando 존만 (일반화는 Stage 4+)
    state.zoneId = ZONE_ID;
    state.deps = deps;

    const { ZONES, WORLD } = require('./zone-config');
    const ZONE = ZONES[ZONE_ID];
    if (!ZONE) return;
    state.dayMs = parseInt(process.env.VILLAGE_DAY_MS || '', 10) || WORLD.dayLengthMs; // VILLAGE_DAY_MS는 테스트 전용
    state.epoch = WORLD.worldEpoch || 0;

    const db = require('./zone-local-db'); // zone.js와 같은 싱글턴 (require 캐시)
    const terrain = require('./terrain');
    state.db = db;
    const ta = makeTerrainAdapter(terrain, ZONE, deps);

    // --- Stage 2: 시딩 (idempotent — villages 비었을 때만) ---
    let dbRows = db.getVillagesByZone(ZONE_ID);
    let seeded = null;
    if (dbRows.length === 0) {
      seeded = seedVillages(db, terrain, ta, ZONE);
      dbRows = db.getVillagesByZone(ZONE_ID);
    }
    if (dbRows.length === 0) { console.log(`[${ZONE_ID}] 🏘️ 마을 0 — 시뮬 비활성`); return; }

    // --- Stage 3: econ 모듈 + world 조립 (마을실험실 4799·4803행과 동일 배선) ---
    const econ = require('../sim/economy-sim');       // v1: createVillage/tickVillage/RESOURCES
    const econV2 = require('../sim/economy-sim-v2');  // v2: createWorldV2/tickWorldV2 (priceFn 주입)
    state.econ = econ; state.econV2 = econV2;
    const world = econV2.createWorldV2({
      seed: ZONE.villageSeed || 1020,
      villageCount: dbRows.length,          // 슬롯만 확보 — 아래서 전부 실지형 마을로 교체
      picker: 'rational', infoRange: 5000, raidPer100: 0.005, // 랩과 동일 옵션
    });
    world.villages = [];
    world.events = [];
    let maxDay = 0;

    const seededById = new Map((seeded || []).map(r => [r.dbId, r]));
    for (const row of dbRows) {
      let ev;
      if (row.econ_state) {
        ev = restoreEcon(row.econ_state, econ); // 재부팅 복원 — 인구·창고·숙련 연속
      } else {
        const sd = seededById.get(row.id);
        const lp = sd ? sd.landParams : extractLandParamsApprox(ta, row.cx, row.cy, { territory: [] });
        ev = econ.createVillage({ ...lp, initialPop: INITIAL_POP, name: row.name });
      }
      ev._world = world;
      // econ 좌표 = 셀×2.5 — 랩(4804행)과 동일 스케일: villageDist·운반비·약탈 확률이 랩 검증 범위에 머묾
      ev.coord = { x: row.cx * 2.5, y: row.cy * 2.5 };
      world.villages.push(ev);
      maxDay = Math.max(maxDay, row.day | 0);

      // NPC 집 위치 — village_buildings의 house 셀(복원 시에도 동일 소스)
      const housesPx = db.getVillageBuildings(row.id)
        .filter(b => b.type === 'house')
        .map(b => ({ x: b.cx * SZ + SZ / 2, y: b.cy * SZ + SZ / 2 }));
      state.villages.push({ dbId: row.id, name: row.name, ccx: row.cx, ccy: row.cy, housesPx, econ: ev, npcPids: [] });
    }
    world.day = maxDay;
    state.world = world;

    // 신규 시딩분의 econ_state 최초 저장 (트랜잭션 밖 — 시딩 자체는 이미 원자적)
    for (const vil of state.villages) {
      const row = dbRows.find(r => r.id === vil.dbId);
      if (row && !row.econ_state) db.updateVillageState(vil.dbId, serializeEcon(vil.econ), vil.econ.npcs.length, world.day);
    }

    // --- Stage 2: NPC 스폰 (부팅은 목표치까지 한 번에 — 클라 접속 전) ---
    let npcTotal = 0;
    for (const vil of state.villages) {
      syncVillagePop(vil, Infinity);
      npcTotal += vil.npcPids.length;
    }

    state.lastGameDay = gameDayOf(Date.now()); // 다음 경계부터 틱 (재기동 따라잡기 없음 — 실시간 앵커)
    state.ready = true;
    console.log(`[${ZONE_ID}] 🏘️ 마을 시뮬 준비: 마을 ${state.villages.length}, econ 인구 ${world.villages.reduce((s, v) => s + v.npcs.length, 0)}, 스폰 NPC ${npcTotal}, econ day ${world.day}, 게임일 ${state.dayMs / 1000}s${process.env.VILLAGE_DAY_MS ? ' (VILLAGE_DAY_MS 테스트 오버라이드)' : ''}`);
  } catch (e) {
    state.ready = false;
    console.error(`[${state.zoneId || 'zone'}] 🏘️ 마을 시뮬 init 실패 (존 부팅은 계속):`, e.message, e.stack);
  }
}

// =============================================================================
// onGameTick — gameLoop(30Hz)에서 매 틱 호출되는 훅. 게임일 경계에서만 일함.
// 평시 비용: ready/정수 비교 O(1). 경계 갭>1(서버 슬립)이어도 1틱만 — 실시간 앵커.
// =============================================================================
function onGameTick(now) {
  if (!state.ready) return; // 플래그 off·비대상 존·init 실패 전부 여기서 차단
  const day = gameDayOf(now);
  if (day <= state.lastGameDay) return;
  state.lastGameDay = day;
  try {
    const t0 = Date.now();
    // econ 1일 틱 — tickWorldV2 내부 로그(캐러밴·회복 등)는 침묵시키고 아래 요약 1줄만.
    //   (헤드리스 하네스 regression-check 126행과 같은 검증된 패턴)
    const _log = console.log;
    console.log = () => {};
    try { state.econV2.tickWorldV2(state.world); } finally { console.log = _log; }
    let econPop = 0, npcCount = 0;
    for (const vil of state.villages) {
      econPop += vil.econ.npcs.length;
      state.db.updateVillageState(vil.dbId, serializeEcon(vil.econ), vil.econ.npcs.length, state.world.day);
      syncVillagePop(vil, POP_SYNC_PER_DAY); // 완만 반영: ±POP_SYNC_PER_DAY/일
      npcCount += vil.npcPids.length;
    }
    console.log(`[${state.zoneId}] 🏘️ 마을 econ day ${state.world.day}: 인구 ${econPop} · 스폰 NPC ${npcCount} · 저장 ${state.villages.length}행 · ${Date.now() - t0}ms`);
  } catch (e) {
    console.error(`[${state.zoneId}] 🏘️ 마을 econ 틱 실패 (다음 경계에 재시도):`, e.message);
  }
}

module.exports = { init, onGameTick };
