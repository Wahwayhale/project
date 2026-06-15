import React from 'react';
import FeatureItem from './ui/FeatureItem';

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
}) {
  return (
    <div className="discover-page">
      <div className="discover-header"><h2>发现</h2></div>
      <div className="discover-list">
        <div className="discover-section-title">AI 工具</div>
        <FeatureItem icon="ai" tone="ai" title="AI 助手" desc="智能对话助手，支持多模型" onClick={() => { setView('ai'); setBottomTab('chats'); }} />
        <FeatureItem icon="palette" tone="image" title="AI 图片生成" desc="描述你想要的图片，一键生成并分享" onClick={() => setShowImageGen(true)} />
        <FeatureItem icon="digest" tone="digest" title="AI 每日摘要" desc="AI 总结你今天的聊天内容" onClick={fetchDailyDigest} />
        <FeatureItem icon="bot" tone="bot" title="聊天机器人" desc="创建自定义自动回复机器人" onClick={() => { setShowBotModal(true); fetchBots(); }} />

        <div className="discover-section-title">内容分享</div>
        <FeatureItem icon="bilibili" tone="bili" title="B站视频" desc="搜索和分享B站视频" onClick={() => { setView('video'); setBottomTab('chats'); }} />
        <FeatureItem icon="music" tone="music" title="网易云音乐" desc="搜歌、听歌、分享给好友" onClick={() => setShowMusicPanel(true)} />
        <FeatureItem icon="image" tone="gif" title="GIF 表情包" desc="搜索 GIF 发送到聊天" onClick={() => { setShowGifPanel(true); }} />
        <FeatureItem icon="digest" tone="news" title="今日热搜" desc="知乎日报精选内容" onClick={fetchNews} />

        <div className="discover-section-title">生活与社交</div>
        <FeatureItem icon="camera" tone="moments" title="朋友圈" desc="和朋友分享生活点滴" onClick={() => { setShowMoments(true); }} />
        <FeatureItem icon="game" tone="game" title="小游戏" desc="猜拳游戏" onClick={() => { setShowGameModal(true); }} />
        <FeatureItem icon="search" tone="weather" title="天气查询" desc="查询城市天气，分享到聊天" onClick={() => setShowWeatherPanel(true)} />
        <FeatureItem icon="location" tone="map" title="地图" desc="GPS定位、查看地图、分享位置" onClick={() => setShowMapPanel(true)} />

        <div className="discover-section-title">数据管理</div>
        <FeatureItem icon="stats" tone="stats" title="年度聊天报告" desc="查看你的聊天数据统计" loading={wrappedLoading ? '加载中...' : ''} onClick={fetchWrapped} />
        <FeatureItem icon="backup" tone="backup" title="聊天记录管理" desc="备份与恢复聊天记录" onClick={() => setShowBackupModal(true)} />
      </div>
    </div>
  );
}
