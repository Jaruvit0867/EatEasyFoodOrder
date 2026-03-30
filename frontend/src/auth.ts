import { API_URL } from "./config";

const TOKEN_KEY = "auth_token";

// Get stored token
export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
}

// Store token
export function setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

// Remove token
export function removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

// Check if user is authenticated
export async function checkAuth(): Promise<boolean> {
    const token = getToken();
    if (!token) return false;

    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: {
                "Authorization": `Bearer ${token}`,
            },
        });
        if (response.ok) {
            const data = await response.json();
            return data.authenticated === true;
        }
        // Token invalid, remove it
        removeToken();
        return false;
    } catch {
        return false;
    }
}

// Login and store token
export async function login(username: string, password: string): Promise<{ success: boolean, error?: string }> {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok && data.token) {
            setToken(data.token);
            return { success: true };
        }

        return { success: false, error: data.detail || "Login failed" };
    } catch {
        return { success: false, error: "Cannot connect to server" };
    }
}

// Logout and redirect to login page
export function logout(): void {
    removeToken();
    window.location.href = "/login";
}

// Get auth headers for API calls
export function getAuthHeaders(baseHeaders: Record<string, string> = {}): Record<string, string> {
    const token = getToken();
    if (token) {
        return { ...baseHeaders, "Authorization": `Bearer ${token}` };
    }
    return baseHeaders;
}
