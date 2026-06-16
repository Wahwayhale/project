import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { isCapacitor, API_URL } from '../utils/constants';

export function usePanels({
  token,
  showToast,
  currentRoomId,
  socketRef,
}) {
  // ===== 音乐分享 =====
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [musicUrl, setMusicUrl] = useState('');

  // ===== 音乐播放器 =====
  const [musicSearch, setMusicSearch] = useState('');
  const [musicResults, setMusicResults] = useState([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [currentSong, setCurrentSong] = useState(null); // { id, name, artist, pic, url }
  const [isPlaying, setIsPlaying] = useState(false);
  const [showMusicPanel, setShowMusicPanel] = useState(false);
  const [musicLyric, setMusicLyric] = useState('');
  const audioRef = useRef(null);

  // ===== GIF =====
  const [showGifPanel, setShowGifPanel] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);

  // ===== News =====
  const [showNewsPanel, setShowNewsPanel] = useState(false);
  const [newsStories, setNewsStories] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // ===== Quote =====
  const [dailyQuote, setDailyQuote] = useState(null);

  // ===== Events =====
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventTime, setEventTime] = useState('');

  // ===== Weather =====
  const [showWeatherPanel, setShowWeatherPanel] = useState(false);
  const [weatherCity, setWeatherCity] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // ===== Map =====
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [showMapViewer, setShowMapViewer] = useState(null); // { lat, lng, name }
  const [mapSearch, setMapSearch] = useState('');
  const [mapResults, setMapResults] = useState([]);

  // ===== Bilibili =====
  const [bilibiliQuery, setBilibiliQuery] = useState('');
  const [bilibiliResults, setBilibiliResults] = useState([]);
  const [bilibiliLoading, setBilibiliLoading] = useState(false);
  const [selectedBiliVideo, setSelectedBiliVideo] = useState(null);
  const [popularVideos, setPopularVideos] = useState([]);

  // ===== Notifications =====
  const [notifyEnabled, setNotifyEnabled] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const [notifyMuted, setNotifyMuted] = useState(false);
  const notifyRef = useRef({ enabled: notifyEnabled, muted: notifyMuted });
  useEffect(() => { notifyRef.current = { enabled: notifyEnabled, muted: notifyMuted }; }, [notifyEnabled, notifyMuted]);

  // ===== 视频离开视口自动暂停 =====
  const videoObserverRef = useRef(null);
  const observeVideo = (el) => {
    if (el && videoObserverRef.current) {
      videoObserverRef.current.observe(el);
    }
  };

  useEffect(() => {
    videoObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          // 离开视口 → 暂停视频
          const video = entry.target.tagName === 'VIDEO' ? entry.target : entry.target.querySelector('video');
          if (video && !video.paused) video.pause();
          // 离开视口 → 卸载 B站 iframe
          const iframe = entry.target.tagName === 'IFRAME' ? entry.target : entry.target.querySelector('iframe');
          if (iframe && iframe.src && iframe.src.includes('bilibili')) {
            iframe.setAttribute('data-src', iframe.src);
            iframe.removeAttribute('src');
          }
        } else {
          // 回到视口 → 恢复 B站 iframe
          const iframe = entry.target.tagName === 'IFRAME' ? entry.target : entry.target.querySelector('iframe');
          if (iframe && !iframe.src && iframe.getAttribute('data-src')) {
            iframe.src = iframe.getAttribute('data-src');
          }
        }
      });
    }, { rootMargin: '200px' });
    return () => videoObserverRef.current?.disconnect();
  }, []);

  // ===== 音乐播放器函数 =====
  const searchMusic = async (e) => {
    e?.preventDefault();
    if (!musicSearch.trim() || musicLoading) return;
    setMusicLoading(true);
    setMusicResults([]);
    try {
      const res = await axios.get(`${API_URL}/api/music/search`, {
        params: { keyword: musicSearch.trim() },
        headers: { Authorization: token }
      });
      setMusicResults(res.data.songs || []);
    } catch (err) {
      showToast('搜索失败', 'error');
    } finally {
      setMusicLoading(false);
    }
  };

  const playSong = async (song) => {
    try {
      const res = await axios.get(`${API_URL}/api/music/url/${song.id}`, {
        headers: { Authorization: token }
      });
      const url = res.data.url;
      if (!url) { showToast('暂无播放地址', 'error'); return; }
      setCurrentSong({ ...song, url });
      setIsPlaying(true);
      // 延迟播放，等 audio 元素挂载
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play().catch(() => showToast('播放失败', 'error'));
        }
      }, 100);
      // 获取歌词
      axios.get(`${API_URL}/api/music/lyric/${song.id}`, { headers: { Authorization: token } })
        .then(r => setMusicLyric(r.data.lyric || ''))
        .catch(() => setMusicLyric(''));
    } catch (err) {
      showToast('获取播放地址失败', 'error');
    }
  };

  const shareSongToChat = (song) => {
    if (!currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    const content = ` ${song.name} - ${song.artist}\n${song.url || ''}`;
    socketRef.current?.emit('sendMessage', {
      roomId: currentRoomId,
      content,
      type: 'text'
    });
    showToast('已分享到聊天', 'success');
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentSong) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // ===== GIF 函数 =====
  const searchGif = async (e) => {
    e?.preventDefault();
    if (!gifSearch.trim() || gifLoading) return;
    setGifLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/giphy/search`, { params: { q: gifSearch.trim() }, headers: { Authorization: token } });
      setGifResults(res.data.gifs || []);
    } catch { setGifResults([]); }
    finally { setGifLoading(false); }
  };

  const sendGif = (gif) => {
    if (!currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    socketRef.current?.emit('sendMessage', { roomId: currentRoomId, content: '', type: 'image', fileUrl: gif.url, filename: 'gif', mimeType: 'image/gif' });
    setShowGifPanel(false); setGifSearch(''); setGifResults([]);
  };

  // ===== News 函数 =====
  const fetchNews = async () => {
    setNewsLoading(true); setShowNewsPanel(true);
    try {
      const res = await axios.get(`${API_URL}/api/news/hot`, { headers: { Authorization: token } });
      setNewsStories(res.data.stories || []);
    } catch { setNewsStories([]); }
    finally { setNewsLoading(false); }
  };

  const shareNews = (story) => {
    if (!currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    socketRef.current?.emit('sendMessage', { roomId: currentRoomId, content: `${story.title}\n${story.url}`, type: 'text' });
    showToast('已分享', 'success');
  };

  // ===== Quote 函数 =====
  const fetchQuote = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/quote/random`, { headers: { Authorization: token } });
      setDailyQuote(res.data);
    } catch {}
  };

  // ===== Events 函数 =====
  const createEvent = () => {
    if (!currentRoomId || !eventTitle.trim() || !eventTime) return;
    axios.post(`${API_URL}/api/events/create`, { roomId: currentRoomId, title: eventTitle.trim(), time: eventTime }, { headers: { Authorization: token } })
      .then(() => { setShowEventModal(false); setEventTitle(''); setEventTime(''); showToast('日程已创建', 'success'); })
      .catch(e => showToast(e.response?.data?.error || '创建失败', 'error'));
  };

  // ===== Notifications 函数 =====
  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') { showToast('此浏览器不支持桌面通知', 'error'); return; }
    try {
      const perm = await Notification.requestPermission();
      setNotifyEnabled(perm === 'granted');
      if (perm === 'granted') showToast('桌面通知已开启', 'success');
    } catch { showToast('浏览器不支持通知', 'error'); }
  };

  // ===== Weather 函数 =====
  const searchWeather = async (e) => {
    e?.preventDefault();
    if (!weatherCity.trim() || weatherLoading) return;
    setWeatherLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/weather/${encodeURIComponent(weatherCity.trim())}`, { headers: { Authorization: token } });
      setWeatherData(res.data);
    } catch { showToast('天气查询失败', 'error'); }
    finally { setWeatherLoading(false); }
  };

  const shareWeather = () => {
    if (!currentRoomId || !weatherData) return;
    const w = weatherData;
    const content = `${w.city} 天气 | ${w.temp}°C (体感 ${w.feelsLike}°C) | ${w.desc} | 湿度 ${w.humidity}% | 风速 ${w.wind} | ${w.high}°C / ${w.low}°C`;
    socketRef.current?.emit('sendMessage', { roomId: currentRoomId, content, type: 'text' });
    showToast('已分享天气', 'success');
  };

  // ===== Map 函数 =====
  const searchMap = async (e) => {
    e?.preventDefault();
    if (!mapSearch.trim() || mapLoading) return;
    setMapLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/map/poi`, { params: { keyword: mapSearch.trim() }, headers: { Authorization: token } });
      setMapResults(res.data.pois || []);
    } catch { setMapResults([]); showToast('搜索失败', 'error'); }
    finally { setMapLoading(false); }
  };

  const getMyLocation = async () => {
    setMapLoading(true);
    try {
      let lat, lng;
      if (isCapacitor) {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ timeout: 10000, enableHighAccuracy: true });
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } else if (navigator.geolocation) {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true });
        });
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } else { showToast('不支持定位', 'error'); setMapLoading(false); return; }
      setShowMapViewer({ lat, lng, name: '我的位置' });
    } catch { showToast('定位失败', 'error'); }
    setMapLoading(false);
  };

  const shareMap = (poi) => {
    if (!currentRoomId) { showToast('请先选择聊天室', 'error'); return; }
    const mapUrl = `${API_URL}/api/map/static?lat=${poi.lat}&lng=${poi.lng}&zoom=16`;
    socketRef.current?.emit('sendMessage', { roomId: currentRoomId, content: `${poi.name || poi.fullName}\n${mapUrl}`, type: 'text' });
    setShowMapPanel(false); setShowMapViewer(null);
    showToast('已分享', 'success');
  };

  // ===== Bilibili 函数 =====
  const fetchPopularVideos = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/bilibili/popular`, {
        headers: { Authorization: token }
      });
      if (res.data.code === 0 && res.data.data?.list) {
        setPopularVideos(res.data.data.list.map(v => ({
          bvid: v.bvid,
          title: v.title,
          author: v.owner?.name,
          pic: v.pic ? `${API_URL}/api/bilibili/proxy-image?url=${encodeURIComponent(v.pic)}` : '',
          play: v.stat?.view || 0,
          duration: v.duration ? `${Math.floor(v.duration/60)}:${String(v.duration%60).padStart(2,'0')}` : '',
          description: v.desc || ''
        })));
      }
    } catch (err) {
      console.error('获取热门视频失败', err);
    }
  };

  const searchBilibili = async (e) => {
    e?.preventDefault();
    if (!bilibiliQuery.trim()) return;
    setBilibiliLoading(true);
    try {
      const res = await axios.get(
        `${API_URL}/api/bilibili/search`,
        {
          params: { keyword: bilibiliQuery.trim() },
          headers: { Authorization: token }
        }
      );
      if (res.data.code === 0 && res.data.data?.result) {
        setBilibiliResults(res.data.data.result.map(v => ({
          bvid: v.bvid,
          title: v.title.replace(/<[^>]*>/g, ''),
          author: v.author,
          pic: v.pic ? `${API_URL}/api/bilibili/proxy-image?url=${encodeURIComponent(v.pic)}` : '',
          play: v.play,
          duration: v.duration,
          description: v.description?.replace(/<[^>]*>/g, '') || ''
        })));
      } else {
        setBilibiliResults([]);
        showToast('没有搜索结果', 'info');
      }
    } catch (err) {
      console.error('B站搜索失败', err);
      setBilibiliResults([]);
      alert('搜索失败：' + (err.response?.data?.error || err.message));
    }
    setBilibiliLoading(false);
  };

  const shareBilibiliToChat = (video) => {
    const url = `https://www.bilibili.com/video/${video.bvid}`;
    if (currentRoomId) {
      socketRef.current.emit('sendMessage', {
        roomId: currentRoomId,
        content: url,
        type: 'text'
      });
      showToast('已分享到聊天', 'success');
    } else {
      showToast('请先选择聊天室', 'error');
    }
  };

  return {
    // Music (simple share)
    showMusicModal, setShowMusicModal,
    musicUrl, setMusicUrl,
    // Music player
    musicSearch, setMusicSearch,
    musicResults, setMusicResults,
    musicLoading, setMusicLoading,
    currentSong, setCurrentSong,
    isPlaying, setIsPlaying,
    showMusicPanel, setShowMusicPanel,
    musicLyric, setMusicLyric,
    audioRef,
    // GIF
    showGifPanel, setShowGifPanel,
    gifSearch, setGifSearch,
    gifResults, setGifResults,
    gifLoading, setGifLoading,
    // News
    showNewsPanel, setShowNewsPanel,
    newsStories, setNewsStories,
    newsLoading, setNewsLoading,
    // Quote
    dailyQuote, setDailyQuote,
    // Events
    showEventModal, setShowEventModal,
    eventTitle, setEventTitle,
    eventTime, setEventTime,
    // Weather
    showWeatherPanel, setShowWeatherPanel,
    weatherCity, setWeatherCity,
    weatherData, setWeatherData,
    weatherLoading, setWeatherLoading,
    // Map
    showMapPanel, setShowMapPanel,
    mapLoading, setMapLoading,
    showMapViewer, setShowMapViewer,
    mapSearch, setMapSearch,
    mapResults, setMapResults,
    // Bilibili
    bilibiliQuery, setBilibiliQuery,
    bilibiliResults, setBilibiliResults,
    bilibiliLoading, setBilibiliLoading,
    selectedBiliVideo, setSelectedBiliVideo,
    popularVideos, setPopularVideos,
    // Notifications
    notifyEnabled, setNotifyEnabled,
    notifyMuted, setNotifyMuted,
    notifyRef,
    // Video observer
    videoObserverRef,
    observeVideo,
    // Music functions
    searchMusic,
    playSong,
    shareSongToChat,
    togglePlay,
    // GIF functions
    searchGif,
    sendGif,
    // News functions
    fetchNews,
    shareNews,
    // Quote functions
    fetchQuote,
    // Events functions
    createEvent,
    // Notifications functions
    enableNotifications,
    // Weather functions
    searchWeather,
    shareWeather,
    // Map functions
    searchMap,
    getMyLocation,
    shareMap,
    // Bilibili functions
    fetchPopularVideos,
    searchBilibili,
    shareBilibiliToChat,
  };
}
