import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeElement(id = "") {
  const classes = new Set();
  return {
    id,
    width: id === "arena" ? 720 : undefined,
    height: id === "arena" ? 720 : undefined,
    dataset: {},
    style: {},
    children: [],
    textContent: "",
    innerHTML: "",
    value: 0,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        if (force === true) classes.add(name);
        else if (force === false) classes.delete(name);
        else if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      },
      contains: (name) => classes.has(name),
    },
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    getContext() {
      return new Proxy({}, { get: (target, key) => target[key] || (() => {}), set: (target, key, value) => ((target[key] = value), true) });
    },
  };
}

function loadEngine() {
  const elements = new Map();
  const document = {
    hidden: false,
    documentElement: makeElement("documentElement"),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    querySelector() {
      return makeElement();
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return makeElement();
    },
    addEventListener() {},
  };
  class ImageStub {
    constructor() {
      this.complete = false;
      this.naturalWidth = 0;
      this.src = "";
    }
  }
  class AudioStub {
    play() {
      return Promise.resolve();
    }
  }
  const context = vm.createContext({
    console,
    document,
    Image: ImageStub,
    Audio: AudioStub,
    Math,
    Date,
    Set,
    Map,
    Promise,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    setTimeout: () => 0,
    clearTimeout() {},
  });
  context.window = context;
  context.globalThis = context;
  const source = fs.readFileSync(path.join(repoRoot, "game.js"), "utf8");
  vm.runInContext(source, context, { filename: "game.js" });
  return context.ballfightDev;
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readGitCommit() {
  try {
    const gitDir = path.join(repoRoot, ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head;
    const ref = head.slice(5);
    const looseRef = path.join(gitDir, ...ref.split("/"));
    if (fs.existsSync(looseRef)) return fs.readFileSync(looseRef, "utf8").trim();
    const packedRefs = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
    return packedRefs
      .split(/\r?\n/)
      .find((line) => line.endsWith(` ${ref}`))
      ?.split(" ")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

function combinations(items, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push([...prefix]);
    return output;
  }
  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    prefix.push(items[index]);
    combinations(items, size, index + 1, prefix, output);
    prefix.pop();
  }
  return output;
}

const tripleOrders = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function runJob(engine, job, options) {
  const wins = Object.fromEntries(job.map((id) => [id, 0]));
  let draws = 0;
  let timeouts = 0;
  let totalDuration = 0;
  for (let run = 0; run < options.runs; run += 1) {
    const order =
      job.length === 2
        ? run % 2 === 0
          ? job
          : [job[1], job[0]]
        : tripleOrders[run % tripleOrders.length].map((index) => job[index]);
    const seed = hashSeed(`${options.seed}:${job.join(":")}:${run}`);
    const result = engine.simulate(order, { seed, tickRate: options.tickRate, maxSeconds: options.maxSeconds });
    totalDuration += result.duration;
    if (result.winner) wins[result.winner] += 1;
    else draws += 1;
    if (result.timedOut) timeouts += 1;
  }
  return { fighters: job, games: options.runs, wins, draws, timeouts, averageDuration: totalDuration / options.runs };
}

if (!isMainThread) {
  const engine = loadEngine();
  const results = [];
  for (const job of workerData.jobs) {
    results.push(runJob(engine, job, workerData.options));
    parentPort.postMessage({ type: "progress", job });
  }
  parentPort.postMessage({ type: "done", results });
} else {
  const args = process.argv.slice(2);
  const readArg = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  const mode = readArg("--mode", "1v1");
  if (!new Set(["1v1", "1v1v1"]).has(mode)) throw new Error("--mode must be 1v1 or 1v1v1");
  const availableWorkers = Math.max(1, os.availableParallelism() - 1);
  const options = {
    runs: Math.max(1, Number.parseInt(readArg("--runs", "1000"), 10)),
    workers: Math.max(1, Number.parseInt(readArg("--workers", String(availableWorkers)), 10)),
    tickRate: Math.max(10, Number.parseInt(readArg("--tick-rate", "30"), 10)),
    maxSeconds: Math.max(10, Number.parseInt(readArg("--max-seconds", "300"), 10)),
    seed: Number.parseInt(readArg("--seed", "20260611"), 10),
  };
  options.workers = Math.min(options.workers, availableWorkers);

  const metadataEngine = loadEngine();
  const fighterIds = metadataEngine.fighterIds;
  const fighterCount = mode === "1v1" ? 2 : 3;
  const jobs = combinations(fighterIds, fighterCount);
  const workerCount = Math.min(options.workers, jobs.length);
  const chunks = Array.from({ length: workerCount }, () => []);
  jobs.forEach((job, index) => chunks[index % workerCount].push(job));

  console.log(`[Ballfight] ${mode}: ${jobs.length} combinations x ${options.runs} games`);
  console.log(`[Ballfight] workers=${workerCount}, tick=${options.tickRate}/s, timeout=${options.maxSeconds}s`);
  const startedAt = Date.now();
  let completed = 0;
  const workerResults = await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), { workerData: { jobs: chunk, options } });
          worker.on("message", (message) => {
            if (message.type === "progress") {
              completed += 1;
              console.log(`[${completed}/${jobs.length}] ${message.job.join(" vs ")} complete`);
            } else if (message.type === "done") resolve(message.results);
          });
          worker.on("error", reject);
          worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Simulation worker exited with code ${code}`));
          });
        }),
    ),
  );
  const results = workerResults.flat().sort((a, b) => a.fighters.join(":").localeCompare(b.fighters.join(":")));

  const indexSource = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  const version = indexSource.match(/class="version-label"[^>]*>([^<]+)/)?.[1]?.trim() || "unknown";
  const commit = readGitCommit();
  const outputDir = path.join(repoRoot, "stats");
  fs.mkdirSync(outputDir, { recursive: true });
  const payload = {
    metadata: {
      version,
      commit,
      mode,
      generatedAt: new Date().toISOString(),
      elapsedSeconds: (Date.now() - startedAt) / 1000,
      ...options,
      combinations: jobs.length,
      totalGames: jobs.length * options.runs,
    },
    fighters: metadataEngine.fighters,
    results,
  };
  const fighterName = (id) => metadataEngine.fighters[id]?.name || id;
  const percent = (value, total) => `${((value / total) * 100).toFixed(1)}%`;
  const overall = Object.fromEntries(fighterIds.map((id) => [id, { games: 0, wins: 0 }]));
  for (const result of results) {
    for (const id of result.fighters) {
      overall[id].games += result.games;
      overall[id].wins += result.wins[id];
    }
  }
  const reportLines = [
    "BALLFIGHT 상대 승률 통계",
    "=".repeat(64),
    `버전: ${version}`,
    `모드: ${mode}`,
    `생성 시각: ${payload.metadata.generatedAt}`,
    `Git 커밋: ${commit}`,
    `조합당 경기 수: ${options.runs.toLocaleString("ko-KR")}`,
    `전체 경기 수: ${payload.metadata.totalGames.toLocaleString("ko-KR")}`,
    `설정: 워커 ${options.workers}개 / ${options.tickRate}틱 / 경기 제한 ${options.maxSeconds}초`,
    "",
    "[캐릭터별 전체 승률]",
  ];
  for (const id of fighterIds) {
    const record = overall[id];
    reportLines.push(
      `${fighterName(id)}: ${percent(record.wins, record.games)} (${record.wins.toLocaleString("ko-KR")}승 / ${record.games.toLocaleString("ko-KR")}경기)`,
    );
  }
  reportLines.push("", mode === "1v1" ? "[상대별 승률]" : "[3인 조합별 승률]");
  for (const result of results) {
    const names = result.fighters.map(fighterName);
    reportLines.push("", `${names.join(" vs ")} (${result.games.toLocaleString("ko-KR")}경기)`);
    for (const id of result.fighters) {
      reportLines.push(`  ${fighterName(id)}: ${percent(result.wins[id], result.games)} (${result.wins[id].toLocaleString("ko-KR")}승)`);
    }
    reportLines.push(`  무승부: ${percent(result.draws, result.games)} (${result.draws.toLocaleString("ko-KR")}경기)`);
    reportLines.push(`  제한시간 종료: ${result.timeouts.toLocaleString("ko-KR")}경기`);
    reportLines.push(`  평균 경기 시간: ${result.averageDuration.toFixed(1)}초`);
  }
  reportLines.push("", "※ 승률은 무승부를 포함한 전체 경기 수를 기준으로 계산합니다.", "");
  const txt = `\ufeff${reportLines.join("\r\n")}`;
  const reportPath = path.join(outputDir, `latest-${mode}.txt`);
  fs.writeFileSync(reportPath, txt, "utf8");
  console.log(`[Ballfight] complete in ${payload.metadata.elapsedSeconds.toFixed(1)}s`);
  console.log(`[Ballfight] ${path.relative(repoRoot, reportPath)}`);
}
