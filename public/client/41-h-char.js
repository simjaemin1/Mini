// @@split:41-h-char — H — 캐릭터 시트·아이콘·말풍선

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

  // Phase 14.35: 걷기 + 공격 모션
  // - moving: walking bob (sin wave) + 다리 교차
  // - attackPhase 0~1: 무기 휘두름 (앞으로 lunge + 회복)
  // ═══════════════ [캐릭터 스프라이트 2026-08-30] 애니 상태기계 ═══════════════
  //   ★재민 확정: **게임엔 3D 가 아니라 스프라이트로 들어간다**(좀보이드 구빌드·디아블로 방식).
  //   시트·메타는 `scripts/char_render.py` 산물(`/assets/char/`). **클라는 규격을 하드코딩하지 않는다** —
  //   프레임 크기·앵커·행/열 순서·클립 fps 를 전부 `char_meta.json` 에서 읽는다.
  //
  //   ★입력은 **이미 오는 값에서 유도**한다(애니를 위한 새 네트워크 필드 0):
  //     · 속도  — 나: 이동 모델 상태 `myVel` / 남: tick 의 `vx,vy`      → idle / walk / run
  //     · 방향  — 나: `myFacingVx/Vy`(조준 중엔 커서) / 남: `_fvx/_fvy`  → 시트 행
  //     · 공격  — `myLastAttackAt` / `others[].lastAttackAt`(기존 broadcast) → swing 원샷
  //     · 조준  — 나: `_aiming`.  ⚠남의 조준은 **네트워크에 없다** → 남은 aim 자세가 안 나온다(회부).
  //   ★프레임 진행은 렌더 프레임(rAF) 기준, 상태는 서버 권위 값에서 유도 — 이 둘을 섞지 않는다.
  let _charMeta = null, _charMetaTried = false;
  const _charImg = new Map();        // key -> {img, ok}
  const _charAnim = new Map();       // pid -> {clip, t, one, oneT, lastAtk, lastT}

  function charMeta() {
    if (_charMeta || _charMetaTried) return _charMeta;
    _charMetaTried = true;
    fetch('/assets/char/char_meta.json').then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!j || !j.frameW) return;
        _charMeta = j; window.__charMeta = j;
        // ★★전 시트를 **한꺼번에** 미리 받는다. 클립을 처음 쓸 때 게으르게 받으면
        //   ⓐ 그 순간 스프라이트가 도형으로 튀고 ⓑ 상태는 이미 진행했는데 그림만 안 나가
        //   진단 훅이 **낡은 값을 들고 있게** 된다(1차 실행에서 실제로 그렇게 오독했다).
        for (const key of Object.keys(j.sheets || {})) charSheet(key);
      })
      .catch(() => {});
    return null;
  }

  function charSheet(key) {
    let e = _charImg.get(key);
    if (e) return e.ok ? e.img : null;
    const img = new Image();
    e = { img, ok: false };
    _charImg.set(key, e);
    img.onload = () => { e.ok = true; };
    img.onerror = () => { e.ok = false; };
    img.src = '/assets/char/' + key + '.png';
    return null;
  }

  // 월드 방향 → 시트 행. ★메타가 정의한 그 식 그대로(눈대중 금지 — 족보 74).
  function charDirRow(fx, fy) {
    if (!fx && !fy) return 0;
    let d = Math.round(Math.atan2(fy, fx) / (Math.PI / 4));
    return ((d % 8) + 8) % 8;
  }

  // 착장 → 레이어 키. 없는 착장은 레이어 생략.
  //   ⚠남의 착장은 네트워크에 없다 — 기본 베옷만 입힌다(알몸으로 보이지 않게). 회부.
  function charLayersFor(isMe) {
    const L = ['body', 'clothes_hemp'];        // 베옷은 기본 — 알몸 금지(고증: 서민 삼베 한 벌)
    if (!isMe) return L;                       // ⚠남의 착장은 네트워크에 없다(회부)
    // ★손에 든 것 = **도구 인스턴스 정본**(`getEquippedInstance`) 우선, 없으면 장비 무기 슬롯.
    //   시트는 실루엣 두 종뿐이다: 자루+날(axe) / 긴 장대(rod). 종류 확장은 목록 한 줄 + 재렌더.
    let t = '';
    const ti = getEquippedInstance();
    if (ti && ti.type) t = String(ti.type);
    if (!t && equipSlots && equipSlots.weapon) {
      const wi = (equipment || []).find((q) => q.id === equipSlots.weapon);
      if (wi && wi.type) t = String(wi.type);
    }
    if (!t) return L;                          // 맨손 — 도구 레이어 생략
    if (/rod|fish|낚/i.test(t)) L.push('tool_rod');
    else L.push('tool_axe');
    return L;
  }

  function charState(pid, speed, aiming, attackAt, dtSec) {
    let st = _charAnim.get(pid);
    if (!st) { st = { clip: 'idle', t: 0, one: null, oneT: 0, lastAtk: attackAt || 0 }; _charAnim.set(pid, st); }
    const m = _charMeta;
    // 공격 트리거 = lastAttackAt 이 **커졌을 때** 한 번(에지). 값 자체가 아니라 변화를 본다.
    if (attackAt && attackAt > st.lastAtk) { st.lastAtk = attackAt; st.one = 'swing'; st.oneT = 0; }
    if (st.one) {
      const c = m.clips[st.one];
      st.oneT += dtSec;
      if (st.oneT * c.fps >= c.frames) st.one = null;   // 원샷 끝 → 이전 상태 복귀
    }
    let clip = 'idle';
    if (speed > (uiCfg.charRunMin || 102)) clip = 'run';
    else if (speed > (uiCfg.charWalkMin || 4)) clip = 'walk';
    if (aiming && clip === 'idle') clip = 'aim';
    if (st.clip !== clip) { st.clip = clip; st.t = 0; }
    st.t += dtSec;
    const active = st.one || st.clip;
    const c = m.clips[active];
    let fi;
    if (st.one) fi = Math.min(c.frames - 1, Math.floor(st.oneT * c.fps));
    else fi = Math.floor(st.t * c.fps) % c.frames;
    return { clip: active, frame: fi };
  }

  /** 스프라이트로 그린다. 성공하면 true — 실패(시트 미로딩·플래그 OFF)면 false 로 도형 경로에 넘긴다. */
  function drawCharSprite(x, y, isMe, opts) {
    if (!uiCfg.charSprite) return false;
    const m = charMeta();
    if (!m) return false;
    // ★[T13] NPC 는 직업 표식 표를 쓴다(`40-r2-sprites.js` — 이 파일에 함수를 새로 만들지 않는다).
    const layers = opts.job ? npcCharLayers(opts.job) : charLayersFor(isMe);
    // ★한 장이라도 안 떠 있으면 **아무것도 안 그린다** — 반쪽 합성(몸만·옷만)이 화면에 나가면
    //   "픽셀 정렬 0px" 계약이 지켜지는지 눈으로 볼 수 없다. 다 뜰 때까지 도형으로 버틴다.
    const st0 = _charAnim.get(opts.pid);
    const now = performance.now();
    const dtSec = st0 && st0.lastT ? Math.min(0.25, (now - st0.lastT) / 1000) : 0;
    const stt = charState(opts.pid, opts.speed || 0, !!opts.aiming, opts.attackAt || 0, dtSec);
    _charAnim.get(opts.pid).lastT = now;
    const imgs = [];
    for (const L of layers) {
      const img = charSheet(L + '_' + stt.clip);
      if (!img) {
        // ★훅은 여기서도 갱신한다 — 안 그러면 "안 그려짐"이 "낡은 값"으로 위장한다.
        if (!window.__charDbg) window.__charDbg = {};
        window.__charDbg[opts.pid] = { on: false, why: 'sheet:' + L + '_' + stt.clip,
                                       clip: stt.clip, isMe: !!isMe, t: performance.now() };
        return false;
      }
      imgs.push(img);
    }
    const row = charDirRow(opts.fvx, opts.fvy);
    // ★그리는 순서는 몸→옷→도구로 **고정**이다. 깊이는 시트를 구울 때 홀드아웃이 이미 잡았다
    //   (`scripts/char_render.py` 의 set_visible 주석). 한때 메타의 순서표를 프레임마다 읽어
    //   뒤집었는데(2026-08-31 오전), 그건 부분해였고 3차에서 홀드아웃으로 대체됐다.
    const fw = m.frameW, fh = m.frameH;
    const sx = stt.frame * fw, sy = row * fh;
    const dx = Math.round(x - m.anchorX), dy = Math.round(y - m.anchorY);
    // 발밑 그림자 — 도형 경로와 같은 자리·같은 크기(시트가 바뀌어도 접지감은 유지)
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    for (const img of imgs) ctx.drawImage(img, sx, sy, fw, fh, dx, dy, fw, fh);
    // ★진단 훅은 **pid 별**이다 — 마지막에 그린 하나만 남기면 "타 플레이어도 같은 애니"를 못 잰다.
    if (!window.__charDbg) window.__charDbg = {};
    window.__charDbg[opts.pid] = { on: true, clip: stt.clip, frame: stt.frame, row,
                         layers: layers.slice(),
                         job: opts.job || null,      // ★[T13] NPC 직업 — 하네스가 표식을 판정하는 재료

                         speed: +(opts.speed || 0).toFixed(2),
                         aiming: !!opts.aiming, isMe: !!isMe, fw, fh,
                         facing: [+(opts.fvx || 0).toFixed(4), +(opts.fvy || 0).toFixed(4)],
                         anchor: [m.anchorX, m.anchorY], t: performance.now() };
    return true;
  }

  function drawPlayerIso(x, y, name, color, isMe = false, opts = {}) {
    const t = performance.now() * 0.01;
    const moving = opts.moving || false;
    const isDown = !!opts.isDown; // Phase 14.41
    const attackP = Math.max(0, opts.attackPhase || 0); // 0=쉼, 1=시작, 0.5=중간
    // §18 3파: 포로 표식 — 발치 회색 테두리 링(호송·억류. 서버 makeEntry cap 1비트)
    if (opts.cap) { ctx.strokeStyle = 'rgba(200,200,200,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 4, 11, 4.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    // Phase 14.41: 다운 — 누워있는 모습 (옆으로 길게)
    if (isDown) {
      // 그림자 크게
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      // 몸통 (옆으로 누움)
      ctx.fillStyle = color;
      ctx.fillRect(x - 12, y - 2, 22, 7);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 12, y - 2, 22, 7);
      // 머리 (한쪽 끝)
      ctx.beginPath(); ctx.arc(x + 12, y + 1, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f0d8b8'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      // X 눈 (다운)
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x + 10, y - 1); ctx.lineTo(x + 13, y + 2);
      ctx.moveTo(x + 13, y - 1); ctx.lineTo(x + 10, y + 2); ctx.stroke();
      // 이름 + 💀
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8888';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
      ctx.strokeText('💀 ' + name, x, y - 12);
      ctx.fillText('💀 ' + name, x, y - 12);
      ctx.textAlign = 'start';
      return;
    }
    // §4-4 P4: 전쟁 병사 전투 스타일 — 기존 휴머노이드 경로(서버 위치 보간·걷기)를 유지하고
    //   병종색(bt)·진영 테두리(bs)·궤주 반투명(br)·지휘관 금테(bc)만 덧입힘("전투 스타일 분기만 추가").
    const isWar = !!opts.war;
    const bodyColor = isWar ? (WAR_BT_COL[opts.bt | 0] || color) : color;
    const _aSave = ctx.globalAlpha;
    if (isWar && opts.br) ctx.globalAlpha = _aSave * 0.45;   // 궤주=반투명
    // Phase 14.37: facing — vx/vy를 iso 화면 방향으로 변환
    // world(vx,vy) → iso 화면 dx,dy: dx = vx-vy, dy = (vx+vy)/2
    const fvx = opts.fvx || 0, fvy = opts.fvy || 0;
    const fdx = fvx - fvy;
    const fdy = (fvx + fvy) * 0.5;
    const flen = Math.hypot(fdx, fdy) || 1;
    const facingX = fdx / flen, facingY = fdy / flen; // 화면상 방향 unit vector
    // walk bob (위아래 살짝)
    const bob = moving ? Math.sin(t * 1.3) * 1.6 : 0;
    // attack lunge (앞으로 살짝 — 화면상 동남 방향)
    const lungeAmt = Math.sin(attackP * Math.PI) * 5;
    const lx = x + lungeAmt * 0.5;
    const ly = y + lungeAmt * 0.3;

    // 그림자 — 발이 움직일 때도 그림자 고정
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 6, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

    // 다리 (걷기 시 좌우 교차)
    const legSwing = moving ? Math.sin(t * 1.8) * 2 : 0;
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(lx - 4, ly + 3, 3, 5 - legSwing);
    ctx.fillRect(lx + 1, ly + 3, 3, 5 + legSwing);

    // 몸통 (bob 적용) — 전쟁 병사는 병종색
    ctx.fillStyle = bodyColor;
    ctx.fillRect(lx - 5, ly - 6 + bob, 10, 12);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.strokeRect(lx - 5, ly - 6 + bob, 10, 12);
    if (isWar) { ctx.strokeStyle = WAR_SIDE_COL[opts.bs | 0] || '#fff'; ctx.lineWidth = 2; ctx.strokeRect(lx - 6, ly - 7 + bob, 12, 14); }   // 진영 테두리(0공격 파랑·1방어 빨강)

    // 팔 + 슬래시 (공격 시 앞쪽으로 휘두름)
    if (attackP > 0) {
      // 팔
      ctx.strokeStyle = '#f0d8b8'; ctx.lineWidth = 2;
      const swing = Math.sin(attackP * Math.PI);
      const armX = lx + facingX * 8 + swing * facingX * 6;
      const armY = ly - 2 + bob + facingY * 4 + swing * facingY * 3;
      ctx.beginPath();
      ctx.moveTo(lx + facingX * 2, ly + bob + facingY * 1);
      ctx.lineTo(armX, armY);
      ctx.stroke();
      // Phase 14.38: 슬래시 호 — facing 방향 앞쪽에 짧은 흰 arc (반투명)
      const slashR = 16;
      const slashCx = lx + facingX * 10;
      const slashCy = ly + bob + facingY * 6;
      const baseAng = Math.atan2(facingY, facingX);
      // 호 각도: attackP 0→1 진행 따라 -π/3 → +π/3 회전 (휘두름)
      const sweep = (attackP - 0.5) * (Math.PI * 0.8);
      ctx.strokeStyle = `rgba(255, 255, 255, ${attackP * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(slashCx, slashCy, slashR, baseAng + sweep - 0.4, baseAng + sweep + 0.4);
      ctx.stroke();
    }

    // 머리 (bob 적용)
    const hx = lx, hy = ly - 11 + bob;
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f0d8b8'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    // Phase 14.37: 눈 (facing 방향) — 작은 검은 점 2개
    if (fvx !== 0 || fvy !== 0) {
      const eyeOX = facingX * 2.5, eyeOY = facingY * 1.5;
      // 두 눈 (좌우 분리) — facing에 수직인 방향
      const perpX = -facingY, perpY = facingX;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(hx + eyeOX + perpX * 1.5, hy + eyeOY + perpY * 1.5, 0.9, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + eyeOX - perpX * 1.5, hy + eyeOY - perpY * 1.5, 0.9, 0, Math.PI*2); ctx.fill();
    }

    // §4-4 P4: 지휘관 금테 + ★ (bc) — 발치 금색 링 + 머리 위 별.
    if (isWar && opts.bc) {
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(lx, ly + 6, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffe14d'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('★', hx, hy - 8); ctx.textAlign = 'start';
    }
    if (isWar) ctx.globalAlpha = _aSave;   // 알파 복원 — 이름표는 정상 가시(궤주여도 라벨 판독)

    // 이름표
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#fff' : '#cdd6e3';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(name, x, y - 22);
    ctx.fillText(name, x, y - 22);
    // ★[액션 라벨 — 생활 층 100% 가시화] 이름 위 작은 행동 라벨(모내기·잠행·추적·개간·건축·취침…) — 서버 makeEntry e.act
    if (opts.act && !isMe) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#ffd77a';
      ctx.lineWidth = 2.5;
      ctx.strokeText(opts.act, x, y - 33);
      ctx.fillText(opts.act, x, y - 33);
    }
    ctx.textAlign = 'start';
  }

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

  // === 거래소 UI ===
  let marketOpen = false;
  function toggleMarketplace() {
    // Phase 14.16: 옛 modal 대신 새 슬라이드 패널로
    if (typeof togglePanel === 'function') return togglePanel('market');
    marketOpen = !marketOpen;
    const panel = document.getElementById('marketPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !marketOpen);
    if (marketOpen) refreshMarket();
  }
  async function refreshMarket() {
    try {
      const r = await fetch('/market/orders');
      const data = await r.json();
      const list = document.getElementById('marketOrders');
      if (!list) return;
      list.innerHTML = '';
      for (const o of data.orders.slice(-20).reverse()) {
        const li = document.createElement('div');
        li.className = 'market-order';
        const isMine = o.player_id === myUsername;
        li.innerHTML = `<span class="${o.side === 'sell' ? 'sell' : 'buy'}">${o.side === 'sell' ? '판매' : '구매'}</span>
          ${o.item} ×${o.amount} @ ${o.price_item} ${o.price_amount}/개
          <span class="who">${o.player_id}${isMine ? ' (나)' : ''}</span>
          ${isMine ? `<button data-cancel="${o.id}">취소</button>` : ''}`;
        list.appendChild(li);
      }
      list.querySelectorAll('[data-cancel]').forEach(btn => {
        btn.onclick = async () => {
          await fetch('/market/cancel', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ player_id: myUsername, order_id: +btn.dataset.cancel }),
          });
          refreshMarket();
        };
      });
    } catch (e) { console.error(e); }
  }
  async function placeOrder(side) {
    if (!myUsername) { showNotice('로그인이 필요합니다 (게스트 거래소 사용 불가)'); return; }
    const item = document.getElementById('marketItem').value;
    const amount = +document.getElementById('marketAmount').value || 1;
    const priceItem = item === 'wood' ? 'stone' : 'wood';
    const priceAmount = +document.getElementById('marketPrice').value || 1;
    try {
      const r = await fetch('/market/order', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ player_id: myUsername, side, item, amount, price_item: priceItem, price_amount: priceAmount }),
      });
      const data = await r.json();
      if (data.error) showNotice(`거래소: ${data.error}`);
      else showNotice(`주문 등록: ${data.matched === 'full' ? '즉시 체결!' : data.matched === 'partial' ? '부분 체결' : '대기 중'}`);
      refreshMarket();
    } catch (e) { showNotice('거래소 오류'); }
  }

  // === 상자 UI === (Phase 14.21 — 옛 modal 폐기, 새 인벤 패널로 redirect)
  let openChestId = null;
  function openChest(buildingId) {
    if (typeof openInvWithContainer === 'function') return openInvWithContainer(buildingId);
    openChestId = buildingId;
    document.getElementById('chestPanel')?.classList.remove('hidden');
    renderChestUi(buildingId, null);
  }
  function closeChest() {
    openChestId = null;
    document.getElementById('chestPanel')?.classList.add('hidden');
  }

  // === Craft 패널 ===
  let craftOpen = false;
  function toggleCraft() {
    if (typeof togglePanel === 'function') return togglePanel('craft'); // 14.16
    craftOpen = !craftOpen;
    const panel = document.getElementById('craftPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !craftOpen);
    if (craftOpen) renderCraftPanel();
  }
  const TOOL_ICONS = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️' };
  const TOOL_LABELS = { axe: '도끼', pickaxe: '곡괭이', sword: '검' };
  // 플레이어 장비 아이콘·미리보기(서버 EQUIPMENT_META와 동일 공식 = 단일진실)
  const EQUIP_ICONS = { clothes: '🧥', armor: '🛡️', weapon: '⚔️', tool: '🔧' };
  function equipSkillLevel(skill) {
    const xp = (craftSkill && craftSkill[skill]) || 0;
    const per = (equipmentMeta && equipmentMeta.xpPerLevel) || 6;
    return Math.max(0, Math.min(10, Math.floor(xp / per)));
  }
  function equipPreview(itemType, material, skill) {
    if (!equipmentMeta) return null;
    const t = equipmentMeta.types[itemType]; if (!t) return null;
    const g = equipmentMeta.matGrade[material];
    const grade = (g == null ? 0.6 : g); // 미등록 재료 = 삼베급 폴백(서버 matGrade 동일)
    const span = equipmentMeta.qSkillSpan;
    const qSkill = 1 - span + span * (Math.max(0, Math.min(10, skill)) / 10);
    const q = qSkill * grade;
    return { attr: Math.round(t.attrScale * q), dura: Math.round(t.baseDura * (1 + equipmentMeta.duraSpan * q)), attrLabel: t.attr };
  }
