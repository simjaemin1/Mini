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
// ★제3 규약: 재질(오석 판 · 판 글자 · 판 막대 · 판 버튼 · 판 선 · 판 테두리)은 **T1071 오석 모듈**(`52-u-oseok.js` · `Oseok` · 판 글자 길 = 캔버스 2D)이 입힌다 —
//   ★[T1083] 그린 DOM 에 `vvSkin` 이 붙인다(글자는 잎 칸 `vv-t` 하나씩 · 막대 `vv-bar` · 버튼 `vv-btn` · 선 `vv-rl` · 테두리 겹 `vv-fr`). 모듈이 없으면 배치 CSS 의 회색 판 그대로.
//   재질을 여기서 따로 만들지 않는다(사본 금지). 본문 18px 아래 0 · 이모지 0(닫기 · 사람 그림은 선 SVG).
// ★제4 규약: 최상위 실행문 0(분할 규약) — 선언만. 판 DOM · 스타일 · 키는 **처음 열 때** 붙인다.
// ★손잡이 `T1070_VILLAGE_VIEW`(URL 인자 · ★[T1137 · 재민 11-03] **기본 켬**): Shift+G 가 이 화면을 연다. `=0` 이면 종전 게시판 판 그대로(`47-s-board.js`).
//   [T1103] 서버 자료(T1072 · T1084)는 왔다 — 옛 게시판 판 걷기는 PM 판정(회부).

let vvData = null, vvVid = null, vvTab = 'dash', vvMemAll = false, vvWired = false;
let vvRaw = null, vvSeq = 0, vvNum = null;
let vvAsgPick = {};   // ★[T1169] 「일 맡기기」에서 고른 일(econ 사람 id → 직업) — 명부 칸이 5초 박자로 다시 지어져도 고른 것을 잃지 않게   // ★[T1103] 서버 칸 덩어리(바뀐 칸만 오면 그 칸만 갈아 끼운다) · 마지막 seq · 고른 시세 기준(res id)

function vvKnobOn() { try { return new URLSearchParams(location.search).get('T1070_VILLAGE_VIEW') !== '0'; } catch (e) { return true; } }   // ★[T1137] 켬 기본(`=0` 만 끔)

