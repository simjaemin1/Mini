// @@split:44-h-hud — H — 컨텍스트 메뉴·핫키바·updateHud·미니맵·채팅로그 (T53 ④)
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
    m.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:rgba(20,25,32,0.97);border:1px solid #5a7ab0;border-radius:6px;z-index:99999;min-width:180px;padding:4px;box-shadow:0 4px 16px rgba(0,0,0,0.5);font-size:13px;color:#fff;font-family:sans-serif`;
    for (const opt of options) {
      const it = document.createElement('div');
      it.textContent = opt.label;
      it.style.cssText = 'padding:8px 14px;cursor:pointer;border-radius:4px;user-select:none';
      it.onmouseenter = () => it.style.background = 'rgba(90,122,176,0.3)';
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
      <div id="hkSlot1" data-slot="1" style="pointer-events:auto;width:64px;height:64px;background:rgba(15,18,22,0.92);border:2px solid #444;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;user-select:none">
        <div style="position:absolute;top:2px;left:4px;font-size:10px;color:#8a93a0;font-weight:bold">1</div>
        <div class="hk-icon" style="font-size:24px;line-height:1">·</div>
        <div class="hk-label" style="font-size:9px;color:#6c7686;margin-top:1px">비어있음</div>
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
        slot.style.borderColor = '#f0c674';
      }
    });
    slot.addEventListener('dragleave', () => {
      slot.style.borderColor = (equipped && equipped === hotkey1) ? '#7cd97c' : '#444';
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
    const TOOL_ICON_MAP = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
    const iconEl = slot.querySelector('.hk-icon');
    const labelEl = slot.querySelector('.hk-label');
    if (hotkey1) {
      const inst = toolItems.find(t => t.id === hotkey1);
      if (inst) {
        iconEl.textContent = TOOL_ICON_MAP[inst.type] || '🔧';
        const dur = `${inst.d}/${inst.max}`;
        const isEq = (equipped === inst.id);
        labelEl.textContent = isEq ? '✓착용 중' : '대기';
        labelEl.style.color = isEq ? '#7cd97c' : '#8fc8ff';
        slot.style.borderColor = isEq ? '#7cd97c' : '#5a7ab0';
        slot.style.background = isEq ? 'rgba(40,80,40,0.92)' : 'rgba(15,18,22,0.92)';
        slot.title = `${inst.type} (${dur}) — 1키 또는 클릭 = 토글, 우클릭 = 슬롯 비우기`;
      } else {
        // hotkey instance 사라짐 (서버에서 cleanup될 거임)
        iconEl.textContent = '·';
        labelEl.textContent = '깨짐';
        labelEl.style.color = '#e07060';
        slot.style.borderColor = '#444';
        slot.style.background = 'rgba(15,18,22,0.92)';
      }
    } else {
      iconEl.textContent = '·';
      labelEl.textContent = '비어있음';
      labelEl.style.color = '#6c7686';
      slot.style.borderColor = '#444';
      slot.style.background = 'rgba(15,18,22,0.92)';
      slot.title = '인벤에서 도구를 드래그해서 등록 (1키로 토글)';
    }
  }
  function updateHud() {
    onbHudLine();   // ★[온보딩 v2] 하루 정산·기여 한 줄(§9.4) — 새 패널 0, HUD 한 줄
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
      const icons = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️' };
      // 14.53: equipped = toolItemId → instance 찾아 type 표시
      const inst = equipped ? findToolInstance(equipped) : null;
      if (inst) {
        const TOOL_ICON_MAP2 = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
        eqEl.textContent = `${TOOL_ICON_MAP2[inst.type] || ''} ${inst.type} ${inst.d}/${inst.max}`;
      } else {
        eqEl.textContent = '맨손';
      }
    }
    const hpEl = document.getElementById('hpFill');
    if (hpEl) {
      hpEl.style.width = `${Math.max(0, (myHp / myMaxHp) * 100)}%`;
      document.getElementById('hpText').textContent = `${Math.round(myHp)}/${myMaxHp}`;
    }
    // hunger / thirst bar
    const hungerEl = document.getElementById('hungerFill');
    if (hungerEl) {
      hungerEl.style.width = `${Math.max(0, myHunger)}%`;
      document.getElementById('hungerText').textContent = `🍖 ${Math.round(myHunger)}${myCold ? ' 🥶추움' : ''}`;
    }
    const thirstEl = document.getElementById('thirstFill');
    if (thirstEl) {
      thirstEl.style.width = `${Math.max(0, myThirst)}%`;
      document.getElementById('thirstText').textContent = `💧 ${Math.round(myThirst)}`;
    }
    // ★[신체 3층 재배선] 스태미나 — 잠기면(바닥나 숨 고르는 중) 색이 바뀐다.
    //   회복 배율이 1 이 아니면 그 사실도 적는다("왜 안 차는가"를 화면이 말한다).
    const stamEl = document.getElementById('stamFill');
    if (stamEl) {
      stamEl.style.width = `${Math.max(0, Math.min(100, myStam * 100))}%`;
      stamEl.classList.toggle('locked', !!myStamLock);
      const rTxt = (myRecover < 0.999) ? ` <span style="opacity:.75">회복 ×${myRecover.toFixed(2)}</span>` : '';
      document.getElementById('stamText').innerHTML = `⚡ ${Math.round(myStam * 100)}${rTxt}`;
    }
    const vpEl = document.getElementById('vpFill');
    if (vpEl) {
      vpEl.style.width = `${Math.max(0, Math.min(100, myVp))}%`;
      const txt = myVp >= VP_THRESHOLD
        ? `⚠️ 적대감 ${Math.round(myVp)} — 내 영지 보호 해제됨!`
        : `⚖️ 적대감 ${Math.round(myVp)}/${VP_THRESHOLD}`;
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
      sprintBadge.textContent = canSp ? '🏃 달리기' : (myStamLock ? '😩 숨참' : (mySprint ? '😩 지침' : '🚶 걷기'));
      sprintBadge.style.background = canSp ? 'rgba(80,180,80,0.35)' : '';
    }
    // PvP 뱃지
    const pvpBadge = document.getElementById('pvpBadge');
    if (pvpBadge) {
      pvpBadge.textContent = myPvpEnabled ? '⚔️ PvP ON' : '🕊️ PvP OFF';
      pvpBadge.style.background = myPvpEnabled ? 'rgba(176,48,48,0.4)' : '';
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
    if (floorBadge) floorBadge.textContent = `🏗️ 짓:${myBuildFloor}F · 🚶 ${myFloor}F`;
    // 음식/extra 인벤토리
    const foodRow = document.getElementById('invFoodRow');
    if (foodRow) {
      const items = Object.keys(ITEM_ICONS).filter(k => (inventory[k] || 0) > 0);
      foodRow.innerHTML = '';
      for (const k of items) {
        const sp = document.createElement('span');
        const isFood = !!foodEffects[k];
        sp.className = 'inv' + (isFood ? '' : ' disabled');
        sp.innerHTML = `${itemIconHtml(k, 18)} ${ITEM_LABEL[k]} ${inventory[k]}`;
        if (isFood) {
          const eff = foodEffects[k];
          sp.title = `먹기 (+허기 ${eff.hunger||0}${eff.thirst?', +갈증 '+eff.thirst:''}${eff.hpDelta?', HP '+eff.hpDelta:''})`;
          sp.onclick = () => sendPrimary({ type: 'eat', item: k });
        } else {
          sp.title = `${ITEM_LABEL[k]} (먹을 수 없음 — 가공/거래용)`;
        }
        foodRow.appendChild(sp);
      }
    }
    let total = 1;
    for (const c of conns.values()) total += c.others.size;
    document.getElementById('playerCount').textContent = `${total}명`;
    const simLat = primaryZoneId ? (zonesMeta[primaryZoneId]?.simulatedLatencyMs || 0) * 2 : 0;
    const rttStr = lastRttMs > 0 ? `${Math.round(lastRttMs)}ms` : '측정중';
    document.getElementById('pingBadge').textContent = `📡 RTT ${rttStr} (sim ${simLat}ms)`;
    if (primaryZoneId) {
      document.getElementById('zoneBadge').textContent =
        `📍 ${zonesMeta[primaryZoneId].displayName}`;
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
      let icon = '☀️';
      if (p < 0.05) icon = '🌅';
      else if (p < dr - 0.05) icon = '☀️';
      else if (p < dr) icon = '🌇';
      else if (p < 0.95) icon = '🌙';
      else icon = '🌄';
      tb.textContent = `${icon} ${gameTimeString()}${isNight() ? ' (밤)' : ''}`;
    }
    // ★★[달력 2026-08-30 재민 확정] 시각 옆에 **연·계절·일**. 표시값은 서버가 econ 정본에서
    //   유도해 준 것 그대로다 — 클라는 문장만 만든다(매핑 사본 금지).
    const cb = document.getElementById('calBadge');
    if (cb) {
      if (myCalendar) {
        cb.textContent = `📅 ${myCalendar.year}년 ${myCalendar.seasonKo} ${myCalendar.dayOfSeason}일`;
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
        const txt = `${myWeather.emo} ${myWeather.ko}${sh > 0.15 ? ' · 마을' : ''}`;
        const tip = `바깥 ${myWeather.tempC != null ? myWeather.tempC + '℃ · ' : ''}추위 ${Math.round(myWeather.cold * 100)}%${myWeather.night ? ' (밤)' : ' (낮)'}`
          // ★[옷 티어] 옷이 **몇 ℃ 를 벌어 주는지**를 말한다 — 그래야 "가죽옷을 살까"가 판단이 된다.
          + (myWeather.insC > 0 ? ` · 입은 옷이 체감 +${myWeather.insC}℃` : ' · 맨몸 — 옷이 없다')
          + (sh > 0.01 ? ` · 마을 미기후가 ${Math.round((myWeather.cut || 0) * 100)}% 막아 준다` : ' · 야생 — 막아 주는 것이 없다')
          + ' · 모닥불·실내는 여기에 더해 몸에 적용된다';
        // ★값이 그대로면 **DOM 을 안 건드린다** — `updateHud` 는 100ms 마다 도는데 날씨는 초당 1회
        //   바뀔까 말까다. 매번 쓰면 그때마다 HUD 줄의 스타일·레이아웃이 다시 계산된다
        //   (헤드리스 SwiftShader 에서 실제로 프레임에 얹힌다 — `e2e-waterperf` 배율이 그걸 잡았다).
        if (wb.textContent !== txt) wb.textContent = txt;
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

