#!/usr/bin/env node
// === 11차 T4 — 플레이어 의뢰 집 건설(서버 이식판) 계약 검증 하네스 ===
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
  const iLack = fn.indexOf('lack.push'), iPlace = fn.indexOf('lifeRequestPlayerSite'), iPay = fn.indexOf('player.inventory[it] -= amt');
  chk(iLack > 0 && iPlace > iLack, '재료 검사가 배치보다 **먼저**(부족하면 상태를 안 건드림)');
  chk(iPay > iPlace, '★차감은 자리 확정 **뒤** — 배치 실패 시 재료가 사라지지 않는다');
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

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
