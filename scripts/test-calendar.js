#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-calendar.js — 달력이 econ 정본과 **한 몸인가** ==================
//
// ★[재민 확정 2026-08-30] *"원천은 econ 계절 정본 하나 — 새 시계·새 매핑 상수 금지(사본 금지)."*
//
// ★★이 하네스의 제1 판정은 값이 아니라 **구조**다:
//   달력이 `seasonOf` 만 보고 유도됐다면, 엔진의 계절 경계를 바꿨을 때 달력이 **저절로** 따라온다.
//   사본이면 안 따라온다. 그래서 ③에서 **경계를 실제로 바꿔** 보고 따라오는지 확인한다
//   (값을 다시 적어 비교하면 그건 표를 두 벌 만드는 것이다 — 이 레포가 여러 번 덴 그 함정).
//
// 실행: node scripts/test-calendar.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);
const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 **정본**(acorn onComment · 사본 0). 옛 정규식 판은 `villages.js:20` 의 `// … sim/* …` 에 걸려 파일의 67.9% 를 삼켰다

const _l = console.log; console.log = () => {};
const E = require(path.join(ROOT, 'server', 'events.js'));
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
console.log = _l;

(() => {
  say('\n=== 달력 — econ 계절 정본에서 유도되는가 ===');

  // ── ① 원천 동일 — 달력의 계절이 econ 의 계절이다 ─────────────────────────
  say('\n① 원천 — 달력이 말하는 계절 = econ 이 쓰는 계절');
  const YD = E.yearDaysOf();
  ok(YD > 0, '★① 한 해 길이를 **유도**해 냈다(상수로 안 적었다)', `${YD}일`);
  let mismatch = 0, firstBad = null;
  for (let d = 0; d < YD * 3; d++) {
    const cal = E.calendarOf(d);
    if (cal.season !== E.seasonOf(d)) { mismatch++; if (!firstBad) firstBad = d; }
  }
  ok(mismatch === 0, `★★① ${YD * 3}일 전수 — 달력 계절 = 정본 계절`, mismatch ? `첫 불일치 day ${firstBad}` : '불일치 0');

  // ── ② 경계 스윕 — 계절이 바뀌는 날 정확히 1일로 되돌아간다 ─────────────────
  say('\n② 경계 — 계절이 바뀌는 날 "1일"로 리셋되는가');
  const bounds = [];
  for (let d = 1; d < YD * 2; d++) if (E.seasonOf(d) !== E.seasonOf(d - 1)) bounds.push(d);
  ok(bounds.length >= 4, '(상황) 경계를 실제로 찾았다 — 0개면 아래가 자명 통과다', `${bounds.length}개`);
  let bad = 0;
  for (const d of bounds) {
    const a = E.calendarOf(d - 1), b = E.calendarOf(d);
    if (b.dayOfSeason !== 1) bad++;
    if (a.dayOfSeason !== a.seasonDays) bad++;   // 전날은 그 계절의 마지막 날이어야 한다
  }
  ok(bad === 0, `★★② 경계 ${bounds.length}곳 전부 — 새 계절 1일 · 전날은 마지막 날`, `어긋남 ${bad}`);
  // 계절 길이의 합 = 한 해
  const oneYear = [];
  for (let d = 0; d < YD; d++) { const c = E.calendarOf(d); if (c.dayOfSeason === 1) oneYear.push(c.seasonDays); }
  ok(oneYear.reduce((x, y) => x + y, 0) === YD, '★★② 계절 길이의 합 = 한 해 길이', `${oneYear.join('+')} = ${YD}`);
  say(`     계절 구성: ${oneYear.join(' / ')}일`);

  // ── ③ ★★사본이 아니라는 증명 — 정본을 흔들면 달력이 따라오는가 ────────────
  say('\n③ 사본 아님 — 정본 계절 함수를 갈아 끼우면 달력이 따라온다');
  {
    const real = E.seasonOf;
    // 가짜 정본: 한 해 8일 · 두 계절. 달력이 이걸 그대로 따라오면 유도가 맞다.
    const fake = (d) => (((d % 8) + 8) % 8) < 3 ? 'spring' : 'winter';
    // ★캐시를 비우고 갈아 끼운다(내부 상태에 옛 값이 남아 있으면 이 검사가 거짓말한다).
    const mod = require.cache[require.resolve(path.join(ROOT, 'server', 'events.js'))];
    ok(!!mod, '(상황) 모듈 핸들을 잡았다');
    delete require.cache[require.resolve(path.join(ROOT, 'server', 'events.js'))];
    const E2 = require(path.join(ROOT, 'server', 'events.js'));
    E2.seasonOf = fake;   // ⚠export 를 갈아도 내부 호출이 이걸 안 보면 사본이라는 뜻이다
    let followed = false;
    try { followed = (E2.yearDaysOf() === 8); } catch (e) {}
    if (!followed) {
      say('     (내부 호출이 export 를 안 거친다 — 함수 참조 대신 **소스로** 확인한다)');
      const src = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'events.js'), 'utf8'));
      // ★함수 **하나씩만** 도려낸다 — `split(...)[1]` 은 그 뒤 파일 전체를 가져와
      //   엉뚱한 코드의 숫자를 세게 된다(1차 실행에서 실제로 그랬다: `4096` 의 4 를 잡았다).
      const cut = (name) => {
        const i = src.indexOf('function ' + name);
        if (i < 0) return '';
        const j = src.indexOf('\nfunction ', i + 10);
        const k = src.indexOf('\nconst ', i + 10);
        const end = Math.min(j < 0 ? src.length : j, k < 0 ? src.length : k);
        return src.slice(i, end);
      };
      const blob = cut('calendarOf') + cut('yearDaysOf') + cut('seasonStartOf');
      ok(blob.length > 200, '(상황) 달력 함수 셋을 실제로 도려냈다', `${blob.length}자`);
      // 달력 블록 안에 **계절 경계 수**(90/180/270/365)가 한 번도 안 적혀 있어야 한다
      const nums = blob.match(/\b(90|180|270|365)\b/g) || [];
      ok(nums.length === 0, '★★③ 달력 코드에 계절 경계 상수가 **한 개도 없다**(사본 금지)',
        nums.length ? `발견: ${nums.join(',')}` : '0개');
      const calls = (blob.match(/seasonOf\(/g) || []).length;
      ok(calls >= 3, '★★③ 달력이 **정본 함수만** 부른다', `seasonOf 호출 ${calls}회`);
    } else {
      ok(true, '★★③ 정본을 갈아 끼우니 달력이 따라왔다(유도가 맞다)', '한 해 8일');
    }
    void real;
  }
  // 원본 복구 — 뒤 절이 가짜를 쓰지 않게
  delete require.cache[require.resolve(path.join(ROOT, 'server', 'events.js'))];
  const E3 = require(path.join(ROOT, 'server', 'events.js'));
  ok(E3.yearDaysOf() === YD, '(정리) 정본 복구됨', `${E3.yearDaysOf()}일`);

  // ── ④ econ 엔진과의 동기 계약 — events 의 거울이 엔진과 같은가 ─────────────
  say('\n④ 동기 계약 — events.seasonOf 가 엔진과 같은 답을 낸다');
  let dif = 0;
  if (typeof V2.seasonOf === 'function') {
    for (let d = 0; d < YD * 2; d++) if (E3.seasonOf(d) !== V2.seasonOf(d)) dif++;
    ok(dif === 0, `★★④ ${YD * 2}일 전수 — events 거울 = 엔진 정본`, `불일치 ${dif}`);
  } else {
    // 엔진이 export 를 안 하면 소스에서 경계를 읽어 견준다(이 계약은 test-events ③도 지킨다)
    const es = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
    ok(/d < 90/.test(es) && /d < 180/.test(es) && /d < 270/.test(es),
      '★④ 엔진 경계(90/180/270)가 그대로다 — 바뀌면 events 거울도 바꿔야 한다(test-events ③)');
  }

  // ── ⑤ 실시간 환산 — 첫 겨울이 언제인가(수치 보고) ─────────────────────────
  say('\n⑤ 실시간 환산 — 하루 24분 기준');
  {
    const DAY_MIN = 24;
    let winterDay = -1;
    for (let d = 0; d < YD; d++) if (E3.seasonOf(d) === 'winter') { winterDay = d; break; }
    const hrs = winterDay * DAY_MIN / 60;
    say(`     첫 겨울 = econ day ${winterDay} → 실시간 ${hrs.toFixed(1)}시간 = ${(hrs / 24).toFixed(1)}일`);
    say(`     한 해   = ${YD}일 → 실시간 ${(YD * DAY_MIN / 60 / 24).toFixed(1)}일`);
    ok(winterDay > 0, '★⑤ 첫 겨울 날짜를 찾았다', `day ${winterDay}`);
    // ★★[재민 확정 2026-08-31] ~~"첫 겨울 = 실시간 2~3주차"~~ **목표 폐기.**
    //   *"시간은 절대 바꾸면 안 돼. 차라리 겨울 버티는 난이도를 수정."*
    //   ⇒ 4.5일은 **정상값**이다. 여기서 어긋남을 보고하지 않는다 — 겨울의 난이도는
    //     온도 곡선(`server/weather.js`)·추위 시정수·마을 완충이 정한다(`test-body ⑭`·`cold-matrix`).
    say('     ⇒ ★시간 구조 불변 캐논: 하루 24분 · 한 해 365 게임일 — **둘 다 절대 불변**(재민 확정 2026-08-31).');
    say('       ★[T570 재민 10-02] 한 해 = 그레고리력(평년 365 · 윤년 366) — 여기 YD 는 1년 3월 1일 → 2년 3월 1일(평년 365)을 정본에서 찾은 값.');
    say('       (옛 "2~3주차" 목표는 폐기됐다. 겨울 난이도는 온도·완충으로 조정한다.)');
    // 캐논이 실제로 그대로인지 못 박는다 — 누가 조용히 늘리면 여기서 걸린다.
    ok(YD === 365, '★★⑤ 한 해가 **365 게임일** 그대로다(시간 구조 불변 캐논)', `${YD}일`);
  }

  // ══ ★★[T570 재민 10-02] 달력 정본 `server/calendar.js` — 그레고리력 · 게임일 0 = 1년 3월 1일 · 윤년 4/100/400 · 계절 = 달 ══
  const Cal = require(path.join(ROOT, 'server', 'calendar.js'));
  say(`\n⑥ [T570] 달력 정본 — 손잡이 ${Cal.ON ? '켬(기본)' : '끔(T570_CALENDAR=0)'}`);
  {
    const D = (y, m, d) => Cal.dayOf(y, m, d);
    ok(D(1, 3, 1) === 0, '★★⑥ 1년 3월 1일 = 게임일 0', D(1, 3, 1));
    ok(D(1, 12, 31) === 305, '★★⑥ 1년 12월 31일 = 305(1년은 3~12월 306일)', D(1, 12, 31));
    ok(D(2, 1, 1) === 306, '★★⑥ 2년 1월 1일 = 306', D(2, 1, 1));
    ok(D(1, 1, 1) === -59, '⑥ 1년 1월 1일 = −59(기점 앞 — 화면엔 안 나온다 · 회부: 1년 1~2월 없음)', D(1, 1, 1));
    const feb29 = (y) => { const t = Cal.dateOf(D(y, 2, 28) + 1); return t.month === 2 && t.dom === 29; };
    ok(feb29(4) && Cal.isLeap(4), '★★⑥ 4년 2월 29일이 있다(첫 윤일)', Cal.dateOf(D(4, 2, 28) + 1));
    ok(!feb29(1) && !feb29(2) && !feb29(3), '⑥ 1~3년엔 2월 29일이 없다');
    ok(!feb29(100) && !Cal.isLeap(100), '★★⑥ 100년 2월 29일은 없다(100 은 윤년 아님)', JSON.stringify(Cal.dateOf(D(100, 2, 28) + 1)));
    ok(feb29(400) && Cal.isLeap(400), '★★⑥ 400년 2월 29일은 있다(400 은 윤년)');
    ok(Cal.yearLen(4) === 366 && Cal.yearLen(5) === 365 && Cal.yearLen(1900) === 365 && Cal.yearLen(2000) === 366, '⑥ 한 해 길이 365|366(4/100/400)');
    let bad = 0, first = null;
    for (let d = 0; d <= 2000000; d++) { const t = Cal.dateOf(d); if (Cal.dayOf(t.year, t.month, t.dom) !== d) { bad++; if (first == null) first = d; } }
    ok(bad === 0, '★★⑥ 왕복 dayOf(dateOf(d)) = d — 0~200만 전수', bad ? `첫 어긋남 ${first}` : '어긋남 0');
    // 400년 = 146,097일(윤년 97번) — 규칙의 귀결을 날수로 확인
    ok(D(401, 3, 1) - D(1, 3, 1) === 146097, '⑥ 400년 = 146,097일(윤일 97번)', D(401, 3, 1));
    // 날짜 연속 — 하루 뒤는 언제나 다음 날이다
    let jump = 0;
    for (let d = 0; d < 40000; d++) {
      const a = Cal.dateOf(d), b = Cal.dateOf(d + 1);
      const nextOk = (b.dom === a.dom + 1 && b.month === a.month && b.year === a.year)
        || (b.dom === 1 && a.dom === Cal.monthLen(a.year, a.month) && ((b.month === a.month + 1 && b.year === a.year) || (a.month === 12 && b.month === 1 && b.year === a.year + 1)));
      if (!nextOk) jump++;
    }
    ok(jump === 0, '⑥ 4만 일 — 하루 뒤는 언제나 그다음 날(달 끝·해 끝 넘김 포함)', `어긋남 ${jump}`);
  }
  say('\n⑦ [T570] 계절 = 달(기상청 봄 3~5 · 여름 6~8 · 가을 9~11 · 겨울 12~2)');
  if (Cal.ON) {
    const D = (y, m, d) => Cal.dayOf(y, m, d);
    const cases = [[D(1, 3, 1), 'spring'], [D(1, 5, 31), 'spring'], [D(1, 6, 1), 'summer'], [D(1, 8, 31), 'summer'], [D(1, 9, 1), 'autumn'],
      [D(1, 11, 30), 'autumn'], [D(1, 12, 1), 'winter'], [D(2, 2, 28), 'winter'], [D(2, 3, 1), 'spring'], [D(4, 2, 29), 'winter'], [D(4, 3, 1), 'spring']];
    const miss = cases.filter(([d, s0]) => Cal.seasonOf(d) !== s0 || E3.seasonOf(d) !== s0 || V2.seasonOf(d) !== s0);
    ok(miss.length === 0, `★★⑦ 경계 ${cases.length}곳 — 정본 = events = econ 이 같은 계절을 말한다`, miss.length ? JSON.stringify(miss) : '어긋남 0');
    const lens = [0, D(1, 6, 1), D(1, 9, 1), D(1, 12, 1), D(3, 12, 1)].map((d) => Cal.seasonLen(d));
    ok(lens.join(',') === '92,92,91,90,91', '★★⑦ 계절 길이 92·92·91·90 · 윤년 겨울 91', lens.join('·'));
    ok(D(1, 12, 1) === 275, '★⑦ 첫 겨울 = 275일(옛 270 → 275)', D(1, 12, 1));
    ok(Cal.seasonStart(D(2, 1, 15)) === D(1, 12, 1), '⑦ 1·2월 겨울의 첫날 = 전해 12월 1일');
    const c0 = E3.calendarOf(0);
    ok(c0.label === '1년 3월 1일 (봄)' && c0.year === 1 && c0.month === 3 && c0.dom === 1, '★★⑦ 화면 한 줄 = "1년 3월 1일 (봄)"(서버가 만든다 · 클라는 그대로 쓴다)', c0.label);
    const cJ = E3.calendarOf(D(2, 1, 1));
    ok(cJ.year === 2 && cJ.dayOfYear === 0 && cJ.yearDays === 365 && cJ.season === 'winter' && cJ.dayOfSeason === 32 && cJ.seasonDays === 90,
      '⑦ 2년 1월 1일 — 연 2 · 연중 1일째 · 겨울 32일째 / 90일', cJ.label);
    const cL = E3.calendarOf(D(4, 2, 29));
    ok(cL.isLeap && cL.yearDays === 366 && cL.dayOfYear === 59 && cL.seasonDays === 91, '⑦ 4년 2월 29일 — 윤년 366일 · 겨울 91일', cL.label);
    ok(E3.yearOf(D(2, 1, 1)) === 2 && E3.springYearOf(D(2, 1, 1)) === 1 && E3.springYearOf(D(2, 3, 1)) === 2,
      '⑦ 달력 연도(1월 1일) · 봄 기점 해(3월 1일) — 둘 다 정본에서');
    const sp = E3.yearSpanOf(2);
    ok(sp[0] === 306 && sp[1] === 670, '⑦ 2년 = 게임일 306~670', sp.join('~'));
  } else {
    ok(Cal.seasonOf(89) === 'spring' && Cal.seasonOf(90) === 'summer' && Cal.seasonOf(270) === 'winter' && Cal.seasonOf(365) === 'spring',
      '★★⑦ 끔 — 옛 경계 90/180/270 · 한 해 365 그대로');
    ok(E3.calendarOf(0).label === '0년 봄 1일', '⑦ 끔 — 옛 글자 "0년 봄 1일"', E3.calendarOf(0).label);
  }
  say('\n⑧ [T570] solarFrac — 해 안 위치가 끊기지 않는다');
  {
    const D = (y, m, d) => Cal.dayOf(y, m, d);
    const sf = Cal.solarFrac;
    const step = (a, b) => { let x = sf(b) - sf(a); if (x < -0.5) x += 1; return x; };
    const s1 = step(D(1, 12, 31), D(2, 1, 1)), s2 = step(D(4, 2, 28), D(4, 2, 29)), s3 = step(D(4, 2, 29), D(4, 3, 1)), s4 = step(D(1, 2, 28) + 365, D(2, 3, 1));
    ok(Math.abs(s1 - 1 / 365) < 1e-12, '★★⑧ 12/31 → 1/1 은 한 칸(1 → 0 은 해의 같은 자리)', s1.toFixed(6));
    ok(Math.abs(s2 - 1 / 366) < 1e-12 && Math.abs(s3 - 1 / 366) < 1e-12, '★★⑧ 윤년 2/28 → 2/29 → 3/1 도 한 칸씩(1/366)', `${s2.toFixed(6)} · ${s3.toFixed(6)}`);
    ok(Math.abs(s4 - 1 / 365) < 1e-12, '⑧ 평년 2/28 → 3/1 은 한 칸', s4.toFixed(6));
    let mx = 0; for (let d = 0; d < 3000; d += 0.25) { const x = Math.abs(step(d, d + 0.25)); if (x > mx) mx = x; }
    ok(mx < 0.25 / 364, '⑧ 0.25일 간격으로 훑어도 튐 없음(weather 앵커가 이렇게 훑는다 · 윤년 끝 12/31 → 1/1 만 1/366 ↔ 1/365 이음매)', mx.toFixed(7));
    ok(Math.abs(sf(D(1, 3, 1)) - sf(D(5, 3, 1))) < 0.003, '⑧ 윤년을 지나도 3월 1일은 해의 같은 자리(하루씩 안 밀린다)', `${sf(D(1, 3, 1)).toFixed(4)} vs ${sf(D(5, 3, 1)).toFixed(4)}`);
    if (Cal.ON) {
      const T = (d) => V2.temperatureAt(d, null, 0);
      let lo = 0; for (let d = 0; d < 366; d++) if (T(d) < T(lo)) lo = d;
      const t = Cal.dateOf(lo);
      ok(t.month === 1 && t.dom >= 9 && t.dom <= 11, '★⑧ 최한일 = 1월 10일 언저리(옛 doy 315 의 달력 자리 · 새 수 0)', `${t.month}/${t.dom} (day ${lo})`);
    }
  }
  say('\n⑨ [T570] 끔 손잡이 — `T570_CALENDAR=0` 은 옛 달력 글자 그대로(다른 프로세스로 띄워 본다)');
  {
    const cp = require('child_process');
    const code = "const E=require('./server/events.js');const C=require('./server/crops.js');const V=require('./sim/economy-sim-v2.js');"
      + "process.stdout.write(JSON.stringify({on:require('./server/calendar.js').ON,s:[89,90,179,180,269,270,364,365].map(E.seasonOf),v:[89,90,269,270].map(V.seasonOf),l:E.calendarOf(400).label,m:[0,32,95,300].map(C.monthOf),yd:E.yearDaysOf(),t:V.temperatureAt(100,null,0)}))";
    let out = null;
    try { out = JSON.parse(cp.execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: Object.assign({}, process.env, { T570_CALENDAR: '0' }), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').pop()); } catch (e) { out = null; }
    ok(!!out && out.on === false, '(상황) 끔 프로세스를 띄웠다', out ? 'ON=false' : '실패');
    if (out) {
      ok(out.s.join(',') === 'spring,summer,summer,autumn,autumn,winter,winter,spring' && out.v.join(',') === 'spring,summer,autumn,winter',
        '★★⑨ 끔 — events·econ 계절이 옛 경계 그대로', out.s.join(','));
      ok(out.l === '1년 봄 36일' && out.yd === 365, '⑨ 끔 — 옛 화면 글자(day 400 = "1년 봄 36일")', out.l);
      ok(out.m.join(',') === '3,4,6,12', '⑨ 끔 — 옛 달(계절 셋 쪼개기 + 앵커 3)', out.m.join(','));
      const old = 12 + 12 * -Math.cos(2 * Math.PI * (100 - 315) / 365);
      ok(Math.abs(out.t - old) < 1e-12, '⑨ 끔 — 옛 기온 식 그대로(doy 315 코사인)', `${out.t.toFixed(4)} = ${old.toFixed(4)}`);
    }
  }
  say('\n⑩ [T570] 사본 0 — 계절 산수가 달력 정본 밖에 다시 적히지 않았다');
  {
    const files = ['sim/economy-sim-v2.js', 'server/events.js', 'server/crops.js', 'server/freshfish.js', 'server/trees.js', 'server/winter.js', 'server/weather.js', 'server/zone.js', 'server/villages.js', 'server/chunk.js'];
    const hits = [];
    for (const f of files) {
      const src = codeOnly(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      // 끔 갈래의 옛 글자 두 줄(econ 기온 `doy` · events 옛 거울)만 허용 — 그 밖은 사본이다.
      const LEGACY = [/const doy = \(\(day % 365\) \+ 365\) % 365;/, /const d = \(\(day % 365\) \+ 365\) % 365;/];
      src.split('\n').forEach((ln, i) => { if (/%\s*36[05]\b/.test(ln) && !/T570_CALENDAR|CAL\.ON|Cal\.ON|_Cal\.ON/.test(ln) && !LEGACY.some((r) => r.test(ln))) hits.push(`${f}:${i + 1}`); });
    }
    // 끔 갈래(옛 글자)는 같은 줄의 손잡이 갈래 안에 있다 — 그 밖의 `% 365`·`% 360` 은 사본이다.
    const evSrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'events.js'), 'utf8'));
    const evLegacy = (evSrc.match(/%\s*365/g) || []).length;
    ok(hits.length === 0, '★★⑩ econ·작물·물고기·열매·겨울·존 — 손잡이 밖 `% 365`/`% 360` 0곳', hits.join(' ') || '0곳');
    ok(evLegacy <= 2, '⑩ events.js 의 `% 365` 는 끔 갈래(옛 거울 한 줄)뿐', `${evLegacy}회`);
    const bsrc = fs.readFileSync(path.join(ROOT, 'sim', 'build-econ-bundle.js'), 'utf8');
    ok(/server\/calendar\.js/.test(bsrc) && /modules\.cal/.test(bsrc), '★⑩ econ 번들이 달력 정본을 같이 싣는다(랩 인라인도 같은 소스)');
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})();
