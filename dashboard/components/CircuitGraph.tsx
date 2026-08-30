import dagre from 'dagre';
import { circuitStatusColors, type Confidence } from '../lib/circuitStatusColors';

export type CircuitComponent = Record<string, unknown> & { id: string; type: string };
export type CircuitWire = { from: string; to: string };
export type CircuitSnapshot = { components?: CircuitComponent[]; wires?: CircuitWire[] };

type Props = {
  circuit: CircuitSnapshot | null;
  faultComponents: string[];
  confidence: Confidence;
};

const NODE_WIDTH = 132;
const NODE_HEIGHT = 68;
const ARDUINO_ID = 'arduino';

function isArduinoPin(pin: string) {
  return /^(D\d+|A\d+|GND|VIN|5V|3V3|AREF|RESET|IOREF)$/i.test(pin);
}

function terminalLabel(component: CircuitComponent, pin: string) {
  for (const [key, value] of Object.entries(component)) {
    if (!['id', 'type', 'value'].includes(key) && value === pin) return key;
  }
  return pin;
}

function symbol(type: string, color: string) {
  if (type === 'led') return <><path d="M-24 0h16l12-12v24L-8 0h-16" fill="none" stroke={color} strokeWidth="2" /><path d="M10-14v28" stroke={color} strokeWidth="2" /><path d="M16-18l7-7m-2 10 2-10-10 2M16 18l7-7m-2 10 2-10-10 2" fill="none" stroke={color} strokeWidth="1.5" /></>;
  if (type === 'resistor') return <path d="M-28 0h8l6-10 10 20 10-20 10 20 6-10h8" fill="none" stroke={color} strokeWidth="2" />;
  if (type === 'pir') return <><rect x="-27" y="-16" width="54" height="32" rx="8" fill="none" stroke={color} strokeWidth="2" /><path d="M-14 0h28M0-8v16" stroke={color} strokeWidth="1.5" /></>;
  return <><rect x="-29" y="-18" width="58" height="36" rx="5" fill="none" stroke={color} strokeWidth="2" /><path d="M-21-23v10m10-10v10m10-10v10m10-10v10M-21 13v10m10-10v10m10-10v10m10-10v10" stroke={color} strokeWidth="2" /></>;
}

