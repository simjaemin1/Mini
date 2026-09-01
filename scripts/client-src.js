// === scripts/client-src.js — 클라 원본을 한 곳에서 읽는다 ====================
// `public/client.js` 는 0번 분할 배치에서 `public/client/*.js` 조각들로 갈렸다.
// 클라 소스를 문자열로 읽어 검사하던 하네스가 여럿이라, **읽는 법을 한 곳에 둔다**(사본 금지).
// 순서는 `index.html` 등록 순 그대로 — 하네스가 순서를 따로 적으면 두 정본이 된다.
// ★분할 마커(@@split / @@moved)는 걷어내고, @@moved 블록은 **원위치로 복원**한다.
//   ⇒ 반환 문자열은 분할 전 `client.js` 와 **바이트 동일**하다(scripts/split-verify.sh 가 그걸 증명).
'use strict';
const fs = require('fs'), path = require('path');
const PUB = path.resolve(__dirname, '..', 'public');

function readClientSrc() {
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const order = [...html.matchAll(/<script[^>]*\ssrc="(client\/[^"?]+)/g)].map((m) => m[1]);
  if (!order.length) throw new Error('index.html 에 client/ 조각 등록이 없다');
  const read = (f) => { const a = fs.readFileSync(path.join(PUB, f), 'utf8').split('\n');
                        if (a.length && a[a.length - 1] === '') a.pop(); return a; };
  const main = read(order.find((f) => /99-main/.test(f)));
  const blocks = new Map();
  for (let i = 0; i < main.length; i++) {
    const m = main[i].match(/^\/\/ @@moved-begin:(\d+)$/); if (!m) continue;
    const j = main.findIndex((l, k) => k > i && l === `// @@moved-end:${m[1]}`);
    blocks.set(m[1], main.slice(i + 1, j)); i = j;
  }
  const out = [];
  for (const f of order) {
    if (/99-main/.test(f)) continue;
    for (const l of read(f)) {
      if (/^\/\/ @@split:/.test(l)) continue;
      const mv = l.match(/^\/\/ @@moved:(\d+)$/);
      if (mv) { out.push(...blocks.get(mv[1])); continue; }
      out.push(l);
    }
  }
  return out.join('\n') + '\n';
}
module.exports = { readClientSrc, CLIENT_DIR: path.join(PUB, 'client') };
