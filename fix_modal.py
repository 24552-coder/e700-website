import sys
import traceback

def patch_app_js():
    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # Make openIssueModalForDoc extremely robust
    old_func = """function openIssueModalForDoc(receiveNo) {
    const doc = gMainDocs.find(d => d.doc_receive_no === receiveNo);
    if (!doc) return;

    const form = document.getElementById("formIssue");
    form.reset();

    const btnDelete = document.getElementById("btnDeleteIssue");
    if (btnDelete) btnDelete.style.display = "none";

    document.getElementById("modalIssueTitle").textContent = `新增醫師函詢明細 (${receiveNo})`;
    document.getElementById("issue_id").value = "";
    document.getElementById("issue_doc_no").value = receiveNo;
    document.getElementById("issue_receive_no_display").value = receiveNo;
    document.getElementById("issue_chart_no").value = doc.doc_chart_no || "";
    document.getElementById("issue_patient_name").value = doc.doc_patient_name || "";

    // Auto-populate caseworker info directly from main document assignee
    const rawAssignee = doc.doc_assignee ? doc.doc_assignee.split(" ")[0].trim() : "錢佩妤";
    document.getElementById("issue_creator_name").value = rawAssignee;
    const cwInfo = CASEWORKER_MAP[rawAssignee] || { ext: "2043", email: "19020@s.tmu.edu.tw" };
    document.getElementById("issue_creator_ext").value = cwInfo.ext;
    document.getElementById("issue_creator_email").value = cwInfo.email;

    if (document.getElementById("issue_status")) document.getElementById("issue_status").value = "待發送";
    document.getElementById("issueFilesList").innerHTML = "";
    if (document.getElementById("issue_drive_link_override")) document.getElementById("issue_drive_link_override").value = "";

    openModal("modalIssue");
}"""

    new_func = """function openIssueModalForDoc(receiveNo) {
    try {
        const doc = gMainDocs.find(d => String(d.doc_receive_no) === String(receiveNo));
        if (!doc) {
            console.error("Document not found for:", receiveNo);
            showToast("找不到對應的公文主檔", "danger");
            return;
        }

        const form = document.getElementById("formIssue");
        if (form) form.reset();

        const btnDelete = document.getElementById("btnDeleteIssue");
        if (btnDelete) btnDelete.style.display = "none";

        if (document.getElementById("modalIssueTitle")) document.getElementById("modalIssueTitle").textContent = `新增醫師函詢明細 (${receiveNo})`;
        if (document.getElementById("issue_id")) document.getElementById("issue_id").value = "";
        if (document.getElementById("issue_doc_no")) document.getElementById("issue_doc_no").value = receiveNo;
        if (document.getElementById("issue_receive_no_display")) document.getElementById("issue_receive_no_display").value = receiveNo;
        if (document.getElementById("issue_chart_no")) document.getElementById("issue_chart_no").value = doc.doc_chart_no || "";
        if (document.getElementById("issue_patient_name")) document.getElementById("issue_patient_name").value = doc.doc_patient_name || "";

        // Auto-populate caseworker info safely
        const safeAssignee = doc.doc_assignee ? String(doc.doc_assignee).split(" ")[0].trim() : "錢佩妤";
        if (document.getElementById("issue_creator_name")) document.getElementById("issue_creator_name").value = safeAssignee;
        
        const cwInfo = CASEWORKER_MAP[safeAssignee] || { ext: "2043", email: "19020@s.tmu.edu.tw" };
        if (document.getElementById("issue_creator_ext")) document.getElementById("issue_creator_ext").value = cwInfo.ext;
        if (document.getElementById("issue_creator_email")) document.getElementById("issue_creator_email").value = cwInfo.email;

        // Reset other fields
        if (document.getElementById("issue_doctor_name")) document.getElementById("issue_doctor_name").value = "";
        if (document.getElementById("issue_doctor_email")) document.getElementById("issue_doctor_email").value = "";
        if (document.getElementById("issue_cc_email1")) document.getElementById("issue_cc_email1").value = "";
        if (document.getElementById("issue_cc_email2")) document.getElementById("issue_cc_email2").value = "";
        if (document.getElementById("issue_question")) document.getElementById("issue_question").value = "";
        
        if (document.getElementById("issue_status")) document.getElementById("issue_status").value = "待發送";
        if (document.getElementById("issueFilesList")) document.getElementById("issueFilesList").innerHTML = "";
        if (document.getElementById("issue_drive_link_override")) document.getElementById("issue_drive_link_override").value = "";

        openModal("modalIssue");
    } catch (err) {
        console.error("Error in openIssueModalForDoc:", err);
        showToast("發生錯誤：" + err.message, "danger");
    }
}"""

    content = content.replace(old_func, new_func)

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    try:
        patch_app_js()
        print("Success")
    except Exception as e:
        print("Error:")
        traceback.print_exc()
