/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom"/>

import { checkCircleFill, crossCircle, spinner } from "./icons.ts";
import { tooltip } from "./tooltip.ts";
export type Status = "loading" | "pass" | "fail" | "none";

export function statusButton() {
  const a = document.createElement("a");
  a.classList.add("tool-btn");
  a.type = "button";
  a.setAttribute("aria-haspopup", "true");
  let visible = false;
  const { show, hide } = tooltip();

  const setStatus = async (status: Status, message?: string) => {
    a.textContent = "";
    await hide();
    switch (status) {
      case "loading":
        a.append(spinner());
        break;
      case "pass":
        a.append(checkCircleFill());
        break;
      case "fail":
        a.append(crossCircle());
        break;
      case "none":
        break;
    }
    if (message !== undefined && status !== "none") {
      a.style.removeProperty("pointer-events");
      a.onclick = async () => {
        if (visible) {
          await hide();
        } else {
          const { top, left } = a.getBoundingClientRect();
          show(message, {
            y: top + window.scrollY,
            x: left,
          });
        }
        visible = !visible;
      };
    } else {
      a.style.pointerEvents = "none";
    }
  };

  return {
    component: a,
    setStatus,
  };
}
