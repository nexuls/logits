"use client";

import { useCallback, useEffect, useRef } from "react";

type DebouncedOptions = {
  delayMs: number;
};

export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void | Promise<void>,
  { delayMs }: DebouncedOptions,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const lastArgsRef = useRef<TArgs | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (!timerRef.current) return;

    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (!lastArgsRef.current) return;

    cancel();
    void callbackRef.current(...lastArgsRef.current);
    lastArgsRef.current = null;
  }, [cancel]);

  const debounced = useCallback(
    (...args: TArgs) => {
      lastArgsRef.current = args;
      cancel();

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (!lastArgsRef.current) return;

        const nextArgs = lastArgsRef.current;
        lastArgsRef.current = null;
        void callbackRef.current(...nextArgs);
      }, delayMs);
    },
    [cancel, delayMs],
  );

  useEffect(() => () => cancel(), [cancel]);

  return {
    debounced,
    flush,
    cancel,
  };
}
