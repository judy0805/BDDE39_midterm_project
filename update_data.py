"""
更新網頁資料：從 MySQL 讀受試者、向環境部抓空汙，存成 data.json，網頁再讀 data.json 畫表格和圖表

用法（在 VS Code 終端機打）：
  python update_data.py                 → 只更新 data.json
  python update_data.py 新受試者.csv     → 先把 CSV 匯入 MySQL，再更新 data.json

第一次執行會自動建資料庫和表格。網頁照樣用 Live Server 開。
"""
import csv
import json
import os
import random
import re
import sys
from configparser import ConfigParser
from datetime import date, datetime

import pymysql
import requests

FOLDER = os.path.dirname(os.path.abspath(__file__))  # 這支程式所在的資料夾

# 讀取 config.ini 裡的設定（資料庫 [DB]、環境部 API key [MOENV]）
config = ConfigParser(interpolation=None)  # 密碼或 key 裡有 % 也不會出錯
config.read(os.path.join(FOLDER, 'config.ini'), encoding='utf-8')

# 資料庫裡的欄位（年齡、BMI 不存，每次更新 data.json 時才用生日、身高體重算）
BASIC_FIELDS = ['code', 'birthdate', 'sex', 'weight', 'height', 'cat', 'mmrc', 'sgrq']
# 本人病史：0=否, 1=是（cancer 另外是 0~20 的癌別代碼）
DISEASE_FIELDS = ['htn', 'dm', 'hyperlipidemia', 'heart', 'stroke', 'kidney', 'hbv', 'hcv',
                  'psyche', 'cancer', 'asthma', 'bronchitis', 'pneumonia', 'bronchiectasis',
                  'pul_embolism', 'allergic_rhinitis', 'allergic_conjunctivitis',
                  'atopic_dermatitis', 'urticaria']
FIELDS = BASIC_FIELDS + DISEASE_FIELDS


DB_NAME = config.get('DB', 'database', fallback='copd')  # 要用的資料庫名稱


def get_conn(use_db=True):
    """連線到 MySQL，回傳的每一筆資料是 dict（像 {'code': 'COPDCO001', 'sex': 'M', ...}）
    use_db=False：還沒建資料庫時用，先不指定資料庫"""
    return pymysql.connect(
        host=config.get('DB', 'host'),
        user=config.get('DB', 'user'),
        password=config.get('DB', 'password'),
        port=config.getint('DB', 'port'),
        database=DB_NAME if use_db else None,
        charset='utf8mb4',                    # 中文才不會變亂碼
        cursorclass=pymysql.cursors.DictCursor,
    )


def make_sample_subjects(n=30):
    """產生 n 筆範例受試者（固定亂數種子，每次產生的都一樣；不需要可以把 n 改成 0）"""
    rnd = random.Random(2026)
    rows = []
    for i in range(1, n + 1):
        sex = 'M' if rnd.random() < 0.75 else 'F'
        birthdate = date(rnd.randint(1944, 1972), rnd.randint(1, 12), rnd.randint(1, 28))
        height = round(rnd.gauss(1.66 if sex == 'M' else 1.55, 0.06), 2)
        weight = round(rnd.gauss(66 if sex == 'M' else 56, 9), 1)
        mmrc = rnd.choice([0, 1, 1, 2, 2, 2, 3, 3, 4])
        cat = max(0, min(40, round(5 + mmrc * 4 + rnd.gauss(0, 4))))
        sgrq = round(max(0, min(100, 8 + cat * 1.8 + rnd.gauss(0, 7))), 1)
        diseases = [1 if rnd.random() < p else 0 for p in
                    (0.45, 0.22, 0.30, 0.18, 0.08, 0.10, 0.10, 0.04, 0.06)]   # htn ~ psyche
        cancer = rnd.choice([1, 17, 3, 7]) if rnd.random() < 0.12 else 0       # 癌別代碼
        diseases += [cancer] + [1 if rnd.random() < p else 0 for p in
                                (0.20, 0.25, 0.30, 0.12, 0.03, 0.20, 0.08, 0.05, 0.06)]  # asthma ~ urticaria
        rows.append((f'COPDCO{i:03d}', birthdate, sex, weight, height, cat, mmrc, sgrq, *diseases))
    # 故意留幾個缺漏值，示範「有效樣本率」
    rows[4] = rows[4][:7] + (None,) + rows[4][8:]   # COPDCO005 沒有 SGRQ
    rows[11] = rows[11][:3] + (None,) + rows[11][4:]  # COPDCO012 沒有體重
    return rows


