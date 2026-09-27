import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Declarative data-fetching hook. Runs `fn` on mount (and whenever `deps`
 * change), tracking loading / error state. Errors are normalised to strings.
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  opts: { immediate?: boolean } = {},
): AsyncState<T> & { refetch: () => void; setData: (d: T | null) => void } {
  const { immediate = true } = opts;
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: immediate,
    error: null,
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (mounted.current) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (mounted.current) setState({ data, loading: false, error: null });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "加载失败";
      if (mounted.current) setState((s) => ({ ...s, loading: false, error: message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (immediate) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    ...state,
    refetch: () => void run(),
    setData: (d) => setState((s) => ({ ...s, data: d })),
  };
}
