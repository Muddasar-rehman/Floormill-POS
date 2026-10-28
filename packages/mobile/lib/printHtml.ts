import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/**
 * Shared letterhead wrapper so every printed document looks like the same
 * company document, regardless of which screen generated it.
 */
export function letterheadHtml(title: string, subtitle: string, bodyHtml: string): string {
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { font-size: 20px; margin: 0; }
          .muted { color: #64748b; font-size: 13px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
          th { color: #64748b; font-weight: 600; }
          td.right, th.right { text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>The Awan Flour Mill</h1>
            <div class="muted">Grain Trading &amp; Warehouse Management</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 600;">${title}</div>
            <div class="muted">${subtitle}</div>
          </div>
        </div>
        ${bodyHtml}
      </body>
    </html>
  `;
}

/**
 * Generates a PDF from HTML and opens the native share sheet (Save to
 * Files, AirDrop, WhatsApp, or an actual AirPrint/print-service printer).
 * This is the mobile equivalent of the desktop app's "Print / Save as PDF"
 * button — there's no in-browser print dialog on a phone, so a real PDF
 * file plus the OS share sheet is the closest match.
 */
export async function shareAsPdf(html: string, filename: string): Promise<void> {
  const { base64 } = await Print.printToFileAsync({ html, base64: true });

  // printToFileAsync's `uri` points at a scratch file created outside the
  // File API's own bookkeeping, which the new expo-file-system permission
  // model won't grant read access to (and which the OS share sheet can't
  // always read either, under Expo Go). Writing the base64 output directly
  // into a file we create ourselves in the app's cache directory sidesteps
  // both problems, and gives the shared file a clean, predictable name.
  const safeName = filename.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "Document";
  const destination = new File(Paths.cache, `${safeName}.pdf`);
  if (destination.exists) destination.delete();
  destination.create();
  destination.write(base64!, { encoding: "base64" });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(destination.uri, { mimeType: "application/pdf", dialogTitle: filename, UTI: "com.adobe.pdf" });
  } else {
    // No share sheet available (rare) — fall back to the OS print dialog directly.
    await Print.printAsync({ uri: destination.uri });
  }
}
