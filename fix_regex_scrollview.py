import os

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if '= keyboardShouldPersistTaps="handled">' in content:
        new_content = content.replace('= keyboardShouldPersistTaps="handled">', '=>')
        with open(filepath, 'w') as f:
            f.write(new_content)
        return True
    return False

processed = 0
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.expo' in root or '.git' in root or 'ios' in root or 'android' in root:
        continue
    for file in files:
        if file.endswith('.tsx'):
            path = os.path.join(root, file)
            if fix_file(path):
                processed += 1
                print(f"Fixed {path}")

print(f"Total files fixed: {processed}")
