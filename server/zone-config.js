// === Phase 14.46-a v8: 26 zone, 게이밍 인구 비례 + 지리 사실성 ===
// 한반도가 가장 크게 (91M, Korean dev 우선). 인기 zone 모두 mid-north에 13000 height로.
// 러시아 가로띠 (시바라+베링), 한·일 북쪽 = 러시아, 호주·NZ 통합, 양극 ICE_BAND 1500.
//
// 좌표계: X 0~61000 (서→동), Y 0~38000 (북→남)
// 컬럼: c0(11000) c1(5000) c2(9000) c3(6000) c4(10000) c5(7000) c6(5000) c7(8000)
// 행:   r0(5000) r1(13000) r2(6000) r3(7000) r4(7000)
//
// MEMO: 현재 단일 VPS. zone 1개=컨테이너 1개. multi-zone host는 Stage 2 (Task #192 참조).

function hostFromEnv(zoneId, fallback) {
  const k = `ZONE_HOST_${zoneId.toUpperCase()}`;
  if (process.env[k]) return process.env[k];
  if (process.env.ZONE_HOSTS) {
    try {
      const map = JSON.parse(process.env.ZONE_HOSTS);
      if (map[zoneId]) return map[zoneId];
    } catch (e) {}
  }
  // Phase 5-G: PUBLIC_HOST 단일 변수로 모든 zone host 채움 (단일 VPS 배포)
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;
  return fallback;
}

const WS_PROTO = process.env.WS_PROTO || 'ws';
const HTTP_PROTO = process.env.HTTP_PROTO || 'http';

