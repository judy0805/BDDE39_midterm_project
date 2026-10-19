// ============================================================
// 3_statistics.js：統計公式
// 這個檔案是數學公式，【不用看懂也可以用】
// 其他檔案只要知道這幾個功能「丟什麼進去、拿什麼出來」：
//
//   getNumbers(人群, 'bmi')             → 這群人的 BMI 數字清單（缺漏的自動去掉）
//   mean(數字清單)                      → 平均
//   sd(數字清單)                        → 標準差（除以 n-1）
//   calculateTTestP(第1組, 第2組, 'bmi') → 兩組 BMI 比較的 P 值文字，例如 '0.032'、'< 0.01'
//   test2x2P(a, b, c, d)                → 2x2 表格的 P 值文字（卡方 / Fisher）
//   linearRegression(x清單, y清單)       → 迴歸的 β、95% CI、P 值
// ============================================================


// ===== 基本計算 =====

// 從一群人裡拿出某個變項的數字（缺漏的不要）
function getNumbers(people, key) {
    const numbers = [];
    for (const p of people) {
        if (isNum(p[key])) {
            numbers.push(p[key]);
        }
    }
    return numbers;
}

function sum(numbers) {
    let total = 0;
    for (const x of numbers) {
        total += x;
    }
    return total;
}

function mean(numbers) {
    return sum(numbers) / numbers.length;
}

// 樣本變異數（除以 n-1）
function variance(numbers) {
    const m = mean(numbers);
    let squares = 0;
    for (const x of numbers) {
        squares += (x - m) * (x - m);
    }
    return squares / (numbers.length - 1);
}

function sd(numbers) {
    if (numbers.length < 2) {
        return 0;
    }
    return Math.sqrt(variance(numbers));
}


// ===== 連續變項：兩組平均的 t 檢定（Welch）=====
// 注意：P 值用常態分佈近似，不是真正的 t 分佈；樣本很少時 P 值會偏小
function calculateTTestP(group1, group2, key) {
    const x1 = getNumbers(group1, key);
    const x2 = getNumbers(group2, key);
    if (x1.length === 0 || x2.length === 0) {
        return 'N/A';
    }
    // 只有 1 個人時變異數沒辦法算，當成 0
    const v1 = x1.length > 1 ? variance(x1) : 0;
    const v2 = x2.length > 1 ? variance(x2) : 0;
    const se = Math.sqrt(v1 / x1.length + v2 / x2.length);
    if (se === 0) {
        return '1.000';
    }
    const t = (mean(x1) - mean(x2)) / se;
    return approxPValue(t);
}

// 把 t（或 z）值換成 P 值文字
function approxPValue(z) {
    const absZ = Math.abs(z);
    if (absZ > 3.29) return '< 0.001';
    if (absZ > 2.58) return '< 0.01';
    if (absZ > 1.96) return '< 0.05';
    return Math.exp(-0.717 * absZ - 0.416 * absZ * absZ).toFixed(3);
}


// ===== 類別變項：2x2 表格的 P 值 =====
// 2x2 表格：      男(是)  女(否)
//          第1組    a       b
//          第2組    c       d
// 任一格的期望值 < 5 就用 Fisher 精確檢定，不然用卡方檢定
function test2x2P(a, b, c, d) {
    const row1 = a + b, row2 = c + d, col1 = a + c, col2 = b + d;
    const n = row1 + row2;
    if (row1 === 0 || row2 === 0 || col1 === 0 || col2 === 0) {
        return 'N/A';   // 某一行或某一欄全是 0，無法檢定
    }
    const expected = [row1 * col1 / n, row1 * col2 / n, row2 * col1 / n, row2 * col2 / n];
    let p;
    if (Math.min(...expected) < 5) {
        p = fisherExactP(a, b, c, d);
    } else {
        p = chiSquareP(a, b, c, d);
    }
    if (p < 0.001) {
        return '< 0.001';
    }
    return p.toFixed(3);
}

// 卡方檢定（自由度 1）
function chiSquareP(a, b, c, d) {
    const n = a + b + c + d;
    const chi2 = n * Math.pow(a * d - b * c, 2) / ((a + b) * (c + d) * (a + c) * (b + d));
    return erfc(Math.sqrt(chi2 / 2));
}

// Fisher 精確檢定（雙尾）：把所有比觀察到的表格「更不可能或一樣不可能」的機率加起來
function fisherExactP(a, b, c, d) {
    const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
    const observed = tableProbability(a, r1, r2, c1, n);
    let p = 0;
    for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
        const px = tableProbability(x, r1, r2, c1, n);
        if (px <= observed * (1 + 1e-7)) {
            p += px;
        }
    }
    return Math.min(1, p);
}

// 左上角是 x 的那張 2x2 表格出現的機率（超幾何分佈）
function tableProbability(x, r1, r2, c1, n) {
    return Math.exp(logFactorial(r1) + logFactorial(r2) + logFactorial(c1) + logFactorial(n - c1)
        - logFactorial(n) - logFactorial(x) - logFactorial(r1 - x) - logFactorial(c1 - x) - logFactorial(r2 - c1 + x));
}

// log(k!)，避免數字太大
function logFactorial(k) {
    let s = 0;
    for (let i = 2; i <= k; i++) {
        s += Math.log(i);
    }
    return s;
}

// 互補誤差函數（Abramowitz & Stegun 7.1.26），用來把卡方值換算成 P 值
function erfc(x) {
    const t = 1 / (1 + 0.3275911 * x);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-x * x);
}


// ===== 簡單線性迴歸 y = intercept + slope × x =====
// 回傳 { slope, intercept, ciLow, ciHigh, p }，人數不夠時 slope 等都是 0、p 是 'N/A'
function linearRegression(xs, ys) {
    const result = { slope: 0, intercept: 0, ciLow: 0, ciHigh: 0, p: 'N/A' };
    const n = xs.length;
    if (n <= 2) {
        return result;
    }
    const mx = mean(xs), my = mean(ys);
    let ssXX = 0, ssYY = 0, ssXY = 0;
    for (let i = 0; i < n; i++) {
        ssXX += (xs[i] - mx) * (xs[i] - mx);
        ssYY += (ys[i] - my) * (ys[i] - my);
        ssXY += (xs[i] - mx) * (ys[i] - my);
    }
    if (ssXX === 0) {
        return result;   // X 全部一樣，畫不出斜線
    }
    result.slope = ssXY / ssXX;
    result.intercept = my - result.slope * mx;
    const residualSD = Math.sqrt(Math.max(0, (ssYY - result.slope * ssXY) / (n - 2)));
    const seBeta = residualSD / Math.sqrt(ssXX);
    result.ciLow = result.slope - 1.96 * seBeta;
    result.ciHigh = result.slope + 1.96 * seBeta;
    // 跟 t 檢定一樣用常態近似
    result.p = approxPValue(seBeta > 0 ? result.slope / seBeta : 0);
    return result;
}
