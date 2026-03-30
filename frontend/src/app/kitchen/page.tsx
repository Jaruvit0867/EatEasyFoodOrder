"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Check,
    ChefHat,
    Clock3,
    LogOut,
    Package,
    Printer,
    RefreshCcw,
    UtensilsCrossed,
    X,
} from "lucide-react";
import { API_URL } from "../../config";
import { checkAuth, getAuthHeaders, logout } from "../../auth";

const BACKEND_URL = API_URL;

interface AddOn {
    name: string;
    price: number;
}

interface OrderItem {
    menu_name: string;
    quantity: number;
    note?: string;
    price: number;
    add_ons: AddOn[];
}

interface Order {
    id: number;
    items: OrderItem[];
    total_price: number;
    created_at: string;
}

export default function KitchenPage() {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    // Check authentication on mount
    useEffect(() => {
        const verifyAuth = async () => {
            const authenticated = await checkAuth();
            if (!authenticated) {
                router.push("/login");
            } else {
                setIsAuthenticated(true);
            }
            setAuthLoading(false);
        };
        verifyAuth();
    }, [router]);

    const fetchOrders = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/orders/pending`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                setOrders(data.orders);
            }
        } catch (error) {
            console.error("Error fetching orders:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async (orderId: number) => {
        try {
            await fetch(`${BACKEND_URL}/orders/${orderId}/complete`, {
                method: "POST",
                headers: getAuthHeaders(),
            });
            fetchOrders();
        } catch (error) {
            console.error("Error completing order:", error);
        }
    };

    const handleCancel = async (orderId: number) => {
        if (!confirm("ต้องการยกเลิกออเดอร์นี้?")) return;
        try {
            await fetch(`${BACKEND_URL}/orders/${orderId}/cancel`, {
                method: "POST",
                headers: getAuthHeaders(),
            });
            fetchOrders();
        } catch (error) {
            console.error("Error cancelling order:", error);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchOrders();
            const interval = setInterval(fetchOrders, 5000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated]);

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    };


    const handlePrint = (order: Order) => {
        const printWindow = window.open("", "_blank", "width=400,height=600");
        if (!printWindow) return;

        const itemsHtml = order.items.map(item => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>${item.quantity}x ${item.menu_name}</span>
                <span>${item.price}</span>
            </div>
            ${item.add_ons.map(addon => `
                <div style="font-size: 12px; color: #555; padding-left: 20px;">
                    + ${addon.name} (${addon.price})
                </div>
            `).join("")}
            ${item.note ? `<div style="font-size: 12px; color: red; padding-left: 20px;">* ${item.note}</div>` : ""}
        `).join("");

        const htmlContent = `
            <html>
            <head>
                <title>Order Receipt #${order.id}</title>
                <style>
                    body { font-family: 'Courier New', monospace; padding: 20px; width: 300px; margin: 0 auto; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                    .title { font-size: 20px; font-weight: bold; }
                    .info { font-size: 12px; margin-bottom: 5px; }
                    .items { margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                    .total { display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 10px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; border-top: 1px dashed #000; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="title">เจ๊ดา อาหารตามสั่ง</div>
                    <div style="font-size: 12px;">Original Thai Food</div>
                </div>
                <div class="info">ORDER: #${order.id}</div>
                <div class="info">DATE: ${new Date(order.created_at).toLocaleString("th-TH")}</div>
                <div class="info">--------------------------------</div>
                
                <div class="items">
                    ${itemsHtml}
                </div>

                <div class="total">
                    <span>TOTAL</span>
                    <span>${order.total_price} B</span>
                </div>

                <div class="footer">
                    * THANK YOU *
                </div>
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

    // Show loading while checking auth
    if (authLoading) {
        return (
            <main className="page-frame flex min-h-screen items-center justify-center px-4 py-8">
                <div className="panel-surface flex w-full max-w-md items-center justify-center gap-3 rounded-[2rem] px-6 py-8 text-[var(--muted)]">
                    <RefreshCcw className="h-5 w-5 animate-spin text-[var(--accent)]" />
                    กำลังตรวจสอบสิทธิ์...
                </div>
            </main>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="page-frame min-h-screen px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5">
                <header className="panel-surface rounded-[2rem] px-6 py-6 sm:px-8">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--muted)]">
                                <ChefHat className="h-4 w-4 text-[var(--accent)]" />
                                Kitchen
                            </div>
                            <div>
                                <h1 className="display-font text-3xl text-white sm:text-4xl">คิวครัว</h1>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/18 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-100">
                                <RefreshCcw className="h-4 w-4 animate-spin" />
                                อัปเดตอัตโนมัติทุก 5 วินาที
                            </div>
                            <button
                                onClick={logout}
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                            >
                                <LogOut className="h-4 w-4" />
                                ออกจากระบบ
                            </button>
                        </div>
                    </div>
                </header>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="panel-surface-soft rounded-[1.6rem] p-5">
                        <p className="mb-2 text-sm text-[var(--muted)]">ออเดอร์รอทำ</p>
                        <p className="text-3xl font-bold text-white">{orders.length}</p>
                    </div>
                    <div className="panel-surface-soft rounded-[1.6rem] p-5">
                        <p className="mb-2 text-sm text-[var(--muted)]">กลับบ้าน</p>
                        <p className="text-3xl font-bold text-[var(--accent)]">
                            {orders.filter((order) => order.items.some((item) => item.note && item.note.includes("ใส่กล่องกลับบ้าน"))).length}
                        </p>
                    </div>
                    <div className="panel-surface-soft rounded-[1.6rem] p-5">
                        <p className="mb-2 text-sm text-[var(--muted)]">ทานที่ร้าน</p>
                        <p className="text-3xl font-bold text-[var(--info)]">
                            {orders.filter((order) => !order.items.some((item) => item.note && item.note.includes("ใส่กล่องกลับบ้าน"))).length}
                        </p>
                    </div>
                </div>

                <section className="panel-surface rounded-[2rem] p-4 sm:p-6">
                    {loading && orders.length === 0 ? (
                        <div className="flex items-center justify-center gap-3 py-20 text-[var(--muted)]">
                            <RefreshCcw className="h-5 w-5 animate-spin text-[var(--accent)]" />
                            กำลังโหลดข้อมูล...
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/10 px-6 py-20 text-center">
                            <ChefHat className="mb-5 h-16 w-16 text-[var(--muted)]" />
                            <h2 className="text-2xl font-bold text-white">ตอนนี้ยังไม่มีคิวในครัว</h2>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                            {orders.map((order) => {
                                const isTakeaway = order.items.some(item => item.note && item.note.includes("ใส่กล่องกลับบ้าน"));
                                const TypeIcon = isTakeaway ? Package : UtensilsCrossed;

                                return (
                                    <article
                                        key={order.id}
                                        className={`panel-surface-soft overflow-hidden rounded-[1.75rem] border transition-transform duration-200 hover:-translate-y-0.5 ${isTakeaway ? "border-[rgba(243,162,79,0.22)]" : "border-white/6"}`}
                                    >
                                        <div className={`border-b px-5 py-4 ${isTakeaway ? "border-[rgba(243,162,79,0.22)] bg-[rgba(243,162,79,0.08)]" : "border-white/6 bg-white/4"}`}>
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="mb-2 flex items-center gap-2">
                                                        <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-sm font-semibold text-white">
                                                            ออเดอร์ #{order.id}
                                                        </span>
                                                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${isTakeaway ? "bg-[rgba(243,162,79,0.18)] text-[var(--accent)]" : "bg-sky-400/12 text-sky-200"}`}>
                                                            <TypeIcon className="h-3.5 w-3.5" />
                                                            {isTakeaway ? "กลับบ้าน" : "ทานที่ร้าน"}
                                                        </span>
                                                    </div>
                                                    <div className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                                                        <Clock3 className="h-4 w-4" />
                                                        {formatTime(order.created_at)}
                                                    </div>
                                                </div>
                                                <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-2 text-right">
                                                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">รวม</p>
                                                    <p className="text-2xl font-bold text-[var(--accent)]">{order.total_price}.-</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4 p-5">
                                            {order.items.map((item, idx) => {
                                                const cleanNote = item.note?.replace("ใส่กล่องกลับบ้าน", "").replace(/,\s*$/, "").replace(/^,\s*/, "").trim();

                                                return (
                                                    <div key={idx} className="rounded-[1.25rem] border border-white/6 bg-black/10 p-4">
                                                        <div className="flex items-start gap-4">
                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-base font-bold text-white">
                                                                {item.quantity}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-lg font-bold text-white leading-tight">
                                                                    {item.menu_name}
                                                                </div>
                                                                {item.add_ons.length > 0 && (
                                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                                        {item.add_ons.map((addon, aIdx) => (
                                                                            <span
                                                                                key={aIdx}
                                                                                className="rounded-full border border-emerald-400/18 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100"
                                                                            >
                                                                                + {addon.name}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                {cleanNote && (
                                                                    <div className="mt-3 inline-flex rounded-full border border-rose-400/18 bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-100">
                                                                        {cleanNote}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 border-t border-white/6 p-4">
                                            <button
                                                onClick={() => handleCancel(order.id)}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-400/18 bg-rose-400/10 px-3 py-3 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-400/16"
                                            >
                                                <X className="h-4 w-4" />
                                                ยกเลิก
                                            </button>
                                            <button
                                                onClick={() => handlePrint(order)}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                                            >
                                                <Printer className="h-4 w-4" />
                                                พิมพ์
                                            </button>
                                            <button
                                                onClick={() => handleComplete(order.id)}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-300 to-emerald-400 px-3 py-3 text-sm font-bold text-emerald-950 transition-transform hover:-translate-y-0.5"
                                            >
                                                <Check className="h-4 w-4" />
                                                เสร็จแล้ว
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
