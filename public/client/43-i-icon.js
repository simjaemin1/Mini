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
  const ITEM_LABEL = {
    pillar: '기둥', rafter: '서까래', thatch: '이엉',   // ★건축 중간재
    berry: '베리', fiber: '풀', meat_raw: '날고기', meat_cooked: '구운고기',
    hide: '가죽', berry_jam: '베리잼', water_bottle: '물병',
    seed_berry: '베리씨앗', herb: '약초', ore: '광물',
    food: '곡식', food_cooked: '익힌 곡식', fish: '생선', fish_cooked: '구운생선',   // ★[곡물 품목화 2026-08-27]
    twig: '잔가지', pebble: '자갈',   // ★[빈손 시작 2026-08-28] 땅에서 줍는 것
    crude_axe: '조잡한 돌도끼', crude_pick: '조잡한 돌괭이', crude_blade: '조잡한 돌칼',
    ore_chunk: '원석(kg·미확인)',   // ★[11차] 캔 것은 정체를 모른다 — 마을에서 선광(O키)해야 광석/맥석이 갈린다. 덩이 크기가 숙련마다 달라 **kg 단위**로 센다
    // ★[2026-08-02 야금 사슬] 라벨이 없으면 인벤 창에 **영문 키가 그대로** 뜬다(ITEM_LABEL[k] || k).
    iron_ore: '철 정광', charcoal: '숯', meteoric_iron: '운철(隕鐵)', lead: '납', nickel: '니켈',
    iron: '철', copper: '구리', tin: '주석', coal: '석탄', jade_raw: '옥 원석',   // ★[2026-08-02d] iron=제련 금속(정광은 iron_ore='철 정광')
    marble: '대리석', tungsten: '텅스텐', gold: '금', silver: '은',
    wood: '통나무', plank: '판자', stone: '돌',
    item_wall: '벽', item_floor: '바닥', item_door: '문', item_fence: '울타리',
    item_stair: '계단', item_chest: '상자', item_campfire: '모닥불', item_farmland: '농지', item_workbench: '작업대',
    // ★[부패·보존 배치 2026-08-31]
    item_drying_rack: '건조대',
    dried_fish: '건어물', dried_fruit: '말린 과실', smoked_meat: '훈제육', pickled_veg: '절임', salt: '소금',
  };

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
      ITEM_LABEL[c.id] = c.ko;    ITEM_LABEL['seed_' + c.id] = c.ko + ' 씨앗';
      // ★렌더 PNG 가 없다 → 이모지 폴백으로 보낸다(안 넣으면 404 · `e2e-nature` 가 잡는다)
      ICON_NO_RENDER.add(c.id);   ICON_NO_RENDER.add('seed_' + c.id);
    }
  }

