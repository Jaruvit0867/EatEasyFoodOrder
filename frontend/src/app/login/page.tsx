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
            <section className="panel-surface relative w-full max-w-md overflow-hidden rounded-[2rem] p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(202,122,55,0.18),transparent_68%)]" />
                <div className="pointer-events-none absolute -left-12 bottom-8 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(63,123,152,0.12),transparent_72%)]" />

                <div className="relative mb-7 text-center">
                    <p className="section-kicker">Front Counter</p>
                    <div className="mx-auto mb-4 mt-4 flex h-16 w-16 items-center justify-center rounded-[1.6rem] border border-[rgba(202,122,55,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,240,220,0.9))] shadow-[0_16px_36px_rgba(202,122,55,0.14)]">
                        <Store className="h-7 w-7 text-[var(--accent)]" />
                    </div>
                    <h1 className="display-font text-3xl text-[var(--foreground)] sm:text-4xl">เข้าสู่ระบบ</h1>
                    <p className="mt-2 text-sm text-[var(--muted)]">EatEasy Order</p>
                </div>

                <form onSubmit={handleSubmit} className="relative space-y-5">
                    {error && (
                        <div className="rounded-2xl border border-rose-400/20 bg-rose-50 px-4 py-3 text-sm text-[var(--danger)]">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[rgba(63,45,34,0.82)]">Username</label>
                        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(182,142,106,0.18)] bg-[rgba(255,247,237,0.95)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                            <UserRound className="h-5 w-5 text-[var(--muted)]" />
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-transparent text-[var(--foreground)] placeholder:text-[rgba(63,45,34,0.34)] focus:outline-none"
                                placeholder="ชื่อผู้ใช้งาน"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[rgba(63,45,34,0.82)]">Password</label>
                        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(182,142,106,0.18)] bg-[rgba(255,247,237,0.95)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                            <Lock className="h-5 w-5 text-[var(--muted)]" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-transparent text-[var(--foreground)] placeholder:text-[rgba(63,45,34,0.34)] focus:outline-none"
                                placeholder="รหัสผ่าน"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[var(--accent)] via-orange-400 to-[var(--accent-strong)] px-5 py-4 text-base font-semibold text-stone-50 shadow-[0_18px_34px_rgba(202,122,55,0.24)] transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
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
