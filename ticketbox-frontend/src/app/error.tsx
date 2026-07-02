"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    // Log the error for tracking purposes
    console.error("Global Error Boundary caught:", error);
  }, [error]);

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
        {/* Warning Icon with Pulse Ring */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100/80 text-red-500 shadow-inner animate-pulse-ring">
          <AlertTriangle className="h-10 w-10 text-red-500" />
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-black tracking-tight text-[#458393] sm:text-3xl">
          Đã có lỗi xảy ra!
        </h2>

        {/* Divider */}
        <div className="mx-auto my-5 h-1 w-16 rounded-full bg-[#34A99D]/50" />

        {/* Error Details */}
        <div className="mb-8 rounded-2xl bg-red-50/50 p-4 border border-red-100 text-left">
          <span className="block text-xs font-bold uppercase tracking-wider text-red-500 mb-1">
            Chi tiết lỗi
          </span>
          <p className="text-sm font-semibold text-gray-700 break-words leading-relaxed">
            {error.message || "Đã xảy ra sự cố không xác định trên hệ thống."}
          </p>
          {error.digest && (
            <span className="mt-2 block text-[10px] font-mono text-gray-400">
              Digest Code: {error.digest}
            </span>
          )}
        </div>

        {/* Actions Button Stack */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => reset()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#34A99D] py-3.5 text-sm font-extrabold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#2d968b] active:scale-[0.98] active:bg-[#278278]"
          >
            <RefreshCw className="h-4 w-4" />
            Thử lại
          </button>

          <button
            onClick={() => router.push("/")}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white/50 py-3.5 text-sm font-extrabold text-gray-700 transition-all duration-300 hover:scale-[1.02] hover:bg-gray-100 active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            Về trang chủ
          </button>
        </div>
      </div>
    </div>
  );
}
