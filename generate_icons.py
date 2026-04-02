import json
import urllib.request
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

libs = [
    'AntDesign',
    'Entypo',
    'Feather',
    'FontAwesome',
    'FontAwesome5Free',
    'Foundation',
    'Ionicons',
    'MaterialIcons',
    'MaterialCommunityIcons',
    'Octicons'
]

output = {}

for name in libs:
    url = f"https://unpkg.com/react-native-vector-icons@10.0.3/glyphmaps/{name}.json"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            keys = sorted(list(data.keys()))
            # Map FontAwesome5Free to FontAwesome5 to match what we render via RN Vector Icons
            out_name = "FontAwesome5" if name == "FontAwesome5Free" else name
            output[out_name] = keys
            print(f"Loaded {len(keys)} icons for {out_name}")
    except Exception as e:
        print(f"Error {name}: {e}")

with open('admin-panel/js/icons-db.js', 'w') as f:
    f.write('window.ICON_LIBRARIES = ' + json.dumps(output) + ';\n')
print("Done writing icons-db.js")
