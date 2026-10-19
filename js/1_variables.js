// ============================================================
// 1_variables.js：問卷變項清單
// 要新增、刪除、改名變項，只要改這個檔案
// ============================================================

// 連續變項：Table 1 顯示「平均 ± 標準差」，用 t 檢定
//   key    = data.json 裡的欄位名稱
//   name   = Table 1 和選單上顯示的中文名稱
//   label  = 圖表座標軸上顯示的英文名稱
//   cutoff = 選它來分組時，預設的切點
//   digits = 小數要顯示幾位（沒寫就是 1 位）
//   section = 在 Table 1 這一列「上面」加一個分段標題
const CONT_VARS = [
    { key: 'age', name: '年齡 (Age, years)', label: 'Age (years)', cutoff: 65 },
    { key: 'weight', name: '體重 (Weight, kg)', label: 'Weight (kg)', cutoff: 60 },
    { key: 'height', name: '身高 (Height, m)', label: 'Height (m)', cutoff: 1.6, digits: 2 },
    { key: 'bmi', name: '身體質量指數 (BMI, kg/m²)', label: 'BMI (kg/m²)', cutoff: 24 },
    { key: 'cat', name: 'CAT 量表總分', label: 'CAT Score', cutoff: 10, section: '問卷分數' },
    { key: 'mmrc', name: 'mMRC 呼吸困難', label: 'mMRC', cutoff: 2 },
    { key: 'sgrq', name: '聖喬治呼吸問卷 (SGRQ)', label: 'SGRQ', cutoff: 25 },
];

// 本人病史：0 = 否，1 = 是
//   key  = data.json 裡的欄位名稱
//   code = 問卷上的變項名稱
//   name = 中文名稱
const DISEASE_VARS = [
    { key: 'htn', code: 'HTN', name: '高血壓' },
    { key: 'dm', code: 'DM', name: '糖尿病' },
    { key: 'hyperlipidemia', code: 'Hyperlipidemia', name: '高血脂症' },
    { key: 'heart', code: 'Heart', name: '心臟病' },
    { key: 'stroke', code: 'Stroke', name: '腦中風' },
    { key: 'kidney', code: 'Kidney', name: '腎臟疾病' },
    { key: 'hbv', code: 'HBV', name: 'B 型肝炎' },
    { key: 'hcv', code: 'HCV', name: 'C 型肝炎' },
    { key: 'psyche', code: 'Psyche', name: '精神疾病' },
    { key: 'asthma', code: 'Asthma', name: '氣喘' },
    { key: 'bronchitis', code: 'Bronchitis', name: '支氣管炎' },
    { key: 'pneumonia', code: 'Pneumonia', name: '肺炎' },
    { key: 'bronchiectasis', code: 'Bronchiectasis', name: '支氣管擴張' },
    { key: 'pul_embolism', code: 'Pul Embolism', name: '肺栓塞' },
    { key: 'allergic_rhinitis', code: 'Allergic Rhinitis', name: '過敏性鼻炎' },
    { key: 'allergic_conjunctivitis', code: 'Allergic Conjunctivitis', name: '過敏性結膜炎' },
    { key: 'atopic_dermatitis', code: 'Atopic Dermatitis', name: '異位性皮膚炎' },
    { key: 'urticaria', code: 'Urticaria', name: '蕁麻疹' },
];

// 癌症在資料庫裡是 0~20 的代碼，Table 1 只看「有沒有任何一種癌症」
const CANCER_ROW = { key: 'any_cancer', code: 'Cancer', name: '癌症 (任一種)' };

// Table 1 病史區要列出的順序：前 9 個病史 → 癌症 → 其他病史
const BIN_VARS = DISEASE_VARS.slice(0, 9).concat([CANCER_ROW], DISEASE_VARS.slice(9));


// ===== 小工具（其他檔案都會用到）=====

// 這個值是不是一個有效的數字？（空白、缺漏都算不是）
function isNum(value) {
    return value !== null && value !== undefined && value !== '' && !isNaN(value);
}

// 拿某位受試者的某個變項值
// 「any_cancer」不在資料裡，要從 cancer 代碼換算：0 → 0（沒有），1~20 → 1（有）
function getValue(person, key) {
    if (key !== 'any_cancer') {
        return person[key];
    }
    if (person.cancer === null || person.cancer === undefined) {
        return null;
    }
    if (person.cancer > 0) {
        return 1;
    }
    return 0;
}

// 用 key 找到變項的設定（例如 'bmi' → { key: 'bmi', name: '身體質量指數…', … }）
function findVar(key) {
    for (const v of CONT_VARS.concat(BIN_VARS)) {
        if (v.key === key) {
            return v;
        }
    }
    return null;
}

// 圖表上要顯示的名字
function varLabel(key) {
    if (key === 'sex') {
        return '性別';
    }
    const v = findVar(key);
    if (v === null) {
        return key;
    }
    return v.label || v.name;
}

// 是不是類別變項（性別、病史）？類別變項分組時不用切點
function isCategorical(key) {
    if (key === 'sex') {
        return true;
    }
    for (const v of BIN_VARS) {
        if (v.key === key) {
            return true;
        }
    }
    return false;
}
