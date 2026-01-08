import { API_URL } from "./config";

// Check if user is authenticated
export async function checkAuth(): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            credentials: "include",
        });
        if (response.ok) {
            const data = await response.json();
            return data.authenticated === true;
        }
        return false;
    } catch {
        return false;
    }
}

// Logout and redirect to login page
export async function logout(): Promise<void> {
    try {
        await fetch(`${API_URL}/auth/logout`, {
            method: "POST",
            credentials: "include",
        });
    } catch {
        // Ignore errors
    }
    window.location.href = "/login";
}
