// === server/terrain.js — zone별 지리 (강·호수·숲·산·광맥) ===
// Phase 5-1 (보강): 사실적 캐나다 매핑
//
// scale 가정: 1 px ≈ 1.35 km (zone 110K px ≈ 캐나다 동서 5,500 km × 0.55)
//   - 호수 면적: 실제 비율 (km² × 550 ≈ 면적 px²)
//   - 강 폭: 시각상 ×10 확대 (1 km 강 → 7~8 px가 아닌 70~80 px)
//
// shape 종류:
//   - lake.shape='circle': { center, radius }
//   - lake.shape='ellipse': { center, a, b, rotation } — 길쭉한 호수
//   - lake.shape='multi':   { circles: [{center, radius}, ...] } — 복잡 형상
// 강 path: [ {pos: [x,y], width: N}, ... ] — segment별 width 보간
//
// API:
//   ZONE_TERRAIN[zoneId]
//   isWaterCellLocal(zoneId, localX, localY)
//   getTerrainWaterTilesForChunk(zoneId, cx, cy, chunkSize)
//   getForestMultiplier(zoneId, x, y) — tree density 배율
//   getStoneMultiplier(zoneId, x, y) — stone density 배율
//   isOreClusterAt(zoneId, x, y)
//   getTileType(zoneId, x, y) — 미니맵용: 'water'|'forest'|'mountain'|'ore'|'plain'

