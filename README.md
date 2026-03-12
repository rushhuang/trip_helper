# 行程查詢 PWA

手機可安裝的離線旅遊行程 App，支援多行程管理，快速查詢每個地點的 MapCode、地址、電話、營業時間與停車資訊，並一鍵開啟地圖導航或撥打電話。

## 功能特色

- **離線可用** — Service Worker 快取，斷網仍可查閱全部行程
- **多行程管理** — 匯入 / 匯出 / 切換多個旅遊行程
- **互動地圖** — Leaflet.js + OpenStreetMap，彩色編號標記 + 每日路線
- **快捷動作** — 一鍵複製 MapCode、Google Maps 導航、撥打電話
- **全文搜尋** — 跨日即時篩選地點名稱、地址、備注
- **深色/淺色模式** — 跟隨系統設定自動切換
- **可安裝** — 支援 Android / iOS 加入主畫面

## 專案結構

```
trip_helper/
├── pwa/                    PWA 應用本體
│   ├── index.html          主頁面
│   ├── manifest.json       PWA 設定
│   ├── sw.js               Service Worker（離線快取）
│   ├── style.css           樣式（含深色/淺色模式）
│   ├── app.js              主程式（行程列表 + 搜尋 + 快捷動作）
│   ├── map.js              地圖模組（Leaflet 標記 + 路線）
│   ├── trips.js            行程管理模組（localStorage CRUD）
│   ├── data/
│   │   └── itinerary.json  預設行程資料
│   └── icons/              PWA 圖示（192/512，any/maskable）
├── scripts/
│   ├── xlsx_to_json.py     Excel → JSON 轉換腳本
│   └── geocode.py          Nominatim 自動地理編碼腳本
├── serve_https.py          本地 HTTPS 測試伺服器
└── ROADMAP.md              開發路線圖
```

## 快速開始

### 本地測試

```bash
# HTTP（行程查詢功能完整可用）
python3 -m http.server 8080 --directory pwa/
# 瀏覽器開啟 http://localhost:8080
```

### 手機本地安裝（Android + USB）

```bash
# 啟動本地伺服器
python3 -m http.server 8080 --directory pwa/

# 將手機 port 轉發到電腦
adb reverse tcp:8080 tcp:8080

# 手機 Chrome 開啟 http://localhost:8080，點「加入主畫面」
```

### 部署到 GitHub Pages

```bash
git subtree push --prefix pwa origin gh-pages
```

或將 `pwa/` 資料夾拖拉到 [Netlify Drop](https://app.netlify.com/drop)。

## 新增旅遊行程

### 方法一：從 Excel 轉換

1. 準備旅遊行程 Excel 檔（參考欄位格式：日期、時間、地點名稱、資訊五段式、備注）

2. 安裝依賴套件：
   ```bash
   pip install openpyxl
   ```

3. 執行轉換腳本：
   ```bash
   python3 scripts/xlsx_to_json.py
   ```

4. 執行地理編碼（自動補上座標）：
   ```bash
   pip install requests
   python3 scripts/geocode.py
   ```

5. 在 PWA「行程管理」頁面點「匯入 JSON」，選擇產生的檔案。

### 方法二：手動編寫 JSON

參考以下格式建立 JSON 檔，再於 PWA 匯入：

```jsonc
{
  "trip": {
    "title": "2026 沖繩家族旅遊",
    "dates": "3/19(四) – 3/26(四)"
  },
  "days": [
    {
      "date": "3/19",
      "label": "3/19 (四)",
      "color": "#FF6B6B",
      "stops": [
        {
          "id": "stop_001",
          "time": "14:30",
          "type": "food",           // food | sight | stay | transport | shop
          "name": "地點名稱",
          "mapcode": "33 095 245*87",
          "address": "完整地址",
          "phone": "098-000-0000",
          "hours": "11:00-23:30",
          "parking": "停車資訊",
          "note": "備注",
          "lat": 26.2120,
          "lng": 127.6814
        }
      ]
    }
  ]
}
```

## 技術選型

| 項目 | 選擇 | 理由 |
|------|------|------|
| 框架 | 純 HTML + Vanilla JS (ES Module) | 無需打包、可直接 `file://` 開啟測試 |
| 樣式 | CSS Variables + Flexbox/Grid | 無依賴、易客製化深色模式 |
| 資料 | localStorage 多行程儲存 + JSON 匯入匯出 | 離線可用、支援多行程 |
| 地圖 | Leaflet.js + OpenStreetMap | 免費、無 API Key、支援手機觸控 |
| 座標 | Nominatim 預先地理編碼，結果寫入 JSON | 執行期不呼叫外部 API，完全離線 |
| PWA | `manifest.json` + Service Worker | 可加入主畫面、離線快取 |
