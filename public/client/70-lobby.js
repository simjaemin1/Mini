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
let onbArrive = null;           // ★[T1064] 도착 기록(서버 `arrivalOf` 그대로 · 존 로컬 · `onboarding_state.arrive`)
let onbGreetGot = null;         // ★[T1064] 촌장 첫 인사를 받았나 — 'greet' 한 통 그대로 { vid, quest, lines }(빈 판이면 quest null)
let onbNextLast = null;         // ★[T1064] 「지금 할 일」 칸이 마지막으로 그린 것(하네스 읽기 훅)

// ── 존 HTTP 주소 — 로비는 central 오리진에서 뜨고 존은 다른 호스트다 ────────────
//   `/startinfo` 는 존이 CORS 를 열어 답한다(`/lifedbg` 와 같은 규약).
function onbHttpBase(zoneId) {
  const zm = (window.__getZonesMeta && window.__getZonesMeta()) || {};
  const meta = zm[zoneId];
  if (!meta || !meta.wsUrl) return null;
  return String(meta.wsUrl).replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}
// ★★[T115 2026-09-05] 시작 화면이 **자기가 누구로 들어갈지**를 같이 묻는다(`?as=<이름>`).
//   ⚠게스트 토큰은 **절대** 안 싣는다 — 그건 열쇠다(배치 13 규약). 이름은 세계에서 머리 위에 떠 있는
//     공개 정보이고, 서버는 그 이름으로 **수(數)만** 답한다(누구인지는 안 준다).
//   ⚠못 물어봐도 시작 화면은 그대로다 — 친구 칸이 0 일 뿐이다.
function onbAsName() {
  try {
    const el = document.getElementById('name');
    const typed = el && el.value ? el.value.trim() : '';
    return typed || (localStorage.getItem('durango_username') || '').trim();
  } catch (e) { return ''; }
}
function onbFetchInfo(zoneId) {
  const base = onbHttpBase(zoneId);
  if (!base) return Promise.resolve(null);
  const as = onbAsName();
  return fetch(base + '/startinfo' + (as ? `?as=${encodeURIComponent(as)}` : ''), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && j.ok ? j : null))
    .catch(() => null);
}