// ⚠️ 아래 worldOffsetX/Y, zoneWidth/zoneHeight, mainSquare는 모두 "BASE 값"이다.
//    export 시 × WORLD_SCALE(기본 10, 아래 참조) + 32px 스냅이 적용된다.
//    예) hanbando base 7000×13000 → 실제 70016×130016px ≈ 2188×4063셀 ≈ 8.9M셀.
//    ⇒ 여기 숫자를 "실제 px"로 읽지 말 것. 실제 크기 = base × WORLD_SCALE.
//      실제 크기를 바꾸려면 base를 바꾸거나(×10 먹음 주의) WORLD_SCALE을 조절.
const ZONES_BASE = {
  // === c0: 아메리카 (11000w base → ×10) ===
  canadia: {
    port: 3001, biome: 'taiga', displayName: '캐나디아 (NA 북부)',
    groundColor: '#5a7c4a', tintColor: '#3a6a2a',
    worldOffsetX: 0, worldOffsetY: 0, zoneWidth: 11000, zoneHeight: 5000,
    villageSeed: 1001, villageCount: 6,
    mainSquare: { x: 5500, y: 2500, name: '카나디 광장' },
  },
  nubiano: {
    port: 3002, biome: 'plains', displayName: '누비아노 (USA)',
    groundColor: '#bca56a', tintColor: '#8a6a3a',
    worldOffsetX: 0, worldOffsetY: 5000, zoneWidth: 11000, zoneHeight: 13000,
    villageSeed: 1002, villageCount: 25,
    mainSquare: { x: 5500, y: 6500, name: '뉴아크 광장' },
  },
  mayan: {
    port: 3003, biome: 'jungle', displayName: '마야안 (중미)',
    groundColor: '#4a7c3a', tintColor: '#2a5a1a',
    worldOffsetX: 0, worldOffsetY: 18000, zoneWidth: 11000, zoneHeight: 6000,
    villageSeed: 1003, villageCount: 10,
    mainSquare: { x: 5500, y: 3000, name: '치치카 광장' },
  },
  amazonia: {
    port: 3004, biome: 'jungle', displayName: '아마조니아 (브라질)',
    groundColor: '#3a6a2a', tintColor: '#1a4a0a',
    worldOffsetX: 0, worldOffsetY: 24000, zoneWidth: 11000, zoneHeight: 7000,
    villageSeed: 1004, villageCount: 14,
    mainSquare: { x: 5500, y: 3500, name: '마나스 광장' },
  },
  patagona: {
    port: 3005, biome: 'plains', displayName: '파타고나 (남미 남단)',
    groundColor: '#7a8a6a', tintColor: '#5a6a4a',
    worldOffsetX: 0, worldOffsetY: 31000, zoneWidth: 11000, zoneHeight: 7000,
    villageSeed: 1005, villageCount: 6,
    mainSquare: { x: 5500, y: 3500, name: '바리로체 광장' },
  },

  // === c1: 대서양 (5000w, 세로 전체) ===
  atlantic: {
    port: 3006, biome: 'ocean', displayName: '대서양',
    groundColor: '#2a4a7c', tintColor: '#1a3a6a',
    worldOffsetX: 11000, worldOffsetY: 0, zoneWidth: 5000, zoneHeight: 38000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 2500, y: 19000, name: '대서양 중심' },
    isOcean: true,
  },

  // === c2: 유럽 + 아프리카 (9000w) ===
  nordan: {
    port: 3007, biome: 'taiga', displayName: '노르단 (스칸디)',
    groundColor: '#6a8a5a', tintColor: '#4a6a3a',
    worldOffsetX: 16000, worldOffsetY: 0, zoneWidth: 9000, zoneHeight: 5000,
    villageSeed: 1007, villageCount: 8,
    mainSquare: { x: 4500, y: 2500, name: '오스로 광장' },
  },
  europa: {
    port: 3008, biome: 'forest', displayName: '유로파 (유럽)',
    groundColor: '#5a8a4a', tintColor: '#3a6a2a',
    worldOffsetX: 16000, worldOffsetY: 5000, zoneWidth: 9000, zoneHeight: 13000,
    villageSeed: 1008, villageCount: 25,
    mainSquare: { x: 4500, y: 6500, name: '파리시 광장' },
  },
  sahar: {
    port: 3009, biome: 'desert', displayName: '사하르 (북아프리카)',
    groundColor: '#d4b97a', tintColor: '#a89460',
    worldOffsetX: 16000, worldOffsetY: 18000, zoneWidth: 9000, zoneHeight: 6000,
    villageSeed: 1009, villageCount: 8,
    mainSquare: { x: 4500, y: 3000, name: '카이르 광장' },
  },
  kongra: {
    port: 3030, biome: 'savanna', displayName: '콩그·케이프 (남아프리카)',
    groundColor: '#8a8a5a', tintColor: '#6a6a3a',
    worldOffsetX: 16000, worldOffsetY: 24000, zoneWidth: 9000, zoneHeight: 14000,
    villageSeed: 1010, villageCount: 10,
    mainSquare: { x: 4500, y: 7000, name: '나로비 광장' },
  },

  // === c3: 중앙 Eurasia + 인도양 (6000w) — sibara/centaria/hindgang/indoyang ===
  // sibara는 c3+c4 row 0 wide → 별도 정의 (아래)
  centaria: {
    port: 3012, biome: 'plains', displayName: '중아세아',
    groundColor: '#a89460', tintColor: '#806e44',
    worldOffsetX: 25000, worldOffsetY: 5000, zoneWidth: 6000, zoneHeight: 13000,
    villageSeed: 1012, villageCount: 14,
    mainSquare: { x: 3000, y: 6500, name: '아스나 광장' },
  },
  hindgang: {
    port: 3013, biome: 'jungle', displayName: '힌드강 (인도)',
    groundColor: '#5a8a3a', tintColor: '#3a6a1a',
    worldOffsetX: 25000, worldOffsetY: 18000, zoneWidth: 6000, zoneHeight: 6000,
    villageSeed: 1013, villageCount: 16,
    mainSquare: { x: 3000, y: 3000, name: '델리아 광장' },
  },
  indoyang: {
    port: 3014, biome: 'ocean', displayName: '인도양',
    groundColor: '#2a5a8a', tintColor: '#1a4a7a',
    worldOffsetX: 25000, worldOffsetY: 24000, zoneWidth: 6000, zoneHeight: 14000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 3000, y: 7000, name: '인도양 중심' },
    isOcean: true,
  },

  // === Russia 가로띠 (row 0, c3+c4 wide) ===
  sibara: {
    port: 3011, biome: 'tundra', displayName: '시바라 (Siberia 西·中)',
    groundColor: '#8a9a9a', tintColor: '#6a7a7a',
    worldOffsetX: 25000, worldOffsetY: 0, zoneWidth: 16000, zoneHeight: 5000,
    villageSeed: 1011, villageCount: 8,
    mainSquare: { x: 8000, y: 2500, name: '노보 광장' },
  },

  // === c4: 중원 + 동남아 (10000w) ===
  jungwon_n: {
    port: 3016, biome: 'plains', displayName: '중원북 (中北)',
    groundColor: '#9aa860', tintColor: '#7a8a40',
    worldOffsetX: 31000, worldOffsetY: 5000, zoneWidth: 10000, zoneHeight: 13000,
    villageSeed: 1016, villageCount: 25,
    mainSquare: { x: 5000, y: 6500, name: '베이장 광장' },
  },
  jungwon_s: {
    port: 3017, biome: 'plains', displayName: '중원남 (中南)',
    groundColor: '#8aa860', tintColor: '#6a8840',
    worldOffsetX: 31000, worldOffsetY: 18000, zoneWidth: 10000, zoneHeight: 6000,
    villageSeed: 1017, villageCount: 16,
    mainSquare: { x: 5000, y: 3000, name: '샹하 광장' },
  },
  nanyang: {
    port: 3018, biome: 'archipelago', displayName: '남양제도 (동남아)',
    groundColor: '#4a8a5a', tintColor: '#2a6a3a',
    worldOffsetX: 31000, worldOffsetY: 24000, zoneWidth: 10000, zoneHeight: 7000,
    villageSeed: 1018, villageCount: 14,
    mainSquare: { x: 5000, y: 3500, name: '발리 광장' },
  },

  // === Russia 가로띠 (row 0, c5+c6+half_c7 wide) ===
  bering: {
    port: 3015, biome: 'tundra', displayName: '베링 (NE 러시아)',
    groundColor: '#7a8a8a', tintColor: '#5a6a6a',
    worldOffsetX: 41000, worldOffsetY: 0, zoneWidth: 16000, zoneHeight: 5000,
    villageSeed: 1015, villageCount: 4,
    mainSquare: { x: 8000, y: 2500, name: '아나디 광장' },
  },

  // === c5: 한반도 컬럼 (7000w) ===
  hanbando: {
    port: 3020, biome: 'forest', displayName: '한반도',
    groundColor: '#9a9670', tintColor: '#7a8a4a',
    worldOffsetX: 41000, worldOffsetY: 5000, zoneWidth: 7000, zoneHeight: 13000, // ← BASE(×10): 실제 70016×130016px ≈ 2188×4063셀 ≈ 8.9M셀
    villageSeed: 1020, villageCount: 0, // procedural 마을 0 — 하드코딩(hanbando-terrain.json villages, 에디터 v9) 사용
    useHardcodedVillages: true, // v9 마을 50개 사용.
    npcVillageHouses: true,     // NPC 집 ON. 진짜 병목은 서버 qtBuildings 매틱 전체재삽입(3.3만채=22%CPU)이었고, 활성청크만 인덱싱으로 수정.
    npcVillageTerritory: true,  // 길드영토 ON — claims는 welcome에 1회(텔포와 무관, 접속 OK 확인됨).
    npcPerVillage: 6, // 50 하드코딩 마을 × 6 = 300 NPC (1코어 안전선). dormancy로 액티브만 처리.
    mainSquare: { x: 3500, y: 6500, name: '한양 광장' },
    // Phase 5-K: cleanZone 해제 — 자원·몹 spawn 켜짐 (건축 재료 공급). 산맥·강은 hardcoded 차단 유지.
    // ★[다리 층] 통나무 널다리 — flat [cx,cy,...] 셀 목록. path-core 계약("물=차단, 다리 칸만 통행 —
    //   다리는 맵에 만들어두는 사물, 경로 창발 아님. 판정은 호출측 blocked 콜백 소관")에 따라
    //   zone.js isTerrainBlockedLocal 이 이 셀에서 물 차단을 해제한다(바위는 그대로 차단).
    //   자리는 scripts/plan-bridges.js 가 계산: 스폰 성분(#8, 161276칸)에서 도보 도달 불가한 마을을 찾고
    //   그 성분과 본토를 잇는 최단 도하 지점을 고른다.
    //   ★핵심: "도달 불가 37마을"은 마을 문제가 아니라 **섬 8덩어리 문제**다. 계획기는 마을마다 같은 다리를
    //   중복 출력하므로 **성분별로 하나만** 고르면 된다. 성분 하나에 다리 하나면 그 성분 마을이 전부 붙는다.
    //     · 성분 #12(685칸, 어촌1 1개)   — (1118,2346)→(1118,2317) 도하 28셀 → 62셀  [e97b9b6]
    //     · 성분 #9 (154,032칸, 19개)    — ( 486,1773)→( 464,1773) 도하 21셀 → 46셀  [본 커밋]
    //     · 성분 #10(8,775칸, 어촌8 1개) — ( 288,1732)→( 288,1725) 도하  6셀 → 16셀  [본 커밋]
    //   합계 122셀 / 마을 20개 연결. 규격은 전부 폭 2셀(교행) × k=0..len+1(양끝 뭍 접지 포함).
    //   ★성분 #0(코스 격자상 62,166칸·10마을)은 **다리를 놓지 않았다** — 실셀 BFS 감사(scripts/audit-reachability.js)
    //     결과 임업5 등 10마을이 **다리 없이도 이미 도달 가능**했다. 코스 격자(step 4)가 1~3셀짜리 좁은 육교를
    //     못 보고 단절로 오판한 것이다. 계획기의 성분 분해는 후보 탐색용이고, **판정 정본은 실셀 BFS다.**
    //   ★T2 추가(계획기 v2 — 실셀 해안선 전수 탐색): 섬 4개 6마을을 더 이었다.
    //     · 섬(광산7·농촌3·어촌6, 935,830셀) — (1256,3087)→(1217,3087) 도하 38셀 →  80셀
    //     · 섬(어촌3,  47,193셀)            — ( 796,2684)→( 800,2684) 도하  3셀 →  10셀
    //     · 섬(어촌7,  90,075셀)            — (1510, 382)→(1510, 388) 도하  5셀 →  14셀
    //     · 섬(어촌11, 97,082셀)            — (1480,2559)→(1447,2559) 도하 32셀 →  68셀
    //   ★광산2(90,515셀)는 200셀 내에 본토 도하가 없다 = **대양 분리**. 다리가 아니라 배가 답이라
    //     놓지 않았다(항해 층 필요 — 사용자 결정 사항).
    // ★[11차 재배치] 계획기(plan-bridges.js)의 목적함수는 '최단 도하' 하나뿐이라, 7개 중 3개가
    //   지류 어귀(합류부)에 박혀 있었다 — audit-bridge-sites.js 실측. 합류부는 실제로 다리를 놓지 않는 자리다:
    //   유속·세굴이 최악이고 교두보가 두 물줄기 사이 쐐기가 된다.
    //     · #1 한여울강×맑바람천 — 남쪽 교두보 뭍 1,708칸(반대편 3,328칸의 절반) → +30셀 이동
    //         도하 29→28셀 · 교두보 3,328/1,708 → 3,231/2,994 · 맑바람천까지 4.1→29.4셀
    //     · #2 자란천×봉홧둑천 — Y자 분기점 위 → -12셀 이동
    //         도하 21→20셀 · 교두보 1,871/3,021 → 2,681/2,709 · 봉홧둑천까지 8.6→22.2셀
    //     · #5 연화천×옥돌천 — ±60셀 안에 대안 없음(더 좁고 합류부 아닌 자리가 없다) → **유지**
    //   ★옮겨도 되는 근거는 실셀 BFS 전수 대조다(replan-bridge-sites.js):
    //     도달 7,310,474 → 7,310,472셀(Δ-2) · 마을 49/50 유지 · 잃은 마을 0 · 다리 셀 294→292.
    //   규격 불변: 폭 2셀 · 양끝 뭍 접지.
    // ★[11차 물길 정합 후 추가 3개] 강을 제대로 이었더니(fix-river-flow) 그 끊긴 자리들이
    //   사실상 **육교 노릇**을 하고 있었다는 게 드러났다 — 물이 안 이어져 있어 사람이 틈으로 다녔던 것이다.
    //   이으니 도달 마을이 49→16으로 무너졌다. 지형이 틀린 게 아니라 다리가 모자란 상태였다.
    //   계획기 v2(실셀 해안선)로 성분마다 최단 도하를 뽑아 38셀만 더했다 — 도하 폭 3·5·5셀로 전부 짧다.
    //     · 섬 #3(11마을 1,083,774셀) — (69,543)→(69,547)   도하 3셀 → 10셀
    //     · 섬 #4( 3마을   397,603셀) — (702,2515)→(708,2515) 도하 5셀 → 14셀
    //     · 섬 #5(19마을 2,594,589셀) — (335,2057)→(335,2051) 도하 5셀 → 14셀
    // ★[11차 경로 스무딩 후] 강을 부드럽게 펴자 다리 #8(3셀 도하)이 헛돌아 11마을이 떨어졌다.
    //   지형을 만지면 통행이 끊긴다 — 이번에도 같은 교훈. 계획기 v2로 5셀 도하 하나(14셀)만 더했다.
    //     · 섬(광산3·어촌2·임업5·임업6·농촌4·어촌7·어촌9·어촌14·농촌6·농촌13·농촌14, 1,083,480셀)
    //       (345,741)→(351,741) 도하 5셀 → 14셀
    // ★[균등 재샘플 후] 강을 균등 간격으로 다시 뽑자 연화천 도하부가 살짝 넓어져 다리#3이 못 건넜다.
    //   1셀 도하 — 서쪽으로 2셀(4칸)만 늘려 (794,2684)까지 접지시켰다.
    // ★[11차 재민 지시] 명호를 없애며 어촌4를 서쪽 49셀로 옮겼다(셀 732,723 → 683,724).
    //   물가 마을이니 물 옆에 둬야 한다 — 새 자리는 서쪽 살여울천까지 11셀.
    //   그 물을 건너는 **동서 다리**(y724, 도하 9셀)와, 거기서 북쪽 60셀쯤의 동서강을 건너는
    //   **남북 다리**(x690, 도하 9셀)를 함께 놓았다. 둘 다 폭 2셀 · 양끝 뭍 접지.
    // ★[11차 재민 지적 "농촌4 아래 다리 위치 제대로 고쳐 — 동쪽으로"]
    //   옛 다리#8(x69~70, y539~547)은 강을 건너는 게 아니라 **서쪽 대양 물가에 걸쳐** 있었다.
    //   서쪽이 통째로 바다라 끝이 뭍에 닿을 수 없었고(끝 수리에 46칸이 필요했다), 실제로 계획기가
    //   매번 "다시 뽑아야 할 다리"로 지목하던 그것이다. 그 자리를 폐기하고,
    //   같은 강이 동남쪽으로 흘러 내려가 **좁아지는 지점(x136)**으로 옮겼다.
    //   후보 스캔(x76~150, 2셀 간격 38곳) 결과: x136 도하 **10셀** · 교두보 3,016 / 3,414칸(균형)
    //   — 도하가 가장 짧은 축(10셀)이면서 양쪽 교두보가 가장 고른 자리.
    // ★[11차 재민 지시 — 마을 옆 다리 9개] 자리는 전부 후보 스캔 실측으로 골랐다(도하폭·양안 교두보).
    //   · 어촌7 옆 동서   y177  x1496~1506  도하 9셀 · 교두보 3,469 / 3,042
    //   · 어촌2 근처 남북 x1640 y384~392    도하 7셀 · 교두보 3,321 / 3,309
    //       ★"어촌2 왼쪽 다리를 가져오면 되겠네" — 옛 다리#4(x1510~1511, y382~388, 14셀)를 **철거**하고
    //         같은 강 130셀 동쪽, 어촌2 바로 옆으로 옮겼다. 도하도 7셀로 짧아진다.
    //   · 광산2 아래 남북 x1983 y242~255    도하 12셀 · 교두보 3,326 / 3,018
    //   · 어촌14 위 남북  x1797 y635~643    도하 7셀 · 교두보 3,429 / 2,829
    //   · 어촌11 위 남북  x1716 y2720~2732  도하 11셀 · 교두보 3,036 / 3,536
    //   · 광산7 위 남북   x2034 y3002~3014  도하 11셀 · 교두보 2,161 / 4,206
    //   · 어촌6 위 남북   x2028 y3937~3946  도하 8셀 · 교두보 3,326 / 3,347
    //   · 어촌13 아래 남북 x423 y3327~3336  도하 8셀 · 교두보 3,090 / 3,433
    //   · 어촌12 왼쪽 동서 y3274 x724~734   도하 9셀 · 교두보 3,265 / 3,342
    //   전부 폭 2셀 · 축 직선 · 양끝 뭍 접지.
    // ★[11차 재민 지시] 어촌15 북동쪽 다리를 **동서 → 남북**으로 변경 · 어촌8 바로 위 남북다리 추가
    //   · 어촌15 북동: 옛 다리#9(동서 y741, x340~355, 32셀) 철거 → **남북 x345 y736~752**(도하 15셀)
    //     그 강은 북동→남서로 비스듬히 흘러서 어느 축으로 끊어도 15~16셀이다. 남북 후보 17곳을 훑어
    //     도하 최단(15셀)이면서 교두보가 가장 고른 x345(3,441 / 3,281)를 골랐다.
    //   · 어촌8 바로 위: **남북 x51 y1777~1789**(도하 11셀 · 교두보 2,277 / 3,977) — 마을 바로 북쪽.
    // ★[11차 재민 지시] 농촌17 서쪽 강에 동서다리 둘 + 어촌5 다리 서쪽 이전
    //   · 농촌17 북서 동서  y1980 x395~415  도하 19셀 · 교두보 3,278 / 3,344
    //   · 농촌17 남서 동서  y2070 x387~407  도하 19셀 · 교두보 2,984 / 3,217
    //   · 어촌5 바로 위 남북 x196 y2106~2115 도하 8셀 · 교두보 3,316 / 3,352
    //       ★옛 다리(x335~336, y2050~2057)를 **철거**하고 같은 사행천을 따라 서남쪽 154셀,
    //         어촌5 바로 위로 옮겼다. 그 자리가 도하 8셀로 더 짧다(옛 자리 5셀 도하였으나 마을에서 멀었다).
    // ★[11차 재민 지시 "옥돌천이랑 연화천 사이 다리 아래로 내려"]
    //   그 다리는 11차 내내 자리 감사에서 **유일한 부적격**(합류부, 대안 0)으로 뜨던 것이다.
    //   연화천을 따라 남쪽 56셀로 내리니 합류부에서 벗어나고 도하도 5→**4셀**로 짧아졌다.
    //   옛: 동서 x793~800 y2684~2685 (합류부 바로 위) → 새: **동서 y2740 x780~785** · 교두보 3,340 / 3,254
    // ★[11차 재민 지시] 들메수해(옛 매수해_2)에서 11시 방향 300셀 → 한여울강. 그 부근에 **농촌22** 신설
    //   (셀 964,1864 — 17×17 전부 뭍 289/289 · 물까지 11셀 · 최근접 마을 농촌5까지 469셀)
    //   그 바로 위 남북다리: x965~966 y1831~1854 · 도하 22셀 · 교두보 3,551 / 3,081
    // ★[11차 재민 지시] 어촌10 북동 남북 · 어촌9 동쪽 남북 · 임업5 서쪽 동서
    //   · 어촌10 북동 남북 x870 y873~880  도하 6셀 · 교두보 3,297 / 3,104
    //   · 어촌9 동쪽 남북  x845 y537~545  도하 7셀 · 교두보 3,277 / 3,328
    //   · 임업5 서쪽 동서  y650 x912~919  도하 6셀 · 교두보 2,502 / 3,020
    //       ※임업5(980,690) 서쪽은 y680~710 구간이 통째로 **바위 산괴**라 양안이 안 나온다.
    //         물까지 62셀 서쪽·북쪽 40셀의 y650 이 바위를 피하면서 교두보가 가장 넉넉한 자리다.
    bridges: [288,1732,289,1732,288,1731,289,1731,288,1730,289,1730,288,1729,289,1729,288,1728,289,1728,288,1727,289,1727,288,1726,289,1726,288,1725,289,1725,1256,3087,1256,3088,1255,3087,1255,3088,1254,3087,1254,3088,1253,3087,1253,3088,1252,3087,1252,3088,1251,3087,1251,3088,1250,3087,1250,3088,1249,3087,1249,3088,1248,3087,1248,3088,1247,3087,1247,3088,1246,3087,1246,3088,1245,3087,1245,3088,1244,3087,1244,3088,1243,3087,1243,3088,1242,3087,1242,3088,1241,3087,1241,3088,1240,3087,1240,3088,1239,3087,1239,3088,1238,3087,1238,3088,1237,3087,1237,3088,1236,3087,1236,3088,1235,3087,1235,3088,1234,3087,1234,3088,1233,3087,1233,3088,1232,3087,1232,3088,1231,3087,1231,3088,1230,3087,1230,3088,1229,3087,1229,3088,1228,3087,1228,3088,1227,3087,1227,3088,1226,3087,1226,3088,1225,3087,1225,3088,1224,3087,1224,3088,1223,3087,1223,3088,1222,3087,1222,3088,1221,3087,1221,3088,1220,3087,1220,3088,1219,3087,1219,3088,1218,3087,1218,3088,1217,3087,1217,3088,1480,2559,1480,2560,1479,2559,1479,2560,1478,2559,1478,2560,1477,2559,1477,2560,1476,2559,1476,2560,1475,2559,1475,2560,1474,2559,1474,2560,1473,2559,1473,2560,1472,2559,1472,2560,1471,2559,1471,2560,1470,2559,1470,2560,1469,2559,1469,2560,1468,2559,1468,2560,1467,2559,1467,2560,1466,2559,1466,2560,1465,2559,1465,2560,1464,2559,1464,2560,1463,2559,1463,2560,1462,2559,1462,2560,1461,2559,1461,2560,1460,2559,1460,2560,1459,2559,1459,2560,1458,2559,1458,2560,1457,2559,1457,2560,1456,2559,1456,2560,1455,2559,1455,2560,1454,2559,1454,2560,1453,2559,1453,2560,1452,2559,1452,2560,1451,2559,1451,2560,1450,2559,1450,2560,1449,2559,1449,2560,1448,2559,1448,2560,1447,2559,1447,2560,1149,2320,1150,2320,1149,2321,1150,2321,1149,2322,1150,2322,1149,2323,1150,2323,1149,2324,1150,2324,1149,2325,1150,2325,1149,2326,1150,2326,1149,2327,1150,2327,1149,2328,1150,2328,1149,2329,1150,2329,1149,2330,1150,2330,1149,2331,1150,2331,1149,2332,1150,2332,1149,2333,1150,2333,1149,2334,1150,2334,1149,2335,1150,2335,1149,2336,1150,2336,1149,2337,1150,2337,1149,2338,1150,2338,1149,2339,1150,2339,1149,2340,1150,2340,1149,2341,1150,2341,1149,2342,1150,2342,1149,2343,1150,2343,1149,2344,1150,2344,1149,2345,1150,2345,1149,2346,1150,2346,1149,2347,1150,2347,1149,2348,1150,2348,1149,2349,1150,2349,473,1762,473,1763,474,1762,474,1763,475,1762,475,1763,476,1762,476,1763,477,1762,477,1763,478,1762,478,1763,479,1762,479,1763,480,1762,480,1763,481,1762,481,1763,482,1762,482,1763,483,1762,483,1763,484,1762,484,1763,485,1762,485,1763,486,1762,486,1763,487,1762,487,1763,488,1762,488,1763,489,1762,489,1763,490,1762,490,1763,491,1762,491,1763,492,1762,492,1763,493,1762,493,1763,494,1762,494,1763,702,2515,702,2516,703,2515,703,2516,704,2515,704,2516,705,2515,705,2516,706,2515,706,2516,707,2515,707,2516,708,2515,708,2516,1257,3087,1257,3088,1481,2559,1481,2560,1149,2319,1150,2319,472,1762,472,1763,701,2515,701,2516,663,724,663,725,664,724,664,725,665,724,665,725,666,724,666,725,667,724,667,725,668,724,668,725,669,724,669,725,670,724,670,725,671,724,671,725,672,724,672,725,673,724,673,725,674,724,674,725,690,657,691,657,690,658,691,658,690,659,691,659,690,660,691,660,690,661,691,661,690,662,691,662,690,663,691,663,690,664,691,664,690,665,691,665,690,666,691,666,690,667,691,667,136,563,137,563,136,564,137,564,136,565,137,565,136,566,137,566,136,567,137,567,136,568,137,568,136,569,137,569,136,570,137,570,136,571,137,571,136,572,137,572,136,573,137,573,136,574,137,574,1496,177,1496,178,1497,177,1497,178,1498,177,1498,178,1499,177,1499,178,1500,177,1500,178,1501,177,1501,178,1502,177,1502,178,1503,177,1503,178,1504,177,1504,178,1505,177,1505,178,1506,177,1506,178,1640,384,1641,384,1640,385,1641,385,1640,386,1641,386,1640,387,1641,387,1640,388,1641,388,1640,389,1641,389,1640,390,1641,390,1640,391,1641,391,1640,392,1641,392,1983,242,1984,242,1983,243,1984,243,1983,244,1984,244,1983,245,1984,245,1983,246,1984,246,1983,247,1984,247,1983,248,1984,248,1983,249,1984,249,1983,250,1984,250,1983,251,1984,251,1983,252,1984,252,1983,253,1984,253,1983,254,1984,254,1983,255,1984,255,1797,635,1798,635,1797,636,1798,636,1797,637,1798,637,1797,638,1798,638,1797,639,1798,639,1797,640,1798,640,1797,641,1798,641,1797,642,1798,642,1797,643,1798,643,1716,2720,1717,2720,1716,2721,1717,2721,1716,2722,1717,2722,1716,2723,1717,2723,1716,2724,1717,2724,1716,2725,1717,2725,1716,2726,1717,2726,1716,2727,1717,2727,1716,2728,1717,2728,1716,2729,1717,2729,1716,2730,1717,2730,1716,2731,1717,2731,1716,2732,1717,2732,2034,3002,2035,3002,2034,3003,2035,3003,2034,3004,2035,3004,2034,3005,2035,3005,2034,3006,2035,3006,2034,3007,2035,3007,2034,3008,2035,3008,2034,3009,2035,3009,2034,3010,2035,3010,2034,3011,2035,3011,2034,3012,2035,3012,2034,3013,2035,3013,2034,3014,2035,3014,2028,3937,2029,3937,2028,3938,2029,3938,2028,3939,2029,3939,2028,3940,2029,3940,2028,3941,2029,3941,2028,3942,2029,3942,2028,3943,2029,3943,2028,3944,2029,3944,2028,3945,2029,3945,2028,3946,2029,3946,423,3327,424,3327,423,3328,424,3328,423,3329,424,3329,423,3330,424,3330,423,3331,424,3331,423,3332,424,3332,423,3333,424,3333,423,3334,424,3334,423,3335,424,3335,423,3336,424,3336,724,3274,724,3275,725,3274,725,3275,726,3274,726,3275,727,3274,727,3275,728,3274,728,3275,729,3274,729,3275,730,3274,730,3275,731,3274,731,3275,732,3274,732,3275,733,3274,733,3275,734,3274,734,3275,345,736,346,736,345,737,346,737,345,738,346,738,345,739,346,739,345,740,346,740,345,741,346,741,345,742,346,742,345,743,346,743,345,744,346,744,345,745,346,745,345,746,346,746,345,747,346,747,345,748,346,748,345,749,346,749,345,750,346,750,345,751,346,751,345,752,346,752,51,1777,52,1777,51,1778,52,1778,51,1779,52,1779,51,1780,52,1780,51,1781,52,1781,51,1782,52,1782,51,1783,52,1783,51,1784,52,1784,51,1785,52,1785,51,1786,52,1786,51,1787,52,1787,51,1788,52,1788,51,1789,52,1789,395,1980,395,1981,396,1980,396,1981,397,1980,397,1981,398,1980,398,1981,399,1980,399,1981,400,1980,400,1981,401,1980,401,1981,402,1980,402,1981,403,1980,403,1981,404,1980,404,1981,405,1980,405,1981,406,1980,406,1981,407,1980,407,1981,408,1980,408,1981,409,1980,409,1981,410,1980,410,1981,411,1980,411,1981,412,1980,412,1981,413,1980,413,1981,414,1980,414,1981,415,1980,415,1981,387,2070,387,2071,388,2070,388,2071,389,2070,389,2071,390,2070,390,2071,391,2070,391,2071,392,2070,392,2071,393,2070,393,2071,394,2070,394,2071,395,2070,395,2071,396,2070,396,2071,397,2070,397,2071,398,2070,398,2071,399,2070,399,2071,400,2070,400,2071,401,2070,401,2071,402,2070,402,2071,403,2070,403,2071,404,2070,404,2071,405,2070,405,2071,406,2070,406,2071,407,2070,407,2071,196,2106,197,2106,196,2107,197,2107,196,2108,197,2108,196,2109,197,2109,196,2110,197,2110,196,2111,197,2111,196,2112,197,2112,196,2113,197,2113,196,2114,197,2114,196,2115,197,2115,780,2740,780,2741,781,2740,781,2741,782,2740,782,2741,783,2740,783,2741,784,2740,784,2741,785,2740,785,2741,965,1831,966,1831,965,1832,966,1832,965,1833,966,1833,965,1834,966,1834,965,1835,966,1835,965,1836,966,1836,965,1837,966,1837,965,1838,966,1838,965,1839,966,1839,965,1840,966,1840,965,1841,966,1841,965,1842,966,1842,965,1843,966,1843,965,1844,966,1844,965,1845,966,1845,965,1846,966,1846,965,1847,966,1847,965,1848,966,1848,965,1849,966,1849,965,1850,966,1850,965,1851,966,1851,965,1852,966,1852,965,1853,966,1853,965,1854,966,1854,870,873,871,873,870,874,871,874,870,875,871,875,870,876,871,876,870,877,871,877,870,878,871,878,870,879,871,879,870,880,871,880,845,537,846,537,845,538,846,538,845,539,846,539,845,540,846,540,845,541,846,541,845,542,846,542,845,543,846,543,845,544,846,544,845,545,846,545,912,650,912,651,913,650,913,651,914,650,914,651,915,650,915,651,916,650,916,651,917,650,917,651,918,650,918,651,919,650,919,651],
  },
  east_sea_s: {
    port: 3026, biome: 'ocean', displayName: '동중국해',
    groundColor: '#2a5a8a', tintColor: '#1a4a7a',
    worldOffsetX: 41000, worldOffsetY: 18000, zoneWidth: 7000, zoneHeight: 6000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 3500, y: 3000, name: '동중국해 중심' },
    isOcean: true,
  },
  oseania: {
    port: 3022, biome: 'savanna', displayName: '오세니아 (호주+NZ)',
    groundColor: '#c4a05a', tintColor: '#a08040',
    worldOffsetX: 41000, worldOffsetY: 24000, zoneWidth: 7000, zoneHeight: 7000,
    villageSeed: 1022, villageCount: 10,
    mainSquare: { x: 3500, y: 3500, name: '시디니 광장' },
  },

  // === c6: 닛폰 컬럼 (5000w) ===
  nippon: {
    port: 3021, biome: 'mountain', displayName: '닛폰 (日本)',
    groundColor: '#7a8a5a', tintColor: '#5a6a3a',
    worldOffsetX: 48000, worldOffsetY: 5000, zoneWidth: 5000, zoneHeight: 13000,
    villageSeed: 1021, villageCount: 16,
    mainSquare: { x: 2500, y: 6500, name: '도카이 광장' },
  },
  japan_pacific: {
    port: 3028, biome: 'ocean', displayName: '필리핀해+일본남해',
    groundColor: '#2a5a8a', tintColor: '#1a4a7a',
    worldOffsetX: 48000, worldOffsetY: 18000, zoneWidth: 5000, zoneHeight: 13000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 2500, y: 6500, name: '필리핀해 중심' },
    isOcean: true,
  },

  // === 남빙양 (row 4 가로, c4+c5+c6 통합) ===
  nambingyang: {
    port: 3019, biome: 'ocean', displayName: '남빙양',
    groundColor: '#3a6a9a', tintColor: '#2a5a8a',
    worldOffsetX: 31000, worldOffsetY: 31000, zoneWidth: 22000, zoneHeight: 7000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 11000, y: 3500, name: '남빙양 중심' },
    isOcean: true,
  },

  // === c7: 태평양 (8000w) ===
  // bering이 c7 절반(53000~57000) row 0 차지. pacific_arctic은 동쪽 corner 작은 ocean.
  pacific_arctic: {
    port: 3027, biome: 'ocean', displayName: '북태평양 corner',
    groundColor: '#1a3a7a', tintColor: '#0a2a5a',
    worldOffsetX: 57000, worldOffsetY: 0, zoneWidth: 4000, zoneHeight: 5000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 2000, y: 2500, name: '북태평양 NE' },
    isOcean: true,
  },
  pacific: {
    port: 3024, biome: 'ocean', displayName: '태평양',
    groundColor: '#1a3a7a', tintColor: '#0a2a5a',
    worldOffsetX: 53000, worldOffsetY: 5000, zoneWidth: 8000, zoneHeight: 33000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 4000, y: 16500, name: '태평양 중심' },
    isOcean: true,
  },
};

