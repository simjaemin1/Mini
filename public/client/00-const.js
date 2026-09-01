// @@split:00-const — 기초 상수·줌·캔버스
// 클라이언트 — 아이소메트릭 렌더링 + 다중 존 동시 구독 + 끊김 없는 핸드오프
// 핵심: 절대 월드 좌표를 사용해서 존 경계를 시각적으로 안 보이게.
//      현재 존에 primary 연결, 인접 존에는 observer 연결로 미리 보기.
// === CLIENT BUILD: Phase 5-G (한반도 강·호수 hardcoded + observer storm fix) ===
console.log('%c[durango-mini] client build = Phase 5-K26 (길드 영토 셀 집합 렌더 — 격자 단위)', 'color:#5a9ae0;font-weight:bold;font-size:14px');

// ★★[부패·보존 배치 2026-08-31] 신선도 3단계의 **표시**(값은 서버가 준다 — 여기 문턱을 적지 않는다).
//   `server/spoil.js` 의 STAGE_KO/STAGE_EMO 와 짝이다. 클라는 곡선을 계산하지 않는다.
const PRESERVE_STAGE_KO = { fresh: '신선', wilt: '시듦', spoiled: '상함' };
const PRESERVE_STAGE_EMO = { fresh: '🟢', wilt: '🟡', spoiled: '🔴' };
const PRESERVE_STAGE_COLOR = { fresh: '#7ec98a', wilt: '#d9b45a', spoiled: '#e07575' };