// ★★[T1103] 서버 `villageView`(T1072 · T1084 · 모양 정본 `설계/설계_마을화면_villageView.md`) → 화면이 읽는 꼴. **맞추는 자리는 이 함수 하나.**
//   · 서버에 없는 칸은 꼴에도 없다(빈 문자열 · 0 으로 채우지 않는다) — 그리는 쪽은 없는 칸의 줄 · 카드를 통째로 안 그린다.
//   · 수는 서버 값 그대로 — 클라가 하는 일은 문장 틀에 넣기 · 막대 비율(그 칸의 두 서버 값으로) · 품목 이름(서버가 실은 `ko`)뿐이다.
//   · 아직 서버에 없는 칸(T1105 가 셀 것): `head.region` · `dash.popDelta` · `dash.winter[{label,frac,short}]` · `dash.workNext` · `members.delta` ·
//     `projects.next[]` — 키가 오면 그린다(이름은 T1105 와 맞춘다 · 보고 칸 표).
//   ★이름의 그림 글자는 화면에서 뺀다 — NPC 몸 이름에 붙는 표지(`zone.js` NPC 생성의 '🤖' 꼬리)는 세계 표지이고, 이 화면은 이모지 0(판 글자 캔버스도 못 그린다 · 회부).
const vvNm = (s) => String(s == null ? '' : s).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim();
function vvAdapt(raw) {
  if (!raw || typeof raw !== 'object' || !raw.head) return null;
  const H = raw.head, Me = raw.me || null, Da = raw.dash || {}, rows = (x) => (x && Array.isArray(x.rows)) ? x.rows : [];
  const num = (x) => (typeof x === 'number' && Number.isFinite(x)) ? x : null;
  const ago = (d) => (d | 0) <= 0 ? '오늘' : `${d | 0}일 전`;
  const pj = raw.projects || {}, mem = raw.members || {}, st = raw.store || {}, P = raw.prices || {};
  const pr = {}; for (const r of rows(P)) pr[r.res] = r;
  const near = !!(raw.gate && raw.gate.near) && !P.none;
  const glut = num(st.glutDays);
  const caravanStatus = (q) => { const d = q.toDays | 0; return q.state === 'outbound' ? (d > 0 ? `${d}일 뒤 닿습니다` : '오늘 닿습니다') : (d > 0 ? `${d}일 뒤 돌아옵니다` : '오늘 돌아옵니다'); };
  const proj = (q) => {
    const o = { kind: q.kind, needs: [], after: [] };
    if (q.kind === 'house' || q.kind === 'phouse') {
      const own = vvNm(q.ownerName);
      o.name = q.kind === 'house' ? '움집 짓기' : (own ? `${own}${vvJosa(own, '이', '가')} 맡긴 움집` : '맡겨진 움집');
      o.status = q.stageLabel || '';
      if (num(q.stages) && q.stages > 0) o.frac = (q.stage | 0) / q.stages;
      o.needs = (q.need || []).map((x) => ({ item: x.ko || x.res, res: x.res, have: x.have, need: x.need, give: Array.isArray(x.give) ? x.give : [] }));
      //   ★[T1189 ④ · 문 24 ④ ㄱ] "다 되면 좋아지는 것"은 문장 없이 — 종전 "다 지으면 침상이 n 늘어납니다." 줄을 걷었다(서버 `bedsGain` 칸은 그대로 · 그리지 않는다).
    } else if (q.kind === 'clear') {
      o.name = '밭 일구기'; o.status = '하는 중';
      if (num(q.fields) != null) o.after.push(`지금 밭 ${q.fields}칸`);
      if (num(q.crew) && q.crew > 0) o.after.push(`${q.crew}명이 일구고 있습니다.`);
    } else if (q.kind === 'caravan') {
      o.name = q.to ? `${q.to}${vvJosa(q.to, '으로', '로')} 가는 행상` : '행상'; o.status = caravanStatus(q);
      if ((q.cargo || []).length) o.after.push(`실은 것 · ${q.cargo.map((c) => `${c.ko || c.res} ${c.n}`).join(' · ')}`);
    } else return null;
    return o;
  };
  const S = {
    near, pick: !!P.pick, base: P.numeraireKo || null, baseRes: P.numeraire || null,
    baseOptions: (P.basis || []).map((b) => ({ res: b.res, ko: b.ko || b.res })),
    rows: rows(st).map((r) => ({ item: r.ko || r.res, res: r.res, qty: r.qty, kg: num(r.kg), plenty: (num(r.daysOf) != null && glut > 0) ? Math.min(1, r.daysOf / glut) : null,
      price: (near && pr[r.res]) ? pr[r.res].num : null, short: !!r.short, glut: !!r.glut, up: r.priceUp === true,
      //   ★[T1189 ⑥] 시세 흐름 — 서버 `prices.trend`(30날 고리 · 고른 기준으로 나눈 값)의 그 품목 점들. 가까이 있을 때만(시세 칸과 같은 문).
      trend: (near && P.trend && Array.isArray(P.trend.rows)) ? ((P.trend.rows.find((t) => t.res === r.res) || {}).pts || null) : null })),
    trendDays: (P.trend && num(P.trend.days)) || null,
  };
  //   ★[T1169 · K18 · T1116 회부 3] 「모자란 것」= 서버 `store.short.rows`(장부 모자람 래치 전부 — **곳간이 바닥난 물건 포함** · qty 0 · daysOf 0).
  //     종전은 곳간 줄 `rows[].short` 거르기라 곳간 스냅숏이 뺀 바닥난 물건(0.005 아래)을 못 봤다. 칸이 없는 옛 서버만 종전 거르기.
  //     바닥난 줄(qty ≤ 0)은 "0일치" 대신 "곳간에 없습니다"(같은 서버 값 · 문장 틀만).
  const shortRows = (st.short && Array.isArray(st.short.rows)) ? st.short.rows : rows(st).filter((r) => r.short);
  //   ★[T1189 ⑧ · 문 24 ⑧ ㄴ] 모자란 까닭은 쓰임새 문장 없이 — 며칠치 + 값 ▲(곳간 줄의 장부 값 래치 `priceUp` 이 선 물건만).
  const upOf = {}; for (const r of rows(st)) if (r.priceUp === true) upOf[r.res] = true;
  S.short = shortRows.map((r) => ({ item: r.ko || r.res, res: r.res,
    why: [(num(r.qty) != null && r.qty <= 0) ? '곳간에 없습니다' : (num(r.daysOf) != null ? `${r.daysOf}일치 남았습니다` : ''), upOf[r.res] ? '값 ▲' : ''].filter(Boolean).join(' · ') }));
  return {
    vid: H.vid, name: H.name || '', region: H.region || null, kind: H.kindKo || null,   // ★[T1189 ②] 부제 = 지역 이름 + 마을 꼴 chief: (H.chief && vvNm(H.chief.name)) || null, age: num(H.age),
    member: !!(Me && Me.member), contrib: (Me && num(Me.need) > 0) ? { n: Me.contrib | 0, need: Me.need | 0 } : null, left: Me ? num(Me.left) : null,
    //   ★[T1137] 가입 문(서버 `me.open` 이 있을 때만) — 인정 · 다시 들기 남은 분 · 촌장(탈퇴 단추를 안 그린다) · 수수료율(서버 값 그대로 · 퍼센트로만 바꾼다)
    open: !!(Me && Me.open), recognized: !!(Me && Me.recognized), coolMin: Me ? (num(Me.coolMin) || 0) : 0, chiefMe: !!(Me && Me.chief),
    fee: (Me && num(Me.fee) != null) ? { now: Me.fee, base: num(Me.feeBase), member: num(Me.feeMember) } : null,
    stats: { pop: num(Da.pop), popDelta: num(Da.popDelta), season: (H.cal && H.cal.seasonKo) || null, toWinter: num(Da.toWinter),
      winter: Array.isArray(Da.winter) ? Da.winter : null, workN: num(Da.projectsN), workNext: Da.workNext || null,
      fuel: num(Da.fuelCov), fuelShort: Da.fuelShort === true },   // ★[T1189 ①] 오늘 땔감(겨울 준비 줄과 따로 — 문 24 ① ㄱ)
    requests: rows(raw.requests).map((r) => ({ item: r.ko || r.res, res: r.res, qty: r.qty, filled: r.filled | 0, rew: r.rewKo ? `${r.rewKo} ${r.rewQty}` : null })),
    news: rows(raw.news).map((n) => ({ when: ago(n.ago) + (n.from ? ' · 들려온 소문' : ''), text: n.line || '' })).filter((n) => n.text),
    projects: { active: (pj.now || []).map(proj).filter(Boolean), next: Array.isArray(pj.next) ? pj.next : null, done: (pj.done || []).map((d) => ({ when: ago(d.ago), text: d.line || '' })).filter((d) => d.text) },
    members: { total: num(mem.n), delta: num(mem.delta), jobs: (mem.byJob || []).map((j) => ({ job: j.ko || j.job, n: j.n | 0 })),
      people: (mem.people || []).map((p) => ({ name: vvNm(p.name), job: p.jobKo || null, chief: !!p.chief, act: p.act || '' })),
      //   ★[T1169 · K18] 촌장 「일 맡기기」 명부(서버 `members.assign` — 게시판 판 T1085 와 같은 `assignRoster` · 촌장에게만 · 없으면 칸을 안 그린다)
      assign: (mem.assign && Array.isArray(mem.assign.rows)) ? { cooldown: num(mem.assign.cooldown),
        jobs: (mem.assign.jobs || []).map((j) => ({ job: j.job, ko: j.ko || j.job, open: !!j.open })),
        rows: mem.assign.rows.map((r) => ({ id: String(r.id), job: r.job, jobKo: r.jobKo || r.job, age: num(r.age), left: r.left | 0, away: !!r.away, chief: !!r.chief })) } : null },
    store: S,
  };
}

