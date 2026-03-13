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
    - `3` MapCode 查詢（japanmapcode.com，需有座標）
    - `4` 完整流程（依序執行 1 → 2 → 3）
  - 部署（本地）
    - `5` HTTP `localhost:8080`（快速測試）
    - `6` HTTPS `localhost:8443`（PWA 完整功能，自動找可用 port）
    - `7` HTTPS + adb 轉發（Android 手機安裝，含裝置偵測）
  - 部署（遠端）
    - `8` GitHub Pages（`git subtree split` + force push `gh-pages` 分支 + 自動設定 Pages）
    - `9` Netlify（`git archive` 建立乾淨部署目錄 + `netlify deploy --prod`）
    - `0` GitHub Release（`git archive` 打包 ZIP + `gh release create`，含自動版號建議）

---

## Phase 9 — 行程選擇器 UI 改版 ✅

**目標：** 多行程情境下，不需進入管理頁即可切換行程；日期 tab 從屬於行程，層級關係更清晰。

### 結構

```
列表頁
├── [行程選擇器]            ← 僅多行程時顯示；單行程隱藏
│     行程 A ▼  /  行程 B  /  行程 C
├── [日期 tab bar]          ← 隨選中行程動態更新
└── 站點卡片列表
```

### 功能清單

- [x] **行程選擇器列**（header 下方，日期 tab 上方）
  - 僅有 ≥ 2 個行程時顯示，單行程隱藏
  - 以橫向捲動 pill 呈現所有行程標題
  - 選中行程以高亮 pill 標示，切換時更新日期 tab、站點列表及地圖
  - 不需進入管理頁即可完成切換
- [x] **管理頁行程列表同步**（選擇器切換後，管理頁 active badge 同步更新）

---

## Phase 10 — 電腦版支援 ✅

**目標：** 在寬螢幕（≥ 768px）提供更適合電腦的版面，充分利用水平空間。

### 版面設計

```
┌─────────────────────────────────────────────────────┐
│  行程標題    [🔍 搜尋...]    [📋 行程] [🗺 地圖] [⚙ 管理] │  ← 頂部導覽列
├──────────────────────────────────────────────────────┤
│  [行程 A] [行程 B] [行程 C]                           │  ← 行程選擇器（≥2 時顯示）
├──────────────┬───────────────────────────────────────┤
│              │                                        │
│  3/19 (四)   │         地圖 / 列表 主內容區            │
│  3/20 (五)   │                                        │
│  3/21 (六)   │                                        │
│  …           │                                        │
│              │                                        │
└──────────────┴───────────────────────────────────────┘
```

### 功能清單

- [x] **響應式斷點**：`@media (min-width: 768px)` 啟用電腦版佈局
- [x] **頂部導覽列**（電腦版取代底部導覽）
  - 左：行程標題
  - 中：搜尋框（常駐展開，max-width 360px）
  - 右：行程 / 地圖 / 管理 切換按鈕
- [x] **左側邊欄**：日期 tab 改為垂直列表（200px 寬），active 左藍邊線 + 背景色
- [x] **主內容區**：列表或地圖佔滿剩餘寬度，地圖高度自適應
- [x] **卡片寬度上限**：站點卡片及管理頁 max-width 720px 置中
- [x] **底部導覽隱藏**：桌面模式下以頂部按鈕取代
- [x] **兩套導覽同步**：switchView() 統一管理，地圖 scrollToStop 也走同一邏輯
- [x] **地圖/管理頁隱藏日期邊欄**：`body[data-view]` 驅動，主內容區自動佔滿全寬
- [x] **地圖滿版**：手機版地圖填滿可用空間，保留底部導覽列

### Bug Fixes

- [x] `[hidden]` CSS specificity 問題：`display: flex` 覆蓋 `[hidden]` 的 `display: none`，影響 trip-selector / install-banner / map-summary
- [x] 行程刪除後 trip selector pill 未同步更新
- [x] 地圖初次載入無標記（ES module 載入順序競態，`map-activate` 時從 `window.__itineraryData` 補回）
- [x] 地圖 summary bar 在取消選取景點後未隱藏（監聽 Leaflet `popupclose` 事件）

---

