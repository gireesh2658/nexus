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
        
        self.window_buffer = bytearray()
        self.buffer = []
        self.silence_samples = 0
        self.is_speaking = False

    def process_frame(self, audio_chunk_bytes: bytes) -> bytes | None:
        """
        Process incoming PCM s16le audio chunk (any frame size, e.g. 10ms/160 samples from WebRTC).
        Accumulates into exact 512-sample (1024 bytes) windows required by Silero VAD.
        Returns buffered speech bytes if silence threshold is reached, else None.
        """
        self.window_buffer.extend(audio_chunk_bytes)
        flushed_speech = None

        # Silero VAD expects exactly 512 samples at 16kHz (1024 bytes)
        while len(self.window_buffer) >= 1024:
            window_bytes = bytes(self.window_buffer[:1024])
            del self.window_buffer[:1024]

            audio_np = np.frombuffer(window_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            audio_tensor = torch.from_numpy(audio_np)

            speech_prob = self.model(audio_tensor, self.sample_rate).item()
            chunk_is_speech = speech_prob > 0.5

            if chunk_is_speech:
                self.is_speaking = True
                self.silence_samples = 0
                self.buffer.append(window_bytes)
            else:
                if self.is_speaking:
                    self.buffer.append(window_bytes)
                    self.silence_samples += 512

                    if self.silence_samples >= self.silence_threshold_samples:
                        flushed_speech = b"".join(self.buffer)
                        self.reset()
                        break

        return flushed_speech

    def flush(self) -> bytes | None:
        """Flush any remaining speech buffer on track end."""
        if self.buffer and self.is_speaking:
            flushed = b"".join(self.buffer)
            self.reset()
            return flushed
        return None

    def reset(self):
        self.buffer = []
        self.silence_samples = 0
        self.is_speaking = False
