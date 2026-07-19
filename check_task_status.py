import urllib.request
import json
import sys

project_id = "c5ee8d84-47e5-45a8-a99c-65a57dc618f9"
try:
    response = urllib.request.urlopen(f"http://localhost:8000/api/v1/projects/{project_id}/status")
    data = json.loads(response.read().decode())
    print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Error: {e}")
