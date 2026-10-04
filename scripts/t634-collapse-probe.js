// (@regress 없음 — 러너 밖 · T634 붕괴 셋 ⓑ 계측기 · 제품 무변)
// === scripts/t634-collapse-probe.js — 서버 판 자(`t577-server-run.js`)에 얹는 **첫해 겨울 굶음 · 곳간 곡물** 관찰자 ==========
//   쓰는 법(서버 판 자의 아이 존이 env 를 물려받는다 — 자식에게만 켜진다):
//     NODE_OPTIONS="--require $PWD/scripts/t634-collapse-probe.js" T400_BUILD_ACT=0 T577_DIR=<dir> node scripts/t577-server-run.js 400 1020,7,42
//     ⇒ 판마다 `<T577_OUT>.t634.json`(판 JSON 옆) · 부모(자 본체)에선 `T577_OUT` 이 없어 아무것도 안 한다.
//   ★잰다(마을마다 · 하루 마감마다 — 서버 장부 `Events.createLedger().scanDay(world, day)` 가 받는 그 world):
//     · 기근 날 = 정본 술어 그대로 — `villages.villageFamine` 의 그 부호(econ `_dpDebug.hunger < 0` · T159 · 몸 층 T590 이 `starve` 로 세는 그 날)
//     · 그날 죽음 = econ `_deadTot` 증분(인구식이 뺀 사람 · 읽기만) — 기근 날의 죽음 = 굶어 죽음(T590 `noteBodyExit` 와 같은 갈래)
//     · 곳간 곡물 = 서버 판 여덟 수의 `grain` 과 같은 합(밀·쌀·보리·조 — `t577-server-hook.js finish`)
//     · 인구 = `npcs.length`
//   ★첫해 겨울 = 달력 정본 `[1년 12월 1일, 2년 3월 1일)` (`calendar.dayOf`) — 날을 여기 적지 않는다.
//   ★관찰만 한다 — 장부 함수를 감싸 **같은 인수를 그대로** 넘기고 읽기만 한다(세계에 0). 서버 판 훅(t577)이 끝 날에
//     `process.exit(0)` 하므로 그날 줄은 **원래 함수를 부르기 전에** 적고, 파일은 `exit` 에서 쓴다.
'use strict';
const OUT0 = process.env.T577_OUT || '';
if (OUT0) {
  const path = require('path');
  const fs = require('fs');
  const ROOT = path.join(__dirname, '..');
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const Cal = require(path.join(ROOT, 'server', 'calendar'));
  const OUT = OUT0 + '.t634.json';
  const W0 = Cal.dayOf(1, 12, 1), W1 = Cal.dayOf(2, 3, 1);
  const GRAIN = ['wheat', 'rice', 'barley', 'millet'];   // t577-server-hook finish 의 `grain` 과 같은 합
  let names = null, last = -1;
  const prevDead = [];
  const S = [];   // 마을마다 { pop:[], grain:[], famine:[], dead:[] } — 날 순서(하루 한 줄)
  const days = [];
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          const V = world.villages || [];
          if (!names) { names = V.map((v) => v.name); for (let i = 0; i < V.length; i++) { S.push({ pop: [], grain: [], famine: [], dead: [] }); prevDead.push(V[i]._deadTot || 0); } }
          days.push(d);
          for (let i = 0; i < V.length && i < S.length; i++) {
            const v = V[i], st = v.storage || {}, dbg = v._dpDebug;
            const dt = v._deadTot || 0;
            S[i].pop.push((v.npcs || []).length);
            S[i].grain.push(+GRAIN.reduce((a, r) => a + (st[r] || 0), 0).toFixed(2));
            S[i].famine.push(dbg && Number.isFinite(dbg.hunger) && dbg.hunger < 0 ? 1 : 0);
            S[i].dead.push(Math.max(0, dt - prevDead[i]));
            prevDead[i] = dt;
          }
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
  process.on('exit', () => {
    try {
      const Crops = require(path.join(ROOT, 'server', 'crops'));
      fs.writeFileSync(OUT, JSON.stringify({ T594_CROP_CAL: Crops.T594_CROP_CAL, firstWinter: [W0, W1], names, days, v: S }));
    } catch (e) {}
  });
}