// Phase 4d-16-c: facility 종류별 emoji
const FACILITY_EMOJI = {
  drying_rack: '🧺',   // ★[보존 배치] 건조대
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

  const canvas = document.getElementById('canvas');
  // ★`let` 이다 — 줌이 켜지면 월드 패스 동안만 오프스크린 컨텍스트로 갈아 끼운다(아래 zoomBegin).
  let ctx = canvas.getContext('2d');
  const _mainCtx = ctx;
  let W = canvas.width, H = canvas.height;      // ★월드 패스 중에는 **가상 뷰포트** 크기가 된다
  let W0 = W, H0 = H;                           // 실제 캔버스 크기(HUD·마우스는 이걸 쓴다)
  // Phase 14.19: 전체화면 — viewport 가득. resize 시 동적 재조정.
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    W0 = canvas.width; H0 = canvas.height;
    W = W0; H = H0;
  }

  // ═══════════════ 줌 [재민 확정 2026-08-31 · 갈래 A "큰 화소"] ═══════════════
  //   ★계약: **ZOOM === 1 이면 종전과 코드 경로가 같다.** 오프스크린을 만들지도 않는다.
  //     (`__zoomDbg().off === null` 로 하네스가 그걸 센다 — 회귀 위험 0 을 말이 아니라 수치로.)
  //   ★방식: 세계를 **1:1 로 오프스크린에 그린 뒤 화면 전체를 통째로 늘리거나 줄인다.**
  //     - 확대(z>1): 오프스크린이 화면보다 **작다**(W0/z). 늘리면 화소가 정직하게 커진다.
  //       보간을 끈다 — 이게 좀보이드의 `IsoSprite > ForceNearestMagFilter` 와 같은 선택이다.
  //     - 축소(z<1): 오프스크린이 화면보다 **크다**(W0/z). 줄이며 보간을 켠다(계단 방지).
  //   ★왜 `ctx.setTransform(z,...)` 이 아닌가: 그 방식은 타일을 배율 좌표에 그려서 정수가 아닌
  //     배율에서 **반화소 이음새**가 생긴다(지형이 512×256 패턴 블릿이라 특히). 통째 확대는
  //     이음새가 원리적으로 안 생긴다. 대신 자연물이 가진 3~9배 해상도 여유는 못 쓴다 —
  //     그건 "확대하면 더 선명" 을 택할 때의 값이고, 재민은 "큰 화소" 를 택했다.
  //   ★그리기 코드 95군데의 W/H 를 한 줄도 안 건드린다 — W/H 자체를 가상 크기로 바꾸므로
  //     컬링·중심 계산이 저절로 맞는다.
  //   ★[재민 확정 2026-08-31 · 2차] **축소를 뺐다.** 세계 화소가 1/z² 로 늘어 0.5배가 4배 그리기이고
  //     (실측 1배 260ms → 0.5배 943ms, ×3.6) 이름표 글자도 같이 줄어 안 읽혔다.
  //     확대만 남기면 오프스크린이 늘 화면보다 **작아** 확대가 1배보다 오히려 싸다(실측 70ms).
  //     되돌리려면 이 표에 0.75·0.5 를 넣기만 하면 된다 — 아래 코드는 배율이 1 미만이어도 맞다.
  const ZOOM_STEPS = [1, 1.5, 2];
  const ZOOM_KEY = 'durango_zoom';
  let ZOOM = 1;
  try { const _z = parseFloat(localStorage.getItem(ZOOM_KEY)); if (ZOOM_STEPS.includes(_z)) ZOOM = _z; } catch (_) {}
  let _zoomCv = null, _zoomCtx = null;

  function zoomBegin() {
    if (ZOOM === 1) return false;                       // ★종전 경로 그대로
    const vw = Math.max(1, Math.ceil(W0 / ZOOM)), vh = Math.max(1, Math.ceil(H0 / ZOOM));
    if (!_zoomCv) { _zoomCv = document.createElement('canvas'); _zoomCtx = _zoomCv.getContext('2d'); }
    if (_zoomCv.width !== vw || _zoomCv.height !== vh) { _zoomCv.width = vw; _zoomCv.height = vh; }
    _zoomCtx.setTransform(1, 0, 0, 1, 0, 0);
    _zoomCtx.globalAlpha = 1; _zoomCtx.globalCompositeOperation = 'source-over';
    _zoomCtx.clearRect(0, 0, vw, vh);
    ctx = _zoomCtx; W = vw; H = vh;
    return true;
  }

  function zoomEnd(on) {
    if (!on) return;
    ctx = _mainCtx; W = W0; H = H0;
    const prev = ctx.imageSmoothingEnabled;
    // 확대는 보간 끔(큰 화소가 계약) · 축소는 켬. 지금 표엔 1 미만이 없어 늘 꺼지지만,
    // 조건을 남겨 둔다 — 표에 축소를 되돌리면 이 줄이 저절로 맞는다(하드코딩 false 는 그때 틀린다).
    ctx.imageSmoothingEnabled = (ZOOM < 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(_zoomCv, 0, 0, _zoomCv.width, _zoomCv.height, 0, 0, W0, H0);
    ctx.imageSmoothingEnabled = prev;
  }

  function setZoom(z) {
    const i = ZOOM_STEPS.indexOf(z);
    if (i < 0) return false;
    if (z === ZOOM) return false;
    ZOOM = z;
    try { localStorage.setItem(ZOOM_KEY, String(z)); } catch (_) {}
    if (ZOOM === 1 && _zoomCv) { _zoomCv = null; _zoomCtx = null; }   // 계약: z=1 이면 오프스크린이 없다
    return true;
  }
  function stepZoom(dir) {                              // dir +1 = 확대, -1 = 축소
    const i = ZOOM_STEPS.indexOf(ZOOM);
    return setZoom(ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + dir))]);
  }
  window.__zoomDbg = () => ({ zoom: ZOOM, steps: ZOOM_STEPS.slice(), off: _zoomCv ? [_zoomCv.width, _zoomCv.height] : null,
                              screen: [W0, H0] });
  window.__setZoom = (z) => stepZoom(0) || setZoom(z);
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // === 아이소메트릭 투영 (2:1 다이아몬드) — 2.5D ===
  // worldX,worldY (픽셀) → 화면상 iso 픽셀. z(높이)는 화면 y에서 빼서 위로 올림.
  // (1,0,0) → (1, 0.5), (0,1,0) → (-1, 0.5), (0,0,1) → (0, -1) 형태.
  // 모든 호출자는 z=0 기본 — Phase 13.2에서 건물/계단에 z>0 도입.
  const FLOOR_HEIGHT = 64; // 14.49-e2: 32 → 64 (한 층 2배)
  // === 화면(canvas px) → 월드 절대 좌표 ==========================================
  //   ★렌더가 실제로 쓴 **카메라 iso 원점**(`_lastCamIso`)을 쓴다. 종전엔 `myAbsPredicted` 로 따로
  //   투영해서 보간 한 스텝만큼(수 px) 어긋나 있었고, 조준 시야 밀기가 들어오면 그 어긋남이
  //   오프셋(최대 180px)만큼 커진다 — 커서가 가리키는 곳과 실제 조준선이 갈린다.
  function screenToWorldAbs(px, py) {
    const cam = _lastCamIso || w2i(myAbsPredicted.x, myAbsPredicted.y);
    // ★줌: 실제 화면에서 중심으로부터의 거리를 배율로 나눠 **가상 공간**으로 옮긴다.
    //   ZOOM=1 이면 아래 두 줄은 종전 식과 대수적으로 완전히 같다(층 항은 월드 양이라 나누지 않는다).
    const ix = (px - W0 / 2) / ZOOM + cam.x;
    const iy = (py - H0 / 2) / ZOOM + (myFloor || 0) * FLOOR_HEIGHT + cam.y;
    return { wx: ix * 0.5 + iy, wy: iy - ix * 0.5 };
  }
  // ★역방향(월드 → 실제 화면 px) — 하네스가 왕복을 재려면 이게 있어야 한다(족보: 계약은 양쪽으로 센다).
  function worldAbsToScreen(wx, wy) {
    const cam = _lastCamIso || w2i(myAbsPredicted.x, myAbsPredicted.y);
    const iso = w2i(wx, wy);
    return { px: (iso.x - cam.x) * ZOOM + W0 / 2,
             py: (iso.y - (myFloor || 0) * FLOOR_HEIGHT - cam.y) * ZOOM + H0 / 2 };
  }
  window.__s2w = (px, py) => screenToWorldAbs(px, py);
  window.__w2s = (wx, wy) => worldAbsToScreen(wx, wy);
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
  let myAbsPosAt = 0;        // ★권위 위치를 **마지막으로 받은** 시각(0 = 아직 못 받음)
  let myAbsPredicted = { x: 0, y: 0 };
  // Phase 5-2-mini: 미니맵에서 access
  window.__getMyAbs = () => myAbsPredicted;
  // ★★[핫픽스 2026-08-31] **서버 권위 위치** 훅(읽기 전용).
  //   `__getMyAbs()` 는 **클라 예측**이다. 재접속·orphan 복구 직후엔 권위와 수만 px 갈릴 수 있다 —
  //   실측: 서버가 텔레포트를 7번 다 받아들였는데(공지 증거) 예측은 3만px 밖에 머물렀다.
  //   그걸 **도착 판정**으로 쓴 하네스는 멀쩡한 워프를 "미도달"로 찍고, 그 뒤 판정이 통째로 헛것이 된다.
  //   ⇒ 족보 ㊹("예측 vs 권위를 둘 다 찍어라")의 훅 판. `__evDbg` 가 이미 쓰던 그 짝을 밖에 낸다.
  //   ★null 은 "아직 내 몸의 틱을 못 받았다"는 뜻이다 — 0,0 으로 **자명 통과**시키지 않는다.
  window.__getSrvAbs = () => (myAbsPosAt
    ? { x: myAbsPos.x, y: myAbsPos.y, at: myAbsPosAt } : null);
  // ★[이동 모델 2026-08-30] 진단 훅(읽기 전용) — `e2e-move` 가 이걸로 잰다.
  //   속도는 **모델 상태**를 그대로 읽는다(화면 미분이 아니라) — 계측기가 렌더 보간을 재는 함정 회피.
