#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1378 표 자 · 제품 무변 · 읽기만)
// === scripts/t1378-table.js — 봇 N 명 판의 존 버팀 표(T1378) ===================================================
//   읽는 것은 셋뿐이다: 존 `diag` 줄(10초마다 · tick_avg · tick_max · sendBuf) · `/health`(humans · tickP50Ms) · ps 표본(rss · 누적 CPU 초 ·
//   /proc/<존>/io wchar). 판마다 `meta.json` 은 판의 손잡이(봇 수 · 창 시각)만 싣는다.
//   쓰는 법: node scripts/t1378-table.js <runs 디렉터리> [--out <디렉터리>]   (판 디렉터리마다 meta.json · diag.txt[.gz] · samples.jsonl[.gz])
//   낸다: <out>/table.md · <out>/table.json · 같은 표를 stdout 에.
//   ⚠틱 p95 = diag 10초 창 평균(tick_avg)들의 p95 다(존이 틱 하나하나를 밖에 안 낸다). 최대 = 창 tick_max 의 최대.
//   ⚠바이트/초 = 존 프로세스가 쓴 바이트(wchar · 소켓 + 로그 + DB 쓰기 합) ÷ 창 시간 ÷ 붙은 소켓 수(/health humans 평균) — 봇이 받은 양의 위쪽 어림이다.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const argv = process.argv.slice(2);
const BASE = argv[0];
if (!BASE) { console.error('쓰는 법: node scripts/t1378-table.js <runs 디렉터리> [--out <디렉터리>]'); process.exit(2); }
const oi = argv.indexOf('--out');
const OUT = oi >= 0 ? argv[oi + 1] : path.dirname(path.resolve(BASE));

function readMaybeGz(dir, name) {
  const p = path.join(dir, name);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  if (fs.existsSync(p + '.gz')) return zlib.gunzipSync(fs.readFileSync(p + '.gz')).toString('utf8');
  return '';
}
const pct = (arr, q) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;

