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
// Stage 4A (이번 단계 — 마을 실물화):
//   · 건물: 회관(9×9 2층)·집(5×5 한옥, floors 반영)을 기존 buildings 테이블(wall/floor 행,
//     owner 'npc_simvil_<dbId>')로 게임 엔티티화 — 부팅 wipe(zone.js "owner_id LIKE 'npc_%'")가
//     매 부팅 지우고 여기서 재기록(레거시 한옥과 동일 수명주기 = idempotent·OFF면 잔재 0).
//     lazy-load(materializeBuildingsInChunk)·콜라이더·cutaway 전부 기존 경로 그대로.
//   · 농지: 수만 행이라 buildings 행 폭발 금지 — 청크 활성화 때 village_buildings에서 직접
//     '비영속 시각 타일'(id 'vb<rowid>', dbId=null, sim:true)로 실물화(farmTilesInRect).
//     DB 쓰기 0, 비활성화 시 메모리 해제, 재활성화 시 재생성(id 결정적이라 클라 참조 안정).
//   · 영토: 시딩 때 layout.territory의 '경계 셀+외곽변 마스크'만 hall 행 data.bnd로 영속
//     (2850셀 전체 아님 — 대역폭·저장 절약). welcome에 1회 실림(clientVillages) →
//     클라가 반투명 경계 렌더. Stage1~3 구DB(bnd 없음)는 반경 원 근사로 폴백.
//   · 직업 시각화: econ counts 비율로 스폰 NPC에 p.simJob 배정(최대잔여법, 기존 배정 유지
//     우선) — 매 게임일 재동기 + sim_village_day 브로드캐스트. npcJob과 별도 필드라
//     tallyVillageJobs(zone.js 4419행: canadiaJob||npcJob만 집계)를 오염시키지 않음.
//   · 레거시 디듀프: isLegacyVillageClaimed(name) — zone.js spawnVillagers가 시뮬이 차지한
//     하드코딩 마을(이름 유니크 확인됨)을 스킵. ENABLE_VILLAGES=0이면 항상 false(50곳 유지).
// Stage 4B (이번 단계 — 캐러밴 실체화, §5.5b "econ이 뇌, 실체가 몸"):
//   · econ 캐러밴(tickTradeV2 → world.caravans, c.id 유니크)마다 상인 NPC 1명 스폰(기존 spawnNpc,
//     simJob 'caravan' 🐂 — npcs Set에서 빼 일반 AI 제외, 이동은 여기 30Hz 페이싱이 전담(빙의)).
//   · 경로 = 거리행렬과 동일 코스 그리드(DIST_STEP=4셀)·동일 지형 판정(ta.isBlocked)의 A*(8방·
//     코너절단 금지 — 랩 tradePath 규칙) → 마을쌍 캐시. 행렬이 유한이면 경로도 존재(같은 그리드).
//   · 동기 방식(결정): econ arriveDay/returnArriveDay가 진실(뇌) — 실체는 남은거리/남은시간
//     페이싱으로 '그 경계에 정확히 도착'(econ 수치 무영향·econ 코드 무변경). 실체가 econ을 미는
//     유일한 경우 = 차단: ① 로컬 A*(pathfind.js — 활성 청크라 벽 인지) 재경로 → 연장분만큼
//     arriveDay 지연(도착 임박 가드가 econ의 조기 도착도 차단) ② 완전 고립(재경로 3연속 실패) →
//     econ '빈손 귀환' 상태로 전이(_returningRes/_abandoned/state='inbound' — 기존 inbound 처리에
//     위임, 화물 보존)·역경로(걸어온 정점 역순 = 통행 보장) 귀환. 제3마을 재라우팅은 econ이 도착
//     시점에 이미 수행(가격 손절) — 벽 인지 전역 경로가 없는 현 단계의 정직한 분담(정밀화 인계).
//   · AOI: 활성 청크(플레이어 시야)에서만 벽 충돌 판정 + vx/vy(걷기 모션), 비활성은 경로 보간만
//     (dormant 패턴 — 보면 걸어가는 상인, 안 보면 좌표 진행). 원정 중 아사 방지(canadia 패턴 동형).
//   · 도착 연출: 1게임시간 머묾(linger) 후 귀환. 소멸(완주·killTrader) 시 NPC 회수(player_left).
//   · invalidateTradeDistances 실동: zone.js 벽류(wall/fence) 설치·철거·파괴 지점이 호출 —
//     다음 게임일 행렬 재계산 + 경로 캐시 비움. ★한계(주석 의무): 행렬·경로 그리드는 지형만 판정
//     (벽은 edge 단위 + 비활성 청크 미로드라 코스 셀 점샘플에 안 잡힘) — 벽의 경제 반영은 실체
//     충돌(위 ①②)이 담당, 벽 인지 행렬은 Stage 5 정밀화 인계.
// Stage 5 인계: invalidateTradeDistances 정밀화(다리·성벽 — 역인덱스·edge 인지), econ 직업↔NPC
//   '행동' 연결(어부가 물가로 등), 동물 AI 이식 접점(캐러밴 NPC가 늑대 어그로 대상 — hp 0이면
//   부활 후 경로 스냅 복귀만, 약탈 '연출'과 econ 약탈 주사위 결합은 도적 시스템에서), 최적화.
//
// 테스트 훅(추가 — 운영 무설정): VILLAGE_CARAVAN_MAX(실체 상한, 기본 60 — 초과분은 econ만 진행),
//   VILLAGE_CARAVAN_BLOCKTEST(1=가상 장애물 1회 → 재경로 로그, 2=강제 고립 1회 → 화물보존 귀환;
//   둘 다 invalidate 호출로 행렬 재계산 로그까지 확인).
// =============================================================================
'use strict';

const ENABLED = process.env.ENABLE_VILLAGES !== '0'; // 기본 켜짐. '0'만 완전 no-op.

const SZ = 32; // 셀 크기(px) — zone.js BUILDING_SIZE(436행)·zone-config 셀과 동일
const INITIAL_POP = 8; // econ createVillage 초기 인구 기본값(economy-sim.js 697행)과 일치
const VILLAGE_MAX = Math.max(1, parseInt(process.env.VILLAGE_MAX || '20', 10));   // ★기본 20(사용자 밀도 캐논 §2.4·§3b: 한반도 존 마을 12~20 — 10은 1착륙 보수값이었음). 성능 확정은 Stage 5 실측
const NPC_CAP_PER_VILLAGE = Math.max(1, parseInt(process.env.VILLAGE_NPC_CAP || '40', 10));
const POP_SYNC_PER_DAY = 2; // 인구 반영은 완만: 게임일당 마을당 ±2명까지 (증가=스폰, 감소=최근 NPC부터)
const MIN_SPACING_PX = 12000; // 마을 간 최소 간격 — pickSeedVillages 주석 참조

// --- Stage 4B: 캐러밴 실체화 상수 ---
const PX_PER_ECON = SZ / 2.5;   // econ 좌표(셀×2.5) 1단위 = 12.8px — c.distance↔픽셀 환산(init의 ev.coord 스케일과 동일)
const CARAVAN_BODY_MAX = Math.max(0, parseInt(process.env.VILLAGE_CARAVAN_MAX || '60', 10)); // 실체 상한 — 초과분은 econ만(canadia '상인 없으면 시각 생략' 선례)
const CARAVAN_LINGER_DAY_FRAC = parseFloat(process.env.VILLAGE_LINGER_FRAC || '') || 1 / 24;      // 도착 후 머묾 = 1게임시간 (VILLAGE_LINGER_FRAC는 **테스트 전용** — VILLAGE_DAY_MS 관례와 동형, 미설정 시 운영값 불변)
let PathCore = null;   // ★[경로 통일 2026-07-17] sim/path-core.js 정본(랩·서버 공용) — 첫 교역로 계산 때 lazy require(sim/* 로드 규약 준수)
const CARAVAN_REPAIR_COOLDOWN_MS = 2000;     // 로컬 재경로 최소 간격(NPC A* 2초 간격 규칙과 동일)
const CARAVAN_REPAIR_LOOKAHEAD_PX = 480;     // 차단 시 우회 목표 = 전방 480px(15셀) 경로 정점
const CARAVAN_ISOLATE_FAILS = 3;             // 재경로 연속 실패 → 완전 고립 판정(§5.5b 2단계)
const CARAVAN_BLOCKTEST = parseInt(process.env.VILLAGE_CARAVAN_BLOCKTEST || '0', 10); // 테스트 전용(헤더 주석)

// --- P2: LOD 결판(근처만 실체화) 상수 ---
//   한 전쟁=정확히 1경로(physical XOR headless). eta 도달 시 방어 마을권에 사람 player(관측자)가 AOI 안이면
//   battle-core 실체 전투(server/war-live 실시간 30Hz 스텝) → econ 되먹임 1회. 아니면 기존 headless(war.daily).
const WAR_LOD_VIEW_PX = Math.max(1, parseInt(process.env.VILLAGE_WAR_VIEW_PX || '', 10) || 800);   // 관측자 근접 반경(px) — zone.js AOI_RADIUS(800) 정합. 테스트 오버라이드.

// --- P3: 실체 전쟁(집결→행군→전투→궤주) 상수 ---
//   한 전쟁=정확히 1경로(physical XOR headless). 관측자 근접 시 지휘관 econ 페이싱(캐러밴 dormant 동형)·전 병사 pid 인스턴스화·
//   접근(WAR_ENGAGE_R) 교전·battle-core 실시간 스텝·전투유닛→pid 미러·궤주 도보 귀환. 무관측자=기존 headless(daily).
const WAR_BODY_MAX = Math.max(0, parseInt(process.env.VILLAGE_WAR_BODY_MAX || '32', 10)); // 동시 실체 행군/전투 상한(초과분은 headless 폴백 — LiveBattle LB_MAX_BATTLES 와 별개, 행군 포함)
const WAR_BC_MS = 500;                     // war_battle 집계 broadcast throttle(2Hz + phase 전이)
const SZ2 = 32;                            // 셀→px 스케일(SZ 별칭 — 전쟁 좌표 변환 가독)

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
  // Stage 4B — 캐러밴 실체화
  caravanBodies: null, // Map<caravanId, body> — body = { pid, c(econ 캐러밴 ref), phase, pts, cum, len, prog, ... }
  routeCache: null,    // Map<'aDbId_bDbId', pts|null> — 마을쌍 경로 캐시(랩 _tradePaths 동형). invalidate가 비움.
  pathfind: null,      // require('./pathfind') — init lazy(플래그 off면 로드 없음)
  _route: null,        // 코스 그리드 A* 스크래치(ensureRouteGrid)
  // P2 — LOD 결판(실체 전투)
  war: null,           // war-core createWar() 인스턴스(econ 전쟁 층)
  warLive: null,       // war-live createWarLive() 인스턴스(실체 전투 상태머신 — 관측자 근접 시 physical 경로)
  _warTickAt: 0,       // war-live 실dt 스텝 앵커(30Hz)
  warBodies: null,     // P3: Map<w.id, wbody> — 실체 행군/전투/귀환 몸(캐러밴 body 동형). pid 병사·대형·econ 페이싱 소유.
  _warThreatBuf: null, // P3: warThreats() 재사용 버퍼(야생 agrid 주입 — GC 최소)
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
    if (!deps.isTerrainBlockedLocal(x, y)) return false; // 물+바위+해안 water tiles (zone.js 305행)
    // ★[경로 통일 규칙 2026-07-17] 물 = 차단 + 다리 칸만 통행(다리는 맵에 만들어두는 사물 — 사용자 확정).
    //   차단 사유가 '물'이고 그 칸이 다리면 통행 — 바위는 다리로 못 덮음. deps.isBridgeLocal은 다리 층이
    //   생기면 zone.js가 주입(현재 미주입=기존과 완전 동일 동작). 교역로·거리행렬·레이아웃이 전부 이 훅 하나를 공유.
    if (deps.isBridgeLocal && deps.isWaterTileLocal(x, y) && deps.isBridgeLocal(x, y)) return false;
    return true;
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
  // ★[11차 · 재민 확정] 셀 단위 비옥도 — 지형에서 유도한다.
  //   그동안 fert 는 **상수 0.5**였다. 그래서 generate() 의 영토 확장 tiebreak(fertW=0.35)가
  //   통째로 중립화되고 거리항(distW)만 남아, 영토가 지형과 무관하게 **동그란 블롭**으로 퍼졌다.
  //   "농촌이 강에서 멀어도 되나"라는 물음의 뿌리도 여기다 — 땅의 좋고 나쁨이 지도에 없었다.
  //
  //   공식(청동기 취락 입지 고증 — 하천 충적지·구릉 사면):
  //     fert = 0.12                       기본(척박한 땅도 0은 아니다)
  //          + 0.62 · exp(-dw/28)         **충적·관개**: 물가가 최고, 28셀에서 1/e로 감쇠
  //          + 0.18 · min(1, dr/12)       **산사면 배제**: 바위에서 12셀 넘게 떨어져야 만점
  //          + 0.08 · (숲이면)            부식질 소폭(개간 비용은 별개 계산)
  //   dw·dr 은 정확 유클리드 EDT(村 박스 2패스) — 링 스캔이 아니라 O(면적)이라 싸다.
  //   범위 밖은 0.5(중립)로 떨어뜨려 예전 동작으로 안전하게 회귀한다.
  //   ★[11차] 수식과 장(場) 구성은 server/fertility.js 로 옮겼다 — 셀 지도(build-cell-map.js)가
  //   같은 함수를 써야 게임과 지도가 같은 땅을 보여 준다. 여기 있던 사본은 지웠다.
  let _FF = null;   // { at(x,y) }
  const prepareFert = (ccx, ccy, R) => {
    const VL = require('./village-layout');
    if (!VL.maskEDT) { _FF = null; return; }
    const FERT = require('./fertility');
    _FF = FERT.buildField({
      isWater, isRock, isWoody: (x, y) => forestMult(x, y) > 1.2, maskEDT: VL.maskEDT,
    }, ccx - R, ccy - R, ccx + R, ccy + R);
  };
  const fert = (cx, cy) => (_FF ? _FF.at(cx, cy) : 0.5);
  // 고도 프록시 — 물에서 멀수록 높음(배산임수 축 판정용). axisAt이 ±1셀 4회만 호출해 링 스캔 비용 OK.
  const elev = (cx, cy) => Math.min(1, nearestWaterDist(cx, cy, 45) / 45);
  // ★다리 셀 술어(셀 좌표) — 교역 거리행렬의 코스 그리드가 폭 2셀 다리를 놓치지 않게 하는 용도.
  //   zone.js 가 isBridgeLocal(픽셀)을 주입하지 않으면 항상 false = 기존 동작 그대로.
  const isBridgeCell = (cx, cy) => {
    if (!deps.isBridgeLocal) return false;
    try { return !!deps.isBridgeLocal(px(cx), px(cy)); } catch { return false; }
  };
  return { isBlocked, isWater, isRock, isBridgeCell, forestMult, fert, elev, nearestWaterDist, prepareFert, fertField: () => _FF };
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
      if (dx * dx + dy * dy > R * R) continue;
      n++;   // ★면적 자원 스캔 가중은 A/B로 기각(랩 시드3 인구 -15% — 배산임수상 산·숲이 중립점 밖이라 전 마을 일괄 너프). 거리 차등은 물(최근접 140 감쇠)만
      const cx = ccx + dx, cy = ccy + dy;
      if (ta.isRock(cx, cy)) rock++;
      else if (ta.forestMult(cx, cy) > 1.2) forest++;
    }
  }
  const rockD = n ? rock / n : 0, forD = n ? forest / n : 0;
  const nd = ta.nearestWaterDist(ccx, ccy, 140);   // ★탐색 45→140(랩 자원권 R과 통일 — 100m 강도 어장권)
  const water = Math.max(0.05, Math.min(1, 1 - nd / 140));   // ★리카도 선형 감쇠: 물가 1.0 → 100m 0.29 → 140m+ 바닥 — '멀리 강 있는 마을은 어부를 뽑되 적게'
  let tw = 0;
  const tn = (layout.territory && layout.territory.length) || 0;
  if (tn) for (const c of layout.territory) if (ta.isWater(c[0], c[1])) tw++;
  // ★[11차] 셀 비옥도가 생겼으므로 마을 비옥도는 **영토 실측 평균**이다(프록시 폐기).
  //   보정 ×1.4 는 옛 프록시 눈금에 맞춘 것 — 강변 마을 평균 ~0.9 → 1.26, 마른 마을 ~0.33 → 0.46 로
  //   econ 밸런스가 이어진다(옛 값 범위 0.45~1.29와 같은 자리). 필드가 없으면 옛 프록시로 회귀.
  let fertility;
  if (ta.fert && ta.fertField && ta.fertField() && tn) {
    let fs = 0;
    for (const c2 of layout.territory) fs += ta.fert(c2[0], c2[1]);
    fertility = clamp(+((fs / tn) * 1.4).toFixed(2), 0.1, 2.0);
  } else {
    fertility = clamp(+(0.4 + water * 0.9 - rockD * 1.5).toFixed(2), 0.1, 2.0); // 옛 근사(필드 없을 때)
  }
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
// ★[사용자 스샷 — NPC 떼겹침] 1인 1자리(움집 앞마당 2×3, 침대 6=BEDO와 같은 사상): 종전엔 한 집 식구
//   전원이 npcHome으로 '같은 px 한 점'을 받아 야간 귀가·대피 때 한 덩어리로 포개졌다. 자리 셀은 전부
//   부지 원(r6.5) 안 마당 — 집채([-5..0]×[-5..-2]) 남쪽 바깥·텃밭([+1..+4]²) 밖·문(cx-3·-2) 앞 개활지.
//   침상(집 내부) 진입은 벽 콜라이더·경로 스무딩 묶음(백로그 — 생활 층)에서, 여기선 실체 자리만 분산.
const HOME_SLOTS = [[-4, -1], [-2, -1], [0, -1], [-5, 0], [-3, 0], [-1, 0]];
// ★[침대 진입 — 사용자 "취침을 밖에서 하고 있는데"] 실내 침대 6자리 = 클라 BEDO 렌더 정본 verbatim(집 앵커 상대 셀).
//   HOME_SLOTS(마당)는 휴식·대피·낮 대기 자리로 유지, 취침·요양만 침대 — 문(남벽 개구)으로 실제 출입(주민 A*가
//   벽 변 인지+스무딩이라 가능해짐 — 종전엔 경로가 벽을 몰라 실내 좌표를 주면 영원히 벽에 비볐다).
const BED_SLOTS = [[-4, -4], [-3, -4], [-2, -4], [-1, -4], [-4, -3], [-1, -3]];
function spawnOneNpc(vil) {
  const houses = vil.housesPx.length ? vil.housesPx : [{ x: vil.ccx * SZ + SZ / 2, y: (vil.ccy + 6) * SZ + SZ / 2 }];   // ★폴백도 큰집 벽 안(중심 셀) 금지 — 남문 앞 마당
  const home = houses[vil.npcPids.length % houses.length];
  const slotI = Math.floor(vil.npcPids.length / houses.length) % HOME_SLOTS.length;
  const slot = HOME_SLOTS[slotI];
  const hx = home.x + slot[0] * SZ, hy = home.y + slot[1] * SZ;
  const bed = BED_SLOTS[slotI];   // ★[침대 진입 — 사용자 "취침을 밖에서"] 실내 침대 1인 1자리(클라 BEDO 렌더 정본과 동일 좌표)
  const cxPx = vil.ccx * SZ + SZ / 2, cyPx = vil.ccy * SZ + SZ / 2;
  // Stage 4A: 작업 지점을 회관 밖 도넛(180~320px)으로 — 회관 9×9(반폭 144px+벽)이 실물화되어
  //   내부 좌표를 주면 NPC가 벽에 영원히 비비게 됨(레거시엔 중앙 건물이 없어 ±200 균일이 무해했음).
  const wAng = Math.random() * Math.PI * 2, wR = 180 + Math.random() * 140;
  const p = state.deps.spawnNpc({
    x: hx + (Math.random() - 0.5) * 60,
    y: hy + (Math.random() - 0.5) * 60,
    villageId: `simvil_${vil.dbId}`,
    villageName: vil.name,
    npcHomeX: hx, npcHomeY: hy,
    npcWorkX: cxPx + Math.cos(wAng) * wR,
    npcWorkY: cyPx + Math.sin(wAng) * wR,
    // npcJob 의도적 미지정(null): zone.js tallyVillageJobs(4415행)가 npcJob 있는 NPC를
    //   legacy 마을 생산(60s 틱 → central 길드 금고)에 합산한다. econ 마을의 생산은
    //   economy-sim(storage)이 진실이므로 이중 계상 + 기존 50마을 금고 교란을 피한다
    //   (가드레일 #1: 기존 NPC 경제 불변). econ 직업의 시각화 연결은 Stage 4에서.
    skipHouse: true, // 집은 village_buildings(레이아웃)가 진실 — NPC별 5×5 자동집 금지
  });
  p.simVillageId = vil.dbId; // NPC↔마을 연결(메모리 — players 컬럼 추가보다 저침습)
  p.simLonOff = vil._lonOff || 0; // §19 경도: 이 마을 로컬 태양시(zone.js npcStep 야간 귀가 게이트가 소비)
  p.npcBedX = home.x + bed[0] * SZ; p.npcBedY = home.y + bed[1] * SZ;   // ★침대(실내) — 취침·요양 목표(_lifeGoHome·§19 게이트 소비)
  vil.npcPids.push(p.pid);
  return p;
}
function removeOneNpc(vil) {
  const { players, npcs, broadcast } = state.deps;
  // 가장 최근 스폰부터(완만 감소). ★[P3 삼중 코히런스] 출정(징발·_muster) 중 병사는 인구감소 대상에서 제외 —
  //   캐러밴(simCaravan) 동형: 전쟁 실체가 소유한 pid는 syncVillagePop이 안 건드림(사상 despawn은 _warOnResolved가
  //   샘플 타겟, 생존은 귀환 그룹이 해제). war 종결 후 syncVillagePop이 econ 진실로 재수렴.
  for (let i = vil.npcPids.length - 1; i >= 0; i--) {
    const pid = vil.npcPids[i];
    if (!players.has(pid)) { vil.npcPids.splice(i, 1); continue; } // stale(핸드오프 등) 청소
    const p = players.get(pid);
    if (p && p._muster) continue; // ★출정 병사 보호(위 주석)
    vil.npcPids.splice(i, 1);
    players.delete(pid);
    npcs.delete(pid);
    broadcast({ type: 'player_left', pid });
    return true;
  }
  return false;
}
function syncVillagePop(vil, maxDelta) {
  // stale 청소 — ★_muster(출정 중) pid는 players 에 남아 있어 필터 통과(제외 안 됨). 감소(removeOneNpc)도 _muster 스킵.
  //   목표 인구는 econ.npcs.length(진실) 추종: 출정 병사도 npcPids 에 남아 카운트되므로 전쟁 중 스폰 폭주 없음.
  vil.npcPids = vil.npcPids.filter(pid => state.deps.players.has(pid));
  const target = Math.min(vil.econ.npcs.length, NPC_CAP_PER_VILLAGE);
  let delta = target - vil.npcPids.length;
  if (delta > 0) for (let i = 0; i < Math.min(delta, maxDelta); i++) spawnOneNpc(vil);
  else if (delta < 0) for (let i = 0; i < Math.min(-delta, maxDelta); i++) { if (!removeOneNpc(vil)) break; } // 남은 게 전부 _muster면 중단(reconverge는 종전 후)
}

// =============================================================================
// Stage 4A — NPC 직업 시각화: econ 직업 분포(counts) 비율 → 스폰 NPC p.simJob 배정.
//   · 최대잔여법으로 스폰 수 n에 스케일(합=n 보장) + 기존 배정 유지 우선(교체 최소 — 깜빡임 방지).
//   · p.simJob은 npcJob과 별도 필드: tallyVillageJobs(zone.js 4419행)는 canadiaJob||npcJob만
//     집계하므로 legacy 생산(60s 금고 틱)에 절대 안 섞임(이중 계상 가드 유지).
//   · changedOut(pid→job)에 변경분 축적 — 호출부가 게임일 1회 sim_village_day로 브로드캐스트.
// =============================================================================
function syncVillageJobs(vil, changedOut) {
  const players = state.deps.players;
  const pids = vil.npcPids.filter(pid => players.has(pid));
  const n = pids.length;
  if (!n) return;
  const counts = vil.econ.counts || {};
  const jobs = Object.keys(counts).filter(j => (counts[j] | 0) > 0);
  let total = 0; for (const j of jobs) total += counts[j];
  if (!total) return;
  // 목표 분포 — 최대잔여법 (floor 합 + 잔여 큰 순으로 +1)
  const target = {}; const rem = []; let used = 0;
  for (const j of jobs) {
    const exact = counts[j] / total * n;
    const fl = Math.floor(exact);
    target[j] = fl; used += fl;
    rem.push([j, exact - fl]);
  }
  rem.sort((a, b) => b[1] - a[1]);
  for (let i = 0; used < n && rem.length; i = (i + 1) % rem.length, used++) target[rem[i][0]]++;
  // 기존 배정 유지 우선 → 초과·무배정만 결원 직업으로
  const deficit = { ...target };
  const unassigned = [];
  for (const pid of pids) {
    const p = players.get(pid);
    if (p.simJob && deficit[p.simJob] > 0) deficit[p.simJob]--;
    else unassigned.push(p);
  }
  for (const p of unassigned) {
    let pick = null;
    for (const j of jobs) if (deficit[j] > 0) { pick = j; deficit[j]--; break; }
    if (pick && p.simJob !== pick) {
      p.simJob = pick;
      if (changedOut) changedOut[p.pid] = pick;
    }
  }
}

// =============================================================================
// Stage 4A — 건물 실물화 ①: 회관·집 → 기존 buildings 테이블(wall/floor 행).
//   · owner 'npc_simvil_<dbId>' — zone.js 부팅 wipe("owner_id LIKE 'npc_%'", ~1001행)가 매 부팅
//     지우므로 여기서 재기록 = idempotent·중복 0·ENABLE_VILLAGES=0 다음 부팅이면 잔재 0.
//   · village_id 컬럼(Stage 4A 신설, nullable)에 마을 id 기록 — Stage 4B(캐러밴·무효화 정밀화)
//     의 마을 단위 조회용. 레거시·플레이어 행은 전부 NULL 유지.
//   · 부팅 시 DB에만 기록(레거시 buildVillageHouse와 동일) — 메모리 객체화는 청크 활성화 때
//     materializeBuildingsInChunk가 'b<dbId>'로 수행(콜라이더·AOI·cutaway 기존 경로).
//   · ★실체화 동기(랩 정본): 큰집 = 8×8 단층(남벽 2칸 문), 움집 = 6×4 단층([cx-5..cx+0]×[cy-5..cy-2], 남벽 2칸 문), 곳간 = 5×3 밀폐. 구 9×9 회관·5×5 한옥 폐지.
// =============================================================================
function buildStructure(db, vilDbId, ccx, ccy, half, floors, ownerId, ownerName, doorHalf) {
  let rows = 0;
  const wall = (cx, cy, side, f) => { db.insertBuilding({ type: 'wall', owner_id: ownerId, owner_name: ownerName, x: cx * SZ, y: cy * SZ, data: JSON.stringify({ side, floor: f }), village_id: vilDbId }); rows++; };
  const floor = (cx, cy, f) => { db.insertBuilding({ type: 'floor', owner_id: ownerId, owner_name: ownerName, x: cx * SZ + SZ / 2, y: cy * SZ + SZ / 2, data: JSON.stringify({ floor: f }), village_id: vilDbId }); rows++; };
  for (let f = 0; f < floors; f++) {
    for (let i = -half; i <= half; i++) {
      wall(ccx + i, ccy - half, 'N', f);                                       // 북변
      if (!(f === 0 && Math.abs(i) <= doorHalf)) wall(ccx + i, ccy + half + 1, 'N', f); // 남변(1층 출입구)
    }
    for (let j = -half; j <= half; j++) { wall(ccx + half, ccy + j, 'E', f); wall(ccx - half - 1, ccy + j, 'E', f); } // 동·서변
    for (let i = -half; i <= half; i++) for (let j = -half; j <= half; j++) floor(ccx + i, ccy + j, f);
  }
  return rows;
}
// ★[실체화 동기 — 랩 정본, 사용자 확정] 짝수변 직사각 건물(변 좌표계 [x0..x1]×[y0..y1], 단층):
//   벽 변 규약은 buildStructure와 동일(N=자기 셀 북변 — 남변은 아래 셀의 N, E=자기 셀 동변 — 서변은 왼 셀의 E).
//   doorXs = 남변에서 벽을 뺄 x 목록(문). null이면 밀폐(곳간 — 고상 사다리 출입 고증).
function buildStructureRect(db, vilDbId, x0, y0, x1, y1, ownerId, ownerName, doorXs, tag) {
  let rows = 0;
  const doorSet = new Set(doorXs || []);
  const wall = (cx, cy, side) => { db.insertBuilding({ type: 'wall', owner_id: ownerId, owner_name: ownerName, x: cx * SZ, y: cy * SZ, data: JSON.stringify(Object.assign({ side, floor: 0 }, tag || {})), village_id: vilDbId }); rows++; };
  const floor = (cx, cy) => { db.insertBuilding({ type: 'floor', owner_id: ownerId, owner_name: ownerName, x: cx * SZ + SZ / 2, y: cy * SZ + SZ / 2, data: JSON.stringify(Object.assign({ floor: 0 }, tag || {})), village_id: vilDbId }); rows++; };
  for (let x = x0; x <= x1; x++) {
    wall(x, y0, 'N');                                        // 북변
    if (!doorSet.has(x)) wall(x, y1 + 1, 'N');               // 남변(문 칸 제외)
  }
  for (let y = y0; y <= y1; y++) { wall(x1, y, 'E'); wall(x0 - 1, y, 'E'); }  // 동·서변
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) floor(x, y);
  return rows;
}
function materializeVillageStructures(db, vil, bRows) {
  const ownerId = `npc_simvil_${vil.dbId}`;
  let rows = 0, houses = 0, grans = 0;
  // ★큰집 — 8×8([ccx-4..ccx+3]², 랩 정본과 픽셀 동일) 단층, 남벽 2칸 문(ccx-1·ccx). 구 9×9 2층 회관 폐지[실체화 동기].
  //   레이아웃 계약: 집 HALL_CLEAR=16.5·농지 hallFarmBlock r12 제외 — 큰집은 마당 원 r10 안.
  //   data.bld 태그 = 클라 실내 게이트(입실 시 남·동벽 페이드) 발자국 렉트 — 문이 개구라 방 BFS가 새는 구조의 실내 판정 정본.
  rows += buildStructureRect(db, vil.dbId, vil.ccx - 4, vil.ccy - 4, vil.ccx + 3, vil.ccy + 3, ownerId, `${vil.name} 큰집`, [vil.ccx - 1, vil.ccx], { bld: [vil.ccx - 4, vil.ccy - 4, vil.ccx + 3, vil.ccy + 3] });
  for (const b of bRows) {
    if (b.type === 'house') {
      // ★움집 6×4 = 부지 원판 안 북서 [cx-5..cx+0]×[cy-5..cy-2], 남벽 2칸 문(cx-3·cx-2) — 랩 정본 동일 오프셋. 구 5×5 한옥 폐지. 단층(고증 v2).
      //   data.hut 태그 = 클라 v3 반수혈 스킨(벽·바닥 억제+이엉 지붕 합성) 앵커 — 물리(콜라이더·문)는 태그와 무관하게 불변.
      rows += buildStructureRect(db, vil.dbId, b.cx - 5, b.cy - 5, b.cx + 0, b.cy - 2, ownerId, `${vil.name} 움집`, [b.cx - 3, b.cx - 2], { hut: [b.cx - 5, b.cy - 5, b.cx + 0, b.cy - 2] });
      houses++;
    } else if (b.type === 'phouse') {
      // ★[11차 T4] 플레이어 의뢰 집 — **실체는 마을 움집과 완전히 동일**(같은 6×4·같은 문). 다른 건 소유자와 명부뿐.
      let ow = ownerId; try { const d = JSON.parse(b.data || '{}'); if (d.owner) ow = d.owner; } catch (e) {}
      rows += buildStructureRect(db, vil.dbId, b.cx - 5, b.cy - 5, b.cx + 0, b.cy - 2, ow, '의뢰 움집', [b.cx - 3, b.cx - 2], { hut: [b.cx - 5, b.cy - 5, b.cx + 0, b.cy - 2] });
    } else if (b.type === 'granary') {
      // ★고상곳간 5×3([cx-2..cx+2]×[cy-1..cy+1]) — 문 없는 밀폐(사다리 출입 고증, 상호작용은 인접 셀). 송국리 소형 굴립주 5.3×3.2 실측.
      //   data.gran 태그[에셋 2차]: 클라가 벽·바닥 시각 억제 + 고상 통짜 스프라이트(기둥+판벽+이엉) 합성 — 콜라이더·밀폐 불변.
      rows += buildStructureRect(db, vil.dbId, b.cx - 2, b.cy - 1, b.cx + 2, b.cy + 1, ownerId, `${vil.name} 곳간`, null, { gran: [b.cx - 2, b.cy - 1, b.cx + 2, b.cy + 1] });
      grans++;
    }
  }
  return { rows, houses, grans };
}