// ★[T1103] 서버 메시지 `{ type:'village_view', vid, seq, full, view | slots }` — 통째(`full`)면 갈아 끼우고, 아니면 온 칸만 바꾼다(칸 단위 통째 교체 · 설계 §1).
//   다른 마을 것 · 지난 seq 는 버린다. 30-n-net.js 의 case 한 줄이 메시지째 넘긴다.
// ★[T1103] 바뀐 칸 → 다시 지을 판(머리 · 탭 넷). 열린 동안 서버는 5초 박자로 바뀐 칸만 보낸다 — 칸 하나(예: 몸의 행동 줄)에 판 전부를 다시 그리면
//   판 글자(캔버스)를 다 다시 그려 박자마다 멈칫한다. 그 칸을 읽는 판만 낡았다고 표시하고, 낡은 탭은 보일 때 짓는다.
const VV_ALL = ['head', 'dash', 'proj', 'mem', 'store'];
const VV_SLOT_PANES = { head: ['head', 'dash'], me: ['head', 'dash'], dash: ['dash'], requests: ['dash'], news: ['dash'], projects: ['proj'], members: ['mem'], store: ['store'], prices: ['store'], gate: ['store'] };
let vvDirty = new Set(VV_ALL);
function villageViewOnMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (vvVid != null && msg.vid != null && (msg.vid | 0) !== (vvVid | 0)) return;
  //   ★[T1115] 통째도 칸마다 견줘 바뀐 칸을 읽는 판만 낡았다고 한다 — 같은 마을을 닫았다 다시 열면 서버는 통째를 다시 보내지만 대개 몇 칸만 다르다(지어 둔 판은 그대로 둔다).
  if (msg.full) {
    const nv = msg.view || {};
    if (vvRaw && vvData) { for (const k of new Set([...Object.keys(vvRaw), ...Object.keys(nv)])) if (JSON.stringify(vvRaw[k]) !== JSON.stringify(nv[k])) for (const q of (VV_SLOT_PANES[k] || VV_ALL)) vvDirty.add(q); }
    else for (const k of VV_ALL) vvDirty.add(k);
    vvRaw = Object.assign({}, nv); vvSeq = msg.seq | 0;
  }
  else if (msg.slots && vvRaw) { if ((msg.seq | 0) <= vvSeq) return; Object.assign(vvRaw, msg.slots); vvSeq = msg.seq | 0; for (const k of Object.keys(msg.slots)) for (const q of (VV_SLOT_PANES[k] || VV_ALL)) vvDirty.add(q); }
  else return;
  vvData = vvAdapt(vvRaw);
  if (vvData && vvData.vid != null && vvVid == null) vvVid = vvData.vid;
  if (villageViewOpen()) vvRender();
}

function villageViewOpen() { const p = document.getElementById('vvPane'); return !!(p && !p.classList.contains('hidden')); }
function vvSend(m) { try { if (typeof sendPrimary === 'function') sendPrimary(m); } catch (e) {} }
function openVillageView(vid) {
  if (vid !== vvVid) { vvRaw = null; vvData = null; vvSeq = 0; for (const k of VV_ALL) vvDirty.add(k); }   // 다른 마을 — 지난 마을 자료를 안 보인다
  vvVid = vid;
  vvTab = 'dash'; vvMemAll = false;
  vvPaneEl().classList.remove('hidden');
  vvSend(vvNum ? { type: 'village_view', vid, numeraire: vvNum } : { type: 'village_view', vid });   // ★[T1103] 자료 요청(T1072 문) · 고른 시세 기준이 있으면 그것으로
  vvRender();
}
function closeVillageView() {
  const p = document.getElementById('vvPane');
  if (p && !p.classList.contains('hidden')) { p.classList.add('hidden'); vvSend({ type: 'village_view_close' }); }   // ★[T1103] 닫으면 서버도 바뀐 칸을 그만 보낸다(T1072 문)
}

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
    p.addEventListener('change', (e) => { const sel = e.target.closest && e.target.closest('[data-vv-job]'); if (sel) vvAsgPick[sel.dataset.vvJob] = sel.value; });   // ★[T1169] 고른 일을 쥔다
  }
  return p;
}


