// 클라이언트 — 아이소메트릭 렌더링 + 다중 존 동시 구독 + 끊김 없는 핸드오프
// 핵심: 절대 월드 좌표를 사용해서 존 경계를 시각적으로 안 보이게.
//      현재 존에 primary 연결, 인접 존에는 observer 연결로 미리 보기.
// === CLIENT BUILD: Phase 5-G (한반도 강·호수 hardcoded + observer storm fix) ===
console.log('%c[durango-mini] client build = Phase 5-K26 (길드 영토 셀 집합 렌더 — 격자 단위)', 'color:#5a9ae0;font-weight:bold;font-size:14px');

// Phase 4d-16-c: facility 종류별 emoji
const FACILITY_EMOJI = {
  house: '🏠',
  farmland: '🌾',  // default — farmStage 있으면 override
  forge: '🔥',
  hide_rack: '🟫',
  workshop: '⚒️',
  kitchen: '🍲',
  training: '⚔️',
  cart: '🛒',
};
// Phase 4d-16-d: farmland stage별 emoji (0=씨, 1=어린싹, 2=자람, 3=익음)
const FARM_STAGE_EMOJI = ['🟫', '🌱', '🌿', '🌾'];   // 스프라이트 미로드 시 폴백
// === 에셋 5차: 작물 밭 4단계 스프라이트(Blender crop_render.py — 자연물·아이콘과 동일 씬) ===
//   곡물(grain)·채소(veg) 2계열 × 4단계(갈은 흙/어린싹/자람/익음). 계열은 셀 좌표 해시로 고정(프레임마다 안 바뀜).
//   30종 개별 구분은 하지 않음 — 32px에서 판독 불가라 의도적으로 2계열까지만.
const CROP_SPR = { grain: [], veg: [] };
let _cropSprLoaded = 0;
(function preloadCropSprites() {
  if (typeof Image !== 'function') return;
  for (const ser of ['grain', 'veg']) for (let i = 0; i < 4; i++) {
    const im = new Image();
    im.onload = () => { _cropSprLoaded++; };
    im.src = '/assets/crops/' + ser + '_' + i + '.png';
    CROP_SPR[ser][i] = im;
  }
})();
function cropSprite(stage, wx, wy) {
  const st = Math.max(0, Math.min(3, stage | 0));
  const h = Math.abs(((wx | 0) * 73856093) ^ ((wy | 0) * 19349663));
  const im = CROP_SPR[(h % 2) ? 'veg' : 'grain'][st];
  return (im && im.complete && im.naturalWidth > 0) ? im : null;
}
// §4-4 Stage 4A: 마을 시뮬 NPC 직업(p.simJob — economy-sim JOBS 12종) → 이름 옆 이모지
const SIM_JOB_EMOJI = {
  farmer: '🌾', fisher: '🎣', hunter: '🏹', lumberjack: '🪓', miner: '⛏️',
  smith: '🔨', weaponsmith: '⚔️', armorsmith: '🛡️', forager: '🧺',
  cook: '🍲', warrior: '💂', merchant: '💰',
  caravan: '🐂', // §4-4 Stage 4B: 캐러밴 실체 상인 — 이름에 화물('상단·<자원>') 포함, 마을 사이 실제 도보 이동
  bandit: '🏴', // §11 2파: 소굴 배회 도적 실체(연출 전용 — 경제 효과는 econ 주사위 소유)
};

(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let W = canvas.width, H = canvas.height;
  // Phase 14.19: 전체화면 — viewport 가득. resize 시 동적 재조정.
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    W = canvas.width; H = canvas.height;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // === 아이소메트릭 투영 (2:1 다이아몬드) — 2.5D ===
  // worldX,worldY (픽셀) → 화면상 iso 픽셀. z(높이)는 화면 y에서 빼서 위로 올림.
  // (1,0,0) → (1, 0.5), (0,1,0) → (-1, 0.5), (0,0,1) → (0, -1) 형태.
  // 모든 호출자는 z=0 기본 — Phase 13.2에서 건물/계단에 z>0 도입.
  const FLOOR_HEIGHT = 64; // 14.49-e2: 32 → 64 (한 층 2배)
  function w2i(wx, wy, wz = 0) {
    return { x: (wx - wy), y: (wx + wy) * 0.5 - wz };
  }

  // === 상태 ===
  let zonesMeta = {};
  // Phase 5-2-mini: 미니맵 IIFE에서 access 가능하게 노출
  window.__getZonesMeta = () => zonesMeta;
  let marketplaceUrl = '';
  let myName = '여행자';
  let myUsername = '';
  // ★★[2026-08-03f 배치 13] **내 영속 신원.** 서버가 welcome 으로 알려 준다(등록 계정이면 username,
  //   게스트면 `anon_<고정 접미사>`). 종전엔 클라가 제 playerId 를 몰라서 소유 표시를 `myUsername`
  //   과 대조했고, 게스트는 그게 빈 문자열이라 **제 사유지도 남의 것으로 보였다.**
  let myPlayerId = '';
  // ★게스트 영속 신원 토큰 — localStorage 에만 산다. **화면·알림·로그 어디에도 그리지 않는다**
  //   (토큰 유출 = 계정 탈취). 값 자체를 UI 로 흘리는 코드가 생기면 그게 곧 결함이다.
  const GUEST_TOKEN_KEY = 'durango_guest_token';
  let myGuestToken = '';
  let myHp = 100, myMaxHp = 100; // 로그인 시 username (= server의 player_id). 게스트면 ''
  let myPassword = ''; // 로그인 시 password
  let myColor = '#f0c674';
  let myAbsPos = { x: 0, y: 0 };
  let myAbsPredicted = { x: 0, y: 0 };
  // Phase 5-2-mini: 미니맵에서 access
  window.__getMyAbs = () => myAbsPredicted;
  // ★[10차 T4] 장마당 진단 훅 — 클라가 서버 markets 플래그를 실제로 받았는지 확인용(읽기 전용, 기존 __get* 관례).
  window.__getMarkets = () => { const out = {}; for (const [zid, c] of conns) out[zid] = (c && c.markets) ? c.markets.slice() : null; return out; };
  // ★[11차 T3] 환호 진단 훅 — 클라가 도랑 페이로드를 받아 미러(_ditchAbs)에 실었는지(읽기 전용).
  window.__getDitches = () => { let recv = 0; for (const [, c] of conns) recv += (c && c.ditches) ? c.ditches.size : 0; return { recv, mirror: _ditchAbs.size }; };
  // ★[2026-08-03e 배치 12] 건립 E2E 진단 훅 — 클라가 받은 건물·사유지를 **월드 절대좌표**로(읽기 전용).
  //   `__getAllWalls` 와 같은 관례. 실클라 E2E 가 "회관이 실제로 완공됐는가"를 화면 상태로 확인한다.
  window.__getAllBuildings = () => {
    const out = [];
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const b of c.buildings.values()) out.push({ id: b.id, type: b.type, wx: ox + b.x, wy: oy + b.y, stage: (b.data && b.data.stage) | 0 });
    }
    return out;
  };
  // ★[2026-08-04c 배치 17 ②] 낚시터 방황 진단 훅 — 클라가 **화면에 그리는 바로 그 좌표**를 월드 절대좌표로
  //   (읽기 전용). 서버 /lifedbg 와 달리 "플레이어 눈에 보이는 것"을 재는 층이라, 수리 전/후 실화면 비교의
  //   계측기가 된다. 좌표는 보간 전 권위값(c.others 의 x·y) — 렌더러가 쓰는 원본과 같다(사본 금지).
  window.__getNpcs = () => {
    const out = [];
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const p of c.others.values()) if (p.simJob) out.push({ pid: p.pid, wx: ox + p.x, wy: oy + p.y, job: p.simJob, act: p.act || null });
    }
    return out;
  };
  window.__getClaims = () => {
    const out = [];
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const cl of (c.claims ? c.claims.values() : [])) out.push({ id: cl.id, kind: cl.kind, wx: ox + cl.x, wy: oy + cl.y, w: cl.w, h: cl.h });
    }
    return out;
  };
  // Phase 5-G debug: 미니맵에서 wall 위치 검증용
  window.__getAllWalls = () => {
    const walls = [];
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const b of c.buildings.values()) {
        if (b.type !== 'wall') continue;
        walls.push({ wx: ox + b.x, wy: oy + b.y, side: b.data?.side || 'N' });
      }
    }
    return walls;
  };
  let primaryZoneId = null;
  let myPid = null;
  // Phase 4d-3: 캐나디아 캐러밴 (행상) 시각화 cache
  let _canadiaCaravans = [];
  // Phase 4d-4: 캐나디아 마을 데이터 (작업장 시각화용) — { name, coord, jobs }
  let _canadiaVillages = [];
  // 직업별 작업장 offset — server JOB_WORK_OFFSET과 동기화
  const CANADIA_JOB = {
    farmer:     { angle: 0,                  dist: 280, emoji: '🌾', color: '#7a5a30', label: '농지' },
    fisher:     { angle: Math.PI * 0.5,      dist: 280, emoji: '🐟', color: '#3a6a90', label: '낚시터' },
    hunter:     { angle: Math.PI,            dist: 280, emoji: '🏹', color: '#4a6030', label: '사냥터' },
    forager:    { angle: Math.PI * 1.5,      dist: 280, emoji: '🌿', color: '#5a8038', label: '채집장' },
    lumberjack: { angle: Math.PI * 0.25,     dist: 280, emoji: '🪵', color: '#5a3a1c', label: '벌목장' },
    miner:      { angle: Math.PI * 0.75,     dist: 280, emoji: '⛏️', color: '#5a5a5a', label: '광산' },
    prospector: { angle: Math.PI * 1.25,     dist: 280, emoji: '🔍', color: '#7a7a78', label: '광맥' },
    smith:      { angle: Math.PI * 1.75,     dist: 100, emoji: '⚒️', color: '#a04020', label: '대장간' },
    cook:       { angle: Math.PI * 0.125,    dist: 100, emoji: '🍳', color: '#c04040', label: '주방' },
    // merchant는 거래소 자체에 머무름 — 별도 patch 안 그림 (skip)
    warrior:    { angle: Math.PI * 1.625,    dist: 100, emoji: '⚔️', color: '#703040', label: '훈련장' },
  };
  let inventory = { wood: 0, stone: 0 };
  let tools = {};     // 14.52 옛 호환 (사용 X)
  // 14.53: 도구 instance 리스트 + equipped는 toolItemId + hotkey1 슬롯
  let toolItems = [];   // [{id, type, d, max}]
  let equipped = null;  // toolItemId (null = 맨손)
  let hotkey1 = null;   // 1번 슬롯 toolItemId
  // 14.53 helpers
  function findToolInstance(id) {
    return toolItems.find(t => t.id === id) || null;
  }
  function hasToolTypeAlive(type) {
    return toolItems.some(t => t.type === type && t.d > 0);
  }
  function getEquippedInstance() {
    return equipped ? findToolInstance(equipped) : null;
  }
  // 옛 API 호환 (renderCraftPanel 등 옛 코드용)
  function hasToolAlive(name) { return hasToolTypeAlive(name); }
  function toolDurStr(name) {
    // type 이름일 수도, instance id일 수도
    let inst = findToolInstance(name);
    if (!inst) inst = toolItems.find(t => t.type === name && t.d > 0);
    if (!inst) return '';
    return `${inst.d}/${inst.max}`;
  }
  let recipes = {};   // 서버에서 받은 도구 레시피
  let itemRecipes = {}; // 14.50: 아이템 가공 레시피 (plank 등)
  let buildingRecipes = {}; // 14.51: 건축물 제작 레시피 (제작창에서 만들면 인벤 아이템)
  let cookRecipes = {}; // 서버에서 받은 요리 레시피
  let foodEffects = {}; // 서버에서 받은 음식 효과 정보 (표시용)
  // 플레이어 장비(품질·속성·내구 인스턴스) — econ 무접촉·본체 서버층
  let equipmentRecipes = {}, equipmentMeta = null; // 장비 제작 레시피·미리보기 메타(서버 공식 단일진실)
  let equipment = [], equipSlots = {}, craftSkill = {}; // 장비 인스턴스·장착 슬롯·제작 숙련 xp
  let craftEquipSel = {}; // UI: 유형별 선택 재료 {clothes:'hide',...}
  // ★주조(합금) UI — 유형별 배합 가중치 {weapon:{copper:83,tin:17}}, 켬/끔, 서버 미리보기 캐시.
  //   합금 물성은 **서버(server/specialty.js)가 단독 계산**한다. 클라에 복제하지 않는다 —
  //   복제본은 반드시 어긋나고, 어긋나면 미리보기와 실제 제작품이 달라진다.
  let castMix = {}, castOn = {}, castPv = {};
  let dishes = []; // 요리 인스턴스(신선도·버프) — [{id,label,q,nutrition,buff,freshness}]
  let shopVillage = null; // 거래: 가까운 마을 품질 EMA(shop_info 응답)
  let myHunger = 100, myThirst = 100, myVp = 0;
  let myCold = false; // 밤 추위(방한 부족) — HUD 표시
  const VP_THRESHOLD = 50; // 클라 표시용 — 서버와 동일해야 함
  let myTribeId = null, myTribeName = null;
  let myPvpEnabled = false;
  let myBuildFloor = 0; // 2.5D — 현재 건축 층 (Z=위, X=아래)
  let myFloor = 0;      // 캐릭터가 현재 있는 층 (계단으로 이동)
  let myStairZ = 0;     // 14.49-c: 계단 위 z 보간 (서버 발 z, 0~32)
  // Phase 14.30: 건축 placement mode
  // 14.51: placementMode = { itemType, floor, dir } — itemType 'item_wall' 등 (제작창에서 만든 아이템).
  //        옛 호환: { type, floor } — 직접 빌드용 (deprecated). itemType이 있으면 place_building 송신.
  let placementMode = null;
  let placementCursor = { wx: 0, wy: 0 }; // 마우스 따라가는 abs 좌표
  // 14.51: 건축 모드 (B 토글)
  let buildMode = false;
  // 14.51: placement 회전 (wall/door = N/E, fence = NS/EW, stair = N/E/S/W)
  let placingDir = 'N';
  // 14.51: 진행 중 작업 (3초). { kind:'place'|'dismantle', startedAt, durationMs, payload }
  let buildAction = null;
  // 14.51 + 14.53-g: 건축 모드 hover (분해 대상 건축물). cell에 여러 개면 휠로 cycle.
  let hoverBuildingId = null;
  let hoverList = [];        // 마우스 근처 building id list (가까운 순)
  let hoverIndex = 0;        // hoverList 안 현재 선택 index
  let lastMouseSx = 0, lastMouseSy = 0; // 캔버스 좌표 (px)
  let myLastAttackAt = 0; // Phase 14.35: 공격 모션
  let myFacingVx = 1, myFacingVy = 0; // Phase 14.37: 본인 마지막 facing (기본 동쪽)
  // Phase 14.40: Shift 달리기
  let mySprint = false;
  // ★유령 클라 fix: 서버에 내 플레이어 실체가 없는 구간(사망 제거·orphan 판정·재연결 대기) 플래그.
  //   true 동안 클라 예측(predictStep)을 정지시켜, 실체 없는 좌표로 계속 걸어가는 "유령 클라"를 원천 차단.
  //   해제는 오직 primary welcome 앵커에서만(= 서버 권위 좌표를 받은 순간).
  let _selfGone = false;
  // Phase 14.41: 사망/구조
  let myIsDown = false;
  let myDownedAt = 0;
  let myDownRescueWindowMs = 10000;
  let myRespawnOptions = [];      // [{ claimId, kind, x, y }]
  const downStates = new Map();    // pid -> true (다운된 다른 플레이어)
  // Phase 14.42-a: home zone (영구 부활 fallback)
  let myHomeZone = null;
  let myHomeX = null, myHomeY = null;

  // === Phase 14.45: 위도 biome — 극지 빙하 + 툰드라 그라데이션 ===
  // 서버 ICE_BAND_PX와 일치. 그 바깥 TUNDRA_BAND_PX까지 보간.
  const ICE_BAND_PX = 1500; // v8: 800→1500
  const TUNDRA_BAND_PX = 2500;
  const ICE_COLOR = '#dde8f0'; // 약간 푸르스름한 흰색
  function _h2i(c) { return parseInt(c.slice(1), 16); }
  function _mixHex(a, b, t) {
    const pa = _h2i(a), pb = _h2i(b);
    const r = Math.round(((pa>>16)&255) * (1-t) + ((pb>>16)&255) * t);
    const g = Math.round(((pa>>8)&255)  * (1-t) + ((pb>>8)&255)  * t);
    const bl = Math.round((pa&255)      * (1-t) + (pb&255)      * t);
    return '#' + ((r<<16)|(g<<8)|bl).toString(16).padStart(6, '0');
  }
  // 타일 틴트 합성색 캐시 — 매 프레임 ~7천 타일 × _mixHex(hex 파싱) 반복 제거. 색 조합 정적.
  const _tintBlendCache = new Map();
  function blendTint(base, tint, t) {
    const k = base + '|' + tint + '|' + t;
    let c = _tintBlendCache.get(k);
    if (c === undefined) { c = _mixHex(base, tint, t); _tintBlendCache.set(k, c); }
    return c;
  }
  // 절대 월드 y에 따라 색 보정. totalHeight = 전체 월드 높이 (남북 합).
  function latitudeColor(absY, totalH, baseColor) {
    const distFromPole = Math.min(absY, totalH - absY);
    if (distFromPole >= TUNDRA_BAND_PX) return baseColor;
    if (distFromPole <= ICE_BAND_PX)    return ICE_COLOR;
    const t = (distFromPole - ICE_BAND_PX) / (TUNDRA_BAND_PX - ICE_BAND_PX);
    return _mixHex(ICE_COLOR, baseColor, t);
  }

  // === Phase 14.46-b-mini: 해안선 water tiles (서버 chunk.js generateCoastlineWaterTiles와 동일 알고리즘) ===
  const COASTLINE_BASE = 6000, COASTLINE_NOISE = 5000;
  // 2D 월드좌표 value noise — 서버 chunk.js와 동일. "가장 가까운 바다점"에서 샘플 → 변/꼭짓점/존경계 솔기 없음.
  function _coastHash2(ix, iy, oct) {
    let h = 5381;
    h = ((h * 33) ^ ix) >>> 0; h = ((h * 33) ^ iy) >>> 0; h = ((h * 33) ^ oct) >>> 0;
    return (((h * 9301 + 49297) >>> 0) % 1000) / 1000;
  }
  function _vnoise2(x, y, step, oct) {
    const gx = x / step, gy = y / step;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const n00 = _coastHash2(ix, iy, oct), n10 = _coastHash2(ix + 1, iy, oct);
    const n01 = _coastHash2(ix, iy + 1, oct), n11 = _coastHash2(ix + 1, iy + 1, oct);
    const a = n00 * (1 - ux) + n10 * ux, b = n01 * (1 - ux) + n11 * ux;
    return a * (1 - uy) + b * uy;
  }
  function _coastFbm2D(x, y) { return _vnoise2(x, y, 3200, 1) * 0.50 + _vnoise2(x, y, 960, 2) * 0.32 + _vnoise2(x, y, 320, 3) * 0.18; }
  function _coastSmoothNoise2D(x, y) { return (_coastFbm2D(x, y) - 0.5) * 2; }
  function clientFindZoneAt(absX, absY) {
    for (const z of Object.values(zonesMeta)) {
      if (absX >= z.worldOffsetX && absX < z.worldOffsetX + z.zoneWidth &&
          absY >= z.worldOffsetY && absY < z.worldOffsetY + z.zoneHeight) return z;
    }
    return null;
  }
  function computeCoastlineWaterTiles(zone, tileSize) {
    const waterTiles = new Set();
    if (zone.isOcean) return waterTiles;
    const oceanRects = Object.values(zonesMeta).filter(z => z.isOcean).map(z => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
    if (!oceanRects.length) return waterTiles;
    const cols = Math.ceil(zone.zoneWidth / tileSize);
    const rows = Math.ceil(zone.zoneHeight / tileSize);
    const maxDist = COASTLINE_BASE + COASTLINE_NOISE, maxDist2 = maxDist * maxDist;
    for (let ty = 0; ty < rows; ty++) {
      const absY = zone.worldOffsetY + ty * tileSize;
      const wty = Math.floor(absY / tileSize);
      const distN = ty * tileSize, distS = (rows - 1 - ty) * tileSize;
      for (let tx = 0; tx < cols; tx++) {
        const absX = zone.worldOffsetX + tx * tileSize;
        const wtx = Math.floor(absX / tileSize);
        const distW = tx * tileSize, distE = (cols - 1 - tx) * tileSize;
        if (Math.min(distW, distE, distN, distS) > maxDist) continue;
        // 가장 가까운 바다점 (변 + 꼭짓점)
        const ax = absX + tileSize / 2, ay = absY + tileSize / 2;
        let bd2 = maxDist2, bnx = 0, bny = 0, hit = false;
        for (let oi = 0; oi < oceanRects.length; oi++) {
          const O = oceanRects[oi];
          const nx = ax < O.x0 ? O.x0 : (ax > O.x1 ? O.x1 : ax);
          const ny = ay < O.y0 ? O.y0 : (ay > O.y1 ? O.y1 : ay);
          const dx = ax - nx, dy = ay - ny, d2 = dx * dx + dy * dy;
          if (d2 < bd2) { bd2 = d2; bnx = nx; bny = ny; hit = true; }
        }
        if (!hit) continue;
        const dist = Math.sqrt(bd2);
        const depth = COASTLINE_BASE + _coastSmoothNoise2D(bnx, bny) * COASTLINE_NOISE; // 바다점 월드좌표 2D 노이즈 → 솔기 없음
        if (dist < depth) waterTiles.add(`${tx}_${ty}`);
      }
    }
    return waterTiles;
  }
  // zonesMeta 받으면 모든 zone water tiles 미리 계산. zonesMeta 갱신 시 다시 호출.
  const waterTilesByZone = {}; // { zoneId: Set("tx_ty") }
  const _waterCellCache = new Map(); // "zid_tx_ty" → bool (isWaterAtAbs perf 캐시)
  const _terrainAppliedZones = new Set(); // Phase 5-K: hardcoded terrain 이미 적용한 zone — welcome 재적용/캐시클리어 스킵
  // Phase 5-G+: 전체 hardcoded terrain 선로딩 — welcome은 접속 zone 것만 줘서
  // bigMap에서 미접속 이웃 zone의 강이 procedural로 그려져 경계에서 끊겨 보이는 문제 해결
  (async () => {
    try {
      const r = await fetch('/terrain.json');
      if (!r.ok) return;
      const all = await r.json();
      if (!window.Terrain || !window.Terrain.setHardcoded) return;
      for (const [zid, data] of Object.entries(all)) window.Terrain.setHardcoded(zid, data);
      // ★[배치 19 B] 물 흐름의 정본 = 이 rivers path 다(상류→하류 순서). terrain.js 는 이걸
      //   `window.Terrain` 으로 내보내지 않으므로(_getHardcoded 는 서버 전용 export) **여기서**
      //   받은 원본을 그대로 잡아 둔다 — 서버 파일을 건드리지 않고 사본도 만들지 않는다.
      _hardTerrain = all; _riverSegs = null; _flowCellCache.clear(); _flowCellOld.clear(); _segGrid.map = null;
      _wfCache.key = null; _wfCache.pending = false; _wfPrev.wet = null;   // 지형이 갈렸으니 물 판정 재사용본도 버린다
      _waterCellCache.clear();
      _natChunk.clear();      // ★[배치 21] 자연물 청크 배치도 지형 파생 — 같은 지점에서 무효화
      _shoreTiles.clear();
      _rockCellCache.clear();
      _groundTiles.clear();   // ★[배치 19] 지면 베이크는 지형 파생물 — 같은 지점에서 함께 버린다
      if (typeof window.__invalidateMinimapCache === 'function') window.__invalidateMinimapCache();
      console.log('[terrain] 전체 hardcoded 선로딩:', Object.keys(all).join(','));
    } catch (e) { console.warn('[terrain] preload 실패:', e.message); }
  })();
  function precomputeAllWaterTiles() {
    const TS = 32;
    _waterCellCache.clear(); // zonesMeta 갱신 — 셀 단위 캐시 무효화
    _natChunk.clear();       // ★[배치 21] 자연물 청크 배치
    _shoreTiles.clear();
    _rockCellCache.clear();
    _groundTiles.clear();   // ★[배치 19] 지면 베이크도 함께
    for (const z of Object.values(zonesMeta)) {
      waterTilesByZone[z.id] = computeCoastlineWaterTiles(z, TS);
    }
  }
  // 절대 좌표에서 물 여부 판정 (콜라이더 + 렌더용)
  // perf fix: 셀 단위 캐시 — 타일 루프가 매 프레임 ~9천 타일 × hardcoded 강 251 세그먼트
  // 점-선분 거리 계산을 반복해서 fps 10까지 떨어지던 문제. 지형은 정적이라 캐시 안전.
  // (terrain 갱신 — setHardcoded/zonesMeta 변경 — 시 _waterCellCache.clear() 필수)
  function isWaterAtAbs(absX, absY, zHint) {
    const z = zHint || clientFindZoneAt(absX, absY);
    if (!z) return false;
    if (z.isOcean) return true;
    const tx = Math.floor((absX - z.worldOffsetX) / 32);
    const ty = Math.floor((absY - z.worldOffsetY) / 32);
    const key = z.id + '_' + tx + '_' + ty;
    const hit = _waterCellCache.get(key);
    if (hit !== undefined) return hit;
    let v = false;
    const set = waterTilesByZone[z.id];
    if (set && set.has(`${tx}_${ty}`)) v = true;
    // Phase 5-2-mini: inland water (강·호수) — terrain.js 동적 검사.
    // cell center로 검사 (시각과 콜라이더 일치).
    else if (window.Terrain) {
      v = window.Terrain.isWaterCellLocal(z.id, tx * 32 + 16, ty * 32 + 16);
    }
    if (_waterCellCache.size > 300000) _waterCellCache.clear(); // 메모리 가드 (~15MB 상한)
    _waterCellCache.set(key, v);
    return v;
  }
  // Phase 5-H: 산맥 바위 셀 — 통행 불가 + 회색 렌더. 물과 동일 구조 (셀 캐시).
  const _rockCellCache = new Map();
  function isRockAtAbs(absX, absY, zHint) {
    const z = zHint || clientFindZoneAt(absX, absY);
    if (!z || z.isOcean) return false;
    const tx = Math.floor((absX - z.worldOffsetX) / 32);
    const ty = Math.floor((absY - z.worldOffsetY) / 32);
    const key = z.id + '_' + tx + '_' + ty;
    const hit = _rockCellCache.get(key);
    if (hit !== undefined) return hit;
    let v = false;
    if (window.Terrain && window.Terrain.isRockCellLocal) {
      v = window.Terrain.isRockCellLocal(z.id, tx * 32 + 16, ty * 32 + 16);
    }
    if (_rockCellCache.size > 300000) _rockCellCache.clear();
    _rockCellCache.set(key, v);
    return v;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 19 실장 A] 지면 = **질감 타일링 + iso 타일 오프스크린 베이크**
  //   재민 확정 문법: 풀은 **게임 카메라 각도(방위45·고도30)로 구운** 텍스처를 쓴다.
  //   탑다운을 다이아몬드에 눌러 붙이면 옆으로 뭉개져 "풀 얼룩"이 된다(시안 왕복에서 확정).
  //
  //   ★타일 단위가 '월드 셀 청크'가 아니라 **iso 직사각형**인 이유:
  //     셀 청크의 iso 바운딩 박스는 마름모라 절반이 낭비다(메모리 2배).
  //     텍스처 주기가 iso 공간에서 정확히 512×256 px 이므로(bake-terrain-tex.py 머리말 참조)
  //     iso 를 512×256 격자로 자르면 ⓐ낭비 0 ⓑ타일 원점이 항상 주기의 배수라
  //     **패턴 오프셋이 0** 이다(setTransform 없이 이음새 없음).
  //   ★지면은 정적이다 — 한 번 구워 두고 매 프레임 drawImage 만 한다.
  //     무효화는 지형 캐시와 같은 지점(_waterCellCache 3곳)에서 함께.
  // 셀 좌표 결정론 해시(0~1) — ★렌더 산포에 Math.random 을 쓰면 프레임마다 바뀐다(금지).
  function _cellHash(cx, cy, salt) {
    let h = (Math.imul(cx | 0, 374761393) + Math.imul(cy | 0, 668265263) + Math.imul(salt | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const GT_W = 512, GT_H = 256;        // iso 타일 = 텍스처 주기(= 월드 8×8셀)
  const GT_MASK_W = 1024, GT_MASK_H = 512;   // 맨땅 뙈기 마스크 주기(텍스처보다 크게 — 반복 티 감소)
  const GT_MAX = 140;                  // 타일 캐시 상한(≈70MB) — 넘으면 카메라에서 먼 것부터 버린다
  const GT_MAX_WIND = 80;              // ★잎 층까지 들면 타일당 메모리가 2배다 — 상한을 낮춘다(화면은 ~30장)
  // ★[2026-08-09 실측 정정] 옛 주석의 "32px +0.27ms · 16px +0.53 · 8px +1.03" 은 **틀렸다**.
  //   실클라 짝 비교(켬/끔 5회 교대)로 재니 풀 카펫 흔들림 하나가 **16.3ms/f** 다 — 29배 차이.
  //   옛 수치는 격리·첫 blit 측정으로 보인다. 아래 값들은 전부 짝 비교로 다시 잰다.
  let _gtFrac = false;                 // true = 옛 소수 목적지(A/B 대조군)
  let GT_STRIP = 16;                   // 잎 띠 높이(px) — 시험 손잡이 __gtStrip 으로 바꿀 수 있다
  const GT_GRASS_AMP = 2.2;            // 카펫이 눕는 최대 폭(px). 잎이 6~10px 이라 이 이상은 '미끄러짐'으로 보인다
  const GT_WAVE_K = 0.017;             // 파수(1/px) — 파장 ≈ 370px ≈ 11셀. 들판을 훑는 결
  const GT_WAVE_W = 1.15;              // 각속도(rad/s, 게임 시계)
  const GT_BAKE_PER_FRAME = 5;         // 프레임당 새로 굽는 타일 수(히치 방어)
  const GT_ZONE_TINT = 0.18;           // 존 groundColor 를 텍스처 위에 얹는 세기(존 정체성 유지)
  const _groundTiles = new Map();      // "itx_ity" → {cv, used}
  let _shMarginN = 0;                  // 지금까지 구운 물가 여백 조각 수 — 하네스 계측기(자명 통과 금지)
  const GTEX = {};
  let _gtexReady = 0;
  for (const k of ['grass_angled', 'dry_angled', 'mud_angled', 'rock_angled']) {
    const im = new Image(); im.onload = () => { _gtexReady++; _groundTiles.clear(); }; im.src = '/assets/terrain/' + k + '.png';
    GTEX[k] = im;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★★[재민 정정 2026-08-07] "모든 초원에 그려져 있는 **그 풀**이 흔들려야 한다"
  //   1패스에서 나는 **흩뿌린 포기 스프라이트**만 흔들고, 지면에 깔린 풀 카펫은
  //   "재베이크가 필요해 비싸다"며 회부했다. 그게 바로 요청 대상이었다. 미룰 일이 아니었다.
  //
  //   ★구조가 걸림돌인 건 맞다 — 지면은 512×256 타일로 **한 번 구워 blit** 한다.
  //     (옛 주석의 "0.04ms/f" 는 격리 측정이다. 짝 비교로는 지면 계열 손잡이가 전부 잡음 수준이었다.)
  //     구워진 그림은 못 움직인다. 그래서 **굽는 걸 둘로 쪼갠다**:
  //
  //       바탕(cv)  = 지금 굽던 그대로. 단 ① 단계의 풀 텍스처를 **평탄한 한 색**으로 깐다.
  //       잎(bl)    = (풀텍스처 − 그 평탄색) × **투과율 T**
  //
  //     여기서 T 는 "① 위에 칠해진 모든 것이 남긴 투과율"이다. 알파 합성은 배경에 대해
  //     **선형**이라 `sharp = fixed + T·tex`, `flat = fixed + T·flat색` 이 성립하고,
  //     따라서 `sharp = flat + T·(tex − flat색)` 이다. **근사가 아니라 항등식**이다.
  //     ⇒ 매 프레임 `바탕 blit` 다음에 `잎`을 **가로 띠로 어긋나게 'lighter'(가산) blit** 하면
  //       재베이크 없이 카펫이 눕는다. 띠마다 위상이 다르니 들판을 훑는 파가 된다.
  //
  //   ★T 는 추정하지 않는다 — 굽는 그 자리에서 **같은 알파로 같은 도형을 지우며** 만든다
  //     (`destination-out` + globalAlpha = ×(1−α)). 뙈기·물·바위·틴트·상태 레이어 전부.
  //   ★비용 실측(headless, 타일 30장 = 화면 가득):
  //   ★★[2026-08-09 실측 정정] 위 "0.038 / 0.307 / 0.566ms/f" 는 **전부 틀렸다.**
  //     실클라 짝 비교(windForce 1↔0, 굽기 경로 고정, 5회 교대):
  //         소수 어긋남(옛판) **15.2ms/f**  ·  정수 어긋남(채택) **4.6ms/f**
  //     띠 높이는 무관했다(16/32/64px → 13.0/16.1/17.6ms, 전부 잡음 안).
  //     ⇒ 범인은 띠 개수도 픽셀 수도 아니라 **소수 목적지의 이중선형 재샘플링**이었다.
  //       옛 수치는 격리·첫 blit 측정으로 보인다. 이 파일의 ms/f 주석은 그렇게 못 믿는다.
  //   ★`windOff` 면 ① 단계가 **종전대로 선명한 텍스처**를 깐다 = 픽셀 단위로 옛 그림(대조군).
  let _grassFlat = null, _grassBlade = null;
  function _grassSplit() {
    if (_grassBlade) return true;
    const src = GTEX.grass_angled;
    if (!src || !src.naturalWidth) return false;
    const w = src.naturalWidth, h = src.naturalHeight;
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(src, 0, 0);
    const im = tg.getImageData(0, 0, w, h), d = im.data;
    // 평탄색 = **어두운 쪽**(잎 사이 그늘). 잎 = tex − 평탄색 ≥ 0 이어야 가산 합성이 성립한다.
    //   백분위로 뽑는다(고정 상수는 텍스처를 갈아 끼우면 깨진다).
    const ch = [[], [], []];
    for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
    //   ★백분위 2% — 실측으로 골랐다. 옛 그림과의 |Δ|>10 픽셀: 6% → 4,221 · **2% → 3,694** · 0.5% → 4,116.
    //     (0.5% 가 더 나빴다는 건 남은 오차가 `max(0,tex−flat)` **잘림**이 아니라는 뜻이다 —
    //      진짜 출처는 상태 레이어의 투과율을 두 알파로 **근사**한 것이다. §보고 참조.)
    const flat = ch.map((a3) => { a3.sort((x, y) => x - y); return a3[Math.floor(a3.length * 0.02)]; });
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.max(0, d[i] - flat[0]);
      d[i + 1] = Math.max(0, d[i + 1] - flat[1]);
      d[i + 2] = Math.max(0, d[i + 2] - flat[2]);
      d[i + 3] = 255;
    }
    tg.putImageData(im, 0, 0);
    _grassBlade = t;
    _grassFlat = 'rgb(' + flat[0] + ',' + flat[1] + ',' + flat[2] + ')';
    return true;
  }
  // 맨땅 뙈기 마스크 — ★셀 격자가 아니라 **저주파 노이즈**로 뿌린다.
  //   셀마다 변주 타일을 고르면 다이아몬드 격자무늬가 그대로 드러난다(타일 게임의 흔한 실패).
  //   주기 마스크라 타일 경계에서도 이어진다.
  let _gtMaskCv = null;
  function _gtMask() {
    if (_gtMaskCv) return _gtMaskCv;
    const cv = document.createElement('canvas'); cv.width = GT_MASK_W; cv.height = GT_MASK_H;
    const g = cv.getContext('2d'); const id = g.createImageData(GT_MASK_W, GT_MASK_H);
    const NG = 32;   // 주기 격자 — 마스크 크기의 약수여야 감았을 때 이어진다
    const lat = new Float32Array(NG * NG);
    for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) lat[j * NG + i] = _cellHash(i, j, 913);
    const vn = (u, v) => {
      u = ((u % NG) + NG) % NG; v = ((v % NG) + NG) % NG;
      const i0 = u | 0, j0 = v | 0, i1 = (i0 + 1) % NG, j1 = (j0 + 1) % NG, fu = u - i0, fv = v - j0;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      const a = lat[j0 * NG + i0], b = lat[j0 * NG + i1], c = lat[j1 * NG + i0], d = lat[j1 * NG + i1];
      return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
    };
    for (let y = 0; y < GT_MASK_H; y++) for (let x = 0; x < GT_MASK_W; x++) {
      // 두 옥타브 — 큰 뙈기 + 잘게 부서진 가장자리("맨땅 뙈기는 잘게")
      // ★3옥타브 — 1패스(2옥타브·문턱 0.56)는 뙈기가 크고 뭉툭했다. 재민 지시 "맨땅 뙈기는 잘게".
      const n = vn(x / GT_MASK_W * NG, y / GT_MASK_H * NG) * 0.56
              + vn(x / GT_MASK_W * NG * 2.5, y / GT_MASK_H * NG * 2.5) * 0.29
              + vn(x / GT_MASK_W * NG * 6, y / GT_MASK_H * NG * 6) * 0.15;
      const a = Math.max(0, Math.min(1, (n - 0.615) * 6.0));   // 문턱 — 대부분 풀, 일부만 맨땅
      const i = (y * GT_MASK_W + x) * 4;
      id.data[i] = 255; id.data[i + 1] = 255; id.data[i + 2] = 255; id.data[i + 3] = (a * 255) | 0;
    }
    g.putImageData(id, 0, 0);
    return (_gtMaskCv = cv);
  }
  let _gtTmp = null, _gtCov = null;
  function _bakeGroundTile(itx, ity, zlist) {
    const X0 = itx * GT_W, Y0 = ity * GT_H;
    const cv = document.createElement('canvas'); cv.width = GT_W; cv.height = GT_H;
    const g = cv.getContext('2d');
    // ★풀 카펫 흔들림 — 켜져 있으면 ① 을 **평탄색**으로 깔고, 잎은 따로 굽는다(위 _grassSplit 주석).
    //   꺼져 있으면 종전대로 선명한 텍스처 = 픽셀 단위로 옛 그림(대조군).
    const _wg = !_t19.windOff && !_t19.windGrassOff && _grassSplit();
    let gm = null;
    if (_wg) {
      if (!_gtCov) { _gtCov = document.createElement('canvas'); _gtCov.width = GT_W; _gtCov.height = GT_H; }
      gm = _gtCov.getContext('2d');
      gm.setTransform(1, 0, 0, 1, 0, 0); gm.globalCompositeOperation = 'source-over'; gm.globalAlpha = 1;
      gm.fillStyle = '#fff'; gm.fillRect(0, 0, GT_W, GT_H);        // 투과율 T = 1 에서 시작
      gm.globalCompositeOperation = 'destination-out';             // 이후 칠하는 것은 전부 **지우기**
    }
    // ① 풀 바탕 — 타일 원점이 주기의 배수라 패턴 오프셋 0
    g.fillStyle = _wg ? _grassFlat : g.createPattern(GTEX.grass_angled, 'repeat');
    g.fillRect(0, 0, GT_W, GT_H);
    // ② 맨땅 뙈기 — 저주파 마스크로 마른땅 텍스처를 뚫어 얹는다
    if (!_gtTmp) { _gtTmp = document.createElement('canvas'); _gtTmp.width = GT_W; _gtTmp.height = GT_H; }
    { const t = _gtTmp.getContext('2d');
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over';
      t.clearRect(0, 0, GT_W, GT_H);
      t.fillStyle = t.createPattern(GTEX.dry_angled, 'repeat'); t.fillRect(0, 0, GT_W, GT_H);
      t.globalCompositeOperation = 'destination-in';
      const mp = t.createPattern(_gtMask(), 'repeat');
      const mm = new DOMMatrix(); mm.e = -(((X0 % GT_MASK_W) + GT_MASK_W) % GT_MASK_W); mm.f = -(((Y0 % GT_MASK_H) + GT_MASK_H) % GT_MASK_H);
      mp.setTransform(mm); t.fillStyle = mp; t.fillRect(0, 0, GT_W, GT_H);
      t.globalCompositeOperation = 'source-over';
      g.drawImage(_gtTmp, 0, 0);
      if (gm) gm.drawImage(_gtTmp, 0, 0);        // 뙈기가 덮은 만큼 T 가 줄어든다(같은 알파)
    }
    // ③ 셀별 마감 — 물·바위·위도 틴트·얼음 밴드(기존 문법 그대로, 텍스처 위에 얹는다)
    //   이 타일에 걸치는 셀 범위를 iso 네 모서리의 역변환으로 구한다(i2w: wx=(2iy+ix)/2, wy=(2iy-ix)/2)
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const [ix, iy] of [[X0, Y0], [X0 + GT_W, Y0], [X0, Y0 + GT_H], [X0 + GT_W, Y0 + GT_H]]) {
      const wx = (2 * iy + ix) / 2, wy = (2 * iy - ix) / 2;
      if (wx < mnx) mnx = wx; if (wx > mxx) mxx = wx;
      if (wy < mny) mny = wy; if (wy > mxy) mxy = wy;
    }
    const c0x = Math.floor(mnx / 32) - 1, c1x = Math.ceil(mxx / 32) + 1;
    const c0y = Math.floor(mny / 32) - 1, c1y = Math.ceil(mxy / 32) + 1;
    // ②-b ★물가 여백 — 셀별 마감 **앞**에 깐다(그래야 위도 틴트·존 틴트를 똑같이 받는다)
    let nMargin = 0;
    if (!_t19.shMarginOff) nMargin = _shoreMarginBake(g, X0, Y0, c0x, c1x, c0y, c1y, zlist, gm);
    _shMarginN += nMargin;
    let nCell = 0;
    // ★[배치 20 B] 타일 상태 원천 — **주 존만**(다른 존은 상태 데이터 자체가 없다).
    //   패턴은 타일당 1회만 만든다(셀마다 createPattern 하면 베이크가 3배 느려진다 — 실측).
    const _pc = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
    const _pz = (_pc && _pc.meta) ? _pc.meta : null;
    const _soilMap = _pc ? _pc.soil : null, _roadMap = _pc ? _pc.roads : null;
    const _farm = _tsFarmSet(_pc);
    const _pat = (GTEX.dry_angled && GTEX.mud_angled)
      ? { dry: g.createPattern(GTEX.dry_angled, 'repeat'), mud: g.createPattern(GTEX.mud_angled, 'repeat') } : null;
    const _wxL = _wxListOf(_pc);   // ★날씨 걸린 마을만(보통 0~5) — 없으면 셀 루프에서 비용 0
    let nState = 0, nWx = 0;
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      const cxw = cx * 32 + 16, cyw = cy * 32 + 16;
      const sx = (cxw - cyw) - X0, sy = (cxw + cyw) / 2 - Y0;
      if (sx < -34 || sx > GT_W + 34 || sy < -18 || sy > GT_H + 18) continue;   // 이 타일 밖
      nCell++;
      let zMeta = null;
      for (let zi = 0; zi < zlist.length; zi++) {
        const zm = zlist[zi], ox = zm.worldOffsetX, oy = zm.worldOffsetY || 0;
        if (cxw >= ox && cxw < ox + (zm.zoneWidth || 100000) && cyw >= oy && cyw < oy + (zm.zoneHeight || 100000)) { zMeta = zm; break; }
      }
      if (!zMeta) { _gtDiamond(g, sx, sy, (primaryZoneId && zonesMeta[primaryZoneId]?.groundColor) || '#3a5a3a', 1, gm); continue; }
      const isWater = isWaterAtAbs(cxw, cyw, zMeta);
      const isRock = !isWater && isRockAtAbs(cxw, cyw, zMeta);
      // ★[배치 20 B] 이 셀의 상태 벡터. 레코드가 없으면 기준선(정적 지형 파생) — 손 안 댄 세계는
      //   서버 행 0 이고 그림은 SoilBase.baseAt 만으로 결정론적으로 나온다.
      let _st = null, _lcx = 0, _lcy = 0;
      const _bio = (typeof SoilBase !== 'undefined') ? SoilBase.biomeOf(zMeta.biome) : null;
      if (_pat && _pz && !_t19.stateOff && zMeta.id === primaryZoneId) {
        _lcx = Math.floor((cxw - _pz.worldOffsetX) / 32); _lcy = Math.floor((cyw - (_pz.worldOffsetY || 0)) / 32);
        const _k = _lcx + ',' + _lcy;
        const _rec = _soilMap ? _soilMap.get(_k) : null;
        const _isFarm = _farm ? _farm.has(_k) : false;
        const _S0 = (typeof SoilBase !== 'undefined') ? SoilBase : null;
        const _soilRaw = _tsSoil(_lcx, _lcy, isWater ? 'water' : (isRock ? 'rock' : 'land'), _rec);
        const _wxM = _wxL ? _wxMulAt(_wxL, cxw, cyw) : 1;
        if (_wxM !== 1) nWx++;
        _st = {
          // ★날씨는 **유효값**만 바꾼다 — 저장된 토양치(_rec.v)는 건드리지 않는다.
          //   가뭄이 끝나면 곱이 1 로 돌아오고 땅도 그대로 돌아온다. 진실이 하나로 남는다.
          soil: Math.max(0, Math.min(1000, _soilRaw * _wxM)),
          soilRaw: _soilRaw, wx: _wxM,
          geo: _rec ? (_rec.geo | 0) : 0,
          ore: _rec ? (_rec.ore == null ? 15 : _rec.ore) : 15,
          road: _roadMap ? (_roadMap.get(_k) || 0) : 0,
          // 경작 세기는 뙈기마다 다르다(자리 해시) — 작물 성장으로 매 프레임 흔들면 재베이크가 폭주한다
          till: _isFarm ? (620 + 380 * (_S0 ? _S0.hash(_lcx, _lcy, 4241) : 0.5)) : 0,
        };
      }
      // ★산터(부서진 산)는 **지형이 아직 바위여도** 산터 램프로 그린다 — 파괴는 동적 층이고
      //   지형 정본(terrain.json)은 한 바이트도 안 바뀌기 때문이다.
      if (!isWater && _st && _st.geo) {
        _gtPaintState(g, sx, sy, _st, _lcx, _lcy, _pat, _bio, gm); nState++;
        if (GT_ZONE_TINT > 0) _gtDiamond(g, sx, sy, zMeta.groundColor, GT_ZONE_TINT * 0.5, gm);
        continue;
      }
      if (isWater) {
        // ★물밑 바닥 = **진흙 재질**이다(재민 확정 ②). 풀 텍스처를 비치면 물가 풀대가
        //   반투명해 보인다 — 시안 왕복에서 "반투명 풀" 로 반려된 그 증상이다.
        //   물 셰이더 레이어가 이 위에 wa=0.42~1.0 으로 덮으므로 얕은 데서 이 진흙이 비친다.
        //   WebGL 이 없는 환경에서는 덮을 것이 없으므로 종전 단색으로 떨어진다(기능 저하 허용).
        if (_wgl.ok === true && !_t19.waterOff) {
          g.save(); g.beginPath();
          g.moveTo(sx, sy - 16); g.lineTo(sx + 32, sy); g.lineTo(sx, sy + 16); g.lineTo(sx - 32, sy); g.closePath(); g.clip();
          g.fillStyle = g.createPattern(GTEX.mud_angled, 'repeat');
          g.fillRect(sx - 32, sy - 16, 64, 32); g.restore();
          if (gm) _covDia(gm, sx, sy, 1);            // 물밑 진흙은 불투명 — 잎 투과율 0
        } else {
          _gtDiamond(g, sx, sy, blendTint(zMeta.isOcean ? zMeta.groundColor : '#2a5a8a',
                                          zMeta.isOcean ? zMeta.tintColor : '#1a4a7a', 0.07), 1, gm);
        }
      } else if (isRock) {
        // ★★[배치 20 영역 — 산] 종전 색·종전 문법 그대로다. 이 배치는 바위 렌더를 바꾸지 않는다.
        _gtDiamond(g, sx, sy, blendTint('#6e6356', '#4a4138', 0.12), 1, gm);
      } else {
        // ★[배치 20 B] 상태 레이어 — 비옥도·경작·답압·채굴을 **연속 램프**로 얹는다.
        //   위도/얼음/존 틴트보다 **아래**다(존 정체성이 그 위에 남아야 한다).
        if (_st) { _gtPaintState(g, sx, sy, _st, _lcx, _lcy, _pat, _bio, gm); nState++; }
        // 기존 문법 유지: 얼음 밴드 → 위도 보간 → 존 틴트. 단색 대신 **텍스처 위에 알파로** 얹는다.
        const distFromPole = Math.min(cyw, worldHeight - cyw);
        if (distFromPole < TUNDRA_BAND_PX) {
          const t = distFromPole <= ICE_BAND_PX ? 1
                  : 1 - (distFromPole - ICE_BAND_PX) / (TUNDRA_BAND_PX - ICE_BAND_PX);
          _gtDiamond(g, sx, sy, ICE_COLOR, t, gm);
        }
        const isIce = distFromPole <= ICE_BAND_PX;
        if (GT_ZONE_TINT > 0) _gtDiamond(g, sx, sy, zMeta.groundColor, GT_ZONE_TINT, gm);
        _gtDiamond(g, sx, sy, isIce ? '#9bb5cc' : zMeta.tintColor, isIce ? 0.06 : 0.13, gm);
      }
    }
    // ★잎 층 = (풀텍스처 − 평탄색) × 투과율 T. 이걸 매 프레임 가로 띠로 어긋나게 가산 blit 한다.
    let bl = null;
    if (_wg) {
      bl = document.createElement('canvas'); bl.width = GT_W; bl.height = GT_H;
      const bg = bl.getContext('2d');
      bg.fillStyle = bg.createPattern(_grassBlade, 'repeat');   // 타일 원점이 주기의 배수 → 위상 0
      bg.fillRect(0, 0, GT_W, GT_H);
      bg.globalCompositeOperation = 'destination-in';
      bg.drawImage(_gtCov, 0, 0);
      bg.globalCompositeOperation = 'source-over';
    }
    return { cv, bl, cells: nCell, state: nState, wx: nWx };
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★★[재민 재지적 2026-08-06c] "이제 다시 풀이 어색하게 잘리지 않도록 해볼 수 있을까"
  //
  //   ★수리(§6-e)로 물 넘침을 걷어내고 **확대해서 다시 봤다.** 남아 있던 그림은 이거다:
  //     풀 → (칼로 그은 듯한 **완전 직선 대각선**) → 물. 전이 구간이 **0px** 다.
  //     특히 북·서 물가는 프리즘조차 없어서 **풀잎이 대각선에 그대로 잘린다.**
  //   ★실측(수직 프로파일, 프리즘 남·동면 기준):
  //       뭍 풀 σ 29~45 (질감) → 립 d=0 에서 σ **24.9** (프로파일 전체 최솟값 = 가장 띠답다)
  //       → 프리즘 그늘 d=3~4 휘도 **38~40** ↔ 물 d=6 휘도 **106**. 명암 대비가 곧 **윤곽선**이다.
  //
  //   ★두 번 반려된 길을 다시 가지 않는다. 반려된 것은 `_bakeShoreTile` =
  //     **물 위에 초록 띠를 하나 더 얹는 것**이었다(재민: "after가 여전히 더 심해").
  //     그 실패에서 남는 교훈은 셋이다 — ⓐ물 위에 새 층을 얹지 마라 ⓑ폭이 일정하면 띠다
  //     ⓒ규칙적 마스크는 무늬로 읽힌다.
  //
  //   ★그래서 이번엔 **뭍 쪽으로** 판다. 실제 물가에는 풀이 물까지 자라지 않는다 —
  //     젖은 모래·자갈 **여백**이 있다. 그 여백을 **지면 베이크 안에서** 만든다:
  //       · 새 레이어 0장(프레임 비용 0). 물 위에 아무것도 안 얹는다.
  //       · 폭이 **저주파로 0↔13px 사이를 오간다** — 어떤 구간은 풀이 물까지 가고(여백 0),
  //         어떤 구간은 넓은 모래톱이다. 폭이 0인 구간이 있어야 '띠'가 아니다.
  //       · 폭의 정본은 **술 밀도와 같은 노이즈장**(salt 4211)이다 ⇒ 갈대가 빽빽한 구간은
  //         여백 0(습지), 술이 한 포기도 없는 빈 구간은 넓은 모래톱. **한 장(場)이 둘을 설명한다.**
  //       · 여백의 **안쪽 경계는 풀잎 모양으로 깎는다** — 풀 텍스처 자신의 잎 알파로 모래를
  //         파내서 잎이 모래 쪽으로 삐져나오게 한다(합성 얼룩은 격자 무늬가 된다 — 2패스 실패).
  //         마스크는 지면 바탕과 **같은 위상**(패턴 오프셋 0)이라 실제 잎 자리와 맞는다.
  //   ⇒ 결과적으로 직선은 남지만 그 직선은 이제 **모래↔물**이다. 물가선이 날카로운 건 정상이다.
  //     잘리는 건 풀이 아니라 모래다.
  const SH_MARGIN_MAX = 13;         // 최대 여백(px). 셀 반폭 16 을 넘으면 셀을 통째로 먹는다
  function _shoreMargin(cx, cy, k) {
    // ★1패스는 여백 폭을 **술 밀도와 같은 장**(salt 4211)에 묶었다 — 개념은 예뻤지만 실측이 반박했다:
    //   값 노이즈는 0.5 근처에 몰려서 '여백이 생기는 구간'이 화면에서 36조각뿐이었고, 실제 물가는
    //   1패스 전과 거의 그대로였다(재민이 지적한 그 직선이 그대로 남았다).
    //   ⇒ **자기 장**을 쓴다. 두 옥타브(파장 5셀 + 10셀)를 섞어 넓게 굽이치게 한다.
    //   ※술과 굳이 안 묶어도 겹치지 않는다: band0 술은 셀 중심에서 물 쪽으로 12~28px 밀려
    //     **물 위에** 서고, 여백은 변에서 **뭍 쪽으로** 최대 13px 다. 갈대는 모래톱 끝 물에 선다.
    const u = 0.62 * _natNoise(cx, cy, 6120) + 0.38 * _natNoise(cx * 0.5, cy * 0.5, 6121);
    // ★문턱 0.40 은 취향이 아니라 **판정에 맞춘 값**이다. 2패스에서 0.26 을 썼더니 물가 변의
    //   **91%** 에 여백이 생겨 `e2e-nature` ⓗ(빈 구간 ≥20%)를 9% 로 못 넘었다 — 그건 곧 띠다.
    //   판정을 낮추는 대신 **코드를 고쳤다.** (같은 규율: 배치 21 frFloor 시안 B 기각)
    let w = (u - 0.40) / 0.22;                    // u≤0.40 → 여백 0(풀이 물까지 간다) · u≥0.62 → 최대
    w = w < 0 ? 0 : w > 1 ? 1 : w;
    // 자리별 배율 폭이 넓어야 '띠'가 아니다 — 같은 굽이 안에서도 셀마다 0.35~1.30 배로 흔든다
    const sc = (_t19.shMargin == null ? 1 : _t19.shMargin);   // 시안·하네스 손잡이(0 = 끔)
    return SH_MARGIN_MAX * sc * w * (0.35 + 0.95 * _cellHash(cx, cy, 5150 + k));
  }
  // ★하네스 계측기 — 물가 **변**마다 여백 폭을 내보낸다. 판정(빈 구간 비율·변동계수)은 하네스가 한다.
  //   여기서 폭을 다시 계산하면 그게 사본이라 자명 통과가 된다 ⇒ **정본 `_shoreMargin` 을 그대로 부른다.**
  //   ※자리를 안 주면 **이번 프레임 카메라 중심**을 쓴다 — 하네스가 존 오프셋을 다시 계산하다
  //     틀리는 걸 막는다(1패스 실패: 존 로컬 좌표를 절대 좌표로 넘겨 표본 0이 나왔다).
  window.__shoreProbe = (R, cx0, cy0) => {
    R = R || 900;
    if (cx0 == null) { cx0 = _natLastC[0]; cy0 = _natLastC[1]; }
    const w = [];
    const c0 = Math.floor((cx0 - R) / 32), c1 = Math.floor((cx0 + R) / 32);
    const r0 = Math.floor((cy0 - R) / 32), r1 = Math.floor((cy0 + R) / 32);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const wx = cx * 32 + 16, wy = cy * 32 + 16;
      if (isWaterAtAbs(wx, wy) || isRockAtAbs(wx, wy)) continue;
      for (let k = 0; k < 4; k++) {
        const nx = [1, -1, 0, 0][k], ny = [0, 0, 1, -1][k];
        if (!isWaterAtAbs(wx + nx * 32, wy + ny * 32)) continue;
        w.push(_shoreMargin(cx, cy, k));
      }
    }
    return w;
  };
  let _shTmp = null;
  function _shoreMarginBake(g, X0, Y0, c0x, c1x, c0y, c1y, zlist, gm) {
    if (!GTEX.dry_angled || !GTEX.grass_angled || !GTEX.grass_angled.naturalWidth) return 0;
    if (!_shTmp) { _shTmp = document.createElement('canvas'); _shTmp.width = GT_W; _shTmp.height = GT_H; }
    const t = _shTmp.getContext('2d');
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
    t.clearRect(0, 0, GT_W, GT_H);
    const dia = (gg, x, y) => { gg.beginPath(); gg.moveTo(x, y - 16); gg.lineTo(x + 32, y); gg.lineTo(x, y + 16); gg.lineTo(x - 32, y); gg.closePath(); };
    let bp = null, n = 0;
    const strips = [];
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      const cxw = cx * 32 + 16, cyw = cy * 32 + 16;
      const sx = (cxw - cyw) - X0, sy = (cxw + cyw) / 2 - Y0;
      if (sx < -46 || sx > GT_W + 46 || sy < -26 || sy > GT_H + 26) continue;
      let zMeta = null;
      for (let zi = 0; zi < zlist.length; zi++) {
        const zm = zlist[zi], ox = zm.worldOffsetX, oy = zm.worldOffsetY || 0;
        if (cxw >= ox && cxw < ox + (zm.zoneWidth || 100000) && cyw >= oy && cyw < oy + (zm.zoneHeight || 100000)) { zMeta = zm; break; }
      }
      if (!zMeta) continue;
      if (isWaterAtAbs(cxw, cyw, zMeta) || isRockAtAbs(cxw, cyw, zMeta)) continue;   // 뭍 셀만
      for (let k = 0; k < 4; k++) {
        const nx = [1, -1, 0, 0][k], ny = [0, 0, 1, -1][k];
        if (!isWaterAtAbs(cxw + nx * 32, cyw + ny * 32, zMeta)) continue;
        const m = _shoreMargin(cx, cy, k);
        if (m < 1.2) continue;                       // ★여백 0 구간 — 풀이 물까지 간다(있어야 띠가 아니다)
        if (!bp) bp = t.createPattern(_shBladeMask(true), 'repeat');   // 잎 **모양** 알파(밝은 곳=잎)
        // 이웃(물) 다이아몬드를 **뭍 쪽으로** m 밀면, 뭍 다이아몬드와 겹치는 부분 = 공유 변에서 폭 m 띠
        const nsx = sx + (nx - ny) * 32, nsy = sy + (nx + ny) * 16;
        const ox = (-nx + ny) * m, oy = -(nx + ny) * m / 2;           // 뭍 방향 m
        t.save();
        dia(t, sx, sy); t.clip();                                     // 뭍 셀 밖으로 안 샌다
        t.fillStyle = '#fff'; dia(t, nsx + ox, nsy + oy); t.fill();   // 알파 = 여백 띠
        // ★안쪽 경계를 잎 모양으로 판다. '뭍 다이아몬드를 물 쪽으로 f·m 민 것' = 깊이 ≥ f·m 영역.
        t.globalCompositeOperation = 'destination-out';
        t.fillStyle = bp;
        t.globalAlpha = 1;    dia(t, sx - ox * 0.45, sy - oy * 0.45); t.fill();
        t.globalAlpha = 0.55; dia(t, sx - ox * 0.18, sy - oy * 0.18); t.fill();
        t.restore();
        strips.push([sx, sy, nsx + ox * 0.42, nsy + oy * 0.42]);
        n++;
      }
    }
    if (!n) return 0;
    // 색 입히기 — 마른 흙/모래 텍스처. 타일 원점이 주기의 배수라 **지면 바탕과 같은 위상**이다.
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = 1;
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = t.createPattern(GTEX.dry_angled, 'repeat'); t.fillRect(0, 0, GT_W, GT_H);
    // ★물에 닿는 쪽만 **젖은 모래**로 어둡게. 여백 전체를 어둡게 하면 그게 또 띠다 —
    //   마른 쪽(안)과 젖은 쪽(밖)이 갈려야 '모래톱'으로 읽힌다.
    for (const [sx, sy, wx2, wy2] of strips) {
      t.save();
      dia(t, sx, sy); t.clip();
      t.globalCompositeOperation = 'source-atop';
      t.fillStyle = 'rgba(62,56,44,0.30)';
      dia(t, wx2, wy2); t.fill();
      t.restore();
    }
    t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
    g.drawImage(_shTmp, 0, 0);
    // ★잎 층 투과율에서도 같은 만큼 지운다 — 안 하면 **모래 위에 풀잎이 흔들린다**
    //   (1패스 실측: 강가 항등식 평균 |Δ| 6.21 · 12.97% 어긋남. 초원은 0.395 라 여기가 범인이었다.)
    if (gm) gm.drawImage(_shTmp, 0, 0);
    return n;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[재민 지적 2026-08-06] "물가에서 풀의 튀어나온 부분이 물에 가려진다 — 3D가 아니라서 못 고치나?"
  //   **3D 문제가 아니다.** 원인은 클리핑과 순서다:
  //     ① `_bakeGroundTile` 이 풀 텍스처를 깔고, 물 셀 자리를 **진흙 다이아몬드로 덮어쓴다**
  //        ⇒ 풀잎이 셀 다이아몬드 변에서 **칼로 자른 듯** 끊긴다.
  //     ② 그 위에 물 셰이더가 또 덮는다.
  //   ⇒ 고치는 법: **같은 풀 텍스처를 물 쪽으로 조금 더 그리되, 물보다 나중에** 그린다.
  //      텍스처 자체가 이미 게임 카메라 각도로 구워져 있어 잎이 제대로 누워 있다 —
  //      우리가 할 일은 그 잎을 **셀 경계에서 자르지 않는 것**뿐이다.
  //
  //   ★심는 게 아니다. 포기를 새로 얹지 않는다 — 뭍 셀의 **자기 풀**을 물 위로 몇 px 넘길 뿐이다.
  //   ★층 3장(길이 다른 잎)으로 알파를 떨어뜨리고 자리 해시로 길이를 흩어 **가장자리를 너덜하게** 한다.
  //     한 겹 균일 띠로 그리면 물가에 초록 테이프를 붙인 것처럼 보인다.
  //   ★순서: 물 셰이더 → 프리즘 단면 → **여기(넘김)** → 물가 술 → 안개.
  //   ★1패스 실패 — 재민: "물가에 어색한 띠 같은 게 왜 생긴 거야.. 너무 부자연스럽잖아."
  //     맞다. 두 가지가 겹친 내 잘못이다:
  //       ⓐ **반투명으로 깔았다**(알파 .30/.55/.85). 반투명 초록을 밝은 물 위에 얹으면
  //          풀이 아니라 **뿌연 안개 띠**가 된다 — 잎이 아니라 색이 번진 것처럼 보인다.
  //       ⓑ **셀 다이아몬드를 통째로 밀었다.** 한 셀의 변 전체가 같은 폭으로 나가니
  //          결과가 **일정한 폭의 띠**다. 실루엣이 직선이면 뭘 해도 띠로 읽힌다.
  //     ⇒ 고침: **불투명하게** 깔고(잎이 있는 곳은 진짜 풀색), 바깥쪽을 **얼룩 마스크로 갉아**
  //       실루엣을 잎 단위로 부순다. 넘김 길이도 짧게(최대 7px) — 길수록 띠가 된다.
  //   ★★★결론(재민 3차 판정): **반려. 기본값 OFF(`shoreOff: true`).**
  //     3패스(잎 마스크)까지 가도 재민 판정은 *"after가 여전히 더 심해"* 였다.
  //     즉 넘김을 어떻게 다듬든 **물가에 띠가 하나 더 생기는 것**이 문제의 본질이다.
  //     ⇒ 코드는 손잡이 뒤에 남겨 둔다(`__terrain19.shoreOff = false` 로 켜진다). 켜지 마라.
  //     ⇒ ★재민 관측: "before도 좀 있고" — **넘김을 꺼도 남는 얇은 띠**가 있다. 그건 내 층이 아니라
  //       배치 19 `_drawPrisms` 의 **'상단 풀 넘김 립'**(프리즘 윗변의 밝은 초록 선)이다.
  //       거기가 진짜 손댈 자리다(회부 — 보고서 §6-d).
  const SH_PUSH = 7;               // 최대 넘김(px). 길면 '물 위에 뜬 풀'이 되고 띠로 읽힌다
  //     ★2패스도 실패했다 — 합성 얼룩(2px 격자 해시)으로 깎았더니 이번엔 **디더 격자 무늬**가 보였다.
  //       규칙적으로 반복되는 마스크는 무엇을 해도 '무늬'로 읽힌다.
  //     ⇒ 3패스: **풀 텍스처 자신의 잎 모양으로 깎는다.** 어두운 곳(잎 사이 틈)을 파내고
  //       밝은 곳(잎)만 남기면 실루엣이 **진짜 잎 끝**을 따라간다. 마스크는 풀과 **정합**돼야
  //       하므로 같은 변환 아래에서 같은 다이아몬드로 칠한다(translate 로 함께 민다).
  //   ★`inv=true` 는 **반대 알파**다(밝은 곳 = 잎 = 알파 1). 물가 여백이 모래를 **잎 모양으로**
  //     파낼 때 쓴다 — 잎 자리를 파야 풀잎이 모래 쪽으로 삐져나온다.
  const _shMaskCache = { 0: null, 1: null };
  function _shBladeMask(inv) {
    const key = inv ? 1 : 0;
    if (_shMaskCache[key]) return _shMaskCache[key];
    const src = GTEX.grass_angled;
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(src, 0, 0);
    const im = tg.getImageData(0, 0, w, h), d = im.data;
    // 중앙값 근처를 문턱으로 — 텍스처가 바뀌어도 따라간다(고정 문턱은 텍스처 교체에 깨진다)
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const mid = sum / (d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      // 어두울수록 많이 파낸다(잎 사이 틈) · 밝으면 남긴다(잎)   ※inv = 그 반대(잎 자리를 판다)
      let a = inv ? (lum - (mid - 6)) / 26 : (mid + 6 - lum) / 26;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = Math.round(a * 255);
    }
    tg.putImageData(im, 0, 0);
    _shMaskCache[key] = t; return t;
  }
  const _shoreTiles = new Map();
  function _bakeShoreTile(itx, ity, zlist) {
    const X0 = itx * GT_W, Y0 = ity * GT_H;
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const [ix, iy] of [[X0, Y0], [X0 + GT_W, Y0], [X0, Y0 + GT_H], [X0 + GT_W, Y0 + GT_H]]) {
      const wx = (2 * iy + ix) / 2, wy = (2 * iy - ix) / 2;
      if (wx < mnx) mnx = wx; if (wx > mxx) mxx = wx;
      if (wy < mny) mny = wy; if (wy > mxy) mxy = wy;
    }
    const c0x = Math.floor(mnx / 32) - 1, c1x = Math.ceil(mxx / 32) + 1;
    const c0y = Math.floor(mny / 32) - 1, c1y = Math.ceil(mxy / 32) + 1;
    let cv = null, g = null, pat = null, spat = null, n = 0;
    const dia = (gg, sx, sy) => { gg.beginPath(); gg.moveTo(sx, sy - 16); gg.lineTo(sx + 32, sy); gg.lineTo(sx, sy + 16); gg.lineTo(sx - 32, sy); gg.closePath(); };
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      const cxw = cx * 32 + 16, cyw = cy * 32 + 16;
      const sx = (cxw - cyw) - X0, sy = (cxw + cyw) / 2 - Y0;
      if (sx < -46 || sx > GT_W + 46 || sy < -26 || sy > GT_H + 26) continue;
      if (!isWaterAtAbs(cxw, cyw)) continue;                 // 넘김은 **물 셀 안에만** 그린다
      for (let k = 0; k < 4; k++) {
        const nx = [1, -1, 0, 0][k], ny = [0, 0, 1, -1][k];
        const lxw = cxw - nx * 32, lyw = cyw - ny * 32;
        if (isWaterAtAbs(lxw, lyw) || isRockAtAbs(lxw, lyw)) continue;
        if (!cv) {
          cv = document.createElement('canvas'); cv.width = GT_W; cv.height = GT_H;
          g = cv.getContext('2d');
          pat = g.createPattern(GTEX.grass_angled, 'repeat');   // 타일 원점이 주기의 배수 → 오프셋 0
          spat = g.createPattern(_shBladeMask(), 'repeat');      // 풀과 **정합**되는 잎 마스크
        }
        const lsx = (lxw - lyw) - X0, lsy = (lxw + lyw) / 2 - Y0;
        const d = SH_PUSH * (0.6 + 0.8 * _cellHash(cx, cy, 3100 + k));   // 자리별 길이 — 폭이 일정하면 띠다
        const ox = (nx * d) - (ny * d), oy = ((nx * d) + (ny * d)) / 2;
        g.save();
        dia(g, sx, sy); g.clip();                       // 물 셀 안으로만
        g.translate(ox, oy);                            // ★뭍의 풀을 **텍스처째** 민다(마스크와 정합)
        g.globalAlpha = 1;                              // ★불투명 — 반투명은 풀이 아니라 안개가 된다
        g.fillStyle = pat; dia(g, lsx, lsy); g.fill();
        // 잎 사이 틈을 파낸다 — 실루엣이 진짜 잎 끝을 따라간다(합성 얼룩은 격자 무늬가 된다)
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = spat;
        g.globalAlpha = 1;   dia(g, lsx + ox * 0.55, lsy + oy * 0.55); g.fill();  // 끝쪽 — 잎만 남는다
        g.globalAlpha = 0.5; dia(g, lsx, lsy); g.fill();                          // 안쪽 — 절반만 성글게
        g.restore();
        n++;
      }
    }
    return cv ? { cv, n } : { cv: null, n: 0 };
  }

  //   ★`gm` = 투과율 캔버스. 같은 도형·같은 알파로 지운다(destination-out) — T ×= (1−α).
  function _covDia(gm, cx, cy, alpha) {
    if (!gm || alpha <= 0) return;
    gm.globalAlpha = Math.min(1, alpha); gm.fillStyle = '#000';
    gm.beginPath(); gm.moveTo(cx, cy - 16); gm.lineTo(cx + 32, cy); gm.lineTo(cx, cy + 16); gm.lineTo(cx - 32, cy);
    gm.closePath(); gm.fill(); gm.globalAlpha = 1;
  }
  function _gtDiamond(g, cx, cy, color, alpha, gm) {
    if (alpha <= 0) return;
    g.globalAlpha = alpha; g.fillStyle = color;
    g.beginPath(); g.moveTo(cx, cy - 16); g.lineTo(cx + 32, cy); g.lineTo(cx, cy + 16); g.lineTo(cx - 32, cy);
    g.closePath(); g.fill(); g.globalAlpha = 1;
    if (gm) {
      gm.globalAlpha = alpha; gm.fillStyle = '#000';
      gm.beginPath(); gm.moveTo(cx, cy - 16); gm.lineTo(cx + 32, cy); gm.lineTo(cx, cy + 16); gm.lineTo(cx - 32, cy);
      gm.closePath(); gm.fill(); gm.globalAlpha = 1;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 20 실장 B] 타일 상태계 — 상태 벡터 → 레이어 합성
  //   재민 확정: *"비옥도에 따라 모든 타일이 디자인이 바뀌어야… 번영도·경작·길·채굴에 따라서도"*
  //              *"경계마다 딱딱 나누지 말고 연속적으로"*  *"돌만 놓으면 그게 산터냐"*
  //   축 5개(합성 순서): ①기반 바이옴×지질 ②채굴(=번영도 거울) ③비옥도 ④경작 ⑤답압(길)
  //   시안 정본: scripts/mock-fertility-gradient.js · mock-tile-axes.js (문턱·진폭 그대로).
  //   ★전이는 전부 smoothstep + **셀 노이즈로 흔든 문턱** — 균일 페이드가 아니라 뙈기로 번진다.
  //   ★Math.random() 금지: 소품 자리·문턱은 전부 셀 해시(결정론 — 프레임마다 안 흔들린다).
  // ═══════════════════════════════════════════════════════════════════════════
  const TS_SOIL_Q = 16;
  const _smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // 이웃이 상관된 저주파 잡음(뙈기) — 기준선과 **같은 1부**(public/soil-base.js)를 쓴다. 사본 금지.
  const _SB = () => (typeof SoilBase !== 'undefined' ? SoilBase : null);

  // 상태 조회 ─ 전부 존-로컬 셀 좌표. 동적 레코드가 없으면 기준선(정적 지형 파생)이다.
  function _tsSoil(lcx, lcy, kind, rec) {
    if (rec) return rec.v;
    const S = _SB(); return S ? S.baseAt(kind, lcx, lcy) : 800;
  }
  // 경작 셀 — farmland 건물 집합(그릴 때마다 건물 전체를 훑지 않게 캐시. 건물 수가 바뀌면 재구축)
  let _farmCells = null, _farmVer = -1;
  let _gtKnob = null;   // 손잡이 상태 지문 — 바뀌면 구워 둔 타일을 버린다
  function _tsFarmSet(pc) {
    if (!pc) return null;
    if (_farmCells && _farmVer === pc.buildings.size) return _farmCells;
    const s = new Set();
    for (const b of pc.buildings.values()) {
      if (b.type !== 'farmland') continue;
      s.add(Math.floor(b.x / CL_BUILDING_SIZE) + ',' + Math.floor(b.y / CL_BUILDING_SIZE));
    }
    _farmCells = s; _farmVer = pc.buildings.size;
    return s;
  }
  // 상태 변경분 적재 — `tile_state` 방송과 하네스 주입이 **같은 입구**를 쓴다(우회로 금지).
  //   flat = [cx,cy,qv,geo,ore,...] · qv<0 은 기준선 복귀(레코드 삭제).
  function _tsIngest(c, flat) {
    if (!c) return 0;
    if (!c.soil) c.soil = new Map();
    let n = 0;
    for (let i = 0; i + 4 < flat.length; i += 5) {
      const k = flat[i] + ',' + flat[i + 1];
      if (flat[i + 2] < 0) c.soil.delete(k);
      else c.soil.set(k, { v: flat[i + 2] * TS_SOIL_Q, geo: flat[i + 3] | 0, ore: flat[i + 4] | 0 });
      n++;
    }
    _gtInvalidateCells(c, flat, 5);   // ★바뀐 셀이 걸친 타일만 재베이크 — 전체 clear 는 히치다
    return n;
  }
  // ★★[날씨 축] econ 이 마을마다 돌리는 단기 날씨를 **땅에** 드러낸다.
  //   지금까지 `_weather` 는 서버 머릿속에만 있었다 — 가뭄이 들어 생산이 ×0.65 가 돼도
  //   지도에는 아무 일도 안 일어났다. 서버가 **econ 이 실제로 쓰는 fertility 계수를 그대로**
  //   보내오므로(사본 없음), 여기서는 그 수로 **유효 토양치**를 곱하기만 한다:
  //     soilEff = soil × (1 + (fert − 1) × 감쇠)
  //   ⇒ 가뭄이 들면 그 마을 들판이 마르고, 끝나면 돌아온다. 저장은 한 바이트도 안 늘어난다
  //     (동적 토양치는 그대로 — 날씨는 **렌더 전용 유효값**이다. 두 번째 진실을 만들지 않는다).
  const WX_FALL = 0.72;        // 이 비율까지는 온전히, 그 밖으로 1.0 까지 부드럽게 사라진다
  // ★날씨 세기 — econ 계수를 **그대로 곱하면 과하다.** 실측: 토양치 760 에 가뭄(×0.65)을 곱하면
  //   494 가 되는데, 풀 램프의 가파른 구간(430~980) 한복판이라 초록이 78% → **0.5%** 로 무너졌다.
  //   7~14일짜리 가뭄이 마을 들판을 사막으로 만드는 건 고증도 의도도 아니다.
  //   ⇒ econ 계수는 **생산**에 걸리는 값이지 그림의 세기가 아니다. 부호와 비율은 그대로 두고
  //     진폭만 눌러 "마른다/짙어진다"로 읽히게 한다(가뭄이면 유효 토양치 ×0.86 쯤).
  const WX_STRENGTH = 0.40;
  function _wxRadiusPx(v) { return Math.max(v.tr || 0, v.r || 0, 640) * 1.25; }
  // 날씨 변경분 적재 — `sim_village_day` 방송과 하네스 주입이 **같은 입구**를 쓴다(우회로 금지).
  //   wxMap: { 마을id → [이름, fertility계수] | null }
  function _wxIngest(c, wxMap) {
    if (!c || !c.simVillages || !wxMap) return 0;
    let changed = 0;
    for (const v of c.simVillages) {
      const nw = wxMap[v.id] !== undefined ? (wxMap[v.id] || null) : (v.wx || null);
      const ow = v.wx || null;
      if ((!nw && !ow) || (nw && ow && nw[0] === ow[0] && nw[1] === ow[1])) continue;
      v.wx = nw; changed++;
      _gtInvalidateAround(c, v.cx, v.cy, _wxRadiusPx(v));   // 그 마을 둘레 타일만
    }
    return changed;
  }
  function _wxListOf(c) {      // 날씨가 걸린 마을만 — 보통 0~5곳이라 셀당 비용이 사실상 0
    if (!c || !c.simVillages || _t19.wxOff) return null;
    const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
    let out = null;
    for (const v of c.simVillages) {
      if (!v.wx || !(v.wx[1] >= 0) || v.wx[1] === 1) continue;   // 안개처럼 fertility 안 건드리는 건 땅에 안 그린다
      const R = _wxRadiusPx(v);
      (out || (out = [])).push({ x: ox + v.cx * CL_BUILDING_SIZE + 16, y: oy + v.cy * CL_BUILDING_SIZE + 16, R, f: v.wx[1] });
    }
    return out;
  }
  function _wxMulAt(list, wx2, wy2) {
    if (!list) return 1;
    let m = 1;
    for (let i = 0; i < list.length; i++) {
      const w = list[i], dx = wx2 - w.x, dy = wy2 - w.y;
      const d = Math.sqrt(dx * dx + dy * dy); if (d >= w.R) continue;
      const t = 1 - _smooth(w.R * WX_FALL, w.R, d);        // 안쪽은 1, 가장자리로 갈수록 0
      const mm = 1 + (w.f - 1) * t * WX_STRENGTH;
      if (Math.abs(mm - 1) > Math.abs(m - 1)) m = mm;      // 겹치면 **더 센 쪽**이 이긴다(합치면 과장된다)
    }
    return m;
  }
  // 월드 원(중심·반경 px) 안의 타일을 버린다 — 날씨가 바뀐 마을 둘레만.
  function _gtInvalidateAround(c, vcx, vcy, rPx) {
    if (!c || !c.meta) return;
    const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
    const wx2 = ox + vcx * CL_BUILDING_SIZE + 16, wy2 = oy + vcy * CL_BUILDING_SIZE + 16;
    // 월드 원 → iso 로 보내면 마름모라, 그 외접 사각형의 타일을 전부 버린다(넉넉히·안전하게)
    const c0 = w2i(wx2 - rPx, wy2 - rPx), c1 = w2i(wx2 + rPx, wy2 - rPx);
    const c2 = w2i(wx2 - rPx, wy2 + rPx), c3 = w2i(wx2 + rPx, wy2 + rPx);
    const xs = [c0.x, c1.x, c2.x, c3.x], ys = [c0.y, c1.y, c2.y, c3.y];
    const t0x = Math.floor(Math.min(...xs) / GT_W), t1x = Math.floor(Math.max(...xs) / GT_W);
    const t0y = Math.floor(Math.min(...ys) / GT_H), t1y = Math.floor(Math.max(...ys) / GT_H);
    for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) _groundTiles.delete(tx + '_' + ty);
  }
  // 바뀐 셀이 걸친 타일만 버린다 — 전체 clear 는 화면 전체 재베이크라 히치가 된다.
  function _gtInvalidateCells(c, flat, stride) {
    if (!flat || !flat.length || !c || !c.meta) return;
    const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
    const seen = new Set();
    for (let i = 0; i + 1 < flat.length; i += stride) {
      const wx = (ox / CL_BUILDING_SIZE + flat[i] + 0.5) * 32, wy = (oy / CL_BUILDING_SIZE + flat[i + 1] + 0.5) * 32;
      const ix = wx - wy, iy = (wx + wy) / 2;
      // 셀 다이아(64×32)가 타일 경계를 걸칠 수 있어 ±반셀 네 귀퉁이를 전부 무효화한다
      for (const [dx, dy] of [[-32, -16], [32, -16], [-32, 16], [32, 16]]) {
        const k = Math.floor((ix + dx) / GT_W) + '_' + Math.floor((iy + dy) / GT_H);
        if (seen.has(k)) continue; seen.add(k); _groundTiles.delete(k);
      }
    }
  }

  // 한 셀의 상태 레이어를 타일 캔버스에 얹는다. sx,sy = 타일 안 셀 중심.
  //   pat: 이 타일에 이미 만들어 둔 패턴들(타일당 1회 생성 — 셀마다 createPattern 하면 베이크가 3배 느려진다)
  //   ★[풀 카펫 흔들림] `gm` 은 잎 층의 **투과율** 캔버스다. 이 함수의 칠 로직은 한 줄도 안 바꾼다 —
  //     각 갈래가 **실제로 덮는 총 알파**를 그 갈래에서 이미 계산하고 있으므로, 그 값으로
  //     같은 다이아몬드를 지우기만 한다. (산터는 불투명 → 1)
  function _gtPaintState(g, sx, sy, st, lcx, lcy, pat, bio, gm) {
    const S = _SB(); if (!S) return;
    const B = bio || S.biomeOf('forest');   // ★바이옴 램프 표 — 같은 토양치라도 땅마다 다르게 번역된다
    const clip = () => { g.save(); g.beginPath(); g.moveTo(sx, sy - 16); g.lineTo(sx + 32, sy); g.lineTo(sx, sy + 16); g.lineTo(sx - 32, sy); g.closePath(); g.clip(); };
    const fillPat = (p, a) => { if (a <= 0.004) return; g.globalAlpha = Math.min(1, a); g.fillStyle = p; g.fillRect(sx - 33, sy - 17, 66, 34); g.globalAlpha = 1; };
    // 문턱을 흔드는 저주파 잡음 — 셀 좌표계(4.8셀 규모 얼룩 = 시안의 x/38 과 같은 눈)
    const nz = S.vnoise(lcx / 4.8, lcy / 4.8), nz2 = S.vnoise(lcx / 1.7 + 31, lcy / 1.7 + 7);
    const jit = (nz - 0.5) * 260 + (nz2 - 0.5) * 90;

    if (st.geo) {
      _covDia(gm, sx, sy, 1);            // 산터는 암반으로 통째로 덮는다 — 잎 0
      // ── ①-지질: 산터 램프 ────────────────────────────────────────────────
      //   ★재민: "돌만 놓으면 그게 산터냐" — 기본 재질이 **암반**이다. 비옥도는 이끼·틈새 풀만
      //     늘리고 **풀밭이 되지 않는다**(상한). 시안 정본 mock-fertility-gradient 줄 2 그대로.
      clip();
      g.fillStyle = '#6b665e'; g.fillRect(sx - 33, sy - 17, 66, 34);
      for (let k = 0; k < 14; k++) {                       // 부순 돌 알갱이
        const rx = sx - 30 + S.hash(lcx, lcy, 81 + k) * 60, ry = sy - 15 + S.hash(lcx, lcy, 141 + k) * 30;
        g.fillStyle = S.hash(lcx, lcy, 201 + k) < 0.5 ? 'rgba(52,49,44,0.5)' : 'rgba(122,116,106,0.45)';
        g.fillRect(rx, ry, 2 + 4 * S.hash(lcx, lcy, 261 + k), 1.6 + 3 * S.hash(lcx, lcy, 321 + k));
      }
      for (let k = 0; k < 3; k++) {                        // 균열
        let px = sx - 28 + S.hash(lcx, lcy, 86 + k) * 56, py = sy - 14 + S.hash(lcx, lcy, 96 + k) * 12;
        g.strokeStyle = 'rgba(38,35,31,0.7)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(px, py);
        for (let s2 = 0; s2 < 3; s2++) { px += (S.hash(lcx * 7 + s2, lcy, 88 + k) - 0.5) * 18; py += 4 + S.hash(lcx * 7 + s2, lcy, 89 + k) * 8; g.lineTo(px, py); }
        g.stroke();
      }
      // 이끼 — 자리별 고유 문턱 400~950, 문턱 근처 ±90 에서 연속 증가(정수 개수 계단 없음)
      for (let k = 0; k < 5; k++) {
        const px = sx - 26 + S.hash(lcx, lcy, 91 + k) * 52, py = sy - 12 + S.hash(lcx, lcy, 111 + k) * 24;
        const thr = B.rock[0] + (B.rock[1] - B.rock[0]) * S.hash(lcx, lcy, 131 + k);
        const a = _smooth(thr, thr + 90, st.soil) * (0.28 + 0.3 * S.hash(lcx, lcy, 151 + k));
        if (a > 0.02) { g.fillStyle = 'rgba(74,96,52,' + a.toFixed(3) + ')'; g.beginPath(); g.ellipse(px, py, 3 + 7 * S.hash(lcx, lcy, 171 + k), 2 + 4 * S.hash(lcx, lcy, 191 + k), 0, 0, 6.3); g.fill(); }
      }
      // 틈새 풀 — 문턱 780~1000. ★상한이 낮아 토양치 1000 이어도 초원이 되지 않는다.
      for (let k = 0; k < 2; k++) {
        const px = sx - 20 + S.hash(lcx, lcy, 97 + k) * 40, py = sy - 8 + S.hash(lcx, lcy, 98 + k) * 16;
        const thr = 780 + 220 * S.hash(lcx, lcy, 99 + k);
        const a = _smooth(thr, thr + 70, st.soil);
        if (a > 0.02) {
          g.globalAlpha = a; g.strokeStyle = B.propG[(S.hash(lcx, lcy, 100 + k) * 2) | 0]; g.lineWidth = 1.3;
          for (let b3 = 0; b3 < 3; b3++) {
            const oxp = (S.hash(lcx, lcy, 101 + k * 3 + b3) - 0.5) * 5, hgt = (5 + 6 * S.hash(lcx, lcy, 111 + k * 3 + b3)) * a, ln = (S.hash(lcx, lcy, 121 + k * 3 + b3) - 0.5) * 5;
            g.beginPath(); g.moveTo(px + oxp, py); g.quadraticCurveTo(px + oxp + ln * 0.4, py - hgt * 0.6, px + oxp + ln, py - hgt); g.stroke();
          }
          g.globalAlpha = 1;
        }
      }
      g.restore();
      return;
    }

    // ── ③-비옥도: 일반 타일 램프 ─────────────────────────────────────────────
    //   바탕(풀)은 이미 타일에 깔려 있다. 여기서는 **깎아 내려간다** — 시안과 같은 연속 함수의
    //   여집합이라 그림은 같고, 대부분(토양치 높음)의 셀에서 비용이 0 이다.
    const x = st.soil + jit;
    // ★바이옴 표의 문턱을 쓴다. capG 는 **초록 상한** — 사막이 토양치 1000 이어도 초원이 되지
    //   않는다(산터 램프와 같은 사고: "돌만 놓으면 그게 산터냐" 의 바이옴판).
    const grA0 = _smooth(B.grass[0], B.grass[1], x) * B.capG;
    const dryA = 1 - grA0;
    const mudA = 1 - _smooth(B.dry[0], B.dry[1], x);
    // ── ⑤-답압(길): 가운데부터 다져진다(mock-tile-axes 줄 1) ─────────────────
    const wearA = st.road === 2 ? 0.88 : (st.road === 1 ? _smooth(0, 1, 0.42 + (nz - 0.5) * 0.5) : 0);
    // ── ④-경작: 갈아엎은 흙 + 이랑(mock-tile-axes 줄 2) ─────────────────────
    const tillA = st.till > 0 ? _smooth(120, 520, st.till + (nz - 0.5) * 220) : 0;
    // ── ②-채굴(번영도 거울): 판 자리는 흙이 드러나고 어두워진다 ────────────────
    const oreA = st.ore < 15 ? (15 - st.ore) / 15 : 0;

    const anyMud = Math.max(mudA, wearA, tillA, oreA * 0.42);   // ★채굴분의 흙 알파를 낮춘다 — 매끈한 밝은 흙이 되면 '판 데'가 아니라 그냥 맨땅이다
    if (dryA <= 0.004 && anyMud <= 0.004) return;          // 손댈 게 없다(라이브 대다수가 여기)
    _covDia(gm, sx, sy, 1 - (1 - dryA) * (1 - anyMud));   // 두 층이 덮고 남긴 투과율만큼 잎도 줄어든다
    clip();
    if (dryA > 0.004) fillPat(pat.dry, dryA);
    if (anyMud > 0.004) fillPat(pat.mud, anyMud);
    if (wearA > 0.5) { g.globalAlpha = (wearA - 0.5) * 0.5; g.fillStyle = '#8a7a5e'; g.fillRect(sx - 33, sy - 17, 66, 34); g.globalAlpha = 1; }   // 다져진 흙 밝힘
    if (oreA > 0.2) {
      // ★판 자리는 **판 자국**이어야 한다 — 첫 실장은 매끈한 밝은 흙이라 "판 데"로 안 읽혔다
      //   (실측: 휘도가 96 → 109 로 **밝아졌다**). 부순 돌 알갱이 + 그늘로 파헤친 결을 준다.
      g.globalAlpha = oreA * 0.58; g.fillStyle = '#3a332b'; g.fillRect(sx - 33, sy - 17, 66, 34); g.globalAlpha = 1;
      const S2 = _SB();
      for (let k = 0; k < 10; k++) {
        if (S2.hash(lcx, lcy, 611 + k) > oreA) continue;    // 많이 팔수록 자갈이 는다(연속)
        const rx = sx - 28 + S2.hash(lcx, lcy, 621 + k) * 56, ry = sy - 13 + S2.hash(lcx, lcy, 641 + k) * 26;
        g.fillStyle = S2.hash(lcx, lcy, 661 + k) < 0.5 ? 'rgba(46,42,36,0.62)' : 'rgba(128,120,108,0.5)';
        g.fillRect(rx, ry, 2 + 3.5 * S2.hash(lcx, lcy, 681 + k), 1.4 + 2.6 * S2.hash(lcx, lcy, 701 + k));
      }
    }
    if (st.till > 0) {  // 이랑 — 경작 진행에 따라 또렷해짐. iso 다이아 결을 따르는 대각선.
      const rA = _smooth(350, 950, st.till);
      if (rA > 0.01) {
        g.globalAlpha = rA * 0.55;
        for (let d = -16; d <= 16; d += 6.5) {
          g.strokeStyle = '#4a3a26'; g.lineWidth = 2.2;
          g.beginPath(); g.moveTo(sx - 32, sy + d + 16); g.lineTo(sx + 32, sy + d - 16); g.stroke();
          g.strokeStyle = 'rgba(150,124,90,0.8)'; g.lineWidth = 1.1;
          g.beginPath(); g.moveTo(sx - 32, sy + d + 13.5); g.lineTo(sx + 32, sy + d - 18.5); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
    if (B.tintA > 0) { g.globalAlpha = B.tintA; g.fillStyle = B.tint; g.fillRect(sx - 33, sy - 17, 66, 34); g.globalAlpha = 1; }   // 바이옴 식생 색조
    // 소품 — **자리별 고유 문턱**(해시) + 문턱 근처에서 알파·크기 연속 증가(정수 계단 제거)
    for (let k = 0; k < 2; k++) {
      const px = sx - 24 + S.hash(lcx, lcy, 11 + k) * 48, py = sy - 10 + S.hash(lcx, lcy, 21 + k) * 20;
      const thrR = 400 * S.hash(lcx, lcy, 31 + k);                    // 자갈: 척박할수록 드러난다
      const aR = 1 - _smooth(thrR, thrR + 80, st.soil);
      if (aR > 0.03) {
        const rr = (2.2 + 2.6 * S.hash(lcx, lcy, 41 + k)) * (0.5 + 0.5 * aR);
        g.globalAlpha = Math.min(1, aR); g.fillStyle = B.propR;
        g.beginPath(); g.ellipse(px, py, rr, rr * 0.62, 0, 0, 6.3); g.fill();
        g.fillStyle = 'rgba(48,45,41,0.55)'; g.beginPath(); g.ellipse(px, py + rr * 0.35, rr * 0.9, rr * 0.35, 0, 0, 6.3); g.fill();
        g.globalAlpha = 1;
      }
      const thrT = 700 + 300 * S.hash(lcx, lcy, 51 + k);              // 풀포기: 비옥해지면 돋는다
      const aT = _smooth(thrT, thrT + 60, st.soil) * (1 - Math.max(wearA, tillA));
      if (aT > 0.03) {
        g.globalAlpha = aT; g.lineWidth = 1.3;
        g.strokeStyle = B.propG[(S.hash(lcx, lcy, 61 + k) * 3) | 0];
        for (let b3 = 0; b3 < 3; b3++) {
          const oxp = (S.hash(lcx, lcy, 71 + k * 3 + b3) - 0.5) * 6, hgt = (6 + 8 * S.hash(lcx, lcy, 81 + k * 3 + b3)) * aT, ln = (S.hash(lcx, lcy, 91 + k * 3 + b3) - 0.5) * 6;
          g.beginPath(); g.moveTo(px + oxp, py); g.quadraticCurveTo(px + oxp + ln * 0.4, py - hgt * 0.6, px + oxp + ln, py - hgt); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
    g.restore();
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 19 실장 B] 물 — 흐름맵 + WebGL 셰이더 레이어
  //   재민 확정 문법(시안 왕복 13회):
  //     ① 수면 = 지면 −5px 평면. 내 자리가 뭍이면 뭍 / 5px 위 표본이 뭍이면 단면 / 둘 다 물이면 수면.
  //     ② 얕은물 투명. 물밑 바닥 = **진흙 재질**(풀이 비치면 "반투명 풀" 사건). wa = 0.42+0.58×수심.
  //     ③ 블록 프리즘 단면은 **벡터**로 그린다(픽셀 패스가 아니라 — 아래 _drawPrisms).
  //     ④ 흐름맵 셰이더 물(유체 시뮬 아님·M&B 문법). 방향 = rivers path 최근접 구간(상류→하류).
  //        하구에서 감쇠 → 호수는 무방향. 바다는 해안 거리장 방향.
  //     ⑤ 포말 = **시간 고정**(흐르면 꼭짓점에서 깜빡인다) · 뭍이 북서일 때만 · 기울기 크기 문턱.
  //   ★물가는 **각진 블록**이다 — 셀 경계 그대로(곡선 스무딩 금지. 물길 파기와 문법 통일).
  //     ⇒ 마스크는 NEAREST 텍스처, 흐름·수심은 LINEAR 텍스처로 **따로** 보낸다.
  const WF_N = 128;              // 흐름/수심 텍스처 한 변(셀) — 화면(약 50셀)보다 넉넉
  const WF_QUANT = 16;           // 원점 양자화(셀) — 이만큼 움직여야 다시 굽는다
  const WATER_DROP = 5;          // ★재민 확정: 수면은 지면보다 5px 아래
  const WF_DEPTH_MAX = 6;        // 수심 정규화 상한(셀)
  // ★한 프레임에 물 판정에 쓰는 **시간** 상한(물가 렉 수리). 개수가 아니라 시간인 이유는
  //   아래 _buildFlowTex 주석 참조. 남은 칸은 다음 프레임에 마저 묻는다(_wfCache.pending).
  const WF_ASK_MS = 9;
  // ★물어볼 반경(셀). 창(WF_N=128, 반경 64)은 화면보다 **한참** 크다:
  //   iso 1400×900 화면의 월드 AABB 반경은 (2·450+700)/2 = 800px = **25셀**이고,
  //   원점이 WF_QUANT(16셀) 로 양자화돼 카메라가 중심에서 최대 8셀 어긋난다 ⇒ 33셀이면 덮는다.
  //   나머지 바깥 링은 **영영 안 물어본다** — 화면에 절대 안 나오는데 셀당 75µs 를 무는 건 순손실이고,
  //   그 링까지 채우려 들면 미결이 안 끝나 흐름 텍스처를 매 프레임 다시 굽게 된다(실측 92프레임 미수렴).
  const WF_ASK_R = 40;
  // 창 가운데부터 바깥으로 나가는 순회 순서(창 크기가 고정이라 한 번만 만든다 · 반경 밖은 제외)
  let _wfOrd = null;
  function _wfOrder(N) {
    if (_wfOrd && _wfOrd.N === N) return _wfOrd.a;
    const c = (N - 1) / 2, list = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const d = Math.max(Math.abs(i - c), Math.abs(j - c));   // 체비셰프 = 정사각 링
      if (d > WF_ASK_R) continue;
      list.push([j * N + i, d]);
    }
    list.sort((p, q2) => p[1] - q2[1]);
    _wfOrd = { N, a: Int32Array.from(list.map((v) => v[0])) };
    return _wfOrd.a;
  }
  const _wfCache = { key: null, ox: 0, oy: 0, bbox: null, rect: null, pending: false };
  let _flowCellCache = new Map();     // "cx_cy" → [dx,dy] (정적 — rivers 는 안 변한다)
  let _flowCellOld = new Map();       // 직전 세대(상한 초과 시 통째 clear 대신 밀어낸다 — 아래 주석)
  let _riverSegs = null;
  let _hardTerrain = null;   // /terrain.json 원본(위 선로딩이 채운다) — rivers path 의 유일한 출처
  function _buildRiverSegs() {
    // ★흐름 방향의 정본은 `hanbando-terrain.json` 의 rivers path 다(상류→하류 순서로 저장돼 있다).
    //   서버가 welcome 으로 준 hardcoded terrain 을 그대로 읽는다 — 사본을 만들지 않는다.
    _riverSegs = [];
    try {
      const H = _hardTerrain;
      for (const zid in (H || {})) {
        const z = zonesMeta[zid]; if (!z) continue;
        const ox = z.worldOffsetX, oy = z.worldOffsetY || 0;
        for (const r of (H[zid].rivers || [])) {
          for (let i = 0; i + 1 < r.path.length; i++) {
            const a = r.path[i].pos, b = r.path[i + 1].pos;
            // 마지막 마디 = 하구 — 그 근처는 흐름을 감쇠시킨다(호수·바다는 무방향)
            _riverSegs.push([ox + a[0], oy + a[1], ox + b[0], oy + b[1], i / Math.max(1, r.path.length - 2)]);
          }
        }
      }
    } catch (e) { console.warn('[water] rivers 읽기 실패:', e.message); }
    return _riverSegs;
  }
  // ★★[배치 20 B 성능 수리 — 재민 실기 제보 "물 근처로 가니까 엄청나게 렉걸린다"]
  //   원인: `_flowAtCell` 이 셀마다 **강 구간 전체**(한반도 4,700+ 개)를 훑었다. 흐름 텍스처는
  //   128×128 = 16,384 셀이고 카메라가 16셀(512px) 움직일 때마다 통째로 다시 굽는다 ⇒ 새 지역에
  //   들어서면 한 프레임 안에서 최대 **7,700만 번**의 구간 거리 계산이 메인스레드에서 돈다.
  //   헤드리스 E2E 가 이걸 못 잡은 이유: 촬영을 **고정 지점**에서 했다 — 걷지 않으니 캐시가
  //   식지 않는다. 계측기가 실사용의 그 동작을 안 했다(하네스 오류 7건째. 판정이 아니라 대본이 틀렸다).
  //
  //   수리: 강 구간 **공간 격자 색인**. 결과는 한 비트도 안 바뀐다 —
  //   1400px 밖은 어차피 가중치 0(무방향)이라, 1400 반경 안만 뒤져도 '최근접'이 같기 때문이다.
  const FLOW_R = 1400;                 // 이보다 멀면 흐름 0 (아래 w 식과 같은 수 — 사본 아님)
  const _segGrid = { B: 1024, map: null, built: 0 };
  function _buildSegGrid(segs) {
    // ★등록은 구간의 **AABB 가 겹치는 칸 전부**. 이게 동치의 증명이다:
    //   최근접점 q 는 반드시 구간의 AABB 안에 있고, |q−p| ≤ 1400 이면 bucket(q) 는 아래 탐색
    //   범위 안이다 ⇒ 그 구간은 반드시 후보에 들어온다. (구간 위 점을 성기게 표본해 등록하면
    //   대각으로 스쳐 지나는 칸을 빠뜨린다 — 실측 5,000점 중 33점 불일치로 잡았다.)
    const B = _segGrid.B, m = new Map();
    for (let i = 0; i < segs.length; i++) {
      const s2 = segs[i];
      const x0 = Math.floor(Math.min(s2[0], s2[2]) / B), x1 = Math.floor(Math.max(s2[0], s2[2]) / B);
      const y0 = Math.floor(Math.min(s2[1], s2[3]) / B), y1 = Math.floor(Math.max(s2[1], s2[3]) / B);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const k = gx + ',' + gy; let a = m.get(k); if (!a) m.set(k, a = []); a.push(i);
      }
    }
    _segGrid.map = m; _segGrid.built = segs.length;
    return m;
  }
  function _flowAtCell(cx, cy) {
    const k = cx + '_' + cy;
    const hit = _flowCellCache.get(k); if (hit) return hit;
    const old = _flowCellOld.get(k); if (old) { _flowCellCache.set(k, old); return old; }   // 세대 승격
    const segs = _riverSegs || _buildRiverSegs();
    if (!_segGrid.map || _segGrid.built !== segs.length) _buildSegGrid(segs);
    const px = cx * 32 + 16, py = cy * 32 + 16;
    const B = _segGrid.B;
    const _slow = !!_t19.slowFlow;   // 대조군: 색인 무시하고 전 구간 훑기(수리 전과 같은 비용)
    const g0x = _slow ? 0 : Math.floor((px - FLOW_R) / B), g1x = _slow ? -1 : Math.floor((px + FLOW_R) / B);
    const g0y = Math.floor((py - FLOW_R) / B), g1y = Math.floor((py + FLOW_R) / B);
    let best = Infinity, bx = 0, by = 0, bi = Infinity;
    if (_slow) {
      for (let si = 0; si < segs.length; si++) {
        const s2 = segs[si], ax = s2[0], ay = s2[1], dx = s2[2] - ax, dy = s2[3] - ay;
        const L2 = dx * dx + dy * dy || 1;
        let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = ax + t * dx - px, qy = ay + t * dy - py, d = qx * qx + qy * qy;
        if (d < best) { best = d; const L = Math.sqrt(L2); bx = dx / L; by = dy / L; }
      }
    }
    for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
      const arr = _segGrid.map.get(gx + ',' + gy); if (!arr) continue;
      for (let n = 0; n < arr.length; n++) {
        const si = arr[n], s2 = segs[si], ax = s2[0], ay = s2[1], dx = s2[2] - ax, dy = s2[3] - ay;
        const L2 = dx * dx + dy * dy || 1;
        let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = ax + t * dx - px, qy = ay + t * dy - py, d = qx * qx + qy * qy;
        // ★동률은 **구간 번호가 작은 쪽**으로 깬다 — 폴리라인의 이웃 두 구간은 공유 꼭짓점에서
        //   거리가 정확히 같고 방향은 다르다. 전수 순회(번호순)와 답을 맞추려면 이 규칙이 필요하다.
        //   (이걸 안 넣으면 7,000 표본 중 4점이 갈렸다 — 전부 꼭짓점 최근접 점이었다.)
        if (d < best || (d === best && si < bi)) { best = d; bi = si; const L = Math.sqrt(L2); bx = dx / L; by = dy / L; }
      }
    }
    // 강에서 멀면(호수·먼바다) 흐름 0 — 무방향 파문이 된다
    const dist = Math.sqrt(best);
    const w = dist > FLOW_R ? 0 : (dist > 700 ? (FLOW_R - dist) / 700 : 1);
    const v = [bx * w, by * w];
    // ★전체 clear 금지 — 긴 강을 따라 걸으면 상한에서 캐시가 통째로 날아가 폭풍 재계산이 된다.
    //   두 세대로 굴린다: 상한을 넘으면 현 세대를 구 세대로 밀고 현 세대만 비운다(작업 집합 생존).
    if (_flowCellCache.size > 200000) { _flowCellOld = _flowCellCache; _flowCellCache = new Map(); }
    _flowCellCache.set(k, v);
    return v;
  }
  const _wfPrev = { ox: 0, oy: 0, wet: null };
  const _ZERO2 = [0, 0];   // 물 아닌 셀마다 배열을 새로 만들면 16,384개/장이 GC 로 간다
  function _buildFlowTex(gl, ocx, ocy) {
    // 수심 = 물가 거리장(BFS) → 3×3 평균 스무딩. 마스크는 셀 그대로(각진 블록).
    const N = WF_N, wet = new Uint8Array(N * N), dep = new Float32Array(N * N).fill(255);
    const q = new Int32Array(N * N); let qh = 0, qt = 0;
    // ★★[성능 수리 2/2] 물 판정 재사용 — `isWaterCellLocal` 은 셀당 20µs 급이라 16,384셀이면
    //   **331ms**(실측). 창은 WF_QUANT(16셀)씩만 움직이므로 직전 창과 87% 가 겹친다.
    //   겹치는 칸은 다시 묻지 않고 베껴 온다 ⇒ 걷는 동안의 비용이 1/8 로 떨어진다.
    //   (판정 자체는 그대로다 — 같은 셀의 답은 정적이라 베껴도 정본과 어긋날 수 없다.)
    // ★★[성능 수리 2/2 — 진범] 물 판정이 이 함수 비용의 **95%** 다(실측 분해: 총 435ms 중 399ms).
    //   `Terrain.isWaterCellLocal` 은 셀마다 강·호수 전체를 훑어 브라우저에서 셀당 ~75µs 다.
    //   ⚠그 함수는 **콜라이더 정본**이라 한 바이트도 못 고친다 — 고치면 이동·스폰·econ 이 흔들린다.
    //   ⇒ 렌더 쪽에서 두 겹으로 푼다:
    //     ① 직전 창과 겹치는 칸은 다시 묻지 않는다(주행 한 칸이면 76% 가 겹친다).
    //     ② 새로 물어야 할 칸은 **한 프레임에 정해진 개수까지만**. 남은 칸은 '아직 모름'(2)으로
    //        두고 다음 프레임에 마저 묻는다. 모르는 칸은 물을 안 그린다 —
    //        WF_N(128셀)은 화면(약 44셀)보다 훨씬 커서 미결 칸은 **화면 밖 여백**에 생긴다.
    //     ⇒ 한 프레임 400ms 정지 대신 몇 프레임에 나눠 진다.
    // wet 값: 0=뭍 · 1=물 · 2=아직 모름(다음 프레임에 다시 묻는다)
    const P = _t19.slowFlow ? null : _wfPrev.wet, dxp = ocx - _wfPrev.ox, dyp = ocy - _wfPrev.oy;
    let reused = 0, asked = 0, pending = 0;
    const _tw0 = performance.now();
    // ⓐ 겹치는 칸 베끼기 — 여기는 예산 밖이다(공짜).
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const pi = i + dxp, pj = j + dyp;
      const pv = (P && pi >= 0 && pj >= 0 && pi < N && pj < N) ? P[pj * N + pi] : 2;
      wet[j * N + i] = pv; if (pv !== 2) reused++;
    }
    // ⓑ 남은 칸을 **가운데부터** 묻는다. ★순서가 중요하다: 창(128셀)은 화면(약 44셀)보다 훨씬
    //   커서, 위에서부터 채우면 예산이 **화면 밖 여백**에 다 쓰이고 정작 눈앞의 물이 몇 프레임
    //   비어 보인다. 가운데부터 채우면 화면 안이 먼저 정해진다(그리고 화면 안 셀은 지면 베이크가
    //   이미 물어봐 캐시에 있어 사실상 공짜다).
    //   예산은 **개수가 아니라 시간**이다 — 캐시 적중은 거의 0µs 라, 개수로 끊으면 싼 칸까지
    //   막아 수렴이 느려진다.
    const ord = _wfOrder(N);
    const slow = !!_t19.slowFlow, tEnd = _tw0 + WF_ASK_MS;
    const M = slow ? N * N : ord.length;      // 대조군은 수리 전과 똑같이 **창 전체**를 묻는다
    for (let n = 0; n < M; n++) {
      const o = slow ? n : ord[n];
      if (wet[o] !== 2) continue;
      if (!slow && (n & 63) === 0 && performance.now() > tEnd) break;   // 64칸마다 시계 확인(초과분 상한)
      const i = o % N, j = (o / N) | 0;
      asked++; wet[o] = isWaterAtAbs((ocx + i) * 32 + 16, (ocy + j) * 32 + 16) ? 1 : 0;
    }
    // 미결 집계는 **물어볼 반경 안만** 센다(바깥 링은 애초에 안 묻기로 한 곳이라 미결이 아니다).
    for (let n = 0; n < M; n++) if (wet[slow ? n : ord[n]] === 2) pending++;
    for (let o = 0; o < N * N; o++) if (wet[o] !== 1) { dep[o] = 0; q[qt++] = o; }   // 뭍·미결은 거리장 원점
    _wfPrev.ox = ocx; _wfPrev.oy = ocy; _wfPrev.wet = wet;
    window.__wfReuse = reused; window.__wfAsked = asked; window.__wfPending = pending;
    window.__wfWetMs = performance.now() - _tw0;
    while (qh < qt) {   // 뭍에서 퍼지는 거리장
      const p2 = q[qh++], i = p2 % N, j = (p2 / N) | 0, d = dep[p2] + 1;
      if (d > WF_DEPTH_MAX) continue;
      if (i > 0 && dep[p2 - 1] > d) { dep[p2 - 1] = d; q[qt++] = p2 - 1; }
      if (i < N - 1 && dep[p2 + 1] > d) { dep[p2 + 1] = d; q[qt++] = p2 + 1; }
      if (j > 0 && dep[p2 - N] > d) { dep[p2 - N] = d; q[qt++] = p2 - N; }
      if (j < N - 1 && dep[p2 + N] > d) { dep[p2 + N] = d; q[qt++] = p2 + N; }
    }
    const lin = new Uint8Array(N * N * 4), msk = new Uint8Array(N * N * 4);
    const _tf0 = performance.now(); let _flowN = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p2 = j * N + i;
      let sd = 0, n = 0;   // 3×3 평균 — 수심 계단을 없앤다
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = j + dj, ii = i + di; if (jj < 0 || ii < 0 || jj >= N || ii >= N) continue;
        sd += Math.min(WF_DEPTH_MAX, dep[jj * N + ii]); n++;
      }
      const d01 = (sd / n) / WF_DEPTH_MAX;
      const f = wet[p2] === 1 ? (_flowN++, _flowAtCell(ocx + i, ocy + j)) : _ZERO2;
      lin[p2 * 4] = ((f[0] * 0.5 + 0.5) * 255) | 0;
      lin[p2 * 4 + 1] = ((f[1] * 0.5 + 0.5) * 255) | 0;
      lin[p2 * 4 + 2] = (Math.min(1, d01) * 255) | 0;
      lin[p2 * 4 + 3] = 255;
      msk[p2 * 4] = msk[p2 * 4 + 1] = msk[p2 * 4 + 2] = 0;
      msk[p2 * 4 + 3] = wet[p2] === 1 ? 255 : 0;   // 미결(2)은 물이 아니다 — 그리지 않는다
    }
    window.__wfFlowMs = performance.now() - _tf0; window.__wfFlowN = _flowN;
    // 이 창 안 물 셀의 바운딩 박스 — 셰이더를 화면 전체에 돌리지 않기 위한 것(아래 scissor)
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (wet[j * N + i] === 1) {
      const cx = ocx + i, cy = ocy + j;
      if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx;
      if (cy < by0) by0 = cy; if (cy > by1) by1 = cy;
    }
    return { lin, msk, bbox: bx1 < bx0 ? null : [bx0, by0, bx1 + 1, by1 + 1], pending };
  }

  const WATER_VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const WATER_FS = [
    'precision highp float;',
    'uniform vec2 uRes; uniform vec2 uCam; uniform float uT;',
    'uniform sampler2D uLin; uniform sampler2D uMsk;',
    'uniform vec2 uOrig; uniform float uN; uniform float uDrop;',
    // ★★값 노이즈는 **주기 노이즈**여야 한다. 이유가 두 개다:
    //   ⓐ 월드 좌표가 수만 px 이라 `fract(sin(dot(p,·)))` 의 인자가 1e7 급이 되면 float 정밀도가
    //      무너져 해시가 뭉개진다 — 1패스 실화면에서 물이 **잔물결도 반짝임도 없는 뿌연 판**이었다.
    //   ⓑ 그래서 흐름맵 원점(uOrig)을 빼서 국소 좌표로 쓰는데, 값 노이즈는 평행이동 불변이 아니라
    //      원점이 512px 씩 옮겨갈 때마다 무늬가 튄다. 격자를 512px 의 약수 주기로 감으면 **불변**이 된다.
    //   ⇒ 노이즈 스케일은 전부 512 의 약수(8·3.2·32·4)이고 주기는 512/스케일 이다.
    'float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float vn(vec2 p,float per){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    '  vec2 a=mod(i,per), b=mod(i+vec2(1,0),per), c=mod(i+vec2(0,1),per), d=mod(i+vec2(1,1),per);',
    '  return mix(mix(h2(a),h2(b),u.x),mix(h2(c),h2(d),u.x),u.y);}',
    'vec2 cellUV(vec2 w){return (w/32.0-uOrig)/uN;}',
    'void main(){',
    '  float ix = gl_FragCoord.x - uRes.x*0.5 + uCam.x;',
    '  float sy = (uRes.y-gl_FragCoord.y) - uRes.y*0.5 + uCam.y;',
    // ★수면은 지면보다 uDrop 만큼 내려가 있다 ⇒ 이 화면 행에 보이는 수면점은 iso y-uDrop 의 역변환
    '  float iy = sy - uDrop;',
    '  vec2 w = vec2((2.0*iy+ix)*0.5,(2.0*iy-ix)*0.5);',
    '  vec2 uv = cellUV(w);',
    '  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) discard;',
    '  if(texture2D(uMsk,uv).a < 0.5) discard;',            // 각진 블록 — 셀 경계 그대로
    // ★★내 자리(지면 높이)가 뭍이면 그건 프리즘 면이 덮을 자리다 — 물을 그리지 않는다.
    //   ※배치 19 가 `uvg` 를 **계산만 하고 discard 를 안 걸었다**(주석은 있는데 코드가 없다).
    //     그 결과 수면이 uDrop 만큼 내려가 그려지면서 **남·동쪽 뭍 위로 흘러넘쳤고**,
    //     물가를 따라 이어지는 **푸른 후광 = 재민이 말한 "테두리"** 가 됐다.
    //     실측(재민 지적 뒤): 물 ON/OFF 같은 뭍 픽셀 비교 — 경계에서 파랑 **+26**, 11px 밖에도 **+6**.
    //   ⇒ 원래 의도대로 한 줄을 마저 건다. 그 자리는 프리즘 단면이 덮는다.
    '  vec2 wg = vec2((2.0*sy+ix)*0.5,(2.0*sy-ix)*0.5);',
    '  vec2 uvg = cellUV(wg);',
    '  if(uvg.x>=0.0&&uvg.y>=0.0&&uvg.x<=1.0&&uvg.y<=1.0&&texture2D(uMsk,uvg).a < 0.5) discard;',
    '  vec4 L = texture2D(uLin,uv);',
    '  vec2 dir = L.rg*2.0-1.0; float depth = L.b;',
    '  float fl = length(dir);',
    // 흐름이 없으면(호수·먼바다) 해안 거리장 기울기 = 파도 방향(해안 쪽에서 온다)
    '  if(fl < 0.08){ float e=1.0/uN;',
    '    float gx=texture2D(uLin,uv+vec2(e,0)).b-texture2D(uLin,uv-vec2(e,0)).b;',
    '    float gy=texture2D(uLin,uv+vec2(0,e)).b-texture2D(uLin,uv-vec2(0,e)).b;',
    '    vec2 g2=vec2(gx,gy); dir = length(g2)>0.0001? -normalize(g2) : vec2(1.0,0.0); }',
    '  else dir = dir/fl;',
    '  float ADV = 64.0;',
    // ★사인 위상은 **전체 좌표**로 계산해도 된다(위상은 크기가 커도 매끄럽다). 노이즈만 국소 좌표.
    '  vec2 wl = w - uOrig*32.0;',
    '  float al = dot(w,dir) - ADV*uT;',
    '  float cr = dot(w,vec2(-dir.y,dir.x));',
    '  float ampMod = 0.45+0.9*vn(wl/32.0,16.0);',           // 진폭 얼룩 — 안 하면 골판지
    '  float A1=0.85*ampMod, A2=0.55*ampMod;',
    '  float p1 = al*(6.2831853/64.0)+cr*0.02;',
    '  float p2 = al*(6.2831853/32.0)+cr*0.07;',
    '  float n1 = vn((wl-ADV*uT*dir)/8.0,64.0)-0.5;',
    '  float n2 = vn((wl-ADV*uT*dir)/3.2+vec2(17.0,9.0),160.0)-0.5;',
    '  float s1 = A1*cos(p1)*(6.2831853/64.0), s2 = A2*cos(p2)*(6.2831853/32.0);',
    '  float sn = n1*0.55+n2*0.38;',
    '  vec3 nrm = normalize(vec3(-(s1+s2)*dir.x - sn*dir.x, -(s1+s2)*dir.y - sn*dir.y, 1.0));',
    '  vec3 Ld = normalize(vec3(-0.42,-0.58,0.70));',        // 정본 태양(52°/35°)과 일관
    '  vec3 Vd = normalize(vec3(0.5,-0.5,0.707));',
    '  vec3 Hd = normalize(Ld+Vd);',
    '  float diff = max(0.0,dot(nrm,Ld));',
    '  float spec = pow(max(0.0,dot(nrm,Hd)),90.0)*(0.55+0.45*depth);',
    '  float r = 26.0+(95.0-26.0)*(1.0-depth)*0.8;',
    '  float g = 64.0+(150.0-64.0)*(1.0-depth)*0.8;',
    '  float b = 96.0+(150.0-96.0)*(1.0-depth)*0.55;',
    '  r = r*(0.55+0.5*diff)+118.0*0.16; g = g*(0.55+0.5*diff)+140.0*0.16; b = b*(0.6+0.45*diff)+160.0*0.20;',
    '  r += spec*230.0; g += spec*240.0; b += spec*245.0;',
    // ★포말 — 시간 고정(위치 함수) · 뭍이 북서일 때만 · 뭍에 맞닿은 변 7px 이내만
    '  float e2=1.0/uN; float wa;',
    '  float mN = texture2D(uMsk,uv-vec2(0.0,e2)).a, mW = texture2D(uMsk,uv-vec2(e2,0.0)).a;',
    '  float ec = 99.0;',
    '  vec2 lc = fract(w/32.0)*32.0;',
    '  if(mN<0.5) ec=min(ec,lc.y);',
    '  if(mW<0.5) ec=min(ec,lc.x);',
    '  float shore = clamp(ec/7.0,0.0,1.0);',
    '  if(shore<1.0){ float fo=vn(wl/4.0+vec2(99.0,0.0),128.0);',
    '    float foam=max(0.0,(1.0-shore)*1.25*(fo-0.28))*1.5; foam=min(0.85,foam);',
    '    r=r*(1.0-foam)+232.0*foam; g=g*(1.0-foam)+238.0*foam; b=b*(1.0-foam)+240.0*foam; }',
    '  wa = min(1.0, 0.42+0.58*depth);',                     // ★얕은물 투명 — 물밑 진흙이 비친다
    '  gl_FragColor = vec4(r/255.0*wa, g/255.0*wa, b/255.0*wa, wa);',   // premultiplied
    '}',
  ].join('\n');

  const _wgl = { cv: null, gl: null, prog: null, ok: null, uni: {}, texL: null, texM: null };
  let _waterT0 = null;   // 셰이더 시간 기준점(위 주석 — float 정밀도)
  function _waterInit() {
    if (_wgl.ok !== null) return _wgl.ok;
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
      if (!gl) throw new Error('webgl 없음');
      const mk = (t, src) => { const s2 = gl.createShader(t); gl.shaderSource(s2, src); gl.compileShader(s2);
        if (!gl.getShaderParameter(s2, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s2)); return s2; };
      const pr = gl.createProgram();
      gl.attachShader(pr, mk(gl.VERTEX_SHADER, WATER_VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, WATER_FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const u of ['uRes', 'uCam', 'uT', 'uLin', 'uMsk', 'uOrig', 'uN', 'uDrop']) _wgl.uni[u] = gl.getUniformLocation(pr, u);
      const mkTex = (filt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t; };
      _wgl.texL = mkTex(gl.LINEAR); _wgl.texM = mkTex(gl.NEAREST);
      gl.uniform1i(_wgl.uni.uLin, 0); gl.uniform1i(_wgl.uni.uMsk, 1);
      gl.uniform1f(_wgl.uni.uN, WF_N); gl.uniform1f(_wgl.uni.uDrop, WATER_DROP);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied
      _wgl.cv = cv; _wgl.gl = gl; _wgl.prog = pr; _wgl.ok = true;
      console.log('[water] WebGL 물 레이어 준비');
    } catch (e) {
      console.warn('[water] WebGL 불가 — 단색 폴백:', e.message); _wgl.ok = false;
    }
    return _wgl.ok;
  }
  function _drawWaterLayer(ctx2, W2, H2, camX2, camY2, tSec) {
    if (!_waterInit()) return false;
    const gl = _wgl.gl;
    if (_wgl.cv.width !== W2 || _wgl.cv.height !== H2) { _wgl.cv.width = W2; _wgl.cv.height = H2; }
    gl.viewport(0, 0, W2, H2);
    // 흐름/수심/마스크 텍스처 — 카메라가 WF_QUANT 셀 이상 움직였을 때만 다시 굽는다
    const wpt = { wx: (2 * camY2 + camX2) / 2, wy: (2 * camY2 - camX2) / 2 };
    const ocx = Math.floor(wpt.wx / 32 / WF_QUANT) * WF_QUANT - (WF_N >> 1);
    const ocy = Math.floor(wpt.wy / 32 / WF_QUANT) * WF_QUANT - (WF_N >> 1);
    const key = ocx + '_' + ocy;
    // ★미결 칸이 남아 있으면 다음 프레임에 마저 묻는다(예산제 — 위 _buildFlowTex 주석).
    if (_wfCache.key !== key || _wfCache.pending) {
      // ★[성능 계측] 흐름 텍스처를 굽는 시간 — 재민이 실기에서 겪은 "물가 렉"의 그 지점이다.
      //   고정 지점 촬영으로는 절대 안 잡힌다(캐시가 안 식는다). 걷는 하네스가 이 수를 읽는다.
      const _t0 = performance.now();
      const t = _buildFlowTex(gl, ocx, ocy);
      const _ms = performance.now() - _t0;
      window.__wfBuildMs = _ms;
      window.__wfBuildN = (window.__wfBuildN || 0) + 1;
      window.__wfBuildSum = (window.__wfBuildSum || 0) + _ms;
      if (window.__wfBuildN === 1) { window.__wfFirstMs = _ms; }   // 첫 장은 **모든 캐시가 찬물** — 정상 주행과 성격이 다르다
      else { window.__wfBuildMax = Math.max(window.__wfBuildMax || 0, _ms); window.__wfSteadyN = (window.__wfSteadyN || 0) + 1; window.__wfSteadySum = (window.__wfSteadySum || 0) + _ms; }
      window.__wfLast = { ms: _ms, wet: window.__wfWetMs || 0, reuse: window.__wfReuse || 0 };
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, _wgl.texL);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WF_N, WF_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.lin);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, _wgl.texM);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WF_N, WF_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.msk);
      _wfCache.key = key; _wfCache.ox = ocx; _wfCache.oy = ocy; _wfCache.bbox = t.bbox;
      _wfCache.pending = (t.pending || 0) > 0;
      window.__wfPendN = t.pending || 0;
    }
    // ★★셰이더를 **물이 있는 화면 영역**에만 돌린다.
    //   1패스 실측(headless SwiftShader): 화면 전체 오버레이가 프레임당 143ms 였고,
    //   **물이 한 방울도 없는 초원에서도 137ms 를 냈다** — 순전한 낭비다.
    //   흐름맵을 굽는 김에 물 셀 바운딩 박스를 같이 뽑아, 그 상자를 화면에 투영해 scissor 한다.
    //   물이 화면에 없으면 draw 자체를 건너뛴다.
    const bb = _wfCache.bbox;
    if (!bb) return false;
    let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
    for (const [cx, cy] of [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]]) {
      const wx = cx * 32, wy = cy * 32;
      const ix = wx - wy - camX2 + W2 / 2, iy = (wx + wy) / 2 - camY2 + H2 / 2;
      if (ix < sx0) sx0 = ix; if (ix > sx1) sx1 = ix;
      if (iy < sy0) sy0 = iy; if (iy > sy1) sy1 = iy;
    }
    sy0 -= WATER_DROP + 2; sy1 += 2;   // 수면이 내려간 만큼 여유
    const rx0 = Math.max(0, Math.floor(sx0)), ry0 = Math.max(0, Math.floor(sy0));
    const rx1 = Math.min(W2, Math.ceil(sx1)), ry1 = Math.min(H2, Math.ceil(sy1));
    if (rx1 <= rx0 || ry1 <= ry0) return false;   // 화면에 물이 없다 — 셰이더를 아예 안 돌린다
    const rw = rx1 - rx0, rh = ry1 - ry0;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rx0, H2 - ry1, rw, rh);   // GL 원점은 좌하단
    gl.uniform2f(_wgl.uni.uRes, W2, H2);
    gl.uniform2f(_wgl.uni.uCam, camX2, camY2);
    gl.uniform2f(_wgl.uni.uOrig, _wfCache.ox, _wfCache.oy);
    gl.uniform1f(_wgl.uni.uT, tSec);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    ctx2.drawImage(_wgl.cv, rx0, ry0, rw, rh, rx0, ry0, rw, rh);
    _wfCache.rect = [rx0, ry0, rw, rh];
    return true;
  }
  // ★블록 프리즘 단면 — 물에 접한 뭍 셀의 남·동 변에서 WATER_DROP 만큼 수직면.
  //   벽 셰이드 문법(남면 어둡게·동면 밝게) + 상단 풀 넘김 립 + 하단 물 접촉선 그림자.
  //   북·서 변은 뭍이 가린다(면 없음). 픽셀 패스가 아니라 **벡터**로 그린다(재민 확정 ③).
  function _drawPrisms(g, toScr, cx0, cy0, cx1, cy1) {
    const D = WATER_DROP;
    let n = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const px = cx * 32 + 16, py = cy * 32 + 16;
      if (isWaterAtAbs(px, py)) continue;                       // 뭍 셀만
      const sW = isWaterAtAbs(px, py + 32), eW = isWaterAtAbs(px + 32, py);
      if (!sW && !eW) continue;
      n++;
      // ★[2026-08-06c] 상단 립 = **위에 있는 것의 색**이어야 한다. 물가 여백(모래)이 있는 면에
      //   초록 립을 그으면 모래 위에 초록 선이 뜬다. 높이도 자리마다 흔든다 —
      //   전 구간 **같은 두께 단색 선**은 그 자체로 윤곽선이다(실측 σ 24.9 = 프로파일 최솟값).
      //   ※립 자체를 없애지는 않는다: 없애면 단면 그늘이 곧장 풀에 닿아 대비가 더 세진다.
      const _lip = (k, sunny) => {
        const m = _t19.shMarginOff ? 0 : _shoreMargin(cx, cy, k);
        const h = 1.3 + 1.9 * _cellHash(cx, cy, 5170 + k);
        return [m >= 1.2 ? (sunny ? '#9a8663' : '#8a7757') : (sunny ? '#526e44' : '#4e6b40'), h];
      };
      if (sW) {   // 남면(물이 y+1) — 그늘
        const a = w2i(cx * 32, (cy + 1) * 32), b = w2i((cx + 1) * 32, (cy + 1) * 32);
        const A = toScr(a.x, a.y), B = toScr(b.x, b.y);
        g.fillStyle = '#4a3a26';
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(B.x, B.y + D); g.lineTo(A.x, A.y + D); g.closePath(); g.fill();
        g.fillStyle = 'rgba(15,25,35,' + (0.34 + 0.30 * _cellHash(cx, cy, 5190)).toFixed(3) + ')';
        g.beginPath(); g.moveTo(A.x, A.y + D - 2); g.lineTo(B.x, B.y + D - 2); g.lineTo(B.x, B.y + D); g.lineTo(A.x, A.y + D); g.closePath(); g.fill();
        const [lc, lh] = _lip(2, false); g.fillStyle = lc;
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(B.x, B.y + lh); g.lineTo(A.x, A.y + lh); g.closePath(); g.fill();
      }
      if (eW) {   // 동면(물이 x+1) — 볕
        const a = w2i((cx + 1) * 32, cy * 32), b = w2i((cx + 1) * 32, (cy + 1) * 32);
        const A = toScr(a.x, a.y), B = toScr(b.x, b.y);
        g.fillStyle = '#61492f';
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(B.x, B.y + D); g.lineTo(A.x, A.y + D); g.closePath(); g.fill();
        g.fillStyle = 'rgba(15,25,35,' + (0.30 + 0.28 * _cellHash(cx, cy, 5191)).toFixed(3) + ')';
        g.beginPath(); g.moveTo(A.x, A.y + D - 2); g.lineTo(B.x, B.y + D - 2); g.lineTo(B.x, B.y + D); g.lineTo(A.x, A.y + D); g.closePath(); g.fill();
        const [lc, lh] = _lip(0, true); g.fillStyle = lc;
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(B.x, B.y + lh); g.lineTo(A.x, A.y + lh); g.closePath(); g.fill();
      }
    }
    return n;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 20 A] 산 — '장벽 세그먼트' 문법 (시안 왕복 12회로 확정)
  //   단위 = **8방위 벽 세그먼트**. 늘임 축이 진행 방향의 **수직**이다(단면이 넓은 벽 슬라이스) —
  //   진행 방향으로 늘이면 '가는 벽'이 된다(시안 실측).
  //   배치 = ridges 폴리라인을 호길이로 걸으며, 배치점마다 **진행 수직으로 실제 바위 셀을 훑어
  //   이어진 개수를 센다**. 그 수가 세그먼트 폭이다.
  //     재민 확정: *"산으로 되어 있는 셀들만 산으로 보여야 — 셀이 여러 개 모이면 큰 산."*
  //   ⇒ 고개(셀 0)는 산이 없고(사슬 절단), 파괴된 셀도 자동으로 반영된다.
  //   ★이식 정본은 `scripts/mock-mountain.js` 의 placeAlong 이다. 다른 점은 딱 둘:
  //     ⓐ 장면-로컬 격자 대신 **정본 판정 `isRockAtAbs`** 를 부른다(사본 금지).
  //     ⓑ 결과를 renderables 에 태워 **엔티티와 함께 z 정렬**한다(앵커 wx+wy).
  const MT_ROCK_RIDGES = new Set(['한울대간', '눈메']);   // 돌산(G). 나머지는 숲산(F) — 재민 확인 대기(시안 첨부)
  const MT_CROSS_U = 10.1, MT_ALONG_U = 4.8;             // 시안 정본 상수
  const MT_VIEW_PAD = 1800;                              // 이 반경 밖 능선은 배치조차 안 한다
  const MTX = {};                        // 스프라이트
  let _mtAnchors = null, _mtLoaded = 0, _mtWanted = 0;
  const _mtSegCache = new Map();         // "zid_ridgeIdx" → 세그먼트 배열(정적 — 파괴 시 무효화)
  const _mtDestroyed = new Set();        // 파괴된 바위 셀 "zid_cx_cy" — ★서버 이벤트 자리(§A-6 회부)
  (async () => {
    try {
      const r = await fetch('/assets/mountains/mountain_anchors.json');
      if (!r.ok) return;
      _mtAnchors = await r.json();
      const names = Object.keys(_mtAnchors); _mtWanted = names.length;
      // ★확장자는 앵커가 들고 있다(포장본은 webp). 자기 서술 — 클라가 형식을 짐작하지 않는다.
      for (const n of names) { const im = new Image(); im.onload = () => _mtLoaded++; im.src = '/assets/mountains/' + n + (_mtAnchors[n].ext || '.png'); MTX[n] = im; }
      // ★알파 지도 정본 — 굽는 쪽이 만든 하나를 클라도 하네스도 같이 쓴다.
      //   전엔 클라는 이미지를 축소해서, node 하네스는 PNG 를 읽어서 각자 만들었다.
      //   둘이 같이 틀리면 판정이 통과한다(자명 통과). 없으면 종전대로 이미지에서 유도한다.
      try {
        const ra = await fetch('/assets/mountains/mountain_alpha.json');
        if (ra.ok) {
          const j = await ra.json(); const N = j.n || 64;
          for (const k in j.a) {
            const bin = atob(j.a[k]), u = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
            _mtAlphaMap.set(k, { N, a: u });
          }
          console.log('[mt] 알파 지도 정본', Object.keys(j.a).length, '종');
        }
      } catch (e) { }
      console.log('[mt] 산 스프라이트', names.length, '종 로드 시작');
    } catch (e) { console.warn('[mt] 앵커 로드 실패:', e.message); }
  })();
  function _mtRockAt(zid, wx, wy) {
    // ★판정 정본을 부른다. 파괴 셀은 렌더 층에서만 걷어낸다(지형 데이터 무접촉).
    const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
    if (_mtDestroyed.size && _mtDestroyed.has(zid + '_' + cx + '_' + cy)) return false;
    return isRockAtAbs(cx * 32 + 16, cy * 32 + 16);
  }
  function _mtPlaceRidge(zid, ridge, ox, oy, ri) {
    const key = zid + '_' + ri;
    const hit = _mtSegCache.get(key); if (hit) return hit;
    const pts = ridge.path.map((p) => ({ x: ox + p.pos[0], y: oy + p.pos[1], w: p.width }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = cum[cum.length - 1];
    const at = (sArc) => {
      let i = 1; while (i < cum.length - 1 && cum[i] < sArc) i++;
      const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1, t = (sArc - cum[i - 1]) / L;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x), w: a.w + (b.w - a.w) * t };
    };
    const bandCells = (px, py, ang) => {
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      if (!_mtRockAt(zid, px, py)) return { n: 0, off: 0 };
      let a = 0, b = 0;
      for (let k = 1; k <= 30; k++) { if (_mtRockAt(zid, px + nx * k * 32, py + ny * k * 32)) a = k; else break; }
      for (let k = 1; k <= 30; k++) { if (_mtRockAt(zid, px - nx * k * 32, py - ny * k * 32)) b = k; else break; }
      return { n: a + b + 1, off: (a - b) / 2 };
    };
    const placed = [];
    for (let sArc = 0; sArc < total;) {
      const p0 = at(sArc);
      const bc = bandCells(p0.x, p0.y, p0.ang);
      const scW = Math.max(0.6, bc.n / MT_CROSS_U * 0.96);
      placed.push({ ang: p0.ang, w: p0.w, sc: scW, dead: bc.n < 2,
        x: p0.x + bc.off * 32 * -Math.sin(p0.ang), y: p0.y + bc.off * 32 * Math.cos(p0.ang) });
      sArc += Math.max(40, MT_ALONG_U * 32 * scW * 0.55);
    }
    const isF = !MT_ROCK_RIDGES.has(ridge.name);
    const segs = [];
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i]; if (p.dead) continue;
      let deg = (p.ang * 180 / Math.PI) % 180; if (deg < 0) deg += 180;
      const oct = Math.round(deg / 22.5) % 8;
      const rx = Math.round(p.x), ry = Math.round(p.y);
      let knot = false;
      if (i > 0 && i < placed.length - 1) {
        let d2 = Math.abs(placed[i + 1].ang - placed[i - 1].ang);
        if (d2 > Math.PI) d2 = 2 * Math.PI - d2;
        if (d2 > 0.42) knot = true;
      }
      const cut = (i > 0 && placed[i - 1].dead) || (i < placed.length - 1 && placed[i + 1].dead);
      if (cut) {   // 잘린 끝 = 캡(벽보다 낮게 — 주저앉는 전이)
        segs.push({ x: p.x, y: p.y, name: _cellHash(i, oct, 9) < 0.5 ? 'mt_S1' : 'mt_S2', sc: p.sc * 0.95, vy: 1, jx: 0, jy: 0 });
      } else if (knot) {
        segs.push({ x: p.x, y: p.y, name: _cellHash(i, oct, 7) < 0.5 ? 'mt_M1' : 'mt_M2', sc: p.sc * 1.25, vy: 1, jx: 0, jy: 0 });
      } else {
        const v = isF ? ((_cellHash(rx, ry, 77) * 2) | 0) : ((_cellHash(rx, ry, 77) * 3) | 0);
        segs.push({ x: p.x, y: p.y, name: (isF ? 'mt_F' : 'mt_G') + oct + 'v' + v, sc: p.sc,
          vy: 0.86 + 0.28 * _cellHash(rx, ry, 78),                 // 높이 지터 ±14%(발치 고정)
          jx: (_cellHash(rx, ry, 11) - 0.5) * p.w * 0.05,
          jy: (_cellHash(rx, ry, 12) - 0.5) * p.w * 0.05 });
      }
    }
    if (_mtSegCache.size > 400) _mtSegCache.clear();
    _mtSegCache.set(key, segs);
    return segs;
  }
  // ═══ 덮개 배치 — 크기를 '밴드 폭'이 아니라 '덩어리 가장자리까지의 거리'로 ═══════
  // ★★[재민 2026-08-07] *"갈색 타일이 보이면 안 될 정도로 산이 덮어야지"*
  //
  //   ⓐ **왜 현행이 못 덮나**: `_mtPlaceRidge` 는 능선 **중심선만** 걷고, 밴드 폭(중앙값 53셀)을
  //      스프라이트 **한 장**에 맡긴다(`scW = 밴드/10.1` → 중앙값 5.04). 그래서
  //        · 중심선에서 먼 옆구리는 아무것도 안 선다 → 맨 바위(실측 마을옆 39.9% · 라이브 70.9%)
  //        · 한 장을 5~9배 늘리니 뭉갠다
  //   ⓑ **여기선 나눠 덮는다**: 바위 덩어리의 **가장자리까지 거리**로 계층을 만든다.
  //        안쪽 → 큰 봉우리 성기게 · 어깨 → 중간 · 자락 → 잔 봉우리 촘촘히
  //      높이 배율도 같은 거리에 태워 실루엣이 저절로 산등성이가 된다.
  //   ⓒ **틈은 눈이 아니라 알파로 찾는다** — 남은 맨 바위 셀에 잔봉우리를 얹는다.
  //      시안 실측: 굽이 20.0%→0.0% · 마을옆 39.9%→0.0%.
  //   ⓓ **격자는 절대 셀 좌표**다. 청크 경계에서 자리가 흔들리면 이음매가 보인다.
  //      청크는 계산 단위일 뿐 좌표계가 아니다.
  //   ⓔ 거리 변환이 청크 경계에서 잘리면 안쪽인데 자락으로 오인한다 → **여백을 두고 계산하고
  //      배치는 코어에서만 낸다**(여백 밖은 '가장자리 아님'으로 둔다).
  const MT_CH = 48, MT_CHPAD = 22;
  const MT_TIERS = [
    { k: 'L', minD: 9.0, step: 13.0, s0: 1.85, s1: 2.50, solo: ['mt_L1'], sp: 0.34, seed: 411 },
    { k: 'M', minD: 3.5, step: 7.5, s0: 1.18, s1: 1.68, solo: ['mt_M1', 'mt_M2'], sp: 0.32, seed: 412 },
    { k: 'S', minD: -1.0, step: 4.2, s0: 0.70, s1: 1.00, solo: ['mt_S1', 'mt_S2'], sp: 0.30, seed: 413, maxD: 5.0 },
  ];
  // 기슭 — 바위 바깥 자락. 크기가 아니라 **높이**를 눌러 둔덕으로 읽히게 한다.
  // ★★[재민 2026-08-07 "정확하게 산 셀인 곳에만 산이 있어야 해"]
  //   실측: 산이 바위 밖으로 **중앙값 3셀 · 최대 6셀** 나가 있었다.
  //   원인은 기슭(10%)이 아니라 **스프라이트 발치가 퍼지는 것**(90%)이었다 —
  //   배율 1짜리 밑변이 10셀이라, 가장자리 셀에 앵커를 둬도 5셀이 풀밭으로 넘친다.
  //   ⇒ 배율을 **가장자리 거리로 묶는다**: 밑변 반지름(=CROSS_U/2×sc)이 dE+여유를 못 넘게.
  //   여유 1셀이 재민이 말한 "정말 미세한 오차"다.
  //   ★2차: 밑변만 묶어선 부족했다. 실측상 재민이 본 침범의 본체는 **몸통이 북서쪽 풀밭을
  //   덮는 것**이었다(56셀 중 55셀). 렌더러 눈엔 '뒤에 가려진 것'이지만 플레이어 눈엔
  //   **지도상 풀밭인데 산이 있는 것**이다 — 플레이어가 옳다.
  //   ⇒ **높이도 묶는다**: 스프라이트가 화면 위로 덮는 셀 수가 앵커에서 북서로 이어진
  //     바위 셀 수(dNW)를 못 넘게. 그러면 실루엣이 바위 마스크를 따라간다.
  // ★여유 셀 [재민 2026-08-07 "살짝은 산에 침범당해도 돼"] — 손잡이로 열어 둔다.
  //   0 에 가까울수록 산이 바위 마스크에 딱 붙지만 경계가 톱니가 되고 계층이 무너진다.
  //   크게 둘수록 산다워지지만 평지 침범이 는다. 이 값은 그 저울이다.
  let MT_FIT_TOL = 2.0;   // ★재민 "살짝은 침범당해도 돼" — 여유 0.35~4 실측 후 2.0 채택(톱니 소멸 · 하한눌림 0%)
  const MT_SC_MIN = 0.28, MT_VY_MIN = 0.30;   // ★하한 — 이보다 낮으면 틈 메우기 스프라이트가 제 셀도 못 덮는다(실측)
  const _mtFit = (sc, dE) => {
    if (_t19.fitOff) return sc;
    const cap = (dE + MT_FIT_TOL) / (MT_CROSS_U / 2);
    return sc < cap ? sc : (cap < MT_SC_MIN ? MT_SC_MIN : cap);
  };
  // 화면 위로 덮는 셀 수 = 앵커 위 화소 / 32. 이걸 dNW 로 묶어 세로 배율을 되돌린다.
  const _mtFitVy = (name, sc, vy, dNW) => {
    if (_t19.fitOff) return vy;
    const an = _mtAnchors && _mtAnchors[name]; if (!an) return vy;
    const px = an.oy * ((64 / Math.SQRT2) / an.ppu) * sc;      // vy=1 일 때 위로 덮는 화소
    const upCells = px / 32; if (upCells <= 0) return vy;
    const cap = (dNW + MT_FIT_TOL) / upCells;
    return vy < cap ? vy : (cap < MT_VY_MIN ? MT_VY_MIN : cap);
  };
  // 기슭도 같은 규격 아래로 — 1.6셀 자락이면 '미세한 오차' 안이다(5.2셀은 침범이다)
  const MT_FOOT = { step: 2.2, dMax: 1.6, s0: 0.26, s1: 0.46, vy0: 0.26, vy1: 0.52 };
  const _mtChunk = new Map();            // "gx_gy" → 세그먼트(절대 셀 청크 · 파괴 시 무효화)
  let _mtRidgeSeg = null;                // 전 존 능선 폴리라인을 절대 좌표로 편 목록(각도·숲/돌 판정용)
  function _mtRidgeSegs() {
    if (_mtRidgeSeg) return _mtRidgeSeg;
    const H = _hardTerrain; if (!H) return [];
    const out = [];
    for (const zid in H) {
      const z = zonesMeta[zid]; if (!z) continue;
      const ox = z.worldOffsetX, oy = z.worldOffsetY || 0;
      for (const r of (H[zid].ridges || [])) {
        const isF = !MT_ROCK_RIDGES.has(r.name);
        for (let i = 1; i < r.path.length; i++) {
          out.push({ x0: ox + r.path[i - 1].pos[0], y0: oy + r.path[i - 1].pos[1],
                     x1: ox + r.path[i].pos[0], y1: oy + r.path[i].pos[1], isF });
        }
      }
    }
    _mtRidgeSeg = out; return out;
  }
  function _mtNearRidge(wx, wy) {
    const segs = _mtRidgeSegs();
    let best = Infinity, ang = 0, isF = true;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], dx = s.x1 - s.x0, dy = s.y1 - s.y0, L2 = dx * dx + dy * dy || 1;
      let t = ((wx - s.x0) * dx + (wy - s.y0) * dy) / L2; t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const qx = s.x0 + t * dx - wx, qy = s.y0 + t * dy - wy, d = qx * qx + qy * qy;
      if (d < best) { best = d; ang = Math.atan2(dy, dx); isF = s.isF; }
    }
    return { ang, isF };
  }
  function _mtPick(cx, cy, ang, isF, T) {
    if (_cellHash(cx, cy, T.seed + 7) < T.sp) return T.solo[(_cellHash(cx, cy, T.seed + 8) * T.solo.length) | 0];
    // ★능선 각도에 ±14° 해시 흔들림 — 직선 능선에서 같은 옥탄트가 줄서면 '아코디언 벽'이 된다
    const jit = (_cellHash(cx, cy, T.seed + 9) - 0.5) * 28 * Math.PI / 180;
    let deg = ((ang + jit) * 180 / Math.PI) % 180; if (deg < 0) deg += 180;
    const oct = Math.round(deg / 22.5) % 8;
    const v = isF ? ((_cellHash(cx, cy, 77) * 2) | 0) : ((_cellHash(cx, cy, 77) * 3) | 0);
    return (isF ? 'mt_F' : 'mt_G') + oct + 'v' + v;
  }
  function _mtHgt(dE, cx, cy, seed) {          // 높이 = 가장자리 거리 램프 + 자리 지터
    const t = dE < 0 ? 0 : (dE > 14 ? 1 : dE / 14);
    return 0.74 + 0.44 * t + 0.16 * (_cellHash(cx, cy, seed) - 0.5);
  }
  // 스프라이트가 이 셀을 덮나 — 가림 판정과 **같은 알파 지도**를 쓴다(사본 금지)
  function _mtCovers(sg, ix, iy) {
    const an = _mtAnchors[sg.name], im = MTX[sg.name]; if (!an || !im || !im.naturalWidth) return false;
    const sc = (64 / Math.SQRT2) / an.ppu * sg.sc, vy = sg.vy || 1;
    const W = im.naturalWidth * sc, H = im.naturalHeight * sc * vy;
    const c = w2i(sg.x, sg.y);
    const u = (ix - (c.x - an.ox * sc)) / W, v = (iy - (c.y - an.oy * sc * vy)) / H;
    if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return false;
    return _mtAlphaAt(sg.name, u, v) > 0.30;
  }
  function _mtChunkSegs(zid, gx, gy) {
    const key = gx + '_' + gy;
    const hit = _mtChunk.get(key); if (hit) return hit;
    const W = MT_CH + MT_CHPAD * 2, c0 = gx * MT_CH - MT_CHPAD, r0 = gy * MT_CH - MT_CHPAD;
    const mask = new Uint8Array(W * W);
    let nRock = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      if (_mtRockAt(zid, (c0 + i) * 32 + 16, (r0 + j) * 32 + 16)) { mask[j * W + i] = 1; nRock++; }
    }
    if (!nRock) { _mtChunk.set(key, []); return []; }
    // 가장자리 거리 — chamfer 2패스. ★창 밖은 '가장자리 아님'(INF)이다.
    const INF = 1e6, d = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) d[i] = mask[i] ? INF : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= W) ? INF : d[y * W + x];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (d[i] === 0) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414); }
    for (let y = W - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (d[i] === 0) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414); }
    const edgeD = (acx, acy) => { const i = acx - c0, j = acy - r0;
      return (i < 0 || j < 0 || i >= W || j >= W) ? 0 : d[j * W + i]; };
    // ★바깥 거리 — 바위에서 몇 셀 떨어진 풀밭인가. 기슭이 여기 선다.
    //   같은 패스에서 같이 굽는다(창을 두 번 훑지 않는다).
    const dOut = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) dOut[i] = mask[i] ? 0 : INF;
    const ao = (x, y) => (x < 0 || y < 0 || x >= W || y >= W) ? INF : dOut[y * W + x];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (dOut[i] === 0) continue;
      dOut[i] = Math.min(dOut[i], ao(x - 1, y) + 1, ao(x, y - 1) + 1, ao(x - 1, y - 1) + 1.414, ao(x + 1, y - 1) + 1.414); }
    for (let y = W - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (dOut[i] === 0) continue;
      dOut[i] = Math.min(dOut[i], ao(x + 1, y) + 1, ao(x, y + 1) + 1, ao(x + 1, y + 1) + 1.414, ao(x - 1, y + 1) + 1.414); }
    const outD = (acx, acy) => { const i = acx - c0, j = acy - r0;
      return (i < 0 || j < 0 || i >= W || j >= W) ? INF : dOut[j * W + i]; };
    const isRk = (acx, acy) => { const i = acx - c0, j = acy - r0;
      return i >= 0 && j >= 0 && i < W && j < W && mask[j * W + i] === 1; };
    // 화면 위쪽(북서)으로 이어진 바위 셀 수 — 스프라이트가 그 위로 넘어가면 풀밭을 덮는다.
    // ★가운데 한 줄만 보면 안 된다 — 스프라이트는 폭이 있어서 **옆줄**이 먼저 풀밭 위로 넘친다.
    //   폭(±halfW 셀, iso-x 방향 = (+1,-1))에 걸친 줄들의 **최소값**을 쓴다.
    const upCol = (acx, acy) => { let k = 0; while (k < 40 && isRk(acx - k - 1, acy - k - 1)) k++; return k; };
    const upRock = (acx, acy, halfW) => {
      let m = upCol(acx, acy);
      const w = Math.max(1, Math.round(halfW));
      for (let i = 1; i <= w; i++) {
        const a1 = upCol(acx + i, acy - i), a2 = upCol(acx - i, acy + i);
        if (a1 < m) m = a1; if (a2 < m) m = a2;
      }
      return m;
    };

    // ★여백까지 배치한다(덮개 판정에 쓰려고). **코어 것만 내보낸다.**
    const all = [], core = [];
    const cLo = gx * MT_CH, cHi = cLo + MT_CH, rLo = gy * MT_CH, rHi = rLo + MT_CH;
    for (const T of MT_TIERS) {
      const li0 = Math.floor((c0) / T.step), li1 = Math.ceil((c0 + W) / T.step);
      const lj0 = Math.floor((r0) / T.step), lj1 = Math.ceil((r0 + W) / T.step);
      for (let lj = lj0; lj <= lj1; lj++) for (let li = li0; li <= li1; li++) {
        // ★지터는 **격자 지표**의 해시다 — 청크가 달라도 같은 값이 나온다(이음매 방지)
        const j1 = _cellHash(li, lj, T.seed), j2 = _cellHash(li, lj, T.seed + 1);
        const cx = Math.round(li * T.step + (j1 - 0.5) * T.step * 0.9);
        const cy = Math.round(lj * T.step + (j2 - 0.5) * T.step * 0.9);
        if (!isRk(cx, cy)) continue;
        const dE = edgeD(cx, cy);
        // ★★[재민 2026-08-07] **딱딱한 문턱을 뺐다.**
        //   실측: 배율 2.18(폭 22셀) 봉우리가 **겉면 12셀**을 깎은 것만으로 통째로 사라졌다.
        //   원인은 이 `dE < minD` 문턱이다 — 가장자리 거리가 임계를 지나는 순간 탈락해
        //   "낮아지는" 게 아니라 "없어진다"(팝). 겉면만 부수는 규칙으로도 못 막는다.
        //   부수는 위치와 무관하게 안쪽 거리가 줄면 언젠가 임계를 지나기 때문이다.
        //   ⇒ 문턱을 없애고 **배율 상한(_mtFit)만** 남긴다. 그러면 깎을수록 봉우리가
        //     사라지는 대신 **낮아진다** — 채석장에서 산이 물러나는 그림이다.
        //   계층은 이제 '설 자리 조건'이 아니라 **격자 밀도**일 뿐이다(L 13셀·M 7.5·S 4.2).
        //   크기는 전적으로 가장자리 거리가 정한다.
        const nr = _mtNearRidge(cx * 32 + 16, cy * 32 + 16);
        const sg = { x: cx * 32 + 16, y: cy * 32 + 16, name: _mtPick(cx, cy, nr.ang, nr.isF, T),
                     sc: _mtFit(T.s0 + (T.s1 - T.s0) * _cellHash(cx, cy, T.seed + 2), dE),
                     vy: 1, jx: 0, jy: 0, tier: T.k };
        sg.vy = _mtFitVy(sg.name, sg.sc, _mtHgt(dE, cx, cy, T.seed + 3), upRock(cx, cy, MT_CROSS_U / 2 * sg.sc));
        all.push(sg);
        if (cx >= cLo && cx < cHi && cy >= rLo && cy < rHi) core.push(sg);
      }
    }
    // ★틈 메우기 — 코어의 맨 바위 셀을 알파로 찾아 잔봉우리를 얹는다(3셀 격자로 한 곳 한 장)
    // ★3셀 격자 중복 제거를 **뺐다** — 그게 덮개 보장을 깨고 있었다(같은 칸의 다른 셀이
    //   처리되면 이 셀은 영영 건너뛰어진다. 실측에서 맨 바위 1셀이 그렇게 남았다).
    //   대신 새로 얹은 스프라이트를 `all` 에 바로 넣어 **덮개 판정 자체가 중복을 막게** 한다.
    for (let acy = rLo; acy < rHi; acy++) for (let acx = cLo; acx < cHi; acx++) {
      if (!isRk(acx, acy)) continue;
      const p = w2i(acx * 32 + 16, acy * 32 + 16);
      let covered = false;
      for (let i = 0; i < all.length; i++) if (_mtCovers(all[i], p.x, p.y)) { covered = true; break; }
      if (covered) continue;
      const nr = _mtNearRidge(acx * 32 + 16, acy * 32 + 16);
      const sg = { x: acx * 32 + 16, y: acy * 32 + 16, name: _mtPick(acx, acy, nr.ang, nr.isF, MT_TIERS[2]),
                   sc: _mtFit(0.78 + 0.30 * _cellHash(acx, acy, 515), edgeD(acx, acy)),
                   vy: 1, jx: 0, jy: 0, tier: '틈' };
      sg.vy = _mtFitVy(sg.name, sg.sc, _mtHgt(edgeD(acx, acy), acx, acy, 516), upRock(acx, acy, MT_CROSS_U / 2 * sg.sc));
      all.push(sg); core.push(sg);
    }
    // ★★기슭 [재민 2026-08-07 "산과 풀의 경계가 뚝 끊긴다" → "고고"]
    //   ⓐ **기슭은 '작은 산'이 아니라 '납작한 산'이다.** 크기만 줄이면 자갈로 읽히고,
    //      세로만 눌러야(vy 0.26~0.58) 둔덕으로 읽힌다. 그래서 sc 는 조금만 줄이고 vy 를 눌렀다.
    //   ⓑ 자락(S)의 높이 바닥을 0.58 로 내려 뒀다(_mtHgt) — 산→기슭이 끊김 없이 이어진다.
    //   ⓒ **균일 산포 금지**(배치 21 재민 지적 "일부러 심은 느낌") — 밀도도 거리에 따라 준다.
    //   ⓓ ★**지형 데이터 무접촉**: 순수 렌더다. 콜라이더·통행·자원·econ 전부 그대로다.
    //      풀 셀 위에 그림만 얹는다 — 물 셀엔 안 선다(물가 술이 이미 그 자리 주인이다).
    if (!_t19.footOff) {
      for (let lj = Math.floor(r0 / MT_FOOT.step); lj <= Math.ceil((r0 + W) / MT_FOOT.step); lj++) {
        for (let li = Math.floor(c0 / MT_FOOT.step); li <= Math.ceil((c0 + W) / MT_FOOT.step); li++) {
          const j1 = _cellHash(li, lj, 811), j2 = _cellHash(li, lj, 812);
          const cx = Math.round(li * MT_FOOT.step + (j1 - 0.5) * MT_FOOT.step);
          const cy = Math.round(lj * MT_FOOT.step + (j2 - 0.5) * MT_FOOT.step);
          if (cx < cLo || cx >= cHi || cy < rLo || cy >= rHi) continue;   // 코어만 내보낸다
          if (isRk(cx, cy)) continue;                                     // 바위 위는 산이 이미 선다
          const wx = cx * 32 + 16, wy = cy * 32 + 16;
          if (isWaterAtAbs(wx, wy)) continue;
          const dO = outD(cx, cy);
          if (dO <= 0 || dO > MT_FOOT.dMax) continue;
          const t = 1 - dO / MT_FOOT.dMax;                                // 1 = 바위 코앞
          if (_cellHash(cx, cy, 631) > 0.18 + 0.72 * t) continue;
          const nr = _mtNearRidge(wx, wy);
          const sg = { x: wx, y: wy, name: _mtPick(cx, cy, nr.ang, nr.isF, MT_TIERS[2]),
            sc: _mtFit(MT_FOOT.s0 + (MT_FOOT.s1 - MT_FOOT.s0) * t * (0.55 + 0.45 * _cellHash(cx, cy, 813)), MT_FIT_TOL - dO),
            vy: MT_FOOT.vy0 + (MT_FOOT.vy1 - MT_FOOT.vy0) * t + 0.10 * (_cellHash(cx, cy, 814) - 0.5),
            jx: 0, jy: 0, tier: '기슭' };
          sg.vy = _mtFitVy(sg.name, sg.sc, sg.vy, 0);
          core.push(sg);
        }
      }
    }
    if (_mtChunk.size > 220) _mtChunk.clear();
    _mtChunk.set(key, core);
    return core;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★★ 3D 산 — 높이맵 메시를 청크×반대각선 띠로 구워 **mtseg 자리에 꽂는다**
  //   [재민 2026-08-09 "일단 이대로 본게임 ㄱ"]
  //
  //   렌더러를 안 바꾼다. 산 "이미지의 출처"만 스프라이트 → 구운 메시로 바꾼다.
  //   같은 앵커·같은 z정렬·같은 안개 게이트·같은 renderables wx/wy 규약을 그대로 쓴다.
  //
  //   ★1칸 = 화면 32px 이 정확히 떨어진다: PPU·cos30°·ZSQ = 45.2548×0.8660×0.8165 = 32.00
  //     그래서 WebGL 없이 캔버스 2D 로 정확히 그려진다.
  //   ★z: 셀 (i,j) 중심의 (wx+wy)/2 = 16(i+j)+16. 같은 반대각선은 z 가 같다.
  //     띠 = 반대각선 하나 → 화가 알고리즘이 정확히 성립한다. 개체가 그 위에 서도록 −0.5.
  //   ★높이는 **가장자리 거리장**에서 유도한다 — 지형 데이터 한 바이트 안 건드린다.
  //     파괴는 `_mtRockAt`(정본) 이 이미 반영한다.
  //   ★실패하면 스프라이트 판으로 되돌아간다(아래 try/catch). 라이브를 못 세운다.
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[재민 2026-08-09 "산 근처에서 엄청나게 렉"] — 맞았다. 원인을 실측으로 다 찾았다.
  //   뷰 반경(1800px=114셀) 안 청크 225개, 그중 산 청크 140개.
  //   조각 **108만 개** → 캔버스 fill **326만 회**. 거리장 계산만 **6.7초**(캔버스 비용 제외).
  //   전부 `_mtCollect` 안에서 **프레임 동기로** 돌았다. 걸어 들어가면 그대로 멈춘다.
  //   다섯이 곱해지고 있었다:
  //     ⓐ 프레임당 굽기 예산이 없었다 → 새로 보이는 청크를 한 프레임에 다 구웠다
  //     ⓑ 뷰 반경 1800px 는 **스프라이트 시절 값**이다. 화면은 22셀인데 114셀을 구웠다
  //     ⓒ 청크 8셀 + 여유 10셀 → 28×28=784셀 거리장을 64셀 쓰려고 계산(12배 낭비)
  //     ⓓ SUBPX 6 → 셀당 조각 121개. 목업 판정용 값을 그대로 들고 왔다
  //     ⓔ 청크마다 바위 판정을 1600번씩 다시 물었다(여유가 이웃과 겹치는데도)
  //   결과: 조각 108만 → 14만(7.7배) · fill 326만 → 42만
  const MT3_CH = 16;                   // 청크(셀) — 8 → 16. 여유 재계산 낭비 12배 → 5배
  const MT3_PAD = 12;                  // 거리장 여유
  const MT3_HMAX = 9, MT3_LAM = 10;    // 완만형 — 재민 채택
  //   ★세분은 **상수**여야 한다 — 이웃 셀과 다르면 공유 변에 T-접합이 생겨 틈이 벌어진다.
  const MT3_SUB = 6;                   // 셀당 6×6 조각 (한 조각 ≈ 10px)
  const MT3_VIEW = 1050;               // ★3D 전용 수집 반경. 화면 22셀 + 산 높이(288px) 여유
  const MT3_BUDGET = 1;                // ★프레임당 새로 굽는 청크 수. 지면 타일(5)보다 훨씬 무겁다
  const MT3_L = [-0.452, -0.6455, 0.6157];       // 태양 52°/−35°
  const MT3_AMB = 0.24, MT3_DIR = 1.10;
  const MT3_KFLAT = MT3_AMB + MT3_DIR * MT3_L[2];
  const _mt3Chunk = new Map();         // "zid_gx_gy" → segs[]
  const _mt3Dirty = new Set();         // 다시 구울 청크 키(파괴 근처만)
  // ★셀별 바위 판정 캐시. 청크마다 여유(12셀)가 이웃과 겹치는데 매번 다시 물었다 —
  //   청크당 40×40=1600번, 뷰 전체 35,200번. 그게 거리장 74ms/청크의 정체였다.
  //   (`isRockCellLocal` 이 느린 건 알려진 사실이고 **고치지 말라**고 못박힌 정본이다.
  //    그러니 정본을 고치는 게 아니라 **덜 부른다**. 뷰 전체 4,356번으로 8배 준다.)
  const _mt3RockC = new Map();
  function _mt3RockCell(zid, cx, cy) {
    const k = cx * 1048576 + cy;
    const v = _mt3RockC.get(k); if (v !== undefined) return v;
    const r = _mtRockAt(zid, cx * 32 + 16, cy * 32 + 16);
    if (_mt3RockC.size > 60000) _mt3RockC.clear();
    _mt3RockC.set(k, r); return r;
  }
  let _mt3Sig = '';
  const _mt3vn = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = _cellHash(xi, yi, s), b = _cellHash(xi + 1, yi, s);
    const c = _cellHash(xi, yi + 1, s), e = _cellHash(xi + 1, yi + 1, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
  };
  const MT3_RAMP = [[0.00, 76, 104, 52, 0.00], [0.30, 62, 92, 44, 0.62],
                    [0.62, 84, 104, 62, 0.40], [1.00, 126, 130, 120, 0.16]];
  function _mt3Ramp(t) {
    let i = 0; while (i < MT3_RAMP.length - 2 && t > MT3_RAMP[i + 1][0]) i++;
    const a = MT3_RAMP[i], b = MT3_RAMP[i + 1];
    const u = Math.max(0, Math.min(1, (t - a[0]) / Math.max(1e-6, b[0] - a[0])));
    const m = (k) => a[k] + (b[k] - a[k]) * u;
    return 'rgba(' + Math.round(m(1)) + ',' + Math.round(m(2)) + ',' + Math.round(m(3)) + ',' + m(4).toFixed(3) + ')';
  }
  // 청크 하나의 높이장 — 절대 셀 좌표 기준이라 청크 경계에 이음매가 없다
  function _mt3Field(zid, gx, gy) {
    const N = MT3_CH + MT3_PAD * 2;
    const i0 = gx * MT3_CH - MT3_PAD, j0 = gy * MT3_CH - MT3_PAD;
    const rock = new Uint8Array(N * N);
    let any = false;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const r = _mt3RockCell(zid, i0 + i, j0 + j) ? 1 : 0;
      rock[j * N + i] = r; if (r) any = true;
    }
    if (!any) return null;
    const INF = 1e6, d = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) d[k] = rock[k] ? INF : 0;
    const at = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? INF : d[j * N + i];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; if (!d[k]) continue;
      d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; if (!d[k]) continue;
      d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }
    const hg = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!rock[j * N + i]) continue;
      const dE = d[j * N + i], ai = i0 + i, aj = j0 + j;
      let h = MT3_HMAX * (1 - Math.exp(-dE / MT3_LAM));
      const t = Math.min(1, dE / 3);
      h += t * (3.4 * (_mt3vn(ai / 14, aj / 14, 29) - 0.5) + 2.0 * (_mt3vn(ai / 6, aj / 6, 31) - 0.5)
              + 1.5 * (_mt3vn(ai / 2.9, aj / 2.9, 37) - 0.5) + 0.7 * (_mt3vn(ai / 1.6, aj / 1.6, 41) - 0.5));
      const crest = Math.min(1, Math.max(0, (dE - 3) / 5));
      h += crest * (2.2 * (_mt3vn(ai / 4.2, aj / 4.2, 43) - 0.5) + 1.1 * (_mt3vn(ai / 2.1, aj / 2.1, 47) - 0.5));
      hg[j * N + i] = Math.max(0.12, h);
    }
    const t2 = Float32Array.from(hg), SMB = 0.55;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!rock[j * N + i]) continue;
      let sum = t2[j * N + i] * 2, w = 2;
      for (const o of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const ii = i + o[0], jj = j + o[1];
        sum += (ii < 0 || jj < 0 || ii >= N || jj >= N) ? 0 : t2[jj * N + ii]; w++;
      }
      hg[j * N + i] = t2[j * N + i] * (1 - SMB) + (sum / w) * SMB;
    }
    const hAt = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? 0 : hg[j * N + i];
    const cor = (i, j) => (hAt(i - 1, j - 1) + hAt(i, j - 1) + hAt(i - 1, j) + hAt(i, j)) / 4;
    // ★같은 이유로 여기도 smoothstep — 부드러운 법선까지 셀 격자에서 꺾이면 소용이 없다.
    const corS = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y);
      const a = x - xi, b = y - yi, fx = a * a * (3 - 2 * a), fy = b * b * (3 - 2 * b);
      return (cor(xi, yi) * (1 - fx) + cor(xi + 1, yi) * fx) * (1 - fy)
           + (cor(xi, yi + 1) * (1 - fx) + cor(xi + 1, yi + 1) * fx) * fy; };
    return { N, i0, j0, rock, hAt, cor, corS,
             isRock: (i, j) => i >= 0 && j >= 0 && i < N && j < N && !!rock[j * N + i] };
  }
  // ── 청크 하나를 **반대각선 띠**로 구워 세그먼트 배열로 ────────────────────
  function _mt3Bake(zid, gx, gy) {
    const key = zid + '_' + gx + '_' + gy;
    const hit = _mt3Chunk.get(key); if (hit) return hit;
    if (_mt3Budget <= 0) return null;              // ★예산 소진 — 이번 프레임엔 안 굽는다
    _mt3Budget--;
    const F = _mt3Field(zid, gx, gy);
    const segs = [];
    if (F) {
      const P = MT3_PAD;
      // 이 청크가 그리는 셀 = 자기 몫 8×8 중 **메시 셀**(바위 ∪ 바위에 8-인접).
      //   나눗셈으로 소유를 정하므로 중복도 누락도 구조적으로 불가능하다.
      const mesh = [];
      for (let b = 0; b < MT3_CH; b++) for (let a = 0; a < MT3_CH; a++) {
        const i = P + a, j = P + b;
        let m = F.isRock(i, j);
        if (!m) for (let q = -1; q <= 1 && !m; q++) for (let r = -1; r <= 1; r++)
          if (F.isRock(i + r, j + q)) { m = true; break; }
        if (m) mesh.push([i, j]);
      }
      const byK = new Map();
      for (const c of mesh) { const k = c[0] + c[1]; let a = byK.get(k); if (!a) byK.set(k, a = []); a.push(c); }
      const pat = (GTEX.rock_angled && GTEX.rock_angled.naturalWidth) ? GTEX.rock_angled : null;
      const gpat = (GTEX.grass_angled && GTEX.grass_angled.naturalWidth) ? GTEX.grass_angled : null;
      for (const k of [...byK.keys()].sort((a, b) => a - b)) {
        const cells = byK.get(k);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [i, j] of cells) for (const o of [[0,0],[1,0],[1,1],[0,1]]) {
          const gi = F.i0 + i + o[0], gj = F.j0 + j + o[1];
          const c = w2i(gi * 32, gj * 32), Y = c.y - F.cor(i + o[0], j + o[1]) * 32;
          if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        }
        // ★[재민 "검은 점·선"] bbox 를 **변위 없는** 꼭짓점으로 잡고 있었다.
        //   실제로 그릴 때는 급경사 조각이 세로 ±0.42칸(±13px)·가로 ±11px 로 밀린다.
        //   그만큼이 캔버스 밖으로 잘려 **표면에 검은 슬리버**가 생겼다. 여유를 준다.
        const MPAD = 18;
        x0 = Math.floor(x0) - MPAD; y0 = Math.floor(y0) - MPAD;
        const bw = Math.ceil(x1) + MPAD - x0, bh = Math.ceil(y1) + MPAD - y0;
        if (bw <= 0 || bh <= 0 || bw > 4096 || bh > 4096) continue;
        const cv = document.createElement('canvas'); cv.width = bw; cv.height = bh;
        const g = cv.getContext('2d'); g.translate(-x0, -y0);
        const RP = pat ? g.createPattern(pat, 'repeat') : null;
        const GP = gpat ? g.createPattern(gpat, 'repeat') : null;
        for (const [i, j] of cells) _mt3Quad(g, F, i, j, RP, GP);
        const ref = cells.reduce((a, b) => (a[0] + a[1] <= b[0] + b[1] ? a : b));
        const wx = (F.i0 + ref[0]) * 32 + 16, wy = (F.j0 + ref[1]) * 32 + 16;
        const rp = w2i((F.i0 + ref[0]) * 32 + 16, (F.j0 + ref[1]) * 32 + 16);
        // ★알파 사본을 **안 뜬다**. 굽는 시점에 뜨면 띠마다 GPU 리드백 1회 +
        //   힙에 캔버스와 같은 크기(실측 56MB)를 한 벌 더 든다 — 렉 잡겠다고 넣은 게 렉이었다.
        //   가림 판정은 z 게이트를 통과한 극소수 띠에서만 1px 만 읽는다.
        segs.push({ img: cv, x: wx, y: wy, ox: rp.x - x0, oy: rp.y - y0, sc: 1, mt3: 1 });
      }
    }
    if (_mt3Chunk.size > 260) _mt3Chunk.clear();
    _mt3Chunk.set(key, segs);
    return segs;
  }
  // 사각형 하나 — 화면 픽셀 기준 적응 분할 + 급경사 변위
  function _mt3Quad(g, F, i, j, RP, GP) {
    const H4 = [F.cor(i, j), F.cor(i + 1, j), F.cor(i + 1, j + 1), F.cor(i, j + 1)];
    const hmin = Math.min(H4[0], H4[1], H4[2], H4[3]), hmax = Math.max(H4[0], H4[1], H4[2], H4[3]);
    // ★★[재민 "검은 점·선" 진짜 원인] **T-접합**이다.
    //   세분 수(sub)를 셀마다 경사·높이로 다르게 정했다. 이웃한 두 셀의 sub 가 다르면
    //   공유 변의 조각 꼭짓점이 **서로 안 맞는다**. 변위까지 얹히면 그 틈이 벌어져
    //   표면에 검은 슬리버로 남는다. bbox 여유를 줘도 안 없어진 이유가 이것이다.
    //   ⇒ sub 를 **상수**로 고정한다. 공유 변의 꼭짓점이 양쪽에서 같은 자리에 찍힌다.
    //   ★변위도 `st0 > 0.14` 로 **셀 단위 on/off** 였다 — 급한 셀은 밀고 옆의 완만한 셀은
    //     안 밀어서 공유 변이 한쪽만 찢어졌다. 높이(연속량)로만 재운다.
    const sub = MT3_SUB;
    //   ★단, 높이만으로 재우면 **온 사면이 자글자글해진다**(실측: 완만한 곳까지 울퉁불퉁).
    //     변위는 절벽에만 있어야 한다. 그런데 '절벽인가'를 **셀 단위**로 물으면 다시 찢어진다.
    //     ⇒ 꼭짓점 자리에서 **연속 기울기**(corS 차분)를 재서 진폭을 재운다. 양쪽 셀이 같은 값을 본다.
    const steepAt = (x, y) => {
      const gx = F.corS(x + 0.5, y) - F.corS(x - 0.5, y);
      const gy = F.corS(x, y + 0.5) - F.corS(x, y - 0.5);
      return 1 - 1 / Math.hypot(gx, gy, 1);
    };
    const disp = (lx, ly, hh) => {
      const st = steepAt(lx, ly);
      const w = Math.min(1, Math.max(0, (st - 0.16) / 0.34)) * Math.min(1, Math.max(0, (hh - 0.6) / 1.6));
      if (w <= 0) return 0;
      const au = F.i0 + lx, av = F.j0 + ly;
      return w * 0.42 * ((_mt3vn(au * 2.3, av * 2.3, 71) - 0.5) + (_mt3vn(au * 4.9, av * 4.9, 73) - 0.5) * 0.55);
    };
    // ★★[재민 2026-08-09 "아직도 정사각형 타일 흔적이 남는다"] — 원인은 여기다.
    //   높이를 셀 안에서 **이중선형**으로 폈다. 값은 셀 경계에서 이어지지만 **기울기가 꺾인다**
    //   (C0 이지 C1 이 아니다). 법선은 기울기에서 나오므로 경계마다 음영이 툭 꺾이고,
    //   그 꺾임선이 정확히 셀 격자 = 다이아 무늬로 읽힌다. 조각을 아무리 잘게 쪼개도
    //   꺾임은 셀 경계에 그대로 남는다 — 그래서 세분으로는 안 없어졌다.
    //   ⇒ u,v 에 smoothstep 을 먹인다. 경계에서 도함수가 0 이 되어 양쪽이 **매끈히 이어진다**(C1).
    //     추가 표본 없이 곱셈 몇 번이라 굽기 비용은 그대로다.
    const hBi = (u, v) => {
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      return (H4[0] * (1 - su) + H4[1] * su) * (1 - sv) + (H4[3] * (1 - su) + H4[2] * su) * sv;
    };
    const hS = (u, v) => { const b = hBi(u, v); return Math.max(0, b + disp(i + u, j + v, b)); };
    const P = (u, v) => {
      const c = w2i((F.i0 + i + u) * 32, (F.j0 + j + v) * 32), hh = hS(u, v);
      // 가로 변위도 **높이만**으로 재운다(셀 단위 조건이 들어가면 공유 변이 찢어진다)
      const jw = Math.min(1, Math.max(0, (steepAt(i + u, j + v) - 0.16) / 0.34))
               * Math.min(1, Math.max(0, (hh - 0.6) / 1.6));
      const jx = (_mt3vn((F.i0 + i + u) * 2.1, (F.j0 + j + v) * 2.1, 79) - 0.5) * jw * 0.42 * 26;
      return [c.x + jx, c.y - hh * 32];
    };
    const soft = (x, y) => {
      const e = F.corS(x + 1, y), w = F.corS(x - 1, y), n = F.corS(x, y - 1), s2 = F.corS(x, y + 1), c = F.corS(x, y);
      const gx = (e - w) * 0.5, gy = (s2 - n) * 0.5, nl = Math.hypot(gx, gy, 1) || 1;
      const d2 = (-gx / nl) * MT3_L[0] + (-gy / nl) * MT3_L[1] + (1 / nl) * MT3_L[2];
      return { lam: Math.max(0.14, d2) + Math.max(0, -d2) * 0.20, conc: (e + w + n + s2) / 4 - c };
    };
    for (let sv = 0; sv < sub; sv++) for (let su = 0; su < sub; su++) {
      const u0 = su / sub, u1 = (su + 1) / sub, v0 = sv / sub, v1 = (sv + 1) / sub;
      const cx = i + (u0 + u1) / 2, cy = j + (v0 + v1) / 2, so = soft(cx, cy);
      const A = P(u0, v0), B = P(u1, v0), C2 = P(u1, v1), D = P(u0, v1);
      const hNW = hS(u0, v0), hNE = hS(u1, v0), hSE = hS(u1, v1), hSW = hS(u0, v1);
      const cw = 32 / sub;
      const ux = [cw, cw, (hSE - hNW) * 32], vx = [cw, -cw, (hNE - hSW) * 32];
      let nx = ux[1] * vx[2] - ux[2] * vx[1], ny = ux[2] * vx[0] - ux[0] * vx[2], nz = ux[0] * vx[1] - ux[1] * vx[0];
      const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const lamD = nx * MT3_L[0] + ny * MT3_L[1] + nz * MT3_L[2];
      const lam = (Math.max(0.14, lamD) + Math.max(0, -lamD) * 0.20) * 0.52 + so.lam * 0.48;
      const hAvg = (hNW + hNE + hSE + hSW) / 4, steep = 1 - nz;
      // 무게중심으로 살짝 부풀려 실틈 방지(조명도 같은 도형에 얹힌다)
      let px = 0, py = 0; const pts = [A, B, C2, D];
      for (const q of pts) { px += q[0]; py += q[1]; } px /= 4; py /= 4;
      // ★부풀리기는 **모든 층이 같은 값**을 써야 한다. 불투명만 부풀리고 반투명을 안 부풀리면
      //   조각마다 0.55px 의 **안 칠해진 테두리**가 남아 밝은 그물이 된다(실제로 그렇게 됐다).
      //   반대로 둘 다 부풀리면 겹친 자리가 두 번 어두워져 어두운 그물이 된다.
      //   ⇒ 값을 조각 크기(10px)에 견줘 무시할 만큼 줄인다: 0.55 → 0.18px.
      const inf = pts.map(q => { const dx = q[0] - px, dy = q[1] - py, l = Math.hypot(dx, dy) || 1;
        return [q[0] + dx / l * 0.18, q[1] + dy / l * 0.18]; });
      // ★[재민 "잔 격자"] 실틈 막으려 0.55px 부풀린 도형에 **반투명**(틴트·음영)까지 얹으면
      //   조각 경계에서 두 번 합성돼 격자 그물이 남는다. 조각이 10px 이라 그물도 10px 이다.
      //   ⇒ **불투명 바탕만 부풀리고**(겹쳐도 무해), 반투명 층은 부풀리지 않은 도형에 얹는다.
      const path = () => { g.beginPath(); g.moveTo(inf[0][0], inf[0][1]);
        for (let n2 = 1; n2 < 4; n2++) g.lineTo(inf[n2][0], inf[n2][1]); g.closePath(); };
      const pathT = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let n2 = 1; n2 < 4; n2++) g.lineTo(pts[n2][0], pts[n2][1]); g.closePath(); };
      const macro = (_mt3vn((F.i0 + cx) / 21, (F.j0 + cy) / 21, 61) - 0.5) * 1.5
                  + (_mt3vn((F.i0 + cx) / 8.5, (F.j0 + cy) / 8.5, 63) - 0.5) * 0.7
                  + (_mt3vn((F.i0 + cx) / 3.1, (F.j0 + cy) / 3.1, 67) - 0.5) * 0.35;
      let t = Math.max(0, Math.min(1, (steep - 0.10) / 0.62)) * 0.68
            + Math.max(0, Math.min(1, (hAvg / MT3_HMAX - 0.10) / 0.80)) * 0.32 + macro * 0.20;
      t = Math.max(0, Math.min(1, t * Math.max(0, Math.min(1, (hAvg - 0.2) / 1.0))));
      const use = (t < 0.10 ? GP : RP);
      if (use) { use.setTransform(new DOMMatrix().translate(0, -Math.round(hAvg * 32)).scale(t < 0.10 ? 1 : 0.35, t < 0.10 ? 1 : 0.35));
                 g.fillStyle = use; } else g.fillStyle = t < 0.10 ? '#5a7040' : '#6b6b6b';
      path(); g.fill();
      g.fillStyle = _mt3Ramp(t); path(); g.fill();
      // 램버트·AO·층·접지·대기원근을 **한 겹**으로 (여러 겹이면 겹친 자리에 줄이 남는다)
      const k = (MT3_AMB + MT3_DIR * lam) / MT3_KFLAT;
      let cr = 0, cg = 0, cb = 0, ca = 0;
      const add = (r2, g2, b2, a2) => { if (a2 <= 0.002) return; const na = ca + a2 * (1 - ca); if (na <= 0) return;
        const w2 = a2 * (1 - ca) / na; cr = cr * (1 - w2) + r2 * w2; cg = cg * (1 - w2) + g2 * w2; cb = cb * (1 - w2) + b2 * w2; ca = na; };
      if (k < 1) add(12, 15, 20, Math.min(0.88, (1 - k) * 1.05)); else if (k > 1) add(255, 247, 226, Math.min(0.55, (k - 1) * 0.62));
      if (so.conc > 0.02) add(16, 20, 26, Math.min(0.42, so.conc * 0.36));
      else if (so.conc < -0.02) add(255, 250, 236, Math.min(0.22, -so.conc * 0.19));
      if (steep > 0.30) { const bt = Math.abs(((hAvg / 2.2) % 1) - 0.5) * 2;
        add(22, 24, 28, Math.max(0, (0.30 - bt) / 0.30) * Math.min(0.42, (steep - 0.30) * 0.80)); }
      if (F.isRock(i, j)) { const dd = Math.max(0, 1.6 - (hAvg > 0 ? 1.6 : 0)); void dd; }
      if (hAvg > 0.5) add(186, 200, 216, Math.min(0.09, (hAvg / MT3_HMAX) * 0.09));
      if (ca > 0.002) { g.fillStyle = 'rgba(' + Math.round(cr) + ',' + Math.round(cg) + ',' + Math.round(cb) + ',' + ca.toFixed(3) + ')'; path(); g.fill(); }
    }
  }
  let _mt3Budget = 0;
  function _mt3Collect(out, cx0, cy0) {
    const zid = primaryZoneId; if (!zid) return 0;
    if (zid !== _mt3Sig) { _mt3Sig = zid; _mt3Chunk.clear(); }
    // ★파괴는 **그 근처 청크만** 다시 굽는다. 전부 비우면 곡괭이질 한 번에 화면이 멈춘다.
    if (_mt3Dirty.size) { for (const k of _mt3Dirty) _mt3Chunk.delete(k); _mt3Dirty.clear(); }
    _mt3Budget = MT3_BUDGET;
    const c0 = Math.floor((cx0 - MT3_VIEW) / 32), c1 = Math.floor((cx0 + MT3_VIEW) / 32);
    const r0 = Math.floor((cy0 - MT3_VIEW) / 32), r1 = Math.floor((cy0 + MT3_VIEW) / 32);
    let n = 0;
    for (let gy = Math.floor(r0 / MT3_CH); gy <= Math.floor(r1 / MT3_CH); gy++)
      for (let gx = Math.floor(c0 / MT3_CH); gx <= Math.floor(c1 / MT3_CH); gx++) {
        const segs = _mt3Bake(zid, gx, gy);
        if (!segs) { needsRedraw = true; continue; }   // 아직 안 구운 청크 — 다음 프레임에
        for (const sg of segs) {
          if (Math.abs(sg.x - cx0) > MT3_VIEW || Math.abs(sg.y - cy0) > MT3_VIEW) continue;
          // −0.5: 같은 셀 위에 선 개체가 산보다 **앞**에 오도록(라이브 z 규약과 동형)
          out.push({ z: w2i(sg.x, sg.y).y - 0.5, kind: 'mtseg', sg, wx: sg.x, wy: sg.y });
          n++;
        }
      }
    return n;
  }
  let _mt3Fail = 0;
  let _mtChunkSig = '';
  function _mtCollectCover(out, cx0, cy0) {
    const zid = primaryZoneId; if (!zid) return 0;
    // ★청크는 **굽는 시점의 손잡이 값**을 품는다 — 손잡이를 뒤집어도 캐시가 그대로면
    //   A/B 대조군이 그림에 안 나타난다(하네스가 이걸 잡았다). 서명이 바뀌면 다시 굽는다.
    const sig = (_t19.footOff ? 'F' : '') + (_t19.fitOff ? 'X' : '') + zid;
    if (sig !== _mtChunkSig) { _mtChunkSig = sig; _mtChunk.clear(); }
    const c0 = Math.floor((cx0 - MT_VIEW_PAD) / 32), c1 = Math.floor((cx0 + MT_VIEW_PAD) / 32);
    const r0 = Math.floor((cy0 - MT_VIEW_PAD) / 32), r1 = Math.floor((cy0 + MT_VIEW_PAD) / 32);
    let n = 0;
    for (let gy = Math.floor(r0 / MT_CH); gy <= Math.floor(r1 / MT_CH); gy++) {
      for (let gx = Math.floor(c0 / MT_CH); gx <= Math.floor(c1 / MT_CH); gx++) {
        for (const sg of _mtChunkSegs(zid, gx, gy)) {
          if (Math.abs(sg.x - cx0) > MT_VIEW_PAD || Math.abs(sg.y - cy0) > MT_VIEW_PAD) continue;
          out.push({ z: w2i(sg.x, sg.y).y, kind: 'mtseg', sg, wx: sg.x, wy: sg.y });
          n++;
        }
      }
    }
    return n;
  }
  function _mtCollect(out, cx0, cy0) {
    if (_t19.mtOff) return 0;
    // ★[재민 2026-08-09 "이대로 본게임 ㄱ"] 기본은 3D. 손잡이 `mt3dOff` 로 스프라이트 복귀.
    //   ★어떤 이유로든 터지면 **스프라이트 판으로 되돌아간다** — 라이브를 못 세운다.
    if (!_t19.mt3dOff) {
      try {
        const n3 = _mt3Collect(out, cx0, cy0);
        if (n3 > 0 || !_mt3Fail) return n3;
      } catch (e) {
        if (!_mt3Fail) { _mt3Fail = 1; console.warn('[mt3d] 실패 — 스프라이트 판으로 되돌아간다:', e && e.message); }
      }
    }
    if (!_mtAnchors || _mtLoaded < _mtWanted) return 0;
    const H = _hardTerrain; if (!H) return 0;
    if (!_t19.mtLegacy) return _mtCollectCover(out, cx0, cy0);
    let n = 0;
    for (const zid in H) {
      const z = zonesMeta[zid]; if (!z) continue;
      const ox = z.worldOffsetX, oy = z.worldOffsetY || 0;
      const rs = H[zid].ridges || [];
      for (let ri = 0; ri < rs.length; ri++) {
        // 능선 바운딩 박스로 먼저 거른다 — 전 존 능선을 매 프레임 훑지 않는다
        const pp = rs[ri].path;
        let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        for (let k = 0; k < pp.length; k += 8) {
          const px = ox + pp[k].pos[0], py = oy + pp[k].pos[1];
          if (px < mnx) mnx = px; if (px > mxx) mxx = px; if (py < mny) mny = py; if (py > mxy) mxy = py;
        }
        if (cx0 < mnx - MT_VIEW_PAD || cx0 > mxx + MT_VIEW_PAD || cy0 < mny - MT_VIEW_PAD || cy0 > mxy + MT_VIEW_PAD) continue;
        for (const sg of _mtPlaceRidge(zid, rs[ri], ox, oy, ri)) {
          if (Math.abs(sg.x - cx0) > MT_VIEW_PAD || Math.abs(sg.y - cy0) > MT_VIEW_PAD) continue;
          out.push({ z: w2i(sg.x, sg.y).y, kind: 'mtseg', sg, wx: sg.x, wy: sg.y });
          n++;
        }
      }
    }
    return n;
  }
  // ★세그먼트 톤 변주 — 방위당 변주 3종만으로는 같은 스프라이트가 줄줄이 서면 '아코디언 벽'이 된다.
  //   시안 정본이 쓰던 2단 틴트를 그대로 옮긴다(오프스크린 1회 캐시 — 매 프레임 합성 아님).
  const _mtTint = new Map();
  function _mtTinted(name, v) {
    const k = name + v; const hit = _mtTint.get(k); if (hit) return hit;
    const im = MTX[name]; if (!im || !im.complete || !im.naturalWidth) return im;
    const t = document.createElement('canvas'); t.width = im.naturalWidth; t.height = im.naturalHeight;
    const tg = t.getContext('2d'); tg.drawImage(im, 0, 0);
    tg.globalCompositeOperation = 'source-atop';
    tg.fillStyle = v === 0 ? 'rgba(96,82,60,0.12)' : 'rgba(70,64,48,0.18)';
    tg.fillRect(0, 0, t.width, t.height);
    _mtTint.set(k, t); return t;
  }
  // ═══ 산이 나를 가리면 그 자리만 뚫는다 ═══════════════════════════════════════
  // ★★[재민 2026-08-07] *"산의 서쪽이나 북쪽에 있어서 화면에 가려질 때에는 산은 투명해져야 해"*
  //
  //   ⓐ **왜 생기나(실측)**: 플레이어 z 에는 `+500` 편향이 있어 **31셀 안쪽** 산은 이미
  //      플레이어 뒤로 간다. 문제는 그보다 **멀리 남동쪽**에 있는 큰 산이다 — 발치는 화면
  //      아래쪽에 있는데 몸통이 위로 2000px 넘게 뻗어 올라와 나를 덮는다.
  //      ⇒ 즉 "내가 산의 서/북쪽"일 때만 생긴다. 재민 관찰과 정확히 일치한다.
  //   ⓑ **왜 숨기지 않고 반투명인가**: 집 지붕은 '미표시'(좀보이드 문법)지만 재민 지시는 **반투명**이다.
  //      산이 통째로 사라지면 지형이 없어져 방향 감각이 깨진다 — 산은 남고 **뒤가 비친다**.
  //   ⓒ **판정은 상자가 아니라 알파로** 한다. 스프라이트 프레임의 86%는 투명 여백이라
  //      상자로 재면 "닿지도 않은 산"이 흐려진다(자명 통과 금지 — 반례가 실제로 존재한다).
  //   ⓓ 가리는 **한 장만** 반투명하다. 화면의 다른 산은 그대로다 — 그게 반례이자 판정이다.
  const MT_OCC_A = 0.34, MT_FADE_MS = 220;   // 반투명 세기 · 켜고 끄는 시간(껌뻑임 방지)
  let _mtOcc = null, _mtOccN = 0, _mtFadedN = 0, _mtFadeAmt = 0, _mtToScr = null;   // 내 화면 좌표·z · 가린 장수 · 반투명 진행도
  const _mtAlphaMap = new Map();
  function _mtAlphaAt(name, u, v) {
    let m = _mtAlphaMap.get(name);
    if (!m) {
      const im = MTX[name]; if (!im || !im.complete || !im.naturalWidth) return 1;
      const N = 64, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
      const g2 = cv.getContext('2d'); g2.drawImage(im, 0, 0, N, N);
      const d = g2.getImageData(0, 0, N, N).data, a = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) a[i] = d[i * 4 + 3];
      m = { N, a }; _mtAlphaMap.set(name, m);
    }
    const ix = m.N - 1 < (u * m.N | 0) ? m.N - 1 : (u < 0 ? 0 : (u * m.N | 0));
    const iy = m.N - 1 < (v * m.N | 0) ? m.N - 1 : (v < 0 ? 0 : (v * m.N | 0));
    return m.a[iy * m.N + ix] / 255;
  }
  function _mtDraw(g, item, toScr) {
    const sg = item.sg;
    if (sg.mt3) {                       // ★3D 띠 — 구운 캔버스를 앵커로 꽂는다
      _mtToScr = toScr;
      const p3 = w2i(sg.x, sg.y), c3 = toScr(p3.x, p3.y);
      const dx3 = Math.round(c3.x - sg.ox), dy3 = Math.round(c3.y - sg.oy);
      const fade3 = _mtFadeAmt > 0.002 && (_mtOcc ? item.z > _mtOcc.z : false) && !_t19.occOff;
      if (!fade3) { g.drawImage(sg.img, dx3, dy3); return; }
      _mtFadedN++; if (window.__mtOccDbg) window.__mtOccDbg.faded = _mtFadedN;
      const fg3 = _mtFadeLayer(g);
      if (!fg3) { g.save(); g.globalAlpha = 1 - (1 - MT_OCC_A) * _mtFadeAmt; g.drawImage(sg.img, dx3, dy3); g.restore(); return; }
      fg3.drawImage(sg.img, dx3, dy3);
      return;
    }
    const an = _mtAnchors[sg.name], im0 = MTX[sg.name];
    if (!an || !im0 || !im0.complete) return;
    const im = _mtTinted(sg.name, _cellHash(Math.round(sg.x), Math.round(sg.y), 91) < 0.5 ? 0 : 1);
    const sc = (64 / Math.SQRT2) / an.ppu * sg.sc, vy = sg.vy || 1;
    _mtToScr = toScr;
    const p = w2i(sg.x + (sg.jx || 0), sg.y + (sg.jy || 0)), c = toScr(p.x, p.y);
    // 높이 지터는 **앵커(발치) 고정, 세로만 배율** — 능선 스카이라인이 출렁이게(시안 정본과 동일)
    const W = im0.naturalWidth * sc, H = im0.naturalHeight * sc * vy;
    const dx = c.x - an.ox * sc, dy = c.y - an.oy * sc * vy;
    // ★★[재민 2026-08-07 2차 정정] *"사실상 화면 전체 산이 다 반투명해져야 한다는 거야..
    //   산에 어느 정도 가까이 가면.. 캐릭터가 가려지기 시작할 쯤부터.. 물론 북서쪽에 있을 때만"*
    //   ⇒ **한 장이 아니라 앞쪽(내 남동) 산 전부**가 같이 흐려진다. 한 장만 흐려지면
    //     그 산만 유리처럼 보이고 나머지가 여전히 나를 가린다 — 문제가 안 풀린다.
    //   ⇒ 방아쇠는 "가려지기 시작할 때"다: 이번 프레임에 나를 실제로 덮는 산이 하나라도 있으면 켠다.
    //   ⇒ **북서쪽에 있을 때만**: 내 뒤(z 작은 쪽) 산은 애초에 나를 못 가리므로 손대지 않는다.
    const behind = _mtOcc ? item.z > _mtOcc.z : false;
    const fade = _mtFadeAmt > 0.002 && behind && !_t19.occOff;
    if (!fade) { g.drawImage(im, dx, dy, W, H); return; }
    // ★★반투명은 **한 겹으로 모아** 한 번만 합성한다 [2026-08-07 실측].
    //   장마다 알파를 걸면 겹칠수록 다시 불투명해진다 — 0.34 를 3겹 쌓으면 71% 다.
    //   실측에서 앞쪽 산 128장이 흐려졌는데도 내 자리는 78% 나 남아 있었다(기대치 34%).
    //   오프스크린에 **불투명으로 다 그린 뒤** 그 레이어를 알파로 한 번 덮으면 겹침이 안 쌓인다.
    //   ⚠대가: 흐린 무리 사이에 낀 개체는 무리 뒤로 간다. 그 개체들은 어차피 산에 가려 있고
    //     전부 내 앞(남동)이라 실害가 없다 — 나중에 문제가 되면 그때 z 를 쪼갠다.
    _mtFadedN++; if (window.__mtOccDbg) window.__mtOccDbg.faded = _mtFadedN;
    const fg = _mtFadeLayer(g);
    if (!fg) { g.save(); g.globalAlpha = 1 - (1 - MT_OCC_A) * _mtFadeAmt; g.drawImage(im, dx, dy, W, H); g.restore(); return; }
    fg.drawImage(im, dx, dy, W, H);
    return;
  }
  // 이 산 한 장이 나를 실제로 덮는가 — 스캔과 그리기가 **같은 식**을 쓴다(사본 금지)
  function _mtOccludesMe(sg, z) {
    if (!_mtOcc || z <= _mtOcc.z) return false;
    if (sg.mt3) {
      // 구운 캔버스의 **실제 알파**를 읽는다. 상자로 재면 투명 여백에 선 자리를 잘못 잡는다.
      const p3 = w2i(sg.x, sg.y), c3 = _mtToScr ? _mtToScr(p3.x, p3.y) : null; if (!c3) return false;
      const ux = Math.round(_mtOcc.x - (c3.x - sg.ox)), uy = Math.round(_mtOcc.y - (c3.y - sg.oy));
      if (ux < 0 || uy < 0 || ux >= sg.img.width || uy >= sg.img.height) return false;
      try { return sg.img.getContext('2d').getImageData(ux, uy, 1, 1).data[3] > 90; } catch (e) { return true; }
    }
    const an = _mtAnchors[sg.name], im0 = MTX[sg.name];
    if (!an || !im0 || !im0.complete || !im0.naturalWidth) return false;
    const sc = (64 / Math.SQRT2) / an.ppu * sg.sc, vy = sg.vy || 1;
    const W = im0.naturalWidth * sc, H = im0.naturalHeight * sc * vy;
    const p = w2i(sg.x + (sg.jx || 0), sg.y + (sg.jy || 0));
    const c = _mtToScr ? _mtToScr(p.x, p.y) : null; if (!c) return false;
    const dx = c.x - an.ox * sc, dy = c.y - an.oy * sc * vy;
    const u = (_mtOcc.x - dx) / W, v = (_mtOcc.y - dy) / H;
    if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return false;
    // ★상자가 아니라 알파로 — 프레임의 86%가 투명 여백이라 상자로 재면 안 닿은 산도 걸린다
    return _mtAlphaAt(sg.name, u, v) > 0.35;
  }
  // 프레임당 1회 — 나를 덮는 산이 하나라도 있나. 있으면 앞쪽 산 **전부**를 흐린다.
  // ★튀지 않게 시간으로 완만히 켜고 끈다(경계에서 껌뻑이면 그게 더 거슬린다).
  // 흐린 산을 모으는 오프스크린 — 화면 크기, 프레임당 1회 비움
  let _mtFadeCv = null, _mtFadeG = null, _mtFadeUsed = false;
  function _mtFadeLayer(g) {
    const cv = g.canvas; if (!cv) return null;
    if (!_mtFadeCv) { _mtFadeCv = document.createElement('canvas'); }
    if (_mtFadeCv.width !== cv.width || _mtFadeCv.height !== cv.height) {
      _mtFadeCv.width = cv.width; _mtFadeCv.height = cv.height; _mtFadeG = null;
    }
    if (!_mtFadeG) _mtFadeG = _mtFadeCv.getContext('2d');
    if (!_mtFadeUsed) {
      _mtFadeUsed = true;
      _mtFadeG.setTransform(1, 0, 0, 1, 0, 0);
      _mtFadeG.clearRect(0, 0, _mtFadeCv.width, _mtFadeCv.height);
      _mtFadeG.setTransform(g.getTransform());
    }
    return _mtFadeG;
  }
  function _mtFlushFade(g) {
    if (!_mtFadeUsed || !_mtFadeCv) return;
    _mtFadeUsed = false;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1 - (1 - MT_OCC_A) * _mtFadeAmt;
    g.drawImage(_mtFadeCv, 0, 0);
    g.restore();
  }
  let _mtFadeT = 0;
  function _mtFadeDt() {                     // ★시계는 프레임에서 온다 — Math.random 도, 고정 상수도 아니다
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    const dt = _mtFadeT ? Math.min(120, now - _mtFadeT) : 16;
    _mtFadeT = now; return dt;
  }
  let _mtLastRend = null;
  function _mtUpdateFade(renderables, dtMs) {
    _mtLastRend = renderables;
    let hit = 0;
    if (_mtOcc && !_t19.occOff) {
      for (let i = 0; i < renderables.length; i++) {
        const it = renderables[i];
        if (it.kind !== 'mtseg') continue;
        if (_mtOccludesMe(it.sg, it.z)) { hit++; break; }
      }
      let fr = 0;
      for (let i = 0; i < renderables.length; i++) {
        const it = renderables[i];
        if (it.kind === 'mtseg' && it.z > _mtOcc.z) fr++;
      }
      if (window.__mtOccDbg) window.__mtOccDbg.front = fr;
    }
    _mtOccN = hit;
    if (window.__mtOccDbg) { window.__mtOccDbg.n = hit; window.__mtOccDbg.fade = +_mtFadeAmt.toFixed(2); }
    const step = Math.min(1, Math.max(0, dtMs) / MT_FADE_MS);
    _mtFadeAmt += ((hit ? 1 : 0) - _mtFadeAmt) * step;
    if (_mtFadeAmt < 0.002) _mtFadeAmt = 0;
    if (_mtFadeAmt > 0.998) _mtFadeAmt = 1;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 21 실장] 자연물 산포 — 물가 술(fringe) · 초원 소품(들꽃·풀숲)
  //
  //   ⓐ **왜 술인가**: 지면 질감이 물가에서 수직으로 잘려 '절단선'이 보인다(재민 지적).
  //      술은 그 선 위로 넘어와 경계를 흐트러뜨리는 게 존재 이유다 — 그래서 **물 위로 민다**.
  //   ⓑ **균일 간격 금지**(재민: 시안의 변 전체 균일 밀식 = "일부러 심은 느낌"):
  //      · 밀도 저주파 변주 — 파장 5셀의 값 노이즈. 문턱 아래 구간은 **아예 0**(빈 물가)이다.
  //      · 물가 안쪽 1~2셀 감쇠 산포 — 물가 '선'에만 몰리면 목걸이가 된다.
  //      · 포기별 크기·높이 변주 + 종(풀포기/갈대/부들) 혼합. 전부 자리 해시(Math.random 금지).
  //   ⓒ **갈대·부들은 고증의 본체**(송국리 저습지) — 물과 맞닿은 셀의 '빽빽한' 구간에만 선다.
  //   ⓓ **그리는 순서 = 계약**: 물 셰이더 → `_drawPrisms` → **여기** → 안개 마스크.
  //      renderables 에 태워 엔티티와 함께 z 정렬한다(배치 20 A 의 `kind:'mtseg'` 와 동형).
  //      뒤에 그리면(안개 마스크 뒤) 캄캄한 땅 위에 풀이 뜬다 — 배치 19 실측.
  //   ⓔ **비용**: 술은 개수가 많다. 8×8셀 청크 단위로 **정적 배치를 캐시**하고(지형은 정적),
  //      청크 안에서 물 판정을 14×14 로 **한 번만** 훑어 셀마다 7×7 재조회하는 낭비를 없앤다.
  //   ⓕ 초원 소품(들꽃·풀숲)은 자리는 정적이지만 **회피 판정은 동적**이다(길·사유지·경작지가
  //      생긴다). 그래서 후보 자리만 캐시하고 회피는 수집 시점에 건다. **회피 판정은 전부
  //      클라가 이미 받는 값**이다 — roads · claims · simVillages · buildings. 새로 만들지 않는다.
  // ═══════════════════════════════════════════════════════════════════════════
  const NAT_KINDS = { grass: 4, reed: 3, cattail: 3, flower: 4 };
  const NATX = {};
  let _natAnchors = null, _natLoaded = 0, _natWanted = 0;
  (async () => {
    try {
      const r = await fetch('/assets/nature/nature_anchors.json');
      if (!r.ok) return;
      _natAnchors = await r.json();
      for (const cls in NAT_KINDS) {
        for (let i = 1; i <= NAT_KINDS[cls]; i++) {
          const n = cls + String(i).padStart(2, '0');
          if (!_natAnchors[n]) continue;
          _natWanted++;
          const im = new Image(); im.onload = () => _natLoaded++; im.src = '/assets/nature/' + n + '.png';
          NATX[n] = im;
        }
      }
      console.log('[nat] 자연물 스프라이트', _natWanted, '종 로드 시작');
    } catch (e) { console.warn('[nat] 앵커 로드 실패:', e.message); }
  })();

  const NAT_VIEW_PAD = 1500;          // ★렌더 반경. AOI 의 VIEW_RADIUS(650)는 **렌더 함수 지역 상수**라
  //                                   여기서 못 쓴다(1패스 실사고: ReferenceError 로 엔티티 패스가 통째로 죽었다).
  //                                   지면 데코는 AOI 와 무관하게 화면 끝까지 보여야 하므로 자체 상수를 쓴다(산 1800 과 동형).
  const NAT_WAVE = 5;                 // 저주파 밀도 파장(셀) — 군락 ↔ 빈 구간의 교대 주기
  const NAT_CH = 8;                   // 청크 = 8×8셀(지면 베이크 타일과 같은 눈금)
  const NAT_PAD = 3;                  // 청크 둘레 여유(물 거리 최대 3셀까지 본다)
  const _natChunk = new Map();        // "ccx_ccy" → { fr: [...], pr: [...] }  (정적)
  function _natNoise(cx, cy, salt) {  // 값 노이즈(부드러운 보간) — 해시만 쓰면 셀마다 튀어 군락이 안 생긴다
    const gx = Math.floor(cx / NAT_WAVE), gy = Math.floor(cy / NAT_WAVE);
    const fx = cx / NAT_WAVE - gx, fy = cy / NAT_WAVE - gy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = _cellHash(gx, gy, salt), b = _cellHash(gx + 1, gy, salt);
    const c = _cellHash(gx, gy + 1, salt), d = _cellHash(gx + 1, gy + 1, salt);
    const t = a + (b - a) * sx, u = c + (d - c) * sx;
    return t + (u - t) * sy;
  }
  function _natBuildChunk(ccx, ccy) {
    // ★시안 손잡이 `frFloor` — 밀도 저주파 변주의 **바닥값**. 0(기본) 이면 문턱 아래 물가는
    //   한 포기도 안 선다(= 재민 지시 "빈 구간이 셀 몇 개 단위로 교대"). >0 이면 빈 구간에도
    //   최소 밀도가 깔려 절단선이 어디서나 덮이는 대신 군락 대비가 약해진다. 캐시 키에 넣어
    //   런타임에 갈아 끼워도 배치가 다시 계산된다(하네스가 같은 프레임 A/B 를 얻는 길).
    //   ★기본값 0 인 이유는 취향이 아니라 **실측**이다: 0.25 로 깔면 화면은 더 낫지만
    //   물가 회랑의 '빈 블록'이 31%→15% 로 떨어져 e2e-nature ⓑ(≥18%)를 통과하지 못한다.
    //   그 판정은 재민이 글로 못박은 "빈 구간이 셀 몇 개 단위로 교대"를 옮긴 것이라
    //   **판정을 완화해서 취향을 통과시키지 않는다.** 시안은 보고서 §6 에 붙였다.
    const key = ccx + '_' + ccy + '_' + (_t19.frFloor || 0);
    const hit = _natChunk.get(key); if (hit) return hit;
    const S = NAT_CH + NAT_PAD * 2;
    const wet = new Uint8Array(S * S), rock = new Uint8Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const cx = ccx * NAT_CH + i - NAT_PAD, cy = ccy * NAT_CH + j - NAT_PAD;
      const wx = cx * 32 + 16, wy = cy * 32 + 16;
      wet[j * S + i] = isWaterAtAbs(wx, wy) ? 1 : 0;
      rock[j * S + i] = isRockAtAbs(wx, wy) ? 1 : 0;
    }
    const fr = [], pr = [];
    for (let dy = 0; dy < NAT_CH; dy++) for (let dx = 0; dx < NAT_CH; dx++) {
      const i0 = dx + NAT_PAD, j0 = dy + NAT_PAD;
      if (wet[j0 * S + i0] || rock[j0 * S + i0]) continue;
      const cx = ccx * NAT_CH + dx, cy = ccy * NAT_CH + dy;
      const wx = cx * 32 + 16, wy = cy * 32 + 16;
      // 가장 가까운 물까지의 체비셰프 거리 + 그 물들이 있는 방향(합)
      let best = 99, sx2 = 0, sy2 = 0;
      for (let ny = -NAT_PAD; ny <= NAT_PAD; ny++) for (let nx = -NAT_PAD; nx <= NAT_PAD; nx++) {
        if (!nx && !ny) continue;
        const dd = Math.abs(nx) > Math.abs(ny) ? Math.abs(nx) : Math.abs(ny);
        if (dd > best) continue;
        if (!wet[(j0 + ny) * S + (i0 + nx)]) continue;
        if (dd < best) { best = dd; sx2 = 0; sy2 = 0; }
        sx2 += nx; sy2 += ny;
      }
      if (best <= NAT_PAD) {
        // ── 물가 술 ──
        const band = best - 1;                              // 0 = 물과 맞닿은 셀
        const q = _natNoise(cx, cy, 4211);
        //  ★문턱 0.34 — 이 아래는 **한 포기도 안 선다**. "일부러 심은 느낌"을 깨는 건 밀도가 아니라
        //    빈 구간의 존재다. 문턱 위에서는 (q-0.34)/0.46 로 0→1 까지 부드럽게 빽빽해진다.
        const amp = (q - 0.34) / 0.46;
        const a2 = amp > 0 ? (amp > 1 ? 1 : amp) : 0;
        const flr = _t19.frFloor || 0;
        const dens = (band === 0 ? 2.8 : band === 1 ? 1.3 : 0.5) * (flr + (1 - flr) * a2);
        const n = Math.floor(dens + _cellHash(cx, cy, 4212));
        const L = Math.sqrt(sx2 * sx2 + sy2 * sy2) || 1, ux = sx2 / L, uy = sy2 / L;
        for (let i = 0; i < n; i++) {
          const h1 = _cellHash(cx, cy, 4300 + i), h2 = _cellHash(cx, cy, 4400 + i);
          const h3 = _cellHash(cx, cy, 4500 + i), h4 = _cellHash(cx, cy, 4700 + i);
          let px, py;
          if (band === 0) {
            // ★물 쪽으로 민다 — 셀 반폭이 16px 이므로 12~28px 는 **물 위로 최대 12px** 넘어간다.
            //   이 넘김이 곧 절단선 은폐다. 변을 따라서는 ±13px 흩는다(줄서기 방지).
            const push = 12 + 16 * h1;
            px = wx + ux * push - uy * (h2 - 0.5) * 26;
            py = wy + uy * push + ux * (h2 - 0.5) * 26;
          } else {
            px = wx + (h1 - 0.5) * 26; py = wy + (h2 - 0.5) * 26;
          }
          let nm;
          if (band === 0 && q > 0.62 && h3 > 0.40) nm = (h3 > 0.70 ? 'reed0' : 'cattail0') + (1 + ((h4 * 3) | 0));
          else nm = 'grass0' + (1 + ((h4 * 4) | 0));
          fr.push({ x: px, y: py, nm, sc: 0.66 + 0.40 * h3, vy: 0.86 + 0.30 * h2,
                    ph: _cellHash(cx, cy, 4800 + i) * 6.2832 });   // 바람 위상 — 포기마다 다르다
        }
      } else {
        // ── 초원 소품(들꽃·풀숲) — 밀도 낮게. 스폰 광장이 첫인상이라 과밀은 금물이다.
        const q2 = _natNoise(cx, cy, 8117);
        const thr = 0.978 - 0.055 * (q2 > 0.5 ? (q2 - 0.5) * 2 : 0);  // 0.978~0.923 — 빈 초원↔꽃밭이 저주파로 교대
        const h0 = _cellHash(cx, cy, 8118);
        if (h0 > thr) {
          const h1 = _cellHash(cx, cy, 8201), h2 = _cellHash(cx, cy, 8202);
          const h3 = _cellHash(cx, cy, 8203), h4 = _cellHash(cx, cy, 8204);
          const isFl = h3 > 0.55;                        // 들꽃 45% · 풀숲 55%
          pr.push({ x: wx + (h1 - 0.5) * 24, y: wy + (h2 - 0.5) * 24, cx, cy,
                    nm: (isFl ? 'flower0' : 'grass0') + (1 + ((h4 * 4) | 0)),
                    sc: 0.7 + 0.35 * h1, vy: 0.9 + 0.24 * h2,
                    ph: _cellHash(cx, cy, 8205) * 6.2832 });
        }
      }
    }
    const v = { fr, pr };
    if (_natChunk.size > 2400) _natChunk.clear();
    _natChunk.set(key, v);
    return v;
  }
  // ★★[배치 20 B ↔ 배치 21 접합] 들꽃·풀숲이 **타일 상태를 따른다.**
  //   두 배치가 따로 착지해 아무도 못 본 구멍이었다 — 파낸 광맥 자리 위에 들꽃이 피고,
  //   토양치 60 의 맨흙에 풀포기가 돋고, 산터 암반에 꽃이 자랐다(실측 스크린샷으로 잡았다).
  //   재민 확정 "비옥도에 따라 **모든 타일이** 디자인이 바뀌어야" 는 그 위의 소품까지다.
  //   ★억제는 연속이다 — 자리마다 고유 난수(셀 해시)를 문턱과 견주므로, 토양치가 내려가면
  //     소품이 **하나씩 사라진다**(개수의 계단이 아니라). Math.random() 미사용.
  //   ★물가 술(fringe)은 건드리지 않는다 — 갈대는 진흙에서 자란다. 배치 21 이 검증한 계는 그대로.
  function _natStateOk(p) {
    if (_t19.stateOff) return true;
    const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
    if (!c || !c.meta || typeof SoilBase === 'undefined') return true;
    const lcx = Math.floor((p.x - c.meta.worldOffsetX) / 32), lcy = Math.floor((p.y - (c.meta.worldOffsetY || 0)) / 32);
    const rec = c.soil ? c.soil.get(lcx + ',' + lcy) : null;
    if (rec && rec.geo) return false;                       // 산터 암반 — 자체 램프(이끼·틈새 풀)가 따로 있다
    const soil = rec ? rec.v : SoilBase.baseAt('land', lcx, lcy);
    const h = SoilBase.hash(lcx, lcy, 9301);
    if (rec && rec.ore < 15 && h < (15 - rec.ore) / 15) return false;   // 판 자리일수록 더 많이 사라진다
    return h <= _smooth(180, 620, soil);                    // 척박할수록 성기게 — 620 위는 사실상 전부 남는다
  }
  // ★회피 — 마을 영토·경작지·길·사유지. **판정은 전부 이미 클라에 온 값**이다(새 판정 금지).
  //   길·건축물은 셀 집합으로 한 번만 굽고, 목록 크기가 바뀔 때만 다시 굽는다.
  let _natBlockSet = null, _natBlockSig = '';
  function _natBlocked(ax, ay) {
    let sig = '';
    for (const c of conns.values()) {
      if (!c.meta) continue;
      sig += (c.roads ? c.roads.size : 0) + '/' + (c.buildings ? c.buildings.size : 0) + '|';
    }
    if (sig !== _natBlockSig || !_natBlockSet) {
      _natBlockSig = sig; _natBlockSet = new Set();
      for (const c of conns.values()) {
        if (!c.meta) continue;
        const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
        const ocx = Math.round(ox / CL_BUILDING_SIZE), ocy = Math.round(oy / CL_BUILDING_SIZE);
        if (c.roads) for (const rk of c.roads.keys()) {
          const ci = rk.indexOf(',');
          _natBlockSet.add((ocx + +rk.slice(0, ci)) + ',' + (ocy + +rk.slice(ci + 1)));
        }
        if (c.buildings) for (const b of c.buildings.values()) {
          const bx = Math.floor((ox + b.x) / CL_BUILDING_SIZE), by = Math.floor((oy + b.y) / CL_BUILDING_SIZE);
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) _natBlockSet.add((bx + i) + ',' + (by + j));
        }
      }
    }
    if (_natBlockSet.has(Math.floor(ax / CL_BUILDING_SIZE) + ',' + Math.floor(ay / CL_BUILDING_SIZE))) return true;
    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      const lx = ax - ox, ly = ay - oy;
      for (const cl of (c.claims ? c.claims.values() : [])) {
        if (lx >= cl.x && lx < cl.x + cl.w && ly >= cl.y && ly < cl.y + cl.h) return true;
      }
      if (c.simVillages) for (const v of c.simVillages) {
        const vx = v.cx * CL_BUILDING_SIZE + 16, vy = v.cy * CL_BUILDING_SIZE + 16;
        const rr = Math.max(v.r || 0, v.tr || 0) || 800;
        const ddx = lx - vx, ddy = ly - vy;
        if (ddx * ddx + ddy * ddy < rr * rr) return true;
      }
    }
    return false;
  }
  const _natLastC = [0, 0];              // 이번 프레임 카메라 중심(절대 월드 px) — __shoreProbe 기본값
  function _natCollect(out, cx0, cy0) {
    _natLastC[0] = cx0; _natLastC[1] = cy0;
    if (_t19.natOff || !_natAnchors || _natLoaded < _natWanted || !_natWanted) return [0, 0];
    const R = NAT_VIEW_PAD;
    const c0 = Math.floor((cx0 - R) / 32), c1 = Math.floor((cx0 + R) / 32);
    const r0 = Math.floor((cy0 - R) / 32), r1 = Math.floor((cy0 + R) / 32);
    let nf = 0, np = 0;
    _natLastPr = [];
    for (let ccy = Math.floor(r0 / NAT_CH); ccy <= Math.floor(r1 / NAT_CH); ccy++) {
      for (let ccx = Math.floor(c0 / NAT_CH); ccx <= Math.floor(c1 / NAT_CH); ccx++) {
        const ch = _natBuildChunk(ccx, ccy);
        if (!_t19.fringeOff) for (const f of ch.fr) {
          if (Math.abs(f.x - cx0) > R || Math.abs(f.y - cy0) > R) continue;
          out.push({ z: w2i(f.x, f.y).y, kind: 'natspr', s: f }); nf++;
        }
        if (!_t19.propOff) for (const p of ch.pr) {
          if (Math.abs(p.x - cx0) > R || Math.abs(p.y - cy0) > R) continue;
          if (!_t19.propNoAvoid && _natBlocked(p.x, p.y)) continue;
          if (!_natStateOk(p)) continue;   // ★[배치 20 B] 타일 상태 — 척박·판 자리·산터엔 안 돋는다
          out.push({ z: w2i(p.x, p.y).y, kind: 'natspr', s: p }); np++;
          _natLastPr.push(p);
        }
      }
    }
    return [nf, np];
  }
  // ★하네스 계측기 — 이번 프레임에 **실제로 그려진** 소품 자리와, 회피 판정의 **원자료**를
  //   함께 내보낸다. 하네스가 `_natBlocked` 를 다시 짜면 그게 사본이라 자명 통과가 된다.
  //   ⇒ 하네스는 여기서 받은 원자료(길 셀·사유지 사각·마을 원)로 **독립 재계산**해서 대조한다.
  //   ⇒ 그리고 `__terrain19.propNoAvoid = true` 로 회피를 끄면 위반이 실제로 나와야 한다(반례).
  let _natLastPr = [];
  window.__natProbe = () => {
    const roads = [], claims = [], villages = [];
    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      const ocx = Math.round(ox / CL_BUILDING_SIZE), ocy = Math.round(oy / CL_BUILDING_SIZE);
      if (c.roads) for (const rk of c.roads.keys()) {
        const ci = rk.indexOf(',');
        roads.push([ocx + +rk.slice(0, ci), ocy + +rk.slice(ci + 1)]);
      }
      for (const cl of (c.claims ? c.claims.values() : [])) claims.push([ox + cl.x, oy + cl.y, cl.w, cl.h]);
      if (c.simVillages) for (const v of c.simVillages)
        villages.push([ox + v.cx * CL_BUILDING_SIZE + 16, oy + v.cy * CL_BUILDING_SIZE + 16,
                       Math.max(v.r || 0, v.tr || 0) || 800]);
    }
    return { props: _natLastPr.map((p) => [p.x, p.y]), roads, claims, villages,
             farms: (window.__getAllBuildings ? window.__getAllBuildings().filter((b) => b.type === 'farmland').map((b) => [b.wx, b.wy]) : []) };
  };
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[재민 질문 2026-08-06c] "바람 흔들림 … 날씨에 따라 풀의 운동이 변하게 할 수 있나?"
  //   ★게임에 **날씨 상태가 없다** — server/·sim/·public/ 전수 grep 0건이다. 없는 걸 있다고
  //     보고하지 않는다. 대신 **바람 세기의 정본 함수 하나**(`_windAt`)를 세우고, 지금은
  //     **게임 시계**로 채운다. 날씨 시스템이 생기면 **그 한 곳에 곱하면** 전부 따라온다.
  //     `__terrain19.windForce` 가 바로 그 주입 자리다(하네스도 이 손잡이로 잰다).
  //   ★시간은 **게임 시계**다(프레임 시간 아님) — 물 셰이더와 **같은 `freezeT` 경로**를 쓴다.
  //     그래야 "시각 고정 두 프레임 동일" 결정론 판정이 안 깨진다.
  //   ★돌풍은 **진행하는 파**다. 위상에 `바람방향·자리` 를 빼서 들판을 물결처럼 훑고 지나가게 한다.
  //     전부 같은 위상으로 흔들면 '풀이 아니라 화면이 흔들리는' 그림이 된다.
  //   ★변형은 **전단(shear)**: 밑동 고정, 꼭대기만 민다. 회전이 아니다 — 회전은 밑동이 땅에서 뜬다.
  //   ★비용(배치 21 8차 격리 측정): 자연물 패스 0.317ms/f(755장). ※짝 비교로는 natOff 가
  //     1.1±0.9ms — 잡음과 구분 안 된다. 격리 수치는 참고만 하라. 전단은 `setTransform` 1회 +
  //     `drawImage` 1회로 끝난다(캐시는 **자리**를 담지 픽셀을 안 담으므로 무효화 없음).
  //   ※지면 풀 **텍스처**는 안 흔든다 — 매 프레임 재베이크나 WebGL 이관이 필요해 비싸다(회부).
  //   ※나무는 안 흔든다 — 서버 엔티티라 그리는 자리가 다르고(안개 게이트 경유), 줄기는 원래 안 흔들린다.
  const WIND_DIR_X = 0.94, WIND_DIR_Y = 0.34;      // 바람이 부는 방향(월드) — 파의 진행 방향
  const WIND_AMP = { grass: 0.155, reed: 0.265, cattail: 0.235, flower: 0.125 };  // 기울기 tan(≈9°~15°)
  // ★이름을 `_windT0` 로 둔다 — 병행 세션(산)이 렌더 함수 안에서 `_natT0` 를 **수집 계측용**으로
  //   쓰고 있다(`window._natAcc`). 같은 이름이면 섀도잉이라 읽는 사람이 헷갈린다.
  let _windT0 = null;
  let _natMs = 0;                                  // 자연물 그리기 패스 ms(이동평균) — `__natDbg.ms`
  function _windT() {
    if (_t19.freezeT != null) return _t19.freezeT;
    if (_windT0 === null) _windT0 = (typeof worldNow === 'function' ? worldNow() : 0);
    return ((typeof worldNow === 'function' ? worldNow() : 0) - _windT0) / 1000;
  }
  function _windAt(t) {
    if (_t19.windForce != null) return _t19.windForce;      // ★날씨 훅 · 하네스 주입구
    // 큰 숨 — 주기가 다른 두 사인의 곱이라 '돌풍이 왔다 갔다' 하는 비주기 느낌이 난다
    const breath = 0.58 + 0.42 * Math.sin(t * 0.21) * Math.sin(t * 0.083 + 1.7);
    // 일주기 — 새벽 잔잔 → 한낮 최대 → 밤 다시 잔잔(실제 지표풍의 일변화). 시각 고정이면 고정값.
    const ph = (_t19.freezeT != null) ? 0.30
             : ((typeof worldClock !== 'undefined' && worldClock && typeof worldPhase === 'function') ? worldPhase() : 0.30);
    const diur = 0.42 + 0.58 * Math.max(0, Math.sin((ph - 0.02) * 6.2832));
    const w = breath * diur;
    return w < 0 ? 0 : w > 1 ? 1 : w;
  }
  window.__windProbe = () => ({ t: _windT(), w: _windAt(_windT()), off: !!_t19.windOff, force: _t19.windForce });
  function _natDraw(g, item, toScr, t, w) {
    const s = item.s, an = _natAnchors && _natAnchors[s.nm], im = NATX[s.nm];
    if (!an || !im || !im.complete || !im.naturalWidth) return;
    const sc = (64 / Math.SQRT2) / an.ppu * s.sc, vy = s.vy || 1;
    const p = w2i(s.x, s.y), c = toScr(p.x, p.y);
    const amp = w > 0 ? WIND_AMP[s.nm.slice(0, -2)] : 0;
    if (amp) {
      // 진행하는 파 — 같은 시각에도 자리마다 위상이 다르다(파장 ≈ 210px ≈ 6.5셀)
      const k = (s.x * WIND_DIR_X + s.y * WIND_DIR_Y) / 210;
      const a = Math.sin(t * 1.35 - k + s.ph) * 0.64 + Math.sin(t * 2.63 - k * 1.7 + s.ph * 2.1) * 0.36;
      const sh = a * w * amp;
      // ★`setTransform` 이 아니라 `transform`(=현재 행렬에 곱하기) + save/restore 다.
      //   메인 캔버스가 이미 변환을 걸고 있을 수 있다 — 항등으로 되돌리면 그 뒤 그림이 다 깨진다.
      g.save();
      g.transform(1, 0, sh, 1, -sh * c.y, 0);          // 밑동(c.y) 고정 전단
      g.drawImage(im, c.x - an.ox * sc, c.y - an.oy * sc * vy, im.naturalWidth * sc, im.naturalHeight * sc * vy);
      g.restore();
      return;
    }
    g.drawImage(im, c.x - an.ox * sc, c.y - an.oy * sc * vy, im.naturalWidth * sc, im.naturalHeight * sc * vy);
  }

  // ★[재민 확정 안개 게이트] 이번 프레임에 **실제로 그린** 개체의 자리 — 하네스 계측기.
  //   하네스가 '봤다' 판정을 다시 짜면 사본이라 자명 통과다 ⇒ 여기서는 **자리만** 내보내고
  //   판정은 하네스가 `window._seenChunks`(정본 저장소)를 직접 읽어서 한다.
  const _gateDrawn = [];
  window.__fogGateProbe = () => {
    const out = [];
    for (let i = 0; i < _gateDrawn.length; i += 3) out.push([_gateDrawn[i], _gateDrawn[i + 1], _gateDrawn[i + 2]]);
    return out;
  };

  // ★A/B 손잡이 — `__terrain19.legacy = true` 면 배치 19 이전(단색 다이아몬드)으로 정확히 돌아간다.
  //   하네스가 같은 프레임·같은 시계에서 before/after 를 얻는 유일한 길이고,
  //   `_tileAcc` 성능 비교도 이것 없이는 못 잰다. 기본값이 채택값이다(제품 UI 없음).
  //   ★prismOff — 블록 프리즘 단면만 끈다. 단면은 5px 안에 밑면·물접촉선·풀넘김 셋이 겹쳐
  //     '순수 단면색' 픽셀이 1px 도 안 남는다(하네스 1패스가 0.01% 를 보고 헛짚었다).
  //     색으로 세는 대신 **켜고 끈 차이**로 재야 판정이 성립한다.
  //   ★[배치 21] natOff/fringeOff/propOff — 자연물 산포 전체/물가 술/초원 소품을 따로 끈다.
  //   ★[배치 20 B] stateOff — 타일 상태 5축 레이어를 끈다(끄면 기준선 그림으로 돌아온다).
  //   ★[배치 20 B] slowFlow — 물가 렉 수리의 **대조군**. 공간 색인·물판정 재사용을 꺼서
  //     수리 전 코드와 같은 비용을 내게 한다(같은 세션·같은 시계에서 A/B —
  //     git stash 로 만든 "before" 는 다른 세계다).
  const _t19 = { legacy: false, waterOff: false, decoOff: false, prismOff: false, mtOff: false,
                 natOff: false, fringeOff: false, propOff: false, propNoAvoid: false, frFloor: 0,
                 stateOff: false, slowFlow: false, wxOff: false,
  //   ★[재민 2026-08-07] occOff — 산 가림 뚫기의 **대조군**. 끄면 산이 나를 통째로 덮는다.
  //     하네스가 "뚫렸다"를 주장하려면 안 뚫린 프레임이 같은 시계에서 필요하다.
                 occOff: false,
  //   ★[재민 2026-08-07] mtLegacy — 산 배치의 **대조군**. 켜면 능선 중심선 보행(옛 배치)으로
  //     돌아간다. 기본은 덮개 배치(맨 바위 0.0%)다. 옛 배치는 맨 바위 39.9~70.9% 였다.
                 mtLegacy: false,
  //   ★[재민 2026-08-07] footOff — 기슭. **기본이 끔**이다.
  //     재민이 시안에서 "고고" 했지만 라이브에서 보고 "산이 비산맥 셀을 침범한다"고 했다.
  //     기슭은 정의상 풀 셀에 앵커를 두므로 "정확하게 산 셀에만" 과 정면으로 부딪친다.
  //     나중 지시가 이긴다 — 끄고, 손잡이는 남긴다(footOff = false 로 켜진다).
                 footOff: true,
  //   ★[재민 2026-08-07] fitOff — 배율 묶기의 **대조군**. 끄면 산이 바위 밖 6셀까지 퍼진다.
                 fitOff: false,
  //   ★[배치 21 5차] fogGateOff — 안개 게이트의 **대조군**. 끄면 안 가본 곳의 개체가 다시 보인다.
                 fogGateOff: false,
                 shoreOff: true,
                 shMarginOff: false, shMargin: 1, windOff: false, windForce: null, windGrassOff: false };
  // 시험 전용 — 띠 높이를 바꿔 "비용이 blit 횟수에 비례하나 픽셀 수에 비례하나"를 가른다.
  window.__gtStrip = (v) => { GT_STRIP = Math.max(4, v | 0); _groundTiles.clear(); needsRedraw = true; return GT_STRIP; };
  window.__gtFrac = (v) => { _gtFrac = !!v; needsRedraw = true; return _gtFrac; };
  window.__terrain19 = _t19;

  // 지형 차단 통합 (물+바위) — 이동 예측용
  // ★[다리 층] 절대 셀 좌표 다리 집합(존 welcome에서 누적) — 서버 BRIDGE_CELLS 미러.
  const _bridgeAbs = new Set();
  // ★[11차 T3 환호] 도랑 절대 셀 집합 — 서버 DITCH_CELLS 미러. 다리와 **같은 이유로** 미러가 필수다:
  //   서버 isTerrainBlockedLocal이 도랑에서 막는데 클라 예측이 안 막으면 도랑 위로 걸어 들어갔다가
  //   서버 위치로 튕겨 나오는 러버밴딩이 난다(좌표 단일 작성자 원칙 — 예측은 서버와 같은 판정이어야 함).
  const _ditchAbs = new Set();
  function isBridgeAtAbs(x, y) {
    if (!_bridgeAbs.size) return false;
    return _bridgeAbs.has(Math.floor(x / CL_BUILDING_SIZE) + ',' + Math.floor(y / CL_BUILDING_SIZE));
  }
  function isDitchAtAbs(x, y) {
    if (!_ditchAbs.size) return false;
    return _ditchAbs.has(Math.floor(x / CL_BUILDING_SIZE) + ',' + Math.floor(y / CL_BUILDING_SIZE));
  }
  function isTerrainBlockedAtAbs(x, y) {
    if (isRockAtAbs(x, y)) return true;                 // 바위는 다리로 안 뚫림(서버 동형)
    if (isDitchAtAbs(x, y)) return true;                // ★환호 = 이동 불가(서버 동형). 출입구는 안 판 셀이라 자동으로 열림
    if (isWaterAtAbs(x, y)) return !isBridgeAtAbs(x, y);
    return false;
  }

  // 14.49-e6-c: 시야 재구성
  // 지형: 중앙 80px 원 = 항상 full bright. 뒤쪽 = 0.85 (덜 어둡게).
  // dot 보간 연속 (cos-like) → 부드러움.
  function coneMultGround(dwx, dwy, dist) {
    if (dist < 80) return 1; // PZ식 중앙 원형 vision
    if (myFacingVx === 0 && myFacingVy === 0) return 0.95;
    const flen = Math.hypot(myFacingVx, myFacingVy) || 1;
    const fx = myFacingVx / flen, fy = myFacingVy / flen;
    const ux = dwx / dist, uy = dwy / dist;
    const dot = fx * ux + fy * uy; // -1 ~ 1
    return 0.925 + 0.075 * dot; // 앞=1.0, 뒤=0.85 (덜 어둡게)
  }
  // entity (player/mob/item): 중앙 원형 + 뒤쪽 완전 차단 (PZ식)
  function coneMultEntity(dwx, dwy, dist) {
    if (dist < 80) return 1; // 가까이면 무조건 보임
    if (myFacingVx === 0 && myFacingVy === 0) return 1;
    const flen = Math.hypot(myFacingVx, myFacingVy) || 1;
    const fx = myFacingVx / flen, fy = myFacingVy / flen;
    const ux = dwx / dist, uy = dwy / dist;
    const dot = fx * ux + fy * uy;
    if (dot > 0.1) return 1;
    if (dot > -0.2) return (dot + 0.2) / 0.3; // fade
    return 0; // 뒤 안 보임
  }
  // 14.49-e6-c: entity 가시성 = cone × LoS (벽 너머 mob/player 안 보임)
  // ★★적용 범위(재민 확정 2026-08-06) — **살아 움직이는 것에만** 건다:
  //     적용:   player(본인 제외) · mob(동물)
  //     비적용: resource(나무·바위·광맥·덤불·약초) · ground_item · corpse
  //             → 식물·무생물·시체·바닥템은 **항상 그려진다**. 뒤돌았다고 사라지면 안 된다.
  //   ※ 이건 안개(fog of war)와 **다른 시스템**이다. 안개(_seenChunks)는 지면만 칠한다.
  // worldCx === myAbsPredicted.x (카메라 = 플레이어 중심) — 직접 사용해도 안전.
  function entityVisibility(ax, ay, dist) {
    const dwx = ax - myAbsPredicted.x;
    const dwy = ay - myAbsPredicted.y;
    let vis = coneMultEntity(dwx, dwy, dist);
    if (vis > 0.01 && dist > 32) {
      const myCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
      const myCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
      const tCx = Math.floor(ax / CL_BUILDING_SIZE);
      const tCy = Math.floor(ay / CL_BUILDING_SIZE);
      if (!hasLineOfSight(myCx, myCy, tCx, tCy, myFloor)) vis = 0;
    }
    return vis;
  }
  // 14.49-e6-c: 벽 line-of-sight — fromCell → toCell 사이 wall edge로 막혔나
  // cell-by-cell Bresenham-style traversal. wallCellMap 사용 (O(1) 체크).
  function hasLineOfSight(fromCx, fromCy, toCx, toCy, floor) {
    if (fromCx === toCx && fromCy === toCy) return true;
    let cx = fromCx, cy = fromCy;
    let steps = 0;
    const MAX = 30;
    while ((cx !== toCx || cy !== toCy) && steps < MAX) {
      steps++;
      const dx = toCx - cx, dy = toCy - cy;
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
        const sx = dx > 0 ? 1 : -1;
        if (clHasWallBetween(cx, cy, sx, 0, floor)) return false;
        cx += sx;
      } else if (dy !== 0) {
        const sy = dy > 0 ? 1 : -1;
        if (clHasWallBetween(cx, cy, 0, sy, floor)) return false;
        cy += sy;
      } else break;
    }
    return true;
  }

  // === 클라 사이드 wall edge 콜라이더 (server isBlockedByWall 미러) ===
  // wall은 cell edge에 (data.side ∈ {N, E}). BUILDING_SIZE=32 서버와 동일.
  const CL_BUILDING_SIZE = 32;
  // =============================================================================
  // ★[에셋 1차 — 생성형(Retro Diffusion, 사용자 계정 생성분) 텍스처 임베드 · v3 반수혈 시안 확정]
  //   이엉·다짐흙 64px 씨멜리스(data URL — 에셋 파이프라인/정적 라우트 無) →
  //   ① 맞배 이엉 지붕 스프라이트 베이크(전 움집 공용 6×4+오버행 0.5셀, 고증: 지붕이 곧 벽·처마 저고도·남면 입구·동측 합각 그늘)
  //   ② yard/plaza 지면 다이아 실셀(64×32) 텍스처 — 구 반크기 점묘 폐지.
  //   물리 불변(durango-consistency): 벽·문·콜라이더는 서버 그대로 — 시각 스킨만. 서버가 움집
  //   벽/바닥 행에 data.hut=[x0,y0,x1,y1] 태그 → 렌더에서 억제+지붕 1회 합성(플레이어가 안이면 원복=컷어웨이).
  // =============================================================================
  const TEX_WALL_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAF4ElEQVR42uWaX08bVxDFDzbrPwUMxUSEklaJFEV56Zfpt+kX7HPVP1JURSUVoSgBU7BNvNgG+vBbXx/v9bolUh+4nSe07F7vzpw5c2buXfv+u28lvXq2Lymf3Era3sgk/Xr0UdL+7pak5/ubkob5raQ3704lvfhqX9Lbk3NJLw/3JJ0NRpJa6zVJW+2mpGajJunn308lfbO/J2kynUp6dbgl6Ydfjkvr8Ft7221Ju5vrmhl3vn5+IGmzVQ/XfzzqSarpkVvxoXiLCFTZ+9710us8+6y7Ien8ahSuuxfxfbY+v7LebIe/7+5vJV1+ugkRwI4+jEq/ddLLJR12W+HK449Aba0ePOceqq/dBjRj+XgSsEg0mq1GwCUZ4nYxnEoaT+5KcRhP75e+ys4Xzc/4gFRyIJ/ip6mk3c05CgejG0ndTiap1chKD49GI0nvPgxL2HVrZHNeinNsddbFBkN6tB9/BMAx/A3fxxbj283zBCZhHSJDji3EZH1N0pPOhqRWVg/3kIFX15MSg7m9Pb2U9PJgJ6EITG9GklTBAHiU2vm+p1IlHg76oQ7cjO+WrgCbxew0yMeStjc2wj1cAQvcA+JPz+bPkodebVJhIce64w+kwtz4Jm+2Vyz3dbcT1vGqcrDbCH4lVqxW1AcLHvnT609CbGMdAOOBjlQigLccx3gFXA7zzDx6U/INiISLqBvNRjvU3dv7uqSf/rgKegnud+UTM5UbK6Rbifk+vAUru+Ez1A4cDA9whWe9WxiMymj+cDEIV3gKpq8y0O+sD0fxJrEiTiUHwKLnQFZT8Baew/fOHnG3sNVqlLR7XAc8zh4NVkZ3YWeDTFL+v1Cj7ntYP859POTs7vZkqy3puNeXdNjt/iPWMXqr9x/nihil5D1DoRW0k2gE6Efhb9f0rk+oA1WanukANdgrOsxWKNZWI3jXVY33xK8PO5J+OxmUFC5YqNJaqeSAf/FCxzSeq3NmBGf964BdokQvS21GO8UWV5jV5lx01b8OGCHTfDqUTE88uQ3TNbDoSC3UaFYvYTdmKnD/tMPcpi3p/K/L4L8DNUKs4DRqBVqIv70eu+KC/XjPYV4L7JRKBArvZu3AIXg3rrugcCFPpneBJfD3sKK3ph9Y3bWRjdQTet+CJ/NxYLMUcwC0oexR83hlNi9SyBCPgHuuasLj3Ra1mU43VvxFT5y1S+rVZ3sgxbMllQigvKmmsH5VH+QM7RopniDgbxiGSG6165KedpjGPuxFQT+/3uunV4njybDjGw3jWp+pm3dkb076Wpz6ey3f9tnHeM7rYDq+h2oDHzJd5c64PqQ1F/Ivm9w9bKFZP1DuAfAf1d37Xeecqnv+jaU4Fzq9GAf28Eq8bEakgP64Qq82VvaYr64nqCnqNO9JvqUSAVicL8MrKJD/wkC5c5erUdhmkM87df5Lt8jsgxlRKjkQzyVRIMyFqKCxivQOC/bAl/E9vj4a07tnMiEuyj6HiydLKU4lPNOZ5Vf1xw+tA7HFzOPdnGtVav9Vv16KWFoR8J36hX802yX94xnC/aAzrgNoJ+K5ECWbWaCmqibYvi/Kr6Q7F+L7XBv6RHKQZ1o8HeJ9cBUuq2y2M5mVVvB3wIp9NHsf+sEYEWlNJeI+tcq7IJ594qLbiu7Bo3i3SmPGZwBc8ce4n81bs0SnEv7Fjkv8dFOo0fk0m54hjpJP9723Jm4wmOsZ1iE36KTpfeMI8D6+Y5RKBPCKn1YpciCrhy+O9ek4attmuyllg0Nm+8RztmEa4rUIxe87CVWGMnj8EVivOPsQa8Dssz6WdXyuj8b0WTfZ5XUgPldH9MiQtE5sce7NVQrqn8jATjEiOemw0ayFXgnf7H25E3RO1X6mz9jOBqOl2RIbjOS1PMW5EF3pi/126btdn/qJrePeXD/6rjC+R0ExLZ2dYqmtyBM/scWdxd7cn1qqbVPUQu4h+IEuttvpLsdlPl6qUvMp11shbn46yLUtXE7NITeIA5GPuYj+OykW+hsJ4yz1FhAj7wAAAABJRU5ErkJggg==';
  const TEX_THATCH_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAdXklEQVR42mV6W4/bWJJmiOdCUhRJiVSSuubV6XK6s5xdXdXVGGBmgH0ZzC+YH7NP+zh/Y992nwez2AEWDez2oLunp91VdrvLLtt5c0opiSnqQori5ZDSPoSKztnlQ0IpkYfnEhHfF19E5Z/+8e9mQdxu2qZOPD+cBfH5aSvPN++uPVXhB+367WhBK3m31bwdLQAgTjK8IUnTm/ulrkqMyarC4kQIkYbxpt80CK8AwGQW+4vodN+OE4E3GDXuz8Nuq4kvajftNFsLkda0hqmTZViMpj4h9HTfws8yrxx1995dewBgGaoQ6UHPeXs1NTXm2Pr18OGouyfNgtgyVFMnAGDUOAAAwIdPMwCo13RKJZWTMN5QKtVrumUoXccAgHLQg54jRNowq6rC7IYOAGajCgCmqaucAEDTNnD2ALDXchiTozBxbB0A0mwt82oYb+wGo1QydWIZqqmxd9eezHNCqGVYlEqE0GdHjmPrjMkAYGoMJ2kZlueHEgD0u7bnh5RKey0nFgQAOJPOT1t2g6m67ti6rkoAYDdY0zaGXoDP1zRV4wwADnoOTnQ0DfBxALDabSFS/NAwq/jl3v6Bxpm1ZyRpSgi9+Obc1Mlhx1R1/c2HMQDIvNpxTbz57LhpNxihtChyANAbpmPreb7BG95dey++PZN5VcK7HVufL9e1ev24XffnYrMRe/1+nm8AQFZ4TWsAgD8XXFUBYK/fBwBC6SJa4b9/+PMdV9XTA1dlhT8XiiwDAB5Iso5UXZd5dehnAJADM5t2TVOLIueKDADBKgOAWBBKJQCwWi6eFaHUnwuc3rtrr1avJ2nq+WH39InMdzsCABIAtI4OPT+E/3jh6PgrfpgFM8rZsyOnEBkAFHmeFdv5cg0AVYVZLZdQGgti6uTg7Ono+haXoVQ1Vas6e+q2SB4+3UqSUHVdt61yZrMgBoBfPt8jlNqNn8yj5QLA4RP38Xz2Ws5uu/fUzwsghAazWb9rM1rBmeGVJane2J3mKprfDjwAYIw13KYQ4tmRQyhNsy0+FQtCuHI39LdFgs/KCgeALBNckeNozVW15xhZHOuaAgB5JgCAcIUQGgtSq9dVXeeqej9Zlm/HD6/eDs5PW+WsTp70AODN+zEAzMaTWTCTKClwO/dPDgnjADCa+pqirBYLAKCczcYTAOi2mu2mAQDzyRQtsshzVeEAIIQ4O6jFwRJjgKzw2Wi0XIYHZ0/PjvvBbAYAqvb50MfXN5SzdtP+zb/8GgC6NgeAWr0++DSTeTWO1gBw/e591TTyTHQd4+3VFKebxTEABLNZy64edkwA0BRFWkQSAOi25Q1G+AJV4UKkg08z3Cqr5TImD8dTkW/jaK03zDwTD2NvvlzHSdbe766XQZpRPL2qwqqmkSYZ2o83XzLGavX65Y/XOLjeMNMkWy8Db7486Dlnx01VYYXIRte3kiRGUx8Azk9bNU0dfRqqWrVhVk2NtZs25Qw90LCsoRfc3C9VrWrUuKSyIs/EfDL98GmWrCOM9DWtQWHnQHgCYbw5/+ZFFsev33wEgNE0QGMgrLpchqZOhBDBKiOErpcBThQAwiheTn0A+PDJx9EoZ8uw4Kq6SrarKCaUxonAvYsT0W7aAIARKVhlhHFC6SyIV9EcAP706hoAhh8+np+2CKEAcHO/rPzTP/4dApCuSjWt4c2XpsaWkSiK3DLUKEkAQJIYreRZsc0LQkkhSSwTG0qKRSTVtQ3+OpmnVYXJvDIPMrch2w39h6tplom+W8PPbkPOiu08yOy65i8iu67NwsLSicrJLIhlXkmzrWWo6NOPL8RKAJgFMc4b0UCIlDFZQvvWVSnfUrvBiiKXeZWS4tmREyXJ6YHLSSUTG7uhc1IBgKPuXiY2p/vWIpK6Nk+zrWupAPDtl/120+akctJrHfScm/vl8+Om3TAYk+8mUc8xDnqOpih2XTvpWwCgcqKy4qRvGTX+7MhpNw1V4arCELYA4NmR027ahNCs2Bo1Pgviw46JHktJEWdFt9UEAAlxIYw39ZqOi7MbDP01zba7sNUwFVk+6DmIKU7DTNJUZUXHNVWFK7KcbykALFbh8WEH0ccyVEWWiyK/+Ob8dN/CyD0LYlrJ/58NFvk2jJI0o7gRJdBSKtkNZmpMUxRFlhFMTw9cSgrLsDYb8RkHkjQFgN7+LjYTSv15mKTpL39ximt79uI4CpP5cn1+2kKcN00dQRcHenrkYATcf/4cYxoOu05ErdGgVOrtW/VWb3fatpVlouOaGEnG/rppGwDQ3u82baPftQGAEHo78AilHdfEb2paQ+RbAMgL0tu38oIAQMc1JSQFqsJVrZrnm37TsNptQ6/t7s43+BrCK2N/XW/1cN6to8Ntkayi+MX5EwRBIdJmTQEAhLZlJL78q19ViAIAqq4/jD3GKotgTakU+jO7Yai6LvKtquthFFdNYxbMAGDqB62jQ9zQ48POchnil7izDbP69mpaFLnVcikpEGqkNx/Gqq5vNkLV9evhQw4MABitnHxxRDnz/BBXghdjFZUV7f0uRneExn7XPry4YEz2gh2c7//svCjyDZXSOPzTb35POcOoCgDd0yflaA2zioiL13oZjP01fj7dt/BM8nzz9PwLZH4AUBQ54hqewM6EavX6Dq5JBdlLkW0/Xd4gP91sWLKO/HlISbFaLAihiKO6pu7tH8RhiOEZACbT6M+/+zcMr5ah/vN//59tp14yuYe7O87ZTyYa7O0fqLoOAM+Pm/PJtFnXuapSUmDUTtK0yHPGGIbjJE1lXr2fLP/2by5wtPOnrdlD4M+FhPS43TSC2YwxOc3WSlXTdGX/5HA+mfrzcDT1DcvqtprPTrqv33x0GiblDGN8yVsuX750bN1tavsnhwAwH9/PgvjZkUMrOaE09Genv/g5ofTbL/v/59d/QD8pN8409SRNx/66Vq9j8PDnIa4TAF6/+bhaLNKMptn6i+dHyBVwkUglJWkDyTpq73d/Ymxxso6cXhvXbTd0QmiWpGiXksQkSTDG1sug5xhMkXXb+vH7PwPAcDzVFKWEsN2ZzNPDiwt/Lj786furm/vy+75b++EP/4646T3EaUaLIl8tFnst52HsPTs7MU393eWwZu8hDcHMYcdibItyNvUDxmRTJzs6HfozpOOHHZMxFkfr5dQ3Tf1uEnUaVa7INU3lqupaKlpIkedRkgSel2dCkWXdthiTrwY+Yfxh7BmWZRkqpZLbkPNtgTER0waMWmG8wfeiL/X2rXUiKGdxGJqmHoc7X5qP7yWJzcYTxFMAmI1GoT9jjEkbAIDr4YOUAxt9Gu71+99//3E09W/ul0IIAMANWyXbRbSajSerKI7DcDQN/vR2iO4xmUYfX/+4Myd/NvACztk//4/fBqtsfH2DecJknubhCtO9Nx/GhFLLsMbX1wioP/5wHfqzxSpEEjX6NETOSyid+sE8yJSqFicZ2pI3X2K4e3s1FUJsJJgFcZptyT/8p/1ZEEWLJIiSmgLFlhRpPBxO8i2t6/L9w7rdrIVB9OONn4uUSJWaSm9GYQUgSnI/iK9vJrUqv7zzGSWn+9ZeozqarlReAZC32WroBVUQf3o7rADEaS4ycTvyizRVOJkFEac0jNKJv0pWwWKV5UWuyMrdOHj78V5hsAVJRCtvkfdcfTgJWnajKEStyhdBCCKbLhKjyjfbgvz9tx1KKuE6MzVWVQ1KNv4yFUWlptK31w9unWy2FcvUqop25y0lwp8c7FUABl7gNuQtSF+etqezhcwqMqs4zfrIm3cc4+3tyjbJy7/cNRvqxI8snRFC67p5O/LtusaI1HHN1Wrd79hvrx/chsyYbGiyyHO9akRJ+qTTKKCiysybRVat8jCPjSpPktUyEt5s1bKNu3Ggsi0htLItJGTVnUZV5lWZ5wDQd7WWXTVqvEIU5BsIGSVO44evvvkSMW4X1y6eEUoZk01T79q8aRtuU5Mkdn7aYkzGROSk16KV/Pzi6WMqkW9pxzVVhZ0euJeDMSXFRoIvnh9hLO62mq6lGjVu6LV1ItpNW9pALEi31ey4JmOyFAvScU1NV2SeB6ts6GemqQ+9QJHlbZHoDbPjmlc39+Xa8K3fftknjE9mMXonssXy6rgmV9XJNDrpW4RSo8Zr9foqmtsNhnfeT5blI3jPdBGWWgNCh1HjAy8o9w6/lCRxP1+fHdTQHxxbl7ZFstfvY0KNagdXVUJoGCVZJjCTYkzeazkNgz9GZQAomdnACwzLgv/vOvn6a6QD5XU18BvdnsyryHAqRMEj1RTl6MWLLBO9fUvVdaWqleD9+KUnXxxV+Wav5eBUnV57F0bvJ0t8YFske/sHyCbaTl3V9fvJ0rF1q+UuIqnTcwFA4wzfyphcZrGKYQLA0M/uhj7KFnbDAIC7SYQ3HB92MMg8ztYxh+5+8QzXI6s65UzVqqPrW8QTrqpN21BkmVBaIYqq68h8kzTFt0i6pnJFPnnSS9JUVvhffXVEiMSZpMhyJjbI0iiVuFpVWdE6Ovrdd9c5sNbR4cPdXcl8skwgOHRtfjXwAcA5PTE1dv/+PTJ4vBAK7t+/B4DDiwtCqduQkboW+Y47/fjDLvnM4rhClMGnmdm09YaJ9BGPXdWqaUYBYDn1dyfwMPYUWS7ynKvq0ptYhvLu2js7biqGiStezee6KkmMAQDG9X99ebVjeIr8118fX758iRvsNjUAkPLN1cBHC6xp6u9/++rw4gIA2k69xE2uqpN5evL11/Px/SqKvQ+XOGAcrRH4v3pqv726AwCENl1Tf/z+z4zJhHEUYJbLUEKZYId8y3UchoTx/eMeJhCB52GewRU531Lv5vqk10LHOjvuX3xzjvLbT1xVRkt4uLsbX18DwAbYs5PuY2/BzVJ1fT4cXH4cIN9mjNU0FcfE1EeRZavdxu3QO22kfWEUl9a/imKuyP48lFp29bGj3A48hGsvqKAyh74xvr5BFjCa+lXTwDWvFgvG5MDzbgcevgPtAQBQ1JgOPmHkZUy+efWKUEorOUpx3mCEi79//3459Uu4XUXzOAzRAZZhgYeJpMOua5Sz7977mPLPxhPGZAll1zgReGpeUEEp7uyghgou7rf3EEsSA4B20yasylUVD/Fq4K8WC1QRZV6dL9eTaVRixWf21rW9h7jI87vJ6vH3NaVy+XGAzCWLY0oKDK+qVi1EJkliHmTT4eBh7IX+TOVEqWpdmyfrKEqSLI5VhZG//7azjlZZUQmjOBdC5lQGMRzNJUnyFvl64f9wOem65tCbMmn78vXNk31rNJw9PPivfryPVqtoLa5uJoxAEgMA/HB533bqy+XycjC1G4Zra++vR4xUvnt7L0lby1RFsYWN+O4vd6s4q1UVUskJoUEYE0JHD/PJNIqSvOual5f3v3/53rFqSZq//3gvQbGOcwB4++6WSpv78aIq84m/GkyWkq5KYbw5aNcXkXTQc0761qu3A8fW40Q4xnbgBaf79uXdzDKsyTxtO/XheJpm66uB/7MnLbTRnz9r301WabYeTf3jnn3Stybz1G1qVb65HXinB+7370ZuQ0Y3qNf0u8mq7dR1VZoFMXJYPA30ltN9+8Pt5Grg991aEK4OO2bPMSbztOOacVaoCrcbumUoqsJmYdFzDMnQa5ahYkguBVo0J4x6uqaMvAUA9Bzj6ZHDmIxChq4pmqJgDoBGoquSY+u6bdl17ai7N5mnmFVjLs+YTChFXRYDQ3mhX+LVtA0c8/iww5iMzo2Xa6lxslNvkdWfPOlJTdtAx68qDPOd43b97e3q4ptzQmnPMQCAc1bqxrvkk7PheIor2Ws5GByROH2WhzNxfNgZjqd9tyYr3LF17yF+zJ26zk6DwPWXqWn5ZVkrwGQaF1PT1IZZDaOkplR2OTHyHELobDQqJYBCZEWeO7bu+SHi1E/KKeuePnEbMp5PxzVVrTryFhj1UE+nlbx9dID/ll6LwQDDlCLL6+VOnHSbWpnE9d0awgUA/O67a4xg/a7dc4wsSe8ny1iQD7cTJAqcSeF8uZNVGm5zlWzvhv4sSHr7lsoKIUSebyiVOq7JOdv/2TkqHMgm8MICBJ4bADTcJgCohmnoNQBAJ0FjQND56q+/WkUx50xWOC748OJiMo0AIE2y1tERgqbZtL88blUVttfvF3l+N/RVhanGbpGnBy6hFOO+3jAlPDjCqiorypRvnQgsBaC6hCcQJUnJGXcCJVbWHKf8uxPQ/fVsNMKpIDCX1839smHw0louX77knHWePpUVPr6+HnmLjRCz8YTwysVZDyV+mVebtrHyHxxb79pc1fWpHzRtA5mOZLXcD7cTxip4q6YomCWqus4YM/Ra1TT6bq3IEknawer4+oYx+bGkg3oJbsnDp1vkP/vHvUa3BwDvLoeHFxci3376yxtdlX71qxf/+7c/lOk/uhkAXH4ccM6QrdzcL/efP8/ieP9n5zLPS3zsd+13by/Pv3mBCqmqVSVMq7kin5+2vPkSBXi7riFVKnnL+PrGMhSr3b4fTJB1mo6LpPzy5csKUebDAb4D9Xd0BgBo1vUyvCDdEEI8P25izY9QKkQaeF7VNADgr746unn1Ch1yfH3NVXXlP9zcL/f6fUzES0GgXJKEWgWyCzwENKTx9c1yGTJaQcWhyHNGK+g97y6HdW2D+0EoJZSmcTgbTxhj795eShJzjN2k//jr3zBaKVW0oxcv4qxodnsA8P7Nj+QnTQQrKTKvclWd+gGhlJJi8GmWxbEQwjLU1WKBIYirKmrX/lwgM5CiMGk3DZSKnIaJNZJ203h3OZzMYtPUGWNCpKso/uFq+pg1/fl3/4ZW/urt4HEpZBbu+PMff/cS6xr+PLh59epu6E+Hg5G3KIrN9+9GjFauX78uw9TD2BtN/SyOGa28v/bmQSbznKtqnokoScL5EiXXcL7UG+b4+ibN1puNiKO1dDcNbu6XWFjH2c/Gk2CVpdnWMpQ0yWbjCQYHlGUYrSwiaTKNglWGMbf7kxFjcpPG4UaCMuQjcb8bfrbG4Y/v+m7NNPV/fXmF36MYEwuCIlecZD3HGE2D8adJFseaotyOFrqmUCohPSvyvKyDVP7bf/lbTVHwf6yFlOWZsnKTb6m/2CVWVYVZhurYepKmb29XKisuznpXN/d3k5Ws6r98vnc78Ay99nEYnR3U/Hk4mafPj5vfvxsd92whUkOvBeEKnWHgBVkm6kYV6Yyq8FlYPG1r9/N1GMU9xyhntc6koshlXuGkkm9pnGTIHpaRkNJsK/OqrkqWoTImO7Ze5Zt2015GoqY12k2bMfmgXQeAX5x1e47RbtpxVmAAUVmBAx30HM7Z2UHtM96xoqapjMnor5yzkyc9xuSGWWVMxhdlmfjZkxba9Plpi1byrs03EqDiG2fFYcfEWZka6zqGpig1rXHQruNLO67ZdzUJ68YlHwYAQ68hcbAbTJIECoMlDGPsx1C7TkTHNdEMGgYv019dU9aJQJKz13L8eYhhDUNFyRTshhEnQm+YSJNwR/ePe31XC1YZ7prMqydPejKvjv11xzVX0bycDCK6hK7d3u8i8aBUwnjHmYSDnjzp5fmmYfD20UEQrpI0PX9+wBhDTQHfoeq6JLFfXByVeomuqSdff43MHpEY14P+JkTacJtYj9shiarig5idybxKqVTT1FU0l7VdaCGUIn8RIj2/eIrFTAkAZM3EYIpiAYJ8nGSto8OhF2CTQpk0inx7P5jE0Xo0DY7bdd22sPRgGYrVcmVeHXgBcoqyeGU27ZG3COdLNOhSXl8nAutacVbs7R9ESYI1OELpKpoTSjGCSz8VfBErbgdevqUbYLEgHz7NpMOOWYg1ytaMMcRXLI6XTQrBKrMMSzVMx9Y3G4aAwElF5jkWO/ApwhVJEsg7Tvety5cvJ7MYYysAnP7i5w23yZhcFJt8S53DIzRFXNhObumYqq6bTfug51RNY/BxIESKIvvZcTPPBKG022o+PXIMu66yomVXJX8eImSinjEbT5J1hApcMJudn7ayJDVqXJJEkSVY6hlNA6RoaUbjMMTU9uMwmo/v0bKb3R6CdFn5RL6Nnnf16vXIWwSel2XCsCxKJddScXAUIJBH5plAhw78ha5Ku64S00AfKO+XGJOxS6Djmsupj+cwmcWlEjobjRRZxjYhWeEnT3pH3T00DHRo7M2oKZX8J9YtMVYa99GLF7PxhFbypTfBs/L80G1qD3d3baeeJWmebxRZfv2Ht6cHrsi3QgjcyjgMp4twnUloQkMvsFru6NMQHQYH32yYhJwHN+zN+3GeiThaW4aCZKbEo1iQOAyXyzCL42VYIMhjE9pBzxld34ZRHIchtjZshMA4hi0CSGDiaN3s9oQQSBkfay3LsDB1kuebzYaNPg0HXoB7lxek72qEcfTvYDZTZHkVxdj1gfF3F5KMGieUVvkmi+M4DGdBgtW+EkS7No+jdbDKrm7usSRx83GicoLVX1w/ViCFSFfzuT8XGJGKYoNpQxbHRbHBNg90uTDelPLeu2sPPf7o2dMKUSiV3rwfOw3zbhIl6+hx/8FoGqRJ9r/+5fc7JP6v//lvyiaVzUak2ZYQytluYXGSlUBICMUy+jISVb5hTI6SxDH0RbTaaSEKC8IVchu7YVT5Bvv7cEd1Te272s39khC6SrZnB7XJLKaVPIw3sSCOsWVMjrMCWT4S8jTbqo+U/fKnvCDYKxHGGwk7P/C+0wOXENqyq3GSqZyonLSbdrfV7LuaqnBTYx3XxAS822rGWWEZ1vtRhPlXv2uP/XVNa7Sd+tlxP4zig56DJ/P8uNkweBjFd5MI+x26NkeoWmfSYcdUWYFIWq/pTsM0NXbU3eOkcn7awmlsNgI7LEyNnR64Vb5BszzsmBIAtOwqreRlxNA1xTJUVWHY5UappMgyreSqwgDgu/c+RmtayRGny0pwUeTOnvpYRcQWKNPcjdyyqzVNnQdZlCQ42irZ1jQVqUG/a4+mvrO3Q7GyEIi1MBwf2wzDeGPUOJZXJFXXT744wt5HAOg0qrLCO66JGfezF8eYJ+RbqmsK9rpdnPUA4NnZCQA4xhYjWJpk2O1T0xo4FKHUNPV+1y7yvN00dE1FjK8Q5Ve/evE4t+64psi3VruNfQxlSxyhFEs15WXtGSj8AMAXP/9yRyUwK0e5PQeGkUdvmJgl+/PQ6bUzsXlcAMbr4zBCmjBfrpM0XUXzIs8Pn7gYs8sAcDvwTFP/XBjXCWE8nC8plUoxCpVW7MK4G/qoJk39ADnL+WmLUNpu2jg3lRWKLL/54+vb0ULCasLjaSGhQLpWiOyg5+AKy46E1tFhw23iDVxVCaWdnnv07KkXVPCIxv4ae8/KMfEzV9X5cl2v6ck6olSyWi7WLIo8x7qvyoqy3Q+z6vIorHbb1EnZUtNwm3ieUplcc0VWdb2snSA8E8bzfMMVGe3+D//+vsy88H1YAbgfTLgid22ORXxMag3LMmq8yPN8SxutDibBQy/w5sv1MsADRwau6npr36X8s3aGIhJjrOzk+5z4q2o5vd0CHsZe2dAGAJ+uBmXh6OHujlJpNp5gaZozyTG2g0+z9XJ3uLh/ZaMkdlg6PxlbkW0JpSd9q8iSqsKKLCGEnh03310O/0OtjbPHbY3LSJSVNafXRtdCUJJ5NQ7DftP4+PpHfK8khBD5tusYwWyGQF32vPSbhj8XWHc53bdWi0WcZBgcWkeHeA7DDx8x038MN0gxZuOJ2ahWTcOfC1ze+PrmdN9azteYjy+n/s39cjae4HuxrorQho08QghURvA0rocPaE5306CU1STcyPJCHrKMRCGyjQSSJLqtZhbH7669LP7cc4cFjnbTzvMNrjDPBP76MPYabtPUWByGhO56c5J1pCo7PSsHFifZw91dyVPuJlGpmjy+cGEI/N5glBckzda48VEmJElsNqKC7feIxJnYPMZazFM3G4GZKK3kjMnYOljqFzKvYEqNgN1pVL0g1BRl4AUVojzparqmDMdTu6GLfDtdhJqiLCNhagy75vHBrNhiJyTiffkX8wfMQ3BK60xCMMZxAOD/Ak2Aqq00hkIIAAAAAElFTkSuQmCC';
  const TEX_EARTH_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAizklEQVR42lV6W5PcSHpdIhOJxL2AQt2ru/rCZrM5M9yZWe2M5Y3VhmxpZYUtay1bdoR8i7VlR0i2/4ae9O4/ojc92eEXebTe1WjIHQ6HZDfZXdVVQKFwvyQSQPohObSMh46o6gIykd/tfOd80l/82R+xhoVZVdWMsq7nDADwk1//aL2LiELyPD89ntzc+mFWAQA8S8MKtg1MFAIA+OrlxtDI2k8AAACAs+XQNox9nI4cmzYUADB2zc0u8lydKCSI8uc3vmOpVc0Wk4FtGGlRHE0cce+dH0dpCQCoagYA0FQMAFBk2HZIRt187OV5/moTge+uBwsXANBLkgwAeLWJHEs1NP1oLNdtb+lkvYsAAAT3OQA3t774AQAgzCoAKtZoAJRZReOsVmQonnh1OqGsFft+cx+IF2MNAwAEcUUwOyT5cjIoKno0thcT586PG9bRhgZxBQDY+Imh6QAAAJg4KQDAYuo+exW0HdrHKQCAYCTWOhrb7sDMK0oUAp/f+AAAKOGeM6xgSyfiR2PX/PLFVhw8AGDm2TPPhhKGEr4LUvB3rqvTydXpBADQsA4AwBibefY+yq9OJ682EVYwAIA1rO1QVfdQwljBX73cNKzbR3laMMi5OHsAgIy6gUk+vpwBAEzT/OLpm8lQ6znbR7nYN2Xd1dnCNE3WAdvAX764hQCA5WQgtggAyEp6SHIAwGYXff7RyZOLxbdrf+LqRCHX61AsQ1lXt32S0wcLdzgws5KK71UZsoZhjA9Jfrb0bANPXH3smrZh3AXpwMJFVX76eMEaZmiEMQYAEM+cefbAJDLq/Kicj70wKrGChTHni9mnTy6PxrZw1AcLN8/zPM/3cZoWjGCE/vSf/hpEUCWId52u6UmWDwcmAGC1GEmK/j//+rkkoaJmtGkcS5+PBqoi7ePCNtShpWIFs4ZBBHnXIYQQQiVt135iaHjqGS9v04GhbPbJcjJYTpz7IF6Mnb99sTZNFSHIWLsYO7ORex8mpk4q2gwHJlFkBIFrq/f7tO15lFUDTYnjBCE0cowgLiBCmqromt52rYzgbOSiP/69z7OyrmmT10wjsqYqWUkJlg9RttvHmoIuVjPXUhvGHEufjex9nM88q2GdpiqUtZZpAsDbnqd5KUMJIuja2u0uvPPj5cjqJUnB8j4u2q5ve16UdVo0rq0RLI9dS4Lym/vAtXUZQbEuY2zsGPu0UmUEEZx51lcv3wZxhiCsaBMm1cgxbreRiqXl1C3rJjgk6A9+eKGpSkWbrucYozQv+75ve66pyvX60Hb9yLW6rqtoI0MpTgsuSRVlCkYygl3fm6r8dhdPh87Z0ajtJduQ44xerSYQyW+28eVq2HUgSksiw7bnBsFTz+76Ps3LgaGu/YNtaq/udgjCtueWTtqet6y1TJMDbmhanJUDUx+YOkLIsfSBrqyD9Gzp6Zq+DmKCZU1VpL/67//5fThudhFW8CHJhWerMjRNkzZUJE3a0Kyk76OcKOT59Yay7vMPl2nBRKTWbc8YM3S1YZ2CEeQ8yltNhYwx4ZnvH27p5JDkGGMR922HAAD75DC0rScXi80uAgDUba/K8Nu1fzwdzT07SvL3KaGXpIZ1I8dG//gH51lRZ0W92SePzhdZUUMEDwkd2mrb87FrdL0EALgPwoo2CCGCZdvAtqkD0Lq2zRiXZWhqJKsobXtVhiUFugK3YbaceCPXsHSladvLi9OBjlVFbihDCBVlnZXdyDUg523PHUvPyur7HxynWatruO16XdPDJHMsHSHU9SCIivFw0DTNajHaBEnb867nc8+O8wL98e993jTNXZB+9tFZj8jPv3odZ9XJ3AEAyAgKP8vLqu1Qz+HQVolCDE1JC1bWTZyVq+kgTEtJAmleRmklQTByjdlosPaT86OhouCtH0kAJHEqSdLukOUVfbONDQ1DyGUoibJzSPKxa22CxFJR2/MkYzebYDY0EUIAAM+xGeMDU+WA/++nrxjrV/NR27UVZbZhwDf3QZhVP/7sg/Uu+vLptagXy6krnAQA4EelH5XviwPBPQAgLQqRbd9uQ8bYIcn9qDQ0fTgwx66ZFmzkmsKvsoqeHk+wgvOKAgAwxo6lJjltO9RLEgBgG6bCu6q6zypaVPSQZt/l69Y/VACA86UjPkIJU9Y9v97YhmEbBgAA/eTTs+9fHd8H0fMbfzYyoSTrKqxKihDSMAzTajkejByjqFpNhf4hZR3Yx0Vedn4cK7I6co2259sw//jymLUNwbKhKS9vD0NbDQ5JlFZ937dt//zGhxJXsJyXHZbB2XI6MNVDkk09t+06yHmYND1nY9ciMtQ1YhuqpiqGpt0Hh32cFVWHQMslSZElQ8O06ZYTI8rK6/UeXp0tvnj65l095lxGnaWRXpKIQr74+ka89/MbX1PhyLEBAJ5tiBo0Gw6OZ44IR8dSb7fx1dmMNez1OpRRl5V0NXX3UZ7k9FfX64mrG7oKOddU+OGTR/s4vQ9CQ1fzPF+OzTCrBAYTVl37iYIRZe0+Ts+W3pMHM2ETyPn2kJwu3KuzBWVQlFT0258ee44JJVkjpO3YcGCGSTMwSZyVn33yWOr585udY6kKlhEEFW2SvGo7NBlqU8+IshJDqaRtEBUaIboi1ZS92cbHM5dgeewNEJTirDqZe6qMJADugtSxNd8/7KOcNl3fI9sklPV5RV1bnw4difd129uG2vX87TY+X05mI1tVFQB4XlGC5cuTcVqwruvirMRQ4gCg//LPfpiV9dBWi6pdTof3QQ4AMDRsG0YcJ89e3ROM2raPsooosmPpMpTajk09I4zKvKJ5zSTAH5/NoqwGvMMKHjnGIck1VcmKGgBgqvjsePL01b1tENsgtO3Pl56C5Y8eLitaV5QBABCEJ/MhZX3TNFnZzUeDsqa2oc4882++ubsPEsfUNFV5u411lWQlbVi3HJttD4gM0b/6zcciqQEAVEVSEGg7lpXdaKCqBBY1cyx96ll9D1fTgUqgH+WWRqKcZmX35MMHh0NkaSQuaktFAIAwaWRZqmqeldWjs9k+ziUAiroxVRxmVdW0tqZkRY0QOkRZnLeAt4y1D1eTIMq7rkvyauQaXddBziGC90HsGOrA0olCgkNiGRrBclHWjqWnZeOYWtkwKDLDxbEtkgxW8HzsaSrMK/pXT2/irFZl+B7932yi1dTtJel86U2G2mEfPTqd3QWpghFW8OnxZDLUAACHNLtceTe3fpKx1cUpUcj7dkKkl0OSL6YuAMDSyOnC/eZmSxRCWTscmMupa6p4dXpMsPy+wtKGDgemCEKM33UjUZITLKM/+f3vm5oqSXw4IDKSoST5UarKsKStTrBj6zKUasa6jlmG5li6BDEAPMrK220EJF5VNC3pPi6JIn/5Yv34bHofxI6t24YS5fTJw/nfPH2T5jUH/eXKcwdmkJQXJ9O27bteQqAFANwFqUqUsqY1bWQobQ+ZStTbjb/xk8XYCeIiiHLX1rOSIgj8Q9W2vKwKBcsSAK6ton/xGx8UZf3tbYghlGX57Tasm3biuX3LCJZX82HNuoqyqeciCChrbUOmrK8oG1pq2/O252XdzEb22k+Wk4Fr65yDhnVZ2QAAMIJZWSynw/OHJ6wqorRuWPfli/VAV5qmEWDhoyeX4T4CADxcTWRZzivat6yiDYSQA2DqhChYoIbgkDz58MHrN5vxwJAAWExdf59B28BR3moqDrPq9Tr2o/JkPhZY3DTNb262woj7ODU1QrAcxNUhyRWMPFdXMCoqOjDJfPiuEm12EWve9R/CyquZd7uN3768eXmbPr/xxb+yimIFh1nFGHv21TeXV+eiqwS8Z4yFWZXkVJHhyLGLshZZGyOAMX729cuqqbGCe0kSzSr6nV970LAGSpiDvqypjGBR14uxiWTy5j7oes4BsHRiGwaWe9vU87wK4vLx2czfZ2fHE97zijZJUV+sZgi0d0EaJKXAILqmbMOMNs3HV0fOwOj7NitqyroHC/fR+WIf5zVlH5zP04KG+8jSSZqXSJbHrpWXNW26xdgxVFjUnWPptmGkWZ6VXdt3hmoWVTswCUJon1To3/zDD6umlSS0mnuWocgyMnVSV4wDjjF6eDyuKlrStu3aOKPfvg1OFp4sw31cbMMsyQpNVbKyI0Rezd2ibnRNqermaGynJZ16VpxVtOn6tm17SUZyUdeccwmCqqRnxxNLk7dhnpcdlqWGdQLGN2279tOHq3FWUqKoAvOEcbUY256jeAN9PrYnQ+NmkxRVO7RV9NMfXXUdBADcB4fZyO1bJoluH8GKsk1QbPbJ+XKyDRNTJ4/PZrtDBgDYhdnINRFC1+vDcKBdnc3Wu+h4MT0k2XLiccB1TTE0DUi8rBsJAsvQR65eUwYlAADIa2Zpclow3nV102NZquq+59BS0cjVFQXv41zBcllTDKVtmMkykDhXCfnrX93pKi7rRkHANgkAAP3sdz/pee8f0tXczcp6G2aea1aUbfxEkmQZdbOhGSaZShSEIG3afZwjCHVNEV7+6HgURDWtqySvyqKUAGia5uhshXkTZaWuKq6ta6oSZ+U+zruef3ixfPpyuxxZBW3TvHz4+MLC7fObgCjwwdI1dLwO8l2YGSru+75hUtsxGRFdw1nZAd6u5uOu67ZhqhMcJs1wYKJ/+RtXmqpYBhGRbhnKNkwlwM+W0zjLHENdTF3OgW0YrGmSvOp6/tGTS2/k/u2vbmxDbdru6oPzu/Xu48cPNIKyor4L0rmj+vssztvThRtlZZqXCKG1n/zg1z54c7PGMiRYlgAI4lLm7S9f3E6H1tF01HPpF8/vPrlcKlh0tp2MOgFbCJZpQwmWOeCmihUFtz1XCaKMoZ/+6IpgmXedDKWmaRBCDWNN27dd5w2MtudpUTsGMXVls08AAGPXypMsTzKiyFdnsyQpdv7BIDgvq90hc2yrqOsXbwJJwgAAlShEUShri4qeLoawrTf7ajkdpmUtQ0mCICs721AwxrpK7oNw4lm0af1DRRva9p1jqOOhLVLL2LXiooacxwUVp8klyTYM9Pt//wIiOByYNW2yim7DDEL45GJRVTSIC43goqxbDvK84hLchvnIMbZhygEAAGAIBHobWloQF7amhEk2dq2RY9CGDgwlTLK8rKaeOx5oRUmrmtkmuQ9yLEvnl2eG3KdFORyYBMv3Qd5zCCEQh/3h4wtbBVXNLEOOM2obhh+lAADRFSZZ3rSdKiMOOPq3P/kYcj50DHHAnmM+PB5XNYuLWsHyzDO6lksARHk7tNWBrrzdxo6lC9Dbdp1paFlRdxxFWVnWbDww+q7/9jY0NEywvJjYb+4T1jZJUZuGluRVRZueQ/+QplGRFiUAoO35xcny2cvbhWdUtKloMx97gb+varaYuq9u933fi/Y6KWrHUGUomYYmaqhtGOg//ZPPZ4vpl89vzhYjhFBFmWvrcVYBAGraFHV3eX6cl5UsSycLL04L01QnjnE0GxKMVvNhWTemih8cezWllqHJUIrydjYyR85gMXWu1wcsSyLck6JWibIN88uTKe/btu/GruXYVlnT4JAkeQ4keDQdWYb+5YvbqWcHccHaTsEyAJJgcfKKQoRW86GhKaqCJ0MzLSr0X//gs5dv7rsO1qwhWD6aOJtdlOQVAFKUVt//YMV5lxV1mpd+mJ4djfO8CuI8SiuC5bJuAABJXn197Tu2fr70braRruGJa/lRuo/zqu6ffHwpc2AZett1AICsoDKS+r53DHW1GJU1a7t2F2bff7SirNNVkhZFnFV+FB+NHAmAQ1aZOsnLrqhaDvqr02kQ5VCS8oomaYEQgptdtI/ygYWLii6n7ut1mFU0ySkA4OpsAQBY7yLRrw0HZhDlrzbRauZZOhGMImWtH5UEo/Ol983N1rM0VYZ5RYuKKhh9/MkFAGA4Gwl29nzpLSeDqu5XU9c0zX1U3m5jyPnAJBD2H1ys8jyHnD9YuEPbElz0zLMFc9pz9tmTh5tdRFkbJbnAs2PXRD/90VVZN32PVnPvF1+/0TUlSqvFZIChFCaZH6bbMOt6bmi4oo2mKgNdiYv6/Gi8j/MkY/f7xLHUydDaxwVCqKINl+D1+nC6GMoIfvWrG4dIz7+99w/pyDHyvIIIDkyyDVOJ903TlJTqBBMsqwrOCmqochDnTdt9crW6XocfXSyirOy7DkJ+NB0VZd00TZy3m33i2Lp/SNOCwpFjD0zy4YPxfRCeLT0FI03FRxPnLkgtjQwHpqbiq9PJx48fCNZ2dXp8dTa7ufWLisqoO1sOPUvzLE0AsieXx1dnswcL1zawf6jOll5eM8EfX68PAID3RLSg9V1bBwCsLk5//nwt6Hs/Kh+dzvZRebYcfvH0DeRcMCOiK4jyFgDwD374PQUjSyMjx0b/8Xe/13KQFrWlq8up++zlvWPpRd0MdLKYune7Q9dzUyc9a755ExgaDvaHjV+ESW6oeDgwTxbe9SbpQd83ra6SX3z9pqwbx7Zer/cfXczudoeKNgNDgQjGWSVJWJIQbailkayiRc2eXMxr1uVJJgB2XtHZ0MyKencoVYLOl+5dkHY9P10Mg0Pi2NbNJhgOtCzLN35ydT4LoxT97Hc/pXVzyCoiw//z/O7hatyw7mQ+rFkXZSUAkjcwWMNqyrAM/aj88MHEMcnF1XkcpacPTtJDlJXl2k9NgpqmUQieD00kcQmAX7x4Ox8OuARlKJ0dT05PlmEYPj6fpgXVVOXy/HhokttdTLC8nLpF3YRJs0+KoaUBADQFSgBs9hUHvaER2zAoa4MorZv2fDnxD+XViRfnta7p6A9//FgAhK7v3zs6bVoAQNf3NW22YdZxJAgLKPGi7iRJioLD9X2QROk6SD3HjLNKLNz2XJKkbZhyCcoI3Yd507Sea9qmFh4yifdZUbc9h5xHcVo2rOt5w7p9nNuGcbMJJq5OsHx6PNkeMk1VaENtU0MI+ocSy5IEuKFhy9DTvF5M7CQtmqaBRCFN2xsasTSymnmrmUewnJWUNezV3U4468Wx/eTyeDl1DV3dR/khybGCNUX1LO1obBdl/fHlsfDO95EwH5on8zHB6GzpHZJ8vYtoQ7OKAgBE9yPiQcHofOmpMnxzHxCM5mNvdXF6c+vvo/z5jT8cmLZhFGXtmrJoiEVnc750vnq56SXpLkjRj58sXVtPi7rre13Tf/V6w3mvqYqi4LFrJ0VNsJoWpU7Q/S5+vYlkBD3HlBGMs2ox9UauEcZ5XlYDQ1lM3bvbbUnbPC8NHUdZSRQsSPDrdRhnlarIpqFNJ2ONoJp1eUUdUyvrJkyaKCu7nl+uRne3WyFheQOtos3IUR1La3sQZ2XdtGPXKsr6PiyHFqFtX9YN+g+/87GiYM+xKWv7lnmuOXYtLCtd1x2S3Da15dgemPohLqK8JQo0VDxyBjKSLx+ftWUeHLKm7ZKcKgRHWSVDKSlqneC2B2lefnix/Otnb5eToWiVHn/48OdfvlqOTKFYeo5BsHxIcgh52/U//tEnu12IEHJtnfNeEBBZ2RBF7bouyVhZU1lGbc9P55Y7MP1Duhg76E9++nmYlmFcNayBCDWskyRwH+Tzkc46UJR1kldCPhoOTFniTdvlZaVgxKpm7R8Ilh8/PPUP8e4QD0x9NR/GaXEXZFDiAICiahRZsgx9Mh2rqNtuAsfW39wf8opyzqeeJbjE1cyTZfjm7f504e4O2TsyoWl3YcYBzwpmaDgrK0PFCCHGGITy7pBNPTc4JOinv34BEYQQKFhWZZiVnaFhWZa6DtxuIxmRkWsQhaz9aLtPbINwCTqWfryYHuKk7fnUM17fBd+7PEIcOLaVFtXFyZRgVNEGALCPis8+OvP3URKnVc3CrHJMzdRJWfcKxpenk7bts7LDWErzEkJeN+2DyzNWNWGUHrLKsfST2dC11abtTJ1oqgIAsHQ1K6kIibyspL/885/lee4OTMGViwwtRBQFI0FhE9wHcRWlpWvrRVkDAJq2j7NayJtCs2ENM03zPggxxkKPEWIMa9hdkJ4tPcGkGxoR/IWmQnHvNkwVGSY5paz7jU/PgygXtwxMIjaDMVZlKNQaoQAJ+hlybpomtA28mLqair96uTlduIKZo6xVMBLFj+BeUMFi7SSnSU6hhMXu3zNtAIDJyHl0OlMwenQ6y0r6dxVYcUEJqzJUZTiw8NXZTNx4Mh8/uTwGAPzgannnx5S1d0E6ck1DV8OsEhpUmFUjx47y9ups5kdlVtGGdZ6r2waGm1202UV3fvxeU7gPQsg55LxhnX+objaRbWDBp4rjH5hkYGEAgLCj2GVW0Zdv1kLUEEe7nLqqDEVKEXqwa8pCf4ecf/XiVsHI0FWC+/UuOhrbrIfvdeiiokVZu7YuzAslLFT6X3696TkbDkxVhmFUbnYRNE0TAHC9Pvzwsw+/fLHd+InQTkzTXI7NfXJo2v7Zq+DqbCY2d7b0hgNz4ydi90VFi++kF4FbNn4SRPl8tUzSEgDwo+9fjFxz5L6zxunxZLOLFlPX0kiSMYJl8di7IE2LQhSHiasrMrQ0cnpyJGx7vnSi5B1ZNhoMAQBYwaZpmqaJfvN7p6IXOzueylJ/Mh/c7qK26zUiU9Z/cL6AkqQgEKfF221sGVrDOsj5Rx8/ig9RnJUS4JzLp4th07Yv1z7gPW262chty/znz++mnt0w3nbtzX3w6aPjrKhvdweC5ayov12/S6PbMCUyTEtqGerGT46nLkRQwXJe0Y41bc8BAHlFV/OhJPHThTsZGrtD1rCurGkYV+i3P13JCP7mZ5dPv7lxbOvZq3sAwGRoCTWXc7ANU4hQRZvF2BHs9sOHZ/d399swVbBcN+3QIjVtDln1o08v/TA9W05Hrr4N3jXKssRHrq5hJSmpBMBdkAnQYegaAKAo6w/O51/f+CPXrGlzdTpOy8Y2DAA4RFBGUHBQWJY4B8up+z9+/lJX8fX68PlHp/s49w8p+sMfP1EwfnW7u1xNf/V6Q1n3cDXu+v56fXBsfeMnbdtzwBGUKtq0Pa+bliD48q3ftr2uKWledxzZJmkYq0pqGtrQ1m434WLq1qzjAEw942YTNW1n6epqMQKAv95ED5ZelBYGwVyCbdeL5JbkVFdJRVmS5TKUJADebmMoARkRQuTr9QHy/qOLRVk3p/Phs1ebxXjIGEf/7Z//uiR1UAJBXFwcz1xLBQAcEnoydxrWRVm1mrs1ZY6hcglWdT+0yO5QspZ9/tHJnR9fHM8GpiqkfIJlhFDXS2GScQ6u1+HQUp++9g0NC5xHG/bydr+cDCxNEW2+qMSiXZYk2T+kuqYYBPeSlFdURiQr6/FQRwgamiJDqWadsNvA0uOsHNoqFM2eoatiWuWQ5P6hGliYslYw5pDzmWd7ri7GYcTfkWuKBtI28Lu7ovIuSLOSEtxjjJ/f+E8ezHpJIhj5UXm6cN/nK5EWn1wej11zG6ZN2ysyZIxNhtrAJIJzTzKGMT6eOYamX68Pr+5278Gcf6jEZsS68F2e4pyyFiPQtL1rypBzzzYEdyIE43WQi7Y4ytu2Q5ZOmrbHCq5qlhaFoasEoycXi/nQDOLqdrf/rb/36IuvbzxLO1t6BKN1kF9enMw9Wwwtbfzk5ta/8+NPn1xCCVsawRhnJcUYWzqxdHI8cyydvLkPXFM+Ww4fHE3vg9A0zbFrTobay9v0fRKX/vLPf7aP07lnh2lBsGxqJEryrKJCFe0l6R26ZkzUFFWGIottw7Sqmabik/lYaKaQ88XUvfPjo4kTRLk47/eFc+MnR2NbPJCyFnIuqqylE/FRFBNDVwUzAgDwXD2MylebaDkZqDIU1Ves/n5qA9oGPl96og8eu6amYqxgjDHBMlbw9fowds3zpWdphDGmylCICwCAk/n4bOnFWQ0AmI89yHmYVUGUEyy//m40aj40n1weh1lFsHw0trGCz4/GAIAke1fvxCk2rBNJve3Q0cT55ma7Oj3GCk4LhhXsWOo+yuu2v14fvl37i6lLFCJ2P3ZNGES5eN3/9cvX4qHPb3yhM2/DdGhbQZSnBYvytmn7KG/Hrnk0cWwD2wbOSnp1OhmOXAz7rKJQehcPQhccOfb9IX9+vfUsbTl1RTez3kWUtUVVCsQlVnynwcD+4tgOorztUJGEz2/8rKSUta6tD8x3E16fPjoXtwjzBlEOiUJ6SXr2KiAYffH0zRdP3xCMhKWghAXk+m7YDnz4YPwuCqPy9Tqce/Yhyb98ev16k/pRKX4sohAAcLuNFYwsnWAFr3eRIDVYw67XBxGsArYAAFZT1zbwy3XY99A2sKbCL56tAQAKRhs/Kcr6dOH6UXl1OrENXNXsyxe3az/JSkoUgv7d73xCGasodSxd1xRJkvOq1jXi2lacZaztTJ00bZeVFQCAtd0+Llxbt0ytquh9WGZlLcvAsdU4q7KC9j1s+07BchhXk6E2tMkvX9w+OPKIggCQBGuEoKQS5eFq8vx6d3U6BhJGUPrl87u27f1DpqvENgyTIA5A04DxUF/7KZCgbahiRjPOKssgrq3pqtJ1nXy7jQ9p5lhqVfeuKVtDIrRejN6NcBKFfPni1rHUk/k4LYq1nxTfeUtRlQCAi6X3dhcRjAYmeXQ6fvYqYIxNhuZ8McsO4cPlJC2YoIkAQG3Xe5aWVfSbm+2TiwVlAABwH/6/MUjWMMpaouCZh8XqBCcC2KcFu93GYqriZD4W853o3/+jJ1XdtG3/4HjMAReJ1tBwUda2QU4W3vUm4JxfHAv0m2GMPEvTFBgmuaZigtWasYZJugpXM293yCAE2zCHEq+LoqbsLkhNFVc1KyldzT0hBEIIEZTanhNFSYtiF2ZnS282ci1DebuNha4qhO61H81cM87bgal++eKWKFDokUleakTGGKE//f3PZRlCCRzSwtTJ9TpUMC6q1jZJklff3oZ107KuwTIqa/pwNYGSlOQVVjCUAILScjpEEAwHpmXoPQcA8I2fDEwzK2vTVPOKqoosEtrMs7Hctz1wbR1jpGCZYDnOypo2MiLDgUkb6h+qgUUYY2I0zD9UHPSUScczBwCgq3JNGQe9sICMZMoYzCsKOR8OTOEVV2eLnjPXlLOS+lG5nAyuTicfnC0ZY8uxqSjYP1R+VNqGIXJIWhSUtcLlxFCdcC1NxUnGDF01dLWXJNYw1oF1kIsBJtswxAHvo9zSyGSo5XkuxnwBAI9OZyLPHM+cqmbHMyfPc3HXk4uFZ2mKDGlD93FKsIz+9W89aXsuI2hoWMzxOZZe0WbqubswzQpKFJlgue05a9rtIZuPBroqE0WJs9Ig2DJN25DLumna7pDkCKGybo7G9sDSe97PPGPtp00DxkP7zX2wGA9VRQIAxFlpG0ZZ0+XE+/pmN3IMwRsI1x05pmvrUVa1XTvQCQccIRRn5bdv/a7vBXBKMmapqKSt9Bd/9kdienDk2ALYBN/p7H93RvF9hL0fJhRzgyK8aEOv1+HINS2dmBp5vY5l1AkTCZso36XmxdStaia6k16SirJ+Xw22YQoAuFx5acHGrvl+J+J7QyOWTohCaEPf26puezh2zUenM1WGQqB99ioQVn6/46ykoqBkJcUKxgo+X3qLqduwTpXh9fqwj9OspAOTFBUlCskrqqlQNPXPb3zG2NyzCZbDrPJc/YunbzQV121vmmbDuuHAJAoZu+bYNS+Wnmdpf/X0xjYwbeizVwH4/y8xpJKVtG77rKKLqXu+9N6NXQIAdE359m2wDUPPMc6PxpsgGTl2mGRTz3UtvPZT1nZl3Q8HJlEQAKCoGwkALMOGSYC3flQuR1Za1g3rqrrved/3/fcfH3MO7vxcliVDkdse7A752200cgyiKEKF11VimWrX9W3bdRxwjvdJfrdLWcsER9gwhqCEENJV8uWL2x98/MgbOve7pGlZWtT/Fwr7go48iL5nAAAAAElFTkSuQmCC';
  let _hutRoofC = null, _tileYardC = null, _tilePlazaC = null, _tileHutC = null, _wallNC = null, _wallEC = null;
  // ★[배치 18 ②] 방 지붕 — 임의 크기 맞배를 굽고 캐시한다. 화법·앵커 규약은 마을 지붕과 **완전히 같다**
  //   (`_bakeRoof` 그대로 · 처마 WALL_HEIGHT · 물매 19.2px/셀 · 앵커 = 로컬 원점(북서 오버행 모서리)).
  let _bakeRoofFn = null;
  // ★[배치 18 ③] 보이는 층(히스테리시스) — 계단 위 깜빡임 방지. 충돌·판정은 myFloor 그대로.
  let _viewFloor = 0, _viewFloorPend = 0, _viewFloorAt = 0;
  const _roofBakeCache = new Map();   // "DIxDJ" → canvas
  function roofImgFor(w, h) {
    if (!_bakeRoofFn) return null;
    const DI = w + 1, DJ = h + 1, k = DI + 'x' + DJ;
    let img = _roofBakeCache.get(k);
    if (!img) {
      // 물매 상수 19.2px/셀 = SLOPE 0.6 × 32 (building_render.py 와 같은 값). 반깊이 × 물매 = 용마루 높이.
      img = _bakeRoofFn(DI, DJ, WALL_HEIGHT, WALL_HEIGHT + Math.round((DJ / 2) * 19.2));
      _roofBakeCache.set(k, img);
    }
    return img;
  }
  // 방(임의 모양) → 최대 직사각형 분해. ㄱ자면 2장, ㅁ자면 4장 — **날개마다 맞배 한 채**가 얹힌다.
  //   한국 ㄱ자 집이 실제로 그렇게 생겼다(두 날개가 모서리에서 만난다) — 셀 단위 타일 지붕보다 고증에 맞다.
  //   방은 자주 안 바뀌므로 방 id 로 캐시한다(매 프레임 재분해 금지).
  const _roomRectCache = new Map();   // roomId → [[x0,y0,x1,y1]…] (절대 셀)
  function roomRects(room) {
    let rs = _roomRectCache.get(room.id);
    if (rs) return rs;
    const rem = new Set(room.cells);
    rs = [];
    const has = (x, y) => rem.has(`${x}_${y}`);
    let guard = 0;
    while (rem.size && guard++ < 200) {
      let best = null;
      for (const k of rem) {
        const [sx, sy] = k.split('_').map(Number);
        let maxW = 0; while (has(sx + maxW, sy)) maxW++;
        for (let w = 1; w <= maxW; w++) {
          let h = 0;
          for (;;) { let okRow = true; for (let x = sx; x < sx + w; x++) if (!has(x, sy + h)) { okRow = false; break; } if (!okRow) break; h++; }
          const area = w * h;
          if (h && (!best || area > best.a)) best = { a: area, r: [sx, sy, sx + w - 1, sy + h - 1] };
        }
      }
      if (!best) break;
      rs.push(best.r);
      for (let x = best.r[0]; x <= best.r[2]; x++) for (let y = best.r[1]; y <= best.r[3]; y++) rem.delete(`${x}_${y}`);
    }
    _roomRectCache.set(room.id, rs);
    return rs;
  }
  let _hallRoofC = null, _granC = null;   // ★[에셋 2차] 큰집 지붕(움집 물매 동형 확대)·고상곳간 통짜(기둥+판벽+이엉 — 송국리 정본)
  // ★[에셋 10차 — 건물 3D화] scripts/building_render.py 산출물. **베이크 캔버스와 계약이 같다**:
  //   같은 앵커 규약(_ox,_oy = 지붕 로컬 원점=발자국+오버행 북서 모서리의 지면 픽셀)·같은 화법(1셀 64×32px,
  //   높이 1m=32px)·같은 처마고(2m=WALL_HEIGHT). 그래서 벽·컷어웨이·z 규약을 **한 줄도 건드리지 않고**
  //   이미지만 갈아끼운다(로드 실패·미배포 시 기존 베이크가 그대로 폴백).
  const _bldSpr = {};
  (() => {
    const A = { hut_roof: [164.0, 130.4], hall_roof: [292.0, 169.1], granary: [132.0, 121.1],
                hut_s1: [164.0, 20.2], hut_s2: [164.0, 81.1], hut_s3: [164.0, 129.1],
                // ★노(爐)·숯가마 — 발자국 2×2, 서버 FURNACE_STAGES/CHARCOAL_KILN_STAGES 와 1:1
                furn_s1: [100.0, 15.3], furn_s2: [100.0, 36.2], furn_s3: [100.0, 49.1], furnace: [100.0, 55.3],
                kiln_s1: [100.0, 15.3], charcoal_kiln: [100.0, 46.0] };   // building_anchors.json 동기(scripts/test-building-anchor.js가 결정적 재계산으로 대조)
    for (const k in A) {
      const im = new Image();
      im.onload = () => { im._ox = A[k][0]; im._oy = A[k][1]; _bldSpr[k] = im; };
      im.src = '/assets/buildings/' + k + '.png';
    }
  })();
  (function _loadVilTex() {
    try {
      const th = new Image(), ea = new Image(), wl = new Image(); let n = 0;
      const done = () => { if (++n === 3) { try { _bakeVilArt(th, ea, wl); } catch (e) { console.warn('[vilart] bake 실패 — 폴백 렌더 유지', e); } } };
      th.onload = done; ea.onload = done; wl.onload = done; th.src = TEX_THATCH_URL; ea.src = TEX_EARTH_URL; wl.src = TEX_WALL_URL;
    } catch (e) { /* 폴백: 기존 단색 렌더 */ }
  })();
  function _texPix(img) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64); return g.getImageData(0, 0, 64, 64).data; }
  function _bakeVilArt(thImg, eaImg, wlImg) {
    const tp = _texPix(thImg), ep = _texPix(eaImg), wp = _texPix(wlImg);
    const CWD = 64, CHT = 32;   // 실셀 다이아(등각 정본: 인접 중심 (±32,±16) — 점묘 32×16의 2배)
    const mkTile = (pix, shade, alpha) => {
      const c = document.createElement('canvas'); c.width = CWD; c.height = CHT;
      const g = c.getContext('2d'), im = g.createImageData(CWD, CHT), d = im.data;
      for (let y = 0; y < CHT; y++) for (let x = 0; x < CWD; x++) {
        const dx = x - CWD / 2 + 0.5, dy = y - CHT / 2 + 0.5;
        if (Math.abs(dx) / (CWD / 2) + Math.abs(dy) / (CHT / 2) > 1) continue;
        const u = Math.min(63, ((dx / (CWD / 2) + dy / (CHT / 2)) * 0.5 + 0.5) * 64 | 0), v = Math.min(63, ((dy / (CHT / 2) - dx / (CWD / 2)) * 0.5 + 0.5) * 64 | 0);
        const si = (v * 64 + u) * 4, di = (y * CWD + x) * 4;
        d[di] = pix[si] * shade; d[di + 1] = pix[si + 1] * shade; d[di + 2] = pix[si + 2] * shade; d[di + 3] = alpha;
      }
      g.putImageData(im, 0, 0); return c;
    };
    _tileYardC = mkTile(ep, 0.92, 235);
    _tilePlazaC = mkTile(ep, 1.06, 235);
    _tileHutC = mkTile(ep, 0.70, 255);   // 움집 실내 다짐흙(어둑한 반수혈 바닥 — 컷어웨이 시)
    // ── 벽 유닛 텍스처 스트립(통나무 굴립주 — 생성 텍스처) 32×WALL_HEIGHT: N면(양지)·E면(그늘).
    //    벽 렌더가 전단(shear) 변환으로 평행사변형에 그대로 씌움 — 전 벽 유닛(움집·큰집·곳간·플레이어) 공용.
    const mkStrip = (shade) => {
      const c2 = document.createElement('canvas'); c2.width = 32; c2.height = WALL_HEIGHT;
      const g2 = c2.getContext('2d'), im2 = g2.createImageData(32, WALL_HEIGHT), d2 = im2.data;
      for (let y = 0; y < WALL_HEIGHT; y++) for (let x = 0; x < 32; x++) {
        const si = ((y % 64) * 64 + (x * 2) % 64) * 4, di = (y * 32 + x) * 4;
        d2[di] = wp[si] * shade; d2[di + 1] = wp[si + 1] * shade; d2[di + 2] = wp[si + 2] * shade; d2[di + 3] = 255;
      }
      g2.putImageData(im2, 0, 0); return c2;
    };
    _wallNC = mkStrip(1.0);
    _wallEC = mkStrip(0.74);
    // ── 맞배 이엉 지붕 베이크(제너릭) — ★지붕은 벽(64px) '위에' 얹힌다[사용자 확정: 유닛 문법 우선].
    //    처마=정확 벽고 64[사용자 지적]·용마루=처마+반깊이×물매(움집 물매 19.2px/셀을 전 건물 공통 — 같은 이엉 구조 고증).
    //    DI/DJ=발자국+오버행 0.5셀×2. 움집(6×4)→7×5·용마루 112, 큰집(8×8)→9×9·용마루 150(동일 물매).
    const _bakeRoof = (DI, DJ, EAVE, HMAX) => {
      const jc = DJ / 2, SL = (HMAX - EAVE) / jc;
      const W2 = (DI + DJ) * 32, H2 = (DI + DJ) * 16 + HMAX + 4;
      const c = document.createElement('canvas'); c.width = W2; c.height = H2;
      const g = c.getContext('2d'), im = g.createImageData(W2, H2), d = im.data;
      const put = (x, y, r, gg, b) => { if (x < 0 || y < 0 || x >= W2 || y >= H2) return; const i = (y * W2 + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; };
      const sx0 = DJ * 32;   // 로컬 지면점 (i,j)[셀] → 픽셀 ((i-j)*32+sx0, (i+j)*16+HMAX). 월드 대응: 지붕 원점=발자국 북서(x0-0.5,y0-0.5)셀 모서리
      const hgt = (j) => HMAX - Math.abs(j - jc) * SL;
      const tw = (i, j, sh) => { const ti = ((i * 64 | 0) % 64 + 64) % 64, tj = ((j * 64 | 0) % 64 + 64) % 64, si = (tj * 64 + ti) * 4; return [tp[si] * sh | 0, tp[si + 1] * sh | 0, tp[si + 2] * sh | 0]; };
      for (let i = 0; i <= DI; i += 0.01) {   // 지붕 상면(연속 래스터)
        for (let j = 0; j <= DJ; j += 0.01) {
          const south = j > jc, h = hgt(j);
          const X = ((i - j) * 32 + sx0) | 0, Y = ((i + j) * 16 + HMAX - h) | 0;   // (문은 벽의 개구 — 지붕엔 구멍 없음)
          let sh = south ? 0.84 : 1.0;
          if (Math.abs(j - jc) < 0.09) sh = 0.62;          // 용마루
          if (j > DJ - 0.3 || j < 0.3) sh *= 0.87;         // 처마단
          const t3 = tw(i, j, sh); put(X, Y, t3[0], t3[1], t3[2]);
        }
      }
      for (let k = 0; k <= 6; k++) {   // 동측 합각면(그늘 수직 — 벽 상단(WALL_HEIGHT)까지만: 그 아래는 벽 유닛의 몫)
        const i = DI - k * 0.01;
        for (let j = 0; j <= DJ; j += 0.01) {
          const h = hgt(j), gh = h - WALL_HEIGHT, X = ((i - j) * 32 + sx0) | 0, Yt = ((i + j) * 16 + HMAX - h) | 0;
          for (let yy = 0; yy < gh; yy++) { const t3 = tw(i * 3, yy / Math.max(1, gh), 0.5); put(X, Yt + yy, t3[0], t3[1], t3[2]); }
        }
      }
      g.putImageData(im, 0, 0);
      c._ox = sx0; c._oy = HMAX;   // drawImage 앵커: 지붕 로컬 원점 iso 위치에서 (-_ox,-_oy)
      return c;
    };
    // ★[2026-08-04d 배치 18 ②] 임의 크기 지붕이 필요해졌다(플레이어 방은 크기가 제각각).
    //   같은 베이크 함수를 밖으로 내보낸다 — **새 지붕 화법을 만들지 않는다**(사본 금지).
    _bakeRoofFn = _bakeRoof;
    _hutRoofC = _bakeRoof(7, 5, WALL_HEIGHT, WALL_HEIGHT + 48);
    _hallRoofC = _bakeRoof(9, 9, WALL_HEIGHT, WALL_HEIGHT + 86);   // ★큰집(8×8 회관): 반깊이 4.5셀 × 물매 19.2 = +86 — 마을 중심의 웅장한 이엉 맞배
    // ── ★고상곳간 통짜(송국리 정본: 굴립주 기둥 위 들린 밀폐 창고 + 사다리) — 벽 유닛 문법 대신 1장 스프라이트.
    //    구성: 기둥층 24px(통나무 세로·그늘) + 판벽 몸체 40px(N 1.0·E 0.74 — 벽 셰이드 문법) = 처마 64(전 건물 처마선 통일) + 이엉 맞배(물매 동형).
    //    실물 벽·바닥 행(data.gran)은 시각만 억제 — 콜라이더·밀폐는 불변. 컷어웨이 없음(문 없는 밀폐 — 반출입은 사다리).
    {
      const DI = 6, DJ = 4, STILT = 24, BODY = 40, EAVE = STILT + BODY, HMAX = EAVE + Math.round((DJ / 2) * 19.2);   // 발자국 5×3+오버행
      const jc = DJ / 2, SL = (HMAX - EAVE) / jc;
      const W2 = (DI + DJ) * 32, H2 = (DI + DJ) * 16 + HMAX + 4;
      const c = document.createElement('canvas'); c.width = W2; c.height = H2;
      const g = c.getContext('2d'), im = g.createImageData(W2, H2), d = im.data;
      const put = (x, y, r, gg, b, a) => { if (x < 0 || y < 0 || x >= W2 || y >= H2) return; const i = (y * W2 + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a === undefined ? 255 : a; };
      const sx0 = DJ * 32;
      const px = (i, j) => [((i - j) * 32 + sx0) | 0, ((i + j) * 16 + HMAX) | 0];   // 지면 픽셀
      const twp = (u, v, pix, sh) => { const ti = ((u | 0) % 64 + 64) % 64, tj = ((v | 0) % 64 + 64) % 64, si = (tj * 64 + ti) * 4; return [pix[si] * sh | 0, pix[si + 1] * sh | 0, pix[si + 2] * sh | 0]; };
      // 발자국은 렉트 [0.5..DI-0.5]×[0.5..DJ-0.5](오버행 안쪽) — 몸체는 발자국 그대로
      const b0 = 0.5, b1i = DI - 0.5, b1j = DJ - 0.5;
      // ① 기둥층: 모서리+중간 6주(굴립주) — 남면(i축 3주)·동면(j축 모서리) 세로 스트립, 사이는 빈 공간(들린 창고의 그늘 바닥만)
      const stiltAt = [[b0 + 0.15, b1j], [DI / 2, b1j], [b1i - 0.15, b1j], [b1i, b0 + 0.15], [b1i, DJ / 2]];   // 남면 3 + 동면 2(모서리 공유)
      for (const [si2, sj2] of stiltAt) {
        const [X0, Y0] = px(si2, sj2);
        for (let yy = 0; yy < STILT + 6; yy++) for (let xx = -4; xx <= 4; xx++) {   // 8px 폭 굴립주(+6=몸체 하단에 물림) — 들린 창고가 또렷하게
          const t3 = twp(xx * 4 + 32, yy * 3, wp, sj2 === b1j ? 0.92 : 0.7);
          put(X0 + xx, Y0 - yy, t3[0], t3[1], t3[2]);
        }
      }
      // 들린 바닥 밑면 그늘(발자국 다이아 — 기둥 사이로 보이는 어둠)
      for (let i = b0; i <= b1i; i += 0.02) for (let j = b0; j <= b1j; j += 0.02) {
        const [X, Y] = px(i, j); const i2 = (Y * W2 + X) * 4;
        if (d[i2 + 3] === 0) put(X, Y, 14, 11, 8, 200);
      }
      // ② 판벽 몸체(N면=i축 벽·양지 / E면=j축 벽·그늘) — 통나무 가로결, 상단은 STILT+BODY까지
      for (let i = b0; i <= b1i; i += 0.01) {   // N면(북벽은 안 보임 — 남면이 화면 정면): 남변 j=b1j
        const [X, Y] = px(i, b1j);
        for (let yy = STILT; yy < EAVE; yy++) { const t3 = twp(i * 64, (EAVE - yy) * 1.6, wp, 1.0); put(X, Y - yy, t3[0], t3[1], t3[2]); }
      }
      for (let j = b0; j <= b1j; j += 0.01) {   // E면: 동변 i=b1i
        const [X, Y] = px(b1i, j);
        for (let yy = STILT; yy < EAVE; yy++) { const t3 = twp(j * 64, (EAVE - yy) * 1.6, wp, 0.74); put(X, Y - yy, t3[0], t3[1], t3[2]); }
      }
      // ③ 사다리(남면 중앙 — 지면→몸체): 세로 2줄 + 가로장
      { const [LX, LY] = px(DI / 2 + 0.35, b1j);
        for (let yy = 0; yy <= EAVE - 10; yy++) { put(LX - 3, LY - yy + 2, 150, 118, 70); put(LX + 3, LY - yy + 2, 150, 118, 70); if (yy % 6 === 3) for (let xx = -2; xx <= 2; xx++) put(LX + xx, LY - yy + 2, 172, 138, 86); } }
      // ④ 이엉 맞배 지붕(물매 동형·오버행 0.5셀=로컬 [0..DI]×[0..DJ])
      const hgt = (j) => HMAX - Math.abs(j - jc) * SL;
      for (let i = 0; i <= DI; i += 0.01) for (let j = 0; j <= DJ; j += 0.01) {
        const south = j > jc, h = hgt(j);
        const X = ((i - j) * 32 + sx0) | 0, Y = ((i + j) * 16 + HMAX - h) | 0;
        let sh = south ? 0.84 : 1.0;
        if (Math.abs(j - jc) < 0.09) sh = 0.62;
        if (j > DJ - 0.3 || j < 0.3) sh *= 0.87;
        const t3 = twp(i * 64, j * 64, tp, sh); put(X, Y, t3[0], t3[1], t3[2]);
      }
      for (let k = 0; k <= 6; k++) {   // 동측 합각(처마→몸체 상단)
        const i = DI - k * 0.01;
        for (let j = 0; j <= DJ; j += 0.01) {
          const h = hgt(j), gh = h - EAVE, X = ((i - j) * 32 + sx0) | 0, Yt = ((i + j) * 16 + HMAX - h) | 0;
          for (let yy = 0; yy < gh; yy++) { const t3 = twp(i * 192, yy * 2, tp, 0.5); put(X, Yt + yy, t3[0], t3[1], t3[2]); }
        }
      }
      g.putImageData(im, 0, 0);
      c._ox = sx0; c._oy = HMAX;
      _granC = c;
    }
  }
  function clCellOf(x, y) { return { cx: Math.floor(x / CL_BUILDING_SIZE), cy: Math.floor(y / CL_BUILDING_SIZE) }; }
  // 14.51: 3초 progress 작업 시작 (place 또는 dismantle)
  function startBuildAction(kind, payload) {
    if (buildAction) { showNotice('이미 작업 중'); return; }
    const durationMs = 3000;
    buildAction = { kind, startedAt: performance.now(), durationMs, payload,
                    startPx: lastMouseSx, startPy: lastMouseSy,
                    startWx: myAbsPredicted.x, startWy: myAbsPredicted.y };
    showNotice(kind === 'place' ? '🏗️ 배치 중... (3초)' : '🔧 분해 중... (3초)');
  }
  function cancelBuildAction(reason) {
    if (!buildAction) return;
    buildAction = null;
    if (reason) showNotice(reason);
  }
  // 매 frame 호출 — 작업 진행 + 완료 시 송신
  function updateBuildAction() {
    if (!buildAction) return;
    const now = performance.now();
    const elapsed = now - buildAction.startedAt;
    // 14.54-d: 시작 위치 대비 4px 이상 이동했으면 취소
    const moved = Math.hypot(myAbsPredicted.x - buildAction.startWx, myAbsPredicted.y - buildAction.startWy);
    if (moved > 4) { cancelBuildAction('이동으로 작업 취소'); return; }
    if (elapsed >= buildAction.durationMs) {
      // 완료 → 송신
      const { kind, payload } = buildAction;
      if (kind === 'place') {
        sendPrimaryAt({
          type: 'place_building',
          itemType: payload.itemType,
          floor: payload.floor,
          dir: payload.dir,
          atX: payload.atX, atY: payload.atY,
        });
        // 인벤 0 되면 placement 종료
        if ((inventory[payload.itemType] || 0) <= 1) {
          placementMode = null; showNotice('인벤 떨어짐 — 배치 종료');
        }
      } else if (kind === 'dismantle') {
        sendPrimary({ type: 'dismantle_building', buildingId: payload.buildingId });
      }
      buildAction = null;
    }
  }
  // 14.50: player 80px 안 가장 가까운 door (toggle용)
  function findNearestDoor(px, py, floor) {
    let best = null, bestD = 80;
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const b of c.buildings.values()) {
        if (b.type !== 'door') continue;
        if ((b.floor || 0) !== floor) continue;
        const ax = ox + b.x, ay = oy + b.y;
        const d = Math.hypot(ax - px, ay - py);
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    return best;
  }
  function clHasFenceAt(cellCx, cellCy, floor) {
    // O(1) — clFenceCellMap 조회 (이전 전체 건물 순회 O(n) 제거)
    ensureWallMap();
    return clFenceCellMap.has(`${cellCx}_${cellCy}_${floor}`);
  }
  function clHasWallAt(absX, absY, cellCx, cellCy, side, floor) {
    // O(1) — clWallCellMap(절대 cell+side+floor) 조회. (이전엔 전체 건물 순회 O(n) → 마을 672채서 매 프레임 폭발)
    ensureWallMap();
    return clWallCellMap.has(`${cellCx}_${cellCy}_${side}_${floor}`);
  }
  // === 14.49-e6-b: wall edge 캐시 (콜라이더 미러 · 위층 컷어웨이 BFS 입력) ===
  // 1) clWallCellMap: 모든 wall edge 위치 O(1) lookup (절대 cell + side + floor)
  // ★★[2026-08-04d 배치 18 ①] **방 판정은 여기서 사라졌다 — 서버가 판정한다.**
  //   종전: 클라가 제 손으로 BFS(`computeRoom`)를 돌려 방을 만들었다. 문제가 셋이었다.
  //     ⓐ **열린 문으로 샜다** — 열린 문은 clWallCellMap 에서 빠지므로 방이 문 밖으로 흘러나갔다.
  //        그래서 마을 건물은 방을 못 쓰고 발자국 렉트(data.hut/bld)로 우회해야 했다(4272행 주석).
  //     ⓑ **문을 여닫을 때마다 전 맵 재구축**(clWallMapBuiltAt=0)이 걸렸다.
  //     ⓒ 방 id 가 클라 로컬 카운터라 클라마다·순간마다 달랐다 — 서버와 대화할 수 없는 값.
  //   이제 `server/rooms.js` 가 정본이고 클라는 **받아서 꽂기만** 한다(사본 방지 — 두 진실 금지).
  //   자료구조와 소비처 계약은 그대로 둔다: `cellRoomCache` 는 여전히 "절대셀_층" → roomData 이고
  //   roomData 는 여전히 `{ id, cells:Set, isIndoor }` 라 컷어웨이·위층 판정이 한 줄도 안 바뀐다.
  //   서버가 준 방은 **정의상 실내**다(벽·문으로 닫혔고 바닥이 다 깔린 것만 방이다) → isIndoor 항상 true.
  const clWallCellMap = new Map(); // "cx_cy_side_floor" → true (절대 cell)
  const cellRoomCache = new Map(); // "cx_cy_floor" → roomData  ★서버 방송(rooms_update)이 채운다
  const srvRooms = new Map();      // roomId → roomData (같은 방의 모든 셀이 같은 객체를 공유 — 동일성 비교 유지)
  const clFloorCellMap = new Map(); // "cx_cy_floor" → true (위층 BFS cutaway용)
  const clFenceCellMap = new Map(); // "cx_cy_floor" → true (fence cell — clHasFenceAt O(1)용)
  const clMaxFloorMap = new Map(); // "cx_cy" → max floor (가장 위쪽 floor tile)
  let clWallMapBuiltAt = 0;
  // 서버 방 수신 — 존 로컬 셀로 오므로 **그 존의 원점**으로 절대 셀로 옮긴다.
  //   ★배치 17 의 교훈이 그대로 적용된다(렉트는 로컬·내 위치는 절대라 영원히 불일치였다).
  function ingestRooms(list, removed, zoneMeta) {
    const ox = Math.floor((zoneMeta?.worldOffsetX || 0) / CL_BUILDING_SIZE);
    const oy = Math.floor((zoneMeta?.worldOffsetY || 0) / CL_BUILDING_SIZE);
    for (const id of (removed || [])) {
      const old = srvRooms.get(id);
      if (!old) continue;
      for (const k of old.cells) cellRoomCache.delete(`${k}_${old.floor}`);
      srvRooms.delete(id); _roomRectCache.delete(id);   // ★[배치 18 ②] 방이 사라지면 지붕 분해 캐시도
    }
    for (const r of (list || [])) {
      const old = srvRooms.get(r.id);
      if (old) for (const k of old.cells) cellRoomCache.delete(`${k}_${old.floor}`);
      _roomRectCache.delete(r.id);   // ★모양이 바뀌었을 수 있다 — 지붕을 다시 분해한다
      const cells = new Set();
      const flat = r.cells || [];
      for (let i = 0; i + 1 < flat.length; i += 2) cells.add(`${ox + flat[i]}_${oy + flat[i + 1]}`);
      const room = { id: r.id, floor: r.floor | 0, cells, isIndoor: true, bbox: r.bbox };
      srvRooms.set(r.id, room);
      for (const k of cells) cellRoomCache.set(`${k}_${room.floor}`, room);
    }
  }

  function clRebuildWallCellMap() {
    clWallCellMap.clear();
    // ★[배치 18 ①] 여기서 `cellRoomCache.clear()` 를 **하면 안 된다.** 방은 이제 클라가 만드는 게 아니라
    //   서버가 보내 준 값이다 — 벽 캐시를 다시 굽는다고 서버가 다시 보내 주지 않는다.
    //   (E2E 가 잡았다: 문을 여닫으면 clWallMapBuiltAt=0 → 이 함수 → 방이 통째로 날아가 실내가 풀렸다.)
    clFloorCellMap.clear();
    clFenceCellMap.clear();
    clMaxFloorMap.clear();
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const oxCells = Math.floor((zm.worldOffsetX || 0) / CL_BUILDING_SIZE);
      const oyCells = Math.floor((zm.worldOffsetY || 0) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        const bcx = Math.floor(b.x / CL_BUILDING_SIZE);
        const bcy = Math.floor(b.y / CL_BUILDING_SIZE);
        const f = b.floor || 0;
        if (b.type === 'wall' || (b.type === 'door' && !b.data?.open)) {
          // 14.50: 닫힌 door도 wall처럼 시야/collider 차단
          const side = b.data?.side;
          if (!side) continue;
          if (b.data?.damaged) continue;
          clWallCellMap.set(`${oxCells + bcx}_${oyCells + bcy}_${side}_${f}`, true);
        } else if (b.type === 'floor') {
          const absKey = `${oxCells + bcx}_${oyCells + bcy}`;
          clFloorCellMap.set(`${absKey}_${f}`, true);
          const curMax = clMaxFloorMap.get(absKey);
          if (curMax === undefined || curMax < f) clMaxFloorMap.set(absKey, f);
        } else if (b.type === 'fence') {
          clFenceCellMap.set(`${oxCells + bcx}_${oyCells + bcy}_${f}`, true);
        }
      }
    }
    clWallMapBuiltAt = performance.now();
  }
  function ensureWallMap() {
    if (clWallMapBuiltAt === 0 || performance.now() - clWallMapBuiltAt > 5000) clRebuildWallCellMap();
  }
  // 14.49-e7ab: 위층 BFS cutaway — 머리 위 floor tile에서 BFS로 연결된 building의 모든 wall 완전 투명
  function computeAboveCutawayWalls(myCx, myCy, myFloor) {
    const result = new Set();
    ensureWallMap();
    const aboveFloor = myFloor + 1;
    if (!clFloorCellMap.has(`${myCx}_${myCy}_${aboveFloor}`)) return result;
    const visited = new Set();
    const queue = [[myCx, myCy]];
    visited.add(`${myCx}_${myCy}`);
    const MAX_BFS = 500;
    while (queue.length > 0 && visited.size < MAX_BFS) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = `${nx}_${ny}`;
        if (visited.has(k)) continue;
        if (clFloorCellMap.has(`${nx}_${ny}_${aboveFloor}`)) {
          visited.add(k);
          queue.push([nx, ny]);
        }
      }
    }
    // building cells의 4 edge wall key 생성
    for (const k of visited) {
      const [cxs, cys] = k.split('_');
      const cx = +cxs, cy = +cys;
      result.add(`${cx}_${cy}_N_${aboveFloor}`);   // N edge
      result.add(`${cx}_${cy}_E_${aboveFloor}`);   // E edge
      result.add(`${cx}_${cy+1}_N_${aboveFloor}`); // S edge = 인접 cell의 N
      result.add(`${cx-1}_${cy}_E_${aboveFloor}`); // W edge = 인접 cell의 E
    }
    return result;
  }
  // 14.49-e7ag/al: 머리 위 BFS cutaway — floor tile OR stair cell 인 곳도 expand
  // stair는 그 위치에 floor tile 없어도 BFS 연속 (사용자 요구)
  function computeAboveCutawayCells(myCx, myCy, myFloor) {
    const result = new Set();
    ensureWallMap();
    const aboveFloor = myFloor + 1;
    if (!clFloorCellMap.has(`${myCx}_${myCy}_${aboveFloor}`)) return result;
    function isCellInBuilding(cx, cy) {
      // floor tile at aboveFloor OR stair cell (stair.floor === myFloor, 위층은 stair 위)
      if (clFloorCellMap.has(`${cx}_${cy}_${aboveFloor}`)) return true;
      if (clStairCellCache && clStairCellCache.has(`${cx}_${cy}`)) {
        const entry = clStairCellCache.get(`${cx}_${cy}`);
        if (entry && entry.stair && (entry.stair.floor || 0) === myFloor) return true;
      }
      return false;
    }
    const queue = [[myCx, myCy]];
    result.add(`${myCx}_${myCy}`);
    const MAX_BFS = 500;
    while (queue.length > 0 && result.size < MAX_BFS) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = `${nx}_${ny}`;
        if (result.has(k)) continue;
        if (isCellInBuilding(nx, ny)) {
          result.add(k);
          queue.push([nx, ny]);
        }
      }
    }
    return result;
  }
  // 인접 cell (cx, cy) → (cx+dx, cy+dy) 사이 벽 있나? dx,dy는 ±1만 (cardinal)
  function clHasWallBetween(cx, cy, dx, dy, floor) {
    if (dx === 1)  return clWallCellMap.has(`${cx}_${cy}_E_${floor}`);
    if (dx === -1) return clWallCellMap.has(`${cx-1}_${cy}_E_${floor}`);
    if (dy === 1)  return clWallCellMap.has(`${cx}_${cy+1}_N_${floor}`);
    if (dy === -1) return clWallCellMap.has(`${cx}_${cy}_N_${floor}`);
    return false;
  }
  // ★[배치 18 ①] 방 조회 — 계산하지 않는다. 서버가 보내 준 것을 꺼내 볼 뿐이다.
  function isCellIndoor(cx, cy, floor) {
    const cached = cellRoomCache.get(`${cx}_${cy}_${floor}`);
    return !!(cached && cached.isIndoor);
  }
  function playerIsIndoors() {
    const cx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
    const cy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    return isCellIndoor(cx, cy, myFloor);
  }
  window.playerIsIndoors = playerIsIndoors;
  // ★[배치 18 ①] 방 진단 훅 — 하네스가 "지금 내가 어느 방인가"를 계약 수준에서 읽는다(읽기 전용).
  window.__roomDbg = () => {
    const cx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE), cy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    const r = cellRoomCache.get(`${cx}_${cy}_${myFloor}`) || null;
    return { cx, cy, floor: myFloor, indoors: !!r, roomId: r ? r.id : null, roomCells: r ? r.cells.size : 0,
      rooms: srvRooms.size, cachedCells: cellRoomCache.size };
  };
  window.dbg = () => {
    ensureWallMap();
    const floors = {};
    for (const k of clWallCellMap.keys()) {
      const f = k.split('_')[3];
      floors[f] = (floors[f] || 0) + 1;
    }
    return {
      pos: { ...myAbsPredicted },
      cell: { cx: Math.floor(myAbsPredicted.x/CL_BUILDING_SIZE), cy: Math.floor(myAbsPredicted.y/CL_BUILDING_SIZE) },
      floor: myFloor,
      indoors: playerIsIndoors(),
      wallCells: clWallCellMap.size,
      wallsByFloor: floors,
      rooms: srvRooms.size,            // ★서버 판정 방(배치 18) — 클라 BFS 는 없어졌다
      cachedCells: cellRoomCache.size,
    };
  };
  // 14.49-e3-perf2: 계단 측면 진입 차단 + 클라 stair cell 캐시 (O(1))
  function clDirVec(dir) {
    if (dir === 'N') return { x: 0, y: -1 };
    if (dir === 'S') return { x: 0, y: 1 };
    if (dir === 'E') return { x: 1, y: 0 };
    if (dir === 'W') return { x: -1, y: 0 };
    return { x: 0, y: -1 };
  }
  // 전역 abs cell key → { stairRef, step }. building 추가/제거 시 dirty 마킹.
  const clStairCellCache = new Map();
  let clStairCacheBuildAt = 0;
  function clRebuildStairCellCache() {
    clStairCellCache.clear();
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const oxCells = Math.floor((zm.worldOffsetX || 0) / CL_BUILDING_SIZE);
      const oyCells = Math.floor((zm.worldOffsetY || 0) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        if (b.type !== 'stair') continue;
        const dir = b.data?.dir || 'N';
        const dv = clDirVec(dir);
        const acx = Math.floor(b.x / CL_BUILDING_SIZE);
        const acy = Math.floor(b.y / CL_BUILDING_SIZE);
        for (let s = 0; s <= 2; s++) {
          const absCx = oxCells + acx + dv.x * s;
          const absCy = oyCells + acy + dv.y * s;
          clStairCellCache.set(`${absCx}_${absCy}`, { stair: b, step: s });
        }
      }
    }
    clStairCacheBuildAt = performance.now();
  }
  function clFindStairForCell(cx, cy) {
    // 0.5초마다 lazy rebuild (building add/remove broadcast가 자주 안 옴)
    if (performance.now() - clStairCacheBuildAt > 500) clRebuildStairCellCache();
    return clStairCellCache.get(`${cx}_${cy}`) || null;
  }
  // 나무 콜라이더 — 서버 zone.js isBlockedByTree 미러. (resources는 zone-local 좌표 → abs로 변환)
  const PLAYER_BODY_R = 6;  // 서버와 동일
  const TRUNK_COLLIDER_MAX = 9;  // 서버와 동일 — 줄기 충돌 반경 상한
  const ROCK_COLLIDER_R = 14;    // 서버와 동일 — ★바위·광맥 차단 반경(대형 자연물 물리 실체)
  function clientNearbyTrees(ax, ay) {
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.resources) return null;
    const ox = pc.meta?.worldOffsetX || 0, oy = pc.meta?.worldOffsetY || 0;
    let out = null;
    for (const r of pc.resources.values()) {
      const isRock = (r.type === 'rock' || r.type === 'ore');   // ★바위·광맥도 차단 개체
      if (!isRock && (r.type !== 'tree' || !r.r)) continue;
      const tx = r.x + ox, ty = r.y + oy;
      if (Math.abs(tx - ax) > 40 || Math.abs(ty - ay) > 40) continue;  // 근처만 (max 충돌 20 + 이동여유)
      (out || (out = [])).push({ tx, ty, r: r.r || 0, rock: isRock ? 1 : 0 });
    }
    return out;
  }
  function clientIsBlockedByTree(x, y, trees) {
    if (!trees) return false;
    for (const t of trees) {
      const tr = t.rock ? ROCK_COLLIDER_R : Math.min(t.r, TRUNK_COLLIDER_MAX);   // 서버와 동일(바위=고정 반경)
      if (Math.hypot(t.tx - x, t.ty - y) < tr + PLAYER_BODY_R) return true;
    }
    return false;
  }

  function clientIsBlockedByWall(newX, newY, oldX, oldY, playerFloor = 0) {
    const oc = clCellOf(oldX, oldY);
    const nc = clCellOf(newX, newY);
    if (oc.cx === nc.cx && oc.cy === nc.cy) return false;
    // 14.50: fence cell 진입 차단 (cell 전체 차지)
    if (clHasFenceAt(nc.cx, nc.cy, playerFloor)) return true;
    // 14.49-e3: 계단 측면 진입 차단. 14.49-e7am: floor check 추가 (server와 일치).
    const enteringStair = clFindStairForCell(nc.cx, nc.cy);
    if (enteringStair) {
      const fromStair = clFindStairForCell(oc.cx, oc.cy);
      const sameStair = fromStair && fromStair.stair.id === enteringStair.stair.id;
      if (!sameStair) {
        const dir = enteringStair.stair.data?.dir || 'N';
        const dv = clDirVec(dir);
        const moveX = nc.cx - oc.cx, moveY = nc.cy - oc.cy;
        const stairFloor = enteringStair.stair.floor || 0;
        const lowEntry = enteringStair.step === 0 && moveX === dv.x && moveY === dv.y && playerFloor === stairFloor;
        const highEntry = enteringStair.step === 2 && moveX === -dv.x && moveY === -dv.y && playerFloor === stairFloor + 1;
        if (!lowEntry && !highEntry) return true;
      }
    }
    // 셀 단위 경로 추적 (server isBlockedByWall rewrite 미러 — 코너 컷·멀티셀 터널링 방지)
    let blocked = false, reason = '';
    let cx = oc.cx, cy = oc.cy;
    let steps = 0;
    while (cx !== nc.cx || cy !== nc.cy) {
      if (++steps > 64) { blocked = true; reason = 'MAX'; break; }
      const dx = nc.cx - cx, dy = nc.cy - cy;
      const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      if (sx !== 0 && sy !== 0) {
        // 대각 한 칸: x먼저 / y먼저 L-경로 중 하나라도 열려 있어야 통과 (코너 컷 방지)
        const viaX = !clEdgeBlockedStep(cx, cy, sx, 0, playerFloor) && !clEdgeBlockedStep(cx + sx, cy, 0, sy, playerFloor);
        const viaY = !clEdgeBlockedStep(cx, cy, 0, sy, playerFloor) && !clEdgeBlockedStep(cx, cy + sy, sx, 0, playerFloor);
        if (!viaX && !viaY) { blocked = true; reason = `DIAG@(${cx},${cy})`; break; }
        cx += sx; cy += sy;
      } else if (sx !== 0) {
        if (clEdgeBlockedStep(cx, cy, sx, 0, playerFloor)) { blocked = true; reason = sx > 0 ? 'E' : 'W'; break; }
        cx += sx;
      } else {
        if (clEdgeBlockedStep(cx, cy, 0, sy, playerFloor)) { blocked = true; reason = sy > 0 ? 'S' : 'N'; break; }
        cy += sy;
      }
    }
    // DEBUG — 클라가 어떤 cell→cell 시도하는지, 막힘/통과 결과까지 (기본 OFF; 콘솔에서 _collDbg=true로 켜기)
    if (window._collDbg === true) {
      console.log(`[coll] cell ${oc.cx},${oc.cy}→${nc.cx},${nc.cy} f${playerFloor} ${blocked ? 'BLOCKED:' + reason : 'pass'} (zones: ${Array.from(conns.keys()).map(k => k + ':' + (conns.get(k).buildings?.size||0)).join(',')})`);
    }
    return blocked;
  }
  // 인접 cell (cx,cy) → (cx+sx, cy+sy) cardinal 한 칸 이동이 wall edge로 막히나 (clientIsBlockedByWall용)
  function clEdgeBlockedStep(cx, cy, sx, sy, floor) {
    const ax = (cx + 0.5) * CL_BUILDING_SIZE, ay = (cy + 0.5) * CL_BUILDING_SIZE;
    if (sx === 1)  return clHasWallAt(ax, ay, cx, cy, 'E', floor);
    if (sx === -1) return clHasWallAt(ax - CL_BUILDING_SIZE, ay, cx - 1, cy, 'E', floor);
    if (sy === 1)  return clHasWallAt(ax, ay + CL_BUILDING_SIZE, cx, cy + 1, 'N', floor);
    if (sy === -1) return clHasWallAt(ax, ay, cx, cy, 'N', floor);
    return false;
  }
  window._collDbg = false; // 콘솔에서 window._collDbg = true로 켤 수 있음 (기본 OFF)
  let lastServerPingMs = 0;
  let lastTickAt = 0;

  // 색상 팔레트
  const COLORS = ['#f0c674', '#5a9ae0', '#e07a5a', '#9a6ad8', '#5ad88a', '#d85a8a', '#5ad8d8', '#d8d85a'];

  // 채팅 상태
  let chatActive = false;
  const chatLog = []; // {name, color, text, t}
  const speechBubbles = new Map(); // pid -> {text, until}

  // === 월드 시계 (Day/Night) ===
  // serverNow = clientNow + serverNowOffset 으로 보정한 timestamp 기준 phase 계산.
  // 모든 zone이 동일한 epoch+dayLength 쓰니까 클라/서버 시계 차이만 보정하면 동일 phase.
  let worldClock = null;
  let _lonView = 0; // §19 4파: 뷰(카메라) 경도 오프셋(하루 비율 0~0.045) — render가 매 프레임 갱신, worldPhase가 가산
  function worldNow() {
    return Date.now() + (worldClock ? worldClock.serverNowOffset : 0);
  }
  function worldPhase() {
    if (!worldClock) return 0.2; // 기본: 한낮
    const t = (worldNow() - worldClock.epoch) % worldClock.dayLengthMs;
    // §19 4파 경도 로컬 태양시(표시 공식): 뷰(카메라) 경도 오프셋 가산 — 동쪽이 먼저 밝고 먼저 어두워짐.
    //   시계·밤 오버레이·(밤) 라벨이 전부 이 로컬 phase를 소비(클라 표시 전용 — 서버 econ 일 경계는 전역).
    return (t / worldClock.dayLengthMs + _lonView) % 1;
  }
  function isNight() {
    if (!worldClock) return false;
    return worldPhase() > worldClock.dayPhaseRatio;
  }
  function darknessLevel() {
    if (!worldClock) return 0;
    const p = worldPhase();
    const dr = worldClock.dayPhaseRatio;
    if (p < dr - 0.05) return 0;
    if (p < dr) return (p - (dr - 0.05)) / 0.05;
    if (p > 0.95) return (1 - p) / 0.05;
    return 1;
  }
  // HUD 표시용 — "07:42" 같은 24시간 시계 문자열
  function gameTimeString() {
    if (!worldClock) return '--:--';
    const p = worldPhase();
    // phase 0 = 새벽 6시로 잡자 — 익숙한 감각
    const hours24 = ((p * 24) + 6) % 24;
    const hh = Math.floor(hours24);
    const mm = Math.floor((hours24 - hh) * 60);
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }

  // 존별 연결과 상태
  //   conns[zoneId] = { ws, role: 'primary'|'observer', meta, resources, claims, others }
  const conns = new Map();

  // ═══ P4 전쟁 전투 렌더·관전·지휘 (서버 broadcast: tick bt/bs/bc/br + war_battle 채널) ═══
  //   병종 int(bt 0~7) 직접 인덱스 색 — war-live.MU_TYPE_INT 순서(champion..militia) = 랩 MU_TYPE_COL verbatim.
  const WAR_BT_COL  = ['#c8862e','#b5563a','#5a8ad0','#57a8a8','#9a9488','#5fbf6a','#c9a24b','#8a7a5a'];
  const WAR_BT_NAME = ['챔피언','대부병','창병','장창병','단검병','궁수','투석병','민병'];
  const WAR_SIDE_COL = ['#7ab0ff','#ff8a7a'];   // [0]=공격(A·battle-core SIDE_COL.A), [1]=방어(B·SIDE_COL.B)
  const warBattles = new Map();                 // id → {id, ox, oy(절대 px), atk, def, casus, aliveA, aliveB, phase, seenAt, resolvedAt}
  // 관전 카메라 트윈(랩 focusCameraOnBattle 정합·0.6s smoothstep) — active=전투 focus, returning=본체 복귀.
  const _warSpec = { active: false, returning: false, id: null, from: null, to: null, t0: 0, dur: 600 };
  let _warCmdId = null;                          // 지휘 참가 중 warId (null=관전만/미참가)
  let _warCmdMsg = '';                           // war_command_ack 상태 문구(HUD)
  let _lastCamAbs = { x: 0, y: 0 };              // 매 프레임 실제 카메라 abs(트윈 출발점 캡처용)
  // 화살 이펙트 큐 — 서버 arrow_fx(사냥꾼 사격) [{x0,y0,x1,y1(절대 월드 px), at, ms}]
  const _arrowFx = [];
  let _warHudEl = null;                          // 스펙테이터 HUD DOM(지연 생성)

  // === Entity interpolation (다른 플레이어/mob 부드러운 움직임) ===
  // 서버 tick(10Hz, 100ms 간격) 위치를 timestamped buffer에 쌓고, 렌더는 (now - INTERP_DELAY_MS)
  // 시점의 위치를 양옆 두 샘플 사이 선형 보간으로 그린다. 60fps에서 연속적으로 흐름.
  // 본인 캐릭터(myAbsPredicted)는 입력 예측이라 영향 없음.
  // 핸드오프 시 player_left/mob_removed 받으면 즉시 비우니까 잔상 없음.
  const INTERP_DELAY_MS = 60;  // server tick 33ms(30Hz) + 약간의 jitter buffer
  const INTERP_HISTORY_MS = 1000;
  function pushSample(buf, t, x, y) {
    buf.push({ t, x, y });
    const cutoff = t - INTERP_HISTORY_MS;
    while (buf.length > 2 && buf[0].t < cutoff) buf.shift();
  }
  function sampleAt(buf, t, fallbackX, fallbackY) {
    if (!buf || buf.length === 0) return { x: fallbackX, y: fallbackY };
    if (t <= buf[0].t) return { x: buf[0].x, y: buf[0].y };
    const last = buf[buf.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y };
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1], b = buf[i];
      if (a.t <= t && t <= b.t) {
        const dt = b.t - a.t;
        const u = dt > 0 ? (t - a.t) / dt : 0;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
    }
    return { x: last.x, y: last.y };
  }

  // === 입력 ===
  const keys = new Set();
  // e.code → 게임 키 매핑 — OS 키보드 layout(한/영) 무관
  // 'KeyW' → 'w' 등으로 정규화해서 게임 로직은 한 가지만 보면 됨
  const CODE_TO_KEY = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    KeyE: 'e', KeyC: 'c', KeyT: 't', KeyY: 'y', KeyF: 'f',
    KeyB: 'b', KeyH: 'h', KeyM: 'm', KeyK: 'k', KeyJ: 'j', KeyR: 'r', KeyL: 'l',
    KeyP: 'p', KeyO: 'o', KeyG: 'g', KeyN: 'n', KeyV: 'v', KeyZ: 'z', KeyX: 'x',
    KeyU: 'u', KeyI: 'i', Comma: ',', Period: '.',
    Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3',
    ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
    Space: ' ', Enter: 'enter', Tab: 'tab',
  };
  function normalizeKey(e) {
    // e.code 우선 (한글 IME 등에서도 동일). fallback: e.key
    return CODE_TO_KEY[e.code] || (e.key || '').toLowerCase();
  }
  window.addEventListener('keydown', (e) => {
    // Phase 14.40: Shift는 modal/채팅 상관 없이 sprint 상태로만 트랙
    if (e.key === 'Shift' && !mySprint) { mySprint = true; updateHud(); }
    if (chatActive) return;
    const k = normalizeKey(e);
    if (k === 'enter') {
      e.preventDefault();
      openChat();
      return;
    }
    if (k === ' ' || k.startsWith('arrow') || k === 'tab') e.preventDefault();
    if (keys.has(k)) return;
    keys.add(k);
    // 리컨실리에이션: 입력 전송은 루프의 고정 스텝이 전담(≤33ms). keydown 즉시-send 제거 —
    //   즉시-send가 스텝/accumulator를 불규칙하게 건드려 이동이 버벅거렸음. 시작 지연 ≤33ms로 무시 가능.
    // Phase 14.41: 다운 중엔 행동 키 차단 (R 키 구조 시도만 별도 처리 — 본인이 다운 아닐 때만)
    if (myIsDown) {
      // 다운 중엔 어떤 행동도 안 함 — 부활 패널에서만 클릭
      return;
    }
    if (k === 'e') {
      // ★[11차 채광 재설계] E를 **누르고 있으면 1초마다 반복** — 채굴이 60타에 덩이 하나라
      //   한 번씩 누르게 두면 손가락이 남아난다. 서버가 1초/타를 강제하므로 과송신은 무해하고,
      //   문 토글·도살은 첫 1회만(반복 타이머는 gather 전용 — 문이 깜빡이지 않는다).
      if (!window.__eRepeat) window.__eRepeat = setInterval(() => {
        if (!keys.has('e') || chatActive || myIsDown) { clearInterval(window.__eRepeat); window.__eRepeat = null; return; }
        sendPrimary({ type: 'gather' });
      }, 1000);
      // 14.50: E 키 — 주변 door 토글, 없으면 사체 도살, 없으면 gather
      const nearDoor = findNearestDoor(myAbsPredicted.x, myAbsPredicted.y, myFloor);
      if (nearDoor) sendPrimary({ type: 'door_toggle', buildingId: nearDoor.id });
      else {
        // Phase 5-7: 근처 사체 찾기
        let nearestCorpse = null, nearestDist = 80;
        const pc = conns.get(primaryZoneId);
        if (pc) {
          const ox = pc.meta?.worldOffsetX || 0, oy = pc.meta?.worldOffsetY || 0;
          for (const co of pc.corpses.values()) {
            const d = Math.hypot(co.x + ox - myAbsPredicted.x, co.y + oy - myAbsPredicted.y);
            if (d < nearestDist) { nearestDist = d; nearestCorpse = co; }
          }
        }
        if (nearestCorpse) sendPrimary({ type: 'butcher', cid: nearestCorpse.cid });
        else sendPrimary({ type: 'gather' });
      }
    }
    // 14.53: 1키 = hotkey1 슬롯 토글 (착용 ↔ 해제)
    if (k === '1') {
      sendPrimary({ type: 'toggle_hotkey' });
    }
    else if (k === 'o') sendPrimary({ type: 'sort_ore' });   // ★[11차] 선광 — 캔 원석 덩이를 광석/맥석으로 가른다
    else if (k === 'c' && e.shiftKey) sendPrimary({ type: 'claim', kind: 'guild' });  // 길드 영토 (Shift+C)
    else if (k === 'c') sendPrimary({ type: 'claim', kind: 'personal' });  // 개인 사유지 (1 grid)
    else if (k === 't' && !e.shiftKey) sendPrimary({ type: 'claim', kind: 'temporary' });  // 임시 사유지 (1 grid)
    else if (k === 't') sendPrimary({ type: 'trade_offer', give: 'wood' });
    else if (k === 'y') sendPrimary({ type: 'trade_offer', give: 'stone' });
    else if (k === 'f') { sendPrimary({ type: 'attack' }); myLastAttackAt = performance.now(); }
    else if (k === 'g') {
      // Phase 5-I: 원거리 공격 — 마우스 방향으로 화살. aim은 primary zone-local 좌표.
      const pc = conns.get(primaryZoneId);
      if (pc && pc.meta && window._lastMouseWx !== undefined) {
        const aimX = window._lastMouseWx - (pc.meta.worldOffsetX || 0);
        const aimY = window._lastMouseWy - (pc.meta.worldOffsetY || 0);
        sendPrimary({ type: 'ranged_attack', aimX, aimY });
        myLastAttackAt = performance.now();
      }
    }
    else if (k === 'b') {
      // 14.51: B 키 = 건축 모드 토글 (옛 즉시 wall build 폐기)
      buildMode = !buildMode;
      if (!buildMode) { placementMode = null; }
      showNotice(buildMode ? '🏗️ 건축 모드 ON (인벤에서 건축물 클릭)' : '건축 모드 OFF');
      if (invOpen) renderInvPanel(document.getElementById('invBody')); // 재렌더 (강조 갱신)
    }
    else if (k === 'h') sendPrimary({ type: 'build', buildType: 'chest', floor: myBuildFloor });
    else if (k === 'j') sendPrimary({ type: 'build', buildType: 'campfire', floor: myBuildFloor });
    // Q 단축키 제거 — 공성캠프는 임시 사유지로 대체 예정 (Phase 14.18)
    else if (k === 'l') sendPrimary({ type: 'build', buildType: 'fence', floor: myBuildFloor });
    // I 키는 새 인벤 패널 (좀보이드식). 바닥은 건축 패널에서 클릭으로.
    else if (k === 'p') sendPrimary({ type: 'build', buildType: 'farmland', floor: myBuildFloor });
    else if (k === 'o') sendPrimary({ type: 'harvest' });
    else if (k === 'g') sendPrimary({ type: 'feed' });
    else if (k === 'n') toggleTribePanel();
    else if (k === 'v') sendPrimary({ type: 'pvp_set', enabled: !myPvpEnabled });
    else if (k === 'z') { myBuildFloor = Math.min(5, myBuildFloor + 1); showNotice(`건축 층: ${myBuildFloor}F`); updateHud(); }
    else if (k === 'x') { myBuildFloor = Math.max(0, myBuildFloor - 1); showNotice(`건축 층: ${myBuildFloor}F`); updateHud(); }
    // 14.49-e7b: ,/. 키 제거 (자동 계단 도입 후 불필요)
    else if (k === 'u') {
      // 14.49-d: 빌드 시 player facing(myFacingVx/Vy)으로 stair dir 결정
      let bdir = 'N';
      const fx = myFacingVx || 0, fy = myFacingVy || 0;
      if (Math.abs(fx) > Math.abs(fy)) bdir = fx > 0 ? 'E' : 'W';
      else if (fy !== 0) bdir = fy > 0 ? 'S' : 'N';
      sendPrimary({ type: 'build', buildType: 'stair', floor: myBuildFloor, dir: bdir });
    }
    else if (k === 'm') { if (window.bigMap) window.bigMap.toggle(); }  // Phase 5-2-mini: M = 지도 (시장은 사이드바 클릭)
    else if (k === 'k') toggleCraft();
    else if (k === 'r' && e.shiftKey) sendPrimary({ type: 'repair_building' }); // Phase 14.34 수리
    else if (k === 'r') {
      // Phase 14.41: R = 우선 근처 다운 길드원 구조 시도, 없으면 요리 패널
      const target = findNearestDownedGuildmate();
      if (target) sendPrimary({ type: 'rescue_request', pid: target.pid });
      else toggleCookPanel();
    }
    else if (k === '1') sendPrimary({ type: 'equip', tool: 'axe' });
    else if (k === '2') sendPrimary({ type: 'equip', tool: 'pickaxe' });
    else if (k === '3') sendPrimary({ type: 'equip', tool: 'sword' });
    else if (k === '0') sendPrimary({ type: 'equip', tool: null });
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && mySprint) { mySprint = false; updateHud(); }
    const k = normalizeKey(e);
    keys.delete(k);
    if (k === 'e' && window.__eRepeat) { clearInterval(window.__eRepeat); window.__eRepeat = null; }   // ★채굴 반복 정지
    // 정지도 루프 고정 스텝이 ≤33ms 내 전송 (즉시-send 제거 — 스텝/accumulator 불규칙 건드림이 버벅 원인이었음).
  });
  // blur 이벤트로 keys 초기화 안 함 — 콘솔 열기/탭 전환 등 사소한 이유로 키가 reset돼서
  // 사용자가 "막힌 느낌" 받는 원인. 진짜 화면 떠나면 어차피 keyup 자연스럽게 일어남.
  // window.addEventListener('blur', () => { keys.clear(); });

  function openChat() {
    chatActive = true;
    keys.clear();
    const input = document.getElementById('chatInput');
    input.classList.add('active');
    input.focus();
    input.value = '';
  }
  function closeChat(send = false) {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    chatActive = false;
    input.classList.remove('active');
    input.blur();
    input.value = '';
    if (send && text) {
      sendPrimary({ type: 'chat', text });
    }
  }
  function setupChat() {
    const input = document.getElementById('chatInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeChat(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeChat(false);
      }
    });
  }

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.action;
      if (a === 'gather') sendPrimary({ type: 'gather' });
      else if (a === 'claim') sendPrimary({ type: 'claim' });
      else if (a === 'trade_wood') sendPrimary({ type: 'trade_offer', give: 'wood' });
      else if (a === 'trade_stone') sendPrimary({ type: 'trade_offer', give: 'stone' });
      else if (a === 'attack') sendPrimary({ type: 'attack' });
      else if (a === 'build_wall') sendPrimary({ type: 'build', buildType: 'wall', floor: myBuildFloor });
      else if (a === 'build_chest') sendPrimary({ type: 'build', buildType: 'chest', floor: myBuildFloor });
      else if (a === 'build_campfire') sendPrimary({ type: 'build', buildType: 'campfire', floor: myBuildFloor });
      // build_siege 제거 — 임시 사유지로 대체 (14.18)
      else if (a === 'build_fence') sendPrimary({ type: 'build', buildType: 'fence', floor: myBuildFloor });
      else if (a === 'build_door') sendPrimary({ type: 'build', buildType: 'door', floor: myBuildFloor });
      else if (a === 'build_farmland') sendPrimary({ type: 'build', buildType: 'farmland', floor: myBuildFloor });
      else if (a === 'build_stair') sendPrimary({ type: 'build', buildType: 'stair', floor: myBuildFloor });
      else if (a === 'build_floor') sendPrimary({ type: 'build', buildType: 'floor', floor: myBuildFloor });
      else if (a === 'hut_start') { buildMode = true; placementMode = { special: 'hut_site' }; showNotice('⛏️ 움집터 배치 모드 — 클릭 위치에 6×4 수혈 굴착 (곡괭이 필요 · B=취소)'); }   // ★움집 고증 건축(좀보이드 커서 배치)
      else if (a === 'furnace_start') {   // ★노 건설(재민 확정 — 움집 동형). kind=도가니로/괴련로(시대가 정한다)
        const kind = btn.dataset.kind || 'crucible';
        buildMode = true; placementMode = { special: 'furnace_site', kind };
        showNotice(`🔥 ${kind === 'bloomery' ? '괴련로' : '노(爐)'} 터 배치 — 내 사유지/길드 사유지 안 2×2 (B=취소)`);
      }
      else if (a === 'kiln_start') { buildMode = true; placementMode = { special: 'kiln_site' }; showNotice('🪵 숯가마 터 배치 — 내 사유지/길드 사유지 안 2×2 (돌 4·곡괭이 · B=취소)'); }   // ★숯가마(노와 같은 계약)
      // ★★[2026-08-03e 배치 12 ①] 마을 회관 — 노·숯가마와 **완전히 같은 배치 계약**(2×2·사유지·단계).
      //   다른 건 완공이 곧 마을 등록이라는 것뿐이다. 자리 가능 여부는 서버가 착공 전에 판정한다.
      else if (a === 'village_start') { buildMode = true; placementMode = { special: 'village_site' }; showNotice('🏘️ 마을 회관 터 배치 — 내 사유지/길드 사유지 안 2×2 (터 다지기 → 환호 → 굴립주 · B=취소)'); }
      // ★[11차 T4] 마을 크루에게 집 의뢰 — placementMode.special 재사용(발명 0). 검증·재료·배치는 서버 권위.
      else if (a === 'psite_request') { buildMode = true; placementMode = { special: 'psite' }; showNotice('🏠 집 의뢰 모드 — 마을 영토 안을 클릭 (기둥6·서까래8·이엉8 선납 · B=취소)'); }
      else if (a === 'harvest') sendPrimary({ type: 'harvest' });
      else if (a === 'feed') sendPrimary({ type: 'feed' });
      else if (a === 'tribe') toggleTribePanel();
      else if (a === 'pvp_toggle') sendPrimary({ type: 'pvp_set', enabled: !myPvpEnabled });
      else if (a === 'cook') toggleCookPanel();
      else if (a === 'market') toggleMarketplace();
    };
  });

  function sendPrimary(obj) {
    const c = conns.get(primaryZoneId);
    if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
  }
  // ★★[11차 T4에서 드러난 좌표계 결함] 커서 배치 좌표(atX/atY)는 **존 로컬**로 보내야 한다.
  //   서버의 player.x는 존 로컬인데(클라가 welcome에서 worldOffsetX를 더해 절대로 만든다),
  //   지금까지 클라는 화면 역투영한 **절대** 좌표를 그대로 실어 보냈다. worldOffset이 0인 존(canadia)에선
  //   두 값이 같아 아무 문제가 없었지만, 한반도(offset 409,984px)에선 거리 검사가 **항상** 실패한다
  //   ("너무 멀어서 …") — 움집터·길드 곳간·아이템 배치가 전부 같은 결함을 공유했다.
  //   여기서 한 번에 로컬로 접어 보낸다(서버 계약은 그대로, 클라가 프레임을 맞춘다).
  function absToLocalAt(obj) {
    const c = conns.get(primaryZoneId);
    const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
    if (typeof obj.atX === 'number') obj.atX -= ox;
    if (typeof obj.atY === 'number') obj.atY -= oy;
    return obj;
  }
  function sendPrimaryAt(obj) { return sendPrimary(absToLocalAt(obj)); }
  // 미니맵 등 외부에서 호출 가능하게 노출
  window.__sendPrimary = sendPrimary;
  window.__sendPrimaryAt = sendPrimaryAt;
  window.__getInv = () => ({ ...inventory });   // ★진단 훅(읽기 전용) — 재료 선납 차감 실측용
  window.__getPrimaryZoneId = () => primaryZoneId;
  // ★[2026-08-03f 배치 13] 진단 훅 — **내 영속 신원**(등록 계정이면 username, 게스트면 anon_<고정>).
  //   토큰은 **노출하지 않는다** — 하네스도 localStorage 에서 직접 읽는다(코드가 값을 흘리지 않게).
  window.__getPlayerId = () => myPlayerId;

  // === 부트 ===
  async function boot() {
    const res = await fetch('/zones');
    const data = await res.json();
    zonesMeta = data.zones;
    marketplaceUrl = data.marketplaceUrl || '';
    // Phase 14.46-b-mini: 모든 zone water tiles 사전 계산 (~수만 tiles, ~100ms)
    try { precomputeAllWaterTiles(); } catch (e) { console.warn('water tile compute fail:', e); }

    // 2D 그리드 월드 크기 계산
    worldWidth = 0;
    worldHeight = 0;
    for (const z of Object.values(zonesMeta)) {
      worldWidth = Math.max(worldWidth, z.worldOffsetX + (z.zoneWidth || 100000));
      worldHeight = Math.max(worldHeight, (z.worldOffsetY || 0) + (z.zoneHeight || 100000));
    }

    // localStorage에서 이전 프로필 복원 (패스워드는 저장 안 함 — 매번 입력)
    const savedName = localStorage.getItem('durango_username');
    if (savedName) document.getElementById('name').value = savedName;
    const savedColor = localStorage.getItem('durango_color');
    myColor = savedColor && COLORS.includes(savedColor) ? savedColor : COLORS[0];
    // ★[배치 13] 게스트 영속 신원 토큰 복원 — 이게 있으면 서버가 **같은 사람**으로 맞아 준다.
    //   화면에 표시하지 않는다(입력칸도 없다). 브라우저를 청소하면 새 사람이 되는 것이 정상이다.
    try { myGuestToken = localStorage.getItem(GUEST_TOKEN_KEY) || ''; } catch (e) { myGuestToken = ''; }

    // 색상 팔레트 UI
    const picker = document.getElementById('colorPicker');
    for (const c of COLORS) {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (c === myColor ? ' selected' : '');
      sw.style.background = c;
      sw.dataset.color = c;
      sw.onclick = () => {
        myColor = c;
        for (const el of picker.children) el.classList.toggle('selected', el.dataset.color === c);
      };
      picker.appendChild(sw);
    }

    const sel = document.getElementById('startZone');
    // ★[로비 죽은 존 UX] central의 /zones는 각 존 /health 폴링 결과를 population/cap으로 실어 준다 —
    //   응답 못 받은 존은 population=null·cap=null. 이게 곧 생존 신호다(브라우저에서 존 /health를 직접
    //   부를 수는 없다 — 존 HTTP는 /lifedbg 외 CORS 미개방).
    //   종전엔 이 신호를 안 써서 죽은 존이 그대로 목록에 남았고, data.defaultZone이 응답에 아예 없어
    //   selected가 하나도 안 붙어 **첫 옵션(canadia=죽은 존)이 기본 선택**됐다.
    //   → 첫 입장이 조용히 실패(primary ws가 CLOSED, welcome 0건)하고 "서버가 죽었다"고 오진하게 된다.
    const zoneAlive = (z) => z && z.population !== null && z.population !== undefined && !!z.cap;
    function refreshZoneOptions() {
      const prev = sel.value;
      sel.innerHTML = '';
      let liveN = 0, firstLive = null;
      for (const [id, z] of Object.entries(zonesMeta)) {
        const opt = document.createElement('option');
        opt.value = id;
        const alive = zoneAlive(z);
        const popPart = alive ? ` · ${z.population}/${z.cap}명${z.full ? ' (가득참)' : ''}` : '';
        opt.textContent = `${z.displayName} (RTT ≈ ${(z.simulatedLatencyMs || 0) * 2}ms)${popPart}${alive ? '' : ' — 점검 중'}`;
        if (!alive) { opt.disabled = true; opt.style.color = '#6c7686'; }   // 죽은 존 = 흐리게 + 선택 불가
        else { liveN++; if (!firstLive) firstLive = id; }
        if (z.full) opt.disabled = true;
        sel.appendChild(opt);
      }
      // 기본 선택 = ①직전 선택(살아있으면) ②central 기본존(살아있으면) ③hanbando ④첫 생존 존
      const want = [prev, data.defaultZone, 'hanbando', firstLive]
        .find(id => id && zonesMeta[id] && zoneAlive(zonesMeta[id]) && !zonesMeta[id].full);
      if (want) sel.value = want;
      // 전멸 시 안내(빈 화면 금지)
      let warn = document.getElementById('zoneDeadWarn');
      if (!liveN) {
        if (!warn) {
          warn = document.createElement('div');
          warn.id = 'zoneDeadWarn';
          warn.style.cssText = 'margin-top:8px;padding:8px 10px;border-radius:6px;background:#3a2418;border:1px solid #8a5a2a;color:#f0c674;font-size:13px;line-height:1.5';
          warn.textContent = '⚠️ 현재 접속 가능한 지역이 없습니다. 서버 점검 중일 수 있어요 — 잠시 후 자동으로 다시 확인합니다.';
          (document.getElementById('zoneRow') || sel.parentNode).appendChild(warn);
        }
        warn.style.display = 'block';
        if (enterBtn) { enterBtn.disabled = true; }
      } else {
        if (warn) warn.style.display = 'none';
        if (enterBtn) enterBtn.disabled = false;
      }
      return liveN;
    }
    const enterBtn = document.getElementById('enter');
    refreshZoneOptions();
    // 짧은 폴링(15초) — 존이 살아나면 자동으로 선택 가능해진다. 실패는 조용히 무시(로비가 깨지면 안 됨).
    setInterval(async () => {
      try {
        const r = await fetch('/zones', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!j || !j.zones) return;
        for (const [id, z] of Object.entries(j.zones)) {
          if (zonesMeta[id]) { zonesMeta[id].population = z.population; zonesMeta[id].cap = z.cap; zonesMeta[id].full = z.full; }
          else zonesMeta[id] = z;
        }
        if (!document.getElementById('lobby').classList.contains('hidden')) refreshZoneOptions();
      } catch (e) { /* 조용히 무시 */ }
    }, 15000);

    // 14.42-a: 이름 입력 시 기존 계정 여부 확인 → zone picker 토글
    //   - 게스트(이름+비번 없음): picker 노출 — 지역 직접 선택
    //   - 신규 가입(이름+비번 있음, DB에 없음): picker 노출 — 영구 home 됨
    //   - 기존 로그인(이름+비번 있음, DB에 있음): picker 숨김 + last_zone 자동 사용
    const nameInput = document.getElementById('name');
    const pwInput = document.getElementById('password');
    const zoneRow = document.getElementById('zoneRow');
    const existingHint = document.getElementById('existingLoginHint');
    let checkTimer = null;
    let lastCheckedName = null;
    // 기존 계정의 자동 라우팅용 — 마지막에 fetch한 player.last_zone (or home_zone)
    window.__autoZone = null;
    async function refreshLobbyMode() {
      const u = nameInput.value.trim();
      const p = pwInput.value;
      if (!u || !p) {
        zoneRow.classList.remove('hidden');
        existingHint.classList.add('hidden');
        window.__autoZone = null;
        return;
      }
      if (u === lastCheckedName) return; // debounce
      lastCheckedName = u;
      try {
        const r = await fetch('/check_username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u }) });
        const d = await r.json();
        if (d.taken) {
          zoneRow.classList.add('hidden');
          existingHint.classList.remove('hidden');
          // 기존 계정 — last_zone/home_zone 가져와서 자동 라우팅
          try {
            const r2 = await fetch('/player/' + encodeURIComponent(u));
            if (r2.ok) {
              const pd = await r2.json();
              const dest = (pd.player?.last_zone) || (pd.player?.home_zone);
              if (dest && zonesMeta[dest]) {
                window.__autoZone = dest;
                existingHint.innerHTML = `🔑 기존 계정 — <b>${zonesMeta[dest].displayName}</b>의 마지막 위치에서 시작합니다`;
              }
            }
          } catch (e) {}
        } else {
          zoneRow.classList.remove('hidden');
          existingHint.classList.add('hidden');
          window.__autoZone = null;
        }
      } catch (e) {
        zoneRow.classList.remove('hidden');
        existingHint.classList.add('hidden');
        window.__autoZone = null;
      }
    }
    function debouncedCheck() {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(refreshLobbyMode, 250);
    }
    nameInput.addEventListener('input', debouncedCheck);
    pwInput.addEventListener('input', debouncedCheck);

    // 로비에서 10초마다 zone 인구 갱신
    const zoneRefreshTimer = setInterval(async () => {
      if (document.getElementById('lobby').classList.contains('hidden')) {
        clearInterval(zoneRefreshTimer);
        return;
      }
      try {
        const r = await fetch('/zones');
        const d = await r.json();
        zonesMeta = d.zones;
        refreshZoneOptions();
      } catch (e) {}
    }, 10000);

    document.getElementById('enter').onclick = () => {
      const inputName = document.getElementById('name').value.trim();
      const inputPw = document.getElementById('password').value;
      myName = inputName || '여행자';
      myUsername = inputName; // 빈 문자열이면 게스트
      myPassword = inputPw;
      if (inputName) localStorage.setItem('durango_username', inputName);
      localStorage.setItem('durango_color', myColor);
      document.getElementById('authError').classList.add('hidden');
      // 재진입 시 모든 클라 상태 초기화
      kicked = false;
      initialWelcomeReceived = false;
      chatActive = false;
      keys.clear();
      // 채팅 입력창 비활성화 상태로
      const chatInput = document.getElementById('chatInput');
      if (chatInput) { chatInput.classList.remove('active'); chatInput.blur(); chatInput.value = ''; }
      // 14.42-a: 기존 계정이면 last_zone/home_zone으로 자동 라우팅 (zone picker 무시)
      const startZone = window.__autoZone || sel.value;
      document.getElementById('lobby').classList.add('hidden');
      document.getElementById('game').classList.remove('hidden');
      connect(startZone, 'primary', null);
      // setupChat과 loop는 한 번만
      if (!chatSetup) { setupChat(); chatSetup = true; }
      if (!loopStarted) { loopStarted = true; loop(); }
    };

    // RTT 측정 — 1초마다 primary에 ping
    // 14.43: pong watchdog — 5초 이상 pong 못 받으면 ws 좀비로 간주, 강제 close → 자동 재연결
    setInterval(() => {
      const c = conns.get(primaryZoneId);
      if (!c || c.ws.readyState !== 1) return;
      const now = performance.now();
      // 초기엔 lastPongAt 없으니까 첫 ping부터 기록 시작
      if (!c.lastPongAt && c.firstPingAt && now - c.firstPingAt > 15000) {
        console.warn('[recover] ping 후 15초간 pong 한 번도 못 받음 — ws 좀비, 강제 close');
        try { c.ws.close(); } catch (e) {}
        return;
      }
      if (c.lastPongAt && now - c.lastPongAt > 7000) {
        console.warn(`[recover] pong 마지막 ${((now - c.lastPongAt)/1000).toFixed(1)}초 전 — ws 좀비, 강제 close`);
        try { c.ws.close(); } catch (e) {}
        return;
      }
      if (!c.firstPingAt) c.firstPingAt = now;
      c.ws.send(JSON.stringify({ type: 'ping', t: now }));
    }, 1000);

    // 14.43: 탭이 다시 보이면 — 백그라운드 동안 RAF 멈춰서 watchdog/checkOrphan 안 돌았을 수 있음.
    // 마지막 tick 5초 넘으면 primary 좀비로 간주, 강제 끊고 즉시 재연결 트리거.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      const stale = !lastTickAt || (now - lastTickAt > 5000);
      console.log(`[recover] visibilitychange visible — lastTick ${lastTickAt ? Math.round(now - lastTickAt) + 'ms 전' : '없음'} stale=${stale}`);
      if (stale && primaryZoneId) {
        const c = conns.get(primaryZoneId);
        if (c) { try { c.ws.close(); } catch (e) {} }
        // observer ws들도 같이 정리 (얘들도 보통 같이 죽어있음)
        for (const [zid, conn] of conns) {
          if (zid !== primaryZoneId) { try { conn.ws.close(); } catch (e) {} }
        }
        // 재트리거 방지 — 다음 welcome이 lastTickAt 갱신할 때까지 stale 판정 안 나게
        lastTickAt = now;
      }
    });

    // observer viewport 업데이트 — 1초마다 자기 abs position을 각 observer zone-local로 변환
    setInterval(() => {
      for (const [zid, c] of conns) {
        if (c.role !== 'observer' || c.ws.readyState !== 1) continue;
        const zm = zonesMeta[zid];
        if (!zm) continue;
        const zW = zm.zoneWidth || 100000, zH = zm.zoneHeight || 100000;
        const localX = Math.max(0, Math.min(zW, myAbsPredicted.x - zm.worldOffsetX));
        const localY = Math.max(0, Math.min(zH, myAbsPredicted.y - (zm.worldOffsetY||0)));
        c.ws.send(JSON.stringify({ type: 'viewport_update', x: localX, y: localY }));
      }
    }, 1000);

    refreshHealth();
    healthInterval = setInterval(refreshHealth, 3000);

    // Phase 14.30 + 14.51: 캔버스 mousemove → placement cursor + hover building
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      lastMouseSx = px; lastMouseSy = py;
      const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
      // 14.53-g fix: 2층 이상 player일 때, 마우스 py에 floor*FLOOR_HEIGHT 더해 그 층의 plane으로 투영
      const ix = px - W/2 + myIso.x;
      const iy = (py + (myFloor || 0) * FLOOR_HEIGHT) - H/2 + myIso.y;
      const wx = ix * 0.5 + iy;
      const wy = iy - ix * 0.5;
      window._lastMouseWx = wx; window._lastMouseWy = wy; // Phase 5-I: 원거리 조준용 (절대 월드)
      if (placementMode) {
        placementCursor.wx = wx;
        placementCursor.wy = wy;
      }
      // 14.51 + 14.53-e + 14.53-g/i: hover list. wall/door는 양쪽 cell 모두에서 후보 (edge 공유).
      if (buildMode && !placementMode) {
        const candidates = [];
        const mouseCx = Math.floor(wx / 32);
        const mouseCy = Math.floor(wy / 32);
        for (const c of conns.values()) {
          const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
          for (const b of c.buildings.values()) {
            if ((b.floor || 0) !== myFloor) continue;
            const isEdge = (b.type === 'wall' || b.type === 'door');
            const bAbsX = ox + b.x, bAbsY = oy + b.y;
            const bCx = Math.floor(bAbsX / 32);
            const bCy = Math.floor(bAbsY / 32);
            let match = false;
            if (isEdge) {
              // wall 저장: N → cell (bCx, bCy)의 윗 edge = cell (bCx, bCy-1)의 아래 edge
              // E → cell (bCx, bCy)의 우측 edge = cell (bCx+1, bCy)의 좌측 edge
              const side = b.data?.side || 'N';
              if (side === 'N') {
                match = (mouseCx === bCx) && (mouseCy === bCy || mouseCy === bCy - 1);
              } else if (side === 'E') {
                match = (mouseCy === bCy) && (mouseCx === bCx || mouseCx === bCx + 1);
              }
            } else {
              match = (bCx === mouseCx && bCy === mouseCy);
            }
            if (!match) continue;
            const ax = bAbsX + (isEdge ? 16 : 0);
            const ay = bAbsY + (isEdge ? 16 : 0);
            const d = Math.hypot(ax - wx, ay - wy);
            candidates.push({ id: b.id, d });
          }
        }
        candidates.sort((a, b) => a.d - b.d);
        // 14.54-b: auto floor hover → 부모 stair로 redirect (둘이 같은 그룹)
        const redirectMap = new Map();
        for (const c of candidates) {
          const bb = (function(){ for (const cc of conns.values()) { const x = cc.buildings.get(c.id); if (x) return x; } return null; })();
          if (bb && bb.type === 'floor' && bb.data?._parentStairId) {
            redirectMap.set(c.id, bb.data._parentStairId);
          }
        }
        let newList = candidates.map(c => redirectMap.get(c.id) || c.id);
        // 중복 제거 (같은 stair에 여러 cell이 같이 잡힐 수 있음)
        newList = newList.filter((id, i) => newList.indexOf(id) === i);
        // 옛 hoverBuildingId가 새 list 안에 있으면 index 유지, 아니면 0
        const oldId = hoverBuildingId;
        if (newList.length === 0) {
          hoverList = []; hoverIndex = 0; hoverBuildingId = null;
        } else if (newList.join() !== hoverList.join()) {
          hoverList = newList;
          const keep = oldId ? hoverList.indexOf(oldId) : -1;
          hoverIndex = (keep >= 0) ? keep : 0;
          hoverBuildingId = hoverList[hoverIndex];
        }
      } else {
        hoverList = []; hoverIndex = 0; hoverBuildingId = null;
      }
    });

    // 14.53-g/i: 건축 모드 마우스 휠 — placement 중이면 회전, hover 중이면 cycle
    canvas.addEventListener('wheel', (e) => {
      if (!buildMode) return;
      const delta = (e.deltaY > 0) ? 1 : -1;
      // placement 중 → 회전 (wall/door = N→E→S→W, fence = NS↔EW, stair = N→E→S→W)
      if (placementMode && placementMode.itemType) {
        e.preventDefault();
        const it = placementMode.itemType;
        if (it === 'item_wall' || it === 'item_door') {
          const seq = ['N', 'E', 'S', 'W'];
          const i = seq.indexOf(placementMode.dir || 'N');
          placementMode.dir = seq[(i + delta + 4) % 4];
        } else if (it === 'item_stair') {
          // 14.54-c2: 계단은 N(남→북) 또는 W(동→서) 2방향만
          placementMode.dir = (placementMode.dir === 'N') ? 'W' : 'N';
        } else if (it === 'item_fence') {
          placementMode.dir = (placementMode.dir === 'EW') ? 'NS' : 'EW';
        }
        return;
      }
      // hover cycle
      if (hoverList.length > 1) {
        e.preventDefault();
        hoverIndex = ((hoverIndex + delta) % hoverList.length + hoverList.length) % hoverList.length;
        hoverBuildingId = hoverList[hoverIndex];
      }
    }, { passive: false });
    // 14.51: 우클릭 = placement 회전 (wall/door = N/E, fence = NS/EW, stair = N/E/S/W). 기본 우클릭 메뉴 차단.
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!placementMode || !placementMode.itemType) return;
      const it = placementMode.itemType;
      if (it === 'item_wall' || it === 'item_door') {
        placementMode.dir = (placementMode.dir === 'N') ? 'E' : 'N';
      } else if (it === 'item_fence') {
        placementMode.dir = (placementMode.dir === 'EW') ? 'NS' : 'EW';
      } else if (it === 'item_stair') {
        const seq = ['N', 'E', 'S', 'W'];
        const i = seq.indexOf(placementMode.dir || 'N');
        placementMode.dir = seq[(i + 1) % 4];
      }
      showNotice(`회전: ${placementMode.dir}`);
    });
    // Phase 14.22: 캔버스 클릭 → screen → world 좌표 변환 → chest bbox hit-test
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      // 캔버스 안 픽셀 좌표 (canvas.width/height와 css width/height 다를 수 있으니 스케일)
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      // toScreen 역: ix = px - W/2 + camX; iy = py - H/2 + camY
      // 14.53-g fix: 2층+ player일 때 py에 floor*FLOOR_HEIGHT 더해 그 층 plane으로 투영
      const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const ix = px - W/2 + myIso.x;
      const iy = (py + (myFloor || 0) * FLOOR_HEIGHT) - H/2 + myIso.y;
      // iso 역변환: wx = ix/2 + iy, wy = iy - ix/2
      const clickWx = ix * 0.5 + iy;
      const clickWy = iy - ix * 0.5;
      // Phase 14.30 / 14.51: placement mode 우선 — 그 위치에 3초 progress → 빌드
      if (placementMode) {
        // 사용자 위치에서 거리 체크 (160px)
        const distMe = Math.hypot(clickWx - myAbsPredicted.x, clickWy - myAbsPredicted.y);
        if (distMe > 160) { showNotice('너무 멀어서 거기에 못 지음 (160px)'); return; }
        if (placementMode.special) {
          // ★움집터·길드 곳간 — 커서 셀 기준 다중 셀 배치(검증·재료·배치는 서버 권위)
          const _sp = placementMode.special;
          const _mt = _sp === 'hut_site' ? 'hut_start' : (_sp === 'furnace_site' ? 'furnace_start'
                    : (_sp === 'kiln_site' ? 'kiln_start' : (_sp === 'village_site' ? 'village_start'   // ★[배치 12] 마을 회관 착공
                    : (_sp === 'psite' ? 'request_village_house' : 'build_guild_granary'))));
          sendPrimaryAt({ type: _mt, atX: clickWx, atY: clickWy, kind: placementMode.kind || undefined });
          if (!e.shiftKey) { placementMode = null; showNotice('배치 요청'); }
          return;
        }
        if (placementMode.itemType) {
          // 14.54-d: blocked면 클릭 무시 + 알림
          const _cx = Math.floor(clickWx / 32), _cy = Math.floor(clickWy / 32);
          if (isPlacementBlocked(placementMode.itemType, _cx, _cy, placementMode.dir || 'N')) {
            showNotice('여기엔 못 지음 (겹침 또는 다른 사람 사유지)'); return;
          }
          // 14.51: 3초 progress 시작 → 완료 시 server 송신 + 인벤 차감 (server 측에서)
          startBuildAction('place', {
            itemType: placementMode.itemType,
            floor: placementMode.floor || 0,
            dir: placementMode.dir || 'N',
            atX: clickWx, atY: clickWy,
          });
        } else {
          // 옛 호환 (즉시)
          sendPrimaryAt({ type: 'build', buildType: placementMode.type, floor: placementMode.floor, atX: clickWx, atY: clickWy });
          if (!e.shiftKey) { placementMode = null; showNotice('배치 모드 종료'); }
        }
        return;
      }
      // 14.51 + 14.53-e: 건축 모드 + hover building → 3초 progress 분해
      if (buildMode && hoverBuildingId && !buildAction) {
        let target = null, ox = 0, oy = 0;
        for (const c of conns.values()) {
          const b = c.buildings.get(hoverBuildingId);
          if (b) { target = b; ox = c.meta?.worldOffsetX||0; oy = c.meta?.worldOffsetY||0; break; }
        }
        if (target) {
          const isEdge = (target.type === 'wall' || target.type === 'door');
          const tx = ox + target.x + (isEdge ? 16 : 0);
          const ty = oy + target.y + (isEdge ? 16 : 0);
          const d = Math.hypot(tx - myAbsPredicted.x, ty - myAbsPredicted.y);
          if (d > 160) { showNotice('너무 멀어서 분해 못함 (160px)'); return; }
          startBuildAction('dismantle', { buildingId: hoverBuildingId });
          return;
        }
      }
      // 1) ground item hit-test 우선 (작은 거 위에 클릭)
      let hitGi = null;
      for (const c of conns.values()) {
        if (!c.meta || !c.groundItems) continue;
        const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
        for (const gi of c.groundItems.values()) {
          const absX = ox + gi.x, absY = oy + gi.y;
          if (Math.abs(absX - clickWx) <= 14 && Math.abs(absY - clickWy) <= 14) {
            hitGi = gi; break;
          }
        }
        if (hitGi) break;
      }
      if (hitGi) {
        const c = conns.get(primaryZoneId);
        const ox = c?.meta?.worldOffsetX || 0, oy = c?.meta?.worldOffsetY || 0;
        const distToMe = Math.hypot((ox + hitGi.x) - myAbsPredicted.x, (oy + hitGi.y) - myAbsPredicted.y);
        if (distToMe > 100) { showNotice('너무 멀리 있어 손이 안 닿습니다'); return; }
        sendPrimary({ type: 'pickup_item', giId: hitGi.id });
        return;
      }
      // 1.5) 움집터 클릭 → 다음 단계 시공 시도
      {
        let hitSite = null;
        for (const c of conns.values()) {
          if (!c.meta) continue;
          const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
          for (const b of c.buildings.values()) {
            if (b.type !== 'hut_site' && b.type !== 'furnace_site' && b.type !== 'furnace'
                && b.type !== 'kiln_site' && b.type !== 'charcoal_kiln'
                && b.type !== 'village_site' && b.type !== 'village_hall') continue;   // ★[배치 12] 회관: 터=시공 · 완공=재고
            const absX = ox + b.x, absY = oy + b.y;
            const rx = b.type === 'hut_site' ? 48 : 34, ry = b.type === 'hut_site' ? 40 : 34;   // 노·숯가마는 2×2
            if (Math.abs(absX - clickWx) <= rx && Math.abs(absY - clickWy) <= ry) { hitSite = b; break; }
          }
          if (hitSite) break;
        }
        if (hitSite) {
          if (hitSite.type === 'furnace') sendPrimary({ type: 'furnace_smelt', buildingId: hitSite.id });   // ★완공 노 클릭 = 조업
          else if (hitSite.type === 'furnace_site') sendPrimary({ type: 'furnace_advance', buildingId: hitSite.id });
          else if (hitSite.type === 'charcoal_kiln') sendPrimary({ type: 'kiln_burn', buildingId: hitSite.id });   // ★숯가마 클릭 = 조업
          else if (hitSite.type === 'kiln_site') sendPrimary({ type: 'kiln_advance', buildingId: hitSite.id });
          else if (hitSite.type === 'village_site') sendPrimary({ type: 'village_advance', buildingId: hitSite.id });   // ★[배치 12] 회관 시공
          else if (hitSite.type === 'village_hall') { _pviHallId = hitSite.id; sendPrimary({ type: 'village_inventory', buildingId: hitSite.id }); } // ★[배치 12 ③] 완공 회관 클릭 = 마을 재고(권한은 서버가 본다)
          else sendPrimary({ type: 'hut_advance', buildingId: hitSite.id });
          return;
        }
      }
      // 2) chest bbox hit-test (chest는 32×32 cell, b.x/b.y가 cell 중심)
      let hitChest = null;
      for (const c of conns.values()) {
        if (!c.meta) continue;
        const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
        for (const b of c.buildings.values()) {
          if (b.type !== 'chest' && b.type !== 'guild_granary') continue;   // ★길드 곳간 클릭=컨테이너 열기
          const absX = ox + b.x, absY = oy + b.y;
          if (Math.abs(absX - clickWx) <= 20 && Math.abs(absY - clickWy) <= 20) {
            hitChest = b; break;
          }
        }
        if (hitChest) break;
      }
      if (hitChest) {
        const c = conns.get(primaryZoneId);
        const ox = c?.meta?.worldOffsetX || 0, oy = c?.meta?.worldOffsetY || 0;
        const distToMe = Math.hypot((ox + hitChest.x) - myAbsPredicted.x, (oy + hitChest.y) - myAbsPredicted.y);
        if (distToMe > 160) { showNotice('너무 멀리 있어 손이 안 닿습니다'); return; }
        // Phase 4d-1: 거래소 chest는 마을 거래소 modal로
        if (hitChest.data?.isExchange && hitChest.data?.village && typeof window.openVillageMarket === 'function') {
          window.openVillageMarket(hitChest.data.village);
        } else if (typeof openInvWithContainer === 'function') {
          openInvWithContainer(hitChest.id);
        }
      }
    });

    // 거래소·상자 패널 이벤트
    document.getElementById('marketBuyBtn')?.addEventListener('click', () => placeOrder('buy'));
    document.getElementById('marketSellBtn')?.addEventListener('click', () => placeOrder('sell'));
    document.getElementById('marketCloseBtn')?.addEventListener('click', toggleMarketplace);
    document.getElementById('craftCloseBtn')?.addEventListener('click', toggleCraft);
    document.getElementById('cookCloseBtn')?.addEventListener('click', toggleCookPanel);
    document.getElementById('tribeCloseBtn')?.addEventListener('click', toggleTribePanel);
    document.getElementById('chestCloseBtn')?.addEventListener('click', closeChest);
    document.getElementById('chestPutWood')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_put', buildingId: openChestId, item: 'wood', amount: 1}); });
    document.getElementById('chestPutStone')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_put', buildingId: openChestId, item: 'stone', amount: 1}); });
    document.getElementById('chestTakeWood')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_take', buildingId: openChestId, item: 'wood', amount: 1}); });
    document.getElementById('chestTakeStone')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_take', buildingId: openChestId, item: 'stone', amount: 1}); });
  }

  // 14.46-b-smooth-fix: health 폴링 실패 시 자동 중단 (TLS/HTTPS 강제 환경에서 콘솔 도배 방지)
  let healthFailCount = 0;
  let healthInterval = null;
  async function refreshHealth() {
    try {
      const r = await fetch('/health');
      const h = await r.json();
      healthFailCount = 0;
      const lines = Object.entries(h).map(([id, s]) =>
        `${id}: ${s.up ? '🟢 ' + (s.players ?? 0) + '명' : '🔴 down'}`);
      document.getElementById('health').innerText = lines.join('  ');
    } catch (e) {
      healthFailCount++;
      if (healthFailCount >= 3 && healthInterval) {
        clearInterval(healthInterval);
        healthInterval = null;
        console.warn('[health] fetch 3회 실패 → 폴링 중단 (HTTPS 강제 환경)');
        const el = document.getElementById('health');
        if (el) el.innerText = '(health 폴링 비활성)';
      }
    }
  }

  // === 연결 관리 ===
  function connect(zoneId, role, transfer) {
    const existing = conns.get(zoneId);
    if (existing) {
      // ★유령 클라 fix: 살아있는(CONNECTING/OPEN) 엔트리만 재사용. CLOSING/CLOSED 엔트리를 재사용하면
      //   새 ws가 영영 안 생겨 클라가 옛 예측 좌표에 고착된다(= 유령). 죽은 엔트리는 버리고 새로 연결.
      if (existing.ws.readyState <= 1) {
        if (existing.role !== role) existing.role = role;
        if (role === 'primary') primaryZoneId = zoneId;
        return;
      }
      try { existing.ws.close(); } catch (e) {}
      conns.delete(zoneId);
    }
    const meta = zonesMeta[zoneId];
    if (!meta) return;
    const params = new URLSearchParams();
    if (role === 'observer') {
      params.set('observer', '1');
      // observer는 자기 viewport(예측 좌표를 해당 zone-local로 변환) 전송
      const meta2 = zonesMeta[zoneId];
      if (meta2) {
        const zW2 = meta2.zoneWidth || 100000, zH2 = meta2.zoneHeight || 100000;
        params.set('vx', Math.max(0, Math.min(zW2, myAbsPredicted.x - meta2.worldOffsetX)));
        params.set('vy', Math.max(0, Math.min(zH2, myAbsPredicted.y - (meta2.worldOffsetY||0))));
      }
    } else if (transfer && transfer.token) {
      // 핸드오프는 인증 우회 — 토큰이 source 서버에서 발급한 신원 증명
      params.set('handoff_token', transfer.token);
    } else {
      // 신규 접속 — 인증 정보 전송
      if (myUsername) params.set('username', myUsername);
      if (myPassword) params.set('password', myPassword);
      // ★[배치 13→14] 게스트 영속 신원 토큰. **이름·비밀번호와 함께 보내도 된다** — 그게 곧
      //   **승계**(게스트로 지은 것을 그대로 들고 계정이 되기) 요청이기 때문이다(배치 14 ①).
      //   ⚠서버는 이 토큰만으로 남의 계정을 열지 않는다: 승계는 **비밀번호가 아직 없는 행**에만
      //     허용되고, 그 이름이 이미 남의 계정이면 거절된다. 옛 토큰이 남아 있는 채로 기존 계정에
      //     로그인하면 서버가 `not_promotable` 로 흘려보내 평소 로그인이 된다.
      if (myGuestToken) params.set('guest_token', myGuestToken);
      params.set('name', myName);
      params.set('color', myColor);
    }
    const url = `${meta.wsUrl}/?${params.toString()}`;
    const ws = new WebSocket(url);
    const c = {
      ws, role, zoneId,
      meta: null,
      resources: new Map(),
      claims: new Map(),
      buildings: new Map(),
      mobs: new Map(),
      groundItems: new Map(), // Phase 14.23 — 바닥 떨어진 아이템
      others: new Map(),
      corpses: new Map(),     // Phase 5-7 — 동물 사체
    };
    conns.set(zoneId, c);
    if (role === 'primary') primaryZoneId = zoneId;
    // ★유령 클라 fix: 자기 conn 객체(c)를 같이 넘김. 교체된 옛 소켓이 close 직전 흘리는 잔여 메시지가
    //   zoneId 재조회로 "새 연결"의 상태에 섞여 들어가던 경로 차단(myPid/좌표/엔티티 오염).
    ws.onmessage = (ev) => handleMessage(zoneId, JSON.parse(ev.data), c);
    ws.onclose = (ev) => {
      if (conns.get(zoneId) === c) conns.delete(zoneId);
      _lastCloseAt.set(zoneId, performance.now()); // cooldown 기록
      // Phase 5-G trace: close 이유 진단
      console.warn('[ws] close', zoneId, 'role=' + role, 'code=' + ev.code, 'reason=' + (ev.reason || '(empty)'), 'wasClean=' + ev.wasClean);
    };
    ws.onerror = (ev) => {
      console.warn('[ws] error', zoneId, 'role=' + role);
    };
  }

  // Phase 5-G: observer 연결 fail 시 cooldown — 매 frame retry storm 방지
  const _lastCloseAt = new Map(); // zoneId -> performance.now() at close
  const RECONNECT_COOLDOWN_MS = 5000;

  function closeConnection(zoneId) {
    const c = conns.get(zoneId);
    if (!c) return;
    try { c.ws.close(); } catch (e) {}
    conns.delete(zoneId);
    _lastCloseAt.set(zoneId, performance.now());
  }

  function handleMessage(zoneId, msg, srcConn) {
    const c = conns.get(zoneId);
    if (!c) return;
    // ★유령 클라 fix: 이미 교체된(superseded) 소켓의 메시지는 전부 폐기.
    //   재연결 레이스에서 옛 ws의 버퍼된 tick/kicked/welcome이 새 conn 상태를 덮어쓰던 것을 막는다.
    if (srcConn && srcConn !== c) return;

    if (msg.type === 'welcome') {
      // 끊김 측정: promote 보낸 뒤 welcome 도착까지 걸린 시간 + welcome 처리 시간
      const _wStart = performance.now();
      if (c._promoteSentAt) {
        console.log('[handoff] ⏱ promote→welcome gap =', (_wStart - c._promoteSentAt).toFixed(0), 'ms',
          '| entities res=' + (msg.resources?.length||0), 'bld=' + (msg.buildings?.length||0), 'mob=' + (msg.mobs?.length||0));
        c._promoteSentAt = 0;
      }
      c.meta = msg.zone;
      // ★★[2026-08-03f 배치 13] 영속 신원 수신.
      //   `playerId` — 소유 표시(사유지 목록 등)가 대조할 **정본**이다. 등록 계정이면 username 과
      //   같고, 게스트면 `anon_<고정 접미사>` 다. 종전엔 이 값이 없어서 게스트의 제 사유지가
      //   화면에서 남의 것으로 보였다.
      if (typeof msg.playerId === 'string' && msg.playerId) myPlayerId = msg.playerId;
      //   `guestToken` — 다음 접속에 제시할 열쇠. **저장만 하고 절대 표시하지 않는다.**
      //   (알림·채팅·콘솔 어디에도 찍지 않는다 — 토큰 유출 = 계정 탈취)
      if (typeof msg.guestToken === 'string' && msg.guestToken && msg.guestToken !== myGuestToken) {
        myGuestToken = msg.guestToken;
        try { localStorage.setItem(GUEST_TOKEN_KEY, myGuestToken); } catch (e) {}
      }
      //   ★[배치 14 ①] 승계됐다 — 그 토큰은 서버에서 **이미 죽었다**(guest_token = NULL).
      //   여기서도 지운다: 죽은 열쇠를 브라우저에 남겨 둘 이유가 없다(벨트와 멜빵).
      if (msg.promoted) {
        myGuestToken = '';
        try { localStorage.removeItem(GUEST_TOKEN_KEY); } catch (e) {}
      }
      // ★시대 게이트 — 건축 메뉴는 **이 세상에 알려진 노**만 보여준다(era.js 가 유일한 진실, 클라 표 없음).
      //   청동기엔 괴련로 버튼이 아예 없다: era.js 의 "지식 축은 순수 플레이어 지식" 원칙 — 있다는 것조차
      //   알려주지 않는다. 시대가 열리면 다음 접속 때 버튼이 생긴다.
      try {
        const _known = new Set(((msg.zone && msg.zone.era && msg.zone.era.furnaces) || []).map(f => f.k));
        document.querySelectorAll('[data-era-tech]').forEach(b => { b.style.display = _known.has(b.dataset.eraTech) ? '' : 'none'; });
      } catch (e) {}
      // Phase 5-G: 서버에서 받은 hardcoded terrain (한반도 새 강·호수) — 미니맵 표시용
      const _zid = c.zoneId || (msg.zone && (msg.zone.id || msg.zone.zoneId)) || c.id;
      if (msg.hardcodedTerrain && window.Terrain && window.Terrain.setHardcoded && _zid) {
        // Phase 5-K: terrain은 zone별 정적이고 시작 시 전체 선로딩됨.
        // 매 welcome(=매 핸드오프)마다 캐시를 비우면 경계 크로싱 때 fps가 뚝 떨어진다(강 거리 셀마다 재계산).
        // 이미 적용한 zone이면 재적용·캐시 클리어를 스킵 — 경계 크로싱 렉 제거.
        if (!_terrainAppliedZones.has(_zid)) {
          window.Terrain.setHardcoded(_zid, msg.hardcodedTerrain);
          _waterCellCache.clear(); // 최초 1회만 — 셀 단위 캐시 무효화
          _natChunk.clear();       // ★[배치 21] 자연물 청크 배치
          _shoreTiles.clear();
    _shoreTiles.clear();
          _groundTiles.clear();   // ★[배치 19] 지면 베이크도 함께
          _rockCellCache.clear();
          if (typeof window.__invalidateMinimapCache === 'function') window.__invalidateMinimapCache();
          _terrainAppliedZones.add(_zid);
          console.log('[terrain] hardcoded applied:', _zid, 'rivers=' + msg.hardcodedTerrain.rivers.length, 'lakes=' + msg.hardcodedTerrain.lakes.length);
        }
      } else if (msg.hardcodedTerrain) {
        console.warn('[terrain] hardcoded received but skipped — zid=' + _zid + ' Terrain=' + !!window.Terrain + ' setHardcoded=' + !!(window.Terrain && window.Terrain.setHardcoded));
      }
      if (msg.promoted) {
        // Phase 5-K4: observer ws 재사용 promote — resources/claims/buildings/mobs 전부
        // observer로 이미 받아 실시간 갱신(tick) 중이므로 그대로 유지. clear/rebuild 안 함 → 끊김 0.
      } else {
        c.resources.clear(); c.claims.clear(); c.buildings.clear(); c.mobs.clear();
        if (c.groundItems) c.groundItems.clear();
        for (const r of (msg.resources || [])) c.resources.set(r.id, r);
        for (const cl of (msg.claims || [])) c.claims.set(cl.id, cl);
        for (const b of (msg.buildings || [])) c.buildings.set(b.id, b);
        if (msg.rooms) ingestRooms(msg.rooms, null, c.meta || msg.meta || zonesMeta[primaryZoneId]);   // ★[배치 18 ①] welcome 시 서버 방 스냅샷
        for (const m of (msg.mobs || [])) c.mobs.set(m.mid, m);
        for (const gi of (msg.groundItems || [])) c.groundItems.set(gi.id, gi);
        // §4-4 Stage 4A: 마을 시뮬 영토(경계 셀 or 반경 근사) — welcome 1회, 이후 sim_village_day가 pop만 갱신
        c.simVillages = (msg.simVillages && msg.simVillages.length) ? msg.simVillages : null;
        // §11 도적: 소굴·야영 마커(welcome 1회, 이후 bandit_camps가 변경분 방송)
        c.banditCamps = (msg.banditCamps && msg.banditCamps.length) ? msg.banditCamps : null;
        // §16 답압 길: 등급 셀 flat [cx,cy,lv,...](welcome 1회, 이후 road_cells가 변경분 방송)
        c.roads = new Map();
        if (msg.roads) for (let i = 0; i < msg.roads.length; i += 3) c.roads.set(msg.roads[i] + ',' + msg.roads[i + 1], msg.roads[i + 2]);
        // ★[배치 20 B] 타일 상태: 기준선에서 **벗어난 셀만** flat [cx,cy,qv,geo,ore,...](welcome 1회,
        //   이후 tile_state 가 변경분 방송). 손 안 댄 셀은 여기 없고 `SoilBase.baseAt` 로 계산한다.
        c.soil = new Map();
        if (msg.soil) for (let i = 0; i + 4 < msg.soil.length; i += 5) {
          c.soil.set(msg.soil[i] + ',' + msg.soil[i + 1], { v: msg.soil[i + 2] * 16, geo: msg.soil[i + 3] | 0, ore: msg.soil[i + 4] | 0 });
        }
        _groundTiles.clear();   // 상태가 들어왔으니 기준선으로 구운 타일은 버린다
        // ★[다리 층] 통나무 널다리 셀(정적 맵 사물 — welcome 1회). 렌더 + 클라 콜라이더 미러 둘 다에 쓴다.
        //   서버 isTerrainBlockedLocal이 이 셀에서 물 차단을 푸는데 클라가 안 풀면 예측이 물에 막혀
        //   러버밴딩·다리 위 스턱이 난다(좌표 단일 작성자 원칙상 클라 예측은 서버와 같은 판정이어야 함).
        c.bridges = new Set();
        if (msg.bridges) for (let i = 0; i + 1 < msg.bridges.length; i += 2) {
          const k = msg.bridges[i] + ',' + msg.bridges[i + 1];
          c.bridges.add(k);
          _bridgeAbs.add(((msg.zone.worldOffsetX / CL_BUILDING_SIZE) + msg.bridges[i]) + ',' + (((msg.zone.worldOffsetY || 0) / CL_BUILDING_SIZE) + msg.bridges[i + 1]));
        }
        // ★[11차 T3 환호] 도랑 셀 flat [cx,cy,…] — 서버 콜라이더 미러 + 타일 렌더 원천(마을 소유 사물, welcome 1회)
        c.ditches = new Set();
        if (msg.ditches) for (let i = 0; i + 1 < msg.ditches.length; i += 2) {
          c.ditches.add(msg.ditches[i] + ',' + msg.ditches[i + 1]);
          _ditchAbs.add(((msg.zone.worldOffsetX / CL_BUILDING_SIZE) + msg.ditches[i]) + ',' + (((msg.zone.worldOffsetY || 0) / CL_BUILDING_SIZE) + msg.ditches[i + 1]));
        }
        // ★[곳간② 재고 표시] 곳간 물리 재고 flat [cx,cy,수량,…] — welcome 스냅샷, 이후 gran_stock 델타.
        //   회계(econ)가 아니라 NPC가 실제로 지고 와 쌓은 물리량이다. 사다리 앞 칸에 짐더미로 그린다.
        c.granStock = new Map();
        if (msg.granStocks) for (let i = 0; i + 2 < msg.granStocks.length; i += 3) {
          c.granStock.set(msg.granStocks[i] + ',' + msg.granStocks[i + 1], msg.granStocks[i + 2]);
        }
        // ★[10차 T4 장마당] 캐러밴 체류 중인 마을 중심 flat [ccx,ccy,…] — welcome 스냅샷, 이후 markets 방송.
        c.markets = (msg.markets || []).slice();
      }
      // 월드 시계 동기화 — 서버 now와 클라 now 차이를 보정해서 동일 phase 계산
      if (msg.worldClock) {
        worldClock = {
          epoch: msg.worldClock.epoch,
          dayLengthMs: msg.worldClock.dayLengthMs,
          dayPhaseRatio: msg.worldClock.dayPhaseRatio,
          serverNowOffset: msg.worldClock.serverNow - Date.now(), // serverNow = clientNow + offset
        };
      }

      if (!msg.observer) {
        myPid = msg.pid;
        inventory = msg.inventory;
        if (msg.tools) tools = msg.tools;
        if (Array.isArray(msg.toolItems)) toolItems = msg.toolItems;
        if (msg.equipped !== undefined) equipped = msg.equipped;
        if (msg.hotkey1 !== undefined) hotkey1 = msg.hotkey1;
        setTimeout(() => { try { updateHotkeyBar(); } catch(e){} }, 100);
        if (msg.recipes) recipes = msg.recipes;
        if (msg.itemRecipes) itemRecipes = msg.itemRecipes;
        if (msg.buildingRecipes) buildingRecipes = msg.buildingRecipes;
        if (msg.cookRecipes) cookRecipes = msg.cookRecipes;
        if (msg.foodEffects) foodEffects = msg.foodEffects;
        // 플레이어 장비
        if (msg.equipmentRecipes) equipmentRecipes = msg.equipmentRecipes;
        if (msg.equipmentMeta) equipmentMeta = msg.equipmentMeta;
        if (Array.isArray(msg.equipment)) equipment = msg.equipment;
        if (msg.equipSlots) equipSlots = msg.equipSlots;
        if (msg.craftSkill) craftSkill = msg.craftSkill;
        if (msg.self.hp !== undefined) { myHp = msg.self.hp; myMaxHp = msg.self.maxHp; }
        if (typeof msg.self.hunger === 'number') myHunger = msg.self.hunger;
        if (typeof msg.self.thirst === 'number') myThirst = msg.self.thirst;
        if (typeof msg.self.vp === 'number') myVp = msg.self.vp;
        if (msg.self.tribeId !== undefined) myTribeId = msg.self.tribeId;
        if (msg.self.tribeName !== undefined) myTribeName = msg.self.tribeName;
        if (typeof msg.self.floor === 'number') myFloor = msg.self.floor;
        // 14.42-a — home 위치 (없으면 null)
        myHomeZone = msg.self.homeZone || null;
        myHomeX = (typeof msg.self.homeX === 'number') ? msg.self.homeX : null;
        myHomeY = (typeof msg.self.homeY === 'number') ? msg.self.homeY : null;
        const absX = msg.zone.worldOffsetX + msg.self.x;
        const absY = (msg.zone.worldOffsetY || 0) + msg.self.y;
        myAbsPos = { x: absX, y: absY };
        // welcome = 풀 권위 리싱크(재연결/존이동) → 텔포처럼 취급: 미ack 입력 비우고 앵커.
        // ★유령 클라 fix: 앵커는 어떤 조건으로도 우회되지 않는다(primary welcome = 무조건 재앵커).
        pendingInputs.length = 0;
        _predAccum = 0;
        myAbsPredicted = { x: absX, y: absY };
        _renderPrev = { x: absX, y: absY };
        _renderCurr = { x: absX, y: absY };
        myAbsRender = { x: absX, y: absY };
        _renderReady = true;
        // 옛 보정 lerp 잔재도 함께 리셋(respawn 경로와 동형) — 앵커 직후 옛 속도로 끌려가지 않게.
        correctionVel = { x: 0, y: 0 };
        correctionUntil = 0;
        correctionIgnoreWall = false;
        _selfGone = false;              // 서버에 내 실체가 다시 생김 → 예측 재개
        if (!initialWelcomeReceived) {
          initialWelcomeReceived = true;
        }
        lastTickWithMyPidAt = performance.now();
        updateHud();
      }
      if (typeof _wStart === 'number') {
        const _proc = performance.now() - _wStart;
        if (_proc > 5) console.log('[handoff] ⏱ welcome 처리 =', _proc.toFixed(0), 'ms');
      }
    } else if (msg.type === 'tick') {
      const now = performance.now();
      if (c.role === 'primary') {
        if (lastTickAt) lastServerPingMs = now - lastTickAt;
        lastTickAt = now;
        // 14.49-c: 계단 z (0~32) — 서버 권위 값을 클라가 부드럽게 따라감
        if (typeof msg.selfZ === 'number') myStairZ = msg.selfZ;
      }
      for (const pp of msg.players) {
        if (pp.pid === myPid && c.role === 'primary') {
          const absX = c.meta.worldOffsetX + pp.x;
          const absY = (c.meta.worldOffsetY || 0) + pp.y;
          myAbsPos = { x: absX, y: absY };
          // 리컨실리에이션: 권위 위치 + ackSeq(tick top-level)로 미ack 입력 replay
          applyServerCorrection(absX, absY, msg.ackSeq);
          lastTickWithMyPidAt = now;
        } else {
          // 서버가 메타 필드(name/color/maxHp/tribeName)를 첫 visible 때만 보냄. 나머진 prev 캐시 유지.
          const prev = c.others.get(pp.pid);
          const buf = prev?.buf || [];
          pushSample(buf, now, pp.x, pp.y);
          const vxNow = pp.vx || 0, vyNow = pp.vy || 0;
          const fvxKeep = (vxNow !== 0 || vyNow !== 0) ? vxNow : (prev?._fvx || 1);
          const fvyKeep = (vxNow !== 0 || vyNow !== 0) ? vyNow : (prev?._fvy || 0);
          // §4-4 P4: 전쟁 병사 전투 메타 — 서버는 muster 병사에만 br(궤주 비트) 매틱 송신 → 전투유닛 신호.
          //   bt(병종)·bs(진영)·bc(지휘관)은 최초가시분만 → prev 승계(0=champion/공격이라 !==undefined 판별).
          const _isWar = pp.br !== undefined;
          c.others.set(pp.pid, {
            pid: pp.pid,
            x: pp.x, y: pp.y,
            z: pp.z || 0, // 14.49-d: 계단 위 z
            floor: pp.floor || 0,
            vx: vxNow, vy: vyNow,
            _fvx: fvxKeep, _fvy: fvyKeep, // Phase 14.37: 마지막 facing
            _war: _isWar,
            bt: (pp.bt !== undefined) ? pp.bt : prev?.bt,
            bs: (pp.bs !== undefined) ? pp.bs : prev?.bs,
            bc: (pp.bc !== undefined) ? pp.bc : prev?.bc,
            br: _isWar ? (pp.br | 0) : 0,
            name: pp.name ?? prev?.name ?? '?',
            color: pp.color ?? prev?.color ?? '#5a9ae0',
            hp: pp.hp,
            maxHp: pp.maxHp ?? prev?.maxHp ?? 100,
            tribeName: pp.tribeName !== undefined ? pp.tribeName : prev?.tribeName,
            simJob: pp.simJob !== undefined ? pp.simJob : prev?.simJob, // §4-4 Stage 4A: 마을 NPC 직업(첫 visible 메타 + sim_village_day 갱신)
            act: pp.act !== undefined ? pp.act : prev?.act, // ★[액션 라벨] 생활 층 행동(모내기·잠행·개간…) — 변경 시에만 수신, 미수신=유지
            cap: pp.cap | 0, // §18 3파: 포로 표식(동적 1비트 — 회색 테두리 렌더)
            buf,
            lastX: prev?.x ?? pp.x, lastY: prev?.y ?? pp.y,
            lastT: now,
            lastAttackAt: prev?.lastAttackAt || 0,
          });
          // Phase 14.41: tick에 isDown=1 있으면 다운 상태 갱신 (보강 — broadcast 누락 대비)
          if (pp.isDown) downStates.set(pp.pid, true);
          else if (pp.isDown === undefined && downStates.has(pp.pid)) {
            // tick은 absent 키를 못 보냄. player_down_state로만 해제됨.
          }
        }
      }
      const alive = new Set(msg.players.map(p => p.pid));
      for (const pid of c.others.keys()) if (!alive.has(pid)) { c.others.delete(pid); downStates.delete(pid); }
      // mob 갱신 (tick에 포함된 것)
      if (Array.isArray(msg.mobs)) {
        const aliveMobs = new Set(msg.mobs.map(m => m.mid));
        for (const m of msg.mobs) {
          // mob도 메타(type/maxHp/tameOwner)는 첫 visible 때만. 나머지엔 prev 유지.
          const prev = c.mobs.get(m.mid);
          const buf = prev?.buf || [];
          pushSample(buf, now, m.x, m.y);
          const mvx = m.vx || 0, mvy = m.vy || 0;
          c.mobs.set(m.mid, {
            mid: m.mid,
            x: m.x, y: m.y,
            z: m.z || 0, floor: m.floor || 0, // 14.49-d
            vx: mvx, vy: mvy,
            _fvx: (mvx !== 0 || mvy !== 0) ? mvx : (prev?._fvx || 1),
            _fvy: (mvx !== 0 || mvy !== 0) ? mvy : (prev?._fvy || 0),
            hp: m.hp,
            type: m.type ?? prev?.type ?? 'deer',
            maxHp: m.maxHp ?? prev?.maxHp ?? 10,
            tameOwner: m.tameOwner !== undefined ? m.tameOwner : prev?.tameOwner,
            tameOwnerName: m.tameOwnerName !== undefined ? m.tameOwnerName : prev?.tameOwnerName,
            buf,
            lastX: prev?.x ?? m.x, lastY: prev?.y ?? m.y,
            lastT: now,
          });
        }
        // AOI 시야 밖으로 나간 mob 정리 (tick에 없으면 제거)
        for (const mid of c.mobs.keys()) if (!aliveMobs.has(mid)) c.mobs.delete(mid);
      }
    } else if (msg.type === 'inventory') {
      inventory = msg.inventory; updateHud(); renderCraftPanel(); if (cookOpen) renderCookPanel();
    } else if (msg.type === 'cast_preview') {
      castPv[msg.itemType] = msg;   // 서버가 계산한 합금 물성 — 읽어서 그리기만 한다
      paintCastReadout(msg.itemType);
    } else if (msg.type === 'equipment') {
      // 플레이어 장비 인스턴스·장착 슬롯·제작 숙련 갱신
      if (Array.isArray(msg.equipment)) equipment = msg.equipment;
      if (msg.equipSlots) equipSlots = msg.equipSlots;
      if (msg.craftSkill) craftSkill = msg.craftSkill;
      renderCraftPanel();
      const sp2 = document.getElementById('sidePanel');
      if (sp2 && sp2.classList.contains('open')) {
        const spBody2 = document.getElementById('spBody');
        if (spBody2 && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spBody2);
      }
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    } else if (msg.type === 'shop_info') {
      shopVillage = msg.village || null;
      const spS = document.getElementById('sidePanel');
      if (spS && spS.classList.contains('open')) {
        const spB = document.getElementById('spBody');
        if (spB && craftCat === 'trade' && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spB);
      }
    } else if (msg.type === 'dishes') {
      dishes = Array.isArray(msg.dishes) ? msg.dishes : [];
      if (cookOpen) renderCookPanel();
      const sp3 = document.getElementById('sidePanel');
      if (sp3 && sp3.classList.contains('open')) {
        const spBody3 = document.getElementById('spBody');
        if (spBody3 && craftCat === 'food' && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spBody3);
      }
    } else if (msg.type === 'tools_update' || msg.type === 'tools') {
      // 14.53: toolItems 리스트 + equipped (instance id) + hotkey1
      if (Array.isArray(msg.toolItems)) toolItems = msg.toolItems;
      if (msg.tools) tools = msg.tools; // 옛 호환
      if (msg.equipped !== undefined) equipped = msg.equipped;
      if (msg.hotkey1 !== undefined) hotkey1 = msg.hotkey1;
      updateHotkeyBar();
      updateHud(); renderCraftPanel();
      // 좌측 sidePanel craft 열려있으면 갱신
      const sp = document.getElementById('sidePanel');
      if (sp && sp.classList.contains('open')) {
        const spBody = document.getElementById('spBody');
        if (spBody && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spBody);
      }
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    } else if (msg.type === 'resource_removed') {
      c.resources.delete(msg.id);
    } else if (msg.type === 'resource_update') {
      const r = c.resources.get(msg.id); if (r) r.hp = msg.hp;
    } else if (msg.type === 'resource_spawn') {
      c.resources.set(msg.resource.id, msg.resource);
    } else if (msg.type === 'resources_spawn') {        // 배치 — 숲 청크 활성화 시 수백 그루 한 번에
      const arr = msg.resources || [];
      for (let i = 0; i < arr.length; i++) c.resources.set(arr[i].id, arr[i]);
    } else if (msg.type === 'resources_removed') {      // 배치 제거 — 청크 비활성화
      const ids = msg.ids || [];
      for (let i = 0; i < ids.length; i++) c.resources.delete(ids[i]);
    } else if (msg.type === 'buildings_spawn') {        // 배치 — 청크 활성화 시 NPC 집 등 한 번에 (welcome 폭주 방지)
      const arr = msg.buildings || [];
      for (let i = 0; i < arr.length; i++) c.buildings.set(arr[i].id, arr[i]);
      clWallMapBuiltAt = 0; clStairCacheBuildAt = 0;   // wall/stair 캐시 재빌드 강제 (다음 프레임)
    } else if (msg.type === 'buildings_removed') {      // 배치 제거 — 청크 비활성화 (서버는 메모리 유지)
      const ids = msg.ids || [];
      for (let i = 0; i < ids.length; i++) c.buildings.delete(ids[i]);
      clWallMapBuiltAt = 0; clStairCacheBuildAt = 0;
    } else if (msg.type === 'rooms_update') {
      // ★[배치 18 ①] 서버 방 판정 수신 — 클라는 계산하지 않는다(사본 방지).
      ingestRooms(msg.rooms, msg.removed, c.meta || zonesMeta[primaryZoneId]);
    } else if (msg.type === 'claim_added') {
      c.claims.set(msg.claim.id, msg.claim);
    } else if (msg.type === 'claim_updated') {
      // Phase 4d-16-a: 영토 cell sub-type 변경 (예: NPC personal 분배)
      c.claims.set(msg.claim.id, msg.claim);
    } else if (msg.type === 'claim_removed') {
      c.claims.delete(msg.id);
    } else if (msg.type === 'sim_village_day') {
      // §4-4 Stage 4A: 게임일 1회 — 마을 인구 라벨 + NPC 직업(simJob) 변경분 + §19 영토 크립 반경(tr) 갱신
      if (c.simVillages && msg.pops) for (const v of c.simVillages) { if (msg.pops[v.id] != null) v.pop = msg.pops[v.id]; if (msg.terr && msg.terr[v.id] != null) v.tr = msg.terr[v.id]; }
      if (msg.jobs) for (const [pid, job] of Object.entries(msg.jobs)) { const o = c.others.get(pid); if (o) o.simJob = job; }
      if (_wxIngest(c, msg.wx)) needsRedraw = true;   // ★[날씨 축] — 방송과 하네스가 같은 입구
    } else if (msg.type === 'bandit_camps') {
      // §11 도적: 소굴·야영 마커 갱신(서버가 변경 시에만 방송)
      c.banditCamps = (msg.camps && msg.camps.length) ? msg.camps : null;
    } else if (msg.type === 'road_cells') {
      // §16 답압 길: 게임일 1회 변경분(등급 전이 셀만) — lv 0=풀 복귀(삭제)
      if (!c.roads) c.roads = new Map();
      const rc = msg.cells || [];
      for (let i = 0; i < rc.length; i += 3) { const k = rc[i] + ',' + rc[i + 1]; if (rc[i + 2]) c.roads.set(k, rc[i + 2]); else c.roads.delete(k); }
      _gtInvalidateCells(c, rc, 3);
      needsRedraw = true;
    } else if (msg.type === 'tile_state') {
      _tsIngest(c, msg.cells || []);
      needsRedraw = true;
    } else if (msg.type === 'gran_stock') {
      // ★[곳간② 재고 표시] 물리 재고 델타(변한 곳간만 · 1초 스로틀) — flat [cx,cy,수량,…], 0이면 삭제.
      if (!c.granStock) c.granStock = new Map();
      const gs = msg.g || [];
      for (let i = 0; i + 2 < gs.length; i += 3) { const k = gs[i] + ',' + gs[i + 1]; if (gs[i + 2] > 0) c.granStock.set(k, gs[i + 2]); else c.granStock.delete(k); }
      needsRedraw = true;
    } else if (msg.type === 'markets') {
      // ★[10차 T4 장마당] 전체 치환(집합이 바뀔 때만 오는 방송 — 델타가 아니다). 빈 배열 = 전 마을 파장.
      c.markets = (msg.m || []).slice();
      needsRedraw = true;
    } else if (msg.type === 'war_battle') {
      // §4-4 P4: 진행 전투 집계(2Hz+전이) — 스펙테이터 HUD·화면밖 지시자·관전 카메라 레지스트리.
      //   origin은 해당 존 로컬 px(o.cx*32) → 존 worldOffset 더해 절대 px(병사 pp.x 국지화와 동일).
      const conn = conns.get(zoneId);
      const ox = (conn && conn.meta && conn.meta.worldOffsetX) || 0;
      const oy = (conn && conn.meta && conn.meta.worldOffsetY) || 0;
      const b = warBattles.get(msg.id) || { id: msg.id };
      b.ox = ox + ((msg.origin && msg.origin.x) || 0);
      b.oy = oy + ((msg.origin && msg.origin.y) || 0);
      b.atk = msg.atk; b.def = msg.def; b.casus = msg.casus;
      b.aliveA = msg.aliveA | 0; b.aliveB = msg.aliveB | 0;
      b.phase = msg.phase || 'battle';
      b.seenAt = performance.now();
      if (b.phase === 'resolved') b.resolvedAt = b.seenAt;
      warBattles.set(msg.id, b);
      if (_warSpec.active && _warSpec.id === msg.id) _warSpec.to = { x: b.ox, y: b.oy };   // 관전 중이면 목표 추종(전투 origin 미세 이동)
      updateWarHud();
    } else if (msg.type === 'war_command_ack') {
      // §4-4 P4: 지휘 참가 응답(서버 진영·근접 검증). 거절 시 관전만 유지.
      if (!msg.ok && _warCmdId === msg.warId) _warCmdId = null;
      _warCmdMsg = msg.ok ? '지휘 수락됨 — WASD로 부대 지휘' : ('지휘 거절: ' + (msg.reason || '조건 불충족'));
      updateWarHud();
    } else if (msg.type === 'building_added') {
      c.buildings.set(msg.building.id, msg.building);
      if (msg.building.type === 'stair') clStairCacheBuildAt = 0;
      if (msg.building.type === 'wall') {
        // 14.49-e6-b: wall 위치 cache에 즉시 추가 (콜라이더 미러). ★배치 18: 방 재계산은 서버 몫 — rooms_update 가 온다.
        const b = msg.building;
        const side = b.data?.side;
        if (side) {
          const zm = c.meta || zonesMeta[primaryZoneId];
          const ox = Math.floor((zm?.worldOffsetX || 0) / CL_BUILDING_SIZE);
          const oy = Math.floor((zm?.worldOffsetY || 0) / CL_BUILDING_SIZE);
          const absCx = ox + Math.floor(b.x / CL_BUILDING_SIZE);
          const absCy = oy + Math.floor(b.y / CL_BUILDING_SIZE);
          const f = b.floor || 0;
          clWallCellMap.set(`${absCx}_${absCy}_${side}_${f}`, true);
        }
      }
    } else if (msg.type === 'building_removed') {
      const b = c.buildings.get(msg.id);
      if (b?.type === 'stair') clStairCacheBuildAt = 0;
      if (b?.type === 'wall') {
        // 14.49-e6-b: wall 위치 cache에서 즉시 제거 (콜라이더 미러). ★배치 18: 방 재계산은 서버 몫.
        const side = b.data?.side;
        if (side) {
          const zm = c.meta || zonesMeta[primaryZoneId];
          const ox = Math.floor((zm?.worldOffsetX || 0) / CL_BUILDING_SIZE);
          const oy = Math.floor((zm?.worldOffsetY || 0) / CL_BUILDING_SIZE);
          const absCx = ox + Math.floor(b.x / CL_BUILDING_SIZE);
          const absCy = oy + Math.floor(b.y / CL_BUILDING_SIZE);
          const f = b.floor || 0;
          clWallCellMap.delete(`${absCx}_${absCy}_${side}_${f}`);
        }
      }
      c.buildings.delete(msg.id);
    } else if (msg.type === 'building_updated') {
      // 14.50: door open/close 등 building data 변경. wall cache 무효화 (door state 영향).
      const b = c.buildings.get(msg.building.id);
      if (b) {
        b.data = msg.building.data;
        if (b.type === 'door') clWallMapBuiltAt = 0; // door state 변경 → cache 재빌드
      }
    } else if (msg.type === 'ground_item_added') {
      if (c.groundItems) c.groundItems.set(msg.gi.id, msg.gi);
    } else if (msg.type === 'ground_item_removed') {
      if (c.groundItems) c.groundItems.delete(msg.id);
    } else if (msg.type === 'player_attacked') {
      // Phase 14.35: 다른 player 공격 모션 — others에서 그 pid 찾아 lastAttackAt 저장
      for (const con of conns.values()) {
        const o = con.others?.get(msg.pid);
        if (o) o.lastAttackAt = performance.now();
      }
    } else if (msg.type === 'building_damaged') {
      const b = c.buildings.get(msg.id);
      if (b) {
        b.data = b.data || {};
        b.data.hp = msg.hp;
        b.data.damaged = msg.damaged;
      }
    } else if (msg.type === 'arrow_spawn') {
      // Phase 5-I: 화살 발사체 — 절대좌표로 저장, 클라가 등속 외삽 (서버는 spawn/remove만 보냄)
      if (!window._arrows) window._arrows = new Map();
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      window._arrows.set(msg.aid, { ax: ox + msg.x, ay: oy + msg.y, vx: msg.vx, vy: msg.vy, t0: performance.now() });
    } else if (msg.type === 'arrow_removed') {
      if (window._arrows) window._arrows.delete(msg.aid);
    } else if (msg.type === 'mob_damaged') {
      const m = c.mobs.get(msg.mid); if (m) m.hp = msg.hp;
    } else if (msg.type === 'mob_removed') {
      c.mobs.delete(msg.mid);
    } else if (msg.type === 'corpses_init') {
      // Phase 5-7
      for (const co of msg.corpses) c.corpses.set(co.cid, co);
    } else if (msg.type === 'corpse_added') {
      c.corpses.set(msg.corpse.cid, msg.corpse);
    } else if (msg.type === 'corpse_removed') {
      c.corpses.delete(msg.cid);
    } else if (msg.type === 'mob_spawn') {
      c.mobs.set(msg.mob.mid, msg.mob);
    } else if (msg.type === 'mob_tamed') {
      const m = c.mobs.get(msg.mid);
      if (m) { m.tameOwner = msg.owner; m.tameOwnerName = msg.ownerName; }
    } else if (msg.type === 'player_damaged') {
      if (msg.pid === myPid) { myHp = msg.hp; updateHud(); }
      else {
        const o = c.others.get(msg.pid); if (o) o.hp = msg.hp;
      }
    } else if (msg.type === 'player_respawn') {
      if (msg.pid === myPid) {
        myHp = msg.hp;
        // Phase 14.41: 부활 → 다운 상태 해제
        myIsDown = false;
        myDownedAt = 0;
        myRespawnOptions = [];
        hideDownPanel();
        // 서버가 자기 사유지 좌표로 텔레포트했으니 클라 좌표도 즉시 동기화
        if (msg.x !== undefined && c.meta) {
          const absX = c.meta.worldOffsetX + msg.x;
          const absY = (c.meta.worldOffsetY || 0) + msg.y;
          myAbsPos = { x: absX, y: absY };
          myAbsPredicted = { x: absX, y: absY };
          correctionVel = { x: 0, y: 0 };
          correctionUntil = 0;
          // 부활 = 텔포 → 미ack 입력 비우고 렌더 앵커 리싱크 (카메라가 텔포 구간 lerp 방지)
          pendingInputs.length = 0;
          _predAccum = 0;
          _renderPrev = { x: absX, y: absY };
          _renderCurr = { x: absX, y: absY };
          myAbsRender = { x: absX, y: absY };
          _renderReady = true;
        }
        updateHud();
      } else {
        downStates.delete(msg.pid); // 다른 사람도 부활하면 down 해제
      }
    } else if (msg.type === 'player_downed') {
      // Phase 14.41: 본인 사망 — 부활 패널 표시
      if (msg.pid === myPid) {
        myIsDown = true;
        myDownedAt = performance.now();
        myDownRescueWindowMs = msg.rescueWindowMs || 10000;
        myRespawnOptions = msg.options || [];
        showDownPanel();
      }
    } else if (msg.type === 'player_down_state') {
      // 다른 사람 다운/일어남 상태 (시각용)
      if (msg.pid === myPid) {
        // 본인은 player_downed/respawn 로직으로 처리. 여기선 안 변경
      } else {
        if (msg.isDown) downStates.set(msg.pid, true);
        else downStates.delete(msg.pid);
      }
    } else if (msg.type === 'chest_state') {
      // 상자 UI에 반영
      window.__lastChestState = msg;
      renderChestUi(msg.buildingId, msg.data);
    } else if (msg.type === 'arrow_fx') {
      // ★사냥꾼 사격 시각화 — 서버 wildlife 실행층이 발사 순간 1회 방송(존 로컬 px).
      //   절대 월드로 변환해 보관하고, ms 동안 진행률 보간으로 화살을 그린다(서버 비행시간과 동일 속도).
      const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
      _arrowFx.push({
        x0: ox + msg.x0, y0: oy + msg.y0, x1: ox + msg.x1, y1: oy + msg.y1,
        at: performance.now(), ms: Math.max(80, Math.min(1500, msg.ms || 250)),
      });
      if (_arrowFx.length > 96) _arrowFx.shift();   // 폭주 방어
    } else if (msg.type === 'player_left') {
      // ★유령 클라 fix: 본인 제거(사망·서버측 삭제) 수신 → 예측 즉시 정지 + 재연결 트리거.
      //   옛 코드는 자기 pid를 others에서 지우기만 해서, 서버에 실체가 없는데 클라만 계속 걸어다녔다(유령).
      if (msg.pid && msg.pid === myPid) {
        console.warn('[recover] 서버가 내 플레이어를 제거함(player_left) — 예측 정지 후 재연결');
        _selfGone = true;
        myPid = null;                 // 이후 어떤 tick도 "나"로 오인되지 않게
        lastTickWithMyPidAt = 0;      // orphan 워치독 비활성(재연결 welcome이 다시 켬)
        pendingInputs.length = 0;
        _predAccum = 0;
        if (conns.has(zoneId)) closeConnection(zoneId); // 다음 프레임 ensurePrimaryConnection이 재연결
        return;
      }
      c.others.delete(msg.pid);
    } else if (msg.type === 'gauges') {
      if (typeof msg.hunger === 'number') myHunger = msg.hunger;
      if (typeof msg.thirst === 'number') myThirst = msg.thirst;
      if (typeof msg.vp === 'number') myVp = msg.vp;
      if (typeof msg.cold === 'boolean') myCold = msg.cold;
      updateHud();
    } else if (msg.type === 'village_inventory') {
      // ★★[2026-08-03e 배치 12 ③] 마을 재고 — **서버가 준 값을 그대로 그린다**(클라 재계산 0).
      //   식량 환산·자립일수·다음 주민 문턱은 전부 엔진 정본 함수의 결과다(사본 금지).
      //   `_cash`(미상환 세곡 채권 장부)는 서버가 아예 안 보낸다 — 재화와 나란히 놓으면 "부"로 오독된다.
      showVillageInventory(msg.inv);
    } else if (msg.type === 'pvp_state') {
      myPvpEnabled = !!msg.enabled;
      updateHud();
    } else if (msg.type === 'floor_changed') {
      myFloor = msg.floor;
      updateHud();
    } else if (msg.type === 'handoff') {
      // 서버가 발급한 토큰으로 새 zone에 접속.
      const target = msg.targetZone;
      const token = msg.token;
      if (target === primaryZoneId) return;
      if (!zonesMeta[target]) return;
      console.log('[handoff]', primaryZoneId, '→', target, 'token=', token.slice(0,8));
      const oldPrimary = primaryZoneId;
      primaryZoneId = target;

      // ★ observer로 미리 연결된 ws가 있으면 promote만 — 새 ws 안 만듦 → 끊김 ~0
      const existingTarget = conns.get(target);
      if (existingTarget && existingTarget.role === 'observer' && existingTarget.ws.readyState === 1) {
        console.log('[handoff] ✨ promote existing observer ws');
        existingTarget._promoteSentAt = performance.now(); // 끊김 측정용
        existingTarget.ws.send(JSON.stringify({ type: 'promote_to_primary', token }));
        existingTarget.role = 'primary';
        // server가 welcome 보낼 거 — 기존 handleMessage('welcome')에서 처리
      } else {
        // observer 미리 연결 안 됐으면 새 ws 만들기 (기존 흐름)
        if (existingTarget) closeConnection(target);
        connect(target, 'primary', { token });
      }
      // 옛 primary observer로 demote — broadcast 갭 줄임
      const oldConn = conns.get(oldPrimary);
      if (oldConn) oldConn.role = 'observer';
      showNotice(zonesMeta[target].displayName);
    } else if (msg.type === 'kicked') {
      // 다른 곳에서 로그인되어 강제 종료
      kicked = true;
      const reasonMap = { duplicate_login: '다른 곳에서 로그인되어 종료되었습니다.' };
      const text = reasonMap[msg.reason] || `종료 사유: ${msg.reason}`;
      console.warn('[kicked]', text);
      // 모든 연결 정리 후 로비로
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      return;
    } else if (msg.type === 'zone_full') {
      // zone 가득 참 — 로비로 복귀 + 알림
      const text = `${zonesMeta[msg.zone]?.displayName || msg.zone} 가득 참 (${msg.current}/${msg.cap}명). 다른 zone 선택.`;
      console.warn('[zone_full]', text);
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      // zone 인구 강제 새로고침
      fetch('/zones').then(r => r.json()).then(d => { zonesMeta = d.zones; }).catch(() => {});
      return;
    } else if (msg.type === 'auth_error') {
      // 로비로 복귀, 에러 표시
      const reasonMap = {
        wrong_password: '패스워드가 틀렸습니다.',
        username_taken: '이미 사용 중인 이름입니다.',
      };
      const text = reasonMap[msg.reason] || `인증 실패: ${msg.reason}`;
      console.warn('[auth]', text);
      // 연결 종료, 게임 화면 → 로비
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      return;
    } else if (msg.type === 'pong') {
      // 14.43: watchdog용 — 최근 pong 시각 기록
      c.lastPongAt = performance.now();
      if (c.role === 'primary') lastRttMs = c.lastPongAt - msg.t;
    } else if (msg.type === 'chat') {
      // 같은 zone(또는 observer zone)에서 온 채팅. 길드 채팅이면 prefix 표시.
      const prefix = msg.tribe ? `[길드:${msg.tribe}] ` : '';
      chatLog.push({ name: prefix + msg.name, color: msg.color || '#5a9ae0', text: msg.text, t: msg.t, isTribe: !!msg.tribe });
      if (chatLog.length > 20) chatLog.shift();
      speechBubbles.set(msg.pid, { text: (msg.tribe ? '🛡️ ' : '') + msg.text, until: performance.now() + 4000 });
      renderChatLog();
    } else if (msg.type === 'notice') {
      showNotice(msg.text);
    }
  }

  // === 인접 존 자동 구독/해제 ===
  // 시야 반경(VIEW_RADIUS=650) + 여유 = 800. 시야에 들어오기 전에 미리 구독.
  const PEEK_THRESHOLD = 900;  // 이웃 zone 경계에서 이만큼 안쪽에 있으면 observer 미리 연결
  function manageNeighborSubscriptions() {
    if (!primaryZoneId) return;
    const pmeta = zonesMeta[primaryZoneId];
    if (!pmeta) return;
    const pMeta = zonesMeta[primaryZoneId];
    const zoneW = pMeta?.zoneWidth || 100000, zoneH = pMeta?.zoneHeight || 100000;
    const localX = myAbsPredicted.x - pmeta.worldOffsetX;
    const localY = myAbsPredicted.y - (pmeta.worldOffsetY || 0);
    // Phase 5-G fix: player 위치 초기화 안 됨 (myAbsPredicted=0,0 → localXY 음수) → 모든 인접 zone에 storm connect
    // primary zone 안이 아닌 경우 (localXY 음수 또는 zone 밖) skip
    if (!isFinite(localX) || !isFinite(localY)) return;
    if (localX < 0 || localY < 0 || localX > zoneW || localY > zoneH) return;
    // 4방향 이웃 거리 계산
    const dirs = [
      { id: pmeta.east,  d: zoneW - localX },
      { id: pmeta.west,  d: localX },
      { id: pmeta.south, d: zoneH - localY },
      { id: pmeta.north, d: localY },
    ];
    for (const { id, d } of dirs) {
      if (!id) continue;
      if (d < PEEK_THRESHOLD && !conns.has(id)) {
        // Phase 5-G: 최근 close 후 cooldown — storm 방지
        const lastClose = _lastCloseAt.get(id) || 0;
        if (performance.now() - lastClose < RECONNECT_COOLDOWN_MS) continue;
        console.log('[neighbor] connect observer', id, 'd=', d, 'localXY=', myAbsPredicted.x - pmeta.worldOffsetX, myAbsPredicted.y - (pmeta.worldOffsetY || 0));
        connect(id, 'observer', null);
      } else if (d > PEEK_THRESHOLD * 1.6) {
        const c = conns.get(id);
        if (c && c.role === 'observer') closeConnection(id);
      }
    }
    // 멀리 떨어진 옛 observer 정리 (zone 중심과 거리)
    // 14.46-b-smooth-fix2: zone마다 크기 다름. 이웃 zone 자기 크기 기준으로 임계 계산.
    // 옛 코드는 primary zoneW 기준이라, 큰 이웃 zone은 매 프레임 open→close 사이클 도는 버그.
    for (const [zid, c] of conns) {
      if (zid === primaryZoneId) continue;
      const zm = zonesMeta[zid];
      if (!zm) continue;
      const nZoneW = zm.zoneWidth || 100000;
      const nZoneH = zm.zoneHeight || 100000;
      // 이웃 zone의 가장 가까운 변(엣지)까지 거리
      const edgeDistX = Math.max(0, Math.max(zm.worldOffsetX - myAbsPredicted.x, myAbsPredicted.x - (zm.worldOffsetX + nZoneW)));
      const edgeDistY = Math.max(0, Math.max((zm.worldOffsetY || 0) - myAbsPredicted.y, myAbsPredicted.y - ((zm.worldOffsetY || 0) + nZoneH)));
      const edgeDist = Math.hypot(edgeDistX, edgeDistY);
      // 이웃 zone 엣지에서 PEEK_THRESHOLD*1.6 이상 멀어졌으면 정리 (직접 이웃 hysteresis와 일치)
      if (edgeDist > PEEK_THRESHOLD * 1.6) closeConnection(zid);
    }
  }

  // === WASD = 화면 기준, 키 매핑은 45도 회전 (8방향 대각선 = 월드 cardinal) ===
  // W 단독: NW (-0.71, -0.71) → 화면 정 위
  // D 단독: NE (+0.71, -0.71) → 화면 정 오른쪽
  // S 단독: SE (+0.71, +0.71) → 화면 정 아래
  // A 단독: SW (-0.71, +0.71) → 화면 정 왼쪽
  // 두 키 조합: W+A=정서(-1,0), W+D=정북(0,-1), S+D=정동(1,0), S+A=정남(0,1).
  // 결과: 깔끔한 0/0.71/1 값만 나옴 + 속도 벡터와 화면 이동이 1:1.
  function worldKeysDir() {
    const w = keys.has('w') || keys.has('arrowup');
    const s = keys.has('s') || keys.has('arrowdown');
    const a = keys.has('a') || keys.has('arrowleft');
    const d = keys.has('d') || keys.has('arrowright');
    let wx = 0, wy = 0;
    // 각 키를 NW/NE/SE/SW 단위벡터로 더함
    if (w) { wx += -1; wy += -1; }
    if (d) { wx +=  1; wy += -1; }
    if (s) { wx +=  1; wy +=  1; }
    if (a) { wx += -1; wy +=  1; }
    const len = Math.hypot(wx, wy);
    if (len > 0) { wx /= len; wy /= len; }
    return { wx, wy };
  }

  // === 클라 사이드 예측: 고정 스텝(30Hz) + 입력 히스토리 + 서버 리컨실리에이션 ===
  // (Gabriel Gambetta "Fast-Paced Multiplayer" 모델)
  // 한 스텝 = 한 input seq = 서버 한 tick의 이동. predictStep(아래)은 서버 per-tick player move와
  // 수학적으로 동일해야 replay가 서버를 정확히 재현함 (옛 인라인 블록을 그대로 옮긴 것).
  // sendInput/loop/applyServerCorrection 보다 먼저 선언 — TDZ 회피.
  let _predAccum = 0;
  const PRED_STEP = 1 / 30;           // 서버 TICK_HZ=30 과 동일
  let inputSeq = 0;
  const pendingInputs = [];           // [{seq, wx, wy, sprint}] — ack 안 된 입력 (replay용)
  // 렌더 보간(60fps): 직전 스텝 위치 ↔ 현재 스텝 위치 사이를 _predAccum 비율로 lerp.
  let _renderPrev = { x: 0, y: 0 };
  let _renderCurr = { x: 0, y: 0 };
  let myAbsRender = { x: 0, y: 0 };   // 카메라/본인 스프라이트가 쓰는 보간 위치
  let _renderReady = false;           // 첫 스텝 전엔 myAbsPredicted 로 fallback

  // === 입력 전송 ===
  let lastInputSentAt = 0;
  // 이동키 down/up 즉시 송신용 — 시작/정지 지연을 줄임.
  // 리컨실리에이션 불변식 유지: "보낸 입력은 모두 seq를 갖고 pendingInputs에 기록되며 predictStep으로 시뮬"됨.
  // 즉시 1 스텝을 처리하고 accumulator에서 그만큼 차감 → 다음 loop while가 중복 적용 안 함.
  // (down 시: 위치 1/30 전진 + 기록. up/idle 시: zero-input → predictStep no-op이라 위치 불변, 기록만.)
  function sendInput() {
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (!c || c.ws.readyState !== 1) return;
    // 다운 중: 기록/시뮬 없이 zero-input만 (서버 정지용). seq 포함.
    if (myIsDown) {
      inputSeq++;
      sendStepInput(inputSeq, 0, 0, false);
      return;
    }
    const { wx, wy } = worldKeysDir();
    const sp = !!mySprint;
    inputSeq++;
    pendingInputs.push({ seq: inputSeq, wx, wy, sprint: sp });
    if (pendingInputs.length > 200) pendingInputs.shift();
    sendStepInput(inputSeq, wx, wy, sp);
    // 이 즉시 스텝만큼 미리 시뮬 + accumulator 차감 (loop while 중복 방지)
    if (_renderReady) _renderPrev = { x: myAbsPredicted.x, y: myAbsPredicted.y };
    predictStep(PRED_STEP, wx, wy, sp);
    if (_renderReady) { _renderCurr = { x: myAbsPredicted.x, y: myAbsPredicted.y }; }
    _predAccum -= PRED_STEP;
    if (_predAccum < 0) _predAccum = 0;
  }

  // Phase 14.41: 근처 다운된 같은 길드원 찾기 (RESCUE_RANGE_PX = 80)
  function findNearestDownedGuildmate() {
    if (!myTribeId) return null;
    let best = null, bestD = 80;
    for (const c of conns.values()) {
      if (!c.others) continue;
      for (const o of c.others.values()) {
        if (!downStates.get(o.pid)) continue;
        if (!o.tribeName || o.tribeName !== myTribeName) continue;
        const ax = (c.meta?.worldOffsetX || 0) + o.x;
        const ay = (c.meta?.worldOffsetY || 0) + o.y;
        const d = Math.hypot(myAbsPredicted.x - ax, myAbsPredicted.y - ay);
        if (d < bestD) { best = o; bestD = d; }
      }
    }
    return best;
  }

  // (예측/리컨실리에이션 상태 변수는 위 sendInput 직전에 선언됨 — TDZ 회피)

  // 고정 스텝 1회 이동 — myAbsPredicted 를 직접 변형.
  // sprint 인자: live는 mySprint, replay는 각 입력의 sprint 상태를 넘김 (속도에 영향).
  function predictStep(dt, wx, wy, sprint) {
    // ★유령 클라 fix: 서버에 내 실체가 없는 동안(_selfGone)은 예측 정지 — 유령이 걸어다니지 않게.
    if (myIsDown || _selfGone || (wx === 0 && wy === 0)) return;
    const canSprintClient = sprint && myHunger > 5 && myThirst > 5;
    const speed = 64 * (canSprintClient ? 2.5 : 1);   // ★서버 MOVE_SPEED=64·SPRINT_MULT=2.5와 일치(불일치 시 예측 오버슈트→러버밴딩)
    let mwx = wx, mwy = wy;
    {
      const curCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
      const curCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
      const stairHit = clFindStairForCell(curCx, curCy);
      if (stairHit) {
        const dir = stairHit.stair.data?.dir || 'N';
        const dv = (dir === 'E') ? { x: 1, y: 0 } : (dir === 'W') ? { x: -1, y: 0 }
                 : (dir === 'S') ? { x: 0, y: 1 } : { x: 0, y: -1 };
        const proj = mwx * dv.x + mwy * dv.y;
        mwx = proj * dv.x;
        mwy = proj * dv.y;
      }
    }
    if (isTerrainBlockedAtAbs(myAbsPredicted.x, myAbsPredicted.y)) {
      let ejX = 0, ejY = 0, found = false;
      for (let r = 32; r <= 32 * 16 && !found; r += 32) {
        for (const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
          if (!isTerrainBlockedAtAbs(myAbsPredicted.x + d[0] * r, myAbsPredicted.y + d[1] * r)) { ejX = d[0]; ejY = d[1]; found = true; break; }
        }
      }
      if (found) {
        const len = Math.hypot(ejX, ejY) || 1;
        const push = speed * dt * 1.8;
        myAbsPredicted.x += (ejX / len) * push;
        myAbsPredicted.y += (ejY / len) * push;
      }
    } else {
      let nx = myAbsPredicted.x + mwx * speed * dt;
      let ny = myAbsPredicted.y + mwy * speed * dt;
      if (clientIsBlockedByWall(nx, myAbsPredicted.y, myAbsPredicted.x, myAbsPredicted.y, myFloor)) nx = myAbsPredicted.x;
      if (clientIsBlockedByWall(myAbsPredicted.x, ny, myAbsPredicted.x, myAbsPredicted.y, myFloor)) ny = myAbsPredicted.y;
      if (clientIsBlockedByWall(nx, ny, myAbsPredicted.x, myAbsPredicted.y, myFloor)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
      if (myFloor === 0 && (mwx || mwy)) {
        const trees = clientNearbyTrees(myAbsPredicted.x, myAbsPredicted.y);
        // ★탈출 밸브(서버 movePlayerStep 미러): 현재 위치가 이미 콜라이더 안이면 차단 해제 — 걸어나올 수 있게
        if (trees && !clientIsBlockedByTree(myAbsPredicted.x, myAbsPredicted.y, trees)) {
          if (clientIsBlockedByTree(nx, myAbsPredicted.y, trees)) nx = myAbsPredicted.x;
          if (clientIsBlockedByTree(myAbsPredicted.x, ny, trees)) ny = myAbsPredicted.y;
          if (clientIsBlockedByTree(nx, ny, trees)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
        }
      }
      if (isTerrainBlockedAtAbs(nx, myAbsPredicted.y)) {
        const tx = Math.floor(myAbsPredicted.x / 32);
        if (nx > myAbsPredicted.x) nx = (tx + 1) * 32 - 1;
        else if (nx < myAbsPredicted.x) nx = tx * 32;
        else nx = myAbsPredicted.x;
      }
      if (isTerrainBlockedAtAbs(myAbsPredicted.x, ny)) {
        const ty = Math.floor(myAbsPredicted.y / 32);
        if (ny > myAbsPredicted.y) ny = (ty + 1) * 32 - 1;
        else if (ny < myAbsPredicted.y) ny = ty * 32;
        else ny = myAbsPredicted.y;
      }
      if (isTerrainBlockedAtAbs(nx, ny)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
      myAbsPredicted.x = nx;
      myAbsPredicted.y = ny;
    }
    // 전체 월드 그리드 안으로만 clamp (서버도 동일 — 옛 인라인은 loop 끝에서 했으나 스텝마다 적용해야 replay 일치)
    myAbsPredicted.x = Math.max(0, Math.min(worldWidth - 1, myAbsPredicted.x));
    myAbsPredicted.y = Math.max(0, Math.min(worldHeight - 1, myAbsPredicted.y));
  }

  // 고정 스텝마다 입력 1개를 서버로 전송 (seq 포함). sendInput 의 send 경로 재사용.
  function sendStepInput(seq, wx, wy, sprint) {
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (!c || c.ws.readyState !== 1) return;
    c.ws.send(JSON.stringify({ type: 'input', seq, vx: wx, vy: wy, sprint: !!sprint }));
    lastInputSentAt = performance.now();
  }

  // === 메인 루프 ===
  let prevT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - prevT) / 1000);
    prevT = now;

    // 입력 전송은 이제 고정 스텝(아래 while)마다 1개씩 — 옛 33ms 게이트 sendInput() 제거.
    // 다운/멈춤일 때만 서버가 멈추도록 주기적 zero-input 전송.

    // === 클라 사이드 wall edge 콜라이더 (server isBlockedByWall 미러) ===
    // primary zone의 buildings + 이웃 zone들도 검사 (zone 경계 cross 시).
    // wall은 cell edge에 있음 (data.side ∈ {N, E}). cell 가로지를 때만 검사.
    // BUILDING_SIZE = 32 (server와 동일).
    // 인라인 함수 X — 매 프레임 만들기 비싸서 위에 한 번 정의함

    // === 클라이언트 예측: 고정 30Hz 스텝 + 입력 기록/전송 ===
    // 한 스텝 = 한 input seq = 서버 한 tick. predictStep 이 myAbsPredicted 를 변형.
    // 서버 리컨실리에이션(applyServerCorrection)이 매 tick 권위 위치에 anchor 후 미ack 입력을 replay.
    const { wx, wy } = worldKeysDir();
    const moving = !myIsDown && (wx !== 0 || wy !== 0);
    // §4-4 P4: 관전 중(비지휘) 이동 입력 시 자동 복귀. 지휘 중엔 WASD=부대 지휘라 카메라 유지(관전 지속).
    if (_warSpec.active && !_warCmdId && (wx !== 0 || wy !== 0)) stopSpectate();
    _predAccum += dt;                       // dt는 loop에서 이미 0.1 cap
    if (_predAccum > 0.1) _predAccum = 0.1;
    let _stepped = false;
    while (_predAccum >= PRED_STEP) {
      if (!_stepped) { _renderPrev = { x: myAbsPredicted.x, y: myAbsPredicted.y }; _stepped = true; }
      inputSeq++;
      const sp = !!mySprint;
      // 적용 전에 기록 — replay가 그대로 재현하도록.
      pendingInputs.push({ seq: inputSeq, wx, wy, sprint: sp });
      if (pendingInputs.length > 200) pendingInputs.shift();
      sendStepInput(inputSeq, wx, wy, sp);
      predictStep(PRED_STEP, wx, wy, sp);   // moving=false 면 내부에서 early-return (위치 불변)
      _predAccum -= PRED_STEP;
    }
    if (_stepped) {
      _renderCurr = { x: myAbsPredicted.x, y: myAbsPredicted.y };
      _renderReady = true;
    }
    // 멈춤/다운: 스텝이 입력을 안 보내는 구간 — 서버가 멈추도록 주기적 zero-input 전송 (seq 포함).
    if (!moving && (now - lastInputSentAt > 33)) {
      inputSeq++;
      sendStepInput(inputSeq, 0, 0, false);
    }
    // 렌더 위치 — myAbsPredicted(30Hz 예측 + 매 틱 리컨실리에이션 보정)로 '지수평활' 수렴(60fps).
    //   lerp(prev,curr)는 리컨실리에이션이 스텝 사이 myAbsPredicted를 ±수십px 보정하면 스텝 경계에서 점프로 받아 떨림.
    //   매 프레임 일정 비율로 당기는 평활은 그 점프를 여러 프레임에 분산 흡수 → 떨림 제거. (워프는 reconcile에서 직접 snap.)
    if (_renderReady) {
      // K20: 스텝 보간 복귀. self 예측은 30Hz 계단(myAbsPredicted). 직전 스텝(_renderPrev)↔현재 스텝(_renderCurr)을
      //   누적비율 a=_predAccum/PRED_STEP 로 lerp → 60fps에서 등속으로 흘러 카메라 30Hz 펄싱 제거.
      //   K18 지수평활은 계단을 못 펴 미세 펄싱했음. K19로 리컨실리에이션 보정이 ~0 → 보간 끝점이 안정 → 보간이 다시 부드러움.
      const a = _predAccum / PRED_STEP;   // while 루프 뒤라 0..1 보장
      myAbsRender.x = _renderPrev.x + (_renderCurr.x - _renderPrev.x) * a;
      myAbsRender.y = _renderPrev.y + (_renderCurr.y - _renderPrev.y) * a;
    } else {
      myAbsRender = { x: myAbsPredicted.x, y: myAbsPredicted.y };
      _renderReady = true;
    }

    ensurePrimaryConnection();
    checkOrphan();
    manageNeighborSubscriptions();
    { const _rA = performance.now(); render(); const _rd = performance.now() - _rA;
      window._gAcc = (window._gAcc||0)+_rd; window._gN = (window._gN||0)+1; if (_rd > (window._gMax||0)) window._gMax = _rd;
      if (window._gN >= 30) { if (window._renderDbg) { let _bn=0; for (const c of conns.values()) _bn += c.buildings.size;
        console.log(`[render] avg=${(window._gAcc/window._gN).toFixed(1)}ms tiles=${((window._tileAccDbg||0)/window._gN).toFixed(1)}ms max=${window._gMax.toFixed(0)}ms bld=${_bn}`); } window._gAcc=0; window._gN=0; window._gMax=0; window._tileAccDbg=0; } }
    drawArrowFx();      // 사냥꾼 화살 비행(서버 arrow_fx)
    drawBuildOverlay(); // 14.51: hover outline
    drawPlacementGhost(); // 14.53-i: placement 시 실루엣 미리보기
    updateBuildProgressEl(); // 14.51: 3초 progress bar (DOM)
    updateMinimap();
    requestAnimationFrame(loop);
  }
  // === 화살 이펙트 ===
  // 서버 arrow_fx 방송(사냥꾼 사격)을 비행시간 동안 보간해 그림. 카메라 기준은 render()가 남긴
  // _lastCamAbs(관전 카메라 포함) — 오버레이가 본체 렌더와 어긋나지 않게.
  function drawArrowFx() {
    if (!_arrowFx.length) return;
    const now = performance.now();
    const camIso = w2i(_lastCamAbs.x, _lastCamAbs.y);
    for (let i = _arrowFx.length - 1; i >= 0; i--) {
      const a = _arrowFx[i];
      const k = (now - a.at) / a.ms;
      if (k >= 1.2) { _arrowFx.splice(i, 1); continue; }   // 착탄 후 짧은 잔상(0.2×비행시간)
      const p = Math.min(1, k);
      const wx = a.x0 + (a.x1 - a.x0) * p, wy = a.y0 + (a.y1 - a.y0) * p;
      const iso = w2i(wx, wy);
      const sx = iso.x - camIso.x + W / 2;
      const sy = iso.y - camIso.y + H / 2 - 20;   // 활 높이(사수 가슴께)
      if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;   // 시야 밖은 자연히 스킵
      const i0 = w2i(a.x0, a.y0), i1 = w2i(a.x1, a.y1);
      const ang = Math.atan2(i1.y - i0.y, i1.x - i0.x);   // 화면(아이소 투영) 진행 방향
      ctx.save();
      ctx.globalAlpha = k > 1 ? Math.max(0, 1 - (k - 1) / 0.2) : 1;
      ctx.translate(sx, sy); ctx.rotate(ang);
      ctx.strokeStyle = '#5a4426'; ctx.lineWidth = 2;                     // 화살대(갈색)
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(4, 0); ctx.stroke();
      ctx.fillStyle = '#3a2f1c';                                          // 삼각촉
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(3, -2.4); ctx.lineTo(3, 2.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d8cfae';                                          // 살깃
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12.5, -2.2); ctx.lineTo(-12.5, 2.2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // 14.51 + 14.53-e: 건축 모드 overlay — building 형태별 outline
  function drawBuildOverlay() {
    if (!buildMode || !hoverBuildingId || placementMode) return;
    let b = null, ox = 0, oy = 0;
    for (const c of conns.values()) {
      b = c.buildings.get(hoverBuildingId);
      if (b) { ox = c.meta?.worldOffsetX||0; oy = c.meta?.worldOffsetY||0; break; }
    }
    if (!b) return;
    // 14.53-e fix: wall/door b.x,b.y = cell 좌상단 좌표 (다른 건축물은 cell center).
    // outline은 cell center 기준으로 그리므로 wall/door는 +16 보정.
    const isEdge = (b.type === 'wall' || b.type === 'door');
    const wx = ox + b.x + (isEdge ? 16 : 0);
    const wy = oy + b.y + (isEdge ? 16 : 0);
    const iso = w2i(wx, wy);
    const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
    const sx = iso.x - myIso.x + W/2;
    // 14.53-h fix: floor 보정은 FLOOR_HEIGHT(64) — 옛 *32는 절반만 올라감
    const sy = iso.y - myIso.y + H/2 - (b.floor || 0) * FLOOR_HEIGHT;
    const t = (Date.now() % 800) / 800;
    const glow = 0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI));
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(240,198,116,${0.5 + glow * 0.5})`;
    ctx.fillStyle = `rgba(240,198,116,${0.08 + glow * 0.1})`;

    const H_FLOOR = 64; // 벽/문 높이
    const HALF = 16;    // cell 반쪽 (iso 좌표 단위 — TS/2)
    // iso 변환 helper (local cell offset → screen)
    const o2s = (dx, dy, dz = 0) => ({ x: sx + (dx - dy), y: sy + (dx + dy) * 0.5 - dz });

    if (b.type === 'wall' || b.type === 'door') {
      // wall edge: side 'N' = cell 북쪽 변 (y- 쪽), 'E' = 동쪽 변 (x+ 쪽). 세로 박스.
      const side = b.data?.side || 'N';
      const h = H_FLOOR;
      // edge endpoint 두 개 (cell 모서리). N: (-HALF, -HALF) ~ (HALF, -HALF). E: (HALF, -HALF) ~ (HALF, HALF).
      let p1, p2;
      if (side === 'N') { p1 = { dx: -HALF, dy: -HALF }; p2 = { dx: HALF, dy: -HALF }; }
      else              { p1 = { dx: HALF,  dy: -HALF }; p2 = { dx: HALF, dy: HALF }; }
      // 4 corner (top + bottom)
      const a_top = o2s(p1.dx, p1.dy, h);
      const b_top = o2s(p2.dx, p2.dy, h);
      const a_bot = o2s(p1.dx, p1.dy, 0);
      const b_bot = o2s(p2.dx, p2.dy, 0);
      ctx.beginPath();
      ctx.moveTo(a_top.x, a_top.y);
      ctx.lineTo(b_top.x, b_top.y);
      ctx.lineTo(b_bot.x, b_bot.y);
      ctx.lineTo(a_bot.x, a_bot.y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (b.type === 'fence') {
      // cell 전체, 절반 높이
      const h = H_FLOOR * 0.5;
      const tl = o2s(-HALF, -HALF, h);
      const tr = o2s( HALF, -HALF, h);
      const br = o2s( HALF,  HALF, h);
      const bl = o2s(-HALF,  HALF, h);
      const tlB = o2s(-HALF, -HALF, 0);
      const trB = o2s( HALF, -HALF, 0);
      const brB = o2s( HALF,  HALF, 0);
      const blB = o2s(-HALF,  HALF, 0);
      // top
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // bottom
      ctx.beginPath();
      ctx.moveTo(tlB.x, tlB.y); ctx.lineTo(trB.x, trB.y);
      ctx.lineTo(brB.x, brB.y); ctx.lineTo(blB.x, blB.y); ctx.closePath();
      ctx.stroke();
      // vertical edges
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tlB.x, tlB.y);
      ctx.moveTo(tr.x, tr.y); ctx.lineTo(trB.x, trB.y);
      ctx.moveTo(br.x, br.y); ctx.lineTo(brB.x, brB.y);
      ctx.moveTo(bl.x, bl.y); ctx.lineTo(blB.x, blB.y);
      ctx.stroke();
    } else if (b.type === 'floor') {
      // cell 평면 다이아몬드 (얇은 floor)
      ctx.beginPath();
      ctx.moveTo(o2s(-HALF, -HALF).x, o2s(-HALF, -HALF).y);
      ctx.lineTo(o2s( HALF, -HALF).x, o2s( HALF, -HALF).y);
      ctx.lineTo(o2s( HALF,  HALF).x, o2s( HALF,  HALF).y);
      ctx.lineTo(o2s(-HALF,  HALF).x, o2s(-HALF,  HALF).y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (b.type === 'stair') {
      // 14.54-c: 3×1×2 박스 (3 cell long × 1 cell wide × 2 floor tall) + auto floor 1 cell 박스
      const dir = b.data?.dir || 'N';
      const dv = (dir === 'E') ? { x: 1, y: 0 } : (dir === 'W') ? { x: -1, y: 0 }
               : (dir === 'S') ? { x: 0, y: 1 } : { x: 0, y: -1 };
      // dir 수직 (cell width)
      const pv = { x: -dv.y, y: dv.x };
      // 박스 8 corner. cell 0 중심 = (0,0). cell 0 시작 = dv * -16, cell 2 끝 = dv * (2*32 + 16) = dv * 80.
      // perpendicular: ±16
      const start = -16;    // dir 축 시작
      const end = 80;       // dir 축 끝 (cell 2 끝)
      const half = HALF;    // perp ±
      const zBot = 0, zTop = H_FLOOR; // 14.54-c2: 1 floor 높이
      // 8 corner: [near/far][left/right][bot/top]
      const c = (along, perp, z) => o2s(dv.x * along + pv.x * perp, dv.y * along + pv.y * perp, z);
      const ftl = c(end,   -half, zTop);
      const ftr = c(end,    half, zTop);
      const fbl = c(end,   -half, zBot);
      const fbr = c(end,    half, zBot);
      const ntl = c(start, -half, zTop);
      const ntr = c(start,  half, zTop);
      const nbl = c(start, -half, zBot);
      const nbr = c(start,  half, zBot);
      // top face
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(ntr.x, ntr.y);
      ctx.lineTo(ftr.x, ftr.y); ctx.lineTo(ftl.x, ftl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // bottom face (윤곽만)
      ctx.beginPath();
      ctx.moveTo(nbl.x, nbl.y); ctx.lineTo(nbr.x, nbr.y);
      ctx.lineTo(fbr.x, fbr.y); ctx.lineTo(fbl.x, fbl.y); ctx.closePath();
      ctx.stroke();
      // 4 vertical edges
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(nbl.x, nbl.y);
      ctx.moveTo(ntr.x, ntr.y); ctx.lineTo(nbr.x, nbr.y);
      ctx.moveTo(ftl.x, ftl.y); ctx.lineTo(fbl.x, fbl.y);
      ctx.moveTo(ftr.x, ftr.y); ctx.lineTo(fbr.x, fbr.y);
      ctx.stroke();
      // ramp 사선 — cell 0(near) 아래에서 cell 2(far) 위로 올라감
      ctx.beginPath();
      ctx.moveTo(nbl.x, nbl.y); ctx.lineTo(ftl.x, ftl.y);
      ctx.moveTo(nbr.x, nbr.y); ctx.lineTo(ftr.x, ftr.y);
      ctx.stroke();
      // auto floor (cell 3, floor+1) — z=H_FLOOR 평면에 cell 다이아몬드 (floor 일반과 동일)
      const autoFloorId = b.data?._autoFloorId;
      if (autoFloorId) {
        const fStart = 80, fEnd = 80 + 32;
        const af_a = c(fStart, -half, H_FLOOR);
        const af_b = c(fEnd,   -half, H_FLOOR);
        const af_c = c(fEnd,    half, H_FLOOR);
        const af_d = c(fStart,  half, H_FLOOR);
        ctx.beginPath();
        ctx.moveTo(af_a.x, af_a.y); ctx.lineTo(af_b.x, af_b.y);
        ctx.lineTo(af_c.x, af_c.y); ctx.lineTo(af_d.x, af_d.y); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    } else {
      // chest/campfire/farmland 등 — cell 정사각 wireframe (3D 박스)
      const h = 24;
      const tl = o2s(-HALF, -HALF, h);
      const tr = o2s( HALF, -HALF, h);
      const br = o2s( HALF,  HALF, h);
      const bl = o2s(-HALF,  HALF, h);
      const tlB = o2s(-HALF, -HALF, 0);
      const trB = o2s( HALF, -HALF, 0);
      const brB = o2s( HALF,  HALF, 0);
      const blB = o2s(-HALF,  HALF, 0);
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tlB.x, tlB.y); ctx.lineTo(trB.x, trB.y);
      ctx.lineTo(brB.x, brB.y); ctx.lineTo(blB.x, blB.y); ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tlB.x, tlB.y);
      ctx.moveTo(tr.x, tr.y); ctx.lineTo(trB.x, trB.y);
      ctx.moveTo(br.x, br.y); ctx.lineTo(brB.x, brB.y);
      ctx.moveTo(bl.x, bl.y); ctx.lineTo(blB.x, blB.y);
      ctx.stroke();
    }
    // 라벨 (cycle 가능하면 [n/total] 표시)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const label = (ITEM_LABEL['item_' + b.type] || b.type);
    const cycleHint = hoverList.length > 1 ? ` [${hoverIndex+1}/${hoverList.length}] 휠로 변경` : '';
    ctx.fillText(`🔧 ${label} 분해 (클릭, 3초)${cycleHint}`, sx, sy - 60);
    ctx.restore();
  }
  // 14.54-d: 배치 사전 체크 — 빨간 ghost 표시용
  function isPlacementBlocked(itemType, cx, cy, dir) {
    const floorN = myFloor || 0;
    // 1) 다른 사람 사유지 안인지
    const cellWx = cx * 32 + 16, cellWy = cy * 32 + 16;
    for (const c of conns.values()) {
      for (const cl of c.claims ? c.claims.values() : []) {
        if (cl.ownerPid && myPid && cl.ownerPid !== myPid &&
            cellWx >= cl.x && cellWx < cl.x + cl.w &&
            cellWy >= cl.y && cellWy < cl.y + cl.h) {
          return true;
        }
      }
    }
    // 2) 같은 cell 같은 floor에 다른 건축물 있는지
    if (itemType === 'item_wall' || itemType === 'item_door') {
      // wall/door는 edge — 정규화된 edge에 wall/door 있는지
      let useCx = cx, useCy = cy, useSide = 'N';
      if      (dir === 'N') { useCx = cx; useCy = cy;     useSide = 'N'; }
      else if (dir === 'S') { useCx = cx; useCy = cy + 1; useSide = 'N'; }
      else if (dir === 'E') { useCx = cx; useCy = cy;     useSide = 'E'; }
      else if (dir === 'W') { useCx = cx - 1; useCy = cy; useSide = 'E'; }
      for (const c of conns.values()) {
        const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
        for (const b of c.buildings.values()) {
          if ((b.type !== 'wall' && b.type !== 'door') || (b.floor || 0) !== floorN) continue;
          const bCx = Math.floor((b.x - ox) / 32);
          const bCy = Math.floor((b.y - oy) / 32);
          if (bCx === useCx && bCy === useCy && b.data?.side === useSide) return true;
        }
      }
    } else {
      // 일반: 해당 cell에 다른 building 있나
      for (const c of conns.values()) {
        const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
        for (const b of c.buildings.values()) {
          if ((b.floor || 0) !== floorN) continue;
          if (b.type === 'wall' || b.type === 'door') continue;
          const bCx = Math.floor((b.x - ox) / 32);
          const bCy = Math.floor((b.y - oy) / 32);
          if (bCx === cx && bCy === cy) return true;
        }
      }
      // stair: cell 3 (auto floor 자리, floor+1)에도 충돌 검사
      if (itemType === 'item_stair') {
        const dv = (dir === 'W') ? { x: -1, y: 0 } : { x: 0, y: -1 };
        const acx = cx + dv.x * 3;
        const acy = cy + dv.y * 3;
        for (const c of conns.values()) {
          const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
          for (const b of c.buildings.values()) {
            if ((b.floor || 0) !== floorN + 1) continue;
            if (b.type === 'wall' || b.type === 'door') continue;
            const bCx = Math.floor((b.x - ox) / 32);
            const bCy = Math.floor((b.y - oy) / 32);
            if (bCx === acx && bCy === acy) return true;
          }
        }
      }
    }
    return false;
  }
  // 14.53-i: placement ghost — 마우스 위치에 실루엣 미리보기
  function drawPlacementGhost() {
    if (!placementMode) return;
    if (placementMode.special) {
      // ★움집터(6×4)·길드 곳간(5×3) 발자국 윤곽 고스트 — 커서 셀 기준(서버 좌표 규약 동형)
      const wx0 = placementCursor.wx, wy0 = placementCursor.wy;
      const ccx = Math.floor(wx0 / 32), ccy = Math.floor(wy0 / 32);
      const psite = placementMode.special === 'psite';
      const hut = placementMode.special === 'hut_site' || psite;   // ★[11차 T4] 의뢰 집도 같은 6×4 움집 발자국(실체 동일)
      const kiln = placementMode.special === 'kiln_site';          // ★숯가마도 같은 2×2 계약
      const furn = placementMode.special === 'furnace_site' || kiln;   // ★노 2×2 발자국(재민 확정 — 사유지 안)
      // ★의뢰 집터의 발자국 규약은 **마을 정본**([cx-5..cx+0]×[cy-5..cy-2], 서버 lifeRequestPlayerSite와 동일)
      const fx0 = furn ? ccx : (psite ? ccx - 5 : (hut ? ccx - 3 : ccx - 2)), fy0 = furn ? ccy : (psite ? ccy - 5 : (hut ? ccy - 2 : ccy - 1));
      const fx1 = furn ? ccx + 1 : (psite ? ccx + 0 : (hut ? ccx + 2 : ccx + 2)), fy1 = furn ? ccy + 1 : (psite ? ccy - 2 : (hut ? ccy + 1 : ccy + 1));   // ★노 2×2 = 서버 tryFurnaceStart 규약 동형
      const myIso0 = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const pt = (cx2, cy2) => { const i = w2i(cx2 * 32, cy2 * 32); return { x: i.x - myIso0.x + W / 2, y: i.y - myIso0.y + H / 2 - (myFloor || 0) * FLOOR_HEIGHT }; };
      const p1 = pt(fx0, fy0), p2 = pt(fx1 + 1, fy0), p3 = pt(fx1 + 1, fy1 + 1), p4 = pt(fx0, fy1 + 1);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath();
      ctx.fillStyle = hut ? 'rgba(154,122,74,0.25)' : 'rgba(165,129,63,0.25)'; ctx.fill();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = hut ? '#c9b28a' : '#e0b060'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(kiln ? '숯가마 2×2 — 사유지 안' : (furn ? `${placementMode.kind === 'bloomery' ? '괴련로' : '노(爐)'} 2×2 — 사유지 안` : (psite ? '마을에 집 의뢰 6×4 (재료 선납)' : (hut ? '움집터 6×4 (수혈 굴착)' : '길드 곳간 5×3 (밀폐)'))), (p1.x + p3.x) / 2, p1.y - 8);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }
    if (!placementMode.itemType) return;
    const wx = placementCursor.wx, wy = placementCursor.wy;
    const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
    const dir = placementMode.dir || 'N';
    const it = placementMode.itemType;
    let cellCx, cellCy, side;
    if (it === 'item_wall' || it === 'item_door') {
      if      (dir === 'N') { cellCx = cx; cellCy = cy;     side = 'N'; }
      else if (dir === 'S') { cellCx = cx; cellCy = cy + 1; side = 'N'; }
      else if (dir === 'E') { cellCx = cx; cellCy = cy;     side = 'E'; }
      else                  { cellCx = cx - 1; cellCy = cy; side = 'E'; }
    }
    const centerCx = (it === 'item_wall' || it === 'item_door') ? (cellCx * 32 + 16) : (cx * 32 + 16);
    const centerCy = (it === 'item_wall' || it === 'item_door') ? (cellCy * 32 + 16) : (cy * 32 + 16);
    const iso = w2i(centerCx, centerCy);
    const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
    const sx = iso.x - myIso.x + W/2;
    const sy = iso.y - myIso.y + H/2 - (myFloor || 0) * FLOOR_HEIGHT;
    const HALF = 16, H_FLOOR = 64;
    const o2s = (dx, dy, dz = 0) => ({ x: sx + (dx - dy), y: sy + (dx + dy) * 0.5 - dz });
    // 14.54-d: 충돌/사유지 사전 체크. 안 되면 빨간색 ghost.
    const blocked = isPlacementBlocked(it, cx, cy, dir);
    ctx.save();
    const t = (Date.now() % 1000) / 1000;
    const a = 0.35 + 0.25 * Math.abs(Math.sin(t * Math.PI));
    if (blocked) {
      ctx.fillStyle = `rgba(220,80,80,${a})`;
      ctx.strokeStyle = `rgba(255,140,140,${a + 0.3})`;
    } else {
      ctx.fillStyle = `rgba(120,200,255,${a})`;
      ctx.strokeStyle = `rgba(180,230,255,${a + 0.3})`;
    }
    ctx.lineWidth = 2;
    if (it === 'item_wall' || it === 'item_door') {
      let p1, p2;
      if (side === 'N') { p1 = { dx: -HALF, dy: -HALF }; p2 = { dx: HALF, dy: -HALF }; }
      else              { p1 = { dx: HALF,  dy: -HALF }; p2 = { dx: HALF, dy: HALF }; }
      const a_top = o2s(p1.dx, p1.dy, H_FLOOR);
      const b_top = o2s(p2.dx, p2.dy, H_FLOOR);
      const a_bot = o2s(p1.dx, p1.dy, 0);
      const b_bot = o2s(p2.dx, p2.dy, 0);
      ctx.beginPath();
      ctx.moveTo(a_top.x, a_top.y); ctx.lineTo(b_top.x, b_top.y);
      ctx.lineTo(b_bot.x, b_bot.y); ctx.lineTo(a_bot.x, a_bot.y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (it === 'item_fence') {
      const h = H_FLOOR * 0.5;
      const tl = o2s(-HALF, -HALF, h), tr = o2s(HALF, -HALF, h);
      const br = o2s(HALF, HALF, h), bl = o2s(-HALF, HALF, h);
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (it === 'item_floor') {
      ctx.beginPath();
      ctx.moveTo(o2s(-HALF, -HALF).x, o2s(-HALF, -HALF).y);
      ctx.lineTo(o2s(HALF, -HALF).x, o2s(HALF, -HALF).y);
      ctx.lineTo(o2s(HALF, HALF).x, o2s(HALF, HALF).y);
      ctx.lineTo(o2s(-HALF, HALF).x, o2s(-HALF, HALF).y);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (it === 'item_stair') {
      // 14.54-c: stair ghost — 3×1×1 박스 + auto floor. dir = N 또는 W만.
      const dv = (dir === 'W') ? { x: -1, y: 0 } : { x: 0, y: -1 }; // N 또는 W만
      const pv = { x: -dv.y, y: dv.x };
      const cc = (along, perp, z) => o2s(dv.x * along + pv.x * perp, dv.y * along + pv.y * perp, z);
      const start = -16, end = 80, half = HALF;
      const zBot = 0, zTop = H_FLOOR;
      const ftl = cc(end, -half, zTop), ftr = cc(end, half, zTop);
      const fbl = cc(end, -half, zBot), fbr = cc(end, half, zBot);
      const ntl = cc(start, -half, zTop), ntr = cc(start, half, zTop);
      const nbl = cc(start, -half, zBot), nbr = cc(start, half, zBot);
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(ntr.x, ntr.y);
      ctx.lineTo(ftr.x, ftr.y); ctx.lineTo(ftl.x, ftl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(nbl.x, nbl.y); ctx.lineTo(nbr.x, nbr.y);
      ctx.lineTo(fbr.x, fbr.y); ctx.lineTo(fbl.x, fbl.y); ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ntl.x, ntl.y); ctx.lineTo(nbl.x, nbl.y);
      ctx.moveTo(ntr.x, ntr.y); ctx.lineTo(nbr.x, nbr.y);
      ctx.moveTo(ftl.x, ftl.y); ctx.lineTo(fbl.x, fbl.y);
      ctx.moveTo(ftr.x, ftr.y); ctx.lineTo(fbr.x, fbr.y);
      // ramp 사선 — cell 0(near) 아래 → cell 2(far) 위 (계단 올라가는 방향)
      ctx.moveTo(nbl.x, nbl.y); ctx.lineTo(ftl.x, ftl.y);
      ctx.moveTo(nbr.x, nbr.y); ctx.lineTo(ftr.x, ftr.y);
      ctx.stroke();
      // auto floor (cell 3, floor+1) — z=H_FLOOR 평면 다이아몬드 (floor 일반과 동일)
      const fStart = 80, fEnd = 80 + 32;
      const af_a = cc(fStart, -half, H_FLOOR);
      const af_b = cc(fEnd,   -half, H_FLOOR);
      const af_c = cc(fEnd,    half, H_FLOOR);
      const af_d = cc(fStart,  half, H_FLOOR);
      ctx.beginPath();
      ctx.moveTo(af_a.x, af_a.y); ctx.lineTo(af_b.x, af_b.y);
      ctx.lineTo(af_c.x, af_c.y); ctx.lineTo(af_d.x, af_d.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      const h = 24;
      const tl = o2s(-HALF, -HALF, h), tr = o2s(HALF, -HALF, h);
      const br = o2s(HALF, HALF, h), bl = o2s(-HALF, HALF, h);
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${ITEM_LABEL[it] || it} (${dir}) · 휠=회전 · 좌클릭=배치`, sx, sy - 60);
    ctx.restore();
  }
  // 14.51: 3초 progress bar (DOM overlay)
  function ensureBuildProgressEl() {
    let el = document.getElementById('buildProgress');
    if (!el) {
      el = document.createElement('div');
      el.id = 'buildProgress';
      el.style.cssText = 'position:fixed;left:50%;top:60%;transform:translate(-50%,-50%);background:rgba(20,25,30,0.92);color:#fff;padding:10px 20px;border-radius:8px;border:2px solid #f0c674;z-index:9999;display:none;font-size:14px;pointer-events:none;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.4)';
      el.innerHTML = '<div class="bp-text" style="margin-bottom:6px;font-weight:bold">작업 중...</div><div style="width:240px;height:10px;background:#333;border-radius:5px;overflow:hidden"><div class="bp-fill" style="height:100%;background:linear-gradient(90deg,#f0c674,#ffd88a);width:0%"></div></div>';
      document.body.appendChild(el);
    }
    return el;
  }
  function updateBuildProgressEl() {
    const el = ensureBuildProgressEl();
    if (!buildAction) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const elapsed = performance.now() - buildAction.startedAt;
    const pct = Math.min(100, (elapsed / buildAction.durationMs) * 100);
    el.querySelector('.bp-fill').style.width = pct.toFixed(1) + '%';
    el.querySelector('.bp-text').textContent = buildAction.kind === 'place' ? '🏗️ 배치 중... (이동 시 취소)' : '🔧 분해 중... (이동 시 취소)';
  }

  // === Primary WS가 죽으면 자동 재연결 (predicted 위치 그대로) ===
  function ensurePrimaryConnection() {
    if (kicked) return;
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (c && c.ws.readyState <= 1) return;
    const pm = zonesMeta[primaryZoneId];
    if (!pm) return;
    // ★유령 클라 fix: 옛 소켓을 확실히 닫고 지운다(닫지 않고 지우면 잔여 메시지가 새 conn으로 샌다).
    if (c) { try { c.ws.close(); } catch (e) {} conns.delete(primaryZoneId); }
    // 재연결 = 서버가 새 pid로 스폰(좌표 인자는 서버가 쓰지 않음) → 옛 pid는 즉시 폐기하고
    // 위치는 welcome 앵커만을 정본으로 삼는다.
    myPid = null;
    _selfGone = true;
    const localX = myAbsPredicted.x - pm.worldOffsetX;
    const localY = myAbsPredicted.y - (pm.worldOffsetY || 0);
    console.warn('[recover] primary 재연결', primaryZoneId);
    connect(primaryZoneId, 'primary', { x: localX, y: localY, inventory });
  }

  // === 경계에서 멈춤 감지 → 강제 핸드오프 ===
  // 진짜 stuck인 경우에만 (서버 핸드오프 메시지 손실 같은 케이스)
  // 핸드오프 직후 1.5초간은 비활성 (정상 cooldown)
  let lastTickWithMyPidAt = 0;
  let initialWelcomeReceived = false;
  let worldWidth = 2048;
  let worldHeight = 2048;
  let lastRttMs = 0;
  // 부드러운 서버 보정 — snap 대신 150ms에 걸쳐 lerp
  let correctionVel = { x: 0, y: 0 };
  let correctionUntil = 0;
  let correctionIgnoreWall = false; // 벽 사이 갈림 보정 — 벽 무시하고 부드럽게 슬라이드(권위 위치는 항상 유효)
  // kicked 상태에선 자동 재연결 안 함
  let kicked = false;
  // loop/setupChat 중복 시작 방지
  let loopStarted = false;
  let chatSetup = false;

  // === 서버 권위 좌표 → 클라 예측 리컨실리에이션 (input replay) ===
  // Gabriel Gambetta 모델: 서버 권위 self pos + ackSeq 받으면
  //   1) myAbsPredicted 를 권위 위치에 anchor
  //   2) ack 된(seq <= ackSeq) 입력은 pendingInputs 에서 drop
  //   3) 남은 미ack 입력을 predictStep 으로 replay → 드리프트 없이 재현된 예측 위치
  // predictStep 이 서버 per-tick move 와 동일하므로 replay 결과 == 서버가 곧 도달할 위치.
  // 매 tick anchor+replay 라 어긋남이 누적되지 않음 → 벽에서 스턱/슬립 없음.
  // 옛 correctionVel/Until/IgnoreWall lerp 머신은 리컨실리에이션이 완전 대체 — 항상 0/false 로 비워둠.
  function applyServerCorrection(absX, absY, ackSeq) {
    const ex = absX - myAbsPredicted.x, ey = absY - myAbsPredicted.y;
    const dist = Math.hypot(ex, ey);
    // === 러버밴딩 계측 (기본 OFF — window._desyncDbg=true로 켬) ===
    if (dist > 48 && window._desyncDbg === true) {
      const wallBetween = clientIsBlockedByWall(absX, absY, myAbsPredicted.x, myAbsPredicted.y, myFloor);
      const pc = clCellOf(myAbsPredicted.x, myAbsPredicted.y);
      const sc = clCellOf(absX, absY);
      const stair = clFindStairForCell(pc.cx, pc.cy) ? 1 : 0;
      console.log(`[desync] dist=${dist.toFixed(0)} pred=${pc.cx},${pc.cy}(${myAbsPredicted.x.toFixed(0)},${myAbsPredicted.y.toFixed(0)}) srv=${sc.cx},${sc.cy} f${myFloor} stairCell=${stair} wallBetween=${wallBetween?1:0}`);
    }
    // lerp 머신은 항상 비활성 (리컨실리에이션이 대체)
    correctionVel = { x: 0, y: 0 };
    correctionUntil = 0;
    correctionIgnoreWall = false;
    const ack = (typeof ackSeq === 'number') ? ackSeq : 0;
    // Edge guard: 권위와의 차이가 거대(존 핸드오프/텔포)면 replay 하지 않고 즉시 snap + 입력 비움.
    if (dist > 2000) {
      myAbsPredicted = { x: absX, y: absY };
      pendingInputs.length = 0;
      // 텔포 — 렌더 보간 앵커도 즉시 권위로 (카메라가 텔포 구간을 lerp 하지 않게)
      _renderPrev = { x: absX, y: absY };
      _renderCurr = { x: absX, y: absY };
      myAbsRender = { x: absX, y: absY };
      _predAccum = 0;
      return;
    }
    // 1) 권위에 anchor
    myAbsPredicted = { x: absX, y: absY };
    // 2) ack 된 입력 drop
    while (pendingInputs.length && pendingInputs[0].seq <= ack) pendingInputs.shift();
    // 3) 남은 미ack 입력 replay (각 입력의 sprint 상태로 — 속도 재현)
    for (const ip of pendingInputs) predictStep(PRED_STEP, ip.wx, ip.wy, ip.sprint);
  }

  // === Orphan 감지 — 서버에서 내 플레이어가 사라졌는데 클라는 모르는 경우 ===
  // 2초간 내 pid가 tick에 안 들어오면 primary 재연결
  function checkOrphan() {
    if (!primaryZoneId || lastTickWithMyPidAt === 0) return;
    if (performance.now() - lastTickWithMyPidAt > 2000) {
      console.warn('[recover] 내 pid가 2초간 tick에 없음 - primary 재연결');
      // ★유령 클라 fix: 서버에 내 실체가 없다고 판정된 순간부터 예측 정지 + pid 폐기.
      //   (옛 코드는 재연결 동안에도 옛 좌표로 계속 전진해서 welcome 앵커와 실좌표 괴리가 커졌다.)
      _selfGone = true;
      myPid = null;
      pendingInputs.length = 0;
      _predAccum = 0;
      lastTickWithMyPidAt = 0; // 0으로 리셋 — 재연결 WS가 첫 틱 받을 때까지 orphan 검사 비활성. now()로 두면 느린 연결(사파리/Private Relay)에서 establishing 중인 WS를 2초마다 죽여 무한루프가 됨.
      if (conns.has(primaryZoneId)) closeConnection(primaryZoneId);
      // ensurePrimaryConnection이 다음 프레임에 재연결
    }
  }
  // checkStuckAtEdge 제거됨 — 서버 권위 + HTTP 핸드오프로 신뢰성 확보

  // === 렌더링 (아이소메트릭) ===
  function render() {
    if (!primaryZoneId) return;
    const pConn = conns.get(primaryZoneId);
    if (!pConn || !pConn.meta) return;
    // 14.51: 진행 중 build/dismantle 작업 갱신 (3초 timer)
    updateBuildAction();

    // 카메라/본인 스프라이트는 보간 위치(myAbsRender)를 사용 → 30Hz 예측을 60fps로 부드럽게.
    // (충돌/로직은 계속 myAbsPredicted 사용 — render 좌표만 보간.)
    let _camAbs = (_renderReady ? myAbsRender : myAbsPredicted);
    // §4-4 P4: 전투 관전 카메라(랩 focusCameraOnBattle 정합·0.6s smoothstep). active=전투 focus 유지, returning=본체 복귀 트윈.
    if (_warSpec.active && _warSpec.to && _warSpec.from) {
      const k = Math.min(1, (performance.now() - _warSpec.t0) / _warSpec.dur), s = k * k * (3 - 2 * k);
      _camAbs = { x: _warSpec.from.x + (_warSpec.to.x - _warSpec.from.x) * s, y: _warSpec.from.y + (_warSpec.to.y - _warSpec.from.y) * s };
    } else if (_warSpec.returning && _warSpec.from) {
      const k = Math.min(1, (performance.now() - _warSpec.t0) / _warSpec.dur), s = k * k * (3 - 2 * k);
      _camAbs = { x: _warSpec.from.x + (_camAbs.x - _warSpec.from.x) * s, y: _warSpec.from.y + (_camAbs.y - _warSpec.from.y) * s };
      if (k >= 1) _warSpec.returning = false;
    }
    _lastCamAbs = { x: _camAbs.x, y: _camAbs.y };   // 트윈 출발점 캡처(관전 진입/복귀 공용)
    // §19 4파: 뷰(카메라) 경도 오프셋 갱신 — 존 폭 대비 0~4.5%(하루 비율). worldPhase()가 로컬 태양시로 소비.
    { const _lz = clientFindZoneAt(_camAbs.x, _camAbs.y); _lonView = _lz ? ((_camAbs.x - _lz.worldOffsetX) / Math.max(1, _lz.zoneWidth)) * 0.045 : 0; }
    const myIso = w2i(_camAbs.x, _camAbs.y);
    const camX = myIso.x, camY = myIso.y;
    const toScreen = (ix, iy) => ({ x: ix - camX + W / 2, y: iy - camY + H / 2 });

    // 배경 — 검정 (시야 밖)
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, W, H);

    const TS = pConn.meta.tileSize;
    // 타일/엔티티 컬링 중심도 카메라(보간) 위치 기준 → 화면 중심과 일치.
    const worldCx = _camAbs.x, worldCy = _camAbs.y;
    const VIEW_RADIUS = 650;
    // 14.49-e6e: 타일은 화면 전체 덮는 더 큰 범위로 그림 (1500px).
    // 그래야 vignette 가장자리가 셀 stairstep 안 보임 (타일 없는 빈 영역의 boundary가 hard edge).
    const TILE_RENDER_RADIUS = 1500;

    // === 1) 지면 다이아몬드 타일 ===
    const t0WX = Math.floor((worldCx - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WX = Math.ceil((worldCx + TILE_RENDER_RADIUS) / TS) * TS;
    const t0WY = Math.floor((worldCy - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WY = Math.ceil((worldCy + TILE_RENDER_RADIUS) / TS) * TS;

    const _tlT0 = performance.now();
    const _zlist = Object.values(zonesMeta);   // hoist — 타일마다 배열 재할당하던 것 제거 (GC 폭주 원인)
    const _halfTS = TS / 2;
    // ★★[배치 19 실장 A] 지면은 **정적**이다 — iso 512×256 타일로 구워 두고 drawImage 만 한다.
    //   종전엔 프레임마다 셀 다이아몬드 ~9,000장을 칠했다(반경 1,500px). 이제 화면을 덮는
    //   타일 ~30장의 blit 이고, 굽는 비용은 그 타일을 처음 볼 때 한 번만 든다.
    //   텍스처가 아직 안 왔거나 legacy 손잡이면 **종전 경로**로 그대로 떨어진다(무회귀).
    const _LEG = !!_t19.legacy || _gtexReady < 3;
    // 손잡이가 바뀌면 구워 둔 타일은 옛 문법이다 — 버린다(A/B 가 같은 프레임에서 성립하려면 필수)
    // ★[배치 21 10차] 물가 여백도 **타일에 굳는다** — 지문에 같이 넣는다. 지문이 두 군데면
    //   서로의 캐시를 지우며 매 프레임 다시 굽는다(합칠 때 실제로 그럴 뻔했다).
    //   ★`waterOff` 도 지문에 들어간다 — **굽는 그림이 바뀌기 때문**이다(물 셀이 진흙↔단색으로 갈린다).
    //     빠져 있어서 물을 껐다 켜도 옛 타일이 그대로 남았다. 풀 카펫 항등식 판정이 이걸 잡았다
    //     (강가만 평균 |Δ| 6.18 · 12.6% 어긋남 — 초원은 0.395 였다).
    { const _kf = (_LEG ? 'L' : '') + (_t19.stateOff ? 'S' : '') + (_t19.wxOff ? 'W' : '')
                + (_t19.waterOff ? 'o' : '') + ((_t19.windOff || _t19.windGrassOff) ? 'g' : 'G')
                + 'm' + (_t19.shMarginOff ? 'x' : (_t19.shMargin == null ? 1 : _t19.shMargin));
      if (_gtKnob !== _kf) { _gtKnob = _kf; _groundTiles.clear(); _shMarginN = 0; } }
    if (!_LEG) _waterInit();   // ★타일을 굽기 **전에** 물 가능 여부를 확정한다(진흙/단색 갈림이 타일에 굳는다)
    window.__groundDbg = { legacy: _LEG, tex: _gtexReady, texNames: Object.keys(GTEX).filter(k => GTEX[k] && GTEX[k].naturalWidth), tiles: 0, baked: 0, cached: _groundTiles.size, stateCells: 0 };
    { // ★[배치 20 B] 타일 상태 계측·주입 — 하네스는 서버 방송과 **같은 입구**(_tsIngest)로만 들어온다.
      const _c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      window.__tileStateDbg = {
        off: !!_t19.stateOff, sb: (typeof SoilBase !== 'undefined'),
        soilCells: _c && _c.soil ? _c.soil.size : -1,
        roadCells: _c && _c.roads ? _c.roads.size : -1,
        farmCells: _farmCells ? _farmCells.size : -1,
        wxActive: (_c && _c.simVillages) ? _c.simVillages.filter((v) => v.wx).length : -1,
        q: TS_SOIL_Q,
      };
      window.__tileStateFeed = (flat) => { const n = _tsIngest(_c, flat || []); needsRedraw = true; return n; };
      // ★[날씨 축] 방송과 **같은 입구**. wxMap = { 마을id → [이름, fertility계수] | null }
      window.__wxFeed = (m) => { const n = _wxIngest(_c, m || {}); needsRedraw = true; return n; };
      window.__wxDbg = () => {
        if (!_c || !_c.simVillages) return null;
        const on = _c.simVillages.filter((v) => v.wx);
        return { off: !!_t19.wxOff, villages: _c.simVillages.length, active: on.length,
                 sample: on.slice(0, 4).map((v) => ({ id: v.id, name: v.name, cx: v.cx, cy: v.cy, wx: v.wx, R: Math.round(_wxRadiusPx(v)) })),
                 nearest: _c.simVillages.map((v) => ({ id: v.id, name: v.name, cx: v.cx, cy: v.cy, R: Math.round(_wxRadiusPx(v)),
                   d: Math.round(Math.hypot((_c.meta.worldOffsetX + v.cx * CL_BUILDING_SIZE) - _camAbs.x, ((_c.meta.worldOffsetY || 0) + v.cy * CL_BUILDING_SIZE) - _camAbs.y)) }))
                   .sort((a, b) => a.d - b.d).slice(0, 3) };
      };
      // 답압(길)도 방송과 **같은 입구**로 넣는다 — 하네스가 우회로를 쓰지 않게.
      window.__roadFeed = (flat) => {
        if (!_c) return 0;
        if (!_c.roads) _c.roads = new Map();
        for (let i = 0; i + 2 < flat.length; i += 3) {
          const k = flat[i] + ',' + flat[i + 1];
          if (flat[i + 2]) _c.roads.set(k, flat[i + 2]); else _c.roads.delete(k);
        }
        _gtInvalidateCells(_c, flat, 3); needsRedraw = true; return flat.length / 3;
      };
      // ★셀 → 화면 좌표. 하네스가 투영 수학을 **다시 쓰지 않게**(사본이면 둘이 같이 틀린다).
      window.__cellScreen = (lcx, lcy) => {
        if (!_c || !_c.meta) return null;
        const wx = _c.meta.worldOffsetX + lcx * 32 + 16, wy = (_c.meta.worldOffsetY || 0) + lcy * 32 + 16;
        const iso = w2i(wx, wy);
        return { x: iso.x - camX + W / 2, y: iso.y - camY + H / 2 };
      };
      window.__camCellLocal = () => {
        if (!_c || !_c.meta) return null;
        return [Math.floor((_camAbs.x - _c.meta.worldOffsetX) / 32), Math.floor((_camAbs.y - (_c.meta.worldOffsetY || 0)) / 32)];
      };
      window.__tileStateAt = (lcx, lcy) => {
        if (!_c || !_c.meta) return null;
        const rec = _c.soil ? _c.soil.get(lcx + ',' + lcy) : null;
        const wx = _c.meta.worldOffsetX + lcx * 32 + 16, wy = (_c.meta.worldOffsetY || 0) + lcy * 32 + 16;
        const kind = isWaterAtAbs(wx, wy) ? 'water' : (isRockAtAbs(wx, wy) ? 'rock' : 'land');
        return { kind, soil: _tsSoil(lcx, lcy, kind, rec), base: (typeof SoilBase !== 'undefined' ? SoilBase.baseAt(kind, lcx, lcy) : null),
                 geo: rec ? rec.geo : 0, ore: rec ? rec.ore : 15, road: _c.roads ? (_c.roads.get(lcx + ',' + lcy) || 0) : 0,
                 dyn: !!rec, tiles: _groundTiles.size };
      };
    }
    if (!_LEG) {
      const isoX0 = camX - W / 2, isoY0 = camY - H / 2;
      const t0x = Math.floor(isoX0 / GT_W), t1x = Math.floor((isoX0 + W) / GT_W);
      const t0y = Math.floor(isoY0 / GT_H), t1y = Math.floor((isoY0 + H) / GT_H);
      const _fr = (window._tileFrames || 0);
      let baked = 0, drawn = 0, nStrip = 0;
      //   바람 세기·시각은 자연물과 **같은 정본**을 쓴다(_windAt/_windT) — 날씨 훅도 같이 먹는다.
      const _gwT = _windT() * GT_WAVE_W;
      const _gw = (_t19.windOff || _t19.windGrassOff) ? 0 : _windAt(_windT()) * GT_GRASS_AMP;
      for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
        const key = tx + '_' + ty;
        let ent = _groundTiles.get(key);
        if (!ent) {
          if (baked >= GT_BAKE_PER_FRAME) continue;   // 굽기 예산 초과 — 다음 프레임에(그 자리는 배경색)
          ent = _bakeGroundTile(tx, ty, _zlist); _groundTiles.set(key, ent); baked++;
        }
        ent.used = _fr;
        const _dx = Math.round(tx * GT_W - camX + W / 2), _dy = Math.round(ty * GT_H - camY + H / 2);
        ctx.drawImage(ent.cv, _dx, _dy);
        // ★★풀 카펫 흔들림 — 잎 층을 **가로 띠**로 어긋나게 가산 blit 한다.
        //   · 위상은 **iso 세로 좌표**(월드)로 준다 — 화면에 붙으면 카메라를 움직일 때 파도 따라온다.
        //   · 띠 16px = 타일당 16장. 실측(짝 비교) **+4.6ms/f** — 옛 주석 +0.53 은 틀렸다.
        //   · 'lighter' = 가산. 바탕이 (텍스처−평탄색)만큼 어둡게 구워져 있어 합이 원본과 같다.
        if (ent.bl && _gw > 0) {
          // ★★[렉 라운드 2026-08-09] 흔들림 비용은 **픽셀(필레이트)** 에 비례한다 —
          //   띠 높이를 16/32/64px 로 바꿔도 18.6/16.2/17.6ms 로 잡음 안이었다(짝 비교 실측).
          //   ⇒ 띠 개수를 줄이는 안(ⓐ)은 0ms 다. 줄일 건 **그리는 픽셀**뿐이다.
          //   ⇒ 화면 밖은 잘라 낸다: 타일 격자(512×256)가 캔버스를 넘어 최대 2048×1280 을
          //     그리고 1400×900 만 쓴다 — **52% 가 화면 밖**이었다.
          ctx.globalCompositeOperation = 'lighter';
          for (let sY = 0; sY < GT_H; sY += GT_STRIP) {
            const sh = Math.min(GT_STRIP, GT_H - sY);
            const isoY = ty * GT_H + sY;
            const ph = isoY * GT_WAVE_K + _gwT;
            // ★[렉 라운드 실측] 목적지가 **소수**면 캔버스가 이중선형 재샘플링을 탄다.
            //   띠 개수·픽셀 수를 바꿔도 비용이 안 변한 이유가 이것이다. 진폭이 ±2.2px 라
            //   정수로 반올림해도 파도는 그대로 읽힌다. (손잡이 __gtFrac 로 A/B 가능)
            const off = _gtFrac ? (Math.sin(ph) * _gw) : Math.round(Math.sin(ph) * _gw);
            // 화면 사각형으로 잘라 낸다(그림은 안 변한다 — 잘린 건 원래 안 보이던 픽셀이다)
            const dX = _dx + off, dY = _dy + sY;
            let sx = 0, sw = GT_W, sy = sY, sHh = sh, ddx = dX, ddy = dY;
            if (dX < 0) { sx = -dX; sw -= sx; ddx = 0; }
            if (dX + GT_W > W) sw -= (dX + GT_W - W);
            if (dY < 0) { const c = -dY; sy += c; sHh -= c; ddy = 0; }
            if (dY + sh > H) sHh -= (dY + sh - H);
            if (sw <= 0 || sHh <= 0) continue;                  // 완전히 화면 밖인 띠
            // ★밀림만으로는 '미끄러진다'로 읽힌다 — 실제 밀밭은 돌풍이 지나갈 때 **빛도 함께 훑는다**.
            //   가산 층이라 alpha 를 흔들면 그게 그대로 명암 물결이 된다(비용 0).
            ctx.globalAlpha = 0.90 + 0.10 * Math.sin(ph * 1.0 + 1.1);
            ctx.drawImage(ent.bl, sx, sy, sw, sHh, ddx, ddy, sw, sHh);
            nStrip++;
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        } else if (ent.bl) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(ent.bl, _dx, _dy);        // 무풍 — 어긋남 0. 그림은 옛것과 같아야 한다
          ctx.globalCompositeOperation = 'source-over';
        }
        drawn++;
      }
      window.__groundDbg.tiles = drawn; window.__groundDbg.baked = baked; window.__groundDbg.cached = _groundTiles.size;
      window.__groundDbg.strips = nStrip; window.__groundDbg.gwind = _gw;
      { let sc = 0; for (const e of _groundTiles.values()) sc += (e.state || 0); window.__groundDbg.stateCells = sc; }
      window.__groundDbg.margins = _shMarginN;
      const _cap = (_t19.windOff || _t19.windGrassOff) ? GT_MAX : GT_MAX_WIND;   // 잎 층이 있으면 타일당 2배
      if (_groundTiles.size > _cap) {   // 오래 안 쓴 타일부터 버린다(카메라가 멀어진 것)
        const ks = [..._groundTiles.entries()].sort((a, b) => (a[1].used || 0) - (b[1].used || 0));
        for (let i = 0; i < ks.length - _cap; i++) _groundTiles.delete(ks[i][0]);
      }
    } else {
    // ── 종전 경로(폴백·A/B 대조군): 셀 다이아몬드 단색 ─────────────────────────
    const t0WX = Math.floor((worldCx - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WX = Math.ceil((worldCx + TILE_RENDER_RADIUS) / TS) * TS;
    const t0WY = Math.floor((worldCy - TILE_RENDER_RADIUS) / TS) * TS;
    const t1WY = Math.ceil((worldCy + TILE_RENDER_RADIUS) / TS) * TS;
    for (let wx = t0WX; wx < t1WX; wx += TS) {
      for (let wy = t0WY; wy < t1WY; wy += TS) {
        const cxw = wx + _halfTS, cyw = wy + _halfTS;
        const dist = Math.hypot(cxw - worldCx, cyw - worldCy);
        if (dist > TILE_RENDER_RADIUS) continue;   // 원형 컬링 — zone 조회/그리기 전에 모서리 스킵
        const iso = w2i(cxw, cyw);
        const s = toScreen(iso.x, iso.y);
        let zMeta = null;
        for (let zi = 0; zi < _zlist.length; zi++) {
          const zm = _zlist[zi];
          const ox = zm.worldOffsetX, oy = zm.worldOffsetY || 0;
          const zW3 = zm.zoneWidth || 100000, zH3 = zm.zoneHeight || 100000;
          if (wx >= ox && wx < ox + zW3 && wy >= oy && wy < oy + zH3) { zMeta = zm; break; }
        }
        if (!zMeta) {
          const fallback = (primaryZoneId && zonesMeta[primaryZoneId]?.groundColor) || '#3a5a3a';
          drawDiamond(s.x, s.y, TS, fallback);
          continue;
        }
        const isWater = isWaterAtAbs(cxw, cyw, zMeta);
        const isRock = !isWater && isRockAtAbs(cxw, cyw, zMeta);
        let tileColor, tintColor, tintStrength;
        if (isWater) {
          tileColor = zMeta.isOcean ? zMeta.groundColor : '#2a5a8a';
          tintColor = zMeta.isOcean ? zMeta.tintColor : '#1a4a7a';
          tintStrength = 0.07;
        } else if (isRock) {
          tileColor = '#6e6356';
          tintColor = '#4a4138';
          tintStrength = 0.12;
        } else {
          tileColor = latitudeColor(cyw, worldHeight, zMeta.groundColor);
          const distFromPole = Math.min(cyw, worldHeight - cyw);
          const isIce = distFromPole <= ICE_BAND_PX;
          tintColor = isIce ? '#9bb5cc' : zMeta.tintColor;
          tintStrength = isIce ? 0.06 : 0.13;
        }
        drawDiamond(s.x, s.y, TS, blendTint(tileColor, tintColor, tintStrength));
      }
    }
    }

    // ★★[배치 20 B 계측기 수리] `_tileAcc`/`_tileFrames` 는 **하네스 전용**이다 — 아무도 중간에
    //   건드리면 안 된다. 30프레임마다 도는 `[render]` 디버그 블록이 `_tileAcc` 만 0 으로 되돌리고
    //   `_tileFrames` 는 그대로 두는 바람에, 하네스가 "리셋 → 3초 대기 → 둘 다 읽기" 를 하면
    //   **마지막 리셋 이후의 잔여분을 전체 프레임 수로 나눈 값**이 나왔다.
    //   e2e-terrain ⑥ 이 legacy 지면 0.00ms/f · 비율 ×Infinity 를 내며 이 결함을 드러냈다.
    //   ⇒ 디버그 블록은 제 몫(`_tileAccDbg`)을 따로 쌓는다. (계측기 오류 8건째 — 판정이 아니라 대본.)
    //   ⚠배치 19 보고의 지면 3.34 → 0.08ms/f 도 이 깨진 계측기로 잰 값이다. 방향(타일 blit 이
    //     셀 9,000장보다 싸다)은 맞지만 **숫자는 다시 재야 한다**.
    const _tlDt = performance.now() - _tlT0;
    window._tileAcc = (window._tileAcc||0) + _tlDt;
    window._tileAccDbg = (window._tileAccDbg||0) + _tlDt;
    window._tileFrames = (window._tileFrames||0) + 1;   // ★성능은 창 길이가 아니라 **프레임당 ms** 로 잰다

    // === 1-b) 물 레이어 (WebGL 셰이더) + 블록 프리즘 단면 ===
    //   순서가 문법이다: 지면(진흙) → **물** → 프리즘 면 → (물가 술) → 엔티티.
    //   프리즘 면이 물 뒤에 오는 이유 = 면이 물의 절단선을 덮어야 '블록'으로 읽힌다.
    const _wtT0 = performance.now();
    let _waterOn = false, _nPrism = 0, _nShore = 0;
    if (!_LEG && !_t19.waterOff) {
      // ★시간은 **게임 시계**다(프레임 시간 아님) — 같은 게임 시각이면 같은 그림이라 하네스가 재현 가능.
      // ★★그런데 `worldNow()/1000` 을 그대로 넘기면 안 된다 — 1.7e9 초다. GLSL highp float 는
      //   유효숫자 7자리라 `ADV*uT` 가 1.1e11 이 되면 **파동·노이즈 인자가 통째로 뭉개진다**
      //   (1패스 실화면: 물이 흐르지도 반짝이지도 않는 뿌연 판이었다). 기준시각을 빼서 0 부터 센다.
      if (_waterT0 === null) _waterT0 = worldNow();
      const _tSec = (_t19.freezeT != null ? _t19.freezeT : (worldNow() - _waterT0) / 1000);
      _waterOn = _drawWaterLayer(ctx, W, H, camX, camY, _tSec);
      if (_waterOn) {
        // 화면에 걸치는 셀 범위 — iso 네 모서리 역변환
        let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        for (const [ix2, iy2] of [[camX - W / 2, camY - H / 2], [camX + W / 2, camY - H / 2],
                                  [camX - W / 2, camY + H / 2], [camX + W / 2, camY + H / 2]]) {
          const wx2 = (2 * iy2 + ix2) / 2, wy2 = (2 * iy2 - ix2) / 2;
          if (wx2 < mnx) mnx = wx2; if (wx2 > mxx) mxx = wx2;
          if (wy2 < mny) mny = wy2; if (wy2 > mxy) mxy = wy2;
        }
        if (!_t19.prismOff)
          _nPrism = _drawPrisms(ctx, toScreen, Math.floor(mnx / 32) - 1, Math.floor(mny / 32) - 1,
                                Math.ceil(mxx / 32) + 1, Math.ceil(mxy / 32) + 1);
        // ★[재민 지적] 물가 풀 넘김 — 뭍의 **자기 풀 텍스처**를 물 위로 몇 px 넘겨 셀 경계의
        //   칼자국을 없앤다. 물·프리즘 **뒤**라서 물에 안 가려진다. 지면 타일과 같은 격자·같은 캐시.
        if (!_t19.shoreOff && !_LEG && _gtexReady >= 3) {
          const _sx0 = Math.floor((camX - W / 2) / GT_W), _sx1 = Math.floor((camX + W / 2) / GT_W);
          const _sy0 = Math.floor((camY - H / 2) / GT_H), _sy1 = Math.floor((camY + H / 2) / GT_H);
          for (let ty = _sy0; ty <= _sy1; ty++) for (let tx = _sx0; tx <= _sx1; tx++) {
            const k2 = tx + '_' + ty;
            let e2 = _shoreTiles.get(k2);
            if (!e2) { e2 = _bakeShoreTile(tx, ty, _zlist); _shoreTiles.set(k2, e2); }
            if (e2.cv) { ctx.drawImage(e2.cv, Math.round(tx * GT_W - camX + W / 2), Math.round(ty * GT_H - camY + H / 2)); _nShore += e2.n; }
          }
          if (_shoreTiles.size > 400) _shoreTiles.clear();
        }
      }
    }
    window._waterAcc = (window._waterAcc || 0) + (performance.now() - _wtT0);
    // 카메라 셀의 흐름 벡터 — 하네스가 "물이 **하류로** 흐르는가"를 재려면 기대 방향이 필요하다
    //   (하네스가 rivers path 를 다시 파싱하면 그게 사본이다 — 정본 계산을 그대로 물어본다).
    const _fw = _waterOn ? _flowAtCell(Math.floor(_camAbs.x / 32), Math.floor(_camAbs.y / 32)) : [0, 0];
    window.__waterDbg = { on: _waterOn, webgl: _wgl.ok, prisms: _nPrism, shore: _nShore, shoreTiles: _shoreTiles.size, flowKey: _wfCache.key,
                          segs: _riverSegs ? _riverSegs.length : 0, flowAtCam: _fw, rect: _wfCache.rect,
                          flowIso: [_fw[0] - _fw[1], (_fw[0] + _fw[1]) / 2],
                          camCell: [Math.floor(_camAbs.x / 32), Math.floor(_camAbs.y / 32)],
                          pend: window.__wfPendN || 0, askR: WF_ASK_R,
                          segGrid: _segGrid.map ? _segGrid.map.size : 0, flowCache: _flowCellCache.size,
                          buildMs: window.__wfBuildMs || 0, buildMax: window.__wfBuildMax || 0,
                          buildN: window.__wfBuildN || 0, wetReuse: window.__wfReuse || 0 };
    // ★[물가 렉 계측] 흐름 텍스처 원점을 실제 주행처럼 옮겨 가며 **정본 `_buildFlowTex` 를 그대로**
    //   호출해 장당 시간을 잰다. 계측기가 계산을 다시 쓰지 않는다(사본 금지) — 렌더러가 부르는
    //   그 함수를 부른다. 걸어서 재려면 512px 마다 8초가 걸려 A/B 를 못 돈다.
    //   step = 원점 이동(셀). 16 = 실제 주행 한 칸(겹침 87.5%) · 128 = 완전히 새 땅.
    window.__wfProbe = (n, step) => {
      const out = []; const bx = _wfCache.ox, by = _wfCache.oy;
      const keepPrev = _wfPrev.wet, keepOx = _wfPrev.ox, keepOy = _wfPrev.oy, keepKey = _wfCache.key;
      for (let i = 1; i <= n; i++) {
        window.__wfFlowMs = 0; window.__wfFlowN = 0;
        const t0 = performance.now();
        _buildFlowTex(null, bx + i * step, by + i * step);
        out.push({ ms: +(performance.now() - t0).toFixed(1), wet: +(window.__wfWetMs || 0).toFixed(1),
                   flow: +(window.__wfFlowMs || 0).toFixed(1), flowN: window.__wfFlowN || 0,
                   reuse: window.__wfReuse || 0, asked: window.__wfAsked || 0, pend: window.__wfPending || 0 });
      }
      _wfPrev.wet = keepPrev; _wfPrev.ox = keepOx; _wfPrev.oy = keepOy; _wfCache.key = keepKey;
      return out;
    };
    // ★[물가 렉 A/B] 캐시를 식혀 **처음 보는 땅**의 비용을 다시 재게 한다. 같은 길을 두 번
    //   걸어 손잡이만 바꿔 비교하려면 이게 있어야 한다(안 그러면 두 번째 주행이 캐시로 공짜다).
    window.__wfReset = () => {
      _flowCellCache.clear(); _flowCellOld.clear(); _wfPrev.wet = null; _wfCache.key = null; _wfCache.pending = false;
      _waterCellCache.clear();
      window.__wfBuildMs = 0; window.__wfBuildMax = 0; window.__wfBuildN = 0; window.__wfBuildSum = 0;
      window.__wfFirstMs = 0; window.__wfSteadyN = 0; window.__wfSteadySum = 0;
    };
    // === 2) 엔티티 수집 (depth sort용) ===
    const renderables = [];
    const renderT = performance.now() - INTERP_DELAY_MS;
    // ★[배치 20 A] 산 세그먼트 — 엔티티와 **같은 목록**에 태워 z 정렬한다(앵커 wx+wy).
    //   따로 그리면 산 뒤에 선 사람이 산 위로 뜬다.
    const _mtT0 = performance.now();
    const _nMt = _mtCollect(renderables, worldCx, worldCy);
    window._mtAcc = (window._mtAcc || 0) + (performance.now() - _mtT0);
    window.__mtDbg = { mt3d: !_t19.mt3dOff, mt3budget: MT3_BUDGET, mt3view: MT3_VIEW, mt3rockc: _mt3RockC.size, mt3chunks: _mt3Chunk.size, mt3fail: !!_mt3Fail, segs: _nMt, sprites: _mtLoaded + '/' + _mtWanted, cached: _mtSegCache.size, chunks: _mtChunk.size, legacy: !!_t19.mtLegacy, destroyed: _mtDestroyed.size };
    // ★★[배치 20 C] 산 계측·파괴 훅 — 하네스가 배치 수학을 **다시 쓰지 않게** 정본이 만든
    //   세그먼트를 그대로 내보낸다. 하네스가 능선 보행·밴드 실측을 재구현하면 그게 사본이라
    //   둘이 같이 틀려도 통과한다(자명 통과).
    window.__mtProbe = () => {
      const H = _hardTerrain; if (!H || !_mtAnchors) return null;
      const out = [];
      if (!_t19.mtLegacy) {                      // 덮개 배치 — 카메라 주변 청크의 정본 세그먼트
        const z0 = zonesMeta[primaryZoneId]; if (!z0) return out;
        const ox0 = z0.worldOffsetX, oy0 = z0.worldOffsetY || 0;
        const cc = Math.floor(worldCx / 32), rc = Math.floor(worldCy / 32);
        for (let gy = Math.floor((rc - 60) / MT_CH); gy <= Math.floor((rc + 60) / MT_CH); gy++)
          for (let gx = Math.floor((cc - 60) / MT_CH); gx <= Math.floor((cc + 60) / MT_CH); gx++)
            for (const g2 of _mtChunkSegs(primaryZoneId, gx, gy))
              out.push({ ridge: g2.tier, ri: 0, x: g2.x, y: g2.y, nm: g2.name, sc: g2.sc, vy: g2.vy,
                         lcx: Math.floor((g2.x - ox0) / 32), lcy: Math.floor((g2.y - oy0) / 32) });
        return out;
      }
      for (const zid in H) {
        const z = zonesMeta[zid]; if (!z || zid !== primaryZoneId) continue;
        const ox = z.worldOffsetX, oy = z.worldOffsetY || 0;
        const rs = H[zid].ridges || [];
        for (let ri = 0; ri < rs.length; ri++) {
          const segs = _mtPlaceRidge(zid, rs[ri], ox, oy, ri);
          for (const g2 of segs) out.push({ ridge: rs[ri].name, ri, x: g2.x, y: g2.y, nm: g2.name, sc: g2.sc,
                                            lcx: Math.floor((g2.x - ox) / 32), lcy: Math.floor((g2.y - oy) / 32) });
        }
      }
      return out;
    };
    // 파괴 이벤트의 **클라 쪽 규격** — 서버 메커니즘이 생기면 방송이 이 함수를 부르면 된다.
    //   (§A-6 실측: 서버에 바위 셀 제거 메커니즘이 아직 0건이다.)
    window.__mtDestroy = (cells) => {
      const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
      if (!c || !c.meta) return 0;
      let n2 = 0;
      for (const [lcx, lcy] of (cells || [])) {
        const wx = c.meta.worldOffsetX + lcx * 32, wy = (c.meta.worldOffsetY || 0) + lcy * 32;
        _mtDestroyed.add(primaryZoneId + '_' + Math.floor(wx / 32) + '_' + Math.floor(wy / 32)); n2++;
        _mt3RockC.delete(Math.floor(wx / 32) * 1048576 + Math.floor(wy / 32));
        { const gx0 = Math.floor(Math.floor(wx / 32) / MT3_CH), gy0 = Math.floor(Math.floor(wy / 32) / MT3_CH);
          for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++)
            _mt3Dirty.add(primaryZoneId + '_' + (gx0 + a) + '_' + (gy0 + b)); }
      }
      _mtSegCache.clear(); _mtChunk.clear();     // 밴드/가장자리 실측이 바뀌었으니 배치를 다시 계산한다
      _gtInvalidateCells(c, (cells || []).flat(), 2);   // 지면(바위색)도 그 자리만 다시 굽는다
      needsRedraw = true;
      return n2;
    };
    // ★가상 위치에서의 가림 계측 — 하네스가 자리를 찾을 때 **정본 판정을 그대로** 쓴다.
    //   배치 수학을 node 쪽에서 다시 쓰면(사본) 둘이 같이 틀려도 통과한다.
    // ★★셀 하나를 **누가** 덮는지 정본에서 묻는다 [재민 "정확하게 산 셀인 곳에만"]
    //   앞서 두 번, 넘침을 '규칙'(남동 부채꼴 / 바위까지 거리)으로 가르려다 둘 다 헐거웠다.
    //   정확한 기준은 스프라이트 자체에 있다: 앵커의 세로 위치 v0 = oy/h 를 기준으로
    //     · v < v0  → 셀이 앵커보다 **화면 위** = 산 몸통 뒤에 가림(정상)
    //     · v > v0  → 셀이 앵커보다 **화면 아래** = 산의 **앞 치맛자락**이 얹힘(결함)
    //   여기에 앵커 셀이 바위가 아니면 그것도 결함이다.
    window.__mtSpillAt = (lcx, lcy) => {
      const z0 = zonesMeta[primaryZoneId]; if (!z0 || !_mtLastRend || !_mtToScr) return null;
      const ox0 = z0.worldOffsetX, oy0 = z0.worldOffsetY || 0;
      const wx = ox0 + lcx * 32 + 16, wy = oy0 + lcy * 32 + 16;
      const pIso = w2i(wx, wy), ps = _mtToScr(pIso.x, pIso.y);
      let cov = 0, foot = 0, offRock = 0;
      for (const it of _mtLastRend) {
        if (it.kind !== 'mtseg') continue;
        const sg = it.sg, an = _mtAnchors[sg.name], im = MTX[sg.name];
        if (!an || !im || !im.naturalWidth) continue;
        const sc = (64 / Math.SQRT2) / an.ppu * sg.sc, vy = sg.vy || 1;
        const W = im.naturalWidth * sc, H = im.naturalHeight * sc * vy;
        const c = _mtToScr(w2i(sg.x, sg.y).x, w2i(sg.x, sg.y).y);
        const dx = c.x - an.ox * sc, dy = c.y - an.oy * sc * vy;
        const u = (ps.x - dx) / W, v = (ps.y - dy) / H;
        if (u <= 0 || u >= 1 || v <= 0 || v >= 1) continue;
        if (_mtAlphaAt(sg.name, u, v) <= 0.30) continue;
        cov++;
        const v0 = an.oy / im.naturalHeight;           // 앵커(발치)의 세로 위치
        if (v > v0 + 0.02) foot++;                     // 앵커보다 아래 = 앞 치맛자락
        if (!_mtRockAt(primaryZoneId, sg.x, sg.y)) offRock++;
      }
      return { cov, foot, offRock };
    };
    // 여유 셀을 바꿔 가며 **한 번의 부팅으로 여러 값을 재기** 위한 훅(probe-mttol 이 쓴다)
    window.__mtSetTol = (v) => { MT_FIT_TOL = +v; _mtChunk.clear(); needsRedraw = true; return MT_FIT_TOL; };
    window.__mtOccAt = (wx, wy) => {
      if (!_mtToScr || !_mtAnchors || !_mtLastRend) return null;
      const p = w2i(wx, wy), sp = _mtToScr(p.x, p.y);
      const save = _mtOcc;
      _mtOcc = { x: sp.x, y: sp.y - 14, z: (wx + wy) * 0.5 + 500 };
      let n = 0, front = 0, back = 0;
      for (const it of _mtLastRend) {
        if (it.kind !== 'mtseg') continue;
        if (it.z > _mtOcc.z) front++; else back++;
        if (_mtOccludesMe(it.sg, it.z)) n++;
      }
      _mtOcc = save;
      return { n, front, back };
    };
    window.__mtClearDestroy = () => { const n2 = _mtDestroyed.size; _mtDestroyed.clear(); _mtSegCache.clear(); _mtChunk.clear(); _groundTiles.clear(); needsRedraw = true; return n2; };
    // ★[배치 21] 자연물 산포 — 물가 술 + 초원 소품. 산 세그먼트와 같은 목록·같은 z 규약.
    const _natT0 = performance.now();
    const _natItems = [];
    const _nNat = _natCollect(_natItems, worldCx, worldCy);
    _natItems.sort((a, b) => a.z - b.z);
    window._natAcc = (window._natAcc || 0) + (performance.now() - _natT0);
    window.__natDbg = { fringe: _nNat[0], props: _nNat[1], sprites: _natLoaded + '/' + _natWanted,
                        chunks: _natChunk.size, blocked: _natBlockSet ? _natBlockSet.size : 0,
                        trees: _treeSpritesLoaded, treeDraw: { n: _treeDraw.n, h: _treeDraw.h, px: _treeDraw.px, aspect: _treeDraw.aspect } };

    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      for (const r of c.resources.values()) {
        const ax = ox + r.x, ay = oy + r.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        renderables.push({ z: iso.y, kind: 'resource', r, iso, ax, ay, wx: ax, wy: ay });
      }
      // Phase 14.23: ground item 렌더
      if (c.groundItems) {
        for (const gi of c.groundItems.values()) {
          const ax = ox + gi.x, ay = oy + gi.y;
          if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
          const iso = w2i(ax, ay);
          renderables.push({ z: iso.y + 5, kind: 'ground_item', gi, iso, ax, ay, wx: ax, wy: ay });
        }
      }
      for (const cl of c.claims.values()) {
        // guild claim은 가장 배경(z 가장 작게)으로 — 너무 많아서 다른 거 가리지 않게
        const cax = ox + cl.x + cl.w/2, cay = oy + cl.y + cl.h/2;
        if (Math.abs(cax - worldCx) > VIEW_RADIUS + 200 || Math.abs(cay - worldCy) > VIEW_RADIUS + 200) continue;
        const baseZ = cl.kind === 'guild' ? -800 : -400;
        renderables.push({ z: w2i(cax, cay).y + baseZ, kind: 'claim', cl, off: ox, offY: oy, wx: cax, wy: cay });
      }
      // §16 답압 길: 등급 셀 바닥 틴트(베이크 무접촉 오버레이 — 흙길/다져진 길). 시야 내만 push.
      if (c.roads && c.roads.size) {
        for (const [rk, lv] of c.roads) {
          const ci = rk.indexOf(','); const rcx = +rk.slice(0, ci), rcy = +rk.slice(ci + 1);
          const rax = ox + rcx * CL_BUILDING_SIZE + 16, ray = oy + rcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(rax - worldCx) > VIEW_RADIUS || Math.abs(ray - worldCy) > VIEW_RADIUS) continue;
          renderables.push({ z: w2i(rax, ray).y - 950, kind: 'road', rcx: rax - 16, rcy: ray - 16, lv, wx: rax, wy: ray });
        }
      }
      // ★[다리 층] 통나무 널다리 상판 — 길(-950)보다 위, 건물보다 아래(-930). 물 위 정적 사물.
      if (c.bridges && c.bridges.size) {
        for (const bk of c.bridges) {
          const ci = bk.indexOf(','); const bcx = +bk.slice(0, ci), bcy = +bk.slice(ci + 1);
          const bax = ox + bcx * CL_BUILDING_SIZE + 16, bay = oy + bcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(bax - worldCx) > VIEW_RADIUS || Math.abs(bay - worldCy) > VIEW_RADIUS) continue;
          // ★스프라이트 종류 판정(다리 셀 집합만으로 결정 — 서버 페이로드 불변):
          //   다리는 폭 2셀이라 축 판정에 이웃 1칸만 보면 평행한 옆줄 때문에 헷갈린다 → **2칸 앞까지** 세어
          //   더 길게 뻗은 쪽을 다리 축으로 잡는다. 그 축 방향으로 이웃이 없는 쪽 = 뭍에 닿는 끝(cap).
          const cnt = (dx, dy) => { let n = 0; for (let k = 1; k <= 2; k++) if (c.bridges.has((bcx + dx * k) + ',' + (bcy + dy * k))) n++; return n; };
          const ax = (cnt(-1, 0) + cnt(1, 0)) >= (cnt(0, -1) + cnt(0, 1)) ? 'x' : 'y';
          const hiN = ax === 'x' ? c.bridges.has((bcx + 1) + ',' + bcy) : c.bridges.has(bcx + ',' + (bcy + 1));
          const loN = ax === 'x' ? c.bridges.has((bcx - 1) + ',' + bcy) : c.bridges.has(bcx + ',' + (bcy - 1));
          const bs = 'bridge_' + (!hiN ? 'cap1' : (!loN ? 'cap0' : 'mid')) + '_' + ax;
          renderables.push({ z: w2i(bax, bay).y - 930, kind: 'bridge', bx: bax, by: bay, bk, bs, wx: bax, wy: bay });
        }
      }
      // ★★[11차 T3 환호] 도랑 타일 — 길(-950)보다 위, 다리(-930)보다 아래(-940). 마을 소유 정적 사물.
      //   축 판정은 다리와 **같은 규약**(2칸 앞까지 세어 긴 쪽이 도랑 축) — 폭 2셀이라 이웃 1칸만 보면 옆줄에 헷갈린다.
      //   모서리(양축 모두 뻗음) = ditch_c. 스프라이트가 없으면 파인 흙 다이아로 폴백(도랑이 안 보이면 함정이 된다).
      if (c.ditches && c.ditches.size) {
        for (const dk of c.ditches) {
          const ci = dk.indexOf(','); const dcx = +dk.slice(0, ci), dcy = +dk.slice(ci + 1);
          const dax = ox + dcx * CL_BUILDING_SIZE + 16, day2 = oy + dcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(dax - worldCx) > VIEW_RADIUS || Math.abs(day2 - worldCy) > VIEW_RADIUS) continue;
          const cnt = (dx, dy) => { let n = 0; for (let k = 1; k <= 2; k++) if (c.ditches.has((dcx + dx * k) + ',' + (dcy + dy * k))) n++; return n; };
          const hx = cnt(-1, 0) + cnt(1, 0), hy = cnt(0, -1) + cnt(0, 1);
          const ds = (hx >= 2 && hy >= 2) ? 'ditch_c' : (hx >= hy ? 'ditch_x' : 'ditch_y');
          renderables.push({ z: w2i(dax, day2).y - 940, kind: 'ditch', bx: dax, by: day2, ds, wx: dax, wy: day2 });
        }
      }
      // ★[곳간② 재고 표시] 곳간 사다리 앞 칸(cx, cy+2)에 짐더미 — 재고 구간 2단계.
      //   곳간은 문 없는 고상 구조라 사다리 칸이 NPC의 저장·인출 자리다(서버 _granLadder와 같은 셀).
      //   z는 자원과 동형(iso.y)이라 곳간 벽·NPC와 깊이 정렬이 맞는다.
      if (c.granStock && c.granStock.size) {
        for (const [gk, st] of c.granStock) {
          if (!(st > 0)) continue;
          const ci = gk.indexOf(','); const gc0 = +gk.slice(0, ci), gcx = gc0, gcy = +gk.slice(ci + 1) + 2;   // 사다리 칸
          const gax = ox + gcx * CL_BUILDING_SIZE + 16, gay = oy + gcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(gax - worldCx) > VIEW_RADIUS || Math.abs(gay - worldCy) > VIEW_RADIUS) continue;
          renderables.push({ z: w2i(gax, gay).y, kind: 'granpile', gx: gax, gy: gay, st, wx: gax, wy: gay });
          // ★[곳간 연출 세분화] 벽에 기대 놓은 소품(멍석 말이·삼태기) — 사다리 옆 칸(발자국 남동 모서리 밖).
          //   재고가 있는 곳간에만(=사람이 드나드는 곳간) 놓아 '쓰이는 창고'로 읽히게 한다.
          const pax = ox + (gc0 + 2) * CL_BUILDING_SIZE + 16, pay = gay;
          renderables.push({ z: w2i(pax, pay).y, kind: 'granpile', gx: pax, gy: pay, prop: 1, wx: pax, wy: pay });
        }
      }
      // ★★[10차 T4 장마당] 캐러밴이 큰집 마당에 머무는 동안에만 좌판이 깔린다(서버 markets = phase 'linger' 목적지).
      //   자리 = 큰집 남벽 문(ccx, ccy+3~4) 앞 마당 원판 — 문 통로(ccx 열)는 비워 두고 좌우로 흩어 놓는다.
      //   고증(A-1): 상설 점포가 아니라 **폈다 걷는 물건**이라 캐러밴이 떠나면 이 배열 자체가 사라진다.
      if (c.markets && c.markets.length) {
        for (let mi = 0; mi + 1 < c.markets.length; mi += 2) {
          const mcx = c.markets[mi], mcy = c.markets[mi + 1];
          for (const [_mk, _mdx, _mdy] of MARKET_STALLS) {
            const _mx = ox + (mcx + _mdx) * CL_BUILDING_SIZE + 16, _my = oy + (mcy + _mdy) * CL_BUILDING_SIZE + 16;
            if (Math.abs(_mx - worldCx) > VIEW_RADIUS || Math.abs(_my - worldCy) > VIEW_RADIUS) continue;
            renderables.push({ z: w2i(_mx, _my).y, kind: 'cellprop', key: _mk, gx: _mx, gy: _my, wx: _mx, wy: _my });
          }
        }
      }
      // §4-4 Stage 4A: 마을 시뮬 영토 — 경계 셀(b: [dx,dy,mask...]) 반투명 렌더. claim보다 더 배경(-900).
      if (c.simVillages) {
        for (const v of c.simVillages) {
          const vcx = ox + v.cx * CL_BUILDING_SIZE + 16, vcy = oy + v.cy * CL_BUILDING_SIZE + 16;
          const cullR = (v.r || 1200);
          if (Math.abs(vcx - worldCx) > VIEW_RADIUS + cullR || Math.abs(vcy - worldCy) > VIEW_RADIUS + cullR) continue;
          renderables.push({ z: w2i(vcx, vcy).y - 900, kind: 'simvil', v, off: ox, offY: oy, wx: vcx, wy: vcy });
        }
      }
      // §11 도적: 소굴·야영 마커 1종(서버 bandit_camps) — 점유 단은 진하게, 빈 소굴은 흐리게
      if (c.banditCamps) {
        for (const bc of c.banditCamps) {
          const bx = ox + bc.x, by = oy + bc.y;
          if (Math.abs(bx - worldCx) > VIEW_RADIUS + 200 || Math.abs(by - worldCy) > VIEW_RADIUS + 200) continue;
          renderables.push({ z: w2i(bx, by).y - 300, kind: 'banditcamp', bc, off: ox, offY: oy, wx: bx, wy: by });
        }
      }
      const _hutRs = [], _hutSeen = new Set();   // ★[침대 진입] 이번 프레임 움집 렉트+지붕 표시 여부 — 실내 NPC 가림 판정(others 루프 소비)
      // ★★[2026-08-04c 배치 17 ①] **실내 컷어웨이가 한 번도 안 먹던 원인 — 좌표계 불일치.**
      //   `data.hut`·`data.bld` 렉트는 **존 로컬 셀**이다(서버가 b.cx 로 굽는다). 그런데 실내 판정은
      //   `myAbsPredicted`(월드 절대)를 32 로 나눠 비교하고 있었다. 한반도는 worldOffsetX=409,984 이라
      //   플레이어 셀이 13,775 로 나오고 렉트는 960~967 이다 — **영원히 false.**
      //   그래서 큰집·움집 안에 서 있어도 지붕이 안 걷히고, 남·동벽도 안 눕고, 실내 NPC 가림도 안 됐다.
      //   (재민 실화면 재현: /tmp/b17-shots/in_hall.png — 큰집 안인데 지붕이 온전하고 플레이어가 그 위에 떠 있다.)
      //   ⇒ 이 존의 **로컬 셀**로 바꾼다. 존을 여러 개 캐시해도 각자 제 원점으로 재므로 안전하다.
      const _myLcx = Math.floor((myAbsPredicted.x - ox) / CL_BUILDING_SIZE);
      const _myLcy = Math.floor((myAbsPredicted.y - oy) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        // ★움집 지붕: 서버 태그 data.hut=[x0,y0,x1,y1] — 지붕은 벽 유닛(64px) '위에' 얹힌 스프라이트[사용자 확정: 유닛 문법].
        //   벽은 항상 그대로 렌더(통나무 스킨·문=벽 개구·콜라이더 불변). 바닥만 밖에서 억제(지붕에 가림) + 캐리어 1셀이 지붕 합성.
        //   플레이어가 발자국 안/문 앞 1셀(0층)이면 지붕만 걷힘(컷어웨이) → 실내 바닥·가구 노출.
        // ★[에셋 2차] 고상곳간(data.gran) — 실물 벽·바닥은 시각만 억제(콜라이더·밀폐 불변), 캐리어 1셀이 통짜
        //   스프라이트(기둥+판벽+이엉) 합성. 컷어웨이 없음(문 없는 밀폐 — 반출입은 사다리 연출).
        const _granI = _bldSpr.granary || _granC;   // ★10차: 3D 스프라이트 우선, 없으면 베이크 폴백
        const _grn = _granI && b.data && b.data.gran;
        if (_grn) {
          if (b.type === 'floor') {
            const _fgx = Math.floor(b.x / CL_BUILDING_SIZE), _fgy = Math.floor(b.y / CL_BUILDING_SIZE);
            if (_fgx === _grn[2] && _fgy === _grn[3]) {   // 캐리어=남동단 바닥 1셀(스프라이트 전체가 이 z — 뒤 개체 가림 최대 보장)
              const rax = ox + b.x, ray = oy + b.y;
              if (Math.abs(rax - worldCx) <= VIEW_RADIUS + 200 && Math.abs(ray - worldCy) <= VIEW_RADIUS + 200) {
                const _giso = w2i(rax - 160, ray - 96);   // 지붕 로컬 원점=발자국 북서(x0-0.5,y0-0.5) — 캐리어(x1,y1)에서 (-5,-3)셀... x:(x0-0.5)-(x1+0.5)=-5셀=-160, y:-3셀=-96
                renderables.push({ z: (rax + ray) * 0.5 + 40, kind: 'hutroof', img: _granI, iso: _giso, wx: rax, wy: ray });
              }
            }
          }
          continue;   // 벽·바닥 실물 렌더 억제(스프라이트가 대체)
        }
        // ★[에셋 2차] 큰집 지붕(data.bld) — 움집 문법 동형: 벽은 항상(통나무 스킨), 바닥=밖 억제, 캐리어=남행 문
        //   좌측 바닥 1셀이 지붕 합성. 컷어웨이=발자국 안/문앞 1셀(남벽 문 2칸 x0+3·x0+4).
        const _hallI = _bldSpr.hall_roof || _hallRoofC;   // ★10차: 3D 스프라이트 우선
        const _bld2 = _hallI && b.data && b.data.bld;
        if (_bld2 && b.type === 'floor') {
          const _mbx = _myLcx, _mby = _myLcy;   // ★배치 17: 존 로컬 셀(위 주석 — 절대 좌표로 재던 것이 컷어웨이 불발의 원인)
          const _binside = (myFloor || 0) === 0 && ((_mbx >= _bld2[0] && _mbx <= _bld2[2] && _mby >= _bld2[1] && _mby <= _bld2[3])
            || (_mby === _bld2[3] + 1 && (_mbx === _bld2[0] + 3 || _mbx === _bld2[0] + 4)));
          { const _hk = 'B' + _bld2[0] + ',' + _bld2[1]; if (!_hutSeen.has(_hk)) { _hutSeen.add(_hk); _hutRs.push({ r: _bld2, roofOn: !_binside }); } }   // 실내 NPC 가림(움집과 동일 규칙)
          if (!_binside) {
            const _fbx = Math.floor(b.x / CL_BUILDING_SIZE), _fby = Math.floor(b.y / CL_BUILDING_SIZE);
            if (_fbx === _bld2[0] + 3 && _fby === _bld2[3]) {
              const rax = ox + b.x, ray = oy + b.y;
              if (Math.abs(rax - worldCx) <= VIEW_RADIUS + 300 && Math.abs(ray - worldCy) <= VIEW_RADIUS + 300) {
                const _riso = w2i(rax - 128, ray - 256);   // 원점=북서(x0-0.5,y0-0.5): 캐리어(x0+3,y1)에서 (-4,-8)셀
                renderables.push({ z: (rax + ray) * 0.5 + 80, kind: 'hutroof', img: _hallI, iso: _riso, wx: rax, wy: ray });   // ★벽 4면 상회: 8×8은 남벽 동단·동벽 남단=캐리어+72 — +80으로 전부 상회(움집 +64 논리 동형)
              }
            }
            continue;   // 밖=실내 바닥 억제(지붕에 가림)
          }
        }
        const _hutI = _bldSpr.hut_roof || _hutRoofC;   // ★10차: 3D 스프라이트 우선
        const _hut = _hutI && b.data && b.data.hut;
        // ★[마당 소품 — 에셋 10차] 구역 기하 정본 자리에 화덕·장독 2점. 서버 페이로드는 그대로 두고
        //   움집 태그(data.hut=[x0,y0,x1,y1])에서 유도한다(실내 화덕·침대가 이미 쓰는 방식과 동형).
        //   집 앵커 (cx,cy) = (x1, y1+2) → 화덕(cx-2,cy) · 장독(cx+2,cy-4)(cx+4,cy-3).
        //   컷어웨이와 무관하게 항상 보인다(마당 사물). 캐리어=발자국 남동단 1셀(움집당 정확 1회).
        if (_hut && b.type === 'floor') {
          const _pcx = Math.floor(b.x / CL_BUILDING_SIZE), _pcy = Math.floor(b.y / CL_BUILDING_SIZE);
          if (_pcx === _hut[2] && _pcy === _hut[3]) {
            for (const [_pk, _pdx, _pdy] of [['yard_hearth', -2, 2], ['yard_jar1', 2, -2], ['yard_jar2', 4, -1]]) {
              const _px2 = ox + (_hut[2] + _pdx) * CL_BUILDING_SIZE + 16, _py2 = oy + (_hut[3] + _pdy) * CL_BUILDING_SIZE + 16;
              if (Math.abs(_px2 - worldCx) > VIEW_RADIUS || Math.abs(_py2 - worldCy) > VIEW_RADIUS) continue;
              renderables.push({ z: w2i(_px2, _py2).y, kind: 'cellprop', key: _pk, gx: _px2, gy: _py2, wx: _px2, wy: _py2 });
            }
          }
        }
        if (_hut && b.type === 'floor') {
          const _mcx = _myLcx, _mcy = _myLcy;   // ★배치 17: 존 로컬 셀
          const _inside = (myFloor || 0) === 0 && ((_mcx >= _hut[0] && _mcx <= _hut[2] && _mcy >= _hut[1] && _mcy <= _hut[3])
            || (_mcy === _hut[3] + 1 && (_mcx === _hut[0] + 2 || _mcx === _hut[0] + 3)));   // ★문 앞 1셀에서도 개방(열린 문으로 내부 엿보기 — PZ 관례)
          { const _hk = _hut[0] + ',' + _hut[1]; if (!_hutSeen.has(_hk)) { _hutSeen.add(_hk); _hutRs.push({ r: _hut, roofOn: !_inside }); } }   // ★[침대 진입] 렉트+지붕 여부 수집(움집당 1회)
          if (!_inside) {
            const _fcx = Math.floor(b.x / CL_BUILDING_SIZE), _fcy = Math.floor(b.y / CL_BUILDING_SIZE);
            if (_fcx === _hut[0] + 2 && _fcy === _hut[3]) {   // 캐리어=남행 문 좌측 바닥 1셀(움집당 정확 1회)
              const rax = ox + b.x, ray = oy + b.y;
              if (Math.abs(rax - worldCx) <= VIEW_RADIUS + 200 && Math.abs(ray - worldCy) <= VIEW_RADIUS + 200) {
                const _riso = w2i(rax - 96, ray - 128);       // 지붕 로컬 원점 = 북서 오버행 모서리(캐리어 중심 - (3,4)셀)
                renderables.push({ z: (rax + ray) * 0.5 + 64, kind: 'hutroof', img: _hutI, iso: _riso, wx: rax, wy: ray });   // ★지붕은 자기 집 벽 4면보다 무조건 앞[사용자 지적]: 벽 z 최대=남벽 동단·동벽 남단 (캐리어+56) — +24는 SE 구간 벽이 처마를 덮었음. +64로 전부 상회. 남측 개체는 지붕이 64px 떠 있어 픽셀 비겹침(플레이어는 +500 별도)이라 안전
              }
            }
            continue;
          }
        }
        // wall은 cell edge 좌표 (b.x, b.y = cell 좌상단). 다른 건축은 cell 중심.
        let ax, ay;
        if (b.type === 'wall') {
          const side = b.data?.side || 'N';
          // edge 중간점 — N: 북쪽 변 중간, E: 동쪽 변 중간
          if (side === 'N') { ax = ox + b.x + 16; ay = oy + b.y; }
          else /* E */     { ax = ox + b.x + 32; ay = oy + b.y + 16; }
        } else if (b.type === 'stair') {
          // 14.49-e7ah: stair는 3 cell 분할 push. 각 cell이 자기 z로 sort.
          // 14.49-e7aj: b.x/b.y는 이미 cell 중심 (addBlock에서 +16). +16 추가 X.
          const dir = b.data?.dir || 'N';
          const dv = dir === 'E' ? { x: 1, y: 0 } : dir === 'W' ? { x: -1, y: 0 } : dir === 'S' ? { x: 0, y: 1 } : { x: 0, y: -1 };
          const baseAx = ox + b.x; // cell 0 center (b.x already cell center)
          const baseAy = oy + b.y;
          const bZ = (b.floor || 0) * FLOOR_HEIGHT;
          for (let cellN = 0; cellN < 3; cellN++) {
            const cAx = baseAx + dv.x * cellN * CL_BUILDING_SIZE;
            const cAy = baseAy + dv.y * cellN * CL_BUILDING_SIZE;
            if (Math.abs(cAx - worldCx) > VIEW_RADIUS || Math.abs(cAy - worldCy) > VIEW_RADIUS) continue;
            const iso = w2i(cAx, cAy, bZ);
            renderables.push({
              z: (cAx + cAy) * 0.5 + (b.floor || 0) * 0.5,
              kind: 'stair_cell', b, iso, ax: cAx, ay: cAy, cellN, dv, wx: cAx, wy: cAy,
            });
          }
          continue;
        } else {
          ax = ox + b.x; ay = oy + b.y;
        }
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const bZ = (b.floor || 0) * FLOOR_HEIGHT;
        const iso = w2i(ax, ay, bZ);
        let _bz = (ax + ay) * 0.5 + (b.floor || 0) * 0.5;
        if (b.type === 'vtile') _bz -= 960;   // ★지면 타일은 실셀 텍스처(64×32)로 승격 — 길(-950)·개체 아래 배경층으로
        renderables.push({ z: _bz, kind: 'building', b, iso, ax, ay, off: ox, offY: oy, wx: ax, wy: ay });   // ★배치 17: off — 남·동벽 페이드가 존 로컬 셀을 재려면 원점이 필요하다
      }
      // ★[2026-08-04c 배치 17 ①] 실내 컷어웨이 진단 훅 — 하네스가 "지붕이 실제로 걷혔나"를 계약 수준에서
      //   확인할 수 있게 이번 프레임의 발자국 렉트·지붕 표시 여부·내 로컬 셀을 노출한다.
      //   화면 픽셀 비교와 **둘 다** 봐야 자명 통과를 막는다(계약만 보면 렌더가 틀려도 통과한다).
      if (_hutRs.length) window.__cutawayDbg = { lcx: _myLcx, lcy: _myLcy, zone: (c.meta && c.meta.id) || null,
        rects: _hutRs.map((h) => ({ r: h.r.slice(), roofOn: !!h.roofOn })) };
      for (const m of c.mobs.values()) {
        const pos = sampleAt(m.buf, renderT, m.x, m.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        // 14.49-d: mob도 floor*FLOOR_HEIGHT + z 적용 (계단 위 추격 시 위로 솟음)
        const mFloor = m.floor || 0;
        const mZ = mFloor * FLOOR_HEIGHT + (m.z || 0);
        const iso = w2i(ax, ay, mZ);
        renderables.push({ z: iso.y, kind: 'mob', m, iso, ax, ay, wx: ax, wy: ay });
      }
      // Phase 5-7: 사체
      for (const co of c.corpses.values()) {
        const ax = ox + co.x, ay = oy + co.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay, 0);
        renderables.push({ z: iso.y, kind: 'corpse', co, iso, ax, ay, wx: ax, wy: ay });
      }
      for (const o of c.others.values()) {
        const pos = sampleAt(o.buf, renderT, o.x, o.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        // ★[침대 진입 — PZ 동형] 움집 실내 NPC(취침·요양)는 그 집 지붕이 그려져 있으면(뷰어가 밖) 숨김 —
        //   플레이어 z(+500)가 지붕 z(캐리어+64)를 항상 이겨 '지붕 위에 누워 자는' 그림이 되기 때문. 들어가면(컷어웨이) 보인다.
        if ((o.floor || 0) === 0 && _hutRs.length) {
          const _ncx = Math.floor(pos.x / CL_BUILDING_SIZE), _ncy = Math.floor(pos.y / CL_BUILDING_SIZE);   // ★배치 17: 렉트가 존 로컬이라 NPC 도 로컬 셀로(ax/ay 는 절대 — 영원히 불일치였다)
          let _hide = false;
          for (const _h of _hutRs) { if (_ncx >= _h.r[0] && _ncx <= _h.r[2] && _ncy >= _h.r[1] && _ncy <= _h.r[3]) { _hide = _h.roofOn; break; } }
          if (_hide) continue;
        }
        // §4-4 Stage 4A: 마을 NPC 직업 이모지 접두 (simJob — econ 분포와 매 게임일 동기)
        const _sjEmoji = (o.simJob && SIM_JOB_EMOJI[o.simJob]) || '';
        const displayName = (_sjEmoji ? _sjEmoji + ' ' : '') + (o.tribeName ? `[${o.tribeName}] ${o.name}` : o.name);
        const oFloor = o.floor || 0;
        const oZ = oFloor * FLOOR_HEIGHT + (o.z || 0); // 14.49-d: 계단 위 z 포함
        const isoF = w2i(ax, ay, oZ);
        renderables.push({ z: (ax + ay) * 0.5 + oFloor * 0.5 + 500, kind: 'player', wx: ax, wy: ay, pid: o.pid, name: displayName, color: o.color || '#5a9ae0', hp: o.hp, maxHp: o.maxHp, iso: isoF, ax, ay, floor: oFloor, lastAttackAt: o.lastAttackAt, vx: o.vx, vy: o.vy, _fvx: o._fvx, _fvy: o._fvy, _war: o._war, bt: o.bt, bs: o.bs, bc: o.bc, br: o.br, cap: o.cap, act: o.act });
      }
    }
    {
      // 본인 스프라이트도 카메라(보간) 위치 사용 → 항상 화면 중앙 + 60fps 부드러운 스크롤.
      const myDisplay = myTribeName ? `[${myTribeName}] ${myName}` : myName;
      const myZ = myFloor * FLOOR_HEIGHT + (myStairZ || 0); // 14.49-c: 계단 z 추가
      const isoMe = w2i(_camAbs.x, _camAbs.y, myZ);
      renderables.push({ z: (_camAbs.x + _camAbs.y) * 0.5 + myFloor * 0.5 + 500, kind: 'player', wx: _camAbs.x, wy: _camAbs.y, pid: myPid, name: myDisplay, color: myColor, hp: myHp, maxHp: myMaxHp, iso: isoMe, ax: _camAbs.x, ay: _camAbs.y, isMe: true });
    }

    // ★★[2026-08-04d 배치 18 ②] **자동 지붕** — 닫힌 방 위엔 지붕이 저절로 얹힌다.
    //   앵커 규약은 마을 지붕과 같다(실측으로 확인): 발자국 [x0,y0,x1,y1] 의 지붕 로컬 원점 =
    //   **(x0-1, y0-1) 셀의 좌상단**. 움집·큰집·곳간 세 곳의 기존 오프셋이 전부 이 식과 일치한다.
    //   z 는 그 렉트의 남동 끝 칸 기준 +64 — 제 벽 4면을 전부 상회한다(움집 +64 논리 동형).
    //   컷어웨이: 내가 **그 방 안**이면 지붕을 아예 안 그린다(투명이 아니라 미표시 — 좀보이드 문법).
    const _roomRoofDbg = [];
    {
      const _mrx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE), _mry = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
      const _mrRoom = cellRoomCache.get(`${_mrx}_${_mry}_${myFloor}`) || null;
      const _roofHideAbove = !!_mrRoom, _roofViewFloor = myFloor;   // 지붕 블록은 정렬 앞이라 여기서 직접 잰다
      for (const room of srvRooms.values()) {
        // ★[배치 18 ③] 실내면 **내 층보다 위** 방의 지붕은 안 그린다(그 층 자체가 숨김).
        //   밖이면 전 층 지붕을 다 그린다 — 2층집 지붕이 보여야 2층집이다.
        if (_roofHideAbove && (room.floor | 0) > (_roofViewFloor | 0)) continue;
        const inside = !!(_mrRoom && _mrRoom.id === room.id);
        const _boxes = [], _origins = [];
        for (const r of roomRects(room)) {
          const w = r[2] - r[0] + 1, h = r[3] - r[1] + 1;
          const img = roofImgFor(w, h);
          if (!img) continue;
          const oax = (r[0] - 1) * CL_BUILDING_SIZE, oay = (r[1] - 1) * CL_BUILDING_SIZE;   // 지붕 로컬 원점(절대 px)
          const cax = r[2] * CL_BUILDING_SIZE, cay = r[3] * CL_BUILDING_SIZE;               // z 캐리어 = 남동 끝 칸
          if (Math.abs(cax - worldCx) > VIEW_RADIUS + 400 || Math.abs(cay - worldCy) > VIEW_RADIUS + 400) continue;
          // ★[배치 18 ③] **층 z 리프트** — 2층 방 지붕은 한 층 높이만큼 떠야 한다.
          //   빠져 있어서 2층 지붕이 1층 지붕과 같은 높이에 겹쳐 그려지고 있었다(E2E 가 잡았다).
          const _iso = w2i(oax, oay, (room.floor | 0) * FLOOR_HEIGHT);
          // ★[배치 18 ②] 하네스가 **화면 어디를 봐야 하는지**를 클라 제 투영으로 알려 준다(사본 금지).
          //   지붕을 안 그릴 때도(컷어웨이) 상자는 계산한다 — 같은 자리에서 전/후를 재려면 필요하다.
          { const _s = toScreen(_iso.x, _iso.y);
            _boxes.push([Math.round(_s.x - img._ox), Math.round(_s.y - img._oy), Math.round(_s.x - img._ox + img.width), Math.round(_s.y - img._oy + img.height)]);
            // 발자국과 **지붕 로컬 원점의 화면 좌표**도 같이 — 층 리프트를 재려면 이미지 크기에 안 흔들리는 값이 필요하다
            //   (상자 좌표는 앵커 _ox/_oy 가 지붕 크기마다 달라 크기가 다른 두 지붕을 비교할 수 없다).
            _origins.push({ r: r.slice(), sx: Math.round(_s.x), sy: Math.round(_s.y) }); }
          if (inside) continue;   // 컷어웨이 — 내가 그 방 안이면 지붕을 아예 안 그린다
          renderables.push({ z: (cax + cay) * 0.5 + 64 + (room.floor | 0) * (FLOOR_HEIGHT * 0.5), kind: 'hutroof', img, iso: _iso, floor: room.floor | 0, wx: cax, wy: cay });
        }
        _roomRoofDbg.push({ id: room.id, floor: room.floor | 0, roofOn: !inside, cells: room.cells.size, boxes: _boxes, origins: _origins });
      }
      window.__roomRoofDbg = { myRoom: _mrRoom ? _mrRoom.id : null, floor: myFloor, roofs: _roomRoofDbg };
    }

    renderables.sort((a, b) => a.z - b.z);

    // ★[재민 2026-08-07] 산 가림 뚫기 기준점 — 내 화면 좌표와 내 z 를 프레임당 1회만 잡는다.
    //   z 는 플레이어 renderable 과 **같은 식**을 써야 한다(사본 금지 — 여기서 어긋나면
    //   "가리는데 안 뚫리는" 산이 생긴다). floor 는 산 판정과 무관해 0 으로 둔다.
    _mtOcc = null;
    if (_mtAnchors && myAbsPredicted) {
      const _op = w2i(myAbsPredicted.x, myAbsPredicted.y), _os = toScreen(_op.x, _op.y);
      _mtOcc = { x: _os.x, y: _os.y - 14, z: (myAbsPredicted.x + myAbsPredicted.y) * 0.5 + 500 };
    }
    // ★계측기는 판정을 **다시 유도하지 않는다** — `_mtDraw` 가 세는 수를 그대로 읽는다(사본 금지).
    _mtFadedN = 0;
    window.__mtOccDbg = { n: 0, faded: 0, front: 0, fade: +_mtFadeAmt.toFixed(2),
      pt: _mtOcc ? { x: Math.round(_mtOcc.x), y: Math.round(_mtOcc.y) } : null, z: _mtOcc ? Math.round(_mtOcc.z) : null };
    _mtToScr = toScreen;
    _mtUpdateFade(renderables, _mtFadeDt());

    // 14.49-e7ab/ag: 위층 BFS cutaway
    const _renderMyCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
    const _renderMyCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    // ★[배치 18 ③] 옛 위층 BFS 두 개는 소비처가 없어졌다 — 재민 확정 문법("위층 = 완전 숨김 ·
    //   밖 = 전체 복원")이 골라 숨길 이유를 없앴다. 함수는 남겨 두되 매 프레임 돌리지 않는다.
    //   (`aboveCutawayWalls` 는 배치 17 시점에 이미 계산만 하고 읽는 곳이 없는 죽은 값이었다.)
    // ★[사용자 지적 — 밖에서도 동벽이 눕던 버그] 방향성 남·동벽 페이드의 실내 게이트(프레임당 1회):
    //   내가 실내일 때만 발동 — 밖에서는 모든 벽 불투명.
    // ★[배치 18 ①] 이제 방은 **서버 판정**이다(rooms_update). 없으면 실외다 — 클라가 대신 계산하지 않는다.
    //   문이 개구(문 개체가 없는)인 마을 움집·큰집은 서버도 방을 못 만든다 → 종전대로 발자국 렉트
    //   태그(data.hut/data.bld)가 그쪽 실내 판정 정본이다(벽 페이드 분기에서 처리 · 회귀 0).
    let _myRoom = null;
    { const _mr = cellRoomCache.get(`${_renderMyCx}_${_renderMyCy}_${myFloor}`);
      _myRoom = (_mr && _mr.isIndoor) ? _mr : null; }
    // ★★[2026-08-04d 배치 18 ③] **층 렌더 문법** (재민 확정: "1층에 들어가면 고층은 투명해지는 거 맞지?")
    //   · 내 층   = 컷어웨이(지붕 걷힘 + 남·동벽 눕힘)
    //   · 위층    = **완전 숨김**(투명이 아니라 미표시 — 반투명 위층은 아래를 읽기 어렵게 만든다)
    //   · 아래층  = 그대로(내 바닥 밑으로 보인다)
    //   · **밖    = 전체 복원** — 밖에서 2층집은 2층집으로 보여야 한다. 종전엔 밖에서도 위층을
    //               부분적으로 숨겨(BFS) 2층이 반쯤 지워진 그림이었다.
    //   ★히스테리시스: 계단 위에서 myFloor 가 오가면 위층이 깜빡인다. 층이 **250ms 동안 유지**돼야
    //     렌더 층을 옮긴다. 판정·충돌은 종전대로 myFloor 를 쓴다 — 이건 **보이는 층**만의 값이다.
    { const _nowMs = performance.now();
      if (myFloor !== _viewFloorPend) { _viewFloorPend = myFloor; _viewFloorAt = _nowMs; }
      if (_viewFloor !== _viewFloorPend && _nowMs - _viewFloorAt > 250) _viewFloor = _viewFloorPend; }
    const _hideAbove = !!_myRoom;   // 실내일 때만 위층을 숨긴다(밖 = 전체 복원)
    window.__floorViewDbg = { myFloor, viewFloor: _viewFloor, indoors: !!_myRoom, hideAbove: _hideAbove, room: _myRoom ? _myRoom.id : null };

    // ═══════════════════════════════════════════════════════════════════════
    // ★★[배치 21 수리] 자연물(물가 술·들꽃)은 **안개 마스크보다 먼저** 그린다.
    //   1패스는 renderables 에 태워 엔티티와 z 정렬했는데(배치 20 산 세그먼트 본보기를 따랐다),
    //   마스크 합성이 **엔티티 렌더 앞**이라 자연물이 안개 위로 떠올랐다 —
    //   **한 번도 못 본 새까만 셀 위에 풀과 꽃이 그대로 보였다**(재민 지적).
    //   실측(fogprobe): 미탐사 픽셀 450,566 중 밝은 픽셀 **1,142 → 자연물 끄면 9**.
    //   99.2%가 이 층이었다. 서버 엔티티(나무·건물)는 AOI 650px 안에서만 오고 그 범위는
    //   사실상 항상 '본 곳'이라 이 문제가 드러나지 않았는데, 자연물은 **클라가 1,500px 까지
    //   스스로 만들어** 미탐사 영역까지 뻗는다. 그래서 이 층에서만 새로 터진 것이다.
    //   ⇒ 마스크 앞으로 옮기면 지면과 **똑같은 3단계**를 그대로 받는다:
    //      미탐사=완전히 가려짐 · 봤지만 시야 밖=지면과 같은 20% 어둠 · 시야 안=밝음.
    //      (배치 19가 남긴 "지면 데코는 안개 마스크 앞" 계약이 바로 이 뜻이었다.)
    //   ⇒ 대가: 엔티티가 항상 자연물 위에 그려진다(사람이 갈대 뒤에 서도 앞으로 나온다).
    //      풀·꽃은 지면 데코라 이 편이 낫다 — 산 세그먼트처럼 큰 물체였다면 반대였을 것이다.
    if (!_t19.natOff) {
      const _wt = _windT(), _ww = _t19.windOff ? 0 : _windAt(_wt);
      const _nt0 = performance.now();
      for (const it of _natItems) _natDraw(ctx, it, toScreen, _wt, _ww);
      // 자연물 패스 비용 — 32프레임 이동평균. 바람 on/off 비교의 정본 계측기다.
      _natMs = _natMs * 0.969 + (performance.now() - _nt0) * 0.031;
      if (window.__natDbg) { window.__natDbg.ms = _natMs; window.__natDbg.wind = _ww; }
    }

    // 3단계 안개 마스크(미탐사 검정 · 봤지만 시야 밖 0.2 · 시야 안 0) — **엔티티 렌더 앞**.
    //   ★왜 여기인가(되돌린 이유, 실측): 마스크를 월드 렌더 **전체 뒤**로 옮겨 봤더니
    //   **지붕·산처럼 높은 물체가 자기 발밑 셀의 안개에 눌렸다.** 가시성 폴리곤은 **지면**에서
    //   벽을 광선으로 잘라 만드는데, 지붕은 그 셀보다 화면상 한참 위에 그려지기 때문이다.
    //   실측: e2e-rooms 의 이엉 픽셀 **29.0% → 2.4%**(집 옆에 서 있는데 내 지붕이 캄캄해졌다),
    //   e2e-cutaway 지붕 신호 41.6 → 28.2. ⇒ 3단계 감쇠는 **지면 전용**으로 되돌리고,
    //   재민 규칙("안 가본 곳엔 아무것도")은 **미탐사 전용 2차 마스크**로 따로 건다(아래).
    // mask 자체는 entity render 후에 만들어짐 — 즉 1 frame 지연. 카메라 델타로 보정한다.
    if (window._shadowMask) {
      const _maskM = 64; // mask 생성부 FOG_MASK_M과 동일해야 함
      let mdx = 0, mdy = 0;
      if (window._shadowMaskPx !== undefined) {
        const p0x = window._shadowMaskPx, p0y = window._shadowMaskPy;
        const p1x = _camAbs.x, p1y = _camAbs.y; // K22: 마스크 빌드/저장과 동일 기준(_camAbs)
        // 정수로 반올림 — subpixel drawImage는 Safari 리샘플링 강제 + 경계 떨림의 원인
        mdx = Math.round((p0x - p0y) - (p1x - p1y));
        mdy = Math.round(((p0x + p0y) - (p1x + p1y)) / 2);
        if (Math.abs(mdx) > _maskM || Math.abs(mdy) > _maskM) { mdx = 0; mdy = 0; }
      }
      ctx.drawImage(window._shadowMask, mdx - _maskM, mdy - _maskM);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ★★[재민 확정 2026-08-06] **한 번도 안 가본 곳은 그 어떤 것도 보여서는 안 된다.**
    //   ⇒ 개체(entity)마다 **자기 셀이 '본 셀'인지** 보고, 아니면 아예 안 그린다.
    //
    //   ★왜 화면 마스크가 아니라 개체 단위인가 — 실측으로 두 번 확인했다.
    //     안개 마스크를 월드 렌더 **전체 뒤**로 얹어 봤더니 **지붕·산처럼 높은 물체가
    //     자기 뒤편 미탐사 셀에 잘렸다**. 가시성 폴리곤은 **지면**에서 벽을 광선으로 잘라
    //     만드는데 지붕은 그 셀보다 화면상 한참 위에 그려지기 때문이다.
    //     실측: e2e-rooms 이엉 픽셀 **29.0% → 2.8%**(집 옆에 서 있는데 내 지붕이 캄캄해졌다).
    //     ⇒ 재민 규칙의 뜻은 "안 가본 셀 위 **픽셀** 금지"가 아니라 "안 가본 자리의 **사물** 금지"다.
    //       그래서 **사물의 자리(wx,wy)** 로 판정한다. 내가 본 집이면 지붕은 온전히 보인다.
    //
    //   ★판정 정본은 `_seenChunks`(안개가 '봤다'를 기록하는 바로 그 자료)다 — 사본 금지.
    //   ★구멍 금지: 모든 push 에 `wx/wy` 를 달았고, 없는 항목은 **세어서 내보낸다**
    //     (`__fogGateDbg.missing`). 하네스가 0 을 요구한다 — 조용히 새는 종류가 없게.
    // ═══════════════════════════════════════════════════════════════════════
    let _gateSkipped = 0, _gateMissing = 0, _gateFree = 0; const _gateMissKind = {};
    _gateDrawn.length = 0;
    const _seenCell1 = (cx, cy) => {
      const sc = window._seenChunks; if (!sc) return true;   // 첫 프레임(기록 전)은 통과
      const chSet = sc.get((cx >> 4) + '_' + (cy >> 4));
      return !!chSet && chSet.has(cx * 65536 + cy);
    };
    // ★★구조물은 **발자국 어느 한 칸이라도 봤으면** 보인다 — 앵커 한 칸으로 재면 안 된다.
    //   실측 결함: 밖에서 지은 집은 **안에 들어가 본 적이 없다**. 벽이 시야를 막아 내부 셀이
    //   영영 '본 셀'이 안 되고, 지붕 앵커가 그 내부라 **내가 지은 내 집 지붕이 사라졌다**
    //   (e2e-rooms 이엉 29.0% → 3.2%). 안개의 목적은 '안 가본 땅'을 가리는 것이지
    //   내가 지나쳐 본 건물을 숨기는 게 아니다.
    //   ⇒ 구조물은 앵커 + 반경 R셀의 8방위까지 9칸을 본다(R 은 발자국 크기 기준).
    //   ★★[리베이스 합류 2026-08-07] **산(mtseg)은 이 게이트에서 뺀다.** 근거는 취향이 아니라 실측이다:
    //     ⓐ 산 세션이 `_mtCollectCover` 로 다시 쓰면서 내 5차가 달았던 wx/wy 가 사라졌고,
    //        하네스 "구멍 0" 가 37건으로 잡았다. 그래서 자리는 다시 달았다(계측은 살아 있어야 한다).
    //     ⓑ 그런데 자리를 달고 게이트를 걸었더니 **산이 사라졌다**:
    //          앵커만(R=1) → 산 앞에 서도 **115장 중 10장**만 그려짐
    //          발자국 반경 5 → **16장**   (대조군: origin/main 은 e2e-mtocc **10/10**)
    //        원인은 명확하다 — **가시성 폴리곤은 바위에서 끊긴다.** 그래서 바위 셀은 사실상
    //        영영 '본 셀'로 기록되지 않는다. 어떤 반경을 줘도 게이트는 '안 가본 산'이 아니라
    //        **모든 산**을 지운다. 이 층에 게이트는 **틀린 도구**다.
    //     ⓒ 규칙의 뜻으로 돌아가면: 재민 규칙은 **안 가본 곳의 '정보'가 새면 안 된다**였고
    //        대상은 남의 집·논밭·영토였다. 산은 지형이고 실제로 수십 km 밖에서 보인다.
    //     ⇒ **면제 목록에 명시**한다. 조용히 빠지는 게 아니라 이름을 적어 두고 하네스가 그 목록을
    //        대조한다 — 나중에 누가 말없이 하나 더 빼면 판정이 깨진다.
    //     ★재민 판단 회부: 산에도 안개를 적용하려면 게이트가 아니라 **안개 마스크 앞에 그리기**가
    //        맞고, 그건 §6-c 1패스에서 지붕이 잘렸던 문제를 산에서 다시 풀어야 한다(별도 작업).
    const _GATE_FREE = { mtseg: 1 };   // ★의도적 면제 — 지형이다. 추가하려면 위 근거처럼 실측을 남겨라.
    const _GATE_R = { building: 4, hutroof: 4, simvil: 10, claim: 4, banditcamp: 4, stair_cell: 1 };
    const _seenFor = (kind, wx, wy) => {
      const cx = Math.floor(wx / CL_BUILDING_SIZE), cy = Math.floor(wy / CL_BUILDING_SIZE);
      if (_seenCell1(cx, cy)) return true;
      const R = _GATE_R[kind]; if (!R) return false;
      for (let k = 0; k < 8; k++) {
        const dx = [1, -1, 0, 0, 1, 1, -1, -1][k] * R, dy = [0, 0, 1, -1, 1, -1, 1, -1][k] * R;
        if (_seenCell1(cx + dx, cy + dy)) return true;
      }
      return false;
    };

    // === 3) 엔티티 그리기 ===
    for (const item of renderables) {
      if (item.wx === undefined) { _gateMissing++; _gateMissKind[item.kind] = (_gateMissKind[item.kind] || 0) + 1; }
      else if (_GATE_FREE[item.kind]) { _gateFree++; }
      else if (!item.isMe && !_t19.fogGateOff && !_seenFor(item.kind, item.wx, item.wy)) { _gateSkipped++; continue; }
      else if (item.wx !== undefined) _gateDrawn.push(item.wx, item.wy, item.kind);
      if (item.kind === 'claim') {
        const cl = item.cl, off = item.off, offY = item.offY || 0;
        const sc = (wx, wy) => { const pp = w2i(off + wx, offY + wy); return toScreen(pp.x, pp.y); };
        const s1 = sc(cl.x, cl.y), s2 = sc(cl.x + cl.w, cl.y), s3 = sc(cl.x + cl.w, cl.y + cl.h), s4 = sc(cl.x, cl.y + cl.h);
        // kind별 색상
        let fill, stroke, label;
        if (cl.kind === 'guild') {
          if (cl.personalAssigned) { fill = 'rgba(180,160,100,0.22)'; stroke = 'rgba(220,200,140,0.7)'; label = `🏠 ${cl.ownerName}`; }
          else { fill = 'rgba(90,154,224,0.18)'; stroke = 'rgba(120,175,235,0.95)'; label = `🏛️ ${cl.guildTribeName || cl.ownerName}`; }
        } else if (cl.kind === 'temporary') { fill = 'rgba(220,130,60,0.16)'; stroke = 'rgba(220,130,60,0.7)'; label = `⛺ ${cl.ownerName}`; }
        else { fill = 'rgba(240,198,116,0.18)'; stroke = 'rgba(240,198,116,0.8)'; label = `🏠 ${cl.ownerName}`; }

        if (cl.cells && cl.cells.length) {
          // 영토 = 셀 집합 (격자 단위) — 각 셀 채움 + 경계(이웃 안 owned) 외곽선. bbox 화면 밖이면 스킵.
          const mnx = Math.min(s1.x,s2.x,s3.x,s4.x), mxx = Math.max(s1.x,s2.x,s3.x,s4.x);
          const mny = Math.min(s1.y,s2.y,s3.y,s4.y), mxy = Math.max(s1.y,s2.y,s3.y,s4.y);
          if (!(mxx < -60 || mnx > W + 60 || mxy < -60 || mny > H + 60)) {
            const S = CL_BUILDING_SIZE;
            const own = cl._cset || (cl._cset = new Set(cl.cells.map(c => c[0] + ',' + c[1])));
            ctx.fillStyle = fill; ctx.beginPath();
            for (const [cx, cy] of cl.cells) {
              const a = sc(cx*S, cy*S), b = sc((cx+1)*S, cy*S), c = sc((cx+1)*S, (cy+1)*S), d = sc(cx*S, (cy+1)*S);
              ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y); ctx.closePath();
            }
            ctx.fill();
            ctx.strokeStyle = stroke; ctx.lineWidth = 2.5; ctx.beginPath();
            for (const [cx, cy] of cl.cells) {
              const a = sc(cx*S, cy*S), b = sc((cx+1)*S, cy*S), c = sc((cx+1)*S, (cy+1)*S), d = sc(cx*S, (cy+1)*S);
              if (!own.has(cx + ',' + (cy-1))) { ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); }
              if (!own.has((cx+1) + ',' + cy)) { ctx.moveTo(b.x,b.y); ctx.lineTo(c.x,c.y); }
              if (!own.has(cx + ',' + (cy+1))) { ctx.moveTo(c.x,c.y); ctx.lineTo(d.x,d.y); }
              if (!own.has((cx-1) + ',' + cy)) { ctx.moveTo(d.x,d.y); ctx.lineTo(a.x,a.y); }
            }
            ctx.stroke();
          }
        } else {
          // 단일 사각 (personal/temporary)
          ctx.beginPath(); ctx.moveTo(s1.x,s1.y); ctx.lineTo(s2.x,s2.y); ctx.lineTo(s3.x,s3.y); ctx.lineTo(s4.x,s4.y); ctx.closePath();
          ctx.fillStyle = fill; ctx.fill();
          ctx.strokeStyle = stroke; ctx.lineWidth = (cl.kind === 'guild') ? 2.5 : 1.2;
          ctx.setLineDash(cl.kind === 'guild' ? [] : [6,4]); ctx.stroke(); ctx.setLineDash([]);
        }
        { ctx.fillStyle = stroke; ctx.font = (cl.kind === 'guild') ? 'bold 13px sans-serif' : '11px sans-serif'; ctx.fillText(label, s1.x + 6, s1.y + 14); }
        // Phase 4d-16-c: NPC 사유지 cell에 facility sprite (emoji)
        if (cl.facilityType) {
          const cs = toScreen(w2i(off + cl.x + cl.w/2, offY + cl.y + cl.h/2).x, w2i(off + cl.x + cl.w/2, offY + cl.y + cl.h/2).y);
          // farmland는 stage별 emoji 사용
          let emoji = FACILITY_EMOJI[cl.facilityType] || '';
          if (cl.facilityType === 'farmland' && cl.farmStage != null) {
            // 에셋 5차: 4단계 3D 스프라이트 우선(미로드 시 이모지 폴백)
            const _cs = cropSprite(cl.farmStage, off + cl.x, offY + cl.y);
            if (_cs) { ctx.drawImage(_cs, cs.x - 20, cs.y - 25, 40, 40); emoji = ''; }
            else emoji = FARM_STAGE_EMOJI[cl.farmStage] || '🌾';
          }
          if (emoji) {
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255, 230, 180, 0.9)';
            ctx.fillText(emoji, cs.x, cs.y);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
            // Phase 4d-16-d: forge 가끔 연기 파티클 (시각 동작 — client only, deterministic by time)
            if (cl.facilityType === 'forge' && Math.sin((Date.now() + (cl.x + cl.y) * 13) * 0.001) > 0.8) {
              ctx.fillStyle = 'rgba(160, 80, 40, 0.5)';
              ctx.beginPath();
              ctx.arc(cs.x, cs.y - 8, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } else if (item.kind === 'road') {
        // §16 답압 길 — 셀 다이아몬드 틴트: lv1 흙길(옅음)·lv2 다져진 길(짙음). 지면 위·모든 것 아래(-950).
        const a = toScreen(w2i(item.rcx, item.rcy).x, w2i(item.rcx, item.rcy).y);
        const b2 = toScreen(w2i(item.rcx + 32, item.rcy).x, w2i(item.rcx + 32, item.rcy).y);
        const c2 = toScreen(w2i(item.rcx + 32, item.rcy + 32).x, w2i(item.rcx + 32, item.rcy + 32).y);
        const d2 = toScreen(w2i(item.rcx, item.rcy + 32).x, w2i(item.rcx, item.rcy + 32).y);
        ctx.fillStyle = item.lv >= 2 ? 'rgba(168,134,88,0.42)' : 'rgba(150,124,86,0.26)';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.closePath(); ctx.fill();
      } else if (item.kind === 'mtseg') {
        _mtDraw(ctx, item, toScreen);
      } else if (item.kind === 'ditch') {
        // ★[11차 T3 환호] 도랑 — 8차 셀 정합 스프라이트(이미지 중심=셀 중심·128px). 없으면 파인 흙 다이아 폴백.
        if (!drawBridgeSprite(item.ds, item.bx, item.by, toScreen)) {
          const x0 = item.bx - 16, y0 = item.by - 16;
          const P = (dx, dy) => { const p = w2i(x0 + dx, y0 + dy); return toScreen(p.x, p.y); };
          const a1 = P(0, 0), b1 = P(32, 0), c1 = P(32, 32), d1 = P(0, 32);
          ctx.fillStyle = '#3a2c1d';
          ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(d1.x, d1.y); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(20,14,8,0.85)'; ctx.lineWidth = 1; ctx.stroke();
        }
      } else if (item.kind === 'bridge') {
        // ★[다리 층] 통나무 널다리 상판 — 청동기 후기 고증: 통나무를 걸치고 널을 깐 다리(석조 아치 금지).
        //   셀 다이아 상판(널 결) + 물그림자. 물 위 정적 사물이라 애니메이션 없음.
        const x0 = item.bx - 16, y0 = item.by - 16;
        const P = (dx, dy) => { const p = w2i(x0 + dx, y0 + dy); return toScreen(p.x, p.y); };
        const a1 = P(0, 0), b1 = P(32, 0), c1 = P(32, 32), d1 = P(0, 32);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';   // 수면 그림자
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y + 5); ctx.lineTo(b1.x, b1.y + 5); ctx.lineTo(c1.x, c1.y + 5); ctx.lineTo(d1.x, d1.y + 5); ctx.closePath(); ctx.fill();
        // ★[에셋 9차] Blender 통나무 널다리 타일 — 로드됐으면 벡터 대신 스프라이트.
        //   렌더 규약: 카메라가 w2i와 동일한 2:1(방위 45°·고도 30°), ortho_scale=2√2 ⇒ **이미지 중심=셀 중심,
        //   셀 다이아 폭=이미지 폭의 1/2**. 따라서 셀 중심에 한 변 128px(=64×2) 정사각으로 그리면 정확히 맞는다.
        if (drawBridgeSprite(item.bs, item.bx, item.by, toScreen)) continue;
        ctx.fillStyle = '#8a6a40';            // 널 상판(스프라이트 미로드 폴백 — 이하 벡터 경로)
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(d1.x, d1.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(70,50,28,0.85)'; ctx.lineWidth = 1;
        ctx.stroke();
        // 널 결 2줄(셀 내부 분할) — 축소해도 '판자'로 읽히게
        ctx.strokeStyle = 'rgba(62,44,24,0.55)';
        ctx.beginPath();
        for (const t of [10.7, 21.3]) { const p1 = P(t, 0), p2 = P(t, 32); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); }
        ctx.stroke();
      } else if (item.kind === 'cellprop') {
        // ★[마당 소품] 화덕·장독 — 다리 타일과 같은 셀 정합 규약(이미지 중심=셀 중심·128px). 폴백은 없음(없으면 안 그림).
        drawBridgeSprite(item.key, item.gx, item.gy, toScreen);
      } else if (item.kind === 'granpile') {
        // ★[곳간② 재고 표시] 볏짚 단 더미 — 재고 1~19=작은 더미, 20+=큰 더미(G_STOCK_CAP=60 기준 1/3 분기).
        //   스프라이트는 다리 타일과 **같은 셀 정합 카메라**로 렌더돼 같은 규약(중심=셀 중심·128px)으로 그린다.
        // 재고 구간 3단계(G_STOCK_CAP=60 기준 1/3·2/3): 1~19 · 20~39 · 40+ / prop=벽 기대 소품
        const _pk = item.prop ? 'gran_prop' : (item.st >= 40 ? 'gran_pile3' : (item.st >= 20 ? 'gran_pile2' : 'gran_pile1'));
        if (item.prop) { drawBridgeSprite(_pk, item.gx, item.gy, toScreen); continue; }
        if (!drawBridgeSprite(_pk, item.gx, item.gy, toScreen)) {
          const gp = toScreen(w2i(item.gx, item.gy).x, w2i(item.gx, item.gy).y);   // 폴백: 단순 더미
          ctx.fillStyle = 'rgba(0,0,0,0.20)';
          ctx.beginPath(); ctx.ellipse(gp.x, gp.y + 2, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#c8ab63';
          ctx.beginPath(); ctx.ellipse(gp.x, gp.y - 4, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else if (item.kind === 'simvil') {
        // §4-4 Stage 4A: 마을 시뮬 영토 — 서버가 경계 셀만 전송(b: [dx,dy,mask...] 중심 상대,
        //   mask 비트 1=N 2=E 4=S 8=W = 영토 바깥과 맞닿은 변). 반투명 초록(길드 파랑과 구분).
        const v = item.v, off = item.off, offY = item.offY || 0;
        const S = CL_BUILDING_SIZE;
        const sc = (wx, wy) => { const pp = w2i(off + wx, offY + wy); return toScreen(pp.x, pp.y); };
        const fill = 'rgba(150,205,130,0.13)', stroke = 'rgba(175,225,145,0.9)';
        if (v.b && v.b.length) {
          // 경계 셀 은은한 채움 (띠) + 외곽변만 실선 → 정확한 영토 외곽선
          ctx.fillStyle = fill; ctx.beginPath();
          for (let i = 0; i < v.b.length; i += 3) {
            const cx = v.cx + v.b[i], cy = v.cy + v.b[i + 1];
            const a = sc(cx * S, cy * S), b2 = sc((cx + 1) * S, cy * S), c2 = sc((cx + 1) * S, (cy + 1) * S), d2 = sc(cx * S, (cy + 1) * S);
            ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.closePath();
          }
          ctx.fill();
          ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.beginPath();
          for (let i = 0; i < v.b.length; i += 3) {
            const cx = v.cx + v.b[i], cy = v.cy + v.b[i + 1], m = v.b[i + 2];
            const a = sc(cx * S, cy * S), b2 = sc((cx + 1) * S, cy * S), c2 = sc((cx + 1) * S, (cy + 1) * S), d2 = sc(cx * S, (cy + 1) * S);
            if (m & 1) { ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); }
            if (m & 2) { ctx.moveTo(b2.x, b2.y); ctx.lineTo(c2.x, c2.y); }
            if (m & 4) { ctx.moveTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); }
            if (m & 8) { ctx.moveTo(d2.x, d2.y); ctx.lineTo(a.x, a.y); }
          }
          ctx.stroke();
        } else {
          // 구DB(경계 미영속) 폴백 — 중심+반경 점선 원 (월드 좌표 24각형 → 투영·줌에 자동 정합)
          const r = v.r || 800;
          ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
          ctx.beginPath();
          for (let a2 = 0; a2 <= 24; a2++) {
            const th = a2 / 24 * Math.PI * 2;
            const p = sc(v.cx * S + 16 + Math.cos(th) * r, v.cy * S + 16 + Math.sin(th) * r);
            if (a2 === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke(); ctx.setLineDash([]);
        }
        // §19/§2 4파: 영토 크립 링 — econ land.size(매일 1셀 단위 성장)의 등가 반경(호박색 점선·sim_village_day 갱신).
        //   공간 실물화(bnd)는 시딩 스냅샷(부채 — 계획서 §2) — 이 링이 경제 영토의 '현재 크기'를 정직 표시.
        if (v.tr) {
          ctx.strokeStyle = 'rgba(222,202,132,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
          ctx.beginPath();
          for (let a2 = 0; a2 <= 28; a2++) { const th = a2 / 28 * Math.PI * 2; const p = sc(v.cx * S + 16 + Math.cos(th) * v.tr, v.cy * S + 16 + Math.sin(th) * v.tr); if (a2 === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
          ctx.stroke(); ctx.setLineDash([]);
        }
        { // 라벨 — 회관 위 (길드 라벨과 동급, 인구는 sim_village_day가 갱신)
          const ctr = sc(v.cx * S + 16, v.cy * S + 16);
          ctx.fillStyle = stroke; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(`🏘️ ${v.name}${v.pop != null ? ' · ' + v.pop + '명' : ''}`, ctr.x, ctr.y - 46);
          ctx.textAlign = 'start';
        }
      } else if (item.kind === 'banditcamp') {
        // §11 도적: 소굴·야영 마커 1종 — 검은 막사+🏴(랩 렌더 동형 최소판). n>0=점유 단(인원 라벨), n=0=빈 소굴(재결성 대기, 흐림).
        const bc = item.bc, boff = item.off, boffY = item.offY || 0;
        const bp = w2i(boff + bc.x, boffY + bc.y);
        const sp = toScreen(bp.x, bp.y);
        ctx.globalAlpha = bc.n > 0 ? 0.95 : 0.4;
        ctx.fillStyle = '#241d18';
        ctx.beginPath(); ctx.moveTo(sp.x - 14, sp.y + 8); ctx.lineTo(sp.x, sp.y - 10); ctx.lineTo(sp.x + 14, sp.y + 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(200,80,60,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🏴', sp.x, sp.y - 12);
        if (bc.n > 0) { ctx.fillStyle = '#e8b0a0'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('도적 ' + bc.n + '명', sp.x, sp.y + 22); }
        ctx.textAlign = 'start'; ctx.globalAlpha = 1;
      } else if (item.kind === 'resource') {
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        // ★★[재민 확정 2026-08-06] **식물·무생물은 항상 그려진다.** 뒤돌았다고 숲이 사라지면 안 된다.
        //   Phase 14.39 가 자원에도 `entityVisibility`(현재 facing 부채꼴 × 벽 LoS)를 걸어 뒀는데,
        //   그건 **살아 움직이는 것**(사람·동물)을 위한 판정이다. 나무·바위·광맥·덤불·약초는
        //   지형에 가까운 정적 사물이라 시선 방향과 무관하게 그 자리에 있어야 한다.
        //   거리 vignette 는 남긴다 — AOI(650px) 경계에서 튀어나오는 팝인을 무르게 하는 장치다.
        const vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        ctx.globalAlpha = vis;
        if (item.r.type === 'tree') drawTreeIso(s.x, s.y, item.r.r || 8, item.r.h || 60, item.ax, item.ay);
        else if (item.r.type === 'rock') drawRockIso(s.x, s.y, item.ax, item.ay);
        else if (item.r.type === 'berry_bush') drawBerryBushIso(s.x, s.y, item.ax, item.ay);
        else if (item.r.type === 'water_pool') drawWaterPoolIso(s.x, s.y);
        else if (item.r.type === 'herb') drawHerbIso(s.x, s.y, item.ax, item.ay);
        else if (item.r.type === 'ore') drawOreIso(s.x, s.y, item.ax, item.ay);
        else if (item.r.type === 'meteorite') drawMeteoriteIso(s.x, s.y, item.ax, item.ay);   // ★운철 낙하지
        if (item.r.hp < item.r.maxHp) {
          const pct = item.r.hp / item.r.maxHp;
          ctx.fillStyle = '#222'; ctx.fillRect(s.x - 10, s.y - 28, 20, 3);
          ctx.fillStyle = '#9adb6e'; ctx.fillRect(s.x - 10, s.y - 28, 20 * pct, 3);
        }
        ctx.globalAlpha = 1;
      } else if (item.kind === 'ground_item') {
        const s = toScreen(item.iso.x, item.iso.y);
        const gi = item.gi;
        // ★[재민 확정 2026-08-06] 바닥에 떨어진 물건도 **항상 보인다** — 내가 떨군 걸 뒤돌았다고
        //   못 찾으면 안 된다. 거리 vignette 만 남긴다.
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        const vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        ctx.globalAlpha = vis;
        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 3, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        // 아이콘 — 3D 렌더 이미지 우선, 미로드 시 이모지 폴백
        drawItemIcon(ctx, gi.item, s.x, s.y - 4, 18);
        // 개수 ×N (>1일 때)
        if (gi.count > 1) {
          ctx.font = '9px sans-serif'; ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 2;
          ctx.strokeText(`×${gi.count}`, s.x + 9, s.y + 5);
          ctx.fillText(`×${gi.count}`, s.x + 9, s.y + 5);
        }
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 1;
      } else if (item.kind === 'player') {
        // 14.49-e7ad: 위층 player 안 그림 (본인 제외). 아래층은 정상 alpha.
        const pFloor = item.floor || 0;
        if (!item.isMe && pFloor > myFloor) continue;
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        let vis = item.isMe ? 1 : Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        // Phase 14.39: 본인 외 player는 시야 뒤면 안 보임
        if (!item.isMe) {
          vis *= entityVisibility(item.ax, item.ay, d);
          if (vis < 0.05) continue;
        }
        ctx.globalAlpha = vis;
        // Phase 14.35+14.37: 본인은 키입력/lastAttack/facing, 다른 player는 vx/vy/lastAttackAt
        const now = performance.now();
        let moving = false, attackPhase = 0, fvx = 0, fvy = 0;
        if (item.isMe) {
          const { wx, wy } = worldKeysDir();
          moving = (wx !== 0 || wy !== 0);
          if (moving) { myFacingVx = wx; myFacingVy = wy; }
          fvx = myFacingVx; fvy = myFacingVy;
          const dt = now - myLastAttackAt;
          if (dt < 300) attackPhase = 1 - dt / 300;
        } else {
          const ovx = item.vx || 0, ovy = item.vy || 0;
          moving = (Math.abs(ovx) + Math.abs(ovy)) > 5;
          // 다른 player facing — others에 lastFvx/Fvy 캐시 필요. 일단 현재 vx/vy 또는 prev
          if (moving) { fvx = ovx; fvy = ovy; }
          else { fvx = item._fvx || 1; fvy = item._fvy || 0; }
          if (item.lastAttackAt && now - item.lastAttackAt < 300) attackPhase = 1 - (now - item.lastAttackAt) / 300;
        }
        // Phase 14.41: 다운 상태 — 본인은 myIsDown, 다른 사람은 downStates Map
        const downFlag = item.isMe ? myIsDown : !!downStates.get(item.pid);
        drawPlayerIso(s.x, s.y, item.name, item.color, item.isMe, { moving, attackPhase, fvx, fvy, isDown: downFlag, war: item._war, bt: item.bt, bs: item.bs, bc: item.bc, br: item.br, cap: item.cap, act: item.act });
        // HP bar for others (전쟁 병사는 만피여도 항상 표시 + 진영색 테두리)
        if (!item.isMe) {
          const o = item.hp !== undefined ? item : null;
          if (o && o.hp !== undefined && o.maxHp && (o.hp < o.maxHp || item._war)) {
            ctx.fillStyle = '#222'; ctx.fillRect(s.x - 14, s.y - 30, 28, 4);
            ctx.fillStyle = item._war ? (WAR_SIDE_COL[item.bs | 0] || '#d85a5a') : '#d85a5a';
            ctx.fillRect(s.x - 14, s.y - 30, 28 * Math.max(0, Math.min(1, o.hp / o.maxHp)), 4);
          }
        }
        ctx.globalAlpha = 1;
        const bubble = speechBubbles.get(item.pid);
        if (bubble && performance.now() < bubble.until) {
          drawSpeechBubble(s.x, s.y - 32, bubble.text);
        }
      } else if (item.kind === 'building') {
        const s = toScreen(item.iso.x, item.iso.y);
        const bf = item.b.floor || 0;
        const bType = item.b.type;
        // 14.49-e7ad: 아래층 정상 alpha 1.0 (사용자 요구). z-sort로 위층이 우선 덮음.
        if (bf < myFloor) {
          ctx.globalAlpha = 1.0;
        }
        // 14.49-e7ag: 위층 처리
        // - floor: 가장 위쪽(max floor)만 그림. BFS cutaway 안이면 skip.
        // - wall: 외벽만. BFS cutaway 안이면 skip.
        // - 그 외 (chest, farmland): BFS cutaway 안이면 skip. 그 외는 기존대로 skip.
        else if (bf > _viewFloor) {
          // ★[배치 18 ③] 재민 확정 문법: **실내면 위층 완전 숨김 · 밖이면 전체 복원**.
          //   밖에서는 아래 옛 BFS 부분 숨김을 타지 않는다 — 2층집이 2층집으로 보여야 한다.
          if (!_hideAbove) { ctx.globalAlpha = 1.0; }
          else continue;
        }
        // ↑ 위 분기가 옛 '위층 부분 숨김(aboveCutawayCells BFS)'을 대체했다 — 재민 확정 문법이
        //   "위층 = 완전 숨김 · 밖 = 전체 복원"이라 BFS 로 골라 숨길 이유가 없어졌다.
        //   (그 BFS 는 '내 칸 **바로 위에** 천장 타일이 있을 때만' 켜져서, 천장에 구멍이 하나만 있어도
        //    위층이 통째로 드러나던 반쪽 규칙이었다.)
        // 14.49-e7ac: wall edge 방향성 기반 cutaway
        // 가로 wall (side='N'): dy로 판정. dy > 8 = S 벽 → cutaway.
        // 세로 wall (side='E'): dx로 판정. dx > 8 = E 벽 → cutaway.
        else if ((bType === 'wall' || bType === 'fence') && bf === myFloor) {
          const dx = item.ax - myAbsPredicted.x;
          const dy = item.ay - myAbsPredicted.y;
          const side = item.b.data?.side;
          let isCutaway = false;
          if (side === 'N' && dy > 8) isCutaway = true;
          else if (side === 'E' && dx > 8) isCutaway = true;
          // ★실내 게이트[사용자 지적]: 페이드는 "내가 그 건물 안"일 때만 — 원 의도(입실 시 남·동벽이 눕는 실내감) 복원.
          if (isCutaway) {
            const _rect = item.b.data?.hut || item.b.data?.bld;   // 움집/큰집 = 발자국 렉트 판정(문 개구로 방 BFS가 새는 구조)
            if (_rect) {
              // ★★[배치 17 ①] 렉트는 **존 로컬 셀**이다 — `_renderMyCx`(절대)로 재던 것이
              //   "남·동벽이 안 눕는다"의 원인이었다(한반도 offset 409,984 → 셀 13,775 vs 렉트 960~967).
              //   renderable 에 실어 온 존 원점(off/offY)으로 로컬 셀을 다시 잰다.
              const _lcx = Math.floor((myAbsPredicted.x - (item.off || 0)) / CL_BUILDING_SIZE);
              const _lcy = Math.floor((myAbsPredicted.y - (item.offY || 0)) / CL_BUILDING_SIZE);
              isCutaway = (myFloor || 0) === 0 && _lcx >= _rect[0] && _lcx <= _rect[2] && _lcy >= _rect[1] && _lcy <= _rect[3];
            } else if (_myRoom) {                                  // 일반 건물 = 방 시스템: 이 벽이 '내 방'에 접해 있을 때만
              let _wcx, _wcy, _ocx, _ocy;
              // 변 정규화(서버 findEdgeWall 과 같다): N 벽 (cx,cy) 는 (cx,cy)와 (cx,cy-1) 사이 · E 벽은 (cx,cy)와 (cx+1,cy) 사이.
              // ★[배치 18 ②] E 갈래가 한 칸 서쪽으로 밀려 있었다(`-1` 뒤 `+1`) — (cx-1,cy)·(cx,cy) 를 보고 있었다.
              //   동쪽 바깥벽에서는 우연히 같은 답이 나와 드러나지 않던 선재 오류다. 정본 정규화로 맞춘다.
              if (side === 'N') { _wcx = Math.floor(item.ax / CL_BUILDING_SIZE); _wcy = Math.floor(item.ay / CL_BUILDING_SIZE); _ocx = _wcx; _ocy = _wcy - 1; }
              else { _wcx = Math.floor(item.ax / CL_BUILDING_SIZE); _wcy = Math.floor(item.ay / CL_BUILDING_SIZE); _ocx = _wcx + 1; _ocy = _wcy; }
              isCutaway = cellRoomCache.get(`${_wcx}_${_wcy}_${bf}`) === _myRoom || cellRoomCache.get(`${_ocx}_${_ocy}_${bf}`) === _myRoom;
            } else isCutaway = false;                              // 실외 = 전 벽 불투명
          }
          if (isCutaway) {
            const dist = Math.hypot(dx, dy);
            const NEAR = 8 * CL_BUILDING_SIZE;
            const FAR  = 14 * CL_BUILDING_SIZE;
            const minA = bType === 'fence' ? 0.3 : 0.05;
            if (dist < NEAR) {
              ctx.globalAlpha = minA;
            } else if (dist < FAR) {
              const t = (dist - NEAR) / (FAR - NEAR);
              ctx.globalAlpha = minA + (1 - minA) * t;
            }
          }
        }
        drawBuildingIso(s.x, s.y, item.b.type, item.b);
        ctx.globalAlpha = 1;
      } else if (item.kind === 'hutroof') {
        // ★v3 반수혈 움집 지붕 — 베이크 스프라이트 1장(전 움집 공용). 앵커=지붕 로컬 원점 iso.
        const s = toScreen(item.iso.x, item.iso.y);
        { const _rimg = item.img || _hutRoofC; ctx.drawImage(_rimg, s.x - _rimg._ox, s.y - _rimg._oy); }   // ★[에셋 2차] 움집·큰집 지붕·곳간 통짜 공용 합성
      } else if (item.kind === 'stair_cell') {
        // 14.49-e7ah: stair cell N의 8 sub-step만 그림. z-sort 정확.
        const s = toScreen(item.iso.x, item.iso.y);
        const bf = item.b.floor || 0;
        const cx = Math.floor(item.ax / CL_BUILDING_SIZE);
        const cy = Math.floor(item.ay / CL_BUILDING_SIZE);
        if (bf > _viewFloor && _hideAbove) continue;   // ★[배치 18 ③] 계단도 같은 문법 — 실내면 위층 숨김
        drawStairCellPart(s.x, s.y, item.cellN, item.b);
      } else if (item.kind === 'mob') {
        // 14.49-e7ad: 위층 mob 안 그림. 아래층은 정상 alpha.
        const mFloor = item.m.floor || 0;
        if (mFloor > myFloor) continue;
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        let vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        vis *= entityVisibility(item.ax, item.ay, d);
        if (vis < 0.05) continue;
        ctx.globalAlpha = vis;
        drawMobIso(s.x, s.y, item.m);
        ctx.globalAlpha = 1;
      } else if (item.kind === 'corpse') {
        // Phase 5-7: 사체 — emoji
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        // ★[재민 확정 2026-08-06] 시체도 **항상 보인다**(더는 살아 움직이는 것이 아니다).
        const vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        ctx.globalAlpha = vis;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', s.x, s.y);
        ctx.globalAlpha = 1;
      }
    }
    _mtFlushFade(ctx);   // ★흐린 산 한 겹을 여기서 한 번에 덮는다(겹침 누적 방지)

    // === 14.49-e7o: 옛 vignette/directional shadow 제거 — fog of war가 시야 전담 (3-state 깔끔) ===

    // === 4-c) 14.49-e7j: PZ식 visibility polygon (정석 알고리즘) ===
    // 1) 시야 범위 내 wall 수집 + 경계 박스
    // 2) 각 endpoint마다 3 ray (theta-ε, theta, theta+ε) cast
    // 3) 각 ray와 가장 가까운 wall 교점
    // 4) 교점 각도순 정렬 → visibility polygon
    // 5) 화면 dark fill → destination-out으로 polygon 안 투명하게
    {
      // K21: fog도 카메라와 같은 보간 위치(_camAbs=myAbsRender) 기준. myAbsPredicted(30Hz 계단)을 쓰면
      //   땅은 myAbsRender로 매끄럽게 흐르는데 부채꼴만 30Hz로 어긋나 경계가 떨림. 같은 기준으로 묶어 떨림 제거.
      const px = _camAbs.x, py = _camAbs.y;
      const myCx = Math.floor(px / CL_BUILDING_SIZE);
      const myCy = Math.floor(py / CL_BUILDING_SIZE);
      // wall iteration radius (벽 수집 범위) vs ray cast range (광선 닿는 거리)
      // ray range는 화면 너비보다 충분히 커야 화면 가장자리까지 시야 정상
      const SHADOW_RANGE_CELLS = 16; // 벽 수집은 16 cell만 (perf)
      const MAX_RANGE = Math.max(W, H) * 2; // ray range는 화면 2배 (시야 화면 전체 커버)
      ensureWallMap();
      function w2sx(wx, wy) { return (wx - wy) - (px - py) + W/2; }
      function w2sy(wx, wy) { return (wx + wy) * 0.5 - (px + py) * 0.5 + H/2; }
      // 1) 벽 수집
      const segs = [];
      for (const key of clWallCellMap.keys()) {
        const [cxs, cys, side, fs] = key.split('_');
        const cx = +cxs, cy = +cys, f = +fs;
        if (f !== myFloor) continue;
        if (Math.abs(cx - myCx) > SHADOW_RANGE_CELLS) continue;
        if (Math.abs(cy - myCy) > SHADOW_RANGE_CELLS) continue;
        if (side === 'N') {
          segs.push({ ax: cx * CL_BUILDING_SIZE, ay: cy * CL_BUILDING_SIZE,
                      bx: (cx + 1) * CL_BUILDING_SIZE, by: cy * CL_BUILDING_SIZE });
        } else {
          segs.push({ ax: (cx + 1) * CL_BUILDING_SIZE, ay: cy * CL_BUILDING_SIZE,
                      bx: (cx + 1) * CL_BUILDING_SIZE, by: (cy + 1) * CL_BUILDING_SIZE });
        }
      }
      // Phase 5-8: 나무도 시야 차단 — 6각형으로 근사.
      // 시야 알고리즘이 O(6 × 선분²)라, 밀집 숲(나무 수백)에선 선분 수천 개 → 프레임당 수백만~천만 교차 검사로
      // 메인스레드가 멈춤(→ 서버 tick 못 읽어 orphan). 그래서 '가까운 N그루'만 시야를 막게 상한을 둔다.
      //   가까운 나무가 어차피 먼 나무를 가리므로 시각적 차이는 거의 없고, 비용은 O(상한²)로 고정.
      const pc = conns.get(primaryZoneId);
      if (pc) {
        const oxz = pc.meta?.worldOffsetX || 0, oyz = pc.meta?.worldOffsetY || 0;
        const SHADOW_RANGE_PX = SHADOW_RANGE_CELLS * CL_BUILDING_SIZE;
        const MAX_TREE_OCCLUDERS = 22;   // 시야 막는 나무 최대 수 (밀도 무관 비용 상한)
        const treeOcc = [];
        for (const r of pc.resources.values()) {
          if (r.type !== 'tree' || !r.r) continue;
          const tx = r.x + oxz, ty = r.y + oyz;
          const ddx = tx - px, ddy = ty - py;
          if (Math.abs(ddx) > SHADOW_RANGE_PX || Math.abs(ddy) > SHADOW_RANGE_PX) continue;
          const d2 = ddx * ddx + ddy * ddy;
          const occR = r.r * 1.7;
          if (d2 < occR * occR) continue;   // 나무 바로 밑(캐노피 안)이면 제외 — 사방 블랙아웃 방지
          treeOcc.push({ tx, ty, tr: r.r, d2 });
        }
        if (treeOcc.length > MAX_TREE_OCCLUDERS) {
          treeOcc.sort((a, b) => a.d2 - b.d2);   // 가까운 순
          treeOcc.length = MAX_TREE_OCCLUDERS;
        }
        for (const t of treeOcc) {
          const N = 6, tr = t.tr * 1.7;   // 캐노피 크기로 시야 차단 (줄기 r보다 크게 → 더 많이 가림, 크기 비례)
          for (let i = 0; i < N; i++) {
            const a1 = (i / N) * Math.PI * 2;
            const a2 = ((i + 1) / N) * Math.PI * 2;
            segs.push({
              ax: t.tx + Math.cos(a1) * tr, ay: t.ty + Math.sin(a1) * tr,
              bx: t.tx + Math.cos(a2) * tr, by: t.ty + Math.sin(a2) * tr,
            });
          }
        }
      }
      // ★[11차 재민 확정] 산은 완벽한 콜라이더다 — **건너편이 절대 안 보인다**.
      //   지금까지 바위 시야 차단은 야생 AI(server/wildlife.js losRk)에만 걸려 있어서, 늑대는 산 너머를
      //   못 보는데 플레이어 화면에는 산 너머가 그대로 보였다. 그 비대칭을 없앤다.
      //   구현: 바위 덩어리의 **실루엣**(비바위와 맞닿은 변)만 선분으로 넣는다. 안쪽 변은 어차피
      //   바깥 변에 가려 시야에 영향이 없고, 넣으면 선분만 수백 개 늘어 O(선분²)를 터뜨린다.
      //   비용 고정 장치 두 겹:
      //     ① 플레이어가 **셀을 옮길 때만** 다시 만든다(프레임마다 1681번 지형 판정하면 메인루프가 멈춘다).
      //     ② 같은 줄로 이어지는 변은 하나로 합치고(런 병합), 그래도 많으면 가까운 순 상한.
      //   나무(MAX_TREE_OCCLUDERS 22)와 같은 사고방식 — 가까운 것이 먼 것을 어차피 가린다.
      {
        const ROCK_RANGE_CELLS = 20;         // 수집 반경(셀) — 화면 대각선보다 넉넉
        const MAX_ROCK_SEGS = 90;            // 선분 상한(런 병합 후) — 나무 132선분과 합쳐도 O(선분²)가 감당된다
        const rcx = Math.floor(px / 32), rcy = Math.floor(py / 32);
        let rc = window._rockOccCache;
        if (!rc || rc.cx !== rcx || rc.cy !== rcy || rc.zid !== primaryZoneId) {
          const R = ROCK_RANGE_CELLS, segsR = [];
          const isR = (cx, cy) => isRockAtAbs(cx * 32 + 16, cy * 32 + 16);
          // 가로 변(N/S): y줄마다 x로 훑으며 '바위인데 위(아래)가 비바위'인 구간을 런으로 묶는다
          for (let cy = rcy - R; cy <= rcy + R; cy++) {
            for (const [dy, edge] of [[-1, 0], [1, 1]]) {
              let run = null;
              for (let cx = rcx - R; cx <= rcx + R + 1; cx++) {
                const on = cx <= rcx + R && isR(cx, cy) && !isR(cx, cy + dy);
                if (on) { if (!run) run = [cx, cx]; else run[1] = cx; }
                else if (run) {
                  const y = (cy + edge) * 32;
                  segsR.push({ ax: run[0] * 32, ay: y, bx: (run[1] + 1) * 32, by: y });
                  run = null;
                }
              }
            }
          }
          // 세로 변(W/E)
          for (let cx = rcx - R; cx <= rcx + R; cx++) {
            for (const [dx, edge] of [[-1, 0], [1, 1]]) {
              let run = null;
              for (let cy = rcy - R; cy <= rcy + R + 1; cy++) {
                const on = cy <= rcy + R && isR(cx, cy) && !isR(cx + dx, cy);
                if (on) { if (!run) run = [cy, cy]; else run[1] = cy; }
                else if (run) {
                  const x = (cx + edge) * 32;
                  segsR.push({ ax: x, ay: run[0] * 32, bx: x, by: (run[1] + 1) * 32 });
                  run = null;
                }
              }
            }
          }
          rc = window._rockOccCache = { cx: rcx, cy: rcy, zid: primaryZoneId, segs: segsR };
        }
        let rs = rc.segs;
        if (rs.length > MAX_ROCK_SEGS) {
          const d2 = (s) => { const mx = (s.ax + s.bx) / 2 - px, my = (s.ay + s.by) / 2 - py; return mx * mx + my * my; };
          rs = rs.slice().sort((a, b) => d2(a) - d2(b)).slice(0, MAX_ROCK_SEGS);
        }
        for (const s of rs) segs.push(s);
      }
      // 경계 박스 4변 (ray 종료점) — MAX_RANGE 큰 박스
      const bMin = MAX_RANGE;
      segs.push({ ax: px - bMin, ay: py - bMin, bx: px + bMin, by: py - bMin });
      segs.push({ ax: px + bMin, ay: py - bMin, bx: px + bMin, by: py + bMin });
      segs.push({ ax: px + bMin, ay: py + bMin, bx: px - bMin, by: py + bMin });
      segs.push({ ax: px - bMin, ay: py + bMin, bx: px - bMin, by: py - bMin });
      // 2) endpoints + angles
      const eps = 0.0001;
      const angles = [];
      for (const s of segs) {
        const a1 = Math.atan2(s.ay - py, s.ax - px);
        const a2 = Math.atan2(s.by - py, s.bx - px);
        angles.push(a1 - eps, a1, a1 + eps, a2 - eps, a2, a2 + eps);
      }
      // ray-segment intersection. returns t (ray param) or null.
      function rsi(dx, dy, s) {
        const sx = s.bx - s.ax, sy = s.by - s.ay;
        const den = dx * sy - dy * sx;
        if (Math.abs(den) < 1e-10) return null;
        const t = ((s.ax - px) * sy - (s.ay - py) * sx) / den;
        const u = ((s.ax - px) * dy - (s.ay - py) * dx) / den;
        if (t > 0 && u >= 0 && u <= 1) return t;
        return null;
      }
      // 14.49-e7u: facing cone 적용. cone 안 angle만 ray cast → fan polygon
      const facingLen = Math.hypot(myFacingVx, myFacingVy);
      const hasFacing = facingLen > 0.001;
      const fxn = hasFacing ? myFacingVx / facingLen : 0;
      const fyn = hasFacing ? myFacingVy / facingLen : 0;
      const CONE_COS = -0.34; // cos(110°)
      const halfCone = Math.acos(CONE_COS);
      const facingAngle = hasFacing ? Math.atan2(fyn, fxn) : 0;
      function angleInCone(a) {
        if (!hasFacing) return true;
        let diff = a - facingAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return Math.abs(diff) <= halfCone;
      }
      // cone boundary ray도 추가
      const filteredAngles = [];
      if (hasFacing) {
        filteredAngles.push(facingAngle - halfCone + 0.001, facingAngle + halfCone - 0.001);
      }
      for (const a of angles) {
        if (angleInCone(a)) filteredAngles.push(a);
      }
      // 3) 각 각도마다 closest hit
      const hits = [];
      for (const a of filteredAngles) {
        const dx = Math.cos(a), dy = Math.sin(a);
        let best = MAX_RANGE;
        for (const s of segs) {
          const t = rsi(dx, dy, s);
          if (t !== null && t < best) best = t;
        }
        hits.push({ a, x: px + dx * best, y: py + dy * best });
      }
      // 4) facing 기준 normalized angle로 정렬 (cone이 atan2 wrap 가로지를 때 sort 잘못 방지)
      function normalizedDiff(a) {
        let d = a - facingAngle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return d;
      }
      if (hasFacing) {
        hits.sort((u, v) => normalizedDiff(u.a) - normalizedDiff(v.a));
      } else {
        hits.sort((u, v) => u.a - v.a);
      }
      // 5) Off-screen mask canvas — fog of war 적용
      //    - unseen (한 번도 못 봤음): 완전 검은색 alpha 1.0
      //    - seen (한 번 봤지만 현재 시야 밖): 어둠 alpha 0.5
      //    - visible (지금 보고 있음): hole (alpha 0)
      // FOG_MASK_M: 화면보다 사방 64px 크게 — 다음 frame 합성 시 카메라 델타만큼 밀어도
      // 가장자리에 빈 띠(검은 strip 깜빡임)가 안 생기게 하는 여유분.
      const FOG_MASK_M = 64;
      if (!window._shadowMask || window._shadowMask.width !== W + FOG_MASK_M * 2 || window._shadowMask.height !== H + FOG_MASK_M * 2) {
        window._shadowMask = document.createElement('canvas');
        window._shadowMask.width = W + FOG_MASK_M * 2;
        window._shadowMask.height = H + FOG_MASK_M * 2;
      }
      if (!window._seenChunks) window._seenChunks = new Map(); // "chX_chY" → Set(packed cx*65536+cy)
      const seenChunks = window._seenChunks;
      const mc = window._shadowMask;
      const mctx = mc.getContext('2d');

      // 14.49-e7u: cumulative polygon 방식 (cell stairstep 0, polygon 직선)
      // - visible polygon = fan-shape (cone 안 ray cast 결과)
      // - + 플레이어 중심 small circle (cone 무관 항상 보이는 가까운 원)
      // - cumulative seen path = visible polygon들의 누적 union (world coord)
      // - mask: 검은색 → seen alpha 0.8 빼기 → visible alpha 1.0 빼기 → 합성

      // visible polygon (world coord) — fan + close circle
      const visibleWorldPath = new Path2D();
      const CLOSE_RADIUS = 128; // 4 cell, cone 무관 visible
      if (hits.length > 0) {
        if (hasFacing) {
          // fan: player center → sorted hits → back to player
          visibleWorldPath.moveTo(px, py);
          for (const h of hits) {
            visibleWorldPath.lineTo(h.x, h.y);
          }
          visibleWorldPath.lineTo(px, py);
        } else {
          // full 360°
          visibleWorldPath.moveTo(hits[0].x, hits[0].y);
          for (let i = 1; i < hits.length; i++) {
            visibleWorldPath.lineTo(hits[i].x, hits[i].y);
          }
          visibleWorldPath.closePath();
        }
      }
      // + 가까운 영역 (cone 무관, full 360°) — 벽 막힘 ray cast로 wall clip
      const CLOSE_RAYS = 36;
      const closeHits = [];
      for (let i = 0; i < CLOSE_RAYS; i++) {
        const a = (i / CLOSE_RAYS) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        let best = CLOSE_RADIUS;
        for (const s of segs) {
          const t = rsi(dx, dy, s);
          if (t !== null && t < best) best = t;
        }
        closeHits.push({ x: px + dx * best, y: py + dy * best });
      }
      visibleWorldPath.moveTo(closeHits[0].x, closeHits[0].y);
      for (let i = 1; i < closeHits.length; i++) {
        visibleWorldPath.lineTo(closeHits[i].x, closeHits[i].y);
      }
      visibleWorldPath.closePath();

      // 14.49-e7y → rewrite: visible polygon을 1px=1cell 미니 캔버스에 rasterize해서 seen 마킹.
      // 옛 isPointInPath(셀 중심 1점, FOG_RANGE 18셀) 방식의 빈틈 수정:
      //   1) 화면에 보이는 먼 영역(~47셀)이 seen으로 기록 안 돼 "봤는데 새까만" 버그
      //   2) 부분만 보인 셀(시야 부채꼴 가장자리)이 기록 안 됨 → 커버리지 ≥25%면 seen
      const FOG_MARK_RANGE = 48; // TILE_RENDER_RADIUS(1500px)/32 ≈ 47셀
      const G = FOG_MARK_RANGE * 2 + 1;
      if (!window._fogGridCv || window._fogGridCv.width !== G) {
        window._fogGridCv = document.createElement('canvas');
        window._fogGridCv.width = G; window._fogGridCv.height = G;
      }
      const gctx = window._fogGridCv.getContext('2d', { willReadFrequently: true });
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.clearRect(0, 0, G, G);
      // world px → grid px: scale 1/32, 원점 = cell (myCx-R, myCy-R)
      gctx.setTransform(1 / 32, 0, 0, 1 / 32, -(myCx - FOG_MARK_RANGE), -(myCy - FOG_MARK_RANGE));
      gctx.fillStyle = '#fff';
      gctx.fill(visibleWorldPath);
      const gdata = gctx.getImageData(0, 0, G, G).data;
      for (let gj = 0; gj < G; gj++) {
        for (let gi = 0; gi < G; gi++) {
          if (gdata[(gj * G + gi) * 4 + 3] < 64) continue; // 커버리지 < 25%
          const scx = myCx - FOG_MARK_RANGE + gi;
          const scy = myCy - FOG_MARK_RANGE + gj;
          const chKey = `${scx >> 4}_${scy >> 4}`;
          let chSet = seenChunks.get(chKey);
          if (!chSet) { chSet = new Set(); seenChunks.set(chKey, chSet); }
          chSet.add(scx * 65536 + scy); // packed int (cx<19100, cy<11900 — 안전)
        }
      }

      // mask render — 매 frame mode 명시 (이전 frame destination-out 상태 잔존 방지)
      mctx.globalCompositeOperation = 'source-over';
      mctx.clearRect(0, 0, mc.width, mc.height);
      mctx.fillStyle = 'rgba(0,0,0,1.0)';
      mctx.fillRect(0, 0, mc.width, mc.height);

      // (i) seen cells: iso diamond single path → destination-out alpha 0.8 (살짝 어둠)
      // 청크(16셀) 단위 저장 — 탐험으로 seen이 수만 개로 늘어도 viewport 주변 청크만 순회
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = 'destination-out';
      mctx.fillStyle = 'rgba(0,0,0,0.8)';
      // ★경로를 Path2D 로 한 번만 만들어 두 마스크에 **같은 기하**로 뚫는다(사본 금지).
      //   3단계 마스크는 0.8(살짝 어둠), 미탐사 마스크는 1.0(완전 제거) — 알파만 다르다.
      const seenPath = new Path2D();
      const halfW = 32, halfH = 16, expand = 1;
      const FOG_DRAW_RANGE = 52; // 화면 끝까지 (옛 35는 가장자리 누락)
      const ch0x = (myCx - FOG_DRAW_RANGE) >> 4, ch1x = (myCx + FOG_DRAW_RANGE) >> 4;
      const ch0y = (myCy - FOG_DRAW_RANGE) >> 4, ch1y = (myCy + FOG_DRAW_RANGE) >> 4;
      for (let chx = ch0x; chx <= ch1x; chx++) {
        for (let chy = ch0y; chy <= ch1y; chy++) {
          const chSet = seenChunks.get(`${chx}_${chy}`);
          if (!chSet) continue;
          for (const packed of chSet) {
            const cxs = Math.floor(packed / 65536), cys = packed % 65536;
            const wxC = (cxs + 0.5) * CL_BUILDING_SIZE;
            const wyC = (cys + 0.5) * CL_BUILDING_SIZE;
            // mask canvas는 화면보다 +FOG_MASK_M 큼 — 좌표를 M만큼 평행이동
            const sxC = w2sx(wxC, wyC) + FOG_MASK_M;
            const syC = w2sy(wxC, wyC) + FOG_MASK_M;
            if (sxC < -64 || sxC > mc.width + 64 || syC < -32 || syC > mc.height + 32) continue;
            seenPath.moveTo(sxC - halfW - expand, syC);
            seenPath.lineTo(sxC, syC - halfH - expand);
            seenPath.lineTo(sxC + halfW + expand, syC);
            seenPath.lineTo(sxC, syC + halfH + expand);
            seenPath.closePath();
          }
        }
      }
      mctx.fill(seenPath);

      // (ii) visible polygon: world → screen iso transform → destination-out alpha 1.0 (밝음)
      mctx.save();
      mctx.setTransform(1, 0.5, -1, 0.5, W/2 - (px - py) + FOG_MASK_M, H/2 - (px + py)/2 + FOG_MASK_M);
      mctx.fillStyle = 'rgba(0,0,0,1.0)';
      mctx.fill(visibleWorldPath);
      mctx.restore();

      // mask 생성 시점의 플레이어 위치 기록 — 다음 frame 합성 시 카메라 델타 보정용
      window._shadowMaskPx = px;
      window._shadowMaskPy = py;

      // ★[재민 확정 2026-08-06] 합성은 **이 블록 아래**, 화살까지 다 그린 뒤에 한다.
      //   (옛 주석: "다음 frame entity render 전에 합성" — 그 배치가 미탐사 위 누출의 원인이었다.)
    }

    // === Phase 5-I: 화살 발사체 렌더 (절대좌표 → 등속 외삽 → iso 화면) ===
    if (window._arrows && window._arrows.size) {
      const tnow = performance.now();
      for (const [aid, ar] of window._arrows) {
        const dt = (tnow - ar.t0) / 1000;
        if (dt > 4.5) { window._arrows.delete(aid); continue; } // 안전 만료
        const ax = ar.ax + ar.vx * dt, ay = ar.ay + ar.vy * dt;
        const iso = w2i(ax, ay);
        const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
        const sx = iso.x - myIso.x + W / 2, sy = iso.y - myIso.y + H / 2;
        if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue;
        // 화살: 진행 방향 짧은 선 + 촉
        const vlen = Math.hypot(ar.vx, ar.vy) || 1;
        const ex = (ar.vx / vlen) * 18, ey = (ar.vy / vlen) * 9; // iso 기울임 근사
        ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(sx - ex, sy - ey); ctx.lineTo(sx + ex, sy + ey); ctx.stroke();
        ctx.fillStyle = '#d8d0c0';
        ctx.beginPath(); ctx.arc(sx + ex, sy + ey, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    window.__fogGateDbg = { skipped: _gateSkipped, missing: _gateMissing, missKind: _gateMissKind,
                            free: _gateFree, freeKinds: Object.keys(_GATE_FREE).sort(), total: renderables.length,
                            drawn: _gateDrawn.length / 3 };

    // ↓↓ 여기부터는 **안개 위**다. 월드 사물을 여기서 그리면 미탐사 셀에 누출된다.
    //   현재 안개 위에 남는 것 = 밤 오버레이(어둡게만) · 인접 존 방향 화살 · 전투 지시자 ·
    //   HUD/미니맵 — 전부 **화면 UI**라 의도된 것이다.
    //   ※단 하나 예외: 아래 '캐나디아 마을 작업장 시각화'는 월드 좌표 개발용 오버레이인데
    //     `primaryZoneId === 'canadia'` 에서만 돈다(한반도 단독 운영이라 실행되지 않는다).
    //     canadia 를 살릴 일이 생기면 그 블록을 이 합성 **위로** 옮겨라.
    // === 4-1) 밤 어두움 오버레이 — 푸른 톤, 시야는 더 좁아짐 ===
    const dk = darknessLevel();
    if (dk > 0) {
      // 푸른빛 도는 어두움 — 한밤엔 시야 절반쯤으로 줄어드는 느낌
      const nightGrad = ctx.createRadialGradient(W/2, H/2, 60, W/2, H/2, Math.max(W, H) * 0.45);
      nightGrad.addColorStop(0, `rgba(10, 18, 40, ${0.05 * dk})`);  // 중심도 살짝 어둡게
      nightGrad.addColorStop(0.5, `rgba(8, 14, 32, ${0.45 * dk})`);
      nightGrad.addColorStop(1, `rgba(4, 8, 20, ${0.85 * dk})`);
      ctx.fillStyle = nightGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // === Phase 4d-4: 캐나디아 마을 작업장 시각화 (각 직업 work area) ===
    if (primaryZoneId === 'canadia' && _canadiaVillages.length) {
      const ox = pConn.meta.worldOffsetX || 0;
      const oy = pConn.meta.worldOffsetY || 0;
      for (const v of _canadiaVillages) {
        if (!v.coord || !v.jobs) continue;
        const cx = v.coord.x, cy = v.coord.y;
        for (const [job, count] of Object.entries(v.jobs)) {
          if (!count || count < 1) continue;
          const def = CANADIA_JOB[job];
          if (!def) continue;
          // work area center (server JOB_WORK_OFFSET과 동일 식)
          const ax = ox + cx + Math.cos(def.angle) * def.dist;
          const ay = oy + cy + Math.sin(def.angle) * def.dist;
          // viewport cull
          const dvx = ax - worldCx, dvy = ay - worldCy;
          if (Math.abs(dvx) > 1300 || Math.abs(dvy) > 1300) continue;
          const iso = w2i(ax, ay);
          const s = toScreen(iso.x, iso.y);
          // 다이아 ground patch (96 × 48 iso = 3x3 cell 정도)
          const halfW = 80, halfH = 40;
          ctx.fillStyle = def.color;
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - halfH);
          ctx.lineTo(s.x + halfW, s.y);
          ctx.lineTo(s.x, s.y + halfH);
          ctx.lineTo(s.x - halfW, s.y);
          ctx.closePath();
          ctx.fill();
          // 외곽선
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
          // 직업 아이콘
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.lineWidth = 3;
          ctx.strokeText(def.emoji, s.x, s.y + 4);
          ctx.fillText(def.emoji, s.x, s.y + 4);
          // 라벨 — "농지 ×3"
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = '#ffe8a0';
          const txt = `${def.label} ×${count}`;
          ctx.strokeText(txt, s.x, s.y - halfH - 6);
          ctx.fillText(txt, s.x, s.y - halfH - 6);
          ctx.textAlign = 'start';
        }
      }
    }

    // === Phase 4d-11: 캐러밴 시각화 제거 — NPC entity가 직접 이동 (마차 객체 X) ===
    if (false && primaryZoneId === 'canadia' && _canadiaCaravans.length) {
      const ox = pConn.meta.worldOffsetX || 0;
      const oy = pConn.meta.worldOffsetY || 0;
      for (const c of _canadiaCaravans) {
        const ax = ox + c.x;
        const ay = oy + c.y;
        // viewport cull — 화면 밖이면 skip
        const dx = ax - worldCx, dy = ay - worldCy;
        if (Math.abs(dx) > 1200 || Math.abs(dy) > 1200) continue;
        const iso = w2i(ax, ay);
        const s = toScreen(iso.x, iso.y);
        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 4, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
        // 마차 본체 (작은 사다리꼴)
        ctx.fillStyle = c.state === 'outbound' ? '#c8a060' : '#8090c8';
        ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x - 10, s.y - 4);
        ctx.lineTo(s.x + 10, s.y - 4);
        ctx.lineTo(s.x + 8, s.y + 2);
        ctx.lineTo(s.x - 8, s.y + 2);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // 지붕
        ctx.fillStyle = '#a07040';
        ctx.beginPath();
        ctx.moveTo(s.x - 10, s.y - 4);
        ctx.lineTo(s.x, s.y - 12);
        ctx.lineTo(s.x + 10, s.y - 4);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // 바퀴 2개
        ctx.fillStyle = '#3a2a1a';
        ctx.beginPath(); ctx.arc(s.x - 6, s.y + 2, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(s.x + 6, s.y + 2, 2.5, 0, Math.PI*2); ctx.fill();
        // 호위 별 (있을 때)
        if (c.escort > 0) {
          ctx.fillStyle = '#ff6060';
          ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('⚔️' + c.escort, s.x, s.y - 14);
        }
        // 라벨 — from → to
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        const arrow = c.state === 'outbound' ? '→' : '←';
        const txt = `${c.from} ${arrow} ${c.to}`;
        ctx.strokeText(txt, s.x, s.y - 22);
        ctx.fillText(txt, s.x, s.y - 22);
        // Phase 4d-5: 빌려온 NPC 이름
        if (c.npcName) {
          ctx.font = '9px sans-serif';
          ctx.fillStyle = '#cce';
          const npcTxt = `🚶 ${c.npcName}`;
          ctx.strokeText(npcTxt, s.x, s.y - 33);
          ctx.fillText(npcTxt, s.x, s.y - 33);
        }
        ctx.textAlign = 'start';
      }
    }

    // === 5) 인접 존 방향 화살표 (4방향) ===
    drawNeighborArrow(pConn.meta.east, '동');
    drawNeighborArrow(pConn.meta.west, '서');
    drawNeighborArrow(pConn.meta.north, '북');
    drawNeighborArrow(pConn.meta.south, '남');
    // === 5b) §4-4 P4: 진행 전투 지시자(화면 안=교전 마커, 화면 밖=방향 화살) ===
    drawBattleIndicators(toScreen);
  }

  function drawNeighborArrow(neighborId, label) {
    if (!neighborId) return;
    const nm = zonesMeta[neighborId];
    if (!nm) return;
    const tx = nm.worldOffsetX + 512;
    const ty = (nm.worldOffsetY || 0) + 512;
    const dx = tx - myAbsPredicted.x;
    const dy = ty - myAbsPredicted.y;
    // 같은 존이거나 거리 0이면 표시 안 함
    if (Math.hypot(dx, dy) < 100) return;
    // 월드 방향을 iso 화면 방향으로
    const iso = { x: dx - dy, y: (dx + dy) * 0.5 };
    const ilen = Math.hypot(iso.x, iso.y) || 1;
    const dirX = iso.x / ilen, dirY = iso.y / ilen;
    // 화면 가장자리에서 안쪽으로 살짝 들어온 위치
    const r = Math.min(W, H) * 0.42;
    const ax = W/2 + dirX * r;
    const ay = H/2 + dirY * r;
    // 화살표 (다이아 모양 포인터)
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(dirY, dirX));
    ctx.fillStyle = 'rgba(240, 198, 116, 0.85)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-6, 8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, -8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // 라벨 (화살표 안쪽)
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0c674';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    const labelX = W/2 + dirX * (r - 26);
    const labelY = H/2 + dirY * (r - 26);
    const text = `${nm.displayName.split(' ')[0]} ${label}`;
    ctx.strokeText(text, labelX, labelY);
    ctx.fillText(text, labelX, labelY);
    ctx.textAlign = 'start';
  }

  // ═══════════ §4-4 P4: 전쟁 전투 관전·지휘·지시자 (랩 focusCameraOnBattle·drawNeighborArrow 정합) ═══════════
  // 레지스트리 만료 — 2Hz broadcast 끊김(종전·시야밖) 6s, 종료 표식 5s 잔류 후 제거.
  function pruneWarBattles() {
    const now = performance.now(); let changed = false;
    for (const [id, b] of warBattles) {
      if ((now - (b.seenAt || 0)) > 6000 || (b.resolvedAt && (now - b.resolvedAt) > 5000)) {
        warBattles.delete(id); changed = true;
        if (_warSpec.id === id) stopSpectate();
        if (_warCmdId === id) _warCmdId = null;
      }
    }
    return changed;
  }
  // 화면 안=교전 마커(atk A:B def), 화면 밖=가장자리 방향 화살(drawNeighborArrow 패턴).
  function drawBattleIndicators(toScreen) {
    if (!warBattles.size) return;
    if (pruneWarBattles()) updateWarHud();
    for (const b of warBattles.values()) {
      const iso = w2i(b.ox, b.oy), s = toScreen(iso.x, iso.y), m = 46;
      const off = (s.x < m || s.x > W - m || s.y < m || s.y > H - m);
      const col = (b.phase === 'resolved') ? '#c9c04b' : (_warSpec.id === b.id ? '#ffe14d' : '#ff8a5a');
      if (off) {
        const dx = s.x - W / 2, dy = s.y - H / 2, ang = Math.atan2(dy, dx), r = Math.min(W, H) * 0.42;
        const ax = W / 2 + Math.cos(ang) * r, ay = H / 2 + Math.sin(ang) * r;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-7, 9); ctx.lineTo(-2, 0); ctx.lineTo(-7, -9); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
        const lxp = W / 2 + Math.cos(ang) * (r - 26), lyp = H / 2 + Math.sin(ang) * (r - 26);
        ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        const txt = `⚔️ ${b.aliveA}:${b.aliveB}`;
        ctx.strokeText(txt, lxp, lyp); ctx.fillText(txt, lxp, lyp); ctx.textAlign = 'start';
      } else {
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        const txt = (b.phase === 'resolved')
          ? `⚑ ${b.atk || ''} vs ${b.def || ''} 종료`
          : `⚔️ ${b.atk || ''} ${b.aliveA} : ${b.aliveB} ${b.def || ''}`;
        ctx.strokeText(txt, s.x, s.y - 44); ctx.fillText(txt, s.x, s.y - 44); ctx.textAlign = 'start';
      }
    }
  }
  // 관전 카메라 — 현재 카메라(_lastCamAbs)에서 전투 origin(abs px)으로 0.6s 트윈(render가 구동).
  function focusCameraOnBattle(b) {
    if (!b) return;
    _warSpec.active = true; _warSpec.returning = false; _warSpec.id = b.id;
    _warSpec.from = { x: _lastCamAbs.x, y: _lastCamAbs.y };
    _warSpec.to = { x: b.ox, y: b.oy }; _warSpec.t0 = performance.now();
  }
  function spectateBattle(id) { const b = warBattles.get(id); if (b) { focusCameraOnBattle(b); updateWarHud(); } }
  function stopSpectate() {
    if (_warSpec.active) { _warSpec.returning = true; _warSpec.from = { x: _lastCamAbs.x, y: _lastCamAbs.y }; _warSpec.t0 = performance.now(); }
    _warSpec.active = false; _warSpec.id = null; _warSpec.to = null;
    updateWarHud();
  }
  // 지휘 참가/해제 — war_command_join 송신(서버 진영·근접 검증). 기존 input 채널(WASD) 그대로 재사용. id=null=해제.
  function setCommand(id) {
    _warCmdId = id; _warCmdMsg = id ? '지휘 요청 중…' : '';
    sendPrimary({ type: 'war_command_join', warId: id });
    if (id) { const b = warBattles.get(id); if (b) focusCameraOnBattle(b); }
    updateWarHud();
  }
  function toggleCommand(id) { setCommand(_warCmdId === id ? null : id); }
  // 스펙테이터 HUD DOM — 진행 전투 목록·A/B 카운트·casus·phase + 관전/지휘 버튼.
  function _warBtnCss(bg) {
    return 'flex:1;padding:3px 6px;font:11px sans-serif;color:#e6ebf2;background:' + bg
      + ';border:1px solid rgba(255,255,255,0.2);border-radius:4px;cursor:pointer;';
  }
  function ensureWarHud() {
    if (_warHudEl) return _warHudEl;
    const host = document.getElementById('game') || document.body;
    const el = document.createElement('div');
    el.id = 'warHud';
    el.style.cssText = 'position:absolute;top:64px;right:12px;z-index:40;width:236px;max-height:60vh;overflow:auto;'
      + 'background:rgba(16,20,26,0.88);border:1px solid rgba(255,138,90,0.5);border-radius:8px;'
      + 'padding:8px 10px;font:12px/1.5 sans-serif;color:#e6ebf2;box-shadow:0 4px 16px rgba(0,0,0,0.5);display:none;';
    host.appendChild(el); _warHudEl = el; return el;
  }
  function updateWarHud() {
    const el = ensureWarHud(), list = [...warBattles.values()];
    if (!list.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block'; el.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:bold;color:#ff9a6a;margin-bottom:6px;';
    head.textContent = `⚔️ 진행 전투 ${list.length}`; el.appendChild(head);
    for (const b of list) {
      const row = document.createElement('div');
      row.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);padding:5px 0;';
      const title = document.createElement('div');
      title.innerHTML = `<span style="color:${WAR_SIDE_COL[0]}">${b.atk || '?'}</span> vs `
        + `<span style="color:${WAR_SIDE_COL[1]}">${b.def || '?'}</span>`;
      row.appendChild(title);
      const stat = document.createElement('div');
      stat.style.cssText = 'color:#9fb0c4;font-size:11px;';
      stat.textContent = `A ${b.aliveA} · B ${b.aliveB} · ${b.casus || ''} · ${b.phase === 'resolved' ? '종료' : '교전'}`;
      row.appendChild(stat);
      if (b.phase !== 'resolved') {
        const btns = document.createElement('div');
        btns.style.cssText = 'margin-top:4px;display:flex;gap:6px;';
        const bSpec = document.createElement('button');
        bSpec.textContent = (_warSpec.id === b.id) ? '관전중' : '관전';
        bSpec.style.cssText = _warBtnCss((_warSpec.id === b.id) ? '#356b3a' : '#2a3340');
        bSpec.addEventListener('click', () => spectateBattle(b.id)); btns.appendChild(bSpec);
        const bCmd = document.createElement('button');
        bCmd.textContent = (_warCmdId === b.id) ? '지휘 해제' : '지휘';
        bCmd.style.cssText = _warBtnCss((_warCmdId === b.id) ? '#8a4a2a' : '#2a3340');
        bCmd.addEventListener('click', () => toggleCommand(b.id)); btns.appendChild(bCmd);
        row.appendChild(btns);
      }
      el.appendChild(row);
    }
    if (_warSpec.active || _warSpec.returning || _warCmdId) {
      const foot = document.createElement('div');
      foot.style.cssText = 'margin-top:6px;border-top:1px solid rgba(255,255,255,0.12);padding-top:5px;';
      if (_warCmdMsg) { const mm = document.createElement('div'); mm.style.cssText = 'color:#ffd27a;font-size:11px;margin-bottom:4px;'; mm.textContent = _warCmdMsg; foot.appendChild(mm); }
      const bStop = document.createElement('button');
      bStop.textContent = '관전/지휘 종료 → 내 캐릭터';
      bStop.style.cssText = _warBtnCss('#4a4432');
      bStop.addEventListener('click', () => { if (_warCmdId) setCommand(null); stopSpectate(); }); foot.appendChild(bStop);
      el.appendChild(foot);
    }
  }

  // === 그리기 헬퍼 ===
  function drawDiamond(cx, cy, size, color) {
    const hw = size;
    const hh = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }

  const WALL_HEIGHT = 64; // 14.49-e2: FLOOR_HEIGHT(64)와 같음
  // 14.49-e7ah: stair cell N의 8 sub-step만 그림. anchor (x, y) = cell N center.
  function drawStairCellPart(x, y, cellN, building) {
    const H = FLOOR_HEIGHT;
    const dir = building?.data?.dir || 'N';
    const dv = dir === 'E' ? { x: 1, y: 0 } : dir === 'W' ? { x: -1, y: 0 } : dir === 'S' ? { x: 0, y: 1 } : { x: 0, y: -1 };
    const pv = { x: -dv.y, y: dv.x };
    function worldOffToScreen(wx, wy, wz) {
      return { x: (wx - wy), y: (wx + wy) * 0.5 - wz };
    }
    const SUB_PER_CELL = 8;
    const SUB_TOTAL = 24;
    const SUB_WIDTH = CL_BUILDING_SIZE / SUB_PER_CELL;
    for (let subInCell = 0; subInCell < SUB_PER_CELL; subInCell++) {
      const S = cellN * SUB_PER_CELL + subInCell;
      // cell N 중심 기준 (anchor가 cell N center): subInCell offset
      const w = (subInCell - 3.5) * SUB_WIDTH;
      const z = (S / (SUB_TOTAL - 1)) * H;
      const halfDV = SUB_WIDTH / 2;
      const halfPV = CL_BUILDING_SIZE / 2;
      function corner(dvSign, pvSign) {
        const wx = dv.x * (w + halfDV * dvSign) + pv.x * halfPV * pvSign;
        const wy = dv.y * (w + halfDV * dvSign) + pv.y * halfPV * pvSign;
        const sc = worldOffToScreen(wx, wy, z);
        return { x: x + sc.x, y: y + sc.y };
      }
      const c1 = corner(-1, -1);
      const c2 = corner( 1, -1);
      const c3 = corner( 1,  1);
      const c4 = corner(-1,  1);
      const prevZ = S === 0 ? 0 : ((S - 1) / (SUB_TOTAL - 1)) * H;
      if (z > prevZ) {
        const c1d = { x: c1.x, y: c1.y + (z - prevZ) };
        const c4d = { x: c4.x, y: c4.y + (z - prevZ) };
        ctx.fillStyle = '#4a2a14';
        ctx.strokeStyle = '#2a1808';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c4.x, c4.y);
        ctx.lineTo(c4d.x, c4d.y); ctx.lineTo(c1d.x, c1d.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#b08858';
      ctx.strokeStyle = '#5a3818';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawBuildingIso(x, y, type, building) {
    if (type === 'vtile') {
      // ★[실체화 동기 — 랩 정본] 마을 지면 타일: yard=부지 원판(다짐 흙), plaza=큰집 마당 광장, garden=텃밭(이랑)
      const kind = (building?.data?.kind) || 'yard';
      // ★[텃밭 3D — 에셋 10차] 이랑·새싹 타일(1셀 정합 스프라이트). 미로드 시 아래 벡터 이랑 폴백.
      if (kind === 'garden' && drawCellSpriteAt('yard_garden', x, y)) return;
      if (kind !== 'garden' && _tileYardC) {
        // ★생성형 텍스처 실셀 다이아(64×32) — 마당·광장이 이어진 다짐 지면으로 읽힘(구 반크기 점묘 폐지)
        ctx.drawImage(kind === 'plaza' ? _tilePlazaC : _tileYardC, x - 32, y - 16);
        return;
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 8); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 16, y); ctx.closePath();
      if (kind === 'plaza') ctx.fillStyle = 'rgba(158,128,82,0.62)';
      else if (kind === 'garden') ctx.fillStyle = '#5e7038';
      else ctx.fillStyle = 'rgba(122,88,54,0.5)';
      ctx.fill();
      if (kind === 'garden') {
        ctx.strokeStyle = 'rgba(58,82,34,0.85)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 8, y + 4);
        ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 12, y + 2);
        ctx.stroke();
      }
      return;
    }
    if (type === 'hut_site') {
      // ★움집터 — 수혈 구덩이 + 단계 진행. stage 1=구덩이, 2=굴립주, 3=도리·서까래 골조, 4=완공(hut로 전환)
      const st = (building?.data?.stage) | 0;
      // ★[공정 3D — 에셋 10차] 완공 움집과 **같은 발자국(6×4)·같은 앵커 계약**의 단계 스프라이트.
      //   행 px(b.x,b.y)는 발자국 중심이 아니라 (x0+2.5, y0+1.5)셀이라, 발자국 북서 오버행 모서리까지의
      //   델타를 iso로 변환해 앵커를 잡는다(w2i가 선형이라 델타 변환이 성립).
      {
        const _sp = _bldSpr['hut_s' + st], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
          ctx.fillText(`움집터 ${st}/4단계 (클릭=시공)`, x, y - 18);
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 14); ctx.lineTo(x + 30, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 30, y); ctx.closePath();
      ctx.fillStyle = 'rgba(74,58,40,0.55)'; ctx.fill();
      ctx.setLineDash([4, 3]); ctx.strokeStyle = '#9a7a4a'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (st >= 2) { ctx.fillStyle = '#7a5a30'; for (const [px2, py2] of [[-18, 0], [0, -9], [18, 0], [0, 9], [-9, -4], [9, 4]]) ctx.fillRect(x + px2 - 1.5, y + py2 - 5, 3, 7); }
      if (st >= 3) { ctx.strokeStyle = '#8a6a3e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x, y - 12); ctx.lineTo(x + 18, y); ctx.stroke(); }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(`움집터 ${st}/4단계 (클릭=시공)`, x, y - 18);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'hut') {
      // 완공 앵커 — 몸체(벽·바닥)는 기존 경로가 그림. 라벨만.
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e8d8b0'; ctx.textAlign = 'center';
      ctx.fillText('움집', x, y - 6);
      ctx.textAlign = 'left';
      return;
    }
    // ★★[2026-08-02e ⑤] 조업 진척 게이지 — 노·숯가마 공용. 서버가 data.job{startedAt,until} 을 내려 준다.
    //   서버·클라가 **같은 식**을 쓴다(서버 _jobProgress 와 동일): (now−startedAt)/(until−startedAt).
    const _jobBar = (bld, cx, cy) => {
      const j = bld && bld.data && bld.data.job;
      if (!j || !j.until || !j.startedAt) return null;
      const now = Date.now();
      const p = Math.max(0, Math.min(1, (now - j.startedAt) / Math.max(1, j.until - j.startedAt)));
      const W = 34, H = 5;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(cx - W / 2, cy - 44, W, H);
      ctx.fillStyle = p >= 1 ? '#7cd97c' : '#ff9a3c';
      ctx.fillRect(cx - W / 2 + 1, cy - 43, (W - 2) * p, H - 2);
      return { p, remain: Math.max(0, Math.ceil((j.until - now) / 1000)) };
    };
    if (type === 'furnace_site' || type === 'furnace') {
      // ★노(爐) — 재민 확정(움집 동형 공정). 단계별 표현: 1=돌 기초, 2=노벽, 3=풀무, 완공=노+불.
      const st = (building?.data?.stage) | 0;
      const done = type === 'furnace';
      // ★[에셋] 움집터와 **같은 앵커 계약** — 발자국 2×2 북서 오버행 모서리에 붙인다.
      //   행 px(b.x,b.y)는 발자국 중심이라 (x0-0.5, y0-0.5)셀까지의 델타를 iso로 변환한다(w2i 선형).
      {
        const _sp = _bldSpr[done ? 'furnace' : ('furn_s' + st)], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          const _kko2 = (_d.kind) === 'bloomery' ? '괴련로' : '노(爐)';
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
          const _jb = done ? _jobBar(building, x, y) : null;
          ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? `${_kko2} — 클릭=출탕` : `${_kko2} 조업 중 ${_jb.remain}초`) : `${_kko2} — 클릭=장입`)
                            : `${_kko2} 터 ${st}/3단계 (클릭=시공)`, x, y - 28);
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 10); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 22, y); ctx.closePath();
      ctx.fillStyle = done ? 'rgba(90,70,58,0.9)' : 'rgba(90,80,70,0.55)'; ctx.fill();
      ctx.setLineDash(done ? [] : [4, 3]); ctx.strokeStyle = '#b09070'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (done || st >= 2) {   // 노벽(원통) 몸체
        ctx.fillStyle = done ? '#6a5040' : '#7a6a58';
        ctx.beginPath(); ctx.ellipse(x, y - 12, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 13, y - 12, 26, 12);
        ctx.beginPath(); ctx.ellipse(x, y, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (done) {   // 불꽃 + 연기 표식
        ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.ellipse(x, y - 13, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.ellipse(x, y - 13, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      const _kko = (building?.data?.kind) === 'bloomery' ? '괴련로' : '노(爐)';
      const _kn = (building?.data?.kind) === 'bloomery' ? 3 : 3;
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(done ? `${_kko} — 클릭=제련` : `${_kko} 터 ${st}/${_kn}단계 (클릭=시공)`, x, y - 26);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'kiln_site' || type === 'charcoal_kiln') {
      // ★숯가마 — 노와 같은 2×2 계약. 밀폐 봉토 둔덕 + 연도(굴뚝). 불꽃이 없다(공기를 막아 찌는 설비).
      const st = (building?.data?.stage) | 0;
      const done = type === 'charcoal_kiln';
      {
        const _sp = _bldSpr[done ? 'charcoal_kiln' : 'kiln_s1'], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e6d6b6'; ctx.textAlign = 'center';
          { const _jb = done ? _jobBar(building, x, y) : null;
            ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? '숯가마 — 클릭=수거' : `숯가마 탄화 중 ${_jb.remain}초`) : '숯가마 — 클릭=장입')
                              : `숯가마 터 ${st}/2단계 (클릭=시공)`, x, y - 28); }
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 10); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 22, y); ctx.closePath();
      ctx.fillStyle = done ? 'rgba(74,62,50,0.9)' : 'rgba(88,80,70,0.55)'; ctx.fill();
      ctx.setLineDash(done ? [] : [4, 3]); ctx.strokeStyle = '#9a8464'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (done || st >= 2) {   // 봉토 둔덕(반구)
        ctx.fillStyle = done ? '#5b4a38' : '#6f6152';
        ctx.beginPath(); ctx.ellipse(x, y - 4, 15, 11, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 15, y - 4, 30, 4);
      }
      if (done) {   // 연도(굴뚝) + 연기
        ctx.fillStyle = '#4a3c30'; ctx.fillRect(x + 8, y - 20, 4, 10);
        ctx.fillStyle = 'rgba(200,200,200,0.5)';
        ctx.beginPath(); ctx.ellipse(x + 10, y - 24, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e6d6b6'; ctx.textAlign = 'center';
      { const _jb = done ? _jobBar(building, x, y) : null;
        ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? '숯가마 — 클릭=수거' : `숯가마 탄화 중 ${_jb.remain}초`) : '숯가마 — 클릭=장입')
                          : `숯가마 터 ${st}/2단계 (클릭=시공)`, x, y - 26); }
      ctx.textAlign = 'left';
      return;
    }
    // ★★[2026-08-03e 배치 12 ①] 마을 회관 — 터(단계)와 완공. 노·숯가마 렌더와 같은 결(2×2 앵커+라벨).
    if (type === 'village_site' || type === 'village_hall') {
      const done = type === 'village_hall';
      const st = (building?.data?.stage) | 0;
      // 굴립주(기둥 박아 세운 큰집) — 기둥 넷 + 이엉 지붕. 터는 지경석만.
      ctx.fillStyle = done ? '#6b5638' : '#57534a';
      for (const [dx, dy] of [[-14, -4], [14, -4], [-14, 8], [14, 8]]) { ctx.fillRect(x + dx - 2, y + dy - (done ? 20 : 4), 4, done ? 22 : 6); }
      if (done) {
        ctx.fillStyle = '#8a6f42';
        ctx.beginPath(); ctx.moveTo(x, y - 42); ctx.lineTo(x + 22, y - 20); ctx.lineTo(x - 22, y - 20); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5c4a2c'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = done ? '#ffe9b0' : '#e6d6b6'; ctx.textAlign = 'center';
      ctx.fillText(done ? '마을 회관 — 클릭=재고' : `마을 회관 터 ${st}/3단계 (클릭=시공)`, x, y - (done ? 48 : 14));
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'guild_granary' || type === 'granary') {
      // ★고상곳간 앵커 — 몸체는 _granC 통짜 스프라이트(에셋 2차)가 대체: 표석 폐지, 라벨만(지붕 위)
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(type === 'guild_granary' ? '길드 곳간' : '곳간', x, y - 56);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'farmland') {
      // 갈색 흙 다이아 + 작물
      const data = building?.data || {};
      if (data.sim) {
        // §4-4 Stage 4A: 마을 시뮬 경작지(비영속 타일) — 논(무논=물빛)·밭(이랑) 정적 렌더.
        //   성장 게이지·'수확가능' 라벨 없음(마을 소유 — 플레이어 수확 대상 아님). 셀 꽉 채워 띠가 이어져 보임.
        const dry = !!data.dry;
        ctx.beginPath();
        ctx.moveTo(x, y - 8); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 16, y); ctx.closePath();
        ctx.fillStyle = dry ? '#7c6034' : '#3f5c46'; ctx.fill();
        ctx.strokeStyle = dry ? '#5e4724' : '#324a38'; ctx.lineWidth = 0.6; ctx.stroke();
        if (dry) {
          // 밭이랑 2줄
          ctx.strokeStyle = 'rgba(94,71,36,0.9)'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 8, y + 4);
          ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 12, y + 2);
          ctx.stroke();
        } else {
          // 무논 물 반사 + 모 3포기
          ctx.fillStyle = 'rgba(130,190,170,0.35)';
          ctx.beginPath();
          ctx.moveTo(x, y - 5); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 10, y); ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#69a05a'; ctx.lineWidth = 1;
          ctx.beginPath();
          for (const [oxp, oyp] of [[-6, 0], [0, -2], [6, 1]]) {
            ctx.moveTo(x + oxp, y + oyp); ctx.lineTo(x + oxp, y + oyp - 5);
          }
          ctx.stroke();
        }
        return;
      }
      const readyAt = data.readyAt || 0;
      const now = Date.now();
      const isReady = now >= readyAt;
      const growProgress = readyAt > data.plantedAt ? Math.min(1, (now - data.plantedAt) / (readyAt - data.plantedAt)) : 1;
      // 에셋 5차: 4단계 3D 스프라이트(갈은 흙/어린싹/자람/익음). 미로드 시 아래 벡터 렌더 폴백.
      {
        const _st = isReady ? 3 : Math.min(2, Math.floor(growProgress * 3));
        const _cs = cropSprite(_st, building ? building.x : x, building ? building.y : y);
        if (_cs) {
          ctx.fillStyle = 'rgba(0,0,0,0.30)';
          ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.drawImage(_cs, x - 24, y - 30, 48, 48);
          if (isReady) {
            ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
            ctx.fillStyle = '#9adb6e'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
            ctx.strokeText('수확가능', x, y - 20); ctx.fillText('수확가능', x, y - 20);
            ctx.textAlign = 'start';
          }
          return;
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      // 흙
      ctx.beginPath();
      ctx.moveTo(x, y - 4); ctx.lineTo(x + 14, y + 2);
      ctx.lineTo(x, y + 8); ctx.lineTo(x - 14, y + 2); ctx.closePath();
      ctx.fillStyle = '#5a3a20'; ctx.fill();
      ctx.strokeStyle = '#3a2810'; ctx.lineWidth = 1; ctx.stroke();
      // 작물 — growProgress에 따라 크기 다름
      const cropH = 3 + 8 * growProgress;
      ctx.fillStyle = isReady ? '#2a8a4a' : '#5aa050';
      for (const [ox, oy] of [[-6, -2], [0, -3], [6, -1]]) {
        ctx.fillRect(x + ox - 1, y + oy - cropH/2, 2, cropH);
      }
      if (isReady) {
        // 빨간 베리 (수확 가능 표시)
        ctx.fillStyle = '#c83a3a';
        for (const [ox, oy] of [[-6, -8], [0, -10], [6, -8]]) {
          ctx.beginPath(); ctx.arc(x + ox, y + oy, 2, 0, Math.PI*2); ctx.fill();
        }
        // "READY" 라벨
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#9adb6e';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
        ctx.strokeText('수확가능', x, y - 16);
        ctx.fillText('수확가능', x, y - 16);
        ctx.textAlign = 'start';
      }
      return;
    }
    if (type === 'wall') {
      const H = WALL_HEIGHT;
      const side = building?.data?.side || 'N';
      const damaged = !!building?.data?.damaged; // Phase 14.33
      ctx.strokeStyle = damaged ? '#5a2a2a' : '#3a3a3a';
      ctx.lineWidth = 0.5;
      if (damaged) ctx.globalAlpha = 0.45; // 부서진 wall은 반투명
      if (side === 'N') {
        // cell N edge: 좌상 (x-16, y-8) → 우하 (x+16, y+8). 바닥선.
        // 윗면(z=H): 좌상 (x-16, y-8-H) → 우하 (x+16, y+8-H).
        // 측면(앞쪽 보이는 면) = bottom 사선과 top 사선 잇는 직사각형.
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 8);       // 바닥 TL = cell TL
        ctx.lineTo(x + 16, y + 8);       // 바닥 TR = cell TR
        ctx.lineTo(x + 16, y + 8 - H);   // 윗면 TR
        ctx.lineTo(x - 16, y - 8 - H);   // 윗면 TL
        ctx.closePath();
        if (_wallNC && !damaged) {   // ★통나무 텍스처(생성 에셋) — 전 벽 유닛 공용 스킨(전단 변환으로 평행사변형에 정합)
          ctx.save(); ctx.clip(); ctx.translate(x - 16, y - 8); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.drawImage(_wallNC, 0, -H); ctx.restore(); ctx.stroke();
        } else { ctx.fillStyle = '#8a7a5c'; ctx.fill(); ctx.stroke(); } // 나무색(폴백/파손)
        // 윗면 (cell edge 위 H px) — 얇은 평행사변형으로 입체감
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 8 - H);
        ctx.lineTo(x + 16, y + 8 - H);
        ctx.lineTo(x + 14, y + 6 - H);
        ctx.lineTo(x - 18, y - 10 - H);
        ctx.closePath();
        ctx.fillStyle = '#b8a075'; ctx.fill(); ctx.stroke();
      } else { // E
        // cell E edge: 우상 (x+16, y-8) → 우하 (x-16, y+8). 바닥선.
        ctx.beginPath();
        ctx.moveTo(x + 16, y - 8);       // 바닥 TR = cell TR
        ctx.lineTo(x - 16, y + 8);       // 바닥 BR = cell BR
        ctx.lineTo(x - 16, y + 8 - H);   // 윗면 BR
        ctx.lineTo(x + 16, y - 8 - H);   // 윗면 TR
        ctx.closePath();
        if (_wallEC && !damaged) {   // ★통나무 텍스처 — 그늘면
          ctx.save(); ctx.clip(); ctx.translate(x - 16, y + 8); ctx.transform(1, -0.5, 0, 1, 0, 0); ctx.drawImage(_wallEC, 0, -H); ctx.restore(); ctx.stroke();
        } else { ctx.fillStyle = '#8a7a5c'; ctx.fill(); ctx.stroke(); }
        ctx.beginPath();
        ctx.moveTo(x + 16, y - 8 - H);
        ctx.lineTo(x - 16, y + 8 - H);
        ctx.lineTo(x - 18, y + 6 - H);
        ctx.lineTo(x + 14, y - 10 - H);
        ctx.closePath();
        ctx.fillStyle = '#b8a075'; ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1; // Phase 14.33: damaged wall 반투명 복원
    } else if (type === 'floor') {
      // ★움집 실내(컷어웨이로만 도달 — 밖에선 지붕 스킨이 억제): 다짐흙 바닥 + 정본 가구.
      //   침대 6 = BEDO 앵커 상대 [[-4,-4],[-3,-4],[-2,-4],[-1,-4],[-4,-3],[-1,-3]](랩 정본 — 1인 1침대 고증, HOME_SLOTS와 같은 사상)
      //   화덕 = (-2,-3)(수혈주거 중앙 노지 고증). 앵커: 건물=[cx-5..cx+0]×[cy-5..cy-2] → cx=x1·cy=y1+2.
      //   시각 전용(durango-consistency: 물리 실체 침대→리스폰·NPC 취침 연동은 생활 층 이관 묶음).
      if (building?.data?.hut && _tileHutC) {
        const _h = building.data.hut;
        ctx.drawImage(_tileHutC, x - 32, y - 16);
        const _dx = Math.floor(building.x / 32) - _h[2], _dy = Math.floor(building.y / 32) - (_h[3] + 2);
        const _bed = (_dy === -4 && _dx >= -4 && _dx <= -1) || (_dy === -3 && (_dx === -4 || _dx === -1));
        if (_bed) {
          ctx.beginPath();   // 거적 침상(납작 매트)
          ctx.moveTo(x, y - 9); ctx.lineTo(x + 20, y + 1); ctx.lineTo(x, y + 11); ctx.lineTo(x - 20, y + 1); ctx.closePath();
          ctx.fillStyle = '#c8a95e'; ctx.fill();
          ctx.strokeStyle = '#8a713c'; ctx.lineWidth = 1; ctx.stroke();
          ctx.strokeStyle = 'rgba(138,113,60,0.7)'; ctx.beginPath();   // 짚결
          ctx.moveTo(x - 12, y - 1); ctx.lineTo(x + 8, y + 7); ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 12, y + 5); ctx.stroke();
          ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 12, y - 8, 10, 5);   // 목침(북측)
        } else if (_dx === -2 && _dy === -3) {
          const _g = ctx.createRadialGradient(x, y, 2, x, y, 26);   // 화덕 — 은은한 잉걸빛
          _g.addColorStop(0, 'rgba(255,150,60,0.35)'); _g.addColorStop(1, 'rgba(255,150,60,0)');
          ctx.fillStyle = _g; ctx.beginPath(); ctx.ellipse(x, y, 26, 13, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2e2620'; ctx.beginPath(); ctx.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#6e675e';
          for (let _a = 0; _a < 6; _a++) { const _t = _a / 6 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(_t) * 13, y + Math.sin(_t) * 6.5, 3.2, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
          ctx.fillStyle = '#ff9a4a'; ctx.fillRect(x - 2, y - 2, 4, 3);
          ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - 1, y - 1, 2, 1);
        }
        return;
      }
      // 14.49-e7e: 바닥 — 셀 꽉 채우는 isometric 다이아 (TS=32 ground tile과 동일 크기).
      // 14.49-e7ak DEBUG: floor 별 색 (1층 기본, 2층 주황, 3층 빨강)
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x + 32, y);
      ctx.lineTo(x, y + 16);
      ctx.lineTo(x - 32, y);
      ctx.closePath();
      const fl = building?.floor ?? building?.data?.floor ?? 0;
      let fillCol = '#8a6a4a';   // 1층 (floor=0) 기본
      if (fl === 1) fillCol = '#ff8a3c';     // 2층 — 주황
      else if (fl === 2) fillCol = '#e63a3a'; // 3층 — 빨강
      ctx.fillStyle = fillCol; ctx.fill();
      ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 0.5; ctx.stroke();
    } else if (type === 'door') {
      // 14.50: 문 — wall과 비슷한 sprite, 색 다름. open이면 반투명 + 짧게.
      const H = WALL_HEIGHT;
      const side = building?.data?.side || 'N';
      const open = !!building?.data?.open;
      const drawH = open ? H * 0.25 : H; // 열림: 1/4 높이
      const col = open ? 'rgba(140, 100, 60, 0.4)' : '#6a4a2a'; // 닫힘: 진한 갈색, 열림: 반투명
      ctx.strokeStyle = open ? 'rgba(60,40,20,0.5)' : '#3a2010';
      ctx.lineWidth = 0.6;
      ctx.fillStyle = col;
      if (side === 'N') {
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 8);
        ctx.lineTo(x + 16, y + 8);
        ctx.lineTo(x + 16, y + 8 - drawH);
        ctx.lineTo(x - 16, y - 8 - drawH);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x + 16, y - 8);
        ctx.lineTo(x - 16, y + 8);
        ctx.lineTo(x - 16, y + 8 - drawH);
        ctx.lineTo(x + 16, y - 8 - drawH);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // 닫힘 시 손잡이 점
      if (!open) {
        ctx.fillStyle = '#f0c674';
        ctx.beginPath();
        if (side === 'N') ctx.arc(x + 8, y - H/2, 1.5, 0, Math.PI * 2);
        else              ctx.arc(x - 8, y - H/2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === 'chest') {
      // Phase 4d-2: 거래소 chest 식별 (canadia zone)
      const isExchange = building?.data?.isExchange === true;
      const village = building?.data?.village || null;
      // 색상 — 거래소면 금색/주황, 일반은 나무색
      const topCol = isExchange ? '#e8b85e' : '#a87246';
      const rightCol = isExchange ? '#b88838' : '#7c5232';
      const leftCol = isExchange ? '#d09a48' : '#946040';
      const edgeCol = isExchange ? '#6b4a18' : '#5a3a1c';
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 윗면
      ctx.beginPath();
      ctx.moveTo(x, y - 12); ctx.lineTo(x + 14, y - 4);
      ctx.lineTo(x, y + 4); ctx.lineTo(x - 14, y - 4); ctx.closePath();
      ctx.fillStyle = topCol; ctx.fill();
      ctx.strokeStyle = edgeCol; ctx.lineWidth = 1; ctx.stroke();
      // 우측면
      ctx.beginPath();
      ctx.moveTo(x + 14, y - 4); ctx.lineTo(x + 14, y + 4);
      ctx.lineTo(x, y + 12); ctx.lineTo(x, y + 4); ctx.closePath();
      ctx.fillStyle = rightCol; ctx.fill(); ctx.stroke();
      // 좌측면
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 4); ctx.lineTo(x - 14, y + 4);
      ctx.lineTo(x, y + 12); ctx.lineTo(x, y + 4); ctx.closePath();
      ctx.fillStyle = leftCol; ctx.fill(); ctx.stroke();
      // 자물쇠 / 거래소 별표
      if (isExchange) {
        ctx.fillStyle = '#fff8d0';
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
        ctx.strokeText('★', x, y + 1);
        ctx.fillText('★', x, y + 1);
        ctx.textAlign = 'start';
      } else {
        ctx.fillStyle = '#f0c674';
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
      // 거래소 라벨 — 마을 이름 floating
      if (isExchange && village) {
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        // 배경 박스
        const txt = `🏪 ${village}`;
        const w = ctx.measureText(txt).width + 8;
        ctx.fillStyle = 'rgba(40,30,15,0.85)';
        ctx.fillRect(x - w/2, y - 32, w, 16);
        ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1;
        ctx.strokeRect(x - w/2, y - 32, w, 16);
        // 텍스트
        ctx.fillStyle = '#ffe8a0';
        ctx.fillText(txt, x, y - 20);
        ctx.textAlign = 'start';
      }
    } else if (type === 'fence') {
      // 14.50: 울타리 — cell 전체 차지, 절반 높이, orientation (EW/NS)로 막대 방향만 다름
      const fH = WALL_HEIGHT * 0.5;
      const half = CL_BUILDING_SIZE / 2; // 16
      const ori = building?.data?.orientation || 'NS';
      // 4 모서리 (top 평면)
      const tl = { x: x + (-half - (-half)), y: y + ((-half) + (-half)) * 0.5 - fH };
      const tr = { x: x + (half - (-half)), y: y + (half + (-half)) * 0.5 - fH };
      const br = { x: x + (half - half), y: y + (half + half) * 0.5 - fH };
      const bl = { x: x + (-half - half), y: y + (-half + half) * 0.5 - fH };
      // 4 모서리 (bottom 평면) — z=0
      const tlB = { x: tl.x, y: tl.y + fH };
      const trB = { x: tr.x, y: tr.y + fH };
      const brB = { x: br.x, y: br.y + fH };
      const blB = { x: bl.x, y: bl.y + fH };
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.moveTo(tlB.x, tlB.y); ctx.lineTo(trB.x, trB.y);
      ctx.lineTo(brB.x, brB.y); ctx.lineTo(blB.x, blB.y); ctx.closePath();
      ctx.fill();
      // 측면 (오른쪽 두 면) — fill
      ctx.fillStyle = '#6a4828';
      ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(brB.x, brB.y); ctx.lineTo(trB.x, trB.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a3e22';
      ctx.beginPath(); ctx.moveTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.lineTo(blB.x, blB.y); ctx.lineTo(brB.x, brB.y); ctx.closePath(); ctx.fill();
      // 상단 평면
      ctx.fillStyle = '#7c5a32';
      ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath(); ctx.fill();
      // orientation 표시 — 막대 라인 (EW: 동서로 가로지름, NS: 남북으로)
      ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1.5;
      if (ori === 'EW') {
        // 동(우)서(좌) — iso상 가로축 = 화면상 (dx=±1, dy=0) → 화면 x ±32
        ctx.beginPath();
        const ax = x - 16, bx = x + 16;
        ctx.moveTo(ax, y - fH); ctx.lineTo(bx, y - fH); ctx.stroke();
      } else {
        // 남북 — iso (dx=0, dy=±1) → 화면 (0, ±16)
        ctx.beginPath();
        const ay = y - fH - 16, by = y - fH + 16;
        ctx.moveTo(x, ay); ctx.lineTo(x, by); ctx.stroke();
      }
      // 윤곽
      ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y); ctx.closePath(); ctx.stroke();
    } else if (type === 'stair') {
      // === PZ식 3-cell 24-subStep 계단 (14.49-e2) ===
      // anchor (this draw 좌표 x, y) = cell 0 (낮은 발판) 중심. dir 방향으로 cell 1, 2 추가.
      // 총 24 sub-step (각 cell당 8 sub-step), z = subStep * (FLOOR_HEIGHT/24) (0~64).
      // 시각: 24개 평평한 step tread + 사이 vertical riser. 진짜 미세 계단 모양.
      const H = FLOOR_HEIGHT; // 64
      const dir = building?.data?.dir || 'N';
      // dir별 단위벡터 (world 좌표계)
      const dv = dir === 'E' ? { x: 1, y: 0 } : dir === 'W' ? { x: -1, y: 0 } : dir === 'S' ? { x: 0, y: 1 } : { x: 0, y: -1 };
      // dir 수직 (perpendicular) 단위벡터 — 어느 쪽이든 한 방향으로 잡음
      const pv = { x: -dv.y, y: dv.x };
      // world offset (픽셀, cell 0 anchor 기준) → 스크린 offset
      function worldOffToScreen(wx, wy, wz) {
        return { x: (wx - wy), y: (wx + wy) * 0.5 - wz };
      }
      // 그림자 (3 cell 전체 길이)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      const midC = { wx: dv.x * 32, wy: dv.y * 32 }; // cell 1 중심
      const midS = worldOffToScreen(midC.wx, midC.wy, 0);
      ctx.ellipse(x + midS.x, y + midS.y + 4, 36, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // 6 sub-step 그리기. 각 sub-step:
      //   - 시작 wx,wy = anchor 중심 + dv * (subStep - 2.5) * 16 (subStep 0 = -2.5×16 = -40, ...)
      //     wait — anchor center가 cell 0 중심임. cell 0 안 sub-step 0의 중심 = anchor - dv*8 (반쪽 뒤로)
      //     subStep S의 중심 (world): anchor + dv * (S - 2.5) * 16
      //     이러면 S=0: anchor - 40, S=5: anchor + 40. cell 0 (S=0,1) = -40~-8, cell 1 (S=2,3) = 8~40, cell 2 (S=4,5) = 56~88...
      //     아니다. cell 0 중심 = anchor, cell 1 중심 = anchor + dv*32, cell 2 중심 = anchor + dv*64.
      //     subStep 0 (cell 0 low half) 중심 = anchor + dv * (-8) = anchor - dv*8
      //     subStep 1 (cell 0 high half) 중심 = anchor + dv * 8
      //     subStep 2 (cell 1 low half) 중심 = anchor + dv * 24
      //     subStep 3 (cell 1 high half) 중심 = anchor + dv * 40
      //     subStep 4 (cell 2 low half) 중심 = anchor + dv * 56
      //     subStep 5 (cell 2 high half) 중심 = anchor + dv * 72
      // 각 슬랩 두께: dv 방향 16, perpendicular 32.
      // 각 sub-step 슬랩 — cell 0 (S=0~7), cell 1 (S=8~15), cell 2 (S=16~23). 총 24개.
      // cell N 중심 = anchor + dv * N * 32. cell 안에서 sub-step S_in_cell (0~7) 중심 = cell_center + dv * ((S_in_cell - 3.5) * 4)
      // (각 sub-step 너비 = 32/8 = 4 px along dir)
      const SUB_PER_CELL = 8;
      const SUB_TOTAL = 24;
      const SUB_WIDTH = CL_BUILDING_SIZE / SUB_PER_CELL; // = 4 px
      for (let S = 0; S < SUB_TOTAL; S++) {
        const cellN = Math.floor(S / SUB_PER_CELL);
        const subInCell = S % SUB_PER_CELL;
        const w = cellN * CL_BUILDING_SIZE + (subInCell - 3.5) * SUB_WIDTH;
        const z = (S / (SUB_TOTAL - 1)) * H; // 0 ~ H
        const halfDV = SUB_WIDTH / 2;
        const halfPV = CL_BUILDING_SIZE / 2;
        function corner(dvSign, pvSign) {
          const wx = dv.x * (w + halfDV * dvSign) + pv.x * halfPV * pvSign;
          const wy = dv.y * (w + halfDV * dvSign) + pv.y * halfPV * pvSign;
          const sc = worldOffToScreen(wx, wy, z);
          return { x: x + sc.x, y: y + sc.y };
        }
        const c1 = corner(-1, -1);
        const c2 = corner( 1, -1);
        const c3 = corner( 1,  1);
        const c4 = corner(-1,  1);
        // riser — 이전 sub-step과 z 차이만큼
        const prevZ = S === 0 ? 0 : ((S - 1) / (SUB_TOTAL - 1)) * H;
        if (z > prevZ) {
          const c1d = { x: c1.x, y: c1.y + (z - prevZ) };
          const c4d = { x: c4.x, y: c4.y + (z - prevZ) };
          ctx.fillStyle = '#4a2a14';
          ctx.strokeStyle = '#2a1808';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y); ctx.lineTo(c4.x, c4.y);
          ctx.lineTo(c4d.x, c4d.y); ctx.lineTo(c1d.x, c1d.y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // tread
        ctx.fillStyle = '#b08858';
        ctx.strokeStyle = '#5a3818';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // ↑ 화살표 (가장 높은 sub-step 위)
      const topZ = H;
      const tcell = 2, tsub = 7;
      const tw = tcell * CL_BUILDING_SIZE + (tsub - 3.5) * SUB_WIDTH;
      const topS = worldOffToScreen(dv.x * tw, dv.y * tw, topZ);
      ctx.fillStyle = '#cdd6e3';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + topS.x, y + topS.y - 8);
      ctx.lineTo(x + topS.x - 5, y + topS.y - 2);
      ctx.lineTo(x + topS.x + 5, y + topS.y - 2);
      ctx.closePath(); ctx.stroke(); ctx.fill();
      return; // 끝 — 옛 사선 ramp 그림 코드 skip
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 6, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 측면 W 삼각형 (그림자 톤)
      ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 1;
      ctx.fillStyle = '#6a4a2a';
      ctx.beginPath();
      ctx.moveTo(sb.x, sb.y); ctx.lineTo(wb.x, wb.y); ctx.lineTo(wT.x, wT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 측면 E 삼각형 (햇빛 톤)
      ctx.fillStyle = '#9a7a4a';
      ctx.beginPath();
      ctx.moveTo(sb.x, sb.y); ctx.lineTo(eb.x, eb.y); ctx.lineTo(eT.x, eT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 뒷면 NW + NE (가장 어둠)
      ctx.fillStyle = '#5a3a1c';
      ctx.beginPath();
      ctx.moveTo(wb.x, wb.y); ctx.lineTo(nb.x, nb.y); ctx.lineTo(nT.x, nT.y); ctx.lineTo(wT.x, wT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(nb.x, nb.y); ctx.lineTo(eb.x, eb.y); ctx.lineTo(eT.x, eT.y); ctx.lineTo(nT.x, nT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 사선 top — 걸어가는 면
      ctx.fillStyle = '#b08858';
      ctx.beginPath();
      ctx.moveTo(sT.x, sT.y); ctx.lineTo(wT.x, wT.y); ctx.lineTo(nT.x, nT.y); ctx.lineTo(eT.x, eT.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // step 선 5개 — S→N 방향으로 등간격, 좌우 ramp 가장자리에 닿음
      ctx.strokeStyle = '#5a3818'; ctx.lineWidth = 1.2;
      for (let i = 1; i <= 5; i++) {
        const f = i / 6;
        let l, r;
        if (f < 0.5) {
          const t = f * 2;
          l = { x: sT.x + (wT.x - sT.x) * t, y: sT.y + (wT.y - sT.y) * t };
          r = { x: sT.x + (eT.x - sT.x) * t, y: sT.y + (eT.y - sT.y) * t };
        } else {
          const t = (f - 0.5) * 2;
          l = { x: wT.x + (nT.x - wT.x) * t, y: wT.y + (nT.y - wT.y) * t };
          r = { x: eT.x + (nT.x - eT.x) * t, y: eT.y + (nT.y - eT.y) * t };
        }
        ctx.beginPath();
        ctx.moveTo(l.x, l.y); ctx.lineTo(r.x, r.y);
        ctx.stroke();
      }
      // 위 방향 화살표 (계단 정상)
      ctx.fillStyle = '#cdd6e3';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      const aX = nT.x, aY = nT.y - 4;
      ctx.beginPath();
      ctx.moveTo(aX, aY - 5); ctx.lineTo(aX - 5, aY + 2); ctx.lineTo(aX + 5, aY + 2);
      ctx.closePath(); ctx.stroke(); ctx.fill();
      // 14.49-e7b: 라벨 제거 (자동 계단이라 키 안내 불필요)
    } else if (type === 'campfire') {
      // 모닥불 — 통나무 + 흔들리는 불꽃
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 5, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 통나무 받침
      ctx.fillStyle = '#5a3a1c';
      ctx.fillRect(x - 10, y - 1, 20, 4);
      ctx.fillStyle = '#3a2818';
      ctx.fillRect(x - 8, y + 3, 16, 2);
      // 불꽃 (시간 기반 흔들림)
      const tt = performance.now() * 0.008;
      const flicker = Math.sin(tt) * 1.5;
      ctx.fillStyle = '#ff6a2a';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 1);
      ctx.quadraticCurveTo(x - 3 + flicker, y - 12, x, y - 16);
      ctx.quadraticCurveTo(x + 4 + flicker, y - 11, x + 5, y - 1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffce4a';
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 2);
      ctx.quadraticCurveTo(x + flicker, y - 9, x + 1, y - 13);
      ctx.quadraticCurveTo(x + 3 + flicker, y - 8, x + 3, y - 2);
      ctx.closePath(); ctx.fill();
    } else if (type === 'siege_camp') {
      // Phase 14.5 — 공성 캠프: 텐트(삼각 천막)
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 5, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 텐트 본체 (삼각)
      ctx.beginPath();
      ctx.moveTo(x, y - 20);
      ctx.lineTo(x + 16, y + 4);
      ctx.lineTo(x - 16, y + 4);
      ctx.closePath();
      ctx.fillStyle = '#7a5a3a'; ctx.fill();
      ctx.strokeStyle = '#3a2818'; ctx.lineWidth = 1; ctx.stroke();
      // 입구 (어두운 사다리꼴)
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.lineTo(x + 2, y - 8);
      ctx.lineTo(x - 2, y - 8);
      ctx.closePath();
      ctx.fillStyle = '#2a1a0a'; ctx.fill();
      // 깃발 — 상단
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 28); ctx.stroke();
      ctx.fillStyle = '#c83a3a';
      ctx.beginPath();
      ctx.moveTo(x, y - 28); ctx.lineTo(x + 7, y - 25); ctx.lineTo(x, y - 22); ctx.closePath();
      ctx.fill();
      // 만료까지 남은 시간 (작은 게이지)
      const exp = building?.data?.expiresAt;
      if (exp) {
        const remain = Math.max(0, exp - Date.now());
        const pct = Math.min(1, remain / (10 * 60 * 1000));
        ctx.fillStyle = '#222'; ctx.fillRect(x - 12, y + 8, 24, 2);
        ctx.fillStyle = pct > 0.3 ? '#9adb6e' : '#c83a3a'; ctx.fillRect(x - 12, y + 8, 24 * pct, 2);
      }
    }
  }

  function drawMobIso(x, y, mob) {
    // Phase 5-6b: 36 mob 종류 — emoji fallback (옛 deer/wolf 외)
    if (mob.type !== 'deer' && mob.type !== 'wolf') {
      const animal = window.Animals?.ANIMALS?.[mob.type];
      if (animal) {
        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        const sz = animal.size === 'tiny' ? 0.5 : animal.size === 'small' ? 0.7 : animal.size === 'medium' ? 1.0 : animal.size === 'large' ? 1.3 : 1.6;
        ctx.ellipse(x, y + 6 * sz, 10 * sz, 4 * sz, 0, 0, Math.PI * 2);
        ctx.fill();
        // emoji
        ctx.font = `${Math.round(24 * sz)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(animal.emoji, x, y);
        // hp bar
        if (mob.hp != null && mob.hp < mob.maxHp) {
          const pct = mob.hp / mob.maxHp;
          ctx.fillStyle = '#222'; ctx.fillRect(x - 12, y - 18 * sz, 24, 3);
          ctx.fillStyle = '#c83a3a'; ctx.fillRect(x - 12, y - 18 * sz, 24 * pct, 3);
        }
        // tame 표시
        if (mob.tameOwner) {
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#ffdd44';
          ctx.fillText('🏠', x, y + 14 * sz);
        }
        return;
      }
    }
    const isWolf = mob.type === 'wolf';
    // Phase 14.38: mob facing (world vx/vy → iso 방향)
    const fvx = mob._fvx ?? 1, fvy = mob._fvy ?? 0;
    const fdx = fvx - fvy, fdy = (fvx + fvy) * 0.5;
    const flen = Math.hypot(fdx, fdy) || 1;
    const facingX = fdx / flen, facingY = fdy / flen;
    // 머리 위치: 몸통 중심에서 facing 방향으로 6px 앞
    const headOX = facingX * 6, headOY = facingY * 3 - 4; // y는 살짝 위
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (isWolf) {
      // 회색 늑대
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 머리 (facing 방향)
      ctx.beginPath(); ctx.arc(x + headOX, y + headOY, 3, 0, Math.PI * 2); ctx.fillStyle = '#555'; ctx.fill();
      // 눈 (머리 위 facing 방향)
      ctx.fillStyle = '#f00';
      ctx.fillRect(x + headOX + facingX * 1.5 - 0.5, y + headOY + facingY * 1.5 - 0.5, 1, 1);
    } else {
      // 갈색 사슴
      ctx.fillStyle = '#a07050';
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 머리 (facing 방향)
      const dhx = x + headOX, dhy = y + headOY - 3;
      ctx.beginPath(); ctx.arc(dhx, dhy, 3, 0, Math.PI * 2); ctx.fillStyle = '#8a5a3a'; ctx.fill();
      // 뿔 (facing 방향, 짧게 두 가닥)
      ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(dhx - 1, dhy - 2); ctx.lineTo(dhx - 2, dhy - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dhx + 1, dhy - 2); ctx.lineTo(dhx + 2, dhy - 5); ctx.stroke();
    }
    // HP bar
    if (mob.hp < mob.maxHp) {
      ctx.fillStyle = '#222'; ctx.fillRect(x - 10, y - 16, 20, 3);
      ctx.fillStyle = '#d85a5a'; ctx.fillRect(x - 10, y - 16, 20 * (mob.hp / mob.maxHp), 3);
    }
    // 이름
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = mob.tameOwner ? '#ffb0c0' : '#cdd6e3';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
    const baseLabel = isWolf ? '늑대' : '사슴';
    const label = mob.tameOwner ? `❤️ ${baseLabel} (${mob.tameOwnerName || ''})` : baseLabel;
    ctx.strokeText(label, x, y - 20); ctx.fillText(label, x, y - 20);
    ctx.textAlign = 'start';
  }

  // Phase 5-8: 입체 나무 — r(반경) + h(높이) 사용. 사실적 줄기+캐노피.
  // 나무 색 변주 팔레트 [어두운잎, 밝은잎] + 잎뭉치 오프셋 — 모듈 1회 생성(매 프레임 재생성 X)
  const _TREE_GREENS = [
    ['#2f6b39', '#5aa85e'],   // 기본
    ['#357a3d', '#67b566'],   // 밝은
    ['#27602f', '#4d9a50'],   // 어두운
    ['#3f6e2b', '#74ad49'],   // 누런 (가을 직전)
    ['#2c6647', '#50a878'],   // 청록
  ];
  const _CANOPY_BLOBS = [      // [dx, dy, scale] (canopyR 기준) — 유기적 실루엣
    [0.0,   0.12, 1.00],
    [-0.60, 0.20, 0.60],
    [0.60,  0.20, 0.60],
    [-0.32, -0.42, 0.64],
    [0.36,  -0.40, 0.60],
    [0.0,   -0.34, 0.74],
  ];
  function _treeHash(sx, sy) {  // 위치 기반 결정적 해시(0~1) — 나무마다 일정한 색/형태(깜빡임 없음)
    let h = (Math.floor(sx) * 73856093) ^ (Math.floor(sy) * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 997) / 997;
  }
  // 나무 스프라이트 (Kenney Nature Kit, 초록 recolor) — public/assets/trees/. 로드되면 벡터 대신 사용.
  // ★[에셋 3차 — 자연물 리스킨] RD 생성 스프라이트(assets-src/rd-nature-sheet.png에서 추출·분류) — 나무 파이프라인 동형.
  //   rock=바위6+이끼바위6 풀, ore=구리 광맥6, bush=딸기 덤불6, herb=약초6. 로드 전엔 기존 절차 렌더 폴백.
  const NATURE_SPRITES = {};
  let _natureLoaded = 0;
  (() => {
    const add = (cls, name, n) => { const a = (NATURE_SPRITES[cls] = NATURE_SPRITES[cls] || []); for (let i = 1; i <= n; i++) { const im = new Image(); im.onload = () => _natureLoaded++; im.src = '/assets/nature/' + name + String(i).padStart(2, '0') + '.png'; a.push(im); } };
    add('rock', 'rock', 6); add('rock', 'mossrock', 6); add('ore', 'ore', 6); add('bush', 'bush', 6); add('herb', 'herb', 6);
  })();
  const NATURE_BASE_W = { rock: 44, mossrock: 44, ore: 42, bush: 40, herb: 30 };   // ★인게임 기준 폭(px) — 대형안[사용자 확정]: 그리기=×1.5(약초 ×1.25) → 바위 66·광맥 63·덤불 60·약초 38px(나무 ~78px과 동급). 자산 해상도 무관 화면 크기 고정
  function drawNatureSprite(cls, x, y, seedX, seedY, scale) {   // 위치 해시로 변형 고정(깜빡임 없음) — 바닥 중심 앵커+그림자
    const arr = NATURE_SPRITES[cls]; if (!arr || !_natureLoaded) return false;
    const hsh = _treeHash(seedX != null ? seedX : x, seedY != null ? seedY : y);
    const im = arr[(hsh * arr.length) | 0];
    if (!im || !im.complete || !im.naturalHeight) return false;
    const sc = scale || 1.5, w = (NATURE_BASE_W[cls] || 26) * sc, hh = w * (im.naturalHeight / im.naturalWidth);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, w * 0.42, w * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(im, x - w / 2, y - hh + 5, w, hh);
    return true;
  }
  // ★[다리 스프라이트 — 에셋 9차] scripts/bridge_render.py 산출물(256², 알파).
  //   중간 타일 mid + 접지 캡 cap0/cap1 × 축 x/y = 6장. **자연물과 규약이 다르다**:
  //   자연물은 bbox 크롭 후 화면 폭을 상수로 잡지만, 다리는 셀에 딱 맞아야 하므로 **크롭 금지**이고
  //   이미지 중심 = 셀 중심, 그리기 크기 = 128×128 고정(셀 다이아 64px의 2배)이다.
  const BRIDGE_SPRITES = {};
  let _bridgeLoaded = 0;
  (() => {
    for (const k of ['bridge_mid_x', 'bridge_mid_y', 'bridge_cap0_x', 'bridge_cap0_y', 'bridge_cap1_x', 'bridge_cap1_y',
                     'gran_pile1', 'gran_pile2', 'gran_pile3', 'gran_prop',
                     'yard_hearth', 'yard_jar1', 'yard_jar2', 'yard_garden',      // ★10차: 마당 소품(화덕·장독2·텃밭)
                     'mkt_mat', 'mkt_basket', 'mkt_jar', 'mkt_hide',              // ★10차 T4: 장마당 좌판(멍석·바구니·항아리·가죽)
                     'ditch_x', 'ditch_y', 'ditch_c']) {                          // ★11차 T3: 환호 도랑(가로·세로·모서리)
      const im = new Image(); im.onload = () => _bridgeLoaded++; im.src = '/assets/bridge/' + k + '.png';
      BRIDGE_SPRITES[k] = im;
    }
  })();
  const BRIDGE_DRAW_PX = 128;   // = 셀 다이아 폭(64) × 2 — 렌더 ortho_scale=2√2와 짝인 상수
  // ★[10차 T4 장마당] 좌판 배치 — 큰집(8×8, 발자국 [-4..3]²) 남벽 문 앞 마당. 문 통로(dx=0)와 그 옆(dx=±1)은
  //   비워 둔다(랩 _hallYard가 쓰는 통로 — 막으면 NPC 문턱 정체). dy≥5라 발자국 밖·마당 원(r10) 안.
  const MARKET_STALLS = [['mkt_mat', -3, 5], ['mkt_basket', -1, 7], ['mkt_jar', 2, 5], ['mkt_hide', 4, 6]];
  function drawBridgeSprite(key, wx, wy, toScreenFn) {
    const im = BRIDGE_SPRITES[key]; if (!im || !im.complete || !im.naturalHeight) return false;
    const p = w2i(wx, wy), s = toScreenFn(p.x, p.y);
    ctx.drawImage(im, s.x - BRIDGE_DRAW_PX / 2, s.y - BRIDGE_DRAW_PX / 2, BRIDGE_DRAW_PX, BRIDGE_DRAW_PX);
    return true;
  }
  // 같은 규약을 **화면 좌표로 직접** 쓰는 경로(지면 타일 draw는 이미 셀 중심 화면좌표를 받는다)
  function drawCellSpriteAt(key, sx, sy) {
    const im = BRIDGE_SPRITES[key]; if (!im || !im.complete || !im.naturalHeight) return false;
    ctx.drawImage(im, sx - BRIDGE_DRAW_PX / 2, sy - BRIDGE_DRAW_PX / 2, BRIDGE_DRAW_PX, BRIDGE_DRAW_PX);
    return true;
  }
  const TREE_SPRITES = [];
  let _treeSpritesLoaded = 0;
  for (let _ti = 1; _ti <= 12; _ti++) {
    const _img = new Image();
    _img.onload = () => { _treeSpritesLoaded++; };
    _img.src = '/assets/trees/tree' + String(_ti).padStart(2, '0') + '.png';
    TREE_SPRITES.push(_img);
  }
  const TREE_SPRITE_SCALE = 1.3;   // 나무 h 대비 스프라이트 높이 배수
  const _treeDraw = { n: 0, h: 0, px: 0, aspect: 0 };   // ★[배치 21] 하네스용 — 스프라이트 경로로 **실제 그린** 횟수

  function drawTreeIso(x, y, r, h, seedX, seedY) {
    r = r || 8;
    h = h || 60;
    const hsh = _treeHash(seedX != null ? seedX : x, seedY != null ? seedY : y);
    // 스프라이트 로드됐으면 그걸로 — 해시로 종류 고정, 줄기 밑면을 (x,y)에 앵커, h로 스케일
    if (_treeSpritesLoaded > 0) {
      const _img = TREE_SPRITES[(hsh * TREE_SPRITES.length) | 0];
      if (_img && _img.complete && _img.naturalHeight) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        const _dh = h * TREE_SPRITE_SCALE;
        const _dw = _dh * (_img.naturalWidth / _img.naturalHeight);
        ctx.drawImage(_img, x - _dw / 2, y - _dh, _dw, _dh);
        _treeDraw.n++; _treeDraw.h = h; _treeDraw.px = _dh; _treeDraw.aspect = _img.naturalWidth / _img.naturalHeight;
        return;
      }
    }
    // 1) 지면 그림자 — 부드럽게
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r * 1.5, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 2) 줄기 — 아래가 넓은 테이퍼 + 나무마다 살짝 다른 기울기
    const trunkH = h * 0.55;
    const baseW = Math.max(3.5, r * 0.5);
    const topW = Math.max(2.2, r * 0.3);
    const tX = x + (hsh - 0.5) * r * 0.3, tY = y - trunkH;
    ctx.fillStyle = '#5b3d23';
    ctx.beginPath();
    ctx.moveTo(x - baseW / 2, y);
    ctx.lineTo(x + baseW / 2, y);
    ctx.lineTo(tX + topW / 2, tY);
    ctx.lineTo(tX - topW / 2, tY);
    ctx.closePath(); ctx.fill();
    // 줄기 그늘(오른쪽 절반)
    ctx.fillStyle = '#422c17';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + baseW / 2, y);
    ctx.lineTo(tX + topW / 2, tY);
    ctx.lineTo(tX, tY);
    ctx.closePath(); ctx.fill();
    // 3) 캐노피 — 여러 잎뭉치(유기적). 2톤 + 나무별 색 변주
    const pal = _TREE_GREENS[(hsh * _TREE_GREENS.length) | 0];
    const canopyR = r * 1.5;
    const ccx = tX, ccy = tY - canopyR * 0.5;
    // base(어두운 톤) — 모든 뭉치 한 번에 fill (같은 색이라 겹쳐도 매끈하게 합쳐짐)
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    for (let i = 0; i < _CANOPY_BLOBS.length; i++) {
      const b = _CANOPY_BLOBS[i];
      const bx = ccx + b[0] * canopyR, by = ccy + b[1] * canopyR, br = b[2] * canopyR;
      ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, Math.PI * 2);
    }
    ctx.fill();
    // highlight(밝은 톤) — 위쪽 뭉치만 살짝 위/왼쪽으로 (햇빛)
    ctx.fillStyle = pal[1];
    ctx.beginPath();
    for (let i = 0; i < _CANOPY_BLOBS.length; i++) {
      const b = _CANOPY_BLOBS[i];
      if (b[1] > -0.1) continue;
      const bx = ccx + b[0] * canopyR - canopyR * 0.1, by = ccy + b[1] * canopyR - canopyR * 0.14, br = b[2] * canopyR * 0.8;
      ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function drawRockIso(x, y, seedX, seedY) {
    if (drawNatureSprite('rock', x, y, seedX, seedY)) return;   // ★에셋 3차: 스프라이트 우선(로드 전 절차 폴백)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 2);
    ctx.lineTo(x - 6, y - 6);
    ctx.lineTo(x + 3, y - 8);
    ctx.lineTo(x + 10, y - 2);
    ctx.lineTo(x + 8, y + 5);
    ctx.lineTo(x - 4, y + 6);
    ctx.closePath();
    ctx.fillStyle = '#8a8a8a'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 5); ctx.lineTo(x + 2, y - 7); ctx.lineTo(x + 0, y - 3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
  }

  function drawBerryBushIso(x, y, seedX, seedY) {
    if (drawNatureSprite('bush', x, y, seedX, seedY)) return;   // ★에셋 3차
    // 낮은 덤불 + 빨간 베리들
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 4, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a4a20';
    ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a3a10'; ctx.lineWidth = 1; ctx.stroke();
    // 베리들
    ctx.fillStyle = '#c83a3a';
    ctx.beginPath(); ctx.arc(x - 3, y - 1, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 2, y - 3, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y + 1, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 1, y + 2, 1.5, 0, Math.PI*2); ctx.fill();
  }

  function drawWaterPoolIso(x, y) {
    // 푸른 다이아 (반짝이는 작은 연못)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 6); ctx.lineTo(x + 14, y);
    ctx.lineTo(x, y + 6); ctx.lineTo(x - 14, y); ctx.closePath();
    ctx.fillStyle = '#2a6aa8'; ctx.fill();
    ctx.strokeStyle = '#1a4a78'; ctx.lineWidth = 1; ctx.stroke();
    // 반짝이
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(x - 4, y - 1, 3, 1, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 5, y + 2, 2, 0.8, 0, 0, Math.PI*2); ctx.fill();
  }

  // Phase 14.3 — 약초 (herb): 작은 녹색 꽃 무더기
  function drawHerbIso(x, y, seedX, seedY) {
    if (drawNatureSprite('herb', x, y, seedX, seedY, 1.25)) return;   // ★에셋 3차(약초는 작게)
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 8, 3, 0, 0, Math.PI*2); ctx.fill();
    // 줄기 3개
    ctx.strokeStyle = '#3a7a3a'; ctx.lineWidth = 1.5;
    for (const [ox, oy] of [[-4, 0], [0, -2], [4, 0]]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y); ctx.lineTo(x + ox, y - 10 + oy); ctx.stroke();
    }
    // 잎/꽃
    ctx.fillStyle = '#7ac86a';
    for (const [ox, oy] of [[-4, -10], [0, -12], [4, -10]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, 2.5, 0, Math.PI*2); ctx.fill();
    }
    // 노란 꽃 점
    ctx.fillStyle = '#e8d048';
    for (const [ox, oy] of [[-4, -10], [4, -10]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, 1, 0, Math.PI*2); ctx.fill();
    }
  }

  // Phase 14.3 — 광물 (ore): 회색 바위 + 빛나는 금속 결정
  function drawOreIso(x, y, seedX, seedY) {
    if (drawNatureSprite('ore', x, y, seedX, seedY)) return;   // ★에셋 3차
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 13, 5, 0, 0, Math.PI*2); ctx.fill();
    // 바위 본체
    ctx.beginPath();
    ctx.moveTo(x - 12, y); ctx.lineTo(x, y - 14);
    ctx.lineTo(x + 12, y - 2); ctx.lineTo(x + 8, y + 6);
    ctx.lineTo(x - 8, y + 6); ctx.closePath();
    ctx.fillStyle = '#5a5a6a'; ctx.fill();
    ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1; ctx.stroke();
    // 금속 결정 (반짝)
    ctx.fillStyle = '#c8a838';
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 4); ctx.lineTo(x, y - 9);
    ctx.lineTo(x + 3, y - 4); ctx.lineTo(x, y - 1); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a7820'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,200,0.6)';
    ctx.beginPath(); ctx.arc(x, y - 6, 1.5, 0, Math.PI*2); ctx.fill();
  }

  // ★운철(隕鐵) 낙하지 — 광맥 노두와 헷갈리면 안 된다. 그을린 웅덩이(충돌 흔적) 위에
  //   **금속 광택이 도는 검은 덩어리**. 광맥의 노란 결정(구리·금)과 달리 은백색으로 번쩍인다.
  function drawMeteoriteIso(x, y, seedX, seedY) {
    ctx.save();
    // 충돌 그을음(둘레)
    ctx.fillStyle = 'rgba(30,24,20,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 6, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 덩어리 본체 — 모난 다면체
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 2); ctx.lineTo(x - 7, y - 9); ctx.lineTo(x + 2, y - 12);
    ctx.lineTo(x + 10, y - 5); ctx.lineTo(x + 7, y + 4); ctx.closePath();
    ctx.fillStyle = '#3a3630'; ctx.fill();
    ctx.strokeStyle = '#17140f'; ctx.lineWidth = 1.1; ctx.stroke();
    // 파단면의 금속 광택(비트만슈테텐 무늬 암시)
    ctx.strokeStyle = 'rgba(210,215,225,0.85)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 5, y - 2); ctx.lineTo(x + 4, y - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3, y - 7); ctx.lineTo(x + 5, y - 3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x + 1, y - 6, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSpeechBubble(x, y, text) {
    if (!text) return;
    ctx.font = '12px sans-serif';
    const padding = 6;
    const maxWidth = 200;
    // 줄바꿈
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const lineH = 15;
    const bubW = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width))) + padding * 2;
    const bubH = lines.length * lineH + padding * 2;
    const bx = x - bubW / 2;
    const by = y - bubH - 8;
    // 배경
    ctx.fillStyle = 'rgba(245, 245, 235, 0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bubW, bubH, 6);
    else ctx.rect(bx, by, bubW, bubH);
    ctx.fill(); ctx.stroke();
    // 꼬리
    ctx.beginPath();
    ctx.moveTo(x - 5, by + bubH);
    ctx.lineTo(x, by + bubH + 6);
    ctx.lineTo(x + 5, by + bubH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 245, 235, 0.95)';
    ctx.fill(); ctx.stroke();
    // 텍스트
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, by + padding + (i + 1) * lineH - 3);
    }
    ctx.textAlign = 'start';
  }

  // Phase 14.35: 걷기 + 공격 모션
  // - moving: walking bob (sin wave) + 다리 교차
  // - attackPhase 0~1: 무기 휘두름 (앞으로 lunge + 회복)
  function drawPlayerIso(x, y, name, color, isMe = false, opts = {}) {
    const t = performance.now() * 0.01;
    const moving = opts.moving || false;
    const isDown = !!opts.isDown; // Phase 14.41
    const attackP = Math.max(0, opts.attackPhase || 0); // 0=쉼, 1=시작, 0.5=중간
    // §18 3파: 포로 표식 — 발치 회색 테두리 링(호송·억류. 서버 makeEntry cap 1비트)
    if (opts.cap) { ctx.strokeStyle = 'rgba(200,200,200,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 4, 11, 4.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    // Phase 14.41: 다운 — 누워있는 모습 (옆으로 길게)
    if (isDown) {
      // 그림자 크게
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      // 몸통 (옆으로 누움)
      ctx.fillStyle = color;
      ctx.fillRect(x - 12, y - 2, 22, 7);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 12, y - 2, 22, 7);
      // 머리 (한쪽 끝)
      ctx.beginPath(); ctx.arc(x + 12, y + 1, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f0d8b8'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      // X 눈 (다운)
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x + 10, y - 1); ctx.lineTo(x + 13, y + 2);
      ctx.moveTo(x + 13, y - 1); ctx.lineTo(x + 10, y + 2); ctx.stroke();
      // 이름 + 💀
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8888';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
      ctx.strokeText('💀 ' + name, x, y - 12);
      ctx.fillText('💀 ' + name, x, y - 12);
      ctx.textAlign = 'start';
      return;
    }
    // §4-4 P4: 전쟁 병사 전투 스타일 — 기존 휴머노이드 경로(서버 위치 보간·걷기)를 유지하고
    //   병종색(bt)·진영 테두리(bs)·궤주 반투명(br)·지휘관 금테(bc)만 덧입힘("전투 스타일 분기만 추가").
    const isWar = !!opts.war;
    const bodyColor = isWar ? (WAR_BT_COL[opts.bt | 0] || color) : color;
    const _aSave = ctx.globalAlpha;
    if (isWar && opts.br) ctx.globalAlpha = _aSave * 0.45;   // 궤주=반투명
    // Phase 14.37: facing — vx/vy를 iso 화면 방향으로 변환
    // world(vx,vy) → iso 화면 dx,dy: dx = vx-vy, dy = (vx+vy)/2
    const fvx = opts.fvx || 0, fvy = opts.fvy || 0;
    const fdx = fvx - fvy;
    const fdy = (fvx + fvy) * 0.5;
    const flen = Math.hypot(fdx, fdy) || 1;
    const facingX = fdx / flen, facingY = fdy / flen; // 화면상 방향 unit vector
    // walk bob (위아래 살짝)
    const bob = moving ? Math.sin(t * 1.3) * 1.6 : 0;
    // attack lunge (앞으로 살짝 — 화면상 동남 방향)
    const lungeAmt = Math.sin(attackP * Math.PI) * 5;
    const lx = x + lungeAmt * 0.5;
    const ly = y + lungeAmt * 0.3;

    // 그림자 — 발이 움직일 때도 그림자 고정
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 6, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

    // 다리 (걷기 시 좌우 교차)
    const legSwing = moving ? Math.sin(t * 1.8) * 2 : 0;
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(lx - 4, ly + 3, 3, 5 - legSwing);
    ctx.fillRect(lx + 1, ly + 3, 3, 5 + legSwing);

    // 몸통 (bob 적용) — 전쟁 병사는 병종색
    ctx.fillStyle = bodyColor;
    ctx.fillRect(lx - 5, ly - 6 + bob, 10, 12);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.strokeRect(lx - 5, ly - 6 + bob, 10, 12);
    if (isWar) { ctx.strokeStyle = WAR_SIDE_COL[opts.bs | 0] || '#fff'; ctx.lineWidth = 2; ctx.strokeRect(lx - 6, ly - 7 + bob, 12, 14); }   // 진영 테두리(0공격 파랑·1방어 빨강)

    // 팔 + 슬래시 (공격 시 앞쪽으로 휘두름)
    if (attackP > 0) {
      // 팔
      ctx.strokeStyle = '#f0d8b8'; ctx.lineWidth = 2;
      const swing = Math.sin(attackP * Math.PI);
      const armX = lx + facingX * 8 + swing * facingX * 6;
      const armY = ly - 2 + bob + facingY * 4 + swing * facingY * 3;
      ctx.beginPath();
      ctx.moveTo(lx + facingX * 2, ly + bob + facingY * 1);
      ctx.lineTo(armX, armY);
      ctx.stroke();
      // Phase 14.38: 슬래시 호 — facing 방향 앞쪽에 짧은 흰 arc (반투명)
      const slashR = 16;
      const slashCx = lx + facingX * 10;
      const slashCy = ly + bob + facingY * 6;
      const baseAng = Math.atan2(facingY, facingX);
      // 호 각도: attackP 0→1 진행 따라 -π/3 → +π/3 회전 (휘두름)
      const sweep = (attackP - 0.5) * (Math.PI * 0.8);
      ctx.strokeStyle = `rgba(255, 255, 255, ${attackP * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(slashCx, slashCy, slashR, baseAng + sweep - 0.4, baseAng + sweep + 0.4);
      ctx.stroke();
    }

    // 머리 (bob 적용)
    const hx = lx, hy = ly - 11 + bob;
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f0d8b8'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    // Phase 14.37: 눈 (facing 방향) — 작은 검은 점 2개
    if (fvx !== 0 || fvy !== 0) {
      const eyeOX = facingX * 2.5, eyeOY = facingY * 1.5;
      // 두 눈 (좌우 분리) — facing에 수직인 방향
      const perpX = -facingY, perpY = facingX;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(hx + eyeOX + perpX * 1.5, hy + eyeOY + perpY * 1.5, 0.9, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + eyeOX - perpX * 1.5, hy + eyeOY - perpY * 1.5, 0.9, 0, Math.PI*2); ctx.fill();
    }

    // §4-4 P4: 지휘관 금테 + ★ (bc) — 발치 금색 링 + 머리 위 별.
    if (isWar && opts.bc) {
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(lx, ly + 6, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffe14d'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('★', hx, hy - 8); ctx.textAlign = 'start';
    }
    if (isWar) ctx.globalAlpha = _aSave;   // 알파 복원 — 이름표는 정상 가시(궤주여도 라벨 판독)

    // 이름표
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#fff' : '#cdd6e3';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(name, x, y - 22);
    ctx.fillText(name, x, y - 22);
    // ★[액션 라벨 — 생활 층 100% 가시화] 이름 위 작은 행동 라벨(모내기·잠행·추적·개간·건축·취침…) — 서버 makeEntry e.act
    if (opts.act && !isMe) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#ffd77a';
      ctx.lineWidth = 2.5;
      ctx.strokeText(opts.act, x, y - 33);
      ctx.fillText(opts.act, x, y - 33);
    }
    ctx.textAlign = 'start';
  }

  // === HUD ===
  // 음식 아이콘 매핑 (인벤토리 표시 + 클릭 시 'eat' 송신)
  const ITEM_ICONS = {
    pillar: '🪵', rafter: '🥢', thatch: '🌾',   // ★건축 중간재(움집 고증 공정)
    berry: '🫐', fiber: '🌾', meat_raw: '🥩', meat_cooked: '🍗',
    hide: '🦌', berry_jam: '🍯', water_bottle: '🥤',
    seed_berry: '🌱', herb: '🌿', ore: '⛏️',
    // 14.50: 목공 자원
    wood: '🪵', plank: '🪚', stone: '🪨',
    // ★[2026-08-02] 야금 — 아이콘이 없으면 인벤 창에 기본 📦 가 뜬다(itemIconHtml 폴백)
    ore_chunk: '🪨', iron_ore: '⚙️', charcoal: '🌑', meteoric_iron: '☄️',
    iron: '⚙️', copper: '🟠', tin: '⚪', lead: '⬜', silver: '🥈', gold: '🥇', nickel: '⚪', jade_raw: '🟢',
    // 14.51: 건축물 아이템 (인벤에 들어가는 형태)
    item_wall: '🧱', item_floor: '⬜', item_door: '🚪', item_fence: '🪵',
    item_stair: '🪜', item_chest: '📦', item_campfire: '🔥', item_farmland: '🌱',
  };
  // === 에셋 5차: 인벤 아이콘 3D 렌더(Blender icon_render.py) ===
  // /assets/icons/<key>.png (96×96 알파, 자연물과 동일 씬·조명). 로드 성공한 키만 이미지로 교체 —
  // 실패/미배포 시 위 이모지가 그대로 폴백이라 어느 쪽이든 UI가 비지 않는다.
  const ITEM_ICON_IMG = {};
  let _iconImgLoaded = 0;
  (function preloadItemIcons() {
    if (typeof Image !== 'function') return;
    const keys = Object.keys(ITEM_ICONS);
    let settled = 0;
    const done = () => {
      if (++settled === keys.length) { try { updateHud(); } catch (e) {} }
    };
    for (const k of keys) {
      const im = new Image();
      im.onload = () => { ITEM_ICON_IMG[k] = im; _iconImgLoaded++; done(); };
      im.onerror = () => { done(); };
      im.src = '/assets/icons/' + k + '.png';
    }
  })();
  function itemIconImg(k) {
    const im = ITEM_ICON_IMG[k];
    return (im && im.complete && im.naturalWidth > 0) ? im : null;
  }
  // DOM(innerHTML)용 — 이미지 있으면 <img>, 없으면 이모지(그것도 없으면 fb)
  function itemIconHtml(k, px, fb) {
    const s = px || 20;
    const im = itemIconImg(k);
    if (im) return `<img class="item-icon" src="${im.src}" width="${s}" height="${s}" alt="" style="vertical-align:middle;display:inline-block">`;
    return (ITEM_ICONS && ITEM_ICONS[k]) || fb || '📦';
  }
  // 캔버스용 — 이미지 있으면 drawImage, 없으면 이모지 fillText (중심 정렬 동일)
  function drawItemIcon(ctx, k, sx, sy, px) {
    const s = px || 18;
    const im = itemIconImg(k);
    if (im) { ctx.drawImage(im, sx - s / 2, sy - s / 2, s, s); return; }
    const icon = (ITEM_ICONS && ITEM_ICONS[k]) || '📦';
    ctx.font = Math.round(s * 0.9) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(icon, sx, sy);
  }
  const ITEM_LABEL = {
    pillar: '기둥', rafter: '서까래', thatch: '이엉',   // ★건축 중간재
    berry: '베리', fiber: '풀', meat_raw: '날고기', meat_cooked: '구운고기',
    hide: '가죽', berry_jam: '베리잼', water_bottle: '물병',
    seed_berry: '베리씨앗', herb: '약초', ore: '광물',
    ore_chunk: '원석(kg·미확인)',   // ★[11차] 캔 것은 정체를 모른다 — 마을에서 선광(O키)해야 광석/맥석이 갈린다. 덩이 크기가 숙련마다 달라 **kg 단위**로 센다
    // ★[2026-08-02 야금 사슬] 라벨이 없으면 인벤 창에 **영문 키가 그대로** 뜬다(ITEM_LABEL[k] || k).
    iron_ore: '철 정광', charcoal: '숯', meteoric_iron: '운철(隕鐵)', lead: '납', nickel: '니켈',
    iron: '철', copper: '구리', tin: '주석', coal: '석탄', jade_raw: '옥 원석',   // ★[2026-08-02d] iron=제련 금속(정광은 iron_ore='철 정광')
    marble: '대리석', tungsten: '텅스텐', gold: '금', silver: '은',
    wood: '통나무', plank: '판자', stone: '돌',
    item_wall: '벽', item_floor: '바닥', item_door: '문', item_fence: '울타리',
    item_stair: '계단', item_chest: '상자', item_campfire: '모닥불', item_farmland: '농지',
  };

  // 14.53: 우클릭 컨텍스트 메뉴 — 임의 옵션 list 받아서 마우스 위치에 띄움.
  let _ctxMenuEl = null;
  function hideContextMenu() {
    if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
    document.removeEventListener('click', hideContextMenu, true);
    document.removeEventListener('contextmenu', hideContextMenu, true);
  }
  function showContextMenu(x, y, options) {
    hideContextMenu();
    const m = document.createElement('div');
    m.id = 'ctxMenu';
    m.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:rgba(20,25,32,0.97);border:1px solid #5a7ab0;border-radius:6px;z-index:99999;min-width:180px;padding:4px;box-shadow:0 4px 16px rgba(0,0,0,0.5);font-size:13px;color:#fff;font-family:sans-serif`;
    for (const opt of options) {
      const it = document.createElement('div');
      it.textContent = opt.label;
      it.style.cssText = 'padding:8px 14px;cursor:pointer;border-radius:4px;user-select:none';
      it.onmouseenter = () => it.style.background = 'rgba(90,122,176,0.3)';
      it.onmouseleave = () => it.style.background = 'transparent';
      it.onclick = (e) => {
        e.stopPropagation();
        hideContextMenu();
        try { opt.onClick(); } catch(err) { console.warn('ctx menu err', err); }
      };
      m.appendChild(it);
    }
    document.body.appendChild(m);
    _ctxMenuEl = m;
    // viewport 밖이면 보정
    const rect = m.getBoundingClientRect();
    if (rect.right > window.innerWidth) m.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) m.style.top = (window.innerHeight - rect.height - 8) + 'px';
    // 외부 클릭 = 닫기
    setTimeout(() => {
      document.addEventListener('click', hideContextMenu, true);
      document.addEventListener('contextmenu', hideContextMenu, true);
    }, 50);
  }
  // 14.53: 화면 하단 중앙 hotkey 슬롯 (1번). 드래그로 도구 등록 + 1키로 토글.
  function ensureHotkeyBar() {
    let bar = document.getElementById('hotkeyBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'hotkeyBar';
    bar.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:500;display:flex;gap:8px;pointer-events:none';
    bar.innerHTML = `
      <div id="hkSlot1" data-slot="1" style="pointer-events:auto;width:64px;height:64px;background:rgba(15,18,22,0.92);border:2px solid #444;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;user-select:none">
        <div style="position:absolute;top:2px;left:4px;font-size:10px;color:#8a93a0;font-weight:bold">1</div>
        <div class="hk-icon" style="font-size:24px;line-height:1">·</div>
        <div class="hk-label" style="font-size:9px;color:#6c7686;margin-top:1px">비어있음</div>
      </div>
    `;
    document.body.appendChild(bar);
    const slot = bar.querySelector('#hkSlot1');
    // 드래그 받기
    slot.addEventListener('dragover', (e) => {
      const types = e.dataTransfer.types;
      if (types && (Array.from(types).includes('text/x-tool-instance'))) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        slot.style.borderColor = '#f0c674';
      }
    });
    slot.addEventListener('dragleave', () => {
      slot.style.borderColor = (equipped && equipped === hotkey1) ? '#7cd97c' : '#444';
    });
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/x-tool-instance');
      if (id) sendPrimary({ type: 'set_hotkey', toolItemId: id });
    });
    // 클릭 = 토글 (1키와 동일)
    slot.addEventListener('click', () => {
      if (!hotkey1) { showNotice('인벤에서 도구를 드래그하세요'); return; }
      sendPrimary({ type: 'toggle_hotkey' });
    });
    // 우클릭 = 슬롯 비우기
    slot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (hotkey1) {
        sendPrimary({ type: 'set_hotkey', toolItemId: null });
        showNotice('1번 슬롯 비움');
      }
    });
    return bar;
  }
  function updateHotkeyBar() {
    const bar = ensureHotkeyBar();
    const slot = bar.querySelector('#hkSlot1');
    if (!slot) return;
    const TOOL_ICON_MAP = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
    const iconEl = slot.querySelector('.hk-icon');
    const labelEl = slot.querySelector('.hk-label');
    if (hotkey1) {
      const inst = toolItems.find(t => t.id === hotkey1);
      if (inst) {
        iconEl.textContent = TOOL_ICON_MAP[inst.type] || '🔧';
        const dur = `${inst.d}/${inst.max}`;
        const isEq = (equipped === inst.id);
        labelEl.textContent = isEq ? '✓착용 중' : '대기';
        labelEl.style.color = isEq ? '#7cd97c' : '#8fc8ff';
        slot.style.borderColor = isEq ? '#7cd97c' : '#5a7ab0';
        slot.style.background = isEq ? 'rgba(40,80,40,0.92)' : 'rgba(15,18,22,0.92)';
        slot.title = `${inst.type} (${dur}) — 1키 또는 클릭 = 토글, 우클릭 = 슬롯 비우기`;
      } else {
        // hotkey instance 사라짐 (서버에서 cleanup될 거임)
        iconEl.textContent = '·';
        labelEl.textContent = '깨짐';
        labelEl.style.color = '#e07060';
        slot.style.borderColor = '#444';
        slot.style.background = 'rgba(15,18,22,0.92)';
      }
    } else {
      iconEl.textContent = '·';
      labelEl.textContent = '비어있음';
      labelEl.style.color = '#6c7686';
      slot.style.borderColor = '#444';
      slot.style.background = 'rgba(15,18,22,0.92)';
      slot.title = '인벤에서 도구를 드래그해서 등록 (1키로 토글)';
    }
  }
  function updateHud() {
    document.getElementById('invWood').textContent = inventory.wood || 0;
    const plankEl = document.getElementById('invPlank');
    if (plankEl) plankEl.textContent = inventory.plank || 0;
    document.getElementById('invStone').textContent = inventory.stone || 0;
    const eqEl = document.getElementById('equippedBadge');
    if (eqEl) {
      const icons = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️' };
      // 14.53: equipped = toolItemId → instance 찾아 type 표시
      const inst = equipped ? findToolInstance(equipped) : null;
      if (inst) {
        const TOOL_ICON_MAP2 = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
        eqEl.textContent = `${TOOL_ICON_MAP2[inst.type] || ''} ${inst.type} ${inst.d}/${inst.max}`;
      } else {
        eqEl.textContent = '맨손';
      }
    }
    const hpEl = document.getElementById('hpFill');
    if (hpEl) {
      hpEl.style.width = `${Math.max(0, (myHp / myMaxHp) * 100)}%`;
      document.getElementById('hpText').textContent = `${Math.round(myHp)}/${myMaxHp}`;
    }
    // hunger / thirst bar
    const hungerEl = document.getElementById('hungerFill');
    if (hungerEl) {
      hungerEl.style.width = `${Math.max(0, myHunger)}%`;
      document.getElementById('hungerText').textContent = `🍖 ${Math.round(myHunger)}${myCold ? ' 🥶추움' : ''}`;
    }
    const thirstEl = document.getElementById('thirstFill');
    if (thirstEl) {
      thirstEl.style.width = `${Math.max(0, myThirst)}%`;
      document.getElementById('thirstText').textContent = `💧 ${Math.round(myThirst)}`;
    }
    const vpEl = document.getElementById('vpFill');
    if (vpEl) {
      vpEl.style.width = `${Math.max(0, Math.min(100, myVp))}%`;
      const txt = myVp >= VP_THRESHOLD
        ? `⚠️ 적대감 ${Math.round(myVp)} — 내 영지 보호 해제됨!`
        : `⚖️ 적대감 ${Math.round(myVp)}/${VP_THRESHOLD}`;
      document.getElementById('vpText').textContent = txt;
      document.querySelector('.vp-bar')?.classList.toggle('danger', myVp >= VP_THRESHOLD);
    }
    // Phase 14.40: Sprint 뱃지 — Shift 누르고 있을 때 시각 피드백
    const pvpBadgeForSprint = document.getElementById('pvpBadge');
    if (pvpBadgeForSprint) {
      let sprintBadge = document.getElementById('sprintBadge');
      if (!sprintBadge) {
        sprintBadge = document.createElement('span');
        sprintBadge.id = 'sprintBadge';
        sprintBadge.className = 'badge';
        sprintBadge.title = 'Shift = 달리기 (배고픔/목마름 1.5배 소모)';
        pvpBadgeForSprint.parentNode.insertBefore(sprintBadge, pvpBadgeForSprint);
      }
      const canSp = mySprint && myHunger > 5 && myThirst > 5;
      sprintBadge.textContent = canSp ? '🏃 달리기' : (mySprint ? '😩 지침' : '🚶 걷기');
      sprintBadge.style.background = canSp ? 'rgba(80,180,80,0.35)' : '';
    }
    // PvP 뱃지
    const pvpBadge = document.getElementById('pvpBadge');
    if (pvpBadge) {
      pvpBadge.textContent = myPvpEnabled ? '⚔️ PvP ON' : '🕊️ PvP OFF';
      pvpBadge.style.background = myPvpEnabled ? 'rgba(176,48,48,0.4)' : '';
      pvpBadge.onclick = () => sendPrimary({ type: 'pvp_set', enabled: !myPvpEnabled });
      pvpBadge.style.cursor = 'pointer';
    }
    // 건축 층 뱃지
    let floorBadge = document.getElementById('floorBadge');
    if (!floorBadge && pvpBadge) {
      floorBadge = document.createElement('span');
      floorBadge.id = 'floorBadge';
      floorBadge.className = 'badge';
      floorBadge.title = '건축 층 (Z=위, X=아래)';
      pvpBadge.parentNode.insertBefore(floorBadge, pvpBadge.nextSibling);
    }
    if (floorBadge) floorBadge.textContent = `🏗️ 짓:${myBuildFloor}F · 🚶 ${myFloor}F`;
    // 음식/extra 인벤토리
    const foodRow = document.getElementById('invFoodRow');
    if (foodRow) {
      const items = Object.keys(ITEM_ICONS).filter(k => (inventory[k] || 0) > 0);
      foodRow.innerHTML = '';
      for (const k of items) {
        const sp = document.createElement('span');
        const isFood = !!foodEffects[k];
        sp.className = 'inv' + (isFood ? '' : ' disabled');
        sp.innerHTML = `${itemIconHtml(k, 18)} ${ITEM_LABEL[k]} ${inventory[k]}`;
        if (isFood) {
          const eff = foodEffects[k];
          sp.title = `먹기 (+허기 ${eff.hunger||0}${eff.thirst?', +갈증 '+eff.thirst:''}${eff.hpDelta?', HP '+eff.hpDelta:''})`;
          sp.onclick = () => sendPrimary({ type: 'eat', item: k });
        } else {
          sp.title = `${ITEM_LABEL[k]} (먹을 수 없음 — 가공/거래용)`;
        }
        foodRow.appendChild(sp);
      }
    }
    let total = 1;
    for (const c of conns.values()) total += c.others.size;
    document.getElementById('playerCount').textContent = `${total}명`;
    const simLat = primaryZoneId ? (zonesMeta[primaryZoneId]?.simulatedLatencyMs || 0) * 2 : 0;
    const rttStr = lastRttMs > 0 ? `${Math.round(lastRttMs)}ms` : '측정중';
    document.getElementById('pingBadge').textContent = `📡 RTT ${rttStr} (sim ${simLat}ms)`;
    if (primaryZoneId) {
      document.getElementById('zoneBadge').textContent =
        `📍 ${zonesMeta[primaryZoneId].displayName}`;
      const zm = zonesMeta[primaryZoneId];
      const lx = myAbsPredicted.x - zm.worldOffsetX;
      const ly = myAbsPredicted.y - (zm.worldOffsetY || 0);
      // 14.49-e6-a: z 좌표 = floor*FLOOR_HEIGHT + stair z (실제 픽셀 높이)
      const totalZ = myFloor * FLOOR_HEIGHT + (myStairZ || 0);
      document.getElementById('coordBadge').textContent =
        `월드(x=${Math.round(myAbsPredicted.x)}, y=${Math.round(myAbsPredicted.y)}, z=${Math.round(totalZ)}px) · 로컬(${Math.round(lx)}, ${Math.round(ly)})`;
    }
    const { wx, wy } = worldKeysDir();
    const dir = (wx === 0 && wy === 0) ? '정지' :
      ((wy < 0 ? '북' : wy > 0 ? '남' : '') + (wx > 0 ? '동' : wx < 0 ? '서' : '') || '?');
    document.getElementById('velBadge').textContent =
      `방향: ${dir} (vx=${wx.toFixed(2)}, vy=${wy.toFixed(2)})`;
    // 시간 뱃지 — 낮/밤/황혼/새벽 아이콘
    const tb = document.getElementById('timeBadge');
    if (tb) {
      const p = worldPhase();
      const dr = worldClock ? worldClock.dayPhaseRatio : 0.7;
      let icon = '☀️';
      if (p < 0.05) icon = '🌅';
      else if (p < dr - 0.05) icon = '☀️';
      else if (p < dr) icon = '🌇';
      else if (p < 0.95) icon = '🌙';
      else icon = '🌄';
      tb.textContent = `${icon} ${gameTimeString()}${isNight() ? ' (밤)' : ''}`;
    }
  }
  // 좌표는 실시간 갱신이 자연스러워서 더 자주
  setInterval(updateHud, 100);

  function updateMinimap() {
    const row = document.getElementById('miniRow');
    if (!row) return;
    if (!row.dataset.built) {
      row.innerHTML = '';
      // 14.46-a: 24 zone × 가변 크기 → worldOffsetX/Y 기준으로 절대 위치 배치 (실제 지리 반영)
      const W = row.clientWidth || 320, H = row.clientHeight || 200;
      const sx = W / worldWidth, sy = H / worldHeight;
      for (const z of Object.values(zonesMeta)) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        cell.style.background = z.groundColor;
        cell.style.left = (z.worldOffsetX * sx) + 'px';
        cell.style.top  = ((z.worldOffsetY||0) * sy) + 'px';
        cell.style.width  = (z.zoneWidth * sx) + 'px';
        cell.style.height = (z.zoneHeight * sy) + 'px';
        cell.dataset.zone = z.id;
        const label = document.createElement('span');
        // 짧은 이름 (괄호 부분 제거)
        const short = (z.displayName || z.id).split(' ')[0].replace(/\(.*?\)/g, '').trim();
        label.textContent = short;
        cell.appendChild(label);
        row.appendChild(cell);
      }
      // dot — 따로 1개만 (활성 zone 위에 띄움). 절대 좌표 기준이라 어느 zone이든 같은 dot 위치 사용.
      const dot = document.createElement('div');
      dot.className = 'mini-dot';
      dot.id = 'miniDot';
      row.appendChild(dot);
      row.dataset.built = '1';
    }
    // 매 프레임: active zone 표시 + dot 위치 갱신
    const W = row.clientWidth || 320, H = row.clientHeight || 200;
    const sx = W / worldWidth, sy = H / worldHeight;
    for (const cell of row.children) {
      if (!cell.dataset.zone) continue;
      const id = cell.dataset.zone;
      const c = conns.get(id);
      cell.classList.toggle('active', id === primaryZoneId);
      cell.style.opacity = id === primaryZoneId ? 1 : (c && c.role === 'observer') ? 0.85 : 0.5;
    }
    const dot = document.getElementById('miniDot');
    if (dot) {
      dot.style.left = (myAbsPredicted.x * sx) + 'px';
      dot.style.top  = (myAbsPredicted.y * sy) + 'px';
    }
  }

  function renderChatLog() {
    const el = document.getElementById('chatLog');
    if (!el) return;
    el.innerHTML = '';
    const lines = chatLog.slice(-5); // 최근 5줄만
    for (const line of lines) {
      const div = document.createElement('div');
      div.className = 'chat-line';
      div.style.borderLeftColor = line.color;
      const nameSpan = document.createElement('b');
      nameSpan.style.color = line.color;
      nameSpan.textContent = line.name + ':';
      div.appendChild(nameSpan);
      div.appendChild(document.createTextNode(' ' + line.text));
      el.appendChild(div);
    }
  }

  // === 거래소 UI ===
  let marketOpen = false;
  function toggleMarketplace() {
    // Phase 14.16: 옛 modal 대신 새 슬라이드 패널로
    if (typeof togglePanel === 'function') return togglePanel('market');
    marketOpen = !marketOpen;
    const panel = document.getElementById('marketPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !marketOpen);
    if (marketOpen) refreshMarket();
  }
  async function refreshMarket() {
    try {
      const r = await fetch('/market/orders');
      const data = await r.json();
      const list = document.getElementById('marketOrders');
      if (!list) return;
      list.innerHTML = '';
      for (const o of data.orders.slice(-20).reverse()) {
        const li = document.createElement('div');
        li.className = 'market-order';
        const isMine = o.player_id === myUsername;
        li.innerHTML = `<span class="${o.side === 'sell' ? 'sell' : 'buy'}">${o.side === 'sell' ? '판매' : '구매'}</span>
          ${o.item} ×${o.amount} @ ${o.price_item} ${o.price_amount}/개
          <span class="who">${o.player_id}${isMine ? ' (나)' : ''}</span>
          ${isMine ? `<button data-cancel="${o.id}">취소</button>` : ''}`;
        list.appendChild(li);
      }
      list.querySelectorAll('[data-cancel]').forEach(btn => {
        btn.onclick = async () => {
          await fetch('/market/cancel', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ player_id: myUsername, order_id: +btn.dataset.cancel }),
          });
          refreshMarket();
        };
      });
    } catch (e) { console.error(e); }
  }
  async function placeOrder(side) {
    if (!myUsername) { showNotice('로그인이 필요합니다 (게스트 거래소 사용 불가)'); return; }
    const item = document.getElementById('marketItem').value;
    const amount = +document.getElementById('marketAmount').value || 1;
    const priceItem = item === 'wood' ? 'stone' : 'wood';
    const priceAmount = +document.getElementById('marketPrice').value || 1;
    try {
      const r = await fetch('/market/order', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ player_id: myUsername, side, item, amount, price_item: priceItem, price_amount: priceAmount }),
      });
      const data = await r.json();
      if (data.error) showNotice(`거래소: ${data.error}`);
      else showNotice(`주문 등록: ${data.matched === 'full' ? '즉시 체결!' : data.matched === 'partial' ? '부분 체결' : '대기 중'}`);
      refreshMarket();
    } catch (e) { showNotice('거래소 오류'); }
  }

  // === 상자 UI === (Phase 14.21 — 옛 modal 폐기, 새 인벤 패널로 redirect)
  let openChestId = null;
  function openChest(buildingId) {
    if (typeof openInvWithContainer === 'function') return openInvWithContainer(buildingId);
    openChestId = buildingId;
    document.getElementById('chestPanel')?.classList.remove('hidden');
    renderChestUi(buildingId, null);
  }
  function closeChest() {
    openChestId = null;
    document.getElementById('chestPanel')?.classList.add('hidden');
  }

  // === Craft 패널 ===
  let craftOpen = false;
  function toggleCraft() {
    if (typeof togglePanel === 'function') return togglePanel('craft'); // 14.16
    craftOpen = !craftOpen;
    const panel = document.getElementById('craftPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !craftOpen);
    if (craftOpen) renderCraftPanel();
  }
  const TOOL_ICONS = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️' };
  const TOOL_LABELS = { axe: '도끼', pickaxe: '곡괭이', sword: '검' };
  // 플레이어 장비 아이콘·미리보기(서버 EQUIPMENT_META와 동일 공식 = 단일진실)
  const EQUIP_ICONS = { clothes: '🧥', armor: '🛡️', weapon: '⚔️', tool: '🔧' };
  function equipSkillLevel(skill) {
    const xp = (craftSkill && craftSkill[skill]) || 0;
    const per = (equipmentMeta && equipmentMeta.xpPerLevel) || 6;
    return Math.max(0, Math.min(10, Math.floor(xp / per)));
  }
  function equipPreview(itemType, material, skill) {
    if (!equipmentMeta) return null;
    const t = equipmentMeta.types[itemType]; if (!t) return null;
    const g = equipmentMeta.matGrade[material];
    const grade = (g == null ? 0.6 : g); // 미등록 재료 = 삼베급 폴백(서버 matGrade 동일)
    const span = equipmentMeta.qSkillSpan;
    const qSkill = 1 - span + span * (Math.max(0, Math.min(10, skill)) / 10);
    const q = qSkill * grade;
    return { attr: Math.round(t.attrScale * q), dura: Math.round(t.baseDura * (1 + equipmentMeta.duraSpan * q)), attrLabel: t.attr };
  }
  // ══ 주조(鑄造): 금속 여러 개를 배합해 녹인다 [재민 확정] ══════════════════
  // "금속 3개까지 합금을 자유롭게. 그거에 따른 성질을 화학적으로 잘 반영. 값에 따라 연속적으로."
  // 여기(클라)는 **슬라이더와 그림만** 담당한다. 경도·인성·융점·주조성은 서버가 낸다.
  const CAST_KO = { copper: '구리', tin: '주석', lead: '납', silver: '은', gold: '금', zinc: '아연', iron: '철', nickel: '니켈' };
  function castKindsList() { return (equipmentMeta && equipmentMeta.castKinds) || []; }
  function castMaxKinds() { return (equipmentMeta && equipmentMeta.castMaxKinds) || 3; }
  function ensureCastMix(type) {
    if (!castMix[type]) castMix[type] = {};
    const m = castMix[type];
    for (const k in m) if (!(m[k] > 0)) delete m[k];
    if (!Object.keys(m).length) {   // 기본값 = 표준 청동. 구리가 없으면 가진 금속 아무거나.
      const kinds = castKindsList();
      if (kinds.includes('copper') && (inventory.copper || 0) > 0) {
        m.copper = 88; if (kinds.includes('tin') && (inventory.tin || 0) > 0) m.tin = 12;
      } else { const f = kinds.find(k => (inventory[k] || 0) > 0); if (f) m[f] = 100; }
    }
    return m;
  }
  function castPct(type) {
    const m = castMix[type] || {}; let tot = 0;
    for (const k in m) tot += m[k];
    const out = {}; for (const k in m) out[k] = tot > 0 ? m[k] / tot : 0;
    return out;
  }
  let _castTimer = {};
  function requestCastPreview(type) {
    clearTimeout(_castTimer[type]);
    _castTimer[type] = setTimeout(() => {
      const m = castMix[type]; if (!m || !Object.keys(m).length) return;
      sendPrimary({ type: 'cast_preview', itemType: type, mix: m });
    }, 90);   // 슬라이더 드래그 중 폭주 방지
  }
  // 서버 응답을 읽어 **그 줄만** 다시 그린다(패널 전체를 다시 그리면 드래그 중인 슬라이더가 튄다).
  function paintCastReadout(type) {
    const pv = castPv[type];
    const pct = castPct(type);
    for (const k in pct) {
      const el = document.getElementById('castPct-' + type + '-' + k);
      if (el) el.textContent = Math.round(pct[k] * 100) + '%';
    }
    const box = document.getElementById('castRead-' + type);
    if (!box) return;
    if (!pv) { box.innerHTML = '<span style="color:#888">계산 중…</span>'; return; }
    if (pv.err) { box.innerHTML = '<span style="color:#e77">' + pv.err + '</span>'; return; }
    const p = pv.props || {};
    const gCol = pv.grade >= 1 ? '#7cd97c' : (pv.grade >= 0.7 ? '#dd5' : '#e88');
    const warn = [];
    if (p.brittle > 0.02) warn.push('취성 — 잘 부러진다');
    if (p.split > 0.02) warn.push('층이 갈린다');
    if (p.mp > 1150) warn.push('노가 못 녹인다');
    const useTxt = Object.entries(pv.use || {}).map(([k, v]) => (CAST_KO[k] || k) + ' ' + v).join(' · ');
    box.innerHTML =
      '<b style="color:' + gCol + '">등급 ' + (pv.grade == null ? '?' : pv.grade.toFixed(2)) + '</b>'
      + ' · <b style="color:#8fc8ff">' + (pv.attr != null ? pv.attr : '?') + '</b>'
      + (pv.dura != null ? ' · 내구 ' + pv.dura : '')
      + '<div style="color:#9aa;font-size:10px;margin-top:2px">경도 ' + (p.hardness != null ? p.hardness : '?')
      + ' · 인성 ' + (p.tough != null ? p.tough.toFixed(2) : '?')
      + ' · 융점 ' + (p.mp != null ? p.mp + '℃' : '?')
      + ' · 주조성 ' + (p.cast != null ? p.cast.toFixed(2) : '?') + '</div>'
      + '<div style="color:#7a8;font-size:10px">소모 ' + useTxt + '</div>'
      + (warn.length ? '<div style="color:#e88;font-size:10px">⚠ ' + warn.join(' · ') + '</div>' : '')
      + (pv.lack ? '<div style="color:#e77;font-size:10px">재료 부족: ' + (CAST_KO[pv.lack] || pv.lack) + '</div>' : '');
  }
  function castBlockHtml(type, rc) {
    if (!rc.cast || !castKindsList().length) return '';
    const on = !!castOn[type];
    const btn = '<button data-castoggle="' + type + '" style="margin-top:4px;padding:1px 6px;font-size:11px;border-radius:4px;cursor:pointer;border:1px solid '
      + (on ? '#c93' : '#444') + ';background:' + (on ? '#432' : '#222') + ';color:#eee">⚗ 주조 배합' + (on ? ' ▾' : ' ▸') + '</button>';
    if (!on) return btn;
    const m = ensureCastMix(type), pct = castPct(type);
    const nSel = Object.keys(m).length;
    const chips = castKindsList().map(k => {
      const have = inventory[k] || 0, sel = m[k] > 0;
      const dis = (!sel && (have <= 0 || nSel >= castMaxKinds()));
      const st = 'margin:2px 3px 0 0;padding:1px 6px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid '
        + (sel ? '#c93' : '#444') + ';background:' + (sel ? '#432' : '#222') + ';color:' + (have > 0 ? '#eee' : '#666');
      return '<button data-castmetal="' + k + '" data-casttype="' + type + '" ' + (dis ? 'disabled' : '')
        + ' style="' + st + '" title="' + (CAST_KO[k] || k) + ' 보유 ' + (+have).toFixed(2) + '">'
        + (CAST_KO[k] || k) + (have > 0 ? ' ' + (+have).toFixed(1) : '') + '</button>';
    }).join('');
    const sliders = Object.keys(m).map(k =>
      '<div style="display:flex;align-items:center;gap:5px;margin-top:3px">'
      + '<span style="width:28px;font-size:11px;color:#ccc">' + (CAST_KO[k] || k) + '</span>'
      + '<input type="range" min="0" max="100" value="' + m[k] + '" data-castslider="' + k + '" data-casttype="' + type + '" style="flex:1;height:14px">'
      + '<span id="castPct-' + type + '-' + k + '" style="width:34px;text-align:right;font-size:11px;color:#8fc8ff">' + Math.round(pct[k] * 100) + '%</span>'
      + '</div>').join('');
    return btn
      + '<div style="margin-top:4px;padding:5px 6px;border:1px solid #543;border-radius:5px;background:#1b1713">'
      + '<div style="font-size:10px;color:#a98;margin-bottom:2px">도가니 — 최대 ' + castMaxKinds() + '종. 이 시대의 노가 녹일 수 있는 금속만.</div>'
      + chips + sliders
      + '<div id="castRead-' + type + '" style="margin-top:5px;font-size:11px">계산 중…</div>'
      + '<button data-castcraft="' + type + '" style="margin-top:5px;width:100%">⚗ 주조</button>'
      + '</div>';
  }
  // 장비 제작+보유목록 HTML(양쪽 크래프트 패널 공유). 미리보기 = 서버 공식과 동일.
  function equipmentSectionHtml() {
    if (!equipmentRecipes || !Object.keys(equipmentRecipes).length || !equipmentMeta) return '<div class="hint">장비 데이터 로딩 중…</div>';
    let html = '';
    for (const [type, rc] of Object.entries(equipmentRecipes)) {
      const lvl = equipSkillLevel(rc.skill);
      const owned = rc.accepts.filter(m => (inventory[m] || 0) > 0);
      let sel = craftEquipSel[type];
      if (!owned.includes(sel)) sel = owned[0] || rc.accepts[0];
      craftEquipSel[type] = sel;
      const pv = equipPreview(type, sel, lvl);
      const canCraft = (inventory[sel] || 0) >= rc.qty;
      const matBtns = rc.accepts.map(m => {
        const has = (inventory[m] || 0), on = (m === sel);
        const st = 'margin:2px 3px 0 0;padding:1px 6px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid ' + (on ? '#8bd' : '#444') + ';background:' + (on ? '#245' : '#222') + ';color:' + (has > 0 ? '#eee' : '#666');
        return `<button data-eqtype="${type}" data-eqmat="${m}" ${has > 0 ? '' : 'disabled'} style="${st}" title="${m} 보유 ${has}">${itemIconHtml(m, 18, m)}${has ? ` ${has}` : ''}</button>`;
      }).join('');
      const pvStr = pv ? `<b style="color:#8fc8ff">${pv.attrLabel} ${pv.attr} · 내구 ${pv.dura}</b>` : '';
      html += `<div class="craft-recipe ${canCraft ? 'can-make' : 'cant-make'}">
        <div class="cr-icon">${EQUIP_ICONS[type] || '🎽'}</div>
        <div class="cr-info">
          <div class="cr-name">${rc.label} <span style="color:#7cd97c;font-weight:normal">${rc.skill} Lv${lvl}</span></div>
          <div class="cr-cost">${sel ? itemIconHtml(sel, 18, sel) : '?'} ×${rc.qty} → ${pvStr}</div>
          <div style="margin-top:3px">${matBtns}</div>
          ${castBlockHtml(type, rc)}
        </div>
        <button data-eqcraft="${type}" ${canCraft ? '' : 'disabled'}>제작</button>
      </div>`;
    }
    if (equipment && equipment.length) {
      html += '<div class="hint" style="margin-top:10px;font-weight:bold">— 내 장비 —</div>';
      for (const inst of equipment) {
        const rc = equipmentRecipes[inst.type] || {};
        const slot = rc.slot || inst.type;
        const isEq = equipSlots[slot] === inst.id;
        const broken = inst.broken || inst.dura === 0;
        const durPct = (inst.durMax ? Math.round(100 * inst.dura / inst.durMax) : 100);
        const durCol = durPct > 50 ? '#5c5' : (durPct > 20 ? '#dd5' : '#e55');
        const attrParts = [];
        for (const a in (inst.attrs || {})) attrParts.push(`${(equipmentMeta.types[inst.type] && equipmentMeta.types[inst.type].attr) || a} ${inst.attrs[a]}`);
        const durBar = inst.durMax ? `<div style="height:4px;background:#333;border-radius:2px;margin-top:3px;overflow:hidden"><div style="height:100%;width:${durPct}%;background:${durCol}"></div></div>` : '';
        const repairBtn = (inst.durMax && inst.dura < inst.durMax) ? `<button data-eqrepair="${inst.id}" style="margin-left:4px">수선</button>` : '';
        html += `<div class="craft-recipe ${isEq ? 'can-make' : ''}">
          <div class="cr-icon">${EQUIP_ICONS[inst.type] || '🎒'}</div>
          <div class="cr-info">
            <div class="cr-name">${rc.label || inst.type} ${broken ? '<span style="color:#e66">✖파손</span>' : ''}<span style="color:#8a93a0;font-weight:normal"> · Lv${inst.craftedSkill || 0} 제작</span></div>
            <div class="cr-cost">${attrParts.join(' · ')}${inst.dura != null ? ` · 내구 ${inst.dura}/${inst.durMax}` : ''}</div>
            ${durBar}
          </div>
          <button data-eqtoggle="${inst.id}" data-slot="${slot}" ${broken ? 'disabled' : ''}>${isEq ? '해제' : '장착'}</button>${repairBtn}
        </div>`;
      }
    }
    return html;
  }
  // 장비 섹션 버튼 핸들러(root 안에서). rerender = 재료 선택 후 다시 그릴 함수.
  function wireEquipmentHandlers(root, rerender) {
    root.querySelectorAll('[data-eqmat]').forEach(b => b.onclick = () => { craftEquipSel[b.dataset.eqtype] = b.dataset.eqmat; if (rerender) rerender(); });
    root.querySelectorAll('[data-eqcraft]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_equipment', itemType: b.dataset.eqcraft, material: craftEquipSel[b.dataset.eqcraft] }));
    // ── 주조 배합 ──
    root.querySelectorAll('[data-castoggle]').forEach(b => b.onclick = () => {
      const t = b.dataset.castoggle; castOn[t] = !castOn[t];
      if (castOn[t]) { ensureCastMix(t); requestCastPreview(t); }
      if (rerender) rerender();
    });
    root.querySelectorAll('[data-castmetal]').forEach(b => b.onclick = () => {
      const t = b.dataset.casttype, k = b.dataset.castmetal, m = ensureCastMix(t);
      if (m[k] > 0) { if (Object.keys(m).length > 1) delete m[k]; }
      else if (Object.keys(m).length < castMaxKinds()) m[k] = 10;
      requestCastPreview(t); if (rerender) rerender();
    });
    root.querySelectorAll('[data-castslider]').forEach(s => {
      s.oninput = () => {   // ★패널을 다시 그리지 않는다 — 드래그 중이라 DOM 을 갈면 손이 놓친다
        const t = s.dataset.casttype, k = s.dataset.castslider, m = ensureCastMix(t);
        m[k] = Number(s.value);
        let tot = 0; for (const kk in m) tot += m[kk];
        if (!(tot > 0)) { m[k] = 1; }                      // 전부 0 은 금지(배합이 사라진다)
        const pct = castPct(t);
        for (const kk in pct) { const el = document.getElementById('castPct-' + t + '-' + kk); if (el) el.textContent = Math.round(pct[kk] * 100) + '%'; }
        requestCastPreview(t);
      };
    });
    root.querySelectorAll('[data-castcraft]').forEach(b => b.onclick = () => {
      const t = b.dataset.castcraft, m = castMix[t];
      if (m && Object.keys(m).length) sendPrimary({ type: 'craft_equipment', itemType: t, mix: m });
    });
    for (const t in castOn) if (castOn[t]) { paintCastReadout(t); requestCastPreview(t); }
    root.querySelectorAll('[data-eqtoggle]').forEach(b => b.onclick = () => {
      const id = b.dataset.eqtoggle, slot = b.dataset.slot;
      if (equipSlots[slot] === id) sendPrimary({ type: 'unequip_item', slot });
      else sendPrimary({ type: 'equip_item', id });
    });
    root.querySelectorAll('[data-eqrepair]').forEach(b => b.onclick = () => sendPrimary({ type: 'repair_equipment', id: b.dataset.eqrepair }));
  }
  // 요리 인스턴스 목록(신선도·버프). 갓 지은 것 우선 — 식으면 신선도·효과↓.
  function dishesListHtml() {
    if (!dishes || !dishes.length) return '';
    let h = '<div class="hint" style="margin-top:10px;font-weight:bold">— 내 요리 (신선할 때 먹자) —</div>';
    for (const d of dishes) {
      const fresh = d.freshness;
      const fcol = fresh > 60 ? '#5c5' : (fresh > 30 ? '#dd5' : '#e55');
      h += `<div class="craft-recipe can-make">
        <div class="cr-icon">🍲</div>
        <div class="cr-info">
          <div class="cr-name">${d.label} <span style="color:#8a93a0;font-weight:normal">품질 ${Math.round((d.q || 0) * 100)}%</span></div>
          <div class="cr-cost">영양 ${d.nutrition} · 버프 ${Math.round((d.buff || 0) * 100)}% · <span style="color:${fcol}">신선도 ${fresh}</span></div>
        </div>
        <button data-eatdish="${d.id}">먹기</button>
      </div>`;
    }
    return h;
  }
  function wireDishHandlers(root) {
    root.querySelectorAll('[data-eatdish]').forEach(b => b.onclick = () => sendPrimary({ type: 'eat_dish', id: b.dataset.eatdish }));
  }
  // 마을 거래(구매=마을 품질 실체화·판매=용해). shopVillage = shop_info 응답.
  const TRADE_QKEY = { clothes: 'clothQ', weapon: 'weapQ', armor: 'weapQ', tool: 'toolQ' };
  function tradeSectionHtml() {
    const v = shopVillage;
    if (!v) return '<div class="hint" style="padding:12px">마을광장 근처에서 열면 마을 장인의 품질이 표시됩니다.<br>(거래 반경 밖이면 비어 있음 — 마을로 가까이)</div>';
    let h = `<div class="hint" style="margin:6px 0;font-weight:bold">🏪 ${v.name} <span style="color:#8a93a0;font-weight:normal">· ${v.dist}px${v.pop != null ? ` · 인구 ${v.pop}` : ''}</span></div>`;
    if (equipmentRecipes && equipmentMeta) {
      for (const [type, rc] of Object.entries(equipmentRecipes)) {
        const vq = v[TRADE_QKEY[type]];
        const owned = rc.accepts.filter(m => (inventory[m] || 0) > 0);
        let sel = craftEquipSel[type];
        if (!owned.includes(sel)) sel = owned[0] || rc.accepts[0];
        craftEquipSel[type] = sel;
        const canBuy = (inventory[sel] || 0) >= rc.qty;
        const qStr = (vq != null) ? `마을품질 ${Math.round(vq * 100)}%` : '이 마을은 아직 안 만듦';
        const matBtns = rc.accepts.map(m => {
          const has = (inventory[m] || 0), on = (m === sel);
          const st = 'margin:2px 3px 0 0;padding:1px 6px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid ' + (on ? '#8bd' : '#444') + ';background:' + (on ? '#245' : '#222') + ';color:' + (has > 0 ? '#eee' : '#666');
          return `<button data-eqtype="${type}" data-eqmat="${m}" ${has > 0 ? '' : 'disabled'} style="${st}">${itemIconHtml(m, 18, m)}${has ? ` ${has}` : ''}</button>`;
        }).join('');
        h += `<div class="craft-recipe ${canBuy ? 'can-make' : 'cant-make'}">
          <div class="cr-icon">${EQUIP_ICONS[type] || '🎽'}</div>
          <div class="cr-info">
            <div class="cr-name">${rc.label} <span style="color:#8fc8ff;font-weight:normal">${qStr}</span></div>
            <div class="cr-cost">재료 ${sel ? itemIconHtml(sel, 18, sel) : '?'} ×${rc.qty} 지불</div>
            <div style="margin-top:3px">${matBtns}</div>
          </div>
          <button data-buy="${type}" ${canBuy && vq != null ? '' : 'disabled'}>구매</button>
        </div>`;
      }
    }
    if (equipment && equipment.length) {
      h += '<div class="hint" style="margin-top:10px;font-weight:bold">— 판매 —</div>';
      for (const inst of equipment) {
        const rc = equipmentRecipes[inst.type] || {};
        const refund = rc.qty ? Math.max(1, Math.floor(rc.qty / 2)) : 1;
        // ★철기는 **위세품**으로 넘길 수 있다(재민 확정 2026-08-02b) — 성능이 아니라 처음 보는
        //   물건이라 값이 선다. 청동기 마을엔 철기가 없다. 주괴·정광은 해당 없음(완성품만).
        const _fe = (() => {
          if (inst.mat === 'iron' || inst.mat === 'meteoric_iron') return true;
          if (inst.mix) { let t = 0, f = 0; for (const k in inst.mix) { t += inst.mix[k]; if (k === 'iron' || k === 'meteoric_iron') f += inst.mix[k]; } return t > 0 && f / t > 0.5; }
          return false;
        })();
        h += `<div class="craft-recipe">
          <div class="cr-icon">${EQUIP_ICONS[inst.type] || '🎒'}</div>
          <div class="cr-info"><div class="cr-name">${rc.label || inst.type} <span style="color:#8a93a0;font-weight:normal">Lv${inst.craftedSkill || 0}</span>${_fe ? ' <span style="color:#ffd77a">철기</span>' : ''}</div>
          <div class="cr-cost">용해 → ${inst.mat ? itemIconHtml(inst.mat, 18, inst.mat) : '재료'} ×${refund} 회수${_fe ? ' &nbsp;/&nbsp; <span style="color:#ffd77a">위세품으로 넘기면 마을이 값을 친다</span>' : ''}</div></div>
          <div style="display:flex;flex-direction:column;gap:3px">
            <button data-sell="${inst.id}">용해</button>
            ${_fe ? `<button data-relic="${inst.id}" style="background:#4a3a1a;border-color:#8a6a2a">위세품 판매</button>` : ''}
          </div>
        </div>`;
      }
    }
    return h;
  }
  function wireTradeHandlers(root, rerender) {
    root.querySelectorAll('[data-eqmat]').forEach(b => b.onclick = () => { craftEquipSel[b.dataset.eqtype] = b.dataset.eqmat; if (rerender) rerender(); });
    root.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_buy', itemType: b.dataset.buy, material: craftEquipSel[b.dataset.buy] }));
    root.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_sell', id: b.dataset.sell }));
    root.querySelectorAll('[data-relic]').forEach(b => b.onclick = () => sendPrimary({ type: 'sell_relic', id: b.dataset.relic }));   // ★철제 위세품
  }
  function renderCraftPanel() {
    const list = document.getElementById('craftList');
    if (!list) return;
    list.innerHTML = '';
    const eqLabel = equipped ? `${TOOL_ICONS[equipped]||''} ${TOOL_LABELS[equipped]||equipped}` : '없음';
    const eqEl = document.getElementById('equippedNow');
    if (eqEl) eqEl.textContent = eqLabel;
    for (const [name, r] of Object.entries(recipes)) {
      const have = hasToolAlive(name) ? 1 : 0;
      const canCraft = !hasToolAlive(name) && (inventory.wood || 0) >= r.wood && (inventory.stone || 0) >= r.stone;
      const isEq = equipped === name;
      const row = document.createElement('div');
      row.className = 'craft-row' + (isEq ? ' eq' : '');
      row.innerHTML = `
        <div class="craft-icon">${TOOL_ICONS[name] || '🔧'}</div>
        <div class="craft-info">
          <div class="craft-name">${r.label} <span class="craft-have">×${have}</span></div>
          <div class="craft-cost">🪵 ${r.wood} · 🪨 ${r.stone}</div>
        </div>
        <button class="craft-btn" data-craft="${name}" ${canCraft ? '' : 'disabled'}>제작</button>
        <button class="equip-btn" data-equip="${name}" ${have > 0 ? '' : 'disabled'}>${isEq ? '해제' : '장착'}</button>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft', recipe: b.dataset.craft }));
    list.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => {
      const t = b.dataset.equip;
      sendPrimary({ type: 'equip', tool: equipped === t ? null : t });
    });
    // 14.50: 아이템 가공 (plank — 통나무→판자, 톱 필요)
    if (itemRecipes && Object.keys(itemRecipes).length) {
      const hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid #333;font-weight:bold';
      hdr.textContent = '— 아이템 가공 (목공) —';
      list.appendChild(hdr);
      for (const [name, ir] of Object.entries(itemRecipes)) {
        const hasTool = !ir.requiresTool || hasToolAlive(ir.requiresTool);
        const canCraft = hasTool && Object.entries(ir.from).every(([k, v]) => (inventory[k] || 0) >= v);
        const fromStr = Object.entries(ir.from).map(([k, v]) => `${itemIconHtml(k, 18, k)} ${v}`).join(' · ');
        const toStr = Object.entries(ir.to).map(([k, v]) => `${itemIconHtml(k, 18, k)} ×${v}`).join(' ');
        const toolStr = ir.requiresTool ? ` (${ir.requiresTool} 필요)` : '';
        const row = document.createElement('div');
        row.className = 'craft-row';
        row.innerHTML = `
          <div class="craft-icon">🪚</div>
          <div class="craft-info">
            <div class="craft-name">${ir.label}${toolStr}</div>
            <div class="craft-cost">${fromStr} → ${toStr}</div>
          </div>
          <button class="craft-btn" data-craftitem="${name}" ${canCraft ? '' : 'disabled'}>가공</button>
        `;
        list.appendChild(row);
      }
      list.querySelectorAll('[data-craftitem]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_item', recipe: b.dataset.craftitem }));
    }
    // 14.51: 건축물 제작 (제작 → 인벤 → 건축 모드에서 배치)
    if (buildingRecipes && Object.keys(buildingRecipes).length) {
      const hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid #333;font-weight:bold';
      hdr.textContent = '— 건축물 제작 (만들면 인벤 → 건축 모드에서 배치) —';
      list.appendChild(hdr);
      for (const [name, br] of Object.entries(buildingRecipes)) {
        const hasHammer = !br._needHammer && !br._useHammer || hasToolAlive('hammer');
        const cost = {};
        for (const [k, v] of Object.entries(br)) {
          if (k.startsWith('_') || k === 'label') continue;
          cost[k] = v;
        }
        const canCraft = hasHammer && Object.entries(cost).every(([k, v]) => (inventory[k] || 0) >= v);
        const costStr = Object.entries(cost).map(([k, v]) => `${itemIconHtml(k, 18, k)} ${v}`).join(' · ');
        const hammerStr = br._needHammer ? ' 🔨' : '';
        const have = inventory[name] || 0;
        const row = document.createElement('div');
        row.className = 'craft-row';
        row.innerHTML = `
          <div class="craft-icon">${itemIconHtml(name, 34, '🏗️')}</div>
          <div class="craft-info">
            <div class="craft-name">${br.label} <span class="craft-have">×${have}</span>${hammerStr}</div>
            <div class="craft-cost">${costStr || '-'}</div>
          </div>
          <button class="craft-btn" data-craftbuild="${name}" ${canCraft ? '' : 'disabled'}>제작</button>
        `;
        list.appendChild(row);
      }
      list.querySelectorAll('[data-craftbuild]').forEach(b => b.onclick = () => sendPrimary({ type: 'craft_building', recipe: b.dataset.craftbuild }));
    }
    // ── 플레이어 장비 제작 (숙련·재료로 품질↑ — "방한 62·내구 85" 미리보기) ──
    if (equipmentRecipes && Object.keys(equipmentRecipes).length && equipmentMeta) {
      const hdr = document.createElement('div');
      hdr.className = 'hint';
      hdr.style.cssText = 'margin-top:12px;padding-top:8px;border-top:1px solid #333;font-weight:bold';
      hdr.textContent = '— 장비 제작 (숙련·재료로 품질↑) —';
      list.appendChild(hdr);
      const wrap = document.createElement('div');
      wrap.innerHTML = equipmentSectionHtml();
      list.appendChild(wrap);
      wireEquipmentHandlers(list, renderCraftPanel);
    }
  }
  function renderChestUi(id, data) {
    if (id !== openChestId) return;
    const wood = data?.wood || 0, stone = data?.stone || 0;
    document.getElementById('chestWood').textContent = wood;
    document.getElementById('chestStone').textContent = stone;
  }

  // === Cook 패널 ===
  let cookOpen = false;
  function toggleCookPanel() {
    cookOpen = !cookOpen;
    const panel = document.getElementById('cookPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !cookOpen);
    if (cookOpen) renderCookPanel();
  }
  function renderCookPanel() {
    const list = document.getElementById('cookList');
    if (!list) return;
    list.innerHTML = '';
    const entries = Object.entries(cookRecipes || {});
    if (entries.length === 0) {
      list.innerHTML = '<div class="hint">요리 레시피 없음</div>';
      return;
    }
    for (const [name, r] of entries) {
      const canCook = Object.entries(r.cost).every(([k, v]) => (inventory[k] || 0) >= v);
      const costStr = Object.entries(r.cost).map(([k, v]) => `${itemIconHtml(k, 18, k)} ${v}`).join(' · ');
      const prodStr = Object.entries(r.produces).map(([k, v]) => `${itemIconHtml(k, 18, k)} ×${v}`).join(' ');
      const row = document.createElement('div');
      row.className = 'craft-row';
      row.innerHTML = `
        <div class="craft-icon">${itemIconHtml(name, 34, '🍳')}</div>
        <div class="craft-info">
          <div class="craft-name">${r.label} → ${prodStr}</div>
          <div class="craft-cost">${costStr}</div>
        </div>
        <button class="craft-btn" data-cook="${name}" ${canCook ? '' : 'disabled'}>요리</button>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('[data-cook]').forEach(b => b.onclick = () => sendPrimary({ type: 'cook', recipe: b.dataset.cook }));
    // 요리 인스턴스(신선도·버프) 목록
    if (dishes && dishes.length) {
      const dwrap = document.createElement('div');
      dwrap.innerHTML = dishesListHtml();
      list.appendChild(dwrap);
      wireDishHandlers(list);
    }
  }
  // 인벤토리 바뀌면 패널 열려있을 때 갱신
  function rerenderPanelsIfOpen() {
    if (craftOpen) renderCraftPanel();
    if (cookOpen) renderCookPanel();
  }

  // === Phase 14.41: 다운 / 부활 패널 ===
  function showDownPanel() {
    const panel = document.getElementById('downPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderDownPanel();
  }
  function hideDownPanel() {
    const panel = document.getElementById('downPanel');
    if (panel) panel.classList.add('hidden');
  }
  function renderDownPanel() {
    const optBox = document.getElementById('downOptions');
    if (!optBox) return;
    optBox.innerHTML = '';
    // 우선순위 정렬: personal > temporary > guild > home
    const KIND_ORDER = { personal: 0, temporary: 1, guild: 2, home: 3 };
    const KIND_LABEL = { personal: '개인', temporary: '임시', guild: '🛡️ 길드', home: '🏛️ 마을광장' };
    const sorted = [...myRespawnOptions].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    if (sorted.length === 0) {
      const none = document.createElement('div');
      none.className = 'down-opt-none';
      none.innerHTML = '⚠️ 부활 가능한 지점이 없습니다.<br/>사유지를 만들거나 길드에 가입하세요.<br/><span style="font-size:10px;opacity:0.7">길드원이 R 키로 구조해줄 수 있음</span>';
      optBox.appendChild(none);
    } else {
      for (const o of sorted) {
        const btn = document.createElement('button');
        btn.className = `down-opt ${o.kind}`;
        const kindLabel = KIND_LABEL[o.kind] || o.kind;
        btn.innerHTML = `<span class="kind-badge">${kindLabel}</span> (${Math.round(o.x)}, ${Math.round(o.y)})에서 부활`;
        btn.onclick = () => sendPrimary({ type: 'respawn_choice', kind: o.claimId });
        optBox.appendChild(btn);
      }
    }
    // 첫 렌더 시 hint 초기화
    const hint = document.getElementById('downRescueHint');
    if (hint) hint.classList.remove('expired');
  }
  // 1초마다 타이머 업데이트 + 윈도우 만료 시 hint 회색
  setInterval(() => {
    if (!myIsDown) return;
    const elapsedMs = performance.now() - myDownedAt;
    const remainMs = Math.max(0, myDownRescueWindowMs - elapsedMs);
    const sec = Math.ceil(remainMs / 1000);
    const tEl = document.getElementById('downTimer');
    const hint = document.getElementById('downRescueHint');
    if (remainMs > 0) {
      if (tEl) tEl.textContent = sec;
      if (hint) hint.classList.remove('expired');
    } else {
      if (hint) {
        hint.classList.add('expired');
        hint.innerHTML = '⌛ 구조 가능 시간 지남. 사유지를 선택해 부활하세요.';
      }
    }
  }, 500);

  // === 길드 패널 ===
  let tribeOpen = false;
  function toggleTribePanel() {
    if (typeof togglePanel === 'function') return togglePanel('tribe'); // 14.16
    tribeOpen = !tribeOpen;
    const panel = document.getElementById('tribePanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !tribeOpen);
    if (tribeOpen) renderTribePanel();
  }
  async function renderTribePanel() {
    const body = document.getElementById('tribeBody');
    if (!body) return;
    body.innerHTML = '<div class="hint">로딩 중...</div>';
    if (!myUsername || myUsername.startsWith('anon_')) {
      body.innerHTML = '<div class="hint">게스트 모드는 길드 사용 불가 — 로그인 필요</div>';
      return;
    }
    if (myTribeId) {
      // 내 길드 정보
      try {
        const r = await fetch(`/tribe/${myTribeId}`);
        const data = await r.json();
        const members = (data.members || []).map(m =>
          `<div class="craft-row"><span style="background:${m.color};display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px"></span>${m.name}${m.player_id === data.tribe.leader_id ? ' 👑' : ''}</div>`
        ).join('');
        // Phase 14.2 — 길드 vp + treasury + behavior_tier
        const vp = data.tribe.vp || 0;
        let tierLabel, tierColor;
        if (vp < 30) { tierLabel = '청정 (clean)'; tierColor = '#9adb6e'; }
        else if (vp < 80) { tierLabel = '보통 (normal)'; tierColor = '#e8c878'; }
        else { tierLabel = '악성 (evil)'; tierColor = '#e85040'; }
        const treasury = data.treasury || {};
        const trItems = Object.entries(treasury).filter(([k,v]) => v > 0)
          .map(([k,v]) => `${itemIconHtml(k, 18, k)} ${v}`).join(' · ') || '(비어있음)';
        const isNpc = data.tribe.is_npc;
        const tierBadge = isNpc ? `<span class="badge" style="background:#5a7aa8">NPC길드 (${data.tribe.behavior_tier})</span>` : '';
        // Phase 14.9 — 전쟁 선포 대상 목록 (내 길드 X, 이미 전쟁중 X)
        let warsHtml = '';
        let declareHtml = '';
        try {
          const wr = await fetch('/wars/active');
          const wd = await wr.json();
          const myWars = (wd.wars || []).filter(w => w.attacker_guild_id === myTribeId || w.defender_guild_id === myTribeId);
          if (myWars.length > 0) {
            warsHtml = '<div class="hint" style="margin-top:8px">⚔️ 진행 중 전쟁:</div>' + myWars.map(w => {
              const other = w.attacker_guild_id === myTribeId ? `→ [${w.defender_name}] (공격)` : `← [${w.attacker_name}] (방어)`;
              return `<div class="craft-row"><div class="craft-info"><div class="craft-name">${other}</div><div class="craft-cost">tier=${w.tier} · loot=${(w.loot_rate*100).toFixed(0)}% · damage=${(w.damage_rate*100).toFixed(0)}%</div></div><button class="craft-btn" data-end-war="${w.id}">종전</button></div>`;
            }).join('');
          }
          // 선포 대상 — NPC 길드 우선 (플레이어 길드끼리도 가능)
          const allR = await fetch('/tribes');
          const allD = await allR.json();
          const candidates = (allD.tribes || []).filter(t => t.id !== myTribeId &&
            !(wd.wars || []).some(w => (w.attacker_guild_id === myTribeId && w.defender_guild_id === t.id) || (w.defender_guild_id === myTribeId && w.attacker_guild_id === t.id))
          );
          if (candidates.length > 0) {
            declareHtml = '<div class="hint" style="margin-top:8px">🗡️ 선전포고 대상:</div>' + candidates.slice(0, 10).map(t => {
              const v = t.vp || 0;
              const tag = v < 30 ? '청정 (침략시 적대감↑)' : v < 80 ? '보통' : '악성 (토벌!)';
              return `<div class="craft-row"><div class="craft-info"><div class="craft-name">[${t.name}]${t.is_npc?' 🤖':''}</div><div class="craft-cost">${tag} vp=${v.toFixed(0)}</div></div><button class="craft-btn" data-declare="${t.id}">선포</button></div>`;
            }).join('');
          }
        } catch (e) {}
        body.innerHTML = `
          <div class="hint">소속 길드: <b>[${myTribeName}]</b> (멤버 ${data.members.length}명) ${tierBadge}</div>
          <div class="hint" style="margin-top:6px">⚖️ 길드 명성: <b style="color:${tierColor}">${vp.toFixed(0)}/200 · ${tierLabel}</b></div>
          <div class="hint" style="font-size:11px;opacity:0.7">청정=침략 시 약함·침략자 +대량적대감 / 악성=토벌 대상</div>
          <div class="hint" style="margin-top:6px">🏦 길드 금고: <b>${trItems}</b></div>
          <div class="hint" style="margin-top:6px">🏛️ 사유지 슬롯 (Phase 14.18): <b>${countMyClaimsClient()}</b><br/><span style="font-size:10px;opacity:0.7">C=개인 (길드영토 안만) · T=임시 (어디든) · Shift+C=길드영토 (멤버만)</span></div>
          <button class="craft-btn" id="tribeGranaryBtn" style="margin-top:8px;background:#7a5a2a">🏚️ 길드 곳간 건설 (판자12·돌8 — 길드영토 안, 리더)</button>
          <div class="hint" style="font-size:10px;opacity:0.7">내 위치 북쪽 3칸에 5×3 밀폐 곳간 — 멤버 공유 창고, 전쟁 시 약탈 목표</div>
          ${warsHtml}
          ${declareHtml}
          <div class="hint" style="margin-top:8px">멤버 목록:</div>
          ${members}
          <div class="hint" style="margin-top:8px">길드 채팅: <b>Enter → /t 메시지</b></div>
          <button class="craft-btn" id="tribeLeaveBtn" style="margin-top:12px;background:#b03030">길드 탈퇴</button>
        `;
        // 선포 버튼 핸들러
        body.querySelectorAll('[data-declare]').forEach(b => b.onclick = async () => {
          const did = parseInt(b.dataset.declare, 10);
          if (!confirm('선전포고하면 침략자 적대감이 부과될 수 있어요. 진행할까요?')) return;
          const r = await fetch('/war/declare', { method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ attacker_guild_id: myTribeId, defender_guild_id: did, declared_by: myUsername }) });
          const d = await r.json();
          if (d.ok) { showNotice(`⚔️ 전쟁 선포! tier=${d.tier} loot=${(d.loot_rate*100).toFixed(0)}%`); renderTribePanel(); }
          else alert(d.error || '선포 실패');
        });
        body.querySelectorAll('[data-end-war]').forEach(b => b.onclick = async () => {
          const wid = parseInt(b.dataset.endWar, 10);
          const r = await fetch('/war/end', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ war_id: wid }) });
          const d = await r.json();
          if (d.ok) { showNotice('🕊️ 전쟁 종료'); renderTribePanel(); }
          else alert(d.error || '종전 실패');
        });
        const grBtn = document.getElementById('tribeGranaryBtn');
        if (grBtn) grBtn.onclick = () => { buildMode = true; placementMode = { special: 'guild_granary' }; toggleTribePanel(); showNotice('🏚️ 길드 곳간 배치 모드 — 길드영토 안 클릭 (5×3 밀폐 · 밖에서 지으세요 · B=취소)'); };
        document.getElementById('tribeLeaveBtn').onclick = async () => {
          if (!confirm('정말 탈퇴하시겠습니까?')) return;
          const r = await fetch('/tribe/leave', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername }) });
          const d = await r.json();
          if (d.ok) { myTribeId = null; myTribeName = null; sendPrimary({ type: 'tribe_set', tribeId: null, tribeName: null }); renderTribePanel(); }
          else alert(d.error || '탈퇴 실패');
        };
      } catch (e) {
        body.innerHTML = `<div class="hint">로드 실패: ${e.message}</div>`;
      }
    } else {
      // 길드 없음 — 만들기 또는 가입
      try {
        const r = await fetch('/tribes');
        const data = await r.json();
        const list = (data.tribes || []).map(t => {
          const vp = t.vp || 0;
          let tag, col;
          if (vp < 30) { tag = '청정'; col = '#9adb6e'; }
          else if (vp < 80) { tag = '보통'; col = '#e8c878'; }
          else { tag = '악성'; col = '#e85040'; }
          const npcBadge = t.is_npc ? ' 🤖' : '';
          return `<div class="craft-row"><div class="craft-info"><div class="craft-name">[${t.name}]${npcBadge}</div><div class="craft-cost">멤버 ${t.member_count} · <span style="color:${col}">${tag} ${vp.toFixed(0)}</span></div></div><button class="craft-btn" data-join="${t.id}">가입</button></div>`;
        }).join('');
        // Phase 14.9 — 전쟁 활성 목록 표시
        let warsHtml = '';
        try {
          const wr = await fetch('/wars/active');
          const wd = await wr.json();
          if ((wd.wars || []).length > 0) {
            warsHtml = '<div class="hint" style="margin-top:12px">⚔️ 활성 전쟁:</div>' +
              wd.wars.map(w => `<div class="craft-row" style="font-size:12px"><div class="craft-info">[${w.attacker_name}] → [${w.defender_name}] (${w.tier})</div></div>`).join('');
          }
        } catch (e) {}
        body.innerHTML = `
          <div class="hint">새 길드 만들기:</div>
          <div style="display:flex;gap:6px;margin:4px 0 12px">
            <input id="tribeNameInput" maxlength="20" placeholder="길드 이름" style="flex:1;padding:4px 6px"/>
            <button class="craft-btn" id="tribeCreateBtn">만들기</button>
          </div>
          <div class="hint">또는 기존 길드 가입:</div>
          ${list || '<div class="hint">(길드 없음)</div>'}
          ${warsHtml}
        `;
        document.getElementById('tribeCreateBtn').onclick = async () => {
          const name = document.getElementById('tribeNameInput').value.trim();
          if (!name) return;
          const r = await fetch('/tribe/create', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername, name }) });
          const d = await r.json();
          if (d.ok) { myTribeId = d.tribe_id; myTribeName = d.name; sendPrimary({ type: 'tribe_set', tribeId: d.tribe_id, tribeName: d.name }); renderTribePanel(); }
          else alert(d.error || '생성 실패');
        };
        body.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => {
          const tid = parseInt(b.dataset.join, 10);
          const r = await fetch('/tribe/join', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ player_id: myUsername, tribe_id: tid }) });
          const d = await r.json();
          if (d.ok) {
            myTribeId = d.tribe_id; myTribeName = d.name;
            sendPrimary({ type: 'tribe_set', tribeId: d.tribe_id, tribeName: d.name });
            if (d.promoted) showNotice(`👑 [${d.name}] 길드 운영권 인수! 당신이 새 리더입니다`);
            renderTribePanel();
          }
          else alert(d.error || '가입 실패');
        });
      } catch (e) {
        body.innerHTML = `<div class="hint">로드 실패: ${e.message}</div>`;
      }
    }
  }

  let noticeTimer;
  function showNotice(text) {
    // ★진단 훅(읽기 전용): 최근 알림 40건 — 하네스가 '재료 부족/의뢰 성공' 같은 서버 응답을 실측하는 통로.
    (window.__notices = window.__notices || []).push(text); if (window.__notices.length > 40) window.__notices.shift();
    document.getElementById('notice').textContent = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      document.getElementById('notice').textContent = '';
    }, 2500);
  }

  boot();

  // === Phase 14.17: 좀보이드 정통 — 좌측 사이드바 + 상단 인벤 드롭다운 ===
  // 사이드 아이콘 4개(제작/건축/길드/거래소) + 인벤은 상단 드롭다운(별개)
  let activeSide = null; // 좌측 패널 (한 번에 1개)
  let invOpen = false;

  function openSide(name) {
    activeSide = name;
    document.getElementById('sidePanel').classList.add('open');
    document.querySelectorAll('.sb-icon').forEach(t => t.classList.toggle('active', t.dataset.side === name));
    document.getElementById('spTitle').textContent = ({
      craft: '🔨 제작', build: '🏗️ 건축', tribe: '🛡️ 길드', market: '🏪 시세',
      skills: '📚 스킬', claims: '🏛️ 사유지',
    })[name] || name;
    renderSide(name);
  }
  function closeSide() {
    activeSide = null;
    document.getElementById('sidePanel').classList.remove('open');
    document.querySelectorAll('.sb-icon').forEach(t => t.classList.remove('active'));
  }
  function toggleSide(name) {
    if (activeSide === name) closeSide();
    else openSide(name);
  }
  // 호환: 옛 togglePanel(name)이 inv면 인벤 토글, 나머지는 좌측 패널
  function togglePanel(name) {
    if (name === 'inv') return toggleInv();
    return toggleSide(name);
  }

  function openInv() {
    if (invOpen) return;
    invOpen = true;
    document.getElementById('invDropdown').classList.add('open');
    renderInvPanel(document.getElementById('invBody'));
  }
  function closeInv() {
    if (!invOpen) return;
    invOpen = false;
    document.getElementById('invDropdown').classList.remove('open');
  }
  function toggleInv() { invOpen ? closeInv() : openInv(); }

  document.querySelectorAll('.sb-icon').forEach(t => {
    t.addEventListener('click', () => toggleSide(t.dataset.side));
  });

  // Phase 14.21: 인벤 hover-open (mouseleave 자동닫힘 폐기 — outside click만 닫음)
  const invToggleEl = document.getElementById('invToggle');
  const invDropEl = document.getElementById('invDropdown');
  invToggleEl.addEventListener('mouseenter', openInv);
  invToggleEl.addEventListener('click', toggleInv);
  // 빈 화면 클릭에서만 닫음 (아래 mousedown handler)

  // 빈 화면 클릭 → 인벤·사이드 패널 둘 다 닫음
  document.addEventListener('mousedown', (e) => {
    const inInv = invDropEl.contains(e.target) || invToggleEl.contains(e.target);
    const inSide = document.getElementById('sidePanel').contains(e.target) || document.getElementById('sidebar').contains(e.target);
    const inChat = document.getElementById('chatPanel')?.contains(e.target);
    if (!inInv && !inSide && !inChat) {
      if (invOpen) closeInv();
      if (activeSide) closeSide();
    }
  });

  document.getElementById('spClose').addEventListener('click', closeSide);

  // Esc 처리
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (placementMode) { placementMode = null; showNotice('배치 모드 취소'); e.stopPropagation(); return; }
      if (invOpen) { closeInv(); e.stopPropagation(); }
      else if (activeSide) { closeSide(); e.stopPropagation(); }
    }
  });
  // 단축키 (I=인벤 / K=제작 / Shift+B=건축) — 채팅 input focused 아닐 때만
  document.addEventListener('keydown', (e) => {
    const ci = document.getElementById('chatInput');
    if (document.activeElement === ci) return;
    const k = e.key.toLowerCase();
    if (k === 'i') { toggleInv(); e.preventDefault(); }
    else if (k === 'k') { toggleSide('craft'); e.preventDefault(); }
    else if (k === 'b' && e.shiftKey) { toggleSide('build'); e.preventDefault(); }
    else if (k === 'y') { toggleSide('claims'); e.preventDefault(); }
    else if (k === 'p') { toggleSide('skills'); e.preventDefault(); }
    else if (k === 'q') { toggleSide('market'); e.preventDefault(); }
  });

  function renderSide(name) {
    const body = document.getElementById('spBody');
    if (name === 'craft') renderCraftPanel2(body);
    else if (name === 'build') renderBuildPanel(body);
    else if (name === 'claims') renderClaimsPanel(body);
    else if (name === 'tribe') { body.innerHTML = '<div id="tribeBody"></div>'; renderTribePanel(); }
    else if (name === 'market') renderMarketPanel(body);
    else if (name === 'skills') renderSkillsPanel(body);
  }

  // 14.49-e7an: 스킬 패널 프로토타입 (UI only, hardcoded values)
  const PROTO_SKILLS = {
    production: [
      { id: 'farming',   name: '농사', icon: '🌾', level: 1, exp: 0 },
      { id: 'foraging',  name: '채집', icon: '🌿', level: 1, exp: 0 },
      { id: 'fishing',   name: '낚시', icon: '🎣', level: 1, exp: 0 },
      { id: 'mining',    name: '채광', icon: '⛏️', level: 1, exp: 0 },
      { id: 'carpentry', name: '목공', icon: '🪚', level: 1, exp: 0 },
      { id: 'medicine',  name: '의료', icon: '💊', level: 1, exp: 0 },
    ],
    combat: [
      { id: 'sword',  name: '검술', icon: '⚔️', level: 1, exp: 0 },
      { id: 'spear',  name: '창술', icon: '🔱', level: 1, exp: 0 },
      { id: 'bow',    name: '궁술', icon: '🏹', level: 1, exp: 0 },
      { id: 'axe',    name: '도끼', icon: '🪓', level: 1, exp: 0 },
      { id: 'shield', name: '방패', icon: '🛡️', level: 1, exp: 0 },
    ],
  };
  const PROTO_TALENT = { used: 0, max: 30 };

  function expForLevel(lv) { return 50 + lv * lv * 25; } // 1→100, 2→200, 3→375...

  function renderSkillsPanel(body) {
    const totalLevel = [...PROTO_SKILLS.production, ...PROTO_SKILLS.combat].reduce((s, k) => s + k.level, 0);
    function skillRow(s) {
      const need = expForLevel(s.level);
      const pct = Math.min(100, Math.floor(s.exp / need * 100));
      return `<div class="skill-row">
        <span class="skill-icon">${s.icon}</span>
        <span class="skill-name">${s.name}</span>
        <span class="skill-lv">Lv ${s.level}</span>
        <div class="skill-bar"><div class="skill-bar-fill" style="width:${pct}%"></div><span class="skill-bar-text">${s.exp}/${need}</span></div>
        <button class="skill-talent-btn" data-skill="${s.id}" title="특성 (분야 ${s.level}개까지 가능)">⭐ 0/${s.level}</button>
      </div>`;
    }
    body.innerHTML = `
      <style>
        .skill-section-head { color:#f0c674; font-size:13px; font-weight:bold; padding:8px 4px 4px; }
        .skill-row { display:flex; align-items:center; gap:6px; padding:5px 4px; border-bottom:1px solid #2a3038; }
        .skill-icon { font-size:18px; width:24px; text-align:center; }
        .skill-name { width:46px; color:#cfd6dd; font-size:12px; }
        .skill-lv { width:42px; color:#8a93a0; font-size:11px; }
        .skill-bar { flex:1; height:14px; background:#1a1f25; border:1px solid #2a3038; position:relative; overflow:hidden; border-radius:2px; }
        .skill-bar-fill { height:100%; background:linear-gradient(90deg,#3a7a3a,#5aa55a); transition:width 0.3s; }
        .skill-bar-text { position:absolute; top:0; left:0; right:0; bottom:0; text-align:center; color:#cfd6dd; font-size:10px; line-height:14px; text-shadow:0 0 2px #000; }
        .skill-talent-btn { background:#2a3038; color:#cfd6dd; border:1px solid #3a4048; padding:2px 6px; font-size:10px; cursor:pointer; border-radius:2px; }
        .skill-talent-btn:hover { background:#3a4048; }
        .skill-pool { background:#1a1f25; padding:8px; border:1px solid #2a3038; border-radius:3px; margin:8px 4px; text-align:center; }
        .skill-pool-bar { height:10px; background:#0a0e12; border:1px solid #2a3038; margin-top:4px; border-radius:2px; overflow:hidden; }
        .skill-pool-fill { height:100%; background:linear-gradient(90deg,#5a7ad8,#9aafe0); }
        .skill-hint { color:#6c7686; font-size:10px; padding:4px; text-align:center; }
      </style>
      <div class="skill-pool">
        <div style="color:#cfd6dd;font-weight:bold">⭐ 특성 포인트 ${PROTO_TALENT.used}/${PROTO_TALENT.max}</div>
        <div class="skill-pool-bar"><div class="skill-pool-fill" style="width:${PROTO_TALENT.used/PROTO_TALENT.max*100}%"></div></div>
        <div style="color:#8a93a0;font-size:10px;margin-top:3px">총 레벨 ${totalLevel}</div>
      </div>
      <div class="skill-section-head">🛠️ 생산</div>
      ${PROTO_SKILLS.production.map(skillRow).join('')}
      <div class="skill-section-head" style="margin-top:8px">⚔️ 전투</div>
      ${PROTO_SKILLS.combat.map(skillRow).join('')}
      <div class="skill-hint">프로토타입 — 활동 시 자동으로 exp 쌓이는 시스템은 다음 단계</div>
    `;
    body.querySelectorAll('.skill-talent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showNotice(`${btn.dataset.skill} 특성 트리 — 다음 단계에서 구현`);
      });
    });
  }

  // Phase 14.26: 사유지 패널 — 내 claim 목록 + 해제 + 위치 텔레포트 안내
  function renderClaimsPanel(body) {
    const KIND_ICON = { personal: '🏠', temporary: '⛺', guild: '🏛️' };
    const KIND_NAME = { personal: '개인', temporary: '임시', guild: '길드영토' };
    const my = [];
    for (const c of conns.values()) {
      for (const cl of c.claims.values()) {
        if (cl.ownerPid !== (myPlayerId || myUsername)) continue;   // ★[배치 13] 영속 신원으로 대조 — 게스트도 제 사유지를 제 것으로 본다
        my.push(cl);
      }
    }
    my.sort((a, b) => (a.kind || 'z').localeCompare(b.kind || 'z') || (a.createdAt - b.createdAt));
    const counts = { personal: 0, temporary: 0, guild: 0 };
    for (const cl of my) counts[cl.kind || 'personal']++;
    const list = my.length === 0
      ? '<div style="color:#6c7686;padding:14px;text-align:center">설치한 사유지가 없습니다</div>'
      : my.map(cl => {
          const k = cl.kind || 'personal';
          return `<div class="sp-list-row">
            <span>${KIND_ICON[k]} ${KIND_NAME[k]} @ (${cl.x},${cl.y})</span>
            <button class="craft-btn" data-unclaim="${cl.id}" style="background:#b03030;padding:3px 8px">해제</button>
          </div>`;
        }).join('');
    body.innerHTML = `
      <div class="hint">슬롯 사용: 개인 ${counts.personal}/9 · 임시 ${counts.temporary}/4 · 길드영토 ${counts.guild}/50</div>
      <div class="hint" style="font-size:11px;opacity:0.7;margin-bottom:10px">
        <b>C</b>=개인 사유지 (길드 영토 안만) · <b>T</b>=임시 (어디든) · <b>Shift+C</b>=길드 영토 (멤버만)<br/>
        해제하면 슬롯 회수. 자원은 환불 안 됨. 다른 위치 가서 다시 설치 가능.
      </div>
      <div class="inv-col-head">내 사유지 목록 (${my.length}개)</div>
      ${list}
    `;
    body.querySelectorAll('[data-unclaim]').forEach(btn => btn.onclick = () => {
      if (!confirm('이 사유지를 해제하시겠습니까? (자원 환불 X)')) return;
      sendPrimary({ type: 'unclaim', claimId: btn.dataset.unclaim });
      setTimeout(() => renderClaimsPanel(body), 200);
    });
  }

  // Phase 14.20: 깜빡 fix — 패널 갱신 빈도 3초로 (이전 1초). content hash 비교는 다음 sprint.
  // 길드 패널: 사용자가 입력 안 했으면 안 갱신 (fetch 깜빡 방지). 옛 1초 setInterval 폐기.
  let lastSideRenderAt = 0;
  setInterval(() => {
    const now = Date.now();
    // 인벤: 1초에 한 번 (item 변경 자주)
    if (invOpen) renderInvPanel(document.getElementById('invBody'));
    // 사이드 패널: 5초에 한 번만 (사용자 input fetch에 의존하니까)
    if (activeSide && now - lastSideRenderAt > 5000) {
      renderSide(activeSide);
      lastSideRenderAt = now;
    }
  }, 1000);

  // === Phase 14.21: 좀보이드 정통 인벤 — 좌(내인벤) | 가운데(활성 컨테이너) | 우(컨테이너 탭) ===
  const ITEM_CAT = {
    wood: '자재', stone: '자재', ore: '자재', pillar: '자재', rafter: '자재', thatch: '자재',
    berry: '음식', meat_raw: '음식', meat_cooked: '음식', berry_jam: '음식', herb: '약초',
    water_bottle: '음료',
    fiber: '잡화', seed_berry: '씨앗', hide: '잡화',
    axe: '도구', pickaxe: '도구', sword: '도구',
    // ★[2026-08-02] 야금 — 인벤 창은 분류로 정렬한다. 분류가 없으면 'zzz' 로 밀려 잡동사니 뒤에 섞인다.
    ore_chunk: '야금', iron_ore: '야금', charcoal: '야금',
    iron: '야금', copper: '야금', tin: '야금', lead: '야금', silver: '야금', gold: '야금',
    nickel: '야금', meteoric_iron: '야금', coal: '야금', jade_raw: '야금', marble: '자재', tungsten: '야금',
  };

  // 근처 모든 chest (120px 반경)
  function nearbyContainers() {
    const list = [];
    if (!primaryZoneId) return list;
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.meta) return list;
    const ox = pc.meta.worldOffsetX || 0, oy = pc.meta.worldOffsetY || 0;
    for (const b of pc.buildings.values()) {
      if (b.type !== 'chest' && b.type !== 'guild_granary') continue;   // ★길드 곳간=대형 공유 컨테이너(chest 경로 공용)
      const absX = ox + b.x, absY = oy + b.y;
      const d = Math.hypot(absX - myAbsPredicted.x, absY - myAbsPredicted.y);
      if (d <= 120) list.push({ b, d, absX, absY });
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  // 활성 컨테이너 (사용자 선택 또는 가까운 거 자동)
  let activeContainerId = null;
  // 외부에서 호출: chest 클릭하면 인벤 열고 그 chest 선택
  window.openInvWithContainer = function openInvWithContainer(chestId) {
    activeContainerId = chestId;
    openInv();
  };

  // Phase 14.25: 내 사유지 카운트 (kind별)
  function countMyClaimsClient() {
    let p = 0, t = 0, g = 0;
    for (const c of conns.values()) {
      for (const cl of c.claims.values()) {
        if (cl.ownerPid !== (myPlayerId || myUsername)) continue;   // ★[배치 13] 영속 신원으로 대조 — 게스트도 제 사유지를 제 것으로 본다
        if (cl.kind === 'temporary') t++;
        else if (cl.kind === 'guild') g++;
        else p++;
      }
    }
    return `개인 ${p}/9 · 임시 ${t}/4 · 길드영토 ${g}/50`;
  }

  // 근처 ground items (80px 반경) — 바닥 pseudo-container 내용
  function nearbyGroundItems() {
    const list = [];
    if (!primaryZoneId) return list;
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.meta || !pc.groundItems) return list;
    const ox = pc.meta.worldOffsetX || 0, oy = pc.meta.worldOffsetY || 0;
    for (const gi of pc.groundItems.values()) {
      const absX = ox + gi.x, absY = oy + gi.y;
      const d = Math.hypot(absX - myAbsPredicted.x, absY - myAbsPredicted.y);
      if (d <= 100) list.push({ gi, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  function renderInvPanel(body) {
    // 14.53-e: 재렌더 전 각 컬럼의 scrollTop 저장 (mine + chest)
    const _savedScroll = {};
    body.querySelectorAll('.inv-col [style*="overflow:auto"]').forEach((el, i) => {
      const tgt = el.closest('.inv-col')?.dataset.dropTarget || `c${i}`;
      _savedScroll[tgt] = el.scrollTop;
    });
    const conts = nearbyContainers();
    // 바닥 탭 항상 마지막에. activeContainerId === 'ground' 면 바닥 표시
    if (activeContainerId && activeContainerId !== 'ground' && !conts.find(c => c.b.id === activeContainerId)) activeContainerId = null;
    if (!activeContainerId) activeContainerId = conts.length > 0 ? conts[0].b.id : 'ground';
    const activeC = (activeContainerId !== 'ground' && activeContainerId) ? conts.find(c => c.b.id === activeContainerId)?.b : null;
    const isGround = (activeContainerId === 'ground');

    const rowsHtml = (inv, kind, chestId) => {
      const entries = Object.entries(inv).filter(([k, v]) => v > 0 && k !== 'floor' && k !== 'tribe_id' && k !== 'sim' && k !== 'kind').sort((a, b) => {   // ★메타키(층·길드id)는 아이템 아님
        const ca = ITEM_CAT[a[0]] || 'zzz', cb = ITEM_CAT[b[0]] || 'zzz';
        return ca.localeCompare(cb) || a[0].localeCompare(b[0]);
      });
      if (entries.length === 0) return `<tr><td colspan="4" style="color:#6c7686;text-align:center;padding:20px">(비어있음)</td></tr>`;
      return entries.map(([k, v]) => {
        const icon = itemIconHtml(k, 22);
        const label = (ITEM_LABEL && ITEM_LABEL[k]) || k;
        const cat = ITEM_CAT[k] || '기타';
        const isContainerItem = (kind === 'chest');
        const canMove = isContainerItem ? true : !!chestId;
        const btn = canMove
          ? `<button data-move="${kind}" data-item="${k}" data-cid="${chestId || ''}">${isContainerItem ? '↑' : '↓'}</button>`
          : '';
        return `<tr><td class="it-icon">${icon}</td><td class="it-name">${label} <span class="it-count">×${v}</span></td><td class="it-cat">${cat}</td><td class="it-action">${btn}</td></tr>`;
      }).join('');
    };

    const myCount = Object.values(inventory).filter(v => v > 0).length + (toolItems ? toolItems.length : 0);
    // 14.53: toolItems row (각 instance 별 행)
    const TOOL_ICON_MAP = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
    const toolRowsHtml = () => {
      if (!toolItems || toolItems.length === 0) return '';
      return toolItems.map(t => {
        const isEq = (equipped === t.id);
        const isHot = (hotkey1 === t.id);
        const icon = TOOL_ICON_MAP[t.type] || '🔧';
        const durColor = t.d > t.max * 0.5 ? '#7cd97c' : (t.d > t.max * 0.2 ? '#e0c060' : '#e07060');
        const eqBadge = isEq ? '<span style="color:#7cd97c;font-weight:bold">✓장착</span>' : '';
        const hotBadge = isHot ? '<span style="color:#f0c674">⌨1</span>' : '';
        return `<tr draggable="true" data-toolid="${t.id}" data-tooltype="${t.type}" style="cursor:grab;${isEq?'background:rgba(124,217,124,0.08)':''}">
          <td class="it-icon">${icon}</td>
          <td class="it-name">
            <div>${t.type} ${eqBadge} ${hotBadge}</div>
            <div style="font-size:10px;color:${durColor}">내구도 ${t.d}/${t.max}</div>
          </td>
          <td class="it-cat">도구</td>
          <td class="it-action">
            <button data-equiptool="${t.id}" title="${isEq?'해제':'착용'}">${isEq?'해제':'착용'}</button>
          </td>
        </tr>`;
      }).join('');
    };
    // 좌: 내 인벤 (toolItems 먼저, 그다음 자원)
    const myTable = `<div class="inv-col" data-drop-target="mine">
      <div class="inv-col-head">🎒 내 인벤토리<span class="col-count">(${myCount}종)</span></div>
      <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
        <table class="inv-table">
          <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
          <tbody>${toolRowsHtml()}${rowsHtml(inventory, 'mine', activeC ? activeC.id : (isGround ? 'ground' : null))}</tbody>
        </table>
      </div></div>`;

    // 가운데: 활성 컨테이너 내용
    let chestTable;
    if (isGround) {
      // 바닥 — ground items 다 모아 보여줌 (각 행이 별도 gi)
      const gItems = nearbyGroundItems();
      const giRows = gItems.length === 0
        ? `<tr><td colspan="4" style="color:#6c7686;text-align:center;padding:20px">(바닥에 아이템 없음 — 드롭하면 여기에 표시됩니다)</td></tr>`
        : gItems.map(({ gi }) => {
            const icon = itemIconHtml(gi.item, 22);
            const label = (ITEM_LABEL[gi.item]) || gi.item;
            const cat = ITEM_CAT[gi.item] || '기타';
            return `<tr><td class="it-icon">${icon}</td><td class="it-name">${label} <span class="it-count">×${gi.count}</span></td><td class="it-cat">${cat}</td><td class="it-action"><button data-pickup="${gi.id}">↑</button></td></tr>`;
          }).join('');
      chestTable = `<div class="inv-col" data-drop-target="ground">
        <div class="inv-col-head">🌍 바닥 (근처 ${gItems.length}개)</div>
        <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
          <table class="inv-table">
            <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
            <tbody>${giRows}</tbody>
          </table>
        </div></div>`;
    } else if (activeC) {
      const chestCount = Object.entries(activeC.data || {}).filter(([k, v]) => v > 0 && k !== 'floor' && k !== 'tribe_id').length;
      chestTable = `<div class="inv-col" data-drop-target="${activeC.id}">
        <div class="inv-col-head">📦 ${activeC.ownerName || '?'}<span class="col-count">(${chestCount}종)</span></div>
        <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
          <table class="inv-table">
            <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
            <tbody>${rowsHtml(activeC.data || {}, 'chest', activeC.id)}</tbody>
          </table>
        </div></div>`;
    } else {
      chestTable = `<div class="inv-col"><div class="inv-col-head">컨테이너</div><div style="flex:1"></div></div>`;
    }

    // 우측 탭 — chest들 + 바닥 (항상)
    const chestTabs = conts.map(({ b, d }) => {
      const total = Object.values(b.data || {}).reduce((s, v) => s + v, 0);
      const isActive = b.id === activeContainerId ? 'active' : '';
      return `<div class="cont-tab ${isActive}" data-cid="${b.id}" title="${b.ownerName || '?'} · ${d.toFixed(0)}px">
        <div class="ct-icon">📦</div>
        <div class="ct-count">${total}</div>
      </div>`;
    }).join('');
    const gCount = nearbyGroundItems().length;
    const groundTab = `<div class="cont-tab ${isGround ? 'active' : ''}" data-cid="ground" title="근처 바닥 아이템">
      <div class="ct-icon">🌍</div>
      <div class="ct-count">${gCount}</div>
    </div>`;
    const tabsCol = `<div class="cont-tabs">${chestTabs}${groundTab}</div>`;

    body.innerHTML = `<div class="inv-three-col" style="height:100%">${myTable}${chestTable}${tabsCol}</div>`;
    // 14.53-e: scrollTop 복원
    body.querySelectorAll('.inv-col [style*="overflow:auto"]').forEach((el, i) => {
      const tgt = el.closest('.inv-col')?.dataset.dropTarget || `c${i}`;
      if (typeof _savedScroll[tgt] === 'number') el.scrollTop = _savedScroll[tgt];
    });

    // 액션 버튼 (↑ ↓ 픽업)
    body.querySelectorAll('[data-move]').forEach(btn => btn.onclick = () => {
      const kind = btn.dataset.move;
      const item = btn.dataset.item;
      const cid = btn.dataset.cid;
      if (!cid) return;
      // 바닥으로 → drop_item
      if (cid === 'ground') {
        if (kind !== 'mine') return; // 바닥→mine은 픽업 버튼 따로
        sendPrimary({ type: 'drop_item', item, amount: 1 });
        return;
      }
      // chest로/에서 — 모든 아이템 (Phase 14.25)
      if (kind === 'mine') sendPrimary({ type: 'chest_put', buildingId: cid, item, amount: 1 });
      else sendPrimary({ type: 'chest_take', buildingId: cid, item, amount: 1 });
    });
    body.querySelectorAll('[data-pickup]').forEach(btn => btn.onclick = () => {
      sendPrimary({ type: 'pickup_item', giId: btn.dataset.pickup });
    });
    // 14.53: 도구 instance 착용/해제 + 드래그 (hotkey 등록)
    body.querySelectorAll('[data-equiptool]').forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.equiptool;
      // 이미 장착이면 해제, 아니면 장착
      if (equipped === id) sendPrimary({ type: 'equip', toolItemId: null });
      else sendPrimary({ type: 'equip', toolItemId: id });
    });
    body.querySelectorAll('tr[data-toolid]').forEach(tr => {
      tr.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/x-tool-instance', tr.dataset.toolid);
        e.dataTransfer.effectAllowed = 'copy';
      });
      // 14.53: 도구 우클릭 메뉴
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const id = tr.dataset.toolid;
        const type = tr.dataset.tooltype;
        const isEq = (equipped === id);
        const isHot = (hotkey1 === id);
        showContextMenu(e.clientX, e.clientY, [
          { label: isEq ? '해제' : '착용', onClick: () => sendPrimary({ type: 'equip', toolItemId: isEq ? null : id }) },
          { label: isHot ? '1번 슬롯에서 빼기' : '1번 슬롯에 등록', onClick: () => sendPrimary({ type: 'set_hotkey', toolItemId: isHot ? null : id }) },
        ]);
      });
    });
    // 14.53: 자원/음식 행 우클릭 메뉴 (먹기 / 드롭)
    body.querySelectorAll('.inv-col[data-drop-target="mine"] .inv-table tbody tr:not([data-toolid])').forEach(tr => {
      const btn = tr.querySelector('[data-move][data-item]');
      if (!btn) return;
      const item = btn.dataset.item;
      if (!item) return;
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const opts = [];
        // 음식이면 먹기
        if (foodEffects && foodEffects[item]) {
          opts.push({ label: '🍴 먹기', onClick: () => sendPrimary({ type: 'eat', item }) });
        }
        opts.push({ label: '🗑 1개 버리기 (바닥)', onClick: () => sendPrimary({ type: 'drop_item', item, amount: 1 }) });
        if ((inventory[item] || 0) >= 10) {
          opts.push({ label: '🗑 10개 버리기', onClick: () => sendPrimary({ type: 'drop_item', item, amount: 10 }) });
        }
        if (opts.length) showContextMenu(e.clientX, e.clientY, opts);
      });
    });
    body.querySelectorAll('[data-cid]').forEach(t => {
      if (!t.classList.contains('cont-tab')) return;
      t.onclick = () => { activeContainerId = t.dataset.cid; renderInvPanel(body); };
    });

    // 14.51: 건축 모드 ON일 때 — 내 인벤의 건축물 row 강조 + 클릭 시 placement mode 진입
    if (buildMode) {
      body.querySelectorAll('.inv-col[data-drop-target="mine"] .inv-table tbody tr').forEach(tr => {
        const btn = tr.querySelector('[data-move][data-item]');
        if (!btn) return;
        const item = btn.dataset.item;
        if (!item || !item.startsWith('item_')) return;
        // 강조 스타일
        tr.style.cursor = 'pointer';
        tr.style.outline = '2px solid #f0c674';
        tr.style.background = 'rgba(240,198,116,0.1)';
        tr.title = '클릭 → 건축 모드에서 배치';
        tr.onclick = (e) => {
          // ↑↓ 버튼 클릭은 기존 동작 유지
          if (e.target.tagName === 'BUTTON') return;
          // 기본 dir 결정
          let dir = 'N';
          if (item === 'item_fence') dir = 'NS';
          // 14.54-c2: stair는 N 또는 W만
          // 14.53-h: 항상 현재 player floor에서만 배치 (다른 층 설치 차단)
          placementMode = { itemType: item, floor: myFloor, dir };
          placingDir = dir;
          showNotice(`📍 ${ITEM_LABEL[item] || item} 배치 모드 — 좌클릭=배치, 우클릭=회전, ESC=취소`);
          // 인벤은 그대로 열어 두어도 OK. 닫고 싶으면 toggleInv() 호출.
        };
      });
    }

    // === Phase 14.24: HTML5 드래그 + 폴리시 ===
    body.querySelectorAll('.inv-table tbody tr').forEach(tr => {
      const btn = tr.querySelector('[data-move]');
      if (!btn) return;
      tr.setAttribute('draggable', 'true');
      tr.addEventListener('dragstart', (e) => {
        const item = btn.dataset.item;
        const payload = { kind: btn.dataset.move, item, cid: btn.dataset.cid };
        e.dataTransfer.setData('text/plain', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'move';
        tr.classList.add('dragging');
        // 작은 ghost (이모지 + 라벨)
        const icon = itemIconHtml(item, 18);
        const label = (ITEM_LABEL && ITEM_LABEL[item]) || item;
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = `${icon} ${label}`;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 18, 18);
        setTimeout(() => ghost.remove(), 0);
      });
      tr.addEventListener('dragend', () => {
        tr.classList.remove('dragging');
        // 모든 drop-zone class 정리
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        document.querySelectorAll('.drag-over-ground').forEach(el => el.classList.remove('drag-over-ground'));
      });
    });

    // drop targets
    body.querySelectorAll('.cont-tab').forEach(t => {
      t.addEventListener('dragover', (e) => { e.preventDefault(); t.classList.add('drag-over'); });
      t.addEventListener('dragleave', () => t.classList.remove('drag-over'));
      t.addEventListener('drop', (e) => {
        e.preventDefault(); t.classList.remove('drag-over');
        try {
          const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
          const amount = dragAmountFromEvent(e);
          handleDrop(payload, t.dataset.cid, amount);
        } catch (err) {}
      });
    });
    body.querySelectorAll('[data-drop-target]').forEach(col => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('drag-over');
        try {
          const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
          const amount = dragAmountFromEvent(e);
          handleDrop(payload, col.dataset.dropTarget, amount);
        } catch (err) {}
      });
    });
  }

  // Phase 14.24 — Shift=10, Ctrl/Alt/Meta=99, 평소=1
  function dragAmountFromEvent(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return 99;
    if (e.shiftKey) return 10;
    return 1;
  }

  // 드래그 결과 처리: payload(원본) → target(목적지) + amount
  function handleDrop(payload, target, amount = 1) {
    const { kind, item, cid: srcCid } = payload;
    if (kind === 'mine' && target === 'mine') return;
    if (kind === 'chest' && target === srcCid) return;
    if (kind === 'mine' && target === 'ground') {
      sendPrimary({ type: 'drop_item', item, amount });
      return;
    }
    if (kind === 'mine' && target && target !== 'ground' && target !== 'mine') {
      // Phase 14.25: 모든 아이템 상자 OK
      sendPrimary({ type: 'chest_put', buildingId: target, item, amount });
      return;
    }
    if (kind === 'chest' && target === 'mine') {
      sendPrimary({ type: 'chest_take', buildingId: srcCid, item, amount });
      return;
    }
    if (kind === 'chest' && target === 'ground') {
      sendPrimary({ type: 'chest_take', buildingId: srcCid, item, amount });
      setTimeout(() => sendPrimary({ type: 'drop_item', item, amount }), 120);
      return;
    }
  }

  // 빈 화면(canvas) drop → 바닥에 떨어뜨리기 (Shift=10, Ctrl=99)
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('drag-over-ground'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over-ground'));
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('drag-over-ground');
    try {
      const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
      handleDrop(payload, 'ground', dragAmountFromEvent(e));
    } catch (err) {}
  });

  // === 제작창 (카테고리 + 레시피) ===
  let craftCat = 'tool';
  function renderCraftPanel2(body) {
    // 14.50/14.51: 서버에서 받은 동적 recipes 사용 (axe/saw/hammer + 건축물 + 가공)
    const TOOL_ICON = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
    let items = [];
    if (craftCat === 'tool') {
      // recipes = { axe: {wood,stone,label}, ... } (server에서 받음)
      items = Object.entries(recipes || {}).map(([id, r]) => ({
        id, msgType: 'craft', icon: TOOL_ICON[id] || '🔧',
        name: r.label || id,
        cost: { wood: r.wood || 0, stone: r.stone || 0 },
        have: hasToolAlive(id) ? 1 : 0,
        durStr: toolDurStr(id),
      }));
    } else if (craftCat === 'building') {
      // 14.51 buildingRecipes — 제작 → 인벤 → 건축 모드에서 배치
      items = Object.entries(buildingRecipes || {}).map(([id, r]) => {
        const cost = {};
        for (const [k, v] of Object.entries(r)) {
          if (k.startsWith('_') || k === 'label') continue;
          cost[k] = v;
        }
        return {
          id, msgType: 'craft_building', icon: itemIconHtml(id, 34, '🏗️'),
          name: r.label || id,
          cost, needHammer: !!r._needHammer,
          have: inventory[id] || 0,
        };
      });
    } else if (craftCat === 'item') {
      // 14.50 itemRecipes — 통나무→판자 등
      items = Object.entries(itemRecipes || {}).map(([id, r]) => ({
        id, msgType: 'craft_item', icon: itemIconHtml(id, 34, '🪚'),
        name: r.label || id,
        cost: r.from || {},
        produces: r.to || {},
        needTool: r.requiresTool,
      }));
    } else if (craftCat === 'food') {
      // cookRecipes (server) 또는 hardcoded fallback
      const cr = cookRecipes || {};
      if (Object.keys(cr).length === 0) {
        items = [
          { id: 'meat_cooked', msgType: 'cook', icon: itemIconHtml('meat_cooked', 34, '🍗'), name: '고기 굽기', cost: { meat_raw: 1 }, needCampfire: true },
          { id: 'berry_jam', msgType: 'cook', icon: itemIconHtml('berry_jam', 34, '🍯'), name: '베리잼', cost: { berry: 3 }, needCampfire: true },
          { id: 'water_bottle', msgType: 'cook', icon: itemIconHtml('water_bottle', 34, '🥤'), name: '물병', cost: { fiber: 2 }, needCampfire: true },
        ];
      } else {
        items = Object.entries(cr).map(([id, r]) => ({
          id, msgType: 'cook', icon: itemIconHtml(id, 34, '🍳'),
          name: r.label || id, cost: r.cost || {}, needCampfire: true,
        }));
      }
    }
    const cats = [
      { id: 'tool',     label: '🔧 도구' },
      { id: 'equip',    label: '🧥 장비' },
      { id: 'trade',    label: '🏪 거래' },
      { id: 'building', label: '🏗️ 건축물' },
      { id: 'item',     label: '🪚 가공' },
      { id: 'food',     label: '🍖 음식/요리' },
    ];
    body.innerHTML = `
      <div class="craft-layout">
        <div class="craft-cats">
          ${cats.map(c => `<div class="craft-cat ${c.id===craftCat?'active':''}" data-cat="${c.id}">${c.label}</div>`).join('')}
        </div>
        <div class="craft-items">
          ${craftCat === 'equip' ? equipmentSectionHtml() : craftCat === 'trade' ? tradeSectionHtml() : (items.length === 0 ? '<div style="color:#8a93a0;padding:20px;text-align:center">레시피 없음</div>' : items.map(r => {
            // need 체크
            const costOK = Object.entries(r.cost).every(([k,v]) => (inventory[k]||0) >= v);
            const hammerOK = !r.needHammer || hasToolAlive('hammer');
            const toolOK = !r.needTool || hasToolAlive(r.needTool);
            const canMake = costOK && hammerOK && toolOK;
            const costStr = Object.entries(r.cost).map(([k,v]) => `${itemIconHtml(k, 16, k)} ${v}`).join(' · ') || '-';
            const flags = [];
            if (r.needHammer) flags.push('🔨');
            if (r.needTool) flags.push(r.needTool);
            if (r.needCampfire) flags.push('🔥');
            if (r.produces) {
              const prodStr = Object.entries(r.produces).map(([k,v]) => `${itemIconHtml(k, 16, k)}×${v}`).join(' ');
              flags.push(`→ ${prodStr}`);
            }
            const haveBadge = (typeof r.have === 'number')
              ? (r.durStr
                  ? ` <span style="color:#7cd97c;font-weight:normal">[${r.durStr}]</span>`
                  : ` <span style="color:#8fc8ff;font-weight:normal">×${r.have}</span>`)
              : '';
            return `<div class="craft-recipe ${canMake?'can-make':'cant-make'}">
              <div class="cr-icon">${r.icon}</div>
              <div class="cr-info"><div class="cr-name">${r.name}${haveBadge}</div><div class="cr-cost">${costStr}${flags.length?' · '+flags.join(' · '):''}</div></div>
              <button data-craft="${r.id}" data-msg="${r.msgType}" ${canMake?'':'disabled'}>제작</button>
            </div>`;
          }).join(''))}
          ${craftCat === 'food' ? dishesListHtml() : ''}
        </div>
      </div>`;
    body.querySelectorAll('[data-cat]').forEach(c => c.onclick = () => { craftCat = c.dataset.cat; if (craftCat === 'trade') sendPrimary({ type: 'shop_info' }); renderCraftPanel2(body); });
    body.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => {
      const id = b.dataset.craft;
      const msgType = b.dataset.msg;
      sendPrimary({ type: msgType, recipe: id });
    });
    if (craftCat === 'equip') wireEquipmentHandlers(body, () => renderCraftPanel2(body));
    if (craftCat === 'food') wireDishHandlers(body);
    if (craftCat === 'trade') wireTradeHandlers(body, () => renderCraftPanel2(body));
  }

  // === 건축 모드 패널 (14.51 신 시스템 안내 + ON/OFF 토글) ===
  function renderBuildPanel(body) {
    const status = buildMode ? '<span style="color:#7cd97c">ON</span>' : '<span style="color:#ff7c7c">OFF</span>';
    body.innerHTML = `
      <div style="padding:12px;color:#cfd6e0;line-height:1.6;font-size:13px">
        <h3 style="margin:0 0 12px 0;color:#f0c674">🏗️ 건축 모드 ${status}</h3>
        <button id="buildToggleBtn" style="width:100%;padding:10px;background:${buildMode?'#7cd97c':'#3a4a5a'};color:#fff;border:none;border-radius:4px;font-size:14px;font-weight:bold;cursor:pointer;margin-bottom:12px">
          ${buildMode ? '⏹ 건축 모드 끄기' : '▶ 건축 모드 켜기'} (B키)
        </button>
        <div style="background:#1a1f25;padding:10px;border-radius:4px;font-size:12px;color:#8a93a0">
          <p style="margin:0 0 8px 0;color:#f0c674;font-weight:bold">📋 사용법</p>
          <p style="margin:0 0 6px 0">① 🔨 <b>제작</b> 패널에서 "건축물" 탭 → 벽/바닥 제작 (자원+망치 소비) → 인벤에 들어감</p>
          <p style="margin:0 0 6px 0">② <b>B키</b>로 건축 모드 ON</p>
          <p style="margin:0 0 6px 0">③ <b>I</b>로 인벤 → 건축물 아이템 클릭 → placement 모드</p>
          <p style="margin:0 0 6px 0">④ 맵 좌클릭 → <b>3초 progress</b> → 배치 (이동 시 취소)</p>
          <p style="margin:0 0 6px 0">⑤ 우클릭 = 회전 · ESC = placement 종료</p>
          <p style="margin:0 0 0 0">⑥ 건축물에 마우스 hover → 좌클릭 → <b>3초 progress</b> → 분해 (인벤 +1)</p>
        </div>
        <div style="background:#2a1f15;padding:10px;border-radius:4px;font-size:12px;color:#c89070;margin-top:8px">
          ⚠️ 옛 즉시 빌드 시스템은 제거됨. 모든 건축물 = 제작→인벤→배치.
        </div>
        <!-- 터 잡기(다단계 건축) — 아래 JS 주석 참조. 노·숯가마·움집은 아이템이 아니라 '터'다. -->
        <div id="siteBuildBox" style="background:#1a1f25;padding:10px;border-radius:4px;font-size:12px;margin-top:8px">
          <p style="margin:0 0 8px 0;color:#f0c674;font-weight:bold">⛏️ 터 잡기 (다단계 건축 — 자리부터 잡는다)</p>
          <div id="siteBuildList" style="display:flex;flex-direction:column;gap:6px"></div>
          <p style="margin:8px 0 0 0;color:#8a93a0">자리를 잡은 뒤 자재를 들고 터를 클릭하면 다음 단계가 올라간다.</p>
        </div>
      </div>`;
    // ★★[2026-08-02d 배치 5 ⑥ — 실클라 E2E 가 잡은 결함] 터 잡기(다단계 건축) 구획.
    //   노·숯가마·움집은 **아이템이 아니라 터**다(제작→인벤→배치 계약에 안 들어간다 — 자리를 잡고
    //   자재를 들고 가 단계를 올린다). 그런데 그 진입점이 #hud .hud-actions 안에만 있었고
    //   그 컨테이너는 style.css:486 에서 display:none 이라 **플레이어가 도달할 방법이 없었다** —
    //   키 바인딩도 0곳이고 제작 패널에도 없다. 서버 E2E(test-furnace 59/0)가 통과하는 동안
    //   화면에서는 노를 **한 번도 지을 수 없었다.**
    //   (배치 1 의 _claimFootprint 결함과 같은 계열: 계약은 멀쩡한데 실행 경로가 끊겨 있었다.
    //    그때 교훈이 "소스 계약 검사로는 못 잡는다 — 실행해 봐야 한다"였고, 이번엔 한 층 더 위,
    //    **실화면**이라야 잡혔다.)
    //   ⇒ 여기서 로직을 복제하지 않는다. 정본 버튼(.hud-actions[data-action])을 그대로 눌러 준다.
    {
      const list = document.getElementById('siteBuildList');
      const src = document.querySelectorAll('.hud-actions [data-action="hut_start"], .hud-actions [data-action="furnace_start"], .hud-actions [data-action="kiln_start"], .hud-actions [data-action="village_start"]');
      for (const srcBtn of src) {
        if (srcBtn.style && srcBtn.style.display === 'none') continue;   // 시대 미해금(괴련로 등)은 정본 그대로 숨긴다
        const b = document.createElement('button');
        b.textContent = (srcBtn.textContent || '').trim();
        b.style.cssText = 'width:100%;padding:8px;background:#3a4a5a;color:#e8eaed;border:1px solid #4a5a6a;border-radius:4px;cursor:pointer;font-size:13px;text-align:left';
        b.onclick = () => { srcBtn.click(); closeSide(); };   // ★정본 핸들러 호출 — 배치 모드 진입 후 패널을 비켜 준다
        list.appendChild(b);
      }
      if (!list.children.length) list.innerHTML = '<span style="color:#8a93a0">(지금 잡을 수 있는 터가 없다)</span>';
    }
    document.getElementById('buildToggleBtn').onclick = () => {
      buildMode = !buildMode;
      if (!buildMode) placementMode = null;
      showNotice(buildMode ? '🏗️ 건축 모드 ON' : '건축 모드 OFF');
      renderBuildPanel(body);
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    };
  }

  // ═══ ★★[2026-08-03e 배치 12 ③] 마을(길드) 재고 패널 ══════════════════════════
  //   재민: *"마을(길드) 관리자가 식량 등의 마을 재고 현황을 파악할 수 있도록 ui 할 거야"*
  //   ★이 함수는 **표시만** 한다. 합계·환산·문턱은 전부 서버(엔진 정본)가 계산해 보낸 값이다 —
  //     화면에서 다시 계산하면 그게 사본이고, 사본은 언젠가 정본과 어긋난다(배치 7 오진의 형태).
  //   ★`_cash` 는 애초에 안 온다(서버가 뺀다). 장부이지 재화가 아니기 때문이다.
  const _PVI_LABEL = {
    food: '곡식', fish: '생선', meat: '고기', cooked_food: '요리', fruit: '과일', vegetable: '나물', mushroom: '버섯',
    wood: '통나무', stone: '돌', twig: '삭정이', pebble: '자갈',
    tool: '간석기 도구', iron_tool: '철 도구', bronze_tool: '청동 도구',
    ore: '원석', iron: '철', copper: '구리', tin: '주석',
    weapon: '무기', armor: '갑옷', hide: '가죽', bone: '뼈',
    clothes: '옷', herb: '약재', clay: '진흙', charcoal: '숯', obsidian: '흑요석', jade: '옥', tigerhide: '호피',
    hemp: '삼베', ramie: '모시',
  };
  const _pviKo = (r) => _PVI_LABEL[r] || r;
  function showVillageInventory(inv) {
    if (!inv) return;
    window.__villageInv = inv;   // ★진단 훅(읽기 전용) — E2E 가 '화면 표시값 = 서버 실값'을 assert 한다
    let el = document.getElementById('villageInvPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'villageInvPanel';
      el.style.cssText = 'position:fixed;right:16px;top:64px;width:330px;max-height:72vh;overflow:auto;'
        + 'background:#141a22;color:#e8eaed;border:1px solid #2a3340;border-radius:8px;z-index:900;'
        + 'font-size:13px;box-shadow:0 6px 22px rgba(0,0,0,.5)';
      document.body.appendChild(el);
    }
    el.style.display = 'block';
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const empty = inv.pop === 0;
    let h = `<div style="padding:10px;border-bottom:1px solid #2a3340;display:flex;justify-content:space-between;align-items:center">`
      + `<b>🏘️ ${esc(inv.name)}</b><span id="pviClose" style="cursor:pointer;color:#8a93a0;padding:0 4px">✕</span></div>`;
    h += `<div style="padding:8px 10px;color:#8fc8ff">👥 인구 <b>${inv.pop}</b>`
      + (inv.housing != null ? ` <span style="color:#8a93a0">/ 주거 ${inv.housing}</span>` : '')
      + ` · 📅 Day ${inv.day}<span style="color:#8a93a0"> (창설 ${inv.foundedDay})</span></div>`;
    h += `<div style="padding:0 10px 8px">🌾 식량 환산 <b>${inv.foodEquiv}</b>`
      + (inv.pop > 0 ? ` <span style="color:#8a93a0">(1인 ${inv.foodDays}일치)</span>` : '') + `</div>`;
    if (empty) {
      // ★인구 0 = "빈 터"다. 소멸이 아니라 **아직 시작 안 함**이라는 걸 화면이 말해야 한다.
      const need = inv.nextResidentAt;
      const have = (inv.nextResidentHave != null) ? inv.nextResidentHave : inv.foodEquiv;   // 서버가 준 정본 값(클라 재계산 0)
      h += `<div style="margin:0 10px 10px;padding:8px;background:#1c2a1c;border:1px solid #2f4a2f;border-radius:6px;color:#cfe8cf">`
        + `아직 아무도 살지 않는다. 곳간 <b>식량 ${need}</b>어치가 쌓이면 첫 주민이 깃든다`
        + (need ? ` <span style="color:#8a93a0">(지금 <b data-pvi-have>${(+have).toFixed(1)}</b>)</span>` : '') + `.</div>`;
    }
    for (const g of (inv.groups || [])) {
      h += `<div style="padding:6px 10px;border-top:1px solid #2a3340;color:#8a93a0">${esc(g.ko)}</div><table style="width:100%;font-size:12px;border-collapse:collapse">`;
      for (const it of g.items) {
        h += `<tr><td style="padding:2px 10px">${esc(_pviKo(it.r))}</td>`
          + `<td align="right" style="padding:2px 10px;color:#fff" data-pvi="${esc(it.r)}">${it.q}</td></tr>`;
      }
      h += `</table>`;
    }
    if ((inv.treasury || []).length) {
      h += `<div style="padding:6px 10px;border-top:1px solid #2a3340;color:#8a93a0">국고(걷힌 실물)</div><table style="width:100%;font-size:12px;border-collapse:collapse">`;
      for (const it of inv.treasury) h += `<tr><td style="padding:2px 10px">${esc(_pviKo(it.r))}</td><td align="right" style="padding:2px 10px;color:#d8c898">${it.q}</td></tr>`;
      h += `</table>`;
    }
    // ── 곳간에 넣기 — 내가 지금 들고 있는 것 중 **이 곳간이 받는 것**만 버튼으로 ──────
    //   목록은 서버가 준 `accepts` 그대로다(클라가 제 목록을 따로 갖지 않는다 — 사본 금지).
    const acc = inv.accepts || {};
    const mine = Object.keys(acc).filter((k) => (inventory[k] || 0) > 0);
    h += `<div style="padding:6px 10px;border-top:1px solid #2a3340;color:#8a93a0">곳간에 넣기 (내 짐)</div>`;
    if (!mine.length) {
      h += `<div style="padding:0 10px 8px;color:#6f7a88;font-size:11px">넣을 만한 걸 안 들고 있다.</div>`;
    } else {
      h += `<div style="padding:0 10px 10px;display:flex;flex-wrap:wrap;gap:6px">`;
      for (const k of mine) {
        h += `<button data-pvi-put="${esc(k)}" style="padding:5px 8px;background:#2b3a4a;color:#e8eaed;border:1px solid #3c4e60;border-radius:4px;cursor:pointer;font-size:12px">`
          + `${esc(_pviKo(acc[k]))} ${inventory[k]} ▸ 넣기</button>`;
      }
      h += `</div>`;
    }
    h += `<div style="padding:8px 10px;color:#6f7a88;font-size:11px;border-top:1px solid #2a3340">회관을 다시 클릭하면 갱신된다</div>`;
    el.innerHTML = h;
    const cl = document.getElementById('pviClose');
    if (cl) cl.onclick = () => { el.style.display = 'none'; };
    for (const btn of el.querySelectorAll('[data-pvi-put]')) {
      btn.onclick = () => {
        const it = btn.getAttribute('data-pvi-put');
        const q = inventory[it] || 0;
        if (!(q > 0) || !_pviHallId) return;
        sendPrimary({ type: 'village_deposit', buildingId: _pviHallId, want: { [it]: q } });   // 전부 넣는다(서버가 최종 판정)
      };
    }
  }
  let _pviHallId = null;   // 마지막으로 연 회관 — "넣기"가 어느 곳간인지

  // === 시세 패널 — 중앙 economy 모듈에서 마을별 가격 fetch + 비교 ===
  const RES_ICON = {
    food: '🌾', fish: '🐟', meat: '🥩', cooked_food: '🍲',
    wood: '🪵', stone: '🪨', ore: '⛏️', tool: '⚒️',
    fruit: '🍎', vegetable: '🥬', mushroom: '🍄', twig: '🌿', pebble: '🪨', hide: '🦴',
  };
  let _marketSel = null;
  function renderMarketPanel(body) {
    // Phase 4d-4: 캐나디아 zone이면 캐나디아 시세 (7마을), 그 외엔 글로벌 (20마을)
    const url = primaryZoneId === 'canadia' ? '/economy/canadia/prices' : '/economy/prices';
    return renderMarketPanelFromUrl(body, url);
  }
  function renderMarketPanelFromUrl(body, url) {
    body.innerHTML = `<div style="padding:10px;color:#8a93a0">시세 데이터 로딩 중…</div>`;
    fetch(url).then(r => r.json()).then(d => {
      const villages = d.villages || [];
      villages.sort((a, b) => b.pop - a.pop);
      if (!_marketSel) _marketSel = villages[0]?.name;
      const sel = villages.find(v => v.name === _marketSel) || villages[0];
      let html = `<div style="padding:8px;color:#8fc8ff">📅 Day ${d.day} · ${villages.length}개 마을</div>`;
      html += `<select id="mkSel" style="margin:6px;padding:4px;font-size:13px">`;
      villages.forEach(v => {
        const tax = (v.guild.taxRate * 100).toFixed(1);
        html += `<option value="${v.name}" ${v.name === sel.name ? 'selected' : ''}>${v.name} (인구 ${v.pop}, 세율 ${tax}%)</option>`;
      });
      html += `</select>`;
      if (sel) {
        html += `<div style="padding:8px;border-top:1px solid #2a3340"><b>🏪 ${sel.name} 시세</b> <span style="color:#8a93a0">(인구 ${sel.pop}, 세율 ${(sel.guild.taxRate*100).toFixed(1)}%)</span></div>`;
        html += `<table style="width:100%;font-size:12px;border-collapse:collapse">`;
        html += `<tr style="color:#8a93a0;border-bottom:1px solid #2a3340"><th align="left" style="padding:4px">자원</th><th align="right">여기</th>`;
        // 비교 마을 — 상위 4개 (선택 마을 제외)
        const compareTowns = villages.filter(v => v.name !== sel.name).slice(0, 4);
        compareTowns.forEach(v => { html += `<th align="right" style="color:#5a9ae0">${v.name.slice(0,3)}</th>`; });
        html += `<th align="right" style="color:#8a93a0">최저</th><th align="right" style="color:#8a93a0">최고</th></tr>`;
        Object.keys(sel.prices).forEach(r => {
          const myPrice = sel.prices[r];
          const allPrices = villages.map(v => v.prices[r]);
          const minP = Math.min(...allPrices);
          const maxP = Math.max(...allPrices);
          const icon = RES_ICON[r] || '·';
          html += `<tr style="border-bottom:1px solid #1a1f28">`;
          html += `<td style="padding:3px">${icon} ${r}</td>`;
          html += `<td align="right" style="color:#fff">${myPrice.toFixed(2)}</td>`;
          compareTowns.forEach(v => {
            const p = v.prices[r];
            const color = p < myPrice * 0.7 ? '#f08080' : p > myPrice * 1.5 ? '#80f080' : '#8a93a0';
            html += `<td align="right" style="color:${color}">${p.toFixed(2)}</td>`;
          });
          html += `<td align="right" style="color:#80f080">${minP.toFixed(2)}</td>`;
          html += `<td align="right" style="color:#f08080">${maxP.toFixed(2)}</td>`;
          html += `</tr>`;
        });
        html += `</table>`;
        html += `<div style="padding:6px;color:#8a93a0;font-size:11px">🟢 여기보다 쌈 · 🔴 여기보다 비쌈 · 최저/최고 = 전 마을 가격 범위</div>`;
      }
      body.innerHTML = html;
      const selEl = document.getElementById('mkSel');
      if (selEl) selEl.onchange = (e) => { _marketSel = e.target.value; renderMarketPanel(body); };
    }).catch(err => {
      body.innerHTML = `<div style="padding:10px;color:#f08080">시세 로드 실패: ${err.message}</div>`;
    });
  }

  // === Phase 4d-1: 마을 거래소 modal (canadia zone 거래소 chest 클릭 시) ===
  let _vmpVillage = null;
  let _vmpInterval = null;
  function openVillageMarket(villageName) {
    const panel = document.getElementById('villageMarketPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    const title = document.getElementById('vmpTitle');
    if (title) title.textContent = `🏪 ${villageName} 거래소`;
    _vmpVillage = villageName;
    renderVillageMarket(villageName);
    // Phase 4d-3: 자동 갱신 1초 (시뮬 1초/day와 동기화)
    if (_vmpInterval) clearInterval(_vmpInterval);
    _vmpInterval = setInterval(() => {
      if (_vmpVillage && !document.getElementById('villageMarketPanel')?.classList.contains('hidden')) {
        renderVillageMarket(_vmpVillage);
      }
    }, 1000);
  }
  function closeVillageMarket() {
    document.getElementById('villageMarketPanel')?.classList.add('hidden');
    _vmpVillage = null;
    if (_vmpInterval) { clearInterval(_vmpInterval); _vmpInterval = null; }
  }
  // Phase 4d-14f: 깜빡임 없는 부분 갱신. 첫 호출 시 구조 build, 그 후 cell.textContent만 update.
  let _vmpStructFor = null;        // 마지막 build된 villageName (다르면 rebuild)
  let _vmpAllResources = null;     // 첫 호출 시 결정된 자원 목록 (이후 stable)
  function renderVillageMarket(villageName) {
    const sumEl = document.getElementById('vmpSummary');
    const priceEl = document.getElementById('vmpPrices');
    if (!sumEl || !priceEl) return;
    const needRebuild = _vmpStructFor !== villageName;
    if (needRebuild) {
      sumEl.innerHTML = '<div style="color:#888">시뮬 데이터 로드 중…</div>';
      priceEl.innerHTML = '';
      _vmpAllResources = null;
    }
    // 두 fetch 병렬 → 모두 끝나면 한 번에 update (깜빡임 최소화)
    Promise.all([
      fetch('/economy/canadia/villages').then(r => r.json()),
      fetch('/economy/canadia/prices').then(r => r.json()),
    ]).then(([world, pd]) => {
      const me = world.villages.find(v => v.name === villageName);
      const myEntry = pd.villages.find(v => v.name === villageName);
      if (!me || !myEntry) { sumEl.innerHTML = `<div style="color:#f88">${villageName} 마을을 찾을 수 없습니다.</div>`; return; }
      const myPrices = myEntry.prices || {};
      const storage = myEntry.storage || {};
      const treasury = myEntry.treasury || {};

      // 자원 목록은 첫 build 시 결정 (16종 다 포함, 추후 stable)
      if (!_vmpAllResources) {
        const allRes = new Set();
        for (const v of pd.villages) for (const r of Object.keys(v.prices || {})) allRes.add(r);
        _vmpAllResources = [...allRes].sort();
      }

      if (needRebuild) {
        buildVmpStructure(sumEl, priceEl, villageName, world, pd, _vmpAllResources);
        _vmpStructFor = villageName;
      }
      updateVmpData(sumEl, priceEl, villageName, world, me, myPrices, storage, treasury, pd, _vmpAllResources);
    }).catch(e => { sumEl.innerHTML = `<div style="color:#f88">로드 실패: ${e.message}</div>`; });
    // 거래 로그 — 다른 마을 변경 시만 통째, 그 외엔 textContent만 update
    const logEl = document.getElementById('vmpTradeLog');
    if (logEl) {
      fetch('/economy/canadia/tradelog').then(r => r.json()).then(d => {
        const trades = (d.trades || []).filter(t => t.a === villageName || t.b === villageName).slice(0, 12);
        renderVmpTradeLog(logEl, villageName, trades, needRebuild);
      }).catch(e => { logEl.innerHTML = `<div style="color:#f88">로그 로드 실패: ${e.message}</div>`; });
    }
  }
  // 첫 호출 시 표 구조 build (data attribute로 cell 매핑)
  function buildVmpStructure(sumEl, priceEl, villageName, world, pd, items) {
    sumEl.innerHTML = `
      <div data-vmp="header"><b data-vmp-name></b> · Day <span data-vmp-day></span></div>
      <div>👥 인구 <b data-vmp-pop></b> · 💰 거래소세 <b data-vmp-tax></b></div>
      <div>💼 직업: <span data-vmp-jobs></span></div>
      <div data-vmp-storage style="margin-top:10px;padding:10px;background:#1a2a3a;border-radius:4px"></div>
    `;
    // 가격표 구조
    let html = '<table style="width:100%;border-collapse:collapse">';
    html += '<tr style="background:#222"><th style="text-align:left;padding:6px">자원</th>';
    html += `<th style="padding:6px;background:#2a3a4a">${villageName} (여기)</th>`;
    for (const v of pd.villages) {
      if (v.name === villageName) continue;
      html += `<th style="padding:6px;font-size:11px">${v.name}</th>`;
    }
    html += '</tr>';
    for (const item of items) {
      html += `<tr style="border-top:1px solid #333" data-vmp-row="${item}"><td style="padding:6px"><b>${ITEM_KR(item)}</b></td>`;
      html += `<td style="padding:6px;background:#2a3a4a;text-align:center"><b data-vmp-cell="my:${item}">-</b></td>`;
      for (const v of pd.villages) {
        if (v.name === villageName) continue;
        html += `<td style="padding:6px;text-align:center" data-vmp-cell="p:${v.name}:${item}">-</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    priceEl.innerHTML = html;
  }
  // 매 갱신마다 cell.textContent만 update (깜빡임 X)
  function updateVmpData(sumEl, priceEl, villageName, world, me, myPrices, storage, treasury, pd, items) {
    const setText = (sel, val) => { const el = sumEl.querySelector(sel); if (el) el.textContent = val; };
    setText('[data-vmp-name]', me.name);
    setText('[data-vmp-day]', world.day);
    setText('[data-vmp-pop]', me.pop || 0);
    setText('[data-vmp-tax]', `${((me.taxRate || 0.03) * 100).toFixed(1)}%`);
    const jobs = Object.entries(me.jobs || {}).filter(([,n]) => n > 0).map(([j,n]) => `${JOB_KR(j)} ${n}`).join(' · ');
    setText('[data-vmp-jobs]', jobs || '(없음)');
    // storage·treasury 영역 — innerHTML로 갱신 (작아서 깜빡임 미미). 다만 자주 변동.
    const stoEntries = Object.entries(storage).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const treasuryRes = Object.entries(treasury).filter(([k, v]) => k !== '_cash' && v > 0.1)
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ITEM_KR(k)} ${Math.floor(v)}`).join(' · ');
    const cash = treasury._cash || 0;
    let stoHtml = '<div style="color:#fc8;font-weight:bold;margin-bottom:6px">📦 거래소 보유 자원</div>';
    if (!stoEntries.length) stoHtml += '<div style="color:#888">(비어있음)</div>';
    else {
      stoHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:4px">';
      for (const [k, v] of stoEntries) stoHtml += `<div style="padding:4px 6px;background:#0e1822;border-radius:3px">${ITEM_KR(k)} <b>${Math.floor(v)}</b></div>`;
      stoHtml += '</div>';
    }
    stoHtml += `<div style="margin-top:6px;color:#aaa;font-size:11px">💰 길드 금고 자원: ${treasuryRes || '(비어있음)'}</div>`;
    if (cash > 0) stoHtml += `<div style="color:#aaa;font-size:11px">📒 거래 회계 (cash): <b style="color:#fc8">${Math.floor(cash)}</b></div>`;
    const sto = sumEl.querySelector('[data-vmp-storage]');
    if (sto && sto.innerHTML !== stoHtml) sto.innerHTML = stoHtml;
    // 가격표 — 각 cell textContent만 update (깜빡 X)
    for (const item of items) {
      const myP = myPrices[item];
      const myCell = priceEl.querySelector(`[data-vmp-cell="my:${item}"]`);
      if (myCell) myCell.textContent = (myP && myP > 0) ? fmtPrice(myP) : '-';
      for (const v of pd.villages) {
        if (v.name === villageName) continue;
        const cell = priceEl.querySelector(`[data-vmp-cell="p:${v.name}:${item}"]`);
        if (!cell) continue;
        const p = (v.prices || {})[item];
        if (!p || p <= 0 || !myP) { cell.textContent = '-'; cell.style.color = '#666'; continue; }
        const diff = p - myP, pct = ((diff / myP) * 100).toFixed(0);
        const color = diff > 0 ? '#7c7' : (diff < 0 ? '#f77' : '#aaa');
        const sign = diff > 0 ? '+' : '';
        cell.textContent = `${fmtPrice(p)} (${sign}${pct}%)`;
        cell.style.color = color;
      }
    }
  }
  let _vmpTradeLastKey = null;
  function renderVmpTradeLog(logEl, villageName, trades, force) {
    // 거래 로그 — trades 첫 항목 키로 변경 감지. 없으면 update X
    const key = villageName + ':' + (trades[0]?.day || '') + ':' + trades.length;
    if (!force && key === _vmpTradeLastKey) return;
    _vmpTradeLastKey = key;
    if (!trades.length) {
      logEl.innerHTML = '<div style="color:#888;padding:6px">📜 아직 이 마을 관련 거래 없음</div>';
      return;
    }
    let html = '<div style="color:#fc8;font-weight:bold;margin-bottom:6px">📜 최근 거래</div>';
    html += '<div style="max-height:160px;overflow-y:auto">';
    for (const t of trades) {
      const dir = t.a === villageName ? '→' : '←';
      const other = t.a === villageName ? t.b : t.a;
      const gave = t.a === villageName ? t.aGave : t.bGave;
      const got = t.a === villageName ? t.bGave : t.aGave;
      const raid = t.raided ? ' <span style="color:#f66">⚠️약탈</span>' : '';
      html += `<div style="padding:3px 4px;border-bottom:1px solid #222">Day ${t.day} · ${dir} <b>${other}</b>: 보냄 ${ITEM_KR(gave.res)} ${gave.amt}, 받음 ${ITEM_KR(got.res)} ${got.amt} <span style="color:#888">(거리 ${t.distance}, 호위 ${t.escort})</span>${raid}</div>`;
    }
    html += '</div>';
    logEl.innerHTML = html;
  }
  function JOB_KR(j) {
    const M = { farmer:'농부', fisher:'어부', hunter:'사냥꾼', lumberjack:'벌목꾼', miner:'광부', prospector:'탐사꾼', smith:'대장장이', forager:'채집꾼', cook:'요리사', warrior:'전사', merchant:'상인' };
    return M[j] || j;
  }
  function ITEM_KR(i) {
    const M = { food:'🍞 식량', wood:'🪵 나무', stone:'🪨 돌', ore:'⛏️ 광석', metal:'⚙️ 금속', forage:'🌿 채집물', cooked:'🍲 요리', fish:'🐟 생선', meat:'🥩 고기' };
    return M[i] || i;
  }
  // Phase 4d-13: v2 가격 폭 (0.01 ~ 1000)에 적응형 포맷
  function fmtPrice(p) {
    if (p == null) return '-';
    if (p >= 100) return p.toFixed(0);
    if (p >= 10) return p.toFixed(1);
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(3);
  }
  // Phase 4d-3: 캐러밴 polling (1초 = 시뮬 1day와 동기화)
  setInterval(() => {
    if (primaryZoneId !== 'canadia') { _canadiaCaravans = []; return; }
    fetch('/economy/canadia/caravans').then(r => r.json()).then(d => {
      _canadiaCaravans = d.caravans || [];
    }).catch(() => {});
  }, 1000);
  // Phase 4d-4: 마을 데이터 polling (작업장 시각화용, 5초마다)
  setInterval(() => {
    if (primaryZoneId !== 'canadia') { _canadiaVillages = []; return; }
    fetch('/economy/canadia/villages').then(r => r.json()).then(d => {
      _canadiaVillages = d.villages || [];
    }).catch(() => {});
  }, 5000);

  // 외부 노출
  window.openVillageMarket = openVillageMarket;
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('vmpCloseBtn')?.addEventListener('click', closeVillageMarket);
    // ESC로 닫기
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !document.getElementById('villageMarketPanel')?.classList.contains('hidden')) closeVillageMarket();
    });
  });
})();

// ============================================================
// Phase 5-2-mini: 상세 미니맵 (cell 단위 zoom/pan)
// ============================================================
(() => {
  const panel = document.getElementById('bigMapPanel');
  const canvas = document.getElementById('bigMapCanvas');
  if (!panel || !canvas) return;
  const ctx = canvas.getContext('2d');
  const zoomLabel = document.getElementById('bigMapZoomLabel');
  const coordLabel = document.getElementById('bigMapCoordLabel');
  const closeBtn = document.getElementById('bigMapCloseBtn');
  const fitBtn = document.getElementById('bigMapFitBtn');
  const meBtn = document.getElementById('bigMapMeBtn');

  // 표시 변수
  let zoom = 0.01;   // world px → display px 배율 (작을수록 zoom-out)
  let panX = 0, panY = 0;

  // Phase 5-G: zoom을 cell이 정수 px이 되도록 snap (grid line align 완벽)
  // cellPx = 32 * zoom. cellPx >= 1이면 round해서 정수로.
  const CELL_SIZE = 32;
  function snapZoom(z) {
    const cellPx = z * CELL_SIZE;
    if (cellPx >= 1) return Math.round(cellPx) / CELL_SIZE;
    // sub-cell zoom (zoom-out)는 그대로
    return z;
  }
  let dragging = false, dragStartX = 0, dragStartY = 0, dragPanX = 0, dragPanY = 0;
  let visible = false;
  let needsRedraw = true;

  const TILE_COLORS = {
    water:    '#1a3a6a', // 강·호수도 바다(OCEAN_COLOR)와 동일색 — 플레이어는 색으로 강·바다 구분 불가 (구분은 시스템 내부 데이터만)
    rock:     '#6e6356', // Phase 5-H: 산맥 바위
    forest:   '#2a5a2a',
    mountain: '#8a8a8a',
    ore:      '#c4682a',
    plain:    null,    // groundColor 사용
  };
  const OCEAN_COLOR = '#1a3a6a';

  // ===== Phase 5-G perf: zone별 offscreen canvas cache (LOD pyramid) =====
  // zoom level을 정해진 stop으로 snap → 같은 level이면 cache 재사용
  // drag/pan은 cache를 drawImage로 옮기기만 → 0 cell sample, 0렉
  // cache 빌드는 vector primitive만 (rect/arc/stroke) — ms 단위
  // 더 미세한 LOD step (2~3배 간격, nearest neighbor 정보 손실 최소화)
  const ZOOM_LEVELS = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.5];
  const MAX_CACHE_PX = 1024;   // cache canvas 한 변 최대 (메모리 cap)
  const MIN_CACHE_PX = 16;
  const zoneCacheMap = new Map(); // zid -> { level, canvas, cw, ch }
  let cacheTerrainVersion = 0;    // hardcoded terrain 변경 시 bump

  function pickZoomLevel(z) {
    for (const lv of ZOOM_LEVELS) {
      if (lv >= z) return lv;
    }
    return ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  }

  function invalidateAllCaches() {
    zoneCacheMap.clear();
    vpCache = null;
    needsRedraw = true;
  }
  // terrain.setHardcoded 후 외부에서 호출
  window.__invalidateMinimapCache = invalidateAllCaches;

  const _rgbCache = {};
  function _hexRgb(h) { if (_rgbCache[h]) return _rgbCache[h]; const n = parseInt((h || '#000').slice(1), 16); return _rgbCache[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function buildZoneCache(zid, zone, level) {
    const zw = zone.zoneWidth || 0, zh = zone.zoneHeight || 0;
    if (zw === 0) return null;
    // cache 해상도 = zone 크기 * level, max cap 적용 (큰 zone일수록 픽셀 손실)
    let cw = zw * level, ch = zh * level;
    const cap = Math.min(1, MAX_CACHE_PX / Math.max(cw, ch));
    cw = Math.max(MIN_CACHE_PX, Math.ceil(cw * cap));
    ch = Math.max(MIN_CACHE_PX, Math.ceil(ch * cap));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const cx = c.getContext('2d');

    // 1. base ground
    cx.fillStyle = zone.isOcean ? OCEAN_COLOR : (zone.groundColor || '#5a7c4a');
    cx.fillRect(0, 0, cw, ch);
    if (zone.isOcean) return { level, canvas: c, cw, ch };

    const Terrain = window.Terrain;
    const td = Terrain && Terrain.ZONE_TERRAIN[zid];
    if (!td) return { level, canvas: c, cw, ch };

    const sxr = cw / zw, syr = ch / zh; // world px → cache px
    const waterColor = TILE_COLORS.water;

    // 2~7. 벡터 렌더 (가벼움). 우선순위 아래→위: forest < ore < rock < water.
    //   빌드가 강·산맥의 폭 걸침을 이웃 존에도 저장 → 벡터여도 경계에서 안 잘리고 연속.
    // 2. forest — 손그림(타원 center/rx/ry) + 절차(rect). density>1.5만.
    if (td.forests) { cx.fillStyle = TILE_COLORS.forest;
      for (const f of td.forests) { if ((f.densityMult||f.density||0) <= 1.5) continue;
        if (f.rect) { const [x1,y1,x2,y2]=f.rect; cx.fillRect(x1*sxr,y1*syr,Math.max(1,(x2-x1)*sxr),Math.max(1,(y2-y1)*syr)); }
        else if (f.center) { cx.beginPath(); cx.ellipse(f.center[0]*sxr,f.center[1]*syr,Math.max(0.5,(f.rx||f.a||1)*sxr),Math.max(0.5,(f.ry||f.b||1)*syr),0,0,6.2832); cx.fill(); } } }
    // 3. ore arc
    // ★★[재민 확정] 자잘 광맥(o.minor)은 **미니맵에 안 그린다**.
    //   "자잘광맥을 더 추가하는 방향으로.. 훨씬 많아야 해.. 그래야 탐험하는 재미가 있지"
    //   지도에 2600개가 전부 찍히면 발견이라는 게 없어진다 — 걸어 다니다 만나야 한다.
    //   (겸사겸사 프레임당 2600개 arc 도 사라진다. 큰 광맥 61개만 그린다.)
    //   ※ "판 자잘 광맥은 지도에 표시로 남긴다"(발견 기록)는 별도 기능 — 설계 회부 대상.
    if (td.ores && TILE_COLORS.ore) { cx.fillStyle = TILE_COLORS.ore;
      for (const o of td.ores) { if (!o.center || o.minor) continue; cx.beginPath(); cx.arc(o.center[0]*sxr,o.center[1]*syr,Math.max(0.5,(o.radius||0)*sxr),0,6.2832); cx.fill(); } }
    // 4. mountain rect (절차 — 그려진 존은 비어있음)
    if (td.mountains && TILE_COLORS.mountain) { cx.fillStyle = TILE_COLORS.mountain;
      for (const m of td.mountains) { if (!m.rect||(m.stoneMult||0)<=1.5) continue; const [x1,y1,x2,y2]=m.rect; cx.fillRect(x1*sxr,y1*syr,Math.max(1,(x2-x1)*sxr),Math.max(1,(y2-y1)*syr)); } }
    // 5. ridge(산맥) stroke — rock. river/lake보다 먼저(water>rock).
    //   ★[11차] 산맥을 그린 **뒤 고개(원)·계곡(선)을 도로 뚫는다**. 안 뚫으면 전체 지도만 산이 통짜로
    //   막힌 것처럼 보이고, 정작 게임 안에서는 지나다닌다 — 지도가 지형을 두고 거짓말을 하게 된다.
    //   판정 우선순위(terrain.js isRockCellLocal: 계곡·고개 > 물 > 바위)와 그리는 순서를 맞춘 것.
    //   별도 캔버스에 산맥을 그리고 거기서 구멍을 낸 뒤 합성 — 바탕색으로 덧칠하면 그 밑의 숲·광맥까지 지워진다.
    if (td.ridges && TILE_COLORS.rock) {
      const rc = document.createElement('canvas'); rc.width = cw; rc.height = ch;
      const rx2 = rc.getContext('2d');
      rx2.strokeStyle = TILE_COLORS.rock; rx2.lineCap = 'round'; rx2.lineJoin = 'round';
      for (const r of td.ridges) { const p=r.path||[]; for (let i=0;i<p.length-1;i++){ const a=p[i],b=p[i+1]; const ax=a.pos?a.pos[0]:a[0],ay=a.pos?a.pos[1]:a[1],bx=b.pos?b.pos[0]:b[0],by=b.pos?b.pos[1]:b[1]; rx2.lineWidth=Math.max(1.2,((a.width||300)+(b.width||300))/2*sxr); rx2.beginPath(); rx2.moveTo(ax*sxr,ay*syr); rx2.lineTo(bx*sxr,by*syr); rx2.stroke(); } }
      rx2.globalCompositeOperation = 'destination-out';
      for (const q of (td.passes||[])) { if (!q.pos) continue; rx2.beginPath(); rx2.ellipse(q.pos[0]*sxr, q.pos[1]*syr, Math.max(0.5,(q.radius||0)*sxr), Math.max(0.5,(q.radius||0)*syr), 0, 0, 6.2832); rx2.fill(); }
      rx2.lineCap='round'; rx2.lineJoin='round';
      for (const v of (td.valleys||[])) { const p=v.path||[]; for (let i=0;i<p.length-1;i++){ const a=p[i],b=p[i+1]; const ax=a.pos?a.pos[0]:a[0],ay=a.pos?a.pos[1]:a[1],bx=b.pos?b.pos[0]:b[0],by=b.pos?b.pos[1]:b[1]; rx2.lineWidth=Math.max(1.2,((a.width||300)+(b.width||300))/2*sxr); rx2.beginPath(); rx2.moveTo(ax*sxr,ay*syr); rx2.lineTo(bx*sxr,by*syr); rx2.stroke(); } }
      cx.drawImage(rc, 0, 0);
    }
    // 6. lake — wobble 폴리곤 (게임 호수 모양과 일치: 존-로컬 center 시드)
    cx.fillStyle = waterColor;
    for (const lake of (td.lakes||[])) { if (!lake.center) continue;
      const lcx=lake.center[0], lcy=lake.center[1];
      const rx=(lake.a!=null?lake.a:lake.rx!=null?lake.rx:lake.radius)||500, ry=(lake.b!=null?lake.b:lake.ry!=null?lake.ry:lake.radius)||500;
      const s=lcx*0.0131+lcy*0.0237; cx.beginPath();
      for (let k=0;k<=28;k++){ const tt=k/28*6.2832, ang=Math.atan2(ry*Math.sin(tt),rx*Math.cos(tt)), w=1+0.13*Math.sin(ang*3+s)+0.08*Math.sin(ang*5-s*1.7)+0.05*Math.sin(ang*7+s*0.6); const X=(lcx+rx*w*Math.cos(tt))*sxr, Y=(lcy+ry*w*Math.sin(tt))*syr; if(k===0)cx.moveTo(X,Y); else cx.lineTo(X,Y); }
      cx.closePath(); cx.fill(); }
    // 7. river stroke
    cx.strokeStyle=waterColor; cx.lineCap='round'; cx.lineJoin='round';
    for (const r of (td.rivers||[])) { const p=r.path||[]; for (let i=0;i<p.length-1;i++){ const a=p[i],b=p[i+1]; const ax=a.pos?a.pos[0]:a[0],ay=a.pos?a.pos[1]:a[1],bx=b.pos?b.pos[0]:b[0],by=b.pos?b.pos[1]:b[1]; cx.lineWidth=Math.max(1.2,((a.width||200)+(b.width||200))/2*sxr); cx.beginPath(); cx.moveTo(ax*sxr,ay*syr); cx.lineTo(bx*sxr,by*syr); cx.stroke(); } }
    // 7. grid line — cache 안에서 cell(32 world px)이 6 cache px 이상일 때만
    const cellCachePx = 32 * sxr;
    if (cellCachePx >= 6) {
      cx.strokeStyle = 'rgba(0,0,0,0.12)';
      cx.lineWidth = 1;
      cx.beginPath();
      for (let wx = 0; wx <= zw; wx += 32) {
        const px = Math.floor(wx * sxr) + 0.5;
        cx.moveTo(px, 0);
        cx.lineTo(px, ch);
      }
      for (let wy = 0; wy <= zh; wy += 32) {
        const py = Math.floor(wy * syr) + 0.5;
        cx.moveTo(0, py);
        cx.lineTo(cw, py);
      }
      cx.stroke();
    }
    return { level, canvas: c, cw, ch };
  }

  function getZoneCache(zid, zone, currentZoom) {
    const targetLevel = pickZoomLevel(currentZoom);
    const ex = zoneCacheMap.get(zid);
    if (ex && ex.level === targetLevel) return ex;
    const built = buildZoneCache(zid, zone, targetLevel);
    if (built) zoneCacheMap.set(zid, built);
    return built;
  }

  // ===== Phase 5-G perf: viewport-cache (zoom-in 시 cell-accurate water) =====
  // zoom >= 1.0에서 cell sample로 water 판정 — game collider (zone.js isWaterTileLocal)와 정확히 일치
  //   - 각 cell 중심점 (lx+16, ly+16) 기준 isWaterCellLocal 검사 → cell 전체 water/plain
  //   - 강 cell 단위 jagged border로 보이지만 실제 콜라이더와 같음
  // forest/mountain/ore는 vector primitive 그대로 (rect/arc — cell 단위 의미 없음)
  // drag 영역 벗어나면 lazy 재빌드 (~60ms in zoom=1.0, ~5ms in zoom=3.0)
  const ZOOM_VIEWPORT_THRESHOLD = 1.0;
  const VP_CACHE_MARGIN_FACTOR = 0.5; // 화면 절반만큼 양쪽 margin
  let vpCache = null; // { zoom, originX, originY, cw, ch, canvas }

  function invalidateVpCache() { vpCache = null; }

  function isVpCacheValid(currentZoom) {
    if (!vpCache || vpCache.zoom !== currentZoom) return false;
    // 현재 viewport world bounds
    const vpX0 = -panX / currentZoom;
    const vpX1 = (canvas.width - panX) / currentZoom;
    const vpY0 = -panY / currentZoom;
    const vpY1 = (canvas.height - panY) / currentZoom;
    // cache world bounds (canvas px 단위로 cache, zoom 같음)
    const cX0 = vpCache.originX;
    const cY0 = vpCache.originY;
    const cX1 = vpCache.originX + vpCache.cw / currentZoom;
    const cY1 = vpCache.originY + vpCache.ch / currentZoom;
    // inner safety margin (drag로 살짝 빠지면 일찌감치 재빌드)
    const innerM = (Math.min(canvas.width, canvas.height) * 0.1) / currentZoom;
    return (vpX0 >= cX0 + innerM && vpX1 <= cX1 - innerM
         && vpY0 >= cY0 + innerM && vpY1 <= cY1 - innerM);
  }

  function buildVpCache(currentZoom) {
    const zm = getZonesMeta();
    if (!zm) return;
    const Terrain = window.Terrain;
    const marginPx = Math.max(canvas.width, canvas.height) * VP_CACHE_MARGIN_FACTOR;
    const W = Math.ceil(canvas.width + marginPx * 2);
    const H = Math.ceil(canvas.height + marginPx * 2);
    let cnv;
    if (vpCache && vpCache.canvas.width === W && vpCache.canvas.height === H) {
      cnv = vpCache.canvas;
    } else {
      cnv = document.createElement('canvas');
      cnv.width = W; cnv.height = H;
    }
    const cx = cnv.getContext('2d');
    cx.fillStyle = '#0a0e14';
    cx.fillRect(0, 0, W, H);

    // cache origin = 현재 viewport center 기준 양쪽 margin 만큼 펼침
    // sub-pixel align: origin을 CELL_SIZE(32) 배수로 snap (cell grid 완벽 align)
    const vpCenterWX = (canvas.width / 2 - panX) / currentZoom;
    const vpCenterWY = (canvas.height / 2 - panY) / currentZoom;
    const cacheW_world = W / currentZoom;
    const cacheH_world = H / currentZoom;
    const originX = Math.floor((vpCenterWX - cacheW_world / 2) / CELL_SIZE) * CELL_SIZE;
    const originY = Math.floor((vpCenterWY - cacheH_world / 2) / CELL_SIZE) * CELL_SIZE;

    const cellPxSize = Math.max(1, Math.floor(CELL_SIZE * currentZoom));
    const drawGrid = cellPxSize >= 6;
    const waterColor = TILE_COLORS.water;

    for (const [zid, zone] of Object.entries(zm)) {
      const zox = zone.worldOffsetX || 0, zoy = zone.worldOffsetY || 0;
      const zw = zone.zoneWidth || 0, zh = zone.zoneHeight || 0;
      if (zw === 0) continue;
      // viewport 교집합
      const x1 = Math.max(zox, originX);
      const x2 = Math.min(zox + zw, originX + cacheW_world);
      const y1 = Math.max(zoy, originY);
      const y2 = Math.min(zoy + zh, originY + cacheH_world);
      if (x2 <= x1 || y2 <= y1) continue;
      // base ground — 정수 좌표 + 1 px overlap
      const bgX = Math.floor((x1 - originX) * currentZoom);
      const bgY = Math.floor((y1 - originY) * currentZoom);
      const bgW = Math.ceil((x2 - x1) * currentZoom) + 1;
      const bgH = Math.ceil((y2 - y1) * currentZoom) + 1;
      cx.fillStyle = zone.isOcean ? OCEAN_COLOR : (zone.groundColor || '#5a7c4a');
      cx.fillRect(bgX, bgY, bgW, bgH);
      if (zone.isOcean) continue;
      if (!Terrain) continue;
      const td = Terrain.ZONE_TERRAIN[zid];
      if (!td) continue;

      // viewport 영역 clip (zone 안의 vector primitive를 cache 좌표로 변환)
      cx.save();
      cx.beginPath();
      cx.rect(bgX, bgY, bgW, bgH);
      cx.clip();

      // 좌표 변환 헬퍼: world (zone-local) → cache px
      // wpx = zox + lx → cache px = (wpx - originX) * zoom
      const toX = wpx => (wpx - originX) * currentZoom;
      const toY = wpy => (wpy - originY) * currentZoom;

      // 1. forest rect
      if (td.forests && TILE_COLORS.forest) {
        cx.fillStyle = TILE_COLORS.forest;
        for (const f of td.forests) {
          if (!f.rect || (f.densityMult || 0) <= 1.5) continue;
          const [rx1,ry1,rx2,ry2] = f.rect;
          const wx1 = zox + rx1, wy1 = zoy + ry1;
          const wx2 = zox + rx2, wy2 = zoy + ry2;
          // viewport 밖 skip
          if (wx2 < x1 || wx1 > x2 || wy2 < y1 || wy1 > y2) continue;
          const px1 = toX(wx1), py1 = toY(wy1);
          const pw = Math.max(1, toX(wx2) - px1);
          const ph = Math.max(1, toY(wy2) - py1);
          cx.fillRect(px1, py1, pw, ph);
        }
      }
      // 2. mountain rect
      if (td.mountains && TILE_COLORS.mountain) {
        cx.fillStyle = TILE_COLORS.mountain;
        for (const m of td.mountains) {
          if (!m.rect || (m.stoneMult || 0) <= 1.5) continue;
          const [rx1,ry1,rx2,ry2] = m.rect;
          const wx1 = zox + rx1, wy1 = zoy + ry1;
          const wx2 = zox + rx2, wy2 = zoy + ry2;
          if (wx2 < x1 || wx1 > x2 || wy2 < y1 || wy1 > y2) continue;
          const px1 = toX(wx1), py1 = toY(wy1);
          const pw = Math.max(1, toX(wx2) - px1);
          const ph = Math.max(1, toY(wy2) - py1);
          cx.fillRect(px1, py1, pw, ph);
        }
      }
      // 3. ore arc
      if (td.ores && TILE_COLORS.ore) {
        cx.fillStyle = TILE_COLORS.ore;
        for (const o of td.ores) {
          if (!o.center) continue;
          const wcx = zox + o.center[0], wcy = zoy + o.center[1];
          const wr = o.radius || 0;
          if (wcx + wr < x1 || wcx - wr > x2 || wcy + wr < y1 || wcy - wr > y2) continue;
          const r = Math.max(0.5, wr * currentZoom);
          cx.beginPath();
          cx.arc(toX(wcx), toY(wcy), r, 0, Math.PI*2);
          cx.fill();
        }
      }
      // 4+5. water cell sample (cell-accurate — game collider isWaterTileLocal와 정확히 일치)
      //   - 각 cell의 중심점 (lx+16, ly+16) 기준 isWaterCellLocal 검사
      //   - water면 fillRect — cell 32 world px 단위 사각형
      const hasWater = (td.rivers && td.rivers.length > 0) || (td.lakes && td.lakes.length > 0);
      const hasRock = td.ridges && td.ridges.length > 0; // Phase 5-H: 산맥
      if ((hasWater || hasRock) && Terrain.isWaterCellLocal) {
        // viewport 안 cell 범위 (32 배수로 align)
        const csx0 = Math.floor(x1 / CELL_SIZE) * CELL_SIZE;
        const csy0 = Math.floor(y1 / CELL_SIZE) * CELL_SIZE;
        for (let wy = csy0; wy < y2; wy += CELL_SIZE) {
          const ly = wy - zoy;
          if (ly < 0 || ly >= zh) continue;
          const startPy = Math.floor((wy - originY) * currentZoom);
          const nextPy = Math.floor((wy + CELL_SIZE - originY) * currentZoom);
          const cellH = nextPy - startPy;
          for (let wx = csx0; wx < x2; wx += CELL_SIZE) {
            const lx = wx - zox;
            if (lx < 0 || lx >= zw) continue;
            // game collider와 동일: cell 중심점 (lx+16, ly+16) 기준. 물 > 바위 우선.
            let col = null;
            if (hasWater && Terrain.isWaterCellLocal(zid, lx + 16, ly + 16)) col = waterColor;
            else if (hasRock && Terrain.isRockCellLocal && Terrain.isRockCellLocal(zid, lx + 16, ly + 16)) col = TILE_COLORS.rock;
            if (!col) continue;
            cx.fillStyle = col;
            const startPx = Math.floor((wx - originX) * currentZoom);
            const nextPx = Math.floor((wx + CELL_SIZE - originX) * currentZoom);
            cx.fillRect(startPx, startPy, nextPx - startPx, cellH);
          }
        }
      }
      // 6. grid line overlay (모든 cell — plain 포함, cell border 표시)
      if (drawGrid) {
        cx.strokeStyle = 'rgba(0,0,0,0.12)';
        cx.lineWidth = 1;
        cx.beginPath();
        const sx0 = Math.floor(x1 / CELL_SIZE) * CELL_SIZE;
        const sy0 = Math.floor(y1 / CELL_SIZE) * CELL_SIZE;
        for (let wx = sx0; wx <= x2; wx += CELL_SIZE) {
          const px = Math.floor((wx - originX) * currentZoom) + 0.5;
          cx.moveTo(px, bgY);
          cx.lineTo(px, bgY + bgH);
        }
        for (let wy = sy0; wy <= y2; wy += CELL_SIZE) {
          const py = Math.floor((wy - originY) * currentZoom) + 0.5;
          cx.moveTo(bgX, py);
          cx.lineTo(bgX + bgW, py);
        }
        cx.stroke();
      }
      cx.restore();
    }
    // Phase 5-G debug: wall 위치 표시 (top-down red line, cell border 검증)
    if (typeof window.__getAllWalls === 'function') {
      const walls = window.__getAllWalls();
      cx.strokeStyle = '#ff3344';
      cx.lineWidth = 2;
      cx.beginPath();
      for (const w of walls) {
        // wall N: cell의 위쪽 변 → world (w.wx, w.wy) ~ (w.wx+32, w.wy)
        // wall E: cell의 오른쪽 변 → world (w.wx+32, w.wy) ~ (w.wx+32, w.wy+32)
        if (w.side === 'N') {
          const x0 = (w.wx - originX) * currentZoom;
          const x1 = (w.wx + 32 - originX) * currentZoom;
          const y0 = (w.wy - originY) * currentZoom;
          if (x1 < 0 || x0 > cnv.width || y0 < 0 || y0 > cnv.height) continue;
          cx.moveTo(x0, y0);
          cx.lineTo(x1, y0);
        } else if (w.side === 'E') {
          const x0 = (w.wx + 32 - originX) * currentZoom;
          const y0 = (w.wy - originY) * currentZoom;
          const y1 = (w.wy + 32 - originY) * currentZoom;
          if (x0 < 0 || x0 > cnv.width || y1 < 0 || y0 > cnv.height) continue;
          cx.moveTo(x0, y0);
          cx.lineTo(x0, y1);
        }
      }
      cx.stroke();
    }
    vpCache = { zoom: currentZoom, originX, originY, cw: W, ch: H, canvas: cnv };
  }

  function resize() {
    // viewport center 보존 — resize 후에도 같은 world point가 화면 중앙에 오도록
    const oldW = canvas.width, oldH = canvas.height;
    const oldCenterWX = oldW > 0 ? (oldW / 2 - panX) / zoom : 0;
    const oldCenterWY = oldH > 0 ? (oldH / 2 - panY) / zoom : 0;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
    if (oldW > 0 && oldH > 0) {
      panX = Math.round(canvas.width / 2 - oldCenterWX * zoom);
      panY = Math.round(canvas.height / 2 - oldCenterWY * zoom);
    }
    vpCache = null; // viewport 크기 변경 → cache 재빌드
    needsRedraw = true;
  }

  function show() {
    panel.classList.remove('hidden');
    visible = true;
    setTimeout(() => { resize(); fitAll(); }, 30);
    requestAnimationFrame(draw);
  }
  function hide() {
    panel.classList.add('hidden');
    visible = false;
  }
  function toggle() { if (visible) hide(); else show(); }
  window.bigMap = { show, hide, toggle };

  function getZonesMeta() {
    return (typeof window.__getZonesMeta === 'function') ? window.__getZonesMeta() : null;
  }
  function getMyAbs() {
    return (typeof window.__getMyAbs === 'function') ? window.__getMyAbs() : null;
  }

  function fitAll() {
    const zm = getZonesMeta();
    if (!zm) return;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const z of Object.values(zm)) {
      const ox = z.worldOffsetX || 0, oy = z.worldOffsetY || 0;
      const zw = z.zoneWidth || 0, zh = z.zoneHeight || 0;
      if (zw === 0) continue;
      minX = Math.min(minX, ox);
      minY = Math.min(minY, oy);
      maxX = Math.max(maxX, ox + zw);
      maxY = Math.max(maxY, oy + zh);
    }
    if (minX === Infinity) return;
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    zoom = snapZoom(Math.min(canvas.width / worldW, canvas.height / worldH) * 0.92);
    panX = Math.round((canvas.width - worldW * zoom) / 2 - minX * zoom);
    panY = Math.round((canvas.height - worldH * zoom) / 2 - minY * zoom);
    needsRedraw = true;
  }

  function centerOnMe() {
    const me = getMyAbs();
    if (!me) return;
    panX = Math.round(canvas.width / 2 - me.x * zoom);
    panY = Math.round(canvas.height / 2 - me.y * zoom);
    needsRedraw = true;
  }

  function draw() {
    if (!visible) return;
    if (needsRedraw) {
      const _rT0 = performance.now();
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const zm = getZonesMeta();
      if (zm) {
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;

        if (zoom >= ZOOM_VIEWPORT_THRESHOLD) {
          // === zoom-in: viewport-cache (cell-level sample) ===
          if (!isVpCacheValid(zoom)) buildVpCache(zoom);
          if (vpCache) {
            ctx.drawImage(
              vpCache.canvas,
              vpCache.originX * zoom + panX,
              vpCache.originY * zoom + panY,
              vpCache.cw, vpCache.ch
            );
          }
        } else {
          // === zoom-out: per-zone LOD cache (vector primitives) ===
          const marginPx = Math.max(canvas.width, canvas.height) * 0.25;
          const viewMinX = (-panX - marginPx) / zoom;
          const viewMaxX = (canvas.width - panX + marginPx) / zoom;
          const viewMinY = (-panY - marginPx) / zoom;
          const viewMaxY = (canvas.height - panY + marginPx) / zoom;
          for (const [zid, z] of Object.entries(zm)) {
            const zox = z.worldOffsetX || 0, zoy = z.worldOffsetY || 0;
            const zw = z.zoneWidth || 0, zh = z.zoneHeight || 0;
            if (zw === 0) continue;
            if (zox + zw < viewMinX || zox > viewMaxX) continue;
            if (zoy + zh < viewMinY || zoy > viewMaxY) continue;
            if (z.isOcean) {
              ctx.fillStyle = OCEAN_COLOR;
              ctx.fillRect(zox * zoom + panX, zoy * zoom + panY, zw * zoom, zh * zoom);
              continue;
            }
            const cache = getZoneCache(zid, z, zoom);
            if (!cache) continue;
            const destW = zw * zoom;
            // cache가 dest보다 크면 압축 → bilinear smoothing (nearest는 정보 손실로 강 사라짐)
            // cache가 dest보다 작으면 확대 → nearest (cell 픽셀 그리드 살리기)
            ctx.imageSmoothingEnabled = destW < cache.cw * 0.95;
            ctx.drawImage(
              cache.canvas,
              0, 0, cache.cw, cache.ch,
              zox * zoom + panX, zoy * zoom + panY,
              destW, zh * zoom
            );
            ctx.imageSmoothingEnabled = false;
          }
        }
        ctx.imageSmoothingEnabled = prevSmooth;

        // zone 경계
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        for (const z of Object.values(zm)) {
          const ox = z.worldOffsetX || 0, oy = z.worldOffsetY || 0;
          const zw = z.zoneWidth || 0, zh = z.zoneHeight || 0;
          if (zw === 0) continue;
          ctx.strokeRect(ox * zoom + panX, oy * zoom + panY, zw * zoom, zh * zoom);
        }

        // zone 이름 (zoom 클 때만)
        if (zoom > 0.005) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          for (const [zid, z] of Object.entries(zm)) {
            const ox = z.worldOffsetX || 0, oy = z.worldOffsetY || 0;
            const zw = z.zoneWidth || 0, zh = z.zoneHeight || 0;
            const cx = (ox + zw / 2) * zoom + panX;
            const cy = (oy + zh / 2) * zoom + panY;
            if (cx < 0 || cx > canvas.width) continue;
            const name = z.displayName || zid;
            ctx.fillText(name, cx, cy);
          }
        }

        // Phase 5-C-client: 마을 emoji + 이름
        const VILLAGE_ICON = {
          riverside: '🌊', mining: '⛏️', mountain: '⛰️', forest: '🌲', plain: '🏘️',
        };
        if (zoom > 0.003) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (const [zid, z] of Object.entries(zm)) {
            if (!z.villages || z.villages.length === 0) continue;
            const ox = z.worldOffsetX || 0, oy = z.worldOffsetY || 0;
            for (const v of z.villages) {
              const dx = (ox + v.x) * zoom + panX;
              const dy = (oy + v.y) * zoom + panY;
              if (dx < -20 || dx > canvas.width + 20 || dy < -20 || dy > canvas.height + 20) continue;
              const icon = VILLAGE_ICON[v.type] || '🏘️';
              ctx.font = (zoom > 0.015 ? '14px' : '10px') + ' sans-serif';
              ctx.fillText(icon, dx, dy);
              if (zoom > 0.015) {
                ctx.fillStyle = 'rgba(255,255,200,0.85)';
                ctx.font = '10px sans-serif';
                ctx.fillText(v.name, dx, dy + 12);
              }
            }
          }
        }
      }

      // 본인 위치
      const me = getMyAbs();
      if (me && typeof me.x === 'number') {
        const mx = me.x * zoom + panX;
        const my = me.y * zoom + panY;
        ctx.fillStyle = '#ff3344';
        ctx.beginPath();
        ctx.arc(mx, my, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (zoomLabel) zoomLabel.textContent = (zoom * 100).toFixed(2) + '%';
      { const _rd = performance.now() - _rT0; window._rAcc = (window._rAcc||0)+_rd; window._rN = (window._rN||0)+1; if (_rd > (window._rMax||0)) window._rMax = _rd;
        if (window._rN >= 30) { if (window._renderDbg) { let _bn=0; for (const c of conns.values()) _bn += c.buildings.size;
          console.log(`[minimap] avg=${(window._rAcc/window._rN).toFixed(1)}ms max=${window._rMax.toFixed(0)}ms bld=${_bn}`); } window._rAcc=0; window._rN=0; window._rMax=0; } }
      needsRedraw = false;
    }
    if (visible) requestAnimationFrame(draw);
  }

  // 휠 zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - panX) / zoom;
    const wy = (my - panY) / zoom;
    const factor = e.deltaY > 0 ? 0.82 : 1.22;
    const rawZoom = Math.max(0.0005, Math.min(3.0, zoom * factor));
    let newZoom = snapZoom(rawZoom);
    // snap 결과가 현재와 같으면 (cellPx 1, 2 등 작은 값에서 흔함) cellPx ±1 step
    if (newZoom === zoom) {
      const curCellPx = zoom * CELL_SIZE;
      if (curCellPx >= 1) {
        const curInt = Math.round(curCellPx);
        const target = e.deltaY > 0 ? curInt - 1 : curInt + 1;
        if (target >= 1) {
          newZoom = Math.min(3.0, target / CELL_SIZE);
        } else {
          // cellPx 1 미만으로 내려가면 sub-cell zoom (snap 해제)
          newZoom = Math.max(0.0005, zoom * factor);
        }
      }
    }
    if (newZoom !== zoom) {
      zoom = newZoom;
      panX = Math.round(mx - wx * zoom);
      panY = Math.round(my - wy * zoom);
      needsRedraw = true;
    }
  }, { passive: false });

  // 드래그 pan
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanX = panX; dragPanY = panY;
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
      panX = dragPanX + (e.clientX - dragStartX);
      panY = dragPanY + (e.clientY - dragStartY);
      needsRedraw = true;
    }
    const rect = canvas.getBoundingClientRect();
    const wx = Math.round((e.clientX - rect.left - panX) / zoom);
    const wy = Math.round((e.clientY - rect.top - panY) / zoom);
    if (coordLabel) coordLabel.textContent = `(${wx},${wy})`;
  });
  canvas.addEventListener('mouseup', () => { dragging = false; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('mouseleave', () => { dragging = false; canvas.style.cursor = 'grab'; });

  // Phase 5-G debug: 더블클릭 텔레포트 (같은 zone 내만)
  canvas.addEventListener('dblclick', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = Math.round((mx - panX) / zoom);
    const wy = Math.round((my - panY) / zoom);
    // 어느 zone인지 찾기
    const zm = getZonesMeta();
    if (!zm) return;
    let targetZone = null;
    for (const [zid, z] of Object.entries(zm)) {
      const zox = z.worldOffsetX || 0, zoy = z.worldOffsetY || 0;
      const zw = z.zoneWidth || 0, zh = z.zoneHeight || 0;
      if (wx >= zox && wx < zox + zw && wy >= zoy && wy < zoy + zh) {
        if (z.isOcean) {
          alert('🌊 바다는 텔레포트 불가');
          return;
        }
        targetZone = zid;
        break;
      }
    }
    if (!targetZone) {
      alert('zone 밖 좌표입니다');
      return;
    }
    const myZone = typeof window.__getPrimaryZoneId === 'function' ? window.__getPrimaryZoneId() : null;
    if (targetZone !== myZone) {
      alert(`다른 zone (${targetZone}) 텔레포트는 핸드오프 필요 — 일단 같은 zone만 지원`);
      return;
    }
    // 서버에 텔레포트 요청 (zone-local 좌표)
    const zone = zm[targetZone];
    const localX = wx - (zone.worldOffsetX || 0);
    const localY = wy - (zone.worldOffsetY || 0);
    if (typeof window.__sendPrimary === 'function') {
      window.__sendPrimary({ type: 'teleport_debug', x: localX, y: localY });
      console.log(`[teleport] -> ${targetZone} local(${localX},${localY})`);
    }
  });

  // 버튼
  closeBtn?.addEventListener('click', hide);
  fitBtn?.addEventListener('click', () => { fitAll(); });
  meBtn?.addEventListener('click', () => { zoom = snapZoom(0.5); centerOnMe(); needsRedraw = true; });

  // resize
  window.addEventListener('resize', () => { if (visible) resize(); });

  // Esc 닫기 (M 키 토글은 기존 input handler에서 — line 846)
  window.addEventListener('keydown', (e) => {
    if (visible && e.key === 'Escape') { e.preventDefault(); hide(); }
  }, true);
})();
