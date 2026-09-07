// @@split-added — 분할 이후 새로 만든 조각(결합 검사 대상 아님 · scripts/split-verify.sh)
// === public/client/65-s-chronicle.js — 연대기(마을 연표) 패널 =====================
//
// ★설계 근거: `설계_게임성_사건레이어_TODO.md` §3·§10 [T18 · 재민 확정 2026-09-01]
//   사건 장부는 **지금**을 보여 주지만 세계에는 역사가 쌓인다. 연표는 그 역사를
//   **플레이어가 들은 순서**로 읽는다 — 사건이 난 날이 아니라 **우리 마을에 도달한 날**(T7 도달표).
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★이 파일의 제1 규약: **여기서 계산하지 않는다.**
//   연·계절 표기 · 문장 · 잘린 건수 · 연도 목록은 **전부 서버가 만들어 보낸다**
//   (`village_chronicle` 응답). 달력을 클라가 다시 매핑하면 그게 사본이고, 그 사본은
//   엔진이 계절 경계를 바꾸는 날 조용히 갈라진다(`events.calendarOf` 가 정본).
//
// ★제2 규약: **새 컴포넌트를 만들지 않는다.** 게시판·제작창이 쓰는 `.craft-recipe`/`.hint`
//   문법을 그대로 빌려 쓴다(§8.2 패널 프레임 안에서 산다).
//
// ★제3 규약: **최상위 실행문 0.** 분할 규약대로 선언만 둔다(실행문은 99-main.js 에만).
//   패널은 `50-i-panel.js` 의 `openSide('chronicle')` → `renderSide` 분기가 연다.

// 마지막으로 받은 연표(서버 정본 그대로). 화면은 이것만 그린다.
let chronData = null;
// 지금 보고 있는 해. null 이면 "올해"(서버가 정한다).
let chronYear = null;

// 서버에 묻는다 — **열 때마다** 묻는다. 연표를 클라가 캐시하면 그게 낡은 역사다
// (지난 해 칸은 서버가 캐시하고 있어서 되물어도 공짜다 — 캐시는 정본 쪽에 하나만 둔다).
function chronAsk(year) {
  const vid = window.__evNearVid;
  if (vid == null) { chronData = null; return false; }
  chronYear = (year == null) ? null : (year | 0);
  sendPrimary({ type: 'village_chronicle', vid, year: chronYear });
  return true;
}

// 서버 응답 수신 — `30-n-net.js` 의 메시지 분기가 이 한 줄을 부른다(접점 최소).
function chronOnMessage(c) {
  chronData = c || null;
  chronYear = c ? (c.year | 0) : null;
  window.__evLastChronicle = chronData;   // ★하네스 읽기 훅(읽기 전용 · 새 능력 0)
  if (activeSide === 'chronicle') renderSide('chronicle');
}

// ★[T66] 계절·유형도 선 아이콘 이름으로(그림은 세트 하나 · 이모지 0).
const CHRON_SEASON_EMO = { spring: 'leaf', summer: 'sun', autumn: 'ground', winter: 'snow' };

// ★★[T55 2026-09-02] 연표 아이콘 — 종전엔 **전부 🕰️** 였다(값이 움직인 줄과 일어난 일이 같은 얼굴).
//   T50 이 `type`·`deed`·`sev` 를 페이로드에 실어 줬다(보고/T50 §e2e) — 그걸 쓴다. 유도하지 않는다.
//   ★표는 서버 `events.js TYPES` **전부**를 덮는다(지금 열넷 — 지시서가 "열셋"이라 한 것은
//     `SEASON_CHANGE` 를 뺀 수다. ★[T66 2차] 겨울나기 둘이 더해져 지금 **열여섯**이다. 그건 연표의 **축**이라 항목으로 안 나오지만, 표에는 둔다:
//     빠뜨린 유형이 생기면 조용히 🕰️ 로 되돌아가고 아무도 모른다).
//   ★`scripts/test-chron-icons.js` 가 "서버 TYPES ⊆ 이 표의 키"를 소스로 잰다 — 한 유형을 빼면 빨개진다.
//   ★★[T66] 그림이 이모지에서 **선 아이콘 이름**으로 바뀌었다(화면 규칙 B · 이모지 0).
//     폴백도 🕰️ 가 아니라 `scroll` 이다 — 뜻은 같다("유형을 모르겠다").
const CHRON_TYPE_EMO = {
  // 값의 이탈(장부 1차) — 저울과 값
  STOCK_SHORTAGE: 'price', STOCK_GLUT: 'chest', PRICE_SPIKE: 'star', PRICE_DROP: 'minus', CARAVAN_LATE: 'trade',
  SEASON_CHANGE: 'cal',
  // 일어난 일(T50 2차) — 운과 사람과 길
  HARVEST_BOON: 'food', HARVEST_BLIGHT: 'leaf', WEATHER: 'cloud', POP_COLLAPSE: 'people',
  CARAVAN_RAIDED: 'guild', TRADER_KILLED: 'heart', BUILT: 'home', FIRST_GOODS: 'check',   // ★[T66 2차] `star` 는 PRICE_SPIKE 가 쓴다 — 겹치면 두 사건이 같은 얼굴이 된다
  // ★★[T66 2차 · 재민 확정 2026-09-03] 겨울나기 두 유형 — T20(`3ad06f2d`)이 서버 `TYPES` 에 더했는데
  //   T55 의 클라 표가 안 따라가서 `test-chron-icons ③` 이 베이스에서도 빨갰다. 여기서 닫는다.
  //   불(모닥불을 지켜 냈다) / 눈(모자랐다) — 서로 다른 얼굴이어야 ④ 가 초록이다.
  WINTER_KEPT: 'fire', WINTER_SHORT: 'snow',
  // ★[T119 2026-09-05] 구조 — 손을 내미는 그림. `heart`(TRADER_KILLED)·`people`(POP_COLLAPSE) 와
  //   겹치면 두 사건이 같은 얼굴이 된다(④ 가 그걸 잡는다) ⇒ 아직 임자 없는 `hand` 를 쓴다.
  RESCUED: 'hand',
};
function chronIcon(it) { return uiIcon((it && CHRON_TYPE_EMO[it.type]) || 'scroll', 16); }