def init_db(add_samples=True):
    """啟動時自動執行：建立資料庫和資料表（已經有就跳過）；add_samples=False 就不放範例資料"""
    connection = get_conn(use_db=False)
    with connection, connection.cursor() as cursor:
        # 建立資料庫
        sql = f"""
        CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4;
        """
        cursor.execute(sql)

        # 建立新的問卷表格 subjects（舊的 patients 表格不動，資料還在）
        sql = f"""
        CREATE TABLE IF NOT EXISTS {DB_NAME}.subjects (
            code      VARCHAR(20) PRIMARY KEY,   -- 研究編號
            birthdate DATE,                      -- 生日（年齡由生日算）
            sex       CHAR(1),                   -- M=男, F=女
            weight    DECIMAL(5,1),              -- 體重（公斤）
            height    DECIMAL(4,2),              -- 身高（公尺）
            cat       INT,                       -- CAT 量表總分 0~40
            mmrc      INT,                       -- mMRC 0~4
            sgrq      DECIMAL(5,1),              -- 聖喬治呼吸問卷 0~100
            htn                     TINYINT,     -- 以下本人病史：0=否, 1=是
            dm                      TINYINT,
            hyperlipidemia          TINYINT,
            heart                   TINYINT,
            stroke                  TINYINT,
            kidney                  TINYINT,
            hbv                     TINYINT,
            hcv                     TINYINT,
            psyche                  TINYINT,
            cancer                  TINYINT,     -- 0=否, 1~20=癌別
            asthma                  TINYINT,
            bronchitis              TINYINT,
            pneumonia               TINYINT,
            bronchiectasis          TINYINT,
            pul_embolism            TINYINT,
            allergic_rhinitis       TINYINT,
            allergic_conjunctivitis TINYINT,
            atopic_dermatitis       TINYINT,
            urticaria               TINYINT
        );
        """
        cursor.execute(sql)

        # 表格是空的就放入範例資料（有給 CSV 時不放，避免假資料混進真資料）
        cursor.execute(f"SELECT COUNT(*) AS n FROM {DB_NAME}.subjects;")
        samples = make_sample_subjects()
        if cursor.fetchone()['n'] == 0 and samples and add_samples:
            cursor.executemany(
                f"INSERT INTO {DB_NAME}.subjects ({', '.join(FIELDS)}) "
                f"VALUES ({', '.join(['%s'] * len(FIELDS))})",
                samples,
            )
            print(f'已放入 {len(samples)} 筆範例資料')

        cursor.execute(f"SHOW TABLES FROM {DB_NAME};")
        print('資料庫已就緒：', cursor.fetchall())
        connection.commit()


def add_age_bmi(r):
    """把一筆資料整理成網頁能用的樣子，並算出年齡和 BMI"""
    for k in ('weight', 'height', 'sgrq'):          # MySQL 的 DECIMAL 轉成一般數字
        if r[k] is not None:
            r[k] = float(r[k])
    b = r['birthdate']
    if b is not None:
        today = date.today()
        # 年齡 = 今天 - 生日（今年生日還沒過就再減 1）
        r['age'] = today.year - b.year - ((today.month, today.day) < (b.month, b.day))
        r['birthdate'] = b.strftime('%Y-%m-%d')
    else:
        r['age'] = None
    # BMI = 體重(kg) / 身高(m) 的平方
    if r['weight'] and r['height']:
        r['bmi'] = round(r['weight'] / r['height'] ** 2, 1)
    else:
        r['bmi'] = None
    return r