// ★[실체화 동기] 마을 곳간 자리 — 랩 _granAdd 링 배치의 시딩 시점 포팅(결정론):
//   큰집 곁 r11~15 링(15° 스텝), 남쪽 집결부 회피(콘 베토+남측 감점), 영토 안·비차단·농지(기경+존닝) 회피·물 체비셰프 16 이격·집채/텃밭/큰집 발자국 비겹침.
//   ★런타임 증설(_lifeGranAdd) 겸용: layout.ownSet/farmSet/gran을 주면 시딩 레이아웃 객체 없이도 같은 규칙으로 자리를 고른다.
function pickGranarySpot(ta, layout) {
  const ccx = layout.center.cx, ccy = layout.center.cy;
  const own = layout.ownSet || new Set(layout.territory.map(c => c[0] + ',' + c[1]));
  let farm = layout.farmSet;
  if (!farm) {
    farm = new Set();
    for (const arr of [layout.nongZone || [], layout.farmland || [], layout.dryfield || []]) for (const c of arr) farm.add(c.cx + ',' + c.cy);
  }
  const grans = layout.gran || [];   // 기존 곳간 이격(랩 _granAdd: |dx|<=6 && |dy|<=4 금지) — 시딩(1동)엔 빈 배열이라 무영향
  const ok = (cx, cy) => {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = cx + dx, y = cy + dy;
      if (ta.isBlocked(x, y) || !own.has(x + ',' + y) || farm.has(x + ',' + y)) return false;
    }
    // ★[사용자 스샷 농촌17] 집채([-5..0]×[-5..-2])+1버퍼·텃밭([+1..+4]²)과 곳간 5×3 비겹침 —
    //   집 앵커는 r≥HALL_CLEAR(16.5)지만 집채가 회관 쪽으로 r≈10.1까지 뻗어 링 r11~15와 교차,
    //   곳간 벽·바닥이 움집과 융합되던 버그(구판은 지형·농지만 보고 건물 발자국을 안 봄).
    for (const h of layout.houses || []) {
      if (cx + 2 >= h.cx - 6 && cx - 2 <= h.cx + 1 && cy + 1 >= h.cy - 6 && cy - 1 <= h.cy - 1) return false;
      if (cx + 2 >= h.cx + 1 && cx - 2 <= h.cx + 4 && cy + 1 >= h.cy + 1 && cy - 1 <= h.cy + 4) return false;
    }
    for (const g of grans) if (Math.abs(g.cx - cx) <= 6 && Math.abs(g.cy - cy) <= 4) return false;   // ★랩 _granAdd verbatim: 곳간끼리 이격
    if (cx + 2 >= ccx - 5 && cx - 2 <= ccx + 4 && cy + 1 >= ccy - 5 && cy - 1 <= ccy + 4) return false;   // 큰집 8×8+1(링 r11이라 이론상 무접촉 — 방어)
    for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) if (ta.isWater && ta.isWater(cx + dx, cy + dy)) return false;   // 강변 논밭 벨트 비침범+건조지 고증
    return true;
  };
  let best = null, bs = 1e9;
  for (let r = 11; r <= 15; r++) for (let a = 0; a < 360; a += 15) {
    const th = a * Math.PI / 180, cx = Math.round(ccx + Math.cos(th) * r), cy = Math.round(ccy + Math.sin(th) * r);
    if (cy > ccy + 2 && Math.abs(cx - ccx) < 8) continue;   // 남쪽 문·집결 마당 정면 회피
    if (!ok(cx, cy)) continue;
    const sc = r + (cy > ccy ? 40 : 0) + (a % 90) * 0.01;
    if (sc < bs) { bs = sc; best = { cx, cy }; }
  }
  return best;
}

// =============================================================================
// Stage 4A — 건물 실물화 ②: 농지(수만 행) → 비영속 시각 타일. 청크 활성화 때 zone.js
// materializeBuildingsInChunk가 px 렉트로 호출 — village_buildings 셀 인덱스에서 직접 생성.
//   · id 'vb<rowid>' 결정적(재활성·재부팅 안정) / dbId=null·sim:true — 모든 DB 쓰기 경로는
//     'if (b.dbId)' 가드(zone.js 전수 확인) + 분해는 sim 가드로 차단(아이템 증식 루프 방지).
//   · data.dry: 1=밭(이랑) 0=논(무논) — 클라 drawBuildingIso가 sim 플래그로 정적 타일 렌더
//     (레거시 farmland의 성장/수확 라벨 경로와 분리. readyAt 없음 → 플레이어 수확 불가·무해).
// =============================================================================
function farmTilesInRect(x0, y0, x1, y1) {
  if (!state.ready) return [];
  const rows = state.db.getVillageFarmInCellRect(Math.floor(x0 / SZ), Math.ceil(x1 / SZ), Math.floor(y0 / SZ), Math.ceil(y1 / SZ));
  if (!rows.length) return [];
  const out = [];
  for (const r of rows) {
    const vil = state.byDbId && state.byDbId.get(r.village_id);
    const isFarm = (r.type === 'farmland' || r.type === 'dryfield');
    out.push({
      id: `vb${r.id}`, dbId: null, sim: true,
      type: isFarm ? 'farmland' : 'vtile',   // ★실체화 동기: yard/plaza/garden → vtile(지면 다짐 타일, data.kind로 구분)
      ownerId: `npc_simvil_${r.village_id}`,
      ownerName: vil ? `${vil.name} ${isFarm ? '경작지' : '마당'}` : '마을 땅',
      x: r.cx * SZ + SZ / 2, y: r.cy * SZ + SZ / 2,
      data: isFarm ? { sim: 1, dry: r.type === 'dryfield' ? 1 : 0 } : { sim: 1, kind: r.type },
      floor: 0,
      villageId: r.village_id,
    });
  }
  return out;
}

// =============================================================================
// Stage 4A — 클라 영토 페이로드(welcome 1회). 경계 셀만(마을당 ~200-400) — 2850셀 전체 금지.
// 읽기전용: 좌표(px)에서 가장 가까운 마을의 품질 EMA(_clothQ 등) — 플레이어 구매/판매 경계계약용.
// ★econ 무접촉·순수 읽기 — econ 틱(tickEconV2)이 아니라 zone.js 플레이어 메시지 핸들러에서만 호출되므로
//   econ 궤적/회귀(regression-check 랩 하네스)에 절대 무영향. 마을 EMA를 인스턴스 샘플로 노출만 함.
function villageQualityAt(px, py, maxDistPx) {
  if (!state.ready) return null;
  let best = null, bestD = (maxDistPx != null ? maxDistPx : Infinity);
  for (const v of state.villages) {
    if (!v.econ) continue;
    const cx = v.ccx * SZ + SZ / 2, cy = v.ccy * SZ + SZ / 2;
    const d = Math.hypot(cx - px, cy - py);
    if (d < bestD) { bestD = d; best = v; }
  }
  if (!best) return null;
  const e = best.econ || {};
  const num = x => (typeof x === 'number' ? +x.toFixed(3) : null);
  return {
    name: best.name, dist: Math.round(bestD),
    clothQ: num(e._clothQ), weapQ: num(e._weapQ), cookQ: num(e._cookQ), toolQ: num(e._toolQ), bowQ: num(e._bowQ),
    pop: (typeof e.pop === 'number' ? Math.round(e.pop) : (e.npcs ? e.npcs.length : null)),
  };
}
// bnd 없는 구DB(Stage1~3 시딩분)는 반경 원 근사(approx)로 폴백 — 과제 허용 최소 구현.
// =============================================================================
function clientVillages() {
  if (!state.ready) return null;
  return state.clientPayload || null;
}
function isLegacyVillageClaimed(name) {
  return !!(state.ready && state.claimedNames && state.claimedNames.has(name));
}

// =============================================================================
// Stage 4A — 영토 경계 추출: territory(~2850셀) 중 4방 이웃이 영토 밖인 셀만 + 외곽변 비트마스크.
// 반환 flat 배열 [dx,dy,mask, dx,dy,mask, ...] (중심 상대 셀 — JSON 소형화. mask: 1=N 2=E 4=S 8=W).
// 디스크 영토(반경 ~30셀)면 경계 ~200-400셀 → 마을당 수 KB. 클라는 mask 변만 그려 정확한 외곽선.
// =============================================================================
function territoryBoundary(territory, ccx, ccy) {
  const set = new Set();
  for (const c of territory) set.add(c[0] + ',' + c[1]);
  const out = [];
  for (const [x, y] of territory) {
    let mask = 0;
    if (!set.has(x + ',' + (y - 1))) mask |= 1;
    if (!set.has((x + 1) + ',' + y)) mask |= 2;
    if (!set.has(x + ',' + (y + 1))) mask |= 4;
    if (!set.has((x - 1) + ',' + y)) mask |= 8;
    if (mask) out.push(x - ccx, y - ccy, mask);
  }
  return out;
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
        // ★비옥도 필드를 먼저 깐다 — generate 의 영토 확장 tiebreak(fertW)가 이걸 읽는다.
        //   반경은 영토 반경(√(target/π)≈33) + 여유 25 — 확장이 박스를 넘지 않게.
        if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62);
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
        // Stage 4A: bnd = 영토 경계 셀(중심 상대 [dx,dy,mask] flat) — 클라 영토 렌더용 영속(전체 2850셀 아님)
        data: JSON.stringify({ typeLabel: layout.type, dock: layout.dock || null, land: lp, seedType: hv.type, bnd: territoryBoundary(layout.territory, c.ccx, c.ccy) }),
      });
      for (const h of layout.houses) db.insertVillageBuilding({ village_id: dbId, type: 'house', cx: h.cx, cy: h.cy, floors: h.floors || 1, data: null });
      for (const f of layout.farmland) db.insertVillageBuilding({ village_id: dbId, type: 'farmland', cx: f.cx, cy: f.cy, floors: 0, data: null });
      for (const f of (layout.dryfield || [])) db.insertVillageBuilding({ village_id: dbId, type: 'dryfield', cx: f.cx, cy: f.cy, floors: 0, data: null });
      // ★[실체화 동기 — 랩 정본] 지면 타일: 부지 원판(yard)·큰집 마당 원판(plaza)·텃밭(garden 4×4 남동).
      //   farmland 패턴 그대로(영속 셀 행 → 청크 활성화 때 비영속 시각 타일). 겹침 방지: 건물 발자국·텃밭은 yard에서 제외.
      {
        const terrSet = new Set(layout.territory.map(c => c[0] + ',' + c[1]));
        let tiles = 0;
        for (const h of layout.houses) {
          for (const [dx, dy] of VillageLayout.LOT_CELLS) {
            const x = h.cx + dx, y = h.cy + dy;
            if (!terrSet.has(x + ',' + y)) continue;
            if (dx >= -5 && dx <= 0 && dy >= -5 && dy <= -2) continue;      // 움집 발자국(바닥 렌더가 덮음)
            if (dx >= 1 && dx <= 4 && dy >= 1 && dy <= 4) continue;         // 텃밭 자리(아래서 garden으로)
            db.insertVillageBuilding({ village_id: dbId, type: 'yard', cx: x, cy: y, floors: 0, data: null }); tiles++;
          }
          for (let dx = 1; dx <= 4; dx++) for (let dy = 1; dy <= 4; dy++) {
            const x = h.cx + dx, y = h.cy + dy;
            if (!terrSet.has(x + ',' + y)) continue;
            db.insertVillageBuilding({ village_id: dbId, type: 'garden', cx: x, cy: y, floors: 0, data: null }); tiles++;
          }
        }
        for (const [dx, dy] of VillageLayout.YARD_CELLS) {
          const x = c.ccx + dx, y = c.ccy + dy;
          if (!terrSet.has(x + ',' + y)) continue;
          if (dx >= -4 && dx <= 3 && dy >= -4 && dy <= 3) continue;         // 큰집 발자국 제외
          db.insertVillageBuilding({ village_id: dbId, type: 'plaza', cx: x, cy: y, floors: 0, data: null }); tiles++;
        }
        // ★마을 곳간 1동(랩 링 배치 포팅) — 자리 없으면 스킵(내륙·특이 지형 관용)
        const g = pickGranarySpot(ta, layout);
        if (g) db.insertVillageBuilding({ village_id: dbId, type: 'granary', cx: g.cx, cy: g.cy, floors: 1, data: null });
        console.log(`[${state.zoneId}] 🏘️ [${hv.name}] 실체화 타일: ${tiles} (yard/garden/plaza)${g ? ` 곳간(${g.cx},${g.cy})` : ' 곳간 자리 없음'}`);
        // ★[생활 층 ②③ — 랩 동형] 영토·미개간 논 존닝 영속: 재부팅 후 개간 크루·신축 부지 선정의
        //   원료(레이아웃 객체는 시딩 때만 존재). terr=영토 전 셀, nongzone=potSet(미개간 논 후보 — 밭은 창발이라 무행).
        {
          const _fs = new Set([...layout.farmland, ...(layout.dryfield || [])].map(c2 => c2.cx + ',' + c2.cy));
          let tn = 0, zn = 0;
          for (const c2 of layout.territory) { db.insertVillageBuilding({ village_id: dbId, type: 'terr', cx: c2[0], cy: c2[1], floors: 0, data: null }); tn++; }
          for (const z2 of (layout.nongZone || [])) { if (_fs.has(z2.cx + ',' + z2.cy)) continue; db.insertVillageBuilding({ village_id: dbId, type: 'nongzone', cx: z2.cx, cy: z2.cy, floors: 0, data: null }); zn++; }
          console.log(`[${state.zoneId}] 🏘️ [${hv.name}] 생활층 영속: 영토 ${tn}셀 · 미개간 논존닝 ${zn}셀`);
        }
      }
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
// 교역 거리 행렬(BFS·지형) — villageDist의 유클리드가 강·산 우회를 몰라 운송비·약탈 확률·
// 이동일(전부 거리 비례)이 왜곡되는 것을 교정. econ은 지형을 모름(계약) — 여기(호스트)서
// 전쌍 최단거리를 계산해 econ.setDistMatrix(world, matrix)로 주입하면 villageDist가 우선 조회.
//   · 그리드: 셀 서브샘플(VILLAGE_DIST_STEP=4셀=128px) — 코스 셀 중심 1점을 ta.isBlocked로 판정
//     (지형 어댑터 그대로 재사용: 물+바위+해안, 지형 수식 복제 없음). 판정은 코스 셀당 1회
//     lazy-메모(Int8) — 마을 소스 전부가 공유해 지형 판정(콜당 ~5µs·segment 스캔)을 총 1회로.
//     ★근사(주석 의무): 코스 셀 1점 샘플이라 STEP-1셀보다 좁은 물목·바위 틈은 놓칠 수 있음(거리 근사 용도라 허용).
//   · 탐색: 8방 정수 Dijkstra(직교 10·대각 14, Dial 버킷 큐 — O(V+E)) + 코너 절단 금지
//     (랩 tradePath와 동일 규칙). 마을(소스)당 1회, 뒤 인덱스 마을이 전부 확정되면 조기 종료
//     → M마을 = M회 탐색으로 M(M-1)/2쌍 완성.
//   · 환산: cost/10 × STEP(셀) × 2.5 = econ 좌표 스케일(ev.coord=셀×2.5와 단위 일치).
//   · 도달 불능(강 건너 완전 폐색 — 본체엔 아직 다리 없음)=Infinity: v2 top-K 절대 상한이 후보 제외.
//     전 마을 상호 고립이면 경고 로그(지형 병리 — 교역 전무).
// =============================================================================
const DIST_STEP = Math.max(1, parseInt(process.env.VILLAGE_DIST_STEP || '4', 10));
// ★[11차 실측 · 다리 구제] 코스 셀 1칸의 통행 판정 — **거리행렬과 캐러밴 A*가 같은 함수를 쓴다**(모듈 헤더 계약).
//   중심 1점 샘플은 **폭 2셀 다리를 절반 확률로 못 본다**: 다리가 코스 셀 중심선(좌표 %STEP==half)에
//   걸쳐야만 보이기 때문이다. 실측(한반도 다리 28개 · STEP 4): 13개만 보이고 **15개가 안 보였다**.
//   안 보이면 그 강은 코스 그리드에서 여전히 완전 폐색 → 건너편 마을쌍이 전부 Infinity →
//   v2 top-K 절대 상한이 그 후보를 통째로 잘라낸다(다리를 놓았는데 교역은 안 열리는 상태).
//   구제는 **중심이 막혔을 때만** 코스 셀 안(STEP×STEP)을 훑어 '다리이면서 통행 가능한 칸'을 찾는다.
//   물·바위 일반에는 적용하지 않는다 — 좁은 물목을 임의로 뚫으면 거리 근사가 아니라 거짓말이 된다.
//   반환 0=차단 1=중심이 열림 2=다리로 구제.
function coarseOpen(ta, gx, gy) {
  const half = DIST_STEP >> 1, bx = gx * DIST_STEP, by = gy * DIST_STEP;
  if (!ta.isBlocked(bx + half, by + half)) return 1;
  if (!ta.isBridgeCell) return 0;
  for (let dy = 0; dy < DIST_STEP; dy++) for (let dx = 0; dx < DIST_STEP; dx++) {
    if (ta.isBridgeCell(bx + dx, by + dy) && !ta.isBlocked(bx + dx, by + dy)) return 2;
  }
  return 0;
}
function computeAndInjectDistMatrix(reason) {
  const { ta, ZONE } = state._distCtx;
  const world = state.world;
  const villages = world.villages;
  const M = villages.length;
  const t0 = Date.now();
  const cellsW = Math.ceil(ZONE.zoneWidth / SZ), cellsH = Math.ceil(ZONE.zoneHeight / SZ);
  const gw = Math.ceil(cellsW / DIST_STEP), gh = Math.ceil(cellsH / DIST_STEP);
  const half = DIST_STEP >> 1;
  const blk = new Int8Array(gw * gh); // 0=미판정 1=열림 2=차단 — 이번 계산 안에서 소스 간 공유(재계산 시엔 새로 — 어댑터가 미래에 건물을 반영해도 안전)
  let sampled = 0, bridgeSaved = 0;
  const isBlk = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
    const i = gy * gw + gx;
    if (blk[i] === 0) { sampled++; const v = coarseOpen(ta, gx, gy); if (v === 2) bridgeSaved++; blk[i] = v ? 1 : 2; }
    return blk[i] === 2;
  };
  // 마을 → 코스 노드. 중심 코스 셀이 차단이면 근방 반경 6노드(=24셀) 나선 스냅(findOpenCenter와 같은 구제).
  const srcNode = villages.map(v => {
    const gx0 = Math.min(gw - 1, Math.max(0, Math.round(v.coord.x / 2.5 / DIST_STEP)));
    const gy0 = Math.min(gh - 1, Math.max(0, Math.round(v.coord.y / 2.5 / DIST_STEP)));
    if (!isBlk(gx0, gy0)) return gy0 * gw + gx0;
    for (let r = 1; r <= 6; r++) for (let a = 0; a < 16; a++) {
      const nx = Math.round(gx0 + Math.cos(a / 16 * 2 * Math.PI) * r), ny = Math.round(gy0 + Math.sin(a / 16 * 2 * Math.PI) * r);
      if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && !isBlk(nx, ny)) return ny * gw + nx;
    }
    return -1; // 구제 불가 — 이 마을은 전쌍 Infinity(아래 로그에 잡힘)
  });
  const mat = []; for (let i = 0; i < M; i++) { const row = new Array(M).fill(Infinity); row[i] = 0; mat.push(row); }
  const dist = new Int32Array(gw * gh);
  const DIRS = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
  for (let s = 0; s < M; s++) {
    if (srcNode[s] < 0) continue;
    // 타깃: 뒤 인덱스 마을만(쌍 대칭 — 앞 인덱스와의 쌍은 그쪽 소스가 이미 채움)
    const nodeToTargets = new Map();
    for (let j = s + 1; j < M; j++) if (srcNode[j] >= 0) {
      const arr = nodeToTargets.get(srcNode[j]) || []; arr.push(j); nodeToTargets.set(srcNode[j], arr);
    }
    let remaining = 0; for (const arr of nodeToTargets.values()) remaining += arr.length;
    if (!remaining) continue;
    dist.fill(-1);
    dist[srcNode[s]] = 0;
    const buckets = [[srcNode[s]]]; // Dial: cost(정수 10/14 단위)별 버킷 — 배열이 필요만큼 자람(미로형 장경로도 안전)
    for (let c = 0; c < buckets.length && remaining > 0; c++) {
      const q = buckets[c]; if (!q) continue;
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        if (dist[i] !== c) continue; // stale 항목(더 짧은 경로로 이미 확정) — lazy 삭제
        const tg = nodeToTargets.get(i);
        if (tg) {
          const d = (c / 10) * DIST_STEP * 2.5;
          for (const j of tg) { mat[s][j] = mat[j][s] = d; remaining--; }
          nodeToTargets.delete(i);
          if (!remaining) break;
        }
        const x = i % gw, y = (i / gw) | 0;
        for (const [dx, dy, w] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (isBlk(nx, ny)) continue;
          if (dx && dy && (isBlk(x + dx, y) || isBlk(x, y + dy))) continue; // 대각 코너 절단 금지(랩 tradePath 3937행과 동일)
          const ni = ny * gw + nx, nc = c + w;
          if (dist[ni] < 0 || nc < dist[ni]) { dist[ni] = nc; (buckets[nc] || (buckets[nc] = [])).push(ni); }
        }
      }
      buckets[c] = null; // 처리한 버킷 해제(메모리)
    }
  }
  // 주입 + 로그(유클리드 대비 증가율 — 강·산 우회가 잡히면 일부 쌍이 1.0×보다 커야 함)
  state.econ.setDistMatrix(world, mat);
  let pairs = 0, unreach = 0, sumR = 0, maxR = 1, longer = 0, maxD = 0;
  for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) {
    const d = mat[i][j];
    if (!isFinite(d)) { unreach++; continue; }
    const eu = Math.hypot(villages[i].coord.x - villages[j].coord.x, villages[i].coord.y - villages[j].coord.y);
    const r = d / Math.max(1, eu);
    pairs++; sumR += r; if (r > maxR) maxR = r; if (r > 1.02) longer++; if (d > maxD) maxD = d;
  }
  console.log(`[${state.zoneId}] 🏘️ 교역 BFS 거리행렬${reason ? `(${reason})` : ''}: ${M}마을 ${pairs + unreach}쌍 ${Date.now() - t0}ms (그리드 ${gw}×${gh}·step ${DIST_STEP}셀·지형판정 ${sampled}·다리구제 ${bridgeSaved}) — 유클리드 대비 평균 ×${pairs ? (sumR / pairs).toFixed(2) : '-'} 최대 ×${maxR.toFixed(2)} 우회쌍(>1.02배) ${longer} · 최장 ${maxD.toFixed(0)} · 도달불능 ${unreach}쌍`);
  if (M > 1 && pairs === 0) console.warn(`[${state.zoneId}] 🏘️ ⚠ 전 마을 상호 고립(BFS 도달 불능) — 지형 병리: 교역 전무 예상`);
}

// =============================================================================
// Stage 4B — 캐러밴 실체화 ①: 마을쌍 경로 A* (거리행렬과 동일 코스 그리드·지형 판정 재사용)
//   · 그리드/판정/스냅/코너 규칙 전부 computeAndInjectDistMatrix와 동일 — 행렬이 유한인 쌍은
//     여기서도 반드시 경로가 나온다(같은 그래프). 스크래치는 gen-스탬프로 재사용(호출당 fill 없음).
//   · 반환 pts = [출발px, 코스노드 중심px..., 도착px] — 노드 중심 = 행렬이 샘플한 바로 그 셀 중심.
// =============================================================================
function ensureRouteGrid() {
  if (state._route) return state._route;
  if (!state._distCtx) return null;
  const { ta, ZONE } = state._distCtx;
  const cellsW = Math.ceil(ZONE.zoneWidth / SZ), cellsH = Math.ceil(ZONE.zoneHeight / SZ);
  const gw = Math.ceil(cellsW / DIST_STEP), gh = Math.ceil(cellsH / DIST_STEP);
  state._route = {
    ta, gw, gh, half: DIST_STEP >> 1,
    blk: new Int8Array(gw * gh),                      // 0=미판정 1=열림 2=차단 (lazy 메모 — invalidate가 리셋)
    g: new Int32Array(gw * gh), came: new Int32Array(gw * gh),
    stamp: new Int32Array(gw * gh), gen: 0,           // gen-스탬프: 호출마다 fill 안 함(547×1016 노드)
  };
  return state._route;
}
function computeRoutePts(x0, y0, x1, y1) {
  const R = ensureRouteGrid();
  if (!R) return null;
  const { gw, gh, half, ta } = R;
  const isBlk = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
    const i = gy * gw + gx;
    if (R.blk[i] === 0) R.blk[i] = coarseOpen(ta, gx, gy) ? 1 : 2;   // ★거리행렬과 동일 규칙(다리 구제 포함)
    return R.blk[i] === 2;
  };
  const snap = (px, py) => { // 행렬 srcNode와 동일 스냅(반경 6노드 나선)
    const gx0 = Math.min(gw - 1, Math.max(0, Math.round(px / SZ / DIST_STEP)));
    const gy0 = Math.min(gh - 1, Math.max(0, Math.round(py / SZ / DIST_STEP)));
    if (!isBlk(gx0, gy0)) return gy0 * gw + gx0;
    for (let r = 1; r <= 6; r++) for (let a = 0; a < 16; a++) {
      const nx = Math.round(gx0 + Math.cos(a / 16 * 2 * Math.PI) * r), ny = Math.round(gy0 + Math.sin(a / 16 * 2 * Math.PI) * r);
      if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && !isBlk(nx, ny)) return ny * gw + nx;
    }
    return -1;
  };
  const si = snap(x0, y0), ti = snap(x1, y1);
  if (si < 0 || ti < 0) return null;
  // ★[경로 통일 2026-07-17] 탐색 본체 = sim/path-core.js routePath(랩 tradePath와 같은 정본 — 직선 편향·코너컷 금지·100/140).
  //   기존 계약 전부 유지: isBlk lazy 메모(R.blk) · §16 답압 할인 costMul('근사로 충분' — h 무할인 octile) ·
  //   gen-스탬프 재사용 버퍼(R의 g/came/stamp를 scratch로 그대로 공유) · maxPops 250000 예산 가드.
  if (!PathCore) PathCore = require('../sim/path-core.js');
  if (!R.sc) R.sc = { w: gw, h: gh, g: R.g, came: R.came, stamp: R.stamp, gen: R.gen | 0 };
  const RD = state.roads;   // §16 답압 길 A* 스텝 할인(코스 그리드 coarse 등급 — 길 없으면 전부 ×1 = 기존 경로 그대로)
  const nodesP = PathCore.routePath(si % gw, (si / gw) | 0, ti % gw, (ti / gw) | 0, {
    blocked: isBlk,
    costMul: RD ? ((x, y) => RD.courseCostMul(x, y)) : null,
    maxPops: 250000,
    scratch: R.sc,
  });
  if (!nodesP) return null;
  const pts = [{ x: x0, y: y0 }];
  for (const n of nodesP) pts.push({ x: n.x * DIST_STEP * SZ + half * SZ + SZ / 2, y: n.y * DIST_STEP * SZ + half * SZ + SZ / 2 });
  pts.push({ x: x1, y: y1 });
  return pts;
}
const _routeWarned = new Set();
function getRoute(aVil, bVil) { // 무방향 쌍 캐시(랩 getTradePath 동형) — null도 캐시(불능쌍 반복 계산 방지)
  const fwd = aVil.dbId <= bVil.dbId;
  const key = fwd ? `${aVil.dbId}_${bVil.dbId}` : `${bVil.dbId}_${aVil.dbId}`;
  let pts = state.routeCache.get(key);
  if (pts === undefined) {
    const t0 = Date.now();
    const [s, t] = fwd ? [aVil, bVil] : [bVil, aVil];
    pts = computeRoutePts(s.ccx * SZ + SZ / 2, s.ccy * SZ + SZ / 2, t.ccx * SZ + SZ / 2, t.ccy * SZ + SZ / 2);
    state.routeCache.set(key, pts || null);
    if (pts) console.log(`[${state.zoneId}] 🐂 교역로 A*: ${s.name}↔${t.name} ${pts.length}정점 ${Date.now() - t0}ms (캐시)`);
    else if (!_routeWarned.has(key)) { _routeWarned.add(key); console.warn(`[${state.zoneId}] 🐂 교역로 A* 실패: ${s.name}↔${t.name} — 실체 생략(econ은 그대로 진행)`); }
  }
  if (!pts) return null;
  return fwd ? pts.slice() : pts.slice().reverse();
}

