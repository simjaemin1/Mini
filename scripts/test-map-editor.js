#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-map-editor.js — 맵 에디터: 이어 긋기 · 자동 팬 · 점 고치기 · 잇기 · export 동일 [T553] ===
//
// ★왜 [T553 2026-09-30 재민]: "긴 강이나 산맥을 연결하다 마우스 한계로 잠시 끊으면 기존 것에 이어지지 않고 새 지형으로 인식된다"
//   · "그리기·고치기 자체가 힘들다". 에디터(`lab/map-editor.html`)는 도구라 세계 판정은 없다 — 대신 **손으로 한 일이 그대로 남나**를
//   헤드리스 크로미움에서 실제 마우스·키로 잰다(함수를 직접 부르면 입력 경로의 결함을 못 본다).
//
// 재는 것:
//   ⓐ 여는 길 셋 — 맥 사본(박은 한 파일 · file://) · 레포 판 + fetch(http) · 레포 판 file://(fetch 막힘 → 내장 없이 뜬다 · 오류 0)
//   ⓑ export 바이트 = 종전 에디터(T553 전) export — 손 안 댄 내장 작업 · 단일(한반도) · 전체 월드 두 판(sha256 고정값 · 종전 파일로 뽑은 값)
//      `MAP_EDITOR_OLD=<옛 html>` 을 주면 고정값 대신 옛 파일을 그 자리에서 열어 직접 대조한다
//   ⓒ 옛 작업 파일 불러오기(`world v10.json` = 내장 작업과 같은 것 · 파일 입력으로) → 수 · export 같음
//   ⓓ 이어 긋기 — 끝(뒤에 붙음) · 시작(앞에 붙음 · 뒤집기 없음) · 폭 이어받기 · HUD · 끊은 드래그 다음 획이 같은 지형 · Esc 는 더한 점만
//   ⓔ 긋는 중 우클릭 팬 · 스페이스 팬 · 휠 줌이 draft 를 안 건드린다 · 가장자리 자동 팬(초당 화면 폭 ½)
//   ⓕ 점 고치기 — 끌기 · 선분 위 삽입(폭 보간) · Del 점 삭제 · 점 폭 슬라이더 · 전부 undo
//   ⓖ 잇기 — 끝점을 끝점에 끌어 놓으면 하나(점 = 합 − 1 · 넓은 폭으로 맞춤 · 긴 쪽 이름) · 삼거리 · 고리는 안 잇는다 · undo
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const LAB = path.join(ROOT, 'lab');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra != null ? `  ${extra}` : '')); };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// ★[PM 10-03] 내장 작업을 정본(server/hanbando-terrain.json · zone-config 다리)에서 다시 뽑았다(`EW_ZONE=hanbando EW_OUT=… node scripts/export-editor-work.js` → lab/map-editor-baked.json)
//   — 종전 판(2026-07-31 · f2863/m3353/92a6c76911)은 T550 닛폰 정본 · T580 다리 · 자잘 광맥 전부가 빠진 옛 판이었다(재민 10-03 "최종본이 완전 옛날 거").
//   수(스탬프 · 피처 수 · 다리 값 수)는 baked json 에서 읽는다 · export sha256 은 이 판으로 다시 박는다(에디터 코드가 export 를 바꾸지 않았나를 지키는 자).
const _BK = JSON.parse(fs.readFileSync(path.join(ROOT, 'lab', 'map-editor-baked.json'), 'utf8'));
const PIN = { stamp: _BK.work.stamp, nf: _BK.work.features.length, nm: _BK.work.mf.length, br: (_BK.bridges.hanbando || []).length,
  single: 'ecb42d59a79cb4ce4fdb7aac6c61a05e0fb3782ee54d1c5f1a592741a0b8921f',
  // ★[T591 10-03] 전체 월드 export 는 존 사각(WZONES)으로 피처를 나눈다 — 닛폰 7000 · 베링 +1000 · 바다 존 넷이 바뀌어 값이 바뀐다(단일 판 무변 · 코드 무변).
  multi: '78abd472bc934eb00172b9a7f1d788ced32c25c604e89b2f1a921815cd08b390' };

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || require('playwright').chromium.executablePath() });
  const tmp = fs.mkdtempSync('/tmp/t553-');
  const inline = path.join(tmp, 'map-editor.html');
  execFileSync(process.execPath, [path.join(__dirname, 'build-map-editor.js'), inline], { stdio: 'ignore' });
  // 레포 판을 fetch 로 여는 작은 서버(lab/ 만)
  const srv = http.createServer((q, r) => { const f = path.join(LAB, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(LAB) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); fs.createReadStream(f).pipe(r); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const PORT = srv.address().port;

  async function open(url) {
    const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    pg._errs = []; pg.on('pageerror', (e) => pg._errs.push(e.message));
    pg.on('dialog', (d) => d.dismiss());
    await pg.goto(url);
    await pg.waitForFunction(() => typeof S !== 'undefined' && S.booted === true, null, { timeout: 30000 });
    return pg;
  }
  const exportText = async (pg) => { await pg.click('#exportBtn'); const t = await pg.$eval('#exportTa', (x) => x.value); await pg.click('#closeModal'); return t; };
  const st = (pg) => pg.evaluate(() => ({ nf: feats().length, draft: S.draft ? JSON.stringify(S.draft.path) : null, cont: S.cont ? S.cont.end : null, hud: document.getElementById('hud').textContent,
    ox: S.view.ox, oy: S.view.oy, scale: S.view.scale }));
  const scr = (pg, x, y) => pg.evaluate(([x, y]) => { const r = cv.getBoundingClientRect(); return { x: r.left + w2sx(x), y: r.top + w2sy(y) }; }, [x, y]);
  const clickW = async (pg, x, y) => { const p = await scr(pg, x, y); await pg.mouse.click(p.x, p.y); };
  const key = (pg, k) => pg.keyboard.press(k);
  // 빈 판(단일 · 한반도) + 보기 고정: 1px = 20 월드 px · 원점 (100,100)
  const blank = (pg) => pg.evaluate(() => { S.multi = false; S.features = []; S.mf = []; S.sel = null; S.selPt = null; S.draft = null; S.cont = null; resetHist(); S.view.scale = 0.03; S.view.ox = 100; S.view.oy = 100; setTool('river'); refresh(); });

  console.log('\n[ⓐ 여는 길 셋]');
  const pInline = await open('file://' + inline);
  let r = await pInline.evaluate(() => ({ src: S.bakedSrc, stamp: S.stamp, nf: S.features.length, nm: S.mf.length }));
  ok(r.src === 'inline' && r.stamp === PIN.stamp && r.nf === PIN.nf && r.nm === PIN.nm, '맥 사본(박은 한 파일 · file://) — 내장 작업으로 뜬다', JSON.stringify(r));
  const pFetch = await open(`http://127.0.0.1:${PORT}/map-editor.html`);
  r = await pFetch.evaluate(() => ({ src: S.bakedSrc, stamp: S.stamp, nf: S.features.length, br: (BR_BAKED.hanbando || []).length }));
  ok(r.src === 'fetch' && r.stamp === PIN.stamp && r.nf === PIN.nf && r.br === PIN.br, `레포 판 + map-editor-baked.json fetch — 같은 작업 · 다리 ${PIN.br}값`, JSON.stringify(r));
  const pBare = await open('file://' + path.join(LAB, 'map-editor.html'));
  r = await pBare.evaluate(() => ({ src: S.bakedSrc, nf: S.features.length }));
  ok(r.src === 'none' && pBare._errs.length === 0, '레포 판 file://(fetch 막힘) — 내장 없이 오류 0 으로 뜬다(작업 불러오기로 연다)', JSON.stringify(r) + ' 오류 ' + pBare._errs.length);
  await pBare.close();

  console.log('\n[ⓑ export 바이트 = 종전(손 안 댄 작업)]');
  let pin = PIN;
  if (process.env.MAP_EDITOR_OLD) {   // 옛 파일을 직접 열어 그 자리에서 뽑는다
    const po = await browser.newPage({ viewport: { width: 1400, height: 900 } }); await po.goto('file://' + path.resolve(process.env.MAP_EDITOR_OLD)); await po.waitForTimeout(1500);
    const s1 = sha(await exportText(po)); await po.check('#multiToggle'); const s2 = sha(await exportText(po)); await po.close();
    pin = { ...PIN, single: s1, multi: s2 }; console.log('  (옛 파일에서 직접 뽑음: ' + process.env.MAP_EDITOR_OLD + ')');
  }
  for (const [nm, pg] of [['맥 사본', pInline], ['레포 판+fetch', pFetch]]) {
    const a = sha(await exportText(pg)); await pg.check('#multiToggle'); const b = sha(await exportText(pg)); await pg.uncheck('#multiToggle');
    ok(a === pin.single, `${nm} — 단일(한반도) export sha256 = 종전`, a.slice(0, 16));
    ok(b === pin.multi, `${nm} — 전체 월드 export sha256 = 종전`, b.slice(0, 16));
  }

  console.log('\n[ⓒ 옛 작업 파일(world v10 = 내장 작업) 불러오기]');
  {
    const B = JSON.parse(fs.readFileSync(path.join(LAB, 'map-editor-baked.json'), 'utf8'));
    const wf = path.join(tmp, 'world v10.json'); fs.writeFileSync(wf, JSON.stringify(B.work));
    await pFetch.evaluate(() => { S.features = []; S.mf = []; refresh(); });
    await pFetch.setInputFiles('#workFile', wf); await pFetch.waitForFunction(() => S.features.length > 0);
    r = await pFetch.evaluate(() => ({ nf: S.features.length, nm: S.mf.length, stamp: S.stamp }));
    const a = sha(await exportText(pFetch));
    ok(r.nf === PIN.nf && r.nm === PIN.nm && r.stamp === PIN.stamp, '작업 파일 입력으로 불러옴 — 강·산맥·마을 수 그대로', JSON.stringify(r));
    ok(a === pin.single, '불러온 작업의 export = 종전', a.slice(0, 16));
  }
  await pInline.close(); await pFetch.close();

  // ── 편집 동작은 레포 판(http)에서 ─────────────────────────────────────
  const pg = await open(`http://127.0.0.1:${PORT}/map-editor.html`);
  await blank(pg);

  console.log('\n[ⓓ 이어 긋기]');
  await pg.evaluate(() => { S.width = 300; document.getElementById('widthIn').value = 300; });
  await clickW(pg, 2000, 2000); await clickW(pg, 6000, 2000); await clickW(pg, 10000, 2000); await key(pg, 'Enter');
  r = await pg.evaluate(() => ({ nf: S.features.length, n: S.features[0].path.length, name: S.features[0].name }));
  ok(r.nf === 1 && r.n === 3, '새 강 셋 점 → Enter = 지형 하나', JSON.stringify(r));
  await pg.evaluate(() => { S.features[0].path[2].w = 520; });
  await clickW(pg, 10000, 2000);     // 끝점
  r = await st(pg);
  ok(r.cont === 'end' && r.hud.includes('이어 긋는 중(끝)'), '끝점 클릭 = 그 강을 이어 긋는다(HUD)', r.hud.split('|').pop().trim());
  ok(await pg.evaluate(() => S.width === 520 && +document.getElementById('widthIn').value === 520), '폭 = 그 끝점 폭(520)을 이어받아 슬라이더에 반영');
  await clickW(pg, 14000, 2500); await clickW(pg, 18000, 3000); await key(pg, 'Enter');
  r = await pg.evaluate(() => ({ nf: S.features.length, p: S.features[0].path.map((q) => [q.x, q.y, q.w]) }));
  ok(r.nf === 1 && r.p.length === 5 && r.p[3][0] === 14000 && r.p[4][0] === 18000 && r.p[4][2] === 520, '끝 → 뒤에 붙음 · 지형 수 그대로(새 feature 0)', JSON.stringify(r.p.slice(2)));
  await clickW(pg, 2000, 2000);      // 시작점
  r = await st(pg);
  ok(r.cont === 'start' && r.hud.includes('이어 긋는 중(시작)'), '시작점 클릭 = 앞에 이어 긋는다(HUD)');
  await clickW(pg, 0, 1500); await clickW(pg, -2000, 1000); await key(pg, 'Enter');
  r = await pg.evaluate(() => S.features[0].path.map((q) => [q.x, q.y]));
  ok(r.length === 7 && r[0][0] === -2000 && r[1][0] === 0 && r[2][0] === 2000 && r[6][0] === 18000, '시작 → 앞에(unshift · 뒤집기 없음 · 원래 순서 그대로)', JSON.stringify(r.slice(0, 3)));
  // Esc 는 더한 점만 — 원래 점은 안 건드린다
  await clickW(pg, 18000, 3000); await clickW(pg, 20000, 3000); await key(pg, 'Escape');
  r = await pg.evaluate(() => ({ n: S.features[0].path.length, cont: !!S.cont }));
  ok(r.n === 7 && r.cont, 'Esc = 마지막(더한) 점만 취소 · 이어 긋기는 유지', JSON.stringify(r));
  await key(pg, 'Escape');
  r = await pg.evaluate(() => ({ n: S.features[0].path.length, cont: !!S.cont, draft: !!S.draft }));
  ok(r.n === 7 && !r.cont && !r.draft, '더한 점이 없을 때 Esc = 이어 긋기만 닫는다(원래 점 7 그대로)', JSON.stringify(r));
  // 끊은 드래그 → 다음 드래그가 같은 강(재민이 겪은 그 경우)
  await blank(pg);
  { const a = await scr(pg, 2000, 6000), b = await scr(pg, 12000, 6000), c = await scr(pg, 22000, 7000);
    await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 12 }); await pg.mouse.up();
    const n1 = await pg.evaluate(() => ({ nf: S.features.length, n: S.features[0] && S.features[0].path.length }));
    await pg.mouse.move(b.x, b.y); await pg.mouse.down(); await pg.mouse.move(c.x, c.y, { steps: 12 }); await pg.mouse.up();
    const n2 = await pg.evaluate(() => ({ nf: S.features.length, n: S.features[0].path.length, last: S.features[0].path[S.features[0].path.length - 1] }));
    ok(n1.nf === 1 && n2.nf === 1 && n2.n > n1.n && Math.abs(n2.last.x - 22000) < 600, '드래그를 떼었다가 끝점에서 다시 끌면 **같은 강**이 길어진다(새 feature 0)', `${JSON.stringify(n1)} → ${n2.n}점`);
    const u = await pg.evaluate(() => { doUndo(); return S.features[0].path.length; });
    ok(u === n1.n, '실행취소 한 번 = 이어 그은 획만 되돌림', `${u}점`); }

  console.log('\n[ⓔ 긋는 중 팬·줌은 draft 를 안 건드린다 · 가장자리 자동 팬]');
  await blank(pg);
  await clickW(pg, 3000, 3000); await clickW(pg, 8000, 4000);
  let before = await st(pg);
  { const m = await scr(pg, 12000, 12000);
    await pg.mouse.move(m.x, m.y); await pg.mouse.down({ button: 'right' }); await pg.mouse.move(m.x + 120, m.y + 60, { steps: 5 }); await pg.mouse.up({ button: 'right' });
    let a = await st(pg); ok(a.draft === before.draft && a.ox !== before.ox, '우클릭 팬 — 화면만 움직이고 draft 그대로', `ox ${Math.round(before.ox)}→${Math.round(a.ox)}`);
    await pg.mouse.wheel(0, -240); await pg.waitForTimeout(50);
    a = await st(pg); ok(a.draft === before.draft && a.scale !== before.scale, '휠 줌 — draft 그대로', `scale ${before.scale.toFixed(4)}→${a.scale.toFixed(4)}`);
    await pg.keyboard.down('Space'); await pg.mouse.move(m.x, m.y); await pg.mouse.down(); await pg.mouse.move(m.x - 80, m.y - 40, { steps: 5 }); await pg.mouse.up(); await pg.keyboard.up('Space');
    const b = await st(pg); ok(b.draft === before.draft && b.ox !== a.ox && b.draft != null, '스페이스+드래그 팬 — draft 그대로(점 0 추가)', `점 ${JSON.parse(b.draft).length}`); }
  { const box = await pg.evaluate(() => { const r = cv.getBoundingClientRect(); return { l: r.left, t: r.top, w: cv.width, h: cv.height }; });
    const o0 = await st(pg);
    await pg.mouse.move(box.l + box.w - 8, box.t + box.h / 2, { steps: 3 });
    await pg.waitForTimeout(600);
    const o1 = await st(pg);
    const moved = o0.ox - o1.ox, expect = box.w * 0.5 * 0.6;
    ok(moved > expect * 0.5 && moved < expect * 1.6 && o1.draft === o0.draft, '긋는 중 오른쪽 가장자리 24px 안 = 화면이 왼쪽으로 흐른다(초당 폭 ½) · draft 그대로', `0.6초 ${Math.round(moved)}px (기대 ~${Math.round(expect)})`);
    await pg.mouse.move(box.l + box.w / 2, box.t + box.h / 2, { steps: 3 }); await pg.waitForTimeout(150);
    const o2 = await st(pg); await pg.waitForTimeout(300); const o3 = await st(pg);
    ok(o3.ox === o2.ox, '가장자리를 벗어나면 멈춘다');
    await key(pg, 'Escape'); await key(pg, 'Escape');
    const nd = await pg.evaluate(() => S.draft); ok(nd === null, 'Esc 두 번 = 점 둘 취소 → draft 없음(종전 뜻 그대로)');
    // 끌며 긋다 가장자리에 머물면 흐른 만큼 점이 붙는다
    await blank(pg);
    const a = await scr(pg, 3000, 3000);
    await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(box.l + box.w - 6, box.t + box.h / 2, { steps: 20 });
    const k0 = await pg.evaluate(() => S.draft.path.length); await pg.waitForTimeout(500); const k1 = await pg.evaluate(() => S.draft.path.length);
    await pg.mouse.up();
    ok(k1 > k0, '끌며 긋는 중 가장자리 = 흐르면서 점이 계속 붙는다', `${k0}→${k1}점`); }

  console.log('\n[ⓕ 점 고치기(선택 도구)]');
  await blank(pg);
  await pg.evaluate(() => { S.features = [{ id: 901, type: 'river', name: '시험강', flags: {}, path: [{ x: 2000, y: 2000, w: 200 }, { x: 10000, y: 2000, w: 400 }, { x: 18000, y: 2000, w: 600 }] }]; resetHist(); setTool('select'); refresh(); });
  { const a = await scr(pg, 10000, 2000), b = await scr(pg, 10000, 6000);
    await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 6 }); await pg.mouse.up();
    r = await pg.evaluate(() => S.features[0].path[1]); ok(Math.abs(r.y - 6000) < 60, '점 끌기', JSON.stringify(r));
    await pg.evaluate(() => doUndo()); r = await pg.evaluate(() => S.features[0].path[1]); ok(r.y === 2000, '끌기 undo', JSON.stringify(r)); }
  await clickW(pg, 10000, 2000);   // 선택(점 1)
  await clickW(pg, 14000, 2000);   // 선분 위 = 삽입
  r = await pg.evaluate(() => ({ n: S.features[0].path.length, q: S.features[0].path[2], selPt: S.selPt }));
  ok(r.n === 4 && Math.abs(r.q.x - 14000) < 40 && Math.abs(r.q.w - 500) <= 3 && r.selPt === 2, '선분 위 클릭 = 점 삽입(폭은 양옆 보간 400~600 → 500)', JSON.stringify(r));
  await pg.evaluate(() => { const i = document.getElementById('widthIn'); i.value = 900; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
  r = await pg.evaluate(() => S.features[0].path.map((q) => q.w)); ok(r[2] === 900 && r[1] === 400 && r[3] === 600, '점 폭 슬라이더 = 그 점만', JSON.stringify(r));
  await key(pg, 'Delete'); r = await pg.evaluate(() => S.features[0].path.length); ok(r === 3, 'Del = 잡은 점 삭제(지형은 남는다)', `${r}점`);
  await pg.keyboard.press('Control+z'); r = await pg.evaluate(() => S.features[0].path.map((q) => q.w)); ok(r.length === 4 && r[2] === 900, '삭제 undo', JSON.stringify(r));
  await pg.keyboard.press('Control+z'); r = await pg.evaluate(() => S.features[0].path.map((q) => q.w)); ok(r.length === 4 && r[2] === 500, '폭 undo', JSON.stringify(r));
  await pg.keyboard.press('Control+z'); r = await pg.evaluate(() => S.features[0].path.length); ok(r === 3, '삽입 undo', `${r}점`);

  console.log('\n[ⓖ 잇기(끝점을 끝점 위로 끌어 놓기)]');
  await blank(pg);
  await pg.evaluate(() => { S.features = [
    { id: 911, type: 'river', name: '윗강', flags: {}, path: [{ x: 2000, y: 2000, w: 150 }, { x: 6000, y: 3000, w: 200 }, { x: 9000, y: 4000, w: 260 }] },
    { id: 912, type: 'river', name: '아랫강', flags: {}, path: [{ x: 9600, y: 4300, w: 480 }, { x: 14000, y: 6000, w: 520 }, { x: 19000, y: 8000, w: 560 }, { x: 24000, y: 9000, w: 600 }] }];
    resetHist(); setTool('select'); refresh(); });
  { const a = await scr(pg, 9000, 4000), b = await scr(pg, 9600, 4300);
    await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 6 });
    const hot = await pg.evaluate(() => !!(S.hover && S.hover.f.name === '아랫강' && S.hover.end === 'start'));
    await pg.mouse.up();
    r = await pg.evaluate(() => ({ nf: S.features.length, name: S.features[0].name, p: S.features[0].path.map((q) => [q.x, q.y, q.w]) }));
    ok(hot, '끌어가는 동안 받는 끝점이 굵어진다(잇기 후보)');
    ok(r.nf === 1 && r.p.length === 6 && r.name === '아랫강', '잇기 — 지형 하나 · 점 3+4−1 = 6 · 이름 = 긴 쪽', JSON.stringify({ nf: r.nf, n: r.p.length, name: r.name }));
    ok(r.p[2][2] === 520 && r.p[3][2] === 520 && r.p[1][2] > 400 && r.p[2][0] === 9600 && r.p[2][1] === 4300, '이음매 폭 = 넓은 쪽(520)으로 맞추고 앞뒤 6점에 걸쳐 되돌림(merge-split-rivers 규칙) · 끝점은 받는 쪽 자리로', JSON.stringify(r.p.slice(0, 4)));
    await pg.keyboard.press('Control+z'); r = await pg.evaluate(() => S.features.map((f) => f.name + ':' + f.path.length).join(','));
    ok(r === '윗강:3,아랫강:4', '잇기 undo = 둘로(끈 점도 제자리)', r); }
  // 삼거리 — 받는 끝점에 셋째 강 끝점도 붙어 있으면 안 잇는다
  await pg.evaluate(() => { S.features.push({ id: 913, type: 'river', name: '곁강', flags: {}, path: [{ x: 9650, y: 4250, w: 200 }, { x: 12000, y: 1000, w: 180 }] }); resetHist(); refresh(); });
  { const a = await scr(pg, 9000, 4000), b = await scr(pg, 9600, 4300);
    await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 6 }); await pg.mouse.up();
    r = await pg.evaluate(() => S.features.length); ok(r === 3, '삼거리(합류) — 안 잇는다', `${r}개`); }
  // 고리 — 반대쪽 끝끼리도 60셀 안이면 안 잇는다
  await pg.evaluate(() => { S.features = [
    { id: 921, type: 'river', name: '갈래1', flags: {}, path: [{ x: 2000, y: 2000, w: 200 }, { x: 4000, y: 5000, w: 200 }, { x: 6000, y: 2000, w: 200 }] },
    { id: 922, type: 'river', name: '갈래2', flags: {}, path: [{ x: 6300, y: 2100, w: 200 }, { x: 4000, y: 300, w: 200 }, { x: 2400, y: 2200, w: 200 }] }]; resetHist(); refresh(); });
  { const a = await scr(pg, 6000, 2000), b = await scr(pg, 6300, 2100);
    await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 6 }); await pg.mouse.up();
    r = await pg.evaluate(() => S.features.length); ok(r === 2, '고리(반대쪽 끝도 가깝다) — 안 잇는다', `${r}개`); }
  ok(pg._errs.length === 0, '페이지 오류 0', pg._errs.join(' | '));
  await pg.close(); await browser.close(); srv.close();
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
