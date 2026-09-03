// @@split:70-lobby — 온보딩 v2 시작 화면 · 도착 · 30분 대본 (§9)
//
// ★설계 정본: `설계_게임성_사건레이어_TODO.md` §9 [재민 확정 2026-08-25] ·
//   실행 지시 [재민 확정 2026-09-01]. 서버 정본은 `server/onboarding.js`.
//
// ★★이 조각의 규약 세 줄
//   ① **최상위 실행문 0개.** 분할 규약(`인계/공통.md` ⓒ)이고 `test-client-globals ③` 이 검사한다.
//      초기화는 전부 `onbLobbyInit()` 안에서 — `30-n-net.js` 의 `boot()` 이 한 줄로 부른다.
//   ② **판정은 서버.** 여기 있는 건 그리기와 발신뿐이다(추천 마을·도착 지점·의뢰·권리 전부 서버).
//   ③ **화살표·마커·팝업 금지**(§9.5). 안내는 촌장 대사와 **바라보는 방향**뿐이다.
//
// ★이름은 전부 `onb` 로 시작한다 — 조각들이 같은 전역 렉시컬 스코프를 쓰므로 충돌이 곧 SyntaxError 다.

let onbStartVid = null;         // 시작 화면에서 고른 마을(vid) — `connect()` 가 ws 쿼리로 싣는다
let onbInfo = null;             // /startinfo 응답
let onbState = null;            // 서버가 준 대본 상태
let onbQuest = null;            // 첫 의뢰(서버가 고른 것)
let onbDayText = '';            // HUD 하루 정산 한 줄
let onbGreeted = false;         // 촌장 첫 조우를 이미 청했나
let onbArrived = false;         // 도착 카메라(바라보는 방향)를 이미 맞췄나
let onbLastDay = -1;
let onbTimer = null;
let onbSelVid = null;
let onbWarmTries = 0;          // 도착 지점이 다 구워질 때까지 시작 화면이 다시 묻는 횟수

// ── 존 HTTP 주소 — 로비는 central 오리진에서 뜨고 존은 다른 호스트다 ────────────
//   `/startinfo` 는 존이 CORS 를 열어 답한다(`/lifedbg` 와 같은 규약).
function onbHttpBase(zoneId) {
  const zm = (window.__getZonesMeta && window.__getZonesMeta()) || {};
  const meta = zm[zoneId];
  if (!meta || !meta.wsUrl) return null;
  return String(meta.wsUrl).replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}
function onbFetchInfo(zoneId) {
  const base = onbHttpBase(zoneId);
  if (!base) return Promise.resolve(null);
  return fetch(base + '/startinfo', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && j.ok ? j : null))
    .catch(() => null);
}

