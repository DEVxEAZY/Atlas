import { expect, test } from "bun:test";
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { FRAME_MS, holdForInput, useFrame } from "../src/components/clock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Probe({ id, seen }: { id: string; seen: Map<string, number[]> }) {
  const n = useFrame();
  seen.set(id, [...(seen.get(id) ?? []), n]);
  return <Text>{`${id}${n}`}</Text>;
}

test("every animation advances on the same shared frame", async () => {
  const seen = new Map<string, number[]>();
  const app = render(
    <>
      <Probe id="a" seen={seen} />
      <Probe id="b" seen={seen} />
    </>,
  );
  await sleep(FRAME_MS * 3.5);
  app.unmount();
  const a = seen.get("a")!;
  const b = seen.get("b")!;
  expect(a.length).toBeGreaterThan(2);
  expect(a.at(-1)).toBe(b.at(-1)); // one clock, not two drifting timers
});

test("a keypress holds the animations still for a moment", async () => {
  const seen = new Map<string, number[]>();
  const app = render(<Probe id="a" seen={seen} />);
  await sleep(FRAME_MS * 1.5);
  holdForInput(FRAME_MS * 3);
  const before = seen.get("a")!.at(-1);
  await sleep(FRAME_MS * 2.5);
  expect(seen.get("a")!.at(-1)).toBe(before);
  await sleep(FRAME_MS * 2);
  expect(seen.get("a")!.at(-1)).toBeGreaterThan(before!);
  app.unmount();
});
