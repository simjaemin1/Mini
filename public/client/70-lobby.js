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
function onbEnsureDom() {
  if (document.getElementById('onbStart')) return document.getElementById('onbStart');
  const card = document.querySelector('#lobby .lobby-card');
  if (!card) return null;
  // ★★로비는 `position:fixed` + 세로 가운데 정렬이라 **스크롤이 없다**(style.css). 카드가 뷰포트보다
  //   길어지면 「월드 입장」이 화면 밖으로 나가 **누를 수가 없다** — 통합 러너에서 900×700 창을 쓰는
  //   하네스가 정확히 그걸로 클릭 타임아웃을 냈다. style.css 는 이 배치의 접점이 아니므로 여기서 푼다.
  const lob = document.getElementById('lobby');
  if (lob) { lob.style.overflowY = 'auto'; lob.style.alignItems = 'flex-start'; lob.style.padding = '18px 0'; }
  const box = document.createElement('div');
  box.id = 'onbStart';
  box.style.cssText = 'margin-top:10px';
  // ★★지도는 **SVG** 다 — `<canvas>` 를 쓰면 안 된다. 하네스 여럿이 게임 화면을 `page.$('canvas')`
  //   로 잡는데, 로비 캔버스가 DOM 앞에 있어 **그쪽이 잡히고** 숨겨진 요소라 boundingBox 가 null 이 된다
  //   (실제로 `e2e-metallurgy` 가 그렇게 죽었다). 이 화면엔 캔버스를 두지 않는다.
  box.innerHTML = ''
    + '<label>어느 마을로 갈 텐가 <span class="sublabel" id="onbHint">지도를 눌러 고르게 — 급하면 아무 곳이나</span></label>'
    + '<svg id="onbMap" viewBox="0 0 360 130" preserveAspectRatio="none" style="width:100%;height:130px;background:#161b22;'
    + 'border:1px solid #2b3440;border-radius:6px;cursor:pointer;display:block"></svg>'
    + '<div id="onbCard" style="margin-top:6px;font-size:11.5px;line-height:1.55;color:#c8d2de;background:rgba(255,255,255,.05);border-radius:6px;padding:7px;min-height:44px"></div>'
    + '<button id="onbAny" type="button" style="margin-top:10px;padding:9px">🧭 아무 곳이나 (추천)</button>';
  const anchor = document.getElementById('zoneRow') || document.getElementById('colorPicker');
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
    if (onbInfo.recommend === v.vid) sv.appendChild(onbSvgEl('circle', { cx: p.x, cy: p.y, r: r + 3, fill: 'none', stroke: '#f0c674', 'stroke-width': 1.2 }));
    if (onbSelVid === v.vid) sv.appendChild(onbSvgEl('circle', { cx: p.x, cy: p.y, r: r + 5.2, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.4 }));
    sv.appendChild(onbSvgEl('circle', { cx: p.x, cy: p.y, r,
      fill: v.ch === 'fishing' ? '#6fb7e8' : v.ch === 'mining' ? '#c9a26b' : '#8fc98a',
      stroke: v.busy > 0 ? 'rgba(255,255,255,.6)' : 'none', 'stroke-width': v.busy > 0 ? 1 : 0 }));
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
    el.innerHTML = `<span style="color:#8a93a0">고른 마을이 없네. <b>아무 곳이나</b>를 누르면 이방인을 반기는 곳으로 데려다 주지.</span>`
      + `<br/><span style="color:#8a93a0">🎣 어촌 · ⛏️ 산촌 · 🌾 농촌 · 노란 테 = 추천</span>`;
    return;
  }
  el.innerHTML = `<b>${v.chEmo} ${v.name}</b> <span style="color:#8a93a0">· ${v.popKo} · ${v.busyKo}</span>`
    + `<br/><span style="color:#a9c6a0">“${v.news}”</span>`
    + (v.board ? `<br/><span style="color:#8a93a0">게시판에 걸린 일 ${v.board}건</span>` : '')
    + (v.welcome && !v.welcome.ok ? `<br/><span style="color:#c98a8a">이방인을 받기엔 아직 이르다 — ${v.welcome.why.join(' · ')}</span>` : '');
}
function onbSelect(vid) {
  onbSelVid = vid;
  onbStartVid = vid;
  onbDrawMap();
  onbRenderCard();
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
    onbDrawMap(); onbRenderCard();
    const hint = document.getElementById('onbHint');
    if (hint) hint.textContent = j.warming
      ? `${j.villages.length}곳 · 길을 그리는 중 (${j.ready}/${j.total})`
      : `${j.villages.length}곳 · 이방인 환영 ${j.recommendN}곳`;
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
  el.style.cssText = 'font-size:12px;color:#c8d2de;opacity:.9';
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
  el.className = 'onb-fx';
  el.textContent = '🌾';
  el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;font-size:22px;z-index:40;'
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
        showNotice(`🧓 ${msg.name || ''} 촌장 — ${msg.lines[0]}`, 6000);
        window.__onbGreet = { vid: msg.vid, kind: msg.kind || '', lines: msg.lines.slice(0, 3) };
        needsRedraw = true;
      }
      updateHud();
    } else if (msg.type === 'onboarding_fx') {
      // ★★서버가 보내는 좌표는 **존 로컬**이다. 렌더는 **절대 월드**를 쓴다(`fish_state` 가 한 번 겪은 함정).
      const _c = conns.get(primaryZoneId);
      const _ox = (_c && _c.meta && _c.meta.worldOffsetX) || 0, _oy = (_c && _c.meta && _c.meta.worldOffsetY) || 0;
      showNotice('🌾 곳간에 쌓였다.', 2500);
      window.__onbFxN = (window.__onbFxN | 0) + 1;   // ★하네스 훅 — 알림은 40칸 링버퍼라 놓칠 수 있다(거래소 배치 교훈). **상태로 센다**
      onbGranaryFx(msg.x + _ox, msg.y + _oy);
    } else if (msg.type === 'onboarding_day') {
      const s = msg.summary || {};
      onbDayText = s.text || '';
      window.__onbDay = s;
      if (onbDayText) showNotice('📜 ' + onbDayText, 5000);
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
  else if (onbState && onbState.lotOk) bits.push('빈터 권리 ✔');
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
