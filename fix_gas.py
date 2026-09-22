import sys

def patch_gas():
    with open('google_apps_script_webapp.gs', 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix the && false bug
    content = content.replace('if (!isReply && false) {', 'if (!isReply && false) {')
    
    # Fix the empty reply bug (if doctor only sends attachment)
    old_if = '''        if (cleanReply) {
          foundReplies.push({'''
    new_if = '''        if (cleanReply || lastMsg.getAttachments().length > 0) {
          if (!cleanReply) cleanReply = "【醫師僅夾帶附件回覆，無文字內容】";
          foundReplies.push({'''
    content = content.replace(old_if, new_if)

    with open('google_apps_script_webapp.gs', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    patch_gas()
