"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "@/lib/axios";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { Clock, MapPin, Calendar, AlertTriangle, LogOut, X, CheckCircle } from "lucide-react";

interface HeldTicket {
  id: string;
  type: string;
  status: string;
  price: number;
  userId: string;
  expiresAt: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(300); // 5 minutes
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState<boolean>(false);
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);
  const [payLoading, setPayLoading] = useState<boolean>(false);

  // Safely retrieve username and tickets from session storage
  useEffect(() => {
    setIsMounted(true);
    const storedName =
      localStorage.getItem("userName") ||
      sessionStorage.getItem("userName") ||
      "Khách";
    setUserName(storedName);

    const storedTickets = sessionStorage.getItem("heldTickets");
    if (storedTickets) {
      try {
        setHeldTickets(JSON.parse(storedTickets));
      } catch (e) {
        console.error("Error parsing held tickets:", e);
      }
    }
  }, []);

  // 1. Timer countdown: Only reduce number
  useEffect(() => {
    if (!isMounted || heldTickets.length === 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0; // Only return new state, do not call external functions
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMounted, heldTickets.length]);

  // 2. Handle side effect when time runs out
  useEffect(() => {
    // If component is mounted, has tickets, and time reaches 0
    if (isMounted && heldTickets.length > 0 && timeRemaining === 0) {
      toast.error("Hết thời gian giữ vé!");
      sessionStorage.removeItem("heldTickets");
      router.push("/event");
    }
  }, [timeRemaining, isMounted, heldTickets.length, router]);

  // Success Modal Auto-close Timer
  const handleCloseSuccessModal = () => {
    setIsSuccessModalOpen(false);
    router.push("/event");
  };

  useEffect(() => {
    if (!isSuccessModalOpen) return;

    const timer = setTimeout(() => {
      handleCloseSuccessModal();
    }, 5000);

    return () => clearTimeout(timer);
  }, [isSuccessModalOpen]);

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

  // Group tickets by type
  const groupedTickets = heldTickets.reduce<Record<string, { type: string; count: number; pricePerUnit: number; total: number }>>((acc, ticket) => {
    if (!acc[ticket.type]) {
      acc[ticket.type] = {
        type: ticket.type,
        count: 0,
        pricePerUnit: ticket.price,
        total: 0,
      };
    }
    acc[ticket.type].count += 1;
    acc[ticket.type].total += ticket.price;
    return acc;
  }, {});

  const groupedList = Object.values(groupedTickets);
  const totalOrderPrice = heldTickets.reduce((sum, t) => sum + t.price, 0);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Bulk cancel API request
  const handleBulkCancel = async () => {
    try {
      setCancelLoading(true);
      const ticketIds = heldTickets.map((t) => t.id);

      await axios.post("/tickets/cancel", { ticketIds });

      sessionStorage.removeItem("heldTickets");
      toast.success("Huỷ giữ vé thành công!");
      router.push("/event");
    } catch (err: any) {
      console.error("Bulk cancel error:", err);
      let message = "Đã xảy ra lỗi khi huỷ giữ vé.";
      if (isAxiosError(err) && err.response) {
        message = err.response.data?.message || err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast.error(message);
    } finally {
      setCancelLoading(false);
      setIsCancelModalOpen(false);
    }
  };

  // Real Payment API Request
  const handlePayment = async () => {
    try {
      setPayLoading(true);
      const ticketIds = heldTickets.map((t) => t.id);

      await axios.post("/tickets/pay", { ticketIds });

      sessionStorage.removeItem("heldTickets");
      setIsSuccessModalOpen(true);
    } catch (err: any) {
      console.error("Payment error:", err);
      let message = "Đã xảy ra lỗi khi thanh toán.";
      if (isAxiosError(err) && err.response) {
        message = err.response.data?.message || err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast.error(message);
    } finally {
      setPayLoading(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#FFF3C8] text-gray-900 flex items-center justify-center font-bold">
        Đang tải...
      </div>
    );
  }

  // Handle case where no tickets are held
  if (heldTickets.length === 0) {
    return (
      <div className="min-h-screen text-gray-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background Image Layer */}
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center scale-105 filter blur-[16px]"
          style={{
            backgroundImage: "url('/mnmm.png')",
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        />
        {/* Black Overlay Layer */}
        <div className="absolute inset-0 z-0 bg-black/60" />

        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-lg border border-gray-100 relative z-10">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#458393] mb-2">Không có vé đang giữ</h2>
          <p className="text-sm text-gray-500 mb-6 font-medium">
            Thời gian giữ vé đã hết hoặc bạn chưa chọn vé nào. Vui lòng quay lại trang chọn vé.
          </p>
          <button
            onClick={() => router.push("/event")}
            className="w-full rounded-xl bg-[#34A99D] py-3 text-center text-sm font-bold text-white shadow-md hover:bg-[#2d968b] transition-all"
          >
            Quay lại trang sự kiện
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-900 relative overflow-hidden">
      {/* Background Image Layer */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center scale-105 filter blur-[16px]"
        style={{ backgroundImage: "url('/mnmm.png')" }}
      />
      {/* Black Overlay Layer */}
      <div className="absolute inset-0 z-0 bg-black/60" />

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

      {/* ---- Fixed Countdown Timer Card ---- */}
      <div className="fixed top-20 right-6 z-40 bg-[#644f1f]/90 backdrop-blur-md shadow-xl rounded-2xl p-4 flex items-center gap-3 border border-white/20 animate-bounce-subtle">
        <Clock className="h-5 w-5 text-[#34A99D]" />
        <div>
          <p className="text-[10px] font-semibold text-gray-200 uppercase tracking-wider">Thời gian giữ vé</p>
          <p className="text-lg font-black text-white">{formatTime(timeRemaining)}</p>
        </div>
      </div>

      {/* ---- Main Content Container ---- */}
      <main className="flex flex-col items-center justify-center px-4 py-8 relative z-10">
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl max-w-xl w-full border border-gray-100 mt-10 relative z-10">
          <h2 className="text-2xl font-black text-[#458393] uppercase tracking-wide text-center mb-6">
            Thanh Toán
          </h2>

          {/* Event Details Card */}
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-5 mb-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">Siêu Concert Mùa Hè 2026</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-[#34A99D] shrink-0" />
                <span>Sân vận động Phú Thọ</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-[#34A99D] shrink-0" />
                <span>19:30, 04/07/2026</span>
              </div>
            </div>
          </div>

          {/* Grouped Order Summary */}
          <div className="mb-8">
            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Tóm tắt đơn hàng</h4>
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
              {groupedList.map((item) => (
                <div key={item.type} className="flex justify-between items-center p-4 bg-white">
                  <div>
                    <p className="font-extrabold text-gray-900 uppercase tracking-wide">{item.type}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Số lượng: {item.count} vé</p>
                  </div>
                  <span className="font-bold text-gray-800">
                    {new Intl.NumberFormat("vi-VN").format(item.total)} đ
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center p-4 bg-gray-50/50">
                <span className="font-bold text-gray-900">Tổng thanh toán</span>
                <span className="text-xl font-black text-[#458393]">
                  {new Intl.NumberFormat("vi-VN").format(totalOrderPrice)} đ
                </span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-4">
            <button
              onClick={() => setIsCancelModalOpen(true)}
              disabled={payLoading || cancelLoading}
              className="w-1/2 rounded-xl border border-gray-300 py-3.5 text-center text-sm font-extrabold text-gray-600 bg-white hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hủy đặt vé
            </button>
            <button
              onClick={handlePayment}
              disabled={payLoading || cancelLoading}
              className="w-1/2 flex items-center justify-center gap-2 rounded-xl bg-[#34A99D] py-3.5 text-center text-sm font-extrabold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#2d968b] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
            >
              {payLoading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              Thanh toán
            </button>
          </div>
        </div>
      </main>

      {/* ---- Cancel Confirmation Modal ---- */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Overlay with blur and opacity */}
          <div
            onClick={() => {
              if (!cancelLoading) setIsCancelModalOpen(false);
            }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <div className="relative bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl border border-gray-100 z-10 text-center animate-fade-in-up">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4 animate-pulse" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Hủy giữ vé</h3>
            <p className="text-sm text-gray-500 mb-6 font-medium">
              Bạn có chắc chắn muốn hủy giữ vé không? Các vé đã giữ sẽ được giải phóng lại vào hệ thống.
            </p>

            <div className="flex gap-4">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                disabled={cancelLoading}
                className="w-1/2 rounded-xl border border-gray-300 py-3 text-center text-sm font-bold text-gray-600 bg-white hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Không
              </button>
              <button
                onClick={handleBulkCancel}
                disabled={cancelLoading}
                className="w-1/2 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-center text-sm font-bold text-white shadow-md hover:bg-red-600 active:scale-[0.98] transition-all disabled:cursor-not-allowed"
              >
                {cancelLoading && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Có, hủy vé
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Success Confirmation Modal ---- */}
      {isSuccessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Overlay with blur and opacity */}
          <div
            onClick={handleCloseSuccessModal}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <div className="relative bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden z-50 animate-fade-in-up">
            {/* Header */}
            <div className="bg-[#34A99D] px-6 py-4 flex justify-between items-center">
              <span className="text-white font-bold">Thông báo</span>
              <button
                onClick={handleCloseSuccessModal}
                className="text-white hover:opacity-85 transition-opacity"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">Đã mua vé thành công!</h3>
              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                Bạn sẽ được chuyển về trang sự kiện trong giây lát.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
