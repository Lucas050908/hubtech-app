/** Save a file the user asked for. In the Android app the WebView can't download blobs, so the app's bridge saves it to Downloads/HUBTECH. */
export async function saveBlob(name, blob) {
  if (window.HubtechAndroid?.saveFile) {
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); });
    return window.HubtechAndroid.saveFile(name, blob.type || 'application/octet-stream', b64);
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}
