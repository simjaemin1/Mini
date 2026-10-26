'use strict';
// (@regress 없음 — 러너 밖 · T944 랩 쪽 갈림 대조 자 · 제품 무변)
// === scripts/lab-diverge-ctl.js — 랩 자(`t17-metrics.js` · `t176-ab.js`) 곁 프리로드 · 사건 하나만 비켜 간다 ==========
//
// ★왜 [T932 회부 1 · T944] T837 갈림 대조(`scripts/diverge-ctl.js` · `raid:n` — 습격 조우 하나 빼기)는 습격이 있는 서버 판 자에서만 선다.
//   랩 판엔 습격 조우가 없다(판 사건 셈 `CARAVAN_RAIDED 0` · 도적 층은 서버에만 있다) ⇒ 랩 판은 판 하나가 곧 띠(폭 0)였고,
//   랩 판끼리 견준 차가 갈래의 몫인지 흔들림인지 못 갈랐다(T932 §2-4 · 열넷째 판 시드 7 농촌18 소멸).
//   ⇒ 랩에도 있는 사건 하나 — **n 번째 사냥 하나만 빈손** — 으로 같은 판을 k 판 더 돌려 셈마다 대조 띠(판 + 대조 k 판의 최소 ~ 최대)를 세운다
//     (T837 과 같은 잣대 · 판정 0 — 표만).
//
// 쓰는 법(env 는 이 프리로드만 읽는다 · 제품 손잡이는 부르는 쪽 env 그대로):
//   LDCTL_SKIP=hunt:n NODE_OPTIONS="-r $PWD/scripts/lab-diverge-ctl.js" node scripts/t17-metrics.js 800 1020
//   hunt:n — econ `tickVillage` 사냥꾼 갈래가 `world.huntIncomeFn` 을 부른 사냥(몫 > 0) 을 차례로 보며, **n 번째로 사냥이 선 마을의 첫 사냥** 하나만 0 을 돌려준다
//            = 그날 그 사냥꾼이 빈손으로 돌아왔다(고기 · 가죽 · 뼈 … 부산물이 다 그 몫을 따른다 — econ 의 그 문 규약 · 몸 · 숙련 xp 는 그대로).
//            ⚠"n 번째 사냥"(같은 마을 · 같은 날 · 같은 몫의 사냥꾼 n 명)으로 세면 셋이 **같은 사건**이 된다 — 그 마을 곳간에 같은 몫이 빈다(첫 시험 판 60날 바이트 같음 · 보고 T944 §1).
//              그래서 마을이 다른 사건 셋으로 센다(첫날 사냥한 마을 차례 1 · 2 · 3번째 — 결정론 · 마을 차례는 세계 마을 배열 그대로).
//            n 은 1 · 2 · 3(k = 3 — T837 꼴). 나머지 사냥은 받은 몫을 **그대로** 돌려준다(새 수 0).
//   hunt:0 — 문만 심고 아무것도 안 비킨다(문이 세계를 안 바꾸는지 보는 판 — 끔 판과 판 JSON 바이트가 같아야 한다).
//   없음   — 문을 안 심는다(끔 = 랩 판 그대로).
//   ⚠랩 자는 사냥을 주입하지 않는다(`huntIncomeFn` 없음 = 추상 사냥 `base × landBoost × 숙련 × 도구 × 입력`). 그 문을 심으면 econ 은
//     사냥꾼마다 `npc._t172mul` 을 적는다 — 서버 몸 코드만 읽는 칸이라(랩 자 · econ 은 안 읽는다) 세계에 0 이다(hunt:0 판이 증인).
//   ⚠이미 심긴 `huntIncomeFn` 이 있으면(랩 HTML · 다른 자) 그것을 부른 값을 받아 같은 규약으로 비킨다(감싼다).
//   ⇒ LDCTL_OUT(없으면 <T17_JSON | T176_JSON 에서 .json 뗀 것>.ldctl.json):
//     { skip, skipped: [날 · 마을 · 주민 id · 그 사냥 몫], seen(몫 > 0 사냥 수 · 판 전체), seenDay1, villages(사냥이 선 마을 수), hooked }
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!/scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1)) return;
const SK = /^hunt:([0-9]+)$/.exec(process.env.LDCTL_SKIP || '');
if (!SK) return;   // 끔 — 문을 안 심는다
const N = +SK[1];
const J0 = process.env.T17_JSON || process.env.T176_JSON || '';
const OUT = process.env.LDCTL_OUT || (J0 ? J0.replace(/\.json$/, '') + '.ldctl.json' : '');
const ROOT = path.join(__dirname, '..');
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const rec = { ver: 2, skip: { kind: 'hunt', n: N }, skipped: [], seen: 0, seenDay1: 0, villages: 0, hooked: 0 };
const _vSeen = new WeakSet();   // 사냥이 선 마을(차례 셈 — 마을 객체 무접촉)
function install(world) {
  if (!world || (world.huntIncomeFn && world.huntIncomeFn._ldctl)) return;
  const prev = typeof world.huntIncomeFn === 'function' ? world.huntIncomeFn : null;
  const f = function (v, npc, baseAmt, mul) {
    let amt = baseAmt;
    if (prev) { const r = prev.apply(this, arguments); if (typeof r === 'number' && r >= 0) amt = r; }
    if (amt > 0) {
      rec.seen++;
      const d = (v && v._world && v._world.day) || 0;
      if (d <= 1) rec.seenDay1++;
      if (v && !_vSeen.has(v)) {   // 이 마을의 첫 사냥
        _vSeen.add(v); rec.villages++;
        if (N > 0 && !rec.skipped.length && rec.villages === N) { rec.skipped.push([d, v.name, npc && npc.id, +(+amt).toFixed(6)]); return 0; }
      }
    }
    return prev ? amt : baseAmt;
  };
  f._ldctl = 1; world.huntIncomeFn = f; rec.hooked++;
}
const cw = V2.createWorldV2;
V2.createWorldV2 = function () { const w = cw.apply(this, arguments); try { install(w); } catch (e) { console.error('[ldctl] 문 심기 실패:', e.message); } return w; };
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
