#!/usr/bin/env bash
# deploy.sh — 行程查詢 PWA 部署選單

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PWA="$ROOT/pwa"

# ── 顏色 ─────────────────────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

# ── 選單 ─────────────────────────────────────────────────────────────────
print_menu() {
    clear
    echo -e "${BOLD}╔══════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}║     行程查詢 PWA — 部署選單          ║${RESET}"
    echo -e "${BOLD}╚══════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "${CYAN}── 本地部署 ─────────────────────────────${RESET}"
    echo "  1) HTTP       http://localhost:8080   （快速測試）"
    echo "  2) HTTPS      https://localhost:8443  （PWA 完整功能）"
    echo "  3) HTTPS + Android  adb 轉發到手機    （本機安裝）"
    echo ""
    echo -e "${DIM}── 遠端部署 （即將支援）─────────────────${RESET}"
    echo -e "${DIM}  4) GitHub Pages   git subtree push${RESET}"
    echo -e "${DIM}  5) Netlify        CLI 一鍵部署${RESET}"
    echo -e "${DIM}  6) GitHub Release 打包 ZIP 上傳${RESET}"
    echo ""
    echo "  q) 離開"
    echo ""
    echo -n "請輸入選項 [1-3, q]： "
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

# ── 1) HTTP ──────────────────────────────────────────────────────────────
serve_http() {
    local port
    port=$(find_free_port "${HTTP_PORT:-8080}")
    echo -e "\n${GREEN}▶ 啟動 HTTP 伺服器${RESET}  →  http://localhost:${port}"
    echo -e "${DIM}   Serving: $PWA${RESET}"
    echo -e "${DIM}   按 Ctrl+C 停止${RESET}\n"
    python3 -m http.server "$port" --directory "$PWA"
}

# ── 2) HTTPS ─────────────────────────────────────────────────────────────
serve_https() {
    echo -e "\n${GREEN}▶ 啟動 HTTPS 伺服器${RESET}  →  https://localhost:8443"
    echo -e "${DIM}   （首次啟動會產生自簽憑證，瀏覽器需手動接受）${RESET}"
    echo -e "${DIM}   按 Ctrl+C 停止${RESET}\n"
    python3 "$ROOT/serve_https.py"
}

# ── 3) HTTPS + adb ───────────────────────────────────────────────────────
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

# ── 預留：遠端部署 ───────────────────────────────────────────────────────
deploy_gh_pages() {
    # TODO: git subtree push --prefix pwa origin gh-pages
    echo -e "${YELLOW}⚠ GitHub Pages 部署尚未實作${RESET}"
    read -rp $'\n按 Enter 返回選單…'
}

deploy_netlify() {
    # TODO: netlify deploy --prod --dir pwa
    echo -e "${YELLOW}⚠ Netlify 部署尚未實作${RESET}"
    read -rp $'\n按 Enter 返回選單…'
}

deploy_release() {
    # TODO: zip -r trip_helper_pwa.zip pwa/ && gh release create ...
    echo -e "${YELLOW}⚠ GitHub Release 部署尚未實作${RESET}"
    read -rp $'\n按 Enter 返回選單…'
}

# ── 主迴圈 ───────────────────────────────────────────────────────────────
main() {
    while true; do
        print_menu
        read -r choice
        case "$choice" in
            1) serve_http    ;;
            2) serve_https   ;;
            3) serve_android ;;
            4) deploy_gh_pages ;;
            5) deploy_netlify  ;;
            6) deploy_release  ;;
            q|Q) echo -e "\n${DIM}Bye!${RESET}\n"; exit 0 ;;
            *) echo -e "${RED}無效選項${RESET}"; sleep 1 ;;
        esac
    done
}

main
