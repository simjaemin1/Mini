// @@split-added — 분할 이후 새로 만든 조각(결합 검사 대상 아님 · scripts/split-verify.sh)
// === public/client/52-v-village-view.js — 마을 화면 · 메뉴 넷(대시보드 · 프로젝트 · 구성원 · 창고) ====================
//
// ★근거: [T1070 · ★재민 11-01 · 11-02] 정본 `설계/설계_마을화면_오석.md` · 그림 `설계/시안/오석/마을_{dash,proj,mem,store}.jpg`.
//   "마을 가입과 개인 사유지 건설은 강하게 유도 — 마을 전용 화면에서 현황 · 자원 · 진행 중인 프로젝트, 그 마을 고유의 정보와
//    앞으로 뭘 할 수 있는지를 충분히 보여 주는 기대되는 화면." · "메뉴를 여러 개 — 각 화면은 간단하게."
//
// ★★제1 규약: **자료는 `villageView` 하나에서만 읽는다**(T1072 · 서버가 보내는 한 덩어리). 여기서 세계 값을 계산하지 않는다 —
//   숫자 · 이름 · 문장(다 되면 · 소식 · 할 일)은 서버가 싣는다. 클라는 숫자를 문장 틀(하십시오체)에 넣고 막대를 그리기만 한다.
//   서버에 없는 칸은 그리지 않는다(빈 칸 · 회부 — 보이는 것 = 일어난 것). 원격 시세 없음: 마을 중심에서 멀면 시세 칸 = "가까이 가야 볼 수 있습니다".
// ★★제2 규약: **새 동작 0.** 버튼은 이미 있는 길만 부른다 —
//   부탁 보기 = 이 화면 대시보드의 부탁 목록 · 내 땅 정하기 = 개인 사유지(`claim` kind `personal` · T45 · C 키와 같은 문) ·
//   가진 것 주기 = 그 부탁의 납품(`village_deliver` + 품목 · 게시판 줄 버튼과 같은 문) · 재료 가져오기 = 기부(`village_donate` · T769 회관 기부와 같은 문).
// ★제3 규약: 재질(오석 판 · 판 글자)은 **T1071 오석 모듈** 몫이다 — 그 전엔 임시 CSS(판 #4a4a4a 계열 · 밝은 회색 글자 · 가는 선)로 배치만.
//   재질을 여기서 따로 만들지 않는다(사본 금지). 본문 18px 아래 0 · 이모지 0(닫기 · 사람 그림은 선 SVG).
// ★제4 규약: 최상위 실행문 0(분할 규약) — 선언만. 판 DOM · 스타일 · 키는 **처음 열 때** 붙인다.
// ★손잡이 `T1070_VILLAGE_VIEW`(URL 인자 · ★기본 끔): `=1` 이면 Shift+G 가 이 화면을 연다. 끔이면 종전 게시판 판 그대로(`47-s-board.js`).
//   기본 끔인 까닭 — 서버 자료(T1072 `villageView`)가 아직 없다. 서버 없이 켜면 빈 화면이거나 예시 값이다(보이는 것 = 일어난 것 위반).
//   T1072 착지 뒤: 기본 켬 + 옛 게시판 판을 걷는다(T1070 보고 회부).

let vvData = null, vvVid = null, vvTab = 'dash', vvMemAll = false, vvWired = false;

function vvKnobOn() { try { return new URLSearchParams(location.search).get('T1070_VILLAGE_VIEW') === '1'; } catch (e) { return false; } }

// ★서버 자료 → 화면이 읽는 모양. 지금은 임시 자료(`test/fixtures/village-view.ui-draft.json`) 모양 그대로다.
//   T1072 `villageView` 의 필드 표가 오면 **이 함수 한 곳만** 맞춘다(화면 함수들은 이 모양만 안다).
function vvAdapt(raw) { return raw && typeof raw === 'object' ? raw : null; }

// 서버 응답(제안: `{ type: 'village_view', view }` — 이름은 T1072 가 정한다 · 30-n-net.js 의 case 한 줄이 이리로 넘긴다)
function villageViewOnMessage(view) {
  vvData = vvAdapt(view);
  if (vvData && vvData.vid != null && vvVid == null) vvVid = vvData.vid;
  if (villageViewOpen()) vvRender();
}

