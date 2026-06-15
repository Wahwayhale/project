import React from 'react';
import { I } from '../Icon';

export default function ImageViewer({ imageViewer, setImageViewer, imageViewerNav, downloadImage }) {
  if (!imageViewer) return null;
  return (
    <div className="image-viewer-overlay" onClick={() => setImageViewer(null)}>
      <button className="image-viewer-close" onClick={() => setImageViewer(null)}><I name="close" size={20} color="#fff" /></button>
      {imageViewer.urls?.length > 1 && (
        <>
          <button className="image-viewer-nav prev" onClick={(e) => { e.stopPropagation(); imageViewerNav(-1); }}>‹</button>
          <button className="image-viewer-nav next" onClick={(e) => { e.stopPropagation(); imageViewerNav(1); }}>›</button>
        </>
      )}
      <div className="image-viewer-content" onClick={e => e.stopPropagation()}>
        <img src={imageViewer.url} alt="" />
      </div>
      <div className="image-viewer-tools">
        <button onClick={() => downloadImage(imageViewer.url)}>下载</button>
        {imageViewer.urls?.length > 1 && (
          <button disabled>{(imageViewer.index || 0) + 1} / {imageViewer.urls.length}</button>
        )}
      </div>
    </div>
  );
}
