/**
 * 雙和醫院病歷組 - 公文 Google 郵件自動發送與進度追蹤系統
 * 【Google Apps Script Web App 終極後端防禦與雙向同步版】
 */

function doGet(e) {
  try {
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('雙和醫院病歷組 - 公文 Google 郵件自動發送與進度追蹤系統')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return ContentService.createTextOutput('雙和醫院病歷組 - Google Webhook 服務運作中！');
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 核心 1: 接收 HTTP POST 請求
 */
function doPost(e) {
  try {
    var rawText = e.postData ? e.postData.getDataAsString('UTF-8') : '';
    var data = JSON.parse(rawText);

    if (data.action === 'scanReplies') {
      var scanResult = scanGmailReplies();
      return ContentService.createTextOutput(JSON.stringify(scanResult)).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'saveCloudData') {
      var saveResult = saveCloudDataApi(data);
      return ContentService.createTextOutput(JSON.stringify(saveResult)).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'getCloudData') {
      var getResult = getCloudDataApi();
      return ContentService.createTextOutput(JSON.stringify(getResult)).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'initResumableUpload' || data.action === 'createResumableSession') {
      var sessionResult = initResumableUpload(data);
      return ContentService.createTextOutput(JSON.stringify(sessionResult)).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'uploadResumableChunk') {
      var chunkRes = uploadResumableChunk(data);
      return ContentService.createTextOutput(JSON.stringify(chunkRes)).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'makeFilePublic') {
      var publicResult = makeFilePublic(data);
      return ContentService.createTextOutput(JSON.stringify(publicResult)).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'uploadChunk') {
      var chunkResult = handleChunkUpload(data);
      return ContentService.createTextOutput(JSON.stringify(chunkResult)).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'uploadDrive') {
      var driveResult = uploadDriveApi(data);
      return ContentService.createTextOutput(JSON.stringify(driveResult)).setMimeType(ContentService.MimeType.JSON);
    }

    // 預設動作：發送郵件 (執行後端防禦重複熔斷)
    var sendResult = sendEmailApi(data);
    return ContentService.createTextOutput(JSON.stringify(sendResult)).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 核心 2: 發送郵件 (包含後端 10 分鐘重複熔斷鎖定)
 */
function sendEmailApi(payload) {
  try {
    var to = payload.to;
    var cc = payload.cc || '';
    var subject = payload.subject || '';
    var htmlBody = payload.htmlBody || '';
    var issueId = payload.issueId || '';
    var attachmentsPayload = payload.attachments || [];

    // 【後端絕對防暴走熔斷器】：針對相同的單號與信件主旨，10 分鐘內只允許發送一次
    if (issueId && subject) {
      var props = PropertiesService.getScriptProperties();
      var lockKey = 'SENT_LOCK_' + issueId.trim() + '_' + subject.replace(/[^a-zA-Z0-9]/g, '');
      var lastSentStr = props.getProperty(lockKey);
      var now = new Date().getTime();

      if (lastSentStr) {
        var lastSent = parseInt(lastSentStr, 10);
        if (now - lastSent < 10 * 60 * 1000) { // 10 分鐘內防重複發送
          Logger.log('[GAS 後端攔截] 10分鐘內重複觸發發信，已自動成功阻擋: ' + lockKey);
          return {
            status: 'blocked',
            message: '【GAS後端熔斷器】該單號信件於10分鐘內已由系統寄出過，後端已自動攔截阻擋，防止重複寄信！',
            timestamp: new Date().toISOString()
          };
        }
      }
      props.setProperty(lockKey, now.toString());
    }

    var processed = processAttachmentsAndHtml(attachmentsPayload, htmlBody);
    var blobs = processed.blobs;
    var driveLinks = processed.driveLinks;
    htmlBody = processed.htmlBody;

    var options = {
      cc: cc,
      htmlBody: htmlBody,
      name: '雙和醫院病歷組'
    };
    if (blobs.length > 0) {
      options.attachments = blobs;
    }

    grantDriveAccess(htmlBody, to, cc);
    GmailApp.sendEmail(to, subject, '', options);

    return {
      status: 'success',
      message: 'Google 郵件（包含實體附件與 Google Drive 雲端連結）已全自動成功寄出！',
      driveLinks: driveLinks,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      status: 'error',
      message: err.toString()
    };
  }
}

/**
 * 核心 3: 自動掃描 Gmail 收件匣中的醫師回信
 */
function scanGmailReplies() {
  try {
    var response = Gmail.Users.Threads.list('me', { q: 'is:inbox -is:starred', maxResults: 50 });
    var foundReplies = [];
    var messageIdsToStar = [];

    if (response.threads && response.threads.length > 0) {
      for (var i = 0; i < response.threads.length; i++) {
        var threadId = response.threads[i].id;
        var threadDetail = Gmail.Users.Threads.get('me', threadId);
        
        if (!threadDetail.messages || threadDetail.messages.length === 0) continue;
        
        var msgDetail = null;
        var msgId = '';
        var subject = '';
        var from = '';
        var dateStr = '';
        
        // 由後往前找最新的醫師回信
        for (var m = threadDetail.messages.length - 1; m >= 0; m--) {
          var tempMsg = threadDetail.messages[m];
          var tempFrom = '';
          var tempSubject = '';
          var isStarred = false;
          
          if (tempMsg.labelIds && tempMsg.labelIds.indexOf('STARRED') !== -1) {
            isStarred = true;
          }
          
          for (var h = 0; h < tempMsg.payload.headers.length; h++) {
            var hName = tempMsg.payload.headers[h].name.toLowerCase();
            if (hName === 'from') tempFrom = tempMsg.payload.headers[h].value;
            if (hName === 'subject') tempSubject = tempMsg.payload.headers[h].value;
          }
          
          // 完全過濾系統通知與病歷組自己發出的郵件
          if (tempSubject.indexOf('已收到醫師回覆') !== -1 || 
              tempSubject.indexOf('已收到您的回覆確認') !== -1 || 
              tempSubject.indexOf('退回補件通知') !== -1 || 
              tempSubject.indexOf('案件已結案完成') !== -1 || 
              tempSubject.indexOf('催辦提醒通知') !== -1 ||
              tempSubject.indexOf('問題回覆通知') !== -1 ||
              tempFrom.indexOf('e700document') !== -1) {
            continue;
          }
          
          if (!isStarred) {
            msgDetail = tempMsg;
            msgId = tempMsg.id;
            from = tempFrom;
            subject = tempSubject;
            
            for (var h = 0; h < tempMsg.payload.headers.length; h++) {
              if (tempMsg.payload.headers[h].name.toLowerCase() === 'date') {
                try {
                  dateStr = Utilities.formatDate(new Date(tempMsg.payload.headers[h].value), 'GMT+8', 'yyyy-MM-dd HH:mm');
                } catch(e) {
                  dateStr = tempMsg.payload.headers[h].value;
                }
              }
            }
            break;
          } else {
            break; 
          }
        }
        
        if (!msgDetail) continue;

        var docMatch = subject.match(/單號[：:]\s*([^\s(]+)/);
        var issueMatch = subject.match(/項次[：:]\s*([0-9A-Za-z\-]+)/);

        var docNo = docMatch ? docMatch[1] : '';
        var issueId = issueMatch ? issueMatch[1] : '';

        if (!docNo && !issueId) continue;

        var rawBody = extractMessageBody(msgDetail.payload);
        var cleanReply = rawBody || '';
        cleanReply = cleanReply.split(/\r?\n.*寫道[：:]/i)[0];
        cleanReply = cleanReply.split(/\r?\n.*wrote[：:]/i)[0];
        cleanReply = cleanReply.split(/----------\s*原始郵件\s*----------/i)[0];
        cleanReply = cleanReply.split(/---------\s*Original Message\s*---------/i)[0];
        cleanReply = cleanReply.split(/\r?\n\s*(寄件者|From)[：:]\s*雙和醫院病歷組/i)[0];
        cleanReply = cleanReply.trim();
        
        var hasAttachments = false;
        if (msgDetail.payload.parts) {
          for (var p = 0; p < msgDetail.payload.parts.length; p++) {
            if (msgDetail.payload.parts[p].filename && msgDetail.payload.parts[p].filename.length > 0) {
              hasAttachments = true;
              break;
            }
          }
        }

        if (cleanReply === '' && !hasAttachments) {
          cleanReply = '【系統無法解析此信件，請至信箱查看】';
          hasAttachments = true;
        }

        if (cleanReply || hasAttachments) {
          if (!cleanReply) cleanReply = '【醫師僅夾帶附件回覆，無文字內容】';
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
    
    for (var m = 0; m < messageIdsToStar.length; m++) {
      try {
        Gmail.Users.Messages.modify({
          addLabelIds: ['STARRED']
        }, 'me', messageIdsToStar[m]);
      } catch(errStar) {}
    }

    return {
      status: 'success',
      count: foundReplies.length,
      replies: foundReplies
    };
  } catch (err) {
    return {
      status: 'error',
      message: err.toString()
    };
  }
}

function safeDecode(encodedText) {
  if (!encodedText) return '';
  if (Array.isArray(encodedText)) {
    try {
      return Utilities.newBlob(encodedText).getDataAsString('UTF-8');
    } catch (e) {
      return '';
    }
  }
  var str = String(encodedText).trim();
  if (!str) return '';
  if (/[\u4e00-\u9fa5]/.test(str) || str.indexOf('\n') !== -1 || str.indexOf(' ') !== -1) {
    return str;
  }
  try {
    var bytes = Utilities.base64DecodeWebSafe(str);
    return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  } catch (e1) {
    try {
      var bytesStd = Utilities.base64Decode(str);
      return Utilities.newBlob(bytesStd).getDataAsString('UTF-8');
    } catch (e2) {
      return str;
    }
  }
}

function extractMessageBody(payload) {
  if (!payload) return '';
  function parsePart(part) {
    if (!part) return '';
    var text = '';
    if (part.parts && part.parts.length > 0) {
      for (var k = 0; k < part.parts.length; k++) {
        text += parsePart(part.parts[k]);
      }
    } else if (part.body && part.body.data) {
      var mime = (part.mimeType || '').toLowerCase();
      if (mime === 'text/plain') {
        var decoded = safeDecode(part.body.data);
        if (decoded) text += decoded + '\n';
      } else if (mime === 'text/html') {
        var htmlContent = safeDecode(part.body.data);
        if (htmlContent) {
          var plainFromHtml = htmlContent
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/?[^>]+(>|$)/g, '');
          text += plainFromHtml + '\n';
        }
      }
    }
    return text;
  }
  return parsePart(payload);
}

function processAttachmentsAndHtml(attachmentsPayload, htmlBody) {
  var blobs = [];
  var driveLinks = [];
  if (attachmentsPayload && attachmentsPayload.length > 0) {
    for (var a = 0; a < attachmentsPayload.length; a++) {
      var att = attachmentsPayload[a];
      if (att.base64Data && !att.isDriveLink) {
        try {
          var b64 = att.base64Data.indexOf(',') !== -1 ? att.base64Data.split(',')[1] : att.base64Data;
          var rawBytes = Utilities.base64Decode(b64);
          var blob = Utilities.newBlob(rawBytes, att.mimeType || 'application/octet-stream', att.fileName || '公文附件.pdf');
          blobs.push(blob);
        } catch(errBlob) {}
      } else if (att.url && att.url.indexOf('http') === 0 && att.url.indexOf('drive-link/view') === -1) {
        driveLinks.push({
          fileName: att.fileName || '公文大型附件',
          url: att.url,
          size: att.size || 0
        });
      } else if (att.base64Data) {
        try {
          var b64 = att.base64Data.indexOf(',') !== -1 ? att.base64Data.split(',')[1] : att.base64Data;
          var rawBytes = Utilities.base64Decode(b64);
          var isDrive = att.isDriveLink || rawBytes.length > 5 * 1024 * 1024;
          if (isDrive) {
            var folderName = '雙和醫院公文附件庫';
            var folders = DriveApp.getFoldersByName(folderName);
            var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
            var blob = Utilities.newBlob(rawBytes, att.mimeType || 'application/octet-stream', att.fileName || '公文大型附件');
            var driveFile = folder.createFile(blob);
            driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            driveLinks.push({ fileName: att.fileName || '公文大型附件', url: driveFile.getUrl(), size: rawBytes.length });
          } else {
            var blob = Utilities.newBlob(rawBytes, att.mimeType || 'application/octet-stream', att.fileName || '公文附件.pdf');
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

      if (htmlBody.indexOf('[待上傳 Google Drive]') !== -1) {
        htmlBody = htmlBody.replace(/\[待上傳 Google Drive\]\s*\(將於發送郵件時自動上傳並寫入存取連結\)/g, linkBtnHtml);
        htmlBody = htmlBody.replace(/\[待上傳 Google Drive\]/g, linkBtnHtml);
      }
      if (htmlBody.indexOf('https://drive.google.com/file/d/drive-link/view') !== -1) {
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

function uploadDriveApi(payload) {
  try {
    var fileName = payload.fileName;
    var base64Data = payload.base64Data;
    var mimeType = payload.mimeType || 'application/pdf';
    var folderName = '雙和醫院公文附件庫';

    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      status: 'success',
      fileUrl: file.getUrl(),
      fileName: fileName
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function handleChunkUpload(data) {
  try {
    var uploadId = data.uploadId;
    var chunkIndex = parseInt(data.chunkIndex);
    var totalChunks = parseInt(data.totalChunks);
    var fileName = data.fileName;
    var mimeType = data.mimeType || 'application/octet-stream';
    var chunkB64 = data.chunkB64;

    if (chunkB64.indexOf(',') !== -1) {
      chunkB64 = chunkB64.split(',')[1];
    }

    var folderName = '雙和醫院公文附件庫';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var tempFolderName = '_TempChunks_' + uploadId;
    var tempFolders = folder.getFoldersByName(tempFolderName);
    var tempFolder = tempFolders.hasNext() ? tempFolders.next() : folder.createFolder(tempFolderName);

    var chunkBlob = Utilities.newBlob(chunkB64, 'text/plain', 'chk_' + chunkIndex + '.txt');
    tempFolder.createFile(chunkBlob);

    if (chunkIndex === totalChunks - 1) {
      var fullB64 = '';
      for (var i = 0; i < totalChunks; i++) {
        var chkFiles = tempFolder.getFilesByName('chk_' + i + '.txt');
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
        status: 'success',
        isComplete: true,
        fileUrl: finalFile.getUrl(),
        fileName: fileName,
        message: '大型檔案已成功分段上傳至 Google Drive！'
      };
    }

    return {
      status: 'success',
      isComplete: false,
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      message: '區段 ' + (chunkIndex + 1) + '/' + totalChunks + ' 已成功接收'
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function initResumableUpload(data) {
  try {
    var fileName = data.fileName || '公文大型附件';
    var mimeType = data.mimeType || 'application/octet-stream';
    var fileSize = data.fileSize || 0;

    var folderName = '雙和醫院公文附件庫';
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
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: {
        'Authorization': 'Bearer ' + token,
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': fileSize ? fileSize.toString() : '0'
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', options);
    var headers = res.getHeaders();
    var locationUrl = headers['Location'] || headers['location'] || headers['LOCATION'];

    if (!locationUrl) {
      throw new Error('無法從 Google Drive API 取得可中斷續傳 URL (HTTP ' + res.getResponseCode() + ')');
    }

    return {
      status: 'success',
      uploadUrl: locationUrl,
      folderId: folderId
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function createResumableSession(data) {
  return initResumableUpload(data);
}

function uploadResumableChunk(data) {
  try {
    var uploadUrl = data.uploadUrl;
    var chunkB64 = data.chunkB64;
    var startByte = parseInt(data.startByte);
    var endByte = parseInt(data.endByte);
    var totalSize = parseInt(data.totalSize);

    if (!uploadUrl) throw new Error('缺少 uploadUrl');

    if (chunkB64.indexOf(',') !== -1) {
      chunkB64 = chunkB64.split(',')[1];
    }

    var rawBytes = Utilities.base64Decode(chunkB64);
    var token = ScriptApp.getOAuthToken();

    var options = {
      method: 'put',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Range': 'bytes ' + startByte + '-' + endByte + '/' + totalSize
      },
      payload: rawBytes,
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(uploadUrl, options);
    var code = res.getResponseCode();

    if (code === 200 || code === 201) {
      var fileId = '';
      try {
        var resJson = JSON.parse(res.getContentText());
        fileId = resJson.id;
      } catch (e) {}

      var fileUrl = fileId ? 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing' : '';
      if (fileId) {
        try {
          var file = DriveApp.getFileById(fileId);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fileUrl = file.getUrl();
        } catch (eDrive) {}
      }

      return {
        status: 'success',
        isComplete: true,
        fileId: fileId,
        fileUrl: fileUrl
      };
    } else if (code === 308) {
      return { status: 'success', isComplete: false, code: 308 };
    } else {
      throw new Error('Drive Chunk 上傳失敗 (HTTP ' + code + ': ' + res.getContentText() + ')');
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function makeFilePublic(data) {
  try {
    var fileId = data.fileId;
    var file = DriveApp.getFileById(fileId);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return {
      status: 'success',
      fileUrl: file.getUrl(),
      fileName: file.getName()
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function saveCloudDataApi(data) {
  try {
    var folderName = '雙和醫院公文附件庫';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var files = folder.getFilesByName('雙和醫院公文系統最新資料庫.json');
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
      file = folder.createFile('雙和醫院公文系統最新資料庫.json', jsonStr, 'application/json');
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    return {
      status: 'success',
      message: '全院最新公文與函詢資料已成功同步至 Google Drive 雲端！',
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function getCloudDataApi() {
  try {
    var folderName = '雙和醫院公文附件庫';
    var folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) return { status: 'empty', docs: [], issues: [] };
    var folder = folders.next();
    var files = folder.getFilesByName('雙和醫院公文系統最新資料庫.json');
    if (!files.hasNext()) return { status: 'empty', docs: [], issues: [] };
    var file = files.next();
    var content = file.getBlob().getDataAsString('UTF-8');
    var data = JSON.parse(content);
    return {
      status: 'success',
      docs: data.docs || [],
      issues: data.issues || [],
      updated_at: data.updated_at
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
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
