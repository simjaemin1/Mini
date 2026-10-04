#!/usr/bin/env node
// === scripts/t594-lab-cropcal.js — 랩 두 벌에 작물 철 고증 표(T594)를 굽는다 ==========================
//
// ★왜 — 랩(마을실험실·전쟁실험실)은 `file://` 로 여는 자체완결 HTML 이라 `server/crops.js` 를 못 부른다.
//   랩 작물 표(`const CROPS=[…]` · 30종 · 한글 id · 달력일 `grow`)는 랩 몫이고, T594 손잡이를 켠 랩은
//   서버와 **같은 성장일**을 써야 한다(랩이 목표 · 사본이 어긋나면 랩으로 잰 철이 헛것이 된다).
//   ⇒ 이 스크립트가 서버 정본(`crops.calDaysOf` — `server/crop-cal.js` 고증 표에서 유도)을 읽어
//     표시 사이(▼T594-CROPCAL … ▲T594-CROPCAL)에 **구워 넣는다.** 손으로 고치면 다음 굽기에 사라진다.
//   ★`--check` 는 굽지 않고 어긋남만 본다(exit 1) — `scripts/test-crop-cal.js` ⑧ 이 부른다(사본 감시).
//
// ★랩 쪽 셈(구운 블록 안 `cropGrowAt`): 1년생 = 활동일 그대로 · 월동(보리·밀·마늘) = **서버 T99 춘화 그 셈**(`crops.vernalDay` →
//   `readyDay`): 심은 날부터 계절을 건너 겨울을 찾고 → 그 겨울이 끝난 다음 날부터 겨울(휴면) 아닌 날을 활동일만큼 센다.
//   달력은 번들이 내놓는 정본(`EconEngine.Calendar` = `server/calendar.js` · 랩 날 − `L_START` = econ 날 — 랩 `lMonth` 와 같은 자리).
//   ★[T641 2026-10-04] 옛 줄은 랩 **1월 기점 365일 달력**(`L_YEAR`·`L_MOSTART[2]`)의 3월 1일을 썼다 — T599 가 랩 달을 달력 정본으로
//     옮긴 뒤(랩 날 120 = econ 3월 1일) 그 날은 econ **12월 30일**이라 월동 작물이 서버보다 **61일 일찍** 익었다(보리 10/1 → 3/31 ↔ 서버 5/31).
//   손잡이를 끄면(기본) `cropGrowAt` 이 랩 표의 `grow` 를 그대로 돌려준다 ⇒ 랩 종전과 같다.
//
// 실행: node scripts/t594-lab-cropcal.js [--check] [랩.html …]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Crops = require(path.join(ROOT, 'server/crops'));
const CropCal = require(path.join(ROOT, 'server/crop-cal'));

const START = '// ▼T594-CROPCAL';
const END = '// ▲T594-CROPCAL';
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const LABS = argv.filter((a) => !a.startsWith('--')).length
  ? argv.filter((a) => !a.startsWith('--'))
  : ['lab/마을실험실.html', 'lab/전쟁실험실.html'].map((f) => path.join(ROOT, f));

