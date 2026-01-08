// Runtime configuration for API URL
// This file is used to configure the backend URL at build time
// When deploying to Azure, change this URL to your App Service URL

export const API_URL = typeof window !== 'undefined'
    ? (window.location.hostname === 'localhost'
        ? '/api' // Local development uses Next.js rewrite
        : 'https://eateasy-backend.azurewebsites.net') // Production Azure backend
    : '/api'; // Server-side fallback
