#!/usr/bin/env python3
"""Resolve only the two reviewed PR9/PR10 conflicts. Never overwrite unrelated paths."""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
allowed = {"web/index.html", "web/tm-endturn-systems.js"}
unresolved = set(subprocess.check_output(
    ["git", "diff", "--name-only", "--diff-filter=U"], cwd=ROOT, text=True
).splitlines())
unexpected = unresolved - allowed
if unexpected:
    raise SystemExit("Unreviewed merge conflicts: " + ", ".join(sorted(unexpected)))
for rel in sorted(unresolved):
    subprocess.run(["git", "checkout", "--ours", "--", rel], cwd=ROOT, check=True)

html = ROOT / "web/index.html"
s = html.read_text(encoding="utf-8")
anchor = '<script src="tm-faction-membership.js?v=20260928-release1353"></script>'
new_scripts = [
    '<script src="tm-political-world.js?v=20261027-politics-world"></script>',
    '<script src="tm-campaign-world.js?v=20261027-politics-world"></script>',
    '<script src="tm-civil-world.js?v=20261027-politics-world"></script>',
    '<script src="tm-political-war-world.js?v=20261027-politics-world"></script>',
]
if anchor not in s:
    raise SystemExit("Cannot locate canonical faction membership script")
if not any(new_scripts[0] in s for _ in [0]):
    s = s.replace(anchor, anchor + "\n" + "\n".join(new_scripts), 1)
for tag in new_scripts:
    if s.count(tag) != 1:
        raise SystemExit("Missing or duplicated politics module: " + tag)
html.write_text(s, encoding="utf-8")

endturn = ROOT / "web/tm-endturn-systems.js"
s = endturn.read_text(encoding="utf-8")
anchor = "  if (window.TM && TM.LivingWorld && typeof TM.LivingWorld.tick === 'function') TM.LivingWorld.tick(GM);"
new_hook = "  if (window.TM && TM.PoliticalWarWorld && typeof TM.PoliticalWarWorld.tick === 'function') TM.PoliticalWarWorld.tick(GM);"
if anchor not in s:
    raise SystemExit("Canonical living-world tick missing; cannot connect politics")
if new_hook not in s:
    s = s.replace(anchor, anchor + "\n" + new_hook, 1)
if s.count(new_hook) != 1:
    raise SystemExit("Duplicated politics scheduler hook")
if s.index("_tmSyncGMCalendar(GM, GM.turn)") > s.index(new_hook):
    raise SystemExit("Politics module must run only after canonical date sync")
endturn.write_text(s, encoding="utf-8")
subprocess.run(["git", "add", "web/index.html", "web/tm-endturn-systems.js"], cwd=ROOT, check=True)
rem = subprocess.check_output(["git", "diff", "--name-only", "--diff-filter=U"], cwd=ROOT, text=True).strip()
if rem:
    raise SystemExit("Unresolved merge conflicts remain: " + rem)
print("Reviewed PR9/PR10 overlap resolved without discarding either module tree")
