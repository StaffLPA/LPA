import React from 'react';
import { Circle, Path, Rect, Svg } from 'react-native-svg';

export type LpaIconName =
  | 'home'
  | 'message-circle'
  | 'calendar'
  | 'grid'
  | 'clipboard'
  | 'menu'
  | 'file-text'
  | 'users'
  | 'arrow-up-right'
  | 'search'
  | 'edit-3'
  | 'trash-2'
  | 'bookmark'
  | 'chevron-right'
  | 'message-square'
  | 'arrow-left'
  | 'camera'
  | 'check'
  | 'lock'
  | 'log-out'
  | 'x'
  | 'chevron-down'
  | 'edit-2'
  | 'refresh-cw'
  | 'send'
  | 'user-plus'
  | 'x-circle'
  | 'download'
  | 'paperclip'
  | 'plus'
  | 'chevron-left'
  | 'map-pin'
  | 'external-link'
  | 'layout'
  | 'mail'
  | 'phone'
  | 'alert-circle'
  | 'chevron-up'
  | 'clock'
  | 'award'
  | 'book-open'
  | 'heart'
  | 'image'
  | 'arrow-up';

export function LpaIcon({ name, size = 20, color, strokeWidth = 1.9 }: {
  name: LpaIconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (name) {
      case 'home':
        return <Path d="M3.5 10.2 12 3.8l8.5 6.4v8.1a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7v-8.1Z M8.5 20v-5.8h7V20" {...common} />;
      case 'message-circle':
        return <Path d="M19.5 11.2a7.5 7.5 0 0 1-8 7.3 8.7 8.7 0 0 1-3.2-.6L4 19.5l1.3-3.8a7 7 0 0 1-1.3-4.1 7.5 7.5 0 0 1 8-7.3 7.5 7.5 0 0 1 7.5 6.9Z" {...common} />;
      case 'calendar':
        return <><Rect x="3.5" y="5.2" width="17" height="15.2" rx="2" {...common} /><Path d="M7.5 3.5v3.4M16.5 3.5v3.4M3.8 9.2h16.4" {...common} /></>;
      case 'grid':
        return <><Rect x="4" y="4" width="6" height="6" rx="1" {...common} /><Rect x="14" y="4" width="6" height="6" rx="1" {...common} /><Rect x="4" y="14" width="6" height="6" rx="1" {...common} /><Rect x="14" y="14" width="6" height="6" rx="1" {...common} /></>;
      case 'clipboard':
        return <><Rect x="5" y="4.5" width="14" height="16" rx="2" {...common} /><Path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" {...common} /></>;
      case 'menu':
        return <><Path d="M5 7h14M5 12h14M5 17h14" {...common} /></>;
      case 'file-text':
        return <><Path d="M6 3.5h8l4 4v13H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5Z M14 3.5v4h4M8 12h8M8 16h6" {...common} /></>;
      case 'users':
        return <><Circle cx="9" cy="9" r="3.2" {...common} /><Path d="M3.8 19.5c.5-3 2.2-4.5 5.2-4.5s4.7 1.5 5.2 4.5M15.5 6.3a3 3 0 0 1 0 5.7M16 15.3c2.4.3 3.8 1.7 4.2 4.2" {...common} /></>;
      case 'arrow-up-right':
        return <><Path d="M6 18 18 6M9 6h9v9" {...common} /></>;
      case 'search':
        return <><Circle cx="10.7" cy="10.7" r="6.5" {...common} /><Path d="m16 16 4.5 4.5" {...common} /></>;
      case 'edit-3':
        return <><Path d="m4 16.8-.8 3.8 3.8-.8L18.8 8a2.7 2.7 0 0 0-3.8-3.8L4 16.8Z M13.5 5.5l5 5" {...common} /></>;
      case 'trash-2':
        return <><Path d="M4.5 7h15M9 3.8h6l1 3.2H8l1-3.2ZM6.5 7l.8 13h9.4l.8-13M10 10.5v6M14 10.5v6" {...common} /></>;
      case 'bookmark':
        return <Path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5v16l-6-3.5-6 3.5v-16Z" {...common} />;
      case 'chevron-right':
        return <Path d="m9 5 7 7-7 7" {...common} />;
      case 'message-square':
        return <Path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.3A2.5 2.5 0 0 1 4 13.5v-8Z" {...common} />;
      case 'arrow-left':
        return <Path d="M19 12H5M11 18l-6-6 6-6" {...common} />;
      case 'camera':
        return <><Path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-2h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" {...common} /><Circle cx="12" cy="12.5" r="3" {...common} /></>;
      case 'check':
        return <Path d="m5 12.5 4.3 4.3L19 7" {...common} />;
      case 'lock':
        return <><Rect x="5" y="10" width="14" height="10" rx="2" {...common} /><Path d="M8 10V7a4 4 0 0 1 8 0v3" {...common} /></>;
      case 'log-out':
        return <><Path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M14 8l4 4-4 4M18 12H9" {...common} /></>;
      case 'x':
        return <Path d="m6 6 12 12M18 6 6 18" {...common} />;
      case 'chevron-down':
        return <Path d="m5 9 7 7 7-7" {...common} />;
      case 'edit-2':
        return <Path d="m4 16.8-.8 3.8 3.8-.8L18.8 8a2.7 2.7 0 0 0-3.8-3.8L4 16.8Z M13.5 5.5l5 5" {...common} />;
      case 'refresh-cw':
        return <Path d="M19 8a7.5 7.5 0 0 0-12.8-1.8L4 8.5M4 4.5v4h4M5 16a7.5 7.5 0 0 0 12.8 1.8l2.2-2.3M20 19.5v-4h-4" {...common} />;
      case 'send':
        return <Path d="m21 3-7.2 18-3.4-7.4L3 10.2 21 3ZM10.4 13.6 21 3" {...common} />;
      case 'user-plus':
        return <><Circle cx="9" cy="8" r="3.2" {...common} /><Path d="M3.8 19.5c.5-3 2.2-4.5 5.2-4.5 2.1 0 3.6.7 4.5 2M18 11v6M15 14h6" {...common} /></>;
      case 'x-circle':
        return <><Circle cx="12" cy="12" r="8.5" {...common} /><Path d="m9 9 6 6M15 9l-6 6" {...common} /></>;
      case 'download':
        return <><Path d="M12 3v12M7 10l5 5 5-5M5 20h14" {...common} /></>;
      case 'paperclip':
        return <Path d="m19 11-7.5 7.5a5 5 0 0 1-7-7L12 4a3.5 3.5 0 0 1 5 5l-7.5 7.5a2 2 0 0 1-2.8-2.8l7-7" {...common} />;
      case 'plus':
        return <Path d="M12 5v14M5 12h14" {...common} />;
      case 'chevron-left':
        return <Path d="m15 5-7 7 7 7" {...common} />;
      case 'map-pin':
        return <><Path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" {...common} /><Circle cx="12" cy="10" r="2.2" {...common} /></>;
      case 'external-link':
        return <><Path d="M14 4h6v6M20 4l-9 9" {...common} /><Path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" {...common} /></>;
      case 'layout':
        return <><Rect x="4" y="4" width="16" height="16" rx="2" {...common} /><Path d="M4 9h16M10 9v11" {...common} /></>;
      case 'mail':
        return <><Rect x="4" y="6" width="16" height="13" rx="2" {...common} /><Path d="m5 8 7 5 7-5" {...common} /></>;
      case 'phone':
        return <Path d="M7 4.5 9.5 7l-1.4 2.3a12 12 0 0 0 6.6 6.6l2.3-1.4 2.5 2.5-1.6 2.2a2.5 2.5 0 0 1-2.7.9C9.8 18.4 5.6 14.2 3.9 8.8a2.5 2.5 0 0 1 .9-2.7L7 4.5Z" {...common} />;
      case 'alert-circle':
        return <><Circle cx="12" cy="12" r="8.5" {...common} /><Path d="M12 8v5M12 16.5v.1" {...common} /></>;
      case 'chevron-up':
        return <Path d="m5 15 7-7 7 7" {...common} />;
      case 'clock':
        return <><Circle cx="12" cy="12" r="8.5" {...common} /><Path d="M12 7v5l3.3 2" {...common} /></>;
      case 'award':
        return <><Circle cx="12" cy="9" r="5.5" {...common} /><Path d="m8.5 13.2-1 7 4.5-2.4 4.5 2.4-1-7" {...common} /><Path d="m10 9 1.3 1.3L14.5 7" {...common} /></>;
      case 'book-open':
        return <><Path d="M12 6.2C9.7 4.8 7.2 4.8 4.5 6v13c2.7-1.2 5.2-1.2 7.5.2M12 6.2C14.3 4.8 16.8 4.8 19.5 6v13c-2.7-1.2-5.2-1.2-7.5.2" {...common} /></>;
      case 'heart':
        return <Path d="M20 8.6c0 5-8 10.4-8 10.4S4 13.6 4 8.6A4.1 4.1 0 0 1 12 7a4.1 4.1 0 0 1 8 1.6Z" {...common} />;
      case 'image':
        return <><Rect x="4" y="4" width="16" height="16" rx="2" {...common} /><Circle cx="9" cy="9" r="1.6" {...common} /><Path d="m5 18 5-5 3 3 2-2 4 4" {...common} /></>;
      case 'arrow-up':
        return <Path d="M12 19V5M6 11l6-6 6 6" {...common} />;
    }
  })();

  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">{body}</Svg>;
}