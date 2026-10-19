// ============================================================
// 5_charts.js：兩張期刊圖 + 自動摘要
//   圖 1：箱型圖，比較兩組的某個數值
//   圖 2：散佈圖 + 迴歸線，看兩個數值的關係
//   摘要：把上面兩張圖的結果寫成一段中文
// 畫圖用的是 Plotly：Plotly.newPlot('畫在哪個 id', [資料], 外觀, 設定)
// ============================================================


// 由 applyStratification()（4_table1.js）呼叫，把分好的兩組傳進來
// 如果是圖表選單換了選項（沒有傳兩組進來），就先重新分組，它會再回來呼叫這裡
function updateCharts(group1, group2, name1, name2, groupKey) {
    if (!group1) {
        applyStratification();
        return;
    }
    const box = drawBoxChart(group1, group2, name1, name2);
    const reg = drawScatterChart();
    writeAbstract(box, reg, name1, name2, groupKey);
}


// ===== 圖 1：箱型圖 =====
function drawBoxChart(group1, group2, name1, name2) {
    const key = document.getElementById('chart1-outcome').value;
    const values1 = getNumbers(group1, key);
    const values2 = getNumbers(group2, key);
    const p = calculateTTestP(group1, group2, key);

    // 一個 trace 就是一個箱子
    const box1 = {
        y: values1, type: 'box', name: name1,
        boxpoints: 'all', jitter: 0.4, pointpos: -1.5,   // 每個人都畫成點，左右散開
        marker: { color: '#2563EB', size: 5, opacity: 0.8 },
        line: { color: '#1D4ED8', width: 2 },
        fillcolor: 'rgba(37, 99, 235, 0.25)'
    };
    const box2 = {
        y: values2, type: 'box', name: name2,
        boxpoints: 'all', jitter: 0.4, pointpos: -1.5,
        marker: { color: '#0D9488', size: 5, opacity: 0.8 },
        line: { color: '#0F766E', width: 2 },
        fillcolor: 'rgba(13, 148, 136, 0.25)'
    };
    const layout = {
        title: { text: `<b>${pText(p)}</b>`, font: { size: 14 } },
        yaxis: { title: varLabel(key), zeroline: false },
        showlegend: false,
        margin: { l: 50, r: 20, t: 40, b: 40 },
        paper_bgcolor: 'rgba(0,0,0,0)',   // 透明背景
        plot_bgcolor: 'rgba(0,0,0,0)'
    };
    Plotly.newPlot('journalBoxChart', [box1, box2], layout, { displayModeBar: false });

    // 回傳給摘要用
    return { key: key, values1: values1, values2: values2, p: p };
}


// ===== 圖 2：散佈圖 + 迴歸線 =====
function drawScatterChart() {
    const xKey = document.getElementById('chart2-xvar').value;
    const yKey = document.getElementById('chart2-yvar').value;

    // 只拿 X、Y 都有填的人
    const xs = [], ys = [];
    for (const p of patients) {
        if (isNum(p[xKey]) && isNum(p[yKey])) {
            xs.push(p[xKey]);
            ys.push(p[yKey]);
        }
    }
    const reg = linearRegression(xs, ys);   // 在 3_statistics.js

    // 迴歸線只要兩個點：最左邊和最右邊
    let minX = 0, maxX = 1;
    if (xs.length > 0) {
        minX = Math.min(...xs);
        maxX = Math.max(...xs);
    }
    const dots = {
        x: xs, y: ys, mode: 'markers', type: 'scatter', name: 'Subjects',
        marker: { color: '#2563EB', size: 6, opacity: 0.8 }
    };
    const line = {
        x: [minX, maxX],
        y: [reg.intercept + reg.slope * minX, reg.intercept + reg.slope * maxX],
        mode: 'lines', type: 'scatter', name: 'Trend Line',
        line: { color: '#DC2626', width: 2, dash: 'solid' }
    };
    const title = `crude β= ${reg.slope.toFixed(2)} (95% CI: ${reg.ciLow.toFixed(2)}–${reg.ciHigh.toFixed(2)}); ${pText(reg.p)}`;
    const layout = {
        title: { text: `<b>${title}</b>`, font: { size: 12, family: 'serif' } },
        xaxis: { title: varLabel(xKey), zeroline: false },
        yaxis: { title: varLabel(yKey), zeroline: false },
        showlegend: false,
        margin: { l: 50, r: 20, t: 40, b: 40 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)'
    };
    Plotly.newPlot('journalScatterChart', [dots, line], layout, { displayModeBar: false });

    reg.xKey = xKey;
    reg.yKey = yKey;
    return reg;
}


// ===== 自動摘要 =====
function writeAbstract(box, reg, name1, name2, groupKey) {
    let groupName = '性別';
    if (groupKey !== 'sex') {
        groupName = findVar(groupKey).name;
    }
    let mean1 = '0.0', mean2 = '0.0';
    if (box.values1.length > 0) mean1 = mean(box.values1).toFixed(1);
    if (box.values2.length > 0) mean2 = mean(box.values2).toFixed(1);

    const groupResult = isSignificant(box.p) ? '達' : '未達';
    const regResult = isSignificant(reg.p) ? '顯著' : '未顯著';
    const direction = reg.slope >= 0 ? '正向' : '負向';

    const text =
        `本研究共納入 ${patients.length} 位有效受試者。` +
        `依 ${groupName} 分層分析結果顯示，` +
        `${name1}（n = ${box.values1.length}）之平均 ${varLabel(box.key)} 為 ${mean1}，` +
        `而 ${name2}（n = ${box.values2.length}）為 ${mean2}，` +
        `兩組間${groupResult}統計顯著差異（${pText(box.p)}）。` +
        `此外，線性迴歸分析顯示，${varLabel(reg.xKey)} 與 ${varLabel(reg.yKey)} 呈${regResult}${direction}相關` +
        `（crude β = ${reg.slope.toFixed(2)}, 95% CI: ${reg.ciLow.toFixed(2)}–${reg.ciHigh.toFixed(2)}; ${pText(reg.p)}）。`;

    document.getElementById('abstract-text').innerHTML = text;
}


// ===== 小工具 =====

// P 值文字：'< 0.01' → 'P < 0.01'，'0.032' → 'P = 0.032'
function pText(p) {
    if (p.startsWith('<')) {
        return 'P ' + p;
    }
    return 'P = ' + p;
}

// P 值小於 0.05 嗎？
//   '< 0.05'、'< 0.01'、'< 0.001' 開頭是 < ，一定顯著；'N/A' 算不顯著
function isSignificant(p) {
    if (p.startsWith('<')) {
        return true;
    }
    const number = parseFloat(p);
    return !isNaN(number) && number < 0.05;
}