// @@moved:199
  // ★★[접속 진단 배치 2026-08-30] **입장했는가**를 정직하게 답하는 훅.
  //   `__getMyAbs()` 는 `{x:0,y:0}` 로 시작해 **언제나 truthy** 다 — 그걸 입장 게이트로 쓴
  //   하네스들(`!!(window.__getMyAbs && window.__getMyAbs())`)은 **자명 통과**였다.
  //   (이번 배치의 `e2e-conn` 이 실패를 만들어 보다가 잡았다: 접속이 확정 오류인데도 true 였다.)
  //   여기서는 **welcome 을 받았는가**(=서버가 나를 들였는가)를 그대로 답한다.
// @@moved:212
  // ★[10차 T4] 장마당 진단 훅 — 클라가 서버 markets 플래그를 실제로 받았는지 확인용(읽기 전용, 기존 __get* 관례).
// @@moved:214
  // ★[11차 T3] 환호 진단 훅 — 클라가 도랑 페이로드를 받아 미러(_ditchAbs)에 실었는지(읽기 전용).
// @@moved:216
  // ★[2026-08-03e 배치 12] 건립 E2E 진단 훅 — 클라가 받은 건물·사유지를 **월드 절대좌표**로(읽기 전용).
  //   `__getAllWalls` 와 같은 관례. 실클라 E2E 가 "회관이 실제로 완공됐는가"를 화면 상태로 확인한다.
