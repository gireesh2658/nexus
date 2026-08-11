import urllib.request
import json

data = json.dumps({"room": "test_room", "identity": "user1", "name": "Alice"}).encode('utf-8')
req = urllib.request.Request("http://localhost:8000/api/rooms/token", data=data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as f:
        print(f.read().decode('utf-8'))
except Exception as e:
    print(e)
