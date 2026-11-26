import { cn } from "@/lib/utils";

/** Decorative dashboard preview used on the login brand panel. */
export function LoginDashboardIllustration({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto w-full max-w-[420px]", className)} aria-hidden="true">
      {/* Floating trend card */}
      <div className="absolute -top-2 -left-1 z-20 rounded-xl border border-[rgb(255_255_255/0.6)] bg-[#ffffff] px-3 py-2 shadow-[0_10px_28px_rgb(15_23_42/0.18)] sm:-left-4">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#1E6B4B]" />
          <span className="h-1.5 w-10 rounded-full bg-[#E2E8F0]" />
        </div>
        <svg viewBox="0 0 72 28" className="h-7 w-[4.5rem]" fill="none">
          <path
            d="M2 22 C14 20, 18 10, 30 12 C42 14, 48 4, 70 6"
            stroke="#1E6B4B"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="70" cy="6" r="2.5" fill="#1E6B4B" />
        </svg>
      </div>

      {/* Floating avatar cluster */}
      <div className="absolute top-8 -right-1 z-20 flex items-center rounded-xl border border-[rgb(255_255_255/0.6)] bg-[#ffffff] px-2.5 py-2 shadow-[0_10px_28px_rgb(15_23_42/0.16)] sm:-right-3">
        <span className="flex size-7 items-center justify-center rounded-full border-2 border-[#ffffff] bg-[#14452F] text-[10px] font-semibold text-[#ffffff]">
          A
        </span>
        <span className="-ml-2 flex size-7 items-center justify-center rounded-full border-2 border-[#ffffff] bg-[#3D8B6E] text-[10px] font-semibold text-[#ffffff]">
          B
        </span>
        <span className="-ml-2 flex size-7 items-center justify-center rounded-full border-2 border-[#ffffff] bg-[#E2E8F0] text-[10px] font-semibold text-[#475569]">
          +
        </span>
      </div>

      {/* Main dashboard window */}
      <div className="relative z-10 overflow-hidden rounded-2xl border border-[rgb(255_255_255/0.2)] bg-[#ffffff] shadow-[0_24px_48px_rgb(15_23_42/0.28)]">
        <div className="flex h-[200px] sm:h-[230px]">
          {/* Sidebar */}
          <div className="flex w-11 shrink-0 flex-col gap-2.5 bg-[#14452F] px-2.5 py-3 sm:w-12">
            <div className="mb-2 size-5 rounded-md bg-[rgb(255_255_255/0.25)]" />
            <div className="h-1.5 w-full rounded-full bg-[rgb(255_255_255/0.35)]" />
            <div className="h-1.5 w-full rounded-full bg-[rgb(255_255_255/0.2)]" />
            <div className="h-1.5 w-full rounded-full bg-[rgb(255_255_255/0.2)]" />
            <div className="mt-auto h-1.5 w-full rounded-full bg-[rgb(255_255_255/0.15)]" />
          </div>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 bg-[#F8FAFC] p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="h-2 w-20 rounded-full bg-[#CBD5E1]" />
              <div className="h-6 w-6 rounded-full bg-[rgb(20_69_47/0.2)]" />
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[1.2fr_0.8fr] gap-2.5">
              {/* Bar chart card */}
              <div className="flex flex-col rounded-xl border border-[#E2E8F0] bg-[#ffffff] p-2.5">
                <div className="mb-2 h-1.5 w-12 rounded-full bg-[#E2E8F0]" />
                <div className="mt-auto flex h-16 items-end gap-1.5 px-0.5 sm:h-20">
                  <div className="w-full rounded-t-sm bg-[rgb(30_107_75/0.35)]" style={{ height: "42%" }} />
                  <div className="w-full rounded-t-sm bg-[rgb(30_107_75/0.55)]" style={{ height: "68%" }} />
                  <div className="w-full rounded-t-sm bg-[#1E6B4B]" style={{ height: "88%" }} />
                  <div className="w-full rounded-t-sm bg-[rgb(30_107_75/0.45)]" style={{ height: "55%" }} />
                  <div className="w-full rounded-t-sm bg-[rgb(30_107_75/0.7)]" style={{ height: "74%" }} />
                </div>
              </div>

              {/* Pie + list */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-1 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#ffffff] p-2">
                  <svg viewBox="0 0 40 40" className="size-12 sm:size-14">
                    <circle cx="20" cy="20" r="16" fill="#E8F1ED" />
                    <path d="M20 20 L20 4 A16 16 0 0 1 34.5 28 Z" fill="#1E6B4B" />
                    <path d="M20 20 L34.5 28 A16 16 0 0 1 8 30 Z" fill="#3D8B6E" />
                    <circle cx="20" cy="20" r="7" fill="#ffffff" />
                  </svg>
                </div>
                <div className="space-y-1.5 rounded-xl border border-[#E2E8F0] bg-[#ffffff] p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[#1E6B4B]" />
                    <span className="h-1 w-full rounded-full bg-[#E2E8F0]" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[#3D8B6E]" />
                    <span className="h-1 w-[70%] rounded-full bg-[#E2E8F0]" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[#CBD5E1]" />
                    <span className="h-1 w-[55%] rounded-full bg-[#E2E8F0]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Network nodes accent */}
      <svg
        viewBox="0 0 80 56"
        className="absolute -right-2 -bottom-1 z-0 h-14 w-20 opacity-70 sm:-right-4"
        fill="none"
      >
        <circle cx="12" cy="28" r="4" fill="#A7D4C0" />
        <circle cx="40" cy="12" r="3.5" fill="#7BB89A" />
        <circle cx="64" cy="34" r="5" fill="#C5E4D5" />
        <circle cx="36" cy="44" r="3" fill="#8FC4A8" />
        <path
          d="M16 28 L37 14 M38 16 L60 32 M40 16 L36 40 M16 30 L34 42"
          stroke="#A7D4C0"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
