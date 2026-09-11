// === server/credits.js — `/크레딧` : 빌린 것의 이름을 그대로 띄운다 [T168 2026-09-10] =========
//
// ★★**정본은 레포 루트의 `CREDITS.md` 하나다.** 이 파일은 그 §1 블록을 **읽기만** 한다 —
//   서버에도 클라에도 문구 사본이 없다. 라이선스가 요구하는 문장은 한 글자라도 달라지면
//   요구를 못 지킨 것이 되므로, 옮겨 적는 순간 두 벌이 갈릴 자리를 아예 안 만든다.
//
// ★문법: `CREDITS.md` 안의 두 표식 사이에서 `- ` 로 시작하는 줄만 골라 한 줄씩 알림으로 보낸다.
//   알림 스택은 셋이다(`notice.js NOTICE_MAX`) — 지금 요구 문구는 둘이라 **머리말을 안 붙인다**
//   (붙이면 맨 앞 줄이 밀려 사라진다 · T168 §0-ⓒ 실측).
//
// ★새 패널 0 · 새 클라 조건 0: 쓰는 통로는 이미 있는 `{type:'notice', text}` 뿐이다.
'use strict';
const fs = require('fs');
const path = require('path');

const CREDITS_PATH = path.join(__dirname, '..', 'CREDITS.md');
const MARK_A = '<!-- 요구문구:시작 -->';
const MARK_B = '<!-- 요구문구:끝 -->';

let _cache = null, _mtime = 0;

/** `CREDITS.md` §1 의 요구 문구 줄들. 파일이 없거나 표식이 없으면 빈 배열. */
function requiredLines() {
  let st; try { st = fs.statSync(CREDITS_PATH); } catch (e) { return []; }
  if (_cache && st.mtimeMs === _mtime) return _cache;      // 파일이 바뀌면 다시 읽는다(서버 재시작 0)
  let body; try { body = fs.readFileSync(CREDITS_PATH, 'utf8'); } catch (e) { return []; }
  const a = body.indexOf(MARK_A), b = body.indexOf(MARK_B);
  if (a < 0 || b < 0 || b < a) return [];
  const lines = body.slice(a + MARK_A.length, b).split('\n')
    .map((s) => s.trim()).filter((s) => s.startsWith('- '))
    .map((s) => s.slice(2).trim()).filter(Boolean);
  _cache = lines; _mtime = st.mtimeMs;
  return lines;
}

/** `/크레딧` — 요구 문구를 그대로 알림 스택에 올린다. 명령이 아니면 false(다음 분기로 간다). */
function handleChat(send, player, text) {
  if (!player) return false;
  const t = String(text || '').trim();
  if (t !== '/크레딧' && !t.startsWith('/크레딧 ')) return false;
  const say = (m) => { try { send(player.ws, { type: 'notice', text: m }); } catch (e) {} };
  const lines = requiredLines();
  if (!lines.length) { say('크레딧을 지금 못 읽었다'); return true; }
  for (const L of lines) say(L);
  return true;
}

module.exports = { CREDITS_PATH, requiredLines, handleChat };
