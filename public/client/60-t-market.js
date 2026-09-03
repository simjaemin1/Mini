// @@split:60-t-market — T 거래 — 마을 장터

  // === Phase 4d-1: 마을 거래소 modal (canadia zone 거래소 chest 클릭 시) ===
  let _vmpVillage = null;
  let _vmpInterval = null;
  function openVillageMarket(villageName) {
    const panel = document.getElementById('villageMarketPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    const title = document.getElementById('vmpTitle');
    if (title) title.textContent = `${villageName} 거래소`;
    _vmpVillage = villageName;
    renderVillageMarket(villageName);
    // Phase 4d-3: 자동 갱신 1초 (시뮬 1초/day와 동기화)
    if (_vmpInterval) clearInterval(_vmpInterval);
    _vmpInterval = setInterval(() => {
      if (_vmpVillage && !document.getElementById('villageMarketPanel')?.classList.contains('hidden')) {
        renderVillageMarket(_vmpVillage);
      }
    }, 1000);
  }
  function closeVillageMarket() {
    document.getElementById('villageMarketPanel')?.classList.add('hidden');
    _vmpVillage = null;
    if (_vmpInterval) { clearInterval(_vmpInterval); _vmpInterval = null; }
  }
  // Phase 4d-14f: 깜빡임 없는 부분 갱신. 첫 호출 시 구조 build, 그 후 cell.textContent만 update.
  let _vmpStructFor = null;        // 마지막 build된 villageName (다르면 rebuild)
  let _vmpAllResources = null;     // 첫 호출 시 결정된 자원 목록 (이후 stable)
  function renderVillageMarket(villageName) {
    const sumEl = document.getElementById('vmpSummary');
    const priceEl = document.getElementById('vmpPrices');
    if (!sumEl || !priceEl) return;
    const needRebuild = _vmpStructFor !== villageName;
    if (needRebuild) {
      sumEl.innerHTML = '<div style="color:var(--dim-2)">시뮬 데이터 로드 중…</div>';
      priceEl.innerHTML = '';
      _vmpAllResources = null;
    }
    // 두 fetch 병렬 → 모두 끝나면 한 번에 update (깜빡임 최소화)
    Promise.all([
      fetch('/economy/canadia/villages').then(r => r.json()),
      fetch('/economy/canadia/prices').then(r => r.json()),
    ]).then(([world, pd]) => {
      const me = world.villages.find(v => v.name === villageName);
      const myEntry = pd.villages.find(v => v.name === villageName);
      if (!me || !myEntry) { sumEl.innerHTML = `<div style="color:var(--hp)">${villageName} 마을을 찾을 수 없습니다.</div>`; return; }
      const myPrices = myEntry.prices || {};
      const storage = myEntry.storage || {};
      const treasury = myEntry.treasury || {};

      // 자원 목록은 첫 build 시 결정 (16종 다 포함, 추후 stable)
      if (!_vmpAllResources) {
        const allRes = new Set();
        for (const v of pd.villages) for (const r of Object.keys(v.prices || {})) allRes.add(r);
        _vmpAllResources = [...allRes].sort();
      }

      if (needRebuild) {
        buildVmpStructure(sumEl, priceEl, villageName, world, pd, _vmpAllResources);
        _vmpStructFor = villageName;
      }
      updateVmpData(sumEl, priceEl, villageName, world, me, myPrices, storage, treasury, pd, _vmpAllResources);
    }).catch(e => { sumEl.innerHTML = `<div style="color:var(--hp)">로드 실패: ${e.message}</div>`; });
    // 거래 로그 — 다른 마을 변경 시만 통째, 그 외엔 textContent만 update
    const logEl = document.getElementById('vmpTradeLog');
    if (logEl) {
      fetch('/economy/canadia/tradelog').then(r => r.json()).then(d => {
        const trades = (d.trades || []).filter(t => t.a === villageName || t.b === villageName).slice(0, 12);
        renderVmpTradeLog(logEl, villageName, trades, needRebuild);
      }).catch(e => { logEl.innerHTML = `<div style="color:var(--hp)">로그 로드 실패: ${e.message}</div>`; });
    }
  }
  // 첫 호출 시 표 구조 build (data attribute로 cell 매핑)
  function buildVmpStructure(sumEl, priceEl, villageName, world, pd, items) {
    sumEl.innerHTML = `
      <div data-vmp="header"><b data-vmp-name></b> · Day <span data-vmp-day></span></div>
      <div>인구 <b data-vmp-pop></b> · 거래소세 <b data-vmp-tax></b></div>
      <div>직업 <span data-vmp-jobs></span></div>
      <div data-vmp-storage style="margin-top:10px;padding:10px;background:var(--inset);border-radius: 0"></div>
    `;
    // 가격표 구조
    let html = '<table style="width:100%;border-collapse:collapse">';
    html += '<tr style="background:var(--head)"><th style="text-align:left;padding:6px">자원</th>';
    html += `<th style="padding:6px;background:var(--line)">${villageName} (여기)</th>`;
    for (const v of pd.villages) {
      if (v.name === villageName) continue;
      html += `<th style="padding:6px;font-size:11px">${v.name}</th>`;
    }
    html += '</tr>';
    for (const item of items) {
      html += `<tr style="border-top:1px solid var(--inset)" data-vmp-row="${item}"><td style="padding:6px"><b>${ITEM_KR(item)}</b></td>`;
      html += `<td style="padding:6px;background:var(--line);text-align:center"><b data-vmp-cell="my:${item}">-</b></td>`;
      for (const v of pd.villages) {
        if (v.name === villageName) continue;
        html += `<td style="padding:6px;text-align:center" data-vmp-cell="p:${v.name}:${item}">-</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    priceEl.innerHTML = html;
  }
  // 매 갱신마다 cell.textContent만 update (깜빡임 X)
  function updateVmpData(sumEl, priceEl, villageName, world, me, myPrices, storage, treasury, pd, items) {
    const setText = (sel, val) => { const el = sumEl.querySelector(sel); if (el) el.textContent = val; };
    setText('[data-vmp-name]', me.name);
    setText('[data-vmp-day]', world.day);
    setText('[data-vmp-pop]', me.pop || 0);
    setText('[data-vmp-tax]', `${((me.taxRate || 0.03) * 100).toFixed(1)}%`);
    const jobs = Object.entries(me.jobs || {}).filter(([,n]) => n > 0).map(([j,n]) => `${JOB_KR(j)} ${n}`).join(' · ');
    setText('[data-vmp-jobs]', jobs || '(없음)');
    // storage·treasury 영역 — innerHTML로 갱신 (작아서 깜빡임 미미). 다만 자주 변동.
    const stoEntries = Object.entries(storage).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const treasuryRes = Object.entries(treasury).filter(([k, v]) => k !== '_cash' && v > 0.1)
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ITEM_KR(k)} ${Math.floor(v)}`).join(' · ');
    const cash = treasury._cash || 0;
    let stoHtml = '<div class="tr-head">거래소 보유 자원</div>';
    if (!stoEntries.length) stoHtml += '<div style="color:var(--dim-2)">(비어있음)</div>';
    else {
      stoHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:4px">';
      for (const [k, v] of stoEntries) stoHtml += `<div style="padding:4px 6px;background:var(--pane-solid);border-radius: 0">${ITEM_KR(k)} <b>${Math.floor(v)}</b></div>`;
      stoHtml += '</div>';
    }
    stoHtml += `<div class="dim" style="margin-top:6px;font-size:11px">길드 금고 자원: ${treasuryRes || '(비어있음)'}</div>`;
    if (cash > 0) stoHtml += `<div class="dim" style="font-size:11px">거래 회계 (cash): <b style="color:var(--accent-hi)">${Math.floor(cash)}</b></div>`;
    const sto = sumEl.querySelector('[data-vmp-storage]');
    if (sto && sto.innerHTML !== stoHtml) sto.innerHTML = stoHtml;
    // 가격표 — 각 cell textContent만 update (깜빡 X)
    for (const item of items) {
      const myP = myPrices[item];
      const myCell = priceEl.querySelector(`[data-vmp-cell="my:${item}"]`);
      if (myCell) myCell.textContent = (myP && myP > 0) ? fmtPrice(myP) : '-';
      for (const v of pd.villages) {
        if (v.name === villageName) continue;
        const cell = priceEl.querySelector(`[data-vmp-cell="p:${v.name}:${item}"]`);
        if (!cell) continue;
        const p = (v.prices || {})[item];
        if (!p || p <= 0 || !myP) { cell.textContent = '-'; cell.style.color = 'var(--line-2)'; continue; }
        const diff = p - myP, pct = ((diff / myP) * 100).toFixed(0);
        const color = diff > 0 ? 'var(--stam)' : (diff < 0 ? 'var(--hp)' : 'var(--dim)');
        const sign = diff > 0 ? '+' : '';
        cell.textContent = `${fmtPrice(p)} (${sign}${pct}%)`;
        cell.style.color = color;
      }
    }
  }
  let _vmpTradeLastKey = null;
  function renderVmpTradeLog(logEl, villageName, trades, force) {
    // 거래 로그 — trades 첫 항목 키로 변경 감지. 없으면 update X
    const key = villageName + ':' + (trades[0]?.day || '') + ':' + trades.length;
    if (!force && key === _vmpTradeLastKey) return;
    _vmpTradeLastKey = key;
    if (!trades.length) {
      logEl.innerHTML = '<div class="dim" style="padding:6px">아직 이 마을 관련 거래 없음</div>';
      return;
    }
    let html = '<div class="tr-head">최근 거래</div>';
    html += '<div style="max-height:160px;overflow-y:auto">';
    for (const t of trades) {
      const dir = t.a === villageName ? '→' : '←';
      const other = t.a === villageName ? t.b : t.a;
      const gave = t.a === villageName ? t.aGave : t.bGave;
      const got = t.a === villageName ? t.bGave : t.aGave;
      const raid = t.raided ? ' <span class="warn">약탈</span>' : '';
      html += `<div style="padding:3px 4px;border-bottom:1px solid var(--head)">Day ${t.day} · ${dir} <b>${other}</b>: 보냄 ${ITEM_KR(gave.res)} ${gave.amt}, 받음 ${ITEM_KR(got.res)} ${got.amt} <span style="color:var(--dim-2)">(거리 ${t.distance}, 호위 ${t.escort})</span>${raid}</div>`;
    }
    html += '</div>';
    logEl.innerHTML = html;
  }
  // ★★[T66 ⓪] **클라 사본을 지웠다.** 이 표는 `zone.js JOB_KR_NPC` 와 **글자까지 같았다**(T61 실측).
  //   정본이 `welcome.uiLabels.jobs` 로 온다 — `ITEM_KR`·`itemKo` 와 같은 규약이고 폴백은 없다.
  function JOB_KR(j) { return jobKo(j); }
  // ★★[T61 2026-09-03] **클라 사본을 지웠다.** 종전엔 여기 9키 표가 있었다 —
  //   서버가 자원 종류를 늘리면 표에 없는 열만 영문으로 남는, T55 가 품목에서 닫은 그 결함이다.
  //   정본은 `server/itemlabel.js CATEGORY_KO` 고 `welcome.categoryLabels` 로 온다. 폴백은 없다.
  function ITEM_KR(i) { return (CATEGORY_KO_SRV && CATEGORY_KO_SRV[i]) || i; }
  // Phase 4d-13: v2 가격 폭 (0.01 ~ 1000)에 적응형 포맷
  function fmtPrice(p) {
    if (p == null) return '-';
    if (p >= 100) return p.toFixed(0);
    if (p >= 10) return p.toFixed(1);
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(3);
  }
  // Phase 4d-3: 캐러밴 polling (1초 = 시뮬 1day와 동기화)
  setInterval(() => {
    if (primaryZoneId !== 'canadia') { _canadiaCaravans = []; return; }
    fetch('/economy/canadia/caravans').then(r => r.json()).then(d => {
      _canadiaCaravans = d.caravans || [];
    }).catch(() => {});
  }, 1000);
  // Phase 4d-4: 마을 데이터 polling (작업장 시각화용, 5초마다)
  setInterval(() => {
    if (primaryZoneId !== 'canadia') { _canadiaVillages = []; return; }
    fetch('/economy/canadia/villages').then(r => r.json()).then(d => {
      _canadiaVillages = d.villages || [];
    }).catch(() => {});
  }, 5000);

  // 외부 노출
  window.openVillageMarket = openVillageMarket;
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('vmpCloseBtn')?.addEventListener('click', closeVillageMarket);
    // ESC로 닫기
    document.addEventListener('keydown', e => {
      if (isTypingTarget(e)) return;   // ★[T61 ⓪] 규약 하나 — 수량칸에 숫자를 치는 중이면 안 닫는다
      if (e.key === 'Escape' && !document.getElementById('villageMarketPanel')?.classList.contains('hidden')) closeVillageMarket();
    });
  });
