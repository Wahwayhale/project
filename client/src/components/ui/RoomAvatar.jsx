import React from 'react';

export default function RoomAvatar({ name, size = 'md' }) {
  return (
    <div className={`room-avatar room-avatar-${size}`}>
      {(name || '群')[0]}
    </div>
  );
}
