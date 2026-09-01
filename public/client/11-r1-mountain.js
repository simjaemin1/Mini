// @@split:11-r1-mountain — R1 지형렌더 — 산 GL·컷·페이드
  function _mt3GlInit() {
    if (_mgl.ok !== null) return _mgl.ok;
    try {
      if (typeof document === 'undefined') throw new Error('document 없음');
      // ★캔버스는 **작게 시작해 필요한 만큼만 키운다.** 2D 로 넘길 때(drawImage) 구현에 따라
      //   원본 **표면 전체**를 스냅샷하므로, 띠 하나(≈600×400)를 그리려고 1024×1024 를 들고 있으면
      //   띠마다 그 차액을 그대로 복사한다. 띠는 261개다 — 낭비가 261배로 곱해진다.
      const cv = document.createElement('canvas'); cv.width = cv.height = MT3_CV0;
      // ★★antialias 는 **꺼야 한다.** 띠 하나 = 반대각선 하나라 한 띠 안의 셀들은 서로 안 닿고,
      //   **모든 셀 변이 띠 경계**다. MSAA 를 켜면 그 변마다 알파가 0.5 로 깎여, 두 띠를
      //   source-over 로 겹쳐도 1 이 안 된다(0.5 + 0.5·0.5 = 0.75) → 셀 격자 그대로 **어두운 그물**.
      //   끄면 픽셀 중심이 어느 한쪽 삼각형에만 들어가 틈도 겹침도 없다.
      const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false });
      if (!gl) throw new Error('webgl 없음');
      const mk = (t, src) => { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      const pr = gl.createProgram();
      gl.attachShader(pr, mk(gl.VERTEX_SHADER, MT3_VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, MT3_FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      _mgl.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, _mgl.vbo);
      _mgl.lp = gl.getAttribLocation(pr, 'p'); _mgl.lc = gl.getAttribLocation(pr, 'c');
      _mgl.lm = gl.getAttribLocation(pr, 'm'); _mgl.lh = gl.getAttribLocation(pr, 'hh');
      gl.enableVertexAttribArray(_mgl.lp); gl.vertexAttribPointer(_mgl.lp, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(_mgl.lc); gl.vertexAttribPointer(_mgl.lc, 2, gl.FLOAT, false, 24, 8);
      gl.enableVertexAttribArray(_mgl.lm); gl.vertexAttribPointer(_mgl.lm, 1, gl.FLOAT, false, 24, 16);
      gl.enableVertexAttribArray(_mgl.lh); gl.vertexAttribPointer(_mgl.lh, 1, gl.FLOAT, false, 24, 20);
      for (const u of ['uRes', 'uH', 'uRock', 'uGrass', 'uN', 'uHmax', 'uL', 'uOrig', 'uTex', 'uRockS', 'uTexOn', 'uAoOn', 'uAoBox', 'uFringe', 'uFrH',
                       'uCut', 'uCutSide', 'uCutBase', 'uDbgW', 'uCutK'])
        _mgl.uni[u] = gl.getUniformLocation(pr, u);
      const mkTex = (filt, wrap, minf) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minf || filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        return t; };
      _mgl.hTex = mkTex(gl.NEAREST, gl.CLAMP_TO_EDGE);
      // ★★[격자 3층 원인 — 계측으로 특정 2026-08-19] 사면을 지배하던 7~9px 무늬의 정체.
      //   바위 질감을 uRockS=0.35 로 **2.86배 축소** 표본화하면서 밉맵을 안 만들었다.
      //   축소인데 필터가 LINEAR 뿐이면 화소마다 텍셀 2.86개를 **한 점만 찍어** 읽는다 —
      //   전형적인 에일리어싱이고, 화면 격자와 결이 맞물려 규칙적인 모아레가 선다.
      //   손잡이 실측: 질감을 끄면 배수 58.6→11.8(진폭 1.14→0.16계조), 배율을 1.0 으로
      //   올리면(축소 없음) 58.6→28.9 — 봉우리가 **배율을 따라 움직였다.** AO 는 무관(58.6→58.6).
      //   ⇒ 밉맵을 만들고 MIN 필터를 LINEAR_MIPMAP_LINEAR 로. 512×256 이라 2의 거듭제곱 조건도 만족한다.
      _mgl.rTex = mkTex(gl.LINEAR, gl.REPEAT, gl.LINEAR_MIPMAP_LINEAR);
      _mgl.gTex = mkTex(gl.LINEAR, gl.REPEAT, gl.LINEAR_MIPMAP_LINEAR);
      const pot = (n) => n > 0 && (n & (n - 1)) === 0;
      const up = (tex, im) => {
        if (!im || !im.naturalWidth) throw new Error('텍스처 미로드');
        // WebGL1 은 2의 거듭제곱이 아니면 REPEAT 를 못 쓴다. 512×256 이라 통과하지만, 바뀌면 여기서 폴백된다.
        if (!pot(im.naturalWidth) || !pot(im.naturalHeight)) throw new Error('텍스처가 2의 거듭제곱이 아니다 — REPEAT 불가');
        gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.generateMipmap(gl.TEXTURE_2D); };
      up(_mgl.rTex, GTEX.rock_angled); up(_mgl.gTex, GTEX.grass_angled);
      gl.uniform1i(_mgl.uni.uH, 0); gl.uniform1i(_mgl.uni.uRock, 1); gl.uniform1i(_mgl.uni.uGrass, 2);
      gl.uniform1f(_mgl.uni.uN, MT3_HTEX); gl.uniform1f(_mgl.uni.uHmax, MT3_HMAX);
      gl.uniform3f(_mgl.uni.uL, MT3_L[0], MT3_L[1], MT3_L[2]);
      gl.uniform2f(_mgl.uni.uTex, MT3_TW, MT3_TH); gl.uniform1f(_mgl.uni.uRockS, MT3_ROCKS);
      gl.uniform1f(_mgl.uni.uTexOn, MT3_TEXON); gl.uniform1f(_mgl.uni.uAoOn, MT3_AOON);
      gl.uniform1f(_mgl.uni.uAoBox, MT3_AOBOX);
    gl.uniform1f(_mgl.uni.uFringe, MT3_FRINGE); gl.uniform1f(_mgl.uni.uFrH, MT3_FR_H);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, _mgl.rTex);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, _mgl.gTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      _mgl.cv = cv; _mgl.gl = gl; _mgl.pr = pr; _mgl.ok = true;
      console.log('[mt3d] WebGL 산 메쉬 준비');
    } catch (e) { console.warn('[mt3d] WebGL 불가 — 캔버스 폴리곤 경로 유지:', e && e.message); _mgl.ok = false; }
    return _mgl.ok;
  }
  // 청크 높이장을 16비트(RG) 텍스처로 올린다. 같은 청크를 연달아 구우면 재업로드를 건너뛴다.
  function _mt3GlUploadH(F, key) {
    if (_mgl.hKey === key) return;
    const gl = _mgl.gl, N = MT3_HTEX;
    const buf = new Uint8Array(N * N * 4);
    const raw = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
      raw[j * N + i] = (i <= F.N && j <= F.N) ? F.cor(i, j) : 0;
    // B 채널 = 3×3 텐트로 흐린 높이. 셰이더의 AO 가 이걸 **같은 바이큐빅**으로 읽는다.
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let sum = 0, w = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const wt = (a ? 1 : 2) * (b ? 1 : 2);
        sum += raw[jj * N + ii] * wt; w += wt;
      }
      const h = raw[j * N + i];
      const v = Math.max(0, Math.min(1, h / MT3_HMAX)) * 255;
      const hi = Math.floor(v), lo = Math.round((v - hi) * 255);
      const k = (j * N + i) * 4;
      buf[k] = hi; buf[k + 1] = lo;
      buf[k + 2] = Math.round(Math.max(0, Math.min(1, (w ? sum / w : h) / MT3_HMAX)) * 255);
      buf[k + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, _mgl.hTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    _mgl.hKey = key;
  }
  // ── 띠 하나를 GPU 로 그려 띠 캔버스에 붙인다 ──────────────────────────────
  //   cells = 이 띠(반대각선)에 속한 청크-지역 셀 [i,j] 목록.
  //   꼭짓점 높이는 셰이더의 hAll 과 **같은 Catmull-Rom**(F.corS)로 뽑는다 —
  //   실루엣(꼭짓점)과 음영(프래그먼트)이 같은 곡면을 봐야 가장자리가 안 어긋난다.
  // cut = null(안 자름) · { c, side } · side 2 = 가리개 · { dbgW } 판정기 · { rows, cols } 그 사각형만
  //     · { cache } 꼭짓점 재사용 · { op } 2D 합성 방식
  function _mt3GlBand(g2d, F, key, cells, cuts, x0, y0, bw, bh, clip, cut) {
    const gl = _mgl.gl;
    if (bw > _mgl.cv.width || bh > _mgl.cv.height) {
      if (bw > 4096 || bh > 4096) return false;
      // 128 배수로 올림해 **서로 다른 크기 수를 줄인다**(리사이즈는 GL 표면 재생성이라 비싸다).
      const q = (v) => Math.min(4096, Math.ceil(v / 128) * 128);
      _mgl.cv.width = Math.max(_mgl.cv.width, q(bw)); _mgl.cv.height = Math.max(_mgl.cv.height, q(bh));
    }
    // ★★띠 경계의 **점선 틈**을 없앤다. 스냅(1/64px)까지 해도 뷰포트 변환이 float32 라
    //   공유 변이 ~1e-4px 어긋나고, 그 확률로 어느 띠에도 안 잡히는 픽셀이 산발한다(실측: 점선).
    //   ⇒ 셀의 매개변수 영역을 바깥으로 MT3_OV 셀만큼 **넓혀 겹친다**.
    //   겹쳐도 안 보이는 이유가 이 판의 핵심이다: **프래그먼트 색이 월드 좌표만의 함수**라
    //   겹친 자리를 두 띠가 **같은 색**으로 칠한다(옛 캔버스 판은 조각마다 색이 달라 그물이 됐다).
    // ★★기하는 **정적**이다. 가리개를 프레임마다 만들려면 여기서 꼭짓점을 다시 짜면 안 된다 —
    //   셀마다 corS 를 49회 부르고 잡음까지 얹는다. cut.cache 가 오면 한 번 짜서 들고 쓴다.
    const CA = cut && cut.cache;
    if (CA && CA.V) {
      _mt3BandD = [CA.dLo, CA.dHi, CA.sLo, CA.sHi, CA.hHi];
      return _mt3GlDraw(g2d, F, key, CA.V, CA.n, x0, y0, bw, bh, clip, cut);
    }
    const sub = MT3_GSUB, S = sub + 1, OV = MT3_OV, SP = (1 + 2 * OV) / sub;
    // ★치마 쿼드(셀당 최대 2장)까지 넣어 잡는다 — 모자라면 타입드배열이 **조용히** 버려 구멍이 다시 생긴다
    const need = (cells.length * (sub * sub + 2) + (cuts ? cuts.length * 6 : 0)) * 6 * 6;
    if (!_mgl.buf || _mgl.buf.length < need) _mgl.buf = new Float32Array(Math.max(need, 8192));
    const V = _mgl.buf; let n = 0;
    // ★띠의 **지면 깊이 범위**(sLo/sHi)와 깊이 범위(dLo/dHi), 높이 상한(hHi)을 정점에서 모은다.
    //   삼각형 안의 값은 꼭짓점 값의 선형 보간이라 이 min/max 를 못 벗어난다 ⇒ 3분류의 근거.
    let dLo = Infinity, dHi = -Infinity, sLo = Infinity, sHi = -Infinity, hHi = 0;
    const dAcc = (pyv, hv) => { const d = pyv + y0 + 64 * hv; if (d < dLo) dLo = d; if (d > dHi) dHi = d;
      const sv = pyv + y0 + 32 * hv; if (sv < sLo) sLo = sv; if (sv > sHi) sHi = sv;
      if (hv > hHi) hHi = hv; };
    const px = new Float32Array(S * S), py = new Float32Array(S * S), ph = new Float32Array(S * S);
    for (const cell of cells) {
      const i = cell[0], j = cell[1];
      for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) {
        const ci = i - OV + a * SP, cj = j - OV + b * SP;
        let wxp = (F.i0 + ci) * 32, wyp = (F.j0 + cj) * 32;
        // ── ⑤ 자락 톱니 시안 1 — **경계선만 국소 잡음으로 흔든다**(셀 다이아 정렬 깨기) ──
        //   ★가중치를 '자락 셀이냐'가 아니라 **높이의 함수**로 잡는다. 그래야 이웃 띠·이웃 청크와
        //     공유하는 꼭짓점이 **같은 값**을 얻어 틈이 안 생긴다(셀 종류로 가르면 경계에 균열).
        //   ★가로만 민다 — 높이는 그대로라 **마루 실루엣은 손대지 않는다**(회귀 이력).
        if (MT3_FRINGE === 1) {
          const hv = F.corS(ci, cj);
          const wgt = Math.max(0, 1 - hv / MT3_FR_H);
          if (wgt > 0) {
            const d = wgt * 26;
            wxp += (_mt3vn(wxp / 96, wyp / 96, 191) - 0.5) * 2 * d;
            wyp += (_mt3vn(wxp / 51, wyp / 51, 193) - 0.5) * 2 * d;
          }
        }
        // ★절대 화면 좌표를 **1/64px 격자에 스냅**한 뒤 띠 원점을 뺀다.
        //   x0·y0 은 정수라 뺄셈이 정확하고, float32 로 내려도 이웃 띠가 **같은 변**을 얻는다.
        //   (스냅을 안 하면 띠마다 반올림이 달라져 공유 변에 1px 틈이 산발한다.)
        const hv = F.corS(ci, cj);
        px[b * S + a] = Math.round((wxp - wyp) * 64) / 64 - x0;
        py[b * S + a] = Math.round(((wxp + wyp) * 0.5 - hv * 32) * 64) / 64 - y0;
        ph[b * S + a] = hv;
        dAcc(py[b * S + a], hv);
      }
      for (let b = 0; b < sub; b++) for (let a = 0; a < sub; a++) {
        const k00 = b * S + a, k10 = k00 + 1, k01 = k00 + S, k11 = k01 + 1;
        const u0 = i - OV + a * SP, u1 = i - OV + (a + 1) * SP,
              v0 = j - OV + b * SP, v1 = j - OV + (b + 1) * SP;
        const put = (kk, cu, cv2) => { V[n] = px[kk]; V[n + 1] = py[kk]; V[n + 2] = cu; V[n + 3] = cv2;
                                       V[n + 4] = 0; V[n + 5] = ph[kk]; n += 6; };
        put(k00, u0, v0); put(k10, u1, v0); put(k11, u1, v1);
        put(k00, u0, v0); put(k11, u1, v1); put(k01, u0, v1);
      }
    }
    // ── 갱 기하 — 파낸 셀의 바닥과 옆면 ──────────────────────────────────
    //   옆면은 파낸 셀과 **안 파낸 바위 셀**이 맞닿는 변마다. 바깥(비바위)으로 난 변은
    //   통로 입구라 벽을 안 세운다. 벽 높이는 **원본 높이장의 모서리 값**이라
    //   이웃 표면의 가장자리와 정확히 맞물린다.
    const SP2 = (v) => Math.round(v * 64) / 64;
    // ★세 번째 성분에 **그 꼭짓점을 놓은 높이**를 같이 싣는다 — 절단식이 화면y 와 h 를
    //   같은 자리에서 읽어야 항등식이 성립한다(따로 구하면 사본이 되고 어긋난다).
    const scr = (ci, cj, hh) => {
      const wxp = (F.i0 + ci) * 32, wyp = (F.j0 + cj) * 32;
      const yy = SP2((wxp + wyp) * 0.5 - hh * 32) - y0;
      dAcc(yy, hh);
      return [SP2(wxp - wyp) - x0, yy, hh];
    };
    const tri = (a, b, c2, ca, cb, cc, mode) => {
      for (const [q, cq] of [[a, ca], [b, cb], [c2, cc]]) {
        V[n] = q[0]; V[n + 1] = q[1]; V[n + 2] = cq[0]; V[n + 3] = cq[1];
        V[n + 4] = mode; V[n + 5] = q[2]; n += 6;
      }
    };
    // 한 변에 벽 한 장 — 갱 옆면과 치마가 **같은 식**을 쓴다(사본 금지)
    const wall = (A, B, mode, along) => {
      const hA = F.corS(A[0], A[1]), hB = F.corS(B[0], B[1]);
      if (hA < 0.3 && hB < 0.3) return false;
      const aT = scr(A[0], A[1], hA), bT = scr(B[0], B[1], hB);
      const aF = scr(A[0], A[1], 0), bF = scr(B[0], B[1], 0);
      const sA = along ? (F.j0 + A[1]) : (F.i0 + A[0]);
      const sB = along ? (F.j0 + B[1]) : (F.i0 + B[0]);
      tri(aF, bF, bT, [sA, 0], [sB, 0], [sB, hB], mode);
      tri(aF, bT, aT, [sA, 0], [sB, hB], [sA, hA], mode);
      return true;
    };
    if (cuts && cuts.length) {
      for (const [i, j] of cuts) {
        // 바닥 — 지면 높이
        const f00 = scr(i, j, 0), f10 = scr(i + 1, j, 0), f11 = scr(i + 1, j + 1, 0), f01 = scr(i, j + 1, 0);
        const c00 = [F.i0 + i, F.j0 + j], c10 = [F.i0 + i + 1, F.j0 + j];
        const c11 = [F.i0 + i + 1, F.j0 + j + 1], c01 = [F.i0 + i, F.j0 + j + 1];
        tri(f00, f10, f11, c00, c10, c11, 5); tri(f00, f11, f01, c00, c11, c01, 5);
        // 옆면 4방 — [이웃 offset, 변의 두 모서리(로컬), 법선 모드]
        const sides = [
          [[-1, 0], [i, j], [i, j + 1], 1],          // 서쪽 이웃의 안쪽 면 → 법선 +x
          [[1, 0], [i + 1, j], [i + 1, j + 1], 2],   // 동쪽 → 법선 −x
          [[0, -1], [i, j], [i + 1, j], 3],          // 북쪽 → 법선 +y
          [[0, 1], [i, j + 1], [i + 1, j + 1], 4],   // 남쪽 → 법선 −y
        ];
        for (const [off, A, B, mode] of sides) {
          const ni = i + off[0], nj = j + off[1];
          if (!F.isRock(ni, nj) || F.isCut(ni, nj)) continue;   // 입구이거나 통로가 이어진다
          wall(A, B, mode, off[1] === 0);
        }
      }
    }
    // ── 치마(skirt) — 메시 **테두리**의 카메라 쪽 변에만 밑까지 벽을 세운다 ────────
    //   ★실측 근거(2026-08-24): 안정된 화면의 **13.6%가 지면색 정확 일치**인데, 그 자리를
    //     정본이 그린 사각형이 64~320장 덮고 띠도 4~20장 덮는데 **칠한 띠가 0장**이다
    //     (대조군 산색 점은 전부 1장). 즉 수집·굽기·상자 문제가 아니라 **시트가 그 자리에
    //     닿지 않는다** — 높이장에 밑면이 없어 산자락 너머로 **자기 발밑 지면 타일**이 비친다.
    //     리본의 두께(~100px)가 산자락 마루 높이(≈2.8m=90px)와 맞는다.
    //   ★여백(MT3_MPAD 18→48→96)은 **한 화소도** 안 바꿨다 — 상자 잘림 가설은 기각됐다.
    //   ★왜 +i·+j 두 변만인가: z=(wx+wy)/2 라 화면에서 앞을 향한 면은 +i·+j 쪽뿐이다.
    //   ★★[기각 2026-08-24] **이 가설은 실측에서 떨어졌다.** 안정 후 A/B:
    //     치마 0 → 지면색 28776/211059 · 치마 0.30 → **28776/211059(한 화소도 같다)**.
    //     이유도 같이 나왔다: 시야 안 6963셀 중 카메라 쪽 변이 **비바위와 맞닿은 것은 139개뿐**
    //     (13926 중 1%)이다. 즉 보이는 산괴는 거의 통짜라 **깎아 낼 테두리 자체가 없다.**
    //   ★그래도 코드를 남긴다 — 반례 장치다. 기본 0(끔), `__mt3skirt` 로 언제든 되켠다.
    //     지우면 다음 사람이 같은 가설을 처음부터 다시 세운다.
    if (MT3_SKIRT > 0) {
      for (const [i, j] of cells) {
        _mt3SkirtAll += 2;
        if (!F.isRock(i + 1, j) && wall([i + 1, j], [i + 1, j + 1], 2, true)) _mt3SkirtQ++;
        if (!F.isRock(i, j + 1) && wall([i, j + 1], [i + 1, j + 1], 4, false)) _mt3SkirtQ++;
      }
    }
    if (n === 0) { _mt3BandD = null; return false; }
    _mt3BandD = [dLo, dHi, sLo, sHi, hHi];
    if (CA) { CA.V = V.slice(0, n); CA.n = n; CA.dLo = dLo; CA.dHi = dHi; CA.sLo = sLo; CA.sHi = sHi; CA.hHi = hHi;
              return _mt3GlDraw(g2d, F, key, CA.V, CA.n, x0, y0, bw, bh, clip, cut); }
    return _mt3GlDraw(g2d, F, key, V, n, x0, y0, bw, bh, clip, cut);
  }
  // GL 로 한 판 그리고 2D 로 옮긴다 — 꼭짓점은 위에서 짜 왔거나 캐시에서 온다
  function _mt3GlDraw(g2d, F, key, V, n, x0, y0, bw, bh, clip, cut) {
    const gl = _mgl.gl;
    _mt3GlUploadH(F, key);
    const H = _mgl.cv.height;
    gl.bindBuffer(gl.ARRAY_BUFFER, _mgl.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, V.length === n ? V : V.subarray(0, n), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(_mgl.lp, 2, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(_mgl.lc, 2, gl.FLOAT, false, 24, 8);
    gl.vertexAttribPointer(_mgl.lm, 1, gl.FLOAT, false, 24, 16);
    gl.vertexAttribPointer(_mgl.lh, 1, gl.FLOAT, false, 24, 20);
    gl.uniform2f(_mgl.uni.uRes, bw, bh);
    gl.uniform2f(_mgl.uni.uOrig, F.i0, F.j0);
    gl.uniform1f(_mgl.uni.uTexOn, MT3_TEXON); gl.uniform1f(_mgl.uni.uAoOn, MT3_AOON);
    gl.uniform1f(_mgl.uni.uAoBox, MT3_AOBOX);
    gl.uniform1f(_mgl.uni.uFringe, MT3_FRINGE); gl.uniform1f(_mgl.uni.uFrH, MT3_FR_H);
    gl.uniform1f(_mgl.uni.uRockS, MT3_ROCKS);
    // ★★큰 수 뺄셈은 **CPU 에서 배정도로** 끝낸다(y0 가 29만대라 float32 ULP 0.031px).
    const cRef = cut && cut.c != null ? cut.c : 0;
    gl.uniform1f(_mgl.uni.uCutBase, (y0 + bh) - cRef);
    gl.uniform1f(_mgl.uni.uCut, 0);
    gl.uniform1f(_mgl.uni.uCutK, MT_FADE_PLANE ? 64 : 32);
    gl.uniform1f(_mgl.uni.uCutSide, cut && cut.side ? cut.side : 0);
    gl.uniform1f(_mgl.uni.uDbgW, cut && cut.dbgW ? cut.dbgW : 0);
    // ★★뷰포트를 캔버스 **왼쪽 아래(0,0)** 에 고정한다. (0, H−bh) 로 두면 공유 캔버스가 커질 때
    //   원점이 바뀌고 창 좌표에 큰 상수가 더해져 float32 하위 비트가 흔들려 **변 위 화소가
    //   덮임을 뒤집는다**(구운 판 vs 되그린 판 12화소 차).
    gl.viewport(0, 0, bw, bh);
    const rw = cut && cut.rows, ry0 = rw ? Math.max(0, rw[0]) : 0, ry1 = rw ? Math.min(bh, rw[1]) : bh;
    const cwv = cut && cut.cols, rx0 = cwv ? Math.max(0, cwv[0]) : 0, rx1 = cwv ? Math.min(bw, cwv[1]) : bw;
    if (ry1 <= ry0 || rx1 <= rx0) return false;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(rx0, bh - ry1, rx1 - rx0, ry1 - ry0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const _p1 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, n / 6);
    gl.disable(gl.SCISSOR_TEST);
    const _p2 = performance.now();
    // ★같은 태스크 안에서 곧바로 읽는다(preserveDrawingBuffer 없이 안전한 유일한 시점).
    // ★clip 이 오면 그 사각형만 옮긴다 — 병합 판이 **띠마다** 같은 캔버스에 얹을 때 쓴다.
    //   전체를 옮기면 앞 띠가 지워지는 게 아니라(투명은 안 덮는다) 비용만 는다.
    const sy0 = H - bh;                    // 뷰포트가 캔버스 아래쪽이라 원본을 그만큼 내려 잡는다
    // ★★가리개는 **drawImage 로 옮기지 않는다.** GL 캔버스를 2D 로 drawImage 하면 구현이
    //   **표면 전체**를 스냅샷한다 — 1152×1280 을 매번 떠서 호출당 15.3ms 였다(실측 프로파일).
    //   readPixels 는 **읽는 사각형**에만 비례한다. 행 순서만 뒤집어 준다.
    if (rw) {
      const cw2 = rx1 - rx0, ch2 = ry1 - ry0, need2 = cw2 * ch2 * 4;
      if (!_mgl.rb || _mgl.rb.length < need2) _mgl.rb = new Uint8Array(need2);
      gl.readPixels(rx0, bh - ry1, cw2, ch2, gl.RGBA, gl.UNSIGNED_BYTE, _mgl.rb);
      if (!_mgl.id || _mgl.id.width !== cw2 || _mgl.id.height !== ch2) _mgl.id = g2d.createImageData(cw2, ch2);
      const D = _mgl.id.data, RB = _mgl.rb, rw4 = cw2 * 4;
      for (let r = 0; r < ch2; r++) D.set(RB.subarray((ch2 - 1 - r) * rw4, (ch2 - r) * rw4), r * rw4);
      g2d.putImageData(_mgl.id, rx0, ry0);     // putImageData 는 **덮어쓴다** — 지우기도 겸한다
      _mtP.draw += _p2 - _p1; _mtP.blit += performance.now() - _p2; _mtP.n++;
      _mtP.tri += n / 18; _mtP.cvpx += cw2 * ch2;
    } else {
      const op0 = g2d.globalCompositeOperation;
      if (cut && cut.op) g2d.globalCompositeOperation = cut.op;
      if (clip) { const [cx, cy, cw, ch] = clip; if (cw > 0 && ch > 0) g2d.drawImage(_mgl.cv, cx, cy + sy0, cw, ch, cx, cy, cw, ch); }
      else g2d.drawImage(_mgl.cv, 0, sy0, bw, bh, 0, 0, bw, bh);
      if (cut && cut.op) g2d.globalCompositeOperation = op0;
    }
    return true;
  }
  // 시험 손잡이 — 짝 비교 프로파일러/스크린샷이 GPU 판과 캔버스 판을 같은 자리에서 갈아 끼운다
  window.__mt3gl = (v) => { MT3_GL = v ? 1 : 0; _mt3Chunk.clear(); _mt3Sig = ''; return MT3_GL; };
  window.__mt3tent = (v) => { MT3_TENT = v | 0; _mt3Chunk.clear(); _mt3Sig = ''; return MT3_TENT; };
  window.__mt3sub  = (v) => { MT3_GSUB = Math.max(1, v | 0); _mt3Chunk.clear(); _mt3Sig = ''; return MT3_GSUB; };
  // 시험 손잡이 — GL 캔버스를 강제로 n×n 으로 잡는다. "굽기 비용이 캔버스 넓이에 비례하나"의 대조군.
  // 지금 GL 캔버스 실제 크기 — 계측기가 명목값 대신 이걸로 넓이를 잡는다
  window.__mt3glcv = () => (_mgl.cv ? [_mgl.cv.width, _mgl.cv.height] : [0, 0]);
  // 시험 손잡이 — 높이 규약과 띠 여백. 같은 자리에서 갈아 끼워 원인을 가른다.
  window.__mt3h = (hm, lm) => { MT3_HMAX = hm; if (lm) MT3_LAM = lm;
    if (_mgl.gl) { _mgl.gl.useProgram(_mgl.pr); _mgl.gl.uniform1f(_mgl.uni.uHmax, MT3_HMAX); }
    _mgl.hKey = ''; _mt3Chunk.clear(); _mt3Sig = ''; return [MT3_HMAX, MT3_LAM]; };
  window.__mt3mpad = (v) => { MT3_MPAD = v | 0; _mt3Chunk.clear(); _mt3Sig = ''; return MT3_MPAD; };
  window.__mt3trees = (p, px) => { MT3_TREEP = +p; if (px) MT3_TREEPX = +px;
    _mt3Chunk.clear(); _mt3Sig = ''; return [MT3_TREEP, MT3_TREEPX]; };
  window.__mt3macro = (a, b) => { MT3_MACRO = +a; if (b != null) MT3_MACROH = +b;
    _mt3Chunk.clear(); _mt3Sig = ''; return [MT3_MACRO, MT3_MACROH]; };
  window.__mt3tex = (v) => { MT3_TEXON = v ? 1 : 0; _mt3Chunk.clear(); _mt3Sig = ''; return MT3_TEXON; };
  window.__mt3ao = (v) => { MT3_AOON = v ? 1 : 0; _mt3Chunk.clear(); _mt3Sig = ''; return MT3_AOON; };
  // 반례 손잡이 — 옛 AO(조각별 상수)로 되돌린다. 고친 게 정말 그거였는지 같은 판에서 보인다.
  window.__mt3aobox = (v) => { MT3_AOBOX = v ? 1 : 0; _mt3Chunk.clear(); _mt3Sig = ''; return MT3_AOBOX; };
  // 치마 A/B 손잡이 — 같은 자리에서 갈아 끼워야 '치마가 닫았다'가 증명된다
  // ④ 병합 손잡이 — 기본 0(끔). 켜고 끈 **같은 자리 화소**가 판정이다.
  // ⑤ 자락 톱니 손잡이 — 0=현행(기본) · 1=경계선 잡음 · 2=알파 페더
  window.__mt3fringe = (v) => { MT3_FRINGE = v | 0;
    if (_mgl.gl) { _mgl.gl.useProgram(_mgl.pr); _mgl.gl.uniform1f(_mgl.uni.uFringe, MT3_FRINGE); }
    _mt3Chunk.clear(); _mt3Sig = ''; needsRedraw = true; return MT3_FRINGE; };
  window.__mt3mergez = (v) => { MT3_MERGEZ = v ? 1 : 0; _mt3Chunk.clear(); _mt3Sig = ''; return MT3_MERGEZ; };
  window.__mt3merge = (v) => { MT3_MERGE = v ? 1 : 0; _mt3Chunk.clear(); _mt3Sig = '';
    _mt3MergedN = 0; _mt3BandN = 0; return MT3_MERGE; };
  window.__mt3mergeN = () => ({ merge: MT3_MERGE, mergedChunks: _mt3MergedN, bands: _mt3BandN });
  window.__mt3skirt = (v) => { MT3_SKIRT = +v; _mt3Chunk.clear(); _mt3Sig = '';
    _mt3SkirtQ = 0; _mt3SkirtAll = 0; return MT3_SKIRT; };
  window.__mt3skirtN = () => ({ skirt: MT3_SKIRT, quads: _mt3SkirtQ, blanket: _mt3SkirtAll,
    save: _mt3SkirtAll ? +(100 - _mt3SkirtQ / _mt3SkirtAll * 100).toFixed(1) : null });
  // 수집 창 손잡이 — "띠가 덮는데 안 칠한다"가 **수집 범위** 때문인지 가르는 반례 장치.
  //   창을 넓혀 리본이 닫히면 원인은 기하가 아니라 수집이다.
  window.__mt3view = (v) => { MT3_VIEW = +v; _mt3Chunk.clear(); _mt3Sig = ''; needsRedraw = true; return MT3_VIEW; };
  window.__mt3htop = (v) => { MT3_HTOP = +v; _mt3Chunk.clear(); _mt3Sig = ''; needsRedraw = true; return MT3_HTOP; };
  // 거리장 여유 손잡이 — 청크마다 dE 를 자기 창(40×40)에서만 푸는데, 산 깊은 곳은
  //   창 안에 비바위가 없어 dE=INF 가 된다. 이웃 청크의 창에 비바위가 걸리면 같은 셀을
  //   **다른 높이**로 푼다 — 청크 경계에 단차가 생긴다는 가설의 반례 장치.
  window.__mt3dcap = (v) => { MT3_DCAP = +v; _mt3Chunk.clear(); _mt3Sig = ''; needsRedraw = true; return MT3_DCAP; };
// @@moved:3420
  window.__mt3pad = (v) => { MT3_PAD = v | 0; _mt3Chunk.clear(); _mt3Sig = ''; needsRedraw = true; return MT3_PAD; };
  window.__mt3rocks = (v) => { MT3_ROCKS = +v; _mt3Chunk.clear(); _mt3Sig = ''; return MT3_ROCKS; };
  window.__mt3cv = (n) => { MT3_CV0 = n | 0; if (_mgl.cv) { _mgl.cv.width = _mgl.cv.height = MT3_CV0; }
    _mt3Chunk.clear(); _mt3Sig = ''; return MT3_CV0; };
  // ── 청크 하나를 **반대각선 띠**로 구워 세그먼트 배열로 ────────────────────
  let _mt3BakeMs = 0, _mt3BakeN = 0;             // 굽기 비용 — 짝 비교 프로파일러의 정본 계측기
  function _mt3Bake(zid, gx, gy) {
    const key = zid + '_' + gx + '_' + gy;
    const hit = _mt3Chunk.get(key); if (hit) return hit;
    if (_mt3Budget <= 0) return null;              // ★예산 소진 — 이번 프레임엔 안 굽는다
    _mt3Budget--;
    const _bt0 = performance.now();
    const F = _mt3Field(zid, gx, gy);
    const segs = [];
    if (F) {
      const P = MT3_PAD;
      // 이 청크가 그리는 셀 = 자기 몫 8×8 중 **메시 셀**(바위 ∪ 바위에 8-인접).
      //   나눗셈으로 소유를 정하므로 중복도 누락도 구조적으로 불가능하다.
      const mesh = [], cuts = [];
      for (let b = 0; b < MT3_CH; b++) for (let a = 0; a < MT3_CH; a++) {
        const i = P + a, j = P + b;
        const m = _mt3IsMesh(F, i, j);
        // ★파낸 셀은 **안 그린다**. 낮춰 그리면 옆벽까지 끌려 내려가 도랑이 된다 —
        //   도려내면 이웃 셀의 표면이 제 높이로 서고, 그 사이로 바닥이 보인다(협곡).
        if (!m) continue;
        // 파낸 셀은 표면이 아니라 **갱**으로 그린다(바닥 + 옆면). 목록을 갈라 둔다.
        if (F.isCut(i, j)) cuts.push([i, j]); else mesh.push([i, j]);
      }
      const byK = new Map(), cutK = new Map();
      // ── ④ 띠 병합(시제품, 기본 끔) ──────────────────────────────────────
      //   ★근거: 산은 **못 밟는다.** 개체가 띠 **사이**에 낄 수 있는 자리는 통로(cut)와
      //     자락(비바위 메시 셀)뿐이다. 그 둘이 하나도 없는 청크는 **속이 꽉 찬 바위**라
      //     전 띠를 한 장으로 묶어도 개체-띠 정렬 계약이 깨질 여지가 없다.
      //   ★지시문보다 **좁게** 잡았다: '산괴 전체'가 아니라 '자락도 통로도 없는 청크'다.
      //     자락 셀은 걸을 수 있어서 그 위에 선 사람이 병합 z 하나에 눌릴 수 있다.
      //   ★기본은 0(끔) — 재민이 실기기 체감과 함께 정한다.
      const mergeOK = MT3_MERGE && cuts.length === 0 && mesh.length > 0 &&
                      mesh.every(([i, j]) => F.isRock(i, j));
      //   ★★[돌출목 수리 2026-08-25] 처음엔 전 셀을 **한 번의 GL 호출**로 그렸다. 그러면
      //     '전 띠 표면 → 전 나무' 순이 돼 나무가 뒤 띠 표면에 안 가린다(실측 476화소).
      //     ⇒ 띠는 **그대로 나누어** 그리되 **캔버스 하나를 공유**한다:
      //        띠k 표면 blit → 띠k 나무 → 띠k+1 표면 blit → … (안 병합 판과 **같은 순서**)
      //     프레임당 비용은 그대로다(청크당 캔버스 1장을 blit) — 성능 이득은 안 깎인다.
      //     늘어나는 건 **굽는 순간**의 GL 호출 수뿐이고, blit 은 띠 상자로 좁혀 옮긴다.
      if (mergeOK) _mt3MergedN++;
      for (const c of mesh) { const k = c[0] + c[1]; let a = byK.get(k); if (!a) byK.set(k, a = []); a.push(c); }
      for (const c of cuts) { const k = c[0] + c[1]; let a = cutK.get(k); if (!a) cutK.set(k, a = []); a.push(c);
                              if (!byK.has(k)) byK.set(k, []); }
      const pat = (GTEX.rock_angled && GTEX.rock_angled.naturalWidth) ? GTEX.rock_angled : null;
      const gpat = (GTEX.grass_angled && GTEX.grass_angled.naturalWidth) ? GTEX.grass_angled : null;
      // 병합: 전 셀을 덮는 **하나의** 상자·캔버스를 미리 만들어 띠마다 그 위에 얹는다
      let U = null;
      if (mergeOK) {
        let ax0 = 1e9, ax1 = -1e9, ay0 = 1e9, ay1 = -1e9;
        for (const [i, j] of mesh) for (const o of [[0,0],[1,0],[1,1],[0,1]]) {
          const gi = F.i0 + i + o[0], gj = F.j0 + j + o[1];
          const c = w2i(gi * 32, gj * 32), Y = c.y - F.cor(i + o[0], j + o[1]) * 32;
          if (c.x < ax0) ax0 = c.x; if (c.x > ax1) ax1 = c.x; if (Y < ay0) ay0 = Y; if (Y > ay1) ay1 = Y;
        }
        const MP = MT3_MPAD, TP = (MT3_TREEP > 0) ? MT3_TREEPX + 6 : 0;
        const ux0 = Math.floor(ax0) - MP, uy0 = Math.floor(ay0) - MP - TP;
        const ubw = Math.ceil(ax1) + MP - ux0, ubh = Math.ceil(ay1) + MP - uy0;
        if (ubw > 0 && ubh > 0 && ubw <= 4096 && ubh <= 4096) {
          const ucv = document.createElement('canvas'); ucv.width = ubw; ucv.height = ubh;
          U = { x0: ux0, y0: uy0, bw: ubw, bh: ubh, cv: ucv, g: ucv.getContext('2d'),
                colT: new Int16Array(ubw).fill(32767), colB: new Int16Array(ubw).fill(-32768) };
        }
      }
      // 픽셀 절단용 — 세그먼트의 깊이·지면·높이 범위와 **되그릴 재료**(같은 순서로 다시 그린다)
      let bLo = Infinity, bHi = -Infinity, sLo2 = Infinity, sHi2 = -Infinity, hHi2 = 0, glAll = true, recipe = [];
      for (const k of [...byK.keys()].sort((a, b) => a - b)) {
        const cells = byK.get(k), cutCells = cutK.get(k) || [];
        if (!cells.length && !cutCells.length) continue;
        if (!U) { bLo = Infinity; bHi = -Infinity; sLo2 = Infinity; sHi2 = -Infinity; hHi2 = 0; glAll = true; recipe = []; }
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [i, j] of cells) for (const o of [[0,0],[1,0],[1,1],[0,1]]) {
          const gi = F.i0 + i + o[0], gj = F.j0 + j + o[1];
          const c = w2i(gi * 32, gj * 32), Y = c.y - F.cor(i + o[0], j + o[1]) * 32;
          if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        }
        // ★치마가 서는 셀도 **밑(h=0)까지** 걸친다 — 상자를 안 열면 벽이 잘려 다시 구멍이 된다.
        if (MT3_SKIRT > 0) for (const [i, j] of cells) {
          if (F.isRock(i + 1, j) && F.isRock(i, j + 1)) continue;
          if (Math.max(F.corS(i + 1, j), F.corS(i, j + 1), F.corS(i + 1, j + 1)) < 0.3) continue;
          for (const o of [[1, 0], [0, 1], [1, 1]]) {
            const c = w2i((F.i0 + i + o[0]) * 32, (F.j0 + j + o[1]) * 32);
            if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y > y1) y1 = c.y;
          }
        }
        // ★갱은 **바닥(h=0)부터 마루까지** 걸친다 — 상자를 아래로도 열어 줘야 벽면이 안 잘린다.
        for (const [i, j] of cutCells) for (const o of [[0,0],[1,0],[1,1],[0,1]]) {
          const gi = F.i0 + i + o[0], gj = F.j0 + j + o[1];
          const c = w2i(gi * 32, gj * 32);
          const yTop = c.y - F.corS(i + o[0], j + o[1]) * 32, yBot = c.y;
          if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x;
          if (yTop < y0) y0 = yTop; if (yBot > y1) y1 = yBot;
        }
        // ★[재민 "검은 점·선"] bbox 를 **변위 없는** 꼭짓점으로 잡고 있었다.
        //   실제로 그릴 때는 급경사 조각이 세로 ±0.42칸(±13px)·가로 ±11px 로 밀린다.
        //   그만큼이 캔버스 밖으로 잘려 **표면에 검은 슬리버**가 생겼다. 여유를 준다.
        const MPAD = MT3_MPAD;
        // ★돌출목은 표면보다 **위로** 자란다 — 위쪽 여백만 그만큼 더 준다(옆·아래는 그대로).
        const TPAD = (MT3_TREEP > 0) ? MT3_TREEPX + 6 : 0;
        x0 = Math.floor(x0) - MPAD; y0 = Math.floor(y0) - MPAD - TPAD;
        const bw = Math.ceil(x1) + MPAD - x0, bh = Math.ceil(y1) + MPAD - y0;
        if (bw <= 0 || bh <= 0 || bw > 4096 || bh > 4096) { _mt3Skip++; _mt3SkipMax = Math.max(_mt3SkipMax, bh); continue; }
        // 병합이면 이 띠의 상자를 **공유 캔버스 좌표**로 옮겨 blit 범위로만 쓴다
        let clip = null, CV, G, BX0, BY0, BW, BH;
        if (U) {
          // ★상자를 **여유 있게** 잡는다. 띠의 겹침(MT3_OV)과 조각 벌어짐은 상자 밖으로 조금 나가는데,
          //   딱 맞게 자르면 띠 경계마다 1화소가 안 옮겨져 **흩어진 점**이 남는다(실측 140화소).
          //   GL 캔버스에는 **이 띠만** 그려져 있으므로(호출마다 clear) 넓게 옮겨도 남의 그림을 안 옮긴다.
          const CP = MT3_MPAD + 4;
          const cx = Math.max(0, Math.floor(x0 - U.x0) - CP), cy = Math.max(0, Math.floor(y0 - U.y0) - CP);
          clip = [cx, cy, Math.min(U.bw - cx, bw + CP * 2), Math.min(U.bh - cy, bh + CP * 2)];
          CV = U.cv; G = U.g; BX0 = U.x0; BY0 = U.y0; BW = U.bw; BH = U.bh;
        } else {
          CV = document.createElement('canvas'); CV.width = bw; CV.height = bh; G = CV.getContext('2d');
          BX0 = x0; BY0 = y0; BW = bw; BH = bh;
        }
        const cv = CV, g = G;
        x0 = BX0; y0 = BY0;
        // ★표면은 GPU 로. 실패하면 그 자리에서 캔버스 폴리곤 판으로 되돌아간다(라이브를 못 세운다).
        let drawn = false; _mt3BandD = null;
        if (MT3_GL && _mt3GlInit()) {
          try { drawn = _mt3GlBand(g, F, key, cells, cutCells, x0, y0, BW, BH, clip); }
          catch (e) { console.warn('[mt3d] GL 띠 실패 — 캔버스로:', e && e.message); _mgl.ok = false; drawn = false; }
        }
        // ★범위는 **GL 판에서만** 잡힌다. 캔버스 폴리곤 판으로 떨어지면 null 로 두어
        //   그 세그먼트는 **통째 분류**(옛 띠 z)로 되돌아간다 — 조용히 틀리는 것보다 낫다.
        if (!drawn || !_mt3BandD) { glAll = false; }
        else { if (_mt3BandD[0] < bLo) bLo = _mt3BandD[0]; if (_mt3BandD[1] > bHi) bHi = _mt3BandD[1];
               if (_mt3BandD[2] < sLo2) sLo2 = _mt3BandD[2]; if (_mt3BandD[3] > sHi2) sHi2 = _mt3BandD[3];
               if (_mt3BandD[4] > hHi2) hHi2 = _mt3BandD[4]; }
        if (!drawn) {
          g.save(); g.translate(-x0, -y0);
          const RP = pat ? g.createPattern(pat, 'repeat') : null;
          const GP = gpat ? g.createPattern(gpat, 'repeat') : null;
          for (const [i, j] of cells) _mt3Quad(g, F, i, j, RP, GP);
          g.restore();
        }
        // ★★[오버드로] 화가 알고리즘이라 **앞 띠에 완전히 가린 띠도 전부 그린다.**
        //   35m 벽이 화면을 채우니 그 낭비가 실측 +20.13ms 였다(9m 때는 +8.50ms).
        //   ⇒ 띠마다 **열별 윤곽**(그려지는 최상단·최하단 y)을 굽는 김에 같이 낸다.
        //     알파를 되읽지 않는다 — 기하에서 바로 나온다(옛날에 getImageData 로 뜨다가
        //     56MB + 리드백 324회를 만든 적이 있다. 같은 실수 반복 금지).
        const colT = U ? U.colT : new Int16Array(BW).fill(32767);
        const colB = U ? U.colB : new Int16Array(BW).fill(-32768);
        {
          const SS = 4;                       // 셀당 4×4 표본이면 윤곽으로 충분하다
          for (const [ci, cj] of cells) {
            let px = null;
            for (let b = 0; b <= SS; b++) {
              const row = [];
              for (let a = 0; a <= SS; a++) {
                const u = ci + a / SS, v = cj + b / SS;
                const wxp = (F.i0 + u) * 32, wyp = (F.j0 + v) * 32;
                row.push([(wxp - wyp) - x0, (wxp + wyp) * 0.5 - F.corS(u, v) * 32 - y0]);
              }
              if (px) for (let a = 0; a < SS; a++) {
                // 사각 조각 하나가 덮는 열 범위에 위/아래를 기록한다
                const q = [px[a], px[a + 1], row[a + 1], row[a]];
                let lo = 1e9, hi = -1e9, ty = 1e9, by = -1e9;
                for (const p of q) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0];
                                     if (p[1] < ty) ty = p[1]; if (p[1] > by) by = p[1]; }
                const c0 = Math.max(0, Math.floor(lo)), c1 = Math.min(BW - 1, Math.ceil(hi));
                const t0 = Math.round(ty), b0 = Math.round(by);
                for (let x = c0; x <= c1; x++) {
                  if (t0 < colT[x]) colT[x] = t0;
                  if (b0 > colB[x]) colB[x] = b0;
                }
              }
              px = row;
            }
          }
        }
        // ── ③ 돌출목 — 수관 위로 드문드문 솟은 소나무 ─────────────────────────
        //   ★산 본체엔 **개별 실물 나무를 안 세운다**(재민 확정). 여기 얹는 건 수관 덮개 위로
        //     머리를 내민 **돌출목**이고, 닿을 수 없는 곳이라 축척을 상징으로 내려 그린다.
        //   ★균일 간격 금지 — 물가 술 규약과 같이 **셀 해시**로 유무·위치·종류를 정한다.
        //     Math.random 금지(같은 자리는 늘 같은 그림이어야 한다).
        //   ★띠 캔버스에 **구워 넣는다**. 그래야 안개 게이트·z 정렬·가림 계약이 그대로다
        //     (mtseg 한 장으로 남는다 — renderables 계약 무변경).
        //   ★그리는 목록을 먼저 만든다 — 되그릴 때 같은 목록을 같은 순서로 쓴다.
        const bandTrees = [];
        if (MT3_TREEP > 0 && _treeSpritesLoaded >= 12) {
          for (const [i, j] of cells) {
            const ax = F.i0 + i, ay = F.j0 + j;
            if (_cellHash(ax, ay, 137) >= MT3_TREEP) continue;
            const hc = F.corS(i + 0.5, j + 0.5);
            if (hc < 6) continue;                     // 산자락 암벽 띠에는 안 세운다
            // 능선·급경사(바위로 드러나는 자리)도 피한다 — 수관 위여야 한다
            const gx = F.corS(i + 1, j) - F.corS(i - 1, j), gy = F.corS(i, j + 1) - F.corS(i, j - 1);
            if (Math.hypot(gx, gy) * 0.5 > 3.2) continue;
            const jx = (_cellHash(ax, ay, 139) - 0.5) * 22, jy = (_cellHash(ax, ay, 149) - 0.5) * 22;
            const wxp = ax * 32 + 16 + jx, wyp = ay * 32 + 16 + jy;
            const c = w2i(wxp, wyp);
            const sxp = c.x - x0, syp = c.y - hc * 32 - y0;
            const im = TREE_SPRITES[(_cellHash(ax, ay, 151) * TREE_SPRITES.length) | 0];
            if (!im || !im.complete || !im.naturalHeight) continue;
            const hpx = MT3_TREEPX * (0.78 + 0.44 * _cellHash(ax, ay, 157));
            const wpx = hpx * (im.naturalWidth / im.naturalHeight);
            bandTrees.push({ im, x: sxp - wpx / 2, y: syp - hpx, w: wpx, h: hpx, d: c.y + 32 * hc, s: c.y });
          }
        }
        for (const t of bandTrees) {
          if (t.d < bLo) bLo = t.d; if (t.d > bHi) bHi = t.d;
          if (t.s < sLo2) sLo2 = t.s; if (t.s > sHi2) sHi2 = t.s;
          g.globalAlpha = 0.92; g.drawImage(t.im, t.x, t.y, t.w, t.h); g.globalAlpha = 1;
        }
        recipe.push({ cells, cuts: cutCells, trees: bandTrees, clip });
        const refPool = cells.length ? cells : cutCells;
        const ref = refPool.reduce((a, b) => (a[0] + a[1] <= b[0] + b[1] ? a : b));   // 앵커 = 가장 작은 k
        const wx = (F.i0 + ref[0]) * 32 + 16, wy = (F.j0 + ref[1]) * 32 + 16;
        const rp = w2i((F.i0 + ref[0]) * 32 + 16, (F.j0 + ref[1]) * 32 + 16);
        // ★알파 사본을 **안 뜬다**. 굽는 시점에 뜨면 띠마다 GPU 리드백 1회 +
        //   힙에 캔버스와 같은 크기(실측 56MB)를 한 벌 더 든다 — 렉 잡겠다고 넣은 게 렉이었다.
        //   가림 판정은 z 게이트를 통과한 극소수 띠에서만 1px 만 읽는다.
        // 실제로 칠해지는 최소 사각형 — blit 을 여기로 좁힌다(여백·투명 모서리를 안 옮긴다)
        if (U) continue;                 // 병합: 세그먼트는 루프가 끝난 뒤 **하나만** 낸다
        let bx0 = BW, bx1 = -1, by0 = BH, by1 = -1;
        for (let a = 0; a < BW; a++) {
          if (colT[a] > colB[a]) continue;
          if (a < bx0) bx0 = a; if (a > bx1) bx1 = a;
          if (colT[a] < by0) by0 = colT[a]; if (colB[a] > by1) by1 = colB[a];
        }
        const pb = (bx1 >= bx0) ? [Math.max(0, bx0), Math.max(0, Math.min(BH - 1, by0)),
                                   Math.min(BW - 1, bx1), Math.min(BH - 1, by1)] : null;
        _mt3BandN++;
        segs.push({ img: cv, x: wx, y: wy, ox: rp.x - x0, oy: rp.y - y0, sc: 1, mt3: 1, colT, colB, pb, merged: 0,
                    dLo: glAll ? bLo : null, dHi: glAll ? bHi : null,
                    sLo: glAll ? sLo2 : null, sHi: glAll ? sHi2 : null, hHi: glAll ? hHi2 : 0,
                    rec: glAll ? { F, key, x0, y0, bw: BW, bh: BH, bands: recipe } : null });
      }
      // ── 병합: 청크 하나를 **세그먼트 한 장**으로 낸다 ─────────────────────
      //   앵커는 **가장 작은 k** — 안 병합 판의 띠와 같은 규칙이라 정렬이 그대로 재현된다
      //   (앵커를 가장 큰 k 로 잡았다가 켬/끔 차이 1062화소를 냈다. 실측이 내 추론을 뒤집었다).
      if (U && mesh.length) {
        const ref = MT3_MERGEZ
          ? mesh.reduce((a, b) => (a[0] + a[1] >= b[0] + b[1] ? a : b))
          : mesh.reduce((a, b) => (a[0] + a[1] <= b[0] + b[1] ? a : b));
        const wx = (F.i0 + ref[0]) * 32 + 16, wy = (F.j0 + ref[1]) * 32 + 16;
        const rp = w2i(wx, wy);
        let bx0 = U.bw, bx1 = -1, by0 = U.bh, by1 = -1;
        for (let a = 0; a < U.bw; a++) {
          if (U.colT[a] > U.colB[a]) continue;
          if (a < bx0) bx0 = a; if (a > bx1) bx1 = a;
          if (U.colT[a] < by0) by0 = U.colT[a]; if (U.colB[a] > by1) by1 = U.colB[a];
        }
        const pb = (bx1 >= bx0) ? [Math.max(0, bx0), Math.max(0, Math.min(U.bh - 1, by0)),
                                   Math.min(U.bw - 1, bx1), Math.min(U.bh - 1, by1)] : null;
        _mt3BandN++;
        segs.push({ img: U.cv, x: wx, y: wy, ox: rp.x - U.x0, oy: rp.y - U.y0, sc: 1, mt3: 1,
                    colT: U.colT, colB: U.colB, pb, merged: 1,
                    dLo: glAll ? bLo : null, dHi: glAll ? bHi : null,
                    sLo: glAll ? sLo2 : null, sHi: glAll ? sHi2 : null, hHi: glAll ? hHi2 : 0,
                    rec: glAll ? { F, key, x0: U.x0, y0: U.y0, bw: U.bw, bh: U.bh, bands: recipe } : null });
      }
    }
    if (_mt3Chunk.size > 260) _mt3Chunk.clear();
    _mt3Chunk.set(key, segs);
    _mt3BakeMs += performance.now() - _bt0; _mt3BakeN++;
    return segs;
  }
  // 사각형 하나 — 화면 픽셀 기준 적응 분할 + 급경사 변위
  function _mt3Quad(g, F, i, j, RP, GP) {
    // ★★[재민 "검은 점·선" 진짜 원인] **T-접합**이다.
    //   세분 수(sub)를 셀마다 경사·높이로 다르게 정했다. 이웃한 두 셀의 sub 가 다르면
    //   공유 변의 조각 꼭짓점이 **서로 안 맞는다**. 변위까지 얹히면 그 틈이 벌어져
    //   표면에 검은 슬리버로 남는다. bbox 여유를 줘도 안 없어진 이유가 이것이다.
    //   ⇒ sub 를 **상수**로 고정한다. 공유 변의 꼭짓점이 양쪽에서 같은 자리에 찍힌다.
    //   ★변위도 `st0 > 0.14` 로 **셀 단위 on/off** 였다 — 급한 셀은 밀고 옆의 완만한 셀은
    //     안 밀어서 공유 변이 한쪽만 찢어졌다. 높이(연속량)로만 재운다.
    const sub = MT3_SUB;
    //   ★단, 높이만으로 재우면 **온 사면이 자글자글해진다**(실측: 완만한 곳까지 울퉁불퉁).
    //     변위는 절벽에만 있어야 한다. 그런데 '절벽인가'를 **셀 단위**로 물으면 다시 찢어진다.
    //     ⇒ 꼭짓점 자리에서 **연속 기울기**(corS 차분)를 재서 진폭을 재운다. 양쪽 셀이 같은 값을 본다.
    const steepAt = (x, y) => {
      const gx = F.corS(x + 0.5, y) - F.corS(x - 0.5, y);
      const gy = F.corS(x, y + 0.5) - F.corS(x, y - 0.5);
      return 1 - 1 / Math.hypot(gx, gy, 1);
    };
    const disp = (lx, ly, hh) => {
      const st = steepAt(lx, ly);
      const w = Math.min(1, Math.max(0, (st - 0.16) / 0.34)) * Math.min(1, Math.max(0, (hh - 0.6) / 1.6));
      if (w <= 0) return 0;
      const au = F.i0 + lx, av = F.j0 + ly;
      return w * 0.42 * ((_mt3vn(au * 2.3, av * 2.3, 71) - 0.5) + (_mt3vn(au * 4.9, av * 4.9, 73) - 0.5) * 0.55);
    };
    // ★★[재민 2026-08-09 "아직도 정사각형 타일 흔적이 남는다"] — 원인은 여기다.
    //   높이를 셀 안에서 **이중선형**으로 폈다. 값은 셀 경계에서 이어지지만 **기울기가 꺾인다**
    //   (C0 이지 C1 이 아니다). 법선은 기울기에서 나오므로 경계마다 음영이 툭 꺾이고,
    //   그 꺾임선이 정확히 셀 격자 = 다이아 무늬로 읽힌다. 조각을 아무리 잘게 쪼개도
    //   꺾임은 셀 경계에 그대로 남는다 — 그래서 세분으로는 안 없어졌다.
    //   ⇒ 1차 시도는 u,v 의 smoothstep 이었다. C1 은 됐지만 셀마다 기울기가 0→최대→0 이라
    //     **베개=누비이불**이라는 두 번째 격자 흔적을 낳았다 — **걷어냈다.**
    //     Catmull-Rom(F.corS)은 값·기울기를 이으면서 셀 안에 강제 극점을 안 만든다.
    //     GPU 판(_mt3GlBand)의 hAll() 과 같은 식이라 두 경로의 곡면이 동일하다.
    const hBi = (u, v) => F.corS(i + u, j + v);
    const hS = (u, v) => { const b = hBi(u, v); return Math.max(0, b + disp(i + u, j + v, b)); };
    const P = (u, v) => {
      const c = w2i((F.i0 + i + u) * 32, (F.j0 + j + v) * 32), hh = hS(u, v);
      // 가로 변위도 **높이만**으로 재운다(셀 단위 조건이 들어가면 공유 변이 찢어진다)
      const jw = Math.min(1, Math.max(0, (steepAt(i + u, j + v) - 0.16) / 0.34))
               * Math.min(1, Math.max(0, (hh - 0.6) / 1.6));
      const jx = (_mt3vn((F.i0 + i + u) * 2.1, (F.j0 + j + v) * 2.1, 79) - 0.5) * jw * 0.42 * 26;
      return [c.x + jx, c.y - hh * 32];
    };
    const soft = (x, y) => {
      const e = F.corS(x + 1, y), w = F.corS(x - 1, y), n = F.corS(x, y - 1), s2 = F.corS(x, y + 1), c = F.corS(x, y);
      const gx = (e - w) * 0.5, gy = (s2 - n) * 0.5, nl = Math.hypot(gx, gy, 1) || 1;
      const d2 = (-gx / nl) * MT3_L[0] + (-gy / nl) * MT3_L[1] + (1 / nl) * MT3_L[2];
      return { lam: Math.max(0.14, d2) + Math.max(0, -d2) * 0.20, conc: (e + w + n + s2) / 4 - c };
    };
    for (let sv = 0; sv < sub; sv++) for (let su = 0; su < sub; su++) {
      const u0 = su / sub, u1 = (su + 1) / sub, v0 = sv / sub, v1 = (sv + 1) / sub;
      const cx = i + (u0 + u1) / 2, cy = j + (v0 + v1) / 2, so = soft(cx, cy);
      const A = P(u0, v0), B = P(u1, v0), C2 = P(u1, v1), D = P(u0, v1);
      const hNW = hS(u0, v0), hNE = hS(u1, v0), hSE = hS(u1, v1), hSW = hS(u0, v1);
      const cw = 32 / sub;
      const ux = [cw, cw, (hSE - hNW) * 32], vx = [cw, -cw, (hNE - hSW) * 32];
      let nx = ux[1] * vx[2] - ux[2] * vx[1], ny = ux[2] * vx[0] - ux[0] * vx[2], nz = ux[0] * vx[1] - ux[1] * vx[0];
      const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const lamD = nx * MT3_L[0] + ny * MT3_L[1] + nz * MT3_L[2];
      const lam = (Math.max(0.14, lamD) + Math.max(0, -lamD) * 0.20) * 0.52 + so.lam * 0.48;
      const hAvg = (hNW + hNE + hSE + hSW) / 4, steep = 1 - nz;
      // 무게중심으로 살짝 부풀려 실틈 방지(조명도 같은 도형에 얹힌다)
      let px = 0, py = 0; const pts = [A, B, C2, D];
      for (const q of pts) { px += q[0]; py += q[1]; } px /= 4; py /= 4;
      // ★부풀리기는 **모든 층이 같은 값**을 써야 한다. 불투명만 부풀리고 반투명을 안 부풀리면
      //   조각마다 0.55px 의 **안 칠해진 테두리**가 남아 밝은 그물이 된다(실제로 그렇게 됐다).
      //   반대로 둘 다 부풀리면 겹친 자리가 두 번 어두워져 어두운 그물이 된다.
      //   ⇒ 값을 조각 크기(10px)에 견줘 무시할 만큼 줄인다: 0.55 → 0.18px.
      const inf = pts.map(q => { const dx = q[0] - px, dy = q[1] - py, l = Math.hypot(dx, dy) || 1;
        return [q[0] + dx / l * 0.18, q[1] + dy / l * 0.18]; });
      // ★[재민 "잔 격자"] 실틈 막으려 0.55px 부풀린 도형에 **반투명**(틴트·음영)까지 얹으면
      //   조각 경계에서 두 번 합성돼 격자 그물이 남는다. 조각이 10px 이라 그물도 10px 이다.
      //   ⇒ **불투명 바탕만 부풀리고**(겹쳐도 무해), 반투명 층은 부풀리지 않은 도형에 얹는다.
      const path = () => { g.beginPath(); g.moveTo(inf[0][0], inf[0][1]);
        for (let n2 = 1; n2 < 4; n2++) g.lineTo(inf[n2][0], inf[n2][1]); g.closePath(); };
      const pathT = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let n2 = 1; n2 < 4; n2++) g.lineTo(pts[n2][0], pts[n2][1]); g.closePath(); };
      const macro = (_mt3vn((F.i0 + cx) / 21, (F.j0 + cy) / 21, 61) - 0.5) * 1.5
                  + (_mt3vn((F.i0 + cx) / 8.5, (F.j0 + cy) / 8.5, 63) - 0.5) * 0.7
                  + (_mt3vn((F.i0 + cx) / 3.1, (F.j0 + cy) / 3.1, 67) - 0.5) * 0.35;
      // 폴백도 같은 규칙 — 바위 = (급경사 ∧ 능선) ∪ 가장자리 암벽 띠
      const _sg = Math.max(0, Math.min(1, (steep - 0.42) / 0.38));
      const _rg = Math.max(0, Math.min(1, -so.conc * 0.75));
      const _ec = 1 - Math.max(0, Math.min(1, (hAvg - 2.5) / 7.0));
      let t = Math.max(0, Math.min(1, Math.max(_ec, _sg * _rg) + macro * 0.10));
      const use = (t < 0.10 ? GP : RP);
      if (use) { use.setTransform(new DOMMatrix().translate(0, -Math.round(hAvg * 32)).scale(t < 0.10 ? 1 : 0.35, t < 0.10 ? 1 : 0.35));
                 g.fillStyle = use; } else g.fillStyle = t < 0.10 ? '#5a7040' : '#6b6b6b';
      path(); g.fill();
      g.fillStyle = _mt3Ramp(t); path(); g.fill();
      // 램버트·AO·층·접지·대기원근을 **한 겹**으로 (여러 겹이면 겹친 자리에 줄이 남는다)
      const k = (MT3_AMB + MT3_DIR * lam) / MT3_KFLAT;
      let cr = 0, cg = 0, cb = 0, ca = 0;
      const add = (r2, g2, b2, a2) => { if (a2 <= 0.002) return; const na = ca + a2 * (1 - ca); if (na <= 0) return;
        const w2 = a2 * (1 - ca) / na; cr = cr * (1 - w2) + r2 * w2; cg = cg * (1 - w2) + g2 * w2; cb = cb * (1 - w2) + b2 * w2; ca = na; };
      if (k < 1) add(12, 15, 20, Math.min(0.88, (1 - k) * 1.05)); else if (k > 1) add(255, 247, 226, Math.min(0.55, (k - 1) * 0.62));
      if (so.conc > 0.02) add(16, 20, 26, Math.min(0.42, so.conc * 0.36));
      else if (so.conc < -0.02) add(255, 250, 236, Math.min(0.22, -so.conc * 0.19));
      if (steep > 0.30) { const bt = Math.abs(((hAvg / 2.2) % 1) - 0.5) * 2;
        add(22, 24, 28, Math.max(0, (0.30 - bt) / 0.30) * Math.min(0.42, (steep - 0.30) * 0.80)); }
      if (F.isRock(i, j)) { const dd = Math.max(0, 1.6 - (hAvg > 0 ? 1.6 : 0)); void dd; }
      if (hAvg > 0.5) add(186, 200, 216, Math.min(0.09, (hAvg / MT3_HMAX) * 0.09));
      // 마루의 숲 — GPU 판의 수관을 캔버스에서 한 겹으로 흉내낸다(폴백이라 간략)
      { const onMt = Math.max(0, Math.min(1, (hAvg - 0.8) / 2.2)), cn = (1 - t) * onMt;
        if (cn > 0.02) { const kk = _mt3vn((F.i0 + cx) / 3.3, (F.j0 + cy) / 3.3, 83);
          add(27 + 33 * kk, 50 + 42 * kk, 25 + 18 * kk, cn * 0.88); } }
      if (ca > 0.002) { g.fillStyle = 'rgba(' + Math.round(cr) + ',' + Math.round(cg) + ',' + Math.round(cb) + ',' + ca.toFixed(3) + ')'; path(); g.fill(); }
    }
  }
  let _mt3Budget = 0, _mt3Skip = 0, _mt3SkipMax = 0;
  function _mt3Collect(out, cx0, cy0) {
    const zid = primaryZoneId; if (!zid) return 0;
    if (zid !== _mt3Sig) { _mt3Sig = zid; _mt3Chunk.clear(); }
    // ★파괴는 **그 근처 청크만** 다시 굽는다. 전부 비우면 곡괭이질 한 번에 화면이 멈춘다.
    if (_mt3Dirty.size) { for (const k of _mt3Dirty) _mt3Chunk.delete(k); _mt3Dirty.clear(); }
    _mt3Budget = MT3_BUDGET;
    // 카메라의 화면 원점(= toScreen 이 쓰는 것과 같은 식)
    const U0 = cx0 - cy0, V0 = (cx0 + cy0) * 0.5;
    // ★★[갱 안에서 지면이 비치던 진짜 원인 2026-08-22] 여기가 **MT3_HMAX 로** 여유를 잡고 있었다.
    //   실제 높이는 HMAX 를 넘는다 — hmaxL 변조(×0.69~1.31)와 결이 얹혀 **실측 최대 48.8m**다
    //   (scripts/probe-mtpad.js). 그래서 아래쪽 여유가 1120px 밖에 안 되고,
    //   그보다 높은 곳에 있는 **화면에 걸리는 띠가 통째로 잘려** 나갔다.
    //   증상: 산 속 깊은 자리에서 벽 너머로 맨 지면이 비친다(산에 밑면이 없어서가 **아니었다** —
    //   내려가는 사면이 잘려 안 그려진 것이다). 실측: 청크 25개만 수집, 사면 가장자리는 범위 밖.
    //   ⇒ 실제 상한으로 잡는다. HMAX×1.55 ≈ 54m — 측정 최대 48.8m 위로 여유를 둔다.
    const MX = W * 0.5 + 96, MYU = H * 0.5 + 96, MYD = H * 0.5 + MT3_HTOP * 32 + 96;
    // 화면에 걸릴 수 있는 셀의 (i−j)·(i+j) 범위
    const dLo = (U0 - MX) / 32, dHi = (U0 + MX) / 32;
    const sLo = (V0 - MYU) / 16, sHi = (V0 + MYD) / 16;
    const cap = MT3_VIEW / 32;
    const iLo = Math.max(Math.floor((sLo + dLo) / 2), Math.floor(cx0 / 32 - cap));
    const iHi = Math.min(Math.ceil((sHi + dHi) / 2), Math.ceil(cx0 / 32 + cap));
    const jLo = Math.max(Math.floor((sLo - dHi) / 2), Math.floor(cy0 / 32 - cap));
    const jHi = Math.min(Math.ceil((sHi - dLo) / 2), Math.ceil(cy0 / 32 + cap));
    let n = 0;
    const cand = [];
    for (let gy = Math.floor(jLo / MT3_CH); gy <= Math.floor(jHi / MT3_CH); gy++)
      for (let gx = Math.floor(iLo / MT3_CH); gx <= Math.floor(iHi / MT3_CH); gx++) {
        // 청크의 (i−j)·(i+j) 구간이 화면 구간과 안 겹치면 아예 굽지 않는다
        const i0 = gx * MT3_CH, i1 = i0 + MT3_CH - 1, j0 = gy * MT3_CH, j1 = j0 + MT3_CH - 1;
        if (i0 - j1 > dHi || i1 - j0 < dLo) continue;
        if (i0 + j0 > sHi || i1 + j1 < sLo) continue;
        const segs = _mt3Bake(zid, gx, gy);
        if (!segs) { needsRedraw = true; continue; }   // 아직 안 구운 청크 — 다음 프레임에
        for (const sg of segs) {
          // ★띠는 **구운 사각형**으로 자른다. 앵커가 화면 밖이어도 몸통이 걸칠 수 있다
          //   (한 띠가 반대각선 16셀까지 뻗어 가로로 540px 을 덮는다).
          const p = w2i(sg.x, sg.y);
          const l = p.x - U0 - sg.ox, t = p.y - V0 - sg.oy;
          if (l > W * 0.5 || l + sg.img.width < -W * 0.5) continue;
          if (t > H * 0.5 || t + sg.img.height < -H * 0.5) continue;
          // −0.5: 같은 셀 위에 선 개체가 산보다 **앞**에 오도록(라이브 z 규약과 동형)
          cand.push({ z: p.y - 0.5, kind: 'mtseg', sg, wx: sg.x, wy: sg.y,
                      sx: Math.round(l + W * 0.5), sy: Math.round(t + H * 0.5) });
        }
      }
    n = _mt3Cull(out, cand);
    return n;
  }
  // ── 완전 은폐 컬링 ────────────────────────────────────────────────────────
  //   화면 열마다 **이미 불투명하게 덮인 지평선**(그 y 아래로는 다 덮였다)을 들고,
  //   가까운 띠부터(z 큰 순) 훑는다. 어떤 띠의 열별 최상단이 모든 열에서 지평선 아래면
  //   그 띠는 한 화소도 안 보인다 — 안 그린다.
  //   ★지평선은 **이미 덮인 구간과 맞닿을 때만** 위로 넓힌다. 산 표면은 열마다 연속이라
  //     이 조건이 성립하고, 안 맞닿으면(사이에 하늘이 있으면) 넓히지 않아 과잉 컬링이 없다.
  // ★★[실측 결론 — 지시 ① 은 이 장면에서 **손해다**]
  //   "앞 띠에 완전 은폐된 띠를 스킵" 을 그대로 넣고 쟀다:
  //     · 컬링된 띠 **0 / 162장** (90% 이상 가려진 띠조차 2장뿐)
  //     · 그런데 매 프레임 띠×열 훑기 때문에 **+2.87ms (SE 0.82) 유의하게 느려졌다**
  //   왜 안 걸리나: 낭비는 '완전히 가린 띠'가 아니다. 오버드로가 화면 넓이의 **4.65배**인데,
  //   그 정체는 3m/셀 벽을 **반대각선 띠마다 다시 칠하는 것**이다. 셀 하나의 벽이 세로 ~90px
  //   인데 띠 간격은 16px 이라, 같은 화소를 대략 6~7번 칠한다. 띠 단위로는 아무도 '완전히'
  //   가려지지 않는다 — 서로 조금씩 삐져나온다.
  //   ⇒ 기본은 **끔**. 코드는 손잡이 뒤에 남겨 둔다(뒷사면처럼 자기가림이 큰 자리에선 쓸모가 있다).
  //   ⇒ 남은 +24.7ms 를 없애려면 산을 **한 번에 깊이버퍼로** 그려야 하는데, 그건 띠 사이에
  //     개체가 끼는 계약을 깬다 — 재민 결정 사항으로 회부한다.
  let MT3_CULL = 0, _mt3Culled = 0, _mt3Over = 0, _mt3OverT = 0, _mt3OverP = 0, _mt3Near = 0, _mt3HorT = null, _mt3HorB = null;
  window.__mt3cull = (v) => { MT3_CULL = v ? 1 : 0; return MT3_CULL; };
  function _mt3Cull(out, cand) {
    if (!MT3_CULL) { for (const it of cand) out.push(it); _mt3Culled = 0; return cand.length; }
    // ★덮인 구간을 [위, 아래] **둘 다** 들고 간다. 위만 들고 "그 아래는 다 덮였다"고 하면
    //   띠 아래쪽의 안 덮인 부분을 덮였다고 우겨 과잉 컬링이 난다.
    if (!_mt3HorT || _mt3HorT.length < W) { _mt3HorT = new Int32Array(W); _mt3HorB = new Int32Array(W); }
    const hT = _mt3HorT, hB = _mt3HorB;
    hT.fill(2147483647); hB.fill(-2147483648);
    cand.sort((a, b) => b.z - a.z);              // 가까운 것부터
    let n = 0; _mt3Culled = 0;
    const keep = [];
    for (const it of cand) {
      const sg = it.sg, cT = sg.colT, cB = sg.colB;
      const x0 = it.sx - sg.ox, y0 = it.sy - sg.oy;   // 띠 캔버스의 화면 원점
      let vis = false;
      if (!cT) vis = true;                       // 윤곽이 없는 띠(옛 세그)는 안전하게 그린다
      else {
        const a0 = Math.max(0, -x0), a1 = Math.min(sg.img.width - 1, W - 1 - x0);
        for (let a = a0; a <= a1; a++) {
          if (cT[a] > cB[a]) continue;           // 이 열엔 그려지는 게 없다
          const x = x0 + a;
          if (y0 + cT[a] < hT[x] || y0 + cB[a] > hB[x]) { vis = true; break; }
        }
        if (a1 < a0) vis = true;                 // 화면 밖 — 판정 불가, 그냥 둔다
      }
      if (!vis) { _mt3Culled++; continue; }
      // 지평선 갱신 — 맞닿는 열만
      if (cT) {
        const a0 = Math.max(0, -x0), a1 = Math.min(sg.img.width - 1, W - 1 - x0);
        for (let a = a0; a <= a1; a++) {
          if (cT[a] > cB[a]) continue;
          const t = y0 + cT[a], b = y0 + cB[a], x = x0 + a;
          if (hT[x] > hB[x]) { hT[x] = t; hB[x] = b; }          // 이 열의 첫 덮개
          else if (b + 1 >= hT[x] && t - 1 <= hB[x]) {          // 맞닿거나 겹칠 때만 넓힌다
            if (t < hT[x]) hT[x] = t;
            if (b > hB[x]) hB[x] = b;
          }
        }
      }
      keep.push(it); n++;
    }
    // 계측 — 오버드로가 실제로 얼마나 있나(화면 화소 대비 그려지는 띠 화소 합)
    { let a = 0;
      for (const it of keep) {
        const sg = it.sg, x0 = it.sx - sg.ox, y0 = it.sy - sg.oy;
        const w2 = Math.min(W, x0 + sg.img.width) - Math.max(0, x0);
        const h2 = Math.min(H, y0 + sg.img.height) - Math.max(0, y0);
        if (w2 > 0 && h2 > 0) a += w2 * h2;
      }
      _mt3Over = a / Math.max(1, W * H);
      // 같은 띠들을 **실제로 칠해지는 최소 사각형**으로 재면 얼마가 되나
      let at = 0, ap = 0;
      for (const it of keep) {
        const sg = it.sg, cT = sg.colT, cB = sg.colB; if (!cT) { at += 0; continue; }
        const x0 = it.sx - sg.ox, y0 = it.sy - sg.oy;
        let lo = 1e9, hi = -1e9, ty = 1e9, by = -1e9, col = 0;
        for (let a2 = 0; a2 < sg.img.width; a2++) {
          if (cT[a2] > cB[a2]) continue;
          col++;
          if (a2 < lo) lo = a2; if (a2 > hi) hi = a2;
          if (cT[a2] < ty) ty = cT[a2]; if (cB[a2] > by) by = cB[a2];
          ap += Math.min(H, y0 + cB[a2]) - Math.max(0, y0 + cT[a2]) + 1;   // 열별 실제 높이 합
        }
        if (!col) continue;
        const w2 = Math.min(W, x0 + hi + 1) - Math.max(0, x0 + lo);
        const h2 = Math.min(H, y0 + by + 1) - Math.max(0, y0 + ty);
        if (w2 > 0 && h2 > 0) at += w2 * h2;
      }
      _mt3OverT = at / Math.max(1, W * H);
      _mt3OverP = ap / Math.max(1, W * H);
      let cov = 0;
      for (const it of cand) {
        const sg = it.sg, cT = sg.colT, cB = sg.colB; if (!cT) continue;
        const x0 = it.sx - sg.ox, y0 = it.sy - sg.oy;
        let tot = 0, hid = 0;
        for (let a2 = Math.max(0, -x0); a2 <= Math.min(sg.img.width - 1, W - 1 - x0); a2++) {
          if (cT[a2] > cB[a2]) continue; tot++;
          const x = x0 + a2;
          if (y0 + cT[a2] >= hT[x] && y0 + cB[a2] <= hB[x]) hid++;
        }
        if (tot && hid / tot > 0.9) cov++;
      }
      _mt3Near = cov;
    }
    // 그리기는 원래 순서(z 오름차순)로 — 화가 알고리즘 계약은 그대로다
    keep.sort((a, b) => a.z - b.z);
    for (const it of keep) out.push(it);
    return n;
  }
  let _mt3Fail = 0;
  let _mtChunkSig = '';
  function _mtCollectCover(out, cx0, cy0) {
    const zid = primaryZoneId; if (!zid) return 0;
    // ★청크는 **굽는 시점의 손잡이 값**을 품는다 — 손잡이를 뒤집어도 캐시가 그대로면
    //   A/B 대조군이 그림에 안 나타난다(하네스가 이걸 잡았다). 서명이 바뀌면 다시 굽는다.
    const sig = (_t19.footOff ? 'F' : '') + (_t19.fitOff ? 'X' : '') + zid;
    if (sig !== _mtChunkSig) { _mtChunkSig = sig; _mtChunk.clear(); }
    const c0 = Math.floor((cx0 - MT_VIEW_PAD) / 32), c1 = Math.floor((cx0 + MT_VIEW_PAD) / 32);
    const r0 = Math.floor((cy0 - MT_VIEW_PAD) / 32), r1 = Math.floor((cy0 + MT_VIEW_PAD) / 32);
    let n = 0;
    for (let gy = Math.floor(r0 / MT_CH); gy <= Math.floor(r1 / MT_CH); gy++) {
      for (let gx = Math.floor(c0 / MT_CH); gx <= Math.floor(c1 / MT_CH); gx++) {
        for (const sg of _mtChunkSegs(zid, gx, gy)) {
          if (Math.abs(sg.x - cx0) > MT_VIEW_PAD || Math.abs(sg.y - cy0) > MT_VIEW_PAD) continue;
          out.push({ z: w2i(sg.x, sg.y).y, kind: 'mtseg', sg, wx: sg.x, wy: sg.y });
          n++;
        }
      }
    }
    return n;
  }
  function _mtCollect(out, cx0, cy0) {
    if (_t19.mtOff) return 0;
    // ★[재민 2026-08-09 "이대로 본게임 ㄱ"] 기본은 3D. 손잡이 `mt3dOff` 로 스프라이트 복귀.
    //   ★어떤 이유로든 터지면 **스프라이트 판으로 되돌아간다** — 라이브를 못 세운다.
    if (!_t19.mt3dOff) {
      try {
        const n3 = _mt3Collect(out, cx0, cy0);
        if (n3 > 0 || !_mt3Fail) return n3;
      } catch (e) {
        if (!_mt3Fail) { _mt3Fail = 1; console.warn('[mt3d] 실패 — 스프라이트 판으로 되돌아간다:', e && e.message); }
      }
    }
    if (!_mtAnchors || _mtLoaded < _mtWanted) return 0;
    const H = _hardTerrain; if (!H) return 0;
    if (!_t19.mtLegacy) return _mtCollectCover(out, cx0, cy0);
    let n = 0;
    for (const zid in H) {
      const z = zonesMeta[zid]; if (!z) continue;
      const ox = z.worldOffsetX, oy = z.worldOffsetY || 0;
      const rs = H[zid].ridges || [];
      for (let ri = 0; ri < rs.length; ri++) {
        // 능선 바운딩 박스로 먼저 거른다 — 전 존 능선을 매 프레임 훑지 않는다
        const pp = rs[ri].path;
        let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        for (let k = 0; k < pp.length; k += 8) {
          const px = ox + pp[k].pos[0], py = oy + pp[k].pos[1];
          if (px < mnx) mnx = px; if (px > mxx) mxx = px; if (py < mny) mny = py; if (py > mxy) mxy = py;
        }
        if (cx0 < mnx - MT_VIEW_PAD || cx0 > mxx + MT_VIEW_PAD || cy0 < mny - MT_VIEW_PAD || cy0 > mxy + MT_VIEW_PAD) continue;
        for (const sg of _mtPlaceRidge(zid, rs[ri], ox, oy, ri)) {
          if (Math.abs(sg.x - cx0) > MT_VIEW_PAD || Math.abs(sg.y - cy0) > MT_VIEW_PAD) continue;
          out.push({ z: w2i(sg.x, sg.y).y, kind: 'mtseg', sg, wx: sg.x, wy: sg.y });
          n++;
        }
      }
    }
    return n;
  }
  // ★세그먼트 톤 변주 — 방위당 변주 3종만으로는 같은 스프라이트가 줄줄이 서면 '아코디언 벽'이 된다.
  //   시안 정본이 쓰던 2단 틴트를 그대로 옮긴다(오프스크린 1회 캐시 — 매 프레임 합성 아님).
  const _mtTint = new Map();
  function _mtTinted(name, v) {
    const k = name + v; const hit = _mtTint.get(k); if (hit) return hit;
    const im = MTX[name]; if (!im || !im.complete || !im.naturalWidth) return im;
    const t = document.createElement('canvas'); t.width = im.naturalWidth; t.height = im.naturalHeight;
    const tg = t.getContext('2d'); tg.drawImage(im, 0, 0);
    tg.globalCompositeOperation = 'source-atop';
    tg.fillStyle = v === 0 ? 'rgba(96,82,60,0.12)' : 'rgba(70,64,48,0.18)';
    tg.fillRect(0, 0, t.width, t.height);
    _mtTint.set(k, t); return t;
  }
  // ═══ 산이 나를 가리면 그 자리만 뚫는다 ═══════════════════════════════════════
  // ★★[재민 2026-08-07] *"산의 서쪽이나 북쪽에 있어서 화면에 가려질 때에는 산은 투명해져야 해"*
  //
  //   ⓐ **왜 생기나(실측)**: 플레이어 z 에는 `+500` 편향이 있어 **31셀 안쪽** 산은 이미
  //      플레이어 뒤로 간다. 문제는 그보다 **멀리 남동쪽**에 있는 큰 산이다 — 발치는 화면
  //      아래쪽에 있는데 몸통이 위로 2000px 넘게 뻗어 올라와 나를 덮는다.
  //      ⇒ 즉 "내가 산의 서/북쪽"일 때만 생긴다. 재민 관찰과 정확히 일치한다.
  //   ⓑ **왜 숨기지 않고 반투명인가**: 집 지붕은 '미표시'(좀보이드 문법)지만 재민 지시는 **반투명**이다.
  //      산이 통째로 사라지면 지형이 없어져 방향 감각이 깨진다 — 산은 남고 **뒤가 비친다**.
  //   ⓒ **판정은 상자가 아니라 알파로** 한다. 스프라이트 프레임의 86%는 투명 여백이라
  //      상자로 재면 "닿지도 않은 산"이 흐려진다(자명 통과 금지 — 반례가 실제로 존재한다).
  //   ⓓ 가리는 **한 장만** 반투명하다. 화면의 다른 산은 그대로다 — 그게 반례이자 판정이다.
  // ★★[통로 연출 2026-08-22] 가림 판정에 쓰는 **플레이어 z 편향**을 상수로 뺀다.
  //   재민 명세는 "앞에 가리면 투명"인데, 편향 500(=한 축 31셀)이 **가까운 앞 벽을
  //   가림 후보에서 통째로 빼** 버려 명세가 발동할 기회 자체가 없었다.
  //   ★정렬은 **안 건드린다**. 흐린 무리는 이미 _mtFlushFade 로 렌더 루프 **끝**에
  //     한 겹으로 덮이므로(플레이어보다 뒤), 판정만 열어 주면 "반투명 앞 벽 뒤의 사람"이 나온다.
  //     즉 z-순서 계약을 만질 필요가 없다 — 타 세션 지시 1항이 상정한 것보다 훨씬 작은 수술이다.
  //   ★플레이어가 사라질 수 없는 것도 구조가 보장한다: 흐린 겹은 알파 0.34 로 덮이고,
  //     안 흐린 앞 띠는 여전히 플레이어보다 **먼저** 그려진다.
  let MT_OCC_ZB = 500;                       // 0 이면 앞 벽 전부가 가림 후보(z 32 = 한 축 2셀)
  // ★★[재민 확정 2026-08-26 명세 변경] **"산괴 전체 흐림" 폐기.**
  //   흐리는 대상 = 플레이어보다 **화면 앞(z 큰)** 띠만. 뒤 띠는 불투명. 경계는 플레이어 행에서 가로로.
  //   ★발동 방아쇠(`_mtOccludesMe`, `_mtOcc.z` = 내 z + MT_OCC_ZB)는 **그대로 둔다** — 언제 켜지나는 안 바뀐다.
  //     바뀐 건 켜졌을 때 **누가 흐려지나**뿐이다.
  //   z 는 화면 픽셀과 같은 단위다(지면 z = (wx+wy)/2, 화면 y 와 1:1). 한 축 한 칸 = 16.
  // ② 실측으로 정한 값 — 후보 0(발치)/32(2셀)/64(4셀) 를 같은 자리에서 찍어 비교했다.
  //   셋은 그림이 거의 같았다(앞 띠 800/783/725, 뒤 띠 흐림 0장으로 동일). 경계가 캐릭터를
  //   반 가르지 않게 **발치보다 조금 위**를 고른다 — 스프라이트 키가 ~40px 이므로 32(2셀).
  let MT_FADE_ZOFF = 32;                     // 경계를 발치에서 위로 미는 양(화면 px = z)
  let MT_FADE_ZSOFT = 0;                     // 경계 그라데이션 폭(z=px). 0 = 딱 끊김
  // ★★[재민 2026-08-26] *"화면을 기준으로 자르는 거니까 경계선이 가로줄로 나와야 하는 거 아냐?"*
  //   맞는 지적이고, **z 문턱만으로는 안 나온다.** 흐림 판정이 **띠 단위**라서다:
  //   띠 하나는 z 가 하나지만 그 띠가 **칠하는 화소**는 지면 행보다 최대 h·32(35m ⇒ 1120px)
  //   위까지 퍼진다. 그래서 "z 로 자른 집합"의 화면 모양은 가로줄이 아니라 들쭉날쭉한 덩어리다.
  //   ⇒ 진짜 가로줄을 얻으려면 **화면에서 잘라야** 한다: 흐림 겹을 합성할 때
  //     플레이어 발치 행 **위는 α 0.34 · 아래는 α 1.0** 으로 두 번 나눠 그린다.
  //     겹침 누적이 없는 그룹 알파 성질은 그대로다(같은 오프스크린을 두 번 그릴 뿐).
  //   ★★[정정 2026-08-26] 재민이 옳았다 — 산은 z=0 평면에 앉아 있으니 화면과 평행한 평면으로
  //     자르면 **z=0 과의 교선이 경계로 반드시 생기고**, 그건 화면에서 곧은 가로줄이다.
  //     내가 "평면은 선으로 안 보인다"고 한 건 틀렸다(평면 자체와 **잘린 산의 경계**를 혼동했다).
  //     실제로 가로줄이 안 나온 건 기하 탓이 아니라 **흐림이 띠 단위**라서다 — 띠 한 장은
  //     통째로 흐리거나 통째로 안 흐린다.
  //   ★진짜 경계식: 화면y = s − 32h · 깊이 = s + 32h ⇒ **화면y = const − 64h**.
  //     h=0 에서 곧은 가로줄, 높이 1단위(32px)마다 64px 위로 굽는다.
  //     아래 CLIP 은 그 식의 **h=0 항만** 맞는 반쪽이다(위쪽까지 수평으로 잘라 버린다).
  //     그래서 기본은 **0(끔)**. 픽셀 단위 평면 절단은 재민 결정 후 별도로 붙인다.
  // ★★[재민 확정 2026-08-26] **픽셀 절단 v4 — 수직 평면.**
  //   "나를 가릴 수 있는 것(발자국이 내 앞)만 흐림, 뒤 산은 높이 무관 불투명."
  //   증명 한 줄: 산 조각이 내 스프라이트 화소에 오려면 화면y = s − 32h 가 내 화면y 와 같아야 하는데,
  //   발자국이 내 뒤(s < 내 s)면 h < 0 이어야 해서 **불가능하다**.
  //   덤: 화가 순서도 지면 s 로 정렬하므로 "명세는 깊이인데 순서는 지면 z"라는 어긋남이 소멸한다.
  let MT_FADE_CUT = 1;
  // 0 = 수직 평면(지면 깊이 s, 채택) · 1 = 화면 평행 평면(s+32h, 옛 v3 — 반례 장치)
  let MT_FADE_PLANE = 0;
  // ★[실측] 문턱 눈금 — 걸으면 문턱이 매 프레임 바뀌어 걸친 띠를 다 다시 만든다.
  //   v4 이동 중: 눈금 0 → 902.5±93.7ms · **8 → 41.3±4.0** · 24 → 37.2±2.2 (절단 끔 정지 16.92).
  let MT_FADE_CQ = 8;
  let _mtFadeZQ = null;                      // 눈금에 물린 문턱(히스테리시스용)
  let _mtSplitN = 0, _mtCutRenderN = 0, _mtCutBuiltN = 0, _mtCutFailN = 0;
  const _mtSplitSegs = [];
  let _mtFadeFlush = 0, _mtFadeSoftN = 0;
  let MT_FADE_CLIP = 0;                      // 1 = 화면 가로줄로 자른다 · 0 = 끔(기본)
  let MT_FADE_YOFF = 6;                      // 가로줄을 발치에서 **아래로** 미는 화면 px(몸통을 안 가르게)
  let _mtFadeLineY = null;                   // 이번 프레임의 가로줄 화면 y
  let _mtFadeZ = null;                       // 이번 프레임의 흐림 문턱(플레이어 z + 오프셋)
  const MT_OCC_A = 0.34, MT_FADE_MS = 220;   // 반투명 세기 · 켜고 끄는 시간(껌뻑임 방지)
  let _mtOcc = null, _mtOccN = 0, _mtFadedN = 0, _mtFadeAmt = 0, _mtToScr = null;   // 내 화면 좌표·z · 가린 장수 · 반투명 진행도
  const _mtAlphaMap = new Map();
  function _mtAlphaAt(name, u, v) {
    let m = _mtAlphaMap.get(name);
    if (!m) {
      const im = MTX[name]; if (!im || !im.complete || !im.naturalWidth) return 1;
      const N = 64, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
      const g2 = cv.getContext('2d'); g2.drawImage(im, 0, 0, N, N);
      const d = g2.getImageData(0, 0, N, N).data, a = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) a[i] = d[i * 4 + 3];
      m = { N, a }; _mtAlphaMap.set(name, m);
    }
    const ix = m.N - 1 < (u * m.N | 0) ? m.N - 1 : (u < 0 ? 0 : (u * m.N | 0));
    const iy = m.N - 1 < (v * m.N | 0) ? m.N - 1 : (v < 0 ? 0 : (v * m.N | 0));
    return m.a[iy * m.N + ix] / 255;
  }
  // ★[35m 판] 하네스가 "뒤쪽 산 상자"를 셀 좌표로 **추측**하고 있었다. 산이 9m 일 땐 맞았지만
  //   35m 면 앞쪽 띠가 앵커보다 1120px 위까지 그려서 그 상자를 덮는다 — 상자가 더는 뒤쪽 전용이 아니다.
  //   ⇒ 정본 그리기 경로가 **실제로 그린 사각형과 z** 를 그대로 내준다. 높이가 얼마든 안 틀린다.
  let _mt3Rects = null;
  window.__mt3Rects = (on) => { _mt3Rects = on ? [] : null; return !!_mt3Rects; };
  window.__mt3RectsGet = () => _mt3Rects;
  let _mtMaskCv = null, _mtMaskG = null, _mtStripCv = null, _mtStripG = null;
  const _mtCutHold = [];
  const _mtP = { draw: 0, blit: 0, strip: 0, rect: 0, n: 0, tri: 0, cvpx: 0, rows: 0 };
  window.__mtCutProf = (reset) => { const o = { ..._mtP }; if (reset) for (const k in _mtP) _mtP[k] = 0; return o; };
  // ★이 띠가 **흐림 대상인가** — 그리는 쪽·세는 쪽이 이 술어 하나를 쓴다(사본 금지).
  function _mtFadeSide(sg, z) {
    if (_mtFadeZ == null) return false;
    if (MT_FADE_CUT && sg && sg.dLo != null && sg.sLo != null && sg.rec)
      return (MT_FADE_PLANE ? sg.dHi : sg.sHi) > _mtFadeZ;
    return z > _mtFadeZ;
  }
  function _mtStraddle(sg) { return (MT_FADE_PLANE ? sg.dLo : sg.sLo) <= _mtFadeZ; }
  //   ★v4(수직 평면, K=32): 화소 판정은 s = 화면y + 32h > c.
  //     · 화면y > c ⇒ h ≥ 0 이므로 s ≥ 화면y > c ⇒ **전부 흐림**
  //     · 화면y < c − 32·hMax ⇒ s < c ⇒ **전부 불투명**  ⇒ 그 사이만 가리개. **위 = 불투명**.
  //   ★v3(화면 평행, K=64): 띠 안에서 d = 2s − y 라 경계 행이 [2sLo−c, 2sHi−c] 로 좁다.
  //     **위 = 흐림**(방향이 반대다 — 헷갈리기 쉬워 topSide 로 같이 낸다).
  function _mt3CutRows(sg, c) {
    const R = sg.rec;
    if (MT_FADE_PLANE) {
      const rT = Math.max(0, Math.min(R.bh, Math.floor(2 * sg.sLo - c - R.y0)));
      const rB = Math.max(rT, Math.min(R.bh, Math.ceil(2 * sg.sHi - c - R.y0)));
      return [rT, rB, -1];
    }
    const rT = Math.max(0, Math.min(R.bh, Math.floor(c - 32 * (sg.hHi || 0) - R.y0)));
    const rB = Math.max(rT, Math.min(R.bh, Math.ceil(c - R.y0) + 1));
    return [rT, rB, 1];
  }
  // ── 가리개 한 판 ──────────────────────────────────────────────────────
  //   ★셀을 **띠 순서대로 이어 붙여 한 번에** 그린다. 블렌딩이 없어 나중 조각이 덮으므로
  //     여러 번 부른 것과 같은 '맨 위 조각' 결과가 나온다(병합 청크는 cuts 가 0 이라 순서 문제도 없다).
  function _mt3CutMask(sg, c, rT, rB, cL, cR) {
    const R = sg.rec;
    if (!R || !MT3_GL || !_mt3GlInit()) return null;
    if (!_mtMaskCv) { _mtMaskCv = document.createElement('canvas'); _mtMaskCv.width = _mtMaskCv.height = 128; }
    if (_mtMaskCv.width < R.bw || _mtMaskCv.height < R.bh) {
      _mtMaskCv.width = Math.max(_mtMaskCv.width, Math.ceil(R.bw / 128) * 128);
      _mtMaskCv.height = Math.max(_mtMaskCv.height, Math.ceil(R.bh / 128) * 128);
      _mtMaskG = null;
    }
    if (!_mtMaskG) _mtMaskG = _mtMaskCv.getContext('2d');
    const g2 = _mtMaskG;
    g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalAlpha = 1; g2.globalCompositeOperation = 'source-over';
    let cells = R.bands[0].cells, cuts = R.bands[0].cuts;
    if (R.bands.length > 1) {
      cells = []; cuts = [];
      for (const b of R.bands) { for (const q of b.cells) cells.push(q); for (const q of b.cuts) cuts.push(q); }
    }
    if (!R.mcache) R.mcache = {};
    try { if (!_mt3GlBand(g2, R.F, R.key, cells, cuts, R.x0, R.y0, R.bw, R.bh, null,
                          { c, side: 2, rows: [rT, rB], cols: [cL, cR], cache: R.mcache })) return null; }
    catch (e) { return null; }
    return _mtMaskCv;
  }
  // 띠 하나를 (side) 쪽만 목표 문맥에 그린다. **프레임도 판정기도 이 함수 하나를 쓴다**(사본 금지).
  function _mt3CutBlit(sg, c, side, g2, dx, dy, rows, mask, cols) {
    const R = sg.rec, W = R.bw, Hh = R.bh;
    const rr = rows || _mt3CutRows(sg, c);
    const rT = rr[0], rB = rr[1], top = rr[2];
    const cL = cols ? cols[0] : 0, cR = cols ? cols[1] : W;
    if (side === top && rT > 0) g2.drawImage(sg.img, 0, 0, W, rT, dx, dy, W, rT);
    if (side === -top && rB < Hh) g2.drawImage(sg.img, 0, rB, W, Hh - rB, dx, dy + rB, W, Hh - rB);
    if (rB <= rT || cR <= cL) return true;
    const _t0 = performance.now();
    const M = mask || _mt3CutMask(sg, c, rT, rB, cL, cR); if (!M) return false;
    const SW = cR - cL, SH = rB - rT;
    if (!_mtStripCv) { _mtStripCv = document.createElement('canvas'); _mtStripCv.width = _mtStripCv.height = 128; }
    if (_mtStripCv.width < SW || _mtStripCv.height < SH) {
      _mtStripCv.width = Math.max(_mtStripCv.width, Math.ceil(SW / 128) * 128);
      _mtStripCv.height = Math.max(_mtStripCv.height, Math.ceil(SH / 128) * 128);
      _mtStripG = null;
    }
    if (!_mtStripG) _mtStripG = _mtStripCv.getContext('2d');
    const T = _mtStripG;
    T.setTransform(1, 0, 0, 1, 0, 0); T.globalAlpha = 1; T.globalCompositeOperation = 'source-over';
    T.clearRect(0, 0, SW, SH);
    T.drawImage(sg.img, cL, rT, SW, SH, 0, 0, SW, SH);
    T.globalCompositeOperation = side > 0 ? 'destination-in' : 'destination-out';
    T.drawImage(M, cL, rT, SW, SH, 0, 0, SW, SH);
    T.globalCompositeOperation = 'source-over';
    g2.drawImage(_mtStripCv, 0, 0, SW, SH, dx + cL, dy + rT, SW, SH);
    _mtP.strip += performance.now() - _t0; _mtP.rows += SH;
    return true;
  }
  function _mt3CutSide(sg, c, side, g2, full) {
    const R = sg.rec;
    g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalAlpha = 1; g2.globalCompositeOperation = 'source-over';
    g2.clearRect(0, 0, R.bw, R.bh);
    return _mt3CutBlit(sg, c, side, g2, 0, 0, full ? [0, R.bh, _mt3CutRows(sg, c)[2]] : null);
  }
  // 걸친 띠 — 되그리기 없이 **바로** 두 쪽에 그린다.
  function _mt3CutDraw(sg, c, gMain, gFade, dx, dy, canvasH) {
    const R = sg.rec;
    if (!R || !MT3_GL || !_mt3GlInit()) return false;
    let [rT, rB, top] = _mt3CutRows(sg, c);
    // ★경계 구간은 **카메라와 무관하게** 잡는다(pb 기준) — 화면으로 자르면 걸을 때마다 캐시가 깨진다.
    let cL = 0, cR = R.bw;
    if (sg.pb) { cL = sg.pb[0]; cR = sg.pb[2] + 1;
                 rT = Math.max(rT, sg.pb[1]); rB = Math.min(rB, sg.pb[3] + 1);
                 if (cR < cL) cR = cL; if (rB < rT) rB = rT; }
    const vT = Math.max(0, -dy), vB = Math.min(R.bh, canvasH - dy);
    if (rB <= vT) { rT = rB = vT; } else if (rT >= vB) { rT = rB = vB; }
    const cols = [cL, cR];
    const SW = cR - cL, SH = rB - rT, need = SH > 0 && SW > 0;
    const hit = need && sg._cs && sg._cs.c === c && sg._cs.rT === rT && sg._cs.rB === rB &&
                sg._cs.cL === cL && sg._cs.cR === cR && sg._cs.pl === MT_FADE_PLANE;
    let M = null;
    if (need && !hit) { M = _mt3CutMask(sg, c, rT, rB, cL, cR); if (!M) return false; }
    if (top === 1 && rT > 0) gMain.drawImage(sg.img, 0, 0, R.bw, rT, dx, dy, R.bw, rT);
    if (top === -1 && rB < R.bh) gMain.drawImage(sg.img, 0, rB, R.bw, R.bh - rB, dx, dy + rB, R.bw, R.bh - rB);
    if (need) {
      if (hit) gMain.drawImage(sg._cs.cv, 0, 0, SW, SH, dx + cL, dy + rT, SW, SH);
      else if (!_mt3CutBlit(sg, c, 1, gMain, dx, dy, [rT, rB, top], M, cols)) return false;
    }
    if (top === -1 && rT > 0) gFade.drawImage(sg.img, 0, 0, R.bw, rT, dx, dy, R.bw, rT);
    if (top === 1 && rB < R.bh) gFade.drawImage(sg.img, 0, rB, R.bw, R.bh - rB, dx, dy + rB, R.bw, R.bh - rB);
    if (need) {
      // 흐림 쪽 = 원본 − A. **A 자리를 파내면 그 아래 먼저 그린 흐림 띠도 지워진다 — 그게 맞다**
      // (A 는 본 캔버스에 불투명으로 서 있고 화가 순서상 이 띠가 그것들보다 앞이다).
      gFade.drawImage(sg.img, cL, rT, SW, SH, dx + cL, dy + rT, SW, SH);
      gFade.globalCompositeOperation = 'destination-out';
      gFade.drawImage(hit ? sg._cs.cv : _mtStripCv, 0, 0, SW, SH, dx + cL, dy + rT, SW, SH);
      gFade.globalCompositeOperation = 'source-over';
    }
    if (need && !hit) {
      _mtCutBuiltN++;
      if (!sg._cs) {
        _mtCutHold.push(sg);
        if (_mtCutHold.length > 64) for (const q of _mtCutHold.splice(0, _mtCutHold.length - 48)) {
          q._cs = null; if (q.rec) q.rec.mcache = null; }
      }
      if (!sg._cs || !sg._cs.cv || sg._cs.cv.width < SW || sg._cs.cv.height < SH) {
        const q = document.createElement('canvas'); q.width = SW; q.height = SH;
        sg._cs = { cv: q, g: q.getContext('2d') };
      }
      const G2 = sg._cs.g;
      G2.setTransform(1, 0, 0, 1, 0, 0); G2.globalAlpha = 1; G2.globalCompositeOperation = 'copy';
      G2.drawImage(_mtStripCv, 0, 0, SW, SH, 0, 0, SW, SH);
      G2.globalCompositeOperation = 'source-over';
      sg._cs.c = c; sg._cs.rT = rT; sg._cs.rB = rB; sg._cs.cL = cL; sg._cs.cR = cR; sg._cs.pl = MT_FADE_PLANE;
    }
    _mtCutRenderN++;
    return true;
  }
  window.__mtCutN = () => ({ cut: MT_FADE_CUT, cq: MT_FADE_CQ, plane: MT_FADE_PLANE, split: _mtSplitN,
                             rendered: _mtCutRenderN, built: _mtCutBuiltN, fail: _mtCutFailN,
                             hold: _mtCutHold.length });
  window.__mtFadeCut = (v) => { MT_FADE_CUT = v ? 1 : 0; needsRedraw = true; return MT_FADE_CUT; };
  window.__mtFadeCQ = (v) => { MT_FADE_CQ = Math.max(0, +v || 0); _mtFadeZQ = null; needsRedraw = true; return MT_FADE_CQ; };
  window.__mtFadePlane = (v) => { MT_FADE_PLANE = v ? 1 : 0;
    for (const q of _mtCutHold) { q._cs = null; }
    needsRedraw = true; return MT_FADE_PLANE; };
  window.__mtCutList = () => _mtSplitSegs.map((e, i) => ({ i, dx: e.dx, dy: e.dy, z: e.z,
    dLo: +e.sg.dLo.toFixed(1), dHi: +e.sg.dHi.toFixed(1),
    sLo: +e.sg.sLo.toFixed(1), sHi: +e.sg.sHi.toFixed(1), hHi: +(e.sg.hHi || 0).toFixed(2),
    bw: e.sg.rec.bw, bh: e.sg.rec.bh, merged: e.sg.merged ? 1 : 0, bands: e.sg.rec.bands.length }));
  // ── 판정기 — 걸친 띠를 **픽셀로 되짚는다** ──────────────────────────────
  //   ★사본 금지: 높이는 굽는 쪽이 쓰는 **정본 F.corS** 를 그 화소의 매개변수에서 다시 부른다.
  function _mtCutDbgW(sg, which, cc) {
    const R = sg.rec; if (!R || !_mt3GlInit()) return null;
    const cv = document.createElement('canvas'); cv.width = R.bw; cv.height = R.bh;
    const g2 = cv.getContext('2d', { willReadFrequently: true });
    for (const b of R.bands)
      _mt3GlBand(g2, R.F, R.key, b.cells, b.cuts, R.x0, R.y0, R.bw, R.bh, b.clip, { dbgW: which, c: cc });
    return g2.getImageData(0, 0, R.bw, R.bh);
  }
  //   ★굽는 쪽은 지우개를 안 쓴다 — 재현도 그대로 한다.
  //   ★★첫 호출이 나무 가장자리 알파에서 몇 화소 어긋난다(워밍업). 그래서 판정기는 **두 번 그려
  //     서로 비교한 값(재현 바닥)** 을 같이 낸다 — 바닥이 0 이어야 원본과의 차를 그대로 읽는다.
  function _mtCutReRender(sg) {
    const R = sg.rec; if (!R || !_mt3GlInit()) return null;
    const cv = document.createElement('canvas'); cv.width = R.bw; cv.height = R.bh;
    const g2 = cv.getContext('2d', { willReadFrequently: true });
    for (const b of R.bands) {
      _mt3GlBand(g2, R.F, R.key, b.cells, b.cuts, R.x0, R.y0, R.bw, R.bh, b.clip, null);
      for (const t of b.trees) { g2.globalAlpha = 0.92; g2.drawImage(t.im, t.x, t.y, t.w, t.h); g2.globalAlpha = 1; }
    }
    return g2.getImageData(0, 0, R.bw, R.bh);
  }
  window.__mtCutProbe = (idx, opt) => {
    const E = _mtSplitSegs[idx | 0]; if (!E) return null;
    const sg = E.sg, R = sg.rec, c = E.c;
    if (!R || c == null) return null;
    const o = opt || {}, hGnd = o.hGnd != null ? o.hGnd : 0.012, maxS = o.maxS != null ? o.maxS : 40;
    const cP = o.c != null ? +o.c : c;                       // 반례용 — 일부러 틀린 문턱
    const KK = (window.__mtOccDbg && window.__mtOccDbg.plane) ? 64 : 32;   // 지금 쓰는 절단면의 계수
    const gWin = KK * hGnd + 0.5;                            // 지면 창에서 공차를 **유도한다**
    const W = R.bw, H = R.bh;
    const mk = () => { const q = document.createElement('canvas'); q.width = W; q.height = H;
                       return q.getContext('2d', { willReadFrequently: true }); };
    const ctxA = mk(), ctxB = mk();
    if (!_mt3CutSide(sg, c, 1, ctxA) || !_mt3CutSide(sg, c, -1, ctxB)) return null;
    const A = ctxA.getImageData(0, 0, W, H).data, B = ctxB.getImageData(0, 0, W, H).data;
    // ★행 구간 지름길이 **전 화소 가리개**와 같은 그림인지 — 최적화가 그림을 바꾸면 여기서 걸린다.
    let abDiff = -1;
    if (o.fresh !== 0) {
      const fA = mk(), fB = mk(); abDiff = 0;
      _mt3CutSide(sg, c, 1, fA, 1); _mt3CutSide(sg, c, -1, fB, 1);
      const da = fA.getImageData(0, 0, W, H).data, db = fB.getImageData(0, 0, W, H).data;
      for (let q = 3; q < da.length; q += 4)
        if ((da[q] > 8) !== (A[q] > 8) || (db[q] > 8) !== (B[q] > 8)) abDiff++;
    }
    const O = (sg.img.getContext('2d')).getImageData(0, 0, W, H).data;
    const wx = _mtCutDbgW(sg, 1), wy = _mtCutDbgW(sg, 2);
    if (!wx || !wy) return null;
    let reDiff = -1, reSelf = -1, RE = null;
    if (o.fresh !== 0) {
      const R2 = _mtCutReRender(sg), R1 = _mtCutReRender(sg);
      if (R1 && R2) { reSelf = 0; for (let q = 3; q < R1.data.length; q += 4)
        if ((R1.data[q] > 8) !== (R2.data[q] > 8)) reSelf++; }
      RE = R1;
      if (RE) { reDiff = 0; for (let q = 3; q < RE.data.length; q += 4)
        if ((RE.data[q] > 8) !== (O[q] > 8)) reDiff++; }
    }
    const dec = (d, i) => ((d[i] * 255 + d[i + 1]) / 255) / 255 * 72 - 4;   // 16비트 → 셀 [-4,68]
    const hAt = new Float32Array(W * H), hOk = new Uint8Array(W * H);
    let cov = 0, onlyA = 0, onlyB = 0, both = 0, none = 0;
    let pred = 0, bad = 0, badFar = 0, maxErr = 0, wall = 0, bothOK = 0, bothBad = 0;
    let gA = -1e9, gB = 1e9, gN = 0, gAn = 0, gBn = 0, gStrict = 0, gStrictBad = 0, gNear = 0;
    let hMin = 1e9, hMax = -1e9, bn = 0;
    const EH = new Int32Array(34), side = new Int8Array(W * H), BP = [], oddS = [], samples = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const oa = O[i + 3] > 8, aa = A[i + 3] > 8, ba = B[i + 3] > 8;
      if (oa) { cov++;
        if (aa && ba) { both++;
          // 겹친 화소: 합성이 A(불투명) → B(흐림) 순이라 **B 가 맨 위**여야 순서가 맞다.
          const dA = Math.abs(A[i]-O[i]) + Math.abs(A[i+1]-O[i+1]) + Math.abs(A[i+2]-O[i+2]);
          const dB = Math.abs(B[i]-O[i]) + Math.abs(B[i+1]-O[i+1]) + Math.abs(B[i+2]-O[i+2]);
          if (dB <= dA) bothOK++; else bothBad++;
          if (oddS.length < 12) oddS.push({ k: 'both', x, y, o: O[i+3], a: A[i+3], b: B[i+3] }); }
        else if (aa) onlyA++; else if (ba) onlyB++;
        else { none++; if (oddS.length < 12) oddS.push({ k: 'none', x, y, o: O[i+3],
                 m: wx.data[i+2], re: RE ? RE.data[i+3] : -1 }); } }
      if (!aa && !ba) continue;
      side[y * W + x] = (aa && !ba) ? 1 : ((ba && !aa) ? -1 : 0);
      if (wx.data[i + 3] < 8) continue;
      // ★표면(vM=0)만 되짚는다. 갱 옆면·바닥은 vC 의 뜻이 셀 좌표가 아니라 못 읽는다 — 수를 낸다.
      if (Math.round(wx.data[i + 2] / 255 * 8 - 1) !== 0) { wall++; continue; }
      const cu = dec(wx.data, i), cvv = dec(wy.data, i);
      const h = R.F.corS(cu, cvv);                            // ★정본 함수 그대로
      if (h < hMin) hMin = h; if (h > hMax) hMax = h;
      const d = (R.y0 + y + 0.5) + KK * h;                    // v4: s = 화면y + 32h
      const want = d <= cP ? 1 : -1, got = side[y * W + x];
      if (!got) continue;
      pred++;
      const err = Math.abs(d - cP);
      if (got !== want) { bad++; if (err > 1) { badFar++; if (err > maxErr) maxErr = err;
        if (samples.length < maxS) samples.push({ x, y, sy: R.y0 + y, h: +h.toFixed(3),
                                                  d: +d.toFixed(2), err: +err.toFixed(2), want, got }); } }
      hAt[y * W + x] = h; hOk[y * W + x] = 1;
      if (Math.abs(h) < hGnd) {                               // ── 지면 구간(|h|≈0) ──
        const sy = R.y0 + y + 0.5; gN++;
        if (got === 1) { gAn++; if (R.y0 + y > gA) gA = R.y0 + y; }
        if (got === -1) { gBn++; if (R.y0 + y < gB) gB = R.y0 + y; }
        if (Math.abs(sy - cP) <= gWin) gNear++;
        else { gStrict++; if ((sy <= cP ? 1 : -1) !== got) gStrictBad++; }
      }
    }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const k = y * W + x, sv = side[k];
      if (!sv || !hOk[k]) continue;
      // ★**같은 곡면** 위의 경계만 센다(띠 실루엣은 절단 경계가 아니다).
      let adj = false;
      for (const q of [k - 1, k + 1, k - W, k + W])
        if (side[q] === -sv && hOk[q] && Math.abs(hAt[q] - hAt[k]) < 0.25) { adj = true; break; }
      if (!adj) continue;
      const h = hAt[k], sy = R.y0 + y + 0.5;
      bn++;
      EH[Math.min(33, Math.floor(Math.abs(sy + KK * h - cP) / 0.25))]++;
      // ★경계 화소의 (h, 화면y−c) 를 **날것으로** 낸다 — 계수를 밖에서 갈아 끼워 볼 수 있게.
      if (BP.length < 40000) { BP.push(+h.toFixed(4)); BP.push(+(sy - c).toFixed(3)); }
    }
    return { idx: idx | 0, c, cP, K: KK, x0: R.x0, y0: R.y0, bw: W, bh: H, dx: E.dx, dy: E.dy,
             sLo: +sg.sLo.toFixed(2), sHi: +sg.sHi.toFixed(2), bands: R.bands.length,
             cov, onlyA, onlyB, both, bothOK, bothBad, none, pred, bad, badFar,
             maxErr: +maxErr.toFixed(2), samples, wall, oddS, BP, bn,
             hMin: hMin < 1e9 ? +hMin.toFixed(3) : null, hMax: hMax > -1e9 ? +hMax.toFixed(3) : null,
             gN, gAn, gBn, gStrict, gStrictBad, gNear, hGnd, gWin: +gWin.toFixed(2),
             reDiff, reSelf, abDiff,
             gMaxA: gN && gA > -1e9 ? gA : null, gMinB: gN && gB < 1e9 ? gB : null };
  };
  function _mtDraw(g, item, toScr) {
    const sg = item.sg;
    if (sg.mt3) {                       // ★3D 띠 — 구운 캔버스를 앵커로 꽂는다
      _mtToScr = toScr;
      const p3 = w2i(sg.x, sg.y), c3 = toScr(p3.x, p3.y);
      const dx3 = Math.round(c3.x - sg.ox), dy3 = Math.round(c3.y - sg.oy);
      // ── 3분류 ─────────────────────────────────────────────────────────
      //   v4 는 **지면 깊이 s**: sLo > c 통째 흐림 · sHi ≤ c 통째 불투명 · 걸친 띠만 화소로 가른다.
      const onFade = _mtFadeAmt > 0.002 && _mtFadeZ != null && !_t19.occOff;
      const cutOK = onFade && MT_FADE_CUT && sg.dLo != null && sg.sLo != null && sg.rec;
      const fade3 = onFade && _mtFadeSide(sg, item.z);
      let split3 = (cutOK && fade3 && _mtStraddle(sg)) ? 1 : 0;
      // ★fz 를 **그 프레임 값으로** 같이 적는다 — 여러 프레임을 모아 보는 하네스가
      //   마지막 문턱으로 전 프레임을 재면 걷는 동안 분류가 어긋난다(실측: 429 중 99만 split).
      if (_mt3Rects) _mt3Rects.push({ x: dx3, y: dy3, w: sg.img.width, h: sg.img.height, z: item.z,
                                      faded: !!fade3, merged: sg.merged ? 1 : 0, split: split3, fz: _mtFadeZ,
                                      dLo: sg.dLo != null ? sg.dLo : null, dHi: sg.dHi != null ? sg.dHi : null,
                                      sLo: sg.sLo != null ? sg.sLo : null, sHi: sg.sHi != null ? sg.sHi : null });
      // ★[되돌림 — 실측] blit 을 '칠해지는 사각형'으로 좁혀 봤다. 넓이는 17% 줄었는데
      //   프레임은 **더 느려졌다**(산 비용 +20.13 → +29.67ms). 9인자 drawImage 가
      //   빠른 경로를 놓치는 값이 17% 이득보다 컸다. 좁히지 않는다.
      if (!fade3) { g.drawImage(sg.img, dx3, dy3); return; }
      _mtFadedN++; if (window.__mtOccDbg) window.__mtOccDbg.faded = _mtFadedN;
      const fg3 = _mtFadeLayer(g);
      if (!fg3) { g.save(); g.globalAlpha = 1 - (1 - MT_OCC_A) * _mtFadeAmt; g.drawImage(sg.img, dx3, dy3); g.restore(); return; }
      // ★걸친 띠: 발자국이 내 뒤인 쪽은 **본 캔버스에 불투명**, 앞인 쪽만 흐림 겹에.
      if (split3) {
        if (_mt3CutDraw(sg, _mtFadeZ, g, fg3, dx3, dy3, g.canvas.height)) {
          _mtSplitN++; _mtSplitSegs.push({ sg, dx: dx3, dy: dy3, z: item.z, c: _mtFadeZ });
          return;
        }
        _mtCutFailN++;
        // 가리개를 못 만들면 **통째 흐림**으로 떨어진다(구멍보다 낫다)
      }
      // ★경계 그라데이션(A/B) — 문턱 바로 앞 MT_FADE_ZSOFT 안의 띠는 **교차 페이드**한다.
      //   t=0(문턱) → 불투명 그대로 · t=1(창 끝) → 완전히 흐림 무리로. 0 이면 옛날처럼 딱 끊긴다.
      if (MT_FADE_ZSOFT > 0 && !split3) {
        const t = Math.min(1, (item.z - _mtFadeZ) / MT_FADE_ZSOFT);
        if (t < 1) {
          _mtFadeSoftN++;
          g.save(); g.globalAlpha = 1 - t; g.drawImage(sg.img, dx3, dy3); g.restore();
          fg3.save(); fg3.globalAlpha = t; fg3.drawImage(sg.img, dx3, dy3); fg3.restore();
          return;
        }
      }
      fg3.drawImage(sg.img, dx3, dy3);
      return;
    }
    const an = _mtAnchors[sg.name], im0 = MTX[sg.name];
    if (!an || !im0 || !im0.complete) return;
    const im = _mtTinted(sg.name, _cellHash(Math.round(sg.x), Math.round(sg.y), 91) < 0.5 ? 0 : 1);
    const sc = (64 / Math.SQRT2) / an.ppu * sg.sc, vy = sg.vy || 1;
    _mtToScr = toScr;
    const p = w2i(sg.x + (sg.jx || 0), sg.y + (sg.jy || 0)), c = toScr(p.x, p.y);
    // 높이 지터는 **앵커(발치) 고정, 세로만 배율** — 능선 스카이라인이 출렁이게(시안 정본과 동일)
    const W = im0.naturalWidth * sc, H = im0.naturalHeight * sc * vy;
    const dx = c.x - an.ox * sc, dy = c.y - an.oy * sc * vy;
    // ★★[재민 2026-08-07 2차 정정] *"사실상 화면 전체 산이 다 반투명해져야 한다는 거야..
    //   산에 어느 정도 가까이 가면.. 캐릭터가 가려지기 시작할 쯤부터.. 물론 북서쪽에 있을 때만"*
    //   ⇒ **한 장이 아니라 앞쪽(내 남동) 산 전부**가 같이 흐려진다. 한 장만 흐려지면
    //     그 산만 유리처럼 보이고 나머지가 여전히 나를 가린다 — 문제가 안 풀린다.
    //   ⇒ 방아쇠는 "가려지기 시작할 때"다: 이번 프레임에 나를 실제로 덮는 산이 하나라도 있으면 켠다.
    //   ⇒ **북서쪽에 있을 때만**: 내 뒤(z 작은 쪽) 산은 애초에 나를 못 가리므로 손대지 않는다.
    const behind = _mtFadeZ != null ? item.z > _mtFadeZ : false;   // ★명세 변경: 흐림 대상은 **플레이어 앞**만
    const fade = _mtFadeAmt > 0.002 && behind && !_t19.occOff;
    if (!fade) { g.drawImage(im, dx, dy, W, H); return; }
    // ★★반투명은 **한 겹으로 모아** 한 번만 합성한다 [2026-08-07 실측].
    //   장마다 알파를 걸면 겹칠수록 다시 불투명해진다 — 0.34 를 3겹 쌓으면 71% 다.
    //   실측에서 앞쪽 산 128장이 흐려졌는데도 내 자리는 78% 나 남아 있었다(기대치 34%).
    //   오프스크린에 **불투명으로 다 그린 뒤** 그 레이어를 알파로 한 번 덮으면 겹침이 안 쌓인다.
    //   ⚠대가: 흐린 무리 사이에 낀 개체는 무리 뒤로 간다. 그 개체들은 어차피 산에 가려 있고
    //     전부 내 앞(남동)이라 실害가 없다 — 나중에 문제가 되면 그때 z 를 쪼갠다.
    _mtFadedN++; if (window.__mtOccDbg) window.__mtOccDbg.faded = _mtFadedN;
    const fg = _mtFadeLayer(g);
    if (!fg) { g.save(); g.globalAlpha = 1 - (1 - MT_OCC_A) * _mtFadeAmt; g.drawImage(im, dx, dy, W, H); g.restore(); return; }
    fg.drawImage(im, dx, dy, W, H);
    return;
  }
  // 이 산 한 장이 나를 실제로 덮는가 — 스캔과 그리기가 **같은 식**을 쓴다(사본 금지)
  function _mtOccludesMe(sg, z) {
    if (!_mtOcc || z <= _mtOcc.z) return false;
    if (sg.mt3) {
      // 구운 캔버스의 **실제 알파**를 읽는다. 상자로 재면 투명 여백에 선 자리를 잘못 잡는다.
      const p3 = w2i(sg.x, sg.y), c3 = _mtToScr ? _mtToScr(p3.x, p3.y) : null; if (!c3) return false;
      const ux = Math.round(_mtOcc.x - (c3.x - sg.ox)), uy = Math.round(_mtOcc.y - (c3.y - sg.oy));
      if (ux < 0 || uy < 0 || ux >= sg.img.width || uy >= sg.img.height) return false;
      try { return sg.img.getContext('2d').getImageData(ux, uy, 1, 1).data[3] > 90; } catch (e) { return true; }
    }
    const an = _mtAnchors[sg.name], im0 = MTX[sg.name];
    if (!an || !im0 || !im0.complete || !im0.naturalWidth) return false;
    const sc = (64 / Math.SQRT2) / an.ppu * sg.sc, vy = sg.vy || 1;
    const W = im0.naturalWidth * sc, H = im0.naturalHeight * sc * vy;
    const p = w2i(sg.x + (sg.jx || 0), sg.y + (sg.jy || 0));
    const c = _mtToScr ? _mtToScr(p.x, p.y) : null; if (!c) return false;
    const dx = c.x - an.ox * sc, dy = c.y - an.oy * sc * vy;
    const u = (_mtOcc.x - dx) / W, v = (_mtOcc.y - dy) / H;
    if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return false;
    // ★상자가 아니라 알파로 — 프레임의 86%가 투명 여백이라 상자로 재면 안 닿은 산도 걸린다
    return _mtAlphaAt(sg.name, u, v) > 0.35;
  }
  // 프레임당 1회 — 나를 덮는 산이 하나라도 있나. 있으면 앞쪽 산 **전부**를 흐린다.
  // ★튀지 않게 시간으로 완만히 켜고 끈다(경계에서 껌뻑이면 그게 더 거슬린다).
  // 흐린 산을 모으는 오프스크린 — 화면 크기, 프레임당 1회 비움
  let _mtFadeCv = null, _mtFadeG = null, _mtFadeUsed = false;
  function _mtFadeLayer(g) {
    const cv = g.canvas; if (!cv) return null;
    if (!_mtFadeCv) { _mtFadeCv = document.createElement('canvas'); }
    if (_mtFadeCv.width !== cv.width || _mtFadeCv.height !== cv.height) {
      _mtFadeCv.width = cv.width; _mtFadeCv.height = cv.height; _mtFadeG = null;
    }
    if (!_mtFadeG) _mtFadeG = _mtFadeCv.getContext('2d');
    if (!_mtFadeUsed) {
      _mtFadeUsed = true;
      _mtFadeG.setTransform(1, 0, 0, 1, 0, 0);
      _mtFadeG.clearRect(0, 0, _mtFadeCv.width, _mtFadeCv.height);
      _mtFadeG.setTransform(g.getTransform());
    }
    return _mtFadeG;
  }
  function _mtFlushFade(g) {
    if (!_mtFadeUsed || !_mtFadeCv) return;
    _mtFadeUsed = false; _mtFadeFlush++;
    const aFade = 1 - (1 - MT_OCC_A) * _mtFadeAmt;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (MT_FADE_CLIP && _mtFadeLineY != null) {
      // ★화면 가로줄로 자른다 — 줄 **위**는 반투명(플레이어가 비친다), **아래**는 불투명.
      //   같은 오프스크린을 두 번 그리므로 겹침 누적은 여전히 없다(그룹 알파 성질 유지).
      const H = _mtFadeCv.height, W = _mtFadeCv.width;
      const ly = Math.max(0, Math.min(H, Math.round(_mtFadeLineY)));
      if (ly > 0) {                                   // 위 — 반투명
        g.save(); g.beginPath(); g.rect(0, 0, W, ly); g.clip();
        g.globalAlpha = aFade; g.drawImage(_mtFadeCv, 0, 0); g.restore();
      }
      if (ly < H) {                                   // 아래 — 불투명
        g.save(); g.beginPath(); g.rect(0, ly, W, H - ly); g.clip();
        g.globalAlpha = 1; g.drawImage(_mtFadeCv, 0, 0); g.restore();
      }
    } else {
      g.globalAlpha = aFade;
      g.drawImage(_mtFadeCv, 0, 0);
    }
    g.restore();
  }
  let _mtFadeT = 0;
  function _mtFadeDt() {                     // ★시계는 프레임에서 온다 — Math.random 도, 고정 상수도 아니다
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    const dt = _mtFadeT ? Math.min(120, now - _mtFadeT) : 16;
    _mtFadeT = now; return dt;
  }
  // ── 프레임 **단계별** 화소 계측기 ────────────────────────────────────────
  //   "띠는 칠했는데 화면은 다르다"를 스크린샷 대조로 풀면 프레임이 어긋난다.
  //   같은 프레임 안에서 여러 단계의 **같은 점**을 읽어야 '누가 덮었나'가 좁혀진다.
  //   ★사본 금지 — 정본 ctx 를 그 자리에서 읽는다(별도 캔버스 재현 아님).
  let _mtStagePts = null, _mtStageLog = null;
  function _mtStage(g, tag) {
    if (!_mtStagePts) return;
    const row = { s: tag, px: [] };
    for (const q of _mtStagePts) {
      try { const d = g.getImageData(q[0], q[1], 1, 1).data; row.px.push([d[0], d[1], d[2], d[3]]); }
      catch (e) { row.px.push(null); }
    }
    _mtStageLog.push(row);
  }
  let _mtLastRend = null;
  function _mtUpdateFade(renderables, dtMs) {
    _mtLastRend = renderables;
    let hit = 0;
    if (_mtOcc && !_t19.occOff) {
      for (let i = 0; i < renderables.length; i++) {
        const it = renderables[i];
        if (it.kind !== 'mtseg') continue;
        if (_mtOccludesMe(it.sg, it.z)) { hit++; break; }
      }
      let fr = 0;
      for (let i = 0; i < renderables.length; i++) {
        const it = renderables[i];
        if (it.kind === 'mtseg' && _mtFadeSide(it.sg, it.z)) fr++;   // ★'앞' = 정본 술어 그대로
      }
      if (window.__mtOccDbg) window.__mtOccDbg.front = fr;
    }
    _mtOccN = hit;
    if (window.__mtOccDbg) { window.__mtOccDbg.n = hit; window.__mtOccDbg.fade = +_mtFadeAmt.toFixed(2); }
    const step = Math.min(1, Math.max(0, dtMs) / MT_FADE_MS);
    _mtFadeAmt += ((hit ? 1 : 0) - _mtFadeAmt) * step;
    if (_mtFadeAmt < 0.002) _mtFadeAmt = 0;
    if (_mtFadeAmt > 0.998) _mtFadeAmt = 1;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 21 실장] 자연물 산포 — 물가 술(fringe) · 초원 소품(들꽃·풀숲)
  //
  //   ⓐ **왜 술인가**: 지면 질감이 물가에서 수직으로 잘려 '절단선'이 보인다(재민 지적).
  //      술은 그 선 위로 넘어와 경계를 흐트러뜨리는 게 존재 이유다 — 그래서 **물 위로 민다**.
  //   ⓑ **균일 간격 금지**(재민: 시안의 변 전체 균일 밀식 = "일부러 심은 느낌"):
  //      · 밀도 저주파 변주 — 파장 5셀의 값 노이즈. 문턱 아래 구간은 **아예 0**(빈 물가)이다.
  //      · 물가 안쪽 1~2셀 감쇠 산포 — 물가 '선'에만 몰리면 목걸이가 된다.
  //      · 포기별 크기·높이 변주 + 종(풀포기/갈대/부들) 혼합. 전부 자리 해시(Math.random 금지).
  //   ⓒ **갈대·부들은 고증의 본체**(송국리 저습지) — 물과 맞닿은 셀의 '빽빽한' 구간에만 선다.
  //   ⓓ **그리는 순서 = 계약**: 물 셰이더 → `_drawPrisms` → **여기** → 안개 마스크.
  //      renderables 에 태워 엔티티와 함께 z 정렬한다(배치 20 A 의 `kind:'mtseg'` 와 동형).
  //      뒤에 그리면(안개 마스크 뒤) 캄캄한 땅 위에 풀이 뜬다 — 배치 19 실측.
  //   ⓔ **비용**: 술은 개수가 많다. 8×8셀 청크 단위로 **정적 배치를 캐시**하고(지형은 정적),
  //      청크 안에서 물 판정을 14×14 로 **한 번만** 훑어 셀마다 7×7 재조회하는 낭비를 없앤다.
  //   ⓕ 초원 소품(들꽃·풀숲)은 자리는 정적이지만 **회피 판정은 동적**이다(길·사유지·경작지가
  //      생긴다). 그래서 후보 자리만 캐시하고 회피는 수집 시점에 건다. **회피 판정은 전부
  //      클라가 이미 받는 값**이다 — roads · claims · simVillages · buildings. 새로 만들지 않는다.
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★★[재민 2026-08-07] **물가 술은 반려됐다 — 기본값 OFF(`fringeOff: true`).**
  //   원문: *"일단 물가 근처에 추가적으로 배치하는 풀은 없애주고"*.
  //   이 층의 원래 존재 이유는 "물가 절단선을 가리는 것"이었는데, 그 문제는 이제
  //   **지면 베이크 안의 물가 여백**(§6-f `_shoreMarginBake`)이 직접 푼다 —
  //   가리는 게 아니라 애초에 안 잘리게 만든다. 가리개는 필요 없어졌고, 재민 눈에는
  //   **일부러 심은 것**으로 읽혔다. 코드는 손잡이 뒤에 남긴다(`fringeOff = false` 로 켜진다).
  //   ※초원 소품(들꽃·풀숲)은 **그대로 산다** — 재민이 없애라고 한 건 '물가 근처'다.
  const NAT_KINDS = { grass: 4, reed: 3, cattail: 3, flower: 4 };
  const NATX = {};
  let _natAnchors = null, _natLoaded = 0, _natWanted = 0;
  (async () => {
    try {
      const r = await fetch('/assets/nature/nature_anchors.json');
      if (!r.ok) return;
      _natAnchors = await r.json();
      for (const cls in NAT_KINDS) {
        for (let i = 1; i <= NAT_KINDS[cls]; i++) {
          const n = cls + String(i).padStart(2, '0');
          if (!_natAnchors[n]) continue;
          _natWanted++;
          const im = new Image(); im.onload = () => _natLoaded++; im.src = '/assets/nature/' + n + '.png';
          NATX[n] = im;
        }
      }
      console.log('[nat] 자연물 스프라이트', _natWanted, '종 로드 시작');
    } catch (e) { console.warn('[nat] 앵커 로드 실패:', e.message); }
  })();

  const NAT_VIEW_PAD = 1500;          // ★렌더 반경. AOI 의 VIEW_RADIUS(650)는 **렌더 함수 지역 상수**라
  //                                   여기서 못 쓴다(1패스 실사고: ReferenceError 로 엔티티 패스가 통째로 죽었다).
  //                                   지면 데코는 AOI 와 무관하게 화면 끝까지 보여야 하므로 자체 상수를 쓴다(산 1800 과 동형).
  const NAT_WAVE = 5;                 // 저주파 밀도 파장(셀) — 군락 ↔ 빈 구간의 교대 주기
  const NAT_CH = 8;                   // 청크 = 8×8셀(지면 베이크 타일과 같은 눈금)
  const NAT_PAD = 3;                  // 청크 둘레 여유(물 거리 최대 3셀까지 본다)
  const _natChunk = new Map();        // "ccx_ccy" → { fr: [...], pr: [...] }  (정적)
  function _natNoise(cx, cy, salt) {  // 값 노이즈(부드러운 보간) — 해시만 쓰면 셀마다 튀어 군락이 안 생긴다
    const gx = Math.floor(cx / NAT_WAVE), gy = Math.floor(cy / NAT_WAVE);
    const fx = cx / NAT_WAVE - gx, fy = cy / NAT_WAVE - gy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = _cellHash(gx, gy, salt), b = _cellHash(gx + 1, gy, salt);
    const c = _cellHash(gx, gy + 1, salt), d = _cellHash(gx + 1, gy + 1, salt);
    const t = a + (b - a) * sx, u = c + (d - c) * sx;
    return t + (u - t) * sy;
  }
  function _natBuildChunk(ccx, ccy) {
    // ★시안 손잡이 `frFloor` — 밀도 저주파 변주의 **바닥값**. 0(기본) 이면 문턱 아래 물가는
    //   한 포기도 안 선다(= 재민 지시 "빈 구간이 셀 몇 개 단위로 교대"). >0 이면 빈 구간에도
    //   최소 밀도가 깔려 절단선이 어디서나 덮이는 대신 군락 대비가 약해진다. 캐시 키에 넣어
    //   런타임에 갈아 끼워도 배치가 다시 계산된다(하네스가 같은 프레임 A/B 를 얻는 길).
    //   ★기본값 0 인 이유는 취향이 아니라 **실측**이다: 0.25 로 깔면 화면은 더 낫지만
    //   물가 회랑의 '빈 블록'이 31%→15% 로 떨어져 e2e-nature ⓑ(≥18%)를 통과하지 못한다.
    //   그 판정은 재민이 글로 못박은 "빈 구간이 셀 몇 개 단위로 교대"를 옮긴 것이라
    //   **판정을 완화해서 취향을 통과시키지 않는다.** 시안은 보고서 §6 에 붙였다.
    const key = ccx + '_' + ccy + '_' + (_t19.frFloor || 0);
    const hit = _natChunk.get(key); if (hit) return hit;
    const S = NAT_CH + NAT_PAD * 2;
    const wet = new Uint8Array(S * S), rock = new Uint8Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const cx = ccx * NAT_CH + i - NAT_PAD, cy = ccy * NAT_CH + j - NAT_PAD;
      const wx = cx * 32 + 16, wy = cy * 32 + 16;
      wet[j * S + i] = isWaterAtAbs(wx, wy) ? 1 : 0;
      rock[j * S + i] = isRockAtAbs(wx, wy) ? 1 : 0;
    }
    const fr = [], pr = [];
    for (let dy = 0; dy < NAT_CH; dy++) for (let dx = 0; dx < NAT_CH; dx++) {
      const i0 = dx + NAT_PAD, j0 = dy + NAT_PAD;
      if (wet[j0 * S + i0] || rock[j0 * S + i0]) continue;
      const cx = ccx * NAT_CH + dx, cy = ccy * NAT_CH + dy;
      const wx = cx * 32 + 16, wy = cy * 32 + 16;
      // 가장 가까운 물까지의 체비셰프 거리 + 그 물들이 있는 방향(합)
      let best = 99, sx2 = 0, sy2 = 0;
      for (let ny = -NAT_PAD; ny <= NAT_PAD; ny++) for (let nx = -NAT_PAD; nx <= NAT_PAD; nx++) {
        if (!nx && !ny) continue;
        const dd = Math.abs(nx) > Math.abs(ny) ? Math.abs(nx) : Math.abs(ny);
        if (dd > best) continue;
        if (!wet[(j0 + ny) * S + (i0 + nx)]) continue;
        if (dd < best) { best = dd; sx2 = 0; sy2 = 0; }
        sx2 += nx; sy2 += ny;
      }
      if (best <= NAT_PAD) {
        // ── 물가 술 ──
        const band = best - 1;                              // 0 = 물과 맞닿은 셀
        const q = _natNoise(cx, cy, 4211);
        //  ★문턱 0.34 — 이 아래는 **한 포기도 안 선다**. "일부러 심은 느낌"을 깨는 건 밀도가 아니라
        //    빈 구간의 존재다. 문턱 위에서는 (q-0.34)/0.46 로 0→1 까지 부드럽게 빽빽해진다.
        const amp = (q - 0.34) / 0.46;
        const a2 = amp > 0 ? (amp > 1 ? 1 : amp) : 0;
        const flr = _t19.frFloor || 0;
        const dens = (band === 0 ? 2.8 : band === 1 ? 1.3 : 0.5) * (flr + (1 - flr) * a2);
        const n = Math.floor(dens + _cellHash(cx, cy, 4212));
        const L = Math.sqrt(sx2 * sx2 + sy2 * sy2) || 1, ux = sx2 / L, uy = sy2 / L;
        for (let i = 0; i < n; i++) {
          const h1 = _cellHash(cx, cy, 4300 + i), h2 = _cellHash(cx, cy, 4400 + i);
          const h3 = _cellHash(cx, cy, 4500 + i), h4 = _cellHash(cx, cy, 4700 + i);
          let px, py;
          if (band === 0) {
            // ★물 쪽으로 민다 — 셀 반폭이 16px 이므로 12~28px 는 **물 위로 최대 12px** 넘어간다.
            //   이 넘김이 곧 절단선 은폐다. 변을 따라서는 ±13px 흩는다(줄서기 방지).
            const push = 12 + 16 * h1;
            px = wx + ux * push - uy * (h2 - 0.5) * 26;
            py = wy + uy * push + ux * (h2 - 0.5) * 26;
          } else {
            px = wx + (h1 - 0.5) * 26; py = wy + (h2 - 0.5) * 26;
          }
          let nm;
          if (band === 0 && q > 0.62 && h3 > 0.40) nm = (h3 > 0.70 ? 'reed0' : 'cattail0') + (1 + ((h4 * 3) | 0));
          else nm = 'grass0' + (1 + ((h4 * 4) | 0));
          fr.push({ x: px, y: py, nm, sc: 0.66 + 0.40 * h3, vy: 0.86 + 0.30 * h2,
                    ph: _cellHash(cx, cy, 4800 + i) * 6.2832 });   // 바람 위상 — 포기마다 다르다
        }
      } else {
        // ── 초원 소품(들꽃·풀숲) — 밀도 낮게. 스폰 광장이 첫인상이라 과밀은 금물이다.
        const q2 = _natNoise(cx, cy, 8117);
        const thr = 0.978 - 0.055 * (q2 > 0.5 ? (q2 - 0.5) * 2 : 0);  // 0.978~0.923 — 빈 초원↔꽃밭이 저주파로 교대
        const h0 = _cellHash(cx, cy, 8118);
        if (h0 > thr) {
          const h1 = _cellHash(cx, cy, 8201), h2 = _cellHash(cx, cy, 8202);
          const h3 = _cellHash(cx, cy, 8203), h4 = _cellHash(cx, cy, 8204);
          const isFl = h3 > 0.55;                        // 들꽃 45% · 풀숲 55%
          pr.push({ x: wx + (h1 - 0.5) * 24, y: wy + (h2 - 0.5) * 24, cx, cy,
                    nm: (isFl ? 'flower0' : 'grass0') + (1 + ((h4 * 4) | 0)),
                    sc: 0.7 + 0.35 * h1, vy: 0.9 + 0.24 * h2,
                    ph: _cellHash(cx, cy, 8205) * 6.2832 });
        }
      }
    }
    const v = { fr, pr };
    if (_natChunk.size > 2400) _natChunk.clear();
    _natChunk.set(key, v);
    return v;
  }
  // ★★[배치 20 B ↔ 배치 21 접합] 들꽃·풀숲이 **타일 상태를 따른다.**
  //   두 배치가 따로 착지해 아무도 못 본 구멍이었다 — 파낸 광맥 자리 위에 들꽃이 피고,
  //   토양치 60 의 맨흙에 풀포기가 돋고, 산터 암반에 꽃이 자랐다(실측 스크린샷으로 잡았다).
  //   재민 확정 "비옥도에 따라 **모든 타일이** 디자인이 바뀌어야" 는 그 위의 소품까지다.
  //   ★억제는 연속이다 — 자리마다 고유 난수(셀 해시)를 문턱과 견주므로, 토양치가 내려가면
  //     소품이 **하나씩 사라진다**(개수의 계단이 아니라). Math.random() 미사용.
  //   ★물가 술(fringe)은 건드리지 않는다 — 갈대는 진흙에서 자란다. 배치 21 이 검증한 계는 그대로.
  function _natStateOk(p) {
    if (_t19.stateOff) return true;
    const c = (primaryZoneId && typeof conns !== 'undefined') ? conns.get(primaryZoneId) : null;
    if (!c || !c.meta || typeof SoilBase === 'undefined') return true;
    const lcx = Math.floor((p.x - c.meta.worldOffsetX) / 32), lcy = Math.floor((p.y - (c.meta.worldOffsetY || 0)) / 32);
    const rec = c.soil ? c.soil.get(lcx + ',' + lcy) : null;
    if (rec && rec.geo) return false;                       // 산터 암반 — 자체 램프(이끼·틈새 풀)가 따로 있다
    const soil = rec ? rec.v : SoilBase.baseAt('land', lcx, lcy);
    const h = SoilBase.hash(lcx, lcy, 9301);
    if (rec && rec.ore < 15 && h < (15 - rec.ore) / 15) return false;   // 판 자리일수록 더 많이 사라진다
    return h <= _smooth(180, 620, soil);                    // 척박할수록 성기게 — 620 위는 사실상 전부 남는다
  }
  // ★회피 — 마을 영토·경작지·길·사유지. **판정은 전부 이미 클라에 온 값**이다(새 판정 금지).
  //   길·건축물은 셀 집합으로 한 번만 굽고, 목록 크기가 바뀔 때만 다시 굽는다.
  let _natBlockSet = null, _natBlockSig = '';
  function _natBlocked(ax, ay) {
    let sig = '';
    for (const c of conns.values()) {
      if (!c.meta) continue;
      sig += (c.roads ? c.roads.size : 0) + '/' + (c.buildings ? c.buildings.size : 0) + '|';
    }
    if (sig !== _natBlockSig || !_natBlockSet) {
      _natBlockSig = sig; _natBlockSet = new Set();
      for (const c of conns.values()) {
        if (!c.meta) continue;
        const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
        const ocx = Math.round(ox / CL_BUILDING_SIZE), ocy = Math.round(oy / CL_BUILDING_SIZE);
        if (c.roads) for (const rk of c.roads.keys()) {
          const ci = rk.indexOf(',');
          _natBlockSet.add((ocx + +rk.slice(0, ci)) + ',' + (ocy + +rk.slice(ci + 1)));
        }
        if (c.buildings) for (const b of c.buildings.values()) {
          const bx = Math.floor((ox + b.x) / CL_BUILDING_SIZE), by = Math.floor((oy + b.y) / CL_BUILDING_SIZE);
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) _natBlockSet.add((bx + i) + ',' + (by + j));
        }
      }
    }
    if (_natBlockSet.has(Math.floor(ax / CL_BUILDING_SIZE) + ',' + Math.floor(ay / CL_BUILDING_SIZE))) return true;
    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
      const lx = ax - ox, ly = ay - oy;
      for (const cl of (c.claims ? c.claims.values() : [])) {
        if (lx >= cl.x && lx < cl.x + cl.w && ly >= cl.y && ly < cl.y + cl.h) return true;
      }
      if (c.simVillages) for (const v of c.simVillages) {
        const vx = v.cx * CL_BUILDING_SIZE + 16, vy = v.cy * CL_BUILDING_SIZE + 16;
        const rr = Math.max(v.r || 0, v.tr || 0) || 800;
        const ddx = lx - vx, ddy = ly - vy;
        if (ddx * ddx + ddy * ddy < rr * rr) return true;
      }
    }
    return false;
  }
  const _natLastC = [0, 0];              // 이번 프레임 카메라 중심(절대 월드 px) — __shoreProbe 기본값
  function _natCollect(out, cx0, cy0) {
    _natLastC[0] = cx0; _natLastC[1] = cy0;
    if (_t19.natOff || !_natAnchors || _natLoaded < _natWanted || !_natWanted) return [0, 0];
    const R = NAT_VIEW_PAD;
    const c0 = Math.floor((cx0 - R) / 32), c1 = Math.floor((cx0 + R) / 32);
    const r0 = Math.floor((cy0 - R) / 32), r1 = Math.floor((cy0 + R) / 32);
    let nf = 0, np = 0;
    _natLastPr = [];
    for (let ccy = Math.floor(r0 / NAT_CH); ccy <= Math.floor(r1 / NAT_CH); ccy++) {
      for (let ccx = Math.floor(c0 / NAT_CH); ccx <= Math.floor(c1 / NAT_CH); ccx++) {
        const ch = _natBuildChunk(ccx, ccy);
        if (!_t19.fringeOff) for (const f of ch.fr) {
          if (Math.abs(f.x - cx0) > R || Math.abs(f.y - cy0) > R) continue;
          out.push({ z: w2i(f.x, f.y).y, kind: 'natspr', s: f }); nf++;
        }
        if (!_t19.propOff) for (const p of ch.pr) {
          if (Math.abs(p.x - cx0) > R || Math.abs(p.y - cy0) > R) continue;
          if (!_t19.propNoAvoid && _natBlocked(p.x, p.y)) continue;
          if (!_natStateOk(p)) continue;   // ★[배치 20 B] 타일 상태 — 척박·판 자리·산터엔 안 돋는다
          out.push({ z: w2i(p.x, p.y).y, kind: 'natspr', s: p }); np++;
          _natLastPr.push(p);
        }
      }
    }
    return [nf, np];
  }
  // ★하네스 계측기 — 이번 프레임에 **실제로 그려진** 소품 자리와, 회피 판정의 **원자료**를
  //   함께 내보낸다. 하네스가 `_natBlocked` 를 다시 짜면 그게 사본이라 자명 통과가 된다.
  //   ⇒ 하네스는 여기서 받은 원자료(길 셀·사유지 사각·마을 원)로 **독립 재계산**해서 대조한다.
  //   ⇒ 그리고 `__terrain19.propNoAvoid = true` 로 회피를 끄면 위반이 실제로 나와야 한다(반례).
  let _natLastPr = [];
