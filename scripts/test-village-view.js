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
//
// 실행: node scripts/test-village-view.js   (존 한 벌을 이 프로세스 안에서 띄운다 · 마을 2곳)
'use strict';
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
    ok(view.news.rows.length === nw.length && view.news.rows.every((r, i) => r.line === nw[i].line && r.heard === nw[i].heard && r.from === (nw[i].from || null)), '소식 = 게시판 소식(소문 가시성 `visibleEvents`) 그대로', `${view.news.rows.length}줄 · 뺀 ${view.news.withheld}`);
  }
  {
    const bodies = (vil.npcPids || []).map((pid) => H.players.get(pid)).filter(Boolean);
    ok(view.members.n === bodies.length && view.members.people.length === bodies.length, '구성원 수 = 마을 명부의 몸', String(view.members.n));
    const byPid = new Map(bodies.map((b) => [b.pid, b]));
    ok(view.members.people.every((q) => { const b = byPid.get(q.pid); return b && q.name === b.name && q.job === (b.simJob || null) && q.act === (b._lifeAct || '') && q.jobKo === (b.simJob ? (H.JOB_KR_NPC[b.simJob] || null) : null); }),
      '사람 칸마다 이름 · 직업 · 지금 하는 일(행위 라벨 `_lifeAct`) = 몸 그대로');
    ok(view.members.byJob.reduce((a, r) => a + r.n, 0) === bodies.filter((b) => b.simJob).length, '직업별 수의 합 = 직업 있는 몸 수');
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
    const ch = V.villageChronicle(VID, p.x, p.y);
    const built = [].concat(...ch.seasons.map((b) => b.items)).filter((x) => x.type === 'BUILT');
    ok(view.projects.done.length === built.length, '끝낸 일 = 연대기의 완공(`BUILT`)', String(built.length));
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

  say(`\n결과: PASS ${pass} · FAIL ${fail}`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
