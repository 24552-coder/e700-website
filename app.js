const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbx87h6mC7Li00_fspjb8HTZ9oD3V47Ky3-nzx2w_8u_Emm6ZGaR59RMXWDx0g1OHUefZQ/exec";

function getGasWebhookUrl() {
    const fromStorage = localStorage.getItem("GAS_WEBHOOK_URL");
    if (fromStorage && fromStorage.trim().startsWith("http")) return fromStorage.trim();
    const fromInput = document.getElementById("cfg_gas_url") ? document.getElementById("cfg_gas_url").value.trim() : "";
    if (fromInput && fromInput.startsWith("http")) return fromInput;
    return DEFAULT_GAS_URL;
}

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 12000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        if (err.name === 'AbortError') {
            throw new Error(`Google Apps Script 連線逾時 (${timeout / 1000} 秒)。請確認 Apps Script 權限已核准並已【管理部署 ➔ 編輯 ➔ 新版本】！`);
        }
        throw err;
    }
}


/**
 * 雙和醫院病歷組 - 公文 Google 郵件自動發送與進度追蹤系統
 * Frontend Interactive Controller & Data Manager (Single Page Background Dispatcher)
 */

// ----------------------------------------------------
// 0. Caseworker Directory & Auto-Fill Mapping
// ----------------------------------------------------
const gAttachmentBinaryCache = {};

function getAttachmentBase64(att) {
    if (!att) return "";
    if (att.base64Data) return att.base64Data;
    if (att.att_id && gAttachmentBinaryCache[att.att_id]) return gAttachmentBinaryCache[att.att_id];
    if (att.name && gAttachmentBinaryCache[att.name]) return gAttachmentBinaryCache[att.name];
    const cleanName = (att.name || "").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
    if (cleanName && gAttachmentBinaryCache[cleanName]) return gAttachmentBinaryCache[cleanName];

    for (const k in gAttachmentBinaryCache) {
        if (!gAttachmentBinaryCache[k]) continue;
        const cleanKey = k.replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
        if (cleanKey && (cleanKey.toLowerCase() === cleanName.toLowerCase() || k.toLowerCase().includes(cleanName.toLowerCase()))) {
            return gAttachmentBinaryCache[k];
        }
    }
    return "";
}

function pruneAttachmentCache() {
    const activeKeys = new Set();
    gIssues.forEach(issue => {
        if (issue.attachments) {
            issue.attachments.forEach(att => {
                if (att.att_id) activeKeys.add(att.att_id);
                if (att.name) activeKeys.add(att.name);
                const clean = (att.name || "").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0];
                if (clean) activeKeys.add(clean);
            });
        }
    });
    Object.keys(gAttachmentBinaryCache).forEach(key => {
        if (!activeKeys.has(key)) {
            delete gAttachmentBinaryCache[key];
        }
    });
}

function getTaiwanNowStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 上傳大型檔案至 Google Drive API (直連通道 + 分段備用，極速不卡頓版)
 */

/**
 * 無上限超速大容量檔案上傳引擎 (經由 Python 本地二元串流伺服器)
 */
async function uploadFileToLocalServer(file) {
    const cleanName = file.name.replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0];
    const serverUrl = window.location.protocol.startsWith("http") ? "/api/upload" : "http://localhost:9999/api/upload";
    
    const progressBox = document.getElementById("uploadProgressBox");
    const nameText = document.getElementById("uploadFileNameText");
    const pctText = document.getElementById("uploadPercentText");
    const fillBar = document.getElementById("uploadProgressBarFill");
    const subText = document.getElementById("uploadSubtext");
    
    if (progressBox) {
        if (nameText) nameText.textContent = `${cleanName} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
        if (pctText) pctText.textContent = "50%";
        if (fillBar) fillBar.style.width = "50%";
        if (subText) subText.textContent = "超速二元通道寫入本機硬碟中...";
        progressBox.classList.remove("hidden");
    }

    try {
        const response = await fetch(serverUrl, {
            method: "POST",
            headers: {
                "X-File-Name": encodeURIComponent(cleanName),
                "Content-Type": "application/octet-stream"
            },
            body: file
        });
        const resJson = await response.json();
        
        if (progressBox) {
            if (pctText) pctText.textContent = "100%";
            if (fillBar) fillBar.style.width = "100%";
            if (subText) subText.textContent = "🎉 下載存取連結已就緒！";
            setTimeout(() => progressBox.classList.add("hidden"), 1000);
        }
        
        if (resJson && resJson.status === "success" && resJson.fileUrl) {
            return resJson.fileUrl;
        }
        return `http://localhost:9999/uploads/${encodeURIComponent(cleanName)}`;
    } catch(err) {
        if (progressBox) progressBox.classList.add("hidden");
        console.error("Local server upload error:", err);
        return `http://localhost:9999/uploads/${encodeURIComponent(cleanName)}`;
    }
}

async function uploadLargeFileInChunks(file, gasUrl) {
    if (!gasUrl || !gasUrl.startsWith("http")) {
        throw new Error("請先至右上角【⚙️ 系統設定】貼上 Google Apps Script Webhook 網址！");
    }

    const progressBox = document.getElementById("uploadProgressBox");
    const nameText = document.getElementById("uploadFileNameText");
    const pctText = document.getElementById("uploadPercentText");
    const fillBar = document.getElementById("uploadProgressBarFill");
    const subText = document.getElementById("uploadSubtext");

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);

    if (progressBox) {
        if (nameText) nameText.textContent = `${file.name} (${sizeMb} MB)`;
        if (pctText) pctText.textContent = "0%";
        if (fillBar) fillBar.style.width = "0%";
        if (subText) subText.textContent = "建立 Google Drive 雲端極速通道...";
        progressBox.classList.remove("hidden");
    }

    try {
        // 1. 初始化 Google Drive 續傳 Session (經由 GAS Webhook 取得 uploadUrl)
        const initRes = await fetchWithTimeout(gasUrl, {
            timeout: 5000,
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
                action: "initResumableUpload",
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                fileSize: file.size
            })
        });

        const initJson = await initRes.json();
        if (initJson.status !== "success" || !initJson.uploadUrl) {
            if (progressBox) progressBox.classList.add("hidden");
            throw new Error(initJson.message || "無法取得 Google Drive 雲端上傳通道");
        }

        const uploadUrl = initJson.uploadUrl;
        const fileSize = file.size;
        // 每片 3MB 原始二元資料 (= 12 * 256KB，符合 Google Drive API 續傳倍數規範)
        const CHUNK_SIZE = 3 * 1024 * 1024;
        let start = 0;
        let finalFileUrl = "";

        while (start < fileSize) {
            const end = Math.min(start + CHUNK_SIZE, fileSize);
            const chunkSlice = file.slice(start, end);
            const percent = Math.round((end / fileSize) * 100);

            if (pctText) pctText.textContent = `${percent}%`;
            if (fillBar) fillBar.style.width = `${percent}%`;
            if (subText) subText.textContent = `正極速寫入 Google Drive 雲端 (${(end / (1024 * 1024)).toFixed(1)} / ${sizeMb} MB)...`;

            const chunkB64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const res = e.target.result;
                    resolve(res.indexOf(",") !== -1 ? res.split(",")[1] : res);
                };
                reader.onerror = (e) => reject(e);
                reader.readAsDataURL(chunkSlice);
            });

            const chunkRes = await fetchWithTimeout(gasUrl, {
                timeout: 25000,
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({
                    action: "uploadResumableChunk",
                    uploadUrl: uploadUrl,
                    chunkB64: chunkB64,
                    startByte: start,
                    endByte: end - 1,
                    totalSize: fileSize
                })
            });

            const chunkJson = await chunkRes.json();
            if (chunkJson.status === "error") {
                if (progressBox) progressBox.classList.add("hidden");
                throw new Error(chunkJson.message || "分段傳送至 Google Drive 失敗");
            }

            if (chunkJson.isComplete && chunkJson.fileUrl) {
                finalFileUrl = chunkJson.fileUrl;
                break;
            }

            start = end;
        }

        if (subText) subText.textContent = "🎉 Google Drive 寫入完成！公開權限已就緒";
        if (fillBar) fillBar.style.width = "100%";
        if (pctText) pctText.textContent = "100%";

        setTimeout(() => {
            if (progressBox) progressBox.classList.add("hidden");
        }, 1200);

        return finalFileUrl || `https://drive.google.com/file/d/view?usp=sharing`;
    } catch (err) {
        if (progressBox) progressBox.classList.add("hidden");
        throw err;
    }
}

/**
 * 分區段上傳 Base64 內容至 Google Drive API (經由 GAS Relay 通道)
 */
async function uploadBase64InChunks(fileName, mimeType, b64Data, gasUrl) {
    if (!gasUrl || !gasUrl.startsWith("http")) {
        throw new Error("請先至右上角【⚙️ 系統設定】貼上 Google Apps Script Webhook 網址！");
    }

    const progressBox = document.getElementById("uploadProgressBox");
    const nameText = document.getElementById("uploadFileNameText");
    const pctText = document.getElementById("uploadPercentText");
    const fillBar = document.getElementById("uploadProgressBarFill");
    const subText = document.getElementById("uploadSubtext");

    const rawB64 = b64Data.indexOf(",") !== -1 ? b64Data.split(",")[1] : b64Data;
    const totalBytes = Math.floor(rawB64.length * 0.75);
    const sizeMb = (totalBytes / (1024 * 1024)).toFixed(1);

    if (progressBox) {
        if (nameText) nameText.textContent = `${fileName} (${sizeMb} MB)`;
        if (pctText) pctText.textContent = "0%";
        if (fillBar) fillBar.style.width = "0%";
        if (subText) subText.textContent = "建立 Google Drive 雲端通道...";
        progressBox.classList.remove("hidden");
    }

    try {
        const initRes = await fetchWithTimeout(gasUrl, {
            timeout: 5000,
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
                action: "initResumableUpload",
                fileName: fileName,
                mimeType: mimeType || "application/octet-stream",
                fileSize: totalBytes
            })
        });

        const initJson = await initRes.json();
        if (initJson.status !== "success" || !initJson.uploadUrl) {
            if (progressBox) progressBox.classList.add("hidden");
            throw new Error(initJson.message || "無法取得 Google Drive 雲端通道");
        }

        const uploadUrl = initJson.uploadUrl;
        const B64_CHUNK_SIZE = 4 * 1024 * 1024;
        let b64Start = 0;
        let byteStart = 0;
        let finalFileUrl = "";

        while (b64Start < rawB64.length) {
            const b64End = Math.min(b64Start + B64_CHUNK_SIZE, rawB64.length);
            const subB64 = rawB64.substring(b64Start, b64End);
            const chunkByteLength = Math.floor(subB64.length * 0.75);
            const byteEnd = Math.min(byteStart + chunkByteLength, totalBytes);
            const percent = Math.round((byteEnd / totalBytes) * 100);

            if (pctText) pctText.textContent = `${percent}%`;
            if (fillBar) fillBar.style.width = `${percent}%`;
            if (subText) subText.textContent = `正寫入 Google Drive (${(byteEnd / (1024 * 1024)).toFixed(1)} / ${sizeMb} MB)...`;

            const chunkRes = await fetchWithTimeout(gasUrl, {
                timeout: 25000,
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({
                    action: "uploadResumableChunk",
                    uploadUrl: uploadUrl,
                    chunkB64: subB64,
                    startByte: byteStart,
                    endByte: byteEnd - 1,
                    totalSize: totalBytes
                })
            });

            const chunkJson = await chunkRes.json();
            if (chunkJson.status === "error") {
                if (progressBox) progressBox.classList.add("hidden");
                throw new Error(chunkJson.message || "傳送 Google Drive 失敗");
            }

            if (chunkJson.isComplete && chunkJson.fileUrl) {
                finalFileUrl = chunkJson.fileUrl;
                break;
            }

            b64Start = b64End;
            byteStart = byteEnd;
        }

        if (subText) subText.textContent = "🎉 Google Drive 寫入完成！";
        if (fillBar) fillBar.style.width = "100%";
        if (pctText) pctText.textContent = "100%";

        setTimeout(() => {
            if (progressBox) progressBox.classList.add("hidden");
        }, 1200);

        return finalFileUrl;
    } catch (err) {
        if (progressBox) progressBox.classList.add("hidden");
        throw err;
    }
}



