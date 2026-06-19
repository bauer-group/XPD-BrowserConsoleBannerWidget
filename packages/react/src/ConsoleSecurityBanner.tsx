import { useConsoleSecurityBanner } from './useConsoleSecurityBanner';
import type { ConsoleBannerOptions } from './options';

/**
 * Drop-in component that arms the Console Security Banner. Renders nothing —
 * mount it once near the root of your app.
 *
 * @example
 * ```tsx
 * <ConsoleSecurityBanner />              // local mode, auto language
 * <ConsoleSecurityBanner mode="cdn" />   // load from the CDN instead
 * ```
 */
export function ConsoleSecurityBanner(props: ConsoleBannerOptions): null {
  useConsoleSecurityBanner(props);
  return null;
}
