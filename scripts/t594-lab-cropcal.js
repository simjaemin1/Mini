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
//   손잡이를 끄면(`?cropcal=0`) `cropGrowAt` 이 랩 표의 `grow` 를 그대로 돌려준다 ⇒ 랩 종전과 같다.
// ★★[T634 2026-10-04] **기본 켬**(서버와 같은 꼴 — 손잡이 없음 = 켬 · 끔 = 옛 판): 패널 '작물 철 고증' 칸이 처음부터 체크되어 있고
//   URL `?cropcal=0` 이 끈다(종전 `?cropcal=1` 은 이제 기본과 같다). 칸(체크박스 줄)도 이 스크립트가 굽고 `--check` 가 본다 —
//   블록의 기본값과 칸의 `checked` 가 갈리면 화면이 거짓말을 한다.
// ★★[T648 2026-10-05] **휴면 문**(서버 T99 ② 휴면 중 돌봄·품질 정지 · ③ 다년생 휴면) — 블록에 두 줄을 더 굽는다:
//   `L_CROPSID`(랩 id → 서버 id · 아래 `labIdFor` 그 하나로 30종 전부 · 짝이 겹치면 굽지 않는다) ·
//   `cropDormant(e,day)` = 번들의 서버 정본 `EconEngine.Crops.dormantAt(서버 id, econ 날)` 을 **그대로 부른다**(술어 사본 0 —
//   번들이 `server/crops.js` 를 싣는다 · `sim/build-econ-bundle.js` T648). 랩 상태기 세 자리(`cellTask` · `doTask` · 하루 작물 진화)가
//   이 문 하나로 들어간다(서버 `cropTaskOf` · `cropDoTask` · `cropDayTick` 이 `dormantAt` 하나로 들어가는 그 꼴).
//   ⚠끔(`?cropcal=0`)이면 늘 거짓 — 끔 판은 랩 표 `grow` 달력일(겨울에도 자라는 옛 셈)이라 돌봄만 멈추면 셈이 두 벌이 된다 ⇒ 끔 = 랩 종전 바이트.
// ★★[T648 추가안] **돌봄 차례 비율**(김매기 벌 · 김 놓친 감점 문턱)도 서버 정본으로 — `cropCareFrac(e,day)` =
//   `EconEngine.Crops.grownDays(서버 id, 심은 econ 날, econ 날) ÷ growDaysOf(서버 id)`(서버 `villages._cropGrowFrac` 그 셈 · 월동 셋 · 켬).
//   랩 옛 비율 `(day−planted)÷g` 는 **달력일**이라 가을·겨울에도 차올라, 휴면 문만 있으면 겨울에 막힌 김매기가 봄 초에 몰렸다
//   (계수: 전쟁 7 봄 감점 0 → 26,792). 서버는 활동일(춘화일부터 · 겨울 안 셈)이라 "멈춘 자리에서 재개"한다(villages.js T99 주석).
//   ⚠월동 셋만 — 그 셋의 `g` 는 `cropGrowAt`(= 서버 readyDay 와 같은 셈 · T641)이라 비율의 분모가 서버와 같다. 1년생은 두 비율이 같고
//     (휴면·춘화 없음), 표 밖 작물은 랩 `grow` 와 카탈로그 활동일이 다를 수 있어 종전 그대로 둔다 · 끔이면 종전 그대로(바이트 같음).
//   ⚠하루 메모 — `grownDays` 는 춘화일부터 그날까지 날마다 휴면을 묻는 셈(부를 때 수십~백 번 · 8µs 안팎)이고 `cellTask` 가 칸마다 여러 번
//     부른다 ⇒ 메모 없이는 랩 500일 판이 두 배로 느렸다(전쟁 42: 72 → 156초). 값은 (작물 · 파종일 · 날)만의 함수라 같은 날 같은 열쇠는 같은 값 —
//     날이 바뀌면 비운다(값 무변 · 지문 같음 — 계수 판으로 확인).
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
  const ent = [], miss = [], sids = [], seen = new Map();
  for (const id of Crops.IDS) {   // ★[T648] 랩 id → 서버 id(30종 전부 · 휴면 술어를 부를 때)
    const lid = labIdFor(id, labIds); if (!lid) continue;
    if (seen.has(lid)) throw new Error(`랩 id ${lid} 가 서버 ${seen.get(lid)} · ${id} 둘에 짝지어진다 — labIdFor 를 고쳐라`);
    seen.set(lid, id); sids.push(`'${lid}':'${id}'`);
  }
  for (const id of CropCal.ids()) {
    const lid = labIdFor(id, labIds), g = Crops.calDaysOf(id);
    if (!lid || g == null) { miss.push(id); continue; }
    ent.push(`'${lid}':{g:${g}${Crops.isWinterCrop(id) ? ',v:1' : ''}}`);
  }
  const text = [
    `${START} (생성물 — node scripts/t594-lab-cropcal.js · 손으로 고치지 마라 · 정본 server/crop-cal.js → crops.calDaysOf)`,
    `const L_CROPCAL_T={${ent.join(',')}};   // ★[T594] 작물 철 고증 활동일(농사로 1차 · 파종창 가운데날 → 수확창 가운데날) · v:1 = 월동(겨울 지난 3월 1일부터 센다 — 서버 T99 춘화)`,
    `let L_CROPCAL=true;try{if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('cropcal')==='0')L_CROPCAL=false;}catch(e){}try{const _el=(typeof document!=='undefined')&&document.getElementById('cropCal');if(_el)_el.checked=L_CROPCAL;}catch(e){}   // 손잡이(★T634 기본 켬 = 서버와 같다 · 끔 = 랩 종전 그대로) · 패널 '작물 철 고증' · URL ?cropcal=0 = 끔`,
    `const L_CROPSID={${sids.join(',')}};   // ★[T648] 랩 작물 id → 서버 작물 id(카탈로그 ko 로 고른 짝 · 랩 표 ${labIds.length}종 중 ${sids.length}) — 서버 정본 술어를 부를 때만 쓴다`,
    `let _ccfDay=-1;const _ccfMemo=new Map();function cropCareFrac(e,day){const sid=L_CROPCAL&&L_CROPSID[e.crop.id],C=EconEngine.Crops;if(sid&&C.isWinterCrop(sid)){if(day!==_ccfDay){_ccfDay=day;_ccfMemo.clear();}const k=sid+'|'+e.planted;let f=_ccfMemo.get(k);if(f===undefined){f=C.grownDays(sid,e.planted-L_START,day-L_START)/Math.max(1,C.growDaysOf(sid));_ccfMemo.set(k,f);}return f;}return (day-e.planted)/(e.g||e.crop.grow);}   // ★[T648 추가안] 돌봄 차례 비율(김매기 벌 · 감점 문턱) — 월동 셋 = 서버 정본 활동일 비율(crops.grownDays ÷ growDaysOf · villages._cropGrowFrac 그 셈 — 가을 0 · 겨울 멈춤 · 봄에 멈춘 자리에서) · 그 밖·끔 = 종전 달력일 비율 · 하루 메모(같은 날 · 같은 작물 · 같은 파종일 = 같은 값 · 값 무변 — grownDays 는 날수만큼 도는 셈이라 칸마다 부르면 랩 판이 두 배로 느려진다)`,
    `function cropDormant(e,day){if(!L_CROPCAL)return false;const sid=L_CROPSID[e.crop.id];return !!sid&&EconEngine.Crops.dormantAt(sid,day-L_START);}   // ★[T648] 휴면이면 돌봄 일감 0 · 품질 감점 0 · 병충해 0(서버 T99 ② · ③ 다년생) — 술어 = 번들의 서버 정본 crops.dormantAt 그대로(사본 0) · 끔(?cropcal=0)이면 늘 거짓 = 랩 종전 그대로`,
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
