// ============================================================
// 4_table1.js：分組、Table 1、資料完整度
//   applyStratification() 是主角：按下「套用分組」按鈕就會執行
//     ① 依選的變項把受試者分成兩組
//     ② 一列一列組出 Table 1
//     ③ 更新資料完整度、重畫圖表
// ============================================================


// 換了分組變項：類別變項（性別、病史）不用切點，就把切點欄位藏起來
function onStratVarChange() {
    const key = document.getElementById('strat-var').value;
    const cutoffBox = document.getElementById('cutoff-container');

    if (isCategorical(key)) {
        cutoffBox.style.display = 'none';
    } else {
        cutoffBox.style.display = 'block';
        document.getElementById('strat-cutoff').value = findVar(key).cutoff;
    }
}


// ===== 主角：分組 + Table 1 =====
function applyStratification() {
    const key = document.getElementById('strat-var').value;
    const cutoff = parseFloat(document.getElementById('strat-cutoff').value || 0);

    // ① 分兩組
    const groups = splitGroups(key, cutoff);
    const group1 = groups.group1;
    const group2 = groups.group2;

    // 表頭
    document.getElementById('th-total').innerHTML = `Total (N=${patients.length})`;
    document.getElementById('th-group1').innerHTML = `${groups.name1} (n=${group1.length})`;
    document.getElementById('th-group2').innerHTML = `${groups.name2} (n=${group2.length})`;
    document.getElementById('kpi-total-n').innerText = patients.length;

    // ② 組出 Table 1，每一列是一段 <tr>…</tr>
    let html = sectionRow('基本資料');
    html += sexRows(key, group1, group2);
    for (const v of CONT_VARS) {
        if (v.section) {
            html += sectionRow(v.section);
        }
        html += continuousRow(v, key, group1, group2);
    }
    html += sectionRow('本人病史 (是)');
    for (const d of BIN_VARS) {
        html += diseaseRow(d, key, group1, group2);
    }
    document.getElementById('table1-body').innerHTML = html;

    // ③ 其他區塊跟著更新
    updateQualityDisplay();
    updateCharts(group1, group2, groups.name1, groups.name2, key);   // 在 5_charts.js
}


// 依分組變項把受試者分成兩組，並取好兩組的名字
function splitGroups(key, cutoff) {
    const group1 = [], group2 = [];
    let name1, name2;

    if (key === 'sex') {
        // 性別：男一組、女一組
        for (const p of patients) {
            if (p.sex === 'M') group1.push(p);
            if (p.sex === 'F') group2.push(p);
        }
        name1 = '男性 (Male)';
        name2 = '女性 (Female)';
    } else if (isCategorical(key)) {
        // 病史：沒有的一組、有的一組
        for (const p of patients) {
            if (getValue(p, key) === 0) group1.push(p);
            if (getValue(p, key) === 1) group2.push(p);
        }
        name1 = '無' + findVar(key).name;
        name2 = '有' + findVar(key).name;
    } else {
        // 連續變項：小於切點一組、大於等於切點一組（缺漏的不分組）
        for (const p of patients) {
            if (!isNum(p[key])) continue;
            if (p[key] < cutoff) group1.push(p);
            else group2.push(p);
        }
        const shortName = varLabel(key).split(' (')[0];   // 'BMI (kg/m²)' → 'BMI'
        name1 = `${shortName} < ${cutoff}`;
        name2 = `${shortName} ≥ ${cutoff}`;
    }
    return { group1: group1, group2: group2, name1: name1, name2: name2 };
}


// ===== Table 1 的各種列 =====

// 分段標題列，例如「基本資料」
function sectionRow(title) {
    return `<tr class="section-row"><td colspan="5">${title}</td></tr>`;
}

// 一般的一列：名稱、Total、第 1 組、第 2 組、P 值
function tableRow(label, sub, total, cell1, cell2, pValue) {
    return `
        <tr>
            <td class="label">${label} <span class="cell-sub">${sub}</span></td>
            <td>${total}</td>
            <td>${cell1}</td>
            <td>${cell2}</td>
            <td class="text-right">${formatP(pValue)}</td>
        </tr>`;
}

// 性別：標題一列（放 P 值）+ 男、女各一列
function sexRows(key, group1, group2) {
    let p = '-';   // 用性別分組時，兩組本來就是男 vs 女，不需要檢定
    if (key !== 'sex') {
        p = test2x2P(countSex(group1, 'M'), countSex(group1, 'F'), countSex(group2, 'M'), countSex(group2, 'F'));
    }
    let html = `
        <tr>
            <td class="label">性別 (Sex) <span class="cell-sub">n (%)</span></td>
            <td></td><td></td><td></td>
            <td class="text-right">${formatP(p)}</td>
        </tr>`;
    for (const [sex, label] of [['M', '男性 (Male)'], ['F', '女性 (Female)']]) {
        html += `
        <tr>
            <td class="label sub-row">${label}</td>
            <td>${countWithPercent(countSex(patients, sex), patients.length)}</td>
            <td>${countWithPercent(countSex(group1, sex), group1.length)}</td>
            <td>${countWithPercent(countSex(group2, sex), group2.length)}</td>
            <td></td>
        </tr>`;
    }
    return html;
}

