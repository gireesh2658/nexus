#!/usr/bin/env python3
"""
NEXUS PHYSICAL MICROPHONE DIAGNOSTIC & PROBE SCRIPT
Explicitly probes physical microphone hardware, measures acoustic metrics,
runs Silero VAD, and executes Faster-Whisper transcription.
"""

import sys
import os
import time
import math
import argparse
import numpy as np
import sounddevice as sd

# Add analysis-api to path for VADBuffer and WhisperExecutor
sys.path.insert(0, os.path.abspath("analysis-api"))
from app.ml.vad_buffer import VADBuffer
from app.ml.transcriber import WhisperExecutor

def find_physical_microphone():
    """Find the best physical Realtek microphone array index."""
    devices = sd.query_devices()
    
    # Prioritize WASAPI Realtek Microphone Array
    for idx, d in enumerate(devices):
        if d['max_input_channels'] > 0 and 'Microphone Array' in d['name'] and d['hostapi'] == 2:
            return idx, d, "WASAPI"
            
    # Fallback to MME Realtek Microphone Array
    for idx, d in enumerate(devices):
        if d['max_input_channels'] > 0 and 'Microphone Array' in d['name'] and d['hostapi'] == 0:
            return idx, d, "MME"

    # Fallback to default input
    default_in = sd.default.device[0]
    if default_in is not None and default_in >= 0:
        return default_in, devices[default_in], "DEFAULT"
        
    return None, None, "NONE"

def calculate_metrics(pcm_data):
    """Calculate acoustic signal metrics."""
    if pcm_data.dtype == np.int16:
        float_data = pcm_data.astype(np.float32) / 32768.0
        int_data = pcm_data
    else:
        float_data = pcm_data.astype(np.float32)
        int_data = (np.clip(float_data, -1.0, 1.0) * 32767).astype(np.int16)
        
    peak_val = float(np.max(np.abs(float_data)))
    peak_int16 = int(np.max(np.abs(int_data)))
    rms_val = float(np.sqrt(np.mean(float_data ** 2)))
    rms_int16 = int(np.sqrt(np.mean(int_data.astype(np.float32) ** 2)))
    dbfs = 20 * math.log10(rms_val) if rms_val > 1e-9 else -100.0

    # Classification
    if peak_int16 >= 32760:
        quality = "CLIPPED"
    elif peak_int16 >= 1500 and rms_int16 >= 150:
        quality = "HEALTHY_SPEECH"
    elif peak_int16 >= 500:
        quality = "AUDIBLE"
    elif peak_int16 >= 100:
        quality = "NEAR_SILENT"
    else:
        quality = "EMPTY_SILENT"

    return {
        "peak_int16": peak_int16,
        "peak_normalized": peak_val,
        "rms_int16": rms_int16,
        "rms_normalized": rms_val,
        "dbfs": dbfs,
        "quality": quality
    }

