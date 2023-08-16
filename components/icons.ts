/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom"/>

export const checkCircleFill = () => {
  const icon = document.createElement("i");
  icon.classList.add("kamon", "kamon-check-circle-fill");
  icon.style.color = "hsl(133, 46.1%, 47.3%)";
  return icon;
};

export const crossCircle = () => {
  const icon = document.createElement("i");
  icon.classList.add("kamon", "kamon-cross-circle");
  icon.style.color = "hsl(1.7, 64.5%, 58%)";
  return icon;
};

export const spinner = () => {
  const icon = document.createElement("i");
  icon.classList.add("i", "fa", "fa-spinner");
  return icon;
};

export const play = () => {
  const icon = document.createElement("i");
  icon.classList.add("kamon", "kamon-play");
  return icon;
};
