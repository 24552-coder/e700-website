import sys

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('colspan="10"', 'colspan="11"')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
