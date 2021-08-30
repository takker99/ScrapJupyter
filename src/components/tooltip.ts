/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom"/>

export type Position = {
  x: number;
  y: number;
};

export function tooltip() {
  let tooltip: HTMLDivElement | undefined;

  const show = (text: string, { x, y }: Position) => {
    tooltip = createContainer();
    tooltip.append(inner(text));
    // 見えない状態でDOMを実体化させて、幅と高さを計算する
    tooltip.style.visibility = "hidden";
    document.body.append(tooltip);
    const { height } = tooltip.getBoundingClientRect();
    tooltip.style.top = `${y - height}px`;
    tooltip.style.left = `${x}px`;
    tooltip.style.removeProperty("visibility");
  };
  const hide = async () => {
    tooltip?.classList?.remove?.("in");
    await new Promise((resolve) => setTimeout(resolve, 150));
    tooltip?.remove?.();
  };

  return {
    show,
    hide,
  };
}

function createContainer() {
  const tooltip = document.createElement("div");
  tooltip.setAttribute("role", "tooltip");
  tooltip.classList.add("fade", "in", "tooltip", "top");
  return tooltip;
}

function inner(text: string) {
  const inner = document.createElement("pre");
  inner.classList.add("tooltip-inner");
  inner.style.textAlign = "unset";
  inner.style.maxWidth = "70vw";
  inner.style.margin = "unset";
  inner.innerText = text;
  return inner;
}
