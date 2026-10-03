// @@split:80-bigmap — 상세 미니맵(IIFE 껍데기 유지)

// ============================================================
// Phase 5-2-mini: 상세 미니맵 (cell 단위 zoom/pan)
// ============================================================
// ★★[T565 2026-09-30 · 재민 실기] **지도 = 존의 셀 술어가 답한 그림.** 이 파일은 지형을 판정하지 않는다.
//   종전: 지형 json 의 **벡터**(산맥 띠 stroke · 호수 wobble · 숲 타원 · 클라 거울의 광맥 원)를 여기서 그렸고,
//     걷는 셀은 존의 술어(바위 · 물 = 해안 띠 ∪ 강·호수 · 다리)가 판정했다 — **다른 함수**라 지도가 땅과 어긋났다.
//     자(`scripts/t565-map-audit.js` · 19존): 셀 물의 74.6% 가 지도에 없었다(해안 띠) · 다리 100% 없음 ·
//     광맥 90% 어긋남(클라 거울은 절차 광맥을 쥔다) · 새벌 동쪽 산맥 띠 위의 닛폰 고개 둘(쇠재·한재)을 막힌 띠로 그렸다
//     (줌인하면 빈 셀 — 재민이 본 그것).
//   이제: 그림은 **존이 구운 PNG** 다(`GET <존>/bigmap.png` · 지도 픽셀 하나 = 4×4셀의 가운데 셀 표본).
//     줌인(셀이 화면 4px 이상 · 배율 ≥ 0.125)은 같은 함수로 구운 **1셀 = 1픽셀 조각**(`?tile=TX,TY` · 64×64셀)이다 ⇒ 줌인/줌아웃이 같은 답.
//     벡터로 남긴 것은 **이름표 · 강 중심선**(4×4 표본이 가는 강을 점선으로 만든다 — 줄은 물 칸 색이 아니라 옅은 선이다)뿐이다.
//     (종전 [11차]는 산맥을 그린 뒤 제 존의 고개·계곡을 도로 뚫어 판정 순서를 흉내 냈지만, 이웃 존의 고개(T408 접합)·해안 띠·다리·
//      서버 광맥은 못 봤다 — 흉내는 원본이 바뀔 때마다 뒤처진다. 이제 흉내 0: 그림이 곧 존의 답이다.)
//   ⚠사본 0 · 새 판정 0 — 색표 `TILE_COLORS` 는 서버 팔레트(`server/bigmap-bake.js COLORS`)와 같은 값을 **범례·원경 숲 점**에만 쓴다.
//   ★[T565 ③] 실시간 점 — 지도가 열려 있는 동안 붙은 존마다 1초에 한 번 `map_players` 를 묻는다(서버 팔 `T565_MAP_LIVE`).
//     남은 노란 점 · 나는 종전 그대로 빨간 점 · 점을 누르면 이름. 수신은 열린 소켓에 리스너 하나 더(30-n-net 무접촉 · T380 문법).
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
  let dragging = false, dragStartX = 0, dragStartY = 0, dragPanX = 0, dragPanY = 0, dragMoved = 0;
  let visible = false;
  let needsRedraw = true;

  // ★[T565] 색은 **서버 팔레트와 같은 값** — 그림은 서버 PNG 가 칠한다. 여기 값은 범례와 원경 숲 점(`_farBigmapDots`)에만 쓴다.
  const TILE_COLORS = {
    water:    '#1a3a6a', // 강·호수도 바다와 동일색 — 플레이어는 색으로 강·바다 구분 불가 (구분은 시스템 내부 데이터만)
    rock:     '#6e6356', // 산맥 바위
    bridge:   '#f2d492', // ★[T565] 다리(물 위 통행 칸) — 종전 지도는 안 그렸다
    ore:      '#c4682a', // 큰 광맥(주인이 큰 광맥인 칸) — ★★자잘 광맥은 지도에 안 그린다(재민 확정 · 규칙과 말은 `server/bigmap-bake.js classAt`)
    mountain: '#8a8a8a', // 절차 존의 산(돌 배수 > 1.5)
    forest:   '#2a5a2a', // 숲(숲 배수 > 1.5)
    stream:   '#80bee8', // ★[T585] 개울(건너는 얕은 물 · 랩 색) — 줌인 조각(1칸 = 1픽셀)에서 줄로 보인다 · 존 그림은 4×4 표본이라 점선
  };
  const OCEAN_COLOR = '#1a3a6a';
  const RIVER_LINE = 'rgba(120,176,232,0.9)';   // 강 중심선 — 물 칸 색과 **다른** 옅은 선(칸이 아니라 표식이다)
  // 셀이 화면에서 4px 이상이면(배율 ≥ 0.125) 1셀 = 1픽셀 조각. 그 아래는 존 그림(4×4셀 = 1픽셀)을 늘려 그린다 —
  //   4px 밑에서 조각을 부르면 한 화면이 조각 100장을 넘는다(존 CPU · 서버는 새 조각을 초당 20장까지만 굽는다).
  const ZOOM_TILE_THRESHOLD = 4 / 32;

  // ===== ★[T565 ②] 존 그림 · 줌인 조각 — 서버가 구운 PNG =====
  const TILE = 64;                   // 조각 한 변(셀) — 서버 `bigmap-bake.js TILE` 과 같은 수(서버가 `X-Bigmap-Tile` 로도 알린다)
  const _zmap = new Map();           // zid → { st:'loading'|'ok'|'wait'|'fail', bmp, ver, w, h, step, epoch, retryAt, err }
  const _tiles = new Map();          // 'zid|TX,TY' → { st, bmp, w, h, ver, retryAt }
  let _tileInflight = 0;
  let _epoch = 1;                    // 지도를 열 때마다 +1 — 존 그림을 한 번씩 다시 묻는다(ETag 가 같으면 그대로)
  let cacheTerrainVersion = 0;       // 받은 그림이 바뀔 때마다 +1(하네스·다시 그리기 신호)
  function zoneBase(zid) {
    const zm = getZonesMeta();
    const m = zm && zm[zid];
    if (!m || !m.wsUrl) return null;
    return String(m.wsUrl).replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/+$/, '');
  }
  function _dirty() { cacheTerrainVersion++; needsRedraw = true; }
  function _kickLater(ms) { setTimeout(() => { if (visible) needsRedraw = true; }, ms); }   // 다시 물을 때가 되면 한 번 다시 그린다(그리기가 묻는다)
  function _dropTiles(zid) { for (const k of [..._tiles.keys()]) if (k.startsWith(zid + '|')) _tiles.delete(k); }
  function _loadZone(zid) {
    const base = zoneBase(zid);
    const now = performance.now();
    let r = _zmap.get(zid);
    if (r && (r.st === 'loading' || (r.retryAt && now < r.retryAt))) return;
    if (r && r.st === 'ok' && r.epoch === _epoch) return;
    if (!base) { _zmap.set(zid, Object.assign(r || {}, { st: 'fail', err: 'no-url', retryAt: now + 30000 })); return; }
    if (!r) { r = { st: 'loading', bmp: null, ver: null }; _zmap.set(zid, r); }
    const had = r.bmp;
    r.st = 'loading';
    fetch(base + '/bigmap.png', { cache: 'no-cache' }).then(async (res) => {
      if (res.status === 503) { r.st = had ? 'ok' : 'wait'; r.retryAt = performance.now() + 2000; if (had) r.epoch = _epoch - 1; _kickLater(2100); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ver = res.headers.get('X-Bigmap-Ver');
      if (had && ver && ver === r.ver) { r.st = 'ok'; r.epoch = _epoch; return; }   // 같은 답 — 그대로
      const bmp = await createImageBitmap(await res.blob());
      if (r.ver && ver !== r.ver) _dropTiles(zid);                                  // 답이 바뀌었다(지은 다리) — 조각도 새로
      Object.assign(r, { st: 'ok', bmp, ver, w: bmp.width, h: bmp.height, step: +res.headers.get('X-Bigmap-Step') || 4, epoch: _epoch, retryAt: 0, err: null });
      _dirty();
    }).catch((e) => { r.st = had ? 'ok' : 'fail'; r.err = String(e && e.message || e); r.retryAt = performance.now() + 30000; if (had) r.epoch = _epoch; needsRedraw = true; _kickLater(30100); });
  }
  function _loadTile(zid, TX, TY) {
    const key = zid + '|' + TX + ',' + TY;
    const now = performance.now();
    let t = _tiles.get(key);
    if (t && (t.st === 'ok' || t.st === 'loading' || (t.retryAt && now < t.retryAt))) return t;
    if (_tileInflight >= 6) return t || null;
    const base = zoneBase(zid);
    if (!base) return null;
    t = { st: 'loading' }; _tiles.set(key, t); _tileInflight++;
    fetch(base + '/bigmap.png?tile=' + TX + ',' + TY).then(async (res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const bmp = await createImageBitmap(await res.blob());
      Object.assign(t, { st: 'ok', bmp, w: bmp.width, h: bmp.height, ver: res.headers.get('X-Bigmap-Ver') || '' });
      _dirty();
    }).catch(() => { t.st = 'fail'; t.retryAt = performance.now() + 3000; _kickLater(3100); })
      .finally(() => { _tileInflight--; });
    return t;
  }
  // terrain.setHardcoded 후 외부에서 호출 — 그림은 서버 것이라 버릴 것이 없다(강 중심선만 새로 그린다)
  function invalidateAllCaches() { needsRedraw = true; }
  window.__invalidateMinimapCache = invalidateAllCaches;
  // ★[T380] **다시 그리기만** 요청하는 훅 — 원경 자료가 도착하면 열려 있는 지도에 숲 점이 바로 오르게 하는 한 줄.
  window.__bigmapDirty = () => { needsRedraw = true; };

  // ===== ★[T565 ③] 실시간 점 =====
  const LIVE_ASK_MS = 1000;          // 1초에 한 번 묻는다(카드)
  const LIVE_STALE_MS = 3500;        // 이만큼 답이 없으면 그 존의 점을 안 그린다
  const _live = new Map();           // zid → { at, players:[{pid,name,x,y}], off }
  let _liveAskAt = 0;
  let _sel = null;                   // { zid, pid } — 누른 점
  // 수신 — 열린 소켓마다 리스너를 하나 더 단다(`onmessage` 무접촉 · 남의 메시지는 파싱 전에 첫 글자로 버린다)
  function _liveHook() {
    if (typeof conns === 'undefined' || !conns) return;
    for (const [zid, c] of conns) {
      if (!c || !c.ws || c._t565Ws === c.ws) continue;
      c._t565Ws = c.ws;
      try {
        c.ws.addEventListener('message', (ev) => {
          const d = ev.data;
          if (typeof d !== 'string' || d.charCodeAt(9) !== 109 && d.charCodeAt(9) !== 98) return;   // 'm'ap_players · 'b'ridges_add
          if (d.lastIndexOf('{"type":"map_players"', 0) === 0) {
            let m = null; try { m = JSON.parse(d); } catch (e) { return; }
            _live.set(m.zone || zid, { at: performance.now(), players: Array.isArray(m.players) ? m.players : [], off: !!m.off });
            if (visible) needsRedraw = true;
          } else if (d.lastIndexOf('{"type":"bridges_add"', 0) === 0) {
            // 지은 다리 — 그 존의 그림이 바뀌었다(서버가 버전을 새로 냈다). 다음 그리기에 다시 받는다.
            const r = _zmap.get(zid); if (r) r.epoch = 0;
            _dropTiles(zid);
            if (visible) needsRedraw = true;
          }
        });
      } catch (e) { /* 리스너를 못 달아도 점만 비고 나머지는 그대로다 */ }
    }
  }
  function _liveAsk(now) {
    if (now - _liveAskAt < LIVE_ASK_MS) return;
    _liveAskAt = now;
    _liveHook();
    if (typeof conns === 'undefined' || !conns) return;
    for (const [zid, c] of conns) {
      const L = _live.get(zid);
      if (L && L.off) continue;                                   // 서버 팔이 꺼져 있다 — 이번 열기엔 다시 안 묻는다
      if (c && c.ws && c.ws.readyState === 1) { try { c.ws.send('{"type":"map_players"}'); } catch (e) {} }
    }
  }
  function _livePoints() {   // [{ zid, pid, name, ax, ay }] — 지금 그릴 남의 점
    const zm = getZonesMeta();
    const out = [];
    const now = performance.now();
    if (!zm) return out;
    for (const [zid, L] of _live) {
      if (L.off || now - L.at > LIVE_STALE_MS) continue;
      const m = zm[zid]; if (!m) continue;
      for (const p of L.players) out.push({ zid, pid: p.pid, name: p.name, ax: (m.worldOffsetX || 0) + p.x, ay: (m.worldOffsetY || 0) + p.y });
    }
    return out;
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
    needsRedraw = true;
  }

  function show() {
    panel.classList.remove('hidden');
    visible = true;
    _epoch++;                       // ★[T565] 열 때마다 존 그림을 한 번씩 다시 묻는다(같으면 그대로 · 다리가 늘었으면 새로)
    _liveAskAt = 0;
    for (const L of _live.values()) L.off = false;
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

  // ★★[T39 2026-09-01] **열어 둔 지도가 낡지 않게.**
  //   실측(`scripts/e2e-bigmap-live.js`): 지도를 열어 둔 채 77px 걸어도 화면 평균 화소 차가 **0.00** 이었다.
  //   이 파일의 `needsRedraw` 를 세우는 것은 사람의 손짓뿐이었기 때문이다(열기·줌·드래그·내 위치 버튼).
  //   ⚠바깥 조각들이 32번 대입하는 `needsRedraw` 는 **다른 변수**다 — 바깥엔 선언이 없어 window 속성이고,
  //     이 파일의 `let needsRedraw` 가 그 이름을 가린다. 그걸 읽는 길도 있지만 안 골랐다:
  //     32번 중 20여 개가 `window.__mt*` 같은 **디버그 손잡이**라, 읽으면 콘솔을 만질 때마다 지도가 다시 그려진다.
  //   ⇒ 지도가 **자기가 그리는 것**만 본다. 열어 둔 채 바뀌는 것은 내 위치 표식(+[T565] 남의 점 — 답이 오면 그 리스너가 세운다)이다.
  //   ⇒ 매 프레임이 아니라 LIVE_MS 마다 본다 — 표식은 살아 있고, 다시 그리기는 4Hz 를 안 넘는다.
  const LIVE_MS = 250;
  let _liveKey = '', _liveAt = 0;
  function pollLive(now) {
    _liveAsk(now);   // ★[T565 ③] 1초에 한 번 — 붙은 존마다 남의 자리를 묻는다
    if (now - _liveAt < LIVE_MS) return;
    _liveAt = now;
    const me = getMyAbs();
    const k = me && typeof me.x === 'number' ? `${Math.round(me.x)},${Math.round(me.y)}` : '';
    if (k !== _liveKey) { _liveKey = k; needsRedraw = true; }
  }

  // ── 줌아웃: 존 그림 + 강 중심선 ──────────────────────────────────────────
  function drawZoneOut(zid, z) {
    const zox = z.worldOffsetX || 0, zoy = z.worldOffsetY || 0;
    const zw = z.zoneWidth || 0, zh = z.zoneHeight || 0;
    const dx = zox * zoom + panX, dy = zoy * zoom + panY, dw = zw * zoom, dh = zh * zoom;
    if (z.isOcean) { ctx.fillStyle = OCEAN_COLOR; ctx.fillRect(dx, dy, dw, dh); return; }
    _loadZone(zid);
    const r = _zmap.get(zid);
    if (r && r.bmp) {
      // 그림이 화면보다 크면 압축 → 부드럽게(가는 것이 사라지지 않게) · 작으면 확대 → 가장 가까운 픽셀(4×4셀 블록 그대로)
      ctx.imageSmoothingEnabled = dw < r.w * 0.95;
      ctx.drawImage(r.bmp, 0, 0, r.w, r.h, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.fillStyle = z.groundColor || '#5a7c4a';
      ctx.fillRect(dx, dy, dw, dh);
      if (zoom > 0.005) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(r && r.st === 'fail' ? '(지도 없음 — 존에 못 닿음)' : '(지도 굽는 중)', dx + dw / 2, dy + dh / 2 + 16);
      }
    }
    // 강 중심선 — 표식(칸이 아니다). 존 사각형 밖으로 안 나가게 자른다(경계 걸침은 이웃이 제 목록으로 그린다).
    const td = window.Terrain && window.Terrain.ZONE_TERRAIN && window.Terrain.ZONE_TERRAIN[zid];
    if (td && td.rivers && td.rivers.length) {
      ctx.save();
      ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
      ctx.strokeStyle = RIVER_LINE; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const rv of td.rivers) {
        const p = rv.path || [];
        for (let i = 0; i < p.length; i++) {
          const a = p[i], x = (zox + (a.pos ? a.pos[0] : a[0])) * zoom + panX, y = (zoy + (a.pos ? a.pos[1] : a[1])) * zoom + panY;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  // ── 줌인: 1셀 = 1픽셀 조각(같은 함수 · 같은 답) ─────────────────────────────
  function drawZoneIn(zid, z) {
    const zox = z.worldOffsetX || 0, zoy = z.worldOffsetY || 0;
    const zw = z.zoneWidth || 0, zh = z.zoneHeight || 0;
    const vx0 = -panX / zoom, vy0 = -panY / zoom, vx1 = (canvas.width - panX) / zoom, vy1 = (canvas.height - panY) / zoom;
    const x1 = Math.max(zox, vx0), x2 = Math.min(zox + zw, vx1), y1 = Math.max(zoy, vy0), y2 = Math.min(zoy + zh, vy1);
    if (x2 <= x1 || y2 <= y1) return;
    const bgX = Math.floor((x1) * zoom + panX), bgY = Math.floor((y1) * zoom + panY);
    const bgW = Math.ceil((x2 - x1) * zoom) + 1, bgH = Math.ceil((y2 - y1) * zoom) + 1;
    ctx.fillStyle = z.isOcean ? OCEAN_COLOR : (z.groundColor || '#5a7c4a');
    ctx.fillRect(bgX, bgY, bgW, bgH);
    if (z.isOcean) return;
    _loadZone(zid);
    const zr = _zmap.get(zid);
    const cellPx = CELL_SIZE * zoom;
    const W = Math.ceil(zw / CELL_SIZE), H = Math.ceil(zh / CELL_SIZE);
    const cx0 = Math.max(0, Math.floor((x1 - zox) / CELL_SIZE)), cx1 = Math.min(W - 1, Math.floor((x2 - zox - 1e-6) / CELL_SIZE));
    const cy0 = Math.max(0, Math.floor((y1 - zoy) / CELL_SIZE)), cy1 = Math.min(H - 1, Math.floor((y2 - zoy - 1e-6) / CELL_SIZE));
    ctx.save();
    ctx.beginPath(); ctx.rect(bgX, bgY, bgW, bgH); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    for (let TY = Math.floor(cy0 / TILE); TY <= Math.floor(cy1 / TILE); TY++) {
      for (let TX = Math.floor(cx0 / TILE); TX <= Math.floor(cx1 / TILE); TX++) {
        const tx = (zox + TX * TILE * CELL_SIZE) * zoom + panX, ty = (zoy + TY * TILE * CELL_SIZE) * zoom + panY;
        const t = _loadTile(zid, TX, TY);
        if (t && t.st === 'ok' && t.bmp && (!zr || !zr.ver || !t.ver || t.ver === zr.ver)) {
          ctx.drawImage(t.bmp, 0, 0, t.w, t.h, tx, ty, t.w * cellPx, t.h * cellPx);
        } else if (zr && zr.bmp) {
          // 조각이 오기 전 — 존 그림의 그 자리를 키워 둔다(같은 답의 거친 판 · 비어 보이지 않게)
          const s = zr.step || 4, sx = TX * TILE / s, sy = TY * TILE / s, sw = Math.min(TILE / s, zr.w - sx), sh = Math.min(TILE / s, zr.h - sy);
          if (sw > 0 && sh > 0) ctx.drawImage(zr.bmp, sx, sy, sw, sh, tx, ty, sw * s * cellPx, sh * s * cellPx);
        }
      }
    }
    // 셀 경계선 — 셀이 6px 이상일 때만
    if (cellPx >= 6) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let cx = cx0; cx <= cx1 + 1; cx++) { const px = Math.floor((zox + cx * CELL_SIZE) * zoom + panX) + 0.5; ctx.moveTo(px, bgY); ctx.lineTo(px, bgY + bgH); }
      for (let cy = cy0; cy <= cy1 + 1; cy++) { const py = Math.floor((zoy + cy * CELL_SIZE) * zoom + panY) + 0.5; ctx.moveTo(bgX, py); ctx.lineTo(bgX + bgW, py); }
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    if (!visible) return;
    pollLive(performance.now());
    if (needsRedraw) {
      const _rT0 = performance.now();
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const zm = getZonesMeta();
      if (zm) {
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        const zin = zoom >= ZOOM_TILE_THRESHOLD;
        const marginPx = zin ? 0 : Math.max(canvas.width, canvas.height) * 0.25;
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
          if (zin) drawZoneIn(zid, z); else drawZoneOut(zid, z);
        }
        ctx.imageSmoothingEnabled = prevSmooth;

        // Phase 5-G debug: wall 위치 표시 (top-down red line, cell border 검증) — 줌인에서만
        if (zin && typeof window.__getAllWalls === 'function') {
          const walls = window.__getAllWalls();
          ctx.strokeStyle = '#ff3344';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (const w of walls) {
            // wall N: cell의 위쪽 변 → world (w.wx, w.wy) ~ (w.wx+32, w.wy) · wall E: cell의 오른쪽 변
            const x0 = (w.wx + (w.side === 'E' ? 32 : 0)) * zoom + panX, y0 = w.wy * zoom + panY;
            if (x0 < -64 || x0 > canvas.width + 64 || y0 < -64 || y0 > canvas.height + 64) continue;
            if (w.side === 'N') { ctx.moveTo(x0, y0); ctx.lineTo(x0 + 32 * zoom, y0); }
            else if (w.side === 'E') { ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + 32 * zoom); }
          }
          ctx.stroke();
        }

        // ★[T380] 이 배율이 보여 주는 만큼을 원경 층에 **요구**한다(요청은 그 층이 보낸다).
        //   지도를 닫으면 `pollLive` 가 안 돌아 이 줄도 안 돈다 — 요구는 마지막 값으로 남고,
        //   그건 이미 받아 둔 청크를 다시 안 받는다는 뜻일 뿐이다(캐시가 답한다).
        if (typeof _farWant === 'function') _farWant(Math.max(canvas.width, canvas.height) / Math.max(zoom, 1e-6) / 2);

        // ★[T380] 원경 나무 — **같은 자료**로 숲 점. 층은 `38-r1-fartree` 가 들고 있고
        //   여기는 색(타일 표의 `forest`)만 건네준다(새 색 0 · 새 표 0). 손잡이 끔이면 0을 낸다.
        if (typeof _farBigmapDots === 'function') _farBigmapDots(ctx, zoom, panX, panY, TILE_COLORS.forest);

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

        // Phase 5-C-client: 마을 자리 + 이름
        // ★★[T66] 마을 이모지(🌊·⛏️·⛰️·🌲·🏘️) 삭제 — 화면 규칙 B. 그런데 **자리는 남긴다**:
        //   글자를 그냥 빈 문자열로 두면 축소한 큰지도에서 마을이 **통째로 안 보인다**
        //   (이름은 zoom > 0.015 에서만 뜬다). ⇒ 렌더가 없으면 점선 빈 칸 — 짐 목록과 같은 문법이다.
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
              const half = zoom > 0.015 ? 5 : 3;
              ctx.save();
              ctx.setLineDash([2, 2]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,200,0.85)';
              ctx.strokeRect(Math.round(dx - half) + 0.5, Math.round(dy - half) + 0.5, half * 2, half * 2);
              ctx.restore();
              if (zoom > 0.015) {
                ctx.fillStyle = 'rgba(255,255,200,0.85)';
                ctx.font = '10px sans-serif';
                ctx.fillText(v.name, dx, dy + 12);
              }
            }
          }
          ctx.textBaseline = 'alphabetic';
        }

        // ★[T565 ③] 남의 몸 — 노란 점(누르면 이름). 이웃 존 유령은 서버가 안 싣는다(그 사람은 제 존이 답한다).
        const pts = _livePoints();
        let selPt = null;
        for (const p of pts) {
          const px = p.ax * zoom + panX, py = p.ay * zoom + panY;
          if (px < -10 || px > canvas.width + 10 || py < -10 || py > canvas.height + 10) continue;
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.stroke();
          if (_sel && _sel.zid === p.zid && _sel.pid === p.pid) selPt = { p, px, py };
        }
        if (selPt) {
          ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const label = `${selPt.p.name} · ${selPt.p.zid}`;
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(10,14,20,0.85)'; ctx.fillRect(selPt.px + 8, selPt.py - 10, tw + 10, 20);
          ctx.fillStyle = '#ffd23f'; ctx.fillText(label, selPt.px + 13, selPt.py);
          ctx.textBaseline = 'alphabetic';
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

      // ★[T565] 범례 — 그림의 색이 무엇의 답인지(서버 팔레트) · 실시간 점 상태
      {
        const items = [['바위', TILE_COLORS.rock], ['물', TILE_COLORS.water], ['다리', TILE_COLORS.bridge], ['광맥', TILE_COLORS.ore], ['숲', TILE_COLORS.forest], ['산', TILE_COLORS.mountain], ['개울', TILE_COLORS.stream]];
        ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        let lx = 8; const ly = canvas.height - 12;
        ctx.fillStyle = 'rgba(10,14,20,0.7)'; ctx.fillRect(4, ly - 10, 380, 20);
        for (const [n, c] of items) { ctx.fillStyle = c; ctx.fillRect(lx, ly - 5, 10, 10); ctx.fillStyle = '#dde'; ctx.fillText(n, lx + 13, ly); lx += 22 + ctx.measureText(n).width; }
        let nLive = 0, anyOff = false, anyOn = false;
        for (const L of _live.values()) { if (L.off) anyOff = true; else if (performance.now() - L.at <= LIVE_STALE_MS) { anyOn = true; nLive += L.players.length; } }
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(anyOn ? `사람 ${nLive}` : (anyOff ? '실시간 점 꺼짐' : ''), lx + 4, ly);
        ctx.textBaseline = 'alphabetic';
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
    dragPanX = panX; dragPanY = panY; dragMoved = 0;
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
      panX = dragPanX + (e.clientX - dragStartX);
      panY = dragPanY + (e.clientY - dragStartY);
      dragMoved = Math.max(dragMoved, Math.abs(e.clientX - dragStartX) + Math.abs(e.clientY - dragStartY));
      needsRedraw = true;
    }
    const rect = canvas.getBoundingClientRect();
    const wx = Math.round((e.clientX - rect.left - panX) / zoom);
    const wy = Math.round((e.clientY - rect.top - panY) / zoom);
    if (coordLabel) coordLabel.textContent = `(${wx},${wy})`;
  });
  canvas.addEventListener('mouseup', (e) => {
    const wasClick = dragging && dragMoved < 4;
    dragging = false; canvas.style.cursor = 'grab';
    if (!wasClick) return;
    // ★[T565 ③] 점을 누르면 이름 — 가장 가까운 점(10px 안) · 빈 곳을 누르면 걷는다
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bd = 10 * 10;
    for (const p of _livePoints()) { const dx = p.ax * zoom + panX - mx, dy = p.ay * zoom + panY - my, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = p; } }
    const nsel = best ? { zid: best.zid, pid: best.pid } : null;
    if ((nsel && (!_sel || _sel.pid !== nsel.pid || _sel.zid !== nsel.zid)) || (!nsel && _sel)) { _sel = nsel; needsRedraw = true; }
  });
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
          alert('바다는 텔레포트 불가');
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
    if (isTypingTarget(e)) return;   // ★[T61 ⓪] 규약 하나 — **캡처 단계**라 이게 없으면 제일 먼저 가로챈다
    if (visible && e.key === 'Escape') { e.preventDefault(); hide(); }
  }, true);

  // ★[T565] 하네스 훅 — 읽기 + 보기 맞추기만(세계 무변). `e2e-bigmap-live` 가 이미 `__bigMapDbg().zoom` 을 찾는다.
  window.__bigMapDbg = () => {
    const zones = {}; for (const [k, r] of _zmap) zones[k] = { st: r.st, ver: r.ver, w: r.w || 0, h: r.h || 0, err: r.err || null };
    const live = {}; for (const [k, L] of _live) live[k] = { n: L.players.length, off: L.off, ageMs: Math.round(performance.now() - L.at) };
    let tilesOk = 0; for (const t of _tiles.values()) if (t.st === 'ok') tilesOk++;
    return { zoom, panX, panY, w: canvas.width, h: canvas.height, visible, zones, tiles: _tiles.size, tilesOk, live, sel: _sel, ver: cacheTerrainVersion, pts: _livePoints().length };
  };
  window.__bigMapView = (z, wx, wy) => {   // 배율 z 로 월드 (wx,wy) 를 화면 가운데에 — 하네스·그림용
    zoom = snapZoom(Math.max(0.0005, Math.min(3.0, +z || zoom)));
    panX = Math.round(canvas.width / 2 - wx * zoom); panY = Math.round(canvas.height / 2 - wy * zoom);
    needsRedraw = true;
    return { zoom, panX, panY };
  };
})();
