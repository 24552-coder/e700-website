const payload = {
  mimeType: "multipart/mixed",
  parts: [
    {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from("附件成功").toString('base64') }
        }
      ]
    },
    {
      mimeType: "text/csv",
      filename: "1.csv"
    }
  ]
};

function safeDecode(encodedText) {
  if (!encodedText) return "";
  try {
    return Buffer.from(encodedText, 'base64').toString('utf8');
  } catch(e) {
    return "";
  }
}

function extractMessageBody(payload) {
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
          body += htmlText.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, "");
        } else if (p.parts) {
          body += extractMessageBody(p);
        }
      }
    }
  } else if (payload.body && payload.body.data) {
    var rawText = safeDecode(payload.body.data);
    if (payload.mimeType === 'text/html') {
      rawText = rawText.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, "");
    }
    body += rawText;
  }
  
  if (body === "") {
      body = "【系統無法解析此信件的特殊格式，請回信箱查看】";
  }
  return body;
}

console.log(extractMessageBody(payload));
