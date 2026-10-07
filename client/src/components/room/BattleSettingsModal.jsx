import { Modal } from '../ui.jsx';

export function BattleSettingsModal({
  open,
  onClose,
  settings,
  onSettingChange,
  onConfirm,
  confirmed,
  problemTitle,
}) {
  return (
    <Modal open={open} onClose={onClose} title="⚙️ BATTLE SETTINGS">
      <div className="space-y-5 text-sm py-1">
        <div className="p-3 bg-panel-2 rounded-xl border border-line space-y-1">
          <p className="text-xs text-muted uppercase font-semibold">Problem</p>
          <p className="font-bold text-ink">{problemTitle || 'Largest Element in an Array'}</p>
        </div>

        {/* Battle Duration Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted uppercase">Battle Duration</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: '5 Mins', value: 300 },
              { label: '10 Mins', value: 600 },
              { label: '15 Mins', value: 900 },
              { label: 'Unlimited', value: 0 },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onSettingChange('duration', item.value)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border text-center transition ${
                  settings.duration === item.value
                    ? 'border-amber-500 bg-amber-500/15 text-amber-400'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="space-y-2.5">
          {[
            { key: 'voiceChat', label: '🎙️ Voice Chat', desc: 'Enable peer-to-peer audio communication' },
            { key: 'roomChat', label: '💬 Chat During Battle', desc: 'Keep collapsible chat available while coding' },
            { key: 'showOpponentCode', label: '👀 Show Opponent Code', desc: 'Live read-only stream of opponent editor' },
            { key: 'antiCopy', label: '📋 Anti-Copy Protection', desc: 'Prevent copy and paste (DevTools & Inspect always enabled)' },
            { key: 'soundEffects', label: '🔔 Sound Effects', desc: 'Audio cues for countdown, submit, victory & alerts' },
            { key: 'fullscreen', label: '⛶ Fullscreen Battle Mode', desc: 'Automatically request fullscreen on start' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-2.5 rounded-xl border border-line bg-panel-2/40">
              <div>
                <p className="font-semibold text-xs text-ink">{item.label}</p>
                <p className="text-[11px] text-muted">{item.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => onSettingChange(item.key, !settings[item.key])}
                className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                  settings[item.key]
                    ? 'bg-solved text-abyss'
                    : 'bg-panel border border-line text-muted'
                }`}
              >
                {settings[item.key] ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>

        {/* Confirmation Section */}
        <div className="pt-2 border-t border-line flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={`btn-primary w-full py-2.5 text-xs font-bold ${
              confirmed
                ? 'bg-solved text-abyss'
                : 'bg-gradient-to-r from-red-600 via-amber-600 to-violet-600'
            }`}
          >
            {confirmed ? 'Settings Confirmed ✓' : 'Confirm Battle Settings'}
          </button>
          <p className="text-[11px] text-muted text-center">
            The countdown starts once both players are ready. Changing a setting un-readies you both.
          </p>
        </div>
      </div>
    </Modal>
  );
}
