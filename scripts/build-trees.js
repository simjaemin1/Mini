#!/usr/bin/env node
// === scripts/build-trees.js — 랩 `TREES` 표 → `lab/trees.json` (T123 §2③) ==========
//
// ★★**표가 정본이고 파일은 그 전사(轉寫)다.** 작물 층과 같은 문법:
//   작물은 `한국작물_카탈로그.xlsx` → `build-crops.py` → `server/crops.json` 이고,
//   나무는 **아직 xlsx 가 없다** — T123 이 랩 안에 표를 세웠고, 그 표가 지금의 원천이다.
//   그래서 이 스크립트의 원천은 `lab/전쟁실험실.html` 의 `const TREES={…}` 하나뿐이다.
//
// ⚠**손편집 금지.** 값을 고치려면 랩의 표를 고치고 이걸 다시 돌린다.
//   손으로 옮겨 적는 순간 그게 사본이고, 랩과 파일이 조용히 어긋난다(인라인 사본 규약과 같은 이유).
//   `--check` 가 그 어긋남을 잡는다 — `sim/inline-engine.js --check` 와 같은 계약.
//
// ⚠**서버는 이 파일을 아직 안 읽는다.** 서버 이식은 승인 게이트가 달린 별도 카드다(T123 §4 회부).
//   `scripts/test-lab-trees.js` 가 "서버가 trees.json 을 부르는 자리 0" 을 지킨다.
//
// 실행:  node scripts/build-trees.js          # 굽는다
//        node scripts/build-trees.js --check  # 랩 표와 파일이 같은가(다르면 exit 1)
//        node scripts/build-trees.js --table  # 재민 판정거리 표(성목 햇수 → 실시간)
'use strict';
const fs = require('fs');
const path = require('path');

const LAB = path.resolve(__dirname, '..', 'lab', '전쟁실험실.html');
const OUT = path.resolve(__dirname, '..', 'lab', 'trees.json');

// ── 랩에서 표만 떼어 온다 ────────────────────────────────────────────────────
// 파서를 쓰지 않는다(HTML 안의 스크립트라 AST 도구를 끌어올 이유가 없다). 대신
// `const TREES={` 에서 짝 맞는 `}` 까지 **중괄호를 세어** 자르고, 그 조각만 평가한다.
// 잘라낸 조각에 식별자가 하나라도 있으면 평가가 터진다 ⇒ "표는 순수한 리터럴이어야 한다"가 강제된다.
function extractTrees(src) {
  const key = 'const TREES={';
  const i = src.indexOf(key);
  if (i < 0) throw new Error('랩에서 `const TREES={` 를 못 찾았다');
  let d = 0, j = i + key.length - 1;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) break; }
  }
  if (d !== 0) throw new Error('`TREES` 중괄호가 안 닫힌다');
  const lit = src.slice(i + key.length - 1, j + 1);
  // eslint-disable-next-line no-new-func
  const obj = new Function('"use strict";return (' + lit + ');')();
  if (!obj || typeof obj !== 'object' || !Object.keys(obj).length) throw new Error('`TREES` 가 비었다');
  return obj;
}

// ── 전사(轉寫)만 한다 — 파생은 하지 않는다 ───────────────────────────────────
// 성장 ms·숯 굽는 시간·열매 무게 같은 건 여기서 계산하지 않는다(build-crops.py 와 같은 계약).
// 여기서 하는 일: 축 이름 붙이기 · 안정된 키 순서. 그뿐이다.
const AXES = {
  ko: '이름',
  wood: '목재 수율(소나무=1.00 상대 재적)',
  mature: '성목 햇수(벤 자리가 다시 성목이 되기까지)',
  char: '숯 수율(참나무=1.00 상대)',
  fruit: '열매 품목 아이디(없으면 null — 목재 전용 종)',
  fy: '연간 열매 수율(나무 하나·성목 기준)',
  fs: '결실철(0봄 1여름 2가을 3겨울)',
};

function build() {
  const src = fs.readFileSync(LAB, 'utf8');
  const T = extractTrees(src);
  const trees = {};
  for (const id of Object.keys(T)) {
    const t = T[id];
    trees[id] = { ko: t.ko, wood: t.wood, mature: t.mature, char: t.char,
      fruit: t.fruit == null ? null : t.fruit, fy: t.fy, fs: t.fs };
  }
  return {
    _source: 'lab/전쟁실험실.html `const TREES` (T123) — 손편집 금지 · `node scripts/build-trees.js` 로 굽는다',
    _note: '서버는 아직 이 파일을 읽지 않는다(이식은 승인 게이트 카드). 종에 우열 없음 — 값은 그림자가격이 정한다.',
    _axes: AXES,
    trees,
  };
}

// ── 재민 판정거리 표 — 성목 햇수를 **실시간**으로 환산한다 ──────────────────
// ★수를 여기 적지 않는다. 하루 길이는 `zone-config.WORLD.dayLengthMs`(단일 노브),
//   한 해 길이는 `events.calendarOf().yearDays` — 둘 다 정본에서 읽는다.
//   "참나무 성목 40년"은 표 안에서는 그냥 40 이지만, 재민이 판정할 수 있는 건 **실시간 며칠**이다.
if (process.argv.includes('--table')) {
  const T = build().trees;
  const dayMs = require(path.resolve(__dirname, '..', 'server', 'zone-config')).WORLD.dayLengthMs;
  const yearDays = require(path.resolve(__dirname, '..', 'server', 'events')).calendarOf(0).yearDays;
  const yearMin = yearDays * (dayMs / 60000);
  console.log(`\n=== 재민 판정거리 — 성목 햇수 실시간 환산 ===`);
  console.log(`  정본: 게임 하루 = 실시간 ${dayMs / 60000}분(zone-config WORLD.dayLengthMs) · 한 해 = ${yearDays}일(events.calendarOf)`);
  console.log(`  ⇒ 게임 한 해 = 실시간 ${(yearMin / 60).toFixed(1)}시간 = ${(yearMin / 1440).toFixed(2)}일`);
  console.log('\n  종           성목(게임년)   실시간        열매        연간수율');
  for (const [id, t] of Object.entries(T).sort((a, b) => a[1].mature - b[1].mature)) {
    const min = t.mature * yearMin;
    const rt = min >= 1440 ? (min / 1440).toFixed(1) + '일' : (min / 60).toFixed(1) + '시간';
    console.log('  ' + (id + '(' + t.ko + ')').padEnd(16) + String(t.mature).padStart(5) + '년'
      + rt.padStart(12) + '  ' + String(t.fruit || '—').padEnd(14) + String(t.fy).padStart(6));
  }
  console.log('\n  ※ 이 열이 벌목 부등식의 오른쪽(잃는 것)을 만든다: 성목햇수 × w(열매) × 연간수율.');
  process.exit(0);
}

const json = JSON.stringify(build(), null, 1) + '\n';
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur === json) { console.log('[trees] lab/trees.json: 최신 ✅'); process.exit(0); }
  console.error('[trees] lab/trees.json: ✗ 랩 표와 어긋난다 — `node scripts/build-trees.js` 를 돌려라');
  process.exit(1);
}
fs.writeFileSync(OUT, json);
console.log('[trees] lab/trees.json 굽기 완료 — 종 ' + Object.keys(build().trees).length);
