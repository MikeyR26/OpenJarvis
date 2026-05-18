import { useEffect, useRef, useCallback } from 'react';
import { transcribeWakeWord } from '../lib/api';

// Both "Jarvis" and "Hey Jarvis" are valid wake words
const WAKE_WORDS = ['jarvis', 'hey jarvis', 'jarves', 'hey jarves', 'jar vis'];

// VAD thresholds
const SPEECH_THRESHOLD = 28;   // RMS level (0–255) — high enough to ignore background noise
const SILENCE_MS = 1200;       // stop recording after this much consecutive silence
const MAX_RECORDING_MS = 7000; // hard cap on one recording chunk
const MIN_SPEECH_MS = 600;     // don't bother transcribing very short blips

// onWake receives the command spoken after "jarvis" (empty if just the wake phrase).
// suppress should be true while the main push-to-talk mic is active.
export function useWakeWord(
  enabled: boolean,
  onWake: (command: string) => void,
  suppress: boolean = false,
): { supported: boolean } {
  const supported = !!(navigator.mediaDevices?.getUserMedia);

  const activeRef = useRef(false);
  const suppressRef = useRef(suppress);
  suppressRef.current = suppress;
  const loopRunningRef = useRef(false);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const runLoop = useCallback(async () => {
    if (!activeRef.current || loopRunningRef.current) return;
    loopRunningRef.current = true;

    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) { stream.getTracks().forEach(t => t.stop()); loopRunningRef.current = false; return; }

      // ── VAD setup ─────────────────────────────────────────────────────
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      const getRMS = (): number => {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i] * freqData[i];
        return Math.sqrt(sum / freqData.length);
      };

      // ── Wait for speech to start ───────────────────────────────────────
      await new Promise<void>((resolve) => {
        const poll = () => {
          if (!activeRef.current) { resolve(); return; }
          if (suppressRef.current) { setTimeout(poll, 200); return; }
          if (getRMS() > SPEECH_THRESHOLD) { resolve(); return; }
          setTimeout(poll, 40);
        };
        poll();
      });

      if (!activeRef.current) throw new Error('deactivated');

      // ── Record until silence ───────────────────────────────────────────
      console.log('[WakeWord] speech detected — recording');
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start();

      const speechStart = Date.now();
      let lastSpeechAt = Date.now();

      await new Promise<void>((resolve) => {
        const poll = () => {
          if (!activeRef.current) { resolve(); return; }
          if (getRMS() > SPEECH_THRESHOLD) lastSpeechAt = Date.now();
          const silent = Date.now() - lastSpeechAt > SILENCE_MS;
          const tooLong = Date.now() - speechStart > MAX_RECORDING_MS;
          if (silent || tooLong) { resolve(); return; }
          setTimeout(poll, 40);
        };
        poll();
      });

      recorder.stop();
      await new Promise<void>((r) => { recorder.onstop = () => r(); });

      stream.getTracks().forEach(t => t.stop());
      await audioCtx.close();
      stream = null; audioCtx = null;

      const duration = Date.now() - speechStart;
      if (duration < MIN_SPEECH_MS || !activeRef.current) {
        loopRunningRef.current = false;
        if (activeRef.current) setTimeout(runLoop, 100);
        return;
      }

      // ── Transcribe with "Hey Jarvis" initial prompt ────────────────────
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const result = await transcribeWakeWord(blob);
      const text = (result.text || '').toLowerCase().trim();
      console.log('[WakeWord] heard:', JSON.stringify(text));

      // ── Check for wake word ────────────────────────────────────────────
      for (const w of WAKE_WORDS) {
        const idx = text.indexOf(w);
        if (idx !== -1) {
          const afterWake = text.slice(idx + w.length).trim();
          console.log('[WakeWord] WAKE — command:', JSON.stringify(afterWake));
          onWakeRef.current(afterWake);
          loopRunningRef.current = false;
          if (activeRef.current) setTimeout(runLoop, 500);
          return;
        }
      }

    } catch (err: any) {
      if (err?.message !== 'deactivated') console.log('[WakeWord] loop error:', err);
      if (stream) { stream.getTracks().forEach(t => t.stop()); }
      if (audioCtx) { audioCtx.close().catch(() => {}); }
    }

    loopRunningRef.current = false;
    if (activeRef.current) setTimeout(runLoop, 100);
  }, []);

  useEffect(() => {
    if (enabled) {
      activeRef.current = true;
      runLoop();
    } else {
      activeRef.current = false;
    }
    return () => { activeRef.current = false; };
  }, [enabled, runLoop]);

  return { supported };
}
