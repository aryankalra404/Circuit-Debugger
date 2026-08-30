import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { CircuitComponent, CircuitSnapshot } from '../components/CircuitGraph';
import type { Confidence } from './circuitStatusColors';

export type FaultHistory = Record<string, { verdict: Confidence; message: string }>;

function pinOwner(components: CircuitComponent[], pinId: string) {
  const component = components.find((candidate) => Object.entries(candidate).some(([key, value]) => !['id', 'type', 'value'].includes(key) && value === pinId));
  if (!component) return { component: 'Arduino', pin: pinId };
  const pin = Object.entries(component).find(([key, value]) => !['id', 'type', 'value'].includes(key) && value === pinId)?.[0] || pinId;
  return { component: component.id, pin };
}

function addWrappedText(pdf: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 5) {
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function addConnectionRow(pdf: jsPDF, from: string, to: string, x: number, y: number, width: number) {
  const arrowWidth = 12;
  const columnWidth = (width - arrowWidth - 10) / 2;
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(8.5);
  const fromLines = pdf.splitTextToSize(from, columnWidth) as string[];
  const toLines = pdf.splitTextToSize(to, columnWidth) as string[];
  const lineCount = Math.max(fromLines.length, toLines.length);
  const rowHeight = Math.max(8, lineCount * 4 + 4);
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(x, y - 4, width, rowHeight, 1.5, 1.5, 'FD');
  pdf.setTextColor(23, 32, 51);
  pdf.text(fromLines, x + 3, y);
  pdf.setFont('helvetica', 'bold');
  pdf.text('->', x + columnWidth + 5, y);
  pdf.setFont('courier', 'normal');
  pdf.text(toLines, x + columnWidth + arrowWidth + 4, y);
  return y + rowHeight + 2;
}

export async function downloadCircuitReport({ sessionId, intent, circuit, graphElement, faultHistory }: {
  sessionId: string;
  intent: string;
  circuit: CircuitSnapshot;
  graphElement: HTMLElement;
  faultHistory: FaultHistory;
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const generatedAt = new Date();
  const timestamp = generatedAt.toISOString();
  const margin = 14;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  pdf.setFontSize(18);
  pdf.text('CircuitDoctor — Circuit Report', margin, y);
  y += 8;
  pdf.setFontSize(9);
  pdf.setTextColor(80, 95, 115);
  pdf.text(`Session: ${sessionId}`, margin, y);
  y += 5;
  pdf.text(`Generated: ${generatedAt.toLocaleString()}`, margin, y);
  y += 8;
  pdf.setTextColor(23, 32, 51);

  if (intent.trim()) {
    pdf.setFontSize(11);
    pdf.text('Stated goal', margin, y);
    y += 5;
    pdf.setFontSize(9);
    y = addWrappedText(pdf, intent.trim(), margin, y, contentWidth) + 5;
  }

  const graphCanvas = await html2canvas(graphElement, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
  const graphImage = graphCanvas.toDataURL('image/png');
  const graphHeight = Math.min(105, (graphCanvas.height / graphCanvas.width) * contentWidth);
  if (y + graphHeight > 280) { pdf.addPage(); y = 18; }
  pdf.setFontSize(11);
  pdf.text('Circuit graph snapshot', margin, y);
  y += 4;
  pdf.addImage(graphImage, 'PNG', margin, y, contentWidth, graphHeight);
  y += graphHeight + 9;

  const components = circuit.components || [];
  const wires = circuit.wires || [];
  if (y > 245) { pdf.addPage(); y = 18; }
  pdf.setFontSize(11);
  pdf.text('Connections', margin, y);
  y += 5;
  if (wires.length === 0) {
    pdf.setFontSize(9);
    pdf.text('No wires connected.', margin, y);
    y += 6;
  } else {
    for (const wire of wires) {
      const from = pinOwner(components, wire.from);
      const to = pinOwner(components, wire.to);
      const fromLabel = `${from.component}.${from.pin}`;
      const toLabel = `${to.component}.${to.pin}`;
      const estimatedRowHeight = Math.max(8, Math.max(pdf.splitTextToSize(fromLabel, (contentWidth - 22) / 2).length, pdf.splitTextToSize(toLabel, (contentWidth - 22) / 2).length) * 4 + 4) + 2;
      if (y + estimatedRowHeight > 280) { pdf.addPage(); y = 18; }
      y = addConnectionRow(pdf, fromLabel, toLabel, margin, y, contentWidth);
    }
  }

  if (y > 270) { pdf.addPage(); y = 18; } else {
    y += 3;
    pdf.setDrawColor(203, 213, 225);
    pdf.line(margin, y, margin + contentWidth, y);
    y += 7;
  }
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text('Components', margin, y);
  y += 5;
  pdf.setFontSize(9);
  for (const component of components) {
    if (y > 280) { pdf.addPage(); y = 18; }
    const history = faultHistory[component.id];
    const status = history ? `FAULT — ${history.verdict || 'reported'}: ${history.message}` : 'OK';
    y = addWrappedText(pdf, `${component.id} (${component.type}): ${status}`, margin, y, contentWidth) + 1;
  }

  const fileTimestamp = timestamp.replace(/[:.]/g, '-');
  pdf.save(`circuitdoctor-report-${sessionId}-${fileTimestamp}.pdf`);
}
