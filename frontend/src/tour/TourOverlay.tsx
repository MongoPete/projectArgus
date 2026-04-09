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
  const gap = 16;
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

export function TourOverlay({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const location = useLocation();
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipSize, setTipSize] = useState({ w: 440, h: 300 });

  // Drag state
  const [dragOffset, setDragOffset] = useState<{ top: number; left: number } | null>(null);
  const dragInfo = useRef<{ startX: number; startY: number; origTop: number; origLeft: number } | null>(null);

  const step = TOUR_STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  const measureTarget = useCallback(() => {
    if (!step) return;
    if (step.target) {
      setTargetRect(getTargetRect(step.target));
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!step) return;
    if (location.pathname !== step.route) {
      nav(step.route);
    }
  }, [step, location.pathname, nav]);

  useEffect(() => {
    const timer = setTimeout(measureTarget, 350);
    const retryTimer = setTimeout(measureTarget, 800);
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      clearTimeout(timer);
      clearTimeout(retryTimer);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [measureTarget, stepIdx]);

  useEffect(() => {
    if (tipRef.current) {
      setTipSize({ w: tipRef.current.offsetWidth, h: tipRef.current.offsetHeight });
    }
  }, [stepIdx]);

  // Reset drag offset when step changes so tooltip snaps to the computed position
  useEffect(() => {
    setDragOffset(null);
  }, [stepIdx]);

  // Drag handlers
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragInfo.current) return;
      const dx = e.clientX - dragInfo.current.startX;
      const dy = e.clientY - dragInfo.current.startY;
      setDragOffset({
        top: clamp(dragInfo.current.origTop + dy, 4, window.innerHeight - 60),
        left: clamp(dragInfo.current.origLeft + dx, 4, window.innerWidth - 120),
      });
    }
    function onUp() {
      dragInfo.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!step) return null;

  const pos = tooltipPosition(targetRect, step.placement, tipSize.w, tipSize.h);
  const autoClamped = {
    top: clamp(pos.top, 8, window.innerHeight - tipSize.h - 8),
    left: clamp(pos.left, 8, window.innerWidth - tipSize.w - 8),
  };

  const finalPos = dragOffset ?? autoClamped;
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

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragInfo.current = {
      startX: e.clientX,
      startY: e.clientY,
      origTop: finalPos.top,
      origLeft: finalPos.left,
    };
  }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Backdrop — allow clicks through to the page */}
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />

      {/* Spotlight cutout */}
      {targetRect && !isCentered && (
        <div
          className="absolute rounded-xl ring-2 ring-mdb-leaf/70 shadow-[0_0_0_4000px_rgba(0,0,0,0.30)] pointer-events-none transition-all duration-300"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}

      {/* Tooltip — draggable */}
      <div
        ref={tipRef}
        className={`absolute z-10 pointer-events-auto ${
          dragOffset ? "" : "transition-all duration-300"
        } ${
          isCentered ? "w-[520px]" : "w-[440px]"
        } max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto`}
        style={{ top: finalPos.top, left: finalPos.left }}
      >
        <div className="rounded-2xl border border-mdb-leaf/25 bg-[#0a1a14] shadow-2xl">
          {/* Header — drag handle */}
          <div
            className="px-6 pt-5 pb-0 cursor-grab active:cursor-grabbing select-none"
            onMouseDown={onDragStart}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-wider text-mdb-leaf font-semibold">
                Step {stepIdx + 1} of {TOUR_STEPS.length}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-600">drag to move</span>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-slate-500 hover:text-white text-xs transition-colors"
                >
                  Skip tour ×
                </button>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-white leading-snug">{step.title}</h3>
          </div>

          {/* Body */}
          <div className="px-6 pt-3 pb-4 space-y-4">
            <p className="text-[13px] text-slate-300 leading-relaxed">{step.body}</p>

            {/* Scenario */}
            {step.scenario && (
              <div className="rounded-xl bg-mdb-forest/40 border border-mdb-leaf/15 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-mdb-leaf/80 font-semibold mb-1.5">
                  Scenario
                </div>
                <p className="text-[12.5px] text-slate-300 leading-relaxed">{step.scenario}</p>
              </div>
            )}

            {/* Stats */}
            {step.stats && step.stats.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Key points
                </div>
                {step.stats.map((s) => (
                  <div key={s} className="flex gap-2 text-[12px] text-slate-400">
                    <span className="text-mdb-leaf shrink-0 mt-[2px]">›</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-6 pb-5 pt-0">
            {/* Progress bar */}
            <div className="flex gap-1 mb-4">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === stepIdx
                      ? "flex-[3] bg-mdb-leaf"
                      : i < stepIdx
                        ? "flex-1 bg-mdb-leaf/40"
                        : "flex-1 bg-white/[0.06]"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={prev}
                disabled={isFirst}
                className="text-[13px] text-slate-400 hover:text-white disabled:opacity-20 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={next}
                className="rounded-xl bg-mdb-leaf text-mdb-forest px-5 py-2.5 text-[13px] font-semibold hover:bg-mdb-leaf/90 transition-colors"
              >
                {step.action ?? (isLast ? "Finish" : "Next →")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
