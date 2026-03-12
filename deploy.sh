#!/usr/bin/env bash
# deploy.sh — 行程查詢 PWA 工具選單

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PWA="$ROOT/pwa"
SCRIPTS="$ROOT/scripts"

# ── 顏色 ─────────────────────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

# ── 選單 ─────────────────────────────────────────────────────────────────
print_menu() {
    clear
    echo -e "${BOLD}╔══════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}║      行程查詢 PWA — 工具選單         ║${RESET}"
    echo -e "${BOLD}╚══════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "${MAGENTA}── 轉換 ──────────────────────────────────${RESET}"
    echo "  1) xlsx → JSON     Excel 轉行程資料"
    echo "  2) 地理編碼         補上座標（需網路）"
    echo "  3) MapCode 查詢    補上 MapCode（需網路+座標）"
    echo "  4) 完整流程         xlsx → JSON → 地理編碼 → MapCode"
    echo ""
    echo -e "${CYAN}── 部署 ──────────────────────────────────${RESET}"
    echo -e "${CYAN}   本地${RESET}"
    echo "  5) HTTP             http://localhost:8080   （快速測試）"
    echo "  6) HTTPS            https://localhost:8443  （PWA 完整功能）"
    echo "  7) HTTPS + Android  adb 轉發到手機          （本機安裝）"
    echo ""
    echo -e "${CYAN}   遠端${RESET}"
    echo "  8) GitHub Pages     gh-pages 分支部署"
    echo "  9) Netlify          CLI 一鍵部署"
    echo "  0) GitHub Release   打包 ZIP 上傳"
    echo ""
    echo "  q) 離開"
    echo ""
    echo -n "請輸入選項 [0-9, q]： "
}

# ── 工具：找可用 port ────────────────────────────────────────────────────
find_free_port() {
    local port="$1"
    while lsof -iTCP:"$port" -sTCP:LISTEN -t &>/dev/null; do
        echo -e "${YELLOW}  ⚠ Port ${port} 已被佔用，嘗試 $((port+1))…${RESET}" >&2
        (( port++ ))
    done
    echo "$port"
}

# ── 工具：檢查 Python 套件 ───────────────────────────────────────────────
check_pkg() {
    python3 -c "import $1" 2>/dev/null
}

