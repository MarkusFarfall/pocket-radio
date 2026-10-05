import { Modal } from "./ui";

const KEYS: [string[], string][] = [
  [["Пробел"], "Играть / пауза"],
  [["←", "→"], "Предыдущая / следующая станция (в подкасте — перемотка)"],
  [["↑", "↓"], "Громкость"],
  [["M"], "Выключить звук"],
  [["P"], "Показать / скрыть правую панель «Сейчас играет»"],
  [["Alt", "←"], "Назад по разделам (Alt + → — вперёд)"],
  [["F"], "Добавить в избранное / убрать"],
  [["A"], "Добавить станцию"],
  [["1", "…", "6"], "Переключить раздел"],
  [["?"], "Эта справка"],
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Горячие клавиши" size="sm">
      <ul className="divide-y divide-line px-5 py-2">
        {KEYS.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between gap-4 py-3 text-sm">
            <span>{label}</span>
            <span className="flex shrink-0 gap-1">
              {keys.map((k, i) =>
                k === "…" ? (
                  <span key={i} className="text-muted">
                    …
                  </span>
                ) : (
                  <kbd key={i} className="min-w-7 rounded-lg border border-line bg-surface-2 px-2 py-1 text-center font-mono text-xs font-semibold shadow-[0_1px_0_var(--line)]">
                    {k}
                  </kbd>
                )
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-5 text-xs leading-relaxed text-muted">
        С экрана блокировки и из шторки уведомлений работают кнопки play/pause и переключение станций. На телефоне мини-плеер можно смахнуть в сторону — он закроется (кнопка «Вернуть» отменит). Файлы плейлистов (.m3u, .json) можно перетащить прямо в окно приложения.
      </p>
    </Modal>
  );
}
