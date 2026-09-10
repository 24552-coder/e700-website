/**
 * 雙和醫院病歷組 - 公文 Google 郵件自動發送與進度追蹤系統
 * 【Google Apps Script Web App 與 Webhook 雙支援版 (包含 Gmail 醫師回信自動掃描引擎)】
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
 * 核心 1: 接收 HTTP POST 請求 (支援發信 action: sendEmail & 掃描回信 action: scanReplies)
 */
function doPost(e) {
  try {
    var rawText = e.postData ? e.postData.getDataAsString("UTF-8") : "";
    var data = JSON.parse(rawText);

    if (data.action === "scanReplies") {
      var scanResult = scanGmailReplies();
      return ContentService.createTextOutput(JSON.stringify(scanResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "initResumableUpload" || data.action === "createResumableSession") {
      var sessionResult = initResumableUpload(data);
      return ContentService.createTextOutput(JSON.stringify(sessionResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "uploadResumableChunk") {
      var chunkRes = uploadResumableChunk(data);
      return ContentService.createTextOutput(JSON.stringify(chunkRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "makeFilePublic") {
      var publicResult = makeFilePublic(data);
      return ContentService.createTextOutput(JSON.stringify(publicResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "uploadChunk") {
      var chunkResult = handleChunkUpload(data);
      return ContentService.createTextOutput(JSON.stringify(chunkResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "uploadDrive") {
      var driveResult = uploadDriveApi(data);
      return ContentService.createTextOutput(JSON.stringify(driveResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 預設動作：發送郵件
    var to = data.to;
    var cc = data.cc || "";
    var subject = data.subject;
    var htmlBody = data.htmlBody;
    var attachmentsPayload = data.attachments || [];

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

    GmailApp.sendEmail(to, subject, "", options);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Google 郵件（包含實體附件與 Google Drive 雲端連結）已成功由背景寄出！",
      driveLinks: driveLinks,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 核心 2: 自動掃描 Gmail 收件匣中的醫師回信
 */
function scanGmailReplies() {
  try {
    var userEmail = Session.getEffectiveUser().getEmail().toLowerCase();
    var threads = GmailApp.search('subject:"【雙和醫院病歷組】"', 0, 50);
    var foundReplies = [];

    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var messages = thread.getMessages();

      if (messages.length > 1) {
        for (var m = messages.length - 1; m >= 1; m--) {
          var msg = messages[m];
          var fromStr = msg.getFrom().toLowerCase();

          if (fromStr.indexOf(userEmail) === -1 && fromStr.indexOf("e700document") === -1) {
            var subject = msg.getSubject();
            var body = msg.getPlainBody();
            var dateStr = Utilities.formatDate(msg.getDate(), "GMT+8", "yyyy-MM-dd HH:mm");

            var docMatch = subject.match(/單號[：:]\s*([0-9A-Za-z]+)/);
            var issueMatch = subject.match(/項次[：:]\s*([0-9A-Za-z\-]+)/);

            var docNo = docMatch ? docMatch[1] : "";
            var issueId = issueMatch ? issueMatch[1] : "";

            var cleanReply = body;
            cleanReply = cleanReply.split(/\r?\n\s*(?:雙和醫院病歷組|e700document@s\.tmu\.edu\.tw|[\w\.-]+@[\w\.-]+|<[^>]+>)?\s*於\s*\d{4}.*寫道[：:]/i)[0];
            cleanReply = cleanReply.split(/雙和醫院病歷組/i)[0];
            cleanReply = cleanReply.split(/e700document@s\.tmu\.edu\.tw/i)[0];
            cleanReply = cleanReply.split(/----------\s*原始郵件\s*----------/i)[0];
            cleanReply = cleanReply.split(/---------\s*Original Message\s*---------/i)[0];
            cleanReply = cleanReply.trim();

            if (cleanReply) {
              foundReplies.push({
                docNo: docNo,
                issueId: issueId,
                doctorEmail: msg.getFrom(),
                replyContent: cleanReply,
                repliedAt: dateStr
              });
            }
            break;
          }
        }
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

/**
 * 處理附件與 HTML 內之 Google Drive 連結替換
 */
function processAttachmentsAndHtml(attachmentsPayload, htmlBody) {
  var blobs = [];
  var driveLinks = [];

  if (attachmentsPayload && attachmentsPayload.length > 0) {
    for (var a = 0; a < attachmentsPayload.length; a++) {
      var att = attachmentsPayload[a];

      if (att.url && att.url.indexOf("http") === 0 && att.url.indexOf("drive-link/view") === -1) {
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
            var folderName = "雙和醫院公文附件庫";
            var folders = DriveApp.getFoldersByName(folderName);
            var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
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
      var linkBtnHtml = '<a href="' + linkUrl + '" target="_blank" style="display:inline-block;margin-top:4px;padding:6px 14px;background:#0056D2;color:#ffffff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:bold;">點此線上開啟 / 下載 Google Drive 雲端檔案</a>';

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
 * 核心 3: Google 內嵌 API 支援
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
    var folderName = "雙和醫院公文附件庫";

    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

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
 * 分區段上傳大型檔案至 Google Drive API (解決 GAS 10MB POST Payload 限制，快速文字拼合版)
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

    var folderName = "雙和醫院公文附件庫";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var tempFolderName = "_TempChunks_" + uploadId;
    var tempFolders = folder.getFoldersByName(tempFolderName);
    var tempFolder = tempFolders.hasNext() ? tempFolders.next() : folder.createFolder(tempFolderName);

    // 儲存當前分片 Base64 文字至暫存檔
    var chunkBlob = Utilities.newBlob(chunkB64, "text/plain", "chk_" + chunkIndex + ".txt");
    tempFolder.createFile(chunkBlob);

    // 若為最後一片，快速拼合 Base64 字串並進行一次性二元解碼
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

      // 清理暫存分片檔案與資料夾
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
 * 建立 Google Drive Resumable Upload 快速二元通道 Session (經由 GAS Relay 通道)
 */
function initResumableUpload(data) {
  try {
    var fileName = data.fileName || "公文大型附件";
    var mimeType = data.mimeType || "application/octet-stream";
    var fileSize = data.fileSize || 0;

    var folderName = "雙和醫院公文附件庫";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
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
 * 將切片經由 GAS Relay 傳送至 Google Drive 續傳 Session (完全解決網頁跨域 CORS 阻擋問題)
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