// =============================================================================
// Stage 4B — 캐러밴 실체화 ②: 실체(body) 수명주기 + 30Hz 페이싱.
//   econ arriveDay가 진실 — 실체는 '남은거리/남은시간' 속도로 그 경계에 정확히 도착(자기 보정).
//   실체→econ 역방향은 차단(지연·고립)뿐 — 모듈 헤더 'Stage 4B' 참조.
// =============================================================================
function econDayToMs(econDay) { // econ world.day D의 게임일 경계 절대시각(ms) — 앵커: 현 lastGameDay↔world.day 정렬
  return state.epoch + (state.lastGameDay + (econDay - state.world.day)) * state.dayMs;
}
function setBodyPts(body, pts) { // 폴리라인 교체(누적길이 재계산) — prog는 새 경로 기준 0부터
  body.pts = pts;
  const cum = new Float64Array(pts.length);
  let L = 0;
  for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); cum[i] = L; }
  body.cum = cum; body.len = L; body.prog = 0; body.segIdx = 0;
}
function caravanPointAt(body, prog, st) { // 폴리라인 위 지점 — segIdx 단조 캐시(뒤로 가면 리셋). ★st=캐시 보유자(기본 body — 호위는 각자 캐시로 단조 유지)
  const pts = body.pts, cum = body.cum, n = pts.length;
  if (prog <= 0 || n < 2) return { x: pts[0].x, y: pts[0].y };
  if (prog >= body.len) return { x: pts[n - 1].x, y: pts[n - 1].y };
  st = st || body;
  let s = st.segIdx || 0;
  if (s > n - 2 || cum[s] > prog) s = 0;
  while (s < n - 2 && cum[s + 1] < prog) s++;
  st.segIdx = s;
  const t = (prog - cum[s]) / Math.max(1e-9, cum[s + 1] - cum[s]);
  return { x: pts[s].x + (pts[s + 1].x - pts[s].x) * t, y: pts[s].y + (pts[s + 1].y - pts[s].y) * t };
}
function despawnCaravanNpc(body) { // canadia 검증 패턴(players/npcs delete + player_left)
  const { players, npcs, broadcast } = state.deps;
  if (players.has(body.pid)) {
    players.delete(body.pid);
    npcs.delete(body.pid);
    broadcast({ type: 'player_left', pid: body.pid });
  }
  if (body.escorts) for (const e of body.escorts) {   // ★[convoy 호위 실체] 호위 몸체 동반 회수(상인과 동일 패턴)
    if (players.has(e.pid)) {
      players.delete(e.pid);
      npcs.delete(e.pid);
      broadcast({ type: 'player_left', pid: e.pid });
    }
  }
}
function spawnCaravanBody(c, now) {
  const fromVil = state.byEcon.get(c.from), toVil = state.byEcon.get(c.to);
  if (!fromVil || !toVil) return false;
  const outbound = c.state === 'outbound'; // (통상 outbound — inbound 스폰은 상한 이월분 방어)
  const legA = outbound ? fromVil : toVil, legB = outbound ? toVil : fromVil;
  const pts = getRoute(legA, legB);
  if (!pts) return false;
  const p = state.deps.spawnNpc({
    x: legA.ccx * SZ + SZ / 2, y: legA.ccy * SZ + SZ / 2,
    name: `상단·${c.giveRes}`,
    villageId: `simvil_${fromVil.dbId}`, villageName: fromVil.name,
    skipHouse: true,
  });
  state.deps.npcs.delete(p.pid); // 일반 NPC AI(npcStep 루프)에서 제외 — 이동은 tickCaravanBodies가 전담(빙의)
  p.simJob = 'caravan';          // 클라 이모지 🐂 (npcPids 밖이라 syncVillageJobs가 안 건드림)
  p.simCaravan = true;           // zone.js 이동 루프(movePlayerStep) 제외 플래그 — 이중 이동 방지
  p.simVillageId = fromVil.dbId;
  const legDays = Math.max(1, outbound ? (c.arriveDay - c.departDay) : (c.returnArriveDay - c.arriveDay));
  const body = {
    id: c.id, pid: p.pid, c, phase: outbound ? 'outbound' : 'inbound', toV: c.to,
    delayedDays: 0, repairFailN: 0, lastRepairAt: 0,
    pinHunger: p.hunger, pinThirst: p.thirst, // 원정 중 게이지 고정(다게임일 이동 아사 방지 — canadia 동형)
  };
  setBodyPts(body, pts);
  body.departAt = now;
  body.arriveAt = Math.max(now + 1, econDayToMs(outbound ? c.arriveDay : c.returnArriveDay));
  body.pxPerDay = body.len / legDays;                        // 지연 환산용 명목 속도(이 캐러밴의 일정에서 역산)
  body.nomPxMs = body.len / Math.max(1, body.arriveAt - now); // 페이싱 상한(×4)의 기준
  // ★[convoy 물리 행군 — 랩 dispatchTrades 동형(2026-07-16)] 호위 전사 실체 스폰: econ이 위험인지 pooling으로 산정한
  //   c.escort만큼(시각 상한 5 — 랩 동형) 몸체를 상단 뒤 종대로 동행시킨다. econ 무접촉(전사 counts는 econ 소유 —
  //   몸체는 아바타. 상인 빙의(Phase 4d-10)와 동일 패턴). 포식자 배선(host.getCaravans().escorts) 전제 몸체이기도 함.
  //   평화 마을=escort 0=단독(현행 무변) · 위협 마을=대열(창발). 이동은 tickCaravanBodies._escortMarch(경로 추종 종대).
  body.escorts = [];
  {
    const escN = Math.min(5, Math.max(0, c.escort | 0));
    for (let ei = 0; ei < escN; ei++) {
      const ep = state.deps.spawnNpc({
        x: legA.ccx * SZ + SZ / 2, y: legA.ccy * SZ + SZ / 2,
        name: '호위·전사',
        villageId: `simvil_${fromVil.dbId}`, villageName: fromVil.name,
        skipHouse: true,
      });
      state.deps.npcs.delete(ep.pid); // 일반 NPC AI 제외(빙의 — 상인 동형)
      ep.simJob = 'warrior';          // 클라 표기(§4A simJob 메타)
      ep.simCaravan = true;           // zone 이동루프 제외 — 이중 이동 방지(상인 동형)
      ep.simVillageId = fromVil.dbId;
      body.escorts.push({ pid: ep.pid, segIdx: 0, pinH: ep.hunger, pinT: ep.thirst });
    }
  }
  state.caravanBodies.set(c.id, body);
  console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} 출발: ${c.from.name}→${c.to.name} ${c.giveRes}×${Math.round(c.giveAmt)} 호위${c.escort}(실체 ${body.escorts.length}) — 경로 ${pts.length}정점 ${Math.round(body.len)}px ${legDays}게임일(econ d${c.departDay}→d${c.arriveDay})`);
  return true;
}
function startReturnLeg(body, now) { // 도착 머묾(linger) 종료 → 귀환 출발
  const c = body.c;
  const homeVil = state.byEcon.get(c.from), hereVil = state.byEcon.get(c.to);
  let pts = (homeVil && hereVil) ? getRoute(hereVil, homeVil) : null;
  if (!pts) { // 폴백: 걸어온 정점 역순(경로 캐시가 비었어도 귀환 보장)
    pts = [];
    for (let i = body.pts.length - 1; i >= 0; i--) pts.push(body.pts[i]);
  }
  setBodyPts(body, pts);
  body.phase = 'inbound';
  const legDays = Math.max(1, c.returnArriveDay - state.world.day);
  body.departAt = now;
  body.arriveAt = Math.max(now + 1, econDayToMs(c.returnArriveDay));
  body.pxPerDay = body.len / legDays;
  body.nomPxMs = body.len / Math.max(1, body.arriveAt - now);
  console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} 귀환 출발: ${c.to.name}→${c.from.name}${c._returningRes ? ` ${c._returningRes}×${Math.round(c._returningAmt || 0)}` : ' (빈손)'} — econ d${c.returnArriveDay} 도착 예정`);
}
// §5.5b 2단계 — 완전 고립: econ '빈손 귀환(화물 보존)' 상태로 전이(기존 tickCaravansV2 inbound 처리에 위임).
//   제3 마을 재라우팅은 econ이 도착 시점 가격 손절에서 이미 수행 — 벽 인지 전역 경로가 없는 현 단계에선
//   유일하게 통행이 보장된 길 = 걸어온 역경로. (벽 인지 행렬은 Stage 5 정밀화 인계 — 모듈 헤더 참조)
function isolateCaravanReturn(body, p, now) {
  const c = body.c, world = state.world;
  c._returningRes = c.giveRes;
  c._returningAmt = c.giveAmt;   // 화물 보존(아직 미도착 — 매도 전량 회수)
  c._abandoned = true;
  c.state = 'inbound';
  const rev = [{ x: p.x, y: p.y }];
  for (let i = Math.min(body.segIdx, body.pts.length - 1); i >= 0; i--) rev.push(body.pts[i]);
  setBodyPts(body, rev);
  c.distance = body.len / PX_PER_ECON; // 귀환 약탈 확률(거리 비례)에 실경로 반영
  const days = Math.max(1, Math.ceil(body.len / Math.max(1, body.pxPerDay)));
  c.returnArriveDay = world.day + days;
  body.phase = 'inbound';
  body.departAt = now;
  body.arriveAt = Math.max(now + 1, econDayToMs(c.returnArriveDay));
  body.nomPxMs = body.len / Math.max(1, body.arriveAt - now);
  body.repairFailN = 0;
  if (world._tradeAudit) world._tradeAudit.isolated = (world._tradeAudit.isolated || 0) + 1; // 감사 확장(additive)
  world.tradeLog.push({
    day: world.day, from: c.from.name, to: c.to.name,
    sent: { res: c.giveRes, amt: +c.giveAmt.toFixed(2), pAtFrom: +c.pFrom_at_depart.toFixed(2), pAtTo: 0 },
    bought: null, distance: +c.distance.toFixed(0), escort: c.escort, raided: false,
    travelDays: days, abandoned: true, note: '이동 차단 고립 → 화물 보존 귀환(§5.5b)',
  });
  console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} 완전 고립(재경로 ${CARAVAN_ISOLATE_FAILS}연속 실패) → 화물 보존 귀환: ${c.to.name}→${c.from.name} ${c.giveRes}×${Math.round(c.giveAmt)} ${days}일(econ 위임 — state='inbound')`);
}
// §5.5b 1단계 — 이동 중 차단: 로컬 A*(벽 인지 — 활성 청크는 건물이 메모리에 로드됨) 재경로 →
//   연장분만큼 econ arriveDay 지연. 반복 실패 시 고립 처리.
function caravanBlockedResponse(body, p, now) {
  if (now - body.lastRepairAt < CARAVAN_REPAIR_COOLDOWN_MS) return;
  body.lastRepairAt = now;
  const c = body.c;
  // 우회 목표 = 전방 lookahead 지점의 경로 정점(차단 구간 너머)
  let vi = Math.min(body.segIdx + 1, body.pts.length - 1);
  const targetProg = Math.min(body.len, body.prog + CARAVAN_REPAIR_LOOKAHEAD_PX);
  while (vi < body.pts.length - 1 && body.cum[vi] < targetProg) vi++;
  const tgt = body.pts[vi];
  const obs = body._testObstacle; // BLOCKTEST 전용 가상 장애물(운영 null)
  const blockedFn = obs
    ? (nx, ny, ox, oy, fl) => (Math.hypot(nx - obs.x, ny - obs.y) < obs.r) || state.deps.isBlockedByWall(nx, ny, ox, oy, fl)
    : state.deps.isBlockedByWall;
  const rp = state.pathfind ? state.pathfind.findPath(p.x, p.y, tgt.x, tgt.y, {
    floor: 0, isBlockedFn: blockedFn, isWaterFn: state.deps.isTerrainBlockedLocal,
    maxCells: 900, searchRadiusCells: 48, // NPC A*(200/24)보다 넉넉히 — 캐러밴은 소수·저빈도
  }) : null;
  body._testObstacle = null;
  if (rp && rp.length) {
    const oldRemain = body.len - body.prog;
    const newPts = [{ x: p.x, y: p.y }, ...rp, ...body.pts.slice(vi + 1)];
    setBodyPts(body, newPts);
    const extraPx = body.len - oldRemain;
    let pushed = 0;
    if (extraPx > body.pxPerDay * 0.05) { // 유의미한 연장만 일 단위 지연(사소한 우회는 페이싱이 흡수)
      pushed = Math.max(1, Math.ceil(extraPx / Math.max(1, body.pxPerDay)));
      if (body.phase === 'outbound') { c.arriveDay += pushed; c.returnArriveDay += pushed; }
      else c.returnArriveDay += pushed;
      body.arriveAt += pushed * state.dayMs;
      body.delayedDays += pushed;
    }
    body.repairFailN = 0;
    console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} 차단 감지 → 로컬 재경로 성공(연장 ${Math.round(extraPx)}px${pushed ? `, econ 도착 +${pushed}일 지연` : ', 지연 없음'}) — §5.5b 1단계`);
  } else {
    body.repairFailN++;
    console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} 차단 — 로컬 재경로 실패 ${body.repairFailN}/${CARAVAN_ISOLATE_FAILS}`);
    if (body.repairFailN >= CARAVAN_ISOLATE_FAILS) {
      if (body.phase === 'outbound' && c.state === 'outbound') isolateCaravanReturn(body, p, now);
      else { body.repairFailN = 0; console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} 귀환로 차단 지속 — 대기(도착 임박 가드가 returnArriveDay를 민다)`); }
    }
  }
}
// 30Hz — 모든 실체 캐러밴 전진. 활성 청크(플레이어 시야)만 벽 충돌 판정, 비활성은 경로 보간(dormant 동형).
//   idle 존 스킵보다 앞(onGameTick 최상단 호출)이라 무인 존에서도 진행 — econ과 이격 없음.
function tickCaravanBodies(now) {
  const bodies = state.caravanBodies;
  const dtMs = Math.min(500, Math.max(1, now - (state._carTickAt || now)));
  state._carTickAt = now;
  if (!bodies || !bodies.size) return;
  const { players, isPositionActive, isBlockedByWall } = state.deps;
  for (const body of bodies.values()) {
    const p = players.get(body.pid);
    if (!p) continue; // 외부 소실(비정상) — 소멸 동기(syncCaravanBodies)가 회수
    p.hunger = body.pinHunger; p.thirst = body.pinThirst; // 원정 중 아사 방지(스폰 시점 값 고정)
    if (p.hp <= 0) { p.vx = 0; p.vy = 0; continue; }      // 늑대 등 사망 — 부활 후 아래 경로 스냅으로 복귀
    if (body.phase === 'linger') {
      p.vx = 0; p.vy = 0;
      _escortMarch(body, dtMs, players);   // ★[convoy] 머묾 중에도 호위는 후미 정위치로 수렴·정지
      if (now >= body.lingerUntil) startReturnLeg(body, now);
      continue;
    }
    const c = body.c;
    const remainPx = body.len - body.prog;
    if (remainPx <= 0.5) { p.vx = 0; p.vy = 0; _escortMarch(body, dtMs, players); continue; } // 종점 대기 — econ 경계 처리(sync)가 상태 전이/회수
    // 테스트 훅: 가상 차단 1회(재경로 로그) 또는 강제 고립 1회 — 운영(env 무설정) 완전 무경로
    if (CARAVAN_BLOCKTEST && !state._blockTested && body.phase === 'outbound' && body.prog > body.len * 0.25) {
      state._blockTested = true;
      console.log(`[${state.zoneId}] 🐂 [BLOCKTEST=${CARAVAN_BLOCKTEST}] 캐러밴#${c.id} 강제 차단 시뮬 (prog ${Math.round(body.prog)}/${Math.round(body.len)}px)`);
      if (CARAVAN_BLOCKTEST === 2) { isolateCaravanReturn(body, p, now); }
      else {
        const ahead = caravanPointAt(body, body.prog + 160);
        body._testObstacle = { x: ahead.x, y: ahead.y, r: 100 };
        body.lastRepairAt = 0;
        caravanBlockedResponse(body, p, now);
      }
      invalidateTradeDistances(Math.round(p.x / SZ), Math.round(p.y / SZ)); // 차단=무효화 훅 경로도 함께 검증
      continue;
    }
    // 도착 임박 가드 — 실체가 못 갔으면 econ 도착을 뒤로(§5.5b 지연): econ이 몸을 앞지르는 것 차단.
    //   발동 조건 = '최대 따라잡기 속도(명목×4)로도 남은 시간+2틱 안에 못 닿는 잔여'만 — 페이싱의
    //   정상 잔여(마지막 1틱 분량)를 지연으로 오인하지 않게(첫 스모크에서 전 캐러밴 +1일 오발 확인·수정).
    if (now >= body.arriveAt - state.dayMs * 0.02
        && remainPx > Math.max(64, body.nomPxMs * 4 * (Math.max(0, body.arriveAt - now) + 66))) {
      const push = Math.max(1, Math.ceil(remainPx / Math.max(1, body.pxPerDay)));
      if (body.phase === 'outbound') { c.arriveDay += push; c.returnArriveDay += push; }
      else c.returnArriveDay += push;
      body.arriveAt += push * state.dayMs;
      body.delayedDays += push;
      console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} econ 도착 +${push}일 지연(잔여 ${Math.round(remainPx)}px — 차단/정체 흡수)`);
    }
    // 페이싱: 남은거리/남은시간(자기 보정) — 목표를 경계 2틱 앞으로 당겨 경계 '이전' 도착 보장.
    //   상한 = 명목 ×4(정체 후 따라잡기 허용·순간이동 방지)
    const speed = Math.min(remainPx / Math.max(1, body.arriveAt - 66 - now), body.nomPxMs * 4); // px/ms
    const step = Math.min(remainPx, speed * dtMs);
    const next = caravanPointAt(body, body.prog + step);
    if (isPositionActive && isPositionActive(p.x, p.y) && isBlockedByWall && isBlockedByWall(next.x, next.y, p.x, p.y, 0)) {
      p.vx = 0; p.vy = 0; // 벽(신규 건물)에 막힘 — 전진 보류 + 재경로 시도
      caravanBlockedResponse(body, p, now);
      continue;
    }
    body.prog += step;
    p.vx = (next.x - p.x) / dtMs * 1000; p.vy = (next.y - p.y) / dtMs * 1000; // 걷기 모션용(클라 facing)
    p.x = next.x; p.y = next.y; // 경로가 위치의 진실 — 외부 이탈(부활 등)도 다음 틱에 스냅 복귀
    if (state.roads) state.roads.stampEntityPx(p, p.x, p.y);   // §16 답압(캐러밴 — 셀 변경 시만. 교역로가 길이 된다)
    _escortMarch(body, dtMs, players);   // ★[convoy] 호위 종대 갱신(상단 진행도 기준 후미 추종)
  }
}
// ★[convoy 물리 행군 — 랩 동형] 호위 종대: 상단 진행도 뒤 20px(≈0.6칸) 간격으로 같은 경로를 추종(단일 종대 — 좁은 길 고증).
//   각자 segIdx 캐시(e)로 caravanPointAt 단조 스캔 유지(O(1) 상각 — 상인 캐시 공유 시 매 틱 리셋 스캔이라 분리).
//   진행도가 20(i+1)px 미만이면 출발점 대기 → 상단이 앞서 나가며 한 명씩 뒤따라 나감(회관 집결→순차 출발 연출이 공짜로 창발).
//   경로가 위치의 진실(상인 동형): 재라우팅·귀환(setBodyPts)도 진행도 추종이라 추가 처리 불요. 사망(늑대 등)=정지, 부활 후 스냅 복귀.
function _escortMarch(body, dtMs, players) {
  const list = body.escorts;
  if (!list || !list.length) return;
  for (let i = 0; i < list.length; i++) {
    const e = list[i], ep = players.get(e.pid);
    if (!ep) continue;
    ep.hunger = e.pinH; ep.thirst = e.pinT;   // 원정 중 게이지 고정(상인 pinHunger 동형)
    if (ep.hp <= 0) { ep.vx = 0; ep.vy = 0; continue; }
    const tp = caravanPointAt(body, Math.max(0, body.prog - 20 * (i + 1)), e);
    ep.vx = (tp.x - ep.x) / dtMs * 1000; ep.vy = (tp.y - ep.y) / dtMs * 1000;   // 걷기 모션(클라 facing)
    ep.x = tp.x; ep.y = tp.y;
    if (state.roads) state.roads.stampEntityPx(ep, ep.x, ep.y);   // §16 답압(★호위도 길을 밟는다 — 상인 동형. 대열 5명이면 답압 5배 = 교역로가 더 빨리 길이 됨)
  }
}
// 게임일 경계(econ 틱 직후) — econ 캐러밴 집합과 실체 대조: 스폰/상태 전이/회수.
function syncCaravanBodies(now) {
  const world = state.world, bodies = state.caravanBodies;
  const players = state.deps.players;
  const seen = new Set();
  let spawned = 0, arrived = 0, removed = 0;
  for (const c of world.caravans) {
    if (c._done) continue;
    seen.add(c.id);
    const body = bodies.get(c.id);
    if (!body) {
      if (bodies.size < CARAVAN_BODY_MAX && spawnCaravanBody(c, now)) spawned++;
      continue;
    }
    if (body.phase !== 'outbound') continue;
    if (c.state === 'inbound') {
      // econ 도착 확정(매도 or 빈손 손절) — 실체는 종점 스냅 + 1게임시간 머묾 후 귀환(§5.5b 연출)
      const p = players.get(body.pid);
      const end = caravanPointAt(body, body.len);
      if (p) { p.x = end.x; p.y = end.y; p.vx = 0; p.vy = 0; }
      body.prog = body.len;
      body.phase = 'linger';
      body.lingerUntil = now + state.dayMs * CARAVAN_LINGER_DAY_FRAC;
      arrived++;
      console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} 도착: ${c.from.name}→${c.to.name} ${c.giveRes}${c._abandoned ? ' (빈손 손절)' : ' 매도'} — 1게임시간 머묾 후 귀환`);
    } else if (c.to !== body.toV) {
      // econ 도착 시점 재라우팅(가격 손절 — 기존 로직) — 실체는 현 위치(구 목적지)에서 새 목적지로 재출발
      const p = players.get(body.pid);
      const pos = p ? { x: p.x, y: p.y } : caravanPointAt(body, body.prog);
      const oldToVil = state.byEcon.get(body.toV), newToVil = state.byEcon.get(c.to);
      let pts = (oldToVil && newToVil) ? getRoute(oldToVil, newToVil) : null;
      if (pts) pts = [{ x: pos.x, y: pos.y }, ...pts];
      else if (newToVil) pts = [{ x: pos.x, y: pos.y }, { x: newToVil.ccx * SZ + SZ / 2, y: newToVil.ccy * SZ + SZ / 2 }]; // 경로 실패 폴백: 직선 보간(비활성 수준 — 행렬 유한쌍이라 실사용 희박)
      else { despawnCaravanNpc(body); bodies.delete(c.id); removed++; continue; } // 대상 마을 미상(방어) — 실체 생략, econ은 계속
      setBodyPts(body, pts);
      body.toV = c.to;
      const legDays = Math.max(1, c.arriveDay - world.day);
      body.departAt = now;
      body.arriveAt = Math.max(now + 1, econDayToMs(c.arriveDay));
      body.pxPerDay = body.len / legDays;
      body.nomPxMs = body.len / Math.max(1, body.arriveAt - now);
      console.log(`[${state.zoneId}] 🐂 캐러밴#${c.id} econ 재라우팅 → ${c.to.name} (${legDays}일) — 실체 재출발`);
    }
  }
  // econ에서 사라진 캐러밴(완주 입금 or killTrader) — 실체 회수
  for (const [id, body] of [...bodies]) {
    if (seen.has(id)) continue;
    const c = body.c;
    const killed = c && c.trader && c.from && Array.isArray(c.from.npcs) && c.from.npcs.indexOf(c.trader) < 0;
    despawnCaravanNpc(body);
    bodies.delete(id);
    removed++;
    console.log(`[${state.zoneId}] 🐂 캐러밴#${id} ${killed ? '행상 사망(약탈 주사위) — 실체 소멸' : '귀환 완료 — 상인 회수'}${body.delayedDays ? ` (차단 지연 누계 ${body.delayedDays}일)` : ''}`);
  }
  return { spawned, arrived, removed };
}

// =============================================================================
// 동적 무효화 훅(스텁) — Stage 4 건물 실물화(다리·성벽 설치/파괴)가 호출 예정. 지금 호출부 없음.
// 단순 구현: 전체 행렬 dirty 플래그 → 다음 게임일 경계(자정 저장 큐 세팅 뒤)에 전쌍 재계산.
// Stage 4 정밀화 설계(인계 — 주석 계약):
//   · 차단(성벽 설치·다리 철거): 경로 셀 → 지나는 마을쌍 역인덱스를 만들어 '그 경로 위 쌍만' 재계산.
//   · 개통(다리 신설·바위 제거): 어떤 쌍이든 짧아질 수 있음 → 전쌍을 틱 분산(예: 1쌍/틱)으로 재계산.
//   · 주기 안전망: N게임일마다 전쌍 리프레시(역인덱스 누락·드리프트 흡수).
// (cx, cy) = 변화 셀 좌표 — 스텁에선 미사용(전체 dirty), 정밀화 때 역인덱스 조회 키가 된다.
// Stage 4B부터 실동: zone.js 벽류(wall/fence) 설치·철거·파괴 지점이 호출(§5.5b 차단·개통) —
//   다음 게임일 경계에 전쌍 재계산 + 캐러밴 경로 캐시·코스 차단 메모도 비움(다음 캐러밴부터 새 판정).
//   ★한계: 행렬·경로 그리드의 판정은 지형만(모듈 헤더 Stage 4B 주석) — 벽의 실시간 효과는 실체 충돌이 담당.
// ★[11차 인계 계약 · 플레이어 마을 선포] 마을이 **런타임에 늘거나 줄면** 여기도 반드시 거쳐야 한다.
//   지금 world.villages 는 부팅 시 DB 행에서만 채워진다(1369행) — 선포 기능이 생기면:
//     ① world.villages.push(ev) 직후 invalidateTradeDistances() 호출 — 안 하면 새 마을은
//        setDistMatrix 가 다시 돌 때까지 _distIdx 가 없어 villageDist 가 **유클리드로 후퇴**한다
//        (강·산 우회를 모르는 거리로 교역 상대를 고르게 된다).
//     ② econ 쪽 top-K 캐시는 world.villages.length 변화로 저절로 무효화되므로 별도 조치 불필요
//        (economy-engine.browser.js 3766행 _near20N 비교).
//     ③ 자정까지 못 기다릴 자리(선포 즉시 교역 개시)라면 computeAndInjectDistMatrix('마을 선포')를
//        그 자리에서 부르면 된다 — 51마을 전쌍이 한 자릿수 초, 선포는 드문 사건이라 감당된다.
function invalidateTradeDistances(cx, cy) { // eslint-disable-line no-unused-vars
  if (!state.ready) return;
  state.distDirty = true;
  if (state.routeCache) state.routeCache.clear();
  if (state._route) state._route.blk.fill(0);
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
    state.villageSeed = ZONE.villageSeed || 1020; // §11 도적(bandits.js) 결정론 RNG 공유(war-core seed와 동일 원천)
    state.dayMs = parseInt(process.env.VILLAGE_DAY_MS || '', 10) || WORLD.dayLengthMs; // VILLAGE_DAY_MS는 테스트 전용
    state.epoch = WORLD.worldEpoch || 0;

    const db = require('./zone-local-db'); // zone.js와 같은 싱글턴 (require 캐시)
    const terrain = require('./terrain');
    state.db = db;
    const ta = makeTerrainAdapter(terrain, ZONE, deps);
  state.ta = ta;   // ★[생활 층] 런타임 지형 판정(개간 적격·신축 부지·물거리 EDT)용 유지 — 시딩 후에도 사용

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
    const warCore = require('../sim/war-core');        // P1: NPC 마을 전쟁 econ 층(명분·원한·징집·headless 판정·되먹임)
    const warLive = require('./war-live');              // P2: LOD 실체 전투 상태머신(관측자 근접 시 battle-core 실시간 스텝)
    state.econ = econ; state.econV2 = econV2; state.warCore = warCore; state.warLive_mod = warLive;
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
      const bRows = db.getVillageBuildings(row.id);
      const housesPx = [];
      // ★[생활 층] 부팅 시 상태 집합 재구성 — terr/nongzone(시딩 영속) + 개간 실상태(farm/dry) + 집·곳간 셀
      const terrSet = new Set(), potSet = new Set(), farmSet = new Set(), drySet = new Set(), granList = [], houseCells = [], siteRows = [], ditchCells = [], pHouseRows = [], pSiteRows = [];
      let farmN = 0, dryN = 0, hallData = null, maxCellR = 4;
      for (const b of bRows) {
        const r = Math.hypot(b.cx - row.cx, b.cy - row.cy);
        if (r > maxCellR) maxCellR = r;
        if (b.type === 'house') { housesPx.push({ x: b.cx * SZ + SZ / 2, y: b.cy * SZ + SZ / 2 }); houseCells.push({ cx: b.cx, cy: b.cy }); }
        else if (b.type === 'farmland') { farmN++; farmSet.add(b.cx + ',' + b.cy); }
        else if (b.type === 'dryfield') { dryN++; farmSet.add(b.cx + ',' + b.cy); drySet.add(b.cx + ',' + b.cy); }   // ★[생활 층 100% ③] 밭 셀 구분(논=물대기 대상, 밭=아님 — 랩 field 동형)
        else if (b.type === 'terr') terrSet.add(b.cx + ',' + b.cy);
        else if (b.type === 'nongzone') potSet.add(b.cx + ',' + b.cy);
        else if (b.type === 'granary') granList.push({ cx: b.cx, cy: b.cy });
        else if (b.type === 'housesite') siteRows.push({ cx: b.cx, cy: b.cy });
        else if (b.type === 'phouse') pHouseRows.push({ cx: b.cx, cy: b.cy, data: b.data });   // ★[11차 T4] 플레이어 의뢰 집 — 집채는 되살리되 **마을 침대 명부엔 안 넣는다**
        else if (b.type === 'psitework') pSiteRows.push({ cx: b.cx, cy: b.cy, data: b.data });   // 공사 중이던 의뢰 집터
        else if (b.type === 'ditch') ditchCells.push({ cx: b.cx, cy: b.cy });   // ★[11차 T3 환호] 도랑 셀(영속) — 콜라이더·렌더의 원천
        else if (b.type === 'hall' && b.data) { try { hallData = JSON.parse(b.data); } catch {} }
      }
      for (const k of farmSet) potSet.delete(k);   // 이미 개간된 존닝 셀 제외(미개간 잔여만 potSet)
      // Stage 4A: 영토 경계(시딩 때 hall data.bnd로 영속). 구DB(Stage1~3)엔 없음 → 반경 원 근사 폴백.
      const bnd = (hallData && Array.isArray(hallData.bnd) && hallData.bnd.length) ? hallData.bnd : null;
      let maxRPx = (maxCellR + 3) * SZ;
      if (bnd) {
        let m = 0;
        for (let i = 0; i < bnd.length; i += 3) { const d = Math.hypot(bnd[i], bnd[i + 1]); if (d > m) m = d; }
        maxRPx = Math.max(maxRPx, (m + 2) * SZ);
      }
      const _pendSite = siteRows.find(s3 => !houseCells.some(h => h.cx === s3.cx && h.cy === s3.cy)) || null;   // 완공(house 행 존재) 안 된 진행 중 터만
      state.villages.push({ dbId: row.id, name: row.name, ccx: row.cx, ccy: row.cy, housesPx, econ: ev, npcPids: [], _bRows: bRows, _bnd: bnd, _maxRPx: Math.round(maxRPx), _farmN: farmN, _dryN: dryN,
        _terrSet: terrSet, _potSet: potSet, _farmSet: farmSet, _drySet: drySet, _granList: granList, _houseCells: houseCells, _pendSite, _site: null, _clearCrew: 0, _buildCrew: 0, _claim: new Set(),
        _crop: new Map(), _cropClaim: new Set(), _ditch: ditchCells,
        _pHouses: pHouseRows, _pSiteRows: pSiteRows, _psite: null, _psiteCrew: 0 });   // ★[생활 층] 런타임 상태(구DB=terr 0셀 → 생활층 휴면). _crop=작물 상태머신(랩 life.crop 동형 — 인메모리 관용: 재부팅=재파종)
    }
    world.day = maxDay;
    state.world = world;
    state.byDbId = new Map(state.villages.map(v => [v.dbId, v]));
    state.byEcon = new Map(state.villages.map(v => [v.econ, v])); // Stage 4B: econ 마을 객체 → 공간 마을(캐러밴 from/to 해석)
    state.claimedNames = new Set(state.villages.map(v => v.name)); // 레거시 디듀프 대상(이름 유니크 — 50곳 검증됨)
    // Stage 4B: 캐러밴 실체 상태 — world.caravans는 비영속(재부팅 시 빈 배열)이라 복원 불필요
    state.caravanBodies = new Map();
    state.routeCache = new Map();
    state.pathfind = require('./pathfind'); // 로컬 재경로(벽 인지) — lazy(플래그 off면 이 줄까지 안 옴)
    state.roads = require('./roads');        // §16 답압 길(4파) — 캐러밴·행군 스탬프 + 교역 A* 할인(ENABLE_ROADS=0이면 내부 no-op)
    // §19 경도 로컬 시각(4파): 마을별 _lonOff = (ccx/셀폭)×0.045 — 인간 일과(마을 NPC 취침)만 로컬 태양시.
    //   econ 일 경계·야생·도적은 전역 유지(블록 계약 — 랩 L_LON_SPREAD 5351행 verbatim).
    { const _cw = Math.ceil(ZONE.zoneWidth / SZ); for (const vil of state.villages) vil._lonOff = +((vil.ccx / _cw) * 0.045).toFixed(4);
      const _lo = state.villages.map(v => v._lonOff); if (_lo.length) console.log(`[${state.zoneId}] 🕐 경도 시차(§19): 마을 ${_lo.length}곳 스프레드 ${(Math.min(..._lo) * 1440).toFixed(0)}~${(Math.max(..._lo) * 1440).toFixed(0)}분/일(0.045 상수 — 동쪽이 먼저 잔다)`); }

    // --- P1: NPC 마을 전쟁 econ 층 배선 (tickWorldV2 후 daily 구동) ---
    //   전쟁 상태는 전부 vil.econ(plain object)에 저장 → serializeEcon 이 자동 영속(_grudge/_warTrauma/
    //   _warFatigue/_palisade/_warMobUntil/_warTribOut 등). 세력 간 조공(TRIBUTES)은 payer econ._warTribOut
    //   미러로 영속 → 재부팅 시 rebuildFromEcon() 이 world 목록 재구성. 진행 중 WARS(march)는 캐러밴과
    //   동형(비영속·다음 판정까지 짧음). center=맵 셀(ccx/ccy), 영토=econ.land.size×25(랩 warTerrR 정합).
    //   결정론: war-core 는 Math.random 미사용 — (villageSeed, world.day) 시드 rng 만. econ srand 스트림 불간섭.
    state.war = warCore.createWar({
      villages: state.villages,
      world,
      seed: (ZONE.villageSeed || 1020),
      infoRange: 5000,
      centerOf: v => ({ cx: v.ccx, cy: v.ccy }),
      territoryOf: v => (v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800),
      log: null,   // 조용(warStats().log 에 500줄 순환 버퍼로 적재 — 요약만 일 1회)
      // ★[2파 작전층] 실체 개전 훅 — assault/sortie '결단' 시점에만 호출(자동 개전 폐지). 관측자 근접이면
      //   몸·징발·포진·강제 교전으로 LiveBattle 승격(true → w.phase='battle', 되먹임은 war-live onResolved).
      //   구 warLodResolveSweep(eta 도달 즉시 승격)를 대체 — 한 전쟁=정확히 1경로 계약은 그대로.
      onEngage: (w, day, why) => {
        try {
          if (!state.warLive) return false;
          const anyViewerNear = state.deps && state.deps.anyViewerNear;
          if (typeof anyViewerNear !== 'function') return false;
          if (!anyViewerNear(warDefCenterPx(w), WAR_LOD_VIEW_PX)) return false;   // 무관측자 → headless(호출측)
          const now = state._warTickAt || Date.now();
          let body = state.warBodies.get(w.id);
          if (!body) { if (state.warBodies.size >= WAR_BODY_MAX) return false; body = _warEnsureBody(w, now); if (!body) return false; }
          _warPaceCommander(body, now, 1); _warInstantiateAttackers(body); _warEnsureDefense(body);
          const ok = _warTryEngage(body, true);   // 성공 → phase='battle'(daily headless 선점)
          if (ok) state._warPhysToday = (state._warPhysToday || 0) + 1;
          return ok;
        } catch (_) { return false; }
      },
    });
    state.war.rebuildFromEcon();   // 재부팅 복원: econ._warTribOut → world TRIBUTES 재구성

    // --- P2: LOD 실체 전투(server/war-live) 배선 — 관측자 근접 시 physical 경로 ---
    //   한 전쟁=1경로: warResolveBattle 3인자(precomputedRes)로 되먹임(headless byte불변). resolveBattle 는
    //   createWar 반환 클로저(WARS·warKill·TRIBUTES 상태 소유)를 그대로 넘겨 econ 확정선 유지. dayOf=world.day.
    state.warBodies = new Map();   // P3: 실체 행군/전투/귀환 몸(비영속 — 재부팅 시 빈 Map, 캐러밴 동형)
    state.warLive = warLive.createWarLive({
      BC: require('../sim/battle-core'),
      toBattleSpec: state.war.toBattleSpec,
      resolveBattle: (w, day, pre) => state.war.warResolveBattle(w, day, pre),   // war-core 3인자 되먹임(1회)
      centerOf: v => ({ cx: v.ccx, cy: v.ccy }),                                  // 맵 셀(centerOf 정합)
      dayOf: () => state.world.day,
      // P3: 결판 훅(splice 전) — 최종 미러로 사상 despawn·생존 귀환(궤주) · 콜라이더 물/바위 진입 금지(셀→px isTerrainBlockedLocal)
      onResolved: (lb) => { try { _warOnResolved(lb); } catch (e) { console.error(`[${state.zoneId}] ⚔️ onResolved 실패:`, e.message); } },
      blockedCell: (cx, cy) => { try { return deps.isTerrainBlockedLocal(cx * SZ + SZ / 2, cy * SZ + SZ / 2); } catch (_) { return false; } },
      log: null,
    });

    // --- ★[생활층 휴면 해소] 영토 런타임 백필 — terr 0셀 구DB 마을 자가치유 ---
    try { _terrBackfillAll(); } catch (e) { console.error(`[${ZONE_ID}] 🏘️ 영토 백필 실패(마을은 휴면 유지):`, e.message); }

    // --- ★[11차 T3 환호] 시범 마을 도랑 실체화(부팅 자가치유·idempotent — DB 리셋 없이 신규 반영) ---
    try { _ditchInitAll(); } catch (e) { console.error(`[${ZONE_ID}] 🏰 환호 실체화 실패(무시하고 계속):`, e.message); }
    if (process.env.VILLAGE_DITCH_SCAN === '1') { try { _ditchScanAll(); } catch (e) { console.error(`[${ZONE_ID}] 🏰 환호 스캔 실패:`, e.message); } }

    // --- ★[11차 T4] 공사 중이던 플레이어 의뢰 집터 복원(재부팅에 의뢰가 증발하지 않게) ---
    try {
      let n = 0;
      for (const vil of state.villages) {
        const r = (vil._pSiteRows || [])[0]; if (!r) continue;
        let ow = null; try { ow = (JSON.parse(r.data || '{}') || {}).owner || null; } catch (e) {}
        const bo = deps.liveBuildRow ? deps.liveBuildRow('hut_site', (r.cx - 2.5) * SZ, (r.cy - 3.5) * SZ,
          { stage: 1, x0: r.cx - 5, y0: r.cy - 5, x1: r.cx + 0, y1: r.cy - 2, owner: ow, psite: 1 }, ow || `npc_simvil_${vil.dbId}`, '의뢰 움집터', null) : null;
        vil._psite = { cx: r.cx, cy: r.cy, stage: 1, bo, player: 1, owner: ow, ownerName: '의뢰 움집' };
        vil._psiteCrew = 0; n++;
      }
      if (n) console.log(`[${ZONE_ID}] 🏠 플레이어 의뢰 집터 복원 ${n}건(단계는 1로 재시작 — 진행도 비영속 관용)`);
    } catch (e) { console.error(`[${ZONE_ID}] 🏠 의뢰 집터 복원 실패:`, e.message); }

    // --- Stage 4A: 회관·집 실물화 (buildings 테이블 — 부팅 wipe가 지운 자리에 재기록, 1트랜잭션) ---
    {
      const t0 = Date.now();
      let totalRows = 0, totalHouses = 0, totalFarm = 0;
      db.db.exec('BEGIN');
      try {
        for (const vil of state.villages) {
          const r = materializeVillageStructures(db, vil, vil._bRows);
          totalRows += r.rows; totalHouses += r.houses;
          totalFarm += vil._farmN + vil._dryN;
        }
        db.db.exec('COMMIT');
      } catch (e) {
        try { db.db.exec('ROLLBACK'); } catch {}
        console.warn(`[${ZONE_ID}] 🏘️ 건물 실물화 실패(마을은 무건물로 계속):`, e.message);
      }
      console.log(`[${ZONE_ID}] 🏘️ Stage4A 실물화: 큰집 ${state.villages.length}·움집 ${totalHouses}채(6×4)·곳간 → buildings ${totalRows}행(wall/floor, owner npc_simvil_*) + 농지·마당 타일은 청크 활성화 시 비영속(vb*) · ${Date.now() - t0}ms`);
    }

    // --- Stage 4A: 클라 영토 페이로드(welcome 1회) — 경계 셀 flat [dx,dy,mask] or 반경 근사 ---
    state.clientPayload = state.villages.map(v => {
      const e = { id: v.dbId, name: v.name, cx: v.ccx, cy: v.ccy, pop: v.econ.npcs.length, r: v._maxRPx };
      if (v._bnd) e.b = v._bnd; else e.approx = 1;
      e.lon = v._lonOff;   // §19 경도(클라 로컬 태양시 표시 공식용)
      e.tr = Math.round(Math.sqrt(((v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800)) / Math.PI) * SZ);   // §19/§2 영토 크립: econ 영토 등가 반경(px) — 매일 갱신(bnd는 시딩 스냅샷·시각 부채)
      return e;
    });
    {
      const bndN = state.villages.filter(v => v._bnd).length;
      const cells = state.villages.reduce((s, v) => s + (v._bnd ? v._bnd.length / 3 : 0), 0);
      console.log(`[${ZONE_ID}] 🏘️ Stage4A 영토: 경계 ${bndN}/${state.villages.length}곳(셀 ${cells}, ≈${(JSON.stringify(state.clientPayload).length / 1024).toFixed(0)}KB — welcome 1회) · 원근사 폴백 ${state.villages.length - bndN}곳`);
    }
    for (const vil of state.villages) delete vil._bRows; // 수만 행 재참조 방지(메모리)

    // --- 교역 거리 행렬(BFS·지형) 계산·주입 — 시딩·복원 공통(지형 정적, 부팅 1회. 소요는 로그에) ---
    state._distCtx = { ta, ZONE };
    try { computeAndInjectDistMatrix(); } catch (e) { console.warn(`[${ZONE_ID}] 🏘️ BFS 거리행렬 실패 — 유클리드 폴백으로 계속:`, e.message); }

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
    // --- Stage 4A: 직업 배정(부팅 1회 — 클라 접속 전이라 브로드캐스트 불필요, AOI isNew에 실림) ---
    {
      const dist = {};
      for (const vil of state.villages) {
        syncVillageJobs(vil, null);
        for (const pid of vil.npcPids) { const p = deps.players.get(pid); if (p && p.simJob) dist[p.simJob] = (dist[p.simJob] || 0) + 1; }
      }
      const dStr = Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([j, n]) => `${j}${n}`).join(' ');
      console.log(`[${ZONE_ID}] 🏘️ Stage4A NPC 직업 배정(simJob — econ counts 비례·npcJob과 분리): ${dStr || '(스폰 0)'}`);
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
// P3 — 실체 전쟁(집결→행군→전투→궤주) + pid 브릿지 + broadcast + 삼중 코히런스.
//   한 전쟁=정확히 1경로(physical XOR headless). 관측자 근접 시: 지휘관 econDayToMs 페이싱(캐러밴 dormant 동형)·
//   전 병사 pid 인스턴스화(징발=상태전환)·행군 대형(_mu*)·방어 사전 포진(WAR_ALERT_R)·접근 교전(WAR_ENGAGE_R)·
//   battle-core 실시간 스텝·전투유닛→pid 미러(_lbSyncAgents 서버판)·궤주 도보 귀환. 무관측자=headless(war-core daily, 불변).
//   좌표: 마을·대형·지휘관=맵 셀(cx/cy) · pid player=px(×SZ) · 행군로=px(getRoute 재사용).
// =============================================================================
function warCenterPx(vil) { return { x: vil.ccx * SZ + SZ / 2, y: vil.ccy * SZ + SZ / 2 }; }
function warDefCenterPx(w) { return warCenterPx(w.def); }
function _warCmdPx(body) { return { x: body.cmd.cx * SZ, y: body.cmd.cy * SZ }; }   // 지휘관 셀(fractional)→px

