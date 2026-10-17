/**
 * Ambient declarations for non-code imports.
 *
 * `mapbox-gl`'s stylesheet is imported for its side effect inside MapView.
 * TypeScript resolves the real file and then complains it is not a module,
 * because Mapbox ships no typings for the CSS. Declaring the wildcard lets the
 * side-effect import type-check while the bundler still emits the stylesheet.
 */
declare module '*.css';
declare module '*.scss';
declare module '*.svg' {
  const content: string;
  export default content;
}