// ============================================================
// 6_export.js：右上角「匯出 SAS」按鈕、摘要的「複製」按鈕
// ============================================================


// SAS 要讀的 CSV 檔放在哪裡（瀏覽器不知道電腦裡的路徑，所以寫在這裡）
// 換資料夾或換 CSV 檔名時，改這兩行就好；也可以直接改下載後 .sas 檔最上面的 %let 兩行
const SAS_CSV_FOLDER = 'C:\\Users\\CHUN\\BDDE39_midterm_project';
const SAS_CSV_FILE = 'COPDCO_115.10.15-example.csv';


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

/* ------------------------------------------------------- */
/* Step 1: CSV file location (change here if it moves)     */
/*   path = folder that holds the CSV (no \\ at the end)    */
/*   file = CSV file name (include .csv)                   */
/* ------------------------------------------------------- */
%let path = ${SAS_CSV_FOLDER};
%let file = ${SAS_CSV_FILE};

OPTIONS VALIDVARNAME=V7;   /* "Pul Embolism" -> Pul_Embolism */
ods html;

PROC IMPORT OUT=copd0
    DATAFILE="&path\\&file"
    DBMS=csv REPLACE;
    GETNAMES=yes;
    GUESSINGROWS=MAX;
RUN;

DATA analysis_ready;
    SET copd0;

    /* Age (today - birthdate) and BMI (kg / m^2) */
    age = INT(YRDIF(birthdate, TODAY(), 'AGE'));
    IF weight > 0 AND height > 0 THEN bmi = weight / (height**2);
    any_cancer = (cancer > 0);

    /* Grouping: age >= 65 */
    IF age >= 65 THEN group_var = 1;
    ELSE group_var = 0;
RUN;

/* Continuous variables: t-test                            */
/* Read the "Satterthwaite" (Variances = Unequal) row:     */
/* the web page always uses this row.                      */
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
