// @@split-added — 분할 이후 새로 만든 조각(결합 검사 대상 아님 · scripts/split-verify.sh)
// === public/client/47-s-board.js — 마을 게시판 판 ==============================
//
// ★설계 근거: `설계/설계_화면규칙_B_먹선.md`(T66) + 그림 `산그림/디자인B/디자인B_게시판.jpg`.
//   [T80 · 재민 확정 2026-09-03]
//
// ★왜 판인가: 종전엔 9초짜리 토스트 하나였다(`30-n-net.js` `showNotice(…, 9000)`).
//   한 문자열 안에 **의뢰 줄 · 겨울 머리줄(T20) · 들은 소식(T55) · "Shift+N 으로 납품"** 이 전부
//   `\n` 으로 이어 붙어 있었고, 9초가 지나면 사라졌다. 읽는 데 9초로는 모자라고,
//   무엇보다 **어느 의뢰에 내는지 고를 수가 없었다** — 낼 수 있는 건 "서버가 고른 첫 의뢰" 하나뿐.
//   ⇒ 게시판은 세계에 붙어 있는 **판**이다. 붙어 있으니 읽는 동안 사라지지 않고,
//     줄마다 물건 그림 · 진척 · 보상 · **그 줄에 내는 버튼**이 선다.
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★제1 규약: **여기서 계산하지 않는다.** 문장(`line`) · 겨울 머리줄(`head`) · 소식(`news`) ·
//   잔여/진척(`remain`·`qty`·`filled`) 은 **전부 서버가 만들어 보낸다**(`village_board` 응답).
//   진척을 `qty - remain` 으로 클라가 다시 만들면 그게 사본이다 — 서버가 `filled` 을 싣는다.
//
// ★★제2 규약: **새 동사 0.** 행의 납품 버튼은 종전 `village_deliver` 를 그대로 쓴다.
//   Shift+N 은 품목을 **안 싣고**(= 서버가 고른다), 행 버튼은 **그 행의 품목**을 싣는다.
//   서버 쪽 분기는 이미 `msg.item` 을 받고 있다(`zone.js` `tryVillageDeliver`) — 한 줄도 안 더했다.
//
// ★★제3 규약: T66 화면 규칙 B — 판 머리 하나(`pane-head`) · 이모지 0 · 모서리 0 ·
//   색은 `style.css` 토큰 하나 · 물건 그림은 `itemPic` 하나 · 상태는 글자.
//
// ★제4 규약: 최상위 실행문 0(분할 규약) — 선언만 둔다. 판 DOM 도 **처음 열 때** 만든다.

// 지금 판이 그리고 있는 게시판(서버 정본 그대로). 화면은 이것만 그린다.
let boardPaneData = null;

// ★판 DOM — 처음 열 때 한 번 만든다(index.html 은 조각 등록 한 줄만 늘었다).
//   구조·class 는 기존 모달 문법 그대로다(`modal` · `modal-card` · `modal-head pane-head` · `modal-body`).
function boardPaneEl() {
  let p = document.getElementById('boardPane');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'boardPane';
  // ★★**모달이 아니다**(§8.2 논모달 · e2e-ui ③ "패널을 연 채 이동할 수 있다").
  //   1차 판은 `class="modal"` 로 만들었다가 실측에서 잡혔다: `.modal` 은 `inset:0` 짜리
  //   전면 덮개라 **판이 떠 있는 동안 화면의 모든 클릭을 먹는다**(`e2e-membership` 의
  //   거래 아이콘 클릭이 "boardPane intercepts pointer events" 로 죽었다 — 플레이어도 똑같이 막힌다).
  //   ⇒ 덮개 없는 **떠 있는 판**이다(회관 판 `villageInvPanel` 과 같은 문법). 바깥은 게임이 받는다.
  //   ⇒ 그래서 "바깥 클릭으로 닫기"도 없다 — 닫는 문은 `닫기` 버튼과 `Esc` 둘이다.
  p.className = 'hidden';
  p.innerHTML = '<div class="pane-head"><span id="boardPaneTitle">게시판</span>'
    + '<span class="ph-key"><span class="key">Esc</span></span>'
    + '<button id="boardPaneClose">닫기</button></div>'
    + '<div class="bp-body" id="boardPaneBody"></div>';
  document.body.appendChild(p);
  p.querySelector('#boardPaneClose').onclick = () => closeBoardPane();
  // Esc — 거래소 판과 **같은 문법**이다(`60-t-market.js`: 타이핑 중이면 안 닫는다).
  //   ⚠리스너는 판을 처음 만들 때 한 번만 건다 — 그래야 이 조각에 **최상위 실행문이 0**이다(분할 규약).
  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e)) return;
    if (e.key === 'Escape' && boardPaneOpen()) closeBoardPane();
  });
  return p;
}

