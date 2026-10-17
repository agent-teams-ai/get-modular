# Derives a-keys/README.md from b-snapshot/README.md, so the control variant documents the same rules.
# Every replacement must match exactly once; a miss means the B README changed and this script needs the same change.
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
s = (root / "b-snapshot" / "README.md").read_text()
pairs = [
  ('# @get-modular/observation (variant B: watch what you read)', '# @get-modular/observation (variant A: keys and changesAfter)'),
  ('''  const theme = deps.theme.read(["theme"]);                  // frozen snapshot { revision, values }
  const picker = createThemePicker(theme.values.theme);
  deps.theme.watch(theme, {                                  // follows every key of `theme`, from its revision
    resources, name: "theme-picker/theme",
    onChange: ({ values }) => { picker.show(values.theme); },
  });''', '''  const first = deps.theme.read(["theme"]);                  // frozen snapshot { revision, values }
  const picker = createThemePicker(first.values.theme);
  deps.theme.watch(resources, {
    name: "theme-picker/theme", keys: ["theme"], changesAfter: first,  // changesAfter: the snapshot you already read
    onChange: ({ values }) => { picker.show(values.theme); },
  });'''),
  ('''- `watch(snapshot, { resources, name, onChange })` follows every key of the snapshot, starting at its revision: a
  commit after your `read`, even one made while your factory awaited, is delivered. Read exactly the keys you want
  to follow. Pass only snapshots this store gave you. One snapshot may be passed to both `watch` and `load`, with
  different names.''', '''- `watch(resources, { name, keys, changesAfter, onChange })`. `changesAfter` is the snapshot you already read: every
  commit to `keys` after it is delivered, even one made while your factory awaited. It must cover `keys`; pass only
  snapshots this store gave you. `watch` and `load` may follow the same keys, with different names.'''),
  ('''    rates.watch(rate, { resources: work.resources, name: "quotes/ticker", onChange: ({ values }) => { screen.show(values.eurUsd); } });''',
   '''    rates.watch(work.resources, { name: "quotes/ticker", keys: ["eurUsd"], changesAfter: rate, onChange: ({ values }) => { screen.show(values.eurUsd); } });'''),
  ('''deps.settings.load(deps.settings.read(["region"]), {        // this snapshot only says which keys to follow
  resources, name: "catalog/models",''', '''deps.settings.load(resources, {
  name: "catalog/models", keys: ["region"],'''),
  ('''  deps.settings.watch(retention, {                           // a change made during the await is still delivered
    resources, name: "audit/retention",''', '''  deps.settings.watch(resources, {                           // a change made during the await is still delivered
    name: "audit/retention", keys: ["retentionDays"], changesAfter: retention,'''),
  ('''deps.settings.watch(settings, { resources, name: "pricing/settings", onChange: ({ values }) => { pricing.set(toPricing(values)); } });''',
   '''deps.settings.watch(resources, {
  name: "pricing/settings", keys: ["currency", "region"], changesAfter: settings,
  onChange: ({ values }) => { pricing.set(toPricing(values)); },
});'''),
  ('''deps.settings.watch(deps.settings.read(["quietHours"]), {
  resources, name: "notifications/quiet-hours",''', '''deps.settings.watch(resources, {
  name: "notifications/quiet-hours", keys: ["quietHours"], changesAfter: deps.settings.read(["quietHours"]),'''),
]
for old, new in pairs:
    if s.count(old) != 1:
        sys.exit(f"derive-readme-a: expected exactly one match for:\n{old[:120]}")
    s = s.replace(old, new)
(root / "a-keys" / "README.md").write_text(s)
