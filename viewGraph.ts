import { relative as makeRelative } from "https://raw.githubusercontent.com/takker99/scrapbox-bundler/632c749a6287d628bb8bed5cf21c5d9b6f15f58e/path.ts";

export interface ImportGraph {
  isCache: boolean;
  children: string[];
}
export type GraphView = { [key: string]: GraphView };

export const viewGraph = (
  path: string,
  graphMap: Map<string, ImportGraph>,
  relative?: boolean,
): GraphView => viewGraphImpl(path, graphMap, new Map(), relative ?? false);

const viewGraphImpl = (
  path: string,
  graphMap: Map<string, ImportGraph>,
  viewedPath: Map<string, GraphView>,
  relative: boolean,
  parent?: string,
): GraphView => {
  const graph = graphMap.get(path);
  const text = `[${graph?.isCache ? "Cache" : "Network"}] ${
    relative && parent
      ? decodeURIComponent(makeRelative(new URL(parent), new URL(path)))
      : decodeURIComponent(path)
  }`;
  {
    const view = viewedPath.get(path);
    if (view) return view;
  }
  const view: GraphView = { [text]: {} };
  viewedPath.set(path, view);
  for (const childPath of graph?.children ?? []) {
    Object.assign(
      view[text],
      viewGraphImpl(
        childPath,
        graphMap,
        viewedPath,
        relative,
        path,
      ),
    );
  }
  return view;
};