// ── Phase 5-3: world scale ────────────────────────────────────────
// 좌표·크기 일괄 배율. SCALE=1이면 옛 크기, SCALE=10이면 가로세로 10배 (면적 100배, PZ급).
// 환경변수 WORLD_SCALE로 운영 중 변경 가능.
const WORLD_SCALE = parseFloat(process.env.WORLD_SCALE || '10');
// 타일 그리드 정렬: zone 경계(offset, offset+size)를 32px 배수로 floor 스냅.
// offset이 32 배수가 아니면 zone 로컬 그리드(벽·물 콜라이더)가 클라 절대 타일 그리드와
// 반 셀(16px) 어긋남 (예: 한반도 410000 mod 32 = 16 → 남동쪽 0.5셀 shift 버그).
// 경계선 자체를 스냅하므로 인접 zone끼리 이음새(겹침/틈) 없음.
const TILE = 32;
const _snap = (v) => Math.floor(v / TILE) * TILE;
for (const [id, z] of Object.entries(ZONES_BASE)) {
  const rawX = z.worldOffsetX * WORLD_SCALE;
  const rawY = z.worldOffsetY * WORLD_SCALE;
  const rawR = rawX + z.zoneWidth * WORLD_SCALE;   // right
  const rawB = rawY + z.zoneHeight * WORLD_SCALE;  // bottom
  z.worldOffsetX = _snap(rawX);
  z.worldOffsetY = _snap(rawY);
  z.zoneWidth = _snap(rawR) - z.worldOffsetX;
  z.zoneHeight = _snap(rawB) - z.worldOffsetY;
  if (z.mainSquare) {
    // canadia는 시뮬 마을 좌표(1k~10k px)에 마을이 몰려있으므로 spawn은 시뮬 영역에.
    // (시뮬 마을 좌표 ×10 fix는 별도 task)
    if (id === 'canadia') {
      // 시뮬 마을 평균 좌표 (5500, 2500) 그대로
    } else {
      z.mainSquare.x = Math.round(z.mainSquare.x * WORLD_SCALE);
      z.mainSquare.y = Math.round(z.mainSquare.y * WORLD_SCALE);
    }
  }
}

