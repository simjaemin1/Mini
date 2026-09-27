// === scripts/t449-toggle-probe.js — **한 판 안에서** 옛 격자 ↔ 새 격자를 번갈아 돌리는 계측 전용 예비 적재(T449 ③ · 같은 순간 A/B) ======
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 레포 `server/zone.js` 는 한 글자도 안 만진다.
//   왜 — 판 사이 p50 으로 몫을 가르지 않는다(Z-자 T444 · 같은 설정 두 판이 4 ms 갈린다 · 이 카드의 첫 짝도 활성 청크가 275 ↔ 249 로 갈렸다).
//     벽 질의의 답은 두 격자에서 **비트 동일**(`test-coll-grid` · 실서버 1.2억 질의 다름 0)이라 판의 걸음을 안 바꾸고 **값만** 바꿀 수 있다 ⇒
//     한 판 안에서 조각마다 옛 몸 ↔ 새 몸을 번갈아(ABBA) 돌리면 이웃한 두 분이 같은 세계 · 같은 청크 수의 짝이 된다(재민 "같은 순간 A/B 로만").
//   ★옛 몸 = 베이스 커밋(`T449_TOGGLE_BASE` · 기본 `8121ccb4`)의 `rebuildSpatialIndex`·`_rebuildSpatialInc` **글자 그대로**(git 에서 떠서 이름만 바꿔
//     zone.js 원문 **뒤에** 덧붙인다) + 벽 질의 넷이 보는 `qtColl` 을 `qtBuildings` 로(옛 네 줄과 같은 격자 · 같은 차례).
//     새 몸 = 제품 그대로. 전환은 틱 **사이**(신호 처리기 — 틱 도중이 아니다)에서만 · 새로 갈 때는 증분 명부를 비워 다음 틱이 새 격자를 채운다.
//   쓰는 법: `T449_MODE_FILE` 에 `old`|`new` 를 쓰고 존에 `SIGWINCH` → 그 틱 사이에 바뀐다. 지금 몸은 `T449_MODE_FILE.ack` 에 적는다.
//   ★`scripts/t432-probe.js` 를 같이 싣는다(GC 뒤 메모리 · 활성 청크 · 건물 — SIGUSR2).
'use strict';
require('./t432-probe.js');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ZONE_JS = path.join('server', 'zone.js');
const BASE = process.env.T449_TOGGLE_BASE || '8121ccb4';
const MODE_FILE = process.env.T449_MODE_FILE || '';
//   함수 하나를 원문에서 떠낸다(선언 줄부터 짝 맞는 닫는 중괄호까지 — 문자열·주석 안 중괄호는 이 두 함수에 없다: 아래에서 확인)
function cut(src, name) {
  const i = src.indexOf(`function ${name}(`); if (i < 0) throw new Error('없다 ' + name);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  throw new Error('짝 없음 ' + name);
}
function oldBodies() {
  const src = execFileSync('git', ['show', `${BASE}:server/zone.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  let inc = cut(src, '_rebuildSpatialInc'), rb = cut(src, 'rebuildSpatialIndex');
  if (/qtColl|COLL_TYPES/.test(inc + rb)) throw new Error('베이스에 이미 새 격자가 있다 — 옛 몸이 아니다');
  inc = inc.replace('function _rebuildSpatialInc(', 'function __t449OldInc(');
  rb = rb.replace('function rebuildSpatialIndex(', 'function __t449OldRebuild(').replace('_rebuildSpatialInc(nowIT, W, H)', '__t449OldInc(nowIT, W, H)');
  if (!/__t449OldInc\(nowIT, W, H\)/.test(rb)) throw new Error('옛 몸의 증분 호출을 못 찾았다');
  return inc + '\n' + rb + '\n';
}
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(ZONE_JS)) {
    content += `
;${oldBodies()}
;(function () {
  const NEW = rebuildSpatialIndex;
  const OLD = function (nowIT) { __t449OldRebuild(nowIT); qtColl = qtBuildings; };   // 옛 네 줄이 보던 그 격자
  let mode = 'new', flips = 0;
  globalThis.__t449toggle = (m) => {
    if (m === mode) return mode;
    if (m === 'old') { rebuildSpatialIndex = OLD; qtColl = qtBuildings; }
    else { rebuildSpatialIndex = NEW; _spInc.bld = []; qtColl = undefined; }   // 새 몸 — 다음 틱이 새 격자를 채운다(그 틱까지는 종전 폴백 없이 — 아래 한 줄)
    if (m === 'new') NEW(undefined);   // 곧바로 한 번 세운다(입력 타임아웃은 건드리지 않는다 — nowIT 없음 · 격자만)
    mode = m; flips++; return mode;
  };
  globalThis.__t449mode = () => ({ mode, flips });
})();
`;
  }
  return _compile.call(this, content, filename);
};
process.on('SIGWINCH', () => {
  if (!MODE_FILE) return;
  try {
    const m = fs.readFileSync(MODE_FILE, 'utf8').trim();
    const r = typeof globalThis.__t449toggle === 'function' ? globalThis.__t449toggle(m === 'old' ? 'old' : 'new') : null;
    fs.writeFileSync(MODE_FILE + '.ack', JSON.stringify({ t: Date.now(), mode: r, st: globalThis.__t449mode ? globalThis.__t449mode() : null }));
  } catch (e) { try { fs.writeFileSync(MODE_FILE + '.ack', JSON.stringify({ err: String(e && e.message || e) })); } catch (_) {} }
});