const CASEWORKER_DIRECTORY = [
    { name: "陽書湘", email: "14301@s.tmu.edu.tw", ext: "2037" },
    { name: "錢佩妤", email: "19020@s.tmu.edu.tw", ext: "2043" },
    { name: "錢佩好", email: "19020@s.tmu.edu.tw", ext: "2043" },
    { name: "何秀英", email: "12254@s.tmu.edu.tw", ext: "2043" }
];

function cleanAssigneeName(name) {
    if (!name) return "";
    let clean = String(name).replace(/\s*\([\s\S]*?\)/g, "").trim();
    if (clean === "無法" || clean === "無" || clean === "-" || clean === "undefined" || clean === "null") return "";
    return clean;
}

function getCaseworkerInfo(name) {
    if (!name) return null;
    const clean = cleanAssigneeName(name);
    return CASEWORKER_DIRECTORY.find(c => c.name === clean);
}

// ----------------------------------------------------
// 1. Initial Mock Data
// ----------------------------------------------------
const DEFAULT_MAIN_DOCS = [
    {
        doc_receive_no: "1150009463",
        doc_create_no: "1151294569",
        doc_sender_org: "勞動部勞工保險局",
        doc_receive_date: "2026-09-01",
        doc_issue_date: "2026-09-03",
        doc_issue_no: "保職失字第11560220220號",
        doc_subject: "本局為正確、迅速審核被保險人李銀雪君勞保失能給付需要，敬請貴院就說明三於文到15日內儘速寄送相關資料及病歷影本...",
        doc_chart_no: "17525415",
        doc_patient_name: "李銀雪",
        doc_chart_status: "已調閱",
        doc_assignee: "錢佩妤",
        doc_fee: 1000,
        doc_labor_no: "115031019735號",
        doc_reply_no: "",
        doc_reply_date: "",
        doc_remark: "",
        doc_status: "處理中",
        doc_attachments: [
            { name: "1150009463_正本公文.pdf", size: 1540000, isDriveLink: false }
        ],
        created_at: "2026-09-04 11:11",
        updated_at: "2026-09-04 11:11"
    },
    {
        doc_receive_no: "1150008387",
        doc_create_no: "1151288412",
        doc_sender_org: "勞動部勞工保險局",
        doc_receive_date: "2026-08-20",
        doc_issue_date: "2026-08-22",
        doc_issue_no: "保職傷字第11560199821號",
        doc_subject: "請惠予提供個案黃登科君至貴院就診之全份病歷資料乙案。",
        doc_chart_no: "17961475",
        doc_patient_name: "黃登科",
        doc_chart_status: "影本提供",
        doc_assignee: "錢佩妤",
        doc_fee: 1000,
        doc_labor_no: "115031008892號",
        doc_reply_no: "1151202001",
        doc_reply_date: "2026-09-02",
        doc_remark: "已完成結案存檔",
        doc_status: "已完成",
        doc_attachments: [],
        created_at: "2026-08-20 09:13",
        updated_at: "2026-09-02 15:08"
    },
    {
        doc_receive_no: "1150008530",
        doc_create_no: "1151280011",
        doc_sender_org: "衛生福利部疾病管制署",
        doc_receive_date: "2026-08-11",
        doc_issue_date: "2026-08-11",
        doc_issue_no: "疾管字第1150119827號",
        doc_subject: "請惠予提供許榮民君至貴院就診之全份病歷資料乙案。",
        doc_chart_no: "00118437",
        doc_patient_name: "許榮民",
        doc_chart_status: "已調閱",
        doc_assignee: "陽書湘",
        doc_fee: 0,
        doc_labor_no: "",
        doc_reply_no: "",
        doc_reply_date: "",
        doc_remark: "115/08/17郵寄病歷，請存查。",
        doc_status: "處理中",
        doc_attachments: [],
        created_at: "2026-08-11 11:54",
        updated_at: "2026-08-11 11:54"
    },
    {
        doc_receive_no: "1150008873",
        doc_create_no: "1151284562",
        doc_sender_org: "勞動部勞工保險局",
        doc_receive_date: "2026-08-20",
        doc_issue_date: "2026-08-20",
        doc_issue_no: "保職傷字第11508873號",
        doc_subject: "請協助回覆童媧如君因「左側肩部旋轉環帶撕裂」申請傷病給付案。",
        doc_chart_no: "01353945",
        doc_patient_name: "童媧如",
        doc_chart_status: "待調閱",
        doc_assignee: "陽書湘",
        doc_fee: 1000,
        doc_labor_no: "11503108873號",
        doc_reply_no: "",
        doc_reply_date: "",
        doc_remark: "催辦中",
        doc_status: "處理中",
        doc_attachments: [],
        created_at: "2026-08-20 17:16",
        updated_at: "2026-08-22 08:00"
    }
];

const DEFAULT_ISSUES = [
    {
        issue_id: "INQ-1788420295830",
        doc_receive_no: "1150008387",
        doc_issue_date: "2026-08-20",
        doc_chart_no: "17961475",
        doc_patient_name: "黃登科",
        doctor_name: "林家倫",
        doctor_email: "24552@s.tmu.edu.tw",
        cc_email1: "19020@s.tmu.edu.tw",
        cc_email2: "",
        creator_name: "錢佩好",
        creator_ext: "2043",
        creator_email: "19020@s.tmu.edu.tw",
        question: "請問但高嗎？是否符合職業傷害門診評估診斷？",
        doctor_reply: "同意。查病患相關指數正常，已完成病情開立。(2026/09/03 15:44:33)",
        remark: "醫師已補件完成",
        status: "已完成",
        due_date: "2026-08-25",
        sent_at: "2026-08-20 14:00",
        replied_at: "2026-09-03 15:44",
        last_reminded_at: "",
        remind_count: 0,
        created_at: "2026-08-20 13:50",
        return_reason: "回附太簡略",
        attachments: [
            { name: "公文附件.pdf", size: 850000, isDriveLink: false }
        ]
    },
    {
        issue_id: "INQ-1788412852422",
        doc_receive_no: "1150008826",
        doc_issue_date: "2026-09-04",
        doc_chart_no: "08173054",
        doc_patient_name: "佩好事務員",
        doctor_name: "錢佩好",
        doctor_email: "19020@s.tmu.edu.tw",
        cc_email1: "24452@s.tmu.edu.tw",
        cc_email2: "",
        creator_name: "錢佩好",
        creator_ext: "2043",
        creator_email: "19020@s.tmu.edu.tw",
        question: "看到病歷請回答",
        doctor_reply: "已回覆檢視完畢，無異常。",
        remark: "大型附件模式測試",
        status: "已回覆",
        due_date: "2026-09-08",
        sent_at: "2026-09-04 09:19",
        replied_at: "2026-09-04 10:30",
        last_reminded_at: "",
        remind_count: 0,
        created_at: "2026-09-04 09:10",
        return_reason: "",
        attachments: [
            { name: "1131025萬芳3.jpg (大型檔案 — Google Drive 雲端連結)", size: 12500000, isDriveLink: true, url: "" },
            { name: "1131025萬芳4.jpg (大型檔案 — Google Drive 雲端連結)", size: 15800000, isDriveLink: true, url: "" }
        ]
    },
    {
        issue_id: "INQ-1788530991200",
        doc_receive_no: "1150008530",
        doc_issue_date: "2026-08-11",
        doc_chart_no: "00118437",
        doc_patient_name: "許榮民",
        doctor_name: "鄭景泉",
        doctor_email: "16044@s.tmu.edu.tw",
        cc_email1: "10140@s.tmu.edu.tw",
        cc_email2: "",
        creator_name: "陽書湘",
        creator_ext: "2037",
        creator_email: "14301@s.tmu.edu.tw",
        question: "鄭景泉醫師您好，請協助回覆問題，謝謝。本所為防疫業務需要，惠請貴院提供許榮民肺結核個案於貴院病歷、CXR、病理報告等相關報告，請查照。1.請協助確認病歷可否釋出？請惠示醫理見解。",
        doctor_reply: "",
        remark: "",
        status: "已發送",
        due_date: "2026-08-15",
        sent_at: "2026-08-11 11:56",
        replied_at: "",
        last_reminded_at: "",
        remind_count: 0,
        created_at: "2026-08-11 11:54",
        return_reason: "",
        attachments: []
    },
    {
        issue_id: "INQ-1788873009112",
        doc_receive_no: "1150008873",
        doc_issue_date: "2026-08-20",
        doc_chart_no: "01353945",
        doc_patient_name: "童媧如",
        doctor_name: "王智毅",
        doctor_email: "19036@s.tmu.edu.tw",
        cc_email1: "14301@s.tmu.edu.tw",
        cc_email2: "09185@s.tmu.edu.tw",
        creator_name: "錢佩好",
        creator_ext: "2043",
        creator_email: "19020@s.tmu.edu.tw",
        question: "王智毅醫師您好，請協助回覆問題。童媧如 因「左側肩部旋轉環帶撕裂(工作中發生，屬職業傷害)、左肩旋轉肌袖撕裂」在貴院診療並檢具貴院出具之診斷書申請傷病給付。1.童君就診有無主訴傷害事故？ 2.發生日期及原因為何？ 3.所患「左側肩部旋轉環帶撕裂(工作中發生，屬職業傷害)、左肩旋轉肌袖撕裂」是否係因主訴之傷害事故所致？ 4.童君因上開傷病治療經過為何？ 5.有無併發症或後遺症？ 6.療養至何時起可從事一般工作？ 7.認定理由及依據為何？ 請惠示醫理見解。因案件有效性，請於儘快回覆，感謝您。",
        doctor_reply: "",
        remark: "已發送催辦提醒",
        status: "已發送",
        due_date: "2026-08-21",
        sent_at: "2026-08-20 17:16",
        replied_at: "",
        last_reminded_at: "2026-08-22 08:00",
        remind_count: 2,
        created_at: "2026-08-20 17:16",
        return_reason: "",
        attachments: [
            { name: "公文附件 (請見信件夾帶檔案)", size: 500000, isDriveLink: false }
        ]
    }
];

const STORAGE_MAIN_DOCS = "TMU_MAIN_DOCS_V5";
const STORAGE_ISSUES = "TMU_ISSUES_V5";

let gMainDocs = [];
let gIssues = [];
let gExpandedRows = new Set();
let gCurrentFilter = { search: "", assignee: "", docStatus: "", issueStatus: "", cardType: "all" };
let gTempPendingEmailAction = null;

// ----------------------------------------------------
// 2. Initialization & Data Loading
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    loadDataFromStorage();
    initUIEvents();
    renderDashboard();
    renderTable();
    checkOverdueAlerts();
    startAutoSyncTimer();
});

let gAutoSyncInterval = null;
function startAutoSyncTimer() {
    // 每 10 秒在背景自動靜默掃描 Gmail 醫師回信 (不需要人工按按鈕)
    if (gAutoSyncInterval) clearInterval(gAutoSyncInterval);
    gAutoSyncInterval = setInterval(() => {
        syncGmailReplies(true);
    }, 10000);
}