const ZONE_TERRAIN = {
  // === 캐나디아 — 실제 캐나다 지도 모티브 ===
  // x: 0~110000 (서→동, 밴쿠버→핼리팩스, 5500 km)
  // y: 0~50000  (북→남, 북극해→미국 국경, 2500 km)
  canadia: {
    rivers: [
      // 유콘강 — 알래스카 방향 (서북→서)
      // 실제 길이 3,190 km, 폭 평균 500m~2km
      { name: '유콘강', path: [
        { pos: [15000, 3500], width: 80 },
        { pos: [11000, 4500], width: 120 },
        { pos: [7000, 6000],  width: 160 },
        { pos: [4000, 7500],  width: 200 },
        { pos: [2000, 8500],  width: 250 },  // 알래스카 국경 (게임 zone 서변)
      ]},
      // 마켄지강 — 그레이트슬레이브호 → 북극해 (북서)
      // 실제 1,738 km, 하구 7~10 km
      { name: '마켄지강', path: [
        { pos: [27000, 11000], width: 200 },  // 그레이트슬레이브호 유출
        { pos: [25000, 8500],  width: 350 },
        { pos: [23500, 6000],  width: 500 },
        { pos: [22500, 4000],  width: 700 },
        { pos: [22000, 2000],  width: 1000 }, // 북극해 하구
      ]},
      // 프레이저강 — 로키 산맥 → 태평양 (서남)
      // 실제 1,375 km, 하구 1 km
      { name: '프레이저강', path: [
        { pos: [16000, 18000], width: 80 },   // 로키 발원
        { pos: [13000, 21000], width: 120 },
        { pos: [10000, 24000], width: 180 },
        { pos: [7000, 26500],  width: 250 },  // 태평양 하구
      ]},
      // 콜롬비아강 — 캐나다 BC → 미국 (서남, 짧게)
      // 실제 2,000 km (캐나다 측 약 500 km)
      { name: '콜롬비아강', path: [
        { pos: [13000, 25000], width: 100 },
        { pos: [11000, 28000], width: 160 },
        { pos: [9000, 30000],  width: 220 },
      ]},
      // 세인트로렌스강 — 5대호 → 대서양 (동)
      // 실제 3,058 km, 하구 80~100 km (게임상 시각 ÷10)
      { name: '세인트로렌스강', path: [
        { pos: [90000, 33000],  width: 350 },  // 온타리오호 유출
        { pos: [94000, 31500],  width: 500 },
        { pos: [98000, 30000],  width: 800 },
        { pos: [102000, 28000], width: 1300 },
        { pos: [105500, 26000], width: 2200 },
        { pos: [108500, 24000], width: 3500 }, // 대서양 하구 (산로렌만)
      ]},
      // 처칠강 — 중북 → 허드슨만
      // 실제 1,609 km
      { name: '처칠강', path: [
        { pos: [38000, 18000], width: 100 },
        { pos: [45000, 16500], width: 160 },
        { pos: [51000, 15000], width: 220 },
        { pos: [55000, 14000], width: 280 },   // 허드슨만 입수
      ]},
      // 넬슨강 — 위니펙호 → 허드슨만
      // 실제 644 km, 큰 강
      { name: '넬슨강', path: [
        { pos: [55000, 22000], width: 200 },   // 위니펙호 유출
        { pos: [55500, 19000], width: 300 },
        { pos: [55000, 16000], width: 400 },
        { pos: [54000, 14000], width: 500 },   // 허드슨만
      ]},
      // 올바니강 — 동중 → 허드슨만 (제임스만)
      { name: '올바니강', path: [
        { pos: [68000, 22000], width: 100 },
        { pos: [65000, 19500], width: 150 },
        { pos: [62000, 17500], width: 220 },
      ]},
      // 레드강 — 남에서 위니펙호로 (북향)
      { name: '레드강', path: [
        { pos: [54000, 28000], width: 80 },
        { pos: [54500, 25000], width: 120 },
        { pos: [55000, 22500], width: 180 },   // 위니펙호 유입
      ]},
      // 미시시피강 (캐나다 X지만 게임 zone 남쪽 가장자리 표시)
      // 생략 — 미국 zone에서 처리
    ],
    lakes: [
      // ── 허드슨만 (실제 1.23M km², 캐나다 면적의 12% — multi-circle 큰 만) ──
      { name: '허드슨만', shape: 'multi', circles: [
        { center: [50000, 13000], radius: 6500 },
        { center: [58000, 12000], radius: 6500 },
        { center: [62000, 16000], radius: 5500 },
        { center: [54000, 18000], radius: 5500 },
        { center: [47000, 17000], radius: 4500 },
        { center: [64000, 20000], radius: 4000 }, // 제임스만 (남부 연장)
        { center: [68000, 17500], radius: 3500 },
      ]},
      // ── 5대호 (실제 비율 — 일부 미국 zone 경계 가까이) ──
      // 슈피리어호 (82,100 km², 가로 560×260km — 가장 길쭉)
      { name: '슈피리어호', shape: 'ellipse',
        center: [73000, 32500], a: 4500, b: 2000, rotation: -0.15 },
      // 미시간호 (58,000 km², 길쭉 세로 — 미국 zone 경계)
      { name: '미시간호', shape: 'ellipse',
        center: [77000, 37000], a: 1700, b: 3800, rotation: 0 },
      // 휴런호 (59,600 km², 둥글지만 약간 길쭉)
      { name: '휴런호', shape: 'ellipse',
        center: [82000, 33000], a: 2800, b: 2200, rotation: 0.2 },
      // 이리호 (25,700 km², 가로 길쭉)
      { name: '이리호', shape: 'ellipse',
        center: [85000, 36500], a: 2200, b: 900, rotation: -0.1 },
      // 온타리오호 (19,000 km², 가로 길쭉)
      { name: '온타리오호', shape: 'ellipse',
        center: [89000, 34000], a: 1800, b: 800, rotation: 0 },

      // ── 캐나다 내륙 큰 호수 (사실적 비율) ──
      // 그레이트베어호 (31,000 km², 십자 모양)
      { name: '그레이트베어호', shape: 'multi', circles: [
        { center: [18000, 4500], radius: 1800 },
        { center: [21000, 5000], radius: 1600 },
        { center: [19500, 6500], radius: 1400 },
        { center: [16500, 6000], radius: 1200 },
      ]},
      // 그레이트슬레이브호 (28,000 km², L자 길쭉)
      { name: '그레이트슬레이브호', shape: 'multi', circles: [
        { center: [27000, 10500], radius: 1700 },
        { center: [29500, 11500], radius: 1400 },
        { center: [25000, 11000], radius: 1300 },
      ]},
      // 위니펙호 (24,500 km², 남북 길쭉)
      { name: '위니펙호', shape: 'ellipse',
        center: [55000, 22500], a: 1000, b: 2200, rotation: 0 },
      // 위니페고시스호 (5,400 km²)
      { name: '위니페고시스호', shape: 'ellipse',
        center: [50000, 23500], a: 700, b: 1400, rotation: -0.2 },
      // 마니토바호 (4,624 km²)
      { name: '마니토바호', shape: 'ellipse',
        center: [52500, 24500], a: 600, b: 1500, rotation: 0 },
      // 아타바스카호 (7,850 km², 동서 길쭉)
      { name: '아타바스카호', shape: 'ellipse',
        center: [30000, 13000], a: 1700, b: 600, rotation: 0.1 },
      // 레인디어호 (6,650 km², 좀 길쭉)
      { name: '레인디어호', shape: 'ellipse',
        center: [36000, 14500], a: 800, b: 1500, rotation: 0.3 },
      // 누에치카니카호 (1,950 km², 작음)
      { name: '누에치카니카호', shape: 'circle',
        center: [40000, 12500], radius: 900 },
    ],
    forests: [
      // 보리얼 forest — 캐나다 가로띠 (taiga + 침엽수 띠)
      // 실제로 캐나다 면적의 50% (북위 50~60°)
      { name: '보리얼 포레스트', rect: [3000, 13000, 108000, 27000], densityMult: 2.2 },
      // 알공킨 숲 — 동부 (온타리오·퀘벡 활엽수)
      { name: '알공킨 숲', rect: [78000, 27000, 105000, 35000], densityMult: 1.6 },
      // 태평양 코스트 레인포레스트 — 서해안
      { name: '태평양 우림', rect: [3000, 22000, 12000, 35000], densityMult: 1.8 },
    ],
    mountains: [
      // 로키 산맥 — 서쪽 세로띠 (BC·앨버타)
      { name: '로키 산맥', rect: [10000, 8000, 20000, 35000], stoneMult: 3.0 },
      // 코스트 산맥 — 더 서쪽 (해안)
      { name: '코스트 산맥', rect: [3500, 15000, 9000, 35000], stoneMult: 2.5 },
      // 캐나디안 실드 — 중북부 (오래된 암반 지대)
      { name: '캐나디안 실드', rect: [30000, 13000, 78000, 26000], stoneMult: 1.5 },
      // 애팔래치아 — 동남 (작게)
      { name: '애팔래치아', rect: [98000, 36000, 108000, 48000], stoneMult: 2.0 },
    ],
    ores: [
      // 클론다이크 골드러시 — 유콘 (서북)
      { name: '클론다이크 금광', center: [6000, 4500], radius: 800, oreType: 'gold' },
      // 슈드베리 분지 — 세계 최대 니켈 매장 (중동부)
      { name: '슈드베리 니켈광', center: [83000, 30000], radius: 1100, oreType: 'nickel' },
      // 앨버타 타르샌드 — 중서 (석유)
      { name: '앨버타 타르샌드', center: [22000, 19000], radius: 1500, oreType: 'iron' },
      // 로키 광맥 (BC 금·구리)
      { name: '로키 광맥', center: [15000, 20000], radius: 900, oreType: 'iron' },
      // 헤메즈 광맥 (NWT 다이아몬드)
      { name: '에카티 다이아몬드', center: [24000, 8000], radius: 600, oreType: 'gold' },
      // 보트우드 철광 (라브라도르)
      { name: '라브라도르 철광', center: [88000, 22000], radius: 1100, oreType: 'iron' },
    ],
  },

  // === 한반도 — 실제 지도 모티브 ===
  // x: 0~70000 (서→동, 황해→동해)
  // y: 0~130000 (북→남, 백두산→남해·제주)
  // 분단선: y=45000 (38선 근처). 0~45000 북한, 45000~115000 남한, 115000~130000 남해·제주
  // 광물: 북한 동북부 집중 (현실적 — 남한은 광물 빈약)
  hanbando: {
    rivers: [
      // 압록강 — 백두산 → 황해 (북서, 중·북 국경)
      { name: '압록강', path: [
        { pos: [40000, 5000],  width: 150 },  // 백두산 발원
        { pos: [32000, 9000],  width: 200 },
        { pos: [22000, 14000], width: 280 },
        { pos: [12000, 18000], width: 380 },
        { pos: [3000, 22000],  width: 500 },  // 단동만 (황해)
      ]},
      // 두만강 — 백두산 → 동해 (북동, 중·러 국경)
      { name: '두만강', path: [
        { pos: [40000, 5000],  width: 100 },  // 백두산
        { pos: [50000, 7000],  width: 150 },
        { pos: [60000, 9000],  width: 200 },
        { pos: [68000, 11000], width: 260 },  // 동해 하구
      ]},
      // 대동강 — 평양 (북한 중부)
      { name: '대동강', path: [
        { pos: [40000, 28000], width: 150 },  // 발원 (강원도 부근)
        { pos: [28000, 33000], width: 250 },
        { pos: [15000, 36000], width: 350 },
        { pos: [3000, 38000],  width: 450 },  // 황해 하구
      ]},
      // 한강 — 서울 통과 (중부 핵심)
      { name: '한강', path: [
        { pos: [50000, 55000], width: 180 },  // 태백산맥 발원
        { pos: [40000, 58000], width: 280 },
        { pos: [25000, 60000], width: 400 },
        { pos: [10000, 62000], width: 550 },
        { pos: [2000, 63000],  width: 700 },  // 황해 하구 (인천)
      ]},
      // 금강 — 충청 → 황해
      { name: '금강', path: [
        { pos: [45000, 75000], width: 120 },
        { pos: [30000, 78000], width: 200 },
        { pos: [15000, 80000], width: 300 },
        { pos: [3000, 82000],  width: 400 },
      ]},
      // 영산강 — 전라 → 황해 (남서)
      { name: '영산강', path: [
        { pos: [25000, 100000], width: 100 },
        { pos: [15000, 105000], width: 160 },
        { pos: [5000, 110000],  width: 240 },
      ]},
      // 섬진강 — 남부 → 남해
      { name: '섬진강', path: [
        { pos: [32000, 95000],  width: 100 },
        { pos: [32000, 105000], width: 160 },
        { pos: [35000, 113000], width: 220 },
      ]},
      // 낙동강 — 영남 → 남해 (대구·부산, 가장 긴 강)
      { name: '낙동강', path: [
        { pos: [55000, 60000],  width: 150 },  // 태백 발원
        { pos: [50000, 75000],  width: 250 },
        { pos: [48000, 90000],  width: 350 },
        { pos: [52000, 105000], width: 450 },
        { pos: [58000, 115000], width: 600 },  // 남해 하구 (부산)
      ]},
      // 청천강 — 평양 북부
      { name: '청천강', path: [
        { pos: [40000, 22000], width: 100 },
        { pos: [25000, 26000], width: 180 },
        { pos: [10000, 30000], width: 260 },
      ]},
    ],
    lakes: [
      // 천지 — 백두산 칼데라호 (작지만 상징적)
      { name: '천지', shape: 'circle', center: [40000, 5000], radius: 400 },
      // 장진호 — 북한 함흥 (큰 인공호)
      { name: '장진호', shape: 'ellipse',
        center: [48000, 19000], a: 350, b: 700, rotation: 0.2 },
      // 부전호 — 북한 (작음)
      { name: '부전호', shape: 'circle', center: [52000, 21000], radius: 350 },
      // 소양호 — 강원도 (남한 대형 인공호)
      { name: '소양호', shape: 'ellipse',
        center: [52000, 58000], a: 800, b: 350, rotation: -0.1 },
      // 충주호 — 충청 (남한 인공호)
      { name: '충주호', shape: 'ellipse',
        center: [38000, 70000], a: 600, b: 350, rotation: 0.3 },
      // 안동호 — 영남 (남한 인공호)
      { name: '안동호', shape: 'circle', center: [52000, 80000], radius: 500 },
      // 진양호 — 남부
      { name: '진양호', shape: 'circle', center: [38000, 105000], radius: 400 },
    ],
    forests: [
      // 백두대간 — 태백산맥 따라 한반도 척추 (남북 세로)
      { name: '백두대간', rect: [38000, 15000, 58000, 105000], densityMult: 2.5 },
      // 지리산 일대 — 남부
      { name: '지리산', rect: [25000, 95000, 42000, 115000], densityMult: 2.0 },
      // 금강산·설악산 일대 — 동북
      { name: '금강산', rect: [50000, 35000, 65000, 60000], densityMult: 2.2 },
      // 개마고원 침엽수 — 북부
      { name: '개마고원 숲', rect: [30000, 12000, 60000, 25000], densityMult: 1.8 },
    ],
    mountains: [
      // 백두산 — 최북단
      { name: '백두산', rect: [36000, 3000, 44000, 10000], stoneMult: 3.5 },
      // 개마고원 — 북부 고원 (한반도 최고지대)
      { name: '개마고원', rect: [25000, 8000, 62000, 22000], stoneMult: 2.5 },
      // 태백산맥 — 동해안 따라 남북 (한반도 척추)
      { name: '태백산맥', rect: [45000, 22000, 62000, 95000], stoneMult: 2.8 },
      // 소백산맥 — 남부 가로 (영남·호남 경계)
      { name: '소백산맥', rect: [18000, 80000, 50000, 100000], stoneMult: 2.2 },
      // 지리산 — 남부
      { name: '지리산 산맥', rect: [22000, 95000, 38000, 112000], stoneMult: 2.5 },
    ],
    ores: [
      // ── 북한 동북부 광물 집중 (현실적 — 남한은 광물 빈약) ──
      // 무산 철광 — 동북아 최대 철광 (북한 함경북도)
      { name: '무산 철광', center: [60000, 11000], radius: 1200, oreType: 'iron' },
      // 검덕 광산 — 아연·연 (북한)
      { name: '검덕 광산', center: [55000, 14000], radius: 700, oreType: 'nickel' },
      // 단천 마그네사이트 — 세계 최대급
      { name: '단천 광산', center: [50000, 16000], radius: 600, oreType: 'gold' },
      // 무산 텅스텐
      { name: '대유동 광산', center: [25000, 8000], radius: 500, oreType: 'gold' },
      // ── 남한은 작은 광맥 몇 곳만 ──
      // 태백 석탄 — 강원도 (한국 최대 석탄지대)
      { name: '태백 석탄광', center: [52000, 55000], radius: 700, oreType: 'iron' },
      // 영월·정선 석회암 — 시멘트
      { name: '영월 석회암', center: [48000, 62000], radius: 500, oreType: 'iron' },
      // 상동 텅스텐 (한때 세계 1위)
      { name: '상동 광산', center: [50000, 58000], radius: 400, oreType: 'gold' },
    ],
  },

  // === 닛폰 (일본) — 50000 × 130000 ===
  //   세로로 길게 — 홋카이도(북)·혼슈(중)·시코쿠/규슈(남)
  nippon: {
    rivers: [
      // 이시카리강 — 홋카이도 (최북)
      { name: '이시카리강', path: [
        { pos: [30000, 12000], width: 150 },
        { pos: [20000, 16000], width: 220 },
        { pos: [12000, 20000], width: 300 },
      ]},
      // 시나노강 — 혼슈 중부 (니가타)
      { name: '시나노강', path: [
        { pos: [22000, 55000], width: 180 },
        { pos: [15000, 50000], width: 280 },
        { pos: [8000, 47000],  width: 400 },
      ]},
      // 도네강 — 도쿄 권 (관동평야)
      { name: '도네강', path: [
        { pos: [32000, 65000], width: 200 },
        { pos: [38000, 70000], width: 280 },
        { pos: [44000, 73000], width: 400 },
      ]},
      // 요도가와 — 비와호 → 오사카만 (긴키)
      { name: '요도가와', path: [
        { pos: [22000, 88000], width: 150 },  // 비와호 유출
        { pos: [17000, 92000], width: 220 },
        { pos: [13000, 96000], width: 300 },  // 오사카만
      ]},
      // 치쿠고강 — 규슈
      { name: '치쿠고강', path: [
        { pos: [18000, 118000], width: 120 },
        { pos: [12000, 122000], width: 200 },
      ]},
    ],
    lakes: [
      // 비와호 — 일본 최대 호수 (혼슈 중부)
      { name: '비와호', shape: 'ellipse',
        center: [25000, 85000], a: 500, b: 1200, rotation: 0.1 },
      // 도와다호 — 도호쿠 칼데라호
      { name: '도와다호', shape: 'circle', center: [35000, 35000], radius: 500 },
      // 쿠시로호 — 홋카이도 동부
      { name: '쿠시로호', shape: 'circle', center: [42000, 8000], radius: 400 },
      // 추젠지호 — 닛코
      { name: '추젠지호', shape: 'circle', center: [30000, 62000], radius: 350 },
    ],
    forests: [
      // 다이세쓰 원시림 — 홋카이도 중부
      { name: '다이세쓰 원시림', rect: [22000, 8000, 38000, 22000], densityMult: 2.5 },
      // 오쿠치치부 — 관동산지
      { name: '오쿠치치부 숲', rect: [25000, 55000, 38000, 70000], densityMult: 2.2 },
      // 야쿠시마 삼나무 — 규슈 남단
      { name: '야쿠시마', rect: [12000, 122000, 22000, 130000], densityMult: 2.8 },
      // 시라카미 너도밤나무 — 도호쿠 북부
      { name: '시라카미 산지', rect: [28000, 30000, 40000, 42000], densityMult: 2.3 },
    ],
    mountains: [
      // 일본 알프스 — 혼슈 중부 (북·중·남)
      { name: '일본 알프스', rect: [25000, 60000, 42000, 80000], stoneMult: 3.0 },
      // 후지산 — 일본 최고봉 (혼슈 중부)
      { name: '후지산', rect: [29000, 67000, 35000, 73000], stoneMult: 3.5 },
      // 다이세쓰 산 — 홋카이도
      { name: '다이세쓰 산맥', rect: [25000, 10000, 38000, 22000], stoneMult: 2.5 },
      // 키이 산지 — 긴키
      { name: '키이 산지', rect: [18000, 92000, 32000, 105000], stoneMult: 2.2 },
      // 큐슈 산지
      { name: '큐슈 산지', rect: [15000, 115000, 30000, 128000], stoneMult: 2.3 },
    ],
    ores: [
      // 사도 금광 — 일본 최대 금광 (니가타현 사도섬)
      { name: '사도 금광', center: [12000, 50000], radius: 600, oreType: 'gold' },
      // 별자 광산 — 아키타 (구리·은)
      { name: '아키타 은광', center: [30000, 38000], radius: 500, oreType: 'silver' },
      // 가미오카 — 기후 (납·아연)
      { name: '가미오카 광산', center: [28000, 70000], radius: 500, oreType: 'lead' },
      // 별자 — 시마네 (석탄·은)
      { name: '이와미 은광', center: [20000, 95000], radius: 450, oreType: 'silver' },
      // 베푸 — 규슈 유황
      { name: '베푸 유황', center: [22000, 120000], radius: 350, oreType: 'sulfur' },
    ],
  },

  // === 중원북 (중국 북부) — 100000 × 130000 ===
  jungwon_n: {
    rivers: [
      // 황하 — 중국 北 — 청해→발해, 길고 S자
      { name: '황하', path: [
        { pos: [15000, 60000],  width: 400 },  // 청해 발원
        { pos: [25000, 50000],  width: 500 },
        { pos: [40000, 45000],  width: 600 },
        { pos: [55000, 60000],  width: 700 },  // 산서 굽이
        { pos: [70000, 75000],  width: 900 },  // 산둥
        { pos: [88000, 80000],  width: 1100 }, // 발해 하구
      ]},
      // 랴오허 — 동북 → 발해만
      { name: '랴오허', path: [
        { pos: [85000, 25000], width: 250 },
        { pos: [82000, 40000], width: 400 },
        { pos: [80000, 55000], width: 550 },
      ]},
      // 하이허 — 천진 부근
      { name: '하이허', path: [
        { pos: [70000, 70000], width: 200 },
        { pos: [80000, 73000], width: 350 },
        { pos: [88000, 76000], width: 500 },
      ]},
      // 송화강 — 동북 (헤이룽강 지류)
      { name: '송화강', path: [
        { pos: [80000, 8000],  width: 300 },
        { pos: [90000, 18000], width: 450 },
        { pos: [95000, 28000], width: 600 },
      ]},
    ],
    lakes: [
      // 칭하이호 — 중국 최대 내륙호 (염호)
      { name: '칭하이호', shape: 'ellipse',
        center: [15000, 65000], a: 2200, b: 1300, rotation: 0.1 },
      // 후룬호 — 내몽골
      { name: '후룬호', shape: 'ellipse',
        center: [65000, 12000], a: 800, b: 1500, rotation: 0.3 },
      // 보스텐호 — 신장
      { name: '보스텐호', shape: 'ellipse',
        center: [8000, 50000], a: 700, b: 350, rotation: 0 },
    ],
    forests: [
      // 다싱안링 — 동북 침엽수
      { name: '다싱안링', rect: [70000, 5000, 92000, 35000], densityMult: 2.6 },
      // 창바이산 — 동북 (백두산 중국쪽)
      { name: '창바이 숲', rect: [88000, 30000, 100000, 45000], densityMult: 2.4 },
      // 톈산 — 신장 북
      { name: '톈산 숲', rect: [3000, 35000, 18000, 50000], densityMult: 2.0 },
    ],
    mountains: [
      // 친링 — 중원 척추 (중·남 분기)
      { name: '친링 산맥', rect: [30000, 95000, 70000, 115000], stoneMult: 2.8 },
      // 타이항 산맥 — 화북 평원 서변
      { name: '타이항 산맥', rect: [55000, 55000, 70000, 90000], stoneMult: 2.5 },
      // 알타이 — 신장 북부
      { name: '알타이 산맥', rect: [3000, 8000, 22000, 25000], stoneMult: 3.0 },
      // 톈산 — 신장
      { name: '톈산', rect: [3000, 38000, 28000, 55000], stoneMult: 2.8 },
      // 옌산 — 베이징 북
      { name: '옌산', rect: [65000, 55000, 90000, 70000], stoneMult: 2.4 },
    ],
    ores: [
      // 산시(山西) 석탄 — 중국 최대 석탄지대
      { name: '산시 석탄', center: [55000, 75000], radius: 1500, oreType: 'coal' },
      // 산둥 철광
      { name: '산둥 철광', center: [80000, 80000], radius: 1000, oreType: 'iron' },
      // 안산 철광 — 동북
      { name: '안산 철광', center: [82000, 35000], radius: 900, oreType: 'iron' },
      // 백운 광산 — 내몽 희토류·철
      { name: '백운악박', center: [50000, 30000], radius: 800, oreType: 'iron' },
      // 자위관 철광 — 감숙
      { name: '자위관 철광', center: [22000, 55000], radius: 700, oreType: 'iron' },
      // 더싱 구리 — 강서
      { name: '쟈오자완 구리', center: [70000, 100000], radius: 600, oreType: 'copper' },
    ],
  },

  // === 중원남 (중국 남부) — 100000 × 60000 ===
  jungwon_s: {
    rivers: [
      // 양쯔강 — 중국 최대 강 (서→동)
      { name: '양쯔강', path: [
        { pos: [5000, 25000],  width: 600 },   // 청장고원
        { pos: [25000, 28000], width: 800 },
        { pos: [50000, 30000], width: 1100 },  // 무한
        { pos: [75000, 33000], width: 1400 },
        { pos: [95000, 35000], width: 1800 },  // 상해 하구
      ]},
      // 주강(西江) — 중남부 → 광저우
      { name: '주강', path: [
        { pos: [15000, 50000], width: 300 },
        { pos: [40000, 52000], width: 500 },
        { pos: [70000, 53000], width: 700 },
        { pos: [88000, 55000], width: 900 },
      ]},
      // 민강 — 푸졘
      { name: '민강', path: [
        { pos: [80000, 42000], width: 150 },
        { pos: [90000, 48000], width: 280 },
      ]},
      // 한수이 — 양쯔 지류 (북상)
      { name: '한수이', path: [
        { pos: [45000, 15000], width: 250 },
        { pos: [48000, 22000], width: 380 },
        { pos: [50000, 28000], width: 500 },   // 양쯔 합류
      ]},
    ],
    lakes: [
      // 둥팅호 — 후난 (호수 이름의 정수)
      { name: '둥팅호', shape: 'ellipse',
        center: [50000, 40000], a: 1500, b: 900, rotation: 0.1 },
      // 포양호 — 강서 (양쯔강과 연결)
      { name: '포양호', shape: 'ellipse',
        center: [68000, 38000], a: 1300, b: 1800, rotation: -0.2 },
      // 타이호 — 강소·절강 경계 (상하이 근처)
      { name: '타이호', shape: 'circle', center: [85000, 32000], radius: 1000 },
      // 댄장호 — 후베이 (인공이지만 큼)
      { name: '댄장호', shape: 'ellipse',
        center: [42000, 27000], a: 800, b: 500, rotation: 0.4 },
    ],
    forests: [
      // 사천 죽림 — 판다
      { name: '사천 죽림', rect: [25000, 15000, 42000, 38000], densityMult: 2.5 },
      // 운남 열대림
      { name: '시솽반나', rect: [10000, 45000, 35000, 58000], densityMult: 2.8 },
      // 무이산 — 푸졘 차밭
      { name: '무이산', rect: [70000, 40000, 88000, 52000], densityMult: 2.4 },
      // 황산 — 안후이 (절경)
      { name: '황산', rect: [62000, 30000, 72000, 38000], densityMult: 2.2 },
    ],
    mountains: [
      // 칭짱(청장)고원 — 서부 (티베트 동단)
      { name: '청장 동단', rect: [3000, 12000, 22000, 35000], stoneMult: 3.2 },
      // 친링 남단 — 다바산
      { name: '다바산', rect: [25000, 18000, 50000, 30000], stoneMult: 2.7 },
      // 무이산 산맥
      { name: '무이산 산맥', rect: [70000, 38000, 92000, 50000], stoneMult: 2.5 },
      // 횡단산맥 — 운남
      { name: '횡단산맥', rect: [10000, 35000, 30000, 55000], stoneMult: 2.9 },
    ],
    ores: [
      // 운남 주석 — 세계 최대 주석 산지
      { name: '거주(개구) 주석', center: [18000, 50000], radius: 900, oreType: 'tin' },
      // 후난 안티몬·납·아연
      { name: '시쾅산 안티몬', center: [50000, 42000], radius: 700, oreType: 'lead' },
      // 강서 텅스텐
      { name: '간저우 텅스텐', center: [70000, 45000], radius: 600, oreType: 'iron' },
      // 사천 구리
      { name: '사천 구리', center: [25000, 22000], radius: 700, oreType: 'copper' },
      // 호북 인광
      { name: '이창 인광', center: [42000, 30000], radius: 500, oreType: 'iron' },
    ],
  },

  // === 유로파 (유럽) — 90000 × 130000 ===
  europa: {
    rivers: [
      // 라인강 — 중부 (서→북)
      { name: '라인강', path: [
        { pos: [40000, 75000], width: 200 },  // 알프스 발원
        { pos: [38000, 65000], width: 300 },
        { pos: [35000, 55000], width: 400 },
        { pos: [33000, 45000], width: 550 },
        { pos: [30000, 35000], width: 700 },  // 북해 하구
      ]},
      // 다뉴브강 — 흑해 방향 (서→동, 두번째로 긴 유럽 강)
      { name: '다뉴브강', path: [
        { pos: [40000, 78000], width: 200 },
        { pos: [50000, 80000], width: 350 },
        { pos: [60000, 82000], width: 500 },
        { pos: [72000, 80000], width: 700 },
        { pos: [85000, 78000], width: 900 },  // 흑해 하구
      ]},
      // 볼가강 — 동유럽 (북→남, 카스피해)
      { name: '볼가강', path: [
        { pos: [80000, 35000], width: 300 },
        { pos: [82000, 55000], width: 500 },
        { pos: [85000, 75000], width: 700 },
        { pos: [88000, 95000], width: 900 },  // 카스피해
      ]},
      // 엘베강 — 중유럽 북
      { name: '엘베강', path: [
        { pos: [50000, 55000], width: 200 },
        { pos: [45000, 45000], width: 320 },
        { pos: [40000, 38000], width: 450 },  // 북해
      ]},
      // 세느강 — 프랑스 (파리)
      { name: '세느강', path: [
        { pos: [30000, 70000], width: 150 },
        { pos: [22000, 62000], width: 250 },
        { pos: [15000, 55000], width: 380 },  // 영불해협
      ]},
      // 포강 — 이탈리아 북부
      { name: '포강', path: [
        { pos: [38000, 90000], width: 200 },
        { pos: [50000, 88000], width: 350 },
        { pos: [60000, 86000], width: 500 },  // 아드리아
      ]},
      // 비스툴라강 — 폴란드
      { name: '비스툴라', path: [
        { pos: [60000, 65000], width: 200 },
        { pos: [58000, 55000], width: 320 },
        { pos: [56000, 45000], width: 440 },  // 발트해
      ]},
    ],
    lakes: [
      // 라도가호 — 러시아 (유럽 최대)
      { name: '라도가호', shape: 'ellipse',
        center: [80000, 20000], a: 2200, b: 1500, rotation: 0.1 },
      // 제네바호 — 스위스·프랑스
      { name: '제네바호', shape: 'ellipse',
        center: [38000, 80000], a: 800, b: 400, rotation: 0.3 },
      // 콘스탄스호 — 알프스
      { name: '콘스탄스호', shape: 'ellipse',
        center: [42000, 78000], a: 700, b: 400, rotation: 0.5 },
      // 바이칼호 (서쪽 끝) — 유럽 X지만 유라시아 경계용
      // 발라톤호 — 헝가리
      { name: '발라톤호', shape: 'ellipse',
        center: [55000, 82000], a: 900, b: 400, rotation: 0.6 },
      // 빅테른호 — 스웨덴
      { name: '빅테른호', shape: 'ellipse',
        center: [48000, 25000], a: 600, b: 1100, rotation: 0 },
    ],
    forests: [
      // 흑림 — 독일 남부
      { name: '흑림', rect: [35000, 60000, 45000, 72000], densityMult: 2.6 },
      // 비아워비에자 원시림 — 폴란드·벨라루스
      { name: '비아워비에자', rect: [60000, 50000, 72000, 62000], densityMult: 2.8 },
      // 카르파티아 숲
      { name: '카르파티아 숲', rect: [55000, 68000, 75000, 82000], densityMult: 2.4 },
      // 핀란드 침엽수
      { name: '핀란드 숲', rect: [62000, 8000, 80000, 32000], densityMult: 2.5 },
      // 스코틀랜드 하이랜드
      { name: '하이랜드 숲', rect: [10000, 35000, 22000, 50000], densityMult: 2.0 },
    ],
    mountains: [
      // 알프스 — 유럽 중심 산맥
      { name: '알프스', rect: [35000, 75000, 58000, 90000], stoneMult: 3.2 },
      // 피레네 — 프랑스·스페인 경계
      { name: '피레네', rect: [15000, 88000, 30000, 98000], stoneMult: 2.8 },
      // 카르파티아
      { name: '카르파티아', rect: [55000, 65000, 75000, 80000], stoneMult: 2.5 },
      // 발칸 산맥
      { name: '발칸', rect: [60000, 85000, 78000, 100000], stoneMult: 2.4 },
      // 아펜니노 — 이탈리아 척추
      { name: '아펜니노', rect: [42000, 92000, 55000, 115000], stoneMult: 2.3 },
      // 스칸디나비아
      { name: '스칸디나비아 산맥', rect: [42000, 5000, 58000, 32000], stoneMult: 2.7 },
      // 우랄 — 동변 (유럽·아시아 경계)
      { name: '우랄', rect: [80000, 30000, 88000, 90000], stoneMult: 2.6 },
    ],
    ores: [
      // 잉글랜드 석탄 — 산업혁명 토대
      { name: '뉴캐슬 석탄', center: [22000, 50000], radius: 700, oreType: 'coal' },
      // 루르 석탄·철 — 독일
      { name: '루르 광산', center: [33000, 52000], radius: 800, oreType: 'coal' },
      // 실레지아 석탄 — 폴란드
      { name: '실레지아', center: [58000, 60000], radius: 700, oreType: 'coal' },
      // 키루나 철광 — 스웨덴 라플란드 (세계 최대급 자철광)
      { name: '키루나 철광', center: [55000, 12000], radius: 800, oreType: 'iron' },
      // 코르넬리아 주석 — 영국 콘월
      { name: '코르넬리아 주석', center: [15000, 55000], radius: 500, oreType: 'tin' },
      // 만스펠트 구리 — 독일 (중세 함부르크급)
      { name: '만스펠트 구리', center: [45000, 50000], radius: 500, oreType: 'copper' },
      // 라우리움 은 — 그리스 (고대 아테네 부)
      { name: '라우리움 은광', center: [65000, 105000], radius: 400, oreType: 'silver' },
      // 알마덴 수은 — 스페인
      { name: '알마덴', center: [18000, 95000], radius: 400, oreType: 'mercury' },
    ],
  },

  // === 사하르 (북아프리카) — 90000 × 60000 ===
  //   사막 위주 — 물 적음, 광맥 풍부 (이집트·모리타니 등)
  sahar: {
    rivers: [
      // 나일강 — 동부 세로 (수단→이집트, 가장 긴 강)
      { name: '나일강', path: [
        { pos: [80000, 55000], width: 250 },  // 수단
        { pos: [78000, 40000], width: 350 },  // 누비아
        { pos: [76000, 25000], width: 500 },  // 룩소르
        { pos: [74000, 12000], width: 700 },
        { pos: [72000, 3000],  width: 900 },  // 카이로 델타
      ]},
      // 니제르강 — 서아프리카 (반원)
      { name: '니제르강', path: [
        { pos: [22000, 40000], width: 200 },
        { pos: [28000, 48000], width: 350 },
        { pos: [40000, 52000], width: 500 },
        { pos: [50000, 50000], width: 600 },
      ]},
      // 세네갈강 — 서변
      { name: '세네갈강', path: [
        { pos: [15000, 38000], width: 200 },
        { pos: [8000, 35000],  width: 350 },
      ]},
    ],
    lakes: [
      // 차드호 — 사하라 남 (계절성, 면적 큼)
      { name: '차드호', shape: 'multi', circles: [
        { center: [45000, 48000], radius: 1100 },
        { center: [47000, 50000], radius: 700 },
      ]},
      // 나세르 호수 — 아스완댐 (이집트 남)
      { name: '나세르호', shape: 'ellipse',
        center: [78000, 32000], a: 400, b: 1800, rotation: 0.1 },
    ],
    forests: [
      // 카빌리아 — 알제리 북 (지중해 침엽수)
      { name: '카빌리아 숲', rect: [35000, 5000, 50000, 12000], densityMult: 1.8 },
      // 사헬 사바나 (남부 가장자리)
      { name: '사헬 관목림', rect: [10000, 45000, 70000, 55000], densityMult: 1.5 },
    ],
    mountains: [
      // 아틀라스 산맥 — 북서 (모로코·알제리)
      { name: '아틀라스', rect: [12000, 5000, 40000, 18000], stoneMult: 2.8 },
      // 티베스티 — 중부 (차드)
      { name: '티베스티', rect: [50000, 22000, 62000, 35000], stoneMult: 3.0 },
      // 아하가르 산지 — 알제리 남
      { name: '아하가르', rect: [25000, 22000, 38000, 35000], stoneMult: 2.7 },
      // 다르푸르 산지
      { name: '다르푸르', rect: [60000, 35000, 72000, 48000], stoneMult: 2.3 },
    ],
    ores: [
      // 모리타니 철광 — 세계급
      { name: '즈웨라트 철광', center: [10000, 25000], radius: 900, oreType: 'iron' },
      // 카탕가·잠비아 구리 (실은 남부지만 차드 인근으로)
      // 시나이 구리 — 이집트 (고대 채광)
      { name: '시나이 구리', center: [80000, 12000], radius: 500, oreType: 'copper' },
      // 누비아 금광 — 수단·이집트 (고대)
      { name: '누비아 금광', center: [78000, 38000], radius: 700, oreType: 'gold' },
      // 와디 함마마트 금광
      { name: '함마마트 금광', center: [80000, 22000], radius: 500, oreType: 'gold' },
      // 가나 (옛 황금해안) — 서변
      { name: '아샨티 금광', center: [25000, 55000], radius: 600, oreType: 'gold' },
      // 사하라 소금 — 타가자
      { name: '타가자 소금', center: [22000, 32000], radius: 500, oreType: 'salt' },
    ],
  },

  // === 힌드강 (인도) — 60000 × 60000 ===
  hindgang: {
    rivers: [
      // 갠지스강 — 북부 인도 (히말→벵골만)
      { name: '갠지스강', path: [
        { pos: [22000, 10000], width: 250 },  // 히말 발원
        { pos: [32000, 14000], width: 400 },
        { pos: [42000, 18000], width: 600 },
        { pos: [52000, 22000], width: 800 },
        { pos: [58000, 28000], width: 1000 }, // 벵골만
      ]},
      // 인더스강 — 북서 (파키스탄, 게임 zone 서변)
      { name: '인더스강', path: [
        { pos: [15000, 8000],  width: 250 },  // 카라코람
        { pos: [10000, 18000], width: 400 },
        { pos: [5000, 30000],  width: 550 },
        { pos: [3000, 45000],  width: 700 },  // 아라비아해
      ]},
      // 브라마푸트라 — 동북 (아삼)
      { name: '브라마푸트라', path: [
        { pos: [42000, 5000],  width: 300 },
        { pos: [48000, 12000], width: 500 },
        { pos: [55000, 22000], width: 700 },  // 갠지스 합류
      ]},
      // 고다바리 — 중부 인도
      { name: '고다바리', path: [
        { pos: [15000, 38000], width: 200 },
        { pos: [30000, 42000], width: 350 },
        { pos: [45000, 45000], width: 500 },  // 벵골만
      ]},
      // 크리슈나 — 남부
      { name: '크리슈나', path: [
        { pos: [12000, 45000], width: 200 },
        { pos: [28000, 48000], width: 350 },
        { pos: [42000, 50000], width: 500 },
      ]},
    ],
    lakes: [
      // 풀리캇 — 남부 동해안
      { name: '풀리캇 호수', shape: 'ellipse',
        center: [38000, 52000], a: 500, b: 1000, rotation: 0 },
      // 치카 — 동해안 (인도 최대)
      { name: '치카 호수', shape: 'ellipse',
        center: [48000, 36000], a: 800, b: 400, rotation: 0.2 },
      // 데드 — 라자스탄 (사막 호수)
      { name: '삼바르호', shape: 'ellipse',
        center: [12000, 22000], a: 600, b: 300, rotation: 0.1 },
    ],
    forests: [
      // 순다르반스 — 갠지스 델타 (망그로브)
      { name: '순다르반스', rect: [52000, 25000, 60000, 35000], densityMult: 2.6 },
      // 서고츠 (서남) 열대우림
      { name: '서고츠 우림', rect: [8000, 42000, 18000, 58000], densityMult: 2.5 },
      // 동고츠 일대 — 중부 동변
      { name: '동고츠 숲', rect: [40000, 32000, 50000, 50000], densityMult: 2.2 },
      // 사트푸라 숲
      { name: '사트푸라 숲', rect: [20000, 28000, 35000, 38000], densityMult: 2.0 },
    ],
    mountains: [
      // 히말라야 — 북부 (게임 zone 북변)
      { name: '히말라야', rect: [10000, 3000, 50000, 12000], stoneMult: 3.5 },
      // 카라코람
      { name: '카라코람', rect: [10000, 3000, 22000, 10000], stoneMult: 3.3 },
      // 서고츠 — 서부 산맥
      { name: '서고츠', rect: [5000, 35000, 18000, 58000], stoneMult: 2.6 },
      // 동고츠
      { name: '동고츠', rect: [38000, 35000, 50000, 55000], stoneMult: 2.4 },
      // 빈디아 — 중부 가로
      { name: '빈디아 산맥', rect: [20000, 25000, 40000, 32000], stoneMult: 2.3 },
      // 아라발리 — 라자스탄
      { name: '아라발리', rect: [10000, 18000, 22000, 30000], stoneMult: 2.2 },
    ],
    ores: [
      // 자르칸드·오디샤 — 인도 철광 80%
      { name: '자르칸드 철광', center: [42000, 25000], radius: 1000, oreType: 'iron' },
      { name: '오디샤 철광', center: [45000, 32000], radius: 900, oreType: 'iron' },
      // 라자스탄 구리·납·아연
      { name: '쿠다 구리', center: [15000, 20000], radius: 600, oreType: 'copper' },
      { name: '잠바리아 납', center: [18000, 25000], radius: 500, oreType: 'lead' },
      // 카르나타카 금광 (콜라르)
      { name: '콜라르 금광', center: [25000, 48000], radius: 600, oreType: 'gold' },
      // 안드라 다이아몬드 — 골콘다 (실제 인도 다이아 발원지)
      { name: '골콘다 다이아', center: [35000, 42000], radius: 500, oreType: 'gold' },
      // 케랄라 모나자이트 사질 — 단순 철로
      { name: '케랄라 사철', center: [15000, 55000], radius: 400, oreType: 'iron' },
    ],
  },
};

