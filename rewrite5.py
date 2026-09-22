import re

with open('google_apps_script_webapp_updated.gs', 'r', encoding='utf-8') as f:
    content = f.read()

start_str = 'function scanGmailReplies() {'
end_str = 'function processAttachmentsAndHtml(attachmentsPayload, htmlBody) {'
start_idx = content.find(start_str)
end_idx = content.find(end_str)

new_scan = r"""function scanGmailReplies() {
  try {
    var threads = GmailApp.search('is:inbox -is:starred', 0, 50);
    var foundReplies = [];
    var threadsToStar = [];

    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var msgs = thread.getMessages();
      var lastMsg = msgs[msgs.length - 1]; // 抓取最後一封信 (也就是醫師的回信)
      
      var subject = lastMsg.getSubject();
      var from = lastMsg.getFrom();
      var dateStr = Utilities.formatDate(lastMsg.getDate(), "GMT+8", "yyyy-MM-dd HH:mm");
      var msgFromLower = from.toLowerCase();
      
      // 防呆：如果最新的一封信是我們自己發出去的，直接打星號跳過
      if (msgFromLower.indexOf("e700document") !== -1 || msgFromLower.indexOf("雙和醫院病歷組") !== -1) {
         threadsToStar.push(thread);
         continue;
      }

      // 提取單號與項次
      var docMatch = subject.match(/單號[：:]\s*([^\s(]+)/);
      var issueMatch = subject.match(/項次[：:]\s*([0-9A-Za-z\-]+)/);

      var docNo = docMatch ? docMatch[1] : "";
      var issueId = issueMatch ? issueMatch[1] : "";

      if (!docNo && !issueId) {
        continue; // 找不到單號就跳過 (不打星號，讓人工處理)
      }

      // 使用原生 API 取得純文字內容 (完美解決 Big5 與 Base64 解碼問題)
      var body = lastMsg.getPlainBody();
      
      // 清理醫師回信內文
      var cleanReply = body;
      cleanReply = cleanReply.split(/\r?\n.*於\s*\d{4}.*寫道[：:]/i)[0];
      cleanReply = cleanReply.split(/----------\s*原始郵件\s*----------/i)[0];
      cleanReply = cleanReply.split(/---------\s*Original Message\s*---------/i)[0];
      var fromIndex = cleanReply.search(/\r?\n\s*From:\s*雙和醫院病歷組/i);
      if (fromIndex !== -1) cleanReply = cleanReply.substring(0, fromIndex);
      cleanReply = cleanReply.trim();
      
      // 檢查是否有附件
      var hasAttachments = lastMsg.getAttachments().length > 0;

      if (cleanReply || hasAttachments) {
        if (!cleanReply) cleanReply = "【醫師僅夾帶附件回覆，無文字內容】";
        foundReplies.push({
          docNo: docNo,
          issueId: issueId,
          doctorEmail: from,
          replyContent: cleanReply,
          repliedAt: dateStr
        });
      }
      
      threadsToStar.push(thread);
    }
    
    // 批次打星號
    for (var t = 0; t < threadsToStar.length; t++) {
      var msgs = threadsToStar[t].getMessages();
      for (var m = 0; m < msgs.length; m++) {
        msgs[m].star();
      }
    }

    return {
      status: "success",
      count: foundReplies.length,
      replies: foundReplies
    };
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

"""

content = content[:start_idx] + new_scan + content[end_idx:]

with open('google_apps_script_webapp_final.gs', 'w', encoding='utf-8') as f:
    f.write(content)
    
with open(r'C:\Users\hia\.gemini\antigravity\brain\0bcd63bf-efa0-447f-95ba-2e5132fbd4e5\GAS_Code_V5.md', 'w', encoding='utf-8') as fw:
    fw.write('```javascript\n' + content + '\n```\n')

print("Done")
