#!/usr/bin/env node
'use strict';
// (계측 자 · 판정 0) T1383 ①ⓒ — PM land1084 의 `test-t969-shelter-day` 날 읽기 고침(첫 요약 줄 앞 백필 = 0)이 미끼 ③ 을 약하게 하나 — 한 번 공격.
//   하네스의 `collect` 를 글자 그대로 떠 와(사본 0 — 함수 글자를 하네스 파일에서 잘라 돈다) 가짜 판 로그 넷에 돌린다.
//   쓰는 법: node 계측/T1383_2026-11-19/t969-공격.js [하네스 경로]
const fs = require('fs'), os = require('os'), path = require('path');
const H = process.argv[2] || path.join(__dirname, '..', '..', 'scripts', 'test-t969-shelter-day.js');
const src = fs.readFileSync(H, 'utf8');
const a = src.indexOf('function collect(dir)'), b = src.indexOf('\nfunction run(', a);
const collect = new Function('fs', 'path', 'SEED', src.slice(a, b) + '\nreturn collect;')(fs, path, 42);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 't969atk-'));
const BF = '[hanbando] 공용 쉼터 백필 — 51곳에 세웠다', DAY = (n) => `[hanbando] 마을 econ day ${n} · 요약`;
const CASES = {
  '날 4 앞 백필(종전 꼴)': [DAY(3), DAY(4), BF, DAY(5)],
  '첫 요약 줄 앞 백필(PM 고침이 0 으로)': ['[boot] 교역로 파는 중', BF, DAY(1), DAY(2)],
  '백필 뒤 판이 죽음(요약 줄 0 · 판 JSON 0)': ['[boot] 교역로 파는 중', BF, 'Error: 무엇이 죽었다'],
  '백필 줄 없음': [DAY(1), DAY(2)],
};
for (const [k, lines] of Object.entries(CASES)) {
  const d = path.join(D, String(Object.keys(CASES).indexOf(k))); fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'base-42.log'), lines.join('\n') + '\n');
  if (!/죽음/.test(k)) fs.writeFileSync(path.join(d, 'base-42.json'), '{}');
  const r = collect(d);
  console.log(`${k.padEnd(28)} → day ${r.day} · 판 JSON ${r.json ? '있음' : '없음'} · 미끼 ③(w0.day != null && w0.day !== 59) ${r.day != null && r.day !== 59 ? '초록' : '빨강'}`);
}
fs.rmSync(D, { recursive: true, force: true });
