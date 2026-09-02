#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 11차 T4 — 플레이어 의뢰 집 건설(서버 이식판) 계약 검증 하네스 ===
//
// ★★[T48 2026-09-02] 이 하네스는 **1년 가까이 소스 문자열만** 봤고, 그래서 두 번 틀렸다:
//   ① 08-30 원장 승격이 `player.inventory[it] -= amt` 를 `consumeItem(...)` 으로 바꾸자
//      `indexOf` 가 −1 을 냈고 `-1 > iPlace` 가 거짓이라 **"차감이 자리 확정 전에 일어난다"**고
//      보고했다 — **있지도 않은 제품 결함을**. (족보 (84): "없다"는 두 가지다 — 순서가 틀린 것과
//      **찾지 못한 것**. `indexOf` 를 `>` 로 비교하면 그 둘이 같은 빨강으로 뭉개진다.)
//   ② 그리고 정작 **진짜 결함은 못 봤다** — 소스 순서는 옳았지만 그 함수는 실행하면 **존 서버를 죽였다**
//      (`lifeRequestPlayerSite` 가 lazy 모듈을 가드 없이 읽어 `null.HALL_CLEAR`).
//   ⇒ ⑤는 "못 찾음"과 "순서 틀림"을 **다른 문구로** 가르고, **⑨를 신설해 실서버로 실행**한다.
//     소스 검사는 규약이 **있는지**를 보고, 실행 검사는 그 규약이 **도는지**를 본다. 둘 다 필요하다.
//
// 랩 10차 정본(scripts/test-lab-psite.js가 실측으로 확립한 것)의 **서버 이식 계약**을 검사한다.
// 실행 동작(지정→선납→4단계→완공)은 로컬 풀스택(scripts/_t4b-live.js)이 재현하고, 여기서는
// 그 동작이 기대는 **구조적 계약**이 코드에 실재하는지를 본다 — 랩에서 값비싸게 배운 규약들이
// 이식 중에 조용히 빠지는 것을 막는 게 목적이다(9차 "하네스가 대조한다더니 하네스가 없더라" 재발 금지).
//
// 실행: node scripts/test-psite-server.js
const fs = require('fs');
const path = require('path');

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const VIL = R('server/villages.js'), ZONE = R('server/zone.js'), CLI = require('./client-src.js').readClientSrc(), HTML = R('public/index.html');

console.log('=== 11차 T4 · 플레이어 의뢰 집 건설(서버 이식) 계약 검증 ===');

