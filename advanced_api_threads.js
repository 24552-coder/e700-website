function scanGmailReplies() {
  try {
    // 改用 Threads API，行為與原生 GmailApp 100% 相同！
    var response = Gmail.Users.Threads.list('me', { q: 'is:inbox -is:starred', maxResults: 50 });
    
    var foundReplies = [];
    var messageIdsToStar = [];

    if (response.threads && response.threads.length > 0) {
      for (var i = 0; i < response.threads.length; i++) {
        var threadId = response.threads[i].id;
        var threadDetail = Gmail.Users.Threads.get('me', threadId);
        
        // 抓取整個對話中的「最新一封信」
        if (!threadDetail.messages || threadDetail.messages.length === 0) continue;
        
        var msgDetail = threadDetail.messages[threadDetail.messages.length - 1];
        var msgId = msgDetail.id;
        
        var subject = "";
        var from = "";
        var dateStr = "";
        
        // 解析標頭
        for (var h = 0; h < msgDetail.payload.headers.length; h++) {
          var header = msgDetail.payload.headers[h];
          var name = header.name.toLowerCase();
          if (name === 'subject') subject = header.value;
          if (name === 'from') from = header.value;
          if (name === 'date') {
            try {
              dateStr = Utilities.formatDate(new Date(header.value), "GMT+8", "yyyy-MM-dd HH:mm");
            } catch(e) {
              dateStr = header.value;
            }
          }
        }

        var msgFromLower = from.toLowerCase();
        
        // 防呆：如果是自己寄出去的，直接打星號跳過
        if (msgFromLower.indexOf("e700document") !== -1 || msgFromLower.indexOf("雙和醫院病歷組") !== -1) {
           messageIdsToStar.push(msgId);
           continue;
        }

        // 提取單號與項次
        var docMatch = subject.match(/單號[：:]\s*([^\s(]+)/);
        var issueMatch = subject.match(/項次[：:]\s*([0-9A-Za-z\-]+)/);

        var docNo = docMatch ? docMatch[1] : "";
        var issueId = issueMatch ? issueMatch[1] : "";

        if (!docNo && !issueId) {
          continue; // 找不到單號就跳過 (留給人工處理)
        }

        // 提取內文
        var body = extractMessageBody(msgDetail.payload);
        
        // 清理醫師回信內文
        var cleanReply = body;
        cleanReply = cleanReply.split(/\r?\n.*於\s*\d{4}.*寫道[：:]/i)[0];
        cleanReply = cleanReply.split(/----------\s*原始郵件\s*----------/i)[0];
        cleanReply = cleanReply.split(/---------\s*Original Message\s*---------/i)[0];
        var fromIndex = cleanReply.search(/\r?\n\s*From:\s*雙和醫院病歷組/i);
        if (fromIndex !== -1) cleanReply = cleanReply.substring(0, fromIndex);
        cleanReply = cleanReply.trim();
        
        // 檢查是否有附件
        var hasAttachments = false;
        if (msgDetail.payload.parts) {
          for (var p = 0; p < msgDetail.payload.parts.length; p++) {
            if (msgDetail.payload.parts[p].filename && msgDetail.payload.parts[p].filename.length > 0) {
              hasAttachments = true;
              break;
            }
          }
        }

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
        
        messageIdsToStar.push(msgId);
      }
    }
    
    // 批次打星號 (使用進階 API 修改標籤)
    for (var m = 0; m < messageIdsToStar.length; m++) {
      try {
        Gmail.Users.Messages.modify({
          addLabelIds: ['STARRED']
        }, 'me', messageIdsToStar[m]);
      } catch(errStar) {
        console.error("【打星號錯誤】" + errStar.toString());
      }
    }

    console.log("【系統報告】成功掃描並抓取了 " + foundReplies.length + " 封新的醫師回信！");
    return {
      status: "success",
      count: foundReplies.length,
      replies: foundReplies
    };
  } catch (err) {
    console.error("【系統發生錯誤】" + err.toString());
    return {
      status: "error",
      message: err.toString()
    };
  }
}

// 輔助函數：強效安全解碼 (支援 Base64, UTF-8, Big5)
function safeDecode(encodedText) {
  if (!encodedText) return "";
  try {
    var b64 = encodedText.replace(/-/g, '+').replace(/_/g, '/');
    var rawBytes = Utilities.base64Decode(b64);
    var utf8Str = Utilities.newBlob(rawBytes).getDataAsString("UTF-8");
    if (utf8Str.indexOf("\uFFFD") !== -1 || utf8Str.indexOf("") !== -1) {
      return Utilities.newBlob(rawBytes).getDataAsString("Big5");
    }
    return utf8Str;
  } catch(e) {
    return "";
  }
}

// 輔助函數：遞迴解析信件內文
function extractMessageBody(payload) {
  var body = "";
  if (payload.parts) {
    for (var i = 0; i < payload.parts.length; i++) {
      var part = payload.parts[i];
      if (part.mimeType === 'text/plain') {
        body += safeDecode(part.body.data);
      } else if (part.parts) {
        body += extractMessageBody(part);
      }
    }
  } else if (payload.body && payload.body.data) {
    body += safeDecode(payload.body.data);
  }
  return body;
}
