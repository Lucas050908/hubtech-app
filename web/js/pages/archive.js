/** ARCHIVE-01 — the portable cyberdeck project site, running unchanged inside HUBTECH. */
import { logActivity } from '../core/store.js';
import { siteFrame } from '../features/siteframe.js';

export default {
  title: 'ARCHIVE-01',
  render() {
    logActivity('archive-01', 'open', 'ARCHIVE-01', 'Projektside åbnet');
    return siteFrame({
      app: 'archive-01', title: 'ARCHIVE-01', subtitle: 'Portable cyberdeck · Raspberry Pi CM5', src: 'sites/archive-01/index.html',
      hue: 'var(--hue-archive)', iconName: 'terminal', back: { href: '#/apps', label: 'Tilbage til apps' },
    });
  },
};
