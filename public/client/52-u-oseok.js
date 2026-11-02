// === public/client/52-u-oseok.js — 오석 판 재질 모듈(T1071) ============================================
//
//   ★재민 11-02 "실제 기념비처럼 다듬은 돌에 글자를 판 흑백" — 정본 `설계/설계_마을화면_오석.md` · 시안 `설계/시안/오석/*.jpg`.
//   시안은 파이썬으로 구운 한 장 그림이다. 게임 글자 · 숫자는 바뀌므로 판 글자를 **브라우저에서 그때그때** 그린다.
//
//   부품(모두 DOM 요소 하나에 붙는다):
//     Oseok.plate(el, o)          판 — 돌 무늬 타일(`ui/oseok/plate.png`) + 모따기 9조각(`bevel.png`) + 바닥 그림자 9조각(`shadow.png`)
//                                 (그림자는 z-index −1 — 판을 담은 쪽이 쌓임 맥락이어야 한다: Oseok.ground 가 isolation 을 건다)
//     Oseok.ground(el, o)         바닥 — 더 어두운 오석(`ground.png`)
//     Oseok.text(el, s, o)        판 글자 — o.size(px · 18 아래 금지) · o.font('serif' | 'sans' | 'sansm')
//     Oseok.bar(el, p, o)         판 막대 — 판 홈 · 찬 몫 밝은 돌가루 · 빈 몫 어두운 홈(p 0~1)
//     Oseok.button(el, s, o)      판 버튼 — 판 사각 테두리(o.primary 면 겹 테두리) + 판 글자
//     Oseok.rule(el, o)           판 선 — 가는 판 홈(가로 · 세로 · 기운 선은 o.angle)
//     Oseok.frame(el, o)          판 사각 테두리(o.lw)
//   판 글자 그리는 길은 셋을 견줘 하나를 골랐다(보고 T1071 §2) — `Oseok.way` 가 그 길이다.
//     'canvas' — 오프스크린 글자 마스크 → 1 · 2px 어긋난 사본으로 빛 쪽 벽 그늘 · 반대쪽 벽 빛(시안 V자 홈 식을 흉내)
//     'svg'    — SVG 필터(feGaussianBlur → feDiffuseLighting · 글자 알파를 높이로)
//     'css'    — text-shadow 겹치기
//   글꼴은 Noto CJK KR(OFL) 세 벌을 `ui/oseok/fonts/` 에 담았다(KS X 1001 한글 2,350 자 + 글자 · 기호 · 없는 글자는 시스템 글꼴로).
//   최상위 실행문 0 — 이름 하나(`Oseok`)만 둔다. 처음 쓸 때 스타일 · 필터를 한 번 꽂는다.
const Oseok = (() => {
  const C = {
    base: 'ui/oseok/',
    // ★값은 셋 다 같은 돌 기준(시안 식)에 화소로 맞춘 것 — scripts/t1071-oseok-tune.js · 보고 T1071 §2
    frost: 0.88,          // canvas 길 — 판 글자 안 돌가루 밝기(시안 식 0.9)
    groove: 0.143,        // 막대 빈 몫(시안 surf × 0.55 = 0.26 × 0.55)
    // canvas 길 — 어긋난 사본(dx, dy px, 색, 알파): 그늘은 빛 쪽(위 왼쪽) 벽 · 빛은 반대쪽 벽(시안 LIGHT (-0.7, -0.9, 1))
    ss: 2,                // 크게 그리는 배(시안 SS = 2) — ½px 사본이 화소 하나가 된다
    ssBig: 30,            // 이 크기(px) 이상 글자는 1배로(획이 굵어 벽이 획을 덮지 않는다 · 화소 값은 크기 제곱)
    rims: [[0.5, 0.5, 0, 1], [1, 1, 0, 0.45], [-0.5, -0.5, 255, 1]],
    rimsBig: [[1, 1, 0, 0.8], [2, 2, 0, 0.6], [-1, -1, 255, 1]],   // ssBig 이상 글자(1배 · 벽이 더 넓다 — 시안 홈 벽 1.8px)
    grain: 0.05,          // 홈 안 돌가루 결(시안 inner = frost + 0.05 × 고운 잡음) — 씨앗 고정 잡음 무늬
    soft: true,           // 2D 문맥을 CPU 로(willReadFrequently) — 작은 글자 캔버스는 어차피 CPU 라 GPU 사본과 섞이면 되읽기가 생긴다
    // svg 길 — 글자색 · 흐림 · 높이 · 빛(시안 빛 벡터의 방위 232° · 높이 41°)
    svgFrost: 0.76, svgBlur: 0.8, svgScale: -1.5, svgAz: 232, svgEl: 41,
    // css 길
    cssFrost: 0.68, cssShadow: '-1px -1px 0 rgba(0,0,0,0.55), 1px 1px 0 rgba(255,255,255,0.3)',
  };
  const FONTS = {
    serif: { fam: "'Oseok Serif'", w: 700, file: 'oseok-serif-bold' },
    sans: { fam: "'Oseok Sans'", w: 700, file: 'oseok-sans-bold' },
    sansm: { fam: "'Oseok Sans'", w: 500, file: 'oseok-sans-medium' },
  };
  const FALLBACK = ",'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif";
  const FALLBACK_SERIF = ",'Noto Serif KR','AppleMyungjo',serif";
  const gray = (v) => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${c},${c},${c})`; };
  let way = 'canvas';
  let installed = false;
  const live = new Set();      // canvas 길 요소(글꼴이 늦게 오거나 DPR 이 바뀌면 다시 그린다)

  function fontCss(k, size) { const f = FONTS[k] || FONTS.sans; return `${f.w} ${size}px ${f.fam}${k === 'serif' ? FALLBACK_SERIF : FALLBACK}`; }

  function install() {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    const B = C.base, img = (n) => `-webkit-image-set(url(${B}${n}.png) 1x, url(${B}${n}@2x.png) 2x)`;
    const img2 = (n) => `image-set(url(${B}${n}.png) 1x, url(${B}${n}@2x.png) 2x)`;
    const ff = Object.values(FONTS).map((f) => `@font-face{font-family:${f.fam};font-weight:${f.w};font-display:block;src:url(${B}fonts/${f.file}.woff2) format('woff2')}`).join('\n');
    const st = document.createElement('style'); st.id = 'oseok-style';
    st.textContent = `${ff}
.os-ground{isolation:isolate;background-color:${gray(0.0715)};background-image:${img('ground')};background-image:${img2('ground')};background-size:512px 512px}
:where(.os-plate){position:relative}
.os-plate{background-color:${gray(0.26)};background-image:${img('plate')};background-image:${img2('plate')};background-size:512px 512px}
.os-plate::after{content:'';position:absolute;left:-26px;top:-24px;right:-38px;bottom:-40px;pointer-events:none;z-index:-1;border:64px solid transparent;border-image-source:${img('shadow')};border-image-source:${img2('shadow')};border-image-slice:64;border-image-width:64px}
.os-plate.os-noshadow::after{display:none}
.os-plate::before{content:'';position:absolute;inset:0;pointer-events:none;border:12px solid transparent;border-image-source:${img('bevel')};border-image-source:${img2('bevel')};border-image-slice:12;border-image-width:12px;z-index:0}
:where(.os-t){position:relative;z-index:1}
.os-t{white-space:nowrap}
.os-t.os-css{color:${gray(C.cssFrost)};text-shadow:${C.cssShadow}}
.os-t.os-svg{color:${gray(C.svgFrost)}}
.os-t.os-svg,.os-e.os-svg{filter:url(#os-engrave)}
.os-t canvas.os-cv{display:inline-block;vertical-align:var(--os-va);margin:0 calc(-1 * var(--os-pad));pointer-events:none}
.os-t.os-cvhost{color:transparent}
:where(.os-e){position:relative;z-index:1}
.os-frame{border-style:solid;box-sizing:border-box}
.os-css.os-rule{background:${gray(C.cssFrost)}}.os-svg.os-rule{background:${gray(C.svgFrost)}}
.os-css.os-frame{border-color:${gray(C.cssFrost)}}.os-svg.os-frame{border-color:${gray(C.svgFrost)}}
.os-bar{background:${gray(C.groove)}}
.os-bar>i{display:block;height:100%}
.os-css.os-bar>i{background:${gray(C.cssFrost)}}.os-svg.os-bar>i{background:${gray(C.svgFrost)}}
.os-css.os-rule,.os-css.os-bar{box-shadow:inset 1px 1px 0 rgba(0,0,0,0.45)}
.os-css.os-frame{box-shadow:inset 1px 1px 0 rgba(0,0,0,0.35),-1px -1px 0 rgba(0,0,0,0.45)}
:where(.os-btn){position:relative}
.os-btn{display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:none;padding:0;margin:0}
.os-btn>.os-frame{position:absolute;inset:0}
.os-btn>.os-frame+.os-frame{inset:4px}
.os-btn:focus-visible{outline:2px solid ${gray(C.frost)};outline-offset:3px}`;
    document.head.appendChild(st);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    const kd = 0.5 / Math.sin(C.svgEl * Math.PI / 180);   // 평평한 면 = 0.5 → ×2 하면 1(빛 쪽 벽은 2 까지 밝게)
    svg.innerHTML = `<filter id="os-engrave" x="-4" y="-4" width="200%" height="200%" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="${C.svgBlur}" result="b"/>
<feDiffuseLighting in="b" surfaceScale="${C.svgScale}" diffuseConstant="${kd.toFixed(4)}" lighting-color="#fff" result="L"><feDistantLight azimuth="${C.svgAz}" elevation="${C.svgEl}"/></feDiffuseLighting>
<feComposite in="SourceGraphic" in2="L" operator="arithmetic" k1="2" k2="0" k3="0" k4="0" result="lit"/>
<feComposite in="lit" in2="SourceAlpha" operator="in"/></filter>`;
    // 사용자 공간 필터 상자는 요소마다 다르므로 objectBoundingBox 로 둔다
    const f = svg.querySelector('filter'); f.setAttribute('filterUnits', 'objectBoundingBox'); f.setAttribute('x', '-0.1'); f.setAttribute('y', '-0.3'); f.setAttribute('width', '1.2'); f.setAttribute('height', '1.6');
    document.body.appendChild(svg);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => redrawAll());
    if (typeof matchMedia === 'function') { try { matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => redrawAll()); } catch (e) {} }
  }

  // ── canvas 길: 마스크 하나를 받아 V자 홈처럼 칠한다 ─────────────────────────────────────────
  //   시안처럼 C.ss 배로 크게 그려(마스크 · 홈 안 색 · 어긋난 사본) 줄여 얹는다 — 획이 2px 안팎이라 1배에서는 그늘이 획을 덮는다.
  let _tmp = null, _msk = null, _acc = null;
  const ctx2 = (c) => c.getContext('2d', C.soft ? { willReadFrequently: true } : undefined);
  function scratch(w, h) {
    if (!_tmp) { _tmp = document.createElement('canvas'); _msk = document.createElement('canvas'); _acc = document.createElement('canvas'); }
    // 128px 눈금 크기 — 모자라거나 두 배 넘게 크면 다시 잡는다(크게 키워 둔 채 일부만 쓰면 크롬 GPU 2D 에서 drawImage 가 판당 8ms)
    const bw = Math.ceil(w / 128) * 128, bh = Math.ceil(h / 128) * 128;
    for (const c of [_tmp, _acc]) { if (c.width < w || c.height < h || c.width > 2 * bw || c.height > 2 * bh) { c.width = bw; c.height = bh; } }
    return [ctx2(_tmp), ctx2(_acc)];
  }
  // 돌가루 결 무늬 — 64×64 씨앗 고정 잡음(시안 inner 의 고운 잡음 · 결정론) · frost 값마다 하나
  let _grain = null, _grainKey = '';
  function grainCanvas(fr) {
    const key = `${fr}|${C.grain}`;
    if (_grain && _grainKey === key) return _grain;
    const N = 64, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), im = x.createImageData(N, N);
    let z = 1071; const rnd = () => { z = (z * 1103515245 + 12345) & 0x7fffffff; return z / 0x7fffffff; };
    const raw = new Float32Array(N * N); for (let i = 0; i < raw.length; i++) raw[i] = rnd() + rnd() + rnd() - 1.5;
    const sm = new Float32Array(N * N); let m2 = 0;   // 3×3 이웃 평균(감싸기) 으로 고르게
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { let a = 0; for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) a += raw[((j + v + N) % N) * N + ((i + u + N) % N)] * ((u || v) ? 0.5 : 1); sm[j * N + i] = a; m2 += a * a; }
    const sd = Math.sqrt(m2 / sm.length) || 1;
    for (let i = 0; i < sm.length; i++) { const g = Math.round(Math.max(0, Math.min(1, fr + C.grain * sm[i] / sd)) * 255); im.data[4 * i] = im.data[4 * i + 1] = im.data[4 * i + 2] = g; im.data[4 * i + 3] = 255; }
    x.putImageData(im, 0, 0);
    _grain = c; _grainKey = key; return c;
  }
  const frostFill = (ctx) => {
    if (!(C.grain > 0)) return gray(C.frost);
    const g = grainCanvas(C.frost);
    if (ctx._osPat && ctx._osPatSrc === g) return ctx._osPat;    // 문맥마다 무늬 하나(만들기 값이 판마다 든다)
    ctx._osPat = ctx.createPattern(g, 'repeat'); ctx._osPatSrc = g; return ctx._osPat;
  };

  // mdraw(ctx) 가 지금 칠 색(fillStyle · strokeStyle)으로 판 모양을 그린다(CSS px 좌표 · 배율은 이미 걸림)
  // fill(ctx, w, h) 가 있으면 홈 안 색을 그것으로(막대) · kk = 크게 그리는 배
  //   판 모양을 마스크로 따로 두지 않고 그때그때 다시 그린다(글자 그리기는 글자 화소만 · 통째 옮기기보다 싸다)
  function engraveCanvas(cv, cssW, cssH, mdraw, fill, kk, rims) {
    const d = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
    const W = Math.max(1, Math.ceil(cssW * d)), H = Math.max(1, Math.ceil(cssH * d));
    // 레티나(DPR 2 이상)는 이미 시안 SS 2 와 같은 화소 — 더 키우지 않는다
    const k = d >= 2 ? 1 : Math.max(1, (kk || C.ss) | 0), s = d * k, W2 = W * k, H2 = H * k;
    if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
    cv.style.width = `${W / d}px`; cv.style.height = `${H / d}px`;
    const [t, a] = scratch(W2, H2);
    const reset = (c, op) => { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = op || 'source-over'; };
    const paint = (c, col, ox, oy) => { c.setTransform(s, 0, 0, s, ox || 0, oy || 0); c.fillStyle = col; c.strokeStyle = col; mdraw(c); };
    reset(a); a.clearRect(0, 0, W2, H2);
    // 막대: 흰 판 모양 위에 source-atop 으로 칠한다(source-in 이면 둘째 칠이 첫째를 지운다)
    if (fill) { paint(a, '#fff'); a.globalCompositeOperation = 'source-atop'; fill(a, cssW, cssH); } else paint(a, frostFill(a));
    // 어긋난 사본: 판 모양 − (dx,dy) 만큼 민 판 모양 = 그쪽 벽 → 검정(그늘) · 흰(빛)
    for (const [dx, dy, col, al] of (rims || C.rims)) {
      if (!(al > 0)) continue;
      reset(t); t.clearRect(0, 0, W2, H2);
      paint(t, `rgb(${col},${col},${col})`);
      t.globalCompositeOperation = 'destination-out'; paint(t, '#000', Math.round(dx * s), Math.round(dy * s));
      reset(t);
      reset(a, 'source-atop'); a.globalAlpha = al; a.drawImage(_tmp, 0, 0, W2, H2, 0, 0, W2, H2);
    }
    reset(a);
    const o = ctx2(cv);
    reset(o); o.clearRect(0, 0, W, H);
    o.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in o) o.imageSmoothingQuality = 'high';
    o.drawImage(_acc, 0, 0, W2, H2, 0, 0, W, H);
  }

  const PAD = 3;   // 글자 캔버스 둘레 여유(px) — 어긋난 사본 · 획 끝 넘침
  const _mctx = () => { if (!_msk) scratch(1, 1); return _msk.getContext('2d'); };
  function drawTextCanvas(el) {
    const s = el._osText, size = el._osSize, k = el._osFont;
    const ctx = _mctx(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = fontCss(k, size);
    const mt = ctx.measureText(s);
    const asc = mt.fontBoundingBoxAscent != null ? mt.fontBoundingBoxAscent : size * 1.16;
    const desc = mt.fontBoundingBoxDescent != null ? mt.fontBoundingBoxDescent : size * 0.288;
    const w = mt.width, cw = w + 2 * PAD, ch = asc + desc + 2 * PAD;
    let cv = el._osCv;
    if (!cv) { cv = el._osCv = document.createElement('canvas'); cv.className = 'os-cv'; cv.setAttribute('aria-hidden', 'true'); el.textContent = ''; el.appendChild(cv); }
    el.style.setProperty('--os-pad', `${PAD}px`);
    el.style.setProperty('--os-va', `${-(desc + PAD)}px`);
    // 획이 굵은 큰 글자(C.ssBig px 이상)는 1배로도 벽이 획을 덮지 않는다 — 화소 값이 크기 제곱으로 들므로 큰 글자만 1배
    const big = size >= C.ssBig;
    engraveCanvas(cv, cw, ch, (m) => { m.font = fontCss(k, size); m.textBaseline = 'alphabetic'; m.fillText(s, PAD, PAD + asc); }, null, big ? 1 : C.ss, big ? C.rimsBig : C.rims);
  }
  function redrawAll() { for (const el of live) { if (!el.isConnected) { live.delete(el); continue; } if (el._osRedraw) el._osRedraw(); } }

  function setWay(el, w) { el.classList.remove('os-css', 'os-svg', 'os-cvhost'); el.classList.add(w === 'css' ? 'os-css' : w === 'svg' ? 'os-svg' : 'os-cvhost'); }

  // ── 판 글자 ──────────────────────────────────────────────────────────────────────────────
  function text(el, s, o) {
    install(); o = o || {};
    const size = Math.max(18, o.size || 20), k = o.font || 'sansm', w = o.way || way;
    s = String(s);
    if (el._osText === s && el._osSize === size && el._osFont === k && el._osWay === w) return el;   // 같은 글자면 다시 안 그린다
    el._osText = s; el._osSize = size; el._osFont = k; el._osWay = w;
    el.classList.add('os-t'); setWay(el, w);
    el.style.font = fontCss(k, size);
    if (w === 'canvas') {
      el.setAttribute('role', 'img'); el.setAttribute('aria-label', s);
      el._osRedraw = () => drawTextCanvas(el); live.add(el); drawTextCanvas(el);
    } else {
      if (el._osCv) { el._osCv.remove(); el._osCv = null; }
      el.removeAttribute('role'); el.removeAttribute('aria-label'); live.delete(el); el._osRedraw = null;
      el.textContent = s;
    }
    return el;
  }

  // ── 판 · 바닥 ────────────────────────────────────────────────────────────────────────────
  function plate(el, o) { install(); o = o || {}; el.classList.add('os-plate'); if (o.ox != null) el.style.backgroundPosition = `${-o.ox}px ${-o.oy}px`; if (o.shadow === false) el.classList.add('os-noshadow'); return el; }
  function ground(el, o) { install(); o = o || {}; el.classList.add('os-ground'); if (o.ox != null) el.style.backgroundPosition = `${-o.ox}px ${-o.oy}px`; return el; }

  // ── 판 선 · 사각 · 막대 — 같은 길로 판다 ─────────────────────────────────────────────────────
  function shape(el, kind, o, drawMask, fill, cssFn) {
    install(); const w = o.way || way;
    el.classList.add('os-e'); setWay(el, w === 'canvas' ? 'canvas' : w);
    el.classList.remove('os-cvhost');
    if (w === 'canvas') {
      el.classList.remove('os-rule', 'os-frame', 'os-bar'); el.style.background = 'none'; el.style.border = '0';
      let cv = el._osCv; if (!cv) { cv = el._osCv = document.createElement('canvas'); cv.style.position = 'absolute'; cv.style.left = cv.style.top = '0'; cv.setAttribute('aria-hidden', 'true'); el.textContent = ''; el.appendChild(cv); }
      el._osRedraw = () => { const r = { w: o.w != null ? o.w : el.clientWidth, h: o.h != null ? o.h : el.clientHeight }; engraveCanvas(cv, r.w, r.h, (m) => drawMask(m, r.w, r.h), fill ? (c) => fill(c, r.w, r.h) : null); };
      live.add(el); el._osRedraw();
    } else { el.classList.add('os-' + kind); cssFn(); }
    return el;
  }
  function rule(el, o) {
    o = o || {}; const lw = o.lw || 1;
    return shape(el, 'rule', o, (m, w, h) => { m.fillRect(0, (h - lw) / 2, w, lw); }, null, () => {});
  }
  function frame(el, o) {
    o = o || {}; const lw = o.lw || 2;
    return shape(el, 'frame', o, (m, w, h) => { m.lineWidth = lw; m.strokeRect(lw / 2, lw / 2, w - lw, h - lw); }, null, () => { el.style.borderWidth = `${lw}px`; });
  }
  function bar(el, p, o) {
    o = o || {}; p = Math.max(0, Math.min(1, +p || 0));
    el._osP = p; el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    if (el._osShaped && (o.way || way) === el._osWayB) { if (el._osRedraw) el._osRedraw(); else if (el.firstChild) el.firstChild.style.width = `${p * 100}%`; return el; }
    el._osShaped = true; el._osWayB = o.way || way;
    el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
    return shape(el, 'bar', o, (m, w, h) => { m.fillRect(0, 0, w, h); }, (c, w, h) => { c.fillStyle = gray(C.groove); c.fillRect(0, 0, w, h); c.fillStyle = frostFill(c); c.fillRect(0, 0, w * el._osP, h); },
      () => { el.textContent = ''; const i = document.createElement('i'); i.style.width = `${p * 100}%`; el.appendChild(i); });
  }
  function button(el, s, o) {
    o = o || {}; install();
    el.classList.add('os-btn'); if (el.tagName !== 'BUTTON') { el.setAttribute('role', 'button'); el.tabIndex = 0; }
    if (!el._osBtn) {
      el.textContent = '';
      const f1 = document.createElement('span'); f1.style.width = '100%'; f1.style.height = '100%'; el.appendChild(f1);
      let f2 = null; if (o.primary) { f2 = document.createElement('span'); el.appendChild(f2); }
      const t = document.createElement('span'); el.appendChild(t);
      el._osBtn = { f1, f2, t };
    }
    const r = { w: o.w || el.clientWidth, h: o.h || el.clientHeight };
    const { f1, f2, t } = el._osBtn;
    f1.style.position = 'absolute'; f1.style.inset = '0';
    frame(f1, { lw: o.lw || (o.primary ? 2.2 : 2), w: r.w, h: r.h, way: o.way });
    if (f2) { f2.style.position = 'absolute'; f2.style.inset = '4px'; frame(f2, { lw: 1, w: r.w - 8, h: r.h - 8, way: o.way }); }
    text(t, s, { size: o.size || 20, font: o.font || 'sans', way: o.way });
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', String(s));
    return el;
  }

  return {
    C, FONTS, fontCss, install, text, plate, ground, rule, frame, bar, button, redrawAll,
    get way() { return way; }, set way(w) { way = w; },
    ready() { install(); return (document.fonts && document.fonts.load) ? Promise.all(Object.keys(FONTS).map((k) => document.fonts.load(fontCss(k, 20), '가A'))).then(() => document.fonts.ready) : Promise.resolve(); },
  };
})();
