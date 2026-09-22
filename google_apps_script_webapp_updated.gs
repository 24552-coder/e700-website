/**
 * 雙和醫院病歷組 - 公文 Google 郵件自動發送與進度追蹤系統
 * 【Google Apps Script 終極強效優化版 V7.0】
 * 
 * 部署說明：
 * 1. 開啟 https://script.google.com 點擊「新增專案」
 * 2. 貼入本段程式碼全選覆蓋 (取代 程式碼.gs)
 * 3. 點擊右上角「部署」->「管理部署」或「新增部署」-> 選擇「網頁應用程式 (Web App)」
 *    - 執行身份：我 (Me)
 *    - 誰可以存取：任何人 (Anyone)
 * 4. 點擊「部署」後選擇「建立新版本 (New Version)」並點擊部署。
 * 5. 設定定時自動掃描（可選）：
 *    在左側點選「觸發條件 (時鐘圖示)」-> 新增觸發條件 -> 選擇「scanGmailReplies」->「時間驅動」-> 每 1 分鐘或每 5 分鐘執行一次。
 */

function doGet(e) {
  try {
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('雙和醫院病歷組 - 公文 Google 郵件自動發送與進度追蹤系統')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return ContentService.createTextOutput("雙和醫院病歷組 - Google 郵件自動發送與掃描 Webhook 服務運作中！");
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 核心 1: 接收 HTTP POST 請求 (全功能統一分流路由)
 */
function doPost(e) {
  try {
    var rawText = e.postData ? e.postData.getDataAsString("UTF-8") : "";
    var data = JSON.parse(rawText);
    var action = data.action || "sendEmail";

    if (action === "scanReplies") {
      return jsonResponse(scanGmailReplies());
    }
    if (action === "saveCloudData") {
      return jsonResponse(saveCloudDataApi(data));
    }
    if (action === "getCloudData") {
      return jsonResponse(getCloudDataApi());
    }
    if (action === "initResumableUpload" || action === "createResumableSession") {
      return jsonResponse(initResumableUpload(data));
    }
    if (action === "uploadResumableChunk") {
      return jsonResponse(uploadResumableChunk(data));
    }
    if (action === "makeFilePublic") {
      return jsonResponse(makeFilePublic(data));
    }
    if (action === "uploadChunk") {
      return jsonResponse(handleChunkUpload(data));
    }
    if (action === "uploadDrive") {
      return jsonResponse(uploadDriveApi(data));
    }
    if (action === "sendEmail") {
      return jsonResponse(sendEmailApi(data));
    }

    // 預設 fallback 動作：發送郵件
    return jsonResponse(sendEmailApi(data));
  } catch (err) {
    return jsonResponse({
      status: "error",
      message: "doPost Error: " + err.toString()
    });
  }
}

// 輔助函式：統一 JSON 回傳格式
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 核心 2: 自動掃描 Gmail 收件匣中的醫師回信 (進階版 Gmail API 引擎 - 終極極速防漏版)
 */
function scanGmailReplies() {
  try {
    var userEmail = Session.getEffectiveUser().getEmail().toLowerCase();
    
    // 搜尋主題包含【雙和醫院病歷組】近 7 天之信件 (完全解除星號與標籤限制)
    var query = 'subject:【雙和醫院病歷組】 newer_than:7d';
    var response = Gmail.Users.Messages.list('me', { q: query, maxResults: 100 });
    
    var foundReplies = [];

    if (response.messages && response.messages.length > 0) {
      for (var i = 0; i < response.messages.length; i++) {
        var msgId = response.messages[i].id;
        var msgDetail = Gmail.Users.Messages.get('me', msgId, { format: 'full' });
        
        var payload = msgDetail.payload;
        var headers = payload.headers;
        
        var subject = "";
        var from = "";
        var dateStr = "";
        
        for (var h = 0; h < headers.length; h++) {
          var hName = headers[h].name.toLowerCase();
          if (hName === 'subject') subject = headers[h].value;
          if (hName === 'from') from = headers[h].value;
          if (hName === 'date') {
            try {
              var rawDate = new Date(headers[h].value);
              dateStr = Utilities.formatDate(rawDate, "GMT+8", "yyyy-MM-dd HH:mm");
            } catch(eDate) {
              dateStr = headers[h].value;
            }
          }
        }
        
        var msgFromLower = from.toLowerCase();
        
        // 防呆：如果是系統自己發出去的信（包含確認信），直接略過
        if (msgFromLower.indexOf("e700document") !== -1 || msgFromLower.indexOf("雙和醫院病歷組") !== -1 || msgFromLower.indexOf("drive-shares") !== -1) {
           continue;
        }

        // 解析發件人純 Email 與純 姓名
        var doctorEmailOnly = from;
        var senderNameOnly = from;
        if (from.indexOf("<") !== -1) {
          var emM = from.match(/<([^>]+)>/);
          if (emM) doctorEmailOnly = emM[1];
          senderNameOnly = from.split("<")[0].replace(/"/g, "").trim();
        }
        doctorEmailOnly = doctorEmailOnly.toLowerCase().trim();

        // 提取單號與項次
        var docMatch = subject.match(/單號[：:]\s*([^\s(]+)/);
        var issueMatch = subject.match(/項次[：:]\s*([0-9A-Za-z\-]+)/);

        var docNo = docMatch ? docMatch[1] : "";
        var issueId = issueMatch ? issueMatch[1] : "";

        if (!docNo && !issueId && !doctorEmailOnly) {
          continue;
        }

        // 解析信件內文 (處理 Base64 編碼，以及多層 MIME 結構)
        var body = extractMessageBody(payload);
        
        // 深度清理醫師回信內文（剝離簽名檔、前文引述與抬頭）
        var cleanReply = body || "";
        cleanReply = cleanReply.split(/\r?\n.*於\s*\d{4}.*寫道[：:]/i)[0];
        cleanReply = cleanReply.split(/\r?\n.*wrote[：:]/i)[0];
        cleanReply = cleanReply.split(/----------\s*原始郵件\s*----------/i)[0];
        cleanReply = cleanReply.split(/---------\s*Original Message\s*---------/i)[0];
        cleanReply = cleanReply.split(/\r?\n\s*(寄件者|From)[：:]\s*(病歷組|雙和)/i)[0];
        
        var fromIndex = cleanReply.search(/\r?\n\s*From:\s*雙和醫院病歷組/i);
        if (fromIndex !== -1) {
          cleanReply = cleanReply.substring(0, fromIndex);
        }
        
        cleanReply = cleanReply.trim();
        
        var hasAttachments = false;
        if (payload.parts) {
          for (var p = 0; p < payload.parts.length; p++) {
            if (payload.parts[p].filename && payload.parts[p].filename.length > 0) {
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
            doctorEmail: doctorEmailOnly,
            senderEmail: doctorEmailOnly,
            senderName: senderNameOnly || from,
            replyContent: cleanReply,
            repliedAt: dateStr,
            subject: subject
          });
        }
      }
    }

    console.log("【極速掃描】成功掃描並抓取 " + foundReplies.length + " 筆醫師回覆！");
    return {
      status: "success",
      count: foundReplies.length,
      replies: foundReplies
    };
  } catch (err) {
    return {
      status: "error",
      message: "Advanced Gmail API Error: " + err.toString()
    };
  }
}

// 輔助函數：遞迴解析信件內文 (Gmail API 專用，支援 UTF-8, Big5, Base64)
function extractMessageBody(payload) {
  if (!payload) return "";
  
  function safeDecode(dataStr) {
    if (!dataStr) return "";
    var decodedBytes;
    try {
      decodedBytes = Utilities.base64DecodeWebSafe(dataStr);
    } catch(e1) {
      try {
        decodedBytes = Utilities.base64Decode(dataStr);
      } catch(e2) {
        return "";
      }
    }
    
    try {
      return Utilities.newBlob(decodedBytes).getDataAsString('UTF-8');
    } catch(e3) {
      try {
        return Utilities.newBlob(decodedBytes).getDataAsString('big5');
      } catch(e4) {
        try {
          return Utilities.newBlob(decodedBytes).getDataAsString();
        } catch(e5) {
          return "";
        }
      }
    }
  }

  if (payload.body && payload.body.size > 0 && payload.body.data) {
    return safeDecode(payload.body.data);
  } else if (payload.parts) {
    var plainPart = null;
    var htmlPart = null;
    for (var i = 0; i < payload.parts.length; i++) {
      var p = payload.parts[i];
      if (p.mimeType === 'text/plain') plainPart = p;
      if (p.mimeType === 'text/html') htmlPart = p;
      if (p.mimeType.indexOf('multipart') === 0 && p.parts) {
         var nestedBody = extractMessageBody(p);
         if (nestedBody) return nestedBody;
      }
    }
    var targetPart = plainPart || htmlPart;
    if (targetPart && targetPart.body && targetPart.body.data) {
       var body = safeDecode(targetPart.body.data);
       if (!plainPart && htmlPart) {
          body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                     .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                     .replace(/<br\s*[\/]?>/gi, "\n")
                     .replace(/<\/p>/gi, "\n")
                     .replace(/<[^>]+>/g, "");
       }
       return body;
    }
  }
  
  return "";
}

/**
 * 處理附件與 HTML 內之 Google Drive 連結替換
 */
function processAttachmentsAndHtml(attachmentsPayload, htmlBody) {
  var blobs = [];
  var driveLinks = [];

  if (attachmentsPayload && attachmentsPayload.length > 0) {
    for (var a = 0; a < attachmentsPayload.length; a++) {
      var att = attachmentsPayload[a];

      if (att.base64Data && !att.isDriveLink) {
        try {
          var b64 = att.base64Data.indexOf(",") !== -1 ? att.base64Data.split(",")[1] : att.base64Data;
          var rawBytes = Utilities.base64Decode(b64);
          var blob = Utilities.newBlob(rawBytes, att.mimeType || "application/octet-stream", att.fileName || "公文附件.pdf");
          blobs.push(blob);
        } catch(errBlob) {}
      } else if (att.url && att.url.indexOf("http") === 0 && att.url.indexOf("drive-link/view") === -1) {
        driveLinks.push({
          fileName: att.fileName || "公文大型附件",
          url: att.url,
          size: att.size || 0
        });
      } else if (att.base64Data) {
        try {
          var b64 = att.base64Data.indexOf(",") !== -1 ? att.base64Data.split(",")[1] : att.base64Data;
          var rawBytes = Utilities.base64Decode(b64);
          var isDrive = att.isDriveLink || rawBytes.length > 5 * 1024 * 1024;

          if (isDrive) {
            var folder = getOrCreateFolder("雙和醫院公文附件庫");
            var blob = Utilities.newBlob(rawBytes, att.mimeType || "application/octet-stream", att.fileName || "公文大型附件");
            var driveFile = folder.createFile(blob);
            driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            driveLinks.push({ fileName: att.fileName || "公文大型附件", url: driveFile.getUrl(), size: rawBytes.length });
          } else {
            var blob = Utilities.newBlob(rawBytes, att.mimeType || "application/octet-stream", att.fileName || "公文附件.pdf");
            blobs.push(blob);
          }
        } catch(errBlob) {}
      }
    }
  }

  if (driveLinks.length > 0) {
    for (var d = 0; d < driveLinks.length; d++) {
      var linkUrl = driveLinks[d].url;
      var linkBtnHtml = '<a href="' + linkUrl + '" target="_blank" style="display:inline-block;margin-top:8px;padding:10px 22px;background:#0056D2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.15);">&#128229; 點此線上開啟 / 下載 Google Drive 雲端大檔</a>';

      if (htmlBody.indexOf("[待上傳 Google Drive]") !== -1) {
        htmlBody = htmlBody.replace(/\[待上傳 Google Drive\]\s*\(將於發送郵件時自動上傳並寫入存取連結\)/g, linkBtnHtml);
        htmlBody = htmlBody.replace(/\[待上傳 Google Drive\]/g, linkBtnHtml);
      }
      if (htmlBody.indexOf("https://drive.google.com/file/d/drive-link/view") !== -1) {
        htmlBody = htmlBody.replace(/https:\/\/drive\.google\.com\/file\/d\/drive-link\/view/g, linkUrl);
      }
    }
  }

  return {
    blobs: blobs,
    driveLinks: driveLinks,
    htmlBody: htmlBody
  };
}

/**
 * 核心 3: Google 寄信用 API
 */
function sendEmailApi(payload) {
  try {
    var to = payload.to;
    var cc = payload.cc || "";
    var subject = payload.subject;
    var htmlBody = payload.htmlBody;
    var attachmentsPayload = payload.attachments || [];

    var processed = processAttachmentsAndHtml(attachmentsPayload, htmlBody);
    var blobs = processed.blobs;
    var driveLinks = processed.driveLinks;
    htmlBody = processed.htmlBody;

    var options = {
      cc: cc,
      htmlBody: htmlBody,
      name: "雙和醫院病歷組"
    };
    if (blobs.length > 0) {
      options.attachments = blobs;
    }

    // 自動授予 Drive 檔案權限給收件者
    grantDriveAccess(htmlBody, to, cc);
    GmailApp.sendEmail(to, subject, "", options);

    return {
      status: "success",
      message: "Google 郵件（包含實體附件與 Google Drive 雲端連結）已全自動成功寄出！",
      driveLinks: driveLinks,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

/**
 * 核心 4: 大型附件自動上傳 Google Drive API
 */
function uploadDriveApi(payload) {
  try {
    var fileName = payload.fileName;
    var base64Data = payload.base64Data;
    var mimeType = payload.mimeType || "application/pdf";
    var folder = getOrCreateFolder("雙和醫院公文附件庫");

    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      status: "success",
      fileUrl: file.getUrl(),
      fileName: fileName
    };
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

/**
 * 分區段上傳大型檔案至 Google Drive API (解決 GAS 10MB POST Payload 限制，極速文字拼合版)
 */
function handleChunkUpload(data) {
  try {
    var uploadId = data.uploadId;
    var chunkIndex = parseInt(data.chunkIndex);
    var totalChunks = parseInt(data.totalChunks);
    var fileName = data.fileName;
    var mimeType = data.mimeType || "application/octet-stream";
    var chunkB64 = data.chunkB64;

    if (chunkB64.indexOf(",") !== -1) {
      chunkB64 = chunkB64.split(",")[1];
    }

    var folder = getOrCreateFolder("雙和醫院公文附件庫");
    var tempFolderName = "_TempChunks_" + uploadId;
    var tempFolders = folder.getFoldersByName(tempFolderName);
    var tempFolder = tempFolders.hasNext() ? tempFolders.next() : folder.createFolder(tempFolderName);

    var chunkBlob = Utilities.newBlob(chunkB64, "text/plain", "chk_" + chunkIndex + ".txt");
    tempFolder.createFile(chunkBlob);

    if (chunkIndex === totalChunks - 1) {
      var fullB64 = "";
      for (var i = 0; i < totalChunks; i++) {
        var chkFiles = tempFolder.getFilesByName("chk_" + i + ".txt");
        if (chkFiles.hasNext()) {
          fullB64 += chkFiles.next().getBlob().getDataAsString();
        }
      }

      var rawBytes = Utilities.base64Decode(fullB64);
      var finalBlob = Utilities.newBlob(rawBytes, mimeType, fileName);
      var finalFile = folder.createFile(finalBlob);
      finalFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      try {
        var filesToDel = tempFolder.getFiles();
        while (filesToDel.hasNext()) {
          filesToDel.next().setTrashed(true);
        }
        tempFolder.setTrashed(true);
      } catch (errClean) {}

      return {
        status: "success",
        isComplete: true,
        fileUrl: finalFile.getUrl(),
        fileName: fileName,
        message: "大型檔案已成功分段上傳至 Google Drive！"
      };
    }

    return {
      status: "success",
      isComplete: false,
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      message: "區段 " + (chunkIndex + 1) + "/" + totalChunks + " 已成功接收"
    };
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

/**
 * 建立 Google Drive Resumable Upload Session (中斷續傳專用)
 */
function initResumableUpload(data) {
  try {
    var fileName = data.fileName || "公文大型附件";
    var mimeType = data.mimeType || "application/octet-stream";
    var fileSize = data.fileSize || 0;

    var folder = getOrCreateFolder("雙和醫院公文附件庫");
    var folderId = folder.getId();

    var token = ScriptApp.getOAuthToken();
    var metadata = {
      name: fileName,
      mimeType: mimeType,
      parents: [folderId]
    };

    var options = {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      headers: {
        "Authorization": "Bearer " + token,
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": fileSize ? fileSize.toString() : "0"
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", options);
    var headers = res.getHeaders();
    var locationUrl = headers["Location"] || headers["location"] || headers["LOCATION"];

    if (!locationUrl) {
      throw new Error("無法從 Google Drive API 取得可中斷續傳 URL (HTTP " + res.getResponseCode() + ")");
    }

    return {
      status: "success",
      uploadUrl: locationUrl,
      folderId: folderId
    };
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

function createResumableSession(data) {
  return initResumableUpload(data);
}

/**
 * 將切片經由 GAS Relay 傳送至 Google Drive
 */
function uploadResumableChunk(data) {
  try {
    var uploadUrl = data.uploadUrl;
    var chunkB64 = data.chunkB64;
    var startByte = parseInt(data.startByte);
    var endByte = parseInt(data.endByte);
    var totalSize = parseInt(data.totalSize);

    if (!uploadUrl) throw new Error("缺少 uploadUrl");

    if (chunkB64.indexOf(",") !== -1) {
      chunkB64 = chunkB64.split(",")[1];
    }

    var rawBytes = Utilities.base64Decode(chunkB64);
    var token = ScriptApp.getOAuthToken();

    var options = {
      method: "put",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Range": "bytes " + startByte + "-" + endByte + "/" + totalSize
      },
      payload: rawBytes,
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(uploadUrl, options);
    var code = res.getResponseCode();

    if (code === 200 || code === 201) {
      var fileId = "";
      try {
        var resJson = JSON.parse(res.getContentText());
        fileId = resJson.id;
      } catch (e) {}

      var fileUrl = fileId ? "https://drive.google.com/file/d/" + fileId + "/view?usp=sharing" : "";
      if (fileId) {
        try {
          var file = DriveApp.getFileById(fileId);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fileUrl = file.getUrl();
        } catch (eDrive) {}
      }

      return {
        status: "success",
        isComplete: true,
        fileId: fileId,
        fileUrl: fileUrl
      };
    } else if (code === 308) {
      return {
        status: "success",
        isComplete: false,
        code: 308
      };
    } else {
      throw new Error("Drive Chunk 上傳失敗 (HTTP " + code + ": " + res.getContentText() + ")");
    }
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

/**
 * 將上傳完成的 Google Drive 檔案設定為公開可存取連結
 */
function makeFilePublic(data) {
  try {
    var fileId = data.fileId;
    var file = DriveApp.getFileById(fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return {
      status: "success",
      fileUrl: file.getUrl(),
      fileName: file.getName()
    };
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

/**
 * 核心 5: 全院多人雲端同步 API (saveCloudData & getCloudData)
 */
function saveCloudDataApi(data) {
  try {
    var folder = getOrCreateFolder("雙和醫院公文附件庫");
    var files = folder.getFilesByName("雙和醫院公文系統最新資料庫.json");
    var file;
    var jsonStr = JSON.stringify({
      docs: data.docs || [],
      issues: data.issues || [],
      updated_at: new Date().toISOString()
    });

    if (files.hasNext()) {
      file = files.next();
      file.setContent(jsonStr);
    } else {
      file = folder.createFile("雙和醫院公文系統最新資料庫.json", jsonStr, "application/json");
    }

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      status: "success",
      message: "全院最新公文與函詢資料已成功同步至 Google Drive 雲端！",
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}

function getCloudDataApi() {
  try {
    var folder = getOrCreateFolder("雙和醫院公文附件庫");
    var files = folder.getFilesByName("雙和醫院公文系統最新資料庫.json");
    if (!files.hasNext()) return { status: "empty", docs: [], issues: [] };
    var file = files.next();
    var content = file.getBlob().getDataAsString("UTF-8");
    var data = JSON.parse(content);
    return {
      status: "success",
      docs: data.docs || [],
      issues: data.issues || [],
      updated_at: data.updated_at
    };
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}

// 輔助函式：取得或建立 Google Drive 資料夾
function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  var newFolder = DriveApp.createFolder(folderName);
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}

// 輔助函式：自動開放 Drive 檔案權限給郵件收件人與副本所有人
function grantDriveAccess(htmlBody, to, cc) {
  try {
    var emails = [];
    var rawEmails = ((to || '') + ',' + (cc || '')).split(',');
    for (var i = 0; i < rawEmails.length; i++) {
      var em = rawEmails[i].trim();
      if (em.indexOf('<') !== -1) {
        var match = em.match(/<([^>]+)>/);
        if (match) em = match[1];
      }
      if (em && em.indexOf('@') !== -1) {
        emails.push(em.toLowerCase().trim());
      }
    }
    
    var fileIds = [];
    var regex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/g;
    var match;
    while ((match = regex.exec(htmlBody)) !== null) {
      if (fileIds.indexOf(match[1]) === -1) {
        fileIds.push(match[1]);
      }
    }
    
    for (var f = 0; f < fileIds.length; f++) {
      try {
        var file = DriveApp.getFileById(fileIds[f]);
        // 自動公開存取權，確保對方免登入亦可開啟
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        for (var e = 0; e < emails.length; e++) {
          try {
            file.addViewer(emails[e]);
          } catch(err1) {}
        }
      } catch(err2) {}
    }
  } catch (err3) {}
}
