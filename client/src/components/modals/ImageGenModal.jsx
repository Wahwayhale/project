import React from 'react';
import { I } from '../Icon';

export default function ImageGenModal({ showImageGen, setShowImageGen, genPrompt, setGenPrompt, genStyle, setGenStyle, genResult, setGenResult, genLoading, generateImage, shareGeneratedImage }) {
  if (!showImageGen) return null;
  return (
    <div className="modal-overlay" onClick={() => setShowImageGen(false)}>
      <div className="modal ai-image-modal" onClick={e => e.stopPropagation()}>
        <h3><I name="palette" size={20} /> AI 图片生成</h3>
        <div className="form-group"><label>描述词</label><textarea value={genPrompt} onChange={e => setGenPrompt(e.target.value)} placeholder="描述你想生成的图片，例如：a cat wearing sunglasses" rows={2} /></div>
        <div className="form-group"><label>风格（可选）</label><input type="text" value={genStyle} onChange={e => setGenStyle(e.target.value)} placeholder="例如：anime style, watercolor, realistic" /></div>
        {genResult && (
          <div className="image-gen-result">
            <img src={genResult} alt="生成结果" />
            <div className="image-gen-actions">
              <button className="gen-share-btn" onClick={shareGeneratedImage}>发送到聊天</button>
              <button className="gen-retry-btn" onClick={() => setGenResult(null)}>重新生成</button>
            </div>
          </div>
        )}
        <div className="modal-buttons">
          <button className="cancel" onClick={() => { setShowImageGen(false); setGenResult(null); }}>关闭</button>
          {!genResult && <button className="confirm" onClick={generateImage} disabled={genLoading || !genPrompt.trim()}>{genLoading ? '生成中...' : '生成图片'}</button>}
        </div>
      </div>
    </div>
  );
}
