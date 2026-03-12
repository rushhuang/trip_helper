import {
  listTrips, getTrip, getActiveTripId, setActiveTrip,
  importTrip, deleteTrip, exportTripJSON, loadActiveTrip, hasTrips,
} from './trips.js';

// ── Type → Icon mapping ──────────────────────────────────────────
const TYPE_ICON = {
  food:      '\u{1F35C}',
  sight:     '\u{1F3EF}',
  stay:      '\u{1F6CF}',
  transport: '\u{1F697}',
  shop:      '\u{1F6D2}',
};

// ── State ────────────────────────────────────────────────────────
let data = null;       // current trip data
let activeDay = null;  // date string like '3/19'

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  // First run: import bundled itinerary as default trip
  if (!hasTrips()) {
    try {
      const resp = await fetch('data/itinerary.json');
      const bundled = await resp.json();
      const id = importTrip(bundled);
      setActiveTrip(id);
    } catch (e) {
      console.error('Failed to load bundled itinerary:', e);
    }
  }

  loadCurrentTrip();
  setupSearch();
  setupNav();
  setupInstallBanner();
  renderTripManager();
}

/** Load and render the active trip. */
function loadCurrentTrip() {
  data = loadActiveTrip();
  window.__itineraryData = data;

  if (!data) {
    document.getElementById('header').querySelector('h1').textContent = '行程查詢';
    document.getElementById('day-tabs').innerHTML = '';
    document.getElementById('stop-list').innerHTML =
      '<div class="no-results">尚無行程，請至「行程管理」匯入 JSON</div>';
    renderTripSelector();
    return;
  }

  document.getElementById('header').querySelector('h1').textContent =
    data.trip?.title || '行程查詢';
  renderTripSelector();
  renderDayTabs();
  jumpToToday();
  renderStops();

  // Notify map
  window.dispatchEvent(new CustomEvent('itinerary-loaded', { detail: data }));
}

// ── Trip Selector (multi-trip pill bar) ───────────────────────
function renderTripSelector() {
  const container = document.getElementById('trip-selector');
  const trips = listTrips();

  if (trips.length < 2) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = '';
  const activeId = getActiveTripId();

  trips.forEach(meta => {
    const pill = document.createElement('button');
    pill.className = 'trip-pill' + (meta.id === activeId ? ' active' : '');
    pill.textContent = meta.title;
    pill.onclick = () => {
      if (meta.id === activeId) return;
      setActiveTrip(meta.id);
      loadCurrentTrip();
      renderTripManager();
      showToast(`已切換至「${meta.title}」`);
    };
    container.appendChild(pill);
  });

  // Scroll active pill into view
  const activePill = container.querySelector('.trip-pill.active');
  activePill?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ── Day Tabs ─────────────────────────────────────────────────────
function renderDayTabs() {
  const container = document.getElementById('day-tabs');
  container.innerHTML = '';
  if (!data) return;
  data.days.forEach(day => {
    const btn = document.createElement('button');
    btn.className = 'day-tab';
    btn.dataset.date = day.date;
    btn.innerHTML = `<span class="tab-dot" style="background:${day.color}"></span>${day.label}`;
    btn.onclick = () => selectDay(day.date);
    container.appendChild(btn);
  });
}

function selectDay(date) {
  activeDay = date;
  document.querySelectorAll('.day-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.date === date);
  });
  const tab = document.querySelector(`.day-tab[data-date="${date}"]`);
  tab?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  renderStops();
}

function jumpToToday() {
  if (!data || !data.days.length) return;
  const now = new Date();
  const todayStr = `${now.getMonth() + 1}/${now.getDate()}`;
  const match = data.days.find(d => d.date === todayStr);
  activeDay = match ? match.date : data.days[0].date;
  document.querySelectorAll('.day-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.date === activeDay);
  });
  const tab = document.querySelector(`.day-tab[data-date="${activeDay}"]`);
  tab?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ── Render Stops ─────────────────────────────────────────────────
function renderStops() {
  const container = document.getElementById('stop-list');
  if (!data) return;
  const dayData = data.days.find(d => d.date === activeDay);
  if (!dayData) {
    container.innerHTML = '<div class="no-results">找不到行程</div>';
    return;
  }
  container.innerHTML = '';
  dayData.stops.forEach((stop, i) => {
    container.appendChild(createStopCard(stop, i + 1, dayData.color));
  });
}

