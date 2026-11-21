/**
 * Nexus Focus Detection State Machine with Temporal Stability and Hysteresis.
 * 
 * Prevents false "Focus Lost" warnings during brief natural glances (e.g. ~1s).
 * Enforces a sustained grace period before confirming focus loss and automatically
 * recovers when the user returns their gaze to the screen.
 */

export type FocusState = 
  | 'NORMAL' 
  | 'CANDIDATE_AWAY' 
  | 'CONFIRMED_AWAY' 
  | 'CANDIDATE_RECOVERY' 
  | 'UNAVAILABLE';

export interface FocusConfig {
  awayGracePeriodMs: number;       // Time away required to confirm focus loss (default: 2500ms)
  recoveryWindowMs: number;        // Stable time on-screen required to recover (default: 800ms)
  unavailableTimeoutMs: number;    // Time without face before marking unavailable (default: 6000ms)
  awayThresholdScore: number;      // Score below which gaze is considered away (default: 50)
  recoveryThresholdScore: number;  // Score above which gaze is considered recovered (default: 65)
  emaAlpha: number;                // Exponential moving average weight (default: 0.25)
}

export const DEFAULT_FOCUS_CONFIG: FocusConfig = {
  awayGracePeriodMs: 2500,
  recoveryWindowMs: 800,
  unavailableTimeoutMs: 6000,
  awayThresholdScore: 50,
  recoveryThresholdScore: 65,
  emaAlpha: 0.25,
};

export interface FocusMachineResult {
  state: FocusState;
  isLookingAway: boolean;
  isUnavailable: boolean;
  focusScore: number;
  eventEmitted: 'focus_lost' | 'focus_regained' | null;
}

export class FocusStateMachine {
  private config: FocusConfig;
  private state: FocusState = 'NORMAL';
  private smoothedScore: number = 100;
  private candidateAwayStartMs: number | null = null;
  private candidateRecoveryStartMs: number | null = null;
  private lastFaceDetectTimeMs: number = 0;
  private lastProcessedTimeMs: number = 0;
  private lastEmittedEvent: 'focus_lost' | 'focus_regained' | null = null;

  constructor(config: Partial<FocusConfig> = {}, initialTimeMs: number = performance.now()) {
    this.config = { ...DEFAULT_FOCUS_CONFIG, ...config };
    this.lastFaceDetectTimeMs = initialTimeMs;
    this.lastProcessedTimeMs = initialTimeMs;
  }

