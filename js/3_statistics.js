// ============================================================
// 3_statistics.js：統計公式
// 這個檔案是數學公式，【不用看懂也可以用】
// 其他檔案只要知道這幾個功能「丟什麼進去、拿什麼出來」：
//
//   getNumbers(人群, 'bmi')             → 這群人的 BMI 數字清單（缺漏的自動去掉）
//   mean(數字清單)                      → 平均
//   sd(數字清單)                        → 標準差（除以 n-1）
//   calculateTTestP(第1組, 第2組, 'bmi') → 兩組 BMI 比較的 P 值文字，例如 '0.032'、'< 0.001'（= SAS 的 Satterthwaite）
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


// ===== 連續變項：兩組平均的 t 檢定（不假設變異數相等）=====
// 就是 SAS PROC TTEST 報表裡 Method = Satterthwaite（Variances = Unequal）那一列
//   自由度用 Satterthwaite 公式算（會有小數），再用真正的 t 分佈算 P 值
function calculateTTestP(group1, group2, key) {
    const x1 = getNumbers(group1, key);
    const x2 = getNumbers(group2, key);
    // 每組至少要 2 個人才算得出變異數（SAS 也一樣）
    if (x1.length < 2 || x2.length < 2) {
        return 'N/A';
    }
    const n1 = x1.length, n2 = x2.length;
    const a = variance(x1) / n1, b = variance(x2) / n2;
    if (a + b === 0) {
        return '1.000';   // 兩組每個人數值都一樣，沒辦法檢定
    }
    const t = (mean(x1) - mean(x2)) / Math.sqrt(a + b);
    const df = (a + b) * (a + b) / (a * a / (n1 - 1) + b * b / (n2 - 1));
    return formatPValue(tTestP(t, df));
}

// P 值（數字）→ 顯示用的文字，例如 0.1259 → '0.126'；很小時顯示 '< 0.001'
function formatPValue(p) {
    if (p < 0.001) {
        return '< 0.001';
    }
    return p.toFixed(3);
}


// ===== t 分佈（查表用的數學，不用看懂）=====

// 雙尾 t 檢定 P 值：t 值、自由度 df（可以有小數）
function tTestP(t, df) {
    return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

// 95% 信賴區間要用的 t 值（自由度很大時接近 1.96）：用二分法找雙尾 P = 0.05 的 t
function tCritical95(df) {
    let low = 0, high = 1000;
    for (let i = 0; i < 100; i++) {
        const middle = (low + high) / 2;
        if (tTestP(middle, df) > 0.05) {
            low = middle;
        } else {
            high = middle;
        }
    }
    return (low + high) / 2;
}

// log(Gamma(x))，Lanczos 公式
function logGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
        -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x;
    const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
        y += 1;
        ser += c[j] / y;
    }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// 正規化不完全 Beta 函數 I_x(a, b)，t 分佈的 P 值靠它算
function incompleteBeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b)
        + a * Math.log(x) + b * Math.log(1 - x));
    // 用連分數算；x 太大時換邊算比較準
    if (x < (a + 1) / (a + b + 2)) {
        return front * betaContinuedFraction(x, a, b) / a;
    }
    return 1 - front * betaContinuedFraction(1 - x, b, a) / b;
}

// 不完全 Beta 函數的連分數（Numerical Recipes 的 betacf）
function betaContinuedFraction(x, a, b) {
    const tiny = 1e-300;
    let c = 1;
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < tiny) d = tiny;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 300; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < tiny) d = tiny;
        c = 1 + aa / c;
        if (Math.abs(c) < tiny) c = tiny;
        d = 1 / d;
        h *= d * c;
        aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
        d = 1 + aa * d;
        if (Math.abs(d) < tiny) d = tiny;
        c = 1 + aa / c;
        if (Math.abs(c) < tiny) c = tiny;
        d = 1 / d;
        const change = d * c;
        h *= change;
        if (Math.abs(change - 1) < 1e-12) break;
    }
    return h;
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
    // 跟 SAS PROC REG 一樣用 t 分佈，自由度 = n - 2
    const tValue = tCritical95(n - 2);
    result.ciLow = result.slope - tValue * seBeta;
    result.ciHigh = result.slope + tValue * seBeta;
    if (seBeta > 0) {
        result.p = formatPValue(tTestP(result.slope / seBeta, n - 2));
    } else {
        result.p = result.slope === 0 ? '1.000' : '< 0.001';   // 每個點剛好在線上
    }
    return result;
}
