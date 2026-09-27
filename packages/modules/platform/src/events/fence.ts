/** An executor that stops working the moment its delivery ends. A handler abandoned at timeout keeps running (a
 *  Promise.race cannot stop it); without the fence its late queries run on a connection that is no longer in the
 *  delivery's transaction — in autocommit, after the rollback. The fence rejects every query awaited after close(),
 *  including builders created before it and nested transactions (savepoints) opened through it. */
export function fenceExecutor<T extends object>(exec: T): { exec: T; close(): void } {
  let open = true;
  const closed = () => new Error("delivery transaction is closed — the handler outlived its timeout");
  const wrap = (target: any): any => {
    if (target === null || (typeof target !== "object" && typeof target !== "function")) return target;
    return new Proxy(target, {
      get(t, prop) {
        if (prop === "then" && typeof t.then === "function") {
          // queries execute when awaited: check at that moment, not when the builder was created
          return (res?: any, rej?: any) => (open ? t.then(res, rej) : Promise.reject(closed()).then(res, rej));
        }
        const v = Reflect.get(t, prop, t);
        if (typeof v !== "function") return v;
        if (prop === "transaction") {
          return (cb: (inner: any) => any, cfg?: unknown) => {
            if (!open) throw closed();
            return wrap(v.call(t, (inner: any) => cb(wrap(inner)), cfg));
          };
        }
        return (...args: any[]) => {
          if (!open) throw closed();
          return wrap(v.apply(t, args));
        };
      },
    });
  };
  return {
    exec: wrap(exec) as T,
    close: () => {
      open = false;
    },
  };
}
