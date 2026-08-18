import { useState, useEffect, useCallback } from 'react';

export function useSettings() {
  // 强制关闭深色模式，避免浅色文字看不清
  localStorage.removeItem('darkMode');
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('chatFontSize') || '15'));
  const [themePreset, setThemePreset] = useState(() => localStorage.getItem('themePreset') || 'mint');
  const [chatBackgrounds, setChatBackgrounds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('chatBackgrounds') || '{}'); } catch { return {}; }
  });
  const [mutedRooms, setMutedRooms] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mutedRooms') || '[]')); } catch { return new Set(); }
  });
  const [starredMessages, setStarredMessages] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('starredMessages') || '[]')); } catch { return new Set(); }
  });
  const [pinnedMessages, setPinnedMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinnedMessages') || '{}'); } catch { return {}; }
  });
  const [roomAnnouncements, setRoomAnnouncements] = useState(() => {
    try { return JSON.parse(localStorage.getItem('roomAnnouncements') || '{}'); } catch { return {}; }
  });
  const [pinnedChats, setPinnedChats] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pinnedChats') || '[]')); } catch { return new Set(); }
  });

  // Persist to localStorage
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => { localStorage.setItem('chatFontSize', fontSize.toString()); }, [fontSize]);
  useEffect(() => { localStorage.setItem('themePreset', themePreset); }, [themePreset]);
  useEffect(() => { localStorage.setItem('chatBackgrounds', JSON.stringify(chatBackgrounds)); }, [chatBackgrounds]);
  useEffect(() => { localStorage.setItem('mutedRooms', JSON.stringify([...mutedRooms])); }, [mutedRooms]);
  useEffect(() => { localStorage.setItem('starredMessages', JSON.stringify([...starredMessages])); }, [starredMessages]);
  useEffect(() => { localStorage.setItem('pinnedMessages', JSON.stringify(pinnedMessages)); }, [pinnedMessages]);
  useEffect(() => { localStorage.setItem('roomAnnouncements', JSON.stringify(roomAnnouncements)); }, [roomAnnouncements]);
  useEffect(() => { localStorage.setItem('pinnedChats', JSON.stringify([...pinnedChats])); }, [pinnedChats]);

  const toggleDarkMode = useCallback(() => setDarkMode(d => !d), []);
  const toggleStarMessage = useCallback((id) => {
    setStarredMessages(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const togglePinChat = useCallback((id) => {
    setPinnedChats(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  return {
    darkMode, toggleDarkMode, fontSize, setFontSize,
    themePreset, setThemePreset,
    chatBackgrounds, setChatBackgrounds,
    mutedRooms, setMutedRooms,
    starredMessages, toggleStarMessage,
    pinnedMessages, setPinnedMessages,
    roomAnnouncements, setRoomAnnouncements,
    pinnedChats, togglePinChat,
  };
}
