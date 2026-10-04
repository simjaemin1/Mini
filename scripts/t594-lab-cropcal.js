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
// ★랩 쪽 셈(구운 블록 안 `cropGrowAt`): 1년생 = 활동일 그대로 · 월동(보리·밀·마늘) = 심은 날 → 다음 3월 1일(랩 달력
//   `L_MOSTART[2]` · 랩은 1월 1일 기점 365일) + 활동일 — 서버 T99 춘화(겨울이 끝난 다음 날부터 센다)와 같은 셈이다.
//   손잡이를 끄면 `cropGrowAt` 이 랩 표의 `grow` 를 그대로 돌려준다 ⇒ 랩 종전과 같다.
// ★★[T634 2026-10-04] **기본 켬**(서버와 같은 꼴 — 손잡이 없음 = 켬 · 끔 = 옛 판): 패널 '작물 철 고증' 칸이 처음부터 체크되어 있고
//   URL `?cropcal=0` 이 끈다(종전 `?cropcal=1` 은 이제 기본과 같다). 칸(체크박스 줄)도 이 스크립트가 굽고 `--check` 가 본다 —
//   블록의 기본값과 칸의 `checked` 가 갈리면 화면이 거짓말을 한다.
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
// 패널 칸 — 블록의 기본값(켬)과 같은 `checked` · 찾기는 `id="cropCal"` 를 품은 그 label 한 줄(종전 T594 칸도 이 꼴로 잡힌다)
const BOX = `<label style="color:#aeb8c4" title="[T594·T634] 작물 성장일을 농사로 고증 기간으로(벼 ${Crops.calDaysOf('rice')}일 · 보리·밀·마늘은 겨울 지난 3월 1일부터) — 기본 켬 · 끄면 랩 종전(카탈로그 성장일) · 바꾼 뒤 새로 심는 밭부터 · URL ?cropcal=0 = 끔">`
  + '<input type="checkbox" id="cropCal" checked onchange="L_CROPCAL=this.checked">작물 철 고증</label>';
const BOX_RE = /<label [^>]*title="\[T594[^"]*"><input type="checkbox" id="cropCal"[^>]*>작물 철 고증<\/label>/g;
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
    `let L_CROPCAL=true;try{if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('cropcal')==='0')L_CROPCAL=false;}catch(e){}try{const _el=(typeof document!=='undefined')&&document.getElementById('cropCal');if(_el)_el.checked=L_CROPCAL;}catch(e){}   // 손잡이(★T634 기본 켬 = 서버와 같다 · 끔 = 랩 종전 그대로) · 패널 '작물 철 고증' · URL ?cropcal=0 = 끔`,
    `function cropGrowAt(cr,day){const t=L_CROPCAL&&L_CROPCAL_T[cr.id];if(!t)return cr.grow;if(!t.v)return t.g;const y=Math.floor(day/L_YEAR),doy=day-y*L_YEAR,m3=L_MOSTART[2];return (doy<m3?y*L_YEAR+m3:(y+1)*L_YEAR+m3)-day+t.g;}   // 심는 날 → 익기까지 달력일(끔 = cr.grow 그대로) · 월동 = 다음 3월 1일까지 + 활동일`,
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
  const boxes = H.match(BOX_RE) || [];
  const H0 = H;
  if (!CHECK && boxes.length === 1 && boxes[0] !== BOX) H = H.replace(boxes[0], () => BOX);   // ⚠칸을 먼저 고친 뒤 블록 자리를 잰다(칸이 블록 앞에 있다 — 자리가 밀린다)
  const a = H.indexOf(START), b = H.indexOf(END);
  const cur = (a >= 0 && b > a) ? H.slice(a, b + END.length) : null;
  if (CHECK) {
    if (!cur) { console.log(`[t594-lab] ${name}: 블록 없음 ✗`); bad++; }
    else if (cur !== B.text) { console.log(`[t594-lab] ${name}: **어긋남** — 정본과 다르다 ✗`); bad++; }
    else if (boxes.length !== 1 || boxes[0] !== BOX) { console.log(`[t594-lab] ${name}: 패널 칸 **어긋남**(칸 ${boxes.length}개 · 기본 켬 checked 와 다르다) ✗`); bad++; }
    else console.log(`[t594-lab] ${name}: 최신 ✓ (${B.n}종 · 랩 표에 없는 것 ${B.miss.length ? B.miss.join(',') : '0'} · 패널 칸 기본 켬)`);
    continue;
  }
  if (boxes.length > 1) { console.log(`[t594-lab] ${name}: 패널 칸이 ${boxes.length}개 ✗ — 손으로 하나만 남겨라`); bad++; continue; }
  if (cur === B.text && H === H0) { console.log(`[t594-lab] ${name}: 이미 최신 — 건너뜀`); continue; }
  if (cur === B.text) { fs.writeFileSync(lab, H); console.log(`[t594-lab] ${name}: 패널 칸만 고침(기본 켬)`); continue; }
  if (!boxes.length) console.log(`[t594-lab] ${name}: ⚠패널 칸 없음 — 블록만 굽는다(칸은 손으로 한 번 넣어라 · --check 가 빨강)`);
  if (cur) H = H.slice(0, a) + B.text + H.slice(b + END.length);
  else {
    const i = H.indexOf('const CROPS=['), j = H.indexOf('];', i);
    const k = H.indexOf('\n', j);
    H = H.slice(0, k + 1) + B.text + '\n' + H.slice(k + 1);
  }
  fs.writeFileSync(lab, H);
  console.log(`[t594-lab] ${name}: 구움 (${B.n}종${B.miss.length ? ' · 랩 표에 없음 ' + B.miss.join(',') : ''})`);
}
if (bad) process.exit(1);
