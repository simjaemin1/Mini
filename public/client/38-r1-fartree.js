// @@split:38-r1-fartree — R1 원경 나무 층 [T380]

// ══════════════════════════════════════════════════════════════════════════════
// ★★[T380 2026-09-23] **원경 나무** — 시야 밖의 숲을 *자리*로 그린다(개체 0 · 상호작용 0)
//
// ★재민 실기 09-23: *"멀리서 나무가 안 보이는 이유는 뭐야?"*
//
// ★§0 이 층이 덮는 것은 **두 겹**이고, 그 둘은 원인이 다르다(보고 §0-ⓐ).
//   ⓐ 띠 `VIEW_RADIUS(650) ~ TILE_RENDER_RADIUS(1500)` — **자료는 이미 여기 있다.**
//      활성 청크는 px 가 아니라 청크 색인으로 켜진다(`ceil(1200/1024) = 2` ⇒ 5×5 청크 ⇒
//      어느 방향으로든 최소 2,048px). 그래서 1,500px 안의 나무는 전부 `c.resources` 에 들어 있는데
//      `34-m-renderloop.js:663` 이 **650에서 버린다**. 지면은 1,500까지 그리므로 그 차이가
//      "멀리 나무가 없다"로 보인다. ⇒ 이 띠는 **가진 것을 그리기만** 한다(방송 0 · 새 자료 0).
//   ⓑ 그 밖(큰지도 배율) — 여기는 **정말로 없다**. 서버가 색인(T301·T317)으로 읽어
//      `far_trees` 로 내준다(청크 단위 · 캐시 · 활성 청크는 **보내는 쪽에서** 건너뛴다 ⇒ 겹침 0).
//
// ★**개체가 아니다.** 클릭·채집·충돌 0 — 그리기만 한다. 활성 청크 안(=개체가 그려지는 곳)은
//   이 층이 **한 그루도** 안 그린다: 띠는 `viewR` 상자로 자르고(개체가 그 안을 그린다),
//   먼 곳은 서버가 활성 청크를 빼고 보낸다. 두 자가 **같은 상수**를 본다(사본 0).
//
// ★**안개는 새로 짜지 않는다.** 이 층은 `34-m-renderloop` 의 3단계 마스크 **앞**에서 불린다
//   (배치 19/21 이 세운 "지면 데코는 안개 마스크 앞" 계약 — 자연물이 선 그 자리다).
//   ⇒ 미탐사=완전히 가려짐 · 봤지만 시야 밖=20% 어둠 · 시야 안=밝음. **규격 그대로**다.
//
// ★**새 그림 0** — `drawTreeIso`(40-r2-sprites)를 그대로 부른다. 종·판 고르기도 그 함수의 것이다
//   (클라가 종 목록을 안 적는다 — T90/T148-B). 크기는 서버가 준 `r`·`h` 그대로이고,
//   `__farScale` 로 **작은 판**을 고를 수 있다(기본 1 = 개체와 같은 크기 ⇒ 경계에서 크기 층 0).
//
// ★**손잡이 기본 끔.** 서버가 `T380_FAR_TREES=1` 일 때만 답을 준다. 답이 한 번도 안 오면
//   이 층은 `_on` 이 false 라 **한 그루도 안 그린다** ⇒ 끔 비트 동일(하네스가 화소로 잰다).
//
// ★**`30-n-net.js` 무접촉**(T379 세션9). 수신은 이미 열린 소켓에 리스너를 **하나 더** 달아서 한다
//   (`ws.addEventListener` — `ws.onmessage` 를 안 건드린다). 남의 메시지는 **파싱 전에**
//   첫 글자로 버린다(`{"type":"far_` — 틱마다 JSON 을 두 번 파싱하면 그게 곧 부하다).
//
// ★**T0-b 규약 — 최상위 실행문을 늘리지 않는다**(`test-client-globals ③` 이 그걸 센다).
//   그래서 IIFE 껍데기도 `window.__far…` 대입도 **안 쓴다**: 최상위엔 선언만 두고,
//   부르는 쪽(`34-m-renderloop`·`80-bigmap`)이 **이름으로 직접** 부른다(자연물 `_natDraw` 선례).
//   하네스 훅은 첫 그리기가 한 번 다는 게으른 초기화다(40-r2-sprites `_ensureSpecies` 선례).
// ══════════════════════════════════════════════════════════════════════════════
// ★청크 한 변(px). 서버 `chunk.js CHUNK_SIZE` 와 같은 수다 — 클라가 이 수를 **쓰기만** 하고
//   자기 격자를 따로 만들지 않는다(넘침·경계 판정은 전부 서버 몫). 어긋나면 상자 컬링이
//   느슨해질 뿐 자리는 그대로다(자리는 서버가 준 절대 좌표다).
const FAR_CS = 1024;
const _farStore = new Map();            // "zid|cx_cy" → [x,y,r,h,sp, …] (5칸 묶음 · 서버가 준 그대로)
const _farSeenAt = new Map();            // zid → 이 존의 마지막 far 수신 시각(진단용)
let _farOn = false;                  // 서버가 답한 적이 있나 = 손잡이가 켜져 있나
let _farScaleV = 1;                   // 원경 스프라이트 배율(★작은 판 손잡이 · 기본 1)
let _farCapV = 4000;                  // 한 프레임 상한(그린 수) — 부하 표의 손잡이
let _farMs = 0;                      // 그리기 패스 ms(이동평균) — 자연물 `_natMs` 와 같은 문법
let _farReqAt = 0, _farReqR = 0;
let _farWantR = 0;              // 큰지도가 요구하는 반경(px) — 그 배율이 보여 주는 만큼
let _farHooksDone = false, _farForced = false;
let _farBlocked = false;        // 하네스 대조군 — `__farOff(1)` 이 켠다(들어오는 방송이 다시 켜지 못하게)
const _farStat = { near: 0, far: 0, drawn: 0, chunks: 0, done: null, hooked: 0,
                   culled: 0, capCut: 0, capHits: 0, nMax: 0, lastMs: 0, frames: 0, cx: 0, cy: 0, viewR: 0, tileR: 0 };