// 병종 선발 선호도(랩 _muDraftResidents pref — simJob 도구→병종 매핑 정합).
function _warPref(job, type) {
  if (type === 'archer') return (job === 'hunter' ? 100 : 0) + (job === 'warrior' ? 30 : 0) + (job === 'forager' ? 8 : 0) + 3;
  if (type === 'slinger') return (job === 'forager' ? 100 : 0) + (job === 'hunter' ? 30 : 0) + 3;
  if (type === 'greataxe') return (job === 'lumberjack' ? 100 : 0) + 3;
  if (type === 'militia') return (job === 'cook' ? 60 : 0) + (job === 'merchant' ? 60 : 0) + (job === 'farmer' ? 20 : 0) + 3;
  if (type === 'champion' || type === 'dagger') return (job === 'warrior' ? 100 : 0) + (job === 'smith' ? 40 : 0) + (job === 'weaponsmith' ? 40 : 0) + (job === 'farmer' ? 12 : 0) + 3;
  return (job === 'fisher' ? 100 : 0) + (job === 'miner' ? 90 : 0) + (job === 'mason' ? 90 : 0) + (job === 'farmer' ? 70 : 0) + (job === 'warrior' ? 40 : 0) + 3;   // spear/pike
}
// composition 표본 축소(NPC_SAMPLE 상한 — 물리=샘플, econ 되먹임=war-core 전량).
function _warSampleComp(comp, cap) {
  const MU_TYPES = state.warLive.MU_TYPES; const o = {}; let tot = 0;
  for (const k of MU_TYPES) { o[k] = Math.round(comp[k] || 0); tot += o[k]; }
  if (tot > cap && tot > 0) { const r = cap / tot; for (const k of MU_TYPES) o[k] = Math.round((comp[k] || 0) * r); }
  return o;
}
// ★[징발=상태전환] 마을 pid 에서 병종 선호로 선발 → _muster/_muType/simWar/npcs.delete(AI 정지). units[{type,pid,x,y(셀)}].
//   드래프트 실패(주민 0)=null → 호출측이 표준배치 폴백 or 무저항. ★삼중 코히런스: pid 는 npcPids 에 유지(카운트),
//   simWar 로 movePlayerStep·npcStep(npcs.delete) 제외 · syncVillagePop removeOneNpc 도 _muster 스킵.
function _warDraftPids(vil, comp, seed) {
  const { players, npcs } = state.deps;
  const pool = [];
  for (const pid of vil.npcPids) { const p = players.get(pid); if (!p || p._muster || (p.hp != null && p.hp <= 0)) continue; pool.push(p); }
  if (!pool.length) return null;
  const taken = new Set(); const units = []; const pids = [];
  const order = ['archer', 'slinger', 'champion', 'dagger', 'greataxe', 'spear', 'pike', 'militia'];
  for (const type of order) {
    let need = Math.round(comp[type] || 0); if (need <= 0) continue;
    const cand = []; for (let i = 0; i < pool.length; i++) { if (taken.has(i)) continue; cand.push([i, _warPref(pool[i].simJob, type)]); }
    cand.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (let s = 0; s < need && s < cand.length; s++) {
      const i = cand[s][0]; taken.add(i); const p = pool[i];
      p._muster = true; p._muType = type; p.simWar = true; npcs.delete(p.pid);   // ★AI 정지 + 이동 제외
      units.push({ type, pid: p.pid, x: p.x / SZ, y: p.y / SZ }); pids.push(p.pid);
    }
  }
  return units.length ? { units, pids } : null;
}
// 대형 슬롯으로 즉시 스냅(인스턴스화 순간 그 자리 대형화 — 집을 나온 병사가 행군 열로 나타남).
function _warSnapToSlots(g) {
  if (!g || !g.units) return;
  for (const u of g.units) { if (u.cmd) { u.x = g.cmd.cx; u.y = g.cmd.cy; continue; } const s = state.warLive._muSlotXY(g, u); u.x = s[0]; u.y = s[1]; }
}
// 대형 유닛 맵셀 → pid player 위치(px)·전투 broadcast 메타 갱신. side 0=공격 1=방어. rout=궤주 비트.
function _warSyncSoldiers(body, g, side, rout) {
  if (!g || !g.units) return;
  const players = state.deps.players, MTI = state.warLive.MU_TYPE_INT;
  for (const u of g.units) {
    const p = players.get(u.pid); if (!p) continue;
    const nx = u.x * SZ, ny = u.y * SZ;
    let dvx = (nx - p.x) * 30, dvy = (ny - p.y) * 30; const m = Math.hypot(dvx, dvy); if (m > 400) { dvx = dvx / m * 400; dvy = dvy / m * 400; }
    p.vx = dvx; p.vy = dvy; p.x = nx; p.y = ny;
    p._muType = u.type; p._bt = MTI[u.type] || 0; p._bside = side; p._bcmd = !!u.cmd; p._brout = !!rout;
  }
}
// 몸 생성(캐러밴 body 동형) — 행군로(px)·econ 페이싱(born→eta)·초기 prog(경과 비율). 지휘관 셀=atk center.
function _warEnsureBody(w, now) {
  let body = state.warBodies.get(w.id); if (body) return body;
  if (!w.atk || !w.def) return null;
  let pts = null; try { pts = getRoute(w.atk, w.def); } catch (_) { }
  if (!pts) pts = [{ x: warCenterPx(w.atk).x, y: warCenterPx(w.atk).y }, { x: warCenterPx(w.def).x, y: warCenterPx(w.def).y }];
  body = { w, phase: 'march', pids: [], defPids: [], atkGroup: null, defGroup: null, retGroup: null,
    instantiated: false, defBuilt: false, live: null, _bcAt: 0, _bcPhase: null, _retRout: false,
    heading: Math.atan2(w.def.ccy - w.atk.ccy, w.def.ccx - w.atk.ccx), cmd: { cx: w.atk.ccx, cy: w.atk.ccy } };
  setBodyPts(body, pts);
  const born = (w.born != null ? w.born : state.world.day), eta = (w.eta != null ? w.eta : state.world.day + 1);
  const legDays = Math.max(1, eta - born);
  body.departAt = now; body.arriveAt = Math.max(now + 1, econDayToMs(eta));
  body.pxPerDay = body.len / legDays; body.nomPxMs = body.len / Math.max(1, body.arriveAt - now);
  const bornMs = econDayToMs(born); const frac = Math.max(0, Math.min(1, (now - bornMs) / Math.max(1, body.arriveAt - bornMs)));
  body.prog = body.len * frac;   // 재부팅·늦게 본 행군은 경과 비율만큼 앞서 있음
  const c = caravanPointAt(body, body.prog); body.cmd = { cx: c.x / SZ, cy: c.y / SZ };
  state.warBodies.set(w.id, body);
  return body;
}
// 지휘관 econ 페이싱(캐러밴 페이싱 동형) — 남은거리/남은시간, 상한 명목×4. 셀 갱신 + heading(→목적지).
function _warPaceCommander(body, now, dtMs) {
  const remainPx = body.len - body.prog;
  if (remainPx > 0.5) { const speed = Math.min(remainPx / Math.max(1, body.arriveAt - now), body.nomPxMs * 4); body.prog += Math.min(remainPx, speed * dtMs); }
  const c = caravanPointAt(body, body.prog); body.cmd = { cx: c.x / SZ, cy: c.y / SZ };
  body.heading = Math.atan2(body.w.def.ccy - body.cmd.cy, body.w.def.ccx - body.cmd.cx);
  if (state.roads) state.roads.stampEntityPx(body, c.x, c.y);   // §16 답압(행군 — 지휘관 선. 대형 전체 통행의 근사·병사 개별 스탬프는 movePlayerStep 비경유라 생략 기록)
}
// 공격군 인스턴스화 — 표본 comp 징발 → 대형 빌드 → 슬롯 스냅. instantiated 게이트(1회).
function _warInstantiateAttackers(body) {
  if (body.instantiated) return; body.instantiated = true;
  const w = body.w, WL = state.warLive;
  const comp = _warSampleComp(w.composition || { dagger: Math.max(1, (w.force || 2)) }, WL.MU.NPC_SAMPLE);
  const seed = (((w.id || 1) * 911 + ((w.born || 0) | 0) * 17 + 3) >>> 0);
  const d = _warDraftPids(w.atk, comp, seed); if (!d) return;   // 주민 0 → atkGroup 없음(교전 폴백 or headless)
  const g = WL.buildGroup(d.units, WL._muCompForm(w.composition), { cx: body.cmd.cx, cy: body.cmd.cy }, body.heading, seed);
  if (!g) return; g.cmd = { cx: body.cmd.cx, cy: body.cmd.cy }; g.heading = body.heading;
  body.atkGroup = g; body.pids = d.pids; _warSnapToSlots(g); _warSyncSoldiers(body, g, 0, false);
}
// 방어 사전 포진(WAR_ALERT_R) — 공격 지휘관이 방어 마을권 진입 시 conscript(defense) 표본 징발 → 마을 앞 standoff 포진.
//   ★[2파 작전층·유령 박멸] 방어 3택 게이팅: 태세 hold(버티기)=사전 소집 억제 — assault 결단 적군이 마을권
//   (max(영토반경+40, 경보×0.5)) 진입 시에만 긴급 소집(scramble — 집결지=회관 앞 12셀, 랩 WAR_SCRAM_STANDOFF).
//   respond(응전)=기존 경보 반경 사전 포진 그대로. WAR_OPS=0(P1 폴백)이면 태세 없음 → 구 무조건 포진.
const WAR_SCRAM_STANDOFF = 12;   // 긴급 소집 집결지 = 회관 앞(공격 방향 12셀) — 랩 7919 verbatim
function _warEnsureDefense(body) {
  if (body.defBuilt) return;
  const w = body.w, WL = state.warLive, dc = { cx: w.def.ccx, cy: w.def.ccy };
  const dCmd = Math.hypot(body.cmd.cx - dc.cx, body.cmd.cy - dc.cy);
  let scram = false;
  if (state.war && state.war.OPS_ON && w._defMode === 'hold') {
    if (w.op !== 'assault') return;   // 버티기: 결단 전엔 소집 안 함(농성 — 경제 지속)
    const terrCells = (w.def.econ && w.def.econ.land && w.def.econ.land.size) ? w.def.econ.land.size * 25 : 2800;
    const R = Math.max(Math.sqrt(terrCells / Math.PI) + 40, WL.WAR_ALERT_R * 0.5);
    if (dCmd > R) return;             // 아직 마을권 밖 — 돌격이 임박해야 기상·집결
    scram = true;
  } else if (dCmd > WL.WAR_ALERT_R) return;   // (respond·폴백) 아직 경보 밖
  body.defBuilt = true;
  let dcomp = null; try { const r = state.war.conscript(w.def, 'full', { defense: true }) || state.war.conscript(w.def, 'raid', { defense: true }); dcomp = r && r.composition; } catch (_) { }
  if (!dcomp) return;
  const comp = _warSampleComp(dcomp, WL.MU.NPC_SAMPLE); comp.form = comp.form || WL.MU.DEF_FORM;
  const seed = (((w.id || 1) * 911 + ((w.born || 0) | 0) * 17 + 29) >>> 0);
  const d = _warDraftPids(w.def, comp, seed); if (!d) return;   // 주민 0 → 무저항(war-core walkover가 경제 처리 — 표준배치 유령 없음)
  const th = Math.atan2(body.cmd.cy - dc.cy, body.cmd.cx - dc.cx), so = scram ? WAR_SCRAM_STANDOFF : WL.WAR_DEF_STANDOFF;
  const rally = { cx: dc.cx + Math.cos(th) * so, cy: dc.cy + Math.sin(th) * so };
  const g = WL.buildGroup(d.units, comp.form, rally, th, seed); if (!g) return;
  g.holdPt = { cx: rally.cx, cy: rally.cy };
  g._scram = scram;   // ★긴급 소집 표식(대열 미완 개전 = 위치 산개에서 창발 — 특례 코드 없음)
  if (scram) console.log(`[${state.zoneId}] ⚔️ ${w.def.name} ★긴급 소집(scramble) — 적 돌격 임박(거리 ${dCmd.toFixed(0)}셀): 주민 ${d.pids.length}명 회관 앞 집결(정렬 미완이면 그 자리 그대로 개전)`);
  body.defGroup = g; body.defPids = d.pids;
  if (!scram) _warSnapToSlots(g);   // ★scramble은 스냅 금지 — 자택·작업지에서 집결지로 실이동(_muStepFollow), 공격이 빠르면 산개 개전
  _warSyncSoldiers(body, g, 1, false);
}
// 교전 판정(두 대형 지휘관 WAR_ENGAGE_R) → startLiveBattle(위치승계·origin=중간). force=결단 강제.
//   ★[2파 작전층·자동 개전 폐지] ops 모드에선 assault 결단 없이는 접근만으로 개전하지 않음(랩 8278 교전 게이트).
function _warTryEngage(body, force) {
  const w = body.w, WL = state.warLive;
  if (!force && state.war && state.war.OPS_ON && w.op !== 'assault') return false;   // 결단 전 = 대치만
  if (!body.instantiated || !body.atkGroup) return false;
  const engaged = body.defGroup ? (WL._muCmdDist(body.atkGroup, body.defGroup) <= WL.WAR_ENGAGE_R)
    : (Math.hypot(body.cmd.cx - w.def.ccx, body.cmd.cy - w.def.ccy) <= WL.WAR_ENGAGE_R);
  if (!engaged && !force) return false;
  if (state.warLive.startLiveBattle(w, { atkGroup: body.atkGroup, defGroup: body.defGroup })) {
    body.phase = 'battle'; body.live = w._live; w.phase = 'battle'; return true;
  }
  return false;
}
// war_battle 집계 broadcast(throttle 2Hz + phase 전이) — 스펙테이터 HUD·화면밖 지시자.
function _warBroadcastBattle(body, now, phase) {
  const lb = body.live, w = body.w; if (!lb) return;
  const ac = state.warLive.aliveCounts(lb), o = lb.mapOrigin || { cx: w.def.ccx, cy: w.def.ccy };
  state.deps.broadcast({ type: 'war_battle', id: lb.id, origin: { x: o.cx * SZ, y: o.cy * SZ },
    atk: w.atk.name, def: w.def.name, casus: w.casus, aliveA: ac.aliveA, aliveB: ac.aliveB, phase: phase || 'battle' });
  body._bcAt = now; body._bcPhase = phase || 'battle';
}
// 전투유닛→pid 미러(매 프레임) + war_battle throttle broadcast.
function _warSyncBattleMirror(body, now) {
  const lb = body.live; if (!lb) return;
  const mirror = state.warLive.syncMirror(lb);
  if (mirror) {
    const players = state.deps.players, MTI = state.warLive.MU_TYPE_INT;
    for (const mm of mirror) {
      const p = players.get(mm.pid); if (!p) continue;
      const nx = mm.cx * SZ, ny = mm.cy * SZ;
      let dvx = (nx - p.x) * 30, dvy = (ny - p.y) * 30; const mag = Math.hypot(dvx, dvy); if (mag > 400) { dvx = dvx / mag * 400; dvy = dvy / mag * 400; }
      p.vx = dvx; p.vy = dvy; p.x = nx; p.y = ny;
      p.hp = mm.dead ? 0 : Math.max(1, Math.round((mm.hp / Math.max(1, mm.hpMax)) * (p.maxHp || 100)));   // 전투 hp 비율→player maxHp (maxHp 불변)
      p._muType = mm.type; p._bt = MTI[mm.type] || 0; p._bside = (mm.side === 'A' ? 0 : 1); p._bcmd = !!mm.cmd; p._brout = !!mm.rout;
    }
  }
  if (now - body._bcAt >= WAR_BC_MS || body._bcPhase !== 'battle') _warBroadcastBattle(body, now, 'battle');
}
// 결판 훅(war-live onResolved, splice 전) — 최종 미러로 사상 despawn(샘플 타겟)·방어 생존 해제·공격 생존 귀환(궤주) 설정.
function _warOnResolved(lb) {
  const w = lb.war, body = state.warBodies.get(w.id);
  const mirror = state.warLive.syncMirror(lb) || [];
  const players = state.deps.players;
  const atkSurv = [], defSurv = [], deadA = [], deadB = [];
  for (const mm of mirror) { if (!players.has(mm.pid)) continue;
    if (mm.dead) (mm.side === 'A' ? deadA : deadB).push(mm.pid);   // despawn은 포로 전환 뒤(아래) — econ 전량은 war-core warKill 소유
    else (mm.side === 'A' ? atkSurv : defSurv).push(mm.pid);
  }
  // ★[3파 포로 §18 — 호송 표본] warResolveBattle이 남긴 _capResolve(포로 econ 이전 완료분)를 화면 층으로:
  //   패자측 '사상 미러' pid 중 포로 수만큼 despawn 대신 승자 마을로 이관(npcPids·simVillageId — econ 이전과 방향 일치)
  //   + simCaptive(회색 링). 승자=공격이면 귀환 그룹에 동반 도보. ※표본 근사(정직): pid는 econ npc와 1:1이 아니라
  //   '수'만 일치시킴 — 이후 탈출·동화·몸값의 화면 반영은 syncVillagePop 재수렴이 흡수(고아 없음).
  const escort = [];
  if (w._capResolve && w._capResolve.npcs && w._capResolve.npcs.length) {
    const loserDead = (w._capResolve.side === 'A') ? deadA : deadB;
    const winnerVil = (w._capResolve.side === 'A') ? w.def : w.atk;
    const n = Math.min(w._capResolve.npcs.length, loserDead.length);
    for (let k = 0; k < n; k++) {
      const pid = loserDead.pop(); const p = players.get(pid); if (!p) continue;
      p.simCaptive = 1; p._brout = false; p.hp = Math.max(1, Math.round((p.maxHp || 100) * 0.4));   // 기절→끌려감(빈사 회복)
      const oldVil = (p.simVillageId != null) ? state.byDbId.get(p.simVillageId) : null;
      if (oldVil) { const kk = oldVil.npcPids.indexOf(pid); if (kk >= 0) oldVil.npcPids.splice(kk, 1); }
      p.simVillageId = winnerVil.dbId; winnerVil.npcPids.push(pid);
      escort.push(pid);
    }
    w._capResolve = null;   // 소비(1회)
  }
  for (const pid of deadA) _warDespawnPid(pid);   // ★사상=샘플 pid despawn(종전 후 syncVillagePop 재수렴)
  for (const pid of deadB) _warDespawnPid(pid);
  try { const ac = state.warLive.aliveCounts(lb), o = lb.mapOrigin || { cx: w.def.ccx, cy: w.def.ccy };
    state.deps.broadcast({ type: 'war_battle', id: lb.id, origin: { x: o.cx * SZ, y: o.cy * SZ }, atk: w.atk.name, def: w.def.name, casus: w.casus, aliveA: ac.aliveA, aliveB: ac.aliveB, phase: 'resolved' }); } catch (_) { }
  const atkWon = !(lb._resWinner && lb._resWinner !== 'A');
  const atkParty = atkWon ? atkSurv.concat(escort) : atkSurv;    // 공격승=포로가 공격 귀환에 동반(호송)
  if (!body) { for (const pid of atkParty) _warReleasePid(pid); for (const pid of defSurv) _warReleasePid(pid); if (!atkWon) for (const pid of escort) _warReleasePid(pid); return; }
  for (const pid of defSurv) _warReleasePid(pid);   // 방어 생존 = 마을 앞 → 즉시 해제(일상 복귀)
  if (!atkWon) for (const pid of escort) _warReleasePid(pid);    // 방어승=포로(공격병 출신)는 방어 마을에서 그 자리 해제(억류 — cap 링 유지)
  body.defGroup = null; body.defPids = [];
  if (atkParty.length) _warSetupReturn(body, atkParty, lb, !atkWon);   // 공격 생존(+호송 포로) = 도보 귀환(패=궤주)
  else _warCleanupBody(body, false);
}
// 공격 생존자 귀환(도보) 설정 — 반환 route(def→atk)·marchDays 페이싱·산개(open) 그룹.
function _warSetupReturn(body, survPids, lb, isRout) {
  const w = body.w, WL = state.warLive, players = state.deps.players;
  body.phase = 'return'; body.pids = survPids.slice(); body.live = null; body._retRout = !!isRout; body.atkGroup = null;
  let pts = null; try { pts = getRoute(w.def, w.atk); } catch (_) { }
  if (!pts) { pts = []; for (let i = body.pts.length - 1; i >= 0; i--) pts.push(body.pts[i]); }
  setBodyPts(body, pts);
  const now = state._warTickAt || Date.now(), legDays = Math.max(1, w.marchDays || 1);   // ★단일 시계원(tickWarBodies 앵커) — onResolved 은 now 인자 없어 여기서 최신 틱 시각 참조(운영=Date.now, 테스트=sim now 일관)
  body.departAt = now; body.arriveAt = Math.max(now + 1, econDayToMs(state.world.day + legDays));
  body.pxPerDay = body.len / legDays; body.nomPxMs = body.len / Math.max(1, body.arriveAt - now);
  const c = caravanPointAt(body, 0); body.cmd = { cx: c.x / SZ, cy: c.y / SZ }; body.heading = Math.atan2(w.atk.ccy - body.cmd.cy, w.atk.ccx - body.cmd.cx);
  const units = []; for (const pid of survPids) { const p = players.get(pid); if (!p) continue; units.push({ type: p._muType || 'militia', pid, x: p.x / SZ, y: p.y / SZ }); }
  body.retGroup = units.length ? WL.buildGroup(units, 'open', { cx: body.cmd.cx, cy: body.cmd.cy }, body.heading, (w.id || 1) * 523 + 7) : null;
  if (body.retGroup) _warSyncSoldiers(body, body.retGroup, 0, isRout);
}
// 귀환 페이싱 + 도착 시 해제·정리.
function _warPaceReturn(body, now, dtMs) {
  const remainPx = body.len - body.prog;
  if (remainPx <= 0.5 || !body.retGroup) { _warCleanupBody(body, true); return; }
  const speed = Math.min(remainPx / Math.max(1, body.arriveAt - now), body.nomPxMs * 4);
  body.prog += Math.min(remainPx, speed * dtMs);
  const c = caravanPointAt(body, body.prog); body.cmd = { cx: c.x / SZ, cy: c.y / SZ };
  body.heading = Math.atan2(body.w.atk.ccy - body.cmd.cy, body.w.atk.ccx - body.cmd.cx);
  if (state.roads) state.roads.stampEntityPx(body, c.x, c.y);   // §16 답압(귀환 행군)
  body.retGroup.cmd = { cx: body.cmd.cx, cy: body.cmd.cy }; body.retGroup.heading = body.heading;
  state.warLive._muStepFollow(body.retGroup, state.warLive.MU.FOLLOW_CAP);
  _warSyncSoldiers(body, body.retGroup, 0, body._retRout);
}
// 사상 pid despawn(샘플 타겟) — players/npcs delete + npcPids 제거 + player_left(canadia 패턴).
function _warDespawnPid(pid) {
  const { players, npcs, broadcast } = state.deps; const p = players.get(pid);
  players.delete(pid); npcs.delete(pid);
  if (p && p.simVillageId != null) { const vil = state.byDbId.get(p.simVillageId); if (vil) { const k = vil.npcPids.indexOf(pid); if (k >= 0) vil.npcPids.splice(k, 1); } }
  broadcast({ type: 'player_left', pid });
}
// 출정 해제(생존 귀환·해산) — _muster/simWar 해제 + npcs.add(AI 복귀) + hp 회복. pid 는 npcPids 유지(syncVillagePop 재수렴).
function _warReleasePid(pid) {
  const { players, npcs } = state.deps; const p = players.get(pid); if (!p) return;
  p._muster = false; p._muType = null; p.simWar = false; p._brout = false; p._bcmd = false; p._bt = undefined; p._bside = undefined;
  p.hp = p.maxHp || 100; p.vx = 0; p.vy = 0; npcs.add(pid);
}
// 몸 정리(귀환 완료·고아) — 잔존 pid 해제 후 삭제.
function _warCleanupBody(body, releaseRemaining) {
  if (releaseRemaining) { for (const pid of (body.pids || [])) _warReleasePid(pid); for (const pid of (body.defPids || [])) _warReleasePid(pid); }
  state.warBodies.delete(body.w.id);
}

// ★[야생 전역위협] warThreats() — 활동 중(행군·전투·귀환) 실체 병사 pid 위치(px) 수집 → wildlife agrid 주입.
//   전쟁실험실 _buildWarThreats 서버판. wildlife.js:117 '플레이어 push=전 종 반응' 인터페이스에 Wildlife.init(warThreats) 로 연결.
function warThreats() {
  if (!state.ready || !state.warBodies || !state.warBodies.size) return null;
  const players = state.deps.players;
  const buf = state._warThreatBuf || (state._warThreatBuf = []); buf.length = 0;
  for (const body of state.warBodies.values()) {
    const add = (pids) => { if (!pids) return; for (const pid of pids) { const p = players.get(pid); if (p && (p.hp == null || p.hp > 0)) buf.push({ x: p.x, y: p.y }); } };
    add(body.pids); add(body.defPids);
  }
  return buf.length ? buf : null;
}

// tickWarBodies — 30Hz: 행군 몸 페이싱·인스턴스화·방어 포진·교전 + 진행 전투 스텝·미러·broadcast + 귀환.
//   idle 존 스킵보다 앞(onGameTick 최상단)이라 무인 존에서도 완주(관측자 떠나도 서버가 결판까지). 캐러밴 tickBodies 동형.
function tickWarBodies(now) {
  if (!state.war || !state.warLive) { state._warTickAt = now; return; }
  const dtMs = Math.min(500, Math.max(1, now - (state._warTickAt || now)));   // 슬립·히치 dt 상한(캐러밴 규칙 동형)
  state._warTickAt = now;
  const WARS = state.war.WARS;
  if (!WARS.length && !state.warBodies.size) return;   // 조용(전쟁·몸 없음)
  const anyViewerNear = state.deps && state.deps.anyViewerNear;
  const nearFn = (typeof anyViewerNear === 'function') ? anyViewerNear : (() => false);
  const WL = state.warLive, liveWid = new Set();
  // 1) march 전쟁: 몸 페이싱·관측자 근접 인스턴스화·방어 포진·교전
  for (const w of WARS) {
    if (w.id != null) liveWid.add(w.id);
    if (w.phase !== 'march') continue;
    let body = state.warBodies.get(w.id);
    if (!body) {   // 몸 없음 — 관측자 근접(양 끝 마을) 시에만 생성(LOD·상한). 아니면 무실체(headless는 eta sweep/daily).
      let near = false; try { near = nearFn(warCenterPx(w.atk), WAR_LOD_VIEW_PX) || nearFn(warCenterPx(w.def), WAR_LOD_VIEW_PX); } catch (_) { }
      if (!near || state.warBodies.size >= WAR_BODY_MAX) continue;
      body = _warEnsureBody(w, now); if (!body) continue;
    }
    _warPaceCommander(body, now, dtMs);
    let near = false; try { near = nearFn(_warCmdPx(body), WAR_LOD_VIEW_PX) || nearFn(warCenterPx(w.def), WAR_LOD_VIEW_PX); } catch (_) { }
    if (near) { _warInstantiateAttackers(body); _warEnsureDefense(body); }
    if (body.instantiated && body.atkGroup) {
      body.atkGroup.cmd = { cx: body.cmd.cx, cy: body.cmd.cy }; body.atkGroup.heading = body.heading;
      WL._muStepFollow(body.atkGroup, WL.MU.FOLLOW_CAP); _warSyncSoldiers(body, body.atkGroup, 0, false);
      if (body.defGroup) { WL._muDefHold(body.defGroup, body.atkGroup.cmd); _warSyncSoldiers(body, body.defGroup, 1, false); if (body.defGroup._scram) _warEvacVillage(w.def, now); }   // ★긴급 소집 중 비전투원 대피
      _warTryEngage(body, false);
    }
  }
  // 2) 진행 전투 스텝(실dt) → 결판(onResolved 훅) · 미러 + broadcast(전이·throttle)
  if (WL.count) {
    WL.stepLiveBattles(dtMs / 1000);
    for (const body of state.warBodies.values()) { if (body.phase === 'battle' && body.live && WL.hasLive(body.w)) { _warSyncBattleMirror(body, now); _warEvacVillage(body.w.def, now); } }
  }
  // 3) 귀환 페이싱 + 고아(WARS 이탈 비귀환) 정리
  for (const body of [...state.warBodies.values()]) {
    if (body.phase === 'return') { _warPaceReturn(body, now, dtMs); continue; }
    // ★[2파 작전층] 전투 없이 종결(철수·무혈 항복·무저항 함락 — war.phase='return')된 몸: 병사 그 자리 해제 →
    //   일상 AI 도보 귀가(npcHome 경로 — 서버판 '전투 없는 도보 귀환'. 랩 _retFromMarchGroup 대형 행군은 실체 부채로 기록).
    if (body.phase !== 'battle' && body.w.phase === 'return') { _warCleanupBody(body, true); continue; }
    if (body.w.id != null && !liveWid.has(body.w.id) && body.phase !== 'battle') _warCleanupBody(body, true);   // war 종결·이탈 — 잔존 해제
  }
}
// ★[2파·비전투원 대피 _evac 최소판] 전투·긴급 소집 중 방어 마을의 비징발 주민 = 귀가·자택 대기.
//   소프트 TTL(5초) 집합 대사 — 매 프레임 재설정이라 누수 0, 종결 시 자동 해제(랩 _warEvacTick 계약).
//   실행 지점은 zone.js npcStep(simEvacUntil 게이트 1줄 — 목표를 자택으로 고정). econ 무접촉(화면 게이트 전용).
function _warEvacVillage(vil, now) {
  if (!vil || !vil.npcPids) return;
  const players = state.deps.players;
  for (const pid of vil.npcPids) { const p = players.get(pid); if (!p || p._muster) continue; p.simEvacUntil = now + 5000; }
}
// warLodResolveSweep — econ 경계에서 eta 도달 march 전쟁을 physical XOR headless 로 분기. ★반드시 daily() 앞.
//   관측자 근접이면 여기서 실체 개전(몸·징발·포진·교전 강제) → w.phase='battle'로 daily headless 선점. 아니면 phase='march' 유지 → daily headless(war-core 불변).
//   징발 실패(주민 0/샘플 공백)면 phase='march' 유지 → daily headless 폴백(1경로 보장).
function warLodResolveSweep() {
  if (!state.war || !state.warLive) return { physical: 0, considered: 0 };
  const anyViewerNear = state.deps && state.deps.anyViewerNear;
  const now = state._warTickAt || Date.now();   // ★단일 시계원(tickWarBodies 30Hz 앵커) — 같은 onGameTick 틱의 now 계승(econ 페이싱 일관)
  let physical = 0, considered = 0;
  for (const w of state.war.WARS) {
    if (w.phase !== 'march' || state.world.day < w.eta || w._live) continue;   // eta 미도달·이미 실체는 스킵
    considered++;
    if (typeof anyViewerNear !== 'function') continue;   // dep 없으면 전부 headless(daily)
    let near = false; try { near = anyViewerNear(warDefCenterPx(w), WAR_LOD_VIEW_PX); } catch (_) { near = false; }
    if (!near) continue;                                  // 무관측자 → headless(daily 경로)
    let body = state.warBodies.get(w.id);
    if (!body) { if (state.warBodies.size >= WAR_BODY_MAX) continue; body = _warEnsureBody(w, now); if (!body) continue; }
    _warPaceCommander(body, now, 1); _warInstantiateAttackers(body); _warEnsureDefense(body);
    if (_warTryEngage(body, true)) physical++;   // 성공 → phase='battle'(daily skip). 실패(주민0) → phase='march' 유지(daily headless)
  }
  return { physical, considered };
}

