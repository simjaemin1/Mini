#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T550 ③ⓓ 다리 · 계획기 v2 를 고정점까지 돌린다)
// =============================================================================
// `plan-bridges-v2.js nippon` 은 한 번 돌 때 "본토에 못 닿는 후보 섬마다 최단 도하 하나"만 낸다. 디딤돌(사람 없는 뭍)에 착지한 다리는
// 다음 판에서야 본토와 이어지므로, **옛 다리 0 에서 시작해 더할 다리가 없을 때까지** 다시 돌린다(계획기 무접촉 · 규격 그대로 —
// 폭 2셀 · 양끝 뭍 접지 · 상한 200셀 · 띠 + 손그림 물). 다리는 예비 적재(`T550_BRIDGES_FILE`)로 zone-config 객체에만 얹는다.
// 쓰는 법: node scripts/t550-bridges.js <출력 flat.json> [--max 12] [--start <flat.json>] [--no-canyon]
//   --apply  → `server/zone-config.js` nippon `bridges: [...]` 한 줄을 바꾼다(옛 208셀 지움)
//   --start  → 그 다리에서 시작한다(이미 놓은 다리 위에 더한다)
//   --no-canyon → ★협곡(`<강>협곡k` · 양 기슭 2셀 길)을 **없는 셈 치고** 계획한다(계획 입력만 · 정본 무접촉).
//     왜: 계획기 v2 는 실셀(1셀)로 잇고, 마을 교역 거리행렬·`test-nippon-boot` ⓙ 는 코스 격자(4셀 · 중심 1점)로 잇는다.
//     2셀 기슭 길은 실셀로는 길이지만 코스 격자에는 안 보인다(T550 실측: 시딩 20 중 4곳이 협곡 기슭으로만 본토에 닿아 불능 67쌍).
//     다리는 코스 격자에 보인다(`coarseOpen` 다리 구제). 그래서 협곡 없이도 닿게 다리를 놓는다 — 규격(폭 2 · 상한 200 · 띠+손그림 물)은 그대로.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t550-bridges.json';
const MAX = +(process.argv.includes('--max') ? process.argv[process.argv.indexOf('--max') + 1] : 12);
const PRE = path.join(require('os').tmpdir(), `t550-br-pre-${process.pid}.js`);
fs.writeFileSync(PRE, `const p=require('path');const Z=require(p.join(${JSON.stringify(ROOT)},'server','zone-config')).ZONES;
if(process.env.T550_BRIDGES_FILE){Z.nippon.bridges=JSON.parse(require('fs').readFileSync(process.env.T550_BRIDGES_FILE,'utf8'));}
if(process.env.T550_NO_CANYON==='1'){const W=require(p.join(${JSON.stringify(ROOT)},'server','hanbando-terrain.json'));W.nippon.valleys=(W.nippon.valleys||[]).filter((v)=>!/협곡\\d+$/.test(v.name));}\n`);
const START = process.argv.includes('--start') ? process.argv[process.argv.indexOf('--start') + 1] : null;
const NOCANYON = process.argv.includes('--no-canyon');
let flat = START ? JSON.parse(fs.readFileSync(START, 'utf8')) : [];
const rounds = [];
for (let r = 1; r <= MAX; r++) {
  fs.writeFileSync(OUT, JSON.stringify(flat));
  const txt = execFileSync(process.execPath, [path.join(__dirname, 'plan-bridges-v2.js'), 'nippon'], { cwd: ROOT, env: Object.assign({}, process.env, { NODE_OPTIONS: `--require=${PRE}`, T550_BRIDGES_FILE: OUT, T550_NO_CANYON: NOCANYON ? '1' : '0' }), maxBuffer: 1 << 28 }).toString();
  const lines = txt.split('\n');
  const i = lines.findIndex((l) => /^추가할 flat 셀/.test(l));
  const add = i >= 0 ? JSON.parse(lines[i + 1]) : [];
  const cut = (lines.find((l) => /^도달 불가 마을/.test(l)) || '').replace(/^도달 불가 마을 /, '');
  const res = lines.find((l) => /^다리 가능/.test(l)) || '';
  const mainN = (lines.find((l) => /^본토\(다리 ON\)/.test(l)) || '').replace(/^본토\(다리 ON\) /, '').replace(/ ·.*/, '');
  const ocean = lines.find((l) => /^항해 층 필요/.test(l)) || '';
  rounds.push({ round: r, main: mainN, cut, result: res, addCells: add.length / 2, ocean });
  console.log(`판 ${r}: 본토 ${mainN} · 못 닿는 후보 ${cut.split(':')[0]} · ${res} · 더할 셀 ${add.length / 2}${ocean ? ' · ' + ocean.slice(0, 160) : ''}`);
  if (!add.length) break;
  // 같은 셀 두 번 안 넣는다
  const have = new Set(); for (let k = 0; k + 1 < flat.length; k += 2) have.add(flat[k] + '_' + flat[k + 1]);
  for (let k = 0; k + 1 < add.length; k += 2) if (!have.has(add[k] + '_' + add[k + 1])) { flat.push(add[k], add[k + 1]); have.add(add[k] + '_' + add[k + 1]); }
}
fs.writeFileSync(OUT, JSON.stringify(flat));
fs.writeFileSync(OUT.replace(/\.json$/, '_rounds.json'), JSON.stringify(rounds, null, 1));
try { fs.unlinkSync(PRE); } catch (e) {}
console.log(`다리 셀 ${flat.length / 2} · 판 ${rounds.length}`);
if (process.argv.includes('--apply')) {
  const ZC = path.join(ROOT, 'server', 'zone-config.js');
  const s = fs.readFileSync(ZC, 'utf8');
  const re = /(\n  nippon: \{[\s\S]*?\n    bridges: )\[[^\]]*\](,)/;
  if (!re.test(s)) { console.error('zone-config nippon bridges 줄을 못 찾았다'); process.exit(3); }
  fs.writeFileSync(ZC, s.replace(re, `$1${JSON.stringify(flat)}$2`));
  console.log(`기록: zone-config.js nippon bridges ← ${flat.length / 2}셀`);
}
