from transformers import pipeline
import logging

logger = logging.getLogger(__name__)

# Load a toxicity classification model
toxicity_pipeline = pipeline("text-classification", model="unitary/toxic-bert")

def classify_toxicity(text: str) -> dict:
    """Classify text for toxicity.
    CRITICAL: detectedText is ephemeral — NEVER stored in MongoDB.
    Returns score and action based on 3-strike state machine.
    """
    if not text or len(text.strip()) < 2:
        return {"is_toxic": False, "score": 0.0, "action": None}
    
    try:
        result = toxicity_pipeline(text)[0]
        score = result["score"] if result["label"] == "toxic" else 0.0
        
        # Consider it toxic if confidence is high
        is_toxic = score > 0.85
        
        return {
            "is_toxic": is_toxic,
            "score": score,
            "action": None  # Action is determined by the worker state machine
        }
    except Exception as e:
        logger.error("Toxicity classification failed: %s", e)
        return {"is_toxic": False, "score": 0.0, "action": None}
