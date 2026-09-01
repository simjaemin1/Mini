// @@split:60-t-market — T 거래 — 마을 장터

  // === Phase 4d-1: 마을 거래소 modal (canadia zone 거래소 chest 클릭 시) ===
  let _vmpVillage = null;
  let _vmpInterval = null;
  function openVillageMarket(villageName) {
    const panel = document.getElementById('villageMarketPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    const title = document.getElementById('vmpTitle');
    if (title) title.textContent = `🏪 ${villageName} 거래소`;
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
      sumEl.innerHTML = '<div style="color:#888">시뮬 데이터 로드 중…</div>';
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
      if (!me || !myEntry) { sumEl.innerHTML = `<div style="color:#f88">${villageName} 마을을 찾을 수 없습니다.</div>`; return; }
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
    }).catch(e => { sumEl.innerHTML = `<div style="color:#f88">로드 실패: ${e.message}</div>`; });
    // 거래 로그 — 다른 마을 변경 시만 통째, 그 외엔 textContent만 update
    const logEl = document.getElementById('vmpTradeLog');
    if (logEl) {
      fetch('/economy/canadia/tradelog').then(r => r.json()).then(d => {
        const trades = (d.trades || []).filter(t => t.a === villageName || t.b === villageName).slice(0, 12);
        renderVmpTradeLog(logEl, villageName, trades, needRebuild);
      }).catch(e => { logEl.innerHTML = `<div style="color:#f88">로그 로드 실패: ${e.message}</div>`; });
    }
  }
  // 첫 호출 시 표 구조 build (data attribute로 cell 매핑)
  function buildVmpStructure(sumEl, priceEl, villageName, world, pd, items) {
    sumEl.innerHTML = `
      <div data-vmp="header"><b data-vmp-name></b> · Day <span data-vmp-day></span></div>
      <div>👥 인구 <b data-vmp-pop></b> · 💰 거래소세 <b data-vmp-tax></b></div>
      <div>💼 직업: <span data-vmp-jobs></span></div>
      <div data-vmp-storage style="margin-top:10px;padding:10px;background:#1a2a3a;border-radius:4px"></div>
    `;
    // 가격표 구조
    let html = '<table style="width:100%;border-collapse:collapse">';
    html += '<tr style="background:#222"><th style="text-align:left;padding:6px">자원</th>';
    html += `<th style="padding:6px;background:#2a3a4a">${villageName} (여기)</th>`;
    for (const v of pd.villages) {
      if (v.name === villageName) continue;
      html += `<th style="padding:6px;font-size:11px">${v.name}</th>`;
    }
    html += '</tr>';
    for (const item of items) {
      html += `<tr style="border-top:1px solid #333" data-vmp-row="${item}"><td style="padding:6px"><b>${ITEM_KR(item)}</b></td>`;
      html += `<td style="padding:6px;background:#2a3a4a;text-align:center"><b data-vmp-cell="my:${item}">-</b></td>`;
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
    let stoHtml = '<div style="color:#fc8;font-weight:bold;margin-bottom:6px">📦 거래소 보유 자원</div>';
    if (!stoEntries.length) stoHtml += '<div style="color:#888">(비어있음)</div>';
    else {
      stoHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:4px">';
      for (const [k, v] of stoEntries) stoHtml += `<div style="padding:4px 6px;background:#0e1822;border-radius:3px">${ITEM_KR(k)} <b>${Math.floor(v)}</b></div>`;
      stoHtml += '</div>';
    }
    stoHtml += `<div style="margin-top:6px;color:#aaa;font-size:11px">💰 길드 금고 자원: ${treasuryRes || '(비어있음)'}</div>`;
    if (cash > 0) stoHtml += `<div style="color:#aaa;font-size:11px">📒 거래 회계 (cash): <b style="color:#fc8">${Math.floor(cash)}</b></div>`;
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
        if (!p || p <= 0 || !myP) { cell.textContent = '-'; cell.style.color = '#666'; continue; }
        const diff = p - myP, pct = ((diff / myP) * 100).toFixed(0);
        const color = diff > 0 ? '#7c7' : (diff < 0 ? '#f77' : '#aaa');
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
      logEl.innerHTML = '<div style="color:#888;padding:6px">📜 아직 이 마을 관련 거래 없음</div>';
      return;
    }
    let html = '<div style="color:#fc8;font-weight:bold;margin-bottom:6px">📜 최근 거래</div>';
    html += '<div style="max-height:160px;overflow-y:auto">';
    for (const t of trades) {
      const dir = t.a === villageName ? '→' : '←';
      const other = t.a === villageName ? t.b : t.a;
      const gave = t.a === villageName ? t.aGave : t.bGave;
      const got = t.a === villageName ? t.bGave : t.aGave;
      const raid = t.raided ? ' <span style="color:#f66">⚠️약탈</span>' : '';
      html += `<div style="padding:3px 4px;border-bottom:1px solid #222">Day ${t.day} · ${dir} <b>${other}</b>: 보냄 ${ITEM_KR(gave.res)} ${gave.amt}, 받음 ${ITEM_KR(got.res)} ${got.amt} <span style="color:#888">(거리 ${t.distance}, 호위 ${t.escort})</span>${raid}</div>`;
    }
    html += '</div>';
    logEl.innerHTML = html;
  }
  function JOB_KR(j) {
    const M = { farmer:'농부', fisher:'어부', hunter:'사냥꾼', lumberjack:'벌목꾼', miner:'광부', prospector:'탐사꾼', smith:'대장장이', forager:'채집꾼', cook:'요리사', warrior:'전사', merchant:'상인' };
    return M[j] || j;
  }
  function ITEM_KR(i) {
    const M = { food:'🍞 식량', wood:'🪵 나무', stone:'🪨 돌', ore:'⛏️ 광석', metal:'⚙️ 금속', forage:'🌿 채집물', cooked:'🍲 요리', fish:'🐟 생선', meat:'🥩 고기' };
    return M[i] || i;
  }
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
      if (e.key === 'Escape' && !document.getElementById('villageMarketPanel')?.classList.contains('hidden')) closeVillageMarket();
    });
  });