// ── 판 CSS(배치) — 재질은 `52-u-oseok.js`(T1071 · `Oseok`)가 입힌다(`vvSkin` · ★[T1083]). 모듈이 없으면 이 CSS 의 회색 판 그대로(T1070 임시 판).
//   여기 색은 모듈이 없을 때만 보이는 대체 값이다 — 재질을 여기서 만들지 않는다(사본 금지). 본문 18px 이상.
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
#vvPane .vv-plate{background:#4a4a4a;box-sizing:border-box;padding:20px 32px;position:relative}
#vvPane .vv-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px 32px}
#vvPane .vv-col{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
#vvPane .vv-line{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
#vvPane .vv-tabs{display:flex;gap:40px}
#vvPane .vv-tab{background:none;border:0;color:inherit;font:inherit;padding:4px 2px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px}
#vvPane .vv-tab .vv-rl{width:100%;height:3px;visibility:hidden}
#vvPane .vv-tab.on .vv-rl{visibility:visible}
#vvPane .vv-meter{justify-self:end;display:flex;align-items:flex-start;gap:24px}
#vvPane .vv-close{position:relative;width:44px;height:44px;background:none;border:0;color:#e0e0e0;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}
#vvPane .vv-bar{height:12px;background:#262626;box-sizing:border-box;position:relative}
#vvPane .vv-bar>i{display:block;height:100%;background:#d6d6d6}
#vvPane .vv-btn{position:relative;background:none;border:1px solid #cfcfcf;color:#e6e6e6;font:inherit;cursor:pointer;white-space:nowrap;height:52px;padding:0 24px;display:inline-flex;align-items:center;justify-content:center}
#vvPane .vv-btn.main{outline:1px solid #cfcfcf;outline-offset:3px}
#vvPane .vv-btn.os-btn{border:0;outline:0}
#vvPane .vv-row{display:grid;align-items:center;gap:16px;padding:12px 0}
#vvPane .vv-rl{display:block;height:2px;background:#666;position:relative}
#vvPane .vv-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
#vvPane .vv-card,#vvPane .vv-chip,#vvPane .vv-far{position:relative;padding:16px 20px}
#vvPane .vv-chip{padding:6px 18px}
#vvPane .vv-far{margin-bottom:12px}
#vvPane .vv-fr{position:absolute;inset:0;border:1px solid #9a9a9a;box-sizing:border-box;pointer-events:none}
#vvPane .vv-t{display:inline-block}
#vvPane .vv-sel{font:inherit;font-size:18px;background:#3a3a3a;color:#e6e6e6;border:1px solid #9a9a9a;height:44px;padding:0 8px;min-width:0}
`;
  document.head.appendChild(s);
}

const vvEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 판 글자 한 칸(잎 — 자식 없음) · sz px(18 아래 금지 — 모듈이 지킨다) · f = serif(제목 명조) | sans(굵은 고딕 · 버튼) | sansm(본문 고딕)
const vvT = (s, sz, f, id) => `<span class="vv-t"${id ? ` id="${id}"` : ''} data-sz="${sz || 18}" data-f="${f || 'sansm'}" style="font-size:${sz || 18}px">${vvEsc(s)}</span>`;
const vvBar = (f) => `<div class="vv-bar" data-p="${Math.max(0, Math.min(1, +f || 0))}"><i style="width:${Math.round(Math.max(0, Math.min(1, +f || 0)) * 100)}%"></i></div>`;
const vvBtn = (label, attrs, main) => `<button class="vv-btn${main ? ' main' : ''}" ${attrs} data-label="${vvEsc(label)}"${main ? ' data-main="1"' : ''}>${vvEsc(label)}</button>`;
const vvRl = () => '<i class="vv-rl"></i>';
const vvFr = '<i class="vv-fr"></i>';
const vvRows = (arr) => arr.join(vvRl());   // 줄 사이에 판 선
const vvEmpty = (t) => `<div class="vv-empty" style="margin-top:12px">${vvT(t, 20)}</div>`;   // ★[T1103] 빈 칸 안내 — 제목 아래 한 줄(제목 옆에 붙지 않게)
// 받침 있으면 a(이 · 은 · 을) · 없으면 b(가 · 는 · 를) — 한글 마지막 글자만 본다(문장 틀용)
//   ★[T1103] 숫자로 끝나는 이름(어촌3 · 임업2)은 숫자 읽기의 받침으로(영 일 삼 육 칠 팔 = 받침 · 일 칠 팔 = ㄹ 받침). '으로'/'로' 는 ㄹ 받침도 '로'.
function vvJosa(w, a, b) {
  const t = String(w || ''), ch = t.slice(-1), c = ch.charCodeAt(0);
  let has, rieul = false;
  if (c >= 0xAC00 && c <= 0xD7A3) { const j = (c - 0xAC00) % 28; has = j > 0; rieul = j === 8; }
  else if (ch >= '0' && ch <= '9') { has = '013678'.indexOf(ch) >= 0; rieul = '178'.indexOf(ch) >= 0; }
  else return a;
  if (a === '으로' && rieul) return b;
  return has ? a : b;
}
const vvSvgX = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4L20 20M20 4L4 20" stroke="currentColor" stroke-width="1.8"/></svg>';
const vvSvgMan = '<svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" style="color:#dcdcdc;flex:none"><circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="26" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M26 20V31M18 25H34M26 31L20 39M26 31L32 39" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

// 마을 중심에서 먼가 — 클라가 이미 아는 근접(`evNearVid` — 30-n-net 근접 틱)과 서버가 시세를 실었나(`store.near`)
function vvFar() {
  const near = (typeof evNearVid !== 'undefined') ? evNearVid : null;
  return near == null || near !== vvVid || !(vvData && vvData.store && vvData.store.near);
}

// ★★[T1083] 오석 판 입히기 — T1071 모듈(`Oseok` · 판 글자 길 = 캔버스 2D)을 그린 DOM 에 붙인다. 판 무늬는 화면 자리만큼 밀어 판끼리 결이 이어지게.
//   모듈이 없으면(조각이 안 붙은 판) 아무것도 안 한다 — 배치 CSS 의 회색 판 그대로다.
let vvSkinMs = 0;   // 마지막 입히기 ms(e2e · 보고 표 — 판 열 때 · 탭 바꿀 때의 값)
function vvSkin(root) {
  if (typeof Oseok === 'undefined' || !root) return;
  const t0 = performance.now();
  const pane = document.getElementById('vvPane');
  if (pane && !pane._vvGround) { Oseok.ground(pane, { ox: 0, oy: 0 }); pane._vvGround = true; }
  //   ★[T1115] 읽기와 쓰기를 묶는다 — 판 글자(쓰기만 · 배치를 안 읽는다)를 먼저 다 입히고, 크기를 한 번에 다 읽은 뒤, 막대 · 선 · 테두리 · 버튼 · 판을 쓴다.
  //   종전엔 칸마다 크기 읽기(clientWidth) → 캔버스 쓰기를 번갈아 해 칸 수만큼 배치를 다시 셈했다.
  for (const el of root.querySelectorAll('.vv-t')) Oseok.text(el, el.textContent, { size: +el.dataset.sz || 18, font: el.dataset.f || 'sansm' });
  const pr = pane ? pane.getBoundingClientRect() : { left: 0, top: 0 };
  const plates = [...(root.matches && root.matches('.vv-plate') ? [root] : []), ...root.querySelectorAll('.vv-plate')].map((el) => [el, el.getBoundingClientRect()]);   // 뿌리 자신이 판(머리)이면 그것도
  const sz = (el) => [el, el.clientWidth, el.clientHeight];
  const bars = [...root.querySelectorAll('.vv-bar')].map(sz), rules = [...root.querySelectorAll('.vv-rl')].map(sz), frames = [...root.querySelectorAll('.vv-fr')].map(sz);
  //   버튼은 입히기 전에 배치가 정한 폭 · 높이를 박는다(모듈의 `.os-btn` 은 안쪽 여백이 0 이라 그대로 두면 글자 폭으로 줄어든다)
  const btns = [...root.querySelectorAll('.vv-btn')].map((el) => [el, el.offsetWidth, el.offsetHeight]);
  for (const [el, r] of plates) Oseok.plate(el, { ox: r.left - pr.left, oy: r.top - pr.top });
  for (const [el, w, h] of bars) Oseok.bar(el, +el.dataset.p || 0, { w, h });
  for (const [el, w, h] of rules) if (w > 0) Oseok.rule(el, { lw: 1.4, w, h });
  for (const [el, w, h] of frames) Oseok.frame(el, { lw: 1.6, w, h });
  for (const [el, w, h] of btns) { if (!el._osBtn) { el.style.width = `${w}px`; el.style.height = `${h}px`; } Oseok.button(el, el.dataset.label, { primary: !!el.dataset.main, size: 20, font: 'sans', w, h }); }
  vvSkinMs = performance.now() - t0;
}

function vvRender() {
  const head = document.getElementById('vvHead'), body = document.getElementById('vvBody');
  if (!head || !body) return;
  const D = vvData;
  const closeBtn = `<button class="vv-close" data-vv="close" aria-label="닫기">${vvFr}${vvSvgX}</button>`;
  if (!D) {
    head.innerHTML = `<div></div><div></div><div class="vv-meter">${closeBtn}</div>`;
    body.innerHTML = `<div class="vv-plate">${vvT('마을 소식을 받는 중입니다.', 20)}</div>`;
    vvSkin(document.getElementById('vvPane'));
    for (const k of VV_ALL) vvDirty.add(k);
    return;
  }
  const tabs = [['dash', '대시보드'], ['proj', '프로젝트'], ['mem', '구성원'], ['store', '창고']];
  const C = D.contrib || null;
  //   ★[T1083] 머리는 자료가 바뀔 때만 다시 짓는다(탭 바꿈은 고른 표시만 옮긴다 — 판 글자를 다시 안 그린다) · ★[T1103] 머리가 읽는 칸(`head` · `me`)이 바뀔 때만
  if (!body.querySelector('.vv-tabbody')) { body.innerHTML = tabs.map(([k]) => `<div class="vv-tabbody" data-k="${k}" style="display:none"></div>`).join(''); for (const k of VV_ALL) vvDirty.add(k); }
  if (vvDirty.has('head')) {
    vvDirty.delete('head');
    head.innerHTML = `<div class="vv-col">${vvT(D.name, 52, 'serif', 'vvName')}`
      + `${vvT([[D.region, D.kind].filter(Boolean).join(' ') || null, D.chief ? `촌장 ${D.chief}` : null, D.age != null ? `${D.age}일째` : null].filter(Boolean).join(' · '), 18)}</div>`
      + `<div class="vv-tabs">${tabs.map(([k, l]) => `<button class="vv-tab" data-vv="tab" data-k="${k}">${vvT(l, 24, 'sansm')}${vvRl()}</button>`).join('')}</div>`
      + `<div class="vv-meter">${((D.open ? (!D.recognized && C && C.n < C.need) : !D.member) && C && C.need > 0) ? `<div><div class="vv-line">${vvT(D.open ? '구성원으로 인정되기까지' : '마을 사람이 되기까지', 20)}${vvT(`${Math.min(C.n, C.need)} / ${C.need}`, 24, 'sans', 'vvContrib')}</div><div style="width:290px;margin-top:8px">${vvBar(Math.min(1, C.n / C.need))}</div></div>` : ''}`
      + `${closeBtn}</div>`;
    head.classList.add('vv-plate');
    vvSkin(head);
  }
  for (const tb of body.querySelectorAll('.vv-tabbody')) if (vvDirty.has(tb.dataset.k)) { vvDirty.delete(tb.dataset.k); tb._vvSig = null; }   // 낡은 탭 — 보일 때 짓는다
  for (const b of head.querySelectorAll('.vv-tab')) b.classList.toggle('on', b.dataset.k === vvTab);
  //   탭 판: 지어 둔 것을 보이기만 — 처음 볼 때 · 자료가 바뀐 뒤 · 그 탭의 꼴을 바꾸는 상태(창고 먼/가까움 · 구성원 더 보기)가 바뀌었을 때만 짓는다.
  //   ⚠보이게 한 **뒤에** 짓는다 — 판 · 막대 · 선의 크기는 보이는 칸에서만 잰다.
  const sig = vvTab === 'store' ? `s${vvFar() ? 1 : 0}` : vvTab === 'mem' ? `m${vvMemAll ? 1 : 0}` : '';
  for (const tb of body.querySelectorAll('.vv-tabbody')) tb.style.display = tb.dataset.k === vvTab ? 'contents' : 'none';
  const cur = body.querySelector(`.vv-tabbody[data-k="${vvTab}"]`);
  if (cur && cur._vvSig !== sig) {
    cur._vvSig = sig;
    cur.innerHTML = vvTab === 'proj' ? vvProj(D) : vvTab === 'mem' ? vvMem(D) : vvTab === 'store' ? vvStore(D) : vvDash(D);
    vvSkin(cur);
  } else vvSkinMs = 0;
}

function vvDash(D) {
  let h = '';
  //   가입 안내 — 서버 계량기(`me.contrib` · `need` · `left`)만. 마을 사람이 되면 얻는 것 · "부탁 하나면" 같은 줄은 서버에 없어 안 그린다(회부).
  if (D.open) h += vvJoinPlate(D);   // ★[T1137] 가입 · 탈퇴 · 인정(켬 — 아래 종전 판 대신)
  else if (!D.member && D.contrib) {
    h += `<div class="vv-plate" style="display:grid;grid-template-columns:1.6fr 1fr;gap:24px;align-items:center">`
      + `<div class="vv-col">${vvT('아직 이 마을 사람이 아닙니다', 38, 'serif')}<div style="height:8px"></div>${vvT('마을의 부탁을 들어주면 기여가 쌓입니다.', 20)}`
      + `${D.left > 0 ? vvT(`${D.left} 더 모으면 ${D.name} 사람이 될 수 있습니다.`, 20, 'sansm', 'vvLeft') : ''}</div>`
      + `<div style="display:flex;gap:12px;justify-content:flex-end">${vvBtn('부탁 보기', 'data-vv="req"', true)}${vvBtn('내 땅 정하기', 'data-vv="claim"')}</div></div>`;
  }
  const S = D.stats || {};
  const cards = [];
  if (S.pop != null) cards.push(`<div class="vv-plate vv-col">${vvT('사는 사람', 20)}${vvT(`${S.pop}명`, 56, 'serif', 'vvPop')}${S.popDelta ? vvT(`이번 철에 ${Math.abs(S.popDelta)}명 ${S.popDelta > 0 ? '늘었습니다' : '줄었습니다'}`, 18) : ''}</div>`);
  if (S.season) cards.push(`<div class="vv-plate vv-col">${vvT('지금은', 20)}${vvT(S.season, 56, 'serif', 'vvSeason')}${S.toWinter > 0 ? vvT(`겨울까지 ${S.toWinter}일 남았습니다`, 18, 'sansm', 'vvToWinter') : ''}</div>`);
  //   ★[T1189 ①] 겨울 준비 = 서버 `dash.winter`(먹을 것 며칠치 ÷ 겨울 끝까지 남은 날) · 오늘 땔감 = 서버 `fuelCov`(따로 한 줄 — 겨울 준비 %에 섞지 않는다)
  if ((S.winter && S.winter.length) || S.fuel != null) cards.push(`<div class="vv-plate" id="vvWinter">${vvT('겨울 준비', 20)}${(S.winter || []).map((w) => `<div class="vv-line" style="margin-top:10px">${vvT(w.short ? `${w.label}${vvJosa(w.label, '이', '가')} 모자랍니다` : w.label, 18)}${vvT(`${Math.round(w.frac * 100)}%`, 18)}</div>${vvBar(w.frac)}`
      + `${w.days != null && w.need != null ? `<div style="margin-top:4px">${vvT(`${w.days}일치 · 겨울 끝까지 ${w.need}일`, 18)}</div>` : ''}`).join('')}`
    + `${S.fuel != null ? `<div class="vv-line" style="margin-top:10px">${vvT(S.fuelShort ? '오늘 땔감이 모자랍니다' : '오늘 땔감', 18)}${vvT(`${Math.round(Math.min(1, S.fuel) * 100)}%`, 18)}</div>${vvBar(Math.min(1, S.fuel))}` : ''}</div>`);
  if (S.workN != null) cards.push(`<div class="vv-plate vv-col">${vvT('하고 있는 일', 20)}${vvT(`${S.workN}가지`, 56, 'serif', 'vvWorkN')}${S.workNext ? vvT(S.workNext, 18) : ''}</div>`);
  if (cards.length) h += `<div class="vv-grid4" style="grid-template-columns:repeat(${cards.length},1fr)">${cards.join('')}</div>`;
  h += `<div class="vv-grow" style="display:grid;grid-template-columns:1.7fr 1fr;gap:16px">`;
  h += `<div class="vv-plate" id="vvReq">${vvT('마을의 부탁', 32, 'serif')}${vvRows((D.requests || []).map((r, i) => `<div class="vv-row vv-req" style="grid-template-columns:1.4fr 1.1fr auto">`
    + `<div class="vv-col">${vvT(`${r.item} ${r.qty}`, 24)}${r.rew ? vvT(`갚는 것 · ${r.rew}`, 18) : ''}</div>`
    + `<div>${vvT(`${r.filled} / ${r.qty} 모임`, 18)}${vvBar(r.qty ? r.filled / r.qty : 0)}</div>`
    + `${vvBtn('가진 것 주기', `data-vv="give" data-i="${i}"`)}</div>`)) || vvEmpty('지금은 부탁이 없습니다.')}</div>`;
  h += `<div class="vv-plate">${vvT('마을 소식', 32, 'serif')}${vvRows((D.news || []).map((n) => `<div class="vv-row vv-news" style="grid-template-columns:1fr"><div class="vv-col">${vvT(n.when, 18)}${vvT(n.text, 20)}</div></div>`)) || vvEmpty('아직 들려온 소식이 없습니다.')}</div>`;
  return h + '</div>';
}

// ★[T1137] 가입 판 — 셋 중 하나(아직 아님 · 마을 사람 · 인정 구성원). 단추는 이미 있는 길(채팅 명령 `/가입` · `/탈퇴` — 제2 규약 · 서버가 판정한다).
const vvPct = (r) => `${Math.round(r * 1000) / 10}%`;
function vvFeeLine(D) {
  const F = D.fee;
  if (!F || !(F.base > 0)) return '';
  return F.member != null && F.member < F.base ? `거래소 수수료 ${vvPct(F.base)} · 인정 구성원 ${vvPct(F.member)}` : `거래소 수수료 ${vvPct(F.base)}`;
}
function vvJoinPlate(D) {
  const left = D.left != null ? D.left : 0, fee = vvFeeLine(D);
  const plate = (title, lines, btns) => `<div class="vv-plate" style="display:grid;grid-template-columns:1.6fr 1fr;gap:24px;align-items:center">`
    + `<div class="vv-col">${vvT(title, 38, 'serif', 'vvJoinTitle')}<div style="height:8px"></div>${lines.filter(Boolean).map((l, i) => vvT(l, 20, i === 0 ? 'sansm' : 'sans', i === 0 ? 'vvJoinLine' : null)).join('')}</div>`
    + `<div style="display:flex;gap:12px;justify-content:flex-end">${btns.join('')}</div></div>`;
  if (!D.member) {
    const cool = D.coolMin > 0 ? `마을을 떠난 지 얼마 되지 않았습니다. ${D.coolMin >= 60 ? `${Math.floor(D.coolMin / 60)}시간${D.coolMin % 60 ? ` ${D.coolMin % 60}분` : ''}` : `${D.coolMin}분`} 뒤에 다시 들 수 있습니다.` : null;
    return plate('아직 이 마을 사람이 아닙니다', [cool || '지금 바로 들 수 있습니다.',
      left > 0 ? `부탁을 ${left}건 더 채우면 구성원으로 인정됩니다(거래소 할인 · 영토 안 집터).` : '부탁은 이미 다 채웠습니다. 들면 곧 인정 구성원입니다(거래소 할인 · 영토 안 집터).', fee],
      [cool ? '' : vvBtn('가입', 'data-vv="join" id="vvJoin"', true), vvBtn('부탁 보기', 'data-vv="req"')]);
  }
  const quit = D.chiefMe ? '' : vvBtn('탈퇴', 'data-vv="quit" id="vvQuit"');
  if (!D.recognized) return plate('이 마을 사람입니다', [`구성원으로 인정되기까지 부탁 ${left}건이 남았습니다.`, '떠나면 1시간 뒤에 다시 들 수 있습니다.', fee], [vvBtn('부탁 보기', 'data-vv="req"', true), quit]);
  return plate('인정 구성원입니다', ['할인 · 영토 안 집터', fee], [vvBtn('내 땅 정하기', 'data-vv="claim"', true), quit]);
}

function vvProj(D) {
  const P = D.projects || {};
  let h = `<div class="vv-plate"><div class="vv-line" style="margin-bottom:12px">${vvT('지금 하고 있는 일', 32, 'serif')}</div>`;
  h += (P.active || []).length ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">${P.active.map((p, i) => {
    const short = (p.needs || []).filter((n) => n.have < n.need);
    return `<div class="vv-card vv-proj" data-kind="${vvEsc(p.kind)}">${vvFr}<div class="vv-line">${vvT(p.name, 28, 'serif')}${vvT(p.status || '', 18)}</div>`
      + `${p.frac != null ? `<div style="margin:12px 0">${vvBar(p.frac)}</div>` : '<div style="height:12px"></div>'}<div class="vv-col">`
      + `${(p.needs || []).length ? vvT('필요한 것', 18) + vvT(`${p.needs.map((n) => `${n.item} ${n.have}/${n.need}`).join(' · ')}${short.length ? '' : ' · 다 챙김'}`, 22) : ''}`
      + `${(p.after || []).map((t) => vvT(t, 18)).join('')}</div>`
      + `${short.length ? `<div style="text-align:right;margin-top:12px">${vvBtn('재료 가져오기', `data-vv="bring" data-i="${i}"`)}</div>` : ''}</div>`;
  }).join('')}</div>` : vvEmpty('지금은 하고 있는 일이 없습니다.');
  h += '</div>';
  const doneP = `<div class="vv-plate">${vvT('끝낸 일', 32, 'serif')}${(P.done || []).length ? P.done.map((d) => `<div class="vv-line vv-done">${vvT(d.text, 20)}${vvT(d.when, 20)}</div>`).join('') : vvEmpty('올해 끝낸 일이 아직 없습니다.')}</div>`;
  h += P.next ? `<div class="vv-grow" style="display:grid;grid-template-columns:1.7fr 1fr;gap:16px"><div class="vv-plate vv-col">${vvT('앞으로 할 일', 32, 'serif')}${P.next.map((t) => vvT(`· ${t}`, 20)).join('')}</div>${doneP}</div>`
    : `<div class="vv-grow" style="display:flex;flex-direction:column">${doneP}</div>`;
  return h;
}

