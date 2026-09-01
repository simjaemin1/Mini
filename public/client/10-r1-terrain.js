// @@split:10-r1-terrain — R1 지형렌더 — 물·해안·타일
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★★[재민 재지적 2026-08-06c] "이제 다시 풀이 어색하게 잘리지 않도록 해볼 수 있을까"
  //
  //   ★수리(§6-e)로 물 넘침을 걷어내고 **확대해서 다시 봤다.** 남아 있던 그림은 이거다:
  //     풀 → (칼로 그은 듯한 **완전 직선 대각선**) → 물. 전이 구간이 **0px** 다.
  //     특히 북·서 물가는 프리즘조차 없어서 **풀잎이 대각선에 그대로 잘린다.**
  //   ★실측(수직 프로파일, 프리즘 남·동면 기준):
  //       뭍 풀 σ 29~45 (질감) → 립 d=0 에서 σ **24.9** (프로파일 전체 최솟값 = 가장 띠답다)
  //       → 프리즘 그늘 d=3~4 휘도 **38~40** ↔ 물 d=6 휘도 **106**. 명암 대비가 곧 **윤곽선**이다.
  //
  //   ★두 번 반려된 길을 다시 가지 않는다. 반려된 것은 `_bakeShoreTile` =
  //     **물 위에 초록 띠를 하나 더 얹는 것**이었다(재민: "after가 여전히 더 심해").
  //     그 실패에서 남는 교훈은 셋이다 — ⓐ물 위에 새 층을 얹지 마라 ⓑ폭이 일정하면 띠다
  //     ⓒ규칙적 마스크는 무늬로 읽힌다.
  //
  //   ★그래서 이번엔 **뭍 쪽으로** 판다. 실제 물가에는 풀이 물까지 자라지 않는다 —
  //     젖은 모래·자갈 **여백**이 있다. 그 여백을 **지면 베이크 안에서** 만든다:
  //       · 새 레이어 0장(프레임 비용 0). 물 위에 아무것도 안 얹는다.
  //       · 폭이 **저주파로 0↔13px 사이를 오간다** — 어떤 구간은 풀이 물까지 가고(여백 0),
  //         어떤 구간은 넓은 모래톱이다. 폭이 0인 구간이 있어야 '띠'가 아니다.
  //       · 폭의 정본은 **술 밀도와 같은 노이즈장**(salt 4211)이다 ⇒ 갈대가 빽빽한 구간은
  //         여백 0(습지), 술이 한 포기도 없는 빈 구간은 넓은 모래톱. **한 장(場)이 둘을 설명한다.**
  //       · 여백의 **안쪽 경계는 풀잎 모양으로 깎는다** — 풀 텍스처 자신의 잎 알파로 모래를
  //         파내서 잎이 모래 쪽으로 삐져나오게 한다(합성 얼룩은 격자 무늬가 된다 — 2패스 실패).
  //         마스크는 지면 바탕과 **같은 위상**(패턴 오프셋 0)이라 실제 잎 자리와 맞는다.
  //   ⇒ 결과적으로 직선은 남지만 그 직선은 이제 **모래↔물**이다. 물가선이 날카로운 건 정상이다.
  //     잘리는 건 풀이 아니라 모래다.
  const SH_MARGIN_MAX = 13;         // 최대 여백(px). 셀 반폭 16 을 넘으면 셀을 통째로 먹는다
  function _shoreMargin(cx, cy, k) {
    // ★1패스는 여백 폭을 **술 밀도와 같은 장**(salt 4211)에 묶었다 — 개념은 예뻤지만 실측이 반박했다:
    //   값 노이즈는 0.5 근처에 몰려서 '여백이 생기는 구간'이 화면에서 36조각뿐이었고, 실제 물가는
    //   1패스 전과 거의 그대로였다(재민이 지적한 그 직선이 그대로 남았다).
    //   ⇒ **자기 장**을 쓴다. 두 옥타브(파장 5셀 + 10셀)를 섞어 넓게 굽이치게 한다.
    //   ※술과 굳이 안 묶어도 겹치지 않는다: band0 술은 셀 중심에서 물 쪽으로 12~28px 밀려
    //     **물 위에** 서고, 여백은 변에서 **뭍 쪽으로** 최대 13px 다. 갈대는 모래톱 끝 물에 선다.
    const u = 0.62 * _natNoise(cx, cy, 6120) + 0.38 * _natNoise(cx * 0.5, cy * 0.5, 6121);
    // ★문턱 0.40 은 취향이 아니라 **판정에 맞춘 값**이다. 2패스에서 0.26 을 썼더니 물가 변의
    //   **91%** 에 여백이 생겨 `e2e-nature` ⓗ(빈 구간 ≥20%)를 9% 로 못 넘었다 — 그건 곧 띠다.
    //   판정을 낮추는 대신 **코드를 고쳤다.** (같은 규율: 배치 21 frFloor 시안 B 기각)
    let w = (u - 0.40) / 0.22;                    // u≤0.40 → 여백 0(풀이 물까지 간다) · u≥0.62 → 최대
    w = w < 0 ? 0 : w > 1 ? 1 : w;
    // 자리별 배율 폭이 넓어야 '띠'가 아니다 — 같은 굽이 안에서도 셀마다 0.35~1.30 배로 흔든다
    const sc = (_t19.shMargin == null ? 1 : _t19.shMargin);   // 시안·하네스 손잡이(0 = 끔)
    return SH_MARGIN_MAX * sc * w * (0.35 + 0.95 * _cellHash(cx, cy, 5150 + k));
  }
  // ★하네스 계측기 — 물가 **변**마다 여백 폭을 내보낸다. 판정(빈 구간 비율·변동계수)은 하네스가 한다.
  //   여기서 폭을 다시 계산하면 그게 사본이라 자명 통과가 된다 ⇒ **정본 `_shoreMargin` 을 그대로 부른다.**
  //   ※자리를 안 주면 **이번 프레임 카메라 중심**을 쓴다 — 하네스가 존 오프셋을 다시 계산하다
  //     틀리는 걸 막는다(1패스 실패: 존 로컬 좌표를 절대 좌표로 넘겨 표본 0이 나왔다).
