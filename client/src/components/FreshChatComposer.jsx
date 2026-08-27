import React, { useEffect, useRef, useState } from 'react';
import { I } from './Icon';
import AvatarImg from './ui/AvatarImg';
import { getAvatarUrl } from '../utils/avatar';
import { formatRecordingTime } from '../utils/format';
import { EMOJIS } from '../utils/constants';
import { API_URL } from '../utils/constants';

export default function FreshChatComposer({
  currentRoom,
  currentRoomId,
  user,
  allUsers,
  roomAnnouncements,
  replyToMessage,
  cancelReply,
  editingMessage,
  cancelEdit,
  fileInputRef,
  isRecording,
  startRecording,
  stopRecording,
  cancelRecording,
  recordingTime,
  showEmojiPicker,
  setShowEmojiPicker,
  showMentionPicker,
  setShowMentionPicker,
  showQuickReplies,
  setShowQuickReplies,
  sendDice,
  setShowGameModal,
  setShowRedPacketModal,
  setShowPollModal,
  setShowSolitaireModal,
  setShowMusicModal,
  setShowImageGen,
  setShowMusicPanel,
  setShowGifPanel,
  setShowNewsPanel,
  fetchNews,
  setShowWeatherPanel,
  setShowMapPanel,
  setShowBotModal,
  fetchBots,
  setShowCheckIn,
  fetchCheckIns,
  isSharingLocation,
  startSharingLocation,
  stopSharingLocation,
  startCall,
  setShowSearch,
  setShowRoomManage,
  autoTranslate,
  setAutoTranslate,
  translateLang,
  setView,
  setBottomTab,
  handleFileSelect,
  fetchSmartReplies,
  smartRepliesLoading,
  setPolishText,
  setPolishResult,
  setShowPolishModal,
  newMessage,
  setNewMessage,
  insertEmoji,
  mentionFilter,
  setMentionFilter,
  getFilteredMentionUsers,
  insertMention,
  quickReplies,
  insertQuickReply,
  smartReplies,
  setSmartReplies,
  handleInputChange,
  handleKeyDown,
  sendMessage,
  summarizeChat,
  aiSummaryLoading,
  startSyncMedia,
  sendCanvasCard,
  channelReadOnly,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashRange, setSlashRange] = useState(null);
  const textareaRef = useRef(null);

  const slashCommands = [
    { command: 'vote', title: '投票', desc: '快速写投票模板', icon: 'vote', template: '/vote 主题 | 选项A | 选项B' },
    { command: 'todo', title: '日程', desc: '记录待办和时间', icon: 'todo', template: '/todo 事项： 时间： 负责人：' },
    { command: 'ai', title: 'AI 提问', desc: '把问题交给 AI 助手', icon: 'ai', template: '/ai 帮我总结一下：' },
    { command: 'listen', title: '一起听', desc: '发起同步播放', icon: 'headphones', template: '/listen 音频或视频链接' },
  ];

  const filteredSlashCommands = slashCommands.filter((item) => (
    !slashQuery || item.command.includes(slashQuery) || item.title.toLowerCase().includes(slashQuery)
  ));

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
  }, [newMessage]);

  const openView = (view) => {
    setView?.(view);
    setBottomTab?.('chats');
    setDrawerOpen(false);
  };

  const toggleAutoTranslate = () => {
    const nextEnabled = !autoTranslate;
    setAutoTranslate(nextEnabled);
    fetch(`${API_URL}/api/ai/auto-translate/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
      body: JSON.stringify({ roomId: currentRoomId, enabled: nextEnabled, targetLang: translateLang })
    }).catch(() => {});
  };

  const openImageUpload = () => {
    fileInputRef.current?.click();
    setDrawerOpen(false);
  };

  const runPolish = () => {
    setPolishText(newMessage);
    setPolishResult('');
    setShowPolishModal(true);
    setDrawerOpen(false);
  };

  const openBotManager = () => {
    setShowBotModal?.(true);
    fetchBots?.();
    setDrawerOpen(false);
  };

  const openNews = () => {
    fetchNews?.();
    setShowNewsPanel?.(true);
    setDrawerOpen(false);
  };

  const openCheckIn = () => {
    setShowCheckIn(true);
    fetchCheckIns();
    setDrawerOpen(false);
  };

  const callPeer = () => {
    const otherUser = allUsers.find((u) => currentRoom?.members?.includes(u.username) && u.username !== user?.username);
    if (otherUser) startCall(otherUser.id, 'video');
    setDrawerOpen(false);
  };

  const updateSlashMenu = (value, caret) => {
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/(^|\s)(\/[\w-]*)$/);
    if (!match) {
      setSlashOpen(false);
      setSlashRange(null);
      return;
    }
    const token = match[2];
    setSlashRange({ start: beforeCaret.length - token.length, end: caret });
    setSlashQuery(token.slice(1).toLowerCase());
    setSlashIndex(0);
    setSlashOpen(true);
  };

  const handleComposerChange = (event) => {
    handleInputChange(event);
    updateSlashMenu(event.target.value, event.target.selectionStart || event.target.value.length);
  };

  const selectSlashCommand = (command) => {
    if (!command || !slashRange) return;
    const before = newMessage.slice(0, slashRange.start);
    const after = newMessage.slice(slashRange.end);
    const spacer = before && !before.endsWith(' ') ? ' ' : '';
    const nextValue = `${before}${spacer}${command.template}${after ? ` ${after.trimStart()}` : ''}`;
    setNewMessage(nextValue);
    setSlashOpen(false);
    setSlashRange(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const pos = Math.min(nextValue.length, (before + spacer + command.template).length);
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  };

  const handleComposerKeyDown = (event) => {
    if (slashOpen && filteredSlashCommands.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashIndex((idx) => (idx + 1) % filteredSlashCommands.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashIndex((idx) => (idx - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectSlashCommand(filteredSlashCommands[slashIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    handleKeyDown(event);
  };

  const privateRoom = !currentRoom?.type?.includes('group') && currentRoom?.members?.filter((m) => m !== user?.username).length > 0;
  const bentoItems = [
      { title: '一起听/看', desc: '发起群内同步播放条', icon: 'headphones', size: 'card', tone: 'sky', action: () => { startSyncMedia?.(); setDrawerOpen(false); } },
      { title: '涂鸦卡片', desc: '发送聊天内实时画板', icon: 'brush', size: 'card', tone: 'mint', action: () => { sendCanvasCard?.(); setDrawerOpen(false); } },
      { title: 'AI 功能区', desc: '多模型对话、摘要、润色、翻译', icon: 'ai', size: 'wide', tone: 'mint', action: () => openView('ai') },
      { title: '图片识别', desc: '上传图片后继续问图、读图', icon: 'image', size: 'card', tone: 'sky', action: openImageUpload },
      { title: 'AI 图片生成', desc: '用一句话生成图片并发送', icon: 'palette', size: 'card', tone: 'peach', action: () => { setShowImageGen(true); setDrawerOpen(false); } },
      { title: '娱乐中心', desc: '音乐、B站、热搜、游戏、GIF', icon: 'music', size: 'large', tone: 'coral', action: () => { setShowMusicPanel(true); setDrawerOpen(false); } },
      { title: '智能回复', icon: 'smart', tone: 'mint', loading: smartRepliesLoading, action: () => { fetchSmartReplies(); setDrawerOpen(false); } },
      { title: '文字润色', icon: 'polish', tone: 'lilac', disabled: !newMessage.trim(), action: runPolish },
      { title: autoTranslate ? '关闭翻译' : '自动翻译', icon: 'translate', tone: 'sky', active: autoTranslate, action: toggleAutoTranslate },
      { title: 'AI 摘要', icon: 'digest', tone: 'peach', loading: aiSummaryLoading, action: summarizeChat },
      { title: '机器人', icon: 'bot', tone: 'mint', action: openBotManager },
      { title: '数字分身', icon: 'twin', tone: 'lilac', action: () => openView('twin') },
      { title: 'AI 情报站', icon: 'news', tone: 'sky', action: () => openView('intelligence') },
      { title: '网易云音乐', icon: 'music', tone: 'coral', action: () => { setShowMusicPanel(true); setDrawerOpen(false); } },
      { title: 'B站视频', icon: 'bilibili', tone: 'peach', action: () => openView('video') },
      { title: '热搜', icon: 'fire', tone: 'coral', action: openNews },
      { title: 'GIF 表情包', icon: 'image', tone: 'sky', action: () => { setShowGifPanel?.(true); setDrawerOpen(false); } },
      { title: '小游戏', icon: 'game', tone: 'mint', action: () => { setShowGameModal(true); setDrawerOpen(false); } },
      { title: '猜拳', icon: 'hand', tone: 'lilac', action: () => { setShowGameModal(true); setDrawerOpen(false); } },
      { title: '骰子', icon: 'dice', tone: 'peach', action: sendDice },
      { title: '高德地图', icon: 'location', tone: 'mint', action: () => { setShowMapPanel?.(true); setDrawerOpen(false); } },
      { title: '天气', icon: 'sun', tone: 'sky', action: () => { setShowWeatherPanel?.(true); setDrawerOpen(false); } },
      { title: '投票', icon: 'vote', tone: 'peach', action: () => { setShowPollModal(true); setDrawerOpen(false); } },
      { title: '红包', icon: 'gift', tone: 'coral', action: () => { setShowRedPacketModal(true); setDrawerOpen(false); } },
      { title: '打卡', icon: 'checkin', tone: 'mint', action: openCheckIn },
      { title: '日程', icon: 'calendar', tone: 'lilac', action: openCheckIn },
      { title: '群接龙', icon: 'solitaire', tone: 'sky', action: () => { setShowSolitaireModal(true); setDrawerOpen(false); } },
      { title: '音乐链接', icon: 'link', tone: 'coral', action: () => { setShowMusicModal(true); setDrawerOpen(false); } },
      { title: '文件', icon: 'file', tone: 'peach', action: openImageUpload },
      { title: '附件', icon: 'attach', tone: 'sky', action: openImageUpload },
      { title: isRecording ? '停止录音' : '语音', icon: isRecording ? 'stop' : 'mic', tone: isRecording ? 'coral' : 'mint', action: isRecording ? stopRecording : startRecording },
      { title: '@ 提及', icon: 'hash', tone: 'lilac', active: showMentionPicker, action: () => setShowMentionPicker((s) => !s) },
      { title: '快捷回复', icon: 'quick', tone: 'peach', active: showQuickReplies, action: () => setShowQuickReplies((s) => !s) },
      { title: '搜索消息', icon: 'search', tone: 'sky', action: () => setShowSearch((s) => !s) },
      { title: isSharingLocation ? '停止共享' : '共享位置', icon: 'location', tone: isSharingLocation ? 'coral' : 'mint', action: isSharingLocation ? stopSharingLocation : startSharingLocation },
      { title: '视频通话', icon: 'video', tone: 'lilac', disabled: !privateRoom, action: callPeer },
      { title: '房间设置', icon: 'settings', tone: 'sky', disabled: currentRoom?.members?.length <= 1, action: () => { setShowRoomManage(true); setDrawerOpen(false); } },
      { title: '加密聊天', icon: 'security', tone: 'mint', action: () => openView('encrypted') },
      { title: '协作画板', icon: 'palette', tone: 'peach', action: () => openView('whiteboard') },
      { title: '语音房', icon: 'mic', tone: 'coral', action: () => openView('voiceRoom') },
      { title: '社交图谱', icon: 'contacts', tone: 'lilac', action: () => openView('socialGraph') },
    ];

  const handleBentoClick = (item) => {
    if (item.disabled || item.loading) return;
    item.action?.();
  };

  return (
    <div className="chat-input-area fresh-chat-composer">
      <div className={`fresh-bento-drawer ${drawerOpen ? 'is-open' : ''}`}>
        <div className="fresh-bento-head">
          <button className="fresh-bento-back" type="button" onClick={() => setDrawerOpen(false)} title="返回">
            <I name="arrowLeft" size={18} />
          </button>
          <div className="fresh-bento-copy">
            <strong>功能面板</strong>
            <span>选择工具后返回聊天</span>
          </div>
          <button className="fresh-soft-icon" type="button" onClick={() => setDrawerOpen(false)} title="关闭功能面板">
            <I name="close" size={18} />
          </button>
        </div>
        <div className="fresh-bento-grid">
          {bentoItems.map((item) => (
            <button
              key={item.title}
              type="button"
              className={`fresh-bento-card ${item.size || 'small'} ${item.tone || 'mint'} ${item.active ? 'is-active' : ''}`}
              onClick={() => handleBentoClick(item)}
              disabled={item.disabled || item.loading}
              title={item.title}
            >
              <span className="fresh-bento-icon"><I name={item.icon} size={22} /></span>
              <span className="fresh-bento-title">{item.loading ? '处理中...' : item.title}</span>
              {item.desc && <span className="fresh-bento-desc">{item.desc}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="fresh-composer-island">
        {channelReadOnly && (
          <div className="channel-readonly-tip">
            <I name="security" size={14} />
            <span>你已订阅此频道，仅频道主和管理员可发言</span>
          </div>
        )}
        {roomAnnouncements[currentRoomId] && (
          <div className="room-announcement fresh-context-strip">{roomAnnouncements[currentRoomId]}</div>
        )}
        {replyToMessage && (
          <div className="reply-preview fresh-context-strip">
            <span>回复 {replyToMessage.sender?.username}：</span>
            <span className="reply-content">{replyToMessage.content?.slice(0, 50) || '[媒体消息]'}</span>
            <button className="cancel-reply" onClick={cancelReply} title="取消回复"><I name="close" size={14} /></button>
          </div>
        )}
        {editingMessage && (
          <div className="edit-preview fresh-context-strip">
            <span><I name="edit" size={13} /> 正在编辑消息...</span>
            <button className="cancel-edit" onClick={cancelEdit} title="取消编辑"><I name="close" size={14} /></button>
          </div>
        )}

        {slashOpen && filteredSlashCommands.length > 0 && (
          <div className="slash-command-menu">
            {filteredSlashCommands.map((item, index) => (
              <button
                key={item.command}
                type="button"
                className={`slash-command-item ${index === slashIndex ? 'is-active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSlashCommand(item)}
              >
                <span className="slash-command-icon"><I name={item.icon} size={18} /></span>
                <span className="slash-command-copy">
                  <span className="slash-command-title">/{item.command} {item.title}</span>
                  <span className="slash-command-desc">{item.desc}</span>
                </span>
                <span className="slash-command-template">Tab</span>
              </button>
            ))}
          </div>
        )}

        <div className="fresh-input-row">
          <div className="fresh-input-cloud">
            <textarea
              ref={textareaRef}
              className="chat-input fresh-textarea"
              aria-label="Message input"
              rows={1}
              placeholder={channelReadOnly ? '仅频道主和管理员可发言' : '把今天的小想法放进来...'}
              value={newMessage}
              onChange={handleComposerChange}
              onKeyDown={handleComposerKeyDown}
              disabled={channelReadOnly}
            />
            <div className="fresh-quick-tools" aria-label="快捷功能">
              <button className="fresh-soft-icon" type="button" onClick={openImageUpload} title="图片">
                <I name="image" size={20} />
              </button>
              <button className="fresh-soft-icon" type="button" onClick={() => openView('ai')} title="AI 助手">
                <I name="ai" size={20} />
              </button>
              <button
                className={`fresh-soft-icon ${showEmojiPicker ? 'is-active' : ''}`}
                type="button"
                onClick={() => setShowEmojiPicker((s) => !s)}
                title="表情包"
              >
                <I name="emoji" size={20} />
              </button>
            </div>
          </div>

          <button
            className={`fresh-plus-button ${drawerOpen ? 'is-active' : ''}`}
            type="button"
            onClick={() => setDrawerOpen((s) => !s)}
            aria-expanded={drawerOpen}
            title={drawerOpen ? '收起功能面板' : '展开功能面板'}
          >
            <I name="plus" size={24} />
          </button>

          <button className="send-button fresh-send-button" type="button" onClick={sendMessage} disabled={channelReadOnly || (!newMessage.trim() && !editingMessage)} title="发送">
            <I name="send" size={21} />
            <span>{editingMessage ? '保存' : '发送'}</span>
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          className="visually-hidden-file"
          accept="*/*"
          onChange={handleFileSelect}
        />

        {isRecording && (
          <div className="recording-indicator">
            <span className="recording-dot" />
            <span>录音中 {formatRecordingTime(recordingTime)}</span>
            <button onClick={cancelRecording} className="cancel-recording">取消</button>
          </div>
        )}

        {showEmojiPicker && (
          <div className="emoji-picker fresh-floating-panel">
            {EMOJIS.map((emoji, i) => (
              <button key={i} className="emoji-item" onClick={() => insertEmoji(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        )}

        {showMentionPicker && (
          <div className="mention-picker fresh-floating-panel">
            <input
              type="text"
              className="mention-search-input"
              placeholder="搜索成员或@所有人..."
              value={mentionFilter}
              onChange={(e) => setMentionFilter(e.target.value)}
              autoFocus
            />
            <div className="mention-list">
              {currentRoom?.members?.length > 2 && (!mentionFilter || '所有人'.includes(mentionFilter) || 'all'.includes(mentionFilter.toLowerCase())) && (
                <button className="mention-item mentions-item-all" onClick={() => insertMention('所有人')}>
                  <span className="mention-avatar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-bg)', color: 'var(--primary)' }}>
                    <I name="users" size={14} />
                  </span>
                  <span><strong>@所有人</strong> (全员提醒)</span>
                </button>
              )}
              {getFilteredMentionUsers().map((u) => (
                <button key={u.id} className="mention-item" onClick={() => insertMention(u.username)}>
                  <AvatarImg src={getAvatarUrl(u.avatar)} alt="" className="mention-avatar" />
                  <span>{u.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {showQuickReplies && (
          <div className="quick-replies-panel fresh-floating-panel">
            {quickReplies.map((reply, i) => (
              <button key={i} className="quick-reply-item" onClick={() => insertQuickReply(reply)}>
                {reply}
              </button>
            ))}
          </div>
        )}

        {smartReplies.length > 0 && (
          <div className="smart-replies-bar fresh-smart-replies">
            <span className="smart-replies-label">AI 建议：</span>
            {smartReplies.map((reply, i) => (
              <button key={i} className="smart-reply-btn" onClick={() => { setNewMessage(reply); setSmartReplies([]); }}>
                {reply}
              </button>
            ))}
            <button className="smart-reply-close" onClick={() => setSmartReplies([])} title="关闭建议"><I name="close" size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
