#!/usr/bin/env python3
"""
mapcode.py
使用 japanmapcode.com API 為 itinerary.json 中的每個地點補上 MapCode。

流程：經緯度 → MapCode
前置條件：stop 需有 lat / lng（可先執行 geocode.py）

特性：
  - 增量更新：已有 mapcode 的 stop 直接跳過
  - Rate limit：每次請求間隔 ≥ 0.5 秒（禮貌性限速）
  - 支援 --dry-run 僅顯示待處理清單
  - 支援 --force 強制覆蓋已有的 mapcode
"""

import json
import time
import sys
import os
import argparse
import requests

JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'pwa', 'data', 'itinerary.json')
MAPCODE_API = 'https://japanmapcode.com/mapcode'

# ── MapCode 查詢 ────────────────────────────────────────────────────
def fetch_mapcode(lat: float, lng: float) -> str | None:
    """從 japanmapcode.com 查詢 MapCode。"""
    try:
        r = requests.post(MAPCODE_API, data={'lat': str(lat), 'lng': str(lng)}, timeout=10)
        r.raise_for_status()
        result = r.text.strip()
        # API 回傳純文字 MapCode，例如 "33 095 245*87"
        if result and not result.startswith('{') and not result.startswith('<'):
            return result
        # 嘗試 JSON 回傳格式
        try:
            data = r.json()
            return data.get('mapcode', None)
        except (ValueError, AttributeError):
            pass
    except requests.RequestException as e:
        print(f'     ⚠️  HTTP 錯誤: {e}')
    return None

# ── 主程式 ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='查詢 itinerary.json 中各站點的 MapCode')
    parser.add_argument('--dry-run', action='store_true',
                        help='只列出待處理清單，不實際呼叫 API')
    parser.add_argument('--force', action='store_true',
                        help='強制覆蓋已有的 mapcode')
    parser.add_argument('--json', type=str, default=JSON_PATH,
                        help=f'JSON 檔案路徑（預設 {JSON_PATH}）')
    args = parser.parse_args()
    json_path = args.json

    if not os.path.isfile(json_path):
        print(f'❌ 找不到 {json_path}')
        sys.exit(1)

    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)

    # 收集待處理清單
    todo = []
    for day in data['days']:
        for stop in day['stops']:
            has_coords = stop.get('lat') is not None and stop.get('lng') is not None
            has_mapcode = bool(stop.get('mapcode'))
            if has_coords and (not has_mapcode or args.force):
                todo.append((day, stop))

    no_coords = sum(
        1 for day in data['days']
        for stop in day['stops']
        if stop.get('lat') is None
    )
    already_done = sum(
        1 for day in data['days']
        for stop in day['stops']
        if stop.get('mapcode')
    )

    print(f'🗺  待查詢 MapCode：{len(todo)} 個地點（已有：{already_done}，無座標跳過：{no_coords}）\n')

    if args.dry_run:
        for day, stop in todo:
            mc = f'  (現有: {stop["mapcode"]})' if stop.get('mapcode') else ''
            print(f'  [{day["label"]}] {stop["name"]}{mc}')
            print(f'         座標: ({stop["lat"]}, {stop["lng"]})')
        return

    if not todo:
        print('✅ 所有站點已有 MapCode，無需更新')
        return

    updated = 0
    failed = []

    for i, (day, stop) in enumerate(todo, 1):
        label = f'[{day["label"]}] {stop["name"]}'
        print(f'({i:02d}/{len(todo):02d}) {label}')
        print(f'         座標: ({stop["lat"]}, {stop["lng"]})')

        mapcode = fetch_mapcode(stop['lat'], stop['lng'])
        time.sleep(0.5)

        if mapcode:
            old = stop.get('mapcode', '')
            stop['mapcode'] = mapcode
            suffix = f' (舊: {old})' if old else ''
            print(f'         ✅ {mapcode}{suffix}\n')
            updated += 1
        else:
            print(f'         ❌ 查詢失敗\n')
            failed.append((day['label'], stop['name'], stop['lat'], stop['lng']))

        # 每 5 筆存一次
        if i % 5 == 0:
            _save(data, json_path)

    _save(data, json_path)

    print(f'{"─"*50}')
    print(f'✅ 成功更新：{updated} 個 MapCode')
    if failed:
        print(f'\n❌ 以下 {len(failed)} 個地點查詢失敗：')
        for label, name, lat, lng in failed:
            print(f'   [{label}] {name}  ({lat}, {lng})')


def _save(data: dict, path: str):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