// @@moved:219
  // ★[2026-08-04c 배치 17 ②] 낚시터 방황 진단 훅 — 클라가 **화면에 그리는 바로 그 좌표**를 월드 절대좌표로
  //   (읽기 전용). 서버 /lifedbg 와 달리 "플레이어 눈에 보이는 것"을 재는 층이라, 수리 전/후 실화면 비교의
  //   계측기가 된다. 좌표는 보간 전 권위값(c.others 의 x·y) — 렌더러가 쓰는 원본과 같다(사본 금지).
// @@moved:230
// @@moved:238
  // Phase 5-G debug: 미니맵에서 wall 위치 검증용
// @@moved:247
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
  // ★★[시설 제작창 2026-08-29 · §8.5] "제작창 = 시설의 창" — 내 곁의 시설이 자기 레시피만 편다.
  let myFacility = null;      // { near:{bid,btype,ko,kind,mine,craftMs}|null, recipes:[], queue:[] }
  let facilityPick = {};      // 레시피별로 **무엇으로 만들지**(재료 선택 = 판단)
  let _facAutoOpened = null;  // 자동 개방은 시설에 **들어설 때 한 번**만 — 닫아 놓은 걸 다시 열지 않는다
  let _facAskAt = 0;
  let cookRecipes = {}; // 서버에서 받은 요리 레시피
  let foodEffects = {}; // 서버에서 받은 음식 효과 정보 (표시용)
  // 플레이어 장비(품질·속성·내구 인스턴스) — econ 무접촉·본체 서버층
  let equipmentRecipes = {}, equipmentMeta = null; // 장비 제작 레시피·미리보기 메타(서버 공식 단일진실)
  let equipment = [], equipSlots = {}, craftSkill = {}; // 장비 인스턴스·장착 슬롯·제작 숙련 xp
  // ★★[정비 배치 2026-08-30] 개체 원장·식품 로트 — **서버가 준 것만** 쓴다(클라가 표를 들면 사본이다).
  //   `myLedger[item] = [{id, kg, d?}, …]` · `myLots[item] = [{day, n, ageDays, coalesced}, …]`
  let myLedger = {}, myLots = {};
  // 펼침 상태 — 인벤 메시지마다 패널이 다시 그려지므로 **재렌더를 넘어 살아남아야** 한다.
  const ulOpen = new Set();
  // ★[정비 배치] 클라 손잡이 — welcome 의 `uiCfg` 가 덮어쓴다(정본은 서버 env · `carryCfg` 와 같은 규약).
  let uiCfg = { vignetteTint: true, moodleShowMax: 3, ghostStallMs: 5000, ghostReconnectMs: 10000,
                charSprite: false, charWalkMin: 4, charRunMin: 102 };   // ★[캐릭 시트] 기본 OFF
  // ★비네트 색조 — **축 계열**. 새 아트를 만들지 않고 색만 바꾼다(§8.3 아날로그 채널은 최소로).
  //   갈증=청 · 허기=황 · 추위=창백한 하늘색 · 피로=보라 · 부상=적 · 과적=흙빛.
  const VIGNETTE_RGB = {
    thirst: '90,150,220', hunger: '210,170,60', cold: '150,190,225',
    fatigue: '140,110,190', injury: '200,60,50', carry: '150,120,80',
    _: '120,20,14',   // 기본(옛 색) — 축을 모를 때·색조를 껐을 때
  };
  let craftEquipSel = {}; // UI: 유형별 선택 재료 {clothes:'hide',...}
  // ★주조(합금) UI — 유형별 배합 가중치 {weapon:{copper:83,tin:17}}, 켬/끔, 서버 미리보기 캐시.
  //   합금 물성은 **서버(server/specialty.js)가 단독 계산**한다. 클라에 복제하지 않는다 —
  //   복제본은 반드시 어긋나고, 어긋나면 미리보기와 실제 제작품이 달라진다.
  let castMix = {}, castOn = {}, castPv = {};
  let dishes = []; // 요리 인스턴스(신선도·버프) — [{id,label,q,nutrition,buff,freshness}]
  let shopVillage = null; // 거래: 가까운 마을 품질 EMA(shop_info 응답)
  let myHunger = 100, myThirst = 100, myVp = 0;
  // ★★[신체 3층 재배선 2026-08-30] 스태미나 — **달리기 관문의 정본은 서버**다.
  //   클라는 서버가 준 `canSprint` 를 그대로 쓴다(허기로 다시 판정하면 그게 사본이고,
  //   두 판정이 갈리는 순간 러버밴딩이다 — 이속 배율에서 이미 배운 그것).
  let myStam = 1, myStamLock = false, myCanSprint = true, myRecover = 1;
  // ★★[달력 2026-08-30 재민 확정] 연·계절·일 — **서버가 econ 정본에서 유도해 준 것**을 그대로 그린다.
  //   클라가 day→계절 매핑을 갖는 순간 그게 사본이고, 엔진이 계절 경계를 바꾸면 화면만 거짓말한다.
  let myCalendar = null;
  // ★★[온도 곡선 2026-08-31] 바깥 날씨 { cold, ko, emo, night, shelter } — **서버가 준 그대로** 그린다.
  //   클라가 게임일→온도 매핑을 갖는 순간 그게 사본이고, 곡선을 고치면 화면만 거짓말한다(달력과 같은 규약).
  let myWeather = null;
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
  // === [조준 모드 2026-08-30 재민 확정] 우클릭 홀드 = 조준 ======================
  //   ⓐ 조준 방향이 이동과 **분리**된다(커서 방향) → 옆걸음·뒷걸음이 자연 발생
  //   ⓑ 이속이 `MOVE_AIM_SPEED_FRAC` 로 준다 (서버 권위와 같은 수 — 입력에 aim 을 실어 보낸다)
  //   ⓒ 시야 밀기 — **카메라만** 커서 쪽으로 밀린다
  //   ★★안개 계약: 시야(안개) 계산 원점은 **캐릭터 그대로**다. 오프셋은 화면 변환(camX/camY)에만
  //     더한다 — `_camAbs`(월드)는 손대지 않으므로 안개 원점·내 스프라이트 위치가 불변이다.
  //     (커서로 안개를 걷으면 정찰이 공짜가 된다. 시야 확장은 나중에 **설계할 일**이지
  //      카메라의 부작용이면 안 된다 — 회부.)
  let _aiming = false;
  const AIM_LOOK_PX = 180;      // 시야 밀기 최대 오프셋(화면 px). 손잡이는 튜닝 배치에서.
  const AIM_LOOK_TAU = 0.12;    // 이징 시정수(초) — 뚝 이동 금지
  let _aimLookX = 0, _aimLookY = 0;      // 현재(이징된) 화면 오프셋
  // ★[안개 정렬 2026-09-01] 하네스가 "밀기가 실제로 걸렸는지" 먼저 세게 하는 훅(족보 57).
  //   이게 없으면 밀기가 0인 채로 "안개가 안 어긋났다"는 **자명 통과**를 하게 된다.
  window.__aimDbg = () => ({ aiming: _aiming, x: _aimLookX, y: _aimLookY,
                             maskAx: window._shadowMaskAx || 0, maskAy: window._shadowMaskAy || 0 });
  let _lastCamIso = null;                // 직전 프레임 카메라 iso 원점 — 커서→월드 투영이 이걸 쓴다
  let _aimDirX = 1, _aimDirY = 0;        // 조준 월드 방향(정규화)
  let _aimT = 0;                         // 이징용 직전 프레임 시각
  // Phase 14.40: Shift 달리기
  let mySprint = false;
  // ★유령 클라 fix: 서버에 내 플레이어 실체가 없는 구간(사망 제거·orphan 판정·재연결 대기) 플래그.
  //   true 동안 클라 예측(predictStep)을 정지시켜, 실체 없는 좌표로 계속 걸어가는 "유령 클라"를 원천 차단.
  //   해제는 오직 primary welcome 앵커에서만(= 서버 권위 좌표를 받은 순간).
  let _selfGone = false;
  // ★[정비 배치] 유령 클라 — 서버 틱이 안 오는 동안은 **예측을 멈추고** 그 사실을 화면에 적는다.
  let netStalled = false;
  let _ghostCutAt = 0;          // 강제 close 를 한 번만 하기 위한 빗장(회복하면 풀린다)
  // ★★[접속 진단 배치 2026-08-30 재민 확정] **기다리면 되는 건지 진짜 에러인지 화면이 말한다.**
  //
  //   재민 원문: *"자꾸 언제는 기다리면 됐다가 언제는 안 됐다 그래.. 이게 기다리면 되는 건지,
  //   진짜 에러인지 사용자한테 구분 가게 해야 하는 거 아냐?"*
  //
  //   구분의 재료는 **서버가 준다**(클라가 추측하지 않는다):
  //     · `conn_hello`  접속 즉시 — "받았다"
  //     · `pong{stage}` 입장 처리 중에도 답한다 — "살아 있고, 지금 이 단계다"
  //     · `conn_error`  던졌다 — "확정 오류. 기다려도 안 된다"
  //   그래서 세 갈래가 **증거로** 갈린다:
  //     hello·pong 도 없음 → 서버/망이 죽었다(기다림)   hello 는 오는데 welcome 이 없음 → 입장이 막혔다
  //     conn_error → 확정 오류
  let connPhase = 'idle';        // idle | connecting | entering | ready | error
  let connAttempts = 0, connStartedAt = 0, connHelloAt = 0, connEverReady = false;
  // ★★시계는 **이번 끊김 전체**를 잰다(시도마다 리셋하면 안 된다).
  //   1차 실장이 `connStartedAt`(시도 시작)으로 쟀더니, 백오프로 재시도할 때마다 0초로 돌아가
  //   **6번째 시도인데 "0초 경과"** 가 떴다 — 영원히 노랑에 머물러 "오래됐다"를 말할 수가 없었다.
  let connOutageAt = 0;
  let _reconnAt = 0;             // 재연결 백오프 시계(성공하면 푼다)
  let connReason = '', connStage = '', connRef = '';
  function connMark(phase, extra) {
    connPhase = phase;
    if (extra) { if (extra.reason !== undefined) connReason = extra.reason;
                 if (extra.stage !== undefined) connStage = extra.stage;
                 if (extra.ref !== undefined) connRef = extra.ref; }
    paintConnBanner();
  }
  // 문턱 — 여기 넘으면 "기다림"이 아니라 "오류일 수 있음"으로 말이 바뀐다.
  const CONN_WAIT_WARN_MS = 25000;   // hello 도 못 받은 채 이만큼
  const CONN_ENTER_WARN_MS = 20000;  // hello 는 받았는데 welcome 이 이만큼 안 옴
  // ★유예 — 정상 접속·존 핸드오프는 1초 안에 끝난다. 그 사이에도 배너를 띄우면
  //   **문 하나 지날 때마다 경고가 번쩍인다**(늑대 소년). 이만큼 지나서도 못 들어갔을 때만 말한다.
  const CONN_QUIET_MS = 2000;
  function paintConnBanner() {
    const el = document.getElementById('netLost');
    if (!el) return;
    const now = performance.now();
    const el2 = (cls) => el.querySelector(cls);
    let state = null, title = '', why = '', hard = false;

    if (connPhase === 'error') {
      state = 'error'; hard = true;
      title = '서버에 들어가지 못했다 — 기다려도 해결되지 않는다';
      why = `원인: ${connReason || '알 수 없음'}${connStage ? ` · 단계 ${connStage}` : ''}${connRef ? ` · ref ${connRef}` : ''}`;
    } else if (connPhase === 'entering') {
      const el3 = now - (connOutageAt || connHelloAt || now);
      if (el3 < CONN_QUIET_MS) { el.classList.remove('on'); return; }   // ★유예 — 번쩍임 방지
      hard = el3 > CONN_ENTER_WARN_MS;
      state = hard ? 'error' : 'entering';
      title = hard ? '서버가 입장 처리를 못 끝내고 있다 — 오류일 수 있다'
                   : '서버가 받았다 — 입장 처리 중';
      why = `${(el3 / 1000).toFixed(0)}초 경과${connStage ? ` · 단계 ${connStage}` : ''}${connRef ? ` · ref ${connRef}` : ''}`;
    } else if (connPhase === 'connecting') {
      const el3 = now - (connOutageAt || connStartedAt || now);
      if (el3 < CONN_QUIET_MS) { el.classList.remove('on'); return; }   // ★유예 — 번쩍임 방지
      hard = el3 > CONN_WAIT_WARN_MS;
      state = hard ? 'error' : 'waiting';
      title = hard ? '서버가 응답하지 않는다 — 계속 재시도 중이지만 오류일 수 있다'
                   : '서버 응답을 기다리는 중 — 잠시 기다리면 대개 들어가진다';
      why = `${(el3 / 1000).toFixed(0)}초 경과 · ${connAttempts}번째 시도`;
    } else if (netStalled) {
      state = 'lost'; hard = true;
      title = '연결 끊김 — 재접속 중';
      why = connReason || '서버 응답 없음';
    }

    if (!state) { el.classList.remove('on'); return; }
    el.classList.add('on');
    el.dataset.state = state;
    el.dataset.hard = hard ? '1' : '0';
    const t = el2('.nl-txt'); if (t) t.textContent = title;
    const w = el2('.nl-why'); if (w) w.textContent = why;
    const b = el2('.nl-reload'); if (b) b.hidden = !hard;
  }
  setInterval(paintConnBanner, 500);
  window.__connState = () => ({ phase: connPhase, attempts: connAttempts, hello: !!connHelloAt,
    reason: connReason, stage: connStage, ref: connRef, everReady: connEverReady,
    state: (document.getElementById('netLost') || {}).dataset?.state || '',
    hard: ((document.getElementById('netLost') || {}).dataset?.hard === '1') });
  function setNetStalled(on, why) {
    if (netStalled === !!on) return;
    netStalled = !!on;
    if (netStalled) connReason = why || '서버 응답 없음';
    paintConnBanner();   // ★배너는 한 곳에서만 그린다(상태 넷을 한 함수가 판정 — 두 벌 금지)
    // 쌓인 미ack 입력을 버린다(재접속 뒤 순간이동 방지) + ★관성도 끊는다(이동 모델 — 병행 배치)
    if (netStalled) { pendingInputs.length = 0; _predAccum = 0; myVel.vx = 0; myVel.vy = 0; }
    else console.log('[recover] 서버 틱 복구 — 예측 재개');
  }
  window.__netStalled = () => netStalled;
