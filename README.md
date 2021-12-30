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

Run the following command and import `import.json` to your project.

Noto that you must replace `title` and `project` with a favorite page title and your project name.
```sh
$ deno run -A --unstable https://github.com/takker99/ScrapJupyter/raw/v1.2.0/build.ts -t title -p project > import.json
```

## Credit

- The idea of ScrapJupyter comes from [@miyamonz](https://github.com/miyamonz)
  - see <https://scrapbox.io/miyamonz/ScrapJupyter>