// host 채우기 + ENABLED_ZONES 적용
const _enabledStr = process.env.ENABLED_ZONES;
const _enabled = _enabledStr ? new Set(_enabledStr.split(',').map(s => s.trim())) : null;
const ZONES = {};
for (const [id, z] of Object.entries(ZONES_BASE)) {
  if (_enabled && !_enabled.has(id)) continue;
  ZONES[id] = {
    ...z,
    host: hostFromEnv(id, 'localhost'),
  };
}

const CENTRAL = {
  host: process.env.CENTRAL_HOST || 'localhost',
  port: parseInt(process.env.CENTRAL_PORT || '3010', 10),
  proto: HTTP_PROTO,
};

let _maxX = 0, _maxY = 0;
for (const z of Object.values(ZONES_BASE)) {
  _maxX = Math.max(_maxX, z.worldOffsetX + z.zoneWidth);
  _maxY = Math.max(_maxY, z.worldOffsetY + z.zoneHeight);
}
const WORLD = {
  worldWidth: _maxX,
  worldHeight: _maxY,
  tileSize: 32,
  dayLengthMs: 24 * 60 * 1000,  // 하루=현실 24분(현실 1초=게임 1분) [사용자 확정 — 종전 10분에서 변경]. 단일 노브: 하늘·econ 게임일·생활층·작물 전부 이 값 파생
  dayPhaseRatio: 0.7,
  worldEpoch: 0,
  zoneWidth: 100000, zoneHeight: 100000, // 옛 호환 (Phase 5-3에서 ×10)
};
// ═══════════ ★[§19 4파 — 절대 타임스탬프 시계 설계 예약(주석+상수만, 동작 무변경)] ═══════════
// 캐논(설계_실축화_1셀1m.md §19): 게임시각 = (실UTC ms − REAL_EPOCH) × GAME_TIME_SCALE + GAME_EPOCH — 순수 함수.
//   · 드리프트 0(서버 재시작·존 간 동기 공짜) · 클라 표시 위임 안전(조작=자기 화면만) · DST/윤초 금지(UTC epoch만).
//   · ★필수 분리: '시각'(표시·일출몰·일과)은 공식이 소유, '세계 상태'(econ·자원)는 틱이 소유 — 서버 정지 중에도
//     시계는 흐르므로 econ은 공식 날짜를 따라잡는 캐치업(일틱 ~ms/마을이라 실현 가능)이 별도 설계 세션 몫.
//   · 채택 시 이행: worldPhase/isNight/gameDayOf가 아래 상수 기반 공식으로 대체되고 worldEpoch(상대 앵커)는 폐기.
//     경도 오프셋(§19)은 +(x/W)×(하루의 4.5%) 게임초 — villages._lonOff와 동일 공식(이미 4파 배선).
//   · 현행 유지 이유: 전 존·central 영향(캐치업·저장 마이그레이션) — 별도 웨이브(계획서 §3-4파 5항).
const ABS_CLOCK_DESIGN = {
  GAME_TIME_SCALE: 60,                      // 1실초 = 60게임초(캐논 §1 시간 60×)
  REAL_EPOCH_UTC: Date.UTC(2026, 0, 1),     // 실세계 기준점(예시 — 채택 세션에서 확정·불변 계약)
  GAME_EPOCH_DAYS: 0,                       // 게임력 기점(예: '기원전 150년' 달력 매핑은 표시 층 몫)
  ADOPTED: false,                            // ★미채택 — 어떤 코드도 이 블록을 읽지 않는다(설계 예약 전용)
};

