/** Animated spinner, driven by the shared clock. Ticks only while enabled
 *  so idle screens cost zero. Prefer <Spin>, which re-renders alone: a
 *  spinner read in a big component re-renders all of it every frame. */
import React from "react";
import { Text } from "ink";
import { G } from "../glyphs";
import { useFrame } from "./clock";

export const SPIN_FRAMES = G.spinner;

export function useSpinner(enabled: boolean): string {
  const n = useFrame(enabled);
  return SPIN_FRAMES[n % SPIN_FRAMES.length];
}

/** A spinner frame plus a space, as its own leaf. */
export function Spin({ color }: { color: string }) {
  const f = useSpinner(true);
  return React.createElement(Text, { color }, `${f} `);
}
