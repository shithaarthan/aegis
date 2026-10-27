"""AEGIS sensor SDK for Python (P4-T03) — exception hook, invariants, action log.
Same event contract as sdk-node so daemon ingest is unchanged.
Zero dependencies.
"""
import sys
import traceback
import datetime
import re
from collections import deque

_SCRUB = [re.compile(r"sk-[A-Za-z0-9-_]{8,}"), re.compile(r"bearer\s+[A-Za-z0-9-_.~+/=]{8,}", re.I)]


def _scrub(text):
    for rx in _SCRUB:
        text = rx.sub("[redacted]", text)
    return text[:8000]


class ActionLog:
    def __init__(self, maxlen=200):
        self._buf = deque(maxlen=maxlen)

    def record(self, entry):
        self._buf.append(datetime.datetime.now(datetime.timezone.utc).isoformat() + " " + _scrub(str(entry)))

    def snapshot(self):
        return list(self._buf)


_listeners = []
_action_log = ActionLog()
_excepthook_installed = False


def init_sensors(app=None, on_event=None):
    """Install the exception hook. Events go to on_event or are returned via emit()."""
    import os
    name = app or os.environ.get("AEGIS_APP", "app")
    if on_event is not None:
        _listeners.append(on_event)

    def emit(kind, stack_trace=None, message=None, invariant=None, route=None):
        event = {
            "kind": kind,
            "app": name,
            "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "stackTrace": _scrub(stack_trace) if stack_trace else None,
            "message": _scrub(message) if message else None,
            "invariant": invariant,
            "route": route,
            "actionLog": _action_log.snapshot(),
        }
        for cb in _listeners:
            cb(event)
        return event

    global _excepthook_installed
    if not _excepthook_installed:
        _excepthook_installed = True
        _hook = sys.excepthook

        def _aegis_hook(t, v, tb):
            try:
                emit("exception", stack_trace="".join(traceback.format_exception(t, v, tb)))
            finally:
                _hook(t, v, tb)

        sys.excepthook = _aegis_hook
    return {"emit": emit, "action_log": _action_log}


def invariant(emit, cond, name, detail=""):
    if not cond:
        emit("invariant", invariant=f"{name}: {detail}"[:500])
    return cond
