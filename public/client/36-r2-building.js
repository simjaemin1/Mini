// @@split:36-r2-building — R2 — 그리기 헬퍼·계단 셀·건물 아이소메트릭 (T51 ⑤)
  // === 그리기 헬퍼 ===
  function drawDiamond(cx, cy, size, color) {
    const hw = size;
    const hh = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }

  const WALL_HEIGHT = 64; // 14.49-e2: FLOOR_HEIGHT(64)와 같음

  // ★★[T67 2026-09-03] **가구·시설 스프라이트** — `scripts/props_render.py` 산출물.
  //   재민 확정: *"모든 아이템·가구는 그림이 하나다."* 가구는 해체하면 인벤에 들어가므로
  //   (`doDismantleBuilding` → 가구 그 자체 환원) **세계에 선 모습과 인벤 아이콘이 같은 모델**이어야 한다.
  //   ⇒ 물건 하나 = 모델 정의 하나 = 렌더 둘. 여기선 그 둘 중 세계용을 그린다.
  //   ★앵커 표를 **여기 적지 않는다**. `/assets/props/props_anchors.json` 을 그대로 읽는다
  //     (자연물 `nature_anchors.json` 과 같은 규약). 옮겨 적으면 다시 굽는 날 두 벌이 갈린다(족보 79).
  //   ★앵커 원점은 **그리기 자리**에 맞춰 구웠다: 덩어리형은 셀 중심, 벽·문은 밑변 한가운데.
  //     그래서 여기서 델타 계산이 한 줄도 없다 — `drawImage(sp, x-_ox, y-_oy)` 뿐이다.
  //   ★적재는 **첫 건물 그릴 때** 한 번 시작한다(최상위 실행문 금지 규약 — `test-client-globals ③`).
  const _propSpr = {};
  let _propAnchors = null, _propLoaded = 0, _propInit = false;
  function _propsEnsure() {
    if (_propInit) return;
    _propInit = true;
    (async () => {
      try {
        const r = await fetch('/assets/props/props_anchors.json');
        if (!r.ok) return;
        _propAnchors = await r.json();
        for (const k in _propAnchors) {
          const a = _propAnchors[k], im = new Image();
          im.onload = () => { im._ox = a.ox; im._oy = a.oy; _propSpr[k] = im; _propLoaded++; };
          im.src = '/assets/props/' + k + '.png';   // ★키는 JSON 이 준다 — 손으로 적은 목록이 없으니 404 가 날 수 없다
        }
        console.log('[props] 가구 스프라이트', Object.keys(_propAnchors).length, '종 로드 시작');
      } catch (e) { console.warn('[props] 앵커 로드 실패:', e.message); }
    })();
  }
  // 몸체 = 스프라이트 한 줄. 상태(불꽃·거래소 표식·파손 투명도)는 부르는 쪽이 얹는다.
  function drawPropBody(key, x, y) {
    const sp = _propSpr[key];
    if (!sp) return false;
    ctx.drawImage(sp, x - sp._ox, y - sp._oy);
    return true;
  }
  // 아직 안 온 렌더 = **점선 빈 칸**(설계 §1-5 "아이콘 없는 품목은 이모지가 아니라 점선 빈 칸").
  //   8종이 각자 도형을 들고 있던 자리를 이 하나로 대신한다 — 폴백 도형을 두면 정본이 둘이 된다.
  function drawPropPending(x, y) {
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(180,170,140,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 16); ctx.lineTo(x + 32, y); ctx.lineTo(x, y + 16); ctx.lineTo(x - 32, y);
    ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  }
  // 14.49-e7ah: stair cell N의 8 sub-step만 그림. anchor (x, y) = cell N center.
  function drawStairCellPart(x, y, cellN, building) {
    const H = FLOOR_HEIGHT;
    const dir = building?.data?.dir || 'N';
    const dv = dir === 'E' ? { x: 1, y: 0 } : dir === 'W' ? { x: -1, y: 0 } : dir === 'S' ? { x: 0, y: 1 } : { x: 0, y: -1 };
    const pv = { x: -dv.y, y: dv.x };
    function worldOffToScreen(wx, wy, wz) {
      return { x: (wx - wy), y: (wx + wy) * 0.5 - wz };
    }
    const SUB_PER_CELL = 8;
    const SUB_TOTAL = 24;
    const SUB_WIDTH = CL_BUILDING_SIZE / SUB_PER_CELL;
    for (let subInCell = 0; subInCell < SUB_PER_CELL; subInCell++) {
      const S = cellN * SUB_PER_CELL + subInCell;
      // cell N 중심 기준 (anchor가 cell N center): subInCell offset
      const w = (subInCell - 3.5) * SUB_WIDTH;
      const z = (S / (SUB_TOTAL - 1)) * H;
      const halfDV = SUB_WIDTH / 2;
      const halfPV = CL_BUILDING_SIZE / 2;
      function corner(dvSign, pvSign) {
        const wx = dv.x * (w + halfDV * dvSign) + pv.x * halfPV * pvSign;
        const wy = dv.y * (w + halfDV * dvSign) + pv.y * halfPV * pvSign;
        const sc = worldOffToScreen(wx, wy, z);
        return { x: x + sc.x, y: y + sc.y };
      }
      const c1 = corner(-1, -1);
      const c2 = corner( 1, -1);
      const c3 = corner( 1,  1);
      const c4 = corner(-1,  1);
      const prevZ = S === 0 ? 0 : ((S - 1) / (SUB_TOTAL - 1)) * H;
      if (z > prevZ) {
        const c1d = { x: c1.x, y: c1.y + (z - prevZ) };
        const c4d = { x: c4.x, y: c4.y + (z - prevZ) };
        ctx.fillStyle = '#4a2a14';
        ctx.strokeStyle = '#2a1808';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c4.x, c4.y);
        ctx.lineTo(c4d.x, c4d.y); ctx.lineTo(c1d.x, c1d.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#b08858';
      ctx.strokeStyle = '#5a3818';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawBuildingIso(x, y, type, building) {
    _propsEnsure();   // ★[T67] 가구 스프라이트 최초 1회 적재 시작(비동기 — 오는 동안은 점선 빈 칸)
    if (type === 'vtile') {
      // ★[실체화 동기 — 랩 정본] 마을 지면 타일: yard=부지 원판(다짐 흙), plaza=큰집 마당 광장, garden=텃밭(이랑)
      const kind = (building?.data?.kind) || 'yard';
      // ★[텃밭 3D — 에셋 10차] 이랑·새싹 타일(1셀 정합 스프라이트). 미로드 시 아래 벡터 이랑 폴백.
      if (kind === 'garden' && drawCellSpriteAt('yard_garden', x, y)) return;
      if (kind !== 'garden' && _tileYardC) {
        // ★생성형 텍스처 실셀 다이아(64×32) — 마당·광장이 이어진 다짐 지면으로 읽힘(구 반크기 점묘 폐지)
        ctx.drawImage(kind === 'plaza' ? _tilePlazaC : _tileYardC, x - 32, y - 16);
        return;
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 8); ctx.lineTo(x + 16, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 16, y); ctx.closePath();
      if (kind === 'plaza') ctx.fillStyle = 'rgba(158,128,82,0.62)';
      else if (kind === 'garden') ctx.fillStyle = '#5e7038';
      else ctx.fillStyle = 'rgba(122,88,54,0.5)';
      ctx.fill();
      if (kind === 'garden') {
        ctx.strokeStyle = 'rgba(58,82,34,0.85)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 8, y - 4); ctx.lineTo(x + 8, y + 4);
        ctx.moveTo(x - 4, y - 6); ctx.lineTo(x + 12, y + 2);
        ctx.stroke();
      }
      return;
    }
    if (type === 'hut_site') {
      // ★움집터 — 수혈 구덩이 + 단계 진행. stage 1=구덩이, 2=굴립주, 3=도리·서까래 골조, 4=완공(hut로 전환)
      const st = (building?.data?.stage) | 0;
      // ★[공정 3D — 에셋 10차] 완공 움집과 **같은 발자국(6×4)·같은 앵커 계약**의 단계 스프라이트.
      //   행 px(b.x,b.y)는 발자국 중심이 아니라 (x0+2.5, y0+1.5)셀이라, 발자국 북서 오버행 모서리까지의
      //   델타를 iso로 변환해 앵커를 잡는다(w2i가 선형이라 델타 변환이 성립).
      {
        const _sp = _bldSpr['hut_s' + st], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
          ctx.fillText(`움집터 ${st}/4단계 (클릭=시공)`, x, y - 18);
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 14); ctx.lineTo(x + 30, y); ctx.lineTo(x, y + 14); ctx.lineTo(x - 30, y); ctx.closePath();
      ctx.fillStyle = 'rgba(74,58,40,0.55)'; ctx.fill();
      ctx.setLineDash([4, 3]); ctx.strokeStyle = '#9a7a4a'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (st >= 2) { ctx.fillStyle = '#7a5a30'; for (const [px2, py2] of [[-18, 0], [0, -9], [18, 0], [0, 9], [-9, -4], [9, 4]]) ctx.fillRect(x + px2 - 1.5, y + py2 - 5, 3, 7); }
      if (st >= 3) { ctx.strokeStyle = '#8a6a3e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.lineTo(x, y - 12); ctx.lineTo(x + 18, y); ctx.stroke(); }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(`움집터 ${st}/4단계 (클릭=시공)`, x, y - 18);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'hut') {
      // 완공 앵커 — 몸체(벽·바닥)는 기존 경로가 그림. 라벨만.
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e8d8b0'; ctx.textAlign = 'center';
      ctx.fillText('움집', x, y - 6);
      ctx.textAlign = 'left';
      return;
    }
    // ★★[2026-08-02e ⑤] 조업 진척 게이지 — 노·숯가마 공용. 서버가 data.job{startedAt,until} 을 내려 준다.
    //   서버·클라가 **같은 식**을 쓴다(서버 _jobProgress 와 동일): (now−startedAt)/(until−startedAt).
    const _jobBar = (bld, cx, cy) => {
      const j = bld && bld.data && bld.data.job;
      if (!j || !j.until || !j.startedAt) return null;
      const now = Date.now();
      const p = Math.max(0, Math.min(1, (now - j.startedAt) / Math.max(1, j.until - j.startedAt)));
      const W = 34, H = 5;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(cx - W / 2, cy - 44, W, H);
      ctx.fillStyle = p >= 1 ? '#7cd97c' : '#ff9a3c';
      ctx.fillRect(cx - W / 2 + 1, cy - 43, (W - 2) * p, H - 2);
      return { p, remain: Math.max(0, Math.ceil((j.until - now) / 1000)) };
    };
    if (type === 'furnace_site' || type === 'furnace') {
      // ★노(爐) — 재민 확정(움집 동형 공정). 단계별 표현: 1=돌 기초, 2=노벽, 3=풀무, 완공=노+불.
      const st = (building?.data?.stage) | 0;
      const done = type === 'furnace';
      // ★[에셋] 움집터와 **같은 앵커 계약** — 발자국 2×2 북서 오버행 모서리에 붙인다.
      //   행 px(b.x,b.y)는 발자국 중심이라 (x0-0.5, y0-0.5)셀까지의 델타를 iso로 변환한다(w2i 선형).
      {
        const _sp = _bldSpr[done ? 'furnace' : ('furn_s' + st)], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          const _kko2 = (_d.kind) === 'bloomery' ? '괴련로' : '노(爐)';
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
          const _jb = done ? _jobBar(building, x, y) : null;
          ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? `${_kko2} — 클릭=출탕` : `${_kko2} 조업 중 ${_jb.remain}초`) : `${_kko2} — 클릭=장입`)
                            : `${_kko2} 터 ${st}/3단계 (클릭=시공)`, x, y - 28);
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 10); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 22, y); ctx.closePath();
      ctx.fillStyle = done ? 'rgba(90,70,58,0.9)' : 'rgba(90,80,70,0.55)'; ctx.fill();
      ctx.setLineDash(done ? [] : [4, 3]); ctx.strokeStyle = '#b09070'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (done || st >= 2) {   // 노벽(원통) 몸체
        ctx.fillStyle = done ? '#6a5040' : '#7a6a58';
        ctx.beginPath(); ctx.ellipse(x, y - 12, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 13, y - 12, 26, 12);
        ctx.beginPath(); ctx.ellipse(x, y, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (done) {   // 불꽃 + 연기 표식
        ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.ellipse(x, y - 13, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.ellipse(x, y - 13, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      const _kko = (building?.data?.kind) === 'bloomery' ? '괴련로' : '노(爐)';
      const _kn = (building?.data?.kind) === 'bloomery' ? 3 : 3;
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(done ? `${_kko} — 클릭=제련` : `${_kko} 터 ${st}/${_kn}단계 (클릭=시공)`, x, y - 26);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'kiln_site' || type === 'charcoal_kiln') {
      // ★숯가마 — 노와 같은 2×2 계약. 밀폐 봉토 둔덕 + 연도(굴뚝). 불꽃이 없다(공기를 막아 찌는 설비).
      const st = (building?.data?.stage) | 0;
      const done = type === 'charcoal_kiln';
      {
        const _sp = _bldSpr[done ? 'charcoal_kiln' : 'kiln_s1'], _d = building && building.data;
        if (_sp && _d && _d.x0 != null) {
          const _dx = (_d.x0 - 0.5) * CL_BUILDING_SIZE - building.x, _dy = (_d.y0 - 0.5) * CL_BUILDING_SIZE - building.y;
          const _ax2 = x + (_dx - _dy), _ay2 = y + (_dx + _dy) * 0.5;
          ctx.drawImage(_sp, _ax2 - _sp._ox, _ay2 - _sp._oy);
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e6d6b6'; ctx.textAlign = 'center';
          { const _jb = done ? _jobBar(building, x, y) : null;
            ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? '숯가마 — 클릭=수거' : `숯가마 탄화 중 ${_jb.remain}초`) : '숯가마 — 클릭=장입')
                              : `숯가마 터 ${st}/2단계 (클릭=시공)`, x, y - 28); }
          ctx.textAlign = 'left';
          return;
        }
      }
      ctx.beginPath();
      ctx.moveTo(x, y - 10); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 22, y); ctx.closePath();
      ctx.fillStyle = done ? 'rgba(74,62,50,0.9)' : 'rgba(88,80,70,0.55)'; ctx.fill();
      ctx.setLineDash(done ? [] : [4, 3]); ctx.strokeStyle = '#9a8464'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      if (done || st >= 2) {   // 봉토 둔덕(반구)
        ctx.fillStyle = done ? '#5b4a38' : '#6f6152';
        ctx.beginPath(); ctx.ellipse(x, y - 4, 15, 11, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 15, y - 4, 30, 4);
      }
      if (done) {   // 연도(굴뚝) + 연기
        ctx.fillStyle = '#4a3c30'; ctx.fillRect(x + 8, y - 20, 4, 10);
        ctx.fillStyle = 'rgba(200,200,200,0.5)';
        ctx.beginPath(); ctx.ellipse(x + 10, y - 24, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#e6d6b6'; ctx.textAlign = 'center';
      { const _jb = done ? _jobBar(building, x, y) : null;
        ctx.fillText(done ? (_jb ? (_jb.p >= 1 ? '숯가마 — 클릭=수거' : `숯가마 탄화 중 ${_jb.remain}초`) : '숯가마 — 클릭=장입')
                          : `숯가마 터 ${st}/2단계 (클릭=시공)`, x, y - 26); }
      ctx.textAlign = 'left';
      return;
    }
    // ★★[2026-08-03e 배치 12 ①] 마을 회관 — 터(단계)와 완공. 노·숯가마 렌더와 같은 결(2×2 앵커+라벨).
    if (type === 'village_site' || type === 'village_hall' || type === 'shelter_site') {
      const _shel = type === 'shelter_site';   // ★[T62] 쉼터 터 — 회관 터와 같은 결(굴립주 앵커+라벨). 완공 실체는 움집 스킨이라 여기 안 온다.
      const done = type === 'village_hall';
      const st = (building?.data?.stage) | 0;
      // 굴립주(기둥 박아 세운 큰집) — 기둥 넷 + 이엉 지붕. 터는 지경석만.
      ctx.fillStyle = done ? '#6b5638' : '#57534a';
      for (const [dx, dy] of [[-14, -4], [14, -4], [-14, 8], [14, 8]]) { ctx.fillRect(x + dx - 2, y + dy - (done ? 20 : 4), 4, done ? 22 : 6); }
      if (done) {
        ctx.fillStyle = '#8a6f42';
        ctx.beginPath(); ctx.moveTo(x, y - 42); ctx.lineTo(x + 22, y - 20); ctx.lineTo(x - 22, y - 20); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5c4a2c'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = done ? '#ffe9b0' : '#e6d6b6'; ctx.textAlign = 'center';
      ctx.fillText(done ? '마을 회관 — 클릭=재고' : `${_shel ? '공용 쉼터' : '마을 회관'} 터 ${st}/3단계 (클릭=시공)`, x, y - (done ? 48 : 14));
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'guild_granary' || type === 'granary') {
      // ★고상곳간 앵커 — 몸체는 _granC 통짜 스프라이트(에셋 2차)가 대체: 표석 폐지, 라벨만(지붕 위)
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center';
      ctx.fillText(type === 'guild_granary' ? '길드 곳간' : '곳간', x, y - 56);
      ctx.textAlign = 'left';
      return;
    }
    if (type === 'farmland') {
      // 갈색 흙 다이아 + 작물
      const data = building?.data || {};
      if (data.sim) {
        // §4-4 Stage 4A: 마을 시뮬 경작지(비영속 타일) — 성장 게이지·'수확가능' 라벨 없음
        //   (마을 소유 — 플레이어 수확 대상이 아니다).
        // ★[T97 · PM 판정] 여기 있던 **벡터 띠 층을 지웠다.** 마름모 + 이랑 2줄(밭) 또는
        //   물빛 + 모 3포기(논)를 코드가 그리고 있었는데, 그건 플레이어 밭과 **다른 그림**이었다 —
        //   같은 '경작지'가 소유자에 따라 달리 보이면 정본이 둘이다(T67 캐논).
        //   ⇒ 플레이어 밭과 **같은 8군 타일**을 쓴다. 단계는 옛 벡터가 그리던 것을 그대로 옮긴다:
        //     밭(dry) = 이랑만 그렸다 → 단계 0(갈은 흙) · 논 = 물 + 모 3포기 → 단계 1(어린싹).
        //     작물이 없으면 `cropSprite` 가 곡물(벼)로 떨어진다 — 논에 맞는 기본값이다.
        //   ⓘ 옛 주석은 "셀 꽉 채워 띠가 이어져 보임" 이라 했지만 실측은 아니었다 —
        //     그 마름모는 `x±16, y±8`, **반 칸**이다(셀 다이아는 64×32). 띠는 원래도 안 이어졌다.
        //     타일 이음새 실측표는 보고 T97 §0-ⓒ 에 있다(회부 — 밭 타일 세계 패스 재굽기).
        const _sc = cropSprite(data.dry ? 0 : 1, data.crop);
        if (_sc) {
          ctx.drawImage(_sc, x - _sc._ox, y - _sc._oy);   // ★[T101] 앵커 정본 · 델타 0
        } else {
          drawPropPending(x, y);
        }
        return;
      }
      const readyAt = data.readyAt || 0;
      const now = Date.now();
      const isReady = now >= readyAt;
      const growProgress = readyAt > data.plantedAt ? Math.min(1, (now - data.plantedAt) / (readyAt - data.plantedAt)) : 1;
      // 에셋 5차: 4단계 3D 스프라이트(갈은 흙/어린싹/자람/익음). 미로드 시 아래 벡터 렌더 폴백.
      {
        const _st = isReady ? 3 : Math.min(2, Math.floor(growProgress * 3));
        const _cs = cropSprite(_st, data.crop);   // ★[T79c] 심긴 작물로 고른다(빈 밭이면 null → 곡물)
        if (_cs) {
          ctx.fillStyle = 'rgba(0,0,0,0.30)';
          ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.drawImage(_cs, x - _cs._ox, y - _cs._oy);   // ★[T101] 앵커 정본 · 델타 0
          if (isReady) {
            ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
            ctx.fillStyle = '#9adb6e'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
            ctx.strokeText('수확가능', x, y - 20); ctx.fillText('수확가능', x, y - 20);
            ctx.textAlign = 'start';
          }
          return;
        }
      }
      // ★★[T95] 몸체 벡터를 지웠다. 농지의 몸은 **밭 스프라이트**다(T79c 8군 × 4단계) —
      //   위 `cropSprite` 절이 그리고, 못 그리면 여기서 **점선 빈 칸**이다(T66 규약).
      //   종전의 흙 다이아 + 초록 막대 + 빨간 베리는 8군 세트가 오기 전의 대역이었고,
      //   지금 남겨 두면 스프라이트와 **다른 그림**이 같은 물건을 그리는 자리가 된다.
      drawPropPending(x, y);
      if (isReady) {                       // 라벨은 몸체가 아니라 **상태**다 — 남긴다(T67 모닥불 불꽃과 같은 판단)
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#9adb6e';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2;
        ctx.strokeText('수확가능', x, y - 16);
        ctx.fillText('수확가능', x, y - 16);
        ctx.textAlign = 'start';
      }
      return;
    }
    if (type === 'wall') {
      // ★[T67] 몸체 = 스프라이트(굴립주 통나무 벽 2m). 방향 변형 둘뿐이다 —
      //   서버가 이웃을 안 보고 `data.side ∈ {N,E}` 만 준다(§0-ⓑ 실측). '끝/중간' 변형은 없다.
      //   이음새는 변형이 아니라 **모델이 셀 경계에서 끝나게** 해서 맞춘다.
      const damaged = !!building?.data?.damaged;   // Phase 14.33 — 부서진 벽은 반투명(상태는 코드)
      const _pa = ctx.globalAlpha;
      if (damaged) ctx.globalAlpha = _pa * 0.45;
      if (!drawPropBody((building?.data?.side || 'N') === 'N' ? 'wall_n' : 'wall_e', x, y)) drawPropPending(x, y);
      ctx.globalAlpha = _pa;
    } else if (type === 'floor') {
      // ★움집 실내(컷어웨이로만 도달 — 밖에선 지붕 스킨이 억제): 다짐흙 바닥 + 정본 가구.
      //   침대 6 = BEDO 앵커 상대 [[-4,-4],[-3,-4],[-2,-4],[-1,-4],[-4,-3],[-1,-3]](랩 정본 — 1인 1침대 고증, HOME_SLOTS와 같은 사상)
      //   화덕 = (-2,-3)(수혈주거 중앙 노지 고증). 앵커: 건물=[cx-5..cx+0]×[cy-5..cy-2] → cx=x1·cy=y1+2.
      //   시각 전용(durango-consistency: 물리 실체 침대→리스폰·NPC 취침 연동은 생활 층 이관 묶음).
      if (building?.data?.hut && _tileHutC) {
        const _h = building.data.hut;
        ctx.drawImage(_tileHutC, x - 32, y - 16);
        const _dx = Math.floor(building.x / 32) - _h[2], _dy = Math.floor(building.y / 32) - (_h[3] + 2);
        const _bed = (_dy === -4 && _dx >= -4 && _dx <= -1) || (_dy === -3 && (_dx === -4 || _dx === -1));
        // ★[T97] 실내 둘도 다른 가구와 같은 결 — **몸체는 스프라이트**다.
        //   침상·화덕은 서버 건물 행이 아니라(§0-ⓑ) `props_render.py DECOR` 표가 굽는다.
        if (_bed) {
          if (!drawPropBody('bed', x, y)) drawPropPending(x, y);
        } else if (_dx === -2 && _dy === -3) {
          // ★잉걸빛은 **코드가 얹는 상태**다 — 모닥불 불꽃과 같은 경계(T67 ⓒ).
          //   불이 든 화덕과 꺼진 화덕이 같은 몸이어야 하므로 발광은 모델에 굽지 않는다.
          const _g = ctx.createRadialGradient(x, y, 2, x, y, 26);
          _g.addColorStop(0, 'rgba(255,150,60,0.35)'); _g.addColorStop(1, 'rgba(255,150,60,0)');
          ctx.fillStyle = _g; ctx.beginPath(); ctx.ellipse(x, y, 26, 13, 0, 0, Math.PI * 2); ctx.fill();
          if (!drawPropBody('hearth', x, y)) drawPropPending(x, y);
          ctx.fillStyle = '#ff9a4a'; ctx.fillRect(x - 2, y - 2, 4, 3);     // 잉걸 — 상태
          ctx.fillStyle = '#ffd27a'; ctx.fillRect(x - 1, y - 1, 2, 1);
        }
        return;
      }
      // ★[T95] 몸체 = 스프라이트(다짐 바닥 한 칸 · `BUILDING_HEIGHT.floor = 4px`).
      //   종전 다이아는 셀을 꽉 채운 **단색 판**이라 흙이 다져진 느낌이 없었다.
      if (!drawPropBody('floor', x, y)) drawPropPending(x, y);
      // ★층 표시는 **몸체가 아니라 진단**이다(14.49-e7ak DEBUG). 몸체를 스프라이트로 옮기면서
      //   단색 칠을 없앴으니, 층 단서는 **테두리 한 줄**로 남긴다 — 정보는 지키고 몸은 하나다.
      {
        const fl = building?.floor ?? building?.data?.floor ?? 0;
        if (fl > 0) {
          ctx.strokeStyle = fl === 1 ? 'rgba(255,138,60,0.85)' : 'rgba(230,58,58,0.85)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y - 16); ctx.lineTo(x + 32, y); ctx.lineTo(x, y + 16); ctx.lineTo(x - 32, y);
          ctx.closePath(); ctx.stroke();
        }
      }
    } else if (type === 'door') {
      // ★[T67] 몸체 = 스프라이트. **열림도 몸체다** — 종전의 '1/4 높이 반투명'은 폐지했다.
      //   열린 문은 문짝을 들어낸 **빈 문틀**로 굽는다(청동기 문엔 경첩이 없다 — 새끼를 풀어 들어낸다).
      //   ⇒ 방향 2 × 열림/닫힘 2 = 4장. 코드가 얹는 상태는 없다.
      const _dsN = (building?.data?.side || 'N') === 'N';
      const _dop = !!building?.data?.open;
      if (!drawPropBody(_dsN ? (_dop ? 'door_n_open' : 'door_n') : (_dop ? 'door_e_open' : 'door_e'), x, y)) drawPropPending(x, y);
    } else if (type === 'chest') {
      // ★[T67] 몸체 = 스프라이트. 거래소 상자는 **같은 모델의 변형**이다(붉은 안료 띠 + 청동 못머리) —
      //   색을 코드로 칠하면 인벤 아이콘과 갈리므로, 몸은 굽고 **떠 있는 이름표만** 코드가 얹는다.
      const isExchange = building?.data?.isExchange === true;   // Phase 4d-2: 거래소 chest 식별
      const village = building?.data?.village || null;
      if (!drawPropBody(isExchange ? 'chest_exchange' : 'chest', x, y)) drawPropPending(x, y);
      // 거래소 라벨 — 마을 이름 floating
      if (isExchange && village) {
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        // 배경 박스
        const txt = `${village}`;
        const w = ctx.measureText(txt).width + 8;
        ctx.fillStyle = 'rgba(40,30,15,0.85)';
        ctx.fillRect(x - w/2, y - 32, w, 16);
        ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1;
        ctx.strokeRect(x - w/2, y - 32, w, 16);
        // 텍스트
        ctx.fillStyle = '#ffe8a0';
        ctx.fillText(txt, x, y - 20);
        ctx.textAlign = 'start';
      }
    } else if (type === 'fence') {
      // ★[T67] 몸체 = 스프라이트. `data.orientation ∈ {NS,EW}` 둘뿐(§0-ⓑ 실측).
      //   말뚝을 **셀 경계**(축 ±0.5셀)에 세워 구웠으므로 이웃 칸 말뚝과 같은 자리에 서서 이음새가 맞는다.
      //   ⚠종전 벡터의 방향 표시선은 화면 가로/세로로 그어 **아이소 축과 어긋나 있었다**
      //     (월드 (1,0) 은 화면 (32,16) 인데 (32,0) 으로 그었다). 스프라이트가 그것도 바로잡는다.
      if (!drawPropBody((building?.data?.orientation || 'NS') === 'EW' ? 'fence_ew' : 'fence_ns', x, y)) drawPropPending(x, y);
    } else if (type === 'stair') {
      // ★★[T95] 몸체 = 스프라이트. 종전엔 **24 소단을 프레임마다 벡터로 그렸다**
      //   (3칸 × 8소단 · 슬랩마다 네 귀를 계산하고 챌판 선까지). 그 수치를 그대로 모델로 옮겨 구웠다:
      //     소단 24 · 칸당 8 · 소단 깊이 0.125m(4px) · 폭 1칸 · 높이 0→2m(0→64px) · 원점 = 칸 0 중심.
      //   방향 변형 넷 — 서버가 `data.dir ∈ {N,E,S,W}` 를 준다(§0-ⓑ 실측).
      //   ⚠벽·문과 달리 계단은 **N 과 S 가 다른 그림**이다(오르는 쪽이 반대다) — 둘이 아니라 넷인 이유.
      const _sd = (building?.data?.dir || 'N').toLowerCase();
      if (!drawPropBody('stair_' + _sd, x, y)) drawPropPending(x, y);
    } else if (type === 'workbench') {
      // ★[T67] 몸체 = 스프라이트. 종전 발판 도형(통나무 다리 + 널 상판 fillRect)을 걷었다 —
      //   그때 주석이 예고한 "자연물·건물 정본 에셋으로 교체"가 이 카드다.
      if (!drawPropBody('workbench', x, y)) drawPropPending(x, y);
    } else if (type === 'drying_rack') {
      // ★[T67] 몸체 = 스프라이트. 널린 것도 **몸체에 굽는다** — 서버에 건조대 내용물이 없다
      //   (`facility.js` 는 거리 판정뿐 · §0-ⓒ 실측). 상태가 아니면 코드가 들 이유가 없다.
      //   ⚠종전의 바람 흔들림(±0.9px)은 함께 사라진다 — 기록해 둔 맞바꿈이다(보고 ⓒ).
      if (!drawPropBody('drying_rack', x, y)) drawPropPending(x, y);
    } else if (type === 'salt_kiln') {
      // ★★[T67] **신규 분기.** 자염 배치가 서버에 소금가마를 세웠는데 클라 `drawBuildingIso` 에
      //   분기가 없었다 — 폴백도 없어서 **지어도 화면에 아무것도 없었다**(족보 67 함정 재발 · §0 실측).
      if (!drawPropBody('salt_kiln', x, y)) drawPropPending(x, y);
    } else if (type === 'campfire') {
      // ★[T67] 몸체(화덕돌·재·탄 장작) = 스프라이트 · **불꽃은 코드가 얹는다**(흔들려야 한다).
      //   몸체 10px + 불꽃 10px = 서버 `BUILDING_HEIGHT.campfire`(20px). 불꽃 밑동을 몸체 꼭대기에 맞춘다.
      if (!drawPropBody('campfire', x, y)) drawPropPending(x, y);
      const FB = y - 10;                       // 불꽃 밑동 = 몸체 꼭대기
      const tt = performance.now() * 0.008;
      const flicker = Math.sin(tt) * 1.5;
      ctx.fillStyle = '#ff6a2a';
      ctx.beginPath();
      ctx.moveTo(x - 4, FB);
      ctx.quadraticCurveTo(x - 2.5 + flicker, FB - 7, x, FB - 10);
      ctx.quadraticCurveTo(x + 3.5 + flicker, FB - 6.5, x + 4, FB);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffce4a';
      ctx.beginPath();
      ctx.moveTo(x - 1.6, FB - 0.6);
      ctx.quadraticCurveTo(x + flicker, FB - 5, x + 0.8, FB - 7.6);
      ctx.quadraticCurveTo(x + 2.4 + flicker, FB - 4.6, x + 2.4, FB - 0.6);
      ctx.closePath(); ctx.fill();
    } else if (type === 'siege_camp') {
      // Phase 14.5 — 공성 캠프: 텐트(삼각 천막)
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x, y + 5, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      // 텐트 본체 (삼각)
      ctx.beginPath();
      ctx.moveTo(x, y - 20);
      ctx.lineTo(x + 16, y + 4);
      ctx.lineTo(x - 16, y + 4);
      ctx.closePath();
      ctx.fillStyle = '#7a5a3a'; ctx.fill();
      ctx.strokeStyle = '#3a2818'; ctx.lineWidth = 1; ctx.stroke();
      // 입구 (어두운 사다리꼴)
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 4);
      ctx.lineTo(x + 4, y + 4);
      ctx.lineTo(x + 2, y - 8);
      ctx.lineTo(x - 2, y - 8);
      ctx.closePath();
      ctx.fillStyle = '#2a1a0a'; ctx.fill();
      // 깃발 — 상단
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 28); ctx.stroke();
      ctx.fillStyle = '#c83a3a';
      ctx.beginPath();
      ctx.moveTo(x, y - 28); ctx.lineTo(x + 7, y - 25); ctx.lineTo(x, y - 22); ctx.closePath();
      ctx.fill();
      // 만료까지 남은 시간 (작은 게이지)
      const exp = building?.data?.expiresAt;
      if (exp) {
        const remain = Math.max(0, exp - Date.now());
        const pct = Math.min(1, remain / (10 * 60 * 1000));
        ctx.fillStyle = '#222'; ctx.fillRect(x - 12, y + 8, 24, 2);
        ctx.fillStyle = pct > 0.3 ? '#9adb6e' : '#c83a3a'; ctx.fillRect(x - 12, y + 8, 24 * pct, 2);
      }
    }
  }
