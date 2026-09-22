import sys

with open('google_apps_script_webapp_updated.gs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = -1
end = -1
for i, line in enumerate(lines):
    if line.startswith("function extractMessageBody"):
        start = i
    if start != -1 and line.startswith("}") and i > start + 20:
        end = i
        break

if start != -1 and end != -1:
    new_func = """function extractMessageBody(payload) {
  var body = "";
  
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
    body = safeDecode(payload.body.data);
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
       body = safeDecode(targetPart.body.data);
       if (!plainPart && htmlPart) {
          body = body.replace(/<br\\s*[\\/]?>/gi, "\\n").replace(/<[^>]+>/g, "");
       }
    }
  }
  
  return body;
}
"""
    lines[start:end+1] = [new_func]
    with open('google_apps_script_webapp_updated.gs', 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Patched successfully")
else:
    print("Not found")