// @@moved:491
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
// @@moved:600
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
  const WATER_EDGE_FUZZ = 6.0;         // 물가선이 굽이치는 폭(월드 px) — 자로 그은 직선을 없앤다
  // ★[재민 2026-08-24 "1셀 두께로 줄무늬"] 파도 **잔결** 노이즈. 스케일은 512 의 약수만(주기=512/스케일).
  //   3.2 월드px 는 화면에서 3px 남짓이라 픽셀 격자와 부딪쳐 물결이 아니라 **디더 점**으로 깨졌다.
  const WATER_RIP_SCALE = 3.2, WATER_RIP_W = 0.38;
  // ★잔결 **전체 세기**. 1.00(옛값)은 얕은 물에서 물결이 아니라 **점묘**로 깨졌다.
  //   시안 A1.00/B0.65/C0.40/D0.20 실측(줄무늬 띠 고주파): 3.89 / 3.04 / 2.64 / 2.44.
  //   ★★그런데 0.40 으로 낮췄더니 `e2e-terrain` ①이 잡았다 — **물이 안 움직인다**
  //     (0.12초 최적 이동 8.1px → 0.0px · SAD 1.9 = 무이동과 같음). 물결의 **이동을 눈에 보이게
  //     하는 성분이 바로 이 잔결**이었다. 사인파는 파장 32·64px 이라 저대비 저주파라서 못 끈다.
  //   ⇒ **세기를 낮추는 안은 폐기**. 판정을 낮추는 대신 원인을 바꾼다: 잔결의 **격자 크기**를 키워
  //     픽셀 격자와 안 부딪치게 한다(아래 SCALE1). 세기는 1.00 그대로.
  const WATER_RIP_AMP = 1.00;
  // ★잔결 1차 노이즈 격자(월드px). 8 은 화면에서 8px 남짓이라 얕은 물의 저진폭 구간에서
  //   점묘로 깨졌다. 스케일은 512 의 약수만(주기 = 512/스케일).
  const WATER_RIP_S1 = 8.0, WATER_RIP_W1 = 0.55;
  // ★디더는 **기본 끔(0)** — 시안 A없음/B1.0/C2.0/D3.0 을 재 봤는데 줄무늬 띠 구조가
  //   전혀 안 깨졌다(고주파 3.89 / 4.01 / 4.32 / 4.76 — 노이즈만 늘었다). 양자화 가설도 기각.
  //   손잡이는 남긴다(다른 화면에서 계단이 보이면 켜서 재 볼 수 있게).
  const WATER_DITHER = 0.0;            // ±(값/2) LSB. 0 = 출시본 그대로
  // ★강 영향권 밖(호수·먼바다) 폴백 방향의 각도 눈금 수. 0 이면 옛 그림(매끄러운 방향 = 디더 띠).
  const WATER_LAKE_SNAP = 16.0;
  // ★[2026-08-09 실측 정정] 옛 주석의 "32px +0.27ms · 16px +0.53 · 8px +1.03" 은 **틀렸다**.
  //   실클라 짝 비교(켬/끔 5회 교대)로 재니 풀 카펫 흔들림 하나가 **16.3ms/f** 다 — 29배 차이.
  //   옛 수치는 격리·첫 blit 측정으로 보인다. 아래 값들은 전부 짝 비교로 다시 잰다.
  //   ★[합류 2026-08-24] 재민이 "여전히 안 흔들려"라고 해서 내가 2.2 → 3.4 로 올렸는데,
  //     병행 세션이 위 실측(16.3ms/f)을 근거로 2.2 로 되돌리고 2차 파를 뺐다. **그쪽을 취한다** —
  //     성능 수리를 조용히 되돌릴 수는 없다. 세기 판단은 재민 몫으로 남긴다(보고서 §6-k 끝).
  let _gtFrac = false;                 // true = 옛 소수 목적지(A/B 대조군)
  let GT_STRIP = 16;                   // 잎 띠 높이(px) — 시험 손잡이 __gtStrip 으로 바꿀 수 있다
  const GT_GRASS_AMP = 2.2;            // 카펫이 눕는 최대 폭(px). 잎이 6~10px 이라 이 이상은 '미끄러짐'으로 보인다
  const GT_WAVE_K = 0.017;             // 파수(1/px) — 파장 ≈ 370px ≈ 11셀. 들판을 훑는 결
  const GT_WAVE_W = 2.10;              // 각속도(rad/s, 게임 시계) — 주기 ≈ 3.0초
  const GT_WAVE_K2 = 0.041, GT_WAVE_W2 = 5.30, GT_AMP2 = 0.38;   // 2차 파 — 잔떨림(주기 ≈1.2초)
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
          // ★이음매 방지 — 클립 도형도 부풀린다(무늬는 월드 정렬 반복이라 겹쳐 그려도 같은 그림이다).
          g.save(); _diaPath(g, sx, sy, true); g.clip();
          g.fillStyle = g.createPattern(GTEX.mud_angled, 'repeat');
          g.fillRect(sx - 34, sy - 18, 68, 36); g.restore();
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