// 랩 표의 한글 id — 카탈로그 `ko` 에서 고른다("쌀(벼)" → 벼 · "콩(대두)" → 콩 · "마(참마)" → 마). 표를 옮겨 적지 않는다.
function labIdsOf(H) {
  const i = H.indexOf('const CROPS=[');
  if (i < 0) return null;
  const j = H.indexOf('];', i);
  return [...H.slice(i, j).matchAll(/id:'([^']+)'/g)].map((m) => m[1]);
}
function labIdFor(id, labIds) {
  const ko = String(Crops.koOf(id) || '');
  const inner = (/\(([^)]*)\)/.exec(ko) || [])[1];
  const cands = [ko, ko.replace(/\(.*\)/, ''), inner].filter(Boolean);
  return cands.find((k) => labIds.includes(k)) || null;
}
function blockFor(labIds) {
  const ent = [], miss = [];
  for (const id of CropCal.ids()) {
    const lid = labIdFor(id, labIds), g = Crops.calDaysOf(id);
    if (!lid || g == null) { miss.push(id); continue; }
    ent.push(`'${lid}':{g:${g}${Crops.isWinterCrop(id) ? ',v:1' : ''}}`);
  }
  const text = [
    `${START} (생성물 — node scripts/t594-lab-cropcal.js · 손으로 고치지 마라 · 정본 server/crop-cal.js → crops.calDaysOf)`,
    `const L_CROPCAL_T={${ent.join(',')}};   // ★[T594] 작물 철 고증 활동일(농사로 1차 · 파종창 가운데날 → 수확창 가운데날) · v:1 = 월동(겨울 지난 3월 1일부터 센다 — 서버 T99 춘화)`,
    `let L_CROPCAL=false;try{if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('cropcal')==='1')L_CROPCAL=true;}catch(e){}try{const _el=(typeof document!=='undefined')&&document.getElementById('cropCal');if(_el)_el.checked=L_CROPCAL;}catch(e){}   // 손잡이(끔 기본 = 랩 종전 그대로) · 패널 '작물 철 고증' · URL ?cropcal=1`,
    `function cropGrowAt(cr,day){const t=L_CROPCAL&&L_CROPCAL_T[cr.id];if(!t)return cr.grow;if(!t.v)return t.g;const C=EconEngine.Calendar,p=day-L_START,nx=d=>C.seasonStart(d)+C.seasonLen(d);let d=p;for(let i=0;i<=L_SEASONS.length&&C.seasonOf(d)!=='winter';i++)d=nx(d);if(C.seasonOf(d)!=='winter')return t.g;let e=nx(d),n=0;while(n<t.g){if(C.seasonOf(e)!=='winter')n++;e++;}return e-p;}   // 심는 날 → 익기까지 날수(끔 = cr.grow 그대로) · 월동 = 서버 T99 춘화 그 셈(달력 정본 — 그 겨울이 끝난 다음 날부터 겨울 아닌 날을 활동일만큼 · ★[T641] 옛 줄은 랩 1월 기점 달력이라 61일 일렀다)`,
    END,
  ].join('\n');
  return { text, n: ent.length, miss };
}

let bad = 0;
for (const lab of LABS) {
  const name = path.basename(lab);
  if (!fs.existsSync(lab)) { console.log(`[t594-lab] ⚠ 없음: ${lab}`); bad++; continue; }
  let H = fs.readFileSync(lab, 'utf8');
  const labIds = labIdsOf(H);
  if (!labIds) { console.log(`[t594-lab] ${name}: CROPS 표 없음 ✗`); bad++; continue; }
  const B = blockFor(labIds);
  const a = H.indexOf(START), b = H.indexOf(END);
  const cur = (a >= 0 && b > a) ? H.slice(a, b + END.length) : null;
  if (CHECK) {
    if (!cur) { console.log(`[t594-lab] ${name}: 블록 없음 ✗`); bad++; }
    else if (cur !== B.text) { console.log(`[t594-lab] ${name}: **어긋남** — 정본과 다르다 ✗`); bad++; }
    else console.log(`[t594-lab] ${name}: 최신 ✓ (${B.n}종 · 랩 표에 없는 것 ${B.miss.length ? B.miss.join(',') : '0'})`);
    continue;
  }
  if (cur === B.text) { console.log(`[t594-lab] ${name}: 이미 최신 — 건너뜀`); continue; }
  if (cur) H = H.slice(0, a) + B.text + H.slice(b + END.length);
  else {
    const i = H.indexOf('const CROPS=['), j = H.indexOf('];', i);
    const k = H.indexOf('\n', j);
    H = H.slice(0, k + 1) + B.text + '\n' + H.slice(k + 1);
  }
  fs.writeFileSync(lab, H);
  console.log(`[t594-lab] ${name}: 구움 (${B.n}종${B.miss.length ? ' · 랩 표에 없음 ' + B.miss.join(',') : ''})`);
}
if (CHECK && bad) process.exit(1);
