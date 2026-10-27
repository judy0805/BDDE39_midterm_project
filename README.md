# 醫療數據自動化分析與期刊圖表生成系統

把 COPD（慢性阻塞性肺病）受試者的問卷資料，自動整理成**期刊論文常用的 Table 1、統計圖表和結果摘要**，並可一鍵匯出 **SAS 腳本**，讓網頁算出的結果可以在 SAS 裡重算、對照。頁面上方另有高雄**小港測站的即時空氣品質看板**。

> 版本：v1.0-mvp（2026-10-19），2026-10-27 起統計方法改為與 SAS 一致，並拿掉相關係數熱圖。

---

## 功能

| 功能 | 說明 |
|---|---|
| 基本資料看板 | 總受試者人數、整體有效樣本率，可逐一查看每個變項的有效／缺漏人數 |
| 自訂臨床分組 | 選一個變項分成兩組：連續變項自己輸入切點（例：年齡 < 65 vs ≥ 65、BMI 24、CAT 10），性別、病史則直接分「男／女」「無／有」 |
| Table 1 基本特徵表 | 顯示 Total 與兩組的數值及 P 值：連續變項為平均 ± 標準差，類別變項為人數 (%) |
| 圖 1：箱型圖 | 比較兩組某個數值的分佈（中位數、四分位、鬚線），每位受試者畫成半透明的點疊在箱子上，並標出兩組比較的 P 值 |
| 圖 2：線性迴歸散佈圖 | 自選 X、Y 兩個變項，畫出散佈點和迴歸線，計算斜率 β、95% 信賴區間與 P 值（Crude analysis，未校正其他變項） |
| 自動結果摘要 | 依目前的分組和圖表，自動寫出一段中文 Results 段落，可一鍵複製 |
| 一鍵匯出 SAS 腳本 | 依畫面上選的分組變項、切點、圖 2 的 X 和 Y，產生 `.sas` 檔（PROC TTEST、PROC FREQ、PROC REG） |
| 空氣品質看板 | 環境部小港測站的 AQI、PM2.5、PM10 等數值與更新時間（只供參考，**不納入**統計分析） |
| CSV 匯入受試者 | 用 Excel 填好 CSV，一行指令匯入 MySQL；會新增、更新，並在刪除前先詢問 |

### 問卷變項

- **連續變項**：年齡、體重、身高、BMI、CAT 量表總分、mMRC 呼吸困難、聖喬治呼吸問卷（SGRQ）
  - 年齡（今天 − 生日）和 BMI（體重 ÷ 身高²）不存在資料庫，每次更新資料時才計算
- **類別變項**：性別，以及 18 項本人病史（高血壓、糖尿病、高血脂、心臟病、腦中風、腎臟病、B/C 型肝炎、精神疾病、氣喘、支氣管炎、肺炎、支氣管擴張、肺栓塞、過敏性鼻炎、過敏性結膜炎、異位性皮膚炎、蕁麻疹）
- **癌症**：資料庫存 0～20 的癌別代碼，Table 1 只看「有沒有任何一種癌症」

---

## 系統怎麼運作

```
update_data.py（在終端機手動執行）
   ├─ 讀 MySQL 的受試者資料（copd.subjects 表格）
   ├─ 向環境部抓小港測站空氣品質（先抓即時資料 aqx_p_432，失敗改抓小時值 aqx_p_245）
   └─ 全部存成 data.json
                │
                ▼
index.html（用 VS Code Live Server 開啟）
   讀 data.json → 在瀏覽器裡算統計、畫 Table 1 與圖表
```

- 網頁**只讀 `data.json`**，不會直接連資料庫，所以資料庫密碼和 API key 不會出現在網頁上。
- 資料**不會自動更新**：資料庫有新資料、或想看最新空汙，就再執行一次 `python update_data.py`。

---

## 技術

