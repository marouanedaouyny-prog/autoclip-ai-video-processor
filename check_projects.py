import urllib.request
import json

try:
    response = urllib.request.urlopen("http://localhost:8000/api/v1/projects/")
    data = json.loads(response.read().decode())
    print(f"{'ID':<40} | {'Status':<15} | {'Name'}")
    print("-" * 80)
    for p in data.get("items", []):
        print(f"{p.get('id'):<40} | {p.get('status'):<15} | {p.get('name')[:40]}")
except Exception as e:
    print(f"Error: {e}")
