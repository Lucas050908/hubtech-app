#!/usr/bin/env python3
"""Reset a user's password from the machine HUBTECH runs on (there is no e-mail service).

    python3 tools/reset_password.py <username>
    python3 tools/reset_password.py --list

Needs file access to the database, so only someone with access to this computer can use it.
All existing sessions for the user are logged out.
"""
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server import auth, config, db  # noqa: E402


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    db.migrate()
    if sys.argv[1] == "--list":
        for r in db.all_rows("SELECT username, display_name, role FROM users ORDER BY id"):
            print(f"  {r['username']:<24} {r['display_name']:<28} {r['role']}")
        return 0
    row = db.one("SELECT * FROM users WHERE username = ?", (sys.argv[1],))
    if not row:
        print(f"Ingen bruger ved navn '{sys.argv[1]}' i {config.DB_PATH}")
        return 1
    pw = getpass.getpass(f"Ny adgangskode for {row['username']}: ")
    err = auth.validate_password(pw)
    if err:
        print(err)
        return 1
    if getpass.getpass("Gentag: ") != pw:
        print("Adgangskoderne er ikke ens.")
        return 1
    db.q("UPDATE users SET password_hash = ? WHERE id = ?", (auth.hash_password(pw), row["id"]))
    auth.destroy_user_sessions(row["id"])
    print("Adgangskoden er ændret, og alle sessioner er logget ud.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
