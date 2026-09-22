import sys, re
f = open('app.js', 'r', encoding='utf-8')
content = f.read()

# Replace saveMainDoc with async version that handles attachments
def repl_save_main_doc(m):
    return """async function saveMainDoc() {
    const receiveNo = document.getElementById("doc_receive_no").value.trim();
    if (!receiveNo) { showToast("請輸入收發文號", "danger"); return; }

    const existingIndex = gMainDocs.findIndex(d => d.doc_receive_no === receiveNo);
    let existingAttachments = [];
    if (existingIndex >= 0) {
        existingAttachments = gMainDocs[existingIndex].doc_attachments || [];
    }
    const nowStr = getTaiwanLocalDateTimeString();

    const createNo = document.getElementById("doc_create_no").value.trim();
    const senderOrg = document.getElementById("doc_sender_org").value.trim();
    const laborNo = document.getElementById("doc_labor_no").value.trim();
    const chartStatus = document.getElementById("doc_chart_status").value.trim();

    // Process new files cleanly with base64 reading, chunked Drive upload if large, and memory caching
    const fileInput = document.getElementById("doc_file_input");
    const savedGasUrl = getGasWebhookUrl();
    let newFiles = [];

    if (fileInput && fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
            const f = fileInput.files[i];
            const attId = `ATT-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
            const cleanName = f.name.replace(/\s*\([^)]*\)/g, "").split(" (")[0];

            let driveUrl = f._driveUrl || "";

            // 若背景任務尚在執行中，等待其上傳完成以取得 Drive URL
            if (!driveUrl && f._uploadPromise) {
                try {
                    driveUrl = await f._uploadPromise;
                } catch (e) {}
            }

            if (!driveUrl && savedGasUrl && savedGasUrl.startsWith("http")) {
                showToast(`⚡ 正將附件「${cleanName}」直傳 Google Drive 集中備份庫...`, "info");
                try {
                    driveUrl = await uploadLargeFileInChunks(f, savedGasUrl);
                } catch (errDrive) {
                    console.error("Gas Drive upload failed:", errDrive);
                }
            }

            let b64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => resolve("");
                reader.readAsDataURL(f);
            });

            const displayName = cleanName;

            if (b64) {
                gAttachmentBinaryCache[attId] = b64;
                gAttachmentBinaryCache[cleanName] = b64;
                gAttachmentBinaryCache[displayName] = b64;
            }

            newFiles.push({
                att_id: attId,
                name: displayName,
                size: f.size,
                mimeType: f.type || "application/octet-stream",
                isDriveLink: true,
                url: driveUrl || "",
                base64Data: b64
            });
        }
    }

    const attMap = new Map();
    [...existingAttachments, ...newFiles].forEach(att => {
        const clean = (att.name || "").replace(/\s*\([^)]*\)/g, "").split(" (")[0].trim();
        if (clean) {
            if (!attMap.has(clean) || att.url) {
                attMap.set(clean, att);
            }
        }
    });
    const finalAttachments = Array.from(attMap.values());

    const docData = {
        doc_receive_no: receiveNo,
        doc_draft_no: createNo,
        doc_create_no: createNo,
        doc_source_unit: senderOrg,
        doc_sender_org: senderOrg,
        doc_receive_date: document.getElementById("doc_receive_date").value,
        doc_issue_date: formatMinguoDate(document.getElementById("doc_issue_date").value),
        doc_issue_no: document.getElementById("doc_issue_no").value.trim(),
        doc_subject: document.getElementById("doc_subject").value.trim(),
        doc_chart_no: document.getElementById("doc_chart_no").value.trim(),
        doc_patient_name: document.getElementById("doc_patient_name").value.trim(),
        doc_doctor_name: chartStatus,
        doc_chart_status: chartStatus,
        doc_assignee: document.getElementById("doc_assignee").value.trim(),
        doc_fee: parseFloat(document.getElementById("doc_fee").value) || 0,
        doc_lbi_no: laborNo,
        doc_labor_no: laborNo,
        doc_reply_no: document.getElementById("doc_reply_no").value.trim(),
        doc_reply_date: document.getElementById("doc_reply_date").value,
        doc_remark: document.getElementById("doc_remark").value.trim(),
        doc_status: document.getElementById("doc_status").value,
        doc_attachments: finalAttachments,
        updated_at: nowStr
    };

    if (existingIndex >= 0) {
        gMainDocs[existingIndex] = { ...gMainDocs[existingIndex], ...docData };
        showToast("公文主檔更新成功", "success");
    } else {
        docData.created_at = nowStr;
        gMainDocs.unshift(docData);
        showToast("公文主檔建立成功", "success");
    }

    saveDataToStorage();
    closeModal("modalMainDoc");
    populateAssigneeOptions();
    renderDashboard();
    renderTable();
}"""

# Do regex replacement
idx = content.find('function saveMainDoc() {')
end_idx = content.find('function markMainDocCompleted(receiveNo) {', idx)

if idx != -1 and end_idx != -1:
    content = content[:idx] + repl_save_main_doc(None) + '\n\n' + content[end_idx:]
    with open('app.js', 'w', encoding='utf-8') as fw:
        fw.write(content)
    print("Successfully patched saveMainDoc.")
else:
    print("Could not find boundaries for saveMainDoc.")