function vvMem(D) {
  const M = D.members || {};
  const ppl = M.people || [];
  const show = vvMemAll ? ppl : ppl.slice(0, 16);
  const more = ppl.length - show.length;
  let h = `<div class="vv-plate vv-grow" style="display:flex;flex-direction:column"><div style="display:flex;align-items:center;gap:32px;flex-wrap:wrap;margin-bottom:16px">${vvT('함께 사는 사람', 32, 'serif')}`
    + `${M.total != null ? vvT(`${M.total}명${M.delta ? ` · 이번 철에 ${Math.abs(M.delta)}명 ${M.delta > 0 ? '늘었습니다' : '줄었습니다'}` : ''}`, 20, 'sansm', 'vvMemN') : ''}`
    + `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-left:auto">${(M.jobs || []).map((j) => `<span class="vv-chip">${vvFr}${vvT(`${j.job} ${j.n}`, 18)}</span>`).join('')}</div></div>`;
  h += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">${show.map((p) => `<div class="vv-card vv-person">${vvFr}<div style="display:flex;gap:16px;align-items:center">${vvSvgMan}`
    + `<div class="vv-col">${vvT(p.name, 28, 'serif')}${vvT([p.chief ? '촌장' : null, p.job].filter(Boolean).join(' · '), 18)}</div></div>`
    + `${p.act ? `<div style="margin-top:14px">${vvT(p.act, 18)}</div>` : ''}</div>`).join('')}</div>`;
  if (more > 0) h += `<div class="vv-line" style="margin-top:auto;padding-top:20px"><span></span>${vvBtn(`${more}명 더 보기`, 'data-vv="more"')}</div>`;
  return h + '</div>' + vvAssign(M.assign);
}

// ★[T1169 · K18 · T1115 회부 2] 촌장 「일 맡기기」 — 게시판 판(T1085 `boardMembersHtml`)과 같은 줄 · 같은 문(`assign_job`). 새 동작 0.
//   한 줄: 지금 일 · 나이 · 형편(원정 중 · n일 뒤 · 촌장이 맡김) · 맡길 일 · 「일 맡기기」. 값은 전부 서버 것 — 된다 · 안 된다도 서버가 말한다(알림 한 줄).
function vvAssign(A) {
  if (!A || !A.rows.length) return '';
  const cols = 'grid-template-columns:1fr .5fr 1fr 1.3fr auto';
  let h = `<div class="vv-plate" id="vvAssign" style="margin-top:16px">${vvT('일 맡기기', 32, 'serif')}`
    + `<div class="vv-row" style="${cols}">${vvT('지금 일', 18)}${vvT('나이', 18)}${vvT('형편', 18)}${vvT('맡길 일', 18)}<span></span></div>${vvRl()}`;
  h += vvRows(A.rows.map((r) => {
    const shut = r.away || r.left > 0;
    const st = [r.away ? '원정 중' : r.left > 0 ? `${r.left}일 뒤` : '', r.chief ? '촌장이 맡김' : ''].filter(Boolean).join(' · ');
    const pick = vvAsgPick[r.id];
    const opts = A.jobs.filter((j) => j.job !== r.job)
      .map((j) => `<option value="${vvEsc(j.job)}"${j.open ? '' : ' disabled'}${pick === j.job ? ' selected' : ''}>${vvEsc(j.ko)}${j.open ? '' : ' (자리 없음)'}</option>`).join('');
    return `<div class="vv-row vv-asg" data-vv-npc="${vvEsc(r.id)}" style="${cols}">${vvT(r.jobKo, 20)}${r.age != null ? vvT(`${r.age}`, 20) : '<span></span>'}${st ? vvT(st, 18) : '<span></span>'}`
      + `<select class="vv-sel" data-vv-job="${vvEsc(r.id)}"${shut ? ' disabled' : ''}>${opts}</select>`
      + `${shut ? '<span></span>' : vvBtn('일 맡기기', `data-vv="assign" data-npc="${vvEsc(r.id)}"`)}</div>`;
  }));
  if (A.cooldown != null) h += `<div style="margin-top:12px">${vvT(`맡긴 사람은 ${A.cooldown}일 동안 스스로 일을 바꾸지 않습니다. 마을이 굶으면 먹을 것을 구하는 일로 먼저 돌아갑니다.`, 18)}</div>`;
  return h + '</div>';
}

function vvStore(D) {
  const S = D.store || {};
  const far = vvFar(), showPrice = !far && !S.pick && S.base;
  const cols = 'grid-template-columns:1fr 1fr 1.1fr .9fr 1fr';   // ★[T1189] 물건 · 가진 양(낱개 · kg) · 넉넉함 · 시세 · 30날 흐름
  let h = `<div class="vv-grow" style="display:grid;grid-template-columns:2fr 1fr;gap:16px"><div class="vv-plate">${vvT('곳간에 있는 것', 32, 'serif')}`;
  if (far) h += `<div class="vv-far" id="vvFar">${vvFr}${vvT('시세는 가까이 가야 볼 수 있습니다.', 20)}</div>`;
  else if (S.pick || !S.base) h += `<div class="vv-far" id="vvPick">${vvFr}${vvT('시세 기준을 고르면 시세가 나옵니다.', 20)}</div>`;
  h += `<div class="vv-row" style="${cols}">${vvT('물건', 18)}${vvT('가진 양', 18)}${vvT('넉넉함', 18)}${vvT(showPrice ? `시세 (${S.base} 기준)` : '시세', 18)}${vvT(S.trendDays ? `지난 ${S.trendDays}일` : '흐름', 18)}</div>${vvRl()}`;
  h += vvRows((S.rows || []).map((r) => `<div class="vv-row vv-store" style="${cols}">${vvT(r.item, 22)}<span class="vv-col" style="gap:0">${vvT(`${r.qty}개`, 20)}${r.kg != null ? vvT(`${r.kg}kg`, 18) : ''}</span>${r.plenty != null ? vvBar(r.plenty) : '<span></span>'}`
    + `<span>${showPrice && r.price != null ? vvT(`${r.price}`, 20) : ''}</span><span class="vv-trend">${showPrice ? vvSpark(r.trend, S.trendDays) : ''}</span></div>`)) || vvEmpty('곳간이 비었습니다.');
  h += `</div><div style="display:flex;flex-direction:column;gap:16px"><div class="vv-plate">${vvT('시세 기준', 32, 'serif')}`;
  h += (S.baseOptions || []).length
    ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0 16px">${S.baseOptions.map((b) => vvBtn(b.ko, `data-vv="base" data-b="${vvEsc(b.res)}" style="flex:1"`, b.res === S.baseRes)).join('')}</div>`
    : `<div style="margin:12px 0 16px">${vvT('짐에 기준으로 삼을 물건이 없습니다.', 20)}</div>`;
  h += `<div class="vv-col">${vvT('기준은 내 짐에 있는 물건 가운데서 고릅니다.', 20)}${vvT('시세는 이 마을이 지금 매기는 값입니다.', 20)}${vvT('이웃 마을 값은 직접 가 봐야 알 수 있습니다.', 20)}</div></div>`
    + `<div class="vv-plate">${vvT('모자란 것', 32, 'serif')}${vvRows((S.short || []).map((x) => `<div class="vv-row vv-short" style="grid-template-columns:.8fr 1.6fr">${vvT(x.item, 22)}${x.why ? vvT(x.why, 20) : '<span></span>'}</div>`)) || vvEmpty('지금 모자란 것이 없습니다.')}`
    + `<div style="margin-top:16px">${vvBtn('부탁 보기', 'data-vv="req"', true)}</div></div></div></div>`;
  return h;
}

