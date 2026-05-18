import { useState, useRef, useCallback, useEffect, type ChangeEvent } from 'react';
import { useAppStore } from '../lib/store';
import { useJarvis, type OrbState, type TimerState, type AttachedFile, type AttachedImage } from '../contexts/JarvisContext';
import { useJarvisNavigate } from '../contexts/TransitionContext';

// ── Orb ──────────────────────────────────────────────────────────────────────

function JarvisOrb({ state, size = 300 }: { state: OrbState; size?: number }) {
  const thinking = state === 'thinking';
  const speaking = state === 'speaking';
  const listening = state === 'listening';
  const c = size / 2;
  const scale = size / 300;

  const outerDur = thinking ? '3s' : '10s';
  const midDur = thinking ? '2s' : '7s';
  const innerDur = thinking ? '1.5s' : '5s';
  const breatheDur = speaking ? '0.7s' : thinking ? '1.2s' : '3.5s';
  const coreR = speaking ? '52;62;52' : listening ? '50;58;50' : '48;54;48';
  const dotR = speaking ? '23;28;23' : listening ? '22;26;22' : '20;24;20';
  const glowOpacity = speaking ? '0.4' : listening ? '0.25' : '0.12';

  return (
    <svg width={size} height={size} viewBox="0 0 300 300" style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id="jv-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00eeff" stopOpacity="1" />
          <stop offset="50%" stopColor="#0099cc" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#001833" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="jv-ambient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity={glowOpacity} />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
        </radialGradient>
        <filter id="jv-glow">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="jv-blur">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      <circle cx={c} cy={c} r="145" fill="url(#jv-ambient)">
        <animate attributeName="opacity" values={speaking ? '0.8;1;0.8' : '0.7;1;0.7'}
          dur={breatheDur} repeatCount="indefinite" />
      </circle>

      {speaking && [0, 0.6, 1.2].map((delay, i) => (
        <circle key={i} cx={c} cy={c} r="70" fill="none" stroke="#00d4ff" strokeWidth="1.5">
          <animate attributeName="r" from="70" to="145" dur="1.8s" begin={`${delay}s`} repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" from="0.55" to="0" dur="1.8s" begin={`${delay}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {listening && [0, 0.7].map((delay, i) => (
        <circle key={i} cx={c} cy={c} r="70" fill="none" stroke="#00ff88" strokeWidth="1">
          <animate attributeName="r" from="70" to="115" dur="1.4s" begin={`${delay}s`} repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" from="0.5" to="0" dur="1.4s" begin={`${delay}s`} repeatCount="indefinite" />
        </circle>
      ))}

      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur={outerDur} repeatCount="indefinite" />
        <circle cx={c} cy={c} r="128" fill="none" stroke="#00d4ff" strokeWidth="0.6" strokeDasharray="160 650" strokeOpacity="0.7" filter="url(#jv-glow)" />
        <circle cx={c} cy={c} r="128" fill="none" stroke="#00d4ff" strokeWidth="0.3" strokeDasharray="35 260" strokeOpacity="0.25" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="360 150 150" to="0 150 150" dur={midDur} repeatCount="indefinite" />
        <circle cx={c} cy={c} r="106" fill="none" stroke="#00ff88" strokeWidth="0.8" strokeDasharray="80 575" strokeOpacity="0.55" filter="url(#jv-glow)" />
        <circle cx={c} cy={c} r="106" fill="none" stroke="#00ff88" strokeWidth="0.3" strokeDasharray="22 200" strokeOpacity="0.2" />
      </g>
      <g>
        <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur={innerDur} repeatCount="indefinite" />
        <circle cx={c} cy={c} r="86" fill="none" stroke="#00d4ff" strokeWidth="1" strokeDasharray="50 490" strokeOpacity="0.8" filter="url(#jv-glow)" />
        <circle cx={c} cy={c} r="86" fill="none" stroke="#00aaff" strokeWidth="0.4" strokeDasharray="14 150" strokeOpacity="0.35" />
      </g>

      <circle cx={c} cy={c} r="52" fill="url(#jv-core)" filter="url(#jv-blur)">
        <animate attributeName="r" values={coreR} dur={breatheDur} repeatCount="indefinite" />
      </circle>
      <circle cx={c} cy={c} r="22" fill="#00d4ff" filter="url(#jv-glow)">
        <animate attributeName="r" values={dotR} dur={breatheDur} repeatCount="indefinite" />
        <animate attributeName="opacity" values={speaking ? '0.85;1;0.85' : '0.7;1;0.7'} dur={breatheDur} repeatCount="indefinite" />
      </circle>
      <circle cx={c} cy={c} r="7" fill="white" opacity="0.9" filter="url(#jv-glow)" />
      <circle cx={c} cy={c} r="3" fill="white" />

      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * 22.5 * Math.PI) / 180;
        const major = i % 4 === 0;
        const o = 133, inn = major ? 122 : 127;
        return (
          <line key={i}
            x1={c + o * Math.cos(a)} y1={c + o * Math.sin(a)}
            x2={c + inn * Math.cos(a)} y2={c + inn * Math.sin(a)}
            stroke="#00d4ff" strokeWidth={major ? 1.5 : 0.8}
            strokeOpacity={major ? 0.6 : 0.25} />
        );
      })}
    </svg>
  );
}