## Phase 11 — 行程列表跳轉地圖 ✅

**目標：** 從行程列表的站點卡片快速跳到地圖頁，自動篩選該日、定位並選取該站點。

### 互動流程

```
行程列表 → 點擊站點導航按鈕 → 切換至地圖頁
  ├── 地圖 chips 自動切換為僅顯示該日
  ├── 地圖定位並放大至該站點
  └── 自動打開該站點的 popup + 底部 summary bar
```

### 功能清單

- [x] **站點卡片新增「地圖」快捷按鈕**（與複製 MapCode / 導航 / 電話同級）
- [x] **跳轉邏輯**（`app.js` → `map.js`）
  - 切換至 map-view
  - 通知 map.js：目標日期 + 站點 ID
  - map.js 收到後：切換 chips 為僅顯示該日 → 定位該標記 → 打開 popup → 顯示 summary bar
- [x] **反向跳轉**：地圖 summary bar 點擊跳回行程列表（已有功能，確認連動正常）

---

## Phase 12 — 行程編輯 ✅

**目標：** 在 PWA 內直接調整行程內容，不需重新匯入 JSON。

### 功能清單

#### 12-A 調整站點順序（同日拖曳排序）

- [x] **長按/拖曳** 站點卡片上下移動，調整同一天內的順序
- [x] 拖曳時顯示視覺提示（插入線 / 半透明卡片）
- [x] 放開後即時更新 localStorage，地圖路線同步重繪

#### 12-B 編輯站點卡片

- [x] 站點卡片新增「編輯」按鈕（展開後顯示）
- [x] 可編輯欄位：名稱、時間、類型、MapCode、地址、電話、營業時間、停車、備注
- [x] 可編輯座標（lat / lng），更新後地圖標記同步移動
- [x] 儲存後即時更新 localStorage + UI

#### 12-C 跨天移動站點

- [x] 站點卡片新增「移至…」操作（選擇目標日期）
- [x] 從原日期移除，插入目標日期尾端
- [x] 移動後兩天的地圖路線同步重繪
- [x] 支援「複製到…」：保留原站點，在目標日期新增副本

---

## Phase 13 — 行程卡增刪與時間管理 ✅

**目標：** 可直接在 PWA 內新增/刪除站點，並在排序或移動時自動調整時間，減少手動修改。

### 功能清單

#### 13-A 新增與刪除站點

- [x] **新增站點**：每日站點列表底部「+ 新增站點」按鈕
  - 點擊後開啟空白編輯 modal，填寫後插入該日尾端
  - 自動產生唯一 ID，儲存至 localStorage
- [x] **刪除站點**：站點卡片展開後顯示「刪除」按鈕
  - 刪除前 confirm 確認
  - 刪除後即時更新列表 + 地圖

#### 13-B 行程卡時間欄位強化

- [x] **停留時間**：站點新增 `duration`（分鐘）欄位
  - 編輯 modal 中新增「預估停留」輸入（如 60 分鐘）
  - 卡片上顯示停留時間（如「1h30min」）
- [x] **交通時間**：站點新增 `travelTime`（分鐘）欄位
  - 表示從上一站到此站的車程時間
  - 卡片之間顯示交通時間提示（如「🚗 20 min」）

#### 13-C 排序/移動自動調整時間

- [x] **拖曳排序後自動重算**：根據第一站時間 + 各站停留 + 交通時間，依序重算後續站點的預估到達時間
- [x] **跨天移動後自動調整**：移至目標日後，依目標日最後一站的時間順延
- [x] **手動覆蓋優先**：若使用者透過編輯 modal 手動設定時間，標記為「固定」，自動重算時跳過該站
- [ ] **時間衝突提示**：當自動計算的到達時間超過該站營業時間，顯示黃色警示

---

## Phase 14 — xlsx 時間資訊提取 ✅

**目標：** 改進 `xlsx_to_json.py`，從 Excel 各欄擷取抵達時間、停留時間與交通時間，寫入 JSON。

### 功能清單