// === helpers ===
function _pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { dist: Math.hypot(px - x1, py - y1), t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx, projY = y1 + t * dy;
  return { dist: Math.hypot(px - projX, py - projY), t };
}

function _isPointInLake(x, y, lake) {
  if (lake.shape === 'multi') {
    for (const c of lake.circles) {
      const dx = x - c.center[0], dy = y - c.center[1];
      if (dx * dx + dy * dy < c.radius * c.radius) return true;
    }
    return false;
  }
  if (lake.shape === 'ellipse') {
    const cx = lake.center[0], cy = lake.center[1];
    const rot = lake.rotation || 0;
    const dx = x - cx, dy = y - cy;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    return (lx * lx) / (lake.a * lake.a) + (ly * ly) / (lake.b * lake.b) < 1;
  }
  // default: circle
  const dx = x - lake.center[0], dy = y - lake.center[1];
  return dx * dx + dy * dy < lake.radius * lake.radius;
}

function _isPointInRiver(x, y, river) {
  if (!river.path || river.path.length < 2) return false;
  for (let i = 0; i < river.path.length - 1; i++) {
    const p1 = river.path[i], p2 = river.path[i + 1];
    // 새 format {pos, width} 또는 옛 format [x, y]
    const x1 = p1.pos ? p1.pos[0] : p1[0];
    const y1 = p1.pos ? p1.pos[1] : p1[1];
    const x2 = p2.pos ? p2.pos[0] : p2[0];
    const y2 = p2.pos ? p2.pos[1] : p2[1];
    const w1 = (p1.width != null) ? p1.width : (river.width || 200);
    const w2 = (p2.width != null) ? p2.width : (river.width || 200);
    const r = _pointToSegmentDist(x, y, x1, y1, x2, y2);
    const halfWidth = (w1 + (w2 - w1) * r.t) / 2;  // 폭 보간
    if (r.dist < halfWidth) return true;
  }
  return false;
}

