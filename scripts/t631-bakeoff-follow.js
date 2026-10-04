#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T631 ② 광맥 옮김을 굽기 기록에 따라 붙이기 · 기본 표만 · --apply 로 정본 두 파일)
// 광맥 자리를 옮기면(T614 ②+) 굽기 기록 `server/region-bake-off.json` 이 두 가지로 어긋난다:
//   ⓐ 기록은 광맥을 **중심 좌표**로 찾는다(`region-profiles.restoreBakeOff` · `e.c`) — 옮긴 광맥의 옛 기록은 끔(T574_REGION=0)에서 못 찾는다
//      ⇒ 옛 중심 = 기록 c 인 줄을 새 중심으로 고친다(was.center 도 새 중심 — 끔이 자리를 옛 바다로 되돌리지 않게 · 광종 칸 그대로)
//   ⓑ 꼬리 규칙(자리 해시 씨)은 자리마다 다르다 — 옮긴 자리에서 굽기가 광종을 바꾸는 광맥이 생길 수 있다
//      ⇒ 굽기를 **그 광맥에만** 다시 부른다: 임시 사본에서 기록을 치우고 `t574-bake.js --L <L> --apply`(덜 흔드는 굽기 · 이미 구운 광맥은 그대로 나온다)
//         → 바뀐 광맥(= 옮긴 자리 탓)의 광종 칸 · 기록 줄만 정본으로 옮긴다(사본 0 · 규칙 0줄)
// 쓰는 법: node scripts/t631-bakeoff-follow.js <옛 정본 json(옮기기 전)> [--L 500] [--apply]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json'), OFF = path.join(ROOT, 'server', 'region-bake-off.json');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OLD = argv[0], L = opt('--L', '500'), APPLY = argv.includes('--apply');
const old = JSON.parse(fs.readFileSync(OLD, 'utf8')), cur = JSON.parse(fs.readFileSync(GAME, 'utf8')), off = JSON.parse(fs.readFileSync(OFF, 'utf8'));
const rows = [];
// ⓐ 옛 기록 다시 잇기
for (const z of Object.keys(off.zones)) {
  const om = new Map((old[z] && old[z].ores || []).map((o) => [o.name, o])), cm = new Map((cur[z] && cur[z].ores || []).map((o) => [o.name, o]));
  for (const e of off.zones[z]) {
    const nm = e.was && e.was.name, a = om.get(nm), b = cm.get(nm);
    if (!a || !b || (a.center[0] === b.center[0] && a.center[1] === b.center[1])) continue;
    if (e.c[0] !== a.center[0] || e.c[1] !== a.center[1]) continue;
    rows.push({ zone: z, name: nm, kind: '기록 다시 잇기', from: e.c, to: b.center });
    e.c = [b.center[0], b.center[1]]; e.was.center = [b.center[0], b.center[1]];
  }
}
// ⓐ′ 다시 이은 기록의 광종 = 새 자리에서 옛 기록을 구운 값(정본 = 굽기(옛 기록) — `test-region-profiles` ② 와 같은 식 · 꼬리·다시 뽑기 씨가 자리 해시라 자리가 바뀌면 값이 바뀐다)
process.env.T574_NEW_ITEMS = '';
const RP = require(path.join(ROOT, 'server', 'region-profiles')), SP = require(path.join(ROOT, 'server', 'specialty'));
const bakeOf = (z, w) => { const b = z === 'hanbando' ? RP.rebakeKeep(z, w, +L) : RP.bakeOre(z, w.center[0], w.center[1], RP.veinU(w.center[0], w.center[1]), !w.minor, +L);
  if (!b || b.mineral === w.mineral) return w;
  const e = Object.assign({}, w, { mineral: b.mineral, pk: SP.orePeakFor(b.mineral, 0.30, RP.veinU(w.center[0], w.center[1], +L)) });
  if (b.minerals) e.minerals = b.minerals; else delete e.minerals; return e; };
for (const r of rows.filter((q) => q.kind === '기록 다시 잇기')) {
  const z = r.zone, list = off.zones[z], k = list.findIndex((e) => e.was.name === r.name), e = list[k], i = cur[z].ores.findIndex((o) => o.name === r.name);
  const nb = bakeOf(z, e.was); r.canonWas = cur[z].ores[i].mineral; r.bakedNow = nb.mineral; r.pk = nb.pk;
  if (JSON.stringify(nb) === JSON.stringify(e.was)) { cur[z].ores[i] = JSON.parse(JSON.stringify(e.was)); list.splice(k, 1); r.note = '새 자리에선 굽기가 안 바꾼다 — 옛 기록으로 · 기록 줄 뺌'; }
  else { cur[z].ores[i] = nb; e.now = nb.mineral; }
}
// ⓑ 옮긴 자리에서 굽기가 바꾸는 광맥 — 임시 사본에서 기록 없이 굽기를 부른다
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't631bo-'));
execFileSync('bash', ['-c', `cd "${ROOT}" && git ls-files -z -- server sim scripts package.json | tar --null -T - -cf - | tar -C "${tmp}" -xf - && ln -s "${ROOT}/node_modules" "${tmp}/node_modules"`]);
fs.writeFileSync(path.join(tmp, 'server', 'hanbando-terrain.json'), JSON.stringify(cur));
fs.unlinkSync(path.join(tmp, 'server', 'region-bake-off.json'));
const log = execFileSync(process.execPath, [path.join(tmp, 'scripts', 't574-bake.js'), '--L', L, '--apply'], { cwd: tmp }).toString();
const baked = JSON.parse(fs.readFileSync(path.join(tmp, 'server', 'hanbando-terrain.json'), 'utf8'));
const off2 = JSON.parse(fs.readFileSync(path.join(tmp, 'server', 'region-bake-off.json'), 'utf8'));
for (const z of Object.keys(off2.zones)) for (const e of off2.zones[z]) {
  const nm = e.was.name, i = cur[z].ores.findIndex((o) => o.name === nm), moved = old[z].ores.find((o) => o.name === nm);
  if (!moved || (moved.center[0] === cur[z].ores[i].center[0] && moved.center[1] === cur[z].ores[i].center[1])) {
    console.error(`✗ ${z} ${nm} — 옮기지 않은 광맥을 굽기가 바꾼다(기록 어긋남 · 이 기계 몫 아님)`); process.exit(3); }
  const nb = baked[z].ores.find((o) => o.name === nm);
  for (const k of ['mineral', 'minerals', 'pk']) { if (nb[k] === undefined) delete cur[z].ores[i][k]; else cur[z].ores[i][k] = nb[k]; }
  off.zones[z].push(e);
  rows.push({ zone: z, name: nm, kind: '옮긴 자리 굽기', was: e.was.mineral, now: e.now, pk: nb.pk });
}
fs.rmSync(tmp, { recursive: true, force: true });
for (const r of rows) console.log(JSON.stringify(r));
console.log(`기록 다시 잇기 ${rows.filter((r) => r.kind === '기록 다시 잇기').length} · 옮긴 자리 굽기 ${rows.filter((r) => r.kind === '옮긴 자리 굽기').length} · (굽기: ${(log.match(/기록: [^\n]*/) || [''])[0]})`);
if (APPLY) { fs.writeFileSync(GAME, JSON.stringify(cur)); fs.writeFileSync(OFF, JSON.stringify(off, null, 1) + '\n'); console.log('적용 — hanbando-terrain.json · region-bake-off.json'); }
else console.log('표만 — 쓰려면 --apply');
