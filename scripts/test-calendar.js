#!/usr/bin/env node
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
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

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
    say('       (옛 "2~3주차" 목표는 폐기됐다. 겨울 난이도는 온도·완충으로 조정한다.)');
    // 캐논이 실제로 그대로인지 못 박는다 — 누가 조용히 늘리면 여기서 걸린다.
    ok(YD === 365, '★★⑤ 한 해가 **365 게임일** 그대로다(시간 구조 불변 캐논)', `${YD}일`);
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})();