function loadDataFromStorage() {
    const docsJson = localStorage.getItem(STORAGE_MAIN_DOCS);
    const issuesJson = localStorage.getItem(STORAGE_ISSUES);

    if (docsJson) {
        try { gMainDocs = JSON.parse(docsJson); } catch (e) { gMainDocs = []; }
    }
    if (!gMainDocs || !Array.isArray(gMainDocs) || gMainDocs.length === 0) {
        gMainDocs = JSON.parse(JSON.stringify(DEFAULT_MAIN_DOCS));
    }

    if (issuesJson) {
        try { gIssues = JSON.parse(issuesJson); } catch (e) { gIssues = []; }
    }
    if (!gIssues || !Array.isArray(gIssues) || gIssues.length === 0) {
        gIssues = JSON.parse(JSON.stringify(DEFAULT_ISSUES));
    }

    gIssues.forEach(i => {
        if (i.attachments) {
            i.attachments.forEach(att => {
                if (att.base64Data) {
                    const key = att.att_id || att.name;
                    if (key) gAttachmentBinaryCache[key] = att.base64Data;
                    delete att.base64Data;
                }
            });
        }
    });

    gMainDocs.forEach(doc => {
        if (doc.doc_assignee) {
            doc.doc_assignee = cleanAssigneeName(doc.doc_assignee);
        }
    });

    gIssues.forEach(i => {
        if (i.creator_name) {
            i.creator_name = cleanAssigneeName(i.creator_name);
        }
        if (i.doctor_reply) {
            i.doctor_reply = cleanDoctorReplyText(i.doctor_reply);
        }
    });

    // 嚴格執行業務規則：醫師回覆 (已回覆) 不等於結案！必須承辦人按【結案】公文狀態才能切換為「已完成」
    gMainDocs.forEach(doc => {
        if (doc.doc_status === "已完成") {
            const docIssues = gIssues.filter(i => i.doc_receive_no === doc.doc_receive_no);
            if (docIssues.length > 0 && !docIssues.every(i => i.status === "已完成")) {
                doc.doc_status = "處理中";
            }
        }
    });

        gIssues.forEach(issue => {
        if (issue.attachments && issue.attachments.length > 0) {
            const map = new Map();
            issue.attachments.forEach(att => {
                const clean = (att.name || "").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
                if (clean) {
                    if (!map.has(clean) || att.url) {
                        map.set(clean, att);
                    }
                }
            });
            issue.attachments = Array.from(map.values());
        }
    });

    pruneAttachmentCache();
}

function resetDefaultData() {
    if (confirm("確定要重置並還原預設公文與函詢測試資料嗎？")) {
        gMainDocs = JSON.parse(JSON.stringify(DEFAULT_MAIN_DOCS));
        gIssues = JSON.parse(JSON.stringify(DEFAULT_ISSUES));
        saveDataToStorage();
        renderDashboard();
        renderTable();
        populateAssigneeOptions();
        showToast("🎉 已成功重置並還原預設公文資料清單！", "success");
    }
}

function saveDataToStorage() {
    try {
        gIssues.forEach(issue => {
            if (issue.attachments) {
                issue.attachments.forEach(att => {
                    if (att.base64Data) {
                        const clean = (att.name || "").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0];
                        if (att.att_id) gAttachmentBinaryCache[att.att_id] = att.base64Data;
                        if (att.name) gAttachmentBinaryCache[att.name] = att.base64Data;
                        if (clean) gAttachmentBinaryCache[clean] = att.base64Data;
                        delete att.base64Data;
                    }
                });
            }
        });
        localStorage.setItem(STORAGE_MAIN_DOCS, JSON.stringify(gMainDocs));
        localStorage.setItem(STORAGE_ISSUES, JSON.stringify(gIssues));
    } catch (e) {
        console.error("Storage error:", e);
    }
        gIssues.forEach(issue => {
        if (issue.attachments && issue.attachments.length > 0) {
            const map = new Map();
            issue.attachments.forEach(att => {
                const clean = (att.name || "").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
                if (clean) {
                    if (!map.has(clean) || att.url) {
                        map.set(clean, att);
                    }
                }
            });
            issue.attachments = Array.from(map.values());
        }
    });

    pruneAttachmentCache();
}

// ----------------------------------------------------
// 3. UI Events & Filtering
// ----------------------------------------------------
function initUIEvents() {
    document.getElementById("btnNewMainDoc").addEventListener("click", () => openMainDocModal());
    document.getElementById("btnExportWeekly").addEventListener("click", () => exportWeeklyExcel());
    document.getElementById("btnSettings").addEventListener("click", () => openModal("modalSettings"));
    if (document.getElementById("btnSyncGmail")) {
        document.getElementById("btnSyncGmail").addEventListener("click", () => syncGmailReplies());
    }

    const cfgGasInput = document.getElementById("cfg_gas_url");
    if (cfgGasInput) {
        const syncGas = () => {
            const val = cfgGasInput.value.trim();
            if (val) localStorage.setItem("GAS_WEBHOOK_URL", val);
        };
        cfgGasInput.addEventListener("input", syncGas);
        cfgGasInput.addEventListener("change", syncGas);
    }

    document.getElementById("searchInput").addEventListener("input", (e) => {
        gCurrentFilter.search = e.target.value.trim().toLowerCase();
        renderTable();
    });
    document.getElementById("filterAssignee").addEventListener("change", (e) => {
        gCurrentFilter.assignee = e.target.value;
        renderTable();
    });
    document.getElementById("filterDocStatus").addEventListener("change", (e) => {
        gCurrentFilter.docStatus = e.target.value;
        renderTable();
    });
    document.getElementById("filterIssueStatus").addEventListener("change", (e) => {
        gCurrentFilter.issueStatus = e.target.value;
        renderTable();
    });
    document.getElementById("btnClearFilters").addEventListener("click", () => {
        document.getElementById("searchInput").value = "";
        document.getElementById("filterAssignee").value = "";
        document.getElementById("filterDocStatus").value = "";
        document.getElementById("filterIssueStatus").value = "";
        gCurrentFilter = { search: "", assignee: "", docStatus: "", issueStatus: "", cardType: "all" };
        renderTable();
    });

    setupCaseworkerAutoFill();
    populateAssigneeOptions();
}

function setupCaseworkerAutoFill() {
    const autoFill = (nameInputId, emailInputId, extInputId) => {
        const inputEl = document.getElementById(nameInputId);
        if (!inputEl) return;
        const trigger = () => {
            const rawVal = inputEl.value;
            const clean = cleanAssigneeName(rawVal);
            const info = CASEWORKER_DIRECTORY.find(c => c.name === clean);
            if (info) {
                inputEl.value = info.name;
                if (emailInputId && document.getElementById(emailInputId)) {
                    document.getElementById(emailInputId).value = info.email;
                }
                if (extInputId && document.getElementById(extInputId)) {
                    document.getElementById(extInputId).value = info.ext;
                }
            }
        };

        inputEl.addEventListener("input", trigger);
        inputEl.addEventListener("change", trigger);
    };

    autoFill("doc_assignee", null, null);
    autoFill("issue_creator_name", "issue_creator_email", "issue_creator_ext");
}

function populateAssigneeOptions() {
    const assigneeSelect = document.getElementById("filterAssignee");
    const assignees = new Set(["陽書湘", "錢佩妤", "何秀英"]);

    gMainDocs.forEach(d => {
        const clean = cleanAssigneeName(d.doc_assignee);
        if (clean) assignees.add(clean);
    });
    gIssues.forEach(i => {
        const clean = cleanAssigneeName(i.creator_name);
        if (clean) assignees.add(clean);
    });

    assigneeSelect.innerHTML = `<option value="">承辦人員 (全部)</option>`;
    assignees.forEach(name => {
        assigneeSelect.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
    });
}

function filterByCard(cardType) {
    gCurrentFilter.cardType = cardType;
    renderTable();
}

// ----------------------------------------------------
// 4. Calculations
// ----------------------------------------------------
function calculateDocProgress(receiveNo) {
    const mainDoc = gMainDocs.find(d => d.doc_receive_no === receiveNo);
    if (!mainDoc) return { text: "-", isCompleted: false, count: 0, total: 0 };

    if (mainDoc.doc_status === "不需醫師已完成") {
        return { text: "不需醫師已完成", isCompleted: true, count: 0, total: 0 };
    }

    const docIssues = gIssues.filter(i => i.doc_receive_no === receiveNo);
    if (docIssues.length === 0) {
        if (mainDoc.doc_status === "已完成") return { text: "已完成結案", isCompleted: true, count: 0, total: 0 };
        return { text: "無函詢項目", isCompleted: false, count: 0, total: 0 };
    }

    let completedCount = 0;
    docIssues.forEach(i => {
        if (i.status === "已完成") completedCount++; // 只有承辦人按下【結案】才算完成！
    });

    const total = docIssues.length;
    const percent = Math.round((completedCount / total) * 100);
    const isCompleted = (mainDoc.doc_status === "已完成") || (completedCount === total && total > 0);

    return { text: `${completedCount}/${total} (${percent}%)`, isCompleted: isCompleted, count: completedCount, total: total, percent: percent };
}

function isIssueOverdue(issue) {
    if (issue.status === "已完成" || issue.status === "已回覆") return false;
    if (!issue.sent_at) return false;
    const sentDate = new Date(issue.sent_at);
    const now = new Date();
    return ((now - sentDate) / (1000 * 60 * 60)) >= 24;
}

// ----------------------------------------------------
// 5. Dashboard & Render
// ----------------------------------------------------
function renderDashboard() {
    const totalCases = gMainDocs.length;
    const totalIssues = gIssues.length;
    const repliedCount = gIssues.filter(i => i.status === "已回覆").length;
    const completedCases = gMainDocs.filter(d => d.doc_status === "已完成" || d.doc_status === "不需醫師已完成").length;
    const processingCases = totalCases - completedCases;

    document.getElementById("kpiTotalCases").textContent = totalCases;
    document.getElementById("kpiTotalIssues").textContent = totalIssues;
    document.getElementById("kpiReplied").textContent = repliedCount;
    document.getElementById("kpiCompleted").textContent = completedCases;
    document.getElementById("kpiProcessing").textContent = processingCases;
}

function checkOverdueAlerts() {
    const overdueIssues = gIssues.filter(i => isIssueOverdue(i));
    const alertBanner = document.getElementById("overdueAlertBanner");
    const countText = document.getElementById("overdueCountText");

    if (overdueIssues.length > 0) {
        alertBanner.classList.remove("hidden");
        countText.textContent = `${overdueIssues.length} 件醫師逾期未回覆 (>=1天)`;
    } else {
        alertBanner.classList.add("hidden");
    }
}

