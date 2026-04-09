import { createContext, useContext } from "react";

export interface TourCtx {
  active: boolean;
  start: () => void;
  stop: () => void;
}

export const TourContext = createContext<TourCtx>({
  active: false,
  start: () => {},
  stop: () => {},
});

export function useTour() {
  return useContext(TourContext);
}