function closeBoardPane() {
  const p = document.getElementById('boardPane');
  if (p) p.classList.add('hidden');
}
function boardPaneOpen() {
  const p = document.getElementById('boardPane');
  return !!(p && !p.classList.contains('hidden'));
}

// 서버 응답 수신 — `30-n-net.js` 의 메시지 분기가 이 한 줄을 부른다(접점 최소 · 연대기와 같은 문법).
function boardOnMessage(bd) {
  boardPaneData = bd || null;
  const p = boardPaneEl();
  p.classList.remove('hidden');
  renderBoardPane();
}

// 한 행 — 그림 · 이름 · 진척 · 보상 · 납품 버튼.
// ★진척은 **글자**다(막대를 새로 만들지 않는다 — 판 문법에 없는 부품을 늘리지 않는다).
function boardRowHtml(r, i) {
  const canGive = Array.isArray(r.give) && r.give.length > 0;
  // ★`data-bp-item` — 행이 **어느 의뢰인가**를 DOM 이 스스로 말한다(하네스 읽기 훅 · 새 능력 0).
  //   ⚠그림의 `title` 로 고르면 안 된다: 굽힌 아이콘이 없는 품목은 `title` 이 `<키> — 렌더 없음` 이라
  //     이름이 안 맞는다(실측 — `meat` 행에서 그렇게 한 번 헛짚었다).
  return `<div class="bp-row" data-bp-item="${r.item}">`
    + `<span class="bp-pic">${itemPic(r.item, 20)}</span>`
    + `<span class="bp-name">${itemKo(r.item)}</span>`
    + `<span class="bp-num">${r.remain}</span>`
    + `<span class="bp-prog">${r.filled}/${r.qty}</span>`
    + `<span class="bp-rew">${itemPic(r.rewItem, 16)} ${itemKo(r.rewItem)} ${r.rewQty}</span>`
    + `<button class="bp-give" data-bp-give="${i}"${canGive ? '' : ' disabled'}>납품</button>`
    + `</div>`;
}

function renderBoardPane() {
  const body = document.getElementById('boardPaneBody');
  const title = document.getElementById('boardPaneTitle');
  if (!body) return;
  const bd = boardPaneData;
  if (!bd || !bd.ok) { body.innerHTML = '<div class="bd-none">게시판을 읽지 못했다.</div>'; return; }
  if (title) title.textContent = `${bd.name} 게시판`;

  let h = '';
  // ── 머리 — 서버가 만든 한 줄(T20 겨울나기). 공표~판정 사이에만 온다.
  //   ⚠막대(`▓░`)도 **서버가 만든 글자**다 — 클라가 다시 그리지 않는다.
  if (bd.head) h += `<div class="bp-head">${bd.head}</div>`;

  // ── 의뢰 ─────────────────────────────────────────────────────────────────
  const rows = Array.isArray(bd.rows) ? bd.rows : [];
  h += `<div class="bd-sec">걸린 의뢰</div>`;
  if (!rows.length) {
    h += `<div class="bd-none">걸린 의뢰가 없다</div>`;
  } else {
    h += `<div class="bp-hdr"><span></span><span>구하는 것</span><span>남은</span><span>진척</span><span>갚을 것</span><span></span></div>`;
    h += rows.map(boardRowHtml).join('');
    h += `<div class="bp-hint"><span class="key">Shift+N</span> 은 서버가 고른 의뢰에 낸다 — 줄의 <b>납품</b>은 그 줄에 낸다.</div>`;
  }

  // ── 들은 소식 ─────────────────────────────────────────────────────────────
  //   ⚠줄 수는 서버가 정한다(`EV_BOARD_NEWS_N`) — 클라가 또 자르면 그게 두 번째 손잡이다.
  const news = Array.isArray(bd.news) ? bd.news.filter((n) => n && n.line) : [];
  if (news.length) {
    h += `<div class="bd-sec">들은 소식</div>`;
    h += news.map((n) => `<div class="bp-news">${n.line}`
      + (n.from ? ` <span class="bp-from">${n.from}에서</span>` : '') + `</div>`).join('');
  }
  body.innerHTML = h;

  // 행 납품 — **그 행의 품목**을 싣는다(수량은 안 싣는다: 서버가 낼 수 있는 만큼 낸다).
  for (const btn of body.querySelectorAll('[data-bp-give]')) {
    btn.onclick = () => {
      const r = rows[+btn.getAttribute('data-bp-give')];
      if (!r) return;
      if (evNearVid == null) { showNotice('마을 중심에서 너무 멀다'); return; }
      sendPrimary({ type: 'village_deliver', vid: evNearVid, item: r.item });
    };
  }
}