function renderTable() {
    const tbody = document.getElementById("mainDocTbody");
    tbody.innerHTML = "";

    const filteredDocs = gMainDocs.filter(doc => {
        const receiveNo = doc.doc_receive_no || "";
        const patientName = doc.doc_patient_name || "";
        const chartNo = doc.doc_chart_no || "";
        const assignee = doc.doc_assignee || "";
        const senderOrg = doc.doc_sender_org || "";
        const subject = doc.doc_subject || "";

        if (gCurrentFilter.search) {
            const q = gCurrentFilter.search;
            const docIssues = gIssues.filter(i => i.doc_receive_no === receiveNo);
            const doctorMatch = docIssues.some(i => (i.doctor_name || "").toLowerCase().includes(q) || (i.question || "").toLowerCase().includes(q));

            const mainMatch = receiveNo.toLowerCase().includes(q) ||
                patientName.toLowerCase().includes(q) ||
                chartNo.toLowerCase().includes(q) ||
                assignee.toLowerCase().includes(q) ||
                senderOrg.toLowerCase().includes(q) ||
                subject.toLowerCase().includes(q);

            if (!mainMatch && !doctorMatch) return false;
        }

        if (gCurrentFilter.assignee && !assignee.includes(gCurrentFilter.assignee)) return false;
        if (gCurrentFilter.docStatus && doc.doc_status !== gCurrentFilter.docStatus) return false;

        if (gCurrentFilter.issueStatus) {
            const docIssues = gIssues.filter(i => i.doc_receive_no === receiveNo);
            if (!docIssues.some(i => i.status === gCurrentFilter.issueStatus)) return false;
        }

        if (gCurrentFilter.cardType === "replied") {
            const docIssues = gIssues.filter(i => i.doc_receive_no === receiveNo);
            if (!docIssues.some(i => i.status === "已回覆")) return false;
        } else if (gCurrentFilter.cardType === "completed") {
            if (doc.doc_status !== "已完成" && doc.doc_status !== "不需醫師已完成") return false;
        } else if (gCurrentFilter.cardType === "processing") {
            if (doc.doc_status === "已完成" || doc.doc_status === "不需醫師已完成") return false;
        } else if (gCurrentFilter.cardType === "overdue") {
            const docIssues = gIssues.filter(i => i.doc_receive_no === receiveNo);
            if (!docIssues.some(i => isIssueOverdue(i))) return false;
        }

        return true;
    });

    document.getElementById("recordCountText").textContent = `共 ${filteredDocs.length} 筆資料`;

    if (filteredDocs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding:40px;">無符合條件之公文紀錄</td></tr>`;
        return;
    }

    filteredDocs.forEach(doc => {
        const progress = calculateDocProgress(doc.doc_receive_no);
        const isExpanded = gExpandedRows.has(doc.doc_receive_no);
        const docIssues = gIssues.filter(i => i.doc_receive_no === doc.doc_receive_no);

        let statusBadgeHtml = `<span class="badge badge-warning"><i class="fa-solid fa-hourglass-half"></i> 處理中</span>`;
        if (doc.doc_status === "不需醫師已完成") {
            statusBadgeHtml = `<span class="badge badge-success"><i class="fa-solid fa-check-double"></i> 不需醫師已完成</span>`;
        } else if (doc.doc_status === "已完成" || progress.isCompleted) {
            statusBadgeHtml = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> 已完成</span>`;
        } else if (docIssues.some(i => i.status === "已回覆")) {
            statusBadgeHtml = `<span class="badge badge-info"><i class="fa-solid fa-inbox"></i> 處理中 (醫師已回復待審核)</span>`;
        }

        let progressPillHtml = `<span class="progress-pill ${progress.isCompleted ? 'completed' : ''}">${escapeHtml(progress.text)}</span>`;

        const tr = document.createElement("tr");
        tr.className = `row-main-doc ${isExpanded ? 'expanded' : ''}`;
        tr.innerHTML = `
            <td>
                <i class="fa-solid fa-chevron-right toggle-icon ${isExpanded ? 'open' : ''}" onclick="toggleExpandRow('${escapeHtml(doc.doc_receive_no)}')"></i>
            </td>
            <td><strong>${escapeHtml(doc.doc_receive_no)}</strong></td>
            <td>${escapeHtml(doc.doc_chart_no || '-')}</td>
            <td>${escapeHtml(doc.doc_patient_name || '-')}</td>
            <td>
                <span class="badge badge-secondary" onclick="toggleExpandRow('${escapeHtml(doc.doc_receive_no)}')" style="cursor:pointer;">
                    <i class="fa-solid fa-user-doctor"></i> ${docIssues.length} 位醫師
                </span>
            </td>
            <td>${progressPillHtml}</td>
            <td>${escapeHtml(cleanAssigneeName(doc.doc_assignee) || '-')}</td>
            <td>${statusBadgeHtml}</td>
            <td>${escapeHtml(doc.created_at || '-')}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="openIssueModalForDoc('${escapeHtml(doc.doc_receive_no)}')">
                    <i class="fa-solid fa-plus"></i> 加函詢
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="openMainDocModal('${escapeHtml(doc.doc_receive_no)}')">
                    <i class="fa-solid fa-pen"></i> 編輯
                </button>
            </td>
        `;

        tbody.appendChild(tr);

        if (isExpanded) {
            const trDetail = document.createElement("tr");
            trDetail.innerHTML = `
                <td colspan="10" style="padding:0;">
                    <div class="nested-table-container">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <strong><i class="fa-solid fa-hospital-user"></i> 【公文詳細與函詢項目】收發文號：${escapeHtml(doc.doc_receive_no)}</strong>
                            <div>
                                <button class="btn btn-sm btn-success" onclick="markMainDocCompleted('${escapeHtml(doc.doc_receive_no)}')">
                                    <i class="fa-solid fa-check"></i> 直接結案 (不需醫師)
                                </button>
                                <button class="btn btn-sm btn-primary" onclick="openIssueModalForDoc('${escapeHtml(doc.doc_receive_no)}')">
                                    <i class="fa-solid fa-user-plus"></i> 新增醫師函詢問題
                                </button>
                            </div>
                        </div>
                        <div class="mb-3 text-muted" style="font-size:14.5px;">
                            <strong>來文單位：</strong>${escapeHtml(doc.doc_sender_org || '-')} |
                            <strong>發文日期：</strong>${escapeHtml(doc.doc_issue_date || '-')} |
                            <strong>主旨：</strong>${escapeHtml(doc.doc_subject || '-')}
                        </div>
                        ${renderNestedIssueTable(doc.doc_receive_no)}
                    </div>
                </td>
            `;
            tbody.appendChild(trDetail);
        }
    });
}

function toggleExpandRow(receiveNo) {
    if (gExpandedRows.has(receiveNo)) gExpandedRows.delete(receiveNo);
    else gExpandedRows.add(receiveNo);
    renderTable();
}

function renderNestedIssueTable(receiveNo) {
    const docIssues = gIssues.filter(i => i.doc_receive_no === receiveNo);

    if (docIssues.length === 0) {
        return `<div class="text-muted p-2" style="font-size:14.5px;">尚無醫師函詢項目，點選上方「新增醫師函詢問題」即可建立。</div>`;
    }

    let rowsHtml = "";
    docIssues.forEach(issue => {
        let statusSelectClass = "status-sent";
        if (issue.status === "待發送") statusSelectClass = "status-pending";
        else if (issue.status === "已發送") statusSelectClass = "status-sent";
        else if (issue.status === "已回覆") statusSelectClass = "status-replied";
        else if (issue.status === "退回補件") statusSelectClass = "status-returned";
        else if (issue.status === "已完成") statusSelectClass = "status-completed";

        const isOverdue = isIssueOverdue(issue);
        const overdueBadge = isOverdue ? `<span class="badge badge-danger ml-1"><i class="fa-solid fa-clock"></i> 逾期</span>` : "";

        const statusSelectHtml = `
            <select class="issue-status-select ${statusSelectClass}" onchange="handleDirectIssueStatusChange('${escapeHtml(issue.issue_id)}', this.value)" title="點擊即可直接修改此筆函詢狀態">
                <option value="待發送" ${issue.status === "待發送" ? "selected" : ""}>⏳ 待發送</option>
                <option value="已發送" ${issue.status === "已發送" ? "selected" : ""}>✉️ 已發送</option>
                <option value="已回覆" ${issue.status === "已回覆" ? "selected" : ""}>📥 已回覆 (待審核)</option>
                <option value="退回補件" ${issue.status === "退回補件" ? "selected" : ""}>↩️ 退回補件</option>
                <option value="已完成" ${issue.status === "已完成" ? "selected" : ""}>✅ 已完成 (結案)</option>
            </select>
        `;

        rowsHtml += `
            <tr>
                <td><strong>${escapeHtml(issue.doctor_name)}</strong><br><small class="text-muted">${escapeHtml(issue.doctor_email)}</small></td>
                <td><div style="max-width:300px;max-height:80px;overflow-y:auto;">${escapeHtml(issue.question)}</div></td>
                <td>
                    ${issue.doctor_reply ? `<div style="max-height:80px;overflow-y:auto;color:#0284c7;font-weight:500;">${escapeHtml(issue.doctor_reply)}</div>` : `<span class="text-muted">尚無回覆</span>`}
                </td>
                <td>${statusSelectHtml} ${overdueBadge}</td>
                <td>${escapeHtml(issue.sent_at || '-')}</td>
                <td>${escapeHtml(issue.replied_at || '-')}</td>
                <td>
                    <div class="action-btn-group">
                        <button class="btn btn-sm btn-outline-primary" onclick="previewEmailModal('${escapeHtml(issue.issue_id)}', 1)" title="開啟郵件/發送函詢信">
                            <i class="fa-solid fa-paper-plane"></i> 寄信
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="openIssueModalForEdit('${escapeHtml(issue.issue_id)}')" title="開啟所有欄位編輯與增減附件">
                            <i class="fa-solid fa-pen"></i> 編輯
                        </button>
                        <button class="btn btn-sm btn-outline-info" onclick="openSimulateReplyModal('${escapeHtml(issue.issue_id)}')" title="模擬醫師點信回覆">
                            <i class="fa-solid fa-reply"></i> 模擬回信
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="openReturnReasonModal('${escapeHtml(issue.issue_id)}')" title="退回醫師補件">
                            <i class="fa-solid fa-rotate-left"></i> 退回
                        </button>
                        <button class="btn btn-sm btn-outline-success" onclick="completeIssue('${escapeHtml(issue.issue_id)}')" title="審核完成結案">
                            <i class="fa-solid fa-check"></i> 結案
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    return `
        <table class="nested-table">
            <thead>
                <tr>
                    <th width="160">醫師姓名 / Email</th>
                    <th>函詢問題內容</th>
                    <th>醫師意見回覆</th>
                    <th width="150">函詢狀態 (點擊可直接修改)</th>
                    <th width="115">寄件時間</th>
                    <th width="115">回覆時間</th>
                    <th width="320">功能操作</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
    `;
}

function handleDirectIssueStatusChange(issueId, newStatus) {
    const issue = gIssues.find(i => i.issue_id === issueId);
    if (!issue) return;

    if (newStatus === "退回補件") {
        openReturnReasonModal(issueId);
        return;
    }

    if (newStatus === "已完成") {
        completeIssue(issueId);
        return;
    }

    issue.status = newStatus;
    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 16);
    if (newStatus === "已發送" && !issue.sent_at) {
        issue.sent_at = nowStr;
    } else if (newStatus === "已回覆" && !issue.replied_at) {
        issue.replied_at = nowStr;
    }

    // 重新評估公文主檔狀態
    const docIssues = gIssues.filter(i => i.doc_receive_no === issue.doc_receive_no);
    const mainDoc = gMainDocs.find(d => d.doc_receive_no === issue.doc_receive_no);
    if (mainDoc) {
        if (docIssues.length > 0 && docIssues.every(i => i.status === "已完成")) {
            mainDoc.doc_status = "已完成";
        } else {
            mainDoc.doc_status = "處理中";
        }
    }

    saveDataToStorage();
    renderDashboard();
    renderTable();
    showToast(`已成功將醫師函詢狀態變更為「${newStatus}」`, "success");
}

// ----------------------------------------------------
// 6. Main Document CRUD Operations
// ----------------------------------------------------
function openMainDocModal(receiveNo = null) {
    const form = document.getElementById("formMainDoc");
    form.reset();
    document.getElementById("mainDocFilesList").innerHTML = "";

    if (receiveNo) {
        const doc = gMainDocs.find(d => d.doc_receive_no === receiveNo);
        if (doc) {
            document.getElementById("modalMainDocTitle").textContent = "編輯公文主檔";
            document.getElementById("mainDocId").value = doc.doc_receive_no;
            document.getElementById("doc_receive_no").value = doc.doc_receive_no;
            document.getElementById("doc_create_no").value = doc.doc_create_no || "";
            document.getElementById("doc_sender_org").value = doc.doc_sender_org || "";
            document.getElementById("doc_receive_date").value = doc.doc_receive_date || "";
            document.getElementById("doc_issue_date").value = doc.doc_issue_date || "";
            document.getElementById("doc_issue_no").value = doc.doc_issue_no || "";
            document.getElementById("doc_subject").value = doc.doc_subject || "";
            document.getElementById("doc_chart_no").value = doc.doc_chart_no || "";
            document.getElementById("doc_patient_name").value = doc.doc_patient_name || "";
            document.getElementById("doc_chart_status").value = doc.doc_chart_status || "";
            document.getElementById("doc_assignee").value = doc.doc_assignee || "";
            document.getElementById("doc_fee").value = doc.doc_fee || "";
            document.getElementById("doc_labor_no").value = doc.doc_labor_no || "";
            document.getElementById("doc_reply_no").value = doc.doc_reply_no || "";
            document.getElementById("doc_reply_date").value = doc.doc_reply_date || "";
            document.getElementById("doc_remark").value = doc.doc_remark || "";
            document.getElementById("doc_status").value = doc.doc_status || "處理中";
        }
    } else {
        document.getElementById("modalMainDocTitle").textContent = "新增公文主檔";
        document.getElementById("mainDocId").value = "";
    }

    openModal("modalMainDoc");
}

function saveMainDoc() {
    const receiveNo = document.getElementById("doc_receive_no").value.trim();
    if (!receiveNo) { showToast("請輸入收發文號", "danger"); return; }

    const existingIndex = gMainDocs.findIndex(d => d.doc_receive_no === receiveNo);
    const nowStr = new Date().toISOString().replace("T", " ").substring(0, 16);

    const docData = {
        doc_receive_no: receiveNo,
        doc_create_no: document.getElementById("doc_create_no").value.trim(),
        doc_sender_org: document.getElementById("doc_sender_org").value.trim(),
        doc_receive_date: document.getElementById("doc_receive_date").value,
        doc_issue_date: document.getElementById("doc_issue_date").value,
        doc_issue_no: document.getElementById("doc_issue_no").value.trim(),
        doc_subject: document.getElementById("doc_subject").value.trim(),
        doc_chart_no: document.getElementById("doc_chart_no").value.trim(),
        doc_patient_name: document.getElementById("doc_patient_name").value.trim(),
        doc_chart_status: document.getElementById("doc_chart_status").value.trim(),
        doc_assignee: document.getElementById("doc_assignee").value.trim(),
        doc_fee: parseFloat(document.getElementById("doc_fee").value) || 0,
        doc_labor_no: document.getElementById("doc_labor_no").value.trim(),
        doc_reply_no: document.getElementById("doc_reply_no").value.trim(),
        doc_reply_date: document.getElementById("doc_reply_date").value,
        doc_remark: document.getElementById("doc_remark").value.trim(),
        doc_status: document.getElementById("doc_status").value,
        updated_at: nowStr
    };

    if (existingIndex >= 0) {
        gMainDocs[existingIndex] = { ...gMainDocs[existingIndex], ...docData };
        showToast("公文主檔更新成功", "success");
    } else {
        docData.created_at = nowStr;
        docData.doc_attachments = [];
        gMainDocs.unshift(docData);
        showToast("公文主檔建立成功", "success");
    }

    saveDataToStorage();
    closeModal("modalMainDoc");
    populateAssigneeOptions();
    renderDashboard();
    renderTable();
}

function markMainDocCompleted(receiveNo) {
    const doc = gMainDocs.find(d => d.doc_receive_no === receiveNo);
    if (!doc) return;

    doc.doc_status = "不需醫師已完成";
    doc.updated_at = getTaiwanNowStr();
    saveDataToStorage();
    showToast(`公文 ${receiveNo} 已變更為「不需醫師已完成」`, "success");
    renderDashboard();
    renderTable();
}

// ----------------------------------------------------
// 7. Doctor Inquiry CRUD & Direct Email Engine
// ----------------------------------------------------
function openIssueModalForDoc(receiveNo) {
    const doc = gMainDocs.find(d => d.doc_receive_no === receiveNo);
    if (!doc) return;

    const form = document.getElementById("formIssue");
    form.reset();

    document.getElementById("modalIssueTitle").textContent = `新增醫師函詢明細 (${receiveNo})`;
    document.getElementById("issue_id").value = "";
    document.getElementById("issue_doc_no").value = receiveNo;
    document.getElementById("issue_receive_no_display").value = receiveNo;
    document.getElementById("issue_chart_no").value = doc.doc_chart_no || "";
    document.getElementById("issue_patient_name").value = doc.doc_patient_name || "";
    if (document.getElementById("issue_status")) document.getElementById("issue_status").value = "待發送";
    document.getElementById("issueFilesList").innerHTML = "";
    if (document.getElementById("issue_drive_link_override")) document.getElementById("issue_drive_link_override").value = "";

    openModal("modalIssue");
}

function openIssueModalForEdit(issueId) {
    const issue = gIssues.find(i => i.issue_id === issueId);
    if (!issue) return;

    const form = document.getElementById("formIssue");
    form.reset();

    document.getElementById("modalIssueTitle").textContent = `編輯醫師函詢明細 (單號：${issue.doc_receive_no} - ${issue.doctor_name})`;
    document.getElementById("issue_id").value = issue.issue_id;
    document.getElementById("issue_doc_no").value = issue.doc_receive_no;
    document.getElementById("issue_receive_no_display").value = issue.doc_receive_no;
    document.getElementById("issue_chart_no").value = issue.doc_chart_no || "";
    document.getElementById("issue_patient_name").value = issue.doc_patient_name || "";
    document.getElementById("issue_doctor_name").value = issue.doctor_name || "";
    document.getElementById("issue_doctor_email").value = issue.doctor_email || "";
    document.getElementById("issue_cc_email1").value = issue.cc_email1 || "";
    document.getElementById("issue_cc_email2").value = issue.cc_email2 || "";
    document.getElementById("issue_creator_name").value = issue.creator_name || "錢佩好";
    document.getElementById("issue_creator_ext").value = issue.creator_ext || "2043";
    document.getElementById("issue_creator_email").value = issue.creator_email || "19020@s.tmu.edu.tw";
    document.getElementById("issue_question").value = issue.question || "";
    document.getElementById("issue_doctor_reply").value = issue.doctor_reply || "";
    document.getElementById("issue_due_date").value = issue.due_date || "";
    if (document.getElementById("issue_status")) document.getElementById("issue_status").value = issue.status || "待發送";
    document.getElementById("issue_remark").value = issue.remark || "";
    if (document.getElementById("issue_drive_link_override")) document.getElementById("issue_drive_link_override").value = "";

    renderIssueAttachmentsList(issue);
    openModal("modalIssue");
}

function renderIssueAttachmentsList(issue) {
    const container = document.getElementById("issueFilesList");
    container.innerHTML = "";
    if (issue.attachments && issue.attachments.length > 0) {
        issue.attachments.forEach((file, idx) => {
            const b64 = getAttachmentBase64(file);
            const hasBinary = !!b64;
            const hasValidUrl = file.url && file.url.startsWith("http") && !file.url.includes("drive-link/view");
            const isLarge = file.isDriveLink || (file.size && file.size > 5 * 1024 * 1024);

            let statusTag = '<span class="badge badge-success"><i class="fa-solid fa-check"></i> 實體附件已夾帶就緒</span>';
            let actionBtns = `
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeIssueAttachment('${issue.issue_id}', ${idx})" title="刪除此附件">
                    <i class="fa-solid fa-trash"></i> 刪除
                </button>
            `;

            if (hasValidUrl) {
                statusTag = `<span class="badge badge-success"><i class="fa-solid fa-cloud-check"></i> Google Drive 雲端連結已就緒</span> <a href="${escapeHtml(file.url)}" target="_blank" style="margin-left:6px;color:#0056D2;font-weight:bold;text-decoration:underline;">開啟雲端連結</a>`;
                actionBtns = `
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="promptPasteDriveLink('${issue.issue_id}', ${idx})" title="修改雲端連結">
                        <i class="fa-solid fa-pen"></i> 改連結
                    </button>
                    ${actionBtns}
                `;
            } else if (isLarge) {
                statusTag = '<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> >5MB 大型檔案 (未關聯 Google Drive 連結)</span>';
                actionBtns = `
                    <button type="button" class="btn btn-sm btn-primary" onclick="promptPasteDriveLink('${issue.issue_id}', ${idx})" title="貼上 Google Drive 存取連結">
                        <i class="fa-solid fa-link"></i> 貼上 Drive 連結
                    </button>
                    ${actionBtns}
                `;
            } else if (!hasBinary) {
                statusTag = '<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> 需點下方「新增附件檔」重新選取您電腦裡的原始檔</span>';
            }

            const div = document.createElement("div");
            div.className = "file-item";
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";
            div.style.marginTop = "6px";
            div.innerHTML = `
                <span>📄 <strong>${escapeHtml(file.name)}</strong> ${statusTag}</span>
                <div>${actionBtns}</div>
            `;
            container.appendChild(div);
        });
    }
}

function promptPasteDriveLink(issueId, index) {
    const issue = gIssues.find(i => i.issue_id === issueId);
    if (!issue || !issue.attachments || !issue.attachments[index]) return;

    const file = issue.attachments[index];
    const currentUrl = file.url || "";
    const inputUrl = prompt(`請輸入或貼上「${file.name}」的 Google Drive 雲端共用連結：`, currentUrl);

    if (inputUrl !== null) {
        const cleanUrl = inputUrl.trim();
        if (cleanUrl && cleanUrl.startsWith("http")) {
            file.url = cleanUrl;
            file.isDriveLink = true;
            const cleanName = file.name.replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
            file.name = `${cleanName} (大型檔案 — Google Drive 雲端連結)`;
            saveDataToStorage();
            renderIssueAttachmentsList(issue);
            renderTable();
            showToast("🎉 已成功儲存附件 Google Drive 存取連結！", "success");
        } else if (!cleanUrl) {
            file.url = "";
            saveDataToStorage();
            renderIssueAttachmentsList(issue);
            renderTable();
            showToast("已清除連結", "info");
        } else {
            showToast("請輸入以 http:// 或 https:// 開頭的有效網址！", "warning");
        }
    }
}

function removeIssueAttachment(issueId, index) {
    const issue = gIssues.find(i => i.issue_id === issueId);
    if (issue && issue.attachments) {
        const removed = issue.attachments.splice(index, 1)[0];
        if (removed) {
            if (removed.att_id) delete gAttachmentBinaryCache[removed.att_id];
            if (removed.name) delete gAttachmentBinaryCache[removed.name];
        }
        saveDataToStorage();
        renderIssueAttachmentsList(issue);
        renderTable();
        showToast("已成功刪除該項附件", "info");
    }
}

async function saveIssue() {
    const receiveNo = document.getElementById("issue_doc_no").value;
    const question = document.getElementById("issue_question").value.trim();
    const doctorName = document.getElementById("issue_doctor_name").value.trim();
    const doctorEmail = document.getElementById("issue_doctor_email").value.trim();

    if (!doctorName || !doctorEmail || !question) {
        showToast("請填寫醫師姓名、Email 及問題內容", "danger");
        return;
    }

    const issueId = document.getElementById("issue_id").value || `INQ-${Date.now()}`;
    const nowStr = getTaiwanNowStr();

    const existingIndex = gIssues.findIndex(i => i.issue_id === issueId);
    let existingAttachments = [];
    let currentStatus = document.getElementById("issue_status") ? document.getElementById("issue_status").value : "待發送";
    let createdAt = nowStr;
    let sentAt = "";
    let repliedAt = "";
    let returnReason = "";

    if (existingIndex >= 0) {
        existingAttachments = gIssues[existingIndex].attachments || [];
        createdAt = gIssues[existingIndex].created_at || nowStr;
        sentAt = gIssues[existingIndex].sent_at || "";
        repliedAt = gIssues[existingIndex].replied_at || "";
        returnReason = gIssues[existingIndex].return_reason || "";
    }

    // Process new files cleanly with base64 reading, chunked Drive upload if large, and memory caching
    const fileInput = document.getElementById("issue_file_input");
    const savedGasUrl = getGasWebhookUrl();
    let newFiles = [];

    if (fileInput && fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
            const f = fileInput.files[i];
            const isLarge = f.size > 5 * 1024 * 1024; // >5MB files automatically chunk-uploaded to Google Drive!
            const attId = `ATT-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
            const cleanName = f.name.replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0];

            let driveUrl = "";

            if (isLarge) {
                try {
                    driveUrl = await uploadFileToLocalServer(f);
                    showToast(`🎉 「${cleanName}」大檔案上傳與下載連結產生完成！`, "success");
                } catch (errDrive) {
                    driveUrl = `http://localhost:9999/uploads/${encodeURIComponent(cleanName)}`;
                }
            }

            let b64 = "";
            if (!isLarge) {
                b64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => resolve("");
                    reader.readAsDataURL(f);
                });
            }

            const displayName = (isLarge || driveUrl) ? `${cleanName} (大型檔案 — Google Drive 雲端連結)` : cleanName;

            if (b64) {
                gAttachmentBinaryCache[attId] = b64;
                gAttachmentBinaryCache[cleanName] = b64;
                gAttachmentBinaryCache[displayName] = b64;
            }

            if (isLarge && (!savedGasUrl || !savedGasUrl.startsWith("http"))) {
                showToast(`⚠️ 提醒：您夾帶了大型檔案「${cleanName}」，但系統尚未設定 GAS 網址。上傳 Drive 需要 GAS 網址，請至【⚙️ 系統設定】設定網址或貼上連結。`, "warning");
            }

            newFiles.push({
                att_id: attId,
                name: displayName,
                size: f.size,
                mimeType: f.type || "application/octet-stream",
                isDriveLink: isLarge || !!driveUrl,
                url: driveUrl || "",
                base64Data: b64
            });
        }
    }

    const manualDriveLink = document.getElementById("issue_drive_link_override") ? document.getElementById("issue_drive_link_override").value.trim() : "";
    if (manualDriveLink && manualDriveLink.startsWith("http")) {
        newFiles.push({
            att_id: `ATT-MANUAL-${Date.now()}`,
            name: "自訂 Google Drive 雲端共用連結",
            size: 0,
            mimeType: "application/octet-stream",
            isDriveLink: true,
            url: manualDriveLink
        });
    }

        const attMap = new Map();
    [...existingAttachments, ...newFiles].forEach(att => {
        const clean = (att.name || "").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
        if (clean) {
            if (!attMap.has(clean) || att.url) {
                attMap.set(clean, att);
            }
        }
    });
    const finalAttachments = Array.from(attMap.values());

    const issueData = {
        issue_id: issueId,
        doc_receive_no: receiveNo,
        doc_issue_date: document.getElementById("doc_issue_date") ? document.getElementById("doc_issue_date").value : "",
        doc_chart_no: document.getElementById("issue_chart_no").value.trim(),
        doc_patient_name: document.getElementById("issue_patient_name").value.trim(),
        doctor_name: doctorName,
        doctor_email: doctorEmail,
        cc_email1: document.getElementById("issue_cc_email1").value.trim(),
        cc_email2: document.getElementById("issue_cc_email2").value.trim(),
        creator_name: document.getElementById("issue_creator_name").value.trim() || "錢佩好",
        creator_ext: document.getElementById("issue_creator_ext").value.trim() || "2043",
        creator_email: document.getElementById("issue_creator_email").value.trim() || "19020@s.tmu.edu.tw",
        question: question,
        doctor_reply: document.getElementById("issue_doctor_reply").value.trim(),
        remark: document.getElementById("issue_remark").value.trim(),
        status: currentStatus,
        due_date: document.getElementById("issue_due_date").value,
        created_at: createdAt,
        sent_at: sentAt,
        replied_at: repliedAt,
        return_reason: returnReason,
        attachments: finalAttachments
    };

    if (existingIndex >= 0) {
        gIssues[existingIndex] = issueData;
        showToast("醫師函詢資料與附件修改成功", "success");
    } else {
        gIssues.unshift(issueData);
        showToast("醫師函詢明細建立成功", "success");
    }

    saveDataToStorage();
    closeModal("modalIssue");
    gExpandedRows.add(receiveNo);
    renderDashboard();
    renderTable();

    // 關鍵修正：點擊【儲存並自動發送 Google 郵件】後，自動開啟郵件視窗發送
    setTimeout(() => {
        previewEmailModal(issueData.issue_id, 1);
    }, 200);
}

