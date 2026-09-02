// @@split:41-h-bubble — H — 마을 근접 브리핑 말풍선·하네스 진단 훅 17개 (T53 2차 분할 ①)

  // ★마을 중심의 **절대** 월드 좌표 — 서버 `villageAnchorPx`(ccx*SZ + SZ/2)와 같은 환산에
  //   존 오프셋만 더한 것. 좌표 혼선은 이 프로젝트가 여러 번 당한 함정이라 한 곳에만 둔다.
  function _evVillageAnchorAbs(vid) {
    for (const [, c] of conns) {
      if (!c.simVillages) continue;
      const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
      for (const v of c.simVillages) if (v.id === vid) return { x: ox + v.cx * CL_BUILDING_SIZE + 16, y: oy + v.cy * CL_BUILDING_SIZE + 16, v, c };
    }
    return null;
  }
  // ★근접 브리핑 — 마을 중심에 다가가면 촌장이 말을 건다(하루 한 번).
  //   판정(거리·내용)은 서버가 한다. 여기 있는 건 **발신 게이트**뿐이다 — 매 프레임 보내지 않게.
  function _evProximityTick() {
    let bestVid = null, bestD = EV_BRIEF_PX, seen = 0, minD = Infinity;
    for (const [, c] of conns) {
      if (!c.simVillages) continue;
      const ox = (c.meta && c.meta.worldOffsetX) || 0, oy = (c.meta && c.meta.worldOffsetY) || 0;
      for (const v of c.simVillages) {
        seen++;
        const d = Math.hypot((ox + v.cx * CL_BUILDING_SIZE + 16) - myAbsPredicted.x, (oy + v.cy * CL_BUILDING_SIZE + 16) - myAbsPredicted.y);
        if (d < minD) minD = d;
        if (d < bestD) { bestD = d; bestVid = v.id; }
      }
    }
    // ★진단 훅 — 조용한 try/catch 는 **없는 결함을 숨긴다**. 왜 안 잡혔는지 밖에서 보이게 남긴다.
    //   `me`(예측)와 `srv`(서버 권위)를 **둘 다** 낸다: 둘이 갈리면 그건 근접 판정이 아니라 리컨실리에이션 문제다.
    window.__evDbg = { seen, minD: Math.round(minD), gate: EV_BRIEF_PX,
      me: { x: Math.round(myAbsPredicted.x), y: Math.round(myAbsPredicted.y) },
      srv: myAbsPos ? { x: Math.round(myAbsPos.x), y: Math.round(myAbsPos.y) } : null,
      pid: myPid, corrN: window.__corrN | 0, corrLast: window.__corrLast | 0 };
    evNearVid = bestVid;
    window.__evNearVid = bestVid;
    if (bestVid == null) return;
    const day = window.__evGameDay | 0;
    if (evBriefedDay.get(bestVid) === day) return;   // 하루 한 번 — 왔다 갔다 해도 촌장이 앵무새가 되지 않는다
    evBriefedDay.set(bestVid, day);
    sendPrimary({ type: 'village_brief', vid: bestVid });
  }
  setInterval(() => { try { _evProximityTick(); } catch (e) { window.__evTickErr = String(e && e.message || e); } }, 700);
  // ★하네스 훅 — **읽기 전용만**. 발신은 이미 있는 `window.__sendPrimary` 를 쓴다(새 능력 0).
  window.__evBubbles = () => [...villageBubbles].map(([vid, b]) => ({ vid, lines: b.lines }));
  // ★[신체 상태] 하네스 읽기 훅 — 보내기는 기존 `__sendPrimary` 를 쓴다(새 창구 안 만든다).
  window.__moodles = () => [...document.querySelectorAll('#moodles .moodle')]
    .map((el) => ({ axis: el.dataset.axis, stage: +el.dataset.stage }));