// =============================================================================
// onGameTick — gameLoop(30Hz)에서 매 틱 호출되는 훅. 게임일 경계에서만 일함.
// 평시 비용: ready/정수 비교 O(1). 경계 갭>1(서버 슬립)이어도 1틱만 — 실시간 앵커.
// =============================================================================
function onGameTick(now) {
  if (!state.ready) return; // 플래그 off·비대상 존·init 실패 전부 여기서 차단
  // Stage 4B: 캐러밴 실체 30Hz 전진 — zone.js idle 존 스킵보다 앞(호출 위치)이라 무인 존에서도 econ과 동행.
  //   도착 임박 가드가 아래 경계 econ 틱보다 먼저 돌아 'econ이 몸을 앞지르는' 순서 역전이 없다.
  try { tickCaravanBodies(now); } catch (e) { console.error(`[${state.zoneId}] 🐂 캐러밴 실체 틱 실패:`, e.message); }
  // P2: 실체 전투 30Hz 스텝 — 캐러밴 직후(설계 위치). 무인 존에서도 진행 중 전투 완주(idle 스킵보다 앞).
  try { tickWarBodies(now); } catch (e) { console.error(`[${state.zoneId}] ⚔️ 실체 전투 틱 실패:`, e.message); }
  // ★[곳간② 클라 표시] 물리 재고 델타 방송(1초 스로틀 — 변한 곳간만). 실패해도 틱을 죽이지 않는다.
  try { _granBroadcast(now); } catch (e) { console.error(`[${state.zoneId}] 🏘️ 곳간 재고 방송 실패:`, e.message); }
  // ★[10차 T4 장마당] 캐러밴 체류(phase='linger') 집합이 바뀔 때만 방송 — 평시 O(캐러밴 수) 비교 1회
  try { _mktBroadcast(); } catch (e) { console.error(`[${state.zoneId}] 🏪 장마당 플래그 방송 실패:`, e.message); }
  // ★자정 스파이크 분산: DB 직렬화(마을당 ~10KB JSON — 자정 틱 비용의 주범)는 이후 틱에 1마을/틱씩 배수(drain).
  //   econ 틱 자체는 일괄 유지 — 교역(tickWorldV2)이 마을 간 원자적이라 쪼개면 정합이 깨짐. 30Hz 예산(33ms) 보호.
  if (state.saveQueue && state.saveQueue.length) {
    const vil = state.saveQueue.shift();
    try { state.db.updateVillageState(vil.dbId, serializeEcon(vil.econ), vil.econ.npcs.length, state.world.day); } catch (e) { console.error(`[${state.zoneId}] 🏘️ 마을 저장 실패(재큐):`, e.message); state.saveQueue.push(vil); }
  }
  const day = gameDayOf(now);
  if (day <= state.lastGameDay) return;
  state.lastGameDay = day;
  try {
    const t0 = Date.now();
    // ★[2파 테스트 훅] WAR_FIXTURE — 운영 무설정. WAR_FIXTURE_DAY(기본 1)≥ 첫 경계에 1회(침묵 창 밖 — 로그 가시·당일 daily가 소비).
    if (process.env.WAR_FIXTURE && !state._warFixtured && state.war && state.world.day >= (parseInt(process.env.WAR_FIXTURE_DAY || '', 10) || 1)) {
      state._warFixtured = true;
      try { _applyWarFixture(process.env.WAR_FIXTURE); } catch (e) { console.error(`[${state.zoneId}] ⚔️ [FIXTURE] 실패:`, e.message); }
    }
    // econ 1일 틱 — tickWorldV2 내부 로그(캐러밴·회복 등)는 침묵시키고 아래 요약 1줄만.
    //   (헤드리스 하네스 regression-check 126행과 같은 검증된 패턴)
    const _log = console.log;
    console.log = () => {};
    try {
      state.econV2.tickWorldV2(state.world);
      // P2 LOD: ★[2파 작전층] ops 모드에선 eta 스윕 폐지(자동 개전 폐지) — 실체 승격은 daily 안의 onEngage 훅이
      //   assault/sortie '결단' 시점에만 수행. WAR_OPS=0 폴백일 때만 구 스윕(eta 도달 즉시 승격) 유지.
      if (state.warLive && !(state.war && state.war.OPS_ON)) { const lr = warLodResolveSweep(); if (lr.physical) state._warPhysToday = (state._warPhysToday || 0) + lr.physical; }
      // P1: 전쟁 econ 층 — tickWorldV2 직후 구동(오늘 세운 동원정지/봉쇄/원한제재가 내일 틱에 반영). phase='battle'는 skip(실체 진행 중).
      if (state.war) state.war.daily(state.world.day);
    } finally { console.log = _log; }
    // ★[2파] 전쟁 링 버퍼 드레인(테스트 훅 — VILLAGE_WAR_LOG=1): 침묵 창(tickWorldV2 스왑) 안에서 적재된
    //   작전층 이벤트(도착·결단·포위·항복·함락)를 게임일 1회 방출. 운영 기본 무설정=기존 요약 1줄 그대로.
    if (process.env.VILLAGE_WAR_LOG === '1' && state.war) {
      const wl = state.war.stats().log; const from = state._warLogN || 0;
      for (let li = from; li < wl.length; li++) console.log(`[${state.zoneId}] ⚔️ ${wl[li]}`);
      state._warLogN = wl.length;
      if (state._warFixtureDef) { // 봉쇄 econ 효과 관측(픽스처 방어 마을 곳간·훅 상태 — 테스트 전용)
        const D = state._warFixtureDef.econ, S2 = D.storage || {};
        const fd = ((S2.food || 0) + (S2.fish || 0) + (S2.meat || 0) + (S2.cooked_food || 0) + (S2.vegetable || 0)) / Math.max(1, D.npcs.length);
        console.log(`[${state.zoneId}] ⚔️ [관측] D${state.world.day} ${state._warFixtureDef.name}: 곳간 ${fd.toFixed(1)}일치 · 봉쇄=${D._siegeBlock ? 'ON' : 'off'} · 야외×${D._siegeOutMul != null ? D._siegeOutMul : 1} · 인구 ${D.npcs.length}`);
      }
    }
    let econPop = 0, npcCount = 0;
    const jobChanges = {}; // Stage 4A: 이번 게임일 직업 재동기 변경분(pid→job)
    const pops = {};       // Stage 4A: 마을 econ 인구(영토 라벨 갱신용)
    for (const vil of state.villages) {
      econPop += vil.econ.npcs.length;
      syncVillagePop(vil, POP_SYNC_PER_DAY); // 완만 반영: ±POP_SYNC_PER_DAY/일
      syncVillageJobs(vil, jobChanges);      // Stage 4A: econ counts 비례 재동기(신규 스폰 포함)
      npcCount += vil.npcPids.length;
      pops[vil.dbId] = vil.econ.npcs.length;
    }
    // Stage 4A: 일 1회 브로드캐스트 — 직업 변경분 + 마을 인구(클라 영토 라벨·이름 옆 이모지 갱신).
    //   clientPayload의 pop도 갱신(새 welcome 수신자 최신화). 접속자 0이어도 broadcast는 no-op 수준.
    const terr = {};   // §19/§2 영토 크립(4파): econ land.size는 매일 자람(1셀 단위 구매) — 등가 반경(px)을 클라에 동기.
    for (const vil of state.villages) terr[vil.dbId] = Math.round(Math.sqrt(((vil.econ.land && vil.econ.land.size ? vil.econ.land.size * 25 : 2800)) / Math.PI) * SZ);
    for (const cv of (state.clientPayload || [])) { if (pops[cv.id] != null) cv.pop = pops[cv.id]; if (terr[cv.id] != null) cv.tr = terr[cv.id]; }
    state.deps.broadcast({ type: 'sim_village_day', day: state.world.day, jobs: jobChanges, pops, terr });
    // Stage 4B: econ 캐러밴 집합 ↔ 실체 동기(스폰·도착 전이·회수) — econ 틱 직후라 상태가 최신
    const carSync = syncCaravanBodies(now);
    state.saveQueue = state.villages.slice(); // 저장은 다음 틱부터 1마을/틱 — 19마을이면 0.63초에 걸쳐 완료(게임일 600s 대비 무시)
    for (const vil of state.villages) { try { _lifeDaily(vil); } catch (e) { console.error(`[${state.zoneId}] 생활층 일일 훅 실패(${vil.name}):`, e.message); } }   // ★[생활 층] 크루 리셋·신축 판단 — econ 틱 직후(읽기 전용 결합)
    if (state.distDirty) { // 무효화 훅(스텁) 소비 — 게임일 경계(자정 큐 세팅 뒤) 전쌍 재계산. 건물 변화는 드물어 일 1회면 족함(정밀화는 Stage 4 — 위 훅 주석).
      state.distDirty = false;
      try { computeAndInjectDistMatrix('무효화 재계산'); } catch (e) { console.error(`[${state.zoneId}] 🏘️ BFS 거리행렬 재계산 실패(기존 행렬 유지):`, e.message); }
    }
    console.log(`[${state.zoneId}] 🏘️ 마을 econ day ${state.world.day}: 인구 ${econPop} · 스폰 NPC ${npcCount} · 캐러밴 실체 ${state.caravanBodies ? state.caravanBodies.size : 0}/${state.world.caravans.length}(+${carSync.spawned} 도착${carSync.arrived} 회수${carSync.removed}) · 저장큐 ${state.saveQueue.length}행 분산 · ${Date.now() - t0}ms`);
    // P1: 전쟁 활동 요약(활동 있을 때만 1줄 — 선포·전투·조공·활성전쟁) + P2 실체 전투(진행 중·오늘 승격 수)
    if (state.war) { const ws = state.war.stats(); const live = state.warLive ? state.warLive.count : 0; const physToday = state._warPhysToday || 0; if (ws && (ws.active || live || (ws.log && ws.log.length))) { const bc = ws.byCasus || {}; console.log(`[${state.zoneId}] ⚔️ 전쟁 day ${state.world.day}: 선포 ${ws.decl}[교역${bc.trade || 0}·영토${bc.territory || 0}·위신${bc.prestige || 0}·응징${bc.feud || 0}] 전투 ${ws.battle}(공승${ws.atkWin}/방승${ws.defWin}) 사상 ${ws.cas} 노획 ${ws.weaponLoot || 0} · 활성 ${ws.active} 조공 ${ws.tributes} · 실체 진행 ${live}${physToday ? ' 오늘승격 ' + physToday : ''}`); } state._warPhysToday = 0; }
  } catch (e) {
    console.error(`[${state.zoneId}] 🏘️ 마을 econ 틱 실패 (다음 경계에 재시도):`, e.message);
  }
}

// =============================================================================
// ★[2파 테스트 훅 — 운영 무설정] WAR_FIXTURE=siege|assault|auto: 첫 여건(day≥2)에 최대 마을→최근접 이웃
//   선전포고를 강제(공격측 전사·군량·무기 보정 + 방어측 시나리오 세팅) — 작전층 상태기계 실발화 스모크 전용(/tmp DB).
//   실경로 그대로(warMobilize→march→camp 결단→siege/assault→항복/전투/철수) — 우회 주입 없음.
// =============================================================================
function _applyWarFixture(kind) {
  const vils = state.villages.filter(v => v.econ && v.econ.npcs.length >= 6);
  if (vils.length < 2) { console.log(`[${state.zoneId}] ⚔️ [FIXTURE] 마을 부족(6명+ ${vils.length}곳) — 스킵`); return; }
  // 사거리(520셀) 내 최근접 쌍 — 공격=쌍 중 다수 인구 쪽(도달 가능 전쟁 보장)
  let V = null, U = null, bd = 1e18;
  for (let i = 0; i < vils.length; i++) for (let j = i + 1; j < vils.length; j++) {
    const d = Math.hypot(vils[i].ccx - vils[j].ccx, vils[i].ccy - vils[j].ccy);
    if (d < bd) { bd = d; V = vils[i]; U = vils[j]; }
  }
  if (!V || bd > 520) { console.log(`[${state.zoneId}] ⚔️ [FIXTURE] 사거리(520셀) 내 쌍 없음(최근접 ${bd | 0}셀) — 스킵`); return; }
  if (U.econ.npcs.length > V.econ.npcs.length) { const t = V; V = U; U = t; }
  const e = V.econ;
  const mkWar = (ee, n) => { let mk = 0; for (const npc of ee.npcs) { if (mk >= n) break; if (npc.currentJob !== 'warrior') { if (ee.counts) { ee.counts[npc.currentJob] = Math.max(0, (ee.counts[npc.currentJob] || 0) - 1); ee.counts.warrior = (ee.counts.warrior || 0) + 1; } npc.currentJob = 'warrior'; } mk++; } };
  mkWar(e, 6); // 전사 확보(counts 정합 유지 — 다음 픽커 틱이 재조정해도 개전은 즉시라 무해)
  e.storage.food = (e.storage.food || 0) + 900; e.storage.weapon = (e.storage.weapon || 0) + 20; e.storage.armor = (e.storage.armor || 0) + 8;
  if (kind === 'assault' || kind === 'auto') { const D = U.econ; mkWar(D, 4); D.storage.weapon = (D.storage.weapon || 0) + 10; } // 본격전 규모(목표배수 역산이 병력을 키움 — 사상·포로 발화)
  if (kind === 'siege') { const D = U.econ; for (const r of ['food', 'fish', 'meat', 'cooked_food', 'vegetable']) if (D.storage[r]) D.storage[r] = 0; U._defPolicy = 'hold'; } // 곳간 바닥+농성 → 봉쇄·항복 경로
  if (kind === 'siegehold') { U.econ.storage.food = (U.econ.storage.food || 0) + 900; U._defPolicy = 'hold'; } // 곳간 넉넉+농성 → 항복 없음 → 팩 소진 철수 경로
  const ok = state.war.warMobilize(V, U, 'trade', bd, state.world.day);
  if (ok && kind !== 'auto') { const w = state.war.WARS[state.war.WARS.length - 1]; if (w && w.atk === V) w._opPolicy = (kind === 'assault') ? 'assault' : 'siege'; }
  state._warFixtureDef = U;
  console.log(`[${state.zoneId}] ⚔️ [FIXTURE=${kind}] ${V.name}(${e.npcs.length}명)→${U.name}(${U.econ.npcs.length}명) 선포 ${ok ? '성공' : '실패(plan 미달)'} · 거리 ${bd | 0}셀`);
}

// =============================================================================
// P3 헤드리스 검증 훅(테스트 전용·additive — 운영 경로 무영향). 실제 오케스트레이션 함수(tickWarBodies/
//   warLodResolveSweep/warThreats/syncVillagePop/removeOneNpc/spawnOneNpc/_warOnResolved…)를 in-memory 목
//   state 로 구동해 pid 브릿지·삼중 코히런스·접근교전·broadcast 구조를 헤드리스로 검증. sim/_p3-war-probe.js 사용.
//   (운영 부팅 경로는 init()만 호출하므로 이 함수는 절대 실행되지 않음 — 순수 export.)
// =============================================================================
function __p3Bind(mock) {
  Object.assign(state, mock);
  return {
    state, tickWarBodies, warLodResolveSweep, warThreats, syncVillagePop, removeOneNpc, spawnOneNpc,
    _warOnResolved, _warDraftPids, _warReleasePid, econDayToMs, _warEnsureBody, _warSampleComp,
  };
}

// =============================================================================
// §11 도적(server/bandits.js) — 좁은 접점(추가 전용·행동 무변경): 도적 모듈이 재사용하는
//   마을 목록(econ 포함)·econ world(훅 설치 대상)·지형 어댑터·교역로 A*(getRoute — 캐러밴과
//   동일 코스그리드·캐시 공유)·존 시드. villages 준비 전엔 null(도적은 lazy 대기).
//   ENABLE_VILLAGES=0 → state.ready=false → 항상 null = 도적 자동 휴면(마을 없이 도적 정의 불가).
// =============================================================================
function banditHost() {
  if (!state.ready) return null;
  const ZONE = state._distCtx && state._distCtx.ZONE;
  return {
    zoneId: state.zoneId,
    villages: state.villages,                        // [{dbId,name,ccx,ccy,econ,...}] — world.villages와 같은 순서(거리행렬 인덱스 정합)
    world: state.world,                              // econ world — banditRouteRisk/onBanditLoot 설치 대상(_distMatrix 조회)
    ta: state._distCtx && state._distCtx.ta,         // 지형 어댑터(isBlocked/forestMult — 셀 단위)
    getRoute,                                        // 마을쌍 경로 pts(px) — 캐러밴 A*·캐시 재사용(랩 getTradePath 동형)
    broadcast: state.deps && state.deps.broadcast,
    // ★[2파 도적 실체] 소굴 배회 NPC용 — 기존 스폰/제거 경로 재사용(발명 금지·캐러밴 관례)
    spawnNpc: state.deps && state.deps.spawnNpc,
    players: state.deps && state.deps.players,
    npcs: state.deps && state.deps.npcs,
    seed: state.villageSeed || 1020,
    cellsW: ZONE ? Math.ceil(ZONE.zoneWidth / SZ) : 0,
    cellsH: ZONE ? Math.ceil(ZONE.zoneHeight / SZ) : 0,
  };
}

// =============================================================================
// ★[생활 층 이관 ②③④ — 랩 동형(war 7759~7798 개간·6122 addHouseSite·건설 크루), 2026-07-27]
//   원칙: econ=진실(읽기 전용 결합 — 회귀 절대 보호), NPC 작업=실체 표현. 식량 이중 계상 금지
//   (랩 s.food 생활 층 식량은 이식하지 않음 — 서버 식량은 econ storage가 유일).
//   ② 개간: needLand(식량 120일치 글럿 정지 + 개간수<인구×landNeedPer) → frontier(기개간 인접
//      논 존닝 + 밭 창발 _batEligible) → 농부가 현장 도보 → 노동 누적 → farmland/dryfield 행
//      영속 + 라이브 타일. ③ 신축: 수용력(채당 HOUSE_CAP) 압박 → addHouseSite 동형 점수식
//      (HALL_CLEAR·간격 18·부지 원판 무결·물가 K/d²·2패스 잠식·granClear) → hut_site(플레이어
//      4단계 공정과 동일 규약) → 크루 시공 → 완공=data.hut 실체화+마당 타일. ④ 농부 실작업:
//      낮에 자기 마을 농지 셀을 결정론 순회(현장 왕복 — 겉보기 도넛 배회 대체).
//   구DB(terr 행 없음)=생활층 휴면. 재부팅: 진행 중 터는 housesite 행으로 복원(단계는 1부터 —
//   village_buildings 갱신 API 부재 관용). 좌표·야간 귀가·늑대 도주는 기존 계약 유지.
// =============================================================================
const LIFE_ON = process.env.VILLAGE_LIFE !== '0';
let VillageLayout = null;   // ★lazy require(설계 계약: 시뮬 off면 sim 모듈 무로드) — 생활층 진입점에서 1회 로드.
//   시딩(seedVillages)은 자기 지역 require를 씀 — 모듈 레벨 참조가 없어 "is not defined"로 일일 훅이 죽던 버그 수정.
const _lifeVL = () => VillageLayout || (VillageLayout = require('./village-layout'));
const L_LANDNEED = 8;        // 랩 동형: 인당 기준 경작칸(landNeedPer가 비옥도 보정)
// ★랩 JOBACT 대상 직업 = 현장(논밭·물·숲·산) 직업. 이 집합 밖은 랩 'villager' 버킷(회관 내부 앵커 + 역할 라벨).
const LIFE_FIELD_JOBS = new Set(['farmer', 'fisher', 'hunter', 'lumberjack', 'miner', 'forager']);
let _vgStuckN = 0;           // ★기타직 정체 가드 발동 누계(부팅 이후) — lifedbg가 노출
const SCH_VG_STUCK = 20000;  // 기타직 '출근' 정체 판정(ms). 실측 정체는 17.5초에도 0px였다 — 여유 20초.
const LIFE_CLEAR_PDAY = 3;   // 농부 1인 하루 개간 셀(랩 L_CLEAR=90 노동·dwell 스케일 근사 — 관찰 후 튜닝)
const LIFE_STAGE_PDAY = 1;   // 건설 1인 하루 1단계(움집 4단계≈4인일 — 랩 L_BUILDSEC=4600인·초 근사)
const LIFE_CREW = 2;         // 작업당 동시 크루 상한
// ★[생활 층 100% ②③ — 랩 lifeLoop 스케줄(7976~8043)·작물 상태머신(7753~7769)·직업 현장(7837~7865) 동형, 2026-07-27]
//   시간 매핑: 서버 worldPhase 0~dayPhaseRatio(0.7)=낮, 랩 fv 0.25~0.833=낮 — 스케줄 상수는 '낮 진행률' 동형 환산.
//   개인 기상 시차 _dOff=하루의 0~3%(랩 (fert*9973%1)*0.03 — 서버는 pid 결정론 해시) · 반일 추첨 _half=econ._idleFrac
//   (여가→행복의 시각화) · 요양=hp<60%(랩 NPC_REST_IN=60/100) 진입, 만피 해제(회복은 zone.js 자연 리젠).
const SCH_HALF_R = 0.501;    // 반일 퇴근 낮 진행률(랩 L_HALF=13시 = (0.542-0.25)/0.583)
const SCH_FARMW_R = 0.137;   // 농부 아침 출근 창 낮 진행률(랩 L_DAWN+0.08 = 0.08/0.583)
const SCH_DOFF = 0.03;       // 개인 기상 시차 상한(하루 비율 — 랩 동형 43분)
const SCH_REST_IN = 0.6;     // 요양 진입 hp 비율(랩 hp<60/100)
// 작물 정본(랩 CROPS 6071 — 청동기 후기(송국리 문화기) 재배 작물군 그대로): field 논/밭, plantMo 파종월, grow 생육일
const CROPS = [
  { id: '벼', field: '논', plantMo: [4, 5], grow: 78 }, { id: '보리', field: '논', plantMo: [9, 10], grow: 210 }, { id: '미나리', field: '논', plantMo: [2, 3], grow: 55 },
  { id: '밀', field: '밭', plantMo: [9, 10], grow: 210 }, { id: '조', field: '밭', plantMo: [3, 4, 5], grow: 58 }, { id: '기장', field: '밭', plantMo: [3, 4, 5], grow: 48 }, { id: '수수', field: '밭', plantMo: [3, 4, 5], grow: 62 }, { id: '메밀', field: '밭', plantMo: [3, 4, 6, 7], grow: 40 }, { id: '율무', field: '밭', plantMo: [3, 4], grow: 66 }, { id: '피', field: '밭', plantMo: [4, 5], grow: 60 },
  { id: '콩', field: '밭', plantMo: [4, 5, 6], grow: 62 }, { id: '팥', field: '밭', plantMo: [5, 6], grow: 58 }, { id: '녹두', field: '밭', plantMo: [4, 5, 6], grow: 44 },
  { id: '참깨', field: '밭', plantMo: [4, 5], grow: 60 }, { id: '들깨', field: '밭', plantMo: [4, 5, 6], grow: 64 },
  { id: '토란', field: '밭', plantMo: [3, 4], grow: 78 }, { id: '마', field: '밭', plantMo: [2, 3], grow: 80 },
  { id: '배추', field: '밭', plantMo: [3, 4, 6, 7, 8], grow: 48 }, { id: '무', field: '밭', plantMo: [3, 4, 6, 7, 8], grow: 36 }, { id: '오이', field: '밭', plantMo: [3, 4, 5], grow: 32 }, { id: '가지', field: '밭', plantMo: [3, 4], grow: 44 }, { id: '상추', field: '밭', plantMo: [2, 3, 4, 7, 8], grow: 24 }, { id: '아욱', field: '밭', plantMo: [2, 3, 4, 5, 7], grow: 40 }, { id: '순무', field: '밭', plantMo: [3, 4, 6, 7, 8], grow: 50 }, { id: '부추', field: '밭', plantMo: [2, 3], grow: 55 },
  { id: '대파', field: '밭', plantMo: [2, 3, 8], grow: 52 }, { id: '마늘', field: '밭', plantMo: [8, 9], grow: 210 }, { id: '생강', field: '밭', plantMo: [3, 4], grow: 82 },
  { id: '참외', field: '밭', plantMo: [3, 4], grow: 56 }, { id: '박', field: '밭', plantMo: [3, 4], grow: 70 }];
