// ============================================================
// 2_load_data.js：打開網頁時要做的事
//   ① 時鐘每秒更新
//   ② 把下拉選單的選項放好
//   ③ 讀 data.json（由 update_data.py 產生）
//   ④ 把空汙資料放進看板
// ============================================================

// 全部受試者，讀完 data.json 後放在這裡，其他檔案都從這裡拿
let patients = [];


// 網頁載入完成時，依序執行
window.onload = function () {
    buildSelectors();     // 放好下拉選單
    onStratVarChange();   // 放好預設切點（在 4_table1.js）
    loadData();           // 讀資料、畫 Table 1 和圖表
};


// ① 時鐘：每 1000 毫秒（1 秒）更新一次「系統目前時間」
setInterval(function () {
    document.getElementById('sys-clock').innerText = formatNow();
}, 1000);

// 把現在時間排成 2026-10-13 15:30:05
function formatNow() {
    const now = new Date();
    const y = now.getFullYear();
    const m = twoDigits(now.getMonth() + 1);   // 月份從 0 開始算，所以要 +1
    const d = twoDigits(now.getDate());
    const hh = twoDigits(now.getHours());
    const mm = twoDigits(now.getMinutes());
    const ss = twoDigits(now.getSeconds());
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

// 5 → '05'
function twoDigits(n) {
    return String(n).padStart(2, '0');
}


// ② 下拉選單：依 1_variables.js 的清單產生選項
function buildSelectors() {
    // 品質檢查選單：不放年齡、BMI（它們是算出來的），改放生日、性別、各項病史
    let quality = '';
    for (const v of CONT_VARS) {
        if (v.key !== 'age' && v.key !== 'bmi') {
            quality += makeOption(v.key, v.name);
        }
    }
    quality += makeOption('birthdate', '生日 (BIRTHDATE)');
    quality += makeOption('sex', '性別 (Sex)');
    for (const d of DISEASE_VARS) {
        quality += makeOption(d.key, '病史: ' + d.name);
    }
    quality += makeOption('cancer', '病史: 癌症');
    document.getElementById('variable-quality-select').innerHTML = quality;

    // 分組選單：分成「連續變項」和「類別變項」兩區
    let groupBy = '<optgroup label="連續變項 (用切點分組)">';
    for (const v of CONT_VARS) {
        groupBy += makeOption(v.key, v.name);
    }
    groupBy += '</optgroup><optgroup label="類別變項">';
    groupBy += makeOption('sex', '性別 (Sex)');
    for (const d of BIN_VARS) {
        groupBy += makeOption(d.key, '病史: ' + d.name);
    }
    groupBy += '</optgroup>';
    document.getElementById('strat-var').innerHTML = groupBy;

    // 兩張圖的選單：只放連續變項
    let outcome = '', xAxis = '', yAxis = '';
    for (const v of CONT_VARS) {
        outcome += makeOption(v.key, '依變數: ' + v.name);
        xAxis += makeOption(v.key, 'X軸: ' + v.name);
        yAxis += makeOption(v.key, 'Y軸: ' + v.name);
    }
    document.getElementById('chart1-outcome').innerHTML = outcome;
    document.getElementById('chart2-xvar').innerHTML = xAxis;
    document.getElementById('chart2-yvar').innerHTML = yAxis;

    // 預設：圖 1 看 SGRQ，圖 2 看 CAT 對 SGRQ
    document.getElementById('chart1-outcome').value = 'sgrq';
    document.getElementById('chart2-xvar').value = 'cat';
    document.getElementById('chart2-yvar').value = 'sgrq';
}

// 產生一個選項：<option value="bmi">身體質量指數…</option>
function makeOption(value, text) {
    return `<option value="${value}">${text}</option>`;
}


// ③ 讀 data.json
async function loadData() {
    let data;
    try {
        const response = await fetch('data.json', { cache: 'no-store' });   // no-store：每次都拿最新的檔案
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        data = await response.json();
    } catch (err) {
        alert('讀不到 data.json，請先在終端機執行 python update_data.py\n' + err.message);
        data = { subjects: [], air_quality: { error: '讀不到 data.json' } };
    }

    patients = data.subjects || [];

    if (data.updated) {
        document.getElementById('data-updated').innerText = '資料更新時間：' + data.updated;
    } else {
        document.getElementById('data-updated').innerText = '尚未產生資料';
    }

    showAirQuality(data.air_quality || {});
    applyStratification();   // 畫 Table 1 和圖表（在 4_table1.js）
}


// ④ 空汙看板
function showAirQuality(air) {
    const dot = document.getElementById('aq-dot');
    const status = document.getElementById('aq-status');

    // 抓資料失敗：小圓點變紅，顯示原因
    if (air.error || !air.records) {
        showAirError(air.error || '沒有空汙資料');
        return;
    }

    // 每個項目只留最新、而且是數字的那一筆
    const latest = {};
    for (const r of air.records) {
        const value = parseFloat(r.concentration);
        if (isNaN(value)) {
            continue;   // 不是數字（例如空白）就跳過
        }
        const name = r.itemengname;
        if (!latest[name] || r.monitordate > latest[name].time) {
            latest[name] = { value: value, unit: r.itemunit || '', time: r.monitordate };
        }
    }
    if (Object.keys(latest).length === 0) {
        showAirError('API 無有效數值');
        return;
    }

    // 把每個項目排成「PM2.5: 21 μg/m3」
    let html = '';
    let newestTime = '';
    for (const name in latest) {
        const item = latest[name];
        html += `<span>${name}: <strong>${item.value} ${item.unit}</strong></span>`;
        if (item.time > newestTime) {
            newestTime = item.time;
        }
    }
    document.getElementById('aq-items').innerHTML = html;

    const first = air.records[0];
    document.getElementById('aq-site').innerText = `${first.county}${first.sitename}測站 (#${first.siteid}):`;
    document.getElementById('env-clock').innerText = newestTime + ':00';
    dot.className = 'aq-dot ok';

    // 即時資料才有「普通」這種狀態和主要污染物
    let level = '';
    if (first.status) {
        level = '空氣品質：' + first.status;
        if (first.pollutant) {
            level += '（主要污染物：' + first.pollutant + '）';
        }
        level += '　';
    }
    status.innerText = level + '(獨立環境看板，不納入臨床統計分析)';
}

function showAirError(message) {
    document.getElementById('aq-dot').className = 'aq-dot error';
    document.getElementById('aq-status').innerText = '⚠ 無法取得空汙資料：' + message;
    document.getElementById('env-clock').innerText = '--';
}
