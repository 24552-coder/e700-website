import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Check for non-standard whitespace/control characters
bad_chars = {
    '\u00a0': 'NBSP (\\u00a0)',
    '\u200b': 'Zero-Width Space (\\u200b)',
    '\ufeff': 'BOM (\\ufeff)',
    '\u200c': 'Zero-Width Non-Joiner',
    '\u200d': 'Zero-Width Joiner',
    '\u2028': 'Line Separator (\\u2028)',
    '\u2029': 'Paragraph Separator (\\u2029)'
}

found_count = 0
for char, name in bad_chars.items():
    cnt = content.count(char)
    if cnt > 0:
        print(f"Found {cnt} occurrences of {name}")
        found_count += cnt

# Replace \u00a0 with normal space ' '
cleaned = content.replace('\u00a0', ' ')
cleaned = cleaned.replace('\u200b', '')
cleaned = cleaned.replace('\ufeff', '')
cleaned = cleaned.replace('\u2028', '\n')
cleaned = cleaned.replace('\u2029', '\n')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(cleaned)

print(f"Cleaned app.js successfully! Removed {found_count} bad characters.")
