// public/client3d/char3d.js — ★★[T522 2026-09-29] 사람 하나를 3D 로 (재민 확정: 최종은 3D · 사람·동물만 3D · 세계·시설은 2D)
//
// ★이 파일은 손잡이 `T522_CHAR_3D` 가 켜졌을 때만 실린다(`42-r2-char.js` 가 주소창 한 칸을 보고 three.js 뒤에 붙인다).
//   끄면(기본) 요청조차 안 간다 — 시트 경로 비트 동일 · 화소 동일.
// ★그리는 자리 = **시트가 그리던 그 자리**다(`drawCharSprite` 첫 줄의 갈고리). 화가 순서가 그대로라
//   나무·집 뒤의 가림은 시트와 **같은 술어**(깊이 정렬 · `20-r2-visibility` 의 컷어웨이·페이드)가 한다 — 새 규칙 0.
//   손잡이 값 `overlay` 는 비교용: 같은 그림을 **2D 캔버스 위 투명 캔버스**에 얹는다(가림을 못 받는다 — 보고 §ⓒ).
// ★카메라 = 게임 투영 그대로(`w2i` — 가로 x−y · 세로 (x+y)/2 − 높이): 고도 30° · 방위 45° 직교 ·
//   1m = `char_meta.ppu`(45.255px, 셀 다이아 64px ÷ √2) · 높이는 모델 부모 스케일 `zsq` 로 눌러 1m = 32px.
//   모델의 원점(발밑)이 타일의 `char_meta.anchorX/Y` 에 서므로 **시트와 같은 앵커 규약**으로 붙는다.
// ★거울: 시트는 굽고 나서 좌우를 뒤집는다(`_flip_png`). 여기선 모델 좌표 (x, y, z) 를 three 의 (x, z·zsq, y) 로
//   놓는다(행렬식 −1 = 같은 거울) — three 가 감김을 알아서 뒤집는다.
// ★방향: 시트는 8행(45° 계단) · 여기선 atan2(fy, fx) **연속**이고 돌아서는 동안 매끄럽게 따라간다(시상수 `TURN_TAU`).
// ★최적화 0(카드) — 되게만. 몸마다 타일 하나를 그려 2D 로 옮긴다(수치는 짝으로 적기만).
(() => {
  'use strict';
  const T = window.THREE;
  if (!T || !T.GLTFLoader) { window.__char3d = { ready: false, why: 'three 없음' }; return; }
  const MODE = (typeof T522_CHAR_3D === 'string' && T522_CHAR_3D) || '1';
  const TURN_TAU = 0.06;              // 돌아서기 시상수(초) — 8방향 입력이 계단으로 안 튀게(그림만 · 이동 무관)
  const BENCH_COLS = 10;              // 벤치 몸 격자(열) — 타일 격자와 같은 수
  const api = window.__char3d = {
    ready: false, why: '싣는 중', mode: 'mesh', benchN: 1, clothes: true, drawn: 0, hide: false,
    overlay: MODE === 'overlay', info: null, lastDraw: null,
  };
  let meta = null, gltf = null, renderer = null, glc = null, scene = null, camera = null;
  let stg = null, stgCtx = null;          // 2D 받침 — WebGL 판을 **프레임에 한 번** 떠 와서 몸마다 거기서 옮긴다
                                          //   (WebGL 캔버스를 몸마다 drawImage 하면 몸마다 판 전체를 다시 뜬다 — 1판 실측 100몸 241ms)
  let TX = BENCH_COLS, fw = 0, fh = 0, ax = 0, ay = 0;
  const bodies = [];

  // 시트 상태기계의 클립 → 내보낸 클립(서기·걷기·조준). 달리기는 걷기를 fps 비로 빨리, 원샷(휘두르기)은 서기.
  const CLIP_OF = { idle: 'idle', walk: 'walk', aim: 'aim', run: 'walk', idle2: 'idle', aim2: 'aim', swing: 'idle', swing2: 'idle' };

  function fail(why) { api.ready = false; api.why = why; }
  function cm() { return (typeof charMeta === 'function') ? charMeta() : null; }

  function setup() {
    const m = cm();
    if (!m) { setTimeout(setup, 200); return; }
    fw = m.frameW; fh = m.frameH; ax = m.anchorX; ay = m.anchorY;
    const PPU = m.ppu;
    glc = document.createElement('canvas');
    glc.width = fw; glc.height = fh;
    stg = document.createElement('canvas'); stg.width = fw; stg.height = fh; stgCtx = stg.getContext('2d');
    try {
      renderer = new T.WebGLRenderer({ canvas: glc, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
    } catch (e) { fail('WebGL 없음: ' + e.message); return; }
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      api.info = { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                   vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), three: T.REVISION };
    } catch (e) { api.info = { three: T.REVISION }; }
    scene = new T.Scene();
    // ── 빛: 굽는 장면의 태양·하늘 그대로(`char3d_meta.json` — char_render.py 에서 읽어 적은 값) ──
    //   태양 = 방향광(세기 = Blender 태양 세기 · 같은 램버트 규약) · 하늘 = 고른 환경광(π × 세기 — 복사휘도 → 조도)
    const sd = meta.sunDir;                                   // Blender z-up · 빛이 **가는** 방향
    const sun = new T.DirectionalLight(0xffffff, meta.sunEnergy);
    sun.position.set(-sd[0] * 10, -sd[2] * 10, -sd[1] * 10);  // 같은 거울 (x, z, y)
    scene.add(sun); scene.add(sun.target);
    const amb = new T.AmbientLight(new T.Color(meta.ambient[0], meta.ambient[1], meta.ambient[2]), Math.PI * meta.ambientStrength);
    scene.add(amb);
    // ── 카메라: 게임 투영 그대로 · 원점(발밑)이 타일의 앵커에 선다 ──
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    camera = new T.OrthographicCamera(-ax / PPU, (fw - ax) / PPU, ay / PPU, -(fh - ay) / PPU, 0.1, 200);
    camera.up.set(-s / Math.SQRT2, c, -s / Math.SQRT2);
    camera.position.set(c / Math.SQRT2 * 50, s * 50, c / Math.SQRT2 * 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    bodies.push(makeBody());
    api.ready = true; api.why = null;
    if (api.overlay) makeOverlay();
  }

  function makeBody() {
    const root = new T.Group();
    const model = T.SkeletonUtils.clone(gltf.scene);
    model.scale.set(1, meta.zsq, -1);                         // 누르기(포즈 뒤) · 거울(행렬식 −1)
    root.add(model);
    const mixer = new T.AnimationMixer(model);
    const actions = {};
    for (const a of gltf.animations) { const ac = mixer.clipAction(a); actions[a.name] = ac; }
    const clothes = [];
    for (const n of (meta.meshes && meta.meshes.clothes) || []) { const o = model.getObjectByName(n); if (o) clothes.push(o); }
    root.visible = false;
    scene.add(root);
    return { root, model, mixer, actions, clothes, clip: null, yaw: null };
  }

  function ensureBodies(n) {
    while (bodies.length < n) bodies.push(makeBody());
    const cols = Math.min(n, TX), rows = Math.ceil(n / TX);
    if (glc.width !== cols * fw || glc.height !== rows * fh) {
      renderer.setSize(cols * fw, rows * fh, false);
      stg.width = cols * fw; stg.height = rows * fh;
    }
  }

  function pose(b, clip, t, yawTarget, dt) {
    if (b.clip !== clip) {
      for (const k in b.actions) b.actions[k].stop();
      const a = b.actions[clip] || b.actions.idle;
      a.reset(); a.play();
      b.clip = clip;
    }
    const a = b.actions[clip] || b.actions.idle;
    const dur = a.getClip().duration || 1;
    a.time = ((t % dur) + dur) % dur;
    b.mixer.update(0);
    if (b.yaw === null || !(dt > 0)) b.yaw = yawTarget;
    else {
      let d = yawTarget - b.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      b.yaw += d * (1 - Math.exp(-dt / TURN_TAU));
      b.yaw = Math.atan2(Math.sin(b.yaw), Math.cos(b.yaw));  // (−π, π] 로 접는다 — 목표와 같은 눈금
    }
    b.root.rotation.y = -b.yaw;                               // 모델 +x 가 게임 방향 atan2(fy,fx) 를 본다(거울 좌표에서 부호가 뒤집힌다)
    for (const o of b.clothes) o.visible = !!api.clothes;
  }

  function renderTile(k, b) {
    const cols = Math.max(1, Math.round(glc.width / fw));
    const col = k % cols, row = (k / cols) | 0;
    const x = col * fw, yGL = glc.height - (row + 1) * fh;
    renderer.setViewport(x, yGL, fw, fh);
    renderer.setScissor(x, yGL, fw, fh);
    renderer.setScissorTest(true);
    renderer.clear(true, true, false);
    for (const o of bodies) o.root.visible = (o === b);
    renderer.render(scene, camera);
    return [x, row * fh];
  }

  // ── 벤치 몸 자리(격자) — 나를 가운데 두고 옆으로 · 시트 몸도 같은 자리에 선다 ──
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

  // ── 갈고리: `drawCharSprite(x, y, isMe, opts)` 의 첫 줄 — 참이면 시트 대신 3D 가 그렸다 ──
  api.draw = function (x, y, isMe, opts) {
    if (!api.ready || !isMe) return false;                    // ★플레이어 한 몸(카드 ③) — 주민·남은 시트 그대로
    if (_ovCtx) _ovCtx.clearRect(0, 0, _ov.width, _ov.height); // 덮개는 프레임마다 비운다(안 그리는 판에 지난 몸이 남지 않게)
    if (api.hide) { drawCharShadow(x, y, false); return true; } // 재는 자리(하네스): 몸 없는 판 — 가림 화소를 빼는 바탕
    if (opts.down || opts.carriedOn || opts.carrying || opts.cap) return false;   // 정적·포로 클립은 안 내보냈다 → 시트
    const m = cm();
    if (!m) return false;
    const N = Math.max(1, api.benchN | 0);
    if (api.mode === 'sheet') {                               // 벤치 기준선 — 나도 옆 몸도 **시트**로
      for (let k = 1; k < N; k++) {
        const o = benchSpot(k);
        drawCharSprite(x + o[0], y + o[1], false, Object.assign({}, opts, { pid: '__t522b' + k, clothes: 'leather', job: null, tool: null, carrier: false, war: false }));
      }
      return false;
    }
    const now = performance.now();
    const st0 = _charAnim.get(opts.pid);
    const dtSec = st0 && st0.lastT ? Math.min(0.25, (now - st0.lastT) / 1000) : 0;
    const stt = charState(opts.pid, opts.speed || 0, !!opts.aiming, opts.attackAt || 0, dtSec, null);
    if (window.__sfx) window.__sfx.step(stt.clip, stt.frame);   // 발소리 — 시트 경로와 같은 한 줄
    const st = _charAnim.get(opts.pid);
    st.lastT = now;
    const active = st.one || st.clip;
    const clip = CLIP_OF[active] || 'idle';
    const t = (st.one ? st.oneT : st.t) * ((active === 'run' && m.clips.run && m.clips.walk) ? m.clips.run.fps / m.clips.walk.fps : 1);
    const yaw = Math.atan2(opts.fvy || 0, (opts.fvx || opts.fvy) ? (opts.fvx || 0) : 1);
    ensureBodies(N);
    const t0 = performance.now();
    const tiles = [];
    for (let k = 0; k < N; k++) {
      const b = bodies[k];
      pose(b, clip, t + k * 0.13, k ? yaw + k * 0.6457718 : yaw, dtSec);
      tiles.push(renderTile(k, b));
    }
    renderer.setScissorTest(false);
    const t1 = performance.now();
    stgCtx.clearRect(0, 0, stg.width, stg.height);
    stgCtx.drawImage(glc, 0, 0);                               // ★프레임에 한 번 — WebGL 판을 2D 받침으로
    drawCharShadow(x, y, false);                               // 그림자 = 시트 경로와 같은 함수·같은 자리
    for (let k = 0; k < N; k++) {
      const o = k ? benchSpot(k) : [0, 0];
      const dx = Math.round(x + o[0] - ax), dy = Math.round(y + o[1] - ay);
      if (api.overlay) overlayBlit(stg, tiles[k][0], tiles[k][1], dx, dy);
      else ctx.drawImage(stg, tiles[k][0], tiles[k][1], fw, fh, dx, dy, fw, fh);
    }
    api.drawn++;
    // 재는 자리: 그린 자리(x,y)와 **같은 순간**의 몸 자리 — 내 몸은 카메라 보간 자리(`_camAbs` · 시트와 같은 renderables 한 줄)에
    //   서고, 그 자리는 이동 모델 예측(`myAbsPredicted`)을 따라간다. 둘 다 적는다(하네스가 맞댄다).
    const _me = (typeof _renderReady !== 'undefined' && _renderReady && typeof myAbsRender === 'object') ? myAbsRender
              : ((typeof myAbsPredicted === 'object') ? myAbsPredicted : null);   // = render() 의 `_camAbs` 와 같은 식(31-m-move · 34-m-renderloop)
    const _pr = (typeof myAbsPredicted === 'object' && myAbsPredicted) ? myAbsPredicted : null;
    const _sc = (_me && window.__w2s) ? window.__w2s(_me.x, _me.y) : null;
    api.lastDraw = { gl: +(t1 - t0).toFixed(3), blit: +(performance.now() - t1).toFixed(3), n: N, clip, t: +t.toFixed(4),
                     yaw: +bodies[0].yaw.toFixed(4), yawTarget: +yaw.toFixed(4), x, y,
                     abs: _me ? [+_me.x.toFixed(2), +_me.y.toFixed(2)] : null, w2s: _sc ? [+_sc.px.toFixed(2), +_sc.py.toFixed(2)] : null,
                     pred: _pr ? [+_pr.x.toFixed(2), +_pr.y.toFixed(2)] : null };
    if (!window.__charDbg) window.__charDbg = {};
    window.__charDbg[opts.pid] = { on: true, mesh: true, overlay: api.overlay, clip: stt.clip, frame: stt.frame, meshClip: clip,
                                   yaw: api.lastDraw.yaw, isMe: true, speed: +(opts.speed || 0).toFixed(2),
                                   facing: [+(opts.fvx || 0).toFixed(4), +(opts.fvy || 0).toFixed(4)],
                                   anchor: [ax, ay], fw, fh, t: now };
    return true;
  };

  // ── 재는 자리(하네스) — 한 방향·한 판의 타일을 떠서 준다(시트 판과 맞대는 재료) ──
  api.snap = function (dirIdx, clip, frameIdx, clothes) {
    if (!api.ready) return null;
    const c = meta.clips[clip]; if (!c) return null;
    const b = bodies[0], keep = api.clothes;
    api.clothes = clothes !== false;
    pose(b, clip, frameIdx / c.fps, dirIdx * Math.PI / 4, 0);
    b.clip = null;                                             // 다음 그리기에서 제 클립을 다시 건다
    const tl = renderTile(0, b);
    renderer.setScissorTest(false);
    api.clothes = keep;
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
    const g = cv.getContext('2d');
    g.drawImage(glc, tl[0], tl[1], fw, fh, 0, 0, fw, fh);
    return { w: fw, h: fh, ax, ay, data: Array.from(g.getImageData(0, 0, fw, fh).data) };
  };

  fetch('/assets/char3d/char3d_meta.json').then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j) { fail('메타 없음'); return; }
    meta = j;
    new T.GLTFLoader().load('/assets/char3d/' + j.glb, (g) => { gltf = g; setup(); }, undefined, (e) => fail('glb: ' + (e && e.message)));
  }).catch((e) => fail('메타: ' + e.message));
})();
