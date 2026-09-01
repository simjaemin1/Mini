#!/usr/bin/env node
// === scripts/handover-split.js — 인계 문서 영역 분리 (1회성 이사 도구 + 무손실 대조) ==
//
// ★★[0번 분할 배치 2026-09-01] 목적은 하나 — 여러 세션이 **같은 파일을 덜 만지게** 하는 것.
//   `다음세션_인계.md` 는 4,926줄이고 배치마다 모든 세션이 여기에 절을 덧붙였다.
//   ⇒ 영역별 파일로 가른다. **문장은 한 글자도 안 고친다**(낡은 서술도 그대로 — 표만 붙인다).
//
// ⚠이 도구는 **읽고 옮기기만** 한다. 원문 절의 본문을 편집하지 않는다.
//   낡아 보이는 줄을 고치는 건 그 영역을 소유한 세션의 몫이다(지시서 §3).
//
// 사용:
//   node scripts/handover-split.js --plan     # 배정표만 출력(아무것도 안 씀)
//   node scripts/handover-split.js --write    # 인계/ 생성
//   node scripts/handover-split.js --verify   # ★무손실 대조(원문 줄 ⊆ 새 파일 합집합)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// ★원문 정본 — 이사가 끝나면 `다음세션_인계.md` 는 3줄 안내문만 남으므로,
//   대조의 기준은 **동결 아카이브**다(그게 원문과 바이트 동일하다는 것도 함께 검사한다).
const SRC_LIVE = path.join(ROOT, '다음세션_인계.md');
const SRC_ARCHIVE = path.join(ROOT, '인계', '_아카이브_2026-08_다음세션_인계.md');
const SRC = fs.existsSync(SRC_ARCHIVE) && fs.readFileSync(SRC_LIVE, 'utf8').split('\n').length < 20
  ? SRC_ARCHIVE : SRC_LIVE;
const OUT = path.join(ROOT, '인계');

// ── 영역 정의 (태스크보드 v1 §1 영역 지도와 같은 코드) ────────────────────────
const AREAS = {
  '공통': '공통.md', '회부': '회부.md',
  R1: 'R1-지형렌더.md', W: 'W-월드질의.md', N: 'N-네트워크.md', M: 'M-이동입력.md',
  R2: 'R2-개체렌더.md', X: 'X-전쟁.md', H: 'H-HUD신체.md', F: 'F-제작건축.md',
  T: 'T-거래.md', S: 'S-사회스킬.md', I: 'I-인벤.md',
  E: 'E-사건장부.md', B: 'B-신체서버.md', K: 'K-달력온도.md', L: 'L-로트부패.md',
  C: 'C-채집자연물.md', V: 'V-마을배치.md', Z: 'Z-존서버.md',
};
const AREA_TITLE = {
  '공통': '공통 — 규약·캐논·검증 원칙 (★PM 만 편집)',
  '회부': '회부 — 전 배치의 "구현 금지" 누적',
  R1: 'R1 지형렌더 — 지면·물·산·안개·지도', W: 'W 월드질의 — 방·지붕·시야·차단·세계 시각',
  N: 'N 네트워크 — 접속·재접속·메시지 처리', M: 'M 이동·입력 — 예측·보정·조준',
  R2: 'R2 개체렌더 — 캐릭터·건물·아이템·줌', X: 'X 전쟁 — (동결)',
  H: 'H HUD·좌측기둥·신체창', F: 'F 제작·건축·야금', T: 'T 거래·거래소·장마당',
  S: 'S 사회·스킬·클레임', I: 'I 인벤·무게·바닥',
  E: 'E 사건 장부·게시판', B: 'B 신체(서버)', K: 'K 달력·온도·날씨',
  L: 'L 로트·부패·보존', C: 'C 채집·자연물·작물·낚시', V: 'V 마을·배치·건립', Z: 'Z 존 서버·계정·운영',
};