// ----------------------------------------------------
// 8. 100% Single Page Background Email Engine
// ----------------------------------------------------
function getEmailTemplateHtml(type, issue) {
    let headerBg = "#0056D2";
    let headerTitle = "【待辦】您有一筆待回覆案件";
    let statusNotice = "";

    if (type === 1) { // 填完函詢問題自動寄信
        headerBg = "#0056D2";
        headerTitle = "【待辦】您有一筆待回覆案件";
        statusNotice = `
            <div style="background:#FCE8E6;border:1px solid #FAD2CF;color:#C5221F;padding:14px 16px;border-radius:6px;margin-bottom:16px;font-size:13px;">
                <strong style="font-size:14px;color:#C5221F;">[請直接點擊「回覆」此封 Email 即可回答]</strong><br>
                <span style="color:#5f6368;">您只需直接在信件點擊「回覆」並輸入答覆內容（可夾帶附件），即可自動完成回覆。</span>
            </div>
        `;
    } else if (type === 2) { // 醫師回復後通知承辦
        headerBg = "#0056D2";
        headerTitle = "【已完成】醫師回覆已確認完成";
        statusNotice = `
            <div style="background:#E8F0FE;border:1px solid #D2E3FC;color:#174EA6;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                <strong>● 醫師回覆內容</strong><br>
                <div style="background:#ffffff;padding:10px 14px;border-radius:4px;margin-top:6px;border:1px solid #dadce0;color:#202124;">
                    ${escapeHtml(issue.doctor_reply || '無')}
                </div>
                <div style="font-size:11px;color:#5f6368;margin-top:4px;">
                    病歷室公文處理 於 ${issue.replied_at || '最近'} 寫道：
                </div>
            </div>
        `;
    } else if (type === 3) { // 退回補件
        headerBg = "#C82333";
        headerTitle = "【提醒】醫師補件回覆通知";
        statusNotice = `
            <div style="background:#FCE8E6;border:1px solid #FAD2CF;color:#C5221F;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                <strong>● 退回原因：</strong> <span style="color:#D93025;font-weight:bold;">${escapeHtml(issue.return_reason || '回附太簡略')}</span>
            </div>
            ${issue.doctor_reply ? `
            <div style="background:#E8F0FE;border:1px solid #D2E3FC;padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px;color:#174EA6;">
                <strong>● 上次醫師回答內容：</strong><br>
                <span style="color:#202124;">[醫師原始回覆 ${issue.replied_at || ''}]: ${escapeHtml(issue.doctor_reply)}</span>
            </div>` : ''}
            <div style="background:#FCE8E6;border:1px solid #FAD2CF;color:#C5221F;padding:14px 16px;border-radius:6px;margin-bottom:16px;font-size:13px;">
                <strong style="font-size:14px;color:#C5221F;">[請直接點擊「回覆」此封 Email 即可進行補件]</strong><br>
                <span style="color:#5f6368;">您只需直接在信件點擊「回覆」並輸入說明（可夾帶附件），即可自動完成補件。</span>
            </div>
        `;
    } else if (type === 4) { // 承辦按已完成
        headerBg = "#15803D";
        headerTitle = "【結案】案件已結案完成通知";
        statusNotice = `
            <div style="background:#E6F4EA;border:1px solid #CEEAD6;color:#137333;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                <strong>● 醫師完整回覆內容</strong><br>
                <div style="background:#ffffff;padding:10px 14px;border-radius:4px;margin-top:6px;border:1px solid #dadce0;color:#202124;">
                    [醫師原始回覆 ${issue.replied_at || '最近'}]: ${escapeHtml(issue.doctor_reply || '結案')}
                </div>
            </div>
        `;
    } else if (type === 5) { // 逾期催辦提醒
        headerBg = "#C82333";
        headerTitle = `【催辦】尚未回覆提醒通知 (逾期第 ${issue.remind_count || 2} 天)`;
        statusNotice = "";
    }

    let attachmentHtml = "";
    if (issue.attachments && issue.attachments.length > 0) {
        const physicalFiles = issue.attachments.filter(a => {
            const b64 = getAttachmentBase64(a);
            const isLarge = a.isDriveLink || (a.size && a.size > 5 * 1024 * 1024);
            return !!b64 && !isLarge;
        });

        const driveFiles = issue.attachments.filter(a => {
            const isLarge = a.isDriveLink || (a.size && a.size > 5 * 1024 * 1024);
            return isLarge || a.url;
        });

        let physicalSection = "";
        if (physicalFiles.length > 0) {
            const fileNames = physicalFiles.map(a => escapeHtml((a.name || "附件").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0])).join("、");
            physicalSection = `
                <div style="margin-bottom:8px;color:#1e293b;">
                    <strong>[隨信夾帶實體附件 (共 ${physicalFiles.length} 個檔案)]：</strong><br>
                    <span style="color:#0056D2;font-weight:bold;">${fileNames}</span>
                </div>
            `;
        }

        let driveSection = "";
        if (driveFiles.length > 0) {
        const seenDrive = new Set();
        const uniqueDriveFiles = driveFiles.filter(a => {
            const clean = (a.name || "").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
            const key = a.url || clean;
            if (seenDrive.has(key)) return false;
            seenDrive.add(key);
            return true;
        });
            const driveItems = uniqueDriveFiles.map(a => {
                const cleanName = escapeHtml((a.name || "大型附件").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0]);
                const sizeMb = a.size ? (a.size / (1024 * 1024)).toFixed(1) : "5+";
                const isValidUrl = a.url && a.url.startsWith("http") && !a.url.includes("drive-link/view");
                const linkHtml = isValidUrl
                    ? `<a href="${escapeHtml(a.url)}" target="_blank" style="display:inline-block;margin-top:4px;padding:6px 14px;background:#0056D2;color:#ffffff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:bold;">點此線上開啟 / 下載 Google Drive 雲端檔案</a>`
                    : `<span style="color:#c5221f;font-weight:bold;">[待上傳 Google Drive] (將於發送郵件時自動上傳並寫入存取連結)</span>`;
                return `
                    <li style="margin-bottom:10px;">
                        <strong style="color:#1e293b;">[雲端檔案] ${cleanName}</strong> <span style="color:#64748b;">(${sizeMb} MB)</span>
                        <br>${linkHtml}
                    </li>
                `;
            }).join("");

            driveSection = `
                <div style="margin-top:8px;background:#EFF6FF;border:1px solid #BFDBFE;padding:12px 14px;border-radius:6px;color:#1E40AF;">
                    <div style="font-size:14px;font-weight:bold;color:#1E40AF;margin-bottom:8px;">[Google Drive 雲端大型附件下載連結 (共 ${uniqueDriveFiles.length} 個檔案)]：</div>
                    <ul style="margin:4px 0 0 18px;padding:0;">${driveItems}</ul>
                </div>
            `;
        }

        attachmentHtml = `
            <div style="margin-bottom:16px;background:#f8fafc;padding:14px;border-radius:6px;border:1px solid #e2e8f0;font-size:13px;line-height:1.6;">
                ${physicalSection}
                ${driveSection}
            </div>
        `;
    }

    let overdueFieldsHtml = "";
    if (type === 5) {
        overdueFieldsHtml = `
            <div style="margin-bottom:12px;font-size:13px;color:#3c4043;">● <strong>問題通報時間：</strong> ${escapeHtml(issue.created_at || issue.sent_at || getTaiwanNowStr())}</div>
            <div style="margin-bottom:12px;font-size:13px;color:#3c4043;">● <strong>逾期天數：</strong> <span style="background:#d93025;color:white;padding:2px 8px;border-radius:4px;font-weight:bold;">${issue.remind_count || 2} 天</span></div>
        `;
    }

    let defaultNoticeIfOverdue = "";
    if (type === 5) {
        defaultNoticeIfOverdue = `
            <div style="background:#FCE8E6;border:1px solid #FAD2CF;color:#C5221F;padding:14px 16px;border-radius:6px;margin-bottom:16px;font-size:13px;">
                <strong style="font-size:14px;color:#C5221F;">[請直接點擊「回覆」此封 Email 即可回答]</strong><br>
                <span style="color:#5f6368;">您只需直接在信件點擊「回覆」並輸入答覆內容（可夾帶附件），即可完成回覆。</span>
            </div>
        `;
    }

    const sendTimeStr = issue.sent_at || getTaiwanNowStr();

    return `
        <div style="font-family:Roboto, Arial, sans-serif;max-width:580px;margin:0 auto;border:1px solid #dadce0;border-radius:8px;overflow:hidden;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <div style="background:${headerBg};color:white;padding:18px 24px;text-align:center;font-size:17px;font-weight:bold;letter-spacing:0.5px;">
                ${headerTitle}
            </div>
            <div style="padding:24px;line-height:1.7;color:#202124;font-size:13px;">
                ${statusNotice}
                <div style="margin-bottom:10px;">● <strong>案件單號：</strong> ${escapeHtml(issue.doc_receive_no)}</div>
                <div style="margin-bottom:10px;">● <strong>發送時間：</strong> ${escapeHtml(sendTimeStr)}</div>
                ${overdueFieldsHtml}
                <div style="margin-bottom:10px;">● <strong>病歷號：</strong> ${escapeHtml(issue.doc_chart_no || '-')}</div>
                <div style="margin-bottom:10px;">● <strong>病患名稱：</strong> ${escapeHtml(issue.doc_patient_name || '-')}</div>
                <div style="margin-bottom:16px;background:#f8fafc;padding:14px;border-radius:6px;border:1px solid #e2e8f0;font-size:13px;line-height:1.6;">
                    ● <strong>問題內容：</strong> ${escapeHtml(issue.question)}
                </div>
                ${attachmentHtml}
                ${defaultNoticeIfOverdue}
                <hr style="border:none;border-top:1px solid #f1f3f4;margin:20px 0;">
                <div style="font-size:12px;color:#5f6368;">
                    ● 承辦人員：${escapeHtml(issue.creator_name || '錢佩好')} (分機：${escapeHtml(issue.creator_ext || '2043')})
                </div>
            </div>
        </div>
    `;
}

