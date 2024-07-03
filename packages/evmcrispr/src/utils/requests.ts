import type { BindingsManager } from "../BindingsManager";
import type { BindingsSpace } from "../types";

const TIMER_MILLISECONDS = 8500;

export const setTimer = <T>(fn: () => Promise<T>): Promise<T | never> =>
  Promise.race<T | never>([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(`Request timer expired (${TIMER_MILLISECONDS}ms)`),
        TIMER_MILLISECONDS,
      );
    }),
  ]);

export const tryAndCacheNotFound = async <T>(
  fetchResourceFn: () => Promise<T>,
  resourceName: string,
  bindingSpace: BindingsSpace,
  cache: BindingsManager,
): Promise<T | void> => {
  if (cache.getBindingValue(resourceName, bindingSpace) === null) {
    return;
  }

  try {
    const result = await setTimer(fetchResourceFn);
    return result;
  } catch (_err) {
    if (!cache.hasBinding(resourceName, bindingSpace)) {
      cache.setBinding(resourceName, null, bindingSpace);
    }
    return;
  }
};
