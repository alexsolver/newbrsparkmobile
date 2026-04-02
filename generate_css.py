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

css_content = ""

for name in libs:
    if name == 'FontAwesome5Free':
        css_content += """
@font-face {
  font-family: 'FA5-Solid';
  src: url('https://unpkg.com/react-native-vector-icons@10.0.3/Fonts/FontAwesome5_Solid.ttf') format('truetype');
}
@font-face {
  font-family: 'FA5-Regular';
  src: url('https://unpkg.com/react-native-vector-icons@10.0.3/Fonts/FontAwesome5_Regular.ttf') format('truetype');
}
@font-face {
  font-family: 'FA5-Brands';
  src: url('https://unpkg.com/react-native-vector-icons@10.0.3/Fonts/FontAwesome5_Brands.ttf') format('truetype');
}
.rnvi-FontAwesome5 {
  font-family: 'FA5-Solid', 'FA5-Regular', 'FA5-Brands' !important;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
"""
        out_name = "FontAwesome5"
    else:
        ttf_url = f"https://unpkg.com/react-native-vector-icons@10.0.3/Fonts/{name}.ttf"
        out_name = name
        css_content += f"""
@font-face {{
  font-family: '{out_name}';
  src: url('{ttf_url}') format('truetype');
}}
.rnvi-{out_name} {{
  font-family: '{out_name}' !important;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}}
"""

    url = f"https://unpkg.com/react-native-vector-icons@10.0.3/glyphmaps/{name}.json"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            for icon_name, hex_val in data.items():
                hex_str = hex(hex_val).replace('0x', '')
                css_content += f".rnvi-{out_name}-{icon_name}::before {{ content: '\\{hex_str}'; }}\n"
            print(f"Generated CSS for {out_name}")
    except Exception as e:
        print(f"Error {name}: {e}")

with open('admin-panel/css/vector-icons.css', 'w', encoding='utf-8') as f:
    f.write(css_content)
print("Done writing css/vector-icons.css")
