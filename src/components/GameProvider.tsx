"use client";

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { initialState, loadState, reducer, STORAGE_KEY, type Action, type GameState } from "@/lib/game/state";

interface Ctx {
  state: GameState;
  dispatch: Dispatch<Action>;
  hydrated: boolean;
  fresh: boolean; // no save was found: show the welcome screen
  welcomed: () => void; // keep the classic save and skip the welcome screen
}

const GameContext = createContext<Ctx | null>(null);

type Internal = Action | { type: "@@load"; state: GameState; fresh: boolean } | { type: "@@welcomed" };
interface Root {
  game: GameState;
  hydrated: boolean;
  fresh: boolean;
}

function rootReducer(r: Root, a: Internal): Root {
  if (a.type === "@@load") return { game: a.state, hydrated: true, fresh: a.fresh };
  if (a.type === "@@welcomed") return { ...r, fresh: false };
  return { ...r, fresh: false, game: reducer(r.game, a) };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [{ game: state, hydrated, fresh }, dispatch] = useReducer(rootReducer, undefined, () => ({ game: initialState(0), hydrated: false, fresh: false }));

  // Load the save after mount so the server render and first client render match.
  // (Before that, a fixed-seed placeholder renders hidden; loadState gives a new save a random seed.)
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked (private mode); play without saving.
    }
    dispatch({ type: "@@load", state: loadState(raw), fresh: raw === null });
  }, []);

  useEffect(() => {
    if (!hydrated || fresh) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota or privacy errors.
    }
  }, [state, hydrated, fresh]);

  return <GameContext.Provider value={{ state, dispatch: dispatch as Dispatch<Action>, hydrated, fresh, welcomed: () => dispatch({ type: "@@welcomed" }) }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
