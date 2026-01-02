"use client";

import { useState, useEffect } from "react";

const BACKEND_URL = "/api";

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
    const [selectedCategory, setSelectedCategory] = useState<string>("all"); // Category filter state

    const scopeDays = scope === "today" ? 1 : scope === "7days" ? 7 : scope === "30days" ? 30 : 365;

    // Fetch order stats
    const fetchOrderStats = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/analytics/order-stats?days=${scopeDays}`);
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
                fetch(`${BACKEND_URL}/analytics/top-items?limit=10&days=${scopeDays}`),
                fetch(`${BACKEND_URL}/analytics/daily-sales?days=${scopeDays}`)
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
            const res = await fetch(`${BACKEND_URL}/menu-items`);
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
            const res = await fetch(`${BACKEND_URL}/orders`);
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
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(formData)
                });
            } else {
                await fetch(`${BACKEND_URL}/menu-items`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
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
            await fetch(`${BACKEND_URL}/menu-items/${id}`, { method: "DELETE" });
            fetchMenuItems();
        } catch (error) {
            console.error("Error deleting:", error);
        }
    };

    const handleToggleActive = async (item: MenuItem) => {
        try {
            await fetch(`${BACKEND_URL}/menu-items/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
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

    const handleResetOrders = async () => {
        const confirmText = "⚠️ คำเตือน: คุณต้องการลบข้อมูลออเดอร์ทั้งหมดใช่หรือไม่?\n\nการกระทำนี้ไม่สามารถย้อนกลับได้ ข้อมูลยอดขายและสถิติทั้งหมดจะหายไป!";
        if (!confirm(confirmText)) return;

        // Double confirm
        if (!confirm("กรุณายืนยันอีกครั้งว่าจะลบข้อมูลจริงๆ?")) return;

        try {
            const res = await fetch(`${BACKEND_URL}/orders/delete-all`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                alert("✅ ล้างข้อมูลสำเร็จเรียบร้อย");
                fetchOrderStats();
                fetchAnalytics();
            } else {
                alert("❌ เกิดข้อผิดพลาด: " + data.error);
            }
        } catch (error) {
            console.error("Error resetting orders:", error);
            alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์");
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] text-white">
            {/* Header */}
            <header className="bg-[#1e293b] border-b border-gray-700/50 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500">
                            📊 EASY Order - Dashboard
                        </h1>
                        <p className="text-gray-500 text-sm">สถิติออเดอร์ และจัดการเมนู</p>
                    </div>
                    <button
                        onClick={handleResetOrders}
                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/30 rounded-lg text-sm font-bold transition-all flex items-center gap-2"
                    >
                        <span>🗑️</span> ล้างข้อมูลออเดอร์
                    </button>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="bg-[#1e293b]/50 border-b border-gray-700/50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setActiveTab("stats")}
                            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === "stats"
                                ? "text-orange-400 border-orange-400"
                                : "text-gray-400 border-transparent hover:text-white"
                                }`}
                        >
                            📊 สถิติออเดอร์
                        </button>
                        <button
                            onClick={() => setActiveTab("menu")}
                            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === "menu"
                                ? "text-orange-400 border-orange-400"
                                : "text-gray-400 border-transparent hover:text-white"
                                }`}
                        >
                            📋 จัดการเมนู
                        </button>
                        <button
                            onClick={() => setActiveTab("logs")}
                            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === "logs"
                                ? "text-orange-400 border-orange-400"
                                : "text-gray-400 border-transparent hover:text-white"
                                }`}
                        >
                            📜 ประวัติออเดอร์
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {loading ? (
                    <div className="text-center py-20 text-gray-500">กำลังโหลด...</div>
                ) : activeTab === "stats" ? (
                    /* ============ STATS TAB ============ */
                    <div>
                        {/* Scope Selector */}
                        <div className="flex justify-end mb-6">
                            <div className="inline-flex bg-[#1e293b] rounded-lg p-1 border border-gray-700/50">
                                <button
                                    onClick={() => setScope("today")}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${scope === "today" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"}`}
                                >
                                    วันนี้
                                </button>
                                <button
                                    onClick={() => setScope("7days")}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${scope === "7days" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"}`}
                                >
                                    7 วัน
                                </button>
                                <button
                                    onClick={() => setScope("30days")}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${scope === "30days" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"}`}
                                >
                                    30 วัน
                                </button>
                                <button
                                    onClick={() => setScope("all")}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${scope === "all" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"}`}
                                >
                                    ทั้งหมด
                                </button>
                            </div>
                        </div>

                        {/* Order Stats Cards */}
                        {orderStats && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                                <div className="bg-[#1e293b] rounded-xl p-5 border border-gray-700/50">
                                    <p className="text-gray-400 text-sm mb-1">ออเดอร์ทั้งหมด</p>
                                    <p className="text-3xl font-bold text-white">{orderStats.total}</p>
                                </div>
                                <div className="bg-[#1e293b] rounded-xl p-5 border border-gray-700/50">
                                    <p className="text-gray-400 text-sm mb-1">รอดำเนินการ</p>
                                    <p className="text-3xl font-bold text-yellow-400">{orderStats.pending}</p>
                                </div>
                                <div className="bg-[#1e293b] rounded-xl p-5 border border-gray-700/50">
                                    <p className="text-gray-400 text-sm mb-1">เสร็จสิ้น</p>
                                    <p className="text-3xl font-bold text-green-400">{orderStats.completed}</p>
                                </div>
                                <div className="bg-[#1e293b] rounded-xl p-5 border border-gray-700/50">
                                    <p className="text-gray-400 text-sm mb-1">ยกเลิก</p>
                                    <p className="text-3xl font-bold text-red-400">{orderStats.cancelled}</p>
                                </div>
                                <div className="bg-[#1e293b] rounded-xl p-5 border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent">
                                    <p className="text-gray-400 text-sm mb-1">รายได้รวม</p>
                                    <p className="text-3xl font-bold text-orange-400">{orderStats.revenue.toLocaleString()}฿</p>
                                </div>
                            </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Daily Sales Chart */}
                            <div className="bg-[#1e293b] rounded-xl p-6 border border-gray-700/50">
                                <h3 className="text-lg font-bold mb-4">📈 ยอดขายรายวัน</h3>
                                <div className="h-48 flex items-end gap-1">
                                    {dailySales.slice(-14).map((day, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                            <div
                                                className="w-full bg-gradient-to-t from-orange-500 to-orange-400 rounded-t transition-all"
                                                style={{ height: `${(day.revenue / maxRevenue) * 100}%`, minHeight: day.revenue > 0 ? "8px" : "2px" }}
                                            />
                                            <span className="text-[10px] text-gray-500">
                                                {new Date(day.date).getDate()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Items */}
                            <div className="bg-[#1e293b] rounded-xl p-6 border border-gray-700/50">
                                <h3 className="text-lg font-bold mb-4">🏆 เมนูยอดนิยม</h3>
                                {topItems.length === 0 ? (
                                    <p className="text-gray-500 text-center py-8">ยังไม่มีข้อมูล</p>
                                ) : (
                                    <div className="space-y-3">
                                        {topItems.slice(0, 5).map((item, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-yellow-500 text-black" :
                                                    i === 1 ? "bg-gray-400 text-black" :
                                                        i === 2 ? "bg-orange-700 text-white" :
                                                            "bg-slate-700 text-gray-400"
                                                    }`}>
                                                    {i + 1}
                                                </span>
                                                <div className="flex-1">
                                                    <p className="font-medium">{item.name}</p>
                                                    <p className="text-xs text-gray-500">{item.count} รายการ</p>
                                                </div>
                                                <span className="text-orange-400 font-bold">{item.revenue.toLocaleString()}฿</span>
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
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">จัดการเมนูอาหาร</h2>
                            <button
                                onClick={openAddModal}
                                className="px-4 py-2 bg-orange-500 hover:bg-orange-400 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
                            >
                                <span>+</span> เพิ่มเมนูใหม่
                            </button>
                        </div>

                        {/* Category Filter Tabs */}
                        <div className="flex overflow-x-auto pb-4 gap-2 mb-2 custom-scrollbar">
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
                                        className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors ${selectedCategory === cat
                                            ? "bg-orange-500 text-white"
                                            : "bg-slate-800 text-gray-400 hover:bg-slate-700"
                                            }`}
                                    >
                                        {labelMap[cat] || cat}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="bg-[#1e293b] rounded-xl border border-gray-700/50 overflow-hidden shadow-xl">
                            <table className="w-full">
                                <thead className="bg-[#0f172a]/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">ชื่อเมนู</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">คีย์เวิร์ด</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">ราคา</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">หมวด</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">สถานะ</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700/50">
                                    {menuItems
                                        .filter(item => selectedCategory === "all" || item.category === selectedCategory)
                                        .map((item) => (
                                            <tr key={item.id} className={`hover:bg-[#0f172a]/30 transition-colors ${!item.is_active ? "opacity-50 grayscale" : ""}`}>
                                                <td className="px-4 py-3 font-medium text-white">{item.name}</td>
                                                <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">{item.keywords}</td>
                                                <td className="px-4 py-3 text-center font-bold text-orange-400">{item.base_price}฿</td>
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
                                                            className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors border border-blue-500/20"
                                                            title="แก้ไข"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                                                            title="ลบ"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    {menuItems.filter(item => selectedCategory === "all" || item.category === selectedCategory).length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-gray-500">
                                                ไม่พบเมนูในหมวดนี้
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* ============ LOGS TAB ============ */
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-white">ประวัติการสั่งซื้อ (Order Logs)</h2>
                            <button
                                onClick={fetchOrders}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
                            >
                                🔄 รีเฟรช
                            </button>
                        </div>

                        <div className="bg-[#1e293b] rounded-xl border border-gray-700/50 overflow-hidden shadow-xl">
                            <table className="w-full">
                                <thead className="bg-[#0f172a]/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase w-16">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase w-32">เวลา</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">รายการ</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase w-24">ยอดรวม</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase w-28">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700/50">
                                    {orders.map((order) => (
                                        <tr key={order.id} className="hover:bg-[#0f172a]/30 transition-colors">
                                            <td className="px-4 py-3 text-sm font-mono text-gray-500">#{order.id}</td>
                                            <td className="px-4 py-3 text-sm text-gray-300">
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
                                                                <span className="text-xs text-orange-400 block ml-4 italic">
                                                                    "{item.note}"
                                                                </span>
                                                            )}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-orange-400">
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
                                            <td colSpan={5} className="py-8 text-center text-gray-500">
                                                ยังไม่มีประวัติออเดอร์
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[#1e293b] rounded-2xl w-full max-w-md p-6 border border-gray-700">
                        <h2 className="text-xl font-bold mb-6">
                            {editingItem ? "✏️ แก้ไขเมนู" : "➕ เพิ่มเมนูใหม่"}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">ชื่อเมนู</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-[#0f172a] border border-gray-700 rounded-lg focus:border-orange-500 focus:outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">คีย์เวิร์ด (คั่นด้วย ,)</label>
                                <input
                                    type="text"
                                    value={formData.keywords}
                                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                                    placeholder="กะเพรา,หมู"
                                    className="w-full px-4 py-2 bg-[#0f172a] border border-gray-700 rounded-lg focus:border-orange-500 focus:outline-none"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">ราคา (บาท)</label>
                                    <input
                                        type="number"
                                        value={formData.base_price}
                                        onChange={(e) => setFormData({ ...formData, base_price: parseInt(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 bg-[#0f172a] border border-gray-700 rounded-lg focus:border-orange-500 focus:outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">หมวด</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full px-4 py-2 bg-[#0f172a] border border-gray-700 rounded-lg focus:border-orange-500 focus:outline-none"
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
                                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-400 rounded-lg font-bold transition-colors"
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
