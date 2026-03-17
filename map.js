// ── Map Module ───────────────────────────────────────────────────
let map = null;
let data = null;
let layers = {};       // { '3/19': { markers: L.layerGroup, polyline: L.polyline } }
let activeChips = {};  // { '3/19': true/false }
let allMarkerBounds = null;
let markerIndex = {};  // { 'stop_001': { marker, day } }

// ── Wait for data (also handles trip switching) ──────────────────
window.addEventListener('itinerary-loaded', e => {
  data = e.detail;
  // Clear old layers from map
  if (map) {
    Object.values(layers).forEach(({ markers, polyline }) => {
      if (map.hasLayer(markers)) map.removeLayer(markers);
      if (map.hasLayer(polyline)) map.removeLayer(polyline);
    });
  }
  layers = {};
  activeChips = {};
  markerIndex = {};
  buildChips();
  if (map) {
    buildLayers();
    fitVisible();
  }
});

window.addEventListener('map-activate', () => {
  // Pick up data if we missed the itinerary-loaded event (module load order race)
  if (!data && window.__itineraryData) {
    data = window.__itineraryData;
    buildChips();
  }
  if (!map) initMap();
  setTimeout(() => map.invalidateSize(), 100);
});

// ── Init Map ─────────────────────────────────────────────────────
function initMap() {
  map = L.map('map-container', {
    zoomControl: true,
    attributionControl: true,
  }).setView([26.5, 127.8], 10);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  // Hide summary bar when popup closes (click elsewhere on map)
  map.on('popupclose', () => {
    document.getElementById('map-summary').hidden = true;
  });

  buildLayers();
  fitVisible();

  // Controls
  document.getElementById('btn-fit-all').onclick = fitVisible;
  document.getElementById('btn-fit-today').onclick = fitToday;
  document.getElementById('btn-my-location').onclick = locateMe;
}

