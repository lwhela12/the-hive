import { forwardRef } from 'react';
import type { ComponentProps, ComponentRef } from 'react';
import {
  SafeAreaView as LibSafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

/**
 * The one SafeAreaView this app uses. Every screen imports it from here, never
 * from react-native-safe-area-context directly.
 *
 * It exists because of a bug in the library's WEB implementation, found
 * 2026-08-25 after a day of chasing a 34pt blank stripe across four builds:
 * `SafeAreaView.web.js` decides each edge's padding with a switch whose
 * `default:` branch is "additive". An edge you LEFT OUT of `edges={['top']}`
 * has no mode at all — undefined — so it falls into that default and gets
 * padded anyway. Every screen written as "pad the top only" was also getting
 * the home-indicator inset (34pt) as bottom padding — the blank stripe over
 * the bottom of every page on a phone — and the notch insets (62pt a side)
 * as left/right padding the moment the phone turned sideways, which was the
 * "weird white borders everywhere" in landscape. Desktop browsers report
 * every inset as 0, which is why no laptop ever showed any of it.
 *
 * The fix: convert the array form into a record that names EVERY edge, 'off'
 * unless asked for, so nothing is left to fall into the buggy default. An
 * omitted `edges` prop keeps the library's pad-everything default, which is
 * what omitting it means.
 */
type LibProps = ComponentProps<typeof LibSafeAreaView>;

const EVERY_EDGE_OFF = { top: 'off', bottom: 'off', left: 'off', right: 'off' } as const;

export const SafeAreaView = forwardRef<ComponentRef<typeof LibSafeAreaView>, LibProps>(
  function SafeAreaView({ edges, ...rest }, ref) {
    const explicit = Array.isArray(edges)
      ? {
          ...EVERY_EDGE_OFF,
          ...Object.fromEntries(edges.map((edge) => [edge, 'additive' as const])),
        }
      : edges;
    return <LibSafeAreaView ref={ref} edges={explicit as LibProps['edges']} {...rest} />;
  }
);

// Re-exported so a file that needs both only ever names one module, and the
// import swap that brought every file here stayed a one-line change.
export { useSafeAreaInsets };