function villageViewOpen() { const p = document.getElementById('vvPane'); return !!(p && !p.classList.contains('hidden')); }
function openVillageView(vid) {
  vvVid = vid;
  vvTab = 'dash'; vvMemAll = false;
  vvPaneEl().classList.remove('hidden');
  try { if (typeof sendPrimary === 'function') sendPrimary({ type: 'village_view', vid }); } catch (e) {}   // 자료 요청(서버가 모르면 그냥 버린다 — T1072 전)
  vvRender();
}
function closeVillageView() { const p = document.getElementById('vvPane'); if (p) p.classList.add('hidden'); }

function vvPaneEl() {
  let p = document.getElementById('vvPane');
  if (p) return p;
  vvStyle();
  p = document.createElement('div');
  p.id = 'vvPane';
  p.className = 'hidden';
  p.innerHTML = '<div class="vv-wrap"><div class="vv-head" id="vvHead"></div><div class="vv-body" id="vvBody"></div></div>';
  document.body.appendChild(p);
  if (!vvWired) {
    vvWired = true;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && villageViewOpen()) closeVillageView(); });
    p.addEventListener('click', vvOnClick);
  }
  return p;
}

// 임시 판 CSS — 재질 없음(T1071 몫) · 판 = #4a4a4a 계열 · 글자 = 밝은 회색 · 테두리 = 가는 선 · 본문 18px 이상.
function vvStyle() {
  if (document.getElementById('vvStyle')) return;
  const s = document.createElement('style');
  s.id = 'vvStyle';
  s.textContent = `
#vvPane{position:fixed;inset:0;z-index:9000;background:#121212;color:#d9d9d9;font-family:'Noto Sans CJK KR','Noto Sans KR',var(--font);font-size:18px;line-height:1.45;overflow:auto}
#vvPane.hidden{display:none}
#vvPane .vv-wrap{max-width:1440px;margin:0 auto;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;gap:16px;min-height:100%}
#vvPane .vv-body{display:flex;flex-direction:column;gap:16px;flex:1}
#vvPane .vv-grow{flex:1}
#vvPane .vv-plate{background:#4a4a4a;border:1px solid #6e6e6e;box-sizing:border-box;padding:20px 32px}
#vvPane .vv-ser{font-family:'Noto Serif CJK KR','Noto Serif KR',serif;font-weight:700;color:#ececec}
#vvPane .vv-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:#4a4a4a;border:1px solid #6e6e6e;padding:14px 32px}
#vvPane .vv-name{font-size:48px;line-height:1.1}
#vvPane .vv-sub{font-size:18px;color:#cfcfcf;margin-top:4px}
#vvPane .vv-tabs{display:flex;gap:40px}
#vvPane .vv-tab{background:none;border:0;border-bottom:2px solid transparent;color:#d9d9d9;font:inherit;font-size:24px;padding:4px 2px;cursor:pointer}
#vvPane .vv-tab.on{border-bottom-color:#d9d9d9;color:#f2f2f2}
#vvPane .vv-meter{justify-self:end;display:flex;align-items:flex-start;gap:24px}
#vvPane .vv-meter .lab{font-size:20px} #vvPane .vv-meter .lab b{font-size:24px;font-weight:600;margin-left:12px}
#vvPane .vv-close{width:40px;height:40px;background:none;border:1px solid #bdbdbd;color:#d9d9d9;cursor:pointer;padding:0}
#vvPane .vv-bar{height:12px;background:#262626;border:1px solid #5a5a5a;box-sizing:border-box}
#vvPane .vv-bar>i{display:block;height:100%;background:#d6d6d6}
#vvPane .vv-btn{background:none;border:1px solid #cfcfcf;color:#e6e6e6;font:inherit;font-size:20px;padding:8px 24px;cursor:pointer;white-space:nowrap}
#vvPane .vv-btn.main{outline:1px solid #cfcfcf;outline-offset:3px;padding:8px 32px}
#vvPane h2{font-size:32px;margin:0 0 12px}
#vvPane .vv-small{font-size:18px;color:#c4c4c4}
#vvPane .vv-row{display:grid;align-items:center;gap:16px;border-bottom:1px solid #666;padding:12px 0}
#vvPane .vv-row:last-child{border-bottom:0}
#vvPane .vv-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
#vvPane .vv-big{font-size:56px;line-height:1.2}
#vvPane .vv-card{border:1px solid #9a9a9a;padding:16px 20px}
#vvPane .vv-chip{border:1px solid #9a9a9a;padding:6px 18px;font-size:18px;white-space:nowrap}
#vvPane .vv-far{border:1px solid #9a9a9a;padding:16px 20px;margin-bottom:12px;font-size:20px}
`;
  document.head.appendChild(s);
}

const vvEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vvBar = (f) => `<div class="vv-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, +f || 0)) * 100)}%"></i></div>`;
// 받침 있으면 a(이 · 은 · 을) · 없으면 b(가 · 는 · 를) — 한글 마지막 글자만 본다(문장 틀용)
function vvJosa(w, a, b) { const c = String(w || '').charCodeAt(String(w || '').length - 1); if (c >= 0xAC00 && c <= 0xD7A3) return ((c - 0xAC00) % 28) ? a : b; return a; }
const vvSvgX = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="1.6"/></svg>';
const vvSvgMan = '<svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="26" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M26 20V31M18 25H34M26 31L20 39M26 31L32 39" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

// 마을 중심에서 먼가 — 클라가 이미 아는 근접(`evNearVid` — 30-n-net 근접 틱)과 서버가 시세를 실었나(`store.near`)
function vvFar() {
  const near = (typeof evNearVid !== 'undefined') ? evNearVid : null;
  return near == null || near !== vvVid || !(vvData && vvData.store && vvData.store.near);
}

function vvRender() {
  const head = document.getElementById('vvHead'), body = document.getElementById('vvBody');
  if (!head || !body) return;
  const D = vvData;
  if (!D) {
    head.innerHTML = `<div></div><div></div><div class="vv-meter"><button class="vv-close" data-vv="close" aria-label="닫기">${vvSvgX}</button></div>`;
    body.innerHTML = '<div class="vv-plate">마을 소식을 받는 중입니다.</div>';
    return;
  }
  const tabs = [['dash', '대시보드'], ['proj', '프로젝트'], ['mem', '구성원'], ['store', '창고']];
  const C = D.contrib || null;
  head.innerHTML = `<div><div class="vv-name vv-ser" id="vvName">${vvEsc(D.name)}</div>`
    + `<div class="vv-sub">${[D.region, D.chief ? `촌장 ${D.chief}` : null, D.day != null ? `${D.day}일째` : null].filter(Boolean).map(vvEsc).join(' · ')}</div></div>`
    + `<div class="vv-tabs">${tabs.map(([k, l]) => `<button class="vv-tab${vvTab === k ? ' on' : ''}" data-vv="tab" data-k="${k}">${l}</button>`).join('')}</div>`
    + `<div class="vv-meter">${(!D.member && C && C.need > 0) ? `<div><div class="lab">마을 사람이 되기까지<b id="vvContrib">${C.n} / ${C.need}</b></div><div style="width:290px;margin-top:8px">${vvBar(C.n / C.need)}</div></div>` : ''}`
    + `<button class="vv-close" data-vv="close" aria-label="닫기">${vvSvgX}</button></div>`;
  body.innerHTML = vvTab === 'proj' ? vvProj(D) : vvTab === 'mem' ? vvMem(D) : vvTab === 'store' ? vvStore(D) : vvDash(D);
}

