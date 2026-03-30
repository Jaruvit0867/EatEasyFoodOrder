const publicApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

const isLocalDevHost = typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

// Local development uses the Next.js rewrite. Static deployments call the backend directly.
export const API_URL = isLocalDevHost
  ? "/api"
  : publicApiUrl || "https://eateasy-backend.azurewebsites.net";
