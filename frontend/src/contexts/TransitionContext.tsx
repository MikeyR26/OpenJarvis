import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { playEngageSound, playArriveSound } from '../lib/sounds';

// ── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'enter' | 'active' | 'exit';

interface TransitionCtx {
  jarvisNavigate: (path: string, label?: string) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const Ctx = createContext<TransitionCtx>({ jarvisNavigate: () => {} });

export function useJarvisNavigate() {
  return useContext(Ctx).jarvisNavigate;
}

// ── Overlay ──────────────────────────────────────────────────────────────────

function TransitionOverlay({ phase, label }: { phase: Phase; label: string }) {
  if (phase === 'idle') return null;

  const opacity = phase === 'enter' ? 0 : phase === 'active' ? 1 : 0;
  const chars = '01アイウエオABCDEF0123456789';
  const rand = () => chars[Math.floor(Math.random() * chars.length)];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,6,15,0.97)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      transition: 'opacity 0.15s ease',
      opacity,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <style>{`
        @keyframes jv-scan {
          0% { top: -4px; }
          100% { top: 100%; }
        }
        @keyframes jv-flicker {
          0%,100% { opacity: 1; }
          25% { opacity: 0.3; }
          50% { opacity: 0.9; }
          75% { opacity: 0.1; }
        }
        @keyframes jv-glitch {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-1px); }
        }
        @keyframes jv-grid-expand {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 0.06; }
        }
        .jv-label { animation: jv-flicker 0.3s steps(1,end) 2, jv-glitch 0.4s ease 0.1s; }
      `}</style>

      {/* Scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, #00d4ff, #00d4ff88, transparent)',
        boxShadow: '0 0 12px #00d4ff, 0 0 24px #00d4ff44',
        animation: 'jv-scan 0.45s cubic-bezier(0.4,0,0.6,1) forwards',
        pointerEvents: 'none',
      }} />

      {/* Hex grid background */}
      <svg style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        animation: 'jv-grid-expand 0.4s ease forwards',
        pointerEvents: 'none',
      }}>
        <defs>
          <pattern id="jv-hex" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
            <polygon points="30,2 58,17 58,47 30,62 2,47 2,17"
              fill="none" stroke="#00d4ff" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#jv-hex)" />
      </svg>

      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map((pos) => {
        const s: React.CSSProperties = {
          position: 'absolute',
          ...(pos.includes('t') ? { top: 32 } : { bottom: 32 }),
          ...(pos.includes('l') ? { left: 32 } : { right: 32 }),
          transform: `scale(${pos.includes('r') ? -1 : 1}, ${pos.includes('b') ? -1 : 1})`,
        };
        return (
          <svg key={pos} width="40" height="40" viewBox="0 0 40 40" style={s}>
            <path d="M0 20 L0 0 L20 0" fill="none" stroke="#00d4ff" strokeWidth="2" strokeOpacity="0.7" />
          </svg>
        );
      })}

      {/* Random data rain — top edge */}
      <div style={{
        position: 'absolute', top: 20, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-around', padding: '0 80px',
        fontSize: 9, color: 'rgba(0,212,255,0.3)', letterSpacing: '0.1em',
        pointerEvents: 'none',
      }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i}>{Array.from({ length: 4 }, rand).join('')}</span>
        ))}
      </div>

      {/* Center content */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
        <div style={{ fontSize: 10, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.3em', marginBottom: 16 }}>
          INITIALIZING INTERFACE
        </div>
        <div className="jv-label" style={{
          fontSize: 28, color: '#00d4ff', letterSpacing: '0.2em', fontWeight: 600,
          textShadow: '0 0 30px rgba(0,212,255,0.6), 0 0 60px rgba(0,212,255,0.3)',
        }}>
          {label.toUpperCase()}
        </div>
        <div style={{
          marginTop: 16, display: 'flex', gap: 6, justifyContent: 'center',
        }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#00d4ff',
              opacity: 0.2 + i * 0.18,
              boxShadow: '0 0 4px #00d4ff',
              animation: `jv-flicker ${0.4 + i * 0.1}s ease-in-out infinite`,
            }} />
          ))}
        </div>
      </div>

      {/* Bottom data */}
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-around', padding: '0 80px',
        fontSize: 9, color: 'rgba(0,212,255,0.3)', letterSpacing: '0.1em',
        pointerEvents: 'none',
      }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i}>{Array.from({ length: 4 }, rand).join('')}</span>
        ))}
      </div>
    </div>
  );
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function TransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [label, setLabel] = useState('');
  const destRef = useRef('');

  const jarvisNavigate = useCallback((path: string, labelOverride?: string) => {
    const display = labelOverride ?? (path.replace('/', '').replace('-', ' ') || 'JARVIS');
    destRef.current = path;
    setLabel(display);

    playEngageSound();

    setPhase('enter');
    // Tiny RAF to trigger CSS transition from opacity:0
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('active'));
    });

    // Navigate mid-animation
    setTimeout(() => {
      navigate(path);
    }, 420);

    // Start exit
    setTimeout(() => {
      playArriveSound();
      setPhase('exit');
    }, 580);

    // Clean up
    setTimeout(() => {
      setPhase('idle');
    }, 750);
  }, [navigate]);

  return (
    <Ctx.Provider value={{ jarvisNavigate }}>
      {children}
      <TransitionOverlay phase={phase} label={label} />
    </Ctx.Provider>
  );
}
