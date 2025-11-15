# dokterdibya monorepo

This repository now groups the public-facing site and the staff portal under a single root directory:

- `dokterdibya/public` – landing site and marketing assets (ex-praktekdrdibya).
- `dokterdibya/staff` – clinical portal backend, admin static pages, and operational docs (former dibyaklinik).

Refer to the `staff/README.md` for legacy backend instructions and `public/package.json` for the landing site build scripts.

## Archive directories

Diagnostic or deprecated assets now live in dedicated `unused/` folders so the active build stays clean:

- `public/unused/` – patient-facing HTML experiments (e.g., test intake forms).
- `staff/public/unused/` – AdminLTE debug pages and prototypes.
- `staff/unused/` – staff shell scripts and documentation that only applied to past auth fixes.
- `staff/backend/unused/` – Jest suites, sample data, and one-off backend scripts; re-enable them only if you plan to run the legacy tests locally.

Keep new scratch files inside the appropriate `unused/` directory and mention them in `staff/README.md` if they affect contributors.
