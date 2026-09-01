// @@split:20-r2-visibility — R2 개체렌더 — 가시성·지붕·방

  // 14.49-e6-c: 시야 재구성
  // 지형: 중앙 80px 원 = 항상 full bright. 뒤쪽 = 0.85 (덜 어둡게).
  // dot 보간 연속 (cos-like) → 부드러움.
  function coneMultGround(dwx, dwy, dist) {
    if (dist < 80) return 1; // PZ식 중앙 원형 vision
    if (myFacingVx === 0 && myFacingVy === 0) return 0.95;
    const flen = Math.hypot(myFacingVx, myFacingVy) || 1;
    const fx = myFacingVx / flen, fy = myFacingVy / flen;
    const ux = dwx / dist, uy = dwy / dist;
    const dot = fx * ux + fy * uy; // -1 ~ 1
    return 0.925 + 0.075 * dot; // 앞=1.0, 뒤=0.85 (덜 어둡게)
  }
  // entity (player/mob/item): 중앙 원형 + 뒤쪽 완전 차단 (PZ식)
  function coneMultEntity(dwx, dwy, dist) {
    if (dist < 80) return 1; // 가까이면 무조건 보임
    if (myFacingVx === 0 && myFacingVy === 0) return 1;
    const flen = Math.hypot(myFacingVx, myFacingVy) || 1;
    const fx = myFacingVx / flen, fy = myFacingVy / flen;
    const ux = dwx / dist, uy = dwy / dist;
    const dot = fx * ux + fy * uy;
    if (dot > 0.1) return 1;
    if (dot > -0.2) return (dot + 0.2) / 0.3; // fade
    return 0; // 뒤 안 보임
  }
  // 14.49-e6-c: entity 가시성 = cone × LoS (벽 너머 mob/player 안 보임)
  // ★★적용 범위(재민 확정 2026-08-06) — **살아 움직이는 것에만** 건다:
  //     적용:   player(본인 제외) · mob(동물)
  //     비적용: resource(나무·바위·광맥·덤불·약초) · ground_item · corpse
  //             → 식물·무생물·시체·바닥템은 **항상 그려진다**. 뒤돌았다고 사라지면 안 된다.
  //   ※ 이건 안개(fog of war)와 **다른 시스템**이다. 안개(_seenChunks)는 지면만 칠한다.
  // worldCx === myAbsPredicted.x (카메라 = 플레이어 중심) — 직접 사용해도 안전.
  function entityVisibility(ax, ay, dist) {
    const dwx = ax - myAbsPredicted.x;
    const dwy = ay - myAbsPredicted.y;
    let vis = coneMultEntity(dwx, dwy, dist);
    if (vis > 0.01 && dist > 32) {
      const myCx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
      const myCy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
      const tCx = Math.floor(ax / CL_BUILDING_SIZE);
      const tCy = Math.floor(ay / CL_BUILDING_SIZE);
      if (!hasLineOfSight(myCx, myCy, tCx, tCy, myFloor)) vis = 0;
    }
    return vis;
  }
  // 14.49-e6-c: 벽 line-of-sight — fromCell → toCell 사이 wall edge로 막혔나
  // cell-by-cell Bresenham-style traversal. wallCellMap 사용 (O(1) 체크).
  function hasLineOfSight(fromCx, fromCy, toCx, toCy, floor) {
    if (fromCx === toCx && fromCy === toCy) return true;
    let cx = fromCx, cy = fromCy;
    let steps = 0;
    const MAX = 30;
    while ((cx !== toCx || cy !== toCy) && steps < MAX) {
      steps++;
      const dx = toCx - cx, dy = toCy - cy;
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
        const sx = dx > 0 ? 1 : -1;
        if (clHasWallBetween(cx, cy, sx, 0, floor)) return false;
        cx += sx;
      } else if (dy !== 0) {
        const sy = dy > 0 ? 1 : -1;
        if (clHasWallBetween(cx, cy, 0, sy, floor)) return false;
        cy += sy;
      } else break;
    }
    return true;
  }

  // === 클라 사이드 wall edge 콜라이더 (server isBlockedByWall 미러) ===
  // wall은 cell edge에 (data.side ∈ {N, E}). BUILDING_SIZE=32 서버와 동일.
  const CL_BUILDING_SIZE = 32;
  // =============================================================================
  // ★[에셋 1차 — 생성형(Retro Diffusion, 사용자 계정 생성분) 텍스처 임베드 · v3 반수혈 시안 확정]
  //   이엉·다짐흙 64px 씨멜리스(data URL — 에셋 파이프라인/정적 라우트 無) →
  //   ① 맞배 이엉 지붕 스프라이트 베이크(전 움집 공용 6×4+오버행 0.5셀, 고증: 지붕이 곧 벽·처마 저고도·남면 입구·동측 합각 그늘)
  //   ② yard/plaza 지면 다이아 실셀(64×32) 텍스처 — 구 반크기 점묘 폐지.
  //   물리 불변(durango-consistency): 벽·문·콜라이더는 서버 그대로 — 시각 스킨만. 서버가 움집
  //   벽/바닥 행에 data.hut=[x0,y0,x1,y1] 태그 → 렌더에서 억제+지붕 1회 합성(플레이어가 안이면 원복=컷어웨이).
  // =============================================================================
  const TEX_WALL_URL = 'data:image/png;base64,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';
  const TEX_THATCH_URL = 'data:image/png;base64,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';
  const TEX_EARTH_URL = 'data:image/png;base64,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';
  let _hutRoofC = null, _tileYardC = null, _tilePlazaC = null, _tileHutC = null, _wallNC = null, _wallEC = null;
  // ★[배치 18 ②] 방 지붕 — 임의 크기 맞배를 굽고 캐시한다. 화법·앵커 규약은 마을 지붕과 **완전히 같다**
  //   (`_bakeRoof` 그대로 · 처마 WALL_HEIGHT · 물매 19.2px/셀 · 앵커 = 로컬 원점(북서 오버행 모서리)).
  let _bakeRoofFn = null;
  // ★[배치 18 ③] 보이는 층(히스테리시스) — 계단 위 깜빡임 방지. 충돌·판정은 myFloor 그대로.
  let _viewFloor = 0, _viewFloorPend = 0, _viewFloorAt = 0;
  const _roofBakeCache = new Map();   // "DIxDJ" → canvas
  function roofImgFor(w, h) {
    if (!_bakeRoofFn) return null;
    const DI = w + 1, DJ = h + 1, k = DI + 'x' + DJ;
    let img = _roofBakeCache.get(k);
    if (!img) {
      // 물매 상수 19.2px/셀 = SLOPE 0.6 × 32 (building_render.py 와 같은 값). 반깊이 × 물매 = 용마루 높이.
      img = _bakeRoofFn(DI, DJ, WALL_HEIGHT, WALL_HEIGHT + Math.round((DJ / 2) * 19.2));
      _roofBakeCache.set(k, img);
    }
    return img;
  }
  // 방(임의 모양) → 최대 직사각형 분해. ㄱ자면 2장, ㅁ자면 4장 — **날개마다 맞배 한 채**가 얹힌다.
  //   한국 ㄱ자 집이 실제로 그렇게 생겼다(두 날개가 모서리에서 만난다) — 셀 단위 타일 지붕보다 고증에 맞다.
  //   방은 자주 안 바뀌므로 방 id 로 캐시한다(매 프레임 재분해 금지).
  const _roomRectCache = new Map();   // roomId → [[x0,y0,x1,y1]…] (절대 셀)
  function roomRects(room) {
    let rs = _roomRectCache.get(room.id);
    if (rs) return rs;
    const rem = new Set(room.cells);
    rs = [];
    const has = (x, y) => rem.has(`${x}_${y}`);
    let guard = 0;
    while (rem.size && guard++ < 200) {
      let best = null;
      for (const k of rem) {
        const [sx, sy] = k.split('_').map(Number);
        let maxW = 0; while (has(sx + maxW, sy)) maxW++;
        for (let w = 1; w <= maxW; w++) {
          let h = 0;
          for (;;) { let okRow = true; for (let x = sx; x < sx + w; x++) if (!has(x, sy + h)) { okRow = false; break; } if (!okRow) break; h++; }
          const area = w * h;
          if (h && (!best || area > best.a)) best = { a: area, r: [sx, sy, sx + w - 1, sy + h - 1] };
        }
      }
      if (!best) break;
      rs.push(best.r);
      for (let x = best.r[0]; x <= best.r[2]; x++) for (let y = best.r[1]; y <= best.r[3]; y++) rem.delete(`${x}_${y}`);
    }
    _roomRectCache.set(room.id, rs);
    return rs;
  }
  let _hallRoofC = null, _granC = null;   // ★[에셋 2차] 큰집 지붕(움집 물매 동형 확대)·고상곳간 통짜(기둥+판벽+이엉 — 송국리 정본)
  // ★[에셋 10차 — 건물 3D화] scripts/building_render.py 산출물. **베이크 캔버스와 계약이 같다**:
  //   같은 앵커 규약(_ox,_oy = 지붕 로컬 원점=발자국+오버행 북서 모서리의 지면 픽셀)·같은 화법(1셀 64×32px,
  //   높이 1m=32px)·같은 처마고(2m=WALL_HEIGHT). 그래서 벽·컷어웨이·z 규약을 **한 줄도 건드리지 않고**
  //   이미지만 갈아끼운다(로드 실패·미배포 시 기존 베이크가 그대로 폴백).
  const _bldSpr = {};
  (() => {
    const A = { hut_roof: [164.0, 130.4], hall_roof: [292.0, 169.1], granary: [132.0, 121.1],
                hut_s1: [164.0, 20.2], hut_s2: [164.0, 81.1], hut_s3: [164.0, 129.1],
                // ★노(爐)·숯가마 — 발자국 2×2, 서버 FURNACE_STAGES/CHARCOAL_KILN_STAGES 와 1:1
                furn_s1: [100.0, 15.3], furn_s2: [100.0, 36.2], furn_s3: [100.0, 49.1], furnace: [100.0, 55.3],
                kiln_s1: [100.0, 15.3], charcoal_kiln: [100.0, 46.0] };   // building_anchors.json 동기(scripts/test-building-anchor.js가 결정적 재계산으로 대조)
    for (const k in A) {
      const im = new Image();
      im.onload = () => { im._ox = A[k][0]; im._oy = A[k][1]; _bldSpr[k] = im; };
      im.src = '/assets/buildings/' + k + '.png';
    }
  })();
