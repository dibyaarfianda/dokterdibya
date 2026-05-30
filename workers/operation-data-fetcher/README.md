# Operation Data Fetcher

Cloudflare Worker Cron untuk mengambil data operasi dr. Dibya dari SIMRS dan menyimpan detail ke R2.

Cron `0 19 * * *` berjalan pada 19:00 UTC, setara 02:00 WIB.

## Required secrets / vars

- `BACKEND_API_URL`: contoh `https://dokterdibya.com`
- `BACKEND_API_KEY`: sama dengan API key integrasi backend
- `{FACILITY}_OPERATION_LIST_URL`: URL list operasi. Facility: `MELINDA`, `GAMBIRAN`, `BHAYANGKARA`
- `{FACILITY}_OPERATION_DETAIL_URL`: optional URL detail, mendukung placeholder `{id}`, `{source_key}`, `{case_id}`, `{operation_id}`
- `{FACILITY}_AUTH_HEADER`: optional, default `Authorization`
- `{FACILITY}_AUTH_TOKEN`: optional token/header value

List endpoint diharapkan mengembalikan array di salah satu property: `items`, `results`, `operations`, `data`, atau array langsung.
