"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { AlertTriangle, Home } from "lucide-react";
import { Suspense } from "react";

function ErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code");

  const isForbidden = code === "403";
  const errorMessage = isForbidden
    ? "Lỗi 403: Bạn không có quyền truy cập vào trang này."
    : "Đã xảy ra sự cố không xác định trên hệ thống.";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#FFF3C8] px-4 py-16 overflow-hidden">
      {/* Decorative ambient background blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-[#34A99D]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-red-500/10 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/60 bg-white/70 p-8 text-center shadow-2xl backdrop-blur-lg sm:p-10">
        {/* Warning Icon with Ring */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100/80 text-red-500 shadow-inner animate-pulse">
          <AlertTriangle className="h-10 w-10 text-red-500" />
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-black tracking-tight text-[#458393] sm:text-3xl">
          {isForbidden ? "Truy cập bị từ chối" : "Đã xảy ra lỗi"}
        </h2>

        {/* Divider */}
        <div className="mx-auto my-5 h-1 w-16 rounded-full bg-[#34A99D]/50" />

        {/* Error Details */}
        <div className="mb-8 rounded-2xl bg-red-50/50 p-4 border border-red-100 text-center">
          <p className="text-sm font-semibold text-gray-700 leading-relaxed">
            {errorMessage}
          </p>
        </div>

        {/* Actions Button */}
        <button
          onClick={() => router.push("/")}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#34A99D] py-3.5 text-sm font-extrabold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#2d968b] active:scale-[0.98]"
        >
          <Home className="h-4 w-4" />
          Về trang chủ
        </button>
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FFF3C8] text-gray-900 flex items-center justify-center font-bold">
        Đang tải...
      </div>
    }>
      <ErrorContent />
    </Suspense>
  );
}
