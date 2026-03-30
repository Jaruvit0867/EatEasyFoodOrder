"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    LoaderCircle,
    Lock,
    ShieldCheck,
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
        <main className="page-frame min-h-screen px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
                <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                    <section className="panel-surface hidden rounded-[2rem] p-10 lg:flex lg:flex-col lg:justify-between">
                        <div className="space-y-8">
                            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--muted)]">
                                <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
                                ระบบจัดการภายในร้าน
                            </div>

                            <div className="space-y-5">
                                <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-amber-200/20 via-orange-400/10 to-rose-500/20">
                                    <Store className="h-8 w-8 text-[var(--accent)]" />
                                </div>
                                <div>
                                    <p className="section-kicker mb-3">EatEasy Order</p>
                                    <h1 className="display-font max-w-xl text-4xl leading-tight text-white xl:text-5xl">
                                        แผงควบคุมร้านอาหารที่ดูเป็นร้านจริง ไม่ใช่หน้าเดโม
                                    </h1>
                                </div>
                                <p className="max-w-xl text-base leading-7 text-[var(--muted)]">
                                    หน้า admin ชุดนี้ใช้สำหรับจัดการออเดอร์ ดูสถิติ และเชื่อม flow หน้าครัวกับหน้าสั่งอาหารให้ทำงานต่อเนื่องในร้านเดียวกัน
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            {[
                                ["เสียงสั่งอาหาร", "รับออเดอร์ภาษาไทยแบบรวดเร็ว"],
                                ["หน้าครัว", "อัปเดตสถานะออเดอร์แบบสด"],
                                ["แดชบอร์ดร้าน", "ดูยอดขายและจัดการเมนู"],
                            ].map(([title, description]) => (
                                <div
                                    key={title}
                                    className="rounded-[1.5rem] border border-white/8 bg-white/4 p-4"
                                >
                                    <p className="mb-1 text-sm font-semibold text-white">{title}</p>
                                    <p className="text-sm leading-6 text-[var(--muted)]">{description}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="panel-surface mx-auto w-full max-w-xl rounded-[2rem] p-6 sm:p-8 lg:p-10">
                        <div className="mb-8 flex items-start justify-between gap-4">
                            <div>
                                <p className="section-kicker mb-3">Admin Sign In</p>
                                <h2 className="display-font text-3xl text-white sm:text-4xl">
                                    เข้าสู่ระบบผู้ดูแล
                                </h2>
                                <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
                                    ใช้บัญชีของร้านเพื่อเข้าหน้าสั่งอาหาร หน้าครัว และแดชบอร์ดโดยคงสิทธิ์เดิมทั้งหมด
                                </p>
                            </div>
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                                <ShieldCheck className="h-7 w-7 text-[var(--accent)]" />
                            </div>
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

                        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-4 text-sm text-[var(--muted)]">
                            <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--accent)]" />
                            สำหรับเจ้าของร้านหรือผู้ดูแลระบบเท่านั้น
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
