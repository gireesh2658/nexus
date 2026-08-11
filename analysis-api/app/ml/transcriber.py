import asyncio
import numpy as np
from faster_whisper import WhisperModel

class WhisperExecutor:
    def __init__(self, model_size="tiny.en", device="cpu", compute_type="int8"):
        # Initialize WhisperModel efficiently. 
        # By using tiny.en and int8, it will run extremely fast on the CPU.
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        
    def _transcribe_sync(self, audio_bytes: bytes) -> str:
        # Convert PCM 16-bit bytes back to float32 numpy array for whisper
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        
        segments, info = self.model.transcribe(audio_np, beam_size=1)
        
        # Generator evaluation is blocking, so we consume it inside this synchronous thread worker
        text = "".join([segment.text for segment in segments]).strip()
        return text

    async def transcribe_audio(self, audio_bytes: bytes) -> str:
        """
        Offloads the heavy CPU inference to the asyncio ThreadPoolExecutor.
        This guarantees we DO NOT block the LiveKit WebRTC event loop!
        """
        loop = asyncio.get_running_loop()
        # run_in_executor(None, ...) uses the default ThreadPoolExecutor
        transcription = await loop.run_in_executor(None, self._transcribe_sync, audio_bytes)
        return transcription
