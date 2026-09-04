// @@split:30-n-net — N 네트워크 — boot·연결·헬스

  function sendPrimary(obj) {
    const c = conns.get(primaryZoneId);
    if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
  }
  // ★★[11차 T4에서 드러난 좌표계 결함] 커서 배치 좌표(atX/atY)는 **존 로컬**로 보내야 한다.
  //   서버의 player.x는 존 로컬인데(클라가 welcome에서 worldOffsetX를 더해 절대로 만든다),
  //   지금까지 클라는 화면 역투영한 **절대** 좌표를 그대로 실어 보냈다. worldOffset이 0인 존(canadia)에선
  //   두 값이 같아 아무 문제가 없었지만, 한반도(offset 409,984px)에선 거리 검사가 **항상** 실패한다
  //   ("너무 멀어서 …") — 움집터·길드 곳간·아이템 배치가 전부 같은 결함을 공유했다.
  //   여기서 한 번에 로컬로 접어 보낸다(서버 계약은 그대로, 클라가 프레임을 맞춘다).
  function absToLocalAt(obj) {
    const c = conns.get(primaryZoneId);
    const ox = (c && c.meta && c.meta.worldOffsetX) || 0, oy = (c && c.meta && c.meta.worldOffsetY) || 0;
    if (typeof obj.atX === 'number') obj.atX -= ox;
    if (typeof obj.atY === 'number') obj.atY -= oy;
    return obj;
  }
  function sendPrimaryAt(obj) { return sendPrimary(absToLocalAt(obj)); }
  // 미니맵 등 외부에서 호출 가능하게 노출
  window.__sendPrimary = sendPrimary;
  window.__sendPrimaryAt = sendPrimaryAt;
  window.__getInv = () => ({ ...inventory });   // ★진단 훅(읽기 전용) — 재료 선납 차감 실측용
  // ★[빈손 시작 2026-08-28] 도구·장비 진단 훅(읽기 전용) — `e2e-emptystart` 가 두 단 사다리를 밟는 데 쓴다.
  window.__getTools = () => (toolItems || []).map((t) => ({ ...t }));
  window.__getEquipped = () => equipped || null;
  // ★[빈손 시작 2026-08-28] 내구도 함께 노출 — 하네스가 "자작 vs 정품"의 **층**을 화면 값으로 잰다(읽기 전용).
  window.__getEquipment = () => (equipment || []).map((e) => ({ type: e.type, id: e.id, dura: e.dura, durMax: e.durMax }));
  window.__getPrimaryZoneId = () => primaryZoneId;
  // ★[2026-08-03f 배치 13] 진단 훅 — **내 영속 신원**(등록 계정이면 username, 게스트면 anon_<고정>).
  //   토큰은 **노출하지 않는다** — 하네스도 localStorage 에서 직접 읽는다(코드가 값을 흘리지 않게).
  window.__getPlayerId = () => myPlayerId;
  // ★[배산임수 감사 2026-08-29] 게이지 진단 훅 — 하네스가 "둠벙에서 실제로 마셔지는가"를 화면 값으로 잰다(읽기 전용).
  window.__calendar = () => (myCalendar ? JSON.parse(JSON.stringify(myCalendar)) : null);
  window.__wx = () => (myWeather ? JSON.parse(JSON.stringify(myWeather)) : null);   // ★[온도] 하네스 훅(읽기 전용)
  // ★[옷 티어 2026-08-31] 장비 진단 훅(읽기 전용) — 하네스가 '무엇을 입었나'를 화면 상태로 잰다.
  window.__equipState = () => JSON.parse(JSON.stringify({ equipment: equipment || [], slots: equipSlots || {} }));
  window.__getGauges = () => ({ hunger: myHunger, thirst: myThirst, vp: myVp,
    stam: myStam, stamLock: myStamLock, canSprint: myCanSprint, recover: myRecover });
  // ★[시설 제작창 2026-08-29] 진단 훅 — 하네스가 "창이 실제로 열렸는가 · 대기열이 도는가"를 화면 상태로 잰다(읽기 전용).
  window.__getFacility = () => myFacility;
