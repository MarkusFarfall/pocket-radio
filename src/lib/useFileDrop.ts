import { useEffect, useState } from "react";
import { importFile } from "./importer";

/** Перетаскивание файлов плейлиста (M3U, PLS, JSON) в окно. Возвращает true, пока файл над окном. */
export function useFileDrop(): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const has = (e: DragEvent) => !!e.dataTransfer?.types?.includes("Files");
    const enter = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => has(e) && e.preventDefault();
    const leave = (e: DragEvent) => {
      if (!has(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = async (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      for (const f of Array.from(e.dataTransfer?.files ?? [])) await importFile(f);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return dragging;
}
