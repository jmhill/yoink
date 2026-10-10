# Generates the three self-contained mockups. Run: python3 src/build.py
import pathlib
OUT = pathlib.Path(__file__).resolve().parent.parent

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#fff;--fg:#0a0a0a;--card:#fff;--primary:#171717;--primary-fg:#fafafa;--muted:#f5f5f5;--muted-fg:#737373;--border:#e5e5e5;--sidebar:#fafafa;--accent:#f0f0f0;--today:#ea580c;--future:#16a34a;--warn:#b45309;--warn-bg:#fffbeb;--warn-border:#f2c46d}
html,body{width:WIDTHpx;height:HEIGHTpx;overflow:hidden;background:var(--bg);color:var(--fg);font-family:"Noto Sans",Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
svg{flex:none}
.hdrbar{display:flex;align-items:center;justify-content:space-between;height:56px}
.who{display:flex;align-items:center;gap:12px;font-size:14px;font-weight:500}
.pig{width:32px;height:32px;border-radius:50%;background:#f9c6cf;border:2px solid #e89aa8;position:relative}
.pig:after{content:"";position:absolute;left:8px;top:11px;width:12px;height:8px;border-radius:50%;background:#e89aa8}
.back{display:inline-flex;align-items:center;gap:4px;font-size:14px;color:var(--muted-fg);margin:6px 0 14px;text-decoration:none}
.ph{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ph h1{font-size:24px;line-height:30px;font-weight:600;letter-spacing:-.4px}
.btn{display:inline-flex;align-items:center;gap:6px;border-radius:8px;font-size:14px;font-weight:500;height:36px;padding:0 14px;white-space:nowrap}
.btn.outline{border:1px solid var(--border);background:var(--bg);box-shadow:0 1px 2px rgba(0,0,0,.04)}
.btn.primary{background:var(--primary);color:var(--primary-fg)}
.btn.ghost{color:var(--fg);padding:0 10px;height:32px}
.chiprow{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;color:var(--muted-fg)}
.chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:600;border:1px solid var(--border);background:var(--muted);color:var(--fg)}
.chip i{width:7px;height:7px;border-radius:50%;background:#16a34a}
.chip.waiting{background:var(--warn-bg);border-color:var(--warn-border);color:var(--warn)}
.chip.waiting i{background:#d97706}
.obj{margin-top:12px;font-size:15px;line-height:22px;color:var(--fg)}
.obj .k{display:block;font-size:12px;font-weight:600;color:var(--muted-fg);margin-bottom:2px}
.addobj{margin-top:12px;font-size:14px;color:var(--muted-fg);display:inline-flex;align-items:center;gap:6px;text-decoration:underline;text-underline-offset:3px;text-decoration-color:#d4d4d4}
.wait{margin-top:12px;display:flex;align-items:center;gap:8px;font-size:14px;color:var(--warn);background:var(--warn-bg);border:1px solid #fde7b0;border-radius:10px;padding:9px 12px}
.wait b{font-weight:600}
.sec{display:flex;align-items:baseline;justify-content:space-between;margin:26px 0 10px}
.sec h2{font-size:18px;font-weight:700}
.sec .n{font-size:13px;color:var(--muted-fg)}
.label{font-size:11.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:700;color:var(--muted-fg);display:flex;align-items:center;justify-content:space-between}
.na{margin-top:22px;border:1.5px solid var(--primary);border-radius:14px;background:var(--card);padding:14px 16px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.na .label{color:var(--fg)}
.na .row{border:none;padding:10px 0 0;min-height:0}
.na .t{font-size:17px;font-weight:600}
.change{font-size:13px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--muted-fg);text-decoration:underline;text-underline-offset:3px}
.na.empty{border:1.5px dashed var(--warn-border);background:var(--warn-bg);box-shadow:none}
.na.empty .label{color:var(--warn)}
.na.empty p{font-size:14px;line-height:20px;color:#78350f;margin:8px 0 12px}
.rows{display:flex;flex-direction:column;gap:8px}
.row{display:flex;align-items:center;gap:14px;border:1px solid var(--border);border-radius:14px;background:var(--card);padding:16px 18px;min-height:76px}
.circ{width:24px;height:24px;border-radius:50%;border:2px solid #6b6b6b;flex:none}
.t{font-size:16px;line-height:22px}
.meta{display:flex;align-items:center;gap:10px;margin-top:3px;font-size:12.5px;color:var(--muted-fg)}
.meta span{display:inline-flex;align-items:center;gap:4px}
.today{color:var(--today)}
.future{color:var(--future)}
.hist{margin-top:26px;border:1px solid var(--border);border-radius:14px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;color:var(--muted-fg);background:var(--muted)}
.hist .l{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:var(--fg)}
.ph-badge{font-size:11px;font-weight:600;border:1px dashed #a3a3a3;border-radius:6px;padding:1px 6px;color:var(--muted-fg);text-transform:lowercase}
/* phone */
.phone{position:relative;height:HEIGHTpx;padding:0 16px}
.bnav{position:absolute;left:0;right:0;bottom:0;height:68px;border-top:1px solid var(--border);background:var(--bg);display:flex;justify-content:space-around;align-items:center}
.bnav div{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;color:var(--muted-fg);width:120px}
.bnav .on{color:var(--fg);font-weight:600}
/* desktop */
.desk{display:flex;height:HEIGHTpx}
.rail{width:192px;flex:none;background:var(--bg);border-right:1px solid var(--border);padding:14px 12px;overflow:hidden}
.rail .logo{font-size:17px;font-weight:700;padding:2px 4px 16px}
.inbox{background:var(--muted);border-radius:10px;padding:9px 10px;font-size:13.5px;margin-bottom:12px}
.inbox .top{display:flex;align-items:center;gap:10px}
.inbox .b{margin-left:auto;background:#fff;border-radius:999px;font-size:11px;font-weight:600;padding:0 7px}
.inbox .s{font-size:11.5px;color:#525252;margin-top:4px}
.rh{font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--muted-fg);font-weight:600;padding:14px 10px 6px;border-top:1px solid var(--border)}
.ri{display:flex;align-items:center;gap:10px;font-size:13.5px;padding:7px 10px;border-radius:8px;color:#404040;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ri.on{background:#e8e8e8;color:var(--fg);font-weight:500}
.ri.new{border:1px dashed var(--border);margin:6px 0 10px;color:#525252}
.main{flex:1;overflow:hidden}
.col{max-width:672px;margin:0 auto;padding:0 16px}
.desk .ph h1{font-size:28px;line-height:34px}
"""

def ic(name, size=16, color="currentColor", sw=2):
    paths = {
      "back": '<path d="M15 18l-6-6 6-6"/>',
      "edit": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      "gear": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
      "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      "chev": '<path d="M6 9l6 6 6-6"/>',
      "right": '<path d="M9 6l6 6-6 6"/>',
      "cal": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
      "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      "bot": '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01"/>',
      "alert": '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
      "plus": '<path d="M12 5v14M5 12h14"/>',
      "inbox": '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
      "tasks": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l3 3 5-6"/>',
      "today": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
      "up": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h8"/><circle cx="16" cy="16" r="3"/>',
      "check2": '<path d="M2 12l5 5L17 7M12 17l10-10"/>',
      "list": '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
      "proj": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9v6M12 9v3M16 9v5"/>',
      "hist": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    }
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{paths[name]}</svg>'

def topbar(gear=26):
    return f'''<div class="hdrbar"><div class="who"><div class="pig"></div>{ic("user",15)}<span>you@example.com</span>{ic("chev",14)}</div>{ic("gear",gear,sw=1.8)}</div>'''

def row(title, meta=""):
    return f'<div class="row" data-part="TaskCard"><div class="circ"></div><div><div class="t">{title}</div>{f"<div class=meta>{meta}</div>" if meta else ""}</div></div>'

def due(text, cls="future"):
    return f'<span class="{cls}">{ic("cal",12)}{text}</span>'

def owner(name):
    return f'<span>{ic("bot",12)}{name}</span>'

def back():
    return f'<a class="back" data-part="back-link">{ic("back",16)}All projects</a>'

def header(name, status, chipcls="", extra=""):
    return f'''<div class="ph" data-part="PlaceHeading"><div style="min-width:0"><h1>{name}</h1>
<div class="chiprow"><span class="chip {chipcls}" data-part="status-chip"><i></i>{status}</span>{extra}</div></div>
<span class="btn outline" data-part="edit-button">{ic("edit",15)}Edit</span></div>'''

def next_action(title, meta=""):
    return f'''<div class="na" data-part="next-action-card"><div class="label"><span>Next action</span><span class="change">Change</span></div>
<div class="row"><div class="circ"></div><div><div class="t">{title}</div>{f"<div class=meta>{meta}</div>" if meta else ""}</div></div></div>'''

def next_action_empty():
    return f'''<div class="na empty" data-part="next-action-empty"><div class="label"><span style="display:flex;gap:6px;align-items:center">{ic("alert",14)}No next action</span></div>
<p>This project won’t show up in Work until it has one. Pick an open task or add a new one.</p>
<span class="btn primary">{ic("plus",15)}Set next action</span></div>'''

def history():
    return f'''<div class="hist" data-part="history-placeholder"><span class="l">{ic("hist",16)}History <span class="ph-badge">placeholder · #138</span></span>{ic("right",16)}</div>'''

def tasks_section(n, rows):
    return f'<div class="sec"><h2>Open tasks</h2><span class="n">{n} open task{"s" if n!=1 else ""} · newest first</span></div><div class="rows">{"".join(rows)}</div>'

ACTIVE = dict(
  name="Kitchen renovation",
  body=lambda: (
    '<div class="obj" data-part="objective">New counters installed and kitchen usable</div>'
    + next_action("Pick the countertop material", due("Fri Oct 16"))
    + tasks_section(3, [
        row("Get three contractor quotes", owner("Lane")),
        row("Measure the cabinet dimensions", due("Fri Oct 23")),
        row("Order the sink and faucet", due("Today","today")),
    ])
    + history()
  ),
  status="Active", chip="")

WAITING = dict(
  name="Kitchen renovation",
  body=lambda: (
    f'<a class="addobj" data-part="objective-empty">{ic("plus",14)}Add an objective</a>'
    + f'<div class="wait" data-part="waiting-line">{ic("clock",16)}<span>Waiting on <b>Contractor</b> since Sep 30 (10 days)</span></div>'
    + next_action_empty()
    + tasks_section(2, [
        row("Follow up with the contractor", owner("Lane")),
        row("Find the appliance warranty info"),
    ])
    + history()
  ),
  status="Waiting", chip="waiting")

def phone(p, w=390, h=844):
    css = CSS.replace("WIDTH", str(w)).replace("HEIGHT", str(h))
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>{p["name"]} (phone)</title><style>{css}</style></head><body>
<div class="phone">{topbar()}{back()}{header(p["name"], p["status"], p["chip"])}{p["body"]()}</div>
<div class="bnav"><div>{ic("inbox",22,sw=1.8)}Inbox</div><div class="on">{ic("tasks",22,sw=1.8)}Tasks</div></div>
</body></html>'''

def desktop(p, w=1280, h=800):
    css = CSS.replace("WIDTH", str(w)).replace("HEIGHT", str(h))
    rail = f'''<div class="rail" data-part="AppRailPanel"><div class="logo">Yoink</div>
<div class="inbox"><div class="top">{ic("inbox",16,sw=1.8)}Inbox<span class="b">1</span></div><div class="s">Capture &amp; triage mode</div></div>
<div class="rh">Task family</div>
<div class="ri">{ic("today",16,sw=1.8)}Today</div><div class="ri">{ic("up",16,sw=1.8)}Upcoming</div><div class="ri">{ic("user",16,sw=1.8)}Mine</div><div class="ri">{ic("check2",16,sw=1.8)}Done</div>
<div class="rh" style="margin-top:8px">Lists</div>
<div class="ri">{ic("list",16,sw=1.8)}Unlisted</div><div class="ri new">{ic("plus",14)}New list</div>
<div class="rh">Projects</div>
<div class="ri on">{ic("proj",16,sw=1.8)}Kitchen renovation</div><div class="ri">{ic("proj",16,sw=1.8)}Garden</div><div class="ri">{ic("proj",16,sw=1.8)}Boat registration</div>
<div class="ri new">{ic("plus",14)}New project</div></div>'''
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>{p["name"]} (desktop)</title><style>{css}</style></head><body>
<div class="desk">{rail}<div class="main"><div class="col">{topbar(28)}{back()}{header(p["name"], p["status"], p["chip"])}{p["body"]()}</div></div></div>
</body></html>'''

(OUT/"project-phone.html").write_text(phone(ACTIVE))
(OUT/"project-desktop.html").write_text(desktop(ACTIVE))
(OUT/"project-phone-waiting.html").write_text(phone(WAITING))
print("ok")
