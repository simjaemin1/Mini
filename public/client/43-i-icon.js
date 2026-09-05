// @@split:43-i-icon — I — 아이템 아이콘·이름표 표·작물 페이로드 적용 (T53 ③)
  // === HUD ===
  // 음식 아이콘 매핑 (인벤토리 표시 + 클릭 시 'eat' 송신)
  // ★★[T66 2026-09-03 · 재민 확정 4·5] **아이템 이모지 표를 지웠다.**
  //   "모든 아이템은 그림이 하나다" — 인벤·조합법·바닥·거래소·창고 어디서나 **같은 렌더 PNG** 다.
  //   렌더가 없으면 **이모지가 아니라 점선 빈 칸**("렌더 없음")을 그린다. 그래야 무엇을 구워야 하는지
  //   화면이 스스로 말한다 — 이모지로 메우면 빈 자리가 영원히 안 보인다(그게 지금까지였다).
  //   ⚠`ITEM_ICONS` 를 쓰던 자리는 전부 `itemPic()` 하나로 모았다(아래).
  //   ⚠**아이콘 키 목록**은 이제 서버 이름표(`ITEM_LABEL_SRV`)와 렌더 파일이 정한다 — 클라 표 0.

  // === 에셋 5차: 인벤 아이콘 3D 렌더(Blender icon_render.py) ===
  // /assets/icons/<key>.png (96×96 알파, 자연물과 동일 씬·조명). 로드 성공한 키만 이미지로 교체 —
  // 실패/미배포 시 위 이모지가 그대로 폴백이라 어느 쪽이든 UI가 비지 않는다.
  const ITEM_ICON_IMG = {};
  let _iconImgLoaded = 0;
  // ★[시설 제작창 2026-08-29] **아직 렌더가 없는 키** — 이모지 폴백으로 간다.
  //   여기 없는 키는 전부 `/assets/icons/<key>.png` 가 있다는 규약이라(37종 중 36종 실재 확인),
  //   목록에 안 적고 두면 **404 가 난다** — `e2e-nature` 가 "자산 요청 404 없음"으로 그걸 잡는다(실제로 잡았다).
  //   ⚠교체 예정: 작업대 아이콘은 Blender `icon_render.py` 로 뽑아 이 목록에서 빼면 된다(회부: 시설 스프라이트).
  //   ★[보존 배치 2026-08-31] 건조대·보존식 4종·소금도 아직 렌더가 없다 — **여기 안 적으면 404 다**
  //     (`e2e-nature` 가 "자산 요청 404 없음"으로 잡는다. 앞 배치가 실제로 그 자리를 밟았다.)
  // ★★[T66] **구운 렌더의 목록**(`/assets/icons/*.png`). 종전엔 반대로 "렌더 없는 키" 목록이었는데,
  //   T66 이 구울 키의 정본을 서버 이름표(300키)로 바꾸면서 그 방식이 **404 폭탄**이 됐다
  //   (없는 것을 세는 목록으론 300키를 감당 못 한다 — 실측: 콘솔 404 191건).
  //   ⇒ **있는 것을 센다.** 여기 없는 키는 아예 요청하지 않고 곧장 점선 빈 칸이다.
  //   ⚠이 목록은 디렉터리의 **사본**이다. 그래서 검사로 못 박는다:
  //     `test-itemlabel` 이 `ls public/assets/icons` 와 이 집합이 **같은지** 잰다 — 어긋나면 빨강.
  //     (ART 카드가 렌더를 구우면 이 줄과 그 검사가 같이 갱신된다.)
  const ICON_RENDERED = new Set([
    'berry', 'berry_jam', 'charcoal', 'copper', 'fiber', 'gold',
    'herb', 'hide', 'iron', 'iron_ore', 'item_campfire', 'item_chest',
    'item_door', 'item_drying_rack', 'item_farmland', 'item_fence', 'item_floor',
    'item_salt_kiln', 'item_stair', 'item_wall', 'item_workbench',   // ★[T67 리베이스] 새로 구운 셋
    'jade_raw', 'lead', 'meat_cooked', 'meat_raw', 'meteoric_iron', 'nickel',
    'ore', 'ore_chunk', 'pillar', 'plank', 'rafter', 'seed_berry',
    'silver', 'stone', 'thatch', 'tin', 'water_bottle', 'wood',
    // ★★[T72 리베이스 · 아이콘 1차] 도구 일곱 · 손에 드는 것 여섯. T72 가 굽고 **배선을 T66 으로 회부**했다
    //   (`test-icons ⑤`). 여기 오르는 순간 `itemPic` 이 어디서나 그 그림을 쓴다 — 점선 칸이 그림으로 바뀐다.
    'axe', 'brine', 'carrier', 'crude_axe', 'crude_blade', 'crude_pick',
    'fish', 'fish_cooked', 'pebble', 'pickaxe', 'salt', 'sword', 'twig',
    // ★[T76 리베이스 · 아이콘 2차] 보존식 여섯 · 갯벌 넷 · 어종 여덟.
    'abalone', 'carp', 'cod', 'crab', 'dried_fish', 'dried_fruit',
    'dried_oyster', 'dried_seaweed', 'fresh_water', 'herring', 'oyster',
    'pickled_veg', 'pollock', 'salmon', 'seaweed', 'shrimp', 'smoked_meat', 'trout',
    // ★[T79 · 작물 아이콘 a] 수확물 14 + 씨앗 14. 씨앗은 서버가 **다른 품목 id** 로 갖는다
    //   (`crops.js` 의 SEED_PREFIX) — 그래서 키가 따로다. 그림도 따로다:
    //   수확물은 이삭·꼬투리(줄기가 붙어 있다) · 씨앗은 **토기 접시에 담긴 알곡 한 줌**.
    'adlay', 'azuki', 'barley', 'barnyard_millet', 'buckwheat', 'foxtail_millet',
    'millet', 'mungbean', 'perilla', 'rice', 'sesame', 'sorghum', 'soybean', 'wheat',
    'seed_adlay', 'seed_azuki', 'seed_barley', 'seed_barnyard_millet', 'seed_buckwheat',
    'seed_foxtail_millet', 'seed_millet', 'seed_mungbean', 'seed_perilla', 'seed_rice',
    'seed_sesame', 'seed_sorghum', 'seed_soybean', 'seed_wheat',
    // ★[T79b · 작물 아이콘 b] 채소 9 · 양념 3 · 박과 2 · 특용 4 · 구황 2 + 씨앗 20.
    //   ⓘ 마늘·생강·토란·마는 씨앗으로 안 심는다 — 쪽·뿌리줄기·덩이다. 키는 서버 정본대로 두고
    //     그림만 실물을 따랐다(접시 문법을 그 넷만 깬다 · 보고 §0-ⓒ).
    //   ⓘ 특용 4종(삼·쪽·뽕·차)은 비식품이지만 씨앗은 서버에 실재한다 — 야생 채종이 34종을 다 낸다.
    'cabbage', 'chive', 'cucumber', 'curled_mallow', 'eggplant',
    'garlic', 'ginger', 'gourd', 'hemp_plant', 'indigo_plant',
    'korean_melon', 'lettuce', 'mulberry_leaf', 'radish', 'scallion',
    'taro', 'tea', 'turnip', 'water_dropwort', 'yam',
    'seed_cabbage', 'seed_chive', 'seed_cucumber', 'seed_curled_mallow', 'seed_eggplant',
    'seed_garlic', 'seed_ginger', 'seed_gourd', 'seed_hemp_plant', 'seed_indigo_plant',
    'seed_korean_melon', 'seed_lettuce', 'seed_mulberry_leaf', 'seed_radish', 'seed_scallion',
    'seed_taro', 'seed_tea', 'seed_turnip', 'seed_water_dropwort', 'seed_yam',
  ]);
  // ★★[T66 2차 · 재민 확정 2026-09-03] 옛 **거부 목록** `ICON_NO_RENDER` 은 **없앴다** — 뒤집혔다.
  //   종전: "여기 있으면 렌더가 없다"(빠뜨리면 404). 지금: `ICON_RENDERED` 에 **있으면 그림, 없으면 점선 칸**.
  //   ⇒ 새로 구운 키를 "거부 목록에서 빼는" 일이 사라졌다. 오직 **위 목록에 더하는 것 하나**이고,
  //     그 목록이 `public/assets/icons/` 와 같은지는 `test-itemlabel ⑪` 이 잠근다(파일명 규약 `<key>.png`).
  //   아래 껍데기는 옛 이름을 부르는 자리 하나(작물 등록)를 위해 남긴다 — 더하는 일은 **무의미**하다.
  const ICON_NO_RENDER = { has: (k) => !ICON_RENDERED.has(k), add: () => {} };
