import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the row generation to include patient name
old_row = '''        return {
            "序號": idx + 1,
            "承辦人": doc.doc_assignee ? doc.doc_assignee.split(" ")[0] : "承辦人",
            "收發文號": doc.doc_receive_no,
            "主旨": doc.doc_subject || "請協助提供相關病歷...",
            "寄件日期": formatMinguoDateSlash(doc.doc_issue_date || doc.doc_receive_date || doc.created_at),
            "處理狀態": statusText
        };'''

# The actual JS code might have different default subject text, let's look at the grep output:
# doc.doc_subject || "請提供貴院病患黃XX..." wait, in grep it says:
# "主旨": doc.doc_subject || "請協助提供病歷資料", or something similar. 
# It says: "主旨": doc.doc_subject || "請協助提供相關病歷...", no wait, let's just use regex or split on the object keys.

