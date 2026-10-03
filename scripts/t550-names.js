#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T550 ④ 이름 · 닛폰 절만)
// =============================================================================
// 재민이 그은 것의 임시 이름(강N · 호수N · 산맥N · 숲N)을 **닛폰 문화 풀**로 짓는다 — 표를 새로 만들지 않는다(사본 0):
//   줄기 = `scripts/refine-world-v6.js` POOLS.nippon.stems(29 · 옛 닛폰 이름이 이미 이 풀에서 났다) · 꼬리 = 같은 풀의 rB '가와' · rg '야마' · lk '호' · fr '모리'
//   (T409 `t409-village-names.js` 가 중원북에 한 문법 — 줄기 풀을 원문에서 읽는다).
//   차례: 큰 것 먼저(강·산맥 = 길이 · 호수·숲 = 면적) — 줄기 하나 + 꼬리를 먼저 주고, 다 쓰면 줄기 둘 + 꼬리(풀 차례 · 결정론).
//   정본 어디에든 이미 있는 이름(어느 존 · 어느 종류)은 건너뛴다 → 겹침 0. 옛 이름은 **안 건드린다**.
//   계곡 이름은 따라 바꾼다: `<강>협곡k` · `<산맥번호>고개k`(spread-valleys 문법) → 새 이름으로.
//   마을 후보 `새후보N` 은 이름 칸만 — 줄기 + 한반도 업종 낱말(t409 문법: mining 광산 · riverside 어촌 · forest 임업 · plain 농촌).
// 쓰는 법: node scripts/t550-names.js [--apply] [--out 표.json]
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const APPLY = process.argv.includes('--apply');
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const src = fs.readFileSync(path.join(__dirname, 'refine-world-v6.js'), 'utf8');
const m = src.match(/nippon:\{stems:\[([^\]]*)\],rB:'([^']*)',rS:'([^']*)',rg:'([^']*)',lk:'([^']*)',fr:'([^']*)'\}/);
if (!m) { console.error('POOLS.nippon 을 못 찾았다'); process.exit(2); }
const STEMS = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
const SUF = { rivers: m[2], ridges: m[4], lakes: m[5], forests: m[6] };
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const N = world.nippon;
const used = new Set();
for (const z of Object.keys(world)) for (const k of Object.keys(world[z])) if (Array.isArray(world[z][k])) for (const f of world[z][k]) if (f && f.name) used.add(f.name);
// ★실존 지명은 안 쓴다 — `rename-real-toponyms.js` MAP 의 왼쪽(실존 · 예: 아오모리)을 읽어 막는다(재민 지시 그 파일 머리) ·
//   이 존이 **예전에 쓰던** 이름(지운 유키야마·츠키야마 등 · git HEAD 정본)도 막는다(같은 이름이 다른 자리로 가면 헷갈린다)
try { const rs = fs.readFileSync(path.join(__dirname, 'rename-real-toponyms.js'), 'utf8'); for (const mm of rs.matchAll(/'([^']+)':\s*'[^']+'/g)) used.add(mm[1]); } catch (e) {}
try { const old = JSON.parse(require('child_process').execFileSync('git', ['show', 'HEAD:server/hanbando-terrain.json'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString());
  for (const k of Object.keys(old.nippon)) if (Array.isArray(old.nippon[k])) for (const f of old.nippon[k]) if (f && f.name) used.add(f.name); } catch (e) {}
function* names(suf) {
  for (const a of STEMS) if (a !== suf) yield a + suf;                       // 모리모리 같은 되풀이는 뺀다
  for (const a of STEMS) for (const b of STEMS) if (a !== b && b !== suf) yield a + b + suf;
}
const plen = (f) => { let L = 0; for (let i = 1; i < f.path.length; i++) L += Math.hypot(f.path[i].pos[0] - f.path[i - 1].pos[0], f.path[i].pos[1] - f.path[i - 1].pos[1]); return L; };
const size = { rivers: plen, ridges: plen, lakes: (f) => (f.rx || f.radius || 0) * (f.ry || f.radius || 0), forests: (f) => (f.rx || 0) * (f.ry || 0) };
const PAT = { rivers: /^강\d+(_\d+)?$/, lakes: /^호수\d+$/, ridges: /^산맥\d+(_\d+)?$/, forests: /^숲\d+$/ };
const map = {}, rows = [];
for (const k of ['rivers', 'ridges', 'lakes', 'forests']) {
  const todo = (N[k] || []).filter((f) => PAT[k].test(f.name)).sort((a, b) => size[k](b) - size[k](a));
  const gen = names(SUF[k]);
  for (const f of todo) {
    let nm; do { nm = gen.next().value; } while (nm && used.has(nm));
    if (!nm) { console.error(`${k} 이름이 모자란다`); process.exit(3); }
    used.add(nm); map[k + ':' + f.name] = nm; rows.push({ kind: k, from: f.name, to: nm, size: Math.round(size[k](f) / (k === 'rivers' || k === 'ridges' ? 32 : 1)) });
  }
}
// 계곡 이름 따라가기
const rnew = (k, old) => map[k + ':' + old] || old;
const vrows = [];
for (const v of N.valleys || []) {
  const old = v.name; let nm = old, mm;
  if ((mm = old.match(/^(.+)협곡(\d+)$/))) nm = rnew('rivers', mm[1]) + '협곡' + mm[2];
  else if ((mm = old.match(/^(\d+)고개(\d+)$/))) nm = rnew('ridges', '산맥' + mm[1]) + '고개' + mm[2];
  if (nm !== old) { vrows.push({ from: old, to: nm }); v._newName = nm; }
}
// 마을 후보 새후보N — 줄기 + 업종 낱말(한반도 정본 51 의 이름 꼴에서 거꾸로 읽는다 · t409 문법)
const WORD = {};
for (const v of world.hanbando.villages) WORD[v.type] = String(v.name).replace(/[0-9]+$/, '');
const vgen = (function* () { for (const a of STEMS) yield a; for (const a of STEMS) for (const b of STEMS) if (a !== b) yield a + b; })();
const villRows = [];
for (const v of N.villages || []) {
  if (!/^새후보\d+$/.test(v.name)) continue;
  let nm; do { const s = vgen.next().value; nm = s + (WORD[v.type] || WORD.plain); } while (used.has(nm));
  used.add(nm); villRows.push({ from: v.name, to: nm, type: v.type }); v._newName = nm;
}
console.log(`=== 닛폰 이름 — 줄기 ${STEMS.length} · 꼬리 ${JSON.stringify(SUF)} ===`);
for (const k of ['rivers', 'ridges', 'lakes', 'forests']) console.log(`${k} ${rows.filter((r) => r.kind === k).length}: ` + rows.filter((r) => r.kind === k).map((r) => `${r.from}→${r.to}`).join(' · '));
console.log(`계곡 ${vrows.length}: ` + vrows.map((r) => `${r.from}→${r.to}`).join(' · '));
console.log(`마을 후보 ${villRows.length}: ` + villRows.map((r) => `${r.from}→${r.to}`).join(' · '));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ features: rows, valleys: vrows, villages: villRows }, null, 1));
if (!APPLY) { console.log('계산만 — 쓰려면 --apply'); process.exit(0); }
for (const k of ['rivers', 'ridges', 'lakes', 'forests']) for (const f of N[k] || []) if (map[k + ':' + f.name]) f.name = map[k + ':' + f.name];
for (const v of N.valleys || []) if (v._newName) { v.name = v._newName; delete v._newName; }
for (const v of N.villages || []) if (v._newName) { v.name = v._newName; delete v._newName; }
fs.writeFileSync(GAME, JSON.stringify(world));
console.log('기록: 닛폰 이름');
