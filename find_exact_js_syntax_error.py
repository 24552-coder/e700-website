import sys

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

lines = text.splitlines(True)

state = 'NORMAL' # NORMAL, STRING_SINGLE, STRING_DOUBLE, TEMPLATE, COMMENT_LINE, COMMENT_BLOCK
escape = False

for line_num, line in enumerate(lines, 1):
    col = 0
    while col < len(line):
        ch = line[col]
        
        if state == 'NORMAL':
            if ch == '/' and col + 1 < len(line) and line[col+1] == '/':
                state = 'COMMENT_LINE'
                col += 1
            elif ch == '/' and col + 1 < len(line) and line[col+1] == '*':
                state = 'COMMENT_BLOCK'
                col += 1
            elif ch == "'":
                state = 'STRING_SINGLE'
            elif ch == '"':
                state = 'STRING_DOUBLE'
            elif ch == '`':
                state = 'TEMPLATE'
            elif ord(ch) > 127:
                # Chinese characters are allowed in identifiers/strings/comments
                pass
            elif not ch.isalnum() and ch not in " \t\r\n_{}[];(),.:+-*/%=><!&|^~?#@$":
                print(f"Illegal ASCII char '{ch}' (ord {ord(ch)}) at line {line_num}, col {col+1}")
                
        elif state == 'COMMENT_LINE':
            if ch == '\n':
                state = 'NORMAL'
                
        elif state == 'COMMENT_BLOCK':
            if ch == '*' and col + 1 < len(line) and line[col+1] == '/':
                state = 'NORMAL'
                col += 1
                
        elif state == 'STRING_SINGLE':
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == "'":
                state = 'NORMAL'
            elif ch == '\n':
                print(f"Unterminated single-quote string at line {line_num}, col {col+1}")
                state = 'NORMAL'
                
        elif state == 'STRING_DOUBLE':
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '"':
                state = 'NORMAL'
            elif ch == '\n':
                print(f"Unterminated double-quote string at line {line_num}, col {col+1}: {repr(line)}")
                state = 'NORMAL'
                
        elif state == 'TEMPLATE':
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '`':
                state = 'NORMAL'

        col += 1

print(f"Parsing finished. End state: {state}")
