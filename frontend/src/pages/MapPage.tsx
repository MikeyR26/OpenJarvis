import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useJarvisNavigate } from '../contexts/TransitionContext';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const INIT_PITCH = 52;
const INIT_BEARING = -18;

function CornerBracket({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const corners: Record<string, React.CSSProperties> = {
    tl: { top: 16, left: 16 },
    tr: { top: 16, right: 16, transform: 'scaleX(-1)' },
    bl: { bottom: 16, left: 16, transform: 'scaleY(-1)' },
    br: { bottom: 16, right: 16, transform: 'scale(-1,-1)' },
  };
  return (
    <svg width={28} height={28} viewBox="0 0 28 28"
      style={{ position: 'absolute', zIndex: 10, pointerEvents: 'none', ...corners[pos] }}>
      <path d="M0 14 L0 0 L14 0" fill="none" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.65" />
    </svg>
  );
}

export function MapPage() {
  const [searchParams] = useSearchParams();
  const jarvisNavigate = useJarvisNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);

  const location = searchParams.get('location') || 'Unknown Location';
  const initLat = parseFloat(searchParams.get('lat') || '51.5074');
  const initLng = parseFloat(searchParams.get('lng') || '-0.1278');
  const initZoom = parseInt(searchParams.get('zoom') || '11');

  const [coords, setCoords] = useState({ lat: initLat, lng: initLng, zoom: initZoom });
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: STYLE,
      center: [initLng, initLat],
      zoom: initZoom,
      pitch: INIT_PITCH,
      bearing: INIT_BEARING,
      attributionControl: false,
    });

    // Custom targeting marker
    const el = document.createElement('div');
    el.innerHTML = `
      <svg width="52" height="52" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
        <circle cx="26" cy="26" r="18" fill="none" stroke="#00d4ff" stroke-width="1" stroke-opacity="0.85"/>
        <circle cx="26" cy="26" r="10" fill="none" stroke="#00d4ff" stroke-width="0.5" stroke-opacity="0.4"/>
        <circle cx="26" cy="26" r="4" fill="#00d4ff" opacity="0.95"/>
        <circle cx="26" cy="26" r="2" fill="white"/>
        <line x1="26" y1="2" x2="26" y2="12" stroke="#00d4ff" stroke-width="1.5" opacity="0.85"/>
        <line x1="26" y1="40" x2="26" y2="50" stroke="#00d4ff" stroke-width="1.5" opacity="0.85"/>
        <line x1="2" y1="26" x2="12" y2="26" stroke="#00d4ff" stroke-width="1.5" opacity="0.85"/>
        <line x1="40" y1="26" x2="50" y2="26" stroke="#00d4ff" stroke-width="1.5" opacity="0.85"/>
      </svg>`;
    el.style.cssText = 'width:52px;height:52px;cursor:default;filter:drop-shadow(0 0 6px #00d4ff88)';

    new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([initLng, initLat])
      .addTo(map);

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    map.on('move', () => {
      const c = map.getCenter();
      setCoords({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });

    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  const fmt = (n: number, d = 4) => n.toFixed(d);

  return (
    <div style={{
      width: '100vw', height: '100vh', position: 'relative',
      background: '#00060f', fontFamily: "'IBM Plex Mono', monospace", overflow: 'hidden',
    }}>
      <style>{`
        .maplibregl-ctrl-group {
          background: rgba(0,6,15,0.85) !important;
          border: 1px solid rgba(0,212,255,0.25) !important;
          border-radius: 4px !important;
        }
        .maplibregl-ctrl-group button {
          background: transparent !important;
          color: #00d4ff !important;
          border-bottom: 1px solid rgba(0,212,255,0.15) !important;
        }
        .maplibregl-ctrl-group button:hover { background: rgba(0,212,255,0.1) !important; }
        .maplibregl-ctrl-compass .maplibregl-ctrl-icon { filter: invert(1) sepia(1) saturate(5) hue-rotate(160deg); }
        .maplibregl-ctrl-attrib { display: none !important; }
      `}</style>

      {/* Map canvas */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,212,255,0.012) 3px, rgba(0,212,255,0.012) 4px)',
      }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4,
        background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,6,15,0.65) 100%)',
      }} />

      <CornerBracket pos="tl" />
      <CornerBracket pos="tr" />
      <CornerBracket pos="bl" />
      <CornerBracket pos="br" />

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        background: 'linear-gradient(to bottom, rgba(0,6,15,0.9) 60%, transparent)',
        padding: '16px 60px 36px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.22em', marginBottom: 3 }}>
            TACTICAL OVERLAY · SECTOR IDENTIFIED
          </div>
          <div style={{ fontSize: 20, color: '#00d4ff', letterSpacing: '0.12em', fontWeight: 600, textShadow: '0 0 20px rgba(0,212,255,0.4)' }}>
            {location.toUpperCase()}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.35)', letterSpacing: '0.2em' }}>JARVIS MAPS</div>
          <div style={{ fontSize: 12, color: 'rgba(0,212,255,0.5)', marginTop: 3, letterSpacing: '0.1em' }}>{clock}</div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.12em', marginBottom: 3 }}>ALTITUDE</div>
          <div style={{ fontSize: 16, color: '#00d4ff', letterSpacing: '0.08em' }}>
            Z{String(Math.round(coords.zoom)).padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* Coordinates */}
      <div style={{
        position: 'absolute', bottom: 44, left: 24, zIndex: 10,
        background: 'rgba(0,6,15,0.78)', border: '1px solid rgba(0,212,255,0.2)',
        borderRadius: 4, padding: '8px 14px', backdropFilter: 'blur(4px)', pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.15em', marginBottom: 5 }}>COORDINATES</div>
        <div style={{ fontSize: 11, color: '#00d4ff', letterSpacing: '0.06em' }}>LAT  {fmt(coords.lat)}°</div>
        <div style={{ fontSize: 11, color: '#00d4ff', letterSpacing: '0.06em', marginTop: 3 }}>LNG  {fmt(coords.lng)}°</div>
      </div>

      {/* Status dots */}
      <div style={{
        position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, display: 'flex', gap: 18, alignItems: 'center', pointerEvents: 'none',
      }}>
        {['SATELLITE', 'TERRAIN', 'OVERLAY'].map((label) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 5px #00ff88' }} />
            <span style={{ fontSize: 8, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.15em' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Back button */}
      <button onClick={() => jarvisNavigate('/', 'JARVIS')}
        style={{
          position: 'absolute', bottom: 36, right: 90, zIndex: 10,
          background: 'rgba(0,6,15,0.78)', border: '1px solid rgba(0,212,255,0.3)',
          borderRadius: 4, padding: '7px 20px', color: '#00d4ff',
          fontSize: 10, letterSpacing: '0.2em', cursor: 'pointer',
          fontFamily: 'inherit', backdropFilter: 'blur(4px)', transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = '#00d4ff'; el.style.background = 'rgba(0,212,255,0.1)'; }}
        onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'rgba(0,212,255,0.3)'; el.style.background = 'rgba(0,6,15,0.78)'; }}
      >
        ← JARVIS
      </button>
    </div>
  );
}
