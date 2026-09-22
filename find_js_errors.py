import re

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Check template literal backticks matching
backtick_count = 0
for idx, line in enumerate(lines):
    # count unescaped backticks
    b_in_line = len(re.findall(r'(?<!\\)`', line))
    backtick_count += b_in_line
    if backtick_count % 2 != 0:
        pass # inside multi-line template string

if backtick_count % 2 != 0:
    print(f"WARNING: Unmatched template string backtick! Total count: {backtick_count}")
else:
    print(f"Template backticks matched! ({backtick_count} backticks)")

# Check brace matching
brace_stack = []
for idx, line in enumerate(lines):
    # remove strings and comments roughly
    clean_line = re.sub(r'//.*', '', line)
    clean_line = re.sub(r'".*?"', '""', clean_line)
    clean_line = re.sub(r"'.*?'", "''", clean_line)
    for char in clean_line:
        if char == '{':
            brace_stack.append(idx + 1)
        elif char == '}':
            if brace_stack:
                brace_stack.pop()
            else:
                print(f"Unmatched closing brace '}}' at line {idx + 1}")

if brace_stack:
    print(f"Unmatched opening braces '{{' at lines: {brace_stack[:10]} (total {len(brace_stack)})")
else:
    print("Braces matched!")