function vvDash(D) {
  let h = '';
  const J = D.join;
  if (!D.member && J) {
    h += `<div class="vv-plate" style="display:grid;grid-template-columns:1.2fr 1fr .9fr;gap:24px">`
      + `<div><h2 class="vv-ser" style="font-size:38px;white-space:nowrap">아직 이 마을 사람이 아닙니다</h2><div>마을 일을 도우면 기여가 쌓입니다.<br>${vvEsc(J.remainText || '')}</div></div>`
      + `<div><div style="font-size:26px;margin-bottom:8px">마을 사람이 되면</div>${(J.perks || []).map((t) => `<div>· ${vvEsc(t)}</div>`).join('')}</div>`
      + `<div>${J.oneRequest ? '<div style="font-size:20px">부탁 하나만 들어주면<br>바로 마을 사람이 됩니다.</div>' : ''}`
      + `<div style="display:flex;gap:12px;margin-top:20px"><button class="vv-btn main" data-vv="req">부탁 보기</button><button class="vv-btn" data-vv="claim">내 땅 정하기</button></div></div></div>`;
  }
  const S = D.stats || {};
  const cards = [];
  if (S.pop != null) cards.push(`<div class="vv-plate"><div>사는 사람</div><div class="vv-big vv-ser" id="vvPop">${S.pop}명</div>${S.popDelta ? `<div>이번 철에 ${Math.abs(S.popDelta)}명 ${S.popDelta > 0 ? '늘었습니다' : '줄었습니다'}</div>` : ''}</div>`);
  if (S.season) cards.push(`<div class="vv-plate"><div>지금은</div><div class="vv-big vv-ser">${vvEsc(S.season)}</div>${S.toWinter > 0 ? `<div>겨울까지 ${S.toWinter}일 남았습니다</div>` : ''}</div>`);
  if (S.winter && S.winter.length) cards.push(`<div class="vv-plate"><div>겨울 준비</div>${S.winter.map((w) => `<div style="display:flex;justify-content:space-between;margin-top:10px"><span>${vvEsc(w.short ? `${w.label}${vvJosa(w.label, '이', '가')} 모자랍니다` : w.label)}</span><span>${Math.round(w.frac * 100)}%</span></div>${vvBar(w.frac)}`).join('')}</div>`);
  if (S.workN != null) cards.push(`<div class="vv-plate"><div>하고 있는 일</div><div class="vv-big vv-ser">${S.workN}가지</div>${S.workNext ? `<div>${vvEsc(S.workNext)}</div>` : ''}</div>`);
  if (cards.length) h += `<div class="vv-grid4">${cards.join('')}</div>`;
  h += `<div class="vv-grow" style="display:grid;grid-template-columns:1.7fr 1fr;gap:16px">`;
  h += `<div class="vv-plate" id="vvReq"><h2 class="vv-ser">마을의 부탁</h2>${(D.requests || []).map((r, i) => `<div class="vv-row" style="grid-template-columns:1.4fr 1.1fr .6fr auto">`
    + `<div><div style="font-size:24px">${vvEsc(r.item)} ${r.qty}${vvEsc(r.unit || '')}</div><div class="vv-small">${vvEsc(r.why || '')}</div></div>`
    + `<div><div class="vv-small">${r.filled} / ${r.qty} 모임</div>${vvBar(r.qty ? r.filled / r.qty : 0)}</div>`
    + `<div style="font-size:22px">${r.contrib != null ? `기여 +${r.contrib}` : ''}</div>`
    + `<button class="vv-btn" data-vv="give" data-i="${i}">가진 것 주기</button></div>`).join('') || '<div class="vv-small">지금은 부탁이 없습니다.</div>'}</div>`;
  h += `<div class="vv-plate"><h2 class="vv-ser">마을 소식</h2>${(D.news || []).map((n) => `<div class="vv-row" style="grid-template-columns:1fr"><div><div class="vv-small">${vvEsc(n.when)}</div><div>${vvEsc(n.text)}</div></div></div>`).join('')}</div>`;
  return h + '</div>';
}

