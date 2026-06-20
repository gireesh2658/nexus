from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone

class BehavioralSignal(BaseModel):
    participant_id: str
    meeting_id: str
    tab_visible: bool = True
    idle_seconds: float = 0.0
    mouse_events: int = 0
    keyboard_events: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FocusFrame(BaseModel):
    participant_id: str
    meeting_id: str
    frame_data: str  # base64 encoded frame
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AudioChunk(BaseModel):
    participant_id: str
    meeting_id: str
    audio_data: str  # base64 encoded audio
    duration_seconds: float = 10.0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FocusScoreResult(BaseModel):
    participant_id: str
    meeting_id: str
    visual_score: Optional[float] = None
    behavioral_score: Optional[float] = None
    audio_score: Optional[float] = None
    final_score: int = Field(ge=0, le=100)
    face_present: bool = True
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ModerationEvent(BaseModel):
    meeting_id: str
    user_id: str
    toxicity_score: float
    warning_count: int
    action_taken: str  # 'warn', 'warn_all', 'mute'
    redacted_text: str = "[ flagged content ]"

class AnalyticsQuery(BaseModel):
    meeting_id: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    interval_seconds: int = 30
