import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from aiokafka import AIOKafkaProducer

router = APIRouter()

@router.websocket("/ws")
async def telemetry_ingress(websocket: WebSocket):
    """
    WebSocket Ingress for Edge Telemetry.
    Receives JSON telemetry (e.g. 1-2Hz) from the client's local MediaPipe/WASM execution.
    Publishes the payloads directly to Redpanda (telemetry.raw topic) as a shock absorber.
    """
    await websocket.accept()
    
    # Extract producer from app state
    producer: AIOKafkaProducer = websocket.app.state.kafka_producer
    
    if not producer:
        await websocket.close(code=1011, reason="Kafka producer not initialized")
        return

    client_id = websocket.client.host
    try:
        while True:
            # Receive downsampled lightweight JSON payload from edge
            data = await websocket.receive_json()
            
            # Enrich with server timestamp
            enriched_payload = {
                "server_timestamp_ms": int(time.time() * 1000),
                "client_id": client_id,
                **data
            }
            
            # Publish to Redpanda acting as our shock absorber
            # We don't await the delivery report here to maximize throughput
            # aiokafka handles the buffering and background dispatching
            await producer.send_and_wait("telemetry.raw", enriched_payload)
            
    except WebSocketDisconnect:
        print(f"Client {client_id} disconnected from telemetry ingress")
    except Exception as e:
        print(f"Error in telemetry ingress for {client_id}: {e}")
        try:
            await websocket.close(code=1011)
        except:
            pass
