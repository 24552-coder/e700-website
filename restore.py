import sys

# Read original text from powershell output
with open('temp_email_template.txt', 'r', encoding='utf-16') as f:
    lines = f.readlines()

# The powershell output has prefixes like "> app.js:32803:" or "  app.js:32803:"
cleaned_lines = []
for line in lines:
    if line.strip() == '':
        cleaned_lines.append('\n')
        continue
    # Remove the grep output prefix if it exists
    if ':' in line and 'app.js' in line:
        # e.g., "> app.js:32803:function getEmailTemplateHtml(type, issue) {"
        parts = line.split(':', 2)
        if len(parts) >= 3:
            cleaned_lines.append(parts[2])
        else:
            cleaned_lines.append(line)
    else:
        cleaned_lines.append(line)

original_func = "".join(cleaned_lines)

with open('app.js', 'r', encoding='utf-8') as f:
    app_lines = f.readlines()

start_idx = -1
end_idx = -1
for i, line in enumerate(app_lines):
    if line.startswith('function getEmailTemplateHtml(type, issue)'):
        start_idx = i
    if start_idx != -1 and line.startswith('async function autoSendEmail'):
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    with open('app.js', 'w', encoding='utf-8') as f:
        f.writelines(app_lines[:start_idx])
        f.write(original_func + '\n\n')
        f.writelines(app_lines[end_idx:])
    print('RESTORE SUCCESS')
else:
    print('RESTORE FAILED TO FIND BOUNDARIES')
