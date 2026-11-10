import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { GameProvider } from "@/components/GameProvider";
import { SimScreen } from "@/components/screens/SimScreen";

vi.mock("next/navigation", () => ({
  usePathname: () => "/sim",
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
});

test("game plan shows the Rangers game and the sim button plays it", async () => {
  vi.useFakeTimers();
  render(
    <GameProvider>
      <SimScreen />
    </GameProvider>,
  );

  expect(screen.getByRole("heading", { level: 1, name: /game plan/i })).toBeInTheDocument();
  expect(screen.getAllByText("Red River Rangers").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: /sim game/i }));
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByRole("heading", { level: 1, name: /victory|defeat/i })).toBeInTheDocument();
  expect(screen.getByText(/scoring summary/i)).toBeInTheDocument();

  const saved = JSON.parse(window.localStorage.getItem("portal-wars-v2")!);
  expect(saved.week).toBe(12);
  vi.useRealTimers();
});
