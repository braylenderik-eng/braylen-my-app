import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GameProvider } from "@/components/GameProvider";
import { SimScreen } from "@/components/screens/SimScreen";

vi.mock("next/navigation", () => ({
  usePathname: () => "/sim",
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const savedWeek = () => JSON.parse(window.localStorage.getItem("portal-wars-v3")!).week;

test("game plan shows the Rangers game and quick sim plays it", async () => {
  render(
    <GameProvider>
      <SimScreen />
    </GameProvider>,
  );

  expect(screen.getByRole("heading", { level: 1, name: /game plan/i })).toBeInTheDocument();
  expect(screen.getAllByText("Red River Rangers").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: /quick sim/i }));
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByRole("heading", { level: 1, name: /victory|defeat/i })).toBeInTheDocument();
  expect(screen.getByText(/scoring summary/i)).toBeInTheDocument();
  expect(savedWeek()).toBe(12);
});

test("play live: the game unfolds, pauses for calls, and the result counts", async () => {
  render(
    <GameProvider>
      <SimScreen />
    </GameProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /play live/i }));
  await act(async () => {
    vi.advanceTimersByTime(700);
  });
  expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();

  let calls = 0;
  let sawHalftime = false;
  for (let tick = 0; tick < 200 && !screen.queryByRole("button", { name: /see the recap/i }); tick++) {
    const call =
      screen.queryByRole("button", { name: /start the second half/i }) ??
      screen.queryByRole("button", { name: /go for it/i }) ??
      screen.queryByRole("button", { name: /go for two/i }) ??
      screen.queryByRole("button", { name: /play it straight/i });
    if (call) {
      if (/second half/i.test(call.textContent ?? "")) sawHalftime = true;
      fireEvent.click(call);
      calls++;
    }
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
  }

  expect(sawHalftime).toBe(true);
  expect(calls).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole("button", { name: /see the recap/i }));
  expect(screen.getByRole("heading", { level: 1, name: /victory|defeat/i })).toBeInTheDocument();
  expect(screen.getByText(/your calls/i)).toBeInTheDocument();
  expect(savedWeek()).toBe(12);
});
