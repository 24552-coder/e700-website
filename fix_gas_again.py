import sys

def patch_gas():
    # We will read from the original google_apps_script_webapp.gs
    with open('google_apps_script_webapp.gs', 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix the empty reply bug (if doctor only sends attachment)
    old_if = '''        if (cleanReply) {
          foundReplies.push({'''
    new_if = '''        if (cleanReply || lastMsg.getAttachments().length > 0) {
          if (!cleanReply) cleanReply = "【醫師僅夾帶附件回覆，無文字內容】";
          foundReplies.push({'''
    content = content.replace(old_if, new_if)

    # Save to a new file so the user can copy it
    with open('google_apps_script_webapp_updated.gs', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    patch_gas()
