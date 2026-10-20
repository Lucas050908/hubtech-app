"""In-memory event bus for live updates (chat, typing, music, shared calendars).

Clients long-poll GET /api/live?since=N; the request waits up to ~25 s for an event addressed to the user.
Everything here is best effort: after a server restart clients simply reload what they show.
"""
import threading
import time
from collections import deque

_cond = threading.Condition()
_events = deque(maxlen=4000)   # (seq, frozenset(user ids), payload)
_seq = 0
_seen = {}                     # user id -> last time the user was polling (presence)
BOOT = int(time.time() * 1000)


def publish(users, payload):
    """Send payload to the given user ids."""
    global _seq
    ids = frozenset(int(u) for u in users if u)
    if not ids:
        return
    with _cond:
        _seq += 1
        _events.append((_seq, ids, payload))
        _cond.notify_all()


def current():
    return _seq


def wait(uid, since, timeout=25.0):
    """Events for uid after since. Returns (seq, events, reset). reset=True when since is older than what is kept."""
    end = time.time() + timeout
    _seen[uid] = time.time()
    with _cond:
        while True:
            reset = bool(_events) and since < _events[0][0] - 1 and since != 0
            out = [p for s, ids, p in _events if s > since and uid in ids]
            if out or reset or since > _seq:
                _seen[uid] = time.time()
                return _seq, out, reset or since > _seq
            left = end - time.time()
            if left <= 0:
                _seen[uid] = time.time()
                return _seq, [], False
            _cond.wait(left)


def online(uid, within=45):
    return time.time() - _seen.get(uid, 0) < within
