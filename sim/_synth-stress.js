// ★신규 교역품 내성 스트레스(2026-07-13 — 상설 배송 게이트): 가상 재화 3종을 소스 수준에서 무방비(게이트·수요캡·감산 0)
//   주입한 변형 번들을 빌드해, 취약 3맵(505·202·404)이 생존하는지 검사. econ 웨이브 배송 전 1회 권장(~1분 로컬).
//   근거(CHECKLIST 2026-07-13): 규칙 내(util≤0.3) 3종 동시 주입 = 전 맵 무손상이어야 정상(실측 505 761/8·202 797/8·404 633/8).
//   phase2(선택 --footgun): util 0.5(무소비 신상품에 식량급 보편수요 선언) = 규칙 밖 — 붕괴(pop<150)만 아니면 경고로 통과(404 385/5 실측).
//   사용: node sim/_synth-stress.js [frames=700] [seed(단일)] [--footgun]
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const SIM = __dirname, REPO = path.join(SIM, '..');
const FRAMES = +(process.argv[2] || 700);
const ONLY = process.argv[3] && !process.argv[3].startsWith('--') ? +process.argv[3] : null;
const FOOTGUN = process.argv.includes('--footgun');
const strip = s => s.replace(/^#!.*\n/, '');
const rep = (s, f, t, l) => { if (!s.includes(f)) throw new Error('앵커 소실: ' + l); return s.replace(f, t); };
const spec = strip(fs.readFileSync(path.join(REPO, 'server/specialty.js'), 'utf8'));
const e1src = strip(fs.readFileSync(path.join(SIM, 'economy-sim.js'), 'utf8'));
const e2src = strip(fs.readFileSync(path.join(SIM, 'economy-sim-v2.js'), 'utf8'));
function buildBundle(cUtil) {
  let e1 = e1src, e2 = e2src;
  e2 = rep(e2, '  ramie: 0.9,', '  synthA: 0.9, synthB: 0.9, synthC: 1.0,\n  ramie: 0.9,', 'ELASTICITY');
  e2 = rep(e2, '  ramie: 6,', '  synthA: 5, synthB: 8, synthC: 12,\n  ramie: 6,', 'BASE_VALUE');
  e2 = rep(e2, '  ramie: 0.05,', `  synthA: 0.1, synthB: 0.3, synthC: ${cUtil},\n  ramie: 0.05,`, 'UTILITY');
  e2 = rep(e2, '  ramie: 0.001,', '  synthA: 0.001, synthB: 0.001, synthC: 0.001,\n  ramie: 0.001,', 'DECAY');
  e1 = rep(e1, 'byproduct: { resin: 0.08, bark: 0.10, acorn: 0.06 },', 'byproduct: { resin: 0.08, bark: 0.10, acorn: 0.06, synthA: 0.08 },', '임업 부산물');
  e1 = rep(e1, 'byproduct: { wheat: 0.25, rice: 0.20, barley: 0.15, hemp: 0.06, ramie: 0.05 },', 'byproduct: { wheat: 0.25, rice: 0.20, barley: 0.15, hemp: 0.06, ramie: 0.05, synthB: 0.06 },', '농사 부산물');
  e1 = rep(e1, 'byproduct: { hide: 0.4, fur: 0.05, leather: 0.10, bone: 0.10, feather: 0.03 },', 'byproduct: { hide: 0.4, fur: 0.05, leather: 0.10, bone: 0.10, feather: 0.03, synthC: 0.05 },', '사냥 부산물');
  const wrap = (n, b) => `  modules[${JSON.stringify(n)}]=(function(){var module={exports:{}};var exports=module.exports;var require=req;\n${b}\n;return module.exports;})();\n`;
  return `// SYNTH-STRESS 변형 번들(자동 생성 — 커밋 금지)\n;(function(root){\n  var modules={};\n  function req(p){ if(/specialty/.test(p))return modules.specialty; if(/economy-sim-v2/.test(p))return modules.v2; if(/economy-sim/.test(p))return modules.v1; return {}; }\n${wrap('specialty', spec)}${wrap('v1', e1)}${wrap('v2', e2)}  root.EconEngine=Object.assign({},modules.v1,modules.v2);\n})(typeof window!=='undefined'?window:globalThis);\n`;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synth-'));
let harness = fs.readFileSync(path.join(SIM, 'regression-check.js'), 'utf8');
harness = rep(harness, "require(path.join(__dirname, 'economy-engine.browser.js'));", 'require(process.env.SYNTH_BUNDLE);', 'require 스왑');
harness = rep(harness, "const ROOT = path.join(__dirname, '..', '..');", `const ROOT = ${JSON.stringify(path.join(REPO, '..'))};`, 'ROOT 고정');
fs.writeFileSync(path.join(tmp, 'harness.js'), harness);
const SEEDS = ONLY ? [ONLY] : [505, 202, 404];
function phase(name, cUtil, judge) {
  const bp = path.join(tmp, `bundle_${cUtil}.js`); fs.writeFileSync(bp, buildBundle(cUtil));
  console.log(`\n== ${name} (synthC util ${cUtil}, @${FRAMES}f) ==`);
  let allOk = true;
  for (const s of SEEDS) {
    const out = execFileSync('node', ['--max-semi-space-size=128', path.join(tmp, 'harness.js'), '--seed', String(s), '--frames', String(FRAMES)], { env: { ...process.env, SYNTH_BUNDLE: bp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const j = JSON.parse(out.match(/@@RESULT@@(.*)/)[1]);
    const v = judge(j); allOk = allOk && v.ok;
    console.log(`  시드${s}: pop ${j.pop} · 촌 ${j.finalVil}/${j.initVil} · bad ${j.bad} → ${v.ok ? '✅' : v.warn ? '⚠️' : '❌'}${v.note || ''}`);
  }
  return allOk;
}
const ok1 = phase('규칙 내(설계 규칙 준수 재화)', 0.3, j => ({ ok: j.pop >= 150 && j.finalVil >= j.initVil - 2 && j.bad === 0 }));
let ok2 = true;
if (FOOTGUN) ok2 = phase('풋건(규칙 밖 util 0.5 — 참고)', 0.5, j => j.pop >= 150 ? { ok: true, warn: j.finalVil < j.initVil - 2, note: j.finalVil < j.initVil - 2 ? ' (마을 손실 — 규칙 밖 예상 열화)' : '' } : { ok: false, note: ' (붕괴 — FOOD_CLASSES/pull 회귀 의심!)' });
console.log(ok1 && ok2 ? '\n✅ 신규 교역품 내성 통과' : '\n❌ 내성 실패 — pull 채널·FOOD_CLASSES·수요-캡 회귀 조사 필요');
process.exit(ok1 && ok2 ? 0 : 1);
