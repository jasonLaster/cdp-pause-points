const {reverse, } = require("lodash")
const puppeteer = require('puppeteer');
const minimist = require("minimist");
const highlight = require('cli-highlight').highlight

const args = minimist(process.argv.slice(1), {
  string: ["url", "file"],
  boolean: ["format"]
});

const url = args.url || "https://silly-stepping.glitch.me/"
const file = args.file || "/client.js"
const shouldFormat = args.format;
let sources = [];

function waitFor(predicate) {
  return new Promise(resolve => {
    let t = setInterval(() => {
      let resp = predicate();
      if (resp) {
        clearInterval(t);
         resolve(resp);
      }
    }, 50)
  })
}

function waitForSource(url) {
  return waitFor(() => sources.find(source => source.url.includes(url)))
}


function insertStrtAt(string, index, newString) {
  const start = string.slice(0, index);
  const end = string.slice(index);
  return `${start}${newString}${end}`;
}

function formatPausePoints(text, pausePoints) {
  const nodes = reverse(pausePoints);
  const lines = text.split("\n");
  nodes.forEach((node, index) => {
    const { line, column } = node;
    const types = {
      call: 'c',
      debuggerStatement: 'd',
      return: 'r'
    }

    const type = types[node.type] || 'o'


    lines[line] = insertStrtAt(lines[line], column, `/*${type}*/`);
  });

  const code = lines.join("\n")
  return highlight(code, {language: 'js', ignoreIllegals: true})
}


(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://example.com');

  const client = await page.target().createCDPSession();
  await client.send('Debugger.enable');

  client.on("Debugger.scriptParsed", (source) => {
    sources.push(source)
  })


  await page.goto(url);
  const { scriptId } = await waitForSource(file)


  const {scriptSource: text} = await client.send("Debugger.getScriptSource", { scriptId })

  let {locations: points} = await client.send("Debugger.getPossibleBreakpoints", {
    start: {
      scriptId,
      lineNumber: 1,
      columnNumber: 0
    },
    end: {
      scriptId,
      lineNumber: 10000000,
      columnNumber: 000000
    }
  })

  points = points.map(point => ({
    line: point.lineNumber,
    column: point.columnNumber,
    type: point.type
  }))

  if (shouldFormat) {
    console.log(formatPausePoints(text, points))
  } else {
    console.log(JSON.stringify(points, null, 2))
  }


  await browser.close();
})();
