// ============================================================
// 5_charts.js：三張期刊圖 + 自動摘要
//   圖 1：箱型圖，比較兩組的某個數值
//   圖 2：散佈圖 + 迴歸線，看兩個數值的關係
//   圖 3：熱圖，一次看所有數值變項兩兩之間的相關係數
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
    drawHeatmap();
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
        boxpoints: 'all', jitter: 0.3, pointpos: 0,   // 每個人都畫成點，疊在箱子正上方（pointpos 0 = 置中），左右稍微散開
        marker: { color: '#1D4ED8', size: 6, opacity: 0.6, line: { color: '#FFFFFF', width: 0.5 } },
        line: { color: '#1D4ED8', width: 2 },
        fillcolor: 'rgba(37, 99, 235, 0.25)'
    };
    const box2 = {
        y: values2, type: 'box', name: name2,
        boxpoints: 'all', jitter: 0.3, pointpos: 0,
        marker: { color: '#0F766E', size: 6, opacity: 0.6, line: { color: '#FFFFFF', width: 0.5 } },
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


// ===== 圖 3：相關係數熱圖 =====
// 每一格 = 兩個變項的相關係數 r（-1 ~ 1）
//   紅色 = 正相關（一個高、另一個也高），藍色 = 負相關，白色 = 幾乎沒關係
function drawHeatmap() {
    const names = [];    // 座標軸上的名字
    const matrix = [];   // 一列一列的 r 值
    const labels = [];   // 每格上顯示的文字
    for (const row of CONT_VARS) {
        names.push(row.label);
        const rValues = [];
        const rTexts = [];
        for (const col of CONT_VARS) {
            const r = correlation(row.key, col.key);
            rValues.push(r);
            rTexts.push(r === null ? '-' : r.toFixed(2));
        }
        matrix.push(rValues);
        labels.push(rTexts);
    }

    const heat = {
        z: matrix, x: names, y: names, type: 'heatmap',
        text: labels, texttemplate: '%{text}',   // 每格寫上 r 值
        colorscale: 'RdBu',   // 藍 → 白 → 紅
        zmin: -1, zmax: 1,
        colorbar: { title: 'r' },
        hovertemplate: '%{y} × %{x}<br>r = %{text}<extra></extra>'
    };
    const layout = {
        yaxis: { autorange: 'reversed' },   // 第一個變項放最上面
        margin: { l: 110, r: 20, t: 20, b: 90 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)'
    };
    Plotly.newPlot('heatmapChart', [heat], layout, { displayModeBar: false });
}

// 兩個變項的 Pearson 相關係數（只用兩個都有填的人；人數不夠回傳 null）
function correlation(xKey, yKey) {
    const xs = [], ys = [];
    for (const p of patients) {
        if (isNum(p[xKey]) && isNum(p[yKey])) {
            xs.push(p[xKey]);
            ys.push(p[yKey]);
        }
    }
    if (xs.length < 3) {
        return null;
    }
    const mx = mean(xs), my = mean(ys);
    let ssXX = 0, ssYY = 0, ssXY = 0;
    for (let i = 0; i < xs.length; i++) {
        ssXX += (xs[i] - mx) * (xs[i] - mx);
        ssYY += (ys[i] - my) * (ys[i] - my);
        ssXY += (xs[i] - mx) * (ys[i] - my);
    }
    if (ssXX === 0 || ssYY === 0) {
        return null;
    }
    return ssXY / Math.sqrt(ssXX * ssYY);
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

// P 值文字：'< 0.001' → 'P < 0.001'，'0.032' → 'P = 0.032'
function pText(p) {
    if (p.startsWith('<')) {
        return 'P ' + p;
    }
    return 'P = ' + p;
}

// P 值小於 0.05 嗎？
//   '< 0.001' 開頭是 < ，一定顯著；'N/A' 算不顯著
function isSignificant(p) {
    if (p.startsWith('<')) {
        return true;
    }
    const number = parseFloat(p);
    return !isNaN(number) && number < 0.05;
}