function isWaterCellLocal(zoneId, localX, localY) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t) return false;
  for (const lake of t.lakes || []) {
    if (_isPointInLake(localX, localY, lake)) return true;
  }
  for (const river of t.rivers || []) {
    if (_isPointInRiver(localX, localY, river)) return true;
  }
  return false;
}

function getTerrainWaterTilesForChunk(zoneId, cx, cy, chunkSize) {
  const tiles = new Set();
  const t = ZONE_TERRAIN[zoneId];
  if (!t) return tiles;
  const CELL = 32;
  const tilesPerChunk = Math.ceil(chunkSize / CELL);
  const startTx = cx * tilesPerChunk;
  const startTy = cy * tilesPerChunk;
  for (let dy = 0; dy < tilesPerChunk; dy++) {
    for (let dx = 0; dx < tilesPerChunk; dx++) {
      const tx = startTx + dx, ty = startTy + dy;
      const cellX = tx * CELL + CELL / 2;
      const cellY = ty * CELL + CELL / 2;
      if (isWaterCellLocal(zoneId, cellX, cellY)) {
        tiles.add(`${tx}_${ty}`);
      }
    }
  }
  return tiles;
}

function getForestMultiplier(zoneId, x, y) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t || !t.forests) return 1.0;
  let m = 1.0;
  for (const f of t.forests) {
    const [x1, y1, x2, y2] = f.rect;
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2 && f.densityMult > m) m = f.densityMult;
  }
  return m;
}

