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
        () => resolve(reader.result as string),
      );
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(data);
    },
  );