console.log('\n[① 자리 필터 공유 — 마을 자동 배치와 의뢰가 같은 코드를 쓴다(복제 금지)]');
{
  chk(/function _lifeSiteFilters\(vil\)/.test(VIL), '_lifeSiteFilters 추출 실재');
  const add = VIL.slice(VIL.indexOf('function _lifeAddHouseSite(vil) {'), VIL.indexOf('function _lifeAdvanceSite'));
  chk(/_lifeSiteFilters\(vil\)/.test(add), '마을 자동 배치가 그 필터를 쓴다');
  const req = VIL.slice(VIL.indexOf('function lifeRequestPlayerSite('), VIL.indexOf('function villageOwningCell'));
  chk(/_lifeSiteFilters\(vil\)/.test(req), '플레이어 의뢰도 **같은** 필터를 쓴다');
  chk(/F\.reject\(/.test(add) && /F\.reject\(/.test(req), '두 경로 모두 reject() 단일 술어로 판정');
  // 랩에서 확인된 하드 필터 전부가 술어 안에 있는가
  const f = VIL.slice(VIL.indexOf('const reject = (x, y, strict)'), VIL.indexOf('return { W_PEN_K, HG, wnd, farmAt, reject };'));
  for (const [re, label] of [[/기존 집과 너무 가까움/, '집 간격'], [/마을 영토 밖/, '영토'], [/부지 불가\(물·바위\)/, '지형'],
    [/개간 농지 위/, '농지 회피'], [/물가 완충 침범/, '침수 완충'], [/곳간과 겹침/, 'granClear']]) chk(re.test(f), `  하드 필터 — ${label}`);
  chk(/HALL_CLEAR/.test(req), '  큰집 마당 침범 금지(HALL_CLEAR)는 의뢰 경로가 별도로 검사');
}

console.log('\n[② 크루 대상 포인터만 확장 — 상태머신·진척 공식 불변]');
{
  chk(/vil\._psite/.test(VIL), '_psite 대상 포인터 실재');
  chk(/k: 'build', ps: 1/.test(VIL), "작업 레코드는 기존 k:'build' 그대로 + ps 플래그만 추가(새 상태 발명 0)");
  chk(/_lifeAdvanceSite\(vil, t\.ps \? 'p' : null\)/.test(VIL), '완수 처리도 기존 _lifeAdvanceSite 재사용(진척 공식 불변)');
  chk(/dayMs \/ LIFE_STAGE_PDAY/.test(VIL), '단계 완수 문턱은 마을 집터와 동일(LIFE_STAGE_PDAY)');
}

console.log('\n[③ ★마을이 굶지 않는다 — 여유 크루만(포화점 규칙)]');
{
  // 배정 순서: 개간 → 마을 집터 → (그 다음에야) 의뢰 집터
  const iVil = VIL.indexOf("if (vil._site && vil._buildCrew < LIFE_CREW) {");
  const iP = VIL.indexOf("if (vil._psite && (vil._psiteCrew || 0) < LIFE_CREW) {");
  chk(iVil > 0 && iP > iVil, `배정 순서: 마을 집터(${iVil}) → 의뢰 집터(${iP}) — 마을이 먼저`);
  chk(/vil\._psiteCrew \|\| 0\) < LIFE_CREW/.test(VIL), '의뢰 집터도 크루 상한 LIFE_CREW(서버의 하루 진척 포화점)');
  // 반일 오후 징발도 마을 우선
  const half = VIL.slice(VIL.indexOf('if (npc._half && dayFrac >= SCH_HALF_R)'), VIL.indexOf('// ══ 진행 중 작업'));
  chk(/if \(vil\._site\)[\s\S]{0,240}else if \(vil\._psite\)/.test(half), '반일 오후 징발도 마을 집터 우선 → 없을 때만 의뢰');
  // 무상 진척(빨리감기 일괄) 금지
  const headless = VIL.slice(VIL.indexOf('function _lifeHeadlessDay(vil)'), VIL.indexOf('function _lifeTasksPerFarmerDay') > 0 ? VIL.indexOf('function _lifeTasksPerFarmerDay') : VIL.indexOf('function _lifeAddHouseSite'));
  chk(!/_psite/.test(headless), '★무인 존 일괄 진척(_lifeHeadlessDay)에 의뢰 집터 없음 = 크루가 실제로 와야만 지어진다(랩 규약 ②)');
}

console.log('\n[④ 회계·명부 무접촉 — 의뢰 집은 마을 침대가 아니다]');
{
  chk(/type: isP \? 'phouse' : 'house'/.test(VIL), "완공 영속 타입이 갈린다('phouse')");
  chk(/if \(!isP\) \{ vil\._houseCells\.push/.test(VIL), '_houseCells·housesPx에 안 들어간다(침대 명부 제외)');
  chk(/b\.type === 'phouse'/.test(VIL) && /pHouseRows\.push/.test(VIL), '부팅 복원도 phouse를 house와 분리해 읽는다');
  const boot = VIL.slice(VIL.indexOf("if (b.type === 'house') { housesPx.push"), VIL.indexOf("for (const k of farmSet) potSet.delete"));
  chk(!/phouse[\s\S]{0,60}housesPx\.push/.test(boot), '  복원 시에도 phouse는 housesPx에 안 들어감');
  chk(/rows \+= buildStructureRect\(db, vil\.dbId, b\.cx - 5, b\.cy - 5, b\.cx \+ 0, b\.cy - 2, ow, '의뢰 움집'/.test(VIL),
    '  그래도 집채 실체는 마을 움집과 **완전히 동일한 6×4**로 되살아난다');
}

console.log('\n[⑤ 대가 = 재료 선납 — 부족하면 지정 자체를 거절(외상 없음)]');
{
  chk(/const PSITE_COST = \{ pillar: 6, rafter: 8, thatch: 8 \}/.test(ZONE), '선납 재료 = 움집 중간재 3종(기둥6·서까래8·이엉8)');
  const fn = ZONE.slice(ZONE.indexOf('function tryRequestVillageHouse'), ZONE.indexOf('function tryHutAdvance'));
  const iLack = fn.indexOf('lack.push'), iPlace = fn.indexOf('lifeRequestPlayerSite');
  chk(iLack > 0 && iPlace > iLack, '재료 검사가 배치보다 **먼저**(부족하면 상태를 안 건드림)');
  // ★[T48] 차감 호출을 **이름에 매이지 않게** 찾는다(정본이 `consumeItem` 으로 바뀐 전례).
  //   그리고 **못 찾은 것**과 **순서가 틀린 것**을 반드시 다른 문구로 가른다 — 뭉개면 오진이 된다.
  const mPay = /consumeItem\(player,\s*it,\s*amt\)|player\.inventory\[it\]\s*-=\s*amt/.exec(fn);
  chk(!!mPay, `차감 호출을 **찾았다**(정본 이름이 바뀌면 여기부터 빨개진다) — ${mPay ? mPay[0] : '못 찾음'}`);
  chk(!!mPay && mPay.index > iPlace, '★차감은 자리 확정 **뒤**(소스 순서) — 실행 증명은 ⑨');
  chk(/type: 'notice'/.test(fn) && /재료 선납 부족/.test(fn), '부족 사유를 notice로 돌려준다');
  chk(/거리|너무 멀어서/.test(fn), '거리 게이트 실재(원격 의뢰 금지)');
  // HUT_STAGES 실제 소요와 대조 — 선납이 공정 소요와 어긋나면 '이 집은 뭘로 짓나'가 깨진다
  const hs = ZONE.slice(ZONE.indexOf('const HUT_STAGES = ['), ZONE.indexOf('function tryHutStart'));
  for (const [k, v] of [['pillar', 6], ['rafter', 8], ['thatch', 8]]) {
    chk(new RegExp(`${k}: ${v}`).test(hs), `  HUT_STAGES 소요와 일치 — ${k} ${v}`);
  }
}

console.log('\n[⑥ 클라 — placementMode.special 재사용(발명 0) + 마을 정본 발자국]');
{
  chk(/placementMode = \{ special: 'psite' \}/.test(CLI), "placementMode.special='psite' 재사용");
  chk(/'request_village_house'/.test(CLI) && /msg\.type === 'request_village_house'/.test(ZONE), '클라 요청 ↔ 서버 핸들러 배선');
  chk(/data-action="psite_request"/.test(HTML), 'UI 버튼 실재');
  chk(/psite \? ccx - 5 :/.test(CLI) && /psite \? ccy - 5 :/.test(CLI), '고스트 발자국이 **마을 정본**([cx-5..cx+0]×[cy-5..cy-2])과 동일');
  chk(/마을에 집 의뢰 6×4/.test(CLI), '고스트 라벨');
}

console.log('\n[⑦ 재부팅 생존 — 공사 중 의뢰가 증발하지 않는다]');
{
  chk(/type: 'psitework'/.test(VIL), '공사 중 의뢰 터를 village_buildings에 영속');
  chk(/의뢰 집터 복원/.test(VIL), '부팅 복원 경로 실재');
  chk(/DELETE FROM village_buildings WHERE village_id=\? AND type='psitework'/.test(VIL), '완공 시 공사 행 정리(유령 터 방지)');
}

console.log('\n[⑧ 관측 — /lifedbg가 의뢰 상태를 노출]');
{
  chk(/psite: vil\._psite \? \{/.test(VIL), 'psite(좌표·단계·붙은 크루·소유자) 노출');
  chk(/pHouses:/.test(VIL), '완공된 의뢰 집 수 노출');
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ ★실행 검증 — 실서버에서 **정말 그렇게 도는가** [T48 2026-09-02 신설]
// ═══════════════════════════════════════════════════════════════════════════
//   위 ①~⑧은 전부 **소스 문자열**이다. 그래서 규약이 코드에 적혀 있는지는 알지만,
//   그 코드를 **밟으면 무슨 일이 나는지**는 모른다 — 이 하네스가 존이 죽는 걸 못 본 이유다.
//   ⇒ 진짜 존을 띄우고, 진짜 마을에, 진짜 메시지 경로(`handlePlayerInput`)로 의뢰한다.
//   ★★생활틱을 **일부러 안 돌린 채로** 첫 요청을 보낸다 — 그게 T48 이 잡은 창이다.
(async () => {
  const fsx = require('fs');
  const TMP = `/tmp/test-psite-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fsx.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(37600 + (process.pid % 180));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '1'; process.env.VILLAGE_MAX = process.env.VILLAGE_MAX || '2';
  process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(__dirname, '..', 'server', 'zone.js'));
  // 서버 로그는 계속 죽여 둔다 — 하네스 자기 줄만 보이게(러너가 `✗` 를 세는 화면을 어지럽히지 않는다).
  console.log = (...a) => { if (typeof a[0] === 'string' && /^\[hanbando/.test(a[0])) return; _l(...a); };
  console.warn = _w; console.error = _e;
  const H = Zone.__testBind(), V = H.SimVillages, SZ = H.BUILDING_SIZE;
  const COST = { pillar: 6, rafter: 8, thatch: 8 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const mk = (nm, x, y) => {
    const msgs = [];
    const ws = { readyState: 1, send: (t) => { try { msgs.push(JSON.parse(t)); } catch (e) {} } };
    const p = { pid: 'p_' + nm, playerId: 't48_' + nm, name: nm, persistent: false, x, y, floor: 0,
      hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: {}, toolItems: [], equipment: [],
      equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], ws,
      isNpc: false, isDown: false, vx: 0, vy: 0 };
    p.__last = () => { const n = msgs.filter((m) => m.type === 'notice'); return n.length ? n[n.length - 1].text : ''; };
    return p;
  };
  const snap = (p) => JSON.stringify({ pillar: p.inventory.pillar || 0, rafter: p.inventory.rafter || 0, thatch: p.inventory.thatch || 0 });
  // ★메시지는 **문자열**로 보낸다 — `handlePlayerInput` 이 `JSON.parse(raw.toString())` 한다.
  //   객체를 넘기면 파싱이 조용히 실패해 **아무 일도 안 일어난다**(족보 (57) — 개발 중 실제로 밟았다).
  const ask = (p, x, y) => { let threw = null;
    try { H.handlePlayerInput(p, JSON.stringify({ type: 'request_village_house', atX: x, atY: y })); }
    catch (e) { threw = e; }
    return threw; };

  console.log('\n[⑨ ★실행 — 실서버에서 자리 확정이 실패하면 무엇이 사라지나]');
  let vil = null;
  for (let i = 0; i < 120 && !vil; i++) {
    const d = V.lifeDebug && V.lifeDebug();
    vil = ((d && d.villages) || []).find((z) => z.terr > 0) || null;
    if (!vil) await sleep(500);
  }
  chk(!!vil, `(상황) 살아 있는 마을을 잡았다 — ${vil ? `${vil.name} @(${vil.ccx},${vil.ccy}) terr=${vil.terr}` : '없음'}`);
  if (vil) {
    const cpx = vil.ccx * SZ + SZ / 2, cpy = vil.ccy * SZ + SZ / 2;
    // ⓐ ★생활틱 전 · 큰집 마당 침범 = 확정 실패. **던지면 존이 죽는다**(uncaughtException → exit 1).
    const a = mk('a', cpx, cpy); a.inventory = { pillar: 20, rafter: 20, thatch: 20 };
    const b0 = snap(a);
    const threw = ask(a, cpx, cpy);
    chk(!threw, `★★확정이 실패해도 **던지지 않는다** — 던지면 존 서버가 내려간다 ${threw ? '· ' + threw.message : ''}`);
    chk(/의뢰 불가|마당|영토|너무 멀어/.test(a.__last()), `★거절 **사유를 돌려준다**(조용히 사라지지 않는다) — "${a.__last()}"`);
    chk(snap(a) === b0, `★★그리고 재료가 **그대로다** — ${b0} → ${snap(a)}`);
    // ⓑ 성사 — 차감이 정확히 선납분만
    let ok = null;
    for (let r = 8; r <= 40 && !ok; r += 2) {
      for (let k = 0; k < 8 && !ok; k++) {
        const cx = vil.ccx + Math.round(r * Math.cos(k * Math.PI / 4));
        const cy = vil.ccy + Math.round(r * Math.sin(k * Math.PI / 4));
        const q = mk('b' + r + '_' + k, cx * SZ + SZ / 2, cy * SZ + SZ / 2);
        q.inventory = { pillar: 20, rafter: 20, thatch: 20 };
        if (ask(q, cx * SZ + SZ / 2, cy * SZ + SZ / 2)) continue;
        const d2 = ((V.lifeDebug() || {}).villages || []).find((z) => z.name === vil.name);
        if (d2 && d2.psite) ok = { q, cx, cy };
      }
    }
    chk(!!ok, `(전제) 유효한 자리가 실제로 성사됐다 — 안 되면 아래 판정이 자명 통과다 ${ok ? `@(${ok.cx},${ok.cy})` : ''}`);
    if (ok) {
      const want = JSON.stringify({ pillar: 20 - COST.pillar, rafter: 20 - COST.rafter, thatch: 20 - COST.thatch });
      chk(snap(ok.q) === want, `★성사되면 **선납분만 정확히** 빠진다 — ${want} vs ${snap(ok.q)}`);
      // ⓒ 이미 의뢰가 있는데 또 요청 → 거절 · 재료 불변(같은 함수의 다른 실패 갈래)
      const c = mk('c', (vil.ccx + 12) * SZ + SZ / 2, (vil.ccy + 12) * SZ + SZ / 2);
      c.inventory = { pillar: 20, rafter: 20, thatch: 20 };
      const c0 = snap(c);
      const t2 = ask(c, (vil.ccx + 12) * SZ + SZ / 2, (vil.ccy + 12) * SZ + SZ / 2);
      chk(!t2 && /이미 의뢰한/.test(c.__last()), `★중복 의뢰는 거절된다 — "${c.__last()}"`);
      chk(snap(c) === c0, `★★그때도 재료가 **그대로다** — ${c0} → ${snap(c)}`);
    }
  }
  // ★구조 — 이 클래스가 다시는 못 나게: 생활층에 lazy 모듈의 **맨 이름이 없다**
  const VILSRC = R('server/villages.js');
  const iAcc = VILSRC.indexOf("const _lifeVL = () =>");
  const after = VILSRC.slice(iAcc).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  chk(iAcc > 0 && !/\bVillageLayout\s*\./.test(after),
    '★★생활층에 lazy 모듈의 **맨 이름이 남아 있지 않다**(읽는 길이 접근자 하나뿐 — 가드를 잊을 자리가 없다)');

  console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fsx.unlinkSync(f); } catch (e) {} }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('하네스 크래시:', e); process.exit(1); });
