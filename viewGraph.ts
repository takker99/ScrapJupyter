import { relative as makeRelative } from "https://raw.githubusercontent.com/takker99/scrapbox-bundler/632c749a6287d628bb8bed5cf21c5d9b6f15f58e/path.ts";
import { ImportGraph } from "./bundler.ts";

export type GraphView = { [key: string]: GraphView };

export const viewGraph = (
  graph: ImportGraph,
  relative?: boolean,
): GraphView => {
  const view: GraphView = {};
  const text = `[${graph.isCache ? "Cache" : "Network"}] ${
    decodeURIComponent(graph.path)
  }`;
  view[text] = {};
  const viewedPath = new Map<string, GraphView>();
  viewedPath.set(graph.path, view[text]);
  for (const child of graph.children) {
    Object.assign(
      view[text],
      viewGraphImpl(
        child,
        graph.path,
        relative ?? false,
        viewedPath,
      ),
    );
  }
  return view;
};
const viewGraphImpl = (
  graph: ImportGraph,
  parent: string,
  relative: boolean,
  viewedPath: Map<string, GraphView>,
): GraphView => {
  const text = `[${graph.isCache ? "Cache" : "Network"}] ${
    relative
      ? makeRelative(new URL(parent), new URL(graph.path))
      : decodeURIComponent(graph.path)
  }`;
  {
    const view = viewedPath.get(graph.path);
    if (view) return view;
  }
  const view: GraphView = {};
  view[text] = {};
  for (const child of graph.children) {
    Object.assign(
      view[text],
      viewGraphImpl(
        child,
        graph.path,
        relative,
        viewedPath,
      ),
    );
  }
  return view;
};
