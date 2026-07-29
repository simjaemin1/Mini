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
    //     · #1 낙만강×청풍천 — 남쪽 교두보 뭍 1,708칸(반대편 3,328칸의 절반) → +30셀 이동
    //         도하 29→28셀 · 교두보 3,328/1,708 → 3,231/2,994 · 청풍천까지 4.1→29.4셀
    //     · #2 자인천×봉수천 — Y자 분기점 위 → -12셀 이동
    //         도하 21→20셀 · 교두보 1,871/3,021 → 2,681/2,709 · 봉수천까지 8.6→22.2셀
    //     · #5 연화천×옥계천 — ±60셀 안에 대안 없음(더 좁고 합류부 아닌 자리가 없다) → **유지**
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
    bridges: [288,1732,289,1732,288,1731,289,1731,288,1730,289,1730,288,1729,289,1729,288,1728,289,1728,288,1727,289,1727,288,1726,289,1726,288,1725,289,1725,1256,3087,1256,3088,1255,3087,1255,3088,1254,3087,1254,3088,1253,3087,1253,3088,1252,3087,1252,3088,1251,3087,1251,3088,1250,3087,1250,3088,1249,3087,1249,3088,1248,3087,1248,3088,1247,3087,1247,3088,1246,3087,1246,3088,1245,3087,1245,3088,1244,3087,1244,3088,1243,3087,1243,3088,1242,3087,1242,3088,1241,3087,1241,3088,1240,3087,1240,3088,1239,3087,1239,3088,1238,3087,1238,3088,1237,3087,1237,3088,1236,3087,1236,3088,1235,3087,1235,3088,1234,3087,1234,3088,1233,3087,1233,3088,1232,3087,1232,3088,1231,3087,1231,3088,1230,3087,1230,3088,1229,3087,1229,3088,1228,3087,1228,3088,1227,3087,1227,3088,1226,3087,1226,3088,1225,3087,1225,3088,1224,3087,1224,3088,1223,3087,1223,3088,1222,3087,1222,3088,1221,3087,1221,3088,1220,3087,1220,3088,1219,3087,1219,3088,1218,3087,1218,3088,1217,3087,1217,3088,796,2684,796,2685,797,2684,797,2685,798,2684,798,2685,799,2684,799,2685,800,2684,800,2685,1510,382,1511,382,1510,383,1511,383,1510,384,1511,384,1510,385,1511,385,1510,386,1511,386,1510,387,1511,387,1510,388,1511,388,1480,2559,1480,2560,1479,2559,1479,2560,1478,2559,1478,2560,1477,2559,1477,2560,1476,2559,1476,2560,1475,2559,1475,2560,1474,2559,1474,2560,1473,2559,1473,2560,1472,2559,1472,2560,1471,2559,1471,2560,1470,2559,1470,2560,1469,2559,1469,2560,1468,2559,1468,2560,1467,2559,1467,2560,1466,2559,1466,2560,1465,2559,1465,2560,1464,2559,1464,2560,1463,2559,1463,2560,1462,2559,1462,2560,1461,2559,1461,2560,1460,2559,1460,2560,1459,2559,1459,2560,1458,2559,1458,2560,1457,2559,1457,2560,1456,2559,1456,2560,1455,2559,1455,2560,1454,2559,1454,2560,1453,2559,1453,2560,1452,2559,1452,2560,1451,2559,1451,2560,1450,2559,1450,2560,1449,2559,1449,2560,1448,2559,1448,2560,1447,2559,1447,2560,1149,2320,1150,2320,1149,2321,1150,2321,1149,2322,1150,2322,1149,2323,1150,2323,1149,2324,1150,2324,1149,2325,1150,2325,1149,2326,1150,2326,1149,2327,1150,2327,1149,2328,1150,2328,1149,2329,1150,2329,1149,2330,1150,2330,1149,2331,1150,2331,1149,2332,1150,2332,1149,2333,1150,2333,1149,2334,1150,2334,1149,2335,1150,2335,1149,2336,1150,2336,1149,2337,1150,2337,1149,2338,1150,2338,1149,2339,1150,2339,1149,2340,1150,2340,1149,2341,1150,2341,1149,2342,1150,2342,1149,2343,1150,2343,1149,2344,1150,2344,1149,2345,1150,2345,1149,2346,1150,2346,1149,2347,1150,2347,1149,2348,1150,2348,1149,2349,1150,2349,473,1762,473,1763,474,1762,474,1763,475,1762,475,1763,476,1762,476,1763,477,1762,477,1763,478,1762,478,1763,479,1762,479,1763,480,1762,480,1763,481,1762,481,1763,482,1762,482,1763,483,1762,483,1763,484,1762,484,1763,485,1762,485,1763,486,1762,486,1763,487,1762,487,1763,488,1762,488,1763,489,1762,489,1763,490,1762,490,1763,491,1762,491,1763,492,1762,492,1763,493,1762,493,1763,494,1762,494,1763,69,543,70,543,69,544,70,544,69,545,70,545,69,546,70,546,69,547,70,547,702,2515,702,2516,703,2515,703,2516,704,2515,704,2516,705,2515,705,2516,706,2515,706,2516,707,2515,707,2516,708,2515,708,2516,335,2057,336,2057,335,2056,336,2056,335,2055,336,2055,335,2054,336,2054,335,2053,336,2053,335,2052,336,2052,335,2051,336,2051,345,741,345,742,346,741,346,742,347,741,347,742,348,741,348,742,349,741,349,742,350,741,350,742,351,741,351,742],
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
