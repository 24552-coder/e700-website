import sys
import re

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Let's check lines 33850 to 33940 for syntax errors or invalid statements!
for i in range(33850, min(33950, len(lines))):
    print(f"{i+1}: {lines[i]}", end='')
