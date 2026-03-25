export default function Header({ connected }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-indigo-950 tracking-tight">
          💊 PillPal
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Weekly medication dashboard</p>
      </div>

      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border
        ${connected
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-red-50 border-red-200 text-red-700"}`}>
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />
        {connected ? "ESP32 Online" : "ESP32 Offline"}
      </div>
    </div>
  );
}
