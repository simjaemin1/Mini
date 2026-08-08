// =============================================================================
// 3D 산 목업 엔진 — **브라우저에 그대로 삽입되는 소스**
//   [재민(타 세션) 2026-08-08 목업 2차 사양]
//
// ■ 아키텍처 전제 (지시서 그대로. 벗어나는 안은 만들지 않는다)
//   · 렌더러 교체 금지. 산 "이미지의 출처"만 바꾼다 —
//     청크별 높이맵 메시를 **오프스크린에 굽고**, 그 결과를 지금의 mtseg 자리에
//     스프라이트처럼 꽂는다. 같은 앵커·같은 z정렬·같은 안개 게이트·같은 wx/wy 규약.
//   · 나무·건물·NPC 는 구운 스프라이트 그대로 (재작업 없음)
//   · 고정 2:1 · 줌 없음 · 태양 52°/−35° · 캔버스 2D (WebGL 안 쓴다)
//   · 지형 데이터 무접촉 — 높이는 **가장자리 거리장**에서 유도
//
// ■ z 정렬 (②가 최대 난점이라 했으므로 여기부터)
//   라이브 규약:  mtseg → z = w2i(sg.x, sg.y).y = (wx+wy)/2
//                 개체   → z = w2i(ax, ay).y   = (ax+ay)/2
//   셀 (i,j) 중심은 wx=32i+16, wy=32j+16 → z = 16(i+j) + 16.
//   ⇒ **같은 반대각선(i+j=k) 위의 모든 것은 z 가 같다.**
//   그래서 메시를 **반대각선 띠 단위로 잘라** 한 띠 = 한 mtseg 로 내보내면
//   화가 알고리즘이 정확히 성립한다:
//       뒤(작은 k) 개체 → 먼저 그려짐 → 앞의 산이 덮는다 ✓
//       앞(큰 k) 개체   → 나중에 그려짐 → 산을 덮는다 ✓
//       같은 k          → 개체가 그 셀 **위에** 섰다 → 띠 z 에 −0.5 를 줘 개체가 앞
//   ★같은 k 의 셀끼리는 화면에서 가로로 떨어져 있고 높이는 **수직으로만** 오르므로
//     서로 겹치지 않는다 — 띠 안의 그리는 순서는 무관하다.
//
// ■ 왜 청크 × 띠 인가
//   띠를 전 화면으로 잡으면 한 장이 1400×512 → 171장 = 수백 MB.
//   청크(기본 8×8셀)로 자르면 실제로 그려지는 만큼만 차지한다.
//   ★바위가 없는 청크는 아예 안 만든다 — 평지는 지금처럼 지면 타일이 그린다.
//     산 청크에는 1셀 앞치마(높이 0)를 붙여 덩어리 앞면이 뚫리지 않게 한다
//     (1차 목업에서 바위만 그렸더니 배경 검정이 삼각형으로 샜다).
// =============================================================================
window.MT3D = (function () {
  'use strict';
  const CELL = 32, PPU_SCR = 64 / Math.SQRT2;
  const w2i = (wx, wy) => ({ x: wx - wy, y: (wx + wy) / 2 });

  // ── 결정적 해시 — 렌더 산포에 Math.random 금지 ────────────────────────────
  const hash = (x, y, s) => {
    let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1103515245); n ^= n >>> 16; return (n >>> 0) / 4294967296;
  };
  function vn(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), e = hash(xi + 1, yi + 1, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
  }

  // ══ 높이장 ═════════════════════════════════════════════════════════════════
  // C[j][i] : 0 풀 · 1 물 · 2 바위.  파괴는 2 → 0 으로 바꾸고 리메시한다.
  function makeField(S) {
    const W = S.W, H = S.H, C = S.CELLS, HMAX = S.HMAX, LAM = S.LAM;
    const isRock = (i, j) => i >= 0 && j >= 0 && i < W && j < H && C[j][i] === 2;

    const INF = 1e6, d = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) d[j * W + i] = isRock(i, j) ? INF : 0;
    const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? INF : d[j * W + i];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (d[k] === 0) continue;
      d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; if (d[k] === 0) continue;
      d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }

    // ★1칸 = 화면 32px (PPU·cos30°·ZSQ = 45.2548×0.8660×0.8165 = 32.00)
    // ★셀마다 값이 하나로 정해지므로 "산 = 바위 셀"이 **구조적으로** 성립한다 ⇒ ②는 정의상 0.
    const hgt = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!isRock(i, j)) { hgt[j * W + i] = 0; continue; }
      const dE = d[j * W + i];
      let h = HMAX * (1 - Math.exp(-dE / LAM));
      const t = Math.min(1, dE / 3);
      // ★절대 셀 좌표로 해시 → 청크가 달라도 같은 값(이음매 방지)
      const ai = i + S.cx0, aj = j + S.cy0;
      h += t * (3.4 * (vn(ai / 14, aj / 14, 29) - 0.5)
              + 2.0 * (vn(ai / 6, aj / 6, 31) - 0.5)
              + 1.5 * (vn(ai / 2.9, aj / 2.9, 37) - 0.5)
              + 0.7 * (vn(ai / 1.6, aj / 1.6, 41) - 0.5));   // ★잔 결 강화 — 면이 갈라져야 3D 로 읽힌다
      hgt[j * W + i] = Math.max(0.12, h);
    }
    const t2 = Float32Array.from(hgt);       // 평활 1패스 (3패스는 민둥산 — 1차 실측)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!isRock(i, j)) continue;
      let sum = t2[j * W + i] * 2, w = 2;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const ii = i + a, jj = j + b; sum += (ii < 0 || jj < 0 || ii >= W || jj >= H) ? 0 : t2[jj * W + ii]; w++;
      }
      hgt[j * W + i] = sum / w;
    }
    const hAt = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : hgt[j * W + i];
    // ★꼭짓점 높이 = 그 점에 닿는 네 셀의 평균. 셀 평면으로 그리면 수직 벽(계단)이 남는다.
    const cor = (i, j) => (hAt(i - 1, j - 1) + hAt(i, j - 1) + hAt(i - 1, j) + hAt(i, j)) / 4;
    return { W, H, d, hgt, hAt, cor, isRock,
             dAt: (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : d[j * W + i] };
  }

  // ══ 재질 ═══════════════════════════════════════════════════════════════════
  const L = [-0.452, -0.6455, 0.6157];        // 태양 52°/−35° 에서 유도
  const LAM_FLAT = L[2];                      // 평지의 램버트
  // ★평지의 음영 배율은 **정확히 1.0** 이어야 한다 — 지면 텍스처가 이미 이 조명으로
  //   구워져 있으므로, 그래야 게임 그림과 픽셀이 안 어긋난다.
  // ★1차 목업 값(0.42/0.92)은 대비가 약해 "민짜 회색 벽"으로 보였다 — 재민 지적 그대로다.
  //   평지 배율 1.0 이라는 제약(지면 텍스처와 안 어긋나야 한다)은 유지한 채
  //   환경광을 내리고 직사광을 올려 면끼리의 차이를 벌린다.
  const AMB = 0.32, DIR = 1.02;
  const K_FLAT = AMB + DIR * LAM_FLAT;

  // (A) PEAK 식 — 제한 팔레트 + 계단 음영
  const PAL_A = [[68, 80, 56], [92, 100, 72], [122, 124, 96],
                 [152, 150, 128], [188, 184, 170], [216, 212, 202]];
  const STEPS_A = 5;

  // ══ 띠 굽기 ════════════════════════════════════════════════════════════════
  // 한 청크(CH×CH셀) 안에서 반대각선 k 를 BAND 개씩 묶어 한 장씩 굽는다.
  // 결과: { k, wx, wy, z, img, ox, oy }  — ox,oy 는 셀(i,j) 기준점에서의 앵커
  function bakeBands(F, S, opt) {
    const CH = opt.CH | 0, BAND = Math.max(1, opt.BAND | 0), TEX = opt.TEX, MAT = opt.MAT;
    const W = F.W, H = F.H, HMAX = S.HMAX;
    const out = [];
    let px = 0, canv = 0;

    // ★셀 소유는 **나눗셈 하나로** 정한다 — 중복도 누락도 구조적으로 불가능하다.
    //   메시 셀 = 바위 ∪ 바위에 8-인접한 셀(앞치마).
    //   앞치마가 필요한 이유: 바위만 그리면 덩어리 **앞면이 뚫려** 배경 검정이
    //   삼각형으로 샌다(1차 목업 실측). 지면과 산은 하나로 이어진 면이어야 한다.
    const isMesh = (i, j) => {
      if (i < 0 || j < 0 || i >= W || j >= H) return false;
      if (F.isRock(i, j)) return true;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++)
        if ((a || b) && F.isRock(i + a, j + b)) return true;
      return false;
    };
    const chunks = new Map();          // "ci_cj" → [[i,j],...]
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!isMesh(i, j)) continue;
      const key = Math.floor(i / CH) + '_' + Math.floor(j / CH);
      let a = chunks.get(key); if (!a) chunks.set(key, a = []); a.push([i, j]);
    }

    for (const [, list] of chunks) {
      // 청크 안에서 반대각선 k = i+j 로 묶는다. BAND 개씩 한 장.
      const byBand = new Map();
      for (const c of list) {
        const kb = Math.floor((c[0] + c[1]) / BAND) * BAND;
        let a = byBand.get(kb); if (!a) byBand.set(kb, a = []); a.push(c);
      }
      for (const [kb, cells] of [...byBand].sort((p, q) => p[0] - q[0])) {
        // 화면 bbox — 실제 그릴 만큼만
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [i, j] of cells) {
          const hs = [F.cor(i, j), F.cor(i + 1, j), F.cor(i + 1, j + 1), F.cor(i, j + 1)];
          const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
          for (let n = 0; n < 4; n++) {
            const c = w2i(pts[n][0] * CELL, pts[n][1] * CELL);
            const X = c.x, Y = c.y - hs[n] * CELL;
            if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
          }
        }
        const PAD = 2;
        x0 = Math.floor(x0) - PAD; y0 = Math.floor(y0) - PAD;
        const bw = Math.ceil(x1) + PAD - x0, bh = Math.ceil(y1) + PAD - y0;
        if (bw <= 0 || bh <= 0) continue;

        const cv = document.createElement('canvas'); cv.width = bw; cv.height = bh;
        const g = cv.getContext('2d');
        g.translate(-x0, -y0);
        for (const [i, j] of cells) drawQuad(g, F, S, i, j, TEX, MAT, opt);
        px += bw * bh; canv++;

        // 기준 셀 = 이 띠에서 가장 뒤(작은 k)의 셀. wx/wy 는 그 셀 중심.
        const ref = cells.reduce((a, b) => (a[0] + a[1] <= b[0] + b[1] ? a : b));
        const wx = (ref[0] + S.cx0) * CELL + CELL / 2, wy = (ref[1] + S.cy0) * CELL + CELL / 2;
        const rp = w2i(ref[0] * CELL + CELL / 2, ref[1] * CELL + CELL / 2);
        out.push({
          img: cv, kind: 'mtseg',
          // ★라이브 규약과 동일: z = w2i(wx,wy).y. −0.5 는 "같은 셀 위의 개체가 앞" 이라는 뜻.
          z: w2i(wx, wy).y - 0.5,
          wx, wy,
          ox: rp.x - x0, oy: rp.y - y0,        // 기준점이 이미지 안 어디인가
          k: kb, cells: cells.length,
        });
      }
    }
    out.sort((a, b) => a.z - b.z);
    return { segs: out, px, canv };
  }

  // ── 사각형 하나 ────────────────────────────────────────────────────────────
  // ★1px 덧그리기(stroke)를 **뺐다**. 조명은 경로 **안쪽**만 덮는데 stroke 는 절반이
  //   밖으로 나가 조명이 안 얹힌 맨 패턴이 남는다 — 화면에 밝은 격자 그물로 보였다.
  //   대신 도형을 무게중심 기준으로 아주 살짝 부풀려 실틈을 막는다(조명도 같이 덮인다).
  // ── 재질 선택 — **한 군데에서만** 정한다(하네스가 사본을 만들지 않게 내보낸다) ──
  //   ★한반도의 산은 **숲산**이다(스프라이트 이름부터 mt_G). 온 사면이 맨바위면
  //     "산만 다른 게임" 이 그대로 남는다. 맨바위는 급경사·정상부에만 둔다.
  //   ★사면에 **풀·마른풀 텍스처를 쓰지 않는다.** 그 둘은 평지용으로 구운 잎 무늬라
  //     45° 면에 깔면 잎이 안 눕고 '샤워 커튼'처럼 흐른다(실측: 시안 3판이 그렇게 보였다).
  //     사면은 방향성이 없는 **바위 질감 한 장**으로 통일하고, 초록은 **틴트**로 준다.
  //     숲의 느낌은 ④ 나무 스프라이트가 만든다 — 그게 mt_G(숲산)의 실제 구성이다.
  //   ★산자락(foot)은 **풀 텍스처 그대로**다. 여기서 색이 튀면 셀 경계 톱니가
  //     탄색 삼각형으로 도드라진다(1·2차 시안에서 그게 제일 눈에 거슬렸다).
  const MATS = {
    water: { tex: 'water', tint: null },
    rock:  { tex: 'rock',  tint: null },                          // 맨바위 절벽
    crag:  { tex: 'rock',  tint: 'rgba(96,112,76,0.34)' },        // 이끼낀 바위
    scree: { tex: 'rock',  tint: 'rgba(88,110,62,0.46)' },        // 너덜
    slope: { tex: 'rock',  tint: 'rgba(74,98,52,0.56)' },         // 숲 사면
    foot:  { tex: 'grass', tint: null },                          // 산자락 — 지면과 같은 그림
  };
  function matOf(steep, hAvg, HM, water) {
    if (water) return 'water';
    // ★자락 판정을 **높이로 먼저** 한다. 경사로 먼저 재면 자락이 걸린다 —
    //   가장자리 셀은 0 → 1.5칸을 한 셀에 오르느라 기울기가 가장 급해서
    //   'rock' 으로 분류됐고, 그래서 초록 풀밭에 **탄색 삼각 톱니**가 났다(실측 시안 2·3판).
    if (hAvg < 0.9) return 'foot';
    if (steep > 0.66) return 'rock';
    if (steep > 0.46 || hAvg > HM * 0.86) return 'crag';
    if (steep > 0.26 || hAvg > HM * 0.50) return 'scree';
    return 'slope';
  }

  const INFL = 0.75;
  function inflate(pts) {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= pts.length; cy /= pts.length;
    return pts.map(p => {
      const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1;
      return [p[0] + dx / l * INFL, p[1] + dy / l * INFL];
    });
  }
  function poly(g, pts) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let n = 1; n < pts.length; n++) g.lineTo(pts[n][0], pts[n][1]);
    g.closePath();
  }

  // 오목함(크레바스) — 이웃 평균보다 낮으면 골, 높으면 능선. 라플라시안.
  function concavity(F, i, j) {
    const h = F.hAt(i, j);
    if (h <= 0) return 0;
    let s = 0, n = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { s += F.hAt(i + a, j + b); n++; }
    return (s / n) - h;                      // >0 오목(골) · <0 볼록(능선)
  }

  function shadeFill(g, pts, k, hAvg, HMAX, conc) {
    // 조명 — 알베도와 분리. 평지는 배율 1.0(= 아무것도 안 얹음)이라 게임 그림과 안 어긋난다.
    if (k < 1) { g.fillStyle = 'rgba(12,15,20,' + Math.min(0.88, (1 - k) * 1.05) + ')'; poly(g, pts); g.fill(); }
    else if (k > 1) { g.fillStyle = 'rgba(255,247,226,' + Math.min(0.55, (k - 1) * 0.62) + ')'; poly(g, pts); g.fill(); }
    // 골 그늘(AO) — 3D 로 보이게 하는 데 램버트보다 이게 더 크게 기여한다.
    if (conc > 0.02) { g.fillStyle = 'rgba(18,22,26,' + Math.min(0.40, conc * 0.34) + ')'; poly(g, pts); g.fill(); }
    else if (conc < -0.02) { g.fillStyle = 'rgba(255,250,236,' + Math.min(0.24, -conc * 0.20) + ')'; poly(g, pts); g.fill(); }
    // 대기 원근 — ★0.22 는 산을 하얗게 씻어냈다(재민 "민짜"). 0.09 로 낮춘다.
    if (hAvg > 0.5) { g.fillStyle = 'rgba(186,200,216,' + Math.min(0.09, (hAvg / HMAX) * 0.09) + ')'; poly(g, pts); g.fill(); }
  }

  function drawQuad(g, F, S, i, j, TEX, MAT, opt) {
    const JAG = (opt && opt.JAG) | 0;
    // 경계 셀(바위인데 이웃에 비바위가 있거나 그 반대)만 쪼갠다 — ⑥ 톱니 처리
    let sub = 1;
    if (JAG >= 2) {
      let mixed = false; const me = F.isRock(i, j);
      for (let b = -1; b <= 1 && !mixed; b++) for (let a = -1; a <= 1; a++)
        if (F.isRock(i + a, j + b) !== me) { mixed = true; break; }
      if (mixed) sub = 3;
    }
    const conc = concavity(F, i, j);
    const HM = S.HMAX;
    // 꼭짓점 높이 — 쪼갤 때는 이중선형 보간
    const H4 = [F.cor(i, j), F.cor(i + 1, j), F.cor(i + 1, j + 1), F.cor(i, j + 1)];  // NW NE SE SW
    const hAt2 = (u, v) => (H4[0] * (1 - u) + H4[1] * u) * (1 - v) + (H4[3] * (1 - u) + H4[2] * u) * v;
    // ★꼭짓점 지터 — 실루엣의 완벽한 지그재그를 깬다. 셀 해시라 결정적이고 이음매가 없다.
    //   격자점 공유가 깨지면 틈이 생기므로 **격자점 좌표의 해시**로 흔든다(양쪽이 같은 값).
    const JAM = JAG >= 1 ? (opt.JAMP === undefined ? 7.0 : opt.JAMP) : 0;
    const jit = (gi, gj) => JAM ? [(hash(gi + S.cx0, gj + S.cy0, 151) - 0.5) * 2 * JAM,
                                   (hash(gi + S.cx0, gj + S.cy0, 152) - 0.5) * JAM] : [0, 0];
    const P = (u, v) => {
      const gi = i + u, gj = j + v, hh = hAt2(u, v);
      const c = w2i(gi * CELL, gj * CELL);
      // 지터는 **경계 격자점에만** — 산 안쪽을 흔들면 무늬가 흐트러진다
      let jx = 0, jy = 0;
      // ★격자점이 **정수**일 때만 만진다. 세분한 안쪽 점에 isRock 을 물으면 소수 첨자로
      //   CELLS[2.33] 을 읽어 터진다(실제로 터졌다). 그리고 셀 안쪽 점은 실루엣이 아니다.
      if (JAM && Number.isInteger(u) && Number.isInteger(v)) {
        const q = [[0, 0], [-1, 0], [0, -1], [-1, -1]];
        const near = q.some(([a, b]) => F.isRock(gi + a, gj + b));
        const far = q.some(([a, b]) => !F.isRock(gi + a, gj + b));
        if (near && far) { const t = jit(gi, gj); jx = t[0]; jy = t[1]; }
      }
      return [c.x + jx, c.y - hh * CELL + jy];
    };

    for (let sv = 0; sv < sub; sv++) for (let su = 0; su < sub; su++) {
      const u0 = su / sub, u1 = (su + 1) / sub, v0 = sv / sub, v1 = (sv + 1) / sub;
      const A = P(u0, v0), B = P(u1, v0), C2 = P(u1, v1), D = P(u0, v1);
      const hNW = hAt2(u0, v0), hNE = hAt2(u1, v0), hSE = hAt2(u1, v1), hSW = hAt2(u0, v1);
      // ★자락 침식 — 세분한 조각 중 **네 꼭짓점이 전부 바닥(≈0)** 인 것은 안 그린다.
      //   ⑥ 톱니의 정체는 산 **발자국이 셀 다이아몬드 단위**라는 것이다. 음영을 아무리
      //   손봐도(2안) 발자국이 안 바뀌니 실측이 1.53px 그대로였다. 세분만 해도(지터 없이)
      //   발자국은 한 픽셀도 안 변한다 — 조각을 **빼야** 경계가 1/3셀 계단으로 잘아진다.
      //   빠진 자리는 지면이 그대로 보인다(높이 0 이라 원래 지면과 같은 그림).
      if (sub > 1 && opt && opt.ERODE) {
        const hm = Math.max(hNW, hNE, hSE, hSW);
        if (hm < opt.ERODE) continue;
      }
      const cw = CELL / sub;
      const u = [cw, cw, (hSE - hNW) * CELL], v = [cw, -cw, (hNE - hSW) * CELL];
      let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
      const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      // ★채움광 — 반대편에서 약하게. 없으면 남·동 사면이 통째로 까맣게 죽어
      //   "어두운 덩어리"로만 보인다(실측 시안 4판). 스타일라이즈드 렌더의 상식적 처리.
      const lamD = nx * L[0] + ny * L[1] + nz * L[2];
      const lam = Math.max(0.14, lamD) + Math.max(0, -lamD) * 0.20;
      const hAvg = (hNW + hNE + hSE + hSW) / 4;
      const steep = 1 - nz;
      const water = S.CELLS[j] && S.CELLS[j][i] === 1;
      const pts = inflate([A, B, C2, D]);

      if (MAT === 'A') {
        // (A) 는 팔레트만 쓴다 — 아래 matOf 와 무관
        // ── (A) PEAK 식 — 제한 팔레트 + 계단 음영 ────────────────────────────
        const t = Math.max(0, Math.min(0.999, (hAvg / HM) * 0.75 + steep * 0.55));
        const c = water ? [58, 82, 108] : PAL_A[Math.floor(t * PAL_A.length)];
        const q = Math.round(lam * STEPS_A) / STEPS_A;
        const kk = (AMB + DIR * q) / K_FLAT;
        g.fillStyle = 'rgb(' + Math.round(Math.min(255, c[0] * kk)) + ',' + Math.round(Math.min(255, c[1] * kk))
                    + ',' + Math.round(Math.min(255, c[2] * kk)) + ')';
        poly(g, pts); g.fill();
        continue;
      }

      // ── (B) 질감 판 — 게임 지면과 **같은 화면공간 패턴** ──────────────────
      //   ★패턴을 높이만큼 위로 민다(−h·32px) → 질감이 지면에 **붙는다**.
      //     등각 높이맵의 변위는 화면 y 축 순수 평행이동이라 이게 정확히 맞는다.
      const mt = matOf(steep, hAvg, HM, water);
      const pat = TEX[MATS[mt].tex], tint = MATS[mt].tint;
      // ★자락 치마(SKIRT) — 높이가 0 에 가까운 셀은 음영을 **평지(배율 1.0)로 수렴**시킨다.
      //   ⑥ 톱니가 눈에 띄는 진짜 이유는 실루엣이 아니라 **자락 셀의 어두운 쐐기**다:
      //   가장자리 셀은 0→1.5칸을 한 셀에 올라 기울기가 가장 급해 제일 어둡게 칠해진다.
      //   기하는 그대로 두고 **음영만** 지면으로 녹이면 톱니가 안 읽힌다.
      const SK = opt && opt.SKIRT ? opt.SKIRT : 0;
      const skirt = SK > 0 ? Math.min(1, hAvg / SK) : 1;
      // ★질감을 1.35배로 키운다 — 512×256 원본은 결이 너무 잘아 산에선 회색 판으로 뭉갠다.
      pat.setTransform(new DOMMatrix().translate(0, -Math.round(hAvg * CELL)).scale(1.35, 1.35));
      g.fillStyle = pat; poly(g, pts); g.fill();
      if (tint) { g.fillStyle = tint; poly(g, pts); g.fill(); }
      const kRaw = (AMB + DIR * lam) / K_FLAT;
      shadeFill(g, pts, 1 + (kRaw - 1) * skirt, hAvg, HM, conc * skirt);
    }
  }

  return { MATS, matOf, CELL, PPU_SCR, w2i, hash, vn, makeField, bakeBands, drawQuad, L, LAM_FLAT, K_FLAT, PAL_A };
})();
