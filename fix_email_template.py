import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('function getEmailTemplateHtml(type, issue) {')
end_idx = content.find('async function autoSendEmail(', start_idx)

if start_idx == -1 or end_idx == -1:
    print("Could not find bounds")
    exit(1)

new_func = """function getEmailTemplateHtml(type, issue) {
    const creatorName = issue.creator_name || "陽書湘";
    const creatorExt = issue.creator_ext || "2037";
    const dueDateStr = issue.due_date ? issue.due_date.split(" ")[0] : "2026-08-29";
    const mainDocForEmail = (typeof gMainDocs !== 'undefined' ? gMainDocs.find(d => d.doc_receive_no === issue.doc_receive_no) : null) || {};
    const emailPatientName = issue.doc_patient_name || mainDocForEmail.doc_patient_name || '-';
    const emailChartNo = issue.doc_chart_no || mainDocForEmail.doc_chart_no || '-';

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
            physicalSection = `
                <div style="margin-bottom:12px;color:#3c4043;font-size:13.5px;">
                    &#128206; <strong>附件：</strong> 公文附件 (請見信件夾帶檔案)
                </div>
            `;
        }

        let driveSection = "";
        if (driveFiles.length > 0) {
            const seenDrive = new Set();
            const uniqueDriveFiles = driveFiles.filter(a => {
                const clean = (a.name || "").replace(/\\s*\\(大型檔案.*?\\)/g, "").split(" (")[0].trim();
                const key = a.url || clean;
                if (seenDrive.has(key)) return false;
                seenDrive.add(key);
                return true;
            });

            const driveItems = uniqueDriveFiles.map(a => {
                const cleanName = escapeHtml((a.name || "大型附件").replace(/\\s*\\(大型檔案.*?\\)/g, "").split(" (")[0]);
                const sizeMb = a.size ? (a.size / (1024 * 1024)).toFixed(1) : "5+";
                const isValidUrl = a.url && a.url.startsWith("http") && !a.url.includes("localhost") && !a.url.includes("127.0.0.1") && !a.url.includes("drive-link/view");
                
                const linkBtn = isValidUrl
                    ? `<a href="${escapeHtml(a.url)}" target="_blank" style="display:inline-block;margin-top:8px;padding:10px 22px;background:#0056D2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.15);">&#128229; 點此線上開啟 / 下載 Google Drive 雲端檔案</a>`
                    : `[待上傳 Google Drive]`;

                return `
                    <li style="margin-bottom:12px;list-style:none;">
                        <strong style="color:#1e293b;">[雲端檔案] ${cleanName}</strong> <span style="color:#64748b;">(${sizeMb} MB)</span>
                        <br>${linkBtn}
                    </li>
                `;
            }).join("");

            driveSection = `
                <div style="margin-top:12px;background:#EFF6FF;border:1px solid #BFDBFE;padding:14px 16px;border-radius:8px;color:#1E40AF;">
                    <div style="font-size:14px;font-weight:bold;color:#1E40AF;margin-bottom:8px;">[Google Drive 雲端大型附件下載連結 (共 ${uniqueDriveFiles.length} 個檔案)]：</div>
                    <ul style="padding-left:0;margin:0;">
                        ${driveItems}
                    </ul>
                </div>
            `;
        }

        attachmentHtml = physicalSection + driveSection;
    }

    let headerBg = "#0056D2";
    let headerTitle = "";
    let bodyHtml = "";

    if (type === 1) { 
        headerBg = "#0056D2";
        headerTitle = "&#128276; 您有一筆待回覆案件";
        bodyHtml = `
            <div style="margin-bottom:10px;">📌 <strong>案件單號：</strong> ${escapeHtml(issue.doc_receive_no)}</div>
            <div style="margin-bottom:10px;">📝 <strong>病歷號：</strong> ${escapeHtml(emailChartNo)}</div>
            <div style="margin-bottom:10px;">👤 <strong>病患名稱：</strong> ${escapeHtml(emailPatientName)}</div>
            <div style="margin-bottom:14px;">📝 <strong>問題內容：</strong><br>${formatMultilineHtml(issue.question)}</div>
            ${attachmentHtml}
            <div style="background:#E6F4EA;border:1px solid #CEEAD6;color:#137333;padding:16px 20px;border-radius:8px;margin-top:20px;margin-bottom:16px;text-align:center;">
                <strong style="font-size:15px;color:#137333;">✉️ 請直接點擊「回覆」此封 Email 即可回答</strong><br>
                <span style="color:#5f6368;font-size:13px;display:inline-block;margin-top:4px;">您只需直接在信件點擊「回覆」並輸入說明意見（可夾帶附件），即可自動完成答覆。</span>
            </div>
            <hr style="border:none;border-top:1px solid #f1f3f4;margin:20px 0;">
            <div style="font-size:12.5px;color:#5f6368;display:flex;justify-content:space-between;">
                <div>👤 <strong>提出人：</strong>${escapeHtml(creatorName)} (分機：${escapeHtml(creatorExt)})</div>
                <div>&#9200; <strong>截止日：</strong>${escapeHtml(dueDateStr)}</div>
            </div>
        `;
    } else if (type === 2) { 
        headerBg = "#0056D2";
        headerTitle = "&#9989; 醫師回覆已確認完成";
        bodyHtml = `
            <div style="background:#E8F0FE;border:1px solid #D2E3FC;color:#174EA6;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                <strong style="color:#0056D2;font-size:14px;">&#128172; 醫師回覆內容</strong><br>
                <div style="background:#ffffff;padding:12px 14px;border-radius:6px;margin-top:6px;border:1px solid #dadce0;color:#202124;font-size:14px;line-height:1.6;white-space:pre-wrap;">${formatMultilineHtml(issue.doctor_reply || '無')}</div>
            </div>
            <div style="margin-bottom:10px;">📌 <strong>案件單號：</strong> ${escapeHtml(issue.doc_receive_no)}</div>
            <div style="margin-bottom:10px;">📝 <strong>病歷號：</strong> ${escapeHtml(emailChartNo)}</div>
            <div style="margin-bottom:10px;">👤 <strong>病患名稱：</strong> ${escapeHtml(emailPatientName)}</div>
            <div style="margin-bottom:14px;">📝 <strong>問題內容：</strong><br>${formatMultilineHtml(issue.question)}</div>
            ${attachmentHtml}
            <hr style="border:none;border-top:1px solid #f1f3f4;margin:20px 0;">
            <div style="font-size:12.5px;color:#5f6368;">
                👤 <strong>提出人：</strong>${escapeHtml(creatorName)} (分機：${escapeHtml(creatorExt)})
            </div>
        `;
    } else if (type === 3) { 
        headerBg = "#C82333";
        headerTitle = `【提醒】醫師補件回覆通知`;
        
        let oldReplyHtml = "";
        if (issue.doctor_reply) {
            oldReplyHtml = `
            <div style="background:#E8F0FE;border:1px solid #D2E3FC;padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px;color:#174EA6;">
                <strong>● 上次醫師回答內容：</strong><br>
                <span style="color:#202124;">[醫師原始回覆 ${issue.replied_at || ''}]: ${escapeHtml(issue.doctor_reply)}</span>
            </div>`;
        }

        bodyHtml = `
            <div style="background:#FCE8E6;border:1px solid #FAD2CF;color:#C5221F;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                <strong>● 退回原因：</strong> <span style="color:#D93025;font-weight:bold;">${escapeHtml(issue.return_reason || '回附太簡略')}</span>
            </div>
            ${oldReplyHtml}
            <div style="background:#FCE8E6;border:1px solid #FAD2CF;color:#C5221F;padding:16px 20px;border-radius:6px;margin-bottom:16px;text-align:center;">
                <strong style="font-size:15px;color:#C5221F;">[請直接點擊「回覆」此封 Email 即可進行補件]</strong><br>
                <span style="color:#5f6368;font-size:13px;display:inline-block;margin-top:4px;">您只需直接在信件點擊「回覆」並輸入說明（可夾帶附件），即可自動完成補件。</span>
            </div>
            <div style="margin-bottom:10px;"><strong>● 案件單號：</strong> ${escapeHtml(issue.doc_receive_no)}</div>
            <div style="margin-bottom:10px;"><strong>● 病歷號：</strong> ${escapeHtml(emailChartNo)}</div>
            <div style="margin-bottom:10px;"><strong>● 病患名稱：</strong> ${escapeHtml(emailPatientName)}</div>
            
            <div style="background:#f8f9fa;border:1px solid #e8eaed;padding:12px 14px;border-radius:6px;margin-bottom:10px;">
                <strong>● 問題內容：</strong>${formatMultilineHtml(issue.question || '無')}
            </div>
            
            ${attachmentHtml.replace('&#128206; <strong>附件：</strong>', '<strong>[附件]：</strong>')}
            
            <div style="margin-top:16px;margin-bottom:10px;"><strong>● 承辦人員：</strong> ${escapeHtml(creatorName)} (分機：${escapeHtml(creatorExt)})</div>
        `;
    } else if (type === 4) { 
        headerBg = "#15803D";
        headerTitle = "&#127881; 案件已結案完成通知";
        bodyHtml = `
            <div style="background:#E6F4EA;border:1px solid #CEEAD6;color:#137333;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                <strong style="color:#137333;font-size:14px;">📝 最終彙整意見</strong><br>
                <div style="background:#ffffff;padding:12px 14px;border-radius:6px;margin-top:6px;border:1px solid #dadce0;color:#202124;font-size:14px;line-height:1.6;white-space:pre-wrap;">${formatMultilineHtml(issue.doctor_reply || '結案')}</div>
            </div>
            <div style="margin-bottom:10px;">📌 <strong>案件單號：</strong> ${escapeHtml(issue.doc_receive_no)}</div>
            <div style="margin-bottom:10px;">📝 <strong>病歷號：</strong> ${escapeHtml(emailChartNo)}</div>
            <div style="margin-bottom:10px;">👤 <strong>病患名稱：</strong> ${escapeHtml(emailPatientName)}</div>
            <div style="margin-bottom:14px;">📝 <strong>問題內容：</strong><br>${formatMultilineHtml(issue.question)}</div>
            ${attachmentHtml}
            <div style="margin-top:16px;margin-bottom:10px;">
                👤 <strong>提出人：</strong>${escapeHtml(creatorName)} (分機：${escapeHtml(creatorExt)})
            </div>
        `;
    } else if (type === 5) { 
        headerBg = "#C82333";
        headerTitle = `⚠️ 尚未回覆提醒通知 <span style="background-color: yellow; color: black; border-radius: 4px; padding: 2px 4px; font-size: 15px; margin-left: 4px;">(逾期第 ${issue.remind_count || 2} 天)</span>`;
        bodyHtml = `
            <div style="margin-bottom:10px;">📌 <strong>案件單號：</strong> ${escapeHtml(issue.doc_receive_no)}</div>
            <div style="margin-bottom:10px;">🕘 <strong>問題通報時間：</strong> ${escapeHtml(issue.sent_at || '')}</div>
            <div style="margin-bottom:10px;">⏱️ <strong style="background-color: yellow; padding: 2px 4px; border-radius: 4px;">逾期天數：</strong> <strong style="color: red;">${issue.remind_count || 2} 天</strong></div>
            <div style="margin-bottom:10px;">📝 <strong>病歷號：</strong> ${escapeHtml(emailChartNo)}</div>
            <div style="margin-bottom:10px;">👤 <strong>病患名稱：</strong> ${escapeHtml(emailPatientName)}</div>
            <div style="margin-bottom:14px;">📝 <strong>問題內容：</strong> ${formatMultilineHtml(issue.question || '無')}</div>
            ${attachmentHtml.replace('&#128206;', '📎')}
            <div style="background:#FCE8E6;border:1px solid #FAD2CF;color:#C5221F;padding:16px 20px;border-radius:8px;margin-top:16px;text-align:center;">
                <strong style="font-size:15px;color:#C5221F;">✉️ 請直接點擊「回覆」此封 Email 即可回答</strong><br>
                <span style="color:#5f6368;font-size:13px;display:inline-block;margin-top:4px;">您只需直接在信件點擊「回覆」並輸入答覆內容（可夾帶附件），即可完成回覆。</span>
            </div>
        `;
    }

    return `
        <div style="font-family:Roboto, Arial, sans-serif;max-width:580px;margin:0 auto;border:1px solid #dadce0;border-radius:8px;overflow:hidden;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <div style="background:${headerBg};color:white;padding:18px 24px;text-align:center;font-size:18px;font-weight:bold;letter-spacing:0.5px;">
                ${headerTitle}
            </div>
            <div style="padding:24px;line-height:1.7;color:#202124;font-size:13.5px;background:#ffffff;">
                ${bodyHtml}
            </div>
        </div>
    `;
}
"""

new_content = content[:start_idx] + new_func + "\n" + content[end_idx:]

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Email templates replaced successfully.")
