import sys
content = open('app.js', encoding='utf-8').read()
content = content.replace('.then(async data => {', '.then(async data => {\\n        console.log("GAS Reply Data:", data);')
open('app.js', 'w', encoding='utf-8').write(content)
print('Patched app.js')
