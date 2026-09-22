import re

with open('google_apps_script_webapp_v6.gs', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update extractMessageBody
old_extract = '''function extractMessageBody(payload) {
  var body = "";
  if (payload.parts) {
    var foundPlain = false;
    for (var i = 0; i < payload.parts.length; i++) {
      if (payload.parts[i].mimeType === 'text/plain') {
        body += safeDecode(payload.parts[i].body.data);
        foundPlain = true;
      }
    }
    if (!foundPlain) {
      for (var j = 0; j < payload.parts.length; j++) {
        var p = payload.parts[j];
        if (p.mimeType === 'text/html') {
          var htmlText = safeDecode(p.body.data);
          body += htmlText.replace(/<br\s*\\/?>/gi, '\\n').replace(/<\\/?[^>]+(>|$)/g, "");
        } else if (p.parts) {
          body += extractMessageBody(p);
        }
      }
    }
  } else if (payload.body && payload.body.data) {
    var rawText = safeDecode(payload.body.data);
    if (payload.mimeType === 'text/html') {
      rawText = rawText.replace(/<br\s*\\/?>/gi, '\\n').replace(/<\\/?[^>]+(>|$)/g, "");
    }
    body += rawText;
  }
  
  if (body === "") {
      body = "【系統無法解析此信件的特殊格式，請回信箱查看】";
  }
  return body;
}'''

new_extract = '''function extractMessageBody(payload) {
  var body = "";
  if (payload.parts) {
    var foundPlain = false;
    for (var i = 0; i < payload.parts.length; i++) {
      if (payload.parts[i].mimeType === 'text/plain') {
        var pt = safeDecode(payload.parts[i].body.data);
        if (pt.trim() !== "") {
          body += pt;
          foundPlain = true;
        }
      }
    }
    if (!foundPlain) {
      for (var j = 0; j < payload.parts.length; j++) {
        var p = payload.parts[j];
        if (p.mimeType === 'text/html') {
          var htmlText = safeDecode(p.body.data);
          body += htmlText.replace(/<br\s*\\/?>/gi, '\\n').replace(/<\\/?[^>]+(>|$)/g, "");
        } else if (p.parts) {
          body += extractMessageBody(p);
        }
      }
    }
  } else if (payload.body && payload.body.data) {
    var rawText = safeDecode(payload.body.data);
    if (payload.mimeType === 'text/html') {
      rawText = rawText.replace(/<br\s*\\/?>/gi, '\\n').replace(/<\\/?[^>]+(>|$)/g, "");
    }
    body += rawText;
  }
  
  return body;
}'''

text = text.replace(old_extract, new_extract)

# 2. Update scanGmailReplies to handle empty body
old_clean = '''        if (cleanReply || hasAttachments) {
          if (!cleanReply) cleanReply = "【醫師僅夾帶附件回覆，無文字內容】";'''

new_clean = '''        if (cleanReply === "" && !hasAttachments) {
          cleanReply = "【系統無法解析此信件，請至信箱查看】";
          hasAttachments = true;
        }

        if (cleanReply || hasAttachments) {
          if (!cleanReply) cleanReply = "【醫師僅夾帶附件回覆，無文字內容】";'''

text = text.replace(old_clean, new_clean)

with open('google_apps_script_webapp_v6.gs', 'w', encoding='utf-8') as f:
    f.write(text)

with open('最終正確程式碼_Threads_API_修正解碼.txt', 'r', encoding='utf-8') as f:
    text_txt = f.read()

text_txt = text_txt.replace(old_extract, new_extract)
text_txt = text_txt.replace(old_clean, new_clean)

with open('最終正確程式碼_Threads_API_修正解碼.txt', 'w', encoding='utf-8') as f:
    f.write(text_txt)

print("Done")
