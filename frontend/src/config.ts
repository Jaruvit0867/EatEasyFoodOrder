// All frontend traffic goes through the same /api path.
// Local development uses a Next.js rewrite and Azure Static Web Apps
// proxies the same path to the linked backend in production.
export const API_URL = "/api";
