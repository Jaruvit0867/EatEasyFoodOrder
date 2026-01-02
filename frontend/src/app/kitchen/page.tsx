"use client";

import { useState, useEffect } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

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
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/orders`);
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

    const handleReset = async () => {
        if (!confirm("คุณต้องการล้างรายการออเดอร์ทั้งหมดใช่หรือไม่?")) return;

        try {
            await fetch(`${BACKEND_URL}/orders`, { method: "DELETE" });
            fetchOrders(); // Refresh immediately
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการล้างออเดอร์");
        }
    };

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

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

    return (
        <div className="min-h-screen bg-[#0f172a] text-white p-8">
            <div className="w-full max-w-[1800px] mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 mb-2">
                            👨‍🍳 ครัว (Kitchen Display)
                        </h1>
                        <p className="text-gray-400 text-sm flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            อัปเดตอัตโนมัติทุก 5 วินาที
                        </p>
                    </div>

                    <button
                        onClick={handleReset}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-6 py-3 rounded-xl text-lg font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-500/10"
                    >
                        🗑️ ล้างออเดอร์ (Reset)
                    </button>
                </div>

                {loading && orders.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20 text-2xl animate-pulse">กำลังโหลดข้อมูล...</div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center mt-20 text-gray-500 opacity-50 border-4 border-dashed border-gray-800 rounded-3xl p-20">
                        <svg className="w-32 h-32 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        <span className="text-3xl font-bold">รอออเดอร์แรก...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {orders.map((order) => (
                            <div
                                key={order.id}
                                className="bg-[#1e293b] rounded-2xl p-0 border border-gray-700/50 shadow-2xl overflow-hidden hover:border-orange-500/30 transition-all group"
                            >
                                {/* Order Header */}
                                <div className="bg-[#0f172a]/50 p-5 border-b border-gray-700/50 flex justify-between items-center">
                                    <span className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-xl font-bold shadow-lg shadow-orange-500/20">
                                        #{order.id}
                                    </span>
                                    <div className="text-right">
                                        <div className="text-2xl font-mono text-white font-bold tracking-wider">
                                            {formatTime(order.created_at)}
                                        </div>
                                    </div>
                                </div>

                                {/* Items List */}
                                <div className="p-5 space-y-4">
                                    {order.items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-start pb-4 border-b border-gray-700/30 last:border-0 last:pb-0">
                                            <div className="flex items-start gap-4">
                                                <div className="bg-slate-700 w-8 h-8 flex items-center justify-center rounded text-white font-bold text-lg shrink-0">
                                                    {item.quantity}
                                                </div>
                                                <div>
                                                    <div className="text-xl font-bold text-gray-200 leading-tight">
                                                        {item.menu_name}
                                                    </div>
                                                    {item.add_ons.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            {item.add_ons.map((addon, aIdx) => (
                                                                <span
                                                                    key={aIdx}
                                                                    className="text-sm bg-green-900/30 text-green-400 px-2 py-0.5 rounded border border-green-500/20"
                                                                >
                                                                    + {addon.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {item.note && (
                                                        <div className="text-red-400 text-sm mt-1 font-bold bg-red-900/20 px-2 py-0.5 rounded inline-block">
                                                            * {item.note}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Footer Actions */}
                                <div className="p-5 bg-[#0f172a]/30 border-t border-gray-700/50">
                                    <div className="flex justify-between items-end mb-4">
                                        <span className="text-gray-500 text-sm">ยอดรวม</span>
                                        <span className="text-3xl font-bold text-orange-400">{order.total_price}.-</span>
                                    </div>
                                    <button
                                        onClick={() => handlePrint(order)}
                                        className="w-full bg-slate-700 hover:bg-white hover:text-black text-white py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group-hover:shadow-lg"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                        พิมพ์ใบเสร็จ
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
