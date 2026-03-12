#!/usr/bin/env python3
"""
geocode.py
使用 Nominatim（OpenStreetMap）為 itinerary.json 中的每個地點補上 lat / lng。

特性：
  - 增量更新：已有座標的 stop 直接跳過
  - Rate limit：每次請求間隔 ≥ 1.1 秒（Nominatim 政策）
  - 地址預處理：移除郵遞區號前綴、移除括號說明文字
  - 失敗的地點印出清單供手動補正
  - 支援 --dry-run 僅顯示待處理清單不實際請求
"""

import re
import json
import time
import sys
import os
import argparse
import requests

JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'pwa', 'data', 'itinerary.json')
NOMINATIM  = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'okinawa-trip-pwa/1.0 (personal travel planning app)'

# ── 地址預處理 ────────────────────────────────────────────────────────
def clean_address(raw: str) -> str:
    """清理地址字串，提高 Nominatim 解析成功率。"""
    s = raw.strip()
    # 移除郵遞區號：〒900-0014 → ''
    s = re.sub(r'〒\d{3}-\d{4}\s*', '', s)
    # 移除括號說明：（縣廳前交叉口至安里三叉路，全長約1.6km）
    s = re.sub(r'[（(][^）)]{0,60}[）)]', '', s)
    # 移除建築名稱後段（太細可能導致找不到）
    # e.g. "JUNテナント2F" → 只保留到門牌號
    s = re.sub(r'\s*([\d]+F|[A-Z]棟|号棟|テナント.*|ビル.*|会舘.*|會舘.*)', '', s)
    return s.strip()

# ── Nominatim 請求 ────────────────────────────────────────────────────
def geocode_once(address: str) -> tuple[float | None, float | None]:
    params = {
        'q':            address,
        'format':       'json',
        'limit':        1,
        'countrycodes': 'jp',
        'addressdetails': 0,
    }
    try:
        r = requests.get(NOMINATIM, params=params,
                         headers={'User-Agent': USER_AGENT}, timeout=10)
        r.raise_for_status()
        hits = r.json()
        if hits:
            return float(hits[0]['lat']), float(hits[0]['lon'])
    except requests.RequestException as e:
        print(f'     ⚠️  HTTP 錯誤: {e}')
    return None, None

def geocode(address: str) -> tuple[float | None, float | None]:
    """先嘗試完整地址，失敗則縮短後重試一次。"""
    cleaned = clean_address(address)
    lat, lng = geocode_once(cleaned)
    if lat is not None:
        return lat, lng

    # 縮短：只保留「沖縄県 + 市町村 + 大字/丁目」
    # e.g. "沖縄県名護市宮里7-23-25" → "沖縄県名護市宮里"
    short = re.sub(r'(\d+[-－]\d+[-－]?\d*)', '', cleaned).strip()
    if short != cleaned:
        time.sleep(1.1)
        lat, lng = geocode_once(short)

    return lat, lng

# ── 主程式 ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Geocode itinerary.json stops')
    parser.add_argument('--dry-run', action='store_true',
                        help='只列出待處理清單，不實際呼叫 API')
    args = parser.parse_args()

    with open(JSON_PATH, encoding='utf-8') as f:
        data = json.load(f)

    # 收集待處理清單
    todo = [
        (day, stop)
        for day in data['days']
        for stop in day['stops']
        if stop.get('address') and stop.get('lat') is None
    ]

    already_done = sum(
        1 for day in data['days']
        for stop in day['stops']
        if stop.get('lat') is not None
    )

    print(f'📍 待地理編碼：{len(todo)} 個地點（已完成：{already_done}）\n')

    if args.dry_run:
        for day, stop in todo:
            print(f'  [{day["label"]}] {stop["name"]}')
            print(f'         地址: {stop["address"]}')
        return

    updated = 0
    failed  = []

    for i, (day, stop) in enumerate(todo, 1):
        label = f'[{day["label"]}] {stop["name"]}'
        print(f'({i:02d}/{len(todo):02d}) {label}')
        print(f'         地址: {stop["address"]}')

        lat, lng = geocode(stop['address'])
        time.sleep(1.1)  # 無論成功失敗都等待

        if lat is not None:
            stop['lat'] = round(lat, 6)
            stop['lng'] = round(lng, 6)
            print(f'         ✅ ({stop["lat"]}, {stop["lng"]})\n')
            updated += 1
        else:
            print(f'         ❌ 找不到座標\n')
            failed.append((day['label'], stop['name'], stop['address']))

        # 每 5 筆存一次，防止中途中斷遺失進度
        if i % 5 == 0:
            _save(data)

    _save(data)

    print(f'{"─"*50}')
    print(f'✅ 成功更新：{updated} 個地點')
    if failed:
        print(f'\n❌ 以下 {len(failed)} 個地點需手動補正 lat / lng：')
        print('   （直接在 itinerary.json 對應 stop 填入 "lat": X, "lng": Y）\n')
        for label, name, addr in failed:
            print(f'   [{label}] {name}')
            print(f'            地址: {addr}')

def _save(data: dict):
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