# ===== CSV 匯入：把 CSV 裡的受試者寫進 MySQL =====
# CSV 第一列的變項名稱 → 資料庫欄位（大小寫、空格、底線不影響；Age、BMI 欄會略過，程式自己算）
CSV_COLUMNS = {f.replace('_', ''): f for f in FIELDS}
CSV_COLUMNS.update({'beonchitis': 'bronchitis', 'allergicchonjunctivitis': 'allergic_conjunctivitis'})  # 原本的拼法也認得


def normalize_date(text):
    """生日：1955/3/7、1955-03-07 都可以，統一成 1955-03-07；看不懂就回傳 None"""
    m = re.match(r'(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})', text.strip())
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3])).isoformat()  # 13 月、2/30 這種不存在的日期也算看不懂
    except ValueError:
        return None


def normalize_sex(text):
    """性別：M/F、男/女 都可以"""
    t = text.strip().upper()
    return {'M': 'M', '男': 'M', 'F': 'F', '女': 'F'}.get(t)


def to_number(text, kind=float):
    """空白就存 NULL（缺漏），有填才轉成數字"""
    text = text.strip()
    if not text:
        return None
    try:
        return kind(float(text))
    except ValueError:
        print(f'  ⚠ 「{text}」不是數字，存成空白')
        return None


def import_csv(path):
    """讀 CSV，一筆一筆寫進 MySQL；編號已經有的人用 CSV 的新內容更新；CSV 裡沒有的人問過再刪除"""
    rows = []
    # utf-8-sig：Excel 存的 CSV 開頭有隱藏符號，這樣讀才不會出錯
    with open(path, encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f)
        header = [CSV_COLUMNS.get(h.strip().lower().replace(' ', '').replace('_', '')) for h in next(reader)]
        if 'code' not in header:
            sys.exit('CSV 第一列找不到 Code（研究編號）欄位，請參考範本檔')
        for row_number, line in enumerate(reader, start=2):   # 第 1 列是標題，資料從 Excel 第 2 列開始
            raw = {key: (line[i] if i < len(line) else '') for i, key in enumerate(header) if key}
            if not raw.get('code', '').strip():
                continue
            p = {
                'code': raw['code'].strip(),
                'row': row_number,   # 記住在 Excel 第幾列，警告時用
                'birthdate': normalize_date(raw.get('birthdate', '')),
                'sex': normalize_sex(raw.get('sex', '')),
                'weight': to_number(raw.get('weight', '')),
                'height': to_number(raw.get('height', '')),
                'cat': to_number(raw.get('cat', ''), int),
                'mmrc': to_number(raw.get('mmrc', ''), int),
                'sgrq': to_number(raw.get('sgrq', '')),
            }
            if p['height'] and p['height'] > 3:   # 身高填成公分（例 165）就換成公尺
                p['height'] = round(p['height'] / 100, 2)
            for d in DISEASE_FIELDS:
                p[d] = to_number(raw.get(d, ''), int)
            if raw.get('birthdate', '').strip() and not p['birthdate']:
                print(f"  ⚠ {p['code']} 的生日「{raw['birthdate']}」看不懂，存成空白")
            rows.append(p)

    # CSV 裡同一個編號出現兩次以上：不知道該用哪一列，整個檔案都先不匯入，請使用者改好
    rows_of_code = {}
    for p in rows:
        rows_of_code.setdefault(p['code'], []).append(p['row'])
    duplicates = {code: nums for code, nums in rows_of_code.items() if len(nums) > 1}
    if duplicates:
        print('⚠⚠ CSV 裡有重複的研究編號，這次全部沒有匯入，請改好再執行一次：')
        for code, nums in duplicates.items():
            print(f"   {code} 出現在 Excel 第 {'、'.join(str(n) for n in nums)} 列")
        sys.exit(1)

    # 編號重複時（ON DUPLICATE KEY）不新增，改成把其他欄位更新成 CSV 的新值
    update_part = ', '.join(f'{c} = VALUES({c})' for c in FIELDS if c != 'code')
    sql = (f"INSERT INTO subjects ({', '.join(FIELDS)}) "
           f"VALUES ({', '.join(['%s'] * len(FIELDS))}) "
           f"ON DUPLICATE KEY UPDATE {update_part}")
    added, updated, failed = [], [], []
    connection = get_conn()
    with connection, connection.cursor() as cursor:
        for p in rows:
            try:
                changed = cursor.execute(sql, [p[f] for f in FIELDS])   # 1 = 新增，2 = 更新，0 = 內容完全一樣
                if changed == 1:
                    added.append(p['code'])
                elif changed == 2:
                    updated.append(p['code'])
            except (pymysql.err.DataError, pymysql.err.OperationalError) as err:
                failed.append(f"{p['code']}（{err.args[-1]}）")  # 數值格式不對
        connection.commit()
    print(f'CSV 匯入完成：新增 {len(added)} 筆，更新 {len(updated)} 筆')
    if added:
        print(f'  新增了這些人：{", ".join(added)}')
    if updated:
        print(f'  更新了這些人的資料：{", ".join(updated)}')
    for msg in failed:
        print(f'  ⚠ 格式不對，沒有匯入：{msg}')

    # 資料庫裡有、但 CSV 裡已經沒有的人 → 問過使用者後刪除
    csv_codes = set(rows_of_code)
    connection = get_conn()
    with connection, connection.cursor() as cursor:
        cursor.execute('SELECT code FROM subjects ORDER BY code')
        missing = [r['code'] for r in cursor.fetchall() if r['code'] not in csv_codes]
        if not missing:
            return
        print(f'  ⚠ 這 {len(missing)} 人在資料庫裡有，但 CSV 裡沒有：{", ".join(missing)}')
        answer = input('  要從資料庫刪除他們嗎？輸入 y 刪除，直接按 Enter 保留：')
        if answer.strip().lower() != 'y':
            print('  已保留，沒有刪除')
            return
        cursor.executemany('DELETE FROM subjects WHERE code = %s', missing)
        connection.commit()
    print(f'  刪除了這些人：{", ".join(missing)}')


