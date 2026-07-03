"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "@/lib/axios";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  LogOut,
  Ticket,
  TrendingUp,
  Clock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Shield,
  Activity,
} from "lucide-react";

interface Stats {
  totalAvailable: number;
  totalSold: number;
  totalHold: number;
  totalRevenue: number;
  soldByType: { type: string; count: number }[];
}

interface HoldTicketItem {
  id: string;
  userName: string | null;
  expiresAt: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [holdTickets, setHoldTickets] = useState<HoldTicketItem[]>([]);
  const [totalHoldCount, setTotalHoldCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [statsLoading, setStatsLoading] = useState<boolean>(true);
  const [tableLoading, setTableLoading] = useState<boolean>(true);
  const [chartMounted, setChartMounted] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());

  // Set chart mounted on client side to prevent SSR errors
  useEffect(() => {
    setChartMounted(true);
    const storedName =
      localStorage.getItem("userName") ||
      sessionStorage.getItem("userName") ||
      "Admin";
    setUserName(storedName);
  }, []);

  // Update global live ticker once every second
  useEffect(() => {
    const ticker = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Fetch admin stats
  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const res = await axios.get("/admin/stats");
      setStats(res.data.data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      let msg = "Không thể tải số liệu thống kê.";
      if (isAxiosError(err) && err.response) {
        msg = err.response.data?.message || msg;
      }
      toast.error(msg);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch hold tickets list
  const fetchHoldTickets = async (targetPage: number) => {
    try {
      setTableLoading(true);
      const res = await axios.get(`/admin/hold-tickets?page=${targetPage}&limit=${limit}`);
      setHoldTickets(res.data.data.tickets);
      setTotalHoldCount(res.data.data.total);
      setPage(res.data.data.page);
    } catch (err) {
      console.error("Failed to fetch hold tickets:", err);
      let msg = "Không thể tải danh sách vé đang giữ.";
      if (isAxiosError(err) && err.response) {
        msg = err.response.data?.message || msg;
      }
      toast.error(msg);
    } finally {
      setTableLoading(false);
    }
  };

  // Initialize data and WebSockets
  useEffect(() => {
    fetchStats();
    fetchHoldTickets(1);

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
    const socket = io(socketUrl, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("Admin WS connected:", socket.id);
    });

    // Real-time synchronization event listener
    socket.on("admin_dashboard_refresh", () => {
      console.log("WebSocket admin_dashboard_refresh received, refreshing...");
      fetchStats();
      fetchHoldTickets(page);
    });

    return () => {
      socket.disconnect();
    };
  }, [page]);

  const handleLogout = async () => {
    try {
      await axios.post("/auth/logout");
    } catch (err) {
      console.error("Logout API error:", err);
    } finally {
      localStorage.removeItem("userName");
      sessionStorage.removeItem("userName");
      sessionStorage.removeItem("heldTickets");
      router.push("/");
    }
  };

  const getCountdownText = (expiresAtStr: string | null) => {
    if (!expiresAtStr) return "N/A";
    const expiresAt = new Date(expiresAtStr).getTime();
    const diff = expiresAt - now;
    if (diff <= 0) {
      return (
        <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
          Hết hạn
        </span>
      );
    }
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const totalPages = Math.ceil(totalHoldCount / limit) || 1;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* ---- Sticky Header ---- */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-[#34A99D] px-6 py-4 shadow-lg">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-[#FFF3C8]" />
          <div>
            <p className="text-base font-bold text-white">
              Trang quản lý sự kiện của <span className="text-[#FFF3C8]">{userName}</span>
            </p>
            <p className="text-xs font-medium text-white/70">
              Hệ thống Quản trị & Điều phối Real-time
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:bg-white/25 active:scale-[0.97]"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </header>

      {/* ---- Sub Header & Navigation ---- */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <button
          onClick={() => router.push("/event")}
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:scale-[1.02] active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4" />
          Trở về trang sự kiện
        </button>
      </div>

      {/* ---- Main Dashboard Layout ---- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ---- Section 1: Stats Dashboard Cards ---- */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">

          {/* Card 1: Total Available */}
          <div className="overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-6 flex items-center gap-5">
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
              <Ticket className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vé còn trống</p>
              <p className="text-2xl font-black text-gray-900 mt-1">
                {statsLoading ? "..." : stats?.totalAvailable}
              </p>
            </div>
          </div>

          {/* Card 2: Total Sold */}
          <div className="overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-6 flex items-center gap-5">
            <div className="p-3 bg-green-50 rounded-xl text-green-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vé đã bán</p>
              <p className="text-2xl font-black text-gray-900 mt-1">
                {statsLoading ? "..." : stats?.totalSold}
              </p>
            </div>
          </div>

          {/* Card 3: Total Hold */}
          <div className="overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-6 flex items-center gap-5">
            <div className="p-3 bg-yellow-50 rounded-xl text-yellow-600">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vé đang giữ (5p)</p>
              <p className="text-2xl font-black text-gray-900 mt-1">
                {statsLoading ? "..." : stats?.totalHold}
              </p>
            </div>
          </div>

          {/* Card 4: Total Revenue */}
          <div className="overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-6 flex items-center gap-5">
            <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tổng doanh thu</p>
              <p className="text-xl font-black text-gray-900 mt-1">
                {statsLoading
                  ? "..."
                  : new Intl.NumberFormat("vi-VN").format(stats?.totalRevenue || 0) + " đ"}
              </p>
            </div>
          </div>
        </section>

        {/* ---- Section 2 & 3: Chart & Live Table ---- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Chart Section */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-lg font-bold text-[#458393] mb-6 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Doanh số theo loại vé
            </h3>
            <div className="h-[320px] flex items-center justify-center">
              {statsLoading ? (
                <div className="text-sm font-semibold text-gray-400 animate-pulse">Đang tải biểu đồ...</div>
              ) : chartMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.soldByType || []} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="type" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e5e7eb" }}
                      itemStyle={{ color: "#34A99D", fontWeight: "bold" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    <Bar name="Số lượng đã bán" dataKey="count" fill="#34A99D" radius={[6, 6, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm font-semibold text-gray-400">Không khả dụng</div>
              )}
            </div>
          </div>

          {/* Locked Tickets Real-Time Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#458393] mb-6 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Vé tạm khóa
              </h3>

              {tableLoading && holdTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 font-semibold animate-pulse text-sm">
                  Đang tải danh sách vé giữ...
                </div>
              ) : holdTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 font-medium text-sm">
                  Không có vé nào đang được giữ trong hệ thống.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead>
                      <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <th className="pb-3 pr-2">Mã Vé</th>
                        <th className="pb-3 px-2">Khách Hàng</th>
                        <th className="pb-3 px-2 text-center">Thời Gian Còn Lại</th>
                        <th className="pb-3 pl-2 text-right">Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm font-semibold text-gray-700">
                      {holdTickets.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3.5 pr-2 font-mono text-xs text-gray-400">
                            {ticket.id.slice(0, 8)}...
                          </td>
                          <td className="py-3.5 px-2 text-gray-900">{ticket.userName || "Khách"}</td>
                          <td className="py-3.5 px-2 text-center text-red-500 font-mono">
                            {getCountdownText(ticket.expiresAt)}
                          </td>
                          <td className="py-3.5 pl-2 text-right">
                            <span className="inline-flex items-center rounded-md bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                              Đang giữ
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-6">
                <button
                  onClick={() => fetchHoldTickets(page - 1)}
                  disabled={page <= 1 || tableLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </button>
                <span className="text-xs font-bold text-gray-500">
                  Trang {page} / {totalPages}
                </span>
                <button
                  onClick={() => fetchHoldTickets(page + 1)}
                  disabled={page >= totalPages || tableLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
