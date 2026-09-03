// @@split:35-x-war — X — 전쟁 전투 관전·지휘·지시자·전쟁 HUD (T51 ④)
  // ═══════════ §4-4 P4: 전쟁 전투 관전·지휘·지시자 (랩 focusCameraOnBattle·drawNeighborArrow 정합) ═══════════
  // 레지스트리 만료 — 2Hz broadcast 끊김(종전·시야밖) 6s, 종료 표식 5s 잔류 후 제거.
  function pruneWarBattles() {
    const now = performance.now(); let changed = false;
    for (const [id, b] of warBattles) {
      if ((now - (b.seenAt || 0)) > 6000 || (b.resolvedAt && (now - b.resolvedAt) > 5000)) {
        warBattles.delete(id); changed = true;
        if (_warSpec.id === id) stopSpectate();
        if (_warCmdId === id) _warCmdId = null;
      }
    }
    return changed;
  }
  // 화면 안=교전 마커(atk A:B def), 화면 밖=가장자리 방향 화살(drawNeighborArrow 패턴).
  function drawBattleIndicators(toScreen) {
    if (!warBattles.size) return;
    if (pruneWarBattles()) updateWarHud();
    for (const b of warBattles.values()) {
      const iso = w2i(b.ox, b.oy), s = toScreen(iso.x, iso.y), m = 46;
      const off = (s.x < m || s.x > W - m || s.y < m || s.y > H - m);
      const col = (b.phase === 'resolved') ? '#c9c04b' : (_warSpec.id === b.id ? '#ffe14d' : '#ff8a5a');
      if (off) {
        const dx = s.x - W / 2, dy = s.y - H / 2, ang = Math.atan2(dy, dx), r = Math.min(W, H) * 0.42;
        const ax = W / 2 + Math.cos(ang) * r, ay = H / 2 + Math.sin(ang) * r;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-7, 9); ctx.lineTo(-2, 0); ctx.lineTo(-7, -9); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
        const lxp = W / 2 + Math.cos(ang) * (r - 26), lyp = H / 2 + Math.sin(ang) * (r - 26);
        ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        const txt = `${b.aliveA}:${b.aliveB}`;
        ctx.strokeText(txt, lxp, lyp); ctx.fillText(txt, lxp, lyp); ctx.textAlign = 'start';
      } else {
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
        const txt = (b.phase === 'resolved')
          ? `⚑ ${b.atk || ''} vs ${b.def || ''} 종료`
          : `${b.atk || ''} ${b.aliveA} : ${b.aliveB} ${b.def || ''}`;
        ctx.strokeText(txt, s.x, s.y - 44); ctx.fillText(txt, s.x, s.y - 44); ctx.textAlign = 'start';
      }
    }
  }
  // 관전 카메라 — 현재 카메라(_lastCamAbs)에서 전투 origin(abs px)으로 0.6s 트윈(render가 구동).
  function focusCameraOnBattle(b) {
    if (!b) return;
    _warSpec.active = true; _warSpec.returning = false; _warSpec.id = b.id;
    _warSpec.from = { x: _lastCamAbs.x, y: _lastCamAbs.y };
    _warSpec.to = { x: b.ox, y: b.oy }; _warSpec.t0 = performance.now();
  }
  function spectateBattle(id) { const b = warBattles.get(id); if (b) { focusCameraOnBattle(b); updateWarHud(); } }
  function stopSpectate() {
    if (_warSpec.active) { _warSpec.returning = true; _warSpec.from = { x: _lastCamAbs.x, y: _lastCamAbs.y }; _warSpec.t0 = performance.now(); }
    _warSpec.active = false; _warSpec.id = null; _warSpec.to = null;
    updateWarHud();
  }
  // 지휘 참가/해제 — war_command_join 송신(서버 진영·근접 검증). 기존 input 채널(WASD) 그대로 재사용. id=null=해제.
  function setCommand(id) {
    _warCmdId = id; _warCmdMsg = id ? '지휘 요청 중…' : '';
    sendPrimary({ type: 'war_command_join', warId: id });
    if (id) { const b = warBattles.get(id); if (b) focusCameraOnBattle(b); }
    updateWarHud();
  }
  function toggleCommand(id) { setCommand(_warCmdId === id ? null : id); }
  // 스펙테이터 HUD DOM — 진행 전투 목록·A/B 카운트·casus·phase + 관전/지휘 버튼.
  function _warBtnCss(bg) {
    return 'flex:1;padding:3px 6px;font:11px sans-serif;color:var(--fg);background:' + bg
      + ';border:1px solid rgba(var(--fg-rgb), 0.2);border-radius: 0;cursor:pointer;';
  }
  function ensureWarHud() {
    if (_warHudEl) return _warHudEl;
    const host = document.getElementById('game') || document.body;
    const el = document.createElement('div');
    el.id = 'warHud';
    el.style.cssText = 'position:absolute;top:64px;right:12px;z-index:40;width:236px;max-height:60vh;overflow:auto;'
      + 'background:rgba(var(--pane-rgb), 0.88);border:1px solid rgba(var(--hp-rgb), 0.5);border-radius: 0;'
      + 'padding:8px 10px;font:12px/1.5 sans-serif;color:var(--fg);box-shadow:0 4px 16px rgba(var(--bg-rgb), 0.5);display:none;';
    host.appendChild(el); _warHudEl = el; return el;
  }
  function updateWarHud() {
    const el = ensureWarHud(), list = [...warBattles.values()];
    if (!list.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block'; el.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:bold;color:var(--hp);margin-bottom:6px;';
    head.textContent = `진행 전투 ${list.length}`; el.appendChild(head);
    for (const b of list) {
      const row = document.createElement('div');
      row.style.cssText = 'border-top:1px solid rgba(var(--fg-rgb), 0.08);padding:5px 0;';
      const title = document.createElement('div');
      title.innerHTML = `<span style="color:${WAR_SIDE_COL[0]}">${b.atk || '?'}</span> vs `
        + `<span style="color:${WAR_SIDE_COL[1]}">${b.def || '?'}</span>`;
      row.appendChild(title);
      const stat = document.createElement('div');
      stat.style.cssText = 'color:var(--dim);font-size:11px;';
      stat.textContent = `A ${b.aliveA} · B ${b.aliveB} · ${b.casus || ''} · ${b.phase === 'resolved' ? '종료' : '교전'}`;
      row.appendChild(stat);
      if (b.phase !== 'resolved') {
        const btns = document.createElement('div');
        btns.style.cssText = 'margin-top:4px;display:flex;gap:6px;';
        const bSpec = document.createElement('button');
        bSpec.textContent = (_warSpec.id === b.id) ? '관전중' : '관전';
        bSpec.style.cssText = _warBtnCss((_warSpec.id === b.id) ? 'var(--stam)' : 'var(--inset)');
        bSpec.addEventListener('click', () => spectateBattle(b.id)); btns.appendChild(bSpec);
        const bCmd = document.createElement('button');
        bCmd.textContent = (_warCmdId === b.id) ? '지휘 해제' : '지휘';
        bCmd.style.cssText = _warBtnCss((_warCmdId === b.id) ? 'var(--accent)' : 'var(--inset)');
        bCmd.addEventListener('click', () => toggleCommand(b.id)); btns.appendChild(bCmd);
        row.appendChild(btns);
      }
      el.appendChild(row);
    }
    if (_warSpec.active || _warSpec.returning || _warCmdId) {
      const foot = document.createElement('div');
      foot.style.cssText = 'margin-top:6px;border-top:1px solid rgba(var(--fg-rgb), 0.12);padding-top:5px;';
      if (_warCmdMsg) { const mm = document.createElement('div'); mm.style.cssText = 'color:var(--accent-hi);font-size:11px;margin-bottom:4px;'; mm.textContent = _warCmdMsg; foot.appendChild(mm); }
      const bStop = document.createElement('button');
      bStop.textContent = '관전/지휘 종료 → 내 캐릭터';
      bStop.style.cssText = _warBtnCss('var(--line)');
      bStop.addEventListener('click', () => { if (_warCmdId) setCommand(null); stopSpectate(); }); foot.appendChild(bStop);
      el.appendChild(foot);
    }
  }

