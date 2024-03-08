/** CSPのconnect-srcで許可されているURLかどうか判定する */
export const isAllowedConnectSrc = (url: URL): boolean => {
  if (connectSrc.includes(url.hostname)) {
    return true;
  }
  if (url.hostname.endsWith(".openai.azure.com")) {
    return true;
  }
  return false;
};

const connectSrc = [
  "i.gyazo.com",
  "t.gyazo.com",
  "scrapbox.io",
  "api.openai.com",
  "*.openai.azure.com",
  "maps.googleapis.com",
  "upload.gyazo.com",
  "storage.googleapis.com",
  "sentry.io",
];