// @@moved:12048
  window.__tradeSel = () => ({ give: trGive, take: trTake, qty: trQty });
  window.__panelText = () => (document.getElementById('spBody') || {}).textContent || '';
  window.__vignetteOn = () => !!(document.getElementById('bodyVignette') || {}).classList?.contains('on');
  // ★[정비 배치 2026-08-30] 하네스 읽기 훅 — **읽기 전용만**. 발신은 기존 `__sendPrimary` 를 쓴다.
  //   비네트가 **원인 축을 말하는가**를 밖에서 볼 수 있어야 ②가 검증된다.
  window.__vgAxis = () => ((document.getElementById('bodyVignette') || {}).dataset || {}).axis || '';
  window.__vgTint = () => {
    const el = document.getElementById('bodyVignette');
    return el ? (el.style.getPropertyValue('--vg-rgb') || '').trim() : '';
  };
  window.__vgAxes = () => [...document.querySelectorAll('#vgAxes .vg-axis')]
    .map((el) => ({ axis: el.dataset.axis, stage: +el.dataset.stage, emo: (el.querySelector('.vg-emo') || {}).textContent }));
  // ★통일 목록 — **DOM 에서** 읽는다. "같은 컴포넌트인가"는 구조로만 증명된다(내부 변수를 보면 자기 증명이다).
  window.__ulRows = (col) => [...document.querySelectorAll(`.inv-col[data-ul-col="${col}"] tr.ul-row`)].map((tr) => ({
    item: tr.dataset.item, kids: +tr.dataset.kids || 0,
    open: !!tr.querySelector('.ul-caret.open'),
    hasCaret: !!tr.querySelector('.ul-caret:not(.ul-none)'),
    text: (tr.querySelector('.it-name') || {}).textContent || '',
    drag: (() => { try { return JSON.parse(tr.dataset.drag); } catch (e) { return null; } })(),
  }));
  window.__ulSubs = (col, item) => [...document.querySelectorAll(`.inv-col[data-ul-col="${col}"] tr.ul-sub[data-item="${item}"]`)].map((tr) => ({
    item: tr.dataset.item, hidden: tr.hasAttribute('hidden'),
    text: (tr.querySelector('.it-name') || {}).textContent || '',
    drag: (() => { try { return JSON.parse(tr.dataset.drag); } catch (e) { return null; } })(),
  }));
  window.__ulToggle = (col, item) => {
    const el = document.querySelector(`.inv-col[data-ul-col="${col}"] tr.ul-row[data-item="${item}"] .ul-caret[data-ul-toggle]`);
    if (!el) return false; el.click(); return true;
  };
  // 통일성 판정용 — 컬럼별 DOM 구조 지문(클래스 조합). 두 벌로 갈리면 지문이 달라진다.
  window.__ulShape = (col) => {
    const tb = document.querySelector(`.inv-col[data-ul-col="${col}"] .inv-table tbody`);
    if (!tb) return null;
    const rows = [...tb.querySelectorAll('tr')];   // ★도구도 같은 컴포넌트를 쓴다(옛 `data-toolid` 제외 필터 삭제)
    return rows.map((tr) => tr.className.trim() + ':' + [...tr.children].map((td) => td.className.trim()).join('|')).join(' / ');
  };
  window.__ledger = () => JSON.parse(JSON.stringify(myLedger || {}));
  window.__lots = () => JSON.parse(JSON.stringify(myLots || {}));
  window.__uiCfg = () => JSON.parse(JSON.stringify(uiCfg || {}));
  // ★[캐릭 시트] 성능 짝 비교 전용 토글 — **같은 화면·같은 순간**에 ON/OFF 를 견주려면 필요하다
  //   (라이브 rAF 짝 비교 캐논). 서버 env 정본은 안 바꾼다 — 이 세션의 화면만 뒤집는다.
  window.__setCharSprite = (v) => { const p = uiCfg.charSprite; uiCfg.charSprite = !!v; return p; };
// @@moved:12091

  function drawSpeechBubble(x, y, text) {
    if (!text) return;
    ctx.font = '12px sans-serif';
    const padding = 6;
    const maxWidth = 200;
    // 줄바꿈
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const lineH = 15;
    const bubW = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width))) + padding * 2;
    const bubH = lines.length * lineH + padding * 2;
    const bx = x - bubW / 2;
    const by = y - bubH - 8;
    // 배경
    ctx.fillStyle = 'rgba(245, 245, 235, 0.95)';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bubW, bubH, 6);
    else ctx.rect(bx, by, bubW, bubH);
    ctx.fill(); ctx.stroke();
    // 꼬리
    ctx.beginPath();
    ctx.moveTo(x - 5, by + bubH);
    ctx.lineTo(x, by + bubH + 6);
    ctx.lineTo(x + 5, by + bubH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 245, 235, 0.95)';
    ctx.fill(); ctx.stroke();
    // 텍스트
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, by + padding + (i + 1) * lineH - 3);
    }
    ctx.textAlign = 'start';
  }

