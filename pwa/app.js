import {
  listTrips, getTrip, getActiveTripId, setActiveTrip,
  importTrip, deleteTrip, exportTripJSON, loadActiveTrip, hasTrips, saveTrip,
} from './trips.js';
import { parseXlsx, exportXlsx } from './xlsx-utils.js';

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
    // Travel time indicator between cards
    if (i > 0 && stop.travelTime) {
      const travel = document.createElement('div');
      travel.className = 'travel-indicator';
      travel.textContent = `\u{1F697} ${stop.travelTime} min`;
      container.appendChild(travel);
    }
    container.appendChild(createStopCard(stop, i + 1, dayData.color, dayData.date, dayData.label));
  });

  // Add stop button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-stop-btn';
  addBtn.textContent = '+ 新增站點';
  addBtn.onclick = () => {
    const newStop = {
      id: generateStopId(),
      time: '', type: 'sight', name: '',
      mapcode: '', address: '', phone: '',
      hours: '', parking: '', note: '',
      lat: null, lng: null,
      duration: null, travelTime: null,
    };
    dayData.stops.push(newStop);
    persistAndSync();
    renderStops();
    openEditModal(newStop, dayData.date);
  };
  container.appendChild(addBtn);
}

function createStopCard(stop, num, color, dayDate, dayLabel) {
  const card = document.createElement('div');
  card.className = 'stop-card';
  card.id = `card-${stop.id}`;

  const icon = TYPE_ICON[stop.type] || '\u{1F4CD}';
  const timeText = stop.time || '';
  const durText = stop.duration ? `${stop.duration >= 60 ? Math.floor(stop.duration / 60) + 'h' : ''}${stop.duration % 60 ? stop.duration % 60 + 'min' : ''}` : '';
  const conflict = checkTimeConflict(stop, dayLabel);
  const warnHTML = conflict ? `<span class="stop-warning">${conflict.icon} ${conflict.msg}</span>` : '';

  const header = document.createElement('div');
  header.className = 'stop-header';
  header.innerHTML = `
    <span class="stop-num" style="background:${color}">${num}</span>
    <span class="stop-icon">${icon}</span>
    <div class="stop-info">
      <div class="stop-name">${esc(stop.name)}</div>
      ${timeText || durText || warnHTML ? `<div class="stop-time">${esc(timeText)}${timeText && durText ? ' · ' : ''}${durText ? '<span class="stop-duration">' + durText + '</span>' : ''}${warnHTML ? ' ' + warnHTML : ''}</div>` : ''}
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

  const btnMap = makeActionBtn('\u{1F4CD}', '地圖', !stop.lat || !stop.lng);
  if (stop.lat && stop.lng) btnMap.onclick = () => showOnMap(stop.id, dayDate);
  actionsDiv.appendChild(btnMap);

  const btnEdit = makeActionBtn('\u{270F}\u{FE0F}', '編輯', false);
  btnEdit.onclick = () => openEditModal(stop, dayDate);
  actionsDiv.appendChild(btnEdit);

  const btnMove = makeActionBtn('\u{27A1}\u{FE0F}', '移至...', false);
  btnMove.onclick = () => openDayPicker(stop, dayDate, 'move');
  actionsDiv.appendChild(btnMove);

  const btnDelete = makeActionBtn('\u{1F5D1}', '刪除', false);
  btnDelete.classList.add('danger');
  btnDelete.onclick = () => {
    if (!confirm(`確定刪除「${stop.name || '未命名'}」？`)) return;
    const day = data.days.find(d => d.date === dayDate);
    if (day) day.stops = day.stops.filter(s => s.id !== stop.id);
    persistAndSync();
    renderStops();
    showToast('已刪除');
  };
  actionsDiv.appendChild(btnDelete);

  detail.appendChild(actionsDiv);

  // Drag handle
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.innerHTML = '&#x2630;';
  header.insertBefore(handle, header.firstChild);

  card.appendChild(header);
  card.appendChild(detail);
  return card;
}

/** Jump from list to map: focus a specific stop */
function showOnMap(stopId, dayDate) {
  switchView('map-view');
  window.dispatchEvent(new CustomEvent('map-focus-stop', {
    detail: { stopId, dayDate },
  }));
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

// ── 13-C: Business Hours Conflict Detection ─────────────────────────

const DOW_MAP = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };

function toMins(h, m) { return h * 60 + m; }

/** Parse time ranges from hours string, e.g. "11:00-14:00, 17:00-21:00" → [[660,840],[1020,1260]] */
function parseTimeRanges(hoursStr) {
  if (!hoursStr) return [];
  // Skip all-day / 24h patterns
  if (/全天|全年|24\s*小時|24\s*h/i.test(hoursStr)) return [];
  const ranges = [];
  const re = /(\d{1,2})[：:](\d{2})\s*[-–~～]\s*(\d{1,2})[：:](\d{2})/g;
  let m;
  while ((m = re.exec(hoursStr))) {
    const start = toMins(parseInt(m[1]), parseInt(m[2]));
    const end = toMins(parseInt(m[3]), parseInt(m[4]));
    if (end > start) ranges.push([start, end]);
  }
  return ranges;
}

/** Extract closed weekdays from hours string, returns Set of DOW numbers (0=日..6=六) */
function parseClosedDays(hoursStr) {
  if (!hoursStr) return new Set();
  const closed = new Set();
  // Match patterns: 週X公休, 週X店休, 週X休, 週X定休
  const re = /週([日一二三四五六])/g;
  // Only match if followed by 公休/店休/休/定休 context
  if (/(公休|店休|定休|休み|休日)/.test(hoursStr)) {
    let m;
    while ((m = re.exec(hoursStr))) {
      const dow = DOW_MAP[m[1]];
      if (dow !== undefined) closed.add(dow);
    }
  }
  // Also match 水曜定休 etc. (Japanese weekday names)
  const jpDow = { '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6, '日': 0 };
  const jpRe = /([月火水木金土日])曜[日]?定休/g;
  let jm;
  while ((jm = jpRe.exec(hoursStr))) {
    const dow = jpDow[jm[1]];
    if (dow !== undefined) closed.add(dow);
  }
  return closed;
}

/** Get day-of-week number from day label like "3/19 (四)" */
function getDowFromLabel(dayLabel) {
  if (!dayLabel) return null;
  const m = dayLabel.match(/[（(]\s*([日一二三四五六])\s*[）)]/);
  return m ? DOW_MAP[m[1]] : null;
}

/** Check for time conflicts. Returns { icon, msg } or null. */
function checkTimeConflict(stop, dayLabel) {
  if (!stop.time || !stop.hours) return null;

  const timeParts = stop.time.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeParts) return null;
  const arrival = toMins(parseInt(timeParts[1]), parseInt(timeParts[2]));

  // Check closed day first
  const dow = getDowFromLabel(dayLabel);
  if (dow !== null) {
    const closedDays = parseClosedDays(stop.hours);
    if (closedDays.has(dow)) {
      return { icon: '\u26A0\uFE0F', msg: '公休日' };
    }
  }

  // Check time ranges
  const ranges = parseTimeRanges(stop.hours);
  if (!ranges.length) return null;

  // Sort ranges by start time
  ranges.sort((a, b) => a[0] - b[0]);

  const earliest = ranges[0][0];
  const latest = ranges[ranges.length - 1][1];

  if (arrival < earliest) {
    return { icon: '\u26A0\uFE0F', msg: '尚未營業' };
  }
  if (arrival >= latest) {
    return { icon: '\u26A0\uFE0F', msg: '已打烊' };
  }

  // Check if arrival falls in a gap between ranges
  for (let i = 0; i < ranges.length - 1; i++) {
    if (arrival >= ranges[i][1] && arrival < ranges[i + 1][0]) {
      return { icon: '\u26A0\uFE0F', msg: '休息時段' };
    }
  }

  return null;
}

// ── Persist + Sync (shared save pipeline) ─────────────────────────
function persistAndSync() {
  const id = getActiveTripId();
  if (!id || !data) return;
  saveTrip(id, data);
  window.__itineraryData = data;
  window.dispatchEvent(new CustomEvent('itinerary-loaded', { detail: data }));
}

function generateStopId() {
  return 'stop_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Auto-recalculate stop times for a day based on duration + travelTime. */
function recalcTimes(dayDate) {
  if (!data) return;
  const day = data.days.find(d => d.date === dayDate);
  if (!day || !day.stops.length) return;

  // Start from the first stop's time
  const first = day.stops[0];
  if (!first.time) return;

  const parts = first.time.match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return;

  let mins = parseInt(parts[1]) * 60 + parseInt(parts[2]);

  for (let i = 1; i < day.stops.length; i++) {
    const prev = day.stops[i - 1];
    const curr = day.stops[i];

    // Add previous stop's duration
    if (prev.duration) mins += prev.duration;
    // Add current stop's travel time
    if (curr.travelTime) mins += curr.travelTime;

    // Skip if manually fixed (has _fixedTime flag)
    if (curr._fixedTime) continue;

    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    curr.time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}

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
        container.appendChild(createStopCard(stop, idx, day.color, day.date, day.label));
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
  document.body.dataset.view = target;
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
// ── 12-B: Edit Stop Modal ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

const EDIT_FIELDS = [
  { key: 'name',    label: '名稱',     type: 'text' },
  { key: 'time',    label: '時間',     type: 'text', placeholder: '14:30' },
  { key: 'type',    label: '類型',     type: 'select',
    options: [
      { value: 'food', label: '\u{1F35C} 餐飲' },
      { value: 'sight', label: '\u{1F3EF} 景點' },
      { value: 'stay', label: '\u{1F6CF} 住宿' },
      { value: 'transport', label: '\u{1F697} 交通' },
      { value: 'shop', label: '\u{1F6D2} 購物' },
    ],
  },
  { key: 'mapcode', label: 'MapCode',  type: 'text' },
  { key: 'address', label: '地址',     type: 'text' },
  { key: 'phone',   label: '電話',     type: 'text' },
  { key: 'hours',   label: '營業時間', type: 'text' },
  { key: 'parking', label: '停車',     type: 'text' },
  { key: 'note',    label: '備注',     type: 'textarea' },
  { key: 'duration',   label: '預估停留（分鐘）', type: 'number', step: '1', placeholder: '60' },
  { key: 'travelTime', label: '交通時間（分鐘）', type: 'number', step: '1', placeholder: '20' },
  { key: 'lat',     label: '緯度',     type: 'number', step: '0.000001' },
  { key: 'lng',     label: '經度',     type: 'number', step: '0.000001' },
];

function openEditModal(stop, dayDate) {
  const modal = document.getElementById('edit-modal');
  modal.hidden = false;

  let html = '<div class="modal-card"><h3>編輯站點</h3><form id="edit-form">';
  EDIT_FIELDS.forEach(f => {
    const val = stop[f.key] ?? '';
    if (f.type === 'select') {
      html += `<label class="edit-label">${f.label}
        <select name="${f.key}">
          ${f.options.map(o => `<option value="${o.value}"${o.value === val ? ' selected' : ''}>${o.label}</option>`).join('')}
        </select></label>`;
    } else if (f.type === 'textarea') {
      html += `<label class="edit-label">${f.label}
        <textarea name="${f.key}" rows="3">${esc(String(val))}</textarea></label>`;
    } else {
      html += `<label class="edit-label">${f.label}
        <input type="${f.type}" name="${f.key}" value="${esc(String(val))}"${f.step ? ` step="${f.step}"` : ''}${f.placeholder ? ` placeholder="${f.placeholder}"` : ''}></label>`;
    }
  });
  html += `<div class="modal-actions">
    <button type="button" class="modal-btn cancel" id="edit-cancel">取消</button>
    <button type="submit" class="modal-btn save">儲存</button>
  </div></form></div>`;
  modal.innerHTML = html;

  document.getElementById('edit-cancel').onclick = () => { modal.hidden = true; };
  modal.onclick = e => { if (e.target === modal) modal.hidden = true; };

  document.getElementById('edit-form').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const oldTime = stop.time;
    EDIT_FIELDS.forEach(f => {
      let val = fd.get(f.key);
      if (f.type === 'number') {
        val = val ? parseFloat(val) : null;
      }
      stop[f.key] = val;
    });
    // Mark as manually fixed if user changed time
    if (stop.time && stop.time !== oldTime) {
      stop._fixedTime = true;
    }
    persistAndSync();
    renderStops();
    modal.hidden = true;
    showToast('已更新');
  };
}

// ══════════════════════════════════════════════════════════════════
// ── 12-C: Move / Copy Stop ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function openDayPicker(stop, sourceDayDate, mode) {
  if (!data) return;
  const modal = document.getElementById('day-picker-modal');
  modal.hidden = false;

  const title = mode === 'move' ? '移至...' : '複製到...';
  let html = `<div class="modal-card"><h3>${title}</h3><div class="day-picker-list">`;
  data.days.forEach(day => {
    const isCurrent = day.date === sourceDayDate;
    html += `<button class="day-picker-row${isCurrent ? ' current' : ''}" data-date="${day.date}">
      <span class="chip-dot" style="background:${day.color}"></span>
      ${esc(day.label)}
      ${isCurrent ? '<span class="day-picker-current">（目前）</span>' : ''}
    </button>`;
  });
  html += `</div><div class="modal-actions">
    <button class="modal-btn cancel" id="picker-cancel">取消</button>
  </div></div>`;
  modal.innerHTML = html;

  document.getElementById('picker-cancel').onclick = () => { modal.hidden = true; };
  modal.onclick = e => { if (e.target === modal) modal.hidden = true; };

  modal.querySelectorAll('.day-picker-row').forEach(btn => {
    btn.onclick = () => {
      const targetDate = btn.dataset.date;
      if (mode === 'move' && targetDate === sourceDayDate) {
        modal.hidden = true;
        return;
      }

      const sourceDay = data.days.find(d => d.date === sourceDayDate);
      const targetDay = data.days.find(d => d.date === targetDate);
      if (!sourceDay || !targetDay) return;

      if (mode === 'move') {
        sourceDay.stops = sourceDay.stops.filter(s => s.id !== stop.id);
        targetDay.stops.push(stop);
        recalcTimes(sourceDayDate);
        recalcTimes(targetDate);
        persistAndSync();
        renderStops();
        showToast(`已移至 ${targetDay.label}`);
      } else {
        const clone = { ...stop, id: generateStopId() };
        targetDay.stops.push(clone);
        recalcTimes(targetDate);
        persistAndSync();
        showToast(`已複製到 ${targetDay.label}`);
      }
      modal.hidden = true;
    };
  });
}

// ══════════════════════════════════════════════════════════════════
// ── 12-A: Drag Reorder Stops ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function setupDragReorder() {
  const container = document.getElementById('stop-list');
  let dragCard = null;
  let ghost = null;
  let insertLine = null;
  let startY = 0;
  let offsetY = 0;
  let cards = [];
  let longPressTimer = null;
  let isDragging = false;

  container.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const card = handle.closest('.stop-card');
    if (!card) return;

    e.preventDefault();
    startY = e.clientY;
    dragCard = card;

    longPressTimer = setTimeout(() => {
      startDrag(e);
    }, 300);

    const onMove = ev => {
      if (!isDragging && Math.abs(ev.clientY - startY) > 10) {
        cancelLongPress();
        return;
      }
      if (isDragging) moveDrag(ev);
    };
    const onUp = () => {
      cancelLongPress();
      if (isDragging) endDrag();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });

  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }

  function startDrag(e) {
    isDragging = true;
    cards = [...container.querySelectorAll('.stop-card')];

    // Create ghost
    const rect = dragCard.getBoundingClientRect();
    offsetY = e.clientY - rect.top;
    ghost = dragCard.cloneNode(true);
    ghost.className = 'stop-card drag-ghost';
    ghost.style.width = rect.width + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.left = rect.left + 'px';
    document.body.appendChild(ghost);

    dragCard.classList.add('dragging');

    // Insertion line
    insertLine = document.createElement('div');
    insertLine.className = 'drag-insertion-line';
    container.appendChild(insertLine);

    container.style.touchAction = 'none';
  }

  function moveDrag(e) {
    if (!ghost) return;
    ghost.style.top = (e.clientY - offsetY) + 'px';

    // Find insertion position
    let insertIdx = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (e.clientY < mid) {
        insertIdx = i;
        break;
      }
    }

    // Position line
    if (insertIdx < cards.length) {
      const r = cards[insertIdx].getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      insertLine.style.top = (r.top - containerRect.top - 2) + 'px';
    } else if (cards.length > 0) {
      const r = cards[cards.length - 1].getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      insertLine.style.top = (r.bottom - containerRect.top) + 'px';
    }
    insertLine.style.display = 'block';
  }

  function endDrag() {
    if (!dragCard || !data) { cleanup(); return; }

    const dayData = data.days.find(d => d.date === activeDay);
    if (!dayData) { cleanup(); return; }

    const dragIdx = cards.indexOf(dragCard);
    let insertIdx = cards.length;
    const ghostRect = ghost.getBoundingClientRect();
    const cy = ghostRect.top + offsetY;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (cy < r.top + r.height / 2) { insertIdx = i; break; }
    }

    if (insertIdx !== dragIdx && insertIdx !== dragIdx + 1) {
      const [moved] = dayData.stops.splice(dragIdx, 1);
      const target = insertIdx > dragIdx ? insertIdx - 1 : insertIdx;
      dayData.stops.splice(target, 0, moved);
      recalcTimes(activeDay);
      persistAndSync();
      renderStops();
    }

    cleanup();
  }

  function cleanup() {
    if (ghost) { ghost.remove(); ghost = null; }
    if (insertLine) { insertLine.remove(); insertLine = null; }
    if (dragCard) { dragCard.classList.remove('dragging'); dragCard = null; }
    isDragging = false;
    cards = [];
    container.style.touchAction = '';
  }
}

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
    btnExport.onclick = () => openExportPicker(meta.id, meta.title);
    actions.appendChild(btnExport);

    const btnDelete = document.createElement('button');
    btnDelete.className = 'trip-action-btn danger';
    btnDelete.textContent = '刪除';
    btnDelete.onclick = () => {
      if (!confirm(`確定刪除「${meta.title}」？此操作無法復原。`)) return;
      deleteTrip(meta.id);
      loadCurrentTrip();
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

    const isXlsx = file.name.toLowerCase().endsWith('.xlsx');

    try {
      let json;
      if (isXlsx) {
        const buf = await file.arrayBuffer();
        json = parseXlsx(buf);
      } else {
        const text = await file.text();
        json = JSON.parse(text);
      }

      // Validate basic structure
      if (!json.trip || !json.days || !Array.isArray(json.days)) {
        showToast('格式錯誤：需要 trip 和 days 欄位');
        return;
      }

      const id = importTrip(json);
      setActiveTrip(id);
      loadCurrentTrip();
      renderTripManager();
      showToast(`已匯入「${json.trip.title || 'Untitled'}」`);

      if (isXlsx) {
        setTimeout(() => showToast('提示：xlsx 匯入不含座標與 MapCode，如需補上請使用 Python 腳本'), 2000);
      }
    } catch (e) {
      showToast(`匯入失敗：無效的${isXlsx ? ' Excel' : ' JSON'} 檔案`);
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

// ── Export Format Picker ─────────────────────────────────────────
function openExportPicker(id, title) {
  const modal = document.getElementById('day-picker-modal');
  modal.hidden = false;
  modal.innerHTML = `<div class="modal-card"><h3>匯出格式</h3>
    <div class="day-picker-list">
      <button class="day-picker-row" data-fmt="json">&#x1F4C4; JSON</button>
      <button class="day-picker-row" data-fmt="xlsx">&#x1F4CA; Excel (.xlsx)</button>
    </div>
    <div class="modal-actions">
      <button class="modal-btn cancel" id="export-cancel">取消</button>
    </div></div>`;

  document.getElementById('export-cancel').onclick = () => { modal.hidden = true; };
  modal.onclick = e => { if (e.target === modal) modal.hidden = true; };

  modal.querySelectorAll('.day-picker-row').forEach(btn => {
    btn.onclick = () => {
      modal.hidden = true;
      if (btn.dataset.fmt === 'json') {
        downloadTrip(id, title);
      } else {
        downloadTripXlsx(id, title);
      }
    };
  });
}

function downloadTripXlsx(id, title) {
  const tripData = getTrip(id);
  if (!tripData) { showToast('匯出失敗'); return; }
  const filename = `${title || 'trip'}.xlsx`;
  exportXlsx(tripData, filename);
  showToast('已匯出 Excel');
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
setupDragReorder();
