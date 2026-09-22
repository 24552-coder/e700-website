import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Fix 1: Batch Remind Cooldown
old_batch = '''async function batchRemindAllOverdueIssues() {
    const overdueIssues = gIssues.filter(i => isIssueOverdue(i) && i.status !== "已完成");'''

new_batch = '''async function batchRemindAllOverdueIssues() {
    const todayStr = getTaiwanNowStr().split(' ')[0];
    const overdueIssues = gIssues.filter(i => {
        if (!isIssueOverdue(i) || i.status === "已完成") return false;
        // 防呆防重複寄信機制：如果今天已經催辦過了，就不再重複催辦
        if (i.last_reminded_at && i.last_reminded_at.startsWith(todayStr)) return false;
        return true;
    });'''

text = text.replace(old_batch, new_batch)

# Fix 2: Real Overdue Days calculation in autoSendEmail (type 5)
old_email = '''        headerBg = "#C82333";
        headerTitle = `&#9888;&#65039; 尚未回覆提醒通知 <span style="background-color: yellow; color: black; border-radius: 4px; padding: 2px 4px; font-size: 15px; margin-left: 4px;">(逾期第 ${issue.remind_count || 2} 天)</span>`;'''

new_email = '''        headerBg = "#C82333";
        const createdDate = issue.created_at ? new Date(issue.created_at) : new Date();
        const diffTime = Math.abs(new Date() - createdDate);
        const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        headerTitle = `&#9888;&#65039; 尚未回覆提醒通知 <span style="background-color: yellow; color: black; border-radius: 4px; padding: 2px 4px; font-size: 15px; margin-left: 4px;">(逾期第 ${diffDays} 天)</span>`;'''

text = text.replace(old_email, new_email)

# Fix 3: Also fix the bodyHtml part if it says 逾期天數
old_body = '''            <div style="margin-bottom:10px;">&#9201; <strong>逾期天數：</strong> <span style="color:red; font-weight:bold;">${issue.remind_count || 2} 天</span></div>'''

new_body = '''            <div style="margin-bottom:10px;">&#9201; <strong>逾期天數：</strong> <span style="color:red; font-weight:bold;">${diffDays} 天</span></div>'''

text = text.replace(old_body, new_body)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
