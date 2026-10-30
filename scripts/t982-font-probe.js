#!/usr/bin/env node
// === scripts/t982-font-probe.js — 로비 2위 "첫 배치"(스크립트 앞 Layout · 스타일)가 한글 글꼴 대체 찾기 몫인지 (T982 ②) · 러너 밖 계측 자 ==========
//
//   같은 트리 · 같은 페이지를 크롬으로 판마다 새 브라우저에 띄우고, 성능 추적으로 첫 배치 판(RunTask 안 Layout · UpdateLayoutTree 가 든 첫 긴 판)과
//   그 안 글자 모양 잡기(InlineNode::ShapeTextIncludingFirstLine 등)를 잰다. 두 갈래를 번갈아 돈다:
//     A = 상자 그대로 — CSS `--font` 의 'Noto Sans KR' · 'Apple SD Gothic Neo' · 'Malgun Gothic' 이 이 상자에 없다 → system-ui(Inter · 한글 없음)
//         → 한글 글자마다 대체 글꼴을 찾는다(맥 Safari 는 'Apple SD Gothic Neo' 가 첫 손에 잡힌다).
//     B = 브라우저에만 fontconfig 별칭 한 줄('Noto Sans KR' → 'Noto Sans CJK KR' · 상자에 이미 있는 글꼴) — 맥처럼 첫 이름이 곧바로 잡히는 꼴.
//   제품 0 · CSS 0 · 별칭 파일은 이 자가 임시 폴더에 쓴다.
// 실행: node scripts/t982-font-probe.js [판 수=6]
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const N = +process.argv[2] || 6;
const CPORT = 3010, ZPORT = 3020;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't982-font-'));
const CONF = path.join(TMP, 'fonts-kr.conf');
fs.writeFileSync(CONF, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n  <alias binding="same"><family>Noto Sans KR</family><prefer><family>Noto Sans CJK KR</family></prefer></alias>\n</fontconfig>\n`);

function firstLayout(file) {
  const ev = JSON.parse(fs.readFileSync(file, 'utf8')).traceEvents;
  const t = ev.find((e) => e.name === 'thread_name' && e.args && e.args.name === 'CrRendererMain' && ev.some((x) => x.pid === e.pid && x.name === 'navigationStart'));
  if (!t) return null;
  const nav = ev.find((e) => e.pid === t.pid && e.name === 'navigationStart');
  const mine = ev.filter((e) => e.pid === t.pid && e.tid === t.tid && e.ph === 'X');
  const tasks = mine.filter((e) => e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask').sort((a, b) => a.ts - b.ts);
  const inT = (k, e) => e.ts >= k.ts && e.ts + (e.dur || 0) <= k.ts + k.dur;
  const layoutTasks = tasks.filter((k) => mine.some((e) => (e.name === 'Layout' || e.name === 'UpdateLayoutTree') && inT(k, e)));
  const k = layoutTasks.sort((a, b) => b.dur - a.dur).find((x) => x.ts - nav.ts < 1500000) || null;   // 첫 1.5초 안 가장 긴 배치 판(스크립트 앞)
  if (!k) return null;
  const sum = (re) => mine.filter((e) => re.test(e.name) && inT(k, e)).reduce((s, e) => s + e.dur, 0) / 1000;
  const top = (n) => { const xs = mine.filter((e) => e.name === n && inT(k, e)); return xs.reduce((s, e) => s + e.dur, 0) / 1000; };
  return { at: Math.round((k.ts - nav.ts) / 1000), task: +(k.dur / 1000).toFixed(1), layout: +top('Layout').toFixed(1), style: +top('UpdateLayoutTree').toFixed(1), shape: +sum(/^InlineNode::ShapeText/).toFixed(1) };
}

(async () => {
  console.log(`\n=== T982 ② 첫 배치 — 한글 글꼴 대체 찾기 몫 · 크롬 · ${N}판 × 두 갈래 ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `/tmp/t982f-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: `/tmp/t982f-z-${process.pid}.db`, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const { chromium } = require('playwright');
  const res = { A: [], B: [] };
  for (let i = 0; i < N; i++) for (const g of ['A', 'B']) {
    const env = Object.assign({}, process.env); if (g === 'B') env.FONTCONFIG_FILE = CONF;
    const browser = await chromium.launch({ env });
    const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
    const f = path.join(TMP, `tr-${g}.json`);
    await browser.startTracing(page, { path: f, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'blink.user_timing', 'toplevel'] });
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await browser.stopTracing(); await browser.close();
    const r = firstLayout(f); if (process.env.T982_KEEP) fs.copyFileSync(f, process.env.T982_KEEP); fs.unlinkSync(f);
    res[g].push(r); console.log(`  ${g} ${i + 1}: ${JSON.stringify(r)}`);
  }
  const st = (xs, k) => { const v = xs.filter(Boolean).map((x) => x[k]).sort((a, b) => a - b); return `${v[0]}~${v[v.length - 1]} (중앙 ${v[v.length >> 1]})`; };
  for (const g of ['A', 'B']) console.log(`${g === 'A' ? 'A 상자 그대로   ' : 'B 첫 이름 잡힘  '} 판 ${st(res[g], 'task')} · Layout ${st(res[g], 'layout')} · 스타일 ${st(res[g], 'style')} · 글자 모양 ${st(res[g], 'shape')}`);
  fs.writeFileSync(path.join(TMP, 'res.json'), JSON.stringify(res));
  process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