// ── 수신 ── 열린 소켓마다 리스너를 하나 더 단다(`onmessage` 무접촉).
function _farHook() {
  if (typeof conns === 'undefined' || !conns) return;
  for (const [zid, c] of conns) {
    if (!c || c._t380Hooked || !c.ws) continue;
    c._t380Hooked = true; _farStat.hooked++;
    try {
      c.ws.addEventListener('message', (ev) => {
        const d = ev.data;
        // ★파싱 **전에** 버린다 — 틱은 초당 30번 오고 그걸 두 번 파싱하면 그게 이 카드의 부하다.
        if (typeof d !== 'string' || d.charCodeAt(9) !== 102 /* 'f' */ || d.lastIndexOf('{"type":"far_', 0) !== 0) return;
        let m = null; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.type === 'far_trees') {
          if (!_farBlocked) _farOn = true;
          _farStore.set(zid + '|' + m.cx + '_' + m.cy, m.pts || []);
          _farSeenAt.set(zid, performance.now());
          _farStat.chunks = _farStore.size;
          if (window.__bigmapDirty) window.__bigmapDirty();
        } else if (m.type === 'far_trees_done') {
          if (!_farBlocked) _farOn = true;
          _farStat.done = m;
          if (window.__bigmapDirty) window.__bigmapDirty();
        }
      });
    } catch (e) { /* 리스너를 못 달아도 층만 비고 나머지는 그대로다 */ }
  }
}

// ── 요청 ── 배율이 요구하는 반경을 **클라가** 보낸다(상한은 서버가 다시 자른다 · 회부: 재민).
function _farRequest(r, now) {
  r = Math.max(r || 0, _farWantR);   // ★큰지도가 더 넓게 요구하면 그쪽이 이긴다(상한은 서버가 자른다)
  if (!(r > 0) || typeof window.__sendPrimary !== 'function') return;
  if (r === _farReqR && now - _farReqAt < 4000) return;   // 같은 반경을 매 프레임 조르지 않는다
  _farReqR = r; _farReqAt = now;
  window.__sendPrimary({ type: 'far_trees_req', r: Math.round(r) });
}

