// ── Trip Storage Module ──────────────────────────────────────────
// Uses localStorage to manage multiple trips.
//
// Storage keys:
//   'tripIndex'    → JSON array: [{id, title, dates, createdAt}]
//   'trip_<id>'    → full trip JSON (same format as itinerary.json)
//   'activeTrip'   → id of currently active trip

const TRIP_INDEX_KEY = 'tripIndex';
const ACTIVE_KEY = 'activeTrip';

function _getIndex() {
  try {
    return JSON.parse(localStorage.getItem(TRIP_INDEX_KEY)) || [];
  } catch { return []; }
}

function _saveIndex(index) {
  localStorage.setItem(TRIP_INDEX_KEY, JSON.stringify(index));
}

function _tripKey(id) {
  return `trip_${id}`;
}

function _genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Public API ───────────────────────────────────────────────────

/** List all saved trips (metadata only). */
export function listTrips() {
  return _getIndex();
}

/** Get the full data for a trip by id. */
export function getTrip(id) {
  try {
    return JSON.parse(localStorage.getItem(_tripKey(id)));
  } catch { return null; }
}

/** Get the active trip id. */
export function getActiveTripId() {
  return localStorage.getItem(ACTIVE_KEY);
}

/** Set the active trip. */
export function setActiveTrip(id) {
  localStorage.setItem(ACTIVE_KEY, id);
}

/** Save a new trip from a data object. Returns the new trip id. */
export function importTrip(data) {
  const id = _genId();
  const meta = {
    id,
    title: data.trip?.title || 'Untitled Trip',
    dates: data.trip?.dates || '',
    createdAt: new Date().toISOString(),
  };

  const index = _getIndex();
  index.push(meta);
  _saveIndex(index);
  localStorage.setItem(_tripKey(id), JSON.stringify(data));
  return id;
}

/** Delete a trip. */
export function deleteTrip(id) {
  const index = _getIndex().filter(t => t.id !== id);
  _saveIndex(index);
  localStorage.removeItem(_tripKey(id));

  // If we deleted the active trip, switch to another or clear
  if (getActiveTripId() === id) {
    if (index.length > 0) {
      setActiveTrip(index[0].id);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }
}

/** Export a trip as a JSON string (for download). */
export function exportTripJSON(id) {
  const data = getTrip(id);
  if (!data) return null;
  return JSON.stringify(data, null, 2);
}

/** Load the active trip data. Returns null if none. */
export function loadActiveTrip() {
  const id = getActiveTripId();
  if (!id) return null;
  return getTrip(id);
}

/** Save (overwrite) the full data for an existing trip. */
export function saveTrip(id, data) {
  localStorage.setItem(_tripKey(id), JSON.stringify(data));
}

/** Check if any trips exist. */
export function hasTrips() {
  return _getIndex().length > 0;
}
