import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import medsRaw from "../data/medications-tn.json";

const DEFAULTS = {
  name:        "",
  age:         "",
  condition:   "",
  doctor:      "",
  notes:       "",
  medications: [{ name: "", dose: "", form: "", session: "Morning" }],
};

const SESSIONS = ["Morning", "Midday", "Night"];

// ── Local Tunisian med search (instant, no API) ───────────
function useTNSearch(query) {
  return useMemo(() => {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim().toUpperCase();

    const scored = medsRaw
      .map(med => {
        const brandMatch = med.brand.toUpperCase().includes(q);
        const dciMatch   = med.dci.toUpperCase().includes(q);
        if (!brandMatch && !dciMatch) return null;
        return {
          ...med,
          score: (med.brand.toUpperCase().startsWith(q) ? 3 : 0)
               + (brandMatch ? 2 : 0)
               + (dciMatch   ? 1 : 0),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    // Deduplicate by label, keep top 8
    const seen = new Set();
    const results = [];
    for (const med of scored) {
      if (!seen.has(med.label)) {
        seen.add(med.label);
        results.push(med);
      }
      if (results.length >= 8) break;
    }
    return results;
  }, [query]);
}

// ── Medication autocomplete input ─────────────────────────
function MedInput({ med, index, onChange, onRemove, showRemove }) {
  const [query, setQuery] = useState(med.name);
  const [open,  setOpen]  = useState(false);
  const wrapRef           = useRef(null);

  const results = useTNSearch(query);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleQueryChange = (val) => {
    setQuery(val);
    onChange(index, "name", val);
    onChange(index, "dose", "");
    onChange(index, "form", "");
    setOpen(true);
  };

  const handleSelect = (item) => {
    setQuery(item.brand);
    onChange(index, "name", item.brand);
    onChange(index, "dose", item.dose);
    onChange(index, "form", item.form);
    setOpen(false);
  };

  const handleClear = () => {
    setQuery("");
    onChange(index, "name", "");
    onChange(index, "dose", "");
    onChange(index, "form", "");
  };

  // Group by DCI for display
  const grouped = useMemo(() => {
    const map = {};
    for (const r of results) {
      if (!map[r.dci]) map[r.dci] = [];
      map[r.dci].push(r);
    }
    return map;
  }, [results]);

  return (
    <div className="flex gap-2 items-start">

      {/* Name autocomplete */}
      <div className="flex-1 relative" ref={wrapRef}>
        <div className="relative">
          <input
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onFocus={() => query.length >= 2 && setOpen(true)}
            placeholder="Nom du médicament…"
            autoComplete="off"
            className="w-full px-3 py-2 pr-7 rounded-xl border border-gray-200 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
              transition-colors"
          />
          {query && (
            <button
              onMouseDown={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300
                hover:text-gray-500 text-base leading-none">
              ×
            </button>
          )}
        </div>

        {/* Dropdown */}
        {open && results.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200
            rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {Object.entries(grouped).map(([dci, items]) => (
              <li key={dci}>
                <div className="px-3 py-1 bg-indigo-50 border-b border-indigo-100">
                  <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide">
                    {dci}
                  </span>
                </div>
                {items.map((item, i) => (
                  <button
                    key={i}
                    onMouseDown={() => handleSelect(item)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50
                      transition-colors border-b border-gray-50 last:border-0
                      flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-gray-800">{item.brand}</span>
                      <span className="ml-2 text-xs text-indigo-500">{item.dose}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{item.form}</span>
                  </button>
                ))}
              </li>
            ))}
          </ul>
        )}

        {/* No results */}
        {open && query.length >= 2 && results.length === 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200
            rounded-xl shadow-lg px-3 py-3">
            <p className="text-xs text-gray-400 italic">
              Aucun médicament trouvé pour "{query}"
            </p>
            <p className="text-[10px] text-gray-300 mt-1">
              Vous pouvez continuer à taper le nom manuellement.
            </p>
          </div>
        )}
      </div>

      {/* Dose (auto-filled on select, editable) */}
      <input
        value={med.dose}
        onChange={e => onChange(index, "dose", e.target.value)}
        placeholder="Dose"
        className="w-24 px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-600
          focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors"
      />

      {/* Session */}
      <select
        value={med.session}
        onChange={e => onChange(index, "session", e.target.value)}
        className="px-2 py-2 rounded-xl border border-gray-200 text-sm
          focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
        {SESSIONS.map(s => <option key={s}>{s}</option>)}
      </select>

      {/* Remove */}
      {showRemove && (
        <button
          onClick={() => onRemove(index)}
          className="text-red-300 hover:text-red-500 text-xl leading-none mt-1.5 transition-colors">
          ×
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────
export default function PatientProfile() {
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pillpal_profile")) || DEFAULTS; }
    catch { return DEFAULTS; }
  });
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(profile);

  const save = () => {
    setProfile(draft);
    localStorage.setItem("pillpal_profile", JSON.stringify(draft));
    setEditing(false);
  };

  const cancel = () => { setDraft(profile); setEditing(false); };

  const updateMed = useCallback((i, field, val) => {
    setDraft(d => {
      const meds = [...d.medications];
      meds[i] = { ...meds[i], [field]: val };
      return { ...d, medications: meds };
    });
  }, []);

  const addMed    = () => setDraft(d => ({
    ...d, medications: [...d.medications, { name: "", dose: "", form: "", session: "Morning" }]
  }));
  const removeMed = (i) => setDraft(d => ({
    ...d, medications: d.medications.filter((_, idx) => idx !== i)
  }));

  const isEmpty = !profile.name;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-sm">

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-indigo-950">👤 Patient Profile</h2>
        {!editing && (
          <button
            onClick={() => { setDraft(profile); setEditing(true); }}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500
              hover:bg-gray-50 transition-colors">
            {isEmpty ? "+ Add Profile" : "Edit"}
          </button>
        )}
      </div>

      {/* ── Read view ── */}
      {!editing ? (
        isEmpty ? (
          <p className="text-sm text-gray-400 italic">
            No patient profile yet. Click "+ Add Profile" to get started.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Patient",   profile.name],
                ["Âge",       profile.age ? `${profile.age} ans` : "—"],
                ["Condition", profile.condition || "—"],
                ["Médecin",   profile.doctor    || "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 font-medium">{label}</p>
                  <p className="text-sm text-gray-700 font-semibold">{val}</p>
                </div>
              ))}
            </div>

            {profile.medications?.filter(m => m.name).length > 0 && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2">Médicaments</p>
                <div className="space-y-1.5">
                  {profile.medications.filter(m => m.name).map((med, i) => (
                    <div key={i} className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2.5">
                      <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                      <span className="text-sm font-semibold text-indigo-700">{med.name}</span>
                      {med.dose && (
                        <span className="text-xs text-indigo-400 bg-indigo-100 rounded-full px-2 py-0.5">
                          {med.dose}
                        </span>
                      )}
                      {med.form && (
                        <span className="text-xs text-gray-400">{med.form}</span>
                      )}
                      <span className="ml-auto text-xs bg-white border border-indigo-100
                        text-indigo-500 rounded-full px-2 py-0.5">
                        {med.session}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.notes && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1">Notes</p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2">{profile.notes}</p>
              </div>
            )}
          </div>
        )
      ) : (
        /* ── Edit view ── */
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["name",      "Nom du patient", "text"],
              ["age",       "Âge",            "number"],
              ["condition", "Condition",      "text"],
              ["doctor",    "Médecin",        "text"],
            ].map(([field, label, type]) => (
              <div key={field}>
                <label className="block text-xs text-gray-500 font-medium mb-1">{label}</label>
                <input
                  type={type}
                  value={draft[field]}
                  onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                  placeholder={label}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                    transition-colors"
                />
              </div>
            ))}
          </div>

          {/* Medications */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500 font-medium">Médicaments</label>
              <button onClick={addMed}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold transition-colors">
                + Ajouter
              </button>
            </div>

            <div className="flex gap-2 mb-1 px-0.5">
              <p className="w-10 text-[10px] "></p>
              
              <p className="w-5" />
            </div>

            <div className="space-y-2">
              {draft.medications.map((med, i) => (
                <MedInput
                  key={i}
                  med={med}
                  index={i}
                  onChange={updateMed}
                  onRemove={removeMed}
                  showRemove={draft.medications.length > 1}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 font-medium mb-1">Notes</label>
            <textarea
              value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              placeholder="Allergies, instructions particulières…"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none
                focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                transition-colors"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={save}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm
                font-semibold rounded-xl transition-colors">
              Enregistrer
            </button>
            <button onClick={cancel}
              className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm
                rounded-xl transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
