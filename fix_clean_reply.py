import sys
import re

def patch_app_js():
    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # We need to make cleanDoctorReplyText more robust
    # Instead of just splitting by "雙和醫院病歷組", which truncates if the doctor mentions it
    # We should only split if we see the standard Gmail reply header
    old_clean_func = """function cleanDoctorReplyText(text) {
    if (!text) return "";
    let clean = text;
    clean = clean.split(/\\r?\\n\\s*(?:雙和醫院病歷組|e700document@s\\.tmu\\.edu\\.tw|[\\w\\.-]+@[\\w\\.-]+|<[^>]+>)?\\s*於\\s*\\d{4}.*寫道[：:]/i)[0];
    clean = clean.split(/雙和醫院病歷組/i)[0];
    clean = clean.split(/e700document@s\\.tmu\\.edu\\.tw/i)[0];
    clean = clean.split(/----------\\s*原始郵件\\s*----------/i)[0];
    clean = clean.split(/---------\\s*Original Message\\s*---------/i)[0];
    return clean.trim();
}"""

    new_clean_func = """function cleanDoctorReplyText(text) {
    if (!text) return "";
    let clean = text;
    // Gmail standard reply header
    clean = clean.split(/\\r?\\n\\s*(?:雙和醫院病歷組|e700document@s\\.tmu\\.edu\\.tw|[\\w\\.-]+@[\\w\\.-]+|<[^>]+>)?\\s*於\\s*\\d{4}.*寫道[：:]/i)[0];
    clean = clean.split(/\\r?\\n\\s*雙和醫院病歷組 <e700document@s\\.tmu\\.edu\\.tw>/i)[0];
    clean = clean.split(/----------\\s*原始郵件\\s*----------/i)[0];
    clean = clean.split(/---------\\s*Original Message\\s*---------/i)[0];
    return clean.trim();
}"""

    content = content.replace(old_clean_func, new_clean_func)

    # In syncGmailReplies, we should ALSO accept "【醫師僅夾帶附件回覆，無文字內容】" as a valid reply
    # even if existingReply is similar, just to make sure we don't drop anything.
    # Actually, that string will just pass through as newReply.

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    patch_app_js()
