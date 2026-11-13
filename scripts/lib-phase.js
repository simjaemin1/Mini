'use strict';
// (@regress 없음 — 러너 밖 · 공용 자 · 제품 무변)
// === scripts/lib-phase.js — 벽시계 판의 **띄운 시각 낮밤** 고정 정본 한 자리(T1299 · T1287 회부 2 — 게이트 0시 고정 함수를 공용으로) ===========
//
// ★왜 [T1287] 몸의 일과(`villages.js` 스케줄 게이트) · 날씨 시각(`weather.js` hourFrac) · 들짐승 · 눈은 `zone-config` `worldPhase(Date.now())`
//   (`worldEpoch` 0 · 하루 24분 · 0.7 = 밤 시작 = 게임 16.8시)를 읽는다. 가상 시계 판(`t745-vclock` V0 = 2026-01-01T00:00Z)은 늘 게임 0시에서
//   출발하는데 벽시계 판은 **띄운 실제 시각의 게임 시각**에서 출발해, 같은 판이 띄운 시각에 따라 몸이 일하거나 잔다(T1287 미끼 ④ 20판 중 6판).
// ★이 자 — 이 프로세스의 벽시계(`Date.now` · 인수 없는 `new Date()` · `Date()`)를 **상수 하나**만큼 옮겨 지금 순간을 게임 `hour` 시에 둔다.
//   흐름 · 간격 · 단조 시계(`performance.now`) · 타이머는 그대로(상수 차만) · 세계 값 · 차례 무변 · 제품 파일 0.
//   상수는 env `T1299_PHASE_OFF`(ms)로 아이 프로세스에 물린다 — 한 판의 프로세스 묶음(하네스 · central · zone)이 **같은 상수**로 옮겨져
//   서로 시각이 안 어긋난다(먼저 건 프로세스가 정하고 env 에 적는다). 옮김 폭은 (−12분, +12분] 안(클라가 서버 시계 차를 보정하는 폭을 작게).
//   한 프로세스에 두 번 걸리면 두 번째는 아무것도 안 한다(같은 상수).
// 부르는 곳: `t1268-tick-meter.js`(게이트 굽기 판 · 0시 · `T1287_PHASE0=1`) · `phase-pin.js`(프리로드 · `T1299_PHASE_HOUR=h` — 하네스 묶음 · 전수 판).
// ⚠정본 한 자리 — `Date` 를 옮기는 글자를 다른 파일에 베끼지 않는다(`test-harness-lint` ⑯ 이 잡는다 · 가상 시계 `t745-vclock` 은 시각 자체를 대신하는 다른 자라 표에 둔다).
const DAY = 24 * 60 * 1000;   // zone-config WORLD.dayLengthMs (프리로드는 zone-config 를 먼저 안 싣는다 — `phaseOk()` 로 판 끝에 맞대 본다)
const ENV = 'T1299_PHASE_OFF';
function hourOf(ms) { return +((((ms % DAY) + DAY) % DAY) / DAY * 24).toFixed(2); }
function pin(hour) {
  if (global.__t1299Phase) return global.__t1299Phase;
  const RD = Date, rnow = RD.now.bind(RD);
  let off = parseFloat(process.env[ENV]);
  if (!Number.isFinite(off)) {
    const want = (((+hour || 0) % 24) + 24) % 24 / 24 * DAY;
    off = want - (rnow() % DAY);
    if (off > DAY / 2) off -= DAY; else if (off <= -DAY / 2) off += DAY;
    process.env[ENV] = String(off);
  }
  //   아이 프로세스(central · zone · 판 자 아이)도 같은 상수로 — 프리로드 `phase-pin.js` 를 NODE_OPTIONS 에 얹는다(이미 있으면 그대로)
  if (process.env.T1299_PHASE_HOUR == null || process.env.T1299_PHASE_HOUR === '') process.env.T1299_PHASE_HOUR = String(+hour || 0);
  { const PP = require('path').join(__dirname, 'phase-pin.js'), NO = process.env.NODE_OPTIONS || ''; if (!NO.includes(PP)) process.env.NODE_OPTIONS = `${NO} --require ${PP}`.trim(); }
  const PDate = function (...a) { if (!new.target) return new RD(rnow() + off).toString(); return a.length ? new RD(...a) : new RD(rnow() + off); };
  PDate.prototype = RD.prototype; Object.setPrototypeOf(PDate, RD);
  PDate.now = () => rnow() + off; PDate.parse = RD.parse; PDate.UTC = RD.UTC;
  global.Date = PDate;
  global.__t1299Phase = { off, hour: +hour || 0, at: hourOf(rnow() + off) };
  return global.__t1299Phase;
}
//   zone-config 가 실렸으면 하루 길이 · 기점이 이 자의 가정(하루 24분 · worldEpoch 0)과 맞나 — 안 맞으면 고정한 시각이 게임 시각이 아니다
function phaseOk() { try { const z = require.cache[require('path').join(__dirname, '..', 'server', 'zone-config.js')]; return !!(z && z.exports.WORLD && z.exports.WORLD.dayLengthMs === DAY && !z.exports.WORLD.worldEpoch); } catch (e) { return false; } }
//   ★[T1299 ①] 띄운 시각(게임 06시 · 18시 두 판)에 결과가 갈린 하네스 — 판 머리에서 `pin(h)` 로 고정한다(`test-harness-lint` ⑯a 가 이 표를 본다 · 보고/T1299 §1).
const MUST = [];
module.exports = { pin, phaseOk, hourOf, DAY, ENV, MUST };
