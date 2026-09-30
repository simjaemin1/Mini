// public/client3d/char3d.js — ★★[T522 2026-09-29 · T539 2026-09-30] 사람을 3D 로 (재민 확정: 최종은 3D · 사람·동물만 3D · 세계·시설은 2D)
//
// ★이 파일은 손잡이 `T522_CHAR_3D` 가 켜졌을 때만 실린다(`42-r2-char.js` 가 주소창 한 칸을 보고 three.js 뒤에 붙인다).
//   끄면(기본) 요청조차 안 간다 — 시트 경로 비트 동일 · 화소 동일.
// ★그리는 자리 = **시트가 그리던 그 자리**다 — `drawCharSprite` 의 층 고리에서 'body' 층 한 장만 3D 타일로 바꾼다
//   (`api.body` · PM 결정 T539: 정본 = 제 차례 합성). 화가 순서가 그대로라 가림은 시트와 **같은 술어**다 — 새 규칙 0.
//   손잡이 값 `overlay` 는 자 전용: 내 몸(가죽 한 벌일 때)을 2D 캔버스 **위 투명 캔버스**에 얹는다(가림을 못 받는다 · T522 ⓒ).
// ★몸마다 모드 하나(T539 ①) — 나 · 남의 몸 · 주민이 같은 문을 지난다:
//   ⓐ 온 메시 — 층이 몸 + 가죽옷(메시가 가진 옷)뿐이면 옷까지 3D · 방향 **연속**(시상수 `TURN_TAU`) · 시각 연속.
//   ⓑ 몸 메시 + 시트 층 — 그 밖의 옷·도구·등짐·띠·밧줄은 **시트 그대로** 얹는다(재질 슬롯은 자리만 — 다음 카드).
//      시트 층이 몸에 붙으려면 3D 몸이 **시트 판과 같은 자세**여야 한다 ⇒ 방향 = 시트 행 × 45° · 시각 = 판 열쇠(k ÷ fps).
//   ⓒ 시트 — 클립이 안 내보내졌거나(T539 ③ 표) · 그 몸의 타일이 아직 없을 때(처음 보인 한 판) · 벤치 기준선(`mode='sheet'`).
// ★장면은 한 번(T539 ②): 한 프레임의 몸 전부를 **한 장면 · 카메라 하나 · 렌더 하나**로 그린다 — 몸마다 WebGL 판의 제 칸(타일)에
//   서도록 **화면 평면으로만** 옮겨 놓는다(직교 카메라라 옮긴 만큼 화소가 옮는다 · 깊이 무변 · 칸끼리 안 겹친다).
//   T522 는 몸마다 `renderer.render(scene)` 을 불러 장면 속 몸 **전부**의 행렬을 몸 수만큼 다시 셌다(몸 100 = 한 프레임 320,500번).
//   ⚠한 판 늦다: 한 프레임에 그려지는 몸 목록은 그 프레임이 끝나야 다 모이므로 **앞 프레임의 목록·자세**로 이 프레임 첫 몸에서 렌더한다
//     — 자리는 그 프레임 그대로(찍는 곳은 부르는 쪽 x·y)이고 몸짓(판·방향)만 한 프레임 늦다. 시트 층도 타일과 **같은 판**을 쓴다(어긋남 0).
// ★카메라 = 게임 투영 그대로(`w2i` — 가로 x−y · 세로 (x+y)/2 − 높이): 고도 30° · 방위 45° 직교 · 1m = `char_meta.ppu` ·
//   높이는 모델 부모 스케일 `zsq` · 원점(발밑)이 타일의 `char_meta.anchorX/Y` 에 선다(시트와 같은 앵커 규약).
// ★거울: 시트는 굽고 나서 좌우를 뒤집는다(`_flip_png`). 여기선 모델 스케일 (1, zsq, −1) — 행렬식 −1 = 같은 거울.
// ★클립: 몸 파일(`char_body.glb` · 서기·걷기·조준 · 초 단위) + 클립 파일(`char_clips.glb` · 나머지 아홉 · **판 단위** — 메타 `timeUnit`).
//   상태기계는 `42-r2-char.js charState` 그대로다(새 상태 0) — 그 클립 이름을 같은 이름의 액션으로 튼다.
(() => {
  'use strict';
  const T = window.THREE;
  if (!T || !T.GLTFLoader) { window.__char3d = { ready: false, why: 'three 없음' }; return; }
  const MODE = (typeof T522_CHAR_3D === 'string' && T522_CHAR_3D) || '1';
  const TURN_TAU = 0.06;              // 돌아서기 시상수(초) — 온 메시 몸만(그림만 · 이동 무관)
  const BENCH_COLS = 10;              // 벤치 몸 격자(화면 · 열)
  const GRID_COLS = 16;               // 타일 격자(WebGL 판) 열 상한 — 판 크기는 몸 수에 맞춘다(줄이는 건 한동안 작을 때만)
  const KEEP_FRAMES = 120;            // 이만큼 안 불린 몸은 장면에서 뺀다(다시 오면 빈 몸을 다시 쓴다)
  const api = window.__char3d = {
    ready: false, why: '싣는 중', mode: 'mesh', benchN: 1, hide: false,
    overlay: MODE === 'overlay', info: null, lastDraw: null,
    // 재는 자리 — glRenders = WebGL `render` 부른 수 전부(재는 판 포함) · bodyFrames = 3D 몸을 부른 판 수(자가 따로 센다)
    stats: { tok: 0, renders: 0, maxPerTok: 0, glRenders: 0, bodyFrames: 0, bodies: 0, calls: 0, ms: 0, stageMs: 0, pool: 0 },
  };
  let meta = null, cmeta = null, gltf = null, cgltf = null, renderer = null, glc = null, scene = null, camera = null;
  let stg = null, stgCtx = null;          // 2D 받침 — WebGL 판을 **프레임에 한 번** 떠 와서 몸마다 거기서 옮긴다
  let fw = 0, fh = 0, ax = 0, ay = 0, PPU = 0, cols = 0, rows = 0, smallFor = 0;
  const vR = new T.Vector3(), vU = new T.Vector3();   // 카메라 오른쪽·위(세계) — 타일 옮기기
  const CLIP = {};                         // 이름 → { clip, unit:'s'|'frame', fps, frames, loop, span }
  let MESH_CLOTH = null;                   // 메시가 가진 옷 층 이름('clothes_leather')

  function fail(why) { api.ready = false; api.why = why; }
  function cm() { return (typeof charMeta === 'function') ? charMeta() : null; }

  // ── 몸 웅덩이 — pid 마다 몸 하나(뼈 복제) · 안 불리면 빈 몸으로 돌린다 ─────────────────────────────
  const pool = new Map();                 // pid → 몸
  const spare = [];                       // 장면에서 뺀 빈 몸
  function makeBody() {
    const root = new T.Group();
    const model = T.SkeletonUtils.clone(gltf.scene);
    model.scale.set(1, meta.zsq, -1);                         // 누르기(포즈 뒤) · 거울(행렬식 −1)
    root.add(model);
    const mixer = new T.AnimationMixer(model);
    const clothes = [];
    for (const n of (meta.meshes && meta.meshes.clothes) || []) { const o = model.getObjectByName(n); if (o) clothes.push(o); }
    root.visible = false;
    return { root, model, mixer, acts: {}, clothes, clip: null, yaw: null, lastT: 0, seen: 0, pid: null };
  }
  function bodyFor(pid) {
    let b = pool.get(pid);
    if (!b) {
      b = spare.pop() || makeBody();
      b.pid = pid; b.clip = null; b.yaw = null; b.lastT = 0;
      scene.add(b.root);
      pool.set(pid, b);
    }
    b.seen = api.stats.tok;
    return b;
  }
  function sweep() {
    for (const [pid, b] of pool) {
      if (api.stats.tok - b.seen <= KEEP_FRAMES) continue;
      scene.remove(b.root); b.root.visible = false;
      pool.delete(pid); spare.push(b);
    }
    api.stats.pool = pool.size;
  }
  function actOf(b, name) {
    let a = b.acts[name];
    if (!a) { const c = CLIP[name]; if (!c) return null; a = b.acts[name] = b.mixer.clipAction(c.clip); }
    return a;
  }

  // ── 자세 — 클립 · 시각 · 방향 · 옷 ──────────────────────────────────────────────────────────
  //   r.key = 판 열쇠(ⓑ 시트 층과 붙는 몸) 이면 시각 = 그 판 · 아니면(ⓐ) 연속 시각 r.t(초)
  function pose(b, r, now) {
    const c = CLIP[r.clip];
    const a = actOf(b, r.clip);
    if (b.clip !== r.clip) {
      for (const k in b.acts) b.acts[k].stop();
      a.reset(); a.play();
      b.clip = r.clip;
    }
    let ft;                                                  // 파일 시각(초 단위 파일 = 초 · 판 단위 파일 = 판)
    const fr = (r.key != null) ? r.key : r.t * c.fps;        // 판(실수)
    if (c.unit === 'frame') ft = c.loop ? (((fr % c.frames) + c.frames) % c.frames) : Math.max(0, Math.min(c.span, fr));
    else { const sec = fr / c.fps, dur = c.clip.duration || 1; ft = c.loop ? (((sec % dur) + dur) % dur) : Math.max(0, Math.min(dur, sec)); }
    a.time = ft;
    b.mixer.update(0);
    const dt = b.lastT ? Math.min(0.25, (now - b.lastT) / 1000) : 0;
    b.lastT = now;
    if (r.key != null || b.yaw === null || !(dt > 0)) b.yaw = r.yaw;          // ⓑ 시트 행 그대로 · 처음 · 멈춘 판
    else {
      let d = r.yaw - b.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      b.yaw += d * (1 - Math.exp(-dt / TURN_TAU));
      b.yaw = Math.atan2(Math.sin(b.yaw), Math.cos(b.yaw));
    }
    b.root.rotation.y = -b.yaw;                               // 모델 +x 가 게임 방향 atan2(fy,fx) 를 본다(거울 좌표에서 부호가 뒤집힌다)
    for (const o of b.clothes) o.visible = !!r.clothes;
  }

  // ── WebGL 판 · 카메라 — 판 전체를 한 카메라가 덮고 타일 k 는 판의 (k % 열, k / 열) 칸 ────────────────
  //   ★판(= 옮기기 한 번에 떠 오는 넓이)은 몸 수에 맞춘다 — 몸 하나에 16칸 판을 뜨면 헤드리스에서 옮기기만 25ms 가 든다(1판 실측).
  //     늘릴 땐 곧바로 · 줄일 땐 필요한 넓이가 절반 아래로 30판 이어질 때만(주민이 들고 날 때 판을 흔들지 않게).
  function ensureGrid(n) {
    const c = Math.max(1, Math.min(GRID_COLS, n)), r = Math.max(1, Math.ceil(n / c));
    if (c === cols && r === rows) { smallFor = 0; return; }
    const grow = c > cols || r > rows;
    if (!grow) { if (c * r * 2 > cols * rows) { smallFor = 0; return; } if (++smallFor < 30) return; }
    smallFor = 0; cols = c; rows = r;
    const W = cols * fw, H = rows * fh;
    renderer.setSize(W, H, false);
    stg.width = W; stg.height = H;
    camera.left = -ax / PPU; camera.right = (W - ax) / PPU;
    camera.top = ay / PPU; camera.bottom = -(H - ay) / PPU;
    camera.updateProjectionMatrix();
  }
  function placeTile(b, k) {                                  // 타일 k 의 앵커 = 판 (col·fw + ax, row·fh + ay)
    const col = k % cols, row = (k / cols) | 0;
    const dx = col * fw / PPU, dy = row * fh / PPU;           // 화면 오른쪽 dx · 아래 dy (세계 단위)
    b.root.position.set(vR.x * dx - vU.x * dy, vR.y * dx - vU.y * dy, vR.z * dx - vU.z * dy);
    return [col * fw, row * fh];
  }

  // ── 프레임 — 한 판에 렌더 한 번 ─────────────────────────────────────────────────────────────
  //   `tok` 은 그림 틀(rAF)마다 하나 는다. 이 판의 **첫 몸**이 앞 판에 모인 요청(몸·자세)을 한 번에 그린다.
  let reqs = [];                           // 이 판에 모이는 요청 → 다음 판 첫 몸이 그린다
  let tiles = new Map();                   // 이 판에 쓸 타일(pid → {sx, sy, clip, frame, row, full, yaw})
  let renderedTok = -1, rendersThisTok = 0;
  (function tick() { api.stats.tok++; requestAnimationFrame(tick); })();
  function renderAll() {
    if (renderedTok === api.stats.tok) return;
    renderedTok = api.stats.tok; rendersThisTok = 0;
    const list = reqs; reqs = [];
    tiles = new Map();
    if (!list.length) return;
    const t0 = performance.now(), now = t0;
    const seen = new Map();                                   // 같은 pid 가 한 판에 둘이면 뒤엣것
    for (const r of list) seen.set(r.pid, r);
    const L = [...seen.values()];
    ensureGrid(L.length);
    for (const b of pool.values()) b.root.visible = false;
    L.forEach((r, k) => {
      const b = bodyFor(r.pid);
      pose(b, r, now);
      const [sx, sy] = placeTile(b, k);
      b.root.visible = true;
      tiles.set(r.pid, { sx, sy, clip: r.clip, frame: r.frame, row: r.row, full: r.full, yaw: b.yaw, t: r.t, key: r.key });
    });
    renderer.setViewport(0, 0, glc.width, glc.height);
    renderer.setScissorTest(false);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);                           // ★한 판에 한 번
    const t1 = performance.now();
    stgCtx.clearRect(0, 0, stg.width, stg.height);
    stgCtx.drawImage(glc, 0, 0);
    const t2 = performance.now();
    rendersThisTok++;
    const S = api.stats;
    S.renders++; S.maxPerTok = Math.max(S.maxPerTok, rendersThisTok);
    S.bodies = L.length; S.calls = renderer.info.render.calls; S.ms = +(t1 - t0).toFixed(3); S.stageMs = +(t2 - t1).toFixed(3);
    if ((S.renders & 63) === 0) sweep();
  }

  // ── 벤치 몸 자리(격자) — 나를 가운데 두고 옆으로 ─────────────────────────────────────────────
  function benchSpot(k) {
    const col = k % BENCH_COLS, row = (k / BENCH_COLS) | 0;
    return [(col - (BENCH_COLS >> 1)) * 34 + ((row & 1) ? 17 : 0), (row - 4) * 22 - 40];
  }

  let _ov = null, _ovCtx = null;
  function makeOverlay() {
    const cv = document.getElementById('canvas');
    if (!cv || !cv.parentNode) return;
    _ov = document.createElement('canvas');
    _ov.id = 'char3dOverlay';
    _ov.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated';
    cv.parentNode.insertBefore(_ov, cv.nextSibling);
    _ovCtx = _ov.getContext('2d');
  }
  function overlayBlit(src, sx, sy, dx, dy) {
    if (!_ov) return;
    const cv = document.getElementById('canvas');
    if (_ov.width !== cv.width || _ov.height !== cv.height) { _ov.width = cv.width; _ov.height = cv.height; }
    const r = cv.getBoundingClientRect();
    _ov.style.left = cv.offsetLeft + 'px'; _ov.style.top = cv.offsetTop + 'px';
    _ov.style.width = r.width + 'px'; _ov.style.height = r.height + 'px';
    const z = (typeof ZOOM === 'number') ? ZOOM : 1;
    _ovCtx.imageSmoothingEnabled = false;
    _ovCtx.drawImage(src, sx, sy, fw, fh, dx * z, dy * z, fw * z, fh * z);
  }

  // ── 갈고리 ① `drawCharSprite` 첫 줄 — 벤치 몸 · 재는 판(hide) · 덮개 비우기. 참이면 시트 경로를 건너뛴다 ──────
  api.draw = function (x, y, isMe, opts) {
    if (!api.ready || !isMe) return false;
    if (_ovCtx) _ovCtx.clearRect(0, 0, _ov.width, _ov.height);     // 덮개는 프레임마다 비운다
    if (api.hide) { drawCharShadow(x, y, false); return true; }      // 재는 자리(하네스): 몸 없는 판 — 가림 화소를 빼는 바탕
    const N = Math.max(1, api.benchN | 0);
    for (let k = 1; k < N; k++) {                                    // 벤치 — 곁에 N−1 몸(같은 옷 · 같은 문을 지난다: mesh 면 3D · sheet 면 시트)
      const o = benchSpot(k);
      drawCharSprite(x + o[0], y + o[1], false, Object.assign({}, opts, { pid: '__t522b' + k, clothes: 'leather', job: null, tool: null, carrier: false, war: false }));
    }
    return false;
  };

  // ── 갈고리 ② 시트 경로의 층 고리 — 이 몸의 'body' 층을 3D 타일로 바꿀까(몸마다 모드 하나) ─────────────────
  //   부르는 쪽(`42-r2-char.js drawCharSprite`)이 시트 상태기계를 이미 돌렸다(stt = 이번 판의 클립·판 · row = 시트 행).
  //   돌려주는 것: null(시트로 그린다) · 또는 타일 {sx, sy, clip, frame, row, full} — 시트 층은 **타일의 판·행**으로 얹는다.
  let _bodyTok = -1;
  api.body = function (pid, isMe, layers, stt, row, opts, x, y) {
    if (!api.ready || api.mode === 'sheet') return null;
    if (_bodyTok !== api.stats.tok) { _bodyTok = api.stats.tok; api.stats.bodyFrames++; }
    renderAll();                                              // 이 판의 첫 몸이면 앞 판 요청을 한 번에 그린다
    if (!CLIP[stt.clip]) return null;                         // ⓒ 안 내보낸 클립 → 시트(T539 ③ 표)
    const full = layers.every((L) => L === 'body' || L === MESH_CLOTH);
    const st = (typeof _charAnim !== 'undefined') ? _charAnim.get(pid) : null;
    const tSec = st ? (st.one ? st.oneT : st.t) : 0;
    const yawC = Math.atan2(opts.fvy || 0, (opts.fvx || opts.fvy) ? (opts.fvx || 0) : 1);
    reqs.push({ pid, clip: stt.clip, frame: stt.frame, row, full, clothes: full && layers.indexOf(MESH_CLOTH) >= 0,
                key: full ? null : stt.frame, t: tSec, yaw: full ? yawC : row * Math.PI / 4 });
    const tl = tiles.get(pid) || null;
    if (isMe) {
      const _me = (typeof _renderReady !== 'undefined' && _renderReady && typeof myAbsRender === 'object') ? myAbsRender
                : ((typeof myAbsPredicted === 'object') ? myAbsPredicted : null);   // = render() 의 `_camAbs` 와 같은 식
      const _pr = (typeof myAbsPredicted === 'object' && myAbsPredicted) ? myAbsPredicted : null;
      const _sc = (_me && window.__w2s) ? window.__w2s(_me.x, _me.y) : null;
      api.lastDraw = { gl: api.stats.ms, blit: api.stats.stageMs, n: api.stats.bodies, calls: api.stats.calls, x, y,
                       clip: tl ? tl.clip : null, full: tl ? tl.full : full, t: tl ? +(+tl.t).toFixed(4) : null,
                       yaw: tl ? +tl.yaw.toFixed(4) : null, yawTarget: +yawC.toFixed(4), tile: !!tl,
                       abs: _me ? [+_me.x.toFixed(2), +_me.y.toFixed(2)] : null, w2s: _sc ? [+_sc.px.toFixed(2), +_sc.py.toFixed(2)] : null,
                       pred: _pr ? [+_pr.x.toFixed(2), +_pr.y.toFixed(2)] : null };
    }
    return tl;
  };
  // 타일을 찍는다(시트 경로가 'body' 층 자리에서 부른다) — 덮개 모드는 내 온 메시 몸만 위 캔버스로
  api.blit = function (g, tl, dx, dy, isMe) {
    if (api.overlay && isMe && tl.full) { overlayBlit(stg, tl.sx, tl.sy, dx, dy); return; }
    g.drawImage(stg, tl.sx, tl.sy, fw, fh, dx, dy, fw, fh);
  };
  api.meshLayer = (L) => L === 'body' || L === MESH_CLOTH;   // 온 메시 타일에 이미 든 층

  // ── 재는 자리(하네스) — 한 방향·한 판의 타일을 떠서 준다(시트 판과 맞대는 재료) · 판 파이프라인과 따로 렌더한다 ──────
  api.snap = function (dirIdx, clip, frameIdx, clothes) {
    if (!api.ready || !CLIP[clip]) return null;
    if (!cols) ensureGrid(1);                                  // 판 크기는 프레임 파이프라인 몫 — 재는 판은 타일 0 칸만 쓴다
    const b = bodyFor('__snap');
    const vis = [];
    for (const o of pool.values()) { vis.push([o, o.root.visible]); o.root.visible = false; }
    b.clip = null;
    pose(b, { clip, key: frameIdx, t: 0, yaw: dirIdx * Math.PI / 4, clothes: clothes !== false }, performance.now());
    placeTile(b, 0);
    b.root.visible = true;
    renderer.setViewport(0, 0, glc.width, glc.height);
    renderer.setScissorTest(false);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
    const g = cv.getContext('2d');
    g.drawImage(glc, 0, 0, fw, fh, 0, 0, fw, fh);
    for (const [o, v] of vis) o.root.visible = v;
    b.root.visible = false; b.clip = null;                     // 판 파이프라인 무접촉 — 타일은 받침(stg)에서 오고 재는 판은 WebGL 판만 쓴다
    return { w: fw, h: fh, ax, ay, data: Array.from(g.getImageData(0, 0, fw, fh).data) };
  };
  api.clips = () => Object.keys(CLIP).map((k) => ({ name: k, unit: CLIP[k].unit, fps: CLIP[k].fps, frames: CLIP[k].frames, loop: CLIP[k].loop }));

  function setup() {
    const m = cm();
    if (!m) { setTimeout(setup, 200); return; }
    fw = m.frameW; fh = m.frameH; ax = m.anchorX; ay = m.anchorY; PPU = m.ppu;
    glc = document.createElement('canvas');
    glc.width = fw; glc.height = fh;
    stg = document.createElement('canvas'); stg.width = fw; stg.height = fh; stgCtx = stg.getContext('2d');
    try {
      renderer = new T.WebGLRenderer({ canvas: glc, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
    } catch (e) { fail('WebGL 없음: ' + e.message); return; }
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    { const _r = renderer.render.bind(renderer); renderer.render = (sc, ca) => { api.stats.glRenders++; return _r(sc, ca); }; }   // 재는 자리 — 렌더 부른 수
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      api.info = { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                   vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), three: T.REVISION };
    } catch (e) { api.info = { three: T.REVISION }; }
    scene = new T.Scene();
    // ── 빛: 굽는 장면의 태양·하늘 그대로(`char3d_meta.json`) ──
    const sd = meta.sunDir;
    const sun = new T.DirectionalLight(0xffffff, meta.sunEnergy);
    sun.position.set(-sd[0] * 10, -sd[2] * 10, -sd[1] * 10);  // 같은 거울 (x, z, y)
    scene.add(sun); scene.add(sun.target);
    scene.add(new T.AmbientLight(new T.Color(meta.ambient[0], meta.ambient[1], meta.ambient[2]), Math.PI * meta.ambientStrength));
    // ── 카메라: 게임 투영 그대로 · 원점(발밑)이 타일 0 의 앵커에 선다 ──
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    camera = new T.OrthographicCamera(-ax / PPU, (fw - ax) / PPU, ay / PPU, -(fh - ay) / PPU, 0.1, 200);
    camera.up.set(-s / Math.SQRT2, c, -s / Math.SQRT2);
    camera.position.set(c / Math.SQRT2 * 50, s * 50, c / Math.SQRT2 * 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    vR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    vU.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    // ── 클립 표: 몸 파일(초) + 클립 파일(판) ──
    for (const a of gltf.animations) { const mm = meta.clips[a.name]; if (mm) CLIP[a.name] = { clip: a, unit: 's', fps: mm.fps, frames: mm.frames, loop: !!mm.loop, span: null }; }
    if (cgltf && cmeta) for (const a of cgltf.animations) {
      const mm = cmeta.clips[a.name]; if (!mm || CLIP[a.name]) continue;
      CLIP[a.name] = { clip: a, unit: cmeta.timeUnit === 'frame' ? 'frame' : 's', fps: mm.fps, frames: mm.frames, loop: !!mm.loop, span: mm.span };
    }
    MESH_CLOTH = 'clothes_' + ((meta.meshes && meta.meshes.clothesMat) || 'leather');
    ensureGrid(1);
    api.ready = true; api.why = null;
    if (api.overlay) makeOverlay();
  }

  const J = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([J('/assets/char3d/char3d_meta.json'), J('/assets/char3d/char3d_clips_meta.json')]).then(([j, cj]) => {
    if (!j) { fail('메타 없음'); return; }
    meta = j; cmeta = cj;
    const L = new T.GLTFLoader();
    L.load('/assets/char3d/' + j.glb, (g) => {
      gltf = g;
      if (!cj) { setup(); return; }                           // 클립 파일이 없으면 몸 파일 셋만(종전)
      L.load('/assets/char3d/' + cj.glb, (g2) => { cgltf = g2; setup(); }, undefined, () => { cmeta = null; setup(); });
    }, undefined, (e) => fail('glb: ' + (e && e.message)));
  });
})();
