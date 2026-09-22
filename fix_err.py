import re

with open('google_apps_script_webapp_v6.gs', 'r', encoding='utf-8') as f:
    text = f.read()

target = """  } catch (err) {
    return {
      status: "error",
      message: err.toString()
    };
  }
}

function processAttachmentsAndHtml"""

replacement = """  } catch (err) {
    console.error("【系統發生錯誤】" + err.toString());
    return {
      status: "error",
      message: err.toString()
    };
  }
}

function processAttachmentsAndHtml"""

text = text.replace(target, replacement)

with open('最終正確程式碼_完美版.txt', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
