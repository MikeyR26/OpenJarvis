import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useAppStore, generateId } from '../lib/store';
import { useJarvisNavigate } from './TransitionContext';
import { useLocation } from 'react-router';
import { streamChat } from '../lib/sse';
import { synthesizeSpeech, fetchSavings, getBase, fetchDueReminders, transcribeAudio } from '../lib/api';
import { useSpeech } from '../hooks/useSpeech';
import { useWakeWord } from '../hooks/useWakeWord';
import { playWakeSound, playAlarmSound } from '../lib/sounds';
import type { ChatMessage, ToolCallInfo, TokenUsage, MessageTelemetry } from '../types/index';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface TimerState {
  id: string;
  label: string;
  remaining: number;
  total: number;
}

export interface AttachedFile {
  name: string;
  content: string;
}

export interface AttachedImage {
  id: string;
  dataUrl: string;
  mimeType: string;
  base64: string;
}

interface JarvisCtx {
  orbState: OrbState;
  timers: TimerState[];
  speechState: string;
  speechAvailable: boolean;
  wakeWordSupported: boolean;
  attachedFiles: AttachedFile[];
  addFiles: (files: AttachedFile[]) => void;
  removeFile: (name: string) => void;
  attachedImages: AttachedImage[];
  addImages: (images: AttachedImage[]) => void;
  removeImage: (id: string) => void;
  sendMessage: (text?: string) => Promise<void>;
  handleMicClick: () => Promise<void>;
  dismissTimer: (id: string) => void;
  stopStreaming: () => void;
}

const Ctx = createContext<JarvisCtx>({
  orbState: 'idle',
  timers: [],
  speechState: 'idle',
  speechAvailable: false,
  wakeWordSupported: false,
  attachedFiles: [],
  addFiles: () => {},
  removeFile: () => {},
  attachedImages: [],
  addImages: () => {},
  removeImage: () => {},
  sendMessage: async () => {},
  handleMicClick: async () => {},
  dismissTimer: () => {},
  stopStreaming: () => {},
});

export function useJarvis() {
  return useContext(Ctx);
}

// ---------------------------------------------------------------------------
// Sentence extraction for streaming TTS
// ---------------------------------------------------------------------------

// Split text into completed sentences and a leftover partial sentence.
// Sentence boundary: [.!?] followed by whitespace+uppercase, or end of string.
function extractSentences(text: string): [string[], string] {
  const sentences: string[] = [];
  // Match sentence-ending punctuation followed by space(s) + uppercase letter,
  // or followed by end-of-string.
  const re = /[^.!?]*[.!?]+(?=\s+[A-Z]|\s*$)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    const s = match[0].trim();
    if (s.length > 3) sentences.push(s);
    lastIndex = match.index + match[0].length;
  }
  return [sentences, text.slice(lastIndex)];
}

function playAudioBlob(blob: Blob, abortRef: React.MutableRefObject<boolean>): Promise<void> {
  return new Promise((resolve) => {
    if (abortRef.current) { resolve(); return; }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    audio.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
  });
}

// ---------------------------------------------------------------------------

// BroadcastChannel name shared with MissionControlPage
const MC_CHANNEL = 'jarvis_mc';

