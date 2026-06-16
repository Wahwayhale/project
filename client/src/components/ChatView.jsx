import React from 'react';
import { I } from './Icon';
import AvatarImg from './ui/AvatarImg';
import { getAvatarUrl } from '../utils/avatar';
import { formatTime, formatFileSize, getFileIcon, parseBilibiliUrl, formatRecordingTime } from '../utils/format';
import { EMOJIS } from '../utils/constants';
import { API_URL } from '../utils/constants';

/**
 * ChatView — 聊天主视图组件
 *
 * 渲染聊天头部（房间信息、工具栏、AI摘要、搜索）、消息列表（所有消息类型、
 * 反应选择器）和输入区域（工具栏、表情/@/快捷回复选择器、组合输入行）。
 */
export default function ChatView({
  // === 房间 ===
  currentRoom,
  currentRoomId,
  setCurrentRoom,
  setCurrentRoomId,
  setMessages,

  // === 用户 ===
  user,
  allUsers,

  // === 消息列表 ===
  messages,
  pinnedMessages,
  starredMessages,
  getReadInfo,
  highlightText,
  typingUser,

  // === AI 摘要 ===
  aiSummary,
  aiSummaryLoading,
  setAiSummary,
  summarizeChat,

  // === 头部工具栏 ===
  setShowImageGen,
  isSharingLocation,
  startSharingLocation,
  stopSharingLocation,
  setShowCheckIn,
  fetchCheckIns,
  setShowMusicPanel,
  startCall,
  showSearch,
  setShowSearch,
  setShowRoomManage,
  searchQuery,
  setSearchQuery,
  autoTranslate,
  setAutoTranslate,
  translateLang,
  setTranslateLang,
  translatedMessages,

  // === 消息多媒体 ===
  translations,
  openImageViewer,
  descLoading,
  imageDesc,
  describeImage,
  observeVideo,
  translatingMsg,
  translateMessage,
  openLocationMap,

  // === 消息交互 ===
  claimRedPacket,
  votePoll,
  joinSolitaire,
  toggleReaction,
  recallMessage,
  startEditMessage,
  deleteMessage,
  openReactionPicker,
  startReply,
  openForwardModal,
  toggleStarMessage,
  togglePinMessage,

  // === 反应选择器 ===
  reactionPicker,
  setReactionPicker,
  REACTION_EMOJIS,

  // === 滚动锚点 ===
  setMessageEndRef,

  // === 输入区域 ===
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
}) {
  return (
    <div className="chat-shell">
      <div className="chat-top-stack">
        <div className="chat-header">
          <div className="chat-header-main">
            <button className="back-btn" onClick={() => { setCurrentRoom(null); setCurrentRoomId(null); setMessages([]); }} title="返回">
              <I name="arrowLeft" size={20} />
            </button>
            <div className="chat-header-copy">
              <h3>{currentRoom.name}</h3>
              <div className="chat-header-meta">
                <div className="online-badge">在线</div>
                <span className="chat-header-hint">
                  {currentRoom?.members?.length > 1 ? `${currentRoom.members.length} 位成员` : '私密对话'}
                </span>
              </div>
            </div>
          </div>
          <div className="header-tools">
            <button className="ai-summary-btn-inline" onClick={summarizeChat} disabled={aiSummaryLoading} title="AI摘要">
              {aiSummaryLoading ? '…' : <I name="ai" size={16} />}
            </button>
            <button onClick={() => setShowImageGen(true)} title="AI图片生成"><I name="image" size={15} /></button>
            <button onClick={isSharingLocation ? stopSharingLocation : startSharingLocation} title={isSharingLocation ? '停止位置共享' : '共享位置'} className={isSharingLocation ? 'danger-active' : ''}>
              <I name="location" size={15} />
            </button>
            <button onClick={() => { setShowCheckIn(true); fetchCheckIns(); }} title="打卡签到"><I name="checkin" size={15} /></button>
            <button onClick={() => setShowMusicPanel(true)} title="听歌"><I name="music" size={15} /></button>
            {!currentRoom?.type?.includes('group') && currentRoom?.members?.filter(m => m !== user?.username).length > 0 && (
              <button onClick={() => {
                const otherUser = allUsers.find(u => currentRoom.members.includes(u.username) && u.username !== user?.username);
                if (otherUser) startCall(otherUser.id, 'video');
              }} title="视频通话"><I name="video" size={15} /></button>
            )}
            <button onClick={() => setShowSearch(s => !s)} title="搜索消息">
              {showSearch ? <I name="close" size={15} /> : <I name="search" size={15} />}
            </button>
            <button onClick={() => {
              const newEnabled = !autoTranslate;
              setAutoTranslate(newEnabled);
              fetch(`${API_URL}/api/ai/auto-translate/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') },
                body: JSON.stringify({ roomId: currentRoomId, enabled: newEnabled, targetLang: translateLang })
              }).catch(() => {});
            }} title={autoTranslate ? '关闭自动翻译' : '开启自动翻译'}
              style={{ position: 'relative' }}>
              <I name="translate" size={15} />
              {autoTranslate && <span style={{ position: 'absolute', top: -2, right: -2, width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />}
            </button>
            {currentRoom?.members?.length > 1 && (
              <button onClick={() => setShowRoomManage(true)} title="群管理"><I name="settings" size={15} /></button>
            )}
          </div>
        </div>
        {aiSummary && (
          <div className="summary-flash">
            <div className="sflash-top">
              <span className="sflash-title"><I name="ai" size={16} /> AI 聊天摘要</span>
              <button className="sflash-close" onClick={() => setAiSummary(null)}><I name="close" size={16} /></button>
            </div>
            <div className="sflash-body">{aiSummary.text}</div>
          </div>
        )}
        {aiSummaryLoading && (
          <div className="summary-loading">
            <div className="ai-typing"><span></span><span></span><span></span></div>
            <span>AI 正在分析聊天记录...</span>
          </div>
        )}
        {showSearch && (
          <div className="message-search-bar">
            <input
              type="text"
              placeholder="搜索聊天记录..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <span className="search-count">
                {messages.filter(m => !m.recalled && m.content?.toLowerCase().includes(searchQuery.toLowerCase())).length} 条结果
              </span>
            )}
          </div>
        )}
      </div>
      <div className="chat-thread">
        <div className="messages-container" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((msg, index) => {
          const isSearchMatch = searchQuery && !msg.recalled && msg.content?.toLowerCase().includes(searchQuery.toLowerCase());
          const isPinned = pinnedMessages[currentRoomId]?.includes(msg.id);
          const isStarred = starredMessages.has(msg.id);
          const isMine = msg.sender?.username === user?.username;
          const readInfo = isMine ? getReadInfo(msg) : '';

          // 渲染引用回复
          const renderReply = (replyMsg) => {
            if (!replyMsg) return null;
            return (
              <div className="reply-quote" onClick={() => {
                const el = document.getElementById(`msg-${replyMsg.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}>
                <span className="reply-sender">{replyMsg.sender?.username}</span>
                <span className="reply-text">{replyMsg.content?.slice(0, 50) || '[媒体消息]'}</span>
              </div>
            );
          };

          // 渲染@提及
          const renderMentions = (content) => {
            if (!content) return content;
            const parts = content.split(/(@\w+)/g);
            return parts.map((part, i) => {
              if (part.startsWith('@') && part.length > 1) {
                const isMe = part === `@${user?.username}`;
                return <span key={i} className={`mention ${isMe ? 'mention-me' : ''}`}>{part}</span>;
              }
              return isSearchMatch ? highlightText(part, searchQuery) : part;
            });
          };

          const contentToRender = msg.recalled ? null : (
            <>
              {msg.replyTo && renderReply(messages.find(m => m.id === msg.replyTo))}
              {msg.type === 'text' && (
                <div className="message-text">
                  {renderMentions(msg.content)}
                  {msg.edited && <span className="edited-tag">（已编辑）</span>}
                </div>
              )}
              {/* AI 翻译结果 */}
              {translations[msg.id] && (
                <div className="translation-text">
                  {translations[msg.id]}
                </div>
              )}
              {msg.type === 'image' && (
                <div className="media-wrap">
                  <img className="media" src={msg.fileUrl} alt="" onClick={() => openImageViewer(msg.fileUrl, messages.filter(m => m.type === 'image').map(m => m.fileUrl))} />
                  <button className="media-ai-btn" type="button" onClick={() => describeImage(msg.id, msg.fileUrl)} disabled={descLoading === msg.id}>
                    {descLoading === msg.id ? '…' : imageDesc[msg.id] ? imageDesc[msg.id] : 'AI 识图'}
                  </button>
                </div>
              )}
              {msg.type === 'video' && (
                <video className="media" ref={observeVideo} src={msg.fileUrl} controls preload="none"
                  onClick={() => window.open(msg.fileUrl)} />
              )}
              {msg.type === 'audio' && (
                <div className="audio-message">
                  <span className="audio-icon"><I name="music" size={20} /></span>
                  <audio src={msg.fileUrl} controls />
                </div>
              )}
              {msg.type === 'file' && (
                <a href={msg.fileUrl} download={msg.filename} className="file-attachment">
                  <div className="file-icon">{getFileIcon(msg.mimeType, msg.filename)}</div>
                  <div className="file-info">
                    <div className="file-name">{msg.filename || '未命名文件'}</div>
                    <div className="file-meta">
                      {msg.mimeType && <span>{msg.mimeType.split('/')[1]?.toUpperCase() || msg.mimeType}</span>}
                      {msg.fileSize && <span>{formatFileSize(msg.fileSize)}</span>}
                    </div>
                  </div>
                  <div className="file-download">下载</div>
                </a>
              )}
              {msg.type === 'music' && (
                <div className="music-message">
                  <span className="music-icon"><I name="music" size={20} /></span>
                  <a href={msg.content} target="_blank" rel="noopener noreferrer">点击播放音乐</a>
                </div>
              )}
              {msg.type === 'redPacket' && (
                <div className="red-packet-message" onClick={() => claimRedPacket(msg.id)}>
                  <div className="red-packet-icon"><I name="gift" size={20} /></div>
                  <div className="red-packet-info">
                    <div className="red-packet-title">{msg.message}</div>
                    <div className="red-packet-detail">
                      {msg.remaining > 0 ? `还剩${msg.remaining}个红包` : '红包已被领完'}
                    </div>
                    {msg.claimed && msg.claimed.includes(user?.id) && (
                      <div className="claimed-badge">已领取</div>
                    )}
                  </div>
                </div>
              )}
              {msg.type === 'poll' && (
                <div className="poll-message">
                  <div className="poll-title">{msg.question}</div>
                  {msg.anonymous && <div className="poll-anon-badge">匿名投票</div>}
                  {msg.deadline && <div className="poll-deadline">截止: {new Date(msg.deadline).toLocaleString()}</div>}
                  {(msg.options || []).map((opt, i) => {
                    const totalVotes = msg.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
                    const voteCount = opt.votes?.length || 0;
                    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                    const hasVoted = msg.options.some(o => o.votes?.includes(user?.id));
                    return (
                      <div key={i} className="poll-option" onClick={() => !hasVoted && votePoll(msg.id, i)}>
                        <div className="poll-option-text">{opt.text}</div>
                        {hasVoted && (
                          <>
                            <div className="poll-bar">
                              <div className="poll-fill" style={{ width: `${percentage}%` }} />
                            </div>
                            <div className="poll-percentage">{percentage}% ({voteCount}票)</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="poll-footer">共 {msg.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0)} 人参与投票</div>
                </div>
              )}
              {msg.type === 'dice' && (
                <div className="dice-message">
                  <span className="dice-icon"><I name="dice" size={24} /></span>
                  <span className="dice-value">{msg.value} 点</span>
                </div>
              )}
              {msg.type === 'rockPaperScissors' && (
                <div className="game-message">
                  <div className="game-result">
                    <div>你的选择: {msg.userChoice}</div>
                    <div>对手选择: {msg.botChoice}</div>
                    <div className={`game-result-text ${msg.result === '你赢了' ? 'win' : msg.result === '你输了' ? 'lose' : 'draw'}`}>
                      {msg.result}
                    </div>
                  </div>
                </div>
              )}
              {msg.type === 'announcement' && (
                <div className="announcement-message">{msg.content}</div>
              )}
              {msg.type === 'solitaire' && (
                <div className="solitaire-card">
                  <div className="solitaire-top">
                    <span className="solitaire-emoji"><I name="solitaire" size={18} /></span>
                    <div>
                      <div className="solitaire-name">{msg.title}</div>
                      <div className="solitaire-hint">{msg.format || '{序号}. {内容}'}</div>
                    </div>
                  </div>
                  {msg.participants && msg.participants.length > 0 && (
                    <div className="solitaire-list">
                      {msg.participants.map((p, i) => (
                        <div key={i} className="solitaire-entry">
                          <span className="solitaire-num">{p.index}</span>
                          <span className="solitaire-user">{p.username}</span>
                          <span className="solitaire-content">{p.content}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!msg.participants?.find(p => p.userId === user?.id) ? (
                    <button className="solitaire-join" onClick={() => {
                      const content = prompt('请输入你的接龙内容：');
                      if (content) joinSolitaire(msg.id, content);
                    }}>+ 参与接龙</button>
                  ) : (
                    <div className="solitaire-joined">
                      已参与（{(msg.participants || []).length}人）
                    </div>
                  )}
                </div>
              )}
              {(() => {
                const bvid = parseBilibiliUrl(msg.content);
                if (!bvid) return null;
                return (
                  <div className="bilibili-embed" ref={observeVideo}>
                    <iframe src={`https://player.bilibili.com/player.html?bvid=${bvid}`} title="Bilibili video" allowFullScreen />
                  </div>
                );
              })()}
            </>
          );
          return (
          <div key={msg.id || index} id={`msg-${msg.id}`} className={`message ${isMine ? 'sent' : 'received'} ${isSearchMatch ? 'highlighted' : ''} ${isPinned ? 'pinned' : ''}`}>
            <AvatarImg className="avatar" src={getAvatarUrl(msg.sender?.avatar || user?.avatar)} alt="" />
            <div className="message-content">
              {isPinned && <div className="pinned-badge"><I name="pin" size={12} /> 置顶</div>}
              {msg.sender?.username !== user?.username && !msg.recalled && (
                <div className="sender-name">{msg.sender?.username}</div>
              )}
              {msg.forwardedFrom && !msg.recalled && (
                <div className="forwarded-badge"><I name="forward" size={12} /> 转发自 {msg.forwardedFrom}</div>
              )}
              <div className={`bubble ${msg.recalled ? 'recalled' : ''}`}>
                {msg.recalled ? (
                  <span className="recalled-text"><I name="reset" size={12} /> 此消息已被撤回</span>
                ) : contentToRender}
              </div>
              {!msg.recalled && (
                <>
                  {/* 消息反应显示 */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="reaction-bar">
                      {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                        <span
                          key={emoji}
                          className={`reaction-tag ${(userIds || []).includes(user?.id) ? 'me' : ''}`}
                          onClick={() => toggleReaction(msg.id, emoji)}
                        >
                          {emoji} <span className="rcount">{(userIds || []).length}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="message-actions">
                    {isMine && (
                      <>
                        <button onClick={() => recallMessage(msg.id)} title="撤回消息"><I name="reset" size={15} /></button>
                        <button onClick={() => startEditMessage(msg)} title="编辑消息"><I name="edit" size={15} /></button>
                        <button onClick={() => deleteMessage(msg.id)} title="删除消息"><I name="delete" size={15} /></button>
                      </>
                    )}
                    {!isMine && currentRoom?.createdBy === user?.username && (
                      <button onClick={() => deleteMessage(msg.id)} title="删除消息"><I name="delete" size={15} /></button>
                    )}
                    <button onClick={(e) => openReactionPicker(msg.id, e)} title="表情回应"><I name="reaction" size={15} /></button>
                    <button onClick={() => startReply(msg)} title="引用回复"><I name="reply" size={15} /></button>
                    <button onClick={() => openForwardModal(msg)} title="转发"><I name="forward" size={15} /></button>
                    <button onClick={() => toggleStarMessage(msg.id)} title={isStarred ? '取消收藏' : '收藏'}>
                      <I name="star" size={15} color={isStarred ? 'var(--warning)' : undefined} />
                    </button>
                    <button onClick={() => togglePinMessage(msg.id)} title={isPinned ? '取消置顶' : '置顶'}>
                      <I name="pin" size={15} color={isPinned ? 'var(--primary)' : undefined} />
                    </button>
                  </div>
                </>
              )}
              <div className="message-footer">
                <div className="time">{formatTime(msg.timestamp)}</div>
                {readInfo && <div className="read-info">{readInfo}</div>}
              </div>
              {/* 翻译按钮 */}
              {!isMine && msg.type === 'text' && msg.content && !msg.recalled && (
                <span className="translate-badge" onClick={() => translateMessage(msg.id, msg.content)}>
                  {translatingMsg === msg.id ? '…' : translations[msg.id] ? '原文' : <><I name="translate" size={13} /> 翻译</>}
                </span>
              )}
              {translations[msg.id] && (
                <div className="translated-text">{translations[msg.id]}</div>
              )}
              {/* 位置消息 */}
              {msg.type === 'location' && (
                <div className="location-bubble" onClick={() => openLocationMap(msg.lat, msg.lng)}>
                  <div className="loc-header"><span className="loc-icon"><I name="location" size={14} /></span><span className="loc-user">{msg.sender?.username}</span></div>
                  <div className="loc-coords">{msg.lat?.toFixed(4)}, {msg.lng?.toFixed(4)}</div>
                  <div className="location-map-preview"><I name="location" size={24} /></div>
                </div>
              )}
              {/* 打卡消息 */}
              {msg.type === 'checkIn' && (
                <div className="checkin-card">
                  <div className="checkin-day"><I name="checkin" size={12} /> {new Date(msg.timestamp).toLocaleDateString('zh-CN')}</div>
                  <div className="checkin-count">{msg.sender?.username} 打卡{msg.note ? `：${msg.note}` : ''}</div>
                </div>
              )}
              {/* 已读回执头像 */}
              {isMine && msg.readBy && msg.readBy.length > 1 && (
                <div className="read-avatars-row">
                  {msg.readBy.slice(0, 5).filter(uid => uid !== user?.id).map(uid => {
                    const u = allUsers.find(x => x.id === uid);
                    return u ? <AvatarImg key={uid} className="read-avatar-mini" src={getAvatarUrl(u.avatar)} alt="" title={u.username} /> : null;
                  })}
                  {msg.readBy.length - 1 > 5 && <span className="read-more-hint">+{msg.readBy.length - 6}</span>}
                </div>
              )}
            </div>
          </div>
          );
        })}
        {typingUser && <div className="typing-indicator">{typingUser} 正在输入...</div>}
        {/* 反应选择器 */}
        {reactionPicker && (
          <div className="reaction-picker-popup" style={{ position: 'fixed', top: reactionPicker.y, left: reactionPicker.x, zIndex: 1000 }}>
            {REACTION_EMOJIS.map(emoji => (
              <button key={emoji} onClick={() => toggleReaction(reactionPicker.messageId, emoji)}>{emoji}</button>
            ))}
            <button className="reaction-picker-close" type="button" onClick={() => setReactionPicker(null)}><I name="close" size={14} /></button>
          </div>
        )}
          <div ref={setMessageEndRef} />
        </div>
      </div>
      <div className="chat-input-area">
        <div className="chat-input-stack">
          {roomAnnouncements[currentRoomId] && (
            <div className="room-announcement">{roomAnnouncements[currentRoomId]}</div>
          )}
          {replyToMessage && (
            <div className="reply-preview">
              <span>回复 {replyToMessage.sender?.username}：</span>
              <span className="reply-content">{replyToMessage.content?.slice(0, 50) || '[媒体消息]'}</span>
              <button className="cancel-reply" onClick={cancelReply}><I name="close" size={14} /></button>
            </div>
          )}
          {editingMessage && (
            <div className="edit-preview">
              <span><I name="edit" size={13} /> 编辑消息中...</span>
              <button className="cancel-edit" onClick={cancelEdit}><I name="close" size={14} /></button>
            </div>
          )}
          <div className="chat-input-wrapper">
            <div className="chat-input-toolbar">
              <div className="chat-input-actions">
                <button onClick={() => fileInputRef.current?.click()} title="发送文件"><I name="attach" size={17} /></button>
                <button onClick={isRecording ? stopRecording : startRecording} title={isRecording ? '停止录音' : '语音消息'} className={isRecording ? 'recording' : ''}>
                  {isRecording ? <I name="stop" size={17} color="var(--danger)" /> : <I name="mic" size={17} />}
                </button>
                <button onClick={() => setShowEmojiPicker(s => !s)} title="表情" className={showEmojiPicker ? 'active' : ''}><I name="emoji" size={17} /></button>
                <button onClick={() => setShowMentionPicker(s => !s)} title="@提及" className={showMentionPicker ? 'active' : ''}>@</button>
                <button onClick={() => setShowQuickReplies(s => !s)} title="快捷回复"><I name="quick" size={17} /></button>
                <button onClick={sendDice} title="骰子"><I name="dice" size={17} /></button>
                <button onClick={() => setShowGameModal(true)} title="猜拳"><I name="hand" size={17} /></button>
                <button onClick={() => setShowRedPacketModal(true)} title="红包"><I name="gift" size={17} /></button>
                <button onClick={() => setShowPollModal(true)} title="投票"><I name="vote" size={17} /></button>
                <button onClick={() => setShowSolitaireModal(true)} title="群接龙"><I name="solitaire" size={17} /></button>
                <button onClick={() => setShowMusicModal(true)} title="音乐"><I name="music" size={17} /></button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="visually-hidden-file"
                  accept="*/*"
                  onChange={handleFileSelect}
                />
              </div>
              <div className="chat-compose-tools">
                <button
                  className="action-btn small"
                  onClick={fetchSmartReplies}
                  disabled={smartRepliesLoading || !currentRoomId}
                  title="AI智能回复建议"
                >{smartRepliesLoading ? '…' : <I name="smart" size={16} />}</button>
                <button
                  className="action-btn small"
                  onClick={() => { setPolishText(newMessage); setPolishResult(''); setShowPolishModal(true); }}
                  disabled={!newMessage.trim()}
                  title="AI润色文字"
                ><I name="polish" size={16} /></button>
              </div>
            </div>
            {isRecording && (
              <div className="recording-indicator">
                <span className="recording-dot" />
                <span>录音中 {formatRecordingTime(recordingTime)}</span>
                <button onClick={cancelRecording} className="cancel-recording">取消</button>
              </div>
            )}
            {showEmojiPicker && (
              <div className="emoji-picker">
                {EMOJIS.map((emoji, i) => (
                  <button key={i} className="emoji-item" onClick={() => insertEmoji(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {showMentionPicker && (
              <div className="mention-picker">
                <input
                  type="text"
                  className="mention-search-input"
                  placeholder="搜索用户..."
                  value={mentionFilter}
                  onChange={e => setMentionFilter(e.target.value)}
                  autoFocus
                />
                <div className="mention-list">
                  {getFilteredMentionUsers().map(u => (
                    <button key={u.id} className="mention-item" onClick={() => insertMention(u.username)}>
                      <AvatarImg src={getAvatarUrl(u.avatar)} alt="" className="mention-avatar" />
                      <span>{u.username}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showQuickReplies && (
              <div className="quick-replies-panel">
                {quickReplies.map((reply, i) => (
                  <button key={i} className="quick-reply-item" onClick={() => insertQuickReply(reply)}>
                    {reply}
                  </button>
                ))}
              </div>
            )}
            {smartReplies.length > 0 && (
              <div className="smart-replies-bar">
                <span className="smart-replies-label">AI建议：</span>
                {smartReplies.map((reply, i) => (
                  <button key={i} className="smart-reply-btn" onClick={() => { setNewMessage(reply); setSmartReplies([]); }}>
                    {reply}
                  </button>
                ))}
                <button className="smart-reply-close" onClick={() => setSmartReplies([])}><I name="close" size={14} /></button>
              </div>
            )}
            <div className="chat-compose-row">
              <textarea
                className="chat-input"
                aria-label="Message input"
                rows={1}
                placeholder="输入消息... 输入 @ 提及用户"
                value={newMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />
              <button className="send-button" type="button" onClick={sendMessage} disabled={!newMessage.trim() && !editingMessage}>
                {editingMessage ? '保存' : '发送'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