// ★[T1189 ⑥] 시세 흐름 선 — 서버 점(`{ ago, num }`)을 그대로 잇는다(가로 = 며칠 전 · 세로 = 그 점들의 최소 ~ 최대). 점이 둘 아래면 안 그린다.
//   그림 크기는 칸 폭에 맞춘 판 꼴(가로 120 · 세로 36 px — 화면 배치 값 · 세계 값 아님).
function vvSpark(pts, days) {
  if (!Array.isArray(pts) || pts.length < 2) return '';
  const W = 120, Hh = 36, D = Math.max(1, (days || 0) - 1, ...pts.map((p) => p.ago));
  const lo = Math.min(...pts.map((p) => p.num)), hi = Math.max(...pts.map((p) => p.num)), span = hi - lo || 1;
  const xy = pts.map((p) => `${(W * (1 - p.ago / D)).toFixed(1)},${(Hh - 2 - (Hh - 4) * (p.num - lo) / span).toFixed(1)}`).join(' ');
  return `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" aria-label="지난 시세 흐름" style="color:#d6d6d6"><polyline points="${xy}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

// 버튼 — 전부 이미 있는 길(제2 규약)
function vvOnClick(e) {
  const b = e.target.closest('[data-vv]');
  if (!b) return;
  const a = b.dataset.vv, D = vvData;
  if (a === 'close') closeVillageView();
  else if (a === 'tab') { vvTab = b.dataset.k; vvRender(); }
  else if (a === 'more') { vvMemAll = true; vvRender(); }
  else if (a === 'req') { vvTab = 'dash'; vvRender(); const r = document.getElementById('vvReq'); if (r) r.scrollIntoView({ block: 'start' }); }
  else if (a === 'claim') vvSend({ type: 'claim', kind: 'personal' });   // 개인 사유지 — C 키와 같은 문(T45)
  else if (a === 'join') vvSend({ type: 'chat', text: '/가입' });   // ★[T1137] 가입 — 채팅 명령과 같은 문(앞에 선 마을 · 서버가 판정)
  else if (a === 'quit') vvSend({ type: 'chat', text: '/탈퇴' });   // ★[T1137] 탈퇴 — 채팅 명령과 같은 문
  else if (a === 'give' && D) { const r = (D.requests || [])[+b.dataset.i]; if (r) vvSend({ type: 'village_deliver', vid: vvVid, item: r.res }); }   // 게시판 줄 버튼과 같은 문(부탁 품목 = res id)
  else if (a === 'bring' && D) {   // 기부 — 회관 기부 단추와 같은 문(T769) · 그 자재로 들어가는 내 물건(서버 `give`) 중 든 것 · 모자란 만큼까지(서버가 최종 판정)
    const p = ((D.projects || {}).active || [])[+b.dataset.i];
    const inv = (typeof inventory !== 'undefined' && inventory) ? inventory : {};
    const want = {};
    if (p) for (const n of (p.needs || [])) {
      let left = Math.ceil(Math.max(0, n.need - n.have));
      for (const it of (n.give || [])) { if (left <= 0) break; const q = Math.min(Math.floor(inv[it] || 0), left); if (q >= 1) { want[it] = (want[it] || 0) + q; left -= q; } }
    }
    //   ★[T1189 ⑤ · 문 24 ⑤ ㄱ] 집터(`kind:'house'`)는 **그 집터에** 놓는다(`village_site_give` — 짐 → 집터 실물 · 단계 자재를 다 채우면 기여 +1). 그 밖은 종전 기부.
    if (Object.keys(want).length) vvSend(p.kind === 'house' ? { type: 'village_site_give', vid: vvVid, want } : { type: 'village_donate', vid: vvVid, want });
    else if (typeof showNotice === 'function') showNotice('가져올 재료가 짐에 없습니다.');
  }
  else if (a === 'assign') {   // ★[T1169] 촌장 일 맡기기 — 게시판 판 「일 맡기기」와 같은 문(T1085 `assign_job` · 그 줄의 사람 · 고른 일)
    const sel = document.querySelector(`#vvPane [data-vv-job="${CSS.escape(b.dataset.npc)}"]`);
    if (sel && sel.value) vvSend({ type: 'assign_job', vid: vvVid, npc: b.dataset.npc, job: sel.value });
  }
  else if (a === 'base') { vvNum = b.dataset.b; vvSend({ type: 'village_view', vid: vvVid, numeraire: vvNum }); }   // ★[T1103] 시세 기준 고르기 — 화면은 이름 · 보내는 값은 res id(T1072 문 `numeraire`) · 서버가 그 기준으로 통째 다시 보낸다(클라는 환산하지 않는다)
}
