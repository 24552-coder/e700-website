import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Type 2
old_type_2 = '''    } else if (type === 2) { 
        headerBg = "#0056D2";
        headerTitle = "&#9989; 醫師回覆已確認完成";
        bodyHtml = `
            <div style="background:#E8F0FE;border:1px solid #D2E3FC;color:#174EA6;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                <strong style="color:#0056D2;font-size:14px;">&#128172; 醫師回覆內容</strong><br>
                <div style="background:#ffffff;padding:12px 14px;border-radius:6px;margin-top:6px;border:1px solid #dadce0;color:#202124;font-size:14px;line-height:1.6;white-space:pre-wrap;">${formatMultilineHtml(issue.doctor_reply || '無')}</div>
            </div>'''

new_type_2 = '''    } else if (type === 2) { 
        if (issue.return_reason) {
            headerBg = "#D97706";
            headerTitle = "&#9989; 醫師退回補件回覆已確認完成";
            bodyHtml = `
                <div style="background:#FEF3C7;border:1px solid #FDE68A;color:#92400E;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                    <strong style="color:#D97706;font-size:14px;">&#128221; 彙整後完整意見</strong><br>
                    <div style="background:#ffffff;padding:12px 14px;border-radius:6px;margin-top:6px;border:1px solid #dadce0;color:#202124;font-size:14px;line-height:1.6;white-space:pre-wrap;">${formatMultilineHtml(issue.doctor_reply || '無')}</div>
                </div>`;
        } else {
            headerBg = "#0056D2";
            headerTitle = "&#9989; 醫師回覆已確認完成";
            bodyHtml = `
                <div style="background:#E8F0FE;border:1px solid #D2E3FC;color:#174EA6;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                    <strong style="color:#0056D2;font-size:14px;">&#128172; 醫師回覆內容</strong><br>
                    <div style="background:#ffffff;padding:12px 14px;border-radius:6px;margin-top:6px;border:1px solid #dadce0;color:#202124;font-size:14px;line-height:1.6;white-space:pre-wrap;">${formatMultilineHtml(issue.doctor_reply || '無')}</div>
                </div>`;
        }
        
        bodyHtml += `'''

content = content.replace(old_type_2, new_type_2)

# Replace Type 3
old_type_3 = '''    } else if (type === 3) { 
        headerBg = "#C82333";
        headerTitle = `退回補件通知`;'''

new_type_3 = '''    } else if (type === 3) { 
        headerBg = "#C82333";
        headerTitle = `【提醒】醫師補件回覆通知`;'''

content = content.replace(old_type_3, new_type_3)

# Write back
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('SUCCESS')
