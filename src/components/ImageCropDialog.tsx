import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PREVIEW_W = 480;
const PREVIEW_H = 270; // 16:9
const OUTPUT_W = 1600;
const OUTPUT_H = 900;
const RATIO = OUTPUT_W / PREVIEW_W;

/** Crop and resize a picked image to a fixed 16:9 frame before upload: drag to pan, slider to zoom. */
export function ImageCropDialog({
  file,
  onCancel,
  onCropped,
}: {
  file: File | null;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [baseScale, setBaseScale] = useState(1);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.max(PREVIEW_W / image.naturalWidth, PREVIEW_H / image.naturalHeight);
      setBaseScale(scale);
      setZoom(1);
      const w = image.naturalWidth * scale;
      const h = image.naturalHeight * scale;
      setOffset({ x: (PREVIEW_W - w) / 2, y: (PREVIEW_H - h) / 2 });
      setImg(image);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file || !img) return null;

  const effectiveScale = baseScale * zoom;
  const dispW = img.naturalWidth * effectiveScale;
  const dispH = img.naturalHeight * effectiveScale;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const clampOffset = (o: { x: number; y: number }) => ({
    x: clamp(o.x, PREVIEW_W - dispW, 0),
    y: clamp(o.y, PREVIEW_H - dispH, 0),
  });

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = { startX: clientX, startY: clientY, originX: offset.x, originY: offset.y };
  };
  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    setOffset(clampOffset({ x: dragRef.current.originX + dx, y: dragRef.current.originY + dy }));
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const apply = () => {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      img,
      0, 0, img.naturalWidth, img.naturalHeight,
      offset.x * RATIO, offset.y * RATIO, dispW * RATIO, dispH * RATIO,
    );
    canvas.toBlob((blob) => { if (blob) onCropped(blob); }, "image/jpeg", 0.9);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop cover image</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div
            className="relative mx-auto cursor-move overflow-hidden rounded-md border border-border bg-muted select-none"
            style={{ width: PREVIEW_W, height: PREVIEW_H }}
            onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
            onMouseMove={(e) => { if (dragRef.current) moveDrag(e.clientX, e.clientY); }}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(e) => { const t = e.touches[0]; if (t) startDrag(t.clientX, t.clientY); }}
            onTouchMove={(e) => { const t = e.touches[0]; if (t) moveDrag(t.clientX, t.clientY); }}
            onTouchEnd={endDrag}
          >
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-0 top-0"
              style={{ width: dispW, height: dispH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => {
                const nextZoom = Number(e.target.value);
                setZoom(nextZoom);
                const nextScale = baseScale * nextZoom;
                const w = img.naturalWidth * nextScale;
                const h = img.naturalHeight * nextScale;
                setOffset((prev) => ({
                  x: clamp(prev.x, PREVIEW_W - w, 0),
                  y: clamp(prev.y, PREVIEW_H - h, 0),
                }));
              }}
              className="flex-1"
            />
          </label>
          <p className="text-xs text-muted-foreground">Drag the image to reposition it within the frame.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={apply}>Use this crop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
