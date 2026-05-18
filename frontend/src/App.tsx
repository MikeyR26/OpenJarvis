import { useEffect, useState, useCallback, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { GetStartedPage } from './pages/GetStartedPage';
import { AgentsPage } from './pages/AgentsPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { LogsPage } from './pages/LogsPage';
import { CommandPalette } from './components/CommandPalette';
import { SetupScreen } from './components/SetupScreen';
import { Toaster } from './components/ui/sonner';
import { useAppStore } from './lib/store';
import { fetchModels, fetchServerInfo, fetchSavings, submitSavings, isTauri } from './lib/api';
import { OptInModal } from './components/OptInModal';
import { MissionControlPage } from './pages/MissionControlPage';
import { JarvisPage, JarvisOrb, TimerWidget } from './pages/JarvisPage';
import { MapPage } from './pages/MapPage';
import { TransitionProvider } from './contexts/TransitionContext';
import { JarvisProvider, useJarvis } from './contexts/JarvisContext';

export default function App() {
  const [setupDone, setSetupDone] = useState(!isTauri());
  const handleSetupReady = useCallback(() => setSetupDone(true), []);
  const setModels = useAppStore((s) => s.setModels);
  const setModelsLoading = useAppStore((s) => s.setModelsLoading);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setServerInfo = useAppStore((s) => s.setServerInfo);
  const setSavings = useAppStore((s) => s.setSavings);
  const settings = useAppStore((s) => s.settings);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const optInEnabled = useAppStore((s) => s.optInEnabled);
  const optInDisplayName = useAppStore((s) => s.optInDisplayName);
  const optInEmail = useAppStore((s) => s.optInEmail);
  const optInAnonId = useAppStore((s) => s.optInAnonId);
  const optInModalSeen = useAppStore((s) => s.optInModalSeen);
  const optInModalOpen = useAppStore((s) => s.optInModalOpen);
  const setOptInModalOpen = useAppStore((s) => s.setOptInModalOpen);
  const markOptInModalSeen = useAppStore((s) => s.markOptInModalSeen);
  const savings = useAppStore((s) => s.savings);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    if (settings.theme === 'dark') root.classList.add('dark');
    else if (settings.theme === 'light') root.classList.add('light');
  }, [settings.theme]);

  // Sync overlay conversations into the main app
  const importOverlay = useAppStore((s) => s.importOverlayConversation);
  useEffect(() => {
    if (!isTauri()) return;
    importOverlay();
    const interval = setInterval(importOverlay, 5000);
    return () => clearInterval(interval);
  }, [importOverlay]);

  // Fetch models on mount
  useEffect(() => {
    fetchModels()
      .then((m) => {
        setModels(m);
        if (!selectedModel && m.length > 0) setSelectedModel(m[0].id);
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch server info
  useEffect(() => {
    fetchServerInfo().then(setServerInfo).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll savings and optionally share to Supabase
  useEffect(() => {
    const refresh = () =>
      fetchSavings()
        .then((data) => {
          setSavings(data);
          if (optInEnabled && optInDisplayName && data) {
            const claudeEntry = data.per_provider.find(
              (p) => p.provider === 'claude-opus-4.6',
            );
            const dollarSavings = claudeEntry ? claudeEntry.total_cost : 0;
            const energySaved = data.per_provider.reduce(
              (sum, p) => sum + (p.energy_wh || 0),
              0,
            );
            const flopsSaved = data.per_provider.reduce(
              (sum, p) => sum + (p.flops || 0),
              0,
            );
            submitSavings({
              anon_id: optInAnonId,
              display_name: optInDisplayName,
              email: optInEmail,
              total_calls: data.total_calls,
              total_tokens: data.total_tokens,
              dollar_savings: dollarSavings,
              energy_wh_saved: energySaved,
              flops_saved: flopsSaved,
              token_counting_version: data.token_counting_version ?? 1,
            });
          }
        })
        .catch(() => {});
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [optInEnabled, optInDisplayName, optInAnonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show opt-in modal on first visit
  useEffect(() => {
    if (!optInModalSeen) {
      setOptInModalOpen(true);
      markOptInModalSeen();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSystemPanel = useAppStore((s) => s.toggleSystemPanel);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        toggleSystemPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen, toggleSystemPanel]);

  // Desktop auto-update check — disabled during local development.
  // Re-enable for production releases by uncommenting below.
  // const updateChecked = useRef(false);
  // useEffect(() => {
  //   if (!isTauri() || updateChecked.current) return;
  //   updateChecked.current = true;
  //   (async () => {
  //     try {
  //       const { check } = await import('@tauri-apps/plugin-updater');
  //       const update = await check();
  //       if (update) {
  //         await update.downloadAndInstall();
  //         const { toast } = await import('sonner');
  //         toast.info('Update ready', {
  //           description: 'A new version has been downloaded. Restart to apply.',
  //           duration: Infinity,
  //           action: {
  //             label: 'Restart Now',
  //             onClick: async () => {
  //               const { relaunch } = await import('@tauri-apps/plugin-process');
  //               await relaunch();
  //             },
  //           },
  //         });
  //       }
  //     } catch {}
  //   })();
  // }, []);

  if (!setupDone) {
    return <SetupScreen onReady={handleSetupReady} />;
  }

  return (
    <TransitionProvider>
      <JarvisProvider>
        <AppInner
          commandPaletteOpen={commandPaletteOpen}
          setCommandPaletteOpen={setCommandPaletteOpen}
          optInModalOpen={optInModalOpen}
          setOptInModalOpen={setOptInModalOpen}
        />
      </JarvisProvider>
    </TransitionProvider>
  );
}

// ── Floating mini-orb that persists on non-home routes ────────────────────────

// Smart default positions per route — chosen to avoid page chrome
const ROUTE_POSITIONS: Record<string, () => { x: number; y: number }> = {
  '/map':             () => ({ x: 24, y: window.innerHeight - 130 }),           // bottom-left (map controls are bottom-right)
  '/mission-control': () => ({ x: window.innerWidth - 210, y: window.innerHeight - 130 }), // bottom-right (away from nav)
  default:            () => ({ x: window.innerWidth - 210, y: window.innerHeight - 130 }), // bottom-right for sidebar pages
};

function getDefaultPos(pathname: string) {
  const fn = ROUTE_POSITIONS[pathname] ?? ROUTE_POSITIONS['default'];
  return fn();
}

function FloatingOrb() {
  const { orbState, timers, speechState, handleMicClick, dismissTimer, stopStreaming } = useJarvis();
  const streamState = useAppStore((s) => s.streamState);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const location = useLocation();
  const micDisabled = !speechEnabled || streamState.isStreaming;

  // Position — top/left in px
  const [pos, setPos] = useState(() => getDefaultPos(location.pathname));
  // Per-route user overrides so Jarvis picks the right spot per page
  const userPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const orbRef = useRef<HTMLDivElement>(null);

  // When route changes, use user's saved position for that route or smart default
  useEffect(() => {
    const saved = userPosRef.current[location.pathname];
    setPos(saved ?? getDefaultPos(location.pathname));
  }, [location.pathname]);

  // Clamp to viewport on resize
  useEffect(() => {
    const onResize = () => {
      setPos((p) => ({
        x: Math.max(0, Math.min(p.x, window.innerWidth - 110)),
        y: Math.max(0, Math.min(p.y, window.innerHeight - 110)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!orbRef.current) return;
    e.preventDefault();
    const rect = orbRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragging.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const nx = Math.max(0, Math.min(ev.clientX - dragOffset.current.x, window.innerWidth - 110));
      const ny = Math.max(0, Math.min(ev.clientY - dragOffset.current.y, window.innerHeight - 110));
      setPos({ x: nx, y: ny });
    };
    const onUp = (ev: MouseEvent) => {
      dragging.current = false;
      const nx = Math.max(0, Math.min(ev.clientX - dragOffset.current.x, window.innerWidth - 110));
      const ny = Math.max(0, Math.min(ev.clientY - dragOffset.current.y, window.innerHeight - 110));
      // Snap to nearest edge with padding
      const snapX = nx < window.innerWidth / 2 ? 24 : window.innerWidth - 110;
      setPos({ x: snapX, y: ny });
      userPosRef.current[location.pathname] = { x: snapX, y: ny };
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [location.pathname]);

  const statusColor = orbState === 'listening' ? '#00ff88' : orbState === 'speaking' ? '#00d4ff' : streamState.isStreaming ? '#ffcc00' : 'rgba(0,212,255,0.5)';
  const statusText = orbState === 'listening' ? 'LISTENING' : orbState === 'speaking' ? 'SPEAKING' : streamState.isStreaming ? (streamState.phase?.replace('...', '') || 'GENERATING').toUpperCase() : 'JARVIS';

  // Label appears on left or right depending on which side of the screen we're on
  const onRightSide = pos.x > window.innerWidth / 2;

  return (
    <div
      ref={orbRef}
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 9000,
        display: 'flex', alignItems: 'center',
        flexDirection: onRightSide ? 'row-reverse' : 'row',
        gap: 8, cursor: 'grab',
        fontFamily: "'IBM Plex Mono', monospace",
        userSelect: 'none',
      } as React.CSSProperties}
    >
      {/* Orb button */}
      <div
        onClick={(e) => {
          if (dragging.current) return;
          streamState.isStreaming ? stopStreaming() : (!micDisabled && handleMicClick());
        }}
        style={{
          background: 'rgba(0,6,15,0.88)', border: '1px solid rgba(0,212,255,0.22)',
          borderRadius: '50%', padding: 5, cursor: 'pointer',
          boxShadow: orbState !== 'idle' ? '0 0 22px rgba(0,212,255,0.35)' : '0 0 8px rgba(0,0,0,0.6)',
          transition: 'box-shadow 0.3s',
          flexShrink: 0,
        }}
        title="Drag to move · Click to speak"
      >
        <JarvisOrb state={orbState} size={72} />
      </div>

      {/* Status chip */}
      <div style={{
        background: 'rgba(0,6,15,0.82)', border: '1px solid rgba(0,212,255,0.15)',
        borderRadius: 4, padding: '5px 10px', pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        <div style={{ fontSize: 8, color: statusColor, letterSpacing: '0.18em', fontWeight: 600 }}>
          {statusText}
        </div>
        {streamState.isStreaming && (
          <div style={{ fontSize: 7, color: 'rgba(0,212,255,0.35)', letterSpacing: '0.1em', marginTop: 1 }}>
            {(Math.round(streamState.elapsedMs / 100) / 10).toFixed(1)}s
          </div>
        )}
      </div>

      {/* Timers stacked below, not blocking drag */}
      {timers.length > 0 && (
        <div
          style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {timers.map((t) => <TimerWidget key={t.id} timer={t} onDismiss={() => dismissTimer(t.id)} />)}
        </div>
      )}
    </div>
  );
}

// ── Inner app with routing + floating orb ────────────────────────────────────

function AppInner({ commandPaletteOpen, setCommandPaletteOpen, optInModalOpen, setOptInModalOpen }: {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;
  optInModalOpen: boolean;
  setOptInModalOpen: (v: boolean) => void;
}) {
  const location = useLocation();
  const showFloatingOrb = location.pathname !== '/';

  return (
    <>
      <Routes>
        <Route index element={<JarvisPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="mission-control" element={<MissionControlPage />} />
        <Route element={<Layout />}>
          <Route path="chat" element={<ChatPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="get-started" element={<GetStartedPage />} />
          <Route path="data-sources" element={<DataSourcesPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="logs" element={<LogsPage />} />
        </Route>
      </Routes>
      {showFloatingOrb && <FloatingOrb />}
      <Toaster position="bottom-right" />
      {commandPaletteOpen && <CommandPalette />}
      {optInModalOpen && <OptInModal onClose={() => setOptInModalOpen(false)} />}
    </>
  );
}
