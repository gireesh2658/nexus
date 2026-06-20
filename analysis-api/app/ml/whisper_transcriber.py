import whisper
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Load small model to balance speed and accuracy
model = whisper.load_model("tiny.en")

def transcribe_audio(audio_array: np.ndarray) -> str:
    """Transcribe audio using OpenAI Whisper.
    Receives numpy float32 array (-1.0 to 1.0).
    """
    try:
        # Whisper expects float32 numpy array with 16kHz sample rate
        result = model.transcribe(audio_array, fp16=False)
        return result["text"].strip()
    except Exception as e:
        logger.error("Whisper transcription failed: %s", e)
        return ""
