import sys, re

f = open('app.js', 'r', encoding='utf-8')
content = f.read()

def repl_dashboard(m):
    body = m.group(0)
    # Fix the first few lines
    body = body.replace('const gMainDocs = gMainDocs.filter(d => !d.deleted);', 'const activeDocs = gMainDocs.filter(d => !d.deleted);')
    body = body.replace('const gIssues = gIssues.filter(i => !i.deleted);', 'const activeIssues = gIssues.filter(i => !i.deleted);')
    body = body.replace('const totalCases = gMainDocs.length;', 'const totalCases = activeDocs.length;')
    body = body.replace('const totalIssues = gIssues.length;', 'const totalIssues = activeIssues.length;')
    
    # Replace usages in the rest of the function
    body = body.replace('gMainDocs.forEach(', 'activeDocs.forEach(')
    body = body.replace('gIssues.filter(', 'activeIssues.filter(')
    return body

content = re.sub(r'function renderDashboard\(\) \{[\s\S]+?\n\}', repl_dashboard, content, count=1)

f = open('app.js', 'w', encoding='utf-8')
f.write(content)