export function JarvisProvider({ children }: { children: ReactNode }) {
  const jarvisNavigate = useJarvisNavigate();
  const location = useLocation();
  const isMissionControl = location.pathname === '/mission-control';

  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [timers, setTimers] = useState<TimerState[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const attachedFilesRef = useRef<AttachedFile[]>([]);

  const addFiles = useCallback((files: AttachedFile[]) => {
    setAttachedFiles((prev) => {
      const next = [...prev, ...files];
      attachedFilesRef.current = next;
      return next;
    });
  }, []);

  const removeFile = useCallback((name: string) => {
    setAttachedFiles((prev) => {
      const next = prev.filter((f) => f.name !== name);
      attachedFilesRef.current = next;
      return next;
    });
  }, []);

  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const attachedImagesRef = useRef<AttachedImage[]>([]);

  const addImages = useCallback((images: AttachedImage[]) => {
    setAttachedImages((prev) => {
      const next = [...prev, ...images];
      attachedImagesRef.current = next;
      return next;
    });
  }, []);

  const removeImage = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const next = prev.filter((img) => img.id !== id);
      attachedImagesRef.current = next;
      return next;
    });
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendMessageRef = useRef<((t?: string) => Promise<void>) | null>(null);
  const countdownsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const bcRef = useRef<BroadcastChannel | null>(null);

  // TTS streaming state
  const ttsQueueRef = useRef<Promise<void>>(Promise.resolve());
  const ttsAbortRef = useRef(false);
  const ttsUnspokenRef = useRef('');

  const activeId = useAppStore((s) => s.activeId);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const streamState = useAppStore((s) => s.streamState);
  const ttsEnabled = useAppStore((s) => s.settings.ttsEnabled);
  const wakeWordEnabled = useAppStore((s) => s.settings.wakeWordEnabled);
  const maxTokens = useAppStore((s) => s.settings.maxTokens);
  const temperature = useAppStore((s) => s.settings.temperature);
  const createConversation = useAppStore((s) => s.createConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);
  const setStreamState = useAppStore((s) => s.setStreamState);
  const resetStream = useAppStore((s) => s.resetStream);

  const { state: speechState, available: speechAvailable, startRecording, stopRecording } = useSpeech();

  // Open BroadcastChannel to push updates to Mission Control window
  useEffect(() => {
    try { bcRef.current = new BroadcastChannel(MC_CHANNEL); } catch {}
    return () => { try { bcRef.current?.close(); } catch {} };
  }, []);

  const bcSend = useCallback((msg: object) => {
    try { bcRef.current?.postMessage(msg); } catch {}
  }, []);

  // Sync listening state
  useEffect(() => {
    if (speechState === 'recording') setOrbState('listening');
    else if (speechState === 'transcribing') setOrbState('thinking');
  }, [speechState]);

  // Clean up countdowns on unmount
  useEffect(() => {
    return () => { countdownsRef.current.forEach(clearInterval); };
  }, []);

  // Poll for due reminders every 30 seconds
  useEffect(() => {
    const checkReminders = async () => {
      try {
        const due = await fetchDueReminders();
        for (const reminder of due) {
          // Deliver reminder as a Jarvis message
          sendMessageRef.current?.(`[REMINDER] ${reminder.message}`);
        }
      } catch {}
    };
    const t = setInterval(checkReminders, 30000);
    return () => clearInterval(t);
  }, []);

  const startTimerCountdown = useCallback((id: string) => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        const t = prev.find((t) => t.id === id);
        if (!t) { clearInterval(interval); countdownsRef.current.delete(id); return prev; }
        if (t.remaining <= 1) {
          clearInterval(interval);
          countdownsRef.current.delete(id);
          playAlarmSound();
          return prev.map((t) => t.id === id ? { ...t, remaining: 0 } : t);
        }
        return prev.map((t) => t.id === id ? { ...t, remaining: t.remaining - 1 } : t);
      });
    }, 1000);
    countdownsRef.current.set(id, interval);
  }, []);

  const dismissTimer = useCallback((id: string) => {
    const iv = countdownsRef.current.get(id);
    if (iv) { clearInterval(iv); countdownsRef.current.delete(id); }
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    ttsAbortRef.current = true;
    if (streamTimerRef.current) { clearInterval(streamTimerRef.current); streamTimerRef.current = null; }
    resetStream();
    setOrbState('idle');
  }, [resetStream]);

  // Shared VAD record-and-send used by both wake word follow-up and auto-listen after questions
  const vadRecordAndSendRef = useRef<(() => Promise<void>) | null>(null);

  const vadRecordAndSend = useCallback(async () => {
    setOrbState('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const rms = () => { analyser.getByteFrequencyData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };

      // Wait up to 3s for speech to start
      const started = await new Promise<boolean>(resolve => {
        const t0 = Date.now();
        const poll = () => rms() > 18 ? resolve(true) : Date.now() - t0 > 3000 ? resolve(false) : setTimeout(poll, 40);
        poll();
      });

      if (!started) {
        stream.getTracks().forEach(t => t.stop());
        await audioCtx.close();
        setOrbState('idle');
        return;
      }

      // Record until 1.2s silence or 8s max
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.start();
      const t0 = Date.now();
      let lastSpeech = Date.now();
      await new Promise<void>(resolve => {
        const poll = () => {
          if (rms() > 18) lastSpeech = Date.now();
          (Date.now() - lastSpeech > 1200 || Date.now() - t0 > 8000) ? resolve() : setTimeout(poll, 40);
        };
        poll();
      });
      rec.stop();
      await new Promise<void>(r => { rec.onstop = () => r(); });
      stream.getTracks().forEach(t => t.stop());
      await audioCtx.close();

      setOrbState('thinking');
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const { text } = await transcribeAudio(blob);
      const cleaned = text.trim().toLowerCase().replace(/[^a-z\s]/g, '').trim();
      const wakeOnly = ['jarvis', 'hey jarvis', 'jarves', 'hey jarves'].includes(cleaned);
      if (text.trim() && !wakeOnly) {
        sendMessageRef.current?.(text.trim());
      } else {
        setOrbState('idle');
      }
    } catch {
      setOrbState('idle');
    }
  }, []);

  vadRecordAndSendRef.current = vadRecordAndSend;

  const handleMicClick = useCallback(async () => {
    if (speechState === 'recording') {
      try {
        const text = await stopRecording();
        if (text) sendMessageRef.current?.(text);
        else setOrbState('idle');
      } catch {
        setOrbState('idle');
      }
    } else {
      setOrbState('listening');
      await startRecording();
    }
  }, [speechState, startRecording, stopRecording]);

  const handleWake = useCallback(async (command: string) => {
    if (streamState.isStreaming || speechState === 'recording' || orbState === 'speaking' || orbState === 'listening') return;
    try { playWakeSound(); } catch {}

    if (command.trim().length > 2) {
      // Full command in one breath — send immediately
      sendMessageRef.current?.(command.trim());
      return;
    }

    // Wake word only — VAD record follow-up
    await vadRecordAndSendRef.current?.();
  }, [streamState.isStreaming, speechState, orbState]);

  // Pause wake word loop while user is recording, Jarvis is speaking, or follow-up command is being captured.
  // Also disable entirely on Mission Control — it's display-only, wake word runs on the main page only.
  const wakeWordSuppressed = speechState === 'recording' || orbState === 'speaking' || orbState === 'listening';
  const { supported: wakeWordSupported } = useWakeWord(wakeWordEnabled && !isMissionControl, handleWake, wakeWordSuppressed);

  // Strip markdown symbols so TTS doesn't read "asterisk" or "pound sign"
  const stripMarkdown = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/gs, '$1')
      .replace(/\*(.+?)\*/gs, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .trim();

  // Queue a sentence for TTS synthesis + playback
  const enqueueTTS = useCallback((text: string) => {
    ttsQueueRef.current = ttsQueueRef.current.then(async () => {
      const clean = stripMarkdown(text);
      if (ttsAbortRef.current || !clean) return;
      try {
        const blob = await synthesizeSpeech(clean);
        await playAudioBlob(blob, ttsAbortRef);
      } catch {
        // Fish Audio failed — fall back to browser speech synthesis
        if (!ttsAbortRef.current && 'speechSynthesis' in window) {
          await new Promise<void>((resolve) => {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(clean);
            u.rate = 1.15; u.pitch = 0.85;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            window.speechSynthesis.speak(u);
          });
        }
      }
    });
  }, []);

  const sendMessage = useCallback(async (contentOverride?: string) => {
    const rawText = contentOverride?.trim() ?? '';
    if (!rawText && attachedFilesRef.current.length === 0) return;
    if (streamState.isStreaming) return;

    // Prepend any attached files then clear them
    let inputContent = rawText;
    const files = attachedFilesRef.current;
    if (files.length > 0) {
      const fileBlock = files
        .map((f) => `[File: ${f.name}]\n\`\`\`\n${f.content.slice(0, 40000)}\n\`\`\``)
        .join('\n\n');
      inputContent = fileBlock + (rawText ? '\n\n' + rawText : '');
      attachedFilesRef.current = [];
      setAttachedFiles([]);
    }

    // Build multipart content if images are attached
    const images = attachedImagesRef.current;
    let apiContent: string | unknown[] = inputContent;
    if (images.length > 0) {
      const blocks: unknown[] = images.map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      }));
      if (inputContent) blocks.push({ type: 'text', text: inputContent });
      apiContent = blocks;
      attachedImagesRef.current = [];
      setAttachedImages([]);
    }

    if (!inputContent && !images.length) return;

    let convId = activeId;
    if (!convId) convId = createConversation(selectedModel);

    // Snapshot previous messages for the API before adding the new user message
    const prevApiMessages = useAppStore.getState().messages.map((m) => ({ role: m.role, content: m.content as string }));

    const userMsg: ChatMessage = {
      id: generateId(), role: 'user',
      content: inputContent || (images.length > 0 ? '[Image]' : ''),
      timestamp: Date.now(),
    };
    addMessage(convId, userMsg);
    bcSend({ type: 'messages', messages: useAppStore.getState().messages });

    // Full API message list: history + new user message with multimodal content
    const apiMessages = [...prevApiMessages, { role: 'user', content: apiContent }];

    const assistantMsg: ChatMessage = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now() };
    addMessage(convId, assistantMsg);
    bcSend({ type: 'messages', messages: useAppStore.getState().messages });

    const startTime = Date.now();
    streamTimerRef.current = setInterval(() => setStreamState({ elapsedMs: Date.now() - startTime }), 100);
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset TTS state
    ttsAbortRef.current = false;
    ttsUnspokenRef.current = '';
    ttsQueueRef.current = Promise.resolve();

    let accumulatedContent = '';
    let wasAborted = false;
    let usage: TokenUsage | undefined;
    let complexity: { score: number; tier: string; suggested_max_tokens: number } | undefined;
    const toolCalls: ToolCallInfo[] = [];
    let lastFlush = 0;
    let ttftMs: number | undefined;

    setStreamState({ isStreaming: true, phase: 'Thinking...', elapsedMs: 0, activeToolCalls: [], content: '' });
    setOrbState('thinking');

    try {
      for await (const ev of streamChat(
        { model: selectedModel, messages: apiMessages, stream: true, temperature, max_tokens: maxTokens },
        controller.signal,
      )) {
        if (ev.event === 'show_map') {
          try {
            const d = JSON.parse(ev.data);
            const params = new URLSearchParams({
              location: d.location, lat: String(d.lat), lng: String(d.lng), zoom: String(d.zoom ?? 11),
            });
            setTimeout(() => jarvisNavigate(`/map?${params}`, d.location), 400);
          } catch {}
        } else if (ev.event === 'navigate_to') {
          try {
            const d = JSON.parse(ev.data);
            if (d.path) {
              if (d.path === '/mission-control') {
                setTimeout(() => window.open('/mission-control', 'mission-control', 'noopener'), 400);
              } else {
                setTimeout(() => jarvisNavigate(d.path, d.label || ''), 400);
              }
            }
          } catch {}
        } else if (ev.event === 'set_timer') {
          try {
            const d = JSON.parse(ev.data);
            if (d.seconds > 0) {
              const timerId = generateId();
              setTimers((prev) => [...prev, { id: timerId, label: d.label || 'Timer', remaining: d.seconds, total: d.seconds }]);
              setTimeout(() => startTimerCountdown(timerId), 100);
            }
          } catch {}
        } else if (ev.event === 'agent_turn_start') {
          setStreamState({ phase: 'Agent thinking...' });
        } else if (ev.event === 'inference_start') {
          setStreamState({ phase: 'Generating...' });
        } else if (ev.event === 'tool_call_start') {
          try {
            const d = JSON.parse(ev.data);
            const tc: ToolCallInfo = { id: generateId(), tool: d.tool, arguments: d.arguments || '', status: 'running' };
            toolCalls.push(tc);
            setStreamState({ phase: `${d.tool}...`, activeToolCalls: [...toolCalls] });
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
          } catch {}
        } else if (ev.event === 'tool_call_end') {
          try {
            const d = JSON.parse(ev.data);
            const tc = toolCalls.find((t) => t.tool === d.tool && t.status === 'running');
            if (tc) { tc.status = d.success ? 'success' : 'error'; tc.latency = d.latency; tc.result = d.result; }
            setStreamState({ phase: 'Generating...', activeToolCalls: [...toolCalls] });
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
          } catch {}
        } else {
          try {
            const d = JSON.parse(ev.data);
            if (d.usage) usage = d.usage;
            if (d.complexity) complexity = d.complexity;
            const delta = d.choices?.[0]?.delta;
            if (delta?.content) {
              if (!ttftMs) ttftMs = Date.now() - startTime;
              accumulatedContent += delta.content;
              setStreamState({ content: accumulatedContent, phase: '' });

              // Streaming TTS — extract completed sentences as they arrive
              if (ttsEnabled && !ttsAbortRef.current) {
                ttsUnspokenRef.current += delta.content;
                const [sentences, remaining] = extractSentences(ttsUnspokenRef.current);
                ttsUnspokenRef.current = remaining;
                if (sentences.length > 0 && orbState !== 'listening') {
                  setOrbState('speaking');
                  for (const s of sentences) enqueueTTS(s);
                }
              }

              const now = Date.now();
              if (now - lastFlush >= 80) {
                updateLastAssistant(convId, accumulatedContent, toolCalls.length > 0 ? [...toolCalls] : undefined);
                bcSend({ type: 'stream', content: accumulatedContent, isStreaming: true, phase: '' });
                lastFlush = now;
              }
            }
            if (d.choices?.[0]?.finish_reason === 'stop') break;
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        wasAborted = true;
        ttsAbortRef.current = true;
        if (!accumulatedContent) accumulatedContent = '(Generation stopped)';
      } else {
        accumulatedContent = accumulatedContent || `Error: ${err?.message || String(err)}`;
      }
    } finally {
      if (!accumulatedContent) accumulatedContent = 'No response was generated. Please try again.';

      const totalMs = Date.now() - startTime;
      const cloudPfx = ['gpt-', 'o1-', 'o3-', 'o4-', 'claude-', 'gemini-', 'openrouter/', 'MiniMax-', 'chatgpt-'];
      const telemetry: MessageTelemetry = {
        engine: cloudPfx.some((p) => selectedModel.startsWith(p)) ? 'cloud' : 'ollama',
        model_id: selectedModel, total_ms: totalMs, ttft_ms: ttftMs,
        tokens_per_sec: usage?.completion_tokens ? usage.completion_tokens / (totalMs / 1000) : undefined,
        complexity_score: complexity?.score, complexity_tier: complexity?.tier,
        suggested_max_tokens: complexity?.suggested_max_tokens,
      };

      let audioMeta: { url: string } | undefined;
      try {
        const r = await fetch(`${getBase()}/api/digest`);
        if (r.ok) { const d = await r.json(); if (d.audio_available) audioMeta = { url: `${getBase()}/api/digest/audio` }; }
      } catch {}

      updateLastAssistant(convId, accumulatedContent, toolCalls.length > 0 ? toolCalls : undefined, usage, telemetry, audioMeta);
      bcSend({ type: 'messages', messages: useAppStore.getState().messages });
      bcSend({ type: 'stream', content: '', isStreaming: false, phase: '' });
      if (streamTimerRef.current) { clearInterval(streamTimerRef.current); streamTimerRef.current = null; }
      resetStream();
      abortRef.current = null;

      const shouldSpeak = ttsEnabled && !wasAborted && accumulatedContent && accumulatedContent !== 'No response was generated. Please try again.';
      const endsWithQuestion = accumulatedContent.trimEnd().endsWith('?');

      if (shouldSpeak) {
        // Flush any remaining text that didn't end in a sentence boundary
        if (ttsUnspokenRef.current.trim()) {
          setOrbState('speaking');
          enqueueTTS(ttsUnspokenRef.current.trim());
          ttsUnspokenRef.current = '';
        }

        // After TTS drains, auto-listen only if Jarvis asked a question
        ttsQueueRef.current.then(() => {
          if (ttsAbortRef.current) return;
          if (endsWithQuestion && speechAvailable) {
            setTimeout(() => vadRecordAndSendRef.current?.(), 400);
          } else {
            setOrbState('idle');
          }
        });
      } else {
        setOrbState('idle');
      }

      fetchSavings().then((d) => useAppStore.getState().setSavings(d)).catch(() => {});
    }
  }, [activeId, selectedModel, streamState.isStreaming, ttsEnabled, maxTokens, temperature,
    createConversation, addMessage, updateLastAssistant, setStreamState, resetStream,
    startTimerCountdown, jarvisNavigate, orbState, enqueueTTS, bcSend]);

  sendMessageRef.current = sendMessage;

  return (
    <Ctx.Provider value={{ orbState, timers, speechState, speechAvailable, wakeWordSupported, attachedFiles, addFiles, removeFile, attachedImages, addImages, removeImage, sendMessage, handleMicClick, dismissTimer, stopStreaming }}>
      {children}
    </Ctx.Provider>
  );
}