// ── Build Layers ─────────────────────────────────────────────────
function buildLayers() {
  if (!data) return;
  allMarkerBounds = L.latLngBounds([]);

  data.days.forEach(day => {
    const markerGroup = L.layerGroup();
    const coords = [];
    let stopNum = 0;

    day.stops.forEach(stop => {
      stopNum++;
      if (stop.lat == null || stop.lng == null) return;

      const latlng = [stop.lat, stop.lng];
      coords.push(latlng);
      allMarkerBounds.extend(latlng);

      const icon = createNumberedIcon(stopNum, day.color, stop.type);
      const marker = L.marker(latlng, { icon })
        .bindPopup(createPopupContent(stop, stopNum, day), { maxWidth: 260 });

      marker.on('click', () => showSummary(stop, stopNum, day));
      markerIndex[stop.id] = { marker, day, stopNum };

      // Long press → navigate
      let pressTimer = null;
      marker.on('mousedown touchstart', () => {
        pressTimer = setTimeout(() => {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`, '_blank');
        }, 600);
      });
      marker.on('mouseup touchend mouseleave', () => clearTimeout(pressTimer));

      markerGroup.addLayer(marker);
    });

    const polyline = L.polyline(coords, {
      color: day.color,
      weight: 3,
      opacity: 0.6,
      dashArray: '8, 6',
    });

    layers[day.date] = { markers: markerGroup, polyline };

    // Show active chips
    if (activeChips[day.date]) {
      markerGroup.addTo(map);
      polyline.addTo(map);
    }
  });
}

// ── Numbered Marker Icon ─────────────────────────────────────────
function createNumberedIcon(num, color, type) {
  const TYPE_EMOJI = {
    food: '\u{1F35C}', sight: '\u{1F3EF}', stay: '\u{1F6CF}',
    transport: '\u{1F697}', shop: '\u{1F6D2}',
  };
  const emoji = TYPE_EMOJI[type] || '';

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background:${color};
      width:30px;height:30px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:12px;font-weight:700;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.4);
      position:relative;
    ">${num}<span style="
      position:absolute;top:-8px;right:-8px;font-size:12px;
    ">${emoji}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

// ── Popup ────────────────────────────────────────────────────────
function createPopupContent(stop, num, day) {
  const time = stop.time ? `<span style="color:#888;font-size:12px">${esc(stop.time)}</span>` : '';
  return `<div style="font-size:13px">
    <strong>${num}. ${esc(stop.name)}</strong><br>
    ${time}
    ${stop.address ? `<br><span style="font-size:11px;color:#888">${esc(stop.address)}</span>` : ''}
  </div>`;
}

// ── Bottom Summary ───────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function showSummary(stop, num, day) {
  const el = document.getElementById('map-summary');
  el.hidden = false;
  el.innerHTML = `
    <div class="summary-num" style="background:${day.color}">${num}</div>
    <div class="summary-info">
      <div class="summary-name">${esc(stop.name)}</div>
      <div class="summary-time">${esc(stop.time)} ${TYPE_EMOJI_TEXT[stop.type] || ''}</div>
    </div>
    <span style="color:var(--text-secondary)">&#x276F;</span>
  `;
  el.onclick = () => {
    window.scrollToStop(stop.id, day.date);
    el.hidden = true;
  };
}

const TYPE_EMOJI_TEXT = {
  food: '\u{1F35C}', sight: '\u{1F3EF}', stay: '\u{1F6CF}',
  transport: '\u{1F697}', shop: '\u{1F6D2}',
};

// ── Day Chips ────────────────────────────────────────────────────
function buildChips() {
  if (!data) return;
  const container = document.getElementById('map-chips');
  container.innerHTML = '';

  // Determine today
  const now = new Date();
  const todayStr = `${now.getMonth() + 1}/${now.getDate()}`;
  const hasToday = data.days.some(d => d.date === todayStr);

  // Toggle all button
  const toggleAll = document.createElement('button');
  toggleAll.className = 'chip-toggle-all';
  toggleAll.textContent = '全選';
  toggleAll.onclick = () => {
    const allActive = Object.values(activeChips).every(v => v);
    data.days.forEach(d => {
      activeChips[d.date] = !allActive;
    });
    updateChips();
    updateMapLayers();
    toggleAll.textContent = allActive ? '全選' : '全清';
  };
  container.appendChild(toggleAll);

  data.days.forEach(day => {
    // Default: show today only (or all if outside trip range)
    activeChips[day.date] = hasToday ? (day.date === todayStr) : true;

    const chip = document.createElement('button');
    chip.className = 'map-chip' + (activeChips[day.date] ? ' active' : '');
    chip.dataset.date = day.date;
    chip.innerHTML = `<span class="chip-dot" style="background:${day.color}"></span>${day.label.replace(' ', '')}`;
    chip.onclick = () => {
      activeChips[day.date] = !activeChips[day.date];
      updateChips();
      updateMapLayers();
    };
    container.appendChild(chip);
  });
}

function updateChips() {
  document.querySelectorAll('.map-chip').forEach(chip => {
    chip.classList.toggle('active', !!activeChips[chip.dataset.date]);
  });
}

function updateMapLayers() {
  if (!map) return;
  Object.entries(layers).forEach(([date, { markers, polyline }]) => {
    if (activeChips[date]) {
      if (!map.hasLayer(markers)) markers.addTo(map);
      if (!map.hasLayer(polyline)) polyline.addTo(map);
    } else {
      if (map.hasLayer(markers)) map.removeLayer(markers);
      if (map.hasLayer(polyline)) map.removeLayer(polyline);
    }
  });
  fitVisible();
}

// ── Fit Bounds ───────────────────────────────────────────────────
function fitVisible() {
  if (!map) return;
  const bounds = L.latLngBounds([]);
  Object.entries(layers).forEach(([date, { markers }]) => {
    if (!activeChips[date]) return;
    markers.eachLayer(m => bounds.extend(m.getLatLng()));
  });
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }
}

function fitToday() {
  const now = new Date();
  const todayStr = `${now.getMonth() + 1}/${now.getDate()}`;
  // Activate only today
  data.days.forEach(d => {
    activeChips[d.date] = d.date === todayStr;
  });
  updateChips();
  updateMapLayers();
}

// ── Geolocation: My Location ────────────────────────────────────
let myLocationMarker = null;
let myLocationCircle = null;

function locateMe() {
  if (!map) return;
  if (!navigator.geolocation) {
    showToast('此裝置不支援定位功能');
    return;
  }

  const btn = document.getElementById('btn-my-location');
  btn.classList.add('locating');

  navigator.geolocation.getCurrentPosition(
    pos => {
      btn.classList.remove('locating');
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng = [latitude, longitude];

      // Remove old marker/circle
      if (myLocationMarker) map.removeLayer(myLocationMarker);
      if (myLocationCircle) map.removeLayer(myLocationCircle);

      // Accuracy circle
      myLocationCircle = L.circle(latlng, {
        radius: accuracy,
        color: '#4285F4',
        fillColor: '#4285F4',
        fillOpacity: 0.15,
        weight: 1,
      }).addTo(map);

      // Blue dot marker
      myLocationMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'my-location-icon',
          html: '<div class="my-location-dot"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: 1000,
      }).addTo(map).bindPopup('我的位置');

      map.setView(latlng, 15, { animate: true });
    },
    err => {
      btn.classList.remove('locating');
      const msgs = {
        1: '定位權限被拒絕，請在設定中允許',
        2: '無法取得位置資訊',
        3: '定位逾時，請重試',
      };
      showToast(msgs[err.code] || '定位失敗');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  );
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ── Focus stop from list view ───────────────────────────────────
window.addEventListener('map-focus-stop', e => {
  const { stopId, dayDate } = e.detail;
  if (!data || !map) return;

  const entry = markerIndex[stopId];
  if (!entry) return;

  // Show only that day
  data.days.forEach(d => {
    activeChips[d.date] = d.date === dayDate;
  });
  updateChips();
  updateMapLayers();

  // Zoom and open popup
  const latlng = entry.marker.getLatLng();
  map.setView(latlng, 15, { animate: true });
  entry.marker.openPopup();
  showSummary(
    data.days.find(d => d.date === dayDate)?.stops.find(s => s.id === stopId),
    entry.stopNum,
    entry.day,
  );
});