// ── 그리기 ── `34-m-renderloop` 이 **안개 마스크 앞**에서 한 줄로 부른다.
//   viewR = `VIEW_RADIUS`(개체가 그리는 상자) · tileR = `TILE_RENDER_RADIUS`(지면이 닿는 상자).
//   둘 다 렌더 함수의 **지역 상수**라 여기서 못 읽는다 — 그래서 넘겨받는다
//   (자연물 층이 `NAT_VIEW_PAD` 를 따로 적어야 했던 그 사정 · 11-r1-mountain:1580).
function _farDraw(ctx, toScreen, cx0, cy0, viewR, tileR) {
  _farInitHooks();
  _farHook();
  const now = performance.now();
  _farRequest(tileR, now);
  // ★★[T384 2026-09-25] **띠는 클라 혼자 켠다.** T380 판은 `if (!_farOn) return` 이 ⓐ 띠 **앞**에 있어서
  //   서버가 `T380_FAR_TREES=1` 로 답한 적이 없으면 **띠도 한 그루 안 그렸다** — 재민 실기 ②
  //   ("멀리서 나무가 안 보인다")가 서버 손잡이 뒤에 서 있었다. 그런데 띠의 자료는 **이미 클라에 있다**
  //   (`conns[].resources` · 활성 청크가 최소 2,048px 을 덮는다 — T380 §0). 서버가 알 일이 아니다.
  //   ⇒ 서버 답(`_farOn`)은 ⓑ 원경(`_farStore`) **앞으로만** 옮긴다. 띠는 기본 켬.
  //   ⇒ 대조군(`__farOff(1)` = `_farBlocked`)은 **둘 다** 끈다 — 하네스가 띠의 화소를 재는 자다.
  if (_farBlocked) { _farStat.drawn = 0; _farStat.near = 0; _farStat.far = 0; _farStat.culled = 0; return; }
  //   ⚠계수기를 **여기서 0 으로 내린다**: T380 1차 판은 마지막 값을 그대로 두었고, 하네스 ⓑ9 가
  //     "끄면 0" 을 물었을 때 **낡은 235** 를 읽었다(족보 130 — 계측기가 안 움직인 게 아니라 안 갱신됐다).
  _farStat.cx = cx0; _farStat.cy = cy0; _farStat.viewR = viewR; _farStat.tileR = tileR;   // 하네스가 **같은 상자**로 다시 센다
  const t0 = now;
  const items = [];
  const R = tileR;
  // ⓐ 띠 — **이미 가진 개체의 자리**. 개체가 그리는 상자(viewR) 안은 건너뛴다 ⇒ 겹침 0.
  //   ★★[T392 2026-09-25] **띠는 꺼졌다** — `34-m-renderloop` 의 `VIEW_RADIUS` 가 `TILE_RENDER_RADIUS` 의
  //     별칭이 되어 viewR === tileR 이다. 개체 컬링이 이 띠를 **개체로** 메운다(더 싸고 · 클릭·채집이 된다 ·
  //     안개 밑 나무를 안 그린다 — T384 두 팔 표). 상자가 비었으므로 자원 수천 개를 프레임마다 훑지도 않는다.
  //     원경 ⓑ(큰지도)는 그대로다.
  _farStat.near = 0;   // 띠를 건너뛴 프레임에 낡은 수가 남지 않게(족보 130)
  if (viewR < tileR && typeof conns !== 'undefined' && conns) {
    for (const c of conns.values()) {
      if (!c.meta || !c.resources) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      for (const r of c.resources.values()) {
        if (r.type !== 'tree') continue;
        const ax = ox + r.x, ay = oy + r.y;
        const dx = Math.abs(ax - cx0), dy = Math.abs(ay - cy0);
        if (dx <= viewR && dy <= viewR) continue;     // 개체가 그린다
        if (dx > R || dy > R) continue;
        const p1 = w2i(ax, ay);
        items.push(p1.y, ax, ay, r.r || 8, r.h || 60, r.sp || '', p1.x);
      }
    }
    _farStat.near = items.length / 7;
  }
  // ⓑ 먼 곳 — 서버가 색인으로 읽어 준 자리(활성 청크는 이미 빠져 있다).
  //   ★서버 손잡이는 **여기부터만** 문다(T384): 답이 한 번도 안 왔으면 `_farStore` 도 비어 있지만,
  //     `_farOn` 으로 한 번 더 막아 "끔 비트 동일" 절이 ⓑ 에 그대로 남게 한다.
  if (_farOn) for (const [k, pts] of _farStore) {
    const bar = k.indexOf('|');
    const zid = k.slice(0, bar);
    const c = (typeof conns !== 'undefined' && conns) ? conns.get(zid) : null;
    if (!c || !c.meta) continue;
    const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
    // ★청크 상자로 **먼저** 자른다 — 큰지도를 한 번 열면 여기 수만 그루가 쌓인다.
    //   그걸 프레임마다 한 그루씩 재면 그게 이 층의 부하가 된다(자리는 청크가 이미 말해 준다).
    const u = k.indexOf('_', bar);
    const bx = ox + (+k.slice(bar + 1, u)) * FAR_CS, by = oy + (+k.slice(u + 1)) * FAR_CS;
    if (bx - cx0 > R || cx0 - (bx + FAR_CS) > R || by - cy0 > R || cy0 - (by + FAR_CS) > R) continue;
    for (let i = 0; i + 4 < pts.length; i += 5) {
      const ax = ox + pts[i], ay = oy + pts[i + 1];
      if (Math.abs(ax - cx0) > R || Math.abs(ay - cy0) > R) continue;
      const p2 = w2i(ax, ay);
      items.push(p2.y, ax, ay, pts[i + 2], pts[i + 3], pts[i + 4], p2.x);
    }
  }
  _farStat.far = items.length / 7 - _farStat.near;
  if (!items.length) { _farStat.drawn = 0; _farStat.culled = 0; return; }
  // z 정렬 — 7칸 묶음이라 인덱스를 정렬하고 그 순서로 읽는다(객체를 프레임마다 안 만든다).
  //   ★iso 좌표는 **모을 때 한 번** 계산해 같이 싣는다 — 그리면서 다시 부르면 `w2i` 가 두 번 돈다.
  const n = items.length / 7;
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const _farZ = (i) => items[i * 7];
  Array.prototype.sort.call(idx, (a, b) => _farZ(a) - _farZ(b));
  let drawn = 0, culled = 0, q = 0;
  for (; q < n && drawn < _farCapV; q++) {
    const i = idx[q] * 7;
    const s = toScreen(items[i + 6], items[i]);   // ★`34-m-renderloop` 의 지역 함수 — `{x, y}` 를 낸다
    if (s.x < -200 || s.y < -300 || s.x > (typeof W === 'number' ? W : 4096) + 200
        || s.y > (typeof H === 'number' ? H : 4096) + 300) { culled++; continue; }   // 화면 밖 — 스프라이트 값을 안 만진다
    drawTreeIso(s.x, s.y, items[i + 3] * _farScaleV, items[i + 4] * _farScaleV, items[i + 1], items[i + 2], items[i + 5]);
    drawn++;
  }
  // ★[T384] 항등식 하나로 센다: **모은 수 = 그린 수 + 화면 밖 + 상한에 잘린 수.** 상한(`_farCapV`)에
  //   닿은 프레임은 따로 센다 — 카드가 물은 "띠가 4,000 에 닿는 프레임이 있나"의 답이다.
  _farStat.drawn = drawn; _farStat.culled = culled; _farStat.capCut = n - q;
  if (n - q > 0) _farStat.capHits++;
  if (n > _farStat.nMax) _farStat.nMax = n;
  const _dt = performance.now() - t0;
  _farStat.lastMs = _dt; _farStat.frames++;
  _farMs = _farMs * 0.969 + _dt * 0.031;
}

