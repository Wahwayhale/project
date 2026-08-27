import React from 'react';
import FeatureItem from './ui/FeatureItem';
import { I } from './Icon';

export default function DiscoverView({
  setView,
  setBottomTab,
  setShowImageGen,
  fetchDailyDigest,
  setShowBotModal,
  fetchBots,
  setShowMusicPanel,
  setShowGifPanel,
  fetchNews,
  setShowMoments,
  setShowGameModal,
  setShowWeatherPanel,
  setShowMapPanel,
  wrappedLoading,
  fetchWrapped,
  setShowBackupModal,
  setTwinView,
  setIntelligenceView,
  socketRef,
  showToast,
}) {
  const sections = [
    {
      title: 'AI 智脑矩阵',
      badge: 'PRO',
      items: [
        { icon: 'ai', tone: 'ai', title: 'AI 智能对话', desc: '全能助手，支持多模型智能交互', onClick: () => { setView('ai'); setBottomTab('chats'); } },
        { icon: 'palette', tone: 'image', title: 'AI 创意生图', desc: '描述灵感，一键生成高清精美图像', onClick: () => setShowImageGen(true) },
        { icon: 'digest', tone: 'digest', title: 'AI 每日日报', desc: '智能萃取提炼今日关键对话摘要', onClick: fetchDailyDigest },
        { icon: 'bot', tone: 'bot', title: '自动应答 Bot', desc: '自定义机器人，智能匹配与关键词应答', onClick: () => { setShowBotModal(true); fetchBots(); } },
        { icon: 'twin', tone: 'ai', title: 'AI 数字分身', desc: '专属风格克隆，智能代答与个性互动', onClick: () => { setView('twin'); setBottomTab('chats'); } },
        { icon: 'news', tone: 'news', title: 'AI 前沿情报', desc: '全天候热点资讯，个性化动态速递', onClick: () => { setView('intelligence'); setBottomTab('chats'); } },
      ],
    },
    {
      title: '社交与多维互动',
      badge: 'HOT',
      items: [
        { icon: 'camera', tone: 'moments', title: '朋友圈动态', desc: '记录精彩生活，与挚友点赞评论互动', onClick: () => { setShowMoments(true); } },
        { icon: 'game', tone: 'game', title: '趣味小游戏', desc: '猜拳与互动游戏，活跃群聊气氛', onClick: () => { setShowGameModal(true); } },
        { icon: 'moon', tone: 'ai', title: '深夜匿名树洞', desc: '无痕倾诉空间，24 小时后自动焚毁', onClick: () => {
          const name = window.prompt('给你的树洞起个名字：', '深夜树洞');
          if (name && name.trim()) {
            socketRef?.current?.emit('createTreehole', { name: name.trim() });
          } else if (name !== null && !name.trim()) {
            showToast('树洞名称不能为空', 'error');
          }
        } },
        { icon: 'contacts', tone: 'moments', title: '社交关系图谱', desc: '可视化人际关系网络与亲密度分析', onClick: () => { setView('socialGraph'); setBottomTab('chats'); } },
        { icon: 'security', tone: 'ai', title: '端到端加密聊', desc: '阅后即焚级别私密专属会话', onClick: () => { setView('encrypted'); setBottomTab('chats'); } },
      ],
    },
    {
      title: '实时多任务工坊',
      badge: 'LIVE',
      items: [
        { icon: 'palette', tone: 'game', title: '多人协同画板', desc: '实时共创绘画与白板头脑风暴', onClick: () => { setView('whiteboard'); setBottomTab('chats'); } },
        { icon: 'mic', tone: 'music', title: '沉浸式语音房', desc: '低延迟超清语音，实时在线畅聊', onClick: () => { setView('voiceRoom'); setBottomTab('chats'); } },
        { icon: 'bilibili', tone: 'bili', title: 'Bilibili 视频', desc: '搜索与同屏分享高清精彩视频', onClick: () => { setView('video'); setBottomTab('chats'); } },
        { icon: 'music', tone: 'music', title: '网易云音乐空间', desc: '边聊边听，与好友实时同频听歌', onClick: () => setShowMusicPanel(true) },
        { icon: 'image', tone: 'gif', title: '动图表情表情包', desc: '海量精选动态表情，一键发送', onClick: () => { setShowGifPanel(true); } },
        { icon: 'digest', tone: 'news', title: '知乎每日热搜', desc: '实时热搜话题与全网深度精选', onClick: fetchNews },
      ],
    },
    {
      title: '生活与数据看板',
      items: [
        { icon: 'search', tone: 'weather', title: '实时天气预报', desc: '精确气象预报，支持快捷分享到会话', onClick: () => setShowWeatherPanel(true) },
        { icon: 'location', tone: 'map', title: '地图与地理定位', desc: 'GPS 定位导航，实时位置互享', onClick: () => setShowMapPanel(true) },
        { icon: 'stats', tone: 'stats', title: '年度聊天报告', desc: '多维度对话数据沉淀与深度洞察', loading: wrappedLoading ? '加载中...' : '', onClick: fetchWrapped },
        { icon: 'backup', tone: 'backup', title: '聊天记录备份', desc: '安全云端备份与全量消息迁移恢复', onClick: () => setShowBackupModal(true) },
      ],
    },
  ];

  return (
    <div className="discover-page">
      <div className="discover-header">
        <div className="discover-header-title">
          <h2>发现中心</h2>
          <span className="discover-header-subtitle">探索 AI 灵感矩阵与多维协同生态</span>
        </div>
      </div>

      <div className="discover-list">
        {/* 顶部 Hero Banner */}
        <div className="discover-hero-banner" onClick={() => { setView('ai'); setBottomTab('chats'); }}>
          <div className="discover-hero-content">
            <span className="discover-hero-tag">NEW GENERATION</span>
            <h3 className="discover-hero-title">画书 智脑 4.0 协同系统</h3>
            <p className="discover-hero-desc">融合多模态大模型、实时白板共创与端到端加密私密会话</p>
          </div>
          <div className="discover-hero-action">
            <span>立即体验</span>
            <I name="arrowRight" size={16} />
          </div>
        </div>

        {sections.map((section) => (
          <div key={section.title} className="discover-section">
            <div className="discover-section-header">
              <span className="discover-section-title">{section.title}</span>
              {section.badge && <span className={`discover-badge badge-${section.badge.toLowerCase()}`}>{section.badge}</span>}
            </div>
            <div className="discover-grid">
              {section.items.map((item) => (
                <FeatureItem
                  key={item.title}
                  icon={item.icon}
                  tone={item.tone}
                  title={item.title}
                  desc={item.desc}
                  onClick={item.onClick}
                  loading={item.loading}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