function createStopCard(stop, num, color) {
  const card = document.createElement('div');
  card.className = 'stop-card';
  card.id = `card-${stop.id}`;

  const icon = TYPE_ICON[stop.type] || '\u{1F4CD}';
  const timeText = stop.time || '';

  const header = document.createElement('div');
  header.className = 'stop-header';
  header.innerHTML = `
    <span class="stop-num" style="background:${color}">${num}</span>
    <span class="stop-icon">${icon}</span>
    <div class="stop-info">
      <div class="stop-name">${esc(stop.name)}</div>
      ${timeText ? `<div class="stop-time">${esc(timeText)}</div>` : ''}
    </div>
    <span class="stop-chevron">&#x276F;</span>
  `;
  header.onclick = () => card.classList.toggle('open');

  const detail = document.createElement('div');
  detail.className = 'stop-detail';

  const fields = [
    ['MapCode', stop.mapcode],
    ['地址', stop.address],
    ['電話', stop.phone],
    ['營業時間', stop.hours],
    ['停車', stop.parking],
  ];

  let detailHTML = '';
  fields.forEach(([label, val]) => {
    if (!val) return;
    detailHTML += `<div class="detail-row">
      <span class="detail-label">${label}</span>
      <span class="detail-value">${esc(val)}</span>
    </div>`;
  });

  if (stop.note) {
    detailHTML += `<div class="stop-note">${esc(stop.note)}</div>`;
  }

  detail.innerHTML = detailHTML;

  // Quick actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'stop-actions';

  const btnCopy = makeActionBtn('\u{1F4CB}', '複製 MapCode', !stop.mapcode);
  btnCopy.onclick = () => copyMapcode(stop.mapcode);
  actionsDiv.appendChild(btnCopy);

  const btnNav = makeActionBtn('\u{1F5FA}', '導航', !stop.address && !stop.lat);
  btnNav.onclick = () => openMaps(stop.address, stop.lat, stop.lng);
  actionsDiv.appendChild(btnNav);

  const hasPhone = stop.phone && !stop.phone.includes('（') && /[\d-]+/.test(stop.phone);
  const btnCall = makeActionBtn('\u{1F4DE}', '撥打電話', !hasPhone);
  if (hasPhone) btnCall.onclick = () => { location.href = `tel:${stop.phone}`; };
  actionsDiv.appendChild(btnCall);

  detail.appendChild(actionsDiv);
  card.appendChild(header);
  card.appendChild(detail);
  return card;
}

function makeActionBtn(icon, label, disabled) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.disabled = !!disabled;
  btn.innerHTML = `<span class="action-icon">${icon}</span><span>${label}</span>`;
  return btn;
}

// ── Quick Actions ────────────────────────────────────────────────
async function copyMapcode(code) {
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast('已複製 MapCode！');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = code;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已複製 MapCode！');
  }
}

function openMaps(address, lat, lng) {
  let query = '';
  if (lat && lng) query = `${lat},${lng}`;
  else if (address) query = address;
  if (!query) return;
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
}

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 300);
  }, 1500);
}
window.showToast = showToast;

// ── Search ───────────────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    clearBtn.hidden = !q;
    if (!q || !data) { renderStops(); return; }

    const container = document.getElementById('stop-list');
    container.innerHTML = '';
    let found = 0;

    data.days.forEach(day => {
      const matches = day.stops.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.note && s.note.toLowerCase().includes(q))
      );
      if (!matches.length) return;

      const divider = document.createElement('div');
      divider.className = 'day-divider';
      divider.textContent = day.label;
      container.appendChild(divider);

      matches.forEach(stop => {
        const idx = day.stops.indexOf(stop) + 1;
        container.appendChild(createStopCard(stop, idx, day.color));
        found++;
      });
    });

    if (!found) {
      container.innerHTML = '<div class="no-results">找不到相符的地點</div>';
    }
  });

  clearBtn.onclick = () => {
    input.value = '';
    clearBtn.hidden = true;
    renderStops();
  };
}

// ── Navigation (bottom nav + desktop nav) ────────────────────────
function switchView(target) {
  document.querySelectorAll('.nav-btn, .desktop-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === target);
  });
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(target).classList.add('active');

  if (target === 'map-view') {
    window.dispatchEvent(new Event('map-activate'));
  }
  if (target === 'manage-view') {
    renderTripManager();
  }
}

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });
  document.querySelectorAll('.desktop-nav-btn').forEach(btn => {
    btn.onclick = () => switchView(btn.dataset.view);
  });
}

