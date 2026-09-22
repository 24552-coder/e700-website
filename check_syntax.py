import sys

try:
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()
    compile(code, 'app.js', 'exec')
    print('SUCCESS: app.js compiled cleanly without SyntaxError!')
except SyntaxError as e:
    print(f'SYNTAX ERROR found: {e.msg} at line {e.lineno}, col {e.offset}')
    lines = code.splitlines()
    start = max(0, e.lineno - 10)
    end = min(len(lines), e.lineno + 10)
    for i in range(start, end):
        print(f'{i+1}: {lines[i]}')
