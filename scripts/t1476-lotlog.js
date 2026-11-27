'use strict';
// (@regress 없음 — 러너 밖 귀 · T1476)
// =============================================================================
// scripts/t1476-lotlog.js — 읽기만 하는 귀(제품 코드 · 자 손 0). `NODE_OPTIONS=--require scripts/t1476-lotlog.js` 로만 건다.
//   존(server/zone.js)이 클라에게 보내는 두 가지만 한 줄씩 `/tmp/t1476-lotlog.jsonl`(LOTLOG 로 바꿈) 에 적는다:
//     ① `lot_preview`(첫 집터 아홉 칸 미리보기 · 막힌 칸이 있거나 문이 거절할 때만) — 칸마다 [dx, dy, 까닭]
//        까닭 = claim(남의 땅) · mine(풀린 내 땅) · water · rock · ditch · village(마을 시설) · building · vacant(빈 집) · bridge · head
//     ② 종류 `claim` 알림 글(거절 글) — 같은 글은 한 번만
//   자(`e2e-first30`)가 판 JSON 에 남기는 것은 막힌 칸 "수"뿐이라 까닭이 없다 — 이 귀가 그 까닭을 건진다.
//   존 프로세스가 아니면(자 · central) 아무것도 안 한다. 같은 (cx · cy · 칸) 미리보기는 한 번만 적는다.
// =============================================================================
try {
  if (/zone\.js$/.test(String(process.argv[1] || ''))) {
    const fs = require('fs');
    const W = require('ws');
    const OUT = process.env.LOTLOG || '/tmp/t1476-lotlog.jsonl';
    const seen = new Set();
    const orig = W.prototype.send;
    W.prototype.send = function (data, ...rest) {
      try {
        if (typeof data === 'string' && data.length < 4000 && (data.indexOf('"lot_preview"') > 0 || (data.indexOf('"claim"') > 0 && data.indexOf('"notice"') > 0))) {
          const m = JSON.parse(data);
          if (m.type === 'lot_preview' && m.first && ((m.cells && m.cells.length) || m.gate)) {
            const k = `L${m.cx},${m.cy}:${JSON.stringify(m.cells)}:${m.gate || ''}`;
            if (!seen.has(k)) { seen.add(k); fs.appendFileSync(OUT, JSON.stringify({ ms: Date.now(), k: 'lot', cx: m.cx, cy: m.cy, cells: m.cells, gate: m.gate || null }) + '\n'); }
          } else if (m.type === 'notice' && m.kind === 'claim') {
            const k = 'N' + m.text;
            if (!seen.has(k)) { seen.add(k); fs.appendFileSync(OUT, JSON.stringify({ ms: Date.now(), k: 'notice', text: String(m.text).slice(0, 200) }) + '\n'); }
          }
        }
      } catch (e) { /* 귀는 판을 건드리지 않는다 */ }
      return orig.call(this, data, ...rest);
    };
  }
} catch (e) { /* 없어도 판은 돈다 */ }