// ── ★배정표 — 원문 절 제목의 앞부분 → 영역 ──────────────────────────────────
//   애매하면 **호출자/주제 영역**을 따른다(지시서 §2). 한 절이 두 영역에 걸치면
//   주 영역에 두고 다른 쪽엔 참조 한 줄(아래 XREF).
const MAP = [
  ['## 0. 부트스트랩', '공통'],
  ['## 1. 절대 규칙', '공통'],
  ['## 2. 검증 원칙', '공통'],
  ['## 3. 현재 상태', '공통'],
  ['## 4. 작업 배치', '회부'],
  ['## 5. 회부만 할 것', '회부'],
  ['## 6. 완료 기준', '공통'],
  ['## 3-b.', 'F'],            // 청동 축 종결(야금)
  ['## 3-c.', 'V'], ['## 3-d.', 'V'],           // 마을 건립
  ['## 3-e.', 'Z'], ['## 3-f.', 'Z'],           // 게스트 영속 신원·몸
  ['## 3-g.', 'V'], ['## 3-h.', 'V'],           // 50마을 세계
  ['## 3-i.', 'R2'],           // 실내 컷어웨이 · 낚시터 방황
  ['## 3-j.', 'W'],            // 건축 방 판정·지붕·다층
  ['## 3-m.', 'R1'],           // 물가 렉 · 타일 상태계
  ['## 3-k.', 'R1'],           // 지형 실장 1
  ['## 3-l.', 'C'],            // 지형 실장 2 — 자연물
  ['## 3-z.', 'E'],            // 사건 레이어
  ['## 3-y.', 'N'],            // B-6 재접속 몸 승계
  ['## 3-x.', 'Z'],            // terrain 사망 원인 · 주기 저장
  ['## 3-w.', 'C'],            // 낚시 v2
  ['## 3-v.', 'B'],            // 신체 상태 + UI 골격
  ['## 3-u.', 'T'],            // 마을 거래소
  ['## 3-t.', 'I'],            // 무게 모델 + 곡물 품목화
  ['## 3-s. ★★2026-08-28', 'I'],       // 빈손 시작
  ['## 3-r. ★★2026-08-29', 'C'],       // 채집 사막 수리(배산임수)
  ['## 3-q. ★★2026-08-29', 'F'],       // 시설 제작창
  ['## 3-n. ★★2026-08-30 튜닝', 'B'],  // 신체 3층 재배선
  ['## 3-추2.', 'K'], ['## 3-온.', 'K'],
  ['## 3-작.', 'C'],           // 작물 층
  ['## 3-부.', 'L'],           // 부패·보존
  ['## 3-o. ★★2026-08-30 접속', 'N'],
  ['## 3-p. ★★2026-08-30 정비', 'I'],
  ['## 3-o. ★★2026-08-30 배치', 'M'],  // 가속 이동 모델
  ['## 3-안.', 'R1'],          // 안개 정렬 · 로비
  ['## 3-멎.', 'Z'],           // 존 멎음 원인 + 타일 지형 메모
  ['## 3-s. ⚠2026-08-31', 'Z'],        // 라이브 존 멎음 관측
  ['## 3-r. ★★2026-08-31', 'R2'],      // 마우스 휠 확대
  ['## 3-q. ★★2026-08-31', 'R2'],      // 소체 3차
  ['## 3-p. ★★2026-08-31', 'R2'],      // 소체 2차
  ['## 3-n. ★★2026-08-30 배치 — **캐릭터', 'R2'],
  ['## 3-산-ⓐ.', 'R1'], ['## 3-산.', 'R1'],
];
// 주 영역 밖에서도 찾을 만한 절 — 참조 한 줄만 남긴다(복제 금지 · 지시서 §3)
const XREF = {
  '## 3-v.': ['H'], '## 3-n. ★★2026-08-30 튜닝': ['H', 'I', 'K'],
  '## 3-i.': ['C'], '## 3-j.': ['F'], '## 3-l.': ['R1'],
  '## 3-t.': ['F'], '## 3-작.': ['V'], '## 3-부.': ['T', 'F'],
  '## 3-추2.': ['B', 'F'], '## 3-온.': ['B'], '## 3-y.': ['B'],
};