// @@moved:1028
  let _shTmp = null;
  function _shoreMarginBake(g, X0, Y0, c0x, c1x, c0y, c1y, zlist, gm) {
    if (!GTEX.dry_angled || !GTEX.grass_angled || !GTEX.grass_angled.naturalWidth) return 0;
    if (!_shTmp) { _shTmp = document.createElement('canvas'); _shTmp.width = GT_W; _shTmp.height = GT_H; }
    const t = _shTmp.getContext('2d');
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
    t.clearRect(0, 0, GT_W, GT_H);
    const dia = (gg, x, y) => { gg.beginPath(); gg.moveTo(x, y - 16); gg.lineTo(x + 32, y); gg.lineTo(x, y + 16); gg.lineTo(x - 32, y); gg.closePath(); };
    let bp = null, n = 0;
    const strips = [];
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      const cxw = cx * 32 + 16, cyw = cy * 32 + 16;
      const sx = (cxw - cyw) - X0, sy = (cxw + cyw) / 2 - Y0;
      if (sx < -46 || sx > GT_W + 46 || sy < -26 || sy > GT_H + 26) continue;
      let zMeta = null;
      for (let zi = 0; zi < zlist.length; zi++) {
        const zm = zlist[zi], ox = zm.worldOffsetX, oy = zm.worldOffsetY || 0;
        if (cxw >= ox && cxw < ox + (zm.zoneWidth || 100000) && cyw >= oy && cyw < oy + (zm.zoneHeight || 100000)) { zMeta = zm; break; }
      }
      if (!zMeta) continue;
      if (isWaterAtAbs(cxw, cyw, zMeta) || isRockAtAbs(cxw, cyw, zMeta)) continue;   // 뭍 셀만
      for (let k = 0; k < 4; k++) {
        const nx = [1, -1, 0, 0][k], ny = [0, 0, 1, -1][k];
        if (!isWaterAtAbs(cxw + nx * 32, cyw + ny * 32, zMeta)) continue;
        const m = _shoreMargin(cx, cy, k);
        if (m < 1.2) continue;                       // ★여백 0 구간 — 풀이 물까지 간다(있어야 띠가 아니다)
        if (!bp) bp = t.createPattern(_shBladeMask(true), 'repeat');   // 잎 **모양** 알파(밝은 곳=잎)
        // 이웃(물) 다이아몬드를 **뭍 쪽으로** m 밀면, 뭍 다이아몬드와 겹치는 부분 = 공유 변에서 폭 m 띠
        const nsx = sx + (nx - ny) * 32, nsy = sy + (nx + ny) * 16;
        const ox = (-nx + ny) * m, oy = -(nx + ny) * m / 2;           // 뭍 방향 m
        t.save();
        dia(t, sx, sy); t.clip();                                     // 뭍 셀 밖으로 안 샌다
        t.fillStyle = '#fff'; dia(t, nsx + ox, nsy + oy); t.fill();   // 알파 = 여백 띠
        // ★안쪽 경계를 잎 모양으로 판다. '뭍 다이아몬드를 물 쪽으로 f·m 민 것' = 깊이 ≥ f·m 영역.
        t.globalCompositeOperation = 'destination-out';
        t.fillStyle = bp;
        t.globalAlpha = 1;    dia(t, sx - ox * 0.45, sy - oy * 0.45); t.fill();
        t.globalAlpha = 0.55; dia(t, sx - ox * 0.18, sy - oy * 0.18); t.fill();
        t.restore();
        strips.push([sx, sy, nsx + ox * 0.42, nsy + oy * 0.42]);
        n++;
      }
    }
    if (!n) return 0;
    // 색 입히기 — 마른 흙/모래 텍스처. 타일 원점이 주기의 배수라 **지면 바탕과 같은 위상**이다.
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = 1;
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = t.createPattern(GTEX.dry_angled, 'repeat'); t.fillRect(0, 0, GT_W, GT_H);
    // ★물에 닿는 쪽만 **젖은 모래**로 어둡게. 여백 전체를 어둡게 하면 그게 또 띠다 —
    //   마른 쪽(안)과 젖은 쪽(밖)이 갈려야 '모래톱'으로 읽힌다.
    for (const [sx, sy, wx2, wy2] of strips) {
      t.save();
      dia(t, sx, sy); t.clip();
      t.globalCompositeOperation = 'source-atop';
      t.fillStyle = 'rgba(62,56,44,0.30)';
      dia(t, wx2, wy2); t.fill();
      t.restore();
    }
    t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
    g.drawImage(_shTmp, 0, 0);
    // ★잎 층 투과율에서도 같은 만큼 지운다 — 안 하면 **모래 위에 풀잎이 흔들린다**
    //   (1패스 실측: 강가 항등식 평균 |Δ| 6.21 · 12.97% 어긋남. 초원은 0.395 라 여기가 범인이었다.)
    if (gm) gm.drawImage(_shTmp, 0, 0);
    return n;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[재민 지적 2026-08-06] "물가에서 풀의 튀어나온 부분이 물에 가려진다 — 3D가 아니라서 못 고치나?"
  //   **3D 문제가 아니다.** 원인은 클리핑과 순서다:
  //     ① `_bakeGroundTile` 이 풀 텍스처를 깔고, 물 셀 자리를 **진흙 다이아몬드로 덮어쓴다**
  //        ⇒ 풀잎이 셀 다이아몬드 변에서 **칼로 자른 듯** 끊긴다.
  //     ② 그 위에 물 셰이더가 또 덮는다.
  //   ⇒ 고치는 법: **같은 풀 텍스처를 물 쪽으로 조금 더 그리되, 물보다 나중에** 그린다.
  //      텍스처 자체가 이미 게임 카메라 각도로 구워져 있어 잎이 제대로 누워 있다 —
  //      우리가 할 일은 그 잎을 **셀 경계에서 자르지 않는 것**뿐이다.
  //
  //   ★심는 게 아니다. 포기를 새로 얹지 않는다 — 뭍 셀의 **자기 풀**을 물 위로 몇 px 넘길 뿐이다.
  //   ★층 3장(길이 다른 잎)으로 알파를 떨어뜨리고 자리 해시로 길이를 흩어 **가장자리를 너덜하게** 한다.
  //     한 겹 균일 띠로 그리면 물가에 초록 테이프를 붙인 것처럼 보인다.
  //   ★순서: 물 셰이더 → 프리즘 단면 → **여기(넘김)** → 물가 술 → 안개.
  //   ★1패스 실패 — 재민: "물가에 어색한 띠 같은 게 왜 생긴 거야.. 너무 부자연스럽잖아."
  //     맞다. 두 가지가 겹친 내 잘못이다:
  //       ⓐ **반투명으로 깔았다**(알파 .30/.55/.85). 반투명 초록을 밝은 물 위에 얹으면
  //          풀이 아니라 **뿌연 안개 띠**가 된다 — 잎이 아니라 색이 번진 것처럼 보인다.
  //       ⓑ **셀 다이아몬드를 통째로 밀었다.** 한 셀의 변 전체가 같은 폭으로 나가니
  //          결과가 **일정한 폭의 띠**다. 실루엣이 직선이면 뭘 해도 띠로 읽힌다.
  //     ⇒ 고침: **불투명하게** 깔고(잎이 있는 곳은 진짜 풀색), 바깥쪽을 **얼룩 마스크로 갉아**
  //       실루엣을 잎 단위로 부순다. 넘김 길이도 짧게(최대 7px) — 길수록 띠가 된다.
  //   ★★★결론(재민 3차 판정): **반려. 기본값 OFF(`shoreOff: true`).**
  //     3패스(잎 마스크)까지 가도 재민 판정은 *"after가 여전히 더 심해"* 였다.
  //     즉 넘김을 어떻게 다듬든 **물가에 띠가 하나 더 생기는 것**이 문제의 본질이다.
  //     ⇒ 코드는 손잡이 뒤에 남겨 둔다(`__terrain19.shoreOff = false` 로 켜진다). 켜지 마라.
  //     ⇒ ★재민 관측: "before도 좀 있고" — **넘김을 꺼도 남는 얇은 띠**가 있다. 그건 내 층이 아니라
  //       배치 19 `_drawPrisms` 의 **'상단 풀 넘김 립'**(프리즘 윗변의 밝은 초록 선)이다.
  //       거기가 진짜 손댈 자리다(회부 — 보고서 §6-d).
  const SH_PUSH = 7;               // 최대 넘김(px). 길면 '물 위에 뜬 풀'이 되고 띠로 읽힌다
  //     ★2패스도 실패했다 — 합성 얼룩(2px 격자 해시)으로 깎았더니 이번엔 **디더 격자 무늬**가 보였다.
  //       규칙적으로 반복되는 마스크는 무엇을 해도 '무늬'로 읽힌다.
  //     ⇒ 3패스: **풀 텍스처 자신의 잎 모양으로 깎는다.** 어두운 곳(잎 사이 틈)을 파내고
  //       밝은 곳(잎)만 남기면 실루엣이 **진짜 잎 끝**을 따라간다. 마스크는 풀과 **정합**돼야
  //       하므로 같은 변환 아래에서 같은 다이아몬드로 칠한다(translate 로 함께 민다).
  //   ★`inv=true` 는 **반대 알파**다(밝은 곳 = 잎 = 알파 1). 물가 여백이 모래를 **잎 모양으로**
  //     파낼 때 쓴다 — 잎 자리를 파야 풀잎이 모래 쪽으로 삐져나온다.
  const _shMaskCache = { 0: null, 1: null };
  function _shBladeMask(inv) {
    const key = inv ? 1 : 0;
    if (_shMaskCache[key]) return _shMaskCache[key];
    const src = GTEX.grass_angled;
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(src, 0, 0);
    const im = tg.getImageData(0, 0, w, h), d = im.data;
    // 중앙값 근처를 문턱으로 — 텍스처가 바뀌어도 따라간다(고정 문턱은 텍스처 교체에 깨진다)
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const mid = sum / (d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      // 어두울수록 많이 파낸다(잎 사이 틈) · 밝으면 남긴다(잎)   ※inv = 그 반대(잎 자리를 판다)
      let a = inv ? (lum - (mid - 6)) / 26 : (mid + 6 - lum) / 26;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = Math.round(a * 255);
    }
    tg.putImageData(im, 0, 0);
    _shMaskCache[key] = t; return t;
  }
  const _shoreTiles = new Map();
  function _bakeShoreTile(itx, ity, zlist) {
    const X0 = itx * GT_W, Y0 = ity * GT_H;
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const [ix, iy] of [[X0, Y0], [X0 + GT_W, Y0], [X0, Y0 + GT_H], [X0 + GT_W, Y0 + GT_H]]) {
      const wx = (2 * iy + ix) / 2, wy = (2 * iy - ix) / 2;
      if (wx < mnx) mnx = wx; if (wx > mxx) mxx = wx;
      if (wy < mny) mny = wy; if (wy > mxy) mxy = wy;
    }
    const c0x = Math.floor(mnx / 32) - 1, c1x = Math.ceil(mxx / 32) + 1;
    const c0y = Math.floor(mny / 32) - 1, c1y = Math.ceil(mxy / 32) + 1;
    let cv = null, g = null, pat = null, spat = null, n = 0;
    const dia = (gg, sx, sy) => { gg.beginPath(); gg.moveTo(sx, sy - 16); gg.lineTo(sx + 32, sy); gg.lineTo(sx, sy + 16); gg.lineTo(sx - 32, sy); gg.closePath(); };
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      const cxw = cx * 32 + 16, cyw = cy * 32 + 16;
      const sx = (cxw - cyw) - X0, sy = (cxw + cyw) / 2 - Y0;
      if (sx < -46 || sx > GT_W + 46 || sy < -26 || sy > GT_H + 26) continue;
      if (!isWaterAtAbs(cxw, cyw)) continue;                 // 넘김은 **물 셀 안에만** 그린다
      for (let k = 0; k < 4; k++) {
        const nx = [1, -1, 0, 0][k], ny = [0, 0, 1, -1][k];
        const lxw = cxw - nx * 32, lyw = cyw - ny * 32;
        if (isWaterAtAbs(lxw, lyw) || isRockAtAbs(lxw, lyw)) continue;
        if (!cv) {
          cv = document.createElement('canvas'); cv.width = GT_W; cv.height = GT_H;
          g = cv.getContext('2d');
          pat = g.createPattern(GTEX.grass_angled, 'repeat');   // 타일 원점이 주기의 배수 → 오프셋 0
          spat = g.createPattern(_shBladeMask(), 'repeat');      // 풀과 **정합**되는 잎 마스크
        }
        const lsx = (lxw - lyw) - X0, lsy = (lxw + lyw) / 2 - Y0;
        const d = SH_PUSH * (0.6 + 0.8 * _cellHash(cx, cy, 3100 + k));   // 자리별 길이 — 폭이 일정하면 띠다
        const ox = (nx * d) - (ny * d), oy = ((nx * d) + (ny * d)) / 2;
        g.save();
        dia(g, sx, sy); g.clip();                       // 물 셀 안으로만
        g.translate(ox, oy);                            // ★뭍의 풀을 **텍스처째** 민다(마스크와 정합)
        g.globalAlpha = 1;                              // ★불투명 — 반투명은 풀이 아니라 안개가 된다
        g.fillStyle = pat; dia(g, lsx, lsy); g.fill();
        // 잎 사이 틈을 파낸다 — 실루엣이 진짜 잎 끝을 따라간다(합성 얼룩은 격자 무늬가 된다)
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = spat;
        g.globalAlpha = 1;   dia(g, lsx + ox * 0.55, lsy + oy * 0.55); g.fill();  // 끝쪽 — 잎만 남는다
        g.globalAlpha = 0.5; dia(g, lsx, lsy); g.fill();                          // 안쪽 — 절반만 성글게
        g.restore();
        n++;
      }
    }
    return cv ? { cv, n } : { cv: null, n: 0 };
  }

  // ★★[재민 2026-08-24 "1셀 두께로 줄무늬, 위치가 엇갈려 있다"] 다이아몬드 **이음매**.
  //   셀을 한 장씩 칠하면 맞닿은 변에서 캔버스 안티앨리어싱이 양쪽 다 부분 피복을 내고,
  //   둘을 겹쳐도 100% 가 안 돼(0.5 + 0.5·0.5 = 0.75) **1px 짜리 틈**이 남는다.
  //   실측: 물밑 상자에서 픽셀의 **7.07%** 가 가로 어두운 선이었다. 초원에서는 풀 질감이 가려
  //   안 보이는데, 반투명한 얕은 물 밑은 배경이 매끈해서 그대로 드러난다(재민이 본 그 격자).
  //   ⇒ **불투명하게 칠하는 경우에만** 도형을 수직으로 GT_DIA_GROW 만큼 부풀려 이웃과 겹친다.
  //     반투명 층은 부풀리면 겹친 자리가 두 번 섞여 **반대 부호의 줄**이 생기므로 건드리지 않는다.
  //     (중심에서 변까지 거리는 32·16/√(32²+16²) = 14.31px 이라 배율은 1 + grow/14.31 이다.)
  const GT_DIA_GROW = 0.75;
  const GT_DIA_K = 1 + GT_DIA_GROW / 14.311;
  function _diaPath(g, cx, cy, grow) {
    const dx = grow ? 32 * GT_DIA_K : 32, dy = grow ? 16 * GT_DIA_K : 16;
    g.beginPath(); g.moveTo(cx, cy - dy); g.lineTo(cx + dx, cy); g.lineTo(cx, cy + dy); g.lineTo(cx - dx, cy); g.closePath();
  }
  //   ★`gm` = 투과율 캔버스. 같은 도형·같은 알파로 지운다(destination-out) — T ×= (1−α).
  function _covDia(gm, cx, cy, alpha) {
    if (!gm || alpha <= 0) return;
    gm.globalAlpha = Math.min(1, alpha); gm.fillStyle = '#000';
    _diaPath(gm, cx, cy, alpha >= 0.999); gm.fill(); gm.globalAlpha = 1;
  }
  function _gtDiamond(g, cx, cy, color, alpha, gm) {
    if (alpha <= 0) return;
    const grow = alpha >= 0.999;
    g.globalAlpha = alpha; g.fillStyle = color;
    _diaPath(g, cx, cy, grow); g.fill(); g.globalAlpha = 1;
    if (gm) {
      gm.globalAlpha = alpha; gm.fillStyle = '#000';
      _diaPath(gm, cx, cy, grow); gm.fill(); gm.globalAlpha = 1;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 20 실장 B] 타일 상태계 — 상태 벡터 → 레이어 합성
  //   재민 확정: *"비옥도에 따라 모든 타일이 디자인이 바뀌어야… 번영도·경작·길·채굴에 따라서도"*
  //              *"경계마다 딱딱 나누지 말고 연속적으로"*  *"돌만 놓으면 그게 산터냐"*
  //   축 5개(합성 순서): ①기반 바이옴×지질 ②채굴(=번영도 거울) ③비옥도 ④경작 ⑤답압(길)
  //   시안 정본: scripts/mock-fertility-gradient.js · mock-tile-axes.js (문턱·진폭 그대로).
  //   ★전이는 전부 smoothstep + **셀 노이즈로 흔든 문턱** — 균일 페이드가 아니라 뙈기로 번진다.
  //   ★Math.random() 금지: 소품 자리·문턱은 전부 셀 해시(결정론 — 프레임마다 안 흔들린다).
  // ═══════════════════════════════════════════════════════════════════════════
  const TS_SOIL_Q = 16;
  const _smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // 이웃이 상관된 저주파 잡음(뙈기) — 기준선과 **같은 1부**(public/soil-base.js)를 쓴다. 사본 금지.
  const _SB = () => (typeof SoilBase !== 'undefined' ? SoilBase : null);

  // 상태 조회 ─ 전부 존-로컬 셀 좌표. 동적 레코드가 없으면 기준선(정적 지형 파생)이다.
  function _tsSoil(lcx, lcy, kind, rec) {
    if (rec) return rec.v;
    const S = _SB(); return S ? S.baseAt(kind, lcx, lcy) : 800;
  }
  // 경작 셀 — farmland 건물 집합(그릴 때마다 건물 전체를 훑지 않게 캐시. 건물 수가 바뀌면 재구축)
  let _farmCells = null, _farmVer = -1;
  let _gtKnob = null;   // 손잡이 상태 지문 — 바뀌면 구워 둔 타일을 버린다
  function _tsFarmSet(pc) {
    if (!pc) return null;
    if (_farmCells && _farmVer === pc.buildings.size) return _farmCells;
    const s = new Set();
    for (const b of pc.buildings.values()) {
      if (b.type !== 'farmland') continue;
      s.add(Math.floor(b.x / CL_BUILDING_SIZE) + ',' + Math.floor(b.y / CL_BUILDING_SIZE));
    }
    _farmCells = s; _farmVer = pc.buildings.size;
    return s;
  }
  // 상태 변경분 적재 — `tile_state` 방송과 하네스 주입이 **같은 입구**를 쓴다(우회로 금지).
  //   flat = [cx,cy,qv,geo,ore,...] · qv<0 은 기준선 복귀(레코드 삭제).
  function _tsIngest(c, flat) {
    if (!c) return 0;
    if (!c.soil) c.soil = new Map();
    let n = 0;
    for (let i = 0; i + 4 < flat.length; i += 5) {
      const k = flat[i] + ',' + flat[i + 1];
      if (flat[i + 2] < 0) c.soil.delete(k);
      else c.soil.set(k, { v: flat[i + 2] * TS_SOIL_Q, geo: flat[i + 3] | 0, ore: flat[i + 4] | 0 });
      n++;
    }
    _gtInvalidateCells(c, flat, 5);   // ★바뀐 셀이 걸친 타일만 재베이크 — 전체 clear 는 히치다
    return n;
  }
  // ★★[날씨 축] econ 이 마을마다 돌리는 단기 날씨를 **땅에** 드러낸다.
  //   지금까지 `_weather` 는 서버 머릿속에만 있었다 — 가뭄이 들어 생산이 ×0.65 가 돼도
  //   지도에는 아무 일도 안 일어났다. 서버가 **econ 이 실제로 쓰는 fertility 계수를 그대로**
  //   보내오므로(사본 없음), 여기서는 그 수로 **유효 토양치**를 곱하기만 한다:
  //     soilEff = soil × (1 + (fert − 1) × 감쇠)
  //   ⇒ 가뭄이 들면 그 마을 들판이 마르고, 끝나면 돌아온다. 저장은 한 바이트도 안 늘어난다
  //     (동적 토양치는 그대로 — 날씨는 **렌더 전용 유효값**이다. 두 번째 진실을 만들지 않는다).
  const WX_FALL = 0.72;        // 이 비율까지는 온전히, 그 밖으로 1.0 까지 부드럽게 사라진다
  // ★날씨 세기 — econ 계수를 **그대로 곱하면 과하다.** 실측: 토양치 760 에 가뭄(×0.65)을 곱하면
  //   494 가 되는데, 풀 램프의 가파른 구간(430~980) 한복판이라 초록이 78% → **0.5%** 로 무너졌다.
  //   7~14일짜리 가뭄이 마을 들판을 사막으로 만드는 건 고증도 의도도 아니다.
  //   ⇒ econ 계수는 **생산**에 걸리는 값이지 그림의 세기가 아니다. 부호와 비율은 그대로 두고
  //     진폭만 눌러 "마른다/짙어진다"로 읽히게 한다(가뭄이면 유효 토양치 ×0.86 쯤).
  const WX_STRENGTH = 0.40;
  function _wxRadiusPx(v) { return Math.max(v.tr || 0, v.r || 0, 640) * 1.25; }
  // 날씨 변경분 적재 — `sim_village_day` 방송과 하네스 주입이 **같은 입구**를 쓴다(우회로 금지).
  //   wxMap: { 마을id → [이름, fertility계수] | null }
  function _wxIngest(c, wxMap) {
    if (!c || !c.simVillages || !wxMap) return 0;
    let changed = 0;
    for (const v of c.simVillages) {
      const nw = wxMap[v.id] !== undefined ? (wxMap[v.id] || null) : (v.wx || null);
      const ow = v.wx || null;
      if ((!nw && !ow) || (nw && ow && nw[0] === ow[0] && nw[1] === ow[1])) continue;
      v.wx = nw; changed++;
      _gtInvalidateAround(c, v.cx, v.cy, _wxRadiusPx(v));   // 그 마을 둘레 타일만
    }
    return changed;
  }
  function _wxListOf(c) {      // 날씨가 걸린 마을만 — 보통 0~5곳이라 셀당 비용이 사실상 0
    if (!c || !c.simVillages || _t19.wxOff) return null;
    const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
    let out = null;
    for (const v of c.simVillages) {
      if (!v.wx || !(v.wx[1] >= 0) || v.wx[1] === 1) continue;   // 안개처럼 fertility 안 건드리는 건 땅에 안 그린다
      const R = _wxRadiusPx(v);
      (out || (out = [])).push({ x: ox + v.cx * CL_BUILDING_SIZE + 16, y: oy + v.cy * CL_BUILDING_SIZE + 16, R, f: v.wx[1] });
    }
    return out;
  }
  function _wxMulAt(list, wx2, wy2) {
    if (!list) return 1;
    let m = 1;
    for (let i = 0; i < list.length; i++) {
      const w = list[i], dx = wx2 - w.x, dy = wy2 - w.y;
      const d = Math.sqrt(dx * dx + dy * dy); if (d >= w.R) continue;
      const t = 1 - _smooth(w.R * WX_FALL, w.R, d);        // 안쪽은 1, 가장자리로 갈수록 0
      const mm = 1 + (w.f - 1) * t * WX_STRENGTH;
      if (Math.abs(mm - 1) > Math.abs(m - 1)) m = mm;      // 겹치면 **더 센 쪽**이 이긴다(합치면 과장된다)
    }
    return m;
  }
  // 월드 원(중심·반경 px) 안의 타일을 버린다 — 날씨가 바뀐 마을 둘레만.
  function _gtInvalidateAround(c, vcx, vcy, rPx) {
    if (!c || !c.meta) return;
    const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
    const wx2 = ox + vcx * CL_BUILDING_SIZE + 16, wy2 = oy + vcy * CL_BUILDING_SIZE + 16;
    // 월드 원 → iso 로 보내면 마름모라, 그 외접 사각형의 타일을 전부 버린다(넉넉히·안전하게)
    const c0 = w2i(wx2 - rPx, wy2 - rPx), c1 = w2i(wx2 + rPx, wy2 - rPx);
    const c2 = w2i(wx2 - rPx, wy2 + rPx), c3 = w2i(wx2 + rPx, wy2 + rPx);
    const xs = [c0.x, c1.x, c2.x, c3.x], ys = [c0.y, c1.y, c2.y, c3.y];
    const t0x = Math.floor(Math.min(...xs) / GT_W), t1x = Math.floor(Math.max(...xs) / GT_W);
    const t0y = Math.floor(Math.min(...ys) / GT_H), t1y = Math.floor(Math.max(...ys) / GT_H);
    for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) _groundTiles.delete(tx + '_' + ty);
  }
  // 바뀐 셀이 걸친 타일만 버린다 — 전체 clear 는 화면 전체 재베이크라 히치가 된다.
  function _gtInvalidateCells(c, flat, stride) {
    if (!flat || !flat.length || !c || !c.meta) return;
    const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
    const seen = new Set();
    for (let i = 0; i + 1 < flat.length; i += stride) {
      const wx = (ox / CL_BUILDING_SIZE + flat[i] + 0.5) * 32, wy = (oy / CL_BUILDING_SIZE + flat[i + 1] + 0.5) * 32;
      const ix = wx - wy, iy = (wx + wy) / 2;
      // 셀 다이아(64×32)가 타일 경계를 걸칠 수 있어 ±반셀 네 귀퉁이를 전부 무효화한다
      for (const [dx, dy] of [[-32, -16], [32, -16], [-32, 16], [32, 16]]) {
        const k = Math.floor((ix + dx) / GT_W) + '_' + Math.floor((iy + dy) / GT_H);
        if (seen.has(k)) continue; seen.add(k); _groundTiles.delete(k);
      }
    }
  }

  // 한 셀의 상태 레이어를 타일 캔버스에 얹는다. sx,sy = 타일 안 셀 중심.
  //   pat: 이 타일에 이미 만들어 둔 패턴들(타일당 1회 생성 — 셀마다 createPattern 하면 베이크가 3배 느려진다)
  //   ★[풀 카펫 흔들림] `gm` 은 잎 층의 **투과율** 캔버스다. 이 함수의 칠 로직은 한 줄도 안 바꾼다 —
  //     각 갈래가 **실제로 덮는 총 알파**를 그 갈래에서 이미 계산하고 있으므로, 그 값으로
  //     같은 다이아몬드를 지우기만 한다. (산터는 불투명 → 1)
  function _gtPaintState(g, sx, sy, st, lcx, lcy, pat, bio, gm) {
    const S = _SB(); if (!S) return;
    const B = bio || S.biomeOf('forest');   // ★바이옴 램프 표 — 같은 토양치라도 땅마다 다르게 번역된다
    const clip = () => { g.save(); g.beginPath(); g.moveTo(sx, sy - 16); g.lineTo(sx + 32, sy); g.lineTo(sx, sy + 16); g.lineTo(sx - 32, sy); g.closePath(); g.clip(); };
    const fillPat = (p, a) => { if (a <= 0.004) return; g.globalAlpha = Math.min(1, a); g.fillStyle = p; g.fillRect(sx - 33, sy - 17, 66, 34); g.globalAlpha = 1; };
    // 문턱을 흔드는 저주파 잡음 — 셀 좌표계(4.8셀 규모 얼룩 = 시안의 x/38 과 같은 눈)
    const nz = S.vnoise(lcx / 4.8, lcy / 4.8), nz2 = S.vnoise(lcx / 1.7 + 31, lcy / 1.7 + 7);
    const jit = (nz - 0.5) * 260 + (nz2 - 0.5) * 90;

    if (st.geo) {
      _covDia(gm, sx, sy, 1);            // 산터는 암반으로 통째로 덮는다 — 잎 0
      // ── ①-지질: 산터 램프 ────────────────────────────────────────────────
      //   ★재민: "돌만 놓으면 그게 산터냐" — 기본 재질이 **암반**이다. 비옥도는 이끼·틈새 풀만
      //     늘리고 **풀밭이 되지 않는다**(상한). 시안 정본 mock-fertility-gradient 줄 2 그대로.
      clip();
      g.fillStyle = '#6b665e'; g.fillRect(sx - 33, sy - 17, 66, 34);
      for (let k = 0; k < 14; k++) {                       // 부순 돌 알갱이
        const rx = sx - 30 + S.hash(lcx, lcy, 81 + k) * 60, ry = sy - 15 + S.hash(lcx, lcy, 141 + k) * 30;
        g.fillStyle = S.hash(lcx, lcy, 201 + k) < 0.5 ? 'rgba(52,49,44,0.5)' : 'rgba(122,116,106,0.45)';
        g.fillRect(rx, ry, 2 + 4 * S.hash(lcx, lcy, 261 + k), 1.6 + 3 * S.hash(lcx, lcy, 321 + k));
      }
      for (let k = 0; k < 3; k++) {                        // 균열
        let px = sx - 28 + S.hash(lcx, lcy, 86 + k) * 56, py = sy - 14 + S.hash(lcx, lcy, 96 + k) * 12;
        g.strokeStyle = 'rgba(38,35,31,0.7)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(px, py);
        for (let s2 = 0; s2 < 3; s2++) { px += (S.hash(lcx * 7 + s2, lcy, 88 + k) - 0.5) * 18; py += 4 + S.hash(lcx * 7 + s2, lcy, 89 + k) * 8; g.lineTo(px, py); }
        g.stroke();
      }
      // 이끼 — 자리별 고유 문턱 400~950, 문턱 근처 ±90 에서 연속 증가(정수 개수 계단 없음)
      for (let k = 0; k < 5; k++) {
        const px = sx - 26 + S.hash(lcx, lcy, 91 + k) * 52, py = sy - 12 + S.hash(lcx, lcy, 111 + k) * 24;
        const thr = B.rock[0] + (B.rock[1] - B.rock[0]) * S.hash(lcx, lcy, 131 + k);
        const a = _smooth(thr, thr + 90, st.soil) * (0.28 + 0.3 * S.hash(lcx, lcy, 151 + k));
        if (a > 0.02) { g.fillStyle = 'rgba(74,96,52,' + a.toFixed(3) + ')'; g.beginPath(); g.ellipse(px, py, 3 + 7 * S.hash(lcx, lcy, 171 + k), 2 + 4 * S.hash(lcx, lcy, 191 + k), 0, 0, 6.3); g.fill(); }
      }
      // 틈새 풀 — 문턱 780~1000. ★상한이 낮아 토양치 1000 이어도 초원이 되지 않는다.
      for (let k = 0; k < 2; k++) {
        const px = sx - 20 + S.hash(lcx, lcy, 97 + k) * 40, py = sy - 8 + S.hash(lcx, lcy, 98 + k) * 16;
        const thr = 780 + 220 * S.hash(lcx, lcy, 99 + k);
        const a = _smooth(thr, thr + 70, st.soil);
        if (a > 0.02) {
          g.globalAlpha = a; g.strokeStyle = B.propG[(S.hash(lcx, lcy, 100 + k) * 2) | 0]; g.lineWidth = 1.3;
          for (let b3 = 0; b3 < 3; b3++) {
            const oxp = (S.hash(lcx, lcy, 101 + k * 3 + b3) - 0.5) * 5, hgt = (5 + 6 * S.hash(lcx, lcy, 111 + k * 3 + b3)) * a, ln = (S.hash(lcx, lcy, 121 + k * 3 + b3) - 0.5) * 5;
            g.beginPath(); g.moveTo(px + oxp, py); g.quadraticCurveTo(px + oxp + ln * 0.4, py - hgt * 0.6, px + oxp + ln, py - hgt); g.stroke();
          }
          g.globalAlpha = 1;
        }
      }
      g.restore();
      return;
    }

    // ── ③-비옥도: 일반 타일 램프 ─────────────────────────────────────────────
    //   바탕(풀)은 이미 타일에 깔려 있다. 여기서는 **깎아 내려간다** — 시안과 같은 연속 함수의
    //   여집합이라 그림은 같고, 대부분(토양치 높음)의 셀에서 비용이 0 이다.
    const x = st.soil + jit;
    // ★바이옴 표의 문턱을 쓴다. capG 는 **초록 상한** — 사막이 토양치 1000 이어도 초원이 되지
    //   않는다(산터 램프와 같은 사고: "돌만 놓으면 그게 산터냐" 의 바이옴판).
    const grA0 = _smooth(B.grass[0], B.grass[1], x) * B.capG;
    const dryA = 1 - grA0;
    const mudA = 1 - _smooth(B.dry[0], B.dry[1], x);
    // ── ⑤-답압(길): 가운데부터 다져진다(mock-tile-axes 줄 1) ─────────────────
    const wearA = st.road === 2 ? 0.88 : (st.road === 1 ? _smooth(0, 1, 0.42 + (nz - 0.5) * 0.5) : 0);
    // ── ④-경작: 갈아엎은 흙 + 이랑(mock-tile-axes 줄 2) ─────────────────────
    const tillA = st.till > 0 ? _smooth(120, 520, st.till + (nz - 0.5) * 220) : 0;
    // ── ②-채굴(번영도 거울): 판 자리는 흙이 드러나고 어두워진다 ────────────────
    const oreA = st.ore < 15 ? (15 - st.ore) / 15 : 0;

    const anyMud = Math.max(mudA, wearA, tillA, oreA * 0.42);   // ★채굴분의 흙 알파를 낮춘다 — 매끈한 밝은 흙이 되면 '판 데'가 아니라 그냥 맨땅이다
    if (dryA <= 0.004 && anyMud <= 0.004) return;          // 손댈 게 없다(라이브 대다수가 여기)
    _covDia(gm, sx, sy, 1 - (1 - dryA) * (1 - anyMud));   // 두 층이 덮고 남긴 투과율만큼 잎도 줄어든다
    clip();
    if (dryA > 0.004) fillPat(pat.dry, dryA);
    if (anyMud > 0.004) fillPat(pat.mud, anyMud);
    if (wearA > 0.5) { g.globalAlpha = (wearA - 0.5) * 0.5; g.fillStyle = '#8a7a5e'; g.fillRect(sx - 33, sy - 17, 66, 34); g.globalAlpha = 1; }   // 다져진 흙 밝힘
    if (oreA > 0.2) {
      // ★판 자리는 **판 자국**이어야 한다 — 첫 실장은 매끈한 밝은 흙이라 "판 데"로 안 읽혔다
      //   (실측: 휘도가 96 → 109 로 **밝아졌다**). 부순 돌 알갱이 + 그늘로 파헤친 결을 준다.
      g.globalAlpha = oreA * 0.58; g.fillStyle = '#3a332b'; g.fillRect(sx - 33, sy - 17, 66, 34); g.globalAlpha = 1;
      const S2 = _SB();
      for (let k = 0; k < 10; k++) {
        if (S2.hash(lcx, lcy, 611 + k) > oreA) continue;    // 많이 팔수록 자갈이 는다(연속)
        const rx = sx - 28 + S2.hash(lcx, lcy, 621 + k) * 56, ry = sy - 13 + S2.hash(lcx, lcy, 641 + k) * 26;
        g.fillStyle = S2.hash(lcx, lcy, 661 + k) < 0.5 ? 'rgba(46,42,36,0.62)' : 'rgba(128,120,108,0.5)';
        g.fillRect(rx, ry, 2 + 3.5 * S2.hash(lcx, lcy, 681 + k), 1.4 + 2.6 * S2.hash(lcx, lcy, 701 + k));
      }
    }
    if (st.till > 0) {  // 이랑 — 경작 진행에 따라 또렷해짐. iso 다이아 결을 따르는 대각선.
      const rA = _smooth(350, 950, st.till);
      if (rA > 0.01) {
        g.globalAlpha = rA * 0.55;
        for (let d = -16; d <= 16; d += 6.5) {
          g.strokeStyle = '#4a3a26'; g.lineWidth = 2.2;
          g.beginPath(); g.moveTo(sx - 32, sy + d + 16); g.lineTo(sx + 32, sy + d - 16); g.stroke();
          g.strokeStyle = 'rgba(150,124,90,0.8)'; g.lineWidth = 1.1;
          g.beginPath(); g.moveTo(sx - 32, sy + d + 13.5); g.lineTo(sx + 32, sy + d - 18.5); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
    if (B.tintA > 0) { g.globalAlpha = B.tintA; g.fillStyle = B.tint; g.fillRect(sx - 33, sy - 17, 66, 34); g.globalAlpha = 1; }   // 바이옴 식생 색조
    // 소품 — **자리별 고유 문턱**(해시) + 문턱 근처에서 알파·크기 연속 증가(정수 계단 제거)
    for (let k = 0; k < 2; k++) {
      const px = sx - 24 + S.hash(lcx, lcy, 11 + k) * 48, py = sy - 10 + S.hash(lcx, lcy, 21 + k) * 20;
      const thrR = 400 * S.hash(lcx, lcy, 31 + k);                    // 자갈: 척박할수록 드러난다
      const aR = 1 - _smooth(thrR, thrR + 80, st.soil);
      if (aR > 0.03) {
        const rr = (2.2 + 2.6 * S.hash(lcx, lcy, 41 + k)) * (0.5 + 0.5 * aR);
        g.globalAlpha = Math.min(1, aR); g.fillStyle = B.propR;
        g.beginPath(); g.ellipse(px, py, rr, rr * 0.62, 0, 0, 6.3); g.fill();
        g.fillStyle = 'rgba(48,45,41,0.55)'; g.beginPath(); g.ellipse(px, py + rr * 0.35, rr * 0.9, rr * 0.35, 0, 0, 6.3); g.fill();
        g.globalAlpha = 1;
      }
      const thrT = 700 + 300 * S.hash(lcx, lcy, 51 + k);              // 풀포기: 비옥해지면 돋는다
      const aT = _smooth(thrT, thrT + 60, st.soil) * (1 - Math.max(wearA, tillA));
      if (aT > 0.03) {
        g.globalAlpha = aT; g.lineWidth = 1.3;
        g.strokeStyle = B.propG[(S.hash(lcx, lcy, 61 + k) * 3) | 0];
        for (let b3 = 0; b3 < 3; b3++) {
          const oxp = (S.hash(lcx, lcy, 71 + k * 3 + b3) - 0.5) * 6, hgt = (6 + 8 * S.hash(lcx, lcy, 81 + k * 3 + b3)) * aT, ln = (S.hash(lcx, lcy, 91 + k * 3 + b3) - 0.5) * 6;
          g.beginPath(); g.moveTo(px + oxp, py); g.quadraticCurveTo(px + oxp + ln * 0.4, py - hgt * 0.6, px + oxp + ln, py - hgt); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
    g.restore();
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 19 실장 B] 물 — 흐름맵 + WebGL 셰이더 레이어
  //   재민 확정 문법(시안 왕복 13회):
  //     ① 수면 = 지면 −5px 평면. 내 자리가 뭍이면 뭍 / 5px 위 표본이 뭍이면 단면 / 둘 다 물이면 수면.
  //     ② 얕은물 투명. 물밑 바닥 = **진흙 재질**(풀이 비치면 "반투명 풀" 사건). wa = 0.42+0.58×수심.
  //     ③ 블록 프리즘 단면은 **벡터**로 그린다(픽셀 패스가 아니라 — 아래 _drawPrisms).
  //     ④ 흐름맵 셰이더 물(유체 시뮬 아님·M&B 문법). 방향 = rivers path 최근접 구간(상류→하류).
  //        하구에서 감쇠 → 호수는 무방향. 바다는 해안 거리장 방향.
  //     ⑤ 포말 = **시간 고정**(흐르면 꼭짓점에서 깜빡인다) · 뭍이 북서일 때만 · 기울기 크기 문턱.
  //   ★물가는 **각진 블록**이다 — 셀 경계 그대로(곡선 스무딩 금지. 물길 파기와 문법 통일).
  //     ⇒ 마스크는 NEAREST 텍스처, 흐름·수심은 LINEAR 텍스처로 **따로** 보낸다.
  const WF_N = 128;              // 흐름/수심 텍스처 한 변(셀) — 화면(약 50셀)보다 넉넉
  const WF_QUANT = 16;           // 원점 양자화(셀) — 이만큼 움직여야 다시 굽는다
  const WATER_DROP = 5;          // ★재민 확정: 수면은 지면보다 5px 아래
  const WF_DEPTH_MAX = 6;        // 수심 정규화 상한(셀)
  // ★한 프레임에 물 판정에 쓰는 **시간** 상한(물가 렉 수리). 개수가 아니라 시간인 이유는
  //   아래 _buildFlowTex 주석 참조. 남은 칸은 다음 프레임에 마저 묻는다(_wfCache.pending).
  const WF_ASK_MS = 9;
  // ★물어볼 반경(셀). 창(WF_N=128, 반경 64)은 화면보다 **한참** 크다:
  //   iso 1400×900 화면의 월드 AABB 반경은 (2·450+700)/2 = 800px = **25셀**이고,
  //   원점이 WF_QUANT(16셀) 로 양자화돼 카메라가 중심에서 최대 8셀 어긋난다 ⇒ 33셀이면 덮는다.
  //   나머지 바깥 링은 **영영 안 물어본다** — 화면에 절대 안 나오는데 셀당 75µs 를 무는 건 순손실이고,
  //   그 링까지 채우려 들면 미결이 안 끝나 흐름 텍스처를 매 프레임 다시 굽게 된다(실측 92프레임 미수렴).
  const WF_ASK_R = 40;
  // 창 가운데부터 바깥으로 나가는 순회 순서(창 크기가 고정이라 한 번만 만든다 · 반경 밖은 제외)
  let _wfOrd = null;
  function _wfOrder(N) {
    if (_wfOrd && _wfOrd.N === N) return _wfOrd.a;
    const c = (N - 1) / 2, list = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const d = Math.max(Math.abs(i - c), Math.abs(j - c));   // 체비셰프 = 정사각 링
      if (d > WF_ASK_R) continue;
      list.push([j * N + i, d]);
    }
    list.sort((p, q2) => p[1] - q2[1]);
    _wfOrd = { N, a: Int32Array.from(list.map((v) => v[0])) };
    return _wfOrd.a;
  }
  const _wfCache = { key: null, ox: 0, oy: 0, bbox: null, rect: null, pending: false };
  let _flowCellCache = new Map();     // "cx_cy" → [dx,dy] (정적 — rivers 는 안 변한다)
  let _flowCellOld = new Map();       // 직전 세대(상한 초과 시 통째 clear 대신 밀어낸다 — 아래 주석)
  let _riverSegs = null;
  let _hardTerrain = null;   // /terrain.json 원본(위 선로딩이 채운다) — rivers path 의 유일한 출처
  function _buildRiverSegs() {
    // ★흐름 방향의 정본은 `hanbando-terrain.json` 의 rivers path 다(상류→하류 순서로 저장돼 있다).
    //   서버가 welcome 으로 준 hardcoded terrain 을 그대로 읽는다 — 사본을 만들지 않는다.
    _riverSegs = [];
    try {
      const H = _hardTerrain;
      for (const zid in (H || {})) {
        const z = zonesMeta[zid]; if (!z) continue;
        const ox = z.worldOffsetX, oy = z.worldOffsetY || 0;
        for (const r of (H[zid].rivers || [])) {
          let acc = 0;   // 이 강의 상류부터 잰 누적 호장(월드 px)
          for (let i = 0; i + 1 < r.path.length; i++) {
            const a = r.path[i].pos, b = r.path[i + 1].pos;
            // ★[재민 2026-08-24] 마디의 **폭**을 같이 싣는다. 흐름 주인을 '생거리 최근접'으로 고르면
            //   폭 235px 짜리 지류가 폭 1,027px 짜리 본류의 한복판을 빼앗는다(아래 _flowAtCell 주석).
            const wa = r.path[i].width || 0, wb = r.path[i + 1].width || 0;
            // ★★★[재민 2026-08-24 "번개모양 경계"] 마디의 **누적 호장(상류부터 잰 거리)** 을 싣는다.
            //   파도 위상을 `dot(w, dir)` 로 내면 dir 이 바뀌는 경계에서 위상이 통째로 튄다
            //   (w 가 절대 월드 좌표 ≈4.6e5 이라 dot 의 값이 파장 대비 사실상 난수다).
            //   ⇒ 위상의 정본을 **강을 따라 잰 거리 s** 로 바꾼다. s 는 폴리라인을 따라 연속이고
            //     ∇s = 흐름 방향이라, 방향이 꺾여도 위상이 안 끊긴다.
            const sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
            _riverSegs.push([ox + a[0], oy + a[1], ox + b[0], oy + b[1], i / Math.max(1, r.path.length - 2), wa, wb, acc, sl]);
            acc += sl;
          }
        }
      }
    } catch (e) { console.warn('[water] rivers 읽기 실패:', e.message); }
    return _riverSegs;
  }
  // ★★[배치 20 B 성능 수리 — 재민 실기 제보 "물 근처로 가니까 엄청나게 렉걸린다"]
  //   원인: `_flowAtCell` 이 셀마다 **강 구간 전체**(한반도 4,700+ 개)를 훑었다. 흐름 텍스처는
  //   128×128 = 16,384 셀이고 카메라가 16셀(512px) 움직일 때마다 통째로 다시 굽는다 ⇒ 새 지역에
  //   들어서면 한 프레임 안에서 최대 **7,700만 번**의 구간 거리 계산이 메인스레드에서 돈다.
  //   헤드리스 E2E 가 이걸 못 잡은 이유: 촬영을 **고정 지점**에서 했다 — 걷지 않으니 캐시가
  //   식지 않는다. 계측기가 실사용의 그 동작을 안 했다(하네스 오류 7건째. 판정이 아니라 대본이 틀렸다).
  //
  //   수리: 강 구간 **공간 격자 색인**. 결과는 한 비트도 안 바뀐다 —
  //   1400px 밖은 어차피 가중치 0(무방향)이라, 1400 반경 안만 뒤져도 '최근접'이 같기 때문이다.
  // ★[재민 2026-08-24] 영향 반경. 세기 감쇠를 **강폭 배수**로 재게 바꾸면서 함께 올렸다:
  //   한반도에서 가장 넓은 강이 width 1,783 이라 반폭 892, 영향 끝(반폭 2배)이 1,784px 다.
  //   1400 으로 두면 그 강의 바깥 링에서 후보 집합이 잘려 **공간 색인이 전수 순회와 갈린다**
  //   (색인 동치의 증명이 "반경 밖은 가중치 0" 에 걸려 있다 — 아래 _buildSegGrid 주석).
  const FLOW_R = 1800;                 // 이보다 멀면 흐름 0 (아래 w 식과 같은 수 — 사본 아님)
  const _segGrid = { B: 1024, map: null, ux: null, uy: null, built: 0 };
  function _buildSegGrid(segs) {
    // ★등록은 구간의 **AABB 가 겹치는 칸 전부**. 이게 동치의 증명이다:
    //   최근접점 q 는 반드시 구간의 AABB 안에 있고, |q−p| ≤ 1400 이면 bucket(q) 는 아래 탐색
    //   범위 안이다 ⇒ 그 구간은 반드시 후보에 들어온다. (구간 위 점을 성기게 표본해 등록하면
    //   대각으로 스쳐 지나는 칸을 빠뜨린다 — 실측 5,000점 중 33점 불일치로 잡았다.)
    const B = _segGrid.B, m = new Map();
    const ux = new Float32Array(segs.length), uy = new Float32Array(segs.length);
    for (let i = 0; i < segs.length; i++) {
      const s2 = segs[i];
      const x0 = Math.floor(Math.min(s2[0], s2[2]) / B), x1 = Math.floor(Math.max(s2[0], s2[2]) / B);
      const y0 = Math.floor(Math.min(s2[1], s2[3]) / B), y1 = Math.floor(Math.max(s2[1], s2[3]) / B);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const k = gx + ',' + gy; let a = m.get(k); if (!a) m.set(k, a = []); a.push(i);
      }
      // 단위 방향은 구간마다 불변이라 여기서 한 번만 낸다(셀마다 sqrt 를 다시 물지 않는다).
      const dx = s2[2] - s2[0], dy = s2[3] - s2[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
      ux[i] = dx / L; uy[i] = dy / L;
    }
    _segGrid.map = m; _segGrid.ux = ux; _segGrid.uy = uy; _segGrid.built = segs.length;
    return m;
  }
  function _flowAtCell(cx, cy) {
    const k = cx + '_' + cy;
    const hit = _flowCellCache.get(k); if (hit) return hit;
    const old = _flowCellOld.get(k); if (old) { _flowCellCache.set(k, old); return old; }   // 세대 승격
    const segs = _riverSegs || _buildRiverSegs();
    if (!_segGrid.map || _segGrid.built !== segs.length) _buildSegGrid(segs);
    const px = cx * 32 + 16, py = cy * 32 + 16;
    const B = _segGrid.B;
    const _slow = !!_t19.slowFlow;   // 대조군: 색인 무시하고 전 구간 훑기(수리 전과 같은 비용)
    const g0x = _slow ? 0 : Math.floor((px - FLOW_R) / B), g1x = _slow ? -1 : Math.floor((px + FLOW_R) / B);
    const g0y = Math.floor((py - FLOW_R) / B), g1y = Math.floor((py + FLOW_R) / B);
    // ★★[재민 2026-08-24 "물이 북→남으로 흐르는데 화면에서 반대로 흐르는 띠가 있다"]
    //   진범은 **흐름 주인을 '생거리 최근접'으로 골랐던 것**이다. 여기(한여울강 × 닛폰대천 합류부)에서
    //     · 한여울강 — width 1,027 (반폭 513) · 중심선까지 545px  ⇒ 이 칸은 **본류 물속**이다
    //     · 닛폰대천 — width   235 (반폭 118) · 중심선까지 575px  ⇒ 제 물길에서 **반폭 4.9배** 밖
    //   인데 생거리로는 545 vs 575 라 30px 차로 갈릴 뿐이고, 두 강의 이등분선을 경계로 방향이
    //   **한 칸 만에 뒤집힌다**. 실측: 화면 안 물 셀 709개 중 228개가 화면 위로 흘렀고(닛폰대천 = 동→서),
    //   실제 픽셀 이동으로도 64px 블록 75개 중 9개가 -150°(나머지는 150°)였다.
    //   ※지금까지 세 번의 계측이 못 본 이유는 셋 다 움직임의 **크기**만 쟀기 때문이다 — 뒤집힌 띠는
    //     이웃과 속도가 같다. 방향을 재고 나서야 보였다.
    //   ⇒ 거리를 **강폭 단위**로 잰다: u = 중심선까지 거리 / 반폭. 그러면 본류 안에서는 본류가 이기고,
    //     지류는 제 물길 근처에서만 이긴다(그리고 거기선 실제로 지류 방향이 맞다).
    //   ※방향을 '섞는' 안은 **버렸다**. 이 셰이더의 파도 위상이 `dot(w, dir)` 인데 w 가 절대 월드
    //     좌표(≈4.6e5)라, dir 이 조금이라도 공간에 따라 변하면 위상 기울기가 |w|·|∇dir| 만큼
    //     증폭돼 파도가 통째로 에일리어싱된다. 실측: 물 픽셀 |라플라시안| 3.39 → 6.81 (2배),
    //     12배 확대에서 파도 줄무늬가 **모래알**로 무너졌다. 승자독식은 구역 안에서 ∇dir=0 이라 안전하다.
    let best = Infinity, bx = 0, by = 0, bi = Infinity, bhw = 1, bd2 = Infinity, bs = 0;
    const SU = _segGrid.ux, SV = _segGrid.uy;
    const _raw = !!_t19.flowRawDist;   // 대조군: 폭을 무시한 옛 생거리 최근접
    // 느린 대조군과 색인 경로가 **같은 식**을 쓰도록 본문을 한 군데만 둔다(둘이 갈리면 A/B 가 무의미).
    const _one = (si) => {
      const s2 = segs[si], ax = s2[0], ay = s2[1], dx = s2[2] - ax, dy = s2[3] - ay;
      const L2 = dx * dx + dy * dy || 1;
      let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const qx = ax + t * dx - px, qy = ay + t * dy - py, d2 = qx * qx + qy * qy;
      // 반폭은 마디 두 끝의 폭을 t 로 보간한다(폭은 상·하류로 서서히 변한다)
      const hw = Math.max(48, ((s2[5] + (s2[6] - s2[5]) * t) || 96) * 0.5);
      const sc = _raw ? d2 : d2 / (hw * hw);   // 폭 단위 거리의 제곱
      // ★동률은 **구간 번호가 작은 쪽**으로 깬다 — 폴리라인의 이웃 두 구간은 공유 꼭짓점에서
      //   거리가 정확히 같고 방향은 다르다. 전수 순회(번호순)와 답을 맞추려면 이 규칙이 필요하다.
      //   (이걸 안 넣으면 7,000 표본 중 4점이 갈렸다 — 전부 꼭짓점 최근접 점이었다.)
      if (sc < best || (sc === best && si < bi)) { best = sc; bi = si; bx = SU[si]; by = SV[si]; bhw = hw; bd2 = d2; bs = s2[7] + t * s2[8]; }
    };
    if (_slow) { for (let si = 0; si < segs.length; si++) _one(si); }
    for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
      const arr = _segGrid.map.get(gx + ',' + gy); if (!arr) continue;
      for (let n = 0; n < arr.length; n++) _one(arr[n]);
    }
    // 세기: 물길 안(반폭 이내)은 1, 반폭 2배에서 0. 강에서 멀면(호수·먼바다) 0 — 무방향 파문이 된다.
    //   ※옛 식은 700px 까지 1, 1400px 에서 0 인 **절대 거리**였다. 그러면 폭 235px 짜리 실개천이
    //     제 물길 밖 700px 까지 온 사방을 제 방향으로 물들인다 — 위 진범의 절반이 이것이었다.
    const dist = Math.sqrt(bd2);
    let w;
    if (_raw) {
      // 대조군은 **출시본 그대로** — 절대 거리 700/1400. (FLOW_R 을 1800 으로 넓힌 건 후보를 더
      //  찾을 뿐이라 이 식의 답을 바꾸지 않는다: 1400 밖은 어느 구간이 이기든 세기가 0 이다.)
      w = dist > 1400 ? 0 : (dist > 700 ? (1400 - dist) / 700 : 1);
    } else {
      const u = dist / bhw;
      w = dist > FLOW_R ? 0 : (u > 1 ? Math.max(0, 2 - u) : 1);
    }
    // 3번째 값 u = **강폭 단위 거리**(중심선까지 거리 / 반폭). 소비자는 [0],[1] 만 쓴다.
    //   하네스가 "역류하는 칸이 제 물길 **안**인가(u≤1 — 지류의 진짜 흐름)"를 판정하려면 이 값이
    //   필요한데, 하네스가 다시 계산하면 사본이다.
    // 4번째 값 s = **강을 따라 잰 거리**(월드 px). 파도 위상의 정본 — 아래 _buildFlowTex 가 mod 64 로 싣는다.
    const v = [bx * w, by * w, dist / bhw, bs];
    // ★전체 clear 금지 — 긴 강을 따라 걸으면 상한에서 캐시가 통째로 날아가 폭풍 재계산이 된다.
    //   두 세대로 굴린다: 상한을 넘으면 현 세대를 구 세대로 밀고 현 세대만 비운다(작업 집합 생존).
    if (_flowCellCache.size > 200000) { _flowCellOld = _flowCellCache; _flowCellCache = new Map(); }
    _flowCellCache.set(k, v);
    return v;
  }
  const _wfPrev = { ox: 0, oy: 0, wet: null };
  const _ZERO2 = [0, 0, 99, 0];
  const _WF_NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // 물 아닌 셀마다 배열을 새로 만들면 16,384개/장이 GC 로 간다
  function _buildFlowTex(gl, ocx, ocy) {
    // 수심 = 물가 거리장(BFS) → 3×3 평균 스무딩. 마스크는 셀 그대로(각진 블록).
    const N = WF_N, wet = new Uint8Array(N * N), dep = new Float32Array(N * N).fill(255);
    const q = new Int32Array(N * N); let qh = 0, qt = 0;
    // ★★[성능 수리 2/2] 물 판정 재사용 — `isWaterCellLocal` 은 셀당 20µs 급이라 16,384셀이면
    //   **331ms**(실측). 창은 WF_QUANT(16셀)씩만 움직이므로 직전 창과 87% 가 겹친다.
    //   겹치는 칸은 다시 묻지 않고 베껴 온다 ⇒ 걷는 동안의 비용이 1/8 로 떨어진다.
    //   (판정 자체는 그대로다 — 같은 셀의 답은 정적이라 베껴도 정본과 어긋날 수 없다.)
    // ★★[성능 수리 2/2 — 진범] 물 판정이 이 함수 비용의 **95%** 다(실측 분해: 총 435ms 중 399ms).
    //   `Terrain.isWaterCellLocal` 은 셀마다 강·호수 전체를 훑어 브라우저에서 셀당 ~75µs 다.
    //   ⚠그 함수는 **콜라이더 정본**이라 한 바이트도 못 고친다 — 고치면 이동·스폰·econ 이 흔들린다.
    //   ⇒ 렌더 쪽에서 두 겹으로 푼다:
    //     ① 직전 창과 겹치는 칸은 다시 묻지 않는다(주행 한 칸이면 76% 가 겹친다).
    //     ② 새로 물어야 할 칸은 **한 프레임에 정해진 개수까지만**. 남은 칸은 '아직 모름'(2)으로
    //        두고 다음 프레임에 마저 묻는다. 모르는 칸은 물을 안 그린다 —
    //        WF_N(128셀)은 화면(약 44셀)보다 훨씬 커서 미결 칸은 **화면 밖 여백**에 생긴다.
    //     ⇒ 한 프레임 400ms 정지 대신 몇 프레임에 나눠 진다.
    // wet 값: 0=뭍 · 1=물 · 2=아직 모름(다음 프레임에 다시 묻는다)
    const P = _t19.slowFlow ? null : _wfPrev.wet, dxp = ocx - _wfPrev.ox, dyp = ocy - _wfPrev.oy;
    let reused = 0, asked = 0, pending = 0;
    const _tw0 = performance.now();
    // ⓐ 겹치는 칸 베끼기 — 여기는 예산 밖이다(공짜).
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const pi = i + dxp, pj = j + dyp;
      const pv = (P && pi >= 0 && pj >= 0 && pi < N && pj < N) ? P[pj * N + pi] : 2;
      wet[j * N + i] = pv; if (pv !== 2) reused++;
    }
    // ⓑ 남은 칸을 **가운데부터** 묻는다. ★순서가 중요하다: 창(128셀)은 화면(약 44셀)보다 훨씬
    //   커서, 위에서부터 채우면 예산이 **화면 밖 여백**에 다 쓰이고 정작 눈앞의 물이 몇 프레임
    //   비어 보인다. 가운데부터 채우면 화면 안이 먼저 정해진다(그리고 화면 안 셀은 지면 베이크가
    //   이미 물어봐 캐시에 있어 사실상 공짜다).
    //   예산은 **개수가 아니라 시간**이다 — 캐시 적중은 거의 0µs 라, 개수로 끊으면 싼 칸까지
    //   막아 수렴이 느려진다.
    const ord = _wfOrder(N);
    const slow = !!_t19.slowFlow, tEnd = _tw0 + WF_ASK_MS;
    const M = slow ? N * N : ord.length;      // 대조군은 수리 전과 똑같이 **창 전체**를 묻는다
    for (let n = 0; n < M; n++) {
      const o = slow ? n : ord[n];
      if (wet[o] !== 2) continue;
      if (!slow && (n & 63) === 0 && performance.now() > tEnd) break;   // 64칸마다 시계 확인(초과분 상한)
      const i = o % N, j = (o / N) | 0;
      asked++; wet[o] = isWaterAtAbs((ocx + i) * 32 + 16, (ocy + j) * 32 + 16) ? 1 : 0;
    }
    // 미결 집계는 **물어볼 반경 안만** 센다(바깥 링은 애초에 안 묻기로 한 곳이라 미결이 아니다).
    for (let n = 0; n < M; n++) if (wet[slow ? n : ord[n]] === 2) pending++;
    for (let o = 0; o < N * N; o++) if (wet[o] !== 1) { dep[o] = 0; q[qt++] = o; }   // 뭍·미결은 거리장 원점
    _wfPrev.ox = ocx; _wfPrev.oy = ocy; _wfPrev.wet = wet;
    window.__wfReuse = reused; window.__wfAsked = asked; window.__wfPending = pending;
    window.__wfWetMs = performance.now() - _tw0;
    while (qh < qt) {   // 뭍에서 퍼지는 거리장
      const p2 = q[qh++], i = p2 % N, j = (p2 / N) | 0, d = dep[p2] + 1;
      if (d > WF_DEPTH_MAX) continue;
      if (i > 0 && dep[p2 - 1] > d) { dep[p2 - 1] = d; q[qt++] = p2 - 1; }
      if (i < N - 1 && dep[p2 + 1] > d) { dep[p2 + 1] = d; q[qt++] = p2 + 1; }
      if (j > 0 && dep[p2 - N] > d) { dep[p2 - N] = d; q[qt++] = p2 - N; }
      if (j < N - 1 && dep[p2 + N] > d) { dep[p2 + N] = d; q[qt++] = p2 + N; }
    }
    const lin = new Uint8Array(N * N * 4), msk = new Uint8Array(N * N * 4);
    const _tf0 = performance.now(); let _flowN = 0;
    // ═══════════════════════════════════════════════════════════════════════════
    // ★★★[재민 2026-08-24 "해결해야 해"] 파도를 **연속 스칼라 장 Φ** 위에 세운다.
    //   여기까지의 실측이 남긴 사실 두 가지:
    //     ⓐ 위상을 `dot(w, dir)` 로 내면 w 가 절대 월드 좌표(≈4.6e5)라 dir 이 **조금만** 변해도
    //        위상이 파장 대비 난수로 튄다 ⇒ 방향을 매끄럽게 하면 온 화면이 얼룩 띠(3.14),
    //        방향을 셀 단위로 끊으면 셀 경계마다 금(=번개 계단). **둘 다 같은 병의 두 얼굴이다.**
    //     ⓑ 위상을 '강을 따라 잰 거리'로 바꾸면 한 강 안에서는 이어지지만, **다른 강과 만나는
    //        경계**에서는 두 강의 거리 원점이 무관해 여전히 튄다(재민이 본 그 자리가 합류부다).
    //   ⇒ 그러니 위상은 **∇Φ = 흐름 방향**을 만족하는 장이어야 한다. 그런 Φ 를 창마다 **푼다**:
    //     · 초기값 = 강을 따라 잰 거리(거의 정답이라 몇 번만 돌려도 수렴한다)
    //     · 완화   = 이웃 넷과 `Φ_i ≈ Φ_n + 32·(방향의 그 축 성분)` 이 되도록 가우스-자이델
    //     ⇒ 강이 갈리는 자리에서도 Φ 가 **매끄럽게 이어지도록 스스로 자리를 잡는다.**
    //   그리고 방향은 **다시 매끄럽게**(3×3 평균) 만든다 — 위상이 `w−셀중심`(≤23px)만 쓰므로
    //   증폭이 없어져서 이제 매끄러운 방향이 안전하다. 마루가 도는 것도 서서히 돈다.
    // ═══════════════════════════════════════════════════════════════════════════
    const fdx = new Float32Array(N * N), fdy = new Float32Array(N * N), phi = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p2 = j * N + i;
      if (wet[p2] !== 1) continue;
      _flowN++;
      const f = _flowAtCell(ocx + i, ocy + j);
      fdx[p2] = f[0]; fdy[p2] = f[1]; phi[p2] = f[3] || 0;
    }
    // ★[계측] ⓐ+ⓑ 가 배치 21 이 **새로 더한** 비용이다. 따로 잰다(하네스가 장당 찍는다).
    const _tp0 = performance.now();
    // ⓐ 방향 매끄럽게 — 세기는 그대로 두고 **단위 방향만** 3×3 평균(2패스)
    if (!_t19.dirRawCell) {
      let ax = fdx, ay = fdy;
      for (let pass = 0; pass < 2; pass++) {
        const bx2 = new Float32Array(N * N), by2 = new Float32Array(N * N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const p2 = j * N + i; if (wet[p2] !== 1) continue;
          // ★전단선을 건너 평균하지 마라. 맞부딪치는 두 강(각차 179°)에서 단위벡터 둘을 더하면
          //   합이 0 근처가 되고, 그걸 원래 세기로 되돌리면 **방향이 난수**가 된다.
          //   내 방향과 90° 넘게 어긋나는 이웃은 남의 강이다 — 빼고 평균한다.
          const cL = Math.hypot(ax[p2], ay[p2]);
          const cux = cL > 1e-6 ? ax[p2] / cL : 0, cuy = cL > 1e-6 ? ay[p2] / cL : 0;
          let sx = 0, sy = 0, n2 = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const jj = j + dj, ii = i + di; if (jj < 0 || ii < 0 || jj >= N || ii >= N) continue;
            const q = jj * N + ii; if (wet[q] !== 1) continue;
            const L2 = Math.hypot(ax[q], ay[q]); if (L2 < 1e-6) continue;
            const qux = ax[q] / L2, quy = ay[q] / L2;
            if (!_t19.shearRaw && cL > 1e-6 && (qux * cux + quy * cuy) <= 0) continue;   // 남의 강
            sx += qux; sy += quy; n2++;
          }
          const L3 = Math.hypot(sx, sy);
          const mag = Math.hypot(ax[p2], ay[p2]);
          if (n2 && L3 > 1e-6) { bx2[p2] = sx / L3 * mag; by2[p2] = sy / L3 * mag; }
          else { bx2[p2] = ax[p2]; by2[p2] = ay[p2]; }
        }
        ax = bx2; ay = by2;
      }
      fdx.set(ax); fdy.set(ay);
    }
    // ⓑ Φ 완화 — ∇Φ = 단위 흐름 방향. 물 셀만, 가우스-자이델(제자리 갱신이라 전파가 빠르다).
    const ITER = _t19.phaseRelax == null ? 36 : _t19.phaseRelax;
    for (let it = 0; it < ITER; it++) {
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const p2 = j * N + i; if (wet[p2] !== 1) continue;
        let acc2 = 0, n2 = 0;
        // 이웃 n 에서 본 나의 위상 = Φ_n + 32·(n→나 방향의 흐름 성분)
        // ★변의 방향은 **내 방향**으로 잰다(두 방향의 평균이 아니라). 맞부딪치는 자리에서
        //   평균은 0 근처가 되고 그 방향은 난수라 Φ 에 잡음을 주입한다.
        //   그리고 90° 넘게 어긋나는 이웃과는 **위상을 안 잇는다** — 남의 강이다.
        const cL0 = Math.hypot(fdx[p2], fdy[p2]);
        if (cL0 < 1e-6) continue;
        const cux0 = fdx[p2] / cL0, cuy0 = fdy[p2] / cL0;
        for (const [di, dj] of _WF_NB) {
          const q = (j + dj) * N + (i + di); if (wet[q] !== 1) continue;
          const qL = Math.hypot(fdx[q], fdy[q]); if (qL < 1e-6) continue;
          if (_t19.shearRaw) {
            const ux = (fdx[p2] + fdx[q]) * 0.5, uy = (fdy[p2] + fdy[q]) * 0.5;
            const L2 = Math.hypot(ux, uy); if (L2 < 1e-6) continue;
            acc2 += phi[q] + 32 * (di * ux + dj * uy) / L2; n2++; continue;
          }
          if ((fdx[q] * cux0 + fdy[q] * cuy0) / qL <= 0) continue;   // 남의 강
          acc2 += phi[q] + 32 * (di * cux0 + dj * cuy0); n2++;
        }
        if (n2) phi[p2] = acc2 / n2;
      }
    }
    window.__wfPhiMs = performance.now() - _tp0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p2 = j * N + i;
      let sd = 0, n = 0;   // 3×3 평균 — 수심 계단을 없앤다
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const jj = j + dj, ii = i + di; if (jj < 0 || ii < 0 || jj >= N || ii >= N) continue;
        sd += Math.min(WF_DEPTH_MAX, dep[jj * N + ii]); n++;
      }
      const d01 = (sd / n) / WF_DEPTH_MAX;
      lin[p2 * 4] = ((fdx[p2] * 0.5 + 0.5) * 255) | 0;
      lin[p2 * 4 + 1] = ((fdy[p2] * 0.5 + 0.5) * 255) | 0;
      lin[p2 * 4 + 2] = (Math.min(1, d01) * 255) | 0;
      lin[p2 * 4 + 3] = 255;
      // uMsk: rg = 방향(NEAREST · 대조군용) · b = **Φ mod 64**(파장) · a = 물 마스크
      msk[p2 * 4] = lin[p2 * 4]; msk[p2 * 4 + 1] = lin[p2 * 4 + 1];
      msk[p2 * 4 + 2] = wet[p2] === 1 ? ((((phi[p2] % 64) + 64) % 64) / 64 * 255) | 0 : 0;
      msk[p2 * 4 + 3] = wet[p2] === 1 ? 255 : 0;   // 미결(2)은 물이 아니다 — 그리지 않는다
    }
    window.__wfFlowMs = performance.now() - _tf0; window.__wfFlowN = _flowN;
    // 이 창 안 물 셀의 바운딩 박스 — 셰이더를 화면 전체에 돌리지 않기 위한 것(아래 scissor)
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (wet[j * N + i] === 1) {
      const cx = ocx + i, cy = ocy + j;
      if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx;
      if (cy < by0) by0 = cy; if (cy > by1) by1 = cy;
    }
    return { lin, msk, bbox: bx1 < bx0 ? null : [bx0, by0, bx1 + 1, by1 + 1], pending };
  }

  const WATER_VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const WATER_FS = [
    'precision highp float;',
    'uniform vec2 uRes; uniform vec2 uCam; uniform float uT;',
    'uniform sampler2D uLin; uniform sampler2D uMsk; uniform float uFuzz;',
    // ★[재민 2026-08-24 "물방울 같은 것"·"1셀 두께 줄무늬"] 층 분해용 A/B 스위치.
    //   x=반짝임(spec) · y=포말(foam) · z=사인파(s1+s2) · w=잔결 노이즈(sn). 각각 0 이면 그 항만 끈다.
    //   결함을 눈으로 지목만 해서는 못 고친다 — **어느 항이 그리는지**를 끄고 재서 가른다.
    'uniform vec4 uDbg;',
    // ★[재민 2026-08-24 "1셀 두께 줄무늬"] 잔결 노이즈 손잡이 — x=스케일 · y=주기 · z=세기.
    //   ※스케일×주기 = 512 여야 한다(카메라가 512px 움직여도 무늬가 안 튀는 조건 — 위 주석 ⓑ).
    //     그래서 CPU 가 주기를 512/스케일 로 계산해 넣는다. 스케일은 512 의 약수만 쓴다.
    'uniform vec3 uRip; uniform vec3 uRip1; uniform float uDith; uniform float uSnap; uniform float uDirLin; uniform vec2 uDirC; uniform float uPhLeg; uniform float uDirNear;',
    'uniform vec2 uOrig; uniform float uN; uniform float uDrop;',
    // ★★값 노이즈는 **주기 노이즈**여야 한다. 이유가 두 개다:
    //   ⓐ 월드 좌표가 수만 px 이라 `fract(sin(dot(p,·)))` 의 인자가 1e7 급이 되면 float 정밀도가
    //      무너져 해시가 뭉개진다 — 1패스 실화면에서 물이 **잔물결도 반짝임도 없는 뿌연 판**이었다.
    //   ⓑ 그래서 흐름맵 원점(uOrig)을 빼서 국소 좌표로 쓰는데, 값 노이즈는 평행이동 불변이 아니라
    //      원점이 512px 씩 옮겨갈 때마다 무늬가 튄다. 격자를 512px 의 약수 주기로 감으면 **불변**이 된다.
    //   ⇒ 노이즈 스케일은 전부 512 의 약수(8·3.2·32·4)이고 주기는 512/스케일 이다.
    'float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float vn(vec2 p,float per){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    '  vec2 a=mod(i,per), b=mod(i+vec2(1,0),per), c=mod(i+vec2(0,1),per), d=mod(i+vec2(1,1),per);',
    '  return mix(mix(h2(a),h2(b),u.x),mix(h2(c),h2(d),u.x),u.y);}',
    'vec2 cellUV(vec2 w){return (w/32.0-uOrig)/uN;}',
    // ★물가선 굽이 — **main() 밖**에 둔다. 1패스에서 main() 안에 넣었다가 셰이더가 링크에 실패했고,
    //   try/catch 가 삼켜서 `_wgl.ok=false` → 단색 물 폴백으로 조용히 떨어졌다.
    //   그런데 화면엔 '물색'이 그대로 있어서 **측정값이 네 손잡이 값에서 전부 동일**하게 나왔다.
    //   ⇒ 그 동일함이 단서였다. 이제 하네스가 `__waterDbg.ok` 를 함께 본다.
    'vec2 fuzzW(vec2 p){ if(uFuzz<0.01) return p;',
    '  return p + (vec2(vn(p/8.0,64.0), vn(p/8.0+vec2(37.3,11.9),64.0))-0.5)*uFuzz; }',
    'void main(){',
    '  float ix = gl_FragCoord.x - uRes.x*0.5 + uCam.x;',
    '  float sy = (uRes.y-gl_FragCoord.y) - uRes.y*0.5 + uCam.y;',
    // ★수면은 지면보다 uDrop 만큼 내려가 있다 ⇒ 이 화면 행에 보이는 수면점은 iso y-uDrop 의 역변환
    '  float iy = sy - uDrop;',
    '  vec2 w = vec2((2.0*iy+ix)*0.5,(2.0*iy-ix)*0.5);',
    // ★★★[재민 2026-08-07 "여전히 물에 풀이 잘리는데"] **물가선 자체를 흔든다.**
    //   12배 확대해서 보고 나서야 남은 게 뭔지 알았다: 풀↔모래 경계는 이미 잎 모양으로 너덜한데,
    //   **모래↔물 경계가 자로 그은 완전 직선**이었다. 셀 다이아몬드 변을 그대로 쓰니 당연하다.
    //   지면 쪽에서 아무리 너덜하게 만들어도 그 위를 **직선 물 폴리곤이 덮어** 다시 잘린다.
    //   ⇒ 자를 없앤다: 마스크를 **월드 좌표를 흔든 자리**에서 읽는다. 경계가 ±uFuzz 만큼 굽이친다.
    //   · 잡음 규약은 이 셰이더의 기존 것 그대로(`vn`, 스케일 8 = 512 의 약수 → 카메라 이동에 불변).
    //   · 파장 ≈8월드px 라 **점점이 흩어지는 디더가 아니라 물결치는 선**이 된다.
    //   ★배치 19 의 "각진 블록 — 셀 경계 그대로" 규약을 **의도적으로 좁게 깬다**: 블록감(수심·흐름의
    //     셀 단위)은 그대로 두고 **바깥 윤곽만** 굽힌다. 손잡이 `edgeFuzz` 로 0 을 주면 옛 그림이다.
    '  vec2 uv = cellUV(w);',
    '  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) discard;',
    // ★굽이만으로는 부족했다 — **경계가 여전히 1px 만에 뚝 끊긴다**(딱딱한 discard).
    //   그래서 4탭으로 **피복률**을 낸다: 굽힌 자리 주변 네 점 중 몇 개가 물인가.
    //   ⇒ 경계가 0/0.25/0.5/0.75/1 로 부드러워진다 = 자로 그은 선이 아니라 젖어드는 가장자리.
    '  float cov=0.0;',
    '  cov += step(0.5, texture2D(uMsk, cellUV(fuzzW(w+vec2( 1.6, 0.6)))).a);',
    '  cov += step(0.5, texture2D(uMsk, cellUV(fuzzW(w+vec2(-1.6,-0.6)))).a);',
    '  cov += step(0.5, texture2D(uMsk, cellUV(fuzzW(w+vec2( 0.6,-1.6)))).a);',
    '  cov += step(0.5, texture2D(uMsk, cellUV(fuzzW(w+vec2(-0.6, 1.6)))).a);',
    '  cov *= 0.25;',
    // ★★내 자리(지면 높이)가 뭍이면 그건 프리즘 면이 덮을 자리다 — 물을 그리지 않는다.
    //   ※배치 19 가 `uvg` 를 **계산만 하고 discard 를 안 걸었다**(주석은 있는데 코드가 없다).
    //     그 결과 수면이 uDrop 만큼 내려가 그려지면서 **남·동쪽 뭍 위로 흘러넘쳤고**,
    //     물가를 따라 이어지는 **푸른 후광 = 재민이 말한 "테두리"** 가 됐다.
    //     실측(재민 지적 뒤): 물 ON/OFF 같은 뭍 픽셀 비교 — 경계에서 파랑 **+26**, 11px 밖에도 **+6**.
    //   ⇒ 원래 의도대로 한 줄을 마저 건다. 그 자리는 프리즘 단면이 덮는다.
    '  vec2 wg = vec2((2.0*sy+ix)*0.5,(2.0*sy-ix)*0.5);',
    '  vec2 uvg = cellUV(wg);',
    '  if(uvg.x>=0.0&&uvg.y>=0.0&&uvg.x<=1.0&&uvg.y<=1.0){ float cg=0.0;',
    '    cg += step(0.5, texture2D(uMsk, cellUV(fuzzW(wg+vec2( 1.6, 0.6)))).a);',
    '    cg += step(0.5, texture2D(uMsk, cellUV(fuzzW(wg+vec2(-1.6,-0.6)))).a);',
    '    cg += step(0.5, texture2D(uMsk, cellUV(fuzzW(wg+vec2( 0.6,-1.6)))).a);',
    '    cg += step(0.5, texture2D(uMsk, cellUV(fuzzW(wg+vec2(-0.6, 1.6)))).a);',
    '    cov = min(cov, cg*0.25); }',
    '  if(cov <= 0.001) discard;',
    '  vec4 L = texture2D(uLin,uv);',
    '  vec4 M = texture2D(uMsk,uv);',
    // ★방향은 NEAREST(uMsk.rg)에서 — 셀 안에서 상수라야 위상이 안 무너진다(위 _buildFlowTex 주석).
    //   uDirLin 이 1 이면 옛 그림(uLin.rg LINEAR + dot(w,dir) 위상) — A/B 대조군.
    // ★방향은 **LINEAR**(uLin.rg) 로 다시 읽는다 — 위상이 `w−셀중심`(≤23px)만 쓰므로
    //   |w| 증폭이 사라졌고, 그래서 매끄러운 방향이 이제 안전하다. 마루도 서서히 돈다.
    //   `dirRawCell` 손잡이를 켜면 CPU 에서 방향 평활을 끄고 NEAREST(uMsk.rg)로 읽는다(대조군).
    '  vec2 dir = mix(L.rg, M.rg, uDirNear)*2.0-1.0; float depth = L.b;',
    '  float fl = length(dir);',
    '  float ADV = 64.0;',
    '  vec2 wl = w - uOrig*32.0;',
    '  vec2 cc = (floor(w/32.0)+0.5)*32.0;',
    '  float al;',
    // 흐름이 없으면(호수·먼바다) 해안 거리장 기울기 = 파도 방향(해안 쪽에서 온다)
    '  if(fl < 0.08){ float e=1.0/uN;',
    '    float gx=texture2D(uLin,uv+vec2(e,0)).b-texture2D(uLin,uv-vec2(e,0)).b;',
    '    float gy=texture2D(uLin,uv+vec2(0,e)).b-texture2D(uLin,uv-vec2(0,e)).b;',
    '    vec2 g2=vec2(gx,gy); dir = length(g2)>0.0001? -normalize(g2) : vec2(1.0,0.0);',
    // ★★★[재민 2026-08-24 "물살 세로줄"] 이 폴백 방향은 **픽셀마다 매끄럽게 변한다**(수심 기울기).
    //   그런데 파도 위상이 `dot(w, dir)` 이고 w 가 절대 월드 좌표(≈4.6e5)라, dir 이 조금만 변해도
    //   위상 기울기가 |w|·|∇dir| 로 증폭돼 파도가 **디더 얼룩 띠**로 무너진다(§6-k 폐기안과 같은 병).
    //   그래서 강 영향권 밖 + 물가 6셀 안(수심이 아직 변하는 곳)에만 **띠 모양으로** 나타났다.
    //   ⇒ 방향을 **각도 눈금에 스냅**해 구역 안에서 상수로 만든다(∇dir=0). 눈금 경계만 가는 선이 된다.
    '    if(uSnap>0.5){ float aa=atan(dir.y,dir.x); float st=6.2831853/uSnap;',
    '      aa=floor(aa/st+0.5)*st; dir=vec2(cos(aa),sin(aa)); }',
    // 호수·먼바다는 강 호장이 뜻을 잃는다 ⇒ **물가까지의 거리**가 그대로 위상이다(∇=dir 과 같은 방향).
    '    al = -depth*192.0; }',
    '  else { dir = dir/fl;',
    // ★★★[재민 2026-08-24 "번개모양 경계"] 위상의 정본은 **강을 따라 잰 거리 s**(uMsk.b, 셀당 상수)다.
    //   옛 식 `dot(w, dir)` 은 w 가 절대 월드 좌표(≈4.6e5)라 dir 이 조금만 달라져도 값이 파장 대비
    //   난수처럼 튄다 ⇒ 방향이 바뀌는 셀 경계마다 **다이아몬드 계단 = 번개 모양 크리스**가 남았다.
    //   Φ 는 창마다 ∇Φ=dir 이 되도록 완화해 푼 장이라, 강이 갈리는 자리에서도 이어진다:
    //     A 칸: s_A + dot(w−c_A, d) · B 칸: s_B + dot(w−c_B, d) 이고 s_B ≈ s_A + dot(c_B−c_A, d)
    //     ⇒ 경계에서 두 식이 같은 값을 낸다(1차까지 정확). mod 64 로 실어도 cos 이 64주기라 무손실.
    '    al = M.b*64.0 + dot(w-cc,dir); }',
    '  if(max(uDirLin,uPhLeg)>0.5) al = dot(w,dir);',
    '  al -= ADV*uT;',
    // ★마루가 자로 그은 듯 곧지 않게 흔드는 항. 옛 식은 `dot(w,perp)` 였는데 **같은 병**(절대 좌표)이라
    //   국소 좌표 잡음으로 바꿨다 — 잡음은 512 주기라 카메라가 움직여도 불변이다.
    '  float crn = vn(wl/32.0+vec2(3.0,7.0),16.0)-0.5;',
    '  float cr = max(uDirLin,uPhLeg)>0.5 ? dot(w,vec2(-dir.y,dir.x)) : 0.0;',
    '  float ampMod = 0.45+0.9*vn(wl/32.0,16.0);',           // 진폭 얼룩 — 안 하면 골판지
    '  float A1=0.85*ampMod, A2=0.55*ampMod;',
    '  float p1 = al*(6.2831853/64.0)+cr*0.02+crn*1.1*(1.0-max(uDirLin,uPhLeg));',
    '  float p2 = al*(6.2831853/32.0)+cr*0.07+crn*3.2*(1.0-max(uDirLin,uPhLeg));',
    // ★잔결은 **화면 전체 한 방향**(uDirC = 창 중심 흐름)으로 흘린다. 픽셀마다 dir 로 흘리면
    //   방향이 바뀌는 셀 경계에서 잡음 표본 자리가 통째로 튀어 또 크리스가 생긴다.
    '  vec2 ad = mix(uDirC, dir, max(uDirLin,uPhLeg));',
    '  float n1 = vn((wl-ADV*uT*ad)/uRip1.x,uRip1.y)-0.5;',
    '  float n2 = vn((wl-ADV*uT*ad)/uRip.x+vec2(17.0,9.0),uRip.y)-0.5;',
    '  float s1 = A1*cos(p1)*(6.2831853/64.0), s2 = A2*cos(p2)*(6.2831853/32.0);',
    '  float sn = n1*uRip1.z+n2*uRip.z;',
    '  float sw = -(s1+s2)*uDbg.z - sn*uDbg.w;',
    '  vec3 nrm = normalize(vec3(sw*dir.x, sw*dir.y, 1.0));',
    '  vec3 Ld = normalize(vec3(-0.42,-0.58,0.70));',        // 정본 태양(52°/35°)과 일관
    '  vec3 Vd = normalize(vec3(0.5,-0.5,0.707));',
    '  vec3 Hd = normalize(Ld+Vd);',
    '  float diff = max(0.0,dot(nrm,Ld));',
    '  float spec = pow(max(0.0,dot(nrm,Hd)),90.0)*(0.55+0.45*depth)*uDbg.x;',
    '  float r = 26.0+(95.0-26.0)*(1.0-depth)*0.8;',
    '  float g = 64.0+(150.0-64.0)*(1.0-depth)*0.8;',
    '  float b = 96.0+(150.0-96.0)*(1.0-depth)*0.55;',
    '  r = r*(0.55+0.5*diff)+118.0*0.16; g = g*(0.55+0.5*diff)+140.0*0.16; b = b*(0.6+0.45*diff)+160.0*0.20;',
    '  r += spec*230.0; g += spec*240.0; b += spec*245.0;',
    // ★포말 — 시간 고정(위치 함수) · 뭍이 북서일 때만 · 뭍에 맞닿은 변 7px 이내만
    '  float e2=1.0/uN; float wa;',
    '  float mN = texture2D(uMsk,uv-vec2(0.0,e2)).a, mW = texture2D(uMsk,uv-vec2(e2,0.0)).a;',
    '  float ec = 99.0;',
    '  vec2 lc = fract(w/32.0)*32.0;',
    '  if(mN<0.5) ec=min(ec,lc.y);',
    '  if(mW<0.5) ec=min(ec,lc.x);',
    '  float shore = clamp(ec/7.0,0.0,1.0);',
    '  if(shore<1.0){ float fo=vn(wl/4.0+vec2(99.0,0.0),128.0);',
    '    float foam=max(0.0,(1.0-shore)*1.25*(fo-0.28))*1.5*uDbg.y; foam=min(0.85,foam);',
    '    r=r*(1.0-foam)+232.0*foam; g=g*(1.0-foam)+238.0*foam; b=b*(1.0-foam)+240.0*foam; }',
    // ★★[재민 2026-08-24 "1셀 두께로 엇갈린 줄무늬"] **8비트 계단**을 깬다.
    //   얕은 물은 wa 가 0.42 까지 내려가 물결이 화면에서 밝기 1~2단계 폭으로만 그려진다.
    //   그 저대비 경사를 8비트로 자르면 매끈한 물결이 아니라 **딱딱한 등고선**이 되고,
    //   셀 격자와 겹쳐 '엇갈린 줄무늬'로 읽힌다. 실측으로 갈랐다:
    //     · 잔결을 **줄이면**(1.0→0.4) 띠는 3.89→2.64 로 옅어지지만 **물이 안 움직인다**
    //       (하네스 ① 이동 8.1px → 0.0px). 판정을 낮출 수는 없다 ⇒ 폐기.
    //     · 잔결 **격자**를 8→12.8→16→25.6 으로 키워도 띠는 3.89→3.94→3.91→3.91. 무효 ⇒ 폐기.
    //   ⇒ 남은 건 양자화다. 색을 자르기 직전에 **±0.5 LSB 디더**를 얹는다 — 물결의 세기도
    //     이동도 한 톨 안 줄이고 계단만 흩는다.
    '  float dth = (h2(gl_FragCoord.xy)-0.5)*uDith;',
    '  r += dth; g += dth; b += dth;',
    '  wa = min(1.0, 0.42+0.58*depth);',                     // ★얕은물 투명 — 물밑 진흙이 비친다
    '  wa *= cov;',                                        // ★경계 피복률 — 물가선이 젖어들 듯 끝난다
    '  gl_FragColor = vec4(r/255.0*wa, g/255.0*wa, b/255.0*wa, wa);',   // premultiplied
    '}',
  ].join('\n');

  const _wgl = { cv: null, gl: null, prog: null, ok: null, uni: {}, texL: null, texM: null };
  let _waterT0 = null;   // 셰이더 시간 기준점(위 주석 — float 정밀도)
  function _waterInit() {
    if (_wgl.ok !== null) return _wgl.ok;
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
      if (!gl) throw new Error('webgl 없음');
      const mk = (t, src) => { const s2 = gl.createShader(t); gl.shaderSource(s2, src); gl.compileShader(s2);
        if (!gl.getShaderParameter(s2, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s2)); return s2; };
      const pr = gl.createProgram();
      gl.attachShader(pr, mk(gl.VERTEX_SHADER, WATER_VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, WATER_FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const u of ['uRes', 'uCam', 'uT', 'uLin', 'uMsk', 'uOrig', 'uN', 'uDrop', 'uFuzz', 'uDbg', 'uRip', 'uRip1', 'uDith', 'uSnap', 'uDirLin', 'uDirC', 'uPhLeg', 'uDirNear']) _wgl.uni[u] = gl.getUniformLocation(pr, u);
      const mkTex = (filt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t; };
      _wgl.texL = mkTex(gl.LINEAR); _wgl.texM = mkTex(gl.NEAREST);
      gl.uniform1i(_wgl.uni.uLin, 0); gl.uniform1i(_wgl.uni.uMsk, 1);
      gl.uniform1f(_wgl.uni.uN, WF_N); gl.uniform1f(_wgl.uni.uDrop, WATER_DROP);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied
      _wgl.cv = cv; _wgl.gl = gl; _wgl.prog = pr; _wgl.ok = true;
      console.log('[water] WebGL 물 레이어 준비');
    } catch (e) {
      console.warn('[water] WebGL 불가 — 단색 폴백:', e.message); _wgl.ok = false;
    }
    return _wgl.ok;
  }
  function _drawWaterLayer(ctx2, W2, H2, camX2, camY2, tSec) {
    if (!_waterInit()) return false;
    const gl = _wgl.gl;
    if (_wgl.cv.width !== W2 || _wgl.cv.height !== H2) { _wgl.cv.width = W2; _wgl.cv.height = H2; }
    gl.viewport(0, 0, W2, H2);
    // 흐름/수심/마스크 텍스처 — 카메라가 WF_QUANT 셀 이상 움직였을 때만 다시 굽는다
    const wpt = { wx: (2 * camY2 + camX2) / 2, wy: (2 * camY2 - camX2) / 2 };
    const ocx = Math.floor(wpt.wx / 32 / WF_QUANT) * WF_QUANT - (WF_N >> 1);
    const ocy = Math.floor(wpt.wy / 32 / WF_QUANT) * WF_QUANT - (WF_N >> 1);
    const key = ocx + '_' + ocy;
    // ★미결 칸이 남아 있으면 다음 프레임에 마저 묻는다(예산제 — 위 _buildFlowTex 주석).
    if (_wfCache.key !== key || _wfCache.pending) {
      // ★[성능 계측] 흐름 텍스처를 굽는 시간 — 재민이 실기에서 겪은 "물가 렉"의 그 지점이다.
      //   고정 지점 촬영으로는 절대 안 잡힌다(캐시가 안 식는다). 걷는 하네스가 이 수를 읽는다.
      const _t0 = performance.now();
      const t = _buildFlowTex(gl, ocx, ocy);
      const _ms = performance.now() - _t0;
      window.__wfBuildMs = _ms;
      window.__wfBuildN = (window.__wfBuildN || 0) + 1;
      window.__wfBuildSum = (window.__wfBuildSum || 0) + _ms;
      if (window.__wfBuildN === 1) { window.__wfFirstMs = _ms; }   // 첫 장은 **모든 캐시가 찬물** — 정상 주행과 성격이 다르다
      else { window.__wfBuildMax = Math.max(window.__wfBuildMax || 0, _ms); window.__wfSteadyN = (window.__wfSteadyN || 0) + 1; window.__wfSteadySum = (window.__wfSteadySum || 0) + _ms; }
      window.__wfLast = { ms: _ms, wet: window.__wfWetMs || 0, reuse: window.__wfReuse || 0 };
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, _wgl.texL);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WF_N, WF_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.lin);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, _wgl.texM);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WF_N, WF_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.msk);
      _wfCache.key = key; _wfCache.ox = ocx; _wfCache.oy = ocy; _wfCache.bbox = t.bbox;
      _wfCache.pending = (t.pending || 0) > 0;
      window.__wfPendN = t.pending || 0;
    }
    // ★★셰이더를 **물이 있는 화면 영역**에만 돌린다.
    //   1패스 실측(headless SwiftShader): 화면 전체 오버레이가 프레임당 143ms 였고,
    //   **물이 한 방울도 없는 초원에서도 137ms 를 냈다** — 순전한 낭비다.
    //   흐름맵을 굽는 김에 물 셀 바운딩 박스를 같이 뽑아, 그 상자를 화면에 투영해 scissor 한다.
    //   물이 화면에 없으면 draw 자체를 건너뛴다.
    const bb = _wfCache.bbox;
    if (!bb) return false;
    let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
    for (const [cx, cy] of [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]]) {
      const wx = cx * 32, wy = cy * 32;
      const ix = wx - wy - camX2 + W2 / 2, iy = (wx + wy) / 2 - camY2 + H2 / 2;
      if (ix < sx0) sx0 = ix; if (ix > sx1) sx1 = ix;
      if (iy < sy0) sy0 = iy; if (iy > sy1) sy1 = iy;
    }
    sy0 -= WATER_DROP + 2; sy1 += 2;   // 수면이 내려간 만큼 여유
    const rx0 = Math.max(0, Math.floor(sx0)), ry0 = Math.max(0, Math.floor(sy0));
    const rx1 = Math.min(W2, Math.ceil(sx1)), ry1 = Math.min(H2, Math.ceil(sy1));
    if (rx1 <= rx0 || ry1 <= ry0) return false;   // 화면에 물이 없다 — 셰이더를 아예 안 돌린다
    const rw = rx1 - rx0, rh = ry1 - ry0;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rx0, H2 - ry1, rw, rh);   // GL 원점은 좌하단
    gl.uniform2f(_wgl.uni.uRes, W2, H2);
    gl.uniform2f(_wgl.uni.uCam, camX2, camY2);
    gl.uniform2f(_wgl.uni.uOrig, _wfCache.ox, _wfCache.oy);
    gl.uniform1f(_wgl.uni.uT, tSec);
    //   ★물가선 굽이 폭(월드 px). 0 이면 셀 경계 그대로 = 옛 그림(대조군).
    gl.uniform1f(_wgl.uni.uFuzz, _t19.edgeFuzz == null ? WATER_EDGE_FUZZ : _t19.edgeFuzz);
    gl.uniform4f(_wgl.uni.uDbg, _t19.specOff ? 0 : 1, _t19.foamOff ? 0 : 1,
                (_t19.waveOff || _t19.sineOff) ? 0 : 1,
                (_t19.waveOff || _t19.ripOff) ? 0 : (_t19.ripAmp == null ? WATER_RIP_AMP : _t19.ripAmp));
    { const rs = _t19.ripScale == null ? WATER_RIP_SCALE : _t19.ripScale;
      gl.uniform3f(_wgl.uni.uRip, rs, 512 / rs, _t19.ripW == null ? WATER_RIP_W : _t19.ripW);
      const r1 = _t19.ripScale1 == null ? WATER_RIP_S1 : _t19.ripScale1;
      gl.uniform3f(_wgl.uni.uRip1, r1, 512 / r1, _t19.ripW1 == null ? WATER_RIP_W1 : _t19.ripW1); }
    gl.uniform1f(_wgl.uni.uDith, _t19.ditherOff ? 0 : (_t19.dither == null ? WATER_DITHER : _t19.dither));
    gl.uniform1f(_wgl.uni.uSnap, _t19.lakeSnap == null ? WATER_LAKE_SNAP : _t19.lakeSnap);
    gl.uniform1f(_wgl.uni.uDirLin, _t19.dirLinear ? 1 : 0);
    gl.uniform1f(_wgl.uni.uPhLeg, _t19.phaseLegacy ? 1 : 0);
    gl.uniform1f(_wgl.uni.uDirNear, (_t19.dirRawCell || _t19.dirLinear === 'near') ? 1 : 0);
    { const fc = _flowAtCell(Math.round(wpt.wx / 32), Math.round(wpt.wy / 32));
      const fl = Math.hypot(fc[0], fc[1]);
      gl.uniform2f(_wgl.uni.uDirC, fl > 1e-4 ? fc[0] / fl : 1, fl > 1e-4 ? fc[1] / fl : 0); }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    ctx2.drawImage(_wgl.cv, rx0, ry0, rw, rh, rx0, ry0, rw, rh);
    _wfCache.rect = [rx0, ry0, rw, rh];
    return true;
  }
  // ★블록 프리즘 단면 — 물에 접한 뭍 셀의 남·동 변에서 WATER_DROP 만큼 수직면.
  //   벽 셰이드 문법(남면 어둡게·동면 밝게) + 상단 풀 넘김 립 + 하단 물 접촉선 그림자.
  //   북·서 변은 뭍이 가린다(면 없음). 픽셀 패스가 아니라 **벡터**로 그린다(재민 확정 ③).
  function _drawPrisms(g, toScr, cx0, cy0, cx1, cy1) {
    const D = WATER_DROP;
    let n = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const px = cx * 32 + 16, py = cy * 32 + 16;
      if (isWaterAtAbs(px, py)) continue;                       // 뭍 셀만
      const sW = isWaterAtAbs(px, py + 32), eW = isWaterAtAbs(px + 32, py);
      if (!sW && !eW) continue;
      n++;
      // ★[2026-08-06c] 상단 립 = **위에 있는 것의 색**이어야 한다. 물가 여백(모래)이 있는 면에
      //   초록 립을 그으면 모래 위에 초록 선이 뜬다. 높이도 자리마다 흔든다 —
      //   전 구간 **같은 두께 단색 선**은 그 자체로 윤곽선이다(실측 σ 24.9 = 프로파일 최솟값).
      //   ※립 자체를 없애지는 않는다: 없애면 단면 그늘이 곧장 풀에 닿아 대비가 더 세진다.
      const _lip = (k, sunny) => {
        const m = _t19.shMarginOff ? 0 : _shoreMargin(cx, cy, k);
        const h = 1.3 + 1.9 * _cellHash(cx, cy, 5170 + k);
        return [m >= 1.2 ? (sunny ? '#9a8663' : '#8a7757') : (sunny ? '#526e44' : '#4e6b40'), h];
      };
      if (sW) {   // 남면(물이 y+1) — 그늘
        const a = w2i(cx * 32, (cy + 1) * 32), b = w2i((cx + 1) * 32, (cy + 1) * 32);
        const A = toScr(a.x, a.y), B = toScr(b.x, b.y);
        g.fillStyle = '#4a3a26';
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(B.x, B.y + D); g.lineTo(A.x, A.y + D); g.closePath(); g.fill();
        g.fillStyle = 'rgba(15,25,35,' + (0.34 + 0.30 * _cellHash(cx, cy, 5190)).toFixed(3) + ')';
        g.beginPath(); g.moveTo(A.x, A.y + D - 2); g.lineTo(B.x, B.y + D - 2); g.lineTo(B.x, B.y + D); g.lineTo(A.x, A.y + D); g.closePath(); g.fill();
        const [lc, lh] = _lip(2, false); g.fillStyle = lc;
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(B.x, B.y + lh); g.lineTo(A.x, A.y + lh); g.closePath(); g.fill();
      }
      if (eW) {   // 동면(물이 x+1) — 볕
        const a = w2i((cx + 1) * 32, cy * 32), b = w2i((cx + 1) * 32, (cy + 1) * 32);
        const A = toScr(a.x, a.y), B = toScr(b.x, b.y);
        g.fillStyle = '#61492f';
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(B.x, B.y + D); g.lineTo(A.x, A.y + D); g.closePath(); g.fill();
        g.fillStyle = 'rgba(15,25,35,' + (0.30 + 0.28 * _cellHash(cx, cy, 5191)).toFixed(3) + ')';
        g.beginPath(); g.moveTo(A.x, A.y + D - 2); g.lineTo(B.x, B.y + D - 2); g.lineTo(B.x, B.y + D); g.lineTo(A.x, A.y + D); g.closePath(); g.fill();
        const [lc, lh] = _lip(0, true); g.fillStyle = lc;
        g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(B.x, B.y + lh); g.lineTo(A.x, A.y + lh); g.closePath(); g.fill();
      }
    }
    return n;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[배치 20 A] 산 — '장벽 세그먼트' 문법 (시안 왕복 12회로 확정)
  //   단위 = **8방위 벽 세그먼트**. 늘임 축이 진행 방향의 **수직**이다(단면이 넓은 벽 슬라이스) —
  //   진행 방향으로 늘이면 '가는 벽'이 된다(시안 실측).
  //   배치 = ridges 폴리라인을 호길이로 걸으며, 배치점마다 **진행 수직으로 실제 바위 셀을 훑어
  //   이어진 개수를 센다**. 그 수가 세그먼트 폭이다.
  //     재민 확정: *"산으로 되어 있는 셀들만 산으로 보여야 — 셀이 여러 개 모이면 큰 산."*
  //   ⇒ 고개(셀 0)는 산이 없고(사슬 절단), 파괴된 셀도 자동으로 반영된다.
  //   ★이식 정본은 `scripts/mock-mountain.js` 의 placeAlong 이다. 다른 점은 딱 둘:
  //     ⓐ 장면-로컬 격자 대신 **정본 판정 `isRockAtAbs`** 를 부른다(사본 금지).
  //     ⓑ 결과를 renderables 에 태워 **엔티티와 함께 z 정렬**한다(앵커 wx+wy).
  const MT_ROCK_RIDGES = new Set(['한울대간', '눈메']);   // 돌산(G). 나머지는 숲산(F) — 재민 확인 대기(시안 첨부)
  const MT_CROSS_U = 10.1, MT_ALONG_U = 4.8;             // 시안 정본 상수
  const MT_VIEW_PAD = 1800;                              // 이 반경 밖 능선은 배치조차 안 한다
  const MTX = {};                        // 스프라이트
  let _mtAnchors = null, _mtLoaded = 0, _mtWanted = 0;
  const _mtSegCache = new Map();         // "zid_ridgeIdx" → 세그먼트 배열(정적 — 파괴 시 무효화)
  const _mtDestroyed = new Set();        // 파괴된 바위 셀 "zid_cx_cy" — ★서버 이벤트 자리(§A-6 회부)
