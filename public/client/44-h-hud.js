// @@split:44-h-hud — H — 컨텍스트 메뉴·핫키바·updateHud·미니맵·채팅로그 (T53 ④)

  // ★[T61] 아묾 표시용 — 마지막으로 본 HP 와 "오르는 중" 등불의 유효 시각.
  //   ⚠새 서버 칸 0. 관측값 둘뿐이고, 둘 다 화면 전용이다(예측·판정에 안 쓴다).
  // ★[T66 2차] 옛 도구 아이콘 표(`TOOL_ICO`)는 삭제 — 도구는 **아이템 그림 하나**(`itemPic`)로 간다.
  let _hpSeen = 0, _healingUntil = 0;
  const HEAL_HOLD_MS = 1500;
  // 14.53: 우클릭 컨텍스트 메뉴 — 임의 옵션 list 받아서 마우스 위치에 띄움.
  let _ctxMenuEl = null;
  function hideContextMenu() {
    if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
    document.removeEventListener('click', hideContextMenu, true);
    document.removeEventListener('contextmenu', hideContextMenu, true);
  }
  function showContextMenu(x, y, options) {
    hideContextMenu();
    const m = document.createElement('div');
    m.id = 'ctxMenu';
    m.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:rgba(var(--pane-rgb), 0.97);border:1px solid var(--thirst);border-radius: 0;z-index:99999;min-width:180px;padding:4px;box-shadow:0 4px 16px rgba(var(--bg-rgb), 0.5);font-size:13px;color:var(--fg-strong);font-family:sans-serif`;
    for (const opt of options) {
      const it = document.createElement('div');
      it.textContent = opt.label;
      it.style.cssText = 'padding:8px 14px;cursor:pointer;border-radius: 0;user-select:none';
      it.onmouseenter = () => it.style.background = 'rgba(var(--thirst-rgb), 0.3)';
      it.onmouseleave = () => it.style.background = 'transparent';
      it.onclick = (e) => {
        e.stopPropagation();
        hideContextMenu();
        try { opt.onClick(); } catch(err) { console.warn('ctx menu err', err); }
      };
      m.appendChild(it);
    }
    document.body.appendChild(m);
    _ctxMenuEl = m;
    // viewport 밖이면 보정
    const rect = m.getBoundingClientRect();
    if (rect.right > window.innerWidth) m.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) m.style.top = (window.innerHeight - rect.height - 8) + 'px';
    // 외부 클릭 = 닫기
    setTimeout(() => {
      document.addEventListener('click', hideContextMenu, true);
      document.addEventListener('contextmenu', hideContextMenu, true);
    }, 50);
  }
  // 14.53: 화면 하단 중앙 hotkey 슬롯 (1번). 드래그로 도구 등록 + 1키로 토글.
  function ensureHotkeyBar() {
    let bar = document.getElementById('hotkeyBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'hotkeyBar';
    bar.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:500;display:flex;gap:8px;pointer-events:none';
    bar.innerHTML = `
      <div id="hkSlot1" data-slot="1" style="pointer-events:auto;width:64px;height:64px;background:rgba(var(--bg-rgb), 0.92);border:2px solid var(--line);border-radius: 0;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;user-select:none">
        <div style="position:absolute;top:2px;left:4px;font-size:10px;color:var(--dim-2);font-weight:bold">1</div>
        <div class="hk-icon" style="font-size:24px;line-height:1">·</div>
        <div class="hk-label" style="font-size:9px;color:var(--dim-2);margin-top:1px">비어있음</div>
      </div>
    `;
    document.body.appendChild(bar);
    const slot = bar.querySelector('#hkSlot1');
    // 드래그 받기
    slot.addEventListener('dragover', (e) => {
      const types = e.dataTransfer.types;
      if (types && (Array.from(types).includes('text/x-tool-instance'))) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        slot.style.borderColor = 'var(--accent)';
      }
    });
    slot.addEventListener('dragleave', () => {
      slot.style.borderColor = (equipped && equipped === hotkey1) ? 'var(--stam)' : 'var(--line)';
    });
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/x-tool-instance');
      if (id) sendPrimary({ type: 'set_hotkey', toolItemId: id });
    });
    // 클릭 = 토글 (1키와 동일)
    slot.addEventListener('click', () => {
      if (!hotkey1) { showNotice('인벤에서 도구를 드래그하세요'); return; }
      sendPrimary({ type: 'toggle_hotkey' });
    });
    // 우클릭 = 슬롯 비우기
    slot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (hotkey1) {
        sendPrimary({ type: 'set_hotkey', toolItemId: null });
        showNotice('1번 슬롯 비움');
      }
    });
    return bar;
  }
  function updateHotkeyBar() {
    const bar = ensureHotkeyBar();
    const slot = bar.querySelector('#hkSlot1');
    if (!slot) return;
    const iconEl = slot.querySelector('.hk-icon');
    const labelEl = slot.querySelector('.hk-label');
    if (hotkey1) {
      const inst = toolItems.find(t => t.id === hotkey1);
      if (inst) {
        iconEl.innerHTML = itemPic(inst.type, 18);   // ★[T66 2차] 아이템 그림 하나
        const dur = `${inst.d}/${inst.max}`;
        const isEq = (equipped === inst.id);
        labelEl.textContent = isEq ? '✓착용 중' : '대기';
        labelEl.style.color = isEq ? 'var(--stam)' : 'var(--thirst)';
        slot.style.borderColor = isEq ? 'var(--stam)' : 'var(--thirst)';
        slot.style.background = isEq ? 'rgba(var(--stam-rgb), 0.92)' : 'rgba(var(--bg-rgb), 0.92)';
        slot.title = `${inst.type} (${dur}) — 1키 또는 클릭 = 토글, 우클릭 = 슬롯 비우기`;
      } else {
        // hotkey instance 사라짐 (서버에서 cleanup될 거임)
        iconEl.textContent = '·';
        labelEl.textContent = '깨짐';
        labelEl.style.color = 'var(--hp)';
        slot.style.borderColor = 'var(--line)';
        slot.style.background = 'rgba(var(--bg-rgb), 0.92)';
      }
    } else {
      iconEl.textContent = '·';
      labelEl.textContent = '비어있음';
      labelEl.style.color = 'var(--dim-2)';
      slot.style.borderColor = 'var(--line)';
      slot.style.background = 'rgba(var(--bg-rgb), 0.92)';
      slot.title = '인벤에서 도구를 드래그해서 등록 (1키로 토글)';
    }
  }
  function updateHud() {
    // ★★[T61 2026-09-03 실측] **로드 100ms 창의 경주** — 종전엔 그냥 `onbHudLine()` 이었다.
    //   `setInterval(updateHud, 100)`(이 파일 아래)은 44 가 실행된 100ms 뒤부터 돈다. 그런데
    //   `onbHudLine` 은 **70-lobby.js**(등록 순 뒤)에 있다 ⇒ 2코어에서 스크립트 사이가 100ms 를
    //   넘으면 그 틱이 `onbHudLine is not defined` 로 죽는다. 그리고 이건 **첫 줄**이라
    //   `updateHud` 가 통째로 중단된다 — 그 창 동안 HUD 가 한 번도 안 그려진다.
    //   실측: `e2e-salt` 콘솔 오류 2건(부하가 높던 판에서만 · 다른 판에선 0건).
    //   ⚠온보딩 v2 가 남긴 경주지 이 카드가 만든 것이 아니다. 한 줄이라 여기서 닫는다.
    if (typeof onbHudLine === 'function') onbHudLine();   // ★[온보딩 v2] 하루 정산·기여 한 줄(§9.4)
    document.getElementById('invWood').textContent = inventory.wood || 0;
    const plankEl = document.getElementById('invPlank');
    if (plankEl) plankEl.textContent = inventory.plank || 0;
    document.getElementById('invStone').textContent = inventory.stone || 0;
    // ★[무게 배치] 소지 무게 한 줄. 넘치면 붉어진다(§8.2 — 숫자 하나가 판단을 만든다).
    const ckg = document.getElementById('carryKg'), ccap = document.getElementById('carryCap');
    if (ckg && myCarry) {
      ckg.textContent = (myCarry.kg || 0).toFixed(1);
      if (ccap) ccap.textContent = String(myCarry.cap || 0);
      const box = document.getElementById('carryHud');
      if (box) box.classList.toggle('over', !!myCarry.over);
    }
    const eqEl = document.getElementById('equippedBadge');
    if (eqEl) {
      // 14.53: equipped = toolItemId → instance 찾아 type 표시
      const inst = equipped ? findToolInstance(equipped) : null;
      if (inst) {
        // ★[T66 2차] 도구 = 아이템 ⇒ 같은 그림 하나(`itemPic`). 선 아이콘은 **행동**의 몫이다.
        eqEl.innerHTML = itemPic(inst.type, 14) + ` ${itemKo(inst.type)} ${inst.d}/${inst.max}`;
      } else {
        eqEl.textContent = '맨손';
      }
    }
    // ★★[T61 2026-09-03] **아묾이 화면에 실린다** — 회부 "[N/클라] HP 자연 회복이 화면에 안 실린다".
    //   ★서버에 칸을 하나도 더하지 않았다. 서버의 회복 게이트는 넷이고
    //     (`hp<max` · 피격 뒤 1초 · `recoverMult>0` · 극단 감소 없음) 그중 둘은 클라가 못 본다.
    //     ⇒ 술어를 **흉내내지 않는다**. 대신 **HP 가 실제로 올랐는가**를 본다 — 그게 네 게이트의 결과다.
    //   ★"왜 안 아무는가"는 **여기서 말하지 않는다**: 갈증·추위·부상 무들이 이미 그 말을 하고 있고
    //     (`recoverParts` 가 축별 배율을 싣는다) 같은 말을 두 번 하면 그게 중복이다(§8.3).
    //   ★깜빡임 방지: 한 번 오르면 `HEAL_HOLD_MS` 동안 켜 둔다(서버 회복은 초당 ~10hp 이고
    //     tick 은 그보다 잦아 프레임마다 0 인 순간이 섞인다 — 그 사이에 꺼지면 등불이 떤다).
    const hpEl = document.getElementById('hpFill');
    if (hpEl) {
      const _now = performance.now();
      if (myHp > _hpSeen + 0.01 && myHp < myMaxHp) _healingUntil = _now + HEAL_HOLD_MS;
      _hpSeen = myHp;
      const _healing = myHp < myMaxHp && _now < _healingUntil;
      hpEl.style.width = `${Math.max(0, (myHp / myMaxHp) * 100)}%`;
      hpEl.style.filter = _healing ? 'brightness(1.45)' : '';
      const _hpTx = document.getElementById('hpText');
      _hpTx.textContent = `${Math.round(myHp)}/${myMaxHp}${_healing ? ' ▲' : ''}`;
      _hpTx.title = _healing
        ? `아물고 있다${myRecover < 0.999 ? ` (회복 ×${myRecover.toFixed(2)})` : ''}`
        : (myHp < myMaxHp ? '아물지 않는다 — 무들이 이유를 말한다' : '');
    }
    // hunger / thirst bar
    const hungerEl = document.getElementById('hungerFill');
    if (hungerEl) {
      hungerEl.style.width = `${Math.max(0, myHunger)}%`;
      document.getElementById('hungerText').textContent = `${Math.round(myHunger)}${myCold ? ' · 추움' : ''}`;
    }
    const thirstEl = document.getElementById('thirstFill');
    if (thirstEl) {
      thirstEl.style.width = `${Math.max(0, myThirst)}%`;
      document.getElementById('thirstText').textContent = `${Math.round(myThirst)}`;
    }
    // ★[신체 3층 재배선] 스태미나 — 잠기면(바닥나 숨 고르는 중) 색이 바뀐다.
    //   회복 배율이 1 이 아니면 그 사실도 적는다("왜 안 차는가"를 화면이 말한다).
    const stamEl = document.getElementById('stamFill');
    if (stamEl) {
      stamEl.style.width = `${Math.max(0, Math.min(100, myStam * 100))}%`;
      stamEl.classList.toggle('locked', !!myStamLock);
      const rTxt = (myRecover < 0.999) ? ` <span style="opacity:.75">회복 ×${myRecover.toFixed(2)}</span>` : '';
      document.getElementById('stamText').innerHTML = `${Math.round(myStam * 100)}${rTxt}`;
    }
    const vpEl = document.getElementById('vpFill');
    if (vpEl) {
      vpEl.style.width = `${Math.max(0, Math.min(100, myVp))}%`;
      const txt = myVp >= VP_THRESHOLD
        ? `적대감 ${Math.round(myVp)} — 내 영지 보호 해제됨`
        : `적대감 ${Math.round(myVp)}/${VP_THRESHOLD}`;
      document.getElementById('vpText').textContent = txt;
      document.querySelector('.vp-bar')?.classList.toggle('danger', myVp >= VP_THRESHOLD);
    }
    // Phase 14.40: Sprint 뱃지 — Shift 누르고 있을 때 시각 피드백
    const pvpBadgeForSprint = document.getElementById('pvpBadge');
    if (pvpBadgeForSprint) {
      let sprintBadge = document.getElementById('sprintBadge');
      if (!sprintBadge) {
        sprintBadge = document.createElement('span');
        sprintBadge.id = 'sprintBadge';
        sprintBadge.className = 'badge';
        sprintBadge.title = 'Shift = 달리기 — 스태미나를 쓴다(짐이 무거우면 더). 배고프면 숨 고르기가 느리다.';
        pvpBadgeForSprint.parentNode.insertBefore(sprintBadge, pvpBadgeForSprint);
      }
      const canSp = mySprint && myCanSprint;
      sprintBadge.textContent = canSp ? '달리기' : (myStamLock ? '숨참' : (mySprint ? '지침' : '걷기'));
      sprintBadge.style.background = canSp ? 'rgba(var(--stam-rgb), 0.35)' : '';
    }
    // PvP 뱃지
    const pvpBadge = document.getElementById('pvpBadge');
    if (pvpBadge) {
      pvpBadge.textContent = myPvpEnabled ? 'PvP 켜짐' : 'PvP 꺼짐';
      pvpBadge.style.background = myPvpEnabled ? 'rgba(var(--hp-rgb), 0.4)' : '';
      pvpBadge.onclick = () => sendPrimary({ type: 'pvp_set', enabled: !myPvpEnabled });
      pvpBadge.style.cursor = 'pointer';
    }
    // 건축 층 뱃지
    let floorBadge = document.getElementById('floorBadge');
    if (!floorBadge && pvpBadge) {
      floorBadge = document.createElement('span');
      floorBadge.id = 'floorBadge';
      floorBadge.className = 'badge';
      floorBadge.title = '건축 층 (Z=위, X=아래)';
      pvpBadge.parentNode.insertBefore(floorBadge, pvpBadge.nextSibling);
    }
    if (floorBadge) floorBadge.textContent = `짓:${myBuildFloor}F · 서:${myFloor}F`;
    // 음식/extra 인벤토리
    const foodRow = document.getElementById('invFoodRow');
    if (foodRow) {
      const items = Object.keys(inventory || {}).filter(k => (inventory[k] || 0) > 0 && !!foodEffects[k]);
      foodRow.innerHTML = '';
      for (const k of items) {
        const sp = document.createElement('span');
        const isFood = !!foodEffects[k];
        sp.className = 'inv' + (isFood ? '' : ' disabled');
        sp.innerHTML = `${itemIconHtml(k, 18)} ${itemKo(k)} ${inventory[k]}`;   // ★[T55] 정본 우선(종전엔 표에 없으면 `undefined` 를 찍었다)
        if (isFood) {
          const eff = foodEffects[k];
          sp.title = `먹기 (+허기 ${eff.hunger||0}${eff.thirst?', +갈증 '+eff.thirst:''}${eff.hpDelta?', HP '+eff.hpDelta:''})`;
          sp.onclick = () => sendPrimary({ type: 'eat', item: k });
        } else {
          sp.title = `${itemKo(k)} (먹을 수 없음 — 가공/거래용)`;   // ★[T55]
        }
        foodRow.appendChild(sp);
      }
    }
    let total = 1;
    for (const c of conns.values()) total += c.others.size;
    document.getElementById('playerCount').textContent = `${total}명`;
    const simLat = primaryZoneId ? (zonesMeta[primaryZoneId]?.simulatedLatencyMs || 0) * 2 : 0;
    const rttStr = lastRttMs > 0 ? `${Math.round(lastRttMs)}ms` : '측정중';
    document.getElementById('pingBadge').textContent = `${rttStr}`;
    if (primaryZoneId) {
      document.getElementById('zoneBadge').textContent =
        `${zonesMeta[primaryZoneId].displayName}`;
      const zm = zonesMeta[primaryZoneId];
      const lx = myAbsPredicted.x - zm.worldOffsetX;
      const ly = myAbsPredicted.y - (zm.worldOffsetY || 0);
      // 14.49-e6-a: z 좌표 = floor*FLOOR_HEIGHT + stair z (실제 픽셀 높이)
      const totalZ = myFloor * FLOOR_HEIGHT + (myStairZ || 0);
      document.getElementById('coordBadge').textContent =
        `월드(x=${Math.round(myAbsPredicted.x)}, y=${Math.round(myAbsPredicted.y)}, z=${Math.round(totalZ)}px) · 로컬(${Math.round(lx)}, ${Math.round(ly)})`;
    }
    const { wx, wy } = worldKeysDir();
    const dir = (wx === 0 && wy === 0) ? '정지' :
      ((wy < 0 ? '북' : wy > 0 ? '남' : '') + (wx > 0 ? '동' : wx < 0 ? '서' : '') || '?');
    document.getElementById('velBadge').textContent =
      `방향: ${dir} (vx=${wx.toFixed(2)}, vy=${wy.toFixed(2)})`;
    // 시간 뱃지 — 낮/밤/황혼/새벽 아이콘
    const tb = document.getElementById('timeBadge');
    if (tb) {
      const p = worldPhase();
      const dr = worldClock ? worldClock.dayPhaseRatio : 0.7;
      // ★[T66] 하루의 때 — 이모지 대신 **선 아이콘 이름**. 배지는 `data-ico` 로 그림을 받는다.
      //   갈래는 종전과 같다(☀️/🌅/🌇/🌙/🌄 자리에 이름이 들어갔을 뿐 — 판단은 무변).
      let icon = 'sun';
      if (p < 0.05) icon = 'horizon';
      else if (p < dr - 0.05) icon = 'sun';
      else if (p < dr) icon = 'horizon';
      else if (p < 0.95) icon = 'moon';
      else icon = 'horizon';
      // ★[T66] 아이콘은 배지의 `data-ico` 로 바뀐다(글자에 섞지 않는다 — 이름이 그대로 찍혔다).
      tb.dataset.ico = icon;
      if (window.__paintIcons) window.__paintIcons(tb.parentNode || document);
      tb.lastChild && tb.lastChild.nodeType === 3
        ? (tb.lastChild.nodeValue = ` ${gameTimeString()}${isNight() ? ' (밤)' : ''}`)
        : tb.appendChild(document.createTextNode(` ${gameTimeString()}${isNight() ? ' (밤)' : ''}`));
    }
    // ★★[달력 2026-08-30 재민 확정] 시각 옆에 **연·계절·일**. 표시값은 서버가 econ 정본에서
    //   유도해 준 것 그대로다 — 클라는 문장만 만든다(매핑 사본 금지).
    const cb = document.getElementById('calBadge');
    if (cb) {
      if (myCalendar) {
        cb.textContent = `${myCalendar.year}년 ${myCalendar.seasonKo} ${myCalendar.dayOfSeason}일`;
        cb.title = `econ 게임일 ${myCalendar.day} · 연중 ${myCalendar.dayOfYear + 1}/${myCalendar.yearDays}일`
          + ` · 이 계절 ${myCalendar.seasonDays}일`;
        cb.hidden = false;
      } else cb.hidden = true;
    }
    // ★★[온도 곡선 2026-08-31] 바깥 날씨 배지 — **왜 덜 추운지까지 말한다**.
    //   재민 확정 "12월과 1월과 2월이 같은 강도는 아니지" ⇒ 계절 이름이 아니라 **그날의 세기**를 보여 준다.
    //   툴팁이 마을 완충을 밝히는 이유: 마을이 안전망이라는 걸 화면이 말해야 플레이어가 그걸 **선택**할 수 있다.
    const wb = document.getElementById('wxBadge');
    if (wb) {
      if (myWeather) {
        const sh = Math.max(0, Math.min(1, myWeather.shelter || 0));
        const txt = ` ${myWeather.ko}${sh > 0.15 ? ' · 마을' : ''}`;
        // ★[T66] 서버가 같이 보내는 `emo` 는 **안 쓴다**(화면 규칙 B — UI 이모지 0).
        //   그림은 추위 축에서 고른다. 서버 이름표(7칸)를 베끼지 않으려고 **굵은 세 칸**만 쓴다 —
        //   이건 이름이 아니라 그림이고, 문장은 여전히 서버가 준 `ko` 하나다.
        const wIco = myWeather.cold < 0.35 ? 'sun' : (myWeather.cold < 0.75 ? 'cloud' : 'snow');
        if (wb.dataset.ico !== wIco) { wb.dataset.ico = wIco; if (window.__paintIcons) window.__paintIcons(wb.parentNode || document); }
        else if (window.__paintIcons) window.__paintIcons(wb.parentNode || document);
        const tip = `바깥 ${myWeather.tempC != null ? myWeather.tempC + '℃ · ' : ''}추위 ${Math.round(myWeather.cold * 100)}%${myWeather.night ? ' (밤)' : ' (낮)'}`
          // ★[옷 티어] 옷이 **몇 ℃ 를 벌어 주는지**를 말한다 — 그래야 "가죽옷을 살까"가 판단이 된다.
          + (myWeather.insC > 0 ? ` · 입은 옷이 체감 +${myWeather.insC}℃` : ' · 맨몸 — 옷이 없다')
          + (sh > 0.01 ? ` · 마을 미기후가 ${Math.round((myWeather.cut || 0) * 100)}% 막아 준다` : ' · 야생 — 막아 주는 것이 없다')
          + ' · 모닥불·실내는 여기에 더해 몸에 적용된다';
        // ★값이 그대로면 **DOM 을 안 건드린다** — `updateHud` 는 100ms 마다 도는데 날씨는 초당 1회
        //   바뀔까 말까다. 매번 쓰면 그때마다 HUD 줄의 스타일·레이아웃이 다시 계산된다
        //   (헤드리스 SwiftShader 에서 실제로 프레임에 얹힌다 — `e2e-waterperf` 배율이 그걸 잡았다).
        // ★[T66] `textContent` 로 쓰면 앞에 넣은 선 아이콘까지 지워진다 ⇒ **끝의 글자 마디만** 고친다.
        const wtn = (wb.lastChild && wb.lastChild.nodeType === 3) ? wb.lastChild : wb.appendChild(document.createTextNode(''));
        if (wtn.nodeValue !== txt) wtn.nodeValue = txt;
        if (wb.title !== tip) wb.title = tip;
        if (wb.hidden) wb.hidden = false;
      } else if (!wb.hidden) wb.hidden = true;
    }
  }
  // 좌표는 실시간 갱신이 자연스러워서 더 자주
  setInterval(updateHud, 100);

  function updateMinimap() {
    const row = document.getElementById('miniRow');
    if (!row) return;
    if (!row.dataset.built) {
      row.innerHTML = '';
      // 14.46-a: 24 zone × 가변 크기 → worldOffsetX/Y 기준으로 절대 위치 배치 (실제 지리 반영)
      const W = row.clientWidth || 320, H = row.clientHeight || 200;
      const sx = W / worldWidth, sy = H / worldHeight;
      for (const z of Object.values(zonesMeta)) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        cell.style.background = z.groundColor;
        cell.style.left = (z.worldOffsetX * sx) + 'px';
        cell.style.top  = ((z.worldOffsetY||0) * sy) + 'px';
        cell.style.width  = (z.zoneWidth * sx) + 'px';
        cell.style.height = (z.zoneHeight * sy) + 'px';
        cell.dataset.zone = z.id;
        const label = document.createElement('span');
        // 짧은 이름 (괄호 부분 제거)
        const short = (z.displayName || z.id).split(' ')[0].replace(/\(.*?\)/g, '').trim();
        label.textContent = short;
        cell.appendChild(label);
        row.appendChild(cell);
      }
      // dot — 따로 1개만 (활성 zone 위에 띄움). 절대 좌표 기준이라 어느 zone이든 같은 dot 위치 사용.
      const dot = document.createElement('div');
      dot.className = 'mini-dot';
      dot.id = 'miniDot';
      row.appendChild(dot);
      row.dataset.built = '1';
    }
    // 매 프레임: active zone 표시 + dot 위치 갱신
    const W = row.clientWidth || 320, H = row.clientHeight || 200;
    const sx = W / worldWidth, sy = H / worldHeight;
    for (const cell of row.children) {
      if (!cell.dataset.zone) continue;
      const id = cell.dataset.zone;
      const c = conns.get(id);
      cell.classList.toggle('active', id === primaryZoneId);
      cell.style.opacity = id === primaryZoneId ? 1 : (c && c.role === 'observer') ? 0.85 : 0.5;
    }
    const dot = document.getElementById('miniDot');
    if (dot) {
      dot.style.left = (myAbsPredicted.x * sx) + 'px';
      dot.style.top  = (myAbsPredicted.y * sy) + 'px';
    }
  }

  function renderChatLog() {
    const el = document.getElementById('chatLog');
    if (!el) return;
    el.innerHTML = '';
    const lines = chatLog.slice(-5); // 최근 5줄만
    for (const line of lines) {
      const div = document.createElement('div');
      div.className = 'chat-line';
      div.style.borderLeftColor = line.color;
      const nameSpan = document.createElement('b');
      nameSpan.style.color = line.color;
      nameSpan.textContent = line.name + ':';
      div.appendChild(nameSpan);
      div.appendChild(document.createTextNode(' ' + line.text));
      el.appendChild(div);
    }
  }

