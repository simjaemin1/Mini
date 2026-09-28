// === scripts/t496-geo-preload.js — 자(`t17-metrics` · `t176-ab`)를 **글자 그대로** 돌리며 장부에 지리를 준다(`node -r`) ===
//
// ⚠**표 짜는 기계의 부품이다. 하네스가 아니다** — 러너에 넣지 않는다.
//
// ★왜 [T496 ① — 소문 분리 기본 켬의 "두 자 3시드 바이트 동일"]
//   두 자는 장부에 지리를 안 준다(`Events.createLedger({ … })` 에 `geo` 없음) ⇒ 장부 안 소문 그래프가 **안 돈다**.
//   그 판으로 "소문 시계를 바꿔도 세계가 같다"를 재면 **자명 통과**다(소문 모듈이 로드조차 안 된다).
//   ⇒ 이 preload 가 두 자의 문 둘에 **관측만** 거는 줄을 단다(`scripts/t474-arm.js` 의 `T474_ARM_GEO` 와 같은 수법 · 사본 0):
//     ⓐ `economy-sim-v2.createWorldV2` — 돌려주는 세계를 붙든다(값·순서 무변)
//     ⓑ `events.createLedger` — `o.geo` 가 없으면 지리를 넣는다: 마을 = 세계 `villages` 의 자리(두 자의 `vidOf` 가 자리 번호다) ·
//        거리 = econ 정본 접근자 `villageDist`(행렬이 있으면 행렬 · 없으면 econ 좌표 유클리드 — `rumor.js` 제4 규약의 그 문)
//   장부의 사건 방출은 소문을 안 읽는다(`events.js` — RUMOR 는 조회 쪽에만) ⇒ 지리를 줘도 자의 JSON 이 **그대로**여야 한다.
//   ★자가 env 를 먼저 세우는 순서(`ENABLE_VILLAGES`·`DB_PATH` — 두 자 머리)를 안 흔든다: 여기선 아무 모듈도 **먼저 로드하지 않는다** —
//     `Module._load` 에 귀를 대고 자가 그 두 모듈을 **처음 부르는 순간** 감싼다.
//   판 끝에 장부 소문 그래프가 실제로 돌았는지(속도 · 걸음 · 적중)를 stderr 한 줄로 남긴다(`[geo-preload]`).
//
// 실행: node -r ./scripts/t496-geo-preload.js scripts/t176-ab.js 800 <시드>      (T176_JSON=… 그대로)
'use strict';
const Module = require('module');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const V2_PATH = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const EV_PATH = path.join(ROOT, 'server', 'events.js');
const V1_PATH = path.join(ROOT, 'sim', 'economy-sim.js');
const RU_PATH = path.join(ROOT, 'server', 'rumor.js');

let W = null, LEDGER = null, doneV = false, doneE = false, injected = false;
const _load = Module._load;
Module._load = function (request, parent, isMain) {
  const exp = _load.apply(this, arguments);
  if (doneV && doneE) return exp;
  let file = null;
  try { file = Module._resolveFilename(request, parent, isMain); } catch (e) { return exp; }
  if (!doneV && file === V2_PATH && exp && typeof exp.createWorldV2 === 'function') {
    doneV = true;
    const cw = exp.createWorldV2;
    exp.createWorldV2 = function (...a) { const w = cw.apply(this, a); W = w; return w; };
  }
  if (!doneE && file === EV_PATH && exp && typeof exp.createLedger === 'function') {
    doneE = true;
    const cl = exp.createLedger;
    exp.createLedger = function (o) {
      const extra = {};
      if (W && !(o && o.geo)) {
        const v1 = require(V1_PATH);
        const w = W;   // 자가 `world.villages` 를 갈아 끼워도(t176) 같은 세계 객체 — 조회 때 지금 배열을 읽는다
        extra.geo = { vids: () => w.villages.map((_, i) => i), dist: (a, b) => v1.villageDist(w.villages[a], w.villages[b]) };
        injected = true;
      }
      LEDGER = cl.call(this, Object.assign({}, o, extra));
      return LEDGER;
    };
  }
  return exp;
};
process.on('exit', () => {
  let speed = null; try { speed = require(RU_PATH).CFG.SPEED; } catch (e) { speed = null; }
  const st = LEDGER && LEDGER.hasRumor ? JSON.stringify(LEDGER.rumorStats || {}) : '없음';
  process.stderr.write(`[geo-preload] 지리 ${injected ? '줌' : '안 줌'} · 장부 소문 그래프 ${LEDGER && LEDGER.hasRumor ? '돎' : '없음'} · 소문 시계 ${speed} · ${st}\n`);
});
