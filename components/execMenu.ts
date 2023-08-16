/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom"/>

import { statusButton } from "./status.ts";
import { execButton } from "./execButton.ts";

export const execMenu = (onClick: (event: MouseEvent) => void) => {
  const { component: status, setStatus } = statusButton();
  const menu = document.createElement("div");
  menu.style.position = "absolute";
  menu.style.left = "-2em";
  menu.style.zIndex = "1";
  menu.style.display = "flex";
  menu.style.flexFlow = "column";
  menu.append(execButton(onClick), status);
  return { menu, setStatus };
};
