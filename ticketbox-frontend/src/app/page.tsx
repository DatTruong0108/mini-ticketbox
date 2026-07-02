"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Loader2, AlertCircle, Check } from "lucide-react";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();

  const [userName, setUserName] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-redirect nếu đã có accessToken trong localStorage hoặc sessionStorage
  useEffect(() => {
    const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
    if (token) {
      router.push("/event");
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = userName.trim();
    if (!trimmed) {
      setError("Vui lòng nhập tên đăng nhập.");
      return;
    }

    setLoading(true);

    try {
      const { data } = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, { userName: trimmed });

      // Lấy data theo chuẩn BaseResponse của Backend
      const { accessToken, refreshToken } = data.data || data;

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem("accessToken", accessToken);
      storage.setItem("refreshToken", refreshToken);
      storage.setItem("userName", trimmed);

      router.push("/event");
    } catch (err: unknown) {
      let msg = "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
      if (axios.isAxiosError(err)) {
        msg =
          err.response?.data?.message ??
          "Đăng nhập thất bại. Vui lòng thử lại.";
      }
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="relative flex min-h-screen items-center justify-center px-4 py-12 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=2000')",
      }}
    >
      {/* Lớp overlay đen mờ */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px] z-0"></div>

      {/* ---- Login Card ---- */}
      <div className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* ---- Card Header (Teal banner) ---- */}
        <div className="bg-[#34A99D] px-6 py-6 text-center">
          <h1 className="text-3xl font-bold text-white tracking-wide">
            Đăng nhập
          </h1>
          <p className="mt-1 text-sm font-medium text-white/90">
            TicketBox — Đặt vé concert
          </p>
        </div>

        {/* ---- Card Body ---- */}
        <div className="p-6 sm:p-8 bg-white text-gray-900">
          {/* Error Alert */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* User Name Input */}
            <div>
              <label
                htmlFor="userName"
                className="mb-1.5 block text-sm font-bold text-gray-900"
              >
                Tên đăng nhập
              </label>
              <input
                id="userName"
                type="text"
                placeholder="Nhập user name..."
                autoComplete="username"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={loading}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 placeholder-gray-400 transition-all duration-200 hover:border-gray-400 focus:ring-2 focus:ring-[#34A99D] focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60"
              />

              {/* Important notice */}
              <p className="mt-2 text-sm text-[#458393] italic font-semibold leading-relaxed">
                Mỗi khách hàng phải có user name độc nhất và phải ghi nhớ cho các lần đăng nhập sau.
              </p>
            </div>

            {/* Remember Me */}
            <label
              htmlFor="rememberMe"
              className="flex cursor-pointer items-center gap-2.5 select-none"
            >
              <div className="relative flex items-center">
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded border-2 border-gray-300 bg-white transition-all checked:border-[#34A99D] checked:bg-[#34A99D] disabled:cursor-not-allowed"
                />
                <Check
                  className="pointer-events-none absolute left-px top-px h-4 w-4 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                  strokeWidth={3}
                />
              </div>
              <span className="text-sm font-bold text-gray-700">
                Lưu thông tin đăng nhập
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#34A99D] px-6 py-3 text-base font-bold text-white transition-all duration-200 hover:bg-[#458393] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 shadow-md"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Đang xử lý...
                </span>
              ) : (
                "Đăng nhập"
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-6 text-center text-xs font-semibold text-gray-400">
            © 2026 TicketBox &bull; Trải nghiệm âm nhạc đỉnh cao
          </p>
        </div>
      </div>
    </main>
  );
}