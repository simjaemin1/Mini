// === scripts/t491-injure-probe.js — "나무꾼이 앓은 날" 판 — 한 마을 나무꾼 몸을 **정해진 날에만** 다치게 한다(T491 ④ 대조 · 계측 전용) =====
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 레포 코드는 한 글자도 안 만진다 — 몸의 `hp` 한 칸만 쓴다(존 틱 사이 · 1초 표본 자리).
//   `scripts/t491-probe.js`(몸 × 날 · 마을 하루 줄)를 같이 싣는다.
// ★왜 — T449 ② 의 25배는 **나무꾼 몸이 요양한 빈손 날**에 섰다(켬 판 14일). 그런 날은 판마다 오거나 안 온다(몹 · 부상 — 주사위가 아니라 세계의 사정).
//   그 날을 **같은 날 · 같은 몸**으로 세 팔에 똑같이 세워 끔 · T449 켬 · T491 켬 이 그날 무엇을 내는지 나란히 본다.
// ★`T491_INJURE_VIL`(마을 이름) · `T491_INJURE_DAYS`(기본 "2,3" — 이 존이 본 **몇째 게임일**에 다치게 하나 · 1 = 부팅한 그날)
//   그날이 처음 보인 표본에 그 마을 `simJob === 'lumberjack'` 몸의 hp 를 `maxHp × 0.3` 으로 — 요양 문턱(`SCH_REST_IN` 60 %) 아래 ⇒ 다음 결정에 `요양`.
//   ⚠0.3 은 계측 판의 값이다(제품 수가 아니다 · 요양 문턱 아래이기만 하면 된다). 회복은 제품 규칙 그대로(`_lifeDaily` 일일 회복 · 만피에 풀린다).
'use strict';
require('./t491-probe.js');
const VIL = process.env.T491_INJURE_VIL || '';
const DAYS = new Set((process.env.T491_INJURE_DAYS || '2,3').split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0));
const seen = []; const done = new Set(); const log = [];
globalThis.__t491injure = () => ({ vil: VIL, days: [...DAYS], seen: seen.slice(), log: log.slice() });
setInterval(() => {
  try {
    const F = globalThis.__t491fn; if (!VIL || !F || !F.state || !F.state.world || !F.state.deps) return;
    const d = F.state.world.day; if (seen[seen.length - 1] !== d) seen.push(d);
    const nth = seen.length; if (!DAYS.has(nth) || done.has(d)) return;
    const vil = (F.state.villages || []).find((v) => v.name === VIL); if (!vil) return;
    const pl = F.state.deps.players; let n = 0;
    for (const pid of vil.npcPids || []) { const p = pl && pl.get(pid); if (!p || p.simJob !== 'lumberjack') continue; p.hp = (p.maxHp || 100) * 0.3; n++; }
    done.add(d); log.push({ t: Date.now(), day: d, nth, n });
    console.log(`[t491-injure] ${VIL} 게임일 ${d}(${nth}째) 나무꾼 몸 ${n} — hp 30 %`);
  } catch (e) { /* 계측기 — 존을 안 멈춘다 */ }
}, 1000).unref();
