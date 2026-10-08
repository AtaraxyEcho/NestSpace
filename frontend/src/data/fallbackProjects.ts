import type { Project } from '../types/project'

export const fallbackProjects: Project[] = [
  {
    id: "001",
    date: "2024.08",
    status: "LIVE",
    name: "Aperture",
    cn: "光圈档案",
    latin: "Apertura Photographica",
    habitat: "The Terminal",
    type: "CLI",
    language: "Rust",
    stars: "2.8k",
    year: "2024",
    description: {
      en: "A quiet, precise image pipeline built for people who would rather compose than configure.",
      zh: "为专注创作而生的安静图像管线，让构图先于配置。",
    },
    shape: "aperture",
    version: "v2.4.1",
    updated: "2024.10.18",
    repository: "github.com/nestspace/aperture",
    challenge:
      "Creative teams were spending more time maintaining image tooling than shaping the work itself. Existing pipelines were powerful, but configuration-heavy and difficult to reproduce.",
    solution:
      "Aperture turns a folder of source material into a deterministic, production-ready image set through one concise command and a human-readable manifest.",
    features: [
      "Lossless batch pipeline",
      "Deterministic manifests",
      "Plugin-based transforms",
      "CI-ready output",
    ],
    metrics: [
      { label: "BUILD TIME", value: "−63%" },
      { label: "BUNDLE SAVED", value: "41 MB" },
      { label: "MONTHLY RUNS", value: "18.6k" },
    ],
    timeline: [
      {
        date: "2023.12",
        title: "First seed",
        note: "Internal image scripts consolidated into one CLI.",
      },
      {
        date: "2024.04",
        title: "Public beta",
        note: "Manifest format and plugin API released.",
      },
      {
        date: "2024.08",
        title: "Stable habitat",
        note: "Version 2.0 reached a stable production interface.",
      },
    ],
  },
  {
    id: "002",
    date: "2024.06",
    status: "LIVE",
    name: "Lumen",
    cn: "微光引擎",
    latin: "Lumen Observabilis",
    habitat: "Edge Runtime",
    type: "SDK",
    language: "TypeScript",
    stars: "1.6k",
    year: "2023",
    description: {
      en: "A compact observability layer that reveals the shape of distributed systems without the noise.",
      zh: "轻量可观测层，在不制造噪声的前提下呈现分布式系统的轮廓。",
    },
    shape: "lumen",
    version: "v1.8.0",
    updated: "2024.09.26",
    repository: "github.com/nestspace/lumen",
    challenge:
      "Edge applications needed useful traces without shipping a full observability stack or exposing customer data.",
    solution:
      "Lumen captures a minimal set of structured signals at the edge, then assembles them into readable traces close to the developer workflow.",
    features: [
      "Privacy-first tracing",
      "Edge runtime support",
      "Zero-config sampling",
      "OpenTelemetry export",
    ],
    metrics: [
      { label: "OVERHEAD", value: "0.8%" },
      { label: "EVENTS / DAY", value: "2.1m" },
      { label: "ADAPTERS", value: "12" },
    ],
    timeline: [
      {
        date: "2023.03",
        title: "Signal study",
        note: "A minimal event vocabulary was tested in production.",
      },
      {
        date: "2023.10",
        title: "Edge release",
        note: "Workers and Deno adapters joined the core SDK.",
      },
      {
        date: "2024.06",
        title: "Open collection",
        note: "The project opened to external maintainers.",
      },
    ],
  },
  {
    id: "003",
    date: "2023.11",
    status: "BETA",
    name: "Fjord",
    cn: "峡湾容器",
    latin: "Fjordia Modularis",
    habitat: "Local Networks",
    type: "Runtime",
    language: "Go",
    stars: "934",
    year: "2022",
    description: {
      en: "A self-contained runtime for small services, shaped by constraints and designed to travel.",
      zh: "为小型服务打造的自包含运行时，在约束中成形，为迁移而设计。",
    },
    shape: "fjord",
    version: "v0.9.4",
    updated: "2024.08.11",
    repository: "github.com/nestspace/fjord",
    challenge:
      "Small internal services inherited deployment complexity designed for systems many times their size.",
    solution:
      "Fjord packages process supervision, service discovery, and local persistence into a portable runtime with deliberately narrow boundaries.",
    features: [
      "Single binary deploy",
      "Local-first discovery",
      "Health supervision",
      "Portable state snapshots",
    ],
    metrics: [
      { label: "IMAGE SIZE", value: "18 MB" },
      { label: "STARTUP", value: "42 ms" },
      { label: "SERVICES", value: "64" },
    ],
    timeline: [
      {
        date: "2022.07",
        title: "Constraint map",
        note: "Runtime boundaries were established through field tests.",
      },
      {
        date: "2023.02",
        title: "Portable core",
        note: "Linux and macOS targets reached parity.",
      },
      {
        date: "2023.11",
        title: "Beta habitat",
        note: "Snapshotting and supervised restarts were introduced.",
      },
    ],
  },
  {
    id: "004",
    date: "2022.09",
    status: "LIVE",
    name: "Meridian",
    cn: "子午索引",
    latin: "Meridiana Indexica",
    habitat: "The Browser",
    type: "Library",
    language: "JavaScript",
    stars: "3.1k",
    year: "2021",
    description: {
      en: "A spatial index for interfaces where information should feel discovered, not merely retrieved.",
      zh: "为空间界面设计的索引，让信息像被发现，而不只是被检索。",
    },
    shape: "meridian",
    version: "v3.2.2",
    updated: "2024.10.02",
    repository: "github.com/nestspace/meridian",
    challenge:
      "Conventional search flattened rich visual collections into ranked lists and removed their sense of place.",
    solution:
      "Meridian combines a compact spatial index with interaction primitives for maps, canvases, timelines, and exploratory archives.",
    features: [
      "2D spatial queries",
      "Incremental indexing",
      "Framework agnostic",
      "Accessible navigation",
    ],
    metrics: [
      { label: "QUERY", value: "3.4 ms" },
      { label: "NODES", value: "100k" },
      { label: "SIZE", value: "7.2 KB" },
    ],
    timeline: [
      {
        date: "2021.05",
        title: "First coordinates",
        note: "The index began inside an experimental archive.",
      },
      {
        date: "2022.01",
        title: "Public release",
        note: "Core queries became framework independent.",
      },
      {
        date: "2022.09",
        title: "Navigation layer",
        note: "Keyboard and screen-reader traversal shipped.",
      },
    ],
  },
]
