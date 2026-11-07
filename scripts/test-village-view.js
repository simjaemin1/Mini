#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-village-view.js — 마을 화면 자료 `villageView` (T1072) =========================
//
// ★왜 [★재민 11-01 · PM 카드 T1072] 마을 화면(T1070)이 읽는 한 덩어리 — 그림의 칸 하나하나가 **서버에 실제로 있는 값**이어야 한다.
//   모양 정본 `설계/설계_마을화면_villageView.md` · 고정 자료 `test/fixtures/village-view.json` · 칸 전수표 `보고/T1072_2026-11-02.md`.
//
//  ① 열기 — 진짜 메시지 문(`handlePlayerInput` `village_view`)으로 연다 → `full:true` · 칸 열 개 · 고정 자료와 같은 칸 이름
//  ② 칸 = 서버 값 — 칸마다 **정본 함수를 따로 불러** 대조한다(게시판 · 거래소 · 곳간 스냅숏 · 사건 래치 · 소속 · 촌장 · 달력 · 몸)
//  ③ 원격 시세 0 — 멀리서 열면 안 열린다 · 열린 채 멀어지면 `prices = { none:'far' }` · 시세 수가 한 자리도 안 온다 ·
//     파일에 가격 함수 직접 호출 0(거래소 정본 `villageTradeBoard` 하나 — 게이트가 그 안에 있다)
//  ④ 뭉뚱그림 0 — 품목 자리(부탁 · 곳간 · 시세 · 시세 기준 · 공사 자재 · 행상 짐) 어디에도 `LUMPED` 품목 0 ·
//     [자명 통과 금지] 이 세계 곳간엔 뭉뚱그린 재화가 실제로 있고(`food`) 그것이 `withheld` 로 세어졌다 · 기준이 뭉뚱그린 것이면 `pick`
//  ⑤ 바뀐 칸만 — 안 바뀌면 안 보낸다 · 곳간을 움직이면 그 칸만 온다(머리줄은 안 온다) · 닫으면 더 안 온다
//  ⑥ 값 — 한 마을 열기 µs(평균 · 최대) · 박자 = 존의 5초
//  ⑦ [T1103] 마을 화면 말투 — 끝낸 일 · 값 오르내림 줄 = 하십시오체(`Events.newsLine`) · 화면 줄 표의 사건 종류 = 촌장 말 표(`LINES`) · ★[T1190 ②] 소식 줄은 촌장 말(하게체) 그대로
//  ②-T1084 없던 칸 중 셀 수 있는 둘 — 집터 `bedsGain` = econ `hutCapPerHut()`(= 침상 명부가 집 한 채에 더하는 수) ·
//     공사 줄 `kind:'clear'` = 개간 술어 정본(`villageViewSrc().needClear`) ∧ 농부 몸 · 밭 칸 수 · 개간 몸 수 · 술어가 거짓이면 줄 없음 · 고정 자료 같은 모양
//  ②-T1105 임시 vvAdapt 가 비워 둔 칸 중 셀 수 있는 셋 — 지역 이름 `head.region` = 그 존 `displayName` · 먹을 것 며칠치 `dash.foodDays` = 곳간 스냅숏 정본 ·
//     땔감 충당 몫 `dash.fuelCov`/`fuelShort` = econ `_fuelCov` · 값이 없으면 키 없음 · 회부 칸(인구 증감 · 겨울 % · 다음 일)은 키 없음 · 고정 자료 같은 모양
//  ②-T1116 창고 탭 — 하루 수요 `use` = econ `_consEMA` · 모자란 것/남는 것 줄 `store.short`/`glut` = 사건 장부 래치 전부(곳간이 바닥난 물건 포함) ·
//     값 래치 `priceUp`/`priceDown` = `detOf().up/down`(창을 못 채우면 키 없음) · 값 오르내림 줄 `store.priceMoves` = 장부 링의 지난 `PRICE_WIN` 날 값 사건 ·
//     값 수 싣지 않음 · 30날 시세 흐름은 키 없음(회부) · 고정 자료 같은 모양
//  ⑧ [T1169] 촌장 「일 맡기기」 칸 `members.assign` = `assignRoster`(촌장에게만 · 아니면 키 없음) · 진짜 문 `assign_job` 뒤 마을 화면 칸만(게시판 판 0) ·
//     화면 `vvAdapt` 「모자란 것」 = `store.short.rows`(바닥난 물건 포함) · `vvAssign` 판(고정 자료 · vm)
//  ⑨ [T1189 · 문 24] 겨울 준비(먹을 것 ÷ 겨울 끝까지 남은 날) · 마을 꼴 · kg · 시세 30날 고리(하루 한 줄 · 기준으로 나눔 · 멀면 없음 · econ 행 칸) ·
//     공사에 재료 가져오기(`village_site_give` — 짐 → 집터 실물 · 남은 몫까지 · 단계를 다 채우면 기여 +1 · 멀면 거절) · 화면 꼴(vm)
//
// 실행: node scripts/test-village-view.js   (존 한 벌을 이 프로세스 안에서 띄운다 · 마을 2곳)
'use strict';
// T1188: 기존 원석/OFF 계약. 광물별 켬은 test-t1188-ore-split이 검사.
process.env.T1188_ORE_SPLIT='0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codeOnly = require('./code-only.js');   // 주석 제거기 정본(사본 0)