// @@moved:4829
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[재민 질문 2026-08-06c] "바람 흔들림 … 날씨에 따라 풀의 운동이 변하게 할 수 있나?"
  //   ★게임에 **날씨 상태가 없다** — server/·sim/·public/ 전수 grep 0건이다. 없는 걸 있다고
  //     보고하지 않는다. 대신 **바람 세기의 정본 함수 하나**(`_windAt`)를 세우고, 지금은
  //     **게임 시계**로 채운다. 날씨 시스템이 생기면 **그 한 곳에 곱하면** 전부 따라온다.
  //     `__terrain19.windForce` 가 바로 그 주입 자리다(하네스도 이 손잡이로 잰다).
  //   ★시간은 **게임 시계**다(프레임 시간 아님) — 물 셰이더와 **같은 `freezeT` 경로**를 쓴다.
  //     그래야 "시각 고정 두 프레임 동일" 결정론 판정이 안 깨진다.
  //   ★돌풍은 **진행하는 파**다. 위상에 `바람방향·자리` 를 빼서 들판을 물결처럼 훑고 지나가게 한다.
  //     전부 같은 위상으로 흔들면 '풀이 아니라 화면이 흔들리는' 그림이 된다.
  //   ★변형은 **전단(shear)**: 밑동 고정, 꼭대기만 민다. 회전이 아니다 — 회전은 밑동이 땅에서 뜬다.
  //   ★비용(배치 21 8차 격리 측정): 자연물 패스 0.317ms/f(755장). ※짝 비교로는 natOff 가
  //     1.1±0.9ms — 잡음과 구분 안 된다. 격리 수치는 참고만 하라. 전단은 `setTransform` 1회 +
  //     `drawImage` 1회로 끝난다(캐시는 **자리**를 담지 픽셀을 안 담으므로 무효화 없음).
  //   ※지면 풀 **텍스처**는 안 흔든다 — 매 프레임 재베이크나 WebGL 이관이 필요해 비싸다(회부).
  //   ※나무는 안 흔든다 — 서버 엔티티라 그리는 자리가 다르고(안개 게이트 경유), 줄기는 원래 안 흔들린다.
  const WIND_DIR_X = 0.94, WIND_DIR_Y = 0.34;      // 바람이 부는 방향(월드) — 파의 진행 방향
  const WIND_AMP = { grass: 0.155, reed: 0.265, cattail: 0.235, flower: 0.125 };  // 기울기 tan(≈9°~15°)
  // ★이름을 `_windT0` 로 둔다 — 병행 세션(산)이 렌더 함수 안에서 `_natT0` 를 **수집 계측용**으로
  //   쓰고 있다(`window._natAcc`). 같은 이름이면 섀도잉이라 읽는 사람이 헷갈린다.
  let _windT0 = null;
  let _natMs = 0;                                  // 자연물 그리기 패스 ms(이동평균) — `__natDbg.ms`
  function _windT() {
    if (_t19.freezeT != null) return _t19.freezeT;
    if (_windT0 === null) _windT0 = (typeof worldNow === 'function' ? worldNow() : 0);
    return ((typeof worldNow === 'function' ? worldNow() : 0) - _windT0) / 1000;
  }
  function _windAt(t) {
    if (_t19.windForce != null) return _t19.windForce;      // ★날씨 훅 · 하네스 주입구
    // 큰 숨 — 주기가 다른 두 사인의 곱이라 '돌풍이 왔다 갔다' 하는 비주기 느낌이 난다
    const breath = 0.58 + 0.42 * Math.sin(t * 0.21) * Math.sin(t * 0.083 + 1.7);
    // 일주기 — 새벽 잔잔 → 한낮 최대 → 밤 다시 잔잔(실제 지표풍의 일변화). 시각 고정이면 고정값.
    const ph = (_t19.freezeT != null) ? 0.30
             : ((typeof worldClock !== 'undefined' && worldClock && typeof worldPhase === 'function') ? worldPhase() : 0.30);
    const diur = 0.42 + 0.58 * Math.max(0, Math.sin((ph - 0.02) * 6.2832));
    const w = breath * diur;
    return w < 0 ? 0 : w > 1 ? 1 : w;
  }