// 連續變項：平均 ± 標準差，t 檢定
function continuousRow(v, key, group1, group2) {
    let p = '-';   // 用這個變項分組時，不用再檢定它自己
    if (v.key !== key) {
        p = calculateTTestP(group1, group2, v.key);
    }
    const digits = v.digits || 1;
    return tableRow(v.name, 'Mean ± SD',
        meanSD(patients, v.key, digits), meanSD(group1, v.key, digits), meanSD(group2, v.key, digits), p);
}

// 病史：「是」的人數 (%)，卡方 / Fisher 檢定
function diseaseRow(d, key, group1, group2) {
    let p = '-';
    if (d.key !== key) {
        p = test2x2P(countYes(group1, d.key), countNo(group1, d.key), countYes(group2, d.key), countNo(group2, d.key));
    }
    return tableRow(`${d.name} (${d.code})`, 'n (%)',
        yesWithPercent(patients, d.key), yesWithPercent(group1, d.key), yesWithPercent(group2, d.key), p);
}


// ===== 格子裡的文字 =====

// 64.6 ± 9.5
function meanSD(people, key, digits) {
    const numbers = getNumbers(people, key);
    if (numbers.length === 0) {
        return '-';
    }
    return `${mean(numbers).toFixed(digits)} ± ${sd(numbers).toFixed(digits)}`;
}

// 22 (73.3%)
function countWithPercent(count, total) {
    let percent = '0.0';
    if (total > 0) {
        percent = (count / total * 100).toFixed(1);
    }
    return `${count} (${percent}%)`;
}

// 病史「是」的人數 (%)，分母只算有回答的人
function yesWithPercent(people, key) {
    return countWithPercent(countYes(people, key), countYes(people, key) + countNo(people, key));
}

function countSex(people, sex) {
    let n = 0;
    for (const p of people) {
        if (p.sex === sex) n++;
    }
    return n;
}

function countYes(people, key) {
    let n = 0;
    for (const p of people) {
        if (getValue(p, key) === 1) n++;
    }
    return n;
}

function countNo(people, key) {
    let n = 0;
    for (const p of people) {
        if (getValue(p, key) === 0) n++;
    }
    return n;
}

// P 值：顯著用 p-sig（粗體靛藍），不顯著用 p-ns（灰色），樣式在 style.css
//   開頭是 < 的（'< 0.001'）→ 加 **，其他小於 0.05 → 加 *
function formatP(p) {
    if (p === '-' || p === 'N/A') {
        return `<span class="p-ns">${p}</span>`;
    }
    if (p.startsWith('<')) {
        return `<span class="p-sig">${p}**</span>`;
    }
    if (parseFloat(p) < 0.05) {
        return `<span class="p-sig">${p}*</span>`;
    }
    return `<span class="p-ns">${p}</span>`;
}


// ===== 資料完整度（右上角 KPI 卡片）=====

// 要檢查完整度的欄位
const QUALITY_KEYS = ['birthdate', 'sex', 'weight', 'height', 'cat', 'mmrc', 'sgrq'];
for (const d of DISEASE_VARS) {
    QUALITY_KEYS.push(d.key);
}
QUALITY_KEYS.push('cancer');

// 這一格有沒有填（生日、性別是文字，其他是數字）
function isFilled(person, key) {
    if (key === 'birthdate' || key === 'sex') {
        return Boolean(person[key]);
    }
    return isNum(person[key]);
}

function updateQualityDisplay() {
    // 選單選的那一個變項：有效幾人、缺漏幾人
    const key = document.getElementById('variable-quality-select').value;
    let valid = 0;
    for (const p of patients) {
        if (isFilled(p, key)) valid++;
    }
    const missing = patients.length - valid;
    document.getElementById('quality-detail-text').innerText = `有效: ${valid} | 缺漏: ${missing}`;

    // 全部欄位加起來的有效比例
    let filledCells = 0;
    for (const p of patients) {
        for (const k of QUALITY_KEYS) {
            if (isFilled(p, k)) filledCells++;
        }
    }
    const totalCells = patients.length * QUALITY_KEYS.length;
    let rate = '100.0';
    if (totalCells > 0) {
        rate = (filledCells / totalCells * 100).toFixed(1);
    }
    document.getElementById('kpi-valid-rate').innerText = rate + '%';
}
