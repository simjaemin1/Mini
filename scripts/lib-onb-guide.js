// (@regress 없음 — 자의 부품 · T1377 ① · 제품 무변)
// === scripts/lib-onb-guide.js — 「지금 할 일」 칸(안내 글 · 화살)이 말한 것을 손 한 수로 옮긴다 ====================
//
// ★왜 [T1368 회부 5 · 카드 T1377 ①] 첫 30분 실클라 봇(`e2e-first30 --panel-bot --own`)은 칸이 '도구' 단계일 때만 칸을 따랐다.
//   제 집 줄기 칸(`onbOwnPlan`)이 화살로 가리키는 나무 · 바위 · 내 터를 안 보고, 화면에 보이는 소스를 제 차례로 찾아 헤맸다(탐색 6분 × n).
//   ⇒ 봇이 걸리는 분은 그 자의 값이었지 사람 손의 분이 아니었다.
// ★이 파일은 칸 한 벌(클라가 그린 그대로 — `window.__t1064Next()` · 제품 `onbNextPlan` 의 돌려준 값)을 받아 "무엇을 할까" 한 수를 낸다.
//   읽는 것은 사람이 보는 것뿐이다 — 단계(stage) · 칸 글의 구조(step) · 화살 자리(target) · 단추(btn). 서버 상태(`own.rock` 등)는 안 읽는다.
// ★순수 함수 — DOM · 서버 · 시계 0. 하네스(`test-t1377-onb-guide`)가 제품 `onbNextPlan` 이 낸 칸을 넣어 그대로 부른다.
//
// guideAct(plan) → null | { do, ... }
//   do 'tool'   — 칸이 도구 막힘을 말한다(만들기 · 손에 들기 · 맨손 줍기 · 캐기) → 칸의 step 그대로
//   do 'gather' — 칸이 재료 자리를 화살로 가리킨다 → 그 자리로 가서 그것(나무 · 바위)을 E
//   do 'claim'  — 칸이 집터 잡기 단추를 말한다 → C
//   do 'goto'   — 칸이 화살만 준다(내 터 · 빈터) → 그 자리로
//   do 'hut'    — 칸이 "터 안에서 움집 터파기"를 말한다(화살 없음 = 이미 터 안)
'use strict';
const NOUN_RES = { 나무: 'tree', 바위: 'rock' };
const NOUN_ITEM = { 나무: 'wood', 바위: 'stone' };
function guideAct(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const st = plan.stage, tg = plan.target && Number.isFinite(plan.target.x) && Number.isFinite(plan.target.y) ? { x: plan.target.x, y: plan.target.y } : null;
  if (st === 'tool') return plan.step ? { do: 'tool', step: plan.step } : null;
  if (st === 'gather') {
    //   무엇을 — 칸 글이 말한 그대로("나무 곁에서 …" · "바위 곁에서 …"). 화면 칸(`__t1064Next`)은 글을 한 줄로 이어 주고 `noun` 칸이 없다 —
    //   제품 고르기 함수(`onbNextPlan`)가 낸 칸이면 `noun` 이 있다(같은 뜻 · 하네스가 둘 다 넣는다).
    const txt = Array.isArray(plan.guide) ? plan.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : String(x)).join('') : String(plan.guide || '');
    const noun = plan.noun || (/나무 곁에서/.test(txt) ? '나무' : /바위 곁에서/.test(txt) ? '바위' : null);
    const res = NOUN_RES[noun] || null;
    if (!tg || !res) return null;
    return { do: 'gather', target: tg, res, item: NOUN_ITEM[noun] };
  }
  if (st === 'claim') {
    if (plan.btn === 'claim') return { do: 'claim' };
    return tg ? { do: 'goto', target: tg, why: 'claim' } : null;
  }
  if (st === 'build') return tg ? { do: 'goto', target: tg, why: 'build' } : { do: 'hut' };
  return null;
}
module.exports = { guideAct };
