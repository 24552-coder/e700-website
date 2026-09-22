import re

with open('google_apps_script_webapp_v6.gs', 'r', encoding='utf-8') as f:
    text = f.read()

old_safeDecode = '''// 輔助函數：強效安全解碼 (支援 Base64, UTF-8, Big5)
function safeDecode(encodedText) {
  if (!encodedText) return "";
  
  // 有時候傳過來的就是明文（非 base64），我們先判斷一下
  // 如果裡面包含中文字或明顯的空白，直接當作明文回傳
  if (/[\\u4e00-\\u9fa5]/.test(encodedText) || encodedText.indexOf(" ") !== -1) {
      return encodedText;
  }

  try {
    // 濾除所有非 base64 相關字元 (包含換行、空白)
    var b64 = encodedText.replace(/[^A-Za-z0-9\\+\\/\\-_=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    var rawBytes = Utilities.base64Decode(b64);
    var utf8Str = Utilities.newBlob(rawBytes).getDataAsString("UTF-8");
    return utf8Str;
  } catch(e) {
    console.error("解碼錯誤: " + e.toString());
    // 萬一真的解碼失敗，死馬當活馬醫，直接回傳原字串，避免吃掉文字
    return encodedText;
  }
}'''

new_safeDecode = '''// 輔助函數：強效安全解碼 (支援 Base64, UTF-8, Big5)
function safeDecode(encodedText) {
  if (!encodedText) return "";
  
  // 【超大發現】：Google Apps Script 的 Advanced Service 有時候會雞婆
  // 直接把 base64 解碼完，變成一個「數字陣列 (Byte Array)」傳過來！
  // 這就是為什麼呼叫 .replace 或 .trim 會死掉的原因，因為它根本不是字串！
  if (Array.isArray(encodedText)) {
    try {
      return Utilities.newBlob(encodedText).getDataAsString("UTF-8");
    } catch (e) {
      return "";
    }
  }

  // 確保它絕對是個字串
  var str = String(encodedText);

  // 如果它已經是被解碼好的明文
  if (/[\\u4e00-\\u9fa5]/.test(str) || str.indexOf(" ") !== -1) {
      return str;
  }

  try {
    var b64 = str.replace(/[^A-Za-z0-9\\+\\/\\-_=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    var rawBytes = Utilities.base64Decode(b64);
    var utf8Str = Utilities.newBlob(rawBytes).getDataAsString("UTF-8");
    return utf8Str;
  } catch(e) {
    console.error("解碼錯誤: " + e.toString());
    return str; // 回傳轉好的字串
  }
}'''

text = text.replace(old_safeDecode, new_safeDecode)

with open('google_apps_script_webapp_v6.gs', 'w', encoding='utf-8') as f:
    f.write(text)

with open('最終正確程式碼_Threads_API_修正解碼.txt', 'r', encoding='utf-8') as f:
    text_txt = f.read()

text_txt = text_txt.replace(old_safeDecode, new_safeDecode)

with open('最終正確程式碼_Threads_API_修正解碼.txt', 'w', encoding='utf-8') as f:
    f.write(text_txt)

print("Done")
