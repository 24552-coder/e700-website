function runDiagnostics() {
  var user = Session.getEffectiveUser().getEmail();
  var query = 'is:inbox -is:starred';
  var response = Gmail.Users.Messages.list('me', { q: query, maxResults: 5 });
  
  var resultText = "【系統診斷報告】\\n";
  resultText += "目前執行 GAS 的帳號為：" + user + "\\n";
  
  if (response.messages && response.messages.length > 0) {
    resultText += "找到 " + response.messages.length + " 封未打星號的信件！\\n";
    for (var i = 0; i < response.messages.length; i++) {
      var msgId = response.messages[i].id;
      var msgDetail = Gmail.Users.Messages.get('me', msgId, { format: 'metadata', metadataHeaders: ['Subject', 'From'] });
      var subject = "", from = "";
      for (var h = 0; h < msgDetail.payload.headers.length; h++) {
        if (msgDetail.payload.headers[h].name.toLowerCase() === 'subject') subject = msgDetail.payload.headers[h].value;
        if (msgDetail.payload.headers[h].name.toLowerCase() === 'from') from = msgDetail.payload.headers[h].value;
      }
      resultText += (i+1) + ". 寄件者: " + from + " | 主旨: " + subject + "\\n";
    }
  } else {
    resultText += "找不到任何未打星號的信件！這代表系統看信箱的角度跟您不一樣。\\n";
  }
  
  // 建立一個檔案來顯示結果，避免 execution log 消失
  var folder = DriveApp.getRootFolder();
  var file = folder.createFile("診斷報告.txt", resultText, "text/plain");
  console.log("請去您的 Google 雲端硬碟首頁，打開「診斷報告.txt」查看結果！");
  console.log(resultText);
}
