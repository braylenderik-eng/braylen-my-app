"use client";

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { initialState, loadState, reducer, STORAGE_KEY, type Action, type GameState } from "@/lib/game/state";

interface Ctx {
  state: GameState;
  dispatch: Dispatch<Action>;
  hydrated: boolean;
}

const GameContext = createContext<Ctx | null>(null);

type Internal = Action | { type: "@@load"; state: GameState };
interface Root {
  game: GameState;
  hydrated: boolean;
}

function rootReducer(r: Root, a: Internal): Root {
  if (a.type === "@@load") return { game: a.state, hydrated: true };
  return { ...r, game: reducer(r.game, a) };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [{ game: state, hydrated }, dispatch] = useReducer(rootReducer, undefined, () => ({ game: initialState(0), hydrated: false }));

  // Load the save after mount so the server render and first client render match.
  // (Before that, a fixed-seed placeholder renders hidden; loadState gives a new save a random seed.)
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked (private mode); play without saving.
    }
    dispatch({ type: "@@load", state: loadState(raw) });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota or privacy errors.
    }
  }, [state, hydrated]);

  return <GameContext.Provider value={{ state, dispatch, hydrated }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
