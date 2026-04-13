import { createContext, useContext } from "react";

export interface TourCtx {
  active: boolean;
  /** Pass the current pathname to resume the tour from the nearest matching step */
  start: (fromPath?: string) => void;
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