// ── 큰지도가 요구하는 반경 ── 지도가 열려 있는 동안만. 다음 요청이 이 값을 싣는다.
//   ★왜 클라가 정하나 — 얼마나 멀리까지 **보이나**는 배율이 아는 것이고, 배율은 여기 있다.
//     서버는 제 상한(`T380_FAR_MAX`)으로 다시 자른다(상한 판정 자체는 회부 · 재민).
function _farWant(r) {
const v = Math.max(0, Math.round(r || 0));
if (v === _farWantR) return _farWantR;
_farWantR = v;
_farReqR = -1;             // 반경이 바뀌었다 — 다음 프레임에 바로 다시 묻는다(4초 간격 규칙 우회)
return _farWantR;
}

// ── 큰지도의 숲 점 ── **같은 자료**로 점을 찍는다(새 표 0 · 새 색 0 — 타일 forest 색 그대로).
function _farBigmapDots(ctx, zoom, panX, panY, forestColor) {
  if (!_farOn || !_farStore.size) return 0;
  ctx.fillStyle = forestColor || '#2a5a2a';
  const d = Math.max(1, Math.round(zoom * 40));   // 점 한 변 — 나무 한 그루가 아니라 **숲의 얼룩**이다
  let k = 0;
  for (const [key, pts] of _farStore) {
    const bar = key.indexOf('|');
    const zid = key.slice(0, bar);
    const c = (typeof conns !== 'undefined' && conns) ? conns.get(zid) : null;
    if (!c || !c.meta) continue;
    const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
    for (let i = 0; i + 4 < pts.length; i += 5) {
      ctx.fillRect((ox + pts[i]) * zoom + panX, (oy + pts[i + 1]) * zoom + panY, d, d);
      k++;
    }
  }
  return k;
}

