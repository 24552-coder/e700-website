import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Original file length: {len(content)} bytes")

# Find odd quotes per line or multiline strings
lines = content.split('\n')
odd_quote_lines = []
for i, line in enumerate(lines):
    # count unescaped quotes
    q_count = len(re.findall(r'(?<!\\)"', line))
    if q_count % 2 != 0:
        odd_quote_lines.append(i + 1)

print(f"Found {len(odd_quote_lines)} lines with unescaped quote breaks: {odd_quote_lines[:20]}")

# Let's inspect the lines around odd quote lines
for line_no in odd_quote_lines[:10]:
    print(f"--- Line {line_no} ---")
    start = max(0, line_no - 2)
    end = min(len(lines), line_no + 3)
    for k in range(start, end):
        print(f"{k+1}: {repr(lines[k])}")