export function CircuitGraph({ circuit, faultComponents, confidence }: Props) {
  const components = circuit?.components || [];
  const wires = circuit?.wires || [];
  const pinOwners = new Map<string, CircuitComponent>();
  components.forEach((component) => Object.values(component).forEach((value) => {
    if (typeof value === 'string' && ![component.id, component.type, '220 ohm'].includes(value)) pinOwners.set(value, component);
  }));
  const componentIds = new Set(components.map((component) => component.id));
  const componentForEndpoint = (endpoint: string) => pinOwners.get(endpoint)?.id || (componentIds.has(endpoint) ? endpoint : null);
  const connectedComponentIds = new Set(wires.flatMap((wire) => [componentForEndpoint(wire.from), componentForEndpoint(wire.to)].filter((id): id is string => !!id)));
  const connectedComponents = components.filter((component) => connectedComponentIds.has(component.id));

  const graph = new dagre.graphlib.Graph({ multigraph: true }).setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 84, marginx: 30, marginy: 30 }).setDefaultEdgeLabel(() => ({}));
  connectedComponents.forEach((component) => graph.setNode(component.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  wires.forEach((wire, index) => {
    const fromComponent = componentForEndpoint(wire.from);
    const toComponent = componentForEndpoint(wire.to);
    const connectsArduinoToComponent = (isArduinoPin(wire.from) && !!toComponent) || (isArduinoPin(wire.to) && !!fromComponent);
    const from = fromComponent || (isArduinoPin(wire.from) && connectsArduinoToComponent ? ARDUINO_ID : `pin:${wire.from}`);
    const to = toComponent || (isArduinoPin(wire.to) && connectsArduinoToComponent ? ARDUINO_ID : `pin:${wire.to}`);
    if (!graph.hasNode(from)) graph.setNode(from, { width: 92, height: 42 });
    if (!graph.hasNode(to)) graph.setNode(to, { width: 92, height: 42 });
    graph.setEdge(from, to, { wire }, `wire-${index}`);
  });
  dagre.layout(graph);

  const nodes = graph.nodes().map((id) => ({ id, ...graph.node(id) as { x: number; y: number; width: number; height: number } }));
  const graphWidth = Math.max(540, ...(nodes.map((node) => node.x + node.width / 2 + 30)));
  const graphHeight = Math.max(300, ...(nodes.map((node) => node.y + node.height / 2 + 30)));

  if (!circuit || wires.length === 0) return (
    <div className="overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-2">
      <svg className="min-w-full" viewBox="0 0 540 300" role="img" aria-label="Waiting for circuit data">
        <defs>
          <pattern id="ghost-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.8" fill="#cbd5e1" /></pattern>
        </defs>
        <rect width="540" height="300" fill="url(#ghost-dots)" rx="12" />
        {/* Ghost Arduino */}
        <g transform="translate(90 150)" opacity="0.35">
          <rect x={-NODE_WIDTH / 2} y={-NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 4" />
          {symbol('arduino', '#94a3b8')}
          <text y="27" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="700">Arduino</text>
        </g>
        {/* Ghost Resistor */}
        <g transform="translate(270 90)" opacity="0.25">
          <rect x={-NODE_WIDTH / 2} y={-NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 4" />
          {symbol('resistor', '#94a3b8')}
          <text y="27" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="700">resistor-1</text>
        </g>
        {/* Ghost LED */}
        <g transform="translate(450 90)" opacity="0.2">
          <rect x={-NODE_WIDTH / 2} y={-NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 4" />
          {symbol('led', '#94a3b8')}
          <text y="27" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="700">led-1</text>
        </g>
        {/* Ghost PIR */}
        <g transform="translate(270 210)" opacity="0.25">
          <rect x={-NODE_WIDTH / 2} y={-NODE_HEIGHT / 2} width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 4" />
          {symbol('pir', '#94a3b8')}
          <text y="27" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="700">pir-1</text>
        </g>
        {/* Ghost wires */}
        <line x1="156" y1="140" x2="204" y2="100" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.3" />
        <line x1="336" y1="90" x2="384" y2="90" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.25" />
        <line x1="156" y1="160" x2="204" y2="200" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.3" />
        {/* Centered label */}
        <text x="270" y="280" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight="500">Waiting for the first circuit:update from Quest…</text>
      </svg>
    </div>
  );

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
      <svg className="min-w-full" viewBox={`0 0 ${graphWidth} ${graphHeight}`} role="img" aria-label="Live circuit graph">
        <defs><marker id="graph-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#94a3b8" /></marker></defs>
        {graph.edges().map((edge) => {
          const data = graph.edge(edge) as unknown as { wire: CircuitWire; points: Array<{ x: number; y: number }> };
          const points = data.points;
          const wire = data.wire;
          const fromComponent = pinOwners.get(wire.from)?.id;
          const toComponent = pinOwners.get(wire.to)?.id;
          const faulty = (!!fromComponent && faultComponents.includes(fromComponent)) || (!!toComponent && faultComponents.includes(toComponent));
          const edgeColor = faulty ? (confidence === 'corrected' ? circuitStatusColors.corrected : confidence === 'uncertain' ? circuitStatusColors.uncertain : circuitStatusColors.fault) : circuitStatusColors.connected;
          const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
          const middle = points[Math.floor(points.length / 2)];
          const fromLabel = fromComponent ? terminalLabel(pinOwners.get(wire.from)!, wire.from) : wire.from;
          const toLabel = toComponent ? terminalLabel(pinOwners.get(wire.to)!, wire.to) : wire.to;
          return <g key={edge.name}>
            <path className="graph-edge" d={path} fill="none" stroke={edgeColor.stroke} strokeWidth="2.5" markerEnd="url(#graph-arrow)" />
            {middle && <text x={middle.x} y={middle.y - 7} textAnchor="middle" fill={edgeColor.text} fontSize="10" fontWeight="600">{fromLabel}→{toLabel}</text>}
          </g>;
        })}
        {nodes.map((node) => {
          const component = components.find((item) => item.id === node.id);
          const isArduino = node.id === ARDUINO_ID;
          const isLoosePin = node.id.startsWith('pin:');
          const faulty = !!component && faultComponents.includes(component.id);
          const color = faulty ? (confidence === 'corrected' ? circuitStatusColors.corrected : confidence === 'uncertain' ? circuitStatusColors.uncertain : circuitStatusColors.fault) : component && wires.some((wire) => pinOwners.get(wire.from)?.id === component.id || pinOwners.get(wire.to)?.id === component.id) ? circuitStatusColors.connected : circuitStatusColors.unconnected;
          const label = isArduino ? 'Arduino' : isLoosePin ? node.id.slice(4) : component?.id || node.id;
          const type = isArduino ? 'arduino' : component?.type || 'pin';
          return <g key={node.id} className="graph-node" transform={`translate(${node.x} ${node.y})`}>
            <rect x={-node.width / 2} y={-node.height / 2} width={node.width} height={node.height} rx="12" fill={color.fill} stroke={color.stroke} strokeWidth="2" />
            <g transform="translate(0 -8)">{symbol(type, color.text)}</g>
            <text y="27" textAnchor="middle" fill={color.text} fontSize="11" fontWeight="700">{label}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}
