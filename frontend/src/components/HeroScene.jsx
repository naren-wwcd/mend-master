// Original line-art loop in the style of the reference: a mender bot taps a
// status board, pulses run along the wires, and the DISK link breaks and heals.

const CELL = 18;
const GRID = { x: 118, y: 150, cols: 5, rows: 6 };
const CELL_STATES = {
  "0-1": "a", "1-0": "ink", "1-3": "b", "2-2": "a", "2-4": "ink", "3-1": "b",
  "3-3": "a", "4-0": "a", "4-2": "ink", "4-4": "b", "5-1": "ink", "5-3": "a",
};

const NODES = [
  { id: "app", label: "APP", x: 800, y: 132 },
  { id: "db", label: "DB", x: 930, y: 208 },
  { id: "worker", label: "WORKER", x: 1066, y: 126 },
  { id: "disk", label: "DISK", x: 842, y: 306 },
  { id: "pay", label: "PAY", x: 1020, y: 316 },
];

const WIRES = [
  { id: "bot", d: "M352 338H452V250H540", delay: 0 },
  { id: "app", d: "M660 214H730V132H766", delay: 0.5 },
  { id: "db", d: "M660 250H830V208H896", delay: 1.1 },
  { id: "worker", d: "M834 132H940V126H1032", delay: 1.7 },
  { id: "pay", d: "M876 306H950V316H986", delay: 2.3 },
];
const MEND_WIRE = "M660 286H740V306H808";

function Node({ id, label, x, y }) {
  return (
    <g className={`scene-node node-${id}`}>
      <path className="node-top" d={`M${x} ${y - 17}L${x + 34} ${y}L${x} ${y + 17}L${x - 34} ${y}Z`} />
      <path d={`M${x - 34} ${y}V${y + 30}L${x} ${y + 47}V${y + 17}`} />
      <path d={`M${x + 34} ${y}V${y + 30}L${x} ${y + 47}`} />
      <path className="node-led" d={`M${x} ${y - 7}L${x + 14} ${y}L${x} ${y + 7}L${x - 14} ${y}Z`} />
      <path className="node-slot" d={`M${x - 26} ${y + 14}L${x - 8} ${y + 23}M${x - 26} ${y + 22}L${x - 8} ${y + 31}`} />
      <text x={x} y={y + 68}>{label}</text>
    </g>
  );
}

export default function HeroScene() {
  const cells = [];
  for (let row = 0; row < GRID.rows; row += 1) {
    for (let col = 0; col < GRID.cols; col += 1) {
      const state = CELL_STATES[`${row}-${col}`];
      cells.push(
        <rect
          key={`${row}-${col}`}
          className={state ? `cell cell-${state}` : "cell"}
          style={{ "--d": `${((row * 3 + col * 5) % 7) * 0.32}s` }}
          x={GRID.x + col * CELL}
          y={GRID.y + row * CELL}
          width={CELL}
          height={CELL}
        />,
      );
    }
  }

  return (
    <svg className="hero-scene" viewBox="0 0 1200 460" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      {/* Backdrop: faceted outlines and the ground. */}
      <g className="scene-backdrop">
        <path d="M40 400V262l44-30 38 34v-66l46-28" />
        <path d="M700 400V96l58-40 40 30v46" />
        <path d="M1110 400V200l48-30v230" />
        <path d="M468 400V306l40-24 26 18" />
      </g>
      <g className="scene-ground">
        <path d="M24 400H1176" />
        <path className="dashes" d="M70 420H420M520 420H700M790 420H1130" />
        <path className="dashes" d="M150 438H330M610 438H930" />
      </g>

      {/* Wires, with an accent pulse travelling along each one. */}
      <g className="scene-wires">
        {WIRES.map((wire) => (
          <g key={wire.id}>
            <path d={wire.d} />
            <path className="pulse" pathLength="100" d={wire.d} style={{ "--d": `${wire.delay}s` }} />
          </g>
        ))}
        <path className="wire-mend" d={MEND_WIRE} />
        <path className="pulse pulse-mend" pathLength="100" d={MEND_WIRE} />
      </g>

      {/* Status board on a pole. */}
      <g className="scene-grid">
        <path d="M163 258V400M143 400H183" />
        <rect className="board" x={GRID.x - 6} y={GRID.y - 6} width={GRID.cols * CELL + 12} height={GRID.rows * CELL + 12} />
        {cells}
      </g>

      {/* The mender bot. */}
      <g className="scene-bot">
        <path d="M262 400v-22M318 400v-22M248 400h28M304 400h28" />
        <rect className="fill-paper" x="240" y="296" width="100" height="84" rx="14" />
        <g className="bot-mark">
          <path d="M270 322c14 0 20 9 40 9M270 334c14 0 20 9 40 9M270 346c14 0 20 9 40 9" />
        </g>
        <g className="bot-head">
          <path d="M290 250v-20" />
          <circle className="bot-antenna" cx="290" cy="226" r="5" />
          <rect className="fill-paper" x="256" y="250" width="68" height="46" rx="12" />
          <g className="bot-eyes">
            <circle cx="276" cy="272" r="5" />
            <circle cx="304" cy="272" r="5" />
          </g>
        </g>
        <g className="bot-arm">
          <path d="M242 318L214 286L222 250" />
          <circle className="fill-paper" cx="222" cy="246" r="6" />
        </g>
        <path d="M340 330h12v16h-12" />
      </g>

      {/* The core: a faceted crystal holding the Mend mark. */}
      <g className="scene-core">
        <path className="fill-paper" d="M600 96l60 62-14 176-46 50-46-50-14-176z" />
        <path className="facets" d="M600 96v288M540 158l60 34 60-34M554 334l46-36 46 36" />
        <g className="core-mark">
          <path d="M566 214c22 0 34 16 68 16M566 238c22 0 34 16 68 16M566 262c22 0 34 16 68 16" />
        </g>
      </g>
      <path className="core-base" d="M556 400l14-14h60l14 14" />

      {/* Services. */}
      {NODES.map((node) => <Node key={node.id} {...node} />)}
      <circle className="mend-ring" cx="842" cy="306" r="30" />

      <g className="scene-sparks">
        <path d="M420 150v16M412 158h16" style={{ "--d": "0s" }} />
        <path d="M712 356v12M706 362h12" style={{ "--d": "1.2s" }} />
        <path d="M1130 70v16M1122 78h16" style={{ "--d": "2.1s" }} />
        <path d="M70 180v12M64 186h12" style={{ "--d": "0.7s" }} />
      </g>
    </svg>
  );
}
