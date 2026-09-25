#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(브라우저 0 · R&D-01)
// === scripts/test-bgm-phrase.js — 대금 프레이즈 제어 계약 ========================
//
// 제품 AudioContext를 흉내 내지 않는다. `planPerformancePhrase()`는 score →
// expression의 순수 경계이므로 Node에서 legato/쉼/요성/퇴성을 직접 잰다.
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public/assets/audio/bgm/bgm.js');
let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (detail ? `  ${detail}` : ''));
}

let BGM = null;
try {
  (0, eval)(fs.readFileSync(SRC, 'utf8'));
  BGM = globalThis.DurangoBGM;
} catch (e) {
  ok(false, 'bgm.js를 읽어 순수 계획 함수를 열었다', String(e && e.message));
}

console.log('=== BGM R&D-01 — 대금 프레이즈 제어 계약 ===\n');
ok(BGM && typeof BGM.planPerformancePhrase === 'function', '① score → expression 순수 계획 함수가 공개돼 있다');
ok(BGM && typeof BGM.renderAriPreview === 'function', '② 4마디 A/B 미리듣기 인터페이스가 있다');

if (BGM) {
  // create()는 start 전에는 context를 쓰지 않는다. flag가 외부 객체를 붙들지 않고
  // 복사됐는지를 실제 API로 확인한다.
  const off = BGM.create({ context: {} });
  const requested = { villageDayAriDaegeum: true };
  const on = BGM.create({ context: {}, performancePhrases: requested });
  requested.villageDayAriDaegeum = false;
  ok(off._state.performancePhrases.villageDayAriDaegeum === false,
     '③ opt-in이 없으면 legacy 경로다');
  ok(on._state.performancePhrases.villageDayAriDaegeum === true,
     '④ opt-in boolean을 생성 시 복사한다(호출자 변이와 무관)');

  const events = [
    { start: 0, end: 0.60, freq: 392, amp: .40, vibCents: 0, vibDelay: .20 },
    { start: .60, end: 1.20, freq: 440, amp: .40, vibCents: 34, vibDelay: .20 },
    { start: 1.20, end: 1.80, freq: 494, amp: .40, vibCents: 36, vibDelay: .20, bendEnd: -40 }
  ];
  const before = JSON.stringify(events);
  const p = BGM.planPerformancePhrase(events, { start: 0, end: 1.8, attack: .085, release: .20, glide: .085, vibRamp: .35 });
  ok(p.notes.length === 3 && JSON.stringify(events) === before,
     '⑤ 입력 음표를 바꾸지 않고 세 음을 계획한다', `${p.notes.length}음`);
  ok(p.notes[0].reattack && !p.notes[1].reattack && p.notes[1].legato && p.notes[2].legato,
     '⑥ 첫 음만 재어택, 붙은 두 경계는 legato다');
  ok(p.notes.every((n) => n.freq > 0 && n.amp > 0) && p.notes.slice(1).every((n) => n.transition > 0),
     '⑦ 연결 음의 F0·gain 계획이 0으로 떨어지지 않는다');
  ok(p.notes[1].vibAt === p.notes[1].start && p.notes[1].vibRamp > 0,
     '⑧ 평음 → 요성은 연결 경계에서 앞 깊이로부터 ramp한다', `${p.notes[1].vibRamp.toFixed(3)}s`);
  ok(p.notes[2].bendAt > p.notes[2].start && p.notes[2].bendAt < p.notes[2].end && p.notes[2].bendFreq < p.notes[2].freq,
     '⑨ 퇴성은 음 안에서 끝나고 F0 목표가 내려간다', `${p.notes[2].bendFreq.toFixed(2)}Hz`);

  const rest = BGM.planPerformancePhrase([
    { start: 0, end: .5, freq: 392, amp: .4, vibCents: 30, vibDelay: .2 },
    { start: .8, end: 1.3, freq: 440, amp: .4, vibCents: 30, vibDelay: .2 }
  ], { start: 0, end: 1.3, attack: .085, release: .20, glide: .085, vibRamp: .35 });
  ok(rest.notes[1].reattack && !rest.notes[1].legato && rest.notes[1].gap > 0,
     '⑩ 실제 쉼 뒤에는 reattack으로 읽는다', `${rest.notes[1].gap.toFixed(3)}s 쉼`);

  const nextBar = BGM.planPerformancePhrase([
    { start: 1.8, end: 2.3, freq: 523, amp: .4, vibCents: 34, vibDelay: .2 }
  ], { start: 0, end: 2.3, attack: .085, release: .20, glide: .085, vibRamp: .35, previous: p.last });
  ok(nextBar.notes.length === 1 && nextBar.notes[0].legato && !nextBar.notes[0].reattack,
     '⑪ 마디를 나눠 공급해도 직전 마디와 legato가 이어진다');

  // 실제 본조 아리랑 8마디째는 2박만 울리고 마지막 1박이 쉰다. realtime tick은
  // 9마디를 그 쉼 뒤에야 공급할 수 있으므로, 9-bar offline만으로는 검증할 수 없다.
  // 여기서는 bar 8을 예약하는 순간 tail release가 이미 계획되는지를 순수 계약으로
  // 확인하고, 바로 다음 9마디가 reattack으로 읽히는지도 함께 본다.
  const beat = .72, bar = beat * 3;
  let prior = null, eighth = null, ninth = null;
  for (let b = 0; b < 9; b++) {
    const start = b * bar;
    const dur = b === 7 ? beat * 2 : bar;
    const q = BGM.planPerformancePhrase([
      { start, end: start + dur, freq: 392 + b, amp: .4, vibCents: 30, vibDelay: .2 }
    ], { start, end: start + bar, attack: .085, release: .20, glide: .085, vibRamp: .35, previous: prior });
    if (b === 7) eighth = q;
    if (b === 8) ninth = q;
    prior = q.last;
  }
  ok(eighth && Math.abs(eighth.tailReleaseAt - (7 * bar + beat * 2)) < 1e-9
       && ninth && ninth.notes[0].reattack && ninth.notes[0].gap > .7,
     '⑫ 8→9마디 실제 쉼은 다음 tick 전 tail release·reattack으로 계획된다');

  const emptyBar = BGM.planPerformancePhrase([], {
    start: p.last.end, end: p.last.end + bar, attack: .085, release: .20,
    glide: .085, vibRamp: .35, previous: p.last
  });
  ok(emptyBar.notes.length === 0 && emptyBar.tailReleaseAt === p.last.end,
     '⑬ event가 없는 마디도 이전 음 끝에 실제 쉼 release를 예약한다');

  const grace = BGM.planPerformancePhrase([
    { start: 0, end: .1152, freq: 440, amp: .22, vibCents: 18, vibDelay: .34, grace: true }
  ], { start: 0, end: .1152, attack: .085, release: .20, glide: .085, vibRamp: .35 });
  ok(grace.notes[0].vibAt + grace.notes[0].vibRamp <= grace.notes[0].end + 1e-9,
     '⑭ 짧은 잔가락의 요성 ramp가 다음 음 automation까지 넘지 않는다');

  const bad = BGM.planPerformancePhrase([{ start: 0, end: 0, freq: 440 }, { start: 0, end: 1, freq: -1 }], {});
  ok(bad.notes.length === 0, '⑮ 길이·F0가 성립하지 않는 음은 계획에서 뺀다');
}

const layer = fs.readFileSync(path.join(ROOT, 'public/client/48-a-audio.js'), 'utf8');
ok(!/performancePhrases/.test(layer), '⑯ 제품 소리 층은 R&D flag를 몰라 기본 라이브 경로가 바뀌지 않는다');

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