function sections(text) {
  const lines = text.split('\n');
  const idx = [];
  lines.forEach((l, i) => { if (/^## /.test(l)) idx.push(i); });
  const out = [];
  if (idx.length && idx[0] > 0) out.push({ title: '(머리말)', start: 0, end: idx[0] - 1 });
  idx.forEach((s, k) => out.push({ title: lines[s], start: s, end: (k + 1 < idx.length ? idx[k + 1] - 1 : lines.length - 1) }));
  return { lines, out };
}
function areaOf(title) {
  // 더 긴 접두가 이긴다(중복 절 번호가 있어서 — 3-o/3-p/3-q/3-r/3-s 가 두 번씩 쓰였다)
  let best = null;
  for (const [pre, a] of MAP) if (title.startsWith(pre) && (!best || pre.length > best[0].length)) best = [pre, a];
  return best;
}

const raw = fs.readFileSync(SRC, 'utf8');
const { lines, out: secs } = sections(raw);

const plan = secs.map((s) => {
  if (s.title === '(머리말)') return Object.assign({ area: '공통', key: '(머리말)' }, s);
  const hit = areaOf(s.title);
  return Object.assign({ area: hit ? hit[1] : null, key: hit ? hit[0] : null }, s);
});

if (process.argv.includes('--plan') || process.argv.length <= 2) {
  const byArea = {};
  let unmapped = 0;
  for (const p of plan) {
    if (!p.area) { unmapped++; console.log('  ★배정 없음:', p.title.slice(0, 80)); continue; }
    (byArea[p.area] = byArea[p.area] || []).push(p);
  }
  console.log(`\n=== 인계 분리 계획 — 원문 ${lines.length}줄 · 절 ${secs.length}개`);
  for (const a of Object.keys(AREAS)) {
    const ss = byArea[a] || [];
    const n = ss.reduce((x, s) => x + (s.end - s.start + 1), 0);
    console.log(`  ${AREAS[a].padEnd(18)} 절 ${String(ss.length).padStart(2)} · ${String(n).padStart(5)}줄   ${ss.map((s) => (s.key || '').replace('## ', '')).join(' ')}`);
  }
  console.log(`  ★배정 없는 절: ${unmapped}`);
  process.exit(unmapped ? 1 : 0);
}

if (process.argv.includes('--write')) {
  fs.mkdirSync(OUT, { recursive: true });
  // ⓐ 아카이브 — 원문 그대로 동결(족보 · 삭제 금지)
  fs.writeFileSync(path.join(OUT, '_아카이브_2026-08_다음세션_인계.md'), raw);
  // ⓑ 영역 파일
  const byArea = {};
  for (const p of plan) if (p.area) (byArea[p.area] = byArea[p.area] || []).push(p);
  for (const [code, file] of Object.entries(AREAS)) {
    const ss = byArea[code] || [];
    const head = [
      `# 인계 — ${AREA_TITLE[code]}`,
      '',
      '> ★이 파일은 **영역 소유 세션만** 갱신한다. 다른 영역에 쓸 말이 생기면 `인계/회부.md` 에 한 줄.',
      '> 원문은 `_아카이브_2026-08_다음세션_인계.md` 에 그대로 동결돼 있다(족보 · 삭제 금지).',
      '> 이사할 때 **문장을 한 글자도 안 고쳤다** — 낡아 보이는 줄엔 `[낡음? 확인 필요]` 표만 붙였다.',
      '',
    ];
    // 다른 영역 절에 대한 참조 한 줄(복제 금지)
    const xr = [];
    for (const [pre, tos] of Object.entries(XREF)) {
      if (!tos.includes(code)) continue;
      const p = plan.find((q) => q.key === pre);
      if (p) xr.push(`* → 참조: \`인계/${AREAS[p.area]}\` — ${p.title.replace(/^## /, '').slice(0, 70)}`);
    }
    if (xr.length) head.push('## 다른 영역에 있는 관련 절', '', ...xr, '');
    const body = ss.map((s) => lines.slice(s.start, s.end + 1).join('\n'));
    fs.writeFileSync(path.join(OUT, file), head.join('\n') + (body.length ? body.join('\n') + '\n' : '_(아직 이 영역으로 배정된 절이 없다 — 아카이브 참조)_\n'));
  }
  console.log('인계/ 작성 완료:', Object.keys(AREAS).length + 1, '파일');
  process.exit(0);
}

if (process.argv.includes('--verify')) {
  const norm = (l) => l.replace(/\s+/g, ' ').trim();
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.md'));
  const areaOnly = new Set(), withArchive = new Set();
  for (const f of files) {
    const t = fs.readFileSync(path.join(OUT, f), 'utf8').split('\n').map(norm);
    for (const l of t) { withArchive.add(l); if (!f.startsWith('_아카이브')) areaOnly.add(l); }
  }
  const src = lines.map(norm).filter((l) => l !== '');
  const missA = src.filter((l) => !areaOnly.has(l));
  const missB = src.filter((l) => !withArchive.has(l));
  console.log(`\n=== 인계 이사 무손실 대조 — 원문 ${lines.length}줄(빈 줄 제외 ${src.length})`);
  console.log(`  영역 파일만으로 덮이지 않는 줄: ${missA.length}`);
  console.log(`  영역 파일 + 아카이브로 덮이지 않는 줄: ${missB.length}   ← ★이게 0 이어야 한다`);
  if (missA.length) { console.log('  (영역만 기준 누락 표본)'); missA.slice(0, 8).forEach((l) => console.log('    ' + l.slice(0, 88))); }
  if (missB.length) { console.log('  ★★누락 표본:'); missB.slice(0, 10).forEach((l) => console.log('    ' + l.slice(0, 88))); }
  process.exit(missB.length ? 1 : 0);
}
