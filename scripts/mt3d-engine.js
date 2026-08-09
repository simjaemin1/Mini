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
              + 0.7 * (vn(ai / 1.6, aj / 1.6, 41) - 0.5));   // ★잔 결 — 면이 갈라져야 3D 로 읽힌다
      // ★[재민 판정] "마루선이 민짜 고래등이다" — 능선(가장자리에서 먼 곳)일수록
      //   저주파 요철을 더 준다. 실루엣이 흔들려야 산등성이로 읽힌다.
      const crest = Math.min(1, Math.max(0, (dE - 3) / 5));
      h += crest * (2.2 * (vn(ai / 4.2, aj / 4.2, 43) - 0.5)
                  + 1.1 * (vn(ai / 2.1, aj / 2.1, 47) - 0.5));
      hgt[j * W + i] = Math.max(0.12, h);
    }
    // 평활 — ★1패스 전부는 산을 '천 조각'처럼 매끈하게 만든다(재민 "민짜"). 절반만 섞는다.
    //   3패스는 민둥산이 됐고(1차 실측), 0패스는 셀 계단이 남는다. 0.55 가 절충.
    const SMB = 0.55;
    const t2 = Float32Array.from(hgt);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (!isRock(i, j)) continue;
      let sum = t2[j * W + i] * 2, w = 2;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const ii = i + a, jj = j + b; sum += (ii < 0 || jj < 0 || ii >= W || jj >= H) ? 0 : t2[jj * W + ii]; w++;
      }
      hgt[j * W + i] = t2[j * W + i] * (1 - SMB) + (sum / w) * SMB;
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
  const AMB = 0.24, DIR = 1.10;
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
  //   팔레트는 **취향 갈림**이라 시안으로 낸다(B1 화강암 / B2 숲산 / B3 흙산).
  const PALETTES = {
    B1: {   // 화강암 — 회색 위주. 바위산 느낌.
      rock:  null,
      crag:  'rgba(122,124,116,0.26)',
      scree: 'rgba(112,116,100,0.34)',
      slope: 'rgba(96,108,78,0.40)',
    },
    B2: {   // 숲산 — 한반도 기본. 초록이 사면을 덮고 능선만 바위.
      rock:  'rgba(120,124,112,0.14)',
      crag:  'rgba(84,104,62,0.40)',
      scree: 'rgba(70,96,48,0.56)',
      slope: 'rgba(58,86,40,0.66)',
    },
    B3: {   // 흙산 — 황토·마사토. 남부 화강암 풍화 지대.
      rock:  'rgba(150,128,96,0.24)',
      crag:  'rgba(146,118,80,0.40)',
      scree: 'rgba(134,106,68,0.50)',
      slope: 'rgba(104,100,58,0.52)',
    },
  };
  function matsFor(pal) {
    const P = PALETTES[pal] || PALETTES.B2;
    return {
      water: { tex: 'water', tint: null },
      rock:  { tex: 'rock',  tint: P.rock },                      // 맨바위 절벽
      crag:  { tex: 'rock',  tint: P.crag },                      // 이끼낀 바위
      scree: { tex: 'rock',  tint: P.scree },                     // 너덜
      slope: { tex: 'rock',  tint: P.slope },                     // 숲 사면
      foot:  { tex: 'grass', tint: null },                        // 산자락 — 지면과 같은 그림
    };
  }
  const MATS = matsFor('B2');
  // ★[재민 판정 2026-08-09] "재질이 텍스처가 아니라 틴트다 / slope 1% — 사실상 2재질 이진값"
  //   ⇒ **2스케일**로 간다:
  //     매크로(10~20셀 노이즈)가 문턱 자체를 흔들어 crag/scree/slope 가 **밴드로 섞이고**,
  //     디테일(1~2셀 반복 텍스처)이 가까이서 볼 결을 만든다.
  //   macro 는 절대 셀 좌표 해시라 청크 경계에 이음매가 없다.
  function macroAt(ai, aj) {
    return (vn(ai / 17, aj / 17, 61) - 0.5) * 2      // 큰 지질 밴드
         + (vn(ai / 6.5, aj / 6.5, 63) - 0.5) * 0.9; // 중간 얼룩
  }
  function matOf(steep, hAvg, HM, water, macro) {
    if (water) return 'water';
    const m = macro || 0;
    // 문턱을 매크로로 밀어 준다 — 같은 경사라도 자리에 따라 바위/너덜/숲이 갈린다.
    const st = steep - m * 0.16, hh = hAvg / HM - m * 0.13;
    // ★자락 판정을 **높이로 먼저** 한다. 경사로 먼저 재면 자락이 걸린다 —
    //   가장자리 셀은 0 → 1.5칸을 한 셀에 오르느라 기울기가 가장 급해서
    //   'rock' 으로 분류됐고, 그래서 초록 풀밭에 **탄색 삼각 톱니**가 났다(실측 시안 2·3판).
    if (hAvg < 0.9) return 'foot';
    if (st > 0.72) return 'rock';
    if (st > 0.52 || hh > 0.88) return 'crag';
    if (st > 0.30 || hh > 0.58) return 'scree';
    return 'slope';
  }

  const INFL = 0.55;
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

  // ★[재민 판정] "띠 이음매 세로줄" — 원인은 **반투명 칠을 여러 겹 쌓은 것**이다.
  //   사각형을 0.75px 부풀려 실틈을 막는데, 그 겹친 띠에서 4겹이 두 번 합성돼 선으로 남았다.
  //   ⇒ 램버트·AO·대기원근을 **한 색 한 겹**으로 합쳐 칠한다. 겹쳐도 한 번만 더해진다.
  function shadeFill(g, pts, k, hAvg, HMAX, conc, band, contact) {
    let r = 0, gg = 0, b = 0, a = 0;
    const add = (cr, cg, cb, ca) => {
      if (ca <= 0.002) return;
      const na = a + ca * (1 - a);
      if (na <= 0) return;
      const w = ca * (1 - a) / na;
      r = r * (1 - w) + cr * w; gg = gg * (1 - w) + cg * w; b = b * (1 - w) + cb * w; a = na;
    };
    if (k < 1) add(12, 15, 20, Math.min(0.88, (1 - k) * 1.05));
    else if (k > 1) add(255, 247, 226, Math.min(0.55, (k - 1) * 0.62));
    if (conc > 0.02) add(16, 20, 26, Math.min(0.42, conc * 0.36));          // 골 그늘(AO)
    else if (conc < -0.02) add(255, 250, 236, Math.min(0.22, -conc * 0.19));
    if (band > 0) add(22, 24, 28, band);                                    // 절벽 층(등고선 결)
    if (contact > 0) add(10, 14, 18, contact);                              // ★자락 접지 AO
    if (hAvg > 0.5) add(186, 200, 216, Math.min(0.09, (hAvg / HMAX) * 0.09));
    if (a > 0.002) {
      g.fillStyle = 'rgba(' + Math.round(r) + ',' + Math.round(gg) + ',' + Math.round(b) + ',' + a.toFixed(3) + ')';
      poly(g, pts); g.fill();
    }
  }

  function drawQuad(g, F, S, i, j, TEX, MAT, opt) {
    const H4c = [F.cor(i, j), F.cor(i + 1, j), F.cor(i + 1, j + 1), F.cor(i, j + 1)];  // NW NE SE SW
    const JAG = (opt && opt.JAG) | 0;
    // 경계 셀(바위인데 이웃에 비바위가 있거나 그 반대)만 쪼갠다 — ⑥ 톱니 처리
    // ★★[재민 판정 2026-08-09 핵심] "가장 많이 보이는 면이 가장 정보가 없는 면"
    //   원인을 기하로 찾았다: 남서 앞면은 능선에서 자락까지 **3셀 남짓**이 화면 400px 로
    //   늘어난 벽이다. 셀이 3개뿐이니 셀 단위 재질·음영으로는 거기에 정보를 못 넣는다.
    //   ⇒ 급경사 셀은 **쪼개고 변위를 준다**. 그래야 벽에 실제 요철이 생긴다.
    //   ★변위는 (ai+u, aj+v) 의 연속 노이즈다 — 이웃 셀과 격자점 값이 저절로 같아
    //     갈라짐(crack)이 구조적으로 안 생긴다. 진폭도 높이의 연속 함수로 재운다.
    // ★[재민 2026-08-09] "정사각형들이 너무 큼직하다 — 안 보일 정도로 쪼갤 수 없나"
    //   원인: 급경사 셀만 쪼갰다. 완만한 셀은 **다이아 하나를 통짜로 평면 셰이딩** 해서
    //   64×32px 짜리 면이 그대로 보였다. 경사와 무관하게 **화면 픽셀 기준**으로 쪼갠다.
    //   한 조각이 화면에서 SUBPX px 이하가 되게 — 그러면 면이 눈에 안 잡힌다.
    //   ★비용은 **굽는 쪽**에만 붙는다(청크 캐시 대상). 매 프레임 blit 수는 그대로다.
    const SUBPX = (opt && opt.SUBPX) || (typeof window !== 'undefined' && window.MT3D_SUBPX) || 8;
    let sub = 1;
    {
      const hmin = Math.min(H4c[0], H4c[1], H4c[2], H4c[3]), hmax = Math.max(H4c[0], H4c[1], H4c[2], H4c[3]);
      const spanY = (hmax - hmin) * CELL + CELL;          // 화면 세로 폭(높이차가 늘린다)
      const need = Math.max(64, spanY) / SUBPX;           // 가로는 항상 64px
      sub = Math.max(1, Math.min(24, Math.ceil(need)));
    }
    const DSUB = (opt && opt.DSUB !== undefined) ? opt.DSUB : 4;
    const DAMP = (opt && opt.DAMP !== undefined) ? opt.DAMP : 0.42;
    let disp = null;
    if (DSUB > 1 && DAMP > 0) {
      const st0 = 1 - 1 / Math.hypot((F.hAt(i + 1, j) - F.hAt(i - 1, j)) * 0.5,
                                     (F.hAt(i, j + 1) - F.hAt(i, j - 1)) * 0.5, 1);
      if (st0 > 0.14) {
        // ★급할수록 더 잘게. 벽에서는 한 조각이 높이 3칸을 덮어 층(1.7칸 주기)이
        //   에일리어싱으로 사라졌다 — 조각이 층보다 얇아야 층이 보인다(실측).
        sub = Math.max(sub, st0 > 0.5 ? DSUB * 2 : DSUB);   // 변위엔 최소 분할이 따로 필요
        disp = (au, av, hh) => {
          const w = Math.min(1, hh / 1.6);                 // 자락에선 0 → 지면과 매끈히 만난다
          return w * DAMP * ((vn(au * 2.3, av * 2.3, 71) - 0.5) * 1.0
                           + (vn(au * 4.9, av * 4.9, 73) - 0.5) * 0.55);
        };
      }
    }
    if (JAG >= 2) {
      let mixed = false; const me = F.isRock(i, j);
      for (let b = -1; b <= 1 && !mixed; b++) for (let a = -1; a <= 1; a++)
        if (F.isRock(i + a, j + b) !== me) { mixed = true; break; }
      if (mixed) sub = Math.max(sub, 3);
    }
    const conc = concavity(F, i, j);
    const HM = S.HMAX;
    // 셀 중심의 완만한 법선(2셀 스텐실) — 정점 보간 대용
    let lamW = null;
    {
      const gx = (F.hAt(i + 1, j) - F.hAt(i - 1, j)) * 0.5, gy = (F.hAt(i, j + 1) - F.hAt(i, j - 1)) * 0.5;
      const nl = Math.hypot(gx, gy, 1) || 1;
      const d2 = (-gx / nl) * L[0] + (-gy / nl) * L[1] + (1 / nl) * L[2];
      lamW = Math.max(0.14, d2) + Math.max(0, -d2) * 0.20;
    }
    // ★[재민 판정] "지금 산엔 '층'이 없다" — 급경사에 가로 방향 절벽 밴드(등고선 결).
    //   높이를 1.7칸 주기로 잘라 경계에 그늘을 넣는다. 층리(bedding)로 읽힌다.
    const bandOf = (hh, steep) => {
      if (steep < 0.30) return 0;
      const t = Math.abs(((hh / 2.2) % 1) - 0.5) * 2;      // 0 경계 ~ 1 중앙
      return Math.max(0, (0.30 - t) / 0.30) * Math.min(0.42, (steep - 0.30) * 0.80);
    };
    // ★자락 접지 AO — 산이 지면과 만나는 첫 칸을 어둡게. 붙어 있는 느낌이 여기서 난다.
    const contact = (() => {
      if (!F.isRock(i, j)) return 0;
      const dE2 = F.dAt(i, j);
      return dE2 <= 1.6 ? 0.20 * (1 - dE2 / 1.6) : 0;
    })();
    const macro = macroAt(i + S.cx0, j + S.cy0);
    // 꼭짓점 높이 — 쪼갤 때는 이중선형 보간
    const H4 = H4c;
    const hBi = (u, v) => (H4[0] * (1 - u) + H4[1] * u) * (1 - v) + (H4[3] * (1 - u) + H4[2] * u) * v;
    const hAt2 = disp
      ? (u, v) => { const b0 = hBi(u, v); return Math.max(0, b0 + disp(i + S.cx0 + u, j + S.cy0 + v, b0)); }
      : hBi;
    // ★꼭짓점 지터 — 실루엣의 완벽한 지그재그를 깬다. 셀 해시라 결정적이고 이음매가 없다.
    //   격자점 공유가 깨지면 틈이 생기므로 **격자점 좌표의 해시**로 흔든다(양쪽이 같은 값).
    const JAM = JAG >= 1 ? (opt.JAMP === undefined ? 7.0 : opt.JAMP) : 0;
    const jit = (gi, gj) => JAM ? [(hash(gi + S.cx0, gj + S.cy0, 151) - 0.5) * 2 * JAM,
                                   (hash(gi + S.cx0, gj + S.cy0, 152) - 0.5) * JAM] : [0, 0];
    const P = (u, v) => {
      const gi = i + u, gj = j + v, hh = hAt2(u, v);
      const c = w2i(gi * CELL, gj * CELL);
      // ★가로 변위 — 높이만 흔들면 **수직 벽은 수직 벽 그대로** 보인다(실측).
      //   화면 x 로도 흔들어야 벽에 결이 생긴다. 격자점 절대 좌표의 연속 노이즈라 이음매 없음.
      if (disp) {
        const au2 = gi + S.cx0, av2 = gj + S.cy0;
        c.x += (vn(au2 * 2.1, av2 * 2.1, 79) - 0.5) * Math.min(1, hh / 1.6) * DAMP * 26;
      }
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
      let lam = Math.max(0.14, lamD) + Math.max(0, -lamD) * 0.20;
      // ★[재민 판정] "상면 셀 체커 무늬" — 면마다 법선을 하나씩 쓰면 다이아 격자가 그대로 뜬다.
      //   셀 중심의 **넓은 스텐실 법선**과 섞어 계단을 지운다(세분 4배 비용 없이 같은 효과).
      if (lamW != null) lam = lam * 0.52 + lamW * 0.48;
      const hAvg = (hNW + hNE + hSE + hSW) / 4;
      const steep = 1 - nz;
      const water = S.CELLS[j] && S.CELLS[j][i] === 1;
      const pts = inflate([A, B, C2, D]);

      if (MAT === 'A') {
        // (A) 는 팔레트만 쓴다 — 아래 matOf 와 무관
        // ── (A) PEAK 식 — 제한 팔레트 + 계단 음영 ────────────────────────────
        const t = Math.max(0, Math.min(0.999, (hAvg / HM) * 0.75 + steep * 0.55 + macro * 0.10));
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
      const mt = matOf(steep, hAvg, HM, water, macro);
      if (opt && opt.IDMAP) {   // 진단용 — 재질을 단색으로. 무엇이 어디에 깔렸는지 눈으로 본다.
        const IDC = { water: '#2a5f8f', rock: '#e03030', crag: '#e0a020', scree: '#30b050', slope: '#3050e0', foot: '#b040c0' };
        g.fillStyle = IDC[mt] || '#fff'; poly(g, pts); g.fill(); continue;
      }
      const MM = (opt && opt.PAL) ? matsFor(opt.PAL) : MATS;
      const pat = TEX[MM[mt].tex], tint = MM[mt].tint;
      // ★자락 치마(SKIRT) — 높이가 0 에 가까운 셀은 음영을 **평지(배율 1.0)로 수렴**시킨다.
      //   ⑥ 톱니가 눈에 띄는 진짜 이유는 실루엣이 아니라 **자락 셀의 어두운 쐐기**다:
      //   가장자리 셀은 0→1.5칸을 한 셀에 올라 기울기가 가장 급해 제일 어둡게 칠해진다.
      //   기하는 그대로 두고 **음영만** 지면으로 녹이면 톱니가 안 읽힌다.
      const SK = opt && opt.SKIRT ? opt.SKIRT : 0;
      const skirt = SK > 0 ? Math.min(1, hAvg / SK) : 1;
      // ★[재민 판정] "한 장을 크게 늘여 바르니 대리석/시멘트처럼 뭉개진다"
      //   ⇒ 디테일 텍스처는 **1~2셀 주기로 잘게**. 512×256 타일이 8×8셀이므로 0.22 배면
      //     약 2.8셀 주기가 된다(0.22=1.8셀은 너무 잘아 회색 잡음으로 보였다 — 실측).
      //     큰 변화는 위의 매크로 밴드가 맡는다(2스케일).
      pat.setTransform(new DOMMatrix().translate(0, -Math.round(hAvg * CELL)).scale(0.35, 0.35));
      if (opt && opt.FLATTEX) {                  // 질감 끔 — 계측 반례용(같은 기하, 평탄색)
        g.fillStyle = mt === 'foot' ? '#5a7040' : '#5b5b5b'; poly(g, pts); g.fill();
      } else { g.fillStyle = pat; poly(g, pts); g.fill(); }
      if (tint) { g.fillStyle = tint; poly(g, pts); g.fill(); }
      const kRaw = (AMB + DIR * lam) / K_FLAT;
      shadeFill(g, pts, 1 + (kRaw - 1) * skirt, hAvg, HM, conc * skirt,
                bandOf(hAvg, steep) * skirt, contact * skirt);
    }
  }

  return { MATS, matsFor, PALETTES, matOf, CELL, PPU_SCR, w2i, hash, vn, makeField, bakeBands, drawQuad, L, LAM_FLAT, K_FLAT, PAL_A };
})();