// @@moved:4885
  function _natDraw(g, item, toScr, t, w) {
    const s = item.s, an = _natAnchors && _natAnchors[s.nm], im = NATX[s.nm];
    if (!an || !im || !im.complete || !im.naturalWidth) return;
    const sc = (64 / Math.SQRT2) / an.ppu * s.sc, vy = s.vy || 1;
    const p = w2i(s.x, s.y), c = toScr(p.x, p.y);
    const amp = w > 0 ? WIND_AMP[s.nm.slice(0, -2)] : 0;
    if (amp) {
      // 진행하는 파 — 같은 시각에도 자리마다 위상이 다르다(파장 ≈ 210px ≈ 6.5셀)
      const k = (s.x * WIND_DIR_X + s.y * WIND_DIR_Y) / 210;
      const a = Math.sin(t * 1.35 - k + s.ph) * 0.64 + Math.sin(t * 2.63 - k * 1.7 + s.ph * 2.1) * 0.36;
      const sh = a * w * amp;
      // ★`setTransform` 이 아니라 `transform`(=현재 행렬에 곱하기) + save/restore 다.
      //   메인 캔버스가 이미 변환을 걸고 있을 수 있다 — 항등으로 되돌리면 그 뒤 그림이 다 깨진다.
      g.save();
      g.transform(1, 0, sh, 1, -sh * c.y, 0);          // 밑동(c.y) 고정 전단
      g.drawImage(im, c.x - an.ox * sc, c.y - an.oy * sc * vy, im.naturalWidth * sc, im.naturalHeight * sc * vy);
      g.restore();
      return;
    }
    g.drawImage(im, c.x - an.ox * sc, c.y - an.oy * sc * vy, im.naturalWidth * sc, im.naturalHeight * sc * vy);
  }

  // ★[재민 확정 안개 게이트] 이번 프레임에 **실제로 그린** 개체의 자리 — 하네스 계측기.
  //   하네스가 '봤다' 판정을 다시 짜면 사본이라 자명 통과다 ⇒ 여기서는 **자리만** 내보내고
  //   판정은 하네스가 `window._seenChunks`(정본 저장소)를 직접 읽어서 한다.
  const _gateDrawn = [];
  // ★★[2026-08-26] **생물이 그려진 화면 자리** — 하네스 전용 읽기 훅(기본 꺼짐, 라이브 비용 0).
  //   왜 필요한가: `e2e-nature` 의 "시각을 고정하면 두 프레임이 동일" 판정이 **사슴 한 마리**에
  //   깨졌다(실측 1007화소). 그 판정의 뜻은 "자연물 자리 해시가 순수 함수"이지 "짐승도 멈춰 있다"가
  //   아니다. 그렇다고 하네스가 화면 변환을 **베껴 쓰면** 그게 사본 계측기다(이 레포가 열 번 당한 함정).
  //   ⇒ 클라가 **자기 변환으로** 자리를 알려 주고, 하네스는 그 자리만 가린다.
  const _entBoxes = [];
  window.__entBoxes = () => { const o = []; for (let i = 0; i < _entBoxes.length; i += 3) o.push([_entBoxes[i], _entBoxes[i + 1], _entBoxes[i + 2]]); return o; };
  // ★[안개 위 논밭 2026-08-30] 영토 경계선이 **안 본 셀 위에** 그려졌는지 — 프레임마다 센다.
  //   판정 정본은 `_seenChunks` 다(하네스가 직접 대조할 수 있게 자리를 그대로 낸다).
  window.__simvilCells = { cand: 0, unseen: 0, drawnUnseen: 0, samples: [] };
  window.__simvilProbe = () => JSON.parse(JSON.stringify(window.__simvilCells));
  window.__fogGateProbe = () => {
    const out = [];
    for (let i = 0; i < _gateDrawn.length; i += 3) out.push([_gateDrawn[i], _gateDrawn[i + 1], _gateDrawn[i + 2]]);
    return out;
  };

  // ★A/B 손잡이 — `__terrain19.legacy = true` 면 배치 19 이전(단색 다이아몬드)으로 정확히 돌아간다.
  //   하네스가 같은 프레임·같은 시계에서 before/after 를 얻는 유일한 길이고,
  //   `_tileAcc` 성능 비교도 이것 없이는 못 잰다. 기본값이 채택값이다(제품 UI 없음).
  //   ★prismOff — 블록 프리즘 단면만 끈다. 단면은 5px 안에 밑면·물접촉선·풀넘김 셋이 겹쳐
  //     '순수 단면색' 픽셀이 1px 도 안 남는다(하네스 1패스가 0.01% 를 보고 헛짚었다).
  //     색으로 세는 대신 **켜고 끈 차이**로 재야 판정이 성립한다.
  //   ★[배치 21] natOff/fringeOff/propOff — 자연물 산포 전체/물가 술/초원 소품을 따로 끈다.
  //   ★[배치 20 B] stateOff — 타일 상태 5축 레이어를 끈다(끄면 기준선 그림으로 돌아온다).
  //   ★[배치 20 B] slowFlow — 물가 렉 수리의 **대조군**. 공간 색인·물판정 재사용을 꺼서
  //     수리 전 코드와 같은 비용을 내게 한다(같은 세션·같은 시계에서 A/B —
  //     git stash 로 만든 "before" 는 다른 세계다).
  const _t19 = { legacy: false, waterOff: false, decoOff: false, prismOff: false, mtOff: false,
                 natOff: false, fringeOff: true, propOff: false, propNoAvoid: false, frFloor: 0,
                 stateOff: false, slowFlow: false, wxOff: false,
  //   ★[재민 2026-08-07] occOff — 산 가림 뚫기의 **대조군**. 끄면 산이 나를 통째로 덮는다.
  //     하네스가 "뚫렸다"를 주장하려면 안 뚫린 프레임이 같은 시계에서 필요하다.
                 occOff: false,
  //   ★[재민 2026-08-07] mtLegacy — 산 배치의 **대조군**. 켜면 능선 중심선 보행(옛 배치)으로
  //     돌아간다. 기본은 덮개 배치(맨 바위 0.0%)다. 옛 배치는 맨 바위 39.9~70.9% 였다.
                 mtLegacy: false,
  //   ★[재민 2026-08-07] footOff — 기슭. **기본이 끔**이다.
  //     재민이 시안에서 "고고" 했지만 라이브에서 보고 "산이 비산맥 셀을 침범한다"고 했다.
  //     기슭은 정의상 풀 셀에 앵커를 두므로 "정확하게 산 셀에만" 과 정면으로 부딪친다.
  //     나중 지시가 이긴다 — 끄고, 손잡이는 남긴다(footOff = false 로 켜진다).
                 footOff: true,
  //   ★[재민 2026-08-07] fitOff — 배율 묶기의 **대조군**. 끄면 산이 바위 밖 6셀까지 퍼진다.
                 fitOff: false,
  //   ★[배치 21 5차] fogGateOff — 안개 게이트의 **대조군**. 끄면 안 가본 곳의 개체가 다시 보인다.
                 fogGateOff: false,
                 // ★[안개 위 논밭 2026-08-30] 영토 셀 게이트의 **대조군**. 켜면 옛 동작(중심 하나로 게이트)
                 //   으로 돌아가 위반이 다시 나온다 — 그게 나와야 수리 판정이 자명 통과가 아니다.
                 simvilCellGateOff: false,
                 shoreOff: true,
                 shMarginOff: false, shMargin: 1, windOff: false, windForce: null, windGrassOff: false, edgeFuzz: null,
  //   ★[재민 2026-08-24] flowRawDist — 흐름 주인을 고르는 **대조군**. 켜면 폭을 무시한 옛
  //     '생거리 최근접'(=합류부에 뒤집힌 띠가 다시 생긴다). 손잡이를 바꾼 뒤에는 `__wfReset()` 을
  //     불러야 셀 캐시가 식는다 — 안 그러면 A/B 가 옛 값으로 오염된다.
                 flowRawDist: false,
  //   ★[재민 2026-08-24] 물 층 분해 스위치 — specOff(반짝임) · foamOff(포말) · waveOff(파도).
  //     "물방울 같은 게 뭐냐"·"1셀 두께 줄무늬" 를 **어느 항이 그리는지** 끄고 재서 가르려고 만들었다.
                 specOff: false, foamOff: false, waveOff: false, sineOff: false, ripOff: false,
  //   ★[재민 2026-08-24] ripAmp — 잔결 노이즈 **전체** 세기(n1·n2 둘 다). 1 이 지금 값.
  //     점묘의 주범은 n2(스케일 손잡이로 재 봤더니 아니었다)가 아니라 **n1(가중 0.55·8월드px)** 였다.
                 ripAmp: null, ripScale: null, ripW: null, ripScale1: null, ripW1: null,
                 ditherOff: false, dither: null, lakeSnap: null, dirLinear: false, phaseLegacy: false,
  //   ★[재민 2026-08-25] phaseRelax — Φ 완화 반복수(기본 36 · 0 이면 강 호장 그대로).
  //     dirRawCell — CPU 방향 평활을 끄고 셀 단위 방향(NEAREST)으로 되돌리는 대조군.
  //     shearRaw — 전단선(맞부딪치는 두 강) 보호를 끄는 대조군. 켜면 90° 넘는 이웃까지
  //     평균·연결한다 = 단위벡터가 상쇄돼 방향이 난수가 되던 옛 동작.
                 phaseRelax: null, dirRawCell: false, shearRaw: false };
  // 시험 전용 — 띠 높이를 바꿔 "비용이 blit 횟수에 비례하나 픽셀 수에 비례하나"를 가른다.
  window.__gtStrip = (v) => { GT_STRIP = Math.max(4, v | 0); _groundTiles.clear(); needsRedraw = true; return GT_STRIP; };
  window.__gtFrac = (v) => { _gtFrac = !!v; needsRedraw = true; return _gtFrac; };
  window.__terrain19 = _t19;

  // 지형 차단 통합 (물+바위) — 이동 예측용
  // ★[다리 층] 절대 셀 좌표 다리 집합(존 welcome에서 누적) — 서버 BRIDGE_CELLS 미러.
  const _bridgeAbs = new Set();
  // ★[11차 T3 환호] 도랑 절대 셀 집합 — 서버 DITCH_CELLS 미러. 다리와 **같은 이유로** 미러가 필수다:
  //   서버 isTerrainBlockedLocal이 도랑에서 막는데 클라 예측이 안 막으면 도랑 위로 걸어 들어갔다가
  //   서버 위치로 튕겨 나오는 러버밴딩이 난다(좌표 단일 작성자 원칙 — 예측은 서버와 같은 판정이어야 함).
  const _ditchAbs = new Set();
  function isBridgeAtAbs(x, y) {
    if (!_bridgeAbs.size) return false;
    return _bridgeAbs.has(Math.floor(x / CL_BUILDING_SIZE) + ',' + Math.floor(y / CL_BUILDING_SIZE));
  }
  function isDitchAtAbs(x, y) {
    if (!_ditchAbs.size) return false;
    return _ditchAbs.has(Math.floor(x / CL_BUILDING_SIZE) + ',' + Math.floor(y / CL_BUILDING_SIZE));
  }
  function isTerrainBlockedAtAbs(x, y) {
    if (isRockAtAbs(x, y)) return true;                 // 바위는 다리로 안 뚫림(서버 동형)
    if (isDitchAtAbs(x, y)) return true;                // ★환호 = 이동 불가(서버 동형). 출입구는 안 판 셀이라 자동으로 열림
    if (isWaterAtAbs(x, y)) return !isBridgeAtAbs(x, y);
    return false;
  }
