// ============================================================
// 6_export.js：右上角「匯出 SAS」按鈕、摘要的「複製」按鈕
// ============================================================


// 產生一個 .sas 檔案讓使用者下載
// 注意：目前 SAS 程式寫死「年齡 ≥ 65 分組」和「sgrq 對 cat 迴歸」，不會跟著畫面選單改變
function exportSAS() {
    // 病史變項名稱排成一行，例如 'htn dm hyperlipidemia … any_cancer'
    const diseaseNames = [];
    for (const d of DISEASE_VARS) {
        diseaseNames.push(d.key);
    }
    diseaseNames.push('any_cancer');
    const diseaseList = diseaseNames.join(' ');

    // 下面反引號 ` ` 中間的文字，就是 SAS 檔案的內容（原樣照抄）
    const code = `/* ======================================================= */
/* Clinical Data Analysis Export Script (.sas)               */
/* COPD Questionnaire - Crude Analysis                       */
/* ======================================================= */

DATA analysis_ready;
    SET copd.subjects;

    /* Age (today - birthdate) and BMI (kg / m^2) */
    age = INT(YRDIF(birthdate, TODAY(), 'AGE'));
    IF weight > 0 AND height > 0 THEN bmi = weight / (height**2);
    any_cancer = (cancer > 0);

    /* Grouping: age >= 65 */
    IF age >= 65 THEN group_var = 1;
    ELSE group_var = 0;
RUN;

/* Continuous variables: t-test */
PROC TTEST DATA=analysis_ready;
    CLASS group_var;
    VAR age weight height bmi cat mmrc sgrq;
RUN;

/* Categorical variables: chi-square / Fisher exact */
PROC FREQ DATA=analysis_ready;
    TABLES group_var * (sex ${diseaseList}) / CHISQ FISHER;
RUN;

/* Crude Linear Regression Analysis */
PROC REG DATA=analysis_ready;
    MODEL sgrq = cat;
RUN;
`;
    downloadText(code, 'clinical_crude_analysis.sas');
}


// 把一段文字變成檔案下載（瀏覽器的固定寫法，照抄即可）
function downloadText(text, fileName) {
    const file = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
}


// 把自動摘要複製到剪貼簿
function copyAbstract() {
    const text = document.getElementById('abstract-text').innerText;
    navigator.clipboard.writeText(text).then(function () {
        alert('摘要已複製！');
    });
}