  /**
   * Process a frame observation at timestamp `nowMs`.
   * @param rawScore Calculated frame focus score [0, 100], or null if no face detected.
   * @param nowMs Monotonic timestamp (e.g. from performance.now()).
   */
  public processFrame(rawScore: number | null, nowMs: number): FocusMachineResult {
    // Monotonic clock guard: stale or out-of-order frames must not cause invalid regression
    if (this.lastProcessedTimeMs > 0 && nowMs < this.lastProcessedTimeMs) {
      return {
        state: this.state,
        isLookingAway: (this.state === 'CONFIRMED_AWAY' || this.state === 'CANDIDATE_RECOVERY'),
        isUnavailable: this.state === 'UNAVAILABLE',
        focusScore: Math.round(this.smoothedScore),
        eventEmitted: null,
      };
    }
    this.lastProcessedTimeMs = nowMs;

    let eventEmitted: 'focus_lost' | 'focus_regained' | null = null;

    // 1. Handle Face Absence / Unavailable Signal
    let numericScore: number;
    if (rawScore === null) {
      const absenceDuration = Math.max(0, nowMs - this.lastFaceDetectTimeMs);
      
      if (absenceDuration >= this.config.unavailableTimeoutMs) {
        // Extended absence: Mark UNAVAILABLE, not voluntary gaze-away
        this.state = 'UNAVAILABLE';
        this.smoothedScore = Math.max(0, this.smoothedScore - 2);
        this.candidateAwayStartMs = null;
        this.candidateRecoveryStartMs = null;
        return {
          state: this.state,
          isLookingAway: false,
          isUnavailable: true,
          focusScore: Math.round(this.smoothedScore),
          eventEmitted: null,
        };
      }

      // Detector dropout, momentary frame drop, or missing face: maintain score (never mislabel as voluntary gaze-away)
      numericScore = this.smoothedScore;
    } else {
      this.lastFaceDetectTimeMs = nowMs;
      numericScore = rawScore;
    }

    // 2. Exponential Moving Average Smoothing
    this.smoothedScore = (numericScore * this.config.emaAlpha) + (this.smoothedScore * (1 - this.config.emaAlpha));
    const currentScore = Math.round(this.smoothedScore);

    // 3. Temporal State Machine Transitions
    const isAwaySignal = currentScore < this.config.awayThresholdScore;
    const isRecoverySignal = numericScore >= this.config.recoveryThresholdScore;

    switch (this.state) {
      case 'NORMAL':
        if (isAwaySignal) {
          // Enter candidate away state; do NOT emit alert yet
          this.state = 'CANDIDATE_AWAY';
          this.candidateAwayStartMs = nowMs;
        }
        break;

      case 'CANDIDATE_AWAY':
        if (isAwaySignal) {
          // Evidence remains away; check if grace period elapsed
          if (this.candidateAwayStartMs !== null && (nowMs - this.candidateAwayStartMs) >= this.config.awayGracePeriodMs) {
            this.state = 'CONFIRMED_AWAY';
            this.candidateAwayStartMs = null;
            if (this.lastEmittedEvent !== 'focus_lost') {
              eventEmitted = 'focus_lost';
              this.lastEmittedEvent = 'focus_lost';
            }
          }
        } else if (isRecoverySignal) {
          // Glanced away briefly (< grace period) and looked back! Cancel candidate!
          this.state = 'NORMAL';
          this.candidateAwayStartMs = null;
        }
        break;

      case 'CONFIRMED_AWAY':
        if (isRecoverySignal) {
          // Participant looks back; enter candidate recovery state
          this.state = 'CANDIDATE_RECOVERY';
          this.candidateRecoveryStartMs = nowMs;
        }
        break;

      case 'CANDIDATE_RECOVERY':
        if (isRecoverySignal) {
          // Evidence remains on-screen; check if recovery window elapsed
          if (this.candidateRecoveryStartMs !== null && (nowMs - this.candidateRecoveryStartMs) >= this.config.recoveryWindowMs) {
            this.state = 'NORMAL';
            this.candidateRecoveryStartMs = null;
            if (this.lastEmittedEvent !== 'focus_regained') {
              eventEmitted = 'focus_regained';
              this.lastEmittedEvent = 'focus_regained';
            }
          }
        } else if (isAwaySignal) {
          // Looked away again before completing recovery window
          this.state = 'CONFIRMED_AWAY';
          this.candidateRecoveryStartMs = null;
        }
        break;

      case 'UNAVAILABLE':
        if (isRecoverySignal) {
          this.state = 'NORMAL';
          this.smoothedScore = Math.max(70, currentScore);
          this.candidateAwayStartMs = null;
          this.candidateRecoveryStartMs = null;
          eventEmitted = 'focus_regained';
          this.lastEmittedEvent = 'focus_regained';
        }
        break;
    }

    const isLookingAway = (this.state === 'CONFIRMED_AWAY' || this.state === 'CANDIDATE_RECOVERY');

    return {
      state: this.state,
      isLookingAway,
      isUnavailable: this.state === 'UNAVAILABLE',
      focusScore: currentScore,
      eventEmitted,
    };
  }

  public getState(): FocusState {
    return this.state;
  }

  public reset(nowMs: number = performance.now()): void {
    this.state = 'NORMAL';
    this.smoothedScore = 100;
    this.candidateAwayStartMs = null;
    this.candidateRecoveryStartMs = null;
    this.lastFaceDetectTimeMs = nowMs;
    this.lastProcessedTimeMs = nowMs;
    this.lastEmittedEvent = null;
  }
}
