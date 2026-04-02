import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    changed = False

    # Find <TextInput ...> and add returnKeyType="done" if not present
    def repl_textinput(match):
        tags = match.group(1)
        if 'returnKeyType' not in tags and 'multiline' not in tags:
            return f'<TextInput{tags} returnKeyType="done"'
        return match.group(0)

    new_content, n = re.subn(r'<TextInput([\s\S]*?(?=>|/>))', repl_textinput, content)
    if n > 0 and new_content != content:
        content = new_content
        changed = True

    # Find <ScrollView ...> and add keyboardShouldPersistTaps="handled" if not present
    def repl_scrollview(match):
        tags = match.group(1)
        if 'keyboardShouldPersistTaps' not in tags:
            return f'<ScrollView{tags} keyboardShouldPersistTaps="handled"'
        return match.group(0)

    new_content, n = re.subn(r'<ScrollView([\s\S]*?(?=>|/>))', repl_scrollview, content)
    if n > 0 and new_content != content:
        content = new_content
        changed = True

    # Wrap bare forms? Too risky for script. Just the properties above are safe.

    if changed:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

processed = 0
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.expo' in root or '.git' in root or 'ios' in root or 'android' in root:
        continue
    for file in files:
        if file.endswith('.tsx'):
            path = os.path.join(root, file)
            if process_file(path):
                processed += 1
                print(f"Fixed {path}")

print(f"Total files updated: {processed}")