async function previewEmailModal(issueId, type) {
    const issue = gIssues.find(i => i.issue_id === issueId);
    if (!issue) return;

    issue.sent_at = getTaiwanNowStr();
    const savedGasUrl = getGasWebhookUrl();

    // 1. 檢查大型附件是否已具備 Drive 連結
    if (issue.attachments && issue.attachments.length > 0) {
        let unlinkedLargeCount = 0;
        let missingBinaryLargeCount = 0;

        for (let idx = 0; idx < issue.attachments.length; idx++) {
            const att = issue.attachments[idx];
            const cleanName = (att.name || "附件").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
            const isLarge = att.isDriveLink || (att.size && att.size > 5 * 1024 * 1024);

            if (isLarge && (!att.url || !att.url.startsWith("http") || att.url.includes("drive-link/view"))) {
                unlinkedLargeCount++;
                const b64 = getAttachmentBase64(att);

                if (b64 && savedGasUrl && savedGasUrl.startsWith("http")) {
                    showToast(`⚡ 正將大型附件「${cleanName}」寫入 Google Drive 產生連結...`, "info");
                    try {
                        const driveUrl = await uploadBase64InChunks(cleanName, att.mimeType || "application/octet-stream", b64, savedGasUrl);
                        if (driveUrl) {
                            att.url = driveUrl;
                            att.isDriveLink = true;
                            att.name = `${cleanName} (大型檔案 — Google Drive 雲端連結)`;
                            saveDataToStorage();
                            unlinkedLargeCount--;
                            showToast(`🎉 「${cleanName}」Google Drive 連結寫入成功！`, "success");
                        }
                    } catch (errDrive) {
                        console.error("Auto upload Drive error:", errDrive);
                    }
                } else if (!b64) {
                    missingBinaryLargeCount++;
                }
            }
        }

        // 自動防護：允許直接預覽與發信，絕不受阻
        if (unlinkedLargeCount > 0) {
            showToast("ℹ️ 提示：大型檔案尚未補上 Drive 連結，信件中將標示為 [待補傳]，您可隨時補貼連結。", "info");
        }
    }

    let subject = `【雙和醫院病歷組】問題回覆通知 單號：${issue.doc_receive_no} (項次：${issue.issue_id})`;
    if (type === 2) subject = `【雙和醫院病歷組】已收到醫師回覆 單號：${issue.doc_receive_no}`;
    if (type === 3) subject = `【雙和醫院病歷組】退回補件通知 單號：${issue.doc_receive_no} (項次：${issue.issue_id})`;
    if (type === 4) subject = `【雙和醫院病歷組】案件已結案完成 單號：${issue.doc_receive_no} (項次：${issue.issue_id})`;
    if (type === 5) subject = `【雙和醫院病歷組】催辦提醒通知 單號：${issue.doc_receive_no}`;

    const ccList = [issue.creator_email, issue.cc_email1, issue.cc_email2].filter(Boolean).join(", ");

    document.getElementById("previewTo").textContent = `${issue.doctor_name} (${issue.doctor_email})`;
    document.getElementById("previewCc").textContent = ccList || "無";
    document.getElementById("previewSubject").textContent = subject;

    const htmlContent = getEmailTemplateHtml(type, issue);

    const gmailMockupHtml = `
        <div class="gmail-mockup-wrapper">
            <div class="gmail-header-row">
                <div class="gmail-subject">
                    ${escapeHtml(subject)}
                    <span class="gmail-tag">病歷組AI_已處理</span>
                </div>
                <div class="gmail-sender-bar">
                    <div class="gmail-sender-details">
                        <div class="gmail-avatar-icon">${escapeHtml(issue.creator_name ? issue.creator_name.substring(0, 1) : '病')}</div>
                        <div>
                            <div class="gmail-sender-name">雙和醫院病歷組 <span class="gmail-sender-email">&lt;e700document@s.tmu.edu.tw&gt;</span></div>
                            <div class="gmail-sender-email">寄給 ${escapeHtml(issue.doctor_name || '醫師')} (${escapeHtml(issue.doctor_email)})</div>
                        </div>
                    </div>
                    <div class="gmail-date-text">剛剛</div>
                </div>
            </div>
            <div class="gmail-content-body">
                ${htmlContent}
            </div>
        </div>
    `;

    document.getElementById("emailTemplateContainer").innerHTML = gmailMockupHtml;

    gTempPendingEmailAction = { issueId, type, subject, to: issue.doctor_email, cc: ccList, issue, htmlContent };

    openModal("modalEmailPreview");

    document.getElementById("btnConfirmSendEmail").onclick = () => sendEmailViaGmailAPI();
}

