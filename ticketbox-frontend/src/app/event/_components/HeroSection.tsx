import React from "react";
import { Calendar, MapPin } from "lucide-react";
import Image from "next/image";

interface HeroSectionProps {
    minPrice: number | null;
    onBuyClick?: () => void;
}

export default function HeroSection({ minPrice, onBuyClick }: HeroSectionProps) {
    const formattedPrice =
        minPrice !== null && minPrice !== undefined
            ? `${new Intl.NumberFormat("vi-VN").format(minPrice)} đ`
            : "--- đ";

    return (
        <section className="w-full max-w-7xl px-4 py-8">
            {/* Container Card */}
            <div className="flex flex-col overflow-hidden rounded-2xl bg-[#242424] shadow-2xl transition-all duration-300 hover:shadow-[0_20px_50px_rgba(52,169,157,0.15)] lg:flex-row">
                {/* Left Side: Info */}
                <div className="flex w-full flex-col justify-between p-6 sm:p-10 lg:w-[45%]">
                    {/* Main Info Stack */}
                    <div className="flex flex-col gap-6">
                        <div>
                            <span className="inline-block rounded-full bg-[#34A99D]/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#34A99D]">
                                Concert Hot
                            </span>
                            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                                MẮT NHẮM MẮT MỞ
                            </h1>
                        </div>

                        {/* Event Meta Details */}
                        <div className="flex flex-col gap-4 text-gray-300">
                            {/* Time */}
                            <div className="flex items-start gap-3">
                                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[#34A99D]">
                                    <Calendar className="h-4.5 w-4.5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-gray-400">Thời gian</span>
                                    <span className="text-sm font-bold text-white">
                                        19:30 - 21:30, 01 Tháng 08, 2026
                                    </span>
                                </div>
                            </div>

                            {/* Location */}
                            <div className="flex items-start gap-3">
                                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[#34A99D]">
                                    <MapPin className="h-4.5 w-4.5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-gray-400">Địa điểm</span>
                                    <span className="text-sm font-bold text-white">Sân vận động Phú Thọ</span>
                                    <span className="text-xs text-gray-400">
                                        219 Lý Thường Kiệt, Phường 15, Quận 11, TP. Hồ Chí Minh
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pricing and Action Button */}
                    <div className="mt-8 border-t border-white/10 pt-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-medium text-gray-400">Giá vé công bố</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-sm text-gray-300">Giá từ</span>
                                    {minPrice === null ? (
                                        <span className="inline-block h-6 w-24 animate-pulse rounded bg-white/10" />
                                    ) : (
                                        <span className="text-2xl font-extrabold text-[#34A99D]">
                                            {formattedPrice}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={onBuyClick}
                                className="relative overflow-hidden rounded-xl bg-[#34A99D] px-6 py-3.5 text-center text-sm font-extrabold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#2d968b] active:scale-[0.98] active:bg-[#278278]"
                            >
                                Mua vé ngay
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Side: Image Banner */}
                <div className="relative min-h-[260px] w-full overflow-hidden bg-zinc-900 lg:min-h-full lg:w-[55%]">
                    {/* Unsplash concert banner */}
                    <Image
                        src="/mnmm.png"
                        alt="Concert cá nhân đầu tiên của HIEUTHUHAI"
                        fill
                        priority
                        className="object-cover transition-transform duration-700 hover:scale-105"
                        sizes="(max-width: 1024px) 100vw, 55vw"
                    />
                    {/* Overlay to fade in the dark background on mobile top edge / desktop left edge */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#242424] via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#242424] lg:to-transparent lg:from-0% lg:via-20%" />
                </div>
            </div>
        </section>
    );
}
