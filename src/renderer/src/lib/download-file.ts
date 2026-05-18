export type DownloadFileOptions = {
  blob: Blob;
  suggestedName: string;
};

const BASE64_CHUNK_SIZE = 0x8000;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function downloadBlobInBrowser(blob: Blob, suggestedName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadFile({ blob, suggestedName }: DownloadFileOptions): Promise<void> {
  if (window.forgepad.shell.saveFile) {
    const contentBase64 = arrayBufferToBase64(await blob.arrayBuffer());
    await window.forgepad.shell.saveFile({
      suggestedName,
      contentBase64,
      mimeType: blob.type || undefined,
    });
    return;
  }

  downloadBlobInBrowser(blob, suggestedName);
}
