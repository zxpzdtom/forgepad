export async function confirmNative(message: string, title = "ForgePad"): Promise<boolean> {
  if (window.forgepad.dialog?.confirm) {
    return window.forgepad.dialog.confirm({
      title,
      message,
      confirmLabel: "OK",
      cancelLabel: "Cancel",
    });
  }
  return window.confirm(message);
}
