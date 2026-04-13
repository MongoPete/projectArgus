import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { TOUR_STEPS } from "./tourSteps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getTargetRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function tooltipPosition(
  rect: Rect | null,
  placement: string,
  tipW: number,
  tipH: number
): { top: number; left: number } {
  if (!rect) {
    return {
      top: window.innerHeight / 2 - tipH / 2,
      left: window.innerWidth / 2 - tipW / 2,
    };
  }
  const gap = 20;
  switch (placement) {
    case "bottom":
      return { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2 - tipW / 2 };
    case "top":
      return { top: rect.top - tipH - gap, left: rect.left + rect.width / 2 - tipW / 2 };
    case "left":
      return { top: rect.top + rect.height / 2 - tipH / 2, left: rect.left - tipW - gap };
    case "right":
      return { top: rect.top + rect.height / 2 - tipH / 2, left: rect.left + rect.width + gap };
    default:
      return {
        top: window.innerHeight / 2 - tipH / 2,
        left: window.innerWidth / 2 - tipW / 2,
      };
  }
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export function TourOverlay({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const nav = useNavigate();
  const location = useLocation();
  const [stepIdx, setStepIdx] = useState(initialStep);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipSize, setTipSize] = useState({ w: 280, h: 160 });
  const [isAnimating, setIsAnimating] = useState(false);
  const clickedRef = useRef<Set<string>>(new Set());

  const step = TOUR_STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  const measureTarget = useCallback(() => {
    if (!step) return;
    if (step.target) {
      const rect = getTargetRect(step.target);
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [step]);

  // Handle navigation
  useEffect(() => {
    if (!step) return;
    const currentFull = location.pathname + location.search;
    const stepBase = step.route.split("?")[0];
    const onWrongPath = !location.pathname.startsWith(stepBase);
    const onWrongSearch =
      step.exact
        ? currentFull !== step.route          // must match exactly — no stray query params
        : step.route.includes("?") && currentFull !== step.route;

    if (onWrongPath || onWrongSearch) {
      nav(step.route);
    }
  }, [step, location.pathname, location.search, nav]);

  // Measure target and handle click actions
  useEffect(() => {
    setIsAnimating(true);

    // Scroll target into view before measuring so off-screen elements are visible
    if (step?.scrollToTarget && step.target) {
      const el = document.querySelector(step.target);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    const timer1 = setTimeout(measureTarget, 250);
    const timer2 = setTimeout(measureTarget, 500);
    const timer3 = setTimeout(() => setIsAnimating(false), 300);

    // Handle clickOnEnter
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    if (step?.clickOnEnter && !clickedRef.current.has(step.id)) {
      const delay = step.clickDelay ?? 500;
      clickTimer = setTimeout(() => {
        const el = document.querySelector(step.clickOnEnter!) as HTMLElement;
        if (el) {
          clickedRef.current.add(step.id);
          el.click();
        }
      }, delay);
    }

    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      if (clickTimer) clearTimeout(clickTimer);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [measureTarget, stepIdx, step]);

  useEffect(() => {
    if (tipRef.current) {
      setTipSize({ w: tipRef.current.offsetWidth, h: tipRef.current.offsetHeight });
    }
  }, [stepIdx]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepIdx]);

  if (!step) return null;

  const pos = tooltipPosition(targetRect, step.placement, tipSize.w, tipSize.h);
  const finalPos = {
    top: clamp(pos.top, 16, window.innerHeight - tipSize.h - 16),
    left: clamp(pos.left, 16, window.innerWidth - tipSize.w - 16),
  };
  const isCentered = !step.target || !targetRect;

  function next() {
    if (isLast) {
      onClose();
    } else {
      setStepIdx((i) => i + 1);
    }
  }

  function prev() {
    if (!isFirst) {
      setStepIdx((i) => i - 1);
    }
  }

  // Calculate spotlight padding
  const pad = 10;
  const spotTop = targetRect ? targetRect.top - pad : 0;
  const spotLeft = targetRect ? targetRect.left - pad : 0;
  const spotWidth = targetRect ? targetRect.width + pad * 2 : 0;
  const spotHeight = targetRect ? targetRect.height + pad * 2 : 0;

  function forwardScroll(e: React.WheelEvent) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const scrollable = target?.closest<HTMLElement>("[data-tour], main, [class*='overflow-y'], [class*='overflow-auto'], body");
    if (scrollable && scrollable !== document.body) {
      scrollable.scrollTop += e.deltaY;
    } else {
      window.scrollBy(0, e.deltaY);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Dark overlay with cutout using clip-path */}
      {targetRect && !isCentered ? (
        <div
          className="absolute inset-0 bg-black/70 transition-all duration-500 pointer-events-auto"
          style={{
            clipPath: `polygon(
              0% 0%,
              0% 100%,
              ${spotLeft}px 100%,
              ${spotLeft}px ${spotTop}px,
              ${spotLeft + spotWidth}px ${spotTop}px,
              ${spotLeft + spotWidth}px ${spotTop + spotHeight}px,
              ${spotLeft}px ${spotTop + spotHeight}px,
              ${spotLeft}px 100%,
              100% 100%,
              100% 0%
            )`,
          }}
          onClick={onClose}
          onWheel={forwardScroll}
        />
      ) : (
        <div
          className="absolute inset-0 bg-black/70 pointer-events-auto"
          onClick={onClose}
          onWheel={forwardScroll}
        />
      )}

      {/* Green border around spotlight */}
      {targetRect && !isCentered && (
        <div
          className={`absolute pointer-events-none transition-all duration-500 ease-out rounded-xl ${
            isAnimating ? "opacity-0" : "opacity-100"
          }`}
          style={{
            top: spotTop,
            left: spotLeft,
            width: spotWidth,
            height: spotHeight,
            border: "2px solid rgba(0, 237, 100, 0.6)",
            boxShadow: "0 0 20px rgba(0, 237, 100, 0.15), inset 0 0 20px rgba(0, 237, 100, 0.05)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tipRef}
        className={`absolute z-10 pointer-events-auto transition-all duration-500 ease-out ${
          isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
        }`}
        style={{ top: finalPos.top, left: finalPos.left }}
      >
        <div
          className={`
            bg-[#0D1F17] border border-mdb-leaf/25
            rounded-2xl shadow-2xl
            overflow-hidden
            ${isCentered ? "w-[320px]" : "w-[260px]"}
          `}
        >
          {/* Content */}
          <div className={`${isCentered ? "px-8 pt-8 pb-6" : "px-6 pt-6 pb-4"} text-center`}>
            <h3 className={`font-semibold text-white ${isCentered ? "text-xl" : "text-base"}`}>
              {step.title}
            </h3>
            <p className={`text-[#889397] mt-2 ${isCentered ? "text-[15px]" : "text-[13px]"}`}>
              {step.body}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 pb-4">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === stepIdx
                    ? "w-5 h-1.5 bg-mdb-leaf"
                    : i < stepIdx
                      ? "w-1.5 h-1.5 bg-mdb-leaf/50"
                      : "w-1.5 h-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="text-[13px] text-[#5C6C75] hover:text-[#889397] transition-colors px-2 py-1"
            >
              Skip
            </button>
            <div className="flex items-center gap-1">
              {!isFirst && (
                <button
                  type="button"
                  onClick={prev}
                  className="text-[13px] text-[#889397] hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.06] transition-all"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="text-[13px] font-medium text-[#001E2B] bg-mdb-leaf hover:bg-mdb-leaf/90 px-4 py-1.5 rounded-lg transition-all"
              >
                {step.action ?? "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
