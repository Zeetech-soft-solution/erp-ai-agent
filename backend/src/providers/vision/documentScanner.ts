export async function scanDocumentImage(_buffer: Buffer, _mimeType: string): Promise<string> {
  throw new Error("Document scanning is not available in this tier");
}
