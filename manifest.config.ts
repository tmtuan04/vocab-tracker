import { defineManifest } from '@crxjs/vite-plugin';
import { loadEnv } from 'vite';
import packageJson from './package.json';
import { GOOGLE_SCOPES } from './src/config/google';

const GOOGLE_CLIENT_ID =
  loadEnv(process.env.MODE ?? 'development', process.cwd(), '')
    .VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

export default defineManifest({
  manifest_version: 3,
  name: 'Personal Vocabulary Tracker',
  description:
    'Track vocabulary encounters: save words with context and see how many times you have met them.',
  version: packageJson.version,
  icons: {
    '16': 'public/icons/icon16.png',
    '48': 'public/icons/icon48.png',
    '128': 'public/icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'public/icons/icon16.png',
      '48': 'public/icons/icon48.png',
      '128': 'public/icons/icon128.png',
    },
    default_title: 'Vocabulary Tracker',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: [
    'contextMenus',
    'storage',
    'sidePanel',
    'activeTab',
    'scripting',
    'tabs',
    'identity',
  ],
  host_permissions: ['<all_urls>', 'https://api.dictionaryapi.dev/*'],
  // OAuth2: user đăng nhập bằng Google account của họ
  ...(GOOGLE_CLIENT_ID
    ? {
        oauth2: {
          client_id: GOOGLE_CLIENT_ID,
          scopes: GOOGLE_SCOPES,
        },
      }
    : {}),
  web_accessible_resources: [
    {
      resources: ['public/icons/icon16.png', 'public/icons/icon48.png', 'public/icons/icon128.png'],
      matches: ['<all_urls>'],
    },
  ],
  commands: {
    'save-selection': {
      suggested_key: {
        default: 'Alt+S',
      },
      description: 'Save selected word to vocabulary',
    },
  },
});
