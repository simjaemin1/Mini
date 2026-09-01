// @@split:80-bigmap — 상세 미니맵(IIFE 껍데기 유지)

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

  // ★★[T39 2026-09-01] **열어 둔 지도가 낡지 않게.**
  //   실측(`scripts/e2e-bigmap-live.js`): 지도를 열어 둔 채 77px 걸어도 화면 평균 화소 차가 **0.00** 이었다.
  //   이 파일의 `needsRedraw` 를 세우는 것은 사람의 손짓뿐이었기 때문이다(열기·줌·드래그·내 위치 버튼).
  //   ⚠바깥 조각들이 32번 대입하는 `needsRedraw` 는 **다른 변수**다 — 바깥엔 선언이 없어 window 속성이고,
  //     이 파일의 `let needsRedraw`(L32)가 그 이름을 가린다. 그걸 읽는 길도 있지만 안 골랐다:
  //     32번 중 20여 개가 `window.__mt*` 같은 **디버그 손잡이**라, 읽으면 콘솔을 만질 때마다 지도가 다시 그려진다.
  //   ⇒ 지도가 **자기가 그리는 것**만 본다. 열어 둔 채 바뀌는 것은 내 위치 표식이다.
  //   ⇒ 매 프레임이 아니라 LIVE_MS 마다 본다 — 표식은 살아 있고, 다시 그리기는 4Hz 를 안 넘는다.
  const LIVE_MS = 250;
  let _liveKey = '', _liveAt = 0;
  function pollLive(now) {
    if (now - _liveAt < LIVE_MS) return;
    _liveAt = now;
    const me = getMyAbs();
    const k = me && typeof me.x === 'number' ? `${Math.round(me.x)},${Math.round(me.y)}` : '';
    if (k !== _liveKey) { _liveKey = k; needsRedraw = true; }
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
