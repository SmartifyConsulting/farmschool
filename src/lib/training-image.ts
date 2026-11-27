/** Normalize uploads and generated images identically before embedding in portable HTML. */
export async function trainingImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8000000)
    throw new Error("Choose a PNG, JPEG or WebP smaller than 8 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the illustration.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.5);
    if (image.length > 120000) throw new Error("Choose a smaller illustration.");
    return image;
  } finally {
    bitmap.close();
  }
}