# ===== 空汙資料：用 config.ini 的 API key 向環境部要資料 =====
# 優先用「即時」資料集 aqx_p_432（跟空氣品質監測網同步，整點過後很快就更新）
# 抓不到的話，再改用原本的「小時值」資料集 aqx_p_245（比較晚才更新，常常慢一小時）
AQ_REALTIME_URL = 'https://data.moenv.gov.tw/api/v2/aqx_p_432'  # 空氣品質指標(AQI)，全台測站即時值
AQ_HOURLY_URL = 'https://data.moenv.gov.tw/api/v2/aqx_p_245'    # 空氣品質小時值_高雄市_小港站
AQ_SITE = '小港'
# 即時資料集裡的欄位名稱 → 看板上顯示的名稱、單位（想增減看板上的項目，改這裡就好）
AQ_REALTIME_ITEMS = [
    ('aqi', 'AQI', ''),
    ('pm2.5', 'PM2.5', 'μg/m3'), ('pm2.5_avg', 'PM2.5 移動平均', 'μg/m3'),
    ('pm10', 'PM10', 'μg/m3'), ('pm10_avg', 'PM10 移動平均', 'μg/m3'),
    ('o3', 'O3', 'ppb'), ('o3_8hr', 'O3 8小時平均', 'ppb'),
    ('co', 'CO', 'ppm'), ('co_8hr', 'CO 8小時平均', 'ppm'),
    ('so2', 'SO2', 'ppb'), ('so2_avg', 'SO2 移動平均', 'ppb'),
    ('no2', 'NO2', 'ppb'), ('nox', 'NOx', 'ppb'), ('no', 'NO', 'ppb'),
    ('wind_speed', '風速', 'm/s'), ('wind_direc', '風向', '度'),
]


