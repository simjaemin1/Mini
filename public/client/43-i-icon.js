// @@split:43-i-icon — I — 아이템 아이콘·이름표 표·작물 페이로드 적용 (T53 ③)
  // === HUD ===
  // 음식 아이콘 매핑 (인벤토리 표시 + 클릭 시 'eat' 송신)
  const ITEM_ICONS = {
    pillar: '🪵', rafter: '🥢', thatch: '🌾',   // ★건축 중간재(움집 고증 공정)
    berry: '🫐', fiber: '🌾', meat_raw: '🥩', meat_cooked: '🍗',
    hide: '🦌', berry_jam: '🍯', water_bottle: '🥤',
    seed_berry: '🌱', herb: '🌿', ore: '⛏️',
    // 14.50: 목공 자원
    wood: '🪵', plank: '🪚', stone: '🪨',
    // ★[2026-08-02] 야금 — 아이콘이 없으면 인벤 창에 기본 📦 가 뜬다(itemIconHtml 폴백)
    ore_chunk: '🪨', iron_ore: '⚙️', charcoal: '🌑', meteoric_iron: '☄️',
    iron: '⚙️', copper: '🟠', tin: '⚪', lead: '⬜', silver: '🥈', gold: '🥇', nickel: '⚪', jade_raw: '🟢',
    // 14.51: 건축물 아이템 (인벤에 들어가는 형태)
    item_wall: '🧱', item_floor: '⬜', item_door: '🚪', item_fence: '🪵',
    item_stair: '🪜', item_chest: '📦', item_campfire: '🔥', item_farmland: '🌱', item_workbench: '🪚',
    // ★[부패·보존 배치 2026-08-31] 건조대 + 보존식 4종 + 소금
    item_drying_rack: '🧺',
    dried_fish: '🐟', dried_fruit: '🍇', smoked_meat: '🥓', pickled_veg: '🫙', salt: '🧂',
  };
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
  const ICON_NO_RENDER = new Set(['item_workbench', 'item_drying_rack',
    'dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg', 'salt']);
// @@moved:12454
  function itemIconImg(k) {
    const im = ITEM_ICON_IMG[k];
    return (im && im.complete && im.naturalWidth > 0) ? im : null;
  }
  // DOM(innerHTML)용 — 이미지 있으면 <img>, 없으면 이모지(그것도 없으면 fb)
  function itemIconHtml(k, px, fb) {
    const s = px || 20;
    const im = itemIconImg(k);
    if (im) return `<img class="item-icon" src="${im.src}" width="${s}" height="${s}" alt="" style="vertical-align:middle;display:inline-block">`;
    return (ITEM_ICONS && ITEM_ICONS[k]) || fb || '📦';
  }
  // 캔버스용 — 이미지 있으면 drawImage, 없으면 이모지 fillText (중심 정렬 동일)
  function drawItemIcon(ctx, k, sx, sy, px) {
    const s = px || 18;
    const im = itemIconImg(k);
    if (im) { ctx.drawImage(im, sx - s / 2, sy - s / 2, s, s); return; }
    const icon = (ITEM_ICONS && ITEM_ICONS[k]) || '📦';
    ctx.font = Math.round(s * 0.9) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(icon, sx, sy);
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

  // ★★[작물 층 2026-08-31] 작물 표는 **서버가 준다**(`welcome.crops`) — 클라가 표를 들지 않는다.
  //   이름표·아이콘·심기 메뉴가 전부 이 페이로드에서 파생된다(무게·원장과 같은 규약).
  const CROP_BY_ID = {};          // id → 작물
  const CROP_OF_SEED = {};        // seed_<id> → 작물
  // ★계절은 **이미 오는 달력에서 읽는다**(`msg.calendar.season` — econ 정본 파생).
  //   계절을 따로 받으면 그게 사본이고, 달력과 어긋나는 날이 온다.
  function cropSeasonNow() { return (myCalendar && myCalendar.season) || 'spring'; }
  const SEASON_KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
  function applyCropPayload(list) {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      CROP_BY_ID[c.id] = c; CROP_OF_SEED['seed_' + c.id] = c;
      ITEM_ICONS[c.id] = c.emoji; ITEM_ICONS['seed_' + c.id] = '🌰';
      // ★[T61] 작물 이름표도 **정본 표에** 얹는다(사본이 없어졌으니 갈 데가 하나다).
      if (ITEM_LABEL_SRV) { ITEM_LABEL_SRV[c.id] = c.ko; ITEM_LABEL_SRV['seed_' + c.id] = c.ko + ' 씨앗'; }
      // ★렌더 PNG 가 없다 → 이모지 폴백으로 보낸다(안 넣으면 404 · `e2e-nature` 가 잡는다)
      ICON_NO_RENDER.add(c.id);   ICON_NO_RENDER.add('seed_' + c.id);
    }
  }