function worldPhase(nowMs = Date.now()) {
  const t = (nowMs - WORLD.worldEpoch) % WORLD.dayLengthMs;
  return t / WORLD.dayLengthMs;
}
function isNight(nowMs = Date.now()) {
  return worldPhase(nowMs) > WORLD.dayPhaseRatio;
}
function darknessLevel(nowMs = Date.now()) {
  const p = worldPhase(nowMs);
  if (p < WORLD.dayPhaseRatio - 0.05) return 0;
  if (p < WORLD.dayPhaseRatio) return (p - (WORLD.dayPhaseRatio - 0.05)) / 0.05;
  if (p > 0.95) return (1 - p) / 0.05;
  return 1;
}

function findZoneAt(absX, absY) {
  for (const [id, z] of Object.entries(ZONES_BASE)) {
    if (absX >= z.worldOffsetX && absX < z.worldOffsetX + z.zoneWidth &&
        absY >= z.worldOffsetY && absY < z.worldOffsetY + z.zoneHeight) {
      return { id, ...z };
    }
  }
  return null;
}

const WRAP_X = null;
function worldDeltaX(a, b) {
  let dx = b - a;
  if (WRAP_X !== null) {
    const w = WRAP_X;
    if (dx > w / 2)  dx -= w;
    if (dx < -w / 2) dx += w;
  }
  return dx;
}
function worldDistance(ax, ay, bx, by) {
  const dx = worldDeltaX(ax, bx);
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

const ZONE_ORDER = Object.keys(ZONES_BASE);

function publicZoneMap(fallbackHost = 'localhost') {
  const enabledStr = process.env.ENABLED_ZONES;
  const enabled = enabledStr ? new Set(enabledStr.split(',').map(s => s.trim())) : null;
  const map = {};
  for (const [id, z] of Object.entries(ZONES)) {
    if (enabled && !enabled.has(id)) continue;
    const host = z.host || fallbackHost;
    const portPart = WS_PROTO === 'wss' ? '' : `:${z.port}`;
    map[id] = {
      id,
      wsUrl: `${WS_PROTO}://${host}${portPart}`,
      host,
      displayName: z.displayName,
      biome: z.biome,
      groundColor: z.groundColor,
      tintColor: z.tintColor,
      worldOffsetX: z.worldOffsetX,
      worldOffsetY: z.worldOffsetY,
      zoneWidth: z.zoneWidth,
      zoneHeight: z.zoneHeight,
      simulatedLatencyMs: z.simulatedLatencyMs || 0,
      mainSquare: z.mainSquare || null,
      isOcean: !!z.isOcean,
      north: _findNeighborSide(id, 'N'),
      south: _findNeighborSide(id, 'S'),
      east:  _findNeighborSide(id, 'E'),
      west:  _findNeighborSide(id, 'W'),
    };
  }
  return map;
}

function _findNeighborSide(zoneId, side) {
  const z = ZONES_BASE[zoneId];
  if (!z) return null;
  let probeX, probeY;
  const eps = 1;
  if (side === 'N') { probeX = z.worldOffsetX + z.zoneWidth / 2;  probeY = z.worldOffsetY - eps; }
  if (side === 'S') { probeX = z.worldOffsetX + z.zoneWidth / 2;  probeY = z.worldOffsetY + z.zoneHeight + eps; }
  if (side === 'W') { probeX = z.worldOffsetX - eps;              probeY = z.worldOffsetY + z.zoneHeight / 2; }
  if (side === 'E') { probeX = z.worldOffsetX + z.zoneWidth + eps; probeY = z.worldOffsetY + z.zoneHeight / 2; }
  const hit = findZoneAt(probeX, probeY);
  return hit ? hit.id : null;
}

module.exports = {
  ABS_CLOCK_DESIGN, // §19 절대 시계 설계 예약(미채택 — 관측·문서용)
  ZONES, WORLD, ZONE_ORDER, CENTRAL, WS_PROTO, HTTP_PROTO,
  publicZoneMap, worldPhase, isNight, darknessLevel,
  findZoneAt, worldDistance, worldDeltaX, WRAP_X,
};
