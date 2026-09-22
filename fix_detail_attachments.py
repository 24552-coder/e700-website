import sys

def patch_app_js():
    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    old_code = """    let attText = '-';
    if (doc.doc_attachments && doc.doc_attachments.length > 0) {
        attText = doc.doc_attachments.map(a => escapeHtml(a.name || a)).join(', ');
    } else if (doc.doc_att_count > 0) {
        attText = `${doc.doc_att_count} 個附件`;
    }"""

    new_code = """    let attText = '-';
    if (doc.doc_attachments && doc.doc_attachments.length > 0) {
        attText = doc.doc_attachments.map(a => {
            if (typeof a === 'string') return escapeHtml(a);
            const safeName = escapeHtml(a.name || '');
            const b64 = getAttachmentBase64(a);
            const isValidUrl = a.url && a.url.startsWith("http") && !a.url.includes("drive-link/view");
            
            if (isValidUrl) {
                return `<a href="${escapeHtml(a.url)}" target="_blank" style="color:#0056D2;font-weight:bold;text-decoration:underline;" title="開啟 Google Drive 連結">${safeName}</a>`;
            } else if (b64) {
                const safeMime = escapeHtml(a.mimeType || 'application/octet-stream');
                // Use a proper string replacement without template literals inside string literals that might cause parse issues in html
                return `<a href="javascript:void(0)" onclick="downloadLocalAttachment('${safeName.replace(/'/g, "\\'")}', '${safeMime}')" style="color:#0056D2;font-weight:bold;text-decoration:underline;" title="下載本機附件">${safeName}</a>`;
            }
            return safeName;
        }).join('<br>');
    } else if (doc.doc_att_count > 0) {
        attText = `${doc.doc_att_count} 個附件`;
    }"""

    if old_code in content:
        content = content.replace(old_code, new_code)
        with open('app.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully patched renderMainDocDetailPanel.")
    else:
        print("Could not find old_code.")

patch_app_js()
