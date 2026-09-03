'use strict';
// === server/notice.js — 알림의 **경계**. 이모지를 여기서 걷고 `kind` 로 바꾼다 ===========
//
// ★[재민 확정 2026-09-03 · T78] UI 이모지 0(`설계/설계_화면규칙_B_먹선.md` §1-2).
//   T71 ⓑ 가 이 카드의 전제를 세웠다: **알림에는 유형 필드가 없다.** `zone.js` 는
//   `send(ws, { type:'notice', text })` 로만 보내고 클라는 `showNotice(msg.text)` 로 문자열만 그린다.
//   ⇒ 그 문장들에서 이모지는 **알림 종류를 나르는 유일한 표시**였다. 그냥 빼면 정보가 준다.
//
// ★★그래서 322곳을 고치지 않는다 — **경계 하나**에서 접두 이모지를 `kind` 로 옮기고 글자를 뺀다.
//   호출부는 종전처럼 이모지를 적어도 되고(원문 청소는 각 영역 몫 · 회부), 화면엔 안 나간다.
//   ⇒ 되돌리는 법도 한 줄이다: `zone.js send()` 의 통과 한 줄을 빼면 종전 동작 그대로다.
//
// ★실측이 이 설계를 정당화한다(T78 §0 · AST 전수): 알림 리터럴 324건 중 **이모지가 있는 건 92건**뿐이고
//   접두는 39종이다. 39종은 체계가 아니라 **장식**에 가깝다 — 그래서 8종으로 접었다.
//   접는 기준은 "그 알림이 무엇에 대한 것인가"이지 그림이 아니다.
//
// ⚠이 파일은 **뜻을 바꾸지 않는다**: 글자만 뺀다. 문장의 정보는 말이 나르고, 종류는 `kind` 가 나른다.
// ⚠클라는 아직 `kind` 를 안 읽는다(`30-n-net.js` 는 `text` 만 본다) — 선 아이콘은 T66/T68 몫이다.
//   그래서 오늘 화면에서 달라지는 것은 **이모지가 사라진 것 하나**다.

const VS16 = '️';          // 변이 선택자 — 이모지 뒤에 붙는 보이지 않는 글자
const ZWJ = '‍';           // 이어붙임(🏴‍☠️ 같은 합자)
const TONE = '[\\u{1F3FB}-\\u{1F3FF}]';   // 피부색 수정자
const PICTO = '\\p{Extended_Pictographic}';
// 한 덩이의 이모지(합자·변이·피부색까지) — 낱글자로 자르면 ZWJ 찌꺼기가 남는다
const CLUSTER = new RegExp(
  `${PICTO}(?:${VS16}|${TONE})*(?:${ZWJ}${PICTO}(?:${VS16}|${TONE})*)*`, 'gu');
const LEAD = new RegExp(
  `^\\s*(${PICTO}(?:${VS16}|${TONE})*(?:${ZWJ}${PICTO}(?:${VS16}|${TONE})*)*)`, 'u');