function getStoneMultiplier(zoneId, x, y) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t || !t.mountains) return 1.0;
  let m = 1.0;
  for (const mt of t.mountains) {
    const [x1, y1, x2, y2] = mt.rect;
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2 && mt.stoneMult > m) m = mt.stoneMult;
  }
  return m;
}

function isOreClusterAt(zoneId, x, y) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t || !t.ores) return null;
  for (const o of t.ores) {
    const dx = x - o.center[0];
    const dy = y - o.center[1];
    if (dx * dx + dy * dy < o.radius * o.radius) return o;
  }
  return null;
}

// === 미니맵용 — cell 종류 결정 ===
// 우선순위: water > ore > mountain > forest > plain
function getTileType(zoneId, x, y) {
  if (isWaterCellLocal(zoneId, x, y)) return 'water';
  if (isOreClusterAt(zoneId, x, y)) return 'ore';
  if (getStoneMultiplier(zoneId, x, y) > 1.5) return 'mountain';
  if (getForestMultiplier(zoneId, x, y) > 1.5) return 'forest';
  return 'plain';
}

// Dual export — server (CommonJS) + browser (window)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZONE_TERRAIN,
    isWaterCellLocal,
    getTerrainWaterTilesForChunk,
    getForestMultiplier,
    getStoneMultiplier,
    isOreClusterAt,
    getTileType,
  };
}
if (typeof window !== 'undefined') {
  window.Terrain = {
    ZONE_TERRAIN,
    isWaterCellLocal,
    getTerrainWaterTilesForChunk,
    getForestMultiplier,
    getStoneMultiplier,
    isOreClusterAt,
    getTileType,
  };
}
