/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom"/>
import { getCodeFiles } from "./codeFile.ts";
import { bundle, isAvailableExtensions } from "./bundler.ts";
import { eventName } from "./deps/scrapbox.ts";
import type { Scrapbox } from "./deps/scrapbox.ts";
import { execMenu } from "./components/execMenu.ts";
import { throttle } from "./deps/throttle.ts";
declare const scrapbox: Scrapbox;

const menus = [] as ReturnType<typeof execMenu>[];

const update = async () => {
  const files = getCodeFiles();
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
            const code = await bundle(file.lines.join("\n"), {
              extension,
              fileName: file.filename,
              resolveDir: file.dir,
            });
            console.log("execute:", code);
            await Function(`return (async()=>{${code}})()`)();
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
