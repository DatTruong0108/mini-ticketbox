import React from "react";

interface TicketTypeDetail {
  type: string;
  price: number;
  count: number;
}

interface TicketListProps {
  ticketDetails: TicketTypeDetail[];
  onBuyClick: () => void;
}

export default function TicketList({ ticketDetails, onBuyClick }: TicketListProps) {
  return (
    <section>
      <h2 className="text-xl font-black text-[#458393] uppercase tracking-wide mb-6">
        Danh sách loại vé
      </h2>

      {ticketDetails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-gray-500 font-semibold">
            Không tìm thấy thông tin loại vé nào.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ticketDetails.map((ticket) => (
            <div
              key={ticket.type}
              className="flex flex-col sm:flex-row sm:items-center justify-between bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all duration-200 gap-4"
            >
              <div>
                <h3 className="text-lg font-bold text-gray-900 tracking-wide uppercase">
                  {ticket.type}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Số lượng còn lại:{" "}
                  <span
                    className={`font-bold ${
                      ticket.count > 0 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {ticket.count > 0 ? `${ticket.count} vé` : "Hết vé"}
                  </span>
                </p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-6">
                <span className="text-lg font-black text-[#458393] whitespace-nowrap">
                  {new Intl.NumberFormat("vi-VN").format(ticket.price)} đ
                </span>

                {ticket.count > 0 ? (
                  <button
                    onClick={onBuyClick}
                    className="rounded-xl bg-[#34A99D] px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-300 hover:scale-[1.02] hover:bg-[#2d968b] active:scale-[0.98]"
                  >
                    Mua vé ngay
                  </button>
                ) : (
                  <button
                    disabled
                    className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white opacity-60 cursor-not-allowed"
                  >
                    Hết vé
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
