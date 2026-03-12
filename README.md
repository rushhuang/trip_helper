# 行程查詢 PWA

手機可安裝的離線旅遊行程 App，支援多行程管理，快速查詢每個地點的 MapCode、地址、電話、營業時間與停車資訊，並一鍵開啟地圖導航或撥打電話。

## 功能特色

- **離線可用** — Service Worker 快取，斷網仍可查閱全部行程
- **多行程管理** — 匯入 / 匯出 / 切換多個旅遊行程
- **互動地圖** — Leaflet.js + OpenStreetMap，彩色編號標記 + 每日路線，點擊標記可跳轉行程列表
- **快捷動作** — 一鍵複製 MapCode、Google Maps 導航、撥打電話
- **全文搜尋** — 跨日即時篩選地點名稱、地址、備注
- **深色/淺色模式** — 跟隨系統設定自動切換
- **行程快速切換** — 多行程時頂部 pill 選擇器，一鍵切換不需進管理頁
- **響應式佈局** — 手機底部導覽 + 電腦版頂部導覽與左側日期邊欄
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
├── example/
│   ├── example.xlsx        Excel 格式範例（3 天 6 站）
│   └── example.json        itinerary.json 格式範例
├── deploy.sh               互動式部署選單
├── serve_https.py          本地 HTTPS 伺服器（自簽憑證）
└── ROADMAP.md              開發路線圖
```

## 快速開始

### 互動式工具選單

```bash
./deploy.sh
```

```
── 轉換 ──────────────────────────────────
  1) xlsx → JSON    Excel 轉行程資料
  2) 地理編碼        補上座標（需網路）
  3) 完整流程        xlsx → JSON → 地理編碼

── 部署 ──────────────────────────────────
   本地
  4) HTTP        http://localhost:8080   （快速測試）
  5) HTTPS       https://localhost:8443  （PWA 完整功能）
  6) HTTPS + Android  adb 轉發到手機     （本機安裝）

   遠端（即將支援）
  7) GitHub Pages   git subtree push
  8) Netlify        CLI 一鍵部署
  9) GitHub Release 打包 ZIP 上傳
```

### 手動啟動

```bash
# HTTP（快速測試）
python3 -m http.server 8080 --directory pwa/

# HTTPS（PWA 完整功能，含 Service Worker）
python3 serve_https.py

# Android 手機安裝（需先執行 HTTPS 伺服器）
adb reverse tcp:8443 tcp:8443
# 手機 Chrome 開啟 https://localhost:8443，點「加入主畫面」
```

## 新增旅遊行程

### 方法一：從 Excel 轉換

完整範例檔：[`example/example.xlsx`](example/example.xlsx)、[`example/example.json`](example/example.json)

#### Excel 欄位格式

| 欄 | 內容 | 說明 |
|----|------|------|
| A | 日期 | `4/1(二)` 格式，同一天後續列可留空 |
| B | 時間 | `14:30` 格式 |
| C | 地點名稱 | 景點／餐廳／飯店名稱 |
| D | 五段式資訊 | 多行文字，格式如下 |
| E | 備注 | 自由填寫 |

**D 欄格式**（每段一行，缺少的欄位可省略或留空）：

```
Mapcode：33 095 245*87
地址：〒901-0155 沖縄県那覇市金城５丁目4-6
電話：098-857-5577
營業時間：11:00-23:30
🅿 餐廳底下及隔壁賣場有停車位
```

1. 準備旅遊行程 Excel 檔（參考上方格式，或直接複製 `example/example.xlsx`）

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

參考以下格式建立 JSON 檔（或直接修改 [`example/example.json`](example/example.json)），再於 PWA 匯入：

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