const L_YEAR = 365, L_MOSTART = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], L_START = 120;   // 랩 동형 달력(서버 게임일 0=랩 5월 파종철 앵커)
const L_WATERGAP = 7, L_WEEDS = [0.10, 0.24, 0.38, 0.52, 0.66, 0.80], L_PESTP = 0.008, L_QW = 0.05, L_QP = 0.05, L_QMIN = 0.25, L_QREC = 0.5;   // 물대기 주기·김매기 차례(생장 10~80% 6벌)·병충해·품질
const _lMonth = (d) => { const y = (((d + L_START) % L_YEAR) + L_YEAR) % L_YEAR; for (let m = 11; m >= 0; m--) if (y >= L_MOSTART[m]) return m + 1; return 1; };   // 게임일→월(1~12)
const _vcfCache = {};
function _villageCropFor(vil, field, mo, par) {   // 랩 villageCropFor 동형: 시드·달·구획으로 마을 특산물(논 1종·밭 2종 분담)
  const seed = vil.dbId | 0, ck = field + '_' + mo + '_' + par + '_' + seed;
  if (ck in _vcfCache) return _vcfCache[ck];
  const cand = CROPS.filter((c) => c.field === field && c.plantMo.includes(mo));
  if (!cand.length) return (_vcfCache[ck] = null);
  const pick = (salt) => { const h = (Math.imul(seed ^ salt, 2654435761) ^ Math.imul(mo + 1, 40503)) >>> 0; return cand[h % cand.length]; };
  let res; if (field !== '밭') res = pick(101);
  else { const c1 = pick(211); if (cand.length < 2) res = c1; else { let c2 = pick(307); if (c2 === c1) c2 = cand[(cand.indexOf(c1) + 1) % cand.length]; res = par ? c2 : c1; } }
  return (_vcfCache[ck] = res);
}
function _pidHash(pid) { let h = 7; const s2 = String(pid); for (let i = 0; i < s2.length; i++) h = (h * 31 + s2.charCodeAt(i)) >>> 0; return h; }
function _lifeAct(npc, s) {   // ★[액션 라벨 가시화] 행동 라벨 세터 — 변경 시 타임스탬프(zone.js makeEntry가 변경 후 1.2s 윈도우+최초가시에만 전송: 무상태 델타)
  if (npc._lifeAct !== s) { npc._lifeAct = s; npc._lifeActAt = Date.now(); }
}
function _lifeGoHome(npc, act) {   // 자택 대기(취침·요양·휴식·대피 공통 — §19 게이트와 동일 목표 세팅)
  npc.behavior = 'wander'; npc.gatherTarget = null;
  npc._huntOn = 0; npc._huntSpd = 0;   // ★사냥꾼 완전체: 귀가=두뇌 주도권 반납(wildlife 프록시 idle 강등 — 잠행 배속 잔존 방지)
  // ★[침대 진입] 취침·요양=실내 침대(문으로 출입 — 주민 A*가 벽 변 인지), 휴식·대피=마당 슬롯(집 앞 개활지).
  //   라벨은 랩 toHome 동형: 이동 중 '귀가' → 도착(44px)하면 지정 라벨(취침·요양·휴식) — "걸으면서 취침" 어색함 제거.
  const bed = (act === '취침' || act === '요양') && npc.npcBedX != null;
  const tx = bed ? npc.npcBedX : npc.npcHomeX, ty = bed ? npc.npcBedY : npc.npcHomeY;
  // ★[곳간②] 집 도착 = 들고 온 것을 집에서 소비(회계는 econ이 이미 반영 — 짐만 비운다)
  if (npc._carry > 0 && tx != null && Math.hypot(npc.x - tx, npc.y - ty) <= 44) npc._carry = 0;
  if (tx != null) {
    npc.targetX = tx; npc.targetY = ty;
    if (act) _lifeAct(npc, Math.hypot(npc.x - tx, npc.y - ty) > 44 ? '귀가' : act);
  } else if (act) _lifeAct(npc, act);
}
// =============================================================================
// ★[생활층 휴면 해소] 영토 런타임 백필
//   구DB(Stage1~3) 레코드 마을은 village_buildings에 'terr' 행이 없어 부팅 시 _terrSet=0셀이 된다.
//   그러면 npcLifeTick·_lifeDaily·_lifeGranAdd가 전부 `!_terrSet.size`로 조기 return —
//   개간·신축·작물·곳간 증설·직업 실작업·액션 라벨까지 생활 층 전체가 휴면한다.
//   DB 마이그레이션 대신 **부팅 시 런타임 재계산**(DB 무변경 = 리셋 금지 제약과 무충돌, 매 부팅 자가치유).
//
//   정본 재사용: 새 마을이 영토를 얻는 경로와 **완전히 같은 함수**(VillageLayout.generate의 layout.territory)를
//   호출한다 — 새 공식 발명 없음. pop은 현재 econ 인구(영토는 채당 LAND_PER_HOUSE=400셀 유일 공식 파생).
//   ★기존 실체 존중: 생성된 영토에 이미 서 있는 집 부지 원판(LOT_CELLS)·곳간 5×3·기경지(_farmSet)·
//   큰집 8×8을 **합집합**으로 반드시 포함시킨다(이미 선 건물이 영토 밖이 되면 개간·신축 판정이 깨진다).
//   nongzone(potSet)도 같은 layout에서 복원하되 이미 개간된 셀은 제외(시딩 블록 동형).
// =============================================================================
function _terrBackfillOne(vil, VL) {
  if (!state.ta || !vil || (vil._terrSet && vil._terrSet.size)) return null;
  const pop = (vil.econ && vil.econ.npcs) ? vil.econ.npcs.length : (vil.npcPids ? vil.npcPids.length : 0);
  const layout = VL.generate(state.ta, vil.ccx, vil.ccy, Math.max(4, pop), {});   // 시딩과 동일 호출(정본 재사용)
  const own = vil._terrSet || (vil._terrSet = new Set());
  for (const c of (layout.territory || [])) own.add(c[0] + ',' + c[1]);
  const gen = own.size;
  // ── 기존 실체 합집합(영토 밖 건물 금지) ──
  let added = 0;
  const put = (x, y) => { const k = x + ',' + y; if (!own.has(k)) { own.add(k); added++; } };
  for (let dx = -4; dx <= 3; dx++) for (let dy = -4; dy <= 3; dy++) put(vil.ccx + dx, vil.ccy + dy);        // 큰집 8×8
  for (const [dx, dy] of VL.YARD_CELLS) put(vil.ccx + dx, vil.ccy + dy);                                    // 큰집 마당 원판
  for (const h of (vil._houseCells || [])) {
    for (const [dx, dy] of VL.LOT_CELLS) put(h.cx + dx, h.cy + dy);                                         // 집 부지 원판(집채·텃밭 포함)
  }
  for (const g of (vil._granList || [])) {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) put(g.cx + dx, g.cy + dy);             // 곳간 5×3
  }
  for (const k of (vil._farmSet || [])) { if (!own.has(k)) { own.add(k); added++; } }                        // 기경지(논·밭)
  // ── 미개간 논 존닝(potSet) 복원 — 이미 개간된 셀 제외(시딩 블록 동형) ──
  let potN = 0;
  if (vil._potSet && !vil._potSet.size) {
    for (const z of (layout.nongZone || [])) {
      const k = z.cx + ',' + z.cy;
      if (vil._farmSet && vil._farmSet.has(k)) continue;
      if (!own.has(k)) continue;                 // 영토 밖 존닝은 담지 않음(개간 프론티어 계약)
      vil._potSet.add(k); potN++;
    }
  }
  vil._terrBackfilled = 1;
  vil._wf = null;   // 물거리 EDT 캐시 무효화(영토 bbox가 바뀌었으므로 재계산)
  return { name: vil.name, pop, gen, added, total: own.size, pot: potN };
}
// =============================================================================
// ★★[11차 T3] 환호(도랑) — 시범 마을 실체화
//   고증·기하는 village-layout.ditchRing 소유(검단리 규약). 여기는 **실체화·영속·소급 금지**만 담당한다.
//   ┌ 설계 선택(v10 문서 B-3 안 1, 사용자 확정): 도랑은 지형이 아니라 **마을이 소유한 사물**이다.
//   │   → village_buildings 'ditch' 행(집채·곳간과 같은 실체화 경로). 되돌리기 = 행 삭제.
//   │   → 터레인 재빌드 없음 = 기존 50마을 무영향(소급은 별도 판단 — 여기선 시범 마을만).
//   └ 콜라이더는 다리 층 규약 동형: 서버 단일 술어(isTerrainBlockedLocal) + 클라 미러 + welcome 페이로드.
//   ★DB 리셋 금지 제약과 무충돌: 시딩이 아니라 **부팅 런타임 자가치유**로 넣는다(영토 백필과 같은 방식).
//     이미 ditch 행이 있으면 아무것도 하지 않는다(idempotent).
const DITCH_PILOT_MAX = Math.max(0, parseInt(process.env.VILLAGE_DITCH_MAX || '2', 10));   // 시범 마을 수(0=끔)
const DITCH_PILOT_NAMES = (process.env.VILLAGE_DITCH_PILOT || '').split(',').map(s2 => s2.trim()).filter(Boolean);
function _ditchPlan(vil, VL) {
  // 링 계산만(DB 무변경) — 시범 선정에 쓰는 순수 계측.
  const block = new Set();
  for (const b of (vil._bRows || [])) {
    if (b.type === 'terr' || b.type === 'nongzone' || b.type === 'ditch') continue;
    if (b.type === 'house' || b.type === 'hall') {                  // 집채 6×4 / 큰집 8×8 발자국까지
      const x0 = b.cx - (b.type === 'hall' ? 4 : 5), x1 = b.cx + (b.type === 'hall' ? 3 : 0);
      const y0 = b.cy - (b.type === 'hall' ? 4 : 5), y1 = b.cy + (b.type === 'hall' ? 3 : -2);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) block.add(x + ',' + y);
      continue;
    }
    if (b.type === 'granary') { for (let x = b.cx - 2; x <= b.cx + 2; x++) for (let y = b.cy - 1; y <= b.cy + 1; y++) block.add(x + ',' + y); continue; }
    block.add(b.cx + ',' + b.cy);
  }
  const houses = (vil._houseCells || []).map(h => ({ cx: h.cx, cy: h.cy }));
  const axis = VL.axisAt(state.ta, vil.ccx, vil.ccy);
  const r = VL.ditchRing(vil.ccx, vil.ccy, { houses, terrain: state.ta, axis, skip: (x, y) => block.has(x + ',' + y) });
  return r;
}
// ★★환호가 환호인지 **실측으로 판정**한다 — 구멍 난 링은 방어선이 아니다(반쪽 구현 금지).
//   판정: (도랑 ∪ 지형차단)을 벽으로 놓고 바깥에서 큰집까지 8방 BFS.
//     ① 출입구 열림 → 도달해야 한다(마을이 고립되면 안 된다)
//     ② 출입구를 막으면 → 도달 못 해야 한다(= 통행이 오직 출입구로만 이뤄진다 = 링이 실제로 닫혀 있다)
//   ★지형(물·바위) 구멍은 통과 못 하므로 자동으로 벽에 포함된다 — "물가 마을은 강이 성벽"이라는 고증과도 맞다.
function _ditchEncloses(vil, r) {
  const S = new Set(r.cells.map(c => c.cx + ',' + c.cy));
  const G = new Set(r.gates.map(c => c.cx + ',' + c.cy));
  const R = r.ao + 8, cx0 = vil.ccx, cy0 = vil.ccy;
  const blocked = (x, y, gatesClosed) => {
    const k = x + ',' + y;
    if (S.has(k)) return true;
    if (gatesClosed && G.has(k)) return true;
    return state.ta.isBlocked(x, y);
  };
  const reach = (gatesClosed) => {
    // 바깥 시작점 = 링 밖에서 통행 가능한 첫 셀(테두리 한 바퀴 훑기 — 물가 마을은 모서리가 물일 수 있다)
    let start = null;
    for (let d = -R; d <= R && !start; d++) {
      for (const [sx, sy] of [[cx0 + d, cy0 - R], [cx0 + d, cy0 + R], [cx0 - R, cy0 + d], [cx0 + R, cy0 + d]]) {
        if (!blocked(sx, sy, gatesClosed)) { start = [sx, sy]; break; }
      }
    }
    if (!start) return false;
    const seen = new Set([start[0] + ',' + start[1]]), q = [start];
    let head = 0;
    while (head < q.length) {
      const [x, y] = q[head++];
      if (x === cx0 && y === cy0) return true;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {   // ★8방 = 대각 새기까지 본다
        const nx = x + ax, ny = y + ay;
        if (nx < cx0 - R || ny < cy0 - R || nx > cx0 + R || ny > cy0 + R) continue;
        const k = nx + ',' + ny;
        if (seen.has(k) || blocked(nx, ny, gatesClosed)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return false;
  };
  const open = reach(false), closed = reach(true);
  return { ok: open && !closed, open, closed };
}
function _ditchDig(vil, r) {
  const DB = state.db;                                  // ★모듈 전역 db 없음 — 런타임 싱글턴은 state.db(1261행)
  DB.db.exec('BEGIN');
  try {
    for (const c of r.cells) DB.insertVillageBuilding({ village_id: vil.dbId, type: 'ditch', cx: c.cx, cy: c.cy, floors: 0, data: null });
    DB.db.exec('COMMIT');
  } catch (e) { try { DB.db.exec('ROLLBACK'); } catch (_) {} throw e; }
  vil._ditch = r.cells.map(c => ({ cx: c.cx, cy: c.cy }));
}
// ★[11차] 소급 판단용 **계측 전용** 스캔 — 아무것도 파지 않고 "전 마을 중 몇 곳이 적격인가"만 잰다.
//   VILLAGE_DITCH_SCAN=1 로 켠다(운영 기본 꺼짐). 소급 여부는 이 실측 위에서 결정한다(추정 금지).
function _ditchScanAll() {
  if (!state.ta) return;
  const VL = require('./village-layout');
  const rows = [];
  for (const vil of state.villages) {
    if (vil._ditch && vil._ditch.length) { rows.push({ n: vil.name, ok: 1, cells: vil._ditch.length, note: '이미 파임' }); continue; }
    let r = null;
    try { r = _ditchPlan(vil, VL); } catch (e) { rows.push({ n: vil.name, ok: 0, note: 'plan 실패' }); continue; }
    if (!r || !r.cells.length) { rows.push({ n: vil.name, ok: 0, cells: 0, st: r ? r.skipTerr : null, sb: r ? r.skipBlock : null, diag: 0, note: `팔 자리 0 — 링 전 구간이 막힘` }); continue; }
    const enc = _ditchEncloses(vil, r);
    const conn = VL.ditchConnectivity(r.cells);
    rows.push({ n: vil.name, ok: enc.ok ? 1 : 0, cells: r.cells.length, st: r.skipTerr, sb: r.skipBlock, diag: conn.diagOnly,
      // ★두 가지 실패를 구분한다: (a)막아도 도달 = **샌다**(진짜 부적격) (b)열어도 도달 못함 = **검증 불가**
      //   (b)는 바깥 시작점이 전부 물이라 BFS가 출발하지 못한 경우가 대부분이다(강에 둘러싸인 어촌).
      //   "샌다"와 "못 쟀다"를 같은 ✗로 뭉뚱그리면 소급 판단이 틀린 근거 위에 서게 된다.
      note: enc.ok ? '적격' : (enc.closed ? '샘(출입구 막아도 안으로 들어와짐)' : '검증 불가(바깥에서 큰집까지 BFS 자체가 불가 — 물에 둘러싸임)') });
  }
  const okN = rows.filter(x => x.ok).length;
  const cells = rows.filter(x => x.ok).reduce((a, x) => a + (x.cells || 0), 0);
  console.log(`[${state.zoneId}] 🏰 [소급 판단용 계측] 적격 ${okN}/${rows.length}개 마을 · 전면 소급 시 도랑 ${cells}셀(welcome 페이로드 ≈${(cells * 2 * 4 / 1024).toFixed(1)}KB · 다리 294셀 대비 ${(cells / 294).toFixed(1)}배)`);
  for (const x of rows) console.log(`[${state.zoneId}] 🏰   ${x.ok ? '○' : '✗'} ${x.n}: ${x.cells != null ? x.cells + '셀 ' : ''}${x.st != null ? `지형구멍 ${x.st}·취락구멍 ${x.sb}·대각 ${x.diag} ` : ''}— ${x.note}`);
}
function _ditchInitAll() {
  if (!LIFE_ON || !state.ta || DITCH_PILOT_MAX <= 0) return;
  const VL = require('./village-layout');
  const already = state.villages.filter(v => v._ditch && v._ditch.length);
  if (already.length >= DITCH_PILOT_MAX) {
    console.log(`[${state.zoneId}] 🏰 환호 시범: 기존 ${already.length}개 마을(${already.map(v => v.name).join(',')}) — 신규 없음`);
    return;
  }
  // ★시범 마을은 **이름이 아니라 실측으로 고른다**: 링을 계산해 보고 '진짜 닫히는' 마을만 판다.
  //   구멍(농지·건물 때문에 못 판 셀)이 있으면 그 자리로 사람이 걸어 들어와 환호가 장식이 된다.
  //   지형(물·바위) 구멍은 이미 통행 불가라 방어선에 포함된다 — 그래서 판정은 BFS 실측이지 셀 수 비교가 아니다.
  const pool = DITCH_PILOT_NAMES.length ? state.villages.filter(v => DITCH_PILOT_NAMES.includes(v.name)) : state.villages;
  const report = [];
  let dug = already.length;
  for (const vil of pool) {
    if (dug >= DITCH_PILOT_MAX) break;
    if (vil._ditch && vil._ditch.length) continue;
    let r = null;
    try { r = _ditchPlan(vil, VL); } catch (e) { report.push({ n: vil.name, why: 'plan 실패: ' + e.message }); continue; }
    if (!r || !r.cells.length) { report.push({ n: vil.name, why: `팔 자리 없음(지형구멍 ${r ? r.skipTerr : '?'}·취락구멍 ${r ? r.skipBlock : '?'})` }); continue; }
    const enc = _ditchEncloses(vil, r);
    const conn = VL.ditchConnectivity(r.cells);
    if (!enc.ok) {
      report.push({ n: vil.name, why: `${enc.closed ? '샘' : '검증 불가(바깥→큰집 BFS 불가)'} · 도랑 ${r.cells.length}셀 · 지형구멍 ${r.skipTerr} · 취락구멍 ${r.skipBlock}` });
      continue;
    }
    try { _ditchDig(vil, r); } catch (e) { report.push({ n: vil.name, why: '기록 실패: ' + e.message }); continue; }
    dug++;
    console.log(`[${state.zoneId}] 🏰 [${vil.name}] 환호: 도랑 ${r.cells.length}셀(타원 장반경 ${r.a}·단반경 ${r.b}) · 출입구 안 판 셀 ${r.gates.length} · 지형구멍 ${r.skipTerr}(강·산=성벽) · 취락구멍 ${r.skipBlock} · 4연결 성분 ${conn.comps} · 대각누수 ${conn.diagOnly} · ★봉쇄 실측 통과(출입구 열면 도달·막으면 불가)`);
  }
  const withD = state.villages.filter(v => v._ditch && v._ditch.length);
  console.log(`[${state.zoneId}] 🏰 환호 시범: ${withD.length}/${state.villages.length}개 마을 [${withD.map(v => v.name).join(',')}] — 나머지 무영향(소급 없음)`);
  if (report.length) console.log(`[${state.zoneId}] 🏰 환호 부적합(판지 않음) ${report.length}곳: ` + report.slice(0, 6).map(x => `${x.n}=${x.why}`).join(' | '));
}
// 콜라이더·welcome 원천 — 전 마을 도랑 셀 flat [cx,cy,…] (다리 ZONE.bridges와 같은 규약)
function ditchCells() {
  const out = [];
  for (const vil of state.villages) for (const c of (vil._ditch || [])) out.push(c.cx, c.cy);
  return out;
}

function _terrBackfillAll() {
  if (!LIFE_ON || !state.ta) return;
  const VL = require('./village-layout');
  const done = [];
  for (const vil of state.villages) {
    if (vil._terrSet && vil._terrSet.size) continue;
    const t0 = Date.now();
    let r = null;
    try { r = _terrBackfillOne(vil, VL); }
    catch (e) { console.warn(`[${state.zoneId}] 🏘️ [${vil.name}] 영토 백필 실패(휴면 유지):`, e.message); continue; }
    if (r) { r.ms = Date.now() - t0; done.push(r); }
  }
  if (done.length) {
    for (const r of done) console.log(`[${state.zoneId}] 🏘️ [${r.name}] 영토 백필: 생성 ${r.gen}셀 + 기존 실체 ${r.added}셀 = ${r.total}셀 · 논존닝 ${r.pot}셀 (pop ${r.pop}, ${r.ms}ms) — 생활층 기동`);
    console.log(`[${state.zoneId}] 🏘️ 영토 백필 완료: ${done.length}/${state.villages.length}개 마을 휴면 해소`);
  } else {
    console.log(`[${state.zoneId}] 🏘️ 영토 백필: 대상 없음(전 마을 terr 보유)`);
  }
  return done;
}

function lifeDebug() {   // ★[직접 서버 디버깅 — 사용자 요청] zone /lifedbg가 노출: 마을별 라벨 분포·크루·작물·샘플 NPC(침대 거리 포함)
  const out = [], now = Date.now();
  const wpF = state.deps && state.deps.worldPhase, dayR = (state.deps && state.deps.dayPhaseRatio) || 0.7;
  for (const vil of state.villages) {
    const acts = {}, sample = [], jobs = {};
    let actN = 0;
    for (const pid of vil.npcPids) {
      const p = state.deps.players.get(pid); if (!p) continue;
      const a = p._lifeAct || '·'; acts[a] = (acts[a] || 0) + 1;
      if (p._lifeAct) actN++;                                   // ★actNonNull 집계(라벨 가시성 정량)
      jobs[p.simJob || '(무)'] = (jobs[p.simJob || '(무)'] || 0) + 1;   // ★전 주민 simJob 히스토그램(샘플 8이 아니라 전수)
      if (sample.length < 8) sample.push({ job: p.simJob, act: p._lifeAct || null, x: Math.round(p.x), y: Math.round(p.y),
        dHome: p.npcHomeX != null ? Math.round(Math.hypot(p.x - p.npcHomeX, p.y - p.npcHomeY)) : null,
        dBed: p.npcBedX != null ? Math.round(Math.hypot(p.x - p.npcBedX, p.y - p.npcBedY)) : null,
        rest: p._rest || 0, half: !!p._half, fOut: p._fOutD,
        on: state.deps.isPositionActive ? (state.deps.isPositionActive(p.x, p.y) ? 1 : 0) : null,   // ★진단: 활성 청크 여부
        inN: state.deps.npcs ? (state.deps.npcs.has(pid) ? 1 : 0) : null });   // ★진단: npcStep 순회 집합 소속 여부
    }
    const ec = (vil.econ && vil.econ.counts) || null;
    out.push({ name: vil.name, pop: vil.npcPids.length, farm: vil._farmSet ? vil._farmSet.size : 0, crop: vil._crop ? vil._crop.size : 0,
      // ★[생활층 휴면 진단] terr=영토 셀 수(0이면 npcLifeTick/_lifeDaily/_lifeGranAdd가 전부 조기 return = 휴면),
      //   terrBf=런타임 백필로 채워진 마을인지, jobs=전 주민 직업 분포(농부 0이면 파종 자체가 불가),
      //   econCounts=econ이 정한 직업 수(simJob의 원천 — 여기가 농부 0이면 생활층 문제가 아니라 econ 결과),
      //   actN/actPct=액션 라벨 가시성.
      terr: vil._terrSet ? vil._terrSet.size : 0, terrBf: vil._terrBackfilled ? 1 : 0,
      pot: vil._potSet ? vil._potSet.size : 0, gran: vil._granList ? vil._granList.length : 0,
      granStock: vil._granStock ? [...vil._granStock.values()].reduce((a, b) => a + b, 0) : 0,   // ★곳간② 물리 장부 합(회계 아님)
      // ★[LIFE_* 튜닝 계측] 오늘 진행분(m*)과 어제 확정치(d*) — 개간 셀·건설 단계·작물 태스크.
      //   LIFE_CLEAR_PDAY(3)·LIFE_STAGE_PDAY(1)의 **실효 속도**를 관측으로 재는 축(상수 변경은 사용자 소관).
      mCl: vil._mCl || 0, mSt: vil._mSt || 0, mTk: vil._mTk || 0,
      dCl: vil._dCl || 0, dSt: vil._dSt || 0, dTk: vil._dTk || 0,
      carrying: (() => { let n = 0; for (const pid of vil.npcPids) { const p = state.deps.players.get(pid); if (p && p._carry > 0) n++; } return n; })(),
      jobs, econCounts: ec, actN, actPct: vil.npcPids.length ? +(actN / vil.npcPids.length * 100).toFixed(1) : 0,
      site: vil._site ? vil._site.stage : null, clearCrew: vil._clearCrew || 0, buildCrew: vil._buildCrew || 0, hl: vil._hlDay || null,
      ditch: (vil._ditch ? vil._ditch.length : 0),   // ★[11차 T3] 환호 도랑 셀 수(0=시범 마을 아님) — 라이브 확인용
      psite: vil._psite ? { cx: vil._psite.cx, cy: vil._psite.cy, stage: vil._psite.stage, crew: vil._psiteCrew || 0, owner: vil._psite.owner } : null,   // ★[11차 T4] 플레이어 의뢰 집터(공정 단계·붙은 크루)
      pHouses: (vil._pHouses ? vil._pHouses.length : 0),   // 완공된 의뢰 집(마을 침대 명부 밖)
      mkt: (() => { if (!state.caravanBodies) return 0; for (const b of state.caravanBodies.values()) if (b.phase === 'linger' && state.byEcon.get(b.toV) === vil) return 1; return 0; })(),   // ★[10차 T4] 장마당 개장 여부(캐러밴 체류 중) — 라이브 확인용 계측
      ccx: vil.ccx, ccy: vil.ccy, acts, sample });
  }
  let tN = 0, tAct = 0;
  for (const v of out) { tN += v.pop; tAct += v.actN; }
  return { t: new Date().toISOString(), phase: wpF ? +wpF(now).toFixed(3) : null, dayR, life: LIFE_ON,
    totals: { pop: tN, actN: tAct, actPct: tN ? +(tAct / tN * 100).toFixed(1) : 0, vgStuck: _vgStuckN,
              tkPday: _lifeTasksPerFarmerDay(), taskSec: LIFE_TASK_SEC,   // ★결산 정합 진단: 헤드리스가 쓰는 농부 1인 하루 작물 셀(날 길이 파생)
              dormant: out.filter(v => !v.terr).length, noFarmer: out.filter(v => !(v.jobs && v.jobs.farmer)).length },
    villages: out };
}
function _lifeDropTask(vil, npc) {   // 진행 중 작업 즉시 반납(요양 진입·반일 퇴근·야간 — 크루 카운터·클레임 정리. 일일 자가치유의 즉시판)
  const t = npc._lifeTask; if (!t) return null;
  if (t.k === 'clear') { vil._claim.delete(t.cx + ',' + t.cy); vil._clearCrew = Math.max(0, vil._clearCrew - 1); }
  else if (t.k === 'build') vil._buildCrew = Math.max(0, vil._buildCrew - 1);
  npc._lifeTask = null; return null;
}
// ── 작물 상태머신(랩 cellTask/doTask 동형 — 단 식량 산출은 econ 소유: 여기는 상태·연출만, 이중 계상 금지) ──
function _cellTask(vil, k, day) {   // 우선순위: 5수확 4방제 3물대기(논만) 2파종 1김매기 0없음
  const e = vil._crop.get(k);
  const nong = !vil._drySet.has(k);
  if (!e) { const ci = k.indexOf(','), par = (+k.slice(0, ci) + +k.slice(ci + 1)) & 1; return _villageCropFor(vil, nong ? '논' : '밭', _lMonth(day), par) ? 2 : 0; }
  if (day - e.p >= e.c.grow) return 5;
  if (e.ps) return 4;
  if (nong && day - (e.w || e.p) >= L_WATERGAP) return 3;
  const wd = e.wd || 0; if (wd < L_WEEDS.length && (day - e.p) / e.c.grow >= L_WEEDS[wd]) return 1;
  return 0;
}
function _lifeDoTask(vil, npc, k, day) {   // 도착한 셀 처리(랩 doTask 동형 — econ storage 불변·스킬은 서버 생략). npc=null=헤드리스(라벨 생략)
  // ★[LIFE_* 튜닝 계측] 오늘 처리된 작물 태스크 수(파종·수확·방제·물대기·김매기 — 실제 처리된 것만)
  const _r = _lifeDoTask0(vil, npc, k, day);
  if (_r) vil._mTk = (vil._mTk || 0) + 1;
  return _r;
}
function _lifeDoTask0(vil, npc, k, day) {
  const e = vil._crop.get(k), nong = !vil._drySet.has(k);
  const ci = k.indexOf(','), par = (+k.slice(0, ci) + +k.slice(ci + 1)) & 1;
  if (!e) { const cr = _villageCropFor(vil, nong ? '논' : '밭', _lMonth(day), par); if (!cr) return false; vil._crop.set(k, { c: cr, p: day, td: day, w: day, wd: 0, ps: 0, q: 1 }); if (npc) _lifeAct(npc, nong ? '모내기' : '파종'); return true; }
  if (day - e.p >= e.c.grow) { vil._crop.delete(k); if (npc) { npc._carry = (npc._carry || 0) + 1; _lifeAct(npc, '수확'); } return true; }   // 수확 — 식량은 econ이 이미 계상(연출만). ★곳간② 물리 짐 1칸분 적재(회계 아님)
  if (e.ps) { e.ps = 0; e.td = day; e.q = Math.min(1, e.q + L_QREC); if (npc) _lifeAct(npc, '방제'); return true; }
  if (nong && day - (e.w || e.p) >= L_WATERGAP) { e.w = day; e.q = Math.min(1, e.q + L_QREC); if (npc) _lifeAct(npc, '물대기'); return true; }
  const wd = e.wd || 0; if (wd < L_WEEDS.length && (day - e.p) / e.c.grow >= L_WEEDS[wd]) { e.wd = wd + 1; e.td = day; e.q = Math.min(1, e.q + L_QREC); if (npc) _lifeAct(npc, nong ? '논매기' : '김매기'); return true; }
  return false;
}
// ★[헤드리스 일일 결산 — 사용자 "아무도 안 보는 마을도 일과가 작동해야 하는 거 아냐?"] 동면 마을(관측자 없음)의
//   물리 결과를 게임일 경계에 같은 규칙·같은 인일 속도로 일괄 적산 — 랩 빨리감기(lifeLoop fast: 걷기 생략+일괄) 동형.
//   econ(인구·생산·재고)은 원래 전 마을 상시 작동 — 여기는 '몸의 결과물'(개간 셀·신축 단계·작물 상태)을 실체로
//   따라붙여 관측 여부와 무관하게 세계 상태가 동일해지게 한다(일관성 원칙: 도착해 보면 살던 흔적 그대로).
//   활성 마을은 스킵 — 실걸음 크루(npcLifeTick)가 같은 속도로 이미 쌓는다(이중 계상 방지).
// ★[결산 정합 — 6차 실측의 전제 수정] 종전 상수 `LIFE_TASKS_PDAY = 30`(농부 1인 하루 작물 셀)은
//   **날 길이와 무관한 고정값**이라, 하루가 길어질수록 실걸음(실시간 구속)보다 느려지고 짧아질수록 빨라졌다.
//   실걸음 1건 = 이동 + 체류(_jobT: 9~18초)이므로 하루 처리량은 **낮의 실초 ÷ 건당 실초**다.
//   그래서 상수를 '하루 셀 수'가 아니라 **'건당 실초'**로 잡고 결산이 날 길이에서 파생되게 한다
//   (fast 모드 = 물리의 가속 shadow — 관측 여부로 세계 속도가 갈리지 않게 하는 유일한 방법).
const LIFE_TASK_SEC = 5.0;    // ★작물 셀 1건당 실걸음 실초 — **로컬 A/B 실측 보정값**(추정 아님).
                              //   실측(하루 2분 압축·**작물 완전 포화**·농부 8): 관측 마을 135셀/일 = 인당 16.9
                              //   → 낮 84초 ÷ 16.9 = 5.0초/건. (체류 9~18초보다 짧은 이유: 곳간 운반 훅이
                              //   짐 상한에서 _jobT를 0으로 풀어 대기를 건너뛰기 때문 — 추정 말고 실측이 정본.
                              //   ※일감이 모자란 평시엔 예산이 남으므로 이 값은 **상한**이지 강제량이 아니다.)
function _lifeTasksPerFarmerDay() {   // 낮 실초 ÷ 건당 실초 = 농부 1인 하루 처리 셀(하한 1)
  const dayMs = state.dayMs || 600000;
  const dayR = (state.deps && state.deps.dayPhaseRatio) || 0.7;
  return Math.max(1, Math.round((dayMs * dayR / 1000) / LIFE_TASK_SEC));
}
function _lifeHeadlessDay(vil) {
  _lifeVL();   // lazy 로드 방어(단독 호출 경로 — 5e8d5f5 'is not defined' 클래스 재발 금지)
  const day = state.dayMs ? gameDayOf(Date.now()) : 0;
  let farmerN = 0, popN = 0;
  for (const pid of vil.npcPids) { const p = state.deps.players.get(pid); if (!p) continue; popN++; if (p.simJob === 'farmer') farmerN++; }
  if (!popN) return;
  // ① 개간 — 실걸음과 동일: 크루 상한 2 × 3셀/인일, 프론티어 최근접부터(마을 중심 기준)
  if (farmerN && _lifeNeedClear(vil)) {
    let n = Math.min(LIFE_CREW, farmerN) * LIFE_CLEAR_PDAY;
    while (n-- > 0 && _lifeNeedClear(vil)) {
      const fr = _lifeFrontier(vil); let best = null, bd = 1e9;
      for (const c2 of fr) { const k = c2.cx + ',' + c2.cy; if (vil._farmSet.has(k)) continue; const dx = c2.cx - vil.ccx, dy = c2.cy - vil.ccy, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = c2; } }
      if (!best) break;
      _lifeLiveFarmTile(vil, best.cx, best.cy, best.f === '밭' ? 'dryfield' : 'farmland');
    }
  }
  // ② 신축 — 크루 인일=단계(실걸음과 동일 속도). 완공 시 _lifeCompleteHouse가 실체화(집·마당·침대 명부)
  if (vil._site) { let st = Math.min(LIFE_CREW, popN) * LIFE_STAGE_PDAY; while (st-- > 0 && vil._site) _lifeAdvanceSite(vil); }
  // ③ 작물 — 농부 노동예산으로 우선순위 일괄(수확>방제>물대기>파종>김매기 — cellTask 순서가 자연 보장)
  let budget = farmerN * _lifeTasksPerFarmerDay();   // ★날 길이 파생(구 고정 30 → 실걸음 정합)
  while (budget > 0) {
    let did = 0;
    for (const k of vil._farmSet) {
      if (budget <= 0) break;
      if (_cellTask(vil, k, day) > 0 && _lifeDoTask(vil, null, k, day)) { budget--; did++; }
    }
    if (!did) break;   // 일감 소진(비수기·전부 생육 중)
  }
  vil._hlDay = day;   // lifeDebug 노출용(결산 도장)
}
function _lifeNextFarmCell(vil, npc, day) {   // 랩 nextTask 동형(구역 대신 전 농지 — 서버 농지 수백 셀 스케일): 우선순위 높고 가까운 할 일
  let best = null, bp = 0, bd = 1e9;
  for (const k of vil._farmSet) {
    if (vil._cropClaim.has(k)) continue;   // 다른 농부 진행 중(랩은 plot 담당제로 분산 — 서버는 셀 클레임)
    const p = _cellTask(vil, k, day); if (p === 0) continue;
    const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
    const dx = x * SZ + SZ / 2 - npc.x, dy = y * SZ + SZ / 2 - npc.y, d = dx * dx + dy * dy;
    if (p > bp || (p === bp && d < bd)) { bp = p; bd = d; best = k; }
  }
  return best;
}
// ── 직업 현장(랩 place/resourceTick 동형 원리 — 서버는 실물 자원·실물 사냥감이 정본): 일 캐시 ──
const JOB_RES = { lumberjack: ['tree'], miner: ['rock', 'ore'], forager: ['berry_bush', 'herb'] };
function _lifeJobSites(vil, day) {   // 마을 생활권의 직업별 현장 후보 — 자원 밀집 버킷(벌목·채광·채집), 물가(어부), 초식 사냥감(사냥꾼)
  if (vil._jobSites && vil._jobSites.day === day) return vil._jobSites;
  const cx = vil.ccx * SZ + SZ / 2, cy = vil.ccy * SZ + SZ / 2, R = Math.max(vil._maxRPx || 800, 800) + 400;
  const qt = state.deps.qtResources && state.deps.qtResources();
  const res = qt ? qt.queryCircle(cx, cy, R) : [];
  const B = SZ * 4, bk = {}; for (const j of Object.keys(JOB_RES)) bk[j] = new Map();
  for (const r of res) {
    for (const j of Object.keys(JOB_RES)) if (JOB_RES[j].includes(r.type)) {
      const k = ((r.x / B) | 0) + ',' + ((r.y / B) | 0), m = bk[j], e = m.get(k) || { x: 0, y: 0, n: 0 };
      e.x += r.x; e.y += r.y; e.n++; m.set(k, e);
    }
  }
  const top = (m) => [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((e) => ({ x: e.x / e.n, y: e.y / e.n }));
  const hunt = [];   // 사냥터=초식 사냥감(🦌🐇🐗 — 늑대·호랑이 제외) 실위치(일 캐시 — 서식 밴드 근사)
  if (state.deps.mobs) for (const mo of state.deps.mobs.values()) {
    if (mo.hp <= 0 || mo.type === 'wolf' || mo.type === 'tiger') continue;
    const d = Math.hypot(mo.x - cx, mo.y - cy); if (d < R + 600) { hunt.push({ x: mo.x, y: mo.y }); if (hunt.length >= 24) break; }
  }
  const bank = [];   // 물가 현장(어부) — 영토 셀 중 4방에 물(랩 V.bank 동형)
  if (state.deps.isWaterTileLocal) {
    for (const k of vil._terrSet) {
      const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      const px = x * SZ + SZ / 2, py = y * SZ + SZ / 2;
      if (state.deps.isWaterTileLocal(px + SZ, py) || state.deps.isWaterTileLocal(px - SZ, py) || state.deps.isWaterTileLocal(px, py + SZ) || state.deps.isWaterTileLocal(px, py - SZ)) { bank.push({ x: px, y: py }); if (bank.length >= 200) break; }
    }
  }
  return (vil._jobSites = { day, lumberjack: top(bk.lumberjack), miner: top(bk.miner), forager: top(bk.forager), hunter: hunt, fisher: bank });
}

function _lifeFarmTooClose(vil, x, y) {   // 랩 farmTooClose 동형: 부지 원+2·마당 원+2·곳간 5×3+1버퍼
  for (const h of vil._houseCells) if (VillageLayout.houseFarmBlock(h.cx, h.cy, x, y)) return true;
  if (VillageLayout.hallFarmBlock(vil.ccx, vil.ccy, x, y)) return true;
  for (const g2 of vil._granList) if (Math.abs(g2.cx - x) <= 4 && Math.abs(g2.cy - y) <= 3) return true;
  if (vil._site && Math.abs(vil._site.cx - x) <= 8 && Math.abs(vil._site.cy - y) <= 8) return true;   // 진행 중 신축 부지 보호
  return false;
}
function _lifeBatEligible(vil, x, y) {   // 랩 _batEligible 동형(길 답압 항은 서버 road 조회 연결 시 — 주석 계약)
  if (!vil._terrSet.has(x + ',' + y)) return false;
  if (VillageLayout.hallFarmBlock(vil.ccx, vil.ccy, x, y)) return false;
  if (!state.ta || state.ta.isBlocked(x, y)) return false;
  let n = 0; const A2 = VillageLayout.ALLEY_R * VillageLayout.ALLEY_R;
  for (const h of vil._houseCells) { const dx = h.cx - x, dy = h.cy - y; if (dx * dx + dy * dy < A2) { n++; if (n >= 2) return false; } }   // 골목 배제(집 2채 r12.5)
  return true;
}
function _lifeFrontier(vil) {   // 랩 getFrontier 동형(일 캐시): 기개간 인접 논 존닝 + 밭 창발
  if (vil._frontier && vil._frontDay === state.world.day) return vil._frontier;
  const fr = [], seen = new Set(), any = vil._farmSet.size > 0;
  for (const k of vil._potSet) {
    const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
    if (any) { let adj = false; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (vil._farmSet.has((x + d[0]) + ',' + (y + d[1]))) { adj = true; break; } if (!adj) continue; }
    if (_lifeFarmTooClose(vil, x, y)) continue;
    seen.add(k); fr.push({ cx: x, cy: y, f: '논' });
  }
  const addBat = (x, y) => { const k = x + ',' + y; if (seen.has(k) || vil._potSet.has(k) || vil._farmSet.has(k)) return; if (!_lifeBatEligible(vil, x, y) || _lifeFarmTooClose(vil, x, y)) return; seen.add(k); fr.push({ cx: x, cy: y, f: '밭' }); };
  for (const k of vil._farmSet) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); addBat(x + 1, y); addBat(x - 1, y); addBat(x, y + 1); addBat(x, y - 1); }
  vil._frontier = fr; vil._frontDay = state.world.day; return fr;
}
function _lifeNeedClear(vil) {   // 랩 needLand 동형: 보즈럽 수요 게이트 + 목표 미달
  const e = vil.econ; if (!e || !vil._potSet) return false;
  if (((e.storage && e.storage.food) || 0) > e.npcs.length * 120) return false;
  const fert = (e.land && e.land.fertility != null) ? e.land.fertility : 0.55;
  return vil._farmSet.size < Math.ceil(e.npcs.length * VillageLayout.landNeedPer(fert, L_LANDNEED));
}
function _lifeLiveFarmTile(vil, cx, cy, type) {   // 개간 완료 실체화: 영속 행 + 라이브 시각 타일(farmTilesInRect 규약 동형)
  vil._mCl = (vil._mCl || 0) + 1;   // ★[LIFE_* 튜닝 계측] 오늘 개간된 셀 수(실걸음·LOD 배치 공통 싱크)
  const rowid = state.db.insertVillageBuilding({ village_id: vil.dbId, type, cx, cy, floors: 0, data: null });
  vil._farmSet.add(cx + ',' + cy); vil._potSet.delete(cx + ',' + cy); vil._frontier = null; vil._farmArr = null;
  if (type === 'dryfield' && vil._drySet) vil._drySet.add(cx + ',' + cy);   // ★[생활 층 100% ③] 밭 구분 유지(작물 상태머신 field 판정)
  if (type === 'farmland') vil._farmN++; else vil._dryN++;
  const bo = { id: `vb${rowid}`, dbId: null, sim: true, type: 'farmland', ownerId: `npc_simvil_${vil.dbId}`, ownerName: `${vil.name} 경작지`, x: cx * SZ + SZ / 2, y: cy * SZ + SZ / 2, data: { sim: 1, dry: type === 'dryfield' ? 1 : 0 }, floor: 0, villageId: vil.dbId };
  try { if (state.deps.chunkManager) state.deps.chunkManager.insertBuilding(bo); state.deps.broadcast({ type: 'buildings_spawn', buildings: [bo] }); } catch (e) {}
}
// ★★[11차 T4] 집터 하드 필터 — 마을 자동 배치(_lifeAddHouseSite)와 플레이어 의뢰(lifeRequestPlayerSite)가 **같은 코드**를 쓴다.
//   랩 10차 siteFilters 규약의 서버 이식본. 필터를 복제하면 두 경로가 갈라져 마을 기하가 깨진다(랩에서 이미 겪은 교훈).
function _lifeSiteFilters(vil) {
  if (!vil._wf) {   // 물거리 EDT 캐시(마을당 1회 — 영토 bbox±32, 랩 s._wf 동형)
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const k of vil._terrSet) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    vil._wf = VillageLayout.waterEDT(state.ta, bx0 - 32, by0 - 32, bx1 + 32, by1 + 32);
  }
  const W_PEN_K = 2000, HG = 18;
  const wnd = (x, y) => { const v = vil._wf.at(x, y); return v >= 999 ? 99 : Math.max(1, v - VillageLayout.LOT_R); };
  const farmAt = (x, y, strict) => (strict && vil._potSet.has(x + ',' + y)) || vil._farmSet.has(x + ',' + y);
  // reject(x,y,strict) → 사유 문자열(불가) 또는 null(가능). 자동 배치는 사유를 버리고 continue만 한다.
  const reject = (x, y, strict) => {
    for (const h of vil._houseCells) if (Math.hypot(h.cx - x, h.cy - y) < HG) return `기존 집과 너무 가까움(<${HG})`;
    if (vil._site && Math.hypot(vil._site.cx - x, vil._site.cy - y) < HG) return '공사 중인 마을 집터와 너무 가까움';
    if (vil._psite && Math.hypot(vil._psite.cx - x, vil._psite.cy - y) < HG) return '다른 의뢰 집터와 너무 가까움';
    for (const [dx, dy] of VillageLayout.LOT_CELLS) {
      const xx = x + dx, yy = y + dy;
      if (!vil._terrSet.has(xx + ',' + yy)) return '마을 영토 밖';
      if (state.ta.isBlocked(xx, yy)) return '부지 불가(물·바위)';
      if (farmAt(xx, yy, strict)) return '개간 농지 위';
    }
    for (const [dx, dy] of VillageLayout.LOT_GUARD) if (state.ta.isWater && state.ta.isWater(x + dx, y + dy)) return '물가 완충 침범(침수)';
    for (const g2 of vil._granList) {
      if (g2.cx + 2 >= x - 6 && g2.cx - 2 <= x + 1 && g2.cy + 1 >= y - 6 && g2.cy - 1 <= y - 1) return '곳간과 겹침';
      if (g2.cx + 2 >= x + 1 && g2.cx - 2 <= x + 4 && g2.cy + 1 >= y + 1 && g2.cy - 1 <= y + 4) return '곳간과 겹침';
    }
    // ★[11차 T3↔T4 상호작용] 환호 도랑 위에는 집을 못 짓는다. 도랑은 지형(ta)이 아니라 마을 소유 사물이라
    //   state.ta.isBlocked가 모른다 — 여기서 명시하지 않으면 부지가 해자를 깔고 앉는다(두 층을 같은 밤에 넣은 대가).
    if (vil._ditch && vil._ditch.length) {
      const D = vil._ditchSet || (vil._ditchSet = new Set(vil._ditch.map(c => c.cx + ',' + c.cy)));
      for (const [dx, dy] of VillageLayout.LOT_CELLS) if (D.has((x + dx) + ',' + (y + dy))) return '환호 도랑 위';
    }
    return null;
  };
  return { W_PEN_K, HG, wnd, farmAt, reject };
}

