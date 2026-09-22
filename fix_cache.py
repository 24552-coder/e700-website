import sys

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('styles.css?v=20260919_v100', 'styles.css?v=20260919_v101')
content = content.replace('app.js?v=20260919_v100', 'app.js?v=20260919_v101')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