function renderChroniclePanel(el) {
  if (window.__evNearVid == null) {
    el.innerHTML = '<div class="hint">마을 중심에 서면 그 마을의 연대기를 읽을 수 있다 — 연표는 <b>마을이 들은 것</b>만 적는다.</div>';
    return;
  }
  const c = chronData;
  if (!c || !c.ok) { el.innerHTML = '<div class="hint">촌장에게 연표를 청하는 중…</div>'; return; }

  // ── 연도 줄 — 접힘/펼침이 아니라 **해를 고르는 줄**이다(연표 한 화면 = 한 해).
  const years = c.years || [c.year];
  let h = `<div class="hint" style="margin-bottom:6px"><b>${c.name}</b> 연표 — `
        + `지금은 ${c.cal ? `${c.cal.year}년 ${c.cal.seasonKo} ${c.cal.dayOfSeason}일` : `${c.today}일`}</div>`;
  h += '<div class="cr-cost" style="margin-bottom:8px">'
     + years.map((y) => `<button data-chyear="${y}" style="margin:1px 3px 1px 0;${y === c.year ? 'outline:1px solid var(--stam)' : ''}">${y}년</button>`).join('')
     + '</div>';

  // ── 계절 칸 — 빈 계절도 자리를 지킨다. **구멍도 정보다**("그 해 봄엔 아무 소식도 없었다").
  const secs = c.seasons || [];
  if (!secs.length) {
    h += '<div class="hint">이 해에는 아직 아무 일도 적히지 않았다.</div>';
  } else {
    for (const b of secs) {
      h += `<div class="hint" style="font-weight:bold;margin:10px 0 4px">— ${uiIcon(CHRON_SEASON_EMO[b.season] || 'cal', 14)} ${b.seasonKo} —</div>`;
      if (!b.items.length) { h += '<div class="hint" style="opacity:.6">조용한 계절이었다.</div>'; continue; }
      for (const it of b.items) {
        const where = it.from ? `<span style="color:var(--dim-2)">${it.from}에서</span> ` : '';
        const lag = (it.heard - it.day);
        const when = lag > 0 ? `<span style="color:var(--dim-2)"> · ${lag}일 걸려 닿았다</span>` : '';
        // ★[T55] `deed`(일어난 일)는 **굵게** — 값이 움직인 줄과 한눈에 갈린다(구분은 한 가지만).
        h += `<div class="craft-recipe"><div class="cr-icon">${chronIcon(it)}</div>`
           + `<div class="cr-info"><div class="cr-name"${it.deed ? ' style="font-weight:bold"' : ''}>${where}${it.line}</div>`
           + `<div class="cr-cost">${it.heard}일에 들었다${when}</div></div></div>`;
      }
      // ★`more` 는 **우리 마을 몫만** 센다(서버 주석 참조) — 이웃 소식까지 세면 "그 밖에 490건"이 된다.
      if (b.more > 0) h += `<div class="hint" style="opacity:.7">그 밖에 ${b.more}건은 잊혔다 — 촌장이 기억하는 건 유난했던 일뿐이다.</div>`;
    }
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-chyear]').forEach((btn) => {
    btn.onclick = () => { chronAsk(+btn.dataset.chyear); };
  });
}