function vvProj(D) {
  const P = D.projects || {};
  let h = `<div class="vv-plate"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px"><h2 class="vv-ser">지금 하고 있는 일</h2><div>${vvEsc(P.hint || '')}</div></div>`;
  h += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">${(P.active || []).map((p, i) => {
    const all = (p.needs || []).length && p.needs.every((n) => n.have >= n.need);
    return `<div class="vv-card"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="vv-ser" style="font-size:28px">${vvEsc(p.name)}</span><span>${vvEsc(p.status || '')}</span></div>`
      + `<div style="margin:12px 0">${vvBar(p.frac)}</div><div class="vv-small">필요한 것</div>`
      + `<div style="font-size:22px">${(p.needs || []).map((n) => `${vvEsc(n.item)} ${n.have}/${n.need}${vvEsc(n.unit || '')}`).join(' · ')}${all ? ' · 다 챙김' : ''}</div>`
      + `<div style="margin:8px 0 12px">${vvEsc(p.after || '')}</div><div style="text-align:right"><button class="vv-btn" data-vv="bring" data-i="${i}">재료 가져오기</button></div></div>`;
  }).join('')}</div></div>`;
  h += `<div class="vv-grow" style="display:grid;grid-template-columns:1.7fr 1fr;gap:16px"><div class="vv-plate"><h2 class="vv-ser">앞으로 할 일</h2>${(P.next || []).map((t) => `<div>· ${vvEsc(t)}</div>`).join('')}</div>`
    + `<div class="vv-plate"><h2 class="vv-ser">끝낸 일</h2>${(P.done || []).map((d) => `<div style="display:flex;justify-content:space-between"><span>${vvEsc(d.name)}</span><span>${d.ago}일 전</span></div>`).join('')}</div></div>`;
  return h;
}

function vvMem(D) {
  const M = D.members || {};
  const ppl = M.people || [];
  const show = vvMemAll ? ppl : ppl.slice(0, 16);
  const more = (M.total || ppl.length) - show.length;
  let h = `<div class="vv-plate vv-grow" style="display:flex;flex-direction:column"><div style="display:flex;align-items:center;gap:32px;flex-wrap:wrap;margin-bottom:16px"><h2 class="vv-ser" style="margin:0">함께 사는 사람</h2>`
    + `<div>${M.total != null ? `${M.total}명` : ''}${M.delta ? ` · 이번 철에 ${Math.abs(M.delta)}명 ${M.delta > 0 ? '늘었습니다' : '줄었습니다'}` : ''}</div>`
    + `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-left:auto">${(M.jobs || []).map((j) => `<span class="vv-chip">${vvEsc(j.job)} ${j.n}</span>`).join('')}</div></div>`;
  h += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">${show.map((p) => `<div class="vv-card"><div style="display:flex;gap:16px;align-items:center">${vvSvgMan}`
    + `<div><div class="vv-ser" style="font-size:28px">${vvEsc(p.name)}</div><div>${[p.chief ? '촌장' : null, p.job, p.sub || null, p.newcomer ? '새로 옴' : null].filter(Boolean).map(vvEsc).join(' · ')}</div></div></div>`
    + `<div style="margin-top:14px">${vvEsc(p.act || '')}</div></div>`).join('')}</div>`;
  h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:20px"><div>${vvEsc(M.hint || '')}</div>${more > 0 && !vvMemAll ? `<button class="vv-btn" data-vv="more">${more}명 더 보기</button>` : ''}</div></div>`;
  return h;
}