def record_and_diagnose(device_idx=None, duration=5.0, countdown=3, expected_phrase=None):
    print("=" * 65)
    print("NEXUS PHYSICAL MICROPHONE DIAGNOSTIC PROBE")
    print("=" * 65)
    
    if device_idx is None:
        idx, dev_info, api_name = find_physical_microphone()
    else:
        idx = device_idx
        dev_info = sd.query_devices(idx)
        api_name = f"HostAPI-{dev_info['hostapi']}"

    if dev_info is None:
        print("[ERROR] No physical microphone input device found!")
        return {"status": "FAIL", "reason": "NO_DEVICE"}

    print(f"Selected Device Index: {idx}")
    print(f"Device Name:           {dev_info['name']}")
    print(f"Host API:              {api_name}")
    print(f"Supported Channels:    {dev_info['max_input_channels']}")
    print(f"Native Sample Rate:    {dev_info['default_samplerate']} Hz")
    
    sample_rate = int(dev_info['default_samplerate'])
    channels = 1 # mono capture
    
    if expected_phrase:
        print(f"\n[TARGET PHRASE TO SPEAK]:")
        print(f"  \"{expected_phrase}\"")
        
    if countdown > 0:
        print(f"\nGet ready to speak into the physical microphone in:")
        for sec in range(countdown, 0, -1):
            print(f"  {sec}...")
            time.sleep(1.0)
        print("  >>> RECORDING NOW! SPEAK CLEARLY! <<<")

    total_samples = int(duration * sample_rate)
    rec_audio = sd.rec(total_samples, samplerate=sample_rate, channels=channels, dtype='int16', device=idx)
    sd.wait()
    print("  >>> RECORDING COMPLETE! <<<\n")

    # Resample or extract mono 16kHz for VAD and Whisper
    rec_mono = rec_audio.flatten()
    metrics = calculate_metrics(rec_mono)
    
    print("-" * 65)
    print("ACOUSTIC MEASUREMENTS:")
    print(f"  Peak Amplitude (16-bit): {metrics['peak_int16']} / 32767 ({metrics['peak_normalized']*100:.2f}%)")
    print(f"  RMS Amplitude (16-bit):  {metrics['rms_int16']} / 32767 ({metrics['rms_normalized']*100:.2f}%)")
    print(f"  Signal Level:            {metrics['dbfs']:.1f} dBFS")
    print(f"  Classification:          {metrics['quality']}")
    print("-" * 65)

    # Convert to 16kHz for Silero VAD
    if sample_rate != 16000:
        # Linear interpolation resampling to 16000
        target_len = int(len(rec_mono) * 16000 / sample_rate)
        orig_indices = np.linspace(0, len(rec_mono) - 1, target_len)
        pcm_16k = np.interp(orig_indices, np.arange(len(rec_mono)), rec_mono).astype(np.int16)
    else:
        pcm_16k = rec_mono

    pcm_16k_bytes = pcm_16k.tobytes()

    # Silero VAD test
    print("\nRunning Silero VAD speech detection...")
    vad = VADBuffer(sample_rate=16000, silence_threshold_ms=400)
    chunk_size = 640 # 20ms at 16kHz
    chunks = [pcm_16k_bytes[i:i+chunk_size] for i in range(0, len(pcm_16k_bytes), chunk_size)]
    # Append trailing silence so VAD flushes any pending speech
    chunks.extend([b'\x00' * 640] * 30)

    segments = []
    for c in chunks:
        seg = vad.process_frame(c)
        if seg:
            segments.append(seg)
    flushed = vad.flush()
    if flushed:
        segments.append(flushed)

    print(f"  VAD Detected Speech Segments: {len(segments)}")

    transcribed_text = ""
    if segments:
        print("\nRunning Faster-Whisper transcription on detected speech segments...")
        whisper = WhisperExecutor(model_size="tiny.en", device="cpu", compute_type="int8")
        results = []
        for idx_seg, s in enumerate(segments):
            txt = whisper._transcribe_sync(s)
            results.append(txt)
            print(f"  Segment {idx_seg + 1} transcript: \"{txt}\"")
        transcribed_text = " ".join(results).strip()
    else:
        if metrics['quality'] in ["EMPTY_SILENT", "NEAR_SILENT"]:
            print("  [NOTE] No speech segments detected due to near-silent input.")
        else:
            print("  [NOTE] Audio was audible, attempting direct transcription...")
            whisper = WhisperExecutor(model_size="tiny.en", device="cpu", compute_type="int8")
            transcribed_text = whisper._transcribe_sync(pcm_16k_bytes).strip()
            print(f"  Direct Whisper transcript: \"{transcribed_text}\"")

    verdict = "PASS" if (metrics['peak_int16'] >= 500 and (len(segments) > 0 or len(transcribed_text) > 0)) else "HOLD"
    
    print("=" * 65)
    print(f"PROBE VERDICT: {verdict}")
    if verdict == "PASS":
        print(f"  Real speech captured successfully: \"{transcribed_text}\"")
    else:
        print("  Real speech was NOT captured or input was near-silent.")
        print("  Root causes to check:")
        print("    1. Microphone input volume in Windows Sound Settings (currently ~27%)")
        print("    2. Hardware mute switch / hotkey (e.g. Fn+F4 or microphone key)")
        print("    3. No voice spoken during probe duration")
    print("=" * 65)

    return {
        "status": verdict,
        "metrics": metrics,
        "vad_segments": len(segments),
        "transcript": transcribed_text,
        "device": dev_info['name'],
        "sample_rate": sample_rate
    }

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Nexus Physical Microphone Diagnostic Probe")
    parser.add_argument("--device", type=int, default=None, help="Device index (default: auto)")
    parser.add_argument("--duration", type=float, default=5.0, help="Recording duration in seconds")
    parser.add_argument("--countdown", type=int, default=3, help="Countdown seconds before recording")
    parser.add_argument("--phrase", type=str, default="Nexus physical microphone diagnosis test one two three", help="Target test phrase")
    args = parser.parse_args()
    
    res = record_and_diagnose(
        device_idx=args.device,
        duration=args.duration,
        countdown=args.countdown,
        expected_phrase=args.phrase
    )
    sys.exit(0 if res["status"] == "PASS" else 1)
