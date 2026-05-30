// 클라이언트 — 아이소메트릭 렌더링 + 다중 존 동시 구독 + 끊김 없는 핸드오프
// 핵심: 절대 월드 좌표를 사용해서 존 경계를 시각적으로 안 보이게.
//      현재 존에 primary 연결, 인접 존에는 observer 연결로 미리 보기.
// === CLIENT BUILD: 14.46-a-fix2 (WASD=월드 방향 복귀) ===
console.log('%c[durango-mini] client build = 14.46-a-fix2 (WASD=월드 방향 복귀)', 'color:#5a9ae0;font-weight:bold;font-size:14px');

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
  const FLOOR_HEIGHT = 32; // 한 층 = 32px (정육면체 비율로 사람 키와 자연스러움)
  function w2i(wx, wy, wz = 0) {
    return { x: (wx - wy), y: (wx + wy) * 0.5 - wz };
  }

  // === 상태 ===
  let zonesMeta = {};
  let marketplaceUrl = '';
  let myName = '여행자';
  let myUsername = '';
  let myHp = 100, myMaxHp = 100; // 로그인 시 username (= server의 player_id). 게스트면 ''
  let myPassword = ''; // 로그인 시 password
  let myColor = '#f0c674';
  let myAbsPos = { x: 0, y: 0 };
  let myAbsPredicted = { x: 0, y: 0 };
  let primaryZoneId = null;
  let myPid = null;
  let inventory = { wood: 0, stone: 0 };
  let tools = {};     // { axe: 1, pickaxe: 0, sword: 2, ... }
  let equipped = null; // 'axe' | 'pickaxe' | 'sword' | null
  let recipes = {};   // 서버에서 받은 도구 레시피
  let cookRecipes = {}; // 서버에서 받은 요리 레시피
  let foodEffects = {}; // 서버에서 받은 음식 효과 정보 (표시용)
  let myHunger = 100, myThirst = 100, myVp = 0;
  const VP_THRESHOLD = 50; // 클라 표시용 — 서버와 동일해야 함
  let myTribeId = null, myTribeName = null;
  let myPvpEnabled = false;
  let myBuildFloor = 0; // 2.5D — 현재 건축 층 (Z=위, X=아래)
  let myFloor = 0;      // 캐릭터가 현재 있는 층 (계단으로 이동)
  // Phase 14.30: 건축 placement mode
  let placementMode = null; // null 또는 { type, floor }
  let placementCursor = { wx: 0, wy: 0 }; // 마우스 따라가는 abs 좌표
  let myLastAttackAt = 0; // Phase 14.35: 공격 모션
  let myFacingVx = 1, myFacingVy = 0; // Phase 14.37: 본인 마지막 facing (기본 동쪽)
  // Phase 14.40: Shift 달리기
  let mySprint = false;
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
  const ICE_BAND_PX = 800;
  const TUNDRA_BAND_PX = 1800;
  const ICE_COLOR = '#dde8f0'; // 약간 푸르스름한 흰색
  function _h2i(c) { return parseInt(c.slice(1), 16); }
  function _mixHex(a, b, t) {
    const pa = _h2i(a), pb = _h2i(b);
    const r = Math.round(((pa>>16)&255) * (1-t) + ((pb>>16)&255) * t);
    const g = Math.round(((pa>>8)&255)  * (1-t) + ((pb>>8)&255)  * t);
    const bl = Math.round((pa&255)      * (1-t) + (pb&255)      * t);
    return '#' + ((r<<16)|(g<<8)|bl).toString(16).padStart(6, '0');
  }
  // 절대 월드 y에 따라 색 보정. totalHeight = 전체 월드 높이 (남북 합).
  function latitudeColor(absY, totalH, baseColor) {
    const distFromPole = Math.min(absY, totalH - absY);
    if (distFromPole >= TUNDRA_BAND_PX) return baseColor;
    if (distFromPole <= ICE_BAND_PX)    return ICE_COLOR;
    const t = (distFromPole - ICE_BAND_PX) / (TUNDRA_BAND_PX - ICE_BAND_PX);
    return _mixHex(ICE_COLOR, baseColor, t);
  }

  // Phase 14.39: 시야 cone 헬퍼
  // 지형: 뒤쪽도 보임 (0.55) — 탐험한 곳 윤곽
  function coneMultGround(dwx, dwy, dist) {
    if (dist < 40) return 1;
    if (myFacingVx === 0 && myFacingVy === 0) return 1;
    const flen = Math.hypot(myFacingVx, myFacingVy) || 1;
    const fx = myFacingVx / flen, fy = myFacingVy / flen;
    const ux = dwx / dist, uy = dwy / dist;
    const dot = fx * ux + fy * uy;
    if (dot > 0) return 1;
    if (dot > -0.5) return 1 - (-dot) * 0.5; // 1.0 → 0.75
    return 0.55; // 뒤 — 살짝 어두움
  }
  // entity (player/mob/item): 뒤쪽 완전 차단 (PZ식)
  function coneMultEntity(dwx, dwy, dist) {
    if (dist < 50) return 1;
    if (myFacingVx === 0 && myFacingVy === 0) return 1;
    const flen = Math.hypot(myFacingVx, myFacingVy) || 1;
    const fx = myFacingVx / flen, fy = myFacingVy / flen;
    const ux = dwx / dist, uy = dwy / dist;
    const dot = fx * ux + fy * uy;
    if (dot > 0.1) return 1;
    if (dot > -0.2) return (dot + 0.2) / 0.3; // fade
    return 0; // 뒤쪽 안 보임
  }

  // === 클라 사이드 wall edge 콜라이더 (server isBlockedByWall 미러) ===
  // wall은 cell edge에 (data.side ∈ {N, E}). BUILDING_SIZE=32 서버와 동일.
  const CL_BUILDING_SIZE = 32;
  function clCellOf(x, y) { return { cx: Math.floor(x / CL_BUILDING_SIZE), cy: Math.floor(y / CL_BUILDING_SIZE) }; }
  function clHasWallAt(absX, absY, cellCx, cellCy, side, floor) {
    // 모든 zone conns의 buildings 다 검색 (zone 경계 cross 시 이웃 zone wall도 적용)
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const ox = zm.worldOffsetX || 0, oy = zm.worldOffsetY || 0;
      // absX/Y → 이 zone의 local 좌표
      const lx = absX - ox, ly = absY - oy;
      if (lx < -64 || lx > (zm.zoneWidth || 10240) + 64) continue;
      if (ly < -64 || ly > (zm.zoneHeight || 10240) + 64) continue;
      const targetCx = cellCx - Math.floor(ox / CL_BUILDING_SIZE);
      const targetCy = cellCy - Math.floor(oy / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        if (b.type !== 'wall' && b.type !== 'fence') continue;
        if ((b.floor || 0) !== floor) continue;
        const bSide = b.data?.side;
        if (!bSide) continue; // 옛 큐브 wall은 무시
        const bcx = Math.floor(b.x / CL_BUILDING_SIZE);
        const bcy = Math.floor(b.y / CL_BUILDING_SIZE);
        if (bcx === targetCx && bcy === targetCy && bSide === side) return true;
      }
    }
    return false;
  }
  function clientIsBlockedByWall(newX, newY, oldX, oldY, playerFloor = 0) {
    const oc = clCellOf(oldX, oldY);
    const nc = clCellOf(newX, newY);
    if (oc.cx === nc.cx && oc.cy === nc.cy) return false;
    let blocked = false, reason = '';
    if (nc.cx > oc.cx && clHasWallAt(oldX, oldY, oc.cx, oc.cy, 'E', playerFloor)) { blocked = true; reason = 'E'; }
    else if (nc.cx < oc.cx && clHasWallAt(newX, newY, nc.cx, nc.cy, 'E', playerFloor)) { blocked = true; reason = 'W'; }
    else if (nc.cy > oc.cy && clHasWallAt(newX, newY, nc.cx, nc.cy, 'N', playerFloor)) { blocked = true; reason = 'S'; }
    else if (nc.cy < oc.cy && clHasWallAt(oldX, oldY, oc.cx, oc.cy, 'N', playerFloor)) { blocked = true; reason = 'N'; }
    // DEBUG — 클라가 어떤 cell→cell 시도하는지, 막힘/통과 결과까지
    if (window._collDbg !== false) {
      console.log(`[coll] cell ${oc.cx},${oc.cy}→${nc.cx},${nc.cy} f${playerFloor} ${blocked ? 'BLOCKED:' + reason : 'pass'} (zones: ${Array.from(conns.keys()).map(k => k + ':' + (conns.get(k).buildings?.size||0)).join(',')})`);
    }
    return blocked;
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
  function worldNow() {
    return Date.now() + (worldClock ? worldClock.serverNowOffset : 0);
  }
  function worldPhase() {
    if (!worldClock) return 0.2; // 기본: 한낮
    const t = (worldNow() - worldClock.epoch) % worldClock.dayLengthMs;
    return t / worldClock.dayLengthMs;
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
    // Phase 14.46-a-fix: 이동 키 누르는 즉시도 송신 (시작 지연도 줄임)
    if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k.startsWith('arrow')) {
      sendInput();
    }
    // Phase 14.41: 다운 중엔 행동 키 차단 (R 키 구조 시도만 별도 처리 — 본인이 다운 아닐 때만)
    if (myIsDown) {
      // 다운 중엔 어떤 행동도 안 함 — 부활 패널에서만 클릭
      return;
    }
    if (k === 'e') sendPrimary({ type: 'gather' });
    else if (k === 'c' && e.shiftKey) sendPrimary({ type: 'claim', kind: 'guild' });  // 길드 영토 (Shift+C)
    else if (k === 'c') sendPrimary({ type: 'claim', kind: 'personal' });  // 개인 사유지 (1 grid)
    else if (k === 't' && !e.shiftKey) sendPrimary({ type: 'claim', kind: 'temporary' });  // 임시 사유지 (1 grid)
    else if (k === 't') sendPrimary({ type: 'trade_offer', give: 'wood' });
    else if (k === 'y') sendPrimary({ type: 'trade_offer', give: 'stone' });
    else if (k === 'f') { sendPrimary({ type: 'attack' }); myLastAttackAt = performance.now(); }
    else if (k === 'b') sendPrimary({ type: 'build', buildType: 'wall', floor: myBuildFloor });
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
    else if (k === ',') sendPrimary({ type: 'change_floor', direction: 'down' });
    else if (k === '.') sendPrimary({ type: 'change_floor', direction: 'up' });
    else if (k === 'u') sendPrimary({ type: 'build', buildType: 'stair', floor: myBuildFloor });
    else if (k === 'm') toggleMarketplace();
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
    // Phase 14.46-a-fix: WASD/Arrow를 떼면 즉시 input 송신 (vx=0,vy=0) — 33ms 인터벌 기다리지 말고.
    // 이게 빠지면 ping이 200ms일 때 키 뗀 뒤 ~250ms간 더 걷는 현상 발생.
    if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k.startsWith('arrow')) {
      sendInput();
    }
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
      else if (a === 'build_farmland') sendPrimary({ type: 'build', buildType: 'farmland', floor: myBuildFloor });
      else if (a === 'build_stair') sendPrimary({ type: 'build', buildType: 'stair', floor: myBuildFloor });
      else if (a === 'build_floor') sendPrimary({ type: 'build', buildType: 'floor', floor: myBuildFloor });
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

  // === 부트 ===
  async function boot() {
    const res = await fetch('/zones');
    const data = await res.json();
    zonesMeta = data.zones;
    marketplaceUrl = data.marketplaceUrl || '';

    // 2D 그리드 월드 크기 계산
    worldWidth = 0;
    worldHeight = 0;
    for (const z of Object.values(zonesMeta)) {
      worldWidth = Math.max(worldWidth, z.worldOffsetX + (z.zoneWidth || 1024));
      worldHeight = Math.max(worldHeight, (z.worldOffsetY || 0) + (z.zoneHeight || 1024));
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
    function refreshZoneOptions() {
      sel.innerHTML = '';
      for (const [id, z] of Object.entries(zonesMeta)) {
        const opt = document.createElement('option');
        opt.value = id;
        const popPart = (z.population !== null && z.population !== undefined && z.cap)
          ? ` · ${z.population}/${z.cap}명${z.full ? ' (가득참)' : ''}`
          : '';
        opt.textContent = `${z.displayName} (RTT ≈ ${(z.simulatedLatencyMs || 0) * 2}ms)${popPart}`;
        if (z.full) opt.disabled = true;
        if (id === data.defaultZone && !z.full) opt.selected = true;
        sel.appendChild(opt);
      }
    }
    refreshZoneOptions();

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
        const zW = zm.zoneWidth || 1024, zH = zm.zoneHeight || 1024;
        const localX = Math.max(0, Math.min(zW, myAbsPredicted.x - zm.worldOffsetX));
        const localY = Math.max(0, Math.min(zH, myAbsPredicted.y - (zm.worldOffsetY||0)));
        c.ws.send(JSON.stringify({ type: 'viewport_update', x: localX, y: localY }));
      }
    }, 1000);

    refreshHealth();
    setInterval(refreshHealth, 3000);

    // Phase 14.30: 캔버스 mousemove → placement cursor 갱신
    canvas.addEventListener('mousemove', (e) => {
      if (!placementMode) return;
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const ix = px - W/2 + myIso.x;
      const iy = py - H/2 + myIso.y;
      placementCursor.wx = ix * 0.5 + iy;
      placementCursor.wy = iy - ix * 0.5;
    });

    // Phase 14.22: 캔버스 클릭 → screen → world 좌표 변환 → chest bbox hit-test
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      // 캔버스 안 픽셀 좌표 (canvas.width/height와 css width/height 다를 수 있으니 스케일)
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      // toScreen 역: ix = px - W/2 + camX; iy = py - H/2 + camY
      const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const ix = px - W/2 + myIso.x;
      const iy = py - H/2 + myIso.y;
      // iso 역변환: wx = ix/2 + iy, wy = iy - ix/2
      const clickWx = ix * 0.5 + iy;
      const clickWy = iy - ix * 0.5;
      // Phase 14.30: placement mode 우선 — 그 위치에 빌드
      if (placementMode) {
        // 사용자 위치에서 거리 체크 (160px)
        const distMe = Math.hypot(clickWx - myAbsPredicted.x, clickWy - myAbsPredicted.y);
        if (distMe > 160) { showNotice('너무 멀어서 거기에 못 지음 (160px)'); return; }
        // server는 player.x/y 기준으로 빌드. teleport는 없어서 일단 사용자 위치 그대로 빌드 (cell 정렬은 서버)
        // TODO: 클릭 위치에 빌드하려면 서버 메시지 확장 필요. 지금은 사용자 위치 정렬.
        sendPrimary({ type: 'build', buildType: placementMode.type, floor: placementMode.floor, atX: clickWx, atY: clickWy });
        // 모드 종료 안 함 — Shift 누른 채면 연속 빌드, 평소엔 한 번
        if (!e.shiftKey) { placementMode = null; showNotice('배치 모드 종료'); }
        return;
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
      // 2) chest bbox hit-test (chest는 32×32 cell, b.x/b.y가 cell 중심)
      let hitChest = null;
      for (const c of conns.values()) {
        if (!c.meta) continue;
        const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
        for (const b of c.buildings.values()) {
          if (b.type !== 'chest') continue;
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
        if (typeof openInvWithContainer === 'function') openInvWithContainer(hitChest.id);
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

  async function refreshHealth() {
    try {
      const r = await fetch('/health');
      const h = await r.json();
      const lines = Object.entries(h).map(([id, s]) =>
        `${id}: ${s.up ? '🟢 ' + (s.players ?? 0) + '명' : '🔴 down'}`);
      document.getElementById('health').innerText = lines.join('  ');
    } catch (e) { /* ignore */ }
  }

  // === 연결 관리 ===
  function connect(zoneId, role, transfer) {
    const existing = conns.get(zoneId);
    if (existing) {
      if (existing.role !== role) existing.role = role;
      if (role === 'primary') primaryZoneId = zoneId;
      return;
    }
    const meta = zonesMeta[zoneId];
    if (!meta) return;
    const params = new URLSearchParams();
    if (role === 'observer') {
      params.set('observer', '1');
      // observer는 자기 viewport(예측 좌표를 해당 zone-local로 변환) 전송
      const meta2 = zonesMeta[zoneId];
      if (meta2) {
        const zW2 = meta2.zoneWidth || 1024, zH2 = meta2.zoneHeight || 1024;
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
    };
    conns.set(zoneId, c);
    if (role === 'primary') primaryZoneId = zoneId;
    ws.onmessage = (ev) => handleMessage(zoneId, JSON.parse(ev.data));
    ws.onclose = () => { if (conns.get(zoneId) === c) conns.delete(zoneId); };
    ws.onerror = () => {};
  }

  function closeConnection(zoneId) {
    const c = conns.get(zoneId);
    if (!c) return;
    try { c.ws.close(); } catch (e) {}
    conns.delete(zoneId);
  }

  function handleMessage(zoneId, msg) {
    const c = conns.get(zoneId);
    if (!c) return;

    if (msg.type === 'welcome') {
      c.meta = msg.zone;
      c.resources.clear(); c.claims.clear(); c.buildings.clear(); c.mobs.clear();
      if (c.groundItems) c.groundItems.clear();
      for (const r of (msg.resources || [])) c.resources.set(r.id, r);
      for (const cl of (msg.claims || [])) c.claims.set(cl.id, cl);
      for (const b of (msg.buildings || [])) c.buildings.set(b.id, b);
      for (const m of (msg.mobs || [])) c.mobs.set(m.mid, m);
      for (const gi of (msg.groundItems || [])) c.groundItems.set(gi.id, gi);
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
        if (msg.equipped !== undefined) equipped = msg.equipped;
        if (msg.recipes) recipes = msg.recipes;
        if (msg.cookRecipes) cookRecipes = msg.cookRecipes;
        if (msg.foodEffects) foodEffects = msg.foodEffects;
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
        if (!initialWelcomeReceived) {
          myAbsPredicted = { x: absX, y: absY };
          initialWelcomeReceived = true;
        } else {
          applyServerCorrection(absX, absY);
        }
        lastTickWithMyPidAt = performance.now();
        updateHud();
      }
    } else if (msg.type === 'tick') {
      const now = performance.now();
      if (c.role === 'primary') {
        if (lastTickAt) lastServerPingMs = now - lastTickAt;
        lastTickAt = now;
      }
      for (const pp of msg.players) {
        if (pp.pid === myPid && c.role === 'primary') {
          const absX = c.meta.worldOffsetX + pp.x;
          const absY = (c.meta.worldOffsetY || 0) + pp.y;
          myAbsPos = { x: absX, y: absY };
          applyServerCorrection(absX, absY);
          lastTickWithMyPidAt = now;
        } else {
          // 서버가 메타 필드(name/color/maxHp/tribeName)를 첫 visible 때만 보냄. 나머진 prev 캐시 유지.
          const prev = c.others.get(pp.pid);
          const buf = prev?.buf || [];
          pushSample(buf, now, pp.x, pp.y);
          const vxNow = pp.vx || 0, vyNow = pp.vy || 0;
          const fvxKeep = (vxNow !== 0 || vyNow !== 0) ? vxNow : (prev?._fvx || 1);
          const fvyKeep = (vxNow !== 0 || vyNow !== 0) ? vyNow : (prev?._fvy || 0);
          c.others.set(pp.pid, {
            pid: pp.pid,
            x: pp.x, y: pp.y,
            vx: vxNow, vy: vyNow,
            _fvx: fvxKeep, _fvy: fvyKeep, // Phase 14.37: 마지막 facing
            name: pp.name ?? prev?.name ?? '?',
            color: pp.color ?? prev?.color ?? '#5a9ae0',
            hp: pp.hp,
            maxHp: pp.maxHp ?? prev?.maxHp ?? 100,
            tribeName: pp.tribeName !== undefined ? pp.tribeName : prev?.tribeName,
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
    } else if (msg.type === 'tools_update') {
      if (msg.tools) tools = msg.tools;
      if (msg.equipped !== undefined) equipped = msg.equipped;
      updateHud(); renderCraftPanel();
    } else if (msg.type === 'resource_removed') {
      c.resources.delete(msg.id);
    } else if (msg.type === 'resource_update') {
      const r = c.resources.get(msg.id); if (r) r.hp = msg.hp;
    } else if (msg.type === 'resource_spawn') {
      c.resources.set(msg.resource.id, msg.resource);
    } else if (msg.type === 'claim_added') {
      c.claims.set(msg.claim.id, msg.claim);
    } else if (msg.type === 'claim_removed') {
      c.claims.delete(msg.id);
    } else if (msg.type === 'building_added') {
      c.buildings.set(msg.building.id, msg.building);
    } else if (msg.type === 'building_removed') {
      c.buildings.delete(msg.id);
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
    } else if (msg.type === 'mob_damaged') {
      const m = c.mobs.get(msg.mid); if (m) m.hp = msg.hp;
    } else if (msg.type === 'mob_removed') {
      c.mobs.delete(msg.mid);
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
    } else if (msg.type === 'player_left') {
      c.others.delete(msg.pid);
    } else if (msg.type === 'gauges') {
      if (typeof msg.hunger === 'number') myHunger = msg.hunger;
      if (typeof msg.thirst === 'number') myThirst = msg.thirst;
      if (typeof msg.vp === 'number') myVp = msg.vp;
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
    const zoneW = pMeta?.zoneWidth || 1024, zoneH = pMeta?.zoneHeight || 1024;
    const localX = myAbsPredicted.x - pmeta.worldOffsetX;
    const localY = myAbsPredicted.y - (pmeta.worldOffsetY || 0);
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
        connect(id, 'observer', null);
      } else if (d > PEEK_THRESHOLD * 1.6) {
        const c = conns.get(id);
        if (c && c.role === 'observer') closeConnection(id);
      }
    }
    // 멀리 떨어진 옛 observer 정리 (zone 중심과 거리)
    for (const [zid, c] of conns) {
      if (zid === primaryZoneId) continue;
      const zm = zonesMeta[zid];
      if (!zm) continue;
      const cx = zm.worldOffsetX + zoneW / 2;
      const cy = (zm.worldOffsetY || 0) + zoneH / 2;
      const dist = Math.hypot(cx - myAbsPredicted.x, cy - myAbsPredicted.y);
      if (dist > zoneW * 1.7) closeConnection(zid);
    }
  }

  // === WASD = 월드 방향 ===
  // W=북, A=서, S=남, D=동. iso 시점이라 W 단독은 화면상 ↗(우상단)으로 보이지만
  // W+A 같은 조합은 정확히 NW(월드 -0.71, -0.71) 깔끔한 비율로 떨어짐.
  // 속도 벡터 표시(맵 좌표)도 키 입력과 1:1 대응.
  function worldKeysDir() {
    let wx = 0, wy = 0;
    if (keys.has('w') || keys.has('arrowup'))    wy -= 1; // 북
    if (keys.has('s') || keys.has('arrowdown'))  wy += 1; // 남
    if (keys.has('a') || keys.has('arrowleft'))  wx -= 1; // 서
    if (keys.has('d') || keys.has('arrowright')) wx += 1; // 동
    const len = Math.hypot(wx, wy);
    if (len > 0) { wx /= len; wy /= len; }
    return { wx, wy };
  }

  // === 입력 전송 ===
  let lastInputSentAt = 0;
  function sendInput() {
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (!c || c.ws.readyState !== 1) return;
    // Phase 14.41: 다운 중이면 입력 전송 X (서버도 무시하지만 트래픽 줄임)
    if (myIsDown) {
      c.ws.send(JSON.stringify({ type: 'input', vx: 0, vy: 0, sprint: false }));
      lastInputSentAt = performance.now();
      return;
    }
    const { wx, wy } = worldKeysDir();
    // Phase 14.40: Shift = sprint. 게이지 너무 낮으면 서버에서 자동 거부.
    c.ws.send(JSON.stringify({ type: 'input', vx: wx, vy: wy, sprint: !!mySprint }));
    lastInputSentAt = performance.now();
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

  // === 메인 루프 ===
  let prevT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - prevT) / 1000);
    prevT = now;

    if (now - lastInputSentAt > 33) sendInput();

    // === 클라 사이드 wall edge 콜라이더 (server isBlockedByWall 미러) ===
    // primary zone의 buildings + 이웃 zone들도 검사 (zone 경계 cross 시).
    // wall은 cell edge에 있음 (data.side ∈ {N, E}). cell 가로지를 때만 검사.
    // BUILDING_SIZE = 32 (server와 동일).
    // 인라인 함수 X — 매 프레임 만들기 비싸서 위에 한 번 정의함

    // 클라이언트 예측: 입력으로 즉시 반응 (시각 부드러움)
    // Phase 13.9.a: wall edge 콜라이더 클라 사이드 복제 — 서버와 동일 로직
    const { wx, wy } = worldKeysDir();
    if (!myIsDown && (wx !== 0 || wy !== 0)) {
      // Phase 14.40: Shift 달리기 — 클라 예측도 1.6× (게이지 5 이하면 자동 해제)
      const canSprintClient = mySprint && myHunger > 5 && myThirst > 5;
      const speed = 220 * (canSprintClient ? 1.6 : 1);
      let nx = myAbsPredicted.x + wx * speed * dt;
      let ny = myAbsPredicted.y + wy * speed * dt;
      // 각 축 별로 wall check (slide 가능)
      if (clientIsBlockedByWall(nx, myAbsPredicted.y, myAbsPredicted.x, myAbsPredicted.y, myFloor)) nx = myAbsPredicted.x;
      if (clientIsBlockedByWall(myAbsPredicted.x, ny, myAbsPredicted.x, myAbsPredicted.y, myFloor)) ny = myAbsPredicted.y;
      if (clientIsBlockedByWall(nx, ny, myAbsPredicted.x, myAbsPredicted.y, myFloor)) { nx = myAbsPredicted.x; ny = myAbsPredicted.y; }
      myAbsPredicted.x = nx;
      myAbsPredicted.y = ny;
    }
    // 서버 권위 좌표로의 부드러운 보정 (snap 대신 lerp)
    if (now < correctionUntil) {
      myAbsPredicted.x += correctionVel.x * dt;
      myAbsPredicted.y += correctionVel.y * dt;
    }
    // 전체 월드 그리드 안으로만 clamp (2x2면 0~2048)
    myAbsPredicted.x = Math.max(0, Math.min(worldWidth - 1, myAbsPredicted.x));
    myAbsPredicted.y = Math.max(0, Math.min(worldHeight - 1, myAbsPredicted.y));

    ensurePrimaryConnection();
    checkOrphan();
    manageNeighborSubscriptions();
    render();
    updateMinimap();
    requestAnimationFrame(loop);
  }

  // === Primary WS가 죽으면 자동 재연결 (predicted 위치 그대로) ===
  function ensurePrimaryConnection() {
    if (kicked) return;
    if (!primaryZoneId) return;
    const c = conns.get(primaryZoneId);
    if (c && c.ws.readyState <= 1) return;
    const pm = zonesMeta[primaryZoneId];
    if (!pm) return;
    if (c) conns.delete(primaryZoneId);
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
  // kicked 상태에선 자동 재연결 안 함
  let kicked = false;
  // loop/setupChat 중복 시작 방지
  let loopStarted = false;
  let chatSetup = false;

  // === 서버 권위 좌표 → 클라 예측 보정 ===
  // Phase 14.15: 임계 100 → 16 (cell 절반). wall 두께 0이라 작은 desync도 즉시 lerp.
  // wall에 막혔는데 client만 자유 이동하면 server position 따라 lerp되어야 함.
  // - <16px: 무시 (정상 lag 드리프트)
  // - 16~500px: 짧은 lerp (80ms — wall 막힘 sync 빠르게)
  // - >500px: 즉시 snap
  function applyServerCorrection(absX, absY) {
    const ex = absX - myAbsPredicted.x, ey = absY - myAbsPredicted.y;
    const dist = Math.hypot(ex, ey);
    if (dist > 500) {
      myAbsPredicted = { x: absX, y: absY };
      correctionVel = { x: 0, y: 0 };
      correctionUntil = 0;
    } else if (dist > 16) {
      const T = 0.08; // 80ms — wall stick 빠르게
      correctionVel.x = ex / T;
      correctionVel.y = ey / T;
      correctionUntil = performance.now() + T * 1000;
    } else {
      correctionVel = { x: 0, y: 0 };
      correctionUntil = 0;
    }
  }

  // === Orphan 감지 — 서버에서 내 플레이어가 사라졌는데 클라는 모르는 경우 ===
  // 2초간 내 pid가 tick에 안 들어오면 primary 재연결
  function checkOrphan() {
    if (!primaryZoneId || lastTickWithMyPidAt === 0) return;
    if (performance.now() - lastTickWithMyPidAt > 2000) {
      console.warn('[recover] 내 pid가 2초간 tick에 없음 - primary 재연결');
      lastTickWithMyPidAt = performance.now(); // 무한루프 방지
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

    const myIso = w2i(myAbsPredicted.x, myAbsPredicted.y);
    const camX = myIso.x, camY = myIso.y;
    const toScreen = (ix, iy) => ({ x: ix - camX + W / 2, y: iy - camY + H / 2 });

    // 배경 — 검정 (시야 밖)
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, W, H);

    const TS = pConn.meta.tileSize;
    const worldCx = myAbsPredicted.x, worldCy = myAbsPredicted.y;
    const VIEW_RADIUS = 650;

    // === 1) 지면 다이아몬드 타일 ===
    const t0WX = Math.floor((worldCx - VIEW_RADIUS) / TS) * TS;
    const t1WX = Math.ceil((worldCx + VIEW_RADIUS) / TS) * TS;
    const t0WY = Math.floor((worldCy - VIEW_RADIUS) / TS) * TS;
    const t1WY = Math.ceil((worldCy + VIEW_RADIUS) / TS) * TS;

    for (let wx = t0WX; wx < t1WX; wx += TS) {
      for (let wy = t0WY; wy < t1WY; wy += TS) {
        // 2x2 그리드 — 어떤 zone에 속하는지 X·Y 둘 다 확인
        let zMeta = null;
        for (const zm of Object.values(zonesMeta)) {
          const ox = zm.worldOffsetX, oy = zm.worldOffsetY || 0;
          const zW3 = zm.zoneWidth || 1024, zH3 = zm.zoneHeight || 1024;
          if (wx >= ox && wx < ox + zW3 && wy >= oy && wy < oy + zH3) { zMeta = zm; break; }
        }
        if (!zMeta) continue;
        const iso = w2i(wx + TS / 2, wy + TS / 2);
        const s = toScreen(iso.x, iso.y);
        const cellWx = wx + TS/2 - worldCx;
        const cellWy = wy + TS/2 - worldCy;
        const dist = Math.hypot(cellWx, cellWy);
        let visibility = Math.max(0, 1 - Math.pow(dist / VIEW_RADIUS, 1.4));
        // Phase 14.39: 지형은 PZ식 — 시야 밖도 살짝만 어둡게 (탐험한 곳 회색)
        visibility *= coneMultGround(cellWx, cellWy, dist);
        if (visibility <= 0.02) continue;

        const n = ((wx * 73 + wy * 31) >>> 0) % 17 / 17;
        // 14.45: 위도에 따라 base color 빙하/툰드라 블렌딩
        const tileColor = latitudeColor(wy + TS/2, worldHeight, zMeta.groundColor);
        // 빙하 안 (distFromPole <= ICE_BAND_PX)은 tintColor 노이즈도 약하게
        const distFromPole = Math.min(wy + TS/2, worldHeight - (wy + TS/2));
        const isIce = distFromPole <= ICE_BAND_PX;
        ctx.globalAlpha = visibility;
        drawDiamond(s.x, s.y, TS, tileColor);
        ctx.globalAlpha = visibility * (isIce ? 0.04 + n * 0.05 : 0.08 + n * 0.1);
        drawDiamond(s.x, s.y, TS, isIce ? '#9bb5cc' : zMeta.tintColor);
        ctx.globalAlpha = 1;
      }
    }

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
      for (const b of c.buildings.values()) {
        // wall은 cell edge 좌표 (b.x, b.y = cell 좌상단). 다른 건축은 cell 중심.
        let ax, ay;
        if (b.type === 'wall') {
          const side = b.data?.side || 'N';
          // edge 중간점 — N: 북쪽 변 중간, E: 동쪽 변 중간
          if (side === 'N') { ax = ox + b.x + 16; ay = oy + b.y; }
          else /* E */     { ax = ox + b.x + 32; ay = oy + b.y + 16; }
        } else {
          ax = ox + b.x; ay = oy + b.y;
        }
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const bZ = (b.floor || 0) * FLOOR_HEIGHT;
        const iso = w2i(ax, ay, bZ);
        renderables.push({ z: (ax + ay) * 0.5 + (b.floor || 0) * 1000, kind: 'building', b, iso, ax, ay });
      }
      for (const m of c.mobs.values()) {
        const pos = sampleAt(m.buf, renderT, m.x, m.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        renderables.push({ z: iso.y, kind: 'mob', m, iso, ax, ay });
      }
      for (const o of c.others.values()) {
        const pos = sampleAt(o.buf, renderT, o.x, o.y);
        const ax = ox + pos.x, ay = oy + pos.y;
        if (Math.abs(ax - worldCx) > VIEW_RADIUS || Math.abs(ay - worldCy) > VIEW_RADIUS) continue;
        const iso = w2i(ax, ay);
        const displayName = o.tribeName ? `[${o.tribeName}] ${o.name}` : o.name;
        const oFloor = o.floor || 0;
        const oZ = oFloor * FLOOR_HEIGHT;
        const isoF = w2i(ax, ay, oZ);
        renderables.push({ z: (ax + ay) * 0.5 + oFloor * 1000 + 500, kind: 'player', pid: o.pid, name: displayName, color: o.color || '#5a9ae0', hp: o.hp, maxHp: o.maxHp, iso: isoF, ax, ay, lastAttackAt: o.lastAttackAt, vx: o.vx, vy: o.vy, _fvx: o._fvx, _fvy: o._fvy });
      }
    }
    {
      const iso = w2i(myAbsPredicted.x, myAbsPredicted.y);
      const myDisplay = myTribeName ? `[${myTribeName}] ${myName}` : myName;
      const myZ = myFloor * FLOOR_HEIGHT;
      const isoMe = w2i(myAbsPredicted.x, myAbsPredicted.y, myZ);
      renderables.push({ z: (myAbsPredicted.x + myAbsPredicted.y) * 0.5 + myFloor * 1000 + 500, kind: 'player', pid: myPid, name: myDisplay, color: myColor, hp: myHp, maxHp: myMaxHp, iso: isoMe, ax: myAbsPredicted.x, ay: myAbsPredicted.y, isMe: true });
    }

    renderables.sort((a, b) => a.z - b.z);

    // === 3) 엔티티 그리기 ===
    for (const item of renderables) {
      if (item.kind === 'claim') {
        const cl = item.cl, off = item.off, offY = item.offY || 0;
        const p1 = w2i(off + cl.x,         offY + cl.y);
        const p2 = w2i(off + cl.x + cl.w,  offY + cl.y);
        const p3 = w2i(off + cl.x + cl.w,  offY + cl.y + cl.h);
        const p4 = w2i(off + cl.x,         offY + cl.y + cl.h);
        const s1 = toScreen(p1.x, p1.y), s2 = toScreen(p2.x, p2.y);
        const s3 = toScreen(p3.x, p3.y), s4 = toScreen(p4.x, p4.y);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y);
        ctx.lineTo(s3.x, s3.y); ctx.lineTo(s4.x, s4.y); ctx.closePath();
        // Phase 14.18.b: kind별 색상 — guild(파랑)/personal(노랑)/temporary(주황)
        let fill, stroke, label;
        if (cl.kind === 'guild') {
          fill = 'rgba(90, 154, 224, 0.10)'; stroke = 'rgba(90, 154, 224, 0.45)';
          label = `🏛️ ${cl.guildTribeName || cl.ownerName}`;
        } else if (cl.kind === 'temporary') {
          fill = 'rgba(220, 130, 60, 0.16)'; stroke = 'rgba(220, 130, 60, 0.7)';
          label = `⛺ ${cl.ownerName}`;
        } else { // personal
          fill = 'rgba(240, 198, 116, 0.18)'; stroke = 'rgba(240, 198, 116, 0.8)';
          label = `🏠 ${cl.ownerName}`;
        }
        ctx.fillStyle = fill; ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        if (cl.kind === 'guild') ctx.setLineDash([]); // 길드 = 실선
        else ctx.setLineDash([6, 4]);
        ctx.stroke(); ctx.setLineDash([]);
        // 라벨은 guild는 너무 많아서 생략, personal/temporary만
        if (cl.kind !== 'guild') {
          ctx.fillStyle = stroke; ctx.font = '11px sans-serif';
          ctx.fillText(label, s1.x + 6, s1.y + 14);
        }
      } else if (item.kind === 'resource') {
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        // Phase 14.39: 자원도 entity — 시야 뒤면 안 보임. 단 거리 vignette는 부드럽게.
        let vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        vis *= coneMultEntity(item.ax - worldCx, item.ay - worldCy, d);
        if (vis < 0.05) continue;
        ctx.globalAlpha = vis;
        if (item.r.type === 'tree') drawTreeIso(s.x, s.y);
        else if (item.r.type === 'rock') drawRockIso(s.x, s.y);
        else if (item.r.type === 'berry_bush') drawBerryBushIso(s.x, s.y);
        else if (item.r.type === 'water_pool') drawWaterPoolIso(s.x, s.y);
        else if (item.r.type === 'herb') drawHerbIso(s.x, s.y);
        else if (item.r.type === 'ore') drawOreIso(s.x, s.y);
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
        const vis = coneMultEntity(item.ax - worldCx, item.ay - worldCy, d);
        if (vis < 0.05) continue;
        ctx.globalAlpha = vis;
        const icon = (ITEM_ICONS && ITEM_ICONS[gi.item]) || ({wood:'🪵',stone:'🪨'}[gi.item]) || '📦';
        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y + 3, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        // 아이콘
        ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(icon, s.x, s.y - 4);
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
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        let vis = item.isMe ? 1 : Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        // Phase 14.39: 본인 외 player는 시야 뒤면 안 보임
        if (!item.isMe) {
          vis *= coneMultEntity(item.ax - worldCx, item.ay - worldCy, d);
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
        drawPlayerIso(s.x, s.y, item.name, item.color, item.isMe, { moving, attackPhase, fvx, fvy, isDown: downFlag });
        // HP bar for others
        if (!item.isMe) {
          const o = item.hp !== undefined ? item : null;
          if (o && o.hp !== undefined && o.maxHp && o.hp < o.maxHp) {
            ctx.fillStyle = '#222'; ctx.fillRect(s.x - 14, s.y - 30, 28, 4);
            ctx.fillStyle = '#d85a5a'; ctx.fillRect(s.x - 14, s.y - 30, 28 * (o.hp / o.maxHp), 4);
          }
        }
        ctx.globalAlpha = 1;
        const bubble = speechBubbles.get(item.pid);
        if (bubble && performance.now() < bubble.until) {
          drawSpeechBubble(s.x, s.y - 32, bubble.text);
        }
      } else if (item.kind === 'building') {
        const s = toScreen(item.iso.x, item.iso.y);
        // 천장 투명 — 캐릭터 floor보다 높은 건물은 흐릿하게 (안에 들어간 느낌)
        const bf = item.b.floor || 0;
        if (bf > myFloor) ctx.globalAlpha = 0.3;
        drawBuildingIso(s.x, s.y, item.b.type, item.b);
        ctx.globalAlpha = 1;
      } else if (item.kind === 'mob') {
        const s = toScreen(item.iso.x, item.iso.y);
        const d = Math.hypot(item.ax - worldCx, item.ay - worldCy);
        let vis = Math.max(0.15, 1 - Math.pow(d / VIEW_RADIUS, 1.4));
        vis *= coneMultEntity(item.ax - worldCx, item.ay - worldCy, d);
        if (vis < 0.05) continue;
        ctx.globalAlpha = vis;
        drawMobIso(s.x, s.y, item.m);
        ctx.globalAlpha = 1;
      }
    }

    // === 4) 시야 비네팅 (다이아몬드 페이드) ===
    const grad = ctx.createRadialGradient(W/2, H/2, 100, W/2, H/2, Math.max(W, H) * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

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

    // === 5) 인접 존 방향 화살표 (4방향) ===
    drawNeighborArrow(pConn.meta.east, '동');
    drawNeighborArrow(pConn.meta.west, '서');
    drawNeighborArrow(pConn.meta.north, '북');
    drawNeighborArrow(pConn.meta.south, '남');
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

  const WALL_HEIGHT = 32; // FLOOR_HEIGHT와 같음 — 1F가 0F에 딱 쌓임
  function drawBuildingIso(x, y, type, building) {
    if (type === 'farmland') {
      // 갈색 흙 다이아 + 작물
      const data = building?.data || {};
      const readyAt = data.readyAt || 0;
      const now = Date.now();
      const isReady = now >= readyAt;
      const growProgress = readyAt > data.plantedAt ? Math.min(1, (now - data.plantedAt) / (readyAt - data.plantedAt)) : 1;
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
        ctx.fillStyle = '#8a7a5c'; ctx.fill(); ctx.stroke(); // 나무색
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
        ctx.fillStyle = '#8a7a5c'; ctx.fill(); ctx.stroke();
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
      // 바닥 — 평평한 다이아 (입체감 약간만)
      const data = building?.data || {};
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y - 16); ctx.lineTo(x + 16, y - 8);
      ctx.lineTo(x, y); ctx.lineTo(x - 16, y - 8); ctx.closePath();
      ctx.fillStyle = '#8a6a4a'; ctx.fill();
      ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 0.5; ctx.stroke();
    } else if (type === 'chest') {
      // 나무상자
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y - 12); ctx.lineTo(x + 14, y - 4);
      ctx.lineTo(x, y + 4); ctx.lineTo(x - 14, y - 4); ctx.closePath();
      ctx.fillStyle = '#a87246'; ctx.fill();
      ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 14, y - 4); ctx.lineTo(x + 14, y + 4);
      ctx.lineTo(x, y + 12); ctx.lineTo(x, y + 4); ctx.closePath();
      ctx.fillStyle = '#7c5232'; ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 4); ctx.lineTo(x - 14, y + 4);
      ctx.lineTo(x, y + 12); ctx.lineTo(x, y + 4); ctx.closePath();
      ctx.fillStyle = '#946040'; ctx.fill(); ctx.stroke();
      // 자물쇠 노란점
      ctx.fillStyle = '#f0c674';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    } else if (type === 'fence') {
      // 나무 울타리 — 세로 막대 2개 + 가로 두 줄
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 5, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6a4828'; ctx.lineWidth = 2;
      // 두 세로 막대
      ctx.beginPath(); ctx.moveTo(x - 10, y + 3); ctx.lineTo(x - 8, y - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 10, y + 3); ctx.lineTo(x + 8, y - 10); ctx.stroke();
      // 가로 두 줄
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 9, y - 2); ctx.lineTo(x + 9, y - 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 9, y - 7); ctx.lineTo(x + 9, y - 7); ctx.stroke();
    } else if (type === 'stair') {
      // 계단 — 사선 단들
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6a4828'; ctx.lineWidth = 1.5;
      ctx.fillStyle = '#8a6a3a';
      // 3개 단
      for (let i = 0; i < 3; i++) {
        const yy = y + 4 - i * 6;
        ctx.fillRect(x - 10 + i * 3, yy - 4, 18 - i * 5, 4);
        ctx.strokeRect(x - 10 + i * 3, yy - 4, 18 - i * 5, 4);
      }
      ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#cdd6e3';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
      ctx.strokeText('계단 ,/.', x, y - 18); ctx.fillText('계단 ,/.', x, y - 18);
      ctx.textAlign = 'start';
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

  function drawTreeIso(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 4, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(x - 2, y - 4, 4, 10);
    ctx.beginPath();
    ctx.ellipse(x, y - 12, 11, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2d5a2a'; ctx.fill();
    ctx.strokeStyle = '#1a3a18'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x - 3, y - 16, 4, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
  }

  function drawRockIso(x, y) {
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

  function drawBerryBushIso(x, y) {
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
  function drawHerbIso(x, y) {
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
  function drawOreIso(x, y) {
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

    // 몸통 (bob 적용)
    ctx.fillStyle = color;
    ctx.fillRect(lx - 5, ly - 6 + bob, 10, 12);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.strokeRect(lx - 5, ly - 6 + bob, 10, 12);

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

    // 이름표
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#fff' : '#cdd6e3';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(name, x, y - 22);
    ctx.fillText(name, x, y - 22);
    ctx.textAlign = 'start';
  }

  // === HUD ===
  // 음식 아이콘 매핑 (인벤토리 표시 + 클릭 시 'eat' 송신)
  const ITEM_ICONS = {
    berry: '🫐', fiber: '🌾', meat_raw: '🥩', meat_cooked: '🍗',
    hide: '🦌', berry_jam: '🍯', water_bottle: '🥤',
    seed_berry: '🌱', herb: '🌿', ore: '⛏️',
  };
  const ITEM_LABEL = {
    berry: '베리', fiber: '풀', meat_raw: '날고기', meat_cooked: '구운고기',
    hide: '가죽', berry_jam: '베리잼', water_bottle: '물병',
    seed_berry: '베리씨앗', herb: '약초', ore: '광물',
  };

  function updateHud() {
    document.getElementById('invWood').textContent = inventory.wood || 0;
    document.getElementById('invStone').textContent = inventory.stone || 0;
    const eqEl = document.getElementById('equippedBadge');
    if (eqEl) {
      const icons = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️' };
      eqEl.textContent = equipped ? `${icons[equipped] || ''} ${equipped}` : '맨손';
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
      document.getElementById('hungerText').textContent = `🍖 ${Math.round(myHunger)}`;
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
        sp.textContent = `${ITEM_ICONS[k]} ${ITEM_LABEL[k]} ${inventory[k]}`;
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
      document.getElementById('coordBadge').textContent =
        `월드(${Math.round(myAbsPredicted.x)}, ${Math.round(myAbsPredicted.y)}) · 로컬(${Math.round(lx)}, ${Math.round(ly)})`;
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
    if (!row.dataset.built) {
      row.innerHTML = '';
      // 2x2 그리드 — worldOffsetY 작은 순(=북 먼저), Y가 같으면 X 작은 순(=서 먼저)
      const ordered = Object.values(zonesMeta).sort((a, b) => {
        const ay = a.worldOffsetY || 0, by = b.worldOffsetY || 0;
        if (ay !== by) return ay - by;
        return a.worldOffsetX - b.worldOffsetX;
      });
      row.style.display = 'grid';
      row.style.gridTemplateColumns = 'repeat(2, 1fr)';
      row.style.gap = '3px';
      for (const z of ordered) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        cell.style.background = z.groundColor;
        cell.dataset.zone = z.id;
        const label = document.createElement('span');
        label.innerHTML = `${z.displayName.split(' ')[0]}<br/><small>${(z.simulatedLatencyMs || 0) * 2}ms</small>`;
        cell.appendChild(label);
        const dot = document.createElement('div');
        dot.className = 'mini-dot';
        cell.appendChild(dot);
        row.appendChild(cell);
      }
      row.dataset.built = '1';
    }
    for (const cell of row.children) {
      const id = cell.dataset.zone;
      cell.classList.toggle('active', id === primaryZoneId);
      const c = conns.get(id);
      cell.style.opacity = id === primaryZoneId ? 1 : (c && c.role === 'observer') ? 0.85 : 0.45;
      const dot = cell.querySelector('.mini-dot');
      if (dot) {
        if (id === primaryZoneId) {
          dot.style.display = 'block';
          const zm = zonesMeta[id];
          const localX = myAbsPredicted.x - zm.worldOffsetX;
          const localY = myAbsPredicted.y - (zm.worldOffsetY || 0);
          const zmm = zonesMeta[primaryZoneId];
          const zWmm = zmm?.zoneWidth || 1024, zHmm = zmm?.zoneHeight || 1024;
          dot.style.left = `${(localX / zWmm) * 100}%`;
          dot.style.top = `${(localY / zHmm) * 100}%`;
        } else {
          dot.style.display = 'none';
        }
      }
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
  function renderCraftPanel() {
    const list = document.getElementById('craftList');
    if (!list) return;
    list.innerHTML = '';
    const eqLabel = equipped ? `${TOOL_ICONS[equipped]||''} ${TOOL_LABELS[equipped]||equipped}` : '없음';
    const eqEl = document.getElementById('equippedNow');
    if (eqEl) eqEl.textContent = eqLabel;
    for (const [name, r] of Object.entries(recipes)) {
      const have = tools[name] || 0;
      const canCraft = (inventory.wood || 0) >= r.wood && (inventory.stone || 0) >= r.stone;
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
      const costStr = Object.entries(r.cost).map(([k, v]) => `${ITEM_ICONS[k]||k} ${v}`).join(' · ');
      const prodStr = Object.entries(r.produces).map(([k, v]) => `${ITEM_ICONS[k]||k} ×${v}`).join(' ');
      const row = document.createElement('div');
      row.className = 'craft-row';
      row.innerHTML = `
        <div class="craft-icon">${ITEM_ICONS[name] || '🍳'}</div>
        <div class="craft-info">
          <div class="craft-name">${r.label} → ${prodStr}</div>
          <div class="craft-cost">${costStr}</div>
        </div>
        <button class="craft-btn" data-cook="${name}" ${canCook ? '' : 'disabled'}>요리</button>
      `;
      list.appendChild(row);
    }
    list.querySelectorAll('[data-cook]').forEach(b => b.onclick = () => sendPrimary({ type: 'cook', recipe: b.dataset.cook }));
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
          .map(([k,v]) => `${ITEM_ICONS[k]||k} ${v}`).join(' · ') || '(비어있음)';
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
      craft: '🔨 제작', build: '🏗️ 건축', tribe: '🛡️ 길드', market: '🏪 거래소',
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
  });

  function renderSide(name) {
    const body = document.getElementById('spBody');
    if (name === 'craft') renderCraftPanel2(body);
    else if (name === 'build') renderBuildPanel(body);
    else if (name === 'claims') renderClaimsPanel(body);
    else if (name === 'tribe') { body.innerHTML = '<div id="tribeBody"></div>'; renderTribePanel(); }
    else if (name === 'market') renderMarketPanel(body);
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
    wood: '자재', stone: '자재', ore: '자재',
    berry: '음식', meat_raw: '음식', meat_cooked: '음식', berry_jam: '음식', herb: '약초',
    water_bottle: '음료',
    fiber: '잡화', seed_berry: '씨앗', hide: '잡화',
    axe: '도구', pickaxe: '도구', sword: '도구',
  };

  // 근처 모든 chest (120px 반경)
  function nearbyContainers() {
    const list = [];
    if (!primaryZoneId) return list;
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.meta) return list;
    const ox = pc.meta.worldOffsetX || 0, oy = pc.meta.worldOffsetY || 0;
    for (const b of pc.buildings.values()) {
      if (b.type !== 'chest') continue;
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
    const conts = nearbyContainers();
    // 바닥 탭 항상 마지막에. activeContainerId === 'ground' 면 바닥 표시
    if (activeContainerId && activeContainerId !== 'ground' && !conts.find(c => c.b.id === activeContainerId)) activeContainerId = null;
    if (!activeContainerId) activeContainerId = conts.length > 0 ? conts[0].b.id : 'ground';
    const activeC = (activeContainerId !== 'ground' && activeContainerId) ? conts.find(c => c.b.id === activeContainerId)?.b : null;
    const isGround = (activeContainerId === 'ground');

    const rowsHtml = (inv, kind, chestId) => {
      const entries = Object.entries(inv).filter(([k, v]) => v > 0).sort((a, b) => {
        const ca = ITEM_CAT[a[0]] || 'zzz', cb = ITEM_CAT[b[0]] || 'zzz';
        return ca.localeCompare(cb) || a[0].localeCompare(b[0]);
      });
      if (entries.length === 0) return `<tr><td colspan="4" style="color:#6c7686;text-align:center;padding:20px">(비어있음)</td></tr>`;
      return entries.map(([k, v]) => {
        const icon = (ITEM_ICONS && ITEM_ICONS[k]) || ({wood:'🪵',stone:'🪨'}[k]) || '📦';
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

    const myCount = Object.values(inventory).filter(v => v > 0).length;
    // 좌: 내 인벤
    const myTable = `<div class="inv-col" data-drop-target="mine">
      <div class="inv-col-head">🎒 내 인벤토리<span class="col-count">(${myCount}종)</span></div>
      <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
        <table class="inv-table">
          <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
          <tbody>${rowsHtml(inventory, 'mine', activeC ? activeC.id : (isGround ? 'ground' : null))}</tbody>
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
            const icon = (ITEM_ICONS[gi.item]) || ({wood:'🪵',stone:'🪨'}[gi.item]) || '📦';
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
      const chestCount = Object.values(activeC.data || {}).filter(v => v > 0).length;
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
    body.querySelectorAll('[data-cid]').forEach(t => {
      if (!t.classList.contains('cont-tab')) return;
      t.onclick = () => { activeContainerId = t.dataset.cid; renderInvPanel(body); };
    });

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
        const icon = (ITEM_ICONS && ITEM_ICONS[item]) || ({wood:'🪵',stone:'🪨'}[item]) || '📦';
        const label = (ITEM_LABEL && ITEM_LABEL[item]) || item;
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.textContent = `${icon} ${label}`;
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
    const recipes = {
      tool: [
        { id: 'axe',     icon: '🪓', name: '도끼',     cost: { wood: 2, stone: 1 }, equip: 1 },
        { id: 'pickaxe', icon: '⛏️', name: '곡괭이',  cost: { wood: 2, stone: 2 }, equip: 2 },
        { id: 'sword',   icon: '⚔️', name: '검',       cost: { wood: 1, stone: 3 }, equip: 3 },
      ],
      food: [
        { id: 'cook_meat', icon: '🍗', name: '고기 굽기', cost: { meat_raw: 1 }, needCampfire: true },
        { id: 'berry_jam', icon: '🍯', name: '베리잼',    cost: { berry: 3 } },
        { id: 'water_bottle', icon: '🥤', name: '물병', cost: { fiber: 2 } },
      ],
    };
    const cats = [
      { id: 'tool', label: '🔧 도구' },
      { id: 'food', label: '🍖 음식/요리' },
    ];
    const items = recipes[craftCat] || [];
    body.innerHTML = `
      <div class="craft-layout">
        <div class="craft-cats">
          ${cats.map(c => `<div class="craft-cat ${c.id===craftCat?'active':''}" data-cat="${c.id}">${c.label}</div>`).join('')}
        </div>
        <div class="craft-items">
          ${items.map(r => {
            const canMake = Object.entries(r.cost).every(([k,v]) => (inventory[k]||0) >= v);
            const costStr = Object.entries(r.cost).map(([k,v]) => `${(ITEM_ICONS&&ITEM_ICONS[k])||k} ${v}`).join(' · ');
            return `<div class="craft-recipe ${canMake?'can-make':'cant-make'}">
              <div class="cr-icon">${r.icon}</div>
              <div class="cr-info"><div class="cr-name">${r.name}</div><div class="cr-cost">${costStr}${r.needCampfire?' · 🔥 필요':''}</div></div>
              <button data-craft="${r.id}" ${canMake?'':'disabled'}>제작</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    body.querySelectorAll('[data-cat]').forEach(c => c.onclick = () => { craftCat = c.dataset.cat; renderCraftPanel2(body); });
    body.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => {
      const id = b.dataset.craft;
      if (id === 'axe' || id === 'pickaxe' || id === 'sword') sendPrimary({ type: 'craft', recipe: id });
      else if (id === 'cook_meat') sendPrimary({ type: 'cook', recipe: 'meat_cooked' });
      else if (id === 'berry_jam') sendPrimary({ type: 'cook', recipe: 'berry_jam' });
      else if (id === 'water_bottle') sendPrimary({ type: 'cook', recipe: 'water_bottle' });
    });
  }

  // === 건축 메뉴 (카테고리별 카드) ===
  function renderBuildPanel(body) {
    const items = [
      { id: 'wall',      icon: '🧱', name: '벽',       cost: '🪵2 🪨1', key: 'B' },
      { id: 'floor',     icon: '⬜', name: '바닥',     cost: '🪵1',      key: '-' },
      { id: 'stair',     icon: '🪜', name: '계단',     cost: '🪵4 🪨2', key: 'U' },
      { id: 'fence',     icon: '🪵', name: '울타리',  cost: '🪵1',      key: 'L' },
      { id: 'chest',     icon: '📦', name: '상자',     cost: '🪵5 🪨2', key: 'H' },
      { id: 'campfire',  icon: '🔥', name: '모닥불',  cost: '🪵3 🪨2', key: 'J' },
      { id: 'farmland',  icon: '🌱', name: '농지',     cost: '🌱1',      key: 'P' },
      // 공성캠프 제거 — 임시 사유지(claim) 시스템으로 대체 예정 (Phase 14.18)
    ];
    body.innerHTML = `
      <div style="font-size:11px;color:#8a93a0;margin-bottom:8px">건축물 카드 클릭 → 현재 위치(${0}F=${0}, 1F=${1}, ...)에 즉시 설치 · 층 변경: <b>Z/X</b></div>
      <div class="build-grid">
        ${items.map(i => `<div class="build-card" data-build="${i.id}">
          <div class="bc-icon">${i.icon}</div>
          <div class="bc-name">${i.name}</div>
          <div class="bc-cost">${i.cost}</div>
          <div class="bc-key">단축키 ${i.key}</div>
        </div>`).join('')}
      </div>`;
    body.querySelectorAll('[data-build]').forEach(c => c.onclick = () => {
      const type = c.dataset.build;
      const fl = myBuildFloor;
      // Phase 14.30: placement mode. 마우스 따라 ghost cell + 클릭으로 그 위치에 빌드
      placementMode = { type, floor: fl };
      showNotice(`🏗️ ${type} 배치 모드 — 캔버스 클릭으로 빌드, Esc로 취소`);
      closeSide(); // 패널 닫고 캔버스 보이게
    });
  }

  // === 거래소 패널 (기존 modal 코드 재활용) ===
  function renderMarketPanel(body) {
    body.innerHTML = `
      <div class="market-form">
        <label>아이템:
          <select id="m2Item"><option value="wood">🪵 나무</option><option value="stone">🪨 돌</option></select>
        </label>
        <label>수량: <input id="m2Amount" type="number" value="1" min="1" max="99" /></label>
        <label>개당 가격: <input id="m2Price" type="number" value="1" min="1" max="99" /></label>
        <button id="m2Buy" class="buy">구매</button>
        <button id="m2Sell" class="sell">판매</button>
      </div>
      <div class="market-hint">반대 통화로 거래 (나무 거래는 돌로, 돌 거래는 나무로). 게스트 불가.</div>
      <div id="m2Orders" style="margin-top:12px"></div>`;
    document.getElementById('m2Buy').onclick = () => {
      const item = document.getElementById('m2Item').value;
      const amount = parseInt(document.getElementById('m2Amount').value, 10);
      const price = parseInt(document.getElementById('m2Price').value, 10);
      sendPrimary({ type: 'market_order', side: 'buy', item, amount, price });
    };
    document.getElementById('m2Sell').onclick = () => {
      const item = document.getElementById('m2Item').value;
      const amount = parseInt(document.getElementById('m2Amount').value, 10);
      const price = parseInt(document.getElementById('m2Price').value, 10);
      sendPrimary({ type: 'market_order', side: 'sell', item, amount, price });
    };
    // 활성 주문
    fetch('/market/orders').then(r => r.json()).then(d => {
      const orders = d.orders || [];
      document.getElementById('m2Orders').innerHTML = '<div class="inv-col-head">활성 주문</div>' +
        (orders.length ? orders.map(o => `<div class="sp-list-row">${o.side==='buy'?'🟢 구매':'🔴 판매'} ${o.item} ×${o.amount} @ ${o.price}</div>`).join('') : '<div style="color:#6c7686;padding:10px">(주문 없음)</div>');
    }).catch(() => {});
  }
})();
