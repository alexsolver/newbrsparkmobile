import os
import re

def fix_imports(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    changed = False

    # Fix: `, KeyboardAvoidingView, Platform} from 'react-native';` at start of line
    # usually following a `,\n`
    if re.search(r',\s*\n\s*, KeyboardAvoidingView, Platform', content):
        content = re.sub(r',\s*\n\s*, KeyboardAvoidingView, Platform', ',\n  KeyboardAvoidingView, Platform', content)
        changed = True
        
    # Or without a comma before it
    if re.search(r'\n\s*, KeyboardAvoidingView, Platform', content):
        content = re.sub(r'\n\s*, KeyboardAvoidingView, Platform', ',\n  KeyboardAvoidingView, Platform', content)
        changed = True

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
        if file.endswith('.tsx') or file.endswith('.ts'):
            path = os.path.join(root, file)
            if fix_imports(path):
                processed += 1
                print(f"Fixed {path}")

print(f"Total files fixed: {processed}")
