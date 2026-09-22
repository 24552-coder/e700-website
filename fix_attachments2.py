import sys

def patch_app_js():
    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Inject renderMainDocAttachmentsList and helpers right after renderIssueAttachmentsList
    idx = content.find('function renderIssueAttachmentsList(issue)')
    if idx == -1:
        print("Could not find renderIssueAttachmentsList")
        return
        
    end_idx = content.find('}', content.find('}', content.find('}', content.find('function renderIssueAttachmentsList(issue)')) + 1) + 1) + 1
    # Actually, it's safer to just inject it before `function loadDataFromStorage`
    inject_idx = content.find('function loadDataFromStorage()')
    
    helpers = """
function renderMainDocAttachmentsList(doc) {
    const container = document.getElementById("mainDocFilesList");
    container.innerHTML = "";
    if (doc.doc_attachments && doc.doc_attachments.length > 0) {
        doc.doc_attachments.forEach((file, idx) => {
            const b64 = getAttachmentBase64(file);
            const hasBinary = !!b64;
            const hasValidUrl = file.url && file.url.startsWith("http") && !file.url.includes("drive-link/view");
            const isLarge = file.isDriveLink || (file.size && file.size > 5 * 1024 * 1024);

            let statusTag = '<span class="badge badge-success"><i class="fa-solid fa-check"></i> 實體附件已夾帶就緒</span>';
            let actionBtns = `
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeMainDocAttachment('${doc.doc_receive_no}', ${idx})" title="刪除此附件">
                    <i class="fa-solid fa-trash"></i> 刪除
                </button>
            `;

            if (hasValidUrl) {
                statusTag = `<span class="badge badge-success"><i class="fa-solid fa-cloud-check"></i> Google Drive 雲端連結已就緒</span> <a href="${escapeHtml(file.url)}" target="_blank" style="margin-left:6px;color:#0056D2;font-weight:bold;text-decoration:underline;">開啟雲端連結</a>`;
                actionBtns = `
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="promptPasteMainDocDriveLink('${doc.doc_receive_no}', ${idx})" title="修改雲端連結">
                        <i class="fa-solid fa-link"></i> 換連結
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeMainDocAttachment('${doc.doc_receive_no}', ${idx})" title="刪除此附件">
                        <i class="fa-solid fa-trash"></i> 刪除
                    </button>
                `;
            } else if (isLarge) {
                statusTag = '<span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> 檔案過大，尚未綁定雲端連結</span>';
                actionBtns = `
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="promptPasteMainDocDriveLink('${doc.doc_receive_no}', ${idx})" title="貼上外部 Google Drive 連結">
                        <i class="fa-solid fa-link"></i> 貼上共用連結
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeMainDocAttachment('${doc.doc_receive_no}', ${idx})">
                        <i class="fa-solid fa-trash"></i> 刪除
                    </button>
                `;
            }

            const downloadBtn = hasBinary ? `
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="downloadLocalAttachment('${escapeHtml(file.name)}', '${file.mimeType}')" title="下載本機快取">
                    <i class="fa-solid fa-download"></i>
                </button>
            ` : "";

            const div = document.createElement("div");
            div.className = "file-item existing-file";
            div.style.marginTop = "6px";
            div.innerHTML = `
                <span><strong>${escapeHtml(file.name)}</strong> ${statusTag}</span>
                <span class="file-actions">
                    ${downloadBtn}
                    ${actionBtns}
                </span>
            `;
            container.appendChild(div);
        });
    }
}

function removeMainDocAttachment(receiveNo, index) {
    if (!confirm("確定要刪除此公文附件嗎？(儲存後才會正式生效)")) return;
    const doc = gMainDocs.find(d => d.doc_receive_no === receiveNo);
    if (doc && doc.doc_attachments) {
        doc.doc_attachments.splice(index, 1);
        renderMainDocAttachmentsList(doc);
    }
}

function promptPasteMainDocDriveLink(receiveNo, index) {
    const doc = gMainDocs.find(d => d.doc_receive_no === receiveNo);
    if (!doc || !doc.doc_attachments) return;
    const file = doc.doc_attachments[index];
    const url = prompt(`請貼上「${file.name}」的 Google Drive 共用連結：`, file.url || "");
    if (url !== null) {
        file.url = url.trim();
        file.isDriveLink = true;
        renderMainDocAttachmentsList(doc);
    }
}
"""
    content = content[:inject_idx] + helpers + "\n\n" + content[inject_idx:]
    
    # 2. Modify openMainDocModal to call renderMainDocAttachmentsList(doc)
    old_open = '            document.getElementById("doc_status").value = doc.doc_status || "處理中";\n        }\n    }'
    new_open = '            document.getElementById("doc_status").value = doc.doc_status || "處理中";\n            renderMainDocAttachmentsList(doc);\n        }\n    }'
    content = content.replace(old_open, new_open)
    
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done")

patch_app_js()
