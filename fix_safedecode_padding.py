import re

with open('google_apps_script_webapp_v6.gs', 'r', encoding='utf-8') as f:
    text = f.read()

old_safeDecode = '''// 輔助函數：強效安全解碼 (支援 Base64, UTF-8, Big5)
function safeDecode(encodedText) {
  if (!encodedText) return "";
  try {
    // Gmail API 回傳的 body.data 統一為 Base64Url 編碼的 UTF-8 字串
    // 使用 Utilities.base64DecodeWebSafe 可以完美處理 padding 與 URL-safe 字元
    var rawBytes = Utilities.base64DecodeWebSafe(encodedText);
    var utf8Str = Utilities.newBlob(rawBytes).getDataAsString("UTF-8");
    return utf8Str;
  } catch(e) {
    console.error("解碼錯誤: " + e.toString());
    // 萬一 web safe 失敗，改用傳統方式再試一次
    try {
      var b64 = encodedText.replace(/-/g, '+').replace(/_/g, '/');
      var rawBytes2 = Utilities.base64Decode(b64);
      return Utilities.newBlob(rawBytes2).getDataAsString("UTF-8");
    } catch (e2) {
      return "";
    }
  }
}'''

new_safeDecode = '''// 輔助函數：強效安全解碼 (支援 Base64, UTF-8, Big5)
function safeDecode(encodedText) {
  if (!encodedText) return "";
  try {
    var b64 = encodedText.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    var rawBytes = Utilities.base64Decode(b64);
    var utf8Str = Utilities.newBlob(rawBytes).getDataAsString("UTF-8");
    return utf8Str;
  } catch(e) {
    console.error("解碼錯誤: " + e.toString());
    return "";
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
