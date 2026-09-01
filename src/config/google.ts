/**
 * Google OAuth2 Configuration
 *
 * ⚠️ Đặt VITE_GOOGLE_CLIENT_ID trong file .env (xem .env.example).
 * Xem hướng dẫn tại tab "Hướng dẫn" trong extension.
 *
 * Nếu chưa có client_id, để trống — extension sẽ hiện hướng dẫn setup.
 */
export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
];
