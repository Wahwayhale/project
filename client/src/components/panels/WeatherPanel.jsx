import React from 'react';
import { I } from '../Icon';

export default function WeatherPanel({
  showWeatherPanel,
  setShowWeatherPanel,
  setWeatherData,
  setWeatherCity,
  weatherCity,
  weatherLoading,
  searchWeather,
  weatherData,
  shareWeather,
}) {
  if (!showWeatherPanel) return null;

  return (
    <div className="modal-overlay" onClick={() => { setShowWeatherPanel(false); setWeatherData(null); setWeatherCity(''); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
           <h3 style={{ margin: 0 }}>天气查询</h3>
          <button onClick={() => { setShowWeatherPanel(false); setWeatherData(null); setWeatherCity(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><I name="close" size={20} /></button>
        </div>
        <form onSubmit={searchWeather} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input type="text" value={weatherCity} onChange={e => setWeatherCity(e.target.value)} placeholder="输入城市名，如：北京" style={{ flex: 1, padding: '10px 14px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', background: 'var(--bg)' }} />
          <button type="submit" disabled={weatherLoading} style={{ padding: '10px 18px', background: 'var(--primary-gradient)', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>{weatherLoading ? '查询中' : '查询'}</button>
        </form>
        {weatherLoading && <div style={{ textAlign: 'center', padding: 30 }}>查询中...</div>}
        {weatherData && !weatherLoading && (
          <div style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', borderRadius: 14, padding: 24, color: 'white' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{weatherData.city}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 56, fontWeight: 200 }}>{weatherData.temp}°</div>
              <div>
                <div style={{ fontSize: 15 }}>{weatherData.desc}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>体感 {weatherData.feelsLike}°C</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, opacity: 0.9, marginBottom: 12 }}>
              <span><I name="droplet" size={12} /> {weatherData.humidity}%</span>
              <span><I name="wind" size={12} /> {weatherData.wind}</span>
              <span><I name="stats" size={12} /> {weatherData.high}° / {weatherData.low}°</span>
            </div>
            <button onClick={shareWeather} style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>分享天气到聊天</button>
          </div>
        )}
      </div>
    </div>
  );
}
