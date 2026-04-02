path = 'app/checklist/[id].tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# We need to change the flow.
# Currently the flow is:
# 1. Fetch template
# 2. Extract executed tasks list
# 3. IF isCompleted:
#      fetch execution locally or remotely

print(content[content.find("const loadTemplate = async () =>"):content.find("const verifyGlobalGeofence = async (radius: number)")])
