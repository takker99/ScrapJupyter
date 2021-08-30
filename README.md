# ScrapJupyter

Execute JS/TS/JSX/TSX on Scrapbox roughly

## Install script

Copy all text in
[index.min.js](https://raw.githubusercontent.com/takker99/ScrapJupyter/main/dist/index.min.js)
and paste it on your user page.

For more information about Scrapbox UserScirpt, see
<https://scrapbox.io/help-jp/UserScript>

For more information about the UserSript, see
<https://scrapbox.io/takker/@takker%2FScrapJupyter>

## Build script

```sh
$ deno run -A --unstable https://raw.githubusercontent.com/takker99/ScrapJupyter/main/build.ts && cat dist/index.min.js | xsel
# subdivide text in the clipboard and paste text chunks in order
```

## Credit

- The idea of ScrapJupyter comes from [@miyamonz](https://github.com/miyamonz)
  - see <https://scrapbox.io/miyamonz/ScrapJupyter>
