#!/usr/bin/env node
// === scripts/build-map-editor.js — 맵 에디터 맥 사본(file:// 로 여는 한 파일)을 만든다 [T553 ④] ===
//
// ★왜: 레포 판 `lab/map-editor.html` 은 코드만(~70KB)이고 내장 작업·다리는 옆 `lab/map-editor-baked.json` 을 fetch 한다.
//   재민은 맥에서 `~/Mini/map-editor.html` 을 **file:// 로** 연다 — 크롬은 file:// 의 fetch 를 막는다.
//   그래서 맥 사본은 두 표시 줄(`// @inline-work` · `// @inline-bridges`)에 JSON 을 **박아** 한 파일로 만든다(종전 파일과 같은 꼴).
//   박은 줄은 종전 `const WORK_BAKED = {…};` 과 같은 직렬화다(JSON.stringify — T553 에서 바이트 대조함).
//
// 쓰는 법: node scripts/build-map-editor.js <out.html>            → 박은 한 파일
//          node scripts/build-map-editor.js --extract <old.html>  → 옛 한 파일에서 baked json 을 뽑아 lab/map-editor-baked.json 으로(작업을 새로 박을 때)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'lab', 'map-editor.html');
const BAKED = path.join(ROOT, 'lab', 'map-editor-baked.json');
const argv = process.argv.slice(2);

if (argv[0] === '--extract') {
  const L = fs.readFileSync(argv[1], 'utf8').split('\n');
  const grab = (pre) => { const l = L.find((x) => x.startsWith(pre)); if (!l) throw new Error('줄 없음: ' + pre); return JSON.parse(l.slice(pre.length).replace(/;\s*$/, '')); };
  const work = grab('const WORK_BAKED = '), bridges = grab('const BR_BAKED = ');
  let coast; try { const l = L.find((x) => x.startsWith('let COAST_BAKED = ')); coast = l ? JSON.parse(l.slice(18, l.lastIndexOf('; //'))) : undefined; } catch (e) { coast = undefined; }   // [T601 추신] 해안 띠 층(옛 파일엔 없다)
  fs.writeFileSync(BAKED, JSON.stringify(coast ? { work, bridges, coast } : { work, bridges }) + '\n');
  console.log('[build-map-editor] 뽑음 → ' + BAKED + ' (작업 ' + work.stamp + ')');
  process.exit(0);
}
const out = argv[0];
if (!out) { console.error('쓰는 법: node scripts/build-map-editor.js <out.html>'); process.exit(2); }
const src = fs.readFileSync(SRC, 'utf8').split('\n');
const B = JSON.parse(fs.readFileSync(BAKED, 'utf8'));
let nw = 0, nb = 0, nc = 0;
const res = src.map((l) => {
  if (/^let WORK_BAKED = null; \/\/ @inline-work/.test(l)) { nw++; return 'let WORK_BAKED = ' + JSON.stringify(B.work) + '; // @inline-work (박음 · scripts/build-map-editor.js)'; }
  if (/^let BR_BAKED = \{\}; \/\/ @inline-bridges/.test(l)) { nb++; return 'let BR_BAKED = ' + JSON.stringify(B.bridges) + '; // @inline-bridges (박음)'; }
  if (/^let COAST_BAKED = null; \/\/ @inline-coast/.test(l)) { nc++; return 'let COAST_BAKED = ' + JSON.stringify(B.coast || null) + '; // @inline-coast (박음 · T601 추신 해안 띠 층)'; }
  return l;
});
if (nw !== 1 || nb !== 1 || nc !== 1) { console.error('[build-map-editor] 표시 줄이 하나씩이 아니다(work ' + nw + ' · bridges ' + nb + ' · coast ' + nc + ') — 멈춘다'); process.exit(3); }
fs.writeFileSync(out, res.join('\n'));
console.log('[build-map-editor] ' + out + ' · ' + fs.statSync(out).size + ' B · 작업 ' + (B.work && B.work.stamp));
