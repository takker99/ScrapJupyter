/**
 * Converts a Blob object to a data URL string.
 *
 * @param data - The Blob object to convert.
 * @returns A Promise that resolves with the data URL string.
 */
export const toDataURL = (data: Blob): Promise<string> =>
  new Promise(
    (resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener(
        "load",
        () => {
          const dataURL = reader.result as string;
          const index = dataURL.indexOf(";");
          if (dataURL.startsWith("; charset=utf-8", index)) {
            resolve(`${dataURL.slice(0, index)}${dataURL.slice(index + 15)}`);
          } else {
            resolve(dataURL);
          }
        },
      );
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(data);
    },
  );
