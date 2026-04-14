"use client";

import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";

import { cn } from "@/lib/utils";

// Pixels of travel before we decide whether a touch is a horizontal drag
// (engage the sidebar) or a vertical scroll (release tracking).
const DIRECTION_LOCK_THRESHOLD = 8;
// Fraction of the sidebar width past which a released drag settles open
// instead of snapping closed (used when velocity is below the threshold).
const OPEN_PROGRESS_THRESHOLD = 0.5;
// Pointer velocity (px/ms) at release that forces an open/close decision
// regardless of current position — a fast flick always wins over position.
const VELOCITY_THRESHOLD = 0.1;
const OPEN_TRANSITION = {
  type: "tween" as const,
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};
const SETTLE_TRANSITION = {
  type: "tween" as const,
  duration: 0.18,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

type MobileSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "left" | "right";
  width: number;
  className?: string;
  children: React.ReactNode;
};

export function MobileSidebar({
  open,
  onOpenChange,
  side,
  width,
  className,
  children,
}: MobileSidebarProps) {
  const closedX = side === "left" ? -width : width;
  const x = useMotionValue(open ? 0 : closedX);

  const draggingRef = React.useRef(false);
  const trackingRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const startYRef = React.useRef(0);
  const startOpenRef = React.useRef(open);
  const lastXRef = React.useRef(0);
  const lastTimeRef = React.useRef(0);
  const velocityRef = React.useRef(0);
  const openRef = React.useRef(open);
  const tapStartRef = React.useRef<{
    x: number;
    y: number;
    popperOpen: boolean;
  } | null>(null);

  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  React.useEffect(() => {
    if (draggingRef.current) return;
    const controls = animate(x, open ? 0 : closedX, OPEN_TRANSITION);
    return () => controls.stop();
  }, [open, closedX, x]);

  const clamp = React.useCallback(
    (value: number) => {
      if (side === "left") return Math.min(0, Math.max(closedX, value));
      return Math.max(0, Math.min(closedX, value));
    },
    [side, closedX],
  );

  React.useEffect(() => {
    const handleStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const currentlyOpen = openRef.current;

      trackingRef.current = true;
      draggingRef.current = false;
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      startOpenRef.current = currentlyOpen;
      lastXRef.current = touch.clientX;
      lastTimeRef.current = performance.now();
      velocityRef.current = 0;
    };

    const handleMove = (event: TouchEvent) => {
      if (!trackingRef.current) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      if (!draggingRef.current) {
        if (
          Math.abs(dx) < DIRECTION_LOCK_THRESHOLD &&
          Math.abs(dy) < DIRECTION_LOCK_THRESHOLD
        ) {
          return;
        }
        if (Math.abs(dy) > Math.abs(dx)) {
          trackingRef.current = false;
          return;
        }
        draggingRef.current = true;
        x.stop();
      }

      const base = startOpenRef.current ? 0 : closedX;
      const next = clamp(base + dx);
      x.set(next);

      const now = performance.now();
      const dt = now - lastTimeRef.current;
      if (dt > 0) {
        velocityRef.current = (touch.clientX - lastXRef.current) / dt;
      }
      lastXRef.current = touch.clientX;
      lastTimeRef.current = now;

      if (event.cancelable) event.preventDefault();
    };

    const handleEnd = () => {
      if (!trackingRef.current) {
        return;
      }
      const wasDragging = draggingRef.current;
      trackingRef.current = false;
      draggingRef.current = false;

      if (!wasDragging) return;

      const current = x.get();
      const progress =
        side === "left"
          ? (current - closedX) / (0 - closedX)
          : (closedX - current) / (closedX - 0);

      const velocity = velocityRef.current;
      const velocityOpensFor =
        side === "left"
          ? velocity > VELOCITY_THRESHOLD
          : velocity < -VELOCITY_THRESHOLD;
      const velocityClosesFor =
        side === "left"
          ? velocity < -VELOCITY_THRESHOLD
          : velocity > VELOCITY_THRESHOLD;

      let shouldOpen: boolean;
      if (velocityOpensFor) shouldOpen = true;
      else if (velocityClosesFor) shouldOpen = false;
      else shouldOpen = progress > OPEN_PROGRESS_THRESHOLD;

      animate(x, shouldOpen ? 0 : closedX, SETTLE_TRANSITION);

      if (shouldOpen !== openRef.current) {
        onOpenChange(shouldOpen);
      }
    };

    window.addEventListener("touchstart", handleStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchmove", handleMove, {
      capture: true,
      passive: false,
    });
    window.addEventListener("touchend", handleEnd, { capture: true });
    window.addEventListener("touchcancel", handleEnd, { capture: true });
    return () => {
      window.removeEventListener("touchstart", handleStart, true);
      window.removeEventListener("touchmove", handleMove, true);
      window.removeEventListener("touchend", handleEnd, true);
      window.removeEventListener("touchcancel", handleEnd, true);
    };
  }, [side, closedX, clamp, x, onOpenChange]);

  const overlayOpacity = useTransform(x, [closedX, 0], [0, 0.5]);
  const overlayPointerEvents = useTransform(x, (value) =>
    value === closedX ? "none" : "auto",
  );

  return (
    <>
      <motion.div
        aria-hidden
        style={{ opacity: overlayOpacity, pointerEvents: overlayPointerEvents }}
        className="fixed inset-0 z-40 bg-black"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          tapStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            popperOpen: !!document.querySelector(
              "[data-radix-popper-content-wrapper], [data-radix-focus-guard] + *[data-state='open']",
            ),
          };
        }}
        onPointerUp={(event) => {
          const start = tapStartRef.current;
          tapStartRef.current = null;
          if (!start) return;
          if (start.popperOpen) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 6 || Math.abs(dy) > 6) return;
          onOpenChange(false);
        }}
      />
      <motion.aside
        style={{ x, width }}
        className={cn(
          "fixed inset-y-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground shadow-lg",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          "border-sidebar-border",
          className,
        )}
      >
        {children}
      </motion.aside>
    </>
  );
}