| 部分 | 使用的技術 |
|---|---|
| 網頁畫面 | HTML、CSS（自己寫的 `style.css`，沒有用 CSS 框架）、Google Fonts Inter 字型 |
| 網頁功能 | JavaScript（分成 6 個檔案，見下方資料夾結構） |
| 圖表 | [Plotly.js](https://plotly.com/javascript/) 2.27 |
| 統計計算 | 在 JavaScript 裡自己實作（t 分佈、卡方、Fisher 精確檢定、線性迴歸），不需額外套件 |
| 資料庫 | MySQL |
| 資料處理 | Python 3：`pymysql`（連 MySQL）、`requests`（抓環境部 API）、`configparser`（讀設定檔） |
| 外部資料 | 環境部環境資料開放平臺 API（aqx_p_432 即時、aqx_p_245 小時值） |
| 統計對照 | SAS（匯出的 `.sas` 腳本） |
| 開發工具 | VS Code + Live Server |

---

## 資料夾結構

```
BDDE39_midterm_project/
├── index.html             網頁本體（用 Live Server 開）
├── style.css              網頁外觀
├── js/                    網頁的功能（index.html 依 1→6 的順序載入，順序不能換）
│   ├── 1_variables.js     問卷變項清單（要新增、改名變項只改這裡）
│   ├── 2_load_data.js     開網頁時讀 data.json、空汙看板、時鐘
│   ├── 3_statistics.js    統計公式（t 檢定、卡方、Fisher、迴歸）
│   ├── 4_table1.js        分組、Table 1、變項完整度
│   ├── 5_charts.js        圖 1、圖 2、自動摘要
│   └── 6_export.js        匯出 SAS 腳本、複製摘要
├── update_data.py         建資料庫與表格、匯入 CSV、產生 data.json
├── config-example.ini      設定檔範本（複製成 config.ini 再填）
├── requirements.txt       Python 套件清單
├── COPDCO_115.10.15-example.csv   範例資料 CSV（可當作新增受試者的格式範本）
├── README.md              本說明文件
└── .gitignore             不上傳 GitHub 的檔案清單
```

以下檔案在自己的電腦上會有，但**不會上傳到 GitHub**（已寫在 `.gitignore`）：

- `config.ini`：含資料庫密碼和 API key
- `data.json`、真實受試者的 `.csv` 檔：含受試者個人資料

---

## 安裝與使用

### 事前準備

- Python 3（開發時用 3.12）
- MySQL（例如用 XAMPP 啟動）
- VS Code，並安裝 **Live Server** 擴充功能
- 環境部環境資料開放平臺的 API key（到平臺註冊會員後申請）

### 第一次使用

**1. 安裝 Python 套件**

在 VS Code 開終端機（上方選單「終端機 → 新增終端機」），輸入：

```
python -m pip install -r requirements.txt
```

**2. 建立設定檔**

把 `config-example.ini` 複製一份，改名為 `config.ini`，填入自己的資料：

```ini
[DB]
host = 127.0.0.1
user = root
password = 你的密碼
port = 3306
database = copd

[MOENV]
api_key = 貼上你的API_KEY
```

### 每次使用

**1. 更新資料**（產生 `data.json`）

```
python update_data.py
```

第一次執行時會自動建立 `copd` 資料庫和 `subjects` 表格；如果表格是空的，會先放入 30 筆**假的範例資料**方便測試。

**2. 開啟網頁**

在 `index.html` 上按右鍵 →「Open with Live Server」。

> 一定要用 Live Server 開，直接雙擊 `index.html` 的話，瀏覽器會擋住讀取 `data.json`。

### 新增或修改受試者（CSV 匯入）

1. 複製 `COPDCO_115.10.15-example.csv`（第一列是變項名稱），用 Excel 打開，刪掉範例列，一列填一位受試者
2. 存檔時選「CSV UTF-8（逗號分隔）」
3. 在終端機執行（檔名換成你的）：

   ```
   python update_data.py 你的檔案.csv
   ```

匯入規則：

- 研究編號（Code）已經在資料庫裡的人，會用 CSV 的內容**更新**；新編號會**新增**
- 資料庫裡有、CSV 裡沒有的人，會列出來問你要不要刪除（打 `y` 才會刪）
- CSV 裡同一個編號出現兩次時，整份都不會匯入，並告訴你是 Excel 第幾列
- 生日格式看不懂、數字欄填了文字，會顯示警告並存成空白，其他欄位照常匯入

CSV 第一列的變項名稱順序、大小寫不限；`Age`、`BMI` 欄會被略過（程式自己計算）；性別可寫 `M`/`F` 或 `男`/`女`；身高寫公分（例 165）會自動換成公尺。

---

## 統計方法

網頁上的 P 值設計成**跟 SAS 的結果一致**，可以用匯出的 SAS 腳本驗證。

| 項目 | 方法 | 對應 SAS |
|---|---|---|
| 連續變項兩組比較（Table 1、圖 1） | 獨立樣本 t 檢定，**不假設兩組變異數相等**；自由度用 Satterthwaite 公式（會有小數），P 值用**精確的 t 分佈**計算 | PROC TTEST 報表中 Method = Satterthwaite（Variances = Unequal）那一列 |
| 類別變項（性別、病史） | 卡方檢定；2×2 表格中任一格期望值 < 5 時，改用 Fisher 精確檢定（雙尾） | PROC FREQ `/ CHISQ FISHER` |
| 圖 2 線性迴歸 | 簡單線性迴歸（最小平方法）；斜率的 P 值和 95% 信賴區間用 t 分佈，**自由度 n − 2** | PROC REG `/ CLB` |

其他規則：

- **缺漏值不補值**：某個變項空白的人，只在計算該變項時被排除（各變項分開計算），不會用平均數或其他方法填補。
- 用連續變項分組時，分組變項缺漏的人不分入任何一組（網頁和匯出的 SAS 腳本規則相同）。
- 迴歸只用 X、Y 兩個變項都有值的人。
- 任一組少於 2 人時，t 檢定無法計算，P 值顯示「N/A」。
- P 值顯示到小數點後 3 位，小於 0.001 時顯示「< 0.001」；P < 0.05 視為達統計顯著。

### 匯出 SAS 腳本

按右上角「一鍵匯出 SAS 腳本」會下載 `clinical_crude_analysis.sas`。腳本最上面兩行寫的是 CSV 的位置：

```sas
%let path = C:\Users\CHUN\BDDE39_midterm_project;
%let file = COPDCO_115.10.15-example.csv;
```

換電腦或換檔名時，直接改這兩行即可（也可以改 `js/6_export.js` 最上面的 `SAS_CSV_FOLDER`、`SAS_CSV_FILE`，之後匯出的腳本就會是新路徑）。

---

## 資料與隱私

- 本 GitHub 專案**不包含任何真實受試者資料**。`COPDCO_115.10.15-example.csv` 和程式產生的範例資料都是假資料。
- 資料庫密碼和 API key 只放在自己電腦的 `config.ini`，不會上傳。

---

## 已知限制

- 目前只做兩組比較和單變項迴歸（crude analysis），還沒有多變項校正。
- 空氣品質只顯示在看板上，還沒有和受試者資料合併分析。
- 網頁不能直接新增或修改資料，要透過 CSV 匯入。
