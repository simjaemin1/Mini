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
      _waterCellCache.clear();
      _rockCellCache.clear();
      if (typeof window.__invalidateMinimapCache === 'function') window.__invalidateMinimapCache();
      console.log('[terrain] 전체 hardcoded 선로딩:', Object.keys(all).join(','));
    } catch (e) { console.warn('[terrain] preload 실패:', e.message); }
  })();
  function precomputeAllWaterTiles() {
    const TS = 32;
    _waterCellCache.clear(); // zonesMeta 갱신 — 셀 단위 캐시 무효화
    _rockCellCache.clear();
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
  const TEX_WALL_URL = 'data:image/png;base64,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';
  const TEX_THATCH_URL = 'data:image/png;base64,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';
  const TEX_EARTH_URL = 'data:image/png;base64,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';
  let _hutRoofC = null, _tileYardC = null, _tilePlazaC = null, _tileHutC = null, _wallNC = null, _wallEC = null;
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
  // === 14.49-e6-b: BFS room flood fill — RimWorld식 정확한 indoor 판정 ===
  // 1) clWallCellMap: 모든 wall edge 위치 O(1) lookup (절대 cell + side + floor)
  // 2) cellRoomCache: 셀 → roomData (한 영역의 모든 cell이 같은 roomData 공유)
  //    roomData = { id, cells: Set, isIndoor }
  // BFS는 영역 단위 1번. 같은 영역의 모든 cell이 같이 cache됨.
  // wall 변경 broadcast 시 양옆 cell BFS 즉시 재계산 (eager invalidate).
  // 이 결과는 wall cutaway에만 사용. 시야와는 무관.
  const clWallCellMap = new Map(); // "cx_cy_side_floor" → true (절대 cell)
  const cellRoomCache = new Map(); // "cx_cy_floor" → roomData
  const clFloorCellMap = new Map(); // "cx_cy_floor" → true (위층 BFS cutaway용)
  const clFenceCellMap = new Map(); // "cx_cy_floor" → true (fence cell — clHasFenceAt O(1)용)
  const clMaxFloorMap = new Map(); // "cx_cy" → max floor (가장 위쪽 floor tile)
  let nextRoomId = 1;
  let clWallMapBuiltAt = 0;
  const ROOM_INDOOR_MAX = 200; // BFS 200 cell 이내에 escape 못 하면 indoor. 200 cell 넘으면 outdoor.

  function clRebuildWallCellMap() {
    clWallCellMap.clear();
    cellRoomCache.clear(); // wall 다 다시 → room도 다시
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
  // BFS from (cx, cy): 영역 fill. 200 cell 미만이면 indoor, 넘으면 outdoor.
  // 같은 영역의 모든 cell이 같은 roomData 공유.
  function computeRoom(cx, cy, floor) {
    ensureWallMap();
    const visited = new Set();
    const queue = [[cx, cy]];
    const startKey = `${cx}_${cy}_${floor}`;
    visited.add(`${cx}_${cy}`);
    let capped = false;
    while (queue.length > 0) {
      if (visited.size >= ROOM_INDOOR_MAX) { capped = true; break; }
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        if (clHasWallBetween(x, y, dx, dy, floor)) continue;
        const nx = x + dx, ny = y + dy;
        const k = `${nx}_${ny}`;
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push([nx, ny]);
      }
    }
    const room = {
      id: nextRoomId++,
      cells: visited,
      isIndoor: !capped, // BFS가 cap 안 닿고 끝났으면 enclosed = indoor
    };
    // 영역 안의 모든 cell에 같은 roomData 박음
    for (const k of visited) {
      cellRoomCache.set(`${k}_${floor}`, room);
    }
    return room;
  }
  function isCellIndoor(cx, cy, floor) {
    ensureWallMap();
    const key = `${cx}_${cy}_${floor}`;
    const cached = cellRoomCache.get(key);
    if (cached) return cached.isIndoor;
    const room = computeRoom(cx, cy, floor);
    return room.isIndoor;
  }
  function playerIsIndoors() {
    const cx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
    const cy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    return isCellIndoor(cx, cy, myFloor);
  }
  // Eager invalidate: 양옆 cell이 속한 room 전체 invalidate + 즉시 BFS 다시.
  function invalidateRoomsAroundWall(absCx, absCy, side, floor) {
    // wall side='N' on (cx,cy) → 양옆 cell = (cx, cy)와 (cx, cy-1)
    // wall side='E' on (cx,cy) → 양옆 cell = (cx, cy)와 (cx+1, cy)
    const pairs = side === 'E'
      ? [[absCx, absCy], [absCx + 1, absCy]]
      : [[absCx, absCy], [absCx, absCy - 1]];
    const roomsToInvalidate = new Set();
    for (const [cx, cy] of pairs) {
      const r = cellRoomCache.get(`${cx}_${cy}_${floor}`);
      if (r) roomsToInvalidate.add(r);
    }
    for (const r of roomsToInvalidate) {
      for (const k of r.cells) cellRoomCache.delete(`${k}_${floor}`);
    }
    // 새로 BFS — 양옆 cell 둘 다 (같은 room이면 두 번째는 cache hit으로 skip됨)
    for (const [cx, cy] of pairs) {
      computeRoom(cx, cy, floor);
    }
  }
  window.playerIsIndoors = playerIsIndoors;
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
      rooms: new Set([...cellRoomCache.values()]).size,
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
                    : (_sp === 'kiln_site' ? 'kiln_start' : (_sp === 'psite' ? 'request_village_house' : 'build_guild_granary')));
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
                && b.type !== 'kiln_site' && b.type !== 'charcoal_kiln') continue;
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
        for (const m of (msg.mobs || [])) c.mobs.set(m.mid, m);
        for (const gi of (msg.groundItems || [])) c.groundItems.set(gi.id, gi);
        // §4-4 Stage 4A: 마을 시뮬 영토(경계 셀 or 반경 근사) — welcome 1회, 이후 sim_village_day가 pop만 갱신
        c.simVillages = (msg.simVillages && msg.simVillages.length) ? msg.simVillages : null;
        // §11 도적: 소굴·야영 마커(welcome 1회, 이후 bandit_camps가 변경분 방송)
        c.banditCamps = (msg.banditCamps && msg.banditCamps.length) ? msg.banditCamps : null;
        // §16 답압 길: 등급 셀 flat [cx,cy,lv,...](welcome 1회, 이후 road_cells가 변경분 방송)
        c.roads = new Map();
        if (msg.roads) for (let i = 0; i < msg.roads.length; i += 3) c.roads.set(msg.roads[i] + ',' + msg.roads[i + 1], msg.roads[i + 2]);
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
    } else if (msg.type === 'bandit_camps') {
      // §11 도적: 소굴·야영 마커 갱신(서버가 변경 시에만 방송)
      c.banditCamps = (msg.camps && msg.camps.length) ? msg.camps : null;
    } else if (msg.type === 'road_cells') {
      // §16 답압 길: 게임일 1회 변경분(등급 전이 셀만) — lv 0=풀 복귀(삭제)
      if (!c.roads) c.roads = new Map();
      const rc = msg.cells || [];
      for (let i = 0; i < rc.length; i += 3) { const k = rc[i] + ',' + rc[i + 1]; if (rc[i + 2]) c.roads.set(k, rc[i + 2]); else c.roads.delete(k); }
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
        // 14.49-e6-b: wall 위치 cache에 즉시 추가 + 양옆 room invalidate + 즉시 BFS
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
          invalidateRoomsAroundWall(absCx, absCy, side, f);
        }
      }
    } else if (msg.type === 'building_removed') {
      const b = c.buildings.get(msg.id);
      if (b?.type === 'stair') clStairCacheBuildAt = 0;
      if (b?.type === 'wall') {
        // 14.49-e6-b: wall 위치 cache에서 즉시 제거 + 양옆 room invalidate + 즉시 BFS
        const side = b.data?.side;
        if (side) {
          const zm = c.meta || zonesMeta[primaryZoneId];
          const ox = Math.floor((zm?.worldOffsetX || 0) / CL_BUILDING_SIZE);
          const oy = Math.floor((zm?.worldOffsetY || 0) / CL_BUILDING_SIZE);
          const absCx = ox + Math.floor(b.x / CL_BUILDING_SIZE);
          const absCy = oy + Math.floor(b.y / CL_BUILDING_SIZE);
          const f = b.floor || 0;
          clWallCellMap.delete(`${absCx}_${absCy}_${side}_${f}`);
          invalidateRoomsAroundWall(absCx, absCy, side, f);
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
        console.log(`[render] avg=${(window._gAcc/window._gN).toFixed(1)}ms tiles=${((window._tileAcc||0)/window._gN).toFixed(1)}ms max=${window._gMax.toFixed(0)}ms bld=${_bn}`); } window._gAcc=0; window._gN=0; window._gMax=0; window._tileAcc=0; } }
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
    for (let wx = t0WX; wx < t1WX; wx += TS) {
      for (let wy = t0WY; wy < t1WY; wy += TS) {
        const cxw = wx + _halfTS, cyw = wy + _halfTS;
        const dist = Math.hypot(cxw - worldCx, cyw - worldCy);
        if (dist > TILE_RENDER_RADIUS) continue;   // 원형 컬링 — zone 조회/그리기 전에 모서리 스킵
        const iso = w2i(cxw, cyw);
        const s = toScreen(iso.x, iso.y);
        // 어떤 zone에 속하는지 (hoisted 배열 재사용)
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
        const isWater = isWaterAtAbs(cxw, cyw, zMeta);   // zone 힌트 전달 — 중복 clientFindZoneAt 제거
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
        // 틴트를 미리 합성 → drawDiamond 1회 (캔버스 fill 2→1, visibility 항상 1).
        drawDiamond(s.x, s.y, TS, blendTint(tileColor, tintColor, tintStrength));
      }
    }

    window._tileAcc = (window._tileAcc||0) + (performance.now() - _tlT0);
    // === 2) 엔티티 수집 (depth sort용) ===
    const renderables = [];
    const renderT = performance.now() - INTERP_DELAY_MS;

    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      for (const r of c.resources.values()) {
        const ax = ox + r.x, ay = oy + r.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        renderables.push({ z: iso.y, kind: 'resource', r, iso, ax, ay });
      }
      // Phase 14.23: ground item 렌더
      if (c.groundItems) {
        for (const gi of c.groundItems.values()) {
          const ax = ox + gi.x, ay = oy + gi.y;
          if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
          const iso = w2i(ax, ay);
          renderables.push({ z: iso.y + 5, kind: 'ground_item', gi, iso, ax, ay });
        }
      }
      for (const cl of c.claims.values()) {
        // guild claim은 가장 배경(z 가장 작게)으로 — 너무 많아서 다른 거 가리지 않게
        const cax = ox + cl.x + cl.w/2, cay = oy + cl.y + cl.h/2;
        if (Math.abs(cax - worldCx) > VIEW_RADIUS + 200 || Math.abs(cay - worldCy) > VIEW_RADIUS + 200) continue;
        const baseZ = cl.kind === 'guild' ? -800 : -400;
        renderables.push({ z: w2i(cax, cay).y + baseZ, kind: 'claim', cl, off: ox, offY: oy });
      }
      // §16 답압 길: 등급 셀 바닥 틴트(베이크 무접촉 오버레이 — 흙길/다져진 길). 시야 내만 push.
      if (c.roads && c.roads.size) {
        for (const [rk, lv] of c.roads) {
          const ci = rk.indexOf(','); const rcx = +rk.slice(0, ci), rcy = +rk.slice(ci + 1);
          const rax = ox + rcx * CL_BUILDING_SIZE + 16, ray = oy + rcy * CL_BUILDING_SIZE + 16;
          if (Math.abs(rax - worldCx) > VIEW_RADIUS || Math.abs(ray - worldCy) > VIEW_RADIUS) continue;
          renderables.push({ z: w2i(rax, ray).y - 950, kind: 'road', rcx: rax - 16, rcy: ray - 16, lv });
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
          renderables.push({ z: w2i(bax, bay).y - 930, kind: 'bridge', bx: bax, by: bay, bk, bs });
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
          renderables.push({ z: w2i(dax, day2).y - 940, kind: 'ditch', bx: dax, by: day2, ds });
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
          renderables.push({ z: w2i(gax, gay).y, kind: 'granpile', gx: gax, gy: gay, st });
          // ★[곳간 연출 세분화] 벽에 기대 놓은 소품(멍석 말이·삼태기) — 사다리 옆 칸(발자국 남동 모서리 밖).
          //   재고가 있는 곳간에만(=사람이 드나드는 곳간) 놓아 '쓰이는 창고'로 읽히게 한다.
          const pax = ox + (gc0 + 2) * CL_BUILDING_SIZE + 16, pay = gay;
          renderables.push({ z: w2i(pax, pay).y, kind: 'granpile', gx: pax, gy: pay, prop: 1 });
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
            renderables.push({ z: w2i(_mx, _my).y, kind: 'cellprop', key: _mk, gx: _mx, gy: _my });
          }
        }
      }
      // §4-4 Stage 4A: 마을 시뮬 영토 — 경계 셀(b: [dx,dy,mask...]) 반투명 렌더. claim보다 더 배경(-900).
      if (c.simVillages) {
        for (const v of c.simVillages) {
          const vcx = ox + v.cx * CL_BUILDING_SIZE + 16, vcy = oy + v.cy * CL_BUILDING_SIZE + 16;
          const cullR = (v.r || 1200);
          if (Math.abs(vcx - worldCx) > VIEW_RADIUS + cullR || Math.abs(vcy - worldCy) > VIEW_RADIUS + cullR) continue;
          renderables.push({ z: w2i(vcx, vcy).y - 900, kind: 'simvil', v, off: ox, offY: oy });
        }
      }
      // §11 도적: 소굴·야영 마커 1종(서버 bandit_camps) — 점유 단은 진하게, 빈 소굴은 흐리게
      if (c.banditCamps) {
        for (const bc of c.banditCamps) {
          const bx = ox + bc.x, by = oy + bc.y;
          if (Math.abs(bx - worldCx) > VIEW_RADIUS + 200 || Math.abs(by - worldCy) > VIEW_RADIUS + 200) continue;
          renderables.push({ z: w2i(bx, by).y - 300, kind: 'banditcamp', bc, off: ox, offY: oy });
        }
      }
      const _hutRs = [], _hutSeen = new Set();   // ★[침대 진입] 이번 프레임 움집 렉트+지붕 표시 여부 — 실내 NPC 가림 판정(others 루프 소비)
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
                renderables.push({ z: (rax + ray) * 0.5 + 40, kind: 'hutroof', img: _granI, iso: _giso });
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
          const _mbx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE), _mby = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
          const _binside = (myFloor || 0) === 0 && ((_mbx >= _bld2[0] && _mbx <= _bld2[2] && _mby >= _bld2[1] && _mby <= _bld2[3])
            || (_mby === _bld2[3] + 1 && (_mbx === _bld2[0] + 3 || _mbx === _bld2[0] + 4)));
          { const _hk = 'B' + _bld2[0] + ',' + _bld2[1]; if (!_hutSeen.has(_hk)) { _hutSeen.add(_hk); _hutRs.push({ r: _bld2, roofOn: !_binside }); } }   // 실내 NPC 가림(움집과 동일 규칙)
          if (!_binside) {
            const _fbx = Math.floor(b.x / CL_BUILDING_SIZE), _fby = Math.floor(b.y / CL_BUILDING_SIZE);
            if (_fbx === _bld2[0] + 3 && _fby === _bld2[3]) {
              const rax = ox + b.x, ray = oy + b.y;
              if (Math.abs(rax - worldCx) <= VIEW_RADIUS + 300 && Math.abs(ray - worldCy) <= VIEW_RADIUS + 300) {
                const _riso = w2i(rax - 128, ray - 256);   // 원점=북서(x0-0.5,y0-0.5): 캐리어(x0+3,y1)에서 (-4,-8)셀
                renderables.push({ z: (rax + ray) * 0.5 + 80, kind: 'hutroof', img: _hallI, iso: _riso });   // ★벽 4면 상회: 8×8은 남벽 동단·동벽 남단=캐리어+72 — +80으로 전부 상회(움집 +64 논리 동형)
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
              renderables.push({ z: w2i(_px2, _py2).y, kind: 'cellprop', key: _pk, gx: _px2, gy: _py2 });
            }
          }
        }
        if (_hut && b.type === 'floor') {
          const _mcx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE), _mcy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
          const _inside = (myFloor || 0) === 0 && ((_mcx >= _hut[0] && _mcx <= _hut[2] && _mcy >= _hut[1] && _mcy <= _hut[3])
            || (_mcy === _hut[3] + 1 && (_mcx === _hut[0] + 2 || _mcx === _hut[0] + 3)));   // ★문 앞 1셀에서도 개방(열린 문으로 내부 엿보기 — PZ 관례)
          { const _hk = _hut[0] + ',' + _hut[1]; if (!_hutSeen.has(_hk)) { _hutSeen.add(_hk); _hutRs.push({ r: _hut, roofOn: !_inside }); } }   // ★[침대 진입] 렉트+지붕 여부 수집(움집당 1회)
          if (!_inside) {
            const _fcx = Math.floor(b.x / CL_BUILDING_SIZE), _fcy = Math.floor(b.y / CL_BUILDING_SIZE);
            if (_fcx === _hut[0] + 2 && _fcy === _hut[3]) {   // 캐리어=남행 문 좌측 바닥 1셀(움집당 정확 1회)
              const rax = ox + b.x, ray = oy + b.y;
              if (Math.abs(rax - worldCx) <= VIEW_RADIUS + 200 && Math.abs(ray - worldCy) <= VIEW_RADIUS + 200) {
                const _riso = w2i(rax - 96, ray - 128);       // 지붕 로컬 원점 = 북서 오버행 모서리(캐리어 중심 - (3,4)셀)
                renderables.push({ z: (rax + ray) * 0.5 + 64, kind: 'hutroof', img: _hutI, iso: _riso });   // ★지붕은 자기 집 벽 4면보다 무조건 앞[사용자 지적]: 벽 z 최대=남벽 동단·동벽 남단 (캐리어+56) — +24는 SE 구간 벽이 처마를 덮었음. +64로 전부 상회. 남측 개체는 지붕이 64px 떠 있어 픽셀 비겹침(플레이어는 +500 별도)이라 안전
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
              kind: 'stair_cell', b, iso, ax: cAx, ay: cAy, cellN, dv,
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
        renderables.push({ z: _bz, kind: 'building', b, iso, ax, ay });
      }
      for (const m of c.mobs.values()) {
        const pos = sampleAt(m.buf, renderT, m.x, m.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        // 14.49-d: mob도 floor*FLOOR_HEIGHT + z 적용 (계단 위 추격 시 위로 솟음)
        const mFloor = m.floor || 0;
        const mZ = mFloor * FLOOR_HEIGHT + (m.z || 0);
        const iso = w2i(ax, ay, mZ);
        renderables.push({ z: iso.y, kind: 'mob', m, iso, ax, ay });
      }
      // Phase 5-7: 사체
      for (const co of c.corpses.values()) {
        const ax = ox + co.x, ay = oy + co.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay, 0);
        renderables.push({ z: iso.y, kind: 'corpse', co, iso, ax, ay });
      }
      for (const o of c.others.values()) {
        const pos = sampleAt(o.buf, renderT, o.x, o.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        // ★[침대 진입 — PZ 동형] 움집 실내 NPC(취침·요양)는 그 집 지붕이 그려져 있으면(뷰어가 밖) 숨김 —
        //   플레이어 z(+500)가 지붕 z(캐리어+64)를 항상 이겨 '지붕 위에 누워 자는' 그림이 되기 때문. 들어가면(컷어웨이) 보인다.
        if ((o.floor || 0) === 0 && _hutRs.length) {
          const _ncx = Math.floor(ax / CL_BUILDING_SIZE), _ncy = Math.floor(ay / CL_BUILDING_SIZE);
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
        renderables.push({ z: (ax + ay) * 0.5 + oFloor * 0.5 + 500, kind: 'player', pid: o.pid, name: displayName, color: o.color || '#5a9ae0', hp: o.hp, maxHp: o.maxHp, iso: isoF, ax, ay, floor: oFloor, lastAttackAt: o.lastAttackAt, vx: o.vx, vy: o.vy, _fvx: o._fvx, _fvy: o._fvy, _war: o._war, bt: o.bt, bs: o.bs, bc: o.bc, br: o.br, cap: o.cap, act: o.act });
      }
    }
    {
      // 본인 스프라이트도 카메라(보간) 위치 사용 → 항상 화면 중앙 + 60fps 부드러운 스크롤.
      const myDisplay = myTribeName ? `[${myTribeName}] ${myName}` : myName;
      const myZ = myFloor * FLOOR_HEIGHT + (myStairZ || 0); // 14.49-c: 계단 z 추가
      const isoMe = w2i(_camAbs.x, _camAbs.y, myZ);
      renderables.push({ z: (_camAbs.x + _camAbs.y) * 0.5 + myFloor * 0.5 + 500, kind: 'player', pid: myPid, name: myDisplay, color: myColor, hp: myHp, maxHp: myMaxHp, iso: isoMe, ax: _camAbs.x, ay: _camAbs.y, isMe: true });
    }

    renderables.sort((a, b) => a.z - b.z);

    // 14.49-e7ab/ag: 위층 BFS cutaway
    const _renderMyCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
    const _renderMyCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    const aboveCutawayWalls = computeAboveCutawayWalls(_renderMyCx, _renderMyCy, myFloor);
    const aboveCutawayCells = computeAboveCutawayCells(_renderMyCx, _renderMyCy, myFloor);
    // ★[사용자 지적 — 밖에서도 동벽이 눕던 버그] 방향성 남·동벽 페이드의 실내 게이트(프레임당 1회):
    //   내가 실내(방 BFS enclosed)일 때만 발동 — 밖에서는 모든 벽 불투명. 문이 개구인 움집·큰집은
    //   방 BFS가 새므로 발자국 렉트 태그(data.hut/data.bld)가 실내 판정 정본(벽 페이드 분기에서 처리).
    let _myRoom = null;
    try {
      const _mr = cellRoomCache.get(`${_renderMyCx}_${_renderMyCy}_${myFloor}`) || computeRoom(_renderMyCx, _renderMyCy, myFloor);
      _myRoom = (_mr && _mr.isIndoor) ? _mr : null;
    } catch (e) { _myRoom = null; }

    // 14.49-e7ae: mask composite를 entity render 전으로 (entity가 mask 위에 = mask 영향 X)
    // mask 자체는 entity render 후에 만들어짐 (현재 위치 그대로). 즉 1 frame 지연.
    // window._shadowMask가 persistent canvas라 이전 frame mask가 보존됨. 첫 frame은 빈 mc (transparent).
    // 카메라 델타 보정: mask는 만들 당시 위치(p0) 기준 스크린 좌표라, 이동 중엔 어둠 경계가
    // 이동방향으로 frame당 이동량만큼 돌출해 보임 → p0→현재 iso 스크린 델타만큼 밀어서 합성.
    if (window._shadowMask) {
      // mask canvas는 화면보다 사방 64px 큼 (FOG_MASK_M) — 델타만큼 밀어도 빈 띠 없음
      const _maskM = 64; // mask 생성부 FOG_MASK_M과 동일해야 함
      let mdx = 0, mdy = 0;
      if (window._shadowMaskPx !== undefined) {
        const p0x = window._shadowMaskPx, p0y = window._shadowMaskPy;
        const p1x = _camAbs.x, p1y = _camAbs.y; // K22: 마스크 빌드/저장과 동일 기준(_camAbs). myAbsPredicted(계단) 쓰면 델타가 30Hz로 떨려 부채꼴 경계 떨림
        // 정수로 반올림 — subpixel drawImage는 Safari에서 풀스크린 canvas 리샘플링을
        // 강제해 프레임 드랍 + 마스크 경계가 매 frame 흐릿하게 떨리는 원인이 됨.
        mdx = Math.round((p0x - p0y) - (p1x - p1y));
        mdy = Math.round(((p0x + p0y) - (p1x + p1y)) / 2);
        // margin 초과 점프(teleport/zone 이동 등)면 보정 포기 — 1 frame glitch는 기존과 동일
        if (Math.abs(mdx) > _maskM || Math.abs(mdy) > _maskM) { mdx = 0; mdy = 0; }
      }
      ctx.drawImage(window._shadowMask, mdx - _maskM, mdy - _maskM);
    }

    // === 3) 엔티티 그리기 ===
    for (const item of renderables) {
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
        // Phase 14.39: 자원도 entity — 시야 뒤면 안 보임. 단 거리 vignette는 부드럽게.
        let vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        vis *= entityVisibility(item.ax, item.ay, d);
        if (vis < 0.05) continue;
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
        // Phase 14.39: 바닥 아이템도 entity cone
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        const vis = entityVisibility(item.ax, item.ay, d);
        if (vis < 0.05) continue;
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
        else if (bf > myFloor) {
          if (bType === 'floor') {
            const cx = Math.floor(item.ax / CL_BUILDING_SIZE);
            const cy = Math.floor(item.ay / CL_BUILDING_SIZE);
            const cellKey = `${cx}_${cy}`;
            if (aboveCutawayCells.has(cellKey)) continue; // BFS cutaway
            const maxF = clMaxFloorMap.get(cellKey);
            if (maxF !== undefined && bf !== maxF) continue; // 가장 위쪽 아님
            ctx.globalAlpha = 1.0;
          } else if (bType === 'wall' || bType === 'fence') {
            const side = item.b.data?.side || 'N';
            let absCx, absCy, cx2, cy2;
            if (side === 'N') {
              absCx = Math.floor(item.ax / CL_BUILDING_SIZE);
              absCy = Math.floor(item.ay / CL_BUILDING_SIZE);
              cx2 = absCx; cy2 = absCy - 1;
            } else {
              absCx = Math.floor(item.ax / CL_BUILDING_SIZE) - 1;
              absCy = Math.floor(item.ay / CL_BUILDING_SIZE);
              cx2 = absCx + 1; cy2 = absCy;
            }
            // BFS cutaway: 양쪽 cell 중 하나라도 in BFS면 skip
            if (aboveCutawayCells.has(`${absCx}_${absCy}`) || aboveCutawayCells.has(`${cx2}_${cy2}`)) continue;
            ensureWallMap();
            const r1 = cellRoomCache.get(`${absCx}_${absCy}_${bf}`);
            const r2 = cellRoomCache.get(`${cx2}_${cy2}_${bf}`);
            const isOuter = (!r1 || !r1.isIndoor) || (!r2 || !r2.isIndoor);
            if (!isOuter) continue;
            ctx.globalAlpha = 0.85;
          } else {
            continue;
          }
        }
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
              isCutaway = (myFloor || 0) === 0 && _renderMyCx >= _rect[0] && _renderMyCx <= _rect[2] && _renderMyCy >= _rect[1] && _renderMyCy <= _rect[3];
            } else if (_myRoom) {                                  // 일반 건물 = 방 시스템: 이 벽이 '내 방'에 접해 있을 때만
              let _wcx, _wcy, _ocx, _ocy;
              if (side === 'N') { _wcx = Math.floor(item.ax / CL_BUILDING_SIZE); _wcy = Math.floor(item.ay / CL_BUILDING_SIZE); _ocx = _wcx; _ocy = _wcy - 1; }
              else { _wcx = Math.floor(item.ax / CL_BUILDING_SIZE) - 1; _wcy = Math.floor(item.ay / CL_BUILDING_SIZE); _ocx = _wcx + 1; _ocy = _wcy; }
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
        if (bf > myFloor && aboveCutawayCells.has(`${cx}_${cy}`)) continue;
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
        let vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        vis *= entityVisibility(item.ax, item.ay, d);
        if (vis < 0.05) continue;
        ctx.globalAlpha = vis;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', s.x, s.y);
        ctx.globalAlpha = 1;
      }
    }

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
      mctx.beginPath();
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
            mctx.moveTo(sxC - halfW - expand, syC);
            mctx.lineTo(sxC, syC - halfH - expand);
            mctx.lineTo(sxC + halfW + expand, syC);
            mctx.lineTo(sxC, syC + halfH + expand);
            mctx.closePath();
          }
        }
      }
      mctx.fill();

      // (ii) visible polygon: world → screen iso transform → destination-out alpha 1.0 (밝음)
      mctx.save();
      mctx.setTransform(1, 0.5, -1, 0.5, W/2 - (px - py) + FOG_MASK_M, H/2 - (px + py)/2 + FOG_MASK_M);
      mctx.fillStyle = 'rgba(0,0,0,1.0)';
      mctx.fill(visibleWorldPath);
      mctx.restore();

      // mask 생성 시점의 플레이어 위치 기록 — 다음 frame 합성 시 카메라 델타 보정용
      window._shadowMaskPx = px;
      window._shadowMaskPy = py;

      // 14.49-e7ae: mask composite는 다음 frame entity render 전에 합성 (entity가 mask 위)
      // wall 2차 render 폐기 — entity가 mask 위에 그려지므로 mask 가림 X
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
          ctx.fillText(done ? `${_kko2} — 클릭=제련` : `${_kko2} 터 ${st}/3단계 (클릭=시공)`, x, y - 28);
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
          ctx.fillText(done ? '숯가마 — 클릭=굽기' : `숯가마 터 ${st}/2단계 (클릭=시공)`, x, y - 28);
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
      ctx.fillText(done ? '숯가마 — 클릭=굽기' : `숯가마 터 ${st}/2단계 (클릭=시공)`, x, y - 26);
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
        if (cl.ownerPid !== myUsername) continue;
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
        if (cl.ownerPid !== myUsername) continue;
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
      const src = document.querySelectorAll('.hud-actions [data-action="hut_start"], .hud-actions [data-action="furnace_start"], .hud-actions [data-action="kiln_start"]');
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
