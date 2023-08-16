/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom"/>

import { play } from "./icons.ts";

export const execButton = (onClick: (event: MouseEvent) => void) => {
  const a = document.createElement("a");
  a.classList.add("tool-btn");
  a.type = "button";
  a.setAttribute("aria-haspopup", "true");
  a.append(play());
  a.addEventListener("click", onClick);
  return a;
};
