import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../lib/store';
import { getBase, fetchSystemStats, fetchWeather, type SystemStats, type WeatherData } from '../lib/api';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  return (
    <div className="text-center">
      <div style={{ fontFamily: 'var(--font-hud)', fontSize: '4rem', color: '#00d4ff', letterSpacing: '0.15em', textShadow: '0 0 20px rgba(0,212,255,0.8)' }}>
        {hh}<span style={{ opacity: 0.6, animation: 'blink 1s step-end infinite' }}>:</span>{mm}<span style={{ fontSize: '2rem', opacity: 0.7 }}>:{ss}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-hud)', fontSize: '0.75rem', color: 'rgba(0,212,255,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
        {date}
      </div>
    </div>
  );
}

function HudArc({ cx, cy, r, startAngle, endAngle, color, strokeWidth = 2, dash = '' }: {
  cx: number; cy: number; r: number; startAngle: number; endAngle: number;
  color: string; strokeWidth?: number; dash?: string;
}) {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return (
    <path
      d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeDasharray={dash}
      strokeLinecap="round"
    />
  );
}

function RadialGauge({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = Math.min(value / max, 1);
  const sweep = pct * 240;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <HudArc cx={50} cy={55} r={38} startAngle={-120} endAngle={120} color="rgba(0,212,255,0.1)" strokeWidth={6} />
        <HudArc cx={50} cy={55} r={38} startAngle={-120} endAngle={-120 + sweep} color={color} strokeWidth={6} />
        <text x="50" y="52" textAnchor="middle" fill={color} fontFamily="var(--font-hud)" fontSize="14" fontWeight="bold">
          {Math.round(pct * 100)}%
        </text>
        <text x="50" y="64" textAnchor="middle" fill="rgba(0,212,255,0.4)" fontFamily="var(--font-hud)" fontSize="7">
          {label}
        </text>
      </svg>
    </div>
  );
}

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: active ? '#00ff88' : '#333',
        boxShadow: active ? '0 0 8px #00ff88' : 'none',
      }} />
      <span style={{ fontFamily: 'var(--font-hud)', fontSize: '0.7rem', color: active ? 'rgba(0,255,136,0.8)' : 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

const MC_CHANNEL = 'jarvis_mc';

type MCMessage = { id: string; role: string; content: string };

function ConversationFeed() {
  // Seed from local Zustand store (handles same-window and initial load from localStorage)
  const storeMessages = useAppStore((s) => s.messages);
  const storeStream = useAppStore((s) => s.streamState);

  const [msgs, setMsgs] = useState<MCMessage[]>(storeMessages);
  const [liveContent, setLiveContent] = useState('');
  const [liveStreaming, setLiveStreaming] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Keep in sync when running in the same window
  useEffect(() => {
    setMsgs(storeMessages);
  }, [storeMessages]);
  useEffect(() => {
    if (storeStream.isStreaming) {
      setLiveContent(storeStream.content || '');
      setLiveStreaming(true);
    } else {
      setLiveStreaming(false);
    }
  }, [storeStream.isStreaming, storeStream.content]);

  // Listen to BroadcastChannel for cross-window updates (Mission Control in separate window)
  useEffect(() => {
    let bc: BroadcastChannel;
    try {
      bc = new BroadcastChannel(MC_CHANNEL);
      bc.onmessage = (e) => {
        const { type } = e.data;
        if (type === 'messages') {
          setMsgs(e.data.messages || []);
        } else if (type === 'stream') {
          if (e.data.isStreaming) {
            setLiveContent(e.data.content || '');
            setLiveStreaming(true);
          } else {
            setLiveStreaming(false);
          }
        }
      };
    } catch {}
    return () => { try { bc?.close(); } catch {} };
  }, []);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [msgs.length, liveContent]);

  return (
    <div ref={feedRef} className="flex flex-col gap-3 overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 340px)', paddingRight: 4, scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,212,255,0.2) transparent' }}>
      {msgs.length === 0 && (
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '0.6rem', color: 'rgba(0,212,255,0.2)', letterSpacing: '0.15em', textAlign: 'center', marginTop: 20 }}>
          NO CONVERSATION YET
        </div>
      )}
      {msgs.map((m, idx) => {
        const isLive = m.role === 'assistant' && idx === msgs.length - 1 && liveStreaming;
        const content = isLive ? (liveContent || m.content) : m.content;
        return (
          <div key={m.id} className="flex flex-col gap-1">
            <div style={{
              fontFamily: 'var(--font-hud)', fontSize: '0.55rem', letterSpacing: '0.2em',
              color: m.role === 'user' ? 'rgba(0,212,255,0.45)' : 'rgba(0,255,136,0.45)',
              textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {m.role === 'user' ? '▶ SIR' : '▶ JARVIS'}
              {isLive && <span style={{ animation: 'blink 0.8s step-end infinite' }}>█</span>}
            </div>
            <div style={{
              fontFamily: 'var(--font-hud)', fontSize: '0.72rem',
              color: m.role === 'user' ? 'rgba(0,212,255,0.85)' : 'rgba(0,255,136,0.85)',
              lineHeight: 1.5, paddingLeft: 8,
              borderLeft: `1px solid ${m.role === 'user' ? 'rgba(0,212,255,0.15)' : 'rgba(0,255,136,0.15)'}`,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SystemPanel() {
  const [stats, setStats] = useState<SystemStats>({});
  const [weather, setWeather] = useState<WeatherData>({});
  const serverInfo = useAppStore((s) => s.serverInfo);

  useEffect(() => {
    fetchSystemStats().then(setStats);
    fetchWeather().then(setWeather);
    const statsTimer = setInterval(() => fetchSystemStats().then(setStats), 3000);
    const weatherTimer = setInterval(() => fetchWeather().then(setWeather), 120000);
    return () => { clearInterval(statsTimer); clearInterval(weatherTimer); };
  }, []);

  const hasGpu = stats.gpu_percent !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>SYSTEM RESOURCES</SectionLabel>
      <div className="flex gap-2 justify-center flex-wrap">
        <RadialGauge value={stats.cpu_percent ?? 0} max={100} label="CPU" color="#00d4ff" />
        <RadialGauge value={stats.ram_percent ?? 0} max={100} label="RAM" color="#00ff88" />
        {hasGpu && (
          <RadialGauge value={stats.gpu_percent ?? 0} max={100} label="GPU" color="#ff9d00" />
        )}
      </div>
      {stats.ram_total_gb && (
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '0.6rem', color: 'rgba(0,212,255,0.35)', textAlign: 'center', letterSpacing: '0.1em' }}>
          RAM {stats.ram_used_gb}GB / {stats.ram_total_gb}GB
          {hasGpu && stats.gpu_vram_used_mb !== undefined && ` · VRAM ${Math.round(stats.gpu_vram_used_mb)}/${Math.round(stats.gpu_vram_total_mb ?? 0)}MB`}
        </div>
      )}

      {weather.temp_c !== undefined && !weather.error && (
        <>
          <SectionLabel>WEATHER</SectionLabel>
          <div style={{ fontFamily: 'var(--font-hud)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', color: '#00d4ff', letterSpacing: '0.05em', lineHeight: 1 }}>
              {weather.temp_c}°C
            </div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(0,212,255,0.6)', marginTop: 2 }}>
              {weather.description}
            </div>
            <div style={{ fontSize: '0.55rem', color: 'rgba(0,212,255,0.35)', marginTop: 2, letterSpacing: '0.1em' }}>
              {weather.city}{weather.country ? `, ${weather.country}` : ''} · FEELS {weather.feels_c}°C · HUM {weather.humidity}%
            </div>
          </div>
        </>
      )}

      {serverInfo && (
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '0.6rem', color: 'rgba(0,212,255,0.35)', textAlign: 'center', letterSpacing: '0.1em', marginTop: 4 }}>
          ENGINE: {serverInfo.engine?.toUpperCase() ?? '—'} · MODEL: {serverInfo.model?.split('-').slice(0, 2).join('-')?.toUpperCase() ?? '—'}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-hud)', fontSize: '0.6rem', letterSpacing: '0.25em',
      color: 'rgba(0,212,255,0.35)', textTransform: 'uppercase',
      borderBottom: '1px solid rgba(0,212,255,0.1)', paddingBottom: 4, marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(0,10,20,0.85)',
      border: '1px solid rgba(0,212,255,0.15)',
      borderRadius: 4,
      padding: '16px 20px',
      boxShadow: '0 0 20px rgba(0,212,255,0.05), inset 0 0 20px rgba(0,0,0,0.5)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function CentralHUD() {
  const streamState = useAppStore((s) => s.streamState);
  const isStreaming = streamState.isStreaming;
  const tick = useRef(0);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      tick.current += 1;
      forceUpdate(tick.current);
    }, 50);
    return () => clearInterval(t);
  }, []);

  const angle = (tick.current * 2) % 360;
  const breathe = 0.5 + 0.5 * Math.sin(tick.current * 0.04);

  return (
    <svg width="340" height="340" viewBox="0 0 340 340" style={{ filter: 'drop-shadow(0 0 12px rgba(0,212,255,0.4))' }}>
      {/* Outer rings */}
      <HudArc cx={170} cy={170} r={155} startAngle={0} endAngle={300} color="rgba(0,212,255,0.08)" strokeWidth={1} />
      <HudArc cx={170} cy={170} r={155} startAngle={angle} endAngle={angle + 60} color="rgba(0,212,255,0.4)" strokeWidth={1} />

      <HudArc cx={170} cy={170} r={140} startAngle={20} endAngle={340} color="rgba(0,212,255,0.05)" strokeWidth={1} dash="4 8" />

      {/* Middle ring */}
      <HudArc cx={170} cy={170} r={120} startAngle={0} endAngle={360} color="rgba(0,212,255,0.06)" strokeWidth={2} />
      <HudArc cx={170} cy={170} r={120} startAngle={-angle * 0.7} endAngle={-angle * 0.7 + 90} color="rgba(0,255,136,0.3)" strokeWidth={2} />

      {/* Inner rings */}
      <HudArc cx={170} cy={170} r={90} startAngle={0} endAngle={360} color="rgba(0,212,255,0.08)" strokeWidth={1} dash="2 6" />
      <HudArc cx={170} cy={170} r={70} startAngle={0} endAngle={240} color="rgba(0,212,255,0.1)" strokeWidth={3} />
      <HudArc cx={170} cy={170} r={70} startAngle={angle * 1.5} endAngle={angle * 1.5 + 40} color="#00d4ff" strokeWidth={3} />

      {/* Core glow */}
      <circle cx={170} cy={170} r={35}
        fill={`rgba(0,212,255,${0.04 + breathe * 0.06})`}
        stroke={`rgba(0,212,255,${0.3 + breathe * 0.4})`}
        strokeWidth={isStreaming ? 2 : 1}
      />
      <circle cx={170} cy={170} r={22}
        fill={`rgba(0,${isStreaming ? 255 : 212},${isStreaming ? 136 : 255},${0.08 + breathe * 0.1})`}
        stroke={`rgba(0,${isStreaming ? 255 : 212},${isStreaming ? 136 : 255},${0.5 + breathe * 0.5})`}
        strokeWidth={1.5}
      />

      {/* J center */}
      <text x="170" y="176" textAnchor="middle"
        fill={isStreaming ? `rgba(0,255,136,${0.7 + breathe * 0.3})` : `rgba(0,212,255,${0.7 + breathe * 0.3})`}
        fontFamily="var(--font-display)" fontSize="20" fontWeight="bold" letterSpacing="2">
        J
      </text>

      {/* Tick marks */}
      {Array.from({ length: 36 }).map((_, i) => {
        const a = (i * 10 - 90) * (Math.PI / 180);
        const r1 = i % 9 === 0 ? 148 : i % 3 === 0 ? 150 : 152;
        const r2 = 155;
        return (
          <line key={i}
            x1={170 + r1 * Math.cos(a)} y1={170 + r1 * Math.sin(a)}
            x2={170 + r2 * Math.cos(a)} y2={170 + r2 * Math.sin(a)}
            stroke={`rgba(0,212,255,${i % 9 === 0 ? 0.5 : 0.2})`} strokeWidth={i % 9 === 0 ? 2 : 1}
          />
        );
      })}

      {/* Status text */}
      <text x="170" y="218" textAnchor="middle"
        fill={isStreaming ? 'rgba(0,255,136,0.6)' : 'rgba(0,212,255,0.3)'}
        fontFamily="var(--font-hud)" fontSize="7" letterSpacing="3">
        {isStreaming ? 'PROCESSING' : 'STANDBY'}
      </text>
    </svg>
  );
}

export function MissionControlPage() {
  const streamState = useAppStore((s) => s.streamState);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const messages = useAppStore((s) => s.messages);

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#00060f',
      display: 'grid',
      gridTemplateColumns: '280px 1fr 280px',
      gridTemplateRows: 'auto 1fr auto',
      gap: 12, padding: 16,
      fontFamily: 'var(--font-hud)',
    }}>
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
        @keyframes scanline {
          0% { transform: translateY(-100%) }
          100% { transform: translateY(100vh) }
        }
      `}</style>

      {/* Scanline overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }} />

      {/* TOP BAR */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: 'rgba(0,212,255,0.3)', textTransform: 'uppercase' }}>
          STARK INDUSTRIES · JARVIS OS · v1.0
        </div>
        <Clock />
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: 'rgba(0,212,255,0.3)', textTransform: 'uppercase' }}>
          SYSTEM NOMINAL
        </div>
      </div>

      {/* LEFT PANEL */}
      <div className="flex flex-col gap-3">
        <Panel>
          <SectionLabel>SYSTEM STATUS</SectionLabel>
          <div className="flex flex-col gap-2 mt-2">
            <StatusDot active={true} label="API Engine" />
            <StatusDot active={true} label="Orchestrator" />
            <StatusDot active={!!serverInfo} label="Server" />
            <StatusDot active={streamState.isStreaming} label="Generating" />
            <StatusDot active={messages.length > 0} label="Session Active" />
          </div>
        </Panel>
        <Panel style={{ flex: 1 }}>
          <SystemPanel />
        </Panel>
        <Panel>
          <SectionLabel>SESSION</SectionLabel>
          <div className="flex flex-col gap-1 mt-1">
            {[
              ['MESSAGES', messages.length],
              ['MODEL', serverInfo?.model?.split('-').slice(0, 2).join('-') ?? '—'],
              ['ENGINE', serverInfo?.engine?.toUpperCase() ?? '—'],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between">
                <span style={{ fontSize: '0.6rem', color: 'rgba(0,212,255,0.35)', letterSpacing: '0.15em' }}>{k}</span>
                <span style={{ fontSize: '0.6rem', color: 'rgba(0,212,255,0.7)', letterSpacing: '0.1em' }}>{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* CENTER */}
      <div className="flex flex-col items-center justify-center gap-6">
        <CentralHUD />
        <Panel style={{ width: '100%', maxWidth: 400 }}>
          <SectionLabel>PHASE STATUS</SectionLabel>
          <div className="flex flex-col gap-1 mt-1">
            {[
              ['Phase 1', 'Claude API + Tavily', true],
              ['Phase 2', 'Voice I/O Pipeline', true],
              ['Phase 3', 'Mission Control HUD', true],
            ].map(([phase, desc, done]) => (
              <div key={String(phase)} className="flex items-center gap-2">
                <span style={{ fontSize: '0.55rem', color: done ? 'rgba(0,255,136,0.8)' : 'rgba(0,212,255,0.3)', letterSpacing: '0.1em' }}>
                  {done ? '✓' : '○'} {phase}
                </span>
                <span style={{ fontSize: '0.55rem', color: 'rgba(0,212,255,0.3)', letterSpacing: '0.05em' }}>— {desc}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex flex-col gap-3">
        <Panel style={{ flex: 1 }}>
          <SectionLabel>CONVERSATION FEED</SectionLabel>
          <div className="mt-2">
            <ConversationFeed />
          </div>
        </Panel>
        <Panel>
          <SectionLabel>ACTIVE TOOLS</SectionLabel>
          <div className="flex flex-col gap-1 mt-1">
            {streamState.activeToolCalls.length > 0
              ? streamState.activeToolCalls.map((tc) => (
                  <div key={tc.id} style={{ fontSize: '0.65rem', color: 'rgba(0,255,136,0.7)', letterSpacing: '0.1em' }}>
                    ▶ {tc.tool}
                  </div>
                ))
              : <div style={{ fontSize: '0.6rem', color: 'rgba(0,212,255,0.2)', letterSpacing: '0.1em' }}>NO ACTIVE TOOLS</div>
            }
          </div>
        </Panel>
      </div>

      {/* BOTTOM BAR — nav links */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', gap: 12 }}>
        {[
          { label: 'JARVIS', href: '/' },
          { label: 'DASHBOARD', href: '/dashboard' },
          { label: 'SETTINGS', href: '/settings' },
          { label: 'AGENTS', href: '/agents' },
          { label: 'LOGS', href: '/logs' },
          { label: 'DATA SOURCES', href: '/data-sources' },
        ].map(({ label, href }) => (
          <a key={label} href={href} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 14px', borderRadius: 20,
            border: '1px solid rgba(0,212,255,0.2)',
            color: 'rgba(0,212,255,0.5)',
            fontSize: '0.55rem', letterSpacing: '0.18em', textTransform: 'uppercase',
            textDecoration: 'none', fontFamily: 'var(--font-hud)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,255,0.6)'; (e.currentTarget as HTMLElement).style.color = '#00d4ff'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,255,0.2)'; (e.currentTarget as HTMLElement).style.color = 'rgba(0,212,255,0.5)'; }}
          >
            {label === 'JARVIS' && <span style={{ fontSize: 8 }}>◈</span>}
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
