# 行程查詢 PWA — ROADMAP

## 目標

手機可安裝的離線行程查詢 App，支援**多行程管理**，快速找到每個地點的 MapCode / 地址 / 電話 / 營業時間 / 停車，並一鍵開啟地圖導航或撥打電話。

---

## 技術選型

| 項目 | 選擇 | 理由 |
|------|------|------|
| 框架 | 純 HTML + Vanilla JS (ES Module) | 無需打包、可直接 file:// 開啟測試 |
| 樣式 | CSS Variables + Flexbox/Grid | 無依賴、易客製化深色模式 |
| 資料 | localStorage 多行程儲存 + JSON 匯入匯出 | 離線可用、方便日後更新、支援多行程 |
| 地圖 | **Leaflet.js + OpenStreetMap** | 免費、無 API Key、輕量（~42KB）、支援手機觸控 |
| 座標 | **Nominatim 預先地理編碼**，結果寫入 JSON | 執行期不呼叫外部 API，完全離線可用 |
| PWA | `manifest.json` + Service Worker | 可加入主畫面、離線快取 |
| 部署 | `deploy.sh` 互動選單 / GitHub Pages / Netlify Drop | 免費、HTTPS（PWA 必要） |

---

## 架構

```
pwa/
├── index.html          主頁面
├── manifest.json       PWA 設定
├── sw.js               Service Worker（離線快取）
├── style.css           樣式（含深色/淺色模式）
├── app.js              主程式（行程列表 + 搜尋 + 快捷動作）
├── map.js              地圖模組（Leaflet 標記 + 路線）
├── trips.js            行程管理模組（localStorage CRUD）
├── data/
│   └── itinerary.json  預設行程（首次載入時自動匯入）
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable-192.png
    └── icon-maskable-512.png
```

### 資料流

```
JSON 檔案 ──匯入──▶ localStorage ──讀取──▶ app.js ──渲染──▶ UI
                                         ├──▶ map.js (地圖)
                                         └──匯出──▶ JSON 下載
```

- 首次啟動自動匯入 `data/itinerary.json` 為預設行程
- 之後所有行程資料從 localStorage 載入，不依賴伺服器
- 切換行程時通知 map.js 重建圖層

### 儲存結構（localStorage）

| Key | 內容 |
|-----|------|
| `tripIndex` | 行程索引 `[{id, title, dates, createdAt}]` |
| `trip_<id>` | 完整行程 JSON（同 `itinerary.json` 格式）|
| `activeTrip` | 當前使用的行程 id |

---

## 資料結構（`itinerary.json`）

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
      "color": "#FF6B6B",           // 地圖標記顏色，每天不同
      "stops": [
        {
          "id": "stop_001",
          "time": "14:30",
          "type": "food",           // food | sight | stay | transport | shop
          "name": "琉球新麵 通堂 小祿本店",
          "mapcode": "33 095 245*87",
          "address": "〒901-0155 沖縄県那覇市金城５丁目4-6",
          "phone": "098-857-5577",
          "hours": "11:00-23:30",
          "parking": "餐廳底下及隔壁賣場有停車位",
          "note": "預計等待+吃約1.5hr",
          "lat": 26.2120,
          "lng": 127.6814
        }
      ]
    }
  ]
}
```

---

## Phase 1 — 資料提取 ✅

**目標：** 將 `2026沖繩家族旅遊.xlsx` 轉成含座標的 `itinerary.json`

- [x] `scripts/xlsx_to_json.py` — Excel → JSON（7 天 53 站）
- [x] `scripts/geocode.py` — Nominatim 自動地理編碼（30 站成功）
- [x] 手動補正 17 個地點座標 + 修正 1 個錯誤座標
- [x] 最終：48/53 站有座標（剩餘 6 個為 TBD 地點）

---

## Phase 2 — 核心 UI ✅

- [x] 頂部動態標題（顯示當前行程名稱）
- [x] Day Tab Bar：依行程天數動態產生
- [x] Stop Card：時間、名稱、類型 icon（🍜🏯🛏🚗🛒）、展開/收合
- [x] 手機優先排版（safe-area-inset）

---

## Phase 3 — 快捷動作 ✅

- [x] 📋 複製 MapCode（clipboard API + fallback）
- [x] 🗺 Google Maps 導航（座標優先，地址 fallback）
- [x] 📞 撥打電話（`tel:` 連結）
- [x] Toast 通知（1.5 秒消失）

---

## Phase 4 — 路線地圖 ✅

- [x] Leaflet.js + OpenStreetMap 地圖
- [x] 彩色圓形編號標記 + 類型 emoji
- [x] 每日虛線 Polyline 路線連接
- [x] 日期篩選 chips（預設今日 / 全選切換）
- [x] 點擊標記 → 底部摘要列 → 跳轉行程列表
- [x] 長按標記 → Google Maps 導航
- [x] 「定位」「今日」按鈕
- [x] 切換行程時自動重建圖層

---

## Phase 5 — PWA 設定 ✅

- [x] `manifest.json`（standalone、icon any/maskable 分離）
- [x] `sw.js`（Cache First + stale-while-revalidate 地圖磚）
- [x] Android `beforeinstallprompt` 安裝提示
- [x] iOS「分享 → 加入主畫面」引導提示
- [x] 本地安裝方式：`adb reverse tcp:8080 tcp:8080` + `http://localhost:8080`

