#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T709 ④ 옮긴 광맥 24 의 "자리에서 유도되는 칸"을 정본 식대로 다시 매긴다 · 기본 표만 · --apply 로 정본 두 파일)
// ★왜 — T614 ②+ 가 바다 위 광맥 24 를 뭍으로 옮겼고(T631 이 적재) T631 은 굽기 기록(region-bake-off) 5 줄만 따라 붙였다(`t631-bakeoff-follow.js`).
//   그런데 자잘 광맥의 광종 · 품위는 **자리 해시**다 — `test-mining` 의 세 계약(저장 pk ≡ 공식 · 자잘 광종 ≡ 전역 풀 + 마이그레이션 · 켬 판 굽기 밖 자잘 ≡ 풀)이
//   옮긴 24 에서 빨갛다(T631 · T639 가지에서도 그대로 빨갛다 — 그 카드 게이트 표에 `test-mining` 이 없었다).
//   ⇒ 옮긴 광맥만 **있는 식 그대로** 다시 매긴다(새 수 0 · 규칙 0줄):
//     ① 여섯째 판(굽기 전) 칸 — 광종 = 마이그레이션(전역 풀 `mineralAt(·, h2(셀, 731))`) · 다광종 = `POLY` 표 · pk = `orePeakFor(광종, 0.30, h2(셀, 500))`
//        (`scripts/migrate-veins-polymetal.js` · `test-mining` 과 같은 식 — 해시 좌표는 floor)
//     ② 그 광맥의 옛 굽기 기록 줄은 뺀다(옛 자리 · 옛 광종으로 쓴 것)
//     ③ 굽기를 다시 부른다(`t631-bakeoff-follow.js` ⓑ 와 같은 꼴 — 임시 사본에서 기록 없이 `t574-bake.js --L 500 --apply` · 이미 구운 광맥은 그대로 나온다)
//        → 바뀐 광맥이 옮긴 24 밖이면 멈춘다(rc 3) · 바뀐 것의 광종 칸 · 기록 줄만 정본으로.
// 쓰는 법: node scripts/t709-ore-follow.js <옮긴 광맥 이름 목록 json | T614 작업 파일> [--L 500] [--apply]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json'), OFF = path.join(ROOT, 'server', 'region-bake-off.json');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SRC = argv[0], L = opt('--L', '500'), APPLY = argv.includes('--apply');
const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const names = new Set(Array.isArray(src) ? src : src._t614.oresMoved.map((o) => o.name));
const S = require(path.join(ROOT, 'server', 'specialty')), HM = require(path.join(ROOT, 'server', 'hanbando-minerals'));
const h2 = (ix, iy, sd) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (sd | 0) * 1274126177; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const MIGRATE = (m) => (m === 'silver' ? 'lead' : m);
const cell = (o, sd) => h2(Math.floor(o.center[0] / 32), Math.floor(o.center[1] / 32), sd);
const cur = JSON.parse(fs.readFileSync(GAME, 'utf8')), off = JSON.parse(fs.readFileSync(OFF, 'utf8'));
const Z = 'hanbando', rows = [];
// ① 여섯째 판 칸
for (const o of cur[Z].ores) {
  if (!names.has(o.name)) continue;
  if (!o.minor) { console.error(`✗ ${o.name} — 자잘이 아니다(주요 광맥은 최소보장 보정이 걸린다 · 이 기계 몫 아님)`); process.exit(3); }
  const was = { mineral: o.mineral, pk: o.pk };
  o.mineral = MIGRATE(HM.mineralAt(0, 0, cell(o, 731)));
  const dist = HM.POLY[o.mineral]; if (dist) o.minerals = { ...dist }; else delete o.minerals;
  o.pk = S.orePeakFor(o.mineral, 0.30, cell(o, 500));
  rows.push({ name: o.name, center: o.center, canonWas: was.mineral, pkWas: was.pk, sixth: o.mineral, pk6: o.pk });
}
if (rows.length !== names.size) { console.error(`✗ 옮긴 광맥 ${names.size} 중 ${rows.length} 만 찾았다`); process.exit(3); }
// ② 옛 기록 줄 빼기
const before = off.zones[Z].length;
off.zones[Z] = off.zones[Z].filter((e) => !names.has(e.was && e.was.name));
const dropped = before - off.zones[Z].length;
// ③ 굽기 다시 부르기(임시 사본 · 기록 없이)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't709of-'));
execFileSync('bash', ['-c', `cd "${ROOT}" && git ls-files -z -- server sim scripts package.json | tar --null -T - -cf - | tar -C "${tmp}" -xf - && ln -s "${ROOT}/node_modules" "${tmp}/node_modules"`]);
fs.writeFileSync(path.join(tmp, 'server', 'hanbando-terrain.json'), JSON.stringify(cur));
fs.unlinkSync(path.join(tmp, 'server', 'region-bake-off.json'));
const log = execFileSync(process.execPath, [path.join(tmp, 'scripts', 't574-bake.js'), '--L', L, '--apply'], { cwd: tmp }).toString();
const baked = JSON.parse(fs.readFileSync(path.join(tmp, 'server', 'hanbando-terrain.json'), 'utf8'));
const off2 = JSON.parse(fs.readFileSync(path.join(tmp, 'server', 'region-bake-off.json'), 'utf8'));
let nb = 0;
for (const z of Object.keys(off2.zones)) for (const e of off2.zones[z]) {
  const nm = e.was.name;
  if (z !== Z || !names.has(nm)) { console.error(`✗ ${z} ${nm} — 옮기지 않은 광맥을 굽기가 바꾼다(기록 어긋남 · 이 기계 몫 아님)`); process.exit(3); }
  const i = cur[z].ores.findIndex((o) => o.name === nm), b = baked[z].ores.find((o) => o.name === nm);
  for (const k of ['mineral', 'minerals', 'pk']) { if (b[k] === undefined) delete cur[z].ores[i][k]; else cur[z].ores[i][k] = b[k]; }
  off.zones[z].push(e); nb++;
  const r = rows.find((q) => q.name === nm); r.baked = b.mineral; r.pkBaked = b.pk;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('| 광맥 | 자리(px) | T631 정본 | 여섯째 판(자리 식) | pk | 굽기(켬) |');
console.log('|---|---|---|---|---:|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.center.join(',')} | ${r.canonWas} | ${r.sixth} | ${r.pk6} | ${r.baked ? `**${r.baked}** · ${r.pkBaked}` : '그대로'} |`);
console.log(`옮긴 광맥 ${rows.length} · 옛 기록 줄 뺌 ${dropped} · 굽기가 바꾼 것 ${nb} · 기록 한반도 ${before} → ${off.zones[Z].length} · (굽기: ${(log.match(/기록[^\n]*/) || [''])[0].slice(0, 80)})`);
if (APPLY) {
  const raw = fs.readFileSync(GAME, 'utf8');
  fs.writeFileSync(GAME, raw.includes('\n') ? JSON.stringify(cur, null, 1) : JSON.stringify(cur));
  fs.writeFileSync(OFF, JSON.stringify(off, null, 1) + '\n');   // t574-bake.js 와 같은 꼴
  console.log('적용 — hanbando-terrain.json · region-bake-off.json');
} else console.log('(표만 — 쓰려면 --apply)');