def fetch_realtime(api_key):
    """抓即時資料，挑出小港站，整理成跟小時值一樣的格式（網頁就不用改）"""
    params = {'api_key': api_key, 'language': 'zh', 'limit': 1000, 'format': 'JSON'}
    res = requests.get(AQ_REALTIME_URL, params=params, timeout=15)
    res.raise_for_status()
    data = res.json()
    rows = data if isinstance(data, list) else data.get('records', [])
    site = next((r for r in rows if r.get('sitename') == AQ_SITE), None)
    if site is None:
        raise ValueError(f'即時資料裡找不到{AQ_SITE}站')  # 出錯就改用小時值
    # publishtime 像 '2026/10/12 15:00:00'，改成 '2026-10-12 15:00'
    time = site['publishtime'].replace('/', '-')[:16]
    return [{'county': site['county'], 'sitename': site['sitename'], 'siteid': site['siteid'],
             'itemengname': name, 'itemunit': unit, 'concentration': site.get(key, ''),
             'monitordate': time,
             'status': site.get('status', ''),          # 空氣品質狀態，例如「普通」
             'pollutant': site.get('pollutant', '')}    # 主要污染物，例如「細懸浮微粒」
            for key, name, unit in AQ_REALTIME_ITEMS]


def fetch_hourly(api_key):
    """抓小時值資料（原本的做法）"""
    params = {
        'api_key': api_key,
        'language': 'zh',
        'limit': 60,
        'sort': 'monitordate desc',  # 由新到舊，前 60 筆一定是最新的
        'format': 'JSON',
    }
    res = requests.get(AQ_HOURLY_URL, params=params, timeout=15)
    res.raise_for_status()
    data = res.json()
    return data if isinstance(data, list) else data.get('records', [])


def get_air_quality():
    """抓空汙資料；抓不到就把原因記下來，網頁會顯示"""
    api_key = config.get('MOENV', 'api_key', fallback='')
    if not api_key:
        return {'error': 'config.ini 裡找不到 [MOENV] 的 api_key'}
    # 用 requests 抓（它自帶憑證清單，不會遇到 Windows 的 SSL 憑證問題）
    try:
        return {'records': fetch_realtime(api_key)}
    except Exception as err:
        print('即時資料抓不到，改用小時值：', err)
    try:
        return {'records': fetch_hourly(api_key)}
    except Exception as err:
        return {'error': f'環境部 API 連線失敗：{err}'}


def get_subjects():
    """讀出全部受試者（附上算好的年齡、BMI）"""
    connection = get_conn()
    with connection, connection.cursor() as cursor:
        cursor.execute('SELECT * FROM subjects ORDER BY code')
        rows = cursor.fetchall()
    return [add_age_bmi(r) for r in rows]


if __name__ == '__main__':
    init_db(add_samples=len(sys.argv) == 1)  # 先確認資料庫和表格都建好了；有給 CSV 就不放範例資料

    if len(sys.argv) > 1:      # 有給 CSV 檔名就先匯入
        if not os.path.exists(sys.argv[1]):
            print(f'找不到 {sys.argv[1]}：請確認檔名打對（要含 .csv），而且檔案和 update_data.py 放在同一個資料夾')
            sys.exit(1)
        import_csv(sys.argv[1])

    subjects = get_subjects()
    air = get_air_quality()
    data = {
        'updated': datetime.now().strftime('%Y-%m-%d %H:%M'),  # 這次更新的時間
        'subjects': subjects,
        'air_quality': air,
    }
    with open(os.path.join(FOLDER, 'data.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    print(f'受試者 {len(subjects)} 筆')
    print('空汙：' + (air['error'] if 'error' in air else f"{len(air['records'])} 項"))
    print('已存成 data.json，網頁重新整理就會看到新資料')