const TMP = `/tmp/test-village-view-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(36000 + (process.pid % 800));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1'; process.env.VILLAGE_MAX = process.env.VILLAGE_MAX || '2';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
// ★[자명 통과 금지] 부탁 · 소식이 빈 첫날 세계로는 ② 대조가 빈 줄끼리 같다 — 게임일을 짧게 두고 의뢰 · 소식이 설 때까지 며칠 굴린 뒤 얼린다.
process.env.VILLAGE_DAY_MS = process.env.VILLAGE_DAY_MS || '2500';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const V = H.SimVillages, VV = H.VillageView, Ev = H.Events;
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'village-view.json'), 'utf8'));

const sent = [];
const mkP = (x, y) => ({ pid: `p_t1072_${process.pid}`, playerId: `anon_t1072_${process.pid}`, name: '나그네', persistent: false,
  x, y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
  inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
  isNpc: false, isDown: false, vx: 0, vy: 0,
  ws: { readyState: 1, send: (s) => { try { sent.push(JSON.parse(s)); } catch (e) {} } } });
const msgs = (t) => sent.filter((m) => m.type === t);
const lastView = () => { const a = msgs('village_view'); return a[a.length - 1] || null; };
const ITEM_KEYS = (view) => {   // 품목이 서는 자리 전부(④)
  const out = [];
  const add = (where, r) => { if (r != null) out.push([where, r]); };
  for (const r of (view.requests && view.requests.rows) || []) { add('requests.res', r.res); add('requests.rewRes', r.rewRes); }
  for (const r of (view.store && view.store.rows) || []) add('store.res', r.res);
  const P = view.prices || {};
  for (const r of P.rows || []) add('prices.res', r.res);
  for (const r of P.basis || []) add('prices.basis', r.res);
  add('prices.numeraire', P.numeraire);
  for (const p of (view.projects && view.projects.now) || []) { for (const n of p.need || []) add('projects.need', n.res); for (const c of p.cargo || []) add('projects.cargo', c.res); }
  return out;
};

(async () => {
  say('\n=== 마을 화면 자료 villageView (T1072) — 칸 = 서버 값 · 원격 시세 0 · 뭉뚱그림 0 ===');

  // ═══ ⓪ 전제 ═══
  say('\n⓪ 전제');
  let list = [];
  for (let i = 0; i < 150; i++) { list = V.clientVillages ? V.clientVillages() : []; if (list && list.length) break; await sleep(1000); }
  ok(list.length > 0, '마을 시딩을 기다렸다', `${list.length}곳`);
  const CV = list[0], VID = CV.id, AX = CV.cx * 32 + 16, AY = CV.cy * 32 + 16;
  // 세계를 며칠 굴린다 — 가뭄 하나(테스트 전용 손 `__e2eForceDeed` · 상황만 세운다 · 사건은 장부가 스스로 낸다) → 소식이 설 때까지.
  const fd0 = V.__e2eForceDeed(VID, '가뭄');
  let rolled = 0;
  for (let i = 0; i < 60; i++) { const b = V.villageBoard(VID, AX, AY); if (!b.err && b.news.length && V.villageViewSrc(VID).day >= 3) break; await sleep(1000); rolled++; }
  V.__e2eDayFreeze(true);   // 여기서 econ 날을 얼린다 — 아래 대조가 같은 날을 본다
  // 부탁 — 장부의 **복구 문**(`ledger.loadRequest` — 재기동이 DB 진척을 되돌리는 그 문)으로 둘을 건다: 갚는 것이 구체(돌) · 뭉뚱그린 것(곡식).
  //   자연 발생 의뢰는 거의 곡식으로 갚아 ② 의 "게시판 문장 그대로" 갈래가 빈 대조가 된다(실측 · 보고 §⑥).
  const L0 = V.villageViewSrc(VID).ledger, d0 = V.villageViewSrc(VID).day;
  const lr = [L0.loadRequest(VID, { item: 'wood', qty: 12, filled: 5, rewItem: 'stone', rewQty: 3, day: d0 }),
              L0.loadRequest(VID, { item: 'hide', qty: 4, filled: 0, rewItem: 'food', rewQty: 2, day: d0 })];
  const b0 = V.villageBoard(VID, AX, AY);
  const concreteReq = (b) => b.rows.some((r) => !VV.isLumped(r.item));
  ok(!b0.err && lr.every(Boolean) && concreteReq(b0) && b0.news.length > 0, '[자명 통과 금지] 구체 품목 부탁 · 소식이 실제로 선 세계에서 잰다', `${fd0.kind || fd0.err} · ${rolled}초 · 부탁 ${b0.rows.length} · 소식 ${b0.news.length} · econ ${V.villageViewSrc(VID).day}일`);
  const src = V.villageViewSrc(VID);
  ok(!!(src && src.vil && src.vil.econ), '정본 손잡이 `villageViewSrc` 가 그 마을을 준다', src ? src.vil.name : '없음');
  H.__e2eFreezeZoneDay && H.__e2eFreezeZoneDay(true);
  const p = mkP(AX, AY);
  H.players.set(p.pid, p);
  const send = (o) => H.handlePlayerInput(p, Buffer.from(JSON.stringify(o)));

  // ═══ ① 열기 ═══
  say('\n① 열기 — 진짜 메시지 문으로');
  send({ type: 'village_view', vid: VID });
  const m1 = lastView();
  ok(!!(m1 && m1.full === true && m1.vid === VID && m1.seq === 1), '열면 `full:true` 한 통(vid · seq 1)', m1 ? `seq ${m1.seq}` : '안 왔다');
  const view = m1 ? m1.view : {};
  ok(VV.SLOTS.every((k) => k in view) && Object.keys(view).length === VV.SLOTS.length, `칸 ${VV.SLOTS.length}개 — ${VV.SLOTS.join(' · ')}`, Object.keys(view).join(','));
  ok(JSON.stringify(Object.keys(FIX.view).sort()) === JSON.stringify(VV.SLOTS.slice().sort()), '고정 자료(test/fixtures/village-view.json)와 같은 칸 이름');
  ok(VV.isOpen(p), '열림 표지가 섰다');

  // ═══ ② 칸 = 서버 값 ═══
  say('\n② 칸 = 서버 값(정본을 따로 불러 대조)');
  const vil = src.vil, day = V.villageViewSrc(VID).day;
  {
    const c = Ev.calendarOf(day);
    ok(view.head.name === vil.name && view.head.vid === VID && view.head.day === day, '머리줄 — 이름 · 날 = 마을 몸 · 세계 날', `${view.head.name} · ${view.head.day}`);
    ok(view.head.cal.label === c.label && view.head.cal.season === c.season && view.head.cal.dayOfSeason === c.dayOfSeason, '계절 = 달력 정본 `calendarOf`', view.head.cal.label);
    ok(view.head.age === day - (vil.econ.foundedDay | 0), '며칠째 = 날 − 창설일(econ `foundedDay`)', String(view.head.age));
    const ch = H.VillageKin ? H.VillageKin.chiefOf(vil) : require(path.join(ROOT, 'server', 'village-kin')).chiefOf(vil);
    ok(JSON.stringify(view.head.chief) === JSON.stringify(ch ? { name: ch.name || null, npc: !!ch.npc } : null), '촌장 = `village-kin.chiefOf`', JSON.stringify(view.head.chief));
  }
  {
    const ps = H.Membership.publicState(p, vil);
    const Onb = require(path.join(ROOT, 'server', 'onboarding'));
    ok(view.me.contrib === ps.contrib && view.me.need === ps.need && view.me.need === H.Membership.CFG.N_MEMBER, '가입 계량기 = `membership.publicState`(n / 문턱)', `${view.me.contrib}/${view.me.need}`);
    ok(view.me.contrib === (Onb.stateOf(p.playerId).contrib | 0), '계량기는 하나 — `onboarding.contrib` 그 값');
    ok(view.me.member === false, '나그네는 이 마을 사람이 아니다');
    ok(view.me.left === Math.max(0, ps.need - ps.contrib), '남은 기여 = 문턱 − 기여(서버가 낸다)', String(view.me.left));
  }
  {
    ok(view.dash.pop === vil.econ.npcs.length, '사는 사람 = econ 인구', String(view.dash.pop));
    const w = view.dash.toWinter;
    const good = w === 0 ? Ev.calendarOf(day).season === 'winter' : (Ev.calendarOf(day + w).season === 'winter' && Ev.calendarOf(day + w - 1).season !== 'winter');
    ok(Number.isInteger(w) && good, '겨울까지 = 달력 정본에서 다음 겨울 첫날까지', `${w}일 (${Ev.calendarOf(day + w).label})`);
    ok(view.dash.projectsN === view.projects.now.length, '하고 있는 일 수 = 공사 칸 줄 수', String(view.dash.projectsN));
  }
  {
    const b = V.villageBoard(VID, p.x, p.y);
    const want = b.rows.filter((r) => !VV.isLumped(r.item));
    ok(view.requests.rows.length === want.length && view.requests.rows.length + view.requests.withheld === b.rows.length, '부탁 = 게시판 정본 줄(뭉뚱그린 것만 빠지고 센다)', `${view.requests.rows.length} + 뺀 ${view.requests.withheld} = ${b.rows.length}`);
    ok(view.requests.rows.length > 0, '부탁 칸이 실제 줄로 대조됐다(빈 줄끼리 같음이 아니다)', `${view.requests.rows.length}줄 · 뺀 ${view.requests.withheld}`);
    ok(view.requests.rows.every((r, i) => r.res === want[i].item && r.qty === want[i].qty && r.filled === want[i].filled && r.remain === want[i].remain
      && (VV.isLumped(want[i].rewItem) ? !('line' in r) && !('rewRes' in r) : (r.line === want[i].line && r.rewRes === want[i].rewItem && r.rewQty === want[i].rewQty))),
      '부탁 줄마다 품목 · 양 · 모인 몫 = 게시판 그대로 · 갚는 것이 뭉뚱그린 것이면 갚는 칸 · 문장 없음(아니면 게시판 문장 그대로)', `갚는 칸 뺀 줄 ${view.requests.rewardWithheld}`);
    const nw = b.news.filter((r) => !VV.isLumped(r.item));
    //   ★[T1190 ② · 문 25 ② ㄴ] 줄 = 촌장 말(하게체) 그대로 — 게시판 소식과 사건 · 들은 날 · 소문 출처 · 줄 수 · **문장까지** 같다(종전 T1103 화면용 하십시오체는 걷었다)
    const vn = V.villageViewNews(VID).filter((r) => !VV.isLumped(r.item));
    ok(view.news.rows.length === nw.length && view.news.rows.every((r, i) => r.type === nw[i].type && r.day === nw[i].day && r.heard === nw[i].heard && r.from === (nw[i].from || null) && r.line === vn[i].line && vn[i].type === nw[i].type),
      '소식 = 게시판 소식(소문 가시성 `visibleEvents`)과 같은 사건 · 같은 줄 수 — 줄은 `villageViewNews`', `${view.news.rows.length}줄 · 뺀 ${view.news.withheld}`);
    ok(view.news.rows.length > 0 && view.news.rows.every((r, i) => r.line === nw[i].line),
      '[T1190 ② · 자명 통과 금지] 소식 줄 = 촌장 말(하게체 `Events.briefLine`) 그대로 — 게시판 줄과 글자까지 같다', view.news.rows.slice(0, 2).map((r) => r.line).join(' / '));
    ok(view.news.rows.some((r) => !/니다\.$/.test(r.line)), '[T1190 ②] 화면용 하십시오체로 바꾸지 않는다(…니다. 아닌 줄이 실제로 있다)', view.news.rows[0] && view.news.rows[0].line);
  }
  {
    const bodies = (vil.npcPids || []).map((pid) => H.players.get(pid)).filter(Boolean);
    ok(view.members.n === bodies.length && view.members.people.length === bodies.length, '구성원 수 = 마을 명부의 몸', String(view.members.n));
    const byPid = new Map(bodies.map((b) => [b.pid, b]));
    ok(view.members.people.every((q) => { const b = byPid.get(q.pid); return b && q.name === b.name && q.job === (b.simJob || null) && q.act === (b._lifeAct || '') && q.jobKo === (b.simJob ? (H.JOB_KR_NPC[b.simJob] || null) : null); }),
      '사람 칸마다 이름 · 직업 · 지금 하는 일(행위 라벨 `_lifeAct`) = 몸 그대로');
    ok(view.members.byJob.reduce((a, r) => a + r.n, 0) === bodies.filter((b) => b.simJob).length, '직업별 수의 합 = 직업 있는 몸 수');
    ok(view.members.people.every((q) => !/[\p{Extended_Pictographic}\uFE0F\u200D]/u.test(q.name || '')),
      '★[T1164] NPC 이름은 표지 이모지 없는 이름 문자열이다');
    ok(view.members.byJob.every((r) => typeof r.ko === 'string' && r.ko.length > 0),
      '★[T1164] 직업별 줄의 우리말 이름 누락 0', view.members.byJob.filter((r) => !r.ko).map((r) => r.job).join(',') || '누락 0');
    ok(view.members.people.filter((q) => q.chief).length <= 1, '촌장 표지는 많아야 한 사람');
  }
  {
    const inv = V.playerVillageInventory(vil);
    const all = [].concat(...inv.groups.map((g) => g.items));
    const L = V.villageViewSrc(VID).ledger;
    ok(view.store.rows.length + view.store.withheld === all.length, '곳간 줄 + 뺀 줄 = 곳간 스냅숏(`playerVillageInventory`)', `${view.store.rows.length} + ${view.store.withheld} = ${all.length}`);
    ok(view.store.rows.every((r) => { const it = all.find((x) => x.r === r.res); const d = L.detOf(VID, r.res); return it && r.qty === it.q && r.short === !!(d && d.short) && r.glut === !!(d && d.glut); }),
      '곳간 줄마다 양 = 스냅숏 · 모자람/넘침 = 사건 장부 래치(`detOf`)');
    ok(view.store.shortDays === L.cfg.SHORT_DAYS && view.store.glutDays === L.cfg.GLUT_DAYS, '넉넉함 기준 = 사건 장부 정본(SHORT_DAYS · GLUT_DAYS)', `${view.store.shortDays} · ${view.store.glutDays}`);
  }
  {
    const n0 = (V.villageViewSrc(VID).world.caravans || []).filter((c) => c && !c._done && c.from === vil.econ).length;
    const pv = view.projects.now;
    ok(pv.filter((x) => x.kind === 'caravan').length === n0, '행상 줄 = 이 마을에서 떠난 캐러밴(econ `world.caravans`)', String(n0));
    ok(!!vil._site === pv.some((x) => x.kind === 'house') && (!vil._site || pv.find((x) => x.kind === 'house').stage === (vil._site.stage | 0)), '집터 줄 = 마을 집터(`_site`) · 단계 그대로', vil._site ? `단계 ${vil._site.stage}` : '집터 없음');
    {   // ★[T1103] 자재 줄 `give` = 그 자재로 들어가는 내 물건(기부 문 정본 `playerVillageDepositMap` 그대로)
      const dm = V.playerVillageDepositMap(), hs = pv.find((x) => x.kind === 'house');
      const rowsN = (hs && hs.need) ? hs.need : [];
      ok(rowsN.every((n) => Array.isArray(n.give) && n.give.every((it) => dm[it] === n.res) && Object.keys(dm).filter((it) => dm[it] === n.res).length === n.give.length),
        '[T1103] 집터 자재 줄 `give` = 기부 문이 그 자재로 받는 물건 키 전부', rowsN.length ? rowsN.map((n) => `${n.res}←${n.give.join('/')}`).join(' · ') : '(자재 줄 없음 — 집 행위 끔 판)');
    }
    const ch = V.villageChronicle(VID, p.x, p.y);
    const built = [].concat(...ch.seasons.map((b) => b.items)).filter((x) => x.type === 'BUILT');
    ok(view.projects.done.length === built.length, '끝낸 일 = 연대기의 완공(`BUILT`)', String(built.length));
    ok(view.projects.done.every((d) => /니다\.$/.test(d.line)), '[T1103] 끝낸 일 줄 = 하십시오체(`Events.newsLine`)', view.projects.done.length ? view.projects.done[0].line : '(완공 없음)');
  }
  // ── ②-T1084 없던 칸 중 셀 수 있는 둘 — 집터 `bedsGain` · 공사 줄 `kind:'clear'` ──
  say('\n②-T1084 없던 칸 중 셀 수 있는 것(새 칸만)');
  {
    const E = V.villageViewSrc(VID).E, VL = require(path.join(ROOT, 'server', 'village-layout.js'));
    const pv = view.projects.now, hs = pv.find((x) => x.kind === 'house');
    ok(!!hs, '[자명 통과 금지] 이 세계에 마을 집터 줄이 실제로 있다', vil._site ? `단계 ${vil._site.stage}` : '집터 없음');
    ok(!!hs && hs.bedsGain === E.hutCapPerHut() && hs.bedsGain > 0, '다 지으면 늘어나는 침상 = econ 정본 `hutCapPerHut()`', hs ? String(hs.bedsGain) : '-');
    ok(!!hs && VL.HOUSE_MAX_FLOORS === 1 && hs.bedsGain === VL.HOUSE_CAP_PER_FLOOR, '그 수 = 침상 명부 `_mapBedsOf` 가 집 한 채(단층 · `_houseCells` 한 칸)에 더하는 층당 정원', `${VL.HOUSE_CAP_PER_FLOOR} × 층 ${VL.HOUSE_MAX_FLOORS}`);
    ok(pv.filter((x) => x.kind !== 'house').every((x) => !('bedsGain' in x)), '의뢰 집터 · 행상 줄엔 침상 키가 없다(마을 침상 명부 밖)');
    const nc = V.villageViewSrc(VID).needClear();
    const farmer = (vil.npcPids || []).some((pid) => { const b = H.players.get(pid); return b && b.simJob === 'farmer'; });
    const cl = pv.filter((x) => x.kind === 'clear');
    ok(cl.length === ((nc && farmer) ? 1 : 0), '밭 일구기 줄 = 개간 술어 정본(`_lifeNeedClear`) ∧ 농부 몸 — 개간 두 길의 문 그대로', `술어 ${nc} · 농부 ${farmer} · 줄 ${cl.length}`);
    // [자명 통과 금지] 술어가 참이고 농부가 있는 마을에서 그 줄을 실제로 본다(첫 마을이 아니면 그 마을 중심에 선 둘째 사람으로 연다 — 같은 게이트)
    //   사흘 세계에선 밭이 이미 목표를 채워 술어가 거짓일 수 있다(실측: 농부 마을 밭 58칸 · 술어 거짓) — 그때는 그 마을 밭 칸을 **잠시 덜어**
    //   정본 술어가 참이 될 때까지 한 칸씩 묻는다(문턱 · 목표 식을 옮겨 적지 않는다 · 동기 구간이라 존 틱이 끼지 않는다 · 끝에 그대로 되돌린다).
    const hasFarmer = (w) => (w.npcPids || []).some((pid) => { const b = H.players.get(pid); return b && b.simJob === 'farmer'; });
    let CW = null, lifted = [];
    for (const c of list) { const s2 = V.villageViewSrc(c.id); if (s2 && s2.needClear() && hasFarmer(s2.vil)) { CW = c; break; } }
    if (!CW) for (const c of list) {
      const s2 = V.villageViewSrc(c.id); if (!s2 || !hasFarmer(s2.vil) || !s2.vil._farmSet) continue;
      for (const k of [...s2.vil._farmSet]) { if (s2.needClear()) break; s2.vil._farmSet.delete(k); lifted.push(k); }
      if (s2.needClear()) { CW = c; break; }
      for (const k of lifted) s2.vil._farmSet.add(k); lifted = [];
    }
    ok(!!CW, '[자명 통과 금지] 개간 술어가 참이고 농부가 있는 마을에서 잰다', CW ? `${CW.name}${lifted.length ? ` (밭 ${lifted.length}칸을 잠시 덜어 술어를 세웠다)` : ''}` : `${list.length}곳 중 없음`);
    if (CW) {
      const q = mkP(CW.cx * 32 + 16, CW.cy * 32 + 16); q.pid += '_clear'; q.playerId += '_clear';
      const wv = V.villageViewSrc(CW.id).vil;
      const b1 = VV.build(q, CW.id), cl1 = b1.view ? b1.view.projects.now.filter((x) => x.kind === 'clear') : [];
      ok(cl1.length === 1 && cl1[0].fields === wv._farmSet.size && cl1[0].crew === (wv._clearCrew | 0) && Object.keys(cl1[0]).sort().join() === 'crew,fields,kind',
        '밭 일구기 줄 = 지금 밭 칸 수(`_farmSet`) · 지금 개간을 쥔 몸 수(`_clearCrew`) — 목표 칸 수는 싣지 않는다(술어 안의 식)', cl1[0] ? `${CW.name} 밭 ${cl1[0].fields} · 일꾼 ${cl1[0].crew}` : (b1.err || '-'));
      ok(!!b1.view && b1.view.dash.projectsN === b1.view.projects.now.length, '하고 있는 일 수에 밭 일구기도 든다(= 공사 줄 수)', b1.view ? String(b1.view.dash.projectsN) : '-');
      // 술어가 거짓이 되면 그 줄이 빠진다 — 곳간이 넉넉하면 개간을 멈추는 술어(정본에 묻는다 · 문턱을 옮겨 적지 않는다)
      const st = wv.econ.storage, f0 = st.food;
      st.food = 1e9;
      const off = V.villageViewSrc(CW.id).needClear(), v2 = VV.build(q, CW.id).view;
      ok(off === false && !v2.projects.now.some((x) => x.kind === 'clear') && v2.dash.projectsN === v2.projects.now.length, '술어가 거짓이면(곳간이 넉넉) 밭 일구기 줄이 없다(키 없음 규약)', `술어 ${off}`);
      st.food = f0;
      ok(VV.build(q, CW.id).view.projects.now.some((x) => x.kind === 'clear'), '되돌리면 다시 선다');
      for (const k of lifted) wv._farmSet.add(k);
    }
    const fn = FIX.view.projects.now, fh = fn.find((x) => x.kind === 'house'), fc = fn.find((x) => x.kind === 'clear');
    ok(!!(fh && Number.isInteger(fh.bedsGain) && fc && Object.keys(fc).sort().join() === 'crew,fields,kind' && FIX.view.dash.projectsN === fn.length), '고정 자료에도 같은 새 칸(집터 `bedsGain` · `kind:\'clear\'` 줄) — 세션12 가 같은 모양을 본다');
  }
  // ── ②-T1105 임시 vvAdapt 가 비워 둔 칸 중 셀 수 있는 것 — 지역 이름 · 먹을 것 며칠치 · 땔감 충당 몫 ──
  say('\n②-T1105 비어 있던 칸 중 셀 수 있는 것(새 칸만)');
  {
    const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
    const zid = V.villageViewSrc(VID).zoneId;
    ok(zid === process.env.ZONE_ID, '손잡이가 이 마을의 존을 준다(`villageViewSrc().zoneId` = 존 초기화 값)', String(zid));
    ok(typeof view.head.region === 'string' && view.head.region.length > 0 && view.head.region === ZC.ZONES[zid].displayName,
      '[자명 통과 금지] 지역 이름 = 그 존의 이름(`zone-config` `displayName`) — 빈 글자가 아니다', view.head.region);
    // 존을 모르는 판(헤드리스)이면 키가 없다 — 손잡이를 잠시 감싸 존 칸만 비운다(끝에 그대로 되돌린다)
    const src0 = V.villageViewSrc;
    V.villageViewSrc = (id) => { const s2 = src0(id); return s2 ? Object.assign({}, s2, { zoneId: null }) : s2; };
    let vz = null; try { vz = VV.build(p, VID).view; } finally { V.villageViewSrc = src0; }
    ok(!!vz && !('region' in vz.head), '존을 모르면 지역 이름 키가 없다(빈 글자로 채우지 않는다)');
    const inv = V.playerVillageInventory(vil);
    ok(Number.isFinite(view.dash.foodDays) && view.dash.foodDays === inv.foodDays, '먹을 것 며칠치 = 곳간 스냅숏 정본(`playerVillageInventory().foodDays`) 그대로', `${view.dash.foodDays}일치`);
    const fc = vil.econ._fuelCov;
    ok(Number.isFinite(fc), '[자명 통과 금지] econ 이 그날 땔감 충당 몫(`_fuelCov`)을 실제로 남긴 세계에서 잰다', String(fc));
    ok(view.dash.fuelCov === +fc.toFixed(2) && view.dash.fuelCov >= 0 && view.dash.fuelCov <= 1, '땔감 충당 몫 = econ `_fuelCov`(소수 둘째 자리 · 0..1)', String(view.dash.fuelCov));
    ok(view.dash.fuelShort === (view.dash.fuelCov < 1), '땔감 모자람 = 그 몫이 1 아래', String(view.dash.fuelShort));
    // [자명 통과 금지] 모자란 갈래 · 키 없음 갈래를 실제로 지난다 — econ 이 남긴 칸만 잠시 바꾸고 그대로 되돌린다
    vil.econ._fuelCov = 0.5;
    const vs = VV.build(p, VID).view.dash;
    delete vil.econ._fuelCov;
    const vn = VV.build(p, VID).view.dash;
    vil.econ._fuelCov = fc;
    ok(vs.fuelCov === 0.5 && vs.fuelShort === true, '땔감을 반만 땐 날이면 몫 0.5 · 모자람', JSON.stringify({ fuelCov: vs.fuelCov, fuelShort: vs.fuelShort }));
    ok(!('fuelCov' in vn) && !('fuelShort' in vn), 'econ 이 아직 몫을 안 남겼으면(첫 날 전) 두 키가 없다');
    const DASH_KEYS = ['foodDays', 'fuelCov', 'fuelShort', 'pop', 'projectsN', 'toWinter', 'winter'];   // ★[T1189 ①] 겨울 준비 줄(아래 ⑨)
    ok(Object.keys(view.dash).every((k) => DASH_KEYS.includes(k)) && !('popDelta' in view.dash) && !('workNext' in view.dash),
      '회부 칸(인구 증감 · 다음 일 한 줄)은 여전히 키가 없다 — 지어내지 않는다(겨울 준비는 T1189 ① 부터 선다)', Object.keys(view.dash).join(','));
    ok(view.dash.projectsN === view.projects.now.length, '지금 일 수 = 공사 줄 수 그대로(T1084 밭 일구기 줄 포함 · 이름 무변)', String(view.dash.projectsN));
    const FD = FIX.view.dash, FH = FIX.view.head;
    ok(typeof FH.region === 'string' && Number.isFinite(FD.foodDays) && Number.isFinite(FD.fuelCov) && typeof FD.fuelShort === 'boolean' && FD.fuelShort === (FD.fuelCov < 1)
      && Object.keys(FD).every((k) => DASH_KEYS.includes(k)), '고정 자료에도 같은 새 칸(`head.region` · `dash.foodDays` · `fuelCov` · `fuelShort`) — 세션12 가 같은 모양을 본다');
  }
  // ── ②-T1116 창고 탭 — 하루 수요 · 모자란 것/남는 것 줄 · 값 래치 · 값 오르내림 줄(새 칸만 · 새 수 0) ──
  say('\n②-T1116 창고 탭 — 모자란 것 · 남는 것 · 값 오르내림(새 칸만)');
  {
    const L = V.villageViewSrc(VID).ledger, cfg = L.cfg, ema = vil.econ._consEMA || {}, sto = vil.econ.storage || {};
    const inv = V.playerVillageInventory(vil), all = [].concat(...inv.groups.map((g) => g.items));
    const r2 = (x, n) => +(+x).toFixed(n);
    const S = view.store;
    const STORE_KEYS = ['glut', 'glutDays', 'priceMoves', 'rows', 'short', 'shortDays', 'withheld'];
    ok(JSON.stringify(Object.keys(S).sort()) === JSON.stringify(STORE_KEYS), '창고 칸 = 옛 넷(`rows` · `shortDays` · `glutDays` · `withheld`) + 새 셋(`short` · `glut` · `priceMoves`) — 옛 이름 무변', Object.keys(S).join(','));
    ok(S.rows.every((r) => ['res', 'ko', 'qty', 'daysOf', 'short', 'glut'].every((k) => k in r)), '곳간 줄의 옛 칸 여섯 그대로(`res` · `ko` · `qty` · `daysOf` · `short` · `glut`)');
    ok(S.rows.every((r) => { const e = +ema[r.res] || 0; return e > 0 ? (r.use === r2(e, 2) && r.daysOf === r2(r.qty / e, 1)) : (!('use' in r) && r.daysOf === null); }),
      '하루 수요 `use` = econ 소비 EMA(`_consEMA` · `daysOf` 의 분모 그대로) · 소비 0 이면 키 없음', S.rows.filter((r) => 'use' in r).slice(0, 3).map((r) => `${r.ko} ${r.use}/날`).join(' · '));
    // 모자람 · 넘침 줄 = 장부 래치 — 장부의 후보 집합(곳간 키 ∪ 소비 EMA 키 · `events.js itemsOf`)을 따로 훑어 대조한다
    const cand = [...new Set([...Object.keys(sto), ...Object.keys(ema)])].filter((r) => r.charCodeAt(0) !== 95);
    const want = (k) => cand.filter((r) => { const d = L.detOf(VID, r); return d && d[k]; });
    const chk = (k) => {
      const w = want(k), got = S[k];
      const wc = w.filter((r) => !VV.isLumped(r));
      return got.rows.length === wc.length && got.rows.length + got.withheld === w.length
        && got.rows.every((x) => { const it = all.find((y) => y.r === x.res), e = +ema[x.res] || 0; return wc.includes(x.res) && x.qty === (it ? it.q : 0) && x.daysOf === (e > 0 ? r2(x.qty / e, 1) : null) && (e > 0 ? x.use === r2(e, 2) : !('use' in x)); });
    };
    ok(chk('short') && chk('glut'), '모자란 것 · 남는 것 줄 = 사건 장부 래치(`detOf().short/glut`) 전부 · 양 = 곳간 스냅숏(없으면 0) · 며칠치 · 하루 수요 · 뭉뚱그린 것은 빼고 센다',
      `모자람 ${S.short.rows.length}(+뺀 ${S.short.withheld}) · 넘침 ${S.glut.rows.length}(+뺀 ${S.glut.withheld})`);
    ok(S.rows.every((r) => r.short === S.short.rows.some((x) => x.res === r.res) && r.glut === S.glut.rows.some((x) => x.res === r.res)), '곳간 줄의 `short`/`glut` 과 줄 목록이 같은 래치를 읽는다');
    // [자명 통과 금지] 곳간이 바닥난 물건(스냅숏에 없는 줄)의 모자람이 실제로 줄에 든다 — 소비가 있는 물건 하나의 곳간 칸을 잠시 비우고
    //   그 물건의 장부 래치를 잠시 세운다(장부는 하루 경계에만 래치를 고친다 · 날은 얼렸다 · 끝에 둘 다 그대로 되돌린다)
    const zr = Object.keys(ema).find((r) => r.charCodeAt(0) !== 95 && !VV.isLumped(r) && (+ema[r] || 0) > 0 && L.detOf(VID, r));
    ok(!!zr, '[자명 통과 금지] 소비가 있는 구체 물건이 이 세계에 있다', zr ? `${zr} 소비 ${ema[zr]}/날` : '없음');
    if (zr) {
      const d = L.detOf(VID, zr), was = d.short, had = Object.prototype.hasOwnProperty.call(sto, zr), q0 = sto[zr];
      sto[zr] = 0; d.short = true;
      let vz = null; try { vz = VV.build(p, VID).view.store; } finally { d.short = was; if (had) sto[zr] = q0; else delete sto[zr]; }
      const z = vz && vz.short.rows.find((x) => x.res === zr);
      ok(!!z && z.qty === 0 && z.daysOf === 0 && z.use === r2(ema[zr], 2) && !vz.rows.some((x) => x.res === zr), '바닥난 물건의 모자람 = 양 0 · 0일치 · 하루 수요 그대로(곳간 줄엔 없다 — 스냅숏이 빼는 줄)', z ? JSON.stringify(z) : '-');
      ok(JSON.stringify(VV.build(p, VID).view.store) === JSON.stringify(S), '곳간 · 래치를 되돌리면 창고 칸도 처음 그대로');
    }
    // 값 래치 — 장부가 자기평균 창(`PRICE_WIN`)만큼 지켜본 물건에서만 키가 선다
    ok(S.rows.every((r) => { const d = L.detOf(VID, r.res); const warm = !!d && (d.pN | 0) >= cfg.PRICE_WIN; return warm ? (r.priceUp === !!d.up && r.priceDown === !!d.down) : (!('priceUp' in r) && !('priceDown' in r)); }),
      '값 래치 `priceUp`/`priceDown` = 장부 `detOf().up/down` · 창(`PRICE_WIN`)을 못 채운 물건은 키 없음', `창 ${cfg.PRICE_WIN}날 · 키 선 줄 ${S.rows.filter((r) => 'priceUp' in r).length}/${S.rows.length}`);
    {
      const r0 = S.rows.find((r) => L.detOf(VID, r.res));
      const d = r0 && L.detOf(VID, r0.res), keep = d && { pN: d.pN, up: d.up, down: d.down };
      let vw = null;
      if (d) { d.pN = cfg.PRICE_WIN; d.up = true; d.down = false; try { vw = VV.build(p, VID).view.store.rows.find((x) => x.res === r0.res); } finally { Object.assign(d, keep); } }
      ok(!!vw && vw.priceUp === true && vw.priceDown === false, '[자명 통과 금지] 창을 채우고 오름 래치가 선 물건이면 `priceUp` 참 · `priceDown` 거짓(래치만 잠시 세웠다 되돌림)', r0 ? r0.ko : '-');
    }
    // 값 오르내림 줄 — 이 마을 장부 링(`ringOf`)의 PRICE_SPIKE/DROP · 지난 PRICE_WIN 날 · 새것부터 · 하십시오체
    const ring0 = L.ringOf(VID);
    const nat = ring0.filter((e) => (e.type === 'PRICE_SPIKE' || e.type === 'PRICE_DROP') && day - (e.day | 0) < cfg.PRICE_WIN && day - (e.day | 0) >= 0);
    ok(S.priceMoves.days === cfg.PRICE_WIN && S.priceMoves.rows.length + S.priceMoves.withheld === nat.length, '값 오르내림 줄 수 = 장부 링의 지난 창 값 사건 수(뭉뚱그린 것은 빼고 센다)', `${S.priceMoves.rows.length} + 뺀 ${S.priceMoves.withheld} = ${nat.length} · 창 ${S.priceMoves.days}날`);
    const W = cfg.PRICE_WIN;
    const inj = [
      { day: day - W, vid: VID, type: 'PRICE_SPIKE', item: 'wood', mag: 2.1, meta: { p: 1, avg: 0.5 } },   // 창 밖 — 안 든다
      { day: day - 7, vid: VID, type: 'PRICE_DROP', item: 'stone', mag: 0.08, meta: { p: 0.1, avg: 1.2 } },
      { day: day - 3, vid: VID, type: 'STOCK_SHORTAGE', item: 'stone', mag: 0.4, meta: {} },             // 값 사건이 아니다 — 안 든다
      { day: day - 2, vid: VID, type: 'PRICE_SPIKE', item: 'food', mag: 2.4, meta: { p: 3, avg: 1.2 } },  // 뭉뚱그린 것 — 빼고 센다
      { day: day - 1, vid: VID, type: 'PRICE_SPIKE', item: 'wood', mag: 2.2, meta: { p: 2, avg: 0.9 } },
    ];
    let pm = null;
    L.loadRing(VID, ring0.concat(inj));   // 장부의 복구 문(재기동이 DB 사건을 되돌리는 그 문) — 끝에 그대로 되돌린다
    try { pm = VV.build(p, VID).view.store.priceMoves; } finally { L.loadRing(VID, ring0); }
    const pr = pm ? pm.rows.filter((x) => x.day >= day - 7) : [];
    ok(!!pm && pr.length === 2 && pr[0].res === 'wood' && pr[0].type === 'PRICE_SPIKE' && pr[0].ago === 1 && pr[1].res === 'stone' && pr[1].type === 'PRICE_DROP' && pr[1].ago === 7
      && !pm.rows.some((x) => x.ago >= W) && pm.withheld === S.priceMoves.withheld + 1,
      '[자명 통과 금지] 링에 값 사건을 넣으면 — 창 안 것만 · 새것부터 · 값 아닌 사건 0 · 뭉뚱그린 것은 빼고 센다', pr.map((x) => `${x.ago}일 전 ${x.ko} ${x.type}`).join(' · '));
    ok(!!pm && pm.rows.every((x) => x.line === Ev.newsLine({ type: x.type, item: x.res }) && /니다\.$/.test(x.line)), '줄 = 같은 사건의 하십시오체(`Events.newsLine`)', pr.map((x) => x.line).join(' / '));
    ok(!!pm && pm.rows.every((x) => Object.keys(x).sort().join() === 'ago,day,ko,line,res,type'), '값 수(`mag` · `meta.p/avg` — 장부의 그림자가격 원값)는 싣지 않는다 — 시세는 거래소 정본 칸 하나', pm && pm.rows[0] ? Object.keys(pm.rows[0]).join(',') : '-');
    ok(JSON.stringify(L.ringOf(VID)) === JSON.stringify(ring0) && JSON.stringify(VV.build(p, VID).view.store) === JSON.stringify(S), '링을 되돌리면 창고 칸도 처음 그대로');
    ok(!('history' in S) && !('trend' in S) && S.rows.every((r) => !('trend' in r) && !('yesterday' in r)), '지난 날마다의 시세 줄(30날 흐름 · 어제보다)은 저장 칸이 없어 키가 없다 — 회부 T1116 1');
    const FS = FIX.view.store;
    ok(JSON.stringify(Object.keys(FS).sort()) === JSON.stringify(STORE_KEYS) && Array.isArray(FS.short.rows) && Array.isArray(FS.glut.rows) && Array.isArray(FS.priceMoves.rows) && Number.isInteger(FS.priceMoves.days)
      && FS.rows.some((r) => 'use' in r && 'priceUp' in r) && FS.short.rows.some((x) => x.qty === 0) && FS.priceMoves.rows.every((x) => Object.keys(x).sort().join() === 'ago,day,ko,line,res,type')
      && FS.rows.every((r) => r.short === FS.short.rows.some((x) => x.res === r.res) && r.glut === FS.glut.rows.some((x) => x.res === r.res)),
      '고정 자료에도 같은 새 칸(`use` · `priceUp`/`priceDown` · `short` · `glut` · `priceMoves`) — 세션12 가 같은 모양을 본다');
  }
  {
    const tb = V.villageTradeBoard(VID, p.x, p.y, p.inventory, 'wood');
    send({ type: 'village_view', vid: VID, numeraire: 'wood' });
    const P = lastView().view.prices;
    ok(lastView().full === true && P.numeraire === 'wood' && !P.pick, '기준 품목을 고르면 그 기준으로 통째 다시 온다(나무)', P.numeraireKo);
    const want = tb.rows.filter((r) => !VV.isLumped(r.res));
    ok(P.rows.length === want.length && P.rows.every((r, i) => r.res === want[i].res && r.num === want[i].num && r.glut === !!want[i].glut), '시세 = 거래소 정본(`villageTradeBoard`) 그대로 — 사본 0', `${P.rows.length}품목 · 뺀 ${P.withheld}`);
  }

  // ═══ ③ 원격 시세 0 ═══
  say('\n③ 원격 시세 0');
  {
    const far = mkP(AX + 4000, AY + 4000); far.pid += '_far'; far.playerId += '_far';
    H.players.set(far.pid, far);
    const n0 = sent.length;
    H.handlePlayerInput(far, Buffer.from(JSON.stringify({ type: 'village_view', vid: VID })));
    const got = sent.slice(n0);
    ok(!got.some((m) => m.type === 'village_view') && !VV.isOpen(far), '멀리서는 안 열린다(게시판과 같은 게이트)', JSON.stringify(got.map((m) => m.text || m.type)));
    H.players.delete(far.pid);
    p.x = AX + 4000; p.y = AY + 4000;
    const keys = VV.refresh(p);
    const m = lastView();
    ok(keys.includes('prices') && keys.includes('gate') && m.full === false && m.slots.gate.near === false, '열린 채 멀어지면 바뀐 칸 = 문 · 시세', keys.join(','));
    ok(JSON.stringify(m.slots.prices) === JSON.stringify({ none: 'far' }) && !/"num"/.test(JSON.stringify(m)), '멀면 시세 칸 = 없음 표시 · 시세 수 0');
    ok(VV.refresh(p).length === 0, '멀리 있는 동안은 다시 안 보낸다(나머지 칸은 마지막 값에서 멈춘다)');
    p.x = AX; p.y = AY;
    const k2 = VV.refresh(p);
    ok(k2.includes('prices') && lastView().slots.gate.near === true && Array.isArray(lastView().slots.prices.rows), '돌아오면 시세가 다시 온다', k2.join(','));
    const vsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'village-view.js'), 'utf8'));
    ok(!/pricesFresh|pricesOf|computeShadowPrices|Trade\.board/.test(vsrc) && /villageTradeBoard/.test(vsrc), '파일에 가격 함수 직접 호출 0 — 거래소 정본(게이트 안) 하나로만');
  }

  // ═══ ④ 뭉뚱그림 0 ═══
  say('\n④ 뭉뚱그림 0');
  {
    send({ type: 'village_view', vid: VID });
    const v4 = lastView().view;
    const keys = ITEM_KEYS(v4);
    const bad = keys.filter(([, r]) => VV.isLumped(r));
    ok(keys.length > 0 && bad.length === 0, '품목 자리 어디에도 뭉뚱그린 품목 0', `${keys.length}자리 · 걸린 것 ${bad.map((x) => x.join('=')).join(' ') || '없음'}`);
    const st = vil.econ.storage || {};
    const lumpedHeld = Object.keys(st).filter((r) => VV.isLumped(r) && (+st[r] || 0) > 0.005);
    ok(lumpedHeld.length > 0 && v4.store.withheld >= lumpedHeld.length, '[자명 통과 금지] 이 곳간엔 뭉뚱그린 재화가 실제로 있고, 그것이 빠지며 세어졌다', `${lumpedHeld.join(',')} → 뺀 ${v4.store.withheld}`);
    ok(v4.prices.pick === true && !('rows' in v4.prices) && Array.isArray(v4.prices.basis), '거래소 기본 기준(곡식 — 뭉뚱그린 것)이면 시세 수 없이 기준 고르기만', JSON.stringify(v4.prices).slice(0, 80));
  }

  // ═══ ⑤ 바뀐 칸만 ═══
  say('\n⑤ 바뀐 칸만');
  {
    ok(VV.refresh(p).length === 0, '안 바뀌면 안 보낸다');
    const row = lastView().view ? null : null; void row;
    const st = vil.econ.storage;
    const res = Object.keys(st).find((r) => !VV.isLumped(r) && r.charCodeAt(0) !== 95 && (+st[r] || 0) > 1);
    const was = st[res];
    st[res] = +((+was) + 7).toFixed(2);
    const keys = VV.refresh(p);
    ok(keys.includes('store') && !keys.includes('head') && !keys.includes('members') && !keys.includes('me'), `곳간(${res})을 움직이면 그 칸이 온다 — 머리줄 · 구성원 · 나는 안 온다`, keys.join(','));
    const m = lastView();
    ok(m.full === false && Object.keys(m.slots).every((k) => keys.includes(k)), '바뀐 칸 메시지는 바뀐 칸만 싣는다', Object.keys(m.slots).join(','));
    st[res] = was;
    VV.refresh(p);
    send({ type: 'village_view_close' });
    const n0 = sent.length;
    st[res] = +((+was) + 7).toFixed(2);
    VV.tickAll();
    ok(!VV.isOpen(p) && sent.length === n0, '닫으면 더 안 온다');
    st[res] = was;
  }

  // ═══ ⑥ 값 ═══
  say('\n⑥ 값 — 한 마을 열기');
  {
    const N = 40;
    const run = (memo) => { const us = []; for (let i = 0; i < N; i++) { const t0 = process.hrtime.bigint(); VV.build(p, VID, 'wood', memo); us.push(Number(process.hrtime.bigint() - t0) / 1e3); } us.sort((a, b) => a - b);
      return { avg: us.reduce((a, b) => a + b, 0) / N, p50: us[N >> 1], max: us[N - 1] }; };
    const full = run(null);
    const memo = {}; VV.build(p, VID, 'wood', memo);
    const again = run(memo);
    const bytes = JSON.stringify(VV.build(p, VID, 'wood').view).length;
    say(`    열기(정본 전부) ${N}번 — 평균 ${full.avg.toFixed(0)}µs · 가운데 ${full.p50.toFixed(0)}µs · 최대 ${full.max.toFixed(0)}µs · 통째 ${bytes}B · 인구 ${vil.econ.npcs.length}`);
    say(`    열린 동안 다시 읽기(시세 입력 그대로) ${N}번 — 평균 ${again.avg.toFixed(0)}µs · 가운데 ${again.p50.toFixed(0)}µs · 최대 ${again.max.toFixed(0)}µs · 박자 ${VV.TICK_MS}ms`);
    ok(full.avg > 0 && Number.isFinite(full.avg), '값을 쟀다(µs)', `${full.avg.toFixed(0)}µs`);
    ok(VV.TICK_MS === 5000, '열린 동안 박자 = 존의 5초(새 수 0)', `${VV.TICK_MS}ms`);
    // 지문이 낡은 값을 쥐지 않는다 — 곳간을 한 톨 움직이면 정본을 다시 부르고, 그 값은 따로 부른 정본과 같다
    const st = vil.econ.storage, res = Object.keys(st).find((r) => !VV.isLumped(r) && r.charCodeAt(0) !== 95 && (+st[r] || 0) > 1), was = st[res];
    st[res] = +((+was) * 0.5).toFixed(3);
    const v2 = VV.build(p, VID, 'wood', memo).view.prices, tb = V.villageTradeBoard(VID, p.x, p.y, p.inventory, 'wood');
    const want = tb.rows.filter((r) => !VV.isLumped(r.res));
    ok(v2.rows.every((r, i) => r.res === want[i].res && r.num === want[i].num), `지문 — 곳간(${res})이 움직이면 시세를 다시 부르고 정본과 같다(낡은 값 0)`);
    st[res] = was;
  }

  // ── ⑦ [T1103] 마을 화면 말투 — 화면 줄 표(`NEWS_LINES`)가 촌장 말 표(`LINES`)와 같은 사건 종류를 다 덮는다(빠지면 그 소식이 화면에서 조용히 사라진다) ──
  say('\n⑦ [T1103] 마을 화면 소식 줄 = 하십시오체 · 사건 종류 전부');
  {
    const Ev = require(path.join(ROOT, 'server', 'events.js'));
    const a = Ev.LINE_TYPES.slice().sort(), b = Ev.NEWS_LINE_TYPES.slice().sort();
    ok(a.length > 10 && JSON.stringify(a) === JSON.stringify(b), '화면 줄 표의 사건 종류 = 촌장 말 표의 사건 종류', `${b.length} / ${a.length}`);
    const samples = [];
    for (const t of a) for (const ev of [{ type: t, item: 'wood' }, { type: t, item: 'granary' }, { type: t, item: '가뭄' }, { type: t, item: 'village' }, { type: t, item: '도미' }, { type: t, item: 'wood', meta: { season: 'spring' } }]) samples.push([ev, Ev.newsLine(ev), Ev.briefLine(ev)]);
    const bad = samples.filter(([, l]) => !(/니다\.$/.test(l)) || /[네군세이]\.$/.test(l));
    ok(!bad.length, '모든 사건 · 품목 갈래에서 줄이 …니다. 로 끝난다(하게체 끝 0)', bad.length ? bad.slice(0, 3).map(([e, l]) => `${e.type}:${l}`).join(' / ') : `${samples.length}갈래`);
    ok(samples.some(([, l, br]) => l !== br) && samples.every(([, , br]) => typeof br === 'string'), '[자명 통과 금지] 촌장 말(`briefLine`)은 그대로 하게체 — 두 표가 실제로 다르다', samples[0][2]);
    ok(!/[0-9]/.test(samples.map(([, l]) => l).join('')), '화면 줄도 수치를 읊지 않는다(`LINES` 와 같은 계약)');
  }

  // ── ⑧ [T1169 · K18] 촌장 「일 맡기기」 칸 `members.assign` · 화면 「모자란 것」 = `store.short.rows` ──
  say('\n⑧ [T1169] 촌장 일 맡기기 칸 · 모자란 것 줄(화면)');
  {
    p.x = AX; p.y = AY;
    const v0 = VV.build(p, VID, 'wood').view;
    ok(!!v0 && !('assign' in v0.members) && !(v0.me && v0.me.chief), '촌장이 아니면 `members.assign` 키 없음(옛 바이트)', v0 ? Object.keys(v0.members).join(',') : '없음');
    const was = { founder: vil.econ.founder, kin: vil._kin };
    vil.econ.founder = p.playerId; if (vil._kin) vil._kin = Object.assign({}, vil._kin, { chief: p.playerId });   // `__e2e_chief` 와 같은 판 꾸밈
    const v1 = VV.build(p, VID, 'wood').view, R = V.assignRoster(vil), JK = H.JOB_KR_NPC;
    const want = { rows: R.rows.map((x) => Object.assign(x, { jobKo: JK[x.job] || x.job })), jobs: R.jobs.map((x) => Object.assign(x, { ko: JK[x.job] || x.job })), cooldown: R.cooldown };
    ok(!!(v1.me && v1.me.chief) && JSON.stringify(v1.members.assign) === JSON.stringify(want), '촌장이면 `members.assign` = `SimVillages.assignRoster`(게시판 판 T1085 명부와 같은 자료) + 이름표', v1.members.assign ? `줄 ${v1.members.assign.rows.length} · 일 ${v1.members.assign.jobs.length} · 쿨다운 ${v1.members.assign.cooldown}` : '없음');
    ok(want.rows.length > 0 && want.jobs.some((j) => j.open), '[자명 통과 금지] 명부에 사람 · 빈자리 있는 일이 실제로 있다', `${want.rows.length} · ${want.jobs.filter((j) => j.open).map((j) => j.job).join(',')}`);
    // 진짜 문으로 맡긴다 — 열린 마을 화면이면 그 화면의 칸만 다시 오고 게시판 판(`village_board`)은 안 온다
    send({ type: 'village_view', vid: VID });
    const pick = want.rows.find((r) => !r.away && !r.left && want.jobs.some((j) => j.open && j.job !== r.job));
    const job = pick && want.jobs.find((j) => j.open && j.job !== pick.job).job;
    const nB = msgs('village_board').length, nV = msgs('village_view').length, nN = msgs('notice').length;
    if (pick) send({ type: 'assign_job', vid: VID, npc: pick.id, job });
    await sleep(50);
    const nt = msgs('notice').slice(nN).map((m) => m.text), vs = msgs('village_view').slice(nV);
    const done = nt.some((t) => /일을 맡겼습니다/.test(t));
    ok(!!pick && done, '「일 맡기기」 = `assign_job` 그 문 — 서버가 맡겼다(알림 한 줄)', JSON.stringify([pick && pick.id, job, nt]));
    ok(msgs('village_board').length === nB, '마을 화면이 열려 있으면 맡긴 뒤 게시판 판을 안 보낸다(종전: `tryVillageBoard` → 옛 판이 떴다)', `${msgs('village_board').length - nB}통`);
    const sl = vs.find((m) => !m.full && m.slots && m.slots.members);
    const nr = sl && sl.slots.members.assign && sl.slots.members.assign.rows.find((r) => r.id === pick.id);
    ok(!!(nr && nr.job === job && nr.chief && nr.left > 0), '맡긴 뒤 마을 화면의 `members` 칸만 다시 온다 — 그 사람 = 새 일 · 촌장이 맡김 · 남은 날', nr ? JSON.stringify(nr) : JSON.stringify(vs.map((m) => Object.keys(m.slots || m.view || {}))));
    send({ type: 'village_view_close' });
    vil.econ.founder = was.founder; vil._kin = was.kin;
    // 화면(클라 `vvAdapt` · `vvAssign`) — 고정 자료로 · 최상위 실행문 0 이라 선언만 읽힌다
    const vm = require('vm');
    const C = vm.createContext({ location: { search: '' }, URLSearchParams, document: {}, CSS: { escape: (x) => x } });
    const F = vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'client', '52-v-village-view.js'), 'utf8') + '\n;({ vvAdapt, vvAssign })', C);
    const A = F.vvAdapt(FIX.view), FS2 = FIX.view.store;
    ok(JSON.stringify(A.store.short.map((x) => x.res)) === JSON.stringify(FS2.short.rows.map((r) => r.res)) && FS2.short.rows.some((r) => r.qty === 0 && !FS2.rows.some((q) => q.res === r.res)),
      '★화면 「모자란 것」 = 서버 `store.short.rows`(곳간 줄에 없는 바닥난 물건 포함 — 종전 `rows[].short` 거르기는 못 봤다)', A.store.short.map((x) => `${x.item}:${x.why}`).join(' · '));
    ok(A.store.short.find((x) => x.res === 'hide').why === '곳간에 없습니다' && A.store.short.find((x) => x.res === 'stone').why === '3.1일치 남았습니다 · 값 ▲', '바닥난 줄 = "곳간에 없습니다" · 나머지 = "n일치 남았습니다"(서버 값 그대로 · ★T1189 ⑧ 값 래치가 선 물건은 " · 값 ▲")');
    const noShort = JSON.parse(JSON.stringify(FIX.view)); delete noShort.store.short;
    ok(JSON.stringify(F.vvAdapt(noShort).store.short.map((x) => x.res)) === JSON.stringify(FS2.rows.filter((r) => r.short).map((r) => r.res)), '칸이 없는 옛 서버면 종전 거르기(`rows[].short`)');
    const h = F.vvAssign(A.members.assign), FA = FIX.view.members.assign;
    const rowsH = (h.match(/data-vv-npc="/g) || []).length, btnH = (h.match(/data-vv="assign"/g) || []).length;
    ok(rowsH === FA.rows.length && btnH === FA.rows.filter((r) => !r.away && !r.left).length && /자리 없음/.test(h) && /원정 중/.test(h) && /12일 뒤 · 촌장이 맡김/.test(h) && /30일 동안/.test(h),
      '「일 맡기기」 판 — 줄 = 명부 · 단추 = 맡길 수 있는 사람만 · 형편(원정 중 · n일 뒤 · 촌장이 맡김) · 빈자리 없음 표시 · 쿨다운 = 서버 값', `줄 ${rowsH} · 단추 ${btnH}`);
    ok(F.vvAssign(null) === '' && F.vvAdapt(Object.assign({}, FIX.view, { members: Object.assign({}, FIX.view.members, { assign: undefined }) })).members.assign === null, '키가 없으면 판을 안 그린다');
  }

  // ── ⑨ [T1189 · 문 24] 마을 화면 빈칸 — 겨울 준비 · 부제 · 재료 가져오기 · 시세 30날 · 단위 ──
  say('\n⑨ [T1189] 마을 화면 빈칸(겨울 준비 · 마을 꼴 · 재료 가져오기 · 시세 30날 · kg)');
  {
    p.x = AX; p.y = AY;
    const v9 = VV.build(p, VID, 'wood').view, d9 = V.villageViewSrc(VID).day;
    // ① 겨울 준비 = 먹을 것 며칠치 ÷ 겨울 끝까지 남은 날(달력 정본으로 따로 셈)
    const c9 = Ev.calendarOf(d9);
    const need = c9.season === 'winter' ? c9.seasonDays - c9.dayOfSeason + 1 : VV.toWinter(d9) + Ev.calendarOf(d9 + VV.toWinter(d9)).seasonDays;
    const w = (v9.dash.winter || [])[0];
    ok(!!w && w.need === need && w.days === v9.dash.foodDays && w.frac === +Math.min(1, v9.dash.foodDays / need).toFixed(2) && w.short === (v9.dash.foodDays < need) && w.label === '먹을 것',
      '① 겨울 준비 = 먹을 것 며칠치(`foodDays`) ÷ 겨울 끝까지 남은 날(달력 정본) · 1 에서 멈춤 · 모자람', JSON.stringify(w));
    ok(!(v9.dash.winter || []).some((x) => /땔감/.test(x.label)), '① 땔감은 겨울 준비 줄에 안 섞는다(오늘 땔감 `fuelCov` 따로)');
    // ② 마을 꼴 = 회관 행 꼬리표 낱말
    ok(typeof v9.head.kindKo === 'string' && ['농촌', '어촌', '광산', '임업'].includes(v9.head.kindKo) && v9.head.kindKo === vil._kindKo,
      '② 마을 꼴 = 회관 행 꼬리표(`t593`/`seedType`)의 이름 낱말(지금 이름이 쓰는 넷)', `${v9.head.region} ${v9.head.kindKo} · ${vil.name}`);
    // ⑦ 단위 = 낱개 · kg(무게 정본)
    const W9 = require(path.join(ROOT, 'server', 'weights.js'));
    const kgOk = v9.store.rows.filter((r) => W9.kgOf(r.res) > 0);
    ok(kgOk.length > 0 && kgOk.every((r) => r.kg === +(r.qty * W9.kgOf(r.res)).toFixed(1)), '⑦ 곳간 줄 kg = 낱개 × 무게 정본 `weights.kgOf`', kgOk.slice(0, 3).map((r) => `${r.ko} ${r.qty}개 ${r.kg}kg`).join(' · '));
    // ⑥ 시세 30날 고리 — 하루 한 줄(거래소 정본 값) · 고른 기준으로 나눔 · 멀면 없음
    const E9 = vil.econ;
    delete E9._t1189Px;
    V.t1189PxRecord();
    const ring = E9._t1189Px || [];
    const P9 = Ev.pricesFresh(require(path.join(ROOT, 'sim', 'economy-sim-v2.js')), E9);
    ok(ring.length === 1 && ring[0].d === d9 && Object.keys(ring[0].p).length > 0 && Object.entries(ring[0].p).every(([r, x]) => x === +(+P9[r]).toPrecision(4)),
      '⑥ 하루 한 줄 = 그날 거래소 정본 시세(`pricesFresh`) 받아 적기(유효 숫자 넷)', `${ring.length}줄 · 품목 ${ring[0] ? Object.keys(ring[0].p).length : 0}`);
    V.t1189PxRecord();
    ok(ring.length === 1, '⑥ 같은 날 두 번 적으면 그날 줄을 갈아 끼운다(한 날 한 줄)');
    for (let i = 1; i <= 34; i++) ring.unshift({ d: d9 - i, p: Object.assign({}, ring[0].p) });
    V.t1189PxRecord();   // 적을 때 창을 넘는 옛 줄을 덜어 낸다
    ok(ring.length === Ev.CFG.PRICE_WIN && ring[ring.length - 1].d === d9, `⑥ 고리 길이 = 장부 30날 창(\`PRICE_WIN\` ${Ev.CFG.PRICE_WIN} — 새 수 0)`, String(ring.length));
    const v9b = VV.build(p, VID, 'wood').view, T9 = require(path.join(ROOT, 'server', 'trade.js'));
    const tr = v9b.prices.trend, n9 = v9b.prices.numeraire;
    const r0 = tr && tr.rows[0], want0 = r0 ? ring.filter((x) => x.p[n9] > 0 && x.p[r0.res] > 0).map((x) => ({ ago: d9 - x.d, num: T9.sig(x.p[r0.res] / x.p[n9]) })) : null;
    ok(!!tr && tr.days === Ev.CFG.PRICE_WIN && tr.rows.every((t) => v9b.prices.rows.some((q) => q.res === t.res)) && JSON.stringify(r0.pts) === JSON.stringify(want0),
      '⑥ `prices.trend` = 고리 ÷ 고른 기준(거래소 `num` 과 같은 나눗셈 · `trade.sig`) · 시세 칸 품목만 · 오래된 것부터', r0 ? `${r0.res} ${r0.pts.length}점 · 기준 ${n9}` : '없음');
    const last = r0 && r0.pts[r0.pts.length - 1], cur = r0 && v9b.prices.rows.find((q) => q.res === r0.res);
    ok(!!last && last.ago === 0 && !!cur, '⑥ 마지막 점 = 오늘', last ? `${last.num} (지금 시세 ${cur && cur.num})` : '-');
    const pf = { x: p.x, y: p.y }; p.x = AX + 4000; p.y = AY + 4000;
    const far9 = VV.build(p, VID, 'wood'); p.x = pf.x; p.y = pf.y;
    ok(!!far9.far && !(far9.view && far9.view.prices && far9.view.prices.trend), '⑥ 멀면 시세 흐름도 없다(원격 시세 0)');
    const P3 = V.__p3Bind ? V.__p3Bind() : null, ser = P3 && P3.serializeEcon ? (((x) => typeof x === 'string' ? x : JSON.stringify(x))(P3.serializeEcon(E9))) : null;
    const back = ser ? P3.restoreEcon(ser, require(path.join(ROOT, 'sim', 'economy-sim.js'))) : null;
    ok(!!back && Array.isArray(back._t1189Px) && back._t1189Px.length === ring.length && JSON.stringify(back._t1189Px) === JSON.stringify(ring), '⑥ 고리는 econ 행 칸 — 저장 문(`serializeEcon`) → 복원 문(`restoreEcon`) 왕복에 그대로 남는다(재기동을 넘는다)', back ? `${back._t1189Px.length}줄` : '저장 문을 못 불렀다');
    // ⑤ 공사에 재료 가져오기 — 짐 → 집터 실물 · 단계 자재를 다 채우면 기여 +1
    const E5 = V.villageViewSrc(VID).E, site = vil._site;
    ok(!!site && !!E5.T400_BUILD_ACT, '[자명 통과 금지] 집 행위가 켜진 세계에 집터가 실제로 있다', site ? `단계 ${site.stage}` : '없음');
    if (site) {
      // ★[T1203 2026-11-07 · 픽스처] 움집 단계 넷 중 0 · 3 단계는 econ 자재가 없는 단계다(`hutEconStage` = {} — 손일만).
      //   이 세계의 집터가 그 단계에 서 있으면 고를 자재가 없어 이 절이 빈 칸(`k5` 없음)으로 빨갰다(land1048 · 집 행위 켬 세계는 집터가 3 단계에 닿는다).
      //   이 절이 재는 것은 "자재 한 줄을 짐에서 받는 문"이라 — 자재가 있는 가장 가까운 단계(지금 단계부터 거꾸로 · 없으면 앞으로)로 집터를 옮겨 둔다(그 단계 놓인 자재 0 에서).
      if (!Object.keys(E5.hutEconStage(site.stage | 0) || {}).length) {
        const _n = E5.hutStageCount(), _has = (i) => Object.keys(E5.hutEconStage(i) || {}).length > 0;
        let _s = -1; for (let i = site.stage | 0; i >= 0 && _s < 0; i--) if (_has(i)) _s = i; for (let i = 0; i < _n && _s < 0; i++) if (_has(i)) _s = i;
        if (_s >= 0) { site.stage = _s; site.mat = {}; }
      }
      const need5 = E5.hutEconStage(site.stage | 0) || {}, DM = V.playerVillageDepositMap();
      if (!site.mat) site.mat = {};
      const k5 = Object.keys(need5).find((k) => Object.keys(DM).some((it) => DM[it] === k));
      const it5 = k5 && (DM[k5] === k5 ? k5 : Object.keys(DM).find((it) => DM[it] === k5));
      for (const k of Object.keys(need5)) if (k !== k5) site.mat[k] = need5[k];   // 다른 자재는 이미 찼다고 둔다(이 절이 재는 것은 그 한 줄)
      site.mat[k5] = 0;
      const M = require(path.join(ROOT, 'server', 'membership.js'));
      const c0 = M.contribOf(p.playerId);
      p.inventory[it5] = 1;
      send({ type: 'village_site_give', vid: VID, want: { [it5]: 1 } });
      await sleep(30);
      const m1 = site.mat[k5], c1 = M.contribOf(p.playerId);
      ok(m1 > 0 && (p.inventory[it5] || 0) === 0 && c1 === c0, '⑤ 재료 하나 — 짐에서 빠지고 집터 자재가 는다 · 단계가 안 찼으면 기여 그대로', `${it5} → ${k5} ${m1}/${need5[k5]} · 기여 ${c0} → ${c1}`);
      let rem = 0; for (let i = site.stage | 0; i < E5.hutStageCount(); i++) rem += ((E5.hutEconStage(i) || {})[k5] || 0);   // 이 집에 남은 몫(지금 단계 ~ 끝)
      const nt0 = msgs('notice').length, gs = Math.ceil((rem - m1) / m1) + 3;   // 남은 몫보다 셋 더 든다(넘는 낱개는 짐에 남아야 한다)
      p.inventory[it5] = gs;
      send({ type: 'village_site_give', vid: VID, want: { [it5]: gs } });
      await sleep(30);
      const c2 = M.contribOf(p.playerId), nt = msgs('notice').slice(nt0).map((m) => m.text);
      ok(site.mat[k5] >= need5[k5] && c2 === c0 + 1 && nt.some((t) => /다 찼습니다/.test(t) && /니다\.$/.test(t)), '⑤ 그 단계 자재를 다 채운 한 번 = 기여 +1(부탁 하나와 같은 꼴 · 계량기 하나) · 알림 하십시오체', `${site.mat[k5]}/${need5[k5]} · 기여 ${c2} · ${nt.slice(-1)[0]}`);
      ok(site.mat[k5] <= rem + 1e-6 && (p.inventory[it5] || 0) > 0, '⑤ 이 집에 남은 몫을 넘게는 안 받는다(넘는 낱개는 짐에 남는다 — 집터에서 사라지는 자재 0)', `놓인 ${site.mat[k5]} ≤ 남은 몫 ${rem} · 짐에 ${p.inventory[it5]}`);
      p.x = AX + 4000; p.y = AY + 4000; const nf = msgs('notice').length;
      send({ type: 'village_site_give', vid: VID, want: { [it5]: 1 } }); await sleep(20);
      p.x = AX; p.y = AY;
      ok(msgs('notice').length > nf && site.mat[k5] >= need5[k5], '⑤ 멀면 거절(곳간 · 게시판과 같은 근접 술어)', msgs('notice').slice(-1)[0].text);
    }
    // 화면 — 고정 자료로(vm): 부제 · 오늘 땔감 · 단위 · 흐름 · 값 ▲ · 다 되면 문장 0
    const vm = require('vm');
    const C = vm.createContext({ location: { search: '' }, URLSearchParams, document: {}, CSS: { escape: (x) => x } });
    const F = vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'client', '52-v-village-view.js'), 'utf8') + '\n;({ vvAdapt, vvSpark })', C);
    const A = F.vvAdapt(FIX.view);
    ok(A.kind === '어촌' && A.stats.fuel === FIX.view.dash.fuelCov && A.stats.fuelShort === true && A.stats.winter[0].need === 124, '화면 꼴 — 마을 꼴 · 오늘 땔감 · 겨울 준비 줄(서버 칸 그대로)');
    ok(A.store.rows.find((r) => r.res === 'wood').kg === 255 && A.store.rows.find((r) => r.res === 'salt').trend.length === 5 && A.store.trendDays === 30, '화면 꼴 — kg · 시세 흐름 점(그 품목) · 며칠');
    ok(/값 ▲/.test(A.store.short.find((x) => x.res === 'stone').why) && !/값 ▲/.test(A.store.short.find((x) => x.res === 'hide').why), '⑧ 모자란 까닭 = 며칠치 + 값 ▲(래치가 선 물건만) · 쓰임새 문장 0', A.store.short.map((x) => x.why).join(' / '));
    ok(A.projects.active.every((q) => !(q.after || []).some((t) => /다 지으면/.test(t))), '④ 다 되면 좋아지는 것 = 문장 없이(침상 줄 0)');
    const sp = F.vvSpark(A.store.rows.find((r) => r.res === 'salt').trend, 30);
    ok(/<polyline points="[^"]+"/.test(sp) && F.vvSpark([{ ago: 0, num: 1 }], 30) === '' && F.vvSpark(null, 30) === '', '⑥ 흐름 선 — 점 둘 이상만 그린다');
  }

  say(`\n결과: PASS ${pass} · FAIL ${fail}`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
