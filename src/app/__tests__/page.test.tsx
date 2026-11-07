import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "../page";

test("home page renders a heading", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
});