- [x] **解析抵達時間**：從 B 欄取得各站點的抵達/出發時間，寫入 `time` 欄位（原有功能）
- [x] **解析停留時間**：從 D/E 欄備注抓取「停留約 X 小時」「停留 X hr」等模式，轉為 `duration`（分鐘）
- [x] **解析交通時間**：從 D/E 欄抓取「開車過來約 X 分鐘」「距離 XX 約 X 分鐘」等模式，轉為 `travelTime`（分鐘）
- [x] **匯出至 JSON**：stop 物件新增 `duration` 和 `travelTime` 欄位（缺失時為 `null`）
- [x] **統計報表**：轉換完成後印出各日預估總時間（停留 + 交通），方便檢查行程是否合理

---

## Phase 15 — xlsx 雙向匯入匯出（PWA + 腳本）

**目標：** PWA 內直接支援 xlsx 匯入匯出，讓使用者不需 Python 環境即可完成「Excel → 編輯 → Excel」流程。同時保留原有 Python 腳本供進階用途（批次處理、geocode、MapCode）。

> ⚠️ PWA 內的 xlsx 匯入匯出**不含自動地理編碼與 MapCode 查詢**（受瀏覽器 CORS 限制）。
> 若需補上座標與 MapCode，請使用 `scripts/geocode.py` + `scripts/mapcode.py`。

### 功能清單

#### 15-A PWA 匯入支援 xlsx

- [ ] **匯入格式選擇**：行程管理頁「匯入」同時支援 `.json` 和 `.xlsx`
- [ ] **瀏覽器端解析 xlsx**：使用 [SheetJS (xlsx)](https://docs.sheetjs.com/) 讀取 Excel
- [ ] **欄位對應**：與 `xlsx_to_json.py` 相同邏輯
  - A 欄：日期（`3/19(四)` 格式，往下延伸至 None）
  - B 欄：時間
  - C 欄：地點名稱
  - D 欄：五段式資訊（Mapcode / 地址 / 電話 / 營業時間 / 🅿️）
  - E 欄：備注
- [ ] **停留/交通時間解析**：從 D/E 欄提取 `duration` 和 `travelTime`（同 Phase 14 邏輯）
- [ ] **匯入提示**：告知使用者此流程不含自動 geocode / MapCode 查詢，如需座標請使用 Python 腳本

#### 15-B PWA 匯出支援 xlsx

- [ ] **匯出格式選擇**：行程管理頁匯出同時支援 `.json` 和 `.xlsx`
- [ ] **瀏覽器端產生 xlsx**：使用 SheetJS 產生 `.xlsx` 下載
- [ ] **欄位還原**：還原為原始 A–E 欄格式
  - A 欄：日期（每日第一站寫入 `3/19(四)` 格式，後續留空）
  - B 欄：時間
  - C 欄：地點名稱
  - D 欄：五段式資訊（Mapcode / 地址 / 電話 / 營業時間 / 🅿️）
  - E 欄：備注（含停留時間、交通時間描述）
- [ ] **樣式還原**：每日標題列底色對應 `color`，欄寬自動調整

#### 15-C 轉換腳本 `scripts/json_to_xlsx.py`（保留 Python 流程）

- [ ] **讀取 itinerary.json**（或指定路徑）產生 `.xlsx`
- [ ] **欄位對應與樣式**：與 15-B 一致
- [ ] **支援 `--json` 和 `--output` 參數**，可指定輸入輸出路徑

#### 15-D deploy.sh 整合

- [ ] 工具選單新增「JSON → xlsx」選項

### 兩種流程對比

```
PWA 流程（免安裝，適合一般使用者）：
  匯入 xlsx/json → PWA 內編輯 → 匯出 xlsx/json
  ⚠️ 不含 geocode / MapCode

Python 腳本流程（進階，適合首次建立行程）：
  xlsx → xlsx_to_json.py → geocode.py → mapcode.py → 匯入 PWA
  ✅ 完整座標 + MapCode
```

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

# 手動：GitHub Pages
git subtree split --prefix pwa -b gh-pages
git push origin gh-pages --force

# 手動：Netlify（需 netlify-cli）
netlify deploy --prod --dir pwa

# 手動：GitHub Release（需 gh CLI）
git archive HEAD:pwa --prefix=pwa/ --format=zip -o trip_helper_pwa.zip
gh release create v1.0.0 trip_helper_pwa.zip
```