function vvStore(D) {
  const S = D.store || {};
  const far = vvFar();
  const unit = ((S.rows || []).find((r) => r.item === S.base) || {}).unit || '';
  const tr = (t) => (t >= 2 ? '▲▲ 크게 오름' : t === 1 ? '▲ 오름' : t === -1 ? '▼ 내림' : t <= -2 ? '▼▼ 크게 내림' : '— 그대로');
  let h = `<div class="vv-grow" style="display:grid;grid-template-columns:2fr 1fr;gap:16px"><div class="vv-plate"><h2 class="vv-ser">곳간에 있는 것</h2>`;
  if (far) h += `<div class="vv-far" id="vvFar">시세는 가까이 가야 볼 수 있습니다.</div>`;
  h += `<div class="vv-row vv-small" style="grid-template-columns:1fr .8fr 1.2fr 1fr 1fr"><span>물건</span><span>가진 양</span><span>넉넉함</span><span>시세 (${vvEsc(S.base || '')} 기준)</span><span>어제보다</span></div>`;
  h += (S.rows || []).map((r) => `<div class="vv-row" style="grid-template-columns:1fr .8fr 1.2fr 1fr 1fr"><span style="font-size:22px">${vvEsc(r.item)}</span><span>${r.qty}${vvEsc(r.unit || '')}</span>${vvBar(r.plenty)}`
    + `<span>${far ? '' : `${r.price}${vvEsc(unit)}`}</span><span>${far ? '' : tr(r.trend)}</span></div>`).join('');
  h += `</div><div style="display:flex;flex-direction:column;gap:16px"><div class="vv-plate"><h2 class="vv-ser">시세 기준</h2>`
    + `<div style="display:flex;gap:12px;margin-bottom:16px">${(S.baseOptions || []).map((b) => `<button class="vv-btn${b === S.base ? ' main' : ''}" data-vv="base" data-b="${vvEsc(b)}" style="flex:1">${vvEsc(b)}</button>`).join('')}</div>`
    + `${(S.note || []).map((t) => `<div>${vvEsc(t)}</div>`).join('')}${S.noteWhen ? `<div class="vv-small" style="margin-top:12px">${vvEsc(S.noteWhen)}</div>` : ''}</div>`
    + `<div class="vv-plate"><h2 class="vv-ser">모자란 것</h2>${(S.short || []).map((s) => `<div class="vv-row" style="grid-template-columns:.8fr 1.6fr auto"><span style="font-size:22px">${vvEsc(s.item)}</span><span>${vvEsc(s.why || '')}</span><span>${s.trend != null ? `값 ${s.trend > 0 ? '▲' : s.trend < 0 ? '▼' : '—'}` : ''}</span></div>`).join('')}`   // 값 흐름은 서버가 실을 때만(지어내지 않는다)
    + `${S.shortHint ? `<div style="margin:16px 0">${vvEsc(S.shortHint)}</div>` : ''}<button class="vv-btn main" data-vv="req">부탁 보기</button></div></div></div>`;
  return h;
}

// 버튼 — 전부 이미 있는 길(제2 규약)
function vvOnClick(e) {
  const b = e.target.closest('[data-vv]');
  if (!b) return;
  const a = b.dataset.vv, D = vvData;
  const send = (m) => { try { if (typeof sendPrimary === 'function') sendPrimary(m); } catch (er) {} };
  if (a === 'close') closeVillageView();
  else if (a === 'tab') { vvTab = b.dataset.k; vvRender(); }
  else if (a === 'more') { vvMemAll = true; vvRender(); }
  else if (a === 'req') { vvTab = 'dash'; vvRender(); const r = document.getElementById('vvReq'); if (r) r.scrollIntoView({ block: 'start' }); }
  else if (a === 'claim') send({ type: 'claim', kind: 'personal' });   // 개인 사유지 — C 키와 같은 문(T45)
  else if (a === 'give' && D) { const r = (D.requests || [])[+b.dataset.i]; if (r) send({ type: 'village_deliver', vid: vvVid, item: r.item }); }   // 게시판 줄 버튼과 같은 문
  else if (a === 'bring' && D) {   // 기부 — 회관 기부 단추와 같은 문(T769) · 든 것 중 이 일에 필요한 것만 · 모자란 만큼까지(서버가 최종 판정)
    const p = ((D.projects || {}).active || [])[+b.dataset.i];
    const inv = (typeof inventory !== 'undefined' && inventory) ? inventory : {};
    const want = {};
    if (p) for (const n of (p.needs || [])) { const q = Math.min(inv[n.item] || 0, Math.max(0, n.need - n.have)); if (q >= 1) want[n.item] = q; }
    if (Object.keys(want).length) send({ type: 'village_donate', vid: vvVid, want });
    else if (typeof showNotice === 'function') showNotice('가져올 재료가 짐에 없습니다.');
  }
  else if (a === 'base') send({ type: 'village_view', vid: vvVid, base: b.dataset.b });   // 시세 기준 고르기 — 서버가 그 기준으로 다시 보낸다(T1072 · 클라는 환산하지 않는다)
}
