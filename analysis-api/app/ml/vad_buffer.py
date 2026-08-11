import torch
import numpy as np

class VADBuffer:
    def __init__(self, sample_rate=16000, silence_threshold_ms=500):
        # Load Silero VAD model via torch.hub
        self.model, utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            trust_repo=True
        )
        self.get_speech_timestamps, _, self.read_audio, _, _ = utils
        
        self.sample_rate = sample_rate
        self.silence_threshold_ms = silence_threshold_ms
        self.silence_threshold_samples = int((silence_threshold_ms / 1000) * sample_rate)
        
        self.buffer = []
        self.silence_samples = 0
        self.is_speaking = False

    def process_frame(self, audio_chunk_bytes: bytes) -> bytes | None:
        """
        Process a 20ms PCM audio chunk. 
        Returns buffered speech bytes if silence threshold is reached, else None.
        """
        # Convert bytes (PCM s16le) to float32 tensor
        # Assume LiveKit audio chunks are 16-bit PCM
        audio_np = np.frombuffer(audio_chunk_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        audio_tensor = torch.from_numpy(audio_np)
        
        # We need at least 512 samples for Silero VAD (at 16kHz, this is 32ms)
        # If chunks are 20ms (320 samples), VAD will complain if passed independently.
        # But Silero VAD usually takes window sizes of 512.
        # For this stream, we can pass it, or just use it conceptually per requirements.
        # To strictly avoid padding issues, we append to a local temp buffer or use a rolling window, 
        # but to keep it lightweight, we run inference directly if possible.
        
        # Let's pad it to 512 if it's smaller, just for VAD inference.
        inference_tensor = audio_tensor
        if len(inference_tensor) < 512:
             padding = torch.zeros(512 - len(inference_tensor))
             inference_tensor = torch.cat((inference_tensor, padding))

        # Run inference
        speech_prob = self.model(inference_tensor, self.sample_rate).item()
        
        chunk_is_speech = speech_prob > 0.5
        
        if chunk_is_speech:
            self.is_speaking = True
            self.silence_samples = 0
            self.buffer.append(audio_chunk_bytes)
        else:
            if self.is_speaking:
                self.buffer.append(audio_chunk_bytes)
                self.silence_samples += len(audio_tensor)
                
                # Check if silence threshold is breached
                if self.silence_samples >= self.silence_threshold_samples:
                    # Flush buffer
                    flushed_bytes = b"".join(self.buffer)
                    self.reset()
                    return flushed_bytes
        return None
        
    def reset(self):
        self.buffer = []
        self.silence_samples = 0
        self.is_speaking = False
