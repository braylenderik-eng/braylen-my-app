"use client";

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { initialState, loadState, reducer, STORAGE_KEY, type Action, type GameState } from "@/lib/game/state";

interface Ctx {
  state: GameState;
  dispatch: Dispatch<Action>;
  hydrated: boolean;
  title: boolean; // the app just opened: show the title screen first
  hasSave: boolean; // a save exists in this browser
  closeTitle: () => void; // continue the current save
}

const GameContext = createContext<Ctx | null>(null);

type Internal = Action | { type: "@@load"; state: GameState; hasSave: boolean } | { type: "@@closeTitle" };
interface Root {
  game: GameState;
  hydrated: boolean;
  title: boolean;
  hasSave: boolean;
}

function rootReducer(r: Root, a: Internal): Root {
  if (a.type === "@@load") return { game: a.state, hydrated: true, title: true, hasSave: a.hasSave };
  if (a.type === "@@closeTitle") return { ...r, title: false };
  return { title: false, hydrated: r.hydrated, hasSave: true, game: reducer(r.game, a) };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [{ game: state, hydrated, title, hasSave }, dispatch] = useReducer(rootReducer, undefined, () => ({ game: initialState(0), hydrated: false, title: false, hasSave: false }));

  // Load the save after mount so the server render and first client render match.
  // (Before that, a fixed-seed placeholder renders hidden; loadState gives a new save a random seed.)
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked (private mode); play without saving.
    }
    dispatch({ type: "@@load", state: loadState(raw), hasSave: raw !== null });
  }, []);

  useEffect(() => {
    if (!hydrated || !hasSave) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota or privacy errors.
    }
  }, [state, hydrated, hasSave]);

  return <GameContext.Provider value={{ state, dispatch: dispatch as Dispatch<Action>, hydrated, title, hasSave, closeTitle: () => dispatch({ type: "@@closeTitle" }) }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