// @@moved:12454
  function itemIconImg(k) {
    const im = ITEM_ICON_IMG[k];
    return (im && im.complete && im.naturalWidth > 0) ? im : null;
  }
  // ★★[T66] **물건 그림은 함수 하나다.** 인벤 · 조합법 · 바닥 · 거래소 · 창고가 전부 이걸 부른다.
  //   있으면 `/assets/icons/<key>.png` 렌더, 없으면 **점선 빈 칸**. 이모지는 없다(재민 확정 4·5).
  function itemPic(k, px) {
    const s = px || 20;
    const im = itemIconImg(k);
    if (im) return `<img class="item-pic" src="${im.src}" width="${s}" height="${s}" alt="" title="${k}">`;
    return `<span class="item-pic-none" style="width:${s}px;height:${s}px" title="${k} — 렌더 없음"></span>`;
  }
  // DOM(innerHTML)용 — 옛 이름. 셋째 인자(이모지 폴백)는 이제 **무시한다**(부르는 자리를 다 고치지 않으려고 남긴다).
  function itemIconHtml(k, px, _fbIgnored) { return itemPic(k, px); }
  // 캔버스용(바닥 낙하물) — 같은 PNG. 없으면 **점선 네모** 하나(같은 뜻을 캔버스 문법으로).
  function drawItemIcon(ctx, k, sx, sy, px) {
    const s = px || 18;
    const im = itemIconImg(k);
    if (im) { ctx.drawImage(im, sx - s / 2, sy - s / 2, s, s); return; }
    ctx.save();
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line-2').trim() || '#4a4a4a';
    ctx.strokeRect(Math.round(sx - s / 2) + 0.5, Math.round(sy - s / 2) + 0.5, s - 1, s - 1);
    ctx.restore();
  }
  // ★★[T61 2026-09-03] **클라 이름표 사본을 지웠다.** 종전엔 55키 표가 여기 있었다.
  //   T55 가 정본을 `welcome.itemLabels` 로 실어 보내면서 이 표는 폴백이 됐고, T61 이 그 폴백마저 없앴다.
  //   ⇒ **정본 하나.** 사본이 살아 있으면 언젠가 읽히고, 그날 화면과 서버가 갈린다(T38·자염·갯벌이 그 셋이다).
  //   사본에만 있던 20키(광물 12 · 건축물 8)는 **서버 표에 흡수**했다 — `server/itemlabel.js` 가
  //   `specialty.RESOURCES[k].ko` 와 `BUILDING_RECIPES[k].label` 에서 **끌어온다**(옮겨 적지 않는다).
  //   실측: 옛 사본 55키 전부가 새 표에 있고 **글자가 하나도 안 달라진다**(보고 §0-ⓒ 표).


  // ★★[T55 2026-09-02 · T61 2026-09-03] **이름표 정본은 서버다** — 그리고 이제 **그것뿐이다**.
  //   `welcome.itemLabels`(실측 300키) 가 여기 담긴다. 폴백은 없다: 표가 안 오면 영문 키가 그대로 뜨고,
  //   그게 옳다 — 조용히 낡은 사본을 읽는 것보다 **틀린 게 보이는 편**이 낫다.
  let ITEM_LABEL_SRV = null;
  // ★econ 자원 종류 이름(장마당 시세표 열) — `welcome.categoryLabels`. 정본 `server/itemlabel.js`.
  let CATEGORY_KO_SRV = null;
  // ★[T66 ⓪] 직업·계절 이름 정본(`welcome.uiLabels`). 클라 사본 둘(JOB_KR·SEASON_KO)은 지웠다.
  let UI_LABELS_SRV = null;
  function seasonKo(k) { return (UI_LABELS_SRV && UI_LABELS_SRV.seasons && UI_LABELS_SRV.seasons[k]) || k; }
  function jobKo(k) { return (UI_LABELS_SRV && UI_LABELS_SRV.jobs && UI_LABELS_SRV.jobs[k]) || k; }

  // ★★[작물 층 2026-08-31] 작물 표는 **서버가 준다**(`welcome.crops`) — 클라가 표를 들지 않는다.
  //   이름표·아이콘·심기 메뉴가 전부 이 페이로드에서 파생된다(무게·원장과 같은 규약).
  const CROP_BY_ID = {};          // id → 작물
  const CROP_OF_SEED = {};        // seed_<id> → 작물
  // ★계절은 **이미 오는 달력에서 읽는다**(`msg.calendar.season` — econ 정본 파생).
  //   계절을 따로 받으면 그게 사본이고, 달력과 어긋나는 날이 온다.
  function cropSeasonNow() { return (myCalendar && myCalendar.season) || 'spring'; }
  // ★[T66 ⓪] `SEASON_KO` 사본 삭제 — 정본은 `events.KO_SEASON`(welcome.uiLabels.seasons · 위 `seasonKo`).
  function applyCropPayload(list) {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      CROP_BY_ID[c.id] = c; CROP_OF_SEED['seed_' + c.id] = c;
      // ★[T79c] 밭 스프라이트가 **작물의 군**으로 고른다 — 서버가 이미 실어 준 `group` 을 넘겨준다.
      //   표를 옮겨 적는 게 아니라 **받은 것을 그대로** 꽂는다(족보 79).
      if (typeof CROP_SPR === 'object' && CROP_SPR && CROP_SPR._of) CROP_SPR._of[c.id] = c.group;
      // ★[T61] 작물 이름표도 **정본 표에** 얹는다(사본이 없어졌으니 갈 데가 하나다).
      if (ITEM_LABEL_SRV) { ITEM_LABEL_SRV[c.id] = c.ko; ITEM_LABEL_SRV['seed_' + c.id] = c.ko + ' 씨앗'; }
      // ★[T66 2차] 작물은 아직 안 구웠다 ⇒ **아무것도 안 해도** 점선 칸이 된다(목록에 없으니까).
      //   종전엔 여기서 거부 목록에 넣어야 404 를 면했다. 이제 404 는 구조적으로 못 난다 —
      //   요청은 `ICON_RENDERED` 에 있는 키에만 나가고, 그 목록은 디렉터리와 같다.
      //   ⇒ 이 두 줄은 **무동작**이다. 굽는 날 위 목록에 키를 더하면 그날 바로 그림이 뜬다.
    }
  }

