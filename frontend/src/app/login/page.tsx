"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    LoaderCircle,
    Lock,
    Store,
    UserRound,
} from "lucide-react";
import { login } from "../../auth";

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const result = await login(username, password);

        if (result.success) {
            // Redirect to home page on success
            router.push("/");
        } else {
            setError(result.error || "Login failed");
        }

        setLoading(false);
    };

    return (
        <main className="page-frame flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
            <section className="panel-surface w-full max-w-md rounded-[2rem] p-6 sm:p-8">
                <div className="mb-7 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                        <Store className="h-7 w-7 text-[var(--accent)]" />
                    </div>
                    <h1 className="display-font text-3xl text-white sm:text-4xl">เข้าสู่ระบบ</h1>
                    <p className="mt-2 text-sm text-[var(--muted)]">EatEasy Order</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                        <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-white/85">Username</label>
                        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                            <UserRound className="h-5 w-5 text-[var(--muted)]" />
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-transparent text-white placeholder:text-white/30 focus:outline-none"
                                placeholder="ชื่อผู้ใช้งาน"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-white/85">Password</label>
                        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                            <Lock className="h-5 w-5 text-[var(--muted)]" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-transparent text-white placeholder:text-white/30 focus:outline-none"
                                placeholder="รหัสผ่าน"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[var(--accent)] via-orange-400 to-[var(--accent-strong)] px-5 py-4 text-base font-semibold text-stone-950 transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {loading ? (
                            <>
                                <LoaderCircle className="h-5 w-5 animate-spin" />
                                กำลังเข้าสู่ระบบ...
                            </>
                        ) : (
                            <>
                                เข้าสู่ระบบ
                                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                            </>
                        )}
                    </button>
                </form>

            </section>
        </main>
    );
}
