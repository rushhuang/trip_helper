/**
 * xlsx-utils.js — xlsx 匯入匯出工具模組
 *
 * 依賴全域 XLSX 物件（SheetJS CDN）
 */

// ── 每日顏色調色盤 ──────────────────────────────────────────────────
const DAY_PALETTE = [
  '#FF6B6B', '#FFA94D', '#69DB7C', '#4DABF7',
  '#DA77F2', '#F783AC', '#A9E34B', '#74C0FC',
  '#FFD43B', '#63E6BE', '#748FFC', '#E599F7',
];

// ── 地點類型偵測 ──────────────────────────────────────────────────────
const STAY_KW    = ['hotel', 'besso', 'lieta', 'strata', 'allivio', 'jr九州', 'jrk',
                    '酒店', '飯店', '住宿', '民宿'];
const TRANSPORT_KW = ['orix', '租車', '還車', '機場', 'airport'];
const SHOP_KW    = ['コストコ', '好市多', 'big express', 'parco', '塩屋',
                    '藥妝', '超市', 'daiso', '大創'];
const SIGHT_KW   = ['城', '岬', '洞', '海灘', '海濱', '濱', '浜', '水族館', '海洋',
                    '燈塔', '遺跡', '島', '萬座毛', '公園', '漁港', '市場', 'anchi',
                    '王國村', '玉泉'];
const FOOD_KW    = ['麵', '拉麵', '壽司', '燒肉', '漢堡', '咖啡', 'coffee', 'bakery',
                    'パン', '食堂', '魚', '蝦', '餐廳', '茶', 'cafe', 'a&w', 'a＆w',
                    '早餐', '午餐', '晚餐', '宵夜', '飯糰', 'shrimp', '關東煮',
                    '鳥貴族', 'pizza', '披薩'];

const SKIP_NAMES = new Set(['', 'tbd', 'none', '早餐', 'tbд']);

function detectType(name) {
  const n = name.toLowerCase();
  if (STAY_KW.some(k => n.includes(k)))      return 'stay';
  if (TRANSPORT_KW.some(k => n.includes(k))) return 'transport';
  if (SHOP_KW.some(k => n.includes(k)))      return 'shop';
  if (SIGHT_KW.some(k => n.includes(k)))     return 'sight';
  if (FOOD_KW.some(k => n.includes(k)))      return 'food';
  return 'food';
}

