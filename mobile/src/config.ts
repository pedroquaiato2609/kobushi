// URL base da API — a mesma usada pelo app web, só que absoluta (o app nativo não tem "mesma origem").
// Pode trocar em tempo de build com EXPO_PUBLIC_API_URL (ex.: apontar pra um stack local de teste).
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://kobushi.vps-kinghost.net/api';
