/**
 * ???恍?風蝯?- ?祆? Google ?萎辣?芸??潮??脣漲餈質馱蝟餌絞
 * ?oogle Apps Script Web App ??Webhook ??渡? (? Gmail ?怠葦?縑?芸???撘?)??
 * 
 * ?函蔡隤芣?嚗?
 * 1. ?? https://script.google.com 暺??憓?獢?
 * 2. 鞎澆?祆挾蝔?蝣澆?貉???(?誨 蝔?蝣?gs)
 * 3. 暺??喃?閫蝵脯?>?恣?蝵脯??憓蝵脯?> ?豢??雯???函?撘?(Web App)??
 *    - ?瑁?頨思遢嚗? (Me)
 *    - 隤啣隞亙???隞颱?鈭?(Anyone)
 * 4. 暺??蝵脯??豢??遣蝡? (New Version)?蒂暺??函蔡??
 * 5. 閮剖?摰??芸???嚗?賂?嚗?
 *    ?典椰?湧??詻孛?潭?隞?(???內)??> ?啣?閫貊璇辣 -> ?豢??canGmailReplies??>??????> 瘥?1 ???? 5 ???瑁?銝甈～?
 */

function doGet(e) {
  try {
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('???恍?風蝯?- ?祆? Google ?萎辣?芸??潮??脣漲餈質馱蝟餌絞')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return ContentService.createTextOutput("???恍?風蝯?- Google ?萎辣?芸??潮??? Webhook ????銝哨?");
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ?詨? 1: ?交 HTTP POST 隢? (?舀?潔縑 action: sendEmail & ???縑 action: scanReplies)
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

    if (data.action === "saveCloudData") {
      var saveResult = saveCloudDataApi(data);
      return ContentService.createTextOutput(JSON.stringify(saveResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "getCloudData") {
      var getResult = getCloudDataApi();
      return ContentService.createTextOutput(JSON.stringify(getResult))
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

    // ?身??嚗?隞?
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
      name: "???恍?風蝯?
    };
    if (blobs.length > 0) {
      options.attachments = blobs;
    }

    grantDriveAccess(htmlBody, to, cc);
    GmailApp.sendEmail(to, subject, "", options);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Google ?萎辣嚗??怠祕擃?隞嗉? Google Drive ?脩垢???嚗歇???梯??臬??綽?",
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
 * ?詨? 2: ?芸??? Gmail ?嗡辣??葉?撣怠?靽?
 */
function scanGmailReplies() {
  try {
    var userEmail = Session.getEffectiveUser().getEmail().toLowerCase();
    var threads = GmailApp.search('subject:"????Ｙ?甇瑞??? label:inbox is:unread');
    var foundReplies = [];

    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var messages = thread.getMessages();

      if (messages.length > 1) { // ??閰梁???
        var lastMsg = messages[messages.length - 1];
        var subject = lastMsg.getSubject();
        var fromStr = lastMsg.getFrom().toLowerCase();

        // 1. ?蕪?撣怠?靽∴?憒??敺?撠閮??祉頂蝯望??風蝯撌梧?隞?”?舐頂蝯勗??箸?CC?嚗蕭?乩蒂璅內撌脰?
        if (fromStr.indexOf(userEmail) !== -1 || fromStr.indexOf("e700document") !== -1) {
          thread.markRead();
          continue;
        }

        // 2. ?蕪蝟餌絞?芸??Ｙ???獢?蝣箄??銝餅
        if (subject.indexOf("?歇摰???) !== -1 || subject.indexOf("撌脩Ⅱ隤???) !== -1 || subject.indexOf("??獢?) !== -1) {
          thread.markRead();
          continue;
        }

        var body = lastMsg.getPlainBody();
        var dateStr = Utilities.formatDate(lastMsg.getDate(), "GMT+8", "yyyy-MM-dd HH:mm");

        // ???株???甈?
        var docMatch = subject.match(/?株?[嚗?]\s*([0-9A-Za-z]+)/);
        var issueMatch = subject.match(/?活[嚗?]\s*([0-9A-Za-z\-]+)/);

        var docNo = docMatch ? docMatch[1] : "";
        var issueId = issueMatch ? issueMatch[1] : "";

        // 皜??怠葦?縑?扳?嚗器摨??Ｗ?餈圈?函? Sender 鞈?嚗?
        var cleanReply = body;
        cleanReply = cleanReply.split(/\r?\n\s*(?:???恍?風蝯e700document@s\.tmu\.edu\.tw|[\w\.-]+@[\w\.-]+|<[^>]+>)?\s*?墦s*\d{4}.*撖恍?[嚗?]/i)[0];
        cleanReply = cleanReply.split(/???恍?風蝯?i)[0];
        cleanReply = cleanReply.split(/e700document@s\.tmu\.edu\.tw/i)[0];
        cleanReply = cleanReply.split(/----------\s*???萎辣\s*----------/i)[0];
        cleanReply = cleanReply.split(/---------\s*Original Message\s*---------/i)[0];
        cleanReply = cleanReply.trim();

        if (cleanReply) {
          foundReplies.push({
            docNo: docNo,
            issueId: issueId,
            doctorEmail: lastMsg.getFrom(),
            replyContent: cleanReply,
            repliedAt: dateStr
          });

          // ?芸??潮歇?嗅?怠葦???靽∠策?風蝯?
          try {
            var notifySubject = "????Ｙ?甇瑞??歇?嗅?怠葦?? ?株?嚗? + docNo + (issueId ? " (?活嚗? + issueId + ")" : "");
            var notifyHtml = `
              <div style="font-family:Roboto, Arial, sans-serif;max-width:580px;margin:0 auto;border:1px solid #dadce0;border-radius:8px;overflow:hidden;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                  <div style="background:#0056D2;color:white;padding:18px 24px;text-align:center;font-size:17px;font-weight:bold;letter-spacing:0.5px;">
                      [撌脩Ⅱ隤 ?怠葦??撌脩Ⅱ隤???
                  </div>
                  <div style="padding:24px;line-height:1.7;color:#202124;font-size:13px;">
                      <div style="background:#E8F0FE;border:1px solid #D2E3FC;color:#174EA6;padding:14px 16px;border-radius:6px;margin-bottom:16px;">
                          <strong style="color:#0056D2;font-size:14px;">[?怠葦???批捆]</strong><br>
                          <div style="background:#ffffff;padding:10px 14px;border-radius:4px;margin-top:6px;border:1px solid #dadce0;color:#202124;font-size:14px;">
                              ${cleanReply}
                          </div>
                      </div>
                      <div style="margin-bottom:10px;"><strong>獢辣?株?嚗?/strong> ${docNo}</div>
                      ${issueId ? `<div style="margin-bottom:10px;"><strong>?質岷?活嚗?/strong> ${issueId}</div>` : ''}
                      <div style="margin-bottom:10px;"><strong>??靘?嚗?/strong> ${lastMsg.getFrom()}</div>
                      <hr style="border:none;border-top:1px solid #f1f3f4;margin:16px 0;">
                      <div style="font-size:12px;color:#5f6368;">
                          <strong>?輯齒鈭箏嚗?/strong>???恍?風蝯??芸?撠蝟餌絞
                      </div>
                  </div>
              </div>
            `;
            // ?潮Ⅱ隤??靽∠策撖辣?鈭?
            GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), notifySubject, "", {
              htmlBody: notifyHtml,
              name: "???恍?風蝯?
            });
          } catch(e) {}
        }

        // 3. ??摰?敺?蝷箇撌脰?嚗甇Ｙ??銴???閫貊 Toast
        thread.markRead();
      } else {
        // ?桀?閮憒??臭??芰頂蝯望??芸楛????璅內?箏歇霈
        var firstMsg = messages[0];
        var firstFrom = firstMsg.getFrom().toLowerCase();
        if (firstFrom.indexOf(userEmail) !== -1 || firstFrom.indexOf("e700document") !== -1) {
          thread.markRead();
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
 * ???辣??HTML ?找? Google Drive ????踵?
 */
function processAttachmentsAndHtml(attachmentsPayload, htmlBody) {
  var blobs = [];
  var driveLinks = [];

  if (attachmentsPayload && attachmentsPayload.length > 0) {
    for (var a = 0; a < attachmentsPayload.length; a++) {
      var att = attachmentsPayload[a];

      if (att.base64Data && !att.isDriveLink) {
        // 撠?獢?(<5MB)嚗?00% 撖阡?撠???Gmail Email ?辣撖策?怠葦 (?湔??Email ??嚗????脩垢)
        try {
          var b64 = att.base64Data.indexOf(",") !== -1 ? att.base64Data.split(",")[1] : att.base64Data;
          var rawBytes = Utilities.base64Decode(b64);
          var blob = Utilities.newBlob(rawBytes, att.mimeType || "application/octet-stream", att.fileName || "?祆??辣.pdf");
          blobs.push(blob);
        } catch(errBlob) {}
      } else if (att.url && att.url.indexOf("http") === 0 && att.url.indexOf("drive-link/view") === -1) {
        driveLinks.push({
          fileName: att.fileName || "?祆?憭批??辣",
          url: att.url,
          size: att.size || 0
        });
      } else if (att.base64Data) {
        try {
          var b64 = att.base64Data.indexOf(",") !== -1 ? att.base64Data.split(",")[1] : att.base64Data;
          var rawBytes = Utilities.base64Decode(b64);
          var isDrive = att.isDriveLink || rawBytes.length > 5 * 1024 * 1024;

          if (isDrive) {
            var folderName = "???恍?祆??辣摨?;
            var folders = DriveApp.getFoldersByName(folderName);
            var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
            var blob = Utilities.newBlob(rawBytes, att.mimeType || "application/octet-stream", att.fileName || "?祆?憭批??辣");
            var driveFile = folder.createFile(blob);
            driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            driveLinks.push({ fileName: att.fileName || "?祆?憭批??辣", url: driveFile.getUrl(), size: rawBytes.length });
          } else {
            var blob = Utilities.newBlob(rawBytes, att.mimeType || "application/octet-stream", att.fileName || "?祆??辣.pdf");
            blobs.push(blob);
          }
        } catch(errBlob) {}
      }
    }
  }

  if (driveLinks.length > 0) {
    for (var d = 0; d < driveLinks.length; d++) {
      var linkUrl = driveLinks[d].url;
      var linkBtnHtml = '<a href="' + linkUrl + '" target="_blank" style="display:inline-block;margin-top:8px;padding:10px 22px;background:#0056D2;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.15);">&#128229; 暺迨蝺??? / 銝? Google Drive ?脩垢憭扳?</a>';

      if (htmlBody.indexOf("[敺???Google Drive]") !== -1) {
        htmlBody = htmlBody.replace(/\[敺???Google Drive\]\s*\(撠?潮隞嗆??芸?銝銝血神?亙????\)/g, linkBtnHtml);
        htmlBody = htmlBody.replace(/\[敺???Google Drive\]/g, linkBtnHtml);
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
 * ?詨? 3: Google ?批? API ?舀
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
      name: "???恍?風蝯?
    };
    if (blobs.length > 0) {
      options.attachments = blobs;
    }

    grantDriveAccess(htmlBody, to, cc);
    GmailApp.sendEmail(to, subject, "", options);

    return {
      status: "success",
      message: "Google ?萎辣嚗??怠祕擃?隞嗉? Google Drive ?脩垢???嚗歇?刻?????綽?",
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
 * ?詨? 4: 憭批??辣?芸?銝 Google Drive API
 */
function uploadDriveApi(payload) {
  try {
    var fileName = payload.fileName;
    var base64Data = payload.base64Data;
    var mimeType = payload.mimeType || "application/pdf";
    var folderName = "???恍?祆??辣摨?;

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
 * ??畾萎??喳之??獢 Google Drive API (閫?捱 GAS 10MB POST Payload ?嚗翰??摮??)
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

    var folderName = "???恍?祆??辣摨?;
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var tempFolderName = "_TempChunks_" + uploadId;
    var tempFolders = folder.getFoldersByName(tempFolderName);
    var tempFolder = tempFolders.hasNext() ? tempFolders.next() : folder.createFolder(tempFolderName);

    // ?脣??嗅??? Base64 ???單摮?
    var chunkBlob = Utilities.newBlob(chunkB64, "text/plain", "chk_" + chunkIndex + ".txt");
    tempFolder.createFile(chunkBlob);

    // ?亦?敺???敹恍??Base64 摮葡銝阡脰?銝甈⊥找??圾蝣?
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

      // 皜??怠???瑼????冗
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
        message: "憭批?瑼?撌脫???畾萎??唾 Google Drive嚗?
      };
    }

    return {
      status: "success",
      isComplete: false,
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      message: "?畾?" + (chunkIndex + 1) + "/" + totalChunks + " 撌脫????
    };
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

/**
 * 撱箇? Google Drive Resumable Upload 敹恍??? Session (蝬 GAS Relay ??)
 */
function initResumableUpload(data) {
  try {
    var fileName = data.fileName || "?祆?憭批??辣";
    var mimeType = data.mimeType || "application/octet-stream";
    var fileSize = data.fileSize || 0;

    var folderName = "???恍?祆??辣摨?;
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
      throw new Error("?⊥?敺?Google Drive API ???臭葉?瑞???URL (HTTP " + res.getResponseCode() + ")");
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
 * 撠?????GAS Relay ?喲 Google Drive 蝥 Session (摰閫?捱蝬脤?頝典? CORS ?餅???)
 */
function uploadResumableChunk(data) {
  try {
    var uploadUrl = data.uploadUrl;
    var chunkB64 = data.chunkB64;
    var startByte = parseInt(data.startByte);
    var endByte = parseInt(data.endByte);
    var totalSize = parseInt(data.totalSize);

    if (!uploadUrl) throw new Error("蝻箏? uploadUrl");

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
      throw new Error("Drive Chunk 銝憭望? (HTTP " + code + ": " + res.getContentText() + ")");
    }
  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

/**
 * 撠??喳??? Google Drive 瑼?閮剖??箏?摮????
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
 * ?詨? 5: ?券憭犖?脩垢?郊 API (saveCloudData & getCloudData)
 */
function saveCloudDataApi(data) {
  try {
    var folderName = "???恍?祆??辣摨?;
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var files = folder.getFilesByName("???恍?祆?蝟餌絞??啗??澈.json");
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
      file = folder.createFile("???恍?祆?蝟餌絞??啗??澈.json", jsonStr, "application/json");
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    return {
      status: "success",
      message: "?券??啣???質岷鞈?撌脫???甇亥 Google Drive ?脩垢嚗?,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}

function getCloudDataApi() {
  try {
    var folderName = "???恍?祆??辣摨?;
    var folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) return { status: "empty", docs: [], issues: [] };
    var folder = folders.next();
    var files = folder.getFilesByName("???恍?祆?蝟餌絞??啗??澈.json");
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
    
    if (emails.length === 0) return;
    
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
        for (var e = 0; e < emails.length; e++) {
          try {
            file.addViewer(emails[e]);
          } catch(err1) {}
        }
      } catch(err2) {}
    }
  } catch (err3) {}
}

