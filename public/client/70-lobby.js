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
let onbJoin = null;             // ★[T1086] 서버가 실어 보낸 가입 형편 { member:{vid,name}|null, offer:vid|null } — 켬(`uiCfg.firstJoin`)일 때만 온다
let onbNeeds = [];              // ★[T1120] 서버가 거절하며 실어 보낸 막힘(`notice.need`) — 안 풀린 것만 · 맨 끝이 「지금 할 일」이 말하는 것(켬 `uiCfg.nextTool` 일 때만 쌓인다)

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
    + '<div class="sublabel" id="onbHint">지도에서 마을을 눌러 고르십시오. 급하면 아무 곳이나 고르셔도 됩니다.</div>';
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
    el.innerHTML = '<span class="dim">아직 고른 마을이 없습니다. <b>아무 곳이나</b>를 누르면 이방인을 반기는 마을로 모셔 갑니다.</span>'
      + '<br/><span class="dim">점 색은 마을의 성격이고, 노란 테를 두른 곳이 추천하는 마을입니다.</span>';
    return;
  }
  el.innerHTML = `<b>${v.name}</b> <span class="dim">${v.chKo || ''} · ${v.popKo} · ${v.busyKo}</span>`
    + (v.player ? `<br/><span class="accent">사람이 세운 마을입니다. 이방인을 받습니다${v.founderName ? ` (${v.founderName})` : ''}</span>` : '')
    // ★[T115] 함께 도착 — **서버가 센 수를 그대로** 쓴다(로비가 다시 세지 않는다).
    + ((v.friendsHere | 0) ? `<br/><span class="accent">벗 ${v.friendsHere}명이 여기서 시작했습니다</span>` : '')
    // ★[T128] 마을 소개문 — 길드장이 쓴 한 줄. **서버가 자른 문장을 그대로** 쓴다(길이 상한 사본 0).
    + (v.intro ? `<br/><span class="quote">“${onbEsc(v.intro)}”</span>` : '')
    + `<br/><span class="quote">“${v.news}”</span>`
    + (v.board ? `<br/><span class="dim">게시판에 걸린 일 ${v.board}건</span>` : '')
    + (v.welcome && !v.welcome.ok ? `<br/><span class="warn">이방인을 받기에는 아직 이릅니다. ${v.welcome.why.join(' · ')}</span>` : '');
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
    + (v.player ? '<span class="vc-badge">사람이 세운 마을</span>' : '')
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
    if (!j) { if (box) box.style.display = 'none'; _gimgOpen('시작 화면 정보 없음'); return null; }   // ★[T1123] 게임 그림 문 ⓒ
    if (box) box.style.display = '';
    if (onbSelVid == null && j.recommend != null) { onbSelVid = null; }
    onbDrawMap(); onbRenderCard(); onbRenderCards();
    _gimgOpen('로비 다 뜸');   // ★[T1123] 게임 그림 문 ⓑ — 오른쪽 판이 그려진 뒤에 게임 그림을 받는다(00-const `_gimgOpen` · 두 번째부터 아무 일 없음)
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
      if (msg.join !== undefined) onbJoin = msg.join;   // ★[T1086] 가입 형편(켬일 때만 실려 온다)
      updateHud();
    } else if (msg.type === 'onboarding_quest') {
      if (msg.quest) { onbQuest = msg.quest; window.__onbQuest = onbQuest; }
      // ★[T1064] 촌장 첫 인사 한 통을 그대로 들고 있는다 — 빈 판(quest null)이어도 "들었다"는 사실이 단계를 가른다.
      if (msg.kind === 'greet') onbGreetGot = { vid: msg.vid, quest: msg.quest || null, lines: Array.isArray(msg.lines) ? msg.lines.slice(0, 3) : [] };
      onbState = msg.state || onbState;
      window.__onbState = onbState;
      if (msg.join !== undefined) onbJoin = msg.join;   // ★[T1086] 가입 형편(켬일 때만 실려 온다)
      // ★촌장의 말 — **기존 말풍선 그대로** 그린다(세계 안 · 새 패널 0). 통로만 온보딩 전용이다.
      if (msg.lines && msg.lines.length) {
        // ★★[T529] 말하는 몸(`by` — 걸어온 촌장)이 있으면 **그 사람 입에** 건다(T126 "사람에게 물은 답" 문법 · 같은 말풍선 통로).
        //   없으면 종전 그대로 마을 중심 위다.
        //   ★[T1086] 넷째 줄까지 — 첫 의뢰 훅이 밥 · 쉼터 · 권함 · 빈터 넷을 말한다(끔이면 셋을 넘는 한 통이 없다 = 종전 그대로).
        if (msg.by != null) speechBubbles.set(msg.by, { text: msg.lines[0], lines: msg.lines.slice(0, 4), until: performance.now() + 11000 });
        else villageBubbles.set(msg.vid, { lines: msg.lines.slice(0, 4), until: performance.now() + 11000 });
        showNotice(`${msg.name || ''} 촌장 — ${msg.lines[0]}`, 6000);
        window.__onbGreet = { vid: msg.vid, kind: msg.kind || '', lines: msg.lines.slice(0, 4), ...(msg.by != null ? { by: msg.by } : {}) };
        needsRedraw = true;
      }
      updateHud();
    } else if (msg.type === 'onboarding_fx') {
      // ★★서버가 보내는 좌표는 **존 로컬**이다. 렌더는 **절대 월드**를 쓴다(`fish_state` 가 한 번 겪은 함정).
      const _c = conns.get(primaryZoneId);
      const _ox = (_c && _c.meta && _c.meta.worldOffsetX) || 0, _oy = (_c && _c.meta && _c.meta.worldOffsetY) || 0;
      showNotice('곳간에 쌓였습니다.', 2500);
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
  else if (onbState && onbState.lotOk) bits.push('빈터를 받았습니다');
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
// ══ ★★[T1086 2026-11-02] 첫 의뢰 뒤 바로 — 마을 가입 · 사유지 터 잡기 · 내 집 짓기(★재민 11-01 "마을 가입과 개인 사유지 건설은 강하게 유도") ══
//   켬(서버 손잡이 `T1086_FIRST_JOIN` → welcome `uiCfg.firstJoin = { cost }`)이고 서버가 가입 형편(`join` 칸)을 실어 보냈을 때만 고른다.
//   아니면 null — 아래 `onbNextPlan` 의 종전(T1064) 차례가 그대로 선다(끔 = 종전 칸).
//     ⓐ 권함이 걸려 있고 아직 마을 사람이 아니면 "마을 가입" — 단추 = 채팅 `/소속` 그 한 줄(서버 문은 하나 · 새 메시지 0)
//     ⓑ 빈터 권리가 섰고 빈터에 제 터가 없으면 "사유지 터 잡기" — 빈터 밖이면 그 쪽 화살 · 안이면 단추(= C 키 그 메시지) ·
//        재료가 모자라면 무엇이 몇 개 있어야 하고 지금 몇 개인지(터 값은 서버 정본 · 가진 것은 짐)
//     ⓒ 빈터에 제 터가 있으면 "내 집 짓기" — 터 밖이면 그 터 쪽 화살
//   ★새 수 0 — 터 값은 welcome 이 실은 서버 정본(`CLAIM_COST.personal`) · 닿음은 서버 `lot.r` 과 제 터 사각뿐이다.
//   ★순수 함수(입력 → 계획 · DOM 0) — `onbNextPlan` 이 부른다. 하네스(`test-t1086-first-join`)가 제품 글자 그대로 부른다.
function onbJoinPlan(I, s, lot, inLot, K) {
  const J = I && I.join;
  const cost = I && I.firstJoin && I.firstJoin.cost;
  if (!cost || !J) return null;
  if (!J.member && J.offer != null) {
    return { stage: 'join', item: '마을 가입', btn: 'join', target: null,
      guide: ['촌장이 마을 사람으로 받아 주겠다고 합니다. 마을 가입 단추를 누르거나 채팅에 /소속 이라고 적으십시오.'] };
  }
  if (!s.lotOk) return null;
  const mine = I.myLot || null;
  if (mine) {
    return { stage: 'build', item: '내 집 짓기', target: mine.inside ? null : { x: mine.x, y: mine.y },
      guide: ['내 터가 생겼습니다. 터 안에서 건축 판 ', K('Shift B'), ' 에서 움집 터파기를 고르십시오.'] };
  }
  if (!inLot) {
    return { stage: 'claim', item: '사유지 터 잡기', target: lot,
      guide: ['촌장이 어귀 빈터를 내어 주었습니다. 화살표 쪽으로 가면 빈터입니다.'] };
  }
  const inv = I.inv || {};
  const w = inv.wood | 0, st = inv.stone | 0;
  if (w >= (cost.wood | 0) && st >= (cost.stone | 0)) {
    return { stage: 'claim', item: '사유지 터 잡기', btn: 'claim', target: null,
      guide: ['여기가 빈터입니다. 터 잡기 단추를 누르거나 ', K('C'), ` 키로 선 자리에 터를 잡으십시오. 나무 ${cost.wood}개와 돌 ${cost.stone}개가 듭니다.`] };
  }
  return { stage: 'claim', item: '사유지 터 잡기', target: null,
    guide: [`여기가 빈터입니다. 터를 잡으려면 나무 ${cost.wood}개와 돌 ${cost.stone}개가 있어야 합니다. 지금 나무 ${w}개와 돌 ${st}개가 있습니다.`] };
}
// ★[T1086] 빈터 안 제 개인 사유지(첫 칸) — 클라가 이미 받은 사유지(`claim_added` · 존 로컬)를 읽기만 한다. { x, y 절대 중심, inside } | null
function onbMyLot(c, off, me) {
  const s = onbState;
  if (!s || !s.lot || !c || !c.claims || !me) return null;
  const who = (typeof myPlayerId !== 'undefined' && myPlayerId) || (typeof myUsername !== 'undefined' && myUsername) || null;
  if (!who) return null;
  const lx = s.lot.x + off.x, ly = s.lot.y + off.y;
  for (const cl of c.claims.values()) {
    if (!cl || cl.ownerPid !== who || cl.kind !== 'personal') continue;
    const x0 = cl.x + off.x, y0 = cl.y + off.y;
    const cx = x0 + cl.w / 2, cy = y0 + cl.h / 2;
    if (Math.hypot(cx - lx, cy - ly) > s.lot.r) continue;
    return { x: cx, y: cy, inside: me.x >= x0 && me.x < x0 + cl.w && me.y >= y0 && me.y < y0 + cl.h };
  }
  return null;
}
// ★[T1086] 칸의 단추 — 이미 있는 두 길만 보낸다(채팅 `/소속` · C 키의 사유지 메시지). 누른 수는 하네스가 센다.
function onbNextPress(act) {
  if (act === 'join') sendPrimary({ type: 'chat', text: '/소속' });
  else if (act === 'claim') sendPrimary({ type: 'claim', kind: 'personal' });
  else return false;
  return true;
}
// ══ ★★[T1120 2026-11-03] 다음 막힘 — 서버가 도구 · 재료가 모자라 거절한 일을 「지금 할 일」이 잇는다(촌장 문 밖에서도) ═══════════
//   ★왜 [카드 T1120 · 보고/T1093] 첫 30분 실기 막힘 셋 중 둘이 돌이었다 — 곡괭이(나무 3 · 돌 5)에 드는 바위를 도구 문(T1065)이 막는데
//     급조 돌괭이 길을 몰라 6분을 걸었고, 세 막힘 자리 모두 이 칸은 "마을로 들어가기"였다(촌장 문 밖 사람에게 돌 · 곡괭이 말이 없다).
//   ★규약 넷:
//     ① 보이는 것 = 일어난 것 — 서버가 거절하며 실어 보낸 칸(`notice.need` — {verb} 도구 문 · {tool} 가질 도구 · {craft} 만들 것)만 잇는다.
//        그 사람이 무엇을 하려는지 칸이 지레짐작하지 않는다(목표를 지어내지 않는다 · 거절이 없으면 종전 칸 그대로).
//     ② 사다리는 표에서 — 도구 문 표(welcome `uiCfg.nextTool` = 서버 `T1065_NEED` 를 옮긴 꼴) · 레시피(`recipes`) · 이름(`itemKo`) · 동사(`resourceVerbs`).
//        모자란 재료가 또 도구 문에 걸리면(곡괭이 → 돌 → 채석 → 조잡한 돌괭이) 한 칸 더 내려간다. 새 수 0 — 글자의 수는 레시피 · 짐에서만.
//     ③ 풀리면 내려놓는다 — 그 일이 이제 되면(손에 맞는 도구 · 가진 도구 · 만든 것) 그 막힘을 지우고 그 앞 막힘 · 종전 단계(T1064 · T1086)로 돌아간다.
//     ④ 손잡이 `T1120_NEXT_TOOL`(서버 env → welcome `uiCfg.nextTool` · 켬 기본 후보 · `=0` 이면 칸이 없다 = 이 갈래가 안 선다 = 종전 칸).
//   ★순수 함수(입력 → 한 칸 · DOM 0) — `onbNextPlan` 이 부른다. 하네스(`test-t1120-next-tool`)가 제품 글자 그대로 부른다. 조사는 `vvJosa`(52-v · 문장 틀용 정본).
// 알림의 `need` 하나를 쌓는다 — 같은 막힘은 맨 끝으로 옮긴다(칸 꼴은 서버가 내는 것뿐이라 저절로 몇 가지로 묶인다)
function onbNeedNote(need) {
  if (!need || typeof need !== 'object' || !(typeof uiCfg !== 'undefined' && uiCfg && uiCfg.nextTool)) return false;
  const key = JSON.stringify(need);
  onbNeeds = onbNeeds.filter((n) => JSON.stringify(n) !== key);
  onbNeeds.push(need);
  return true;
}
// 안 풀린 맨 끝 막힘 — 풀린 것(한 칸도 못 고르는 것)은 내려놓고 그 앞 막힘을 본다
function onbNeedPick(I) {
  while (onbNeeds.length) {
    const n = onbNeeds[onbNeeds.length - 1];
    if (onbToolStep(I, n, null, null)) return n;
    onbNeeds.pop();
  }
  return null;
}
// 그 도구를 가졌나 · 손에 들었나(깨진 것 0) — 서버 `hasTool`(가진 것) · `_t1065Gate`(손에 든 것)와 같은 뜻
function onbToolHas(I, ok, inHand) {
  return (I.tools || []).some((t) => t && t.d > 0 && ok.indexOf(t.type) >= 0 && (!inHand || t.id === I.held));
}
// 사다리 한 칸 — 목표 하나({verb} 도구 문 · {tool} 가질 도구 · {craft, by?} 만들 것 — by = 그 도구 문의 급조 도구) →
//   { do: equip | craft | fetch | gather, what, verb, make, res, from } | null(풀렸다 · 말할 길이 없다)
//   seen = 지나온 도구 문 — 같은 문이 또 나오면 멈춘다(표가 돌아도 끝난다)
function onbToolStep(I, goal, from, seen) {
  const T = (I && I.toolCfg) || null;
  if (!T || !goal) return null;
  const V = T.verbs || {}, R = I.recipes || {}, bag = I.bag || {};
  if (goal.craft) {
    if (!R[goal.craft]) return null;
    if (!goal.by && onbToolHas(I, [goal.craft], false)) return null;   // 만들었다
    const cost = R[goal.craft].cost || {};
    const miss = Object.keys(cost).filter((k) => (bag[k] || 0) < cost[k]);
    const by = goal.by || null;
    if (!miss.length) return { do: 'craft', what: goal.craft, verb: by, from };
    const m = miss[0], w = (T.via || {})[m];
    if (w && V[w.verb]) {   // 모자란 재료가 도구 문에 걸린다(돌 → 채석) — 그 문부터
      const sub = onbToolStep(I, { verb: w.verb }, { craft: goal.craft, need: m }, seen);
      if (sub) return sub;
      return { do: 'gather', what: m, verb: w.verb, res: w.res, make: goal.craft, from };
    }
    return { do: 'fetch', what: m, make: goal.craft, verb: by, from };
  }
  if (goal.verb) {
    const v = V[goal.verb];
    if (!v || (seen && seen.indexOf(goal.verb) >= 0)) return null;
    if (onbToolHas(I, v.ok, true) || (v.slot && I.slotted && I.slotted(v.slot))) return null;   // 손에 맞는 것을 들었다 — 풀렸다
    const own = (I.tools || []).find((t) => t && t.d > 0 && v.ok.indexOf(t.type) >= 0);
    if (own) return { do: 'equip', what: own.type, verb: goal.verb, from };
    return onbToolStep(I, { craft: v.make, by: goal.verb }, from, (seen || []).concat([goal.verb]));
  }
  if (goal.tool) {
    if (onbToolHas(I, [goal.tool], false)) return null;   // 가졌다(움집 터파기 · 시공은 가지면 된다)
    return onbToolStep(I, { craft: goal.tool }, from, seen);
  }
  return null;
}
// 한 칸의 글자 — { stage: 'tool', item, guide, target: null, step } | null. 문장 틀은 서버 거절 문장(T1065 · `doCraft`)의 꼴 그대로.
function onbToolPlan(I) {
  const T = (I && I.toolCfg) || null;
  if (!T || !I.need) return null;
  const st = onbToolStep(I, I.need, null, null);
  if (!st) return null;
  const V = T.verbs || {}, R = I.recipes || {}, bag = I.bag || {};
  const ko = (k) => (I.itemKo ? I.itemKo(k) : String(k));
  const jo = (w, a, b) => (typeof vvJosa === 'function' ? vvJosa(w, a, b) : a);
  const K = (k) => ({ k });
  const costOf = (key) => (R[key] && R[key].cost) || {};
  const list = (key, f) => Object.keys(costOf(key)).map((k) => `${ko(k)} ${f(k)}개`).join(', ');
  const need = (key) => list(key, (k) => costOf(key)[k]);
  const have = (key) => `지금 ${list(key, (k) => Math.floor(bag[k] || 0))}가 있습니다.`;
  const verbOf = (key) => st.verb || Object.keys(V).find((k) => V[k].make === key) || null;
  // 앞 막힘 한 줄 — 이 칸이 무엇에 드는 것인가(곡괭이에 돌이 듭니다)
  const up = (st.from && st.from.craft && st.from.need) ? `${ko(st.from.craft)}에 ${ko(st.from.need)}${jo(ko(st.from.need), '이', '가')} 듭니다. ` : '';
  const step = { do: st.do, what: st.what, verb: st.verb || null, make: st.make || null, res: st.res || null };
  const out = (item, guide) => ({ stage: 'tool', item, guide, target: null, step });
  if (st.do === 'equip') {
    const L = ko(st.what), v = V[st.verb] || {};
    return out(`${L} 손에 들기`, [`${up}${L}${jo(L, '을', '를')} 손에 들어야 ${v.act} 수 있습니다. 가방에서 골라 손에 드십시오. 가방은 `, K('I'), ' 키로 엽니다.']);
  }
  if (st.do === 'craft') {
    const L = ko(st.what), vk = verbOf(st.what), v = vk ? V[vk] : null;
    return out(`${L} 만들기`, [`${up}${v ? `${L}${jo(L, '이', '가')} 있어야 ${v.act} 수 있습니다. ` : ''}재료가 다 있습니다. 제작 창에서 ${L}${jo(L, '을', '를')} 만드십시오. 제작 창은 `, K('K'), ' 키로 엽니다.']);
  }
  if (st.do === 'fetch') {
    const L = ko(st.make), vk = verbOf(st.make), v = vk ? V[vk] : null;
    const head = v ? `${L}${jo(L, '이', '가')} 있어야 ${v.act} 수 있습니다. ${need(st.make)}로 제작 창에서 만들 수 있습니다.${v.hint ? ` ${v.hint}` : ''} `
      : `${L}${jo(L, '을', '를')} 만들려면 ${need(st.make)}가 있어야 합니다. `;
    return out(`${L} 만들기`, [`${up}${head}${have(st.make)}`]);
  }
  const L = ko(st.make), v = V[st.verb] || {}, rk = ko(st.res);
  const word = (I.resVerb && I.resVerb[st.res]) || null;
  return out(word ? `${rk} ${word}` : `${ko(st.what)} 모으기`,
    [`${up}${L}${jo(L, '을', '를')} 만들려면 ${need(st.make)}가 있어야 합니다. ${have(st.make)} ${rk} 곁에서 `, K('E'), ` 키로 ${v.act} 수 있습니다.`]);
}
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
  let p = onbToolPlan(I) || onbJoinPlan(I, s, lot, inLot, K);   // ★[T1120] 서버가 거절한 막힘이 안 풀렸으면 그것이 맨 먼저(끔 · 막힘 없음 = null) · ★[T1086] 켬이면 가입 · 터 잡기 · 집 짓기가 먼저 선다(끔 · 해당 없음 = null)
  if (p) {
    // ★[T1086] 위에서 골랐다 — 종전 차례를 안 탄다
  } else if (s.lotOk) {
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
  if (I.words) onbWordsApply(I, p, s, arr, homeName, off);   // ★[T1204] 켬 — 화살 대신 글로 방위 · 걸음(끔 · 입력에 없음 = 종전 계획 그대로)
  return p;
}
// ══ ★★[T1204 2026-11-07 · ★재민 11-07 문 29 ⓑ "그러자 b"] 화살을 빼고 **글로** — "쉼터는 해 뜨는 북쪽으로 40걸음입니다." ══════════════
//   §9.5 "화살표 · 마커 · 팝업 금지 — 안내는 촌장 대사와 도착 방향"(`server/onboarding.js` 머리 제4 규약) 그대로 — 칸 안 화살 하나도 걷는다.
//   ★새 수 0 · 사본 0 — 방위말 = 서버 · 클라 공용 정본 `public/dir-word.js`(촌장 대사와 같은 어휘 · `I.words`) ·
//     걸음 = 셀 거리(welcome `uiCfg.nowWords.cell` = 서버 셀 px · 1셀 = 1m = 한 걸음) · "바로 앞" 문턱 = `uiCfg.nowWords.near`(카드 T1204 ② · 10걸음) ·
//     쉼터 자리 = 서버 `shelterOf` 가 실은 칸(인사 · 온보딩 상태 — 클라는 자리를 짓지 않는다).
//   대상 넷(빈터 · 내 터 · 마을 · 쉼터)마다 한 문장 — 말투 = 하십시오체(족보 766 짧은 상태 칸 · 지시 T1069 — 화살표 · 괄호 기호 나열 0).
//   ⚠순수 함수 — 계획 한 벌을 고쳐 쓴다(DOM 0). 화살 그리기는 `onbNextRender` 가 켬이면 안 한다.
function onbWordsWhere(I, noun, t) {
  const W = I.words, cell = (I.wordsCell > 0 ? I.wordsCell : 0), nearN = (I.wordsNear > 0 ? I.wordsNear : 0);
  if (!W || !t || !I.me || !(cell > 0)) return null;
  const dx = t.x - I.me.x, dy = t.y - I.me.y;
  const steps = Math.round(Math.hypot(dx, dy) / cell);
  const jo = (w, a, b) => (typeof vvJosa === 'function' ? vvJosa(w, a, b) : a);
  if (steps <= nearN) return { text: `${noun}${jo(noun, '이', '가')} 바로 앞입니다.`, dir: null, steps };
  const d = W(dx, dy);
  return { text: `${noun}${jo(noun, '은', '는')} ${d}으로 ${steps}걸음입니다.`, dir: d, steps };
}
function onbWordsApply(I, p, s, arr, homeName, off) {
  // 쉬어 가기 — 인사한 마을이 시작 마을이고 서버가 그 쉼터 자리(온보딩 상태 `shelter` · `shelterOf` 정본)를 실었을 때만 목표로 세운다
  //   (종전엔 클라가 몰라 목표 없음 · 다른 마을 인사면 그 마을 쉼터 자리를 모르므로 종전 그대로 — 인사 한 통의 칸 순서는 T529 하네스가 잠근다)
  const sh = s && s.shelter;
  if (p.stage === 'rest' && sh && I.greet && I.greet.vid === s.vid && sh.vid === s.vid) p.target = { x: sh.x + off.x, y: sh.y + off.y };
  if (!p.target) { p.where = null; return p; }
  const vname = (vid) => { const a = (vid != null && I.anchor) ? I.anchor(vid) : null; return (a && a.name) || ''; };
  let noun = '';
  if (p.stage === 'rest') noun = '쉼터';
  else if (p.stage === 'lot' || p.stage === 'claim') noun = '빈터';
  else if (p.stage === 'build') noun = '내 터';
  else { const n = (p.gate != null ? vname(p.gate) : '') || homeName; noun = n ? `${n} 마을` : '마을'; }
  const w = onbWordsWhere(I, noun, p.target);
  p.where = w;
  if (!w) return p;
  // 종전 글의 "화살표 쪽" 두 꼴을 그 자리에서 글로 바꾼다(문장 하나 · 나머지 글자 그대로) — 없으면 맨 앞에 한 문장을 단다
  let swapped = false;
  p.guide = p.guide.map((x) => {
    if (typeof x !== 'string') return x;
    if (x.indexOf('화살표 쪽으로 가면 빈터입니다.') >= 0) { swapped = true; return x.replace('화살표 쪽으로 가면 빈터입니다.', w.text); }
    const m = /^(.*) 마을이 화살표 쪽에 있습니다\. $/.exec(x);
    if (m) { swapped = true; return `${w.text} `; }
    return x;
  });
  if (!swapped) p.guide = [`${w.text} `].concat(p.guide);
  return p;
}
// 입력 한 벌 — 이미 있는 전역에서 **읽기만** 한다(좌표: 서버가 주는 것은 존 로컬 → 1차 존 오프셋을 더해 절대).
function onbNextInputs() {
  const c = (typeof conns !== 'undefined' && typeof primaryZoneId !== 'undefined') ? conns.get(primaryZoneId) : null;
  const I = {
    state: onbState, arrive: onbArrive, greet: onbGreetGot,
    nearVid: (typeof evNearVid !== 'undefined') ? evNearVid : null,
    me: (typeof myAbsPredicted !== 'undefined' && myAbsPredicted) ? { x: myAbsPredicted.x, y: myAbsPredicted.y } : null,
    off: { x: (c && c.meta && c.meta.worldOffsetX) || 0, y: (c && c.meta && c.meta.worldOffsetY) || 0 },
    anchor: (vid) => {
      const a = (typeof _evVillageAnchorAbs === 'function') ? _evVillageAnchorAbs(vid) : null;
      return a ? { x: a.x, y: a.y, name: (a.v && a.v.name) || '' } : null;
    },
    itemKo: (k) => (typeof itemKo === 'function' ? itemKo(k) : String(k)),
    // ★[T1086] 가입 형편(서버) · 손잡이와 터 값(welcome) · 짐의 나무 · 돌 · 빈터 안 제 터(받은 사유지)
    join: onbJoin,
    firstJoin: (typeof uiCfg !== 'undefined' && uiCfg && uiCfg.firstJoin) || null,
    inv: (typeof inventory !== 'undefined' && inventory) ? { wood: inventory.wood | 0, stone: inventory.stone | 0 } : null,
    myLot: onbMyLot(c, { x: (c && c.meta && c.meta.worldOffsetX) || 0, y: (c && c.meta && c.meta.worldOffsetY) || 0 },
      (typeof myAbsPredicted !== 'undefined' && myAbsPredicted) ? myAbsPredicted : null),
    // ★[T1120] 다음 막힘 — 도구 문 표(welcome) · 레시피 · 짐 · 손 도구(가진 것 · 든 것) · 작업대 장비 칸 · 자연물 동사 이름(전부 이미 받은 것 · 읽기만)
    toolCfg: (typeof uiCfg !== 'undefined' && uiCfg && uiCfg.nextTool) || null,
    recipes: (typeof recipes !== 'undefined' && recipes) || null,
    bag: (typeof inventory !== 'undefined' && inventory) || null,
    tools: (typeof toolItems !== 'undefined' && Array.isArray(toolItems)) ? toolItems : null,
    held: (typeof equipped !== 'undefined') ? equipped : null,
    slotted: (slot) => !!(typeof equipSlots !== 'undefined' && equipSlots && equipSlots[slot] && typeof equipment !== 'undefined'
      && Array.isArray(equipment) && equipment.some((e) => e && e.id === equipSlots[slot])),
    resVerb: (typeof resourceVerbs !== 'undefined' && resourceVerbs) || null,
  };
  // ★[T1204] 켬(welcome `uiCfg.nowWords`)이고 방위말 정본(`public/dir-word.js`)이 실렸을 때만 — 칸이 화살 대신 글로 방위 · 걸음을 말한다
  const NW = (typeof uiCfg !== 'undefined' && uiCfg && uiCfg.nowWords) || null;
  if (NW && typeof DirWord !== 'undefined' && DirWord && typeof DirWord.dirWord === 'function') { I.words = DirWord.dirWord; I.wordsCell = +NW.cell || 0; I.wordsNear = +NW.near || 0; }
  I.need = I.toolCfg ? onbNeedPick(I) : null;   // ★[T1120] 안 풀린 맨 끝 막힘(풀린 것은 여기서 내려놓는다)
  return I;
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
    + '<div class="onb-next-text"><div id="onbNextItem" class="onb-next-item"></div><div id="onbNextGuide" class="onb-next-guide"></div>'
    + '<button id="onbNextBtn" type="button" class="onb-next-btn hidden"></button></div></div>';   // ★[T1086] 단추 하나(마을 가입 · 터 잡기)
  host.appendChild(el);
  const bt = document.getElementById('onbNextBtn');
  if (bt && bt.addEventListener) {   // ★[T1086] 누를 때 초점을 안 가져간다(초점이 남으면 다음 Enter · Space 가 단추를 또 누른다)
    bt.addEventListener('mousedown', (e) => e.preventDefault());
    bt.addEventListener('click', () => { onbNextPress(bt.dataset.act); if (bt.blur) bt.blur(); });
  }
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
    // ★[T1086] 게시판 판(`#boardPane` — 오른쪽 위에 떠 있는 판 · 납품하면 서버가 판을 다시 보내 저절로 열린다)이 이 자리를 덮으면
    //   그 판 **밑으로** 비켜 선다(오른쪽 줄 그대로) — 첫 의뢰를 낸 그 순간 「마을 가입」 단추가 판 밑에 깔리지 않는다(닫기 한 번이 더 들지 않는다).
    //   판이 길어 밑에 자리가 없으면 그 판 왼쪽으로 선다. 틈은 칸 위 틈(CSS `margin-top`) 그대로 쓴다(새 수 0).
    //   ⚠왼쪽을 먼저 쓰지 않는다 — 판 왼쪽은 화면 한가운데(마을 중심 · 촌장 말풍선 자리)라 1차 판에서 말풍선을 덮었다(사진 실측).
    //   켬(welcome `uiCfg.firstJoin`)일 때만 — 끔이면 종전(T1064) 자리 그대로다.
    const bp = (typeof uiCfg !== 'undefined' && uiCfg && uiCfg.firstJoin) ? document.getElementById('boardPane') : null;
    const br = (bp && !bp.classList.contains('hidden') && bp.getBoundingClientRect) ? bp.getBoundingClientRect() : null;
    if (br && br.width > 0 && typeof getComputedStyle === 'function') {
      const gap = parseFloat(getComputedStyle(el).marginTop) || 0;
      const h = el.getBoundingClientRect().height || 0;
      const top0 = low + gap, bot0 = top0 + h;
      if (br.left < r.right && br.right > r.left && br.top < bot0 && br.bottom > top0) {
        if (br.bottom + gap + h <= innerHeight) el.style.top = `${Math.round(br.bottom)}px`;
        else el.style.right = `${Math.round(innerWidth - br.left + gap)}px`;
      }
    }
  } else { el.style.top = ''; el.style.right = ''; el.style.width = ''; }
  const sig = `${p.stage}|${p.place}|${p.item}|${JSON.stringify(p.guide)}|${p.btn || ''}`;
  if (el.dataset.sig !== sig) {
    el.dataset.sig = sig;
    el.dataset.stage = p.stage;
    document.getElementById('onbNextPlace').textContent = p.place;
    document.getElementById('onbNextItem').textContent = p.item;
    document.getElementById('onbNextGuide').innerHTML = p.guide.map((x) => (x && x.k != null) ? `<span class="key">${onbNextEsc(x.k)}</span>` : onbNextEsc(x)).join('');
    const bt = document.getElementById('onbNextBtn');   // ★[T1086] 단추 — 명사형 이름 · 이 단계에서 누를 수 있을 때만 보인다
    if (bt) {
      const lab = p.btn === 'join' ? '마을 가입' : (p.btn === 'claim' ? '터 잡기' : '');
      bt.textContent = lab; bt.dataset.act = lab ? p.btn : '';
      if (lab) bt.classList.remove('hidden'); else bt.classList.add('hidden');
    }
  }
  // 화살 — 화면에서 목표 쪽(사영된 두 점의 각) · 세계에는 아무것도 안 그린다
  const ar = document.getElementById('onbNextArrow');
  let ang = null;
  if (p.target && I.me && window.__w2s && !I.words) {   // ★[T1204] 켬(글로 말한다)이면 화살을 안 그린다
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
    target: p.target ? { x: Math.round(p.target.x), y: Math.round(p.target.y) } : null, angle: ang, btn: p.btn || null,
    ...(I.words ? { where: p.where ? { text: p.where.text, dir: p.where.dir, steps: p.where.steps } : null } : {}),   // ★[T1204] 켬 — 칸이 말한 방위 · 걸음(하네스 읽기 · 끔 = 칸 없음)
    ...(p.step ? { step: p.step } : {}) };   // ★[T1120] 다음 막힘 칸이면 그 한 칸(무엇을 · 어느 문 — 하네스 읽기 · 끔 = 칸 없음 = 종전 꼴)
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