// ★★[11차 T4 — 랩 B안 서버 이식] 플레이어가 마을 영토 안에 집터를 지정하면 그 마을 NPC 크루가 지어 준다.
//   랩 10차 정본(psite 하네스가 검증한 것)의 규약을 그대로 옮긴다:
//     ① 자리 = 마을 자동 배치와 **같은 필터**(_lifeSiteFilters) ② 진척 = 크루 현장 노동만
//     ③ 상태머신 불변 — 대상 포인터만 확장 ④ 마을이 굶지 않게 **여유 크루만**
//     ⑤ 마을 침대 명부·주택 수급에 안 들어감
//   ★예비 크루 수: 랩은 연속시간 적산이라 포화점이 4명이었지만, **서버는 하루 진척이
//     min(LIFE_CREW, pop) × LIFE_STAGE_PDAY로 이미 상한**이다 → 서버의 포화점은 LIFE_CREW(2) 그 자체.
//     즉 vil._buildCrew가 LIFE_CREW에 닿은 뒤의 크루는 마을 집터에 붙어도 진척이 0이다.
//     "관례값이 아니라 포화점을 계산하라"는 원칙은 같고, 숫자는 각 모델의 상수에서 유도된다.
function lifeRequestPlayerSite(vil, x, y, ownerId, ownerName) {
  if (!vil || !state.ta) return { err: '마을 없음' };
  if (!vil._terrSet || !vil._terrSet.size) return { err: '마을이 아직 깨어나지 않음(영토 0셀)' };
  if (vil._psite) return { err: '이 마을엔 이미 의뢰한 집터가 있다(완공 후 다시)' };
  x = Math.round(x / 2) * 2; y = Math.round(y / 2) * 2;                       // 짝수 격자 스냅(가장 가까운 짝수 — 랩 교정분)
  if (Math.hypot(x - vil.ccx, y - vil.ccy) < VillageLayout.HALL_CLEAR) return { err: `큰집 마당 침범(r<${VillageLayout.HALL_CLEAR})` };
  const F = _lifeSiteFilters(vil);
  const why = F.reject(x, y, false);                                          // strict=false = 미개간 잠재농지는 선점 허용(자동 배치 2패스와 동일)
  if (why) return { err: why };
  for (const [dx, dy] of VillageLayout.LOT_CELLS) vil._potSet.delete((x + dx) + ',' + (y + dy));   // 선점 부지는 잠재농지에서 제거
  const bo = state.deps.liveBuildRow ? state.deps.liveBuildRow('hut_site', (x - 2.5) * SZ, (y - 3.5) * SZ,
    { stage: 1, x0: x - 5, y0: y - 5, x1: x + 0, y1: y - 2, owner: ownerId, psite: 1 }, ownerId, ownerName || '의뢰 움집터', null) : null;
  if (bo) state.deps.broadcast({ type: 'building_added', building: bo });
  state.db.insertVillageBuilding({ village_id: vil.dbId, type: 'psitework', cx: x, cy: y, floors: 0, data: JSON.stringify({ owner: ownerId }) });
  vil._psite = { cx: x, cy: y, stage: 1, bo, player: 1, owner: ownerId, ownerName: ownerName || null };
  vil._psiteCrew = 0;
  console.log(`[${state.zoneId}] 🏠 [${vil.name}] 플레이어 의뢰 집터 @(${x},${y}) owner=${ownerId} — 여유 크루가 짓는다`);
  return { ok: true, site: vil._psite };
}
// 가장 가까운 마을(영토 안이어야 한다) — zone.js가 클릭 셀로 마을을 찾을 때 쓴다.
function villageOwningCell(x, y) {
  for (const vil of state.villages) if (vil._terrSet && vil._terrSet.has(x + ',' + y)) return vil;
  return null;
}

