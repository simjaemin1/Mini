#!/usr/bin/env node
// === scripts/t259-t17-cland.js — 기준선 자를 **제품 땅(C)** 위에 세워 보는 사본 러너 (러너 밖 · 적용 0) ===
//
// ★왜 [지시 T259 ④]
//   17벌을 `zone-preds.js` 로 모으면 각 자의 땅이 C 로 간다. 그때 **기준선 셋째 판이 얼마나 움직이나**를
//   먼저 재야 모을지 말지를 정할 수 있다. 그 답은 기준선 자(`t17-metrics`)를 C 땅 위에 한 번 세워 보는 것이다.
//
// ★`t17-metrics.js` 를 **손대지 않는다.** 이 자는 그 파일의 **자기 바이트**를 읽어
//   `makeTerrainAdapter(...)` **한 줄만** 갈아 끼운 임시 사본을 만들고 자식 프로세스로 돌린다
//   (족보 — 돌연변이는 자식 프로세스+임시 파일). 옮겨 적은 줄은 **0** 이고,
//   갈아 끼우는 값도 `scripts/zone-preds.js` 정본 한 벌에서 온다.
//
// 실행: node scripts/t259-t17-cland.js [일수=800] [시드=1020]
//   T259_ARM=c|a     c(기본)=제품 술어 · a=원본 술어(자명 통과 금지용 대조)
//   T259_FILE=…      갈아 끼울 대상(기본 `scripts/t17-metrics.js`)
//   T259_ARGS=…      자식에게 넘길 인자(공백 구분 · 주면 일수·시드 자리를 대신한다)
//   T17_JSON=…       자식에게 그대로 넘어간다
// ★[T279 ⓓ] 대상 파일을 인자로 받게 넓혔다 — 러너 셋(`test-distmatrix`·`test-frontier-iron`·
//   `test-onboarding`)도 **같은 한 줄 교체**로 C 땅 위에서 돌려 단정이 서는지 본다(사본만 · 원본 무접촉).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, process.env.T259_FILE || 'scripts/t17-metrics.js');
const ARM = (process.env.T259_ARM || 'c').toLowerCase();
const ARGS = process.env.T259_ARGS != null
  ? (process.env.T259_ARGS ? process.env.T259_ARGS.split(/\s+/) : [])
  : [process.argv[2] || '800', process.argv[3] || '1020'];

const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');
let mi = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^\s*(\/\/|\*)/.test(lines[i])) continue;
  if (/makeTerrainAdapter\s*\(/.test(lines[i])) { mi = i; break; }
}
if (mi < 0) { console.error('makeTerrainAdapter 줄을 못 찾았다 — 기준선 자가 바뀌었다. 멈춘다.'); process.exit(2); }
const ORIG = lines[mi];

if (ARM === 'c') {
  // ★한 줄만 바꾼다: `makeTerrainAdapter` 의 **셋째 인자(deps)** 만 정본 술어로 갈아 끼운다.
  //   왼쪽(변수명·호출부)은 원문 그대로 둔다 — 파일마다 이름이 달라도 안전하게.
  //   제품이 `zone.js:2651` 에서 넘기는 것과 같은 세 칸이다(`isBridgeLocal` 포함).
  const m2 = /(makeTerrainAdapter\s*\(\s*[^,]+,\s*[^,]+,\s*)\{[\s\S]*?\}(\s*\)\s*;)/.exec(lines[mi]);
  if (!m2) { console.error('deps 리터럴을 못 찾았다 — 대상 파일의 호출 꼴이 다르다. 멈춘다.'); process.exit(2); }
  const inject = "{ isTerrainBlockedLocal: __ZP.isTerrainBlockedLocal, isWaterTileLocal: __ZP.isWaterTileLocal, isBridgeLocal: __ZP.isBridgeTileLocal }";
  lines[mi] = "const __ZP = require(require('path').join(__dirname, '..', 'scripts', 'zone-preds')).makeZonePreds(typeof Z !== 'undefined' ? Z : 'hanbando');"
    + "\n" + lines[mi].replace(m2[0], m2[1] + inject + m2[2]);
}
const BASE = path.basename(SRC, '.js');
const OUT = path.join(ROOT, 'scripts', `.t259-${BASE}-${ARM}-${process.pid}.js`);
fs.writeFileSync(OUT, lines.join('\n'));
console.log(`[T259] 사본 — 팔 ${ARM.toUpperCase()} · 바꾼 줄 ${ARM === 'c' ? 1 : 0}개 (원문 ${SRC}:${mi + 1}) · 인자 [${ARGS.join(' ')}]`);
console.log(`  원본 줄: ${ORIG.trim()}`);
if (ARM === 'c') console.log(`  바뀐 줄: ${lines[mi].split('\n')[1].trim()}`);
let r;
try { r = cp.spawnSync(process.execPath, [OUT, ...ARGS], { stdio: 'inherit', env: process.env }); }
finally { try { fs.unlinkSync(OUT); } catch (e) { console.error('⚠사본 정리 실패: ' + OUT); } }
process.exit(r.status == null ? 1 : r.status);
