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
  function pickAt(wx, wy, opts) {
    // ⓪ 사람 (우클릭 전용)
    if (opts && opts.players) {
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
      if (t.npc) return [];                       // NPC 는 회부(§4) — 빈 배열이면 메뉴를 안 연다
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
      // ★진단 훅 — "메뉴가 왜 안 떴나"를 화면 밖에서 물어볼 수 있어야 한다(`__aimDbg` 와 같은 규약).
      window.__rmbDbg = { held: Math.round(held), moved: Math.round(moved), tap: !(held > RMB_TAP_MS || moved > RMB_TAP_PX) };
      if (held > RMB_TAP_MS || moved > RMB_TAP_PX) return;   // 홀드였다 = 조준(종전)
      const rect = cv.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (cv.width / rect.width);
      const py = (e.clientY - rect.top) * (cv.height / rect.height);
      const w = screenToWorldAbs(px, py);
      const t = pickAt(w.wx, w.wy, { players: true });
      const verbs = verbsFor(t, null);
      if (!verbs.length) return;                       // 빈 땅·동사 없는 대상 = 메뉴 0(종전)
      _lastMenuX = e.clientX; _lastMenuY = e.clientY;
      showContextMenu(e.clientX, e.clientY, verbs.map((v) => ({ label: v.label, onClick: v.send })));
    });
  }
