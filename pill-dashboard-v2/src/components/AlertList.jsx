export default function AlertList({ alerts, onDismiss }) {
  if (!alerts.length) return null;

  return (
    <div className="mb-4 space-y-2">
      {alerts.map(alert => {
        const ok = alert.kind === "success";
        return (
          <div key={alert.id}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm border
              animate-[slideIn_0.3s_ease]
              ${ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-amber-50 border-amber-200 text-amber-800"}`}>
            <span>{alert.text}</span>
            <button
              onClick={() => onDismiss(alert.id)}
              className="ml-3 text-lg opacity-50 hover:opacity-100 transition-opacity leading-none"
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