// ── 시작 화면 ────────────────────────────────────────────────────────────────
//   지도 = 마을 목록(§9.1). 성격 아이콘 + 규모 + **근황 한 줄** + 혼잡도.
//   근황이 곧 선택 근거이자, 세계가 살아있다는 첫 증명이다.
// ★[T66] CSS 토큰 하나를 읽어 온다 — SVG 는 currentColor 를 못 쓰는 자리가 있어 값이 필요하다.
//   ⚠값을 여기 적지 않는다: 적는 순간 `style.css` 와 갈리고, 그게 사본이다.
// ★★[T128] **사람이 쓴 문장**이 처음으로 화면에 온다(길드 소개문) ⇒ 여기 한 자리에서 막는다.
//   ⚠이 로비는 `innerHTML` 로 줄을 짓는다. 서버가 길이는 자르지만 **꺾쇠는 안 자른다**(자르면 그건
//     문장을 바꾸는 것이다) — 그러니 **그리는 쪽**이 막는 게 맞다. 마을 이름·근황은 서버가 짓는
//     문장이라 종전대로 두고, **사람이 쓴 것만** 이 함수를 지난다.
function onbEsc(s) {
  return String(s == null ? '' : s)
    .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
    .split('"').join('&quot;');
}
function onbTok(name) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'currentColor'; }
  catch (e) { return 'currentColor'; }
}
function onbEnsureDom() {
  if (document.getElementById('onbStart')) return document.getElementById('onbStart');
  const card = document.querySelector('#lobby .lobby-card');
  if (!card) return null;
  // ★★로비는 `position:fixed` + 세로 가운데 정렬이라 **스크롤이 없다**(style.css). 카드가 뷰포트보다
  //   길어지면 「나루터로 간다」(T84 개명 · 예전 「월드 입장」)가 화면 밖으로 나가 **누를 수가 없다** — 통합 러너에서 900×700 창을 쓰는
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
    // ★[T115] 함께 도착 — **서버가 센 수를 그대로** 쓴다(로비가 다시 세지 않는다).
    + ((v.friendsHere | 0) ? `<br/><span class="accent">벗 ${v.friendsHere}명이 여기서 시작했다</span>` : '')
    // ★[T128] 마을 소개문 — 길드장이 쓴 한 줄. **서버가 자른 문장을 그대로** 쓴다(길이 상한 사본 0).
    + (v.intro ? `<br/><span class="quote">“${onbEsc(v.intro)}”</span>` : '')
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
    + ((v.friendsHere | 0) ? `<span class="vc-badge">벗 ${v.friendsHere}명</span>` : '')
    + (v.intro ? `<div class="vc-news">${onbEsc(v.intro)}</div>` : '')
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
    // ★[T115] 벗 표지는 **한 박자 늦을 수 있다** — 서버가 요청 경로에서 central 을 기다리지 않기 때문이다
    //   (기다리면 로비가 멎는다 · T19 가 같은 자리에 적어 둔 규약). 여기서 다시 묻지는 **않는다**:
    //   1차 실장이 1.5초 뒤 `onbRefresh` 를 한 번 더 걸었더니 그 재그리기가 **하네스가 카드를 누르는
    //   순간**과 겹쳐 `e2e-onboarding` 이 흔들렸다. 로비의 DOM 을 뒤에서 갈아 끼우지 마라.
    //   ⇒ 대신 서버가 **로그인·`/친구` 때 미리 데워 둔다**(`friends.js nameVids` · `zone.js` welcome).
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
  } catch (e) { /* 로비가 깨지면 안 된다 — 시작 화면이 없어도 「나루터로 간다」 버튼은 그대로 산다 */ }
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
      if (msg.arrive) { onbArrive = msg.arrive; onbFaceVillage(msg.arrive); }   // ★[T1064] 도착 기록을 들고 있는다(「지금 할 일」의 자리 이름 · 나루터/어귀)
      updateHud();
    } else if (msg.type === 'onboarding_quest') {
      if (msg.quest) { onbQuest = msg.quest; window.__onbQuest = onbQuest; }
      // ★[T1064] 촌장 첫 인사 한 통을 그대로 들고 있는다 — 빈 판(quest null)이어도 "들었다"는 사실이 단계를 가른다.
      if (msg.kind === 'greet') onbGreetGot = { vid: msg.vid, quest: msg.quest || null, lines: Array.isArray(msg.lines) ? msg.lines.slice(0, 3) : [] };
      onbState = msg.state || onbState;
      window.__onbState = onbState;
      // ★촌장의 말 — **기존 말풍선 그대로** 그린다(세계 안 · 새 패널 0). 통로만 온보딩 전용이다.
      if (msg.lines && msg.lines.length) {
        // ★★[T529] 말하는 몸(`by` — 걸어온 촌장)이 있으면 **그 사람 입에** 건다(T126 "사람에게 물은 답" 문법 · 같은 말풍선 통로).
        //   없으면 종전 그대로 마을 중심 위다.
        if (msg.by != null) speechBubbles.set(msg.by, { text: msg.lines[0], lines: msg.lines.slice(0, 3), until: performance.now() + 11000 });
        else villageBubbles.set(msg.vid, { lines: msg.lines.slice(0, 3), until: performance.now() + 11000 });
        showNotice(`${msg.name || ''} 촌장 — ${msg.lines[0]}`, 6000);
        window.__onbGreet = { vid: msg.vid, kind: msg.kind || '', lines: msg.lines.slice(0, 3), ...(msg.by != null ? { by: msg.by } : {}) };
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
  try { onbNextRender(); } catch (e) { window.__onbNextErr = String(e && e.message || e); }   // ★[T1064] 「지금 할 일」 — 같은 HUD 틱(100ms)에 같이 그린다
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
// ══ ★★[T1064 2026-11-02] 「지금 할 일」 — 화면 한쪽 고정 칸 하나 ═══════════════════════════════════════
//   ★왜 [재민 11-01] "막막하다 · 뭘 해야 할지 모르겠다 · 마을 앞에 스폰되면 제대로 보여 주는 게 없다."
//     서버는 대본 단계를 다 안다(`onboarding_state` · 촌장 첫 인사 · 첫 의뢰 · 빈터 권리) — 화면이 그걸 한 번도 말하지 않았다
//     (HUD 한 줄 "의뢰 0/3" 뿐 · 보고/T1064 §1 · §2).
//   ★규약 다섯:
//     ① **판정은 서버.** 단계는 서버가 보낸 것(`onbState` · 촌장 인사 한 통 · 도착 기록 · 게이트 `evNearVid`)에서만 고른다 — 새 상태 0.
//        보이는 것 = 일어난 것: 인사를 **받아야** 의뢰 단계로 넘어가고, 첫 납품은 서버의 `firstDone` 으로만 넘어간다.
//     ② 새 수 0 — "닿았나"는 이미 있는 반경 둘로만 판다: 마을 = 게이트(`EV_BRIEF_PX` → `evNearVid`) · 빈터 = 서버가 준 `lot.r`.
//        문구의 수는 서버 값뿐이다(의뢰 양 `remain` · 기여 `contrib` · 문턱 `need`).
//     ③ 손잡이 `T1064_NEXT_STEP`(서버 env → welcome `uiCfg.nextStep` · 켬 기본 후보 · `=0` 이면 칸이 없다 → 이 칸이 안 선다 = 종전 화면).
//     ④ 먹선(`설계/설계_화면규칙_B_먹선.md`) — 판 · 판 머리(`.pane-head`) · 테 1px · 강조는 화살 하나(호박색) · 단축키는 `.key` · 이모지 0 ·
//        색 · 크기는 `style.css` 의 `#onbNext` 줄들(조각에 색 리터럴 0). 자리는 지도 판 바로 밑(지도 판의 폭) — HUD 재배치 0.
//     ⑤ 말투(`지시/지시_T1069.md`): 할 일은 명사형 · 설명은 하십시오체 · 가운뎃점 · 화살표 · 괄호 기호 나열 0 · 단축키 뒤 조사는 "키로".
//   ⚠§9.5 "퀘스트 화살표 금지(디에게틱 안내)"와 부딪친다 — 세계에는 아무것도 꽂지 않고 이 칸 안의 화살 하나로 **쪽**만 가리킨다.
//     켤지는 재민 판정(보고/T1064 회부 1 · 손잡이로 끈다).
function onbNextOn() { return !!(typeof uiCfg !== 'undefined' && uiCfg && uiCfg.nextStep === true); }
// 단계 고르기 — **순수 함수**(입력 한 벌 → 계획 한 벌 · DOM 0). 하네스(`test-t1064-next-step`)가 제품 글자 그대로 부른다.
//   I = { state, arrive, greet, nearVid, me:{x,y}, off:{x,y}, anchor(vid) → {x,y,name} 절대, itemKo(k) }
//   돌려주는 것 = { stage, place, item, guide:[글자 | {k:단축키}], target:{x,y} 절대 | null }
function onbNextPlan(I) {
  const s = I && I.state;
  if (!s || s.vid == null) return null;
  const vill = (vid) => (vid != null && I.anchor ? I.anchor(vid) : null);
  const near = I.nearVid != null ? I.nearVid : null;
  const here = vill(near), home = vill(s.vid);
  const arr = (I.arrive && I.arrive.vid === s.vid) ? I.arrive : null;
  const off = I.off || { x: 0, y: 0 };
  const lot = s.lot ? { x: s.lot.x + off.x, y: s.lot.y + off.y, r: s.lot.r } : null;   // 빈터 구역 = 도착 지점 둘레(서버 `vacantZoneOf`)
  const me = I.me || null;
  const inLot = !!(lot && me && Math.hypot(me.x - lot.x, me.y - lot.y) <= lot.r);
  const homeName = (arr && arr.name) || (home && home.name) || '';
  const K = (k) => ({ k });
  // 어디 있나 — 게이트 안이면 그 마을 · 도착 둘레(빈터 구역)면 나루터/어귀 · 그 밖은 마을 밖
  let place = '';
  if (here) place = `${here.name} 마을 안`;
  else if (inLot && homeName) place = `${homeName} ${arr && arr.kind === 'dock' ? '나루터' : '어귀'}`;
  else if (homeName) place = `${homeName} 마을 밖`;
  let p;
  if (s.lotOk) {
    p = inLot
      ? { stage: 'build', item: '내 집 짓기', guide: ['여기가 빈터입니다. ', K('C'), ' 키로 땅을 걸고 건축 판 ', K('Shift B'), ' 에서 움집 터파기를 고르십시오.'], target: null }
      : { stage: 'lot', item: '빈터로 가기', guide: ['촌장이 어귀 빈터를 내어 주었습니다. 화살표 쪽으로 가면 빈터입니다.'], target: lot };
  } else if (s.firstDone) {
    const left = Math.max(0, (s.need | 0) - (s.contrib | 0));
    p = { stage: 'more', item: '게시판 의뢰 하기',
      guide: [`의뢰를 ${left}번 더 하면 촌장이 빈터를 내어 줍니다. 게시판은 마을 한복판에서 `, K('Shift G'), ' 키로 봅니다.'],
      target: home, gate: s.vid };
  } else if (I.greet) {
    const q = I.greet.quest;
    if (q) {
      const said = (I.greet.lines && I.greet.lines[2]) ? String(I.greet.lines[2]) : '';
      const ko = I.itemKo ? I.itemKo(q.item) : String(q.item);
      p = { stage: 'quest', item: `${ko} ${q.remain}개 구해 오기`,
        guide: ['촌장의 부탁입니다. ', said ? `촌장이 “${said}” 하고 일렀습니다. ` : '', '다 모으면 마을 한복판에서 ', K('Shift N'), ' 키로 납품하십시오.'].filter((x) => x !== ''),
        target: vill(I.greet.vid) || home, gate: I.greet.vid };
    } else {
      // 빈 판 — 촌장이 한 말(둘째 줄)을 그대로 옮긴다: 쉼터가 있으면 "마을 쉼터에서 쉬게" · 없으면 "모닥불 곁에서 쉬게" · 쉼터 안이면 근황 한 줄.
      //   쉼터 자리는 클라가 모른다(서버 `shelterOf`) — 화살도 "쉼터"라는 말도 지어내지 않는다(보이는 것 = 일어난 것).
      const said = (I.greet.lines && I.greet.lines[1]) ? String(I.greet.lines[1]) : '';
      p = { stage: 'rest', item: '쉬어 가기',
        guide: [said ? `촌장이 “${said}” 하고 일렀습니다. ` : '지금은 마을에 급한 일이 없다고 합니다. ', '게시판에 일이 걸리면 다시 오십시오. 게시판은 마을 한복판에서 ', K('Shift G'), ' 키로 봅니다.'],
        target: null };
    }
  } else if (near != null) {
    p = { stage: 'wait', item: '촌장 이야기 듣기', guide: ['마을에 들어왔습니다. 촌장이 곧 말을 걸어 옵니다.'], target: null };
  } else {
    p = { stage: 'enter', item: '마을로 들어가기',
      guide: [`${homeName} 마을이 화살표 쪽에 있습니다. `, K('WASD'), ' 키로 걸어 들어가면 촌장이 맞아 줍니다.'],
      target: home, gate: s.vid };
  }
  if (p.gate != null && near === p.gate) p.target = null;   // 그 마을 게이트 안이면 화살 없음(닿았다)
  p.place = place;
  return p;
}
// 입력 한 벌 — 이미 있는 전역에서 **읽기만** 한다(좌표: 서버가 주는 것은 존 로컬 → 1차 존 오프셋을 더해 절대).
function onbNextInputs() {
  const c = (typeof conns !== 'undefined' && typeof primaryZoneId !== 'undefined') ? conns.get(primaryZoneId) : null;
  return {
    state: onbState, arrive: onbArrive, greet: onbGreetGot,
    nearVid: (typeof evNearVid !== 'undefined') ? evNearVid : null,
    me: (typeof myAbsPredicted !== 'undefined' && myAbsPredicted) ? { x: myAbsPredicted.x, y: myAbsPredicted.y } : null,
    off: { x: (c && c.meta && c.meta.worldOffsetX) || 0, y: (c && c.meta && c.meta.worldOffsetY) || 0 },
    anchor: (vid) => {
      const a = (typeof _evVillageAnchorAbs === 'function') ? _evVillageAnchorAbs(vid) : null;
      return a ? { x: a.x, y: a.y, name: (a.v && a.v.name) || '' } : null;
    },
    itemKo: (k) => (typeof itemKo === 'function' ? itemKo(k) : String(k)),
  };
}
function onbNextEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function onbEnsureNext() {
  let el = document.getElementById('onbNext');
  if (el) return el;
  const host = document.getElementById('game') || document.body;
  el = document.createElement('div');
  el.id = 'onbNext';
  el.className = 'hidden';
  el.innerHTML = '<div class="pane-head"><span>지금 할 일</span><span id="onbNextPlace" class="ph-sub ph-key"></span></div>'
    + '<div class="onb-next-body"><span id="onbNextArrow" class="onb-next-arrow"></span>'
    + '<div class="onb-next-text"><div id="onbNextItem" class="onb-next-item"></div><div id="onbNextGuide" class="onb-next-guide"></div></div></div>';
  host.appendChild(el);
  return el;
}
// 그리기 — `onbHudLine()`(HUD 틱 100ms)이 부른다. 글자는 바뀔 때만 다시 쓰고, 화살 돌림만 틱마다 맞춘다.
function onbNextRender() {
  const old = document.getElementById('onbNext');
  if (!onbNextOn()) { if (old) old.classList.add('hidden'); onbNextLast = null; return null; }
  const g = document.getElementById('game');
  const inGame = !!g && !g.classList.contains('hidden');
  const I = onbNextInputs();
  const p = inGame ? onbNextPlan(I) : null;
  const el = onbEnsureNext();
  if (!p) { el.classList.add('hidden'); onbNextLast = null; return null; }
  // 자리 — 지도 판 바로 밑(위 간격은 CSS · 폭은 지도 판의 폭). 지도 판이 없으면 CSS 자리(오른쪽 위).
  //   ⚠무들 칩 기둥(`#moodles` · 오른쪽 위에서 아래로 쌓인다)이 지도 판보다 길어지면 그 밑으로 내려선다 — 칩을 덮지도 칩에 덮이지도 않는다.
  const mm = document.getElementById('minimap');
  const r = (mm && !mm.classList.contains('hidden')) ? mm.getBoundingClientRect() : null;
  const mo = document.getElementById('moodles');
  const mr = (mo && mo.children && mo.children.length) ? mo.getBoundingClientRect() : null;
  if (r && r.height > 0) {
    const low = (mr && mr.height > 0 && mr.right > r.left) ? Math.max(r.bottom, mr.bottom) : r.bottom;
    el.style.top = `${Math.round(low)}px`; el.style.right = `${Math.round(innerWidth - r.right)}px`; el.style.width = `${Math.round(r.width)}px`;
  } else { el.style.top = ''; el.style.right = ''; el.style.width = ''; }
  const sig = `${p.stage}|${p.place}|${p.item}|${JSON.stringify(p.guide)}`;
  if (el.dataset.sig !== sig) {
    el.dataset.sig = sig;
    el.dataset.stage = p.stage;
    document.getElementById('onbNextPlace').textContent = p.place;
    document.getElementById('onbNextItem').textContent = p.item;
    document.getElementById('onbNextGuide').innerHTML = p.guide.map((x) => (x && x.k != null) ? `<span class="key">${onbNextEsc(x.k)}</span>` : onbNextEsc(x)).join('');
  }
  // 화살 — 화면에서 목표 쪽(사영된 두 점의 각) · 세계에는 아무것도 안 그린다
  const ar = document.getElementById('onbNextArrow');
  let ang = null;
  if (p.target && I.me && window.__w2s) {
    const a = window.__w2s(p.target.x, p.target.y), b = window.__w2s(I.me.x, I.me.y);
    if (a && b && isFinite(a.px) && isFinite(b.px)) ang = Math.atan2(a.py - b.py, a.px - b.px);
  }
  if (ang != null) {
    if (!ar.firstChild) ar.innerHTML = uiIcon('arrowR', 20);
    ar.style.transform = `rotate(${ang.toFixed(3)}rad)`;
    ar.classList.remove('hidden');
  } else { ar.innerHTML = ''; ar.style.transform = ''; ar.classList.add('hidden'); }
  el.classList.remove('hidden');
  onbNextLast = { stage: p.stage, place: p.place, item: p.item,
    guide: p.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : x).join(''),
    target: p.target ? { x: Math.round(p.target.x), y: Math.round(p.target.y) } : null, angle: ang };
  return p;
}
// 하네스 훅 — **읽기 전용만**. 발신은 기존 `window.__sendPrimary` 를 쓴다(새 창구 안 만든다).
function onbHooks() {
  window.__onbInfo = () => (onbInfo ? JSON.parse(JSON.stringify(onbInfo)) : null);
  window.__onbGet = () => ({ startVid: onbStartVid, selVid: onbSelVid, state: onbState, quest: onbQuest,
    dayText: onbDayText, greeted: onbGreeted, arrived: onbArrived,
    facing: { x: myFacingVx, y: myFacingVy } });
  window.__onbPick = (vid) => { onbSelect(vid); return onbStartVid; };
  window.__onbAny = () => { const a = document.getElementById('onbAny'); if (a) a.click(); return onbStartVid; };
  window.__t1064Next = () => (onbNextLast ? JSON.parse(JSON.stringify(onbNextLast)) : null);   // ★[T1064] 「지금 할 일」이 그린 것(읽기만)
  return true;
}