function one(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const lo = meta.t0, hi = meta.t1 + 10000;
  const diag = [];
  let exitLine = null;
  for (const ln of readMaybeGz(dir, 'diag.txt').split('\n')) {
    const m = /^(\d+) (.*)$/.exec(ln); if (!m) continue;
    const t = +m[1];
    if (/^EXIT /.test(m[2])) { exitLine = { t, code: m[2].slice(5) }; continue; }
    if (t < lo || t > hi) continue;
    const a = /tick_avg=([\d.]+)ms tick_max=(\d+)ms sendBuf=(\d+)KB/.exec(m[2]);
    if (a) diag.push({ t, avg: +a[1], max: +a[2], buf: +a[3] });
  }
  const samp = readMaybeGz(dir, 'samples.jsonl').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const ok = samp.filter((s) => s.rss != null && s.cpu != null);
  const hs = samp.filter((s) => s.health && typeof s.health === 'object');
  const f = ok[0], l = ok[ok.length - 1];
  const dt = f && l && l.t > f.t ? (l.t - f.t) / 1000 : null;
  const lastH = hs.length ? hs[hs.length - 1] : null;
  const minHum = hs.length ? Math.min(...hs.map((s) => s.health.humans | 0)) : null;
  const meanHum = hs.length ? mean(hs.map((s) => s.health.humans | 0)) : 0;
  const p50s = hs.map((s) => s.health.tickP50Ms).filter((x) => typeof x === 'number');
  const fb = samp.find((s) => s.botcpu != null), lb = [...samp].reverse().find((s) => s.botcpu != null);
  const healthMiss = samp.length - hs.length;
  return {
    tag: path.basename(dir), nq: meta.nq, nw: meta.nw, obs: meta.obs, villages: meta.villages, expected: meta.expected,
    windowSec: Math.round((meta.t1 - meta.t0) / 1000), samples: samp.length, healthMiss, diagLines: diag.length,
    tickMean: r1(mean(diag.map((d) => d.avg))), tickP95: r1(pct(diag.map((d) => d.avg), 0.95)),
    tickMax: diag.length ? Math.max(...diag.map((d) => d.max)) : null,
    healthP50Med: r1(pct(p50s, 0.5)),
    rssMaxMB: ok.length ? Math.round(Math.max(...ok.map((s) => s.rss)) / 1024) : null,
    rssEndMB: l ? Math.round(l.rss / 1024) : null, rssStartMB: f ? Math.round(f.rss / 1024) : null,
    sendBufPeakKB: diag.length ? Math.max(...diag.map((d) => d.buf)) : null,
    humansStart: hs.length ? hs[0].health.humans : null, humansEnd: lastH ? lastH.health.humans : null, humansMin: minHum,
    notIn: hs.length ? Math.max(0, meta.expected - (hs[0].health.humans | 0)) : null,            // 창 처음에 못 들어와 있던 소켓(기대 - 첫 표본 humans)
    dropped: hs.length ? Math.max(0, (hs[0].health.humans | 0) - (lastH.health.humans | 0)) : null,   // 창 안에서 끊긴 소켓(첫 표본 - 끝 표본)
    zoneCpuPct: dt ? r1(100 * (l.cpu - f.cpu) / dt) : null,
    botCpuPct: fb && lb && lb.t > fb.t ? r1(100 * (lb.botcpu - fb.botcpu) / ((lb.t - fb.t) / 1000)) : null,
    bytesPerSecPerBot: dt && meanHum > 0 && l.wchar != null && f.wchar != null ? Math.round((l.wchar - f.wchar) / dt / meanHum) : null,   // 붙어 있던 소켓 수(표본 humans 평균)로 나눈다
    zoneWriteBytesPerSec: dt && l.wchar != null && f.wchar != null ? Math.round((l.wchar - f.wchar) / dt) : null,
    zoneExit: exitLine && exitLine.t < meta.t1 ? exitLine.code : null,   // 창이 끝난 뒤 판을 닫으며 끈 것은 빼고 창 안에서 끝난 것만
  };
}

const ORDER = ['b0', 'b20', 'b50', 'b100', 'b200', 'crowd100'];
const dirs = fs.readdirSync(BASE).filter((d) => fs.existsSync(path.join(BASE, d, 'meta.json')))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
const rows = dirs.map((d) => one(path.join(BASE, d)));
const v = (x) => x == null ? '—' : String(x);
const head = ['판', '소켓(의뢰+걷기+관측)', '창 초', '틱 평균 ms', '틱 p95 ms', '틱 최대 ms', '/health p50 중앙 ms', 'RSS 처음→끝(최대) MB',
  'sendBuf 꼭대기 KB', '들어옴/기대', '창 안 끊김(최소 humans)', '존 CPU %', '봇 도구 CPU %', '봇마다 바이트/초', 'diag 줄'];
const md = ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'];
for (const r of rows) {
  md.push('| ' + [r.tag, `${r.expected}(${r.nq}+${r.nw}+${r.obs})`, r.windowSec, v(r.tickMean), v(r.tickP95), v(r.tickMax), v(r.healthP50Med),
    `${v(r.rssStartMB)}→${v(r.rssEndMB)}(${v(r.rssMaxMB)})`, v(r.sendBufPeakKB), `${v(r.humansStart)}/${r.expected}`, `${v(r.dropped)}(${v(r.humansMin)})`,
    v(r.zoneCpuPct), v(r.botCpuPct), v(r.bytesPerSecPerBot), r.diagLines + (r.zoneExit != null ? ` · 존 끝남 ${r.zoneExit}` : '') + (r.healthMiss ? ` · health 못 받음 ${r.healthMiss}` : '')].join(' | ') + ' |');
}
const text = md.join('\n') + '\n';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.md'), text);
fs.writeFileSync(path.join(OUT, 'table.json'), JSON.stringify(rows, null, 1) + '\n');
process.stdout.write(text);
