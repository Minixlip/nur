export default function Downloads(): React.JSX.Element {
  return (
    <div className="p-8 text-white h-full overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Downloads</h1>
        <p className="text-zinc-400 mt-1">Manage generated audio and queued exports.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
        <div className="text-zinc-400">No downloads yet.</div>
      </div>
    </div>
  )
}
