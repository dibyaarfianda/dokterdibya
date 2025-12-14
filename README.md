# dokterdibya monorepo

This repository now groups the public-facing site and the staff portal under a single root directory:

- `dokterdibya/public` – landing site and marketing assets (ex-praktekdrdibya).
- `dokterdibya/staff` – clinical portal backend, admin static pages, and operational docs (former dibyaklinik).

## 🚀 Getting Started

**New to the project?** Check out **[CONNECTION_GUIDE.md](./CONNECTION_GUIDE.md)** for complete setup instructions including:
- System requirements and prerequisites
- Database setup and configuration
- Backend server installation
- Environment variable configuration
- How to access staff portal and patient portal
- Common troubleshooting solutions

For detailed instructions, refer to:
- `CONNECTION_GUIDE.md` – Complete setup and connection guide
- `staff/README.md` – Staff portal architecture and development notes
- `DEPLOYMENT_GUIDE.md` – Production deployment procedures
- `public/package.json` – Landing site build scripts

## Archive directories

Diagnostic or deprecated assets now live in dedicated `unused/` folders so the active build stays clean:

- `public/unused/` – patient-facing HTML experiments (e.g., test intake forms).
- `staff/public/unused/` – AdminLTE debug pages and prototypes.
- `staff/unused/` – staff shell scripts and documentation that only applied to past auth fixes.
- `staff/backend/unused/` – Jest suites, sample data, and one-off backend scripts; re-enable them only if you plan to run the legacy tests locally.

Keep new scratch files inside the appropriate `unused/` directory and mention them in `staff/README.md` if they affect contributors.
