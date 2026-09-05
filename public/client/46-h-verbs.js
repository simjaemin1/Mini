// @@split-added:46-h-verbs — H — 커서 밑을 고르는 함수 하나(`pickAt`) + 대상 위 동사 메뉴 (T68)
//
// ★★왜 이 파일이 생겼나 [재민 확정 2026-09-03 · 캐논 §2]
//   *"먹이기도 지금 무슨 명령어인 것처럼 되어 있는데 — 누군가 와서 죽은 사람한테 우클릭 누르면
//     메뉴가 나타나면서 먹이기 또는 업기가 있어야지."*
//   동사는 **명령어가 아니라 대상 위에 뜬다**. 그러자면 먼저 "커서 밑에 무엇이 있나"를
//   아는 함수가 하나 있어야 한다 — 그게 `pickAt` 이고, 종전엔 좌클릭 핸들러 안에
//   **줄줄이 늘어선 사슬**로만 있었다(30-n-net 의 click 리스너 안).
//
// ★이 파일이 안 하는 것: 새 게임 동사 0. 메뉴가 보내는 것은 **종전 그대로의 메시지**다
//   (`pickup_item` · `rescue_request` · `hut_advance` … 그리고 새 타입 하나 `verb`).

  // ── pickAt — 커서 밑에 무엇이 있나 ─────────────────────────────────────────
  //   ★★**좌클릭 사슬을 그대로 옮긴 것이다.** 순서도 반경도 한 비트도 안 바꿨다:
  //     ① 바닥 물건 ±14px  ② 터·시설(움집터 ±48/±40 · 그 밖 ±34)  ③ 상자·곳간 ±20px
  //     셋 다 **AABB**(반경이 아니라 네모)다 — 종전 코드가 `Math.abs(dx) <= r` 였다.
  //     존 순회 순서(`conns.values()`)와 "첫 히트에서 멈춤"도 그대로다.
  //   ⚠**거리 게이트는 여기 없다.** 종전 코드에서 "너무 멀다" 는 대상을 고른 **뒤** 검사해
  //     **다음 갈래로 안 넘어가고 알림만 내고 끝났다**. 그 판단은 부르는 쪽에 남긴다 —
  //     여기로 옮기면 멀리 있는 상자가 "안 골라진 것"이 되어 사슬이 뒤로 흐른다(행동 변경).
  //   ⓪ 사람은 **좌클릭 사슬에 없다**(종전 R 키가 `findNearestDownedGuildmate` 로 골랐다).
  //     그래서 기본은 끈 채로 두고 `{ players: true }` 일 때만 본다 — 우클릭만 켠다.
  // 누가 누구를 업고 있나 — 서버 `player_down_state` 가 이미 `carriedBy` 를 실어 보낸다(종전).
  //   클라가 그걸 버리고 있어서 메뉴가 "업기"와 "내려놓기"를 못 갈랐다. 새 서버 칸 0 · 새 메시지 0.
  const _carriedBy = new Map();
  function onCarryState(pid, by) { if (by) _carriedBy.set(pid, by); else _carriedBy.delete(pid); }

  const PICK_PLAYER_HALF = 18;   // 사람 판정 네모의 반변(px). 바닥 물건 14 와 상자 20 사이 — 발밑 그림자~어깨.
  // 자연물 네모는 **그 자연물의 크기를 따라간다**(`r.r` = 나무 4~20 · 렌더가 쓰는 그 값).
  //   작은 덤불이 안 눌리고 큰 나무가 좁게 눌리는 걸 막는다. 바닥 16 · 천장 28(상자 20 언저리).
  const natureHalf = (r) => Math.max(16, Math.min(28, (r && r.r ? r.r : 12) + 8));
  function pickAt(wx, wy, opts) {
    // ⓪ **우클릭 층** — 사람 · 나 · 자연물. 좌클릭 사슬엔 셋 다 **없다**(종전 무변).
    //   ★[T82] T68 의 `{players:true}` 를 `{live:true}` 로 넓혔다 — 같은 뜻(우클릭이 보는 층까지)이고,
    //     이름이 "사람"이면 자연물이 들어온 지금 거짓말이 된다.
    if (opts && opts.live) {
      for (const c of conns.values()) {
        if (!c.meta || !c.others) continue;
        const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
        for (const o of c.others.values()) {
          const absX = ox + o.x, absY = oy + o.y;
          if (Math.abs(absX - wx) <= PICK_PLAYER_HALF && Math.abs(absY - wy) <= PICK_PLAYER_HALF) {
            return { kind: 'player', id: o.pid, obj: o, absX, absY,
                     down: !!downStates.get(o.pid), npc: !!o.npc };
          }
        }
      }
      // 나 자신 — `others` 에 내가 없다(서버가 남만 보낸다). 화면의 나는 예측 위치에 서 있다.
      if (Math.abs(myAbsPredicted.x - wx) <= PICK_PLAYER_HALF
          && Math.abs(myAbsPredicted.y - wy) <= PICK_PLAYER_HALF) {
        return { kind: 'me', id: myPid, obj: null, absX: myAbsPredicted.x, absY: myAbsPredicted.y };
      }
      // 자연물 — 나무·바위·광맥·약초·덤불·물웅덩이. 좌클릭은 이 층을 안 본다(E 키가 종전 통로).
      for (const c of conns.values()) {
        if (!c.meta || !c.resources) continue;
        const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
        for (const r of c.resources.values()) {
          const absX = ox + r.x, absY = oy + r.y, h = natureHalf(r);
          if (Math.abs(absX - wx) <= h && Math.abs(absY - wy) <= h) {
            return { kind: 'nature', id: r.id, obj: r, absX, absY };
          }
        }
      }
    }
    // ① 바닥 물건 (±14) — 종전 "1) ground item hit-test 우선 (작은 거 위에 클릭)"
    for (const c of conns.values()) {
      if (!c.meta || !c.groundItems) continue;
      const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
      for (const gi of c.groundItems.values()) {
        const absX = ox + gi.x, absY = oy + gi.y;
        if (Math.abs(absX - wx) <= 14 && Math.abs(absY - wy) <= 14) {
          return { kind: 'item', id: gi.id, obj: gi, absX, absY };
        }
      }
    }
    // ② 터·시설 — 종전 "1.5) 움집터 클릭 → 다음 단계 시공 시도"
    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
      for (const b of c.buildings.values()) {
        if (b.type !== 'hut_site' && b.type !== 'furnace_site' && b.type !== 'furnace'
            && b.type !== 'kiln_site' && b.type !== 'charcoal_kiln'
            && b.type !== 'village_site' && b.type !== 'village_hall'
            && b.type !== 'shelter_site') continue;   // ★[T62 리베이스] 쉼터 터도 사슬에 있다
        const absX = ox + b.x, absY = oy + b.y;
        const rx = b.type === 'hut_site' ? 48 : 34, ry = b.type === 'hut_site' ? 40 : 34;
        if (Math.abs(absX - wx) <= rx && Math.abs(absY - wy) <= ry) {
          return { kind: 'site', id: b.id, obj: b, absX, absY };
        }
      }
    }
    // ③ 상자·곳간 (±20) — 종전 "2) chest bbox hit-test"
    for (const c of conns.values()) {
      if (!c.meta) continue;
      const ox = c.meta.worldOffsetX || 0, oy = c.meta.worldOffsetY || 0;
      for (const b of c.buildings.values()) {
        if (b.type !== 'chest' && b.type !== 'guild_granary') continue;
        const absX = ox + b.x, absY = oy + b.y;
        if (Math.abs(absX - wx) <= 20 && Math.abs(absY - wy) <= 20) {
          return { kind: 'chest', id: b.id, obj: b, absX, absY };
        }
      }
    }
    return null;
  }

  // ── verbsFor — 이 대상 위에 뜰 동사들 ─────────────────────────────────────
  //   ★★**새 동사 0.** 여기 있는 것은 전부 종전에 이미 있던 길이다:
  //     쓰러진 사람 → `/먹이기`·`/물`(채팅) · R 키(업기/내려놓기)
  //     바닥 물건   → 좌클릭 줍기            건물·터 → 좌클릭이 보내던 그 메시지
  //   달라진 것은 **어디서 부르는가** 하나다 — 명령어·단축키에서 → 대상 위에서.
  //   ⚠단축키는 안 지운다(회부 §4: "키보드 R 은 남긴다 — 단축키는 메뉴의 별칭").
  //   반환: [{ label, send }] · `send` 는 인자 없는 함수다(메뉴가 그대로 부른다).
  function verbsFor(t, me) {
    if (!t) return [];
    const out = [];
    if (t.kind === 'player') {
      // ★★[T126 2026-09-05] **NPC 에게 동사 둘.** T82·T90 이 회부해 둔 `if (t.npc) return []` 자리다.
      //   §0 실측이 지시서 ①의 전제 하나를 고쳤다: **이 세계엔 촌장이라는 개체가 없다.**
      //   `makeEntry` 가 싣는 것은 `npc` 1비트·`simJob`·`tribeName` 뿐이고 마을엔 촌장 NPC 가 없다 —
      //   촌장은 마을이 내는 **목소리**(`village_brief`)다. ⇒ 촌장/주민을 가르지 않고,
      //   **누구에게 물어도 그 마을이 아는 소식**이 그 사람 입에서 나온다(디에게틱하게도 그게 맞다).
      //   새 메시지 0 · 새 문장 0 · 새 패널 0 — 둘 다 이미 있는 문을 부른다.
      if (t.npc) {
        const V = (k) => (npcVerbs && npcVerbs[k]) || k;   // 폴백 없음(T90 규약) — 모르면 키가 뜬다
        const out2 = [{ label: V('talk'), send: () => talkToNpc(t) }];
        // 거래는 **게이트 안에서만** 보인다. 게이트 술어는 클라가 새로 안 만든다 —
        //   `41-h-bubble.js` 가 260px(`EV_BRIEF_PX`)로 이미 잡아 둔 `__evNearVid` 하나다.
        if (window.__evNearVid != null) out2.push({ label: V('trade'), send: () => openSide('trade') });
        return out2;
      }
      if (!t.down) return [];                     // 성한 사람도 회부(자기 자신·거래는 T69 뒤)
      // 먹이기 — 하위 목록은 **내 짐의 먹을 것**이다. 무엇이 먹을 것인가는 서버 표
      //   (`foodEffects` = `FOOD_EFFECTS`)가 정한다. 클라가 목록을 다시 적지 않는다.
      const edible = Object.keys(inventory || {})
        .filter((k) => (inventory[k] || 0) > 0 && !!(foodEffects && foodEffects[k]));
      out.push({
        label: edible.length ? '먹이기…' : '먹이기 — 먹일 것이 없다',
        send: () => {
          if (!edible.length) { showNotice('먹일 것이 없다'); return; }
          // 하위 목록 = 같은 자리에 메뉴를 한 번 더 연다(새 UI 0 · `showContextMenu` 그대로).
          showContextMenu(_lastMenuX, _lastMenuY, edible.map((k) => ({
            label: `${itemKo(k)} ×${inventory[k]}`,
            onClick: () => sendPrimary({ type: 'verb', name: 'feed', pid: t.id, item: k }),
          })));
        },
      });
      out.push({ label: '물 먹이기', send: () => sendPrimary({ type: 'verb', name: 'water', pid: t.id }) });
      // 업기/내려놓기 — 서버 `tryRescue` 가 **이미 토글**이다(`_carrying` 이 있으면 내려놓기).
      //   그래서 보내는 메시지는 하나이고, 글자만 지금 상태를 말한다.
      //   ⚠남이 업고 있으면 아예 안 띄운다 — 서버가 "다른 사람이 이미 업고 있다"로 거절하는 자리다.
      //     띄워 놓고 거절하는 메뉴는 거짓말이다.
      const by = _carriedBy.get(t.id) || null;
      if (!by) out.push({ label: '업기', send: () => sendPrimary({ type: 'rescue_request', pid: t.id }) });
      else if (by === myPid) out.push({ label: '내려놓기', send: () => sendPrimary({ type: 'rescue_request', pid: t.id }) });
      return out;
    }
    if (t.kind === 'nature') {
      // ★★[T90] 동사 이름은 **서버 정본**에서 온다(`welcome.resourceVerbs` = `itemlabel.RESOURCE_VERBS`).
      //   T82 가 여기 뒀던 한 단어 표는 **지웠다** — 그게 사본이었고, 스스로 회부에 적어 둔 것이다.
      //   ⚠폴백을 두지 않는다. 서버가 모르는 종류면 이름이 안 나오고, 그건 표를 고치라는 신호다
      //     (조용히 '채집'으로 접으면 새 자연물이 영영 이름 없이 산다 — `itemKo` 와 같은 규약).
      // ★★[T122] **그루터기엔 동사가 없다** — 이름 표를 보고 거르는 게 아니라 **물리를 본다**:
      //   `maxHp <= 0` 이면 칠 것이 없다(서버가 hp 0 으로 낳는다). 종류 이름 목록을 클라에 두면
      //   그게 또 사본이고, 새 단계가 생길 때마다 여기가 낡는다(T90 이 지운 그 표의 재발).
      if (!(t.obj.maxHp > 0)) return out;
      const word = (resourceVerbs && resourceVerbs[t.obj.type]) || t.obj.type;
      // ★★[T90] 그리고 이제 **지목이 간다**(`gather{resId}`). T82 의 "누른 것이 최근접일 때만"은
      //   정책이 아니라 서버에 인자가 없어서 생긴 임시였다 — 그 조건도, 빈 메뉴 갈래도 지웠다.
      //   멀면 **서버가** 거절한다(거리 게이트는 종전 `GATHER_RANGE` 그대로 · 새 예외 0).
      //   ★[§0-ⓑ 판정 유지] 한 번 = 반복 시작(채굴 60타). E 키와 **같은 타이머**를 쓴다.
      const on = !!window.__eRepeat;
      out.push({ label: on ? `${word} 멈추기` : word, send: () => toggleGatherLoop(t.id) });
      return out;
    }
    if (t.kind === 'me') {
      // ★★[§0-ⓒ 실측] 새 서버 메시지 **0**. 먹기·마시기는 종전 `eat{item}` 하나이고,
      //   무엇이 먹을 것이고 무엇이 마실 것인가는 **서버 표**(`foodEffects` = `FOOD_EFFECTS`)가 가른다
      //   — 허기를 올리면 먹을 것, 갈증을 올리면 마실 것. 클라가 목록을 다시 적지 않는다.
      const inv = Object.keys(inventory || {}).filter((k) => (inventory[k] || 0) > 0 && !!(foodEffects && foodEffects[k]));
      const eats = inv.filter((k) => (foodEffects[k].hunger || 0) > 0);
      const drinks = inv.filter((k) => (foodEffects[k].thirst || 0) > 0);
      const sub = (list) => list.map((k) => ({
        label: `${itemKo(k)} ×${inventory[k]}`,
        onClick: () => sendPrimary({ type: 'eat', item: k }),
      }));
      out.push({
        label: eats.length ? '먹기…' : '먹기 — 먹을 것이 없다',
        send: () => { if (!eats.length) { showNotice('먹을 것이 없다'); return; } showContextMenu(_lastMenuX, _lastMenuY, sub(eats)); },
      });
      out.push({
        label: drinks.length ? '마시기…' : '마시기 — 마실 것이 없다',
        send: () => { if (!drinks.length) { showNotice('마실 것이 없다 — 물가에서 E'); return; } showContextMenu(_lastMenuX, _lastMenuY, sub(drinks)); },
      });
      // 짐·장비 — 인벤 패널이 정본 경로다(새 창구 0 · `I` 키의 별칭).
      out.push({ label: '짐과 장비', send: () => { if (typeof toggleInv === 'function') toggleInv(); } });
      return out;
    }
    if (t.kind === 'item') {
      out.push({ label: `줍기 — ${itemKo(t.obj.item || t.obj.type || '')}`,
                 send: () => sendPrimary({ type: 'pickup_item', giId: t.id }) });
      return out;
    }
    if (t.kind === 'site') {
      // ★좌클릭이 보내던 그 메시지를 **이름을 붙여** 그대로 낸다(`30-n-net` 의 갈래와 1:1).
      const b = t.obj;
      const M = {
        furnace:       { label: '조업 — 제련', type: 'furnace_smelt' },
        furnace_site:  { label: '시공',        type: 'furnace_advance' },
        charcoal_kiln: { label: '조업 — 숯 굽기', type: 'kiln_burn' },
        kiln_site:     { label: '시공',        type: 'kiln_advance' },
        village_site:  { label: '시공',        type: 'village_advance' },
        village_hall:  { label: '열기 — 마을 재고', type: 'village_inventory' },
        shelter_site:  { label: '시공',        type: 'shelter_advance' },   // ★[T62 리베이스] 공용 쉼터
        hut_site:      { label: '시공',        type: 'hut_advance' },
      };
      const m = M[b.type] || M.hut_site;
      out.push({ label: m.label, send: () => {
        if (m.type === 'village_inventory') _pviHallId = b.id;
        sendPrimary({ type: m.type, buildingId: b.id });
      } });
    } else if (t.kind === 'chest') {
      const b = t.obj;
      if (b.data && b.data.isExchange && b.data.village && typeof window.openVillageMarket === 'function') {
        out.push({ label: '열기 — 마을 거래소', send: () => window.openVillageMarket(b.data.village) });
      } else if (typeof openInvWithContainer === 'function') {
        out.push({ label: b.type === 'guild_granary' ? '열기 — 길드 곳간' : '열기 — 상자',
                   send: () => openInvWithContainer(b.id) });
      }
    }
    // 해체 — 건축 모드에서 좌클릭이 하던 그 일. 모드 밖에서는 안 뜬다(종전엔 길이 없었다).
    if ((t.kind === 'site' || t.kind === 'chest') && buildMode && !buildAction) {
      out.push({ label: '해체', send: () => startBuildAction('dismantle', { buildingId: t.id }) });
    }
    return out;
  }

  // ── 채집 반복 — **타이머는 하나다** ───────────────────────────────────────
  //   ★E 키(`99-main`)와 메뉴가 각자 `setInterval` 을 만들면 서버로 **두 배**가 간다.
  //     그래서 도는 자리를 여기 하나로 두고, 멈추는 조건만 부르는 쪽이 준다:
  //       E    — 키를 떼면 멈춘다(종전 그대로)
  //       메뉴 — 그 자연물이 없어지면 멈춘다(다 캤다) · 다시 우클릭하면 멈춘다
  //   ⚠보내는 메시지는 종전과 같은 `gather` 하나다(서버 무접촉 · 새 동작 0).
  function startGatherLoop(stopWhen, resId) {
    if (window.__eRepeat) return;
    window.__eRepeat = setInterval(() => {
      if ((stopWhen && stopWhen()) || chatActive || myIsDown) { stopGatherLoop(); return; }
      // ★[T90] `resId` 가 있으면 매 타가 **그 자연물**로 간다(E 는 인자 없이 종전대로 최근접).
      sendPrimary(resId === undefined ? { type: 'gather' } : { type: 'gather', resId });
    }, 1000);
  }
  function stopGatherLoop() {
    if (window.__eRepeat) { clearInterval(window.__eRepeat); window.__eRepeat = null; }
  }
  //   ⚠"없어졌나"는 **두 번 연속으로** 물어야 한다. 존을 옮기거나 시야 묶음이 갱신되는 찰나에
  //     자원 맵이 잠깐 비는 판이 있어서, 한 번만 보면 **다 캐지도 않았는데 멎는다**
  //     (하네스가 실제로 그걸 잡았다: 도는 중인데 메뉴가 "멈추기"가 아니라 "벌목"이었다).
  let _goneStreak = 0;
  function _resourceGone(id) {
    let here = false;
    for (const c of conns.values()) { if (c.resources && c.resources.has(id)) { here = true; break; } }
    _goneStreak = here ? 0 : _goneStreak + 1;
    return _goneStreak >= 2;
  }
  //   ★★[T90 · §0-ⓐ] 메뉴에서 시작한 반복은 **누른 그 자연물을 끝까지 든다**(`resId` 고정).
  //     지목이 없던 때는 매 타가 최근접으로 흘렀다 — 걷다 보면 다른 나무를 베고 있었다.
  function toggleGatherLoop(resId) {
    if (window.__eRepeat) { stopGatherLoop(); showNotice('멈췄다'); return; }
    sendPrimary({ type: 'gather', resId });                // 첫 타는 즉시(E 와 같다) · 지목해서
    _goneStreak = 0;
    startGatherLoop(() => _resourceGone(resId), resId);    // 다 캐면 저절로 멎는다
  }

  // ★★[T126] **말 걸기** — 보내는 것은 종전 `village_brief` 그대로다(새 메시지 0).
  //   ⚠어느 마을을 묻나: 서 있는 자리의 마을(`__evNearVid`)이 먼저다. 게이트 밖이면 그 사람이
  //     속한 마을(`tribeName` → `simVillages` 이름)을 보내고, **거절 문장은 서버가 낸다**
  //     ('마을 중심에서 너무 멀다'). 클라가 "너무 멀다"를 지어 쓰면 그게 곧 사본이다.
  //   ⚠답을 이 사람 것으로 알아보려면 물어본 사실을 기억해야 한다. **창에 안 건다** —
  //     `window.X` 를 두 파일이 대입하면 `test-client-globals ⑤c` 가 (옳게) 빨개진다.
  //     여기 `let` 하나를 두고, 받는 쪽은 `npcAskTake(vid)` 로 **가져가며 지운다**(대입은 이 파일 하나).
  let _npcAsk = null;   // { pid, name, vid, at }
  function npcAskTake(vid) {
    if (!_npcAsk || _npcAsk.vid !== vid || Date.now() - _npcAsk.at > 6000) return null;
    const a = _npcAsk; _npcAsk = null; return a;
  }
  function talkToNpc(t) {
    let vid = window.__evNearVid;
    if (vid == null) {
      const tn = t.obj && t.obj.tribeName;
      for (const c of conns.values()) {
        if (!c.simVillages) continue;
        for (const v of c.simVillages) if (v.name === tn) { vid = v.id; break; }
        if (vid != null) break;
      }
    }
    if (vid == null) return;                       // 마을을 모르는 사람 — 물을 데가 없다(메뉴는 떴다)
    _npcAsk = { pid: t.id, name: (t.obj && t.obj.name) || '', vid, at: Date.now() };
    sendPrimary({ type: 'village_brief', vid });
  }

  // ── 우클릭 배선 ───────────────────────────────────────────────────────────
  //   ★★[§0-ⓑ 실측] 우클릭 하나를 **셋이 나눠 쓴다**. 순서를 정하려고 진짜 Chromium 에 물었다:
  //     `mousedown(2)` → `contextmenu` → (뗄 때) `mouseup(2)` → `auxclick(2)`
  //     ⇒ `contextmenu` 는 **누르는 순간** 온다. 600ms 를 눌러도 거기서 먼저 온다.
  //     그래서 "짧게 누름 vs 홀드" 를 `contextmenu` 에서는 **가를 수 없다**. 뗄 때 오는
  //     `auxclick` 이 그 자리다 — 거기서 누른 시간과 움직인 거리를 재면 타이머가 필요 없다.
  //   ⇒ 표(보고 §ⓑ):
  //     배치 모드     → 회전 (종전 · `contextmenu` 에서 · 메뉴 없음)
  //     홀드(≥250ms 또는 ≥6px 이동) → 조준 (종전 · 메뉴 없음 — 조준 사수는 몸 위에서도 조준한다)
  //     짧게 누름 + 대상 있음        → **메뉴**
  //     짧게 누름 + 빈 땅            → 아무 일 없음 (종전 · 조준이 잠깐 켜졌다 꺼진다)
  //   ⚠조준(`_aiming`)은 **한 비트도 안 건드린다** — `mousedown` 이 켜고 `mouseup` 이 끈다(종전).
  //   ★★[T68 2차] 문턱을 250 → **400ms** 로 올렸다. 사람의 짧은 누름은 ~80ms 라 넉넉하고,
  //     조준 홀드와는 여전히 확실히 갈린다. 250 에서 올린 이유는 실측이다: 실클라 셋이 붙은
  //     2코어 상자에서 `mousedown` → `auxclick` 사이가 렌더 루프에 밀려 250 을 넘겼고,
  //     **옳은 탭이 홀드로 읽혀 메뉴가 안 떴다**(하네스가 한 판에서 그걸 잡았다).
  //     느린 기계의 사람도 같은 일을 겪는다 — 문턱이 낮으면 메뉴가 가끔 안 열린다.
  const RMB_TAP_MS = 400, RMB_TAP_PX = 6;
  let _rmbAt = 0, _rmbX = 0, _rmbY = 0;
  let _lastMenuX = 0, _lastMenuY = 0;
  function bindVerbMenu() {
    const cv = canvas;
    if (!cv) return;
    cv.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
      _rmbAt = performance.now(); _rmbX = e.clientX; _rmbY = e.clientY;
    });
    cv.addEventListener('auxclick', (e) => {
      if (e.button !== 2) return;
      if (placementMode) return;                       // 배치 회전은 `contextmenu` 몫(종전)
      const held = performance.now() - _rmbAt;
      const moved = Math.hypot(e.clientX - _rmbX, e.clientY - _rmbY);
      // ★[T82 ⓪ · 재민 판정] T68 이 여기 둔 진단 훅 `window.__rmbDbg` 는 **지웠다** —
      //   `__` 접두라도 진단 훅은 제품 코드에 안 남긴다(T57 규약). 그 훅이 제 값을 한 자리는
      //   `e2e-verbs` 의 "왜 안 떴나" 한 줄이었고, 그 답(고정 대기 → 기다림)은 이미 하네스에 박혔다.
      if (held > RMB_TAP_MS || moved > RMB_TAP_PX) return;   // 홀드였다 = 조준(종전)
      const rect = cv.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (cv.width / rect.width);
      const py = (e.clientY - rect.top) * (cv.height / rect.height);
      const w = screenToWorldAbs(px, py);
      const t = pickAt(w.wx, w.wy, { live: true });
      const verbs = verbsFor(t, null);
      if (!verbs.length) return;                       // 빈 땅·동사 없는 대상 = 메뉴 0(종전)
      _lastMenuX = e.clientX; _lastMenuY = e.clientY;
      showContextMenu(e.clientX, e.clientY, verbs.map((v) => ({ label: v.label, onClick: v.send })));
    });
  }
