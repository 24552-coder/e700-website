import sys, re
f = open('app.js', 'r', encoding='utf-8')
content = f.read()

# Replace detail-val font-bold and the bad 18px styling
def repl_detail(m):
    color = m.group(2)
    style = f'style="color:{color};"' if color else ''
    return f'class="detail-val" {style}'.strip()

content = re.sub(
    r'class="detail-val font-bold" style="font-size: 18px;"( style="color:(#[0-9a-fA-F]{6});"){0,1}', 
    repl_detail, 
    content
)

# Fix soft deletes
def repl_main_doc(m):
    return """function deleteMainDoc(receiveNo, createdAt) {
    const targetRecNo = (receiveNo || "").trim();
    const targetCreatedAt = (createdAt || "").trim();

    let docIndex = -1;
    if (targetRecNo) {
        docIndex = gMainDocs.findIndex(d => (d.doc_receive_no || "").trim() === targetRecNo);
    }
    if (docIndex === -1 && targetCreatedAt) {
        docIndex = gMainDocs.findIndex(d => (d.created_at || "").trim() === targetCreatedAt);
    }
    if (docIndex === -1) {
        docIndex = gMainDocs.findIndex(d => !(d.doc_receive_no || "").trim());
    }

    if (docIndex === -1) {
        showToast("&#9888;&#65039; 找不到欲刪除的公文案件！", "warning");
        return;
    }

    const docToDelete = gMainDocs[docIndex];
    const docTitle = (docToDelete.doc_receive_no || "").trim() || 
                     (docToDelete.doc_chart_no ? `病歷號 ${docToDelete.doc_chart_no}` : "空白/無文號案件");

    if (confirm(`&#9888;&#65039; 確定要刪除【${docTitle}】這筆公文主檔及其所有醫師函詢明細嗎？`)) {
        const deletedRecNo = (docToDelete.doc_receive_no || "").trim();
        const deletedCreatedAt = (docToDelete.created_at || "").trim();

        // SOFT DELETE
        docToDelete.deleted = true;

        // Also soft clean associated issues
        gIssues.forEach(i => {
            let match = false;
            if (deletedRecNo && (i.doc_receive_no || "").trim() === deletedRecNo) match = true;
            if (deletedCreatedAt && (i.created_at || "").trim() === deletedCreatedAt) match = true;
            if (match) {
                i.deleted = true;
            }
        });

        saveDataToStorage();
        showToast(`&#9989; 已刪除公文【${docTitle}】及相關函詢！`, "success");
        if (gExpandedRows.has(deletedRecNo)) {
            gExpandedRows.delete(deletedRecNo);
        }
        closeModal("modalMainDoc");
        renderDashboard();
        renderTable();
    }
}"""
content = re.sub(r'function deleteMainDoc\(receiveNo, createdAt\) \{[\s\S]+?\}\n\}', repl_main_doc, content, count=1)

def repl_issue(m):
    return """function deleteIssue(issueId) {
    if (!issueId) return;
    const issue = gIssues.find(i => i.issue_id === issueId);
    const doctorName = issue ? issue.doctor_name : "";
    if (confirm(`&#9888;&#65039; 確定要刪除至${doctorName}醫師的函詢嗎？操作無法復原！`)) {
        // SOFT DELETE
        if (issue) {
            issue.deleted = true;
        }
        saveDataToStorage();
        closeModal("modalIssue");
        showToast(`&#9989; 已成功刪除函詢！`, "success");
        renderDashboard();
        renderTable();
    }
}"""
content = re.sub(r'function deleteIssue\(issueId\) \{[\s\S]+?\}\n\}', repl_issue, content, count=1)

# Now inject the `.filter(d => !d.deleted)` wherever gMainDocs or gIssues are iterated over for UI.
# In renderTable:
content = content.replace("gMainDocs.filter(d => {", "gMainDocs.filter(d => !d.deleted).filter(d => {")

# In renderDashboard:
content = content.replace("const totalCases = gMainDocs.length;", "const activeDocs = gMainDocs.filter(d => !d.deleted);\n    const totalCases = activeDocs.length;")
content = content.replace("const totalIssues = gIssues.length;", "const activeIssues = gIssues.filter(i => !i.deleted);\n    const totalIssues = activeIssues.length;")

content = content.replace("gIssues.filter(i => i.issue_status", "activeIssues.filter(i => i.issue_status")
content = content.replace("gMainDocs.filter(d => d.doc_status", "activeDocs.filter(d => d.doc_status")
content = content.replace("activeDocs.filter(d => !d.deleted)", "gMainDocs.filter(d => !d.deleted)")

# In renderNestedIssueTable:
content = content.replace("const docIssues = gIssues.filter(i => i.doc_receive_no === receiveNo);", "const docIssues = gIssues.filter(i => !i.deleted && i.doc_receive_no === receiveNo);")

# In filter logic for weekly table:
content = content.replace("let displayDocs = gMainDocs;", "let displayDocs = gMainDocs.filter(d => !d.deleted);")

f = open('app.js', 'w', encoding='utf-8')
f.write(content)