function _lifeAddHouseSite(vil) {   // 랩 addHouseSite 동형(서버판): 2패스(잠재농지 회피→잠식 비용) + 전 하드 필터
  if (vil._site || !state.ta) return;
  if (!vil._wf) {   // 물거리 EDT 캐시(마을당 1회 — 영토 bbox±32, 랩 s._wf 동형)
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const k of vil._terrSet) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    vil._wf = VillageLayout.waterEDT(state.ta, bx0 - 32, by0 - 32, bx1 + 32, by1 + 32);
  }
  const F = _lifeSiteFilters(vil);
  const W_PEN_K = F.W_PEN_K, wnd = F.wnd, farmAt = F.farmAt;
  for (const strict of [true, false]) {
    const cand = [];
    for (const k of vil._terrSet) {
      const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1);
      if ((x & 1) || (y & 1)) continue;                                        // 짝수 격자(레이아웃 동일)
      const r = Math.hypot(x - vil.ccx, y - vil.ccy); if (r < VillageLayout.HALL_CLEAR) continue;
      if (farmAt(x, y, strict)) continue;
      const wd = wnd(x, y); let sc = r + (wd < 99 ? W_PEN_K / (wd * wd) : 0);  // 물가 연속 페널티 K/d²
      if (!strict) { let nong = 0; for (const [dx, dy] of VillageLayout.LOT_CELLS) if (vil._potSet.has((x + dx) + ',' + (y + dy))) nong++; sc += nong * 6; }   // 2패스 잠식 비용
      cand.push([x, y, sc]);
    }
    cand.sort((a2, b2) => a2[2] - b2[2]);
    for (const c2 of cand) {
      const x = c2[0], y = c2[1];
      if (F.reject(x, y, strict)) continue;   // ★[11차 T4] 하드 필터는 _lifeSiteFilters 소유 — 플레이어 의뢰 터와 **같은 코드**(랩 siteFilters 규약 이식)
      if (!strict) for (const [dx, dy] of VillageLayout.LOT_CELLS) vil._potSet.delete((x + dx) + ',' + (y + dy));   // 선점 부지는 잠재농지 제거
      const bo = state.deps.liveBuildRow ? state.deps.liveBuildRow('hut_site', (x - 2.5) * SZ, (y - 3.5) * SZ,
        { stage: 1, x0: x - 5, y0: y - 5, x1: x + 0, y1: y - 2, owner: 'npc', floor: 0 }, `npc_simvil_${vil.dbId}`, `${vil.name} 새 움집터`, null) : null;   // ★NPC 정본 렉트를 hut_site 규약에 실음(완공 기하 동일)
      if (bo) state.deps.broadcast({ type: 'building_added', building: bo });
      state.db.insertVillageBuilding({ village_id: vil.dbId, type: 'housesite', cx: x, cy: y, floors: 0, data: null });
      vil._site = { cx: x, cy: y, stage: 1, bo };
      console.log(`[${state.zoneId}] 🏘️ [${vil.name}] 생활층 신축 터 @(${x},${y}) — 크루 시공 시작`);
      return;
    }
  }
}
function _lifeAdvanceSite(vil, which) {   // 크루 1단계 완수 → 단계 전진(클라 hut_site 렌더가 1~3단계 표시) / 4→완공
  const s2 = (which === 'p') ? vil._psite : vil._site; if (!s2) return;
  if (which !== 'p') vil._mSt = (vil._mSt || 0) + 1;   // ★[LIFE_* 튜닝 계측] 오늘 전진한 **마을** 건설 단계 수(의뢰분은 마을 지표 아님)
  s2.stage++;
  if (s2.stage <= 3) {
    if (s2.bo) { s2.bo.data.stage = s2.stage; try { state.db.updateBuildingData(s2.bo.dbId, JSON.stringify(s2.bo.data)); } catch (e) {} state.deps.broadcast({ type: 'building_added', building: s2.bo }); }
    return;
  }
  _lifeCompleteHouse(vil, which);
}
function _lifeCompleteHouse(vil, which) {   // 완공: 터 제거 + NPC 정본 6×4 실체화(hut 태그) + house/yard/garden 영속 + 라이브
  const isP = (which === 'p');                       // ★[11차 T4] 플레이어 의뢰 집 — 실체는 같고, **마을 명부에만 안 들어간다**
  const s2 = isP ? vil._psite : vil._site; if (!s2) return;
  const dp = state.deps;
  if (s2.bo) { try { state.db.deleteBuilding(s2.bo.dbId); } catch (e) {} if (dp.buildings) dp.buildings.delete(s2.bo.id); try { if (dp.chunkManager && dp.chunkManager.removeBuilding) dp.chunkManager.removeBuilding(s2.bo); } catch (e) {} dp.broadcast({ type: 'building_removed', id: s2.bo.id }); }
  const cx = s2.cx, cy = s2.cy;
  const ownerId = isP ? s2.owner : `npc_simvil_${vil.dbId}`;                       // 소유 = 의뢰한 플레이어(약탈·철거 권한이 기존 owner 규약을 그대로 탄다)
  const onm = isP ? (s2.ownerName || '의뢰 움집') : `${vil.name} 움집`, made = [];
  const tag = [cx - 5, cy - 5, cx + 0, cy - 2], doorXs = new Set([cx - 3, cx - 2]);
  const lb = dp.liveBuildRow;
  if (lb) {
    for (let x = cx - 5; x <= cx + 0; x++) {
      lb('wall', x * SZ, (cy - 5) * SZ, { side: 'N', floor: 0, hut: tag }, ownerId, onm, made);
      if (!doorXs.has(x)) lb('wall', x * SZ, (cy - 1) * SZ, { side: 'N', floor: 0, hut: tag }, ownerId, onm, made);
    }
    for (let y = cy - 5; y <= cy - 2; y++) { lb('wall', (cx + 0) * SZ, y * SZ, { side: 'E', floor: 0, hut: tag }, ownerId, onm, made); lb('wall', (cx - 6) * SZ, y * SZ, { side: 'E', floor: 0, hut: tag }, ownerId, onm, made); }
    for (let x = cx - 5; x <= cx + 0; x++) for (let y = cy - 5; y <= cy - 2; y++) lb('floor', x * SZ + SZ / 2, y * SZ + SZ / 2, { floor: 0, hut: tag }, ownerId, onm, made);
    dp.broadcast({ type: 'buildings_spawn', buildings: made });
  }
  // ★[11차 T4] 의뢰 집은 'phouse' — 다음 부팅에 **집채는 되살아나되 마을 침대 명부엔 안 들어간다**(랩 ⑤ 규약 이식).
  state.db.insertVillageBuilding({ village_id: vil.dbId, type: isP ? 'phouse' : 'house', cx, cy, floors: 1, data: isP ? JSON.stringify({ owner: ownerId }) : null });
  if (!isP) { vil._houseCells.push({ cx, cy }); vil.housesPx.push({ x: cx * SZ + SZ / 2, y: cy * SZ + SZ / 2 }); }
  const tiles = [];
  for (const [dx, dy] of VillageLayout.LOT_CELLS) {   // 마당·텃밭(시딩 블록 동형)
    const x = cx + dx, y = cy + dy;
    if (!vil._terrSet.has(x + ',' + y)) continue;
    if (dx >= -5 && dx <= 0 && dy >= -5 && dy <= -2) continue;
    const isG = dx >= 1 && dx <= 4 && dy >= 1 && dy <= 4;
    const rid = state.db.insertVillageBuilding({ village_id: vil.dbId, type: isG ? 'garden' : 'yard', cx: x, cy: y, floors: 0, data: null });
    const bo2 = { id: `vb${rid}`, dbId: null, sim: true, type: 'vtile', ownerId, ownerName: `${vil.name} 마당`, x: x * SZ + SZ / 2, y: y * SZ + SZ / 2, data: { sim: 1, kind: isG ? 'garden' : 'yard' }, floor: 0, villageId: vil.dbId };
    try { if (dp.chunkManager) dp.chunkManager.insertBuilding(bo2); } catch (e) {}
    tiles.push(bo2);
  }
  if (tiles.length) dp.broadcast({ type: 'buildings_spawn', buildings: tiles });
  if (isP) {
    (vil._pHouses = vil._pHouses || []).push({ cx, cy, data: JSON.stringify({ owner: ownerId }) });   // 관측용 명부(마을 침대 명부와 별개 — /lifedbg pHouses)
    vil._psite = null; vil._psiteCrew = 0;
    try { state.db.db.prepare("DELETE FROM village_buildings WHERE village_id=? AND type='psitework' AND cx=? AND cy=?").run(vil.dbId, cx, cy); } catch (e) {}
    console.log(`[${state.zoneId}] 🏠 [${vil.name}] 플레이어 의뢰 움집 완공 @(${cx},${cy}) owner=${ownerId}`);
  } else {
    vil._site = null; vil._buildCrew = 0;
    console.log(`[${state.zoneId}] 🏘️ [${vil.name}] 생활층 신축 움집 완공 @(${cx},${cy})`);
  }
}
// ★[곳간 증설 런타임 — 랩 _granAdd 링] 랩 상수·공식 verbatim:
//   const G_W=5,G_H=3,G_CAP=2500,G_MAX=8,G_BUILDD=6;
//   if(s.gran){const _gn=Math.max(1,Math.min(G_MAX,Math.ceil((s.food||0)/G_CAP)));if(s.gran.length<_gn)_granAdd(s);
//     for(const g of s.gran)if(!g.done){g.built+=1/G_BUILDD;...}}
//   = 식량 재고 2500인일당 곳간 1동(최소 1·최대 8), 하루 1동씩 착공, 완공까지 6일.
//   자리는 시딩과 동일한 pickGranarySpot(링 r11~15·남측 회피·영토·물 16 이격·집채/텃밭/큰집/기존 곳간 비겹침).
// ★★[곳간② 2단계 — 랩 이식] NPC의 물리적 저장·인출. 랩 전쟁실험실 `★곳간②` 블록 대응.
//   ┌ 회계는 econ 소유다. 서버는 애초에 식량 수치를 만들지 않으므로(수확=상태 삭제+연출) 랩의 `_y`에
//   │ 대응하는 값이 **서버엔 존재하지 않는다**(CROPS에 yieldC 없음). 그래서 물리 층은 **'수확한 칸 수'**를
//   │ 짐으로 센다 — 회계와 무관한 순수 물리량이고 econ storage를 절대 건드리지 않는다.
//   └ vil._granStock(Map "cx,cy"→수량)도 같은 성격의 **물리 장부**다.
//   랩 규약 유지: 사다리=곳간 5×3 남쪽 인접칸(문 없는 고상) · 그 칸 체류가 저장/인출 행위 ·
//                자리·경로 없으면 false 폴스루(회귀 0) · 라벨은 기존 것만(운반·저장·인출).
const G_CARRY = 3;            // 짐 상한 = 수확 칸 수(이만큼 모이면 곳간행)
const G_STOREW = 6000;        // 사다리 체류(저장) ms — 랩 G_STOREW 6유닛 대응
const G_DRAWW = 5000;         // 사다리 체류(인출) ms — 랩 G_DRAWW 5유닛 대응
const G_DRAW = 2;             // 1회 인출량(물리 단위)
const G_STOCK_CAP = 60;       // 곳간 1동 물리 수용(칸 수 기준) — 넘으면 다음 곳간
function _granStockOf(vil, g) { if (!vil._granStock) vil._granStock = new Map(); return vil._granStock.get(g.cx + ',' + g.cy) || 0; }
function _granStockAdd(vil, g, d) { if (!vil._granStock) vil._granStock = new Map(); const k = g.cx + ',' + g.cy; vil._granStock.set(k, Math.max(0, (vil._granStock.get(k) || 0) + d)); }
function _granLadder(g) { return { x: g.cx * SZ + SZ / 2, y: (g.cy + 2) * SZ + SZ / 2 }; }   // ★문 없는 고상곳간 — 5×3 렉트[cy-1..cy+1] 남쪽 인접칸이 사다리 자리
function _granPick(vil, npc, forDraw) {         // 저장=여유 있는 곳 / 인출=재고 있는 곳 중 최근접
  let best = null, bd = 1e9;
  for (const g of (vil._granList || [])) {
    const st = _granStockOf(vil, g);
    if (forDraw ? !(st > 0) : (st >= G_STOCK_CAP)) continue;
    const L = _granLadder(g), d = Math.hypot(L.x - npc.x, L.y - npc.y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}
function _granGo(vil, npc, forDraw) {           // 곳간행 개시 — 자리 없으면 false(호출측이 기존 흐름 유지)
  const g = _granPick(vil, npc, forDraw); if (!g) return false;
  npc._granTask = { cx: g.cx, cy: g.cy, draw: !!forDraw, at: 0 };
  return true;
}
// 곳간행 실행 — 이번 틱 소유권을 가지면 true. (랩 toGran/gran 2상태를 서버 _lifeTask 대신 _granTask로 표현)
function _lifeGranStep(vil, npc, now) {
  const t = npc._granTask; if (!t) return false;
  const g = (vil._granList || []).find((x) => x.cx === t.cx && x.cy === t.cy);
  if (!g) { npc._granTask = null; return false; }                    // 곳간이 사라짐(재배치) — 폴스루
  const L = _granLadder(g);
  if (!t.at) {                                                       // ① 사다리로 이동
    npc.behavior = 'wander'; npc.targetX = L.x; npc.targetY = L.y; npc.gatherTarget = null;
    _lifeAct(npc, t.draw ? '인출' : '운반');
    if (Math.hypot(npc.x - L.x, npc.y - L.y) <= 44) { t.at = now; _lifeAct(npc, t.draw ? '인출' : '저장'); }
    return true;
  }
  if (now - t.at < (t.draw ? G_DRAWW : G_STOREW)) {                  // ② 사다리 체류 = 저장/인출 행위
    _lifeAct(npc, t.draw ? '인출' : '저장');
    return true;
  }
  // ★[곳간② 순환 방어] 인출을 마치면 **오늘 곳간 용무 종료** 도장을 찍는다.
  //   랩은 인출 직후 state='toHome'으로 상태를 떠나 그날 다시 work 탈출 검사에 걸리지 않는다(8010행).
  //   서버는 상태가 없고 스케줄 게이트를 매 틱 재평가하므로, 도장이 없으면
  //   퇴근 훅이 저장(짐>0)↔인출(빈손)을 무한 왕복시킨다 — 집에 못 간다.
  if (t.draw) { const q = Math.min(G_DRAW, _granStockOf(vil, g)); _granStockAdd(vil, g, -q); npc._carry = (npc._carry || 0) + q; npc._granD = state.dayMs ? gameDayOf(now) : 0; }
  else { _granStockAdd(vil, g, npc._carry || 0); npc._carry = 0; }   // ③ 정산(물리 장부만 — econ 무접촉)
  npc._granTask = null;
  return false;                                                      // 소유권 반납 → 이번 틱부터 평소 일과
}
// ★[곳간② 클라 표시] 물리 재고를 화면에 — 사다리 앞 칸 짐더미로 보이게 하는 최소 침습 배선.
//   ①welcome에 현재 스냅샷(granStocks) ②이후엔 **변한 곳간만** 1초 스로틀 델타 방송(gran_stock).
//   회계(econ storage)와 무관한 물리 장부만 나간다. 페이로드는 flat [cx,cy,수량,…] (JSON 소형화 — 영토 규약 동형).
let _granBcAt = 0;
function granStocks() {                      // zone.js welcome 소비 — 전 마을 현재 재고 스냅샷
  const g = [];
  if (!state.ready) return g;
  for (const vil of state.villages) {
    if (!vil._granStock) continue;
    for (const [k, v] of vil._granStock) {
      if (!(v > 0)) continue;
      const ci = k.indexOf(','); g.push(+k.slice(0, ci), +k.slice(ci + 1), v);
    }
  }
  return g;
}
function _granBroadcast(now) {               // onGameTick(30Hz) 훅 — 변화분만, 1초 스로틀
  if (!state.deps || !state.deps.broadcast) return;
  if (now - _granBcAt < 1000) return;
  _granBcAt = now;
  const g = [];
  for (const vil of state.villages) {
    if (!vil._granStock || !vil._granStock.size) continue;
    if (!vil._granSent) vil._granSent = new Map();
    for (const [k, v] of vil._granStock) {
      if (vil._granSent.get(k) === v) continue;
      vil._granSent.set(k, v);
      const ci = k.indexOf(','); g.push(+k.slice(0, ci), +k.slice(ci + 1), v);
    }
  }
  if (g.length) state.deps.broadcast({ type: 'gran_stock', g });
}

// ★★[10차 T4] 장마당(계절 장) — 상태 플래그 1개. **새 상태·새 채널·새 타이머를 만들지 않는다.**
//   고증(설계_장마당_환호_고증과_설계안.md A-1): 청동기시대 상설 시장의 근거는 없다. 그래서 "열려 있는 시장"이
//   따로 있는 게 아니라, **캐러밴이 큰집 마당에 머무는 동안만** 그 자리가 장(場)이 된다.
//   실체 정의 = `body.phase === 'linger'`(이미 있는 것) 인 캐러밴의 **목적지 마을**. lingerUntil이 지나면
//   startReturnLeg가 phase를 바꾸므로 장은 저절로 파한다 — 별도 만료 로직이 없다(그게 이 설계의 요점).
function marketVillages() {                  // → flat [ccx, ccy, …] (영토·곳간 페이로드와 같은 소형 규약)
  const out = [];
  if (!state.ready || !state.caravanBodies) return out;
  const seen = new Set();
  for (const body of state.caravanBodies.values()) {
    if (!body || body.phase !== 'linger') continue;
    const vil = state.byEcon.get(body.toV);
    if (!vil || seen.has(vil)) continue;
    seen.add(vil);
    out.push(vil.ccx, vil.ccy);
  }
  return out;
}
let _mktSig = '';
function _mktBroadcast() {                   // onGameTick 훅 — **바뀔 때만** 방송(캐러밴 도착·출발은 하루 몇 번)
  if (!state.deps || !state.deps.broadcast) return;
  const m = marketVillages(), sig = m.join(',');
  if (sig === _mktSig) return;
  _mktSig = sig;
  state.deps.broadcast({ type: 'markets', m });
}
const G_CAP = 2500, G_MAX = 8, G_BUILDD = 6;
function _lifeGranAdd(vil) {
  if (!state.ta || !vil.econ || !vil._granList || !vil._terrSet || !vil._terrSet.size) return;
  const day = (state.world && state.world.day) || 0;
  // ① 착공분 완공(랩 built 누적 6일 = 여기선 착공일+G_BUILDD 도래) — 하루 1동 원칙상 완공 처리가 우선.
  if (vil._granPend) {
    if (day >= vil._granPend.day) { const p = vil._granPend; vil._granPend = null; _lifeCompleteGranary(vil, p.cx, p.cy); }
    return;
  }
  // ② 재고 비례 목표 대비 부족분 1동 착공
  const food = (vil.econ.storage && vil.econ.storage.food) || 0;
  const _gn = Math.max(1, Math.min(G_MAX, Math.ceil(food / G_CAP)));
  if (vil._granList.length >= _gn) return;
  // 런타임엔 시딩 레이아웃 객체가 없으므로 영속 집합으로 동형 컨테이너를 구성(값·규칙 동일).
  //   farmSet = 기경지(farm/dry) + 미개간 존닝(potSet) — 시딩의 nongZone+farmland+dryfield 합집합과 같은 의미.
  const farmSet = new Set(vil._farmSet); for (const k of vil._potSet) farmSet.add(k);
  const g = pickGranarySpot(state.ta, {
    center: { cx: vil.ccx, cy: vil.ccy },
    ownSet: vil._terrSet, farmSet, houses: vil._houseCells, gran: vil._granList,
  });
  if (!g) return;   // 링 여력 없음 — 관용(시딩 '자리 없음 스킵'과 동일)
  vil._granPend = { cx: g.cx, cy: g.cy, day: day + G_BUILDD };
  console.log(`[${state.zoneId}] 🏘️ [${vil.name}] 곳간 증설 착공 @(${g.cx},${g.cy}) — 식량 ${Math.round(food)} → 목표 ${_gn}동(현재 ${vil._granList.length}), ${G_BUILDD}일 후 완공`);
}
// 완공: 5×3 밀폐 렉트 실체화(gran 태그) + village_buildings 영속 + 라이브 방송. _lifeCompleteHouse 동형 경로.
//   ※재부팅 시 buildings 테이블은 wipe 후 village_buildings에서 전량 재기록되므로 중복 생성 없음(materializeVillageStructures).
function _lifeCompleteGranary(vil, cx, cy) {
  const dp = state.deps, ownerId = `npc_simvil_${vil.dbId}`, onm = `${vil.name} 곳간`, made = [];
  const tag = [cx - 2, cy - 1, cx + 2, cy + 1];
  const lb = dp.liveBuildRow;
  if (lb) {
    for (let x = cx - 2; x <= cx + 2; x++) {                      // 북·남변(문 없음 — 고상 사다리 출입 고증)
      lb('wall', x * SZ, (cy - 1) * SZ, { side: 'N', floor: 0, gran: tag }, ownerId, onm, made);
      lb('wall', x * SZ, (cy + 2) * SZ, { side: 'N', floor: 0, gran: tag }, ownerId, onm, made);
    }
    for (let y = cy - 1; y <= cy + 1; y++) {                      // 동·서변
      lb('wall', (cx + 2) * SZ, y * SZ, { side: 'E', floor: 0, gran: tag }, ownerId, onm, made);
      lb('wall', (cx - 3) * SZ, y * SZ, { side: 'E', floor: 0, gran: tag }, ownerId, onm, made);
    }
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 1; y <= cy + 1; y++)
      lb('floor', x * SZ + SZ / 2, y * SZ + SZ / 2, { floor: 0, gran: tag }, ownerId, onm, made);
    if (made.length) dp.broadcast({ type: 'buildings_spawn', buildings: made });
  }
  state.db.insertVillageBuilding({ village_id: vil.dbId, type: 'granary', cx, cy, floors: 1, data: null });
  vil._granList.push({ cx, cy });
  console.log(`[${state.zoneId}] 🏘️ [${vil.name}] 곳간 증설 완공 @(${cx},${cy}) — 총 ${vil._granList.length}동`);
}

// ★[HSK↔econ 스킬 연결] 랩(전쟁실험실) 직업 배치 루틴의 사냥꾼 연결 블록 verbatim 이식.
//   랩 원문:
//     {const _eh=(s.econ&&s.econ.npcs)?s.econ.npcs.filter(n=>n.currentJob==='hunter'):[];
//      for(let i2=0;i2<hu.length;i2++){ hu[i2]._esk=_eh.length?_eh[i2%_eh.length]:null;
//        hu[i2]._fgl=(s.econ&&s.econ._fGlut)||0;
//        hu[i2]._arm=(s.econ&&s.econ.storage)?Math.min(1,(s.econ.storage.armor||0)/Math.max(1,(s.econ.counts.warrior||0)+(s.econ.counts.hunter||0))):0;}}
//   서버 차이는 컨테이너뿐: 랩 hu(시각 사냥꾼 배열) → 이 마을의 simJob==='hunter' NPC(npcPids 순서 = 안정 정렬).
//   ★살아있는 참조를 심는다 — econ 일일 xp 성장이 다음 사격의 명중률(HSK_W)·잠행/도살(HSK_F)에 그대로 반영.
//   개체별 페어링(랩과 동일). econ 사냥꾼 수가 시각 사냥꾼보다 적으면 라운드로빈으로 공유(랩 동형).
//   ※서버 econ v2엔 _fGlut 미존재 → _fgl=0 폴백(무효과, wildlife 470행 주석의 그 경로). 엔진 재인라인 시 자동 활성.
function _lifeHunterEconLink(vil) {
  const econ = vil.econ, pl = state.deps.players;
  if (!econ || !pl || !vil.npcPids || !vil.npcPids.length) return;
  const hu = [];
  for (const pid of vil.npcPids) { const p = pl.get(pid); if (p && p.simJob === 'hunter') hu.push(p); }
  if (!hu.length) return;
  const _eh = (econ && econ.npcs) ? econ.npcs.filter(n => n.currentJob === 'hunter') : [];
  const _armV = (econ && econ.storage)
    ? Math.min(1, (econ.storage.armor || 0) / Math.max(1, ((econ.counts && econ.counts.warrior) || 0) + ((econ.counts && econ.counts.hunter) || 0)))
    : 0;
  for (let i2 = 0; i2 < hu.length; i2++) {
    hu[i2]._esk = _eh.length ? _eh[i2 % _eh.length] : null;
    hu[i2]._fgl = (econ && econ._fGlut) || 0;
    hu[i2]._arm = _armV;
  }
}

function _lifeDaily(vil) {   // 게임일 경계: 크루·클레임 재대사(디스폰 누수 자가치유) + 신축 판단 + 작물 하루 성장
  if (!LIFE_ON || !vil._terrSet || !vil._terrSet.size || !vil.econ) return;
  _lifeVL();
  // ★[LIFE_* 튜닝 계측] 하루 누계를 '어제치'로 확정하고 리셋 — /lifedbg가 dCl/dSt/dTk로 노출한다.
  vil._dCl = vil._mCl || 0; vil._dSt = vil._mSt || 0; vil._dTk = vil._mTk || 0;
  vil._mCl = 0; vil._mSt = 0; vil._mTk = 0;
  vil._clearCrew = 0; vil._buildCrew = 0; vil._claim = new Set(); vil._frontDay = -1;
  vil._cropClaim = new Set(); vil._jobSites = null;   // ★[생활 층 100% ③] 작물 셀 클레임·직업 현장 캐시 일일 리셋(자가치유·현장 재평가)
  _lifeHunterEconLink(vil);   // ★[HSK↔econ] 시각 사냥꾼 ↔ econ 사냥꾼 NPC 연결(랩 배치 루틴 verbatim — 일일 재대사)
  try { _lifeGranAdd(vil); } catch (e) { console.error(`[${state.zoneId}] 생활층 곳간 증설 실패(${vil.name}):`, e.message); }   // ★[곳간 증설 런타임] 재고 비례 링 증설(랩 _granAdd)
  // 작물 하루 틱(랩 7920 동형): 김매기·물대기 놓치면 품질↓ · 병충해 발생(내일 방제 일감) — 상태·연출만(식량은 econ 소유)
  if (vil._crop && vil._crop.size) {
    const day = state.dayMs ? gameDayOf(Date.now()) : 0;
    for (const [k, e] of vil._crop) {
      if (day - e.p >= e.c.grow) continue;   // 익음 — 수확 일감(농부 우선순위 5)
      const wd = e.wd || 0, gf = (day - e.p) / e.c.grow;
      if (e.ps) e.q -= L_QP;
      else if (wd < L_WEEDS.length && gf >= L_WEEDS[wd] + 0.06) e.q -= L_QW;
      if (!vil._drySet.has(k) && day - (e.w || e.p) >= L_WATERGAP + 8) e.q -= L_QW;
      if (!e.ps && Math.random() < L_PESTP) e.ps = 1;
      if (e.q < L_QMIN) e.q = L_QMIN;
    }
  }
  vil._psiteCrew = 0;
  for (const pid of vil.npcPids) { const p = state.deps.players.get(pid); if (p && p._lifeTask) { if (p._lifeTask.k === 'clear') { vil._claim.add(p._lifeTask.cx + ',' + p._lifeTask.cy); vil._clearCrew++; } else if (p._lifeTask.k === 'build') { if (p._lifeTask.ps) vil._psiteCrew++; else vil._buildCrew++; } } }
  if (vil._pendSite && !vil._site) {   // 재부팅 복원: 진행 중이던 터 재실체화(단계 1부터 — 관용)
    const ps = vil._pendSite; vil._pendSite = null;
    if (state.deps.liveBuildRow) {
      const bo = state.deps.liveBuildRow('hut_site', (ps.cx - 2.5) * SZ, (ps.cy - 3.5) * SZ, { stage: 1, x0: ps.cx - 5, y0: ps.cy - 5, x1: ps.cx + 0, y1: ps.cy - 2, owner: 'npc', floor: 0 }, `npc_simvil_${vil.dbId}`, `${vil.name} 새 움집터`, null);
      state.deps.broadcast({ type: 'building_added', building: bo });
      vil._site = { cx: ps.cx, cy: ps.cy, stage: 1, bo };
    }
  }
  const cap = vil._houseCells.length * (VillageLayout.HOUSE_CAP || 6);
  if (!vil._site && vil.econ.npcs.length > cap * 0.92) { try { _lifeAddHouseSite(vil); } catch (e) { console.error(`[${state.zoneId}] 생활층 신축 실패(${vil.name}):`, e.message); } }
  // ★[헤드리스 결산] 관측자 없는 마을 = 랩 빨리감기 — 하루치 물리 결과 일괄 적산(관측 마을은 실걸음 크루 소유)
  const anyNear = state.deps.anyViewerNear;
  if (!(anyNear && anyNear(vil.ccx * SZ + SZ / 2, vil.ccy * SZ + SZ / 2, (vil._maxRPx || 800) + 1600))) {
    try { _lifeHeadlessDay(vil); } catch (e) { console.error(`[${state.zoneId}] 생활층 헤드리스 결산 실패(${vil.name}):`, e.message); }
  }
  // ★[NPC hp 랩 100% — 랩 7576~7590 verbatim] 부상 회복(일일) + 부상 노동력 계수. 회복 = 요양18·근무6/일 ×건강F×행복F×식량F.
  //   zone.js 초당 회복(플레이어 전용)에서 마을 NPC는 제외되며(simVillageId 게이트) 이 일일 규칙이 유일한 회복 경로 —
  //   요양 수일 = 노동 손실 실체(랩 herb 수요·_laborMul의 전제). 개체 허기·아사 없음(식량 사망 = econ 기근 인구감소가 유일).
  //   서버 econ v2엔 lastStats·storage.herb 미존재 → 랩 폴백 경로 그대로(계수 1.0·약재 0=가속 없음). 엔진 재인라인 시 자동 활성.
  //   모든 마을(활성·동면) 게임일 경계마다 — 동면 마을도 랩과 동일하게 회복(헤드리스 결산과 같은 원리).
  try {
    const econ = vil.econ, _pl = state.deps.players;
    if (econ && vil.npcPids && vil.npcPids.length) {
      const st = econ.lastStats;
      const hpF = Math.max(0.4, Math.min(1.5, 0.5 + (st ? st.health : 0.5)));
      const hapF = Math.max(0.4, Math.min(1.5, 0.5 + (st ? st.happiness : 0.5)));
      const _food = (econ.storage && econ.storage.food) || 0;
      const _pop = (econ.npcs && econ.npcs.length) || vil.npcPids.length;   // 랩 s.pop=econ 인구 동형
      const foodF = Math.max(0.35, Math.min(1.4, _food / Math.max(1, _pop * 30)));
      const regenMul = hpF * hapF * foodF;   // 식량 하한 0.35(기근에도 소량 회복 → 죽음 나선 방지 — 랩 동형)
      const _as = [];
      let _restN = 0;
      for (const pid of vil.npcPids) { const a = _pl.get(pid); if (a && a.isNpc) { _as.push(a); if (a._rest && (a.hp || 0) < (a.maxHp || 100)) _restN++; } }
      let _herbMul = 1;   // 약재 치료(§9 2차): 요양자 1인당 일 0.5 소비 → 요양 회복 ×1.6(부분 공급=비례, 없으면 현행)
      if (_restN > 0) {
        const _hN = _restN * 0.5, _hH = (econ.storage && econ.storage.herb) || 0, _hT = Math.min(_hN, _hH);
        if (_hT > 0) { econ.storage.herb = _hH - _hT; econ._herbUsed = (econ._herbUsed || 0) + _hT; _herbMul = 1 + 0.6 * (_hT / _hN); }
      }
      let labSum = 0;
      for (const a of _as) {
        const mx = a.maxHp || 100;
        if (a.hp > 0 && a.hp < mx) { a.hp = Math.min(mx, a.hp + (a._rest ? 18 * _herbMul : 6) * regenMul); if (a.hp >= mx) a._rest = 0; }   // 만피 회복 시 요양 해제(히스테리시스) — 요양만 약재 가속
        labSum += a._rest ? 0 : (0.6 + 0.4 * Math.max(0, a.hp || 0) / mx);   // 노동력: 요양=0, 부상=0.6~1.0(hp율)
      }
      const _day = state.dayMs ? gameDayOf(Date.now()) : 0;
      const _mobF = (econ._warMobUntil && _day < econ._warMobUntil) ? Math.max(0.2, 1 - (econ._warMobFrac || 0)) : 1;   // 전쟁 동원: 차출자 생산 정지
      if (_as.length) econ._laborMul = (labSum / _as.length) * _mobF;   // 엔진 v2 미소비(재인라인 시 자동 활성) — 랩 s.econ._laborMul 동형
      const _hn = _as.reduce((k2, a) => k2 + (a.simJob === 'hunter' ? 1 : 0), 0);
      const _hev = vil._hEvD || 0; vil._hEvD = 0;   // 사냥 위험 학습(EMA α.05 ~20일 기억): 평온=0.03 수렴 — wildlife hurtNPC가 가중일 기록 시 자동 반영
      if (_hn > 0) econ._huntRisk = Math.min(0.6, (econ._huntRisk === undefined ? 0.08 : econ._huntRisk) * 0.95 + Math.max(0.03, Math.min(0.6, _hev / _hn * 0.5)) * 0.05);
    }
  } catch (e) { console.error(`[${state.zoneId}] 생활층 일일 회복 실패(${vil.name}):`, e.message); }
}
function npcLifeTick(npc, now) {   // zone.js decideNpcBehavior 훅(늑대 도주 뒤·야간 귀가 게이트 앞) — true=일과 소유(레거시 차단)
  if (!LIFE_ON) return false;
  const vil = state.byDbId && state.byDbId.get(npc.simVillageId);
  if (!vil || !vil._terrSet || !vil._terrSet.size) return false;
  _lifeVL();
  // ★[곳간②] 곳간행(운반·저장·인출)은 스케줄보다 우선 — 짐을 든 채 딴 데로 가지 않는다.
  //   단 밤(취침 구간)엔 중단하고 귀가시킨다(랩: 황혼 이후 저장은 바로 귀가 — 밤 헛걸음 제거).
  if (npc._granTask) {
    const _fvG = state.deps.worldPhase ? (state.deps.worldPhase(now) + (npc.simLonOff || 0)) % 1 : 0.35;
    if (_fvG >= (state.deps.dayPhaseRatio || 0.7)) { npc._granTask = null; }
    else if (_lifeGranStep(vil, npc, now)) return true;
  }
  // ══ 스케줄 게이트(랩 lifeLoop home 분기 7978~7987 동형 — 우선순위: 요양 > 밤·기상 전 취침 > 아침 추첨 > 반일 오후) ══
  const wpF = state.deps.worldPhase, dayR = state.deps.dayPhaseRatio || 0.7;
  const fv = wpF ? (wpF(now) + (npc.simLonOff || 0)) % 1 : 0.35;   // 경도 로컬 태양시(§19 동형 — 동쪽 마을이 먼저 깨고 먼저 잔다)
  const day = state.dayMs ? gameDayOf(now) : 0;
  // 요양(랩 a.rest 6298·7526): hp<60% 진입 → 진행 작업 반납·자택 요양. 만피 해제(회복=zone.js 자연 리젠 — 히스테리시스 동형)
  if (npc._rest) {
    if ((npc.hp || 0) >= (npc.maxHp || 100)) npc._rest = 0;
    else { _lifeDropTask(vil, npc); _lifeGoHome(npc, '요양'); return true; }
  } else if (npc.hp != null && npc.hp > 0 && npc.hp < (npc.maxHp || 100) * SCH_REST_IN) {
    npc._rest = 1; _lifeDropTask(vil, npc); _lifeGoHome(npc, '요양'); return true;
  }
  // 기상 시차(랩 a._dOff): 개인 결정론 오프셋 0~하루 3%(43분) — 마을 일괄 기상의 프레임 스파이크 분산 + 유기적 출근 풍경
  if (npc._dOff === undefined) npc._dOff = ((_pidHash(npc.pid) % 997) / 997) * SCH_DOFF;
  if (fv >= dayR || fv < npc._dOff) { npc._workT = null; _lifeGoHome(npc, '취침'); return true; }   // 밤·기상 전=취침(진행 작업 유지 — 아침 현장 재개, 노동 적산은 도착부터)
  // 아침 추첨(랩 a._hd/_half 7984): econ 여유노동(_idleFrac) 비율 = 오늘 반일 근무 확률 — 여가→행복의 시각화(궁핍촌 idle 0=항상 종일)
  if (npc._hd !== day) { npc._hd = day; npc._half = Math.random() < ((vil.econ && vil.econ._idleFrac) || 0); }
  const dayFrac = fv / dayR;   // 낮 진행률 0~1(랩 상수의 서버 환산 축)
  // 반일 오후(랩 7991 퇴근길 징발 — 일>건축>휴식): 미완공 집터 있으면 전 직업 건축 합류(상한 없음 — 랩 동형), 없으면 자택 휴식
  if (npc._half && dayFrac >= SCH_HALF_R) {
    if (!(npc._lifeTask && npc._lifeTask.k === 'build')) {
      _lifeDropTask(vil, npc);
      if (vil._site) { vil._buildCrew++; npc._lifeTask = { k: 'build', px: (vil._site.cx - 2.5) * SZ, py: (vil._site.cy - 0.5) * SZ, prog: 0 }; npc._workT = now; }
      else if (vil._psite) { vil._psiteCrew = (vil._psiteCrew || 0) + 1; npc._lifeTask = { k: 'build', ps: 1, px: (vil._psite.cx - 2.5) * SZ, py: (vil._psite.cy - 0.5) * SZ, prog: 0 }; npc._workT = now; }   // ★[11차 T4] 마을 일감이 없을 때만 의뢰 집터로(마을 우선 — 랩 ④ 규약)
      else {
        // ★[곳간②] 퇴근길: 든 짐은 곳간에 넣고, 빈손이면 재고에서 하루치를 꺼내 집으로 나른다
        if (npc._granD !== day) {   // ★오늘 인출을 마쳤으면 곳간 용무 종료 — 저장↔인출 왕복 금지(랩 toHome 이탈 대응)
          if ((npc._carry || 0) > 0 && _granGo(vil, npc, false)) return true;
          if (!(npc._carry > 0) && _granGo(vil, npc, true)) return true;
        }
        _lifeGoHome(npc, '휴식'); return true;
      }
    }
  }
  // ══ 진행 중 작업(개간·건설 — 현장 실시간 노동) ══
  const t = npc._lifeTask;
  if (t) {
    if (t.k === 'build' && !(t.ps ? vil._psite : vil._site)) { npc._lifeTask = null; return false; }   // 완공/소멸 → 해산
    const d = Math.hypot(npc.x - t.px, npc.y - t.py);
    if (d > 44) { npc.behavior = 'wander'; npc.targetX = t.px; npc.targetY = t.py; npc.gatherTarget = null; npc._workT = now; _lifeAct(npc, '출근'); return true; }
    const el = Math.min(3000, now - (npc._workT || now)); npc._workT = now;   // 현장 도착 — 실시간 노동 누적(틱 간격 캡)
    t.prog += el;
    _lifeAct(npc, t.k === 'clear' ? '개간' : '건축');
    npc.behavior = 'wander'; npc.targetX = t.px; npc.targetY = t.py;
    const dayMs = state.dayMs || 600000;
    if (t.k === 'clear' && t.prog >= dayMs / LIFE_CLEAR_PDAY) {
      _lifeLiveFarmTile(vil, t.cx, t.cy, t.f === '밭' ? 'dryfield' : 'farmland');
      vil._claim.delete(t.cx + ',' + t.cy); vil._clearCrew = Math.max(0, vil._clearCrew - 1); npc._lifeTask = null;
    } else if (t.k === 'build' && t.prog >= dayMs / LIFE_STAGE_PDAY) {
      t.prog = 0; _lifeAdvanceSite(vil, t.ps ? 'p' : null);
      if (!(t.ps ? vil._psite : vil._site)) npc._lifeTask = null;   // 완공 시 해산(카운터는 complete가 리셋)
    }
    return true;
  }
  // ══ 작업 배정: 개간(농부) > 건설(전 직업) > 직업 실작업 ══
  // 농부 아침 출근 창(랩 7983 fv<L_DAWN+0.08): 창 밖 + 오늘 미출근(요양 해제가 낮이면 등)=오늘 휴무 — 랩 동형
  const isFarmer = npc.simJob === 'farmer';
  if (isFarmer) {
    if (dayFrac > SCH_FARMW_R && npc._fOutD !== day) { _lifeGoHome(npc, '휴식'); return true; }
    npc._fOutD = day;   // 창 안 진입 — 오늘 출근 도장(창 지나도 계속 근무)
  }
  if (isFarmer && vil._clearCrew < LIFE_CREW && _lifeNeedClear(vil)) {
    const fr = _lifeFrontier(vil); let best = null, bd = 1e9;
    for (const c2 of fr) { const k = c2.cx + ',' + c2.cy; if (vil._claim.has(k) || vil._farmSet.has(k)) continue; const dx = c2.cx * SZ + 16 - npc.x, dy = c2.cy * SZ + 16 - npc.y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = c2; } }
    if (best) { vil._claim.add(best.cx + ',' + best.cy); vil._clearCrew++; npc._lifeTask = { k: 'clear', cx: best.cx, cy: best.cy, f: best.f, px: best.cx * SZ + SZ / 2, py: best.cy * SZ + SZ / 2, prog: 0 }; npc._workT = now;
      npc.behavior = 'wander'; npc.targetX = npc._lifeTask.px; npc.targetY = npc._lifeTask.py; npc.gatherTarget = null; _lifeAct(npc, '출근'); return true; }   // ★배정 틱에도 즉시 이동 목표(미세팅 시 신선 NPC target NaN)
  }
  if (vil._site && vil._buildCrew < LIFE_CREW) {
    vil._buildCrew++; npc._lifeTask = { k: 'build', px: (vil._site.cx - 2.5) * SZ, py: (vil._site.cy - 0.5) * SZ, prog: 0 }; npc._workT = now;   // 남측 마당에서 시공
    npc.behavior = 'wander'; npc.targetX = npc._lifeTask.px; npc.targetY = npc._lifeTask.py; npc.gatherTarget = null; _lifeAct(npc, '출근'); return true;   // ★배정 틱 즉시 이동 목표
  }
  // ★★[11차 T4] 여유 크루만 플레이어 의뢰 집터로 — 마을 집터가 **포화(LIFE_CREW)된 뒤**에야 여기 닿는다.
  //   서버의 하루 진척은 min(LIFE_CREW,pop)×LIFE_STAGE_PDAY로 상한이라, 그 위의 크루는 마을에 붙어도 진척이 0이다.
  //   즉 여기로 돌리는 노동은 마을에서 뺏는 게 아니라 **어차피 버려질 잉여**다(랩 10차 실측으로 확립된 규칙).
  if (vil._psite && (vil._psiteCrew || 0) < LIFE_CREW) {
    vil._psiteCrew = (vil._psiteCrew || 0) + 1;
    npc._lifeTask = { k: 'build', ps: 1, px: (vil._psite.cx - 2.5) * SZ, py: (vil._psite.cy - 0.5) * SZ, prog: 0 }; npc._workT = now;
    npc.behavior = 'wander'; npc.targetX = npc._lifeTask.px; npc.targetY = npc._lifeTask.py; npc.gatherTarget = null; _lifeAct(npc, '출근'); return true;
  }
  // ══ 직업 실작업(랩 JOBACT·work 분기 동형 — 서버는 실물 자원·실물 사냥감이 정본) ══
  const job = npc.simJob;
  if (isFarmer && vil._farmSet.size) {   // 농부=작물 상태머신(랩 nextTask→doTask: 수확>방제>물대기>파종>김매기, 우선순위+최근접)
    if (npc._jobT && now < npc._jobT) return true;   // 체류 중(target 유지)
    if (npc._farmK) {   // 배정 셀로 이동 중/도착
      const k = npc._farmK, ci = k.indexOf(','), px2 = +k.slice(0, ci) * SZ + SZ / 2, py2 = +k.slice(ci + 1) * SZ + SZ / 2;
      npc.behavior = 'wander'; npc.targetX = px2; npc.targetY = py2; npc.gatherTarget = null;
      _lifeAct(npc, '경작');   // 이동 구간 라벨(도착 순간 doTask의 구체 라벨이 덮고, 체류 중엔 위 _jobT 조기 리턴이 유지)
      if (Math.hypot(npc.x - px2, npc.y - py2) <= 44) {   // 도착 — 셀 처리(파종·수확·방제·물대기·김매기) + 체류
        _lifeDoTask(vil, npc, k, day);
        vil._cropClaim.delete(k); npc._farmK = null;
        npc._jobT = now + 9000 + (_pidHash(npc.pid) % 7) * 1500;
        // ★[곳간②] 짐이 상한에 닿으면 곳간으로 운반(자리 없으면 false → 기존 흐름 그대로)
        if ((npc._carry || 0) >= G_CARRY && _granGo(vil, npc, false)) { npc._jobT = 0; return true; }
      }
      return true;
    }
    const k2 = _lifeNextFarmCell(vil, npc, day);
    if (k2) { vil._cropClaim.add(k2); npc._farmK = k2; const ci = k2.indexOf(','); npc.behavior = 'wander'; npc.targetX = +k2.slice(0, ci) * SZ + SZ / 2; npc.targetY = +k2.slice(ci + 1) * SZ + SZ / 2; npc.gatherTarget = null; _lifeAct(npc, '경작'); return true; }
    const arr = (vil._farmArr && vil._farmArr.length) ? vil._farmArr : (vil._farmArr = [...vil._farmSet]);   // 일감 없음(비수기·전부 생육 중) — 결정론 밭 순찰(구 ④ 유지)
    npc._jobN = ((npc._jobN || 0) + 1);
    const h = _pidHash(npc.pid);
    const k3 = arr[(h + npc._jobN * 13) % arr.length], ci3 = k3.indexOf(',');
    npc.behavior = 'wander'; npc.targetX = +k3.slice(0, ci3) * SZ + SZ / 2; npc.targetY = +k3.slice(ci3 + 1) * SZ + SZ / 2; npc.gatherTarget = null;
    npc._jobT = now + 9000 + (h % 7) * 1500;
    _lifeAct(npc, '경작');
    return true;
  }
  if (job === 'lumberjack' || job === 'miner' || job === 'forager') {   // 벌목·채광·채집=자원 밀집 현장 출근 + 실물 채집(랩 7841·7844·7861 동형)
    const sites = _lifeJobSites(vil, day)[job];
    if (!sites || !sites.length) return false;   // 생활권에 해당 자원 없음 → 레거시 폴스루
    const h = _pidHash(npc.pid);
    if (!npc._workSite || npc._workSite.day !== day) npc._workSite = { x: sites[h % sites.length].x, y: sites[h % sites.length].y, day };   // 분산 배정(랩 place %분산 동형)
    const ws = npc._workSite;
    if (Math.hypot(npc.x - ws.x, npc.y - ws.y) > 240) { npc.behavior = 'wander'; npc.targetX = ws.x; npc.targetY = ws.y; npc.gatherTarget = null; _lifeAct(npc, '출근'); return true; }   // 출근
    if (npc._jobT && now < npc._jobT) return true;   // 작업 스윙 페이싱
    const qt = state.deps.qtResources && state.deps.qtResources();
    const near = qt ? qt.queryCircle(ws.x, ws.y, 260) : [];
    let best = null, bd = 1e9;
    for (const r of near) { if (!JOB_RES[job].includes(r.type)) continue; const dx = r.x - npc.x, dy = r.y - npc.y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = r; } }
    if (best) { npc.behavior = 'gather'; npc.targetX = best.x; npc.targetY = best.y; npc.gatherTarget = best.id; npc._jobT = now + 6000 + (h % 5) * 1000; _lifeAct(npc, job === 'lumberjack' ? '벌목' : (job === 'miner' ? '채광' : '채집')); return true; }   // 실물 채집(기존 gather 실행부·리스폰이 처리)
    npc._workSite = null;   // 현장 고갈 — 다음 결정 때 재배정(랩 resourceTick '더 풍부한 셀로' 동형)
    npc.behavior = 'wander'; npc.targetX = ws.x + ((h % 5) - 2) * 24; npc.targetY = ws.y + ((((h / 5) | 0) % 5) - 2) * 24; npc.gatherTarget = null; npc._jobT = now + 5000;
    return true;
  }
  if (job === 'fisher') {   // 어부=물가 현장(랩 V.bank 어장 앵커 동형) + 낚시(가시 표현 — 마을 경제는 econ 소유)
    const sites = _lifeJobSites(vil, day).fisher;
    if (!sites || !sites.length) return false;   // 내륙 마을 → 레거시 폴스루
    const h = _pidHash(npc.pid);
    if (!npc._workSite || npc._workSite.day !== day) npc._workSite = { x: sites[h % sites.length].x, y: sites[h % sites.length].y, day };
    const ws = npc._workSite;
    if (Math.hypot(npc.x - ws.x, npc.y - ws.y) > 130) { npc.behavior = 'wander'; npc.targetX = ws.x; npc.targetY = ws.y; npc.gatherTarget = null; _lifeAct(npc, '출근'); return true; }
    if (!npc._lastFishAt || now - npc._lastFishAt > 8000) { npc._lastFishAt = now; if (npc.inventory) npc.inventory.fish = (npc.inventory.fish || 0) + 1; }   // 8초 1마리(구 ③-b 이관 — simJob 기준)
    npc.behavior = 'wander'; npc.targetX = ws.x + (Math.random() - 0.5) * 40; npc.targetY = ws.y + (Math.random() - 0.5) * 40; npc.gatherTarget = null;
    _lifeAct(npc, '낚시');
    return true;
  }
  if (job === 'hunter') {   // 사냥꾼=사냥터 앵커 출근 + ★wildlife 두뇌 완전체(잠행·핏자국·활·근접·도살 — 랩 실행층·두뇌 동형)
    const sites = _lifeJobSites(vil, day).hunter;
    const h = _pidHash(npc.pid);
    if ((!npc._workSite || npc._workSite.day !== day) && sites && sites.length) npc._workSite = { x: sites[h % sites.length].x, y: sites[h % sites.length].y, day };
    if (!npc._workSite) { npc._huntOn = 0; return false; }   // 사냥감·앵커 전무 → 레거시 폴스루
    const ws = npc._workSite;
    // 뷰 안(활성 청크)=wildlife가 몹·핏자국·전투 전부 구동(LOD 계약): 여기는 마킹+주도권 소유만 —
    //   목표·잠행·속도는 wildlife 두뇌가 본체로 역전달(npc.targetX/_huntSpd). 스케줄(밤·요양·반일)은 위 게이트가 우선.
    if (state.deps.isPositionActive && state.deps.isPositionActive(npc.x, npc.y)) {
      npc._huntOn = 1; npc._huntWk = { cx: Math.round(ws.x / SZ), cy: Math.round(ws.y / SZ) };
      if (Math.hypot(npc.x - ws.x, npc.y - ws.y) > 900 && !npc._bmOn) { npc.behavior = 'wander'; npc.targetX = ws.x; npc.targetY = ws.y; npc.gatherTarget = null; }   // 초기 출근(두뇌 목표 오기 전)
      return true;
    }
    // 뷰 밖(비활성)=몹도 없음(LOD) — 사냥터 밴드 순회(연출 최소·복귀 시 두뇌가 즉시 인수)
    npc._huntOn = 0;
    if (Math.hypot(npc.x - ws.x, npc.y - ws.y) > 300) { npc.behavior = 'wander'; npc.targetX = ws.x; npc.targetY = ws.y; npc.gatherTarget = null; return true; }
    if (npc._jobT && now < npc._jobT) return true;
    npc._jobT = now + 7000 + (h % 5) * 1200;
    npc.behavior = 'wander'; npc.targetX = ws.x + (Math.random() - 0.5) * 260; npc.targetY = ws.y + (Math.random() - 0.5) * 260; npc.gatherTarget = null;
    _lifeAct(npc, '수색');
    return true;
  }
  // ★[랩 villager 분기 verbatim 이식] 기타 직업(대장장이·무기장·갑옷장·요리사·행상·전사·주민)
  //   랩 원문(직업 배치): a.work = {cx: hall.cx+((i%6)-3), cy: hall.cy+(((i/6|0)%6)-3)}; a.role = otRole(s.econ, i);
  //                      // ★회관 내부 앵커([-3..2]² = 8×8 회관의 벽 안 6×6, 문(0,3) 경유 도달)
  //   랩 원문(라벨):     a.state='work'; a.action = JOBACT[a.job] || (a.job==='villager' ? (a.role||'주민') : a.action);
  //   → 이동 중 '출근'(랩 toWork 동형), 도착하면 역할 라벨. 전부 랩에 있는 라벨만 사용(신규 발명 없음).
  //   이 분기 이전엔 기타 직업이 `return false`로 레거시 일과에 떨어져 **라벨이 영영 안 붙었다**(액션 라벨 구멍의 실체).
  if (!LIFE_FIELD_JOBS.has(job)) {
    const idx = _lifeOtherIndex(vil, npc);
    const wx = (vil.ccx + ((idx % 6) - 3)) * SZ + SZ / 2;
    const wy = (vil.ccy + ((((idx / 6) | 0) % 6) - 3)) * SZ + SZ / 2;
    const dHall = Math.hypot(npc.x - wx, npc.y - wy);
    if (dHall > 44) {
      // ★[출근 정체 가드 — 2026-07-28 실측으로 발견한 회귀]
      //   실서버 관측: 어촌1의 mason·smith×2·cook 4명이 회관에서 445~856px 떨어진 채
      //   **17.5초(서버 66틱) 동안 0px** 이동, act는 계속 '출근'이었다. 회관 내부 앵커([-3..2]²)는
      //   8×8 큰집 **벽 안**이라 남벽 문(2칸)을 통과해야 하는데, 주민 이동층이 그 경로를 못 만들면
      //   이 분기는 매 틱 같은 목표를 다시 세팅하며 **영구 '출근'**으로 고착된다.
      //   → 진짜 해법(문 통과 경로)은 벽=변 콜라이더 층 소관이라 여기서 우회하지 않는다(벽 뚫기 금지).
      //     대신 **정체를 감지하면 생활층이 소유권을 놓고** 레거시 일과로 되돌려 고착을 없앤다.
      //     한 번 놓은 NPC는 게임일이 바뀔 때 다시 시도한다(_vgDay).
      // ★첫 진입에 반드시 기준점을 심는다 — 안 그러면 _vgX가 영영 undefined라 가드가 무장되지 않는다
      //   (하네스 test-villager-stuck.js ①이 이 구멍을 잡아냈다: 60초를 굴려도 발동 0회)
      // 게임일이 바뀌면 창을 새로 연다 — 어제 못 갔다고 영영 포기시키지 않는다(경로 조건은 날마다 달라진다)
      if (npc._vgDay !== day) { npc._vgDay = day; npc._vgGiveUp = -1; npc._vgX = npc.x; npc._vgY = npc.y; npc._vgSince = now; }
      if (npc._vgX === undefined) { npc._vgX = npc.x; npc._vgY = npc.y; npc._vgSince = now; }
      const moved = Math.hypot(npc.x - npc._vgX, npc.y - npc._vgY);
      if (moved > 6) { npc._vgX = npc.x; npc._vgY = npc.y; npc._vgSince = now; }
      else if (npc._vgSince && now - npc._vgSince > SCH_VG_STUCK) {
        npc._vgGiveUp = day;                       // 오늘은 포기 — 라벨도 지우고 레거시로
        _vgStuckN++;                               // ★진단 카운터(lifedbg vgStuck) — 실제로 발동하는지 프로덕션에서 센다
        if (!npc._huntOn && npc._lifeAct) _lifeAct(npc, '');
        return false;
      }
      if (npc._vgGiveUp === day) { if (!npc._huntOn && npc._lifeAct) _lifeAct(npc, ''); return false; }
      npc.behavior = 'wander'; npc.targetX = wx; npc.targetY = wy; npc.gatherTarget = null;
      _lifeAct(npc, '출근'); return true;
    }
    npc._vgSince = 0; npc._vgGiveUp = -1;          // 도착 = 정체 해제
    const h2 = _pidHash(npc.pid);
    if (!npc._jobT || now >= npc._jobT) {   // 회관 안 제자리 작업(서성임) — 좌표 단일 작성자 유지
      npc._jobT = now + 7000 + (h2 % 5) * 1200;
      npc.behavior = 'wander'; npc.targetX = wx + ((h2 % 7) - 3) * 8; npc.targetY = wy + (((h2 / 7 | 0) % 7) - 3) * 8; npc.gatherTarget = null;
    }
    _lifeAct(npc, _otRole(vil.econ, idx));
    return true;
  }
  // 현장 직업인데 생활권에 자원이 없는 경우(내륙 어부 등)만 레거시 일과로 폴스루.
  //   ★스테일 라벨 제거: 생활 층이 소유권을 놓는 순간 라벨도 지운다(''=클라 라벨 제거). 사냥꾼은 wildlife가
  //   매 틱 역전달하므로 건드리지 않는다(_huntOn 가드) — 안 그러면 두 층이 라벨을 두고 싸운다.
  if (!npc._huntOn && npc._lifeAct) _lifeAct(npc, '');
  return false;   // 기타 직업(전사·대장장이 등 실내·특수) → 레거시 일과(작업 도넛·채집)
}

// ★랩 otRole verbatim — '주민' 버킷(숲·산·물·논밭 외 직업)의 역할 라벨.
//   랩 원문: const c=econ.counts, order=[['smith','대장장이'],['weaponsmith','무기장'],['armorsmith','갑옷장'],
//            ['cook','요리사'],['merchant','행상'],['warrior','전사']];
//            let k=i; for(const[j,label]of order){const n=Math.round(c[j]||0); if(k<n)return label; k-=n;} return '주민';
function _otRole(econ, i) {
  if (!econ || !econ.counts) return '주민';
  const c = econ.counts, order = [['smith', '대장장이'], ['weaponsmith', '무기장'], ['armorsmith', '갑옷장'], ['cook', '요리사'], ['merchant', '행상'], ['warrior', '전사']];
  let k = i;
  for (const [j, label] of order) { const n = Math.round(c[j] || 0); if (k < n) return label; k -= n; }
  return '주민';
}
// 마을 내 기타직 안정 순번(랩 ot 배열 인덱스 i 동형) — npcPids 순서 = 결정론. 게임일 1회 캐시.
function _lifeOtherIndex(vil, npc) {
  const day = state.world ? state.world.day : 0;
  if (!vil._otIdx || vil._otIdxDay !== day) {
    vil._otIdx = new Map(); vil._otIdxDay = day;
    let i = 0;
    for (const pid of vil.npcPids) {
      const p = state.deps.players.get(pid);
      if (!p || LIFE_FIELD_JOBS.has(p.simJob)) continue;
      vil._otIdx.set(pid, i++);
    }
  }
  const v = vil._otIdx.get(npc.pid);
  return v === undefined ? (_pidHash(npc.pid) % 36) : v;
}

module.exports = {
  init, onGameTick, invalidateTradeDistances, npcLifeTick, lifeDebug,
  // Stage 4A — zone.js 소비: 농지 lazy 실물화 / welcome 영토 페이로드 / 레거시 디듀프 판정
  farmTilesInRect, clientVillages, isLegacyVillageClaimed,
  // ★곳간② 클라 표시 — welcome 스냅샷(델타는 onGameTick에서 gran_stock 방송)
  granStocks,
  // ★[10차 T4] 장마당 — welcome 스냅샷(변경분은 onGameTick의 markets 방송)
  marketVillages,
  // ★[11차 T3] 환호 — 콜라이더(zone.js isTerrainBlockedLocal)·welcome 페이로드 원천
  ditchCells,
  // ★[11차 T4] 플레이어 의뢰 집 건설 — zone.js 배치 핸들러가 소비
  lifeRequestPlayerSite, villageOwningCell,
  // 플레이어 구매/판매 경계계약(읽기전용 마을 품질 EMA — econ 무접촉)
  villageQualityAt,
  // §11 도적 — server/bandits.js 소비(좁은 접점, 추가 전용)
  banditHost,
  // P3 — zone.js Wildlife.init 소비: 실체 전쟁 병사 pid 위치(px)를 야생 agrid 위협원으로 주입
  warThreats,
  // P3 — 헤드리스 검증 훅(테스트 전용)
  __p3Bind,
};
