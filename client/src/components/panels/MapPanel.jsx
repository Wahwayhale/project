import React from 'react';
import { I } from '../Icon';

export default function MapPanel({
  showMapPanel,
  setShowMapPanel,
  setShowMapViewer,
  setMapResults,
  mapSearch,
  setMapSearch,
  mapLoading,
  searchMap,
  getMyLocation,
  mapResults,
  showMapViewer,
  shareMap,
  isCapacitor,
  API_URL,
}) {
  if (!showMapPanel) return null;

  return (
    <div className="modal-overlay" onClick={() => { setShowMapPanel(false); setShowMapViewer(null); setMapResults([]); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}><I name="location" size={20} /> 地图</h3>
          <button onClick={() => { setShowMapPanel(false); setShowMapViewer(null); setMapResults([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={20} /></button>
        </div>
        {/* 搜索栏 */}
        <form onSubmit={searchMap} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="text" value={mapSearch} onChange={e => setMapSearch(e.target.value)} placeholder="搜索地点..." style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'var(--bg)' }} />
          <button type="submit" disabled={mapLoading} style={{ padding: '10px 16px', background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>{mapLoading ? '搜索中' : '搜索'}</button>
          <button type="button" onClick={getMyLocation} disabled={mapLoading} title="GPS定位" style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}><I name="location" size={18} /></button>
        </form>
        {/* 搜索结果 */}
        {mapResults.length > 0 && !showMapViewer && (
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
            {mapResults.map((poi, i) => (
              <div key={i} onClick={() => setShowMapViewer({ lat: poi.lat, lng: poi.lng, name: poi.name })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <I name="location" size={16} color="var(--primary)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{poi.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{poi.fullName}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setShowMapViewer({ lat: poi.lat, lng: poi.lng, name: poi.name }); shareMap({ lat: poi.lat, lng: poi.lng, name: poi.name, fullName: poi.fullName }); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="forward" size={16} /></button>
              </div>
            ))}
          </div>
        )}
        {/* 地图视图 */}
        {showMapViewer ? (
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg)', fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><I name="location" size={14} /> {showMapViewer.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => shareMap(showMapViewer)} style={{ background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>分享</button>
                <button onClick={() => setShowMapViewer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={14} /></button>
              </div>
            </div>
            {isCapacitor ? (
              <div onClick={() => window.open(`${API_URL}/api/map/static?lat=${showMapViewer.lat}&lng=${showMapViewer.lng}&zoom=17`, '_system')}
                style={{ width: '100%', height: 200, background: '#e8e8e8', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexDirection: 'column', gap: 8 }}>
                <I name="location" size={36} color="var(--primary)" />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>点击查看地图</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{showMapViewer.lat.toFixed(4)}, {showMapViewer.lng.toFixed(4)}</span>
              </div>
            ) : (
              <iframe src={`${API_URL}/api/map/static?lat=${showMapViewer.lat}&lng=${showMapViewer.lng}&zoom=17`} title="高德地图" style={{ width: '100%', height: 350, border: 'none' }} />
            )}
          </div>
        ) : mapResults.length === 0 && !mapLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}><I name="location" size={64} /></div>
            <div>搜索地点或点击 GPS 获取当前位置</div>
          </div>
        )}
      </div>
    </div>
  );
}
