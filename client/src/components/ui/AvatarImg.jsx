import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { isCapacitor, DEFAULT_AVATAR } from '../../utils/constants';

export default function AvatarImg({ src, alt, className, style }) {
  const [imgSrc, setImgSrc] = useState(src);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src || src === DEFAULT_AVATAR || !src.startsWith('http')) {
      setImgSrc(src || DEFAULT_AVATAR);
      return;
    }
    // 在 App 环境中，使用 axios 获取图片并转换为 blob URL
    if (isCapacitor) {
      axios.get(src, { responseType: 'blob' })
        .then(res => {
          const blobUrl = URL.createObjectURL(res.data);
          setImgSrc(blobUrl);
          setError(false);
        })
        .catch(() => {
          setError(true);
          setImgSrc(DEFAULT_AVATAR);
        });
    } else {
      setImgSrc(src);
    }
  }, [src]);

  if (error) {
    return <img src={DEFAULT_AVATAR} alt={alt} className={className} style={style} />;
  }

  return <img src={imgSrc} alt={alt} className={className} style={style} onError={(e) => { e.target.src = DEFAULT_AVATAR; }} />;
}