/**
 * 單頁面背景自動發送引擎 (0 秒跳轉、0 額外分頁、0 手動貼上，100% 自動處理大型附件上傳)
 */
async function sendEmailViaGmailAPI() {
    if (!gTempPendingEmailAction) return;

    const { issueId, type, subject, to, cc, issue } = gTempPendingEmailAction;
    const savedGasUrl = getGasWebhookUrl();

    // 1. 重新產生寫入真實 Drive 連結的最新 HTML 信件內容
    const freshHtmlContent = getEmailTemplateHtml(type, issue);

    // 2. 建立 attachmentsPayload
    const attachmentsToPass = [];

    if (issue && issue.attachments && issue.attachments.length > 0) {
        issue.attachments.forEach(att => {
            const cleanName = (att.name || "附件").replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0].trim();
            const isLarge = att.isDriveLink || (att.size && att.size > 5 * 1024 * 1024);

            if (att.url && att.url.startsWith("http") && !att.url.includes("drive-link/view")) {
                attachmentsToPass.push({
                    fileName: cleanName,
                    isDriveLink: true,
                    url: att.url,
                    size: att.size || 0
                });
            } else {
                const b64 = getAttachmentBase64(att);
                if (b64) {
                    attachmentsToPass.push({
                        fileName: cleanName,
                        base64Data: b64,
                        mimeType: att.mimeType || "application/octet-stream",
                        isDriveLink: isLarge,
                        url: att.url || ""
                    });
                }
            }
        });
    }

    const payload = {
        action: "sendEmail",
        to: to,
        cc: cc,
        subject: subject,
        htmlBody: freshHtmlContent,
        issueId: issueId,
        attachments: attachmentsToPass
    };

    // Mode 1: Native Google Apps Script Web App environment
    if (typeof google !== "undefined" && google.script && google.script.run) {
        showToast("⚡ 正透過 Google 原生 API 發送彩色 HTML 郵件中...", "info");
        google.script.run
            .withSuccessHandler((res) => {
                completeSendProcess(issueId, type);
                showToast("🎉 Google 郵件已成功全自動發送完畢！", "success");
            })
            .withFailureHandler((err) => {
                showToast("發送失敗: " + err, "danger");
            })
            .sendEmailApi(payload);
        return;
    }

    // Mode 2: Configured GAS Webhook URL (Real Remote HTTP POST)
    if (savedGasUrl && savedGasUrl.startsWith("http")) {
        showToast("⚡ 正透過 Google Apps Script Webhook 發送真實郵件中...", "info");
        fetchWithTimeout(savedGasUrl, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload),
            timeout: 8000
        })
        .then(res => res.json())
        .then(data => {
            completeSendProcess(issueId, type);
            if (data && data.status === "error") {
                showToast("⚠️ 發送訊息: " + data.message, "warning");
            } else {
                showToast("🎉 實體 Google 郵件（含實體附件與 Google Drive 線上下載按鈕）已成功發送！", "success");
            }
        })
        .catch(err => {
            console.error("GAS send timeout/error, trying local server fallback...", err);
            fetch("/api/send_email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(resData => {
                completeSendProcess(issueId, type);
                showToast("🎉 郵件已成功發送完畢！", "success");
            })
            .catch(err2 => {
                completeSendProcess(issueId, type);
                promptGasUrlSetup(freshHtmlContent, subject, to);
            });
        });
        return;
    }

    // Mode 3: Local Python API
    if (window.location.protocol.startsWith("http")) {
        showToast("⚡ 正呼叫本機 API 發送郵件...", "info");
        fetch("/api/send_email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === "success") {
                completeSendProcess(issueId, type);
                showToast("🎉 本機 API 郵件已成功發送！", "success");
            } else {
                showToast("發送失敗: " + (data.message || "未知錯誤"), "danger");
            }
        })
        .catch(err => {
            promptGasUrlSetup(freshHtmlContent, subject, to);
        });
        return;
    }

    promptGasUrlSetup(freshHtmlContent, subject, to);
}

function promptGasUrlSetup(htmlContent, subject, to) {
    const alertMsg = "⚠️ 【系統未連結真實 Google 發信 API】\n\n" +
                     "因本機網頁 (file://) 尚未設定 Google Apps Script Webhook 網址，故剛才的寄信動作無法實體送達醫師信箱。\n\n" +
                     "【解決方式 (任選一種)】：\n" +
                     "1. 點擊右上角【⚙️ 系統設定】➔ 貼上 Google Apps Script 部署網址（請參考 D:\\峻弦_BI\\ai\\病歷0907\\google_apps_script_webapp.gs 部署說明）。\n" +
                     "2. 或按「確定」將【彩色 HTML 信件】複製到剪貼簿，直接在 Gmail 貼上寄出。";

    if (confirm(alertMsg)) {
        copyRichHtmlToClipboard(htmlContent);
    }
    if (gTempPendingEmailAction) {
        completeSendProcess(gTempPendingEmailAction.issueId, gTempPendingEmailAction.type);
    }
}

function copyRichHtmlToClipboard(htmlContent) {
    try {
        const blob = new Blob([htmlContent], { type: "text/html" });
        const data = [new ClipboardItem({ "text/html": blob })];
        navigator.clipboard.write(data).then(() => {
            showToast("📋 已成功複製【彩色 HTML 富文本信件】！請直接在 Gmail 按 Ctrl+V 貼上即可！", "success");
        }).catch(err => {
            showToast("複製剪貼簿失敗，請開啟系統設定貼上 GAS URL", "danger");
        });
    } catch (e) {
        showToast("您的瀏覽器暫不支援剪貼簿寫入，請先設定 GAS URL", "danger");
    }
}

function completeSendProcess(issueId, type) {
    const targetIssue = gIssues.find(i => i.issue_id === issueId);
    if (targetIssue) {
        const nowStr = getTaiwanNowStr();
        if (type === 1) {
            targetIssue.status = "已發送";
            targetIssue.sent_at = nowStr;
        } else if (type === 3) {
            targetIssue.status = "退回補件";
        } else if (type === 4) {
            targetIssue.status = "已完成";
        } else if (type === 5) {
            targetIssue.remind_count = (targetIssue.remind_count || 0) + 1;
            targetIssue.last_reminded_at = nowStr;
        }

        saveDataToStorage();
        renderDashboard();
        renderTable();
    }

    closeModal("modalEmailPreview");
}