---

## Phase 6 — 細節打磨 ✅

- [x] **深色/淺色模式**：`prefers-color-scheme` 自動切換
- [x] **全文搜尋**：跨日即時篩選地點名稱、地址、備注
- [x] **今日跳轉**：啟動時自動定位到當天分頁

---

## Phase 7 — 行程管理 ✅

**目標：** 支援多行程，便於安排下一趟旅行

### 功能清單

- [x] **行程儲存層**（`trips.js`）
  - localStorage 管理多個行程
  - CRUD：建立 / 讀取 / 刪除
  - 行程切換（setActiveTrip）
- [x] **匯入 JSON**
  - 檔案選擇器（`<input type="file" accept=".json">`）
  - 格式驗證（需有 `trip` + `days` 欄位）
  - 匯入後自動切換為使用中行程
- [x] **匯出 JSON**
  - 下載當前行程為 `.json` 檔案
  - 檔名為行程標題
- [x] **行程管理頁面**
  - 底部導覽第三頁（⚙ 行程管理）
  - 列出所有行程（標題、日期、天數、站數）
  - 使用中行程標記 badge
  - 切換 / 匯出 / 刪除 按鈕
  - 刪除前 confirm 確認
- [x] **預設行程**
  - 首次載入自動匯入 `data/itinerary.json`
  - 之後完全從 localStorage 載入

### 製作新行程的流程

```
1. 準備 Excel（或任何來源）
2. 用 scripts/xlsx_to_json.py 轉換（或手動編寫 JSON）
3. 用 scripts/geocode.py 補上座標
4. 在 PWA「行程管理」頁面點「匯入 JSON」
5. 選擇檔案 → 自動載入 → 完成
```

---

## Phase 8 — 文件與工具選單 ✅

- [x] **README.md**：功能特色、專案結構、快速開始、新增行程流程、技術選型
- [x] **example/**：`example.xlsx`（含欄位樣式）+ `example.json`（完整格式範例）
- [x] **deploy.sh**：互動式工具選單，分轉換／部署兩大區塊
  - 轉換
    - `1` xlsx → JSON（自動偵測根目錄 .xlsx，缺套件自動安裝）
    - `2` 地理編碼（Nominatim，缺套件自動安裝，先檢查 JSON 存在）
    - `3` 完整流程（依序執行 1 → 2）
  - 部署（本地）
    - `4` HTTP `localhost:8080`（快速測試）
    - `5` HTTPS `localhost:8443`（PWA 完整功能，自動找可用 port）
    - `6` HTTPS + adb 轉發（Android 手機安裝，含裝置偵測）
  - 部署（遠端，預留 TODO）
    - `7` GitHub Pages
    - `8` Netlify
    - `9` GitHub Release

---

## 部署方式

```bash
# 互動式選單（推薦）
./deploy.sh

# 手動：HTTP 快速測試
python3 -m http.server 8080 --directory pwa/

# 手動：HTTPS（PWA 完整功能）
python3 serve_https.py

# 手動：Android 手機安裝
adb reverse tcp:8443 tcp:8443
# 手機 Chrome 開啟 https://localhost:8443，點「加入主畫面」

# 部署到 GitHub Pages（待 deploy.sh 選項 7 實作）
git subtree push --prefix pwa origin gh-pages
```
