"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { LogOut, Flame } from "lucide-react";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import HeroSection from "./_components/HeroSection";
import EventDescription from "./_components/EventDescription";
import TicketList from "./_components/TicketList";
import TicketSelection from "./_components/TicketSelection";

export default function EventPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [ticketDetails, setTicketDetails] = useState<{ type: string; price: number; count: number }[]>([]);
  const [totalAvailable, setTotalAvailable] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorState, setErrorState] = useState<Error | null>(null);
  const [isBookingMode, setIsBookingMode] = useState<boolean>(false);

  // Lấy userName từ storage sau khi mount (tránh hydration error)
  useEffect(() => {
    const name =
      localStorage.getItem("userName") ||
      sessionStorage.getItem("userName") ||
      "Khách";
    setUserName(name);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorState(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
      
      const [typesRes, availableRes] = await Promise.all([
        axios.get(`${apiUrl}/tickets/types`),
        axios.get(`${apiUrl}/tickets/available`),
      ]);

      const fetchedTypes = typesRes.data?.data;
      const availableData = availableRes.data?.data;
      const fetchedAvailable = availableData?.tickets;
      const total = availableData?.total ?? 0;

      if (Array.isArray(fetchedTypes) && fetchedTypes.length > 0) {
        const prices = fetchedTypes.map((t: any) => t.price);
        const min = Math.min(...prices);
        setMinPrice(min);

        const merged = fetchedTypes.map((t: any) => {
          const countObj = Array.isArray(fetchedAvailable)
            ? fetchedAvailable.find((a: any) => a.type === t.type)
            : null;
          return {
            type: t.type,
            price: t.price,
            count: countObj ? countObj.count : 0,
          };
        });

        setTicketDetails(merged);
        setTotalAvailable(total);
      } else {
        throw new Error("Không tìm thấy thông tin loại vé nào.");
      }
    } catch (err: any) {
      console.error("Fetch data error:", err);
      let message = "Đã xảy ra lỗi khi kết nối tới máy chủ.";
      if (axios.isAxiosError(err) && err.response) {
        const apiMessage = err.response.data?.message;
        const status = err.response.status;
        message = `Lỗi API [Mã lỗi: ${status}]: ${apiMessage || err.message}`;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setErrorState(new Error(message));
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch ticket details on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Connect to WebSockets
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
    const socket = io(socketUrl, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("WebSocket connected to:", socketUrl);
    });

    socket.on("ticket_count_updated", (payload: any) => {
      console.log("WebSocket ticket_count_updated payload:", payload);
      if (payload?.data) {
        const { tickets, total } = payload.data;
        
        setTicketDetails((prevDetails) => {
          return prevDetails.map((detail) => {
            const match = tickets.find((t: any) => t.type === detail.type);
            return match ? { ...detail, count: match.count } : detail;
          });
        });

        setTotalAvailable(total);
      }
    });

    socket.on("disconnect", () => {
      console.log("WebSocket disconnected");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleLogout = async () => {
    const token =
      localStorage.getItem("accessToken") ||
      sessionStorage.getItem("accessToken");

    try {
      if (token) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
        await axios.post(
          `${apiUrl}/auth/logout`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      }
    } catch (err) {
      console.error("Logout API error:", err);
    } finally {
      // Xoá tất cả token và userName khỏi cả 2 storage
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("userName");
      sessionStorage.removeItem("accessToken");
      sessionStorage.removeItem("refreshToken");
      sessionStorage.removeItem("userName");

      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF3C8] text-gray-900">
      {/* ---- Sticky Header ---- */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-[#34A99D] px-6 py-4 shadow-lg">
        <div>
          <p className="text-base font-bold text-white">
            Xin chào, <span className="text-[#FFF3C8]">{userName}</span>
          </p>
          <p className="text-xs font-medium text-white/70">
            TicketBox — Đặt vé concert
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:bg-white/25 active:scale-[0.97]"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </header>

      {/* ---- Hero Section ---- */}
      <div className="flex justify-center w-full pt-6">
        <HeroSection
          minPrice={loading ? null : minPrice}
          onBuyClick={() => setIsBookingMode(true)}
        />
      </div>

      {/* ---- FOMO Banner ---- */}
      <div className="w-full max-w-4xl mx-auto px-4 mt-6">
        {totalAvailable > 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-extrabold text-white shadow-md animate-pulse">
            <Flame className="h-5 w-5 text-yellow-300 fill-yellow-300" />
            <span>
              Nhanh tay lên! Chỉ còn{" "}
              <span className="underline decoration-2 underline-offset-2 text-yellow-200">
                {totalAvailable}
              </span>{" "}
              vé trên toàn hệ thống.
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-gray-500 px-4 py-3 text-sm font-extrabold text-white shadow-md">
            <span>Hết vé</span>
          </div>
        )}
      </div>

      {/* ---- Main Content ---- */}
      <main
        className="relative flex flex-col items-center justify-center overflow-hidden px-4 py-6"
        style={{ minHeight: "calc(100vh - 420px)" }}
      >
        {/* ---- Decorative blobs ---- */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 -right-28 h-[380px] w-[380px] rounded-full bg-[#34A99D]/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-20 h-[320px] w-[320px] rounded-full bg-[#E5CB90]/35 blur-3xl"
        />

        <div className="relative z-10 w-full max-w-4xl bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100">
          {isBookingMode ? (
            <TicketSelection
              ticketDetails={ticketDetails}
              onCancel={() => setIsBookingMode(false)}
            />
          ) : (
            <>
              <EventDescription />
              <hr className="border-gray-200/80 my-8" />
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#458393]/60">
                  <p className="font-semibold text-sm animate-pulse">
                    Đang tải danh sách vé và số lượng thực tế...
                  </p>
                </div>
              ) : errorState ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-red-500 font-semibold mb-4">
                    {errorState.message}
                  </p>
                  <button
                    onClick={fetchData}
                    className="rounded-xl bg-[#34A99D] px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-300 hover:scale-[1.02] hover:bg-[#2d968b] active:scale-[0.98]"
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <TicketList
                  ticketDetails={ticketDetails}
                  onBuyClick={() => setIsBookingMode(true)}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