// ── 시작 화면 ────────────────────────────────────────────────────────────────
//   지도 = 마을 목록(§9.1). 성격 아이콘 + 규모 + **근황 한 줄** + 혼잡도.
//   근황이 곧 선택 근거이자, 세계가 살아있다는 첫 증명이다.
// ★[T66] CSS 토큰 하나를 읽어 온다 — SVG 는 currentColor 를 못 쓰는 자리가 있어 값이 필요하다.
//   ⚠값을 여기 적지 않는다: 적는 순간 `style.css` 와 갈리고, 그게 사본이다.
function onbTok(name) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor'; }
  catch (e) { return 'currentColor'; }
}
function onbEnsureDom() {
  if (document.getElementById('onbStart')) return document.getElementById('onbStart');
  const card = document.querySelector('#lobby .lobby-card');
  if (!card) return null;
  // ★★로비는 `position:fixed` + 세로 가운데 정렬이라 **스크롤이 없다**(style.css). 카드가 뷰포트보다
  //   길어지면 「월드 입장」이 화면 밖으로 나가 **누를 수가 없다** — 통합 러너에서 900×700 창을 쓰는
  //   하네스가 정확히 그걸로 클릭 타임아웃을 냈다. style.css 는 이 배치의 접점이 아니므로 여기서 푼다.
  const lob = document.getElementById('lobby');
  if (lob) { lob.style.overflowY = 'auto'; lob.style.alignItems = 'flex-start'; lob.style.padding = '24px 0'; }
  const box = document.createElement('div');
  box.id = 'onbStart';
  // ★★[T66 · 화면 규칙 B §5] 시작 화면이 **로그인 판의 오른쪽 열**로 옮겨졌다.
  //   ⚠id·훅은 하나도 안 바꿨다(행동 변경 0): `#onbStart`·`#onbMap`·`#onbCard`·`#onbAny`·`#onbHint`
  //     그대로다 — `e2e-onboarding` 이 그것들로 잡는다.
  //   ⚠색·모서리를 여기서 적지 않는다(토큰 규약) — class 만 얹고 값은 `style.css` 가 정한다.
  box.innerHTML = ''
    + '<div id="onbCards" class="onb-cards"></div>'
    + '<svg id="onbMap" class="onb-map" viewBox="0 0 360 130" preserveAspectRatio="none"></svg>'
    + '<div id="onbCard" class="onb-detail"></div>'
    + '<button id="onbAny" type="button" class="onb-any">아무 곳이나 (추천)</button>'
    + '<div class="sublabel" id="onbHint">지도를 눌러 고르게 — 급하면 아무 곳이나</div>';
  // ★자리: 오른쪽 열의 `#lobbyVillages`. 없으면(옛 마크업) 종전 자리로 떨어진다.
  const host = document.getElementById('lobbyVillages');
  if (host) { host.appendChild(box); return box; }
  const anchor = document.getElementById('zoneRow');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
  else card.appendChild(box);
  return box;
}
function onbBounds() {
  const vs = (onbInfo && onbInfo.villages) || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of vs) { if (v.cx < x0) x0 = v.cx; if (v.cx > x1) x1 = v.cx; if (v.cy < y0) y0 = v.cy; if (v.cy > y1) y1 = v.cy; }
  if (!isFinite(x0)) return null;
  const pad = Math.max(8, (x1 - x0 + y1 - y0) * 0.04);
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
const ONB_MAP_W = 360, ONB_MAP_H = 130;   // viewBox 단위(그리기·클릭이 같은 자를 쓴다)
function onbMapXY(v, bb) {
  return { x: ((v.cx - bb.x0) / Math.max(1, bb.x1 - bb.x0)) * ONB_MAP_W,
           y: ((v.cy - bb.y0) / Math.max(1, bb.y1 - bb.y0)) * ONB_MAP_H };
}
function onbSvgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function onbDrawMap() {
  const sv = document.getElementById('onbMap');
  if (!sv || !onbInfo) return;
  while (sv.firstChild) sv.removeChild(sv.firstChild);
  const bb = onbBounds();
  if (!bb) return;
  for (const v of onbInfo.villages) {
    const p = onbMapXY(v, bb);
    const r = v.popBand === 'big' ? 4.5 : v.popBand === 'mid' ? 3.4 : 2.6;
    // ★[T66] 색을 여기서 적지 않는다 — `style.css` 토큰을 읽어 쓴다(값이 두 군데 있으면 그게 사본이다).
    if (onbInfo.recommend === v.vid) sv.appendChild(onbSvgEl('circle', { cx: p.x, cy: p.y, r: r + 3, fill: 'none', stroke: onbTok('--accent'), 'stroke-width': 1.2 }));
    if (onbSelVid === v.vid) sv.appendChild(onbSvgEl('circle', { cx: p.x, cy: p.y, r: r + 5.2, fill: 'none', stroke: onbTok('--fg-strong'), 'stroke-width': 1.4 }));
    sv.appendChild(onbSvgEl('circle', { cx: p.x, cy: p.y, r,
      fill: v.ch === 'fishing' ? onbTok('--thirst') : v.ch === 'mining' ? onbTok('--accent') : onbTok('--stam'),
      stroke: v.busy > 0 ? onbTok('--fg') : 'none', 'stroke-width': v.busy > 0 ? 1 : 0 }));
    // ★[T19] 사람이 세운 마을 — **점선 테**로 가른다(§9.3 "시작 지도가 곧 길드 모집 채널").
    //   지도에 올라 있다는 것 자체가 이미 서버 판정을 통과했다는 뜻이다(클라가 다시 안 푼다).
    if (v.player) sv.appendChild(onbSvgEl('circle', { cx: p.x, cy: p.y, r: r + 2, fill: 'none',
      stroke: onbTok('--accent-hi'), 'stroke-width': 1.1, 'stroke-dasharray': '2 2' }));
  }
}
function onbPickAt(px, py) {
  if (!onbInfo) return null;
  const bb = onbBounds(); if (!bb) return null;
  let best = null, bd = Infinity;
  for (const v of onbInfo.villages) {
    const p = onbMapXY(v, bb);
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < bd) { bd = d; best = v; }
  }
  return (bd <= 22) ? best : null;
}
function onbRenderCard() {
  const el = document.getElementById('onbCard');
  if (!el || !onbInfo) return;
  const v = onbInfo.villages.find((x) => x.vid === onbSelVid) || null;
  if (!v) {
    // ★[T66] 이모지 0 — 성격은 서버가 준 **한글 이름**(`chKo`)으로 말한다(`chEmo` 는 안 쓴다).
    el.innerHTML = '<span class="dim">고른 마을이 없네. <b>아무 곳이나</b>를 누르면 이방인을 반기는 곳으로 데려다 주지.</span>'
      + '<br/><span class="dim">점 색이 성격 · 노란 테가 추천이다.</span>';
    return;
  }
  el.innerHTML = `<b>${v.name}</b> <span class="dim">${v.chKo || ''} · ${v.popKo} · ${v.busyKo}</span>`
    + (v.player ? `<br/><span class="accent">사람이 세운 마을 — 이방인을 받는다${v.founderName ? ` (${v.founderName})` : ''}</span>` : '')
    + `<br/><span class="quote">“${v.news}”</span>`
    + (v.board ? `<br/><span class="dim">게시판에 걸린 일 ${v.board}건</span>` : '')
    + (v.welcome && !v.welcome.ok ? `<br/><span class="warn">이방인을 받기엔 아직 이르다 — ${v.welcome.why.join(' · ')}</span>` : '');
}
// ★[T66 §5] 마을 카드 셋 — "어디서 시작하나". 추천 순으로 셋만(고르면 지도·상세와 같이 움직인다).
function onbRenderCards() {
  const el = document.getElementById('onbCards');
  if (!el || !onbInfo) return;
  const vs = (onbInfo.villages || []).slice();
  const rec = onbInfo.recommend;
  vs.sort((a, b) => (b.vid === rec ? 1 : 0) - (a.vid === rec ? 1 : 0)
    || (b.welcome && b.welcome.ok ? 1 : 0) - (a.welcome && a.welcome.ok ? 1 : 0)
    || (a.busy || 0) - (b.busy || 0));
  el.innerHTML = vs.slice(0, 3).map((v) => ''
    + `<div class="vil-card${v.vid === onbSelVid ? ' sel' : ''}" data-onbvid="${v.vid}">`
    + `<span class="vc-name">${v.name}</span> <span class="vc-kind">${v.chKo || ''} · ${v.zoneKo || ''}</span>`
    + `<span class="vc-busy">${v.busyKo} · ${v.popKo}</span>`
    + `<div class="vc-news">${v.news || ''}</div>`
    + (v.player ? '<span class="vc-badge">사람이 세운 마을 — 이방인을 받는다</span>' : '')
    + '</div>').join('');
  el.querySelectorAll('[data-onbvid]').forEach((c) => {
    c.onclick = () => onbSelect(+c.dataset.onbvid);
  });
}
function onbSelect(vid) {
  onbSelVid = vid;
  onbStartVid = vid;
  onbDrawMap();
  onbRenderCard();
  onbRenderCards();
}
function onbEnterNow() {
  const btn = document.getElementById('enter');
  if (btn) btn.click();
}
function onbZoneId() {
  const sel = document.getElementById('startZone');
  return (window.__autoZone) || (sel && sel.value) || 'hanbando';
}
function onbRefresh() {
  const zid = onbZoneId();
  return onbFetchInfo(zid).then((j) => {
    onbInfo = j;
    const box = document.getElementById('onbStart');
    if (!j) { if (box) box.style.display = 'none'; return null; }
    if (box) box.style.display = '';
    if (onbSelVid == null && j.recommend != null) { onbSelVid = null; }
    onbDrawMap(); onbRenderCard(); onbRenderCards();
    const hint = document.getElementById('onbHint');
    if (hint) hint.textContent = j.warming
      ? `${j.villages.length}곳 · 길을 그리는 중 (${j.ready}/${j.total})`
      : `${j.villages.length}곳 · 이방인 환영 ${j.recommendN}곳`
        + ((j.playerN | 0) ? ` · 사람이 세운 마을 ${j.playerN}곳` : '');
    // ★서버가 도착 지점을 **배경에서 한 마을씩** 굽는다(부팅 직후 몇 초). 다 구워질 때까지만 다시 묻는다.
    if (j.warming && onbWarmTries < 20) { onbWarmTries++; setTimeout(onbRefresh, 3000); }
    return j;
  });
}
// ★`boot()` 이 한 줄로 부른다 — 이 조각의 유일한 진입점.
function onbLobbyInit() {
  try {
    onbEnsureDom();
    const cv = document.getElementById('onbMap');
    if (cv) cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const v = onbPickAt((e.clientX - r.left) * (ONB_MAP_W / Math.max(1, r.width)),
                          (e.clientY - r.top) * (ONB_MAP_H / Math.max(1, r.height)));
      if (v) onbSelect(v.vid);
    };
    const any = document.getElementById('onbAny');
    if (any) any.onclick = () => { onbStartVid = (onbInfo && onbInfo.recommend != null) ? onbInfo.recommend : null; onbEnterNow(); };
    const zs = document.getElementById('startZone');
    if (zs) zs.addEventListener('change', () => { onbSelVid = null; onbStartVid = null; onbRefresh(); });
    onbEnsureHud();
    onbHooks();
    onbRefresh();
    if (!onbTimer) onbTimer = setInterval(onbTick, 800);
  } catch (e) { /* 로비가 깨지면 안 된다 — 시작 화면이 없어도 "월드 입장"은 그대로 산다 */ }
  return true;
}