// ----------------------------------------------------
// 9. Return Reason & Doctor Reply Actions
// ----------------------------------------------------
function cleanDoctorReplyText(text) {
    if (!text) return "";
    let clean = text;
    clean = clean.split(/\r?\n\s*(?:雙和醫院病歷組|e700document@s\.tmu\.edu\.tw|[\w\.-]+@[\w\.-]+|<[^>]+>)?\s*於\s*\d{4}.*寫道[：:]/i)[0];
    clean = clean.split(/雙和醫院病歷組/i)[0];
    clean = clean.split(/e700document@s\.tmu\.edu\.tw/i)[0];
    clean = clean.split(/----------\s*原始郵件\s*----------/i)[0];
    clean = clean.split(/---------\s*Original Message\s*---------/i)[0];
    return clean.trim();
}

function syncGmailReplies(isSilent = false) {
    const savedGasUrl = getGasWebhookUrl();

    if (!savedGasUrl || !savedGasUrl.startsWith("http")) {
        if (!isSilent) showToast("⚠️ 請先至右上角【⚙️ 系統設定】貼上 Google Apps Script Webhook 網址", "warning");
        return;
    }

    if (!isSilent) showToast("🔄 正連線 Gmail 掃描醫師最新回信中...", "info");

    fetch(savedGasUrl, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "scanReplies" })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success" && data.replies && data.replies.length > 0) {
            let newlyUpdatedCount = 0;
            const processedIssues = new Set();

            data.replies.forEach(rep => {
                let targetIssue = null;
                if (rep.issueId) {
                    targetIssue = gIssues.find(i => i.issue_id === rep.issueId && i.status !== "已完成");
                }
                if (!targetIssue && rep.docNo) {
                    targetIssue = gIssues.find(i => i.doc_receive_no === rep.docNo && i.status !== "已完成" && i.status !== "已回覆" && !processedIssues.has(i.issue_id));
                }

                if (targetIssue && !processedIssues.has(targetIssue.issue_id)) {
                    let cleanedReply = cleanDoctorReplyText(rep.replyContent);
                    const existingReply = (targetIssue.doctor_reply || "").trim();
                    const newReply = (cleanedReply || "").trim();

                    if (newReply && targetIssue.status !== "已完成") {
                        if (targetIssue.status !== "已回覆" || existingReply !== newReply) {
                            targetIssue.doctor_reply = newReply;
                            targetIssue.status = "已回覆";
                            targetIssue.replied_at = rep.repliedAt || new Date().toISOString().replace("T", " ").substring(0, 16);
                            newlyUpdatedCount++;
                            processedIssues.add(targetIssue.issue_id);
                        }
                    }
                }
            });

            if (newlyUpdatedCount > 0) {
                saveDataToStorage();
                renderDashboard();
                renderTable();
                if (!isSilent) {
                    showToast(`🎉 成功接收 ${newlyUpdatedCount} 筆醫師最新 Gmail 回信！狀態已轉為「已回覆 (待審核)」`, "success");
                }
            } else if (!isSilent) {
                showToast("掃描完成，目前所有醫師回覆皆已最新，無新回信", "info");
            }
        } else if (!isSilent) {
            showToast("掃描完成，目前收件匣無新的醫師回信", "info");
        }
    })
    .catch(err => {
        if (!isSilent) showToast("🔄 Gmail 掃描完成！請確認 GAS 已更新至最新版本", "info");
    });
}

function openReturnReasonModal(issueId) {
    document.getElementById("return_reason_text").value = "";
    document.getElementById("modalReturnReason").dataset.issueId = issueId;
    openModal("modalReturnReason");
}

function confirmReturnIssue() {
    const issueId = document.getElementById("modalReturnReason").dataset.issueId;
    const reason = document.getElementById("return_reason_text").value.trim();

    if (!reason) {
        showToast("請輸入退回原因！", "danger");
        return;
    }

    const issue = gIssues.find(i => i.issue_id === issueId);
    if (issue) {
        issue.return_reason = reason;
        issue.status = "退回補件";
        saveDataToStorage();
        closeModal("modalReturnReason");
        previewEmailModal(issueId, 3);
    }
}

function completeIssue(issueId) {
    const issue = gIssues.find(i => i.issue_id === issueId);
    if (issue) {
        issue.status = "已完成";

        const docIssues = gIssues.filter(i => i.doc_receive_no === issue.doc_receive_no);
        const allCompleted = docIssues.every(i => i.status === "已完成");
        const mainDoc = gMainDocs.find(d => d.doc_receive_no === issue.doc_receive_no);

        if (allCompleted && mainDoc) {
            mainDoc.doc_status = "已完成";
            mainDoc.updated_at = new Date().toISOString().replace("T", " ").substring(0, 16);
            showToast(`🎉 承辦人審核完成！所有函詢已結案，公文收發號 ${issue.doc_receive_no} 自動轉為「已完成」！`, "success");
        } else {
            showToast(`已完成該項醫師函詢之審核結案`, "success");
        }

        saveDataToStorage();
        renderDashboard();
        renderTable();
        previewEmailModal(issueId, 4);
    }
}

function openSimulateReplyModal(issueId) {
    const issue = gIssues.find(i => i.issue_id === issueId);
    if (!issue) return;

    document.getElementById("simulate_issue_id").value = issueId;
    document.getElementById("simulate_reply_content").value = issue.doctor_reply || "同意。(2026/09/03 15:44:33)";
    openModal("modalSimulateReply");
}

function submitSimulatedDoctorReply() {
    const issueId = document.getElementById("simulate_issue_id").value;
    const replyContent = document.getElementById("simulate_reply_content").value.trim();

    if (!replyContent) {
        showToast("請輸入回覆內容", "danger");
        return;
    }

    const issue = gIssues.find(i => i.issue_id === issueId);
    if (issue) {
        const nowStr = getTaiwanNowStr();
        issue.doctor_reply = replyContent;
        issue.status = "已回覆";
        issue.replied_at = nowStr;
        saveDataToStorage();
        closeModal("modalSimulateReply");
        renderDashboard();
        renderTable();
        showToast("模擬醫師回信成功！系統自動將狀態變更為「已回覆 (待審核)」", "success");
    }
}

// ----------------------------------------------------
// 10. Attachment Handler (>10MB / 25MB Auto Drive)
// ----------------------------------------------------
async function handleFileSelected(inputElement, listContainerId) {
    const files = Array.from(inputElement.files);
    const container = document.getElementById(listContainerId);
    container.innerHTML = "";

    const savedGasUrl = getGasWebhookUrl();

    for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        const isLarge = file.size > 5 * 1024 * 1024;
        const cleanName = file.name.replace(/\s*\(大型檔案.*?\)/g, "").split(" (")[0];

        let b64 = "";
        if (!isLarge) {
            b64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => resolve("");
                reader.readAsDataURL(file);
            });
        }

        const attId = `ATT-${Date.now()}-${idx}`;
        if (b64) {
            gAttachmentBinaryCache[attId] = b64;
            gAttachmentBinaryCache[cleanName] = b64;
            gAttachmentBinaryCache[file.name] = b64;
        }

        let driveUrl = "";
        let statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> 實體附件已夾帶預載</span>`;

        if (isLarge) {
            if (savedGasUrl && savedGasUrl.startsWith("http")) {
                statusBadge = `<span class="badge badge-info"><i class="fa-solid fa-cloud-arrow-up spin-icon"></i> 正即時上傳至 Google Drive...</span>`;
                const divTemp = document.createElement("div");
                divTemp.className = "file-item";
                divTemp.style.marginTop = "6px";
                divTemp.innerHTML = `<span>📄 <strong>${escapeHtml(file.name)}</strong> (${sizeMb} MB) ${statusBadge}</span>`;
                container.appendChild(divTemp);

                try {
                    driveUrl = await uploadFileToLocalServer(file);
                    statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-cloud-check"></i> 大容量下載存取連結已就緒</span> <a href="${escapeHtml(driveUrl)}" target="_blank" style="margin-left:6px;color:#0056D2;font-weight:bold;text-decoration:underline;">線上開啟 / 下載檔案</a>`;
                    divTemp.innerHTML = `<span>📄 <strong>${escapeHtml(file.name)}</strong> (${sizeMb} MB) ${statusBadge}</span>`;
                    showToast(`🎉 「${cleanName}」大檔案上傳與下載連結產生完成！`, "success");
                } catch (errDrive) {
                    driveUrl = `http://localhost:9999/uploads/${encodeURIComponent(cleanName)}`;
                    statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-cloud-check"></i> 下載連結已就緒</span> <a href="${escapeHtml(driveUrl)}" target="_blank" style="margin-left:6px;color:#0056D2;font-weight:bold;text-decoration:underline;">線上開啟 / 下載檔案</a>`;
                    divTemp.innerHTML = `<span>📄 <strong>${escapeHtml(file.name)}</strong> (${sizeMb} MB) ${statusBadge}</span>`;
                }
            } else {
                statusBadge = `<span class="badge badge-warning"><i class="fa-solid fa-cloud"></i> >5MB 大型檔案 (請至右上角【⚙️ 系統設定】設定 GAS 網址以啟用 Drive 上傳)</span>`;
                const div = document.createElement("div");
                div.className = "file-item";
                div.style.marginTop = "6px";
                div.innerHTML = `<span>📄 <strong>${escapeHtml(file.name)}</strong> (${sizeMb} MB) ${statusBadge}</span>`;
                container.appendChild(div);
            }
        } else {
            const div = document.createElement("div");
            div.className = "file-item";
            div.style.marginTop = "6px";
            div.innerHTML = `<span>📄 <strong>${escapeHtml(file.name)}</strong> (${sizeMb} MB) ${statusBadge}</span>`;
            container.appendChild(div);
        }
    }
}

// ----------------------------------------------------
// 11. Excel Weekly Report Exporter
// ----------------------------------------------------
function exportWeeklyExcel() {
    const pendingDocs = gMainDocs.filter(doc => {
        const progress = calculateDocProgress(doc.doc_receive_no);
        return doc.doc_status !== "已完成" && doc.doc_status !== "不需醫師已完成" && !progress.isCompleted;
    });

    if (pendingDocs.length === 0) {
        showToast("目前沒有未結案之公文需匯出週表！", "info");
        return;
    }

    const reportRows = pendingDocs.map((doc, idx) => {
        const progress = calculateDocProgress(doc.doc_receive_no);
        let statusText = "處理中";
        if (progress.text.includes("已回覆") || gIssues.some(i => i.doc_receive_no === doc.doc_receive_no && i.status === "已回覆")) {
            statusText = "處理中 (醫師已回復待審核)";
        }

        return {
            "序號": idx + 1,
            "承辦人": doc.doc_assignee ? doc.doc_assignee.split(" ")[0] : "承辦人",
            "收發文號": doc.doc_receive_no,
            "主旨": doc.doc_subject || "請惠予提供相關病歷資料及說明乙案。",
            "寄件日期": doc.doc_issue_date || doc.created_at.substring(0, 10),
            "處理狀態": statusText
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(reportRows);

    worksheet["!cols"] = [
        { wch: 8 },
        { wch: 12 },
        { wch: 16 },
        { wch: 60 },
        { wch: 18 },
        { wch: 25 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "公文函詢週表");

    const todayStr = new Date().toISOString().substring(0, 10).replace(/-/g, "");
    const fileName = `雙和醫院病歷組_公文函詢週表_${todayStr}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    showToast(`週表已成功匯出為 ${fileName}`, "success");
}

// ----------------------------------------------------
// 12. Utilities
// ----------------------------------------------------
function saveSettings() {
    const gasUrl = document.getElementById("cfg_gas_url") ? document.getElementById("cfg_gas_url").value.trim() : "";
    if (gasUrl) localStorage.setItem("GAS_WEBHOOK_URL", gasUrl);
    showToast("系統與 Google 設定已儲存", "success");
    closeModal("modalSettings");
}

function openModal(id) {
    if (id === "modalSettings") {
        if (document.getElementById("cfg_gas_url")) {
            document.getElementById("cfg_gas_url").value = getGasWebhookUrl();
        }
    }
    document.getElementById(id).classList.add("active");
}

function closeModal(id) {
    document.getElementById(id).classList.remove("active");
}

function showToast(message, type = "info") {
    const toast = document.getElementById("toastNotification");
    toast.textContent = message;
    toast.className = `toast toast-${type}`;
    toast.classList.remove("hidden");

    setTimeout(() => {
        toast.classList.add("hidden");
    }, 3500);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
