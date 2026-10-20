"""ECDSA on the NIST P-256 curve (ES256) in plain Python – only what web push (VAPID) needs: make a key pair and sign.
No third-party packages: the server keeps using the standard library only. Signing takes a few milliseconds.
"""
import hashlib
import hmac
import secrets

P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
A = P - 3
B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
G = (0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296,
     0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5)


# Jacobian coordinates (X, Y, Z) – avoids a modular inverse per step
def _dbl(p):
    X, Y, Z = p
    if not Y:
        return (0, 1, 0)
    YY = Y * Y % P
    S = 4 * X * YY % P
    ZZ = Z * Z % P
    M = 3 * (X - ZZ) * (X + ZZ) % P          # a = -3
    X3 = (M * M - 2 * S) % P
    return (X3, (M * (S - X3) - 8 * YY * YY) % P, 2 * Y * Z % P)


def _add(p, q):
    if not p[2]:
        return q
    if not q[2]:
        return p
    X1, Y1, Z1 = p
    X2, Y2, Z2 = q
    Z1Z1, Z2Z2 = Z1 * Z1 % P, Z2 * Z2 % P
    U1, U2 = X1 * Z2Z2 % P, X2 * Z1Z1 % P
    S1, S2 = Y1 * Z2 * Z2Z2 % P, Y2 * Z1 * Z1Z1 % P
    if U1 == U2:
        return _dbl(p) if S1 == S2 else (0, 1, 0)
    H, R = (U2 - U1) % P, (S2 - S1) % P
    HH = H * H % P
    HHH = H * HH % P
    V = U1 * HH % P
    X3 = (R * R - HHH - 2 * V) % P
    return (X3, (R * (V - X3) - S1 * HHH) % P, H * Z1 * Z2 % P)


def _mul(k, pt=G):
    r, q = (0, 1, 0), (pt[0], pt[1], 1)
    for bit in bin(k)[2:]:
        r = _dbl(r)
        if bit == "1":
            r = _add(r, q)
    X, Y, Z = r
    if not Z:
        return None
    zi = pow(Z, -1, P)
    return (X * zi * zi % P, Y * zi * zi * zi % P)


def on_curve(pt):
    x, y = pt
    return (y * y - (x * x * x + A * x + B)) % P == 0


def new_key():
    """(private int, public uncompressed 65 bytes)."""
    d = secrets.randbelow(N - 1) + 1
    return d, public_bytes(d)


def public_bytes(d):
    x, y = _mul(d)
    return b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big")


def _k(d, h):
    """Deterministic nonce (RFC 6979) – no risk from a weak random source."""
    x, h1 = d.to_bytes(32, "big"), (int.from_bytes(h, "big") % N).to_bytes(32, "big")
    V, K = b"\x01" * 32, b"\x00" * 32
    K = hmac.new(K, V + b"\x00" + x + h1, hashlib.sha256).digest()
    V = hmac.new(K, V, hashlib.sha256).digest()
    K = hmac.new(K, V + b"\x01" + x + h1, hashlib.sha256).digest()
    V = hmac.new(K, V, hashlib.sha256).digest()
    while True:
        V = hmac.new(K, V, hashlib.sha256).digest()
        k = int.from_bytes(V, "big")
        if 1 <= k < N:
            return k
        K = hmac.new(K, V + b"\x00", hashlib.sha256).digest()
        V = hmac.new(K, V, hashlib.sha256).digest()


def sign(d, msg: bytes) -> bytes:
    """ES256 signature: r || s, 64 bytes."""
    h = hashlib.sha256(msg).digest()
    e = int.from_bytes(h, "big")
    while True:
        k = _k(d, h)
        r = _mul(k)[0] % N
        s = pow(k, -1, N) * (e + r * d) % N
        if r and s:
            return r.to_bytes(32, "big") + s.to_bytes(32, "big")
        h = hashlib.sha256(h).digest()


def verify(pub: bytes, msg: bytes, sig: bytes) -> bool:
    if len(pub) != 65 or pub[0] != 4 or len(sig) != 64:
        return False
    Q = (int.from_bytes(pub[1:33], "big"), int.from_bytes(pub[33:], "big"))
    if not on_curve(Q):
        return False
    r, s = int.from_bytes(sig[:32], "big"), int.from_bytes(sig[32:], "big")
    if not (0 < r < N and 0 < s < N):
        return False
    e = int.from_bytes(hashlib.sha256(msg).digest(), "big")
    w = pow(s, -1, N)
    p1, p2 = _mul(e * w % N), _mul(r * w % N, Q)
    if p1 is None or p2 is None:
        return False
    pt = _add((p1[0], p1[1], 1), (p2[0], p2[1], 1))
    if not pt[2]:
        return False
    zi = pow(pt[2], -1, P)
    return pt[0] * zi * zi % P % N == r
