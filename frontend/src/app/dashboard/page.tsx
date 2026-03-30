"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    BarChart3,
    CircleAlert,
    CircleCheckBig,
    CircleDollarSign,
    ClipboardList,
    Clock3,
    History,
    LogOut,
    Pencil,
    Plus,
    RefreshCcw,
    Trash2,
    TrendingUp,
    X,
} from "lucide-react";
import { API_URL } from "../../config";
import { checkAuth, getAuthHeaders, logout } from "../../auth";

const BACKEND_URL = API_URL;

interface MenuItem {
    id: number;
    name: string;
    keywords: string;
    base_price: number;
    category: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface OrderItemInfo {
    menu_name: string;
    quantity: number;
    price: number;
    note?: string;
    add_ons: { name: string; price: number; selected: boolean }[];
}

interface Order {
    id: number;
    items: OrderItemInfo[];
    total_price: number;
    status: "pending" | "completed" | "cancelled";
    created_at: string;
}

interface OrderStats {
    total: number;
    completed: number;
    cancelled: number;
    pending: number;
    revenue: number;
}

interface TopItem {
    name: string;
    count: number;
    revenue: number;
}

interface DailySale {
    date: string;
    orders: number;
    revenue: number;
}

type TabType = "stats" | "menu" | "logs";
type ScopeType = "today" | "7days" | "30days" | "all";

export default function DashboardPage() {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>("stats");
    const [scope, setScope] = useState<ScopeType>("7days");
    const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
    const [topItems, setTopItems] = useState<TopItem[]>([]);
    const [dailySales, setDailySales] = useState<DailySale[]>([]);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        keywords: "",
        base_price: 50,
        category: "standard"
    });
    const [selectedCategory, setSelectedCategory] = useState<string>("all");

    const scopeDays = scope === "today" ? 1 : scope === "7days" ? 7 : scope === "30days" ? 30 : 365;

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


    // Fetch order stats
    const fetchOrderStats = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/analytics/order-stats?days=${scopeDays}`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                setOrderStats(data.data);
            }
        } catch (error) {
            console.error("Error fetching order stats:", error);
        }
    };

    // Fetch analytics
    const fetchAnalytics = async () => {
        try {
            const [topRes, dailyRes] = await Promise.all([
                fetch(`${BACKEND_URL}/analytics/top-items?limit=10&days=${scopeDays}`, {
                    headers: getAuthHeaders(),
                }),
                fetch(`${BACKEND_URL}/analytics/daily-sales?days=${scopeDays}`, {
                    headers: getAuthHeaders(),
                })
            ]);

            const topData = await topRes.json();
            const dailyData = await dailyRes.json();

            if (topData.success) setTopItems(topData.data);
            if (dailyData.success) setDailySales(dailyData.data);
        } catch (error) {
            console.error("Error fetching analytics:", error);
        }
    };

    // Fetch menu items
    const fetchMenuItems = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/menu-items`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                setMenuItems(data.items);
            }
        } catch (error) {
            console.error("Error fetching menu:", error);
        }
    };

    // Fetch all orders
    const fetchOrders = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/orders`, {
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                setOrders(data.orders);
            }
        } catch (error) {
            console.error("Error fetching orders:", error);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchOrderStats(), fetchAnalytics(), fetchMenuItems(), fetchOrders()]);
            setLoading(false);
        };
        loadData();
    }, [scope]);

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingItem) {
                await fetch(`${BACKEND_URL}/menu-items/${editingItem.id}`, {
                    method: "PUT",
                    headers: getAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify(formData)
                });
            } else {
                await fetch(`${BACKEND_URL}/menu-items`, {
                    method: "POST",
                    headers: getAuthHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify(formData)
                });
            }
            setShowModal(false);
            setEditingItem(null);
            setFormData({ name: "", keywords: "", base_price: 50, category: "standard" });
            fetchMenuItems();
        } catch (error) {
            console.error("Error saving menu item:", error);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("ต้องการลบเมนูนี้ใช่หรือไม่?")) return;
        try {
            await fetch(`${BACKEND_URL}/menu-items/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders(),
            });
            fetchMenuItems();
        } catch (error) {
            console.error("Error deleting:", error);
        }
    };

    const handleToggleActive = async (item: MenuItem) => {
        try {
            await fetch(`${BACKEND_URL}/menu-items/${item.id}`, {
                method: "PUT",
                headers: getAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ is_active: !item.is_active })
            });
            fetchMenuItems();
        } catch (error) {
            console.error("Error toggling:", error);
        }
    };

    const openEditModal = (item: MenuItem) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            keywords: item.keywords,
            base_price: item.base_price,
            category: item.category
        });
        setShowModal(true);
    };

    const openAddModal = () => {
        setEditingItem(null);
        setFormData({ name: "", keywords: "", base_price: 50, category: "standard" });
        setShowModal(true);
    };

    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case "standard": return "bg-green-500/20 text-green-400 border-green-500/30";
            case "premium": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
            case "special": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
            case "soup": return "bg-red-500/20 text-red-400 border-red-500/30";
            case "salad": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
            case "kapkhao": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
            default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
        }
    };

    const maxRevenue = Math.max(...dailySales.map(d => d.revenue), 1);
    const scopeOptions: { value: ScopeType; label: string }[] = [
        { value: "today", label: "วันนี้" },
        { value: "7days", label: "7 วัน" },
        { value: "30days", label: "30 วัน" },
        { value: "all", label: "ทั้งหมด" },
    ];
    const tabOptions: { value: TabType; label: string; icon: typeof BarChart3 }[] = [
        { value: "stats", label: "สถิติออเดอร์", icon: BarChart3 },
        { value: "menu", label: "จัดการเมนู", icon: ClipboardList },
        { value: "logs", label: "ประวัติออเดอร์", icon: History },
    ];
    const filteredMenuItems = menuItems.filter(
        (item) => selectedCategory === "all" || item.category === selectedCategory
    );

    const handleResetOrders = async () => {
        const confirmText = "คำเตือน: คุณต้องการลบข้อมูลออเดอร์ทั้งหมดใช่หรือไม่?\n\nการกระทำนี้ไม่สามารถย้อนกลับได้ ข้อมูลยอดขายและสถิติทั้งหมดจะหายไป!";
        if (!confirm(confirmText)) return;

        // Double confirm
        if (!confirm("กรุณายืนยันอีกครั้งว่าจะลบข้อมูลจริงๆ?")) return;

        try {
            const res = await fetch(`${BACKEND_URL}/orders/delete-all`, {
                method: "DELETE",
                headers: getAuthHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                alert("ล้างข้อมูลสำเร็จเรียบร้อย");
                fetchOrderStats();
                fetchAnalytics();
            } else {
                alert("เกิดข้อผิดพลาด: " + data.error);
            }
        } catch (error) {
            console.error("Error resetting orders:", error);
            alert("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์");
        }
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
        return null; // Will redirect
    }

    return (
        <div className="page-frame min-h-screen px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
                <header className="panel-surface rounded-[2rem] px-6 py-6 sm:px-8">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--muted)]">
                                <BarChart3 className="h-4 w-4 text-[var(--accent)]" />
                                ศูนย์ควบคุมร้านอาหาร
                            </div>
                            <div>
                                <p className="section-kicker mb-3">Dashboard</p>
                                <h1 className="display-font text-3xl text-white sm:text-4xl">
                                    ภาพรวมร้าน เมนู และประวัติการขาย
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                                    ใช้ดูสถิติออเดอร์ ปรับเมนู และเช็กความเคลื่อนไหวของร้านจากจุดเดียว โดยคง endpoint และ flow เดิมทั้งหมด
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={handleResetOrders}
                                className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-400/16"
                            >
                                <Trash2 className="h-4 w-4" />
                                ล้างข้อมูล
                            </button>
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

                <div className="panel-surface-soft rounded-[1.75rem] p-2">
                    <div className="flex flex-wrap gap-2">
                        {tabOptions.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.value;
                            return (
                                <button
                                    key={tab.value}
                                    onClick={() => setActiveTab(tab.value)}
                                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all ${isActive
                                        ? "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] text-stone-950 shadow-lg"
                                        : "text-[var(--muted)] hover:bg-white/6 hover:text-white"
                                        }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <main className="panel-surface rounded-[2rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                {loading ? (
                    <div className="flex items-center justify-center gap-3 py-20 text-[var(--muted)]">
                        <RefreshCcw className="h-5 w-5 animate-spin text-[var(--accent)]" />
                        กำลังโหลดข้อมูล...
                    </div>
                ) : activeTab === "stats" ? (
                    /* ============ STATS TAB ============ */
                    <div>
                        {/* Scope Selector */}
                        <div className="mb-6 flex justify-end">
                            <div className="inline-flex flex-wrap rounded-2xl border border-white/8 bg-white/4 p-1.5">
                                {scopeOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => setScope(option.value)}
                                        className={`rounded-2xl px-4 py-2 text-sm font-semibold transition-colors ${scope === option.value
                                            ? "bg-white text-stone-950"
                                            : "text-[var(--muted)] hover:text-white"
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Order Stats Cards */}
                        {orderStats && (
                            <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                                {[
                                    {
                                        label: "ออเดอร์ทั้งหมด",
                                        value: orderStats.total,
                                        tone: "text-white",
                                        icon: ClipboardList,
                                    },
                                    {
                                        label: "รอดำเนินการ",
                                        value: orderStats.pending,
                                        tone: "text-[var(--warning)]",
                                        icon: Clock3,
                                    },
                                    {
                                        label: "เสร็จสิ้น",
                                        value: orderStats.completed,
                                        tone: "text-[var(--success)]",
                                        icon: CircleCheckBig,
                                    },
                                    {
                                        label: "ยกเลิก",
                                        value: orderStats.cancelled,
                                        tone: "text-[var(--danger)]",
                                        icon: CircleAlert,
                                    },
                                    {
                                        label: "รายได้รวม",
                                        value: `${orderStats.revenue.toLocaleString()}฿`,
                                        tone: "text-[var(--accent)]",
                                        icon: CircleDollarSign,
                                    },
                                ].map((card) => {
                                    const Icon = card.icon;
                                    return (
                                        <div
                                            key={card.label}
                                            className="panel-surface-soft rounded-[1.6rem] p-5"
                                        >
                                            <div className="mb-4 flex items-center justify-between">
                                                <p className="text-sm text-[var(--muted)]">{card.label}</p>
                                                <div className="rounded-2xl border border-white/8 bg-white/5 p-2">
                                                    <Icon className={`h-4 w-4 ${card.tone}`} />
                                                </div>
                                            </div>
                                            <p className={`text-3xl font-bold ${card.tone}`}>{card.value}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="grid gap-6 lg:grid-cols-2">
                            {/* Daily Sales Chart */}
                            <div className="panel-surface-soft rounded-[1.75rem] p-6">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="rounded-2xl border border-white/8 bg-white/5 p-2">
                                        <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">ยอดขายรายวัน</h3>
                                        <p className="text-sm text-[var(--muted)]">เปรียบเทียบรายได้ตามช่วงเวลาที่เลือก</p>
                                    </div>
                                </div>
                                <div className="h-48 flex items-end gap-1">
                                    {dailySales.slice(-14).map((day, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                            <div
                                                className="w-full rounded-t-[0.85rem] bg-gradient-to-t from-[var(--accent-strong)] via-[var(--accent)] to-amber-200 transition-all"
                                                style={{ height: `${(day.revenue / maxRevenue) * 100}%`, minHeight: day.revenue > 0 ? "8px" : "2px" }}
                                            />
                                            <span className="text-[10px] text-[var(--muted)]">
                                                {new Date(day.date).getDate()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Items */}
                            <div className="panel-surface-soft rounded-[1.75rem] p-6">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="rounded-2xl border border-white/8 bg-white/5 p-2">
                                        <ClipboardList className="h-5 w-5 text-[var(--accent)]" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">เมนูยอดนิยม</h3>
                                        <p className="text-sm text-[var(--muted)]">รายการที่ถูกสั่งบ่อยที่สุดในช่วงที่เลือก</p>
                                    </div>
                                </div>
                                {topItems.length === 0 ? (
                                    <p className="py-8 text-center text-[var(--muted)]">ยังไม่มีข้อมูล</p>
                                ) : (
                                    <div className="space-y-3">
                                        {topItems.slice(0, 5).map((item, i) => (
                                            <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/4 px-4 py-3">
                                                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-yellow-300 text-stone-950" :
                                                    i === 1 ? "bg-slate-300 text-stone-950" :
                                                        i === 2 ? "bg-orange-700 text-white" :
                                                            "bg-white/8 text-[var(--muted)]"
                                                    }`}>
                                                    {i + 1}
                                                </span>
                                                <div className="flex-1">
                                                    <p className="font-medium text-white">{item.name}</p>
                                                    <p className="text-xs text-[var(--muted)]">{item.count} รายการ</p>
                                                </div>
                                                <span className="font-bold text-[var(--accent)]">{item.revenue.toLocaleString()}฿</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : activeTab === "menu" ? (
                    /* ============ MENU TAB ============ */
                    <div>
                        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">จัดการเมนูอาหาร</h2>
                                <p className="mt-1 text-sm text-[var(--muted)]">แก้ข้อมูลราคา คีย์เวิร์ด และสถานะการขายโดยไม่แตะ logic backend</p>
                            </div>
                            <button
                                onClick={openAddModal}
                                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] px-4 py-3 text-sm font-bold text-stone-950 transition-transform hover:-translate-y-0.5"
                            >
                                <Plus className="h-4 w-4" />
                                เพิ่มเมนูใหม่
                            </button>
                        </div>

                        {/* Category Filter Tabs */}
                        <div className="custom-scrollbar mb-4 flex gap-2 overflow-x-auto pb-2">
                            {["all", "standard", "premium", "special", "kapkhao", "soup", "salad"].map(cat => {
                                const labelMap: Record<string, string> = {
                                    all: "ทั้งหมด",
                                    standard: "Standard",
                                    premium: "Premium",
                                    special: "Special",
                                    kapkhao: "กับข้าว",
                                    soup: "ต้ม/แกง",
                                    salad: "ยำ/สลัด"
                                };
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${selectedCategory === cat
                                            ? "bg-white text-stone-950"
                                            : "bg-white/5 text-[var(--muted)] hover:bg-white/8 hover:text-white"
                                            }`}
                                    >
                                        {labelMap[cat] || cat}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="panel-surface-soft overflow-hidden rounded-[1.75rem]">
                            <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-black/10">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">ชื่อเมนู</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">คีย์เวิร์ด</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">ราคา</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">หมวด</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">สถานะ</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/6">
                                    {filteredMenuItems.map((item) => (
                                            <tr key={item.id} className={`transition-colors hover:bg-white/4 ${!item.is_active ? "opacity-50 grayscale" : ""}`}>
                                                <td className="px-4 py-3 font-medium text-white">{item.name}</td>
                                                <td className="max-w-xs truncate px-4 py-3 text-sm text-[var(--muted)]">{item.keywords}</td>
                                                <td className="px-4 py-3 text-center font-bold text-[var(--accent)]">{item.base_price}฿</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getCategoryColor(item.category)}`}>
                                                        {item.category}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => handleToggleActive(item)}
                                                        className={`w-12 h-6 rounded-full transition-all duration-300 relative ${item.is_active ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" : "bg-gray-600"}`}
                                                    >
                                                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-300 shadow-sm ${item.is_active ? "translate-x-6" : "translate-x-0"}`} />
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => openEditModal(item)}
                                                            className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-2 text-sky-300 transition-colors hover:bg-sky-400/18"
                                                            title="แก้ไข"
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-2 text-rose-300 transition-colors hover:bg-rose-400/18"
                                                            title="ลบ"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    {filteredMenuItems.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-10 text-center text-[var(--muted)]">
                                                ไม่พบเมนูในหมวดนี้
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ============ LOGS TAB ============ */
                    <div>
                        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">ประวัติการสั่งซื้อ</h2>
                                <p className="mt-1 text-sm text-[var(--muted)]">ติดตามเวลา รายการ และสถานะของทุกออเดอร์ย้อนหลัง</p>
                            </div>
                            <button
                                onClick={fetchOrders}
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                            >
                                <RefreshCcw className="h-4 w-4" />
                                รีเฟรช
                            </button>
                        </div>

                        <div className="panel-surface-soft overflow-hidden rounded-[1.75rem]">
                            <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-black/10">
                                    <tr>
                                        <th className="w-16 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">ID</th>
                                        <th className="w-32 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">เวลา</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">รายการ</th>
                                        <th className="w-24 px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">ยอดรวม</th>
                                        <th className="w-28 px-4 py-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/6">
                                    {orders.map((order) => (
                                        <tr key={order.id} className="transition-colors hover:bg-white/4">
                                            <td className="px-4 py-3 text-sm font-mono text-[var(--muted)]">#{order.id}</td>
                                            <td className="px-4 py-3 text-sm text-white/85">
                                                {new Date(order.created_at).toLocaleString('th-TH', {
                                                    hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'
                                                })}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-white">
                                                <div className="flex flex-col gap-1">
                                                    {order.items.map((item, idx) => (
                                                        <span key={idx} className="text-sm">
                                                            {item.quantity}x {item.menu_name}
                                                            {item.add_ons.length > 0 && (
                                                                <span className="text-xs text-gray-500 ml-2">
                                                                    ({item.add_ons.map(a => a.name).join(", ")})
                                                                </span>
                                                            )}
                                                            {item.note && (
                                                                <span className="ml-4 block text-xs italic text-[var(--accent)]">
                                                                    "{item.note}"
                                                                </span>
                                                            )}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-[var(--accent)]">
                                                {order.total_price.toLocaleString()}฿
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold border ${order.status === 'completed' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                                    order.status === 'cancelled' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                                        'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                                    }`}>
                                                    {order.status === 'completed' ? 'เสร็จสิ้น' :
                                                        order.status === 'cancelled' ? 'ยกเลิก' : 'รอปรุง'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {orders.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-10 text-center text-[var(--muted)]">
                                                ยังไม่มีประวัติออเดอร์
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="panel-surface w-full max-w-md rounded-[2rem] p-6">
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div>
                                <p className="section-kicker mb-3">Menu Editor</p>
                                <h2 className="text-xl font-bold text-white">
                                    {editingItem ? "แก้ไขเมนู" : "เพิ่มเมนูใหม่"}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="rounded-2xl border border-white/8 bg-white/5 p-2 text-[var(--muted)] transition-colors hover:bg-white/10 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm text-[var(--muted)]">ชื่อเมนู</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-[var(--muted)]">คีย์เวิร์ด (คั่นด้วย ,)</label>
                                <input
                                    type="text"
                                    value={formData.keywords}
                                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                                    placeholder="กะเพรา,หมู"
                                    className="w-full rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:border-[var(--accent)] focus:outline-none"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-1 block text-sm text-[var(--muted)]">ราคา (บาท)</label>
                                    <input
                                        type="number"
                                        value={formData.base_price}
                                        onChange={(e) => setFormData({ ...formData, base_price: parseInt(e.target.value) || 0 })}
                                        className="w-full rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm text-[var(--muted)]">หมวด</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none"
                                    >
                                        <option value="standard">Standard (50฿)</option>
                                        <option value="premium">Premium (60฿)</option>
                                        <option value="special">Special</option>
                                        <option value="soup">Soup</option>
                                        <option value="salad">Salad</option>
                                        <option value="kapkhao">กับข้าว</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 rounded-2xl border border-white/8 bg-white/5 py-3 font-medium text-white transition-colors hover:bg-white/10"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] py-3 font-bold text-stone-950 transition-transform hover:-translate-y-0.5"
                                >
                                    {editingItem ? "บันทึก" : "เพิ่มเมนู"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
