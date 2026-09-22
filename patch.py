import sys

new_func = """function getEmailTemplateHtml(type, issue) {
    const creatorName = issue.creator_name || '承辦人';
    const creatorExt = issue.creator_ext || '2037';
    const dueDateStr = issue.due_date ? issue.due_date.split(' ')[0] : '2026-08-29';
    const mainDocForEmail = (typeof gMainDocs !== 'undefined' ? gMainDocs.find(d => d.doc_receive_no === issue.doc_receive_no) : null) || {};
    const emailPatientName = issue.doc_patient_name || mainDocForEmail.doc_patient_name || '-';
    const emailChartNo = issue.doc_chart_no || mainDocForEmail.doc_chart_no || '-';
    const emailDocSource = issue.doc_source || mainDocForEmail.doc_source || '外部單位';

    let attachmentHtml = '';
    if (issue.attachments && issue.attachments.length > 0) {
        const uniqueDriveFiles = [];
        const seen = new Set();
        issue.attachments.forEach(a => {
            const clean = (a.name || '').replace(/\s*\(大型檔案.*?\)/g, '').split(' (')[0].trim();
            const key = a.url || clean;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueDriveFiles.push(a);
            }
        });

        attachmentHtml = uniqueDriveFiles.map(a => {
            const cleanName = escapeHtml((a.name || '檔案').replace(/\s*\(大型檔案.*?\)/g, '').split(' (')[0]);
            const isLarge = a.isDriveLink || (a.size && a.size > 5 * 1024 * 1024);
            const isValidUrl = a.url && a.url.startsWith('http') && !a.url.includes('localhost') && !a.url.includes('127.0.0.1') && !a.url.includes('drive-link/view');
            if (isValidUrl) {
                return '<a href="' + escapeHtml(a.url) + '">' + cleanName + ' (Google Drive 連結)</a>';
            } else if (isLarge) {
                return '[待上傳 Google Drive]';
            } else {
                return cleanName + ' (隨信實體夾帶)';
            }
        }).join('<br>');
    } else {
        attachmentHtml = '無';
    }

    let bodyHtml = '';

    if (type === 1 || type === 5) {
        bodyHtml = `
${escapeHtml(issue.doctor_name || '醫師')} 醫師 您好：<br>
本組接獲【${escapeHtml(emailDocSource)}】函詢，需要您回覆意見，為確保作業時效，請您於【${escapeHtml(dueDateStr)}】前回覆，並將此信件直接按【回覆】，或回覆於原系統。<br>
謝謝您的幫忙！<br>
病歷組 敬上<br>
<br>
--------------------------------------------------------------------------------------------------------------------------<br>
●病歷號：${escapeHtml(emailChartNo)} <br>
●病患姓名：${escapeHtml(emailPatientName)} <br>
●函詢內容：<br>${formatMultilineHtml(issue.question || '')}<br>
●附件：<br>
${attachmentHtml}
`;
    } else if (type === 2) {
        bodyHtml = `
【病歷組內部通知】醫師已回覆<br>
<br>
●單號：${escapeHtml(issue.doc_receive_no)} <br>
●病歷號：${escapeHtml(emailChartNo)} <br>
●病患姓名：${escapeHtml(emailPatientName)} <br>
●回覆內容：<br>
${formatMultilineHtml(issue.doctor_reply || '')}
`;
    } else if (type === 3) {
        bodyHtml = `
【病歷組內部通知】主管退回重填<br>
<br>
●單號：${escapeHtml(issue.doc_receive_no)} <br>
●病歷號：${escapeHtml(emailChartNo)} <br>
●病患姓名：${escapeHtml(emailPatientName)} <br>
●退回原因：${escapeHtml(issue.return_reason || '')}<br>
●原回覆內容：<br>
${formatMultilineHtml(issue.doctor_reply || '')}
`;
    } else if (type === 4) {
        bodyHtml = `
【病歷組內部通知】公文已結案歸檔<br>
<br>
●單號：${escapeHtml(issue.doc_receive_no)} <br>
●病歷號：${escapeHtml(emailChartNo)} <br>
●病患姓名：${escapeHtml(emailPatientName)} <br>
`;
    } else if (type === 6) {
        bodyHtml = `
${escapeHtml(issue.doctor_name || '醫師')} 醫師 您好：<br>
您的回覆我們已經收到，感謝您的幫忙！<br>
<br>
●單號：${escapeHtml(issue.doc_receive_no)} <br>
●您回覆的內容：<br>
${formatMultilineHtml(issue.doctor_reply || '')}<br>
<br>
病歷組 敬上
`;
    }

    return `
<div style="font-size:14px; font-family:sans-serif; color:#000; line-height:1.5;">
${bodyHtml}
</div>
`;
}
"""

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if line.startswith('function getEmailTemplateHtml(type, issue)'):
        start_idx = i
    if start_idx != -1 and line.startswith('async function autoSendEmail'):
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    with open('app.js', 'w', encoding='utf-8') as f:
        f.writelines(lines[:start_idx])
        f.write(new_func + '\n\n')
        f.writelines(lines[end_idx:])
    print('SUCCESS')
else:
    print('FAILED TO FIND BOUNDARIES')
