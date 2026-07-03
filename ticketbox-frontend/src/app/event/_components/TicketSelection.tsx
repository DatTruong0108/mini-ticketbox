"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "@/lib/axios";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { AlertCircle, Minus, Plus } from "lucide-react";

interface TicketTypeDetail {
  type: string;
  price: number;
  count: number;
}

interface TicketSelectionProps {
  ticketDetails: TicketTypeDetail[];
  onCancel: () => void;
}

export default function TicketSelection({ ticketDetails, onCancel }: TicketSelectionProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(false);

  // Initialize state with 0 for all ticket types
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    ticketDetails.forEach((t) => {
      initial[t.type] = 0;
    });
    return initial;
  });

  // Calculate sum of all selected tickets
  const totalSelected = Object.values(quantities).reduce((acc, curr) => acc + curr, 0);

  // Identify which ticket type is currently selected (has qty > 0)
  const selectedType = Object.keys(quantities).find((key) => (quantities[key] || 0) > 0);

  const handleIncrement = (type: string, availableCount: number) => {
    // Business Rule: ONLY one ticket type allowed
    if (selectedType && selectedType !== type) {
      toast.error("Chỉ được chọn một loại vé trong một lần thanh toán!");
      return;
    }

    const currentQty = quantities[type] || 0;
    const limit = Math.min(5, availableCount);

    if (currentQty < limit) {
      setQuantities((prev) => ({
        ...prev,
        [type]: currentQty + 1,
      }));
    } else {
      toast.error(`Không thể mua vượt quá giới hạn hoặc số lượng vé còn lại (${limit} vé).`);
    }
  };

  const handleDecrement = (type: string) => {
    const currentQty = quantities[type] || 0;
    if (currentQty > 0) {
      setQuantities((prev) => ({
        ...prev,
        [type]: currentQty - 1,
      }));
    }
  };

  const handleContinue = async () => {
    if (!selectedType || totalSelected === 0) {
      toast.error("Vui lòng chọn số lượng vé!");
      return;
    }

    try {
      setLoading(true);
      
      const payload = {
        ticketType: selectedType,
        quantity: totalSelected,
      };

      const res = await axios.post("/tickets/hold", payload);

      if (res.data?.data?.tickets) {
        sessionStorage.setItem("heldTickets", JSON.stringify(res.data.data.tickets));
      }

      toast.success("Giữ vé thành công! Đang chuyển đến trang thanh toán...");
      router.push("/event/checkout");
    } catch (err: any) {
      console.error("Hold tickets error:", err);
      let message = "Đã xảy ra lỗi khi giữ vé.";
      if (isAxiosError(err) && err.response) {
        message = err.response.data?.message || err.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!ticketDetails || ticketDetails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white/50 backdrop-blur-md border border-white/50 rounded-3xl max-w-md w-full shadow-lg">
        <AlertCircle className="h-12 w-12 mb-4 text-red-500 shrink-0" />
        <p className="font-bold text-[#458393] mb-4 text-lg">Không thể tải danh sách loại vé</p>
        <p className="text-sm text-gray-500 mb-6 font-semibold">Vui lòng thử lại sau.</p>
        <button
          onClick={onCancel}
          className="rounded-xl bg-[#34A99D] px-6 py-3 text-sm font-bold text-white shadow-md transition-all duration-300 hover:scale-[1.02] hover:bg-[#2d968b] active:scale-[0.98]"
        >
          Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-10 w-full max-w-5xl px-4 py-8 flex flex-col items-center">
      {/* Title Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-black text-[#458393] uppercase tracking-wide">
          Chọn Loại Vé
        </h2>
        <div className="mx-auto my-2 h-1 w-12 rounded-full bg-[#34A99D]" />
        <p className="text-xs font-semibold text-gray-500">
          Tối đa 5 vé cho mỗi tài khoản và chỉ được chọn 1 loại vé
        </p>
      </div>

      {/* Ticket Cards Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl justify-center mb-10">
        {ticketDetails.map((ticket) => {
          const qty = quantities[ticket.type] || 0;
          const isSelected = qty > 0;

          // Limit count based on current available tickets count
          const limit = Math.min(5, ticket.count);

          // Disable plus if another type is selected OR current quantity reaches the limit (max 5 or available count)
          const isPlusDisabled = (selectedType && selectedType !== ticket.type) || qty >= limit;
          const isMinusDisabled = qty <= 0;

          return (
            <div
              key={ticket.type}
              className={`flex flex-col justify-between bg-white rounded-2xl border-2 p-6 transition-all duration-300 select-none group
                ${
                  isSelected
                    ? "border-[#34A99D] shadow-xl translate-y-[-4px]"
                    : "border-gray-100 shadow-md hover:border-gray-300 hover:shadow-lg hover:translate-y-[-2px]"
                }
              `}
            >
              {/* Card Header */}
              <div className="text-center mb-4">
                <h3 className="text-lg font-extrabold text-gray-900 tracking-wider uppercase group-hover:text-[#34A99D] transition-colors">
                  {ticket.type}
                </h3>
                <span className="text-xs text-gray-500 font-semibold block mt-1">
                  Còn lại: {ticket.count} vé
                </span>
              </div>

              {/* Card Body */}
              <div className="mb-6 rounded-xl bg-gray-50/80 border border-gray-100 p-3 flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-500">Mô tả vé</span>
                  <span className="text-[11px] font-medium text-gray-400 leading-relaxed">
                    Vé tham dự concert {ticket.type} của HIEUTHUHAI tại Nhà thi đấu Phú Thọ.
                  </span>
                </div>
              </div>

              {/* Card Footer: Price & Stepper */}
              <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col items-center gap-4">
                {/* Price */}
                <span className="text-xl font-black text-[#458393]">
                  {new Intl.NumberFormat("vi-VN").format(ticket.price)} đ
                </span>

                {/* Stepper */}
                <div className="flex items-center gap-5">
                  <button
                    onClick={() => handleDecrement(ticket.type)}
                    disabled={isMinusDisabled || loading}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300 disabled:opacity-50"
                    aria-label="Giảm số lượng"
                  >
                    <Minus className="h-4 w-4 stroke-[3]" />
                  </button>

                  <span className="w-8 text-center text-lg font-black text-gray-800">
                    {qty}
                  </span>

                  <button
                    onClick={() => handleIncrement(ticket.type, ticket.count)}
                    disabled={isPlusDisabled || loading}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300 disabled:opacity-50"
                    aria-label="Tăng số lượng"
                  >
                    <Plus className="h-4 w-4 stroke-[3]" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-lg relative z-20">
        <button
          onClick={onCancel}
          disabled={loading}
          className="w-full rounded-xl border border-gray-300 py-3.5 text-center text-sm font-extrabold text-gray-700 bg-white hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Quay lại
        </button>
        <button
          onClick={handleContinue}
          disabled={totalSelected === 0 || loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#34A99D] py-3.5 text-center text-sm font-extrabold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#2d968b] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
        >
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          Tiếp tục ({totalSelected} vé)
        </button>
      </div>
    </div>
  );
}
