"""Behavioral signal processor Celery worker."""
from app.workers.celery_app import celery_app

@celery_app.task(name='behavioral.process_signal')
def process_behavioral_signal(participant_id: str, meeting_id: str, signal: dict):
    """Process behavioral signal and compute behavioral sub-score."""
    tab_visible = signal.get("tab_visible", True)
    idle_seconds = signal.get("idle_seconds", 0)
    mouse_events = signal.get("mouse_events", 0)
    keyboard_events = signal.get("keyboard_events", 0)
    
    # Behavioral score formula
    tab_score = 1.0 if tab_visible else 0.0
    idle_inverse = max(0.0, 1.0 - (idle_seconds / 60.0))
    total_events = mouse_events + keyboard_events
    interaction_ratio = min(1.0, total_events / 20.0)
    
    behavioral_score = (tab_score * 0.50) + (idle_inverse * 0.30) + (interaction_ratio * 0.20)
    
    return {
        "participant_id": participant_id,
        "meeting_id": meeting_id,
        "behavioral_score": behavioral_score,
    }