// @@moved:6049

  // === 부트 ===
  async function boot() {
    const res = await fetch('/zones');
    const data = await res.json();
    zonesMeta = data.zones;
    marketplaceUrl = data.marketplaceUrl || '';
    // Phase 14.46-b-mini: 모든 zone water tiles 사전 계산 (~수만 tiles, ~100ms)
    try { precomputeAllWaterTiles(); } catch (e) { console.warn('water tile compute fail:', e); }

    // 2D 그리드 월드 크기 계산
    worldWidth = 0;
    worldHeight = 0;
    for (const z of Object.values(zonesMeta)) {
      worldWidth = Math.max(worldWidth, z.worldOffsetX + (z.zoneWidth || 100000));
      worldHeight = Math.max(worldHeight, (z.worldOffsetY || 0) + (z.zoneHeight || 100000));
    }

    // localStorage에서 이전 프로필 복원 (패스워드는 저장 안 함 — 매번 입력)
    const savedName = localStorage.getItem('durango_username');
    if (savedName) document.getElementById('name').value = savedName;
    const savedColor = localStorage.getItem('durango_color');
    myColor = savedColor && COLORS.includes(savedColor) ? savedColor : COLORS[0];
    // ★[배치 13] 게스트 영속 신원 토큰 복원 — 이게 있으면 서버가 **같은 사람**으로 맞아 준다.
    //   화면에 표시하지 않는다(입력칸도 없다). 브라우저를 청소하면 새 사람이 되는 것이 정상이다.
    try { myGuestToken = localStorage.getItem(GUEST_TOKEN_KEY) || ''; } catch (e) { myGuestToken = ''; }

    // ★★[T66 · 재민 확정 3] **색 선택은 없앴다.** 팔레트 UI(`#colorPicker`)와 그 코드가 여기 있었다.
    //   ⚠서버 접점 0: `?color=` 는 `#rrggbb` 일 때만 서버가 쓰고 아니면 자기 기본값을 쓴다(zone.js 실측).
    //     클라는 종전 기본값 `COLORS[0]` 을 그대로 보낸다 — 위 `myColor` 초기화가 이미 그 값이다.
    const sel = document.getElementById('startZone');
    // ★[로비 죽은 존 UX] central의 /zones는 각 존 /health 폴링 결과를 population/cap으로 실어 준다 —
    //   응답 못 받은 존은 population=null·cap=null. 이게 곧 생존 신호다(브라우저에서 존 /health를 직접
    //   부를 수는 없다 — 존 HTTP는 /lifedbg 외 CORS 미개방).
    //   종전엔 이 신호를 안 써서 죽은 존이 그대로 목록에 남았고, data.defaultZone이 응답에 아예 없어
    //   selected가 하나도 안 붙어 **첫 옵션(canadia=죽은 존)이 기본 선택**됐다.
    //   → 첫 입장이 조용히 실패(primary ws가 CLOSED, welcome 0건)하고 "서버가 죽었다"고 오진하게 된다.
    const zoneAlive = (z) => z && z.population !== null && z.population !== undefined && !!z.cap;
    function refreshZoneOptions() {
      const prev = sel.value;
      sel.innerHTML = '';
      let liveN = 0, firstLive = null;
      for (const [id, z] of Object.entries(zonesMeta)) {
        const opt = document.createElement('option');
        opt.value = id;
        const alive = zoneAlive(z);
        const popPart = alive ? ` · ${z.population}/${z.cap}명${z.full ? ' (가득참)' : ''}` : '';
        opt.textContent = `${z.displayName} (RTT ≈ ${(z.simulatedLatencyMs || 0) * 2}ms)${popPart}${alive ? '' : ' — 점검 중'}`;
        if (!alive) { opt.disabled = true; opt.style.color = 'var(--dim-2)'; }   // 죽은 존 = 흐리게 + 선택 불가
        else { liveN++; if (!firstLive) firstLive = id; }
        if (z.full) opt.disabled = true;
        sel.appendChild(opt);
      }
      // 기본 선택 = ①직전 선택(살아있으면) ②central 기본존(살아있으면) ③hanbando ④첫 생존 존
      const want = [prev, data.defaultZone, 'hanbando', firstLive]
        .find(id => id && zonesMeta[id] && zoneAlive(zonesMeta[id]) && !zonesMeta[id].full);
      if (want) sel.value = want;
      // 전멸 시 안내(빈 화면 금지)
      let warn = document.getElementById('zoneDeadWarn');
      if (!liveN) {
        if (!warn) {
          warn = document.createElement('div');
          warn.id = 'zoneDeadWarn';
          warn.style.cssText = 'margin-top:8px;padding:8px 10px;border-radius: 0;background:var(--inset);border:1px solid var(--accent);color:var(--accent);font-size:13px;line-height:1.5';
          warn.textContent = '현재 접속 가능한 지역이 없습니다. 서버 점검 중일 수 있어요 — 잠시 후 자동으로 다시 확인합니다.';
          (document.getElementById('zoneRow') || sel.parentNode).appendChild(warn);
        }
        warn.style.display = 'block';
        if (enterBtn) { enterBtn.disabled = true; }
      } else {
        if (warn) warn.style.display = 'none';
        if (enterBtn) enterBtn.disabled = false;
      }
      return liveN;
    }
    const enterBtn = document.getElementById('enter');
    refreshZoneOptions();
    // 짧은 폴링(15초) — 존이 살아나면 자동으로 선택 가능해진다. 실패는 조용히 무시(로비가 깨지면 안 됨).
    setInterval(async () => {
      try {
        const r = await fetch('/zones', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!j || !j.zones) return;
        for (const [id, z] of Object.entries(j.zones)) {
          if (zonesMeta[id]) { zonesMeta[id].population = z.population; zonesMeta[id].cap = z.cap; zonesMeta[id].full = z.full; }
          else zonesMeta[id] = z;
        }
        if (!document.getElementById('lobby').classList.contains('hidden')) refreshZoneOptions();
      } catch (e) { /* 조용히 무시 */ }
    }, 15000);

    // 14.42-a: 이름 입력 시 기존 계정 여부 확인 → zone picker 토글
    //   - 게스트(이름+비번 없음): picker 노출 — 지역 직접 선택
    //   - 신규 가입(이름+비번 있음, DB에 없음): picker 노출 — 영구 home 됨
    //   - 기존 로그인(이름+비번 있음, DB에 있음): picker 숨김 + last_zone 자동 사용
    const nameInput = document.getElementById('name');
    const pwInput = document.getElementById('password');
    const zoneRow = document.getElementById('zoneRow');
    const existingHint = document.getElementById('existingLoginHint');
    let checkTimer = null;
    let lastCheckedName = null;
    // 기존 계정의 자동 라우팅용 — 마지막에 fetch한 player.last_zone (or home_zone)
    window.__autoZone = null;
    async function refreshLobbyMode() {
      const u = nameInput.value.trim();
      const p = pwInput.value;
      if (!u || !p) {
        zoneRow.classList.remove('hidden');
        existingHint.classList.add('hidden');
        window.__autoZone = null;
        return;
      }
      if (u === lastCheckedName) return; // debounce
      lastCheckedName = u;
      try {
        const r = await fetch('/check_username', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u }) });
        const d = await r.json();
        if (d.taken) {
          zoneRow.classList.add('hidden');
          existingHint.classList.remove('hidden');
          // 기존 계정 — last_zone/home_zone 가져와서 자동 라우팅
          try {
            const r2 = await fetch('/player/' + encodeURIComponent(u));
            if (r2.ok) {
              const pd = await r2.json();
              const dest = (pd.player?.last_zone) || (pd.player?.home_zone);
              if (dest && zonesMeta[dest]) {
                window.__autoZone = dest;
                existingHint.innerHTML = `기존 계정 — <b>${zonesMeta[dest].displayName}</b>의 마지막 위치에서 시작합니다`;
              }
            }
          } catch (e) {}
        } else {
          zoneRow.classList.remove('hidden');
          existingHint.classList.add('hidden');
          window.__autoZone = null;
        }
      } catch (e) {
        zoneRow.classList.remove('hidden');
        existingHint.classList.add('hidden');
        window.__autoZone = null;
      }
    }
    function debouncedCheck() {
      if (checkTimer) clearTimeout(checkTimer);
      checkTimer = setTimeout(refreshLobbyMode, 250);
    }
    nameInput.addEventListener('input', debouncedCheck);
    pwInput.addEventListener('input', debouncedCheck);

    // 로비에서 10초마다 zone 인구 갱신
    const zoneRefreshTimer = setInterval(async () => {
      if (document.getElementById('lobby').classList.contains('hidden')) {
        clearInterval(zoneRefreshTimer);
        return;
      }
      try {
        const r = await fetch('/zones');
        const d = await r.json();
        zonesMeta = d.zones;
        refreshZoneOptions();
      } catch (e) {}
    }, 10000);

    // ★★[게스트 안내 2026-08-30] 저장된 게스트 몸이 있을 때만 안내를 띄운다(없으면 할 말이 없다).
    //   ★토큰은 **절대 화면에 안 찍는다**(배치 13 규약) — 있다/없다만 말한다.
    (function _guestNoteInit() {
      const box = document.getElementById('guestNote');
      if (!box) return;
      const paint = () => {
        const has = !!(myGuestToken || localStorage.getItem(GUEST_TOKEN_KEY));
        const named = (document.getElementById('name').value || '').trim();
        box.classList.toggle('hidden', !has || !!named);   // 계정명을 적었으면 게스트가 아니다
      };
      paint();
      const nameEl = document.getElementById('name');
      if (nameEl) nameEl.addEventListener('input', paint);
      const rst = document.getElementById('guestReset');
      if (rst) rst.onclick = () => {
        // 새 몸 = **토큰 폐기**. 옛 몸은 서버에 그대로 남는다(지우지 않는다 — 되돌릴 수 없는 일은 안 한다).
        try { localStorage.removeItem(GUEST_TOKEN_KEY); } catch (e) {}
        myGuestToken = null;
        box.innerHTML = '<b>새 몸으로 시작합니다.</b> 옛 게스트 캐릭터는 서버에 남아 있지만'
          + ' 이 브라우저에서는 다시 열 수 없습니다(열쇠를 버렸습니다).';
      };
    })();

    // ★[온보딩 v2] 시작 화면 — 마을 선택 지도(§9.1). 판정·목록은 전부 서버(`server/onboarding.js`).
    // ★★[T82 ⓪ · 재민 승인] T68 이 여기 둔 **임시 지연 두 줄을 지웠다.** 근본 수리가 왔기 때문이다:
    //   `boot()` 을 부르는 자리가 `50-i-panel.js`(조각 20) 최상위 문 → **`99-main.js`**(조각 25) 로 옮겼다.
    //   ⇒ 이 함수가 사는 `70-lobby.js`(조각 24)가 **반드시 먼저 실려 있다**. 경주 자체가 없어졌다.
    onbLobbyInit();
    document.getElementById('enter').onclick = () => {
      const inputName = document.getElementById('name').value.trim();
      const inputPw = document.getElementById('password').value;
      myName = inputName || '여행자';
      myUsername = inputName; // 빈 문자열이면 게스트
      myPassword = inputPw;
      if (inputName) localStorage.setItem('durango_username', inputName);
      localStorage.setItem('durango_color', myColor);
      document.getElementById('authError').classList.add('hidden');
      // 재진입 시 모든 클라 상태 초기화
      kicked = false;
      initialWelcomeReceived = false;
      chatActive = false;
      keys.clear();
      // 채팅 입력창 비활성화 상태로
      const chatInput = document.getElementById('chatInput');
      if (chatInput) { chatInput.classList.remove('active'); chatInput.blur(); chatInput.value = ''; }
      // 14.42-a: 기존 계정이면 last_zone/home_zone으로 자동 라우팅 (zone picker 무시)
      const startZone = window.__autoZone || sel.value;
      document.getElementById('lobby').classList.add('hidden');
      document.getElementById('game').classList.remove('hidden');
      connect(startZone, 'primary', null);
      // setupChat과 loop는 한 번만
      if (!chatSetup) { setupChat(); chatSetup = true; }
      if (!loopStarted) { loopStarted = true; loop(); }
    };

    // RTT 측정 — 1초마다 primary에 ping
    // 14.43: pong watchdog — 5초 이상 pong 못 받으면 ws 좀비로 간주, 강제 close → 자동 재연결
    setInterval(() => {
      const c = conns.get(primaryZoneId);
      if (!c || c.ws.readyState !== 1) return;
      const now = performance.now();
      // 초기엔 lastPongAt 없으니까 첫 ping부터 기록 시작
      if (!c.lastPongAt && c.firstPingAt && now - c.firstPingAt > 15000) {
        console.warn('[recover] ping 후 15초간 pong 한 번도 못 받음 — ws 좀비, 강제 close');
        try { c.ws.close(); } catch (e) {}
        return;
      }
      if (c.lastPongAt && now - c.lastPongAt > 7000) {
        console.warn(`[recover] pong 마지막 ${((now - c.lastPongAt)/1000).toFixed(1)}초 전 — ws 좀비, 강제 close`);
        try { c.ws.close(); } catch (e) {}
        return;
      }
      if (!c.firstPingAt) c.firstPingAt = now;
      c.ws.send(JSON.stringify({ type: 'ping', t: now }));
    }, 1000);

    // ★★[정비 배치 2026-08-30 재민 확정 §4] **유령 클라 감시 — 서버 틱 미수신.**
    //
    //   실기 실측(2026-08-29): 서버 틱이 **초당 0**인데 화면은 멀쩡히 "돌아가고" 있었다.
    //   클라 예측이 계속 걸었고, 이미 받아 둔 청크가 계속 그려졌기 때문이다.
    //   그 상태에서 매긴 실기 판정은 **전부 오염**된다(실제로 1차의 ①·⑤가 그랬다).
    //
    //   왜 종전 감시가 못 잡았나: 좀비 판정이 ⓐ pong 미수신 ⓑ `visibilitychange` 두 곳에만 있었다.
    //   ⓐ는 소켓이 살아 있으면 통과하고(서버는 ping 에 답만 하고 틱을 못 보낼 수 있다),
    //   ⓑ는 **탭이 계속 보이는 동안엔 아예 안 돈다**. 이 경우가 정확히 그 사각지대였다.
    //
    //   수리: 틱 도착 시각(`lastTickAt`)을 **상시** 감시한다 → 넘으면
    //     ① 화면에 **명시적 "연결 끊김"** ② 입력 예측 정지(유령이 걸어다니지 않게)
    //     ③ 기존 재연결 경로 재사용(`ensurePrimaryConnection` — 같은 토큰이면 같은 몸 · B-6 규약).
    //   틱이 다시 오면 자동 해제된다(`welcome`/`tick` 이 `lastTickAt` 을 갱신한다).
    setInterval(() => {
      if (kicked || !primaryZoneId) return;
      if (document.visibilityState !== 'visible') return;   // 백그라운드는 ⓑ 경로가 맡는다(rAF 가 멈춘다)
      const c = conns.get(primaryZoneId);
      const now = performance.now();
      const gap = lastTickAt ? (now - lastTickAt) : 0;
      // ★★문턱을 **둘로 가른다**(표시 ≠ 재연결). 하나로 두면 서버가 잠깐 느린 것만으로
      //   멀쩡한 소켓을 끊게 되고, 부하가 걸린 판에서는 그게 **재연결 폭풍**이 된다
      //   (실측: 2코어에 브라우저 둘 띄운 회귀에서 옆 하네스의 요청이 그 창에 삼켜졌다).
      //     · `ghostStallMs`(기본 5초)  = **말한다** — 딱지 + 예측 정지. 싸고 되돌릴 수 있다.
      //     · `ghostReconnectMs`(10초)  = **끊는다** — 진짜 유령일 때만. 비싸고 되돌릴 수 없다.
      const showAt = Math.max(1000, uiCfg.ghostStallMs | 0);
      const cutAt = Math.max(showAt, uiCfg.ghostReconnectMs | 0);
      const stalled = !!lastTickAt && gap > showAt;
      if (stalled && !netStalled) {
        console.warn(`[recover] ★서버 틱 ${(gap / 1000).toFixed(1)}초간 없음 — 유령 클라. 예측 정지`);
        setNetStalled(true, `서버 응답 ${(gap / 1000).toFixed(0)}초 없음`);
      } else if (!stalled && netStalled) {
        setNetStalled(false);
      }
      // 끊기는 **한 번만**(재연결이 또 틱을 못 받으면 `lastTickAt` 이 그대로라 계속 참이다).
      if (!!lastTickAt && gap > cutAt && !_ghostCutAt) {
        _ghostCutAt = now;
        console.warn(`[recover] ★서버 틱 ${(gap / 1000).toFixed(1)}초 — 소켓 강제 close · 재연결`);
        if (c) { try { c.ws.close(); } catch (e) {} }        // ensurePrimaryConnection 이 다음 프레임에 재연결
      }
      if (!stalled) _ghostCutAt = 0;
    }, 1000);

    // 14.43: 탭이 다시 보이면 — 백그라운드 동안 RAF 멈춰서 watchdog/checkOrphan 안 돌았을 수 있음.
    // 마지막 tick 5초 넘으면 primary 좀비로 간주, 강제 끊고 즉시 재연결 트리거.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      const stale = !lastTickAt || (now - lastTickAt > 5000);
      console.log(`[recover] visibilitychange visible — lastTick ${lastTickAt ? Math.round(now - lastTickAt) + 'ms 전' : '없음'} stale=${stale}`);
      if (stale && primaryZoneId) {
        const c = conns.get(primaryZoneId);
        if (c) { try { c.ws.close(); } catch (e) {} }
        // observer ws들도 같이 정리 (얘들도 보통 같이 죽어있음)
        for (const [zid, conn] of conns) {
          if (zid !== primaryZoneId) { try { conn.ws.close(); } catch (e) {} }
        }
        // 재트리거 방지 — 다음 welcome이 lastTickAt 갱신할 때까지 stale 판정 안 나게
        lastTickAt = now;
      }
    });

    // observer viewport 업데이트 — 1초마다 자기 abs position을 각 observer zone-local로 변환
    setInterval(() => {
      for (const [zid, c] of conns) {
        if (c.role !== 'observer' || c.ws.readyState !== 1) continue;
        const zm = zonesMeta[zid];
        if (!zm) continue;
        const zW = zm.zoneWidth || 100000, zH = zm.zoneHeight || 100000;
        const localX = Math.max(0, Math.min(zW, myAbsPredicted.x - zm.worldOffsetX));
        const localY = Math.max(0, Math.min(zH, myAbsPredicted.y - (zm.worldOffsetY||0)));
        c.ws.send(JSON.stringify({ type: 'viewport_update', x: localX, y: localY }));
      }
    }, 1000);

    refreshHealth();
    healthInterval = setInterval(refreshHealth, 3000);

    // Phase 14.30 + 14.51: 캔버스 mousemove → placement cursor + hover building
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      lastMouseSx = px; lastMouseSy = py;
      const _m = screenToWorldAbs(px, py);
      const wx = _m.wx, wy = _m.wy;
      window._lastMouseWx = wx; window._lastMouseWy = wy; // Phase 5-I: 원거리 조준용 (절대 월드)
      if (placementMode) {
        placementCursor.wx = wx;
        placementCursor.wy = wy;
      }
      // 14.51 + 14.53-e + 14.53-g/i: hover list. wall/door는 양쪽 cell 모두에서 후보 (edge 공유).
      if (buildMode && !placementMode) {
        const candidates = [];
        const mouseCx = Math.floor(wx / 32);
        const mouseCy = Math.floor(wy / 32);
        for (const c of conns.values()) {
          const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
          for (const b of c.buildings.values()) {
            if ((b.floor || 0) !== myFloor) continue;
            const isEdge = (b.type === 'wall' || b.type === 'door');
            const bAbsX = ox + b.x, bAbsY = oy + b.y;
            const bCx = Math.floor(bAbsX / 32);
            const bCy = Math.floor(bAbsY / 32);
            let match = false;
            if (isEdge) {
              // wall 저장: N → cell (bCx, bCy)의 윗 edge = cell (bCx, bCy-1)의 아래 edge
              // E → cell (bCx, bCy)의 우측 edge = cell (bCx+1, bCy)의 좌측 edge
              const side = b.data?.side || 'N';
              if (side === 'N') {
                match = (mouseCx === bCx) && (mouseCy === bCy || mouseCy === bCy - 1);
              } else if (side === 'E') {
                match = (mouseCy === bCy) && (mouseCx === bCx || mouseCx === bCx + 1);
              }
            } else {
              match = (bCx === mouseCx && bCy === mouseCy);
            }
            if (!match) continue;
            const ax = bAbsX + (isEdge ? 16 : 0);
            const ay = bAbsY + (isEdge ? 16 : 0);
            const d = Math.hypot(ax - wx, ay - wy);
            candidates.push({ id: b.id, d });
          }
        }
        candidates.sort((a, b) => a.d - b.d);
        // 14.54-b: auto floor hover → 부모 stair로 redirect (둘이 같은 그룹)
        const redirectMap = new Map();
        for (const c of candidates) {
          const bb = (function(){ for (const cc of conns.values()) { const x = cc.buildings.get(c.id); if (x) return x; } return null; })();
          if (bb && bb.type === 'floor' && bb.data?._parentStairId) {
            redirectMap.set(c.id, bb.data._parentStairId);
          }
        }
        let newList = candidates.map(c => redirectMap.get(c.id) || c.id);
        // 중복 제거 (같은 stair에 여러 cell이 같이 잡힐 수 있음)
        newList = newList.filter((id, i) => newList.indexOf(id) === i);
        // 옛 hoverBuildingId가 새 list 안에 있으면 index 유지, 아니면 0
        const oldId = hoverBuildingId;
        if (newList.length === 0) {
          hoverList = []; hoverIndex = 0; hoverBuildingId = null;
        } else if (newList.join() !== hoverList.join()) {
          hoverList = newList;
          const keep = oldId ? hoverList.indexOf(oldId) : -1;
          hoverIndex = (keep >= 0) ? keep : 0;
          hoverBuildingId = hoverList[hoverIndex];
        }
      } else {
        hoverList = []; hoverIndex = 0; hoverBuildingId = null;
      }
    });

    // 14.53-g/i: 건축 모드 마우스 휠 — placement 중이면 회전, hover 중이면 cycle
    // ★[줌 2026-08-31] 건축 모드의 회전·사이클이 **먼저**다(종전 동작 보존). 거기 해당이 없으면 줌.
    canvas.addEventListener('wheel', (e) => {
      const _bmBusy = buildMode && ((placementMode && placementMode.itemType) || hoverList.length > 1);
      if (!_bmBusy) {
        e.preventDefault();
        if (stepZoom(e.deltaY > 0 ? -1 : +1)) {        // 위로 굴리면 확대
          showNotice(`확대 ${ZOOM}×`, 700);
        }
        return;
      }
      const delta = (e.deltaY > 0) ? 1 : -1;
      // placement 중 → 회전 (wall/door = N→E→S→W, fence = NS↔EW, stair = N→E→S→W)
      if (placementMode && placementMode.itemType) {
        e.preventDefault();
        const it = placementMode.itemType;
        if (it === 'item_wall' || it === 'item_door') {
          const seq = ['N', 'E', 'S', 'W'];
          const i = seq.indexOf(placementMode.dir || 'N');
          placementMode.dir = seq[(i + delta + 4) % 4];
        } else if (it === 'item_stair') {
          // 14.54-c2: 계단은 N(남→북) 또는 W(동→서) 2방향만
          placementMode.dir = (placementMode.dir === 'N') ? 'W' : 'N';
        } else if (it === 'item_fence') {
          placementMode.dir = (placementMode.dir === 'EW') ? 'NS' : 'EW';
        }
        return;
      }
      // hover cycle
      if (hoverList.length > 1) {
        e.preventDefault();
        hoverIndex = ((hoverIndex + delta) % hoverList.length + hoverList.length) % hoverList.length;
        hoverBuildingId = hoverList[hoverIndex];
      }
    }, { passive: false });
    // 14.51: 우클릭 = placement 회전 (wall/door = N/E, fence = NS/EW, stair = N/E/S/W). 기본 우클릭 메뉴 차단.
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!placementMode || !placementMode.itemType) return;
      const it = placementMode.itemType;
      if (it === 'item_wall' || it === 'item_door') {
        placementMode.dir = (placementMode.dir === 'N') ? 'E' : 'N';
      } else if (it === 'item_fence') {
        placementMode.dir = (placementMode.dir === 'EW') ? 'NS' : 'EW';
      } else if (it === 'item_stair') {
        const seq = ['N', 'E', 'S', 'W'];
        const i = seq.indexOf(placementMode.dir || 'N');
        placementMode.dir = seq[(i + 1) % 4];
      }
      showNotice(`회전: ${placementMode.dir}`);
    });
    // === [조준 모드 2026-08-30] 우클릭 홀드 = 조준 · 조준 중 좌클릭 = 공격 =========
    //   ★기존 상호작용을 잡아먹지 않는다: 우클릭은 preventDefault 만(위 contextmenu 가 이미 한다),
    //     좌클릭 공격은 **조준 중이고 배치/건축 모드가 아닐 때만**. click 핸들러(배치·상자)는 그대로 산다.
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) { _aiming = true; e.preventDefault(); return; }
      if (e.button === 0 && _aiming && !placementMode && !buildMode) {
        // ★배선까지만 — 타격 판정 아크·타이밍·애니는 **전투 층 배치의 몫**이다(회부).
        //   서버 tryAttack 의 "범위 안 가장 가까운 mob" 판정은 무수정. 조준 방향은 싣기만 한다.
        sendPrimary({ type: 'attack', aimX: _aimDirX, aimY: _aimDirY });
        myLastAttackAt = performance.now();
      }
    });
    const _aimOff = () => { _aiming = false; };
    canvas.addEventListener('mouseup', (e) => { if (e.button === 2) _aimOff(); });
    canvas.addEventListener('mouseleave', _aimOff);
    window.addEventListener('blur', _aimOff);

    // Phase 14.22: 캔버스 클릭 → screen → world 좌표 변환 → chest bbox hit-test
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      // 캔버스 안 픽셀 좌표 (canvas.width/height와 css width/height 다를 수 있으니 스케일)
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      // ★[줌 2026-08-31] 투영을 **`screenToWorldAbs` 한 군데로** 모았다.
      //   종전엔 여기서 같은 식을 손으로 다시 썼는데, 원점이 `myAbsPredicted` 라
      //   조준 시야 밀기(최대 180px)가 켜지면 **커서와 클릭 지점이 갈렸다** — 조준 배치가
      //   `screenToWorldAbs` 를 만들면서 조준선만 고치고 이 줄은 옛 식으로 남겨 둔 자리다.
      //   줌까지 얹히면 두 번째로 갈릴 뻔했다. 식이 두 벌이면 언젠가 갈린다.
      const _cw = screenToWorldAbs(px, py);
      const clickWx = _cw.wx, clickWy = _cw.wy;
      // Phase 14.30 / 14.51: placement mode 우선 — 그 위치에 3초 progress → 빌드
      if (placementMode) {
        // 사용자 위치에서 거리 체크 (160px)
        const distMe = Math.hypot(clickWx - myAbsPredicted.x, clickWy - myAbsPredicted.y);
        if (distMe > 160) { showNotice('너무 멀어서 거기에 못 지음 (160px)'); return; }
        if (placementMode.special) {
          // ★움집터·길드 곳간 — 커서 셀 기준 다중 셀 배치(검증·재료·배치는 서버 권위)
          const _sp = placementMode.special;
          const _mt = _sp === 'hut_site' ? 'hut_start' : (_sp === 'furnace_site' ? 'furnace_start'
                    : (_sp === 'kiln_site' ? 'kiln_start' : (_sp === 'village_site' ? 'village_start'   // ★[배치 12] 마을 회관 착공
                    : (_sp === 'shelter_site' ? 'shelter_start'                                        // ★[T62] 공용 쉼터 착공
                    : (_sp === 'psite' ? 'request_village_house' : 'build_guild_granary')))));
          sendPrimaryAt({ type: _mt, atX: clickWx, atY: clickWy, kind: placementMode.kind || undefined });
          if (!e.shiftKey) { placementMode = null; showNotice('배치 요청'); }
          return;
        }
        if (placementMode.itemType) {
          // 14.54-d: blocked면 클릭 무시 + 알림
          const _cx = Math.floor(clickWx / 32), _cy = Math.floor(clickWy / 32);
          if (isPlacementBlocked(placementMode.itemType, _cx, _cy, placementMode.dir || 'N')) {
            showNotice('여기엔 못 지음 (겹침 또는 다른 사람 사유지)'); return;
          }
          // 14.51: 3초 progress 시작 → 완료 시 server 송신 + 인벤 차감 (server 측에서)
          startBuildAction('place', {
            itemType: placementMode.itemType,
            floor: placementMode.floor || 0,
            dir: placementMode.dir || 'N',
            atX: clickWx, atY: clickWy,
          });
        } else {
          // 옛 호환 (즉시)
          sendPrimaryAt({ type: 'build', buildType: placementMode.type, floor: placementMode.floor, atX: clickWx, atY: clickWy });
          if (!e.shiftKey) { placementMode = null; showNotice('배치 모드 종료'); }
        }
        return;
      }
      // 14.51 + 14.53-e: 건축 모드 + hover building → 3초 progress 분해
      if (buildMode && hoverBuildingId && !buildAction) {
        let target = null, ox = 0, oy = 0;
        for (const c of conns.values()) {
          const b = c.buildings.get(hoverBuildingId);
          if (b) { target = b; ox = c.meta?.worldOffsetX||0; oy = c.meta?.worldOffsetY||0; break; }
        }
        if (target) {
          const isEdge = (target.type === 'wall' || target.type === 'door');
          const tx = ox + target.x + (isEdge ? 16 : 0);
          const ty = oy + target.y + (isEdge ? 16 : 0);
          const d = Math.hypot(tx - myAbsPredicted.x, ty - myAbsPredicted.y);
          if (d > 160) { showNotice('너무 멀어서 분해 못함 (160px)'); return; }
          startBuildAction('dismantle', { buildingId: hoverBuildingId });
          return;
        }
      }
      // ★★[T68] 커서 밑을 고르는 일은 **`pickAt` 하나**가 한다(`46-h-verbs.js`).
      //   종전엔 여기 세 사슬(바닥 물건 ±14 → 터·시설 → 상자 ±20)이 늘어서 있었고,
      //   우클릭 메뉴도 같은 판정이 필요해지자 **두 벌이 될 참**이었다(사본 금지).
      //   ⚠순서·반경·존 순회·첫 히트에서 멈춤 — 전부 그대로 옮겼다. **행동 변경 0**.
      //   ⚠거리 게이트("너무 멀다")는 **여기 남는다**: 종전에도 대상을 고른 **뒤** 검사해
      //     다음 갈래로 안 넘어가고 알림만 냈다. `pickAt` 으로 옮기면 멀리 있는 상자가
      //     "안 골라진 것"이 되어 사슬이 뒤로 흐른다 — 그게 행동 변경이다.
      const hit = pickAt(clickWx, clickWy);
      if (hit && hit.kind === 'item') {
        const distToMe = Math.hypot(hit.absX - myAbsPredicted.x, hit.absY - myAbsPredicted.y);
        if (distToMe > 100) { showNotice('너무 멀리 있어 손이 안 닿습니다'); return; }
        sendPrimary({ type: 'pickup_item', giId: hit.id });
        return;
      }
      if (hit && hit.kind === 'site') {
        const b = hit.obj;
        if (b.type === 'furnace') sendPrimary({ type: 'furnace_smelt', buildingId: b.id });   // ★완공 노 클릭 = 조업
        else if (b.type === 'furnace_site') sendPrimary({ type: 'furnace_advance', buildingId: b.id });
        else if (b.type === 'charcoal_kiln') sendPrimary({ type: 'kiln_burn', buildingId: b.id });   // ★숯가마 클릭 = 조업
        else if (b.type === 'kiln_site') sendPrimary({ type: 'kiln_advance', buildingId: b.id });
        else if (b.type === 'village_site') sendPrimary({ type: 'village_advance', buildingId: b.id });   // ★[배치 12] 회관 시공
        else if (b.type === 'shelter_site') sendPrimary({ type: 'shelter_advance', buildingId: b.id });   // ★[T62] 쉼터 시공
        else if (b.type === 'village_hall') { _pviHallId = b.id; sendPrimary({ type: 'village_inventory', buildingId: b.id }); } // ★[배치 12 ③] 완공 회관 클릭 = 마을 재고(권한은 서버가 본다)
        else sendPrimary({ type: 'hut_advance', buildingId: b.id });
        return;
      }
      if (hit && hit.kind === 'chest') {
        const b = hit.obj;
        const distToMe = Math.hypot(hit.absX - myAbsPredicted.x, hit.absY - myAbsPredicted.y);
        if (distToMe > 160) { showNotice('너무 멀리 있어 손이 안 닿습니다'); return; }
        // Phase 4d-1: 거래소 chest는 마을 거래소 modal로
        if (b.data?.isExchange && b.data?.village && typeof window.openVillageMarket === 'function') {
          window.openVillageMarket(b.data.village);
        } else if (typeof openInvWithContainer === 'function') {
          openInvWithContainer(b.id);
        }
      }
    });

    // 거래소·상자 패널 이벤트
    document.getElementById('marketBuyBtn')?.addEventListener('click', () => placeOrder('buy'));
    document.getElementById('marketSellBtn')?.addEventListener('click', () => placeOrder('sell'));
    document.getElementById('marketCloseBtn')?.addEventListener('click', toggleMarketplace);
    document.getElementById('craftCloseBtn')?.addEventListener('click', toggleCraft);
    document.getElementById('cookCloseBtn')?.addEventListener('click', toggleCookPanel);
    document.getElementById('tribeCloseBtn')?.addEventListener('click', toggleTribePanel);
    document.getElementById('chestCloseBtn')?.addEventListener('click', closeChest);
    document.getElementById('chestPutWood')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_put', buildingId: openChestId, item: 'wood', amount: 1}); });
    document.getElementById('chestPutStone')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_put', buildingId: openChestId, item: 'stone', amount: 1}); });
    document.getElementById('chestTakeWood')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_take', buildingId: openChestId, item: 'wood', amount: 1}); });
    document.getElementById('chestTakeStone')?.addEventListener('click', () => { if (openChestId) sendPrimary({type:'chest_take', buildingId: openChestId, item: 'stone', amount: 1}); });
  }

  // 14.46-b-smooth-fix: health 폴링 실패 시 자동 중단 (TLS/HTTPS 강제 환경에서 콘솔 도배 방지)
  let healthFailCount = 0;
  let healthInterval = null;
  async function refreshHealth() {
    try {
      const r = await fetch('/health');
      const h = await r.json();
      healthFailCount = 0;
      const lines = Object.entries(h).map(([id, s]) =>
        `${id}: ${s.up ? (s.players ?? 0) + '명' : '꺼짐'}`);
      document.getElementById('health').innerText = lines.join('  ');
    } catch (e) {
      healthFailCount++;
      if (healthFailCount >= 3 && healthInterval) {
        clearInterval(healthInterval);
        healthInterval = null;
        console.warn('[health] fetch 3회 실패 → 폴링 중단 (HTTPS 강제 환경)');
        const el = document.getElementById('health');
        if (el) el.innerText = '(health 폴링 비활성)';
      }
    }
  }

  // === 연결 관리 ===
  function connect(zoneId, role, transfer) {
    const existing = conns.get(zoneId);
    if (existing) {
      // ★유령 클라 fix: 살아있는(CONNECTING/OPEN) 엔트리만 재사용. CLOSING/CLOSED 엔트리를 재사용하면
      //   새 ws가 영영 안 생겨 클라가 옛 예측 좌표에 고착된다(= 유령). 죽은 엔트리는 버리고 새로 연결.
      if (existing.ws.readyState <= 1) {
        if (existing.role !== role) existing.role = role;
        if (role === 'primary') primaryZoneId = zoneId;
        return;
      }
      try { existing.ws.close(); } catch (e) {}
      conns.delete(zoneId);
    }
    const meta = zonesMeta[zoneId];
    if (!meta) return;
    const params = new URLSearchParams();
    if (role === 'observer') {
      params.set('observer', '1');
      // observer는 자기 viewport(예측 좌표를 해당 zone-local로 변환) 전송
      const meta2 = zonesMeta[zoneId];
      if (meta2) {
        const zW2 = meta2.zoneWidth || 100000, zH2 = meta2.zoneHeight || 100000;
        params.set('vx', Math.max(0, Math.min(zW2, myAbsPredicted.x - meta2.worldOffsetX)));
        params.set('vy', Math.max(0, Math.min(zH2, myAbsPredicted.y - (meta2.worldOffsetY||0))));
      }
    } else if (transfer && transfer.token) {
      // 핸드오프는 인증 우회 — 토큰이 source 서버에서 발급한 신원 증명
      params.set('handoff_token', transfer.token);
    } else {
      // 신규 접속 — 인증 정보 전송
      if (myUsername) params.set('username', myUsername);
      if (myPassword) params.set('password', myPassword);
      // ★[배치 13→14] 게스트 영속 신원 토큰. **이름·비밀번호와 함께 보내도 된다** — 그게 곧
      //   **승계**(게스트로 지은 것을 그대로 들고 계정이 되기) 요청이기 때문이다(배치 14 ①).
      //   ⚠서버는 이 토큰만으로 남의 계정을 열지 않는다: 승계는 **비밀번호가 아직 없는 행**에만
      //     허용되고, 그 이름이 이미 남의 계정이면 거절된다. 옛 토큰이 남아 있는 채로 기존 계정에
      //     로그인하면 서버가 `not_promotable` 로 흘려보내 평소 로그인이 된다.
      if (myGuestToken) params.set('guest_token', myGuestToken);
      params.set('name', myName);
      params.set('color', myColor);
      if (onbStartVid != null) params.set('start_vid', String(onbStartVid));   // ★[온보딩 v2] 시작 화면에서 고른 마을 — 서버가 그 마을 도착 지점으로 앉힌다
    }
    const url = `${meta.wsUrl}/?${params.toString()}`;
    const ws = new WebSocket(url);
    const c = {
      ws, role, zoneId,
      meta: null,
      resources: new Map(),
      claims: new Map(),
      buildings: new Map(),
      mobs: new Map(),
      groundItems: new Map(), // Phase 14.23 — 바닥 떨어진 아이템
      others: new Map(),
      corpses: new Map(),     // Phase 5-7 — 동물 사체
    };
    conns.set(zoneId, c);
    if (role === 'primary') {
      primaryZoneId = zoneId;
      // ★[접속 진단] 이 시도의 시작을 적는다 — 배너가 "몇 초째 · 몇 번째"를 말할 재료다.
      // ★여기 도달했다는 건 **새 소켓을 실제로 연다**는 뜻이다(살아 있는 연결은 위에서 일찍 나간다).
      //   그러니 이전 상태가 ready 였든 아니든 지금은 connecting 이다 —
      //   1차 실장이 `!== 'ready'` 로 막았더니, 잘 놀다가 끊긴 경우엔 **상태가 ready 로 굳어**
      //   시도 횟수도 안 세고 배너도 안 떴다(재민이 본 침묵의 한 갈래가 정확히 이것이다).
      connAttempts++; connStartedAt = performance.now(); connHelloAt = 0;
      if (!connOutageAt) connOutageAt = connStartedAt;   // ★끊김의 **시작**은 한 번만 찍는다
      connMark('connecting', { stage: '', ref: '' });
    }
    // ★유령 클라 fix: 자기 conn 객체(c)를 같이 넘김. 교체된 옛 소켓이 close 직전 흘리는 잔여 메시지가
    //   zoneId 재조회로 "새 연결"의 상태에 섞여 들어가던 경로 차단(myPid/좌표/엔티티 오염).
    ws.onmessage = (ev) => handleMessage(zoneId, JSON.parse(ev.data), c);
    ws.onclose = (ev) => {
      if (conns.get(zoneId) === c) conns.delete(zoneId);
      _lastCloseAt.set(zoneId, performance.now()); // cooldown 기록
      // Phase 5-G trace: close 이유 진단
      console.warn('[ws] close', zoneId, 'role=' + role, 'code=' + ev.code, 'reason=' + (ev.reason || '(empty)'), 'wasClean=' + ev.wasClean);
    };
    ws.onerror = (ev) => {
      console.warn('[ws] error', zoneId, 'role=' + role);
    };
  }

  // Phase 5-G: observer 연결 fail 시 cooldown — 매 frame retry storm 방지
  const _lastCloseAt = new Map(); // zoneId -> performance.now() at close
  const RECONNECT_COOLDOWN_MS = 5000;

  function closeConnection(zoneId) {
    const c = conns.get(zoneId);
    if (!c) return;
    try { c.ws.close(); } catch (e) {}
    conns.delete(zoneId);
    _lastCloseAt.set(zoneId, performance.now());
  }

  function handleMessage(zoneId, msg, srcConn) {
    const c = conns.get(zoneId);
    if (!c) return;
    // ★유령 클라 fix: 이미 교체된(superseded) 소켓의 메시지는 전부 폐기.
    //   재연결 레이스에서 옛 ws의 버퍼된 tick/kicked/welcome이 새 conn 상태를 덮어쓰던 것을 막는다.
    if (srcConn && srcConn !== c) return;

    if (msg.type === 'welcome') {
      // 끊김 측정: promote 보낸 뒤 welcome 도착까지 걸린 시간 + welcome 처리 시간
      const _wStart = performance.now();
      if (c._promoteSentAt) {
        console.log('[handoff] promote→welcome gap =', (_wStart - c._promoteSentAt).toFixed(0), 'ms',
          '| entities res=' + (msg.resources?.length||0), 'bld=' + (msg.buildings?.length||0), 'mob=' + (msg.mobs?.length||0));
        c._promoteSentAt = 0;
      }
      c.meta = msg.zone;
      // ★★[2026-08-03f 배치 13] 영속 신원 수신.
      //   `playerId` — 소유 표시(사유지 목록 등)가 대조할 **정본**이다. 등록 계정이면 username 과
      //   같고, 게스트면 `anon_<고정 접미사>` 다. 종전엔 이 값이 없어서 게스트의 제 사유지가
      //   화면에서 남의 것으로 보였다.
      if (typeof msg.playerId === 'string' && msg.playerId) myPlayerId = msg.playerId;
      //   `guestToken` — 다음 접속에 제시할 열쇠. **저장만 하고 절대 표시하지 않는다.**
      //   (알림·채팅·콘솔 어디에도 찍지 않는다 — 토큰 유출 = 계정 탈취)
      if (typeof msg.guestToken === 'string' && msg.guestToken && msg.guestToken !== myGuestToken) {
        myGuestToken = msg.guestToken;
        try { localStorage.setItem(GUEST_TOKEN_KEY, myGuestToken); } catch (e) {}
      }
      //   ★[배치 14 ①] 승계됐다 — 그 토큰은 서버에서 **이미 죽었다**(guest_token = NULL).
      //   여기서도 지운다: 죽은 열쇠를 브라우저에 남겨 둘 이유가 없다(벨트와 멜빵).
      if (msg.promoted) {
        myGuestToken = '';
        try { localStorage.removeItem(GUEST_TOKEN_KEY); } catch (e) {}
      }
      // ★시대 게이트 — 건축 메뉴는 **이 세상에 알려진 노**만 보여준다(era.js 가 유일한 진실, 클라 표 없음).
      //   청동기엔 괴련로 버튼이 아예 없다: era.js 의 "지식 축은 순수 플레이어 지식" 원칙 — 있다는 것조차
      //   알려주지 않는다. 시대가 열리면 다음 접속 때 버튼이 생긴다.
      try {
        const _known = new Set(((msg.zone && msg.zone.era && msg.zone.era.furnaces) || []).map(f => f.k));
        document.querySelectorAll('[data-era-tech]').forEach(b => { b.style.display = _known.has(b.dataset.eraTech) ? '' : 'none'; });
      } catch (e) {}
      // Phase 5-G: 서버에서 받은 hardcoded terrain (한반도 새 강·호수) — 미니맵 표시용
      const _zid = c.zoneId || (msg.zone && (msg.zone.id || msg.zone.zoneId)) || c.id;
      if (msg.hardcodedTerrain && window.Terrain && window.Terrain.setHardcoded && _zid) {
        // Phase 5-K: terrain은 zone별 정적이고 시작 시 전체 선로딩됨.
        // 매 welcome(=매 핸드오프)마다 캐시를 비우면 경계 크로싱 때 fps가 뚝 떨어진다(강 거리 셀마다 재계산).
        // 이미 적용한 zone이면 재적용·캐시 클리어를 스킵 — 경계 크로싱 렉 제거.
        if (!_terrainAppliedZones.has(_zid)) {
          window.Terrain.setHardcoded(_zid, msg.hardcodedTerrain);
          _waterCellCache.clear(); // 최초 1회만 — 셀 단위 캐시 무효화
          _natChunk.clear();       // ★[배치 21] 자연물 청크 배치
          _shoreTiles.clear();
    _shoreTiles.clear();
          _groundTiles.clear();   // ★[배치 19] 지면 베이크도 함께
          _rockCellCache.clear();
          if (typeof window.__invalidateMinimapCache === 'function') window.__invalidateMinimapCache();
          _terrainAppliedZones.add(_zid);
          console.log('[terrain] hardcoded applied:', _zid, 'rivers=' + msg.hardcodedTerrain.rivers.length, 'lakes=' + msg.hardcodedTerrain.lakes.length);
        }
      } else if (msg.hardcodedTerrain) {
        console.warn('[terrain] hardcoded received but skipped — zid=' + _zid + ' Terrain=' + !!window.Terrain + ' setHardcoded=' + !!(window.Terrain && window.Terrain.setHardcoded));
      }
      if (msg.promoted) {
        // Phase 5-K4: observer ws 재사용 promote — resources/claims/buildings/mobs 전부
        // observer로 이미 받아 실시간 갱신(tick) 중이므로 그대로 유지. clear/rebuild 안 함 → 끊김 0.
      } else {
        c.resources.clear(); c.claims.clear(); c.buildings.clear(); c.mobs.clear();
        if (c.groundItems) c.groundItems.clear();
        for (const r of (msg.resources || [])) c.resources.set(r.id, r);
        for (const cl of (msg.claims || [])) c.claims.set(cl.id, cl);
        for (const b of (msg.buildings || [])) c.buildings.set(b.id, b);
        if (msg.rooms) ingestRooms(msg.rooms, null, c.meta || msg.meta || zonesMeta[primaryZoneId]);   // ★[배치 18 ①] welcome 시 서버 방 스냅샷
        for (const m of (msg.mobs || [])) c.mobs.set(m.mid, m);
        for (const gi of (msg.groundItems || [])) c.groundItems.set(gi.id, gi);
        // §4-4 Stage 4A: 마을 시뮬 영토(경계 셀 or 반경 근사) — welcome 1회, 이후 sim_village_day가 pop만 갱신
        c.simVillages = (msg.simVillages && msg.simVillages.length) ? msg.simVillages : null;
        // §11 도적: 소굴·야영 마커(welcome 1회, 이후 bandit_camps가 변경분 방송)
        c.banditCamps = (msg.banditCamps && msg.banditCamps.length) ? msg.banditCamps : null;
        // §16 답압 길: 등급 셀 flat [cx,cy,lv,...](welcome 1회, 이후 road_cells가 변경분 방송)
        c.roads = new Map();
        if (msg.roads) for (let i = 0; i < msg.roads.length; i += 3) c.roads.set(msg.roads[i] + ',' + msg.roads[i + 1], msg.roads[i + 2]);
        // ★[배치 20 B] 타일 상태: 기준선에서 **벗어난 셀만** flat [cx,cy,qv,geo,ore,...](welcome 1회,
        //   이후 tile_state 가 변경분 방송). 손 안 댄 셀은 여기 없고 `SoilBase.baseAt` 로 계산한다.
        c.soil = new Map();
        if (msg.soil) for (let i = 0; i + 4 < msg.soil.length; i += 5) {
          c.soil.set(msg.soil[i] + ',' + msg.soil[i + 1], { v: msg.soil[i + 2] * 16, geo: msg.soil[i + 3] | 0, ore: msg.soil[i + 4] | 0 });
        }
        _groundTiles.clear();   // 상태가 들어왔으니 기준선으로 구운 타일은 버린다
        // ★[다리 층] 통나무 널다리 셀(정적 맵 사물 — welcome 1회). 렌더 + 클라 콜라이더 미러 둘 다에 쓴다.
        //   서버 isTerrainBlockedLocal이 이 셀에서 물 차단을 푸는데 클라가 안 풀면 예측이 물에 막혀
        //   러버밴딩·다리 위 스턱이 난다(좌표 단일 작성자 원칙상 클라 예측은 서버와 같은 판정이어야 함).
        c.bridges = new Set();
        if (msg.bridges) for (let i = 0; i + 1 < msg.bridges.length; i += 2) {
          const k = msg.bridges[i] + ',' + msg.bridges[i + 1];
          c.bridges.add(k);
          _bridgeAbs.add(((msg.zone.worldOffsetX / CL_BUILDING_SIZE) + msg.bridges[i]) + ',' + (((msg.zone.worldOffsetY || 0) / CL_BUILDING_SIZE) + msg.bridges[i + 1]));
        }
        // ★[11차 T3 환호] 도랑 셀 flat [cx,cy,…] — 서버 콜라이더 미러 + 타일 렌더 원천(마을 소유 사물, welcome 1회)
        c.ditches = new Set();
        if (msg.ditches) for (let i = 0; i + 1 < msg.ditches.length; i += 2) {
          c.ditches.add(msg.ditches[i] + ',' + msg.ditches[i + 1]);
          _ditchAbs.add(((msg.zone.worldOffsetX / CL_BUILDING_SIZE) + msg.ditches[i]) + ',' + (((msg.zone.worldOffsetY || 0) / CL_BUILDING_SIZE) + msg.ditches[i + 1]));
        }
        // ★[곳간② 재고 표시] 곳간 물리 재고 flat [cx,cy,수량,…] — welcome 스냅샷, 이후 gran_stock 델타.
        //   회계(econ)가 아니라 NPC가 실제로 지고 와 쌓은 물리량이다. 사다리 앞 칸에 짐더미로 그린다.
        c.granStock = new Map();
        if (msg.granStocks) for (let i = 0; i + 2 < msg.granStocks.length; i += 3) {
          c.granStock.set(msg.granStocks[i] + ',' + msg.granStocks[i + 1], msg.granStocks[i + 2]);
        }
        // ★[10차 T4 장마당] 캐러밴 체류 중인 마을 중심 flat [ccx,ccy,…] — welcome 스냅샷, 이후 markets 방송.
        c.markets = (msg.markets || []).slice();
      }
      // 월드 시계 동기화 — 서버 now와 클라 now 차이를 보정해서 동일 phase 계산
      if (msg.worldClock) {
        worldClock = {
          epoch: msg.worldClock.epoch,
          dayLengthMs: msg.worldClock.dayLengthMs,
          dayPhaseRatio: msg.worldClock.dayPhaseRatio,
          serverNowOffset: msg.worldClock.serverNow - Date.now(), // serverNow = clientNow + offset
        };
      }

      if (!msg.observer) {
        myPid = msg.pid;
        inventory = msg.inventory;
        myLedger = msg.ledger || {}; myLots = msg.lots || {};      // ★[원장 승격] 인벤과 같은 스냅샷
        if (msg.uiCfg) uiCfg = Object.assign(uiCfg, msg.uiCfg);    // ★클라 손잡이는 서버 env 가 정본
        if (msg.tools) tools = msg.tools;
        if (Array.isArray(msg.toolItems)) toolItems = msg.toolItems;
        if (msg.equipped !== undefined) equipped = msg.equipped;
        if (msg.hotkey1 !== undefined) hotkey1 = msg.hotkey1;
        setTimeout(() => { try { updateHotkeyBar(); } catch(e){} }, 100);
        if (msg.recipes) recipes = msg.recipes;
        if (msg.itemRecipes) itemRecipes = msg.itemRecipes;
        if (msg.buildingRecipes) buildingRecipes = msg.buildingRecipes;
        if (msg.cookRecipes) cookRecipes = msg.cookRecipes;
        // ★[무게 배치] kg 카탈로그·용량 규격을 **서버에서 받는다**(사본 금지 — 클라가 표를 들면 갈린다)
        if (msg.itemWeights) { itemWeights = msg.itemWeights; window.__itemWeights = msg.itemWeights; }
        if (msg.carryCfg) { carryCfg = msg.carryCfg; window.__carryCfg = msg.carryCfg; }
        // ★★[이동 모델 2026-08-30] 손잡이 표는 **서버가 준다**(클라가 표를 갖지 않는다).
        //   여기서 못 받으면 모듈 기본값(legacy) — 옛 서버와도 그대로 돈다.
        if (msg.moveCfg) { _moveParams = window.MoveModel.paramsFrom(msg.moveCfg); window.__moveCfg = _moveParams; }
        if (msg.foodEffects) foodEffects = msg.foodEffects;
        if (msg.crops) applyCropPayload(msg.crops);          // ★[작물 층] 이름·아이콘·파종철
        // ★★[T55] 이름표 정본 — 한 번 받아 들고 다닌다(품목 카탈로그는 존 독립).
        //   ⚠덮어쓰지 않는다: 핸드오프 promote welcome 엔 안 실린다(관측) — 있으면 갱신, 없으면 유지.
        if (msg.itemLabels) { ITEM_LABEL_SRV = msg.itemLabels; window.__itemLabels = msg.itemLabels; }
        // ★[T66] 이름표가 오면 그때 **아이템 렌더를 굽는다**(구울 키 목록의 정본이 그 표다).
        if (msg.itemLabels && window.__preloadItemIcons) { try { window.__preloadItemIcons(); } catch (e) {} }
        // ★[T61] econ 자원 종류 이름 — 같은 경로·같은 규약(있으면 갱신 · 없으면 유지). 클라 사본은 지웠다.
        if (msg.categoryLabels) { CATEGORY_KO_SRV = msg.categoryLabels; window.__categoryLabels = msg.categoryLabels; }
        // ★[T66 ⓪] 직업·계절 이름 — 같은 규약(있으면 갱신 · 없으면 유지). 클라 사본 둘을 지웠다.
        if (msg.uiLabels) { UI_LABELS_SRV = msg.uiLabels; window.__uiLabels = msg.uiLabels; }
        // 플레이어 장비
        if (msg.equipmentRecipes) equipmentRecipes = msg.equipmentRecipes;
        if (msg.equipmentMeta) equipmentMeta = msg.equipmentMeta;
        if (Array.isArray(msg.equipment)) equipment = msg.equipment;
        if (msg.equipSlots) equipSlots = msg.equipSlots;
        if (msg.craftSkill) craftSkill = msg.craftSkill;
        if (msg.self.hp !== undefined) { myHp = msg.self.hp; myMaxHp = msg.self.maxHp; }
        if (msg.calendar) myCalendar = msg.calendar;   // ★[달력] 입장 즉시 — 첫 날짜 경계를 기다리지 않는다
        if (msg.weather) myWeather = msg.weather;     // ★[온도] 입장 즉시 — 첫 gauges 를 기다리지 않는다
        if (typeof msg.self.hunger === 'number') myHunger = msg.self.hunger;
        if (typeof msg.self.thirst === 'number') myThirst = msg.self.thirst;
        if (typeof msg.self.vp === 'number') myVp = msg.self.vp;
        if (msg.self.tribeId !== undefined) myTribeId = msg.self.tribeId;
        if (msg.self.tribeName !== undefined) myTribeName = msg.self.tribeName;
        if (typeof msg.self.floor === 'number') myFloor = msg.self.floor;
        // 14.42-a — home 위치 (없으면 null)
        myHomeZone = msg.self.homeZone || null;
        myHomeX = (typeof msg.self.homeX === 'number') ? msg.self.homeX : null;
        myHomeY = (typeof msg.self.homeY === 'number') ? msg.self.homeY : null;
        const absX = msg.zone.worldOffsetX + msg.self.x;
        const absY = (msg.zone.worldOffsetY || 0) + msg.self.y;
        myAbsPos = { x: absX, y: absY }; myAbsPosAt = performance.now();
        // welcome = 풀 권위 리싱크(재연결/존이동) → 텔포처럼 취급: 미ack 입력 비우고 앵커.
        // ★유령 클라 fix: 앵커는 어떤 조건으로도 우회되지 않는다(primary welcome = 무조건 재앵커).
        pendingInputs.length = 0;
        myVel.vx = 0; myVel.vy = 0;   // ★관성도 끊는다(존 전환/재연결)
        _predAccum = 0;
        myAbsPredicted = { x: absX, y: absY };
        _renderPrev = { x: absX, y: absY };
        _renderCurr = { x: absX, y: absY };
        myAbsRender = { x: absX, y: absY };
        _renderReady = true;
        // 옛 보정 lerp 잔재도 함께 리셋(respawn 경로와 동형) — 앵커 직후 옛 속도로 끌려가지 않게.
        correctionVel = { x: 0, y: 0 };
        correctionUntil = 0;
        correctionIgnoreWall = false;
        _selfGone = false;              // 서버에 내 실체가 다시 생김 → 예측 재개
        if (!initialWelcomeReceived) {
          initialWelcomeReceived = true;
        }
        lastTickWithMyPidAt = performance.now();
        updateHud();
      }
      // ★[접속 진단] 여기까지 왔으면 **들어간 것**이다. 배너를 걷고 시도 횟수를 0으로.
      if (c.role === 'primary') { connEverReady = true; connAttempts = 0; connHelloAt = 0; connOutageAt = 0;
        _reconnAt = 0;   // ★백오프 시계도 푼다 — 다음 끊김은 곧바로 한 번 시도한다
        connMark('ready', { reason: '', stage: '', ref: '' }); }
      if (typeof _wStart === 'number') {
        const _proc = performance.now() - _wStart;
        if (_proc > 5) console.log('[handoff] welcome 처리 =', _proc.toFixed(0), 'ms');
      }
    } else if (msg.type === 'tick') {
      const now = performance.now();
      if (c.role === 'primary') {
        if (lastTickAt) lastServerPingMs = now - lastTickAt;
        lastTickAt = now;
        if (netStalled) setNetStalled(false);   // ★[정비 배치] 틱이 돌아왔다 = 유령 상태 해제·예측 재개
        // 14.49-c: 계단 z (0~32) — 서버 권위 값을 클라가 부드럽게 따라감
        if (typeof msg.selfZ === 'number') myStairZ = msg.selfZ;
      }
      for (const pp of msg.players) {
        if (pp.pid === myPid && c.role === 'primary') {
          const absX = c.meta.worldOffsetX + pp.x;
          const absY = (c.meta.worldOffsetY || 0) + pp.y;
          myAbsPos = { x: absX, y: absY }; myAbsPosAt = performance.now();
          // 리컨실리에이션: 권위 위치 + ackSeq(tick top-level)로 미ack 입력 replay
          applyServerCorrection(absX, absY, msg.ackSeq, msg.selfVx, msg.selfVy);
          lastTickWithMyPidAt = now;
        } else {
          // 서버가 메타 필드(name/color/maxHp/tribeName)를 첫 visible 때만 보냄. 나머진 prev 캐시 유지.
          const prev = c.others.get(pp.pid);
          const buf = prev?.buf || [];
          pushSample(buf, now, pp.x, pp.y);
          const vxNow = pp.vx || 0, vyNow = pp.vy || 0;
          const fvxKeep = (vxNow !== 0 || vyNow !== 0) ? vxNow : (prev?._fvx || 1);
          const fvyKeep = (vxNow !== 0 || vyNow !== 0) ? vyNow : (prev?._fvy || 0);
          // §4-4 P4: 전쟁 병사 전투 메타 — 서버는 muster 병사에만 br(궤주 비트) 매틱 송신 → 전투유닛 신호.
          //   bt(병종)·bs(진영)·bc(지휘관)은 최초가시분만 → prev 승계(0=champion/공격이라 !==undefined 판별).
          const _isWar = pp.br !== undefined;
          c.others.set(pp.pid, {
            pid: pp.pid,
            x: pp.x, y: pp.y,
            z: pp.z || 0, // 14.49-d: 계단 위 z
            floor: pp.floor || 0,
            vx: vxNow, vy: vyNow,
            _fvx: fvxKeep, _fvy: fvyKeep, // Phase 14.37: 마지막 facing
            _war: _isWar,
            bt: (pp.bt !== undefined) ? pp.bt : prev?.bt,
            bs: (pp.bs !== undefined) ? pp.bs : prev?.bs,
            bc: (pp.bc !== undefined) ? pp.bc : prev?.bc,
            br: _isWar ? (pp.br | 0) : 0,
            name: pp.name ?? prev?.name ?? '?',
            color: pp.color ?? prev?.color ?? '#5a9ae0',
            hp: pp.hp,
            maxHp: pp.maxHp ?? prev?.maxHp ?? 100,
            tribeName: pp.tribeName !== undefined ? pp.tribeName : prev?.tribeName,
            simJob: pp.simJob !== undefined ? pp.simJob : prev?.simJob, // §4-4 Stage 4A: 마을 NPC 직업(첫 visible 메타 + sim_village_day 갱신)
            npc: pp.npc !== undefined ? pp.npc : prev?.npc,             // ★[캐릭 시트] NPC 신원 1비트(첫 가시 메타)
            act: pp.act !== undefined ? pp.act : prev?.act, // ★[액션 라벨] 생활 층 행동(모내기·잠행·개간…) — 변경 시에만 수신, 미수신=유지
            clothes: pp.clothes !== undefined ? pp.clothes : prev?.clothes, // ★[T81] 남의 옷 재질 — act 와 같은 델타 문법(미수신=유지)
            tool: pp.tool !== undefined ? pp.tool : prev?.tool,             // ★[T87] 남이 손에 든 것(도구 type)
            carrier: pp.carrier !== undefined ? pp.carrier : prev?.carrier, // ★[T87] 남이 등에 진 것(지게 1비트)
            cap: pp.cap | 0, // §18 3파: 포로 표식(동적 1비트 — 회색 테두리 렌더)
            buf,
            lastX: prev?.x ?? pp.x, lastY: prev?.y ?? pp.y,
            lastT: now,
            lastAttackAt: prev?.lastAttackAt || 0,
          });
          // Phase 14.41: tick에 isDown=1 있으면 다운 상태 갱신 (보강 — broadcast 누락 대비)
          if (pp.isDown) downStates.set(pp.pid, true);
          else if (pp.isDown === undefined && downStates.has(pp.pid)) {
            // tick은 absent 키를 못 보냄. player_down_state로만 해제됨.
          }
        }
      }
      const alive = new Set(msg.players.map(p => p.pid));
      for (const pid of c.others.keys()) if (!alive.has(pid)) { c.others.delete(pid); downStates.delete(pid); }
      // mob 갱신 (tick에 포함된 것)
      if (Array.isArray(msg.mobs)) {
        const aliveMobs = new Set(msg.mobs.map(m => m.mid));
        for (const m of msg.mobs) {
          // mob도 메타(type/maxHp/tameOwner)는 첫 visible 때만. 나머지엔 prev 유지.
          const prev = c.mobs.get(m.mid);
          const buf = prev?.buf || [];
          pushSample(buf, now, m.x, m.y);
          const mvx = m.vx || 0, mvy = m.vy || 0;
          c.mobs.set(m.mid, {
            mid: m.mid,
            x: m.x, y: m.y,
            z: m.z || 0, floor: m.floor || 0, // 14.49-d
            vx: mvx, vy: mvy,
            _fvx: (mvx !== 0 || mvy !== 0) ? mvx : (prev?._fvx || 1),
            _fvy: (mvx !== 0 || mvy !== 0) ? mvy : (prev?._fvy || 0),
            hp: m.hp,
            type: m.type ?? prev?.type ?? 'deer',
            maxHp: m.maxHp ?? prev?.maxHp ?? 10,
            tameOwner: m.tameOwner !== undefined ? m.tameOwner : prev?.tameOwner,
            tameOwnerName: m.tameOwnerName !== undefined ? m.tameOwnerName : prev?.tameOwnerName,
            buf,
            lastX: prev?.x ?? m.x, lastY: prev?.y ?? m.y,
            lastT: now,
          });
        }
        // AOI 시야 밖으로 나간 mob 정리 (tick에 없으면 제거)
        for (const mid of c.mobs.keys()) if (!aliveMobs.has(mid)) c.mobs.delete(mid);
      }
    } else if (msg.type === 'inventory') {
      // ★[원장 승격] 스칼라·원장·로트는 **한 메시지 = 한 스냅샷**이다. 따로 받으면 반드시 어긋난다.
      inventory = msg.inventory;
      if (msg.ledger) myLedger = msg.ledger;
      if (msg.lots) myLots = msg.lots;
      updateHud(); renderCraftPanel(); if (cookOpen) renderCookPanel();
      // 종전엔 여기서 인벤 패널을 안 그려서 1초짜리 gauges 가 올 때까지 화면이 옛것이었다.
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    } else if (msg.type === 'cast_preview') {
      castPv[msg.itemType] = msg;   // 서버가 계산한 합금 물성 — 읽어서 그리기만 한다
      paintCastReadout(msg.itemType);
    } else if (msg.type === 'equipment') {
      // 플레이어 장비 인스턴스·장착 슬롯·제작 숙련 갱신
      if (Array.isArray(msg.equipment)) equipment = msg.equipment;
      if (msg.equipSlots) equipSlots = msg.equipSlots;
      if (msg.craftSkill) craftSkill = msg.craftSkill;
      renderCraftPanel();
      const sp2 = document.getElementById('sidePanel');
      if (sp2 && sp2.classList.contains('open')) {
        const spBody2 = document.getElementById('spBody');
        if (spBody2 && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spBody2);
      }
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    } else if (msg.type === 'shop_info') {
      shopVillage = msg.village || null;
      const spS = document.getElementById('sidePanel');
      if (spS && spS.classList.contains('open')) {
        const spB = document.getElementById('spBody');
        if (spB && craftCat === 'trade' && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spB);
      }
    } else if (msg.type === 'facility') {
      // ★★[시설 제작창 §8.5] 시설의 창 — **들어서면 열리고**(§8.2 의 유일한 예외: 맥락 창), 나가면 닫힌다.
      const was = myFacility && myFacility.near ? myFacility.near.bid : null;
      myFacility = msg;
      const now = msg.near ? msg.near.bid : null;
      if (now && now !== was && now !== _facAutoOpened && msg.near.mine) {
        _facAutoOpened = now;
        openSide('facility');
      }
      if (!now) { _facAutoOpened = null; if (activeSide === 'facility') closeSide(); }
      if (activeSide === 'facility') renderSide('facility');
    } else if (msg.type === 'craft_queue') {
      if (myFacility) myFacility.queue = msg.queue || [];
      if (activeSide === 'facility') renderSide('facility');
    } else if (msg.type === 'dishes') {
      dishes = Array.isArray(msg.dishes) ? msg.dishes : [];
      if (cookOpen) renderCookPanel();
      const sp3 = document.getElementById('sidePanel');
      if (sp3 && sp3.classList.contains('open')) {
        const spBody3 = document.getElementById('spBody');
        if (spBody3 && craftCat === 'food' && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spBody3);
      }
    } else if (msg.type === 'tools_update' || msg.type === 'tools') {
      // 14.53: toolItems 리스트 + equipped (instance id) + hotkey1
      if (Array.isArray(msg.toolItems)) toolItems = msg.toolItems;
      if (msg.tools) tools = msg.tools; // 옛 호환
      if (msg.equipped !== undefined) equipped = msg.equipped;
      if (msg.hotkey1 !== undefined) hotkey1 = msg.hotkey1;
      updateHotkeyBar();
      updateHud(); renderCraftPanel();
      // 좌측 sidePanel craft 열려있으면 갱신
      const sp = document.getElementById('sidePanel');
      if (sp && sp.classList.contains('open')) {
        const spBody = document.getElementById('spBody');
        if (spBody && typeof renderCraftPanel2 === 'function') renderCraftPanel2(spBody);
      }
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    } else if (msg.type === 'resource_removed') {
      c.resources.delete(msg.id);
    } else if (msg.type === 'resource_update') {
      const r = c.resources.get(msg.id); if (r) r.hp = msg.hp;
    } else if (msg.type === 'resource_spawn') {
      c.resources.set(msg.resource.id, msg.resource);
    } else if (msg.type === 'resources_spawn') {        // 배치 — 숲 청크 활성화 시 수백 그루 한 번에
      const arr = msg.resources || [];
      for (let i = 0; i < arr.length; i++) c.resources.set(arr[i].id, arr[i]);
    } else if (msg.type === 'resources_removed') {      // 배치 제거 — 청크 비활성화
      const ids = msg.ids || [];
      for (let i = 0; i < ids.length; i++) c.resources.delete(ids[i]);
    } else if (msg.type === 'buildings_spawn') {        // 배치 — 청크 활성화 시 NPC 집 등 한 번에 (welcome 폭주 방지)
      const arr = msg.buildings || [];
      for (let i = 0; i < arr.length; i++) c.buildings.set(arr[i].id, arr[i]);
      clWallMapBuiltAt = 0; clStairCacheBuildAt = 0;   // wall/stair 캐시 재빌드 강제 (다음 프레임)
    } else if (msg.type === 'buildings_removed') {      // 배치 제거 — 청크 비활성화 (서버는 메모리 유지)
      const ids = msg.ids || [];
      for (let i = 0; i < ids.length; i++) c.buildings.delete(ids[i]);
      clWallMapBuiltAt = 0; clStairCacheBuildAt = 0;
    } else if (msg.type === 'rooms_update') {
      // ★[배치 18 ①] 서버 방 판정 수신 — 클라는 계산하지 않는다(사본 방지).
      ingestRooms(msg.rooms, msg.removed, c.meta || zonesMeta[primaryZoneId]);
    } else if (msg.type === 'claim_added') {
      c.claims.set(msg.claim.id, msg.claim);
    } else if (msg.type === 'claim_updated') {
      // Phase 4d-16-a: 영토 cell sub-type 변경 (예: NPC personal 분배)
      c.claims.set(msg.claim.id, msg.claim);
    } else if (msg.type === 'sim_village_add') {
      // ★[T19 2026-09-02] **마을이 하나 늘었다.** `simVillages` 는 여태 welcome 1회뿐이라
      //   방금 선 마을은 재접속 전엔 세계에 없었다 — 그래서 **자기가 세운 마을의 촌장과도 말을 못 했다**
      //   (근접 브리핑이 이 목록을 훑는다). 한 항목만 붙인다(전체를 다시 받지 않는다).
      if (msg.village && msg.village.id != null) {
        if (!c.simVillages) c.simVillages = [];
        if (!c.simVillages.some((v) => v.id === msg.village.id)) c.simVillages.push(msg.village);
        // ★하네스 훅(읽기 전용) — "이 세션에서 실제로 통지를 받았다"를 셈한다.
        //   welcome 의 목록과 섞이지 않게 **받은 횟수**로 센다(길이는 시딩 수에 묻힌다).
        window.__simVillageAdds = (window.__simVillageAdds | 0) + 1;
        needsRedraw = true;
      }
    } else if (msg.type === 'claim_state') {
      // ★[T45] 부재 상태 전이 — **한 칸만 갈아 끼운다**(레코드를 다시 보내지 않는다).
      //   판정은 서버가 다 했다. 클라는 색만 바꾼다(`34-m-renderloop.js`).
      const _c = c.claims.get(msg.id);
      if (_c) { _c.state = msg.state; _c.heldBy = msg.heldBy || null; needsRedraw = true; }
    } else if (msg.type === 'claim_removed') {
      c.claims.delete(msg.id);
    } else if (msg.type === 'sim_village_day') {
      window.__evGameDay = msg.day | 0;   // ★[사건 레이어] 촌장 브리핑 "하루 한 번" 의 시계
      if (msg.calendar) { myCalendar = msg.calendar; updateHud(); }   // ★[달력] 날짜가 바뀌었다
      // §4-4 Stage 4A: 게임일 1회 — 마을 인구 라벨 + NPC 직업(simJob) 변경분 + §19 영토 크립 반경(tr) 갱신
      if (c.simVillages && msg.pops) for (const v of c.simVillages) { if (msg.pops[v.id] != null) v.pop = msg.pops[v.id]; if (msg.terr && msg.terr[v.id] != null) v.tr = msg.terr[v.id]; }
      if (msg.jobs) for (const [pid, job] of Object.entries(msg.jobs)) { const o = c.others.get(pid); if (o) o.simJob = job; }
      if (_wxIngest(c, msg.wx)) needsRedraw = true;   // ★[날씨 축] — 방송과 하네스가 같은 입구
    } else if (msg.type === 'bandit_camps') {
      // §11 도적: 소굴·야영 마커 갱신(서버가 변경 시에만 방송)
      c.banditCamps = (msg.camps && msg.camps.length) ? msg.camps : null;
    } else if (msg.type === 'road_cells') {
      // §16 답압 길: 게임일 1회 변경분(등급 전이 셀만) — lv 0=풀 복귀(삭제)
      if (!c.roads) c.roads = new Map();
      const rc = msg.cells || [];
      for (let i = 0; i < rc.length; i += 3) { const k = rc[i] + ',' + rc[i + 1]; if (rc[i + 2]) c.roads.set(k, rc[i + 2]); else c.roads.delete(k); }
      _gtInvalidateCells(c, rc, 3);
      needsRedraw = true;
    } else if (msg.type === 'tile_state') {
      _tsIngest(c, msg.cells || []);
      needsRedraw = true;
    } else if (msg.type === 'gran_stock') {
      // ★[곳간② 재고 표시] 물리 재고 델타(변한 곳간만 · 1초 스로틀) — flat [cx,cy,수량,…], 0이면 삭제.
      if (!c.granStock) c.granStock = new Map();
      const gs = msg.g || [];
      for (let i = 0; i + 2 < gs.length; i += 3) { const k = gs[i] + ',' + gs[i + 1]; if (gs[i + 2] > 0) c.granStock.set(k, gs[i + 2]); else c.granStock.delete(k); }
      needsRedraw = true;
    } else if (msg.type === 'markets') {
      // ★[10차 T4 장마당] 전체 치환(집합이 바뀔 때만 오는 방송 — 델타가 아니다). 빈 배열 = 전 마을 파장.
      c.markets = (msg.m || []).slice();
      needsRedraw = true;
    } else if (msg.type === 'war_battle') {
      // §4-4 P4: 진행 전투 집계(2Hz+전이) — 스펙테이터 HUD·화면밖 지시자·관전 카메라 레지스트리.
      //   origin은 해당 존 로컬 px(o.cx*32) → 존 worldOffset 더해 절대 px(병사 pp.x 국지화와 동일).
      const conn = conns.get(zoneId);
      const ox = (conn && conn.meta && conn.meta.worldOffsetX) || 0;
      const oy = (conn && conn.meta && conn.meta.worldOffsetY) || 0;
      const b = warBattles.get(msg.id) || { id: msg.id };
      b.ox = ox + ((msg.origin && msg.origin.x) || 0);
      b.oy = oy + ((msg.origin && msg.origin.y) || 0);
      b.atk = msg.atk; b.def = msg.def; b.casus = msg.casus;
      b.aliveA = msg.aliveA | 0; b.aliveB = msg.aliveB | 0;
      b.phase = msg.phase || 'battle';
      b.seenAt = performance.now();
      if (b.phase === 'resolved') b.resolvedAt = b.seenAt;
      warBattles.set(msg.id, b);
      if (_warSpec.active && _warSpec.id === msg.id) _warSpec.to = { x: b.ox, y: b.oy };   // 관전 중이면 목표 추종(전투 origin 미세 이동)
      updateWarHud();
    } else if (msg.type === 'war_command_ack') {
      // §4-4 P4: 지휘 참가 응답(서버 진영·근접 검증). 거절 시 관전만 유지.
      if (!msg.ok && _warCmdId === msg.warId) _warCmdId = null;
      _warCmdMsg = msg.ok ? '지휘 수락됨 — WASD로 부대 지휘' : ('지휘 거절: ' + (msg.reason || '조건 불충족'));
      updateWarHud();
    } else if (msg.type === 'building_added') {
      c.buildings.set(msg.building.id, msg.building);
      if (msg.building.type === 'stair') clStairCacheBuildAt = 0;
      if (msg.building.type === 'wall') {
        // 14.49-e6-b: wall 위치 cache에 즉시 추가 (콜라이더 미러). ★배치 18: 방 재계산은 서버 몫 — rooms_update 가 온다.
        const b = msg.building;
        const side = b.data?.side;
        if (side) {
          const zm = c.meta || zonesMeta[primaryZoneId];
          const ox = Math.floor((zm?.worldOffsetX || 0) / CL_BUILDING_SIZE);
          const oy = Math.floor((zm?.worldOffsetY || 0) / CL_BUILDING_SIZE);
          const absCx = ox + Math.floor(b.x / CL_BUILDING_SIZE);
          const absCy = oy + Math.floor(b.y / CL_BUILDING_SIZE);
          const f = b.floor || 0;
          clWallCellMap.set(`${absCx}_${absCy}_${side}_${f}`, true);
        }
      }
    } else if (msg.type === 'building_removed') {
      const b = c.buildings.get(msg.id);
      if (b?.type === 'stair') clStairCacheBuildAt = 0;
      if (b?.type === 'wall') {
        // 14.49-e6-b: wall 위치 cache에서 즉시 제거 (콜라이더 미러). ★배치 18: 방 재계산은 서버 몫.
        const side = b.data?.side;
        if (side) {
          const zm = c.meta || zonesMeta[primaryZoneId];
          const ox = Math.floor((zm?.worldOffsetX || 0) / CL_BUILDING_SIZE);
          const oy = Math.floor((zm?.worldOffsetY || 0) / CL_BUILDING_SIZE);
          const absCx = ox + Math.floor(b.x / CL_BUILDING_SIZE);
          const absCy = oy + Math.floor(b.y / CL_BUILDING_SIZE);
          const f = b.floor || 0;
          clWallCellMap.delete(`${absCx}_${absCy}_${side}_${f}`);
        }
      }
      c.buildings.delete(msg.id);
    } else if (msg.type === 'building_updated') {
      // 14.50: door open/close 등 building data 변경. wall cache 무효화 (door state 영향).
      const b = c.buildings.get(msg.building.id);
      if (b) {
        b.data = msg.building.data;
        if (b.type === 'door') clWallMapBuiltAt = 0; // door state 변경 → cache 재빌드
      }
    } else if (msg.type === 'ground_item_added') {
      if (c.groundItems) c.groundItems.set(msg.gi.id, msg.gi);
    } else if (msg.type === 'ground_item_removed') {
      if (c.groundItems) c.groundItems.delete(msg.id);
    } else if (msg.type === 'player_attacked') {
      // Phase 14.35: 다른 player 공격 모션 — others에서 그 pid 찾아 lastAttackAt 저장
      for (const con of conns.values()) {
        const o = con.others?.get(msg.pid);
        if (o) o.lastAttackAt = performance.now();
      }
    } else if (msg.type === 'building_damaged') {
      const b = c.buildings.get(msg.id);
      if (b) {
        b.data = b.data || {};
        b.data.hp = msg.hp;
        b.data.damaged = msg.damaged;
      }
    } else if (msg.type === 'arrow_spawn') {
      // Phase 5-I: 화살 발사체 — 절대좌표로 저장, 클라가 등속 외삽 (서버는 spawn/remove만 보냄)
      if (!window._arrows) window._arrows = new Map();
      const ox = c.meta?.worldOffsetX || 0, oy = c.meta?.worldOffsetY || 0;
      window._arrows.set(msg.aid, { ax: ox + msg.x, ay: oy + msg.y, vx: msg.vx, vy: msg.vy, t0: performance.now() });
    } else if (msg.type === 'arrow_removed') {
      if (window._arrows) window._arrows.delete(msg.aid);
    } else if (msg.type === 'mob_damaged') {
      const m = c.mobs.get(msg.mid); if (m) m.hp = msg.hp;
    } else if (msg.type === 'mob_removed') {
      c.mobs.delete(msg.mid);
    } else if (msg.type === 'corpses_init') {
      // Phase 5-7
      for (const co of msg.corpses) c.corpses.set(co.cid, co);
    } else if (msg.type === 'corpse_added') {
      c.corpses.set(msg.corpse.cid, msg.corpse);
    } else if (msg.type === 'corpse_removed') {
      c.corpses.delete(msg.cid);
    } else if (msg.type === 'mob_spawn') {
      c.mobs.set(msg.mob.mid, msg.mob);
    } else if (msg.type === 'mob_tamed') {
      const m = c.mobs.get(msg.mid);
      if (m) { m.tameOwner = msg.owner; m.tameOwnerName = msg.ownerName; }
    } else if (msg.type === 'player_damaged') {
      if (msg.pid === myPid) { myHp = msg.hp; updateHud(); }
      else {
        const o = c.others.get(msg.pid); if (o) o.hp = msg.hp;
      }
    } else if (msg.type === 'player_respawn') {
      if (msg.pid === myPid) {
        myHp = msg.hp;
        // Phase 14.41: 부활 → 다운 상태 해제
        myIsDown = false;
        myDownedAt = 0;
        myRespawnOptions = [];
        hideDownPanel();
        // 서버가 자기 사유지 좌표로 텔레포트했으니 클라 좌표도 즉시 동기화
        if (msg.x !== undefined && c.meta) {
          const absX = c.meta.worldOffsetX + msg.x;
          const absY = (c.meta.worldOffsetY || 0) + msg.y;
          myAbsPos = { x: absX, y: absY }; myAbsPosAt = performance.now();
          myAbsPredicted = { x: absX, y: absY };
          correctionVel = { x: 0, y: 0 };
          correctionUntil = 0;
          // 부활 = 텔포 → 미ack 입력 비우고 렌더 앵커 리싱크 (카메라가 텔포 구간 lerp 방지)
          pendingInputs.length = 0;
          myVel.vx = 0; myVel.vy = 0;   // ★관성도 끊는다(부활=텔포)
          _predAccum = 0;
          _renderPrev = { x: absX, y: absY };
          _renderCurr = { x: absX, y: absY };
          myAbsRender = { x: absX, y: absY };
          _renderReady = true;
        }
        updateHud();
      } else {
        downStates.delete(msg.pid); // 다른 사람도 부활하면 down 해제
      }
    } else if (msg.type === 'player_downed') {
      // Phase 14.41: 본인 사망 — 부활 패널 표시
      if (msg.pid === myPid) {
        myIsDown = true;
        myDownedAt = performance.now();
        myDownRescueWindowMs = msg.rescueWindowMs || 10000;
        myRespawnOptions = msg.options || [];
        showDownPanel();
      }
    } else if (msg.type === 'player_down_state') {
      // 다른 사람 다운/일어남 상태 (시각용)
      if (msg.pid === myPid) {
        // 본인은 player_downed/respawn 로직으로 처리. 여기선 안 변경
      } else {
        if (msg.isDown) downStates.set(msg.pid, true);
        else downStates.delete(msg.pid);
        // ★[T68] 누가 업고 있나 — 이 메시지가 **이미 싣고 있던** 칸이다(서버 무변). 종전엔 버렸다.
        //   메뉴가 "업기"와 "내려놓기"를 가르는 데 쓴다(`46-h-verbs`). 없으면 거짓말하는 메뉴가 된다.
        if (typeof onCarryState === 'function') onCarryState(msg.pid, msg.isDown ? (msg.carriedBy || null) : null);
      }
    } else if (msg.type === 'chest_state') {
      // 상자 UI에 반영
      window.__lastChestState = msg;
      renderChestUi(msg.buildingId, msg.data);
    } else if (msg.type === 'arrow_fx') {
      // ★사냥꾼 사격 시각화 — 서버 wildlife 실행층이 발사 순간 1회 방송(존 로컬 px).
      //   절대 월드로 변환해 보관하고, ms 동안 진행률 보간으로 화살을 그린다(서버 비행시간과 동일 속도).
      const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
      _arrowFx.push({
        x0: ox + msg.x0, y0: oy + msg.y0, x1: ox + msg.x1, y1: oy + msg.y1,
        at: performance.now(), ms: Math.max(80, Math.min(1500, msg.ms || 250)),
      });
      if (_arrowFx.length > 96) _arrowFx.shift();   // 폭주 방어
    } else if (msg.type === 'player_left') {
      // ★유령 클라 fix: 본인 제거(사망·서버측 삭제) 수신 → 예측 즉시 정지 + 재연결 트리거.
      //   옛 코드는 자기 pid를 others에서 지우기만 해서, 서버에 실체가 없는데 클라만 계속 걸어다녔다(유령).
      if (msg.pid && msg.pid === myPid) {
        console.warn('[recover] 서버가 내 플레이어를 제거함(player_left) — 예측 정지 후 재연결');
        _selfGone = true;
        myPid = null;                 // 이후 어떤 tick도 "나"로 오인되지 않게
        lastTickWithMyPidAt = 0;      // orphan 워치독 비활성(재연결 welcome이 다시 켬)
        pendingInputs.length = 0;
        myVel.vx = 0; myVel.vy = 0;   // ★관성도 끊는다(존 전환/재연결)
        _predAccum = 0;
        if (conns.has(zoneId)) closeConnection(zoneId); // 다음 프레임 ensurePrimaryConnection이 재연결
        return;
      }
      c.others.delete(msg.pid);
    } else if (msg.type === 'gauges') {
      // ★[T61] HP — 자연 회복은 다른 메시지를 안 낸다(§0-ⓐ). 이 한 줄이 없으면 화면 숫자가 낡는다.
      if (typeof msg.hp === 'number') { myHp = msg.hp; if (typeof msg.maxHp === 'number') myMaxHp = msg.maxHp; }
      if (typeof msg.hunger === 'number') myHunger = msg.hunger;
      if (typeof msg.thirst === 'number') myThirst = msg.thirst;
      if (typeof msg.vp === 'number') myVp = msg.vp;
      if (typeof msg.cold === 'boolean') myCold = msg.cold;
      // ★★[신체 상태 §8.3] 서버가 정본이다. 클라는 **그린다**(단계도 서버가 매겨 보낸다 —
      //   여기서 다시 양자화하면 히스테리시스가 두 벌이 되어 깜빡임이 되살아난다).
      if (msg.weather) { myWeather = msg.weather; window.__weather = msg.weather; }   // ★[온도] 바깥 날씨 + 마을 완충
      if (msg.body) {
        myBody = msg.body; window.__bodyState = msg.body;
        // ★[3층 재배선] 스태미나·회복 배율은 몸 페이로드에 실려 온다(별도 창구 안 만든다).
        if (typeof msg.body.stam === 'number') myStam = msg.body.stam;
        if (typeof msg.body.stamLock === 'boolean') myStamLock = msg.body.stamLock;
        if (typeof msg.body.canSprint === 'boolean') myCanSprint = msg.body.canSprint;
        if (typeof msg.body.recover === 'number') myRecover = msg.body.recover;
        updateHud(); renderMoodles(); if (activeSide === 'body') renderSide('body');
      }
      // ★★[무게 배치 2026-08-27] 소지 무게·과적. **서버가 정본**이고 클라는 그린다.
      //   `combined`(신체×과적, 바닥 적용)는 예측 속도에도 그대로 쓴다 — 안 그러면 러버밴딩이다.
      if (msg.carry) { myCarry = msg.carry; window.__carryState = msg.carry; renderMoodles(); if (activeSide === 'body') renderSide('body'); }
      updateHud();
    } else if (msg.type === 'village_inventory') {
      // ★★[2026-08-03e 배치 12 ③] 마을 재고 — **서버가 준 값을 그대로 그린다**(클라 재계산 0).
      //   식량 환산·자립일수·다음 주민 문턱은 전부 엔진 정본 함수의 결과다(사본 금지).
      //   `_cash`(미상환 세곡 채권 장부)는 서버가 아예 안 보낸다 — 재화와 나란히 놓으면 "부"로 오독된다.
      showVillageInventory(msg.inv);
    } else if (msg.type === 'village_brief') {
      // ★촌장 브리핑 — 말풍선(세계 안) + 알림 한 줄(놓치지 않게). 수치는 안 보여 준다.
      const b = msg.brief || {};
      window.__evLastBrief = b;
      if (b.lines && b.lines.length) {
        villageBubbles.set(b.vid, { lines: b.lines.slice(0, 3), until: performance.now() + 9000 });
        showNotice(`${b.name} 촌장 — ${b.lines[0]}` + (b.board ? `  (게시판 ${b.board}건 · Shift+G)` : ''), 5000);
        needsRedraw = true;
      }
    } else if (msg.type === 'village_trade') {
      myTrade = msg.trade; window.__tradeBoard = msg.trade;
      // ★교환 직후엔 서버가 시세표를 다시 보낸다 — 방금 내 거래가 값을 움직였을 수 있고, 그걸 보는 게 요점이다.
      if (msg.after) { trQuote = null; }
      if (activeSide === 'trade') renderSide('trade');
    } else if (msg.type === 'village_trade_quote') {
      trQuote = msg.quote; window.__tradeQuote = msg.quote;
      if (activeSide === 'trade') renderSide('trade');
    } else if (msg.type === 'fish_state') {
      // ★손맛의 정본 상태. 'bite' 로 바뀌는 그 순간이 이 동사의 전부다.
      // ★★서버가 보내는 좌표는 **존 로컬**이다. 렌더러는 **절대 월드** 좌표를 쓴다(`item.wx` 규약).
      //   변환을 빼먹으면 찌가 40만 픽셀 밖에 그려져 **화면에 아무것도 안 뜬다** —
      //   상태·알림은 멀쩡한데 손맛만 사라지는, 눈으로만 잡히는 종류의 결함이다(실제로 1차에 그랬다).
      if (msg.state === 'idle') fishState = null;
      else {
        const _c = conns.get(primaryZoneId);
        const _ox = (_c && _c.meta && _c.meta.worldOffsetX) || 0, _oy = (_c && _c.meta && _c.meta.worldOffsetY) || 0;
        fishState = { state: msg.state, x: msg.x + _ox, y: msg.y + _oy, lx: msg.x, ly: msg.y,
                      since: performance.now(), windowMs: msg.windowMs || 0, biteAt: msg.biteAt || 0 };
      }
      window.__fishState = fishState ? { ...fishState } : null;
      needsRedraw = true;
    } else if (msg.type === 'fish_catch') {
      fishFx = { kg: msg.kg, n: msg.n, item: msg.item, big: !!msg.big, record: !!msg.record, until: performance.now() + 2200 };
      window.__fishLast = { kg: msg.kg, n: msg.n, item: msg.item, big: !!msg.big, record: !!msg.record };
      needsRedraw = true;
    } else if (msg.type === 'village_chronicle') {
      chronOnMessage(msg.chron);   // ★[T18] 연대기 — 본체는 65-s-chronicle.js(여기선 넘기기만)
    } else if (msg.type === 'village_board') {
      const bd = msg.board || {};
      evBoardCache = bd;
      window.__evLastBoard = bd;
      // ★★[T80 2026-09-03 재민 확정] **토스트가 아니라 판이다.**
      //   종전엔 여기서 `showNotice(…, 9000)` 로 한 문자열을 만들었다 —
      //   겨울 머리줄(T20) · 의뢰 줄 · 들은 소식(T55) · "Shift+N 으로 납품"이 전부 `\n` 으로 이어져
      //   9초 뒤에 사라졌고, **어느 의뢰에 낼지 고를 길이 없었다**.
      //   ⇒ 그 문자열 조립은 통째로 지웠다(토스트 경로 0 — 판이 정본이다).
      //     그리기는 `47-s-board.js` 하나다. 여기서는 넘기기만 한다(연대기와 같은 접점 문법).
      boardOnMessage(bd);
    } else if (msg.type === 'onboarding_state' || msg.type === 'onboarding_quest' || msg.type === 'onboarding_fx' || msg.type === 'onboarding_day') {
      onbOnMessage(msg);   // ★[온보딩 v2] 대본 상태·첫 의뢰·곳간 이펙트·하루 정산 — 그리기는 `70-lobby.js`
    } else if (msg.type === 'pvp_state') {
      myPvpEnabled = !!msg.enabled;
      updateHud();
    } else if (msg.type === 'floor_changed') {
      myFloor = msg.floor;
      updateHud();
    } else if (msg.type === 'handoff') {
      // 서버가 발급한 토큰으로 새 zone에 접속.
      const target = msg.targetZone;
      const token = msg.token;
      if (target === primaryZoneId) return;
      if (!zonesMeta[target]) return;
      console.log('[handoff]', primaryZoneId, '→', target, 'token=', token.slice(0,8));
      const oldPrimary = primaryZoneId;
      primaryZoneId = target;

      // ★ observer로 미리 연결된 ws가 있으면 promote만 — 새 ws 안 만듦 → 끊김 ~0
      const existingTarget = conns.get(target);
      if (existingTarget && existingTarget.role === 'observer' && existingTarget.ws.readyState === 1) {
        console.log('[handoff] promote existing observer ws');
        existingTarget._promoteSentAt = performance.now(); // 끊김 측정용
        existingTarget.ws.send(JSON.stringify({ type: 'promote_to_primary', token }));
        existingTarget.role = 'primary';
        // server가 welcome 보낼 거 — 기존 handleMessage('welcome')에서 처리
      } else {
        // observer 미리 연결 안 됐으면 새 ws 만들기 (기존 흐름)
        if (existingTarget) closeConnection(target);
        connect(target, 'primary', { token });
      }
      // 옛 primary observer로 demote — broadcast 갭 줄임
      const oldConn = conns.get(oldPrimary);
      if (oldConn) oldConn.role = 'observer';
      showNotice(zonesMeta[target].displayName);
    } else if (msg.type === 'kicked') {
      // 다른 곳에서 로그인되어 강제 종료
      kicked = true;
      const reasonMap = { duplicate_login: '다른 곳에서 로그인되어 종료되었습니다.' };
      const text = reasonMap[msg.reason] || `종료 사유: ${msg.reason}`;
      console.warn('[kicked]', text);
      // 모든 연결 정리 후 로비로
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      return;
    } else if (msg.type === 'zone_full') {
      // zone 가득 참 — 로비로 복귀 + 알림
      const text = `${zonesMeta[msg.zone]?.displayName || msg.zone} 가득 참 (${msg.current}/${msg.cap}명). 다른 zone 선택.`;
      console.warn('[zone_full]', text);
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      // zone 인구 강제 새로고침
      fetch('/zones').then(r => r.json()).then(d => { zonesMeta = d.zones; }).catch(() => {});
      return;
    } else if (msg.type === 'auth_error') {
      // 로비로 복귀, 에러 표시
      const reasonMap = {
        wrong_password: '패스워드가 틀렸습니다.',
        username_taken: '이미 사용 중인 이름입니다.',
      };
      const text = reasonMap[msg.reason] || `인증 실패: ${msg.reason}`;
      console.warn('[auth]', text);
      // 연결 종료, 게임 화면 → 로비
      for (const [zid, cc] of conns) try { cc.ws.close(); } catch (e) {}
      conns.clear();
      primaryZoneId = null;
      myPid = null;
      initialWelcomeReceived = false;
      document.getElementById('game').classList.add('hidden');
      document.getElementById('lobby').classList.remove('hidden');
      const err = document.getElementById('authError');
      err.textContent = text;
      err.classList.remove('hidden');
      return;
    } else if (msg.type === 'conn_hello') {
      // ★[접속 진단] 서버가 **받았다**. 인증·로드보다 먼저 오는 신호라,
      //   이게 오면 "서버/망이 죽었다"는 갈래가 지워진다.
      if (c.role === 'primary' && connPhase !== 'ready') {
        connHelloAt = performance.now();
        connMark('entering', { ref: msg.ref || '', stage: 'accepted' });
      }
    } else if (msg.type === 'conn_error') {
      // ★[접속 진단] 서버가 **던졌다**. 기다려도 안 되는 종류다 — 그 사실을 그대로 말한다.
      console.error('[conn] 서버가 접속 처리에 실패했다:', msg.stage, msg.msg, msg.ref);
      if (c.role === 'primary') connMark('error', { reason: msg.msg || '서버 오류', stage: msg.stage || '', ref: msg.ref || '' });
    } else if (msg.type === 'pong') {
      // 14.43: watchdog용 — 최근 pong 시각 기록
      c.lastPongAt = performance.now();
      if (c.role === 'primary') lastRttMs = c.lastPongAt - msg.t;
      // ★[접속 진단] 입장 처리 중의 pong 은 **단계**를 싣고 온다 — 어디서 막혔는지 화면이 안다.
      if (c.role === 'primary' && msg.stage && connPhase !== 'ready') {
        if (!connHelloAt) connHelloAt = performance.now();
        connMark('entering', { stage: msg.stage, ref: msg.ref || connRef });
      }
    } else if (msg.type === 'chat') {
      // 같은 zone(또는 observer zone)에서 온 채팅. 길드 채팅이면 prefix 표시.
      const prefix = msg.tribe ? `[길드:${msg.tribe}] ` : '';
      chatLog.push({ name: prefix + msg.name, color: msg.color || 'var(--thirst)', text: msg.text, t: msg.t, isTribe: !!msg.tribe });
      if (chatLog.length > 20) chatLog.shift();
      speechBubbles.set(msg.pid, { text: (msg.tribe ? '[길드] ' : '') + msg.text, until: performance.now() + 4000 });
      renderChatLog();
    } else if (msg.type === 'notice') {
      showNotice(msg.text);
    }
  }