# ── 1) xlsx → JSON ───────────────────────────────────────────────────────
convert_xlsx() {
    echo -e "\n${GREEN}▶ xlsx → JSON 轉換${RESET}"

    if ! check_pkg openpyxl; then
        echo -e "${YELLOW}  安裝 openpyxl…${RESET}"
        pip install openpyxl
    fi

    local xlsx
    xlsx=$(ls "$ROOT"/*.xlsx 2>/dev/null | head -1 || true)
    if [[ -z "$xlsx" ]]; then
        echo -e "${RED}✗ 找不到 .xlsx 檔案（應放在專案根目錄）${RESET}"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    echo -e "  來源：${BOLD}$(basename "$xlsx")${RESET}"
    echo -e "  輸出：${BOLD}pwa/data/itinerary.json${RESET}\n"
    python3 "$SCRIPTS/xlsx_to_json.py"
    echo -e "\n${GREEN}  ✓ 轉換完成${RESET}"
    read -rp $'\n按 Enter 返回選單…'
}

# ── 2) 地理編碼 ───────────────────────────────────────────────────────────
run_geocode() {
    echo -e "\n${GREEN}▶ 地理編碼（Nominatim）${RESET}"

    if ! check_pkg requests; then
        echo -e "${YELLOW}  安裝 requests…${RESET}"
        pip install requests
    fi

    local json_path="$PWA/data/itinerary.json"
    if [[ ! -f "$json_path" ]]; then
        echo -e "${RED}✗ 找不到 pwa/data/itinerary.json，請先執行選項 1${RESET}"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    echo -e "${DIM}  每次請求間隔 ≥ 1.1 秒（Nominatim 政策），請耐心等待${RESET}\n"
    python3 "$SCRIPTS/geocode.py"
    echo -e "\n${GREEN}  ✓ 地理編碼完成${RESET}"
    read -rp $'\n按 Enter 返回選單…'
}

# ── 3) MapCode 查詢 ──────────────────────────────────────────────────────
run_mapcode() {
    echo -e "\n${GREEN}▶ MapCode 查詢（japanmapcode.com）${RESET}"

    if ! check_pkg requests; then
        echo -e "${YELLOW}  安裝 requests…${RESET}"
        pip install requests
    fi

    local json_path="$PWA/data/itinerary.json"
    if [[ ! -f "$json_path" ]]; then
        echo -e "${RED}✗ 找不到 pwa/data/itinerary.json，請先執行選項 1${RESET}"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    echo -e "${DIM}  需有座標（lat/lng）才能查詢，請先執行地理編碼${RESET}\n"
    python3 "$SCRIPTS/mapcode.py"
    echo -e "\n${GREEN}  ✓ MapCode 查詢完成${RESET}"
    read -rp $'\n按 Enter 返回選單…'
}

# ── 4) 完整流程 ───────────────────────────────────────────────────────────
convert_full() {
    echo -e "\n${GREEN}▶ 完整流程：xlsx → JSON → 地理編碼 → MapCode${RESET}\n"
    convert_xlsx
    echo ""
    run_geocode
    echo ""
    run_mapcode
}

# ── 5) HTTP ──────────────────────────────────────────────────────────────
serve_http() {
    local port
    port=$(find_free_port "${HTTP_PORT:-8080}")
    echo -e "\n${GREEN}▶ 啟動 HTTP 伺服器${RESET}  →  http://localhost:${port}"
    echo -e "${DIM}   Serving: $PWA${RESET}"
    echo -e "${DIM}   按 Ctrl+C 停止${RESET}\n"
    python3 -m http.server "$port" --directory "$PWA"
}

# ── 6) HTTPS ─────────────────────────────────────────────────────────────
serve_https() {
    echo -e "\n${GREEN}▶ 啟動 HTTPS 伺服器${RESET}  →  https://localhost:8443"
    echo -e "${DIM}   （首次啟動會產生自簽憑證，瀏覽器需手動接受）${RESET}"
    echo -e "${DIM}   按 Ctrl+C 停止${RESET}\n"
    python3 "$ROOT/serve_https.py"
}

# ── 7) HTTPS + adb ───────────────────────────────────────────────────────
serve_android() {
    echo -e "\n${GREEN}▶ HTTPS + Android adb 轉發${RESET}"

    if ! command -v adb &>/dev/null; then
        echo -e "${RED}✗ 找不到 adb，請先安裝 Android Platform Tools${RESET}"
        echo "  macOS: brew install android-platform-tools"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    local devices
    devices=$(adb devices | grep -v "List of devices" | grep "device$" | wc -l | tr -d ' ')
    if [[ "$devices" -eq 0 ]]; then
        echo -e "${YELLOW}⚠ 未偵測到 Android 裝置，請確認：${RESET}"
        echo "  1. 手機已開啟「開發人員選項 → USB 偵錯」"
        echo "  2. USB 線已連接並選擇「傳輸檔案」模式"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    echo -e "  偵測到 ${BOLD}${devices}${RESET} 台裝置"
    echo -e "  執行 adb reverse tcp:8443 tcp:8443 …"
    adb reverse tcp:8443 tcp:8443
    echo -e "${GREEN}  ✓ 轉發完成${RESET}"
    echo ""
    echo "  手機 Chrome 開啟：https://localhost:8443"
    echo -e "${DIM}  （需接受憑證警告 → 點「進階」→「繼續前往」）${RESET}"
    echo ""
    echo -e "${GREEN}▶ 啟動 HTTPS 伺服器…${RESET} 按 Ctrl+C 停止"
    echo ""
    python3 "$ROOT/serve_https.py"
}

# ── 8) GitHub Pages ──────────────────────────────────────────────────────
deploy_gh_pages() {
    echo -e "\n${GREEN}▶ 部署到 GitHub Pages${RESET}"

    if ! command -v gh &>/dev/null; then
        echo -e "${RED}✗ 找不到 gh CLI，請先安裝：brew install gh${RESET}"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    # Check for uncommitted changes in pwa/
    if ! git diff --quiet HEAD -- pwa/; then
        echo -e "${YELLOW}⚠ pwa/ 有未提交的變更，請先 commit${RESET}"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    # Check remote
    local remote_url
    remote_url=$(git remote get-url origin 2>/dev/null || true)
    if [[ -z "$remote_url" ]]; then
        echo -e "${RED}✗ 找不到 origin remote，請先設定：git remote add origin <url>${RESET}"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    echo -e "  Remote: ${BOLD}${remote_url}${RESET}"
    echo -e "  分支：  ${BOLD}gh-pages${RESET}"
    echo -e "  內容：  ${BOLD}pwa/${RESET}（不含私人資料）\n"

    # Use subtree split + force push for reliability
    echo -e "${DIM}  建立 gh-pages 分支…${RESET}"
    git subtree split --prefix pwa -b gh-pages 2>/dev/null || {
        # Branch exists, recreate
        git branch -D gh-pages 2>/dev/null
        git subtree split --prefix pwa -b gh-pages
    }

    echo -e "${DIM}  推送至 origin/gh-pages…${RESET}"
    git push origin gh-pages --force

    # Enable GitHub Pages via API
    local repo_name
    repo_name=$(echo "$remote_url" | sed -E 's#.*[:/]##; s#\.git$##')
    echo -e "${DIM}  設定 GitHub Pages（gh-pages 分支 / root）…${RESET}"
    gh api "repos/${repo_name}/pages" \
        --method POST \
        -f "source[branch]=gh-pages" \
        -f "source[path]=/" 2>/dev/null || \
    gh api "repos/${repo_name}/pages" \
        --method PUT \
        -f "source[branch]=gh-pages" \
        -f "source[path]=/" 2>/dev/null || true

    local pages_url="https://$(echo "$repo_name" | cut -d/ -f1).github.io/$(echo "$repo_name" | cut -d/ -f2)/"
    echo -e "\n${GREEN}  ✓ 部署完成！${RESET}"
    echo -e "  URL: ${BOLD}${pages_url}${RESET}"
    echo -e "${DIM}  （首次部署可能需要幾分鐘才能生效）${RESET}"
    read -rp $'\n按 Enter 返回選單…'
}

# ── 9) Netlify ───────────────────────────────────────────────────────────
deploy_netlify() {
    echo -e "\n${GREEN}▶ 部署到 Netlify${RESET}"

    if ! command -v netlify &>/dev/null; then
        echo -e "${RED}✗ 找不到 netlify CLI${RESET}"
        echo "  安裝：npm install -g netlify-cli"
        echo "  登入：netlify login"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    # Create a clean temp directory (only git-tracked files)
    local tmpdir
    tmpdir=$(mktemp -d)
    echo -e "  建立部署目錄（排除私人資料）…"
    git archive HEAD:pwa | tar -x -C "$tmpdir"

    echo -e "  部署目錄：${BOLD}${tmpdir}${RESET}"
    echo -e "  內容：pwa/（僅 git 追蹤的檔案）\n"

    echo -e "${DIM}  執行 netlify deploy --prod …${RESET}\n"
    netlify deploy --prod --dir "$tmpdir"

    rm -rf "$tmpdir"
    echo -e "\n${GREEN}  ✓ 部署完成！${RESET}"
    read -rp $'\n按 Enter 返回選單…'
}

# ── 0) GitHub Release ────────────────────────────────────────────────────
deploy_release() {
    echo -e "\n${GREEN}▶ 打包 ZIP 並建立 GitHub Release${RESET}"

    if ! command -v gh &>/dev/null; then
        echo -e "${RED}✗ 找不到 gh CLI，請先安裝：brew install gh${RESET}"
        read -rp $'\n按 Enter 返回選單…'
        return
    fi

    # Determine version tag
    local latest_tag
    latest_tag=$(git tag --sort=-v:refname | head -1 || true)
    local suggested="v1.0.0"
    if [[ -n "$latest_tag" ]]; then
        # Auto-increment patch version
        local base="${latest_tag#v}"
        local major minor patch
        IFS='.' read -r major minor patch <<< "$base"
        suggested="v${major}.${minor}.$((patch + 1))"
    fi

    echo -n "  版本標籤 [${suggested}]： "
    read -r tag
    tag="${tag:-$suggested}"

    # Create zip from git archive (only tracked files, no private data)
    local zip_name="trip_helper_pwa_${tag}.zip"
    local zip_path="$ROOT/${zip_name}"
    echo -e "\n  打包 ${BOLD}${zip_name}${RESET}（僅 git 追蹤的檔案）…"
    git archive HEAD:pwa --prefix=pwa/ --format=zip -o "$zip_path"

    echo -e "  大小：$(du -h "$zip_path" | cut -f1)"

    # Create tag and release
    echo -e "\n${DIM}  建立 tag: ${tag}…${RESET}"
    git tag "$tag" 2>/dev/null || {
        echo -e "${YELLOW}  Tag ${tag} 已存在，覆蓋${RESET}"
        git tag -d "$tag" >/dev/null
        git tag "$tag"
    }
    git push origin "$tag" --force

    echo -e "${DIM}  建立 GitHub Release…${RESET}"
    gh release create "$tag" "$zip_path" \
        --title "行程查詢 PWA ${tag}" \
        --notes "行程查詢 PWA 離線版，解壓後用瀏覽器開啟 pwa/index.html 或部署至任意靜態伺服器。" \
        --latest

    rm -f "$zip_path"
    echo -e "\n${GREEN}  ✓ Release 建立完成！${RESET}"
    echo -e "  $(gh release view "$tag" --json url -q .url)"
    read -rp $'\n按 Enter 返回選單…'
}

# ── 主迴圈 ───────────────────────────────────────────────────────────────
main() {
    while true; do
        print_menu
        read -r choice
        case "$choice" in
            1) convert_xlsx    ;;
            2) run_geocode     ;;
            3) run_mapcode     ;;
            4) convert_full    ;;
            5) serve_http      ;;
            6) serve_https     ;;
            7) serve_android   ;;
            8) deploy_gh_pages ;;
            9) deploy_netlify  ;;
            0) deploy_release  ;;
            q|Q) echo -e "\n${DIM}Bye!${RESET}\n"; exit 0 ;;
            *) echo -e "${RED}無效選項${RESET}"; sleep 1 ;;
        esac
    done
}

main
