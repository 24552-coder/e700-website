import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update exportWeeklyExcel (around line 33676)
pattern1 = r'''(const\s+issues\s*=\s*gIssues\.filter\(.*?doc_receive_no\);)'''
def repl1(m):
    return m.group(1) + '\n        const patients = Array.from(new Set(issues.map(i => i.patient_name).filter(Boolean))).join(", ");'

text = re.sub(pattern1, repl1, text)

# Now insert "病患姓名": patients, into the returned objects
pattern2 = r'("收發文號":\s*doc\.doc_receive_no,\s*)'
text = re.sub(pattern2, r'\1"病患姓名": patients,\n            ', text)

# Update column widths
# original:
#    worksheet["!cols"] = [
#        { wch: 8 },
#        { wch: 12 },
#        { wch: 16 },
#        { wch: 45 },
#        { wch: 16 },
#        { wch: 25 }
#    ];
# we need to insert { wch: 16 } after the third one.

pattern3 = r'''(worksheet\["!cols"\]\s*=\s*\[\s*\{\s*wch:\s*8\s*\},.*?\{\s*wch:\s*12\s*\},.*?\{\s*wch:\s*16\s*\},\s*)(\{\s*wch:\s*45\s*\})'''
text = re.sub(pattern3, r'\1{ wch: 16 },\n        \2', text, flags=re.DOTALL)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