// ── 접두 이모지 → `kind` (T78 §0-ⓐ 실측 39종을 8종으로) ───────────────────────
//   ★`kind` 는 **영문 소문자 하나**다 — T66 이 선 아이콘 키로 그대로 쓴다.
//   ★모르는 이모지는 `info` 다. 표에 없다고 알림이 막히면 그게 더 나쁘다(문장은 그대로 간다).
//   ★키는 **변이 선택자를 뺀 기본 코드포인트**다(🏘️ 와 🏘 를 같은 것으로 본다).
const KIND_OF = {
  // village — 마을·길드 시설(실측 접두 22건: 🏘13 🏠6 🏛1 🏚1 🔒1)
  '🏘': 'village', '🏠': 'village', '🏛': 'village', '🏚': 'village', '🏡': 'village', '🔒': 'village',
  // gather — 줍기·캐기·베기·심기(15건)
  '🪵': 'gather', '⛏': 'gather', '🤏': 'gather', '🪓': 'gather', '🌱': 'gather', '🌾': 'gather', '☄': 'gather',
  '🫐': 'gather', '🍄': 'gather',
  // fishing — 낚시와 물(12건)
  '🎣': 'fishing', '🌊': 'fishing', '🐟': 'fishing', '💧': 'fishing',
  // craft — 불·가마·그릇·연장(11건)
  '🔥': 'craft', '🏺': 'craft', '⚒': 'craft', '🧂': 'craft', '🔧': 'craft', '✅': 'craft', '🏭': 'craft',
  // board — 게시판·거래소·연표·겨울 몫(9건)
  '🏪': 'board', '📋': 'board', '📜': 'board', '🧊': 'board', '💰': 'board', '📦': 'board',
  // rescue — 쓰러짐·구조·몸(9건)
  '🤚': 'rescue', '🫂': 'rescue', '🩹': 'rescue', '🩺': 'rescue', '🫳': 'rescue', '⚰': 'rescue',
  '🤝': 'rescue', '🥣': 'rescue', '🗣': 'rescue', '💀': 'rescue',
  // combat — 싸움과 약탈(4건)
  '⚔': 'combat', '🗡': 'combat', '🏴': 'combat', '💥': 'combat', '🐺': 'combat', '☠': 'combat',
  // dev — 테스트 픽스처(4건 · E2E_GIVE 갈래에서만 난다)
  '🧪': 'dev', '🤖': 'dev',
};
const KINDS = ['village', 'gather', 'fishing', 'craft', 'board', 'rescue', 'combat', 'dev', 'info'];

const _base = (s) => String(s).split(VS16).join('').split(ZWJ)[0];

// 이모지를 걷고 **그 자리에 생긴 공백만** 정리한다.
//   ⚠줄바꿈은 건드리지 않는다(여러 줄짜리 알림이 있고, 하네스도 줄 수를 본다).
//   ⚠★**이모지가 없던 줄은 한 바이트도 안 건드린다** — 들여쓴 목록 줄(` · 돌 2`)의 앞 공백까지
//     정리해 버리면 그건 "글자만 뺀다"가 아니라 **모양을 바꾼 것**이다(뜻 무변 규칙 위반).
function stripEmoji(s) {
  const src = String(s == null ? '' : s);
  const out = src.split('\n').map((line) => {
    const cleaned = line.replace(CLUSTER, '');
    if (cleaned === line) return line;                      // 이 줄엔 이모지가 없었다 — 그대로
    return cleaned.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');
  }).join('\n');
  // 앞뒤 빈 줄·공백만 턴다(가운데 줄은 위에서 이미 정한 대로)
  return out.replace(/^[\s\uFEFF]+/, '').replace(/[ \t]+$/, '');
}

// 접두 이모지 → kind. 없으면 null(호출부가 `info` 로 접는다)
function kindOfText(s) {
  const m = String(s == null ? '' : s).match(LEAD);
  if (!m) return null;
  return KIND_OF[_base(m[1])] || null;
}

// ── 경계 — `send()` 가 알림을 내보내기 직전에 딱 한 번 부른다 ────────────────
//   ⚠`type:'notice'` 가 아니면 **그대로 돌려준다**(경계가 다른 메시지를 건드리면 안 된다).
//   ⚠호출부가 이미 `kind` 를 실었으면 그걸 존중한다 — 나중에 원문을 청소할 때
//     이모지를 지우면서 `kind` 를 손으로 다는 길을 막지 않는다(영역별 회부).
function normalize(obj) {
  if (!obj || obj.type !== 'notice') return obj;
  // ★경계가 **말을 삼키면 안 된다**: 여기서 예외가 나면 `send()` 가 통째로 죽어 알림이 사라진다.
  //   무슨 일이 있어도 원문을 돌려주는 쪽이 낫다(이모지가 남는 것보다 말이 없어지는 게 나쁘다).
  try {
    const text = stripEmoji(obj.text);
    const kind = obj.kind || kindOfText(obj.text) || 'info';
    return Object.assign({}, obj, { kind, text });
  } catch (e) { return obj; }
}

module.exports = { normalize, stripEmoji, kindOfText, KIND_OF, KINDS, CLUSTER, LEAD };