// ── Timer Widget ──────────────────────────────────────────────────────────────

function TimerWidget({ timer, onDismiss }: { timer: TimerState; onDismiss: () => void }) {
  const pct = Math.max(0, timer.remaining / timer.total);
  const mins = Math.floor(timer.remaining / 60);
  const secs = timer.remaining % 60;
  const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const done = timer.remaining <= 0;
  const r = 22;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 14px', borderRadius: 8,
      background: done ? 'rgba(255,60,60,0.12)' : 'rgba(0,212,255,0.06)',
      border: `1px solid ${done ? 'rgba(255,60,60,0.5)' : 'rgba(0,212,255,0.25)'}`,
      animation: done ? 'jv-chip-pulse 0.5s ease-in-out infinite' : undefined,
    }}>
      <svg width="50" height="50" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r={r} fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="2.5" />
        <circle cx="25" cy="25" r={r} fill="none" stroke={done ? '#ff4444' : '#00d4ff'} strokeWidth="2.5"
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round" transform="rotate(-90 25 25)" />
        <text x="25" y="29" textAnchor="middle" fill={done ? '#ff6666' : '#00d4ff'}
          fontSize="9" fontFamily="IBM Plex Mono,monospace" letterSpacing="0.05em">
          {done ? 'DONE' : display}
        </text>
      </svg>
      <div>
        <div style={{ fontSize: 10, color: done ? '#ff6666' : '#00d4ff', letterSpacing: '0.12em' }}>
          {timer.label.toUpperCase()}
        </div>
        {done && <div style={{ fontSize: 9, color: 'rgba(255,100,100,0.7)' }}>TIMER COMPLETE</div>}
      </div>
      <button onClick={onDismiss} style={{
        marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
        color: 'rgba(0,212,255,0.4)', fontSize: 14, lineHeight: 1, padding: '0 2px',
      }}>×</button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function JarvisPage() {
  const { orbState, timers, speechState, wakeWordSupported, attachedFiles, addFiles, removeFile, attachedImages, addImages, removeImage, sendMessage, handleMicClick, dismissTimer, stopStreaming } = useJarvis();
  const jarvisNavigate = useJarvisNavigate();
  const [input, setInput] = useState('');
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<((t?: string) => Promise<void>) | null>(null);
  const dragCounterRef = useRef(0);

  const streamState = useAppStore((s) => s.streamState);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const wakeWordEnabled = useAppStore((s) => s.settings.wakeWordEnabled);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  // Clipboard paste → capture + compress images to JPEG < 1MB
  useEffect(() => {
    const compressImage = (blob: Blob): Promise<{ dataUrl: string; base64: string; mimeType: string }> =>
      new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX = 1280;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve({ dataUrl, base64: dataUrl.split(',')[1] ?? '', mimeType: 'image/jpeg' });
        };
        img.onerror = () => { URL.revokeObjectURL(url); };
        img.src = url;
      });

    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItems = items.filter((it) => it.type.startsWith('image/'));
      if (!imageItems.length) return;
      e.preventDefault();
      const captured: AttachedImage[] = [];
      let pending = imageItems.length;
      imageItems.forEach((item) => {
        const blob = item.getAsFile();
        if (!blob) { if (--pending === 0 && captured.length) addImages(captured); return; }
        compressImage(blob).then(({ dataUrl, base64, mimeType }) => {
          captured.push({ id: `img-${Date.now()}-${Math.random()}`, dataUrl, mimeType, base64 });
          if (--pending === 0) addImages(captured);
        });
      });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addImages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const readFileList = useCallback((files: File[]) => {
    const results: AttachedFile[] = [];
    let pending = files.length;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        results.push({ name: file.name, content: (ev.target?.result as string) || '' });
        if (--pending === 0) addFiles(results);
      };
      reader.readAsText(file);
    });
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    readFileList(Array.from(e.dataTransfer.files));
  }, [readFileList]);

  const handleFileInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) readFileList(Array.from(e.target.files));
    e.target.value = '';
  }, [readFileList]);

  const handleSend = useCallback(async (textOverride?: string) => {
    const text = textOverride ?? input;
    if (!text.trim() && attachedFiles.length === 0) return;
    setInput('');
    await sendMessage(text);
  }, [input, attachedFiles.length, sendMessage]);

  sendRef.current = handleSend;

  const activeTools = streamState.activeToolCalls ?? [];
  const statusLabel =
    wakeWordEnabled && orbState === 'idle' && !streamState.isStreaming ? 'STANDBY'
    : orbState === 'listening' ? 'LISTENING'
    : orbState === 'speaking' ? 'SPEAKING'
    : streamState.isStreaming ? (streamState.phase?.toUpperCase().replace('...', '') || 'GENERATING')
    : 'ONLINE';
  const statusColor = orbState === 'listening' ? '#00ff88' : orbState === 'speaking' ? '#00d4ff' : streamState.isStreaming ? '#ffcc00' : '#00d4ff';
  const micDisabled = !speechEnabled || streamState.isStreaming;

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        width: '100vw', height: '100vh', background: '#00060f',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'space-between', overflow: 'hidden', position: 'relative',
        fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      }}
    >
      <style>{`
        @keyframes jv-chip-pulse { 0%,100% { opacity: 0.65; } 50% { opacity: 1; } }
        .jv-input::placeholder { color: rgba(0,212,255,0.3); }
        .jv-input::-webkit-scrollbar { width: 0; }
        .jv-hud-btn:hover { border-color: rgba(0,212,255,0.6) !important; background: rgba(0,212,255,0.08) !important; }
      `}</style>

      {/* Drop overlay */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,212,255,0.06)',
          border: '2px solid rgba(0,212,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 13, letterSpacing: '0.3em', color: '#00d4ff',
            padding: '16px 32px',
            border: '1px solid rgba(0,212,255,0.4)',
            background: 'rgba(0,6,15,0.85)',
          }}>
            DROP FILE FOR JARVIS
          </div>
        </div>
      )}

      {/* Scanline */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,212,255,0.012) 3px, rgba(0,212,255,0.012) 4px)' }} />

      {/* HUD corners */}
      <div style={{ position: 'absolute', top: 18, left: 24, color: '#00d4ff', opacity: 0.3, fontSize: 10, letterSpacing: '0.12em', zIndex: 2 }}>SYS:JARVIS v2.0</div>
      <div style={{ position: 'absolute', top: 18, right: 24, color: '#00d4ff', opacity: 0.3, fontSize: 10, letterSpacing: '0.12em', zIndex: 2 }}>{clock}</div>

      {/* Mission Control button — opens in new window for second monitor */}
      <button
        onClick={() => window.open('/mission-control', 'mission-control', 'noopener')}
        style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, background: 'rgba(0,212,255,0.04)',
          border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4,
          padding: '5px 18px', color: 'rgba(0,212,255,0.5)',
          fontSize: 9, letterSpacing: '0.22em', cursor: 'pointer',
          fontFamily: 'inherit', transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = 'rgba(0,212,255,0.6)'; el.style.color = '#00d4ff'; el.style.background = 'rgba(0,212,255,0.08)'; }}
        onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'rgba(0,212,255,0.2)'; el.style.color = 'rgba(0,212,255,0.5)'; el.style.background = 'rgba(0,212,255,0.04)'; }}
      >
        ◈ MISSION CONTROL
      </button>
      <div style={{ position: 'absolute', bottom: 18, left: 24, color: '#00d4ff', opacity: 0.2, fontSize: 9, letterSpacing: '0.1em', zIndex: 2 }}>
        {selectedModel.split('/').pop()?.toUpperCase()}
      </div>

      {/* Wake word indicator */}
      {wakeWordEnabled && (
        <div style={{ position: 'absolute', bottom: 18, right: 24, zIndex: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: wakeWordSupported ? '#00ff88' : '#ff6b00',
            boxShadow: wakeWordSupported ? '0 0 4px #00ff88' : '0 0 4px #ff6b00',
            animation: 'jv-chip-pulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 8, color: wakeWordSupported ? 'rgba(0,255,136,0.4)' : 'rgba(255,107,0,0.6)', letterSpacing: '0.12em' }}>
            {wakeWordSupported ? 'WAKE ACTIVE' : 'NEEDS CHROME'}
          </span>
        </div>
      )}

      <div style={{ paddingTop: 52, fontSize: 10, letterSpacing: '0.28em', color: '#00d4ff', opacity: 0.4, zIndex: 2 }}>
        JARVIS INTERFACE
      </div>

      {/* Orb + status + tools + timers */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, zIndex: 2 }}>
        <JarvisOrb state={orbState} />

        <div style={{ fontSize: 11, letterSpacing: '0.3em', color: statusColor, transition: 'color 0.4s', fontWeight: 600 }}>
          {statusLabel}
        </div>

        {activeTools.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 }}>
            {activeTools.map((tc) => {
              const running = tc.status === 'running';
              const col = running ? '#00d4ff' : tc.status === 'success' ? '#00ff88' : '#ff4455';
              return (
                <div key={tc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px', borderRadius: 20,
                  border: `1px solid ${col}`, color: col, fontSize: 10, background: `${col}0f`,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  animation: running ? 'jv-chip-pulse 1s ease-in-out infinite' : undefined,
                }}>
                  <span style={{ fontSize: 9 }}>{running ? '◈' : tc.status === 'success' ? '✓' : '✗'}</span>
                  {tc.tool}{tc.latency ? <span style={{ opacity: 0.45 }}>{tc.latency}ms</span> : null}
                </div>
              );
            })}
          </div>
        )}

        {timers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
            {timers.map((t) => <TimerWidget key={t.id} timer={t} onDismiss={() => dismissTimer(t.id)} />)}
          </div>
        )}
      </div>

      {/* Shortcut buttons */}
      <div style={{ display: 'flex', gap: 8, zIndex: 2 }}>
        {[
          { label: 'BRIEFING', msg: 'Good morning. Give me a morning briefing: current time, weather, and anything in memory.' },
          { label: 'SCREEN', msg: "What's on my screen right now?" },
          { label: 'MEMORY', msg: 'What do you remember about me?' },
        ].map(({ label, msg }) => (
          <button key={label} onClick={() => handleSend(msg)} className="jv-hud-btn"
            disabled={streamState.isStreaming}
            style={{
              padding: '5px 14px', borderRadius: 4, background: 'rgba(0,212,255,0.04)',
              border: '1px solid rgba(0,212,255,0.2)', color: 'rgba(0,212,255,0.5)', fontSize: 9,
              letterSpacing: '0.18em', cursor: 'pointer', fontFamily: 'inherit',
              opacity: streamState.isStreaming ? 0.3 : 1, transition: 'all 0.2s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* File drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: '100%', maxWidth: 580, padding: '0 28px', zIndex: 2,
          marginBottom: 8, cursor: 'pointer',
        }}
      >
        <div style={{
          border: `1px dashed ${isDragOver ? 'rgba(0,212,255,0.7)' : 'rgba(0,212,255,0.18)'}`,
          borderRadius: 8,
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: isDragOver ? 'rgba(0,212,255,0.06)' : 'transparent',
          transition: 'all 0.2s',
        }}>
          <span style={{ fontSize: 14, opacity: 0.5 }}>📎</span>
          <span style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(0,212,255,0.35)' }}>
            {isDragOver ? 'DROP TO ATTACH' : 'DROP FILES HERE OR CLICK TO BROWSE'}
          </span>
          {(attachedFiles.length > 0 || attachedImages.length > 0) && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {attachedImages.map((img) => (
                <div key={img.id} style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={img.dataUrl} alt="pasted"
                    style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(0,212,255,0.4)', display: 'block' }} />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                    style={{
                      position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%',
                      background: 'rgba(0,6,15,0.9)', border: '1px solid rgba(0,212,255,0.4)',
                      color: 'rgba(0,212,255,0.7)', fontSize: 9, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
                    }}
                  >×</button>
                </div>
              ))}
              {attachedFiles.map((f) => (
                <div key={f.name} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 20,
                  border: '1px solid rgba(0,212,255,0.35)',
                  background: 'rgba(0,212,255,0.08)',
                  fontSize: 9, color: 'rgba(0,212,255,0.8)', letterSpacing: '0.04em',
                }}>
                  <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,212,255,0.4)', fontSize: 11, padding: 0, lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div style={{ width: '100%', maxWidth: 580, padding: '0 28px 28px', zIndex: 2 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.18)',
          borderRadius: 40, padding: '8px 14px',
        }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="text/*,.py,.js,.ts,.tsx,.jsx,.json,.md,.txt,.csv,.yaml,.yml,.toml,.sh,.ps1,.html,.css,.xml,.sql"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />

          {/* Paperclip button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
              background: attachedFiles.length > 0 ? 'rgba(0,212,255,0.18)' : 'rgba(0,212,255,0.06)',
              color: attachedFiles.length > 0 ? '#00d4ff' : 'rgba(0,212,255,0.35)',
              transition: 'all 0.2s',
            }}
          >📎</button>

          <button onClick={handleMicClick} disabled={micDisabled && speechState === 'idle'}
            style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
              background: speechState === 'recording' ? 'rgba(0,255,136,0.18)' : 'rgba(0,212,255,0.08)',
              color: speechState === 'recording' ? '#00ff88' : '#00d4ff',
              opacity: (micDisabled && speechState === 'idle') ? 0.25 : 1, transition: 'all 0.2s',
            }}>
            {speechState === 'recording' ? '◉' : '🎤'}
          </button>

          <textarea ref={textareaRef} value={input} rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            disabled={streamState.isStreaming}
            placeholder="Speak or type..."
            className="jv-input"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
              fontFamily: 'inherit', fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, maxHeight: 120,
            }} />

          {streamState.isStreaming ? (
            <button onClick={stopStreaming} style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'rgba(255,60,60,0.18)', color: '#ff4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
            }}>■</button>
          ) : (
            <button onClick={() => handleSend()} disabled={!input.trim() && attachedFiles.length === 0} style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none',
              cursor: (input.trim() || attachedFiles.length > 0) ? 'pointer' : 'default',
              background: (input.trim() || attachedFiles.length > 0) ? 'rgba(0,212,255,0.18)' : 'transparent',
              color: (input.trim() || attachedFiles.length > 0) ? '#00d4ff' : 'rgba(0,212,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              transition: 'all 0.2s', flexShrink: 0,
            }}>▶</button>
          )}
        </div>
      </div>
    </div>
  );
}

export { JarvisOrb, TimerWidget };