// ── 하네스 훅(읽기 전용 + 손잡이) ── 첫 그리기가 한 번 단다(최상위 실행문 0).
function _farInitHooks() {
  if (_farHooksDone) return;
  _farHooksDone = true;
  window.__farDbg = () => ({ on: _farOn, scale: _farScaleV, cap: _farCapV, ms: +_farMs.toFixed(3),
                             chunks: _farStore.size, zones: _farSeenAt.size, reqR: _farReqR,
                             near: _farStat.near, far: _farStat.far, drawn: _farStat.drawn,
                             hooked: _farStat.hooked, done: _farStat.done,
                             culled: _farStat.culled, capCut: _farStat.capCut, capHits: _farStat.capHits,
                             nMax: _farStat.nMax, lastMs: _farStat.lastMs, frames: _farStat.frames,
                             cx: _farStat.cx, cy: _farStat.cy, viewR: _farStat.viewR, tileR: _farStat.tileR,
                             blocked: _farBlocked });
  window.__farScale = (v) => { if (v > 0) _farScaleV = +v; return _farScaleV; };
  window.__farCap = (v) => { if (v >= 0) _farCapV = v | 0; return _farCapV; };
  // ★되돌림 — 이 층을 통째로 끈다(대조군). `_farBlocked` 가 서면 `_farDraw` 가 첫 줄에서 돌아간다 — **띠도 끈다**(T384).
  window.__farOff = (v) => { if (v) { _farOn = false; _farForced = false; _farBlocked = true; } else { _farBlocked = false; } return _farOn; };
  // ★대조군을 푼다(하네스 전용). 띠는 T384 부터 기본 켬이라 이것 없이도 그린다 — 원경(ⓑ)만 서버 답을 기다린다.
  //   ⚠`_farOn` 은 **서버가 답한 적이 있을 때만** 되살린다 — 손잡이 끔 서버에서 이걸 불러 ⓑ 가 켜지면
  //     "끔 비트 동일" 절이 하네스 손에 깨진다.
  window.__farForce = (v) => { _farForced = !!v; if (_farForced) { _farBlocked = false; _farOn = !!_farStat.done || _farStore.size > 0; } return _farOn; };
  // ★하네스가 "원경 자리 = 색인 답" 을 **스스로 다시 계산해** 대조하는 정본 창구 — 서버가 준 날것 그대로.
  window.__farPts = () => { const o = {}; for (const [k, v] of _farStore) o[k.slice(k.indexOf('|') + 1)] = v; return o; };
  window.__farCells = () => {   // 청크별 그루 수만(눈으로 볼 때)
    const out = {};
    for (const [k, pts] of _farStore) { const b = k.indexOf('|'); out[k.slice(b + 1)] = pts.length / 5; }
    return out;
  };
}
