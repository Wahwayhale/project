import React from 'react';
import { iconProps, iconMap } from '../config/icons';

export function I({ name, size = 24, color, className, style, ...rest }) {
  const p = { ...iconProps, size, color: color || 'currentColor', className, style, ...rest };
  const Comp = iconMap[name] || iconMap.chat;
  return <Comp {...p} />;
}
