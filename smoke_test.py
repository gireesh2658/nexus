import asyncio
import websockets
import json
import time

async def smoke_test():
    uri = "ws://localhost:8000/api/telemetry/ws"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to Telemetry Ingress Gateway")
            for i in range(100):
                payload = {
                    "focus_score": 85.0 + (i % 10),
                    "yaw": 0.1,
                    "pitch": -0.2,
                    "roll": 0.05,
                    "ear": 0.28
                }
                await websocket.send(json.dumps(payload))
                print(f"Sent frame {i+1}/100")
                await asyncio.sleep(0.01) # 100Hz burst for the test
            
            print("100 mock frames sent successfully.")
            # Give the worker a moment to batch and flush
            await asyncio.sleep(6) 
            
    except Exception as e:
        print(f"Smoke test failed: {e}")

if __name__ == "__main__":
    asyncio.run(smoke_test())
