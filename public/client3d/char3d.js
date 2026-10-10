// public/client3d/char3d.js — ★★[T522 2026-09-29 · T539 2026-09-30 · T545 2026-10-03] 사람을 3D 로 (재민 확정: 최종은 3D · 사람·동물만 3D · 세계·시설은 2D)
//
// ★이 파일은 손잡이 `T522_CHAR_3D` 가 켜졌을 때만 실린다(`42-r2-char.js` 가 주소창 한 칸을 보고 three.js 뒤에 붙인다).
//   끄면(기본) 요청조차 안 간다 — 시트 경로 비트 동일 · 화소 동일.
// ★[T545] 소체 = MPFB(MakeHuman · CC0) 실사풍 저폴리 몸 — 몸마다 **메시 하나 · 재질 하나**(옷까지 한 메시 · 아틀라스 한 장).
//   [T604] 옷 기하 = 청동기 옷(시트 링 표 → `char_clothes_mhclo.py`) · [T654] 몸마다 메시 **하나**(T604 의 갖옷 몸 사본을 걷었다) —
//   옷 넷 = 재질(아틀라스) · 갖옷 털 두께 = 정점 속성 `_inflate`(옷 점 = 털 두께 방향) × 메타 `bodies.<몸>.inflate.fur` — 셰이더 한 줄(`inflate`) · [T664] 갖옷 음영 = 면 속성 `_furnormal`(민 옷의 면 법선) ·
//   [T685] 갖옷 스키닝 = 갖옷 몫 뼈·무게(`_furjoints`·`_furweights` — 따로 묶은 갖옷 무게) · 사용자 속성 넷 다 성긴 접근자.
//   몸 파일 하나(`char_body.glb`)에 몸 둘(M·F) · 몸마다 클립 다섯(CMU 모캡 리타깃) — 메타가 규약이다(`char3d_meta.json`).
//   재질 = 아틀라스(옷 넷 — 삼베·모시·가죽·갖옷 · 몸마다 넉 장) + 알파 한 장(머리·눈썹 · `alphaMap`) · 빛은 이 파일이 건다(④).
// ★그리는 자리 = **시트가 그리던 그 자리**다 — `drawCharSprite` 의 층 고리에서 'body' 층 자리에 3D 타일 한 장을 찍는다
//   (`api.body` · PM 결정 T539: 정본 = 제 차례 합성). 화가 순서가 그대로라 가림은 시트와 **같은 술어**다 — 새 규칙 0.
//   손잡이 값 `overlay` 는 자 전용: 내 몸(온 메시일 때)을 2D 캔버스 **위 투명 캔버스**에 얹는다(가림을 못 받는다 · T522 ⓒ).
// ★몸마다 모드 하나(T539 ① → T545) — 나 · 남의 몸 · 주민이 같은 문을 지난다:
//   ⓐ 온 메시(연속) — 층이 몸 + 옷(넷 가운데 하나)뿐이면 · 방향 **연속**(시상수 `TURN_TAU`) · 시각 연속.
//   ⓑ 온 메시(시트 판) — 도구·등짐·띠가 더 있으면 3D 몸을 **시트 판과 같은 자세**(행 × 45° · 판 열쇠)에 세우고 그 층을 시트 그대로 얹는다.
//      도구 층(`tool_*` — 시트에서 오른 손목 `handR` 에 묶인 강체)은 **3D 오른 손목**을 따라 옮겨 찍는다(Δ = 3D 손목 − 시트 `handScreen`).
//      등짐·띠는 그대로(시트 메타에 몸통 자리가 없다 — 회부) · 3D 도구는 다음 카드(카드 ③ "도구·등짐 층은 자리만").
//   ⓒ 시트 — 클립이 3D 에 없거나(쓰러짐·업기·포로 — 모캡 원본 없음 · 시트로 넘긴 목록) · 옷이 넷 밖(가죽 판갑 `hide`·풀옷 `fiber` —
//      다섯째부터 회부) · 옷이 없거나(맨몸 주민 — 메시엔 맨몸이 없다) · 그 몸의 타일이 아직 없을 때(처음 보인 한 판) · 벤치 기준선(`mode='sheet'`).
// ★장면은 한 번(T539 ②): 한 프레임의 몸 전부를 **한 장면 · 카메라 하나 · 렌더 하나**로 그린다 — 몸마다 WebGL 판의 제 칸(타일)에
//   서도록 **화면 평면으로만** 옮겨 놓는다(직교 카메라라 옮긴 만큼 화소가 옮는다 · 깊이 무변 · 칸끼리 안 겹친다).
//   ⚠한 판 늦다: 한 프레임에 그려지는 몸 목록은 그 프레임이 끝나야 다 모이므로 **앞 프레임의 목록·자세**로 이 프레임 첫 몸에서 렌더한다.
// ★카메라 = 게임 투영 그대로(`w2i` — 가로 x−y · 세로 (x+y)/2 − 높이): 고도 30° · 방위 45° 직교 · 1m = `char_meta.ppu` ·
//   높이는 모델 부모 스케일 `zsq` · 원점(발밑)이 타일의 `char_meta.anchorX/Y` 에 선다(시트와 같은 앵커 규약).
// ★거울: 시트는 굽고 나서 좌우를 뒤집는다(`_flip_png`). 여기선 모델 스케일 (1, zsq, −1) — 행렬식 −1 = 같은 거울.
// ★클립: 액션 이름 '<몸>.<클립>'(M.walk …) · 시각 단위 = 열쇠(열쇠 k 가 시각 k · 시트 판 k = 열쇠 `keysPerFrame`×k) ·
//   손 포즈판 셋(idle·aim·swing)은 같은 뜻의 모캡판으로 선다(`clipAlias`). 상태기계는 `42-r2-char.js charState` 그대로다(새 상태 0).
// ★빛(④): 방향광 하나 + 반구광 하나 — 게임 시각(`worldPhase` · `worldClock.dayPhaseRatio`)과 날씨(`wxState().precip` — 서버가 보낸 값)에서.
//   한낮 = 시트 굽기의 태양 그대로(`char3d_meta.sunDir` · 세기 `sunEnergy`) · 해는 낮 동안 반원을 돈다(고도 = 한낮 고도 × sin(π·낮자리)) ·
//   세기 = 수평면 조도(sin 고도) · 비 오는 만큼 직사광이 준다(1 − 강수) · 반구광 = 시트 하늘빛(`sky` × π·`skyStrength`) ·
//   밤빛(푸른 어두움)은 2D 밤 덮개가 맡는다(타일이 2D 캔버스 안에 들어 그대로 덮인다 · 사본 0). 툰 셰이더 0 · 먹선 0(실사 결).
(() => {
  'use strict';
  const T = window.THREE;
  if (!T || !T.GLTFLoader) { window.__char3d = { ready: false, why: 'three 없음' }; return; }
  const MODE = (typeof T522_CHAR_3D === 'string' && T522_CHAR_3D) || '1';
  const TURN_TAU = 0.06;              // 돌아서기 시상수(초) — 온 메시(연속) 몸만(그림만 · 이동 무관)
  const BENCH_COLS = 10;              // 벤치 몸 격자(화면 · 열)
  const GRID_COLS = 16;               // 타일 격자(WebGL 판) 열 상한 — 판 크기는 몸 수에 맞춘다(줄이는 건 한동안 작을 때만)
  const KEEP_FRAMES = 120;            // 이만큼 안 불린 몸은 장면에서 뺀다(다시 오면 빈 몸을 다시 쓴다)
  const api = window.__char3d = {
    ready: false, why: '싣는 중', mode: 'mesh', benchN: 1, hide: false, sex: null,
    overlay: MODE === 'overlay', info: null, lastDraw: null, light: null,
    // 재는 자리 — glRenders = WebGL `render` 부른 수 전부(재는 판 포함) · bodyFrames = 3D 몸을 부른 판 수(자가 따로 센다)
    stats: { tok: 0, renders: 0, maxPerTok: 0, glRenders: 0, bodyFrames: 0, bodies: 0, calls: 0, ms: 0, stageMs: 0, pool: 0 },
  };
  let meta = null, gltf = null, renderer = null, glc = null, scene = null, camera = null, sun = null, hemi = null;
  let stg = null, stgCtx = null;          // 2D 받침 — WebGL 판을 **프레임에 한 번** 떠 와서 몸마다 거기서 옮긴다
  let fw = 0, fh = 0, ax = 0, ay = 0, PPU = 0, cols = 0, rows = 0, smallFor = 0;
  const vR = new T.Vector3(), vU = new T.Vector3(), vW = new T.Vector3();   // 카메라 오른쪽·위(세계) — 타일 옮기기 · 손목 투영
  const CLIP = {};                         // 몸 → 클립 이름(시트 이름 · 별칭 포함) → { clip, frames, fps, loop, K, span }
  const MAT = {};                          // 몸 → 옷 → 재질(아틀라스 한 장 + 알파)
  let KINDS = new Set();                   // 메시가 입는 옷(`clothKinds`)
  let E0 = 0, A0 = 0;                      // 한낮 태양 고도·방위(시트 굽기 · Blender 축)

  function fail(why) { api.ready = false; api.why = why; }
  // ★[T654] 갖옷 털 두께 — 같은 메시의 옷 점을 털 두께 방향(정점 속성 · 그 밖 점은 0)으로 두께(m)만큼 **묶기 자세에서** 민 뒤 스키닝한다.
  //   방향 = 생성기가 둘레에 두께를 더하던 방향(T604 갖옷 기하 그대로) · 두께 = 메타 `bodies.<몸>.inflate.<옷>` · 하네스 그림도 이 함수를 부른다(사본 0).
  //   [T664] 음영 = 민 옷의 면 법선(면 속성 `furNormalAttr` · 0 아닌 점만 — 살·눈·눈썹·머리는 제 법선 그대로) — 법선도 한 줄.
  //   [T685] 스키닝 = 갖옷 몫 뼈 넷·무게 넷(`furJointsAttr`·`furWeightsAttr` · 무게가 0 아닌 점만 — 옛 갖옷 몸이 따로 묶여 움직이던 그 무게)로 갈아 끼운다.
  function inflate(mat, pad, attr, nattr, jattr, wattr) {
    const A = attr || meta.inflateAttr, N = nattr || meta.furNormalAttr, JN = jattr || meta.furJointsAttr, W = wattr || meta.furWeightsAttr;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.inflatePad = { value: pad };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec3 ${A};\nattribute vec3 ${N};\nattribute vec4 ${JN};\nattribute vec4 ${W};\nuniform float inflatePad;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n\tif ( dot( ${N}, ${N} ) > 0.0 ) objectNormal = ${N};`)   // ← [T664] 갖옷 면 법선
        .replace('#include <skinbase_vertex>', `#ifdef USE_SKINNING\n\tbool furSkin = dot( ${W}, ${W} ) > 0.0;\n\tvec4 furSkinIndex = furSkin ? ${JN} : skinIndex;\n\tvec4 furSkinWeight = furSkin ? ${W} : skinWeight;\n#define skinIndex furSkinIndex\n#define skinWeight furSkinWeight\n#endif\n\t#include <skinbase_vertex>`)   // ← [T685] 갖옷 몫 뼈·무게
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n\ttransformed += ${A} * inflatePad;`);   // ← 그 한 줄
    };
    mat.customProgramCacheKey = () => 'inflate:' + A + ':' + N + ':' + JN + ':' + W;
    return mat;
  }
  api.inflate = inflate;
  function cm() { return (typeof charMeta === 'function') ? charMeta() : null; }
  // ★게임엔 성별 칸이 없다(서버가 안 보낸다 — 회부) ⇒ 모두 기본 몸(`defaultBody`) · 하네스·그림만 `api.sex` 로 고른다(추측 0)
  function sexOf() { return (api.sex && CLIP[api.sex]) ? api.sex : meta.defaultBody; }
  function clipName(sheetClip) { return (meta.clipAlias && meta.clipAlias[sheetClip]) || sheetClip; }

  // ── 몸 웅덩이 — pid 마다 몸 하나(뼈 복제) · 안 불리면 빈 몸으로 돌린다 ─────────────────────────────
  const pool = new Map();                 // pid → 몸
  const spare = { M: [], F: [] };         // 장면에서 뺀 빈 몸(몸마다)
  function makeBody(sex) {
    const root = new T.Group();
    const model = T.SkeletonUtils.clone(gltf.scene.getObjectByName(sex));   // 그 몸의 뼈대 + 메시 하나만(다른 몸의 뼈는 안 센다)
    model.scale.set(1, meta.zsq, -1);                         // 누르기(포즈 뒤) · 거울(행렬식 −1)
    root.add(model);
    const mesh = model.getObjectByName(meta.bodies[sex].mesh);   // [T654] 메시 하나 — 옷 넷은 재질만 바꾼다(갖옷 = 재질의 부풀림)
    mesh.frustumCulled = false;                               // 타일 칸으로 옮겨 놓는 몸 — 자르기 판정은 카메라 한 장이 이미 덮는다
    const hand = model.getObjectByName(sex + '_RightHand');   // 오른 손목(시트 `handR` 머리와 같은 관절 — 도구 층이 따른다)
    const mixer = new T.AnimationMixer(model);
    root.visible = false;
    return { root, model, mesh, hand, mixer, sex, acts: {}, clip: null, yaw: null, lastT: 0, seen: 0, pid: null };
  }
  function bodyFor(pid, sex) {
    let b = pool.get(pid);
    if (b && b.sex !== sex) { scene.remove(b.root); b.root.visible = false; pool.delete(pid); spare[b.sex].push(b); b = null; }
    if (!b) {
      b = spare[sex].pop() || makeBody(sex);
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
      pool.delete(pid); spare[b.sex].push(b);
    }
    api.stats.pool = pool.size;
  }
  function actOf(b, name) {
    let a = b.acts[name];
    if (!a) { const c = CLIP[b.sex][name]; if (!c) return null; a = b.acts[name] = b.mixer.clipAction(c.clip); }
    return a;
  }

  // ── 자세 — 클립 · 시각 · 방향 · 옷 ──────────────────────────────────────────────────────────
  //   r.key = 시트 판(ⓑ 시트 층과 붙는 몸) 이면 그 판의 열쇠 · 아니면(ⓐ) 연속 시각 r.t(초) → 판(실수) → 열쇠
  function pose(b, r, now) {
    b.mesh.material = MAT[b.sex][r.kind];
    if (r.rest) {                                             // 쉼 자세(하네스 키 재기) — 액션을 다 멈추면 뼈가 묶기 자세로 돌아간다
      for (const k in b.acts) b.acts[k].stop();
      b.mixer.update(0); b.clip = null;
    } else {
      const c = CLIP[b.sex][r.clip];
      const a = actOf(b, r.clip);
      if (b.clip !== r.clip) {
        for (const k in b.acts) b.acts[k].stop();
        a.reset(); a.play();
        b.clip = r.clip;
      }
      const fr = (r.key != null) ? r.key : r.t * c.fps;      // 시트 판(실수)
      let kt = fr * meta.keysPerFrame;                         // 열쇠 시각
      kt = c.loop ? (((kt % c.K) + c.K) % c.K) : Math.max(0, Math.min(c.span, kt));
      a.time = kt;
      b.mixer.update(0);
    }
    const dt = b.lastT ? Math.min(0.25, (now - b.lastT) / 1000) : 0;
    b.lastT = now;
    if (r.key != null || r.rest || b.yaw === null || !(dt > 0)) b.yaw = r.yaw;   // ⓑ 시트 행 그대로 · 처음 · 멈춘 판
    else {
      let d = r.yaw - b.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      b.yaw += d * (1 - Math.exp(-dt / TURN_TAU));
      b.yaw = Math.atan2(Math.sin(b.yaw), Math.cos(b.yaw));
    }
    b.root.rotation.y = -b.yaw;                               // 모델 +x 가 게임 방향 atan2(fy,fx) 를 본다(거울 좌표에서 부호가 뒤집힌다)
  }

  // ── 빛 — 게임 시각·날씨에서(④) ─────────────────────────────────────────────────────────────
  function updateLight() {
    const wc = (typeof worldClock !== 'undefined') ? worldClock : null;
    const dr = wc && wc.dayPhaseRatio > 0 ? wc.dayPhaseRatio : null;
    const p = (typeof worldPhase === 'function') ? worldPhase() : null;
    const u = (dr && p != null) ? p / dr : 0.5;               // 낮 안의 자리(0 해 뜸 · 0.5 한낮 · 1 해 짐) — 시계가 없으면 한낮(= 시트 빛)
    const day = u >= 0 && u < 1;
    const elev = day ? E0 * Math.sin(Math.PI * u) : 0;
    const azim = A0 - (u - 0.5) * Math.PI;                    // 동(+x)에서 떠 서(−x)로 진다 — 한낮 방위 = 시트 태양
    const w = (typeof wxState === 'function') ? wxState() : null;
    const pr = Math.max(0, Math.min(1, (w && +w.precip) || 0));
    const I = day ? meta.sunEnergy * Math.sin(elev) / Math.sin(E0) * (1 - pr) : 0;
    const ce = Math.cos(elev);
    sun.position.set(ce * Math.cos(azim) * 10, Math.sin(elev) * 10, ce * Math.sin(azim) * 10);   // Blender (x, y, z) → 거울 좌표 (x, z, y)
    sun.intensity = I;
    api.light = { u: +u.toFixed(4), day, elev: +(elev * 180 / Math.PI).toFixed(2), azim: +(azim * 180 / Math.PI).toFixed(2),
                  sun: +I.toFixed(4), precip: pr, hemi: +hemi.intensity.toFixed(4) };
  }

  // ── WebGL 판 · 카메라 — 판 전체를 한 카메라가 덮고 타일 k 는 판의 (k % 열, k / 열) 칸 ────────────────
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
  // 오른 손목의 타일 자리(px) — 렌더 뒤(행렬이 선 뒤)에 부른다
  function wristPx(b, sx, sy) {
    b.hand.getWorldPosition(vW);
    vW.project(camera);
    return [(vW.x + 1) / 2 * glc.width - sx, (1 - vW.y) / 2 * glc.height - sy];
  }
  // 도구 층 옮김 — 3D 오른 손목 − 시트 오른 손목(`handScreen[클립][행][판]` · 같은 판의 정본 표)
  function handShift(b, t) {
    const m = cm(), hs = m && m.handScreen && m.handScreen[t.clip] && m.handScreen[t.clip][t.row] && m.handScreen[t.clip][t.row][t.frame];
    if (!hs) return null;
    const w = wristPx(b, t.sx, t.sy);
    return [Math.round(w[0] - hs[0]), Math.round(w[1] - hs[1])];
  }

  // ── 프레임 — 한 판에 렌더 한 번 ─────────────────────────────────────────────────────────────
  let reqs = [];                           // 이 판에 모이는 요청 → 다음 판 첫 몸이 그린다
  let tiles = new Map();                   // 이 판에 쓸 타일(pid → {sx, sy, clip, frame, row, full, cont, yaw, hand})
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
    updateLight();
    for (const b of pool.values()) b.root.visible = false;
    const shift = [];
    L.forEach((r, k) => {
      const b = bodyFor(r.pid, r.sex);
      pose(b, r, now);
      const [sx, sy] = placeTile(b, k);
      b.root.visible = true;
      const t = { sx, sy, clip: r.sheetClip, frame: r.frame, row: r.row, full: true, cont: r.cont, kind: r.kind, sex: r.sex, yaw: b.yaw, t: r.t, key: r.key, hand: null };
      tiles.set(r.pid, t);
      if (r.tools) shift.push([b, t]);
    });
    renderer.setViewport(0, 0, glc.width, glc.height);
    renderer.setScissorTest(false);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);                           // ★한 판에 한 번
    for (const [b, t] of shift) t.hand = handShift(b, t);     // 렌더가 행렬을 세운 뒤 — 이 판의 자세 그대로
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

  // ── 갈고리 ② 시트 경로의 층 고리 — 이 몸의 'body' 층 자리에 3D 타일을 찍을까(몸마다 모드 하나) ─────────────────
  //   부르는 쪽(`42-r2-char.js drawCharSprite`)이 시트 상태기계를 이미 돌렸다(stt = 이번 판의 클립·판 · row = 시트 행).
  //   돌려주는 것: null(시트로 그린다) · 또는 타일 {sx, sy, clip, frame, row, full, hand} — 남은 시트 층은 **타일의 판·행**으로 얹는다.
  let _bodyTok = -1;
  function modeOf(layers, sheetClip, sex) {
    if (!CLIP[sex] || !CLIP[sex][clipName(sheetClip)]) return { why: 'clip' };            // ⓒ 3D 에 없는 클립(시트로 넘긴 목록)
    let kind = null; const rest = [];
    for (const L of layers) {
      if (L === 'body') continue;
      if (kind === null && L.startsWith('clothes_') && KINDS.has(L.slice(8))) { kind = L.slice(8); continue; }
      rest.push(L);
    }
    if (!kind) return { why: layers.some((L) => L.startsWith('clothes_')) ? 'cloth' : 'bare' };   // ⓒ 옷 넷 밖 · 맨몸
    if (rest.some((L) => L.startsWith('clothes_'))) return { why: 'cloth' };
    return { kind, cont: rest.length === 0, tools: rest.some((L) => L.startsWith('tool_')) };
  }
  api.modeOf = (layers, sheetClip) => (api.ready ? modeOf(layers, sheetClip, sexOf()) : null);   // 하네스가 몸마다 기대 모드를 같은 술어로 묻는다
  api.body = function (pid, isMe, layers, stt, row, opts, x, y) {
    if (!api.ready || api.mode === 'sheet') return null;
    if (_bodyTok !== api.stats.tok) { _bodyTok = api.stats.tok; api.stats.bodyFrames++; }
    renderAll();                                              // 이 판의 첫 몸이면 앞 판 요청을 한 번에 그린다
    const sex = sexOf();
    const md = modeOf(layers, stt.clip, sex);
    if (!md.kind) return null;                                // ⓒ 시트
    const st = (typeof _charAnim !== 'undefined') ? _charAnim.get(pid) : null;
    const tSec = st ? (st.one ? st.oneT : st.t) : 0;
    const yawC = Math.atan2(opts.fvy || 0, (opts.fvx || opts.fvy) ? (opts.fvx || 0) : 1);
    reqs.push({ pid, sex, kind: md.kind, cont: md.cont, tools: md.tools, sheetClip: stt.clip, clip: clipName(stt.clip), frame: stt.frame, row,
                key: md.cont ? null : stt.frame, t: tSec, yaw: md.cont ? yawC : row * Math.PI / 4 });
    let tl = tiles.get(pid) || null;
    if (tl && tl.kind !== md.kind) tl = null;                 // 옷을 갈아입은 판 — 앞 판 타일은 옛 옷이다(한 판 시트)
    if (isMe) {
      const _me = (typeof _renderReady !== 'undefined' && _renderReady && typeof myAbsRender === 'object') ? myAbsRender
                : ((typeof myAbsPredicted === 'object') ? myAbsPredicted : null);   // = render() 의 `_camAbs` 와 같은 식
      const _pr = (typeof myAbsPredicted === 'object' && myAbsPredicted) ? myAbsPredicted : null;
      const _sc = (_me && window.__w2s) ? window.__w2s(_me.x, _me.y) : null;
      api.lastDraw = { gl: api.stats.ms, blit: api.stats.stageMs, n: api.stats.bodies, calls: api.stats.calls, x, y,
                       clip: tl ? tl.clip : null, full: !!tl, cont: tl ? tl.cont : md.cont, kind: md.kind, sex,
                       t: tl ? +(+tl.t).toFixed(4) : null, yaw: tl ? +tl.yaw.toFixed(4) : null, yawTarget: +yawC.toFixed(4), tile: !!tl, hand: tl ? tl.hand : null,
                       abs: _me ? [+_me.x.toFixed(2), +_me.y.toFixed(2)] : null, w2s: _sc ? [+_sc.px.toFixed(2), +_sc.py.toFixed(2)] : null,
                       pred: _pr ? [+_pr.x.toFixed(2), +_pr.y.toFixed(2)] : null };
    }
    return tl;
  };
  // 타일을 찍는다(시트 경로가 'body' 층 자리에서 부른다) — 덮개 모드는 내 몸만 위 캔버스로
  api.blit = function (g, tl, dx, dy, isMe) {
    if (api.overlay && isMe && tl.cont) { overlayBlit(stg, tl.sx, tl.sy, dx, dy); return; }
    g.drawImage(stg, tl.sx, tl.sy, fw, fh, dx, dy, fw, fh);
  };
  api.meshLayer = (L) => L === 'body' || (L.startsWith('clothes_') && KINDS.has(L.slice(8)));   // 타일에 이미 든 층(몸 + 옷 한 벌)
  api.tileOf = (pid) => { const t = tiles.get(pid) || tiles.get(+pid) || tiles.get(String(pid)); return t ? { clip: t.clip, frame: t.frame, row: t.row, cont: t.cont, kind: t.kind, sex: t.sex, yaw: t.yaw, t: t.t, key: t.key, hand: t.hand } : null; };   // 재는 자리(하네스)

  // ── 재는 자리(하네스) — 한 방향·한 판의 타일을 떠서 준다(시트 판과 맞대는 재료) · 판 파이프라인과 따로 렌더한다 ──────
  //   o = { kind, sex, rest(쉼 자세), yaw(라디안 — 없으면 방향 × 45°) } · 시각 = 시트 판 frameIdx 의 열쇠(ⓑ 와 같은 문법)
  api.snap = function (dirIdx, clip, frameIdx, o) {
    o = (o && typeof o === 'object') ? o : {};
    const sex = (o.sex && CLIP[o.sex]) ? o.sex : sexOf();
    const cn = clip ? clipName(clip) : null;
    if (!api.ready || (!o.rest && !CLIP[sex][cn])) return null;
    if (!cols) ensureGrid(1);                                  // 판 크기는 프레임 파이프라인 몫 — 재는 판은 타일 0 칸만 쓴다
    const b = bodyFor('__snap', sex);
    const vis = [];
    for (const q of pool.values()) { vis.push([q, q.root.visible]); q.root.visible = false; }
    b.clip = null;
    updateLight();
    pose(b, { clip: cn, key: frameIdx || 0, t: 0, rest: !!o.rest, yaw: o.yaw != null ? o.yaw : dirIdx * Math.PI / 4, kind: KINDS.has(o.kind) ? o.kind : [...KINDS][0] }, performance.now());
    placeTile(b, 0);
    if (o.scale) b.model.scale.multiplyScalar(o.scale);       // 자명 통과 금지 재료(하네스) — 몸을 줄이거나 키운 판
    b.root.visible = true;
    renderer.setViewport(0, 0, glc.width, glc.height);
    renderer.setScissorTest(false);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    const wr = wristPx(b, 0, 0);
    const calls = renderer.info.render.calls;
    // 발 — 두 발목(LeftFoot·RightFoot 머리)의 가운데를 타일 px 로 · 가장 낮은 살(스키닝 뒤 · 모델 축 높이 m)
    const fp = [], sk = new T.Vector3();
    for (const nm of ['_LeftFoot', '_RightFoot']) { b.model.getObjectByName(b.sex + nm).getWorldPosition(sk); sk.project(camera); fp.push([(sk.x + 1) / 2 * glc.width, (1 - sk.y) / 2 * glc.height]); }
    let low = Infinity, top = -Infinity;
    if (o.geo) { const n = b.mesh.geometry.attributes.position.count; for (let i = 0; i < n; i++) { b.mesh.getVertexPosition(i, sk); if (sk.y < low) low = sk.y; if (sk.y > top) top = sk.y; } }
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
    const g = cv.getContext('2d');
    g.drawImage(glc, 0, 0, fw, fh, 0, 0, fw, fh);
    for (const [q, v] of vis) q.root.visible = v;
    if (o.scale) b.model.scale.set(1, meta.zsq, -1);
    b.root.visible = false; b.clip = null;                     // 판 파이프라인 무접촉 — 타일은 받침(stg)에서 오고 재는 판은 WebGL 판만 쓴다
    return { w: fw, h: fh, ax, ay, calls, wrist: [+wr[0].toFixed(2), +wr[1].toFixed(2)],
             feet: [+((fp[0][0] + fp[1][0]) / 2).toFixed(2), +((fp[0][1] + fp[1][1]) / 2).toFixed(2)],
             low: o.geo ? +low.toFixed(4) : null, top: o.geo ? +top.toFixed(4) : null, data: Array.from(g.getImageData(0, 0, fw, fh).data) };
  };
  api.clips = (sex) => { const s = (sex && CLIP[sex]) ? sex : sexOf(); return Object.keys(CLIP[s]).map((k) => ({ name: k, src: CLIP[s][k].clip.name, fps: CLIP[s][k].fps, frames: CLIP[s][k].frames, loop: CLIP[s][k].loop, K: CLIP[s][k].K })); };

  function setup(tex) {
    const m = cm();
    if (!m) { setTimeout(() => setup(tex), 200); return; }
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
    // ── 빛(④): 방향광 하나 + 반구광 하나 — 한낮 = 시트 굽기의 태양·하늘 그대로(`char3d_meta.json`) ──
    const sd = meta.sunDir;                                   // 빛이 가는 방향(Blender 축) — 해는 그 반대편
    E0 = Math.asin(Math.max(-1, Math.min(1, -sd[2])));
    A0 = Math.atan2(-sd[1], -sd[0]);
    sun = new T.DirectionalLight(0xffffff, meta.sunEnergy);
    scene.add(sun); scene.add(sun.target);
    const sky = new T.Color(meta.sky[0], meta.sky[1], meta.sky[2]);
    hemi = new T.HemisphereLight(sky, sky, Math.PI * meta.skyStrength);
    scene.add(hemi);
    // ── 재질: 몸마다 옷마다 하나(아틀라스 한 장 + 알파 한 장 · 거칠기 = 옷 본천 `CLOTH_MATS`) · [T654] 갖옷은 털 두께만큼 부풀린다 ──
    for (const sex of Object.keys(tex)) {
      MAT[sex] = {};
      const inf = meta.bodies[sex].inflate || {};
      for (const k of meta.clothKinds) {
        MAT[sex][k] = new T.MeshStandardMaterial({ map: tex[sex][k], alphaMap: tex[sex].alpha, alphaTest: meta.alphaTest,
                                                   roughness: meta.roughness[k], metalness: 0, side: T.DoubleSide });
        if (inf[k] > 0) inflate(MAT[sex][k], inf[k]);
      }
    }
    KINDS = new Set(meta.clothKinds);
    // ── 카메라: 게임 투영 그대로 · 원점(발밑)이 타일 0 의 앵커에 선다 ──
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    camera = new T.OrthographicCamera(-ax / PPU, (fw - ax) / PPU, ay / PPU, -(fh - ay) / PPU, 0.1, 200);
    camera.up.set(-s / Math.SQRT2, c, -s / Math.SQRT2);
    camera.position.set(c / Math.SQRT2 * 50, s * 50, c / Math.SQRT2 * 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    vR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    vU.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    // ── 클립 표: 몸마다 '<몸>.<클립>' · 손 포즈판 셋은 별칭(같은 액션) ──
    const byName = {}; for (const a of gltf.animations) byName[a.name] = a;
    for (const sex of Object.keys(meta.bodies)) {
      CLIP[sex] = {};
      for (const [name, mm] of Object.entries(meta.clips)) {
        const a = byName[sex + '.' + name]; if (!a) continue;
        CLIP[sex][name] = { clip: a, frames: mm.frames, fps: mm.fps, loop: !!mm.loop, K: mm.keys, span: mm.span };
      }
      for (const [al, to] of Object.entries(meta.clipAlias || {})) if (CLIP[sex][to] && !CLIP[sex][al]) CLIP[sex][al] = CLIP[sex][to];
    }
    ensureGrid(1);
    api.ready = true; api.why = null;
    if (api.overlay) makeOverlay();
  }

  const J = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  J('/assets/char3d/char3d_meta.json').then((j) => {
    if (!j) { fail('메타 없음'); return; }
    meta = j;
    const base = '/assets/char3d/';
    const TL = new T.TextureLoader();
    const tex = (u, srgb) => new Promise((ok, no) => TL.load(base + u, (t) => { t.flipY = false; if (srgb) t.colorSpace = T.SRGBColorSpace; ok(t); }, undefined, () => no(new Error(u))));
    const jobs = [new Promise((ok, no) => new T.GLTFLoader().load(base + j.glb, ok, undefined, (e) => no(new Error('glb: ' + (e && e.message)))))];
    const T2 = {};
    for (const sex of Object.keys(j.textures)) {
      T2[sex] = {};
      jobs.push(tex(j.textures[sex].alpha, false).then((t) => { T2[sex].alpha = t; }));
      for (const k of j.clothKinds) jobs.push(tex(j.textures[sex][k], true).then((t) => { T2[sex][k] = t; }));
    }
    Promise.all(jobs).then(([g]) => { gltf = g; setup(T2); }).catch((e) => fail(String(e && e.message)));
  });
})();