// ── Scroll to Card (from map) ────────────────────────────────────
window.scrollToStop = function(stopId, dayDate) {
  switchView('list-view');
  selectDay(dayDate);
  requestAnimationFrame(() => {
    const card = document.getElementById(`card-${stopId}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('open');
      card.dataset.highlight = 'true';
      setTimeout(() => { card.dataset.highlight = ''; }, 2000);
    }
  });
};

// ══════════════════════════════════════════════════════════════════
// ── Trip Manager ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function renderTripManager() {
  const container = document.getElementById('trip-list');
  container.innerHTML = '';

  const trips = listTrips();
  const activeId = getActiveTripId();

  if (trips.length === 0) {
    container.innerHTML = '<div class="no-results">尚無行程，請匯入 JSON 檔案</div>';
    return;
  }

  trips.forEach(meta => {
    const isActive = meta.id === activeId;
    const card = document.createElement('div');
    card.className = 'trip-card' + (isActive ? ' active' : '');

    const stopsCount = (() => {
      const d = getTrip(meta.id);
      return d ? d.days.reduce((sum, day) => sum + day.stops.length, 0) : 0;
    })();
    const daysCount = (() => {
      const d = getTrip(meta.id);
      return d ? d.days.length : 0;
    })();

    card.innerHTML = `
      <div class="trip-card-header">
        <div class="trip-card-info">
          <div class="trip-card-title">${esc(meta.title)}</div>
          <div class="trip-card-meta">${esc(meta.dates)} &middot; ${daysCount} 天 ${stopsCount} 站</div>
        </div>
        ${isActive ? '<span class="trip-active-badge">使用中</span>' : ''}
      </div>
      <div class="trip-card-actions"></div>
    `;

    const actions = card.querySelector('.trip-card-actions');

    if (!isActive) {
      const btnSwitch = document.createElement('button');
      btnSwitch.className = 'trip-action-btn';
      btnSwitch.textContent = '切換';
      btnSwitch.onclick = () => {
        setActiveTrip(meta.id);
        loadCurrentTrip();
        renderTripManager();
        showToast(`已切換至「${meta.title}」`);
      };
      actions.appendChild(btnSwitch);
    }

    const btnExport = document.createElement('button');
    btnExport.className = 'trip-action-btn';
    btnExport.textContent = '匯出';
    btnExport.onclick = () => downloadTrip(meta.id, meta.title);
    actions.appendChild(btnExport);

    const btnDelete = document.createElement('button');
    btnDelete.className = 'trip-action-btn danger';
    btnDelete.textContent = '刪除';
    btnDelete.onclick = () => {
      if (!confirm(`確定刪除「${meta.title}」？此操作無法復原。`)) return;
      deleteTrip(meta.id);
      if (meta.id === activeId) {
        loadCurrentTrip();
      }
      renderTripManager();
      showToast('已刪除');
    };
    actions.appendChild(btnDelete);

    container.appendChild(card);
  });
}

// ── Import ───────────────────────────────────────────────────────
function setupImport() {
  const fileInput = document.getElementById('import-file');
  document.getElementById('btn-import').onclick = () => fileInput.click();

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      // Validate basic structure
      if (!json.trip || !json.days || !Array.isArray(json.days)) {
        showToast('JSON 格式錯誤：需要 trip 和 days 欄位');
        return;
      }

      const id = importTrip(json);
      setActiveTrip(id);
      loadCurrentTrip();
      renderTripManager();
      showToast(`已匯入「${json.trip.title || 'Untitled'}」`);
    } catch (e) {
      showToast('匯入失敗：無效的 JSON 檔案');
      console.error(e);
    }

    fileInput.value = '';
  };
}

// ── Export / Download ────────────────────────────────────────────
function downloadTrip(id, title) {
  const jsonStr = exportTripJSON(id);
  if (!jsonStr) { showToast('匯出失敗'); return; }

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title || 'trip'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('已匯出 JSON');
}

// ── Install Banner ───────────────────────────────────────────────
function setupInstallBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || navigator.standalone === true;

  if (isStandalone) return;

  if (isIOS) {
    const guide = document.getElementById('ios-install-guide');
    const dismissed = localStorage.getItem('ios-install-dismissed');
    if (!dismissed) guide.hidden = false;
    document.getElementById('ios-dismiss').onclick = () => {
      guide.hidden = true;
      localStorage.setItem('ios-install-dismissed', '1');
    };
    return;
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-banner').hidden = false;
  });

  document.getElementById('install-btn').onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('install-banner').hidden = true;
  };

  document.getElementById('install-dismiss').onclick = () => {
    document.getElementById('install-banner').hidden = true;
  };
}

// ── Escape HTML ──────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ── Register Service Worker ──────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Go ───────────────────────────────────────────────────────────
init();
setupImport();
