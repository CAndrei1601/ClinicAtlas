export default function Instructions() {
  const steps = [
    {
      num: "1",
      title: "Open Google My Maps",
      body: 'Go to <a href="https://www.google.com/maps/d/" target="_blank" rel="noopener" class="text-blue-600 underline">maps.google.com/maps/d</a> and sign in with your Google account.',
    },
    {
      num: "2",
      title: "Create a new map",
      body: 'Click the red <strong>"+ Create a new map"</strong> button in the top-left corner.',
    },
    {
      num: "3",
      title: "Import the CSV file",
      body: 'In the left panel, click <strong>"Import"</strong> under the first untitled layer. Upload the <code class="bg-slate-100 px-1 rounded">cleaned_doctors.csv</code> file you downloaded.',
    },
    {
      num: "4",
      title: "Choose the location column",
      body: 'Google My Maps will ask which column to use for location. Select <strong><code class="bg-slate-100 px-1 rounded">full_address</code></strong> or, for more precise placement, select <strong><code class="bg-slate-100 px-1 rounded">latitude</code></strong> and <strong><code class="bg-slate-100 px-1 rounded">longitude</code></strong> if that option is available.',
    },
    {
      num: "5",
      title: "Choose the marker title",
      body: 'Choose <strong><code class="bg-slate-100 px-1 rounded">doctor_name</code></strong> as the column for the marker title so each pin is labeled with the doctor\'s name.',
    },
    {
      num: "6",
      title: "Click Finish",
      body: "Google My Maps will geocode addresses and place your markers on the map. This may take a few seconds depending on how many records are in the file.",
    },
    {
      num: "7",
      title: "Customize your map",
      body: "You can group doctors by specialty using separate layers, customize marker colors and icons, and add a legend. Click a marker to see all doctor details from your CSV.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">How to Import into Google My Maps</h2>
        <p className="text-slate-500 text-sm">
          Follow these steps to create a shareable map with all your doctors pinned.
        </p>
      </div>

      <ol className="space-y-4">
        {steps.map((s) => (
          <li key={s.num} className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
              {s.num}
            </div>
            <div className="flex-1 pt-1">
              <div className="font-semibold text-slate-800 mb-0.5">{s.title}</div>
              <div
                className="text-sm text-slate-600 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: s.body }}
              />
            </div>
          </li>
        ))}
      </ol>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h4 className="font-semibold text-amber-800 mb-2">Tips for best results</h4>
        <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
          <li>Use the <strong>Geocoded doctors</strong> CSV for the most accurate pin placement.</li>
          <li>If some pins are in the wrong location, open the unresolved CSV and manually correct the addresses before re-importing.</li>
          <li>You can create multiple layers &mdash; one per specialty or per city &mdash; by importing multiple filtered CSVs.</li>
          <li>Google My Maps supports up to 2,000 rows per layer. For larger datasets, split your CSV into multiple files.</li>
          <li>To share the map: click <strong>Share</strong> and set visibility to &ldquo;Anyone with the link can view&rdquo;.</li>
        </ul>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h4 className="font-semibold text-slate-700 mb-2">CSV columns explained</h4>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          {[
            ["doctor_name", "Full name of the doctor"],
            ["full_address", "Complete formatted address"],
            ["clinic", "Name of the clinic or medical unit"],
            ["specialty", "Medical specialty"],
            ["schedule", "Working hours / schedule"],
            ["phone", "Contact phone number"],
            ["city", "City or locality"],
            ["county", "County or region"],
            ["latitude", "GPS latitude (for precise placement)"],
            ["longitude", "GPS longitude (for precise placement)"],
          ].map(([col, desc]) => (
            <div key={col} className="flex gap-2">
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-blue-700 whitespace-nowrap">{col}</code>
              <span className="text-slate-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