// ── D 欄解析 ──────────────────────────────────────────────────────────
const PLACEHOLDER_RE = /^[（(]?(請輸入|查詢中|請查詢|TBD|無)|^(地址|電話|營業時間|🅿)|^\s*$/i;

function extractField(pattern, text) {
  const m = text.match(pattern);
  if (!m) return '';
  const val = m[1].trim();
  return PLACEHOLDER_RE.test(val) ? '' : val;
}

function parseDColumn(text) {
  if (!text) return {};
  const t = String(text);
  return {
    mapcode: extractField(/Mapcode[：:][ \t]*([^\n]+)/i, t),
    address: extractField(/地址[：:][ \t]*([^\n]+)/, t),
    phone:   extractField(/電話[：:][ \t]*([^\n]+)/, t),
    hours:   extractField(/營業時間[：:][ \t]*([^\n]+)/, t),
    parking: extractField(/🅿[️]?[ \t]*([^\n]+)/, t),
  };
}

// ── 停留/交通時間解析 ────────────────────────────────────────────────
function parseDuration(text) {
  if (!text) return null;
  let m = text.match(/停留[約]?\s*([\d.]+)\s*(小時|hr|h|時間)/i);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = text.match(/停留[約]?\s*([\d.]+)\s*(分鐘|分|min)/i);
  if (m) return Math.round(parseFloat(m[1]));
  m = text.match(/停留.*?([\d.]+)\s*(小時|hr|h|時間)/i);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = text.match(/停留.*?([\d.]+)\s*(分鐘|分|min)/i);
  if (m) return Math.round(parseFloat(m[1]));
  return null;
}

function parseTravelTime(text) {
  if (!text) return null;
  let m = text.match(/(?:開車|車程|過來|距離\S*)[約]?\s*([\d.]+)\s*(小時|hr|h|時間)/i);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = text.match(/(?:開車|車程|過來|距離\S*)[約]?\s*([\d.]+)\s*(分鐘|分|min)/i);
  if (m) return Math.round(parseFloat(m[1]));
  return null;
}

// ── 時間格式化 ────────────────────────────────────────────────────────
function fmtTime(val) {
  if (val == null || val === '') return '';
  // SheetJS: Excel time as fraction of day (e.g. 0.604166... = 14:30)
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // Date object (SheetJS with cellDates)
  if (val instanceof Date) {
    return `${String(val.getHours()).padStart(2, '0')}:${String(val.getMinutes()).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  const firstLine = s.split('\n')[0].trim();
  const timeMatch = firstLine.match(/^(\d{1,2}:\d{2})/);
  if (timeMatch) return timeMatch[1];
  return s;
}

// ── 名稱清理 ──────────────────────────────────────────────────────────
function cleanName(raw) {
  if (raw == null) return '';
  const lines = String(raw).trim().split('\n').filter(l => l.trim());
  return lines.map(l => l.trim()).join(' ');
}

// ══════════════════════════════════════════════════════════════════════
// ── 匯入：xlsx → itinerary JSON ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

export function parseXlsx(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const daysDict = {};
  const dateOrder = [];
  const dateLabels = {};
  let currentDate = null;
  let stopCounter = 0;

  // Start from row 3 (index 2) to skip headers
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const colA = row[0] != null ? String(row[0]).trim() : '';
    const colB = row[1];
    const colC = row[2];
    const colD = row[3];
    const colE = row[4];

    // Update date from A column
    if (colA) {
      const dateMatch = colA.match(/(\d{1,2}\/\d{1,2})/);
      if (dateMatch) {
        currentDate = dateMatch[1];
        if (!dateOrder.includes(currentDate)) {
          dateOrder.push(currentDate);
        }
        // Extract label with day of week
        const labelMatch = colA.match(/(\d{1,2}\/\d{1,2})\s*[（(]?\s*([日一二三四五六])\s*[）)]?/);
        if (labelMatch) {
          dateLabels[currentDate] = `${currentDate} (${labelMatch[2]})`;
        } else {
          dateLabels[currentDate] = currentDate;
        }
      }
    }

    if (!currentDate) continue;

    const name = cleanName(colC);
    if (!name || SKIP_NAMES.has(name.toLowerCase().trim())) continue;

    const info = parseDColumn(colD);
    const note = colE ? String(colE).trim() : '';
    const dText = colD ? String(colD).trim() : '';
    const timeStr = fmtTime(colB);
    const combined = dText + '\n' + note;

    stopCounter++;
    const stop = {
      id: `stop_${String(stopCounter).padStart(3, '0')}`,
      time: timeStr,
      type: detectType(name),
      name,
      mapcode: info.mapcode || '',
      address: info.address || '',
      phone:   info.phone   || '',
      hours:   info.hours   || '',
      parking: info.parking || '',
      note,
      lat: null,
      lng: null,
      duration:   parseDuration(combined),
      travelTime: parseTravelTime(combined),
    };

    if (!daysDict[currentDate]) daysDict[currentDate] = [];
    daysDict[currentDate].push(stop);
  }

  // Build final structure
  const days = dateOrder.map((date, idx) => ({
    date,
    label: dateLabels[date] || date,
    color: DAY_PALETTE[idx % DAY_PALETTE.length],
    stops: daysDict[date] || [],
  }));

  // Try to extract title from sheet name or A1
  let title = workbook.SheetNames[0] || '匯入行程';
  const a1 = ws['A1'];
  if (a1 && a1.v && typeof a1.v === 'string' && !String(a1.v).match(/\d{1,2}\/\d{1,2}/)) {
    title = String(a1.v).trim();
  }

  const firstDate = dateOrder[0] || '';
  const lastDate  = dateOrder[dateOrder.length - 1] || '';
  const datesStr  = firstDate && lastDate && firstDate !== lastDate
    ? `${dateLabels[firstDate] || firstDate} – ${dateLabels[lastDate] || lastDate}`
    : dateLabels[firstDate] || firstDate;

  return {
    trip: { title, dates: datesStr },
    days,
  };
}

// ══════════════════════════════════════════════════════════════════════
// ── 匯出：itinerary JSON → xlsx ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

export function exportXlsx(tripData, filename) {
  const aoa = [];

  // Header row
  aoa.push(['日期', '時間', '地點名稱', '詳細資訊', '備注']);
  aoa.push([]); // empty row 2

  tripData.days.forEach(day => {
    day.stops.forEach((stop, i) => {
      // A: date (first stop only)
      const dateCell = i === 0 ? (day.label || day.date) : '';
      // B: time
      const timeCell = stop.time || '';
      // C: name
      const nameCell = stop.name || '';

      // D: 5-field info
      const dParts = [];
      if (stop.mapcode) dParts.push(`Mapcode：${stop.mapcode}`);
      if (stop.address) dParts.push(`地址：${stop.address}`);
      if (stop.phone)   dParts.push(`電話：${stop.phone}`);
      if (stop.hours)   dParts.push(`營業時間：${stop.hours}`);
      if (stop.parking) dParts.push(`🅿️ ${stop.parking}`);
      const dCell = dParts.join('\n');

      // E: note + duration/travelTime
      const eParts = [];
      if (stop.note) eParts.push(stop.note);
      if (stop.duration && !(stop.note && stop.note.includes('停留'))) {
        const dur = stop.duration;
        if (dur >= 60 && dur % 60 === 0) {
          eParts.push(`停留約${dur / 60}小時`);
        } else if (dur >= 60) {
          eParts.push(`停留約${(dur / 60).toFixed(1)}小時`);
        } else {
          eParts.push(`停留約${dur}分鐘`);
        }
      }
      if (stop.travelTime && !(stop.note && (stop.note.includes('開車') || stop.note.includes('車程')))) {
        eParts.push(`開車過來約${stop.travelTime}分鐘`);
      }
      const eCell = eParts.join('\n');

      aoa.push([dateCell, timeCell, nameCell, dCell, eCell]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols'] = [
    { wch: 14 },  // A: date
    { wch: 8 },   // B: time
    { wch: 28 },  // C: name
    { wch: 45 },  // D: details
    { wch: 35 },  // E: notes
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = (tripData.trip?.title || '行程表').slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  XLSX.writeFile(wb, filename);
}