// @@moved:5153
  function _texPix(img) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64); return g.getImageData(0, 0, 64, 64).data; }
  function _bakeVilArt(thImg, eaImg, wlImg) {
    const tp = _texPix(thImg), ep = _texPix(eaImg), wp = _texPix(wlImg);
    const CWD = 64, CHT = 32;   // 실셀 다이아(등각 정본: 인접 중심 (±32,±16) — 점묘 32×16의 2배)
    const mkTile = (pix, shade, alpha) => {
      const c = document.createElement('canvas'); c.width = CWD; c.height = CHT;
      const g = c.getContext('2d'), im = g.createImageData(CWD, CHT), d = im.data;
      for (let y = 0; y < CHT; y++) for (let x = 0; x < CWD; x++) {
        const dx = x - CWD / 2 + 0.5, dy = y - CHT / 2 + 0.5;
        if (Math.abs(dx) / (CWD / 2) + Math.abs(dy) / (CHT / 2) > 1) continue;
        const u = Math.min(63, ((dx / (CWD / 2) + dy / (CHT / 2)) * 0.5 + 0.5) * 64 | 0), v = Math.min(63, ((dy / (CHT / 2) - dx / (CWD / 2)) * 0.5 + 0.5) * 64 | 0);
        const si = (v * 64 + u) * 4, di = (y * CWD + x) * 4;
        d[di] = pix[si] * shade; d[di + 1] = pix[si + 1] * shade; d[di + 2] = pix[si + 2] * shade; d[di + 3] = alpha;
      }
      g.putImageData(im, 0, 0); return c;
    };
    _tileYardC = mkTile(ep, 0.92, 235);
    _tilePlazaC = mkTile(ep, 1.06, 235);
    _tileHutC = mkTile(ep, 0.70, 255);   // 움집 실내 다짐흙(어둑한 반수혈 바닥 — 컷어웨이 시)
    // ── 벽 유닛 텍스처 스트립(통나무 굴립주 — 생성 텍스처) 32×WALL_HEIGHT: N면(양지)·E면(그늘).
    //    벽 렌더가 전단(shear) 변환으로 평행사변형에 그대로 씌움 — 전 벽 유닛(움집·큰집·곳간·플레이어) 공용.
    const mkStrip = (shade) => {
      const c2 = document.createElement('canvas'); c2.width = 32; c2.height = WALL_HEIGHT;
      const g2 = c2.getContext('2d'), im2 = g2.createImageData(32, WALL_HEIGHT), d2 = im2.data;
      for (let y = 0; y < WALL_HEIGHT; y++) for (let x = 0; x < 32; x++) {
        const si = ((y % 64) * 64 + (x * 2) % 64) * 4, di = (y * 32 + x) * 4;
        d2[di] = wp[si] * shade; d2[di + 1] = wp[si + 1] * shade; d2[di + 2] = wp[si + 2] * shade; d2[di + 3] = 255;
      }
      g2.putImageData(im2, 0, 0); return c2;
    };
    _wallNC = mkStrip(1.0);
    _wallEC = mkStrip(0.74);
    // ── 맞배 이엉 지붕 베이크(제너릭) — ★지붕은 벽(64px) '위에' 얹힌다[사용자 확정: 유닛 문법 우선].
    //    처마=정확 벽고 64[사용자 지적]·용마루=처마+반깊이×물매(움집 물매 19.2px/셀을 전 건물 공통 — 같은 이엉 구조 고증).
    //    DI/DJ=발자국+오버행 0.5셀×2. 움집(6×4)→7×5·용마루 112, 큰집(8×8)→9×9·용마루 150(동일 물매).
    const _bakeRoof = (DI, DJ, EAVE, HMAX) => {
      const jc = DJ / 2, SL = (HMAX - EAVE) / jc;
      const W2 = (DI + DJ) * 32, H2 = (DI + DJ) * 16 + HMAX + 4;
      const c = document.createElement('canvas'); c.width = W2; c.height = H2;
      const g = c.getContext('2d'), im = g.createImageData(W2, H2), d = im.data;
      const put = (x, y, r, gg, b) => { if (x < 0 || y < 0 || x >= W2 || y >= H2) return; const i = (y * W2 + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; };
      const sx0 = DJ * 32;   // 로컬 지면점 (i,j)[셀] → 픽셀 ((i-j)*32+sx0, (i+j)*16+HMAX). 월드 대응: 지붕 원점=발자국 북서(x0-0.5,y0-0.5)셀 모서리
      const hgt = (j) => HMAX - Math.abs(j - jc) * SL;
      const tw = (i, j, sh) => { const ti = ((i * 64 | 0) % 64 + 64) % 64, tj = ((j * 64 | 0) % 64 + 64) % 64, si = (tj * 64 + ti) * 4; return [tp[si] * sh | 0, tp[si + 1] * sh | 0, tp[si + 2] * sh | 0]; };
      for (let i = 0; i <= DI; i += 0.01) {   // 지붕 상면(연속 래스터)
        for (let j = 0; j <= DJ; j += 0.01) {
          const south = j > jc, h = hgt(j);
          const X = ((i - j) * 32 + sx0) | 0, Y = ((i + j) * 16 + HMAX - h) | 0;   // (문은 벽의 개구 — 지붕엔 구멍 없음)
          let sh = south ? 0.84 : 1.0;
          if (Math.abs(j - jc) < 0.09) sh = 0.62;          // 용마루
          if (j > DJ - 0.3 || j < 0.3) sh *= 0.87;         // 처마단
          const t3 = tw(i, j, sh); put(X, Y, t3[0], t3[1], t3[2]);
        }
      }
      for (let k = 0; k <= 6; k++) {   // 동측 합각면(그늘 수직 — 벽 상단(WALL_HEIGHT)까지만: 그 아래는 벽 유닛의 몫)
        const i = DI - k * 0.01;
        for (let j = 0; j <= DJ; j += 0.01) {
          const h = hgt(j), gh = h - WALL_HEIGHT, X = ((i - j) * 32 + sx0) | 0, Yt = ((i + j) * 16 + HMAX - h) | 0;
          for (let yy = 0; yy < gh; yy++) { const t3 = tw(i * 3, yy / Math.max(1, gh), 0.5); put(X, Yt + yy, t3[0], t3[1], t3[2]); }
        }
      }
      g.putImageData(im, 0, 0);
      c._ox = sx0; c._oy = HMAX;   // drawImage 앵커: 지붕 로컬 원점 iso 위치에서 (-_ox,-_oy)
      return c;
    };
    // ★[2026-08-04d 배치 18 ②] 임의 크기 지붕이 필요해졌다(플레이어 방은 크기가 제각각).
    //   같은 베이크 함수를 밖으로 내보낸다 — **새 지붕 화법을 만들지 않는다**(사본 금지).
    _bakeRoofFn = _bakeRoof;
    _hutRoofC = _bakeRoof(7, 5, WALL_HEIGHT, WALL_HEIGHT + 48);
    _hallRoofC = _bakeRoof(9, 9, WALL_HEIGHT, WALL_HEIGHT + 86);   // ★큰집(8×8 회관): 반깊이 4.5셀 × 물매 19.2 = +86 — 마을 중심의 웅장한 이엉 맞배
    // ── ★고상곳간 통짜(송국리 정본: 굴립주 기둥 위 들린 밀폐 창고 + 사다리) — 벽 유닛 문법 대신 1장 스프라이트.
    //    구성: 기둥층 24px(통나무 세로·그늘) + 판벽 몸체 40px(N 1.0·E 0.74 — 벽 셰이드 문법) = 처마 64(전 건물 처마선 통일) + 이엉 맞배(물매 동형).
    //    실물 벽·바닥 행(data.gran)은 시각만 억제 — 콜라이더·밀폐는 불변. 컷어웨이 없음(문 없는 밀폐 — 반출입은 사다리).
    {
      const DI = 6, DJ = 4, STILT = 24, BODY = 40, EAVE = STILT + BODY, HMAX = EAVE + Math.round((DJ / 2) * 19.2);   // 발자국 5×3+오버행
      const jc = DJ / 2, SL = (HMAX - EAVE) / jc;
      const W2 = (DI + DJ) * 32, H2 = (DI + DJ) * 16 + HMAX + 4;
      const c = document.createElement('canvas'); c.width = W2; c.height = H2;
      const g = c.getContext('2d'), im = g.createImageData(W2, H2), d = im.data;
      const put = (x, y, r, gg, b, a) => { if (x < 0 || y < 0 || x >= W2 || y >= H2) return; const i = (y * W2 + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a === undefined ? 255 : a; };
      const sx0 = DJ * 32;
      const px = (i, j) => [((i - j) * 32 + sx0) | 0, ((i + j) * 16 + HMAX) | 0];   // 지면 픽셀
      const twp = (u, v, pix, sh) => { const ti = ((u | 0) % 64 + 64) % 64, tj = ((v | 0) % 64 + 64) % 64, si = (tj * 64 + ti) * 4; return [pix[si] * sh | 0, pix[si + 1] * sh | 0, pix[si + 2] * sh | 0]; };
      // 발자국은 렉트 [0.5..DI-0.5]×[0.5..DJ-0.5](오버행 안쪽) — 몸체는 발자국 그대로
      const b0 = 0.5, b1i = DI - 0.5, b1j = DJ - 0.5;
      // ① 기둥층: 모서리+중간 6주(굴립주) — 남면(i축 3주)·동면(j축 모서리) 세로 스트립, 사이는 빈 공간(들린 창고의 그늘 바닥만)
      const stiltAt = [[b0 + 0.15, b1j], [DI / 2, b1j], [b1i - 0.15, b1j], [b1i, b0 + 0.15], [b1i, DJ / 2]];   // 남면 3 + 동면 2(모서리 공유)
      for (const [si2, sj2] of stiltAt) {
        const [X0, Y0] = px(si2, sj2);
        for (let yy = 0; yy < STILT + 6; yy++) for (let xx = -4; xx <= 4; xx++) {   // 8px 폭 굴립주(+6=몸체 하단에 물림) — 들린 창고가 또렷하게
          const t3 = twp(xx * 4 + 32, yy * 3, wp, sj2 === b1j ? 0.92 : 0.7);
          put(X0 + xx, Y0 - yy, t3[0], t3[1], t3[2]);
        }
      }
      // 들린 바닥 밑면 그늘(발자국 다이아 — 기둥 사이로 보이는 어둠)
      for (let i = b0; i <= b1i; i += 0.02) for (let j = b0; j <= b1j; j += 0.02) {
        const [X, Y] = px(i, j); const i2 = (Y * W2 + X) * 4;
        if (d[i2 + 3] === 0) put(X, Y, 14, 11, 8, 200);
      }
      // ② 판벽 몸체(N면=i축 벽·양지 / E면=j축 벽·그늘) — 통나무 가로결, 상단은 STILT+BODY까지
      for (let i = b0; i <= b1i; i += 0.01) {   // N면(북벽은 안 보임 — 남면이 화면 정면): 남변 j=b1j
        const [X, Y] = px(i, b1j);
        for (let yy = STILT; yy < EAVE; yy++) { const t3 = twp(i * 64, (EAVE - yy) * 1.6, wp, 1.0); put(X, Y - yy, t3[0], t3[1], t3[2]); }
      }
      for (let j = b0; j <= b1j; j += 0.01) {   // E면: 동변 i=b1i
        const [X, Y] = px(b1i, j);
        for (let yy = STILT; yy < EAVE; yy++) { const t3 = twp(j * 64, (EAVE - yy) * 1.6, wp, 0.74); put(X, Y - yy, t3[0], t3[1], t3[2]); }
      }
      // ③ 사다리(남면 중앙 — 지면→몸체): 세로 2줄 + 가로장
      { const [LX, LY] = px(DI / 2 + 0.35, b1j);
        for (let yy = 0; yy <= EAVE - 10; yy++) { put(LX - 3, LY - yy + 2, 150, 118, 70); put(LX + 3, LY - yy + 2, 150, 118, 70); if (yy % 6 === 3) for (let xx = -2; xx <= 2; xx++) put(LX + xx, LY - yy + 2, 172, 138, 86); } }
      // ④ 이엉 맞배 지붕(물매 동형·오버행 0.5셀=로컬 [0..DI]×[0..DJ])
      const hgt = (j) => HMAX - Math.abs(j - jc) * SL;
      for (let i = 0; i <= DI; i += 0.01) for (let j = 0; j <= DJ; j += 0.01) {
        const south = j > jc, h = hgt(j);
        const X = ((i - j) * 32 + sx0) | 0, Y = ((i + j) * 16 + HMAX - h) | 0;
        let sh = south ? 0.84 : 1.0;
        if (Math.abs(j - jc) < 0.09) sh = 0.62;
        if (j > DJ - 0.3 || j < 0.3) sh *= 0.87;
        const t3 = twp(i * 64, j * 64, tp, sh); put(X, Y, t3[0], t3[1], t3[2]);
      }
      for (let k = 0; k <= 6; k++) {   // 동측 합각(처마→몸체 상단)
        const i = DI - k * 0.01;
        for (let j = 0; j <= DJ; j += 0.01) {
          const h = hgt(j), gh = h - EAVE, X = ((i - j) * 32 + sx0) | 0, Yt = ((i + j) * 16 + HMAX - h) | 0;
          for (let yy = 0; yy < gh; yy++) { const t3 = twp(i * 192, yy * 2, tp, 0.5); put(X, Yt + yy, t3[0], t3[1], t3[2]); }
        }
      }
      g.putImageData(im, 0, 0);
      c._ox = sx0; c._oy = HMAX;
      _granC = c;
    }
  }
  function clCellOf(x, y) { return { cx: Math.floor(x / CL_BUILDING_SIZE), cy: Math.floor(y / CL_BUILDING_SIZE) }; }
  // 14.51: 3초 progress 작업 시작 (place 또는 dismantle)
  function startBuildAction(kind, payload) {
    if (buildAction) { showNotice('이미 작업 중'); return; }
    const durationMs = 3000;
    buildAction = { kind, startedAt: performance.now(), durationMs, payload,
                    startPx: lastMouseSx, startPy: lastMouseSy,
                    startWx: myAbsPredicted.x, startWy: myAbsPredicted.y };
    showNotice(kind === 'place' ? '🏗️ 배치 중... (3초)' : '🔧 분해 중... (3초)');
  }
  function cancelBuildAction(reason) {
    if (!buildAction) return;
    buildAction = null;
    if (reason) showNotice(reason);
  }
  // 매 frame 호출 — 작업 진행 + 완료 시 송신
  function updateBuildAction() {
    if (!buildAction) return;
    const now = performance.now();
    const elapsed = now - buildAction.startedAt;
    // 14.54-d: 시작 위치 대비 4px 이상 이동했으면 취소
    const moved = Math.hypot(myAbsPredicted.x - buildAction.startWx, myAbsPredicted.y - buildAction.startWy);
    if (moved > 4) { cancelBuildAction('이동으로 작업 취소'); return; }
    if (elapsed >= buildAction.durationMs) {
      // 완료 → 송신
      const { kind, payload } = buildAction;
      if (kind === 'place') {
        sendPrimaryAt({
          type: 'place_building',
          itemType: payload.itemType,
          floor: payload.floor,
          dir: payload.dir,
          atX: payload.atX, atY: payload.atY,
        });
        // 인벤 0 되면 placement 종료
        if ((inventory[payload.itemType] || 0) <= 1) {
          placementMode = null; showNotice('인벤 떨어짐 — 배치 종료');
        }
      } else if (kind === 'dismantle') {
        sendPrimary({ type: 'dismantle_building', buildingId: payload.buildingId });
      }
      buildAction = null;
    }
  }
  // 14.50: player 80px 안 가장 가까운 door (toggle용)
  function findNearestDoor(px, py, floor) {
    let best = null, bestD = 80;
    for (const c of conns.values()) {
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      for (const b of c.buildings.values()) {
        if (b.type !== 'door') continue;
        if ((b.floor || 0) !== floor) continue;
        const ax = ox + b.x, ay = oy + b.y;
        const d = Math.hypot(ax - px, ay - py);
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    return best;
  }
  function clHasFenceAt(cellCx, cellCy, floor) {
    // O(1) — clFenceCellMap 조회 (이전 전체 건물 순회 O(n) 제거)
    ensureWallMap();
    return clFenceCellMap.has(`${cellCx}_${cellCy}_${floor}`);
  }
  function clHasWallAt(absX, absY, cellCx, cellCy, side, floor) {
    // O(1) — clWallCellMap(절대 cell+side+floor) 조회. (이전엔 전체 건물 순회 O(n) → 마을 672채서 매 프레임 폭발)
    ensureWallMap();
    return clWallCellMap.has(`${cellCx}_${cellCy}_${side}_${floor}`);
  }
  // === 14.49-e6-b: wall edge 캐시 (콜라이더 미러 · 위층 컷어웨이 BFS 입력) ===
  // 1) clWallCellMap: 모든 wall edge 위치 O(1) lookup (절대 cell + side + floor)
  // ★★[2026-08-04d 배치 18 ①] **방 판정은 여기서 사라졌다 — 서버가 판정한다.**
  //   종전: 클라가 제 손으로 BFS(`computeRoom`)를 돌려 방을 만들었다. 문제가 셋이었다.
  //     ⓐ **열린 문으로 샜다** — 열린 문은 clWallCellMap 에서 빠지므로 방이 문 밖으로 흘러나갔다.
  //        그래서 마을 건물은 방을 못 쓰고 발자국 렉트(data.hut/bld)로 우회해야 했다(4272행 주석).
  //     ⓑ **문을 여닫을 때마다 전 맵 재구축**(clWallMapBuiltAt=0)이 걸렸다.
  //     ⓒ 방 id 가 클라 로컬 카운터라 클라마다·순간마다 달랐다 — 서버와 대화할 수 없는 값.
  //   이제 `server/rooms.js` 가 정본이고 클라는 **받아서 꽂기만** 한다(사본 방지 — 두 진실 금지).
  //   자료구조와 소비처 계약은 그대로 둔다: `cellRoomCache` 는 여전히 "절대셀_층" → roomData 이고
  //   roomData 는 여전히 `{ id, cells:Set, isIndoor }` 라 컷어웨이·위층 판정이 한 줄도 안 바뀐다.
  //   서버가 준 방은 **정의상 실내**다(벽·문으로 닫혔고 바닥이 다 깔린 것만 방이다) → isIndoor 항상 true.
  const clWallCellMap = new Map(); // "cx_cy_side_floor" → true (절대 cell)
  const cellRoomCache = new Map(); // "cx_cy_floor" → roomData  ★서버 방송(rooms_update)이 채운다
  const srvRooms = new Map();      // roomId → roomData (같은 방의 모든 셀이 같은 객체를 공유 — 동일성 비교 유지)
  const clFloorCellMap = new Map(); // "cx_cy_floor" → true (위층 BFS cutaway용)
  const clFenceCellMap = new Map(); // "cx_cy_floor" → true (fence cell — clHasFenceAt O(1)용)
  const clMaxFloorMap = new Map(); // "cx_cy" → max floor (가장 위쪽 floor tile)
  let clWallMapBuiltAt = 0;
  // 서버 방 수신 — 존 로컬 셀로 오므로 **그 존의 원점**으로 절대 셀로 옮긴다.
  //   ★배치 17 의 교훈이 그대로 적용된다(렉트는 로컬·내 위치는 절대라 영원히 불일치였다).
  function ingestRooms(list, removed, zoneMeta) {
    const ox = Math.floor((zoneMeta?.worldOffsetX || 0) / CL_BUILDING_SIZE);
    const oy = Math.floor((zoneMeta?.worldOffsetY || 0) / CL_BUILDING_SIZE);
    for (const id of (removed || [])) {
      const old = srvRooms.get(id);
      if (!old) continue;
      for (const k of old.cells) cellRoomCache.delete(`${k}_${old.floor}`);
      srvRooms.delete(id); _roomRectCache.delete(id);   // ★[배치 18 ②] 방이 사라지면 지붕 분해 캐시도
    }
    for (const r of (list || [])) {
      const old = srvRooms.get(r.id);
      if (old) for (const k of old.cells) cellRoomCache.delete(`${k}_${old.floor}`);
      _roomRectCache.delete(r.id);   // ★모양이 바뀌었을 수 있다 — 지붕을 다시 분해한다
      const cells = new Set();
      const flat = r.cells || [];
      for (let i = 0; i + 1 < flat.length; i += 2) cells.add(`${ox + flat[i]}_${oy + flat[i + 1]}`);
      const room = { id: r.id, floor: r.floor | 0, cells, isIndoor: true, bbox: r.bbox };
      srvRooms.set(r.id, room);
      for (const k of cells) cellRoomCache.set(`${k}_${room.floor}`, room);
    }
  }

  function clRebuildWallCellMap() {
    clWallCellMap.clear();
    // ★[배치 18 ①] 여기서 `cellRoomCache.clear()` 를 **하면 안 된다.** 방은 이제 클라가 만드는 게 아니라
    //   서버가 보내 준 값이다 — 벽 캐시를 다시 굽는다고 서버가 다시 보내 주지 않는다.
    //   (E2E 가 잡았다: 문을 여닫으면 clWallMapBuiltAt=0 → 이 함수 → 방이 통째로 날아가 실내가 풀렸다.)
    clFloorCellMap.clear();
    clFenceCellMap.clear();
    clMaxFloorMap.clear();
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const oxCells = Math.floor((zm.worldOffsetX || 0) / CL_BUILDING_SIZE);
      const oyCells = Math.floor((zm.worldOffsetY || 0) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        const bcx = Math.floor(b.x / CL_BUILDING_SIZE);
        const bcy = Math.floor(b.y / CL_BUILDING_SIZE);
        const f = b.floor || 0;
        if (b.type === 'wall' || (b.type === 'door' && !b.data?.open)) {
          // 14.50: 닫힌 door도 wall처럼 시야/collider 차단
          const side = b.data?.side;
          if (!side) continue;
          if (b.data?.damaged) continue;
          clWallCellMap.set(`${oxCells + bcx}_${oyCells + bcy}_${side}_${f}`, true);
        } else if (b.type === 'floor') {
          const absKey = `${oxCells + bcx}_${oyCells + bcy}`;
          clFloorCellMap.set(`${absKey}_${f}`, true);
          const curMax = clMaxFloorMap.get(absKey);
          if (curMax === undefined || curMax < f) clMaxFloorMap.set(absKey, f);
        } else if (b.type === 'fence') {
          clFenceCellMap.set(`${oxCells + bcx}_${oyCells + bcy}_${f}`, true);
        }
      }
    }
    clWallMapBuiltAt = performance.now();
  }
  function ensureWallMap() {
    if (clWallMapBuiltAt === 0 || performance.now() - clWallMapBuiltAt > 5000) clRebuildWallCellMap();
  }
  // 14.49-e7ab: 위층 BFS cutaway — 머리 위 floor tile에서 BFS로 연결된 building의 모든 wall 완전 투명
  function computeAboveCutawayWalls(myCx, myCy, myFloor) {
    const result = new Set();
    ensureWallMap();
    const aboveFloor = myFloor + 1;
    if (!clFloorCellMap.has(`${myCx}_${myCy}_${aboveFloor}`)) return result;
    const visited = new Set();
    const queue = [[myCx, myCy]];
    visited.add(`${myCx}_${myCy}`);
    const MAX_BFS = 500;
    while (queue.length > 0 && visited.size < MAX_BFS) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = `${nx}_${ny}`;
        if (visited.has(k)) continue;
        if (clFloorCellMap.has(`${nx}_${ny}_${aboveFloor}`)) {
          visited.add(k);
          queue.push([nx, ny]);
        }
      }
    }
    // building cells의 4 edge wall key 생성
    for (const k of visited) {
      const [cxs, cys] = k.split('_');
      const cx = +cxs, cy = +cys;
      result.add(`${cx}_${cy}_N_${aboveFloor}`);   // N edge
      result.add(`${cx}_${cy}_E_${aboveFloor}`);   // E edge
      result.add(`${cx}_${cy+1}_N_${aboveFloor}`); // S edge = 인접 cell의 N
      result.add(`${cx-1}_${cy}_E_${aboveFloor}`); // W edge = 인접 cell의 E
    }
    return result;
  }
  // 14.49-e7ag/al: 머리 위 BFS cutaway — floor tile OR stair cell 인 곳도 expand
  // stair는 그 위치에 floor tile 없어도 BFS 연속 (사용자 요구)
  function computeAboveCutawayCells(myCx, myCy, myFloor) {
    const result = new Set();
    ensureWallMap();
    const aboveFloor = myFloor + 1;
    if (!clFloorCellMap.has(`${myCx}_${myCy}_${aboveFloor}`)) return result;
    function isCellInBuilding(cx, cy) {
      // floor tile at aboveFloor OR stair cell (stair.floor === myFloor, 위층은 stair 위)
      if (clFloorCellMap.has(`${cx}_${cy}_${aboveFloor}`)) return true;
      if (clStairCellCache && clStairCellCache.has(`${cx}_${cy}`)) {
        const entry = clStairCellCache.get(`${cx}_${cy}`);
        if (entry && entry.stair && (entry.stair.floor || 0) === myFloor) return true;
      }
      return false;
    }
    const queue = [[myCx, myCy]];
    result.add(`${myCx}_${myCy}`);
    const MAX_BFS = 500;
    while (queue.length > 0 && result.size < MAX_BFS) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = `${nx}_${ny}`;
        if (result.has(k)) continue;
        if (isCellInBuilding(nx, ny)) {
          result.add(k);
          queue.push([nx, ny]);
        }
      }
    }
    return result;
  }
  // 인접 cell (cx, cy) → (cx+dx, cy+dy) 사이 벽 있나? dx,dy는 ±1만 (cardinal)
  function clHasWallBetween(cx, cy, dx, dy, floor) {
    if (dx === 1)  return clWallCellMap.has(`${cx}_${cy}_E_${floor}`);
    if (dx === -1) return clWallCellMap.has(`${cx-1}_${cy}_E_${floor}`);
    if (dy === 1)  return clWallCellMap.has(`${cx}_${cy+1}_N_${floor}`);
    if (dy === -1) return clWallCellMap.has(`${cx}_${cy}_N_${floor}`);
    return false;
  }
  // ★[배치 18 ①] 방 조회 — 계산하지 않는다. 서버가 보내 준 것을 꺼내 볼 뿐이다.
  function isCellIndoor(cx, cy, floor) {
    const cached = cellRoomCache.get(`${cx}_${cy}_${floor}`);
    return !!(cached && cached.isIndoor);
  }
  function playerIsIndoors() {
    const cx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE);
    const cy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    return isCellIndoor(cx, cy, myFloor);
  }
  window.playerIsIndoors = playerIsIndoors;
  // ★[배치 18 ①] 방 진단 훅 — 하네스가 "지금 내가 어느 방인가"를 계약 수준에서 읽는다(읽기 전용).
  window.__roomDbg = () => {
    const cx = Math.floor(myAbsPredicted.x / CL_BUILDING_SIZE), cy = Math.floor(myAbsPredicted.y / CL_BUILDING_SIZE);
    const r = cellRoomCache.get(`${cx}_${cy}_${myFloor}`) || null;
    return { cx, cy, floor: myFloor, indoors: !!r, roomId: r ? r.id : null, roomCells: r ? r.cells.size : 0,
      rooms: srvRooms.size, cachedCells: cellRoomCache.size };
  };
  window.dbg = () => {
    ensureWallMap();
    const floors = {};
    for (const k of clWallCellMap.keys()) {
      const f = k.split('_')[3];
      floors[f] = (floors[f] || 0) + 1;
    }
    return {
      pos: { ...myAbsPredicted },
      cell: { cx: Math.floor(myAbsPredicted.x/CL_BUILDING_SIZE), cy: Math.floor(myAbsPredicted.y/CL_BUILDING_SIZE) },
      floor: myFloor,
      indoors: playerIsIndoors(),
      wallCells: clWallCellMap.size,
      wallsByFloor: floors,
      rooms: srvRooms.size,            // ★서버 판정 방(배치 18) — 클라 BFS 는 없어졌다
      cachedCells: cellRoomCache.size,
    };
  };
  // 14.49-e3-perf2: 계단 측면 진입 차단 + 클라 stair cell 캐시 (O(1))
  function clDirVec(dir) {
    if (dir === 'N') return { x: 0, y: -1 };
    if (dir === 'S') return { x: 0, y: 1 };
    if (dir === 'E') return { x: 1, y: 0 };
    if (dir === 'W') return { x: -1, y: 0 };
    return { x: 0, y: -1 };
  }
  // 전역 abs cell key → { stairRef, step }. building 추가/제거 시 dirty 마킹.
  const clStairCellCache = new Map();
  let clStairCacheBuildAt = 0;
  function clRebuildStairCellCache() {
    clStairCellCache.clear();
    for (const [zid, c] of conns) {
      const zm = c.meta || zonesMeta[zid];
      if (!zm) continue;
      const oxCells = Math.floor((zm.worldOffsetX || 0) / CL_BUILDING_SIZE);
      const oyCells = Math.floor((zm.worldOffsetY || 0) / CL_BUILDING_SIZE);
      for (const b of c.buildings.values()) {
        if (b.type !== 'stair') continue;
        const dir = b.data?.dir || 'N';
        const dv = clDirVec(dir);
        const acx = Math.floor(b.x / CL_BUILDING_SIZE);
        const acy = Math.floor(b.y / CL_BUILDING_SIZE);
        for (let s = 0; s <= 2; s++) {
          const absCx = oxCells + acx + dv.x * s;
          const absCy = oyCells + acy + dv.y * s;
          clStairCellCache.set(`${absCx}_${absCy}`, { stair: b, step: s });
        }
      }
    }
    clStairCacheBuildAt = performance.now();
  }
  function clFindStairForCell(cx, cy) {
    // 0.5초마다 lazy rebuild (building add/remove broadcast가 자주 안 옴)
    if (performance.now() - clStairCacheBuildAt > 500) clRebuildStairCellCache();
    return clStairCellCache.get(`${cx}_${cy}`) || null;
  }
  // 나무 콜라이더 — 서버 zone.js isBlockedByTree 미러. (resources는 zone-local 좌표 → abs로 변환)
  const PLAYER_BODY_R = 6;  // 서버와 동일
  const TRUNK_COLLIDER_MAX = 9;  // 서버와 동일 — 줄기 충돌 반경 상한
  const ROCK_COLLIDER_R = 14;    // 서버와 동일 — ★바위·광맥 차단 반경(대형 자연물 물리 실체)
  function clientNearbyTrees(ax, ay) {
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.resources) return null;
    const ox = pc.meta?.worldOffsetX || 0, oy = pc.meta?.worldOffsetY || 0;
    let out = null;
    for (const r of pc.resources.values()) {
      const isRock = (r.type === 'rock' || r.type === 'ore');   // ★바위·광맥도 차단 개체
      if (!isRock && (r.type !== 'tree' || !r.r)) continue;
      const tx = r.x + ox, ty = r.y + oy;
      if (Math.abs(tx - ax) > 40 || Math.abs(ty - ay) > 40) continue;  // 근처만 (max 충돌 20 + 이동여유)
      (out || (out = [])).push({ tx, ty, r: r.r || 0, rock: isRock ? 1 : 0 });
    }
    return out;
  }
  function clientIsBlockedByTree(x, y, trees) {
    if (!trees) return false;
    for (const t of trees) {
      const tr = t.rock ? ROCK_COLLIDER_R : Math.min(t.r, TRUNK_COLLIDER_MAX);   // 서버와 동일(바위=고정 반경)
      if (Math.hypot(t.tx - x, t.ty - y) < tr + PLAYER_BODY_R) return true;
    }
    return false;
  }

  function clientIsBlockedByWall(newX, newY, oldX, oldY, playerFloor = 0) {
    const oc = clCellOf(oldX, oldY);
    const nc = clCellOf(newX, newY);
    if (oc.cx === nc.cx && oc.cy === nc.cy) return false;
    // 14.50: fence cell 진입 차단 (cell 전체 차지)
    if (clHasFenceAt(nc.cx, nc.cy, playerFloor)) return true;
    // 14.49-e3: 계단 측면 진입 차단. 14.49-e7am: floor check 추가 (server와 일치).
    const enteringStair = clFindStairForCell(nc.cx, nc.cy);
    if (enteringStair) {
      const fromStair = clFindStairForCell(oc.cx, oc.cy);
      const sameStair = fromStair && fromStair.stair.id === enteringStair.stair.id;
      if (!sameStair) {
        const dir = enteringStair.stair.data?.dir || 'N';
        const dv = clDirVec(dir);
        const moveX = nc.cx - oc.cx, moveY = nc.cy - oc.cy;
        const stairFloor = enteringStair.stair.floor || 0;
        const lowEntry = enteringStair.step === 0 && moveX === dv.x && moveY === dv.y && playerFloor === stairFloor;
        const highEntry = enteringStair.step === 2 && moveX === -dv.x && moveY === -dv.y && playerFloor === stairFloor + 1;
        if (!lowEntry && !highEntry) return true;
      }
    }
    // 셀 단위 경로 추적 (server isBlockedByWall rewrite 미러 — 코너 컷·멀티셀 터널링 방지)
    let blocked = false, reason = '';
    let cx = oc.cx, cy = oc.cy;
    let steps = 0;
    while (cx !== nc.cx || cy !== nc.cy) {
      if (++steps > 64) { blocked = true; reason = 'MAX'; break; }
      const dx = nc.cx - cx, dy = nc.cy - cy;
      const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      if (sx !== 0 && sy !== 0) {
        // 대각 한 칸: x먼저 / y먼저 L-경로 중 하나라도 열려 있어야 통과 (코너 컷 방지)
        const viaX = !clEdgeBlockedStep(cx, cy, sx, 0, playerFloor) && !clEdgeBlockedStep(cx + sx, cy, 0, sy, playerFloor);
        const viaY = !clEdgeBlockedStep(cx, cy, 0, sy, playerFloor) && !clEdgeBlockedStep(cx, cy + sy, sx, 0, playerFloor);
        if (!viaX && !viaY) { blocked = true; reason = `DIAG@(${cx},${cy})`; break; }
        cx += sx; cy += sy;
      } else if (sx !== 0) {
        if (clEdgeBlockedStep(cx, cy, sx, 0, playerFloor)) { blocked = true; reason = sx > 0 ? 'E' : 'W'; break; }
        cx += sx;
      } else {
        if (clEdgeBlockedStep(cx, cy, 0, sy, playerFloor)) { blocked = true; reason = sy > 0 ? 'S' : 'N'; break; }
        cy += sy;
      }
    }
    // DEBUG — 클라가 어떤 cell→cell 시도하는지, 막힘/통과 결과까지 (기본 OFF; 콘솔에서 _collDbg=true로 켜기)
    if (window._collDbg === true) {
      console.log(`[coll] cell ${oc.cx},${oc.cy}→${nc.cx},${nc.cy} f${playerFloor} ${blocked ? 'BLOCKED:' + reason : 'pass'} (zones: ${Array.from(conns.keys()).map(k => k + ':' + (conns.get(k).buildings?.size||0)).join(',')})`);
    }
    return blocked;
  }
  // 인접 cell (cx,cy) → (cx+sx, cy+sy) cardinal 한 칸 이동이 wall edge로 막히나 (clientIsBlockedByWall용)
  function clEdgeBlockedStep(cx, cy, sx, sy, floor) {
    const ax = (cx + 0.5) * CL_BUILDING_SIZE, ay = (cy + 0.5) * CL_BUILDING_SIZE;
    if (sx === 1)  return clHasWallAt(ax, ay, cx, cy, 'E', floor);
    if (sx === -1) return clHasWallAt(ax - CL_BUILDING_SIZE, ay, cx - 1, cy, 'E', floor);
    if (sy === 1)  return clHasWallAt(ax, ay + CL_BUILDING_SIZE, cx, cy + 1, 'N', floor);
    if (sy === -1) return clHasWallAt(ax, ay, cx, cy, 'N', floor);
    return false;
  }
  window._collDbg = false; // 콘솔에서 window._collDbg = true로 켤 수 있음 (기본 OFF)
  let lastServerPingMs = 0;
  let lastTickAt = 0;

  // 색상 팔레트
  const COLORS = ['#f0c674', '#5a9ae0', '#e07a5a', '#9a6ad8', '#5ad88a', '#d85a8a', '#5ad8d8', '#d8d85a'];

  // 채팅 상태
  let chatActive = false;
  const chatLog = []; // {name, color, text, t}
  const speechBubbles = new Map(); // pid -> {text, until}
  // ★★[2026-08-25 사건 레이어] 촌장 브리핑 — 마을 중심에 뜨는 말풍선.
  //   전달은 UI 보고서가 아니라 **세계 안의 말**이다(설계 §3.2). 대시보드를 만들지 않는다.
  // ★[신체 상태 §7] 서버가 보낸 몸 상태. 연속값은 **본인 것만** 온다(§8.3).
  let myBody = null;
  // ★[거래소 2026-08-27] 그 마을 시세표 + 지금 고른 짝. **서버가 정본**이고 클라는 고르기만 한다.
  let myTrade = null, trGive = null, trTake = null, trQty = 1, trQuote = null;
  let myCarry = null;              // ★[무게] { kg, cap, ratio, over, moveMult, combined, stage, … }
  let itemWeights = null;          // ★[무게] kg 카탈로그 — **서버가 준다**(클라가 표를 갖지 않는다)
  let carryCfg = null;
  const villageBubbles = new Map();  // vid -> {lines, until}
  // ★★[낚시 v2 2026-08-26] 찌 상태 — 서버가 정본이다. 클라는 **그리기만** 한다(시각을 스스로 세지 않는다).
  //   { state:'wait'|'bite', x, y, since, windowMs }
  let fishState = null;
  let fishFx = null;   // 잡은 직후의 한 순간(크기가 눈에 보이는 자리)
  let evBoardCache = null;           // 마지막으로 받은 게시판(납품 키가 쓴다)
  let evNearVid = null;              // 지금 목소리가 닿는 마을
  const evBriefedDay = new Map();    // vid -> 마지막으로 브리핑 받은 게임일(하루 한 번)
  const EV_BRIEF_PX = 260;           // 서버 `EV_BRIEF_PX` 와 같은 값 — 판정은 서버가 하고 여긴 발신 게이트일 뿐

  // === 월드 시계 (Day/Night) ===
  // serverNow = clientNow + serverNowOffset 으로 보정한 timestamp 기준 phase 계산.
  // 모든 zone이 동일한 epoch+dayLength 쓰니까 클라/서버 시계 차이만 보정하면 동일 phase.
  let worldClock = null;
  let _lonView = 0; // §19 4파: 뷰(카메라) 경도 오프셋(하루 비율 0~0.045) — render가 매 프레임 갱신, worldPhase가 가산
  function worldNow() {
    return Date.now() + (worldClock ? worldClock.serverNowOffset : 0);
  }
  function worldPhase() {
    if (!worldClock) return 0.2; // 기본: 한낮
    const t = (worldNow() - worldClock.epoch) % worldClock.dayLengthMs;
    // §19 4파 경도 로컬 태양시(표시 공식): 뷰(카메라) 경도 오프셋 가산 — 동쪽이 먼저 밝고 먼저 어두워짐.
    //   시계·밤 오버레이·(밤) 라벨이 전부 이 로컬 phase를 소비(클라 표시 전용 — 서버 econ 일 경계는 전역).
    return (t / worldClock.dayLengthMs + _lonView) % 1;
  }
  function isNight() {
    if (!worldClock) return false;
    return worldPhase() > worldClock.dayPhaseRatio;
  }
  function darknessLevel() {
    if (!worldClock) return 0;
    const p = worldPhase();
    const dr = worldClock.dayPhaseRatio;
    if (p < dr - 0.05) return 0;
    if (p < dr) return (p - (dr - 0.05)) / 0.05;
    if (p > 0.95) return (1 - p) / 0.05;
    return 1;
  }
  // HUD 표시용 — "07:42" 같은 24시간 시계 문자열
  function gameTimeString() {
    if (!worldClock) return '--:--';
    const p = worldPhase();
    // phase 0 = 새벽 6시로 잡자 — 익숙한 감각
    const hours24 = ((p * 24) + 6) % 24;
    const hh = Math.floor(hours24);
    const mm = Math.floor((hours24 - hh) * 60);
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }

  // 존별 연결과 상태
  //   conns[zoneId] = { ws, role: 'primary'|'observer', meta, resources, claims, others }
  const conns = new Map();

  // ═══ P4 전쟁 전투 렌더·관전·지휘 (서버 broadcast: tick bt/bs/bc/br + war_battle 채널) ═══
  //   병종 int(bt 0~7) 직접 인덱스 색 — war-live.MU_TYPE_INT 순서(champion..militia) = 랩 MU_TYPE_COL verbatim.
  const WAR_BT_COL  = ['#c8862e','#b5563a','#5a8ad0','#57a8a8','#9a9488','#5fbf6a','#c9a24b','#8a7a5a'];
  const WAR_BT_NAME = ['챔피언','대부병','창병','장창병','단검병','궁수','투석병','민병'];
  const WAR_SIDE_COL = ['#7ab0ff','#ff8a7a'];   // [0]=공격(A·battle-core SIDE_COL.A), [1]=방어(B·SIDE_COL.B)
  const warBattles = new Map();                 // id → {id, ox, oy(절대 px), atk, def, casus, aliveA, aliveB, phase, seenAt, resolvedAt}
  // 관전 카메라 트윈(랩 focusCameraOnBattle 정합·0.6s smoothstep) — active=전투 focus, returning=본체 복귀.
  const _warSpec = { active: false, returning: false, id: null, from: null, to: null, t0: 0, dur: 600 };
  let _warCmdId = null;                          // 지휘 참가 중 warId (null=관전만/미참가)
  let _warCmdMsg = '';                           // war_command_ack 상태 문구(HUD)
  let _lastCamAbs = { x: 0, y: 0 };              // 매 프레임 실제 카메라 abs(트윈 출발점 캡처용)
  // 화살 이펙트 큐 — 서버 arrow_fx(사냥꾼 사격) [{x0,y0,x1,y1(절대 월드 px), at, ms}]
  const _arrowFx = [];
  let _warHudEl = null;                          // 스펙테이터 HUD DOM(지연 생성)

  // === Entity interpolation (다른 플레이어/mob 부드러운 움직임) ===
  // 서버 tick(10Hz, 100ms 간격) 위치를 timestamped buffer에 쌓고, 렌더는 (now - INTERP_DELAY_MS)
  // 시점의 위치를 양옆 두 샘플 사이 선형 보간으로 그린다. 60fps에서 연속적으로 흐름.
  // 본인 캐릭터(myAbsPredicted)는 입력 예측이라 영향 없음.
  // 핸드오프 시 player_left/mob_removed 받으면 즉시 비우니까 잔상 없음.
  const INTERP_DELAY_MS = 60;  // server tick 33ms(30Hz) + 약간의 jitter buffer
  const INTERP_HISTORY_MS = 1000;
  function pushSample(buf, t, x, y) {
    buf.push({ t, x, y });
    const cutoff = t - INTERP_HISTORY_MS;
    while (buf.length > 2 && buf[0].t < cutoff) buf.shift();
  }
  function sampleAt(buf, t, fallbackX, fallbackY) {
    if (!buf || buf.length === 0) return { x: fallbackX, y: fallbackY };
    if (t <= buf[0].t) return { x: buf[0].x, y: buf[0].y };
    const last = buf[buf.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y };
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1], b = buf[i];
      if (a.t <= t && t <= b.t) {
        const dt = b.t - a.t;
        const u = dt > 0 ? (t - a.t) / dt : 0;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
    }
    return { x: last.x, y: last.y };
  }

  // === 입력 ===
  const keys = new Set();
  // e.code → 게임 키 매핑 — OS 키보드 layout(한/영) 무관
  // 'KeyW' → 'w' 등으로 정규화해서 게임 로직은 한 가지만 보면 됨
  const CODE_TO_KEY = {
    KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
    KeyE: 'e', KeyC: 'c', KeyT: 't', KeyY: 'y', KeyF: 'f',
    KeyB: 'b', KeyH: 'h', KeyM: 'm', KeyK: 'k', KeyJ: 'j', KeyR: 'r', KeyL: 'l',
    KeyP: 'p', KeyO: 'o', KeyG: 'g', KeyN: 'n', KeyV: 'v', KeyZ: 'z', KeyX: 'x',
    KeyU: 'u', KeyI: 'i', Comma: ',', Period: '.',
    Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3',
    ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
    Space: ' ', Enter: 'enter', Tab: 'tab',
  };
  function normalizeKey(e) {
    // e.code 우선 (한글 IME 등에서도 동일). fallback: e.key
    return CODE_TO_KEY[e.code] || (e.key || '').toLowerCase();
  }
// @@moved:5811
// @@moved:5930
  // blur 이벤트로 keys 초기화 안 함 — 콘솔 열기/탭 전환 등 사소한 이유로 키가 reset돼서
  // 사용자가 "막힌 느낌" 받는 원인. 진짜 화면 떠나면 어차피 keyup 자연스럽게 일어남.
  // window.addEventListener('blur', () => { keys.clear(); });

  function openChat() {
    chatActive = true;
    keys.clear();
    const input = document.getElementById('chatInput');
    input.classList.add('active');
    input.focus();
    input.value = '';
  }
  function closeChat(send = false) {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    chatActive = false;
    input.classList.remove('active');
    input.blur();
    input.value = '';
    if (send && text) {
      sendPrimary({ type: 'chat', text });
    }
  }
  function setupChat() {
    const input = document.getElementById('chatInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeChat(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeChat(false);
      }
    });
  }

// @@moved:5973
