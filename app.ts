/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom"/>
/// <reference lib="dom.iterable"/>
import { getCodeFiles } from "./codeFile.ts";
import { load } from "./bundler.ts";
import { isAvailableExtensions } from "./extension.ts";
import { eventName, Scrapbox, takeInternalLines } from "./deps/scrapbox.ts";
import { execMenu } from "./components/execMenu.ts";
import { throttle } from "./deps/throttle.ts";
import { viewGraph } from "./viewGraph.ts";
declare const scrapbox: Scrapbox;

/** ScrapJupyterを起動する
 *
 * @param wasm esbuild.wasmのデータ
 * @param workerURL WebWorker codeへのURL
 * @return 終了函数
 */
export const setup = async (
  wasm: WebAssembly.Module,
  workerURL: string | URL,
) => {
  const bundle = await load(wasm, workerURL);
  const menus = [] as ReturnType<typeof execMenu>[];

  const update = async () => {
    const files = getCodeFiles(
      scrapbox.Project.name,
      scrapbox.Page.title ?? "",
      takeInternalLines(),
    );
    // ボタンを全部リセットする
    menus.forEach(({ menu, setStatus }) => {
      setStatus("none");
      menu.remove();
    });
    files.forEach((file) => {
      const extension = file.lang.toLowerCase();
      // TS/JS以外は無視
      if (!isAvailableExtensions(extension)) return;
      file.startIds.forEach((id) => {
        const line = document.getElementById(`L${id}`);
        const { menu, setStatus } = execMenu(
          async () => {
            await setStatus("loading");
            try {
              const { contents, graph } = await bundle(
                file.lines.join("\n"),
                {
                  extension,
                  fileName: file.filename,
                  dirURL: `${file.dir}/`,
                },
              );
              console.debug(viewGraph(graph, true));
              console.debug("execute:", contents);
              await Function(`return (async()=>{${contents}})()`)();
              await setStatus("pass");
            } catch (e) {
              await setStatus("fail", e.toString());
            }
          },
        );
        menus.push({ menu, setStatus });
        line?.insertBefore?.(menu, line?.firstElementChild);
      });
    });
    await Promise.resolve();
  };
  const callback = throttle(update, {
    interval: 100,
    trailing: true,
  });
  await callback();
  scrapbox.addListener("lines:changed" as eventName, callback);

  return () => {
    scrapbox.removeListener("lines:changed" as eventName, callback);
    menus.forEach(({ menu, setStatus }) => {
      setStatus("none");
      menu.remove();
    });
  };
};
