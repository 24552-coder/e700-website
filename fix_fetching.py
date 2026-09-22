import re

with open('google_apps_script_webapp_v6.gs', 'r', encoding='utf-8') as f:
    text = f.read()

old_logic = '''        // 抓取整個對話中的「最新一封信」
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
        }'''

new_logic = '''        if (!threadDetail.messages || threadDetail.messages.length === 0) continue;
        
        // 【核心修正】：不要盲目抓「最後一封」，因為最後一封可能是我們系統自動發出的確認信！
        // 必須由後往前找，找到「第一封不是我們寄的，且沒有被打過星號」的信
        var msgDetail = null;
        var msgId = "";
        var subject = "";
        var from = "";
        var dateStr = "";
        
        for (var m = threadDetail.messages.length - 1; m >= 0; m--) {
            var tempMsg = threadDetail.messages[m];
            var tempFrom = "";
            var isStarred = false;
            
            if (tempMsg.labelIds && tempMsg.labelIds.indexOf("STARRED") !== -1) {
                isStarred = true;
            }
            
            for (var h = 0; h < tempMsg.payload.headers.length; h++) {
                if (tempMsg.payload.headers[h].name.toLowerCase() === 'from') {
                    tempFrom = tempMsg.payload.headers[h].value;
                    break;
                }
            }
            
            var tempFromLower = tempFrom.toLowerCase();
            // 如果是系統寄出的信 (確認信)，跳過，繼續往前找
            if (tempFromLower.indexOf("e700document") !== -1 || tempFromLower.indexOf("雙和醫院病歷組") !== -1) {
                continue;
            }
            
            // 找到醫師寄來的信！
            // 如果這封信還沒被打星號，這就是我們要抓的目標！
            if (!isStarred) {
                msgDetail = tempMsg;
                msgId = tempMsg.id;
                from = tempFrom;
                
                for (var h = 0; h < tempMsg.payload.headers.length; h++) {
                    var name = tempMsg.payload.headers[h].name.toLowerCase();
                    if (name === 'subject') subject = tempMsg.payload.headers[h].value;
                    if (name === 'date') {
                        try {
                            dateStr = Utilities.formatDate(new Date(tempMsg.payload.headers[h].value), "GMT+8", "yyyy-MM-dd HH:mm");
                        } catch(e) {
                            dateStr = tempMsg.payload.headers[h].value;
                        }
                    }
                }
                break; // 找到目標，跳出迴圈
            } else {
                // 如果這封醫師的信已經打過星號，代表這整個討論串都處理過了，直接結束
                break; 
            }
        }
        
        // 如果找不到任何未處理的醫師回信，就跳過這個討論串
        if (!msgDetail) {
            continue;
        }'''

text = text.replace(old_logic, new_logic)

with open('google_apps_script_webapp_v6.gs', 'w', encoding='utf-8') as f:
    f.write(text)

with open('最終正確程式碼_Threads_API_修正解碼.txt', 'r', encoding='utf-8') as f:
    text_txt = f.read()

text_txt = text_txt.replace(old_logic, new_logic)

with open('最終正確程式碼_Threads_API_修正解碼.txt', 'w', encoding='utf-8') as f:
    f.write(text_txt)

print("Done")
