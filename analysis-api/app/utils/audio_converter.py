import base64
import io
import numpy as np
import logging

logger = logging.getLogger(__name__)

def convert_audio_to_numpy(audio_base64: str, sample_rate: int = 16000) -> np.ndarray:
    """
    Convert base64 audio (from MediaRecorder WebM/Opus) to numpy float32 array.
    Uses pydub + ffmpeg for real audio decoding.
    """
    try:
        if "," in audio_base64:
            audio_base64 = audio_base64.split(",")[1]
            
        audio_bytes = base64.b64decode(audio_base64)
        
        from pydub import AudioSegment
        
        # Decode WebM/Opus bytes via ffmpeg (installed in Docker container)
        audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format="webm")
        
        # Resample to 16kHz mono (Whisper's expected format)
        audio = audio.set_frame_rate(sample_rate).set_channels(1).set_sample_width(2)
        
        # Convert to numpy float32 array normalized to [-1.0, 1.0]
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
        samples = samples / 32768.0
        
        return samples
        
    except Exception as e:
        logger.error("Audio conversion failed: %s", e)
        # Return silence so Whisper doesn't crash (it will return empty string)
        return np.zeros(sample_rate * 10, dtype=np.float32)