// @@moved:2207
  // 하네스용 — 그 자리가 바위(=못 걷는 곳)인가. 정본 술어를 그대로 부른다(사본 금지).
// @@moved:2234
  function _mtRockAt(zid, wx, wy) {
    // ★판정 정본을 부른다. 파괴 셀은 렌더 층에서만 걷어낸다(지형 데이터 무접촉).
    const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
    if (_mtDestroyed.size && _mtDestroyed.has(zid + '_' + cx + '_' + cy)) return false;
    return isRockAtAbs(cx * 32 + 16, cy * 32 + 16);
  }
  // ★★[마스크 이원화 2026-08-22] **파괴를 무시한** 원본 바위 판정.
  //   왜 필요한가: 높이는 `h = f(가장자리까지의 거리)` 다. 한 셀을 부수면 그 셀이 마스크에서
  //   빠지면서 **이웃들의 가장자리 거리까지 줄어**, 통로 옆벽이 같이 주저앉는다.
  //   그래서 1셀을 파면 35m 협곡이 아니라 3.5m **도랑**이 났다(실측).
  //   ⇒ 높이·렌더는 원본 마스크로 잡고, 통행·부수기는 지금 마스크(파괴 반영) 그대로 둔다.
  //     파괴 셀은 '낮아진 산'이 아니라 **메시에서 도려낸 구멍**으로 처리한다 — 옆벽은 제 높이로 선다.
  function _mtRockAt0(zid, wx, wy) {
    const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32);
    return isRockAtAbs(cx * 32 + 16, cy * 32 + 16);
  }
  function _mtIsCut(zid, cx, cy) {
    return !!(_mtDestroyed.size && _mtDestroyed.has(zid + '_' + cx + '_' + cy));
  }
  function _mtPlaceRidge(zid, ridge, ox, oy, ri) {
    const key = zid + '_' + ri;
    const hit = _mtSegCache.get(key); if (hit) return hit;
    const pts = ridge.path.map((p) => ({ x: ox + p.pos[0], y: oy + p.pos[1], w: p.width }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = cum[cum.length - 1];
    const at = (sArc) => {
      let i = 1; while (i < cum.length - 1 && cum[i] < sArc) i++;
      const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1, t = (sArc - cum[i - 1]) / L;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x), w: a.w + (b.w - a.w) * t };
    };
    const bandCells = (px, py, ang) => {
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      if (!_mtRockAt(zid, px, py)) return { n: 0, off: 0 };
      let a = 0, b = 0;
      for (let k = 1; k <= 30; k++) { if (_mtRockAt(zid, px + nx * k * 32, py + ny * k * 32)) a = k; else break; }
      for (let k = 1; k <= 30; k++) { if (_mtRockAt(zid, px - nx * k * 32, py - ny * k * 32)) b = k; else break; }
      return { n: a + b + 1, off: (a - b) / 2 };
    };
    const placed = [];
    for (let sArc = 0; sArc < total;) {
      const p0 = at(sArc);
      const bc = bandCells(p0.x, p0.y, p0.ang);
      const scW = Math.max(0.6, bc.n / MT_CROSS_U * 0.96);
      placed.push({ ang: p0.ang, w: p0.w, sc: scW, dead: bc.n < 2,
        x: p0.x + bc.off * 32 * -Math.sin(p0.ang), y: p0.y + bc.off * 32 * Math.cos(p0.ang) });
      sArc += Math.max(40, MT_ALONG_U * 32 * scW * 0.55);
    }
    const isF = !MT_ROCK_RIDGES.has(ridge.name);
    const segs = [];
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i]; if (p.dead) continue;
      let deg = (p.ang * 180 / Math.PI) % 180; if (deg < 0) deg += 180;
      const oct = Math.round(deg / 22.5) % 8;
      const rx = Math.round(p.x), ry = Math.round(p.y);
      let knot = false;
      if (i > 0 && i < placed.length - 1) {
        let d2 = Math.abs(placed[i + 1].ang - placed[i - 1].ang);
        if (d2 > Math.PI) d2 = 2 * Math.PI - d2;
        if (d2 > 0.42) knot = true;
      }
      const cut = (i > 0 && placed[i - 1].dead) || (i < placed.length - 1 && placed[i + 1].dead);
      if (cut) {   // 잘린 끝 = 캡(벽보다 낮게 — 주저앉는 전이)
        segs.push({ x: p.x, y: p.y, name: _cellHash(i, oct, 9) < 0.5 ? 'mt_S1' : 'mt_S2', sc: p.sc * 0.95, vy: 1, jx: 0, jy: 0 });
      } else if (knot) {
        segs.push({ x: p.x, y: p.y, name: _cellHash(i, oct, 7) < 0.5 ? 'mt_M1' : 'mt_M2', sc: p.sc * 1.25, vy: 1, jx: 0, jy: 0 });
      } else {
        const v = isF ? ((_cellHash(rx, ry, 77) * 2) | 0) : ((_cellHash(rx, ry, 77) * 3) | 0);
        segs.push({ x: p.x, y: p.y, name: (isF ? 'mt_F' : 'mt_G') + oct + 'v' + v, sc: p.sc,
          vy: 0.86 + 0.28 * _cellHash(rx, ry, 78),                 // 높이 지터 ±14%(발치 고정)
          jx: (_cellHash(rx, ry, 11) - 0.5) * p.w * 0.05,
          jy: (_cellHash(rx, ry, 12) - 0.5) * p.w * 0.05 });
      }
    }
    if (_mtSegCache.size > 400) _mtSegCache.clear();
    _mtSegCache.set(key, segs);
    return segs;
  }
  // ═══ 덮개 배치 — 크기를 '밴드 폭'이 아니라 '덩어리 가장자리까지의 거리'로 ═══════
  // ★★[재민 2026-08-07] *"갈색 타일이 보이면 안 될 정도로 산이 덮어야지"*
  //
  //   ⓐ **왜 현행이 못 덮나**: `_mtPlaceRidge` 는 능선 **중심선만** 걷고, 밴드 폭(중앙값 53셀)을
  //      스프라이트 **한 장**에 맡긴다(`scW = 밴드/10.1` → 중앙값 5.04). 그래서
  //        · 중심선에서 먼 옆구리는 아무것도 안 선다 → 맨 바위(실측 마을옆 39.9% · 라이브 70.9%)
  //        · 한 장을 5~9배 늘리니 뭉갠다
  //   ⓑ **여기선 나눠 덮는다**: 바위 덩어리의 **가장자리까지 거리**로 계층을 만든다.
  //        안쪽 → 큰 봉우리 성기게 · 어깨 → 중간 · 자락 → 잔 봉우리 촘촘히
  //      높이 배율도 같은 거리에 태워 실루엣이 저절로 산등성이가 된다.
  //   ⓒ **틈은 눈이 아니라 알파로 찾는다** — 남은 맨 바위 셀에 잔봉우리를 얹는다.
  //      시안 실측: 굽이 20.0%→0.0% · 마을옆 39.9%→0.0%.
  //   ⓓ **격자는 절대 셀 좌표**다. 청크 경계에서 자리가 흔들리면 이음매가 보인다.
  //      청크는 계산 단위일 뿐 좌표계가 아니다.
  //   ⓔ 거리 변환이 청크 경계에서 잘리면 안쪽인데 자락으로 오인한다 → **여백을 두고 계산하고
  //      배치는 코어에서만 낸다**(여백 밖은 '가장자리 아님'으로 둔다).
  const MT_CH = 48, MT_CHPAD = 22;
  const MT_TIERS = [
    { k: 'L', minD: 9.0, step: 13.0, s0: 1.85, s1: 2.50, solo: ['mt_L1'], sp: 0.34, seed: 411 },
    { k: 'M', minD: 3.5, step: 7.5, s0: 1.18, s1: 1.68, solo: ['mt_M1', 'mt_M2'], sp: 0.32, seed: 412 },
    { k: 'S', minD: -1.0, step: 4.2, s0: 0.70, s1: 1.00, solo: ['mt_S1', 'mt_S2'], sp: 0.30, seed: 413, maxD: 5.0 },
  ];
  // 기슭 — 바위 바깥 자락. 크기가 아니라 **높이**를 눌러 둔덕으로 읽히게 한다.
  // ★★[재민 2026-08-07 "정확하게 산 셀인 곳에만 산이 있어야 해"]
  //   실측: 산이 바위 밖으로 **중앙값 3셀 · 최대 6셀** 나가 있었다.
  //   원인은 기슭(10%)이 아니라 **스프라이트 발치가 퍼지는 것**(90%)이었다 —
  //   배율 1짜리 밑변이 10셀이라, 가장자리 셀에 앵커를 둬도 5셀이 풀밭으로 넘친다.
  //   ⇒ 배율을 **가장자리 거리로 묶는다**: 밑변 반지름(=CROSS_U/2×sc)이 dE+여유를 못 넘게.
  //   여유 1셀이 재민이 말한 "정말 미세한 오차"다.
  //   ★2차: 밑변만 묶어선 부족했다. 실측상 재민이 본 침범의 본체는 **몸통이 북서쪽 풀밭을
  //   덮는 것**이었다(56셀 중 55셀). 렌더러 눈엔 '뒤에 가려진 것'이지만 플레이어 눈엔
  //   **지도상 풀밭인데 산이 있는 것**이다 — 플레이어가 옳다.
  //   ⇒ **높이도 묶는다**: 스프라이트가 화면 위로 덮는 셀 수가 앵커에서 북서로 이어진
  //     바위 셀 수(dNW)를 못 넘게. 그러면 실루엣이 바위 마스크를 따라간다.
  // ★여유 셀 [재민 2026-08-07 "살짝은 산에 침범당해도 돼"] — 손잡이로 열어 둔다.
  //   0 에 가까울수록 산이 바위 마스크에 딱 붙지만 경계가 톱니가 되고 계층이 무너진다.
  //   크게 둘수록 산다워지지만 평지 침범이 는다. 이 값은 그 저울이다.
  let MT_FIT_TOL = 2.0;   // ★재민 "살짝은 침범당해도 돼" — 여유 0.35~4 실측 후 2.0 채택(톱니 소멸 · 하한눌림 0%)
  const MT_SC_MIN = 0.28, MT_VY_MIN = 0.30;   // ★하한 — 이보다 낮으면 틈 메우기 스프라이트가 제 셀도 못 덮는다(실측)
  const _mtFit = (sc, dE) => {
    if (_t19.fitOff) return sc;
    const cap = (dE + MT_FIT_TOL) / (MT_CROSS_U / 2);
    return sc < cap ? sc : (cap < MT_SC_MIN ? MT_SC_MIN : cap);
  };
  // 화면 위로 덮는 셀 수 = 앵커 위 화소 / 32. 이걸 dNW 로 묶어 세로 배율을 되돌린다.
  const _mtFitVy = (name, sc, vy, dNW) => {
    if (_t19.fitOff) return vy;
    const an = _mtAnchors && _mtAnchors[name]; if (!an) return vy;
    const px = an.oy * ((64 / Math.SQRT2) / an.ppu) * sc;      // vy=1 일 때 위로 덮는 화소
    const upCells = px / 32; if (upCells <= 0) return vy;
    const cap = (dNW + MT_FIT_TOL) / upCells;
    return vy < cap ? vy : (cap < MT_VY_MIN ? MT_VY_MIN : cap);
  };
  // 기슭도 같은 규격 아래로 — 1.6셀 자락이면 '미세한 오차' 안이다(5.2셀은 침범이다)
  const MT_FOOT = { step: 2.2, dMax: 1.6, s0: 0.26, s1: 0.46, vy0: 0.26, vy1: 0.52 };
  const _mtChunk = new Map();            // "gx_gy" → 세그먼트(절대 셀 청크 · 파괴 시 무효화)
  let _mtRidgeSeg = null;                // 전 존 능선 폴리라인을 절대 좌표로 편 목록(각도·숲/돌 판정용)
  function _mtRidgeSegs() {
    if (_mtRidgeSeg) return _mtRidgeSeg;
    const H = _hardTerrain; if (!H) return [];
    const out = [];
    for (const zid in H) {
      const z = zonesMeta[zid]; if (!z) continue;
      const ox = z.worldOffsetX, oy = z.worldOffsetY || 0;
      for (const r of (H[zid].ridges || [])) {
        const isF = !MT_ROCK_RIDGES.has(r.name);
        for (let i = 1; i < r.path.length; i++) {
          out.push({ x0: ox + r.path[i - 1].pos[0], y0: oy + r.path[i - 1].pos[1],
                     x1: ox + r.path[i].pos[0], y1: oy + r.path[i].pos[1], isF });
        }
      }
    }
    _mtRidgeSeg = out; return out;
  }
  function _mtNearRidge(wx, wy) {
    const segs = _mtRidgeSegs();
    let best = Infinity, ang = 0, isF = true;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], dx = s.x1 - s.x0, dy = s.y1 - s.y0, L2 = dx * dx + dy * dy || 1;
      let t = ((wx - s.x0) * dx + (wy - s.y0) * dy) / L2; t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const qx = s.x0 + t * dx - wx, qy = s.y0 + t * dy - wy, d = qx * qx + qy * qy;
      if (d < best) { best = d; ang = Math.atan2(dy, dx); isF = s.isF; }
    }
    return { ang, isF };
  }
  function _mtPick(cx, cy, ang, isF, T) {
    if (_cellHash(cx, cy, T.seed + 7) < T.sp) return T.solo[(_cellHash(cx, cy, T.seed + 8) * T.solo.length) | 0];
    // ★능선 각도에 ±14° 해시 흔들림 — 직선 능선에서 같은 옥탄트가 줄서면 '아코디언 벽'이 된다
    const jit = (_cellHash(cx, cy, T.seed + 9) - 0.5) * 28 * Math.PI / 180;
    let deg = ((ang + jit) * 180 / Math.PI) % 180; if (deg < 0) deg += 180;
    const oct = Math.round(deg / 22.5) % 8;
    const v = isF ? ((_cellHash(cx, cy, 77) * 2) | 0) : ((_cellHash(cx, cy, 77) * 3) | 0);
    return (isF ? 'mt_F' : 'mt_G') + oct + 'v' + v;
  }
  function _mtHgt(dE, cx, cy, seed) {          // 높이 = 가장자리 거리 램프 + 자리 지터
    const t = dE < 0 ? 0 : (dE > 14 ? 1 : dE / 14);
    return 0.74 + 0.44 * t + 0.16 * (_cellHash(cx, cy, seed) - 0.5);
  }
  // 스프라이트가 이 셀을 덮나 — 가림 판정과 **같은 알파 지도**를 쓴다(사본 금지)
  function _mtCovers(sg, ix, iy) {
    const an = _mtAnchors[sg.name], im = MTX[sg.name]; if (!an || !im || !im.naturalWidth) return false;
    const sc = (64 / Math.SQRT2) / an.ppu * sg.sc, vy = sg.vy || 1;
    const W = im.naturalWidth * sc, H = im.naturalHeight * sc * vy;
    const c = w2i(sg.x, sg.y);
    const u = (ix - (c.x - an.ox * sc)) / W, v = (iy - (c.y - an.oy * sc * vy)) / H;
    if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return false;
    return _mtAlphaAt(sg.name, u, v) > 0.30;
  }
  function _mtChunkSegs(zid, gx, gy) {
    const key = gx + '_' + gy;
    const hit = _mtChunk.get(key); if (hit) return hit;
    const W = MT_CH + MT_CHPAD * 2, c0 = gx * MT_CH - MT_CHPAD, r0 = gy * MT_CH - MT_CHPAD;
    const mask = new Uint8Array(W * W);
    let nRock = 0;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      if (_mtRockAt(zid, (c0 + i) * 32 + 16, (r0 + j) * 32 + 16)) { mask[j * W + i] = 1; nRock++; }
    }
    if (!nRock) { _mtChunk.set(key, []); return []; }
    // 가장자리 거리 — chamfer 2패스. ★창 밖은 '가장자리 아님'(INF)이다.
    const INF = 1e6, d = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) d[i] = mask[i] ? INF : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= W) ? INF : d[y * W + x];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (d[i] === 0) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414); }
    for (let y = W - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (d[i] === 0) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414); }
    const edgeD = (acx, acy) => { const i = acx - c0, j = acy - r0;
      return (i < 0 || j < 0 || i >= W || j >= W) ? 0 : d[j * W + i]; };
    // ★바깥 거리 — 바위에서 몇 셀 떨어진 풀밭인가. 기슭이 여기 선다.
    //   같은 패스에서 같이 굽는다(창을 두 번 훑지 않는다).
    const dOut = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) dOut[i] = mask[i] ? 0 : INF;
    const ao = (x, y) => (x < 0 || y < 0 || x >= W || y >= W) ? INF : dOut[y * W + x];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (dOut[i] === 0) continue;
      dOut[i] = Math.min(dOut[i], ao(x - 1, y) + 1, ao(x, y - 1) + 1, ao(x - 1, y - 1) + 1.414, ao(x + 1, y - 1) + 1.414); }
    for (let y = W - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (dOut[i] === 0) continue;
      dOut[i] = Math.min(dOut[i], ao(x + 1, y) + 1, ao(x, y + 1) + 1, ao(x + 1, y + 1) + 1.414, ao(x - 1, y + 1) + 1.414); }
    const outD = (acx, acy) => { const i = acx - c0, j = acy - r0;
      return (i < 0 || j < 0 || i >= W || j >= W) ? INF : dOut[j * W + i]; };
    const isRk = (acx, acy) => { const i = acx - c0, j = acy - r0;
      return i >= 0 && j >= 0 && i < W && j < W && mask[j * W + i] === 1; };
    // 화면 위쪽(북서)으로 이어진 바위 셀 수 — 스프라이트가 그 위로 넘어가면 풀밭을 덮는다.
    // ★가운데 한 줄만 보면 안 된다 — 스프라이트는 폭이 있어서 **옆줄**이 먼저 풀밭 위로 넘친다.
    //   폭(±halfW 셀, iso-x 방향 = (+1,-1))에 걸친 줄들의 **최소값**을 쓴다.
    const upCol = (acx, acy) => { let k = 0; while (k < 40 && isRk(acx - k - 1, acy - k - 1)) k++; return k; };
    const upRock = (acx, acy, halfW) => {
      let m = upCol(acx, acy);
      const w = Math.max(1, Math.round(halfW));
      for (let i = 1; i <= w; i++) {
        const a1 = upCol(acx + i, acy - i), a2 = upCol(acx - i, acy + i);
        if (a1 < m) m = a1; if (a2 < m) m = a2;
      }
      return m;
    };

    // ★여백까지 배치한다(덮개 판정에 쓰려고). **코어 것만 내보낸다.**
    const all = [], core = [];
    const cLo = gx * MT_CH, cHi = cLo + MT_CH, rLo = gy * MT_CH, rHi = rLo + MT_CH;
    for (const T of MT_TIERS) {
      const li0 = Math.floor((c0) / T.step), li1 = Math.ceil((c0 + W) / T.step);
      const lj0 = Math.floor((r0) / T.step), lj1 = Math.ceil((r0 + W) / T.step);
      for (let lj = lj0; lj <= lj1; lj++) for (let li = li0; li <= li1; li++) {
        // ★지터는 **격자 지표**의 해시다 — 청크가 달라도 같은 값이 나온다(이음매 방지)
        const j1 = _cellHash(li, lj, T.seed), j2 = _cellHash(li, lj, T.seed + 1);
        const cx = Math.round(li * T.step + (j1 - 0.5) * T.step * 0.9);
        const cy = Math.round(lj * T.step + (j2 - 0.5) * T.step * 0.9);
        if (!isRk(cx, cy)) continue;
        const dE = edgeD(cx, cy);
        // ★★[재민 2026-08-07] **딱딱한 문턱을 뺐다.**
        //   실측: 배율 2.18(폭 22셀) 봉우리가 **겉면 12셀**을 깎은 것만으로 통째로 사라졌다.
        //   원인은 이 `dE < minD` 문턱이다 — 가장자리 거리가 임계를 지나는 순간 탈락해
        //   "낮아지는" 게 아니라 "없어진다"(팝). 겉면만 부수는 규칙으로도 못 막는다.
        //   부수는 위치와 무관하게 안쪽 거리가 줄면 언젠가 임계를 지나기 때문이다.
        //   ⇒ 문턱을 없애고 **배율 상한(_mtFit)만** 남긴다. 그러면 깎을수록 봉우리가
        //     사라지는 대신 **낮아진다** — 채석장에서 산이 물러나는 그림이다.
        //   계층은 이제 '설 자리 조건'이 아니라 **격자 밀도**일 뿐이다(L 13셀·M 7.5·S 4.2).
        //   크기는 전적으로 가장자리 거리가 정한다.
        const nr = _mtNearRidge(cx * 32 + 16, cy * 32 + 16);
        const sg = { x: cx * 32 + 16, y: cy * 32 + 16, name: _mtPick(cx, cy, nr.ang, nr.isF, T),
                     sc: _mtFit(T.s0 + (T.s1 - T.s0) * _cellHash(cx, cy, T.seed + 2), dE),
                     vy: 1, jx: 0, jy: 0, tier: T.k };
        sg.vy = _mtFitVy(sg.name, sg.sc, _mtHgt(dE, cx, cy, T.seed + 3), upRock(cx, cy, MT_CROSS_U / 2 * sg.sc));
        all.push(sg);
        if (cx >= cLo && cx < cHi && cy >= rLo && cy < rHi) core.push(sg);
      }
    }
    // ★틈 메우기 — 코어의 맨 바위 셀을 알파로 찾아 잔봉우리를 얹는다(3셀 격자로 한 곳 한 장)
    // ★3셀 격자 중복 제거를 **뺐다** — 그게 덮개 보장을 깨고 있었다(같은 칸의 다른 셀이
    //   처리되면 이 셀은 영영 건너뛰어진다. 실측에서 맨 바위 1셀이 그렇게 남았다).
    //   대신 새로 얹은 스프라이트를 `all` 에 바로 넣어 **덮개 판정 자체가 중복을 막게** 한다.
    for (let acy = rLo; acy < rHi; acy++) for (let acx = cLo; acx < cHi; acx++) {
      if (!isRk(acx, acy)) continue;
      const p = w2i(acx * 32 + 16, acy * 32 + 16);
      let covered = false;
      for (let i = 0; i < all.length; i++) if (_mtCovers(all[i], p.x, p.y)) { covered = true; break; }
      if (covered) continue;
      const nr = _mtNearRidge(acx * 32 + 16, acy * 32 + 16);
      const sg = { x: acx * 32 + 16, y: acy * 32 + 16, name: _mtPick(acx, acy, nr.ang, nr.isF, MT_TIERS[2]),
                   sc: _mtFit(0.78 + 0.30 * _cellHash(acx, acy, 515), edgeD(acx, acy)),
                   vy: 1, jx: 0, jy: 0, tier: '틈' };
      sg.vy = _mtFitVy(sg.name, sg.sc, _mtHgt(edgeD(acx, acy), acx, acy, 516), upRock(acx, acy, MT_CROSS_U / 2 * sg.sc));
      all.push(sg); core.push(sg);
    }
    // ★★기슭 [재민 2026-08-07 "산과 풀의 경계가 뚝 끊긴다" → "고고"]
    //   ⓐ **기슭은 '작은 산'이 아니라 '납작한 산'이다.** 크기만 줄이면 자갈로 읽히고,
    //      세로만 눌러야(vy 0.26~0.58) 둔덕으로 읽힌다. 그래서 sc 는 조금만 줄이고 vy 를 눌렀다.
    //   ⓑ 자락(S)의 높이 바닥을 0.58 로 내려 뒀다(_mtHgt) — 산→기슭이 끊김 없이 이어진다.
    //   ⓒ **균일 산포 금지**(배치 21 재민 지적 "일부러 심은 느낌") — 밀도도 거리에 따라 준다.
    //   ⓓ ★**지형 데이터 무접촉**: 순수 렌더다. 콜라이더·통행·자원·econ 전부 그대로다.
    //      풀 셀 위에 그림만 얹는다 — 물 셀엔 안 선다(물가 술이 이미 그 자리 주인이다).
    if (!_t19.footOff) {
      for (let lj = Math.floor(r0 / MT_FOOT.step); lj <= Math.ceil((r0 + W) / MT_FOOT.step); lj++) {
        for (let li = Math.floor(c0 / MT_FOOT.step); li <= Math.ceil((c0 + W) / MT_FOOT.step); li++) {
          const j1 = _cellHash(li, lj, 811), j2 = _cellHash(li, lj, 812);
          const cx = Math.round(li * MT_FOOT.step + (j1 - 0.5) * MT_FOOT.step);
          const cy = Math.round(lj * MT_FOOT.step + (j2 - 0.5) * MT_FOOT.step);
          if (cx < cLo || cx >= cHi || cy < rLo || cy >= rHi) continue;   // 코어만 내보낸다
          if (isRk(cx, cy)) continue;                                     // 바위 위는 산이 이미 선다
          const wx = cx * 32 + 16, wy = cy * 32 + 16;
          if (isWaterAtAbs(wx, wy)) continue;
          const dO = outD(cx, cy);
          if (dO <= 0 || dO > MT_FOOT.dMax) continue;
          const t = 1 - dO / MT_FOOT.dMax;                                // 1 = 바위 코앞
          if (_cellHash(cx, cy, 631) > 0.18 + 0.72 * t) continue;
          const nr = _mtNearRidge(wx, wy);
          const sg = { x: wx, y: wy, name: _mtPick(cx, cy, nr.ang, nr.isF, MT_TIERS[2]),
            sc: _mtFit(MT_FOOT.s0 + (MT_FOOT.s1 - MT_FOOT.s0) * t * (0.55 + 0.45 * _cellHash(cx, cy, 813)), MT_FIT_TOL - dO),
            vy: MT_FOOT.vy0 + (MT_FOOT.vy1 - MT_FOOT.vy0) * t + 0.10 * (_cellHash(cx, cy, 814) - 0.5),
            jx: 0, jy: 0, tier: '기슭' };
          sg.vy = _mtFitVy(sg.name, sg.sc, sg.vy, 0);
          core.push(sg);
        }
      }
    }
    if (_mtChunk.size > 220) _mtChunk.clear();
    _mtChunk.set(key, core);
    return core;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★★ 3D 산 — 높이맵 메시를 청크×반대각선 띠로 구워 **mtseg 자리에 꽂는다**
  //   [재민 2026-08-09 "일단 이대로 본게임 ㄱ"]
  //
  //   렌더러를 안 바꾼다. 산 "이미지의 출처"만 스프라이트 → 구운 메시로 바꾼다.
  //   같은 앵커·같은 z정렬·같은 안개 게이트·같은 renderables wx/wy 규약을 그대로 쓴다.
  //
  //   ★1칸 = 화면 32px 이 정확히 떨어진다: PPU·cos30°·ZSQ = 45.2548×0.8660×0.8165 = 32.00
  //     그래서 WebGL 없이 캔버스 2D 로 정확히 그려진다.
  //   ★z: 셀 (i,j) 중심의 (wx+wy)/2 = 16(i+j)+16. 같은 반대각선은 z 가 같다.
  //     띠 = 반대각선 하나 → 화가 알고리즘이 정확히 성립한다. 개체가 그 위에 서도록 −0.5.
  //   ★높이는 **가장자리 거리장**에서 유도한다 — 지형 데이터 한 바이트 안 건드린다.
  //     파괴는 `_mtRockAt`(정본) 이 이미 반영한다.
  //   ★실패하면 스프라이트 판으로 되돌아간다(아래 try/catch). 라이브를 못 세운다.
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[재민 2026-08-09 "산 근처에서 엄청나게 렉"] — 맞았다. 원인을 실측으로 다 찾았다.
  //   뷰 반경(1800px=114셀) 안 청크 225개, 그중 산 청크 140개.
  //   조각 **108만 개** → 캔버스 fill **326만 회**. 거리장 계산만 **6.7초**(캔버스 비용 제외).
  //   전부 `_mtCollect` 안에서 **프레임 동기로** 돌았다. 걸어 들어가면 그대로 멈춘다.
  //   다섯이 곱해지고 있었다:
  //     ⓐ 프레임당 굽기 예산이 없었다 → 새로 보이는 청크를 한 프레임에 다 구웠다
  //     ⓑ 뷰 반경 1800px 는 **스프라이트 시절 값**이다. 화면은 22셀인데 114셀을 구웠다
  //     ⓒ 청크 8셀 + 여유 10셀 → 28×28=784셀 거리장을 64셀 쓰려고 계산(12배 낭비)
  //     ⓓ SUBPX 6 → 셀당 조각 121개. 목업 판정용 값을 그대로 들고 왔다
  //     ⓔ 청크마다 바위 판정을 1600번씩 다시 물었다(여유가 이웃과 겹치는데도)
  //   결과: 조각 108만 → 14만(7.7배) · fill 326만 → 42만
  const MT3_CH = 16;                   // 청크(셀) — 8 → 16. 여유 재계산 낭비 12배 → 5배
  let MT3_PAD = 24;                    // 거리장 여유 — ★창 밖은 INF 라 dE 가 창에서 **잘린다**.
                                       //   12 → 24 [실측 2026-08-24]: 지면색 화소 28776 → 230(−99.2%).
                                       //   짝 프로파일 청크 굽기 1371.17±63.28 → 1370.66±53.31ms (차 −0.52, 2σ=74 → **잡음**).
                                       //   ★상한: MT3_HTEX 64 가 N = CH+2·PAD ≤ 64 로 묶는다 ⇒ PAD ≤ 24.
  let MT3_DCAP = 24;                   // ★가장자리 거리 상한(셀). 0=끔. PAD 이하로 자르면 **모든 청크가
                                       //   같은 답**을 낸다(창 크기와 무관) — 이음매가 원리적으로 사라진다.
  // ★★[재민 확정 2026-08-19] **산은 벽이다.** 실측이 전제를 뒤집었다(scripts/measure-mtscale.js):
  //   산괴는 178×232 · 183×224 · 220×173 셀 = **폭 180~230m** 로 이미 크다. 눌린 건 높이뿐이었다.
  //   옛 규약(HMAX 9 / LAM 10)은 그 200m 산괴의 마루를 8.9m 로 깎았다 — 성목이 3~8m 다.
  //   길드가 며칠 걸려 1셀을 뚫는 대가가 **0.9m 턱**이었으니 규칙과 그림이 반대 말을 했다.
  //   ⇒ 발자국은 한 셀도 안 건드리고 **수직만 편다**. 상징 지리(마을 거리·강폭·사냥 밴드) 무영향.
  //   HMAX 35 / LAM 2.5 → 마루 35m(나무의 6.4배) · 가장자리 **14m/셀**(1셀 파면 절벽이 열린다).
  //   ★★LAM 2.5(가장자리 14m/셀)는 **이 기법으로 못 그린다.** 실측 스크린샷이 답이었다:
  //     1셀 = 가로 32px 이고 1m = 세로 32px 이라, 14m/셀 이면 셀 하나가 가로:세로 1:14 로
  //     늘어난 조각이 된다 — 무슨 짓을 해도 셀 격자가 그대로 보인다(말뚝 울타리 2차).
  //     아이소 높이장이 견디는 한계는 대략 3m/셀(화면 71°)이다.
  //   ⇒ 마루 35m 는 지키고 **경사 길이만** 12셀로 편다. 가장자리 3m/셀(사람 키의 두 배 턱),
  //     5셀 들어가면 12m, 더 들어가면 25m — 길드가 파 들어갈수록 벽이 자란다.
  let MT3_HMAX = 35, MT3_LAM = 12;
  //   ★★35m 로 올리자마자 **말뚝 울타리**가 나왔다(실측 스크린샷). 원인은 옛 높이식이다:
  //     h 가 가장자리 거리 dE 만의 함수라 **경계 셀이 전부 같은 높이**가 되고, 면이 수직에
  //     가까워지면 그 균일함이 셀 격자 그대로 드러난다. HMAX 9 에선 완만해서 안 보였을 뿐이다.
  //   ⇒ 경사 길이(LAM)와 마루 높이(HMAX)를 **자리마다 흔든다** — 버트레스·구유·안부가 생긴다.
  const MT3_LAMV = 0.60;               // 경사 길이 흔들기(로그 폭). ×0.55 ~ ×1.82 = 6.6~21.8셀
                                       //   (1.15 는 ×0.32 까지 내려가 3.8셀=9m/셀 절벽을 만들어 다시 격자가 났다)
  const MT3_HV = 0.62;                 // 마루 높이 흔들기 폭(0.55 ~ 1.17배)
  const MT3_ROUGH = 0.25;              // 결의 진폭(HMAX 대비). 국소 높이에 **비례**해 얹는다
  let MT3_MACRO = 0.42;                // ④ 거시 fBm 이 가장자리 거리를 미는 세기(지릉·골)
  let MT3_MACROH = 0.16;               // 거시 fBm 이 마루 높이에 더하는 세기(HMAX 대비)
  //   ★세분은 **상수**여야 한다 — 이웃 셀과 다르면 공유 변에 T-접합이 생겨 틈이 벌어진다.
  const MT3_SUB = 6;                   // 셀당 6×6 조각 (한 조각 ≈ 10px)
  let MT3_TENT = 1;                    // 보간 전 높이장 3×3 텐트 횟수(등고선 계단).
                                       //   LAM 2.5 에선 계단이 절벽 쪽뿐이라 1회면 되고,
                                       //   2회면 마루의 결(수관이 앉을 기복)까지 뭉갠다.
  // ★★수집 범위를 **화면 좌표로 정확히** 자른다. [산 높이 35m 확정과 함께]
  //   옛 값 1050 은 "화면 22셀 + 산 높이 288px" 을 뭉뚱그린 월드 정사각형이었다.
  //   높이가 9→35m 가 되면 산은 앵커보다 **1120px 위**까지 그려지므로, 같은 방식으로 늘리면
  //   반경 1900 → 굽는 넓이가 3.2배가 된다. 대부분 화면에 안 걸리는 청크다.
  //   ⇒ 셀이 화면에 걸릴 조건을 그대로 쓴다:
  //       화면x = (wx−wy) − (camx−camy),  화면y = (wx+wy)/2 − (camx+camy)/2 − h·32
  //     세로는 **아래쪽만** h·32 만큼 더 본다(위쪽은 늘릴 이유가 없다 — 산은 위로만 자란다).
  let MT3_VIEW = 2400;               // 안전 상한(계산 실패 시의 하드 캡). 실제 컷은 아래 화면식.
  const MT3_BUDGET = 1;                // ★프레임당 새로 굽는 청크 수. 지면 타일(5)보다 훨씬 무겁다
  const MT3_L = [-0.452, -0.6455, 0.6157];       // 태양 52°/−35°
  const MT3_AMB = 0.24, MT3_DIR = 1.10;
  const MT3_KFLAT = MT3_AMB + MT3_DIR * MT3_L[2];
  const _mt3Chunk = new Map();         // "zid_gx_gy" → segs[]
  const _mt3Dirty = new Set();         // 다시 구울 청크 키(파괴 근처만)
  // ★셀별 바위 판정 캐시. 청크마다 여유(12셀)가 이웃과 겹치는데 매번 다시 물었다 —
  //   청크당 40×40=1600번, 뷰 전체 35,200번. 그게 거리장 74ms/청크의 정체였다.
  //   (`isRockCellLocal` 이 느린 건 알려진 사실이고 **고치지 말라**고 못박힌 정본이다.
  //    그러니 정본을 고치는 게 아니라 **덜 부른다**. 뷰 전체 4,356번으로 8배 준다.)
  const _mt3RockC = new Map();
  function _mt3RockCell(zid, cx, cy) {
    const k = cx * 1048576 + cy;
    const v = _mt3RockC.get(k); if (v !== undefined) return v;
    const r = _mtRockAt(zid, cx * 32 + 16, cy * 32 + 16);
    if (_mt3RockC.size > 60000) _mt3RockC.clear();
    _mt3RockC.set(k, r); return r;
  }
  // ★원본 마스크도 **캐시한다.** 이원화를 넣으면서 굽기 경로가 캐시 없는 _mtRockAt0 를
  //   셀마다 부르게 됐다 — 청크 하나가 40×40=1600 셀이고 그게 정본 술어(ridge 경로 순회)를
  //   매번 다시 탄다. 원본 마스크는 파괴와 무관해 **영구 불변**이라 캐시가 특히 안전하다.
  //   (재민 규약: `isWaterCellLocal`/`isRockCellLocal` 이 느리다고 고치지 마라 → 덜 부른다.)
  const _mt3Rock0C = new Map();
  function _mt3RockCell0(zid, cx, cy) {
    const k = cx * 1048576 + cy;
    const v = _mt3Rock0C.get(k); if (v !== undefined) return v;
    const r = _mtRockAt0(zid, cx * 32 + 16, cy * 32 + 16);
    if (_mt3Rock0C.size > 60000) _mt3Rock0C.clear();
    _mt3Rock0C.set(k, r); return r;
  }
  // ★★[실측 2026-08-25] 파괴와 **복원이 같은 무효화**를 쓰게 묶는다.
  //   전에는 `__mtDestroy` 만 `_mt3RockC` 를 지우고 `_mt3Dirty` 를 채웠고,
  //   `__mtClearDestroy` 는 `_mtSegCache`·`_mtChunk`·`_groundTiles` 만 비웠다.
  //   3D 판의 구운 띠는 `_mt3Chunk` 에 남아 **되돌려도 산이 안 돌아왔다**
  //   (e2e-mountain ⓓ: 상태는 완전 복원 — 마스크 0불일치·높이 |Δ|0.000m — 인데 그림은 그대로).
  //   ⇒ 무효화를 한 함수로 뽑아 양쪽이 **같은 식**을 쓴다(사본 금지).
  // 이 셀이 **메시에 드는가** — 굽는 쪽과 재는 쪽이 같은 식을 쓴다(사본 금지).
  //   규약: 바위 ∪ 바위에 8-인접(자락 한 칸). 자락은 **일부러** 넣는다 — 테두리를 닫으려고.
  function _mt3IsMesh(F, i, j) {
    if (F.isRock(i, j)) return true;
    for (let q = -1; q <= 1; q++) for (let r = -1; r <= 1; r++) if (F.isRock(i + r, j + q)) return true;
    return false;
  }
  function _mt3InvalidateCell(zid, cx, cy) {
    _mt3RockC.delete(cx * 1048576 + cy);
    const gx0 = Math.floor(cx / MT3_CH), gy0 = Math.floor(cy / MT3_CH);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++)
      _mt3Dirty.add(zid + '_' + (gx0 + a) + '_' + (gy0 + b));
  }
  let _mt3Sig = '';
  // ★★[35m 판 줄무늬의 정체 — 계측으로 특정] 사면의 등고선식 띠는 거리장 계단이 아니었다.
  //   높이장을 3×3 으로 1·3·6회 블러해도 **그대로 남았다**(스윕 그림). 스펙트럼으로 재니
  //   봉우리가 **2.1셀 주기**에 섰다(배수 4.54) — 마루 결 옥타브 `_mt3vn(ai/2.1, …)` 의 격자다.
  //   원인: 값 잡음의 보간이 smoothstep(3t²−2t³)이라 격자선에서 **곡률이 튄다**(C1 이고 C2 아님).
  //   음영은 기울기의 변화에 민감해서 그 곡률 불연속이 주름으로 보인다. HMAX 9 에선 결의
  //   진폭이 작아 안 보였을 뿐이고, 35m 로 키우자 드러났다.
  //   ⇒ quintic(6t⁵−15t⁴+10t³). 격자에서 1차·2차 도함수가 둘 다 0 이라 주름이 안 생긴다.
  //     (셀 경계의 smoothstep 을 Catmull-Rom 으로 걷어낸 것과 **같은 종류의 수리**다.)
  // 옥타브마다 격자를 돌려 부르는 헬퍼 — 셰이더의 rot() 과 같은 처방(와플 방지)
  const _mt3rvn = (x, y, s, a) => {
    const c = Math.cos(a), sn = Math.sin(a);
    return _mt3vn(c * x - sn * y, sn * x + c * y, s);
  };
  const _mt3vn = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = _cellHash(xi, yi, s), b = _cellHash(xi + 1, yi, s);
    const c = _cellHash(xi, yi + 1, s), e = _cellHash(xi + 1, yi + 1, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
  };
  const MT3_RAMP = [[0.00, 76, 104, 52, 0.00], [0.30, 62, 92, 44, 0.62],
                    [0.62, 84, 104, 62, 0.40], [1.00, 126, 130, 120, 0.16]];
  function _mt3Ramp(t) {
    let i = 0; while (i < MT3_RAMP.length - 2 && t > MT3_RAMP[i + 1][0]) i++;
    const a = MT3_RAMP[i], b = MT3_RAMP[i + 1];
    const u = Math.max(0, Math.min(1, (t - a[0]) / Math.max(1e-6, b[0] - a[0])));
    const m = (k) => a[k] + (b[k] - a[k]) * u;
    return 'rgba(' + Math.round(m(1)) + ',' + Math.round(m(2)) + ',' + Math.round(m(3)) + ',' + m(4).toFixed(3) + ')';
  }
  // 청크 하나의 높이장 — 절대 셀 좌표 기준이라 청크 경계에 이음매가 없다
  function _mt3Field(zid, gx, gy) {
    const N = MT3_CH + MT3_PAD * 2;
    const i0 = gx * MT3_CH - MT3_PAD, j0 = gy * MT3_CH - MT3_PAD;
    // ★마스크 둘: rock = **원본**(높이·렌더 기준) · cut = 파낸 셀(메시에서 도려낼 자리)
    const rock = new Uint8Array(N * N), cut = new Uint8Array(N * N);
    let any = false;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const cx = i0 + i, cy = j0 + j;
      const r = (MT3_DUAL ? _mt3RockCell0(zid, cx, cy) : _mt3RockCell(zid, cx, cy)) ? 1 : 0;
      rock[j * N + i] = r; if (r) any = true;
      if (r && MT3_DUAL && _mtIsCut(zid, cx, cy)) cut[j * N + i] = 1;
    }
    if (!any) return null;
    const INF = 1e6, d = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) d[k] = rock[k] ? INF : 0;
    const at = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? INF : d[j * N + i];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; if (!d[k]) continue;
      d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; if (!d[k]) continue;
      d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }
    // ★[되돌림 — 실측] 거리장을 3×3 텐트로 먼저 흐리는 안을 넣었다가 뺐다. 이유 둘:
    //   ① 노린 효과가 없었다(셀 격자 봉우리 7.27 → 7.85, 오히려 소폭 상승)
    //   ② **가장자리 암벽 띠를 지워 버렸다.** 바위 아닌 이웃을 중앙값으로 대체하니
    //      경계 셀의 d 가 안쪽 값 쪽으로 끌려 올라가, h 가 2.8m 에서 훌쩍 뛰어
    //      edgeC(=낮은 h) 가 0 이 된다. 실측: 바위 비중 9.4% → **0.0%**.
    //   거리장의 이산성은 남지만, 그건 높이장 텐트(MT3_TENT)와 Catmull-Rom 이 받는다.
    const hg = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!rock[j * N + i]) continue;
      // ★상한을 걸면 청크마다 창이 달라도 **같은 dE** 를 얻는다(PAD 이하일 때). 0 이면 현행 그대로.
      const dE = (MT3_DCAP > 0) ? Math.min(d[j * N + i], MT3_DCAP) : d[j * N + i], ai = i0 + i, aj = j0 + j;
      // 자리마다 다른 경사 길이 — 어떤 스트레치는 수직 절벽, 어떤 데는 비스듬한 너덜.
      //   로그로 흔들어 기하평균은 MT3_LAM 그대로 둔다(가장자리 14m/셀 이라는 규약 유지).
      const lamL = MT3_LAM * Math.exp(MT3_LAMV * (2 * _mt3vn(ai / 26, aj / 26, 53) - 1));
      // 자리마다 다른 마루 높이 — 봉우리와 안부(鞍部)가 생긴다.
      const hmaxL = MT3_HMAX * (1 - MT3_HV * 0.5 + MT3_HV * _mt3vn(ai / 37, aj / 37, 59));
      // ★★[④ 지형 문법] 거시 fBm(8~40셀). 옥타브마다 **격자 회전 + 도메인 워프**(와플 재발 방지).
      //   높이에 그냥 더하면 봉우리만 출렁이고 **지릉·골이 안 생긴다**. 대신 **가장자리 거리 dE 를
      //   안팎으로 민다** — 등고선이 밀려 들어가면 골, 밀려 나오면 지릉이 된다. 능선이 갈라진다.
      const Wu = ai + 5.5 * (_mt3rvn(ai / 17, aj / 17, 81, 0.41) - 0.5);
      const Wv = aj + 5.5 * (_mt3rvn(ai / 17, aj / 17, 83, 2.23) - 0.5);
      const MAC = 0.55 * (_mt3rvn(Wu / 40, Wv / 40, 61, 0.29) - 0.5)
                + 0.30 * (_mt3rvn(Wu / 19, Wv / 19, 63, 1.77) - 0.5)
                + 0.15 * (_mt3rvn(Wu / 8.5, Wv / 8.5, 67, 2.61) - 0.5);
      const dEff = Math.max(0, dE * (1 + MT3_MACRO * 2 * MAC));
      let h = hmaxL * (1 - Math.exp(-dEff / lamL));
      h += Math.min(1, Math.max(0, (dE - 2) / 6)) * MT3_HMAX * MT3_MACROH * 2 * MAC;
      h = Math.max(0, h);
      // ★결은 **국소 높이에 비례**해서 얹는다. 절대량으로 얹으면 11m 짜리 가장자리 셀이
      //   음수로 꺼져 산자락에 구멍이 뚫린다(옛 판은 dE/3 로 결을 죽여서 벽이 균일해졌다).
      const rel = Math.min(1, h / MT3_HMAX);
      // ★옥타브마다 **다른 각으로 돌린 격자** + 도메인 워프.
      //   전부 같은 축에 정렬된 값 잡음을 겹치면 격자선이 쌓여 등각 축의 **와플 주름**이 된다.
      const wu = ai + 3.2 * (_mt3rvn(ai / 9, aj / 9, 71, 0.9) - 0.5);
      const wv = aj + 3.2 * (_mt3rvn(ai / 9, aj / 9, 73, 2.7) - 0.5);
      h += rel * MT3_HMAX * MT3_ROUGH * (0.64 * (_mt3rvn(wu / 14, wv / 14, 29, 0.37) - 0.5)
              + 0.38 * (_mt3rvn(wu / 6, wv / 6, 31, 1.31) - 0.5)
              + 0.26 * (_mt3rvn(wu / 2.9, wv / 2.9, 37, 2.49) - 0.5)
              + 0.12 * (_mt3rvn(wu / 1.6, wv / 1.6, 41, 0.83) - 0.5));
      const crest = Math.min(1, Math.max(0, (dE - 3) / 5));
      h += crest * MT3_HMAX * MT3_ROUGH * (0.28 * (_mt3rvn(wu / 4.2, wv / 4.2, 43, 1.94) - 0.5)
              + 0.14 * (_mt3rvn(wu / 2.1, wv / 2.1, 47, 0.52) - 0.5));
      hg[j * N + i] = Math.max(0.12, h);
    }
    const t2 = Float32Array.from(hg), SMB = 0.55;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!rock[j * N + i]) continue;
      let sum = t2[j * N + i] * 2, w = 2;
      for (const o of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const ii = i + o[0], jj = j + o[1];
        sum += (ii < 0 || jj < 0 || ii >= N || jj >= N) ? 0 : t2[jj * N + ii]; w++;
      }
      hg[j * N + i] = t2[j * N + i] * (1 - SMB) + (sum / w) * SMB;
    }
    // ★★[타 세션 판정 2026-08-09 "셋째, 능선 쪽의 등고선식 계단"] — 원인은 거리장이다.
    //   h = HMAX(1−e^(−dE/LAM)) 에서 dE 는 챔퍼 변환의 **이산 값**(1, 1.414, 2, …)이라
    //   같은 dE 를 가진 셀들이 통째로 **같은 높이**가 된다 — 그게 등고선 문턱이다.
    //   위의 무작위 결을 얹어도 계단은 남는다(결은 dE 에 **곱해졌을** 뿐이다).
    //   ⇒ 보간 전에 3×3 텐트를 먹인다. 단, 산자락이 깎이면 안 되므로 바위가 아닌 이웃은
    //     **중앙값으로 대체**(replicate)한다 — 실루엣은 그대로 두고 계단만 지운다.
    const TENT = [1, 2, 1];
    for (let pass = 0; pass < MT3_TENT; pass++) {
      const src = Float32Array.from(hg);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (!rock[j * N + i]) continue;
        const c0 = src[j * N + i];
        let sum = 0, w = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          const ii = i + a, jj = j + b, wt = TENT[a + 1] * TENT[b + 1];
          const ok = ii >= 0 && jj >= 0 && ii < N && jj < N && rock[jj * N + ii];
          sum += (ok ? src[jj * N + ii] : c0) * wt; w += wt;
        }
        hg[j * N + i] = sum / w;
      }
    }
    const hAt = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? 0 : hg[j * N + i];
    const cor = (i, j) => (hAt(i - 1, j - 1) + hAt(i, j - 1) + hAt(i - 1, j) + hAt(i, j)) / 4;
    // ★★[타 세션 판정] **smoothstep 은 걷어냈다.** 경계에서 도함수를 0 으로 만드니 C1 은 됐지만
    //   셀마다 기울기가 0→최대→0 으로 오르내려 **베개(누비이불) 무늬**가 생겼다(판정 둘째 층).
    //   ⇒ Catmull-Rom 바이큐빅(4×4 이웃). 값도 기울기도 이어지면서 셀 안에 강제 극점이 없다.
    //   ★셰이더의 hAll() 과 **같은 식**이어야 실루엣(꼭짓점)과 음영(프래그먼트)이 안 엇갈린다.
    const _cr1 = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t
              + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    const corS = (x, y) => {
      const fx = Math.floor(x), fy = Math.floor(y), tx = x - fx, ty = y - fy;
      const r = [0, 0, 0, 0];
      for (let m = 0; m < 4; m++) { const yy = fy + m - 1;
        r[m] = _cr1(cor(fx - 1, yy), cor(fx, yy), cor(fx + 1, yy), cor(fx + 2, yy), tx); }
      return _cr1(r[0], r[1], r[2], r[3], ty);
    };
    return { N, i0, j0, rock, cut, hAt, cor, corS,
             isCut: (i, j) => i >= 0 && j >= 0 && i < N && j < N && !!cut[j * N + i],
             isRock: (i, j) => i >= 0 && j >= 0 && i < N && j < N && !!rock[j * N + i] };
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ★★★ 산 표면을 **WebGL 높이장 메쉬**로 [타 세션 판정 2026-08-09]
  //
  //   판정 그대로다: 캔버스 2D 폴리곤 수천 개로 곡면을 그리는 한
  //     ⓐ 조각 이음새의 AA 틈(밝은 철망), ⓑ 셀 정렬 세분/보간이 만드는 누비이불 띠,
  //     ⓒ 셀별 법선 계단 — 셋 다 안 사라진다. 부풀리기·smoothstep·세분 고정은 증상 완화였다.
  //   ⇒ GPU 로 옮긴다. 꼭짓점을 공유하는 삼각형으로 한 번에 래스터화하면 이음새가 없고,
  //     법선을 **프래그먼트에서** 높이장 바이큐빅으로 뽑으면 셀 정렬 음영이 사라진다.
  //
  //   ★물 컨텍스트를 **재사용하지 않았다.** 물은 매 프레임 화면 크기 전면 패스이고
  //     산은 띠마다 작은 패스라, 한 캔버스를 공유하면 프레임마다 리사이즈가 붙는다
  //     (캔버스 재할당은 비싸다). 컨텍스트 2개는 한도(≈16) 안이다.
  //   ★띠(mtseg) 구조는 그대로 둔다 — 안개 게이트·z 정렬·개체 가림 계약이 거기 걸려 있다.
  //     띠 경계는 월드 셀 경계와 같아 양쪽 삼각형이 정확히 맞물린다.
  // ═══════════════════════════════════════════════════════════════════════════
  let MT3_GL = 1;                      // 산 표면을 GPU 로 그린다(0 이면 옛 캔버스 폴리곤 판)
  const MT3_HTEX = 64;                 // 높이 텍스처 한 변 — ★N = CH+2·PAD 이상이어야 한다. PAD 24 ⇒ N=64 로 **딱 맞다**.
                                       //   PAD 를 더 키우려면 이 값도 같이 키워야 한다(안 키우면 셰이딩이 조용히 깨진다).
  let MT3_GSUB = 6;                    // 메쉬 세분. 음영은 프래그먼트라 여기와 무관하지만,
                                       //   조각 안에서 vC 를 **선형 보간**하므로 곡률이 큰 곳에
                                       //   조각 주기의 미세한 꺾임이 남는다(진폭 ∝ 1/GSUB²).
  const MT3_TW = 512, MT3_TH = 256;    // terrain 텍스처 한 장이 덮는 화면 크기(8×8셀 다이아)
  let MT3_ROCKS = 0.35;                // 바위 결 배율(캔버스 판의 setTransform(0.35) 과 같은 값)
  let MT3_TEXON = 1, MT3_AOON = 1;     // 시험 손잡이 — 질감/AO 를 빼서 무늬의 출처를 가른다
  let MT3_AOBOX = 0;                   // 1 이면 **옛 AO**(4×4 상자 평균 = 조각별 상수) — 반례 전용
  const MT3_OV = 0.008;                // 띠 겹침(셀). 가로 0.5px·세로 0.26px — 실루엣 부풀림은 무시할 수준
  let MT3_CV0 = 128;                   // GL 캔버스 초깃값. 띠가 크면 128 배수로 자란다
  let MT3_HTOP = MT3_HMAX * 1.55;    // 실제 최대 높이 상한(수집 여유용). 실측 최대 48.8m
  let MT3_DUAL = 1;                    // ⑶ 마스크 이원화 — 0 이면 옛 판(파괴가 높이를 낮춘다)
  // ★[재민 확정 2026-08-25] 자락 톱니 **1안 채택**(경계선 잡음). 0=옛 현행 · 2=알파 페더(기각).
  //   기각 근거: 2안은 judge-grid 세분6 대역 봉우리 8.12 — **새 주기를 만든다**.
  let MT3_FRINGE = 1;                  // 0=옛 현행 · **1=경계선 잡음(채택)** · 2=알파 페더(기각)
  const MT3_FR_H = 1.6;                // 자락으로 볼 높이(m). 이보다 낮은 곳에만 손댄다 — 마루는 안 건드린다
  // ★[재민 확정 2026-08-25] 띠 병합 **채택**. 자락도 통로도 없는 청크의 띠를 한 장으로 묶는다.
  //   실측: 띠 877 → 127 · 프레임 51.74±2.16 → 29.02±2.34ms (**−43.9%**, 2σ 2.85 → 유의)
  //   화소: 켬/끔 차이 140 vs **재현 바닥 139** — 바닥과 구별되지 않는다(돌출목 순서 수리 후).
  //   0 으로 끄면 옛 판으로 돌아간다(반례 장치).
  let MT3_MERGE = 1;
  // ★★[실측 2026-08-25] 병합 판의 앵커를 **가장 큰 k** 로 잡은 게 틀렸다.
  //   "그래야 이웃 띠 뒤로 안 눌린다"는 내 추론이었는데, 실측이 정반대를 말했다:
  //     앵커 가장 큰 k → 켬/끔 차이 **1062화소** · 앵커 **가장 작은 k → 1화소**(재현 바닥 0).
  //   안 병합 판의 띠도 앵커가 **가장 작은 k** 다. 같은 규칙을 쓰면 정렬이 그대로 재현된다.
  //   ⇒ 기본 0(=가장 작은 k, 안 병합 판과 같은 규칙). 1 은 반례 장치로만 남긴다.
  let MT3_MERGEZ = 0;                  // 병합 앵커: 0=가장 작은 k(채택) · 1=가장 큰 k(반례 장치)
  let _mt3MergedN = 0, _mt3BandN = 0;  // 병합된 청크 수 / 만든 띠 수 (판정용)
  let _mt3BandD = null;                // 방금 그린 띠의 [dMin,dMax,sMin,sMax,hMax]
  let MT3_SKIRT = 0;                   // ★치마 — 메시 **테두리** 변의 마루 높이가 이 값(m)을 넘으면 밑까지 벽을 세운다. 0=끔(기본)
  let _mt3SkirtQ = 0, _mt3SkirtAll = 0;// 실제 세운 쿼드 / 무조건 세웠을 때 (절감 보고용)
  let MT3_TREEP = 0.020;               // ③ 돌출목 — 셀당 확률(낮게 시작). 0 이면 끔
  let MT3_TREEPX = 30;                 // 그리는 높이(px). 실물(78px)이 아니라 **작은 축척**
  let MT3_MPAD = 18;                   // 띠 캔버스 여백(px) — 손잡이로 갈아 끼워 잘림 여부를 가린다
  const _mgl = { cv: null, gl: null, pr: null, ok: null, uni: {}, hTex: null, rTex: null, gTex: null,
                 vbo: null, buf: null, hKey: '', lp: -1, lc: -1, lm: -1, lh: -1 };
  const MT3_VS = [
    'attribute vec2 p; attribute vec2 c; attribute float m; attribute float hh;',
    'uniform vec2 uRes; varying vec2 vC; varying float vM; varying float vH;',
    // p 는 띠 캔버스 픽셀(왼쪽 위 원점). y 를 뒤집어 캔버스 좌표계로 맞춘다.
    // ★hh = **이 꼭짓점을 놓는 데 쓴 높이(m)** 그대로. p.y 가 (s − 32h) 라
    //   프래그먼트의 (화면y + 32·vH) = 보간된 **지면 깊이 s** 가 항등식으로 나온다.
    'void main(){ vC = c; vM = m; vH = hh; vec2 n = (p / uRes) * 2.0 - 1.0; gl_Position = vec4(n.x, -n.y, 0.0, 1.0); }'
  ].join('\n');
  const MT3_FS = [
    'precision highp float;',
    'varying vec2 vC; varying float vM; varying float vH;',
    'uniform sampler2D uH; uniform sampler2D uRock; uniform sampler2D uGrass;',
    'uniform float uN; uniform float uHmax; uniform vec3 uL; uniform vec2 uOrig;',
    // ── 픽셀 절단 ──────────────────────────────────────────────────────
    //   uCut     = 0 (문턱은 uCutBase 에 미리 빼 둔다 — 29만대 수를 float32 로 넘기면 ULP 0.031px)
    //   uCutSide = 0 끔 · +1 뒤쪽만(기준 ≤ c) · −1 앞쪽만(> c) · 2 = **가리개 한 판**
    //   uCutBase = (y0 + bh) − 문턱 ⇒ 화면y − 문턱 = uCutBase − gl_FragCoord.y
    //   uCutK    = **32**(v4 수직 평면, 지면 깊이 s) · 64(옛 v3 화면 평행 평면, s+32h)
    //   uDbgW    = 1 → vC.x · 2 → vC.y · 3 → 기준값 (판정기 전용)
    'uniform float uCut; uniform float uCutSide; uniform float uCutBase; uniform float uDbgW;',
    'uniform float uCutK;',
    'uniform vec2 uTex; uniform float uRockS; uniform float uTexOn; uniform float uAoOn; uniform float uAoBox;',
    'uniform float uFringe; uniform float uFrH;',
    // ── 높이: 16비트(R=상위, G=하위)로 실어 NEAREST 로 텍셀을 직접 읽는다 ──
    // R,G = 높이(16비트) · B = **미리 흐려 둔 높이**(8비트).
    //   ★AO 를 4×4 표본의 **상자 평균**으로 내고 있었다. 그 값은 floor(c) 에서 툭 바뀌는
    //     **조각별 상수**라, 셀 격자마다 명암이 계단으로 끊긴다 — 색 경로에 남은 무보간 자료다.
    //   ⇒ 흐린 높이를 텍스처에 실어, **높이와 똑같은 Catmull-Rom** 으로 읽는다(표본 추가 0).
    'vec2 hT(vec2 c){ vec2 uv=(clamp(c,0.0,uN-1.0)+0.5)/uN; vec4 t=texture2D(uH,uv);',
    '  return vec2((t.r + t.g/255.0)*uHmax, t.b*uHmax); }',
    // ── Catmull-Rom 기저와 그 도함수 ──
    //   smoothstep(옛 판)은 셀 경계에서 기울기를 **0 으로 강제**해 베개 무늬를 만들었다.
    //   Catmull-Rom 은 값·기울기를 이어 붙이면서 셀 안에 강제 극점을 안 만든다.
    'vec4 crW(float t){ float a=t*t, b=a*t;',
    '  return 0.5*vec4(-t+2.0*a-b, 2.0-5.0*a+3.0*b, t+4.0*a-3.0*b, -a+b); }',
    'vec4 crD(float t){ float a=t*t;',
    '  return 0.5*vec4(-1.0+4.0*t-3.0*a, -10.0*t+9.0*a, 1.0+8.0*t-9.0*a, -2.0*t+3.0*a); }',
    // ★4×4 이웃을 **한 번만** 읽어 h·∂h/∂x·∂h/∂y·평균을 동시에 뽑는다.
    //   중앙차분으로 법선을 구하면 바이큐빅을 5번 = 텍스처 80번 읽어야 한다(띠마다 수천만 번).
    //   해석 도함수는 16번으로 끝나고, 같은 곡면의 **정확한** 기울기라 근사 오차도 없다.
    'void hAll(vec2 c, out float h, out vec2 g, out float mean){',
    '  vec2 f = floor(c), t = c - f;',
    '  vec4 wx = crW(t.x), dx = crD(t.x), wy = crW(t.y), dy = crD(t.y);',
    '  h = 0.0; g = vec2(0.0); mean = 0.0;',
    '  for(int m=0;m<4;m++){',
    '    float y = f.y + float(m) - 1.0;',
    '    vec2 a0 = hT(vec2(f.x-1.0,y)), a1 = hT(vec2(f.x,y));',
    '    vec2 a2 = hT(vec2(f.x+1.0,y)), a3 = hT(vec2(f.x+2.0,y));',
    '    vec4 s = vec4(a0.x, a1.x, a2.x, a3.x);',
    '    vec4 sb = vec4(a0.y, a1.y, a2.y, a3.y);',
    '    float rv = dot(s,wx), rd = dot(s,dx);',
    '    h    += rv * wy[m];',
    '    g.x  += rd * wy[m];',
    '    g.y  += rv * dy[m];',
    '    mean += mix(dot(sb,wx), dot(sb,vec4(0.25)), uAoBox) * wy[m];',     // 흐린 높이도 **같은 바이큐빅** — 조각별 상수가 아니다
    '  }',
    '}',
    // ── 잔 결: **32px(=1셀) 과 무관한 주기**로. 셀 격자에 안 붙는다. ──
    // ★sin 해시를 안 쓴다. 프래그먼트마다 잔결·매크로로 vn2 를 여러 번 부르니 sin 이 4배씩
    //   붙는다(소프트웨어 래스터라이저에서 특히 비싸다). 게다가 월드 좌표가 커지면
    //   sin 의 인자가 수십만이 되어 정밀도가 무너진다. 곱셈·fract 만 쓰는 해시로 바꾼다.
    'float hash21(vec2 q){ vec3 p3 = fract(vec3(q.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33);',
    '  return fract((p3.x+p3.y)*p3.z); }',
    // 격자 주름을 없애려 quintic — CPU 쪽 _mt3vn 과 **같은 보간**이어야 두 판이 안 엇갈린다
    'float vn2(vec2 q){ vec2 i=floor(q), f=fract(q); f=f*f*f*(f*(f*6.0-15.0)+10.0);',
    '  return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y); }',
    // ★★[와플 주름] 값 잡음은 **자기 격자**를 갖는다. 옥타브를 여럿 겹쳐도 전부 같은 축에
    //   정렬돼 있으면 격자선이 겹쳐 쌓여 등각 축 방향의 **와플**이 된다.
    //   ⇒ 옥타브마다 격자를 다른 각으로 **돌리고**(rot), 좌표를 한 번 **휘어**(도메인 워프) 쓴다.
    //     회전각은 서로 무리수에 가까운 비로 골라 어느 두 옥타브도 축을 공유하지 않게 한다.
    'vec2 rot(vec2 p, float a){ float c=cos(a), s2=sin(a); return vec2(c*p.x - s2*p.y, s2*p.x + c*p.y); }',
    'float fbm(vec2 q, float o1, float o2, float o3){',
    '  vec2 wq = q + 0.30*vec2(vn2(rot(q*0.55, 0.9))-0.5, vn2(rot(q*0.55, 2.7))-0.5);',
    '  return o1*vn2(rot(wq, 0.37)) + o2*vn2(rot(wq*2.03, 1.31)) + o3*vn2(rot(wq*4.11, 2.49)); }',
    'void main(){',
    // ── 절단 — **표면·옆면·바닥 모두** 같은 식이다 ────────────────────
    //   화면y = s − 32h ⇒ 지면 깊이 s = 화면y + 32h. 경계는 **화면y = c − 32h**(등고선).
    '  float dCut = (uCutBase - gl_FragCoord.y) + uCutK * vH;',
    // ★uCutSide = 2 → **가리개 한 판**. 음영·질감·잡음을 전부 건너뛰어 색 패스보다 훨씬 싸다.
    //   블렌딩이 꺼져 있어 나중 조각이 덮어쓰므로 **맨 위 조각이 결정**한다.
    '  if (uCutSide > 1.5) { gl_FragColor = vec4(1.0, 1.0, 1.0, dCut <= uCut ? 1.0 : 0.0); return; }',
    // ★★discard 가 **아니라 투명 출력**이다. discard 로 하면 잘린 자리에 **밑에 깔린 조각**이
    //   드러나 화가 순서가 뒤집힌다(실측 70화소).
    '  if (uCutSide > 0.5) { if (dCut > uCut) { gl_FragColor = vec4(0.0); return; } }',
    '  else if (uCutSide < -0.5) { if (dCut <= uCut) { gl_FragColor = vec4(0.0); return; } }',
    // 판정 전용 — 이 프래그먼트가 **어느 셀**인지. 판정기가 정본 높이장으로 되짚어
    //   (화면y + 32h) 를 **독립으로** 다시 세워 문턱과 맞춘다. 알파는 덮임 표시 전용(자료 금지).
    '  if (uDbgW > 0.5) {',
    '    if (uDbgW > 2.5) {',
    '      float e = clamp((dCut - uCut + 512.0) / 1024.0, 0.0, 1.0);',
    '      gl_FragColor = vec4(floor(e * 255.0) / 255.0, fract(e * 255.0), (vM + 1.0) / 8.0, 1.0); return;',
    '    }',
    '    float q = (uDbgW < 1.5) ? vC.x : vC.y;',
    '    float t = clamp((q + 4.0) / 72.0, 0.0, 1.0);',
    '    float hi = floor(t * 255.0) / 255.0, lo = fract(t * 255.0);',
    '    gl_FragColor = vec4(hi, lo, (vM + 1.0) / 8.0, 1.0); return;',
    '  }',
    // ★★갱(shaft) — 파낸 셀의 **옆면·바닥**. 높이장은 한 셀에 높이 하나뿐이라
    //   "38m 벽에 둘러싸인 0m 바닥"을 표현할 수 없다(실측: 도려내기만 하면 지면이 비친다).
    //   ⇒ 이 조각들은 표면이 아니라 **수직면**이다. vC 의 뜻도 다르다:
    //     옆면 = (변을 따라간 월드 좌표, 높이m) · 바닥 = 셀 좌표.
    //   vM: 0=표면 · 1..4=옆면(법선 +x/−x/+y/−y) · 5=바닥
    '  if (vM > 0.5) {',
    '    vec3 wn = (vM<1.5)? vec3(1.0,0.0,0.0) : (vM<2.5)? vec3(-1.0,0.0,0.0)',
    '           : (vM<3.5)? vec3(0.0,1.0,0.0) : (vM<4.5)? vec3(0.0,-1.0,0.0) : vec3(0.0,0.0,1.0);',
    '    float ld = dot(wn, uL);',
    '    float lm = max(0.18, ld) + max(0.0, -ld)*0.15;',
    '    float kk = (0.24 + 1.10*lm) / (0.24 + 1.10*0.6157);',
    // 갓 깎은 바위 — 수관·풀 금지. 옆면은 세로 결이 서도록 UV 를 (변, 높이)로 쓴다.
    '    vec2 uvw = (vM<4.5) ? vec2(vC.x, -vC.y)*32.0 : vec2(vC.x - vC.y, (vC.x + vC.y)*0.5)*32.0;',
    '    vec3 rc = texture2D(uRock, uvw/(uTex*uRockS)).rgb;',
    '    float gr = vn2(rot(uvw/26.0, 0.37))*0.28 + vn2(rot(uvw/7.0, 1.31))*0.14;',
    '    vec3 cw = rc * (0.78 + 0.5*gr) * kk;',
    // 바닥으로 갈수록 어둡게 — 갱 속의 그늘
    '    if (vM < 4.5) cw *= mix(0.55, 1.0, clamp(-vC.y/8.0, 0.0, 1.0));',
    '    gl_FragColor = vec4(clamp(cw,0.0,1.0), 1.0); return;',
    '  }',
    '  float h; vec2 g; float mean;',
    '  hAll(vC, h, g, mean);',
    '  vec2 w = uOrig + vC;',                 // 절대 셀 좌표 — 청크가 바뀌어도 이어진다
    // 잔 결의 기울기를 법선에 얹는다(높이 자체는 안 흔든다 — 실루엣은 꼭짓점이 정한다)
    // 중앙차분(2회/축)이 아니라 **전방차분**(중앙 1 + 축당 1)으로 척도당 3회만 부른다.
    //   잔결의 기울기는 장식이라 한쪽으로 반 칸 치우쳐도 눈에 안 띈다 — 호출 8회 → 6회.
    '  float e = 0.31;',
    '  float aC = vn2(rot(w/2.7,0.37)), aX = vn2(rot((w+vec2(e,0.0))/2.7,0.37)), aY = vn2(rot((w+vec2(0.0,e))/2.7,0.37));',
    '  float bC = vn2(rot(w/1.13,1.31)), bX = vn2(rot((w+vec2(e,0.0))/1.13,1.31)), bY = vn2(rot((w+vec2(0.0,e))/1.13,1.31));',
    '  g.x += (aX-aC)*1.20 + (bX-bC)*0.60;',
    '  g.y += (aY-aC)*1.20 + (bY-bC)*0.60;',
    '  vec3 nrm = normalize(vec3(-g.x, -g.y, 1.0));',
    '  float lamD = dot(nrm, uL);',
    '  float lam = max(0.14, lamD) + max(0.0, -lamD)*0.20;',
    '  float k = (0.24 + 1.10*lam) / (0.24 + 1.10*0.6157);',
    '  float steep = 1.0 - nrm.z;',
    // ── 재질 [재민 확정 2026-08-19] **가장자리 암벽 + 윗면 숲** ──
    //   옛 판은 높이가 높을수록 바위였다 — 그래서 마루가 헐벗은 메사가 됐다.
    //   높이 항을 걷어내고 **경사만** 바위로 읽는다. LAM 2.5 면 가장자리는 기울기 14m/셀이라
    //   자동으로 암벽이 되고, 마루는 평평해 숲이 앉는다. 북한산·월출산 계열의 인상이다.
    '  float macro = (fbm(w/21.0, 0.58, 0.28, 0.14)-0.5)*2.55;',
    // ── 재질 [재민 확정 + 타 세션 ② 2026-08-20] **전신 바위산이 아니다** ──
    //   앞 판은 '경사만 바위'라 35m 벽의 사면이 통째로 회색이 됐다. 한국 육산은 그렇지 않다:
    //   숲이 정상까지 덮고, **능선(볼록한 마루)과 산자락 절벽**에만 바위가 드러난다.
    //   ⇒ 바위 = (급경사 **그리고** 능선) ∪ (가장자리 암벽 띠). 나머지는 전부 수관.
    '  float concR = mean - h;',                       // <0 = 볼록(마루·능선), >0 = 오목(골)
    // ★문턱을 더 낮춰(0.26/0.95/0.62) 능선 노출을 늘려 봤더니 바위가 **0.0%** 로 사라졌다.
    //   t 가 중간대(0.3~0.6)로 넓게 퍼지면서 canopy=(1−t) 가 남아 잎이 덮어 버린 것이다.
    //   '더 넓게 칠하면 더 보인다'가 아니다 — 되돌린다(실측 9.4% 판이 더 낫다).
    '  float steepG = smoothstep(0.34, 0.74, steep);',   // 급경사 문턱
    '  float ridge  = clamp(-concR*0.55, 0.0, 1.0);',     // 능선(볼록)일수록 1
    // ★암벽 띠는 **좁게**. 12m 로 잡았더니 카메라를 마주 보는 앞사면이 통째로 회색이 됐다
    //   (셀로는 4칸이어도 마주 본 사면은 화면 절반으로 늘어난다). 첫 ~2셀만.
    '  float edgeC  = 1.0 - smoothstep(1.5, 6.0, h);',
    '  float scarp  = smoothstep(0.74, 0.93, steep);',    // 아주 급한 벼랑은 능선이 아니어도 노출
    '  float t = clamp(max(edgeC, max(steepG*ridge, scarp*0.85)) + macro*0.12, 0.0, 1.0);',
    // 산기슭 아래(높이 1m 미만)는 들판 풀 — 평지와 이어져야 이음매가 안 보인다
    '  float onMt = clamp((h-0.5)/1.6, 0.0, 1.0);',
    '  float canopy = (1.0-t) * onMt;',
    // ★질감 UV 는 **월드 앵커**다 — 카메라·조각·청크와 무관한 하나의 연속 함수.
    //   *_angled 텍스처는 이미 아이소 각으로 구워져 있으니 월드 좌표를 같은 각으로 눕혀 읽는다.
    //   (조각마다 pattern.setTransform 을 다시 걸던 옛 판이 32px 주기 누비이불의 한 축이었다.)
    '  vec2 iso = vec2(w.x - w.y, (w.x + w.y)*0.5) * 32.0;',
    // uTexOn=0 이면 **질감을 빼고 평탄색**으로 — 남은 무늬가 질감에서 왔는지 음영에서 왔는지 가른다
    '  vec3 gcol = mix(vec3(0.353,0.439,0.251), texture2D(uGrass, iso/uTex).rgb, uTexOn);',
    '  vec3 rcol = mix(vec3(0.478,0.478,0.478), texture2D(uRock,  iso/(uTex*uRockS)).rgb, uTexOn);',
    '  vec3 base = mix(gcol, rcol, smoothstep(0.10,0.45,t));',
    '  vec3 tint = mix(vec3(0.298,0.408,0.204), vec3(0.494,0.510,0.470), smoothstep(0.30,1.0,t));',
    '  float ta = mix(0.0,0.62,smoothstep(0.0,0.30,t)) * mix(1.0,0.26,smoothstep(0.30,1.0,t));',
    '  vec3 col = mix(base, tint, ta);',
    '  col *= k;',
    // ── 수관(樹冠) — 산 본체는 밟을 수 없으니 **개별 나무를 안 세우고 재질로 올린다** ──
    //   지름 3~5m 덩어리. 주기는 3.3·1.35셀 — 32px(=1셀) 격자와 무관하게 잡는다.
    //   기하는 안 건드린다(실루엣은 꼭짓점이 정한다). 요철은 **법선과 명암**으로만 낸다.
    '  if (canopy > 0.01) {',
    '    float e2 = 0.42;',
    '    float k0 = vn2(rot(w/3.3,2.49))*0.68 + vn2(rot(w/1.35,0.83))*0.32;',
    '    float kx = vn2(rot((w+vec2(e2,0.0))/3.3,2.49))*0.68 + vn2(rot((w+vec2(e2,0.0))/1.35,0.83))*0.32;',
    '    float ky = vn2(rot((w+vec2(0.0,e2))/3.3,2.49))*0.68 + vn2(rot((w+vec2(0.0,e2))/1.35,0.83))*0.32;',
    '    vec3 cn = normalize(vec3(-(kx-k0)*7.0, -(ky-k0)*7.0, 1.0));',
    '    float cl = max(0.10, dot(cn, uL));',
    '    vec3 leaf = mix(vec3(0.082,0.153,0.075), vec3(0.212,0.318,0.137), k0);',   // 짙은 침엽 → 활엽
    '    leaf *= (0.55 + 0.72*cl);',                                                // 밝기 폭을 줄여 씻긴 느낌 제거
    '    leaf *= mix(0.68, 1.0, smoothstep(0.30,0.62,k0));',                        // 수관 사이 그늘
    '    col = mix(col, leaf, canopy*0.92);',
    '  }',
    // AO — hAll 이 이미 들고 있는 4×4 평균과의 차(오목하면 어둡다). 추가 표본 0.
    '  float conc = concR * uAoOn;',
    '  col *= 1.0 - clamp(conc*0.16, 0.0, 0.40);',
    '  col *= 1.0 + clamp(-conc*0.10, 0.0, 0.16);',
    '  col += vec3(0.73,0.78,0.85) * min(0.09, (h/uHmax)*0.09);',   // 대기 원근
    // ── ⑤ 자락 톱니 시안 2 — **알파 페더**. 자락(낮은 곳) 한 칸 폭에서 알파를 0 으로 떨군다.
    //   ★높이만의 함수라 이웃 띠·이웃 청크가 **같은 값**을 얻는다 — 이음매가 원리적으로 안 생긴다.
    //   ★마루는 h 가 커서 1.0 그대로다(마루 실루엣 무접촉 규약).
    '  float aOut = 1.0;',
    '  if (uFringe > 1.5) aOut = clamp(h / uFrH, 0.0, 1.0);',
    '  gl_FragColor = vec4(clamp(col,0.0,1.0) * aOut, aOut);',
    '}'
  ].join('\n');
