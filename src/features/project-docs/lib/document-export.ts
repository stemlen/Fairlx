import { HeadingLevel, Packer, Paragraph, TextRun, type IRunOptions } from "docx";
import { Document } from "docx";
import { jsPDF } from "jspdf";

import { normalizeMarkdownSpacing, stripInlineMarkdown } from "./format-markdown";
import type { DownloadDocumentFormat } from "./document-file";

function headingLevel(level: number) {
  if (level <= 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  if (level === 3) return HeadingLevel.HEADING_3;
  return HeadingLevel.HEADING_4;
}

function inlineRuns(text: string): TextRun[] {
  const source = text.replace(/^>\s*/, "");
  const chunks = source.split(/(\*\*[^*]+\*\*|==[^=]+==|`[^`]+`|\*[^*]+\*)/g).filter((chunk) => chunk.length);
  if (!chunks.length) return [new TextRun("")];
  return chunks.map((chunk) => {
    const options: IRunOptions = { font: "Calibri" };
    if (/^\*\*[^*]+\*\*$/.test(chunk)) {
      return new TextRun({ ...options, text: chunk.slice(2, -2), bold: true });
    }
    if (/^==[^=]+==$/.test(chunk)) {
      return new TextRun({ ...options, text: chunk.slice(2, -2), highlight: "yellow" });
    }
    if (/^`[^`]+`$/.test(chunk)) {
      return new TextRun({ ...options, text: chunk.slice(1, -1), font: "Courier New" });
    }
    if (/^\*[^*]+\*$/.test(chunk)) {
      return new TextRun({ ...options, text: chunk.slice(1, -1), italics: true });
    }
    return new TextRun({ ...options, text: stripInlineMarkdown(chunk) });
  });
}

export function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const lines = normalizeMarkdownSpacing(markdown).split("\n");
  const paragraphs: Paragraph[] = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: line || " ", font: "Courier New", size: 20 })],
        }),
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      paragraphs.push(
        new Paragraph({
          heading: headingLevel(heading[1]!.length),
          spacing: { before: heading[1]!.length === 1 ? 80 : 280, after: 120 },
          children: inlineRuns(heading[2]!.trim()),
        }),
      );
      continue;
    }
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun("")] }));
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      paragraphs.push(new Paragraph({ spacing: { before: 160, after: 160 }, border: { bottom: { color: "CCCCCC", space: 1, size: 6, style: "single" } }, children: [new TextRun("")] }));
      continue;
    }
    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/i.exec(line.trim());
    if (callout) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 120, after: 80 },
          children: [
            new TextRun({ text: `${callout[1]!.toUpperCase()}: `, bold: true }),
            ...inlineRuns(callout[2] || ""),
          ],
        }),
      );
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 80 },
          indent: { left: 360 },
          children: inlineRuns(quote[1] || ""),
        }),
      );
      continue;
    }
    const numbered = /^(\d+)\.\s+(.+)$/.exec(line.trim());
    if (numbered) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 80 },
          indent: { left: 360 },
          children: [new TextRun({ text: `${numbered[1]}. `, bold: true }), ...inlineRuns(numbered[2] || "")],
        }),
      );
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line.trim());
    if (bullet) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 80 },
          indent: { left: 360 },
          children: [new TextRun({ text: "• " }), ...inlineRuns(bullet[1] || "")],
        }),
      );
      continue;
    }
    paragraphs.push(
      new Paragraph({
        spacing: { after: 140 },
        children: inlineRuns(line),
      }),
    );
  }
  return paragraphs.length ? paragraphs : [new Paragraph({ children: [new TextRun("")] })];
}

export async function markdownToDocxBuffer(title: string, markdown: string): Promise<Buffer> {
  const doc = new Document({
    title,
    sections: [
      {
        properties: {
          page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
        },
        children: markdownToDocxParagraphs(markdown),
      },
    ],
  });
  const packed = await Packer.toBuffer(doc);
  return Buffer.from(packed);
}

export function markdownToPdfBuffer(title: string, markdown: string): Uint8Array {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 16;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  const titleLines = pdf.splitTextToSize(title, maxWidth);
  titleLines.forEach((line: string) => {
    ensureSpace(8);
    pdf.text(line, margin, y);
    y += 8;
  });
  y += 4;

  const lines = normalizeMarkdownSpacing(markdown).split("\n");
  let inFence = false;
  let skippedMatchingTitle = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      y += 2;
      continue;
    }
    if (inFence) {
      pdf.setFont("courier", "normal");
      pdf.setFontSize(9.5);
      ensureSpace(5.5);
      pdf.text(line || " ", margin, y);
      y += 5.5;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const headingText = stripInlineMarkdown(heading[2]!.trim());
      if (!skippedMatchingTitle && heading[1]!.length === 1 && headingText.toLowerCase() === title.trim().toLowerCase()) {
        skippedMatchingTitle = true;
        continue;
      }
      const size = Math.max(12, 20 - heading[1]!.length * 1.6);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(size);
      y += heading[1]!.length <= 2 ? 6 : 4;
      const wrapped = pdf.splitTextToSize(headingText, maxWidth);
      wrapped.forEach((text: string) => {
        ensureSpace(8);
        pdf.text(text, margin, y);
        y += 8;
      });
      y += 2;
      continue;
    }
    if (!line.trim()) {
      y += 4;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      y += 3;
      pdf.setDrawColor(200);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 5;
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line.trim());
    const numbered = /^(\d+)\.\s+(.+)$/.exec(line.trim());
    const quote = /^>\s?(?:\[!\w+\]\s*)?(.*)$/i.exec(line);
    pdf.setFont("helvetica", quote ? "italic" : "normal");
    pdf.setFontSize(11);
    const body = bullet
      ? `•  ${stripInlineMarkdown(bullet[1] || "")}`
      : numbered
        ? `${numbered[1]}.  ${stripInlineMarkdown(numbered[2] || "")}`
        : stripInlineMarkdown(quote ? quote[1] || "" : line);
    const indent = bullet || numbered || quote ? 6 : 0;
    const wrapped = pdf.splitTextToSize(body, maxWidth - indent);
    wrapped.forEach((text: string) => {
      ensureSpace(6.5);
      pdf.text(text, margin + indent, y);
      y += 6.5;
    });
    y += 1.5;
  }

  return new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer);
}

export function mimeForDownloadFormat(format: DownloadDocumentFormat): string {
  switch (format) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "text/markdown; charset=utf-8";
  }
}
