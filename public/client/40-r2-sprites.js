// @@split:40-r2-sprites — R2 — 몹·자연물·다리·나무

  function drawMobIso(x, y, mob) {
    // Phase 5-6b: 36 mob 종류 — emoji fallback (옛 deer/wolf 외)
    if (mob.type !== 'deer' && mob.type !== 'wolf') {
      const animal = window.Animals?.ANIMALS?.[mob.type];
      if (animal) {
        // 그림자
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        const sz = animal.size === 'tiny' ? 0.5 : animal.size === 'small' ? 0.7 : animal.size === 'medium' ? 1.0 : animal.size === 'large' ? 1.3 : 1.6;
        ctx.ellipse(x, y + 6 * sz, 10 * sz, 4 * sz, 0, 0, Math.PI * 2);
        ctx.fill();
        // ★★[T66] 렌더 없음 = **점선 빈 칸**(재민 확정 4 — 이모지로 메우지 않는다).
        //   ⚠이모지만 지우면 짐승이 **화면에서 사라진다**(그림자만 남는다) — 자리는 남겨야
        //     "여기 뭔가 있는데 그림이 아직 없다"가 보이고, 굽는 날 그 자리가 채워진다.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        {
          const half = Math.round(11 * sz);
          ctx.save();
          ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(220,220,220,0.55)';
          ctx.strokeRect(Math.round(x - half) + 0.5, Math.round(y - half) + 0.5, half * 2, half * 2);
          ctx.restore();
        }
        // hp bar
        if (mob.hp != null && mob.hp < mob.maxHp) {
          const pct = mob.hp / mob.maxHp;
          ctx.fillStyle = '#222'; ctx.fillRect(x - 12, y - 18 * sz, 24, 3);
          ctx.fillStyle = '#c83a3a'; ctx.fillRect(x - 12, y - 18 * sz, 24 * pct, 3);
        }
        // tame 표시
        if (mob.tameOwner) {
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#ffdd44';
          ctx.fillText('집', x, y + 14 * sz);
        }
        return;
      }
    }
    const isWolf = mob.type === 'wolf';
    // Phase 14.38: mob facing (world vx/vy → iso 방향)
    const fvx = mob._fvx ?? 1, fvy = mob._fvy ?? 0;
    const fdx = fvx - fvy, fdy = (fvx + fvy) * 0.5;
    const flen = Math.hypot(fdx, fdy) || 1;
    const facingX = fdx / flen, facingY = fdy / flen;
    // 머리 위치: 몸통 중심에서 facing 방향으로 6px 앞
    const headOX = facingX * 6, headOY = facingY * 3 - 4; // y는 살짝 위
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (isWolf) {
      // 회색 늑대
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 머리 (facing 방향)
      ctx.beginPath(); ctx.arc(x + headOX, y + headOY, 3, 0, Math.PI * 2); ctx.fillStyle = '#555'; ctx.fill();
      // 눈 (머리 위 facing 방향)
      ctx.fillStyle = '#f00';
      ctx.fillRect(x + headOX + facingX * 1.5 - 0.5, y + headOY + facingY * 1.5 - 0.5, 1, 1);
    } else {
      // 갈색 사슴
      ctx.fillStyle = '#a07050';
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 머리 (facing 방향)
      const dhx = x + headOX, dhy = y + headOY - 3;
      ctx.beginPath(); ctx.arc(dhx, dhy, 3, 0, Math.PI * 2); ctx.fillStyle = '#8a5a3a'; ctx.fill();
      // 뿔 (facing 방향, 짧게 두 가닥)
      ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(dhx - 1, dhy - 2); ctx.lineTo(dhx - 2, dhy - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dhx + 1, dhy - 2); ctx.lineTo(dhx + 2, dhy - 5); ctx.stroke();
    }
    // HP bar
    if (mob.hp < mob.maxHp) {
      ctx.fillStyle = '#222'; ctx.fillRect(x - 10, y - 16, 20, 3);
      ctx.fillStyle = '#d85a5a'; ctx.fillRect(x - 10, y - 16, 20 * (mob.hp / mob.maxHp), 3);
    }
    // 이름
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = mob.tameOwner ? '#ffb0c0' : '#cdd6e3';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
    const baseLabel = isWolf ? '늑대' : '사슴';
    const label = mob.tameOwner ? `${baseLabel} (${mob.tameOwnerName || ''})` : baseLabel;
    ctx.strokeText(label, x, y - 20); ctx.fillText(label, x, y - 20);
    ctx.textAlign = 'start';
  }

  // Phase 5-8: 입체 나무 — r(반경) + h(높이) 사용. 사실적 줄기+캐노피.
  // 나무 색 변주 팔레트 [어두운잎, 밝은잎] + 잎뭉치 오프셋 — 모듈 1회 생성(매 프레임 재생성 X)
  const _TREE_GREENS = [
    ['#2f6b39', '#5aa85e'],   // 기본
    ['#357a3d', '#67b566'],   // 밝은
    ['#27602f', '#4d9a50'],   // 어두운
    ['#3f6e2b', '#74ad49'],   // 누런 (가을 직전)
    ['#2c6647', '#50a878'],   // 청록
  ];
  const _CANOPY_BLOBS = [      // [dx, dy, scale] (canopyR 기준) — 유기적 실루엣
    [0.0,   0.12, 1.00],
    [-0.60, 0.20, 0.60],
    [0.60,  0.20, 0.60],
    [-0.32, -0.42, 0.64],
    [0.36,  -0.40, 0.60],
    [0.0,   -0.34, 0.74],
  ];
  function _treeHash(sx, sy) {  // 위치 기반 결정적 해시(0~1) — 나무마다 일정한 색/형태(깜빡임 없음)
    let h = (Math.floor(sx) * 73856093) ^ (Math.floor(sy) * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 997) / 997;
  }
  // 나무 스프라이트 (Kenney Nature Kit, 초록 recolor) — public/assets/trees/. 로드되면 벡터 대신 사용.
  // ★[에셋 3차 — 자연물 리스킨] RD 생성 스프라이트(assets-src/rd-nature-sheet.png에서 추출·분류) — 나무 파이프라인 동형.
  //   rock=바위6+이끼바위6 풀, ore=구리 광맥6, bush=딸기 덤불6, herb=약초6. 로드 전엔 기존 절차 렌더 폴백.
  const NATURE_SPRITES = {};
  let _natureLoaded = 0;
  (() => {
    const add = (cls, name, n) => { const a = (NATURE_SPRITES[cls] = NATURE_SPRITES[cls] || []); for (let i = 1; i <= n; i++) { const im = new Image(); im.onload = () => _natureLoaded++; im.src = '/assets/nature/' + name + String(i).padStart(2, '0') + '.png'; a.push(im); } };
    add('rock', 'rock', 6); add('rock', 'mossrock', 6); add('ore', 'ore', 6); add('bush', 'bush', 6); add('herb', 'herb', 6);
  })();
  const NATURE_BASE_W = { rock: 44, mossrock: 44, ore: 42, bush: 40, herb: 30 };   // ★인게임 기준 폭(px) — 대형안[사용자 확정]: 그리기=×1.5(약초 ×1.25) → 바위 66·광맥 63·덤불 60·약초 38px(나무 ~78px과 동급). 자산 해상도 무관 화면 크기 고정
  function drawNatureSprite(cls, x, y, seedX, seedY, scale) {   // 위치 해시로 변형 고정(깜빡임 없음) — 바닥 중심 앵커+그림자
    const arr = NATURE_SPRITES[cls]; if (!arr || !_natureLoaded) return false;
    const hsh = _treeHash(seedX != null ? seedX : x, seedY != null ? seedY : y);
    const im = arr[(hsh * arr.length) | 0];
    if (!im || !im.complete || !im.naturalHeight) return false;
    const sc = scale || 1.5, w = (NATURE_BASE_W[cls] || 26) * sc, hh = w * (im.naturalHeight / im.naturalWidth);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, w * 0.42, w * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(im, x - w / 2, y - hh + 5, w, hh);
    return true;
  }
  // ★[다리 스프라이트 — 에셋 9차] scripts/bridge_render.py 산출물(256², 알파).
  //   중간 타일 mid + 접지 캡 cap0/cap1 × 축 x/y = 6장. **자연물과 규약이 다르다**:
  //   자연물은 bbox 크롭 후 화면 폭을 상수로 잡지만, 다리는 셀에 딱 맞아야 하므로 **크롭 금지**이고
  //   이미지 중심 = 셀 중심, 그리기 크기 = 128×128 고정(셀 다이아 64px의 2배)이다.
  const BRIDGE_SPRITES = {};
  let _bridgeLoaded = 0;
  (() => {
    for (const k of ['bridge_mid_x', 'bridge_mid_y', 'bridge_cap0_x', 'bridge_cap0_y', 'bridge_cap1_x', 'bridge_cap1_y',
                     'gran_pile1', 'gran_pile2', 'gran_pile3', 'gran_prop',
                     'yard_hearth', 'yard_jar1', 'yard_jar2', 'yard_garden',      // ★10차: 마당 소품(화덕·장독2·텃밭)
                     'mkt_mat', 'mkt_basket', 'mkt_jar', 'mkt_hide',              // ★10차 T4: 장마당 좌판(멍석·바구니·항아리·가죽)
                     'ditch_x', 'ditch_y', 'ditch_c']) {                          // ★11차 T3: 환호 도랑(가로·세로·모서리)
      const im = new Image(); im.onload = () => _bridgeLoaded++; im.src = '/assets/bridge/' + k + '.png';
      BRIDGE_SPRITES[k] = im;
    }
  })();
  const BRIDGE_DRAW_PX = 128;   // = 셀 다이아 폭(64) × 2 — 렌더 ortho_scale=2√2와 짝인 상수
  // ★[10차 T4 장마당] 좌판 배치 — 큰집(8×8, 발자국 [-4..3]²) 남벽 문 앞 마당. 문 통로(dx=0)와 그 옆(dx=±1)은
  //   비워 둔다(랩 _hallYard가 쓰는 통로 — 막으면 NPC 문턱 정체). dy≥5라 발자국 밖·마당 원(r10) 안.
  const MARKET_STALLS = [['mkt_mat', -3, 5], ['mkt_basket', -1, 7], ['mkt_jar', 2, 5], ['mkt_hide', 4, 6]];
  function drawBridgeSprite(key, wx, wy, toScreenFn) {
    const im = BRIDGE_SPRITES[key]; if (!im || !im.complete || !im.naturalHeight) return false;
    const p = w2i(wx, wy), s = toScreenFn(p.x, p.y);
    ctx.drawImage(im, s.x - BRIDGE_DRAW_PX / 2, s.y - BRIDGE_DRAW_PX / 2, BRIDGE_DRAW_PX, BRIDGE_DRAW_PX);
    return true;
  }
  // 같은 규약을 **화면 좌표로 직접** 쓰는 경로(지면 타일 draw는 이미 셀 중심 화면좌표를 받는다)
  function drawCellSpriteAt(key, sx, sy) {
    const im = BRIDGE_SPRITES[key]; if (!im || !im.complete || !im.naturalHeight) return false;
    ctx.drawImage(im, sx - BRIDGE_DRAW_PX / 2, sy - BRIDGE_DRAW_PX / 2, BRIDGE_DRAW_PX, BRIDGE_DRAW_PX);
    return true;
  }
  const TREE_SPRITES = [];
  let _treeSpritesLoaded = 0;
  for (let _ti = 1; _ti <= 12; _ti++) {
    const _img = new Image();
    _img.onload = () => { _treeSpritesLoaded++;
      // ★다 로드되면 산 청크를 한 번 비운다 — 안 그러면 '나무 없는' 상태로 구워진 채 남는다
      if (_treeSpritesLoaded === 12) { try { _mt3Chunk.clear(); _mt3Sig = ''; } catch (e) {} } };
    _img.src = '/assets/trees/tree' + String(_ti).padStart(2, '0') + '.png';
    TREE_SPRITES.push(_img);
  }
  // ★★[T122 2026-09-05] **벤 자리의 두 단계** — 그루터기·묘목. 그림은 **T129 가 이미 구웠다**
  //   (`stump01.png` 종 공통 하나 · `sap_<종>.png` 여덟). 축소 그림을 임시로 쓰지 않는다.
  //   ⚠종은 아직 하나(`tree`)라 묘목은 **성목과 같은 해시**로 고른다 — 같은 자리의 나무가
  //     자라면 같은 종이어야 한다(자리마다 종이 바뀌면 그건 재생이 아니라 다른 나무다).
  const SAP_SPECIES = ['pine', 'jat', 'oak', 'chestnut', 'willow', 'hazel', 'mulberry', 'grape'];
  const SAP_SPRITES = SAP_SPECIES.map((sp) => { const im = new Image(); im.src = '/assets/trees/sap_' + sp + '.png'; return im; });
  const STUMP_SPRITE = (() => { const im = new Image(); im.src = '/assets/trees/stump01.png'; return im; })();
  const _regrowDraw = { stump: 0, sapling: 0 };   // 하네스용 — 실제로 그린 횟수

  //   ★그리는 문법은 나무와 **같다**(줄기 밑면을 (x,y)에 앵커 · h 로 스케일 · 그림자 타원).
  function _drawStandingSprite(img, x, y, r, h, scale) {
    if (!img || !img.complete || !img.naturalHeight) return false;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    const dh = h * scale, dw = dh * (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, x - dw / 2, y - dh, dw, dh);
    return true;
  }
  function drawStumpIso(x, y, r, h, seedX, seedY) {
    if (_drawStandingSprite(STUMP_SPRITE, x, y, r || 7, h || 10, 1.3)) { _regrowDraw.stump++; return; }
    // 폴백 — 낮은 원기둥 하나(그림이 아직 안 왔을 때)
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath(); ctx.ellipse(x, y, (r || 7) * 1.4, (r || 7) * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - (r || 7), y - (h || 10), (r || 7) * 2, (h || 10));
    ctx.fillStyle = '#8a6438';
    ctx.beginPath(); ctx.ellipse(x, y - (h || 10), (r || 7), (r || 7) * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawSaplingIso(x, y, r, h, seedX, seedY) {
    const hsh = _treeHash(seedX != null ? seedX : x, seedY != null ? seedY : y);
    const img = SAP_SPRITES[(hsh * SAP_SPRITES.length) | 0];
    if (_drawStandingSprite(img, x, y, r || 4, h || 20, 1.3)) { _regrowDraw.sapling++; return; }
    drawTreeIso(x, y, r, h, seedX, seedY);   // 폴백 — 작은 나무(크기는 서버가 이미 줄여 보냈다)
  }

  const TREE_SPRITE_SCALE = 1.3;   // 나무 h 대비 스프라이트 높이 배수
  const _treeDraw = { n: 0, h: 0, px: 0, aspect: 0 };   // ★[배치 21] 하네스용 — 스프라이트 경로로 **실제 그린** 횟수

  function drawTreeIso(x, y, r, h, seedX, seedY) {
    r = r || 8;
    h = h || 60;
    const hsh = _treeHash(seedX != null ? seedX : x, seedY != null ? seedY : y);
    // 스프라이트 로드됐으면 그걸로 — 해시로 종류 고정, 줄기 밑면을 (x,y)에 앵커, h로 스케일
    if (_treeSpritesLoaded > 0) {
      const _img = TREE_SPRITES[(hsh * TREE_SPRITES.length) | 0];
      if (_img && _img.complete && _img.naturalHeight) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        const _dh = h * TREE_SPRITE_SCALE;
        const _dw = _dh * (_img.naturalWidth / _img.naturalHeight);
        ctx.drawImage(_img, x - _dw / 2, y - _dh, _dw, _dh);
        _treeDraw.n++; _treeDraw.h = h; _treeDraw.px = _dh; _treeDraw.aspect = _img.naturalWidth / _img.naturalHeight;
        return;
      }
    }
    // 1) 지면 그림자 — 부드럽게
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r * 1.5, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 2) 줄기 — 아래가 넓은 테이퍼 + 나무마다 살짝 다른 기울기
    const trunkH = h * 0.55;
    const baseW = Math.max(3.5, r * 0.5);
    const topW = Math.max(2.2, r * 0.3);
    const tX = x + (hsh - 0.5) * r * 0.3, tY = y - trunkH;
    ctx.fillStyle = '#5b3d23';
    ctx.beginPath();
    ctx.moveTo(x - baseW / 2, y);
    ctx.lineTo(x + baseW / 2, y);
    ctx.lineTo(tX + topW / 2, tY);
    ctx.lineTo(tX - topW / 2, tY);
    ctx.closePath(); ctx.fill();
    // 줄기 그늘(오른쪽 절반)
    ctx.fillStyle = '#422c17';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + baseW / 2, y);
    ctx.lineTo(tX + topW / 2, tY);
    ctx.lineTo(tX, tY);
    ctx.closePath(); ctx.fill();
    // 3) 캐노피 — 여러 잎뭉치(유기적). 2톤 + 나무별 색 변주
    const pal = _TREE_GREENS[(hsh * _TREE_GREENS.length) | 0];
    const canopyR = r * 1.5;
    const ccx = tX, ccy = tY - canopyR * 0.5;
    // base(어두운 톤) — 모든 뭉치 한 번에 fill (같은 색이라 겹쳐도 매끈하게 합쳐짐)
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    for (let i = 0; i < _CANOPY_BLOBS.length; i++) {
      const b = _CANOPY_BLOBS[i];
      const bx = ccx + b[0] * canopyR, by = ccy + b[1] * canopyR, br = b[2] * canopyR;
      ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, Math.PI * 2);
    }
    ctx.fill();
    // highlight(밝은 톤) — 위쪽 뭉치만 살짝 위/왼쪽으로 (햇빛)
    ctx.fillStyle = pal[1];
    ctx.beginPath();
    for (let i = 0; i < _CANOPY_BLOBS.length; i++) {
      const b = _CANOPY_BLOBS[i];
      if (b[1] > -0.1) continue;
      const bx = ccx + b[0] * canopyR - canopyR * 0.1, by = ccy + b[1] * canopyR - canopyR * 0.14, br = b[2] * canopyR * 0.8;
      ctx.moveTo(bx + br, by); ctx.arc(bx, by, br, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function drawRockIso(x, y, seedX, seedY) {
    if (drawNatureSprite('rock', x, y, seedX, seedY)) return;   // ★에셋 3차: 스프라이트 우선(로드 전 절차 폴백)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 2);
    ctx.lineTo(x - 6, y - 6);
    ctx.lineTo(x + 3, y - 8);
    ctx.lineTo(x + 10, y - 2);
    ctx.lineTo(x + 8, y + 5);
    ctx.lineTo(x - 4, y + 6);
    ctx.closePath();
    ctx.fillStyle = '#8a8a8a'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 5); ctx.lineTo(x + 2, y - 7); ctx.lineTo(x + 0, y - 3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
  }

  function drawBerryBushIso(x, y, seedX, seedY) {
    if (drawNatureSprite('bush', x, y, seedX, seedY)) return;   // ★에셋 3차
    // 낮은 덤불 + 빨간 베리들
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + 4, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a4a20';
    ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a3a10'; ctx.lineWidth = 1; ctx.stroke();
    // 베리들
    ctx.fillStyle = '#c83a3a';
    ctx.beginPath(); ctx.arc(x - 3, y - 1, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 2, y - 3, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y + 1, 1.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 1, y + 2, 1.5, 0, Math.PI*2); ctx.fill();
  }

  function drawWaterPoolIso(x, y) {
    // 푸른 다이아 (반짝이는 작은 연못)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 6); ctx.lineTo(x + 14, y);
    ctx.lineTo(x, y + 6); ctx.lineTo(x - 14, y); ctx.closePath();
    ctx.fillStyle = '#2a6aa8'; ctx.fill();
    ctx.strokeStyle = '#1a4a78'; ctx.lineWidth = 1; ctx.stroke();
    // 반짝이
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(x - 4, y - 1, 3, 1, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 5, y + 2, 2, 0.8, 0, 0, Math.PI*2); ctx.fill();
  }

  // Phase 14.3 — 약초 (herb): 작은 녹색 꽃 무더기
  function drawHerbIso(x, y, seedX, seedY) {
    if (drawNatureSprite('herb', x, y, seedX, seedY, 1.25)) return;   // ★에셋 3차(약초는 작게)
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 8, 3, 0, 0, Math.PI*2); ctx.fill();
    // 줄기 3개
    ctx.strokeStyle = '#3a7a3a'; ctx.lineWidth = 1.5;
    for (const [ox, oy] of [[-4, 0], [0, -2], [4, 0]]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y); ctx.lineTo(x + ox, y - 10 + oy); ctx.stroke();
    }
    // 잎/꽃
    ctx.fillStyle = '#7ac86a';
    for (const [ox, oy] of [[-4, -10], [0, -12], [4, -10]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, 2.5, 0, Math.PI*2); ctx.fill();
    }
    // 노란 꽃 점
    ctx.fillStyle = '#e8d048';
    for (const [ox, oy] of [[-4, -10], [4, -10]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, 1, 0, Math.PI*2); ctx.fill();
    }
  }

  // Phase 14.3 — 광물 (ore): 회색 바위 + 빛나는 금속 결정
  function drawOreIso(x, y, seedX, seedY) {
    if (drawNatureSprite('ore', x, y, seedX, seedY)) return;   // ★에셋 3차
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 13, 5, 0, 0, Math.PI*2); ctx.fill();
    // 바위 본체
    ctx.beginPath();
    ctx.moveTo(x - 12, y); ctx.lineTo(x, y - 14);
    ctx.lineTo(x + 12, y - 2); ctx.lineTo(x + 8, y + 6);
    ctx.lineTo(x - 8, y + 6); ctx.closePath();
    ctx.fillStyle = '#5a5a6a'; ctx.fill();
    ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1; ctx.stroke();
    // 금속 결정 (반짝)
    ctx.fillStyle = '#c8a838';
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 4); ctx.lineTo(x, y - 9);
    ctx.lineTo(x + 3, y - 4); ctx.lineTo(x, y - 1); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8a7820'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,200,0.6)';
    ctx.beginPath(); ctx.arc(x, y - 6, 1.5, 0, Math.PI*2); ctx.fill();
  }

  // ★운철(隕鐵) 낙하지 — 광맥 노두와 헷갈리면 안 된다. 그을린 웅덩이(충돌 흔적) 위에
  //   **금속 광택이 도는 검은 덩어리**. 광맥의 노란 결정(구리·금)과 달리 은백색으로 번쩍인다.
  function drawMeteoriteIso(x, y, seedX, seedY) {
    ctx.save();
    // 충돌 그을음(둘레)
    ctx.fillStyle = 'rgba(30,24,20,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 6, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 5, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 덩어리 본체 — 모난 다면체
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 2); ctx.lineTo(x - 7, y - 9); ctx.lineTo(x + 2, y - 12);
    ctx.lineTo(x + 10, y - 5); ctx.lineTo(x + 7, y + 4); ctx.closePath();
    ctx.fillStyle = '#3a3630'; ctx.fill();
    ctx.strokeStyle = '#17140f'; ctx.lineWidth = 1.1; ctx.stroke();
    // 파단면의 금속 광택(비트만슈테텐 무늬 암시)
    ctx.strokeStyle = 'rgba(210,215,225,0.85)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 5, y - 2); ctx.lineTo(x + 4, y - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3, y - 7); ctx.lineTo(x + 5, y - 3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x + 1, y - 6, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ═══ ★[T13 2026-09-02] NPC 소체 시트 — 직업 표식 ═══════════════════════════
  //   ★왜 이 파일인가: 사람을 그리는 함수(`drawCharSprite`)는 `41-h-char.js` 에 있고 그 파일은
  //     온보딩 v2 와 병행 중이라 **함수 신설 금지**다. 그래서 표(직업 → 레이어)를 여기 두고
  //     그쪽은 **한 줄로 불러 쓴다**. 조각 실행 순서가 40 → 41 이라 41 에서 이 이름이 보인다.
  //
  //   ★표식은 **옷 색이 아니라 손에 든 것**이다. 고증 캐논(`인계/R2` 3-n)이
  //     *"서민 복장 = 물들이지 않은 삼베(화려함 금지)"* 를 못 박았으므로 직업을 옷 색으로 가르면
  //     그 캐논을 어긴다. 연장 실루엣은 54px 에서도 읽힌다(3-q ④ 가 배운 것: 얼굴은 안 보여도
  //     실루엣은 보인다).
  //
  //   ★자산이 안 느는 쪽부터 썼다: `tool_axe`·`tool_rod` 는 **이미 있던 시트**다(추가 0).
  //     새로 구운 것은 `tool_hoe`(괭이)·`tool_hammer`(망치) 둘뿐이고, 둘 다 몸만 홀드아웃하는
  //     기존 도구 문법 그대로라 **시트가 곱으로 늘지 않는다**(레이어는 가산이다 — 3-q ③).
  //
  //   ⚠여기 없는 직업은 **맨손 + 삼베**다(주민 기본). 표식이 없는 것이 결함이 아니라 기본이다.
  //   ⚠촌장은 이 표에 없다 — **촌장 NPC 개체가 지금 세계에 없기 때문이다**(§0 실측: 촌장 말풍선은
  //     마을 앵커가 낸다 · `villageAnchorPx`). 온보딩 v2 가 앵커 NPC 를 지정하면 여기 한 줄이면 된다.
  //   ★표는 **실측한 직업 분포**로 골랐다(51마을 800일 · 인구 6,280 · `LAB_DUMP` 의 `counts` 합산).
  //     고르지 않은 직업이 아니라 **적게 사는 직업**이 표식이 없는 것이다:
  //       farmer 25.9% · forager 20.4% · fisher 14.5% · hunter 14.0% · lumberjack 10.9% ·
  //       mason 5.0% · cook 3.8% · warrior 2.2% · tailor 1.4% · miner 0.8% · smith 0.7% · armorsmith 0.4%
  //     ⇒ 아래 표가 덮는 인구 = **94.0%**. 나머지 6%(cook·tailor·miner)는 맨손이다.
  //     ⚠분포를 눈대중하지 않았다 — 첫 판에서 "농부가 제일 많겠지"로 짰다가 하네스가 들어간 마을에
  //       hunter·mason·forager 밖에 없어 판정이 빈손으로 돌아왔다. 그래서 세고 다시 짰다.
  const NPC_JOB_TOOL = {
    farmer: 'tool_hoe',            // 🌾 25.9% — 괭이(신규)
    forager: 'tool_basket',        // 🧺 20.4% — 채반(신규). 유일하게 가로로 넓어 다른 넷과 안 헷갈린다
    fisher: 'tool_rod',            // 🎣 14.5% — 기존 시트 재사용(추가 0)
    hunter: 'tool_spear',          // 🏹 14.0% — 창(신규). 활은 이 조형 문법으로 못 만든다(아래 .py 주석)
    lumberjack: 'tool_axe',        // 🪓 10.9% — 기존 시트 재사용(추가 0)
    mason: 'tool_hammer',          //  ⛏  5.0% — 석공의 망치(대장장이와 같은 시트를 쓴다)
    warrior: 'tool_spear',         // 💂  2.2% — 창을 나눠 쓴다
    smith: 'tool_hammer',          // 🔨  0.7%
    weaponsmith: 'tool_hammer',    // ⚔️
    armorsmith: 'tool_hammer',     // 🛡️
  };
  // ★★[T125 2026-09-05] 여기 있던 `npcCharLayers` 는 **지웠다**(사본 −1). 그 함수가 옷을
  //   `clothes_hemp` 로 **못 박고** 있었고, 그래서 마을 곳간에 갖옷이 쌓여도 화면은 전부 삼베였다.
  //   이제 층 목록은 사람·주민 한 함수(`42-r2-char.js charLayersFor`)가 만들고, 이 표는
  //   그 함수가 **직업 소품**을 고를 때 읽는다(표는 여기 남는다 — 소품은 R2 의 것이다).
  //   ⚠표를 `window` 에 올리지 않는다 — 그건 **최상위 실행문**이고 조각 규약상 `99-main.js` 에만
  //     허용된다(`test-client-globals ③` 이 잡는다 · 실제로 잡혔다). 하네스는 이 표를 베끼지 말고
  //     ⓐ 소스에서 정규식으로 읽거나 ⓑ `window.__charDbg[pid].layers`(이미 있는 진단 훅)를 봐라.