// HUD 한 줄의 자리 — **index.html 을 두 번 건드리지 않으려고** 여기서 만든다(등록 1줄이 이 조각의 유일한 접점).
function onbEnsureHud() {
  if (document.getElementById('onbHud')) return true;
  const hud = document.getElementById('hud');
  if (!hud) return false;
  const row = document.createElement('div');
  row.className = 'hud-row';
  row.id = 'onbHudRow';
  // ★좌측 사이드바(아이콘 기둥)가 이 줄 높이에서 시작한다 — 안 비키면 글자가 아이콘 뒤로 들어간다(실기 스크린샷).
  row.style.paddingLeft = '62px';
  const el = document.createElement('span');
  el.id = 'onbHud';
  el.className = 'onb-hud-line';
  el.style.display = 'none';
  row.appendChild(el);
  hud.appendChild(row);
  return true;
}

// ── 도착 · 대본 ──────────────────────────────────────────────────────────────
//   ★도착 연출은 최소다(§3): **마을 중심을 바라보며** 시작한다. 그게 곧 "마을이 보이는 각"이다
//     — 시야 부채꼴(`20-r2-visibility`)이 facing 을 보므로, 바라보는 것이 곧 보이는 것이다.
function onbTick() {
  try {
    const inGame = !document.getElementById('game') || !document.getElementById('game').classList.contains('hidden');
    if (!inGame) return;
    if (!window.__getMyAbs || !window.__getMyAbs()) return;
    if (!onbState) { sendPrimary({ type: 'onboarding_state' }); }
    // 첫 조우 — 마을 목소리가 닿는 거리에 들어오면 촌장이 **먼저** 말을 건다(§9.4).
    const nearVid = window.__evNearVid;
    if (!onbGreeted && nearVid != null) { onbGreeted = true; sendPrimary({ type: 'onboarding_greet', vid: nearVid }); }
    // 하루 마감 — 게임일이 바뀌면 한 줄 정산(새 패널 금지 · HUD 한 줄).
    const day = window.__evGameDay | 0;
    if (day && day !== onbLastDay) { onbLastDay = day; sendPrimary({ type: 'onboarding_day' }); }
  } catch (e) { window.__onbTickErr = String(e && e.message || e); }
}
function onbFaceVillage(a) {
  if (!a || onbArrived) return false;
  const fx = +a.faceX, fy = +a.faceY;
  if (!isFinite(fx) || !isFinite(fy) || (fx === 0 && fy === 0)) return false;
  myFacingVx = fx; myFacingVy = fy;
  onbArrived = true;
  needsRedraw = true;
  return true;
}
// 곳간 방향 이펙트 — "내가 낸 물건이 실제로 쌓인다"(§9.4 반응 ②).
//   ★렌더 루프를 건드리지 않는다: 캔버스 위에 얹은 DOM 한 조각이 한 번 날아가고 사라진다.
function onbGranaryFx(wx, wy) {
  const host = document.getElementById('game');
  if (!host || !window.__w2s) return false;
  const me = window.__getMyAbs ? window.__getMyAbs() : null;
  const to = window.__w2s(wx, wy);
  const from = me ? window.__w2s(me.x, me.y) : { px: to.px, py: to.py + 80 };
  const el = document.createElement('div');
  // ★[T66] 곳간 연출도 이모지 0 — 선 아이콘 한 장이 날아간다(같은 세트 · currentColor).
  el.className = 'onb-fx';
  el.innerHTML = uiIcon('food', 20);
  el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:40;'
    + `transform:translate(${Math.round(from.px)}px,${Math.round(from.py)}px);transition:transform .9s ease-out,opacity .9s ease-out;opacity:1`;
  host.appendChild(el);
  setTimeout(() => { el.style.transform = `translate(${Math.round(to.px)}px,${Math.round(to.py - 20)}px)`; el.style.opacity = '0.1'; }, 20);
  setTimeout(() => { try { el.remove(); } catch (e) {} }, 1200);
  return true;
}
// `handleMessage` 가 한 줄로 넘긴다.
function onbOnMessage(msg) {
  try {
    if (msg.type === 'onboarding_state') {
      onbState = msg.state || null;
      window.__onbState = onbState;
      if (msg.arrive) onbFaceVillage(msg.arrive);
      updateHud();
    } else if (msg.type === 'onboarding_quest') {
      if (msg.quest) { onbQuest = msg.quest; window.__onbQuest = onbQuest; }
      onbState = msg.state || onbState;
      window.__onbState = onbState;
      // ★촌장의 말 — **기존 말풍선 그대로** 그린다(세계 안 · 새 패널 0). 통로만 온보딩 전용이다.
      if (msg.lines && msg.lines.length) {
        villageBubbles.set(msg.vid, { lines: msg.lines.slice(0, 3), until: performance.now() + 11000 });
        showNotice(`${msg.name || ''} 촌장 — ${msg.lines[0]}`, 6000);
        window.__onbGreet = { vid: msg.vid, kind: msg.kind || '', lines: msg.lines.slice(0, 3) };
        needsRedraw = true;
      }
      updateHud();
    } else if (msg.type === 'onboarding_fx') {
      // ★★서버가 보내는 좌표는 **존 로컬**이다. 렌더는 **절대 월드**를 쓴다(`fish_state` 가 한 번 겪은 함정).
      const _c = conns.get(primaryZoneId);
      const _ox = (_c && _c.meta && _c.meta.worldOffsetX) || 0, _oy = (_c && _c.meta && _c.meta.worldOffsetY) || 0;
      showNotice('곳간에 쌓였다.', 2500);
      window.__onbFxN = (window.__onbFxN | 0) + 1;   // ★하네스 훅 — 알림은 40칸 링버퍼라 놓칠 수 있다(거래소 배치 교훈). **상태로 센다**
      onbGranaryFx(msg.x + _ox, msg.y + _oy);
    } else if (msg.type === 'onboarding_day') {
      const s = msg.summary || {};
      onbDayText = s.text || '';
      window.__onbDay = s;
      if (onbDayText) showNotice(onbDayText, 5000);
      updateHud();
    }
  } catch (e) { window.__onbMsgErr = String(e && e.message || e); }
  return true;
}
// HUD 한 줄 — `updateHud()` 가 한 줄로 부른다. **새 패널 0**(§9.5).
function onbHudLine() {
  const el = document.getElementById('onbHud');
  if (!el) return '';
  const bits = [];
  if (onbDayText) bits.push(onbDayText);
  if (onbState && !onbState.lotOk && onbState.need) bits.push(`의뢰 ${onbState.contrib}/${onbState.need}`);
  else if (onbState && onbState.lotOk) bits.push('빈터 권리 얻음');
  el.textContent = bits.join('  ·  ');
  el.style.display = bits.length ? '' : 'none';
  return el.textContent;
}
// 하네스 훅 — **읽기 전용만**. 발신은 기존 `window.__sendPrimary` 를 쓴다(새 창구 안 만든다).
function onbHooks() {
  window.__onbInfo = () => (onbInfo ? JSON.parse(JSON.stringify(onbInfo)) : null);
  window.__onbGet = () => ({ startVid: onbStartVid, selVid: onbSelVid, state: onbState, quest: onbQuest,
    dayText: onbDayText, greeted: onbGreeted, arrived: onbArrived,
    facing: { x: myFacingVx, y: myFacingVy } });
  window.__onbPick = (vid) => { onbSelect(vid); return onbStartVid; };
  window.__onbAny = () => { const a = document.getElementById('onbAny'); if (a) a.click(); return onbStartVid; };
  return true;
}
